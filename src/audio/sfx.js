// Sound design: the "materials" of each era — stone, graphite, paper, clockwork,
// iron and steam, electricity, radio, jet and rocket, relays, valves.
//
// Irregular textures (grinding, scratching, rustling) use ONE noise source each,
// shaped by JS-generated automation curves, rather than hundreds of tiny nodes.

import { hz, perc, ahr } from './core.js';

// Smoothed random walk in [0, 1] sampled at `rate` Hz.
function wander(S, seconds, rate, speed, smooth = 0.9) {
  let v = S.random(), s = v;
  return S.curve(seconds, rate, () => {
    v = Math.min(1, Math.max(0, v + (S.random() - 0.5) * speed));
    s = s * smooth + v * (1 - smooth);
    return s;
  });
}

/** Low stone-on-stone grinding: jerky, catching friction over brown noise. */
export function stoneGrind(S, t0, t1, { level = 0.25, pan = 0, bus = 'sfx', grow = true } = {}) {
  const dur = t1 - t0;
  const rate = 300;
  const walk = wander(S, dur, rate, 0.25, 0.97);
  const fcurve = S.curve(dur, rate, (_, i) => 90 + 220 * walk[i]);
  let catchT = 0;
  const amp = S.curve(dur, rate, (t, i) => {
    if (S.random() < 0.012) catchT = 0.04 + S.random() * 0.1; // the stone catches
    const c = catchT > 0 ? 1.8 : 1;
    catchT -= 1 / rate;
    const env = grow ? 0.35 + 0.65 * (t / dur) : 1;
    const edge = Math.min(1, t / 0.25, (dur - t) / 0.3);
    return level * env * edge * (0.35 + 0.65 * walk[i]) * c;
  });
  const n = S.noise('brown', t0, t1);
  const bp = S.filter('bandpass', 150, 1.1);
  bp.frequency.setValueCurveAtTime(fcurve, t0, dur);
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(amp, t0, dur);
  n.connect(bp).connect(g);
  // grit: sparse crunches in the low mids
  const n2 = S.noise('white', t0, t1);
  const bp2 = S.filter('bandpass', 700, 2.5);
  const grit = S.curve(dur, 1000, (t) => {
    const edge = Math.min(1, t / 0.2, (dur - t) / 0.2);
    return S.random() < 0.06 ? level * 0.5 * S.random() * edge * (grow ? t / dur : 1) : 0;
  });
  const g2 = S.gain(0);
  g2.gain.setValueCurveAtTime(grit, t0, dur);
  n2.connect(bp2).connect(g2);
  const mix = S.gain(1);
  g.connect(mix);
  g2.connect(mix);
  const p = S.out(mix, bus, pan);
  S.free(n, n, bp, g, n2, bp2, g2, mix, p);
}

/** Pencil on paper: fast irregular strokes of bandpassed noise with paper-tooth grain. */
export function pencil(S, t0, t1, { level = 0.12, pan = 0, bus = 'sfx', vigor = 1 } = {}) {
  const dur = t1 - t0;
  const rate = 1500;
  const n = Math.ceil(dur * rate);
  const amp = new Float32Array(n);
  const freq = new Float32Array(n);
  let i = 0;
  while (i < n) {
    const len = Math.floor(rate * (0.025 + S.random() * 0.13 / vigor));
    const gap = Math.floor(rate * (0.008 + S.random() * 0.06 / vigor));
    const a = level * (0.35 + 0.65 * S.random());
    const fA = 2200 + S.random() * 2800, fB = 2200 + S.random() * 3200;
    for (let j = 0; j < len && i + j < n; j++) {
      const u = j / len;
      const env = Math.min(1, j / (0.004 * rate), (len - j) / (0.012 * rate));
      amp[i + j] = a * env * (0.55 + 0.45 * S.random()) * (0.8 + 0.2 * Math.sin(u * 40));
      freq[i + j] = fA + (fB - fA) * u;
    }
    for (let j = len; j < len + gap && i + j < n; j++) { amp[i + j] = 0; freq[i + j] = fB; }
    i += len + gap;
  }
  const edge = Math.floor(0.02 * rate);
  for (let k = 0; k < edge; k++) { amp[k] *= k / edge; amp[n - 1 - k] *= k / edge; }
  const src = S.noise('white', t0, t1);
  const bp = S.filter('bandpass', 3000, 2.2);
  bp.frequency.setValueCurveAtTime(freq, t0, dur);
  const hp = S.filter('highpass', 1200);
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(amp, t0, dur);
  src.connect(bp).connect(hp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(src, src, bp, hp, g, p);
}

/** Paper rustle / crinkle: dense random crackles in the upper mids. */
export function crinkle(S, t0, dur, { level = 0.12, pan = 0, bus = 'sfx', density = 0.08 } = {}) {
  const rate = 2000;
  let s = 0;
  const amp = S.curve(dur, rate, (t) => {
    const env = Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.7;
    const spike = S.random() < density ? S.random() ** 2 : 0;
    s = Math.max(spike, s * 0.72);
    return level * env * s;
  });
  const n = S.noise('white', t0, t0 + dur);
  const bp = S.filter('bandpass', 3200, 0.9);
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(amp, t0, dur);
  n.connect(bp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(n, n, bp, g, p);
}

/** Sheet of paper moving through air: soft lowpassed swish + a little crinkle. */
export function paperSwish(S, t0, dur, { level = 0.12, pan0 = -0.5, pan1 = 0.5, bus = 'sfx' } = {}) {
  const n = S.noise('pink', t0, t0 + dur + 0.05);
  const bp = S.filter('bandpass', 900, 0.7);
  bp.frequency.setValueAtTime(700, t0);
  bp.frequency.exponentialRampToValueAtTime(2600, t0 + dur * 0.4);
  bp.frequency.exponentialRampToValueAtTime(900, t0 + dur);
  const g = S.gain(0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const p = S.panner(pan0);
  p.pan.linearRampToValueAtTime(pan1, t0 + dur);
  n.connect(bp).connect(g).connect(p).connect(S.bus(bus));
  S.free(n, n, bp, g, p);
  crinkle(S, t0 + dur * 0.1, dur * 0.8, { level: level * 0.6, pan: (pan0 + pan1) / 2, bus, density: 0.05 });
}

/** Short mechanical click: bandpassed noise tick + resonant body ping. */
export function click(S, t, { level = 0.1, freq = 3200, body = 900, q = 3, decay = 0.018, pan = 0, bus = 'sfx' } = {}) {
  const n = S.noise('white', t, t + decay + 0.02);
  const bp = S.filter('bandpass', freq, q);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.0004);
  const o = S.osc('sine', body, t, t + decay * 2 + 0.02);
  const go = S.gain(0);
  perc(go.gain, t, level * 0.5, decay * 1.6, 0.0008);
  const mix = S.gain(1);
  n.connect(bp).connect(g).connect(mix);
  o.connect(go).connect(mix);
  const p = S.out(mix, bus, pan);
  S.free(o, n, bp, g, o, go, mix, p);
}

/** Clock escapement on a grid: alternating tick / tock. */
export function clockwork(S, t0, t1, step, { level = 0.08, bus = 'sfx' } = {}) {
  const k0 = Math.ceil(t0 / step - 1e-6);
  for (let k = k0; k * step < t1; k++) {
    const t = k * step;
    const tick = k % 2 === 0;
    S.at(t, () => click(S, t, {
      level, freq: tick ? 3600 : 2600, body: tick ? 1250 : 980, q: 4, decay: 0.016, pan: tick ? -0.25 : 0.25, bus,
    }));
  }
}

/** Gear ratchet: a burst of fast pawl clicks. */
export function ratchet(S, t0, dur, { level = 0.06, rate = 28, pan = 0, bus = 'sfx', freq = 4200 } = {}) {
  const count = Math.floor(dur * rate);
  for (let i = 0; i < count; i++) {
    const t = t0 + i / rate;
    click(S, t, { level: level * (0.7 + 0.3 * S.random()), freq: freq * S.rand(0.9, 1.1), body: 1600, q: 5, decay: 0.008, pan, bus });
  }
}

/** Steam pressure release: hiss burst with falling filter. */
export function steam(S, t, dur, { level = 0.2, pan = 0, bus = 'sfx' } = {}) {
  const n = S.noise('white', t, t + dur + 0.1, { stereo: true });
  const hp = S.filter('highpass', 1800, 0.7);
  const bp = S.filter('bandpass', 6500, 0.6);
  bp.frequency.setValueAtTime(7500, t);
  bp.frequency.exponentialRampToValueAtTime(2500, t + dur);
  const g = S.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(level, t + 0.015);
  g.gain.setTargetAtTime(level * 0.5, t + 0.015, dur * 0.2);
  g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.15);
  n.connect(hp).connect(bp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(n, n, hp, bp, g, p);
}

/** Electrical crackle through a highpass; `bursts` adds random surges. */
export function sparks(S, t0, dur, { level = 0.15, pan = 0, bus = 'sfx', hp = 2200, bursts = 0.6 } = {}) {
  const src = S.noise('crackle', t0, t0 + dur, { rate: S.rand(0.9, 1.3) });
  const f = S.filter('highpass', hp, 0.8);
  let surge = 0;
  const amp = S.curve(dur, 200, (t) => {
    if (S.random() < bursts * 0.05) surge = 1;
    surge *= 0.9;
    const edge = Math.min(1, t / 0.01, (dur - t) / 0.05);
    return level * edge * (0.25 + 0.75 * surge);
  });
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(amp, t0, dur);
  src.connect(f).connect(g);
  const p = S.out(g, bus, pan);
  S.free(src, src, f, g, p);
}

/** Arc zap: bright saw sweeping down fast. */
export function zap(S, t, { level = 0.08, pan = 0, bus = 'sfx', from = 5200, to = 180, dur = 0.16 } = {}) {
  const o = S.osc('sawtooth', from, t, t + dur + 0.05);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const bp = S.filter('bandpass', 2400, 0.8);
  const g = S.gain(0);
  perc(g.gain, t, level, dur, 0.001);
  o.connect(bp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(o, o, bp, g, p);
}

/** Mains buzz / valve hum: 50–60 Hz saw with harmonics, gently filtered. */
export function hum(S, t0, t1, { level = 0.05, freq = 60, cutoff = 700, pan = 0, bus = 'sfx', attack = 0.3, release = 0.5 } = {}) {
  const o = S.osc('sawtooth', freq, t0, t1 + release * 1.5);
  const o2 = S.osc('sine', freq * 2, t0, t1 + release * 1.5);
  const lp = S.filter('lowpass', cutoff, 1.5);
  const g = S.gain(0);
  ahr(g.gain, t0, t1, level, attack, release);
  const g2 = S.gain(0.6);
  o.connect(lp);
  o2.connect(g2).connect(lp);
  lp.connect(g);
  const p = S.out(g, bus, pan);
  S.free(o, o, o2, lp, g, g2, p);
}

const MORSE = { W: '.--', C: '-.-.', A: '.-', E: '.', S: '...', T: '-', O: '---' };

/** Telegraph sounder keying a message: click on key-down, clack on key-up, faint tone. */
export function telegraph(S, t0, text, { unit = 0.05, level = 0.12, bus = 'sfx', pan = -0.2 } = {}) {
  let t = t0;
  for (const ch of text) {
    if (ch === ' ') { t += unit * 4; continue; }
    for (const sym of MORSE[ch] ?? '') {
      const len = sym === '.' ? unit : unit * 3;
      click(S, t, { level, freq: 2900, body: 820, q: 3.5, decay: 0.02, pan, bus });
      click(S, t + len, { level: level * 0.6, freq: 1900, body: 520, q: 3, decay: 0.02, pan, bus });
      const o = S.osc('sine', 760, t, t + len + 0.02);
      const g = S.gain(0);
      ahr(g.gain, t, t + len, level * 0.12, 0.004, 0.01);
      o.connect(g);
      const p = S.out(g, bus, pan);
      S.free(o, o, g, p);
      t += len + unit;
    }
    t += unit * 2;
  }
  return t;
}

/** Old telephone bell: two tones with a fast clapper tremolo. */
export function phoneRing(S, t0, dur, { level = 0.04, pan = 0.3, bus = 'sfx' } = {}) {
  const a = S.osc('sine', 1180, t0, t0 + dur + 0.2);
  const b = S.osc('sine', 1510, t0, t0 + dur + 0.2);
  const trem = S.osc('square', 22, t0, t0 + dur + 0.2);
  const tg = S.gain(0.5);
  const g = S.gain(0);
  ahr(g.gain, t0, t0 + dur, level, 0.01, 0.15);
  const am = S.gain(0.5);
  trem.connect(tg).connect(am.gain);
  a.connect(am);
  b.connect(am);
  am.connect(g);
  const p = S.out(g, bus, pan);
  S.free(a, a, b, trem, tg, g, am, p);
}

/** Radio tuning: static through a wandering bandpass, a heterodyne whistle, and a station fading in. */
export function radioTune(S, t0, dur, { level = 0.12, bus = 'sfx' } = {}) {
  const t1 = t0 + dur;
  const walk = wander(S, dur, 200, 0.5, 0.8);
  const n = S.noise('white', t0, t1);
  const bp = S.filter('bandpass', 2000, 0.8);
  bp.frequency.setValueCurveAtTime(S.curve(dur, 200, (_, i) => 700 + 3500 * walk[i]), t0, dur);
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(S.curve(dur, 200, (t) => {
    const edge = Math.min(1, t / 0.05, (dur - t) / 0.15);
    return level * edge * (0.5 + 0.5 * S.random());
  }), t0, dur);
  n.connect(bp).connect(g);
  const p1 = S.out(g, bus, 0.15);
  // heterodyne whistle sweeping past stations
  const w = S.osc('sine', 3200, t0, t1);
  w.frequency.setValueAtTime(3200, t0);
  w.frequency.exponentialRampToValueAtTime(260, t0 + dur * 0.45);
  w.frequency.exponentialRampToValueAtTime(1400, t0 + dur * 0.7);
  w.frequency.exponentialRampToValueAtTime(90, t1);
  const wg = S.gain(0);
  ahr(wg.gain, t0, t1 - 0.1, level * 0.2, 0.05, 0.1);
  w.connect(wg);
  const p2 = S.out(wg, bus, -0.1);
  // a "voice" (formant-filtered buzz, syllabic chops) emerging at the end
  const v = S.osc('sawtooth', 130, t0 + dur * 0.55, t1);
  const f = S.filter('bandpass', 900, 3);
  f.frequency.setValueCurveAtTime(S.curve(dur * 0.45, 60, () => 600 + S.random() * 1400), t0 + dur * 0.55, dur * 0.45);
  const vg = S.gain(0);
  vg.gain.setValueCurveAtTime(S.curve(dur * 0.45, 60, (t) => level * 0.35 * (t / (dur * 0.45)) * (S.random() < 0.65 ? 1 : 0.1)), t0 + dur * 0.55, dur * 0.45);
  v.connect(f).connect(vg);
  const p3 = S.out(vg, bus, 0.1);
  S.free(n, n, bp, g, p1, w, wg, p2, v, f, vg, p3);
}

/** Jet pass-by peaking at tPeak: roar through a sweeping bandpass, doppler whine, panned L→R. */
export function jetPass(S, tPeak, { pre = 1.0, post = 1.3, level = 0.3, bus = 'sfx' } = {}) {
  const t0 = tPeak - pre, t1 = tPeak + post;
  const pan = S.panner(-0.95);
  pan.pan.setValueAtTime(-0.95, t0);
  pan.pan.linearRampToValueAtTime(0, tPeak);
  pan.pan.linearRampToValueAtTime(0.95, t1);
  pan.connect(S.bus(bus));
  // broadband roar
  const n = S.noise('pink', t0, t1, { stereo: true });
  const bp = S.filter('bandpass', 700, 0.7);
  bp.frequency.setValueAtTime(700, t0);
  bp.frequency.exponentialRampToValueAtTime(2800, tPeak);
  bp.frequency.exponentialRampToValueAtTime(450, t1);
  const g = S.gain(0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, tPeak);
  g.gain.exponentialRampToValueAtTime(0.0001, t1);
  n.connect(bp).connect(g).connect(pan);
  // low rumble
  const r = S.noise('brown', t0, t1);
  const lp = S.filter('lowpass', 180, 0.8);
  const rg = S.gain(0);
  rg.gain.setValueAtTime(0.0001, t0);
  rg.gain.exponentialRampToValueAtTime(level * 1.2, tPeak + 0.1);
  rg.gain.exponentialRampToValueAtTime(0.0001, t1);
  r.connect(lp).connect(rg).connect(pan);
  // turbine whine with doppler drop around the peak
  const wg = S.gain(0);
  wg.gain.setValueAtTime(0.0001, t0);
  wg.gain.exponentialRampToValueAtTime(level * 0.12, tPeak);
  wg.gain.exponentialRampToValueAtTime(0.0001, t1);
  const wf = S.filter('bandpass', 1500, 2);
  const nodes = [n, bp, g, r, lp, rg, wg, wf, pan];
  for (const [f, c] of [[1480, -5], [1485, 7]]) {
    const o = S.osc('sawtooth', f * 1.14, t0, t1);
    o.detune.value = c;
    o.frequency.setValueAtTime(f * 1.14, tPeak - 0.25);
    o.frequency.setTargetAtTime(f * 0.86, tPeak - 0.12, 0.12);
    o.connect(wf);
    nodes.push(o);
  }
  wf.connect(wg).connect(pan);
  S.free(n, ...nodes);
}

/** Rocket launch: huge lowpassed roar, mid rumble and crackle; long decay. */
export function rocket(S, t0, dur, { level = 0.35, bus = 'sfx' } = {}) {
  const t1 = t0 + dur;
  const env = (g, peak, attack) => {
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + attack);
    g.setTargetAtTime(peak * 0.5, t0 + attack, dur * 0.35);
    g.linearRampToValueAtTime(0, t1);
  };
  const low = S.noise('brown', t0, t1, { stereo: true });
  const lp = S.filter('lowpass', 140, 0.9);
  lp.frequency.setValueAtTime(90, t0);
  lp.frequency.exponentialRampToValueAtTime(220, t0 + 0.6);
  const lg = S.gain(0);
  env(lg.gain, level, 0.35);
  low.connect(lp).connect(lg);
  S.out(lg, bus);
  const mid = S.noise('pink', t0, t1, { stereo: true });
  const bp = S.filter('bandpass', 420, 0.6);
  const mg = S.gain(0);
  env(mg.gain, level * 0.45, 0.25);
  mid.connect(bp).connect(mg);
  S.out(mg, bus);
  const cr = S.noise('crackle', t0, t1, { rate: 0.55 });
  const hp = S.filter('highpass', 900, 0.7);
  const cg = S.gain(0);
  env(cg.gain, level * 1.4, 0.2);
  cr.connect(hp).connect(cg);
  S.out(cg, bus, 0.1);
  S.free(low, low, lp, lg, mid, bp, mg, cr, hp, cg);
}

/** Underwater dive: lowpass sweeping down plus a few bubble chirps. */
export function dive(S, t0, dur, { level = 0.15, bus = 'sfx' } = {}) {
  const n = S.noise('pink', t0, t0 + dur, { stereo: true });
  const lp = S.filter('lowpass', 5000, 1.5);
  lp.frequency.setValueAtTime(5000, t0);
  lp.frequency.exponentialRampToValueAtTime(260, t0 + dur);
  const g = S.gain(0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(level, t0 + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  n.connect(lp).connect(g);
  S.out(g, bus);
  S.free(n, n, lp, g);
  for (let i = 0; i < 7; i++) {
    const t = t0 + dur * 0.2 + S.random() * dur * 0.7;
    const f = S.rand(350, 700);
    const o = S.osc('sine', f, t, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 2.2, t + 0.05);
    const bg = S.gain(0);
    perc(bg.gain, t, level * 0.25, 0.05, 0.003);
    o.connect(bg);
    const p = S.out(bg, bus, S.rand(-0.6, 0.6));
    S.free(o, o, bg, p);
  }
}

/** Relay bank: armature click + contact bounce. */
export function relay(S, t, { level = 0.1, pan = 0, bus = 'sfx' } = {}) {
  click(S, t, { level, freq: 3300, body: 640, q: 3, decay: 0.012, pan, bus });
  click(S, t + 0.006, { level: level * 0.45, freq: 4600, body: 1400, q: 4, decay: 0.008, pan, bus });
}

/** Heavy low thud (book, clay, canvas): lowpassed noise + short sine. */
export function thud(S, t, { level = 0.3, f = 80, pan = 0, bus = 'sfx', decay = 0.35, tone = 1800 } = {}) {
  const n = S.noise('pink', t, t + decay);
  const lp = S.filter('lowpass', tone, 0.8);
  const g = S.gain(0);
  perc(g.gain, t, level, decay * 0.5, 0.001);
  const o = S.osc('sine', f * 1.5, t, t + decay + 0.05);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
  const go = S.gain(0);
  perc(go.gain, t, level * 0.9, decay, 0.002);
  const mix = S.gain(1);
  n.connect(lp).connect(g).connect(mix);
  o.connect(go).connect(mix);
  const p = S.out(mix, bus, pan);
  S.free(o, n, lp, g, o, go, mix, p);
}

/** Air bed: stereo pink noise through a slowly drifting bandpass. */
export function air(S, t0, t1, { level = 0.05, freq = 2600, q = 0.6, attack = 1.5, release = 2, bus = 'pad', drift = 0.5 } = {}) {
  const dur = t1 - t0;
  const n = S.noise('pink', t0, t1 + release * 1.5, { stereo: true });
  const bp = S.filter('bandpass', freq, q);
  const walk = wander(S, dur, 30, 0.2, 0.95);
  bp.frequency.setValueCurveAtTime(S.curve(dur, 30, (_, i) => freq * (1 - drift / 2 + drift * walk[i])), t0, dur);
  const g = S.gain(0);
  ahr(g.gain, t0, t1, level, attack, release);
  n.connect(bp).connect(g);
  S.out(g, bus);
  S.free(n, n, bp, g);
}

export { hz };
