// The music (v6–v8): a three-act trailer score in D minor, 120 BPM, bar = 2 s from t = 0 —
// all in STORY time. The Studio plays it on the film clock (× TIME_SCALE: 86.4 BPM, bar =
// 2.78 s), so every number below stays on the story grid and on the timeline's CUES.
//
// THEME (8 notes, heroic 5th + octave leaps):  D — A — D' — C' Bb — A — G — A
//   developed  fragment (piano, 6 s) → gentle full statement (piano + celesta, 12 s)
//   → horns (36 s: D A D' C', cut off by the Earth) → the MOONSHOT completes it (theme
//   head D — A on moonLanding, D' C' Bb A G A from earthrise) → the NEW FRONTIER sings it
//   proudly on brass (D A D' C' Bb A, 49.9 s) and ends it G — A — D' on the Mars vision →
//   EPIC statement (brass + horns + choir, 55.5 s) → high D on the Picardy D-major chord at
//   the pullBack → a tender REPRISE (solo piano, 61.5 s) → the head D — A asked by the
//   piano in the hush and answered D — A — D' by the horns on the final button (71 s).
//
// ACT I   0 – 20    (v12) a trailer COLD OPEN — a BRAAM out of silence on the ignition, taiko
//                   stabs under the flash-forward, a ticking spiccato pulse through the
//                   construction, a riser and a held breath into the title SLAM (the opening's
//                   loudest moment: sub, taiko ensemble, BRAAM, brass + choir stab on D minor,
//                   ringing under the subtitle) — then mystery & wonder: drone, distant choir,
//                   piano/celesta motif, space; designed hits on templeReveal (BRAAM),
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
//   FRONTIER 49.5 – 55.5 (v8: three bars inserted; everything after moved +6 s, so the grid
//                   holds — see frontier() below): the build lands on the shuttle and the
//                   drive carries on under a proud brass statement of the theme
//                   (i – VI – iv – III: Dm Bb Gm F), shimmering awe for Hubble and Webb, a
//                   pulsing "double-helix" synth for the genome, a light moment of wonder
//                   for the rover (B♭ lydian: harp + celesta), a rising build through
//                   Artemis (C) and a heroic D-MAJOR swell with choir on the Mars vision
//                   (♭VI – ♭VII – I), which hands straight into act III.
// ACT III 55.5 – 60.5 climax: epic THEME over i–VI–III–iv–V, percussion accelerating
//                   8ths → 16ths → 32nd snare roll, suck-back, D MAJOR at the pullBack.
// CODA    60.5 – 78.5 (cue-pinned, see "the CODA" below): the climax blooms and decays
//                   into a tender reprise that gathers, breathes (ideasLine), swells on the
//                   sunrise into the final button at 71.0, and resolves in D major.

import { BEAT, CUES as C } from '../timeline.js';
import * as I from './instruments.js';
import * as O from './orchestra.js';
import * as X from './sfx.js';

export const STEP = BEAT / 4; // 16th note, 0.125 s

// The moonshot (38.5 – 42.5) was inserted into act II, and the new frontier (49.5 – 55.5)
// between act II and act III; act II/III's slow ramps (level, drive, brightness) are written
// in pre-insertion time `ot(t)` and simply hold through both (the frontier shapes its own
// dynamics on top: FRONT_PULSE, FRONT_KIT).
const M0 = 38.5, M1 = 42.5;
const F0 = 49.5, F1 = 55.5;
const ft = (t) => (t < F0 ? t : t < F1 ? F0 : t - (F1 - F0));   // without the frontier
const ot = (t) => { t = ft(t); return t < M0 ? t : t < M1 ? M0 : t - (M1 - M0); };
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
// (v11: the hats carry on half a bar into the descent and fade out there, instead of stopping
// with the drums on the lunarDescent cue — the top of the texture no longer drops away at once)
const COAST_HATS = (t) => env(t, [[38.5, 1], [39.6, 0.35], [40.1, 0.08]]);
// ostinato / pulse level through the frontier: eased back (never stopped) for the rover's
// moment of wonder, growing through Artemis into the Mars vision
const FRONT_PULSE = [[C.rover - 0.1, 1], [C.rover, 0.88], [C.artemis - 0.1, 0.88], [C.marsVision, 1.08], [F1 - 0.1, 1.08], [F1, 1]];
const fpulse = (t) => env(t, FRONT_PULSE);

// ------------------------------------------------------------------ the tempo map (v11)
//
// Some of the picture's biggest hit points fall between 16ths: templeReveal 10.6, earthWide
// 38.2, moonLanding 40.6, earthrise 41.8, processorDive 45.3, marsVision 54.6. A hit placed
// on such a cue flams against the running groove (a kit stroke 25–50 ms before or after it);
// a hit moved onto the grid misses the picture. So, as with a film composer's tempo map,
// the grid bends instead: over a beat or three before and after, the 16ths lean ahead or
// hold back (by ≤ 3.3 %, 6.7 % over the moon landing's held breath), so that the grid point
// nearest each hit lands exactly ON its cue. Bar lines away from the hits are untouched.
// `groove(g)` maps grid time → performance time (both story seconds); the identity elsewhere.
// Everything written on the grid (patterns, rolls, grid-timed notes and chord changes) goes
// through it; everything written on a cue stays on the cue — so hits and groove coincide.
const q16 = (t) => Math.round(t / STEP) * STEP;   // the 16th nearest t
const GROOVE = [   // [grid time, performance time], in order
  [9.0, 9.0], [q16(C.templeReveal), C.templeReveal], [11.5, 11.5],                  // the tom roll into the temple
  [36.75, 36.75], [q16(C.earthWide), C.earthWide],                                  // pushes into BRAAM 2 …
  [q16(C.moonLanding), C.moonLanding], [q16(C.earthrise), C.earthrise], [43.25, 43.25], // … breathes through the landing into the earthrise
  [43.75, 43.75], [q16(C.processorDive), C.processorDive], [46.75, 46.75],          // broadens into the processor dive
  [53.875, 53.875], [q16(C.marsVision), C.marsVision], [55.5, 55.5],                // Artemis' roll lands on the Mars vision
];
export function groove(g) {
  const k = GROOVE;
  if (g <= k[0][0] || g >= k.at(-1)[0]) return g;
  for (let i = 1; i < k.length; i++) {
    const [g1, p1] = k[i];
    if (g <= g1) {
      const [g0, p0] = k[i - 1];
      return g === g1 ? p1 : p0 + (p1 - p0) * (g - g0) / (g1 - g0);
    }
  }
  return g;
}
const onGrid = (t) => Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6;
/** A time written on the grid follows the tempo map; one written on a cue stays put. */
const gT = (t) => (onGrid(t) ? groove(t) : t);

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
  // the rover: B♭ lydian (B♭maj7♯11), open and light — wonder
  BbL:  { str: [46, 53, 57, 62, 64],     hi: [69, 74, 76],     choir: [58, 62, 65, 69],     brass: [34, 41, 46, 50], root: 34 },
};

const WEBB = q16(C.webb);   // 52.25: the frontier's theme sings its A (and the chord turns to F) on the grid
export const HARMONY = [
  // ACT I
  [0.0, C.titleAssemble, 'D5'],                // open fifth, no third yet
  [C.titleAssemble, C.titleLocked, 'Bb9'],     // title assembling (suspended)
  [C.titleLocked, 8.0, 'Dm'],                  // titleLocked: the SLAM
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
  [48.0, 49.5, 'Asus'],// dominant pedal under the build into the frontier
  // THE NEW FRONTIER (chords change on the picture's cues)
  [49.5, C.hubble, 'Dm'],         // shuttle: the brass theme
  [C.hubble, C.genome, 'Bb'],     // Hubble's deep field: awe (D' over B♭)
  [C.genome, WEBB, 'Gm'],         // genome: the pulse
  [WEBB, C.rover, 'F'],           // Webb: golden (III) (on the 16th where the brass theme's A lands)
  [C.rover, C.artemis, 'BbL'],    // rover: B♭ lydian, light — wonder
  [C.artemis, C.marsVision, 'C'], // Artemis: the rising build (♭VII)
  [C.marsVision, 55.5, 'D'],      // Mars: the heroic D-major lift (♭VI – ♭VII – I)
  // ACT III
  [55.5, 57.0, 'Dm'], [57.0, 58.0, 'Bb'], [58.0, 59.0, 'F'], [59.0, 60.0, 'Gm'],
  [60.0, 60.5, 'A'],
  [60.5, 62.0, 'D'],   // pullBack: Picardy D major
];
// chord changes written on the grid follow the tempo map (those on cues already sit on them)
for (const h of HARMONY) { h[0] = gT(h[0]); h[1] = gT(h[1]); }

export const chordAt = (t) => CHORDS[(HARMONY.find(([a, b]) => t >= a && t < b) ?? HARMONY.at(-1))[2]];

/**
 * Call fn(time, velocity, step) for every non-rest step of a 16-step bar pattern in [from, to)
 * (grid time); `time` is the step's performance time on the tempo map (see groove).
 */
export function pattern(from, to, pat, fn, step = STEP) {
  const vel = { X: 1, x: 0.75, o: 0.45 };
  for (let k = Math.ceil(from / step - 1e-6); k * step < to - 1e-6; k++) {
    const ch = pat[k % pat.length];
    if (ch !== '.') fn(groove(k * step), vel[ch] ?? 0.75, k);
  }
}

// ------------------------------------------------------------------ THEME
// [time, midi, duration] per statement.
const THEME_NOTES = [62, 69, 74, 72, 70, 69, 67, 69];
const mk = (times, durs, tr = 0) => THEME_NOTES.map((m, i) => [times[i], m + tr, durs[i]]).filter(([t]) => t != null);
/** Notes written on the grid follow the tempo map (their ends too, so legato lines stay joined). */
const onMap = (notes) => notes.map(([t, m, d]) => { const a = gT(t); return [a, m, gT(t + d) - a]; });

// 1. fragment (piano, after the title): D — A — D' … C'
const FRAGMENT = [[6.0, 62, 0.5], [6.5, 69, 0.5], [7.0, 74, 1.0], [8.0, 72, 1.5]];
// 2. gentle full statement (piano + celesta), a bar per two notes
const GENTLE = mk([12.0, 13.0, 14.0, 15.5, 16.0, 17.0, 17.5, 18.0], [1, 1, 1.5, 0.5, 1, 0.5, 0.5, 0.4]);
// 3. horns, act II: D A D' C' — the C' hangs over the Earth as the moonshot begins …
const HORNS = onMap(mk([36.0, 36.5, 37.0, 38.0], [0.5, 0.5, 1, 0.9]));
// … the moonshot completes it: the head D — A on moonLanding (horns + choir), then
// D' C' Bb A G A from earthrise into computing (horns + strings)
const LANDING = [[C.moonLanding, 62, 0.4], [C.moonLanding + 0.4, 69, 0.8]];
const EARTHRISE = [[C.earthrise, 74, groove(42.25) - C.earthrise], ...onMap([[42.25, 72, 0.25], [42.5, 70, 0.5], [43.0, 69, 0.5], [43.5, 67, 0.5], [44.0, 69, 1.3]])];
// 4. the new frontier: brass (horns + trumpets) sing D A D' C' Bb A over the shuttle,
// Hubble, the genome and Webb; the rover's wonder interrupts, and Artemis / the Mars vision
// finish it heroically — G — A — D' on the D-major lift
// (v11: the notes sit on the 16ths nearest the cues — 49.875, 50.25, 50.75, 51.875, 52.25 —
// so the melody is in time with the ostinato; the picture's glints stay on the cues)
const FRONT_THEME = [
  [q16(C.shuttle), 62, 0.375], [50.25, 69, 0.5], [q16(C.hubble), 74, 0.75],
  [C.genome, 72, 0.375], [51.875, 70, 0.375], [WEBB, 69, 1.2], // (the A lingers: B♭ lydian's 7th)
];
const MARS_THEME = onMap([[q16(C.artemis), 67, 0.375], [54.25, 69, 0.375]]).concat([[C.marsVision, 74, 0.8]]);
// 5. epic statement → high D on the D-major pullBack
const EPIC = [
  [55.5, 62, 0.5], [56.0, 69, 1.0], [57.0, 74, 1.0], [58.0, 72, 0.5], [58.5, 70, 0.5],
  [59.0, 69, 0.5], [59.5, 67, 0.5], [60.0, 69, 0.42], [C.pullBack, 74, 1.0],
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
  if (t < C.titleLocked) return 0.18;
  if (t < 12) return 0.34;
  if (t < 20) return 0.42;
  if (t < 45.5) return 0.46 + 0.38 * (t - 20) / 25.5;
  return 0.95;
}

// The moonshot's string bed: sul tasto and swelling over the descent, D major on the
// landing, full and bright (with the upper strings) on the earthrise. The frontier's rover
// is light (sul tasto, no upper strings); Artemis crescendos into the Mars vision.
const MOON_STR = {
  39.6: { level: 0.2, attack: 0.5, release: 0.3, cutoff: 2000, swell: 0.55 },
  40.6: { level: 0.34, attack: 0.1, release: 0.3, cutoff: 4200 },
  41.8: { level: 0.5, attack: 0.08, release: 0.3, cutoff: 5500, hi: true },
  [C.rover]: { level: 0.38, attack: 0.2, release: 0.3, cutoff: 3200, dark: 0.6 },
  [C.artemis]: { level: 0.5, attack: 0.3, release: 0.2, cutoff: 4800, swell: 0.4, hi: true },
  [C.marsVision]: { level: 0.6, attack: 0.1, release: 0.25, cutoff: 5800, hi: true },
};

// The sub pulse's pitch for a chord (act II): its root, an octave up if below A1.
const subRoot = (c) => c.root + (c.root < 33 ? 12 : 0);

function stringsLayer(S) {
  for (const [a, b, name] of HARMONY) {
    if (a >= C.pullBack) break;
    const lv = lift(a);
    const first = a === 0;
    const moon = MOON_STR[a];
    // (v11: the moonshot's / frontier's arrivals are cued hits, so their strings enter just
    // before the cue rather than a full 0.12 early — the bow's bite no longer pre-empts the hit)
    const start = first ? C.pointAppears : moon ? a - Math.min(0.12, moon.attack * 0.3) : a - 0.12;
    // while the sub pulse runs, it owns the bass fundamental: a string note in unison
    // with it would only beat against it (slow, deep cancellations of the low end)
    const notes = a >= 20 ? CHORDS[name].str.filter((m) => m !== subRoot(CHORDS[name])) : CHORDS[name].str;
    S.at(start, () => O.chord(S, 'strings', start, b, notes, moon ?? {
      level: 0.55 * lv, attack: first ? 1.6 : a < 20 ? 0.6 : 0.15, release: a < 20 ? 1.2 : 0.3,
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
  // (on the tempo map: the roll leans ahead a little, so that its next 16th is the hit)
  for (let g = 9.0; g < q16(C.templeReveal) - 0.01; g += STEP) {
    const u = (g - 9.0) / 1.6, t = groove(g);
    S.at(t, () => I.tom(S, t, 0.08 + 0.22 * u, { f: 88, pan: Math.round(g / STEP) % 2 ? 0.3 : -0.3 }));
  }
  // tremolo tension before the two big act II arrivals and the climax
  S.at(44.0, () => O.tremolo(S, 44.0, C.processorDive, [69, 73, 76, 81], { level: 0.15 }));
  S.at(59.0, () => O.tremolo(S, 59.0, OST_END, [74, 79, 81, 86], { level: 0.18 }));
}

const CHOIR = [
  // [start, end, chord, vowel, level, attack, release]
  [C.pointAppears, C.titleLocked, 'D5', 'choirO', 0.1, 1.5, 0.1],   // distant, rising under the construction
  [C.titleLocked, 8.9, 'Dm', 'choirA', 0.2, 0.03, 1.2],   // the SLAM: a full "ah", ringing under the subtitle (held into the columns: B♭maj7)
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
  // the frontier: a halo of "ooh" for the telescopes, hushed for the rover, rising
  // through Artemis into the full-voiced Mars vision
  [C.hubble - 0.05, C.genome, 'Bb', 'choirO', 0.2, 0.3, 0.3],
  [C.webb - 0.05, C.rover, 'F', 'choirO', 0.18, 0.3, 0.3],
  [C.rover, C.artemis, 'BbL', 'choirO', 0.1, 0.35, 0.2],
  [C.artemis, C.marsVision, 'C', 'choirA', 0.24, 0.6, 0.05],
  [C.marsVision, 55.5, 'D', 'choirA', 0.42, 0.1, 0.25],  // (v11: into act III's downbeat, released under the hit)
  [55.5, 57.0, 'Dm', 'choirA', 0.26, 0.05, 0.2], // act III chords under the epic theme
  [57.0, 58.0, 'Bb', 'choirA', 0.28, 0.05, 0.2],
  [58.0, 59.0, 'F', 'choirA', 0.3, 0.05, 0.2],
  [59.0, 60.0, 'Gm', 'choirA', 0.32, 0.05, 0.2],
  [60.0, 60.42, 'A', 'choirA', 0.34, 0.05, 0.05],
  [60.5, 61.5, 'D', 'choirA', 0.45, 0.03, 0.6],  // pullBack
];

function choirLayer(S) {
  for (const [a, b, name, vowel, level, attack, release] of CHOIR) {
    S.at(a, () => O.chord(S, vowel, a, b, CHORDS[name].choir, { level, attack, release, cutoff: 5200, dark: 0.5, bus: 'choir' }));
  }
}

// ------------------------------------------------------------------ act I colour

function actOne(S) {
  // celesta sparkles of the theme head as the point appears / the construction completes
  [[C.pointAppears, 86], [C.gridDone, 98]].forEach(([t, m]) => S.at(t, () => I.celesta(S, t, m, { level: 0.025, pan: 0.3, bus: 'far' })));
  openingPulse(S);
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
  // (the quarter right after the model3D whoosh-hit, 18.5, is left to the hit's ring)
  pattern(16.0, 20.0, 'x...o...x...o...', (t, v) => t !== 18.5 && S.at(t, () => I.pizz(S, t, chordAt(t).root + 12, { level: 0.12 * v })));
  // the falling apple lands on the downbeat of act II
  [81, 76, 72, 69, 64, 57].forEach((m, k) => {
    const t = C.fallStart + k * 0.09;
    S.at(t, () => I.pluck(S, t, m, { level: 0.1 - k * 0.008, pan: 0.3 - k * 0.1 }));
  });
}

// ------------------------------------------------------------------ the COLD OPEN (v12)
//
//   0.0 – 0.125   a reversed suck out of silence (cues.js) …
//   ignition      … BRAAM on D out of nothing: sub drop, taiko, kick, crash, impact
//   flashForward  four taiko stabs on the 8ths under the silhouettes, a low brass "bwah" on the first
//   pointAppears  a reverse cymbal collapses into the point: a soft low bloom
//   1.5 – 3.375   the construction: spiccato D on 16ths and a low heartbeat on the beat, growing;
//                 a riser + reverse cymbal from 2.5; a taiko build on 16ths through the fly-through,
//                 cut a 16th early — a held breath —
//   titleLocked   the SLAM, the opening's loudest moment: sub drop, taiko ensemble, kick, two crashes,
//                 impact, BRAAM on D, a brass + choir + strings stab on D minor, a harp bloom and a
//                 downer; the choir's "ah" (CHOIR) and a high shimmer ring on under the subtitle

// Orchestra studio: the tension pulse under the construction
function openingPulse(S) {
  const a = C.pointAppears, b = C.titleLocked - STEP;   // … stops a 16th before the SLAM
  for (let t = a, k = 0; t < b - 1e-6; t += STEP, k++) {
    const u = (t - a) / (b - a);
    const acc = k % 4 === 0 ? 1 : k % 2 === 0 ? 0.62 : 0.45;
    S.at(t, () => {
      O.spiccato(S, t, k % 8 === 6 ? 45 : 38, { level: (0.05 + 0.13 * u) * acc, decay: 0.11 });
      if (k % 4 === 0) O.spiccato(S, t, 50, { level: (0.03 + 0.08 * u) * acc, decay: 0.1 });
    });
  }
  // low strings + horns swell into the SLAM (they stop dead on the held breath)
  S.at(C.flyThrough, () => O.brass(S, C.flyThrough, b - C.flyThrough, [38, 45, 50], { level: 0.14, attack: 0.7, release: 0.05, bright: 1500, kind: 'horn' }));
}

// Rhythm studio: the hits of the cold open
function openingHits(S) {
  const ign = C.ignition, ff = C.flashForward, pA = C.pointAppears, tL = C.titleLocked;
  // IGNITION: BRAAM out of silence
  hit(S, ign, { power: 0.95, braam: 38, down: true, subHz: 100 });
  S.at(ign, () => { I.kick(S, ign, 0.8); I.taiko(S, ign + 0.015, 0.5, { size: 0.6 }); });
  // flash-forward: a taiko stab under each silhouette (the last one a flam), a low brass bwah on the first
  for (let k = 0; k < 4; k++) {
    const t = ff + k * 0.25;
    S.at(t, () => {
      I.taiko(S, t, 0.36 + 0.06 * k, { size: 1 });
      I.boom(S, t, { level: 0.16 + 0.03 * k, f0: 78, f1: 38, decay: 0.7 });
      if (k === 3) I.taiko(S, t + 0.06, 0.3, { size: 0.6 });
    });
  }
  S.at(ff, () => O.brass(S, ff, 0.2, [38, 45, 50], { level: 0.26, sfz: true, bright: 1400, release: 0.35 }));
  // collapse → the point
  S.at(pA - 0.25, () => I.revCymbal(S, pA, 0.25, { level: 0.05 }));
  S.at(pA, () => I.boom(S, pA, { level: 0.14, f0: 60, f1: 36, decay: 1.2 }));
  // the construction: a low heartbeat on the beat, growing
  for (let t = pA + BEAT, k = 0; t < tL - 1e-6; t += BEAT, k++) {
    const u = (t - pA) / (tL - pA);
    S.at(t, () => { I.tom(S, t, 0.1 + 0.2 * u, { f: 56, pan: 0 }); I.tom(S, t + 0.14, 0.06 + 0.12 * u, { f: 48, pan: 0 }); });
  }
  // into the SLAM: riser + reverse cymbal, and a taiko build on 16ths through the fly-through,
  // stopping a 16th early — a held breath — so the hit lands out of a hole
  S.at(C.gridDone, () => I.riser(S, C.gridDone, tL, { level: 0.07, from: 300, to: 8000, pitch: [38, 62] }));
  S.at(tL - 0.9, () => I.revCymbal(S, tL, 0.9, { level: 0.07 }));
  for (let t = C.flyThrough, k = 0; t < tL - STEP - 1e-6; t += STEP, k++) {
    const u = (t - C.flyThrough) / (tL - STEP - C.flyThrough);
    S.at(t, () => I.taiko(S, t, 0.12 + 0.3 * u * u, { size: 0.6 }));
  }
  // THE SLAM
  hit(S, tL, { power: 1.15, braam: 50, chord: 'Dm', down: true, subHz: 110 });
  S.at(tL, () => {
    I.boom(S, tL, { level: 0.45, f0: 120, f1: 30, decay: 3.2 });
    I.kick(S, tL, 0.95);
    I.taiko(S, tL + 0.018, 0.7, { size: 1 });
    I.taiko(S, tL + 0.035, 0.5, { size: 0.6 });
    I.crash(S, tL + 0.01, 0.07);
    O.brass(S, tL, 0.7, [38, 45, 50, 53, 57], { level: 0.5, sfz: true, bright: 2300, release: 1.6 });
    O.chord(S, 'strings', tL, tL + 0.6, [38, 50, 57, 62, 65, 69, 74], { level: 0.4, attack: 0.02, release: 1.6, cutoff: 5000 });
  });
  // … ringing on under the subtitle: a high shimmer of D minor
  [[tL + 0.05, 86], [tL + 0.12, 89], [tL + 0.19, 93], [C.subtitle, 98]].forEach(([t, m], i) => S.at(t, () => I.bell(S, t, m, { level: 0.02, decay: 2.6, pan: -0.4 + i * 0.27, bus: 'far' })));
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
    const lv = 0.2 * acc[k % 16] * drive(t) * phrase * env(t, MOON_PULSE) * fpulse(t);
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
    const u = (ot(t) - 20) / 30, mp = env(t, MOON_PULSE) * fpulse(t);
    S.at(t, () => I.synthPluck(S, t, m, { level: (k % 4 ? 0.035 : 0.05) * (0.8 + 0.6 * u) * mp, decay: 0.18, cutoff: (900 + 2600 * u) * mp, pan: k % 4 ? 0.25 : -0.25 }));
  });
  // sub pulse (mono): one voice for the whole act
  const t0 = 20.0;
  const roots = HARMONY.filter(([, b]) => b > t0).map(([a, , n]) => [Math.max(a, t0), subRoot(CHORDS[n])]);
  const hits = [];
  for (let t = t0; t < OST_END - 1e-6; t += BEAT / 2) {
    const on = Math.round(t / (BEAT / 2)) % 2 === 0;
    hits.push({ t: groove(t), v: (on ? 1 : 0.65) * (t < 24 ? 0.6 : t < 28 ? 0.8 : 1) * env(t, [[39.4, 1], [39.7, 0.75], [41.6, 0.75], [41.8, 1]]) * Math.min(1, fpulse(t)), len: 0.22 });
  }
  // the pullBack's sub dies away naturally under the bloom (v11: it used to hold at -13 dB and
  // stop dead at the earthReveal, a hole in the low end just as the reprise begins)
  hits.push({ t: C.pullBack, v: 1.1, len: 2.4, floor: 0 });
  S.at(t0, () => I.subPulse(S, t0, C.earthReveal + 1.5, roots, hits, { level: 0.36, release: 0.4 }));
}

// Layer entries, every 4 bars. [from, to, pattern, level(t)?] — the kit thins out over
// the translunar coast, rests through the descent and landing, and is back on earthrise.
// (v7: at the film's 86.4 BPM the grid is 39 % wider, so the groove carries more 16ths —
// taiko pickups from 28, 16th hats from 28 / 32 — to keep the hybrid section driving.)
const LIGHT = () => 0.85; // the frontier's rover: the kit plays softly
const TAIKO = [
  [24.0, 28.0, 'X.......x.....x.'],
  [28.0, 32.0, 'X.....o.x...o.x.'],
  [32.0, 36.0, 'X.....x.x.....x.'],
  [36.0, M0, 'X.x.x.x.X.x.x.x.'],    // 8ths with the horn theme
  [M0, 39.6, 'X.......x.......', COAST], // translunar: half time
  [41.8, 48.0, 'X.x.x.x.X.x.x.x.'],  // earthrise → computing
  [48.0, 49.5, 'X.x.X.x.X.xxX.xx'],
  [49.5, C.rover, 'X.x.x.x.X.x.x.x.'],             // frontier: 8ths under the brass theme
  [C.rover, C.artemis, 'x.x.x.x.x.x.x.x.', LIGHT],   // the rover: the small drums, softly
  [C.artemis, C.marsVision, 'X.x.X.x.X.xxX.xx'],   // Artemis: the build
  [C.marsVision, 55.5, 'X.x.x.x.X.x.x.x.'],
  [55.5, 59.0, 'X.x.x.x.X.x.x.x.'],
  [59.0, OST_END, 'XxxxXxxxXxxxXxxx'], // 16ths into the peak
];
const KICK = [[28.0, M0, 'X...x...X...x...'], [M0, 39.6, 'X...x...X...x...', COAST], [41.8, 49.5, 'X...x...X...x...'],
  [49.5, C.rover, 'X...x...X...x...'], [C.rover, C.artemis, 'X.......X...x...', LIGHT], [C.artemis, 55.5, 'X...x...X...x.x.'],
  [55.5, OST_END, 'X...x...X...x.x.']];
const HATS = [[28.0, 32.0, 'x.o.x.oox.o.x.oo'], [32.0, M0, 'xoxoxoxoxoxoxoxo'], [M0, 40.1, 'x.o.x.o.x.o.x.o.', COAST_HATS], [41.8, 44.0, 'xoxoxoxoxoxoxoxo'],
  [44.0, C.rover, 'xoxoXoxoxoxoXoxo'], [C.rover, C.artemis, 'xoxoxoxoxoxoxoxo', LIGHT], [C.artemis, OST_END, 'xoxoXoxoxoxoXoxo']];
const SNARE = [[32.0, M0, '....x.......x...'], [42.5, 48.0, '....x.......x...'], [48.0, 49.5, '....x...x.x.xxxx'],
  [49.5, C.rover, '....x.......x...'], [C.marsVision, 55.5, '....x.......x...'], [55.5, 59.0, '....x.......x...']];
const TOMS = [[32.0, M0, '............x.xx'], [42.5, 48.0, '............x.xx'], [48.0, 49.5, '..x.x.x.x.x.xxxx'],
  [49.5, C.rover, '............x.xx'], [C.artemis, C.marsVision, '..x.x.x.x.x.xxxx'], [55.5, 59.0, '..........x.x.x.']];
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
  // the frontier: a snare roll (16ths) crescendos through Artemis into the Mars vision
  // (on the tempo map: its next 16th is the Mars hit)
  for (let g = Math.ceil(C.artemis / STEP) * STEP; g < q16(C.marsVision) - 0.01; g += STEP) {
    const u = (g - C.artemis) / (C.marsVision - C.artemis), t = groove(g);
    S.at(t, () => I.snare(S, t, 0.05 + 0.14 * u * u, { pan: -0.1 }));
  }
  // act III: accelerating snare roll (16ths from 59, 32nds from 60) into the suck-back
  for (let t = 59.0; t < OST_END - 1e-6; t += t < 60 ? STEP : STEP / 2) {
    const u = (t - 59) / 1.42;
    S.at(t, () => I.snare(S, t, 0.06 + 0.2 * u, { pan: -0.1 }));
  }
  // open hats on every bar downbeat from 44
  pattern(44.0, OST_END, 'X...............', (t) => S.at(t, () => I.hat(S, t, 0.06, { open: true, pan: -0.3 })));
}

function lowBrass(S) {
  // two-bar crescendo swells from 24 (layer 2), then sforzando stabs in act III
  // (the moonshot's descent, landing and earthrise, and the frontier, have their own brass —
  // see moonshot, frontier)
  for (const [a, b, name] of HARMONY) {
    if (a < 24 || a >= F0 || (a >= 39.6 && a < M1)) continue;
    const u = ot(a);
    // (v11: each swell after the first takes over from the last one part-way up, and the last
    // one lets go more slowly — the section no longer drops a hole of 3–6 dB at every chord)
    const cont = a > 24 && !(a >= M1 && a < 43);
    S.at(a, () => O.brass(S, a, b - a, CHORDS[name].brass, { level: 0.2 + 0.16 * (u - 24) / 21, attack: Math.min(1.4, (b - a) * 0.7), release: 0.8, bright: 1400 + 1200 * (u - 24) / 21, from: cont ? 0.5 : 0 }));
  }
  for (const [a, b, name] of HARMONY) {
    if (a < F1 || a >= C.pullBack) continue;
    S.at(a, () => O.brass(S, a, b - a - 0.04, CHORDS[name].brass, { level: 0.5, sfz: true, release: 0.2, bright: 2400 }));
  }
}

function arps(S) {
  const shape = [0, 1, 2, 3, 2, 1, 2, 3];
  // (through the frontier they hold their level, stepping back for the genome's helix and
  // the rover)
  const fr = (t) => env(t, [[C.genome - 0.05, 1], [C.genome, 0.55], [C.webb, 0.55], [C.webb + 0.2, 0.9], [C.rover, 0.75], [C.artemis, 0.75], [C.artemis + 0.3, 1]]);
  pattern(44.0, OST_END, 'x'.repeat(16), (t, v, k) => {
    const tones = chordAt(t).choir.slice(0, 4).map((m) => m + 12);
    const u = (ft(t) - 44) / 10.5;
    S.at(t, () => I.synthPluck(S, t, tones[shape[k % 8] % tones.length], {
      level: (k % 4 === 0 ? 0.03 : 0.02) * (0.8 + 0.5 * u) * fr(t), pan: k % 2 ? 0.5 : -0.5, decay: 0.14, cutoff: 2200 + 2500 * u,
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
    [9.4, C.templeReveal, 0.05, 300, 6000, [41, 65]],
    [18.4, 20.0, 0.04, 300, 6000, [45, 62]],   // bridge into act II (lands on the ostinato)
    [26.5, 28.0, 0.035, 400, 6000, null],      // into layer 3 (train shots): a lift, no gap
    [30.5, 32.0, 0.035, 400, 6000, null],
    [34.5, 36.0, 0.045, 300, 7000, [45, 62]],
    [36.8, C.earthWide, 0.05, 300, 7000, null],
    [41.25, C.earthrise, 0.03, 400, 6000, [46, 70]],  // moonshot: the lift into the earthrise
    [42.0, C.calculator, 0.025, 500, 7000, null],     // … rebuilding into computing
    [44.0, C.processorDive, 0.08, 250, 8000, [45, 74]],
    [46.0, 49.5, 0.1, 200, 8000, [38, 69]],    // bridge into the frontier
    [C.artemis, C.marsVision, 0.05, 300, 7000, [48, 62]],  // Artemis: the lift into Mars
    [54.9, 55.5, 0.04, 500, 8000, null],       // … straight on into act III
    [56.0, OST_END, 0.16, 200, 9500, [38, 74]],  // the long climb into the peak
  ];
  for (const [a, b, level, from, to, pitch] of R) S.at(a, () => I.riser(S, a, b, { level, from, to, pitch }));
  // reverse cymbals into bar-line changes (they resolve ON the downbeat) and the moonshot's
  // two arrivals (a slow, soft one into the landing)
  for (const [t, d, l] of [[20.0, 1.0, 0.04], [24.0, 0.8, 0.035], [28.0, 1.0, 0.05], [32.0, 1.0, 0.05], [36.0, 1.0, 0.06],
    [C.moonLanding, 1.3, 0.03], [C.earthrise, 0.6, 0.04], [48.0, 1.0, 0.05],
    [C.hubble, 0.6, 0.025], [C.marsVision, 0.7, 0.05], [55.5, 0.55, 0.045]]) {
    S.at(t - d, () => I.revCymbal(S, t, d, { level: l }));
  }
  // SUCK-BACK (only before the two biggest hits): reverse swell, then 80 ms of silence
  S.at(OST_END - 1.12, () => I.swellIn(S, OST_END, 1.12, { level: 0.14 }));
}

function accents(S) {
  openingHits(S);
  hit(S, C.templeReveal, { power: 0.85, braam: 53, chord: 'F', down: true });   // BRAAM 1
  whooshHit(S, C.model3D, 0.7, -0.6);
  S.at(C.model3D, () => I.harpRoll(S, C.model3D, [57, 61, 64, 69, 73, 76], { level: 0.07 }));
  hit(S, 20.0, { power: 0.45 });                                                 // act II begins
  hit(S, C.gear, { power: 0.55 });
  hit(S, 28.0, { power: 0.6 });                                                  // layer 3, bar line (train)
  // (v11: the spark's own taiko went — it flammed 50 ms after the kit's 28.75 stroke; the spark's
  // crackle and arc carry it, and the chapter lands on 28.5 — see chapters)
  hit(S, 32.0, { power: 0.6 });
  hit(S, 36.0, { power: 0.7 });
  // the rocket lifts off (37.4): a low thump of ignition under the horns (a sub, on the cue)
  S.at(C.rocketLaunch, () => I.boom(S, C.rocketLaunch, { level: 0.26, f0: 60, f1: 30, decay: 2.0 }));
  hit(S, C.earthWide, { power: 1.0, braam: 41, chord: 'F', down: true });        // BRAAM 2
  hit(S, C.processorDive, { power: 0.95, down: true });
  const ps = q16(C.pageSphere); // 47.625: on the 16th (35 ms film after the cue) instead of 25 ms before the kit's
  S.at(ps, () => { I.taiko(S, ps, 0.4, { size: 0.6 }); I.crash(S, ps, 0.04); });
  hit(S, C.earthrise, { power: 0.72, chord: 'Bb' });                             // the noble lift
  hit(S, 49.5, { power: 0.9, chord: 'Dm' });                                     // the frontier
  hit(S, 55.5, { power: 1.0, chord: 'Dm' });                                     // ACT III
  hit(S, C.pullBack, { power: 1.3, braam: 50, chord: 'D', subHz: 95, ring: 0.8 }); // BRAAM 3: the peak (blooms, then dies away)
  S.at(C.pullBack, () => { I.taiko(S, C.pullBack + 0.02, 0.6, { size: 0.6 }); I.kick(S, C.pullBack, 0.9); });
  S.at(C.pullBack, () => O.brass(S, C.pullBack, 0.9, CHORDS.D.brass, { level: 0.6, sfz: true, bright: 2800, release: 0.5 }));
  // (v11: a longer release, so the chord hands over to the reprise's low D pedal (61.2) instead of
  // dropping out under the bloom at 61.4)
  S.at(C.pullBack, () => O.chord(S, 'strings', C.pullBack, C.pullBack + 0.9, CHORDS.D.str, { level: 0.55, attack: 0.03, release: 1.4, cutoff: 5500 }));
}

// Every chapter change lands on a downbeat (segment start, on the beat grid): a reverse cymbal
// breathes into it, a soft taiko, sub and cymbal land on it, and a glint marks the HUD flip an
// 8th later. (Chapters that open on a designed hit — 20.0, 49.5, 55.5 — or right after one —
// 38.5, after BRAAM 2 — have theirs already; 60.0 is the zoom through the A of STARS.)
const CHAPTERS = [
  // [segment start, power]  act I soft, act II fuller
  [7.5, 0.5], [12.0, 0.5], [15.5, 0.5], [24.5, 0.8], [28.5, 0.85], [31.5, 0.85], [34.5, 0.85], [42.5, 0.85], [46.5, 0.85],
];
function chapters(S) {
  for (const [b, p] of CHAPTERS) {
    const t = groove(b), hud = groove(b + BEAT / 2);
    S.at(t - 0.5, () => I.revCymbal(S, t, 0.5, { level: 0.03 * p }));
    S.at(t, () => {
      I.taiko(S, t, 0.38 * p, { size: p < 0.6 ? 0.6 : 1 });
      // (the sub only where no kit is playing: under the groove it would pump the master's glue)
      if (t < 20) I.boom(S, t, { level: 0.18 * p, f0: 72, f1: 34, decay: 1.1 });
      if (p >= 0.6) I.crash(S, t, 0.045 * p);
    });
    const glint = chordAt(hud).choir.at(-1) + 24;
    S.at(hud, () => I.bell(S, hud, glint, { level: 0.012, decay: 1.4, pan: 0.35, bus: 'far' }));
  }
  // montage → finale: the heading's A zooms toward us (60.0 – 60.5): a rush of air through the
  // letter that peaks into the suck-back, landing on the pullBack's D major
  // (lower and fuller than the climb's riser, so it reads as its own movement on top of it)
  S.at(59.95, () => I.whoosh(S, 59.95, 0.55, { level: 0.9, f0: 250, f1: 6000, pan0: -0.2, pan1: 0.2, peak: 0.8, kind: 'white' }));
  S.at(60.25, () => I.bell(S, 60.25, 93, { level: 0.012, decay: 1.2, pan: -0.3, bus: 'far' }));
}

// ------------------------------------------------------------------ the CODA (60.5 – 78.5)
//
//   60.5 pullBack    the D-major climax hit blooms (strings + choir into the long space) and
//                    dies away naturally — no cut to silence
//   61.5 earthReveal tender REPRISE of the theme: solo piano (+ a celesta shadow), a halo of
//                    high violins on A–D, a low D pedal; lots of air
//   62.5 – 67        it gathers: violas / cellos (Bb – F – Gm – D/F♯ – Gm – Asus4, the bass
//                    walking Bb F G F♯ G A), a distant choir from 63.25, soft horns from 64.5
//   67.0 ideasLine   a hushed breath: piano + choir on A sus4, the piano asks D — A …
//   69.6 sunrise     … the swell: Bb → C (♭VI – ♭VII) strings, horns, choir and low brass
//                    crescendo, tremolo, a rising timpani roll and cymbal swell; a short
//                    suck-back (70.92)
//   71.0 finalImpact … answered: the loudest moment of the film — sub, taiko ensemble, BRAAM,
//                    full orchestra + choir on D major, horns (+ trumpets, violins) singing
//                    the theme head D — A — D'; it rings into the long space
//   72.8 closingLine piano + celesta echo the head, pp, over the decaying chord
//   73 – 78          a peaceful D-major resolution (strings, "ooh" choir) fading out over a
//                    final soft low D (75.0); silence by ~78.3
//
// Studio A (orchestra) plays the reprise and the swell on the film buses (hall + stage) and
// falls silent at the suck-back; studio B plays the bloom, the timpani / cymbals, the final
// impact and the resolution on the finale buses (5 s space).

// Coda harmony: [start, end, violas/cellos/basses, choir, horns]
const CODA = [
  [62.5, 63.25, [34, 46, 53, 58, 62], [58, 62, 65], null],              // Bb
  [63.25, 64.0, [29, 41, 53, 57, 60], [57, 60, 65], null],              // F
  [64.0, 64.5, [31, 43, 50, 58, 62], [55, 58, 62], null],               // Gm
  [64.5, 65.25, [30, 42, 50, 57, 62], [57, 62, 66], [54, 57, 62]],      // D/F♯
  [65.25, 66.0, [31, 43, 50, 58, 62], [55, 58, 62, 67], [55, 58, 62]],  // Gm
  [66.0, 67.0, [33, 45, 52, 57, 62, 64], [57, 62, 64, 69], [57, 62, 64]], // A sus4
];
// the reprise melody (piano), a bar-and-a-bit slower than the gentle statement
const REPRISE = [[61.5, 62], [62.0, 69], [62.5, 74], [63.25, 72], [64.0, 70], [64.5, 69], [65.25, 67], [66.0, 69]];
// the piano's left hand: rolling chord tones under each harmony
const REPRISE_LH = [
  [61.5, 38, 1], [62.0, 45, 0.8],
  [62.5, 46, 1], [62.75, 53], [63.0, 58],
  [63.25, 41, 1], [63.5, 48], [63.75, 57],
  [64.0, 43, 1], [64.25, 50],
  [64.5, 42, 1], [64.75, 50], [65.0, 57],
  [65.25, 43, 1], [65.5, 50], [65.75, 58],
  [66.0, 45, 1], [66.25, 52], [66.5, 57], [66.75, 62],
];
const SUCK = C.finalImpact - 0.08; // the short suck-back before the button
// v11: the held breath and the sunrise sit on the 16th grid the pulse has been playing:
// the pulse's last stroke is 69.25, the cut falls exactly where the next 16th would be (69.375),
// and the light breaks two 16ths later (69.625, 35 ms film after the sunrise cue)
const HOLD = q16(C.sunrise - 0.25);   // 69.375
const SUN = q16(C.sunrise);           // 69.625
const D_MAJOR = [38, 50, 57, 62, 66, 69, 74];

// Studio A: reprise → gathering → hush → swell (film buses)
function coda(S) {
  // low D pedal (basses + a soft drone) under the reprise's first phrase
  S.at(61.2, () => {
    O.chord(S, 'strings', 61.2, 62.7, [26, 38], { level: 0.15, attack: 0.9, release: 0.7, cutoff: 650, dark: 0.6 });
    I.drone(S, 61.3, 62.6, 26, { level: 0.03, attack: 0.9, release: 0.9, beat: 0.2 });
  });
  // the halo: violins on A–D (a common tone of every chord of the reprise), sul tasto, growing
  S.at(61.35, () => O.chord(S, 'strings', 61.35, 67.0, [81, 86], { level: 0.085, attack: 1.2, release: 0.6, cutoff: 3400, dark: 0.55, swell: 0.45 }));
  // solo piano, a celesta shadow for the first phrase
  REPRISE.forEach(([t, m], i) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.15, pan: -0.08 });
    if (i < 5) I.celesta(S, t, m + 12, { level: 0.02, pan: 0.3 });
  }));
  REPRISE_LH.forEach(([t, m, accent]) => S.at(t, () => I.piano(S, t, m, { level: accent ? 0.085 * accent : 0.06, pan: -0.2 })));
  // violas / cellos from storyOne, growing; choir from 63.25; horns from storyTwo
  CODA.forEach(([a, b, str, choir, horns], k) => {
    const u = (a - 62.5) / 4;
    const t0 = k ? a - 0.08 : a;
    // violas / cellos first; the basses (the lowest note) join on storyTwo
    S.at(t0, () => O.chord(S, 'strings', t0, b, a < C.storyTwo ? str.slice(1) : str, {
      level: 0.13 + 0.15 * u, attack: k ? 0.3 : 0.7, release: k === CODA.length - 1 ? 0.8 : 0.45, cutoff: 1700 + 1600 * u, dark: 0.5,
    }));
    if (a >= 63.25) S.at(t0, () => O.chord(S, 'choirA', t0, b, choir, { level: 0.05 + 0.07 * u, attack: k === 1 ? 0.6 : 0.3, release: 0.5, cutoff: 3200, dark: 0.5, bus: 'choir' }));
    if (horns) S.at(t0, () => O.chord(S, 'horn', t0, b, horns, { level: 0.1 + 0.05 * u, attack: k === 3 ? 0.5 : 0.3, release: 0.5, cutoff: 1500, dark: 0.5, bus: 'horn' }));
  });

  // ideasLine: the hush — piano + choir on A sus4, a thread of violins and a soft low A
  const h0 = C.ideasLine, h1 = SUN + 0.1;
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
  [[68.2, 62], [68.7, 69]].forEach(([t, m]) => S.at(t, () => {
    I.piano(S, t, m, { level: 0.13, pan: -0.08 });
    I.celesta(S, t, m + 12, { level: 0.018, pan: 0.3 });
  }));

  // TENSION (v9): from storyTwo a low spiccato pulse on D / A drives under the reprise, pushing
  // from 8ths to 16ths through the hush; a high Bb harmonic rubs a semitone against the A sus4
  // and is left hanging — it becomes the root of the Bb chord at the sunrise (the release)
  // (HOLD: the held breath — the pulse stops a quarter-second before the light breaks)
  // (v11: the step now advances in the loop header — advanced inside the body, it moved the
  // time the notes' builders saw, so every stroke sounded a step late: the pulse began after
  // storyTwo and its last stroke fell on 69.375, INTO the held breath)
  for (let t = C.storyTwo, k = 0; t < HOLD - 1e-6; t += t < 68.5 ? STEP * 2 : STEP, k++) {
    const u = (t - C.storyTwo) / (HOLD - C.storyTwo);
    const m = k % 4 === 3 ? 45 : 38;
    S.at(t, () => O.spiccato(S, t, m, { level: 0.06 + 0.14 * u * u, decay: 0.11 }));
    S.at(t, () => O.spiccato(S, t, m - 12, { level: 0.03 + 0.06 * u * u, decay: 0.14 }));
  }
  S.at(C.ideasLine + 0.4, () => O.chord(S, 'strings', C.ideasLine + 0.4, SUN + 0.05, [82, 94], { level: 0.035, attack: 1.6, release: 0.1, cutoff: 5200, swell: 0.7 }));

  // sunrise: the swell, Bb → C, everything crescendo into the suck-back
  const s0 = SUN, s1 = 70.3;
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

  // TENSION (v9): a heartbeat (lub-dub on every beat) from storyTwo, a ticking clock on 8ths
  // from the D/F♯ bar, a slow low riser through the hush — all cut together a quarter-second
  // before the sunrise, a held breath before the release
  for (let t = C.storyTwo; t < HOLD - 1e-6; t += BEAT) {
    const u = (t - C.storyTwo) / (HOLD - C.storyTwo);
    S.at(t, () => {
      I.tom(S, t, 0.08 + 0.24 * u, { f: 52, bus: 'endDry' });
      I.tom(S, t + 0.16, 0.05 + 0.15 * u, { f: 47, bus: 'endDry' });
    });
  }
  for (let t = 65.0, k = 0; t < HOLD - 1e-6; t += t < 68.5 ? STEP * 2 : STEP, k++) {
    const u = (t - 65.0) / (HOLD - 65.0);
    S.at(t, () => X.click(S, t, { level: 0.02 + 0.045 * u, freq: k % 2 ? 2600 : 3400, body: 1100, decay: 0.012, pan: k % 2 ? 0.35 : -0.35, bus: 'endDry' }));
  }
  S.at(C.ideasLine, () => I.riser(S, C.ideasLine, HOLD, { level: 0.03, from: 120, to: 2400, bus: 'end' }));
  // (v11: a short intake of breath snaps off with the pulse on the 16th (69.375), so the held
  // breath opens as a clean, deliberate cut)
  S.at(HOLD - 0.5, () => I.swellIn(S, HOLD, 0.5, { level: 0.022, bus: 'end', top: 4500 }));

  // sunrise: a rising timpani roll on D and a cymbal swell into the suck-back
  const s0 = SUN;
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
  S.at(72.6, () => {
    O.chord(S, 'strings', 72.6, 75.8, [38, 50, 57, 62, 66, 69, 74, 78], { level: 0.17, attack: 1.2, release: 3.5, cutoff: 2600, dark: 0.5, bus: 'end' });
    O.chord(S, 'choirO', 72.8, 75.6, [57, 62, 66, 69], { level: 0.1, attack: 1.4, release: 3.2, cutoff: 3200, dark: 0.5, bus: 'end' });
  });
  // … over a final soft low D (piano, timpani, basses) and one last high glint
  S.at(74.4, () => O.chord(S, 'strings', 74.4, 75.8, [26], { level: 0.12, attack: 0.8, release: 2.4, cutoff: 500, dark: 0.6, bus: 'end' }));
  S.at(75.0, () => {
    I.piano(S, 75.0, 26, { level: 0.08, bus: 'end' });
    I.piano(S, 75.0, 38, { level: 0.1, bus: 'end' });
    I.tom(S, 75.0, 0.07, { f: 72, bus: 'end' });
    I.pluck(S, 75.03, 50, { level: 0.06, bus: 'end' });
    I.celesta(S, 75.05, 86, { level: 0.014, bus: 'end', pan: 0.25 });
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
  const ml = C.moonLanding - 0.03;   // (v11: with the landing, not 0.1 before it)
  S.at(ml, () => O.chord(S, 'strings', ml, 41.8, [86, 90, 93], { level: 0.06, attack: 0.12, release: 0.5, cutoff: 3800, dark: 0.7 }));
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
  for (const t of [40.0, 41.0].map(groove)) S.at(t, () => I.kick(S, t, 0.24));
  // soft low tom roll swelling into the landing
  // (it stops a beat short, so the landing arrives in a held breath of strings and choir)
  for (let g = 39.875; g < C.moonLanding - 0.2; g += STEP) {
    const u = (g - 39.875) / (C.moonLanding - 0.2 - 39.875), t = groove(g);
    S.at(t, () => I.tom(S, t, 0.03 + 0.07 * u * u, { f: 78, pan: Math.round(g / STEP) % 2 ? 0.25 : -0.25 }));
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
  for (let g = 42.0; g < 42.5 - 1e-6; g += STEP) {
    const u = (g - 42.0) / 0.5, t = groove(g);
    S.at(t, () => I.snare(S, t, 0.05 + 0.1 * u, { pan: 0.05 }));
  }
  [[42.25, 128], [42.375, 96]].forEach(([g, f]) => { const t = groove(g); S.at(t, () => I.tom(S, t, 0.16, { f, pan: f > 100 ? 0.4 : -0.4 })); });
}

// ------------------------------------------------------------------ the NEW FRONTIER
//
//   49.5 the act II build lands on the frontier (hit on D minor); the ostinato never stops
//   shuttle    horns in octaves (+ trumpets above) sing the theme D — A — D' over low brass
//   hubble     … D' held over B♭: a halo of "ooh" choir, high string harmonics, bells (awe)
//   genome     … C' B♭ over G minor; a pulsing synth "double helix" (rhythm studio)
//   webb       … A over F: a golden shimmer (Fmaj7 harmonics and bells)
//   rover      B♭ lydian, light: strings sul tasto, kit at half time, a harp arpeggio and
//              the theme head on celesta — a moment of wonder
//   artemis    C major: tremolo, low brass crescendo, snare roll, riser; horns G — A …
//   marsVision … D' on the heroic D-major swell (♭VI – ♭VII – I): brass, choir, strings,
//              harp; it hands straight on into act III (55.5), which climbs into the pullBack

// Orchestra studio: the brass theme, low brass, harmonics, the rover's harp and celesta,
// Artemis' build and the Mars swell.
function frontier(S) {
  S.at(FRONT_THEME[0][0], () => {
    O.line(S, 'horn', FRONT_THEME, { level: 0.44, cutoff: 3000, bus: 'horn', octaves: [0, -12], release: 0.6 });
    O.line(S, 'brass', FRONT_THEME, { level: 0.14, cutoff: 3400, bus: 'brass', octaves: [12], release: 0.4 });
  });
  // low brass: a swell under each chord of the statement
  for (const [a, b, name] of HARMONY) {
    if (a < F0 || a >= C.rover) continue;
    // (the last one, under Webb, dies away into the rover)
    S.at(a, () => O.brass(S, a, b - a, CHORDS[name].brass, { level: 0.34, attack: Math.min(0.5, (b - a) * 0.6), release: b === C.rover ? 0.8 : 0.6, bright: 2300, from: a > F0 ? 0.5 : 0 }));
  }
  // awe: high string harmonics over Hubble's deep field (B♭ add D) and Webb's gold (Fmaj7)
  S.at(C.hubble - 0.05, () => O.chord(S, 'strings', C.hubble - 0.05, C.genome + 0.15, [82, 86, 89], { level: 0.075, attack: 0.3, release: 0.4, cutoff: 3800, dark: 0.7 }));
  S.at(C.webb - 0.05, () => O.chord(S, 'strings', C.webb - 0.05, C.rover + 0.1, [81, 84, 88], { level: 0.075, attack: 0.3, release: 0.4, cutoff: 4000, dark: 0.7 }));
  [[C.hubble, 98], [C.hubble + 0.1, 93], [C.webb, 96], [C.webb + 0.1, 93]].forEach(([t, m]) => S.at(t, () => I.celesta(S, t, m, { level: 0.018, pan: 0.35 })));
  // the rover: a harp arpeggio up B♭ lydian, and the theme head on celesta (+ harp)
  [58, 62, 65, 69, 74, 76, 81].forEach((m, k) => {
    const t = C.rover + k * STEP * 0.75;
    S.at(t, () => I.pluck(S, t, m, { level: 0.085 - 0.004 * k, pan: -0.45 + k * 0.15 }));
  });
  [[C.rover + 0.15, 86], [C.rover + 0.4, 93], [C.rover + 0.65, 98]].forEach(([t, m], i) => S.at(t, () => {
    I.celesta(S, t, m, { level: 0.034, pan: 0.2 - 0.1 * i });
    I.pluck(S, t, m - 12, { level: 0.05, pan: 0.25 });
  }));
  S.at(C.rover + 0.55, () => I.celesta(S, C.rover + 0.55, 88, { level: 0.016, pan: 0.45 })); // the ♯11 glint
  // Artemis: tremolo and a low brass crescendo into the Mars vision; horns G — A — D'
  const ta = C.artemis, mv = C.marsVision;
  S.at(ta, () => {
    O.tremolo(S, ta, mv - 0.02, [72, 76, 79, 84], { level: 0.2, cutoff: 4500 });
    O.brass(S, ta, mv - ta - 0.03, CHORDS.C.brass, { level: 0.38, attack: 0.55, release: 0.08, bright: 2400 });
  });
  S.at(MARS_THEME[0][0], () => {
    O.line(S, 'horn', MARS_THEME, { level: 0.48, cutoff: 3200, bus: 'horn', octaves: [0, -12], release: 0.35 });
    O.line(S, 'brass', MARS_THEME, { level: 0.18, cutoff: 3600, bus: 'brass', octaves: [12], release: 0.3 });
  });
  // Mars: the heroic D-major swell (brass + horns), held right up to act III's downbeat and
  // released under its hit (v11: no gap — the D and A carry straight into D minor)
  S.at(mv, () => {
    O.brass(S, mv, F1 - mv, CHORDS.D.brass, { level: 0.46, attack: 0.07, release: 0.3, bright: 2700 });
    O.brass(S, mv, F1 - mv, [57, 62, 66], { kind: 'horn', level: 0.26, attack: 0.15, release: 0.25, bright: 2200, bus: 'horn' });
    I.celesta(S, mv + 0.02, 90, { level: 0.02, pan: 0.3 });
  });
}

// Rhythm studio: the shuttle's low bloom, bells for the telescopes, the genome's synth
// helix, and the percussion bloom of the Mars vision.
function frontierRhythm(S) {
  // (v11: the musical accents of the frontier sit on the 16ths nearest their cues, with the theme)
  const sh = q16(C.shuttle), ro = q16(C.rover);
  S.at(sh, () => I.boom(S, sh, { level: 0.2, f0: 62, f1: 30, decay: 2.2 }));
  // telescopes: glassy bell cascades (deep field: B♭ add9; Webb: Fmaj7, golden)
  [[C.hubble, [86, 89, 93, 94, 98, 101]], [C.webb, [81, 84, 88, 89, 93, 96]]].forEach(([t0, notes]) => notes.forEach((m, i) => {
    const t = t0 + 0.03 + i * 0.055;
    S.at(t, () => I.bell(S, t, m, { level: 0.016, decay: 2.4, pan: -0.6 + i * 0.24 }));
  }));
  // rover: a soft low bloom and a light taiko stroke — the kit goes half time
  S.at(ro, () => {
    I.boom(S, ro, { level: 0.14, f0: 58, f1: 34, decay: 1.8 });
    I.taiko(S, ro, 0.3, { size: 0.6 });
  });
  // genome: two synth strands on 16ths, panned around each other (a double helix), the
  // filter opening with each turn; they fade under Webb
  const g0 = C.genome, g1 = C.webb + 0.45;
  for (let k = 0, t = Math.ceil(g0 / STEP - 1e-6) * STEP; t < g1; t += STEP, k++) {
    const tones = chordAt(t).choir;
    const turn = Math.sin((2 * Math.PI * k) / 8);
    const lv = 0.034 * env(t, [[g0, 1], [C.webb, 0.85], [g1, 0.2]]);
    const cut = 1800 + 1800 * Math.abs(turn);
    S.at(t, () => {
      I.synthPluck(S, t, tones[k % tones.length] + 12, { level: lv, decay: 0.12, cutoff: cut, pan: 0.6 * turn });
      I.synthPluck(S, t + STEP / 2, tones[(k + 2) % tones.length] + 24, { level: lv * 0.6, decay: 0.08, cutoff: cut * 1.2, pan: -0.6 * turn });
    });
  }
  // Mars: the swell blooms — a soft sub, the taiko ensemble, a cymbal, the harp up D major
  const mv = C.marsVision;
  S.at(mv, () => {
    I.boom(S, mv, { level: 0.42, f0: 75, f1: 34, decay: 2.2 });
    I.taiko(S, mv, 0.55, { size: 1 });
    I.crash(S, mv, 0.06);
    I.harpRoll(S, mv, [50, 57, 62, 66, 69, 74, 78, 81], { level: 0.075 });
  });
}

// Pads step aside for the big hits (sidechain-style), then recover.
function duckPads(S) {
  const big = [[C.ignition, 0.55], [C.titleLocked, 0.5], [C.templeReveal, 0.5], [C.model3D, 0.65], [C.earthWide, 0.55], [C.earthrise, 0.75], [C.processorDive, 0.55], [49.5, 0.6], [55.5, 0.6], [C.pullBack, 0.5]];
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
  // the frontier (appended)
  [57, 70, 72].forEach((m) => pairs.push(['horn', m]));
  [79, 81, 82, 84].forEach((m) => pairs.push(['brass', m]));
  [82, 84, 89].forEach((m) => pairs.push(['strings', m]));
  [60, 65, 70].forEach((m) => pairs.push(['choirO', m]));
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
 *                 moonshot's and the frontier's orchestra, the coda's reprise and swell
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
    frontier(S);
    actOne(S);
    coda(S);
  }
  if (rest) {
    pulse(S);
    rhythm(S, []);
    moonshotRhythm(S);
    frontierRhythm(S);
    arps(S);
    transitions(S);
    accents(S);
    chapters(S);
    codaFinale(S);
  }
  duckPads(S);
  return { kicks: kickTimes(), suckBacks: [OST_END, C.finalImpact - 0.08] };
}
