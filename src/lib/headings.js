// The chapter headings' words and their kick-in timing, shared by the picture (core/words3d.js)
// and the score (audio/cues.js) so every letter's whip, landing and shine is heard on its frame.
// Pure data + math (no three.js): the score renders in contexts without the importmap.
import { SEGMENTS, CUES, BEAT } from '../timeline.js';
import { FILM } from '../film.js';
import DEVA from './deva-headings.js';

// beat-grid helpers (story time; the score plays the same grid)
export const onBeat = (x, div = 1) => Math.round(x / (BEAT / div)) * (BEAT / div);
export const nextBeat = (x, div = 1) => Math.ceil(x / (BEAT / div) - 1e-6) * (BEAT / div);

// One defining word per chapter, and the montage's rapid word swaps, from the film being played
// (src/films/<id>.js). Entries may be objects with explicit story timing: { text, t0, t1, pace, y, focus }
export const { WORDS, SWAPS } = FILM;
// …and, for a film that has them, the same headings in Hindi: drawn large with the English word small beneath
// (the first heading of a chapter only). Their letters are aksharas, as many as the shaped word has.
export const WORDS_HI = FILM.WORDS_HI ?? {};
const nLetters = (text, hi) => (hi && DEVA.words[hi] ? DEVA.words[hi].clusters.length : text.length);

// Every heading in film order: { text, hi, n, seg, t0, t1, swap, pace, entry } (n: letters as drawn) with t0/t1 as authored
// (words3d snaps them to the beat in build()).
export function headingList() {
  const out = [];
  for (const seg of SEGMENTS) {
    const dur = seg.end - seg.start;
    // a chapter may carry several headings (e.g. INTELLIGENCE, then AI over the branches)
    [WORDS[seg.id] ?? []].flat().forEach((w, i) => {
      const text = typeof w === 'string' ? w : w.text, hi = i === 0 ? WORDS_HI[seg.id] : undefined, n = nLetters(text, hi);
      // short and snappy: form quickly, hold a beat, clear — the scene behind is the story
      if (typeof w === 'string') out.push({ text, hi, n, seg: seg.id, t0: seg.start + 0.3, t1: seg.start + Math.min(1.95, dur - 0.65), swap: false, pace: 0.8, entry: {} });
      else out.push({ text, hi, n, seg: seg.id, t0: w.t0, t1: w.t1, swap: false, pace: w.pace ?? 1, entry: w });
    });
  }
  SWAPS.forEach(([cue, w], i) => {
    const t0 = CUES[cue], t1 = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
    out.push({ text: w, n: w.length, seg: 'montage', t0: t0 - 0.05, t1: t1 - 0.08, swap: true, pace: 1, entry: {}, last: !SWAPS[i + 1] });
  });
  return out;
}

// The kick-in clock for a word of n letters (times relative to its beat-snapped t0):
// letters fly in from beside the camera one per 32nd note (`slot`), each flight `fly` long,
// landing at ~55% of it; then each letter shines in turn from `shine0`, `shineSlot` apart.
export function kickTiming(n, swap, pace, t0) {
  const slot = BEAT / (swap ? 16 : 8) * pace, fly = (swap ? 0.16 : 0.26) * pace;
  const inDur = (n - 1) * slot + fly;
  const shineSlot = (swap ? 0.025 : 0.045) * pace, shineDur = swap ? 0.1 : 0.16;
  const shine0 = nextBeat(t0 + inDur, 4) - t0;   // the letter-by-letter shine starts on a 16th
  return { slot, fly, inDur, land: fly * 0.55, shineSlot, shineDur, shine0 };
}
