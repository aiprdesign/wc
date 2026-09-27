// ACHIEVEMENTS OF WESTERN CIVILIZATION — procedural soundtrack (v3, three-act trailer score).
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
import { warmPercussion } from './percussion.js';
import { arrangeCues } from './cues.js';

export { encodeWav } from './wav.js';

export const SCORE_VERSION = 3;

const TAIL = 1.5;              // seconds rendered past DURATION
const CEILING = 0.891;         // -1 dBFS
const TARGET_LOUD_RMS = 0.16;  // ≈ -16 dBFS RMS through industrial → montage

export function __buildMixer(S) { return buildMixer(S); }
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
  // suck-back before the pullBack: 80 ms of true silence (music AND reverb)
  film.gain.setValueAtTime(1, C.pullBack - 0.1);
  film.gain.linearRampToValueAtTime(0, C.pullBack - 0.08);
  film.gain.setValueAtTime(0, C.pullBack - 0.003);
  film.gain.linearRampToValueAtTime(1, C.pullBack);
  film.gain.setValueAtTime(1, C.musicDrop);
  film.gain.setTargetAtTime(0, C.musicDrop, 0.07);

  // The finale (resonance, final impact, closing shimmer) has its own long space.
  const finale = S.gain(1);
  finale.connect(master);
  finale.gain.setValueAtTime(1, C.finalImpact - 0.1);   // suck-back before the button
  finale.gain.linearRampToValueAtTime(0, C.finalImpact - 0.08);
  finale.gain.setValueAtTime(0, C.finalImpact - 0.003);
  finale.gain.linearRampToValueAtTime(1, C.finalImpact);
  finale.gain.setValueAtTime(1, C.fadeOut);
  finale.gain.linearRampToValueAtTime(0, DURATION + 0.5);

  // Reverbs are only wired into the graph while they can be heard (a connected
  // ConvolverNode costs CPU even when silent). Sends are high-passed so the low
  // end stays dry, tight and mono.
  //   hall  — large orchestral hall with pre-delay (until just after the drop)
  //   space — very long stereo space for the finale (from the pullBack on)
  // (Percussion carries its own tight room, baked into its one-shots.)
  const hall = makeWideMonoReverb(ctx, S.random, { seconds: 2.6, preDelay: 0.045, brightHz: 7500, darkHz: 1300 }, 0.019, S.cache);
  const hallIn = S.filter('highpass', 170, 0.6);
  hallIn.connect(hall.input);
  hall.output.connect(film);
  S.at(C.musicDrop + 1.0, () => { hallIn.disconnect(); hall.output.disconnect(); });

  const space = makeWideMonoReverb(ctx, S.random, { seconds: 5.0, preDelay: 0.05, brightHz: 6000, darkHz: 700 }, 0.027, S.cache);
  const spaceIn = S.filter('highpass', 90, 0.6);
  S.at(C.pullBack, () => { spaceIn.connect(space.input); space.output.connect(finale); });

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

/** Sum `src` into `dst` (same length / channel count). */
function mixInto(dst, src) {
  for (let c = 0; c < dst.numberOfChannels; c++) {
    const d = dst.getChannelData(c), e = src.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] += e[i];
  }
}

export async function renderScore(sampleRate = 48000) {
  // Two studios render in parallel (one OfflineAudioContext = one render thread
  // each), sharing noise and pre-rendered buffers. Both have the same mixer (so
  // every part gets the same halls, stage and film/finale automation):
  //   A — the sustained orchestra;  B — rhythm section, hits, transitions, sound design.
  const A = new Studio(sampleRate, DURATION + TAIL, 1492);
  const B = new Studio(sampleRate, DURATION + TAIL, 1815, A);
  for (const S of [A, B]) buildMixer(S);
  const { kicks } = arrangeMusic(A, 'orchestra');
  arrangeMusic(B, 'rhythm');
  arrangeCues(B);
  warmPercussion(B);
  duckStrings(A, kicks);

  const [buffer, b2] = await Promise.all([A.render(), B.render()]);
  mixInto(buffer, b2);

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
