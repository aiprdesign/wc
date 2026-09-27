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
import { makeReverb } from './reverb.js';
import { limit, rmsBetween } from './mastering.js';
import { arrangeMusic } from './music.js';
import { arrangeCues } from './cues.js';

export { encodeWav } from './wav.js';

export const SCORE_VERSION = 1;

const TAIL = 1.5;              // seconds rendered past DURATION
const CEILING = 0.891;         // -1 dBFS
const TARGET_LOUD_RMS = 0.16;  // ≈ -16 dBFS RMS through industrial → montage

function buildMixer(S) {
  const { ctx } = S;

  const master = S.gain(1);
  const hp = S.filter('highpass', 24, 0.6);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 10;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.015;
  comp.release.value = 0.25;
  master.connect(hp).connect(comp).connect(ctx.destination);

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
  // ConvolverNode costs CPU even when silent): the hall until just after the drop,
  // the finale "space" from the pullBack on.
  const hall = makeReverb(ctx, S.random, { seconds: 2.4, preDelay: 0.025, brightHz: 8000, darkHz: 1400 });
  const hallIn = S.gain(1);
  hallIn.connect(hall).connect(film);
  S.at(C.musicDrop + 1.0, () => { hallIn.disconnect(); hall.disconnect(); });
  const space = makeReverb(ctx, S.random, { seconds: 4.2, preDelay: 0.04, brightHz: 6000, darkHz: 800 });
  const spaceIn = S.gain(1);
  S.at(C.pullBack, () => spaceIn.connect(space).connect(finale));

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

  const bus = (name, gain, send, to = film, reverb = hallIn) => S.addBus(name, { to, gain, reverb, send });
  bus('pad', 0.9, 0.35);
  bus('brass', 0.9, 0.3);
  bus('lead', 0.9, 0.55);
  bus('far', 1.0, 1.2);    // distant, mostly-wet details
  bus('drums', 0.9, 0.1);
  bus('perc', 0.9, 0.28);
  bus('bass', 0.9, 0);
  bus('synth', 0.8, 0.2);
  bus('sfx', 0.9, 0.22);
  bus('fx', 0.9, 0.35);
  bus('end', 1.0, 0.7, finale, spaceIn);
  bus('endDry', 1.0, 0.15, finale, spaceIn);
  S.bus('synth').connect(S.gain(0.5)).connect(delay);
}

/** Gentle sidechain-style ducking of the pads under the hybrid-section kicks. */
function duckPads(S, kicks) {
  const g = S.bus('pad').gain;
  const base = g.value;
  for (const t of [...kicks].sort((a, b) => a - b)) {
    g.setTargetAtTime(base * 0.7, t, 0.006);
    g.setTargetAtTime(base, t + 0.04, 0.1);
  }
}

export async function renderScore(sampleRate = 48000) {
  const T0 = performance.now();
  const S = new Studio(sampleRate, DURATION + TAIL);
  console.log('studio', performance.now()-T0);
  buildMixer(S);
  const { kicks } = globalThis.__noMusic ? { kicks: [] } : arrangeMusic(S);
  if (!globalThis.__noCues) arrangeCues(S);
  duckPads(S, kicks);

  console.log('arranged', performance.now()-T0, S.events.length);
  const buffer = await S.render();
  console.log('rendered', performance.now()-T0);

  // Master: level the loud body of the film to a consistent loudness, then
  // brickwall-limit to -1 dBFS. (Gain is capped so quiet mixes are not overdriven.)
  const loud = rmsBetween(buffer, C.gear, C.pullBack);
  const gain = loud > 0 ? Math.min(8, TARGET_LOUD_RMS / loud) : 1;
  console.log('gain', gain);
  limit(buffer, { gain, ceiling: CEILING, lookahead: 0.004, release: 0.15 });
  console.log('limited', performance.now()-T0);
  return buffer;
}
