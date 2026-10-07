// INVENTION — build-time assets for the Western film's gallery of invention. The gallery kit (geometry
// helpers, the floor / wall / plinth geometry, the shared material set) is the Indian film's
// (india/inventors-assets.js), reused here and given this gallery's own identity: cool slate-blue walls,
// a blue-grey veined marble floor and pale Carrara plinth tops, pewter instead of brass, white etched
// labels and an electric-white light trace instead of the gold thread. This file adds what the Western
// exhibits need: procedural normal maps (leather grain, gold foil crinkle, speaker cloth), the label and
// year atlases, Niépce's rooftops on a silvered plate, a television test card, the phone screens, the
// solar cells, the vial label and the syringe scale. The exhibits themselves: inventions-models.js.
import * as THREE from 'three';
import * as K from './india/inventors-assets.js';
import { rng, TAU } from '../lib/math.js';
import { fbm2 } from '../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { FONTS } from '../lib/text.js';

export { V3, bake, merge, lathe, box, rbox, cyl, rod, tubeAlong, curve, helix, knurl, rrShape, setDetail, woodTexture, wallGeometries, plinthGeometries } from './india/inventors-assets.js';
const fnt = (size, w = 400, fam = FONTS.mono, it = false) => `${it ? 'italic ' : ''}${w} ${size}px "${fam}"`;

// ------------------------------------------------------------------ the room, recoloured
// the kit's world-space slab floor (no period anywhere), its colour swapped for a cool blue-grey marble
// with pale veins and the odd near-black slab
export function galleryFloor() {
  const m = K.floorMaterial();
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb = base;', `
      vec3 cb = mix(vec3(0.026, 0.030, 0.036), vec3(0.060, 0.065, 0.073), sl.x) * (1.0 + 0.32 * mott);
      cb = mix(cb, vec3(0.011, 0.012, 0.015), step(0.84, sl.z) * 0.85);
      cb = mix(cb, vec3(0.27, 0.285, 0.30), vl * 0.42);
      cb *= 1.0 - 0.78 * sl.y;
      diffuseColor.rgb = cb;`);
  };
  m.customProgramCacheKey = () => 'winv-floor';
  return m;
}
// the kit's limewash wall, as deep slate blue
export function galleryWall() {
  const m = K.wallMaterial();
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('vec3(0.042, 0.034, 0.028)', 'vec3(0.018, 0.025, 0.037)');
  };
  m.customProgramCacheKey = () => 'winv-wall';
  return m;
}
// pale Carrara for the plinth tops: grey-white ground, soft grey veins and a faint warm cloud, from world
// position (every plinth top is cut from a different part of the block)
export function carraraMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.22, metalness: 0, envMapIntensity: 0.7 });
  m.userData.noAntiTile = true;
  m.userData.detail = { albedo: 0.02, rough: 0.15, scratch: 0.05, grime: 0.01 };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vCW;\n${GLSL_N}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 q = vCW * 7.0;
        float w = cn(q * 0.6) * 1.6 + cn(q * 1.7) * 0.5 + cn(q * 5.0) * 0.15;
        float v = smoothstep(0.08, 0.0, abs(sin(q.x * 0.9 + q.z * 0.4 + q.y * 0.7 + w * 2.6)) - 0.02);
        float v2 = smoothstep(0.05, 0.0, abs(sin(q.x * 2.1 - q.z * 1.3 + w * 4.0)) - 0.01);
        float cloud = cn(q * 0.35) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.62, 0.63, 0.64), vec3(0.70, 0.69, 0.67), cloud);
        c = mix(c, vec3(0.34, 0.36, 0.39), v * 0.55 + v2 * 0.25);
        diffuseColor.rgb = c * 0.55;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = 0.16 + 0.1 * cn(vCW * 30.0) + 0.12 * v;`);
  };
  m.customProgramCacheKey = () => 'winv-carrara';
  return m;
}
// tiny value-noise for the marble (independent of the shared GLSL noise so the program stays small)
const GLSL_N = /* glsl */ `
float ch(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float cn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z) * 2.0 - 1.0; }`;

// ------------------------------------------------------------------ procedural normal maps
// normal map from a height function h(u, v) (u, v in 0..1, tileable if h is), strength in texels
export function normalMap(N, h, strength = 2, { repeat = true } = {}) {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = h(x / N, y / N);
  const c = mkCanvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    d[i] = 128 + 127 * (-dx / l); d[i + 1] = 128 + 127 * (dy / l); d[i + 2] = 128 + 127 * (1 / l); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false, repeat });
}
// tileable fbm on a torus (so the maps wrap without a seam)
const tfbm = (u, v, f, oct = 3, s = 0) => { const a = u * TAU, b = v * TAU; return fbm2(Math.cos(a) * f + s, Math.sin(a) * f + Math.cos(b) * f * 0.7 + Math.sin(b) * f * 1.3, oct); };
export const leatherNormal = () => normalMap(256, (u, v) => { const n = tfbm(u, v, 3.5, 3, 1.7); return -Math.abs(n) * 0.6 + tfbm(u, v, 12, 2, 4) * 0.25; }, 3.2);
export const foilNormal = () => normalMap(256, (u, v) => { const r = 1 - Math.abs(tfbm(u, v, 2.4, 4, 9)); return r * r * 1.4 + tfbm(u, v, 9, 2, 3) * 0.3; }, 4.5);
export const clothNormal = () => normalMap(128, (u, v) => 0.5 * Math.sin(u * TAU * 32) * Math.sin(v * TAU * 32) + 0.25 * Math.sin((u + v) * TAU * 32), 1.4);

// ------------------------------------------------------------------ the gallery's materials
// The kit's material set (brass, nickel, steel, ebonite, glass, woods …) plus this gallery's own: the cool
// plinths and trim, pewter fittings, and the exhibits' woods, leather, enamel, gold foil, solar cells.
export function galleryMaterials(env, lite = false) {
  const M = K.materials(env);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.plinth.color.set('#12161c'); M.plinth.roughness = 0.34;
  M.trim.color.set('#18202a'); M.trim.roughness = 0.55;
  M.carrara = carraraMaterial();
  M.pewter = std({ color: '#9aa2ab', metalness: 1, roughness: 0.3, envMapIntensity: 0.8 });
  M.pewter.userData.detail = { albedo: 0.03, rough: 0.2, grime: 0.02, scratch: 0.25 };
  M.pewterDark = std({ color: '#5d646c', metalness: 1, roughness: 0.4 });
  const W = lite ? 512 : 1024;
  M.mahogany = std({ map: K.woodTexture({ W, H: 256, seed: 21, dark: [62, 24, 14], light: [134, 58, 32] }), roughness: 0.36, metalness: 0 });
  M.walnut = std({ map: K.woodTexture({ W, H: 256, seed: 33, dark: [40, 26, 17], light: [102, 68, 42] }), roughness: 0.4, metalness: 0 });
  M.fruitwood = std({ map: K.woodTexture({ W, H: 256, seed: 47, dark: [92, 56, 28], light: [168, 116, 66] }), roughness: 0.46, metalness: 0 });
  for (const k of ['mahogany', 'walnut', 'fruitwood']) M[k].userData.detail = { albedo: 0.04, rough: 0.25, scratch: 0.08, grime: 0.05 };
  const ln = leatherNormal();
  M.leather = std({ color: '#3b1510', roughness: 0.5, metalness: 0, normalMap: ln, normalScale: new THREE.Vector2(0.6, 0.6) });
  M.leatherBlack = std({ color: '#141110', roughness: 0.46, metalness: 0, normalMap: ln, normalScale: new THREE.Vector2(0.5, 0.5) });
  M.velvet = std({ color: '#3d0c1c', roughness: 0.95, metalness: 0 });
  M.enamel = std({ color: '#0b0b0c', roughness: 0.22, metalness: 0.15, envMapIntensity: 0.9 });
  M.enamel.userData.detail = { albedo: 0.02, rough: 0.3, scratch: 0.15, grime: 0.04 };
  M.steelDark = std({ color: '#43474c', metalness: 1, roughness: 0.42 });
  M.bakelite = std({ color: '#1e130c', roughness: 0.28, metalness: 0 });
  M.cream = std({ color: '#d9cfb8', roughness: 0.45, metalness: 0 });
  M.whitePaint = std({ color: '#cfd2d4', roughness: 0.55, metalness: 0 });
  M.graphite = std({ color: '#26282b', roughness: 0.6, metalness: 0.2 });
  M.foil = std({ color: '#d7a23c', metalness: 1, roughness: 0.3, normalMap: foilNormal(), normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.1 });
  M.foil.userData.detail = { albedo: 0.05, rough: 0.2 };
  M.foilSilver = std({ color: '#c7ccd2', metalness: 1, roughness: 0.28, normalMap: M.foil.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
  M.solar = std({ map: solarCellTexture(lite ? 256 : 512), metalness: 0.35, roughness: 0.22, envMapIntensity: 1.2 });
  M.cloth = std({ color: '#5b4a35', roughness: 0.92, metalness: 0, normalMap: clothNormal(), normalScale: new THREE.Vector2(0.7, 0.7) });
  M.tyre = std({ color: '#121212', roughness: 0.82, metalness: 0 });
  M.plasticDark = std({ color: '#2c2e31', roughness: 0.42, metalness: 0 });
  M.plasticGrey = std({ color: '#6d6f71', roughness: 0.5, metalness: 0 });
  M.silicone = std({ color: '#3a3c3e', roughness: 0.6, metalness: 0 });
  M.aluFrame = std({ color: '#b9bec4', metalness: 1, roughness: 0.24, envMapIntensity: 1 });
  M.aluFrame.userData.detail = { albedo: 0.02, rough: 0.2, scratch: 0.2 };
  M.capBlue = std({ color: '#2a4f8c', roughness: 0.35, metalness: 0 });
  M.glassClear = std({ color: '#e8eef2', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.14, envMapIntensity: 1.3, side: THREE.DoubleSide, depthWrite: false });
  M.quartz = std({ color: '#f2f4f6', metalness: 0, roughness: 0.08, transparent: true, opacity: 0.28, envMapIntensity: 1.2, depthWrite: false });
  M.liquid = std({ color: '#e7e2d8', metalness: 0, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
  M.black.color.set('#040405');
  return M;
}

// ------------------------------------------------------------------ the label and year atlases
// 2 columns × 5 rows of 512 × 160 cells; cellUV(i) → [u0, v0, u1, v1]
export const ATLAS = { cols: 2, rows: 5, W: 1024, H: 800 };
export function cellUV(i) {
  const c = i % ATLAS.cols, r = Math.floor(i / ATLAS.cols);
  return [c / ATLAS.cols, 1 - (r + 1) / ATLAS.rows, (c + 1) / ATLAS.cols, 1 - r / ATLAS.rows];
}
// blackened-steel plaques with white engraved capitals (one texture for all nine)
export function labelAtlas(entries) {
  const c = mkCanvas(ATLAS.W, ATLAS.H), g = c.getContext('2d');
  entries.forEach(([a, b], i) => {
    const cx = (i % 2) * 512, cy = Math.floor(i / 2) * 160, R = rng(i * 7 + 3);
    g.fillStyle = '#16191d'; g.fillRect(cx, cy, 512, 160);
    g.globalAlpha = 0.07; g.strokeStyle = '#cfd8e2';
    for (let k = 0; k < 120; k++) { const y = cy + R() * 160; g.lineWidth = 0.4 + R() * 0.8; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx + 512, y + (R() - 0.5) * 1.5); g.stroke(); }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(200,210,222,0.45)'; g.lineWidth = 1.5; g.strokeRect(cx + 12, cy + 12, 488, 136);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = fnt(a.length > 20 ? 34 : 40, 500, FONTS.mono); g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(a, cx + 257, cy + 64);
    g.fillStyle = '#e9eef4'; g.fillText(a, cx + 256, cy + 62);
    g.font = fnt(24, 400, FONTS.mono); g.fillStyle = '#a9b6c4'; g.fillText(b, cx + 256, cy + 110);
  });
  return toTexture(c);
}
// the years, in tall thin numerals, white on clear (etched into the wall behind each exhibit)
export function yearAtlas(years) {
  const c = mkCanvas(ATLAS.W, ATLAS.H), g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  years.forEach((y, i) => { g.font = fnt(146, 300, FONTS.serif); g.fillText(y, (i % 2) * 512 + 256, Math.floor(i / 2) * 160 + 84); });
  return toTexture(c);
}

// ------------------------------------------------------------------ Niépce's rooftops on a silvered plate
// The view from the window at Le Gras (1826–27) as a daguerreotype shows it: a soft, low-contrast
// grey image of the pigeon-house, the barn roof, a tree and the far wing, with the plate's blue-amber
// tarnish creeping in from the edges and a few hairline scratches. Drawn, not copied.
export function rooftopTexture() {
  const W = 512, H = 400, c = mkCanvas(W, H), g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#d8d6d0'); sky.addColorStop(0.55, '#b9b6ae'); sky.addColorStop(1, '#8d8a83');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.filter = 'blur(5px)';
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  poly([[0, 120], [70, 110], [92, 128], [92, 400], [0, 400]], '#3f3c38');              // pigeon-house (left)
  poly([[8, 132], [60, 124], [86, 136], [86, 400], [8, 400]], '#55524c');
  poly([[150, 260], [280, 170], [420, 250], [420, 400], [150, 400]], '#625e57');         // the barn roof
  poly([[150, 262], [280, 172], [300, 186], [170, 280]], '#9e9a92');                     // its lit slope
  poly([[380, 210], [512, 150], [512, 400], [380, 400]], '#4a4742');                     // the far wing (right)
  poly([[392, 214], [512, 160], [512, 190], [400, 236]], '#a7a39b');
  g.fillStyle = '#34312e'; g.beginPath(); g.ellipse(118, 218, 46, 60, 0, 0, TAU); g.fill();   // the tree
  g.fillRect(112, 240, 10, 120);
  poly([[0, 330], [512, 300], [512, 400], [0, 400]], '#3a3733');
  g.filter = 'none';
  // grain, tarnish halo, scratches
  const img = g.getImageData(0, 0, W, H), d = img.data, R = rng(1826);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H, e = Math.min(ex, ey);
    const halo = Math.exp(-e * 22) * (0.6 + 0.4 * fbm2(x * 0.02, y * 0.02, 2));
    const n = (R() - 0.5) * 18 + fbm2(x * 0.05, y * 0.05, 2) * 10;
    const tint = [halo * 50, halo * 10, -halo * 30], tint2 = [-halo * 20, halo * 15, halo * 60];
    const mixT = 0.5 + 0.5 * Math.sin(e * 90);
    for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, d[i + k] * (1 - halo * 0.35) + n + tint[k] * mixT + tint2[k] * (1 - mixT)));
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(235,235,230,0.25)';
  for (let k = 0; k < 14; k++) { g.lineWidth = 0.5 + R() * 0.7; g.beginPath(); const x = R() * W, y = R() * H; g.moveTo(x, y); g.quadraticCurveTo(x + (R() - 0.5) * 120, y + (R() - 0.5) * 60, x + (R() - 0.5) * 200, y + (R() - 0.5) * 100); g.stroke(); }
  return toTexture(c);
}

// ------------------------------------------------------------------ a television test card (generic)
// grey field, a crosshatch grid, the big circle, a centre target, a grey step wedge and resolution wedges
export function testCardTexture() {
  const W = 512, H = 384, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#6e6e6e'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#d8d8d8'; g.lineWidth = 2;
  for (let x = 16; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 12; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(W / 2, H / 2, 160, 0, TAU); g.fill();
  g.strokeStyle = '#f0f0f0'; g.lineWidth = 5; g.beginPath(); g.arc(W / 2, H / 2, 160, 0, TAU); g.stroke();
  // step wedge across the circle
  for (let i = 0; i < 6; i++) { const v = Math.round(20 + i * 45); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(W / 2 - 150 + i * 50, H / 2 + 40, 50, 46); }
  // resolution wedges (converging lines) above
  g.strokeStyle = '#f2f2f2'; g.lineWidth = 1.5;
  for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(W / 2 - 120 + k * 9, H / 2 - 130); g.lineTo(W / 2 - 40 + k * 3, H / 2 - 20); g.stroke(); g.beginPath(); g.moveTo(W / 2 + 120 - k * 9, H / 2 - 130); g.lineTo(W / 2 + 40 - k * 3, H / 2 - 20); g.stroke(); }
  // centre target
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (const r of [14, 30]) { g.beginPath(); g.arc(W / 2, H / 2, r, 0, TAU); g.stroke(); }
  g.beginPath(); g.moveTo(W / 2 - 60, H / 2); g.lineTo(W / 2 + 60, H / 2); g.moveTo(W / 2, H / 2 - 60); g.lineTo(W / 2, H / 2 + 60); g.stroke();
  // corner circles
  g.lineWidth = 4;
  for (const [x, y] of [[44, 40], [W - 44, 40], [44, H - 40], [W - 44, H - 40]]) { g.beginPath(); g.arc(x, y, 26, 0, TAU); g.stroke(); }
  g.fillStyle = '#f4f4f4'; g.font = fnt(22, 500, FONTS.mono); g.textAlign = 'center'; g.fillText('TEST CARD', W / 2, H / 2 + 120);
  return toTexture(c);
}

// ------------------------------------------------------------------ the phones' screens (generic, no marks)
const ICON_COLS = ['#ff6b5a', '#ffb347', '#ffd84a', '#4cd47a', '#2fc2c9', '#3d8bff', '#6a5cff', '#c35cff', '#ff5ca8', '#8e9aa6', '#f0f0f0', '#24c08a'];
function glyph(g, k, x, y, s) {
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineWidth = s * 0.08; g.lineCap = 'round'; g.lineJoin = 'round';
  const c = x + s / 2, m = y + s / 2;
  switch (k % 8) {
    case 0: g.beginPath(); g.arc(c, m, s * 0.24, 0, TAU); g.stroke(); break;
    case 1: g.strokeRect(c - s * 0.22, m - s * 0.16, s * 0.44, s * 0.32); break;
    case 2: g.beginPath(); g.moveTo(c - s * 0.22, m + s * 0.18); g.lineTo(c, m - s * 0.2); g.lineTo(c + s * 0.22, m + s * 0.18); g.closePath(); g.stroke(); break;
    case 3: for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(c - s * 0.22, m - s * 0.12 + i * s * 0.12); g.lineTo(c + s * 0.22, m - s * 0.12 + i * s * 0.12); g.stroke(); } break;
    case 4: g.beginPath(); g.arc(c, m + s * 0.06, s * 0.2, Math.PI, 0); g.stroke(); g.beginPath(); g.arc(c, m - s * 0.12, s * 0.06, 0, TAU); g.fill(); break;
    case 5: g.beginPath(); g.moveTo(c - s * 0.22, m); for (let i = 0; i <= 8; i++) g.lineTo(c - s * 0.22 + i * s * 0.055, m + Math.sin(i * 1.4) * s * 0.12); g.stroke(); break;
    case 6: for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(c + (i % 2 - 0.5) * s * 0.22, m + (Math.floor(i / 2) - 0.5) * s * 0.22, s * 0.06, 0, TAU); g.fill(); } break;
    default: g.beginPath(); g.moveTo(c, m - s * 0.22); g.lineTo(c, m + s * 0.22); g.moveTo(c - s * 0.22, m); g.lineTo(c + s * 0.22, m); g.stroke();
  }
}
export function phoneScreens() {
  const W = 540, H = 1170, R = rng(2007);
  const wall = (g) => {
    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#0e1b3d'); grd.addColorStop(0.5, '#2a1f5c'); grd.addColorStop(1, '#0b2b3a'); g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.35;
    for (let k = 0; k < 5; k++) { g.strokeStyle = ['#5ac8ff', '#a77bff', '#3fe0c5', '#ff7bd5', '#7b9bff'][k]; g.lineWidth = 60 + k * 18; g.beginPath(); g.moveTo(-50, 300 + k * 160); g.bezierCurveTo(200, 120 + k * 200, 340, 700 + k * 60, 620, 380 + k * 150); g.stroke(); }
    g.globalAlpha = 1;
  };
  const status = (g) => {
    g.fillStyle = '#ffffff'; g.font = fnt(28, 600, FONTS.sans); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('10:07', 48, 44);
    g.fillRect(W - 92, 34, 40, 20); g.fillRect(W - 50, 39, 4, 10); g.fillRect(W - 140, 46, 6, 10); g.fillRect(W - 130, 40, 6, 16); g.fillRect(W - 120, 34, 6, 22);
    g.fillStyle = '#000'; g.beginPath(); g.arc(W / 2, 44, 15, 0, TAU); g.fill();
  };
  const lock = mkCanvas(W, H), gl = lock.getContext('2d');
  wall(gl); status(gl);
  gl.fillStyle = '#ffffff'; gl.textAlign = 'center'; gl.font = fnt(168, 200, FONTS.sans); gl.fillText('10:07', W / 2, 300);
  gl.font = fnt(32, 400, FONTS.sans); gl.fillText('Tuesday 9 January', W / 2, 165);
  gl.globalAlpha = 0.18; gl.fillRect(140, H - 40, W - 280, 8); gl.globalAlpha = 1;
  const home = mkCanvas(W, H), gh = home.getContext('2d');
  wall(gh); status(gh);
  const S = 92, gx = 50, gy = 130, sx = (W - 2 * gx - 4 * S) / 3;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) {
    const x = gx + c * (S + sx), y = gy + r * 150, k = r * 4 + c;
    gh.fillStyle = ICON_COLS[Math.floor(R() * ICON_COLS.length)];
    gh.beginPath(); gh.roundRect(x, y, S, S, 24); gh.fill();
    glyph(gh, k, x, y, S);
    gh.fillStyle = 'rgba(255,255,255,0.85)'; gh.fillRect(x + 18, y + S + 14, S - 36, 7);
  }
  gh.fillStyle = 'rgba(255,255,255,0.2)'; gh.beginPath(); gh.roundRect(30, H - 190, W - 60, 140, 46); gh.fill();
  for (let c = 0; c < 4; c++) { const x = gx + c * (S + sx), y = H - 166; gh.fillStyle = ICON_COLS[(c * 3 + 2) % ICON_COLS.length]; gh.beginPath(); gh.roundRect(x, y, S, S, 24); gh.fill(); glyph(gh, c + 3, x, y, S); }
  return [toTexture(lock), toTexture(home)];
}
// the 1994 touchscreen phone's monochrome LCD: a grid of eight function icons
export function simonScreenTexture() {
  const W = 256, H = 320, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#9fae8a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#26301f'; g.font = fnt(20, 500, FONTS.mono); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('MON 12:00 PM', 16, 22);
  g.fillRect(12, 38, W - 24, 2);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
    const x = 22 + k * 116, y = 54 + r * 64;
    g.strokeStyle = '#26301f'; g.lineWidth = 3; g.strokeRect(x, y, 96, 52);
    g.save(); g.translate(x + 28, y + 6); g.scale(0.4, 0.4); g.strokeStyle = '#26301f'; g.fillStyle = '#26301f';
    const gg = g; gg.lineWidth = 9; gg.beginPath(); gg.arc(50, 50, 30 - (r + k) * 2, 0, TAU * (0.6 + 0.1 * r)); gg.stroke();
    g.restore();
  }
  return toTexture(c);
}

// ------------------------------------------------------------------ solar cells
// 8 × 8 dark-blue polycrystalline cells, silver busbars and fingers, white substrate in the gaps
export function solarCellTexture(N = 512) {
  const c = mkCanvas(N, N), g = c.getContext('2d'), n = 8, s = N / n, R = rng(1978);
  g.fillStyle = '#d6d8da'; g.fillRect(0, 0, N, N);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i * s + s * 0.03, y = j * s + s * 0.03, w = s * 0.94;
    const l = 14 + R() * 10; g.fillStyle = `hsl(222, 62%, ${l}%)`; g.fillRect(x, y, w, w);
    // crystal flakes
    g.globalAlpha = 0.25;
    for (let k = 0; k < 10; k++) { g.fillStyle = `hsl(${215 + R() * 20}, 60%, ${10 + R() * 22}%)`; g.beginPath(); const px = x + R() * w, py = y + R() * w; g.moveTo(px, py); g.lineTo(px + (R() - 0.5) * w * 0.6, py + (R() - 0.5) * w * 0.6); g.lineTo(px + (R() - 0.5) * w * 0.6, py + (R() - 0.5) * w * 0.6); g.fill(); }
    g.globalAlpha = 0.55; g.fillStyle = '#c9ced6';
    for (let k = 1; k < 10; k++) g.fillRect(x, y + k * w / 10, w, Math.max(0.6, s * 0.006));
    g.globalAlpha = 1; g.fillStyle = '#d8dde4';
    g.fillRect(x + w * 0.3, y, s * 0.025, w); g.fillRect(x + w * 0.68, y, s * 0.025, w);
  }
  return toTexture(c);
}

// ------------------------------------------------------------------ the vial label, the syringe scale
export function vialLabelTexture() {
  const W = 512, H = 200, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f2f1ec'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#2a4f8c'; g.fillRect(0, 0, W, 34); g.fillRect(0, H - 18, W, 18);
  g.fillStyle = '#1b1d22'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = fnt(34, 600, FONTS.sans); g.fillText('mRNA VACCINE', 24, 70);
  g.font = fnt(18, 400, FONTS.mono); g.fillText('SUSPENSION FOR INJECTION', 24, 108); g.fillText('MULTI-DOSE VIAL · FOR IM USE', 24, 134);
  g.fillText('LOT 2020-12  EXP --/--', 24, 160);
  for (let i = 0; i < 34; i++) { const w = 1 + ((i * 7) % 4); g.fillRect(380 + i * 3.4, 60, w * 0.8, 70); }
  return toTexture(c);
}
// graduations on clear: 0 … 1 mL along u, printed black on a faint glass ground (alpha)
export function syringeScaleTexture() {
  const W = 1024, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = 'rgba(230,236,240,0.10)'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(16,18,22,0.92)'; g.font = fnt(22, 500, FONTS.mono); g.textAlign = 'center'; g.textBaseline = 'top';
  const x0 = 120, x1 = 940;
  for (let i = 0; i <= 20; i++) {
    const x = x0 + (x1 - x0) * i / 20, l = i % 10 === 0 ? 46 : i % 2 === 0 ? 34 : 22;
    g.fillRect(x - 1.2, 8, 2.4, l);
    if (i % 4 === 0 && i) g.fillText((i / 20).toFixed(1), x, 60);
  }
  g.fillText('mL', x1 + 50, 60);
  return toTexture(c);
}
