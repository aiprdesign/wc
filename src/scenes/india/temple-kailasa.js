// Kailasa temple, Ellora (Cave 16, Rashtrakuta, 8th century) — high-detail model for the Architecture chapter
// (src/scenes/india/temples.js). buildKailasa(P, M, { lite }) adds parts to P (a Parts list from temples-assets.js,
// one merged mesh per material key) in the monument's own frame (metres; the entrance, west, towards +z). Every
// stone is basalt or one of the basalt variants registered here with userData.kailasaCut = true (kailasaFrieze,
// kailasaShade, kailasaRecess, kailasaVoid), so the whole temple takes the glow of the cutting plane as the rock fill
// is carved away. Everything stays inside the trench (K in temples-assets.js); the cliff and the fill are not here.
// The Dravidian vocabulary lives in temple-dravida-detail.js.
//
// What is modelled (the camera looks down into the trench from c. 75 m, so roofs, hara rows and the plan lead):
//   the main temple on its 8 m plinth: upana, jagati, the gala with life-size elephants and lions in high relief
//     "carrying" the temple, a kapota, kumuda, kantha frieze and pattika; the terrace on top
//   the mandapa: walls in bays with niches and figures, pilasters, a prastara with kudus, the flat roof with its
//     great lotus and four lions inside a hara of miniature shrines; sixteen pillars inside; the west porch and the
//     two side porches (pillared, with their own kapota and hara)
//   the vimana: moulded walls with deep devakoshthas, kumbha-panjaras and pilasters, four talas each with kapota
//     and hara, the octagonal griva with niches, the octagonal shikhara with four nasikas and a rock stupi
//   four subsidiary shrines on the terrace round the vimana, each a small vimana with a square domed shikhara
//   the Nandi mandapa on its own animal plinth, joined by rock bridges to the west porch and to the gateway
//   the two free-standing elephants and the two dhvajastambhas (c. 17 m: moulded pedestal, square, octagonal and
//     sixteen-sided shaft with bands, a kalasha-padma capital, a lion pavilion and the trishula)
//   the gopura (west gateway) in its screen wall, and the pillared cloisters cut into the trench walls (two
//     storeys at the back) with their sculpted panels
import * as THREE from 'three';
import { K } from './temples-assets.js';
import {
  Frame, dravidaMaterials, rect, octa, stepped, ring, cap, sides, adhishthana, prastara, wallFace, mirrorBays, hara,
  shikhara, pilaster, pillar, figure, elephant, lion, lathe, flat, kudu1, shalaShrine,
} from './temple-dravida-detail.js';

const PI = Math.PI;
const TERRACE = 8.0;
const MAIN_CZ = -13.5;       // the main plinth: x ±15, z −29 … 2

export function buildKailasa(P, M, { lite = false } = {}) {
  dravidaMaterials(M, 'kailasa', 'basalt', { cut: true, shade: '#86725f', recess: '#cdb69c', void: '#171009' });
  const F = new Frame(P, { stone: 'basalt', recess: 'kailasaRecess', shade: 'kailasaShade', frieze: 'kailasaFrieze', script: 'kailasaFrieze', void: 'kailasaVoid', gold: 'basalt' }, { lite });
  mainPlinth(F);
  mandapa(F);
  vimana(F);
  subShrines(F);
  nandiMandapa(F);
  bridges(F);
  gateway(F);
  for (const s of [-1, 1]) {
    elephant(F.sub(s * 12.5, 0, 9, -s * 0.18), 'stone', 1.25, { trunkDown: true });
    dhvajastambha(F.sub(s * 10.5, 0, 17));
  }
  cloisters(F);
}

// ------------------------------------------------------------------------------------------- plinths with animals
// a tall upapitha whose gala (the deep band in the middle) is lined with elephants and lions in high relief
function animalPlinth(F, PL, hx, hz, { h = TERRACE, pitch = 2.75, skip = [], faces = [0, 1, 2, 3], scale = 1 } = {}) {
  const g0 = 1.2 * scale, g1 = h - 2.7 * scale, k = scale;
  F.add('stone', ring(PL, [[0.55 * k, 0], [0.55 * k, 0.45 * k], [0.45 * k, 0.5 * k]]));
  F.add('stone', ring(PL, [[0.45 * k, 0.5 * k], [0.42 * k, 0.98 * k], [0.3 * k, 1.1 * k], [0.18 * k, g0], [0, g0]]));
  F.add('recess', ring(PL, [[0, g0], [0, g1]]));
  const kum = []; for (let a = -90; a <= 90; a += F.lite ? 45 : 30) kum.push([0.12 * k + 0.32 * k * Math.cos(a * PI / 180), g1 + 1.18 * k + 0.32 * k * Math.sin(a * PI / 180)]);
  F.add('stone', ring(PL, [[0, g1], [0.6 * k, g1 + 0.03], [0.75 * k, g1 + 0.2 * k], [0.75 * k, g1 + 0.42 * k], [0.6 * k, g1 + 0.6 * k], [0.32 * k, g1 + 0.72 * k], [0.12 * k, g1 + 0.8 * k], ...kum, [0, g1 + 1.55 * k]]));
  F.add('frieze', ring(PL, [[0, g1 + 1.55 * k], [-0.05, g1 + 1.6 * k], [-0.05, g1 + 1.9 * k], [0, g1 + 1.95 * k]]));
  F.add('stone', ring(PL, [[0, g1 + 1.95 * k], [0.2 * k, g1 + 2.0 * k], [0.22 * k, g1 + 2.42 * k], [0.1 * k, g1 + 2.5 * k], [0.1 * k, h], [0, h]]));
  F.add('stone', cap(PL, h));
  // the animals, alternating, facing out (elephants with their trunks down, lions on their haunches)
  const every = F.lite ? 2 : 1;
  sides(hx, hz).forEach(({ ry, D, L }, f) => {
    if (!faces.includes(f)) return;
    const n = Math.floor((2 * L - 1.5) / pitch), S = F.sub(0, 0, 0, ry);
    for (let i = 0; i < n; i += every) {
      const u = -L + 0.75 + (i + 0.5) * (2 * L - 1.5) / n;
      if (skip.some(([a, b]) => f === 0 && u > a && u < b)) continue;
      const A = S.sub(u, g0, D);
      if ((i + f) % 2 === 0) elephant(A, 'stone', 1.02 * k, { relief: true });
      else lion(A, 'stone', 1.55 * k, { relief: true });
    }
  });
}
function mainPlinth(F) {
  const T = F.sub(0, 0, MAIN_CZ);
  const PL = stepped(14.6, 15.1, [[0, 4.5, 0.4], [11.6, 14.6, 0.4]], [[0, 5.0, 0.4], [12.0, 15.1, 0.4]]);
  animalPlinth(T, PL, 15.0, 15.5, { skip: [[-2.6, 2.6]] });
  // a flight of steps on each side (north and south) up to the side porches
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) T.box('stone', s * (15.4 + k * 0.0), s * (15.6 + 0.6 * (6 - k)), 0, TERRACE * (k + 1) / 7, 6.8 - k * 0.0 - 0.0 - 2.2, 6.8 + 2.2 - 4.4 - 2.2 + 4.4);
}

// ------------------------------------------------------------------------------------------- the mandapa
function mandapa(F) {
  const lite = F.lite, cz = -6.5, hx = 12.0, hz = 5.0;                     // walls: x ±12.5, z −12 … −1 with the bays
  const H = F.sub(0, TERRACE, cz);
  const front = [[0, 2.6, 0.5, { niche: { w: 2.6, h: 4.0, sill: 0.4, door: true } }], [4.0, 7.6, 0.5, { niche: { w: 1.6, h: 3.4, sill: 0.8 } }], [9.0, hx, 0.5, { niche: { w: 1.5, h: 3.4, sill: 0.8 } }]];
  const side = [[0, 2.4, 0.5, { niche: { w: 2.2, h: 3.8, sill: 0.4, door: true } }], [3.6, hz, 0.5, {}]];
  const W = stepped(hx, hz, front.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  H.add('stone', ring(W, [[0.18, 0], [0.18, 0.3], [0.08, 0.36], [0.08, 0.5], [0, 0.55]]));       // the vedika at the foot of the wall
  // walls (hollow: the hall inside, its sixteen pillars on a dark floor)
  const wt = 5.4, ph = 2.0;
  for (const [x0, x1, z0, z1] of [[-hx, hx, -hz, -hz + 0.8], [-hx, hx, hz - 0.8, hz], [-hx, -hx + 0.8, -hz, hz], [hx - 0.8, hx, -hz, hz]]) H.box('recess', x0, x1, 0.55, wt, z0, z1);
  H.box('void', -hx + 0.8, hx - 0.8, 0, 0.02, -hz + 0.8, hz - 0.8);
  H.add('void', cap(rect(hx - 0.8, hz - 0.8), wt - 0.01, 0, true));
  for (const x of [-6.6, -2.2, 2.2, 6.6]) for (const z of [-3.0, -1.0, 1.0, 3.0]) pillar(H.coarse(), x, z, 0, wt, 0.7, { brackets: 4 });
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    if (k === 2) return;                                                      // the back opens into the vimana
    const bays = k % 2 ? side : front, ext = k % 2 ? 0.5 : 0.5;
    wallFace(H.sub(0, 0, 0, ry).sub(0, 0, D), 0.55, wt, mirrorBays(bays), { cornerExt: ext, L, pilW: 0.4 });
  });
  prastara(H.sub(0, wt, 0), W, ph, { kudu: 2.0, kuduR: 0.34 });
  // the roof: the great lotus with four lions round it, inside a hara
  const yr = wt + ph;
  hara(H.sub(0, yr, 0), hx + 0.5, hz + 0.5, { w: 1.5, faces: [0, 1, 3], bh: null });
  lotus(H.sub(0, yr, 0), 2.6);
  for (const [x, z] of [[-5.2, -2.4], [5.2, -2.4], [5.2, 2.4], [-5.2, 2.4]]) lion(H.sub(x, yr, z, Math.atan2(x, z)), 'stone', 1.25);
  // the west porch (mukha-mandapa): pillared, its own prastara and hara
  porch(F.sub(0, TERRACE, 1.5), 4.5, 1.9, [0, 1, 3]);
  // the side porches
  for (const s of [-1, 1]) porch(F.sub(s * 13.9, TERRACE, cz, s * PI / 2), 3.0, 1.5, [0, 1, 3]);
}
function lotus(F, r) {
  F.add('stone', lathe([[r, 0], [r, 0.12], [r * 0.9, 0.2], [r * 0.62, 0.26], [r * 0.6, 0.34], [r * 0.3, 0.42], [r * 0.28, 0.5], [0, 0.55]], F.lite ? 12 : 24));
  if (!F.lite) for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; F.add('stone', new THREE.SphereGeometry(r * 0.18, 5, 3).scale(1, 0.35, 1.8), Math.sin(a) * r * 0.8, 0.2, Math.cos(a) * r * 0.8, a); }
}
// a pillared porch facing +z in its frame: hw half-width, d depth (from the wall at z = 0 to the front)
function porch(F, hw, d, faces) {
  const lite = F.lite, h = 4.4;
  F.box('stone', -hw, hw, 0, 0.35, 0, d * 2);
  for (const x of lite ? [-hw + 0.5, hw - 0.5] : [-hw + 0.5, -hw * 0.36, hw * 0.36, hw - 0.5]) pillar(F, x, d * 2 - 0.5, 0.35, h, 0.62, { brackets: 2 });
  F.box('void', -hw + 0.6, hw - 0.6, 0.35, h, 0.05, 0.1);
  F.add('stone', ring(rect(hw, d), [[0, 0], [0, 0.4], [0.06, 0.45]]), 0, h, d);
  prastara(F.sub(0, h + 0.45, d), rect(hw, d), 1.4, { kudu: 1.8, kuduR: 0.24, edgeMin: 1.5 });
  F.add('shade', cap(rect(hw, d), h - 0.01, 0, true), 0, 0, d);
  hara(F.sub(0, h + 1.85, d), hw, d, { w: 1.1, faces, wall: false });
}

// ------------------------------------------------------------------------------------------- the vimana
function vimana(F) {
  const lite = F.lite, cz = -20, hx = 8.9, hz = 7.4;
  const V = F.sub(0, TERRACE, cz);
  const side = [[0, 2.2, 0.9, { niche: { w: 1.9, h: 4.2, sill: 1.1 }, oct: true }], [3.3, 5.0, 0.6, { niche: { w: 1.3, h: 3.6, sill: 1.4 } }], [6.1, hz, 0.6, {}]];
  const back = [[0, 2.4, 0.9, { niche: { w: 2.0, h: 4.2, sill: 1.1 }, oct: true }], [3.5, 6.0, 0.6, { niche: { w: 1.4, h: 3.6, sill: 1.4 } }], [7.1, hx, 0.6, {}]];
  const W = stepped(hx, hz, back.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  V.add('stone', ring(W, [[0.22, 0], [0.22, 0.32], [0.1, 0.4], [0.1, 0.56], [0, 0.6]]));
  const wt = 8.0, ph = 2.2;
  V.box('recess', -hx, hx, 0.6, wt + 1, -hz, hz);
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    if (k === 0) return;                                                     // the front is the mandapa's
    const bays = k % 2 ? side : back;
    wallFace(V.sub(0, 0, 0, ry).sub(0, 0, D), 0.6, wt, mirrorBays(bays), { cornerExt: 0.6, L, pilW: 0.44 });
  });
  prastara(V.sub(0, wt, 0), W, ph, { kudu: 1.9, kuduR: 0.36 });
  hara(V.sub(0, wt + ph, 0), hx + 0.6, hz + 0.6, { w: 1.75, bh: { L: 2.2, p: 0.3 } });
  // four talas
  let y = wt + ph;                                   // 10.2 above the terrace = 18.2
  const tiers = [[8.2, 7.2], [6.6, 6.0], [5.0, 4.8], [3.6, 3.6]];
  tiers.forEach(([tx, tz], i) => {
    const bx = Math.max(1.0, tx * 0.3), bz = Math.max(1.0, tz * 0.3), pr = 0.5;
    const T = stepped(tx, tz, [[0, bx, pr]], [[0, bz, pr]]);
    V.add('recess', ring(T, [[0, 0], [0, 1.85]]), 0, y, 0);
    prastara(V.sub(0, y + 1.85, 0), T, 1.15, { kudu: lite ? 0 : 2.1, kuduR: 0.24, over: 0.42, edgeMin: 1.2, mini: true });
    if (i < tiers.length - 1) hara(V.sub(0, y + 3.0, 0), tx, tz, { w: 1.6 - 0.12 * i, bh: { L: Math.min(bx, bz), p: pr } });
    y += 3.0;
  });
  // the octagonal griva with its niches, the octagonal shikhara and the stupi (rock-cut, like all the rest)
  V.add('stone', ring(octa(2.6), [[0.3, 0], [0.3, 0.2], [0, 0.3], [0, 1.15], [0.25, 1.3], [0.25, 1.4], [0, 1.45]]), 0, y, 0);
  for (let k = 0; k < 8; k++) { const S = V.sub(0, y, 0, k * PI / 4); S.box('shade', -0.42, 0.42, 0.32, 1.1, 2.6, 2.63); if (k % 2 === 0 && !lite) figure(S, 0, 0.34, 2.68, 0.8, { prabha: false, arms: 2 }); }
  shikhara(V.sub(0, y + 1.4, 0), { shape: 'oct', r: 3.4, h: 3.1, nasika: 0.32, crown: 'stone', crownH: 1.9 });
}

// ------------------------------------------------------------------------------------------- subsidiary shrines
function miniVimana(F, w, { niche = [0] } = {}) {
  const a = w / 2;
  adhishthana(F, rect(a), 0.9, { blocks: false });
  F.box('recess', -a, a, 0.9, 3.6, -a, a);
  for (const { ry, L } of sides(a, a)) {
    const S = F.sub(0, 0, 0, ry).sub(0, 0, a);
    for (const s of [-1, 1]) pilaster(S, s * (L - 0.3), 0.9, 3.6, 0, { w: 0.34, d: 0.1, simple: true });
  }
  for (const ry of niche) {
    const S = F.sub(0, 0, 0, ry).sub(0, 0, a);
    S.box('stone', -0.95, 0.95, 0.9, 3.6, 0, 0.35);
    S.box('shade', -0.55, 0.55, 1.2, 3.1, 0.35, 0.38);
    figure(S, 0, 1.2, 0.55, 1.7, { prabha: false });
  }
  prastara(F.sub(0, 3.6, 0), rect(a), 1.0, { kudu: 1.25, kuduR: 0.16, mini: true });
  hara(F.sub(0, 4.6, 0), a, a, { w: 0.95, wall: false });
  F.box('recess', -a * 0.55, a * 0.55, 4.6, 5.8, -a * 0.55, a * 0.55);
  return shikhara(F.sub(0, 5.8, 0), { shape: 'square', r: a * 0.72, h: a * 0.8, nasika: 0.34, crown: 'stone', crownH: 0.8 });
}
function subShrines(F) {
  for (const s of [-1, 1]) for (const z of [-26.0, -17.4]) miniVimana(F.sub(s * 12.4, TERRACE, z), 3.8, { niche: [s * PI / 2] });
}

// ------------------------------------------------------------------------------------------- Nandi mandapa, bridges
function nandiMandapa(F) {
  const cz = 10.25, N = F.sub(0, 0, cz);
  const PL = stepped(4.5, 4.0, [[0, 1.4, 0.3]], [[0, 1.6, 0.3]]);
  animalPlinth(N, PL, 4.8, 4.25, { skip: [[-1.6, 1.6]], pitch: 2.9, faces: [0, 1, 3] });
  const U = N.sub(0, TERRACE, 0), hx = 3.4, hz = 3.2;
  const face = [[0, 1.2, 0.3, { niche: { w: 1.7, h: 3.0, sill: 0.2, door: true } }], [2.2, hx, 0.3, {}]];
  const side = [[0, 1.3, 0.3, { niche: { w: 1.4, h: 2.6, sill: 0.6 } }], [2.2, hz, 0.3, {}]];
  const W = stepped(hx, hz, face.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  U.add('stone', ring(W, [[0.15, 0], [0.15, 0.25], [0, 0.4]]));
  U.box('recess', -hx, hx, 0.4, 4.4, -hz, hz);
  sides(hx, hz).forEach(({ ry, D, L }, k) => wallFace(U.sub(0, 0, 0, ry).sub(0, 0, D), 0.4, 4.2, mirrorBays(k % 2 ? side : face), { cornerExt: 0.3, L, pilW: 0.34, recessKP: !F.lite }));
  prastara(U.sub(0, 4.2, 0), W, 1.4, { kudu: 1.6, kuduR: 0.24 });
  hara(U.sub(0, 5.6, 0), hx + 0.3, hz + 0.3, { w: 1.1, bh: { L: 1.3, p: 0.0 } });
  U.box('recess', -1.7, 1.7, 5.6, 6.6, -1.7, 1.7);
  shikhara(U.sub(0, 6.6, 0), { shape: 'square', r: 2.3, h: 2.2, nasika: 0.34, crown: 'stone', crownH: 0.9 });
}
function bridges(F) {
  for (const [z0, z1] of [[3.4, 6.0], [14.5, 16.2]]) {
    F.box('stone', -2.0, 2.0, 6.5, TERRACE, z0 - 0.05, z1 + 0.05);
    F.box('shade', -1.9, 1.9, 6.48, 6.5, z0, z1);
    for (const s of [-1, 1]) {
      F.box('stone', s * 1.7, s * 2.05, TERRACE, TERRACE + 0.85, z0, z1);
      F.box('stone', s * 1.62, s * 2.12, TERRACE + 0.85, TERRACE + 1.0, z0, z1);
      F.box('stone', s * 1.9, s * 2.15, 6.3, 6.6, z0, z1);
    }
  }
}

// ------------------------------------------------------------------------------------------- gateway and screen wall
function gateway(F) {
  const lite = F.lite, cz = 18.05, hx = 6.2, hz = 1.75;
  const G = F.sub(0, 0, cz);
  const face = [[0, 1.8, 0.25, { niche: { w: 3.0, h: 5.2, sill: 0, door: true } }], [2.6, 4.6, 0.25, { niche: { w: 1.4, h: 3.6, sill: 0.8 } }], [5.2, hx, 0.25, {}]];
  const side = [[0, hz, 0.25, {}]];
  const W = stepped(hx, hz, face.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  adhishthana(G, W, 1.4, { blocks: !lite });
  G.box('recess', -hx, hx, 1.4, 7.4, -hz, hz);
  G.box('void', -1.5, 1.5, 1.4, 6.6, -hz - 0.3, hz + 0.3);                  // the passage
  sides(hx, hz).forEach(({ ry, D, L }, k) => { if (k % 2 === 0) wallFace(G.sub(0, 0, 0, ry).sub(0, 0, D), 1.4, 7.2, mirrorBays(face), { cornerExt: 0.25, L, pilW: 0.36 }); });
  prastara(G.sub(0, 7.2, 0), W, 1.5, { kudu: 1.8, kuduR: 0.26 });
  hara(G.sub(0, 8.7, 0), hx + 0.25, hz + 0.25, { w: 1.2, faces: [1, 3], wall: false });
  // the upper storey: a great barrel-vaulted shala with kudu gables
  shalaShrine(G.sub(0, 8.7, 0), 8.6, 2.6, { hb: 2.3, kudu: true });
  for (const s of [-1, 1]) kudu1(G.sub(s * 4.3, 8.7 + 2.3, 0, s * PI / 2), 0, -0.3, 0.1, 1.05, { face: true });
  // the screen wall to the trench sides, with pilasters, a coping and little kutas
  for (const s of [-1, 1]) {
    const x0 = s * (hx + 0.2), x1 = s * (K.X1 - 0.3), z0 = 18.9, z1 = 19.9, h = 4.6;
    F.box('stone', Math.min(x0, x1), Math.max(x0, x1), 0, 0.6, z0 - 0.25, z1 + 0.25);
    F.box('recess', Math.min(x0, x1), Math.max(x0, x1), 0.6, h, z0, z1);
    F.add('stone', ring(rect(Math.abs(x1 - x0) / 2, (z1 - z0) / 2), [[0, 0], [0.25, 0.08], [0.3, 0.3], [0.1, 0.42], [0, 0.42]]), (x0 + x1) / 2, h, (z0 + z1) / 2);
    const step = lite ? 5.2 : 2.6;
    for (let x = Math.abs(x0) + 1.4; x < Math.abs(x1) - 0.6; x += step) {
      pilaster(F, s * x, 0.6, h, z1, { w: 0.4, d: 0.12, simple: true });
      F.add('stone', flat(new THREE.SphereGeometry(0.55, lite ? 4 : 6, 3, 0, PI * 2, 0, PI / 2)), s * x, h + 0.42, (z0 + z1) / 2);
    }
  }
}

// ------------------------------------------------------------------------------------------- dhvajastambha
function dhvajastambha(F) {
  const lite = F.lite, seg = lite ? 8 : 16;
  F.add('stone', ring(rect(1.7), [[0, 0], [0, 0.5], [-0.12, 0.55], [-0.12, 1.0], [0.0, 1.15], [-0.25, 1.3], [-0.35, 1.32], [-0.35, 1.8], [-0.5, 1.95], [-0.5, 2.3], [-0.6, 2.4], [-0.6, 2.6]]));
  F.add('stone', cap(rect(1.1), 2.6));
  F.box('stone', -0.75, 0.75, 2.6, 6.0, -0.75, 0.75);                                          // square section
  if (!lite) for (let k = 0; k < 4; k++) { const S = F.sub(0, 0, 0, k * PI / 2); S.box('frieze', -0.55, 0.55, 3.0, 5.6, 0.75, 0.8); }
  F.add('stone', flat(new THREE.CylinderGeometry(0.66, 0.75, 4.0, 8).rotateY(PI / 8)), 0, 8.0, 0);       // octagonal
  F.add('stone', new THREE.CylinderGeometry(0.58, 0.64, 3.4, seg), 0, 11.7, 0);                         // sixteen-sided
  for (const [y, r] of [[6.0, 0.86], [7.6, 0.8], [10.0, 0.76], [11.7, 0.72], [13.3, 0.7]]) {        // bands
    F.add('stone', lathe([[r * 0.85, -0.18], [r, -0.1], [r, 0.1], [r * 0.85, 0.18]], seg), 0, y, 0);
  }
  F.add('stone', lathe([[0.6, 0], [0.95, 0.25], [1.05, 0.5], [0.62, 0.78], [0.56, 0.9], [1.0, 1.05], [1.12, 1.2], [0.8, 1.38], [1.25, 1.62]], seg), 0, 13.4, 0);   // kalasha · kumbha · padma
  F.box('stone', -1.1, 1.1, 15.02, 15.42, -1.1, 1.1);                                         // phalaka
  F.box('recess', -0.62, 0.62, 15.42, 16.3, -0.62, 0.62);
  if (!lite) for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) lion(F.sub(x * 0.72, 15.42, z * 0.72, Math.atan2(x, z)), 'stone', 0.5);
  F.box('stone', -0.9, 0.9, 16.3, 16.5, -0.9, 0.9);
  // the trishula
  F.add('stone', new THREE.CylinderGeometry(0.1, 0.12, 1.55, 6), 0, 17.25, 0);
  F.add('stone', new THREE.ConeGeometry(0.13, 0.4, 4), 0, 18.2, 0);
  F.add('stone', new THREE.TorusGeometry(0.42, 0.08, 4, lite ? 6 : 10, PI).rotateZ(PI), 0, 17.45, 0);
  for (const s of [-1, 1]) F.add('stone', new THREE.ConeGeometry(0.1, 0.36, 4), s * 0.42, 17.6, 0);
}

// ------------------------------------------------------------------------------------------- cloisters
// pillared galleries cut into the foot of the trench walls (two storeys at the back), sculpted panels behind
function cloisters(F) {
  const lite = F.lite, depth = 2.4;
  const run = (S, L, levels) => {   // in a frame whose +z faces the court, the cliff face at z = 0, u in [−L, L]
    levels.forEach(([y0, y1]) => {
      S.box('void', -L, L, y0, y1 - 0.2, -0.35, 0.1);
      S.box('stone', -L, L, y0 - 0.05, y0 + 0.25, 0, depth);
      const n = Math.max(2, Math.round(2 * L / 3.6)), pitch = 2 * L / n;
      for (let i = 0; i <= n; i += lite ? 2 : 1) {
        const u = -L + i * pitch;
        pillar(S, u, depth - 0.55, y0 + 0.25, y1 - 1.1, 0.75, { brackets: 2, ry: PI / 2 });
        if (i < n && !lite) S.box('frieze', u + 0.7, u + pitch - 0.7, y0 + 0.8, y1 - 1.6, 0.1, 0.18);    // sculpted panel
      }
      prastara(S.sub(0, y1 - 1.1, depth / 2), rect(L, depth / 2), 1.1, { kudu: lite ? 0 : 2.4, kuduR: 0.2, mini: true, edgeMin: 3 });
      S.add('shade', cap(rect(L, depth / 2), y1 - 1.11, 0, true), 0, 0, depth / 2);
    });
  };
  run(F.sub(K.X0, 0, (K.Z0 + 1 + K.Z1 - 2) / 2, PI / 2), (K.Z1 - 2 - K.Z0 - 1) / 2, [[0, 8.4]]);
  run(F.sub(K.X1, 0, (K.Z0 + 1 + K.Z1 - 2) / 2, -PI / 2), (K.Z1 - 2 - K.Z0 - 1) / 2, [[0, 8.4]]);
  run(F.sub(0, 0, K.Z0, 0), (K.X1 - K.X0 - 2) / 2, [[0, 8.4], [8.4, 15.4]]);
}
