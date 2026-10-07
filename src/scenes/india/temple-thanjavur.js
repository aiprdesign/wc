// Brihadeeswarar, Thanjavur (Rajaraja I, 1010) — high-detail model for the Architecture chapter
// (src/scenes/india/temples.js). buildTower(P, M, { lite }) adds parts to P (a Parts list from temples-assets.js,
// one merged mesh per material key) in the monument's own frame (metres, front = +z = east); it registers the
// carved / shaded granite variants on M (thanjavurFrieze, thanjavurScript, thanjavurShade, thanjavurRecess,
// thanjavurVoid). The Dravidian vocabulary lives in temple-dravida-detail.js.
//
// The 66 m vimana, from the ground up:
//   upapitha and adhishthana (the inscribed jagati, kumuda, kantha with its frieze, pattika) round the stepped plan
//   two storeys of moulded wall (the sanctum and its upper circumambulatory): five bays to a face — karna (corner),
//     pratibhadra, bhadra — each with a deep devakoshtha niche, its figure, flanking pilasters and a kudu pediment;
//     square and octagonal pilasters with kalasha-kumbha-padma capitals and pushpapotika brackets; kumbha-panjaras
//     in the recesses; each storey capped by a prastara (valabhi frieze, kapota with kudus, vyalamala)
//   the hara of miniature shrines on the second storey, then 13 diminishing talas, each with its kapota and hara
//     (karnakutas, the wide central shala on the projecting band that runs up each face, panjaras and small shalas)
//   the square platform with a pair of Nandis at each corner, the octagonal griva with its niches, the octagonal
//     domed shikhara with four great nasikas, the lotus and the gilded kalasha
// In front (east): the ardhamandapa and mahamandapa on the same moulded base, with niches, a doorway with its
// guardians and steps; the Nandi mandapa with its colossal bull; the back range of the cloister.
import * as THREE from 'three';
import {
  Frame, dravidaMaterials, rect, octa, stepped, ring, cap, sides, adhishthana, prastara, wallFace, mirrorBays, hara,
  shikhara, pilaster, pillar, figure, nandi, lathe,
} from './temple-dravida-detail.js';

const PI = Math.PI;
const S0 = 14.6;            // the base wall plane of the vimana (half side); bays project to 15.5 / 15.9
const TIER0 = 15.4, TIER_H = 3.0, NT = 13;

export function buildTower(P, M, { lite = false } = {}) {
  dravidaMaterials(M, 'thanjavur', 'granite', { shade: '#7e6046', recess: '#cfae86', void: '#1f150e' });
  const F = new Frame(P, { stone: 'granite', recess: 'thanjavurRecess', shade: 'thanjavurShade', frieze: 'thanjavurFrieze', script: 'thanjavurScript', void: 'thanjavurVoid', gold: 'gold' }, { lite });
  vimana(F);
  halls(F);
  nandiMandapa(F);
  cloister(F);
}

// ------------------------------------------------------------------------------------------- the vimana
function vimana(F) {
  const lite = F.lite;
  // upapitha (sub-base)
  F.add('stone', ring(rect(16.7), [[0.12, 0], [0.12, 0.42], [0, 0.45], [-0.2, 0.5], [-0.2, 0.72], [-0.42, 0.9]]));
  F.add('stone', cap(rect(16.28), 0.9));
  // the two storeys of the wall: bay layout of one face (u ≥ 0 half): bhadra, pratibhadra, karna
  const half = (pb, p, nh) => [
    [0, 3.8, pb, { niche: { w: 2.1, h: nh + 0.35, sill: 0.42 }, oct: true }],
    [5.0, 10.0, p, { niche: { w: 1.6, h: nh, sill: 0.55 }, oct: false }],
    [11.2, S0, p, { niche: { w: 1.5, h: nh, sill: 0.55 }, oct: true }],
  ];
  const H1 = half(1.3, 0.9, 2.95), H2 = half(1.1, 0.7, 2.45);
  const W1 = stepped(S0, S0, H1.map(([a, b, p]) => [a, b, p])), W2 = stepped(S0, S0, H2.map(([a, b, p]) => [a, b, p]));
  adhishthana(F.sub(0, 0.9, 0), W1, 2.3, { script: true, top: false });
  F.box('recess', -S0, S0, 3.2, TIER0, -S0, S0);                                     // the core of the wall
  for (const { ry } of sides(S0, S0)) {
    const S = F.sub(0, 0, 0, ry).sub(0, 0, S0);
    wallFace(S, 3.2, 7.6, mirrorBays(H1), { cornerExt: 0.9, L: S0 });
    wallFace(S, 9.9, 13.6, mirrorBays(H2), { cornerExt: 0.7, L: S0, figures: !lite });
  }
  prastara(F.sub(0, 7.6, 0), W1, 1.8, { kudu: 1.9, kuduR: 0.34 });
  F.add('stone', ring(W2, [[0.16, 0], [0.16, 0.26], [0.06, 0.32], [0.06, 0.44], [0, 0.5]]), 0, 9.4, 0);   // vedika of the upper storey
  prastara(F.sub(0, 13.6, 0), W2, 1.8, { kudu: 1.9, kuduR: 0.34 });
  hara(F.sub(0, TIER0, 0), S0 + 0.7, S0 + 0.7, { w: 2.15, bh: { L: 3.8, p: 0.4 } });

  // thirteen talas
  let y = TIER0;
  for (let i = 0; i < NT; i++) {
    const s = 13.9 - 0.7 * i, b = Math.max(1.5, s * 0.3), pr = 0.6;
    const T = stepped(s, s, [[0, b, pr]]);
    F.add('recess', ring(T, [[0, 0], [0, 1.85]]), 0, y, 0);
    prastara(F.sub(0, y + 1.85, 0), T, 1.15, { kudu: lite ? 0 : (i < 7 ? 2.3 : 2.8), kuduR: 0.24, over: 0.42, edgeMin: 1.2 });
    if (i < NT - 1) hara(F.sub(0, y + TIER_H, 0), s, s, { w: 1.95 - 0.03 * i, bh: { L: b, p: pr } });
    y += TIER_H;
  }
  // the platform with its four pairs of Nandis
  const yt = y;
  F.add('stone', ring(rect(6.1), [[0, 0], [0.22, 0.1], [0.22, 0.48], [0, 0.6]]), 0, yt, 0);
  F.add('stone', cap(rect(6.1), yt + 0.6));
  for (const [cx, cz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    nandi(F.sub(cx * 5.15, yt + 0.6, cz * 3.55, cz > 0 ? 0 : PI), 'stone', 0.82);
    nandi(F.sub(cx * 3.55, yt + 0.6, cz * 5.15, cx > 0 ? PI / 2 : -PI / 2), 'stone', 0.82);
  }
  // the griva: octagonal neck with mouldings, niches and figures on the eight faces
  const yg = yt + 0.6;
  F.add('stone', ring(octa(4.1), [[0.32, 0], [0.32, 0.28], [0.1, 0.34], [0, 0.42], [0, 2.18], [0.18, 2.24], [0.34, 2.42], [0.34, 2.6], [0, 2.7]]), 0, yg, 0);
  F.add('recess', cap(octa(4.1), yg + 1.0));   // (hidden inside; keeps the neck closed if seen through a gap)
  for (let k = 0; k < 8; k++) {
    const S = F.sub(0, yg, 0, k * PI / 4);
    S.box('shade', -0.55, 0.55, 0.55, 2.0, 4.1, 4.13);
    if (!lite) { for (const s of [-1, 1]) pilaster(S, s * 0.85, 0.42, 2.18, 4.1, { w: 0.28, d: 0.09, bracket: false }); }
    if (k % 2 === 0) figure(S, 0, 0.6, 4.25, 1.3, { prabha: false });
  }
  // the shikhara and kalasha (to c. 66 m)
  shikhara(F.sub(0, yg + 2.7, 0), { shape: 'oct', r: 5.0, h: 5.1, nasika: 0.3, crown: 'gold', crownH: 3.05 });
}

// ------------------------------------------------------------------------------------------- the halls
// a hall in the vimana's manner: moulded base, wall in bays, prastara, hara on the roof edge
function hall(F, { cz, hx, hz, base, wallTop, prH = 1.6, side, front = null, back = null, haraW = 1.5, faces = [0, 1, 2, 3] }) {
  const H = F.sub(0, 0, cz);
  const bx = (front ?? back ?? []).map(([a, b, p]) => [a, b, p]), bz = side.map(([a, b, p]) => [a, b, p]);
  const W = stepped(hx, hz, bx, bz);
  adhishthana(H, W, base, { top: true });
  H.box('recess', -hx, hx, base, wallTop + prH * 0.5, -hz, hz);
  const faceBays = [front, side, back, side], Ls = [hx, hz, hx, hz];
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    const bays = faceBays[k];
    if (!faces.includes(k) || !bays) return;
    const nk = (k + 1) % 4, ext = (faceBays[nk] ?? []).find((b) => b[1] >= Ls[nk] - 1e-6)?.[2] ?? 0;
    wallFace(H.sub(0, 0, 0, ry).sub(0, 0, D), base, wallTop, mirrorBays(bays), { cornerExt: ext, L });
  });
  prastara(H.sub(0, wallTop, 0), W, prH, { kudu: 2.0, kuduR: 0.3 });
  hara(H.sub(0, wallTop + prH, 0), hx + 0.3, hz + 0.3, { w: haraW, faces });
  return H;
}
function halls(F) {
  // ardhamandapa (between the sanctum and the great hall): only its flanks show
  hall(F, { cz: 20.5, hx: 8.2, hz: 5.0, base: 2.8, wallTop: 9.2, prH: 1.7,
    side: [[0, 1.9, 0.7, { niche: { w: 1.6, h: 3.6, sill: 0.8 } }], [3.0, 5.0, 0.5, {}]], faces: [1, 3] });
  // mahamandapa: niches along the flanks, the doorway with its two guardians on the east
  hall(F, { cz: 39.5, hx: 10.8, hz: 14.0, base: 2.8, wallTop: 8.8, prH: 1.7,
    side: [[0, 3.6, 0.9, { niche: { w: 2.0, h: 3.6, sill: 0.6 }, oct: true }], [4.8, 9.0, 0.6, { niche: { w: 1.6, h: 3.2, sill: 0.8 } }], [10.2, 14.0, 0.6, { niche: { w: 1.5, h: 3.2, sill: 0.8 } }]],
    front: [[0, 3.2, 0.9, { niche: { w: 3.4, h: 5.0, sill: 0.0, door: true }, oct: true }], [4.4, 7.6, 0.6, { niche: { w: 1.9, h: 4.1, sill: 0.35 } }], [8.8, 10.8, 0.6, {}]],
    back: [[8.6, 10.8, 0.6, {}]], faces: [0, 1, 2, 3] });
  // the steps up to the doorway
  for (let k = 0; k < 7; k++) F.box('stone', -3.0, 3.0, 0, 2.8 - k * 0.4, 53.5 + 0.9 + 0.2, 53.5 + 0.9 + 0.75 + k * 0.55);
  for (const s of [-1, 1]) F.box('stone', s * 3.0, s * 3.6, 0, 3.3, 53.6, 54.5 + 0.75 + 6 * 0.55);
}

// ------------------------------------------------------------------------------------------- the Nandi mandapa
function nandiMandapa(F) {
  const NZ = 15.5 + 62, N = F.sub(0, 0, NZ);
  adhishthana(N, rect(6.0), 1.6, { top: true, blocks: !F.lite });
  for (const [x, z] of [[-4.7, -4.7], [4.7, -4.7], [4.7, 4.7], [-4.7, 4.7], [-1.6, 4.7], [1.6, 4.7], [-1.6, -4.7], [1.6, -4.7], [4.7, -1.6], [4.7, 1.6], [-4.7, -1.6], [-4.7, 1.6]]) {
    pillar(N, x, z, 1.6, 7.4, 0.78, { brackets: 4 });
  }
  // beams, kapota and a flat roof with a parapet of little shrines
  N.add('stone', ring(rect(5.1), [[0, 0], [0, 0.45], [0.1, 0.5], [0.1, 0.6]]), 0, 7.4, 0);
  prastara(N.sub(0, 8.0, 0), rect(5.1), 1.3, { kudu: 2.2, kuduR: 0.24, over: 0.5 });
  N.add('shade', cap(rect(5.1), 7.39, 0, true));
  hara(N.sub(0, 9.3, 0), 5.3, 5.3, { w: 1.2, wall: false });
  N.box('stone', -2.2, 2.2, 9.3, 10.0, -2.2, 2.2);
  N.add('stone', lathe([[2.0, 0], [2.0, 0.3], [1.5, 0.9], [0.6, 1.3], [0, 1.4]], F.lite ? 8 : 16), 0, 10.0, 0);
  N.add('gold', lathe([[0.3, 0], [0.42, 0.25], [0.2, 0.55], [0, 0.9]], 10), 0, 11.35, 0);
  // the colossal bull (c. 6 m long) on its pedestal, facing the sanctum
  N.box('stone', -1.9, 1.9, 1.6, 2.3, -3.0, 3.2);
  nandi(N.sub(0, 2.3, 0, PI), 'stone', 2.55, { plinth: false });
}

// ------------------------------------------------------------------------------------------- the cloister (back range)
function cloister(F) {
  const z0 = -58, z1 = -54, x0 = -55, x1 = 55;
  F.box('stone', x0, x1, 0, 1.0, z0, z1 + 0.6);                    // plinth
  F.box('recess', x0, x1, 1.0, 6.0, z0, z0 + 1.2);                 // back wall
  F.box('shade', x0 + 0.5, x1 - 0.5, 1.0, 5.6, z0 + 1.2, z0 + 1.25);
  const step = F.lite ? 6.8 : 3.4;
  for (let x = x0 + 1.7; x < x1 - 1; x += step) pillar(F, x, z1 - 0.2, 1.0, 5.4, 0.55, { brackets: 2 });
  F.add('stone', ring(rect(55, 2.0), [[0, 0], [0.3, 0.06], [0.42, 0.25], [0.3, 0.45], [0.05, 0.55], [0.05, 0.9], [0, 0.9]]), 0, 5.4, -56);
  F.add('stone', cap(rect(55, 2.0), 6.3, 0.0));
  F.add('shade', cap(rect(55, 2.0), 5.39, 0, true));
  if (!F.lite) for (let x = x0 + 2; x < x1; x += 4.4) F.add('stone', lathe([[0.3, 0], [0.35, 0.25], [0.15, 0.5], [0, 0.8]], 6), x, 6.3, z1 - 0.4);
}
