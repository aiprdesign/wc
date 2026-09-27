// The music (v3): a three-act trailer score in D minor, 120 BPM, bar = 2 s from t = 0.
//
// THEME (8 notes, heroic 5th + octave leaps):  D — A — D' — C' Bb — A — G — A
//   developed  fragment (piano, 6 s) → gentle full statement (piano + celesta, 12 s)
//   → full statement (horns, 36 s) → EPIC statement (brass + horns + choir, 45.5 s)
//   → high D on the Picardy D-major chord at the pullBack, and a D–A–D' button at 56.
//
// ACT I   0 – 20    mystery & wonder: drone, distant choir, piano/celesta motif, space;
//                   designed hits on titleLocked (whoosh-hit), templeReveal (BRAAM),
//                   model3D (whoosh-hit on the dominant); riser bridges into act II.
// ACT II  20 – 45.5 the build: ONE spiccato + synth-pulse ostinato from 20.0 to the
//                   pullBack, never stopping at scene changes. A layer every 4 bars:
//                   20 ostinato + sub · 24 low brass swells, taiko, clock tick ·
//                   28 kick, hats, violins · 32 snare, toms, harmony climbs ·
//                   36 horns THEME, taiko 8ths, choir · 40 16th hats, arps, tremolo ·
//                   44 everything + snare build. BRAAM on earthWide.
// ACT III 45.5 – 50.5 climax: epic THEME over i–VI–III–iv–V, percussion accelerating
//                   8ths → 16ths → 32nd snare roll, suck-back, D MAJOR at the pullBack.
// Finale (cue-pinned): near-silence 51.5–55.9, then the final "button" at 56.0.

import { BEAT, CUES as C } from '../timeline.js';
import * as I from './instruments.js';
import * as O from './orchestra.js';
import * as X from './sfx.js';

export const STEP = BEAT / 4; // 16th note, 0.125 s

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
  [36.0, 37.0, 'Dm'], [37.0, 38.0, 'Bb'], [38.0, 39.0, 'F'], [39.0, 40.0, 'Gm'],
  [40.0, 41.3, 'A'],   // tension …
  [41.3, 42.0, 'Dm'],  // … released on the processor dive
  [42.0, 43.0, 'Bb'], [43.0, 44.0, 'C'],
  [44.0, 45.5, 'Asus'],// dominant pedal under the build into act III
  // ACT III
  [45.5, 47.0, 'Dm'], [47.0, 48.0, 'Bb'], [48.0, 49.0, 'F'], [49.0, 50.0, 'Gm'],
  [50.0, 50.5, 'A'],
  [50.5, 52.0, 'D'],   // pullBack: Picardy D major
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
// 3. full statement (horns), act II
const HORNS = mk([36.0, 36.5, 37.0, 38.0, 38.5, 39.0, 39.5, 40.0], [0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1.3]);
// 4. epic statement → high D on the D-major pullBack
const EPIC = [
  [45.5, 62, 0.5], [46.0, 69, 1.0], [47.0, 74, 1.0], [48.0, 72, 0.5], [48.5, 70, 0.5],
  [49.0, 69, 0.5], [49.5, 67, 0.5], [50.0, 69, 0.42], [50.5, 74, 1.0],
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
    O.line(S, 'horn', HORNS, { level: 0.42, cutoff: 2600, bus: 'horn', octaves: [0, -12], release: 0.3 });
    O.line(S, 'strings', HORNS, { level: 0.12, cutoff: 5000, bus: 'strings', octaves: [12], release: 0.3 });
  });
  // epic: brass in the trumpet register, horns, choir, strings — all in octaves
  S.at(45.5, () => {
    O.line(S, 'horn', EPIC, { level: 0.44, cutoff: 3200, bus: 'horn', octaves: [0, -12], release: 0.8 });
    O.line(S, 'brass', EPIC, { level: 0.2, cutoff: 3600, bus: 'brass', octaves: [12], release: 0.8 });
    O.line(S, 'choirA', EPIC, { level: 0.26, cutoff: 5500, bus: 'choir', octaves: [0, 12], release: 0.9 });
    O.line(S, 'strings', EPIC, { level: 0.16, cutoff: 6000, bus: 'strings', octaves: [12], release: 0.8 });
  });
}

// ------------------------------------------------------------------ pads (strings, choir)

// String bed level / brightness per act (0..1)
function lift(t) {
  if (t < 5) return 0.18;
  if (t < 12) return 0.34;
  if (t < 20) return 0.42;
  if (t < 45.5) return 0.42 + 0.4 * (t - 20) / 25.5;
  return 0.95;
}

function stringsLayer(S) {
  for (const [a, b, name] of HARMONY) {
    if (a >= 50.5) break;
    const lv = lift(a);
    const first = a === 0;
    const start = first ? 1.0 : a - 0.12;
    S.at(start, () => O.chord(S, 'strings', start, b, CHORDS[name].str, {
      level: 0.55 * lv, attack: first ? 3 : a < 20 ? 0.6 : 0.15, release: a < 20 ? 1.2 : 0.3,
      cutoff: 900 + 4000 * lv, swell: a === 8.0 ? 0.6 : null,
    }));
    // the climb: upper strings from 28, brighter every 4 bars
    if (a >= 28 && a < 50.5) {
      S.at(a - 0.1, () => O.chord(S, 'strings', a - 0.1, b, CHORDS[name].hi.map((m) => m + (a >= 40 ? 12 : 0)), {
        level: 0.1 + 0.12 * (a - 28) / 22, attack: 0.2, release: 0.25, cutoff: 5500,
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
  S.at(40.0, () => O.tremolo(S, 40.0, 41.3, [69, 73, 76, 81], { level: 0.15 }));
  S.at(49.0, () => O.tremolo(S, 49.0, 50.42, [74, 79, 81, 86], { level: 0.18 }));
}

const CHOIR = [
  // [start, end, chord, vowel, level, attack, release]
  [1.5, 5.0, 'D5', 'choirO', 0.1, 2.5, 0.8],    // distant
  [5.0, 8.2, 'Dm', 'choirO', 0.22, 0.3, 1.2],   // titleLocked
  [10.6, 12.4, 'F', 'choirA', 0.36, 0.1, 1.5],  // templeReveal
  [12.0, 14.2, 'Dm', 'choirO', 0.12, 1.2, 0.8],
  [14.0, 18.4, 'Bb', 'choirO', 0.12, 1.5, 0.6],  // behind the gentle theme
  [18.4, 20.2, 'A', 'choirA', 0.24, 0.1, 0.8],  // model3D
  [36.0, 38.2, 'Dm', 'choirO', 0.14, 1.0, 0.4], // under the horn theme
  [38.2, 40.0, 'F', 'choirA', 0.28, 0.05, 0.4], // earthWide
  [41.3, 44.0, 'Dm', 'choirA', 0.18, 0.1, 0.4],
  [44.0, 45.5, 'Asus', 'choirA', 0.2, 1.0, 0.2],
  [45.5, 47.0, 'Dm', 'choirA', 0.26, 0.05, 0.2], // act III chords under the epic theme
  [47.0, 48.0, 'Bb', 'choirA', 0.28, 0.05, 0.2],
  [48.0, 49.0, 'F', 'choirA', 0.3, 0.05, 0.2],
  [49.0, 50.0, 'Gm', 'choirA', 0.32, 0.05, 0.2],
  [50.0, 50.42, 'A', 'choirA', 0.34, 0.05, 0.05],
  [50.5, 51.5, 'D', 'choirA', 0.45, 0.03, 0.6],  // pullBack
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
const OST_END = 50.42;           // leaves the suck-back its 80 ms of silence
const drive = (t) => (t < 45.5 ? 0.55 + 0.45 * (t - 20) / 25.5 : 1 + 0.25 * (t - 45.5) / 5);

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
    const lv = 0.2 * acc[k % 16] * drive(t);
    S.at(t, () => {
      O.spiccato(S, t, r + iv, { level: lv });
      if (t >= 32 && k % 4 === 0) O.spiccato(S, t, r + iv + 12, { level: lv * 0.5 }); // violins join an octave up
    });
  });
  // synth pulse: 8ths, filtered saw, doubled with the sub pulse
  pattern(20.0, OST_END, 'x.x.x.x.x.x.x.x.', (t, v, k) => {
    const m = chordAt(t).root + 24;
    const u = (t - 20) / 30;
    S.at(t, () => I.synthPluck(S, t, m, { level: (k % 4 ? 0.035 : 0.05) * (0.8 + 0.6 * u), decay: 0.18, cutoff: 900 + 2600 * u, pan: k % 4 ? 0.25 : -0.25 }));
  });
  // sub pulse (mono): one voice for the whole act
  const t0 = 20.0;
  const roots = HARMONY.filter(([, b]) => b > t0).map(([a, , n]) => [Math.max(a, t0), CHORDS[n].root + (CHORDS[n].root < 33 ? 12 : 0)]);
  const hits = [];
  for (let t = t0; t < OST_END - 1e-6; t += BEAT / 2) {
    const on = Math.round(t / (BEAT / 2)) % 2 === 0;
    hits.push({ t, v: (on ? 1 : 0.65) * (t < 24 ? 0.6 : t < 28 ? 0.8 : 1), len: 0.22 });
  }
  hits.push({ t: C.pullBack, v: 1.1, len: 1.4 });
  S.at(t0, () => I.subPulse(S, t0, C.musicDrop, roots, hits, { level: 0.36 }));
}

// Layer entries, every 4 bars.
const TAIKO = [
  [24.0, 32.0, 'X.......x.....x.'],
  [32.0, 36.0, 'X.....x.x.....x.'],
  [36.0, 44.0, 'X.x.x.x.X.x.x.x.'],  // 8ths with the horn theme
  [44.0, 45.5, 'X.x.X.x.X.xxX.xx'],
  [45.5, 49.0, 'X.x.x.x.X.x.x.x.'],
  [49.0, 50.42, 'XxxxXxxxXxxxXxxx'], // 16ths into the peak
];
const KICK = [[28.0, 45.5, 'X...x...X...x...'], [45.5, 50.42, 'X...x...X...x.x.']];
const HATS = [[28.0, 40.0, 'x.o.x.o.x.o.x.o.'], [40.0, 50.42, 'xoxoXoxoxoxoXoxo']];
const SNARE = [[32.0, 44.0, '....x.......x...'], [44.0, 45.5, '....x...x.x.xxxx'], [45.5, 49.0, '....x.......x...']];
const TOMS = [[32.0, 44.0, '............x.xx'], [44.0, 45.5, '..x.x.x.x.x.xxxx'], [45.5, 49.0, '..........x.x.x.']];
const TICK = [[24.0, 45.5, 'x.x.x.x.x.x.x.x.']];

function rhythm(S, kicks) {
  const d = (t) => drive(t);
  for (const [a, b, p] of TAIKO) pattern(a, b, p, (t, v) => S.at(t, () => I.taiko(S, t, 0.5 * v * d(t), { size: v > 0.9 ? 1 : 0.6 })));
  for (const [a, b, p] of KICK) pattern(a, b, p, (t, v) => { kicks.push(t); S.at(t, () => I.kick(S, t, 0.75 * v * d(t))); });
  for (const [a, b, p] of HATS) pattern(a, b, p, (t, v, k) => S.at(t, () => I.hat(S, t, 0.075 * v * d(t), { pan: 0.25 + (k % 2) * 0.12 })));
  for (const [a, b, p] of SNARE) pattern(a, b, p, (t, v) => S.at(t, () => I.snare(S, t, 0.22 * v * d(t), { pan: 0.05 })));
  for (const [a, b, p] of TOMS) pattern(a, b, p, (t, v, k) => S.at(t, () => I.tom(S, t, 0.3 * v * d(t), { f: k % 2 ? 96 : 128, pan: k % 2 ? -0.4 : 0.4 })));
  // the ticking clock (a trailer staple): dry tick-tock on 8ths
  for (const [a, b, p] of TICK) pattern(a, b, p, (t, v, k) => S.at(t, () => X.click(S, t, {
    level: 0.03 + 0.015 * (t - 24) / 21.5, freq: k % 4 ? 2600 : 3600, body: k % 4 ? 980 : 1250, q: 4, decay: 0.016, pan: k % 4 ? 0.3 : -0.3, bus: 'perc',
  })));
  // act III: accelerating snare roll (16ths from 49, 32nds from 50) into the suck-back
  for (let t = 49.0; t < OST_END - 1e-6; t += t < 50 ? STEP : STEP / 2) {
    const u = (t - 49) / 1.42;
    S.at(t, () => I.snare(S, t, 0.06 + 0.2 * u, { pan: -0.1 }));
  }
  // open hats on every bar downbeat from 40
  pattern(40.0, 50.42, 'X...............', (t) => S.at(t, () => I.hat(S, t, 0.06, { open: true, pan: -0.3 })));
}

function lowBrass(S) {
  // two-bar crescendo swells from 24 (layer 2), then sforzando stabs in act III
  for (const [a, b, name] of HARMONY) {
    if (a < 24 || a >= 45.5) continue;
    S.at(a, () => O.brass(S, a, b - a, CHORDS[name].brass, { level: 0.16 + 0.2 * (a - 24) / 21, attack: Math.min(1.4, (b - a) * 0.7), release: 0.25, bright: 1400 + 1200 * (a - 24) / 21 }));
  }
  for (const [a, b, name] of HARMONY) {
    if (a < 45.5 || a >= 50.5) continue;
    S.at(a, () => O.brass(S, a, b - a - 0.04, CHORDS[name].brass, { level: 0.5, sfz: true, release: 0.2, bright: 2400 }));
  }
}

function arps(S) {
  const shape = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern(40.0, OST_END, 'x'.repeat(16), (t, v, k) => {
    const tones = chordAt(t).choir.slice(0, 4).map((m) => m + 12);
    const u = (t - 40) / 10.5;
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
  });
}

// Designed hit: sub + taiko (+ BRAAM, harp bloom, downer), with pad ducking.
function hit(S, t, { power = 1, braam = null, chord = null, down = false, subHz = 85 } = {}) {
  S.at(t, () => {
    I.boom(S, t, { level: 0.5 * power, f0: subHz, f1: 34, decay: 1.4 + power });
    I.taiko(S, t, 0.6 * power, { size: 1 });
    I.crash(S, t, 0.08 * power);
    if (braam != null) O.braam(S, t, braam, { level: 0.42 * power, power, dur: 1.6 + power });
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
    [40.0, C.processorDive, 0.08, 250, 8000, [45, 74]],
    [42.0, 45.5, 0.1, 200, 8000, [38, 69]],    // bridge into act III
    [46.0, 50.42, 0.16, 200, 9500, [38, 74]],  // the long climb into the peak
  ];
  for (const [a, b, level, from, to, pitch] of R) S.at(a, () => I.riser(S, a, b, { level, from, to, pitch }));
  // reverse cymbals into bar-line changes (they resolve ON the downbeat)
  for (const [t, d, l] of [[20.0, 1.0, 0.04], [24.0, 0.8, 0.035], [28.0, 1.0, 0.05], [32.0, 1.0, 0.05], [36.0, 1.0, 0.06], [44.0, 1.0, 0.05]]) {
    S.at(t - d, () => I.revCymbal(S, t, d, { level: l }));
  }
  // SUCK-BACK (only before the two biggest hits): reverse swell, then 80 ms of silence
  S.at(49.3, () => I.swellIn(S, OST_END, 1.12, { level: 0.14 }));
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
  hit(S, 45.5, { power: 1.0, chord: 'Dm' });                                     // ACT III
  hit(S, C.pullBack, { power: 1.3, braam: 50, chord: 'D', subHz: 95 });          // BRAAM 3: the peak
  S.at(C.pullBack, () => { I.taiko(S, C.pullBack + 0.02, 0.6, { size: 0.6 }); I.kick(S, C.pullBack, 0.9); });
  S.at(C.pullBack, () => O.brass(S, C.pullBack, 0.9, CHORDS.D.brass, { level: 0.6, sfz: true, bright: 2800, release: 0.5 }));
  S.at(C.pullBack, () => O.chord(S, 'strings', C.pullBack, 51.4, CHORDS.D.str, { level: 0.55, attack: 0.03, release: 0.4, cutoff: 5500 }));
}

// FINAL BUTTON at 56.0: suck-back, then the biggest hit of the film with a long tail
// (BRAAM 4), D major, and the theme head D — A — D' on horns + piano.
function finalButton(S) {
  const t = C.finalImpact;
  S.at(55.1, () => I.swellIn(S, t - 0.08, 0.82, { level: 0.05, bus: 'end', top: 7000 }));
  S.at(t, () => {
    const D_MAJOR = [38, 50, 57, 62, 66, 69, 74];
    I.boom(S, t, { level: 1.0, f0: 110, f1: 32, decay: 4.5, bus: 'endDry' });
    I.taiko(S, t, 0.95, { size: 1, bus: 'end' });
    I.taiko(S, t + 0.02, 0.6, { size: 0.6, bus: 'end' });
    I.kick(S, t, 0.9, { bus: 'endDry' });
    I.crash(S, t, 0.1, { bus: 'end' });
    O.braam(S, t, 50, { level: 0.6, power: 1.3, dur: 3.2, bus: 'end' });
    O.brass(S, t, 1.4, [26, 38, 45, 50, 54, 57], { level: 0.5, sfz: true, bright: 2200, release: 2.6, bus: 'end' });
    O.chord(S, 'choirA', t, t + 1.6, [57, 62, 66, 69, 74, 78], { level: 0.45, attack: 0.05, release: 3.0, cutoff: 5200, bus: 'end' });
    O.chord(S, 'strings', t, t + 1.4, D_MAJOR, { level: 0.4, attack: 0.04, release: 3.2, cutoff: 3800, bus: 'end' });
    O.line(S, 'horn', [[t, 62, 0.5], [t + 0.5, 69, 0.5], [t + 1.0, 74, 1.8]], { level: 0.28, cutoff: 2400, bus: 'end', octaves: [0, -12], release: 2.0 });
    I.harpRoll(S, t, [50, 57, 62, 66, 69, 74, 78, 81], { level: 0.08, bus: 'end' });
  });
  [[t + 0.0, 74], [t + 0.5, 81], [t + 1.0, 86]].forEach(([u, m]) => S.at(u, () => I.piano(S, u, m, { level: 0.14, bus: 'end' })));
}

// Pads step aside for the big hits (sidechain-style), then recover.
function duckPads(S) {
  const big = [[C.titleLocked, 0.6], [C.templeReveal, 0.5], [C.model3D, 0.65], [C.earthWide, 0.55], [C.processorDive, 0.55], [45.5, 0.6], [C.pullBack, 0.5]];
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
  [57, 62, 69].forEach((m) => pairs.push(['choirO', m]));
  [50, 62, 67, 69, 74].forEach((m) => pairs.push(['horn', m], ['horn', m - 12]));
  O.preloadSections(S, pairs);
}

export function arrangeMusic(S) {
  const kicks = [];
  preload(S);
  stringsLayer(S);
  choirLayer(S);
  themeLayer(S);
  actOne(S);
  ostinato(S);
  rhythm(S, kicks);
  lowBrass(S);
  arps(S);
  transitions(S);
  accents(S);
  finalButton(S);
  duckPads(S);
  return { kicks, suckBacks: [OST_END, C.finalImpact - 0.08] };
}
