// Sound design, sequence by sequence. Every event is pinned to a CUES number from
// the shared timeline so picture and sound hit together.

import { CUES as C } from '../timeline.js';
import * as I from './instruments.js';
import * as X from './sfx.js';
import * as O from './orchestra.js';

function opening(S) {
  // Distant atmospheric resonance: sub drone + airy filtered noise, very wet.
  S.at(0, () => {
    I.drone(S, 0, 8.5, 26, { level: 0.13, attack: 2.2, release: 2.5, beat: 0.18 });       // D1
    I.drone(S, 0.3, 8.0, 38, { level: 0.05, attack: 2.5, release: 2.5, beat: 0.31 });    // D2
    X.air(S, 0, 7.5, { level: 0.035, freq: 2400, attack: 1.8, release: 2.5 });
  });
  // pointAppears: a tiny crystalline shimmer
  S.at(C.pointAppears, () => {
    [98, 105, 93, 110].forEach((m, i) => I.bell(S, C.pointAppears + i * 0.045, m, { level: 0.02, pan: [-0.3, 0.35, 0.1, -0.1][i], bus: 'far', decay: 2.2 }));
  });
  // gridStart → gridDone: faint ticks as the grid lines draw, accelerating
  for (let k = 0; k < 14; k++) {
    const t = C.gridStart + (C.gridDone - C.gridStart) * (k / 14) ** 0.8;
    S.at(t, () => X.click(S, t, { level: 0.012 + 0.001 * k, freq: 5200 + k * 150, body: 2600, q: 6, decay: 0.01, pan: (k % 2 ? 0.6 : -0.6) * (1 - k / 20), bus: 'far' }));
  }
  // layers: pencil scratches drafting the layers
  S.at(C.layersStart, () => X.pencil(S, C.layersStart, 3.9, { level: 0.035, pan: -0.15 }));
  S.at(2.6, () => X.pencil(S, 2.6, 3.8, { level: 0.02, pan: 0.35, vigor: 1.4 }));
  // flyThrough
  S.at(C.flyThrough, () => I.whoosh(S, C.flyThrough, 1.0, { level: 0.08, f0: 200, f1: 2200, pan0: -0.4, pan1: 0.4 }));
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
  X.clockwork(S, C.instruments, C.gear, 0.25, { level: 0.032 });
  // orrery: finer gear teeth on 16ths + a slow metallic ring
  X.clockwork(S, C.orrery + 0.075, 24.4, 0.125, { level: 0.011 });
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
    X.hum(S, C.spark, C.circuitCity, { level: 0.03, freq: 100, cutoff: 1600, pan: -0.2 });
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
    [60, 64, 67, 72].forEach((m) => I.synthPluck(S, C.circuitCity, m, { level: 0.05, decay: 0.6, cutoff: 4500 }));
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

function computing(S) {
  // mechanical calculator: crank ratchet + key clacks
  S.at(C.calculator, () => {
    X.ratchet(S, C.calculator, 0.4, { level: 0.04, rate: 32, freq: 2400, pan: -0.3 });
    [0, 0.125, 0.25, 0.375].forEach((d) => X.click(S, C.calculator + d, { level: 0.035, freq: 1800, body: 420, decay: 0.03, pan: 0.2 }));
  });
  // relays: a clicking bank on the 16th grid
  const bits = [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0];
  bits.forEach((b, k) => {
    const t = C.relays + 0.1 + k * 0.125; // 39.5 … on the grid
    if (b) S.at(t, () => X.relay(S, t, { level: 0.035, pan: k % 3 === 0 ? -0.4 : 0.35 }));
  });
  // vacuum tubes: warm hum
  S.at(C.tubes, () => X.hum(S, C.tubes, C.processor + 0.2, { level: 0.035, freq: 60, cutoff: 500, attack: 0.25, release: 0.35 }));
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
  for (let k = 0; C.binary + 0.075 + k * 0.125 < 46.0; k++) {
    const t = Math.round((C.binary + 0.075 + k * 0.125) / 0.125) * 0.125; // snap to the 16th grid (41.875 …)
    const bit = S.random() < 0.55;
    if (S.random() < 0.18) continue;
    const m = tones[(k * 3) % tones.length] + (bit ? 12 : 0);
    const f = 440 * 2 ** ((m - 69) / 12);
    S.at(t, () => I.blip(S, t, f, { level: bit ? 0.022 : 0.03, type: bit ? 'square' : 'sine', decay: bit ? 0.05 : 0.08, pan: k % 2 ? 0.55 : -0.55 }));
  }
}

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

function montage(S) {
  // one morph every 0.8 s: short whoosh centred on the morph + a rising glint
  const morphs = [C.mColumns, C.mGears, C.mOrbits, C.mAtoms, C.mCircuit, C.mStars];
  const glints = [86, 88, 89, 91, 93, 95];
  morphs.forEach((t, i) => {
    S.at(t - 0.2, () => I.whoosh(S, t - 0.2, 0.45, { level: 0.05 + i * 0.006, f0: 600, f1: 5000, pan0: i % 2 ? 0.6 : -0.6, pan1: i % 2 ? -0.6 : 0.6, peak: 0.45, kind: 'white' }));
    S.at(t, () => I.bell(S, t, glints[i], { level: 0.02, decay: 1.2, pan: i % 2 ? 0.4 : -0.4 }));
  });
  // echoes of each era under the morphs
  S.at(C.mColumns, () => X.stoneGrind(S, C.mColumns, C.mColumns + 0.6, { level: 0.12, grow: false }));
  S.at(C.mGears, () => I.metal(S, C.mGears, 220, { level: 0.07, decay: 0.8, pan: 0.3 }));
  S.at(C.mCircuit, () => X.sparks(S, C.mCircuit, 0.4, { level: 0.05, bursts: 1 }));
}

function finale(S) {
  // After the drop: only a faint resonance and air remain.
  S.at(51.0, () => {
    I.drone(S, 51.0, 55.6, 38, { level: 0.009, attack: 1.2, release: 0.8, beat: 0.2, bus: 'end' });
    I.drone(S, 51.2, 55.4, 57, { level: 0.0025, attack: 1.5, release: 0.8, beat: 0.35, bus: 'end', pan: 0.2 });
    X.air(S, 51.0, 55.5, { level: 0.004, freq: 3200, attack: 1.2, release: 0.8, bus: 'end' });
  });
  // a faint inhale into the impact
  S.at(55.3, () => I.swellIn(S, C.finalImpact, 0.7, { level: 0.02, bus: 'end', top: 5000 }));
  // FINAL IMPACT — the most powerful moment: sub boom, taiko ensemble, BRAAM and a
  // D-major bloom of choir, brass and strings into a very long tail; the horns
  // answer with the head of the theme (D — A — high D) under the final title.
  S.at(C.finalImpact, () => {
    const t = C.finalImpact;
    const D_MAJOR = [38, 50, 57, 62, 66, 69, 74];
    I.boom(S, t, { level: 1.0, f0: 115, f1: 33, decay: 4.5, bus: 'endDry' });
    I.taiko(S, t, 0.95, { size: 1, bus: 'end' });
    I.taiko(S, t + 0.02, 0.6, { size: 0.6, bus: 'end' });
    X.thud(S, t, { level: 0.4, f: 45, tone: 400, decay: 1.2, bus: 'end' });
    I.crash(S, t, 0.1, { bus: 'end' });
    O.braam(S, t, 50, { level: 0.6, power: 1.3, dur: 3.2, bus: 'end' });
    O.brass(S, t, 1.2, [26, 38, 45, 50, 54, 57], { level: 0.5, sfz: true, bright: 2200, release: 2.6, bus: 'end' });
    O.chord(S, 'choirA', t, t + 1.3, [57, 62, 66, 69, 74, 78], { level: 0.5, attack: 0.06, release: 2.8, cutoff: 5200, bus: 'end' });
    O.chord(S, 'strings', t, t + 1.1, D_MAJOR, { level: 0.42, attack: 0.05, release: 3.0, cutoff: 3500, bus: 'end' });
    O.line(S, 'horn', [[t, 62, 0.75], [t + 0.75, 69, 1.0], [t + 1.75, 74, 1.0]], { level: 0.24, cutoff: 2400, bus: 'end', octaves: [0, -12], release: 1.6 });
  });
  // closingLine: faint high shimmer (D major add9)
  S.at(C.closingLine, () => [86, 90, 93, 100].forEach((m, i) => I.bell(S, C.closingLine + i * 0.07, m, { level: 0.012, decay: 2.5, pan: -0.45 + i * 0.3, bus: 'end' })));
}

// Designed air movement on the sequence changes that have no hit of their own.
function transitionAir(S) {
  for (const [t, p0] of [[12.0, -0.6], [20.0, 0.6], [28.5, -0.5], [34.5, 0.5], [38.6, -0.4], [42.5, 0.4]]) {
    S.at(t - 0.35, () => I.whoosh(S, t - 0.35, 0.9, { level: 0.05, f0: 160, f1: 1800, pan0: p0, pan1: -p0, peak: 0.4 }));
  }
}

export function arrangeCues(S) {
  transitionAir(S);
  for (const section of [opening, classical, civic, renaissance, science, industrial, electricity, medicine, flight, computing, knowledge, montage, finale]) {
    section(S);
  }
}
