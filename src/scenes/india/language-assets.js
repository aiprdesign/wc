// LANGUAGE & GRAMMAR — build-time assets for close inspection (Explore 3D), plus a small craft kit that the
// zero and modern chapters share:
//   · tileable procedural maps (torus-wrapped 4D noise, so nothing visibly repeats at a seam): brushed / turned
//     metal, knurling, wood grain, palm-leaf fibre, woven cloth — each as colour, roughness and normal maps
//   · machined small parts as real geometry: slotted cheese-head screws, hex nuts, knurled knobs, turned rings
//   · a per-material geometry collector (merge many parts into one draw per material)
// Language-specific builders: palm-leaf folio maps, carved & lacquered cover relief, a braided cord with a
// turned brass bead and a real tassel, a deepa (brass oil lamp) with chased bands and a cotton wick, the iron
// stylus with its knife blade, and wrapped manuscript bundles with ties for the shelves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise2, noise4 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';

const TAU = Math.PI * 2;
const cache = new Map();
const once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };

// ============================================================================================ craft kit: maps
// Tileable noise on [0,1)²: fu / fv = number of features across u / v (anisotropy for free).
export function tnoise(u, v, fu, fv, seed = 0) {
  const ru = fu / TAU, rv = fv / TAU, a = u * TAU, b = v * TAU;
  return noise4(Math.cos(a) * ru + seed * 7.13, Math.sin(a) * ru, Math.cos(b) * rv - seed * 3.7, Math.sin(b) * rv);
}
export const tri = (x) => Math.abs(x - Math.floor(x) - 0.5) * 2;   // 1 at integers, 0 at halves

// height field H[w*h] from fn(u, v) → number
export function field(w, h, fn) {
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = fn((x + 0.5) / w, (y + 0.5) / h);
  return H;
}
function imgTex(w, h, put, { srgb = false } = {}) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  put(img.data);
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb, repeat: true });
}
// tangent-space normal map from a height field (wrapping central differences); strength ~ slope gain
export function normalTex(H, w, h, strength = 2) {
  return imgTex(w, h, (d) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = H[y * w + (x + w - 1) % w], r = H[y * w + (x + 1) % w];
      const t = H[((y + h - 1) % h) * w + x], b = H[((y + 1) % h) * w + x];
      // canvas rows run top → bottom while texture v runs bottom → top: +v is the row above
      let nx = (l - r) * strength, ny = (b - t) * strength, nz = 1;
      const k = 1 / Math.hypot(nx, ny, nz); nx *= k; ny *= k; nz *= k;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
}
// greyscale (roughness) map: fn(u,v) → 0..1
export function greyTex(w, h, fn) {
  const H = field(w, h, fn);
  return imgTex(w, h, (d) => { for (let i = 0; i < H.length; i++) { const v = Math.max(0, Math.min(255, H[i] * 255)); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } });
}
// colour map: fn(u,v) → [r,g,b] 0..255
export function colorTex(w, h, fn) {
  return imgTex(w, h, (d) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn((x + 0.5) / w, (y + 0.5) / h), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  }, { srgb: true });
}

// Brushed / turned metal: fine streaks along u (lathe parts: u runs round the part, so streaks along u are
// turning marks). { n: normal map, r: roughness map (0.5 ± variation) }
export function brushedMaps(seed = 1) {
  return once(`brushed${seed}`, () => {
    const W = 512, Hh = 256;
    const H = field(W, Hh, (u, v) => tnoise(u, v, 3, 220, seed) * 0.55 + tnoise(u, v, 8, 520, seed + 1) * 0.35 + tnoise(u, v, 2, 40, seed + 2) * 0.25);
    const n = normalTex(H, W, Hh, 0.9);
    const r = greyTex(W, Hh, (u, v) => 0.62 + 0.22 * tnoise(u, v, 2, 3, seed + 5) + 0.14 * tnoise(u, v, 4, 260, seed + 6) + 0.06 * tnoise(u, v, 24, 900, seed + 7));
    return { n, r };
  });
}
// Diamond knurl (straight × crossed), nu teeth round the circumference, nv along the length.
export function knurlMaps(nu = 48, nv = 6) {
  return once(`knurl${nu}_${nv}`, () => {
    const W = 512, Hh = 128;
    const H = field(W, Hh, (u, v) => { const a = tri(u * nu + v * nv), b = tri(u * nu - v * nv); return Math.pow(Math.min(a, b), 0.8) * 1.0 + tnoise(u, v, 30, 8, 9) * 0.04; });
    return { n: normalTex(H, W, Hh, 4.5), r: greyTex(W, Hh, (u, v) => { const a = tri(u * nu + v * nv), b = tri(u * nu - v * nv); return 0.5 - 0.3 * Math.min(a, b) + 0.08 * tnoise(u, v, 6, 2, 4); }) };
  });
}
// Fine cast / bead-blasted / anodised speckle (isotropic)
export function speckleMaps(seed = 3, scale = 1) {
  return once(`speckle${seed}_${scale}`, () => {
    const S = 256, f = 90 * scale;
    const H = field(S, S, (u, v) => tnoise(u, v, f, f, seed) * 0.6 + tnoise(u, v, f * 2.3, f * 2.3, seed + 1) * 0.4);
    return { n: normalTex(H, S, S, 0.7), r: greyTex(S, S, (u, v) => 0.55 + 0.25 * tnoise(u, v, 3, 3, seed + 3) + 0.1 * tnoise(u, v, f, f, seed + 4)) };
  });
}
// Wood: grain runs along u. base = [r,g,b] mid tone. { map, n, r }
export function woodMaps({ seed = 1, base = [92, 58, 34], rings = 26, figure = 1, W = 1024, H = 256 } = {}) {
  return once(`wood${seed}_${base}_${rings}_${figure}_${W}`, () => {
    const ring = (u, v) => {
      const warp = tnoise(u, v, 2, 3, seed) * 1.6 * figure + tnoise(u, v, 5, 7, seed + 1) * 0.35;
      const x = v * rings + warp * 3;
      return Math.pow(0.5 + 0.5 * Math.sin(x * TAU), 3);       // late-wood lines
    };
    const pores = (u, v) => Math.max(0, tnoise(u, v, 60, 900, seed + 2) - 0.45) * 1.8;
    const map = colorTex(W, H, (u, v) => {
      const r = ring(u, v), p = pores(u, v), m = tnoise(u, v, 3, 2, seed + 3) * 0.12 + tnoise(u, v, 12, 140, seed + 4) * 0.06;
      const l = 1 + m - r * 0.32 - p * 0.18;
      return [Math.min(255, base[0] * l * (1 + r * 0.05)), Math.min(255, base[1] * l), Math.min(255, base[2] * l * (1 - r * 0.08))];
    });
    const Hf = field(W / 2, H / 2, (u, v) => -ring(u, v) * 0.45 - pores(u, v) * 0.8 + tnoise(u, v, 30, 300, seed + 5) * 0.12);
    return { map, n: normalTex(Hf, W / 2, H / 2, 1.6), r: greyTex(W / 2, H / 2, (u, v) => 0.5 + ring(u, v) * 0.18 + pores(u, v) * 0.25 + tnoise(u, v, 3, 3, seed + 6) * 0.1) };
  });
}

// ========================================================================================= craft kit: parts
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
export function place(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  const sc = Array.isArray(s) ? s : [s, s, s];
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(sc[0], sc[1], sc[2]));
  return geo.applyMatrix4(_m);
}
// orient a +y-up part so that +y points along dir, then translate to p
export function aim(geo, p, dir) {
  _q.setFromUnitVectors(_v.set(0, 1, 0), _s.copy(dir).normalize());
  _m.compose(new THREE.Vector3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]), _q, new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(_m);
}
export function prep(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  n.clearGroups();
  return n;
}
export function uvScale(g, su, sv, ou = 0, ov = 0) {
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return g;
}
export const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg);

// Collects geometry per material and builds one mesh per material.
export class Parts {
  constructor() { this.by = new Map(); }
  add(mat, geo) { if (!this.by.has(mat)) this.by.set(mat, []); this.by.get(mat).push(prep(geo)); return this; }
  build({ cast = true, receive = true } = {}) {
    const g = new THREE.Group();
    for (const [mat, list] of this.by) {
      const m = new THREE.Mesh(mergeGeometries(list, false), mat);
      m.castShadow = cast; m.receiveShadow = receive;
      g.add(m);
    }
    return g;
  }
}

// Slotted cheese-head screw, head axis +y, sitting on y = 0 (r = head radius). Real slot geometry.
export function screwGeo(r, { h = r * 0.7, slot = 0.26, seg = 14, dome = false } = {}) {
  const sw = r * slot, base = h * 0.4, top = h - base, parts = [];
  parts.push(new THREE.CylinderGeometry(r, r * 1.02, base, seg, 1).translate(0, base / 2, 0));
  for (const s of [1, -1]) {
    const half = new THREE.CylinderGeometry(dome ? r * 0.72 : r * 0.94, r, top, seg / 2, 1, false, s > 0 ? 0 : Math.PI, Math.PI);
    half.translate(s * sw / 2, base + top / 2, 0);
    parts.push(half);
    const wall = new THREE.PlaneGeometry(r * 2 * 0.97, top).rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2).translate(s * sw / 2, base + top / 2, 0);
    parts.push(wall);
  }
  return mergeGeometries(parts.map(prep));
}
// hex nut / bolt head (axis +y on y = 0), chamfered top
export function hexGeo(r, h, { hole = 0 } = {}) {
  const g = [new THREE.CylinderGeometry(r * 0.9, r, h * 0.18, 6, 1).translate(0, h * 0.91, 0), new THREE.CylinderGeometry(r, r, h * 0.82, 6, 1).translate(0, h * 0.41, 0)];
  if (hole) g.push(new THREE.CylinderGeometry(hole, hole, h * 1.02, 12, 1, true).translate(0, h / 2, 0));
  return mergeGeometries(g.map(prep));
}
// Knurled thumb knob (axis +y on y = 0): chamfered body whose side carries the knurl map (uv u round, v up)
export function knobGeo(r, h, { seg = 32, stem = 0 } = {}) {
  const c = r * 0.12;
  const side = new THREE.CylinderGeometry(r, r, h - 2 * c, seg, 1, true).translate(0, h / 2, 0);
  const ends = lathe([[0, 0], [r - c, 0], [r, c], [r, c + 0.0001]], seg);
  const top = lathe([[r, h - c - 0.0001], [r, h - c], [r - c, h], [r * 0.35, h], [r * 0.3, h + c * 0.4], [0, h + c * 0.4]], seg);
  uvScale(ends, 1, 0.02); uvScale(top, 1, 0.02);
  const parts = [side, ends, top];
  if (stem) parts.push(new THREE.CylinderGeometry(stem, stem, r * 1.2, 12).translate(0, -r * 0.6, 0));
  return mergeGeometries(parts.map(prep));
}
// a turned ring band (bead) round an axis (+y), radius R, section radius s
export const beadRing = (R, s, y = 0, seg = 48) => new THREE.TorusGeometry(R, s, 8, seg).rotateX(Math.PI / 2).translate(0, y, 0);

// Metal materials with maps. tone: hex colour; maps from brushedMaps / speckleMaps / knurlMaps.
export function metalMat(tone, { rough = 0.35, maps = brushedMaps(1), nScale = 0.5, env = 1, clearcoat = 0, detail = null } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: tone, metalness: 1, roughness: rough, roughnessMap: maps.r, normalMap: maps.n, normalScale: new THREE.Vector2(nScale, nScale), envMapIntensity: env, clearcoat, clearcoatRoughness: 0.2 });
  m.userData.detail = detail ?? { grime: 0.05, albedo: 0.05, scratch: 0.35, rough: 0.5, scale: 3 };
  return m;
}

// ==================================================================================== language: the folio
// Palm leaf: parallel veins (the leaf's own ribs) as a fine relief + roughness, sized to the folio's 1024×128 map.
export function folioRelief(seed = 1) {
  return once(`folioRelief${seed}`, () => {
    const W = 1024, Hh = 128;
    const H = field(W, Hh, (u, v) => {
      const vein = Math.pow(tri(v * 46 + tnoise(u, v, 3, 2, seed) * 0.6), 6) * 0.7;      // the ribs, along the length
      const fine = tnoise(u, v, 40, 140, seed + 1) * 0.25 + tnoise(u, v, 120, 300, seed + 2) * 0.12;
      const crack = Math.max(0, tnoise(u, v, 8, 30, seed + 3) - 0.62) * -2.5;            // dry hairline splits along the grain
      return vein + fine + crack;
    });
    return {
      n: normalTex(H, W, Hh, 2.2),
      r: greyTex(W, Hh, (u, v) => 0.58 + 0.12 * tnoise(u, v, 6, 3, seed + 4) + 0.1 * Math.pow(tri(v * 46), 6)),
    };
  });
}
// Cover: carved border mouldings and the raised lotus medallion as relief, wood grain under the lacquer.
export function coverRelief(W = 1024, Hh = 160, holeU = []) {
  return once(`coverRelief${W}`, () => {
    const H = field(W, Hh, (u, v) => {
      const px = u * W, py = v * Hh;
      const dx = Math.min(px, W - px), dy = Math.min(py, Hh - py), d = Math.min(dx, dy);
      let h = 0;
      h += smooth(10, 16, d) * (1 - smooth(16, 20, d)) * 0.8;           // outer gilt moulding
      h += smooth(23, 25, d) * (1 - smooth(25, 27, d)) * 0.5;           // inner fillet
      h -= smooth(0, 6, d) < 1 ? (1 - smooth(0, 6, d)) * 0.4 : 0;        // worn rounded edge
      const cx = W / 2, cy = Hh / 2, rr = Math.hypot(px - cx, py - cy);
      const ang = Math.atan2(py - cy, px - cx);
      h += (1 - smooth(40, 52, rr)) * (0.55 + 0.35 * Math.pow(Math.abs(Math.cos(ang * 6)), 2));   // lotus petals
      h += (1 - smooth(10, 14, rr)) * 0.3;
      for (const hu of holeU) { const r2 = Math.hypot(px - hu * W, py - cy); h -= (1 - smooth(22, 30, r2)) * 0.25; }   // cord wear round the holes
      h += tnoise(u, v, 6, 120, 21) * 0.08 + tnoise(u, v, 60, 12, 22) * 0.05;   // grain under lacquer
      return h;
    });
    return { n: normalTex(H, W, Hh, 3.0), r: greyTex(W, Hh, (u, v) => 0.4 + 0.18 * tnoise(u, v, 4, 2, 23) + 0.12 * Math.max(0, tnoise(u, v, 30, 6, 24))) };
  });
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Braided cord: two-ply twist as a normal map (u round, v along)
export function cordMaps() {
  return once('cord', () => {
    const W = 64, Hh = 256;
    const H = field(W, Hh, (u, v) => { const t = tri(u * 2 + v * 24); return Math.pow(1 - t, 0.6) + tnoise(u, v, 8, 90, 31) * 0.15; });
    return { n: normalTex(H, W, Hh, 3.5), map: colorTex(W, Hh, (u, v) => { const t = tri(u * 2 + v * 24), l = 0.7 + 0.35 * (1 - t) + 0.12 * tnoise(u, v, 8, 90, 32); return [124 * l, 92 * l, 54 * l]; }) };
  });
}
// cord tube along a curve: radius r, uv u round / v along (repeat along by length)
export function cordGeo(curve, r, segs = 40, radial = 8, vRepeat = 4) {
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * vRepeat);
  return g;
}

// Woven cloth: plain-weave relief
export function weaveMaps() {
  return once('weave', () => {
    const W = 256, n = 64;
    const H = field(W, W, (u, v) => {
      const cu = Math.floor(u * n), cv = Math.floor(v * n), fu = u * n - cu, fv = v * n - cv;
      const over = (cu + cv) % 2 === 0;
      const warp = Math.sin(fu * Math.PI), weft = Math.sin(fv * Math.PI);
      return (over ? warp * 0.8 + weft * 0.3 : weft * 0.8 + warp * 0.3) + tnoise(u, v, 40, 40, 41) * 0.1;
    });
    return { n: normalTex(H, W, W, 2.4) };
  });
}

// ==================================================================================== language: the lamp
// A South Indian deepa: petal-scalloped foot, knopped stem with chased ring bands, a beaded drip-tray, the
// spouted oil bowl with a rolled rim, a cotton wick lying in the spout. Profile matches the original lamp so
// the flame and its light stay where they were. Returns { group, brass } (+y up, origin on the desk).
export function buildLamp({ lite = false } = {}) {
  const seg = lite ? 32 : 64;
  const turned = brushedMaps(4);
  const brass = metalMat('#c8913e', { rough: 0.3, maps: turned, nScale: 0.35, env: 1.0 });
  const brassDark = metalMat('#8a5a24', { rough: 0.5, maps: speckleMaps(5, 1.4), nScale: 0.6, env: 0.7 });   // tarnish in the recesses
  const P = new Parts();
  // foot: a scalloped (8-petal) dome, built as a lathe whose radius is modulated per angle
  {
    const prof = [[0, 0], [0.4, 0], [0.43, 0.012], [0.44, 0.03], [0.4, 0.05], [0.3, 0.1], [0.18, 0.15], [0.12, 0.18]];
    const g = lathe(prof, seg * 2), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
      const k = 1 + 0.06 * Math.pow(Math.abs(Math.cos(a * 4)), 0.6) * (1 - y / 0.18);
      p.setX(i, Math.cos(a) * r * k); p.setZ(i, Math.sin(a) * r * k);
    }
    g.computeVertexNormals();
    P.add(brass, uvScale(g, 1, 6));
  }
  // stem with knops and fillets (turned)
  P.add(brass, uvScale(lathe([[0.12, 0.18], [0.1, 0.2], [0.085, 0.24], [0.11, 0.27], [0.12, 0.29], [0.1, 0.31], [0.075, 0.34], [0.07, 0.4], [0.085, 0.42], [0.105, 0.44], [0.085, 0.46], [0.065, 0.5], [0.06, 0.57], [0.08, 0.6], [0.14, 0.64], [0.12, 0.645]], seg), 1, 8));
  for (const [R, y] of [[0.123, 0.29], [0.107, 0.44], [0.083, 0.6]]) P.add(brassDark, beadRing(R, 0.006, y, seg));
  // chased band on the knop: a ring of small bosses
  if (!lite) for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; P.add(brass, new THREE.SphereGeometry(0.009, 8, 6).translate(Math.cos(a) * 0.108, 0.27, Math.sin(a) * 0.108)); }
  // the bowl with a rolled rim and the spout
  const bowl = lathe([[0, 0.64], [0.12, 0.64], [0.22, 0.66], [0.3, 0.7], [0.36, 0.76], [0.385, 0.8], [0.39, 0.815], [0.38, 0.832], [0.365, 0.83], [0.355, 0.81], [0.3, 0.76], [0.2, 0.735], [0, 0.73]], seg);
  P.add(brass, uvScale(bowl, 1, 6));
  P.add(brassDark, beadRing(0.39, 0.012, 0.818, seg));
  // spout: a channel (half-pipe) running out of the rim, tapering
  {
    const pts = [], n = 10;
    for (let i = 0; i <= n; i++) { const f = i / n; pts.push(new THREE.Vector3(0.3 + f * 0.26, 0.79 + f * 0.02, 0)); }
    const pos = [], idx = [], uv = [], ring = 9;
    pts.forEach((c, i) => {
      const f = i / n, w = 0.075 * (1 - f * 0.55), d = 0.04 * (1 - f * 0.4);
      for (let j = 0; j <= ring; j++) {
        const a = Math.PI * (j / ring);            // half-pipe under the channel
        pos.push(c.x, c.y - Math.sin(a) * d, Math.cos(a) * w);
        uv.push(j / ring, f);
      }
    });
    for (let i = 0; i < n; i++) for (let j = 0; j < ring; j++) { const a = i * (ring + 1) + j, b = a + ring + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const brassDS = brass.clone(); brassDS.side = THREE.DoubleSide;
    P.add(brassDS, g);
    // the spout lip: a thin rolled edge along both sides
    for (const s of [1, -1]) {
      const curve = new THREE.CatmullRomCurve3(pts.map((c, i) => new THREE.Vector3(c.x, c.y, s * 0.075 * (1 - (i / n) * 0.55))));
      P.add(brass, new THREE.TubeGeometry(curve, 12, 0.006, 6, false));
    }
  }
  const group = P.build();
  // oil: dark, glossy, with a meniscus ring
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.32, seg), new THREE.MeshPhysicalMaterial({ color: '#2a1806', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02 }));
  oil.rotation.x = -Math.PI / 2; oil.position.y = 0.775;
  oil.material.userData.noDetail = true;
  group.add(oil);
  // cotton wick: a twisted roll lying in the spout, charred at the burning end
  const wickMaps = cordMaps();
  const wickMat = new THREE.MeshStandardMaterial({ color: '#d8ccb4', map: wickMaps.map, normalMap: wickMaps.n, roughness: 0.95 });
  const charMat = new THREE.MeshStandardMaterial({ color: '#141010', roughness: 1 });
  const wickCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.77, 0.02), new THREE.Vector3(0.3, 0.775, 0), new THREE.Vector3(0.45, 0.8, 0), new THREE.Vector3(0.51, 0.855, 0)]);
  const wick = new THREE.Mesh(cordGeo(wickCurve, 0.016, 24, 8, 3), wickMat);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8).scale(1, 1.3, 1), charMat); tip.position.set(0.515, 0.865, 0);
  group.add(wick, tip);
  return { group, brass };
}

// ======================================================================================= language: stylus
// Iron lekhani: a turned shaft with ring grooves, a fine point at one end and the leaf-trimming knife at the
// other. Built along +y (point up), centred, overall length ≈ 1.36 like the original stylus.
export function buildStylus({ lite = false } = {}) {
  const seg = lite ? 12 : 20;
  const iron = metalMat('#57514b', { rough: 0.45, maps: brushedMaps(7), nScale: 0.6, env: 0.9, detail: { grime: 0.15, scratch: 0.6, rough: 0.7, albedo: 0.1, scale: 4 } });
  const steelEdge = metalMat('#a9a39a', { rough: 0.22, maps: brushedMaps(8), nScale: 0.3 });
  const P = new Parts();
  P.add(iron, uvScale(lathe([[0.0, -0.56], [0.018, -0.555], [0.024, -0.54], [0.024, -0.5], [0.019, -0.49], [0.024, -0.48], [0.025, -0.3], [0.021, -0.29], [0.026, -0.28], [0.026, 0.3], [0.021, 0.31], [0.025, 0.32], [0.024, 0.5], [0.019, 0.51], [0.022, 0.52], [0.02, 0.58], [0.012, 0.66], [0.003, 0.74], [0.0005, 0.76]], seg), 1, 12));
  // the knife: a flat leaf-shaped blade beyond the butt
  const sh = new THREE.Shape();
  sh.moveTo(-0.02, 0); sh.lineTo(0.02, 0); sh.quadraticCurveTo(0.05, -0.08, 0.035, -0.17); sh.quadraticCurveTo(0.015, -0.22, 0.0, -0.24); sh.quadraticCurveTo(-0.02, -0.17, -0.02, 0);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 8 });
  blade.translate(0, -0.555, -0.003);
  P.add(steelEdge, blade);
  if (!lite) for (const y of [-0.42, -0.36, 0.36, 0.42]) P.add(iron, beadRing(0.026, 0.0035, y, seg));
  return P.build();
}

// ============================================================================ language: wrapped bundles
// Shelf bundles: cloth-wrapped stacks with rounded ends, two ties each, a few with a wooden cover peeking
// out. Returns { geo (vertex-coloured cloth), ties, covers } geometries merged; R is the scene's seeded rng.
export function wrappedBundle(L, h, d, { seg = 6 } = {}) {
  // a box with rounded long edges (the cloth pulled over the folios) — rounded rectangle extruded along x
  const s = new THREE.Shape(), r = Math.min(h, d) * 0.3, w2 = d / 2, h2 = h / 2;
  s.moveTo(-w2 + r, -h2); s.lineTo(w2 - r, -h2); s.quadraticCurveTo(w2, -h2, w2, -h2 + r); s.lineTo(w2, h2 - r); s.quadraticCurveTo(w2, h2, w2 - r, h2);
  s.lineTo(-w2 + r, h2); s.quadraticCurveTo(-w2, h2, -w2, h2 - r); s.lineTo(-w2, -h2 + r); s.quadraticCurveTo(-w2, -h2, -w2 + r, -h2);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: true, bevelThickness: Math.min(0.06, L * 0.05), bevelSize: r * 0.6, bevelSegments: 2, curveSegments: seg });
  g.rotateY(Math.PI / 2); g.translate(-L / 2, 0, 0);
  // cloth sag and creases
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.012 * noise2(x * 9, z * 9 + y * 5); p.setXYZ(i, x, y + k * (y > 0 ? 1 : 0.3), z + k * Math.sign(z)); }
  g.computeVertexNormals();
  return g;
}

