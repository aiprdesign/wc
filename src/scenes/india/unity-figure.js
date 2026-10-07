// THE STATUE OF UNITY — the figure of Sardar Vallabhbhai Patel for src/scenes/india/unity.js (build time only).
// One signed-distance sculpture, meshed by surface nets (lib/sdfmesh.js) into smooth, indexed geometry:
//   · the walking pose: left foot forward, arms hanging at the sides, the weight on the back foot
//   · the dhoti, wrapped loose round each leg with its front pleats hanging between the knees, the kurta
//     with its button placket and loose sleeves, the shawl over both shoulders and upper arms: a cloth shell
//     with gravity folds, open in front, its left end hanging lower, the hem rising over the elbows
//   · sandals with a toe strap; hands with separate, slightly curled fingers; an elderly, clean-shaven
//     head: heavy brows, deep-set eyes, a strong nose, jowls, ears, short hair at the back and sides
// The head and the hands are meshed separately at a finer cell (their open rims hide inside the collar
// and the sleeve cuffs), so the face and fingers stay smooth in a close-up. Units: figure metres (a
// 1.82 m man; the scene scales it × 100 to the statue's 182 m). The figure faces +z, its left is +x.
// Each vertex carries `ao` (cavity, from the field) and `kind` (0 skin · 1 cloth · 0.5 sandal) for the
// bronze shader: patina gathers in the folds, the raised skin is a little more polished.
import * as THREE from 'three';
import { smin, profilePrim, meshBody } from '../../lib/sdfmesh.js';
import { noise3 } from '../../lib/noise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FIG_H = 1.82;
const smax = (a, b, k) => -smin(-a, -b, k);
const TAG = { skin: 0, kurta: 1, dhoti: 2, shawl: 3, sandal: 4, hair: 5 };
const KIND = [0, 1, 1, 1, 0.5, 0.15];

// ---------------------------------------------------------------------------------------------- primitives
function cone(a, b, ra, rb, o = {}) {
  const flat = o.flat ?? 1, r = Math.max(ra, rb);
  const zc = (a[2] + b[2]) / 2, zh = (Math.abs(a[2] - b[2]) / 2 + r) * Math.max(1, flat);
  return { t: 0, a, b, ra, rb, flat, cap: o.cap ?? 0, k: o.k ?? 0, sub: !!o.sub, tag: o.tag ?? 0,
    box: [Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, zc - zh, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, zc + zh] };
}
function ell(c, r, o = {}) {
  const m = Math.max(...r);
  return { t: 1, c, r, ang: o.ang ?? 0, yaw: o.yaw ?? 0, k: o.k ?? 0, sub: !!o.sub, tag: o.tag ?? 0,
    box: [c[0] - m, c[1] - m, c[2] - m, c[0] + m, c[1] + m, c[2] + m] };
}
// Generalized elliptic tube about a vertical axis: radii rx(y), rz(y) and centre z cz(y) through knots,
// multiplied by (1 + fold(φ, y)) (φ = atan2(x, z − cz), 0 = straight ahead). solid, or a cloth shell of
// half-thickness th cut below the hem hem(φ), above `top`, and inside the front opening |φ| < open(y).
function tube(ys, rx, rz, cz, o = {}) {
  const P = profilePrim(ys, rx, rz, 0, 512), C = profilePrim(ys, cz.map((v) => v + 1), cz.map((v) => v + 1), 0, 512);
  const fmax = o.fmax ?? 0, th = o.th ?? 0, R = Math.max(...rx) * (1 + fmax) + th, Rz = Math.max(...rz) * (1 + fmax) + th;
  const czMin = Math.min(...cz), czMax = Math.max(...cz);
  return { t: 2, P, C, th, solid: !th, fold: o.fold ?? null, hem: o.hem ?? null, open: o.open ?? null, top: o.top ?? ys[ys.length - 1], topAt: o.topAt ?? null,
    y0: ys[0], y1: ys[ys.length - 1], k: o.k ?? 0, sub: false, tag: o.tag ?? 0,
    box: [-R, o.hemMin ?? ys[0], czMin - Rz, R, ys[ys.length - 1], czMax + Rz] };
}
function sdTube(p, x, y, z) {
  // (tables read with linear interpolation: nearest-sample lookups leave fine terraces on the cloth)
  const P = p.P, u = Math.min(P.n - 1e-6, Math.max(0, (y - P.y0) / (P.y1 - P.y0) * P.n)), j = Math.floor(u), fr = u - j, j1 = j + 1;
  const L = (A) => A[j] + (A[j1] - A[j]) * fr;
  const cz = L(p.C.W) - 1, lx = x, lz = z - cz;
  const phi = Math.atan2(lx, lz);
  const f = p.fold ? 1 + p.fold(phi, y) : 1;
  const w = Math.max(1e-4, L(P.W) * f), d = Math.max(1e-4, L(P.D) * f);
  const ax = Math.abs(lx), az = Math.abs(lz);
  const qa = ax / w, qb = az / d, qa2 = qa / w, qb2 = qb / d;
  const k0 = Math.sqrt(qa * qa + qb * qb), k1 = Math.sqrt(qa2 * qa2 + qb2 * qb2);
  let e = k1 < 1e-9 ? -Math.min(w, d) : k0 * (k0 - 1) / k1;
  const g = L(P.dW) * f * (ax / w) * (ax / Math.max(k0 * w, 1e-6)) + L(P.dD) * f * (az / d) * (az / Math.max(k0 * d, 1e-6));
  e /= Math.sqrt(1 + g * g);
  let D = p.solid ? e : Math.abs(e) - p.th;
  // hems and edges rounded (a radius of a cell or more: surface nets turn sharp edges into staircases)
  if (p.solid) D = smax(smax(D, P.y0 - y, 0.012), y - P.y1, 0.012);
  else {
    D = smax(D, (p.hem ? p.hem(phi) : P.y0) - y, 0.012);
    D = smax(D, y - (p.topAt ? p.topAt(phi) : p.top), 0.012);
    if (p.open) { const op = p.open(y); D = smax(D, (op - Math.abs(phi)) * Math.sqrt(lx * lx + lz * lz), 0.012); }
  }
  return D;
}
// (the library's round cone and ellipsoid, with sqrt for Math.hypot: several times quicker in V8)
function sdCone(px, py, pz, p) {
  const [ax, ay, az] = p.a, [bx, by, bz] = p.b;
  const qz = (pz - (az + bz) * 0.5) / p.flat + (az + bz) * 0.5;
  const dx = bx - ax, dy = by - ay, dz = bz - az, h = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
  const wx = px - ax, wy = py - ay, wz = qz - az;
  const ly = (wx * dx + wy * dy + wz * dz) / h;
  const lx = Math.sqrt(Math.max(0, wx * wx + wy * wy + wz * wz - ly * ly));
  const b = (p.ra - p.rb) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = -b * lx + a * ly;
  let d;
  if (k < 0) d = Math.sqrt(lx * lx + ly * ly) - p.ra;
  else if (k > a * h) d = Math.sqrt(lx * lx + (ly - h) * (ly - h)) - p.rb;
  else d = lx * a + ly * b - p.ra;
  if (p.cap) { if (p.cap & 1) d = smax(d, -ly, 0.01); if (p.cap & 2) d = smax(d, ly - h, 0.01); }
  return d;
}
function sdEll(px, py, pz, p) {
  const c = p.c, r = p.r;
  let x = px - c[0], y = py - c[1], z = pz - c[2];
  if (p.ang) { const cs = Math.cos(p.ang), sn = Math.sin(p.ang), u = x * cs + y * sn; y = -x * sn + y * cs; x = u; }
  if (p.yaw) { const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw), u = x * cs - z * sn; z = x * sn + z * cs; x = u; }
  const a = x / r[0], b = y / r[1], e = z / r[2], a2 = a / r[0], b2 = b / r[1], e2 = e / r[2];
  const k0 = Math.sqrt(a * a + b * b + e * e), k1 = Math.sqrt(a2 * a2 + b2 * b2 + e2 * e2);
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
const sd = (p, x, y, z) => (p.t === 1 ? sdEll(x, y, z, p) : p.t === 0 ? sdCone(x, y, z, p) : sdTube(p, x, y, z));

// A body for meshBody(): union / subtraction of the primitives in order, column-culled, plus a surface
// displacement (cloth pleats and wrinkles, hair) blended between the tags of the nearest primitives.
function makeBody(prims, disp, dispAmp) {
  const kMax = Math.max(...prims.map((p) => p.k));
  const active = new Int32Array(prims.length);
  let nA = 0;
  const tagD = new Float64Array(8);
  const evalList = (list, n, x, y, z, wantTag) => {
    let d = 1e9;
    if (wantTag) tagD.fill(1e9);
    for (let j = 0; j < n; j++) {
      const p = prims[list ? list[j] : j], b = p.box;
      // too far from this primitive's box to change the blend: skip it (its distance is at least that)
      const ox = Math.max(b[0] - x, 0, x - b[3]), oy = Math.max(b[1] - y, 0, y - b[4]), oz = Math.max(b[2] - z, 0, z - b[5]), o2 = ox * ox + oy * oy + oz * oz;
      if (p.sub) { const m = p.k + Math.abs(d); if (o2 > m * m) continue; }
      else if (d < 1e8) { const m = d + p.k; if (m <= 0 || o2 > m * m) continue; }
      const q = sd(p, x, y, z);
      if (p.sub) d = smax(d, -q, p.k);
      else { d = smin(d, q, p.k); if (wantTag && q < tagD[p.tag]) tagD[p.tag] = q; }
    }
    return d;
  };
  const withDisp = (d, x, y, z) => {
    if (!disp || Math.abs(d) > 0.012) return d;
    let best = 1e9;
    for (let i = 0; i < 6; i++) if (tagD[i] < best) best = tagD[i];
    let ws = 0, s = 0;
    for (let i = 0; i < 6; i++) { if (tagD[i] > best + 0.03) continue; const w = Math.exp(-(tagD[i] - best) / 0.006); ws += w; s += w * disp(i, x, y, z); }
    return d + s / ws;
  };
  const boxD = (b, x, y) => { const ox = Math.max(b[0] - x, 0, x - b[3]), oy = Math.max(b[1] - y, 0, y - b[4]); return Math.sqrt(ox * ox + oy * oy); };
  return {
    prims,
    field2(x, y) { let m = 1e9; for (const p of prims) if (!p.sub) { const o = boxD(p.box, x, y); if (o < m) m = o; } return m - kMax * 0.25 - dispAmp; },
    column(x, y, margin) {
      nA = 0; let far = 1e9;
      for (let i = 0; i < prims.length; i++) { const o = boxD(prims[i].box, x, y); if (o < margin + kMax * 0.25 + dispAmp) active[nA++] = i; else if (!prims[i].sub && o < far) far = o; }
      let anyU = false; for (let j = 0; j < nA; j++) if (!prims[active[j]].sub) { anyU = true; break; }
      return anyU ? undefined : far;
    },
    columnField(x, y, z) { return withDisp(evalList(active, nA, x, y, z, true), x, y, z); },
    field3(x, y, z) { return withDisp(evalList(null, prims.length, x, y, z, true), x, y, z); },
    tagAt(x, y, z) { evalList(null, prims.length, x, y, z, true); let b = 0; for (let i = 1; i < 6; i++) if (tagD[i] < tagD[b]) b = i; return b; },
  };
}

// ---------------------------------------------------------------------------------------------- the pose
const LH = [0.086, 0.875, 0.012], LK = [0.1, 0.49, 0.078], LA = [0.106, 0.105, 0.13];      // left hip, knee, ankle (forward)
const RH = [-0.086, 0.875, -0.012], RK = [-0.1, 0.49, -0.035], RA = [-0.11, 0.105, -0.098];
export const WRIST_L = [0.232, 0.91, 0.04], WRIST_R = [-0.232, 0.91, 0.052];
const mirror = (v) => [-v[0], v[1], v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function bodyPrims() {
  const P = [];
  // the kurta: a loose tunic to mid-thigh, its hem flaring over the dhoti
  // the kurta: a long tunic to the knees, falling in soft vertical folds below the hips
  P.push(tube([0.54, 0.64, 0.76, 0.88, 0.97, 1.06, 1.18, 1.3, 1.39, 1.45, 1.5, 1.525],
    [0.222, 0.216, 0.208, 0.198, 0.19, 0.182, 0.184, 0.19, 0.186, 0.152, 0.1, 0.07],
    [0.182, 0.172, 0.16, 0.15, 0.144, 0.146, 0.144, 0.134, 0.119, 0.097, 0.075, 0.064],
    [0.03, 0.022, 0.014, 0.008, 0.006, 0.014, 0.014, 0.01, 0.002, -0.008, -0.012, -0.012],
    { tag: TAG.kurta, fold: (phi, y) => { const u = Math.min(1, Math.max(0, (1.02 - y) / 0.42)), m = u * u * (3 - 2 * u); return 0.004 + 0.06 * m * (0.5 + 0.5 * Math.sin(phi * 10 + 0.6 * Math.sin(phi * 3) + y * 3)); }, fmax: 0.07 }));
  // shoulders and the trapezius under the cloth
  P.push(cone([-0.196, 1.41, -0.012], [0.196, 1.41, -0.012], 0.066, 0.066, { flat: 1.15, k: 0.05, tag: TAG.kurta }));
  P.push(ell([0, 1.47, -0.02], [0.12, 0.045, 0.07], { k: 0.04, tag: TAG.kurta }));
  // the collar band of the kurta round the neck (the head's own neck rises out of it)
  P.push(cone([0, 1.488, -0.008], [0, 1.545, -0.008], 0.073, 0.068, { k: 0.012, tag: TAG.kurta, cap: 2 }));
  // the placket and its buttons down the front
  // arms: under the shawl down to the elbow, then the loose kurta sleeve and its cuff at the wrist
  for (const s of [1, -1]) {
    const W = s > 0 ? WRIST_L : WRIST_R, E = [0.222 * s, 1.14, s > 0 ? -0.022 : -0.012];
    P.push(ell([0.192 * s, 1.415, -0.012], [0.058, 0.063, 0.06], { k: 0.04, tag: TAG.kurta }));
    P.push(cone([0.195 * s, 1.415, -0.012], E, 0.055, 0.047, { k: 0.03, tag: TAG.kurta }));
    P.push(cone(E, add(W, [0, 0.012, 0]), 0.05, 0.041, { k: 0.02, tag: TAG.kurta }));
    P.push(ell([E[0] + (W[0] - E[0]) * 0.38, E[1] + (W[1] - E[1]) * 0.38, E[2] + (W[2] - E[2]) * 0.38 + 0.004], [0.049, 0.075, 0.05], { k: 0.035, tag: TAG.kurta }));   // the loose sleeve over the forearm's swell
    P.push(cone(add(W, [0.001 * s, 0.035, -0.002]), add(W, [0, 0.004, 0]), 0.043, 0.045, { k: 0.01, tag: TAG.kurta, cap: 2 }));
  }
  // the dhoti: loose round each leg, crisp at the kurta's hem, cut square above the ankles
  const dk = { k: 0.013, tag: TAG.dhoti };
  P.push(cone(LH, LK, 0.118, 0.095, dk));
  P.push(cone(LK, LA, 0.095, 0.08, { ...dk, k: 0.04, cap: 2 }));
  P.push(cone(RH, RK, 0.118, 0.095, { ...dk, k: 0.03 }));
  P.push(cone(RK, RA, 0.095, 0.08, { ...dk, k: 0.04, cap: 2 }));
  // the pleated front panel hanging between the legs, and the kachha tucked up behind
  P.push(cone([0.0, 0.83, 0.075], [0.018, 0.25, 0.104], 0.07, 0.08, { flat: 0.42, k: 0.035, tag: TAG.dhoti }));
  // ankles and feet in sandals (a sole plate and a toe strap)
  for (const [A, yaw, s] of [[LA, 0.12, 1], [RA, -0.1, -1]]) {
    const fz = A[2] + 0.075, fx = A[0] + 0.006 * s;
    P.push(cone(add(A, [0, 0.03, 0]), [fx, 0.045, A[2] + 0.012], 0.041, 0.045, { k: 0.015, tag: TAG.skin }));
    P.push(ell([fx, 0.034, fz], [0.044, 0.031, 0.108], { yaw, k: 0.03, tag: TAG.skin }));
    P.push(ell([fx + 0.004 * s, 0.026, fz + 0.075], [0.041, 0.02, 0.045], { yaw, k: 0.015, tag: TAG.skin }));
    P.push(ell([fx - 0.022 * s + Math.sin(yaw) * 0.1, 0.024, fz + 0.1], [0.014, 0.016, 0.022], { yaw, k: 0.006, tag: TAG.skin }));   // big toe
    P.push(ell([fx + Math.sin(yaw) * 0.01, 0.011, fz + 0.012], [0.055, 0.011, 0.138], { yaw, k: 0.008, tag: TAG.sandal }));
    P.push(cone([fx - 0.042 + Math.sin(yaw) * 0.05, 0.028, fz + 0.045], [fx + 0.044 + Math.sin(yaw) * 0.05, 0.028, fz + 0.04], 0.009, 0.009, { k: 0.008, tag: TAG.sandal }));
  }
  // the shawl: over both shoulders and the upper arms, hanging in gravity folds, open in front; its
  // left end falls a little lower in front, and the hem rises at the sides over the elbows
  const hemKnots = [[0, 0.64], [0.75, 0.62], [1.12, 0.8], [1.57, 1.085], [2.06, 0.95], [2.62, 0.76], [3.15, 0.72]];
  const hemBase = (a) => { for (let i = 1; i < hemKnots.length; i++) if (a <= hemKnots[i][0]) { const [a0, h0] = hemKnots[i - 1], [a1, h1] = hemKnots[i], u = (a - a0) / (a1 - a0), s = u * u * (3 - 2 * u); return h0 + (h1 - h0) * s; } return 0.8; };
  P.push(tube([0.6, 0.78, 0.95, 1.1, 1.25, 1.34, 1.4, 1.45, 1.48, 1.505, 1.522, 1.54, 1.585],
    [0.262, 0.266, 0.276, 0.288, 0.296, 0.294, 0.286, 0.262, 0.226, 0.167, 0.114, 0.095, 0.087],
    [0.205, 0.192, 0.18, 0.178, 0.176, 0.169, 0.161, 0.147, 0.133, 0.115, 0.1, 0.092, 0.085],
    [0.012, -0.004, -0.012, -0.013, -0.012, -0.01, -0.01, -0.01, -0.01, -0.01, -0.011, -0.013, -0.016],
    {
      th: 0.0135, tag: TAG.shawl, k: 0.013, fmax: 0.22, hemMin: 0.58, top: 1.585,
      topAt: (phi) => 1.582 - 0.03 * Math.exp(-((phi / 0.75) ** 2)),
      fold: (phi, y) => {
        const u = Math.min(1, Math.max(0, (1.47 - y) / 0.55)), A = 0.02 + 0.22 * u * u * (3 - 2 * u);
        const side = 1 - 0.55 * Math.exp(-(((Math.abs(phi) - 1.57) / 0.4) ** 2)) * (y > 1.0 ? 1 : 0.4);
        const q = phi + 0.16 * Math.sin(2 * phi + 4 * y) + 0.05 * Math.sin(5 * phi - 7 * y);
        const w = 0.72 * Math.sin(7 * q + 1.0) + 0.28 * Math.sin(11 * q + 2.3 + 3 * y);
        return A * side * (0.5 + 0.5 * w);
      },
      hem: (phi) => hemBase(Math.abs(phi)) - (phi > 0 ? 0.075 * Math.exp(-(((phi - 0.85) / 0.35) ** 2)) : 0) + 0.011 * Math.sin(phi * 7.0 + 0.6),
      open: (y) => 0.5 + 0.13 * Math.min(1, Math.max(0, (1.52 - y) / 0.25)),
    }));
  return P;
}

function headPrims() {
  // a bronze portrait head, about 1/7.5 of the figure: a rounded skull, the forehead sloping into a soft
  // brow over deep-set eyes (eyeballs with upper and lower lids), cheekbones blending into soft cheeks,
  // nasolabial folds, a closed mouth with a fuller lower lip, a strong rounded jaw and chin, ears set
  // between the eye and the nose, the neck's sternocleidomastoid planes running down into the collar.
  // Patel: a broad face, strong jaw, bald crown, short hair at the sides, a serious, calm expression.
  const P = [], S = TAG.skin;
  P.push(cone([0, 1.462, -0.004], [0, 1.632, -0.02], 0.064, 0.056, { tag: S }));                      // neck
  for (const s of [1, -1]) P.push(cone([0.055 * s, 1.655, -0.03], [0.014 * s, 1.5, 0.045], 0.012, 0.011, { k: 0.03, tag: S }));   // sternocleidomastoid
  P.push(ell([0, 1.54, 0.034], [0.013, 0.014, 0.012], { k: 0.024, tag: S }));                        // larynx
  P.push(ell([0, 1.728, -0.014], [0.084, 0.093, 0.1], { k: 0.03, tag: S }));                         // rounded skull
  P.push(ell([0, 1.735, 0.03], [0.074, 0.072, 0.066], { k: 0.03, tag: S }));                         // forehead, sloping back over the crown
  P.push(ell([0, 1.716, 0.084], [0.062, 0.012, 0.016], { k: 0.03, tag: S }));                        // soft brow
  P.push(ell([0, 1.665, 0.035], [0.06, 0.07, 0.062], { k: 0.03, tag: S }));                          // the mid-face
  for (const s of [1, -1]) {
    P.push(ell([0.05 * s, 1.688, 0.058], [0.022, 0.015, 0.022], { k: 0.025, tag: S }));                        // cheekbone
    P.push(ell([0.04 * s, 1.645, 0.056], [0.026, 0.03, 0.024], { k: 0.03, tag: S }));                          // soft cheek
    P.push(ell([0.055 * s, 1.632, 0.0], [0.022, 0.03, 0.035], { k: 0.03, tag: S }));                           // angle of the jaw
    P.push(cone([0.052 * s, 1.625, 0.0], [0.022 * s, 1.598, 0.07], 0.019, 0.019, { k: 0.03, tag: S }));        // the jaw's body
  }
  P.push(ell([0, 1.597, 0.078], [0.027, 0.02, 0.02], { k: 0.025, tag: S }));                         // rounded chin
  P.push(ell([0, 1.6, 0.04], [0.05, 0.022, 0.04], { k: 0.03, tag: S }));                             // under the jaw
  for (const s of [1, -1]) {
    P.push(ell([0.03 * s, 1.703, 0.1], [0.019, 0.012, 0.009], { k: 0.02, sub: true, tag: S }));                 // eye socket
    P.push(ell([0.03 * s, 1.7, 0.081], [0.0128, 0.0128, 0.0128], { k: 0.003, tag: S }));                       // eyeball
    P.push(ell([0.03 * s, 1.7105, 0.0815], [0.0155, 0.0115, 0.0114], { ang: 0.08 * s, k: 0.004, tag: S }));      // upper lid
    P.push(ell([0.03 * s, 1.6935, 0.0815], [0.0145, 0.0072, 0.0116], { k: 0.004, tag: S }));                   // lower lid
  }
  P.push(cone([0, 1.709, 0.092], [0, 1.668, 0.116], 0.0082, 0.0105, { k: 0.014, tag: S }));         // nose
  P.push(ell([0, 1.6625, 0.1155], [0.011, 0.0095, 0.0095], { k: 0.01, tag: S }));
  for (const s of [1, -1]) {
    P.push(ell([0.0112 * s, 1.659, 0.1065], [0.0082, 0.0074, 0.0082], { k: 0.008, tag: S }));       // alae
    P.push(ell([0.0062 * s, 1.6535, 0.1105], [0.0034, 0.002, 0.0042], { k: 0.002, sub: true, tag: S }));   // nostril
    P.push(cone([0.0165 * s, 1.657, 0.1075], [0.0265 * s, 1.639, 0.0995], 0.0045, 0.004, { k: 0.014, sub: true, tag: S }));  // nasolabial fold
  }
  P.push(ell([0, 1.6398, 0.0938], [0.0198, 0.0048, 0.0055], { k: 0.018, tag: S }));                 // upper lip
  P.push(ell([0, 1.6305, 0.0942], [0.0168, 0.0058, 0.0056], { k: 0.016, tag: S }));                 // fuller lower lip
  P.push(cone([-0.0155, 1.6354, 0.1012], [0.0155, 1.6354, 0.1012], 0.0028, 0.0028, { k: 0.004, sub: true, tag: S }));  // the closed mouth: a shallow line
  for (const s of [1, -1]) {
    P.push(ell([0.083 * s, 1.68, -0.006], [0.011, 0.029, 0.018], { yaw: 0.25 * s, k: 0.007, tag: S }));          // ear
    P.push(ell([0.0905 * s, 1.681, -0.0035], [0.0052, 0.019, 0.011], { yaw: 0.25 * s, k: 0.003, sub: true, tag: S }));
  }
  P.push(ell([0, 1.69, -0.036], [0.0875, 0.047, 0.092], { k: 0.008, tag: TAG.hair }));             // short hair at the sides and back
  return P;
}

function handPrims(s) {
  const W = s > 0 ? WRIST_L : WRIST_R, S = TAG.skin, P = [];
  const at = (dx, dy, dz) => [W[0] + dx * s, W[1] + dy, W[2] + dz];
  P.push(cone(at(0, 0.03, -0.002), at(0.002, -0.012, 0.002), 0.03, 0.03, { tag: S }));               // wrist (inside the cuff)
  P.push(ell(at(0.004, -0.05, 0.004), [0.0175, 0.05, 0.039], { k: 0.02, tag: S }));                  // palm and back of the hand
  P.push(ell(at(-0.004, -0.046, 0.024), [0.014, 0.028, 0.019], { k: 0.012, tag: S }));               // ball of the thumb
  const F = [[0.024, 0.044, 0.035, 0.0084], [0.008, 0.048, 0.038, 0.0086], [-0.008, 0.046, 0.036, 0.0083], [-0.023, 0.037, 0.029, 0.0074]];
  for (const [dz, l1, l2, r] of F) {
    const b = at(0.002, -0.088 - Math.abs(dz) * 0.15, 0.004 + dz);
    const d1 = new THREE.Vector3(-0.1 * s, -1, 0.17).normalize(), d2 = new THREE.Vector3(-0.16 * s, -0.78, 0.6).normalize();
    const m = [b[0] + d1.x * l1, b[1] + d1.y * l1, b[2] + d1.z * l1], e = [m[0] + d2.x * l2, m[1] + d2.y * l2, m[2] + d2.z * l2];
    P.push(cone(b, m, r, r * 0.92, { k: 0.004, tag: S }));
    P.push(cone(m, e, r * 0.92, r * 0.8, { k: 0.003, tag: S }));
    P.push(ell(b, [r * 1.05, r * 0.9, r * 1.0], { k: 0.006, tag: S }));                            // knuckle
  }
  P.push(cone(at(-0.006, -0.034, 0.03), at(-0.016, -0.074, 0.051), 0.0125, 0.0102, { k: 0.008, tag: S }));     // thumb
  P.push(cone(at(-0.016, -0.074, 0.051), at(-0.02, -0.097, 0.049), 0.0102, 0.0086, { k: 0.003, tag: S }));
  // proportion: the hand as long as the face (≈ 0.19 from the wrist crease to the fingertips), fuller
  const HS = 1.17, sc = (v) => [W[0] + (v[0] - W[0]) * HS, W[1] + (v[1] - W[1]) * HS, W[2] + (v[2] - W[2]) * HS];
  for (const p of P) {
    if (p.t === 0) { p.a = sc(p.a); p.b = sc(p.b); p.ra *= HS * 1.08; p.rb *= HS * 1.08; }
    else { p.c = sc(p.c); p.r = p.r.map((v) => v * HS * 1.05); }
    const r = p.t === 0 ? Math.max(p.ra, p.rb) : Math.max(...p.r), A = p.t === 0 ? p.a : p.c, B = p.t === 0 ? p.b : p.c;
    p.box = [Math.min(A[0], B[0]) - r, Math.min(A[1], B[1]) - r, Math.min(A[2], B[2]) - r, Math.max(A[0], B[0]) + r, Math.max(A[1], B[1]) + r, Math.max(A[2], B[2]) + r];
  }
  return P;
}

// ---------------------------------------------------------------------------------------------- surface detail
// d += disp: positive pushes the surface in. Dhoti: vertical pleats deepening towards the hem; kurta:
// soft creases; shawl: fine weave-scale ripples on top of its modelled folds; hair: short combed strands.
function disp(tag, x, y, z) {
  if (tag === TAG.dhoti) {
    const th = Math.atan2(x, z + 0.01), m = 0.45 + 0.55 * Math.min(1, Math.max(0, (0.85 - y) / 0.6));
    return 0.0062 * m * Math.sin(th * 16 + 0.7 * Math.sin(y * 6 + th * 3) + 1.6 * noise3(x * 7, y * 2, z * 7));
  }
  if (tag === TAG.kurta) return 0.0008 * noise3(x * 14, y * 6, z * 14) + 0.0012 * Math.sin(y * 60 + 3 * noise3(x * 6, y * 3, z * 6)) * Math.max(0, 1.1 - y);
  if (tag === TAG.hair) return 0.0014 * Math.sin(Math.atan2(x, z) * 44 + 4 * noise3(x * 20, y * 20, z * 20));
  return 0;
}

// ---------------------------------------------------------------------------------------------- meshing
function bake(g, body, all) {
  // cavity from the field (sampled a little way out along the normal): low in folds and creases
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const ao = new Float32Array(n), kind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    let a = 0;
    for (const r of [0.012, 0.04]) a += Math.min(1, Math.max(0, all(x + nx * r, y + ny * r, z + nz * r) / r));
    ao[i] = a / 2;
    kind[i] = KIND[body.tagAt(x, y, z)];
  }
  g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
  g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
  return g;
}

// → { body, head, hands } BufferGeometries in figure units (feet on y = 0)
export function buildFigure({ lite = false } = {}) {
  // the shawl is meshed as its own body at a finer cell (its hems and edges stay clean), the rest of the
  // figure at a coarser one; the head and hands finest of all
  const prims = bodyPrims(), cloth = prims.filter((p) => p.tag === TAG.shawl), rest = prims.filter((p) => p.tag !== TAG.shawl);
  const B = makeBody(rest, disp, 0.0065), SH = makeBody(cloth, null, 0), H = makeBody(headPrims(), disp, 0.002);
  const HL = makeBody(handPrims(1), null, 0), HR = makeBody(handPrims(-1), null, 0);
  const all = (x, y, z) => Math.min(B.field3(x, y, z), SH.field3(x, y, z), H.field3(x, y, z), HL.field3(x, y, z), HR.field3(x, y, z));
  const hb = lite ? 0.016 : HB_FULL, hs = lite ? 0.013 : HS_FULL, hh = lite ? 0.006 : HH_FULL, hd = lite ? 0.006 : 0.004;
  const body = bake(meshBody(B, [-0.33, -0.004, -0.2], [0.33, 1.56, 0.34], hb, { project: 3 }), B, all);
  const shawl = bake(meshBody(SH, [-0.36, 0.56, -0.24], [0.36, 1.595, 0.3], hs, { project: 3 }), SH, all);
  const head = bake(meshBody(H, [-0.1, 1.475, -0.125], [0.1, 1.835, 0.142], hh, { project: 2 }), H, all);
  const hands = [HL, HR].map((Hb, i) => {
    const W = i ? WRIST_R : WRIST_L, s = i ? -1 : 1;
    const x0 = W[0] - (s > 0 ? 0.04 : 0.035), x1 = W[0] + (s > 0 ? 0.035 : 0.04);
    return bake(meshBody(Hb, [x0 - 0.01, W[1] - 0.235, W[2] - 0.06], [x1 + 0.01, W[1] + 0.03, W[2] + 0.12], hd), Hb, all);
  });
  return { body: mergeBody(body, shawl), head, hands, fields: { all } };
}
export let HB_FULL = 0.0098, HS_FULL = 0.0078, HH_FULL = 0.003;
export function setCells(b, s, h) { HB_FULL = b; HS_FULL = s; HH_FULL = h; }
function mergeBody(a, b) {
  const g = mergeGeometries([a, b]);
  g.computeBoundingSphere();
  return g;
}
