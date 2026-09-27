// Trailer percussion, rendered in JS as cached stereo one-shots.
//
// Each drum sound is synthesised once per variation (round-robin, so repeated hits
// never sound machine-gunned), with a small "room" baked in, then played with a
// single buffer source + gain. A taiko ENSEMBLE hit (big drum + two mid drums a
// few ms apart, spread wide, plus a stick) is one buffer rather than ~30 nodes.
//
// v4 realism: membranes are modelled a little more physically — tension
// modulation (pitch follows amplitude, so loud hits start sharp and sag), the
// inharmonic circular-membrane modes (1, 1.59, 2.14, 2.30, 2.65), a skin slap and
// shell resonance; ensemble hits are several drummers with random flams and
// positions; every one-shot gets stage early reflections before its room; and
// every hit is played with its own small level / pitch deviation, so no two hits
// in a pattern are ever identical. Timing stays locked to the grid.

const VARIANTS = 4;

// --------------------------------------------------------------- tiny DSP

/** One-pole lowpass coefficient for cutoff fc. */
const onePole = (fc, sr) => 1 - Math.exp((-2 * Math.PI * fc) / sr);

/** RBJ band-pass biquad, processed in place. */
function bandpass(d, sr, fc, q) {
  const w = (2 * Math.PI * fc) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    d[i] = y;
  }
}

/**
 * Small stereo room baked into a one-shot: Schroeder-style parallel combs and
 * series allpasses per channel (different lengths left/right for width).
 */
function addRoom(L, R, sr, wet, size = 1) {
  const combsL = [1116, 1188, 1277, 1356], combsR = [1139, 1211, 1300, 1379];
  const aps = [556, 441];
  const run = (src, out, combs, spread) => {
    const n = src.length;
    const acc = new Float32Array(n);
    for (const c of combs) {
      const len = Math.round(((c + spread) * size * sr) / 44100);
      const buf = new Float32Array(len);
      let p = 0, lp = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[p];
        lp = y * 0.6 + lp * 0.4;                 // damping
        buf[p] = src[i] * 0.3 + lp * 0.72;       // feedback
        acc[i] += y;
        if (++p >= len) p = 0;
      }
    }
    for (const a of aps) {
      const len = Math.round(((a + spread) * sr) / 44100);
      const buf = new Float32Array(len);
      let p = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[p];
        const y = -acc[i] + b;
        buf[p] = acc[i] + b * 0.5;
        acc[i] = y;
        if (++p >= len) p = 0;
      }
    }
    for (let i = 0; i < n; i++) out[i] += acc[i] * wet * 0.25;
  };
  const dryL = L.slice(), dryR = R.slice();
  run(dryL, L, combsL, 0);
  run(dryR, R, combsR, 23);
}

function finish(buf) {
  // fade the tail and normalise the peak to 1
  let peak = 0;
  const n = buf.length, fade = Math.floor(buf.sampleRate * 0.03);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = n - fade; i < n; i++) d[i] *= (n - i) / fade;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] /= peak;
  }
  return buf;
}

// ------------------------------------------------------------- generators

/**
 * Add a pitched membrane: tension-modulated fundamental (pitch drop that follows the
 * amplitude), inharmonic circular modes, lowpassed skin slap.
 */
function membrane(S, L, R, start, { f, decay, skin, pan = 0, gain = 1, drop = 0.7 }) {
  const sr = S.sr;
  const n = Math.min(L.length - start, Math.ceil((decay + 0.05) * sr));
  if (n <= 0) return;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain, gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  const kb = Math.exp(-6.9 / (decay * sr)), ks = Math.exp(-6.9 / (0.2 * sr));
  const kp = Math.exp(-1 / (0.03 * sr));
  // circular membrane modes [ratio, amp, decay factor]
  const modes = [[1.59, 0.22, 0.35], [2.14, 0.14, 0.25], [2.3, 0.1, 0.2], [2.65, 0.07, 0.15]].map(([r, a, d]) => ({
    r: r * S.rand(0.98, 1.02), a: a * S.rand(0.7, 1.3), k: Math.exp(-6.9 / (decay * d * sr)), e: 1, ph: S.rand(0, 6.28),
  }));
  const a = onePole(700 + f * 4, sr);
  const modeLen = Math.min(n, Math.ceil(decay * 0.35 * sr)); // upper modes die fast
  let eb = 1, es = skin, sweep = drop, ph = 0, y = 0;
  for (let i = 0; i < n; i++) {
    // tension modulation: pitch rises with displacement (amplitude), plus the stick sweep
    const fi = f * (1 + sweep + 0.12 * eb);
    ph += (2 * Math.PI * fi) / sr;
    y += a * (S.random() * 2 - 1 - y);
    const att = Math.min(1, i / (0.0015 * sr));
    let v = Math.sin(ph) * eb;
    if (i < modeLen) for (const m of modes) { v += Math.sin(ph * m.r + m.ph) * m.a * m.e; m.e *= m.k; }
    v = att * v + y * es * 1.6;
    L[start + i] += v * gl;
    R[start + i] += v * gr;
    eb *= kb; es *= ks; sweep *= kp;
  }
}

/** Stage early reflections: a few sparse, filtered, decorrelated taps (floor, walls, back wall). */
function earlyReflections(S, L, R, amount = 0.35) {
  const sr = S.sr, n = L.length;
  const dryL = L.slice(), dryR = R.slice();
  const taps = [[0.0071, 0.8], [0.0113, 0.65], [0.0167, 0.55], [0.0239, 0.45], [0.0311, 0.35], [0.0433, 0.28]];
  for (const [dt, g] of taps) {
    for (const [src, out, side] of [[dryL, L, 0], [dryR, R, 1]]) {
      const d = Math.floor((dt * (side ? S.rand(0.85, 1.2) : S.rand(0.85, 1.2))) * sr);
      const k = amount * g * (S.random() < 0.5 ? 1 : -1) * 0.5;
      const cross = side ? dryL : dryR; // reflections arrive from both sides
      const c = onePole(5000 - dt * 60000, sr);
      let lp = 0;
      for (let i = d; i < n; i++) { lp += c * ((src[i - d] + cross[i - d] * 0.6) - lp); out[i] += lp * k; }
    }
  }
}

/** Add a bandpassed noise burst (stick, snare wires, hat) with exponential decay. */
function noiseBurst(S, L, R, start, { decay, fc, q, pan = 0, gain = 1, hp = 0 }) {
  const sr = S.sr;
  const n = Math.min(L.length - start, Math.ceil((decay + 0.02) * sr));
  const d = new Float32Array(n);
  const k = Math.exp(-6.9 / (decay * sr));
  let e = 1;
  for (let i = 0; i < n; i++) { d[i] = (S.random() * 2 - 1) * e * Math.min(1, i / (0.0005 * sr)); e *= k; }
  if (fc) bandpass(d, sr, fc, q);
  if (hp) { // two one-pole highpasses
    const a = onePole(hp, sr);
    let l1 = 0, l2 = 0;
    for (let i = 0; i < n; i++) { l1 += a * (d[i] - l1); l2 += a * (l1 - l2); d[i] -= l2; }
  }
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain, gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  for (let i = 0; i < n; i++) { L[start + i] += d[i] * gl; R[start + i] += d[i] * gr; }
}

function render(S0, key, seconds, room, fill, pan = 0) {
  const pkey = `${key}:${pan}`;
  if (S0.cache.has(pkey)) return S0.cache.get(pkey);
  // synthesise the centred sound once; panned versions are scaled copies
  let base = S0.cache.get(`${key}:0`);
  const S = S0.seeded(key); // deterministic whoever renders it first
  if (!base) {
    base = S.ctx.createBuffer(2, Math.ceil(seconds * S.sr), S.sr);
    const L = base.getChannelData(0), R = base.getChannelData(1);
    fill(L, R, S);
    if (room > 0) { earlyReflections(S, L, R, room); addRoom(L, R, S.sr, room); }
    finish(base);
    S.cache.set(`${key}:0`, base);
  }
  if (!pan) return base;
  // equal-power pan baked in (saves a StereoPanner per hit)
  const buf = S.ctx.createBuffer(2, base.length, S.sr);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
  const bl = base.getChannelData(0), br = base.getChannelData(1), L = buf.getChannelData(0), R = buf.getChannelData(1);
  for (let i = 0; i < L.length; i++) { L[i] = bl[i] * gl; R[i] = br[i] * gr; }
  S.cache.set(pkey, buf);
  return buf;
}

const SOUNDS = {
  taiko: (S, v, size) => render(S, `taiko:${size}:${v}`, 1.9, 0.35, (L, R, S) => {
    const ms = (x) => Math.max(0, Math.floor(x * S.sr));
    // an ensemble: o-daiko + three shime/nagado drummers, never exactly together
    membrane(S, L, R, 0, { f: (52 + 6 * (1 - size)) * S.rand(0.97, 1.03), decay: (1.3 + 0.5 * size) * S.rand(0.9, 1.1), skin: S.rand(0.45, 0.65), drop: S.rand(0.5, 0.9) });
    membrane(S, L, R, ms(S.rand(0.003, 0.012)), { f: 78 * S.rand(0.96, 1.04), decay: 0.8, skin: 0.7, pan: S.rand(-0.7, -0.3), gain: 0.5 });
    membrane(S, L, R, ms(S.rand(0.008, 0.02)), { f: 92 * S.rand(0.96, 1.04), decay: 0.7, skin: 0.7, pan: S.rand(0.3, 0.7), gain: 0.45 });
    if (size >= 1) {
      membrane(S, L, R, ms(S.rand(0.012, 0.026)), { f: 66 * S.rand(0.96, 1.04), decay: 1.0, skin: 0.6, pan: S.rand(-0.2, 0.2), gain: 0.35 });
      noiseBurst(S, L, R, ms(0.003), { decay: 0.06, fc: 2600 * S.rand(0.85, 1.15), q: 1.6, pan: 0.15, gain: 0.5 });
      noiseBurst(S, L, R, ms(S.rand(0.01, 0.02)), { decay: 0.04, fc: 3200 * S.rand(0.85, 1.15), q: 1.8, pan: -0.3, gain: 0.25 });
    }
  }),
  tom: (S, v, f, pan) => render(S, `tom:${f}:${v}`, 0.75, 0.3, (L, R, S) => {
    membrane(S, L, R, 0, { f: f * S.rand(0.97, 1.03), decay: 0.55 * S.rand(0.85, 1.15), skin: S.rand(0.6, 0.85) });
    noiseBurst(S, L, R, 0, { decay: 0.02, fc: 1800 * S.rand(0.8, 1.2), q: 1.2, gain: 0.25 }); // stick
  }, pan),
  kick: (S, v) => render(S, `kick:${v}`, 0.8, 0.05, (L, R, S) => {
    const sr = S.sr, n = Math.ceil(0.62 * sr), k = Math.exp(-6.9 / (0.55 * sr));
    let ph = 0, e = 1;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = 44 + 106 * Math.exp(-t / 0.035) + 22 * Math.exp(-t / 0.12);
      ph += (2 * Math.PI * f) / sr;
      const y = Math.sin(ph) * e * Math.min(1, i / (0.002 * sr));
      L[i] += y; R[i] += y; e *= k;
    }
    noiseBurst(S, L, R, 0, { decay: 0.02, hp: 2500, gain: 0.5 + 0.1 * v });
  }),
  snare: (S, v, pan) => render(S, `snare:${v}`, 0.5, 0.4, (L, R, S) => {
    noiseBurst(S, L, R, 0, { decay: 0.22 * S.rand(0.85, 1.15), fc: 2200 * S.rand(0.9, 1.1), q: 0.6, gain: 1 });
    noiseBurst(S, L, R, Math.floor(0.004 * S.sr), { decay: 0.12, fc: 5500 * S.rand(0.9, 1.1), q: 1.2, gain: 0.35 }); // wires
    const sr = S.sr, n = Math.ceil(0.12 * sr), k = Math.exp(-6.9 / (0.1 * sr));
    let ph = 0, e = 0.6;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * (170 * (1 + 0.01 * v) + 40 * Math.exp(-i / (0.03 * sr)))) / sr;
      const y = Math.sin(ph) * e; L[i] += y; R[i] += y; e *= k;
    }
  }, pan),
  stick: (S, v, pan) => render(S, `stick:${v}`, 0.35, 0.4, (L, R, S) => {
    noiseBurst(S, L, R, 0, { decay: 0.06, fc: 2400 + 300 * v, q: 1.6 });
    const sr = S.sr, n = Math.ceil(0.06 * sr), k = Math.exp(-6.9 / (0.05 * sr));
    let e = 0.5;
    for (let i = 0; i < n; i++) { const y = Math.sin((2 * Math.PI * 620 * i) / sr) * e; L[i] += y; R[i] += y; e *= k; }
  }, pan),
  hat: (S, v, open, pan) => render(S, `hat:${open}:${v}`, open ? 0.45 : 0.08, 0, (L, R, S) => {
    // 808-style metallic cluster (six inharmonic square waves) under the noise
    const sr = S.sr, n = L.length, dec = open ? 0.35 : 0.045;
    const k = Math.exp(-6.9 / (dec * S.rand(0.85, 1.15) * sr));
    const fr = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 2.2 * S.rand(0.99, 1.01));
    const ph = fr.map(() => S.random());
    const m = new Float32Array(n);
    let e = 1;
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let j = 0; j < 6; j++) { ph[j] += fr[j] / sr; x += (ph[j] % 1) < 0.5 ? 1 : -1; }
      m[i] = x * e * 0.12 * Math.min(1, i / (0.0004 * sr));
      e *= k;
    }
    // highpass the cluster (two one-poles)
    const a = onePole(7000, sr);
    let l1 = 0, l2 = 0;
    for (let i = 0; i < n; i++) { l1 += a * (m[i] - l1); l2 += a * (l1 - l2); const y = m[i] - l2; L[i] += y; R[i] += y * 0.9; }
    noiseBurst(S, L, R, 0, { decay: dec, hp: open ? 6500 : 8000, gain: 0.8 });
  }, pan),
  crash: (S, v) => render(S, `crash:${v}`, 2.4, 0, (L, R, S) => {
    const sr = S.sr, n = L.length, k = Math.exp(-6.9 / (2.6 * sr)), a = onePole(4200, sr);
    let e = 1, lL = 0, lR = 0, l2L = 0, l2R = 0;
    for (let i = 0; i < n; i++) {
      const xl = S.random() * 2 - 1, xr = S.random() * 2 - 1;
      lL += a * (xl - lL); l2L += a * (lL - l2L);
      lR += a * (xr - lR); l2R += a * (lR - l2R);
      const att = Math.min(1, i / (0.003 * sr));
      L[i] = (xl - l2L) * e * att; R[i] = (xr - l2R) * e * att;
      e *= k;
    }
    // shimmer: bands of cymbal modes that bloom a moment after the strike
    for (const [fc, q, g] of [[3100, 6, 0.5], [4700, 7, 0.4], [6900, 8, 0.35], [9400, 8, 0.25]]) {
      const bl = new Float32Array(n), br = new Float32Array(n);
      for (let i = 0; i < n; i++) { const env = Math.min(1, i / (0.08 * sr)) * Math.exp(-i / (1.1 * sr)); bl[i] = (S.random() * 2 - 1) * env; br[i] = (S.random() * 2 - 1) * env; }
      bandpass(bl, sr, fc * S.rand(0.95, 1.05), q); bandpass(br, sr, fc * S.rand(0.95, 1.05), q);
      for (let i = 0; i < n; i++) { L[i] += bl[i] * g * 2; R[i] += br[i] * g * 2; }
    }
  }),
};

// ------------------------------------------------------------------ players

function play(S, t, buf, level, bus, detune = 0.012) {
  // every hit a touch different in strength and tuning (never a machine gun)
  const src = S.buffer(buf, t, 1 + (S.random() - 0.5) * 2 * detune);
  const g = S.gain(level * (0.9 + 0.18 * S.random()));
  src.connect(g).connect(S.bus(bus));
  S.free(src, g);
}

// Round-robin variation index (kept on the Studio so every render is identical).
const variant = (S) => { S.percRR = ((S.percRR ?? -1) + 1 + (S.random() < 0.35 ? 1 : 0)) % VARIANTS; return S.percRR; };
const q = (pan) => Math.round(pan * 10) / 10; // quantised pan for the cache

/** Taiko ensemble hit. size 1 = full (with stick), 0.6 = lighter. */
export function taiko(S, t, level = 0.6, { size = 1, bus = 'perc' } = {}) {
  play(S, t, SOUNDS.taiko(S, variant(S), size >= 1 ? 1 : 0.6), level * 1.1, bus);
}

/** Low / mid tom (f in Hz, quantised so the cache stays small). */
export function tom(S, t, level = 0.3, { f = 110, pan = 0, bus = 'perc' } = {}) {
  play(S, t, SOUNDS.tom(S, variant(S), Math.round(f / 8) * 8, q(pan)), level, bus);
}

export function kick(S, t, level = 0.8, { bus = 'drums' } = {}) {
  play(S, t, SOUNDS.kick(S, variant(S)), level, bus);
}

export function snare(S, t, level = 0.3, { pan = 0, bus = 'perc' } = {}) {
  play(S, t, SOUNDS.snare(S, variant(S), q(pan)), level * 0.8, bus);
}

export function stick(S, t, level = 0.2, { pan = 0.15, bus = 'perc' } = {}) {
  play(S, t, SOUNDS.stick(S, variant(S), q(pan)), level, bus);
}

export function hat(S, t, level = 0.1, { open = false, pan = 0.3, bus = 'drums' } = {}) {
  play(S, S.human(t, 4, true), SOUNDS.hat(S, variant(S), open, q(pan)), level, bus, 0.02);
}

export function crash(S, t, level = 0.15, { bus = 'drums' } = {}) {
  play(S, t, SOUNDS.crash(S, variant(S) % 2), level, bus);
}

/** Queue every drum one-shot for idle-time synthesis (see Studio.warm). */
export function warmPercussion(S) {
  for (let v = 0; v < VARIANTS; v++) {
    for (const size of [1, 0.6]) S.warm(() => SOUNDS.taiko(S, v, size));
    for (const f of [88, 96, 128]) S.warm(() => SOUNDS.tom(S, v, f, 0));
    S.warm(() => SOUNDS.kick(S, v));
    S.warm(() => SOUNDS.snare(S, v, 0));
    S.warm(() => SOUNDS.stick(S, v, 0));
    S.warm(() => SOUNDS.hat(S, v, false, 0));
    S.warm(() => SOUNDS.hat(S, v, true, 0));
    if (v < 2) S.warm(() => SOUNDS.crash(S, v));
  }
}
