// Offline mastering helpers that run on the rendered AudioBuffer.

const peakOf = (L, R, i) => Math.max(Math.abs(L[i]), Math.abs(R[i]));

/** Multiply the whole buffer by a constant (in place). */
export function applyGain(buffer, gain) {
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
}

/** RMS (linear) of the stereo buffer between two times. */
export function rmsBetween(buffer, t0, t1) {
  const sr = buffer.sampleRate;
  const a = Math.max(0, Math.floor(t0 * sr));
  const b = Math.min(buffer.length, Math.floor(t1 * sr));
  let e = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = a; i < b; i++) e += d[i] * d[i];
  }
  return Math.sqrt(e / Math.max(1, (b - a) * buffer.numberOfChannels));
}

/**
 * Transparent look-ahead brickwall limiter (in place).
 * Gain = moving average of the look-ahead minimum of the required gain, which
 * guarantees the ceiling is never exceeded, followed by a smooth release.
 */
export function limit(buffer, { gain = 1, ceiling = 0.891, lookahead = 0.004, release = 0.12 } = {}) {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const la = Math.max(1, Math.round(lookahead * sr));

  // Required gain per sample.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = peakOf(L, R, i) * gain;
    need[i] = p > ceiling ? ceiling / p : 1;
  }

  // Forward-looking sliding minimum over [i, i + la] (monotonic deque).
  const minAhead = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[dq[tail - 1]] >= need[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + la) head++;
    minAhead[i] = need[dq[head]];
  }

  // Moving average over the previous la + 1 samples, then release smoothing.
  const rel = 1 - Math.exp(-1 / (release * sr));
  let acc = 0;
  let g = 1;
  for (let i = 0; i < n; i++) {
    acc += minAhead[i];
    if (i > la) acc -= minAhead[i - la - 1];
    const target = i >= la ? acc / (la + 1) : Math.min(1, minAhead[i]);
    g = target < g ? target : g + (target - g) * rel;
    const k = gain * g;
    L[i] *= k;
    if (R !== L) R[i] *= k;
  }

  // Belt and braces: hard clamp anything that could still exceed the ceiling.
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      if (d[i] > ceiling) d[i] = ceiling;
      else if (d[i] < -ceiling) d[i] = -ceiling;
    }
  }
  return buffer;
}


/**
 * Stereo-linked feed-forward glue compressor (in place): RMS detector with
 * attack/release smoothing and a soft knee. Levels in dBFS.
 */
export function compress(buffer, { threshold = -20, ratio = 2.5, knee = 6, attack = 0.015, release = 0.25, makeup = 0 } = {}) {
  const sr = buffer.sampleRate;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const kaB = Math.exp(-16 / (attack * sr)), krB = Math.exp(-16 / (release * sr));
  const km = Math.exp(-1 / (0.01 * sr)); // 10 ms mean-square window
  const mk = 10 ** (makeup / 20);
  const B = 16; // gain is computed per 16-sample block (the detector runs per sample)
  let ms = 0, env = 0;
  for (let i0 = 0; i0 < L.length; i0 += B) {
    const i1 = Math.min(L.length, i0 + B);
    for (let i = i0; i < i1; i++) ms = km * ms + (1 - km) * Math.max(L[i] * L[i], R[i] * R[i]);
    const over = 10 * Math.log10(ms + 1e-12) - threshold;
    let red = 0; // gain reduction in dB (soft knee)
    if (over > knee / 2) red = over * (1 - 1 / ratio);
    else if (over > -knee / 2) red = ((1 - 1 / ratio) * (over + knee / 2) ** 2) / (2 * knee);
    env = red > env ? kaB * env + (1 - kaB) * red : krB * env + (1 - krB) * red;
    const g = mk * 10 ** (-env / 20);
    for (let i = i0; i < i1; i++) {
      L[i] *= g;
      if (R !== L) R[i] *= g;
    }
  }
}

/**
 * Tape / console colour (in place): a touch of even-harmonic asymmetry, DC-blocked,
 * into a soft saturation curve that rounds peaks the way a desk and tape do.
 * `drive` ≈ 1 is subtle; unity gain for small signals.
 */
export function saturate(buffer, { drive = 1, even = 0.04 } = {}) {
  const sr = buffer.sampleRate;
  const hp = Math.exp((-2 * Math.PI * 8) / sr); // DC blocker
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let x1 = 0, y1 = 0;
    for (let i = 0; i < d.length; i++) {
      const x = d[i] + even * d[i] * d[i];
      const y = x - x1 + hp * y1; // remove the DC the asymmetry creates
      x1 = x; y1 = y;
      const u = y * drive;
      d[i] = u / (1 + Math.abs(u) * 0.25 + u * u * 0.05) / drive;
    }
  }
}

/**
 * Two-band glue (in place): below ~150 Hz and above are compressed by separate,
 * gentle, stereo-linked detectors (the low band a little slower and firmer), so
 * the sub hits stop pumping the orchestra and the whole mix sits together.
 */
export function glue2(buffer, { split = 150, low = { threshold: -20, ratio: 2.2 }, high = { threshold: -19, ratio: 1.6 } } = {}) {
  const sr = buffer.sampleRate;
  const n = buffer.length;
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0);
  const a = 1 - Math.exp((-2 * Math.PI * split) / sr);
  // 2-pole lowpass split (the high band is the remainder, so the sum is exact)
  const loL = new Float32Array(n), loR = new Float32Array(n);
  let l1 = 0, l2 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < n; i++) {
    l1 += a * (L[i] - l1); l2 += a * (l1 - l2); loL[i] = l2;
    r1 += a * (R[i] - r1); r2 += a * (r1 - r2); loR[i] = r2;
  }
  const km = Math.exp(-1 / (0.012 * sr));
  const coef = (t) => Math.exp(-16 / (t * sr));
  const kaL = coef(0.03), krL = coef(0.35), kaH = coef(0.015), krH = coef(0.25);
  const reduce = (ms, { threshold, ratio }) => {
    const over = 10 * Math.log10(ms + 1e-12) - threshold;
    return over > 3 ? over * (1 - 1 / ratio) : over > -3 ? ((1 - 1 / ratio) * (over + 3) ** 2) / 12 : 0;
  };
  let msL = 0, msH = 0, eL = 0, eH = 0;
  for (let i0 = 0; i0 < n; i0 += 16) {
    const i1 = Math.min(n, i0 + 16);
    for (let i = i0; i < i1; i++) {
      const a0 = loL[i], a1 = loR[i], h0 = L[i] - a0, h1 = R[i] - a1;
      msL = km * msL + (1 - km) * Math.max(a0 * a0, a1 * a1);
      msH = km * msH + (1 - km) * Math.max(h0 * h0, h1 * h1);
    }
    const rl = reduce(msL, low), rh = reduce(msH, high);
    eL = rl > eL ? kaL * eL + (1 - kaL) * rl : krL * eL + (1 - krL) * rl;
    eH = rh > eH ? kaH * eH + (1 - kaH) * rh : krH * eH + (1 - krH) * rh;
    const gl = 10 ** (-eL / 20), gh = 10 ** (-eH / 20);
    for (let i = i0; i < i1; i++) {
      const a0 = loL[i], a1 = loR[i];
      L[i] = a0 * gl + (L[i] - a0) * gh;
      if (R !== L) R[i] = a1 * gl + (R[i] - a1) * gh;
    }
  }
}

/**
 * Room tone (in place): the faint, never-silent air of a hall — decorrelated
 * pink-ish noise with a little low rumble, at `level` RMS, following `env(t)`.
 */
export function roomTone(buffer, random, { level = 0.0005, env = () => 1 } = {}) {
  const sr = buffer.sampleRate;
  // a 5.3 s decorrelated loop per channel (long enough never to be heard repeating)
  const m = Math.floor(5.3 * sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const loop = new Float32Array(m);
    let b0 = 0, b1 = 0, b2 = 0, r = 0;
    for (let i = 0; i < m; i++) {
      const w = random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      r = 0.9995 * r + w * 0.02;                  // HVAC-like rumble
      loop[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11 * 0.75 + r * 0.9;
    }
    const d = buffer.getChannelData(c);
    const off = c * Math.floor(m / 2);
    let e = 1;
    for (let i = 0; i < d.length; i++) {
      if ((i & 255) === 0) e = level * env(i / sr);
      d[i] += loop[(i + off) % m] * e;
    }
  }
}
