// SURGERY — the instrument set of the Sushruta Samhita, modelled to hold up in Explore close-ups:
// hand-forged steel (hammer facets, draw-filed shafts, twisted square grips, polished ground edges),
// turned rosewood handles with brass ferrules and end caps, forged finger rings and riveted pivots,
// and the cast animal heads of the svastika forceps (lion, heron, crow) sculpted as signed-distance
// solids. Also the materials' procedural maps (forged-steel normal / roughness, rosewood grain) and the
// manuscript props (palm leaves with rounded ends and cord holes, a painted wooden cover).
// Every instrument is built along +x (handle end at x = 0, tip at x = L), resting on the cloth (y up);
// each returns { steel, polish, wood, brass, L, head? } (BufferGeometry or null; head: label anchor).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU } from '../../lib/math.js';
import { fbm2, noise2, noise3 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { meshBody } from '../../lib/sdfmesh.js';

// ------------------------------------------------------------------ geometry helpers
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  n.clearGroups();
  return n;
}
const merge = (list) => (list.length ? mergeGeometries(list.filter(Boolean).map(clean), false) : null);

// Planar UVs per triangle along its dominant axis, `s` UV units per metre: tileable detail maps
// (hammer facets, grain) land at a constant physical size on any part, with the streak direction (u)
// running along the instrument (+x) on its top, bottom and sides.
export function boxUV(g, s = 1) {
  if (!g) return g;
  const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2);
    const ax = Math.abs(e1.x), ay = Math.abs(e1.y), az = Math.abs(e1.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      let u, v;
      if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
      uv[(i + k) * 2] = u * s; uv[(i + k) * 2 + 1] = v * s;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// A lathe about the +x axis from (x, r) pairs; uv: u around, v along (0 → 1).
function latheX(pts, seg) {
  const g = new THREE.LatheGeometry(pts.map(([x, r]) => new THREE.Vector2(Math.max(1e-4, r), x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
const rodX = (x0, x1, r, y, seg = 8, z = 0) => { const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const coneX = (x0, x1, r0, r1, y, seg = 10, z = 0) => { const g = new THREE.CylinderGeometry(r1, r0, x1 - x0, seg); g.rotateZ(-Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; };
const ball = (x, y, z, r, s = [1, 1, 1], ws = 14, hs = 10) => { const g = new THREE.SphereGeometry(r, ws, hs); g.scale(...s); g.translate(x, y, z); return g; };
const dome = (x, y, z, r, h, seg = 16) => { const g = new THREE.SphereGeometry(r, seg, 6, 0, TAU, 0, Math.PI / 2); g.scale(1, h / r, 1); g.translate(x, y, z); return g; };

// cross-sections, as [n, b] pairs (n: up, b: sideways), counter-clockwise
function roundedRect(w, h, r = Math.min(w, h) * 0.3, nc = 2) {
  const out = [], hw = w / 2 - r, hh = h / 2 - r;
  for (const [cx, cy, a0] of [[hw, hh, 0], [-hw, hh, Math.PI / 2], [-hw, -hh, Math.PI], [hw, -hh, Math.PI * 1.5]]) {
    for (let k = 0; k <= nc; k++) { const a = a0 + (k / nc) * Math.PI / 2; out.push([cy + Math.sin(a) * r, cx + Math.cos(a) * r]); }
  }
  return out;
}
const circleSec = (r, n) => Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU; return [Math.sin(a) * r, Math.cos(a) * r]; });

// Sweep a closed cross-section along a curve lying (mostly) flat: the section's n axis stays vertical
// (world up), b points sideways. sec(u) → [[n, b]…] (same count for every u); twist(u) turns it.
function sweep(curve, n, sec, { twist = null, closed = false, caps = true } = {}) {
  const pos = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let m = 0;
  const rows = closed ? n : n + 1;
  for (let i = 0; i < rows; i++) {
    const u = i / n;
    curve.getPointAt(Math.min(1, u), P); curve.getTangentAt(Math.min(1, u), T);
    B.crossVectors(T, UP); if (B.lengthSq() < 1e-8) B.set(0, 0, 1); B.normalize();
    N.crossVectors(B, T).normalize();
    const s = sec(u), tw = twist ? twist(u) : 0, c = Math.cos(tw), sn = Math.sin(tw);
    m = s.length;
    for (const [a0, b0] of s) {
      const a = a0 * c - b0 * sn, b = a0 * sn + b0 * c;
      pos.push(P.x + N.x * a + B.x * b, P.y + N.y * a + B.y * b, P.z + N.z * a + B.z * b);
    }
  }
  for (let i = 0; i < (closed ? rows : rows - 1); i++) {
    const i1 = (i + 1) % rows;
    for (let j = 0; j < m; j++) {
      const j1 = (j + 1) % m, a = i * m + j, b = i1 * m + j, c2 = i1 * m + j1, d = i * m + j1;
      idx.push(a, b, d, b, c2, d);
    }
  }
  if (!closed && caps) {
    for (const [row, flip] of [[0, true], [rows - 1, false]]) {
      const base = row * m, cx = [0, 0, 0];
      for (let j = 0; j < m; j++) for (let k = 0; k < 3; k++) cx[k] += pos[(base + j) * 3 + k] / m;
      const ci = pos.length / 3; pos.push(...cx);
      for (let j = 0; j < m; j++) { const a = base + j, b = base + (j + 1) % m; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const lineX = (x0, x1, y, z = 0) => new THREE.LineCurve3(new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z));
const flatCurve = (pts, y) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
class CircleCurve extends THREE.Curve {
  constructor(cx, cy, cz, r) { super(); Object.assign(this, { cx, cy, cz, r }); }
  getPoint(u, out = new THREE.Vector3()) { const a = u * TAU; return out.set(this.cx + Math.cos(a) * this.r, this.cy, this.cz - Math.sin(a) * this.r); }
}
// a forged ring lying flat (finger ring / eye)
const flatRing = (cx, cy, cz, R, w, h, seg) => sweep(new CircleCurve(cx, cy, cz, R), seg, () => roundedRect(w, h, Math.min(w, h) * 0.38, 2), { closed: true });

// A tube whose radius varies along its length: rFn(u) → radius.
function varTube(curve, n, radial, rFn) {
  return sweep(curve, n, (u) => circleSec(Math.max(1e-4, rFn(u)), radial));
}

// rotate parts about the z axis through (x0, y0): a blade or shaft dipping so its tip rests on the cloth
function tilt(list, x0, y0, ang) {
  for (const g of list) { if (!g) continue; g.translate(-x0, -y0, 0); g.rotateZ(ang); g.translate(x0, y0, 0); }
  return list;
}

// a flat blade from a 2D outline in (x, z): the flats (forged, group 0) and the ground bevel all round
// (polished, group 1), centred on height y
function bladeParts(draw, th, y, bevel = 0.0022) {
  const s = new THREE.Shape(); draw(s);
  const bt = th * 0.55;
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: bt, bevelSize: bevel, bevelSegments: 1, curveSegments: 18 });
  g.rotateX(Math.PI / 2);
  g.translate(0, y + th / 2, 0);
  const parts = [];
  for (const gr of g.groups) {
    const q = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) {
      const a = g.attributes[k];
      q.setAttribute(k, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize));
    }
    parts[gr.materialIndex] = q;
  }
  return { flat: parts[0], edge: parts[1] };
}

// ------------------------------------------------------------------ maps
// Forged steel: overlapping hammer facets (shallow spherical dents), draw-file streaks along u and a
// faint pitting; the raised, handled areas are burnished (lower roughness). Tileable.
let forgedCache = null;
export function forgedMaps(size = 512) {
  if (forgedCache) return forgedCache;
  const S = size, H = new Float32Array(S * S), R = rng(4471);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) H[j * S + i] = 0.25 * fbm2(i / 70, j / 70, 3);
  for (let k = 0; k < S * S / 220; k++) {                 // hammer strikes
    const cx = R() * S, cy = R() * S, r = 5 + R() * R() * 20, d = r * (0.025 + R() * 0.02);
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const q = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
      if (q >= 1) continue;
      const o = (((y % S) + S) % S) * S + (((x % S) + S) % S);
      H[o] -= d * (1 - q) * (1 - q);
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {   // draw-file streaks (along u), pits
    const o = j * S + i;
    H[o] += 0.18 * noise2(i / 160, j / 1.3) + 0.08 * noise2(i / 40, j / 0.7) - 0.25 * Math.max(0, noise2(i / 2.5, j / 2.5) - 0.82);
  }
  let lo = 1e9, hi = -1e9; for (const v of H) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const nc = mkCanvas(S, S), rc = mkCanvas(S, S);
  const ni = nc.getContext('2d').createImageData(S, S), ri = rc.getContext('2d').createImageData(S, S);
  const at = (x, y) => H[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
  const k = 2.2 / (hi - lo);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * k, dy = (at(i, j + 1) - at(i, j - 1)) * k;
    const l = Math.hypot(dx, dy, 1), o = (j * S + i) * 4;
    ni.data[o] = (-dx / l * 0.5 + 0.5) * 255; ni.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; ni.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[o + 3] = 255;
    const h = (at(i, j) - lo) / (hi - lo);
    const rough = Math.min(1, Math.max(0.25, 0.95 - 0.55 * h + 0.12 * noise2(i / 30, j / 6)));
    ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = rough * 255; ri.data[o + 3] = 255;
  }
  nc.getContext('2d').putImageData(ni, 0, 0); rc.getContext('2d').putImageData(ri, 0, 0);
  forgedCache = { normalMap: toTexture(nc, { srgb: false, repeat: true }), roughnessMap: toTexture(rc, { srgb: false, repeat: true }) };
  return forgedCache;
}

// Oiled rosewood for the turned handles (lathe UVs: u around, seamless; v along the handle): dark
// red-brown with long black streaks, open pores; grain relief in the normal map.
let woodCache = null;
export function rosewoodMaps() {
  if (woodCache) return woodCache;
  const W = 256, Hh = 1024;
  const cc = mkCanvas(W, Hh), nc = mkCanvas(W, Hh), rc = mkCanvas(W, Hh);
  const ci = cc.getContext('2d').createImageData(W, Hh), ni = nc.getContext('2d').createImageData(W, Hh), ri = rc.getContext('2d').createImageData(W, Hh);
  const h = new Float32Array(W * Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const a = (i / W) * TAU, v = j / Hh, cx = Math.cos(a), sy = Math.sin(a);
    const warp = noise3(cx * 1.2, sy * 1.2, v * 1.5) * 1.6;
    const streak = Math.sin((noise3(cx * 2.2, sy * 2.2, v * 0.5) * 7 + warp) * Math.PI);
    const dark = Math.pow(Math.max(0, streak), 6);
    const pore = Math.max(0, noise3(cx * 40, sy * 40, v * 6) - 0.55) * 2.2;
    const fine = noise3(cx * 18, sy * 18, v * 1.2) * 0.5 + 0.5;
    const l = 0.82 + 0.18 * fine - 0.55 * dark - 0.25 * pore + 0.06 * noise3(cx * 0.8, sy * 0.8, v * 3);
    const o = (j * W + i) * 4;
    ci.data[o] = 112 * l; ci.data[o + 1] = 52 * l; ci.data[o + 2] = 30 * l; ci.data[o + 3] = 255;
    h[j * W + i] = 0.4 * fine - 0.6 * pore - 0.2 * dark;
    const r = 0.5 + 0.25 * pore + 0.12 * (1 - fine);
    ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = Math.min(1, r) * 255; ri.data[o + 3] = 255;
  }
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const at = (x, y) => h[Math.min(Hh - 1, Math.max(0, y)) * W + ((x + W) % W)];
    const dx = (at(i + 1, j) - at(i - 1, j)) * 1.4, dy = (at(i, j + 1) - at(i, j - 1)) * 1.4, l = Math.hypot(dx, dy, 1), o = (j * W + i) * 4;
    ni.data[o] = (-dx / l * 0.5 + 0.5) * 255; ni.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; ni.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; ni.data[o + 3] = 255;
  }
  cc.getContext('2d').putImageData(ci, 0, 0); nc.getContext('2d').putImageData(ni, 0, 0); rc.getContext('2d').putImageData(ri, 0, 0);
  woodCache = { map: toTexture(cc), normalMap: toTexture(nc, { srgb: false }), roughnessMap: toTexture(rc, { srgb: false }) };
  for (const t of Object.values(woodCache)) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; }
  return woodCache;
}

// ------------------------------------------------------------------ parts
// Turned rosewood handle, axis at height rMax: brass end cap, a swelling grip with two incised rings,
// a brass ferrule with beaded rims. Returns { wood, brass }, x from 0 to H.
function woodHandle(H, rMax, seg) {
  const cap = latheX([[0, 0], [0.0015, 0.0055], [0.005, 0.0085], [0.011, rMax * 0.95], [0.014, rMax * 0.9], [0.0142, 0]], seg);
  const pts = [[0.0135, 0]];
  const x0 = 0.0135, x1 = H - 0.019, N = 30;
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = x0 + (x1 - x0) * u;
    let r = rMax * (0.86 + 0.14 * Math.sin(Math.PI * Math.pow(u, 0.75))) * (1 - 0.1 * u);
    for (const g of [0.08, 0.14, 0.88]) r -= 0.0007 * Math.exp(-(((u - g) / 0.012) ** 2));
    pts.push([x, r]);
  }
  pts.push([x1 + 0.0005, 0]);
  const wood = latheX(pts, seg);
  const fr = rMax * 0.8;
  const ferrule = latheX([[x1 - 0.0004, 0], [x1 - 0.0004, fr * 1.05], [x1 + 0.002, fr * 1.12], [x1 + 0.004, fr * 1.02], [H - 0.004, fr * 0.95], [H - 0.002, fr * 1.06], [H, fr * 0.9], [H + 0.0004, 0]], seg);
  for (const g of [cap, wood, ferrule]) g.translate(0, rMax, 0);
  return { wood, brass: [cap, ferrule] };
}
// forged octagonal bolster where the blade or shaft leaves the handle
function bolster(x0, r0, r1, y, len = 0.026) {
  return [coneX(x0, x0 + len * 0.4, r0, r0 * 1.04, y, 8), coneX(x0 + len * 0.4, x0 + len * 0.55, r0 * 1.04, r0 * 0.8, y, 8), coneX(x0 + len * 0.55, x0 + len, r0 * 0.8, r1, y, 8)];
}

// ------------------------------------------------------------------ instruments
function scalpel(kind, R, q) {
  const H = 0.24 + R() * 0.05, rMax = 0.0115, bl = 0.17 + R() * 0.05, th = 0.0016;
  const { wood, brass } = woodHandle(H, rMax, q.seg);
  const steel = bolster(H - 0.001, rMax * 0.72, 0.0034, rMax);
  const x0 = H + 0.022;
  const w = kind === 'saw' ? 0.026 : kind === 'round' ? 0.022 : 0.021;
  const { flat, edge } = bladeParts((s) => {
    if (kind === 'leaf') {          // vriddhipatra: the growing-leaf lancet
      s.moveTo(x0, -0.004); s.quadraticCurveTo(x0 + bl * 0.3, -w, x0 + bl * 0.62, -w * 0.72); s.quadraticCurveTo(x0 + bl * 0.88, -w * 0.4, x0 + bl, 0);
      s.quadraticCurveTo(x0 + bl * 0.8, w * 0.45, x0 + bl * 0.5, w * 0.6); s.quadraticCurveTo(x0 + bl * 0.2, w * 0.55, x0, 0.004); s.closePath();
    } else if (kind === 'round') {  // mandalagra: round-headed knife
      s.moveTo(x0, -0.0035); s.lineTo(x0 + bl * 0.55, -0.005); s.absarc(x0 + bl * 0.55 + w, 0, w, Math.PI * 1.15, Math.PI * 0.85 + TAU, false); s.lineTo(x0, 0.0035); s.closePath();
    } else if (kind === 'sickle') { // a curved, hook-like blade
      s.moveTo(x0, -0.004); s.quadraticCurveTo(x0 + bl * 0.7, -0.011, x0 + bl, w * 0.9); s.quadraticCurveTo(x0 + bl * 0.6, 0.002, x0, 0.004); s.closePath();
    } else if (kind === 'saw') {    // karapatra: the saw
      s.moveTo(x0, -0.004); s.lineTo(x0 + bl, -0.008);
      const n = 14; for (let k = 0; k < n; k++) { const xx = x0 + bl - (k / n) * bl * 0.92; s.lineTo(xx, w * 0.72); s.lineTo(xx - bl / (n * 2.2), w * 0.46); }
      s.lineTo(x0, 0.0045); s.closePath();
    } else if (kind === 'axe') {    // kutharika: the little axe
      s.moveTo(x0, -0.0035); s.lineTo(x0 + bl * 0.72, -0.0035); s.lineTo(x0 + bl * 0.75, -w * 1.05); s.quadraticCurveTo(x0 + bl * 1.02, -w * 0.4, x0 + bl * 0.97, w * 0.5);
      s.lineTo(x0 + bl * 0.8, 0.0045); s.lineTo(x0, 0.0035); s.closePath();
    } else {                        // suchi-mukha: needle-pointed knife
      s.moveTo(x0, -0.0045); s.quadraticCurveTo(x0 + bl * 0.6, -0.0042, x0 + bl * 1.15, 0); s.quadraticCurveTo(x0 + bl * 0.6, 0.0042, x0, 0.0045); s.closePath();
    }
  }, th, rMax);
  // the tang's shoulder, then the blade dips so its tip rests on the cloth
  const neck = coneX(x0 - 0.006, x0 + 0.004, 0.0034, 0.0026, rMax, 8);
  const blade = [flat, edge, neck];
  tilt(blade, x0 - 0.004, rMax, -Math.atan((rMax - th) / (bl + 0.004)));
  return { steel: merge([...steel, flat, neck]), polish: merge([edge]), wood: merge([wood]), brass: merge(brass), L: x0 + bl };
}

// eshani (probe): a forged eye, a twisted square grip, a draw-filed round shaft, an olive or plain tip
function probe(R, bulb, q) {
  const L = 0.5 + R() * 0.15, a = 0.0062, yb = a * 0.71;
  const steel = [flatRing(0.014, 0.0026, 0, 0.012, 0.0042, 0.0034, q.ring)];
  const turns = 3 + R() * 1.5;
  steel.push(sweep(lineX(0.024, 0.2, yb), q.twist, () => roundedRect(a, a, a * 0.2, 1), { twist: (u) => u * turns * TAU }));
  steel.push(coneX(0.022, 0.03, 0.0024, 0.0038, yb, 8));
  const brass = [coneX(0.198, 0.206, 0.0046, 0.0046, yb, q.seg), coneX(0.206, 0.212, 0.0046, 0.0036, yb, q.seg)];
  const shaft = [coneX(0.212, L, 0.0032, 0.0022, yb, q.seg)];
  shaft.push(bulb ? ball(L + 0.003, yb, 0, 0.0055, [1.45, 0.95, 0.95], q.seg, 10) : ball(L, yb, 0, 0.0024, [1, 1, 1], q.seg, 8));
  tilt(shaft, 0.212, yb, -Math.atan((yb - 0.0024) / (L - 0.212)) * (bulb ? 0.2 : 1));
  return { steel: merge(steel), polish: merge(shaft), wood: null, brass: merge(brass), L };
}

// badisha / shanku (hook): a turned handle, a round shaft and a sharp, tapering hook
function hook(R, q) {
  const L = 0.48 + R() * 0.1, rH = 0.0095, H = 0.16;
  const { wood, brass } = woodHandle(H, rH, q.seg);
  const steel = bolster(H - 0.001, rH * 0.72, 0.003, rH);
  const xs = H + 0.024, xe = L - 0.024;
  const shaft = coneX(xs, xe, 0.0031, 0.0025, rH, q.seg);
  const pts = [];
  for (let i = 0; i <= 18; i++) { const a = -Math.PI / 2 + (i / 18) * Math.PI * 1.15; pts.push(new THREE.Vector3(xe + Math.cos(a) * 0.022, rH, 0.022 + Math.sin(a) * 0.022)); }
  pts.unshift(new THREE.Vector3(xe - 0.004, rH, 0));
  const curve = new THREE.CatmullRomCurve3(pts);
  const hk = varTube(curve, 30, 8, (u) => 0.0025 * Math.max(0.12, 1 - Math.pow(u, 1.6)));
  const tip = [shaft, hk];
  tilt(tip, xs, rH, -Math.atan((rH - 0.0025) / (xe - xs)));
  return { steel: merge([...steel, hk]), polish: merge([shaft]), wood: merge([wood]), brass: merge(brass), L };
}

// sandamsha (spring tongs): two forged strips welded at the heel, serrated jaw tips, a brass slide
function tongs(R, q) {
  const L = 0.42 + R() * 0.06, th = 0.003, y = th / 2;
  const steel = [], brass = [];
  for (const s of [-1, 1]) {
    const c = flatCurve([[0.004, s * 0.004], [0.06, s * 0.014], [L * 0.55, s * 0.022], [L * 0.86, s * 0.012], [L - 0.012, s * 0.0034], [L, s * 0.0028]], y);
    steel.push(sweep(c, q.arm, (u) => roundedRect(0.0078 - 0.0035 * u, th, th * 0.4, 1)));
    for (let k = 0; k < 9; k++) {   // serrations on the inner face of each jaw
      const x = L - 0.004 - k * 0.0032, g = new THREE.BoxGeometry(0.0012, th * 0.8, 0.0014); g.rotateY(0.6 * s); g.translate(x, y, s * 0.0011); steel.push(g);
    }
  }
  steel.push(sweep(lineX(-0.012, 0.03, 0.0032), 4, () => roundedRect(0.02, 0.0064, 0.0025, 2)));
  brass.push(dome(0.012, 0.0064, 0, 0.0042, 0.0018, q.seg));
  // the slide ring that locks the jaws, round both arms
  const xr = L * 0.72, zr = 0.0185, loop = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; loop.push(new THREE.Vector3(xr, y + Math.sin(a) * 0.0042, Math.cos(a) * zr * (1 + 0.06 * Math.cos(2 * a)))); }
  brass.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), 40, 0.0014, 6, true));
  return { steel: merge(steel), polish: null, wood: null, brass: merge(brass), L };
}

// nadi yantra (tube): a hollow drawn tube (outer and inner walls in one lathe), flared mouth, brass bands
function tube(R, q) {
  const L = 0.32 + R() * 0.08, r = 0.013, x0 = 0.05, x1 = x0 + L, w = 0.0022;
  const prof = [[x0, r * 0.98], [x0 + 0.02, r], [x1 - 0.03, r * 0.84], [x1 - 0.008, r * 0.88], [x1 - 0.002, r * 0.98], [x1, r * 0.94], [x1 + 0.0004, r * 0.94 - w * 0.6], [x1 - 0.003, r * 0.86 - w], [x1 - 0.03, r * 0.84 - w], [x0 + 0.02, r - w], [x0, r * 0.98 - w], [x0, r * 0.98]];
  const steel = [latheX(prof, q.seg * 2)];
  const brass = [latheX([[0, 0], [0.002, 0.004], [0.012, 0.0068], [0.04, r * 0.92], [x0 + 0.001, r * 1.03], [x0 + 0.001, 0]], q.seg * 2)];
  for (const xb of [x0 + 0.004, x0 + 0.05, x1 - 0.045]) brass.push(latheX([[xb - 0.004, 0], [xb - 0.004, r * 1.04], [xb - 0.002, r * 1.12], [xb + 0.002, r * 1.12], [xb + 0.004, r * 1.04], [xb + 0.004, 0]], q.seg * 2));
  for (const g of [...steel, ...brass]) g.translate(0, r, 0);
  return { steel: merge(steel), polish: null, wood: null, brass: merge(brass), L: x1 };
}

// suchi (needles): three straight needles with flattened, slotted eyes, and a curved suture needle
function needles(R, q) {
  const steel = [], polish = [];
  for (let k = 0; k < 3; k++) {
    const z = (k - 1) * 0.026, L = 0.2 + k * 0.05, rr = 0.0019;
    polish.push(rodX(0.05, 0.05 + L, rr, rr, 8, z), coneX(0.05 + L, 0.05 + L + 0.034, rr, 0.0002, rr, 8, z));
    for (const s of [-1, 1]) steel.push(ball(0.046, rr, z + s * 0.0016, 0.0016, [3.2, 0.7, 0.9], 10, 6));   // the eye's two cheeks
    steel.push(ball(0.038, rr, z, 0.002, [1.6, 0.7, 1.3], 10, 6));
  }
  const pts = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * 0.15 + (i / 14) * Math.PI * 0.7; pts.push(new THREE.Vector3(0.36 + Math.cos(a) * 0.06, 0.0024, 0.09 - Math.sin(a) * 0.06)); }
  polish.push(varTube(new THREE.CatmullRomCurve3(pts), 22, 8, (u) => 0.0024 * (1 - Math.pow(u, 3) * 0.92)));
  return { steel: merge(steel), polish: merge(polish), wood: null, brass: null, L: 0.42 };
}

// ---- the cast heads of the svastika forceps (local: x forward, y up, z sideways; resting at y = 0),
// sculpted as signed-distance fields and meshed with surface nets
function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
function sdEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx), py = (y - cy), pz = (z - cz);
  const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
function sdCap(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {   // round cone a → b
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t, z - az - dz * t) - (ra + (rb - ra) * t);
}
// shared: the socket that wraps the crossed arms and flows into the neck
const socket = (x, y, z) => sdCap(x, y, z, -0.064, 0.012, 0, -0.02, 0.019, 0, 0.0085, 0.014);
const HEADS = {
  // a stylised lion as on the Mauryan capitals: a flame-locked ruff round the face, heavy brow,
  // wide muzzle, the mouth open on the jaws
  lion(x, y, z) {
    let d = socket(x, y, z);
    d = smin(d, sdEll(x, y, z, 0, 0.026, 0, 0.024, 0.021, 0.021), 0.008);
    d = smin(d, sdEll(x, y, z, 0.022, 0.019, 0, 0.016, 0.011, 0.014), 0.006);
    d = smin(d, sdCap(x, y, z, 0.006, 0.035, 0, 0.031, 0.024, 0, 0.008, 0.0058), 0.004);
    d = smin(d, sdEll(x, y, z, 0.037, 0.022, 0, 0.005, 0.004, 0.0065), 0.002);
    d = smin(d, sdEll(x, y, z, 0.024, 0.007, 0, 0.015, 0.0045, 0.012), 0.002);
    const zs = Math.abs(z);
    d = smin(d, sdEll(x, y, zs, 0.013, 0.036, 0.0095, 0.0085, 0.0042, 0.0065), 0.003);
    d = smin(d, sdEll(x, y, zs, 0.019, 0.016, 0.0115, 0.011, 0.0095, 0.0085), 0.004);
    d = smin(d, sdEll(x, y, zs, -0.004, 0.047, 0.0165, 0.0055, 0.0075, 0.0038), 0.003);
    // the ruff: two rows of flame-shaped locks in a ring about the x axis, sweeping back
    const yc = 0.025, ry = y - yc, r = Math.hypot(ry, z), th = Math.atan2(ry, z);
    for (const [xm, rm, n, ph, w] of [[-0.006, 0.027, 9, 0, 0.0085], [-0.017, 0.03, 8, 0.5, 0.009]]) {
      const lock = Math.pow(Math.abs(Math.cos(th * n + ph)), 1.5);
      const sweepBack = (r - rm) * 0.7;                 // tips lean backwards
      const dr = Math.hypot((x - xm + sweepBack) * 1.6, r - rm - 0.004 * lock) - (w * (0.55 + 0.45 * lock));
      d = smin(d, dr, 0.003);
    }
    // carved hollows: eye sockets and nostrils
    d = Math.max(d, -sdEll(x, y, zs, 0.0215, 0.0305, 0.0128, 0.003, 0.0022, 0.0026));
    d = Math.max(d, -sdEll(x, y, zs, 0.0405, 0.0215, 0.0028, 0.0018, 0.0014, 0.0016));
    d = smin(d, sdEll(x, y, zs, 0.0198, 0.0302, 0.0112, 0.0022, 0.0022, 0.0022), 0.0006);   // eyeballs
    return Math.max(d, -y);
  },
  heron(x, y, z) {
    let d = socket(x, y, z);
    d = smin(d, sdEll(x, y, z, 0, 0.02, 0, 0.022, 0.016, 0.0145), 0.007);
    d = smin(d, sdCap(x, y, z, 0.008, 0.02, 0, 0.026, 0.018, 0, 0.011, 0.0065), 0.004);
    d = smin(d, sdCap(x, y, z, -0.006, 0.033, 0, -0.045, 0.041, 0, 0.0045, 0.0012), 0.004);   // crest plumes
    d = smin(d, sdCap(x, y, z, -0.01, 0.03, 0, -0.038, 0.031, 0.004, 0.0038, 0.001), 0.003);
    d = smin(d, sdCap(x, y, z, -0.01, 0.03, 0, -0.038, 0.031, -0.004, 0.0038, 0.001), 0.003);
    const zs = Math.abs(z);
    d = smin(d, sdEll(x, y, zs, 0.0055, 0.025, 0.0105, 0.006, 0.005, 0.0022), 0.0015);           // eye ring
    d = Math.max(d, -sdEll(x, y, zs, 0.0062, 0.0252, 0.0128, 0.0032, 0.0028, 0.0018));
    d = smin(d, sdEll(x, y, zs, 0.0062, 0.0252, 0.0112, 0.0024, 0.0024, 0.0024), 0.0005);
    // feather grooves along the neck
    d += 0.0006 * Math.max(0, Math.sin(Math.atan2(y - 0.018, z) * 10)) * (x < -0.008 ? 1 : 0);
    return Math.max(d, -y);
  },
  crow(x, y, z) {
    let d = socket(x, y, z);
    d = smin(d, sdEll(x, y, z, 0, 0.021, 0, 0.021, 0.018, 0.0165), 0.007);
    d = smin(d, sdCap(x, y, z, 0.01, 0.021, 0, 0.024, 0.017, 0, 0.012, 0.009), 0.004);
    d = smin(d, sdEll(x, y, z, -0.006, 0.034, 0, 0.012, 0.004, 0.008), 0.004);
    const zs = Math.abs(z);
    d = smin(d, sdEll(x, y, zs, -0.01, 0.017, 0.013, 0.012, 0.007, 0.004), 0.004);
    d = Math.max(d, -sdEll(x, y, zs, 0.0095, 0.0262, 0.0148, 0.003, 0.0028, 0.0022));
    d = smin(d, sdEll(x, y, zs, 0.0095, 0.0262, 0.0132, 0.0024, 0.0024, 0.0024), 0.0005);
    // overlapping feather scales over the crown and nape
    const fth = Math.atan2(y - 0.021, zs), fr = Math.hypot(y - 0.021, zs);
    d += 0.0007 * Math.max(0, Math.sin(fth * 9 + x * 700)) * (fr > 0.012 && x < 0.004 ? 1 : 0);
    return Math.max(d, -y);
  },
};
function headGeo(kind, q) {
  const f = HEADS[kind];
  const body = { field2: () => -1, column: () => undefined, columnField: f };
  const g = meshBody(body, [-0.07, -0.003, -0.05], [0.05, 0.064, 0.05], q.sdf);
  const p = g.attributes.position;          // the cast's foot rests flat on the cloth
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.0012) p.setY(i, 0.0012);
  return g;
}

// svastika yantra: two crossed forged arms (flat, chamfered bars) with finger rings, a riveted pivot
// boss, and the cast head with its steel jaws (lion: short and toothed · heron: a long slender beak ·
// crow: a stout pointed beak).
function forceps(kind, R, q) {
  const P = kind === 'heron' ? 0.36 : 0.38;
  const steel = [], polish = [], brass = [];
  const tA = 0.005;
  for (const s of [-1, 1]) {
    const y = 0.0035 + (s > 0 ? tA + 0.0005 : 0);
    const c = flatCurve([[0.05, s * 0.05], [0.14, s * 0.03], [P - 0.06, s * 0.008], [P, 0], [P + 0.04, -s * 0.004]], y);
    steel.push(sweep(c, q.arm, (u) => roundedRect(0.0095 - 0.002 * u, tA, tA * 0.35, 1)));
    steel.push(flatRing(0.028, y, s * 0.06, 0.024, 0.0058, tA, q.ring));
  }
  // the pivot boss and its domed rivet
  { const g = new THREE.CylinderGeometry(0.0125, 0.0125, 0.0118, q.seg * 2); g.translate(P, 0.0069, 0); steel.push(g); }
  brass.push(dome(P, 0.0128, 0, 0.0065, 0.0028, q.seg * 2));
  const hx = P + 0.07;
  const head = headGeo(kind, q); head.translate(hx, 0, 0); brass.push(head);
  let L;
  if (kind === 'lion') {
    for (const [yj, s] of [[0.017, 1], [0.0045, -1]]) {   // upper / lower jaw: broad, with a row of teeth facing each other
      const c = lineX(hx + 0.026, hx + 0.1, yj);
      steel.push(sweep(c, 8, (u) => roundedRect(0.018 - 0.008 * u, 0.0038, 0.0015, 1)));
      for (let k = 0; k < 7; k++) {
        const x = hx + 0.034 + k * 0.0095;
        for (const zz of [-1, 1]) { const g = new THREE.ConeGeometry(0.0014, 0.0028, 6); if (s > 0) g.rotateX(Math.PI); g.translate(x, yj - s * 0.0032, zz * (0.0068 - k * 0.0005)); steel.push(g); }
      }
    }
    L = hx + 0.1;
  } else if (kind === 'heron') {
    for (const [yj, k] of [[0.0215, 1], [0.0135, -1]]) { const g = coneX(hx + 0.02, hx + 0.24, 0.0062, 0.0009, yj, q.seg); g.scale(1, 1, 1); polish.push(g); }
    L = hx + 0.24;
  } else {
    for (const [yj, k] of [[0.022, 1], [0.012, -1]]) { const g = coneX(hx + 0.016, hx + 0.13, 0.0095, 0.0016, 0, q.seg); g.scale(1, 0.62, 1); g.translate(0, yj, 0); polish.push(g); }
    L = hx + 0.13;
  }
  return { steel: merge(steel), polish: merge(polish), wood: null, brass: merge(brass), L, head: new THREE.Vector3(hx, 0.03, 0) };
}

// The display set: 24 slots round the medallion, slot 0 facing the viewer. Returns per-slot builds
// (geometry UVs are box-projected for the tileable steel / brass maps; wood keeps its lathe UVs).
export function buildInstruments(seed = 5, { lite = false } = {}) {
  const R = rng(seed);
  const q = lite ? { seg: 7, ring: 14, twist: 20, arm: 14, sdf: 0.0042 } : { seg: 18, ring: 40, twist: 110, arm: 48, sdf: 0.0013 };
  const order = ['probe', 'lion', 'leaf', 'hook', 'round', 'tongs', 'needle-k', 'sickle', 'tube', 'probe2', 'saw', 'crow',
    'needles', 'axe', 'probe', 'leaf', 'tongs', 'hook', 'round', 'tube', 'sickle', 'probe2', 'heron', 'leaf'];
  const UVS = 1 / 0.06;   // one forged-map tile per 6 cm
  return order.map((k) => {
    let b;
    switch (k) {
      case 'lion': case 'heron': case 'crow': b = forceps(k, R, q); break;
      case 'probe': b = probe(R, true, q); break;
      case 'probe2': b = probe(R, false, q); break;
      case 'hook': b = hook(R, q); break;
      case 'tongs': b = tongs(R, q); break;
      case 'tube': b = tube(R, q); break;
      case 'needles': b = needles(R, q); break;
      case 'needle-k': b = scalpel('needle', R, q); break;
      default: b = scalpel(k, R, q);
    }
    for (const m of ['steel', 'polish', 'brass']) boxUV(b[m], UVS);
    return { ...b, kind: k };
  });
}

// ------------------------------------------------------------------ the manuscript
// A palm leaf: a long slab with rounded ends and two cord holes, gently cockled; uv over the top face
// spans the folio texture (holes at u = 0.3 / 0.7). Groups: 0 faces, 1 cut edges.
export function palmLeafGeometry(len = 1.7, wid = 0.23, th = 0.003, seed = 1) {
  const s = new THREE.Shape(), r = wid * 0.5, hl = len / 2 - r;
  s.moveTo(-hl, -r); s.lineTo(hl, -r); s.absarc(hl, 0, r, -Math.PI / 2, Math.PI / 2, false); s.lineTo(-hl, r); s.absarc(-hl, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  for (const hx of [-0.2 * len, 0.2 * len]) { const h = new THREE.Path(); h.absarc(hx, 0, 0.0085, 0, TAU, true); s.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 20 });
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  const R = rng(seed);
  const ph = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    uv.setXY(i, x / len + 0.5, 0.5 - z / wid);
    p.setY(i, p.getY(i) + 0.0022 * noise2(x * 3 + 1.7, z * 6) + 0.0012 * Math.cos(x * 2.1) + 0.0018 * (z / wid) ** 2 + 0.0005 * noise2(x * 5 + ph, z * 9));
  }
  g.computeVertexNormals();
  return g;
}
// cockled 'paper' relief for the leaves: fine fibres along the leaf
export function leafBumpTexture() {
  const W = 1024, H = 128, c = mkCanvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = 0.5 + 0.3 * noise2(i / 60, j / 0.9) + 0.15 * noise2(i / 12, j / 0.5), o = (j * W + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = Math.max(0, Math.min(1, v)) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}
// A painted wooden manuscript cover: lacquered red ground, a border of rosettes, a central lotus
// roundel flanked by two creepers, worn through to the wood at the edges.
export function coverTexture() {
  const W = 2048, H = 320, c = mkCanvas(W, H), x = c.getContext('2d');
  const img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = j / H, o = (j * W + i) * 4;
    const edge = Math.min(u * 6.4, (1 - u) * 6.4, v, 1 - v);
    const wear = Math.max(0, 0.25 - edge) * 4 + Math.max(0, fbm2(u * 30, v * 5, 3) - 0.45) * 1.5;
    const grain = 0.8 + 0.2 * Math.sin((v * 40 + fbm2(u * 3, v * 2, 3) * 6) * Math.PI);
    const lac = [132, 30, 22].map((cc) => cc * (0.85 + 0.15 * fbm2(u * 12, v * 3, 3)));
    const wood = [96 * grain, 60 * grain, 34 * grain];
    const k = Math.min(1, wear);
    d[o] = lac[0] * (1 - k) + wood[0] * k; d[o + 1] = lac[1] * (1 - k) + wood[1] * k; d[o + 2] = lac[2] * (1 - k) + wood[2] * k; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const gold = 'rgba(214,164,72,0.92)', cream = 'rgba(236,214,170,0.9)', green = 'rgba(40,96,66,0.9)', dark = 'rgba(30,14,8,0.9)';
  x.strokeStyle = gold; x.lineWidth = 6; x.strokeRect(40, 22, W - 80, H - 44); x.lineWidth = 2; x.strokeRect(56, 38, W - 112, H - 76);
  for (let k = 0; k < 44; k++) {                 // rosettes along the border
    const px = 80 + k * ((W - 160) / 43);
    for (const py of [30, H - 30]) { x.fillStyle = cream; x.beginPath(); x.arc(px, py, 6, 0, TAU); x.fill(); x.fillStyle = dark; x.beginPath(); x.arc(px, py, 2.2, 0, TAU); x.fill(); }
  }
  const lotus = (cx, cy, R) => {
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + ring * Math.PI / 12, r0 = ring ? R * 0.3 : R * 0.45, r1 = ring ? R * 0.75 : R;
      x.fillStyle = ring ? cream : 'rgba(220,120,120,0.9)'; x.beginPath();
      x.moveTo(cx + Math.cos(a - 0.22) * r0, cy + Math.sin(a - 0.22) * r0);
      x.quadraticCurveTo(cx + Math.cos(a) * r1 * 1.1, cy + Math.sin(a) * r1 * 1.1, cx + Math.cos(a + 0.22) * r0, cy + Math.sin(a + 0.22) * r0); x.fill();
    }
    x.fillStyle = gold; x.beginPath(); x.arc(cx, cy, R * 0.28, 0, TAU); x.fill();
    x.strokeStyle = gold; x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, R * 1.12, 0, TAU); x.stroke();
  };
  lotus(W / 2, H / 2, 105);
  for (const s of [-1, 1]) {                     // creepers
    x.strokeStyle = green; x.lineWidth = 7; x.beginPath();
    for (let i = 0; i <= 80; i++) { const t = i / 80, px = W / 2 + s * (150 + t * 720), py = H / 2 + Math.sin(t * TAU * 3) * 52; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.stroke();
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.5) / 12, px = W / 2 + s * (150 + t * 720), py = H / 2 + Math.sin(t * TAU * 3) * 52, up = i % 2 ? 1 : -1;
      x.fillStyle = green; x.beginPath(); x.ellipse(px + s * 14, py + up * 30, 26, 11, s * up * 0.7, 0, TAU); x.fill();
      x.fillStyle = cream; x.beginPath(); x.arc(px - s * 10, py - up * 26, 9, 0, TAU); x.fill();
    }
    lotus(W / 2 + s * 900, H / 2, 58);
  }
  for (let k = 0; k < 900; k++) { x.fillStyle = `rgba(20,10,5,${Math.random() * 0.12})`; x.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 1); }   // craquelure
  return toTexture(c, { anisotropy: 8 });
}

// ------------------------------------------------------------------ table props
// A rolled linen bandage (a spiral of cloth, loose tail trailing), a lidded terracotta jar of ghee,
// a hammered brass katori with water. Built at the origin; the scene places them.
export function bandageGeometry(lite) {
  const turns = 9, w = 0.07, r0 = 0.012, dr = 0.0016, N = lite ? 120 : 260, pos = [], idx = [];
  const cols = lite ? 6 : 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * turns * TAU - Math.PI / 2, r = r0 + dr * t * turns;
    for (let j = 0; j <= cols; j++) {
      const z = (j / cols - 0.5) * w * (1 - 0.04 * Math.sin(a * 0.5));
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z + 0.0012 * noise2(a, j));
    }
  }
  const rl = r0 + dr * turns;
  for (let i = 1; i <= 40; i++) {               // the tail, leaving the roll underneath and laid out on the table
    const s = i / 40 * 0.16;
    for (let j = 0; j <= cols; j++) pos.push(s, -rl + 0.0008 + 0.0015 * Math.sin(s * 40) * (j / cols) * Math.min(1, s * 30), (j / cols - 0.5) * w + 0.002 * Math.sin(s * 25));
  }
  const rows = N + 1 + 40;
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + cols + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv = []; for (let i = 0; i < rows; i++) for (let j = 0; j <= cols; j++) uv.push(i / 30, j / cols);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  g.translate(0, r0 + dr * turns, 0);
  return g;
}
export function linenTexture() {
  const S = 256, c = mkCanvas(S, S), x = c.getContext('2d'), img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const w = 0.5 + 0.5 * Math.sin(i * Math.PI / 2) * Math.sin(j * Math.PI / 2);
    const l = 0.86 + 0.08 * w + 0.06 * noise2(i / 9, j / 40) - 0.08 * Math.max(0, fbm2(i / 50, j / 50, 3));
    const o = (j * S + i) * 4; img.data[o] = 236 * l; img.data[o + 1] = 226 * l; img.data[o + 2] = 204 * l; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { repeat: true });
}
export function jarGeometry(seg = 40) {
  const P = [[0, 0], [0.05, 0], [0.058, 0.006], [0.075, 0.04], [0.082, 0.075], [0.074, 0.11], [0.05, 0.135], [0.042, 0.142], [0.046, 0.15], [0.05, 0.158], [0.046, 0.162], [0.038, 0.156], [0.034, 0.14]];
  const g = new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const p = g.attributes.position;          // hand-thrown: a little out of round, throwing rings on the belly
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const k = 1 + 0.018 * Math.sin(a * 2 + 0.7) + 0.006 * Math.sin(y * 260) * (y > 0.01 && y < 0.13 ? 1 : 0);
    p.setX(i, Math.cos(a) * r * k); p.setZ(i, Math.sin(a) * r * k);
  }
  g.computeVertexNormals();
  return g;
}
// cloth tied over the jar's mouth: a dome with a frilled skirt
export function jarClothGeometry(seg = 40) {
  const P = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; P.push(new THREE.Vector2(Math.max(0.0005, Math.sin(u * Math.PI / 2) * 0.06), 0.172 - u * u * 0.03 - (u > 0.75 ? (u - 0.75) * 0.06 : 0))); }
  const g = new THREE.LatheGeometry(P, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const skirt = Math.max(0, 0.16 - y) / 0.02;
    const k = 1 + skirt * 0.12 * Math.sin(a * 11 + Math.sin(a * 3)), ry = y - skirt * 0.004 * (1 + Math.sin(a * 7));
    p.setX(i, Math.cos(a) * r * k); p.setZ(i, Math.sin(a) * r * k); p.setY(i, ry);
  }
  g.computeVertexNormals();
  return g;
}
export function katoriGeometry(seg = 48) {
  const P = [[0, 0], [0.035, 0], [0.04, 0.003], [0.062, 0.02], [0.074, 0.045], [0.077, 0.052], [0.073, 0.053], [0.069, 0.046], [0.057, 0.022], [0.034, 0.006], [0, 0.005]];
  return new THREE.LatheGeometry(P.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
