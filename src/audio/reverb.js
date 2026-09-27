// Procedural convolution reverbs.
//
// The impulse response is a decorrelated stereo noise tail with an exponential
// decay (reaching -60 dB at `seconds`) that darkens as it decays (air and wall
// absorption), preceded by a few sparse early reflections. Energy-normalised so
// the send level alone decides how wet a bus is.

export function makeImpulse(ctx, random, {
  seconds = 3,
  preDelay = 0.02,
  brightHz = 9000,
  darkHz = 1500,
  reflections = 12,
  channels = 2,
} = {}) {
  const sr = ctx.sampleRate;
  const pd = Math.floor(preDelay * sr);
  const n = pd + Math.ceil(seconds * sr);
  const ir = ctx.createBuffer(channels, n, sr);
  let energy = 0;

  for (let ch = 0; ch < channels; ch++) {
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / sr;
      const u = t / seconds;
      // Cutoff glides from bright to dark over the first 2/3 of the tail.
      const fc = brightHz * (darkHz / brightHz) ** Math.min(1, u * 1.5);
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      y += a * (random() * 2 - 1 - y);
      const unit = 1 / Math.sqrt(a / (2 - a)); // keep filtered noise near unit RMS
      const env = Math.exp(-6.9 * u) * Math.min(1, t / 0.006);
      d[i] = y * unit * env * (0.55 + 0.45 * Math.exp(-2.5 * u)); // slight extra high-level loss
    }
    // Early reflections: sparse taps in the first ~80 ms, alternating in sign.
    for (let k = 0; k < reflections; k++) {
      const t = 0.004 + random() * 0.075;
      const i = pd + Math.floor(t * sr);
      if (i < n) d[i] += (random() < 0.5 ? -1 : 1) * (2.5 - t * 20) * (0.5 + random());
    }
    for (let i = 0; i < n; i++) energy += d[i] * d[i];
  }

  const k = 1 / Math.sqrt(energy / channels);
  for (let ch = 0; ch < channels; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  return ir;
}

/**
 * Half-price stereo reverb: one mono convolution, widened by feeding the right
 * channel a slightly delayed copy (the noise-like tail decorrelates completely).
 */
export function makeWideMonoReverb(ctx, random, options, spread = 0.019, cache = null) {
  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.channelCount = 1;
  conv.channelCountMode = 'explicit';
  const key = `ir:${JSON.stringify(options)}`;
  let ir = cache?.get(key);
  if (!ir) { ir = makeImpulse(ctx, random, { ...options, channels: 1 }); cache?.set(key, ir); }
  conv.buffer = ir;
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = spread;
  const merge = ctx.createChannelMerger(2);
  conv.connect(merge, 0, 0);
  conv.connect(delay).connect(merge, 0, 1);
  return { input: conv, output: merge };
}

/**
 * Stage early reflections: sparse delay taps (floor, side walls, stage shell,
 * back wall) alternating left / right, each quieter and later, fed from a mono,
 * dulled blend of the sections. It bridges the dry signal and the late hall, so
 * the orchestra sounds recorded in a room instead of "dry + reverb". (Delay taps,
 * not a convolver: a short ConvolverNode costs far more to render.)
 * Returns { input, output }; output is stereo.
 */
export function makeEarlyReflections(ctx, random) {
  const input = ctx.createBiquadFilter();
  input.type = 'lowpass';
  input.frequency.value = 5500;
  input.channelCount = 1;
  input.channelCountMode = 'explicit';
  const merge = ctx.createChannelMerger(2);
  const taps = [[0.0073, 0.7], [0.0111, 0.62], [0.0169, 0.52], [0.0233, 0.46], [0.0317, 0.36], [0.0431, 0.3], [0.057, 0.22], [0.071, 0.17]];
  taps.forEach(([t, g], k) => {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = t * (0.93 + 0.14 * random());
    const a = ctx.createGain();
    a.gain.value = g * (k % 3 === 2 ? -1 : 1) * 0.6;
    input.connect(d).connect(a).connect(merge, 0, k % 2);
  });
  return { input, output: merge };
}
