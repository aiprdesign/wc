// The music: harmony, orchestral layers, the hybrid rhythm section and the
// structural accents. Key: D minor (Aeolian with Dorian colour), BPM 120.
//
//   0–5 s    distant D drone + air; strings bloom on an open fifth
//   4–5      suspended Bb(add9) swell → Dm9 resolution as the title locks (5.0)
//   5–25     noble i–VI–III–VII motion (Dm Bb F C / Gm), warm strings, low brass
//            swells and a sparse harp motif; major-chord hits on templeReveal/model3D
//   25–45.5  hybrid orchestral + electronic: sub pulse on 8ths, kicks, taiko,
//            ticking hats, metal percussion, synth ostinato then 16th arps
//   45.5–50.5 montage: bVI – bVII – V build with a long riser …
//   50.5     … resolving to D MAJOR (the brightening) at pullBack
//   51.5     music drops out (handled by the film bus in score.js)
//
// Percussion is quantised to the 16th grid from t = 0 (bar = 2 s = 16 steps).

import { BEAT, CUES as C } from '../timeline.js';
import * as I from './instruments.js';

export const STEP = BEAT / 4; // 16th note, 0.125 s

// ------------------------------------------------------------------ harmony

// pad: string voicing · brass: low brass voicing · root: sub-bass note (MIDI)
export const CHORDS = {
  D5:    { pad: [38, 50, 57, 62, 69],     brass: [38, 45, 50],     root: 38 },
  Bb9:   { pad: [46, 53, 60, 62, 65],     brass: [34, 41, 46, 50], root: 34 },
  Dm9:   { pad: [50, 57, 65, 69, 76],     brass: [38, 45, 50, 53], root: 38 },
  Dm:    { pad: [50, 57, 62, 65, 69],     brass: [38, 45, 50, 53], root: 38 },
  Bb:    { pad: [46, 53, 62, 65, 70],     brass: [34, 41, 46, 50], root: 34 },
  F:     { pad: [41, 53, 57, 60, 65],     brass: [29, 41, 45, 48], root: 41 },
  C:     { pad: [48, 55, 60, 64, 67],     brass: [36, 43, 48, 52], root: 36 },
  Gm:    { pad: [43, 50, 58, 62, 67],     brass: [31, 43, 46, 50], root: 31 },
  Asus4: { pad: [45, 52, 57, 62, 64],     brass: [33, 45, 50, 52], root: 33 },
  A:     { pad: [45, 52, 57, 61, 64],     brass: [33, 45, 49, 52], root: 33 },
  D:     { pad: [38, 50, 57, 62, 66, 69], brass: [38, 45, 50, 54], root: 38 },
};

export const HARMONY = [
  [0.0, 4.0, 'D5'],     // opening: open fifth, no third yet
  [4.0, 5.0, 'Bb9'],    // title assembling — suspended approach
  [5.0, 8.0, 'Dm9'],    // titleLocked: resolution
  [8.0, 10.6, 'Bb'],    // classical: columns rise
  [10.6, 12.0, 'F'],    // templeReveal: warm major
  [12.0, 14.0, 'C'],    // civic
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
  [35.0, 37.0, 'Bb'],   // flight
  [37.0, 39.0, 'Gm'],   // rocket, earth
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

// Overall orchestral intensity 0..1 (pad level and brightness follow it).
const INTENSITY = [
  [0, 0.1], [2, 0.2], [5, 0.45], [8, 0.45], [10.6, 0.65], [12, 0.5], [16, 0.5], [18.4, 0.65],
  [20, 0.55], [25, 0.75], [32, 0.6], [35, 0.7], [38.2, 0.85], [39, 0.7], [41.3, 0.85], [45.5, 0.9], [50.5, 1],
];
export function intensity(t) {
  const k = INTENSITY;
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
  }
  return k.at(-1)[1];
}

/** Call fn(time, velocity) for every non-rest step of a 16-step bar pattern in [from, to). */
export function pattern(from, to, pat, fn) {
  const vel = { X: 1, x: 0.75, o: 0.45 };
  for (let k = Math.ceil(from / STEP - 1e-6); k * STEP < to - 1e-6; k++) {
    const ch = pat[k % pat.length];
    if (ch !== '.') fn(k * STEP, vel[ch] ?? 0.75, k);
  }
}

// ------------------------------------------------------------------ layers

function stringsLayer(S) {
  for (const [a, b, name] of HARMONY) {
    const hybrid = a >= C.gear;
    const start = name === 'D5' ? 1.4 : a;
    const lv = intensity(a);
    const { pad, root } = CHORDS[name];
    // Before the sub pulse takes over, a cello/bass note doubles the root an octave down.
    const notes = hybrid || name === 'D5' ? pad : [root >= 36 ? root - 12 : root, ...pad];
    S.at(start, () => I.strings(S, start, b, notes, {
      level: 0.34 * (0.35 + 0.65 * lv),
      attack: name === 'D5' ? 2.6 : name === 'D' ? 0.03 : hybrid ? 0.25 : 0.9,
      release: hybrid ? 0.45 : 1.1,
      cutoff: 600 + 2600 * lv,
    }));
  }
}

const BRASS = [
  // [start, duration, chord, level, options]
  [4.0, 1.0, 'Bb9', 0.5, { attack: 0.9 }],               // swell into the title
  [5.0, 2.6, 'Dm', 0.85, { sfz: true }],                 // titleLocked
  [10.6, 1.8, 'F', 1.0, { sfz: true, bright: 2200 }],    // templeReveal
  [14.0, 2.0, 'Dm', 0.45, { attack: 1.2 }],
  [18.4, 1.6, 'F', 0.8, { sfz: true }],                  // model3D
  [25.0, 2.0, 'Dm', 0.8, { sfz: true }],                 // gear: the machine age
  [29.0, 2.0, 'F', 0.55, { attack: 1.0 }],
  [33.0, 2.0, 'Dm', 0.4, { attack: 1.5 }],
  [37.0, 1.2, 'Gm', 0.6, { attack: 1.0 }],
  [38.2, 0.8, 'Gm', 1.0, { sfz: true, bright: 2200 }],   // earthWide
  [41.3, 1.7, 'Dm', 0.9, { sfz: true }],                 // processorDive
  [45.5, 2.0, 'Bb', 0.8, { attack: 0.6 }],               // montage
  [47.5, 2.0, 'C', 0.9, { attack: 0.6 }],
  [49.5, 1.0, 'Asus4', 1.0, { attack: 0.5, bright: 2200 }],
  [50.5, 1.0, 'D', 1.2, { sfz: true, bright: 2600 }],    // pullBack climax
];

function brassLayer(S) {
  for (const [t, dur, name, lv, o] of BRASS) {
    S.at(t, () => I.brass(S, t, dur, CHORDS[name].brass, { level: 0.3 * lv, ...o }));
  }
}

// Sparse harp motif (orchestral first half).
const MOTIF = [
  [5.4, 69], [6.0, 74], [6.5, 76], [7.0, 77], [7.5, 76],   // after the title locks (Dm9)
  [8.5, 65], [9.0, 70], [9.8, 74],                         // columns (Bb)
  [12.5, 67], [13.0, 72], [13.9, 76], [14.8, 74], [15.5, 69], // one note per civic word
  [17.0, 70], [17.5, 74], [18.0, 77], [18.5, 81], [19.0, 77], [19.5, 72], // renaissance
  [22.0, 69], [22.5, 74], [23.0, 77], [23.5, 76],          // science (orbiting figure)
];

function harpLayer(S) {
  MOTIF.forEach(([t, m], i) => S.at(t, () => I.pluck(S, t, m, { level: 0.2, pan: i % 2 ? 0.35 : -0.35 })));
  // golden ratio: a spiral of notes converging (gaps shrink by φ)
  [58, 62, 65, 70, 74, 77, 82].forEach((m, k) => {
    const t = C.goldenRatio + 0.55 * (1 - 0.618 ** k);
    S.at(t, () => I.pluck(S, t, m, { level: 0.16, pan: Math.sin(k * 2.4) * 0.6 }));
  });
  // the falling apple
  [79, 74, 70, 67, 62, 55].forEach((m, k) => {
    const t = C.fallStart + k * 0.09;
    S.at(t, () => I.pluck(S, t, m, { level: 0.16 - k * 0.012, pan: 0.3 - k * 0.1 }));
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
const TAIKO = [
  [25.5, 28.5, 'X.......x.......'],
  [28.5, 31.5, 'X...............'],
  [34.5, 38.2, 'X.......x.....x.'],
  [41.5, 45.5, 'X.......x.....x.'],
  [45.5, 47.5, 'X...x...X...x...'],
  [47.5, 50.5, 'X.x.x.x.X.x.x.x.'],
];
const TOMS = [
  [36.0, 38.2, '..........x.x.x.'],
  [40.75, 41.25, '......oxxX......'],  // fill into the processor dive
  [47.5, 49.5, '.x.x.x.x.x.x.x.x'],
];
const SNARE = [
  [28.5, 31.5, '....x.......x...'],
  [36.0, 38.2, '....x.......x...'],
  [41.5, 49.5, '....x.......x...'],
];
const HATS = [
  [26.0, 26.5, 'x.x.x.x.x.x.x.x.'],
  [26.5, 31.5, 'xoxoXoxoxoxoXoxo'],
  [31.5, 34.5, 'o...o...o...o...'],
  [34.5, 38.2, 'xoxoxoxoxoxoxoxo'],
  [38.5, 39.5, 'o.o.o.o.o.o.o.o.'],
  [39.5, 50.5, 'xoXoxoxoxoXoxoxo'],
];

function rhythmLayer(S, kicks) {
  for (const [a, b, p] of KICK) {
    pattern(a, b, p, (t, v) => {
      kicks.push(t);
      S.at(t, () => I.kick(S, t, 0.85 * v));
    });
  }
  for (const [a, b, p] of TAIKO) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.drum(S, t, 0.55 * v, { f: 68, decay: 1.0, pan: (k % 4 ? 0.25 : -0.25) })));
  }
  for (const [a, b, p] of TOMS) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.drum(S, t, 0.35 * v, { f: k % 2 ? 98 : 118, decay: 0.55, pan: k % 2 ? -0.4 : 0.4, skin: 0.7 })));
  }
  for (const [a, b, p] of SNARE) {
    pattern(a, b, p, (t, v) => S.at(t, () => I.snare(S, t, 0.22 * v, { pan: 0.05 })));
  }
  for (const [a, b, p] of HATS) {
    pattern(a, b, p, (t, v, k) => S.at(t, () => I.hat(S, t, 0.075 * v, { pan: 0.28 + (k % 2) * 0.1 })));
  }
  // montage finale bar: snare + tom roll crescendo into pullBack
  pattern(49.5, C.pullBack, 'xxxxxxxxxxxxxxxx', (t) => {
    const u = (t - 49.5) / (C.pullBack - 49.5);
    S.at(t, () => {
      I.snare(S, t, 0.08 + 0.22 * u, { pan: -0.1 });
      I.drum(S, t, 0.15 + 0.3 * u, { f: 90 + 40 * u, decay: 0.4, pan: 0.2, skin: 0.8 });
    });
  });
  // open hats on bar downbeats through the peak
  pattern(41.5, 50.5, 'X...............', (t) => S.at(t, () => I.hat(S, t, 0.06, { open: true, pan: -0.3 })));
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
  S.at(t0, () => I.subPulse(S, t0, t1, roots, hits, { level: 0.42 }));
}

function synthLayer(S) {
  // 8th-note ostinato (root / octave / fifth), industrial → flight
  pattern(C.gear, 39.5, 'x.o.x.o.x.o.x.o.', (t, v, k) => {
    const ch = chordAt(t);
    const r = ch.root + 12 < 45 ? ch.root + 24 : ch.root + 12;
    const m = [r, r + 12, r + 7, r + 12][(k / 2) % 4];
    if (t >= 31.5 && t < 34.5 && k % 4) return; // thinner through medicine
    S.at(t, () => I.synthPluck(S, t, m, { level: 0.05 * v, pan: k % 4 ? 0.3 : -0.3, cutoff: 1400 + 1400 * intensity(t) }));
  });
  // 16th arpeggios, computing → montage
  const shape = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern(39.5, C.pullBack, 'xxxxxxxxxxxxxxxx', (t, v, k) => {
    const tones = chordAt(t).pad.filter((m) => m >= 55).map((m) => m + 12);
    const m = tones[shape[k % 8] % tones.length];
    const u = (t - 39.5) / (C.pullBack - 39.5);
    S.at(t, () => I.synthPluck(S, t, m, {
      level: (k % 4 === 0 ? 0.05 : 0.035) * (0.7 + 0.5 * u), pan: k % 2 ? 0.45 : -0.45, decay: 0.16, cutoff: 1800 + 3000 * u,
    }));
  });
}

// ------------------------------------------------------------ transitions

function risersAndSwells(S) {
  S.at(C.titleAssemble, () => I.swellIn(S, C.titleLocked, 1.0, { level: 0.08 }));
  S.at(9.9, () => I.swellIn(S, C.templeReveal, 0.7, { level: 0.1 }));
  S.at(19.4, () => I.swellIn(S, C.paintBurst, 0.5, { level: 0.12 }));
  S.at(C.prismBeam, () => I.riser(S, C.prismBeam, C.gear, { level: 0.05, from: 600, to: 6000 }));
  S.at(40.3, () => I.riser(S, 40.3, C.processorDive, { level: 0.1, pitch: [50, 74] }));
  S.at(C.mColumns - 0.1, () => I.riser(S, C.mColumns - 0.1, C.pullBack, { level: 0.14, from: 200, to: 9000, pitch: [38, 74] }));
}

// Orchestral "hit" used on the story's big beats.
function accent(S, t, { chord, power = 1, harp = true, cymbal = true, subHz = 80 }) {
  S.at(t, () => {
    I.boom(S, t, { level: 0.5 * power, f0: subHz, f1: 36, decay: 1.6 + power });
    I.drum(S, t, 0.7 * power, { f: 62, decay: 1.6, skin: 0.6 });
    if (cymbal) I.crash(S, t, 0.1 * power, { decay: 2.4 });
    if (harp) I.harpRoll(S, t, CHORDS[chord].pad.filter((m) => m >= 50).concat(CHORDS[chord].pad.at(-1) + 12), { level: 0.13 * power });
  });
}

function accents(S) {
  accent(S, C.titleLocked, { chord: 'Dm9', power: 0.7 });
  accent(S, C.templeReveal, { chord: 'F', power: 0.9 });
  accent(S, C.model3D, { chord: 'F', power: 0.6, cymbal: false });
  accent(S, C.paintBurst, { chord: 'F', power: 0.8 });
  accent(S, C.gear, { chord: 'Dm', power: 0.9, harp: false });
  accent(S, C.machine, { chord: 'Bb', power: 0.8, harp: false });
  accent(S, C.circuitCity, { chord: 'C', power: 0.85, harp: false });
  accent(S, C.earthWide, { chord: 'Gm', power: 1.0 });
  accent(S, C.processorDive, { chord: 'Dm', power: 1.0, harp: false });
  accent(S, C.network, { chord: 'C', power: 0.7, harp: false });
  accent(S, C.pullBack, { chord: 'D', power: 1.2, subHz: 95 });
  // extra weight on the climax: doubled taiko and a second crash
  S.at(C.pullBack, () => {
    I.drum(S, C.pullBack, 0.6, { f: 80, decay: 1.4, pan: -0.5 });
    I.drum(S, C.pullBack + 0.01, 0.6, { f: 55, decay: 1.8, pan: 0.5 });
    I.kick(S, C.pullBack, 0.9);
    I.crash(S, C.pullBack, 0.08, { decay: 3 });
  });
}

// ---------------------------------------------------------------- public

export function arrangeMusic(S) {
  const kicks = [];
  const sk = globalThis.__skip || '';
  if (!sk.includes('strings')) stringsLayer(S);
  if (!sk.includes('brass')) brassLayer(S);
  if (!sk.includes('harp')) harpLayer(S);
  if (!sk.includes('rhythm')) rhythmLayer(S, kicks);
  if (!sk.includes('bass')) bassLayer(S);
  if (!sk.includes('synth')) synthLayer(S);
  if (!sk.includes('risers')) risersAndSwells(S);
  if (!sk.includes('accents')) accents(S);
  return { kicks };
}
