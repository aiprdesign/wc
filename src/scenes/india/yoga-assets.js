// Procedural models for the yoga chapter (src/scenes/india/yoga.js). Build-time only.
//   · a stylised mannequin rig (sagittal forward kinematics) and the thirteen poses of the sun salutation
//     (tadasana + the twelve positions), with tapered-capsule limb geometries shared by instancing
//   · the seated figure in padmasana as one smooth signed-distance body, with the lungs, the bronchial
//     tree, the diaphragm dome and the airway from each nostril, for the anatomical hologram
//   · the river ghats: stone steps, a square plinth at the water's edge, small shikhara shrines,
//     the cloth umbrellas of the bathing ghats, boats
//   · coarse world coastlines (lon / lat polygons) for the dotted globe, and practice points
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU, lerp } from '../../lib/math.js';
import { noise2 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { sdfBody, meshBody, sdPrim3, smin, profilePrim } from '../../lib/sdfmesh.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;

export function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
export const merge = (list) => mergeGeometries(list.map(prep));

// ============================================================================================ the rig
// Figure frame: faces +x, up +y, z lateral (the figure's right side is +z). Units: metres (≈1.74 m tall).
export const RIG = {
  lumbar: 0.2, thorax: 0.3, neck: 0.09, headOff: 0.11,
  upperArm: 0.29, forearm: 0.25, hand: 0.17,
  thigh: 0.43, shin: 0.42, foot: 0.19,
  hipHalf: 0.09, shoulderHalf: 0.175, shoulderDrop: 0.035,
};
// Pose: absolute sagittal angles (degrees, measured from straight up towards +x, the way the figure faces)
// of each segment, plus optional lateral splay (degrees, + = outwards) for the arm segments.
//   tL lumbar · tH thorax · nk neck/head · aU/aF/aH upper arm, forearm, hand · lT/lS/lF thigh, shin, foot
// Limbs are given per side: [right (+z, near the camera), left].
const P = (o) => o;
export const POSES = [
  // 0 tadasana (standing, the start of the flow)
  P({ tL: 0, tH: 0, nk: 0, aU: [180, 180], aF: [178, 178], aH: [178, 178], sU: [6, 6], lT: [180, 180], lS: [180, 180], lF: [112, 112] }),
  // 1 pranamasana: prayer, palms together at the heart
  P({ tL: 0, tH: -2, nk: 4, aU: [168, 168], aF: [52, 52], aH: [12, 12], sU: [14, 14], sF: [-58, -58], sH: [-6, -6], lT: [180, 180], lS: [180, 180], lF: [112, 112] }),
  // 2 hasta uttanasana: arms raised, arching back
  P({ tL: -8, tH: -24, nk: -32, aU: [-28, -28], aF: [-34, -34], aH: [-36, -36], sU: [6, 6], lT: [187, 187], lS: [181, 181], lF: [112, 112] }),
  // 3 hasta padasana: standing forward bend, palms beside the feet
  P({ tL: 158, tH: 176, nk: 178, aU: [172, 172], aF: [176, 176], aH: [100, 100], sU: [14, 14], lT: [168, 168], lS: [182, 182], lF: [112, 112] }),
  // 4 ashwa sanchalanasana: lunge, right leg back, knee down, gaze forward
  P({ tL: 68, tH: 72, nk: 52, aU: [182, 182], aF: [180, 180], aH: [100, 100], sU: [10, 10], lT: [205, 96], lS: [263, 196], lF: [228, 112] }),
  // 5 dandasana: plank
  P({ tL: 76, tH: 77, nk: 82, aU: [180, 180], aF: [180, 180], aH: [96, 96], sU: [6, 6], lT: [256, 256], lS: [256, 256], lF: [186, 186] }),
  // 6 ashtanga namaskara: knees, chest and chin down, hips raised (eight points)
  P({ tL: 112, tH: 116, nk: 104, aU: [-76, -76], aF: [154, 154], aH: [92, 92], sU: [10, 10], lT: [218, 218], lS: [266, 266], lF: [200, 200] }),
  // 7 bhujangasana: cobra
  P({ tL: 58, tH: 28, nk: 8, aU: [205, 205], aF: [158, 158], aH: [94, 94], sU: [12, 12], lT: [268, 268], lS: [270, 270], lF: [268, 268] }),
  // 8 adho mukha svanasana / parvatasana: downward dog
  P({ tL: 130, tH: 134, nk: 150, aU: [140, 140], aF: [140, 140], aH: [96, 96], sU: [8, 8], lT: [206, 206], lS: [206, 206], lF: [116, 116] }),
  // 9 ashwa sanchalanasana: lunge, the right foot forward
  P({ tL: 68, tH: 72, nk: 52, aU: [182, 182], aF: [180, 180], aH: [100, 100], sU: [10, 10], lT: [96, 205], lS: [196, 263], lF: [112, 228] }),
  // 10 hasta padasana
  P({ tL: 158, tH: 176, nk: 178, aU: [172, 172], aF: [176, 176], aH: [100, 100], sU: [14, 14], lT: [168, 168], lS: [182, 182], lF: [112, 112] }),
  // 11 hasta uttanasana
  P({ tL: -8, tH: -24, nk: -32, aU: [-28, -28], aF: [-34, -34], aH: [-36, -36], sU: [6, 6], lT: [187, 187], lS: [181, 181], lF: [112, 112] }),
  // 12 pranamasana
  P({ tL: 0, tH: -2, nk: 4, aU: [168, 168], aF: [52, 52], aH: [12, 12], sU: [14, 14], sF: [-58, -58], sH: [-6, -6], lT: [180, 180], lS: [180, 180], lF: [112, 112] }),
];
export const POSE_NAMES = ['', 'PRANAMASANA', 'HASTA UTTANASANA', 'HASTA PADASANA', 'ASHWA SANCHALANASANA', 'DANDASANA',
  'ASHTANGA NAMASKARA', 'BHUJANGASANA', 'ADHO MUKHA SVANASANA', 'ASHWA SANCHALANASANA', 'HASTA PADASANA', 'HASTA UTTANASANA', 'PRANAMASANA'];

const KEYS1 = ['tL', 'tH', 'nk'];
const KEYS2 = ['aU', 'aF', 'aH', 'lT', 'lS', 'lF', 'sU', 'sF', 'sH'];
// blend two poses (angles interpolated → limb lengths never change)
export function blendPose(a, b, k, out = {}) {
  for (const key of KEYS1) out[key] = lerp(a[key] ?? 0, b[key] ?? 0, k);
  for (const key of KEYS2) {
    const A = a[key] ?? [0, 0], B = b[key] ?? [0, 0];
    out[key] = [lerp(A[0], B[0], k), lerp(A[1], B[1], k)];
  }
  return out;
}

// segment kinds, in instancing order
export const BONES = ['pelvis', 'lumbar', 'thorax', 'neck', 'head', 'upperArm', 'forearm', 'hand', 'thigh', 'shin', 'foot'];
export const BONE_COUNT = { pelvis: 1, lumbar: 1, thorax: 1, neck: 1, head: 1, upperArm: 2, forearm: 2, hand: 2, thigh: 2, shin: 2, foot: 2 };
// radii used for the ground contact (lowest point of every joint sphere)
const CONTACT_R = { hip: 0.11, waist: 0.1, neck: 0.08, head: 0.11, elbow: 0.04, wrist: 0.03, tip: 0.015, knee: 0.05, ankle: 0.05, toe: 0.025 };

const dirOf = (deg, splay = 0, side = 1) => {
  const a = deg * D2R, s = splay * D2R;
  return V3(Math.sin(a) * Math.cos(s), Math.cos(a) * Math.cos(s), Math.sin(s) * side);
};
// Solve a pose → { segs: [{kind, a: Vector3, d: Vector3 (unit), side}], joints, bbox } in the figure frame,
// shifted so the lowest point rests on y = 0 and the body is centred on x = 0.
export function solvePose(pose) {
  const R = RIG, segs = [], contacts = [];
  const pel = V3(0, 0, 0);
  const dL = dirOf(pose.tL), dH = dirOf(pose.tH), dN = dirOf(pose.nk);
  const waist = pel.clone().addScaledVector(dL, R.lumbar);
  const neck = waist.clone().addScaledVector(dH, R.thorax);
  const head0 = neck.clone().addScaledVector(dN, R.neck);
  const headC = head0.clone().addScaledVector(dN, R.headOff);
  segs.push({ kind: 'pelvis', a: pel.clone(), d: dL.clone(), side: 0 });
  segs.push({ kind: 'lumbar', a: pel.clone(), d: dL.clone(), side: 0 });
  segs.push({ kind: 'thorax', a: waist.clone(), d: dH.clone(), side: 0 });
  segs.push({ kind: 'neck', a: neck.clone(), d: dN.clone(), side: 0 });
  segs.push({ kind: 'head', a: head0.clone(), d: dN.clone(), side: 0 });
  contacts.push([pel, 'hip'], [waist, 'waist'], [neck, 'neck'], [headC, 'head']);
  // lateral axis of the chest (z), and the 'back' direction for the shoulder drop
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const sh = neck.clone().addScaledVector(dH, -R.shoulderDrop); sh.z += side * R.shoulderHalf;
    const dU = dirOf(pose.aU[i], pose.sU?.[i] ?? 0, side), dF = dirOf(pose.aF[i], pose.sF?.[i] ?? 0, side), dHd = dirOf(pose.aH[i], pose.sH?.[i] ?? 0, side);
    const el = sh.clone().addScaledVector(dU, R.upperArm), wr = el.clone().addScaledVector(dF, R.forearm), tip = wr.clone().addScaledVector(dHd, R.hand);
    segs.push({ kind: 'upperArm', a: sh, d: dU, side }, { kind: 'forearm', a: el, d: dF, side }, { kind: 'hand', a: wr, d: dHd, side });
    contacts.push([el, 'elbow'], [wr, 'wrist'], [tip, 'tip']);
    const hip = pel.clone(); hip.z += side * R.hipHalf;
    const dT = dirOf(pose.lT[i]), dS = dirOf(pose.lS[i]), dFt = dirOf(pose.lF[i]);
    const kn = hip.clone().addScaledVector(dT, R.thigh), an = kn.clone().addScaledVector(dS, R.shin), toe = an.clone().addScaledVector(dFt, R.foot);
    segs.push({ kind: 'thigh', a: hip, d: dT, side }, { kind: 'shin', a: kn, d: dS, side }, { kind: 'foot', a: an, d: dFt, side });
    contacts.push([kn, 'knee'], [an, 'ankle'], [toe, 'toe']);
  }
  let minY = Infinity, minX = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [p, k] of contacts) { minY = Math.min(minY, p.y - CONTACT_R[k]); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y + CONTACT_R[k]); }
  const shift = V3(-(minX + maxX) / 2, -minY, 0);
  for (const s of segs) s.a.add(shift);
  return { segs, height: maxY - minY, width: maxX - minX };
}

// basis matrix for a segment: local +y → d, local z → lateral (kept as close to world z as possible)
const _x = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
export function segMatrix(seg, out, scale = 1, origin = null, rotY = 0) {
  const d = seg.d;
  _z.set(0, 0, 1).addScaledVector(d, -d.z);
  if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0);
  _z.normalize();
  _x.crossVectors(d, _z).normalize();
  out.makeBasis(_x, d, _z);
  out.setPosition(seg.a);
  if (scale !== 1) out.premultiply(_m.makeScale(scale, scale, scale));
  if (rotY) out.premultiply(_m.makeRotationY(rotY));
  if (origin) out.premultiply(_m.makeTranslation(origin.x, origin.y, origin.z));
  return out;
}

// profile resolution of the limbs (lite: a coarser profile and caps; the silhouette stays round)
const LIMB = { n: 18, cap: 6 };
// smooth tapered limb along +y: profile knots [y, r] (y in metres), radii smoothed, round end caps
function limb(knots, { seg = 14, sx = 1, sz = 1, n = LIMB.n, cap = LIMB.cap } = {}) {
  const pts = [];
  const y0 = knots[0][0], y1 = knots[knots.length - 1][0], r0 = knots[0][1], r1 = knots[knots.length - 1][1];
  for (let i = 0; i <= cap; i++) { const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r0, y0 + Math.sin(a) * r0)); }
  const curve = new THREE.SplineCurve(knots.map(([y, r]) => new THREE.Vector2(r, y)));
  for (let i = 1; i < n; i++) { const p = curve.getPoint(i / n); pts.push(new THREE.Vector2(p.x, p.y)); }
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, y1 + Math.sin(a) * r1)); }
  pts[pts.length - 1].x = 0;
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
const ellG = (rx, ry, rz, x = 0, y = 0, z = 0, seg = 18) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)).scale(rx, ry, rz).translate(x, y, z);

// one geometry per bone kind, authored along +y from the joint (local x = forward / up of the segment, z lateral)
export function boneGeometries(lite = false) {
  const s = lite ? 8 : 16, R = RIG;
  LIMB.n = lite ? 8 : 18; LIMB.cap = lite ? 3 : 6;
  const out = {
    pelvis: ellG(0.105, 0.1, 0.155, 0.0, 0.02, 0, s),
    lumbar: limb([[0.02, 0.12], [0.1, 0.112], [0.2, 0.118]], { seg: s, sx: 0.78, sz: 1.08 }),
    thorax: merge([
      limb([[0.0, 0.118], [0.08, 0.13], [0.17, 0.142], [0.25, 0.135], [0.3, 0.07]], { seg: s, sx: 0.8, sz: 1.12 }),
      ellG(0.06, 0.06, 0.19, -0.005, R.thorax - R.shoulderDrop - 0.005, 0, s),   // shoulder girdle
    ]),
    neck: limb([[0, 0.048], [0.09, 0.042]], { seg: s }),
    head: merge([ellG(0.1, 0.118, 0.084, 0.012, R.headOff, 0, s + 4), ellG(0.05, 0.045, 0.06, 0.035, 0.03, 0, s)]),   // skull + jaw
    upperArm: limb([[0, 0.05], [0.07, 0.046], [0.2, 0.038], [R.upperArm, 0.034]], { seg: s }),
    forearm: limb([[0, 0.035], [0.07, 0.036], [0.18, 0.028], [R.forearm, 0.023]], { seg: s }),
    hand: limb([[0.0, 0.024], [0.06, 0.03], [0.12, 0.026], [R.hand - 0.02, 0.016]], { seg: lite ? 6 : s, sx: 0.55, sz: 1 }),
    thigh: limb([[0, 0.078], [0.08, 0.08], [0.25, 0.064], [0.38, 0.05], [R.thigh, 0.048]], { seg: s }),
    shin: limb([[0, 0.049], [0.09, 0.053], [0.2, 0.046], [0.34, 0.033], [R.shin, 0.031]], { seg: s }),
    foot: limb([[-0.06, 0.034], [0.0, 0.038], [0.09, 0.04], [0.16, 0.03], [R.foot, 0.022]], { seg: lite ? 6 : s, sx: 0.6, sz: 1.15 }),
  };
  LIMB.n = 18; LIMB.cap = 6;
  return out;
}

// ============================================================================================ seated figure
// Padmasana, facing +z (anterior), x lateral (the figure's left is +x), seat at y = 0, crown ≈ 0.93.
export const SEAT = {
  chest: V3(0, 0.46, 0.0), head: V3(0, 0.8, 0.012), nose: V3(0, 0.783, 0.104),
  nostrilL: V3(0.012, 0.768, 0.108), nostrilR: V3(-0.012, 0.768, 0.108),
  carina: V3(0, 0.535, -0.005), larynx: V3(0, 0.68, 0.035), crown: 0.93,
};
function seatedPrims() {
  const prims = [];
  const cone = (a, b, ra, rb, k = 0.03, flat = 1) => prims.push({ type: 'cone', a, b, ra, rb, flat, k });
  const ell = (c, r, k = 0.03, ang = 0, yaw = 0) => prims.push({ type: 'ell', c, r, k, ang, yaw });
  prims.push({ ...profilePrim([0.02, 0.09, 0.19, 0.29, 0.38, 0.47, 0.55, 0.6, 0.65], [0.13, 0.165, 0.152, 0.13, 0.137, 0.152, 0.165, 0.15, 0.07], [0.105, 0.118, 0.108, 0.098, 0.105, 0.112, 0.1, 0.08, 0.05]), k: 0 });
  cone([0, 0.6, -0.008], [0, 0.72, 0.004], 0.047, 0.041, 0.035);
  ell([0, 0.8, 0.012], [0.082, 0.112, 0.098], 0.04);                // skull
  ell([0, 0.745, 0.05], [0.055, 0.045, 0.055], 0.03);               // jaw
  ell([0, 0.785, 0.098], [0.015, 0.026, 0.02], 0.012, -0.25);       // nose
  ell([0, 0.905, -0.012], [0.034, 0.026, 0.034], 0.02);             // hair knot
  for (const s of [-1, 1]) {
    ell([s * 0.168, 0.565, -0.004], [0.055, 0.052, 0.058], 0.035);  // deltoid
    cone([s * 0.175, 0.555, 0], [s * 0.235, 0.35, 0.055], 0.045, 0.036, 0.03);
    cone([s * 0.235, 0.35, 0.055], [s * 0.315, 0.175, 0.28], 0.036, 0.026, 0.02);
    cone([s * 0.315, 0.175, 0.28], [s * 0.345, 0.135, 0.355], 0.025, 0.017, 0.015, 0.6);   // hand on the knee
    cone([s * 0.09, 0.1, 0.02], [s * 0.36, 0.085, 0.3], 0.082, 0.052, 0.04);                // thigh
  }
  // the shins cross; each foot rests sole-up on the opposite thigh
  cone([-0.36, 0.085, 0.3], [0.13, 0.205, 0.17], 0.05, 0.032, 0.03);
  cone([0.13, 0.205, 0.17], [0.27, 0.24, 0.1], 0.034, 0.028, 0.02, 0.6);
  cone([0.36, 0.085, 0.3], [-0.14, 0.15, 0.135], 0.05, 0.032, 0.03);
  cone([-0.14, 0.15, 0.135], [-0.28, 0.19, 0.07], 0.034, 0.028, 0.02, 0.6);
  return prims;
}
export function seatedGeometry(lite = false) {
  const body = sdfBody(seatedPrims());
  return meshBody(body, [-0.5, -0.04, -0.2], [0.5, 0.97, 0.46], lite ? 0.024 : 0.016);
}
// signed distance of the body (for sampling the surface / inside)
export function seatedField() { return sdfBody(seatedPrims()).field3; }

// lungs: two smooth lobed bodies, cut concave by the diaphragm dome and kept apart by the mediastinum
function lungPrims(s) {
  const k = 0.035;
  return [
    { type: 'ell', c: [s * 0.058, 0.585, -0.01], r: [0.034, 0.05, 0.042], k: 0 },
    { type: 'ell', c: [s * 0.072, 0.48, -0.006], r: [0.06, 0.11, 0.075], k },
    { type: 'ell', c: [s * 0.078, 0.395, 0.0], r: [0.064, 0.06, 0.082], k },
  ];
}
export function lungField(s) {
  const prims = lungPrims(s);
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) d = smin(d, sdPrim3(p, x, y, z), p.k ?? 0);
    d = Math.max(d, -(Math.hypot(x - s * 0.06, y - 0.2, z * 1.2) - 0.175));     // diaphragm under the base
    d = Math.max(d, 0.022 - Math.abs(x));                                        // mediastinum
    if (s > 0) d = Math.max(d, -(Math.hypot((x - 0.035) / 0.05, (y - 0.43) / 0.07, (z - 0.06) / 0.05) - 1) * 0.04);   // cardiac notch
    return d;
  };
}
export function lungGeometry(s, lite = false) {
  const f = lungField(s);
  const body = { field2: () => -1, column: () => undefined, columnField: f };
  // a tiny wrapper so meshBody samples the full box (the field is cheap)
  return meshBody(body, [s > 0 ? 0.0 : -0.17, 0.3, -0.11], [s > 0 ? 0.17 : 0.0, 0.66, 0.11], lite ? 0.012 : 0.008);
}
// random points inside a lung
export function sampleLung(s, n, seed) {
  const f = lungField(s), r = rng(seed), out = [];
  while (out.length < n) {
    const x = s * r() * 0.16, y = 0.3 + r() * 0.36, z = -0.11 + r() * 0.22;
    if (f(x, y, z) < -0.004) out.push(V3(x, y, z));
  }
  return out;
}

// bronchial tree: trachea → two main bronchi → recursive branching towards points inside each lung.
// Returns segments [[a, b, gen], ...] (gen 0 = trachea).
export function bronchialTree(lite = false) {
  const segs = [], r = rng(611);
  const GEN = lite ? 5 : 6;
  segs.push([SEAT.larynx.clone(), SEAT.carina.clone(), 0]);
  for (const s of [-1, 1]) {
    const f = lungField(s), att = sampleLung(s, 220, s > 0 ? 91 : 92);
    const main = V3(s * 0.052, 0.5, -0.004);
    segs.push([SEAT.carina.clone(), main, 1]);
    const grow = (a, dir, len, gen) => {
      if (gen > GEN + 1) return;
      for (let c = 0; c < 2; c++) {
        const tgt = att[Math.floor(r() * att.length)];
        const d = tgt.clone().sub(a).normalize().multiplyScalar(0.55).add(dir.clone().multiplyScalar(0.45));
        d.x += (r() - 0.5) * 0.5; d.y += (r() - 0.5) * 0.4; d.z += (r() - 0.5) * 0.5; d.normalize();
        let l = len * (0.78 + r() * 0.25);
        let b = a.clone().addScaledVector(d, l);
        for (let k = 0; k < 4 && f(b.x, b.y, b.z) > -0.003; k++) { l *= 0.6; b = a.clone().addScaledVector(d, l); }
        if (f(b.x, b.y, b.z) > 0.004 && gen > 2) continue;
        segs.push([a.clone(), b, gen]);
        grow(b, d, len * 0.74, gen + 1);
      }
    };
    grow(main, V3(s * 0.6, -0.8, 0).normalize(), 0.06, 2);
  }
  return segs;
}

// airway curves (in the seated frame): outside air → nostril → nasal cavity → pharynx → larynx → carina
export function airwayCurve(side, out = false) {
  const n = side > 0 ? SEAT.nostrilL : SEAT.nostrilR, s = side * 0.012;
  const pts = out
    ? [SEAT.carina.clone(), V3(0, 0.62, 0.012), SEAT.larynx.clone(), V3(0, 0.735, -0.01), V3(s * 0.6, 0.79, 0.0), V3(s, 0.785, 0.07), n.clone(),
      V3(s * 1.6, 0.745, 0.17), V3(s * 3, 0.72, 0.3), V3(s * 6, 0.7, 0.46)]
    : [V3(s * 4, 0.7, 0.42), V3(s * 2, 0.725, 0.26), V3(s * 1.2, 0.752, 0.16), n.clone(), V3(s, 0.785, 0.07), V3(s * 0.6, 0.79, 0.0),
      V3(0, 0.735, -0.01), SEAT.larynx.clone(), V3(0, 0.62, 0.012), SEAT.carina.clone()];
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

// ============================================================================================ stone & ghats
export function stoneTexture(seed = 5) {
  const N = 512, c = mkCanvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const n = noise2(u * 6 + seed, v * 6) * 0.1 + noise2(u * 24, v * 24 + seed) * 0.06 + noise2(u * 90, v * 90) * 0.05;
    const streak = noise2(u * 2, v * 30 + seed) * 0.05;
    const k = 0.92 + n + streak;
    const i = (y * N + x) * 4;
    d[i] = Math.min(255, 168 * k); d[i + 1] = Math.min(255, 128 * k); d[i + 2] = Math.min(255, 96 * k); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}

// world-aligned box UVs (metres / tile) for a merged geometry
export function worldUV(g, tile = 1.6) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// colour per vertex (r, g, b multipliers) so merged stones vary
function tint(g, k) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = k[0]; c[i * 3 + 1] = k[1]; c[i * 3 + 2] = k[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function mergeColored(list) {
  return mergeGeometries(list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'color'].includes(k)) n.deleteAttribute(k);
    return n;
  }));
}

// Steps descend towards -z (east, the river). Water level y = 0.
export const GHAT = { water: 0, stepZ0: -3.0, rise: 0.2, run: 0.4, lower: 3, landingY: 0.6, landingZ0: -1.8, landingZ1: 3.0, upper: 12, terraceY: 3.0, terraceZ0: 7.8, width: 90 };
export function stepHeightAt(z) {
  const G = GHAT;
  if (z < G.stepZ0) return -1;
  if (z < G.landingZ0) return G.rise * Math.min(G.lower, Math.floor((z - G.stepZ0) / G.run) + 1);
  if (z < G.landingZ1) return G.landingY;
  if (z < G.terraceZ0) return G.landingY + G.rise * Math.min(G.upper, Math.floor((z - G.landingZ1) / G.run) + 1);
  return G.terraceY;
}
export function ghatGeometry() {
  const G = GHAT, r = rng(77), parts = [];
  const course = (y0, h, z0, z1) => {   // a course of stone blocks across the whole width
    let x = -G.width / 2 + r() * -2;
    while (x < G.width / 2) {
      const w = 1.0 + r() * 2.4, j = (r() - 0.5) * 0.02, k = 0.82 + r() * 0.3, warm = 1 + (r() - 0.5) * 0.08;
      parts.push(tint(box(w - 0.025, h + j, z1 - z0, x + w / 2, y0 + (h + j) / 2, (z0 + z1) / 2), [k * warm, k, k / warm]));
      x += w;
    }
  };
  // lower flight: steps run from their front edge back to the landing (solid)
  for (let i = 0; i < G.lower; i++) course(-1.2, 1.2 + G.rise * (i + 1), G.stepZ0 + i * G.run, G.landingZ0 + 0.01);
  course(-1.2, 1.2 + G.landingY, G.landingZ0, G.landingZ1);
  for (let i = 0; i < G.upper; i++) course(-1.2, 1.2 + G.landingY + G.rise * (i + 1), G.landingZ1 + i * G.run, G.terraceZ0 + 0.01);
  course(-1.2, 1.2 + G.terraceY, G.terraceZ0, 30);
  return worldUV(mergeColored(parts), 1.4);
}

// the square plinth (chabutra) at the water's edge, centred at (x, z), top at y = top
export function plinthGeometry(size = 1.7, top = 0.36) {
  const parts = [box(size, top + 1.2, size, 0, (top - 1.2) / 2, 0), box(size + 0.08, 0.06, size + 0.08, 0, top - 0.03, 0)];
  for (let i = 0; i < 3; i++) parts.push(box(size + 0.2 + i * 0.25, 0.12, size + 0.2 + i * 0.25, 0, -0.06 - i * 0.12, 0));
  return worldUV(merge(parts), 1.4);
}

// a small nagara shrine: plinth, cella, curvilinear shikhara, amalaka and kalasha
export function shrineGeometry(scale = 1) {
  const parts = [box(1.3, 0.3, 1.3, 0, 0.15, 0), box(1.0, 0.9, 1.0, 0, 0.75, 0), box(1.12, 0.08, 1.12, 0, 1.24, 0)];
  // the shikhara: a ribbed, curved tower (lathe with 4-fold offsets in the profile)
  const N = 22, pts = [];
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push(new THREE.Vector2(0.52 * (1 - Math.pow(u, 1.8)) + 0.12 * Math.pow(u, 1.8), 1.28 + u * 1.5)); }
  const sh = new THREE.LatheGeometry(pts, 16), p = sh.attributes.position;
  for (let i = 0; i < p.count; i++) {   // square-ish section with ribs
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), r0 = Math.hypot(x, z);
    const sq = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    const k = lerp(1, Math.min(sq, 1.25), 0.75) * (1 + 0.05 * Math.cos(a * 12));
    p.setX(i, Math.cos(a) * r0 * k); p.setZ(i, Math.sin(a) * r0 * k);
  }
  sh.computeVertexNormals();
  parts.push(sh);
  for (let i = 1; i <= 4; i++) parts.push(box(1.1 - i * 0.12, 0.04, 1.1 - i * 0.12, 0, 1.28 + i * 0.3, 0));   // bhumi bands
  parts.push(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 18).translate(0, 2.82, 0));                          // amalaka
  parts.push(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1.3, 1).translate(0, 2.95, 0), new THREE.ConeGeometry(0.025, 0.2, 6).translate(0, 3.1, 0));
  const g = merge(parts); g.scale(scale, scale, scale);
  return worldUV(g, 1.2);
}

// the cloth umbrella of the bathing ghats: a bamboo pole and a shallow, drooping cone of panels
export function umbrellaGeometry() {
  const pole = new THREE.CylinderGeometry(0.035, 0.045, 2.5, 6).translate(0, 1.25, 0);
  const N = 12, pts = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(new THREE.Vector2(1.25 * u + 1e-3, 2.62 - 0.42 * Math.pow(u, 1.3))); }
  const canopy = new THREE.LatheGeometry(pts.reverse(), N), p = canopy.attributes.position;
  for (let i = 0; i < p.count; i++) {   // scalloped panels sag between the ribs
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), rr = Math.hypot(x, z);
    p.setY(i, p.getY(i) - 0.06 * (rr / 1.25) * (0.5 - 0.5 * Math.cos(a * N)));
  }
  canopy.computeVertexNormals();
  return { pole, canopy };
}

// a wooden river boat (open hull), bow along +x
export function boatGeometry() {
  const L = 5.2, N = 20, pos = [], idx = [];
  const sec = (u) => { const w = 0.75 * Math.pow(Math.sin(Math.PI * u), 0.6); const h = 0.5 + 0.35 * Math.pow(Math.abs(u - 0.5) * 2, 3); return [w, h]; };
  for (let i = 0; i <= N; i++) {
    const u = i / N, [w, h] = sec(u), x = (u - 0.5) * L;
    for (let j = 0; j <= 6; j++) { const a = -Math.PI / 2 + (j / 6) * Math.PI; pos.push(x, h * 0 + Math.cos(a) * -0.42 + 0.42 + (h - 0.5) * (Math.abs(Math.sin(a))), Math.sin(a) * w); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 6; j++) { const a = i * 7 + j, b = a + 7; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const deck = box(L * 0.45, 0.04, 0.9, 0.2, 0.42, 0);
  return merge([g, deck]);
}

// ============================================================================================ the world
// Coarse coastlines, [lon, lat] (east +). Enough for a dotted globe; not a map.
export const LAND = [
  // North America
  [[-166, 68.5], [-163, 63], [-165, 60], [-158, 58], [-153, 57.5], [-150, 61], [-145, 60], [-137, 58.5], [-133, 55], [-130, 54], [-124, 49], [-124, 42], [-122, 37], [-118, 34], [-117, 32.5],
    [-112, 27.5], [-110, 23.5], [-105, 20], [-97, 16], [-92, 14.5], [-87, 13], [-84, 9.5], [-80, 8], [-77.5, 8.5], [-79.5, 9.5], [-83.5, 11], [-83.2, 15], [-87.5, 15.8], [-88.3, 18.5],
    [-87, 21.5], [-90.5, 21], [-91, 18.6], [-94.5, 18.2], [-97.5, 22], [-97.5, 26], [-94, 29.5], [-89.5, 30], [-85, 29.7], [-82.7, 27.5], [-81, 25.2], [-80, 27], [-81.3, 30.5], [-80, 32.5],
    [-76, 35], [-76, 37], [-74, 40.5], [-70, 41.5], [-70.5, 43.5], [-66.5, 44.5], [-64, 45.5], [-61, 45.5], [-60, 47], [-64.5, 49], [-59, 50], [-56, 52], [-58, 54.5], [-61.5, 56], [-65, 60],
    [-70, 59], [-72, 61.5], [-78, 62.5], [-77, 60], [-77, 56], [-79, 54], [-82, 52.5], [-87, 55.5], [-92.5, 57], [-94.5, 59], [-94, 61], [-90.5, 64], [-87, 64.5], [-85, 66.5], [-81.5, 68],
    [-86, 69.5], [-95, 68], [-98, 67.8], [-108, 68], [-115, 68], [-124, 69.5], [-135, 69], [-141, 69.6], [-148, 70.3], [-156, 71.3], [-162, 69.8]],
  [[-79, 63], [-64, 61.5], [-62, 66.5], [-70, 70.5], [-80, 73.5], [-90, 73.5], [-88, 70], [-80, 67]],                // Baffin
  [[-95, 74], [-80, 74], [-62, 82], [-75, 83], [-95, 81], [-100, 78]],                                               // Ellesmere
  [[-125, 71], [-118, 73.5], [-105, 73.5], [-100, 70], [-108, 68.8], [-118, 69]],                                    // Victoria / Banks
  [[-73, 78], [-60, 82], [-30, 83.5], [-12, 81.5], [-18, 77], [-22, 72], [-22, 70], [-32, 68], [-40, 65], [-43, 60], [-48, 61], [-52, 64.5], [-54, 68], [-55, 71], [-58, 75.5], [-68, 77]], // Greenland
  [[-85, 21.9], [-82, 23.2], [-77, 22], [-74.2, 20.2], [-77.5, 19.8], [-80, 21.7]],                                  // Cuba
  [[-74.5, 18.5], [-72.8, 19.9], [-69.9, 19.7], [-68.4, 18.5], [-71, 17.8], [-74.3, 18.1]],                          // Hispaniola
  // South America
  [[-77.5, 8.5], [-75.5, 10.5], [-72, 12], [-68, 10.5], [-62, 10.7], [-60, 8.5], [-57, 6], [-52, 4.5], [-50, 1.8], [-48.5, -1], [-44, -2.5], [-40, -3], [-35, -5.5], [-35, -9], [-37.5, -12.5],
    [-39, -16.5], [-40.5, -21], [-44, -23], [-48, -26], [-49, -28.5], [-53, -33.5], [-55, -35], [-57.5, -35.5], [-57, -38], [-62, -39], [-65, -41], [-64, -43], [-67.5, -46.5], [-66, -48],
    [-68.5, -50.5], [-69, -52.5], [-71, -54], [-74.5, -52], [-75.5, -48], [-74, -44], [-73.5, -40], [-73.5, -37], [-71.5, -32], [-71.5, -28], [-70.5, -23], [-70.2, -18.5], [-75, -15.5],
    [-77, -12], [-79.5, -7.5], [-81, -5], [-80, -2], [-80.5, 0.5], [-78.5, 2], [-77.5, 4], [-77.4, 7]],
  // Africa
  [[-17, 21], [-16.5, 24], [-13, 27.5], [-9.8, 30], [-9, 32.5], [-6, 35.8], [-2, 35.1], [3, 36.8], [10, 37.2], [11, 33.5], [15, 32.3], [20, 30.5], [20, 32.5], [25, 32], [29, 31], [32.5, 31.3],
    [34, 27.5], [35.8, 24], [37.4, 18.5], [39, 15.6], [43.3, 12.6], [44, 11], [51.2, 11.8], [51, 10.4], [49, 6], [46, 2], [42, -1], [40, -3.5], [39, -6], [39.5, -10.5], [40.5, -15], [37, -17.5],
    [35.3, -22], [32.8, -26], [31, -29.5], [27.5, -33.5], [25, -34], [20, -34.8], [18.3, -34], [17.8, -31], [15.2, -26.5], [14.5, -22.5], [11.8, -17], [12.3, -13], [13.5, -11], [12.2, -6],
    [9, -1.5], [9.5, 2.5], [9.5, 4], [6, 4.3], [3, 6.3], [0, 5.6], [-4.5, 5.2], [-7.5, 4.4], [-11.5, 6.9], [-13.3, 9], [-15, 11], [-16.8, 13], [-17.5, 14.7], [-16.5, 16.5], [-16.2, 19.5]],
  [[44.2, -25], [47.2, -25], [50.4, -15.5], [49.3, -12], [47, -15], [44, -17], [43.3, -22]],                          // Madagascar
  // Eurasia
  [[-9.5, 37], [-9, 39], [-9.5, 43], [-8, 43.7], [-1.8, 43.4], [-1.2, 46], [-4.5, 48], [-1.5, 48.7], [1.5, 50.2], [4, 51.5], [5, 53.4], [8.5, 53.8], [8.2, 55.5], [8.5, 57], [10.5, 57.7],
    [10.5, 56], [12, 54.2], [14, 54], [18.5, 54.6], [21, 55.5], [21.2, 57], [24, 57.5], [24, 59.4], [28, 59.5], [30.2, 59.9], [25, 60.2], [22, 60], [21.5, 61.5], [21.3, 63], [25, 65],
    [24.5, 65.8], [22, 65.6], [19, 63.5], [17.5, 62], [17.3, 60.6], [19, 59.8], [18, 59], [16.5, 57], [16, 56.2], [14.5, 56], [12.8, 55.6], [11.1, 59], [10.5, 59.5], [8, 58], [5.5, 58.7],
    [5, 61], [5, 62.5], [8, 63.5], [11, 64.8], [13.5, 67.5], [15.5, 68.6], [18, 69.8], [22, 70.3], [26, 71], [29, 70.5], [31, 70], [33, 69.3], [36, 69], [41, 67.5], [40, 66], [35, 66],
    [34.5, 64.5], [37.5, 64.4], [41, 65.5], [44, 66.5], [44, 68.5], [53, 68.5], [58, 69], [60, 69.8], [66, 69.5], [69, 73], [73, 72.5], [80, 73.5], [87, 74], [95, 76], [104, 77.7],
    [113, 73.7], [120, 73], [129, 72], [140, 72.5], [150, 71.5], [160, 70], [170, 70], [180, 69], [190, 66], [188, 64.5], [182, 65], [179, 62.5], [173, 61], [164, 60], [163, 57.5],
    [162, 54], [158, 51], [156.5, 51], [156, 57], [161, 61.5], [156, 61.6], [152, 59], [143, 59.4], [137, 54], [140.5, 52], [141, 48], [138, 45], [133, 42.8], [130, 42.5], [129.5, 40],
    [129, 35.3], [126.5, 34.5], [126.5, 37.5], [125, 39.5], [121.5, 39], [121, 40.8], [118, 39], [117.8, 38.3], [119, 37], [122.5, 37], [120.5, 36], [119, 34.8], [121, 32], [122, 30],
    [121, 28], [119.5, 25.5], [116.5, 22.8], [113.5, 22.3], [110.5, 20.8], [108.5, 21.5], [106.5, 20], [105.8, 18.8], [107, 17], [108.8, 15.5], [109.3, 12], [107, 10.5], [105, 8.6],
    [104.8, 10.3], [103, 11], [102, 12.4], [100.2, 13.4], [99.2, 10.5], [100.3, 7], [101.3, 6.8], [103.4, 4], [104.3, 1.4], [103.5, 1.3], [101.3, 2.8], [100.4, 5.5], [98.3, 8.2],
    [98.5, 10.8], [97.6, 16.5], [94.6, 16.2], [94.2, 18.8], [92.3, 20.8], [91.8, 22.4], [90.5, 22], [88.8, 21.6], [86.9, 20.8], [85, 19.4], [82.3, 16.6], [80.3, 15.6], [80.2, 13.2],
    [79.8, 10.3], [78.2, 8.9], [77.5, 8.1], [76.5, 8.9], [75.7, 11.5], [74.7, 13], [73.5, 16], [72.8, 19], [72.9, 21], [72.6, 22], [70.2, 20.8], [69, 22.3], [70.4, 23], [68.4, 23.6],
    [67, 24.8], [66.6, 25.4], [64.5, 25.2], [61.6, 25.2], [57.3, 25.8], [56.4, 27.1], [54.8, 26.5], [52, 27.8], [50.7, 29], [50, 30.2], [48.5, 30], [48, 29.5], [49.5, 27], [50.2, 26.2],
    [51.5, 24.6], [54, 24.2], [56, 24.9], [56.4, 26.4], [57.2, 23.8], [58.7, 23.6], [59.8, 22.3], [57.8, 19], [55.2, 17.4], [52.2, 15.6], [48.7, 14], [45, 12.8], [43.4, 12.7], [42.6, 15],
    [41.2, 18.5], [39.1, 21.8], [38.4, 24], [36.8, 26.2], [35, 28.1], [34.9, 29.5], [34.2, 31.3], [35, 33], [35.9, 35.4], [36.2, 36.6], [35, 36.6], [32.5, 36.1], [30.5, 36.4], [28, 36.7],
    [26.5, 38.3], [26.2, 40], [29, 41], [31.3, 41.2], [35, 42], [38, 41], [41.5, 41.5], [40, 43.4], [37.5, 44.7], [38.5, 46.8], [35, 45.3], [33.5, 44.5], [32.5, 45.4], [31, 46.6], [30, 45.4],
    [28.7, 44.3], [28, 43], [28.7, 41.3], [26, 40.8], [24, 40.7], [23.5, 39.5], [22.8, 37.5], [21.6, 36.8], [21.2, 38.3], [20.2, 39.6], [19.4, 41.8], [18.5, 42.5], [15.5, 44], [13.7, 45.6],
    [12.3, 45.3], [12.4, 44.2], [14, 42.6], [16, 41.4], [18.5, 40.2], [16.6, 38.4], [15.7, 38], [15.6, 40], [12.4, 41.8], [10.5, 43], [9, 44.4], [7.5, 43.8], [5, 43.3], [3, 43.2],
    [3.2, 41.9], [0.8, 41], [0, 39.5], [-0.5, 38.3], [-2, 36.7], [-4.5, 36.7], [-6, 36.2], [-7.5, 37.2]],
  [[-5.7, 50], [1.5, 51], [1.7, 52.7], [0, 53.5], [-1.5, 55], [-2, 57], [-1.8, 57.6], [-4, 58.6], [-5, 58.6], [-6.2, 56.5], [-5, 55.2], [-3, 54.4], [-3.2, 53.4], [-4.5, 52.8], [-5.2, 51.7], [-3, 51.5]],  // Britain
  [[-6, 52], [-6, 54], [-7.5, 55.3], [-10, 54.2], [-10, 51.6]],                                                        // Ireland
  [[-24, 65.5], [-22, 66.4], [-15, 66.5], [-13.5, 65], [-18, 63.4], [-22.5, 63.8]],                                    // Iceland
  [[11, 78.5], [16, 80], [27, 80], [22, 77.5], [17, 76.6]],                                                            // Svalbard
  [[130, 31], [132, 34], [135, 33.5], [139, 35], [141, 36], [142, 39.5], [141.5, 41.5], [140, 41], [139.8, 40], [138.5, 38], [136.5, 37], [133, 35.5], [130.8, 34]],   // Japan
  [[140, 42], [141.5, 45.4], [145.5, 43.4], [143.5, 42], [141, 41.7]],                                                  // Hokkaido
  [[142, 46], [143.5, 49], [143, 54], [142.5, 54.3], [142, 51]],                                                        // Sakhalin
  [[120.2, 22.5], [121, 25.3], [121.9, 25], [120.8, 22]],                                                               // Taiwan
  [[79.8, 6], [79.9, 8], [80.2, 9.8], [81.9, 7.5], [81.7, 6.2], [80.6, 5.9]],                                           // Sri Lanka
  [[95.3, 5.6], [98, 4], [103.8, -1], [106, -3], [105.8, -5.8], [104.5, -5.9], [102, -4], [100.3, -1], [98.6, 1.8], [95.5, 4.5]],   // Sumatra
  [[105.2, -6.8], [106, -6], [110, -6.8], [112.5, -6.9], [114.5, -7.8], [114.4, -8.7], [110, -8.2], [106.4, -7.4]],     // Java
  [[109, 1.5], [110.5, -2], [112, -3.4], [114.5, -4], [116.5, -3], [116, 0], [117.8, 1], [119, 5], [117, 7], [115.5, 5.1], [113, 3], [111, 1.7]],   // Borneo
  [[119.5, -5.5], [120.5, -1.5], [121, 1], [125, 1.5], [123, -0.8], [121, -1], [122, -4.5], [120.8, -5.6]],              // Sulawesi
  [[131, -1.3], [134, -0.8], [138, -1.6], [141, -2.6], [145.5, -4.6], [147.5, -6.2], [150, -10.3], [147, -10.1], [144, -7.6], [141, -9.2], [138, -8.3], [137.5, -5], [134, -4], [132, -2.8]],  // New Guinea
  [[120, 18.5], [122.2, 18.5], [122, 16], [124, 13.5], [121.6, 13.8], [120.6, 14.6], [119.8, 16.3]],                    // Luzon
  [[122, 7], [124, 8.5], [126.3, 8.8], [126.2, 6.3], [125.3, 5.8], [123.7, 7.7]],                                       // Mindanao
  // Australia
  [[113.5, -22], [114, -26.5], [115, -29.5], [115, -33.6], [117.5, -35], [123, -33.9], [126, -32.3], [131, -31.5], [134, -32.6], [135.8, -34.8], [137.5, -33], [138, -35.6], [140, -37.5],
    [143.5, -38.8], [146.3, -39.1], [150, -37.5], [151.2, -33.8], [153.1, -31], [153.6, -28.2], [153, -25.3], [150.8, -22.5], [149.5, -21], [146.3, -19], [145.4, -16], [143.5, -14],
    [142.5, -10.7], [141.6, -12.8], [141.5, -16.5], [140.5, -17.6], [139.3, -17.3], [137, -16], [135.9, -14.3], [136.8, -12.2], [133, -11.4], [130.4, -12.4], [129.5, -15], [126, -14],
    [125, -15.5], [122.3, -17], [121.5, -19.5], [118.7, -20.4], [116.7, -20.6]],
  [[144.6, -40.7], [148.3, -40.9], [148, -43.2], [146, -43.6], [144.7, -41.5]],                                         // Tasmania
  [[172.7, -34.5], [174.6, -36], [176, -37.6], [178.5, -37.7], [177, -39.3], [176.8, -40.3], [175.3, -41.6], [174.6, -41.2], [175, -39.8], [173.8, -39.2], [174.6, -38], [173, -35.4]],   // NZ north
  [[172.6, -40.5], [174.3, -41.2], [173.2, -43], [171.2, -44.4], [170.6, -45.9], [169, -46.6], [166.5, -46], [167, -45], [168.3, -44], [170.8, -42.7], [172, -41.4]],                    // NZ south
];
const HOLES = [[[47, 45], [53, 47], [54, 44], [52.5, 41.5], [54, 37.5], [50, 37], [49, 40], [47.5, 42.5]]];   // the Caspian Sea

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function isLand(lon, lat) {
  if (lat < -70 + 4 * Math.sin(lon * D2R * 2) + 2 * Math.sin(lon * D2R * 5)) return true;   // Antarctica
  for (const L of [lon, lon + 360]) {
    for (const h of HOLES) if (inPoly(L, lat, h)) return false;
    for (const p of LAND) if (inPoly(L, lat, p)) return true;
  }
  return false;
}
// lon / lat → unit vector (y north; lon 0 on +z, east towards +x)
export function llToVec(lon, lat, out = new THREE.Vector3()) {
  const a = lon * D2R, b = lat * D2R;
  return out.set(Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a));
}
// Fibonacci-lattice dots on land
export function landDots(n) {
  const out = [], g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = g * i;
    const v = V3(Math.cos(th) * rr, y, Math.sin(th) * rr);
    const lat = Math.asin(y) / D2R, lon = Math.atan2(v.x, v.z) / D2R;
    if (isLand(lon, lat)) out.push(v);
  }
  return out;
}
// places where people gather to practise on 21 June (major cities on every inhabited continent)
export const CITIES = [
  [77.2, 28.6], [72.9, 19.1], [77.6, 13], [88.4, 22.6], [80.3, 13.1], [78.5, 17.4], [85.3, 27.7], [79.9, 6.9], [90.4, 23.8], [67, 24.9], [74.3, 31.5],
  [116.4, 39.9], [121.5, 31.2], [139.7, 35.7], [127, 37.6], [103.8, 1.35], [106.8, -6.2], [100.5, 13.8], [121, 14.6], [105.8, 21], [114.2, 22.3],
  [151.2, -33.9], [145, -37.8], [115.9, -32], [153, -27.5], [174.8, -36.8],
  [55.3, 25.2], [51.4, 35.7], [46.7, 24.7], [37.6, 55.8], [28.9, 41], [31.2, 30], [36.8, -1.3], [3.4, 6.5], [28, -26.2], [18.4, -33.9], [38.7, 9], [-7.6, 33.6],
  [2.35, 48.9], [-0.1, 51.5], [13.4, 52.5], [12.5, 41.9], [-3.7, 40.4], [18.1, 59.3], [23.7, 38], [21, 52.2], [30.5, 50.4], [4.9, 52.4], [-9.1, 38.7],
  [-74, 40.7], [-77, 38.9], [-79.4, 43.7], [-87.6, 41.9], [-118.2, 34], [-122.4, 37.8], [-123.1, 49.3], [-99.1, 19.4], [-80.2, 25.8], [-95.4, 29.8],
  [-74.1, 4.7], [-77, -12], [-46.6, -23.5], [-43.2, -22.9], [-58.4, -34.6], [-70.7, -33.4], [-157.9, 21.3],
];
