// Sound design, sequence by sequence. Every event is pinned to a CUES number from
// the shared timeline so picture and sound hit together.

import { CUES as C, SEGMENTS } from '../timeline.js';
import { FILM_ID } from '../film.js';
import * as I from './instruments.js';
import * as X from './sfx.js';
import * as O from './orchestra.js';
import { groove } from './music.js';
import { headingList, kickTiming, onBeat, SWAPS } from '../lib/headings.js';

function opening(S) {
  // v12 — trailer cold open (the hits themselves — sub, taiko, BRAAM, stabs — live in music.js)
  const ign = C.ignition, ff = C.flashForward, pA = C.pointAppears, tL = C.titleLocked;
  // Distant atmospheric resonance: the sub drone lands with the ignition, airy noise above it
  S.at(0, () => {
    I.drone(S, ign, 8.5, 26, { level: 0.13, attack: 0.4, release: 2.5, beat: 0.18 });       // D1
    I.drone(S, pA, 8.0, 38, { level: 0.05, attack: 1.5, release: 2.5, beat: 0.31 });       // D2
    X.air(S, 0, 7.5, { level: 0.035, freq: 2400, attack: 1.2, release: 2.5 });
  });
  // ignition: a reversed suck out of silence into the first frame of light, then its crackle
  S.at(0, () => {
    I.swellIn(S, ign, ign, { level: 0.1, top: 9000 });
    I.revCymbal(S, ign, ign, { level: 0.06 });
  });
  S.at(ign, () => {
    X.sparks(S, ign + 0.02, 0.9, { level: 0.09, pan: 0, bursts: 1.6 });
    I.whoosh(S, ign, 0.7, { level: 0.08, f0: 4000, f1: 300, pan0: -0.2, pan1: 0.2, peak: 0.12, kind: 'white' });   // the shockwave passing
  });
  // flash-forward: each silhouette cuts in on its 8th with a whip of air and its own voice —
  // stone (column), iron (gear), fire (rocket), glass (the Moon)
  for (let k = 0; k < 4; k++) {
    const t = ff + k * 0.25, pan = [-0.35, 0.35, -0.2, 0.25][k];
    S.at(t - 0.09, () => I.whoosh(S, t - 0.09, 0.2, { level: 0.05, f0: 900, f1: 6000, pan0: -pan, pan1: pan, peak: 0.45, kind: 'white' }));
    S.at(t, () => X.sparks(S, t + 0.01, 0.12, { level: 0.035, pan, bursts: 1 }));
  }
  S.at(ff, () => { I.stoneTap(S, ff, { level: 0.22, pan: -0.3 }); X.thud(S, ff, { level: 0.2, f: 62, tone: 900, decay: 0.3 }); });
  S.at(ff + 0.25, () => { I.metal(S, ff + 0.25, 196, { level: 0.1, decay: 0.7, pan: 0.3 }); X.click(S, ff + 0.25, { level: 0.08, freq: 2400, body: 700, decay: 0.03, pan: 0.3 }); });
  S.at(ff + 0.5, () => I.whoosh(S, ff + 0.5, 0.28, { level: 0.08, f0: 180, f1: 3200, pan0: 0, pan1: 0, peak: 0.25, kind: 'pink' }));   // ignition roar, rising
  S.at(ff + 0.75, () => [93, 100, 105].forEach((m, i) => I.bell(S, ff + 0.75 + i * 0.03, m, { level: 0.03, pan: 0.25 - i * 0.2, bus: 'far', decay: 1.6 })));
  // … all four collapse into the point: a suck, then its crystalline glint
  S.at(pA - 0.14, () => I.swellIn(S, pA, 0.14, { level: 0.05, top: 7000 }));
  S.at(pA, () => {
    [98, 105, 93, 110].forEach((m, i) => I.bell(S, pA + i * 0.035, m, { level: 0.028, pan: [-0.3, 0.35, 0.1, -0.1][i], bus: 'far', decay: 2.2 }));
  });
  // the construction: a hard tick on every 8th as the strokes land (16ths into the fly-through),
  // then a held breath — silence — for the 16th before the SLAM
  for (let t = pA, k = 0; t < tL - 0.125 - 1e-6; t += t < C.flyThrough - 1e-6 ? 0.25 : 0.125, k++) {
    const u = (t - pA) / (tL - pA);
    S.at(t, () => X.click(S, t, { level: 0.03 + 0.05 * u, freq: k % 2 ? 2600 : 3600, body: 1300, q: 5, decay: 0.012, pan: k % 2 ? 0.45 : -0.45 }));
  }
  // sparks shed from the drawing heads
  for (const t of [pA, pA + 0.125, pA + 0.25, pA + 0.5]) S.at(t, () => X.sparks(S, t, 0.2, { level: 0.03, pan: S.rand(-0.5, 0.5), bursts: 0.8 }));
  // layers: pencil scratches drafting the layers
  S.at(C.layersStart, () => X.pencil(S, C.layersStart, C.flyThrough + 0.2, { level: 0.03, pan: -0.15, vigor: 1.4 }));
  // flyThrough: the push — a long rush of air into the SLAM, pages fluttering past
  S.at(C.flyThrough, () => I.whoosh(S, C.flyThrough, tL - C.flyThrough - 0.06, { level: 0.12, f0: 180, f1: 3800, pan0: -0.3, pan1: 0.3, peak: 0.8, kind: 'white' }));
  [[2.8, -0.6], [2.95, 0.6], [3.1, -0.5], [3.22, 0.5]].forEach(([t, p]) => S.at(t, () => X.paperSwish(S, t, 0.18, { level: 0.05, pan0: p, pan1: p * 1.6 })));
  // the SLAM: its crack and the spark storm
  S.at(tL, () => X.sparks(S, tL + 0.01, 1.1, { level: 0.1, bursts: 1.8 }));
  // subtitle: soft glint
  S.at(C.subtitle, () => I.bell(S, C.subtitle, 86, { level: 0.02, bus: 'far', pan: 0.2 }));
  // letters become 3D, then fly
  S.at(C.letters3D, () => I.whoosh(S, C.letters3D, 0.6, { level: 0.05, f0: 150, f1: 900, pan0: 0, pan1: 0 }));
  S.at(C.lettersFly, () => I.whoosh(S, C.lettersFly, 0.9, { level: 0.1, f0: 400, f1: 4500, pan0: -0.8, pan1: 0.8, peak: 0.4 }));
}

function classical(S) {
  // columnWire: wireframe lines — soft digital glints
  [81, 88, 93].forEach((m, i) => S.at(C.columnWire + i * 0.08, () => I.bell(S, C.columnWire + i * 0.08, m, { level: 0.015, decay: 1.2, bus: 'far', pan: -0.4 + i * 0.4 })));
  // stone movement: grinding builds from wire → clay → marble
  S.at(C.columnWire, () => X.stoneGrind(S, C.columnWire, C.templeReveal + 0.2, { level: 0.35, pan: -0.1 }));
  S.at(C.columnClay, () => X.stoneGrind(S, C.columnClay, C.templeLit, { level: 0.22, pan: 0.35 }));
  S.at(C.columnClay, () => X.thud(S, C.columnClay, { level: 0.18, f: 70, tone: 900, decay: 0.4 }));
  S.at(C.columnMarble, () => {
    I.stoneTap(S, C.columnMarble, { level: 0.14, pan: 0.2 });
    X.thud(S, C.columnMarble, { level: 0.14, f: 60, tone: 1200 });
  });
  // templeReveal: stone settling under the orchestral hit
  S.at(C.templeReveal, () => X.thud(S, C.templeReveal, { level: 0.25, f: 50, tone: 600, decay: 0.8 }));
  // overlays: three soft UI glints
  [0, 0.12, 0.24].forEach((d, i) => S.at(C.overlays + d, () => I.blip(S, C.overlays + d, [1760, 2349, 2637][i], { level: 0.012, pan: -0.4 + i * 0.4, bus: 'far' })));
}

function civic(S) {
  // parchment unrolls
  S.at(C.parchment - 0.1, () => {
    X.paperSwish(S, C.parchment - 0.1, 0.8, { level: 0.1, pan0: -0.6, pan1: 0.4 });
    X.crinkle(S, C.parchment, 0.7, { level: 0.08, pan: -0.1 });
  });
  // words: a soft seal-stamp under each (the harp motif sings the note)
  for (const t of [C.wordCivic, C.wordLaw, C.wordRepresentation]) {
    S.at(t, () => {
      X.thud(S, t, { level: 0.12, f: 65, tone: 700, decay: 0.3 });
      X.crinkle(S, t, 0.2, { level: 0.03, density: 0.12 });
    });
  }
  // letters fold into geometry
  S.at(C.lettersToGeometry, () => {
    I.whoosh(S, C.lettersToGeometry, 0.7, { level: 0.07, f0: 500, f1: 5000, pan0: 0.5, pan1: -0.5, peak: 0.7 });
    [88, 93].forEach((m, i) => I.bell(S, C.lettersToGeometry + 0.45 + i * 0.06, m, { level: 0.015, bus: 'far' }));
  });
}

function renaissance(S) {
  S.at(C.canvas, () => {
    X.thud(S, C.canvas, { level: 0.1, f: 90, tone: 1500, decay: 0.25 });
    X.paperSwish(S, C.canvas - 0.05, 0.4, { level: 0.05, pan0: 0.3, pan1: -0.3 });
  });
  // sketching: vigorous pencil hatching, two hands across the stereo field
  S.at(C.sketchStart, () => {
    X.pencil(S, C.sketchStart, C.sketchDone, { level: 0.08, pan: -0.25, vigor: 1.3 });
    X.pencil(S, C.sketchStart + 0.3, C.sketchDone - 0.1, { level: 0.05, pan: 0.3, vigor: 1.8 });
  });
  // model3D: shimmer as the sketch becomes solid
  S.at(C.model3D, () => [81, 86, 93, 98].forEach((m, i) => I.bell(S, C.model3D + i * 0.05, m, { level: 0.02, pan: -0.5 + i * 0.33 })));
  // paintBurst: whoosh + wet splash
  S.at(C.paintBurst - 0.35, () => I.whoosh(S, C.paintBurst - 0.35, 0.8, { level: 0.1, f0: 300, f1: 3500, pan0: -0.3, pan1: 0.6, peak: 0.45 }));
  S.at(C.paintBurst, () => {
    X.crinkle(S, C.paintBurst, 0.5, { level: 0.08, density: 0.2 });
    X.steam(S, C.paintBurst, 0.4, { level: 0.05 });
  });
}

function science(S) {
  // the apple falls (harp line in music.js) with a faint descending whistle
  S.at(C.fallStart, () => {
    const o = S.osc('sine', 1400, C.fallStart, C.fallStart + 0.7);
    o.frequency.exponentialRampToValueAtTime(350, C.fallStart + 0.6);
    const g = S.gain(0);
    g.gain.setValueAtTime(0, C.fallStart);
    g.gain.linearRampToValueAtTime(0.012, C.fallStart + 0.05);
    g.gain.linearRampToValueAtTime(0, C.fallStart + 0.65);
    o.connect(g);
    S.free(o, g, S.out(g, 'far', 0.2));
  });
  // instruments: clock escapement on 8ths (tick / tock), wind-up at the cue
  S.at(C.instruments, () => X.ratchet(S, C.instruments, 0.3, { level: 0.035, rate: 30, pan: -0.2 }));
  X.clockwork(S, C.instruments, C.gear, 0.25, { level: 0.032, fade: 0.5 });
  // orrery: finer gear teeth on 16ths + a slow metallic ring
  // (v11: the gear teeth run on to the spectrum's chapter change and thin away over its last beat
  // instead of stopping dead just before it)
  X.clockwork(S, C.orrery + 0.075, C.spectrum, 0.125, { level: 0.011, fade: 0.5 });
  S.at(C.orrery, () => {
    I.metal(S, C.orrery, 520, { level: 0.03, decay: 1.8, pan: 0.3, bus: 'far' });
    I.metal(S, C.orrery + 1.0, 390, { level: 0.02, decay: 1.8, pan: -0.3, bus: 'far' });
  });
  // prism: a rising glassy tone into the spectrum shimmer
  S.at(C.prismBeam, () => {
    const t0 = C.prismBeam, t1 = C.spectrum;
    const o = S.osc('triangle', 880, t0, t1 + 0.3);
    o.frequency.exponentialRampToValueAtTime(2640, t1);
    const g = S.gain(0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.02, t1);
    g.gain.linearRampToValueAtTime(0, t1 + 0.25);
    o.connect(g);
    S.out(g, 'lead');
    S.free(o, g);
  });
  S.at(C.spectrum, () => {
    [81, 85, 88, 93, 97, 100, 105].forEach((m, i) => I.bell(S, C.spectrum + i * 0.03, m, {
      level: 0.028, decay: 3, pan: -0.8 + i * 0.27, bus: 'lead',
    }));
  });
}

function industrial(S) {
  // gear: the first heavy iron clank
  S.at(C.gear, () => { I.metal(S, C.gear, 140, { level: 0.25, decay: 1.4 }); X.ratchet(S, C.gear, 0.5, { level: 0.04, rate: 16, pan: 0.3, freq: 2600 }); });
  // gearsMany: more ratchets across the field
  S.at(C.gearsMany, () => {
    X.ratchet(S, C.gearsMany, 1.0, { level: 0.03, rate: 16, pan: -0.5, freq: 3000 });
    X.ratchet(S, C.gearsMany + 0.06, 1.0, { level: 0.025, rate: 24, pan: 0.5, freq: 3800 });
  });
  // pistons: metal impacts ON the beat grid, alternating L/R; steam puffs on the offbeats
  for (let k = 0; k < 4; k++) {
    const t = C.pistons + k * 0.5;
    S.at(t, () => I.metal(S, t, k % 2 ? 196 : 262, { level: 0.14, decay: 0.7, pan: k % 2 ? 0.45 : -0.45 }));
    S.at(t + 0.25, () => X.steam(S, t + 0.25, 0.2, { level: 0.035, pan: k % 2 ? -0.5 : 0.5 }));
  }
  // steam: the big pressure release
  S.at(C.steam, () => X.steam(S, C.steam, 1.0, { level: 0.14 }));
  // machine: full slam
  S.at(C.machine, () => {
    I.metal(S, C.machine, 110, { level: 0.3, decay: 1.6 });
    I.metal(S, C.machine + 0.004, 330, { level: 0.14, decay: 1.0, pan: 0.3 });
    X.steam(S, C.machine + 0.05, 0.6, { level: 0.08, pan: -0.3 });
  });
}

function electricity(S) {
  // spark: big crackle + arc zap, then a live crackle bed through the section
  S.at(C.spark, () => {
    X.sparks(S, C.spark, 0.5, { level: 0.2, bursts: 1.5 });
    X.zap(S, C.spark, { level: 0.08 });
    X.zap(S, C.spark + 0.12, { level: 0.05, from: 3800, to: 400, pan: 0.4 });
    X.sparks(S, C.spark + 0.4, C.circuitCity + 0.3 - C.spark - 0.4, { level: 0.05, bursts: 0.8, pan: 0.2 });
    // (v11: the mains hum tuned to D (73.4 Hz), the common tone of the D minor and B♭ bars it
    // sits under — at 100 Hz it sat 35 cents sharp of G)
    X.hum(S, C.spark, C.circuitCity, { level: 0.03, freq: 73.42, cutoff: 1600, pan: -0.2, release: 0.8 });
  });
  // telegraph: morse "W C"
  S.at(C.telegraph, () => X.telegraph(S, C.telegraph, 'WC', { unit: 0.045, level: 0.055 }));
  // telephone: a short bell ring
  S.at(C.telephone, () => X.phoneRing(S, C.telephone, 0.45, { level: 0.025 }));
  // radio: tuning sweep through static
  S.at(C.radio, () => X.radioTune(S, C.radio, 0.75, { level: 0.08 }));
  // electronics: quick blips
  for (let k = 0; k < 4; k++) {
    const t = C.electronics + k * 0.0625;
    S.at(t, () => I.blip(S, t, [1760, 2637, 2217, 3520][k], { level: 0.025, type: 'square', pan: k % 2 ? 0.4 : -0.4 }));
  }
  // circuitCity: arc + synth stab
  S.at(C.circuitCity, () => {
    X.zap(S, C.circuitCity, { level: 0.08, from: 7000, to: 300, dur: 0.25 });
    [58, 62, 65, 70].forEach((m) => I.synthPluck(S, C.circuitCity, m, { level: 0.05, decay: 0.6, cutoff: 4500 }));
  });
}

function medicine(S) {
  S.at(C.microDive, () => X.dive(S, C.microDive, 1.0, { level: 0.1 }));
  S.at(C.anatomy, () => I.whoosh(S, C.anatomy, 1.2, { level: 0.04, f0: 150, f1: 700, pan0: -0.2, pan1: 0.2 }));
  // medical HUD: monitor beeps, then one beep per beat
  [0, 0.08, 0.16].forEach((d) => S.at(C.medicalHud + d, () => I.blip(S, C.medicalHud + d, 1976, { level: 0.02, pan: 0.4 })));
  for (const t of [34.0, 34.5]) S.at(t, () => I.blip(S, t, 1760, { level: 0.018, decay: 0.12, pan: 0.4 }));
}

function flight(S) {
  S.at(C.blueprint, () => {
    X.paperSwish(S, C.blueprint - 0.1, 0.6, { level: 0.07, pan0: 0.5, pan1: -0.3 });
    X.pencil(S, C.blueprint + 0.1, C.blueprint + 0.7, { level: 0.04, pan: 0.2, vigor: 2 });
  });
  // the aircraft folds out of the blueprint
  [0, 0.15, 0.3].forEach((d, i) => S.at(C.aircraftFold + d, () => X.paperSwish(S, C.aircraftFold + d, 0.25, { level: 0.06, pan0: -0.5 + i * 0.4, pan1: -0.2 + i * 0.4 })));
  // jet pass: L → R, peaking on the flyby cue
  S.at(C.flyby - 1.0, () => X.jetPass(S, C.flyby, { pre: 1.0, post: 1.3, level: 0.13 }));
  S.at(C.clouds, () => I.whoosh(S, C.clouds, 1.4, { level: 0.05, f0: 300, f1: 1400, pan0: 0.5, pan1: -0.5, kind: 'white' }));
  // rocket launch: huge low rumble and crackle, fading as Earth comes into view
  S.at(C.rocketLaunch, () => X.rocket(S, C.rocketLaunch, 2.3, { level: 0.16 }));
}

// The moonshot: capsule, descent, landing — all tucked under the music.
function moonshot(S) {
  // translunar: the capsule creaks as the stack turns; attitude thrusters puff
  S.at(C.translunar, () => {
    X.creak(S, C.translunar - 0.05, 0.75, { level: 0.03, pan: -0.35 });
    X.creak(S, C.translunar + 0.35, 0.5, { level: 0.02, pan: 0.4, rate: 95, panel: 1150 });
  });
  [[0.0, -0.5], [0.14, 0.45], [0.5, -0.3], [0.62, 0.5]].forEach(([d, p]) => S.at(C.translunar + d, () => X.thrusterPuff(S, C.translunar + d, { level: 0.035, pan: p })));
  // lunarDescent: the descent engine through the structure, shutting down on contact
  S.at(C.lunarDescent - 0.2, () => X.descentRumble(S, C.lunarDescent - 0.2, C.moonLanding - 0.05, { level: 0.1, attack: 0.5, release: 0.35 }));
  S.at(C.lunarDescent + 0.45, () => X.thrusterPuff(S, C.lunarDescent + 0.45, { level: 0.025, pan: 0.4 }));
  // air-to-ground: Quindar intro, a burst of the loop, Quindar outro …
  const q = C.lunarDescent + 0.1;
  S.at(q, () => {
    X.quindar(S, q, { level: 0.01 });
    X.radioBurst(S, q + 0.27, 0.33, { level: 0.022 });
    X.quindar(S, q + 0.62, { level: 0.009, freq: 2475 });
  });
  // … and again just after the landing (static first, then the outro tone)
  S.at(C.moonLanding + 0.15, () => {
    X.radioBurst(S, C.moonLanding + 0.15, 0.2, { level: 0.018, pan: 0.35, voice: 0.7 });
    X.quindar(S, C.moonLanding + 0.37, { level: 0.008, freq: 2475, pan: 0.35 });
  });
  // footprint: the boot presses into the regolith
  S.at(C.footprint, () => X.crunch(S, C.footprint, { level: 0.03, pan: -0.1 }));
  // guidanceComputer: DSKY relays and the "1202" alarm beeps
  [0, 0.06, 0.125, 0.19, 0.25].forEach((d, k) => S.at(C.guidanceComputer + d, () => X.relay(S, C.guidanceComputer + d, { level: 0.028, pan: k % 2 ? 0.35 : -0.25 })));
  [0.05, 0.2].forEach((d) => S.at(C.guidanceComputer + d, () => I.blip(S, C.guidanceComputer + d, 1202, { level: 0.014, type: 'square', decay: 0.09, pan: 0.3 })));
}

function computing(S) {
  // mechanical calculator: crank ratchet + key clacks
  S.at(C.calculator, () => {
    X.ratchet(S, C.calculator, 0.4, { level: 0.04, rate: 32, freq: 2400, pan: -0.3 });
    [0, 0.125, 0.25, 0.375].forEach((d) => X.click(S, C.calculator + d, { level: 0.035, freq: 1800, body: 420, decay: 0.03, pan: 0.2 }));
  });
  // relays: a clicking bank on the 16th grid
  const bits = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0];
  bits.forEach((b, k) => {
    const t = groove(C.relays + 0.1 + k * 0.125); // 43.5 … on the grid (and its tempo map)
    if (b) S.at(t, () => X.relay(S, t, { level: 0.035, pan: k % 3 === 0 ? -0.4 : 0.35 }));
  });
  // vacuum tubes: warm hum (v11: tuned to A (55 Hz), the dominant it sits under — at 60 Hz it
  // was a quarter-tone flat of B♭ against the A chord — and eased in / out more gently)
  S.at(C.tubes, () => X.hum(S, C.tubes, C.processor + 0.2, { level: 0.03, freq: 55, cutoff: 500, attack: 0.4, release: 0.6 }));
  // transistors: tiny high blips on 32nds
  for (let k = 0; k < 8; k++) {
    const t = C.transistors + k * 0.0625;
    S.at(t, () => I.blip(S, t, 3000 + ((k * 7) % 5) * 400, { level: 0.012, decay: 0.03, pan: k % 2 ? 0.5 : -0.5 }));
  }
  // processor: digital chirp; processorDive: downward rush
  S.at(C.processor, () => I.blip(S, C.processor, 4186, { level: 0.02, type: 'square', decay: 0.2 }));
  S.at(C.processorDive, () => I.whoosh(S, C.processorDive, 0.8, { level: 0.1, f0: 5000, f1: 1200, pan0: 0, pan1: 0, peak: 0.15, kind: 'white' }));
  // binary: arpeggiated digital blips on 16ths, 1 = high square, 0 = low sine
  const tones = [74, 77, 81, 86, 89];
  for (let k = 0; C.binary + 0.075 + k * 0.125 < BINARY_END; k++) {
    const t = groove(Math.round((C.binary + 0.075 + k * 0.125) / 0.125) * 0.125); // snap to the 16th grid (45.875 …)
    const bit = S.random() < 0.55;
    if (S.random() < 0.18) continue;
    const m = tones[(k * 3) % tones.length] + (bit ? 12 : 0);
    const f = 440 * 2 ** ((m - 69) / 12);
    S.at(t, () => I.blip(S, t, f, { level: bit ? 0.022 : 0.03, type: bit ? 'square' : 'sine', decay: bit ? 0.05 : 0.08, pan: k % 2 ? 0.55 : -0.55 }));
  }
}

// (v8: the blips run on to 50.0, knowledge's handover — no longer the montage's first morph)
const BINARY_END = 50.0;

function knowledge(S) {
  // pages fly: a flutter of short paper flicks
  for (let k = 0; k < 14; k++) {
    const t = C.pagesFly + k * 0.05 + S.rand(0, 0.03);
    const p = S.rand(-0.8, 0.8);
    S.at(t, () => X.paperSwish(S, t, S.rand(0.12, 0.22), { level: 0.025, pan0: p, pan1: p + S.rand(-0.3, 0.3) }));
  }
  // pages form a sphere: circling whoosh
  S.at(C.pageSphere, () => {
    I.whoosh(S, C.pageSphere, 0.8, { level: 0.04, f0: 400, f1: 2400, pan0: -0.7, pan1: 0.7, bus: 'sfx' });
    I.whoosh(S, C.pageSphere + 0.5, 0.7, { level: 0.03, f0: 500, f1: 2000, pan0: 0.7, pan1: -0.5, bus: 'sfx' });
  });
  // books: heavy thud
  S.at(C.books, () => X.thud(S, C.books, { level: 0.2, f: 70, tone: 1400, decay: 0.4 }));
  // pixels: glitch blips
  for (let k = 0; k < 10; k++) {
    const t = C.pixels + k * 0.03125;
    if (k % 3 === 2) continue;
    S.at(t, () => I.blip(S, t, S.pick([1320, 2640, 3960, 5280]), { level: 0.015, type: 'square', decay: 0.02, pan: S.rand(-0.7, 0.7) }));
  }
  // network: a glassy chord shimmer as the web connects
  S.at(C.network, () => [74, 81, 86, 88, 93].forEach((m, i) => I.bell(S, C.network + i * 0.04, m, { level: 0.022, pan: -0.6 + i * 0.3, decay: 2 })));
}

// The new frontier (1981–2026 and the vision of Mars): everything tucked under the brass;
// mechanical one-shots (servo, latch, blips) are physical, textures follow the film clock.
function frontier(S) {
  // shuttle: the launch — a low rumble and crackle from the pad, fading under the telescope
  S.at(C.shuttle - 0.1, () => X.rocket(S, C.shuttle - 0.1, 1.5, { level: 0.1 }));
  // hubble: the servo slews, the aperture door swings open and seats
  S.at(C.hubble - 0.15, () => X.servo(S, C.hubble - 0.15, 0.5, { level: 0.03, pan: 0.35, f: 170 }));
  S.at(C.hubble + 0.25, () => X.servo(S, C.hubble + 0.25, 0.3, { level: 0.018, pan: -0.3, f: 230 }));
  // genome: gentle data pulses — base pairs read out on the 16th grid (G C A T)
  const bases = [784, 1047, 880, 1175];
  for (let k = 0; k < 6; k++) {
    const t = Math.ceil(C.genome / 0.125) * 0.125 + 0.0625 + k * 0.125;
    S.at(t, () => I.blip(S, t, bases[(k * 3) % 4] * 2, { level: 0.011, decay: 0.05, pan: k % 2 ? 0.5 : -0.5, bus: 'sfx' }));
  }
  // webb: deep-space telemetry — soft carrier pulses through a faint band of static
  S.at(C.webb + 0.05, () => X.radioBurst(S, C.webb + 0.05, 0.4, { level: 0.008, pan: -0.35, voice: 0 }));
  [0.1, 0.35, 0.6].forEach((d, i) => S.at(C.webb + d, () => I.blip(S, C.webb + d, 2217, { level: 0.009 - 0.002 * i, decay: 0.09, pan: -0.35, bus: 'sfx' })));
  S.at(C.webb, () => X.servo(S, C.webb, 0.35, { level: 0.014, pan: 0.4, f: 210 }));
  // rover: Mars wind, and Ingenuity's tiny rotor buzz lifting off in the distance
  S.at(C.rover - 0.1, () => X.marsWind(S, C.rover - 0.1, C.artemis + 0.1, { level: 0.035, attack: 0.3, release: 0.4 }));
  S.at(C.rover + 0.2, () => X.rotor(S, C.rover + 0.2, C.artemis - 0.05, { level: 0.012 }));
  // artemis: a distant rocket roar rolling in from the pad
  S.at(C.artemis - 0.05, () => X.distantRoar(S, C.artemis - 0.05, C.marsVision + 0.3, { level: 0.07, attack: 0.35, release: 0.6 }));
  // marsVision: the Martian wind again, wider and gustier, under the swell
  S.at(C.marsVision - 0.2, () => X.marsWind(S, C.marsVision - 0.2, 55.6, { level: 0.04, attack: 0.4, release: 0.5, gust: 0.8 }));
}

function montage(S) {
  // one morph every 0.8 s: short whoosh centred on the morph + a rising glint (each film's own
  // morph cues: the montage's word swaps)
  const morphs = SWAPS.map(([cue]) => C[cue]);
  const glints = [86, 88, 89, 91, 93, 95];
  morphs.forEach((t, i) => {
    S.at(t - 0.2, () => I.whoosh(S, t - 0.2, 0.45, { level: 0.05 + i * 0.006, f0: 600, f1: 5000, pan0: i % 2 ? 0.6 : -0.6, pan1: i % 2 ? -0.6 : 0.6, peak: 0.45, kind: 'white' }));
    S.at(t, () => I.bell(S, t, glints[i], { level: 0.02, decay: 1.2, pan: i % 2 ? 0.4 : -0.4 }));
  });
  // echoes of each era under the morphs (the Western film's; the Indian film adds its own)
  if (C.mColumns == null) return;
  S.at(C.mColumns, () => X.stoneGrind(S, C.mColumns, C.mColumns + 0.6, { level: 0.12, grow: false }));
  S.at(C.mGears, () => I.metal(S, C.mGears, 220, { level: 0.07, decay: 0.8, pan: 0.3 }));
  S.at(C.mCircuit, () => X.sparks(S, C.mCircuit, 0.4, { level: 0.05, bursts: 1 }));
}

function finale(S) {
  // Everything here sits under the coda on the finale buses (the long space).
  // pullBack: the camera pulls back from the stars — a slow, wide rush of air
  S.at(C.pullBack, () => I.whoosh(S, C.pullBack, 1.6, { level: 0.045, f0: 140, f1: 900, pan0: 0.5, pan1: -0.5, peak: 0.25, bus: 'end' }));
  // earthReveal → sunrise: the faint air of space around the Earth, and a whisper of low resonance
  S.at(C.earthReveal - 0.3, () => {
    X.air(S, C.earthReveal - 0.3, C.fadeOut, { level: 0.005, freq: 3000, attack: 1.5, release: 2.0, bus: 'end' });
    I.drone(S, C.earthReveal, C.ideasLine + 1.5, 50, { level: 0.004, attack: 2.0, release: 1.5, beat: 0.25, bus: 'end', pan: -0.2 });
  });
  // story lines: a tiny glint as each line of text appears
  S.at(C.storyOne, () => I.bell(S, C.storyOne, 93, { level: 0.008, decay: 2.2, pan: 0.35, bus: 'end' }));
  S.at(C.storyTwo, () => I.bell(S, C.storyTwo, 90, { level: 0.008, decay: 2.2, pan: -0.35, bus: 'end' }));
  // ideasLine: a soft intake of breath into the title, then a glassy suspended shimmer
  S.at(C.ideasLine - 0.6, () => I.swellIn(S, C.ideasLine, 0.6, { level: 0.012, bus: 'end', top: 3500 }));
  S.at(C.ideasLine, () => [86, 88, 93].forEach((m, i) => I.bell(S, C.ideasLine + 0.05 + i * 0.07, m, { level: 0.008, decay: 2.8, pan: -0.4 + i * 0.4, bus: 'end' })));
  // ideasOut: the title lifts away
  S.at(C.ideasOut - 0.2, () => I.whoosh(S, C.ideasOut - 0.2, 0.7, { level: 0.03, f0: 400, f1: 3000, pan0: -0.3, pan1: 0.4, peak: 0.45, bus: 'end' }));
  // sunrise: light breaking over the limb — a brightening shimmer of air
  S.at(C.sunrise, () => X.air(S, C.sunrise, C.finalImpact - 0.1, { level: 0.012, freq: 6500, attack: 1.2, release: 0.05, bus: 'end', drift: 0.3 }));
  // (the final impact itself — the score's button — lives in music.js)
  // closingLine: faint high shimmer (D major add9)
  S.at(C.closingLine, () => [86, 90, 93, 100].forEach((m, i) => I.bell(S, C.closingLine + i * 0.07, m, { level: 0.01, decay: 2.5, pan: -0.45 + i * 0.3, bus: 'end' })));
}

// Designed air movement through the sequence changes: each whoosh peaks on the chapter's
// downbeat (v11: every chapter has one; the moonshot's moves from 38.6 onto its downbeat, 38.5).
// Chapter headings: the forming is heard as whooshes. Each letter rushes in with its own short
// whoosh from its side of the lens to its place (they ripple together as the word flies in), under
// one deeper whoosh that carries the whole word and peaks on the last landing. The letter-by-letter
// shine is an airy high whoosh sweeping left to right across the word, and the clearing a soft
// falling one. Montage swaps (fast, stacked) get the word whoosh and the shine sweep only.
function headings(S) {
  for (const h of headingList()) {
    const t0 = onBeat(h.t0, h.swap ? 2 : 1), t1 = onBeat(h.t1, h.swap ? 2 : 1);
    const n = h.n ?? h.text.length, k = kickTiming(n, h.swap, h.pace, t0);
    const pos = (i) => (n > 1 ? (i / (n - 1)) * 2 - 1 : 0);   // -1 left … +1 right
    const G = h.swap ? 0.8 : 1;
    const tIn = t0 + (n - 1) * k.slot + k.land;               // the last letter lands
    S.at(t0 - 0.2, () => {
      // the word: one deep whoosh that lifts in ahead of the letters and peaks as the last one lands
      const w0 = t0 - 0.12, wd = tIn - w0 + 0.3;
      I.whoosh(S, w0, wd, { level: 0.9 * G, f0: 160, f1: 2600, pan0: -0.45, pan1: 0.45, peak: (tIn - w0) / wd, q: 0.9, kind: 'pink' });
      // each letter: a short whoosh from beside the lens to its place
      if (!h.swap) {
        for (let i = 0; i < n; i++) {
          const p = pos(i) * 0.7, tf = t0 + i * k.slot;
          const side = p > 0.05 ? 1 : p < -0.05 ? -1 : (i % 2 ? 1 : -1);
          const d = k.fly * 1.5;
          I.whoosh(S, tf - k.fly * 0.2, d, { level: 0.45, f0: 420 + 30 * i, f1: 4200 + 150 * i, pan0: side * 0.95, pan1: p, peak: (k.land + k.fly * 0.2) / d, q: 1.3, kind: 'pink' });
        }
      }
      // the shine: an airy high whoosh sweeping across the word, letter by letter
      const s0 = t0 + k.shine0 - 0.03, sd = (n - 1) * k.shineSlot + k.shineDur + 0.12;
      I.whoosh(S, s0, sd, { level: 0.45 * G, f0: 2400, f1: 9500, pan0: -0.6, pan1: 0.6, peak: 0.45, q: 1.1, kind: 'white' });
      // clearing: a soft falling whoosh as the letters fold away
      if (!h.swap && !h.last) {
        const to = onBeat(t1 - 0.2, 4);
        I.whoosh(S, to - 0.05, 0.45, { level: 0.4, f0: 2800, f1: 400, pan0: 0.25, pan1: -0.25, peak: 0.3, kind: 'pink' });
      }
    });
  }
}

function transitionAir(S) {
  // the Western film's chapter downbeats (on its tempo map); another film's: its own segment starts,
  // up to the last chapter before the launch the score lands on (its sound design plays on the film clock)
  const list = FILM_ID === 'western'
    ? [[7.5, 0.5, 0.035], [12.0, -0.6], [15.5, 0.5, 0.035], [20.0, 0.6], [24.5, -0.5, 0.04], [28.5, -0.5], [31.5, 0.5, 0.04], [34.5, 0.5], [38.5, -0.4], [42.5, 0.4], [46.5, -0.4]]
    : SEGMENTS.slice(1, -3).map((sg, i) => [sg.start, i % 2 ? -0.5 : 0.5, 0.045]);
  for (const [t, p0, lv = 0.05] of list) {
    const tt = FILM_ID === 'western' ? groove(t) : t;
    S.at(tt - 0.35, () => I.whoosh(S, tt - 0.35, 0.9, { level: lv, f0: 160, f1: 1800, pan0: p0, pan1: -p0, peak: 0.4 }));
  }
}

// `chapters`: the film's own chapter sound design between the shared opening and montage
// (the Western film's by default; the Indian film passes src/audio/india/cues.js).
export function arrangeCues(S, chapters = [classical, civic, renaissance, science, industrial, electricity, medicine, flight, moonshot, computing, knowledge, frontier]) {
  transitionAir(S);
  headings(S);
  for (const section of [opening, ...chapters, montage, finale]) {
    section(S);
  }
}
