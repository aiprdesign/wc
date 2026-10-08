// THE ITALIAN RENAISSANCE — shared drawing kit: the sepia ink palette of 'Art & the Renaissance'
// (renaissance.js), marching-squares contours, light-driven hatching, Leonardo-style mirror script
// (illegible decorative strokes, no real text), stroke drawings of 3D models (creases, boundaries and the
// silhouette for one fixed view), parchment, wood and linen. Build-time only: nothing here runs per frame.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../lib/math.js';
import { noise2, fbm2 } from '../lib/noise.js';
import { canvas as mkCanvas, toTexture, parchmentTexture } from '../lib/textures.js';
import { segmentsLine } from '../lib/lines.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// renaissance.js's ink and gold
export const SEPIA = '#5a2e16', CHALK = '#8a3f1f', EMBER = '#ff8a3a', GOLD = '#f2c46e', HUD = '#f3d08a', INK = '#4a2812';

// ink strokes (normal blending, an ember at the drawing front, as renaissance.js's inkOpts)
export const inkOpts = (color, opacity, extra = {}) => ({ color, headColor: EMBER, intensity: 1, opacity, head: 0.012, additive: false, ...extra });

// Strokes revealed in a given order: ord[i] ∈ [0,1] is when segment i starts; `len` its share of the run.
export function orderedStrokes(segs, ord, opts, len = 0.04) {
  const k = 1 - len;
  return segmentsLine(segs, { ...opts, orderFn: (a, b, i) => Math.min(k, Math.max(0, ord[i] * k)), stagger: k });
}

// ---------------------------------------------------------------------------
// Marching squares over f on a grid → [[Vector3, Vector3]] segments in the xy plane.
export function contour(f, x0, x1, y0, y1, cell, keep = null) {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const vals = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f(x0 + i * cell, y0 + j * cell);
  const segs = [];
  const lp = (xa, ya, va, xb, yb, vb) => { const t = va / (va - vb); return [xa + (xb - xa) * t, ya + (yb - ya) * t]; };
  const T = {
    1: [['L', 'B']], 2: [['B', 'R']], 3: [['L', 'R']], 4: [['R', 'T']], 5: [['L', 'T'], ['B', 'R']], 6: [['B', 'T']], 7: [['L', 'T']],
    8: [['T', 'L']], 9: [['T', 'B']], 10: [['B', 'L'], ['R', 'T']], 11: [['T', 'R']], 12: [['R', 'L']], 13: [['R', 'B']], 14: [['B', 'L']],
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = x0 + i * cell, Y = y0 + j * cell;
    const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1], c = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
    let idx = 0;
    if (a < 0) idx |= 1; if (b < 0) idx |= 2; if (c < 0) idx |= 4; if (d < 0) idx |= 8;
    if (idx === 0 || idx === 15) continue;
    const E = {
      B: () => lp(X, Y, a, X + cell, Y, b), R: () => lp(X + cell, Y, b, X + cell, Y + cell, c),
      T: () => lp(X + cell, Y + cell, c, X, Y + cell, d), L: () => lp(X, Y + cell, d, X, Y, a),
    };
    for (const [p, q] of T[idx]) {
      const A = E[p](), B = E[q]();
      if (keep && !keep((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) continue;
      segs.push([V(A[0], A[1]), V(B[0], B[1])]);
    }
  }
  return segs;
}

// Hatching driven by a shade function s(x, y) ∈ [0,1] (or < 0 outside the form): lines at `ang` spaced
// `spacing`, broken into dashes of ~len where the form is darker than `thr` (as renaissance.js).
export function hatchField(shade, { x0, x1, y0, y1 }, ang, spacing, thr, len, seed, step = 0.006) {
  const out = [], r = rng(seed);
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = Math.hypot(x1 - x0, y1 - y0) / 2 + spacing;
  for (let o = -ext; o <= ext; o += spacing) {
    let run = null;
    for (let s = -ext; s <= ext; s += step) {
      const x = cx + px * o + dx * s, y = cy + py * o + dy * s;
      if (x < x0 || x > x1 || y < y0 || y > y1) { run = null; continue; }
      const sh = shade(x, y);
      const dark = sh >= 0 && (1 - sh) > thr + 0.08 * noise2(x * 9 / step * 0.006 + seed, y * 9 / step * 0.006);
      if (dark) {
        if (!run) run = { x, y, n: 0, target: len * (0.6 + r() * 0.8) };
        run.n += step;
        if (run.n >= run.target) { const j = (r() - 0.5) * step * 0.7; out.push([V(run.x + j, run.y + j), V(x + j, y - j)]); run = null; s += step * (1 + Math.floor(r() * 3)); }
      } else if (run) {
        if (run.n > len * 0.3) out.push([V(run.x, run.y), V(x - dx * step, y - dy * step)]);
        run = null;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Leonardo's mirror writing, as decoration only: cursive garlands, loops and ascenders running RIGHT TO
// LEFT, broken into words; illegible by construction (no letters, no text). In a 2D plane (x right, y up).
// Returns { segs, ord } with ord in writing order (line by line, each line right → left).
export function mirrorScript({ x0, x1, yTop, lines, lineH, h = lineH * 0.32, seed = 1, ragged = 0.25 }) {
  const r = rng(seed);
  const segs = [], ord = [];
  const W = x1 - x0;
  for (let li = 0; li < lines; li++) {
    const base = yTop - li * lineH;
    const xStart = x1 - r() * W * 0.04, xEnd = x0 + r() * W * ragged * (li === lines - 1 ? 2.2 : 1);
    let x = xStart;
    const slant = -0.35;                                   // leans left (a left hand writing right to left)
    while (x > xEnd) {
      const letters = 2 + Math.floor(r() * 6);
      let prev = null;
      for (let k = 0; k < letters && x > xEnd; k++) {
        const adv = h * (0.62 + r() * 0.5);
        const asc = r() < 0.16 ? (r() < 0.5 ? 2.3 : -1.6) : 1;   // ascender / descender loop
        const loop = r() < 0.55;
        const n = 7;
        for (let i = 0; i <= n; i++) {
          if (i === 0 && prev) continue;
          const u = i / n;
          const yy = asc === 1 ? h * Math.sin(Math.PI * u) * (0.75 + 0.25 * Math.sin(u * 6 + k)) : h * asc * Math.sin(Math.PI * u);
          const xx = x - u * adv + (loop ? Math.sin(u * Math.PI * 2) * adv * 0.28 : 0) + yy * slant * 0.3;
          const p = V(xx, base + yy + (r() - 0.5) * h * 0.04);
          if (prev) { segs.push([prev, p]); ord.push((li + (xStart - xx) / W) / lines); }
          prev = p;
        }
        x -= adv;
      }
      x -= h * (0.9 + r() * 0.9);                          // word gap: the pen lifts
    }
  }
  return { segs, ord };
}

// ---------------------------------------------------------------------------
// Stroke drawing of a model for one view: creases (> creaseDeg), open boundaries, and the silhouette as
// seen along `view` (unit vector from the model towards the viewer, model space). Also hatch segments in
// the drawing plane over faces turned from the light. Meshes: [{ geometry, matrix }] in model space.
// Returns { edges: [[V,V]] (model space), tris2: [[x,y]×3] with shade } for hatching.
export function drawingOf(meshes, view, { creaseDeg = 32, light = V(-0.5, 0.75, 0.45).normalize(), silhouette = true } = {}) {
  const edges = [], tris = [];
  const cosC = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
  const a = V(), b = V(), c = V(), n = V(), e1 = V(), e2 = V();
  for (const { geometry, matrix } of meshes) {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.applyMatrix4(matrix);
    g = mergeVertices(g, 1e-5);
    const pos = g.attributes.position, idx = g.index.array;
    const faceN = [], map = new Map();
    for (let f = 0; f < idx.length / 3; f++) {
      const i0 = idx[f * 3], i1 = idx[f * 3 + 1], i2 = idx[f * 3 + 2];
      a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const area = n.length();
      if (area < 1e-12) { faceN.push(null); continue; }
      n.divideScalar(area);
      faceN.push(n.clone());
      tris.push({ p: [a.clone(), b.clone(), c.clone()], n: n.clone() });
      for (const [p, q] of [[i0, i1], [i1, i2], [i2, i0]]) {
        const key = p < q ? `${p}_${q}` : `${q}_${p}`;
        const l = map.get(key);
        if (l) l.push(f); else map.set(key, [f]);
      }
    }
    for (const [key, fs] of map) {
      const [p, q] = key.split('_').map(Number);
      let use = false;
      const n0 = faceN[fs[0]];
      if (!n0) continue;
      if (fs.length === 1) use = true;
      else {
        const n1 = faceN[fs[1]];
        if (!n1) continue;
        if (n0.dot(n1) < cosC) use = true;
        else if (silhouette && Math.sign(n0.dot(view)) !== Math.sign(n1.dot(view))) use = true;
      }
      if (use) edges.push([V().fromBufferAttribute(pos, p), V().fromBufferAttribute(pos, q)]);
    }
  }
  // shade per triangle for hatching (only faces turned to the viewer)
  const shaded = [];
  for (const t of tris) {
    const nv = t.n.dot(view);
    if (Math.abs(nv) < 0.05) continue;
    const nn = nv < 0 ? t.n.clone().negate() : t.n;          // (double-sided cloth: the side we see)
    shaded.push({ p: t.p, s: Math.max(0, nn.dot(light)) });
  }
  return { edges, shaded };
}

// Hatch a set of projected triangles (2D points [x,y], shade s): every triangle darker than thr is filled
// with lines of one global family (angle ang, spacing sp), so the pieces line up across triangles.
export function hatchTriangles(tris2, ang, sp, thr) {
  const out = [];
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  for (const { p, s } of tris2) {
    if (s > thr) continue;
    // coordinates along (d) and across (perp)
    const q = p.map(([x, y]) => [x * dx + y * dy, x * px + y * py]);
    const lo = Math.min(q[0][1], q[1][1], q[2][1]), hi = Math.max(q[0][1], q[1][1], q[2][1]);
    for (let o = Math.ceil(lo / sp) * sp; o <= hi; o += sp) {
      const xs = [];
      for (let i = 0; i < 3; i++) {
        const A = q[i], B = q[(i + 1) % 3];
        if ((A[1] - o) * (B[1] - o) > 0 || A[1] === B[1]) continue;
        const u = (o - A[1]) / (B[1] - A[1]);
        xs.push(A[0] + (B[0] - A[0]) * u);
      }
      if (xs.length < 2) continue;
      const s0 = Math.min(...xs), s1 = Math.max(...xs);
      if (s1 - s0 < sp * 0.3) continue;
      out.push([V(s0 * dx + o * px, s0 * dy + o * py), V(s1 * dx + o * px, s1 * dy + o * py)]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Textures
let _page = null;
export function pageCanvas() {
  if (_page) return _page;
  const S = 1024, c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(31);
  g.drawImage(parchmentTexture({ size: 512, seed: 2 }).image, 0, 0, S, S);
  // lift it a little (a fresh sheet, not a burnt one) and add foxing, fibres and a faint chain-line laid pattern
  g.fillStyle = 'rgba(246,232,200,0.35)'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) { const x = r() * S, y = r() * S, rad = 2 + r() * 10; g.fillStyle = `rgba(150,95,45,${0.04 + r() * 0.08})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(120,85,45,0.05)'; g.lineWidth = 1;
  for (let x = 0; x < S; x += 36) { g.beginPath(); g.moveTo(x + r() * 2, 0); g.lineTo(x + r() * 2, S); g.stroke(); }
  for (let y = 0; y < S; y += 3) { if (r() < 0.5) continue; g.strokeStyle = `rgba(120,85,45,${0.012 + r() * 0.015})`; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  // ink blots, a thumb smudge and a faint ring left by the inkwell
  for (let i = 0; i < 5; i++) {
    const x = r() * S, y = r() * S, rad = 2 + r() * 5;
    g.fillStyle = `rgba(45,25,12,${0.35 + r() * 0.3})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * rad * 4, y + (r() - 0.5) * rad * 4, rad * r() * 0.4, 0, 7); g.fill(); }
  }
  g.fillStyle = 'rgba(80,50,25,0.07)'; g.beginPath(); g.ellipse(S * 0.86, S * 0.9, 26, 34, 0.4, 0, 7); g.fill();
  g.strokeStyle = 'rgba(90,55,25,0.08)'; g.lineWidth = 4; g.beginPath(); g.arc(S * 0.12, S * 0.1, 38, 0.3, 5.6); g.stroke();
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(90,50,20,0.28)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  _page = c;
  return c;
}
let _pageTex = null;
export const pageTexture = () => (_pageTex ??= toTexture(pageCanvas()));

// Wood: fine long grain with growth rings, medullary flecks and darker pores (map), its relief (normal) and
// a satin/worn roughness; shared by every model part (UVs run along each beam's length).
let _wood = null;
function woodCanvases() {
  if (_wood) return _wood;
  const W = 512, H = 512, c = mkCanvas(W, H), g = c.getContext('2d'), hc = mkCanvas(W, H), hg = hc.getContext('2d');
  const img = g.createImageData(W, H), d = img.data, him = hg.createImageData(W, H), hd = him.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const warp = fbm2(u * 3, v * 0.5, 4) * 0.7 + noise2(u * 9, v * 1.2) * 0.1;
    const ring = 0.5 + 0.5 * Math.sin((u * 30 + warp * 7) * Math.PI);
    const late = Math.pow(ring, 6);                                    // dark latewood lines
    const pore = noise2(u * 420, v * 14) > 0.55 ? 1 : 0;
    const fleck = Math.max(0, noise2(u * 60, v * 3) - 0.6) * 1.5;
    const l = 0.8 + fbm2(u * 6 + 3, v * 1.5, 3) * 0.14 - late * 0.22 - pore * 0.08 + fleck * 0.1;
    const i = (y * W + x) * 4;
    d[i] = 150 * l; d[i + 1] = 100 * l; d[i + 2] = 58 * l; d[i + 3] = 255;
    const hh = 0.6 - late * 0.25 - pore * 0.2 + noise2(u * 200, v * 8) * 0.05;
    hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, hh * 255)); hd[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); hg.putImageData(him, 0, 0);
  _wood = { map: toTexture(c, { repeat: true }), normal: normalFromHeight(hc, 3.5) };
  return _wood;
}
export const woodTexture = () => woodCanvases().map;
export const woodNormal = () => woodCanvases().normal;

// Linen: plain weave with slubs (map + normal), stitched seams every so often, a starched sheen
let _linen = null;
function linenCanvases() {
  if (_linen) return _linen;
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d'), hc = mkCanvas(S, S), hg = hc.getContext('2d');
  const img = g.createImageData(S, S), d = img.data, him = hg.createImageData(S, S), hd = him.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const over = ((x >> 2) + (y >> 2)) % 2;                            // which thread is on top
    const wx = Math.sin((x % 4) / 4 * Math.PI), wy = Math.sin((y % 4) / 4 * Math.PI);
    const hgt = over ? wx * 0.8 + 0.2 * wy : wy * 0.8 + 0.2 * wx;
    const slub = noise2(x * 0.05, y * 0.7) * 0.06 + noise2(x * 0.7, y * 0.04) * 0.06;
    const seam = (x % 128 < 3) ? 1 : 0;
    const stitch = seam && (y % 8 < 5) ? 1 : 0;
    const l = 0.84 + hgt * 0.1 + slub + fbm2(x / S * 3, y / S * 3, 3) * 0.06 - seam * 0.08 - stitch * 0.12;
    const i = (y * S + x) * 4;
    d[i] = 236 * l; d[i + 1] = 222 * l; d[i + 2] = 188 * l; d[i + 3] = 255;
    hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, (0.4 + hgt * 0.4 + slub + seam * 0.25 + stitch * 0.1) * 255)); hd[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); hg.putImageData(him, 0, 0);
  const map = toTexture(c, { repeat: true }), normal = normalFromHeight(hc, 2.5);
  map.repeat.set(4, 4); normal.repeat.set(4, 4);
  _linen = { map, normal };
  return _linen;
}
export const linenTexture = () => linenCanvases().map;
export const linenNormal = () => linenCanvases().normal;

// Rope: three twisted strands (map + normal), for lashings and cords
let _rope = null;
export function ropeMaps() {
  if (_rope) return _rope;
  const hc = stripeHeight(64, 64, 3, 1.2), c = mkCanvas(64, 64), g = c.getContext('2d');
  g.drawImage(hc, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#b89a6a'; g.fillRect(0, 0, 64, 64);
  const map = toTexture(c, { repeat: true }), normal = normalFromHeight(hc, 4);
  _rope = { map, normal };
  return _rope;
}

// merge a list of { geometry, matrix } into one geometry (position, normal, uv)
export function mergeParts(parts) {
  const list = parts.map(({ geometry, matrix }) => {
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(list, false);
}

// a beam (box) between two points
const _Y = V(0, 1, 0);
export function beam(a, b, w, d = w) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, d);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(_Y, b.clone().sub(a).normalize()), V(1, 1, 1));
  return { geometry: g, matrix: m };
}
export function rod(a, b, r, seg = 6) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(_Y, b.clone().sub(a).normalize()), V(1, 1, 1));
  return { geometry: g, matrix: m };
}
export const at = (geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => ({ geometry, matrix: new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? V(s, s, s) : s) });

// ---------------------------------------------------------------------------
// Detail through maps: a tangent-space normal map from a height canvas (grey = height), and box-projected
// world-scale UVs for merged architecture (so a texture keeps its real size on every face, whatever the
// primitive's own UVs were).
export function normalFromHeight(src, strength = 2, { repeat = true } = {}) {
  const W = src.width, H = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data;
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const h = (x, y) => sd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * W + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c, { srgb: false, repeat });
  return t;
}
export function boxUV(geometry, scale = 1, offset = [0, 0, 0]) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset[0], y = p.getY(i) + offset[1], z = p.getZ(i) + offset[2];
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay > ax && ay > az) { u = x; v = z; } else if (ax > az) { u = z * Math.sign(n.getX(i) || 1); v = y; } else { u = -x * Math.sign(n.getZ(i) || 1); v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}
// a height canvas of rope twist / lashing bands (for normal maps)
export function stripeHeight(W, H, n, slant = 0.6) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = 0.5 + 0.5 * Math.sin(((x / W) * n + (y / H) * n * slant) * Math.PI * 2); const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v * 255; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}
