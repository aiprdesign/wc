// Sound design: the "materials" of each era — stone, graphite, paper, clockwork,
// iron and steam, electricity, radio, jet and rocket, relays, valves.
//
// Irregular textures (grinding, scratching, rustling) use ONE noise source each,
// shaped by JS-generated automation curves, rather than hundreds of tiny nodes.
//
// v4: layered, designed sounds instead of single synthetic voices — impacts are
// crack + inharmonic metal/rock modes + debris grains; gears are modal teeth
// (inharmonic, round-robin, never evenly spaced) over a body rumble; steam is a
// valve chuff, sputtering hiss and pressure rumble; electricity is crackle plus a
// modulated arc buzz; paper is rendered grain by grain; jet and rocket get
// doppler, turbine wobble and distorted crackle. All sit under the music.

import { perc, ahr } from './core.js';
import { modalBuffer, playBuffer } from './instruments.js';

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

/**
 * Paper rustle / crinkle, rendered grain by grain: hundreds of tiny resonant
 * crackles (each its own pitch, width and level) under a bell-shaped density.
 */
export function crinkle(S, t0, dur, { level = 0.12, pan = 0, bus = 'sfx', density = 0.08 } = {}) {
  const sr = S.sr, n = Math.ceil(dur * sr);
  const buf = S.ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const count = Math.floor(dur * 2000 * density);
  for (let g = 0; g < count; g++) {
    // denser in the middle of the gesture
    let u = S.random();
    u = 0.5 + (u - 0.5) * (0.6 + 0.4 * S.random());
    const i0 = Math.floor(u * (n - 1));
    const env = Math.sin(Math.PI * u) ** 0.7;
    const amp = env * S.random() ** 2.2 * (S.random() < 0.08 ? 2.2 : 1);
    const f = S.rand(1400, 7000), q = S.rand(3, 9);
    const len = Math.floor(sr * S.rand(0.002, 0.012));
    const w = (2 * Math.PI * f) / sr, k = Math.exp(-w / (2 * q));
    const p = S.rand(-0.6, 0.6), gl = Math.cos(((p + 1) * Math.PI) / 4) * amp, gr = Math.sin(((p + 1) * Math.PI) / 4) * amp;
    let y1 = 0, y2 = 0;
    const c1 = 2 * k * Math.cos(w), c2 = -k * k;
    for (let j = 0; j < len * 3 && i0 + j < n; j++) {
      const x = j < len ? (S.random() * 2 - 1) * (1 - j / len) : 0;
      const y = x + c1 * y1 + c2 * y2;
      y2 = y1; y1 = y;
      L[i0 + j] += y * gl * 0.25; R[i0 + j] += y * gr * 0.25;
    }
  }
  const src = S.buffer(buf, t0);
  const g = S.gain(level * 1.6);
  src.connect(g);
  const pn = S.out(g, bus, pan);
  S.free(src, src, g, pn);
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

/** Short mechanical click: noise tick + inharmonic resonant body (cached, round-robin). */
export function click(S, t, { level = 0.1, freq = 3200, body = 900, q = 3, decay = 0.018, pan = 0, bus = 'sfx' } = {}) {
  const f = Math.round(freq / 100) * 100, b = Math.round(body / 20) * 20, d = Math.round(decay * 1000) / 1000;
  const v = S.robin(`click:${f}:${b}`, 3);
  // body ping + tick partials (inharmonic) as a modal voice; the noise transient is the contact
  const buf = modalBuffer(S, `click:${f}:${b}:${q}:${d}:${v}`, b, [
    [1, 0.5, d * 1.6], [1.73, 0.2, d * 1.1], [f / b, 1, d * 0.7 + 0.002], [(f / b) * 1.41, 0.4, d * 0.5 + 0.001],
  ], { seconds: d * 2 + 0.01, noise: 1.2, attack: 0.0003, vary: 0.5 });
  playBuffer(S, t, buf, { level: level * S.rand(0.85, 1.1), pan, bus, rate: S.rand(0.97, 1.03) });
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

/**
 * Gear ratchet: a run of pawl-on-tooth strikes — inharmonic metal teeth (round-robin),
 * slightly uneven spacing, an accent once per revolution, and the gear's own body
 * ringing underneath.
 */
export function ratchet(S, t0, dur, { level = 0.06, rate = 28, pan = 0, bus = 'sfx', freq = 4200 } = {}) {
  const count = Math.floor(dur * rate);
  const teeth = 8 + Math.floor(S.random() * 5);
  let t = t0;
  for (let i = 0; i < count; i++) {
    const acc = i % teeth === 0 ? 1.35 : 1;
    const v = S.robin(`tooth:${freq}`, 5);
    const f = Math.round(freq / 200) * 200;
    const buf = modalBuffer(S, `tooth:${f}:${v}`, f * 0.37, [
      [1, 0.35, 0.05], [2.32, 0.5, 0.03], [2.7, 1, 0.02], [4.18, 0.6, 0.012], [6.1, 0.3, 0.008], [7.9, 0.2, 0.005],
    ], { seconds: 0.07, noise: 1.4, attack: 0.0002, vary: 0.6 });
    playBuffer(S, t, buf, { level: level * acc * S.rand(0.65, 1.05), pan: pan + S.rand(-0.05, 0.05), bus, rate: S.rand(0.94, 1.06) });
    t += (1 / rate) * S.rand(0.85, 1.15);
  }
  // the gear body: a low metallic ring excited by the run
  const body = modalBuffer(S, `gearbody:${Math.round(freq / 1000)}`, 180 + (freq % 700) / 7, [
    [1, 1, 0.5], [1.51, 0.6, 0.35], [2.47, 0.4, 0.25], [3.3, 0.25, 0.15],
  ], { seconds: 0.6, noise: 0.3, attack: 0.002 });
  playBuffer(S, t0, body, { level: level * 0.5, pan, bus });
}

/**
 * Steam pressure release: a valve "chuff", a hiss that sputters (turbulent, never
 * a steady filter), its falling pitch as pressure drops, and a pressure rumble.
 */
export function steam(S, t, dur, { level = 0.2, pan = 0, bus = 'sfx' } = {}) {
  const end = t + dur + 0.1;
  const n = S.noise('white', t, end, { stereo: true });
  const hp = S.filter('highpass', 1800, 0.7);
  const bp = S.filter('bandpass', 6500, 0.6);
  bp.frequency.setValueAtTime(7500, t);
  bp.frequency.exponentialRampToValueAtTime(2500, t + dur);
  const g = S.gain(0);
  // sputter: turbulent flutter on top of the pressure envelope
  let fl = 1;
  g.gain.setValueCurveAtTime(S.curve(dur + 0.05, 400, (u) => {
    fl = fl * 0.85 + (0.55 + 0.45 * S.random() + (S.random() < 0.03 ? -0.5 : 0)) * 0.15;
    const env = Math.min(1, u / 0.012) * (0.5 + 0.5 * Math.exp(-u / (dur * 0.25))) * Math.min(1, Math.max(0, (dur + 0.05 - u) / (dur * 0.4)));
    return level * env * fl;
  }), t, dur + 0.05);
  n.connect(hp).connect(bp).connect(g);
  const p = S.out(g, bus, pan);
  // pressure rumble in the pipe
  const r = S.noise('brown', t, end);
  const lp = S.filter('lowpass', 160, 0.9);
  const rg = S.gain(0);
  rg.gain.setValueAtTime(0, t);
  rg.gain.linearRampToValueAtTime(level * 0.9, t + 0.03);
  rg.gain.setTargetAtTime(0, t + 0.05, dur * 0.3);
  r.connect(lp).connect(rg);
  const p2 = S.out(rg, bus, pan * 0.5);
  S.free(n, n, hp, bp, g, p, r, lp, rg, p2);
  // valve chuff: a short dull thump at the opening
  if (dur > 0.3) thud(S, t, { level: level * 0.5, f: 95, tone: 700, decay: 0.12, pan, bus });
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

/**
 * Electric arc: a burst of crackle, a modulated arc buzz (irregular AM on a
 * bandpassed square) and a quieter falling sweep for the discharge.
 */
export function zap(S, t, { level = 0.08, pan = 0, bus = 'sfx', from = 5200, to = 180, dur = 0.16 } = {}) {
  const end = t + dur + 0.08;
  const o = S.osc('sawtooth', from, t, end);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const bp = S.filter('bandpass', 2400, 0.8);
  const g = S.gain(0);
  perc(g.gain, t, level * 0.55, dur, 0.001);
  o.connect(bp).connect(g);
  const p = S.out(g, bus, pan);
  // arc buzz: mains-rate square, bandpassed, with a jittery amplitude
  const bz = S.osc('square', S.rand(95, 125), t, end);
  const bb = S.filter('bandpass', S.rand(1500, 2600), 1.2);
  const bg = S.gain(0);
  bg.gain.setValueCurveAtTime(S.curve(dur + 0.06, 500, (u) => level * 0.5 * (S.random() < 0.7 ? S.rand(0.4, 1) : 0.05) * Math.exp(-u / (dur * 0.6))), t, dur + 0.06);
  bz.connect(bb).connect(bg);
  const p2 = S.out(bg, bus, pan);
  S.free(o, o, bp, g, p, bz, bb, bg, p2);
  sparks(S, t, Math.max(0.12, dur * 0.8), { level: level * 1.3, pan, bus, bursts: 2 });
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
  const vdur = dur * 0.45;
  vg.gain.setValueCurveAtTime(S.curve(vdur, 60, (t) => {
    const fade = Math.min(t / vdur, (vdur - t) / 0.05, 1); // rises in, never cut off abruptly
    return level * 0.35 * Math.max(0, fade) * (S.random() < 0.65 ? 1 : 0.1);
  }), t0 + dur * 0.55, vdur);
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
  // doppler: the whole roar is pitched up on approach and drops as it passes
  n.playbackRate.setValueAtTime(1.18, t0);
  n.playbackRate.setValueAtTime(1.18, tPeak - 0.3);
  n.playbackRate.linearRampToValueAtTime(0.84, tPeak + 0.25);
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
  // turbine: two blade-pass tones with a slow irregular speed wobble
  const wob = S.osc('sine', 3.3, t0, t1);
  const wd = S.gain(9);
  wob.connect(wd);
  nodes.push(wob, wd);
  for (const [f, c] of [[1480, -5], [2210, 7]]) {
    const o = S.osc(c < 0 ? 'sawtooth' : 'triangle', f * 1.14, t0, t1);
    o.detune.value = c;
    wd.connect(o.detune);
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
  // crackle: the supersonic "popcorn" of the exhaust, overdriven
  const cr = S.noise('crackle', t0, t1, { rate: 0.55 });
  const hp = S.filter('highpass', 700, 0.7);
  const drive = S.ctx.createWaveShaper();
  drive.curve = S.curve(1, 1024, (u) => Math.tanh(4 * (u * 2 - 1)) * 0.8);
  const cg = S.gain(0);
  env(cg.gain, level * 1.2, 0.2);
  cr.connect(hp).connect(drive).connect(cg);
  S.out(cg, bus, 0.1);
  // roar flutter: the low roar breathes irregularly
  const fl = S.gain(1);
  fl.gain.setValueCurveAtTime(S.curve(dur, 60, () => S.rand(0.75, 1.1)), t0, dur);
  lg.disconnect();
  lg.connect(fl);
  S.out(fl, bus);
  S.free(low, low, lp, lg, mid, bp, mg, cr, hp, drive, cg, fl);
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
  if (level >= 0.12) debris(S, t + 0.01, { level: level * 0.35, pan, bus, size: tone < 1000 ? 1 : 0.6 });
}

/**
 * Debris: small fragments (grit, stone chips, splinters) settling after an impact —
 * sparse resonant grains, each its own pitch and position, thinning out over ~0.6 s.
 * Rendered in JS per round-robin; size 1 = coarse/low, smaller = finer/brighter.
 */
export function debris(S, t, { level = 0.1, pan = 0, bus = 'sfx', size = 1 } = {}) {
  const buf = debrisBuffer(S, size, S.robin(`debris:${size}`, 4));
  playBuffer(S, t, buf, { level, pan, bus, rate: S.rand(0.9, 1.1) });
}

function debrisBuffer(S, size, v) {
  const key = `debris:${size}:${v}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const R0 = S.seeded(key), sr = S.sr, n = Math.ceil(0.9 * sr);
    buf = S.ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const count = 70;
    for (let k = 0; k < count; k++) {
      const u = R0.random() ** 2.2;                      // most fragments land early
      const i0 = Math.floor(u * 0.7 * sr);
      const amp = (1 - u) ** 1.5 * (0.3 + 0.7 * R0.random());
      const f = (600 + R0.random() * 3000) / size, q = 4 + R0.random() * 10;
      const w = (2 * Math.PI * Math.min(f, 9000)) / sr, kk = Math.exp(-w / (2 * q));
      const c1 = 2 * kk * Math.cos(w), c2 = -kk * kk;
      const len = Math.floor(sr * (0.001 + R0.random() * 0.004));
      const p = R0.random() * 1.6 - 0.8, gl = Math.cos(((p + 1) * Math.PI) / 4) * amp, gr = Math.sin(((p + 1) * Math.PI) / 4) * amp;
      let y1 = 0, y2 = 0;
      for (let j = 0; j < len * 6 && i0 + j < n; j++) {
        const x = j < len ? R0.random() * 2 - 1 : 0;
        const y = x + c1 * y1 + c2 * y2;
        y2 = y1; y1 = y;
        L[i0 + j] += y * gl; Rr[i0 + j] += y * gr;
      }
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
    for (let i = 0; i < n; i++) { L[i] /= peak; Rr[i] /= peak; }
    S.cache.set(key, buf);
  }
  return buf;
}

/**
 * Designed trailer impact (the layers that sit on top of the sub boom): a
 * transient crack, inharmonic metal/rock body modes, debris, and a wide low-mid
 * "body" thump. Round-robin; `power` scales everything.
 */
export function impact(S, t, { level = 0.2, pan = 0, bus = 'fx', metal = 0.5 } = {}) {
  const buf = impactBuffer(S, S.robin('impact', 3));
  playBuffer(S, t, buf, { level: level * (0.5 + 0.5 * metal), pan, bus, rate: S.rand(0.94, 1.04) });
  debris(S, t + 0.015, { level: level * 0.45, pan: -pan, bus, size: 1 });
}

function impactBuffer(S, v) {
  const key = `impact:${v}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const R0 = S.seeded(key), sr = S.sr, n = Math.ceil(1.6 * sr);
    buf = S.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      // crack: a very short bright burst (differentiated noise)
      let prev = 0;
      for (let i = 0; i < 0.006 * sr; i++) { const x = R0.random() * 2 - 1; d[i] += (x - prev) * (1 - i / (0.006 * sr)) ** 2 * 0.9; prev = x; }
      // body: low-mid thump (pitch-dropping) + inharmonic rock/metal modes
      let ph = 0;
      for (let i = 0; i < 0.35 * sr; i++) {
        const tt = i / sr;
        ph += (2 * Math.PI * (140 + 180 * Math.exp(-tt / 0.02))) / sr;
        d[i] += Math.sin(ph) * Math.exp(-tt / 0.07) * 0.8;
      }
      for (const [f, a, t60] of [[317, 0.3, 0.5], [523, 0.25, 0.8], [781, 0.22, 1.1], [1187, 0.16, 0.9], [1733, 0.12, 0.7], [2441, 0.08, 0.5]]) {
        const w = (2 * Math.PI * f * (1 + (R0.random() - 0.5) * 0.04)) / sr, k = Math.exp(-6.9 / (t60 * sr));
        let re = 0, im = a * (0.6 + 0.4 * R0.random()) * (c ? 0.9 : 1);
        const cr = k * Math.cos(w), ci = k * Math.sin(w);
        for (let i = 0; i < Math.min(n, t60 * 1.2 * sr); i++) { d[i] += im * 0.5; const r = re * cr - im * ci; im = re * ci + im * cr; re = r; }
      }
    }
    let peak = 0;
    for (let c = 0; c < 2; c++) for (const x of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(x));
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] /= peak; }
    S.cache.set(key, buf);
  }
  return buf;
}

// ------------------------------------------------------------------ the moonshot
// Everything here is heard the way the Apollo audio was: through the hull or over the
// air-to-ground loop — muffled, band-limited, never a "space whoosh".

/**
 * Structural creak (the capsule flexing): stick-slip friction — a buzz whose rate
 * wanders and catches — through two panel resonances, muffled by the hull.
 */
export function creak(S, t0, dur, { level = 0.05, pan = 0, bus = 'sfx', rate = 70, panel = 820 } = {}) {
  const t1 = t0 + dur;
  const walk = wander(S, dur, 200, 0.6, 0.85);
  const o = S.osc('sawtooth', rate, t0, t1 + 0.05);
  o.frequency.setValueCurveAtTime(S.curve(dur, 200, (_, i) => rate * (0.6 + 0.9 * walk[i])), t0, dur);
  const b1 = S.filter('bandpass', panel, 7), b2 = S.filter('bandpass', panel * 2.37, 9);
  const lp = S.filter('lowpass', 2600, 0.7);
  const g = S.gain(0);
  let hold = 1;
  g.gain.setValueCurveAtTime(S.curve(dur, 200, (t, i) => {
    if (S.random() < 0.04) hold = S.rand(0.1, 1);               // the joint catches, then slips
    const e = Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.6;
    return level * e * hold * (0.4 + 0.6 * walk[i]);
  }), t0, dur);
  const mix = S.gain(1);
  o.connect(b1).connect(mix);
  o.connect(b2).connect(mix);
  mix.connect(lp).connect(g);
  const p = S.out(g, bus, pan);
  S.free(o, o, b1, b2, lp, g, mix, p);
}

/** RCS thruster puff heard inside the capsule: a valve click, a dull thump and a short hiss. */
export function thrusterPuff(S, t, { level = 0.06, pan = 0, bus = 'sfx', dur = 0.09 } = {}) {
  click(S, t, { level: level * 0.5, freq: 2400, body: 700, q: 3, decay: 0.012, pan, bus });
  const n = S.noise('white', t, t + dur + 0.08);
  const bp = S.filter('bandpass', S.rand(1500, 2300), 0.8);
  const lp = S.filter('lowpass', 3400, 0.7);
  const g = S.gain(0);
  perc(g.gain, t + 0.004, level, dur, 0.004);
  const o = S.osc('sine', 110, t, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.06);
  const go = S.gain(0);
  perc(go.gain, t, level * 1.4, 0.08, 0.002);
  const mix = S.gain(1);
  n.connect(bp).connect(lp).connect(g).connect(mix);
  o.connect(go).connect(mix);
  const p = S.out(mix, bus, pan);
  S.free(n, n, bp, lp, g, o, go, mix, p);
}

/** Descent engine felt through the structure: a low, breathing rumble with no top end. */
export function descentRumble(S, t0, t1, { level = 0.08, bus = 'sfx', attack = 0.4, release = 0.3 } = {}) {
  const dur = t1 - t0;
  const n = S.noise('brown', t0, t1 + release * 2, { stereo: true });
  const lp = S.filter('lowpass', 150, 0.8);
  lp.frequency.setValueAtTime(110, t0);
  lp.frequency.exponentialRampToValueAtTime(210, t0 + attack);
  lp.frequency.setValueAtTime(210, t1);
  lp.frequency.exponentialRampToValueAtTime(70, t1 + release);      // throttle down / shutdown
  const g = S.gain(0);
  ahr(g.gain, t0, t1, level, attack, release);
  const fl = S.gain(1);                                              // combustion "breathing"
  fl.gain.setValueCurveAtTime(S.curve(dur, 40, () => S.rand(0.8, 1.1)), t0, dur);
  n.connect(lp).connect(g).connect(fl);
  S.out(fl, bus);
  // a faint mid band of the chamber, far away
  const m = S.noise('pink', t0, t1 + release * 2);
  const bp = S.filter('bandpass', 380, 1.6);
  const mg = S.gain(0);
  ahr(mg.gain, t0, t1, level * 0.18, attack, release);
  m.connect(bp).connect(mg);
  const p = S.out(mg, bus, 0.1);
  S.free(n, n, lp, g, fl, m, bp, mg, p);
}

/**
 * Quindar tone: the Apollo air-to-ground keying beep — a pure tone (2525 Hz intro,
 * 2475 Hz outro) of 250 ms, heard through the radio's band-limit.
 */
export function quindar(S, t, { level = 0.012, freq = 2525, dur = 0.25, pan = 0.3, bus = 'sfx' } = {}) {
  const o = S.osc('sine', freq, t, t + dur + 0.02);
  const g = S.gain(0);
  ahr(g.gain, t, t + dur, level, 0.004, 0.008);
  const bp = S.filter('bandpass', 2000, 0.5);
  o.connect(g).connect(bp);
  const p = S.out(bp, bus, pan);
  S.free(o, o, g, bp, p);
}

/**
 * Air-to-ground radio burst: band-limited static with a squelch edge and a clipped,
 * syllabic "voice" underneath (never intelligible — texture, not dialogue).
 */
export function radioBurst(S, t0, dur, { level = 0.03, pan = 0.3, bus = 'sfx', voice = 1 } = {}) {
  const t1 = t0 + dur;
  const n = S.noise('white', t0, t1 + 0.03);
  const hp = S.filter('highpass', 350, 0.7), bp = S.filter('bandpass', 1700, 0.6);
  const g = S.gain(0);
  g.gain.setValueCurveAtTime(S.curve(dur, 300, (t) => {
    const edge = Math.min(1, t / 0.008, (dur - t) / 0.02);
    return level * Math.max(0, edge) * (0.35 + 0.65 * S.random() ** 2);
  }), t0, dur);
  n.connect(hp).connect(bp).connect(g);
  const p1 = S.out(g, bus, pan);
  const v = S.osc('sawtooth', S.rand(110, 140), t0, t1);
  v.frequency.setValueCurveAtTime(S.curve(dur, 30, () => S.rand(105, 150)), t0, dur);
  const f = S.filter('bandpass', 1000, 2.5);
  f.frequency.setValueCurveAtTime(S.curve(dur, 40, () => S.rand(500, 2200)), t0, dur);
  const vg = S.gain(0);
  vg.gain.setValueCurveAtTime(S.curve(dur, 60, (t) => {
    const edge = Math.min(1, t / 0.03, (dur - t) / 0.03);
    return level * 0.5 * voice * Math.max(0, edge) * (S.random() < 0.6 ? 1 : 0.1);
  }), t0, dur);
  v.connect(f).connect(vg);
  const p2 = S.out(vg, bus, pan);
  S.free(n, n, hp, bp, g, p1, v, f, vg, p2);
}

/** A boot pressing into fine regolith: a soft compacting crunch over a muted thud. */
export function crunch(S, t, { level = 0.05, pan = 0, bus = 'sfx' } = {}) {
  const sr = S.sr, dur = 0.26, n = Math.ceil(dur * sr);
  const buf = S.ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let k = 0; k < 260; k++) {
    const u = S.random() ** 1.8;                                  // most grains in the first press
    const i0 = Math.floor(u * 0.8 * n);
    const amp = (1 - u) ** 1.2 * S.random() ** 1.5;
    const f = S.rand(500, 3200), q = S.rand(2, 6);
    const w = (2 * Math.PI * f) / sr, kk = Math.exp(-w / (2 * q));
    const c1 = 2 * kk * Math.cos(w), c2 = -kk * kk;
    const len = Math.floor(sr * S.rand(0.001, 0.005));
    const pp = S.rand(-0.4, 0.4), gl = Math.cos(((pp + 1) * Math.PI) / 4) * amp, gr = Math.sin(((pp + 1) * Math.PI) / 4) * amp;
    let y1 = 0, y2 = 0;
    for (let j = 0; j < len * 4 && i0 + j < n; j++) {
      const x = j < len ? S.random() * 2 - 1 : 0;
      const y = x + c1 * y1 + c2 * y2;
      y2 = y1; y1 = y;
      L[i0 + j] += y * gl * 0.2; R[i0 + j] += y * gr * 0.2;
    }
  }
  const src = S.buffer(buf, t);
  const lp = S.filter('lowpass', 3000, 0.7);
  const g = S.gain(level);
  src.connect(lp).connect(g);
  const pn = S.out(g, bus, pan);
  S.free(src, src, lp, g, pn);
  thud(S, t, { level: level * 1.2, f: 55, tone: 450, decay: 0.25, pan, bus });
}

/** Queue the impact and debris one-shots for idle-time synthesis (see Studio.warm). */
export function warmSfx(S) {
  for (let v = 0; v < 3; v++) S.warm(() => impactBuffer(S, v));
  for (let v = 0; v < 4; v++) for (const size of [1, 0.6]) S.warm(() => debrisBuffer(S, size, v));
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

