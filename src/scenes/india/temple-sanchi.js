// Great Stupa, Sanchi — high-detail model for the Architecture chapter (src/scenes/india/temples.js).
// buildStupa(P, M, { lite }) adds parts to P (a Parts list from temples-assets.js, one merged mesh per material
// key) in the monument's own frame (metres; +z = south, towards the opening camera; +x = east) and registers
// its materials on M (sanchiStone, sanchiRelief, sanchiDome, sanchiAshlar, sanchiPave: temple-sanchi-detail.js).
//
// What is modelled (dimensions after the monument as restored: anda 36.6 m across, 16.5 m high):
//   · the medhi (raised terrace, 4.3 m) with moulded plinth, battered wall and cornice, faced in coursed stone,
//     its paved berm (upper processional path) and its own railing: square posts, three lens-section crossbars
//     (suchi) and a rounded coping (ushnisha), broken at the head of the stairs
//   · the anda: a hemisphere truncated and flattened at the top, its surface subtly uneven, faced with
//     running-bond stone courses (shader), weathering streaks and lichen
//   · the double staircase on the south: two flights rising towards a central landing, a stringer parapet
//     and a sloping balustrade of the same railing type, tread slabs with nosings
//   · the harmika: plinth, square railing (posts, three crossbars, coping), the shaft (yashti) on its block
//     and the three-tiered chhatra of moulded stone discs, finial
//   · the ground vedika: octagonal posts 3.2 m high with coping, three lens crossbars, open at the four
//     cardinal entrances, each entrance enclosed by L-shaped returns running out to the gateway pillars;
//     the paved ground processional path inside it
//   · the four toranas (10.8 m): square pillars carved with panels on all four faces (relief atlas), abacus,
//     capitals of four animals back to back — lions on the south, elephants with riders on the east and
//     north, pot-bellied dwarfs on the west — three bowed architraves carved with friezes and ending in
//     spiral volutes that overhang the pillars, square dies between them over the pillars, carved balusters
//     in the central spans and riders on elephants and horses over the overhangs, shalabhanjika tree-nymph
//     brackets at the outer corners, and the crown: the dharmachakra on its pedestal flanked by chauri-bearing
//     yakshas, triratna emblems over the pillars and animals at the ends
// The south gateway (the camera's opening subject) and the stairs carry the most detail; `lite` keeps the
// silhouettes with coarser curves and fewer small figures (about a third of the triangles).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from '../../lib/noise.js';
import {
  G, S, bow, sanchiMaterials, chamferBox, lensProfile, copingProfile, ringSweep, lineSweep,
  elephantGeo, lionGeo, dwarfGeo, horseGeo, humanGeo, shalabhanjikaGeo, triratnaGeo, chakraGeo, spiralGeo,
} from './temple-sanchi-detail.js';

const STONE = 'sanchiStone', RELIEF = 'sanchiRelief', DOME = 'sanchiDome', ASHLAR = 'sanchiAshlar', PAVE = 'sanchiPave';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
// add a copy of g with a full transform (rotation order: z lean, then x, then y heading)
function put(P, key, g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  const sc = Array.isArray(s) ? V3(...s) : V3(s, s, s);
  _m.compose(V3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), sc);
  return P.add(key, g.clone().applyMatrix4(_m));
}

// ------------------------------------------------------------------------------------------- railings
// vedika dimensions: posts (w, octagonal?, height), crossbars [centre, height] and thickness, coping
// [bottom, top, width], post spacing — all relative to the railing's base
const VEDIKA = { w: 0.48, oct: true, h: 2.64, bars: [[0.8, 0.52], [1.43, 0.52], [2.06, 0.52]], bw: 0.17, cope: [2.6, 3.2, 0.54], sp: 1.12 };
const MEDHI_RAIL = { w: 0.22, oct: false, h: 1.28, bars: [[0.36, 0.24], [0.66, 0.24], [0.96, 0.24]], bw: 0.09, cope: [1.22, 1.5, 0.28], sp: 0.6 };
const HARMIKA_RAIL = { w: 0.21, oct: false, h: 1.34, bars: [[0.4, 0.27], [0.72, 0.27], [1.04, 0.27]], bw: 0.09, cope: [1.3, 1.64, 0.3], sp: 0.5 };
const STAIR_RAIL = { w: 0.2, oct: false, h: 1.06, bars: [[0.3, 0.2], [0.56, 0.2], [0.82, 0.2]], bw: 0.08, cope: [1.0, 1.24, 0.26], sp: 0.62 };

function postGeo(R, h) {
  if (R.oct) { const r = R.w / 2 / Math.cos(Math.PI / 8); const g = new THREE.CylinderGeometry(r, r, h, 8, 1, true); g.rotateY(Math.PI / 8); g.translate(0, h / 2, 0); return g; }
  const g = chamferBox(R.w, h, R.w * 1.15, 0.025); g.translate(0, h / 2, 0); return g;
}
// closed end of a swept profile (a flat fan), facing along `dir`
function profileCap(profile, at, across, dir) {
  const pos = [], c = [0, 0]; for (const [x, y] of profile) { c[0] += x / profile.length; c[1] += y / profile.length; }
  const P = ([x, y]) => at.clone().addScaledVector(across, x).add(V3(0, y, 0));
  for (let i = 0; i < profile.length; i++) {
    const a = P(c), b = P(profile[i]), d = P(profile[(i + 1) % profile.length]);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const tri = n.dot(dir) >= 0 ? [a, b, d] : [a, d, b];
    for (const v of tri) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function railArc(P, Rr, a0, a1, y0, R, { segLen = 0.5, endPosts = true } = {}) {
  const L = Math.abs(a1 - a0) * Rr, segs = Math.max(2, Math.ceil(L / segLen));
  const n = Math.max(1, Math.round(L / R.sp)), post = postGeo(R, R.h);
  for (let i = endPosts ? 0 : 1; i <= (endPosts ? n : n - 1); i++) { const a = a0 + (a1 - a0) * i / n; P.add(STONE, post, Math.cos(a) * Rr, y0, Math.sin(a) * Rr, -a - Math.PI / 2); }
  const profs = [...R.bars.map(([yc, hh]) => [lensProfile(R.bw, hh, 10), yc]), [copingProfile(R.cope[2], R.cope[1] - R.cope[0], 8), R.cope[0]]];
  for (const [pr, yy] of profs) {
    P.add(STONE, ringSweep(pr, Rr, a0, a1, y0 + yy, segs));
    for (const [a, sg] of [[a0, -1], [a1, 1]]) {
      const c = Math.cos(a), s = Math.sin(a), tang = V3(-s, 0, c).multiplyScalar(sg * Math.sign(a1 - a0));
      P.add(STONE, profileCap(pr, V3(c * Rr, y0 + yy, s * Rr), V3(c, 0, s), tang));
    }
  }
}
// straight run from A to B (base points; y may differ: sloping balustrade with vertical posts)
function railLine(P, A, B, R, { startPost = true, endPost = true } = {}) {
  const d = new THREE.Vector3().subVectors(B, A), hl = Math.hypot(d.x, d.z), n = Math.max(1, Math.round(hl / R.sp));
  const ry = Math.atan2(-d.z, d.x), across = V3(-d.z, 0, d.x).normalize().negate();
  const post = postGeo(R, R.h);
  for (let i = startPost ? 0 : 1; i <= (endPost ? n : n - 1); i++) { const p = A.clone().addScaledVector(d, i / n); P.add(STONE, post, p.x, p.y, p.z, ry); }
  const profs = [...R.bars.map(([yc, hh]) => [lensProfile(R.bw, hh, 10), yc]), [copingProfile(R.cope[2], R.cope[1] - R.cope[0], 8), R.cope[0]]];
  const dir = d.clone().normalize();
  for (const [pr, yy] of profs) {
    const a = A.clone().add(V3(0, yy, 0)), b = B.clone().add(V3(0, yy, 0));
    P.add(STONE, lineSweep(pr, a, b, 1));
    P.add(STONE, profileCap(pr, a, across, dir.clone().negate()));
    P.add(STONE, profileCap(pr, b, across, dir));
  }
}

// ------------------------------------------------------------------------------------------- medhi and anda
function buildMound(P, lite) {
  const { DR, DH, RB, YC, RD, TOP } = S, seg = lite ? 72 : 160;
  // medhi wall: plinth steps, batter, cornice (repeated points keep the arrises crisp)
  P.add(DOME, lathe([
    [DR + 0.62, 0.0], [DR + 0.62, 0.3], [DR + 0.62, 0.3], [DR + 0.48, 0.38], [DR + 0.48, 0.62], [DR + 0.48, 0.62],
    [DR + 0.3, 0.7], [DR + 0.2, 0.82], [DR + 0.2, 0.82], [DR + 0.05, DH - 0.42], [DR + 0.05, DH - 0.42],
    [DR + 0.14, DH - 0.36], [DR + 0.3, DH - 0.26], [DR + 0.3, DH - 0.26], [DR + 0.3, DH], [DR + 0.3, DH], [DR - 0.4, DH],
  ], seg));
  // berm walk (paved), springing of the anda
  P.add(PAVE, new THREE.RingGeometry(RB - 0.3, DR - 0.38, seg, 1).rotateX(-Math.PI / 2), 0, DH + 0.005, 0);
  // the anda: truncated sphere, flattened top; surface subtly uneven (old masonry)
  const prof = [], n = lite ? 20 : 44, a1 = Math.asin((TOP - YC) / RD);
  for (let i = 0; i <= n; i++) { const a = S.A0 + (a1 - S.A0) * i / n; prof.push([Math.cos(a) * RD, YC + Math.sin(a) * RD]); }
  prof.unshift([RB + 0.02, DH - 0.25]);
  prof.push([prof[prof.length - 1][0] * 0.5, TOP + 0.05], [0, TOP + 0.08]);
  let dome = lathe(prof, lite ? 80 : 180);
  dome.deleteAttribute('uv'); dome.deleteAttribute('normal');
  dome = mergeVertices(dome);
  const p = dome.attributes.position, c = V3(0, YC, 0), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); if (v.y < DH + 0.2) continue;
    const k = 0.07 * noise3(v.x * 0.09, v.y * 0.09, v.z * 0.09) + 0.035 * noise3(v.x * 0.3 + 4, v.y * 0.3, v.z * 0.3) + 0.012 * noise3(v.x * 1.1, v.y * 1.1 + 2, v.z * 1.1);
    const dir = v.clone().sub(c).normalize(); v.addScaledVector(dir, k * Math.min(1, (v.y - DH - 0.2) / 0.8)); p.setXYZ(i, v.x, v.y, v.z);
  }
  dome.computeVertexNormals();
  P.add(DOME, dome);
  // medhi railing on the berm, broken at the head of the stairs (south)
  const RM = DR - 0.12, gap = Math.asin(1.35 / RM);
  railArc(P, RM, Math.PI / 2 + gap, Math.PI / 2 - gap + Math.PI * 2, DH, MEDHI_RAIL, { segLen: lite ? 1.0 : 0.45 });
}

// ------------------------------------------------------------------------------------------- stairs
// Double stairway on the south: the flights rise from the east and west ends towards a central landing at
// berm level; their outer edge carries a stringer parapet and a sloping balustrade of the railing type.
function buildStairs(P, lite) {
  const { DR, DH } = S, N = 18, rise = DH / N, tread = 0.36, XL = 1.8, XE = XL + N * tread;
  const z0 = DR - 2.6, zi = DR - 2.4, zo = DR + 1.95, zp = zo + 0.42;    // body (buried), flight inner/outer, parapet
  P.box(ASHLAR, -XL, XL, 0, DH, z0, zp);                                  // landing block
  P.box(PAVE, -XL, XL, DH - 0.02, DH + 0.03, DR - 0.6, zo);
  for (const sx of [-1, 1]) for (let i = 0; i < N; i++) {
    const xa = XL + (N - 1 - i) * tread, xb = xa + tread, h = (i + 1) * rise;
    P.box(ASHLAR, sx > 0 ? xa : -xb, sx > 0 ? xb : -xa, 0, h - 0.06, z0, zo);
    // tread slab with a nosing
    const g = chamferBox(tread + 0.05, 0.08, zo - zi + 0.04, 0.015);
    P.add(ASHLAR, g, sx * (xa + xb) / 2 + sx * 0.025, h - 0.04, (zi + zo) / 2);
  }
  // the inner side of the flights against the drum: a solid filling wall up to each step
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape([[XL, 0], [XE + 0.1, 0], [XE + 0.1, 0.35], [XL, DH + 0.18]].map(([x, y]) => new THREE.Vector2(sx * x, y)));
    const parapet = new THREE.ExtrudeGeometry(sh, { depth: zp - zo, bevelEnabled: false });
    P.add(ASHLAR, parapet, 0, 0, zo);
    // coping strip on the parapet
    const L = Math.hypot(XE + 0.1 - XL, DH + 0.18 - 0.35), ang = Math.atan2(DH + 0.18 - 0.35, XE + 0.1 - XL);
    put(P, ASHLAR, chamferBox(L, 0.1, zp - zo + 0.08, 0.02), { x: sx * (XL + XE + 0.1) / 2, y: (DH + 0.18 + 0.35) / 2 + 0.05, z: (zo + zp) / 2, rz: -sx * ang });
    // sloping balustrade, newel post at the foot
    railLine(P, V3(sx * (XE + 0.0), 0.38, (zo + zp) / 2), V3(sx * XL, DH + 0.2, (zo + zp) / 2), STAIR_RAIL, { endPost: true });
    P.add(STONE, chamferBox(0.36, 1.6, 0.42, 0.03), sx * (XE + 0.1), 0.8, (zo + zp) / 2);
    P.add(STONE, new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), sx * (XE + 0.1), 1.6, (zo + zp) / 2);
  }
  // parapet and balustrade across the front of the landing
  P.box(ASHLAR, -XL, XL, DH, DH + 0.18, zo, zp);
  railLine(P, V3(-XL, DH + 0.2, (zo + zp) / 2), V3(XL, DH + 0.2, (zo + zp) / 2), STAIR_RAIL, { startPost: false, endPost: false });
  void lite;
}

// ------------------------------------------------------------------------------------------- harmika, chhatra
function buildHarmika(P, lite) {
  const HS = 2.4, Y0 = S.TOP + 0.3, seg = lite ? 24 : 48;
  P.add(ASHLAR, chamferBox(2 * HS + 0.7, 0.62, 2 * HS + 0.7, 0.04), 0, S.TOP, 0);          // plinth on the flat top
  P.add(ASHLAR, chamferBox(2 * HS + 0.5, 0.12, 2 * HS + 0.5, 0.03), 0, Y0 - 0.0, 0);
  const c = [[-HS, -HS], [HS, -HS], [HS, HS], [-HS, HS]];
  for (let i = 0; i < 4; i++) railLine(P, V3(c[i][0], Y0 + 0.06, c[i][1]), V3(c[(i + 1) % 4][0], Y0 + 0.06, c[(i + 1) % 4][1]), HARMIKA_RAIL, { endPost: false });
  // corner posts a little heavier
  for (const [x, z] of c) P.add(STONE, chamferBox(0.28, HARMIKA_RAIL.h, 0.28, 0.03), x, Y0 + 0.06 + HARMIKA_RAIL.h / 2, z);
  // shaft (yashti) on its block, three discs (chhatra), finial
  P.add(ASHLAR, chamferBox(1.0, 0.7, 1.0, 0.04), 0, Y0 + 0.4, 0);
  P.add(STONE, new THREE.CylinderGeometry(0.24, 0.29, 4.6, 8), 0, Y0 + 0.75 + 2.3, 0);
  for (const [y, r] of [[S.TOP + 2.95, 2.3], [S.TOP + 4.08, 1.78], [S.TOP + 5.12, 1.25]]) {
    P.add(STONE, lathe([[0, 0], [r * 0.25, -0.04], [r * 0.9, 0.02], [r, 0.08], [r, 0.08], [r + 0.02, 0.2], [r + 0.02, 0.2], [r * 0.93, 0.26], [r * 0.35, 0.36], [0.2, 0.42], [0, 0.42]], seg), 0, y, 0);
    P.add(STONE, new THREE.CylinderGeometry(0.34, 0.4, 0.22, 10), 0, y - 0.1, 0);      // collar under each disc
  }
  P.add(STONE, lathe([[0, 0], [0.22, 0.02], [0.26, 0.12], [0.16, 0.24], [0.2, 0.34], [0.08, 0.5], [0, 0.56]], 12), 0, S.TOP + 5.54, 0);
}

// ------------------------------------------------------------------------------------------- torana
// One gateway in its own frame (x across, y up, z outward, centred on its pillars' line). `q`: 0 S, 1 E,
// 2 N, 3 W (capital type); `hi`: full detail.
function torana(P, q, hi, lite, F) {
  const { PX, PW, PLINTH, SHAFT, CAP0, CAP1, A, AH, AD, LB, VX, VRAD } = G;
  for (const sx of [-1, 1]) {
    const x = sx * PX;
    P.add(STONE, chamferBox(PW + 0.3, PLINTH, PW + 0.3, 0.04), x, PLINTH / 2, 0);                      // plinth
    P.add(STONE, chamferBox(PW + 0.14, 0.12, PW + 0.14, 0.03), x, PLINTH + 0.06, 0);                   // base moulding
    P.add(RELIEF, chamferBox(PW, SHAFT - PLINTH, PW, 0.03), x, (PLINTH + SHAFT) / 2, 0);               // carved shaft
    P.add(STONE, chamferBox(PW + 0.1, 0.07, PW + 0.1, 0.02), x, SHAFT - 0.06, 0);                       // neck band
    P.add(STONE, chamferBox(PW + 0.26, CAP0 - SHAFT, PW + 0.26, 0.03), x, (SHAFT + CAP0) / 2, 0);       // abacus
    P.add(STONE, chamferBox(0.6, CAP1 - CAP0, 0.6, 0.03), x, (CAP0 + CAP1) / 2, 0);                     // capital core
    P.add(STONE, chamferBox(1.3, 0.1, AD + 0.1, 0.02), x, CAP1 + 0.05, 0);                              // bearing block
    // the capital: four animals back to back (two facing out on each face)
    const kind = q === 0 ? 'lion' : q === 3 ? 'dwarf' : 'elephant';
    for (const fz of [1, -1]) for (const ox of [-1, 1]) {
      const g = F[kind], ry = fz > 0 ? 0 : Math.PI;
      if (kind === 'elephant') put(P, STONE, g, { x: x + ox * 0.29, y: CAP0, z: fz * 0.2, ry, s: 0.8 });
      else if (kind === 'lion') put(P, STONE, g, { x: x + ox * 0.27, y: CAP0, z: fz * 0.14, ry, s: [0.95, 1.08, 0.95] });
      else put(P, STONE, g, { x: x + ox * 0.24, y: CAP0, z: fz * 0.2, ry, s: [0.95, 1.03, 0.95] });
    }
    // shalabhanjika brackets at the outer corners, front (and back) — leaning out under the overhang
    for (const fz of hi ? [1, -1] : [1]) {
      put(P, STONE, sx * fz > 0 ? F.shalaR : F.shalaL, { x: x + sx * 0.42, y: CAP0 - 0.12, z: fz * 0.16, ry: fz > 0 ? sx * 0.45 : Math.PI - sx * 0.45, rz: -sx * fz * 0.36, s: 1.08 });
      // and its bracket block on the capital
      P.add(STONE, chamferBox(0.3, 0.16, 0.3, 0.02), x + sx * 0.46, CAP0 - 0.15, fz * 0.16);
    }
  }
  // architraves: bowed beams, carved faces, spiral volutes overhanging the pillars
  const segX = lite ? 8 : 20;
  A.forEach((yc, k) => {
    const g = new THREE.BoxGeometry(2 * LB, AH, AD, segX, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + bow(p.getX(i)));
    g.computeVertexNormals();
    P.add(RELIEF, g, 0, yc, 0);
    // thin fillets along the top and bottom arrises
    for (const sy of [-1, 1]) {
      const f = new THREE.BoxGeometry(2 * LB - 0.1, 0.05, AD + 0.04, segX, 1, 1), fp = f.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.setY(i, fp.getY(i) + bow(fp.getX(i)));
      f.computeVertexNormals();
      P.add(STONE, f, 0, yc + sy * (AH / 2 - 0.02), 0);
    }
    for (const sx of [-1, 1]) {
      const cy = yc + bow(VX) - 0.02;
      P.add(STONE, new THREE.CylinderGeometry(VRAD, VRAD, AD + 0.02, lite ? 14 : 28).rotateX(Math.PI / 2), sx * VX, cy, 0);
      for (const fz of [1, -1]) put(P, STONE, sx * fz > 0 ? F.spiralR : F.spiralL, { x: sx * VX, y: cy, z: fz * (AD / 2 + 0.01), ry: fz > 0 ? 0 : Math.PI });
    }
  });
  // between the architraves: dies over the pillars, balusters in the central span, riders over the overhangs
  for (let k = 0; k < 2; k++) {
    const y0 = A[k] + AH / 2, y1 = A[k + 1] - AH / 2, h = y1 - y0;
    for (const sx of [-1, 1]) {
      P.add(RELIEF, chamferBox(0.72, h + 0.02, 0.5, 0.02), sx * PX, (y0 + y1) / 2 + bow(PX), 0);
      // riders: an elephant on the lower tier, a horse on the upper, facing out towards the ends
      const g = k === 0 ? F.elephantR : F.horseR;
      put(P, STONE, g, { x: sx * 2.6, y: y0 + bow(2.6) - 0.01, z: 0, ry: sx * Math.PI / 2, s: k === 0 ? 0.5 : 0.58 });
    }
    const nb = hi ? 3 : 3;
    for (let i = 0; i < nb; i++) {
      const x = (i - (nb - 1) / 2) * 0.82, yb = y0 + bow(x);
      P.add(STONE, chamferBox(0.2, h, 0.2, 0.02), x, yb + h / 2 + 0.005, 0);
      if (hi || !lite) for (const fz of [1, -1]) put(P, STONE, F.yakshi, { x, y: yb + 0.03, z: fz * 0.1, ry: fz > 0 ? 0 : Math.PI, s: [0.55, 0.55, 0.5] });
    }
  }
  // crown on the top architrave
  const top = A[2] + AH / 2;
  put(P, STONE, F.chakra, { x: 0, y: top + bow(0) - 0.02, z: 0, s: 1.0 });
  for (const sx of [-1, 1]) {
    put(P, STONE, F.triratna, { x: sx * PX, y: top + bow(PX) - 0.02, z: 0, s: 1.05 });
    put(P, STONE, sx > 0 ? F.yakshaR : F.yakshaL, { x: sx * 0.9, y: top + bow(0.9) - 0.01, z: 0, s: 0.92 });
    const endG = q === 0 ? F.lion : F.elephant;
    put(P, STONE, endG, { x: sx * 2.6, y: top + bow(2.6) - 0.01, z: 0, ry: sx * Math.PI / 2, s: q === 0 ? 0.5 : 0.48 });
  }
}

function figures(q, lite) {
  return {
    lion: lionGeo(q), elephant: elephantGeo(q), dwarf: dwarfGeo(q),
    elephantR: elephantGeo(q, { rider: true }), horseR: horseGeo(q),
    shalaR: shalabhanjikaGeo(q, 1), shalaL: shalabhanjikaGeo(q, -1),
    yakshi: humanGeo(q, { female: true, arm: 0 }),
    yakshaR: humanGeo(q, { arm: 1, sx: -1 }), yakshaL: humanGeo(q, { arm: 1, sx: 1 }),
    triratna: triratnaGeo(q), chakra: chakraGeo(q), spiralR: spiralGeo(G.VRAD * 0.92, q, 1), spiralL: spiralGeo(G.VRAD * 0.92, q, -1),
    lite,
  };
}

// ------------------------------------------------------------------------------------------- vedika
function buildVedika(P, lite) {
  const { VR } = S, hw = 3.4, da = Math.asin(hw / VR), segLen = lite ? 1.1 : 0.5;
  for (let i = 0; i < 4; i++) railArc(P, VR, i * Math.PI / 2 + da, (i + 1) * Math.PI / 2 - da, 0, VEDIKA, { segLen });
  // at each entrance: L-shaped returns, radial out to the gateway, then in to its pillars
  const zc = Math.sqrt(VR * VR - hw * hw), zr = G.RT - 0.08, xin = G.PX + G.PW / 2 + 0.3;
  for (let q = 0; q < 4; q++) {
    const rot = (x, z) => { const a = q * Math.PI / 2, c = Math.cos(a), s = Math.sin(a); return V3(x * c + z * s, 0, -x * s + z * c); };
    for (const sx of [-1, 1]) {
      railLine(P, rot(sx * hw, zc + 0.1), rot(sx * hw, zr), VEDIKA, { startPost: false });
      railLine(P, rot(sx * hw, zr), rot(sx * xin, zr), VEDIKA, { startPost: false });
    }
  }
}

// ------------------------------------------------------------------------------------------- assembly
export function buildStupa(P, M, { lite = false } = {}) {
  sanchiMaterials(M, { lite });
  buildMound(P, lite);
  buildStairs(P, lite);
  buildHarmika(P, lite);
  buildVedika(P, lite);
  // the ground processional path, paved, and the forecourts of the gateways
  P.add(PAVE, new THREE.RingGeometry(S.DR + 0.55, S.VR + 0.5, lite ? 72 : 160, 1).rotateX(-Math.PI / 2), 0, 0.04, 0);
  // gateways: the south (camera side) in full detail; E, W, N a little lighter
  const Fhi = figures(lite ? 0.45 : 1, lite), Flo = lite ? Fhi : figures(0.6, lite);
  for (let q = 0; q < 4; q++) {
    const T = { L: {}, add(k, g, x = 0, y = 0, z = 0, ry = 0) { const n = g.index ? g.toNonIndexed() : g.clone(); if (ry) n.rotateY(ry); n.translate(x, y, z); (this.L[k] ??= []).push(n); return n; } };
    T.box = (k, x0, x1, y0, y1, z0, z1) => T.add(k, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const hi = q === 0 && !lite;
    torana(T, q, hi || (!lite && q !== 2), lite, q === 0 ? Fhi : Flo);
    // forecourt slab
    T.add(PAVE, new THREE.BoxGeometry(2 * 3.4, 0.06, G.RT + 1.2 - (S.VR - 0.4)), 0, 0.03, (G.RT + 1.2 + S.VR - 0.4) / 2 - G.RT);
    for (const [k, list] of Object.entries(T.L)) for (const g of list) { g.translate(0, 0, G.RT); g.rotateY(q * Math.PI / 2); P.add(k, g); }
  }
}
