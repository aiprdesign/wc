// SURGERY — procedural assets: textures (teak, granite, palm-leaf folio, jali screen), herb models
// (neem, tulsi, turmeric, stone mortar, diya) and the surgical instruments of the Sushruta Samhita
// (lancets and other sharp shastras, probes, hooks, tongs, tubes, and the animal-mouthed forceps).
// Everything is built once; the scene (surgery.js) only poses it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, sat, TAU } from '../../lib/math.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';

// ------------------------------------------------------------------ geometry helpers
// Merge-friendly: non-indexed, position / normal / uv only.
export function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
export const merge = (list) => mergeGeometries(list.map(clean), false);

// A tube whose radius varies along its length: rFn(u) → radius. Ends taper closed when rFn(0/1) → 0.
export function varTube(curve, n, radial, rFn) {
  const frames = curve.computeFrenetFrames(n, false);
  const pos = [], uv = [], idx = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n; curve.getPointAt(u, p);
    const r = Math.max(1e-4, rFn(u));
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a);
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
      uv.push(u, j / radial);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Leaf blade along +x (base at the origin), width across z, cupped up along the midrib.
//   shape: 'lance' (neem leaflet: long, falcate, serrated) | 'ovate' (tulsi: broad, rounded, finely toothed)
export function leafGeometry({ len = 1, width = 0.3, shape = 'lance', teeth = 0, serr = 0, fold = 0.25, curl = 0.1, sickle = 0, nl = 16, nw = 6 } = {}) {
  const pos = [], uv = [], idx = [];
  const half = (u) => {
    let w = shape === 'ovate' ? Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.8) : Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 1.1);
    if (teeth) { const f = (u * teeth) % 1; w *= 1 - serr * f * (u > 0.08 && u < 0.95 ? 1 : 0); }
    return w * width * 0.5;
  };
  for (let i = 0; i <= nl; i++) {
    const u = i / nl;
    for (let j = 0; j <= nw; j++) {
      const v = (j / nw) * 2 - 1, w = half(u);
      const x = u * len, z = v * w + sickle * len * u * u;
      const y = fold * Math.abs(v) * w + curl * len * u * u - 0.25 * fold * w * v * v * v * v;
      pos.push(x, y, z); uv.push(u, (v + 1) / 2);
    }
  }
  for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
    const a = i * (nw + 1) + j, b = a + nw + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Leaf surface: a darker midrib and veins, a paler rim (alpha-free, used as colour map ×vertex/instance tint).
export function leafTexture({ veins = 7, seed = 1 } = {}) {
  const W = 256, H = 128, c = mkCanvas(W, H), x = c.getContext('2d');
  const R = rng(seed);
  x.fillStyle = '#b9c9a0'; x.fillRect(0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const n = fbm2(i / 40 + seed, j / 30, 3) * 0.12 + noise2(i / 3, j / 3) * 0.03;
    const edge = Math.abs(j / H - 0.5) * 2;
    const k = 0.9 + n + edge * 0.12;
    const o = (j * W + i) * 4; d[o] *= k; d[o + 1] *= k; d[o + 2] *= k;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(232,240,200,0.75)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.stroke();
  x.lineWidth = 1.4; x.strokeStyle = 'rgba(225,236,190,0.45)';
  for (let k = 1; k <= veins; k++) {
    const u0 = k / (veins + 1) * W;
    for (const s of [-1, 1]) {
      x.beginPath(); x.moveTo(u0, H / 2);
      x.quadraticCurveTo(u0 + 18 + R() * 6, H / 2 + s * H * 0.25, u0 + 34 + R() * 8, H / 2 + s * H * 0.48); x.stroke();
    }
  }
  return toTexture(c, { anisotropy: 4 });
}

// ------------------------------------------------------------------ textures
// Dark oiled teak: long grain along u, a few cathedral figures, fine pores.
export function teakTexture() {
  const W = 1024, H = 512, c = mkCanvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = j / H;
    const warp = fbm2(u * 2.0, v * 3.0, 4) * 0.35;
    const ring = Math.sin((v * 34 + warp * 9 + Math.sin(u * 5.3) * 0.6) * Math.PI);
    const g = 0.5 + 0.5 * ring;
    const pores = noise2(u * 600, v * 40) * 0.5 + 0.5;
    const l = 0.62 + g * 0.22 - pores * 0.08 + fbm2(u * 8, v * 2, 3) * 0.1;
    const o = (j * W + i) * 4;
    d[o] = 92 * l; d[o + 1] = 56 * l; d[o + 2] = 32 * l; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = toTexture(c, { repeat: true });
  return t;
}

// Speckled grey granite (mortar & pestle).
export function graniteTexture() {
  const S = 512, c = mkCanvas(S, S), x = c.getContext('2d');
  const img = x.createImageData(S, S), d = img.data;
  const R = rng(77);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const n = fbm2(i / 60, j / 60, 4) * 0.15 + noise2(i / 2.2, j / 2.2) * 0.12;
    const l = 0.62 + n;
    const o = (j * S + i) * 4;
    d[o] = 118 * l + 8; d[o + 1] = 112 * l + 6; d[o + 2] = 104 * l + 4; d[o + 3] = 255;
  }
  for (let k = 0; k < 5200; k++) {             // dark mica and pale feldspar grains
    const px = Math.floor(R() * S), py = Math.floor(R() * S), r = R() < 0.7 ? 0 : 1, dark = R() < 0.6;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const o = (((py + a + S) % S) * S + ((px + b + S) % S)) * 4;
      const v = dark ? 40 : 128;
      d[o] = v; d[o + 1] = v - (dark ? 0 : 6); d[o + 2] = v - (dark ? 0 : 12);
    }
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}

// A palm-leaf folio: pale fibrous leaf, two string holes, ruled lines of incised script. The script is
// abstract pen strokes (loops, bars, hooks), not real letters.
export function folioTexture() {
  const W = 2048, H = 280, c = mkCanvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = j / H;
    const fib = noise2(u * 9, v * 140) * 0.06 + noise2(u * 40, v * 400) * 0.03;
    const edge = Math.min(v, 1 - v), burn = Math.pow(1 - Math.min(1, edge * 9), 2) * 0.35 + Math.pow(1 - Math.min(1, Math.min(u, 1 - u) * 30), 2) * 0.3;
    const blot = Math.max(0, fbm2(u * 6, v * 3, 3)) * 0.18;
    const l = 1 + fib - burn - blot;
    const o = (j * W + i) * 4;
    d[o] = 214 * l; d[o + 1] = 186 * l; d[o + 2] = 128 * l; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const R = rng(9);
  x.strokeStyle = 'rgba(48,30,14,0.85)'; x.lineCap = 'round';
  for (let row = 0; row < 5; row++) {
    const y0 = 52 + row * 44;
    let px = 70;
    while (px < W - 70) {
      if (Math.abs(px - W * 0.3) < 40 || Math.abs(px - W * 0.7) < 40) { px += 90; continue; }
      x.lineWidth = 2.2 + R();
      x.beginPath(); x.moveTo(px - 4, y0 - 14); x.lineTo(px + 22, y0 - 14); x.stroke();           // head bar
      const k = Math.floor(R() * 4);
      x.beginPath();
      if (k === 0) { x.arc(px + 8, y0 - 2, 8, -1.2, 3.6); }
      else if (k === 1) { x.moveTo(px + 16, y0 - 14); x.lineTo(px + 16, y0 + 12); x.moveTo(px + 2, y0 - 4); x.quadraticCurveTo(px + 10, y0 + 10, px + 16, y0); }
      else if (k === 2) { x.moveTo(px + 4, y0 - 14); x.quadraticCurveTo(px - 4, y0 + 2, px + 10, y0 + 6); x.quadraticCurveTo(px + 20, y0 + 2, px + 18, y0 - 14); }
      else { x.arc(px + 6, y0 + 2, 6, 0, TAU); x.moveTo(px + 18, y0 - 14); x.lineTo(px + 18, y0 + 12); }
      x.stroke();
      px += 26 + R() * 8;
      if (R() < 0.12) px += 22;
    }
  }
  for (const hx of [0.3, 0.7]) {                 // string holes
    x.fillStyle = 'rgba(20,12,6,1)'; x.beginPath(); x.arc(W * hx, H / 2, 13, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(90,60,30,0.6)'; x.lineWidth = 4; x.beginPath(); x.arc(W * hx, H / 2, 17, 0, TAU); x.stroke();
  }
  return toTexture(c, { anisotropy: 8 });
}

// Pierced stone screen (jali): an eight-pointed-star lattice. White = open (light), black = stone.
export function jaliTexture() {
  const S = 512, c = mkCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  const n = 4, cell = S / n;
  x.fillStyle = '#fff';
  const star = (cx, cy, r) => {
    x.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + Math.PI / 8, rr = i % 2 ? r * 0.55 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.closePath(); x.fill();
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    star(i * cell, j * cell, cell * 0.42);
    if (i < n && j < n) {                                  // small diamonds between the stars
      const cx = (i + 0.5) * cell, cy = (j + 0.5) * cell, r = cell * 0.14;
      x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill();
    }
  }
  const t = toTexture(c, { repeat: true });
  return t;
}

// Brass medallion face: concentric rings and a sixteen-petal lotus, engraved (roughness/colour map).
export function lotusTexture() {
  const S = 1024, c = mkCanvas(S, S), x = c.getContext('2d');
  x.fillStyle = '#d8d0c0'; x.fillRect(0, 0, S, S);
  x.translate(S / 2, S / 2);
  x.strokeStyle = '#5a4a30'; x.lineWidth = 6;
  for (const r of [490, 470, 300, 160, 60]) { x.beginPath(); x.arc(0, 0, r, 0, TAU); x.stroke(); }
  x.lineWidth = 5;
  for (let ring = 0; ring < 2; ring++) {
    const N = 16, r0 = ring ? 170 : 310, r1 = ring ? 290 : 460, off = ring ? Math.PI / N : 0;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + off, w = (Math.PI / N) * 0.92;
      x.beginPath();
      x.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0);
      x.quadraticCurveTo(Math.cos(a - w * 0.9) * (r0 + r1) * 0.55, Math.sin(a - w * 0.9) * (r0 + r1) * 0.55, Math.cos(a) * r1, Math.sin(a) * r1);
      x.quadraticCurveTo(Math.cos(a + w * 0.9) * (r0 + r1) * 0.55, Math.sin(a + w * 0.9) * (r0 + r1) * 0.55, Math.cos(a + w) * r0, Math.sin(a + w) * r0);
      x.stroke();
      x.beginPath(); x.moveTo(Math.cos(a) * (r0 + 20), Math.sin(a) * (r0 + 20)); x.lineTo(Math.cos(a) * (r1 - 40), Math.sin(a) * (r1 - 40)); x.stroke();
    }
  }
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; x.beginPath(); x.arc(Math.cos(a) * 480, Math.sin(a) * 480, 5, 0, TAU); x.fillStyle = '#5a4a30'; x.fill(); }
  return toTexture(c, { anisotropy: 8 });
}

// ------------------------------------------------------------------ herbs
// A turmeric rhizome: a knobbly main body with branching fingers, ringed by fine annulations.
export function turmericGeometry(seed = 1) {
  const R = rng(seed), parts = [];
  const finger = (pts, r0) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength();
    parts.push(varTube(curve, Math.max(12, Math.round(len * 160)), 9, (u) => {
      const ends = Math.pow(Math.sin(Math.PI * u), 0.4);
      const rings = 1 - 0.09 * Math.pow(Math.abs(Math.sin(u * len * 90)), 10);
      return r0 * ends * rings * (0.9 + 0.12 * Math.sin(u * 7 + seed));
    }));
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  finger([V(-0.11, 0, 0), V(-0.04, 0.004, 0.012), V(0.04, 0.002, -0.006), V(0.11, 0, 0.01)], 0.03);
  for (let k = 0; k < 4; k++) {
    const x0 = -0.08 + k * 0.05 + R() * 0.01, s = k % 2 ? 1 : -1, l = 0.06 + R() * 0.05;
    finger([V(x0, 0.0, 0), V(x0 + 0.02, 0.003, s * l * 0.5), V(x0 + 0.035 + R() * 0.02, 0.0, s * l)], 0.019 + R() * 0.004);
  }
  const g = merge(parts);
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  return g;
}

// Stone mortar (lathe) and its pestle.
export function mortarGeometry() {
  const P = [[0.0, 0.0], [0.24, 0.0], [0.285, 0.012], [0.3, 0.04], [0.292, 0.12], [0.282, 0.175], [0.296, 0.2], [0.29, 0.218], [0.252, 0.222], [0.232, 0.19], [0.2, 0.13], [0.14, 0.088], [0.0, 0.075]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(P, 64);
}
export function pestleGeometry() {
  const P = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, y = u * 0.46;
    const r = u < 0.12 ? 0.048 * Math.sqrt(Math.sin((u / 0.12) * Math.PI / 2)) : lerp(0.048, 0.03, Math.pow((u - 0.12) / 0.88, 0.8)) * (u > 0.96 ? Math.sqrt(Math.max(0.01, (1 - u) / 0.04)) : 1);
    P.push(new THREE.Vector2(Math.max(0.0005, r), y));
  }
  P.unshift(new THREE.Vector2(0, 0)); P.push(new THREE.Vector2(0, 0.46));
  return new THREE.LatheGeometry(P, 32);
}
// Brass lota (round-bellied water pot) for the tulsi.
export function lotaGeometry() {
  const P = [[0, 0], [0.05, 0], [0.058, 0.006], [0.085, 0.04], [0.098, 0.085], [0.09, 0.13], [0.06, 0.16], [0.046, 0.175], [0.048, 0.19], [0.064, 0.205], [0.068, 0.212], [0.058, 0.214], [0.04, 0.2], [0.036, 0.17]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(P, 48);
}
// Clay diya (oil lamp) with a pinched spout, and its flame.
export function diyaGeometry() {
  const P = [[0, 0], [0.045, 0], [0.07, 0.015], [0.085, 0.04], [0.082, 0.045], [0.066, 0.03], [0.0, 0.022]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(P, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {                       // pull a spout out towards +x
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = Math.pow(Math.max(0, Math.cos(a)), 8);
    p.setX(i, x * (1 + 0.55 * k)); p.setZ(i, z * (1 - 0.35 * k)); p.setY(i, p.getY(i) + 0.012 * k * (p.getY(i) > 0.03 ? 1 : 0));
  }
  g.computeVertexNormals();
  return g;
}
export function flameGeometry() {
  const P = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16; P.push(new THREE.Vector2(Math.max(0.0003, 0.016 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 1.2) * (1 - u * 0.2)), u * 0.075)); }
  return new THREE.LatheGeometry(P, 16);
}

// ------------------------------------------------------------------ instruments
// Every instrument is built along +x (handle end at x = 0, tip at x = L), lying on the cloth (y up).
// Returns { steel: BufferGeometry, brass: BufferGeometry|null, L, head?: Vector3 (point to label) }.
const rodX = (x0, x1, r, y, seg = 8, z = 0) => { const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const coneX = (x0, x1, r0, r1, y, seg = 10, z = 0) => { const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const ball = (x, y, z, r, s = [1, 1, 1]) => { const g = new THREE.SphereGeometry(r, 14, 10); g.scale(...s); g.translate(x, y, z); return g; };
const ringFlat = (x, z, R, r, y) => { const g = new THREE.TorusGeometry(R, r, 8, 28); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
// a flat blade from a 2D outline in (x, z), `th` thick, resting at height y
function bladeGeo(draw, th, y) {
  const s = new THREE.Shape(); draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: th * 0.35, bevelSize: th * 0.6, bevelSegments: 2, curveSegments: 14 });
  g.rotateX(Math.PI / 2);
  g.translate(0, y + th, 0);
  return g;
}
// turned handle: octagonal grip with ringed bands and a knob at the end
function handle(L, r) {
  const steel = [rodX(0.012, L, r, r, 8)], brass = [];
  steel.push(ball(0.012, r, 0, r * 1.35));
  for (const u of [0.12, 0.2, 0.75, 0.88]) { const g = new THREE.TorusGeometry(r * 1.02, r * 0.28, 6, 16); g.rotateY(Math.PI / 2); g.translate(u * L, r, 0); brass.push(g); }
  steel.push(coneX(L, L + 0.02, r, r * 0.55, r, 8));
  return { steel, brass };
}

function scalpel(kind, R) {
  const H = 0.3 + R() * 0.06, r = 0.0105, bl = 0.16 + R() * 0.05, th = 0.0028;
  const { steel, brass } = handle(H, r);
  const x0 = H + 0.018;
  steel.push(rodX(H + 0.01, x0 + 0.01, r * 0.45, r, 6));
  const by = r - th * 0.8;
  const w = kind === 'saw' ? 0.03 : kind === 'round' ? 0.026 : 0.024;
  steel.push(bladeGeo((s) => {
    if (kind === 'leaf') {          // a growing-leaf lancet
      s.moveTo(x0, -0.006); s.quadraticCurveTo(x0 + bl * 0.3, -w, x0 + bl * 0.62, -w * 0.72); s.quadraticCurveTo(x0 + bl * 0.88, -w * 0.4, x0 + bl, 0);
      s.quadraticCurveTo(x0 + bl * 0.8, w * 0.45, x0 + bl * 0.5, w * 0.62); s.quadraticCurveTo(x0 + bl * 0.2, w * 0.6, x0, 0.006); s.closePath();
    } else if (kind === 'round') {  // round-headed knife
      s.moveTo(x0, -0.005); s.lineTo(x0 + bl * 0.55, -0.007); s.absarc(x0 + bl * 0.55 + w, 0, w, Math.PI * 1.15, Math.PI * 0.85 + TAU, false); s.lineTo(x0, 0.005); s.closePath();
    } else if (kind === 'sickle') { // curved, hook-like blade
      s.moveTo(x0, -0.006); s.quadraticCurveTo(x0 + bl * 0.7, -0.012, x0 + bl, w * 0.9); s.quadraticCurveTo(x0 + bl * 0.6, 0.004, x0, 0.006); s.closePath();
    } else if (kind === 'saw') {    // saw-edged blade
      s.moveTo(x0, -0.006); s.lineTo(x0 + bl, -0.01);
      for (let k = 0; k < 9; k++) { const xx = x0 + bl - (k / 9) * bl; s.lineTo(xx, w * 0.75); s.lineTo(xx - bl / 18, w * 0.45); }
      s.lineTo(x0, 0.007); s.closePath();
    } else if (kind === 'axe') {    // small axe-headed knife
      s.moveTo(x0, -0.005); s.lineTo(x0 + bl * 0.75, -0.005); s.lineTo(x0 + bl * 0.75, -w * 1.1); s.quadraticCurveTo(x0 + bl * 1.02, -w * 0.4, x0 + bl * 0.98, w * 0.5);
      s.lineTo(x0 + bl * 0.8, 0.006); s.lineTo(x0, 0.005); s.closePath();
    } else {                        // needle-pointed knife
      s.moveTo(x0, -0.006); s.lineTo(x0 + bl * 1.15, 0); s.lineTo(x0, 0.006); s.closePath();
    }
  }, th, by));
  return { steel: merge(steel), brass: merge(brass), L: x0 + bl };
}

function probe(R, bulb = true) {
  const L = 0.5 + R() * 0.15, r = 0.0045;
  const steel = [rodX(0.03, L, r, r, 6), ball(L, r, 0, bulb ? r * 2.1 : r * 1.2, [bulb ? 1.4 : 1, 1, 1])];
  const brass = [ringFlat(0.018, 0, 0.016, 0.004, 0.004)];
  for (let k = 0; k < 3; k++) { const g = new THREE.TorusGeometry(r * 1.25, r * 0.5, 6, 12); g.rotateY(Math.PI / 2); g.translate(0.06 + k * 0.012, r, 0); brass.push(g); }
  return { steel: merge(steel), brass: merge(brass), L };
}

function hook(R) {
  const L = 0.48 + R() * 0.1, r = 0.0045;
  const steel = [rodX(0.0, L - 0.02, r, r, 6)];
  const pts = [];
  for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + (i / 14) * Math.PI * 1.1; pts.push(new THREE.Vector3(L - 0.02 + Math.cos(a) * 0.022, r, 0.022 + Math.sin(a) * 0.022)); }
  steel.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r * 0.85, 6, false));
  const h = handle(0.16, 0.009);
  return { steel: merge([...steel, ...h.steel]), brass: merge(h.brass), L };
}

function tongs(R) {
  const L = 0.42 + R() * 0.06, th = 0.004;
  const steel = [];
  for (const s of [-1, 1]) {
    steel.push(bladeGeo((sh) => {
      sh.moveTo(0, s * 0.004); sh.lineTo(0.06, s * 0.016); sh.lineTo(L * 0.7, s * 0.026); sh.lineTo(L, s * 0.006); sh.lineTo(L, s * 0.0015); sh.lineTo(L * 0.7, s * 0.019); sh.lineTo(0.06, s * 0.008); sh.lineTo(0, s * 0.0005); sh.closePath();
    }, th, 0.0));
  }
  steel.push(rodX(0.0, 0.03, 0.007, 0.006, 8));
  return { steel: merge(steel), brass: merge([ringFlat(-0.012, 0, 0.012, 0.0035, 0.004)]), L };
}

function tube(R) {
  const L = 0.32 + R() * 0.08, r = 0.014;
  const outer = new THREE.CylinderGeometry(r, r * 0.8, L, 16, 1, true); outer.rotateZ(-Math.PI / 2); outer.translate(L / 2 + 0.05, r, 0);
  // the bore: a second cylinder mirrored inside out (negative scale flips the winding), so it faces inwards
  const inv = new THREE.CylinderGeometry(r * 0.75, r * 0.6, L, 16, 1, true); inv.rotateZ(-Math.PI / 2); inv.scale(1, 1, -1); inv.computeVertexNormals(); inv.translate(L / 2 + 0.05, r, 0);
  const lip = new THREE.TorusGeometry(r * 0.88, r * 0.14, 6, 20); lip.rotateY(Math.PI / 2); lip.translate(L + 0.05, r * 0.85, 0);
  const brass = [new THREE.TorusGeometry(r * 1.1, r * 0.3, 6, 20), new THREE.TorusGeometry(r * 1.05, r * 0.25, 6, 20)];
  brass[0].rotateY(Math.PI / 2); brass[0].translate(0.05, r, 0); brass[1].rotateY(Math.PI / 2); brass[1].translate(0.09, r, 0);
  const cap = coneX(0.0, 0.05, 0.006, r, r, 12);
  return { steel: merge([outer, inv, lip]), brass: merge([...brass, cap]), L: L + 0.05 };
}

function needles(R) {
  const steel = [];
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * 0.026, L = 0.2 + k * 0.05, rr = 0.0022;
    steel.push(rodX(0.05, 0.05 + L, rr, rr, 5, z), coneX(0.05 + L, 0.05 + L + 0.03, rr, 0.0004, rr, 5, z));
    steel.push(ringFlat(0.044, z, 0.006, 0.0016, 0.002));
  }
  // one curved suture needle
  const pts = []; for (let i = 0; i <= 12; i++) { const a = Math.PI * 0.15 + (i / 12) * Math.PI * 0.7; pts.push(new THREE.Vector3(0.36 + Math.cos(a) * 0.06, 0.002, 0.05 - Math.sin(a) * 0.06 + 0.04)); }
  steel.push(varTube(new THREE.CatmullRomCurve3(pts), 16, 5, (u) => 0.0026 * (1 - Math.pow(u, 4) * 0.85)));
  return { steel: merge(steel), brass: null, L: 0.42 };
}

// Cruciform forceps (svastika yantra) whose jaws are named after animal mouths: two crossed arms with
// finger rings, a rivet, and a small cast head at the jaws (lion / heron / crow).
function forceps(kind, R) {
  const L = kind === 'heron' ? 0.66 : 0.58, P = kind === 'heron' ? 0.36 : 0.38, rr = 0.006;
  const steel = [], brass = [];
  for (const s of [-1, 1]) {
    const y = 0.008 + (s > 0 ? 0.008 : 0);
    const pts = [new THREE.Vector3(0.045, y, s * 0.05), new THREE.Vector3(0.14, y, s * 0.03), new THREE.Vector3(P - 0.06, y, s * 0.008), new THREE.Vector3(P, y, 0), new THREE.Vector3(P + 0.05, y, -s * 0.006)];
    steel.push(varTube(new THREE.CatmullRomCurve3(pts), 24, 7, (u) => rr * (0.85 + 0.3 * u)));
    steel.push(ringFlat(0.028, s * 0.06, 0.026, 0.0055, y));
  }
  brass.push((() => { const g = new THREE.CylinderGeometry(0.01, 0.01, 0.026, 12); g.translate(P, 0.012, 0); return g; })());
  const hx = P + 0.07;              // the head sits just behind the jaws
  let head;
  if (kind === 'lion') {
    brass.push(ball(hx, 0.022, 0, 0.026, [1.1, 0.9, 1]));                            // skull
    const mane = new THREE.TorusGeometry(0.03, 0.013, 8, 20); mane.rotateY(Math.PI / 2); mane.scale(0.7, 1, 1); mane.translate(hx - 0.008, 0.022, 0); brass.push(mane);
    brass.push(ball(hx + 0.026, 0.018, 0, 0.014, [1.3, 0.8, 0.9]));                   // muzzle
    brass.push(ball(hx - 0.004, 0.044, 0.016, 0.007), ball(hx - 0.004, 0.044, -0.016, 0.007));   // ears
    for (const s of [-1, 1]) {      // short, broad jaws (the open mouth)
      steel.push(bladeGeo((sh) => { sh.moveTo(0, -0.012); sh.quadraticCurveTo(0.05, -0.016, 0.1, -0.006); sh.lineTo(0.1, 0.006); sh.quadraticCurveTo(0.05, 0.016, 0, 0.012); sh.closePath(); }, 0.006, 0.0).translate(hx + 0.03, 0.006 + (s > 0 ? 0.012 : 0), 0).rotateY(0));
    }
    head = new THREE.Vector3(hx + 0.02, 0.03, 0);
    return { steel: merge(steel), brass: merge(brass), L: hx + 0.13, head };
  }
  if (kind === 'heron') {
    brass.push(ball(hx, 0.02, 0, 0.018, [1.25, 0.9, 0.9]));
    brass.push(coneX(hx - 0.05, hx - 0.012, 0.004, 0.012, 0.024, 8));                  // crest / neck
    for (const s of [-1, 1]) {      // long, slender beak
      const g = coneX(hx + 0.012, hx + 0.24, 0.007, 0.0012, 0.0, 8); g.translate(0, 0.012 + (s > 0 ? 0.005 : -0.001), s * 0.0025); steel.push(g);
    }
    head = new THREE.Vector3(hx, 0.03, 0);
    return { steel: merge(steel), brass: merge(brass), L: hx + 0.24, head };
  }
  // crow: a stout pointed beak
  brass.push(ball(hx, 0.02, 0, 0.02, [1.1, 0.9, 0.9]));
  for (const s of [-1, 1]) { const g = coneX(hx + 0.012, hx + 0.13, 0.011, 0.002, 0.0, 8); g.scale(1, 0.7, 1); g.translate(0, 0.012 + (s > 0 ? 0.007 : 0), 0); steel.push(g); }
  head = new THREE.Vector3(hx, 0.03, 0);
  return { steel: merge(steel), brass: merge(brass), L: hx + 0.13, head };
}

// The display set: 24 slots round the medallion, slot 0 facing the viewer. Returns per-slot builds.
export function buildInstruments(seed = 5) {
  const R = rng(seed);
  const order = ['probe', 'lion', 'leaf', 'hook', 'round', 'tongs', 'needle-k', 'sickle', 'tube', 'probe2', 'saw', 'crow',
    'needles', 'axe', 'probe', 'leaf', 'tongs', 'hook', 'round', 'tube', 'sickle', 'probe2', 'heron', 'leaf'];
  return order.map((k) => {
    switch (k) {
      case 'lion': return { ...forceps('lion', R), kind: k };
      case 'heron': return { ...forceps('heron', R), kind: k };
      case 'crow': return { ...forceps('crow', R), kind: k };
      case 'probe': return { ...probe(R, true), kind: k };
      case 'probe2': return { ...probe(R, false), kind: k };
      case 'hook': return { ...hook(R), kind: k };
      case 'tongs': return { ...tongs(R), kind: k };
      case 'tube': return { ...tube(R), kind: k };
      case 'needles': return { ...needles(R), kind: k };
      case 'needle-k': return { ...scalpel('needle', R), kind: k };
      default: return { ...scalpel(k, R), kind: k };
    }
  });
}

// ------------------------------------------------------------------ the diagram
// A head in profile, facing +x, in diagram units (crown ≈ +0.68, neck ≈ -0.6).
export const PROFILE = {
  front: [[-0.02, 0.62], [0.05, 0.52], [0.09, 0.4], [0.105, 0.3], [0.095, 0.25], [0.075, 0.215]],
  nose: [[0.075, 0.215], [0.1, 0.16], [0.135, 0.09], [0.168, 0.028], [0.185, -0.004], [0.17, -0.03], [0.12, -0.045], [0.085, -0.055]],
  lower: [[0.085, -0.055], [0.095, -0.1], [0.105, -0.13], [0.085, -0.15], [0.1, -0.175], [0.075, -0.22], [0.09, -0.28], [0.075, -0.33], [0.02, -0.36], [-0.07, -0.37], [-0.11, -0.42], [-0.12, -0.6]],
  back: [[-0.02, 0.62], [-0.15, 0.68], [-0.32, 0.66], [-0.47, 0.56], [-0.56, 0.38], [-0.57, 0.18], [-0.52, 0.0], [-0.44, -0.15], [-0.4, -0.3], [-0.42, -0.6]],
  brow: [[-0.04, 0.27], [0.02, 0.285], [0.08, 0.278]],
  eye: [[0.0, 0.212], [0.03, 0.222], [0.058, 0.208], [0.03, 0.198], [0.0, 0.212]],
  ear: (() => { const o = []; for (let i = 0; i <= 20; i++) { const a = -Math.PI * 0.62 + (i / 20) * Math.PI * 1.45; o.push([-0.25 - Math.cos(a) * 0.055, 0.085 + Math.sin(a) * 0.11]); } return o; })(),
  jaw: [[-0.27, -0.06], [-0.22, -0.22], [-0.12, -0.31], [0.02, -0.355]],
  cheekbone: [[-0.17, 0.12], [-0.08, 0.135], [0.03, 0.1]],
  ala: [[0.11, 0.03], [0.09, 0.0], [0.1, -0.03], [0.125, -0.038]],
  // the cheek flap (outlined), its pedicle kept by the side of the nose
  flap: [[0.07, -0.02], [0.02, 0.07], [-0.07, 0.09], [-0.15, 0.04], [-0.13, -0.05], [-0.04, -0.09], [0.04, -0.06], [0.07, -0.02]],
};
export const smoothPts = (pts, n = 6, z = 0) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, z)), false, 'centripetal').getPoints(Math.max(8, pts.length * n));
