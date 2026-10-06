// Assets for THE FIRST CITIES (indus.js): procedural textures (baked brick in English bond, soil, mud
// plaster, banded chert, the steatite seal), a box/quad accumulator that bakes thousands of axis-aligned
// parts into a few meshes with per-part animation attributes, and the "rise" material patch that lifts
// every house out of the ground and settles it onto the street grid on the GPU (a pure function of two
// uniforms, so the scene stays scrubbable).
import * as THREE from 'three';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';

// ---------------------------------------------------------------------------------------------- textures
// Harappan baked bricks keep a 1 : 2 : 4 ratio (about 7 × 14 × 28 cm). One tile = 1.12 m × 1.12 m:
// 14 courses of 8 cm (7 cm brick + 1 cm mud-mortar joint), English bond (a course of stretchers, then a
// course of headers set a quarter brick over), so the courses tile seamlessly.
export function brickTextures({ size = 512, seed = 3, tile = 1.12, dust = 0.0, palette = 'baked' } = {}) {
  const r = rng(seed);
  const c = mkCanvas(size, size), g = c.getContext('2d');
  const b = mkCanvas(size, size), gb = b.getContext('2d');
  const px = size / tile;
  g.fillStyle = palette === 'baked' ? '#9a8a76' : '#6c5a49'; g.fillRect(0, 0, size, size);
  gb.fillStyle = '#202020'; gb.fillRect(0, 0, size, size);
  const COURSE = 0.08, BH = 0.07, J = 0.01;
  const courses = Math.round(tile / COURSE);
  for (let k = 0; k < courses; k++) {
    const header = k % 2 === 1;
    const unit = header ? 0.14 : 0.28, off = header ? 0.07 : 0;
    const y0 = k * COURSE * px + J * 0.5 * px, h = BH * px;
    for (let x = -unit + off; x < tile + 1e-6; x += unit) {
      // per-brick firing colour: oranges and reds, a few dark over-fired ones, a few pale
      const v = r();
      let hue = 16 + r() * 12, sat = 26 + r() * 16, lum = 38 + r() * 13;
      if (v < 0.08) { lum -= 12; sat -= 8; } else if (v > 0.9) { lum += 10; sat -= 10; hue += 8; }
      const x0 = (x + J * 0.5) * px, w = (unit - J) * px;
      for (const dx of [0, -size, size]) {
        g.fillStyle = `hsl(${hue},${sat}%,${lum}%)`;
        g.fillRect(x0 + dx, y0, w, h);
        // soft edge darkening and a lighter worn face
        g.fillStyle = `hsla(${hue},${sat}%,${lum + 6}%,0.55)`;
        g.fillRect(x0 + dx + w * 0.12, y0 + h * 0.2, w * 0.76, h * 0.55);
        gb.fillStyle = `rgb(${200 + Math.floor(r() * 40)},${200},${200})`;
        gb.fillRect(x0 + dx, y0, w, h);
      }
    }
  }
  // grain: speckles, pits and chips (colour), mirrored as small dents in the bump
  for (let i = 0; i < size * size * 0.05; i++) {
    const x = r() * size, y = r() * size, s = 0.6 + r() * 1.8, d = r();
    g.fillStyle = d < 0.5 ? `rgba(40,22,12,${0.12 + r() * 0.2})` : `rgba(235,190,150,${0.06 + r() * 0.12})`;
    g.fillRect(x, y, s, s);
    if (d < 0.15) { gb.fillStyle = 'rgba(40,40,40,0.5)'; gb.fillRect(x, y, s * 1.5, s * 1.5); }
  }
  if (dust > 0) {   // pale dust settled in the joints (the close-up floor)
    g.globalAlpha = dust;
    for (let k = 0; k <= courses; k++) { g.fillStyle = '#cdb497'; g.fillRect(0, k * COURSE * px - J * 0.6 * px, size, J * 1.2 * px); }
    g.globalAlpha = 1;
  }
  const map = toTexture(c, { repeat: true });
  const bump = toTexture(b, { repeat: true, srgb: false });
  return { map, bump };
}

// Dusty alluvial soil of the plain (tileable value noise in warm ochres).
export function soilTexture({ size = 512, seed = 9 } = {}) {
  const r = rng(seed), c = mkCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const lat = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
  const octs = [[8, 0.4, lat(8)], [32, 0.3, lat(32)], [128, 0.3, lat(128)]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const [n, w, L] of octs) {
      const fx = x / size * n, fy = y / size * n, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = L[(iy % n) * n + ix % n], b = L[(iy % n) * n + (ix + 1) % n], cc = L[((iy + 1) % n) * n + ix % n], dd = L[((iy + 1) % n) * n + (ix + 1) % n];
      v += w * ((a + (b - a) * tx) * (1 - ty) + (cc + (dd - cc) * tx) * ty);
    }
    const k = (y * size + x) * 4, s = 0.78 + 0.4 * (v - 0.5);
    d[k] = 205 * s; d[k + 1] = 170 * s; d[k + 2] = 128 * s; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 2200; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,60,35,0.18)' : 'rgba(250,225,190,0.12)'; g.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2); }
  return toTexture(c, { repeat: true });
}

// Mud plaster of the flat roofs (lightly cracked).
export function plasterTexture({ size = 256, seed = 4 } = {}) {
  const r = rng(seed), c = mkCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = '#b89a78'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1600; i++) { const v = 150 + r() * 70; g.fillStyle = `rgba(${v},${v * 0.82},${v * 0.62},0.25)`; g.fillRect(r() * size, r() * size, 2 + r() * 6, 2 + r() * 6); }
  g.strokeStyle = 'rgba(80,58,40,0.35)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) { let x = r() * size, y = r() * size; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  return toTexture(c, { repeat: true });
}

// Soil in section (the walls of the cutaway trench): horizontal layers of silt and debris.
export function sectionTexture({ size = 256, seed = 12 } = {}) {
  const r = rng(seed), c = mkCanvas(size, size), g = c.getContext('2d');
  let y = 0;
  while (y < size) {
    const h = 6 + r() * 26, v = 0.65 + r() * 0.4;
    g.fillStyle = `rgb(${Math.floor(120 * v)},${Math.floor(92 * v)},${Math.floor(66 * v)})`;
    g.fillRect(0, y, size, h); y += h;
  }
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.3 ? 'rgba(150,70,40,0.5)' : 'rgba(40,28,18,0.3)'; g.fillRect(r() * size, r() * size, 1 + r() * 4, 1 + r() * 3); }
  return toTexture(c, { repeat: true });
}

// Banded chert: grey-buff with fine wavy bands.
export function chertTexture({ size = 256, seed = 21, tint = [196, 186, 168] } = {}) {
  const r = rng(seed), c = mkCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  const f1 = 0.05 + r() * 0.05, f2 = 0.15 + r() * 0.1, ph = r() * 10, ang = r() * Math.PI;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x * ca + y * sa, w = -x * sa + y * ca;
    const band = Math.sin(u * f1 + Math.sin(w * 0.03 + ph) * 2.4) * 0.5 + 0.5;
    const fine = Math.sin(u * f2 * 3 + w * 0.01) * 0.5 + 0.5;
    const s = 0.8 + 0.09 * band + 0.03 * fine + (r() - 0.5) * 0.06;
    const k = (y * size + x) * 4;
    d[k] = tint[0] * s; d[k + 1] = tint[1] * s; d[k + 2] = tint[2] * s * (0.96 + 0.06 * band); d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

// The seal face: a stylised humped bull (zebu) in intaglio inside a raised border, with three plain strokes
// above it standing in for an inscription (the Indus script is undeciphered: no real sign sequence is drawn).
// Returns a colour map (recesses darker) and a bump map (recesses low). `mirror` + `raised` draw the clay
// impression the seal leaves (the same motif reversed and standing proud).
export function sealTextures({ size = 512, mirror = false, raised = false, base = '#d9cfbf' } = {}) {
  const draw = (g, ink) => {
    g.save();
    if (mirror) { g.translate(size, 0); g.scale(-1, 1); }
    g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round'; g.lineJoin = 'round';
    const S = size / 512;
    g.scale(S, S);
    // body
    g.beginPath(); g.ellipse(270, 315, 120, 62, 0.04, 0, Math.PI * 2); g.fill();
    // hump over the shoulders
    g.beginPath(); g.ellipse(205, 258, 46, 40, -0.3, 0, Math.PI * 2); g.fill();
    // neck and head (facing left), muzzle
    g.beginPath(); g.moveTo(190, 280); g.quadraticCurveTo(150, 250, 112, 262); g.lineTo(92, 300); g.quadraticCurveTo(100, 318, 128, 320); g.quadraticCurveTo(160, 330, 190, 340); g.closePath(); g.fill();
    // dewlap
    g.beginPath(); g.moveTo(150, 318); g.quadraticCurveTo(165, 372, 205, 360); g.lineTo(200, 330); g.closePath(); g.fill();
    // horns: two sweeping crescents
    g.lineWidth = 11;
    g.beginPath(); g.moveTo(128, 262); g.quadraticCurveTo(120, 205, 160, 180); g.stroke();
    g.beginPath(); g.moveTo(140, 262); g.quadraticCurveTo(150, 215, 190, 205); g.stroke();
    // ear
    g.beginPath(); g.ellipse(150, 262, 16, 7, -0.5, 0, Math.PI * 2); g.fill();
    // legs (fore pair and hind pair), tapering to hooves
    g.lineWidth = 17;
    for (const [x0, x1] of [[205, 198], [232, 238], [318, 312], [350, 360]]) { g.beginPath(); g.moveTo(x0, 350); g.lineTo(x1, 438); g.stroke(); }
    // tail
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(385, 300); g.quadraticCurveTo(415, 340, 404, 410); g.stroke();
    g.beginPath(); g.ellipse(403, 418, 9, 14, 0, 0, Math.PI * 2); g.fill();
    // three plain strokes above (abstract, not a sign sequence)
    g.lineWidth = 12;
    for (const x of [300, 330, 360]) { g.beginPath(); g.moveTo(x, 110); g.lineTo(x, 168); g.stroke(); }
    g.beginPath(); g.arc(410, 140, 15, 0, Math.PI * 2); g.lineWidth = 9; g.stroke();
    g.restore();
  };
  const c = mkCanvas(size, size), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const r = rng(5);
  for (let i = 0; i < 1500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,105,85,0.12)' : 'rgba(255,250,240,0.12)'; g.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3); }
  g.strokeStyle = raised ? 'rgba(255,240,215,0.35)' : 'rgba(70,58,44,0.55)'; g.lineWidth = size * 0.02; g.strokeRect(size * 0.05, size * 0.05, size * 0.9, size * 0.9);
  draw(g, raised ? 'rgba(255,235,205,0.25)' : 'rgba(92,74,54,0.6)');
  const b = mkCanvas(size, size), gb = b.getContext('2d');
  gb.fillStyle = raised ? '#404040' : '#d0d0d0'; gb.fillRect(0, 0, size, size);
  gb.filter = `blur(${size / 256}px)`;
  draw(gb, raised ? '#e8e8e8' : '#303030');
  gb.strokeStyle = raised ? '#e0e0e0' : '#ffffff'; gb.lineWidth = size * 0.035; gb.strokeRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

// ---------------------------------------------------------------------------------------------- geometry
// Accumulates quads into flat arrays: position / normal / uv plus two animation attributes —
// aBlk = (centre x, centre z, rise delay, rise depth) and aJit = (dx, dz, yaw) the pre-grid offset.
// UVs are world-projected (metres / uvTile), so brick courses run on unbroken across parts.
export class Acc {
  constructor(uvTile = 1.12) { this.p = []; this.n = []; this.uv = []; this.b = []; this.j = []; this.k = 1 / uvTile; }
  quad(a, b, c, d, blk, jit) {
    const e1 = new THREE.Vector3().subVectors(b, a), e2 = new THREE.Vector3().subVectors(c, a);
    const n = e1.cross(e2).normalize(), ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z), k = this.k;
    const uvOf = (v) => (ay > ax && ay > az ? [v.x * k, v.z * k] : ax > az ? [v.z * k, v.y * k] : [v.x * k, v.y * k]);
    for (const v of [a, b, c, a, c, d]) {
      this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z); this.uv.push(...uvOf(v));
      this.b.push(...blk); this.j.push(...jit);
    }
  }
  // axis-aligned box; `faces` picks sides: 'px nx pz nz py ny'. `top` (another Acc) receives the top face.
  box(x0, x1, y0, y1, z0, z1, blk = STATIC, jit = NOJIT, { faces = 'px nx pz nz py', top = null } = {}) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    if (faces.includes('px')) this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), blk, jit);
    if (faces.includes('nx')) this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), blk, jit);
    if (faces.includes('pz')) this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), blk, jit);
    if (faces.includes('nz')) this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), blk, jit);
    if (faces.includes('py')) (top ?? this).quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), blk, jit);
    if (faces.includes('ny')) this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), blk, jit);
  }
  // inside of an open box (a pit / pool / trench): walls and floor facing inwards
  pit(x0, x1, y0, y1, z0, z1, blk = STATIC, jit = NOJIT, floor = this) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.quad(V(x0, y0, z1), V(x0, y0, z0), V(x0, y1, z0), V(x0, y1, z1), blk, jit);   // west wall, facing +x
    this.quad(V(x1, y0, z0), V(x1, y0, z1), V(x1, y1, z1), V(x1, y1, z0), blk, jit);   // east wall, facing -x
    this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y1, z0), V(x0, y1, z0), blk, jit);   // north wall, facing +z
    this.quad(V(x1, y0, z1), V(x0, y0, z1), V(x0, y1, z1), V(x1, y1, z1), blk, jit);   // south wall, facing -z
    if (floor) floor.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y0, z0), V(x0, y0, z0), blk, jit);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aBlk', new THREE.Float32BufferAttribute(this.b, 4));
    g.setAttribute('aJit', new THREE.Float32BufferAttribute(this.j, 3));
    g.computeBoundingSphere();
    return g;
  }
  get tris() { return this.p.length / 9; }
}
export const STATIC = [0, 0, -10, 0];
export const NOJIT = [0, 0, 0];

// ---------------------------------------------------------------------------------------------- rise patch
// Every part rises out of the ground over 0.45 s after its own delay (uRise = scene time) and, until the
// grid is surveyed (uSettle 0 → 1), stands a little off it: shifted and turned about its own centre.
const RISE_GLSL = /* glsl */ `
attribute vec4 aBlk; attribute vec3 aJit; uniform float uRise, uSettle; varying float vTint;
vec3 riseP(vec3 p){
  float rk = clamp((uRise - aBlk.z) / 0.45, 0.0, 1.0); rk = 1.0 - (1.0 - rk) * (1.0 - rk) * (1.0 - rk);
  float s = 1.0 - uSettle, a = aJit.z * s, ca = cos(a), sa = sin(a);
  vec2 d = p.xz - aBlk.xy;
  p.xz = aBlk.xy + vec2(ca * d.x - sa * d.y, sa * d.x + ca * d.y) + aJit.xy * s;
  p.y -= (1.0 - rk) * (aBlk.w + 0.6);
  return p;
}
vec3 riseN(vec3 n){ float a = aJit.z * (1.0 - uSettle), ca = cos(a), sa = sin(a); return vec3(ca * n.x - sa * n.z, n.y, sa * n.x + ca * n.z); }`;
function patchRise(sh, U) {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${RISE_GLSL}`)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = riseN(objectNormal);')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = riseP(transformed);\nvTint = fract(sin(dot(aBlk.xy, vec2(12.9898, 78.233))) * 43758.5453);');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vTint;')
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(0.86, 0.9, 0.95), vec3(1.1, 1.02, 0.94), vTint);');
}
export function riseMaterial(m, U, key) {
  m.onBeforeCompile = (sh) => patchRise(sh, U);
  m.customProgramCacheKey = () => 'indus-rise-' + key;
  m.userData.noAntiTile = true;   // (texture bombing would shift the brick courses)
  return m;
}
export function riseDepth(U) {
  const m = new THREE.MeshDepthMaterial();
  m.onBeforeCompile = (sh) => patchRise(sh, U);
  m.customProgramCacheKey = () => 'indus-rise-depth';
  return m;
}
