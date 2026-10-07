// Procedural models for the textiles chapter (src/scenes/india/textiles.js): the cotton plant and its
// opening boll, the parts of a pit loom, the print blocks, three generations of chess pieces
// (chaturanga → shatranj → Staunton) and the seated figure of the closing image.
// Build-time only; every function returns plain geometry / textures / data.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU } from '../../lib/math.js';
import { noise2, noise3 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { smin, sdRoundCone2, sdEllipse2 } from '../../lib/sdfmesh.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// every part → non-indexed position + normal, so any mix of primitives merges into one geometry
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
export const merge = (list) => mergeGeometries(list.map(prep));
// the same, keeping UVs (for textured wood)
export const mergeUV = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g.clone(); for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));

// smooth lathe profile through [r, y] knots (a Catmull-Rom spline), revolved
// detail level (the 'lite' quality builds coarser revolutions)
const DETAIL = { seg: 20, k: 1 };
export function setDetail(lite) { DETAIL.seg = lite ? 8 : 18; DETAIL.k = lite ? 0.5 : 0.85; }
function lathe(knots, { seg = DETAIL.seg, n = 0, smooth = true } = {}) {
  let pts = knots.map(([r, y]) => V2(Math.max(0, r), y));
  if (smooth) pts = new THREE.SplineCurve(pts).getPoints(n || Math.max(knots.length + 2, Math.round(knots.length * 3 * DETAIL.k))).map((p) => V2(Math.max(0, p.x), p.y));
  return new THREE.LatheGeometry(pts, seg);
}
const at = (g, x, y, z) => g.translate(x, y, z);
function between(g, a, b) {
  // g spans y ∈ [-0.5, 0.5] · length 1: stretch and orient it from a to b
  const d = b.clone().sub(a), len = d.length();
  g.scale(1, len, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
const rod = (a, b, r0, r1 = r0, seg = 10) => between(new THREE.CylinderGeometry(r1, r0, 1, seg), a, b);
const ell = (rx, ry, rz, x, y, z, seg = 14) => new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.7 | 0)).scale(rx, ry, rz).translate(x, y, z);

// ------------------------------------------------------------------------------------------------ textures
export function woodTexture({ seed = 3, base = [116, 70, 38], dark = [62, 34, 16] } = {}) {
  const W = 512, H = 128, c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const ring = 0.5 + 0.5 * Math.sin((v * 22 + noise2(u * 3 + seed, v * 2) * 2.2 + noise2(u * 18, v * 9) * 0.25) * Math.PI);
    const k = Math.pow(ring, 3) * 0.55 + noise2(u * 60 + seed, v * 4) * 0.08;
    const i = (y * W + x) * 4;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = base[ch] + (dark[ch] - base[ch]) * Math.min(1, Math.max(0, k));
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}

// warm sandstone courtyard flags: large slabs, worn joints, a little lichen-dark grime
export function courtyardTexture() {
  const N = 1024, c = mkCanvas(N, N), g = c.getContext('2d'), r = rng(71);
  g.fillStyle = '#4a2e20'; g.fillRect(0, 0, N, N);
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const h = N / rows; let x = -r() * 200;
    while (x < N) {
      const w = 140 + r() * 180;
      const l = 0.75 + r() * 0.35;
      g.fillStyle = `rgb(${Math.round(132 * l)},${Math.round(86 * l)},${Math.round(60 * l)})`;
      g.fillRect(x + 3, j * h + 3, w - 6, h - 6);
      x += w;
    }
  }
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    const n = noise2(x * 0.01, y * 0.01) * 0.12 + noise2(x * 0.06, y * 0.06) * 0.06 + noise2(x * 0.4, y * 0.4) * 0.04;
    const k = 1 + n;
    d[i] *= k; d[i + 1] *= k * 0.98; d[i + 2] *= k * 0.96;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}

// the reed: a comb of fine dents (alpha)
export function reedTexture(dents = 104) {
  const W = 1024, H = 32, c = mkCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#d9c8a6';
  for (let i = 0; i <= dents; i++) g.fillRect(Math.round((i / dents) * W) - 1, 0, 2, H);
  return toTexture(c);
}

// ------------------------------------------------------------------------------------------------ cotton
// A fibre lobe of the open boll: a lumpy, puffed sphere (noise-displaced), ~unit radius.
export function lobeGeometry(seed = 1) {
  const g = new THREE.SphereGeometry(1, DETAIL.k < 0.6 ? 10 : 18, DETAIL.k < 0.6 ? 7 : 12), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.16 * noise3(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2) + 0.07 * noise3(v.x * 6 - seed, v.y * 6, v.z * 6) + 0.035 * noise3(v.x * 15, v.y * 15 + seed, v.z * 15);
    v.multiplyScalar(1 + n);
    v.y *= 1.12;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// A dried carpel wall (bur segment): a cupped, pointed shell rising along +y from its base, concave side
// towards -z (the boll's centre). Unit length ≈ 0.075.
export function burGeometry(len = 0.075, width = 0.034) {
  const NU = DETAIL.k < 0.6 ? 8 : 14, NV = DETAIL.k < 0.6 ? 5 : 9, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, w = width * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.04)), 0.7) * (1 - 0.35 * u);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      const x = v * w, y = u * len, z = 0.012 * (1 - v * v) * Math.sin(Math.PI * u) + 0.02 * u * u;   // bulges outward, tip curls out
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A frilly, deeply toothed bract (the three leafy bracts that cup the boll).
export function bractGeometry(len = 0.07, width = 0.05) {
  const NU = DETAIL.k < 0.6 ? 8 : 14, NV = DETAIL.k < 0.6 ? 5 : 8, pos = [], idx = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, 0.15 + u * 0.85)), 0.5) * (1 - 0.5 * u);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      const tooth = Math.abs(v) > 0.8 ? 0.012 * Math.abs(Math.sin(u * 30)) * (Math.abs(v) - 0.8) * 5 : 0;
      const x = v * (w + tooth), y = u * len, z = 0.018 * (1 - v * v) * u + 0.01 * u * u;
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Palmate cotton leaf (three to five lobes), lying in xz with its tip along +x, gently cupped.
export function cottonLeafGeometry(size = 0.12, seed = 1) {
  const sh = new THREE.Shape(), N = DETAIL.k < 0.6 ? 40 : 90;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU - Math.PI;
    const lobes = 0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 1.5)), 0.7);
    const notch = Math.abs(a) > 2.7 ? 0.35 : 1;      // the notch at the stalk
    const r = size * lobes * notch * (1 + 0.04 * noise2(i * 0.3, seed));
    const x = Math.cos(a) * r + size * 0.35, y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(sh, 2);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, -2.2 * (z * z) + 0.4 * x * x - 0.15 * x); }
  g.computeVertexNormals();
  return g;
}

// Cotton flower petal (cupped, with a vertex colour from a crimson eye to cream).
export function petalGeometry(len = 0.055, width = 0.042) {
  const NU = 12, NV = 8, pos = [], col = [], idx = [];
  const eye = new THREE.Color('#7a0a2a'), cream = new THREE.Color('#f4e2a0'), c = new THREE.Color();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, w = width * Math.pow(Math.sin(Math.PI * (0.12 + u * 0.8)), 0.6);
    for (let j = 0; j <= NV; j++) {
      const v = (j / NV) * 2 - 1;
      pos.push(v * w, u * len, 0.016 * (1 - v * v) * u + 0.018 * u * u);
      c.copy(eye).lerp(cream, Math.min(1, Math.max(0, (u - 0.12) / 0.25))); col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// tapering tube along a curve
export function varTube(curve, n, radial, radius) {
  const g = new THREE.TubeGeometry(curve, n, 1, radial, false), p = g.attributes.position;
  const c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    curve.getPointAt(i / n, c);
    const r = radius(i / n);
    for (let j = 0; j <= radial; j++) { const k = i * (radial + 1) + j; v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c); p.setXYZ(k, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------------ loom
// The shuttle: a boat-shaped spindle along x, brass-tipped, with a cream pirn of weft in its hollow.
export function shuttleGeometry() {
  const L = 0.16, pts = [];
  for (let i = 0; i <= 24; i++) { const y = -L + (2 * L * i) / 24, k = 1 - Math.pow(Math.abs(y) / L, 2); pts.push(V2(0.022 * Math.pow(Math.max(0, k), 0.75), y)); }
  const body = new THREE.LatheGeometry(pts, 20).rotateZ(Math.PI / 2).scale(1, 0.75, 1);
  const tipA = new THREE.ConeGeometry(0.006, 0.03, 8).rotateZ(-Math.PI / 2).translate(L + 0.01, 0, 0);
  const tipB = new THREE.ConeGeometry(0.006, 0.03, 8).rotateZ(Math.PI / 2).translate(-L - 0.01, 0, 0);
  const pirn = new THREE.CylinderGeometry(0.011, 0.011, 0.13, 12).rotateZ(Math.PI / 2).translate(0, 0.013, 0);
  return { wood: merge([body]), brass: merge([tipA, tipB]), pirn: merge([pirn]) };
}

// Print block: a carved teak block (chamfered body, a stepped top) with a turned handle, and the
// relief carved on its face (y < 0): the rosette, four diagonal leaves and a ring of dots, the
// impression the cloth shader prints. Body / relief / handle are separate geometries (three
// materials), all in the same block space: the relief face sits at y = -0.035.
export function blockGeometry(size = 0.46) {
  const h = size / 2, rr = 0.03;
  const sq = new THREE.Shape();
  sq.moveTo(-h + rr, -h); sq.lineTo(h - rr, -h); sq.quadraticCurveTo(h, -h, h, -h + rr); sq.lineTo(h, h - rr); sq.quadraticCurveTo(h, h, h - rr, h);
  sq.lineTo(-h + rr, h); sq.quadraticCurveTo(-h, h, -h, h - rr); sq.lineTo(-h, -h + rr); sq.quadraticCurveTo(-h, -h, -h + rr, -h);
  const body = new THREE.ExtrudeGeometry(sq, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 3 });
  body.rotateX(-Math.PI / 2).translate(0, -0.019, 0);              // y from -0.025 to 0.031 (+bevel)
  const top = new RoundedBoxGeometry(size * 0.78, 0.022, size * 0.78, 2, 0.008).translate(0, 0.046, 0);
  // relief: a ring of motifs at the motif scale of the cloth shader (q = 1 ↔ 0.325 m)
  const S = 0.325, parts = [];
  const ros = new THREE.Shape(), N = 48;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, r = 0.5 * S * (0.66 + 0.34 * Math.pow(Math.abs(Math.cos(4 * a)), 0.8));
    if (i === 0) ros.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ros.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const eye = new THREE.Path(); for (let i = 0; i <= 12; i++) { const a = -(i / 12) * TAU, r = 0.1 * S; if (i === 0) eye.moveTo(Math.cos(a) * r, Math.sin(a) * r); else eye.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ros.holes.push(eye);
  parts.push(new THREE.ExtrudeGeometry(ros, { depth: 0.011, bevelEnabled: false }));
  parts.push(new THREE.CylinderGeometry(0.04 * S, 0.04 * S, 0.011, 10).rotateX(Math.PI / 2).translate(0, 0, 0.0055));
  for (let k = 0; k < 4; k++) {
    const lf = new THREE.Shape(), M = 8;
    for (let i = 0; i <= M; i++) { const lt = -1 + (2 * i) / M, w = 0.12 * S * Math.max(0, 1 - lt * lt) * (1 - 0.25 * lt); const u = (0.74 + 0.22 * lt) * S; if (i === 0) lf.moveTo(u, w); else lf.lineTo(u, w); }
    for (let i = M; i >= 0; i--) { const lt = -1 + (2 * i) / M, w = 0.12 * S * Math.max(0, 1 - lt * lt) * (1 - 0.25 * lt); lf.lineTo((0.74 + 0.22 * lt) * S, -w); }
    parts.push(new THREE.ExtrudeGeometry(lf, { depth: 0.011, bevelEnabled: false }).rotateZ(Math.PI / 4 + (k * Math.PI) / 2));
  }
  const nd = DETAIL.k < 0.6 ? 0 : 10;
  for (let k = 0; k < nd; k++) { const a = (k / nd) * TAU + 0.2, r = 0.62 * S; parts.push(new THREE.CylinderGeometry(0.035 * S, 0.035 * S, 0.011, 5).rotateX(Math.PI / 2).translate(Math.cos(a) * r, Math.sin(a) * r, 0.0055)); }
  const relief = merge(parts).rotateX(Math.PI / 2).translate(0, -0.024, 0);   // faces down, bottom at -0.035
  const knob = lathe([[0.05, 0], [0.05, 0.008], [0.032, 0.016], [0.026, 0.04], [0.034, 0.05], [0.022, 0.06], [0.024, 0.08], [0.042, 0.1], [0.05, 0.12], [0.04, 0.14], [0.012, 0.152], [0, 0.154]], { seg: 12, n: 20 }).translate(0, 0.057, 0);
  return { box: mergeUV([body, top]), relief, knob };
}

// Loom parts: turned posts and uprights (with a lotus finial), carved beam-end bosses, a ratchet wheel.
export function loomParts() {
  const seg = DETAIL.k < 0.6 ? 10 : 16;
  const post = (hh, r) => lathe([[r * 1.3, 0], [r * 1.3, hh * 0.06], [r * 1.05, hh * 0.09], [r * 1.2, hh * 0.13], [r * 0.95, hh * 0.18], [r * 0.82, hh * 0.45], [r * 1.18, hh * 0.56], [r * 0.82, hh * 0.66], [r * 0.85, hh * 0.86], [r * 1.15, hh * 0.92], [r * 1.25, hh]], { seg, n: 40 });
  const upright = (
    lathe([[0.075, 0], [0.075, 0.06], [0.055, 0.09], [0.065, 0.12], [0.045, 0.16], [0.038, 0.5], [0.052, 0.56], [0.036, 0.62], [0.034, 1.2], [0.05, 1.26], [0.036, 1.32], [0.034, 1.6], [0.05, 1.64], [0.054, 1.74], [0.04, 1.77], [0.028, 1.8], [0.05, 1.84], [0.055, 1.88], [0.03, 1.94], [0.012, 1.99], [0, 2.0]], { seg, n: 90 }));
  const boss = lathe([[0, -0.035], [0.075, -0.035], [0.09, -0.025], [0.085, -0.012], [0.095, 0.0], [0.09, 0.015], [0.07, 0.03], [0.04, 0.035], [0, 0.036]], { seg: seg + 4, n: 30 });
  const teeth = [];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; teeth.push(new THREE.BoxGeometry(0.03, 0.02, 0.022).translate(0.1, 0, 0).rotateY(a)); }
  const ratchet = mergeUV([new THREE.CylinderGeometry(0.1, 0.1, 0.022, 24), ...teeth]);
  const pawl = new THREE.BoxGeometry(0.02, 0.15, 0.02);
  return { post, upright, boss: boss.rotateZ(Math.PI / 2), ratchet: ratchet.rotateZ(Math.PI / 2), pawl };
}

// ------------------------------------------------------------------------------------------------ chess
// Three generations of the same six pieces. Types: 0 king, 1 counsellor/queen, 2 elephant/bishop,
// 3 horse/knight, 4 chariot/rook, 5 foot soldier/pawn. Base on y = 0; figurative pieces face +z.
const baseKnots = (r = 0.07, h = 0.024) => [[0, 0], [r, 0], [r * 1.03, h * 0.5], [r * 0.86, h], [0, h]];
const plinth = (r = 0.07, h = 0.024) => lathe(baseKnots(r, h), { smooth: false });

function chaturanga(type) {
  switch (type) {
    case 0: {   // raja: turned body under a royal parasol (chhatra)
      const body = lathe([[0, 0], [0.08, 0], [0.082, 0.015], [0.064, 0.028], [0.05, 0.045], [0.04, 0.1], [0.038, 0.14], [0.055, 0.152], [0.056, 0.16], [0.04, 0.166], [0.032, 0.19], [0.02, 0.2], [0.006, 0.206], [0, 0.207]]);
      const stem = rod(V3(0, 0.2, 0), V3(0, 0.245, 0), 0.006);
      const canopy = lathe([[0, 0.252], [0.022, 0.249], [0.048, 0.238], [0.068, 0.222], [0.074, 0.214], [0.068, 0.213], [0.046, 0.226], [0.018, 0.236], [0, 0.238]], { seg: 28 });
      const fin = at(new THREE.SphereGeometry(0.011, 12, 8), 0, 0.262, 0);
      const bells = [];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; bells.push(at(new THREE.SphereGeometry(0.006, 8, 6), Math.cos(a) * 0.07, 0.209, Math.sin(a) * 0.07)); }
      return merge([body, stem, canopy, fin, ...bells]);
    }
    case 1: {   // mantri: a waisted body crowned by a lotus bud
      const body = lathe([[0, 0], [0.075, 0], [0.077, 0.014], [0.06, 0.026], [0.048, 0.04], [0.036, 0.09], [0.034, 0.12], [0.05, 0.13], [0.05, 0.137], [0.034, 0.142], [0.03, 0.15], [0, 0.15]]);
      const bud = lathe([[0, 0.145], [0.03, 0.15], [0.04, 0.168], [0.036, 0.186], [0.022, 0.204], [0.008, 0.216], [0, 0.22]]);
      const petals = [];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const g = ell(0.012, 0.03, 0.006, 0, 0, 0, 10); g.rotateX(-0.3); g.rotateY(-a - Math.PI / 2); petals.push(g.translate(Math.cos(a) * 0.036, 0.172, Math.sin(a) * 0.036)); }
      return merge([body, bud, ...petals]);
    }
    case 2: {   // gaja: an elephant with a howdah
      const parts = [plinth(0.075)];
      parts.push(ell(0.05, 0.047, 0.068, 0, 0.11, -0.005, 20));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(rod(V3(sx * 0.03, 0.022, sz * 0.038), V3(sx * 0.03, 0.1, sz * 0.038), 0.017, 0.018, 10));
      parts.push(ell(0.038, 0.04, 0.036, 0, 0.135, 0.066, 18));
      for (const sx of [-1, 1]) parts.push(ell(0.006, 0.036, 0.03, sx * 0.04, 0.138, 0.054, 12).rotateY(sx * 0.2));
      const trunk = new THREE.CatmullRomCurve3([V3(0, 0.125, 0.095), V3(0, 0.095, 0.118), V3(0, 0.06, 0.122), V3(0, 0.032, 0.132), V3(0, 0.026, 0.146)]);
      parts.push(varTube(trunk, 20, 8, (u) => 0.016 - 0.008 * u));
      for (const sx of [-1, 1]) parts.push(rod(V3(sx * 0.018, 0.105, 0.09), V3(sx * 0.024, 0.085, 0.13), 0.006, 0.0015, 8));
      parts.push(at(new THREE.BoxGeometry(0.07, 0.026, 0.07), 0, 0.165, -0.01));
      parts.push(lathe([[0, 0.178], [0.03, 0.178], [0.032, 0.188], [0.022, 0.2], [0.006, 0.207], [0, 0.208]]).translate(0, 0, -0.01));
      parts.push(rod(V3(0, 0.06, -0.068), V3(0, 0.03, -0.074), 0.005, 0.003, 6));
      return merge(parts);
    }
    case 3: {   // ashva: a horse with a saddle cloth
      const parts = [plinth(0.072)];
      parts.push(ell(0.032, 0.034, 0.066, 0, 0.1, -0.004, 18));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(rod(V3(sx * 0.018, 0.022, sz * 0.042), V3(sx * 0.018, 0.095, sz * 0.04), 0.009, 0.012, 8));
      parts.push(rod(V3(0, 0.11, 0.045), V3(0, 0.168, 0.07), 0.024, 0.016, 12));
      const head = ell(0.017, 0.019, 0.042, 0, 0, 0, 14); head.rotateX(0.55); parts.push(head.translate(0, 0.168, 0.094));
      for (const sx of [-1, 1]) parts.push(new THREE.ConeGeometry(0.006, 0.022, 6).translate(sx * 0.009, 0.19, 0.072));
      parts.push(at(new THREE.BoxGeometry(0.008, 0.062, 0.014).rotateX(0.42), 0, 0.146, 0.046));
      parts.push(rod(V3(0, 0.11, -0.066), V3(0, 0.05, -0.084), 0.009, 0.004, 8));
      parts.push(at(new THREE.BoxGeometry(0.07, 0.008, 0.06), 0, 0.132, -0.006));
      return merge(parts);
    }
    case 4: {   // ratha: a two-wheeled chariot under an arched canopy
      const parts = [at(new THREE.BoxGeometry(0.16, 0.026, 0.14), 0, 0.013, 0)];
      parts.push(at(new THREE.BoxGeometry(0.1, 0.07, 0.09), 0, 0.06, 0));
      parts.push(new THREE.CylinderGeometry(0.058, 0.058, 0.1, 18, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.095, 0));
      parts.push(new THREE.ConeGeometry(0.012, 0.04, 8).translate(0, 0.17, 0));
      for (const sx of [-1, 1]) {
        parts.push(new THREE.TorusGeometry(0.042, 0.008, 8, 24).rotateY(Math.PI / 2).translate(sx * 0.07, 0.05, 0));
        for (let k = 0; k < 4; k++) parts.push(at(new THREE.BoxGeometry(0.006, 0.084, 0.006).rotateX((k * Math.PI) / 4), sx * 0.07, 0.05, 0));
        parts.push(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 10).rotateZ(Math.PI / 2).translate(sx * 0.074, 0.05, 0));
      }
      parts.push(rod(V3(0, 0.03, 0.05), V3(0, 0.045, 0.13), 0.006));
      return merge(parts);
    }
    default: {  // padati: a foot soldier with a round shield
      const body = lathe([[0, 0], [0.066, 0], [0.068, 0.013], [0.052, 0.024], [0.04, 0.04], [0.032, 0.07], [0.038, 0.085], [0.028, 0.093], [0.016, 0.1], [0, 0.1]]);
      const head = at(new THREE.SphereGeometry(0.024, 16, 12), 0, 0.118, 0);
      const turban = ell(0.028, 0.015, 0.028, 0, 0.134, 0, 14);
      const shield = new THREE.CylinderGeometry(0.03, 0.03, 0.007, 18).rotateX(Math.PI / 2).translate(0.0, 0.07, 0.04);
      return merge([body, head, turban, shield]);
    }
  }
}

function shatranj(type) {
  // the abstract, aniconic pieces of the Persian and Arab game: turned and carved, no figures
  switch (type) {
    case 0: return merge([lathe([[0, 0], [0.076, 0], [0.078, 0.014], [0.06, 0.026], [0.056, 0.12], [0.048, 0.15], [0.03, 0.166], [0, 0.17]]), at(new THREE.SphereGeometry(0.018, 12, 8), -0.024, 0.168, 0), at(new THREE.SphereGeometry(0.018, 12, 8), 0.024, 0.168, 0)]);
    case 1: return merge([lathe([[0, 0], [0.07, 0], [0.072, 0.014], [0.056, 0.026], [0.052, 0.11], [0.042, 0.13], [0.024, 0.145], [0, 0.15]]), at(new THREE.SphereGeometry(0.014, 12, 8), 0, 0.152, 0)]);
    case 2: {
      const g = lathe([[0, 0], [0.07, 0], [0.072, 0.013], [0.056, 0.024], [0.054, 0.08], [0.046, 0.11], [0.026, 0.125], [0, 0.128]]);
      const t1 = new THREE.ConeGeometry(0.013, 0.04, 10).rotateZ(-0.5).translate(0.03, 0.13, 0);
      const t2 = new THREE.ConeGeometry(0.013, 0.04, 10).rotateZ(0.5).translate(-0.03, 0.13, 0);
      return merge([g, t1, t2]);
    }
    case 3: {
      const g = lathe([[0, 0], [0.068, 0], [0.07, 0.013], [0.055, 0.024], [0.05, 0.09], [0.04, 0.11], [0, 0.116]]);
      const nub = new THREE.ConeGeometry(0.022, 0.055, 10).rotateX(0.7).translate(0, 0.122, 0.022);
      return merge([g, nub]);
    }
    case 4: {
      const g = lathe([[0, 0], [0.072, 0], [0.074, 0.014], [0.058, 0.024], [0.055, 0.1], [0, 0.1]], { smooth: false });
      const h1 = at(new THREE.BoxGeometry(0.034, 0.06, 0.07).rotateZ(-0.35), 0.03, 0.122, 0);
      const h2 = at(new THREE.BoxGeometry(0.034, 0.06, 0.07).rotateZ(0.35), -0.03, 0.122, 0);
      return merge([g, h1, h2]);
    }
    default: return lathe([[0, 0], [0.06, 0], [0.062, 0.012], [0.05, 0.02], [0.048, 0.06], [0.04, 0.085], [0.022, 0.1], [0, 0.104]]);
  }
}

function staunton(type) {
  switch (type) {
    case 0: return merge([lathe([[0, 0], [0.08, 0], [0.082, 0.014], [0.07, 0.024], [0.056, 0.034], [0.046, 0.052], [0.034, 0.14], [0.032, 0.16], [0.052, 0.168], [0.052, 0.175], [0.034, 0.18], [0.038, 0.19], [0.048, 0.21], [0.046, 0.218], [0.02, 0.222], [0, 0.222]]),
      at(new THREE.BoxGeometry(0.013, 0.046, 0.013), 0, 0.244, 0), at(new THREE.BoxGeometry(0.034, 0.012, 0.013), 0, 0.25, 0)]);
    case 1: {
      const g = lathe([[0, 0], [0.078, 0], [0.08, 0.013], [0.068, 0.022], [0.054, 0.032], [0.045, 0.05], [0.032, 0.13], [0.03, 0.15], [0.05, 0.158], [0.05, 0.165], [0.032, 0.17], [0.036, 0.18], [0.046, 0.2], [0.044, 0.205], [0, 0.2]]);
      const balls = [at(new THREE.SphereGeometry(0.014, 12, 8), 0, 0.214, 0)];
      for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; balls.push(at(new THREE.SphereGeometry(0.0075, 8, 6), Math.cos(a) * 0.043, 0.207, Math.sin(a) * 0.043)); }
      return merge([g, ...balls]);
    }
    case 2: return merge([lathe([[0, 0], [0.073, 0], [0.075, 0.012], [0.064, 0.02], [0.05, 0.03], [0.04, 0.045], [0.03, 0.1], [0.028, 0.12], [0.044, 0.126], [0.044, 0.132], [0.026, 0.138], [0.034, 0.15], [0.038, 0.165], [0.032, 0.185], [0.018, 0.2], [0.006, 0.207], [0, 0.208]]), at(new THREE.SphereGeometry(0.009, 10, 8), 0, 0.214, 0)]);
    case 3: {
      const base = lathe([[0, 0], [0.075, 0], [0.077, 0.012], [0.066, 0.022], [0.05, 0.032], [0.045, 0.045], [0, 0.045]]);
      const P = [[-0.042, 0.04], [-0.047, 0.1], [-0.038, 0.15], [-0.022, 0.18], [-0.013, 0.207], [0.0, 0.186], [0.022, 0.176], [0.054, 0.138], [0.066, 0.122], [0.06, 0.104], [0.04, 0.104], [0.02, 0.11], [0.013, 0.094], [0.034, 0.07], [0.04, 0.04]];
      const sh = new THREE.Shape(P.map(([x, y]) => V2(x, y)));
      const head = new THREE.ExtrudeGeometry(sh, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.006, bevelSegments: 2, curveSegments: 4 });
      head.translate(0, 0, -0.016); head.rotateY(-Math.PI / 2);
      return merge([base, head]);
    }
    case 4: {
      const g = lathe([[0, 0], [0.075, 0], [0.077, 0.012], [0.068, 0.02], [0.055, 0.028], [0.046, 0.04], [0.042, 0.11], [0.052, 0.118], [0.054, 0.15], [0.04, 0.15], [0.04, 0.14], [0, 0.14]], { smooth: false, seg: 28 });
      const cren = [];
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; const b = new THREE.BoxGeometry(0.022, 0.02, 0.016); b.rotateY(-a); cren.push(b.translate(Math.cos(a) * 0.046, 0.16, Math.sin(a) * 0.046)); }
      return merge([g, ...cren]);
    }
    default: return merge([lathe([[0, 0], [0.07, 0], [0.072, 0.01], [0.066, 0.016], [0.06, 0.022], [0.048, 0.03], [0.036, 0.045], [0.026, 0.075], [0.022, 0.085], [0.034, 0.09], [0.034, 0.095], [0.02, 0.1], [0, 0.1]]), at(new THREE.SphereGeometry(0.026, 16, 12), 0, 0.122, 0)]);
  }
}

export const PIECE_H = [0.27, 0.22, 0.215, 0.21, 0.17, 0.14];
export function chessSets() {
  const eras = [chaturanga, shatranj, staunton];
  return eras.map((fn) => [0, 1, 2, 3, 4, 5].map((t) => fn(t)));
}

// ------------------------------------------------------------------------------------------------ figure
// Seated meditation (padmasana), as a 2D signed-distance field in figure units (base y = 0, crown y ≈ 1).
export function figureField() {
  const parts = [];
  const cone = (ax, ay, bx, by, ra, rb) => parts.push((x, y) => sdRoundCone2(x, y, ax, ay, bx, by, ra, rb));
  const el = (cx, cy, rx, ry, ang = 0) => parts.push((x, y) => sdEllipse2(x, y, [cx, cy], [rx, ry], ang));
  el(0, 0.895, 0.074, 0.094);                  // head
  el(0, 0.985, 0.038, 0.03);                    // hair knot
  cone(0, 0.78, 0, 0.83, 0.036, 0.034);         // neck
  cone(0, 0.43, 0, 0.66, 0.125, 0.14);          // torso
  el(0, 0.705, 0.19, 0.052);                    // shoulders
  el(0, 0.33, 0.19, 0.1);                       // hips
  for (const s of [-1, 1]) {
    cone(s * 0.175, 0.69, s * 0.26, 0.46, 0.046, 0.038);     // upper arm
    cone(s * 0.26, 0.46, s * 0.355, 0.285, 0.036, 0.03);     // forearm to the knee
    el(s * 0.385, 0.27, 0.042, 0.03, s * -0.4);              // hand resting on the knee (mudra)
    el(s * 0.36, 0.17, 0.11, 0.085);                          // knee
    el(s * 0.14, 0.255, 0.085, 0.034, s * 0.25);             // the sole turned up on the opposite thigh
  }
  el(0, 0.165, 0.43, 0.1);                       // crossed legs
  const f = (x, y) => { let d = parts[0](x, y); for (let i = 1; i < parts.length; i++) d = smin(d, parts[i](x, y), 0.035); return d; };
  return f;
}

// Marching-squares contour of f over a box → [[Vector3, Vector3], ...]
export function contourSegments(f, x0, x1, y0, y1, cell) {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell), vals = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f(x0 + i * cell, y0 + j * cell);
  const segs = [], L = (xa, ya, va, xb, yb, vb) => { const t = va / (va - vb); return [xa + (xb - xa) * t, ya + (yb - ya) * t]; };
  const T = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[2, 0]], 10: [[0, 3], [1, 2]], 11: [[2, 1]], 12: [[1, 3]], 13: [[1, 0]], 14: [[0, 3]] };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = x0 + i * cell, Y = y0 + j * cell;
    const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1], c = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
    const idx = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
    if (!T[idx]) continue;
    const E = [() => L(X, Y, a, X + cell, Y, b), () => L(X + cell, Y, b, X + cell, Y + cell, c), () => L(X + cell, Y + cell, c, X, Y + cell, d), () => L(X, Y + cell, d, X, Y, a)];
    for (const [p, q] of T[idx]) { const A = E[p](), B = E[q](); segs.push([V3(A[0], A[1], 0), V3(B[0], B[1], 0)]); }
  }
  return segs;
}

// The silhouette as an alpha mask (for the dark figure against the sunrise).
export function figureMask(f, { x0 = -0.6, x1 = 0.6, y0 = -0.04, y1 = 1.06, W = 512 } = {}) {
  const H = Math.round((W * (y1 - y0)) / (x1 - x0)), c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const px = (x1 - x0) / W;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * px, y = y1 - (j + 0.5) * px, v = f(x, y);
    const a = Math.min(1, Math.max(0, 0.5 - v / (px * 1.2)));
    const k = (j * W + i) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c);
  t.userData = { w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  return t;
}
