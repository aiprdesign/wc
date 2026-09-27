// ACHIEVEMENTS OF WESTERN CIVILIZATION — procedural soundtrack.
//
// renderScore() synthesises the whole 60 s score offline (Web Audio only: no
// samples) and returns an AudioBuffer that the player starts at any offset.
//
//   music.js  harmony, orchestral + hybrid layers, rhythm, structural accents
//   cues.js   sound design pinned to the timeline CUES
//   instruments.js / sfx.js  the voices;  reverb.js  procedural halls
//   mastering.js  look-ahead limiter;  wav.js  WAV export
//
// Mix topology:
//   instrument buses ─┬─ film bus ── (drops out at CUES.musicDrop) ─┐
//   hall reverb ──────┘                                             ├─ master: HP → compressor → out
//   end buses ── finale bus (+ long "space" reverb) ────────────────┘   then JS limiter at -1 dBFS

import { DURATION, CUES as C } from '../timeline.js';
import { Studio } from './core.js';
import { makeReverb, makeWideMonoReverb } from './reverb.js';
import { limit, rmsBetween, shiftEarlier } from './mastering.js';
import { arrangeMusic } from './music.js';
import { arrangeCues } from './cues.js';

export { encodeWav } from './wav.js';

export const SCORE_VERSION = 2;

const TAIL = 1.5;              // seconds rendered past DURATION
const CEILING = 0.891;         // -1 dBFS
const TARGET_LOUD_RMS = 0.16;  // ≈ -16 dBFS RMS through industrial → montage

// Master-bus compressor settings (shared with the latency probe below).
function makeCompressor(ctx) {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.015;
  comp.release.value = 0.25;
  return comp;
}

// DynamicsCompressorNode looks ahead (6 ms in Chromium), delaying its output.
// Measure it with a tiny render so the score can be shifted back onto the grid.
async function compressorLatency(sampleRate) {
  const n = 2048, at = 256;
  const ctx = new OfflineAudioContext(1, n, sampleRate);
  const buf = ctx.createBuffer(1, n, sampleRate);
  buf.getChannelData(0)[at] = 0.05;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(makeCompressor(ctx)).connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  let peak = 0, idx = at;
  for (let i = 0; i < n; i++) if (Math.abs(out[i]) > peak) { peak = Math.abs(out[i]); idx = i; }
  return Math.max(0, idx - at);
}

function buildMixer(S) {
  const { ctx } = S;

  // The mix is trimmed into the compressor so it only glues the loud passages;
  // absolute loudness is set after rendering.
  const master = S.gain(0.5);
  const hp = S.filter('highpass', 24, 0.6);
  master.connect(hp).connect(makeCompressor(ctx)).connect(ctx.destination);

  // Everything up to the drop lives on the film bus (dry + its own hall reverb),
  // so a single fade silences the music AND its reverb tail at musicDrop.
  const film = S.gain(1);
  film.connect(master);
  film.gain.setValueAtTime(1, C.musicDrop);
  film.gain.setTargetAtTime(0, C.musicDrop, 0.07);

  // The finale (resonance, final impact, closing shimmer) has its own long space.
  const finale = S.gain(1);
  finale.connect(master);
  finale.gain.setValueAtTime(1, C.fadeOut);
  finale.gain.linearRampToValueAtTime(0, DURATION + 0.5);

  // Reverbs are only wired into the graph while they can be heard (a connected
  // ConvolverNode costs CPU even when silent). Sends are high-passed so the low
  // end stays dry, tight and mono.
  //   hall  — large orchestral hall with pre-delay (until just after the drop)
  //   space — very long stereo space for the finale (from the pullBack on)
  // (Percussion carries its own tight room, baked into its one-shots.)
  const hall = makeWideMonoReverb(ctx, S.random, { seconds: 3.0, preDelay: 0.045, brightHz: 7500, darkHz: 1300 });
  const hallIn = S.filter('highpass', 170, 0.6);
  hallIn.connect(hall.input);
  hall.output.connect(film);
  S.at(C.musicDrop + 1.0, () => { hallIn.disconnect(); hall.output.disconnect(); });

  const space = makeReverb(ctx, S.random, { seconds: 5.0, preDelay: 0.05, brightHz: 6000, darkHz: 700 });
  const spaceIn = S.filter('highpass', 90, 0.6);
  S.at(C.pullBack, () => { spaceIn.connect(space.input); space.output.connect(finale); });

  // Dotted-8th feedback delay for the synths (wired for the hybrid section only).
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.375;
  const fb = S.gain(0.3);
  const dlp = S.filter('lowpass', 3200);
  delay.connect(dlp).connect(fb).connect(delay);
  const dWet = S.gain(0.35);
  dlp.connect(dWet);
  const dRev = S.gain(0.3);
  dRev.connect(hallIn);
  S.at(C.gear - 0.5, () => { dWet.connect(film); dWet.connect(dRev); });
  S.at(C.musicDrop + 1.0, () => dWet.disconnect());

  // Spiccato strings sit behind a gentle lowpass; sound effects lose a little
  // top end so they blend into the score instead of clicking on top of it.
  const spicTone = S.filter('lowpass', 4200, 0.6);
  spicTone.connect(film);
  const sfxTone = S.filter('highshelf', 5500, 0.7);
  sfxTone.gain.value = -5;
  sfxTone.connect(film);

  const bus = (name, gain, sends, to = film) => S.addBus(name, { to, gain, sends });
  bus('strings', 1.0, [[hallIn, 0.38]]);
  bus('choir', 1.0, [[hallIn, 0.6]]);
  bus('brass', 1.0, [[hallIn, 0.32]]);
  bus('horn', 1.0, [[hallIn, 0.42]]);
  bus('piano', 1.0, [[hallIn, 0.75]]);
  bus('lead', 0.9, [[hallIn, 0.55]]);
  bus('pad', 0.9, [[hallIn, 0.35]]);
  bus('far', 1.0, [[hallIn, 1.2]]);          // distant, mostly-wet details
  bus('spic', 1.0, [[hallIn, 0.22]], spicTone);
  bus('perc', 0.9, [[hallIn, 0.14]]);
  bus('drums', 0.9, [[hallIn, 0.04]]);
  bus('bass', 0.9, []);
  bus('synth', 0.8, [[hallIn, 0.2]]);
  bus('sfx', 0.8, [[hallIn, 0.3]], sfxTone);
  bus('fx', 0.9, [[hallIn, 0.35]]);
  bus('end', 1.0, [[spaceIn, 0.7]], finale);
  bus('endDry', 1.0, [[spaceIn, 0.15]], finale);
  S.bus('synth').connect(S.gain(0.5)).connect(delay);
}

/** Gentle sidechain-style ducking of the strings under the hybrid-section kicks. */
function duckStrings(S, kicks) {
  const g = S.bus('strings').gain;
  const base = g.value;
  for (const t of [...kicks].sort((a, b) => a - b)) {
    g.setTargetAtTime(base * 0.78, t, 0.006);
    g.setTargetAtTime(base, t + 0.04, 0.1);
  }
}

export async function renderScore(sampleRate = 48000) {
  const S = new Studio(sampleRate, DURATION + TAIL);
  buildMixer(S);
  const { kicks } = arrangeMusic(S);
  arrangeCues(S);
  duckStrings(S, kicks);

  const buffer = await S.render();
  shiftEarlier(buffer, await compressorLatency(sampleRate));

  // Master: level the loud body of the film to a consistent loudness, then
  // brickwall-limit to -1 dBFS. (Gain is capped so quiet mixes are not overdriven.)
  const loud = rmsBetween(buffer, C.gear, C.pullBack);
  const gain = loud > 0 ? Math.min(8, TARGET_LOUD_RMS / loud) : 1;
  limit(buffer, { gain, ceiling: CEILING, lookahead: 0.004, release: 0.15 });
  return buffer;
}
