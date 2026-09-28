// British narrator voice-over, laid over the mastered score (film clock).
// The narration is one pre-rendered mono file whose timeline already matches the film; it is
// decoded at the score's sample rate, the music ducks smoothly under each line (look-ahead so
// the dip starts just before the first syllable), and the sum is limited once more.
import { limit } from './mastering.js';

export const VO_URL = new URL('../../assets/audio/narration.mp3', import.meta.url).href;   // resolves from this module, whatever the page

/** Fetch + decode the narration at `sampleRate`; resolves null if it is unavailable. */
export async function loadVoiceOver(sampleRate = 48000, url = VO_URL) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    return await ctx.decodeAudioData(data);
  } catch (e) {
    console.warn('[audio] narration unavailable', e);
    return null;
  }
}

/**
 * Mix `vo` (mono AudioBuffer) into the stereo score `buffer` in place.
 *   level  — narration RMS (while speaking) relative to the score's loud-body RMS
 *   duck   — music gain under the voice (0.45 ≈ −7 dB)
 */
export function mixVoiceOver(buffer, vo, { refRms, level = 1.0, duck = 0.45, ceiling = 0.891 } = {}) {
  const sr = buffer.sampleRate, n = buffer.length;
  const v = vo.getChannelData(0), m = Math.min(n, v.length);
  // speech activity per 10 ms block
  const B = Math.round(sr * 0.01), nb = Math.ceil(n / B);
  let peak = 0;
  for (let i = 0; i < m; i++) peak = Math.max(peak, Math.abs(v[i]));
  if (peak <= 0) return;
  const act = new Float32Array(nb);
  for (let b = 0; b < nb; b++) {
    let p = 0;
    for (let i = b * B, e = Math.min(m, i + B); i < e; i++) p = Math.max(p, Math.abs(v[i]));
    act[b] = p > peak * 0.04 ? 1 : 0;
  }
  // bridge short pauses between words / phrases (hold 450 ms), then look ahead 150 ms
  const hold = 45, ahead = 15;
  const on = new Float32Array(nb);
  for (let b = 0, last = -1e9; b < nb; b++) { if (act[b]) last = b; on[b] = b - last <= hold ? 1 : 0; }
  const want = new Float32Array(nb);
  for (let b = 0; b < nb; b++) want[b] = on[Math.min(nb - 1, b + ahead)] || on[b] ? 1 : 0;
  // smooth: 120 ms into the dip, 600 ms back out — the music breathes around the voice
  const gain = new Float32Array(nb + 1);
  const aIn = 1 - Math.exp(-1 / 12), aOut = 1 - Math.exp(-1 / 60);
  let d = 0;
  for (let b = 0; b < nb; b++) { d += (want[b] - d) * (want[b] > d ? aIn : aOut); gain[b] = 1 - (1 - duck) * d; }
  gain[nb] = gain[nb - 1];
  // narration level from its active RMS
  let e = 0, cnt = 0;
  for (let b = 0; b < nb; b++) if (act[b]) for (let i = b * B, s = Math.min(m, i + B); i < s; i++) { e += v[i] * v[i]; cnt++; }
  const voRms = Math.sqrt(e / Math.max(1, cnt));
  const g = voRms > 0 ? (refRms * level) / voRms : 1;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d0 = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const bf = i / B, b0 = Math.floor(bf), t = bf - b0;
      d0[i] = d0[i] * (gain[b0] + (gain[b0 + 1] - gain[b0]) * t) + (i < m ? v[i] * g : 0);
    }
  }
  limit(buffer, { gain: 1, ceiling, lookahead: 0.004, release: 0.12 });
}
