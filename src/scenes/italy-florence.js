// THE ITALIAN RENAISSANCE — Florence: Santa Maria del Fiore and Brunelleschi's dome (1420–1436) over the
// terracotta roofs. Units: 1 = 10 m. The dome is an octagonal cloister vault on a pointed 'quinto acuto'
// profile, built as TWO shells (inner and outer) joined at the oculus ring under the lantern; eight white
// marble ribs on the corners, an octagonal drum with round oculi, three tribunes with half-domes, the nave
// to the west, Giotto's campanile and the baptistery. The cutaway removes two webs facing the camera:
// the section faces show the double shell, and in the opening the inner shell's bricks are laid course by
// course, the courses interrupted by bricks set on end that climb diagonally — Brunelleschi's herringbone
// (spina pesce), which locked each course while the mortar set, so the dome rose without centering.
import * as THREE from 'three';
import { rng, lerp } from '../lib/math.js';
import { noise2, fbm2 } from '../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { V, mergeParts, at, normalFromHeight, boxUV } from './italy-assets.js';

export const DOME_Y0 = 5.5;        // springing of the dome (top of the drum)
export const DOME_H = 3.6;         // springing → oculus ring
export const DRUM_Y0 = 4.3;
export const CUT = [0, 2];         // webs removed by the cutaway (centred on 67.5°, facing the end camera)
export const CUT_DIR = Math.PI * 3 / 8;   // 67.5°
const TOP_Y = DOME_Y0 + DOME_H;
const OCT = Math.PI / 4;
const cornerAng = (k) => Math.PI / 8 + k * OCT;
// shells: corner radius at the springing and at the oculus
export const SHELLS = {
  innerIn: [2.25, 0.46], innerOut: [2.47, 0.52],
  outerIn: [2.62, 0.56], outerOut: [2.72, 0.6],
};

// pointed-arch profile shared by every surface (scaled radially): 0 at the springing → 1 at the oculus
const R0 = 2.5, X0 = 0.5, RHO = 1.6 * R0, XC = R0 - RHO, H0 = Math.sqrt(RHO * RHO - (X0 - XC) ** 2);
const prof = (s) => (XC + Math.sqrt(Math.max(0, RHO * RHO - (s * H0) ** 2)) - X0) / (R0 - X0);
export const cornerR = ([R, top], s) => top + (R - top) * prof(s);
export const yAt = (s) => DOME_Y0 + s * DOME_H;
// point on the octagon of corner radius r, web k, u ∈ [0,1] from corner k to corner k+1
export function octPt(r, k, u, y = 0, out = V()) {
  const a0 = cornerAng(k), a1 = cornerAng(k + 1);
  return out.set(lerp(Math.cos(a0), Math.cos(a1), u) * r, y, lerp(Math.sin(a0), Math.sin(a1), u) * r);
}

// ---------------------------------------------------------------------------- textures
function tileCanvas(seed = 3, S = 512) {
  const c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#5e2a16'; g.fillRect(0, 0, S, S);
  const rows = 16, cols = 16, th = S / rows, tw = S / cols;
  for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
    const x = i * tw + (j % 2) * tw * 0.5 - tw * 0.5, y = j * th;
    const l = 0.72 + r() * 0.42, h = r();
    const R = Math.round((170 + h * 18) * l), G = Math.round((80 + h * 16) * l), B = Math.round((46 + h * 6) * l);
    const gr = g.createLinearGradient(x, 0, x + tw, 0);
    gr.addColorStop(0, `rgb(${R * 0.55 | 0},${G * 0.5 | 0},${B * 0.5 | 0})`);
    gr.addColorStop(0.45, `rgb(${R},${G},${B})`);
    gr.addColorStop(0.62, `rgb(${Math.min(255, R * 1.12) | 0},${Math.min(255, G * 1.1) | 0},${B})`);
    gr.addColorStop(1, `rgb(${R * 0.5 | 0},${G * 0.45 | 0},${B * 0.45 | 0})`);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(x + tw / 2, y + th * 0.55, tw * 0.47, th * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(30,10,4,0.35)'; g.fillRect(x + 2, y + th * 0.94, tw - 4, th * 0.12);
  }
  // weathering: lichen and soot
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, rad = 3 + r() * 22;
    g.fillStyle = r() < 0.6 ? `rgba(40,25,15,${0.04 + r() * 0.07})` : `rgba(190,170,120,${0.03 + r() * 0.05})`;
    g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
  // rain streaks down the slope
  for (let i = 0; i < 70; i++) { const x = r() * S, y = r() * S; const gr = g.createLinearGradient(0, y, 0, y + 120); gr.addColorStop(0, 'rgba(30,20,12,0.16)'); gr.addColorStop(1, 'rgba(30,20,12,0)'); g.fillStyle = gr; g.fillRect(x, y, 4 + r() * 8, 120); }
  return c;
}
let _tile = null;
export function tileTexture() {
  if (_tile) return _tile;
  const c = tileCanvas();
  _tile = toTexture(c, { repeat: true }); _tile.userData.normal = normalFromHeight(c, 4);
  return _tile;
}

function brickCanvas(S = 256) {
  const c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(9);
  g.fillStyle = '#8f7b62'; g.fillRect(0, 0, S, S);
  const rows = 16, bh = S / rows, bw = S / 6;
  for (let j = 0; j < rows; j++) for (let i = -1; i < 7; i++) {
    const x = i * bw + (j % 2) * bw * 0.5, y = j * bh, l = 0.75 + r() * 0.4;
    g.fillStyle = `rgb(${150 * l | 0},${68 * l | 0},${42 * l | 0})`;
    g.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
  }
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1); }
  return c;
}
let _brick = null;
export function brickTexture() { if (_brick) return _brick; const c = brickCanvas(); _brick = toTexture(c, { repeat: true }); _brick.userData.normal = normalFromHeight(c, 3); return _brick; }

// The cathedral's polychrome skin: white Carrara, green Prato serpentine and red Maremma marble in
// geometric bands — a plinth, framed rectangular panels with red inlays, a chequer frieze, tall panels
// with blind arches, striped corner pilasters. One canvas = 20 m × 20 m of wall (box-projected UVs); a
// height canvas gives the joints and the slightly proud frames for the normal map.
const MG = '#2c4434', MR = '#9c4a3e', MW = '#ece6d8';
function marbleCanvas(S = 1024) {
  const c = mkCanvas(S, S), g = c.getContext('2d'), h = mkCanvas(S, S), hg = h.getContext('2d'), r = rng(12);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm2(x / S * 6, y / S * 6, 4), i = (y * S + x) * 4;
    const vein = Math.pow(1 - Math.abs(Math.sin((x / S * 9 + y / S * 4 + n * 3) * Math.PI)), 24) * 0.18;
    const l = 1 + n * 0.05 - vein;
    d[i] = 236 * l; d[i + 1] = 230 * l; d[i + 2] = 216 * l; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  const box = (x, y, w, hh, col, lift = 0.6) => { g.fillStyle = col; g.fillRect(x * S, y * S, w * S, hh * S); hg.fillStyle = `rgb(${lift * 255 | 0},${lift * 255 | 0},${lift * 255 | 0})`; hg.fillRect(x * S, y * S, w * S, hh * S); };
  const frame = (x, y, w, hh, t, col) => { box(x, y, w, t, col); box(x, y + hh - t, w, t, col); box(x, y, t, hh, col); box(x + w - t, y, t, hh, col); };
  const stone = (col, k) => { const cc = new THREE.Color(col).multiplyScalar(k); return `#${cc.getHexString()}`; };
  // plinth and base bands
  box(0, 0.93, 1, 0.07, MG, 0.55); box(0, 0.905, 1, 0.025, MW, 0.7); box(0, 0.885, 1, 0.02, MR, 0.6);
  // lower zone: framed panels with red inlays
  for (const x0 of [0.08, 0.54]) {
    frame(x0, 0.6, 0.38, 0.27, 0.025, MG);
    box(x0 + 0.06, 0.65, 0.26, 0.17, stone(MR, 0.95 + r() * 0.1), 0.62);
    box(x0 + 0.1, 0.69, 0.18, 0.09, MW, 0.6);
    frame(x0 + 0.06, 0.65, 0.26, 0.17, 0.008, MG);
  }
  // chequer frieze with lozenges
  box(0, 0.53, 1, 0.05, MW, 0.6);
  for (let i = 0; i < 24; i++) box(i / 24, 0.53 + (i % 2) * 0.025, 1 / 24, 0.025, MG, 0.62);
  box(0, 0.515, 1, 0.012, MR, 0.65); box(0, 0.582, 1, 0.012, MR, 0.65);
  // upper zone: tall panels with blind round arches and a red roundel
  for (const x0 of [0.08, 0.54]) {
    frame(x0, 0.07, 0.38, 0.42, 0.022, MG);
    g.strokeStyle = MG; g.lineWidth = S * 0.014; hg.strokeStyle = '#a0a0a0'; hg.lineWidth = S * 0.014;
    for (const ctx2 of [g, hg]) { ctx2.beginPath(); ctx2.moveTo((x0 + 0.08) * S, 0.46 * S); ctx2.lineTo((x0 + 0.08) * S, 0.24 * S); ctx2.arc((x0 + 0.19) * S, 0.24 * S, 0.11 * S, Math.PI, 0); ctx2.lineTo((x0 + 0.3) * S, 0.46 * S); ctx2.stroke(); }
    g.fillStyle = MR; g.beginPath(); g.arc((x0 + 0.19) * S, 0.25 * S, 0.035 * S, 0, 7); g.fill();
  }
  // striped corner pilasters (between bays)
  for (const x0 of [0, 0.475, 0.96]) for (let k = 0; k < 20; k++) box(x0, k / 20 * 0.86, 0.04, 1 / 40, k % 2 ? MG : MW, 0.7);
  box(0, 0, 1, 0.025, MG, 0.7); box(0, 0.025, 1, 0.012, MR, 0.65);
  // block joints and a little grime in them
  hg.strokeStyle = 'rgba(40,40,40,0.9)'; g.strokeStyle = 'rgba(90,80,60,0.25)'; hg.lineWidth = g.lineWidth = 1.2;
  for (let y = 0; y < 1; y += 0.0625) for (const ctx2 of [g, hg]) { ctx2.beginPath(); ctx2.moveTo(0, y * S); ctx2.lineTo(S, y * S); ctx2.stroke(); }
  for (let y = 0; y < 1; y += 0.0625) for (let x = (y * 16 % 2) * 0.0625; x < 1; x += 0.125) for (const ctx2 of [g, hg]) { ctx2.beginPath(); ctx2.moveTo(x * S, y * S); ctx2.lineTo(x * S, (y + 0.0625) * S); ctx2.stroke(); }
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(70,60,45,${r() * 0.05})`; g.fillRect(r() * S, r() * S, 1 + r() * 4, 1 + r() * 4); }
  // rain streaks under the ledges
  for (let i = 0; i < 90; i++) { const x = r() * S, y = r() * S * 0.9; const gr = g.createLinearGradient(0, y, 0, y + 80); gr.addColorStop(0, 'rgba(90,75,55,0.12)'); gr.addColorStop(1, 'rgba(90,75,55,0)'); g.fillStyle = gr; g.fillRect(x, y, 3 + r() * 5, 80); }
  return { c, h };
}
let _marble = null;
export function polyMarbleTexture() {
  if (_marble) return _marble;
  const { c, h } = marbleCanvas();
  _marble = toTexture(c, { repeat: true }); _marble.userData.normal = normalFromHeight(h, 2.2);
  return _marble;
}
// Giotto's campanile, one face (1.45 × 8.2 units): hexagonal reliefs, lozenges, then three storeys of
// Gothic windows that grow towards the top (paired, paired and taller, a tall triple light), banded cornices
function campanileCanvas() {
  const W = 256, H = 1024, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(1334);
  g.fillStyle = MW; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(80,70,50,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const Y = (f) => (1 - f) * H;
  const band = (f, hh) => { g.fillStyle = MG; g.fillRect(0, Y(f) - hh * H, W, hh * H * 0.4); g.fillStyle = MR; g.fillRect(0, Y(f) - hh * H * 0.6, W, hh * H * 0.2); g.fillStyle = MG; g.fillRect(0, Y(f) - hh * H * 0.4, W, hh * H * 0.4); };
  // corner pilasters
  for (const x of [0, W - 22]) for (let k = 0; k < 60; k++) { g.fillStyle = k % 2 ? MG : (k % 6 === 0 ? MR : MW); g.fillRect(x, k * H / 60, 22, H / 60); }
  // level 1: hexagonal reliefs
  for (let k = 0; k < 4; k++) { const cx = W * (0.2 + 0.2 * k), cy = Y(0.06); g.strokeStyle = MG; g.lineWidth = 5; g.beginPath(); for (let j = 0; j <= 6; j++) { const a = j / 6 * Math.PI * 2; g.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 24); } g.stroke(); g.fillStyle = '#d6cfc0'; g.beginPath(); g.arc(cx, cy, 10, 0, 7); g.fill(); }
  band(0.115, 0.012);
  // level 2: lozenges
  for (let k = 0; k < 5; k++) { const cx = W * (0.15 + 0.175 * k), cy = Y(0.165); g.fillStyle = MR; g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx + 16, cy); g.lineTo(cx, cy + 26); g.lineTo(cx - 16, cy); g.fill(); g.strokeStyle = MG; g.lineWidth = 3; g.stroke(); }
  band(0.22, 0.012);
  // blind niches
  for (let k = 0; k < 3; k++) { g.strokeStyle = MG; g.lineWidth = 4; g.strokeRect(W * (0.18 + 0.23 * k), Y(0.33), W * 0.16, H * 0.09); }
  band(0.36, 0.012);
  const gothic = (cx, f0, f1, w, lights) => {
    const top = Y(f1), bot = Y(f0), apex = top - w * 0.6;
    g.fillStyle = MG; g.beginPath(); g.moveTo(cx - w / 2 - 8, bot); g.lineTo(cx - w / 2 - 8, top); g.quadraticCurveTo(cx - w / 2 - 8, apex - 10, cx, apex - 14); g.quadraticCurveTo(cx + w / 2 + 8, apex - 10, cx + w / 2 + 8, top); g.lineTo(cx + w / 2 + 8, bot); g.fill();
    g.fillStyle = '#1a140f'; g.beginPath(); g.moveTo(cx - w / 2, bot); g.lineTo(cx - w / 2, top); g.quadraticCurveTo(cx - w / 2, apex, cx, apex - 4); g.quadraticCurveTo(cx + w / 2, apex, cx + w / 2, top); g.lineTo(cx + w / 2, bot); g.fill();
    g.fillStyle = MW; for (let k = 1; k < lights; k++) g.fillRect(cx - w / 2 + w * k / lights - 2.5, top, 5, bot - top);
    g.strokeStyle = MW; g.lineWidth = 3; g.beginPath(); g.arc(cx, top - w * 0.12, w * 0.16, 0, 7); g.stroke();
  };
  gothic(W * 0.33, 0.42, 0.5, 34, 2); gothic(W * 0.67, 0.42, 0.5, 34, 2);
  band(0.55, 0.014);
  gothic(W * 0.33, 0.6, 0.7, 44, 2); gothic(W * 0.67, 0.6, 0.7, 44, 2);
  band(0.76, 0.014);
  gothic(W * 0.5, 0.8, 0.95, 120, 3);
  band(0.985, 0.012);
  return c;
}
function baptisteryCanvas() {
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = MW; g.fillRect(0, 0, S, S);
  g.fillStyle = MG;
  for (const x of [0, S - 30]) g.fillRect(x, 0, 30, S);
  g.fillRect(0, S * 0.95, S, S * 0.05); g.fillRect(0, S * 0.5, S, 14); g.fillRect(0, S * 0.2, S, 12);
  for (let k = 0; k < 3; k++) { g.strokeStyle = MG; g.lineWidth = 8; g.strokeRect(S * (0.12 + k * 0.27), S * 0.58, S * 0.2, S * 0.33); }
  for (let k = 0; k < 3; k++) { const cx = S * (0.22 + k * 0.27); g.lineWidth = 9; g.beginPath(); g.moveTo(cx - S * 0.1, S * 0.48); g.lineTo(cx - S * 0.1, S * 0.33); g.arc(cx, S * 0.33, S * 0.1, Math.PI, 0); g.lineTo(cx + S * 0.1, S * 0.48); g.stroke(); g.fillStyle = '#1d1712'; g.fillRect(cx - S * 0.03, S * 0.34, S * 0.06, S * 0.1); g.fillStyle = MG; }
  for (let k = 0; k < 6; k++) g.fillRect(S * (0.08 + k * 0.15), S * 0.06, S * 0.08, S * 0.1);
  return c;
}

// a Florentine house front: stucco (tinted per instance), stone-framed windows with green shutters, a
// ground floor of arched shop doors, a dark eave line
function facadeCanvas(S = 256) {
  const c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(5);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm2(x / S * 6, y / S * 6, 3) * 0.08 + noise2(x * 0.3, y * 0.3) * 0.02, i = (y * S + x) * 4;
    const v = 238 * (1 + n);
    d[i] = v; d[i + 1] = v * 0.97; d[i + 2] = v * 0.9; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(40,24,14,0.6)'; g.fillRect(0, 0, S, S * 0.05);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    const x = S * (0.12 + col * 0.29), y = S * (0.12 + row * 0.2), w = S * 0.14, h = S * 0.12;
    g.fillStyle = '#bfb39a'; g.fillRect(x - 3, y - 3, w + 6, h + 6);
    g.fillStyle = r() < 0.4 ? '#4b5a3c' : '#1a120c'; g.fillRect(x, y, w, h);
    if (r() < 0.5) { g.fillStyle = '#56653f'; g.fillRect(x - w * 0.35, y, w * 0.32, h); g.fillRect(x + w * 1.03, y, w * 0.32, h); }
  }
  g.fillStyle = 'rgba(150,140,120,0.5)'; g.fillRect(0, S * 0.74, S, S * 0.26);
  for (let col = 0; col < 3; col++) {
    const x = S * (0.08 + col * 0.31), w = S * 0.22;
    g.fillStyle = '#1b130d'; g.beginPath(); g.moveTo(x, S); g.lineTo(x, S * 0.86); g.arc(x + w / 2, S * 0.86, w / 2, Math.PI, 0); g.lineTo(x + w, S); g.fill();
  }
  return c;
}

function groundCanvas(S = 512) {
  const c = mkCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm2(x / S * 8, y / S * 8, 4), i = (y * S + x) * 4;
    const l = 0.8 + n * 0.25 + noise2(x * 0.4, y * 0.4) * 0.05;
    d[i] = 120 * l; d[i + 1] = 98 * l; d[i + 2] = 74 * l; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------- the dome
// One shell (between surfaces A (inner) and B (outer)) over webs [k0, k1): groups 0 = outer face,
// 1 = inner face, 2 = section faces (cut faces + springing rim).
function shellGeometry(A, B, k0, k1, nu, nh, cut) {
  const pos = [], uv = [], idx = [], groups = [[], [], []];
  const P = V();
  const arcLen = [0];
  for (let j = 1; j <= nh; j++) arcLen.push(arcLen[j - 1] + Math.hypot(cornerR(B, j / nh) - cornerR(B, (j - 1) / nh), DOME_H / nh));
  const grid = (S, k, flip, gi) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nh; j++) for (let i = 0; i <= nu; i++) {
      const s = j / nh, u = i / nu;
      octPt(cornerR(S, s), k, u, yAt(s), P);
      pos.push(P.x, P.y, P.z);
      uv.push((k + u) * 3, arcLen[j] * 1.25);
    }
    for (let j = 0; j < nh; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      if (flip) groups[gi].push(a, b, c, b, d, c); else groups[gi].push(a, c, b, b, c, d);
    }
  };
  const strip = (pa, pb, gi, flip) => {   // two polylines of equal length → quad strip
    const base = pos.length / 3;
    for (let i = 0; i < pa.length; i++) {
      pos.push(pa[i].x, pa[i].y, pa[i].z, pb[i].x, pb[i].y, pb[i].z);
      const d = pa[i].distanceTo(pb[i]);
      uv.push(0, pa[i].y * 4, d * 4, pb[i].y * 4);
    }
    for (let i = 0; i < pa.length - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (flip) groups[gi].push(a, c, b, b, c, d); else groups[gi].push(a, b, c, b, d, c);
    }
  };
  for (let k = k0; k < k1; k++) {
    grid(B, k, false, 0);
    grid(A, k, true, 1);
    // springing rim
    const ra = [], rb = [];
    for (let i = 0; i <= nu; i++) { ra.push(octPt(cornerR(A, 0), k, i / nu, DOME_Y0 + 0.001)); rb.push(octPt(cornerR(B, 0), k, i / nu, DOME_Y0 + 0.001)); }
    strip(ra, rb, 2, false);
  }
  if (cut) {
    for (const [k, u, flip] of [[k0, 0, true], [k1 - 1, 1, false]]) {
      const pa = [], pb = [];
      for (let j = 0; j <= nh; j++) { const s = j / nh; pa.push(octPt(cornerR(A, s), k, u, yAt(s))); pb.push(octPt(cornerR(B, s), k, u, yAt(s))); }
      strip(pa, pb, 2, flip);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const all = [];
  groups.forEach((list, gi) => { g.addGroup(all.length, list.length, gi); all.push(...list); });
  g.setIndex(all);
  g.computeVertexNormals();
  return g;
}

// The herringbone bricks of the inner shell in the cut webs, as one InstancedMesh laid in order.
function brickCourses(lite) {
  const A = SHELLS.innerIn, B = SHELLS.innerOut;
  const Hb = lite ? 0.07 : 0.055, Lb = lite ? 0.15 : 0.12, SMAX = 0.82;
  // arc length of the mid surface → course heights
  const mid = (s) => (cornerR(A, s) + cornerR(B, s)) / 2;
  const N = 400, cum = [0];
  for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(mid(i / N) - mid((i - 1) / N), DOME_H / N));
  const sAtLen = (L) => { let i = 1; while (i < N && cum[i] < L) i++; const f = (L - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return (i - 1 + f) / N; };
  const total = cum[Math.round(SMAX * N)];
  const courses = Math.floor(total / Hb);
  const items = [];   // { m: Matrix4, c: course, col }
  const X = V(), Y = V(), Z = V(), P = V(), Q = V(), q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), sc = V();
  const basis = new THREE.Matrix4();
  const r = rng(77);
  for (let c = 0; c < courses; c++) {
    const s = sAtLen((c + 0.5) * Hb), s2 = sAtLen((c + 0.5) * Hb + 0.01);
    const xm = mid(s), thick = (cornerR(B, s) - cornerR(A, s)) * Math.cos(Math.PI / 8);
    for (let k = CUT[0]; k < CUT[1]; k++) {
      const W = 2 * xm * Math.sin(Math.PI / 8);
      octPt(1, k + 1, 0, 0, X).sub(octPt(1, k, 0, 0, P)).normalize();                 // along the web
      // up the surface: between this course's centre line and one a little higher, at the web's middle
      octPt(xm, k, 0.5, yAt(s), P); octPt(mid(s2), k, 0.5, yAt(s2), Q);
      Y.subVectors(Q, P).normalize();
      Z.crossVectors(X, Y).normalize();
      basis.makeBasis(X, Y, Z); q.setFromRotationMatrix(basis);
      // herringbone: bricks on end every other course, in two families climbing from each corner
      const verticals = [];
      // every so often a course of sandstone beams: one of the stone chains that hoop the dome
      const chain = c % 16 === 9;
      if (c % 2 === 0 && !chain) {
        const P0 = W / Math.max(1, Math.round(W / 0.62));
        for (let d = (c / 2 * Lb * 0.55) % P0; d < W; d += P0) { verticals.push(d); if (W - d > 0.02) verticals.push(W - d); }
      }
      const n = Math.max(1, Math.round(W / (chain ? 0.34 : Lb))), L = W / n;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        octPt(xm, k, u, yAt(s), P);
        sc.set(L * 0.94, Hb * 0.86, thick * 0.96);
        m4.compose(P, q, sc);
        const l = 0.78 + r() * 0.32;
        items.push({ m: m4.clone(), c, o: k + u, col: chain ? [0.72 * l, 0.68 * l, 0.58 * l] : [0.8 * l, 0.47 * l, 0.31 * l] });
      }
      for (const d of verticals) {
        const u = d / W;
        octPt(xm, k, u, yAt(s), P).addScaledVector(Y, Hb * 0.5);
        sc.set(Hb * 0.8, Hb * 1.9, thick * 1.0 + 0.012);
        m4.compose(P, q, sc);
        const l = 0.95 + r() * 0.2;
        items.push({ m: m4.clone(), c, o: k + u + 0.001, col: [0.95 * l, 0.68 * l, 0.46 * l] });
      }
    }
  }
  items.sort((a, b) => a.c - b.c || a.o - b.o);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const bft = brickFaceTexture();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0, map: bft, normalMap: bft.userData.normal });
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const col = new THREE.Color();
  items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, col.setRGB(...it.col)); });
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.frustumCulled = false;
  // the corner spur (sperone) inside the cut: a stone rib on the inner shell's corner, rising with the courses
  const ribPts = []; for (let j = 0; j <= 40; j++) { const sj = sAtLen(total * j / 40); ribPts.push(octPt(mid(sj), CUT[0] + 1, 0, yAt(sj))); }
  const ribGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 40, 0.11, 6, false);
  const rib = new THREE.Mesh(ribGeo, new THREE.MeshStandardMaterial({ color: '#b9ad94', roughness: 0.8, metalness: 0 }));
  rib.receiveShadow = true; rib.userData.keep = true;
  const courseStart = [];   // first instance index of each course
  items.forEach((it, i) => { if (courseStart[it.c] === undefined) courseStart[it.c] = i; });
  courseStart.push(items.length);
  // laying: progress p ∈ [0, courses] (fractional = how far along the top course); the newest few bricks
  // drop into place. Pure: every frame restores what the previous frame animated.
  const dirty = new Set(), tmp = new THREE.Matrix4(), off = new THREE.Matrix4(), DROP = 12;
  function lay(p) {
    for (const i of dirty) mesh.setMatrixAt(i, items[i].m);
    dirty.clear();
    const cFull = Math.max(0, Math.min(courses, Math.floor(p)));
    const a = courseStart[cFull], b = courseStart[Math.min(courses, cFull + 1)];
    const n = cFull >= courses ? items.length : Math.round(a + (b - a) * (p - cFull));
    mesh.count = n;
    ribGeo.setDrawRange(0, Math.floor(Math.min(1, p / courses) * 40) * 6 * 6);
    for (let i = Math.max(0, n - DROP); i < n; i++) {
      const age = (n - i) / DROP;                      // 1/DROP … 1
      const e = 1 - age;
      off.makeTranslation(0, e * e * 0.35, 0);
      tmp.multiplyMatrices(off, items[i].m);
      mesh.setMatrixAt(i, tmp); dirty.add(i);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return n > 0 ? items[n - 1] : null;
  }
  return { mesh, rib, courses, lay, Hb, sAtLen, items };
}
function brickFaceTexture() {
  const S = 64, c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(4);
  g.fillStyle = '#c9b49a'; g.fillRect(0, 0, S, S);              // mortar
  g.fillStyle = '#ffffff'; g.fillRect(3, 4, S - 6, S - 8);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,30,20,${r() * 0.12})`; g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2); }
  const t = toTexture(c); t.userData.normal = normalFromHeight(c, 3, { repeat: false });
  return t;
}

// ---------------------------------------------------------------------------- the whole city
export function buildFlorence({ lite = false } = {}) {
  const root = new THREE.Group();
  const r = rng(1436);
  const tileMat = new THREE.MeshStandardMaterial({ map: tileTexture(), normalMap: tileTexture().userData.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, metalness: 0, color: '#f2dccd' });
  const roofTile = tileTexture().clone(); roofTile.repeat.set(2, 2); roofTile.needsUpdate = true;
  const roofN = tileTexture().userData.normal.clone(); roofN.repeat.set(2, 2); roofN.needsUpdate = true;
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTile, normalMap: roofN, roughness: 0.85, metalness: 0, color: '#e8c9b4' });
  const brickT = brickTexture();
  const sectionMat = new THREE.MeshStandardMaterial({ map: brickT, normalMap: brickT.userData.normal, roughness: 0.9, metalness: 0, color: '#f6dcc8', emissive: '#d0662a', emissiveIntensity: 0.35, emissiveMap: brickT });
  const plasterMat = new THREE.MeshStandardMaterial({ color: '#d8c3a2', roughness: 0.92, metalness: 0, side: THREE.FrontSide });
  const gapMat = new THREE.MeshStandardMaterial({ map: brickT, normalMap: brickT.userData.normal, roughness: 0.92, metalness: 0, color: '#b08a78' });
  const pm = polyMarbleTexture();
  const marbleMat = new THREE.MeshStandardMaterial({ map: pm, normalMap: pm.userData.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.42, metalness: 0 });
  marbleMat.userData.noAntiTile = true;
  const whiteMat = new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.45, metalness: 0 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1d1610', roughness: 0.7, metalness: 0 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#e7b85a', roughness: 0.28, metalness: 1 });

  // ----- dome shells: the kept six webs (complete) and the two cut webs (lift away at the cutaway)
  const nu = lite ? 6 : 10, nh = lite ? 18 : 30;
  const keepInner = new THREE.Mesh(shellGeometry(SHELLS.innerIn, SHELLS.innerOut, CUT[1], 8 + CUT[0], nu, nh, true), [gapMat, plasterMat, sectionMat]);
  const keepOuter = new THREE.Mesh(shellGeometry(SHELLS.outerIn, SHELLS.outerOut, CUT[1], 8 + CUT[0], nu, nh, true), [tileMat, gapMat, sectionMat]);
  const tr = (m) => { const c = m.clone(); c.transparent = true; return c; };
  const cutMats = [tr(tileMat), tr(gapMat), tr(sectionMat), tr(plasterMat), tr(whiteMat)];
  const cutOuter = new THREE.Mesh(shellGeometry(SHELLS.outerIn, SHELLS.outerOut, CUT[0], CUT[1], nu, nh, false), [cutMats[0], cutMats[1], cutMats[2]]);
  const cutInner = new THREE.Mesh(shellGeometry(SHELLS.innerIn, SHELLS.innerOut, CUT[0], CUT[1], nu, nh, false), [cutMats[1], cutMats[3], cutMats[2]]);
  for (const m of [keepInner, keepOuter, cutOuter, cutInner]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
  cutInner.castShadow = false;

  // ----- marble ribs on the corners (not the one inside the cut)
  const ribParts = [];
  for (let k = 0; k < 8; k++) {
    if (k > CUT[0] && k < CUT[1]) continue;
    const pts = [];
    for (let j = 0; j <= 24; j++) { const s = j / 24; pts.push(octPt(cornerR(SHELLS.outerOut, s) + 0.03, k, 0, yAt(s))); }
    ribParts.push({ geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.075, 4, false) });
  }
  // oculus ring and springing cornice
  ribParts.push(at(new THREE.CylinderGeometry(0.66, 0.72, 0.14, 8, 1, true), 0, TOP_Y + 0.02, 0, 0, Math.PI / 8));
  ribParts.push(at(new THREE.CylinderGeometry(0.62, 0.62, 0.02, 8), 0, TOP_Y + 0.09, 0, 0, Math.PI / 8));
  const ribs = new THREE.Mesh(mergeParts(ribParts), whiteMat);
  ribs.castShadow = ribs.receiveShadow = true; root.add(ribs);
  // the cut rib (inside the cut webs) travels with them
  const cutRibPts = []; for (let j = 0; j <= 24; j++) { const s = j / 24; cutRibPts.push(octPt(cornerR(SHELLS.outerOut, s) + 0.03, 1, 0, yAt(s))); }
  const cutRib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cutRibPts), 24, 0.075, 4, false), cutMats[4]);
  cutRib.castShadow = true; root.add(cutRib);
  const cutGroup = [cutOuter, cutInner, cutRib];

  // ----- lantern (marble, buttressed, conical roof, gilt ball and cross)
  {
    const L = [], y0 = TOP_Y + 0.1;
    L.push(at(new THREE.CylinderGeometry(0.42, 0.46, 0.85, 8, 1), 0, y0 + 0.43, 0, 0, Math.PI / 8));
    L.push(at(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 8), 0, y0 + 0.88, 0, 0, Math.PI / 8));
    for (let k = 0; k < 8; k++) {
      const a = cornerAng(k);
      L.push(at(new THREE.BoxGeometry(0.1, 0.8, 0.22), Math.cos(a) * 0.52, y0 + 0.4, Math.sin(a) * 0.52, 0, Math.PI / 2 - a, 0));
    }
    L.push(at(new THREE.ConeGeometry(0.36, 0.75, 8, 1), 0, y0 + 1.28, 0, 0, Math.PI / 8));
    const lantern = new THREE.Mesh(mergeParts(L), whiteMat); lantern.castShadow = lantern.receiveShadow = true; root.add(lantern);
    const win = [];
    for (let k = 0; k < 8; k++) { const a = (k + 0.5) * OCT + Math.PI / 8; win.push(at(new THREE.PlaneGeometry(0.16, 0.5), Math.cos(a) * 0.405, y0 + 0.45, Math.sin(a) * 0.405, 0, Math.PI / 2 - a, 0)); }
    const lw = new THREE.Mesh(mergeParts(win), darkMat); root.add(lw);
    const ball = new THREE.Mesh(mergeParts([at(new THREE.SphereGeometry(0.11, 16, 10), 0, y0 + 1.75, 0), at(new THREE.BoxGeometry(0.025, 0.3, 0.025), 0, y0 + 1.98, 0), at(new THREE.BoxGeometry(0.16, 0.025, 0.025), 0, y0 + 2.02, 0)]), goldMat);
    ball.castShadow = true; root.add(ball);
  }

  // ----- drum, crossing octagon, tribunes, nave, facade
  {
    const M = [], W = [], D = [], R = [];
    const drumR = 2.92;
    M.push(at(new THREE.CylinderGeometry(drumR, drumR, DOME_Y0 - DRUM_Y0, 8, 1, true), 0, (DOME_Y0 + DRUM_Y0) / 2, 0, 0, -Math.PI / 8 + Math.PI / 2));
    W.push(at(new THREE.CylinderGeometry(drumR + 0.1, drumR + 0.06, 0.1, 8, 1), 0, DOME_Y0 - 0.02, 0, 0, Math.PI / 2 - Math.PI / 8));
    W.push(at(new THREE.CylinderGeometry(drumR + 0.08, drumR + 0.08, 0.08, 8, 1), 0, DRUM_Y0, 0, 0, Math.PI / 2 - Math.PI / 8));
    for (let k = 0; k < 8; k++) {
      const a = (k + 1) * OCT, ap = drumR * Math.cos(Math.PI / 8);
      const ry = Math.PI / 2 - a;
      W.push(at(new THREE.TorusGeometry(0.27, 0.05, 6, 20), Math.cos(a) * (ap + 0.01), (DOME_Y0 + DRUM_Y0) / 2, Math.sin(a) * (ap + 0.01), 0, ry, 0));
      D.push(at(new THREE.CircleGeometry(0.25, 20), Math.cos(a) * (ap + 0.005), (DOME_Y0 + DRUM_Y0) / 2, Math.sin(a) * (ap + 0.005), 0, ry, 0));
      // corner pilasters of the drum
      const c = cornerAng(k);
      W.push(at(new THREE.BoxGeometry(0.14, DOME_Y0 - DRUM_Y0, 0.14), Math.cos(c) * drumR, (DOME_Y0 + DRUM_Y0) / 2, Math.sin(c) * drumR, 0, -c, 0));
    }
    // crossing octagon below the drum
    M.push(at(new THREE.CylinderGeometry(2.95, 2.95, DRUM_Y0, 8, 1, true), 0, DRUM_Y0 / 2, 0, 0, Math.PI / 2 - Math.PI / 8));
    R.push(at(new THREE.CylinderGeometry(2.0, 3.05, 0.35, 8, 1, true), 0, DRUM_Y0 - 0.12, 0, 0, Math.PI / 2 - Math.PI / 8));
    // tribunes (east, north, south): polygonal apses with half-domes, and a small lantern each
    for (const a of [0, Math.PI / 2, -Math.PI / 2]) {
      const cx = Math.cos(a) * 2.8, cz = Math.sin(a) * 2.8;
      const g = new THREE.CylinderGeometry(1.55, 1.55, 3.1, 10, 1, true, 0, Math.PI);
      M.push(at(g, cx, 1.55, cz, 0, -a, 0));
      const dome = new THREE.SphereGeometry(1.58, 14, 8, 0, Math.PI, 0, Math.PI / 2);
      R.push(at(dome, cx, 3.1, cz, 0, Math.PI / 2 - a, 0));
      W.push(at(new THREE.CylinderGeometry(0.16, 0.18, 0.4, 8), cx + Math.cos(a) * 0.3, 4.5, cz + Math.sin(a) * 0.3));
    }
    // nave (west, along −x) with aisles and clerestory, and the facade
    const x0 = -2.6, x1 = -14.0, L = x0 - x1, cx = (x0 + x1) / 2;
    M.push(at(new THREE.BoxGeometry(L, 4.0, 1.9), cx, 2.0, 0));
    for (const s of [1, -1]) M.push(at(new THREE.BoxGeometry(L, 2.6, 0.95), cx, 1.3, s * 1.42));
    const ridge = (w, h, len) => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(0, h); sh.lineTo(w / 2, 0); sh.lineTo(-w / 2, 0); const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false }); g.translate(0, 0, -len / 2); return g; };
    R.push(at(ridge(2.1, 0.55, L), cx, 4.0, 0, 0, Math.PI / 2));
    for (const s of [1, -1]) R.push(at(new THREE.BoxGeometry(L, 0.06, 1.15), cx, 2.75, s * 1.45, s * 0.38, 0, 0));
    // facade: marble wall with gable and a rose window
    M.push(at(new THREE.BoxGeometry(0.2, 4.4, 3.9), x1 - 0.1, 2.2, 0));
    W.push(at(ridge(4.0, 0.9, 0.2), x1 - 0.1, 4.4, 0, 0, Math.PI / 2));
    W.push(at(new THREE.TorusGeometry(0.42, 0.06, 6, 24), x1 - 0.21, 3.3, 0, 0, Math.PI / 2, 0));
    D.push(at(new THREE.CircleGeometry(0.4, 24), x1 - 0.205, 3.3, 0, 0, -Math.PI / 2, 0));
    for (const z of [-1.2, 0, 1.2]) D.push(at(new THREE.PlaneGeometry(0.5, 0.9), x1 - 0.205, 0.45, z, 0, -Math.PI / 2, 0));
    // Giotto's campanile
    const cpx = -12.4, cpz = 2.75;
    {
      const ct = toTexture(campanileCanvas());
      const cm = new THREE.Mesh(new THREE.BoxGeometry(1.45, 8.2, 1.45), [0, 1, 2, 3, 4, 5].map((k) => (k === 2 || k === 3 ? whiteMat : new THREE.MeshStandardMaterial({ map: ct, roughness: 0.45, metalness: 0 }))));
      cm.position.set(cpx, 4.1, cpz); cm.castShadow = cm.receiveShadow = true; root.add(cm);
      // corner buttresses and the projecting top cornice on its corbels
      const cb = [];
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) cb.push(at(new THREE.BoxGeometry(0.16, 8.2, 0.16), cpx + dx * 0.72, 4.1, cpz + dz * 0.72));
      for (let k = 0; k < 7; k++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const o = (k - 3) * 0.2; cb.push(at(new THREE.BoxGeometry(0.06, 0.12, 0.06), cpx + (dx ? dx * 0.78 : o), 8.12, cpz + (dz ? dz * 0.78 : o))); }
      const cbm = new THREE.Mesh(mergeParts(cb), whiteMat); cbm.castShadow = true; root.add(cbm);
    }
    W.push(at(new THREE.BoxGeometry(1.62, 0.12, 1.62), cpx, 8.25, cpz));
    // the baptistery
    const bx = -18.6;
    {
      const bt = toTexture(baptisteryCanvas(), { repeat: true }); bt.repeat.set(8, 1);
      const bg = new THREE.CylinderGeometry(1.35, 1.35, 2.4, 8, 1, true).toNonIndexed(); bg.computeVertexNormals();
      const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.45, metalness: 0 }));
      bm.material.userData.noAntiTile = true;
      bm.position.set(bx, 1.2, 0); bm.rotation.y = Math.PI / 8; bm.castShadow = bm.receiveShadow = true; root.add(bm);
    }
    W.push(at(new THREE.CylinderGeometry(1.2, 1.3, 0.45, 8, 1), bx, 2.62, 0, 0, Math.PI / 8));
    R.push(at(new THREE.ConeGeometry(1.25, 0.7, 8, 1, true), bx, 3.2, 0, 0, Math.PI / 8));
    W.push(at(new THREE.CylinderGeometry(0.16, 0.18, 0.35, 8), bx, 3.65, 0));
    const mg = mergeParts(M); mg.computeVertexNormals(); boxUV(mg, 0.5);
    const mm = new THREE.Mesh(mg, marbleMat); mm.castShadow = mm.receiveShadow = true; root.add(mm);
    const ww = new THREE.Mesh(mergeParts(W), whiteMat); ww.castShadow = ww.receiveShadow = true; root.add(ww);
    const dd = new THREE.Mesh(mergeParts(D), darkMat); root.add(dd);
    const rr = new THREE.Mesh(mergeParts(R), roofMat); rr.castShadow = rr.receiveShadow = true; root.add(rr);
    // a crenellated civic tower to the south (the Palazzo Vecchio's, as a landmark on the skyline)
    const tw = new THREE.Mesh(mergeParts([at(new THREE.BoxGeometry(2.6, 3.2, 2.2), 3.5, 1.6, 26), at(new THREE.BoxGeometry(0.75, 4.8, 0.75), 3.5, 5.4, 25.6), at(new THREE.BoxGeometry(1.0, 0.5, 1.0), 3.5, 7.9, 25.6), at(new THREE.BoxGeometry(0.5, 0.9, 0.5), 3.5, 8.5, 25.6)]), new THREE.MeshStandardMaterial({ color: '#b39b78', roughness: 0.85 }));
    tw.castShadow = tw.receiveShadow = true; root.add(tw);
  }

  // ----- houses: instanced walls (stucco tints) and hipped tile roofs
  {
    const spots = [];
    const blocked = (x, z, rad) => (x > -15.6 - rad && x < 4.9 + rad && Math.abs(z) < 4.8 + rad) || (x > -20.6 - rad && x < -16.4 + rad && Math.abs(z) < 2.3 + rad) || (Math.hypot(x - 3.5, z - 26) < 2.2 + rad);
    const B = 3.1, RMAX = lite ? 38 : 48;
    for (let bx = -RMAX; bx < RMAX; bx += B) for (let bz = -RMAX; bz < RMAX; bz += B) {
      const cx = bx + B / 2 + (noise2(bx * 0.1, bz * 0.1) * 0.6), cz = bz + B / 2 + noise2(bz * 0.1 + 5, bx * 0.1) * 0.6;
      const dist = Math.hypot(cx + 4, cz);
      if (dist > RMAX) continue;
      const rot = noise2(bx * 0.03 + 9, bz * 0.03) * 0.35;
      const per = dist > 34 ? 1 : dist > 24 ? 2 : 4;
      for (let i = 0; i < per; i++) {
        const w = (B - 0.5) / (per > 2 ? 2 : 1) * (0.75 + r() * 0.25), d = (B - 0.5) / 2 * (0.8 + r() * 0.2);
        const ox = per > 2 ? ((i % 2) - 0.5) * (B - 0.5) / 2 : 0, oz = per > 1 ? ((Math.floor(i / 2) % 2) - 0.5) * (B - 0.5) / 2 : 0;
        const x = cx + ox * Math.cos(rot) - oz * Math.sin(rot), z = cz + ox * Math.sin(rot) + oz * Math.cos(rot);
        if (blocked(x, z, 0.8)) continue;
        const h = 1.0 + r() * 1.1 + (dist < 12 ? 0.3 : 0);
        spots.push({ x, z, w: per > 2 ? w : w * 1.6, d: per > 1 ? d : d * 1.8, h, rot: rot + (r() - 0.5) * 0.06 });
      }
    }
    const fac = toTexture(facadeCanvas());
    const wallMat = new THREE.MeshStandardMaterial({ map: fac, roughness: 0.88, metalness: 0 });
    const wallGeo = new THREE.BoxGeometry(1, 1, 1); wallGeo.translate(0, 0.5, 0);
    // hipped roof: a low pyramid stretched over the footprint
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true); roofGeo.rotateY(Math.PI / 4); roofGeo.translate(0, 0.5, 0);
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, spots.length);
    const roofs = new THREE.InstancedMesh(roofGeo, roofMat, spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    const tints = ['#efe2c4', '#e8cfa0', '#e7c3a0', '#f0dcb8', '#d9b48a', '#eadbc2', '#e3bf96'];
    spots.forEach((s, i) => {
      q.setFromAxisAngle(V(0, 1, 0), s.rot);
      m4.compose(V(s.x, 0, s.z), q, V(s.w, s.h, s.d)); walls.setMatrixAt(i, m4);
      m4.compose(V(s.x, s.h, s.z), q, V(s.w * 1.08, 0.32 + r() * 0.1, s.d * 1.08)); roofs.setMatrixAt(i, m4);
      walls.setColorAt(i, col.set(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.9 + r() * 0.15));
      roofs.setColorAt(i, col.setRGB(1, 0.92 + r() * 0.1, 0.88 + r() * 0.12).multiplyScalar(0.8 + r() * 0.3));
    });
    walls.castShadow = roofs.castShadow = true; walls.receiveShadow = roofs.receiveShadow = true;
    root.add(walls, roofs);
    // chimneys on the roofs, and medieval tower-houses rising over the skyline
    const nCh = Math.min(spots.length, lite ? 300 : 900);
    const chim = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), new THREE.MeshStandardMaterial({ color: '#b48a68', roughness: 0.9 }), nCh);
    for (let i = 0; i < nCh; i++) {
      const sp = spots[(i * 7) % spots.length], ox = (r() - 0.5) * sp.w * 0.5, oz = (r() - 0.5) * sp.d * 0.5;
      m4.compose(V(sp.x + ox * Math.cos(sp.rot) - oz * Math.sin(sp.rot), sp.h + 0.2, sp.z + ox * Math.sin(sp.rot) + oz * Math.cos(sp.rot)), q.setFromAxisAngle(V(0, 1, 0), sp.rot), V(1, 0.8 + r() * 0.6, 1));
      chim.setMatrixAt(i, m4);
    }
    root.add(chim);
    const nT = lite ? 18 : 36, towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), wallMat, nT);
    const tcaps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#9c7a5a', roughness: 0.9 }), nT);
    for (let i = 0; i < nT; i++) {
      const sp = spots[Math.floor(r() * spots.length)], w = 0.55 + r() * 0.3, h = sp.h + 1.2 + r() * 2.2;
      m4.compose(V(sp.x, 0, sp.z), q.setFromAxisAngle(V(0, 1, 0), sp.rot), V(w, h, w)); towers.setMatrixAt(i, m4);
      towers.setColorAt(i, col.set(tints[Math.floor(r() * tints.length)]).multiplyScalar(0.85));
      m4.compose(V(sp.x, h, sp.z), q, V(w * 1.15, 0.12, w * 1.15)); tcaps.setMatrixAt(i, m4);
    }
    towers.castShadow = tcaps.castShadow = true; towers.receiveShadow = true;
    root.add(towers, tcaps);
    // altane: open rooftop loggias (four piers and a little tiled roof) on some of the houses
    const lg = mergeParts([...[[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]].map(([x, z]) => at(new THREE.BoxGeometry(0.09, 0.42, 0.09), x, 0.21, z)), at(new THREE.BoxGeometry(0.98, 0.06, 0.78), 0, 0.45, 0)]);
    const lr = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1, true); lr.rotateY(Math.PI / 4); lr.translate(0, 0.5, 0); lr.scale(1.1, 0.22, 0.9); lr.translate(0, 0.48, 0);
    const nL = lite ? 24 : 60, log = new THREE.InstancedMesh(lg, wallMat, nL), logR = new THREE.InstancedMesh(lr, roofMat, nL);
    for (let i = 0; i < nL; i++) {
      const sp = spots[(i * 37 + 11) % spots.length], sc = Math.min(sp.w, sp.d) * 0.7;
      m4.compose(V(sp.x, sp.h, sp.z), q.setFromAxisAngle(V(0, 1, 0), sp.rot), V(sc, sc, sc)); log.setMatrixAt(i, m4); logR.setMatrixAt(i, m4);
      log.setColorAt(i, col.set('#e9d9b8'));
    }
    log.castShadow = logR.castShadow = true; root.add(log, logR);
    root.userData.houses = spots.length;
  }

  // ----- ground, piazza, hills, cypresses
  {
    const gt = toTexture(groundCanvas(), { repeat: true }); gt.repeat.set(24, 24);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.95, metalness: 0, color: '#c8b7a0' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
    const piazza = new THREE.Mesh(new THREE.PlaneGeometry(26, 11), new THREE.MeshStandardMaterial({ color: '#cbbfa8', roughness: 0.8, metalness: 0 }));
    piazza.rotation.x = -Math.PI / 2; piazza.position.set(-7.5, 0.01, 0); piazza.receiveShadow = true; root.add(piazza);
    // Tuscan hills: a ring of terrain, hazy olive and sage, fading into the fog
    const na = lite ? 64 : 120, nr = 8;
    const pos = [], colA = [], idx = [];
    const cA = new THREE.Color('#7d7a52'), cB = new THREE.Color('#a59a6c'), cC = new THREE.Color('#5d6040'), cc = new THREE.Color();
    for (let j = 0; j <= nr; j++) for (let i = 0; i <= na; i++) {
      const a = (i / na) * Math.PI * 2, rr = 52 + (j / nr) * 95;
      const ridge = Math.sin((j / nr) * Math.PI) ** 0.8;
      const h = Math.max(0, (fbm2(Math.cos(a) * 3 + j * 0.25, Math.sin(a) * 3, 4) * 0.5 + 0.6) * (5 + j * 1.2) * ridge + (j === nr ? -2 : 0));
      pos.push(Math.cos(a) * rr, h, Math.sin(a) * rr);
      cc.copy(cA).lerp(cB, Math.min(1, h / 12)).lerp(cC, Math.max(0, noise2(a * 6, j) * 0.5));
      colA.push(cc.r, cc.g, cc.b);
    }
    for (let j = 0; j < nr; j++) for (let i = 0; i < na; i++) { const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3)); hg.setIndex(idx); hg.computeVertexNormals();
    const hills = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    hills.receiveShadow = false; root.add(hills);
    const nC = lite ? 70 : 160;
    const cyp = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 2.0, 6, 1), new THREE.MeshStandardMaterial({ color: '#2f3a22', roughness: 0.95 }), nC);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < nC; i++) {
      const a = r() * Math.PI * 2, rr = 42 + r() * 30;
      const s = 0.7 + r() * 0.8;
      m4.compose(V(Math.cos(a) * rr, 1.0 * s + Math.max(0, (rr - 52) * 0.08), Math.sin(a) * rr), new THREE.Quaternion(), V(s, s * (1 + r() * 0.5), s));
      cyp.setMatrixAt(i, m4);
    }
    root.add(cyp);
  }

  // ----- the bricks
  const bricks = brickCourses(lite);
  root.add(bricks.mesh, bricks.rib);

  // ----- ink linework of the dome (world space): what the drawing becomes
  const ink = [];
  {
    const keep = (k) => !(k > CUT[0] && k < CUT[1]);
    // corner ribs (outer surface)
    for (let k = 0; k < 8; k++) {
      if (!keep(k)) continue;
      const pts = []; for (let j = 0; j <= 20; j++) { const s = j / 20; pts.push(octPt(cornerR(SHELLS.outerOut, s) + 0.06, k, 0, yAt(s))); }
      ink.push({ pts, w: 1, kind: 'rib' });
    }
    // horizontal courses of the outer shell (kept webs)
    for (const s of [0, 0.22, 0.45, 0.66, 0.84]) {
      const pts = []; for (let k = CUT[1]; k <= 8 + CUT[0]; k++) for (let i = 0; i <= 4; i++) { if (k === 8 + CUT[0] && i > 0) break; pts.push(octPt(cornerR(SHELLS.outerOut, s), k, i / 4, yAt(s))); }
      ink.push({ pts, w: s === 0 ? 1 : 0.6, kind: 'ring' });
    }
    // the section: both shells' profiles on the two cut faces
    for (const [k, u] of [[CUT[0], 0], [CUT[1] - 1, 1]]) for (const S of Object.values(SHELLS)) {
      const pts = []; for (let j = 0; j <= 24; j++) { const s = j / 24; pts.push(octPt(cornerR(S, s), k, u, yAt(s))); }
      ink.push({ pts, w: 1, kind: 'section' });
    }
    // the inner shell under construction: its springing and a mid course across the cut
    for (const s of [0, 0.5]) {
      const pts = []; for (let k = CUT[0]; k < CUT[1]; k++) for (let i = 0; i <= 4; i++) pts.push(octPt(cornerR(SHELLS.innerOut, s), k, i / 4, yAt(s)));
      ink.push({ pts, w: 0.6, kind: 'ring' });
    }
    // drum: top and bottom octagons, corner verticals, oculi
    for (const y of [DOME_Y0, DRUM_Y0]) { const pts = []; for (let k = 0; k <= 8; k++) pts.push(octPt(2.95, k, 0, y)); ink.push({ pts, w: 0.8, kind: 'drum' }); }
    for (let k = 0; k < 8; k++) ink.push({ pts: [octPt(2.95, k, 0, DRUM_Y0), octPt(2.95, k, 0, DOME_Y0)], w: 0.6, kind: 'drum' });
    // lantern
    for (const y of [TOP_Y + 0.1, TOP_Y + 0.95]) { const pts = []; for (let k = 0; k <= 8; k++) pts.push(octPt(0.48, k, 0, y)); ink.push({ pts, w: 0.8, kind: 'lantern' }); }
    for (let k = 0; k < 8; k += 2) ink.push({ pts: [octPt(0.48, k, 0, TOP_Y + 0.1), octPt(0.48, k, 0, TOP_Y + 0.95), V(0, TOP_Y + 1.7, 0)], w: 0.8, kind: 'lantern' });
    // construction: the axis, the springing diameter and the quinto acuto arcs (centres at 4/5 of the span)
    const d = V(Math.cos(CUT_DIR), 0, Math.sin(CUT_DIR)), side = V(-d.z, 0, d.x);
    ink.push({ pts: [V(0, DRUM_Y0 - 0.3, 0), V(0, TOP_Y + 2.1, 0)], w: 0.45, kind: 'construct' });
    const Rb = 2.72;
    ink.push({ pts: [side.clone().multiplyScalar(-Rb * 1.25).setY(DOME_Y0), side.clone().multiplyScalar(Rb * 1.25).setY(DOME_Y0)], w: 0.45, kind: 'construct' });
    for (const sg of [1, -1]) {
      const rho = 1.6 * Rb, xc = Rb - rho, pts = [];
      for (let j = 0; j <= 30; j++) { const h = (j / 30) * Math.sqrt(rho * rho - xc * xc) * 1.02; const x = xc + Math.sqrt(Math.max(0, rho * rho - h * h)); pts.push(side.clone().multiplyScalar(sg * x).setY(DOME_Y0 + h)); }
      ink.push({ pts, w: 0.45, kind: 'construct' });
    }
  }

  // callout anchors (world)
  const anchors = {
    outer: octPt((cornerR(SHELLS.outerIn, 0.35) + cornerR(SHELLS.outerOut, 0.35)) / 2, CUT[1] - 1, 1, yAt(0.35)),
    inner: octPt((cornerR(SHELLS.innerIn, 0.25) + cornerR(SHELLS.innerOut, 0.25)) / 2, CUT[1] - 1, 1, yAt(0.25)),
  };
  return { root, bricks, cutGroup, cutMats, ink, anchors, domeCentre: V(0, 7.2, 0) };
}
