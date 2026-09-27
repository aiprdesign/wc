// Musical instruments: orchestral (strings, brass, harp, bells, timpani/taiko),
// hybrid-electronic (sub pulse, kick, hats, synth arp, blips) and transitional
// effects (risers, reverse swells, whooshes, booms).
//
// Every function takes the Studio `S` first and schedules with absolute times.

import { hz, perc, riseTo, ahr, clamp } from './core.js';

// ============================================================ modal voices
// Plucked / struck sounds are rendered in JS as sums of exponentially decaying
// partials (a recursive complex oscillator per partial — cheap and exactly in
// tune), cached per pitch, and played back with a single buffer source.

function modalBuffer(S, key, f0, modes, { seconds, noise = 0, attack = 0.002 }) {
  if (S.cache.has(key)) return S.cache.get(key);
  const sr = S.sr;
  const n = Math.ceil(seconds * sr);
  const buf = S.ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  for (const [ratio, amp, t60] of modes) {
    const f = f0 * ratio;
    if (f > sr * 0.45 || amp <= 0) continue;
    const w = (2 * Math.PI * f) / sr;
    const c = Math.exp(-6.9 / (t60 * sr));
    const cr = c * Math.cos(w), ci = c * Math.sin(w);
    const ph = S.rand(0, 2 * Math.PI);
    let re = Math.cos(ph) * amp, im = Math.sin(ph) * amp;
    const len = Math.min(n, Math.ceil(t60 * 1.25 * sr));
    for (let i = 0; i < len; i++) {
      d[i] += im;
      const r = re * cr - im * ci;
      im = re * ci + im * cr;
      re = r;
    }
  }
  if (noise > 0) { // struck/plucked transient
    const m = Math.floor(0.008 * sr);
    let y = 0;
    for (let i = 0; i < m; i++) {
      y += 0.35 * (S.random() * 2 - 1 - y);
      d[i] += noise * y * (1 - i / m) ** 2;
    }
  }
  const a = Math.max(1, Math.floor(attack * sr));
  const fade = Math.floor(0.05 * sr);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    if (i < a) d[i] *= i / a;
    if (i > n - fade) d[i] *= (n - i) / fade;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak;
  S.cache.set(key, buf);
  return buf;
}

function playBuffer(S, t, buf, { level, pan = 0, bus, rate = 1 }) {
  const src = S.buffer(buf, t, rate);
  const g = S.gain(level);
  src.connect(g);
  const p = S.out(g, bus, pan);
  S.free(src, src, g, p);
  return src;
}

/** Harp / felt-piano pluck (inharmonic string partials, low notes ring longer). */
export function pluck(S, t, midi, { level = 0.25, pan = 0, bus = 'lead', bright = 1 } = {}) {
  const f0 = hz(midi);
  const T = clamp(2.6 * Math.sqrt(220 / f0), 0.9, 4.5);
  const modes = [];
  for (let k = 1; k <= 18; k++) {
    const ratio = k * Math.sqrt(1 + 0.00022 * k * k);
    const amp = (Math.abs(Math.sin(Math.PI * k * 0.21)) / k ** (1.35 - 0.25 * bright));
    modes.push([ratio, amp, T / (1 + 0.55 * (k - 1) ** 1.3)]);
  }
  const buf = modalBuffer(S, `pluck:${midi}:${bright}`, f0, modes, { seconds: T * 0.85, noise: 0.15 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Glassy crystalline bell (slightly detuned pairs → shimmer). */
export function bell(S, t, midi, { level = 0.06, pan = 0, bus = 'lead', decay = 2.5 } = {}) {
  const modes = [
    [1, 1, decay], [1.0021, 0.7, decay * 0.9], [2.0, 0.22, decay * 0.6],
    [2.76, 0.28, decay * 0.45], [5.4, 0.1, decay * 0.25], [8.93, 0.05, decay * 0.15],
  ];
  const buf = modalBuffer(S, `bell:${midi}:${decay}`, hz(midi), modes, { seconds: decay * 0.85, attack: 0.004 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Struck metal (anvil / piston / gear teeth). */
export function metal(S, t, f0, { level = 0.3, pan = 0, bus = 'perc', decay = 0.9 } = {}) {
  const modes = [
    [1, 1, decay], [1.47, 0.45, decay * 0.6], [2.76, 0.7, decay * 0.55], [4.1, 0.35, decay * 0.4],
    [5.4, 0.5, decay * 0.35], [8.93, 0.3, decay * 0.2], [13.34, 0.18, decay * 0.12],
  ];
  const buf = modalBuffer(S, `metal:${f0}:${decay}`, f0, modes, { seconds: decay * 0.9, noise: 1.2, attack: 0.0005 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Resonant stone tap (marble). */
export function stoneTap(S, t, { level = 0.25, pan = 0, bus = 'sfx', f0 = 640 } = {}) {
  const modes = [[1, 1, 0.3], [1.58, 0.7, 0.2], [2.31, 0.55, 0.14], [3.2, 0.4, 0.09], [4.6, 0.25, 0.05]];
  const buf = modalBuffer(S, `stone:${f0}`, f0, modes, { seconds: 0.4, noise: 1.5, attack: 0.0005 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Harp roll: chord tones strummed upward. */
export function harpRoll(S, t, notes, { level = 0.2, spread = 0.035, bus = 'lead' } = {}) {
  notes.forEach((m, i) => pluck(S, t + i * spread, m, { level, bus, pan: -0.5 + i / Math.max(1, notes.length - 1) }));
}

// ======================================================== sustained voices

/** Warm string-ensemble pad: two detuned saws per note spread L/R, one lowpass per side. */
export function strings(S, t0, t1, notes, o = {}) {
  const { level = 0.1, attack = 1.5, release = 1.5, cutoff = 1500, bus = 'pad', width = 0.75, detune = 9 } = o;
  const end = t1 + release;
  const att = Math.min(attack, Math.max(0.02, t1 - t0));
  const amp = S.gain(0);
  ahr(amp.gain, t0, t1, level / Math.sqrt(notes.length * 2), att, release);
  S.out(amp, bus);
  const nodes = [amp];
  let last;
  // Two sections (left / right), each a set of saws a few cents apart → one lowpass → pan.
  for (const side of [-1, 1]) {
    const lp = S.filter('lowpass', cutoff, 0.6);
    const f = lp.frequency;
    f.setValueAtTime(cutoff * 0.45, t0);
    f.linearRampToValueAtTime(cutoff, t0 + att);
    f.setValueAtTime(cutoff, t1);
    f.linearRampToValueAtTime(cutoff * 0.4, end);
    const p = S.panner(side * width);
    lp.connect(p).connect(amp);
    nodes.push(lp, p);
    for (const m of notes) {
      const v = S.osc('sawtooth', hz(m), t0, end);
      // static ensemble detune (an LFO on detune would force the slow per-sample path)
      v.detune.value = side * detune + S.rand(-4, 4);
      v.connect(lp);
      nodes.push(v);
      last = v;
    }
  }
  S.free(last, ...nodes);
}

/** Low brass swell: saws through a lowpass that opens with the dynamics. `sfz` = accented attack. */
export function brass(S, t0, dur, notes, o = {}) {
  const { level = 0.12, attack = 0.7, release = 1.2, bright = 1600, bus = 'brass', sfz = false } = o;
  const t1 = t0 + dur;
  const end = t1 + release * 1.1;
  const tPeak = t0 + (sfz ? 0.03 : attack);
  const lp = S.filter('lowpass', 150, 1.1);
  const f = lp.frequency;
  f.setValueAtTime(sfz ? 400 : 140, t0);
  f.exponentialRampToValueAtTime(bright, tPeak);
  f.setTargetAtTime(bright * (sfz ? 0.35 : 0.6), tPeak, sfz ? 0.25 : dur * 0.5);
  f.setTargetAtTime(160, t1, release / 4);
  const amp = S.gain(0);
  const g = amp.gain;
  const lv = level / Math.sqrt(notes.length);
  g.setValueAtTime(0, t0);
  if (sfz) {
    g.linearRampToValueAtTime(lv, tPeak);
    g.setTargetAtTime(lv * 0.4, tPeak, 0.3);
  } else {
    g.setTargetAtTime(lv, t0, attack / 2.5);
  }
  g.setTargetAtTime(0, t1, release / 5);
  lp.connect(amp);
  S.out(amp, bus);
  // A section of two players per note, a few cents apart (width comes from the hall).
  const nodes = [lp, amp];
  for (const m of notes) {
    for (const cents of [-6, 6]) {
      const v = S.osc('sawtooth', hz(m), t0, end);
      v.detune.value = cents + S.rand(-2, 2);
      v.connect(lp);
      nodes.push(v);
    }
  }
  S.free(...nodes);
}

/** Sustained sine drone with slow beating (distant resonance). */
export function drone(S, t0, t1, midi, { level = 0.1, attack = 2, release = 2, bus = 'pad', beat = 0.25, pan = 0 } = {}) {
  const amp = S.gain(0);
  ahr(amp.gain, t0, t1, level / 2, attack, release);
  const end = t1 + release * 1.1;
  const a = S.osc('sine', hz(midi), t0, end);
  const b = S.osc('sine', hz(midi) + beat, t0, end);
  a.connect(amp);
  b.connect(amp);
  const p = S.out(amp, bus, pan);
  S.free(a, a, b, amp, p);
}

// ============================================================== percussion

export function kick(S, t, level = 0.8, { bus = 'drums', f0 = 150, f1 = 44, decay = 0.55 } = {}) {
  const o = S.osc('sine', f0, t, t + decay + 0.1);
  o.frequency.exponentialRampToValueAtTime(f1 * 1.5, t + 0.04);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.25);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.002);
  o.connect(g);
  S.out(g, bus);
  // beater click
  const n = S.noise('white', t, t + 0.03);
  const hp = S.filter('highpass', 2500);
  const cg = S.gain(0);
  perc(cg.gain, t, level * 0.5, 0.02, 0.0005);
  n.connect(hp).connect(cg);
  S.out(cg, bus);
  S.free(o, g);
  S.free(n, hp, cg);
}

/** Taiko / timpani / low tom: pitched membrane + skin noise. */
export function drum(S, t, level = 0.6, { f = 70, decay = 1.1, pan = 0, bus = 'perc', skin = 0.5 } = {}) {
  const dest = pan ? S.panner(pan) : S.bus(bus);
  if (pan) dest.connect(S.bus(bus));
  // membrane: pitch-dropping sine + a quickly damped overtone
  const body = S.osc('sine', f * 1.7, t, t + decay + 0.05);
  body.frequency.exponentialRampToValueAtTime(f, t + 0.09);
  const gb = S.gain(0);
  perc(gb.gain, t, level, decay, 0.003);
  body.connect(gb).connect(dest);
  const over = S.osc('triangle', f * 2.4, t, t + decay * 0.3 + 0.05);
  over.frequency.exponentialRampToValueAtTime(f * 2.3, t + 0.05);
  const go = S.gain(0);
  perc(go.gain, t, level * 0.18, decay * 0.3, 0.002);
  over.connect(go).connect(dest);
  // skin slap (its own short-lived voice)
  const n = S.noise('pink', t, t + 0.25);
  const lp = S.filter('lowpass', 700 + f * 4, 0.9);
  const gn = S.gain(0);
  perc(gn.gain, t, level * skin, 0.2, 0.001);
  n.connect(lp).connect(gn).connect(dest);
  S.free(n, lp, gn);
  S.free(over, go);
  S.free(body, gb, ...(pan ? [dest] : []));
}

export function snare(S, t, level = 0.3, { pan = 0, bus = 'drums', decay = 0.22 } = {}) {
  const n = S.noise('white', t, t + decay + 0.05);
  const bp = S.filter('bandpass', 2200, 0.6);
  const gn = S.gain(0);
  perc(gn.gain, t, level, decay, 0.001);
  const o = S.osc('triangle', 210, t, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(170, t + 0.08);
  const go = S.gain(0);
  perc(go.gain, t, level * 0.6, 0.1, 0.001);
  const mix = S.gain(1);
  n.connect(bp).connect(gn).connect(mix);
  o.connect(go).connect(mix);
  const p = S.out(mix, bus, pan);
  S.free(n, n, bp, gn, o, go, mix, p);
}

export function hat(S, t, level = 0.1, { open = false, pan = 0.3, bus = 'drums' } = {}) {
  const decay = open ? 0.35 : 0.045;
  const n = S.noise('white', t, t + decay + 0.02);
  const hp = S.filter('highpass', open ? 6500 : 8000, 0.9);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.0008);
  n.connect(hp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(n, n, hp, g, p);
}

/** Cymbal crash / swell (stereo noise, bright, long). */
export function crash(S, t, level = 0.15, { decay = 2.6, bus = 'drums' } = {}) {
  const n = S.noise('white', t, t + decay + 0.1, { stereo: true });
  const hp = S.filter('highpass', 4200, 0.6);
  const pk = S.filter('peaking', 7500, 1.2);
  pk.gain.value = 5;
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.003);
  n.connect(hp).connect(pk).connect(g);
  S.out(g, bus);
  S.free(n, n, hp, pk, g);
}

// ====================================================== electronic voices

/**
 * Pulsing sub bass: ONE sine + ONE lowpassed saw for the whole span, with pitch
 * following `roots` ([time, midi]) and an 8th-note pump envelope per `hits`.
 */
export function subPulse(S, t0, t1, roots, hits, { level = 0.35, bus = 'bass' } = {}) {
  const sine = S.osc('sine', hz(roots[0][1]), t0, t1 + 0.4);
  const saw = S.osc('sawtooth', hz(roots[0][1]) * 2, t0, t1 + 0.4);
  for (const [t, m] of roots) {
    sine.frequency.setValueAtTime(hz(m), t);
    saw.frequency.setValueAtTime(hz(m) * 2, t);
  }
  const lp = S.filter('lowpass', 220, 0.8);
  const sg = S.gain(0.25);
  saw.connect(sg).connect(lp);
  const amp = S.gain(0);
  sine.connect(amp);
  lp.connect(amp);
  const g = amp.gain;
  g.setValueAtTime(0, t0);
  for (const { t, v, len = 0.2 } of hits) { // v in 0..1
    g.setTargetAtTime(level * v, t, 0.004);
    g.setTargetAtTime(level * v * 0.22, t + 0.03, len / 3);
  }
  g.setTargetAtTime(0, t1, 0.08);
  S.out(amp, bus);
  S.free(sine, sine, saw, lp, sg, amp);
}

/** Plucky synth note (saw + square, filter envelope). */
export function synthPluck(S, t, midi, { level = 0.08, pan = 0, bus = 'synth', decay = 0.22, cutoff = 2600 } = {}) {
  const end = t + decay + 0.05;
  const a = S.osc('sawtooth', hz(midi), t, end);
  const b = S.osc('square', hz(midi) * 1.003, t, end);
  const lp = S.filter('lowpass', cutoff, 3);
  lp.frequency.setValueAtTime(cutoff, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + decay);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.002);
  a.connect(lp);
  b.connect(lp);
  lp.connect(g);
  const p = S.out(g, bus, pan);
  S.free(a, a, b, lp, g, p);
}

/** Digital blip (sine or soft square). */
export function blip(S, t, freq, { level = 0.05, type = 'sine', decay = 0.07, pan = 0, bus = 'synth' } = {}) {
  const o = S.osc(type, freq, t, t + decay + 0.03);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.001);
  let tail = o;
  let lp = null;
  if (type !== 'sine') {
    lp = S.filter('lowpass', Math.min(9000, freq * 4), 0.7);
    o.connect(lp);
    tail = lp;
  }
  tail.connect(g);
  const p = S.out(g, bus, pan);
  S.free(o, o, g, p, ...(lp ? [lp] : []));
}

// ================================================================= effects

/** Riser: bandpassed noise sweeping up + gliding detuned saws; cuts at t1. */
export function riser(S, t0, t1, { level = 0.12, from = 250, to = 7000, pitch = null, bus = 'fx' } = {}) {
  const n = S.noise('white', t0, t1 + 0.1, { stereo: true });
  const bp = S.filter('bandpass', from, 1.4);
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t1);
  const g = S.gain(0);
  riseTo(g.gain, t0, t1, level, 0.04);
  n.connect(bp).connect(g);
  S.out(g, bus);
  const nodes = [n, bp, g];
  if (pitch) {
    const [m0, m1] = pitch;
    const lp = S.filter('lowpass', 500, 1);
    lp.frequency.setValueAtTime(400, t0);
    lp.frequency.exponentialRampToValueAtTime(5000, t1);
    const tg = S.gain(0);
    riseTo(tg.gain, t0, t1, level * 0.5, 0.04);
    for (const c of [-12, 0, 12]) {
      const o = S.osc('sawtooth', hz(m0), t0, t1 + 0.1);
      o.frequency.exponentialRampToValueAtTime(hz(m1), t1);
      o.detune.value = c;
      o.connect(lp);
      nodes.push(o);
    }
    lp.connect(tg);
    S.out(tg, bus);
    nodes.push(lp, tg);
  }
  S.free(n, ...nodes);
}

/** Reverse swell ("suck") into a hit at tHit. */
export function swellIn(S, tHit, dur, { level = 0.12, bus = 'fx', top = 9000 } = {}) {
  const t0 = tHit - dur;
  const n = S.noise('pink', t0, tHit + 0.1, { stereo: true });
  const lp = S.filter('lowpass', 300, 0.9);
  lp.frequency.setValueAtTime(250, t0);
  lp.frequency.exponentialRampToValueAtTime(top, tHit);
  const g = S.gain(0);
  riseTo(g.gain, t0, tHit, level, 0.025);
  n.connect(lp).connect(g);
  S.out(g, bus);
  S.free(n, n, lp, g);
}

/** Air whoosh: bandpassed noise sweep with a bell-shaped envelope and moving pan. */
export function whoosh(S, t0, dur, o = {}) {
  const { level = 0.15, f0 = 300, f1 = 3000, pan0 = -0.7, pan1 = 0.7, q = 1.2, peak = 0.55, bus = 'fx', kind = 'pink' } = o;
  const t1 = t0 + dur;
  const tp = t0 + dur * peak;
  const n = S.noise(kind, t0, t1 + 0.05);
  const bp = S.filter('bandpass', f0, q);
  bp.frequency.setValueAtTime(f0, t0);
  bp.frequency.exponentialRampToValueAtTime(f1, tp);
  bp.frequency.exponentialRampToValueAtTime(Math.max(80, (f0 + f1) * 0.25), t1);
  const g = S.gain(0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, tp);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  const p = S.panner(pan0);
  p.pan.setValueAtTime(pan0, t0);
  p.pan.linearRampToValueAtTime(pan1, t1);
  n.connect(bp).connect(g).connect(p).connect(S.bus(bus));
  S.free(n, n, bp, g, p);
}

/** Sub boom: pitch-dropping sine for cinematic impacts. */
export function boom(S, t, { level = 0.7, f0 = 90, f1 = 36, decay = 2.5, bus = 'bass' } = {}) {
  const o = S.osc('sine', f0, t, t + decay + 0.2);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.35);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.004);
  o.connect(g);
  S.out(g, bus);
  S.free(o, o, g);
}
