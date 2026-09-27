// Offline mastering helpers that run on the rendered AudioBuffer.

const peakOf = (L, R, i) => Math.max(Math.abs(L[i]), Math.abs(R[i]));

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

/** Fade the very end of the buffer to digital silence. */
export function fadeTail(buffer, from, to) {
  const sr = buffer.sampleRate;
  const a = Math.floor(from * sr);
  const b = Math.min(buffer.length, Math.floor(to * sr));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = a; i < buffer.length; i++) {
      const u = i >= b ? 0 : 1 - (i - a) / (b - a);
      d[i] *= u * u;
    }
  }
}
