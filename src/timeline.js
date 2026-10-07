// Master timeline — the single source of truth shared by picture and sound.
// All times are GLOBAL seconds. Segments overlap by ~0.5 s; the overlap is where
// the compositor blends the outgoing and incoming sequences with `transition`.

import { FILM } from './film.js';

export const DURATION = FILM.DURATION;            // story time: every segment, cue and beat below is authored on this clock
// The film plays the story slowed by TIME_SCALE (72 s of story → 100 s of film, 120 → 86.4 BPM),
// giving every concept more room. The score is rendered at the same scale, so sync is exact.
export const TIME_SCALE = 100 / 72;
export const FILM_DURATION = DURATION * TIME_SCALE;
export const FILM_ASPECT = 2.39;         // anamorphic frame; every scene is composed for this aspect
// Delivery aspect (?aspect=1, ?aspect=16:9 …). Other aspects render "open matte": each camera keeps its
// exact 2.39 horizontal view and the frame extends above/below, so nothing composed is ever cropped.
export const OUTPUT_ASPECT = (() => {
  try {
    // ?aspect=1 / ?aspect=16:9, or a hash (#square, #16x9, #9x16, #2x3, #4x5, #wide) — hashes survive embedded viewers
    const hash = (globalThis.location?.hash ?? '').slice(1).toLowerCase();
    const fromHash = { square: '1', '1x1': '1', '16x9': '16:9', landscape: '16:9', '9x16': '9:16', vertical: '9:16', '2x3': '2:3', portrait: '2:3', '4x5': '4:5', wide: '' }[hash.split(/[&+,]/).find((t) => t !== 'india' && t !== 'western') ?? ''];
    const q = new URLSearchParams(globalThis.location?.search ?? '');
    let a = fromHash ?? q.get('aspect');
    // no format chosen on a phone held upright: the vertical cut fills the screen
    if (a == null && !q.has('still') && globalThis.matchMedia?.('(max-width: 700px) and (orientation: portrait)').matches) a = '9:16';
    if (!a) return FILM_ASPECT;
    const [x, y] = a.split(/[:x/]/).map(Number);
    const v = y ? x / y : x;
    return v > 0.3 && v < 4 ? Math.min(v, FILM_ASPECT) : FILM_ASPECT;
  } catch { return FILM_ASPECT; }
})();
export const BPM = 120;
export const BEAT = 60 / BPM;            // 0.5 s
export const BAR = BEAT * 4;             // 2.0 s

// The film's own timeline (src/films/<id>.js; src/film.js picks the film this page plays).
export const SEGMENTS = FILM.SEGMENTS;
export const CUES = FILM.CUES;
export const WARMTH_KEYS = FILM.WARMTH_KEYS;
// the beat names the trailer score (audio/music.js) is written against, pinned to this film's picture
export const MUSIC_CUES = FILM.MUSIC_CUES ?? CUES;
// The score's own clock (story seconds) and how its music is laid onto the film's: from each splice's
// story time on, music time = story time − offset (the Indian film hears two bars again under each of
// its two extra chapters). The Western film's score runs on its own clock: no splices.
export const MUSIC_DURATION = FILM.MUSIC_DURATION ?? DURATION;
export const MUSIC_SPLICES = FILM.MUSIC_SPLICES ?? [];
export const MUSIC_DUCKS = FILM.MUSIC_DUCKS ?? [];   // [story from, to, gain]: the score steps back (audio/score.js)

export function segmentById(id) {
  return SEGMENTS.find((s) => s.id === id);
}

// Local time of a cue inside a segment.
export function localCue(segmentId, cueName) {
  return CUES[cueName] - segmentById(segmentId).start;
}

export function warmthAt(T) {
  const k = WARMTH_KEYS;
  if (T <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (T <= k[i][0]) {
      const u = (T - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const s = u * u * (3 - 2 * u);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s;
    }
  }
  return k[k.length - 1][1];
}
