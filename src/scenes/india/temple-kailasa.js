// Kailasa temple, Ellora (Cave 16, Rashtrakuta, 8th century) — high-detail replica for the Architecture chapter
// (src/scenes/india/temples.js). buildKailasa(P, M, { lite }) adds parts to P (a Parts list from temples-assets.js,
// one merged mesh per material key) in the monument's own frame (metres; the entrance, west, towards +z, so north
// is −x and south is +x). Every stone is basalt or one of the basalt variants registered here with
// userData.kailasaCut = true (kailasaFrieze, kailasaShade, kailasaRecess, kailasaVoid, and kailasaPlaster /
// kailasaPlasterHi: the basalt with the traces of the white lime plaster that once made the temple look like the
// snowy Kailasa — on the upper storeys and the tower), so the whole temple takes the glow of the cutting plane.
// Everything stays inside the trench (K in temples-assets.js); the cliff and the rock fill are not here.
// The Dravidian vocabulary lives in temple-dravida-detail.js.
//
// The plan follows the real temple, west to east (+z to −z):
//   the gopura in its screen wall: a two-storey gateway, the upper storey under a barrel-vaulted wagon roof
//   a rock bridge to the Nandi mandapa: two storeys — the solid lower storey with its elephants and, facing the
//     entrance, the Gaja-Lakshmi panel (Lakshmi on her lotus, bathed by elephants); the upper shrine with pierced
//     windows, a flat roof and a lion parapet
//   a second bridge to the west porch of the main temple, which stands on its 8 m solid plinth: upana, jagati, the
//     deep gala lined with 40-odd life-size elephants in high relief (varied: trunks hanging, curled, raised or
//     swung, heads turned) with lions and horned vyalas among them, "carrying" the temple under a kapota; kumuda,
//     kantha frieze, pattika; on the south side the Ravananugraha panel in its deep chamber (Ravana, ten-headed and
//     twenty-armed, shaking Mount Kailasa, Shiva and Parvati enthroned on the summit among their attendants)
//   the mandapa: walls in bays with niches and figures, pilasters, prastara with kudus; sixteen pillars inside; the
//     flat roof with its great lotus and four lions inside a hara; porches west, north and south, with stairs
//     down to the court on the north and south
//   the vimana (c. 30 m above the court): niched walls, four talas with kapotas and hara rows, the octagonal griva
//     and shikhara with four nasikas and the stupi
//   the five subsidiary shrines on the terrace round the vimana (each a small vimana with a square shikhara)
//   in the court the two free-standing elephants and the two dhvajastambhas (banded, square → octagonal →
//     sixteen-sided shaft, kalasha capital, lion pavilion, trishula)
//   the cloisters cut into the cliff: pillared galleries with sculpted panels and dark doorways, three storeys at
//     the back, two on the south; on the north the Lankeshvara cave at the upper level, joined to the north porch
//     by a rock bridge
import * as THREE from 'three';
import { K } from './temples-assets.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { fbm2 } from '../../lib/noise.js';
import { rng } from '../../lib/math.js';
import {
  Frame, dravidaMaterials, rect, octa, stepped, ring, cap, sides, adhishthana, prastara, wallFace, mirrorBays, hara,
  shikhara, pilaster, pillar, figure, elephant, lion, lathe, flat, kudu1,
} from './temple-dravida-detail.js';

const PI = Math.PI;
const TERRACE = 8.0;
const MAIN_CZ = -11.6, MAIN_HX = 15.0, MAIN_HZ = 15.0;  // the main plinth: x ±15, z −26.6 … 3.4
const MAND_CZ = -5.0, VIM_CZ = -17.0;
const PLASTER = { stone: 'kailasaPlaster', recess: 'kailasaRecess' }, PLASTER_HI = { stone: 'kailasaPlasterHi', recess: 'kailasaPlaster' };

export function buildKailasa(P, M, { lite = false } = {}) {
  dravidaMaterials(M, 'kailasa', 'basalt', { cut: true, shade: '#7c6a58', recess: '#c6ae94', void: '#120c08' });
  plasterMaterials(M);
  const F = new Frame(P, { stone: 'basalt', recess: 'kailasaRecess', shade: 'kailasaShade', frieze: 'kailasaFrieze', script: 'kailasaFrieze', void: 'kailasaVoid', gold: 'basalt' }, { lite });
  mainPlinth(F);
  mandapa(F);
  vimana(F);
  subShrines(F);
  nandiMandapa(F);
  bridges(F);
  gateway(F);
  for (const s of [-1, 1]) {
    elephant(F.sub(s * 12.5, 0, 9, -s * 0.18), 'stone', 1.25, { pose: s > 0 ? 0 : 3 });
    dhvajastambha(F.sub(s * 10.5, 0, 17));
  }
  cloisters(F);
}

// ------------------------------------------------------------------------------------------- lime-plaster patina
// the basalt map with soft patches of old white lime plaster (two densities), tileable
function plasterMaterials(M) {
  if (!M.basalt || M.kailasaPlaster) return;
  const mk = (cover, color, seed) => {
    const m = M.basalt.clone();
    if (typeof document !== 'undefined' && M.basalt.map?.image) {
      const N = 256, c = mkCanvas(N, N), g = c.getContext('2d'), r = rng(seed);
      g.drawImage(M.basalt.map.image, 0, 0, N, N);
      const img = g.getImageData(0, 0, N, N), d = img.data;
      const n = (x, y) => fbm2(x / 46 + seed, y / 46, 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const u = x / N, v = y / N;   // tileable blend of four samples
        const f = (n(x, y) * (1 - u) * (1 - v) + n(x - N, y) * u * (1 - v) + n(x, y - N) * (1 - u) * v + n(x - N, y - N) * u * v) * 0.5 + 0.5;
        const t = Math.min(1, Math.max(0, (f - (1 - cover)) / 0.12)) * (0.7 + 0.3 * r()) * (0.85 + 0.15 * Math.sin(y * 0.9 + x * 0.13));
        const i = (y * N + x) * 4;
        d[i] += (238 - d[i]) * t; d[i + 1] += (231 - d[i + 1]) * t; d[i + 2] += (218 - d[i + 2]) * t;
      }
      g.putImageData(img, 0, 0);
      m.map = toTexture(c, { repeat: true });
    }
    m.color = new THREE.Color(color); m.roughness = 0.93; m.userData.kailasaCut = true;
    return m;
  };
  M.kailasaPlaster = mk(0.36, '#f0dcc6', 3.7);
  M.kailasaPlasterHi = mk(0.58, '#f2e0cc', 8.1);
}

// ------------------------------------------------------------------------------------------- plinths with animals
// a tall upapitha whose gala is lined with animals in high relief; skip = [[face, u0, u1], ...] keeps spans clear
function animalPlinth(F, PL, hx, hz, { h = TERRACE, pitch = 2.2, skip = [], faces = [0, 1, 2, 3], lionEvery = 6, seed = 1 } = {}) {
  const g0 = 1.2, g1 = h - 2.7, r = rng(seed);
  F.add('stone', ring(PL, [[0.55, 0], [0.55, 0.45], [0.45, 0.5]]));
  F.add('stone', ring(PL, [[0.45, 0.5], [0.42, 0.98], [0.3, 1.1], [0.18, g0], [0, g0]]));
  F.add('recess', ring(PL, [[0, g0], [0, g1]]));
  const kum = []; for (let a = -90; a <= 90; a += F.lite ? 45 : 30) kum.push([0.12 + 0.32 * Math.cos(a * PI / 180), g1 + 1.18 + 0.32 * Math.sin(a * PI / 180)]);
  F.add('stone', ring(PL, [[0, g1], [0.6, g1 + 0.03], [0.85, g1 + 0.2], [0.88, g1 + 0.42], [0.7, g1 + 0.6], [0.36, g1 + 0.72], [0.12, g1 + 0.8], ...kum, [0, g1 + 1.55]]));
  F.add('frieze', ring(PL, [[0, g1 + 1.55], [-0.05, g1 + 1.6], [-0.05, g1 + 1.9], [0, g1 + 1.95]]));
  F.add('stone', ring(PL, [[0, g1 + 1.95], [0.2, g1 + 2.0], [0.22, g1 + 2.42], [0.1, g1 + 2.5], [0.1, h], [0, h]]));
  F.add('stone', cap(PL, h));
  let count = 0, k = 0;
  sides(hx, hz).forEach(({ ry, D, L }, f) => {
    if (!faces.includes(f)) return;
    const n = Math.floor((2 * L - 1.2) / pitch), S = F.sub(0, 0, 0, ry);
    for (let i = 0; i < n; i++) {
      const u = -L + 0.6 + (i + 0.5) * (2 * L - 1.2) / n;
      if (skip.some(([sf, a, b]) => f === sf && u > a - 1.0 && u < b + 1.0)) continue;
      const A = S.sub(u, g0, D), v = r();
      if (k++ % lionEvery === lionEvery - 1) lion(A, 'stone', 1.5 + 0.1 * v, { relief: true, vyala: v > 0.5 });
      else { elephant(A.sub(0, 0, 0, (r() - 0.5) * 0.12), 'stone', 0.96 + 0.1 * r(), { relief: true, pose: Math.floor(v * 4), turn: (r() - 0.5) * 0.4 }); count++; }
    }
  });
  return count;
}
function mainPlinth(F) {
  const T = F.sub(0, 0, MAIN_CZ);
  const PL = stepped(14.6, 14.6, [[0, 4.5, 0.4], [11.6, 14.6, 0.4]], [[0, 5.0, 0.4], [11.6, 14.6, 0.4]]);
  // (face 1 = south, +x, u = −zT; face 3 = north, −x, u = zT; zT = z − MAIN_CZ)
  const zt = (z) => z - MAIN_CZ, rav = [zt(-21.2), zt(-12.2)];
  animalPlinth(T, PL, MAIN_HX, MAIN_HZ, { skip: [[0, -2.4, 2.4], [1, -rav[1], -rav[0]], [1, -zt(-3.8), -zt(-6.2)], [3, zt(-2.0), 16]], seed: 5, lionEvery: 10, pitch: 2.12 });
  ravanaPanel(T.sub(0, 0, 0, PI / 2).sub(-(rav[0] + rav[1]) / 2, 0, MAIN_HX), rav[1] - rav[0]);
}
// Ravananugraha: the ten-headed Ravana under Mount Kailasa, shaking it; Shiva and Parvati enthroned above
function ravanaPanel(S, w) {
  const lite = S.lite, u0 = -w / 2, u1 = w / 2, dep = 2.6, y0 = 1.0, y1 = 7.0, r = rng(11);
  S.box('stone', u0 - 0.9, u0, 0, y1 + 0.9, 0, dep); S.box('stone', u1, u1 + 0.9, 0, y1 + 0.9, 0, dep);   // the chamber walls
  S.box('stone', u0 - 1.0, u1 + 1.0, y1, y1 + 0.95, -0.1, dep + 0.25);                                   // lintel
  S.box('stone', u0 - 0.9, u1 + 0.9, 0, y0, 0, dep + 0.3);                                               // sill
  S.box('shade', u0, u1, y0, y1, 0, 0.05);
  S.add('shade', cap(rect(w / 2, dep / 2), y1 - 0.01, 0, true), 0, 0, dep / 2);
  for (const s of [-1, 1]) pilaster(S, s * (w / 2 + 0.45), 0, y1, dep, { w: 0.6, d: 0.12 });
  // the mountain: heaped rock masses with carved texture, ledges with attendants
  for (let i = 0; i < (lite ? 8 : 18); i++) {
    const x = u0 + 0.5 + r() * (w - 1), y = y0 + 2.7 + r() * 1.9, rr = 0.55 + r() * 0.6;
    S.add('frieze', new THREE.SphereGeometry(rr, lite ? 6 : 9, lite ? 4 : 6).scale(1.3, 0.8, 0.55), x, y, 0.35 + r() * 0.5);
  }
  S.box('stone', u0 + 0.6, u1 - 0.6, y0 + 4.5, y0 + 4.75, 0.1, 1.4);                                     // the summit ledge
  // Shiva and Parvati seated on the summit, attendants and ganas round them
  const seated = (x, h, z = 0.8) => {
    S.add('stone', new THREE.BoxGeometry(h * 0.5, h * 0.22, h * 0.36), x, y0 + 4.75 + h * 0.11, z);
    figure(S, x, y0 + 4.75 + h * 0.12, z, h * 0.85, { prabha: !lite });
  };
  seated(-0.4, 1.4); seated(0.55, 1.15);
  for (const x of [-3.2, -2.3, -1.6, 1.6, 2.4, 3.2]) if (Math.abs(x) < w / 2 - 0.4) figure(S, x, y0 + 4.75, 0.5, 0.9 + r() * 0.2, { prabha: false, arms: 2 });
  // Ravana: crouched beneath, ten heads in a row, twenty arms fanning out against the rock
  const R = S.sub(0, y0, 1.3);
  R.add('stone', new THREE.SphereGeometry(0.7, 10, 8).scale(1.15, 1.2, 0.7), 0, 1.75, 0);               // torso
  R.add('stone', new THREE.SphereGeometry(0.6, 8, 6).scale(1.2, 0.8, 0.8), 0, 0.85, 0.1);               // hips
  for (const s of [-1, 1]) {
    R.add('stone', new THREE.CylinderGeometry(0.2, 0.17, 1.1, 6).rotateZ(s * 1.0), s * 0.75, 0.75, 0.25); // thighs (squatting)
    R.add('stone', new THREE.CylinderGeometry(0.16, 0.13, 0.9, 6), s * 1.2, 0.4, 0.3);                    // shins
  }
  for (let i = 0; i < 10; i++) {                                                                        // ten heads, two tiers
    const row = i < 6 ? 0 : 1, j = row ? i - 6 : i, nrow = row ? 4 : 6, x = (j - (nrow - 1) / 2) * 0.42;
    R.add('stone', new THREE.SphereGeometry(0.2, 7, 5).scale(1, 1.1, 0.9), x, 2.55 + row * 0.38, 0.05);
    R.add('stone', new THREE.ConeGeometry(0.13, 0.28, 5), x, 2.8 + row * 0.38, 0.03);                      // crowns
  }
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {                                               // twenty arms
    const a = 0.25 + i * 0.13, L = 1.35 - Math.abs(i - 4.5) * 0.04;
    R.add('stone', new THREE.CylinderGeometry(0.075, 0.06, L, 4).translate(0, L / 2, 0).rotateZ(-s * a), s * 0.55, 2.0, -0.1 + (i % 2) * 0.12);
  }
}

// ------------------------------------------------------------------------------------------- the mandapa
function mandapa(F) {
  const cz = MAND_CZ, hx = 12.0, hz = 5.0;                                 // walls: x ±12.5, z −10.5 … 0.5 with the bays
  const H = F.sub(0, TERRACE, cz);
  const front = [[0, 2.6, 0.5, { niche: { w: 2.6, h: 4.0, sill: 0.4, door: true } }], [4.0, 7.6, 0.5, { niche: { w: 1.6, h: 3.4, sill: 0.8 } }], [9.0, hx, 0.5, { niche: { w: 1.5, h: 3.4, sill: 0.8 } }]];
  const side = [[0, 2.4, 0.5, { niche: { w: 2.2, h: 3.8, sill: 0.4, door: true } }], [3.6, hz, 0.5, {}]];
  const W = stepped(hx, hz, front.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  H.add('stone', ring(W, [[0.18, 0], [0.18, 0.3], [0.08, 0.36], [0.08, 0.5], [0, 0.55]]));       // the vedika at the foot of the wall
  const wt = 5.4, ph = 2.0;
  for (const [x0, x1, z0, z1] of [[-hx, hx, -hz, -hz + 0.8], [-hx, hx, hz - 0.8, hz], [-hx, -hx + 0.8, -hz, hz], [hx - 0.8, hx, -hz, hz]]) H.box('recess', x0, x1, 0.55, wt, z0, z1);
  H.box('void', -hx + 0.8, hx - 0.8, 0, 0.02, -hz + 0.8, hz - 0.8);
  H.add('void', cap(rect(hx - 0.8, hz - 0.8), wt - 0.01, 0, true));
  for (const x of [-6.6, -2.2, 2.2, 6.6]) for (const z of [-3.0, -1.0, 1.0, 3.0]) pillar(H.coarse(), x, z, 0, wt, 0.7, { brackets: 4 });   // the sixteen pillars
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    if (k === 2) return;                                                      // the back opens into the vimana
    wallFace(H.sub(0, 0, 0, ry).sub(0, 0, D), 0.55, wt, mirrorBays(k % 2 ? side : front), { cornerExt: 0.5, L, pilW: 0.4 });
  });
  prastara(H.sub(0, wt, 0), W, ph, { kudu: 2.0, kuduR: 0.34 });
  // the roof: the great lotus with four lions round it, inside a plastered hara
  const yr = wt + ph, Hp = H.remap(PLASTER);
  hara(Hp.sub(0, yr, 0), hx + 0.5, hz + 0.5, { w: 1.5, faces: [0, 1, 3] });
  lotus(Hp.sub(0, yr, 0), 2.6);
  for (const [x, z] of [[-5.2, -2.4], [5.2, -2.4], [5.2, 2.4], [-5.2, 2.4]]) lion(Hp.sub(x, yr, z, Math.atan2(x, z)), 'stone', 1.25);
  // porches: west (towards the bridge), north and south (with stairs down to the court)
  porch(F.sub(0, TERRACE, cz + hz + 0.5), 4.5, 2.0, [0, 1, 3]);
  for (const s of [-1, 1]) porch(F.sub(s * 13.9, TERRACE, cz, s * PI / 2), 3.0, 1.25, [0, 1, 3]);
  // south stair: a landing under the porch, then a flight running out into the court (+x)
  F.box('stone', 15.5, 17.6, 0, TERRACE, cz - 2.2, cz + 2.2);
  stair(F.sub(17.6, 0, cz, PI / 2), 2.0, TERRACE, 12);
  // north stair: landing, then a flight down towards the west (+z) along the plinth
  F.box('stone', -17.6, -15.5, 0, TERRACE, cz - 0.6, cz + 3.0);
  stair(F.sub(-16.55, 0, cz + 3.0), 1.05, TERRACE, 12);
}
// a flight of steps rising towards −z in its frame from z = n · tread (ground) to z = 0 (height h), half-width hw
function stair(F, hw, h, n) {
  const tr = 0.75;
  for (let k = 0; k < n; k++) F.box('stone', -hw, hw, 0, h * (n - k) / n, k * tr, (k + 1) * tr);
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.35, 0.9, n * tr * Math.hypot(1, h / (n * tr)) + 0.4);
    g.rotateX(Math.atan2(h, n * tr)); F.add('stone', g, s * (hw + 0.17), h / 2 + 0.55, n * tr / 2);
  }
}
function lotus(F, r) {
  F.add('stone', lathe([[r, 0], [r, 0.12], [r * 0.9, 0.2], [r * 0.62, 0.26], [r * 0.6, 0.34], [r * 0.3, 0.42], [r * 0.28, 0.5], [0, 0.55]], F.lite ? 12 : 24));
  if (!F.lite) for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; F.add('stone', new THREE.SphereGeometry(r * 0.18, 5, 3).scale(1, 0.35, 1.8), Math.sin(a) * r * 0.8, 0.2, Math.cos(a) * r * 0.8, a); }
}
// a pillared porch facing +z in its frame: hw half-width, d (half) depth from the wall at z = 0
function porch(F, hw, d, faces) {
  const lite = F.lite, h = 4.4;
  F.box('stone', -hw, hw, 0, 0.35, 0, d * 2);
  for (const x of lite ? [-hw + 0.5, hw - 0.5] : [-hw + 0.5, -hw * 0.36, hw * 0.36, hw - 0.5]) pillar(F, x, d * 2 - 0.5, 0.35, h, 0.62, { brackets: 2 });
  F.box('void', -hw + 0.6, hw - 0.6, 0.35, h, 0.05, 0.1);
  F.add('stone', ring(rect(hw, d), [[0, 0], [0, 0.4], [0.06, 0.45]]), 0, h, d);
  prastara(F.sub(0, h + 0.45, d), rect(hw, d), 1.4, { kudu: 1.8, kuduR: 0.24, edgeMin: 1.5 });
  F.add('shade', cap(rect(hw, d), h - 0.01, 0, true), 0, 0, d);
  hara(F.remap(PLASTER).sub(0, h + 1.85, d), hw, d, { w: 1.1, faces, wall: false });
}

// ------------------------------------------------------------------------------------------- the vimana
function vimana(F) {
  const lite = F.lite, hx = 7.4, hz = 6.4;
  const V = F.sub(0, TERRACE, VIM_CZ), Vp = V.remap(PLASTER), Vh = V.remap(PLASTER_HI);
  const side = [[0, 2.0, 0.9, { niche: { w: 1.8, h: 4.2, sill: 1.1 }, oct: true }], [3.0, 4.8, 0.6, { niche: { w: 1.2, h: 3.6, sill: 1.4 } }], [5.6, hz, 0.6, {}]];
  const back = [[0, 2.2, 0.9, { niche: { w: 1.9, h: 4.2, sill: 1.1 }, oct: true }], [3.2, 5.4, 0.6, { niche: { w: 1.3, h: 3.6, sill: 1.4 } }], [6.4, hx, 0.6, {}]];
  const W = stepped(hx, hz, back.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  V.add('stone', ring(W, [[0.22, 0], [0.22, 0.32], [0.1, 0.4], [0.1, 0.56], [0, 0.6]]));
  const wt = 8.0, ph = 2.2;
  V.box('recess', -hx, hx, 0.6, wt + 1, -hz, hz);
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    if (k === 0) return;                                                     // the front is the mandapa's
    wallFace(V.sub(0, 0, 0, ry).sub(0, 0, D), 0.6, wt, mirrorBays(k % 2 ? side : back), { cornerExt: 0.6, L, pilW: 0.44 });
  });
  prastara(Vp.sub(0, wt, 0), W, ph, { kudu: 1.9, kuduR: 0.36 });
  hara(Vp.sub(0, wt + ph, 0), hx + 0.6, hz + 0.6, { w: 1.6, bh: { L: 2.0, p: 0.3 } });
  // four talas
  let y = wt + ph;
  const tiers = [[6.6, 5.8], [5.4, 4.8], [4.2, 3.8], [3.2, 3.0]], TH = 2.6;
  tiers.forEach(([tx, tz], i) => {
    const G = i < 2 ? Vp : Vh, bx = Math.max(1.0, tx * 0.3), bz = Math.max(1.0, tz * 0.3), pr = 0.45;
    const T = stepped(tx, tz, [[0, bx, pr]], [[0, bz, pr]]);
    G.add('recess', ring(T, [[0, 0], [0, 1.55]]), 0, y, 0);
    prastara(G.sub(0, y + 1.55, 0), T, 1.05, { kudu: lite ? 0 : 2.0, kuduR: 0.22, over: 0.4, edgeMin: 1.2, mini: true });
    if (i < tiers.length - 1) hara(G.sub(0, y + TH, 0), tx, tz, { w: 1.45 - 0.1 * i, bh: { L: Math.min(bx, bz), p: pr } });
    y += TH;
  });
  // the octagonal griva with its niches, the octagonal shikhara and the stupi (rock-cut, like all the rest)
  Vh.add('stone', ring(octa(2.4), [[0.3, 0], [0.3, 0.2], [0, 0.3], [0, 1.15], [0.25, 1.3], [0.25, 1.4], [0, 1.45]]), 0, y, 0);
  for (let k = 0; k < 8; k++) { const S = Vh.sub(0, y, 0, k * PI / 4); S.box('shade', -0.4, 0.4, 0.32, 1.1, 2.4, 2.43); if (k % 2 === 0 && !lite) figure(S, 0, 0.34, 2.48, 0.8, { prabha: false, arms: 2 }); }
  shikhara(Vh.sub(0, y + 1.4, 0), { shape: 'oct', r: 3.1, h: 2.9, nasika: 0.32, crown: 'stone', crownH: 1.6 });
}

// ------------------------------------------------------------------------------------------- subsidiary shrines
function miniVimana(F, w, { niche = [0] } = {}) {
  const a = w / 2, Fp = F.remap(PLASTER);
  adhishthana(F, rect(a), 0.9, { blocks: false });
  F.box('recess', -a, a, 0.9, 3.6, -a, a);
  for (const { ry, L } of sides(a, a)) {
    const S = F.sub(0, 0, 0, ry).sub(0, 0, a);
    for (const s of [-1, 1]) pilaster(S, s * (L - 0.3), 0.9, 3.6, 0, { w: 0.34, d: 0.1, simple: true });
  }
  for (const ry of niche) {
    const S = F.sub(0, 0, 0, ry).sub(0, 0, a), nw = Math.min(0.55, a * 0.45);
    S.box('stone', -nw - 0.4, nw + 0.4, 0.9, 3.6, 0, 0.35);
    S.box('shade', -nw, nw, 1.2, 3.1, 0.35, 0.38);
    figure(S, 0, 1.2, 0.55, 1.7, { prabha: false });
  }
  prastara(Fp.sub(0, 3.6, 0), rect(a), 1.0, { kudu: 1.25, kuduR: 0.16, mini: true });
  hara(Fp.sub(0, 4.6, 0), a, a, { w: Math.min(0.95, w * 0.3), wall: false });
  Fp.box('recess', -a * 0.55, a * 0.55, 4.6, 5.8, -a * 0.55, a * 0.55);
  return shikhara(F.remap(PLASTER_HI).sub(0, 5.8, 0), { shape: 'square', r: a * 0.72, h: a * 0.8, nasika: 0.34, crown: 'stone', crownH: 0.8 });
}
function subShrines(F) {
  for (const s of [-1, 1]) for (const z of [-23.4, -14.6]) miniVimana(F.sub(s * 12.0, TERRACE, z), 3.6, { niche: [s * PI / 2] });
  miniVimana(F.sub(0, TERRACE, -25.45), 2.2, { niche: [PI] });     // the fifth, behind the vimana
}

// ------------------------------------------------------------------------------------------- Nandi mandapa
function nandiMandapa(F) {
  const cz = 10.25, N = F.sub(0, 0, cz);
  const PL = stepped(4.5, 4.0, [[0, 1.4, 0.3]], [[0, 1.6, 0.3]]);
  animalPlinth(N, PL, 4.8, 4.25, { skip: [[0, -2.8, 2.8]], pitch: 2.2, faces: [0, 1, 3], seed: 9, lionEvery: 3 });
  gajaLakshmi(N.sub(0, 0, 4.25), 6.0);
  // the upper storey: walls with pierced (jali) windows, doors west and east, a flat roof with a lion parapet
  const U = N.sub(0, TERRACE, 0), Up = U.remap(PLASTER), hx = 3.4, hz = 3.2;
  const face = [[0, 1.2, 0.3, { niche: { w: 1.7, h: 3.0, sill: 0.2, door: true } }], [2.2, hx, 0.3, {}]];
  const side = [[0, 1.3, 0.3, { niche: { w: 1.4, h: 2.6, sill: 0.6 } }], [2.2, hz, 0.3, {}]];
  const W = stepped(hx, hz, face.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  U.add('stone', ring(W, [[0.15, 0], [0.15, 0.25], [0, 0.4]]));
  U.box('recess', -hx, hx, 0.4, 4.4, -hz, hz);
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    const S = U.sub(0, 0, 0, ry).sub(0, 0, D);
    wallFace(S, 0.4, 4.2, mirrorBays(k % 2 ? side : face), { cornerExt: 0.3, L, pilW: 0.34, recessKP: !F.lite, figures: false });
    if (k % 2 && !F.lite) for (let i = 0; i < 4; i++) S.box('stone', -0.7, 0.7, 1.15 + i * 0.6, 1.25 + i * 0.6, 0.0, 0.3);   // the jali bars
  });
  prastara(Up.sub(0, 4.2, 0), W, 1.4, { kudu: 1.6, kuduR: 0.24 });
  // flat roof: parapet wall with seated lions at the corners and the middle of each side
  const yr = 5.6;
  Up.add('stone', ring(rect(hx + 0.35, hz + 0.35), [[0, 0], [0, 0.7], [0.12, 0.75], [0.12, 0.9], [0, 0.9]]), 0, yr, 0);
  Up.add('stone', cap(rect(hx + 0.35, hz + 0.35), yr + 0.3));
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
    lion(Up.sub(x * (hx - 0.1), yr + 0.3, z * (hz - 0.1), Math.atan2(x, z)), 'stone', 0.85);
  }
  Up.add('stone', lathe([[1.0, 0], [1.0, 0.25], [0.75, 0.4], [0.3, 0.55], [0, 0.6]], F.lite ? 8 : 16), 0, yr + 0.3, 0);
}
// Gaja-Lakshmi: the goddess on her lotus, two pairs of elephants pouring water over her, a lotus pond below
function gajaLakshmi(S, w) {
  const lite = S.lite, y0 = 1.25, y1 = 5.9, dep = 1.2;
  S.box('stone', -w / 2 - 0.5, -w / 2, y0 - 0.2, y1 + 0.5, 0, dep); S.box('stone', w / 2, w / 2 + 0.5, y0 - 0.2, y1 + 0.5, 0, dep);
  S.box('stone', -w / 2 - 0.6, w / 2 + 0.6, y1, y1 + 0.55, 0, dep + 0.15);
  S.box('shade', -w / 2, w / 2, y0, y1, 0, 0.05);
  S.box('frieze', -w / 2, w / 2, y0 - 0.2, y0 + 0.5, 0, dep);                                    // the pond
  if (!lite) for (let i = 0; i < 9; i++) S.add('stone', new THREE.SphereGeometry(0.2, 6, 4).scale(1, 0.5, 1), -w / 2 + 0.4 + i * (w - 0.8) / 8, y0 + 0.55, dep * 0.6);
  S.add('stone', lathe([[0.75, 0], [0.9, 0.15], [0.6, 0.3], [0, 0.32]], 10), 0, y0 + 0.5, 0.55);   // the lotus seat
  S.add('stone', new THREE.BoxGeometry(0.9, 0.5, 0.6), 0, y0 + 1.07, 0.5);                     // crossed legs
  figure(S, 0, y0 + 0.82, 0.45, 2.3, { arms: 4, prabha: true });
  for (const s of [-1, 1]) {
    S.add('stone', new THREE.CylinderGeometry(0.06, 0.08, 2.4, 5), s * 1.6, y0 + 1.7, 0.3);       // lotus stems
    elephant(S.sub(s * 1.95, y0 + 0.5, 0.55, -s * PI / 2), 'stone', 0.42, { pose: 2, pedestal: false, caparison: false });
    elephant(S.sub(s * 1.45, y0 + 2.75, 0.45, -s * PI / 2), 'stone', 0.36, { pose: 2, pedestal: false, caparison: false });
  }
}
function bridges(F) {
  for (const [z0, z1] of [[MAND_CZ + 5.5 + 4.0, 6.0], [14.5, 16.2]]) bridge(F, -2.0, 2.0, z0, z1, 'z');
}
// a rock bridge (deck at the terrace level, parapets, a soffit in shade) along x or z
function bridge(F, a0, a1, b0, b1, axis) {
  const B = axis === 'z' ? (x0, x1, y0, y1, z0, z1, k = 'stone') => F.box(k, x0, x1, y0, y1, z0, z1) : (x0, x1, y0, y1, z0, z1, k = 'stone') => F.box(k, z0, z1, y0, y1, x0, x1);
  const c = (a0 + a1) / 2, hw = (a1 - a0) / 2;
  B(a0, a1, 6.5, TERRACE, b0 - 0.05, b1 + 0.05);
  B(a0 + 0.1, a1 - 0.1, 6.48, 6.5, b0, b1, 'shade');
  for (const s of [-1, 1]) {
    B(c + s * (hw - 0.3), c + s * (hw + 0.05), TERRACE, TERRACE + 0.85, b0, b1);
    B(c + s * (hw - 0.38), c + s * (hw + 0.12), TERRACE + 0.85, TERRACE + 1.0, b0, b1);
    B(c + s * (hw - 0.1), c + s * (hw + 0.15), 6.3, 6.6, b0, b1);
  }
}

// ------------------------------------------------------------------------------------------- gateway and screen wall
function gateway(F) {
  const lite = F.lite, cz = 18.05, hx = 6.2, hz = 1.75;
  const G = F.sub(0, 0, cz), Gp = G.remap(PLASTER);
  const face = [[0, 1.8, 0.25, { niche: { w: 3.0, h: 5.2, sill: 0, door: true } }], [2.6, 4.6, 0.25, { niche: { w: 1.4, h: 3.6, sill: 0.8 } }], [5.2, hx, 0.25, {}]];
  const side = [[0, hz, 0.25, {}]];
  const W = stepped(hx, hz, face.map(([a, b, p]) => [a, b, p]), side.map(([a, b, p]) => [a, b, p]));
  adhishthana(G, W, 1.4, { blocks: !lite });
  G.box('recess', -hx, hx, 1.4, 7.4, -hz, hz);
  G.box('void', -1.5, 1.5, 1.4, 6.6, -hz - 0.3, hz + 0.3);                  // the passage
  sides(hx, hz).forEach(({ ry, D, L }, k) => { if (k % 2 === 0) wallFace(G.sub(0, 0, 0, ry).sub(0, 0, D), 1.4, 7.2, mirrorBays(face), { cornerExt: 0.25, L, pilW: 0.36 }); });
  prastara(G.sub(0, 7.2, 0), W, 1.5, { kudu: 1.8, kuduR: 0.26 });
  // the upper storey: a wall with windows and pilasters under the barrel-vaulted wagon roof with its kudu gables
  const y2 = 8.7, ux = 4.6, uz = 1.35;
  Gp.add('stone', ring(rect(ux, uz), [[0.15, 0], [0.15, 0.3], [0, 0.4]]), 0, y2, 0);
  Gp.box('recess', -ux, ux, y2 + 0.4, y2 + 2.3, -uz, uz);
  for (const s of [-1, 1]) {
    const S = Gp.sub(0, 0, 0, s > 0 ? 0 : PI).sub(0, 0, uz);
    for (let i = -3; i <= 3; i++) pilaster(S, i * 1.3, y2 + 0.4, y2 + 2.3, 0, { w: 0.3, d: 0.1, simple: true });
    for (const x of [-1.95, 0, 1.95]) { S.box('void', x - 0.35, x + 0.35, y2 + 0.8, y2 + 1.9, 0, 0.04); kudu1(S, x, y2 + 1.95, 0.05, 0.38, { face: false, mini: lite }); }
  }
  Gp.add('stone', ring(rect(ux, uz), [[0, 0], [0.35, 0.08], [0.45, 0.3], [0.35, 0.45], [0, 0.5]]), 0, y2 + 2.3, 0);
  const vr = 1.6, vy = y2 + 2.8;
  Gp.add('stone', new THREE.CylinderGeometry(vr, vr, 2 * ux - 0.2, lite ? 8 : 14, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 1.3, 1), 0, vy, 0);
  for (const s of [-1, 1]) {
    kudu1(Gp.sub(s * (ux - 0.1), vy - 0.2, 0, s * PI / 2), 0, 0, 0.02, 1.2, { face: true, tube: 0.16 });
    Gp.add('stone', new THREE.TorusGeometry(vr * 1.02, 0.12, 3, 10, PI).rotateY(PI / 2).scale(1, 1.3, 1), s * (ux - 0.1), vy, 0);
  }
  for (let i = 0; i < 5; i++) Gp.add('stone', lathe([[0.32, 0], [0.4, 0.2], [0.18, 0.45], [0.24, 0.55], [0, 0.95]], lite ? 5 : 8), -3.2 + i * 1.6, vy + vr * 1.3 - 0.05, 0);   // stupis on the ridge
  // the screen wall to the trench sides, with pilasters, a coping and little kutas
  for (const s of [-1, 1]) {
    const x0 = s * (hx + 0.2), x1 = s * (K.X1 - 0.3), z0 = 18.9, z1 = 19.9, h = 4.6;
    F.box('stone', Math.min(x0, x1), Math.max(x0, x1), 0, 0.6, z0 - 0.25, z1 + 0.25);
    F.box('recess', Math.min(x0, x1), Math.max(x0, x1), 0.6, h, z0, z1);
    F.add('stone', ring(rect(Math.abs(x1 - x0) / 2, (z1 - z0) / 2), [[0, 0], [0.25, 0.08], [0.3, 0.3], [0.1, 0.42], [0, 0.42]]), (x0 + x1) / 2, h, (z0 + z1) / 2);
    const step = lite ? 5.2 : 2.6;
    for (let x = Math.abs(x0) + 1.4; x < Math.abs(x1) - 0.6; x += step) {
      for (const zz of [z1, z0]) pilaster(F.sub(0, 0, zz, zz === z0 ? PI : 0), (zz === z0 ? -1 : 1) * s * x, 0.6, h, 0, { w: 0.4, d: 0.12, simple: true });
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
  F.add('stone', flat(new THREE.CylinderGeometry(0.58, 0.64, 3.4, seg)), 0, 11.7, 0);                    // sixteen-sided (fluted facets)
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
// pillared galleries cut into the cliff: dark backs, sculpted panels alternating with doorways into deep cells
function gallery(S, u0, u1, y0, y1, depth) {
  const lite = S.lite, L = (u1 - u0) / 2, c = (u0 + u1) / 2, G = S.sub(c, 0, 0);
  G.box('void', -L, L, y0, y1 - 0.2, -0.35, 0.1);
  G.box('stone', -L, L, y0 - 0.05, y0 + 0.25, 0, depth);
  const n = Math.max(2, Math.round(2 * L / 3.6)), pitch = 2 * L / n;
  for (let i = 0; i <= n; i += lite ? 2 : 1) {
    const u = -L + i * pitch;
    pillar(G, u, depth - 0.55, y0 + 0.25, y1 - 1.1, 0.75, { brackets: 2, ry: PI / 2 });
    if (i < n && !lite) {
      if (i % 3 === 1) { G.box('shade', u + 0.6, u + pitch - 0.6, y0 + 0.25, y1 - 1.3, 0.1, 0.13); G.box('void', u + pitch / 2 - 0.6, u + pitch / 2 + 0.6, y0 + 0.25, y0 + 2.9, 0.13, 0.16); }   // a doorway into a cell
      else G.box('frieze', u + 0.7, u + pitch - 0.7, y0 + 0.8, y1 - 1.6, 0.1, 0.18);                // sculpted panel
    }
  }
  prastara(G.sub(0, y1 - 1.1, depth / 2), rect(L, depth / 2), 1.1, { kudu: lite ? 0 : 2.4, kuduR: 0.2, mini: true, edgeMin: 3 });
  G.add('shade', cap(rect(L, depth / 2), y1 - 1.11, 0, true), 0, 0, depth / 2);
}
function cloisters(F) {
  const zs0 = K.Z0 + 1, zs1 = K.Z1 - 2, zc = (zs0 + zs1) / 2, Ls = (zs1 - zs0) / 2;
  // frames whose +z faces the court, the cliff face at z = 0, u along the wall
  const N = F.sub(K.X0, 0, zc, PI / 2), S = F.sub(K.X1, 0, zc, -PI / 2), B = F.sub(0, 0, K.Z0, 0);
  const Lb = (K.X1 - K.X0 - 2) / 2;
  for (const [y0, y1] of [[0, 8.4], [8.4, 15.4], [15.4, 22.0]]) gallery(B, -Lb, Lb, y0, y1, 1.8);   // the back: three storeys
  for (const [y0, y1] of [[0, 8.4], [8.4, 15.4]]) gallery(S, -Ls, Ls, y0, y1, 2.4);                  // south: two storeys
  gallery(N, -Ls, Ls, 0, 8.4, 2.4);                                                                     // north: the lower gallery
  // north, upper level: the Lankeshvara cave (its facade between u = −(z − zc) bounds), and its bridge
  const ua = -(-1.0 - zc), ub = -(-21.0 - zc);
  lankeshvara(N, Math.min(ua, ub), Math.max(ua, ub));
  bridge(F, -6.4, -3.6, K.X0 + 3.6, -16.4, 'x');
}
function lankeshvara(S, u0, u1) {
  const lite = S.lite, c = (u0 + u1) / 2, L = (u1 - u0) / 2, G = S.sub(c, 0, 0), y0 = 8.4, y1 = 17.2, dep = 3.6;
  G.box('void', -L, L, y0, y1 - 0.3, -0.4, 0.1);
  for (const x of lite ? [] : [-L * 0.5, 0, L * 0.5]) pillar(G, x, 1.0, y0 + 0.5, y1 - 1.4, 0.8, { brackets: 4 });   // the inner row, deep in shadow
  G.box('stone', -L, L, y0 - 0.1, y0 + 0.5, 0, dep);                                                  // floor
  G.box('stone', -L, L, y0 + 0.5, y0 + 1.5, dep - 0.45, dep);                                        // parapet with a relief band
  G.box('frieze', -L + 0.2, L - 0.2, y0 + 0.7, y0 + 1.35, dep, dep + 0.05);
  const n = 8;
  for (let i = 0; i <= n; i++) pillar(G, -L + 0.6 + i * (2 * L - 1.2) / n, dep - 0.7, y0 + 0.5, y1 - 1.4, 0.95, { brackets: 2, ry: PI / 2 });
  prastara(G.sub(0, y1 - 1.4, dep / 2), rect(L, dep / 2), 1.4, { kudu: lite ? 0 : 2.2, kuduR: 0.26, edgeMin: 3 });
  G.add('shade', cap(rect(L, dep / 2), y1 - 1.41, 0, true), 0, 0, dep / 2);
  hara(G.remap(PLASTER).sub(0, y1, dep / 2), L, dep / 2 - 0.2, { w: 1.2, faces: [0], wall: false });
}
