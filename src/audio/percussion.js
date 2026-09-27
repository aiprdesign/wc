// Trailer percussion, rendered in JS as cached stereo one-shots.
//
// Each drum sound is synthesised once per variation (round-robin, so repeated hits
// never sound machine-gunned), with a small "room" baked in, then played with a
// single buffer source + gain. A taiko ENSEMBLE hit (big drum + two mid drums a
// few ms apart, spread wide, plus a stick) is one buffer rather than ~30 nodes.

const VARIANTS = 3;

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

/** Add a pitched membrane (pitch drop to f, overtone, lowpassed skin noise). */
function membrane(S, L, R, start, { f, decay, skin, pan = 0, gain = 1 }) {
  const sr = S.sr;
  const n = Math.min(L.length - start, Math.ceil((decay + 0.05) * sr));
  const gl = Math.cos(((pan + 1) * Math.PI) / 4) * gain, gr = Math.sin(((pan + 1) * Math.PI) / 4) * gain;
  const kb = Math.exp(-6.9 / (decay * sr)), ko = Math.exp(-6.9 / (decay * 0.3 * sr)), ks = Math.exp(-6.9 / (0.2 * sr));
  const kp = Math.exp(-1 / (0.03 * sr));
  const a = onePole(700 + f * 4, sr);
  let eb = 1, eo = 0.18, es = skin, sweep = 0.7, ph = 0, po = 0, y = 0;
  for (let i = 0; i < n; i++) {
    const fi = f * (1 + sweep);
    ph += (2 * Math.PI * fi) / sr;
    po += (2 * Math.PI * fi * 2.3) / sr;
    y += a * (S.random() * 2 - 1 - y);
    const att = Math.min(1, i / (0.002 * sr));
    const v = att * (Math.sin(ph) * eb + Math.sin(po) * eo) + y * es * 1.6;
    L[start + i] += v * gl;
    R[start + i] += v * gr;
    eb *= kb; eo *= ko; es *= ks; sweep *= kp;
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

function render(S, key, seconds, room, fill, pan = 0) {
  key += `:${pan}`;
  if (S.cache.has(key)) return S.cache.get(key);
  const buf = S.ctx.createBuffer(2, Math.ceil(seconds * S.sr), S.sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  fill(L, R);
  if (pan) { // equal-power pan baked in (saves a StereoPanner per hit)
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2, gr = Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    for (let i = 0; i < L.length; i++) { L[i] *= gl; R[i] *= gr; }
  }
  if (room > 0) addRoom(L, R, S.sr, room);
  S.cache.set(key, finish(buf));
  return buf;
}

const SOUNDS = {
  taiko: (S, v, size) => render(S, `taiko:${size}:${v}`, 1.9, 0.35, (L, R) => {
    const ms = (x) => Math.floor(x * S.sr);
    membrane(S, L, R, 0, { f: 52 + 6 * (1 - size) + v, decay: 1.3 + 0.5 * size, skin: 0.55 });
    membrane(S, L, R, ms(0.007), { f: 78 + v, decay: 0.8, skin: 0.7, pan: -0.5, gain: 0.55 });
    membrane(S, L, R, ms(0.013), { f: 92 - v, decay: 0.7, skin: 0.7, pan: 0.5, gain: 0.5 });
    if (size >= 1) noiseBurst(S, L, R, ms(0.003), { decay: 0.06, fc: 2600, q: 1.6, pan: 0.15, gain: 0.5 });
  }),
  tom: (S, v, f, pan) => render(S, `tom:${f}:${v}`, 0.75, 0.3, (L, R) => {
    membrane(S, L, R, 0, { f: f + v, decay: 0.55, skin: 0.75 });
  }, pan),
  kick: (S, v) => render(S, `kick:${v}`, 0.8, 0.05, (L, R) => {
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
  snare: (S, v, pan) => render(S, `snare:${v}`, 0.5, 0.4, (L, R) => {
    noiseBurst(S, L, R, 0, { decay: 0.22, fc: 2200 + 150 * v, q: 0.6, gain: 1 });
    const sr = S.sr, n = Math.ceil(0.12 * sr), k = Math.exp(-6.9 / (0.1 * sr));
    let ph = 0, e = 0.6;
    for (let i = 0; i < n; i++) {
      ph += (2 * Math.PI * (170 + 40 * Math.exp(-i / (0.03 * sr)))) / sr;
      const y = Math.sin(ph) * e; L[i] += y; R[i] += y; e *= k;
    }
  }, pan),
  stick: (S, v, pan) => render(S, `stick:${v}`, 0.35, 0.4, (L, R) => {
    noiseBurst(S, L, R, 0, { decay: 0.06, fc: 2400 + 300 * v, q: 1.6 });
    const sr = S.sr, n = Math.ceil(0.06 * sr), k = Math.exp(-6.9 / (0.05 * sr));
    let e = 0.5;
    for (let i = 0; i < n; i++) { const y = Math.sin((2 * Math.PI * 620 * i) / sr) * e; L[i] += y; R[i] += y; e *= k; }
  }, pan),
  hat: (S, v, open, pan) => render(S, `hat:${open}:${v}`, open ? 0.4 : 0.07, 0, (L, R) => {
    noiseBurst(S, L, R, 0, { decay: open ? 0.35 : 0.045, hp: open ? 6500 : 8000, gain: 1 });
  }, pan),
  crash: (S, v) => render(S, `crash:${v}`, 2.4, 0, (L, R) => {
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
  }),
};

// ------------------------------------------------------------------ players

function play(S, t, buf, level, bus) {
  const src = S.buffer(buf, t);
  const g = S.gain(level);
  src.connect(g).connect(S.bus(bus));
  S.free(src, g);
}

// Round-robin variation index (kept on the Studio so every render is identical).
const variant = (S) => { S.rr = ((S.rr ?? -1) + 1) % VARIANTS; return S.rr; };
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
  play(S, t, SOUNDS.hat(S, variant(S), open, q(pan)), level, bus);
}

export function crash(S, t, level = 0.15, { bus = 'drums' } = {}) {
  play(S, t, SOUNDS.crash(S, variant(S) % 2), level, bus);
}
