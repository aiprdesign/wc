// Instruments that are not orchestral sections (see orchestra.js for those):
// piano, celesta, harp and struck sounds (modal voices), the trailer percussion
// kit (taiko ensemble, toms, sticks, kick, snare, hats, cymbals), hybrid electronic
// voices (sub pulse, synth pluck, blips) and transition effects (risers, reverse
// cymbals, swells, whooshes, booms, downers).
//
// Every function takes the Studio `S` first and schedules with absolute times.

import { hz, perc, riseTo, ahr, clamp } from './core.js';

// ============================================================ modal voices
// Plucked / struck sounds are rendered in JS as sums of exponentially decaying
// partials (a recursive complex oscillator per partial — cheap and exactly in
// tune), cached per pitch, and played back with a single buffer source.

export function modalBuffer(S0, key, f0, modes, { seconds, noise = 0, attack = 0.002, vary = 0, hammer = null }) {
  if (S0.cache.has(key)) return S0.cache.get(key);
  const S = S0.seeded(key);
  // round-robin variation: every rendered take has its own mode balance, decay and
  // (for struck strings) a hair of mistuning
  if (vary > 0) modes = modes.map(([r, a, t]) => [r * (1 + (S.random() - 0.5) * vary * 0.002), a * (1 + (S.random() - 0.5) * vary), t * (1 + (S.random() - 0.5) * vary * 0.6)]);
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
  if (hammer) { // felt hammer thump (low knock + soft noise) and damper release at the end
    const { level: hl, knock, damper = 0 } = hammer;
    const m = Math.floor(0.03 * sr);
    let y = 0, y2 = 0;
    const wk = (2 * Math.PI * knock) / sr;
    for (let i = 0; i < m; i++) {
      y += 0.12 * (S.random() * 2 - 1 - y);
      y2 += 0.3 * (y - y2);
      const env = (1 - i / m) ** 3;
      d[i] += hl * (y2 * 2.5 + 0.6 * Math.sin(wk * i)) * env;
    }
    if (damper > 0) { // felt settling on the strings: a soft brushed thud near the end
      const s0 = Math.floor(n * 0.82), dl = Math.min(n - s0, Math.floor(0.12 * sr));
      let z = 0;
      for (let i = 0; i < dl; i++) {
        z += 0.05 * (S.random() * 2 - 1 - z);
        d[s0 + i] += damper * z * Math.sin((Math.PI * i) / dl);
      }
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

export function playBuffer(S, t, buf, { level, pan = 0, bus, rate = 1 }) {
  const src = S.buffer(buf, t, rate);
  const g = S.gain(level);
  src.connect(g);
  const p = S.out(g, bus, pan);
  S.free(src, src, g, p);
  return src;
}

/** Harp / felt-piano pluck (inharmonic string partials, low notes ring longer). */
export function pluck(S, t, midi, { level = 0.25, pan = 0, bus = 'lead', bright = 1 } = {}) {
  t = S.human(t, 10);
  const v = S.robin(`pluck:${midi}`, 3);
  level *= S.rand(0.85, 1.1);
  const f0 = hz(midi);
  const T = clamp(2.6 * Math.sqrt(220 / f0), 0.9, 4.5);
  const modes = [];
  for (let k = 1; k <= 18; k++) {
    const ratio = k * Math.sqrt(1 + 0.00022 * k * k);
    const amp = (Math.abs(Math.sin(Math.PI * k * 0.21)) / k ** (1.35 - 0.25 * bright));
    modes.push([ratio, amp, T / (1 + 0.55 * (k - 1) ** 1.3)]);
  }
  const buf = modalBuffer(S, `pluck:${midi}:${bright}:${v}`, f0, modes, { seconds: T * 0.85, noise: 0.15 + 0.05 * v, vary: 0.35 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Glassy crystalline bell (slightly detuned pairs → shimmer). */
export function bell(S, t, midi, { level = 0.06, pan = 0, bus = 'lead', decay = 2.5 } = {}) {
  const v = S.robin(`bell:${midi}`, 2);
  level *= S.rand(0.85, 1.1);
  const modes = [
    [1, 1, decay], [1.0021, 0.7, decay * 0.9], [2.0, 0.22, decay * 0.6],
    [2.76, 0.28, decay * 0.45], [5.4, 0.1, decay * 0.25], [8.93, 0.05, decay * 0.15],
  ];
  const buf = modalBuffer(S, `bell:${midi}:${decay}:${v}`, hz(midi), modes, { seconds: decay * 0.85, attack: 0.004, vary: 0.3, noise: 0.02 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Struck metal (anvil / piston / gear teeth). */
export function metal(S, t, f0, { level = 0.3, pan = 0, bus = 'perc', decay = 0.9 } = {}) {
  // inharmonic plate/bar modes with close pairs (beating), a hard contact transient
  const v = S.robin(`metal:${f0}`, 3);
  const modes = [
    [1, 1, decay], [1.007, 0.4, decay * 0.8], [1.47, 0.45, decay * 0.6], [2.09, 0.3, decay * 0.5],
    [2.76, 0.7, decay * 0.55], [2.78, 0.3, decay * 0.5], [4.1, 0.35, decay * 0.4], [5.4, 0.5, decay * 0.35],
    [6.83, 0.25, decay * 0.25], [8.93, 0.3, decay * 0.2], [13.34, 0.18, decay * 0.12], [17.2, 0.1, decay * 0.07],
  ];
  const buf = modalBuffer(S, `metal:${f0}:${decay}:${v}`, f0, modes, { seconds: decay * 0.9, noise: 1.2 + 0.3 * v, attack: 0.0005, vary: 0.5 });
  return playBuffer(S, t, buf, { level: level * S.rand(0.85, 1.1), pan, bus, rate: S.rand(0.985, 1.015) });
}

/** Resonant stone tap (marble). */
export function stoneTap(S, t, { level = 0.25, pan = 0, bus = 'sfx', f0 = 640 } = {}) {
  const modes = [[1, 1, 0.3], [1.58, 0.7, 0.2], [2.31, 0.55, 0.14], [3.2, 0.4, 0.09], [4.6, 0.25, 0.05]];
  const v = S.robin('stone', 3);
  const buf = modalBuffer(S, `stone:${f0}:${v}`, f0, modes, { seconds: 0.4, noise: 1.5, attack: 0.0005, vary: 0.5 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Harp roll: chord tones strummed upward. */
export function harpRoll(S, t, notes, { level = 0.2, spread = 0.035, bus = 'lead' } = {}) {
  notes.forEach((m, i) => pluck(S, t + i * spread, m, { level, bus, pan: -0.5 + i / Math.max(1, notes.length - 1) }));
}

/**
 * Felt grand piano: three slightly mistuned inharmonic strings per note (beating),
 * velocity-dependent brightness (harder = more upper partials), felt hammer thump,
 * damper noise, and three round-robin takes per pitch and dynamic.
 */
export function piano(S, t, midi, { level = 0.25, pan = 0, bus = 'piano' } = {}) {
  t = S.human(t, 12);
  const f0 = hz(midi);
  const hard = level >= 0.16 ? 1 : 0;              // dynamic layer
  const v = S.robin(`piano:${midi}:${hard}`, 3);
  const key = `piano:${midi}:${hard}:${v}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const T = clamp(4.2 * Math.sqrt(262 / f0), 1.4, 5.5);
    const B = 0.00038 * (f0 < 130 ? 1.6 : 1);        // inharmonicity (stiffer bass strings)
    const tilt = hard ? 1.25 : 1.7;                    // spectral tilt from hammer velocity
    const strike = S.rand(0.1, 0.14);                  // hammer position → comb in the spectrum
    const det = [0, S.rand(0.6, 1.4), -S.rand(0.4, 1.1)]; // cents per string
    const modes = [];
    for (let k = 1; k <= 16; k++) {
      const ratio = k * Math.sqrt(1 + B * k * k);
      const amp = Math.abs(Math.sin(Math.PI * k * strike)) / k ** tilt;
      const t60 = T / (1 + 0.4 * (k - 1) ** 1.35);
      det.forEach((c, j) => modes.push([ratio * 2 ** (c / 1200), amp * (j ? 0.7 : 1), t60 * (j ? 0.85 : 1)]));
    }
    // soundboard: a couple of low body modes excited by every note
    modes.push([95 / f0, 0.04, 0.25], [210 / f0, 0.03, 0.18]);
    buf = modalBuffer(S, key, f0, modes, {
      seconds: T * 0.6, noise: hard ? 0.35 : 0.2, attack: hard ? 0.002 : 0.004, vary: 0.25,
      hammer: { level: hard ? 0.08 : 0.05, knock: 70 + 30 * S.random(), damper: 0.02 },
    });
  }
  return playBuffer(S, t, buf, { level: level * S.rand(0.88, 1.08), pan: Math.abs(pan) < 0.2 ? 0 : pan, bus });
}

/** Celesta: soft glockenspiel-like bell an octave above the piano. */
export function celesta(S, t, midi, { level = 0.05, pan = 0, bus = 'lead' } = {}) {
  t = S.human(t, 10);
  const v = S.robin(`celesta:${midi}`, 2);
  const modes = [[1, 1, 1.6], [3.0, 0.12, 0.5], [4.1, 0.06, 0.25], [1.0015, 0.5, 1.4], [0.5 * 1.0, 0.02, 0.3]];
  const buf = modalBuffer(S, `celesta:${midi}:${v}`, hz(midi), modes, { seconds: 1.5, attack: 0.002, noise: 0.06, vary: 0.3 });
  return playBuffer(S, t, buf, { level: level * S.rand(0.85, 1.1), pan, bus });
}

/** Pizzicato string: short, round pluck. */
export function pizz(S, t, midi, { level = 0.12, pan = 0, bus = 'strings' } = {}) {
  t = S.human(t, 10);
  const v = S.robin(`pizz:${midi}`, 3);
  const f0 = hz(midi);
  const T = clamp(0.9 * Math.sqrt(196 / f0), 0.25, 1.2);
  const modes = [];
  const pos = 0.26 + 0.04 * v; // plucking point differs per take
  for (let k = 1; k <= 12; k++) modes.push([k * (1 + 0.0002 * k * k), Math.abs(Math.sin(Math.PI * k * pos)) / k ** 1.6, T / (1 + 0.8 * (k - 1))]);
  modes.push([290 / f0, 0.08, 0.12]); // body
  const buf = modalBuffer(S, `pizz:${midi}:${v}`, f0, modes, { seconds: T, noise: 0.14, attack: 0.002, vary: 0.35 });
  return playBuffer(S, t, buf, { level: level * S.rand(0.85, 1.12), pan, bus });
}

// ======================================================== sustained voices

/** Sustained sine drone with slow beating (distant resonance). */
export function drone(S, t0, t1, midi, { level = 0.1, attack = 2, release = 2, bus = 'pad', beat = 0.25, pan = 0 } = {}) {
  const amp = S.gain(0);
  ahr(amp.gain, t0, t1, level / 2, attack, release);
  const end = t1 + release * 1.1;
  const a = S.osc('sine', hz(midi), t0, end);
  const b = S.osc('sine', hz(midi) + beat, t0, end);
  const bg = S.gain(0.55); // partial beating: a slow swell, never a full null
  a.connect(amp);
  b.connect(bg).connect(amp);
  const p = S.out(amp, bus, pan);
  S.free(a, b, bg, amp, p);
}

// ============================================================== percussion
// Rendered one-shots live in percussion.js; re-exported here for convenience.

export { taiko, tom, kick, snare, stick, hat, crash, warmPercussion } from './percussion.js';

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

/** Reverse cymbal into tHit (bright noise swelling exponentially, cut on the hit). */
export function revCymbal(S, tHit, dur, { level = 0.1, bus = 'fx' } = {}) {
  const t0 = tHit - dur;
  const n = S.noise('white', t0, tHit + 0.05, { stereo: true });
  const hp = S.filter('highpass', 3500, 0.7);
  const pk = S.filter('peaking', 8000, 1);
  pk.gain.value = 6;
  const g = S.gain(0);
  riseTo(g.gain, t0, tHit, level, 0.02);
  n.connect(hp).connect(pk).connect(g);
  S.out(g, bus);
  S.free(n, hp, pk, g);
}

/** Downer: a falling sub/saw sweep with a darkening noise tail after a hit. */
export function downer(S, t, { level = 0.2, dur = 1.6, from = 320, to = 38, bus = 'fx' } = {}) {
  const end = t + dur + 0.1;
  const o = S.osc('sawtooth', from, t, end);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const s = S.osc('sine', from / 2, t, end);
  s.frequency.exponentialRampToValueAtTime(to / 2 + 10, t + dur);
  const lp = S.filter('lowpass', 1400, 1.2);
  lp.frequency.setValueAtTime(1400, t);
  lp.frequency.exponentialRampToValueAtTime(120, t + dur);
  const g = S.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  const sg = S.gain(0.8);
  o.connect(lp);
  s.connect(sg).connect(lp);
  lp.connect(g);
  S.out(g, bus);
  const n = S.noise('pink', t, end, { stereo: true });
  const nl = S.filter('lowpass', 6000, 0.7);
  nl.frequency.setValueAtTime(6000, t);
  nl.frequency.exponentialRampToValueAtTime(200, t + dur);
  const ng = S.gain(0);
  ng.gain.setValueAtTime(0, t);
  ng.gain.linearRampToValueAtTime(level * 0.5, t + 0.03);
  ng.gain.exponentialRampToValueAtTime(0.0005, t + dur);
  n.connect(nl).connect(ng);
  S.out(ng, bus);
  S.free(o, s, lp, g, sg, n, nl, ng);
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
