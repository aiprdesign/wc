// ACHIEVEMENTS OF WESTERN CIVILIZATION — procedural soundtrack (v2, "trailer" score).
//
// renderScore() synthesises the whole 60 s score offline (Web Audio only: no
// samples) and returns an AudioBuffer that the player starts at any offset.
//
//   music.js       harmony, the heroic theme, orchestra, rhythm section, trailer hits
//   cues.js        sound design pinned to the timeline CUES
//   orchestra.js   ensemble strings / brass / horns / choir, BRAAM
//   percussion.js  taiko ensemble, toms, sticks, kit — JS-rendered one-shots
//   instruments.js piano, celesta, harp, electronics, risers, swells, downers
//   sfx.js         era textures (stone, pencil, paper, clocks, steam, sparks, radio, jet…)
//   reverb.js      procedural convolution halls;  mastering.js  gain, compressor, limiter
//   wav.js         WAV export
//
// Mix topology:
//   instrument buses ─┬─ film bus ── (drops out at CUES.musicDrop) ─┐
//   hall (3 s) ───────┘                                             ├─ master HP → buffer
//   end buses ── finale bus (+ 5 s "space") ────────────────────────┘
//   then, on the rendered buffer: loudness trim → glue compressor → limiter at -1 dBFS

import { DURATION, CUES as C } from '../timeline.js';
import { Studio } from './core.js';
import { makeWideMonoReverb } from './reverb.js';
import { applyGain, compress, limit, rmsBetween } from './mastering.js';
import { arrangeMusic } from './music.js';
import { arrangeCues } from './cues.js';

export { encodeWav } from './wav.js';

export const SCORE_VERSION = 2;

const TAIL = 1.5;              // seconds rendered past DURATION
const CEILING = 0.891;         // -1 dBFS
const TARGET_LOUD_RMS = 0.16;  // ≈ -16 dBFS RMS through industrial → montage

function buildMixer(S) {
  const { ctx } = S;

  // Master: subsonic high-pass only; compression, loudness and limiting happen
  // on the rendered buffer (see renderScore).
  const master = S.gain(0.5);
  master.connect(S.filter('highpass', 24, 0.6)).connect(ctx.destination);

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

  const space = makeWideMonoReverb(ctx, S.random, { seconds: 5.0, preDelay: 0.05, brightHz: 6000, darkHz: 700 }, 0.027);
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

  // Master: set the loud body of the film to a consistent level, glue it with a
  // gentle compressor, then brickwall-limit to -1 dBFS.
  const loud = rmsBetween(buffer, C.gear, C.pullBack);
  const gain = loud > 0 ? Math.min(8, TARGET_LOUD_RMS / loud) : 1;
  applyGain(buffer, gain);
  compress(buffer, { threshold: -17, ratio: 2, knee: 8, attack: 0.02, release: 0.3 });
  const glued = rmsBetween(buffer, C.gear, C.pullBack);
  limit(buffer, { gain: Math.min(4, TARGET_LOUD_RMS / glued), ceiling: CEILING, lookahead: 0.004, release: 0.15 });
  return buffer;
}
