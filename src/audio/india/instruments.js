// Indian instruments for the Indian film's score, synthesised in JS (no samples):
//
//   sitar     a plucked string (Karplus–Strong) whose bridge is the jawari: the string's speaking
//             length shortens a little with its own displacement, the source of the sitar's buzzing,
//             blooming tone; meend (pitch glides) by changing the delay length while it rings;
//             chikari (the drone strings) and taraf (sympathetic strings tuned to the raga) shimmer
//   tanpura   the drone: four strings (Pa · Sa · Sa · low Sa) plucked in a slow cycle, with an even
//             stronger jawari, rendered once as a cycle and repeated
//   tabla     the dayan (treble drum, tuned to Sa: harmonic overtones from its black syahi patch) and
//             the bayan (bass drum, whose pitch the wrist bends): the bols na, tin, te, ka, ge, dha …
//   bansuri   the bamboo flute: sine + soft harmonics + breath, with glides and vibrato (live nodes)
//   santoor   a hammered dulcimer (paired steel strings, long bright decay)
//   ghanta    a temple bell (inharmonic, beating partials)
//
// Pre-rendered buffers are cached on the Studio (S.cache) and synthesised through S.seeded(key), so a
// render is identical every time. Every time a function takes is STORY time (the Studio's time map
// converts it); buffers are physical, and a phrase's internal timing is converted with S.span().

import { hz, clamp } from '../core.js';
import { modalBuffer, playBuffer } from '../instruments.js';

const TAU = Math.PI * 2;

// Sa = D. The raga material of the score: Asavari (D E F G A B♭ C) over the minor sections, Bilawal
// (D E F♯ G A B C♯) over the major ones.
export const SA = 62;
export const ASAVARI = [0, 2, 3, 5, 7, 8, 10];
export const BILAWAL = [0, 2, 4, 5, 7, 9, 11];

// --------------------------------------------------------------- the plucked string with a jawari

/**
 * Render a plucked string into `d` (Float32Array, mono) from sample `n0`.
 *   path(sec) → frequency in Hz at physical time sec after the pluck (meend)
 *   plucks: [[sec, strength]] re-excitations (krintan / new strokes on the same string)
 *   jawari: amount of the bridge's displacement-dependent shortening (0 = a plain string)
 */
function stringInto(S, d, n0, len, path, { plucks = [[0, 1]], jawari = 0.006, loss = 0.9965, bright = 0.6, tone = 0.5, gain = 1 } = {}) {
  const sr = S.sr;
  const maxN = 4096;
  const buf = new Float32Array(maxN);
  let w = 0, lp = 0, dc = 0, dcIn = 0;
  const pl = plucks.map(([sec, a]) => [Math.floor(sec * sr), a]).sort((a, b) => a[0] - b[0]);
  let pi = 0, exc = 0, excLen = 0, excAmp = 0, excY = 0;
  for (let i = 0; i < len; i++) {
    // excitation: a short, bright noise burst shaped like the mizrab's stroke
    if (pi < pl.length && i === pl[pi][0]) { exc = 0; excAmp = pl[pi][1]; excLen = Math.floor(sr * (0.0025 + 0.002 * (1 - bright))); pi++; }
    let x = 0;
    if (exc < excLen) {
      const u = exc / excLen;
      excY += (0.25 + 0.6 * bright) * ((S.random() * 2 - 1) - excY);
      x = excAmp * excY * Math.sin(Math.PI * u) * 1.6;
      exc++;
    }
    const f = path(i / sr);
    const N = clamp(sr / f, 2, maxN - 2);
    // the jawari: the string wraps onto the curved bridge as it swings, so its speaking length (and
    // with it the pitch) shifts with its displacement — a cascade of high partials, the buzz
    const disp = Math.max(0, lp) * jawari * 60;
    const Nd = N * (1 - Math.min(0.02, disp));
    const r = w - Nd;
    const ri = Math.floor(r), fr = r - ri;
    const a0 = buf[(ri + maxN) % maxN], a1 = buf[(ri + 1 + maxN) % maxN];
    const y = a0 * (1 - fr) + a1 * fr;
    // loss filter: one-zero averaging (brightness) and overall loss per period
    lp = loss * ((1 - tone * 0.5) * y + tone * 0.5 * lp);
    buf[w] = lp + x;
    w = (w + 1) % maxN;
    // DC blocker on the output
    const o = lp - dcIn + 0.995 * dc; dcIn = lp; dc = o;
    d[n0 + i] += o * gain;
  }
}

/** Smooth (cosine) interpolation through [[sec, midi]] points; held beyond the ends. */
function pitchPath(points) {
  return (sec) => {
    if (sec <= points[0][0]) return hz(points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const [t1, m1] = points[i];
      if (sec <= t1) {
        const [t0, m0] = points[i - 1];
        const u = (sec - t0) / Math.max(1e-6, t1 - t0), s = 0.5 - 0.5 * Math.cos(Math.PI * u);
        return hz(m0 + (m1 - m0) * s);
      }
    }
    return hz(points.at(-1)[1]);
  };
}

function normalise(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

function fadeTail(d, sr, sec = 0.08) {
  const n = Math.floor(sec * sr);
  for (let i = 0; i < n && i < d.length; i++) d[d.length - 1 - i] *= i / n;
}

/**
 * A sitar phrase on one string: `notes` = [[storyOffset, midi, kind]] with kind
 *   'p' a new stroke (da/ra), 'k' krintan (a light pull-off/hammer: soft re-excitation),
 *   'm' meend (glide from the previous pitch to this one over `glide` story seconds, no stroke).
 * Rendered as one buffer (cached by its content) and played from story time t.
 */
export function sitar(S, t, notes, { level = 0.2, pan = 0, bus = 'india', glide = 0.18, ring = 2.2, chikari = 0.35, taraf = 0.4 } = {}) {
  const key = `sitar:${notes.map((n) => n.join(',')).join(';')}:${glide}:${ring}:${chikari}:${taraf}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const R = S.seeded(key), sr = R.sr;
    const sec = (st) => R.span(st);                 // story offset → physical seconds
    const last = sec(notes.at(-1)[0]);
    const n = Math.ceil((last + ring) * sr);
    buf = R.ctx.createBuffer(2, n, sr);
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1);
    const d = new Float32Array(n);
    // pitch path and strokes
    const pts = [], plucks = [];
    let prev = notes[0][1];
    for (const [o, m, kind] of notes) {
      const s0 = sec(o);
      if (kind === 'm') { pts.push([s0, prev]); pts.push([s0 + sec(glide), m]); }
      else { pts.push([s0, m]); plucks.push([s0, kind === 'k' ? 0.35 : 1]); }
      prev = m;
    }
    stringInto(R, d, 0, n, pitchPath(pts), { plucks, jawari: 0.007, loss: 0.9975, bright: 0.75, tone: 0.42 });
    // chikari: the high drone strings (Sa'' and Pa') brushed after each stroke
    if (chikari > 0) {
      for (const [o, , kind] of notes) {
        if (kind !== 'p') continue;
        const s0 = sec(o) + 0.045;
        for (const [m, a] of [[SA + 12, 0.5], [SA + 19, 0.35]]) {
          const tmp = new Float32Array(Math.min(n, Math.floor(sr * 0.9)));
          stringInto(R, tmp, 0, tmp.length, () => hz(m), { jawari: 0.004, loss: 0.991, bright: 0.9, tone: 0.3 });
          const at = Math.floor(s0 * sr);
          for (let i = 0; i < tmp.length && at + i < n; i++) d[at + i] += tmp[i] * a * chikari * 0.45;
        }
      }
    }
    normalise(d, 0.8);
    // taraf: sympathetic strings tuned to the raga ring on in sympathy with the played notes
    if (taraf > 0) {
      const tar = [SA, SA + 2, SA + 3, SA + 5, SA + 7, SA + 8, SA + 10, SA + 12, SA + 14, SA + 15].map(hz);
      for (const [o, m, kind] of notes) {
        if (kind === 'k') continue;
        const f = hz(m), at = Math.floor(sec(o) * sr);
        for (const ft of tar) {
          // a sympathetic string answers when one of the played note's harmonics falls near it
          let best = 1;
          for (let h = 1; h <= 6; h++) best = Math.min(best, Math.abs(Math.log2((f * h) / ft)) * 12);
          if (best > 0.35) continue;
          const a = (1 - best / 0.35) * 0.05 * taraf, decay = 1.8, ph = R.rand(0, TAU);
          const wv = TAU * ft / sr, c = Math.exp(-6.9 / (decay * sr));
          let env = 0, g = 1;
          for (let i = 0; at + i < n && g > 1e-4; i++) {
            env = Math.min(1, env + 1 / (0.12 * sr));
            d[at + i] += a * env * g * Math.sin(wv * i + ph);
            g *= c;
          }
        }
      }
    }
    fadeTail(d, sr);
    // a little width: the taraf and body are not a point
    let z = 0;
    for (let i = 0; i < n; i++) { z += 0.3 * (d[i] - z); L[i] = d[i] * 0.95 + z * 0.05; Rr[i] = d[i] * 0.88 + (d[i] - z) * 0.12; }
    S.cache.set(key, buf);
  }
  const src = S.buffer(buf, t);
  const g = S.gain(level);
  src.connect(g);
  const p = S.out(g, bus, pan);
  S.free(src, g, p);
}

// --------------------------------------------------------------- tanpura

/**
 * One tanpura cycle (Pa · Sa · Sa · low Sa), rendered once and repeated from t0 to t1 every
 * `period` physical seconds. Two instruments (left and right, half a cycle apart) make the drone.
 */
export function tanpura(S, t0, t1, { level = 0.07, bus = 'india', pa = SA - 17, period = 4.2, attack = 2, release = 3 } = {}) {
  const key = `tanpura:${pa}:${period}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const R = S.seeded(key), sr = R.sr;
    const seconds = period + 6;
    buf = R.ctx.createBuffer(1, Math.ceil(seconds * sr), sr);
    const d = buf.getChannelData(0);
    const strings = [[0, pa], [period * 0.25, SA - 12], [period * 0.5, SA - 12], [period * 0.75, SA - 24]];
    for (const [s0, m] of strings) {
      const n0 = Math.floor(s0 * sr), len = d.length - n0;
      // a soft cotton-thread jawari: the bloom of high partials swells after the pluck
      stringInto(R, d, n0, len, () => hz(m) * (1 + R.rand(-0.0006, 0.0006)), { jawari: 0.016, loss: 0.99935, bright: 0.35, tone: 0.55, gain: m < SA - 18 ? 1.25 : 1 });
    }
    normalise(d, 0.8);
    fadeTail(d, sr, 1.5);
    S.cache.set(key, buf);
  }
  const span = buf.duration;   // physical
  for (const [pan, off, det] of [[-0.55, 0, 1], [0.55, 0.5, 1.0007]]) {
    const out = S.gain(0);
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(level, t0 + attack);
    out.gain.setValueAtTime(level, Math.max(t0 + attack, t1 - release));
    out.gain.linearRampToValueAtTime(0, t1);
    const p = S.out(out, bus, pan);
    // the cycles (physical period) laid on the story clock
    const stp = S.phys(period);
    for (let t = t0 + off * stp; t < t1; t += stp) {
      S.at(t - 0.05, () => {
        const src = S.buffer(buf, t, det);
        src.connect(out);
        S.free(src);
      });
    }
    out._end = S.T(t1) + span; p._end = out._end;
    S.free(out, p);
  }
}

// --------------------------------------------------------------- tabla

const TABLA_SA = hz(SA);   // the dayan is tuned to Sa (D4)

function drumInto(S, d, n0, { f0, f1 = f0, glide = 0.05, modes, noise = 0, noiseHz = 2000, gain = 1 }) {
  const sr = S.sr, n = d.length;
  for (const [ratio, amp, t60] of modes) {
    let ph = S.rand(0, TAU);
    const c = Math.exp(-6.9 / (t60 * sr));
    let g = amp;
    const len = Math.min(n - n0, Math.ceil(t60 * 1.2 * sr));
    for (let i = 0; i < len; i++) {
      const u = Math.min(1, i / (glide * sr)), f = (f0 + (f1 - f0) * (1 - (1 - u) ** 2)) * ratio;
      ph += TAU * f / sr;
      d[n0 + i] += gain * g * Math.sin(ph);
      g *= c;
    }
  }
  if (noise > 0) {   // the finger's slap on the skin
    const m = Math.floor(0.012 * sr);
    let y = 0, y2 = 0;
    const a = 1 - Math.exp(-TAU * noiseHz / sr);
    for (let i = 0; i < m && n0 + i < n; i++) {
      y += a * ((S.random() * 2 - 1) - y); y2 += a * (y - y2);
      d[n0 + i] += gain * noise * (y - y2 * 0.5) * (1 - i / m) ** 3;
    }
  }
}

// dayan strokes: the syahi gives a harmonic series (1, 2, 3, 4, 5 × f)
const DAYAN = {
  na:  (S, d) => drumInto(S, d, 0, { f0: TABLA_SA, modes: [[1, 0.55, 0.55], [2, 0.75, 0.42], [3, 0.5, 0.32], [4, 0.32, 0.24], [5, 0.2, 0.18], [6.3, 0.08, 0.06]], noise: 0.5, noiseHz: 3800 }),
  tin: (S, d) => drumInto(S, d, 0, { f0: TABLA_SA, modes: [[1, 1, 0.85], [2, 0.28, 0.4], [3, 0.12, 0.25]], noise: 0.18, noiseHz: 2500 }),
  te:  (S, d) => drumInto(S, d, 0, { f0: TABLA_SA * 1.02, modes: [[1, 0.6, 0.05], [2.3, 0.25, 0.03]], noise: 0.75, noiseHz: 1800 }),
  re:  (S, d) => drumInto(S, d, 0, { f0: TABLA_SA * 0.99, modes: [[1, 0.45, 0.04], [2.1, 0.2, 0.025]], noise: 0.6, noiseHz: 1500 }),
};
// bayan strokes: ge rings with the wrist's pitch bend (a slide up), ka is a flat closed slap
const BAYAN = {
  ge:  (S, d, bend = 1) => drumInto(S, d, 0, { f0: 92, f1: 92 * (1 + 0.22 * bend), glide: 0.18, modes: [[1, 1, 0.9], [1.98, 0.3, 0.35], [2.9, 0.08, 0.18]], noise: 0.3, noiseHz: 900, gain: 1.2 }),
  ka:  (S, d) => drumInto(S, d, 0, { f0: 120, modes: [[1, 0.25, 0.05]], noise: 0.9, noiseHz: 700 }),
};
// bols: a dayan stroke, a bayan stroke, or both (dha = na + ge, dhin = tin + ge)
const BOLS = {
  na: ['na', null], ta: ['na', null], tin: ['tin', null], tun: ['tin', null], te: ['te', null], ti: ['te', null], re: ['re', null],
  ge: [null, 'ge'], ghe: [null, 'ge'], ka: [null, 'ka'], ke: [null, 'ka'],
  dha: ['na', 'ge'], dhin: ['tin', 'ge'], dhi: ['tin', 'ge'],
};

function bolBuffer(S0, bol, v) {
  const key = `tabla:${bol}:${v}`;
  if (S0.cache.has(key)) return S0.cache.get(key);
  const S = S0.seeded(key), sr = S.sr;
  const [r, l] = BOLS[bol];
  const buf = S.ctx.createBuffer(2, Math.ceil(1.3 * sr), sr);
  const dl = new Float32Array(buf.length), dr = new Float32Array(buf.length);
  if (r) DAYAN[r](S, dr);
  if (l) BAYAN[l](S, dl, S.rand(0.7, 1.2));
  // the dayan sits a little right of centre, the bayan a little left (as the player sees them)
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let m = 0;
  for (let i = 0; i < buf.length; i++) { L[i] = dl[i] * 0.9 + dr[i] * 0.55; R[i] = dl[i] * 0.55 + dr[i] * 0.9; m = Math.max(m, Math.abs(L[i]), Math.abs(R[i])); }
  if (m > 0) for (let i = 0; i < buf.length; i++) { L[i] /= m; R[i] /= m; }
  // a small wooden room
  const dly = Math.floor(0.011 * sr), dly2 = Math.floor(0.017 * sr);
  for (let i = buf.length - 1; i >= dly2; i--) { L[i] += 0.16 * R[i - dly] + 0.08 * L[i - dly2]; R[i] += 0.16 * L[i - dly] + 0.08 * R[i - dly2]; }
  S0.cache.set(key, buf);
  return buf;
}

/** One tabla bol at story time t. */
export function tabla(S, t, bol, { level = 0.25, bus = 'indiaPerc' } = {}) {
  if (!BOLS[bol]) return;
  const v = S.robin(`tabla:${bol}`, 3);
  const src = S.buffer(bolBuffer(S, bol, v), S.human(t, 6), 1 + (S.random() - 0.5) * 0.01);
  const g = S.gain(level * (0.88 + 0.2 * S.random()));
  src.connect(g).connect(S.bus(bus));
  S.free(src, g);
}

/** Pre-render the tabla's strokes on the main thread while the renderer works. */
export function warmTabla(S) {
  for (const bol of Object.keys(BOLS)) for (let v = 0; v < 3; v++) S.warm(() => bolBuffer(S, bol, v));
}

// --------------------------------------------------------------- bansuri

/**
 * A bansuri phrase: one breath through `notes` = [[storyOffset, midi]] (each note glides into the
 * next), from story time t to t + dur. Live nodes: a sine with soft 2nd/3rd harmonics, breath
 * noise around the 2nd harmonic, vibrato that blooms on held notes.
 */
export function bansuri(S, t, notes, dur, { level = 0.06, pan = 0, bus = 'india', vibrato = 0.012, breath = 0.35, slide = 0.05 } = {}) {
  const t1 = t + dur;
  const out = S.gain(0);
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(level, t + 0.08);
  out.gain.setValueAtTime(level, t1 - 0.25);
  out.gain.linearRampToValueAtTime(0, t1);
  const p = S.out(out, bus, pan);
  const parts = [];
  const tone = S.filter('lowpass', 3800, 0.5);
  tone.connect(out);
  for (const [h, a, type] of [[1, 1, 'sine'], [2, 0.16, 'sine'], [3, 0.06, 'triangle']]) {
    const o = S.osc(type, hz(notes[0][1]) * h, t, t1 + 0.05);
    for (let i = 1; i < notes.length; i++) {
      const at = t + notes[i][0];
      o.frequency.setValueAtTime(hz(notes[i - 1][1]) * h, Math.max(t, at - slide));
      o.frequency.exponentialRampToValueAtTime(hz(notes[i][1]) * h, at);
    }
    const g = S.gain(a);
    o.connect(g).connect(tone);
    parts.push(o, g);
    // vibrato: a slow LFO on the pitch, deeper on long notes
    const lfo = S.osc('sine', 5.2, t, t1 + 0.05);
    const depth = S.gain(0);
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(hz(notes[0][1]) * h * vibrato, t + Math.min(0.6, dur * 0.5));
    lfo.connect(depth).connect(o.frequency);
    parts.push(lfo, depth);
  }
  // breath: band-passed noise riding the tone
  const br = S.noise('pink', t, t1 + 0.05);
  const bp = S.filter('bandpass', hz(notes[0][1]) * 2, 2.2);
  for (const [off, m] of notes) bp.frequency.setValueAtTime(hz(m) * 2, t + off);
  const bg = S.gain(breath * 0.35);
  br.connect(bp).connect(bg).connect(tone);
  parts.push(br, bp, bg, tone);
  S.free(out, p, ...parts);
}

// --------------------------------------------------------------- santoor and ghanta

/** Santoor: a hammered pair of steel strings (bright, long, slightly beating). */
export function santoor(S, t, midi, { level = 0.07, pan = 0, bus = 'india' } = {}) {
  t = S.human(t, 8);
  const v = S.robin(`santoor:${midi}`, 3);
  const f0 = hz(midi);
  const T = clamp(3.2 * Math.sqrt(330 / f0), 1.2, 4.5);
  const modes = [];
  for (let k = 1; k <= 12; k++) {
    const ratio = k * Math.sqrt(1 + 0.00035 * k * k);
    const amp = Math.abs(Math.sin(Math.PI * k * 0.13)) / k ** 0.9;
    modes.push([ratio, amp, T / (1 + 0.4 * (k - 1))]);
    modes.push([ratio * 1.0016, amp * 0.7, T / (1 + 0.4 * (k - 1))]);   // the second string of the pair
  }
  const buf = modalBuffer(S, `santoor:${midi}:${v}`, f0, modes, { seconds: T, noise: 0.35, attack: 0.001, vary: 0.4 });
  return playBuffer(S, t, buf, { level: level * S.rand(0.85, 1.1), pan, bus });
}

/** A run of santoor strokes up (or down) the raga: a glissando from `from` to `to` (midi). */
export function santoorRun(S, t, from, to, dur, { scale = ASAVARI, level = 0.05, pan = 0, bus = 'india' } = {}) {
  const notes = [];
  const dir = to >= from ? 1 : -1;
  for (let m = from; dir > 0 ? m <= to : m >= to; m += dir) if (scale.includes(((m - SA) % 12 + 12) % 12)) notes.push(m);
  notes.forEach((m, i) => santoor(S, t + (i / Math.max(1, notes.length - 1)) * dur, m, { level: level * (0.75 + 0.25 * i / notes.length), pan: pan + (i / notes.length - 0.5) * 0.6 * dir, bus }));
}

/** Ghanta: a bronze temple bell (hum, prime, minor third, fifth … with beating pairs). */
export function ghanta(S, t, midi = 69, { level = 0.06, pan = 0, bus = 'indiaFar', decay = 5 } = {}) {
  const f0 = hz(midi);
  const modes = [];
  for (const [r, a, k] of [[0.5, 0.5, 1.3], [1, 1, 1], [1.19, 0.55, 0.8], [1.5, 0.4, 0.7], [2, 0.5, 0.6], [2.5, 0.2, 0.45], [2.66, 0.25, 0.4], [3.01, 0.15, 0.35], [4.2, 0.08, 0.25]]) {
    modes.push([r, a, decay * k]);
    modes.push([r * 1.0021, a * 0.6, decay * k * 0.9]);
  }
  const buf = modalBuffer(S, `ghanta:${midi}:${decay}`, f0, modes, { seconds: decay * 1.3, noise: 0.25, attack: 0.001 });
  return playBuffer(S, t, buf, { level, pan, bus });
}

/** Chikari: the sitar's high drone strings brushed alone (the 'ra' strokes of a jhala). */
export function chik(S, t, { level = 0.08, pan = 0.1, bus = 'india' } = {}) {
  const v = S.robin('chik', 3), key = `chik:${v}`;
  let buf = S.cache.get(key);
  if (!buf) {
    const R = S.seeded(key), sr = R.sr;
    buf = R.ctx.createBuffer(1, Math.ceil(0.9 * sr), sr);
    const d = buf.getChannelData(0);
    for (const [m, a, off] of [[SA + 12, 1, 0], [SA + 19, 0.7, 0.006 + 0.004 * v], [SA + 24, 0.45, 0.011]]) {
      const tmp = new Float32Array(d.length);
      stringInto(R, tmp, Math.floor(off * sr), tmp.length - Math.floor(off * sr), () => hz(m), { jawari: 0.005, loss: 0.993, bright: 0.85, tone: 0.3 });
      for (let i = 0; i < d.length; i++) d[i] += tmp[i] * a;
    }
    normalise(d, 0.8); fadeTail(d, sr, 0.15);
    S.cache.set(key, buf);
  }
  return playBuffer(S, S.human(t, 5), buf, { level: level * S.rand(0.85, 1.1), pan, bus });
}
