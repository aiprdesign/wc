// THE INDIAN FILM'S SCORE: the trailer score's architecture (src/audio/music.js — its harmony, its
// theme D — A — D' — C' B♭ — A — G — A, its acts and hits, pinned to this film's picture through
// MUSIC_CUES) carries an Indian layer, written here, and this film's own sound design.
//
// The theme sits in D minor, which is raga Asavari's scale on Sa = D (D E F G A B♭ C): so the sitar
// can sing the theme with meend (glides) and the bansuri can answer it, and the orchestra's chords
// stay true under them; the major lifts (the wheel of dharma, the pullBack) turn to Bilawal.
//
//   tanpura   the drone from the ignition to the end (Pa · Sa · Sa · low Sa)
//   sitar     an alap phrase out of the point of light, a stroke on the SLAM, the theme's fragment
//             under the title, the gentle statement over the scholar's palm leaves, a jhala (melody
//             strokes against the chikari's drone strokes) driving act II, the theme with the brass
//             over ISRO and the epic climax, a last meend on the final button
//   bansuri   the Indus dawn, the cosmos, the temples, the hush before the wheel of dharma and its
//             lift, and the tender reprise
//   santoor   ripples: the ignition, the Great Bath's water, the scripts, the digits of zero and their
//             journey west, the routes from Nalanda, the chess moves, the closing line
//   ghanta    temple bells at Sanchi and Ellora, on the wheel, the ideas line and the final button
//   tabla     the SLAM's dha; keherwa through act I; teentaal through act II, doubling its speed as
//             the score builds; a hush for the moonshot's place (Ashoka → Gandhi); tihais (a phrase
//             played three times, landing on the beat) into act II, into ISRO, into the south pole
//             and onto the pullBack
//
// Every time here is STORY time (the Studio's time map plays it on the film clock).

// the music plays on the score's own clock (MUSIC_CUES: this film's beats mapped onto it), the sound design
// on the film's (CUES): see MUSIC_SPLICES in src/films/india.js
import { MUSIC_CUES as C, MUSIC_CUES as M, MUSIC_DURATION as DURATION, CUES as CN } from '../../timeline.js';
import { groove, chordAt, STEP } from '../music.js';
import * as I from '../instruments.js';
import * as X from '../sfx.js';
import { sitar, tanpura, tabla, warmTabla, bansuri, santoor, santoorRun, ghanta, chik, SA, ASAVARI, BILAWAL } from './instruments.js';

const q16 = (t) => Math.round(t / STEP) * STEP;
const onGrid = (t) => Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6;
const gT = (t) => (onGrid(t) ? groove(t) : t);
/** Piecewise-linear envelope through [time, value] points (held beyond the ends). */
const env = (t, pts) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) { const [t1, v1] = pts[i]; if (t <= t1) { const [t0, v0] = pts[i - 1]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); } }
  return pts.at(-1)[1];
};
// the root of the chord sounding at t, as a sitar note between A2 and G#3
const sitarRoot = (t) => { const r = chordAt(t).root % 12; let m = 48 + r; if (m > 56) m -= 12; return m; };

// ================================================================== melody (studio A)

function drone(S) {
  // the tanpura through the film (it stops with the film bus before the final button) …
  S.at(C.ignition, () => tanpura(S, C.ignition, C.finalImpact - 0.09, { level: 0.085, attack: 2.5, release: 0.05 }));
  // … and again in the coda's long space, from the pullBack to the end
  S.at(C.pullBack + 0.3, () => tanpura(S, C.pullBack + 0.3, DURATION - 0.2, { level: 0.07, attack: 2.0, release: 4.0, bus: 'indiaEnd' }));
}

function sitarLines(S) {
  const play = (t, notes, o) => S.at(t, () => sitar(S, t, notes, o));
  // out of the point of light: a low alap, Sa — ga — re — Sa
  play(C.pointAppears, [[0, 50, 'p'], [0.35, 53, 'm'], [0.75, 52, 'm'], [1.05, 50, 'm']], { level: 0.36, pan: -0.15, glide: 0.22, ring: 2.0, chikari: 0.2 });
  // the SLAM: Sa struck with the drone strings
  play(C.titleLocked, [[0, 62, 'p'], [0.25, 62, 'k']], { level: 0.26, pan: 0.05, ring: 2.5 });
  // the theme's fragment under the title (with the piano): D — A — D' … C' (meend down)
  play(6.0, [[0, 62, 'p'], [0.45, 67, 'p'], [0.5, 69, 'm'], [1.0, 74, 'p'], [1.5, 74, 'k'], [2.0, 72, 'm'], [2.7, 70, 'm'], [3.0, 72, 'm']], { level: 0.22, pan: 0.1, glide: 0.2, ring: 2.4 });
  // the gentle statement over the palm leaves (with piano and celesta)
  play(12.0, [[0, 62, 'p'], [0.95, 67, 'p'], [1.0, 69, 'm'], [2.0, 74, 'p'], [2.75, 74, 'k'], [3.5, 72, 'm'], [4.0, 70, 'm'], [5.0, 69, 'p'], [5.5, 67, 'm'], [6.0, 69, 'm']], { level: 0.2, pan: -0.1, glide: 0.24, ring: 2.6 });
  // ACT II — the jhala: a melody stroke on the chord's root, then the drone strings, 16th by 16th
  const jhala = (from, to, lv, pat) => {
    for (let k = Math.ceil(from / STEP - 1e-6); k * STEP < to - 1e-6; k++) {
      const g = k * STEP, t = groove(g), ch = pat[k % pat.length];
      const l = lv(g);
      if (l <= 0.001 || ch === '.') continue;
      if (ch === 'M') S.at(t, () => sitar(S, t, [[0, sitarRoot(t), 'p']], { level: 0.15 * l, pan: -0.05, ring: 0.7, chikari: 0, taraf: 0.25 }));
      else if (ch === 'U') S.at(t, () => sitar(S, t, [[0, sitarRoot(t) + 12, 'p']], { level: 0.12 * l, pan: -0.05, ring: 0.6, chikari: 0, taraf: 0.2 }));
      else S.at(t, () => chik(S, t, { level: (ch === 'c' ? 0.07 : 0.05) * l, pan: 0.15 }));
    }
  };
  const ACT2 = (g) => env(g, [[24.5, 0.55], [28, 0.75], [32, 0.9], [36, 1], [38.3, 1], [38.5, 0]]) ;
  jhala(24.5, 38.5, ACT2, 'Mcccccccccccdccc');
  jhala(32, 38.5, ACT2, '........M.......');
  // the dharma chapter: the drive returns with the spinning wheel
  jhala(41.25, 49.5, (g) => env(g, [[41.25, 0.4], [42.5, 0.8], [46, 1], [49.4, 1], [49.5, 0]]), 'McccMcccMcccMcUc');
  // ISRO: the theme with the brass, and the Mars-orbit's / south pole's close
  play(q16(M.shuttle), [[0, 62, 'p'], [50.25 - q16(M.shuttle), 69, 'p'], [q16(M.hubble) - q16(M.shuttle), 74, 'p'], [M.genome - q16(M.shuttle), 72, 'm'], [51.875 - q16(M.shuttle), 70, 'm'], [q16(M.webb) - q16(M.shuttle), 69, 'p']], { level: 0.22, pan: 0.1, glide: 0.16, ring: 2.2 });
  jhala(49.5, 55.5, (g) => env(g, [[49.5, 0.55], [M.rover - 0.05, 0.6], [M.rover, 0.15], [M.artemis - 0.05, 0.15], [M.artemis, 0.7], [55.4, 1], [55.5, 0]]), 'McccMcccMcccMccc');
  play(gT(q16(M.artemis)), [[0, 67, 'p'], [gT(54.25) - gT(q16(M.artemis)), 69, 'p'], [M.marsVision - gT(q16(M.artemis)), 74, 'p']], { level: 0.24, pan: 0.1, ring: 1.6 });
  // ACT III: the epic statement, the jhala at full tilt
  play(55.5, [[0, 62, 'p'], [0.5, 69, 'p'], [1.5, 74, 'p'], [2.5, 72, 'p'], [3.0, 70, 'm'], [3.5, 69, 'p'], [4.0, 67, 'm'], [4.5, 69, 'p']], { level: 0.4, pan: 0.1, glide: 0.14, ring: 1.2 });
  jhala(55.5, 60.4, (g) => env(g, [[55.5, 0.8], [58, 1], [60.4, 1.1]]), 'McMcMcMcMcMcMcMU');
  // the final button: a last meend from Pa up to Sa, ringing into the space
  play(C.finalImpact + 0.05, [[0, 57, 'p'], [0.6, 62, 'm'], [1.6, 62, 'k']], { level: 0.2, pan: 0, glide: 0.5, ring: 4, bus: 'indiaEnd' });
}

function bansuriLines(S) {
  const play = (t, notes, dur, o) => S.at(t - 0.05, () => bansuri(S, t, notes, dur, o));
  // the Indus dawn
  play(8.0, [[0, 74], [0.5, 72], [0.75, 74], [1.25, 77], [1.75, 76], [2.0, 74], [2.75, 72], [3.0, 70], [3.5, 69]], 3.95, { level: 0.05, pan: 0.25 });
  // the cosmos (act II opens): floating down from A
  play(20.3, [[0, 81], [0.5, 79], [1.0, 77], [1.5, 76], [1.75, 74]], 2.3, { level: 0.04, pan: -0.25, bus: 'indiaFar' });
  // the temples
  play(32.0, [[0, 79], [0.5, 77], [1.0, 74], [1.5, 70], [2.0, 74]], 2.6, { level: 0.045, pan: 0.2 });
  // the hush before the wheel (over the moonshot's iv / D pedal) …
  play(38.8, [[0, 74], [0.4, 72], [0.8, 70], [1.2, 69], [1.6, 67], [2.0, 70], [2.4, 69]], 2.8, { level: 0.055, pan: -0.15 });
  // … and the wheel of dharma: the major lift (Bilawal's F♯)
  play(M.moonLanding + 0.05, [[0, 74], [0.3, 78], [0.7, 76], [1.0, 74]], 1.4, { level: 0.05, pan: 0.15, bus: 'indiaFar' });
  // the tender reprise with the piano, in the coda's space
  const REPRISE = [[61.5, 74], [62.0, 81], [62.5, 86], [63.25, 84], [64.0, 82], [64.5, 81], [65.25, 79], [66.0, 81]];
  play(61.5, REPRISE.map(([t, m]) => [t - 61.5, m]), 5.2, { level: 0.035, pan: 0.3, bus: 'indiaEnd', vibrato: 0.016 });
}

function santoorLines(S) {
  S.at(C.ignition, () => santoorRun(S, C.ignition + 0.02, 62, 86, 0.35, { level: 0.035, bus: 'indiaFar' }));
  S.at(C.greatBath, () => santoorRun(S, C.greatBath, 86, 62, 0.6, { level: 0.045, pan: 0.1 }));
  S.at(C.scripts, () => santoorRun(S, C.scripts, 62, 81, 0.5, { level: 0.04, pan: -0.1 }));
  // zero: one note per place-value step, from the chord's tones (the digits clicking into place)
  for (let g = q16(C.placeValue); g < 19.0 - 1e-6; g += 0.25) {
    const t = groove(g), tones = chordAt(t).choir;
    const m = tones[Math.floor((g * 4) % tones.length)] + 12;
    S.at(t, () => santoor(S, t, m, { level: 0.035, pan: ((g * 8) % 2) - 0.5, bus: 'india' }));
  }
  S.at(C.dotZero, () => santoor(S, C.dotZero, 86, { level: 0.05, pan: 0 }));
  // … and the digits' journey west
  S.at(C.numeralsTravel, () => santoorRun(S, C.numeralsTravel, 69, 93, 0.8, { level: 0.04, pan: -0.4 }));
  S.at(C.samratShadow, () => santoorRun(S, C.samratShadow, 86, 69, 0.7, { level: 0.03, pan: 0.2, bus: 'indiaFar' }));
  S.at(C.asiaRoutes, () => santoorRun(S, C.asiaRoutes, 74, 93, 0.5, { level: 0.035, pan: 0.3 }));
  // chess: the pieces' moves, a little climb on each
  for (const [k, t] of [C.chess, C.chess + 0.25, C.chess + 0.5].entries()) S.at(t, () => santoor(S, t, [74, 77, 81][k], { level: 0.04, pan: -0.3 + 0.3 * k }));
  S.at(C.mStars, () => santoorRun(S, C.mStars, 74, 98, 0.45, { level: 0.03, bus: 'indiaFar' }));
  S.at(C.closingLine, () => santoorRun(S, C.closingLine + 0.05, 74, 93, 0.9, { level: 0.022, bus: 'indiaEnd', scale: BILAWAL }));
}

function bells(S) {
  S.at(C.stupa, () => ghanta(S, C.stupa, 57, { level: 0.05, pan: -0.25 }));
  S.at(C.kailasa, () => ghanta(S, C.kailasa, 45, { level: 0.06, pan: 0.2, decay: 6 }));
  S.at(C.brihadeeswarar, () => ghanta(S, C.brihadeeswarar, 52, { level: 0.04, pan: -0.1 }));
  S.at(M.moonLanding, () => ghanta(S, M.moonLanding, 62, { level: 0.05, pan: 0.15 }));
  S.at(C.ideasLine, () => ghanta(S, C.ideasLine, 57, { level: 0.012, bus: 'indiaEnd', decay: 6 }));
  S.at(C.finalImpact, () => ghanta(S, C.finalImpact, 45, { level: 0.05, bus: 'indiaEnd', decay: 7 }));
}

// ================================================================== rhythm (studio B)

/** Play bols on a grid from t0 (grid time; '-' rests). */
function bols(S, g0, list, step, level, bus = 'indiaPerc') {
  list.forEach((b, i) => {
    if (b === '-') return;
    const g = g0 + i * step, t = onGrid(g) ? groove(g) : g;
    S.at(t, () => tabla(S, t, b, { level: typeof level === 'function' ? level(g) : level, bus }));
  });
}

/** A tihai: phrase P three times (with a gap between) so that P's last stroke lands on `target`. */
function tihai(S, target, P, gap, step, level, bus) {
  const len = P.length - 1 + gap;   // steps from one P's last stroke to the next one's
  for (let r = 0; r < 3; r++) {
    const end = target - (2 - r) * (len + 1) * step;
    bols(S, end - (P.length - 1) * step, P, step, level, bus);
  }
}

const KEHERWA = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhi', 'na'];
const TEENTAAL = ['dha', 'dhin', 'dhin', 'dha', 'dha', 'dhin', 'dhin', 'dha', 'dha', 'tin', 'tin', 'ta', 'ta', 'dhin', 'dhin', 'dha'];

function tablaPart(S) {
  warmTabla(S);
  // the SLAM
  bols(S, C.titleLocked, ['dha'], STEP, 0.42);
  // into the Indus (bar 8.0): a tihai of 'tirakita dha'
  tihai(S, 8.0, ['ti', 're', 'ki', 'te', 'dha'], 1, STEP, 0.22);
  // act I: keherwa, 8ths (one cycle per bar), quietly
  const k1 = (g) => env(g, [[8, 0.16], [12, 0.13], [15.5, 0.17], [19, 0.2]]);
  for (let g = 8.0; g < 19.0 - 1e-6; g += 2) bols(S, g + (g === 8.0 ? 0.25 : 0), g === 8.0 ? KEHERWA.slice(1) : KEHERWA, 0.25, k1);
  // zero: 16th te-te fills on the last beat of each bar
  for (let g = 16.0; g < 19.0 - 1e-6; g += 2) bols(S, g + 1.5, ['te', 're', 'ki', 'te'], STEP, 0.12);
  // into act II (20.0): a tihai
  tihai(S, 20.0, ['dha', 'ti', 're', 'ki', 'te', 'dha'], 2, STEP, 0.26);
  // act II: teentaal (16 matras, an 8th each = two bars) …
  const lv = (g) => env(g, [[20, 0.18], [24, 0.22], [28, 0.26], [32, 0.28], [38.3, 0.3]]);
  for (let g = 20.0; g < 32.0 - 1e-6; g += 4) bols(S, g + (g === 20.0 ? 0.25 : 0), g === 20.0 ? TEENTAAL.slice(1) : TEENTAAL, 0.25, lv);
  // … with tirakita fills from 28 …
  for (let g = 28.0; g < 32.0 - 1e-6; g += 4) bols(S, g + 3.5, ['ti', 're', 'ki', 'te'], STEP, 0.16);
  // … then dugun (double speed) from 32 to the moonshot's place
  for (let g = 32.0; g < 38.0 - 1e-6; g += 2) bols(S, g, TEENTAAL, STEP, lv);
  bols(S, 38.0, ['dha', 'ti', 're', 'ki', 'te', 'dha', '-', '-'], STEP, 0.24);
  // the dharma chapter: Ashoka's lion capital, then silence under the hush …
  bols(S, C.lionCapital, ['dha'], STEP, 0.18);
  // … the wheel turns (D major): one deep dha, then the spinning wheel brings the theka back
  S.at(M.moonLanding, () => tabla(S, M.moonLanding, 'dha', { level: 0.3 }));
  const lv2 = (g) => env(g, [[41.25, 0.12], [42.5, 0.22], [46, 0.28], [49.4, 0.3]]);
  for (let g = 41.25; g < 42.5 - 1e-6; g += 0.25) bols(S, g, [['tin', 'na', 'tin', 'na'][Math.round(g * 4) % 4]], 0.25, lv2);
  for (let g = 42.5; g < 48.5 - 1e-6; g += 2) bols(S, g, TEENTAAL, STEP, lv2);
  // into ISRO's first rocket: a tihai landing on the 16th of the launch
  tihai(S, q16(M.shuttle), ['dha', 'ti', 're', 'ki', 'te', 'dha'], 1, STEP, 0.3);
  // ISRO: dugun theka, thinning for the Mars orbit, building for the south pole
  const lv3 = (g) => env(g, [[50.5, 0.24], [M.rover - 0.1, 0.26], [M.rover, 0.1], [M.artemis - 0.1, 0.1], [M.artemis, 0.26], [54.5, 0.32]]);
  for (let g = 50.5; g < 53.5 - 1e-6; g += 2) bols(S, g, TEENTAAL, STEP, lv3);
  tihai(S, q16(M.marsVision), ['ti', 're', 'ki', 'te', 'dha'], 0, STEP, 0.3);
  // ACT III: a rela (rolling 16ths), then 32nds, then the tihai onto the pullBack
  const RELA = ['dha', 'ti', 're', 'ki', 'te', 'ta', 'ke', 'ti', 're', 'ki', 'te', 'dha', 'ti', 're', 'ki', 'te'];
  const lv4 = (g) => env(g, [[55.5, 0.24], [58, 0.3], [59.5, 0.34]]);
  for (let g = 55.5; g < 58.0 - 1e-6; g += 2) bols(S, g, RELA, STEP, lv4);
  for (let g = 58.0; g < 59.25 - 1e-6; g += 0.5) bols(S, g, ['ti', 're', 'ki', 'te', 'ti', 're', 'ki', 'te'], STEP / 2, lv4);
  tihai(S, C.pullBack, ['ti', 're', 'ki', 'ta', 'dha'], 1, STEP, 0.36);
  // the final button
  S.at(C.finalImpact, () => tabla(S, C.finalImpact, 'dha', { level: 0.75, bus: 'endDry' }));
}

export function arrangeIndia(S, part) {
  if (part === 'melody') { drone(S); sitarLines(S); bansuriLines(S); santoorLines(S); bells(S); }
  if (part === 'rhythm') tablaPart(S);
}

// ================================================================== sound design (studio B)
// The Indian film's chapters (the shared opening, montage and finale sounds live in ../cues.js).

function indus(S) {
  S.at(CN.indusDust - 0.3, () => X.air(S, CN.indusDust - 0.3, CN.indusGrid + 0.6, { level: 0.03, freq: 1400, attack: 0.6, release: 0.8, bus: 'sfx' }));
  // the city rises: brick by brick
  for (let k = 0; k < 6; k++) { const t = CN.indusDust + 0.12 + k * 0.11; S.at(t, () => X.thud(S, t, { level: 0.07 + 0.01 * k, f: 70 + 6 * k, tone: 1100, decay: 0.22, pan: (k % 2 ? 0.3 : -0.3) })); }
  S.at(CN.indusGrid, () => X.pencil(S, CN.indusGrid, CN.indusGrid + 0.7, { level: 0.03, pan: 0.1, vigor: 1.2 }));
  // the drains: water running under the streets
  S.at(CN.indusDrains, () => X.air(S, CN.indusDrains, CN.greatBath + 0.4, { level: 0.022, freq: 900, q: 1.4, attack: 0.25, release: 0.4, bus: 'sfx', drift: 1.2 }));
  // the Great Bath fills
  S.at(CN.greatBath, () => X.air(S, CN.greatBath, CN.indusWeights, { level: 0.03, freq: 600, q: 0.9, attack: 0.3, release: 0.4, bus: 'sfx', drift: 0.8 }));
  // the weights: stone on stone, each a little larger (a little lower)
  for (let k = 0; k < 7; k++) { const t = CN.indusWeights + k * 0.09; S.at(t, () => I.stoneTap(S, t, { level: 0.12, pan: -0.45 + k * 0.15, f0: 900 - k * 70 })); }
}

function language(S) {
  S.at(CN.palmLeaf, () => X.paperSwish(S, CN.palmLeaf, 0.5, { level: 0.07, pan0: -0.4, pan1: 0.4 }));
  S.at(CN.palmLeaf + 0.2, () => X.crinkle(S, CN.palmLeaf + 0.2, 0.5, { level: 0.04, pan: 0.2 }));
  S.at(CN.sutras, () => X.pencil(S, CN.sutras, CN.grammarTree - 0.05, { level: 0.04, pan: -0.15, vigor: 1.5 }));
  // the rules branch: glints climbing the tree
  [0, 0.12, 0.24, 0.36, 0.5].forEach((d, i) => S.at(CN.grammarTree + d, () => I.bell(S, CN.grammarTree + d, [81, 84, 86, 88, 93][i], { level: 0.015, pan: -0.4 + i * 0.2, bus: 'far', decay: 1.4 })));
  S.at(CN.scripts - 0.15, () => I.whoosh(S, CN.scripts - 0.15, 0.6, { level: 0.04, f0: 500, f1: 4000, pan0: -0.5, pan1: 0.5, peak: 0.3 }));
}

function zero(S) {
  S.at(CN.dotZero, () => I.bell(S, CN.dotZero, 98, { level: 0.02, decay: 2.5, bus: 'far' }));
  for (let k = 0; k < 6; k++) { const t = CN.placeValue + k * 0.125; S.at(t, () => X.click(S, t, { level: 0.04, freq: 3000, body: 1200, decay: 0.02, pan: -0.5 + k * 0.2 })); }
  S.at(CN.brahmagupta, () => I.bell(S, CN.brahmagupta, 86, { level: 0.018, pan: 0.2, decay: 2 }));
  S.at(CN.numeralsTravel - 0.1, () => I.whoosh(S, CN.numeralsTravel - 0.1, 0.9, { level: 0.05, f0: 300, f1: 5000, pan0: 0.6, pan1: -0.6, peak: 0.5 }));
  S.at(CN.zeroRing - 0.3, () => I.swellIn(S, CN.zeroRing + 0.3, 0.6, { level: 0.04 }));
}

function astronomy(S) {
  S.at(CN.aryabhata, () => X.air(S, CN.aryabhata, CN.piDigits, { level: 0.025, freq: 500, q: 0.8, attack: 0.5, release: 0.5, bus: 'sfx', drift: 0.3 }));
  S.at(CN.piDigits, () => [86, 91, 93].forEach((m, i) => I.bell(S, CN.piDigits + i * 0.06, m, { level: 0.014, pan: -0.3 + i * 0.3, bus: 'far' })));
  for (let k = 0; k < 8; k++) { const t = CN.sineTable + k * 0.1; S.at(t, () => X.click(S, t, { level: 0.03, freq: 2200 + k * 150, body: 900, decay: 0.015, pan: 0.4 - k * 0.1 })); }
  S.at(CN.jantarMantar, () => X.stoneGrind(S, CN.jantarMantar, CN.jantarMantar + 0.8, { level: 0.1, grow: true }));
  S.at(CN.samratShadow, () => I.whoosh(S, CN.samratShadow, 0.8, { level: 0.03, f0: 200, f1: 1200, pan0: -0.6, pan1: 0.6, peak: 0.5 }));
}

function metallurgy(S) {
  // the furnace roars, the bellows breathe on the beat
  S.at(CN.forge - 0.2, () => X.distantRoar(S, CN.forge - 0.2, CN.wootzPattern, { level: 0.06, attack: 0.3, release: 0.5 }));
  for (let k = 0; k < 4; k++) { const t = groove(25.0 + k * 0.5); S.at(t, () => X.thud(S, t, { level: 0.06, f: 55, tone: 500, decay: 0.3 })); }
  S.at(CN.crucible, () => X.sparks(S, CN.crucible, 0.7, { level: 0.06, bursts: 1.2 }));
  // the blade: a long steel shing
  S.at(CN.wootzPattern, () => { I.metal(S, CN.wootzPattern, 1320, { level: 0.04, decay: 1.4, pan: 0.2 }); I.whoosh(S, CN.wootzPattern, 0.5, { level: 0.04, f0: 2500, f1: 9000, pan0: -0.4, pan1: 0.5, peak: 0.3, kind: 'white' }); });
  // the Iron Pillar: a deep, dark ring
  S.at(CN.ironPillar, () => I.metal(S, CN.ironPillar, 98, { level: 0.08, decay: 2.2, pan: -0.1 }));
  // zinc: drops condensing below the retort
  [0, 0.17, 0.29, 0.45].forEach((d, i) => S.at(CN.zinc + d, () => I.bell(S, CN.zinc + d, [93, 91, 95, 90][i], { level: 0.012, decay: 0.6, pan: 0.2 - i * 0.1 })));
}

function surgery(S) {
  for (let k = 0; k < 3; k++) { const t = CN.herbs + k * 0.22; S.at(t, () => I.stoneTap(S, t, { level: 0.09, pan: -0.2, f0: 420 })); }
  // the instruments fan out: steel tings
  for (let k = 0; k < 7; k++) { const t = CN.instruments + k * 0.06; S.at(t, () => I.metal(S, t, 1700 + k * 130, { level: 0.022, decay: 0.5, pan: -0.6 + k * 0.2 })); }
  S.at(CN.rhinoplasty, () => I.bell(S, CN.rhinoplasty, 88, { level: 0.016, pan: 0.2 }));
  for (let k = 0; k < 4; k++) { const t = CN.surgeryHud + k * 0.08; S.at(t, () => X.click(S, t, { level: 0.03, freq: 3400, body: 1500, decay: 0.012, pan: 0.3 })); }
}

function temples(S) {
  S.at(CN.stupa - 0.2, () => X.stoneGrind(S, CN.stupa - 0.2, CN.stupa + 0.5, { level: 0.08, grow: true }));
  // Kailasa: carved down from the rock — chisels
  for (let k = 0; k < 8; k++) { const t = CN.kailasa + k * 0.07; S.at(t, () => I.stoneTap(S, t, { level: 0.07, pan: -0.5 + (k % 4) * 0.33, f0: 1100 + (k % 3) * 160 })); }
  S.at(CN.taj, () => X.air(S, CN.taj, CN.taj + 0.9, { level: 0.02, freq: 5000, attack: 0.3, release: 0.5, bus: 'sfx' }));
}

function nalanda(S) {
  for (let k = 0; k < 5; k++) { const t = CN.nalandaBricks + k * 0.13; S.at(t, () => X.thud(S, t, { level: 0.06, f: 80 + k * 5, tone: 1200, decay: 0.2, pan: -0.4 + k * 0.2 })); }
  S.at(CN.nalandaRise, () => X.stoneGrind(S, CN.nalandaRise, CN.nalandaRise + 0.6, { level: 0.06, grow: true }));
  S.at(CN.library, () => X.paperSwish(S, CN.library, 0.4, { level: 0.05, pan0: 0.3, pan1: -0.3 }));
  [0, 0.15, 0.3].forEach((d, i) => S.at(CN.asiaRoutes + d, () => I.whoosh(S, CN.asiaRoutes + d, 0.5, { level: 0.025, f0: 600, f1: 3000, pan0: 0, pan1: [-0.7, 0.7, 0.3][i], peak: 0.4 })));
}

function dharma(S) {
  S.at(CN.lionCapital, () => X.thud(S, CN.lionCapital, { level: 0.1, f: 58, tone: 900, decay: 0.45 }));
  for (let k = 0; k < 5; k++) { const t = CN.edicts + k * 0.09; S.at(t, () => I.stoneTap(S, t, { level: 0.05, pan: 0.3, f0: 1300 })); }
  S.at(CN.wheel - 0.1, () => I.whoosh(S, CN.wheel - 0.1, 0.8, { level: 0.04, f0: 300, f1: 1500, pan0: -0.3, pan1: 0.3, peak: 0.3 }));
  // the charkha: a spinning wheel's soft whirr
  S.at(CN.charkha, () => X.rotor(S, CN.charkha, CN.saltMarch + 0.3, { level: 0.018, f: 6, pan0: -0.2, pan1: 0.2 }));
  // the Salt March: footsteps on the road
  for (let k = 0; k < 4; k++) { const t = CN.saltMarch + k * 0.125; S.at(t, () => X.thud(S, t, { level: 0.03, f: 90, tone: 700, decay: 0.12, pan: k % 2 ? 0.2 : -0.2 })); }
}

function textiles(S) {
  S.at(CN.cottonBoll, () => X.air(S, CN.cottonBoll, CN.loom, { level: 0.015, freq: 3000, attack: 0.2, release: 0.3, bus: 'sfx' }));
  // the loom: shuttle swish and beater clack, two picks
  for (let k = 0; k < 2; k++) {
    const t = CN.loom + k * 0.3;
    S.at(t, () => { I.whoosh(S, t, 0.18, { level: 0.03, f0: 1200, f1: 4500, pan0: -0.6, pan1: 0.6, peak: 0.5 }); X.click(S, t + 0.16, { level: 0.06, freq: 900, body: 300, decay: 0.04 }); });
  }
  S.at(CN.chintz, () => X.paperSwish(S, CN.chintz, 0.4, { level: 0.04, pan0: -0.2, pan1: 0.3 }));
  for (const [k, d] of [0, 0.25, 0.5].entries()) S.at(CN.chess + d, () => X.click(S, CN.chess + d, { level: 0.07, freq: 1400, body: 500, decay: 0.03, pan: -0.3 + 0.3 * k }));
  S.at(CN.yoga, () => X.air(S, CN.yoga, CN.yoga + 0.7, { level: 0.02, freq: 800, attack: 0.3, release: 0.4, bus: 'sfx' }));
}

function yoga(S) {
  // dawn on the ghats: water and air; the flow of the sun salutation as soft swishes; the breath itself
  S.at(CN.yogaSunrise - 0.2, () => X.air(S, CN.yogaSunrise - 0.2, CN.pranayama, { level: 0.02, freq: 900, q: 0.8, attack: 0.4, release: 0.5, bus: 'sfx', drift: 0.6 }));
  for (let k = 0; k < 6; k++) { const t = CN.suryaNamaskar + k * 0.18; S.at(t, () => I.whoosh(S, t, 0.22, { level: 0.018, f0: 300, f1: 1400, pan0: -0.3 + k * 0.1, pan1: -0.2 + k * 0.1, peak: 0.5 })); }
  // inhale (rising breath noise), the alternate-nostril breaths left / right, the long exhale
  S.at(CN.pranayama, () => I.whoosh(S, CN.pranayama, CN.nadiShodhana - CN.pranayama, { level: 0.05, f0: 500, f1: 2600, pan0: 0, pan1: 0, peak: 0.85, q: 0.7, kind: 'pink' }));
  S.at(CN.nadiShodhana, () => I.whoosh(S, CN.nadiShodhana, 0.3, { level: 0.035, f0: 700, f1: 2000, pan0: -0.6, pan1: -0.6, peak: 0.6, kind: 'pink' }));
  S.at(CN.nadiShodhana + 0.3, () => I.whoosh(S, CN.nadiShodhana + 0.3, 0.3, { level: 0.035, f0: 700, f1: 2000, pan0: 0.6, pan1: 0.6, peak: 0.6, kind: 'pink' }));
  S.at(CN.exhale, () => I.whoosh(S, CN.exhale, 0.6, { level: 0.05, f0: 2400, f1: 400, pan0: 0, pan1: 0, peak: 0.15, q: 0.7, kind: 'pink' }));
  S.at(CN.eightLimbs, () => [74, 77, 81, 86].forEach((m, i) => I.bell(S, CN.eightLimbs + i * 0.06, m + 12, { level: 0.01, pan: -0.3 + i * 0.2, bus: 'far', decay: 1.6 })));
  S.at(CN.yogaDay, () => ghanta(S, CN.yogaDay, 62, { level: 0.015 }));
}

function flight(S) {
  // the dream (a shimmer), then real engines: the 1911 biplane's buzz, Tata's Puss Moth, a jet, Tejas
  S.at(CN.pushpaka, () => [86, 93, 98].forEach((m, i) => I.bell(S, CN.pushpaka + i * 0.07, m, { level: 0.012, pan: -0.3 + i * 0.3, bus: 'far', decay: 2 })));
  S.at(CN.airmail - 0.2, () => X.rotor(S, CN.airmail - 0.2, CN.tataMail - 0.1, { level: 0.02, f: 38, pan0: -0.5, pan1: 0.5 }));
  S.at(CN.tataMail - 0.1, () => X.rotor(S, CN.tataMail - 0.1, CN.marut, { level: 0.02, f: 52, pan0: 0.4, pan1: -0.4 }));
  S.at(CN.marut - 0.2, () => X.jetPass(S, CN.marut + 0.15, { pre: 0.35, post: 0.5, level: 0.12 }));
  S.at(CN.tejas - 0.2, () => X.jetPass(S, CN.tejas + 0.2, { pre: 0.3, post: 0.4, level: 0.15 }));
}

function modern(S) {
  S.at(CN.ramanujan, () => X.pencil(S, CN.ramanujan, CN.ramanujan + 0.8, { level: 0.04, pan: 0.2, vigor: 1.6 }));
  S.at(CN.ramanBeam, () => X.hum(S, CN.ramanBeam, CN.boseCondensate, { level: 0.02, freq: 120, cutoff: 1500, attack: 0.05, release: 0.2 }));
  S.at(CN.boseCondensate, () => [93, 98, 100, 105].forEach((m, i) => I.bell(S, CN.boseCondensate + i * 0.05, m, { level: 0.01, pan: -0.3 + i * 0.2, bus: 'far' })));
}

function isro(S) {
  // Thumba, 1963: a small sounding rocket
  S.at(CN.thumba, () => X.rocket(S, CN.thumba, 0.7, { level: 0.12 }));
  // the first satellite: a radio beacon
  for (let k = 0; k < 3; k++) { const t = CN.aryabhataSat + 0.1 + k * 0.18; S.at(t, () => I.blip(S, t, 1760, { level: 0.012, bus: 'sfx' })); }
  // PSLV: the big launch
  S.at(CN.pslv - 0.1, () => X.rocket(S, CN.pslv - 0.1, 1.1, { level: 0.25 }));
  S.at(CN.chandrayaan1, () => I.whoosh(S, CN.chandrayaan1, 0.7, { level: 0.03, f0: 300, f1: 2500, pan0: -0.4, pan1: 0.4, peak: 0.4 }));
  S.at(CN.mangalyaan, () => X.air(S, CN.mangalyaan, CN.chandrayaan3, { level: 0.012, freq: 4000, attack: 0.2, release: 0.3, bus: 'sfx' }));
  // Chandrayaan-3: the powered descent and touchdown near the south pole
  S.at(CN.chandrayaan3, () => X.descentRumble(S, CN.chandrayaan3, CN.southPole, { level: 0.05, attack: 0.2, release: 0.1 }));
  S.at(CN.southPole, () => X.thud(S, CN.southPole, { level: 0.08, f: 60, tone: 700, decay: 0.4 }));
}

function montageIndia(S) {
  S.at(CN.mGrid, () => X.thud(S, CN.mGrid, { level: 0.05, f: 70, tone: 1000, decay: 0.25 }));
  S.at(CN.mWheel, () => I.whoosh(S, CN.mWheel, 0.4, { level: 0.03, f0: 400, f1: 2000, pan0: -0.3, pan1: 0.3 }));
  S.at(CN.mTemple, () => ghanta(S, CN.mTemple, 57, { level: 0.02 }));
}

export const chapterCues = [indus, language, zero, astronomy, metallurgy, surgery, temples, nalanda, dharma, textiles, yoga, modern, flight, isro, montageIndia];
