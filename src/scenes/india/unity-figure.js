// THE STATUE OF UNITY — the figure of Sardar Vallabhbhai Patel for src/scenes/india/unity.js (build time only).
// A stylised, abstract low-poly bronze — a minimalist monument maquette of about 2.2k large planar facets
// (1.3k on the lite path) that keeps the statue's recognisable shape and drops its details. No third-party
// mesh: no openly licensed (CC0 / CC-BY) model of the statue could be found; the figure is modelled here from
// the published facts and photographs of Ram V. Sutar's statue, as one signed-distance sculpture:
//   · the walking stance: left foot forward, the feet close (the real gap is about 6.4 m), arms hanging
//     at the sides, the head held up
//   · the shawl's broad shoulders and long front panels falling towards the knees, open in front, its hem
//     rising over the elbows, in a few broad folds; the knee-length kurta's hem; the dhoti legs in three or
//     four broad pleat planes with the front panel between them; sandals as simple blocks
//   · the head an ovoid read as a few planes (dome, brow, face, jaw, chin) with a hint of ears, no
//     features; the hands as mitten forms
// Each part (body, shawl, head, hands) is meshed by surface nets (lib/sdfmesh.js), then reduced by
// quadric edge collapse (unity-decimate.js) to a small budget, so the silhouette survives as a few large,
// calm planes; the parts are merged into one non-indexed geometry with one normal per face. The head's and
// hands' open rims hide inside the collar and the cuffs. Units: figure metres (a 1.82 m man; the scene
// scales it × 100 to the statue's 182 m). The figure faces +z, its left is +x. Each vertex carries `ao`
// (cavity, from the field) and `kind` (0 skin · 1 cloth · 0.5 sandal) for the bronze shader.
import * as THREE from 'three';
import { smin, profilePrim, meshBody } from '../../lib/sdfmesh.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decimate } from './unity-decimate.js';

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
const LH = [0.084, 0.875, 0.012], LK = [0.092, 0.49, 0.078], LA = [0.094, 0.105, 0.13];      // left hip, knee, ankle (forward)
const RH = [-0.084, 0.875, -0.012], RK = [-0.092, 0.49, -0.035], RA = [-0.096, 0.105, -0.098];
export const WRIST_L = [0.232, 0.91, 0.04], WRIST_R = [-0.232, 0.91, 0.052];
const mirror = (v) => [-v[0], v[1], v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function bodyPrims() {
  const P = [];
  // the kurta: a long tunic to the knees, falling in soft vertical folds below the hips
  P.push(tube([0.54, 0.64, 0.76, 0.88, 0.97, 1.06, 1.18, 1.3, 1.39, 1.45, 1.5, 1.525],
    [0.222, 0.216, 0.208, 0.199, 0.192, 0.187, 0.187, 0.19, 0.186, 0.152, 0.1, 0.07],
    [0.182, 0.172, 0.16, 0.15, 0.144, 0.146, 0.144, 0.134, 0.119, 0.097, 0.075, 0.064],
    [0.03, 0.024, 0.018, 0.013, 0.011, 0.011, 0.011, 0.009, 0.002, -0.008, -0.012, -0.012],
    { tag: TAG.kurta, fold: (phi, y) => { const u = Math.min(1, Math.max(0, (1.02 - y) / 0.42)), m = u * u * (3 - 2 * u); return 0.004 + 0.06 * m * (0.5 + 0.5 * Math.sin(phi * 4 + 0.5)); }, fmax: 0.07 }));
  // shoulders and the trapezius under the cloth
  P.push(cone([-0.196, 1.41, -0.012], [0.196, 1.41, -0.012], 0.066, 0.066, { flat: 1.15, k: 0.05, tag: TAG.kurta }));
  P.push(ell([0, 1.47, -0.02], [0.12, 0.045, 0.07], { k: 0.04, tag: TAG.kurta }));
  // the collar band of the kurta round the neck (the head's own neck rises out of it)
  P.push(cone([0, 1.488, -0.008], [0, 1.545, -0.008], 0.073, 0.068, { k: 0.012, tag: TAG.kurta, cap: 2 }));
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
  P.push(cone(LK, LA, 0.095, 0.091, { ...dk, k: 0.04, cap: 2 }));
  P.push(cone(RH, RK, 0.118, 0.095, { ...dk, k: 0.03 }));
  P.push(cone(RK, RA, 0.095, 0.091, { ...dk, k: 0.04, cap: 2 }));
  // the pleated front panel hanging between the legs, and the kachha tucked up behind
  P.push(cone([0.0, 0.83, 0.078], [0.016, 0.17, 0.112], 0.072, 0.088, { flat: 0.45, k: 0.03, tag: TAG.dhoti }));
  // ankles and feet in sandals: the foot and a sole plate, as simple blocks
  for (const [A, yaw, s] of [[LA, 0.12, 1], [RA, -0.1, -1]]) {
    const fz = A[2] + 0.075, fx = A[0] + 0.006 * s;
    P.push(cone(add(A, [0, 0.03, 0]), [fx, 0.045, A[2] + 0.012], 0.041, 0.045, { k: 0.015, tag: TAG.skin }));
    P.push(ell([fx, 0.034, fz], [0.044, 0.031, 0.108], { yaw, k: 0.03, tag: TAG.skin }));
    P.push(ell([fx + 0.004 * s, 0.026, fz + 0.075], [0.041, 0.02, 0.045], { yaw, k: 0.015, tag: TAG.skin }));
    P.push(ell([fx + Math.sin(yaw) * 0.01, 0.011, fz + 0.012], [0.055, 0.011, 0.138], { yaw, k: 0.008, tag: TAG.sandal }));
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
        const q = phi + 0.08 * Math.sin(2 * phi + 2 * y);
        const w = Math.sin(4 * q + 1.0);
        return A * side * (0.5 + 0.5 * w);
      },
      hem: (phi) => hemBase(Math.abs(phi)) - (phi > 0 ? 0.075 * Math.exp(-(((phi - 0.85) / 0.35) ** 2)) : 0) + 0.006 * Math.sin(phi * 4.0 + 0.6),
      open: (y) => 0.5 + 0.13 * Math.min(1, Math.max(0, (1.52 - y) / 0.25)),
    }));
  return P;
}

function headPrims() {
  // the head as a calm, faceted ovoid held up: the bald dome, the brow, the broad jaw and chin read as a
  // few large planes, a hint of ears; no facial features
  const P = [], S = TAG.skin;
  P.push(cone([0, 1.462, -0.004], [0, 1.628, -0.022], 0.07, 0.062, { tag: S }));                     // neck
  P.push(ell([0, 1.73, -0.016], [0.084, 0.093, 0.1], { k: 0.045, tag: S }));                          // dome
  P.push(ell([0, 1.735, 0.03], [0.074, 0.068, 0.066], { k: 0.045, tag: S }));                         // forehead
  P.push(ell([0, 1.712, 0.078], [0.064, 0.016, 0.022], { k: 0.045, tag: S }));                        // brow plane
  P.push(ell([0, 1.655, 0.04], [0.064, 0.07, 0.066], { k: 0.045, tag: S }));                         // face
  P.push(ell([0, 1.67, 0.092], [0.022, 0.034, 0.016], { k: 0.04, tag: S }));                         // the face's centre plane
  for (const s of [1, -1]) P.push(cone([0.053 * s, 1.63, 0.0], [0.026 * s, 1.594, 0.068], 0.022, 0.022, { k: 0.045, tag: S }));   // jaw
  P.push(ell([0, 1.594, 0.075], [0.032, 0.022, 0.022], { k: 0.045, tag: S }));                        // chin
  for (const s of [1, -1]) P.push(ell([0.083 * s, 1.68, -0.006], [0.012, 0.028, 0.017], { yaw: 0.28 * s, k: 0.012, tag: S }));   // ears
  return P;
}

function handPrims(s) {
  const W = s > 0 ? WRIST_L : WRIST_R, S = TAG.skin, P = [];
  const at = (dx, dy, dz) => [W[0] + dx * s, W[1] + dy, W[2] + dz];
  P.push(cone(at(0, 0.03, -0.002), at(0.002, -0.012, 0.002), 0.03, 0.03, { tag: S }));               // wrist (inside the cuff)
  P.push(ell(at(0.004, -0.05, 0.004), [0.0175, 0.05, 0.039], { k: 0.02, tag: S }));                  // palm and back of the hand
  P.push(ell(at(-0.004, -0.046, 0.024), [0.014, 0.028, 0.019], { k: 0.012, tag: S }));               // ball of the thumb
  P.push(ell(at(0.0, -0.11, 0.012), [0.017, 0.045, 0.036], { k: 0.025, tag: S }));                 // the fingers, together: a mitten
  P.push(cone(at(-0.006, -0.034, 0.03), at(-0.016, -0.085, 0.05), 0.012, 0.01, { k: 0.012, tag: S }));      // thumb
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
// d += disp: positive pushes the surface in. Dhoti: broad vertical pleats deepening towards the hem, the
// front panel's closer pleats; hair: a faint comb texture. Nothing finer: the facets could not hold it.
function disp(tag, x, y, z) {
  // the dhoti: three or four broad pleat planes round each leg, deepening to the hem; the front panel's
  // own two or three
  if (tag === TAG.dhoti) {
    const th = Math.atan2(x - Math.sign(x) * 0.09, z), m = 0.4 + 0.6 * Math.min(1, Math.max(0, (0.85 - y) / 0.6));
    let w = Math.sin(th * 3.5 + 0.8);
    const u = Math.min(1, Math.max(0, (0.055 - Math.abs(x)) / 0.03)), wp = u * u * (3 - 2 * u) * (z > 0.04 ? 1 : 0);
    w = w * (1 - wp) + wp * Math.sin(x * 70 + 1.0);
    return 0.0075 * m * w;
  }
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

// → { geometry } one non-indexed, flat-shaded BufferGeometry in figure units (feet on y = 0), with the
// `ao` and `kind` attributes for the bronze. The parts are meshed from the field, then each decimated to
// its own budget (the face and hands get the densest facets), then merged.
export function buildFigure({ lite = false } = {}) {
  const prims = bodyPrims(), cloth = prims.filter((p) => p.tag === TAG.shawl), rest = prims.filter((p) => p.tag !== TAG.shawl);
  const B = makeBody(rest, disp, 0.0078), SH = makeBody(cloth, null, 0), H = makeBody(headPrims(), null, 0);
  const HL = makeBody(handPrims(1), null, 0), HR = makeBody(handPrims(-1), null, 0);
  const all = (x, y, z) => Math.min(B.field3(x, y, z), SH.field3(x, y, z), H.field3(x, y, z), HL.field3(x, y, z), HR.field3(x, y, z));
  const C = SRC_CELLS, T = lite ? TRI_LITE : TRI_FULL;
  const parts = [
    [B, meshBody(B, [-0.33, -0.004, -0.2], [0.33, 1.56, 0.34], C.body, { project: 3 }), T.body],
    [SH, meshBody(SH, [-0.36, 0.56, -0.24], [0.36, 1.595, 0.3], C.shawl, { project: 3 }), T.shawl],
    [H, meshBody(H, [-0.105, 1.475, -0.135], [0.105, 1.835, 0.142], C.head, { project: 2 }), T.head],
  ];
  [HL, HR].forEach((Hb, i) => {
    const W = i ? WRIST_R : WRIST_L, s = i ? -1 : 1;
    const x0 = W[0] - (s > 0 ? 0.04 : 0.035), x1 = W[0] + (s > 0 ? 0.035 : 0.04);
    parts.push([Hb, meshBody(Hb, [x0 - 0.01, W[1] - 0.235, W[2] - 0.06], [x1 + 0.01, W[1] + 0.03, W[2] + 0.12], C.hand), T.hand]);
  });
  const geos = parts.map(([body, g, tri]) => {
    const d = decimate(g, tri);
    d.computeVertexNormals();
    bake(d, body, all);
    const f = d.toNonIndexed();
    f.computeVertexNormals();      // (non-indexed: one normal per face, the flat facets)
    return f;
  });
  const geometry = mergeGeometries(geos);
  geometry.computeBoundingSphere();
  return { geometry, fields: { all } };
}
// source mesh cells and triangle budgets per part
export const SRC_CELLS = { body: 0.014, shawl: 0.012, head: 0.006, hand: 0.007 };
export const TRI_FULL = { body: 1100, shawl: 800, head: 220, hand: 60 };
export const TRI_LITE = { body: 620, shawl: 480, head: 140, hand: 40 };
