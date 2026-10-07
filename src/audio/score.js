// ACHIEVEMENTS OF WESTERN CIVILIZATION — procedural soundtrack (v7: the v6 three-act
// trailer score with its 18 s coda — humanised, round-robin, modelled timbres, a stage with
// early reflections, designed sound effects, an analogue-style master — played at the
// film's pace: the picture runs the story slowed by TIME_SCALE (100/72), so the score is
// rendered on the same clock — 120 → 86.4 BPM, every event at story time × TIME_SCALE,
// every musical duration stretched, at the same pitch. The music is still written in story
// time; the Studio converts it once (see core.js "Time map"). At the slower tempo the hybrid
// section drives on denser hats, and the button is answered by drums under the horns'
// D — A — D'. v8: THE NEW FRONTIER — three bars (story 49.5 – 55.5) inserted between
// knowledge and the montage, everything after moved +6 s on the unchanged grid; the story
// is 78 s, the film 108.3 s.)
//
// renderScore() synthesises the whole 108 s score (+ tail) offline (Web Audio only: no
// samples) and returns an AudioBuffer (FILM time) that the player starts at any offset.
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
// All cue times below are story time; the Studio maps them (and the mastering converts its
// measurement windows with TIME_SCALE).
//
// Mix topology (rendered as two parallel studios — see renderScore — then summed):
//   instrument buses ── seating (pan, air absorption) ─┬─ stage early reflections ─┐
//   instrument buses ─┬─ film bus ── (ends at the suck-back before finalImpact) ─┐
//   hall (3 s) ───────┘                                                           ├─ master HP → buffer
//   end buses ── finale bus (+ 5 s "space", from the pullBack; fades out at the end) ─┘
//   then, on the rendered buffer: loudness trim → tape/console saturation →
//   two-band glue compressor → room tone → limiter at -1 dBFS

import { DURATION, FILM_DURATION, TIME_SCALE, MUSIC_CUES as C, CUES as CN, MUSIC_DURATION, MUSIC_SPLICES } from '../timeline.js';
import { FILM_ID } from '../film.js';
import { Studio, mulberry32 } from './core.js';
import { makeWideMonoReverb, makeEarlyReflections } from './reverb.js';
import { applyGain, limit, rmsBetween, saturate, glue2, roomTone } from './mastering.js';
import { arrangeMusic } from './music.js';
import { warmPercussion } from './percussion.js';
import { warmSfx } from './sfx.js';
import { arrangeCues } from './cues.js';
import { loadVoiceOver, mixVoiceOver } from './voice.js';

export { encodeWav } from './wav.js';

export const SCORE_VERSION = 13;

const TAIL = 1.5;              // film seconds rendered past FILM_DURATION
const CEILING = 0.891;         // -1 dBFS
const TARGET_LOUD_RMS = 0.16;  // ≈ -16 dBFS RMS through industrial → montage

// hallUntil: when this studio's film bus (and its hall) has nothing more to play.
// cues / end: the clock this studio plays on — the score's (C, MUSIC_DURATION) or, for a film whose music is
// spliced onto a longer picture, the film's own (CN, DURATION) for the sound design and the narration
function buildMixer(S, { space: withSpace = true, stage = true, cues = C, end = MUSIC_DURATION, hallUntil = cues.finalImpact } = {}) {
  const C = cues;
  const { ctx } = S;

  // Master: subsonic high-pass only; compression, loudness and limiting happen
  // on the rendered buffer (see renderScore).
  const master = S.gain(0.5);
  master.connect(S.filter('highpass', 24, 0.6)).connect(ctx.destination);

  // Everything up to the final button lives on the film bus (dry + its own hall reverb),
  // so the suck-back silences the music AND its reverb tail in one move.
  const film = S.gain(1);
  film.connect(master);
  // suck-back before the pullBack: 80 ms of true silence (music AND reverb)
  film.gain.setValueAtTime(1, C.pullBack - 0.1);
  film.gain.linearRampToValueAtTime(0, C.pullBack - 0.08);
  film.gain.setValueAtTime(0, C.pullBack - 0.003);
  film.gain.linearRampToValueAtTime(1, C.pullBack);
  // … and the short suck-back before the final button: the swell (and its hall) stops
  // dead 80 ms before the hit; the button and everything after it are on the finale bus
  film.gain.setValueAtTime(1, C.finalImpact - 0.1);
  film.gain.linearRampToValueAtTime(0, C.finalImpact - 0.08);

  // The finale (resonance, final impact, closing shimmer) has its own long space.
  const finale = S.gain(1);
  finale.connect(master);
  finale.gain.setValueAtTime(1, C.finalImpact - 0.1);   // suck-back before the button
  finale.gain.linearRampToValueAtTime(0, C.finalImpact - 0.08);
  finale.gain.setValueAtTime(0, C.finalImpact - 0.003);
  finale.gain.linearRampToValueAtTime(1, C.finalImpact);
  finale.gain.setValueAtTime(1, C.fadeOut + 0.4);
  finale.gain.linearRampToValueAtTime(0, end + 0.3);   // silence by story ~78.3 s (film ~108.75 s)

  // Reverbs are only wired into the graph while they can be heard (a connected
  // ConvolverNode costs CPU even when silent). Sends are high-passed so the low
  // end stays dry, tight and mono.
  //   hall  — large orchestral hall with pre-delay (until the studio's film bus is done)
  //   space — very long stereo space for the finale (from the pullBack on)
  // (Percussion carries its own tight room, baked into its one-shots.)
  const hall = makeWideMonoReverb(ctx, S.random, { seconds: 2.6, preDelay: 0.045, brightHz: 7500, darkHz: 1300 }, 0.019, S.cache);
  const hallIn = S.filter('highpass', 170, 0.6);
  hallIn.connect(hall.input);
  hall.output.connect(film);
  S.at(hallUntil, () => { hallIn.disconnect(); hall.output.disconnect(); });

  const spaceIn = S.filter('highpass', 90, 0.6);
  if (withSpace) { // only studios that play the finale pay for its 5 s convolution
    const space = makeWideMonoReverb(ctx, S.random, { seconds: 5.0, preDelay: 0.05, brightHz: 6000, darkHz: 700 }, 0.027, S.cache);
    S.at(C.pullBack, () => { spaceIn.connect(space.input); space.output.connect(finale); });
  }

  // Spiccato strings sit behind a gentle lowpass; sound effects lose a little
  // top end so they blend into the score instead of clicking on top of it.
  const spicTone = S.filter('lowpass', 4200, 0.6);
  spicTone.connect(film);
  const sfxTone = S.filter('highshelf', 5500, 0.7);
  sfxTone.gain.value = -5;
  sfxTone.connect(film);

  // Stage: early reflections (true stereo, short) feed the film bus and the hall.
  // (Only the orchestra studio has one: percussion bakes its own reflections.)
  let earlyIn = null;
  if (stage) {
    const early = makeEarlyReflections(ctx, S.random);
    earlyIn = early.input;
    const earlyOut = S.gain(0.8);
    early.output.connect(earlyOut);
    earlyOut.connect(film);
    earlyOut.connect(hallIn);
    S.at(hallUntil, () => { earlyOut.disconnect(); });
  }

  // Seating (strings left-centre, horns centre, brass centre-right, choir wide) is
  // baked into the section loops (orchestra.js), which costs nothing at render
  // time; here each bus sets how far back it sits: its early-reflection send `er`
  // (more = further away) and its hall send.
  const bus = (name, gain, sends, { to = film, er = 0 } = {}) =>
    S.addBus(name, { to, gain, sends: er && stage ? [...sends, [earlyIn, er]] : sends });
  bus('strings', 1.0, [[hallIn, 0.34]], { er: 0.3 });
  bus('choir', 1.0, [[hallIn, 0.6]], { er: 0.45 });
  bus('brass', 1.0, [[hallIn, 0.36]], { er: 0.45 });
  bus('horn', 1.0, [[hallIn, 0.42]], { er: 0.4 });
  bus('piano', 1.0, [[hallIn, 0.7]], { er: 0.25 });
  bus('lead', 0.9, [[hallIn, 0.55]], { er: 0.2 });
  bus('pad', 0.9, [[hallIn, 0.35]]);
  bus('far', 1.0, [[hallIn, 1.3]], { er: 0.5 });   // distant, mostly-wet details
  bus('spic', 1.0, [[hallIn, 0.2]], { to: spicTone, er: 0.25 });
  bus('perc', 0.9, [[hallIn, 0.16]], { er: 0.35 });
  bus('drums', 0.9, [[hallIn, 0.04]], { er: 0.1 });
  bus('bass', 0.9, []);
  bus('synth', 0.8, [[hallIn, 0.2]], { er: 0.1 });
  bus('sfx', 0.8, [[hallIn, 0.3]], { to: sfxTone, er: 0.3 });
  bus('fx', 0.9, [[hallIn, 0.35]], { er: 0.15 });
  // the Indian film's layer (src/audio/india/): sitar, bansuri, santoor, tanpura, tabla, bells
  bus('india', 2.4, [[hallIn, 0.45]], { er: 0.25 });
  bus('indiaFar', 2.4, [[hallIn, 1.1]], { er: 0.45 });
  bus('indiaPerc', 2.2, [[hallIn, 0.14]], { er: 0.3 });
  bus('indiaEnd', 2.4, [[spaceIn, 0.6]], { to: finale });
  bus('end', 1.0, [[spaceIn, 0.7]], { to: finale });
  bus('endDry', 1.0, [[spaceIn, 0.15]], { to: finale });
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

/** Story time of music time tm (past each splice's seam, the later offset). */
const toStory = (tm) => { let o = 0; for (const [at, off] of MUSIC_SPLICES) if (tm >= at - off) o = off; return tm + o; };

/**
 * Lay the music (rendered on the score's clock) onto the film's clock: from each splice's story time on,
 * the film plays the music `offset` story seconds earlier — whole bars, so the beat never stumbles — with a
 * short equal-power crossfade across each seam. `like` gives the output's length and channels.
 */
function spliceMusic(src, like, splices) {
  const sr = src.sampleRate, out = new AudioBuffer({ length: like.length, numberOfChannels: like.numberOfChannels, sampleRate: sr });
  const seams = [[0, 0], ...splices].map(([at, off]) => [Math.round(at * TIME_SCALE * sr), Math.round(off * TIME_SCALE * sr)]);
  const X = Math.round(0.04 * sr);   // crossfade length (film samples)
  for (let c = 0; c < out.numberOfChannels; c++) {
    const s = src.getChannelData(Math.min(c, src.numberOfChannels - 1)), o = out.getChannelData(c);
    const at = (i, off) => { const j = i - off; return j >= 0 && j < s.length ? s[j] : 0; };
    for (let k = 0; k < seams.length; k++) {
      const [a, off] = seams[k], b = k + 1 < seams.length ? seams[k + 1][0] : o.length;
      for (let i = a; i < b; i++) o[i] = at(i, off);
    }
    for (let k = 1; k < seams.length; k++) {
      const [a, off] = seams[k], prev = seams[k - 1][1];
      for (let i = Math.max(0, a - X / 2); i < Math.min(o.length, a + X / 2); i++) {
        const u = (i - (a - X / 2)) / X, g0 = Math.cos(u * Math.PI / 2), g1 = Math.sin(u * Math.PI / 2);
        o[i] = at(i, prev) * g0 + at(i, off) * g1;
      }
    }
  }
  return out;
}

/** Sum `src` into `dst` (same length / channel count). */
function mixInto(dst, src) {
  for (let c = 0; c < dst.numberOfChannels; c++) {
    const d = dst.getChannelData(c), e = src.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] += e[i];
  }
}

// (`only`, for diagnostics: 'india' renders just the Indian layer, 'score' everything but it)
export async function renderScore(sampleRate = 48000, { voiceOver = true, only = '' } = {}) {
  const voP = voiceOver ? loadVoiceOver(sampleRate) : Promise.resolve(null);   // decodes while the score renders
  // Two studios render in parallel (one OfflineAudioContext = one render thread
  // each), sharing noise and pre-rendered buffers. Both have the same mixer (so
  // every part gets the same halls, stage and film/finale automation):
  //   A — the orchestra, piano, harp, celesta (with the stage early reflections);
  //   B — rhythm section, hits, transitions, finale and the sound design.
  // (B's film bus has nothing after the pullBack's hall tail: the coda it plays is all on
  // the finale buses, so its hall is switched off early.)
  const MUSIC_FILM = MUSIC_DURATION * TIME_SCALE;
  const A = new Studio(sampleRate, MUSIC_FILM + TAIL, 1492, null, { timeScale: TIME_SCALE });
  const B = new Studio(sampleRate, MUSIC_FILM + TAIL, 1815, A);
  buildMixer(A, { space: false });
  buildMixer(B, { stage: false, hallUntil: C.earthReveal + 3.5 });
  // the Indian film: the same score architecture under an Indian layer (tanpura, sitar, bansuri,
  // santoor, tabla, temple bells) and its own sound design (src/audio/india/)
  const india = FILM_ID === 'india' ? await import('./india/layer.js') : null;
  // a longer picture than the score (MUSIC_SPLICES): the music renders on its own clock and is laid onto
  // the film's afterwards; the sound design (pinned to the picture) renders on the film's clock (studio D)
  const spliced = MUSIC_SPLICES.length > 0;
  const D = spliced ? new Studio(sampleRate, FILM_DURATION + TAIL, 2047, A) : null;
  if (D) buildMixer(D, { stage: false, cues: CN, end: DURATION, hallUntil: CN.earthReveal + 3.5 });
  let kicks = [];
  if (only !== 'india') {
    ({ kicks } = arrangeMusic(A, 'orchestra'));
    arrangeMusic(B, 'rhythm');
    arrangeCues(D ?? B, india?.chapterCues);
  }
  if (india && only !== 'score') { india.arrangeIndia(A, 'melody'); india.arrangeIndia(B, 'rhythm'); }
  warmSfx(B);
  warmPercussion(B);
  if (D) { warmSfx(D); warmPercussion(D); }
  duckStrings(A, kicks);

  const [music, b2, d2] = await Promise.all([A.render(), B.render(), D?.render()]);
  mixInto(music, b2);
  let buffer = music;
  if (D) { buffer = spliceMusic(music, d2, MUSIC_SPLICES); mixInto(buffer, d2); }

  if (only) return buffer;   // (diagnostics: the raw mix, unmastered, so the parts compare)
  // Master: set the loud body of the film to a consistent level, glue it with a
  // gentle compressor, then brickwall-limit to -1 dBFS.
  // (the buffer is in film time)
  const film = (t) => t * TIME_SCALE;
  const loud = rmsBetween(buffer, film(toStory(C.gear)), film(CN.pullBack));
  const gain = loud > 0 ? Math.min(8, TARGET_LOUD_RMS / loud) : 1;
  applyGain(buffer, gain);
  // console / tape colour, then a gentle two-band glue compressor
  saturate(buffer, { drive: 0.9 });
  glue2(buffer);
  // the hall never goes digitally silent (fades in with the opening, out at the end)
  const end = film(DURATION + 0.3);
  roomTone(buffer, mulberry32(7), { level: 0.00045, env: (t) => Math.min(1, t / 0.6, Math.max(0, (end - t) / 1.5)) });
  const glued = rmsBetween(buffer, film(toStory(C.gear)), film(CN.pullBack));
  limit(buffer, { gain: Math.min(4, TARGET_LOUD_RMS / glued), ceiling: CEILING, lookahead: 0.004, release: 0.15 });
  // the British narrator: the music ducks under each line
  const vo = await voP;
  if (vo) mixVoiceOver(buffer, vo, { refRms: TARGET_LOUD_RMS, ceiling: CEILING });
  return buffer;
}
