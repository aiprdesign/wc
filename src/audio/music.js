// The music: harmony, the heroic theme, orchestra (strings, choir, brass, horns,
// piano), the hybrid rhythm section and the trailer accents.
// Key: D minor (Aeolian with Dorian colour), BPM 120, bar = 2 s = 16 sixteenths.
//
//   0–5 s     intimate: distant choir "ooh" and strings on an open fifth over a drone
//   4–5       suspended Bb(add9) swell + reverse cymbal → Dm9 as the title locks (BRAAM, choir)
//   5.5–9.5   THEME, softly, on piano (celesta doubling)
//   7.5–12.5  strings swell into the temple reveal: F major, BRAAM, full choir
//   12–16     THEME on legato violas + celli (civic)
//   16–25     renaissance / science: piano figures, pizzicato clockwork, choir colours
//   25–45.5   hybrid: spiccato 16ths, sub pulse, taiko ensemble, kicks, hats, horns,
//             braams on machine / earthWide / processorDive; THEME on horns in flight
//   45.5–50.5 montage: bVI – bVII – V under the THEME on brass + choir, percussion
//             accelerating (beats → 8ths → 16ths + snare roll) and a 5 s riser …
//   50.5      … D MAJOR climax at pullBack (the brightening); drop at 51.5 (score.js)
//
// Percussion is quantised to the 16th grid from t = 0.

import { BEAT, CUES as C } from '../timeline.js';
import * as I from './instruments.js';
import * as O from './orchestra.js';

export const STEP = BEAT / 4; // 16th note, 0.125 s

// ------------------------------------------------------------------ harmony

// str: string voicing (with octave doublings) · choir · brass: low brass · root: sub note
export const CHORDS = {
  D5:    { str: [38, 50, 57, 62, 69, 74],         choir: [57, 62, 69],         brass: [38, 45, 50],         root: 38 },
  Bb9:   { str: [34, 46, 53, 60, 62, 65, 72],     choir: [58, 62, 65, 72],     brass: [34, 41, 46, 50],     root: 34 },
  Dm9:   { str: [38, 50, 57, 65, 69, 76],         choir: [57, 62, 65, 69, 76], brass: [38, 45, 50, 53],     root: 38 },
  Dm:    { str: [38, 50, 57, 62, 65, 69, 74],     choir: [57, 62, 65, 69, 74], brass: [38, 45, 50, 53, 57], root: 38 },
  Bb:    { str: [34, 46, 53, 62, 65, 70, 74],     choir: [58, 62, 65, 70, 74], brass: [34, 41, 46, 50, 53], root: 34 },
  F:     { str: [29, 41, 53, 57, 60, 65, 69, 72], choir: [57, 60, 65, 69, 72], brass: [29, 41, 45, 48, 53], root: 41 },
  C:     { str: [36, 48, 55, 60, 64, 67, 72],     choir: [55, 60, 64, 67, 72], brass: [36, 43, 48, 52, 55], root: 36 },
  Gm:    { str: [31, 43, 50, 58, 62, 67, 70],     choir: [55, 58, 62, 67, 70], brass: [31, 43, 46, 50, 55], root: 31 },
  Asus4: { str: [33, 45, 52, 57, 62, 64, 69],     choir: [57, 62, 64, 69, 76], brass: [33, 45, 50, 52, 57], root: 33 },
  A:     { str: [33, 45, 52, 57, 61, 64, 69],     choir: [57, 61, 64, 69, 76], brass: [33, 45, 49, 52, 57], root: 33 },
  D:     { str: [38, 50, 57, 62, 66, 69, 74, 78], choir: [57, 62, 66, 69, 74, 78], brass: [38, 45, 50, 54, 57], root: 38 },
};

export const HARMONY = [
  [0.0, 4.0, 'D5'],     // opening: open fifth, no third yet
  [4.0, 5.0, 'Bb9'],    // title assembling — suspended approach
  [5.0, 8.0, 'Dm9'],    // titleLocked: resolution
  [8.0, 10.6, 'Bb'],    // classical: columns rise (strings swell)
  [10.6, 12.0, 'F'],    // templeReveal: warm major
  [12.0, 14.0, 'C'],    // civic (theme on strings)
  [14.0, 16.0, 'Dm'],
  [16.0, 18.4, 'Bb'],   // renaissance
  [18.4, 20.0, 'F'],    // model3D
  [20.0, 22.0, 'Gm'],   // science
  [22.0, 24.0, 'Dm'],
  [24.0, 24.5, 'Asus4'],// prism…
  [24.5, 25.0, 'A'],    // …spectrum (dominant)
  [25.0, 27.0, 'Dm'],   // industrial: the groove engages
  [27.0, 29.0, 'Bb'],
  [29.0, 31.0, 'F'],    // electricity
  [31.0, 33.0, 'C'],
  [33.0, 35.0, 'Dm'],   // medicine
  [35.0, 37.0, 'Bb'],   // flight (theme on horns)
  [37.0, 38.2, 'Gm'],   // rocket
  [38.2, 39.0, 'Bb'],   // earthWide: wide major
  [39.0, 41.3, 'A'],    // computing — dominant tension…
  [41.3, 43.0, 'Dm'],   // …released by the processor dive
  [43.0, 45.0, 'Bb'],   // knowledge
  [45.0, 45.5, 'C'],
  [45.5, 47.5, 'Bb'],   // montage: bVI
  [47.5, 49.5, 'C'],    //          bVII
  [49.5, 50.5, 'Asus4'],//          V
  [50.5, 51.5, 'D'],    // pullBack: I — D major
];

export const chordAt = (t) => CHORDS[(HARMONY.find(([a, b]) => t >= a && t < b) ?? HARMONY.at(-1))[2]];

// Orchestral intensity 0..1 (string level and brightness follow it).
const INTENSITY = [
  [0, 0.05], [2, 0.12], [5, 0.4], [8, 0.35], [10.6, 0.7], [12, 0.4], [16, 0.42], [18.4, 0.55],
  [20, 0.45], [24, 0.55], [25, 0.75], [31.5, 0.7], [32, 0.35], [34.5, 0.45], [35, 0.7],
  [38.2, 0.9], [39, 0.65], [41.3, 0.85], [45.5, 0.9], [50.5, 1],
];
export function intensity(t) {
  const k = INTENSITY;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return k[i - 1][1] + ((k[i][1] - k[i - 1][1]) * (t - k[i - 1][0])) / (k[i][0] - k[i - 1][0]);
  }
  return k.at(-1)[1];
}

/** Call fn(time, velocity, step) for every non-rest step of a 16-step bar pattern in [from, to). */
export function pattern(from, to, pat, fn, step = STEP) {
  const vel = { X: 1, x: 0.75, o: 0.45 };
  for (let k = Math.ceil(from / step - 1e-6); k * step < to - 1e-6; k++) {
    const ch = pat[k % pat.length];
    if (ch !== '.') fn(k * step, vel[ch] ?? 0.75, k);
  }
}

// ------------------------------------------------------------------ THEME
// The heroic motif: D — A (long) — G F E — F (long) — D.   [beat, midi, beats]
const THEME = [[0, 62, 1], [1, 69, 1.5], [2.5, 67, 0.5], [3, 65, 0.5], [3.5, 64, 0.5], [4, 65, 2], [6, 62, 2]];
const theme = (start, transpose = 0, stretch = 1) =>
  THEME.map(([b, m, d]) => [start + b * BEAT * stretch, m + transpose, d * BEAT * stretch]);

// Climax variant (montage → pullBack): … E (held) — A — high D on the D-major chord.
const CLIMAX_THEME = [
  [44.5, 62, 1.0], [45.5, 69, 1.5], [47.0, 67, 0.5], [47.5, 65, 0.5], [48.0, 64, 1.5], [49.5, 69, 1.0], [50.5, 74, 1.0],
];

function themeLayer(S) {
  // 1. piano, softly, after the title locks (celesta an octave up, barely there)
  theme(5.5, 12).forEach(([t, m], i) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.2, pan: -0.1 + 0.04 * i });
    I.celesta(S, t, m + 12, { level: 0.018, pan: 0.3 });
  }));
  // 2. legato violas + celli in octaves (civic)
  S.at(12.0, () => O.line(S, 'strings', theme(12.0, 0), { level: 0.22, cutoff: 2600, bus: 'strings', octaves: [0, -12], attack: 0.35, overlap: 0.12 }));
  // 3. horns (flight), strings an octave above in the shadow
  S.at(35.0, () => {
    O.line(S, 'horn', theme(35.0, 0), { level: 0.3, cutoff: 2400, bus: 'horn', octaves: [0, -12] });
    O.line(S, 'strings', theme(35.0, 12), { level: 0.07, cutoff: 3500, bus: 'strings' });
  });
  // 4. climax: horns + brass (trumpet register) + choir in unison
  S.at(44.5, () => {
    O.line(S, 'horn', CLIMAX_THEME, { level: 0.34, cutoff: 3000, bus: 'horn', octaves: [0, -12], release: 0.3 });
    O.line(S, 'brass', CLIMAX_THEME, { level: 0.16, cutoff: 3200, bus: 'brass', octaves: [12], release: 0.3 });
    O.line(S, 'choirA', CLIMAX_THEME, { level: 0.2, cutoff: 5000, bus: 'choir', octaves: [12], release: 0.4 });
  });
}

// ------------------------------------------------------------------ strings

function stringsLayer(S) {
  for (const [a, b, name] of HARMONY) {
    const hybrid = a >= C.gear;
    const lv = intensity(a);
    const start = name === 'D5' ? 1.4 : a;
    const swellInto = name === 'Bb' && a === 8.0 ? 0.3 : name === 'A' && a === 39.0 ? 0.35 : null;
    S.at(start, () => O.chord(S, 'strings', start, b, CHORDS[name].str, {
      level: 0.62 * (0.25 + 0.75 * lv) * (a >= 45.5 ? 1.15 : 1),
      attack: name === 'D5' ? 2.8 : name === 'D' ? 0.03 : hybrid ? 0.2 : 0.9,
      release: hybrid ? 0.4 : 1.2,
      cutoff: 900 + 4200 * lv,
      swell: swellInto,
      bus: 'strings',
    }));
  }
  // spiccato ostinato (hybrid): root / octave / fifth figure in the low-mid register
  const fig = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0];
  const acc = [1, 0.5, 0.7, 0.5, 0.85, 0.5, 0.7, 0.5, 1, 0.5, 0.7, 0.5, 0.85, 0.6, 0.7, 0.55];
  for (const [a, b, lv] of [[25.0, 31.5, 1], [34.5, 38.2, 0.9], [39.0, 45.5, 1], [45.5, 50.5, 1.2]]) {
    pattern(a, b, 'x'.repeat(16), (t, v, k) => {
      let r = chordAt(t).root;
      while (r < 45) r += 12;
      while (r > 56) r -= 12;
      S.at(t, () => O.spiccato(S, t, r + fig[k % 16], { level: 0.2 * lv * acc[k % 16] }));
    });
  }
  // tremolo tension before the big arrivals
  S.at(24.0, () => O.tremolo(S, 24.0, 25.0, [69, 73, 76, 81], { level: 0.14 }));
  S.at(39.0, () => O.tremolo(S, 39.0, 41.3, [64, 69, 73, 76, 81], { level: 0.18 }));
  S.at(49.5, () => O.tremolo(S, 49.5, 50.5, [69, 74, 76, 81, 86], { level: 0.2 }));
  // pizzicato clockwork (science): root / fifth on 8ths
  pattern(21.5, 24.0, 'x.o.x.o.x.o.x.o.', (t, v, k) => {
    const r = chordAt(t).root + 24;
    S.at(t, () => I.pizz(S, t, (k / 2) % 2 ? r + 7 : r, { level: 0.1 * v, pan: (k / 2) % 2 ? 0.35 : -0.35 }));
  });
}

// -------------------------------------------------------------------- choir

const CHOIR = [
  // [start, end, chord, vowel, level, attack, release]
  [1.8, 5.0, 'D5', 'choirO', 0.12, 2.5, 1.0],     // distant, intimate
  [5.0, 8.0, 'Dm9', 'choirA', 0.34, 0.35, 1.5],   // titleLocked
  [10.6, 12.4, 'F', 'choirA', 0.44, 0.2, 1.5],    // templeReveal
  [18.4, 20.0, 'F', 'choirO', 0.18, 0.6, 1.0],    // model3D
  [32.8, 34.6, 'Dm', 'choirO', 0.14, 0.8, 0.8],   // anatomy
  [38.2, 39.2, 'Bb', 'choirA', 0.42, 0.08, 0.8],  // earthWide
  [45.5, 47.5, 'Bb', 'choirA', 0.3, 0.6, 0.3],    // montage
  [47.5, 49.5, 'C', 'choirA', 0.36, 0.3, 0.3],
  [49.5, 50.5, 'Asus4', 'choirA', 0.42, 0.2, 0.2],
  [50.5, 51.5, 'D', 'choirA', 0.55, 0.04, 0.6],   // pullBack
];

function choirLayer(S) {
  for (const [a, b, name, vowel, level, attack, release] of CHOIR) {
    S.at(a, () => O.chord(S, vowel, a, b, CHORDS[name].choir, { level, attack, release, cutoff: 5200, dark: 0.5, bus: 'choir' }));
  }
}

// -------------------------------------------------------------------- brass

const BRASS = [
  // [start, duration, chord, level, options]
  [4.0, 1.0, 'Bb9', 0.22, { attack: 0.9 }],               // swell into the title
  [5.0, 2.6, 'Dm', 0.34, { sfz: true, bright: 1400 }],    // titleLocked
  [9.0, 1.6, 'Bb', 0.22, { attack: 1.4 }],                // columns → temple
  [10.6, 1.9, 'F', 0.5, { sfz: true, bright: 2000 }],     // templeReveal
  [14.0, 2.0, 'Dm', 0.18, { attack: 1.2 }],
  [18.4, 1.6, 'F', 0.3, { sfz: true, bright: 1500 }],     // model3D
  [19.9, 0.6, 'F', 0.32, { sfz: true, bright: 2200 }],    // paintBurst blat
  [25.0, 2.0, 'Dm', 0.45, { sfz: true, bright: 2000 }],   // gear
  [29.0, 2.0, 'F', 0.28, { attack: 1.0 }],
  [31.5, 1.5, 'C', 0.36, { sfz: true, bright: 2200 }],    // circuitCity
  [37.0, 1.2, 'Gm', 0.34, { attack: 1.0 }],
  [38.2, 0.8, 'Bb', 0.5, { sfz: true, bright: 2400 }],    // earthWide
  [41.3, 1.7, 'Dm', 0.45, { sfz: true, bright: 2200 }],   // processorDive
  [45.5, 2.0, 'Bb', 0.36, { attack: 0.6 }],               // montage
  [47.5, 2.0, 'C', 0.44, { attack: 0.5, bright: 2200 }],
  [49.5, 1.0, 'Asus4', 0.52, { attack: 0.4, bright: 2600 }],
  [50.5, 1.0, 'D', 0.62, { sfz: true, bright: 2800 }],    // pullBack climax
];

function brassLayer(S) {
  for (const [t, dur, name, level, o] of BRASS) {
    S.at(t, () => O.brass(S, t, dur, CHORDS[name].brass, { level, ...o }));
  }
}

// -------------------------------------------------------- piano & harp colours

const PIANO = [
  [9.8, 86],                                              // marble: a single high note
  [17.0, 70], [17.5, 74], [18.0, 77], [18.5, 81], [19.0, 77], [19.5, 72], // renaissance
  [22.0, 69], [22.5, 74], [23.0, 77], [23.5, 76],          // science
  [32.5, 74], [33.5, 69], [34.0, 77],                      // medicine: intimate
];

function colourLayer(S) {
  PIANO.forEach(([t, m], i) => S.at(t, () => I.piano(S, t, m, { level: 0.14, pan: i % 2 ? 0.25 : -0.25 })));
  // civic words: soft celesta notes answering the strings' theme
  [[C.wordCivic, 84], [C.wordLaw, 88], [C.wordRepresentation, 86]].forEach(([t, m]) => S.at(t, () => I.celesta(S, t, m, { level: 0.035 })));
  // golden ratio: a harp spiral of notes converging (gaps shrink by φ)
  [58, 62, 65, 70, 74, 77, 82].forEach((m, k) => {
    const t = C.goldenRatio + 0.55 * (1 - 0.618 ** k);
    S.at(t, () => I.pluck(S, t, m, { level: 0.13, pan: Math.sin(k * 2.4) * 0.6 }));
  });
  // the falling apple
  [79, 74, 70, 67, 62, 55].forEach((m, k) => {
    const t = C.fallStart + k * 0.09;
    S.at(t, () => I.pluck(S, t, m, { level: 0.12 - k * 0.01, pan: 0.3 - k * 0.1 }));
  });
}

// ---------------------------------------------------------- rhythm section

// 16-step bar patterns. X = accent, x = normal, o = ghost.
const KICK = [
  [25.0, 28.5, 'X...x...X...x...'],
  [28.5, 31.5, 'X.....x...x.....'],
  [31.75, 34.5, 'X.o.....X.o.....'],   // medicine: heartbeat
  [34.5, 38.2, 'X...x...X...x...'],
  [39.5, 41.2, 'X.......x.......'],
  [41.5, 50.5, 'X...x...X...x...'],
];
const TAIKO = [          // ensemble hits
  [25.5, 28.5, 'X.......x.......'],
  [28.5, 31.5, 'X...............'],
  [34.5, 38.2, 'X.......x.....x.'],
  [41.5, 45.5, 'X.......x.....x.'],
  [45.5, 47.5, 'X...x...X...x...'],  // montage: every beat …
  [47.5, 49.5, 'X.x.x.x.X.x.x.x.'],  // … then 8ths
];
const TOMS = [
  [36.0, 38.2, '..........x.x.x.'],
  [40.75, 41.25, '......oxxX......'], // fill into the processor dive
  [43.0, 45.5, '..x...x...x..xx.'],
  [47.5, 49.5, '.x.x.x.x.x.x.x.x'],
];
const SNARE = [
  [28.5, 31.5, '....x.......x...'],
  [36.0, 38.2, '....x.......x...'],
  [41.5, 49.5, '....x.......x...'],
];
const STICKS = [
  [26.5, 28.5, '..x...x...x...x.'],
  [41.5, 45.5, '..x..x....x..x..'],
  [45.5, 49.5, '..x.x.x...x.x.x.'],
];
const HATS = [
  [26.0, 26.5, 'x.x.x.x.x.x.x.x.'],
  [26.5, 31.5, 'xoxoXoxoxoxoXoxo'],
  [31.5, 34.5, 'o...o...o...o...'],
  [34.5, 38.2, 'xoxoxoxoxoxoxoxo'],
  [38.5, 39.5, 'o.o.o.o.o.o.o.o.'],
  [39.5, 50.5, 'xoXoxoxoxoXoxoxo'],
];

// Rhythm-section dynamics: calmer through medicine, swelling through the montage.
function drive(t) {
  if (t >= 31.5 && t < 34.5) return 0.55;
  if (t >= 45.5 && t < C.pullBack) return 1.0 + (0.5 * (t - 45.5)) / (C.pullBack - 45.5);
  return 0.9;
}

function rhythmLayer(S, kicks) {
  for (const [a, b, p] of KICK) {
    pattern(a, b, p, (t, v) => {
      kicks.push(t);
      S.at(t, () => I.kick(S, t, 0.8 * v * drive(t)));
    });
  }
  for (const [a, b, p] of TAIKO) {
    pattern(a, b, p, (t, v) => S.at(t, () => I.taiko(S, t, 0.5 * v * drive(t), { size: v > 0.9 ? 1 : 0.6 })));
  }
  for (const [a, b, p] of TOMS) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.tom(S, t, 0.32 * v * drive(t), { f: k % 2 ? 96 : 120, pan: k % 2 ? -0.4 : 0.4 })));
  }
  for (const [a, b, p] of SNARE) {
    pattern(a, b, p, (t, v) => S.at(t, () => I.snare(S, t, 0.2 * v * drive(t), { pan: 0.05, bus: 'perc' })));
  }
  for (const [a, b, p] of STICKS) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.stick(S, t, 0.1 * v * drive(t), { pan: k % 4 < 2 ? -0.3 : 0.3 })));
  }
  for (const [a, b, p] of HATS) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.hat(S, t, 0.08 * v * drive(t), { pan: 0.28 + (k % 2) * 0.1 })));
  }
  // montage finale bar: 16th toms + taiko crescendo, snare roll doubling to 32nds
  pattern(49.5, C.pullBack, 'x'.repeat(16), (t) => {
    const u = (t - 49.5) / (C.pullBack - 49.5);
    S.at(t, () => {
      I.tom(S, t, 0.2 + 0.35 * u, { f: 92 + 40 * u, pan: (t * 8) % 2 ? 0.35 : -0.35 });
      if (Math.round(t / STEP) % 4 === 0) I.taiko(S, t, 0.45 + 0.3 * u, { size: 0.6 });
    });
  });
  pattern(49.5, C.pullBack, 'x'.repeat(16), (t) => {
    const u = (t - 49.5) / (C.pullBack - 49.5);
    S.at(t, () => I.snare(S, t, 0.05 + 0.2 * u, { pan: -0.1 }));
  });
  // open hats on bar downbeats through the peak
  pattern(41.5, 50.5, 'X...............', (t) => S.at(t, () => I.hat(S, t, 0.06, { open: true, pan: -0.3 })));
}

// Snare roll doubling to 32nds in the last half-bar before pullBack.
function snareRoll32(S) {
  for (let t = 50.0; t < C.pullBack - 1e-6; t += STEP / 2) {
    if (Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6) continue; // on-grid 16ths already played
    const u = (t - 50.0) / 0.5;
    S.at(t, () => I.snare(S, t, 0.12 + 0.13 * u, { pan: 0.1 }));
  }
}

function bassLayer(S) {
  const t0 = C.gear, t1 = C.musicDrop;
  const roots = HARMONY.filter(([, b]) => b > t0).map(([a, , n]) => [Math.max(a, t0), CHORDS[n].root]);
  const hits = [];
  for (let k = Math.ceil(t0 / (BEAT / 2)); k * (BEAT / 2) < C.pullBack; k++) {
    const t = k * (BEAT / 2);
    const onBeat = k % 2 === 0;
    if (t >= 31.5 && t < 34.5) { if (onBeat) hits.push({ t, v: 0.6, len: 0.35 }); continue; } // medicine: calmer
    if (t >= C.earthWide && t < 39.0) continue;                                                 // breath after earth
    if (t >= 38.99 && t < 39.5) { if (t === 39) hits.push({ t, v: 0.8, len: 0.6 }); continue; }
    hits.push({ t, v: onBeat ? 1 : 0.72, len: 0.2 });
  }
  hits.push({ t: C.pullBack, v: 1.1, len: 1.5 }); // climax: ring into the drop
  S.at(t0, () => I.subPulse(S, t0, t1, roots, hits, { level: 0.4 }));
}

function synthLayer(S) {
  // 16th arpeggios (hybrid colour under the orchestra), computing → montage
  const shape = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern(39.5, C.pullBack, 'x'.repeat(16), (t, v, k) => {
    const tones = chordAt(t).choir.slice(0, 4).map((m) => m + 12);
    const m = tones[shape[k % 8] % tones.length];
    const u = (t - 39.5) / (C.pullBack - 39.5);
    S.at(t, () => I.synthPluck(S, t, m, {
      level: (k % 4 === 0 ? 0.035 : 0.024) * (0.7 + 0.5 * u), pan: k % 2 ? 0.45 : -0.45, decay: 0.15, cutoff: 1800 + 2800 * u,
    }));
  });
}

// ------------------------------------------------------------ transitions

function transitions(S) {
  // reverse cymbals into every major arrival  [hit time, length, level]
  const rev = [
    [C.titleLocked, 1.6, 0.05], [C.templeReveal, 1.5, 0.07], [15.5, 1.0, 0.04], [C.paintBurst, 1.0, 0.06],
    [C.gear, 2.0, 0.08], [C.spark, 0.8, 0.05], [C.circuitCity, 1.0, 0.06], [C.earthWide, 1.5, 0.08],
    [C.processorDive, 1.0, 0.08], [C.network, 0.8, 0.05], [C.pullBack, 2.0, 0.1],
  ];
  for (const [t, d, level] of rev) S.at(t - d, () => I.revCymbal(S, t, d, { level }));
  // reverse swells (the "suck") on the orchestral reveals
  S.at(C.titleAssemble, () => I.swellIn(S, C.titleLocked, 1.0, { level: 0.06 }));
  S.at(9.9, () => I.swellIn(S, C.templeReveal, 0.7, { level: 0.08 }));
  S.at(19.4, () => I.swellIn(S, C.paintBurst, 0.5, { level: 0.09 }));
  // risers
  S.at(9.6, () => I.riser(S, 9.6, C.templeReveal, { level: 0.04, from: 400, to: 5000 }));
  S.at(23.0, () => I.riser(S, 23.0, C.gear, { level: 0.06, from: 300, to: 7000, pitch: [45, 69] }));
  S.at(36.7, () => I.riser(S, 36.7, C.earthWide, { level: 0.07, from: 300, to: 8000, pitch: [43, 67] }));
  S.at(40.3, () => I.riser(S, 40.3, C.processorDive, { level: 0.1, pitch: [50, 74] }));
  S.at(C.mColumns - 0.1, () => I.riser(S, C.mColumns - 0.1, C.pullBack, { level: 0.2, from: 200, to: 9000, pitch: [38, 74] }));
}

// Trailer hit: BRAAM (optional), taiko ensemble, sub boom, cymbal, harp, downer.
function hit(S, t, { power = 1, braam = null, chord = null, cymbal = true, down = false, subHz = 80 }) {
  S.at(t, () => {
    I.boom(S, t, { level: 0.45 * power, f0: subHz, f1: 36, decay: 1.6 + power });
    I.taiko(S, t, 0.6 * power, { size: 1 });
    if (braam != null) O.braam(S, t, braam, { level: 0.42 * power, power, dur: 1.8 + power });
    if (cymbal) I.crash(S, t, 0.09 * power);
    if (chord) I.harpRoll(S, t, CHORDS[chord].choir.concat(CHORDS[chord].choir.at(-1) + 12), { level: 0.1 * power });
    if (down) I.downer(S, t + 0.15, { level: 0.07 * power, dur: 1.6 });
  });
}

function accents(S) {
  hit(S, C.titleLocked, { power: 0.55, braam: 50, chord: 'Dm9' });
  hit(S, C.templeReveal, { power: 0.8, braam: 53, chord: 'F', down: true });
  hit(S, C.model3D, { power: 0.45, cymbal: false });
  hit(S, C.paintBurst, { power: 0.7, chord: 'F' });
  hit(S, C.gear, { power: 0.85 });
  hit(S, C.machine, { power: 0.95, braam: 46, down: true });
  hit(S, C.circuitCity, { power: 0.8 });
  hit(S, C.earthWide, { power: 1.0, braam: 46, chord: 'Bb', down: true });
  hit(S, C.processorDive, { power: 1.0, braam: 50, down: true });
  hit(S, C.network, { power: 0.55, cymbal: false });
  hit(S, C.pullBack, { power: 1.2, braam: 50, chord: 'D', subHz: 95 });
  // extra weight on the climax: a second taiko ensemble, kick and crash
  S.at(C.pullBack, () => {
    I.taiko(S, C.pullBack + 0.02, 0.55, { size: 0.6 });
    I.kick(S, C.pullBack, 0.9);
    I.crash(S, C.pullBack, 0.07);
  });
}

// Pre-render the ensemble loops the score uses, before rendering starts.
function preload(S) {
  const pairs = [];
  for (const c of Object.values(CHORDS)) {
    c.str.forEach((m) => pairs.push(['strings', m]));
    c.choir.forEach((m) => pairs.push(['choirA', m]));
    c.brass.forEach((m) => pairs.push(['brass', m]));
  }
  [57, 62, 65, 69, 74].forEach((m) => pairs.push(['choirO', m]));
  [50, 62, 64, 65, 67, 69, 74].forEach((m) => pairs.push(['horn', m], ['horn', m - 12]));
  O.preloadSections(S, pairs);
}

// ---------------------------------------------------------------- public

export function arrangeMusic(S) {
  const kicks = [];
  const sk = globalThis.__skip || '';
  preload(S);
  for (const [n, f] of Object.entries({ stringsLayer, choirLayer, brassLayer, themeLayer, colourLayer, snareRoll32, bassLayer, synthLayer, transitions, accents })) if (!sk.includes(n)) f(S);
  if (!sk.includes('rhythm')) rhythmLayer(S, kicks);
  return { kicks };
}
