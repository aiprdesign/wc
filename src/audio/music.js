// The music (v6/v7): a three-act trailer score in D minor, 120 BPM, bar = 2 s from t = 0 —
// all in STORY time. The Studio plays it on the film clock (× TIME_SCALE: 86.4 BPM, bar =
// 2.78 s), so every number below stays on the story grid and on the timeline's CUES.
//
// THEME (8 notes, heroic 5th + octave leaps):  D — A — D' — C' Bb — A — G — A
//   developed  fragment (piano, 6 s) → gentle full statement (piano + celesta, 12 s)
//   → horns (36 s: D A D' C', cut off by the Earth) → the MOONSHOT completes it (theme
//   head D — A on moonLanding, D' C' Bb A G A from earthrise) → EPIC statement (brass +
//   horns + choir, 49.5 s) → high D on the Picardy D-major chord at the pullBack → a
//   tender REPRISE (solo piano, 55.5 s) → the head D — A asked by the piano in the hush
//   and answered D — A — D' by the horns on the final button (65 s).
//
// ACT I   0 – 20    mystery & wonder: drone, distant choir, piano/celesta motif, space;
//                   designed hits on titleLocked (whoosh-hit), templeReveal (BRAAM),
//                   model3D (whoosh-hit on the dominant); riser bridges into act II.
// ACT II  20 – 49.5 the build: ONE spiccato + synth-pulse ostinato from 20.0 to the
//                   pullBack, never stopping at scene changes. A layer every 4 bars:
//                   20 ostinato + sub · 24 low brass swells, taiko, clock tick ·
//                   28 kick, hats, violins · 32 snare, toms, harmony climbs ·
//                   36 horns THEME, taiko 8ths, choir · BRAAM on earthWide ·
//   MOONSHOT 38.5 – 42.5 (two bars inserted; everything after moved +4 s = 2 bars, so the
//                   grid holds): the ostinato keeps running while the percussion thins over
//                   the translunar coast; lunarDescent is pulse + clock + a low D pedal and
//                   high string harmonics over Gm/D; a plagal swell into D MAJOR on
//                   moonLanding (horns + choir: the theme head), a shimmer on footprint, a
//                   noble lift to Bb on earthrise (horns + strings: the rest of the theme),
//                   then a snare pickup rebuilds into guidanceComputer / calculator ·
//                   44 16th hats, arps, tremolo · 48 everything + snare build.
// ACT III 49.5 – 54.5 climax: epic THEME over i–VI–III–iv–V, percussion accelerating
//                   8ths → 16ths → 32nd snare roll, suck-back, D MAJOR at the pullBack.
// CODA    54.5 – 72.5 (cue-pinned, see "the CODA" below): the climax blooms and decays
//                   into a tender reprise that gathers, breathes (ideasLine), swells on the
//                   sunrise into the final button at 65.0, and resolves in D major.

import { BEAT, CUES as C } from '../timeline.js';
import * as I from './instruments.js';
import * as O from './orchestra.js';
import * as X from './sfx.js';

export const STEP = BEAT / 4; // 16th note, 0.125 s

// The moonshot (38.5 – 42.5) was inserted into act II; act II's slow ramps (level, drive,
// brightness) are written in pre-moonshot time `ot(t)` and simply hold through it.
const M0 = 38.5, M1 = 42.5;
const ot = (t) => (t < M0 ? t : t < M1 ? M0 : t - (M1 - M0));
/** Piecewise-linear envelope through [time, value] points (held beyond the ends). */
const env = (t, pts) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, v1] = pts[i];
    if (t <= t1) { const [t0, v0] = pts[i - 1]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
  }
  return pts.at(-1)[1];
};
// ostinato / pulse level through the moonshot: eased back for the descent, never stopped
const MOON_PULSE = [[38.9, 1], [39.8, 0.72], [40.3, 0.72], [40.6, 0.86], [41.5, 0.86], [41.8, 1]];
// percussion thinning over the translunar coast (the layers then drop out for the descent)
const COAST = (t) => env(t, [[38.5, 1], [39.6, 0.35]]);

// ------------------------------------------------------------------ harmony

// str: string voicing · hi: upper strings (act II climb) · choir · brass (low) · root
export const CHORDS = {
  D5:   { str: [38, 50, 57, 62, 69],     hi: [69, 74, 81],     choir: [57, 62, 69],     brass: [38, 45, 50],     root: 38 },
  Bb9:  { str: [34, 46, 53, 60, 62, 65], hi: [65, 70, 72],     choir: [58, 62, 65, 72], brass: [34, 41, 46, 50], root: 34 },
  Dm:   { str: [38, 50, 57, 62, 65, 69], hi: [69, 74, 77],     choir: [57, 62, 65, 69], brass: [38, 45, 50, 53], root: 38 },
  Bb:   { str: [34, 46, 53, 62, 65, 70], hi: [70, 74, 77],     choir: [58, 62, 65, 70], brass: [34, 41, 46, 50], root: 34 },
  F:    { str: [29, 41, 53, 57, 60, 65], hi: [69, 72, 77],     choir: [57, 60, 65, 69], brass: [29, 41, 45, 48], root: 29 },
  C:    { str: [36, 48, 55, 60, 64, 67], hi: [67, 72, 76],     choir: [55, 60, 64, 67], brass: [36, 43, 48, 52], root: 36 },
  Gm:   { str: [31, 43, 50, 58, 62, 67], hi: [67, 70, 74],     choir: [55, 58, 62, 67], brass: [31, 43, 46, 50], root: 31 },
  Asus: { str: [33, 45, 52, 57, 62, 64], hi: [69, 74, 76],     choir: [57, 62, 64, 69], brass: [33, 45, 50, 52], root: 33 },
  A:    { str: [33, 45, 52, 57, 61, 64], hi: [69, 73, 76],     choir: [57, 61, 64, 69], brass: [33, 45, 49, 52], root: 33 },
  D:    { str: [38, 50, 57, 62, 66, 69, 74], hi: [74, 78, 81], choir: [57, 62, 66, 69, 74], brass: [38, 45, 50, 54], root: 38 },
  // lunar descent: G minor over a D pedal (iv⁶₄), thin and dark — resolves plagally to D major
  GmD:  { str: [38, 50, 55, 58, 62],     hi: [79, 82, 86],     choir: [55, 58, 62, 67],     brass: [38, 45, 50],     root: 38 },
};

export const HARMONY = [
  // ACT I
  [0.0, 4.0, 'D5'],    // open fifth, no third yet
  [4.0, 5.0, 'Bb9'],   // title assembling (suspended)
  [5.0, 8.0, 'Dm'],    // titleLocked
  [8.0, 10.6, 'Bb'],   // columns rise
  [10.6, 12.0, 'F'],   // templeReveal: III major
  [12.0, 14.0, 'Dm'],  // theme, gentle statement: i – VI – iv – V
  [14.0, 16.0, 'Bb'],
  [16.0, 18.4, 'Gm'],
  [18.4, 20.0, 'A'],   // model3D: dominant reveal pulls into act II
  // ACT II: i–VI–III–VII · i–VI–iv–V · theme (i–VI–III–iv–V) · climb
  [20.0, 22.0, 'Dm'], [22.0, 24.0, 'Bb'], [24.0, 26.0, 'F'], [26.0, 28.0, 'C'],
  [28.0, 30.0, 'Dm'], [30.0, 32.0, 'Bb'], [32.0, 34.0, 'Gm'], [34.0, 36.0, 'A'],
  [36.0, 37.0, 'Dm'], [37.0, 38.0, 'Bb'], [38.0, 38.8, 'F'],
  // MOONSHOT
  [38.8, 39.6, 'Dm'],  // translunar coast
  [39.6, 40.6, 'GmD'], // lunarDescent: iv over the D pedal …
  [40.6, 41.8, 'D'],   // … moonLanding: D major
  [41.8, 42.5, 'Bb'],  // earthrise: the noble lift (VI)
  [42.5, 43.0, 'F'], [43.0, 44.0, 'Gm'],
  [44.0, 45.3, 'A'],   // tension …
  [45.3, 46.0, 'Dm'],  // … released on the processor dive
  [46.0, 47.0, 'Bb'], [47.0, 48.0, 'C'],
  [48.0, 49.5, 'Asus'],// dominant pedal under the build into act III
  // ACT III
  [49.5, 51.0, 'Dm'], [51.0, 52.0, 'Bb'], [52.0, 53.0, 'F'], [53.0, 54.0, 'Gm'],
  [54.0, 54.5, 'A'],
  [54.5, 56.0, 'D'],   // pullBack: Picardy D major
];

export const chordAt = (t) => CHORDS[(HARMONY.find(([a, b]) => t >= a && t < b) ?? HARMONY.at(-1))[2]];

/** Call fn(time, velocity, step) for every non-rest step of a 16-step bar pattern in [from, to). */
export function pattern(from, to, pat, fn, step = STEP) {
  const vel = { X: 1, x: 0.75, o: 0.45 };
  for (let k = Math.ceil(from / step - 1e-6); k * step < to - 1e-6; k++) {
    const ch = pat[k % pat.length];
    if (ch !== '.') fn(k * step, vel[ch] ?? 0.75, k);
  }
}

// ------------------------------------------------------------------ THEME
// [time, midi, duration] per statement.
const THEME_NOTES = [62, 69, 74, 72, 70, 69, 67, 69];
const mk = (times, durs, tr = 0) => THEME_NOTES.map((m, i) => [times[i], m + tr, durs[i]]).filter(([t]) => t != null);

// 1. fragment (piano, after the title): D — A — D' … C'
const FRAGMENT = [[6.0, 62, 0.5], [6.5, 69, 0.5], [7.0, 74, 1.0], [8.0, 72, 1.5]];
// 2. gentle full statement (piano + celesta), a bar per two notes
const GENTLE = mk([12.0, 13.0, 14.0, 15.5, 16.0, 17.0, 17.5, 18.0], [1, 1, 1.5, 0.5, 1, 0.5, 0.5, 0.4]);
// 3. horns, act II: D A D' C' — the C' hangs over the Earth as the moonshot begins …
const HORNS = mk([36.0, 36.5, 37.0, 38.0], [0.5, 0.5, 1, 0.9]);
// … the moonshot completes it: the head D — A on moonLanding (horns + choir), then
// D' C' Bb A G A from earthrise into computing (horns + strings)
const LANDING = [[C.moonLanding, 62, 0.4], [C.moonLanding + 0.4, 69, 0.8]];
const EARTHRISE = [[C.earthrise, 74, 0.45], [C.earthrise + 0.45, 72, 0.25], [42.5, 70, 0.5], [43.0, 69, 0.5], [43.5, 67, 0.5], [44.0, 69, 1.3]];
// 4. epic statement → high D on the D-major pullBack
const EPIC = [
  [49.5, 62, 0.5], [50.0, 69, 1.0], [51.0, 74, 1.0], [52.0, 72, 0.5], [52.5, 70, 0.5],
  [53.0, 69, 0.5], [53.5, 67, 0.5], [54.0, 69, 0.42], [C.pullBack, 74, 1.0],
];

function themeLayer(S) {
  FRAGMENT.forEach(([t, m], i) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.24, pan: -0.12 + 0.06 * i });
    I.celesta(S, t, m + 12, { level: 0.02, pan: 0.3 });
  }));
  GENTLE.forEach(([t, m], i) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.2, pan: -0.15 + 0.04 * i });
    I.piano(S, t, m - 12, { level: 0.08, pan: -0.2 });
    I.celesta(S, t, m + 12, { level: 0.028, pan: 0.35 });
  }));
  // horns in octaves, violins shadowing an octave up
  S.at(36.0, () => {
    O.line(S, 'horn', HORNS, { level: 0.42, cutoff: 2600, bus: 'horn', octaves: [0, -12], release: 0.7 });
    O.line(S, 'strings', HORNS, { level: 0.12, cutoff: 5000, bus: 'strings', octaves: [12], release: 0.6 });
  });
  // epic: brass in the trumpet register, horns, choir, strings — all in octaves
  S.at(EPIC[0][0], () => {
    O.line(S, 'horn', EPIC, { level: 0.44, cutoff: 3200, bus: 'horn', octaves: [0, -12], release: 0.8 });
    O.line(S, 'brass', EPIC, { level: 0.2, cutoff: 3600, bus: 'brass', octaves: [12], release: 0.8 });
    O.line(S, 'choirA', EPIC, { level: 0.26, cutoff: 5500, bus: 'choir', octaves: [0, 12], release: 0.9 });
    O.line(S, 'strings', EPIC, { level: 0.16, cutoff: 6000, bus: 'strings', octaves: [12], release: 0.8 });
  });
}

// ------------------------------------------------------------------ pads (strings, choir)

// String bed level / brightness per act (0..1), in pre-moonshot time
function lift(t) {
  t = ot(t);
  if (t < 5) return 0.18;
  if (t < 12) return 0.34;
  if (t < 20) return 0.42;
  if (t < 45.5) return 0.46 + 0.38 * (t - 20) / 25.5;
  return 0.95;
}

// The moonshot's string bed: sul tasto and swelling over the descent, D major on the
// landing, full and bright (with the upper strings) on the earthrise.
const MOON_STR = {
  39.6: { level: 0.2, attack: 0.5, release: 0.3, cutoff: 2000, swell: 0.55 },
  40.6: { level: 0.34, attack: 0.1, release: 0.3, cutoff: 4200 },
  41.8: { level: 0.5, attack: 0.08, release: 0.3, cutoff: 5500, hi: true },
};

// The sub pulse's pitch for a chord (act II): its root, an octave up if below A1.
const subRoot = (c) => c.root + (c.root < 33 ? 12 : 0);

function stringsLayer(S) {
  for (const [a, b, name] of HARMONY) {
    if (a >= C.pullBack) break;
    const lv = lift(a);
    const first = a === 0;
    const start = first ? 1.0 : a - 0.12;
    const moon = MOON_STR[a];
    // while the sub pulse runs, it owns the bass fundamental: a string note in unison
    // with it would only beat against it (slow, deep cancellations of the low end)
    const notes = a >= 20 ? CHORDS[name].str.filter((m) => m !== subRoot(CHORDS[name])) : CHORDS[name].str;
    S.at(start, () => O.chord(S, 'strings', start, b, notes, moon ?? {
      level: 0.55 * lv, attack: first ? 3 : a < 20 ? 0.6 : 0.15, release: a < 20 ? 1.2 : 0.3,
      cutoff: 900 + 4000 * lv, swell: a === 8.0 ? 0.6 : null,
    }));
    // the climb: upper strings from 28, brighter every 4 bars (resting through the descent)
    if (a >= 28 && (!moon || moon.hi)) {
      const u = ot(a);
      S.at(a - 0.1, () => O.chord(S, 'strings', a - 0.1, b, CHORDS[name].hi.map((m) => m + (u >= 40 ? 12 : 0)), {
        level: 0.13 + 0.09 * (u - 28) / 22, attack: 0.2, release: 0.25, cutoff: 5500,
      }));
    }
  }
  // act I: tremolo crescendo + low tom roll carry the columns into the temple reveal
  S.at(8.4, () => O.tremolo(S, 8.4, C.templeReveal - 0.02, [58, 62, 65, 70], { level: 0.3, cutoff: 3500 }));
  for (let t = 9.0; t < C.templeReveal - 0.01; t += STEP) {
    const u = (t - 9.0) / 1.6;
    S.at(t, () => I.tom(S, t, 0.08 + 0.22 * u, { f: 88, pan: Math.round(t / STEP) % 2 ? 0.3 : -0.3 }));
  }
  // tremolo tension before the two big act II arrivals and the climax
  S.at(44.0, () => O.tremolo(S, 44.0, C.processorDive, [69, 73, 76, 81], { level: 0.15 }));
  S.at(53.0, () => O.tremolo(S, 53.0, OST_END, [74, 79, 81, 86], { level: 0.18 }));
}

const CHOIR = [
  // [start, end, chord, vowel, level, attack, release]
  [1.5, 5.0, 'D5', 'choirO', 0.1, 2.5, 0.8],    // distant
  [5.0, 8.9, 'Dm', 'choirO', 0.22, 0.3, 1.2],   // titleLocked (held into the columns: B♭maj7)
  [10.6, 12.4, 'F', 'choirA', 0.36, 0.1, 1.5],  // templeReveal
  [12.0, 14.2, 'Dm', 'choirO', 0.2, 1.2, 0.8],
  [14.0, 18.4, 'Bb', 'choirO', 0.12, 1.5, 0.6],  // behind the gentle theme
  [18.4, 20.2, 'A', 'choirA', 0.24, 0.1, 0.8],  // model3D
  [20.0, 22.0, 'Dm', 'choirO', 0.2, 0.3, 0.8],  // a breath under act II's first bar
  [36.0, 38.2, 'Dm', 'choirO', 0.14, 1.0, 0.4], // under the horn theme
  [38.2, 39.5, 'F', 'choirA', 0.28, 0.05, 0.7], // earthWide, fading over the coast
  [39.9, 40.6, 'GmD', 'choirO', 0.12, 0.6, 0.15],// descent: hushed, rising into …
  [40.6, 41.8, 'D', 'choirA', 0.3, 0.1, 0.3],    // … moonLanding: D major
  [41.8, 42.6, 'Bb', 'choirA', 0.32, 0.05, 0.4], // earthrise
  [45.3, 48.0, 'Dm', 'choirA', 0.22, 0.1, 0.4],
  [48.0, 49.5, 'Asus', 'choirA', 0.2, 1.0, 0.2],
  [49.5, 51.0, 'Dm', 'choirA', 0.26, 0.05, 0.2], // act III chords under the epic theme
  [51.0, 52.0, 'Bb', 'choirA', 0.28, 0.05, 0.2],
  [52.0, 53.0, 'F', 'choirA', 0.3, 0.05, 0.2],
  [53.0, 54.0, 'Gm', 'choirA', 0.32, 0.05, 0.2],
  [54.0, 54.42, 'A', 'choirA', 0.34, 0.05, 0.05],
  [54.5, 55.5, 'D', 'choirA', 0.45, 0.03, 0.6],  // pullBack
];

function choirLayer(S) {
  for (const [a, b, name, vowel, level, attack, release] of CHOIR) {
    S.at(a, () => O.chord(S, vowel, a, b, CHORDS[name].choir, { level, attack, release, cutoff: 5200, dark: 0.5, bus: 'choir' }));
  }
}

// ------------------------------------------------------------------ act I colour

function actOne(S) {
  // celesta sparkles of the theme head as the point appears / grid draws
  [[0.6, 86], [1.0, 93], [2.6, 98]].forEach(([t, m]) => S.at(t, () => I.celesta(S, t, m, { level: 0.025, pan: 0.3, bus: 'far' })));
  // distant piano: the leap D — A, twice, as the layers draw (before the title)
  [[2.0, 50], [2.5, 57], [3.0, 62]].forEach(([t, m]) => S.at(t, () => I.piano(S, t, m, { level: 0.12, pan: -0.2, bus: 'far' })));
  // low sustained brass swell into the temple (no BRAAM at the title: a whoosh-hit)
  S.at(8.6, () => O.brass(S, 8.6, 2.0, CHORDS.Bb.brass, { level: 0.2, attack: 1.6, release: 0.3 }));
  S.at(12.0, () => O.brass(S, 12.0, 6.4, [38, 45, 50], { level: 0.08, attack: 3, release: 1.5 }));
  // harp: golden-ratio spiral
  [58, 62, 65, 70, 74, 77, 82].forEach((m, k) => {
    const t = C.goldenRatio + 0.55 * (1 - 0.618 ** k);
    S.at(t, () => I.pluck(S, t, m, { level: 0.1, pan: Math.sin(k * 2.4) * 0.6 }));
  });
  // civic words: celesta answers
  [[C.wordCivic, 81], [C.wordLaw, 86], [C.wordRepresentation, 84]].forEach(([t, m]) => S.at(t, () => I.celesta(S, t, m, { level: 0.03 })));
  // a low pulse that foreshadows act II (quarter notes, 16–20, very soft pizz)
  pattern(16.0, 20.0, 'x...o...x...o...', (t, v) => S.at(t, () => I.pizz(S, t, chordAt(t).root + 12, { level: 0.12 * v })));
  // the falling apple lands on the downbeat of act II
  [81, 76, 72, 69, 64, 57].forEach((m, k) => {
    const t = C.fallStart + k * 0.09;
    S.at(t, () => I.pluck(S, t, m, { level: 0.1 - k * 0.008, pan: 0.3 - k * 0.1 }));
  });
}

// ------------------------------------------------------------------ act II/III engine

// The ostinato never stops from 20.0 to the pullBack; only its level and register move.
const OST_END = C.pullBack - 0.08; // leaves the suck-back its 80 ms of silence
const drive = (t) => { const u = ot(t); return u < 45.5 ? 0.55 + 0.45 * (u - 20) / 25.5 : 1 + 0.25 * (u - 45.5) / 5; };

function ostinato(S) {
  // 3+3+2 accented 16ths: root · root · 5th | root · octave · root | 5th · octave …
  const fig = [0, 0, 7, 0, 12, 0, 7, 12, 0, 0, 7, 0, 12, 0, 15, 12];
  const acc = [1, 0.5, 0.6, 0.95, 0.5, 0.6, 0.9, 0.55, 1, 0.5, 0.6, 0.95, 0.5, 0.6, 0.9, 0.6];
  pattern(20.0, OST_END, 'x'.repeat(16), (t, v, k) => {
    const ch = chordAt(t);
    let r = ch.root;
    while (r < 45) r += 12;
    let iv = fig[k % 16];
    if (iv === 15) iv = ch.choir.some((m) => (m - r - 4) % 12 === 0) ? 16 : 15; // major or minor third
    // phrase shaping: each 2-bar phrase leans forward into the next downbeat
    const phrase = 0.92 + 0.1 * ((t % 4) / 4);
    const lv = 0.2 * acc[k % 16] * drive(t) * phrase * env(t, MOON_PULSE);
    S.at(t, () => {
      O.spiccato(S, t, r + iv, { level: lv });
      if (t >= 32 && k % 4 === 0) O.spiccato(S, t, r + iv + 12, { level: lv * 0.5 }); // violins join an octave up
    });
  });
}

// The electronic half of the ostinato (rendered with the rhythm section).
function pulse(S) {
  // synth pulse: 8ths, filtered saw, doubled with the sub pulse
  pattern(20.0, OST_END, 'x.x.x.x.x.x.x.x.', (t, v, k) => {
    const m = chordAt(t).root + 24;
    const u = (ot(t) - 20) / 30, mp = env(t, MOON_PULSE);
    S.at(t, () => I.synthPluck(S, t, m, { level: (k % 4 ? 0.035 : 0.05) * (0.8 + 0.6 * u) * mp, decay: 0.18, cutoff: (900 + 2600 * u) * mp, pan: k % 4 ? 0.25 : -0.25 }));
  });
  // sub pulse (mono): one voice for the whole act
  const t0 = 20.0;
  const roots = HARMONY.filter(([, b]) => b > t0).map(([a, , n]) => [Math.max(a, t0), subRoot(CHORDS[n])]);
  const hits = [];
  for (let t = t0; t < OST_END - 1e-6; t += BEAT / 2) {
    const on = Math.round(t / (BEAT / 2)) % 2 === 0;
    hits.push({ t, v: (on ? 1 : 0.65) * (t < 24 ? 0.6 : t < 28 ? 0.8 : 1) * env(t, [[39.4, 1], [39.7, 0.75], [41.6, 0.75], [41.8, 1]]), len: 0.22 });
  }
  hits.push({ t: C.pullBack, v: 1.1, len: 1.4 });
  S.at(t0, () => I.subPulse(S, t0, C.earthReveal + 0.3, roots, hits, { level: 0.36 }));
}

// Layer entries, every 4 bars. [from, to, pattern, level(t)?] — the kit thins out over
// the translunar coast, rests through the descent and landing, and is back on earthrise.
// (v7: at the film's 86.4 BPM the grid is 39 % wider, so the groove carries more 16ths —
// taiko pickups from 28, 16th hats from 28 / 32 — to keep the hybrid section driving.)
const TAIKO = [
  [24.0, 28.0, 'X.......x.....x.'],
  [28.0, 32.0, 'X.....o.x...o.x.'],
  [32.0, 36.0, 'X.....x.x.....x.'],
  [36.0, M0, 'X.x.x.x.X.x.x.x.'],    // 8ths with the horn theme
  [M0, 39.6, 'X.......x.......', COAST], // translunar: half time
  [41.8, 48.0, 'X.x.x.x.X.x.x.x.'],  // earthrise → computing
  [48.0, 49.5, 'X.x.X.x.X.xxX.xx'],
  [49.5, 53.0, 'X.x.x.x.X.x.x.x.'],
  [53.0, OST_END, 'XxxxXxxxXxxxXxxx'], // 16ths into the peak
];
const KICK = [[28.0, M0, 'X...x...X...x...'], [M0, 39.6, 'X...x...X...x...', COAST], [41.8, 49.5, 'X...x...X...x...'], [49.5, OST_END, 'X...x...X...x.x.']];
const HATS = [[28.0, 32.0, 'x.o.x.oox.o.x.oo'], [32.0, M0, 'xoxoxoxoxoxoxoxo'], [M0, 39.6, 'x.o.x.o.x.o.x.o.', COAST], [41.8, 44.0, 'xoxoxoxoxoxoxoxo'], [44.0, OST_END, 'xoxoXoxoxoxoXoxo']];
const SNARE = [[32.0, M0, '....x.......x...'], [42.5, 48.0, '....x.......x...'], [48.0, 49.5, '....x...x.x.xxxx'], [49.5, 53.0, '....x.......x...']];
const TOMS = [[32.0, M0, '............x.xx'], [42.5, 48.0, '............x.xx'], [48.0, 49.5, '..x.x.x.x.x.xxxx'], [49.5, 53.0, '..........x.x.x.']];
const TICK = [[24.0, 49.5, 'x.x.x.x.x.x.x.x.']]; // the mission clock keeps ticking through the descent

function rhythm(S, kicks) {
  const d = (t) => drive(t);
  const play = (table, fn) => { for (const [a, b, p, m] of table) pattern(a, b, p, (t, v, k) => fn(t, v * (m ? m(t) : 1), k, v)); };
  play(TAIKO, (t, v, k, v0) => S.at(t, () => I.taiko(S, t, 0.5 * v * d(t), { size: v0 > 0.9 ? 1 : 0.6 })));
  play(KICK, (t, v) => { kicks.push(t); S.at(t, () => I.kick(S, t, 0.75 * v * d(t))); });
  play(HATS, (t, v, k) => S.at(t, () => I.hat(S, t, 0.075 * v * d(t), { pan: 0.25 + (k % 2) * 0.12 })));
  play(SNARE, (t, v) => S.at(t, () => I.snare(S, t, 0.22 * v * d(t), { pan: 0.05 })));
  play(TOMS, (t, v, k) => S.at(t, () => I.tom(S, t, 0.3 * v * d(t), { f: k % 2 ? 96 : 128, pan: k % 2 ? -0.4 : 0.4 })));
  // the ticking clock (a trailer staple): dry tick-tock on 8ths
  play(TICK, (t, v, k) => S.at(t, () => X.click(S, t, {
    level: 0.03 + 0.015 * (ot(t) - 24) / 21.5, freq: k % 4 ? 2600 : 3600, body: k % 4 ? 980 : 1250, q: 4, decay: 0.016, pan: k % 4 ? 0.3 : -0.3, bus: 'perc',
  })));
  // act III: accelerating snare roll (16ths from 53, 32nds from 54) into the suck-back
  for (let t = 53.0; t < OST_END - 1e-6; t += t < 54 ? STEP : STEP / 2) {
    const u = (t - 53) / 1.42;
    S.at(t, () => I.snare(S, t, 0.06 + 0.2 * u, { pan: -0.1 }));
  }
  // open hats on every bar downbeat from 44
  pattern(44.0, OST_END, 'X...............', (t) => S.at(t, () => I.hat(S, t, 0.06, { open: true, pan: -0.3 })));
}

function lowBrass(S) {
  // two-bar crescendo swells from 24 (layer 2), then sforzando stabs in act III
  // (the moonshot's descent, landing and earthrise have their own brass — see moonshot)
  for (const [a, b, name] of HARMONY) {
    if (a < 24 || a >= 49.5 || (a >= 39.6 && a < M1)) continue;
    const u = ot(a);
    S.at(a, () => O.brass(S, a, b - a, CHORDS[name].brass, { level: 0.2 + 0.16 * (u - 24) / 21, attack: Math.min(1.4, (b - a) * 0.7), release: 0.5, bright: 1400 + 1200 * (u - 24) / 21 }));
  }
  for (const [a, b, name] of HARMONY) {
    if (a < 49.5 || a >= C.pullBack) continue;
    S.at(a, () => O.brass(S, a, b - a - 0.04, CHORDS[name].brass, { level: 0.5, sfz: true, release: 0.2, bright: 2400 }));
  }
}

function arps(S) {
  const shape = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern(44.0, OST_END, 'x'.repeat(16), (t, v, k) => {
    const tones = chordAt(t).choir.slice(0, 4).map((m) => m + 12);
    const u = (t - 44) / 10.5;
    S.at(t, () => I.synthPluck(S, t, tones[shape[k % 8] % tones.length], {
      level: (k % 4 === 0 ? 0.03 : 0.02) * (0.8 + 0.5 * u), pan: k % 2 ? 0.5 : -0.5, decay: 0.14, cutoff: 2200 + 2500 * u,
    }));
  });
}

// ------------------------------------------------------------------ trailer toolkit

// Whoosh-hit: an air swoosh swelling INTO the downbeat + sub + taiko + cymbal.
function whooshHit(S, t, power = 1, pan = 0.6) {
  S.at(t - 0.7, () => I.whoosh(S, t - 0.7, 0.9, { level: 0.1 * power, f0: 250, f1: 5000, pan0: -pan, pan1: pan, peak: 0.78, kind: 'white' }));
  S.at(t, () => {
    I.boom(S, t, { level: 0.5 * power, f0: 85, f1: 34, decay: 1.8 });
    I.taiko(S, t, 0.55 * power, { size: 1 });
    I.crash(S, t, 0.07 * power);
    X.impact(S, t, { level: 0.09 * power, pan: pan * 0.3 });
  });
}

// Designed hit: sub + taiko (+ BRAAM, harp bloom, downer), with pad ducking.
// `ring` (seconds): the BRAAM starts to fade after this and dies away naturally (default:
// it holds 1.6 + power seconds, then cuts off quickly).
function hit(S, t, { power = 1, braam = null, chord = null, down = false, subHz = 85, ring = null } = {}) {
  S.at(t, () => {
    I.boom(S, t, { level: 0.5 * power, f0: subHz, f1: 34, decay: 1.4 + power });
    I.taiko(S, t, 0.6 * power, { size: 1 });
    I.crash(S, t, 0.08 * power);
    X.impact(S, t, { level: 0.1 * power, metal: braam != null ? 1 : 0.4 });
    if (braam != null) O.braam(S, t, braam, { level: 0.42 * power, power, dur: ring ?? 1.6 + power, close: (1.6 + power) / 3, release: ring ? 0.4 : 0.09 });
    if (chord) I.harpRoll(S, t, CHORDS[chord].choir.concat(CHORDS[chord].choir.at(-1) + 12), { level: 0.08 * power });
    if (down) I.downer(S, t + 0.1, { level: 0.05 * power, dur: 1.0 });
  });
}

function transitions(S) {
  // risers: title, temple, act I → II bridge, 4-bar layer arrivals, act II → III, climax
  const R = [
    [3.6, C.titleLocked, 0.035, 400, 5000, null],
    [9.4, C.templeReveal, 0.05, 300, 6000, [41, 65]],
    [18.4, 20.0, 0.04, 300, 6000, [45, 62]],   // bridge into act II (lands on the ostinato)
    [26.5, 28.0, 0.035, 400, 6000, null],      // into layer 3 (train shots): a lift, no gap
    [30.5, 32.0, 0.035, 400, 6000, null],
    [34.5, 36.0, 0.045, 300, 7000, [45, 62]],
    [36.8, C.earthWide, 0.05, 300, 7000, null],
    [41.25, C.earthrise, 0.03, 400, 6000, [46, 70]],  // moonshot: the lift into the earthrise
    [42.0, C.calculator, 0.025, 500, 7000, null],     // … rebuilding into computing
    [44.0, C.processorDive, 0.08, 250, 8000, [45, 74]],
    [46.0, 49.5, 0.1, 200, 8000, [38, 69]],    // bridge into act III
    [50.0, OST_END, 0.16, 200, 9500, [38, 74]],  // the long climb into the peak
  ];
  for (const [a, b, level, from, to, pitch] of R) S.at(a, () => I.riser(S, a, b, { level, from, to, pitch }));
  // reverse cymbals into bar-line changes (they resolve ON the downbeat) and the moonshot's
  // two arrivals (a slow, soft one into the landing)
  for (const [t, d, l] of [[20.0, 1.0, 0.04], [24.0, 0.8, 0.035], [28.0, 1.0, 0.05], [32.0, 1.0, 0.05], [36.0, 1.0, 0.06],
    [C.moonLanding, 1.3, 0.03], [C.earthrise, 0.6, 0.04], [48.0, 1.0, 0.05]]) {
    S.at(t - d, () => I.revCymbal(S, t, d, { level: l }));
  }
  // SUCK-BACK (only before the two biggest hits): reverse swell, then 80 ms of silence
  S.at(OST_END - 1.12, () => I.swellIn(S, OST_END, 1.12, { level: 0.14 }));
}

function accents(S) {
  whooshHit(S, C.titleLocked, 0.85);
  hit(S, C.templeReveal, { power: 0.85, braam: 53, chord: 'F', down: true });   // BRAAM 1
  whooshHit(S, C.model3D, 0.7, -0.6);
  S.at(C.model3D, () => I.harpRoll(S, C.model3D, [57, 61, 64, 69, 73, 76], { level: 0.07 }));
  hit(S, 20.0, { power: 0.45 });                                                 // act II begins
  hit(S, C.gear, { power: 0.55 });
  hit(S, 28.0, { power: 0.6 });                                                  // layer 3, bar line (train)
  S.at(C.spark, () => I.taiko(S, C.spark, 0.35, { size: 0.6 }));
  hit(S, 32.0, { power: 0.6 });
  hit(S, 36.0, { power: 0.7 });
  hit(S, C.earthWide, { power: 1.0, braam: 41, chord: 'F', down: true });        // BRAAM 2
  hit(S, C.processorDive, { power: 0.95, down: true });
  S.at(C.pageSphere, () => { I.taiko(S, C.pageSphere, 0.4, { size: 0.6 }); I.crash(S, C.pageSphere, 0.04); });
  hit(S, C.earthrise, { power: 0.72, chord: 'Bb' });                             // the noble lift
  hit(S, 49.5, { power: 1.0, chord: 'Dm' });                                     // ACT III
  hit(S, C.pullBack, { power: 1.3, braam: 50, chord: 'D', subHz: 95, ring: 0.8 }); // BRAAM 3: the peak (blooms, then dies away)
  S.at(C.pullBack, () => { I.taiko(S, C.pullBack + 0.02, 0.6, { size: 0.6 }); I.kick(S, C.pullBack, 0.9); });
  S.at(C.pullBack, () => O.brass(S, C.pullBack, 0.9, CHORDS.D.brass, { level: 0.6, sfz: true, bright: 2800, release: 0.5 }));
  S.at(C.pullBack, () => O.chord(S, 'strings', C.pullBack, C.pullBack + 0.9, CHORDS.D.str, { level: 0.55, attack: 0.03, release: 0.4, cutoff: 5500 }));
}

// ------------------------------------------------------------------ the CODA (54.5 – 72.5)
//
//   54.5 pullBack    the D-major climax hit blooms (strings + choir into the long space) and
//                    dies away naturally — no cut to silence
//   55.5 earthReveal tender REPRISE of the theme: solo piano (+ a celesta shadow), a halo of
//                    high violins on A–D, a low D pedal; lots of air
//   56.5 – 61        it gathers: violas / cellos (Bb – F – Gm – D/F♯ – Gm – Asus4, the bass
//                    walking Bb F G F♯ G A), a distant choir from 57.25, soft horns from 58.5
//   61.0 ideasLine   a hushed breath: piano + choir on A sus4, the piano asks D — A …
//   63.6 sunrise     … the swell: Bb → C (♭VI – ♭VII) strings, horns, choir and low brass
//                    crescendo, tremolo, a rising timpani roll and cymbal swell; a short
//                    suck-back (64.92)
//   65.0 finalImpact … answered: the loudest moment of the film — sub, taiko ensemble, BRAAM,
//                    full orchestra + choir on D major, horns (+ trumpets, violins) singing
//                    the theme head D — A — D'; it rings into the long space
//   66.8 closingLine piano + celesta echo the head, pp, over the decaying chord
//   67 – 72          a peaceful D-major resolution (strings, "ooh" choir) fading out over a
//                    final soft low D (69.0); silence by ~72.3
//
// Studio A (orchestra) plays the reprise and the swell on the film buses (hall + stage) and
// falls silent at the suck-back; studio B plays the bloom, the timpani / cymbals, the final
// impact and the resolution on the finale buses (5 s space).

// Coda harmony: [start, end, violas/cellos/basses, choir, horns]
const CODA = [
  [56.5, 57.25, [34, 46, 53, 58, 62], [58, 62, 65], null],              // Bb
  [57.25, 58.0, [29, 41, 53, 57, 60], [57, 60, 65], null],              // F
  [58.0, 58.5, [31, 43, 50, 58, 62], [55, 58, 62], null],               // Gm
  [58.5, 59.25, [30, 42, 50, 57, 62], [57, 62, 66], [54, 57, 62]],      // D/F♯
  [59.25, 60.0, [31, 43, 50, 58, 62], [55, 58, 62, 67], [55, 58, 62]],  // Gm
  [60.0, 61.0, [33, 45, 52, 57, 62, 64], [57, 62, 64, 69], [57, 62, 64]], // A sus4
];
// the reprise melody (piano), a bar-and-a-bit slower than the gentle statement
const REPRISE = [[55.5, 62], [56.0, 69], [56.5, 74], [57.25, 72], [58.0, 70], [58.5, 69], [59.25, 67], [60.0, 69]];
// the piano's left hand: rolling chord tones under each harmony
const REPRISE_LH = [
  [55.5, 38, 1], [56.0, 45, 0.8],
  [56.5, 46, 1], [56.75, 53], [57.0, 58],
  [57.25, 41, 1], [57.5, 48], [57.75, 57],
  [58.0, 43, 1], [58.25, 50],
  [58.5, 42, 1], [58.75, 50], [59.0, 57],
  [59.25, 43, 1], [59.5, 50], [59.75, 58],
  [60.0, 45, 1], [60.25, 52], [60.5, 57], [60.75, 62],
];
const SUCK = C.finalImpact - 0.08; // the short suck-back before the button
const D_MAJOR = [38, 50, 57, 62, 66, 69, 74];

// Studio A: reprise → gathering → hush → swell (film buses)
function coda(S) {
  // low D pedal (basses + a soft drone) under the reprise's first phrase
  S.at(55.2, () => {
    O.chord(S, 'strings', 55.2, 56.7, [26, 38], { level: 0.15, attack: 0.9, release: 0.7, cutoff: 650, dark: 0.6 });
    I.drone(S, 55.3, 56.6, 26, { level: 0.03, attack: 0.9, release: 0.9, beat: 0.2 });
  });
  // the halo: violins on A–D (a common tone of every chord of the reprise), sul tasto, growing
  S.at(55.35, () => O.chord(S, 'strings', 55.35, 61.0, [81, 86], { level: 0.085, attack: 1.2, release: 0.6, cutoff: 3400, dark: 0.55, swell: 0.45 }));
  // solo piano, a celesta shadow for the first phrase
  REPRISE.forEach(([t, m], i) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.15, pan: -0.08 });
    if (i < 5) I.celesta(S, t, m + 12, { level: 0.02, pan: 0.3 });
  }));
  REPRISE_LH.forEach(([t, m, accent]) => S.at(t, () => I.piano(S, t, m, { level: accent ? 0.085 * accent : 0.06, pan: -0.2 })));
  // violas / cellos from storyOne, growing; choir from 57.25; horns from storyTwo
  CODA.forEach(([a, b, str, choir, horns], k) => {
    const u = (a - 56.5) / 4;
    const t0 = k ? a - 0.08 : a;
    // violas / cellos first; the basses (the lowest note) join on storyTwo
    S.at(t0, () => O.chord(S, 'strings', t0, b, a < C.storyTwo ? str.slice(1) : str, {
      level: 0.13 + 0.15 * u, attack: k ? 0.3 : 0.7, release: k === CODA.length - 1 ? 0.8 : 0.45, cutoff: 1700 + 1600 * u, dark: 0.5,
    }));
    if (a >= 57.25) S.at(t0, () => O.chord(S, 'choirA', t0, b, choir, { level: 0.05 + 0.07 * u, attack: k === 1 ? 0.6 : 0.3, release: 0.5, cutoff: 3200, dark: 0.5, bus: 'choir' }));
    if (horns) S.at(t0, () => O.chord(S, 'horn', t0, b, horns, { level: 0.1 + 0.05 * u, attack: k === 3 ? 0.5 : 0.3, release: 0.5, cutoff: 1500, dark: 0.5, bus: 'horn' }));
  });

  // ideasLine: the hush — piano + choir on A sus4, a thread of violins and a soft low A
  const h0 = C.ideasLine, h1 = C.sunrise + 0.1;
  S.at(h0 - 0.1, () => {
    O.chord(S, 'choirO', h0 - 0.1, h1, [57, 62, 64, 69], { level: 0.1, attack: 0.5, release: 0.5, cutoff: 3000, dark: 0.5, bus: 'choir' });
    O.chord(S, 'strings', h0 - 0.1, h1, [81, 86, 88], { level: 0.045, attack: 0.6, release: 0.5, cutoff: 3200, dark: 0.55 });
    O.chord(S, 'strings', h0 - 0.1, h1, [33, 45], { level: 0.07, attack: 0.6, release: 0.5, cutoff: 500, dark: 0.6 });
  });
  S.at(h0, () => {
    I.piano(S, h0, 33, { level: 0.07, pan: -0.2 });
    [74, 76, 81].forEach((m, i) => I.piano(S, h0 + 0.12 * i, m, { level: 0.09, pan: 0.1 }));
  });
  // … the piano asks the theme's question (D — A), leaving D' for the horns to answer
  [[62.2, 62], [62.7, 69]].forEach(([t, m]) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.13, pan: -0.08 });
    I.celesta(S, t, m + 12, { level: 0.018, pan: 0.3 });
  }));

  // sunrise: the swell, Bb → C, everything crescendo into the suck-back
  const s0 = C.sunrise, s1 = 64.3;
  S.at(s0 - 0.05, () => {
    O.chord(S, 'strings', s0 - 0.05, s1, CHORDS.Bb.str.concat([74, 77]), { level: 0.42, attack: 0.3, release: 0.15, cutoff: 4200, swell: 0.45 });
    O.chord(S, 'choirA', s0 - 0.05, s1, [58, 62, 65, 70], { level: 0.26, attack: 0.3, release: 0.15, cutoff: 4800, swell: 0.45, bus: 'choir' });
    O.brass(S, s0, s1 - s0, [46, 53, 58, 62], { kind: 'horn', level: 0.26, attack: 0.55, release: 0.12, bright: 1600, bus: 'horn' });
    O.brass(S, s0, s1 - s0, CHORDS.Bb.brass, { level: 0.2, attack: 0.6, release: 0.12, bright: 1300 });
    O.tremolo(S, s0, SUCK, [74, 77, 81, 86], { level: 0.2, cutoff: 5000 });
  });
  S.at(s1 - 0.05, () => {
    O.chord(S, 'strings', s1 - 0.05, SUCK, CHORDS.C.str.concat([72, 76, 79]), { level: 0.66, attack: 0.25, release: 0.03, cutoff: 5500, swell: 0.55 });
    O.chord(S, 'choirA', s1 - 0.05, SUCK, [55, 60, 64, 67, 72], { level: 0.38, attack: 0.25, release: 0.03, cutoff: 5200, swell: 0.55, bus: 'choir' });
    O.brass(S, s1, SUCK - s1, [48, 55, 60, 64], { kind: 'horn', level: 0.4, attack: 0.3, release: 0.03, bright: 2200, bus: 'horn' });
    O.brass(S, s1, SUCK - s1, CHORDS.C.brass, { level: 0.32, attack: 0.3, release: 0.03, bright: 1900 });
  });
}

// Studio B: the bloom after the climax, the sunrise percussion, the final button, the echo
// and the resolution (finale buses: 5 s space)
function codaFinale(S) {
  // pullBack: the D-major chord blooms into the long space and decays into the reprise
  const p = C.pullBack;
  S.at(p + 0.05, () => {
    O.chord(S, 'strings', p + 0.05, p + 0.8, [50, 57, 62, 66, 69, 74, 78, 81], { level: 0.2, attack: 0.3, release: 1.7, cutoff: 4200, dark: 0.5, bus: 'end' });
    O.chord(S, 'choirA', p + 0.1, p + 0.9, [57, 62, 66, 69, 74], { level: 0.13, attack: 0.35, release: 1.5, cutoff: 4500, dark: 0.5, bus: 'end' });
  });

  // sunrise: a rising timpani roll on D and a cymbal swell into the suck-back
  const s0 = C.sunrise;
  for (let t = s0, k = 0; t < SUCK - 0.03; t += STEP / 2, k++) {
    const u = (t - s0) / (SUCK - s0);
    S.at(t, () => I.tom(S, t, 0.03 + 0.3 * u * u, { f: 72, pan: k % 2 ? 0.2 : -0.2, bus: 'endDry' }));
  }
  S.at(s0, () => {
    I.riser(S, s0, SUCK, { level: 0.05, from: 300, to: 7500, bus: 'end' });
    // the sun breaks: a harp sweep up the Bb chord and a soft low bloom
    I.harpRoll(S, s0, [46, 53, 58, 62, 65, 70, 74, 77, 82], { level: 0.06, spread: 0.04, bus: 'end' });
    I.boom(S, s0, { level: 0.14, f0: 58, f1: 40, decay: 1.6, bus: 'endDry' });
  });
  S.at(SUCK - 1.3, () => I.revCymbal(S, SUCK, 1.3, { level: 0.08, bus: 'end' }));
  S.at(SUCK - 0.8, () => I.swellIn(S, SUCK, 0.8, { level: 0.06, bus: 'end', top: 7000 }));

  // FINAL IMPACT: the button — the loudest moment of the film
  const t = C.finalImpact;
  S.at(t, () => {
    I.boom(S, t, { level: 1.0, f0: 110, f1: 32, decay: 5, bus: 'endDry' });
    I.taiko(S, t, 1.0, { size: 1, bus: 'end' });
    I.taiko(S, t + 0.018, 0.7, { size: 1, bus: 'endDry' });
    I.taiko(S, t + 0.035, 0.55, { size: 0.6, bus: 'end' });
    I.kick(S, t, 0.95, { bus: 'endDry' });
    I.crash(S, t, 0.12, { bus: 'end' });
    I.crash(S, t + 0.01, 0.08, { bus: 'endDry' });
    X.impact(S, t, { level: 0.16, bus: 'end', metal: 1 });
    O.braam(S, t, 50, { level: 0.62, power: 1.3, dur: 1.4, close: 1.0, release: 0.5, bus: 'end' });
    O.brass(S, t, 1.5, [26, 38, 45, 50, 54, 57], { level: 0.55, sfz: true, bright: 2300, release: 2.4, bus: 'end' });
    O.chord(S, 'choirA', t, t + 1.4, [57, 62, 66, 69, 74, 78], { level: 0.5, attack: 0.05, release: 2.6, cutoff: 5200, bus: 'end' });
    O.chord(S, 'strings', t, t + 1.4, D_MAJOR.concat([78, 81, 86]), { level: 0.5, attack: 0.04, release: 2.8, cutoff: 4500, bus: 'end' });
    I.harpRoll(S, t, [50, 57, 62, 66, 69, 74, 78, 81], { level: 0.09, bus: 'end' });
    // the answer: horns in octaves (+ trumpets and violins above) sing D — A — D'
    const head = [[t, 62, 0.5], [t + 0.5, 69, 0.5], [t + 1.0, 74, 1.35]];
    O.line(S, 'horn', head, { level: 0.5, cutoff: 2600, bus: 'end', octaves: [0, -12], release: 1.8 });
    O.line(S, 'brass', head, { level: 0.2, cutoff: 3400, bus: 'end', octaves: [12], release: 1.5 });
    O.line(S, 'strings', head, { level: 0.16, cutoff: 6000, bus: 'end', octaves: [12, 24], release: 2.0 });
  });
  // … and the drums answer with them (v7): a lighter stroke on A, a broad one on the high D'
  S.at(t + 0.5, () => I.taiko(S, t + 0.5, 0.36, { size: 0.6, bus: 'end' }));
  S.at(t + 1.0, () => {
    I.taiko(S, t + 1.0, 0.55, { size: 1, bus: 'end' });
    I.boom(S, t + 1.0, { level: 0.3, f0: 70, f1: 34, decay: 3.2, bus: 'endDry' });
  });

  // closingLine: piano + celesta echo the theme head, pp, over the decaying chord
  const e = C.closingLine;
  [[e, 74], [e + 0.5, 81], [e + 1.0, 86]].forEach(([u, m], i) => S.at(u, () => {
    I.piano(S, u, m, { level: 0.14 - 0.01 * i, bus: 'end', pan: 0.1 });
    I.celesta(S, u + 0.01, m + 12, { level: 0.028, bus: 'end', pan: 0.3 });
  }));

  // the resolution: a peaceful D-major bed (strings + "ooh" choir) fading out …
  S.at(66.6, () => {
    O.chord(S, 'strings', 66.6, 69.8, [38, 50, 57, 62, 66, 69, 74, 78], { level: 0.17, attack: 1.2, release: 3.5, cutoff: 2600, dark: 0.5, bus: 'end' });
    O.chord(S, 'choirO', 66.8, 69.6, [57, 62, 66, 69], { level: 0.1, attack: 1.4, release: 3.2, cutoff: 3200, dark: 0.5, bus: 'end' });
  });
  // … over a final soft low D (piano, timpani, basses) and one last high glint
  S.at(68.4, () => O.chord(S, 'strings', 68.4, 69.8, [26], { level: 0.12, attack: 0.8, release: 2.4, cutoff: 500, dark: 0.6, bus: 'end' }));
  S.at(69.0, () => {
    I.piano(S, 69.0, 26, { level: 0.08, bus: 'end' });
    I.piano(S, 69.0, 38, { level: 0.1, bus: 'end' });
    I.tom(S, 69.0, 0.07, { f: 72, bus: 'end' });
    I.pluck(S, 69.03, 50, { level: 0.06, bus: 'end' });
    I.celesta(S, 69.05, 86, { level: 0.014, bus: 'end', pan: 0.25 });
  });
}

// ------------------------------------------------------------------ the MOONSHOT

// Orchestra: the descent's low pedal and high harmonics, the landing's plagal D-major
// swell with the theme head, and the earthrise statement that carries on into computing.
function moonshot(S) {
  // lunarDescent: a sustained low D (basses, low brass, a drone underneath) …
  S.at(39.3, () => {
    O.chord(S, 'strings', 39.3, 41.75, [26, 38], { level: 0.2, attack: 0.7, release: 0.4, cutoff: 600, dark: 0.6 });
    O.brass(S, 39.45, 2.25, [26, 38], { level: 0.09, attack: 0.9, release: 0.35, bright: 500 });
    I.drone(S, 39.4, 41.75, 26, { level: 0.05, attack: 0.8, release: 0.5, beat: 0.2 });
  });
  // … and high harmonics: an open fifth with the E that leans onto F♯ at the landing
  S.at(39.45, () => O.chord(S, 'strings', 39.45, 40.62, [86, 88, 93], { level: 0.07, attack: 0.5, release: 0.25, cutoff: 3600, dark: 0.7 }));
  S.at(40.5, () => O.chord(S, 'strings', 40.5, 41.8, [86, 90, 93], { level: 0.06, attack: 0.12, release: 0.5, cutoff: 3800, dark: 0.7 }));
  // moonLanding: a reverent crescendo of low brass into D major; horns + choir sing D — A
  S.at(40.05, () => O.brass(S, 40.05, 1.7, CHORDS.D.brass, { level: 0.13, attack: 0.55, release: 0.35, bright: 1300 }));
  S.at(C.moonLanding, () => {
    O.line(S, 'horn', LANDING, { level: 0.36, cutoff: 2300, bus: 'horn', octaves: [0, -12], release: 0.35, attack: 0.1 });
    O.line(S, 'choirA', LANDING, { level: 0.14, cutoff: 5000, bus: 'choir', octaves: [0, 12], release: 0.4, attack: 0.12 });
  });
  // earthrise: the noble lift — the rest of the theme on horns + strings, over a Bb brass chord
  S.at(C.earthrise, () => {
    O.line(S, 'horn', EARTHRISE, { level: 0.46, cutoff: 3000, bus: 'horn', octaves: [0, -12], release: 0.3 });
    O.line(S, 'strings', EARTHRISE, { level: 0.15, cutoff: 5500, bus: 'strings', octaves: [0, 12], release: 0.3 });
    O.brass(S, C.earthrise, 0.7, CHORDS.Bb.brass, { level: 0.3, attack: 0.1, release: 0.3, bright: 2200 });
  });
}

// Rhythm studio: a heartbeat for the descent, a soft swell and bloom on the landing, a
// shimmer on the footprint, and a snare pickup that rebuilds act II's energy.
function moonshotRhythm(S) {
  for (const t of [40.0, 41.0]) S.at(t, () => I.kick(S, t, 0.24));
  // soft low tom roll swelling into the landing
  // (it stops a beat short, so the landing arrives in a held breath of strings and choir)
  for (let t = 39.875; t < C.moonLanding - 0.2; t += STEP) {
    const u = (t - 39.875) / (C.moonLanding - 0.2 - 39.875);
    S.at(t, () => I.tom(S, t, 0.03 + 0.07 * u * u, { f: 78, pan: Math.round(t / STEP) % 2 ? 0.25 : -0.25 }));
  }
  const tl = C.moonLanding;
  S.at(tl, () => {
    I.boom(S, tl, { level: 0.3, f0: 62, f1: 30, decay: 2.4 });
    I.taiko(S, tl, 0.24, { size: 1 });
    I.harpRoll(S, tl, [50, 57, 62, 66, 69, 74, 78], { level: 0.05 });
  });
  // footprint: a soft shimmer (bells + celesta on D major)
  const tf = C.footprint;
  S.at(tf, () => {
    [86, 90, 93, 98, 102].forEach((m, i) => I.bell(S, tf + i * 0.045, m, { level: 0.015, decay: 2.2, pan: -0.5 + i * 0.25 }));
    I.celesta(S, tf + 0.02, 93, { level: 0.02, pan: 0.2 });
  });
  // guidanceComputer: snare 16ths and toms rebuild into the computing bar
  for (let t = 42.0; t < 42.5 - 1e-6; t += STEP) {
    const u = (t - 42.0) / 0.5;
    S.at(t, () => I.snare(S, t, 0.05 + 0.1 * u, { pan: 0.05 }));
  }
  [[42.25, 128], [42.375, 96]].forEach(([t, f]) => S.at(t, () => I.tom(S, t, 0.16, { f, pan: f > 100 ? 0.4 : -0.4 })));
}

// Pads step aside for the big hits (sidechain-style), then recover.
function duckPads(S) {
  const big = [[C.titleLocked, 0.6], [C.templeReveal, 0.5], [C.model3D, 0.65], [C.earthWide, 0.55], [C.earthrise, 0.75], [C.processorDive, 0.55], [49.5, 0.6], [C.pullBack, 0.5]];
  for (const name of ['strings', 'choir', 'pad']) {
    const g = S.bus(name).gain;
    const base = g.value;
    for (const [t, depth] of big) {
      g.setTargetAtTime(base * depth, t, 0.005);
      g.setTargetAtTime(base, t + 0.08, 0.25);
    }
  }
}

function preload(S) {
  const pairs = [];
  for (const c of Object.values(CHORDS)) {
    c.str.forEach((m) => pairs.push(['strings', m]));
    c.hi.forEach((m) => pairs.push(['strings', m]));
    c.choir.forEach((m) => pairs.push(['choirA', m]));
    c.brass.forEach((m) => pairs.push(['brass', m]));
  }
  [55, 57, 58, 62, 67, 69].forEach((m) => pairs.push(['choirO', m]));
  [26, 86, 88, 90, 93].forEach((m) => pairs.push(['strings', m]));
  [50, 62, 67, 69, 74].forEach((m) => pairs.push(['horn', m], ['horn', m - 12]));
  // the coda (appended, so the loops above render exactly as before)
  for (const [, , str, choir, horns] of CODA) {
    str.forEach((m) => pairs.push(['strings', m]));
    choir.forEach((m) => pairs.push(['choirA', m]));
    (horns ?? []).forEach((m) => pairs.push(['horn', m]));
  }
  [78, 79, 81, 86, 88, 93, 98].forEach((m) => pairs.push(['strings', m]));
  [64, 66, 69].forEach((m) => pairs.push(['choirO', m]));
  [46, 48, 53, 55, 58, 60, 64].forEach((m) => pairs.push(['horn', m]));
  [86].forEach((m) => pairs.push(['brass', m]));
  O.preloadSections(S, pairs);
}

/** Kick times of the rhythm section (for sidechain ducking in any studio). */
export function kickTimes() {
  const kicks = [];
  for (const [a, b, p] of KICK) pattern(a, b, p, (t) => kicks.push(t));
  return kicks;
}

/**
 * Schedule the music into Studio S. The score renders in parallel studios, so
 * `part` selects which layers this studio plays:
 *   'orchestra' — strings, choir, theme, low brass, spiccato ostinato, act I colour, the
 *                 coda's reprise and swell
 *   'rhythm'    — synth + sub pulse, percussion, arps, transitions, hits, the coda's bloom,
 *                 final button and resolution
 */
export function arrangeMusic(S, part = 'all') {
  const orch = part === 'all' || part === 'orchestra';
  const rest = part === 'all' || part === 'rhythm';
  if (orch) {
    preload(S);
    stringsLayer(S);
    choirLayer(S);
    themeLayer(S);
    ostinato(S);
    lowBrass(S);
    moonshot(S);
    actOne(S);
    coda(S);
  }
  if (rest) {
    pulse(S);
    rhythm(S, []);
    moonshotRhythm(S);
    arps(S);
    transitions(S);
    accents(S);
    codaFinale(S);
  }
  duckPads(S);
  return { kicks: kickTimes(), suckBacks: [OST_END, C.finalImpact - 0.08] };
}
