// MODERN INVENTIONS — build-time assets for the gallery of invention: geometry helpers, the procedural
// canvas textures (wood, engraved brass plaques, stellar spectra, the Saha equation, the mass–radius plot,
// the QR standee and the phone's two screens, the Jaipur Foot's section), the shared materials, and the
// set: a polished stone floor whose slabs are drawn in world space (no texture period anywhere), the
// panelled back wall, the plinths with their brass inlay. The exhibits themselves: inventors-models.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU } from '../../lib/math.js';
import { fbm2, GLSL_NOISE } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { FONTS } from '../../lib/text.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = V3(0, 1, 0);

// ------------------------------------------------------------------ geometry helpers
// level of detail: the lite path (phones) builds every turned / rounded / swept part with fewer segments
let DET = 1, RSEG = 2;
export function setDetail(lite) { DET = lite ? 0.45 : 1; RSEG = lite ? 1 : 2; }
const sg = (n, min = 6) => Math.max(min, Math.round(n * DET));
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  return geo.applyMatrix4(_m);
}
// merge keeping position / normal / uv (missing uv → 0)
export function merge(geos) {
  const list = geos.filter(Boolean).map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    n.clearGroups();
    return n;
  });
  return mergeGeometries(list, false);
}
export const lathe = (pts, segs = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), sg(segs, 8));
export const box = (w, h, d, p, r) => bake(new THREE.BoxGeometry(w, h, d), p, r);
export const rbox = (w, h, d, rad, p, r, seg = RSEG) => bake(new RoundedBoxGeometry(w, h, d, Math.min(seg, RSEG), Math.min(rad, w / 2.01, h / 2.01, d / 2.01)), p, r);
export const cyl = (r0, r1, h, seg, p, r) => bake(new THREE.CylinderGeometry(r0, r1, h, sg(seg, 6)), p, r);
export function rod(a, b, r, seg = 8, r1 = r) {
  const g = new THREE.CylinderGeometry(r1, r, a.distanceTo(b), sg(seg, 4), 1);
  _q.setFromUnitVectors(UP, _v.copy(b).sub(a).normalize());
  _m.compose(_s.copy(a).lerp(b, 0.5), _q, V3(1, 1, 1));
  return g.applyMatrix4(_m);
}
// tube along a curve with a radius function r(u)
export function tubeAlong(curve, rFn, segs = 24, radial = 8) {
  segs = sg(segs, 4); radial = sg(radial, 4);
  const pos = [], uv = [], idx = [], frames = curve.computeFrenetFrames(segs, false), P = V3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; curve.getPointAt(u, P); const r = typeof rFn === 'number' ? rFn : rFn(u), N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r);
      uv.push(u, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export const curve = (pts, closed = false) => new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : V3(...p))), closed, 'centripetal');
// helical spring along +y from y0 to y1 (coil radius rc, wire radius rw)
export function helix(rc, rw, y0, y1, turns, segs = 96, radial = 5) {
  const pts = [];
  for (let i = 0; i <= segs; i++) { const u = i / segs, a = u * turns * TAU; pts.push(V3(Math.cos(a) * rc, y0 + (y1 - y0) * u, Math.sin(a) * rc)); }
  return tubeAlong(new THREE.CatmullRomCurve3(pts), rw, segs, radial);
}
// knurled knob: a cylinder whose rim carries ridges (axis +y)
export function knurl(r, h, ridges = 24, p, rot) {
  ridges = sg(ridges, 8);
  const g = new THREE.CylinderGeometry(r, r, h, ridges * 2, 1);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i), rr = Math.hypot(x, z);
    if (rr > r * 0.98) { const a = Math.atan2(z, x), k = Math.round((a / TAU) * ridges * 2); const s = k % 2 ? 0.9 : 1; pa.setX(i, x * s); pa.setZ(i, z * s); }
  }
  g.computeVertexNormals();
  return bake(g, p, rot);
}
// rounded-rectangle shape (centred)
export function rrShape(w, h, r, s = new THREE.Shape()) {
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ------------------------------------------------------------------ spectra
const lobe = (x, mu, s1, s2) => { const q = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * q * q); };
export function specRGB(lam) {
  const X = 1.056 * lobe(lam, 599.8, 37.9, 31.0) + 0.362 * lobe(lam, 442.0, 16.0, 26.7) - 0.065 * lobe(lam, 501.1, 20.4, 26.2);
  const Y = 0.821 * lobe(lam, 568.8, 46.9, 40.5) + 0.286 * lobe(lam, 530.9, 16.3, 31.1);
  const Z = 1.217 * lobe(lam, 437.0, 11.8, 36.0) + 0.681 * lobe(lam, 459.0, 26.0, 13.8);
  const c = [Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z), Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z), Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)];
  const m = Math.max(...c, 1e-4);
  return [c[0] / m, c[1] / m, c[2] / m];
}
// black body (relative), and its colour as a temperature swatch
const planck = (lam, T) => { const l = lam * 1e-9; return 1 / (l ** 5 * (Math.exp(0.014388 / (l * T)) - 1)); };
export function starColor(T) {
  let r = 0, g = 0, b = 0;
  for (let lam = 400; lam <= 700; lam += 10) { const c = specRGB(lam), p = planck(lam, T) * (lam > 640 ? 0.6 : 1); r += c[0] * p; g += c[1] * p; b += c[2] * p; }
  const m = Math.max(r, g, b);
  return new THREE.Color(r / m, g / m, b / m);
}

// ------------------------------------------------------------------ canvas helpers
const fnt = (size, w = 400, fam = FONTS.mono, it = false) => `${it ? 'italic ' : ''}${w} ${size}px "${fam}"`;
function noiseFill(g, W, H, base, amp, sx, sy, seed = 1, streak = 0) {
  const img = g.createImageData(W, H), d = img.data, R = rng(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm2(x * sx + seed * 7.1, y * sy, 3) * amp + (R() - 0.5) * amp * 0.25 + (streak ? Math.sin(y * streak + fbm2(x * 0.01, y * 0.2) * 4) * amp * 0.15 : 0);
    const i = (y * W + x) * 4;
    d[i] = base[0] * (1 + n); d[i + 1] = base[1] * (1 + n); d[i + 2] = base[2] * (1 + n); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

// Quarter-sawn hardwood (teak / mahogany): grain along u. One texture, mapped once per face: no repeat.
export function woodTexture({ W = 1024, H = 256, seed = 3, dark = [52, 30, 18], light = [118, 70, 40] } = {}) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data, R = rng(seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const warp = fbm2(x * 0.0018 + seed, y * 0.01, 3) * 2.2 + fbm2(x * 0.0005, seed, 2) * 1.5;
    const ring = 0.5 + 0.5 * Math.sin((y / H) * 70 + warp) * (0.6 + 0.4 * fbm2(x * 0.004, y * 0.03 + seed, 2));
    const fleck = Math.pow(Math.max(0, fbm2(x * 0.03, y * 0.25 + seed, 2)), 3) * 1.6;
    const streak = fbm2(x * 0.002, y * 0.6 + seed, 2) * 0.18;
    const k = Math.min(1, Math.max(0, 0.4 + 0.3 * Math.pow(ring, 2.0) + 0.12 * fbm2(x * 0.006, y * 0.04, 2) + streak + fleck * 0.12 + (R() - 0.5) * 0.05));
    const i = (y * W + x) * 4;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = dark[ch] + (light[ch] - dark[ch]) * k;
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

// An engraved brass plaque: brushed ground, double rule, the name cut in and blackened.
export function plaqueTexture(lines) {
  const W = 768, H = 224, c = mkCanvas(W, H), g = c.getContext('2d');
  noiseFill(g, W, H, [196, 152, 84], 0.12, 0.004, 0.25, lines[0].length, 0);
  const R = rng(lines[0].length * 3);
  g.globalAlpha = 0.08; g.strokeStyle = '#fff';
  for (let i = 0; i < 260; i++) { const y = R() * H; g.lineWidth = 0.5 + R(); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + (R() - 0.5) * 2); g.stroke(); }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(60,38,14,0.9)'; g.lineWidth = 3; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 1.5; g.strokeRect(24, 24, W - 48, H - 48);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cut = (t, y, size, w, fam = FONTS.display) => {
    g.font = fnt(size, w, fam);
    g.fillStyle = 'rgba(255,236,190,0.55)'; g.fillText(t, W / 2 + 1.5, y + 1.5);
    g.fillStyle = 'rgba(34,20,8,0.95)'; g.fillText(t, W / 2, y);
  };
  cut(lines[0], H * 0.42, 56, 700);
  if (lines[1]) cut(lines[1], H * 0.72, 30, 500, FONTS.mono);
  return toTexture(c);
}

// Seven stellar spectra (O B A F G K M), 390–700 nm, as photographic strips with their absorption lines.
// Hydrogen (Balmer) strongest near A (~10,000 K) — what Saha's equation explained; Ca II H & K and the
// metals take over in G and K; TiO bands score the M star.
export const SPEC_CLASSES = [
  { k: 'O', T: 35000 }, { k: 'B', T: 18000 }, { k: 'A', T: 9500 }, { k: 'F', T: 7000 }, { k: 'G', T: 5700 }, { k: 'K', T: 4500 }, { k: 'M', T: 3300 },
];
export function spectraTexture() {
  const W = 1024, H = 672, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#050403'; g.fillRect(0, 0, W, H);
  const L0 = 390, L1 = 700, x0 = 92, x1 = W - 30, rowH = 70, gap = 18, y0 = 60;
  const R = rng(1920);
  const metals = []; for (let i = 0; i < 70; i++) metals.push(400 + R() * 290);
  const tio = [476, 496, 517, 545, 585, 616, 668];
  const lineDepth = (cls, lam) => {
    const T = cls.T, gl = (mu, w, a) => a * Math.exp(-0.5 * ((lam - mu) / w) ** 2);
    const hS = Math.exp(-0.5 * ((Math.log(T) - Math.log(9500)) / 0.42) ** 2);             // Balmer strength
    const caS = Math.exp(-0.5 * ((Math.log(T) - Math.log(4800)) / 0.35) ** 2);            // Ca II
    const heS = Math.exp(-0.5 * ((Math.log(T) - Math.log(22000)) / 0.35) ** 2);           // He I
    const mS = Math.exp(-0.5 * ((Math.log(T) - Math.log(4600)) / 0.4) ** 2);              // neutral metals
    let d = 0;
    for (const [mu, w] of [[656.3, 1.6], [486.1, 1.4], [434.0, 1.3], [410.2, 1.2], [397.0, 1.1]]) d += gl(mu, w * (0.6 + 1.8 * hS), 0.9 * hS + 0.08);
    d += gl(393.4, 1.2 + 2.5 * caS, 0.95 * caS) + gl(396.8, 1.2 + 2.2 * caS, 0.85 * caS);
    for (const mu of [447.1, 471.3, 587.6, 667.8]) d += gl(mu, 0.9, 0.55 * heS);
    d += gl(589.3, 1.0 + 1.5 * mS, 0.8 * mS) + gl(517.0, 1.2, 0.6 * mS) + gl(430.8, 1.4, 0.7 * mS);
    for (const mu of metals) d += gl(mu, 0.35, 0.35 * mS * (0.4 + 0.6 * ((mu * 7.3) % 1)));
    if (T < 4000) for (const e of tio) if (lam > e - 1 && lam < e + 14) d += 0.6 * Math.exp(-(lam - e) / 9);
    return Math.min(0.97, d);
  };
  SPEC_CLASSES.forEach((cls, r) => {
    const y = y0 + r * (rowH + gap);
    const bmax = Math.max(...Array.from({ length: 32 }, (_, i) => planck(L0 + i * 10, cls.T)));
    const img = g.createImageData(x1 - x0, rowH);
    for (let x = 0; x < x1 - x0; x++) {
      const lam = L0 + (L1 - L0) * x / (x1 - x0 - 1), col = specRGB(lam);
      const vis = Math.min(1, Math.max(0.12, (lam - 380) / 40)) * Math.min(1, Math.max(0.1, (720 - lam) / 60));
      const b = 0.25 + 0.75 * planck(lam, cls.T) / bmax;
      const dep = lineDepth(cls, lam);
      for (let yy = 0; yy < rowH; yy++) {
        const edge = Math.min(1, Math.min(yy, rowH - 1 - yy) / 8);
        const grain = 0.92 + 0.16 * R();
        const k = vis * b * (1 - dep) * edge * grain;
        const i = (yy * (x1 - x0) + x) * 4;
        img.data[i] = 255 * Math.min(1, col[0] * k); img.data[i + 1] = 255 * Math.min(1, col[1] * k); img.data[i + 2] = 255 * Math.min(1, col[2] * k); img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, x0, y);
    g.fillStyle = '#e9d6b0'; g.font = fnt(40, 500); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cls.k, 46, y + rowH / 2);
    g.font = fnt(15, 400); g.fillStyle = 'rgba(233,214,176,0.7)'; g.textAlign = 'right';
    g.fillText(`${cls.T.toLocaleString('en-US')} K`, x1, y - 6);
  });
  // wavelength ruler
  g.strokeStyle = 'rgba(233,214,176,0.6)'; g.fillStyle = 'rgba(233,214,176,0.7)'; g.lineWidth = 1.5; g.font = fnt(14, 400); g.textAlign = 'center';
  for (let lam = 400; lam <= 700; lam += 50) { const x = x0 + (x1 - x0) * (lam - L0) / (L1 - L0); g.beginPath(); g.moveTo(x, y0 - 30); g.lineTo(x, y0 - 22); g.stroke(); g.fillText(`${lam}`, x, y0 - 40); }
  g.textAlign = 'left'; g.fillText('nm', x1 - 16, y0 - 40);
  // Balmer markers
  g.strokeStyle = 'rgba(255,214,150,0.35)'; g.setLineDash([3, 5]);
  for (const lam of [656.3, 486.1, 434.0, 410.2]) { const x = x0 + (x1 - x0) * (lam - L0) / (L1 - L0); g.beginPath(); g.moveTo(x, y0 - 16); g.lineTo(x, y0 - 4); g.stroke(); }
  g.setLineDash([]);
  return toTexture(c);
}

// ------------------------------------------------------------------ typeset formulas (strokes for the
// glyphs the web-font subsets lack: Λ, the minus, the fraction bars)
function runs(g, list, x, y, S, draw = true) {
  for (const [t, k = 'n'] of list) {
    const sub = k.startsWith('sub'), sup = k.startsWith('sup'), it = k.endsWith('i');
    const sz = sub || sup ? S * 0.62 : S;
    g.font = it ? `italic 500 ${sz}px "${FONTS.serif}"` : `400 ${sz}px "${FONTS.sans}"`;
    const yy = sub ? y + S * 0.22 : sup ? y - S * 0.42 : y;
    if (t === 'MINUS') { if (draw) { g.lineWidth = sz * 0.07; g.beginPath(); g.moveTo(x + sz * 0.06, yy - sz * 0.3); g.lineTo(x + sz * 0.52, yy - sz * 0.3); g.stroke(); } x += sz * 0.6; continue; }
    if (t === 'LAMBDA') { if (draw) { g.lineWidth = sz * 0.075; g.beginPath(); g.moveTo(x + sz * 0.04, yy); g.lineTo(x + sz * 0.33, yy - sz * 0.72); g.lineTo(x + sz * 0.62, yy); g.stroke(); } x += sz * 0.68; continue; }
    if (draw) g.fillText(t, x, yy);
    x += g.measureText(t).width + (it ? S * 0.02 : 0);
  }
  return x;
}
const runsW = (g, list, S) => runs(g, list, 0, 0, S, false);
function frac(g, num, den, x, y, S, draw = true) {
  const wn = runsW(g, num, S), wd = runsW(g, den, S), w = Math.max(wn, wd) + S * 0.3;
  if (draw) {
    runs(g, num, x + (w - wn) / 2, y - S * 0.55, S);
    runs(g, den, x + (w - wd) / 2, y + S * 0.72, S);
    g.lineWidth = S * 0.055; g.beginPath(); g.moveTo(x, y - S * 0.28); g.lineTo(x + w, y - S * 0.28); g.stroke();
  }
  return x + w;
}
// Saha (1920): n(i+1)·ne / n(i) = (2/Λ³)·(g(i+1)/g(i))·e^(−E/kT)
export function sahaTexture() {
  const W = 1400, H = 300, c = mkCanvas(W, H), g = c.getContext('2d'), S = 76;
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
  const parts = (draw) => {
    let x = 40; const y = H / 2 + S * 0.3;
    x = frac(g, [['n', 'ni'], ['i+1', 'subi'], [' n', 'ni'], ['e', 'subi']], [['n', 'ni'], ['i', 'subi']], x, y, S, draw);
    x = runs(g, [['  =  ']], x, y, S, draw);
    x = frac(g, [['2']], [['LAMBDA'], ['3', 'sup']], x, y, S, draw);
    x += S * 0.15;
    x = frac(g, [['g', 'ni'], ['i+1', 'subi']], [['g', 'ni'], ['i', 'subi']], x, y, S, draw);
    x += S * 0.15;
    x = runs(g, [['e', 'ni'], ['MINUS', 'sup'], ['E', 'supi'], [' / ', 'sup'], ['kT', 'supi']], x, y, S, draw);
    return x;
  };
  const w = parts(false);
  g.save(); g.translate((W - w) / 2 - 20, 0); g.shadowColor = 'rgba(255,255,255,0.6)'; g.shadowBlur = 3; parts(true); g.restore();
  return toTexture(c);
}

// The white dwarf's mass–radius relation (Chandrasekhar 1931; the usual fit R ∝ M^(−1/3)·√(1 − (M/Mch)^(4/3))),
// drawn as light on glass. plotUV(m) maps a mass to the curve point in texture uv.
export const MCH = 1.44;
export const wdRadius = (m) => Math.pow(m, -1 / 3) * Math.sqrt(Math.max(0, 1 - Math.pow(m / MCH, 4 / 3)));
const PLOT = { W: 1024, H: 720, x0: 120, x1: 960, y0: 640, y1: 70, mMax: 1.6, rMax: 1.5 };
export function plotUV(m) {
  const P = PLOT, x = P.x0 + (P.x1 - P.x0) * m / P.mMax, y = P.y0 + (P.y1 - P.y0) * Math.min(1, wdRadius(m) / P.rMax);
  return [x / P.W, 1 - y / P.H];
}
export function massRadiusTexture() {
  const P = PLOT, c = mkCanvas(P.W, P.H), g = c.getContext('2d');
  const X = (m) => P.x0 + (P.x1 - P.x0) * m / P.mMax, Y = (r) => P.y0 + (P.y1 - P.y0) * Math.min(1, r / P.rMax);
  g.strokeStyle = 'rgba(255,230,190,0.16)'; g.lineWidth = 1;
  for (let m = 0.2; m <= 1.6001; m += 0.2) { g.beginPath(); g.moveTo(X(m), P.y0); g.lineTo(X(m), P.y1); g.stroke(); }
  for (let r = 0.25; r <= 1.5001; r += 0.25) { g.beginPath(); g.moveTo(P.x0, Y(r)); g.lineTo(P.x1, Y(r)); g.stroke(); }
  g.strokeStyle = 'rgba(255,232,196,0.85)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(P.x0, P.y1 - 10); g.lineTo(P.x0, P.y0); g.lineTo(P.x1 + 10, P.y0); g.stroke();
  g.fillStyle = 'rgba(255,232,196,0.9)'; g.font = fnt(26, 400); g.textAlign = 'center'; g.textBaseline = 'top';
  for (const m of [0.5, 1.0]) { g.beginPath(); g.moveTo(X(m), P.y0); g.lineTo(X(m), P.y0 + 12); g.stroke(); g.fillText(m.toFixed(1), X(m), P.y0 + 18); }
  g.font = fnt(22, 400); g.fillText('MASS  ·  SOLAR MASSES', (P.x0 + P.x1) / 2, P.y0 + 50);
  g.save(); g.translate(P.x0 - 56, (P.y0 + P.y1) / 2); g.rotate(-Math.PI / 2); g.fillText('RADIUS', 0, -12); g.restore();
  // the curve
  g.strokeStyle = '#ffd89a'; g.lineWidth = 6; g.shadowColor = 'rgba(255,200,120,0.9)'; g.shadowBlur = 14;
  g.beginPath();
  for (let i = 0; i <= 400; i++) { const m = 0.08 + (MCH - 0.08) * (1 - Math.pow(1 - i / 400, 1.6)); const x = X(m), y = Y(wdRadius(m)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke(); g.shadowBlur = 0;
  // the limit
  g.strokeStyle = 'rgba(255,240,215,0.95)'; g.lineWidth = 3; g.setLineDash([12, 10]);
  g.beginPath(); g.moveTo(X(MCH), P.y1 - 4); g.lineTo(X(MCH), P.y0); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#fff3dc'; g.font = fnt(46, 500); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('1.4', X(MCH) + 16, P.y1 + 36);
  return toTexture(c);
}

// ------------------------------------------------------------------ QR, payment screens
// A QR-shaped pattern (finder squares, timing rows, alignment mark, seeded modules). Decorative: it encodes nothing.
export function qrModules(n = 29, seed = 2016) {
  const R = rng(seed), m = Array.from({ length: n }, () => new Array(n).fill(0)), fixed = Array.from({ length: n }, () => new Array(n).fill(false));
  const finder = (ox, oy) => { for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) { const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= n || Y >= n) continue; const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3)); m[Y][X] = ring === 3 || ring <= 1 ? 1 : 0; if (x < 0 || y < 0 || x > 6 || y > 6) m[Y][X] = 0; fixed[Y][X] = true; } };
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
  for (let i = 8; i < n - 8; i++) { m[6][i] = m[i][6] = i % 2 ? 0 : 1; fixed[6][i] = fixed[i][6] = true; }
  const a = n - 9; for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) { const r = Math.max(Math.abs(x), Math.abs(y)); m[a + y][a + x] = r === 1 ? 0 : 1; fixed[a + y][a + x] = true; }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixed[y][x]) m[y][x] = R() < 0.5 ? 1 : 0;
  return m;
}
function drawQR(g, x, y, size, mods, ink = '#111') {
  const n = mods.length, s = size / n;
  g.fillStyle = ink;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (mods[j][i]) g.fillRect(x + i * s - 0.25, y + j * s - 0.25, s + 0.5, s + 0.5);
}
// the rupee sign, drawn (U+20B9 is not in the bundled fonts)
function rupee(g, x, y, S, w = S * 0.09) {
  g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + S * 0.56, y); g.stroke();
  g.beginPath(); g.moveTo(x, y + S * 0.19); g.lineTo(x + S * 0.56, y + S * 0.19); g.stroke();
  g.beginPath(); g.moveTo(x + S * 0.05, y); g.bezierCurveTo(x + S * 0.42, y, x + S * 0.46, y + S * 0.4, x + S * 0.05, y + S * 0.4); g.stroke();
  g.beginPath(); g.moveTo(x + S * 0.06, y + S * 0.4); g.lineTo(x + S * 0.46, y + S * 0.86); g.stroke();
}
export function standeeTexture(mods) {
  const W = 600, H = 860, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1d3b2f'; g.fillRect(0, 0, W, 150);
  g.fillStyle = '#f6e7c4'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = fnt(64, 700, FONTS.sans); g.fillText('SCAN & PAY', W / 2, 78);
  g.fillStyle = '#fff'; g.fillRect(80, 200, 440, 440);
  drawQR(g, 100, 220, 400, mods, '#141414');
  g.fillStyle = '#1d3b2f'; g.font = fnt(46, 600, FONTS.sans); g.fillText('CHAI STALL', W / 2, 712);
  g.fillStyle = '#5b5348'; g.font = fnt(28, 400, FONTS.mono); g.fillText('PAY WITH ANY UPI APP', W / 2, 772);
  g.strokeStyle = '#c9a25a'; g.lineWidth = 6; g.strokeRect(14, 14, W - 28, H - 28);
  return toTexture(c);
}
// the phone's two screens: scanning (camera view of the QR) and paid
export function phoneScreens(mods) {
  const W = 540, H = 1170;
  const status = (g, dark) => {
    g.fillStyle = dark ? '#e8ecef' : '#e8ecef'; g.font = fnt(30, 600, FONTS.sans); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('10:24', 46, 46);
    g.textAlign = 'right'; g.fillText('5G', W - 120, 46);
    g.strokeStyle = '#e8ecef'; g.lineWidth = 2.5; g.strokeRect(W - 100, 34, 50, 24); g.fillStyle = '#e8ecef'; g.fillRect(W - 96, 38, 34, 16); g.fillRect(W - 48, 41, 4, 10);
    g.fillStyle = '#000'; g.beginPath(); g.arc(W / 2, 44, 16, 0, TAU); g.fill();   // punch-hole camera
  };
  // A: scanning
  const a = mkCanvas(W, H), ga = a.getContext('2d');
  { const grd = ga.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#2a2420'); grd.addColorStop(1, '#0d0b0a'); ga.fillStyle = grd; ga.fillRect(0, 0, W, H); }
  // the camera view: a warm blur of the stall, the card held in it
  ga.globalAlpha = 0.5; for (let i = 0; i < 40; i++) { const R = rng(i + 4); ga.fillStyle = `hsl(${25 + R() * 20},${40 + R() * 30}%,${15 + R() * 25}%)`; ga.beginPath(); ga.arc(R() * W, 200 + R() * 760, 30 + R() * 90, 0, TAU); ga.fill(); }
  ga.globalAlpha = 1;
  ga.fillStyle = '#f4efe6'; ga.fillRect(110, 330, 320, 440);
  ga.fillStyle = '#1d3b2f'; ga.fillRect(110, 330, 320, 60);
  ga.fillStyle = '#fff'; ga.fillRect(140, 410, 260, 260); drawQR(ga, 150, 420, 240, mods, '#151515');
  ga.strokeStyle = '#fff'; ga.lineWidth = 7; ga.lineCap = 'round';
  for (const [x, y, sx, sy] of [[90, 310, 1, 1], [450, 310, -1, 1], [90, 790, 1, -1], [450, 790, -1, -1]]) { ga.beginPath(); ga.moveTo(x, y + sy * 60); ga.lineTo(x, y); ga.lineTo(x + sx * 60, y); ga.stroke(); }
  ga.fillStyle = 'rgba(0,0,0,0.55)'; ga.fillRect(0, 0, W, 210); ga.fillRect(0, 900, W, H - 900);
  status(ga, true);
  ga.fillStyle = '#fff'; ga.textAlign = 'center'; ga.font = fnt(42, 600, FONTS.sans); ga.fillText('Scan any UPI QR', W / 2, 150);
  ga.fillStyle = 'rgba(255,255,255,0.75)'; ga.font = fnt(26, 400, FONTS.sans); ga.fillText('Hold steady over the code', W / 2, 960);
  ga.fillStyle = 'rgba(255,255,255,0.14)'; ga.beginPath(); ga.arc(W / 2, 1060, 46, 0, TAU); ga.fill();
  ga.strokeStyle = '#fff'; ga.lineWidth = 4; ga.beginPath(); ga.arc(W / 2, 1060, 46, 0, TAU); ga.stroke();
  // B: paid
  const b = mkCanvas(W, H), gb = b.getContext('2d');
  { const grd = gb.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#0f3a28'); grd.addColorStop(0.55, '#0b241a'); grd.addColorStop(1, '#07130e'); gb.fillStyle = grd; gb.fillRect(0, 0, W, H); }
  status(gb, true);
  gb.fillStyle = '#2fbf71'; gb.beginPath(); gb.arc(W / 2, 360, 110, 0, TAU); gb.fill();
  gb.strokeStyle = '#ffffff'; gb.lineWidth = 22; gb.lineCap = 'round'; gb.lineJoin = 'round';
  gb.beginPath(); gb.moveTo(W / 2 - 52, 362); gb.lineTo(W / 2 - 12, 402); gb.lineTo(W / 2 + 58, 318); gb.stroke();
  gb.strokeStyle = '#ffffff'; gb.fillStyle = '#ffffff';
  rupee(gb, W / 2 - 112, 548, 96, 9);
  gb.font = fnt(112, 300, FONTS.sans); gb.textAlign = 'left'; gb.textBaseline = 'alphabetic'; gb.fillText('20', W / 2 - 40, 634);
  gb.textAlign = 'center'; gb.font = fnt(40, 600, FONTS.sans); gb.fillText('Paid to Chai Stall', W / 2, 730);
  gb.fillStyle = 'rgba(255,255,255,0.7)'; gb.font = fnt(26, 400, FONTS.sans); gb.fillText('via UPI  ·  10:24 am', W / 2, 784);
  gb.fillStyle = 'rgba(255,255,255,0.08)'; gb.fillRect(60, 850, W - 120, 150);
  gb.fillStyle = 'rgba(255,255,255,0.6)'; gb.font = fnt(22, 400, FONTS.mono); gb.fillText('TRANSACTION ID', W / 2, 900); gb.fillStyle = '#fff'; gb.font = fnt(28, 500, FONTS.mono); gb.fillText('6021 3348 1125', W / 2, 950);
  gb.fillStyle = '#2fbf71'; gb.font = fnt(26, 600, FONTS.sans); gb.fillText('Done', W / 2, 1080);
  return [toTexture(a), toTexture(b)];
}

// ------------------------------------------------------------------ the gallery: floor, wall, plinths
const FLOOR_GLSL = /* glsl */ `
float fh1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// slabs 1.2 × 0.8 m, each row shifted by its own random offset; per-slab tone and polish; dark joints;
// marble-like veining, and a broad low-frequency mottle — all from world position, so nothing repeats
vec4 slab(vec2 p){
  float row = floor(p.y / 0.8);
  float off = fh1(vec2(row, 3.1)) * 1.2;
  vec2 q = vec2(p.x + off, p.y);
  vec2 id = vec2(floor(q.x / 1.2), row);
  vec2 f = vec2(fract(q.x / 1.2) * 1.2, fract(q.y / 0.8) * 0.8);
  float e = min(min(f.x, 1.2 - f.x), min(f.y, 0.8 - f.y));
  float joint = 1.0 - smoothstep(0.0012, 0.0045, e);
  float tone = fh1(id) ;
  return vec4(tone, joint, fh1(id + 17.3), e);
}`;
export function floorMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0, envMapIntensity: 0.55 });
  m.userData.noAntiTile = true;
  m.userData.detail = { albedo: 0.03, rough: 0.12, bump: 0.000004, scratch: 0.05, grime: 0.02 };
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vFW;\n${GLSL_NOISE}\n${FLOOR_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec4 sl = slab(vFW.xz);
        float mott = snoise(vec3(vFW.xz * 0.35, 1.7)) * 0.5 + snoise(vec3(vFW.xz * 1.3, 4.2)) * 0.25;
        float vein = snoise(vec3(vFW.xz * vec2(0.9, 1.6) + vec2(sl.z * 40.0, sl.x * 13.0), 2.0) + snoise(vec3(vFW.xz * 3.0, 7.0)) * 0.6);
        float vl = smoothstep(0.06, 0.0, abs(vein)) * (0.5 + 0.5 * sl.z);
        vec3 base = mix(vec3(0.032, 0.026, 0.022), vec3(0.06, 0.048, 0.038), sl.x) * (1.0 + 0.35 * mott);
        base = mix(base, vec3(0.22, 0.19, 0.16), vl * 0.35);
        base *= 1.0 - 0.75 * sl.y;
        diffuseColor.rgb = base;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.3 + 0.12 * sl.z + 0.07 * snoise(vec3(vFW.xz * 2.2, 9.0)) + 0.05 * snoise(vec3(vFW.xz * 11.0, 3.0)), 0.8, sl.y);`);
  };
  m.customProgramCacheKey = () => 'inv-floor';
  return m;
}
// the back wall: dark warm limewash with soft vertical bloom of damp and age (world space)
export function wallMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, envMapIntensity: 0.25 });
  m.userData.noAntiTile = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWW;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float n = snoise(vec3(vWW.x * 0.6, vWW.y * 0.25, 2.0)) * 0.5 + snoise(vec3(vWW.xy * vec2(2.5, 0.6), 5.0)) * 0.25 + snoise(vec3(vWW.xy * 9.0, 8.0)) * 0.08;
        diffuseColor.rgb *= vec3(0.042, 0.034, 0.028) * (1.0 + 0.4 * n);`);
  };
  m.customProgramCacheKey = () => 'inv-wall';
  return m;
}

// The gallery wall: base skirting, panels framed by mouldings, fluted pilasters with brass capitals,
// a cornice. Along x from x0 to x1, face at z = zf.
export function wallGeometries(x0, x1, zf, { bay = 3.4, H = 4.2, lite = false } = {}) {
  const wall = [], trim = [], brass = [];
  wall.push(box(x1 - x0, H, 0.2, [(x0 + x1) / 2, H / 2, zf - 0.1]));
  trim.push(rbox(x1 - x0, 0.18, 0.05, 0.01, [(x0 + x1) / 2, 0.09, zf + 0.025]));           // skirting
  trim.push(rbox(x1 - x0, 0.03, 0.035, 0.008, [(x0 + x1) / 2, 0.2, zf + 0.018]));
  trim.push(rbox(x1 - x0, 0.12, 0.12, 0.02, [(x0 + x1) / 2, H - 0.3, zf + 0.06]));          // cornice
  trim.push(rbox(x1 - x0, 0.05, 0.16, 0.015, [(x0 + x1) / 2, H - 0.22, zf + 0.08]));
  trim.push(rbox(x1 - x0, 0.04, 0.05, 0.01, [(x0 + x1) / 2, 1.05, zf + 0.025]));            // dado rail
  for (let x = x0 + bay / 2; x < x1; x += bay) {
    // pilaster: a shaft with seven flutes (half-round reeds), base block, brass capital band
    const pw = 0.34;
    trim.push(rbox(pw + 0.06, 0.3, 0.1, 0.012, [x, 0.15, zf + 0.05]));
    trim.push(rbox(pw, H - 0.75, 0.06, 0.01, [x, 0.3 + (H - 0.75) / 2, zf + 0.03]));
    for (let k = 0; k < (lite ? 0 : 7); k++) { const fx = x - pw / 2 + 0.035 + k * (pw - 0.07) / 6; trim.push(bake(new THREE.CylinderGeometry(0.014, 0.014, H - 0.95, 8, 1, false, 0, Math.PI), [fx, 0.4 + (H - 0.95) / 2, zf + 0.06], [0, -Math.PI / 2, 0])); }
    brass.push(rbox(pw + 0.04, 0.05, 0.085, 0.01, [x, H - 0.45, zf + 0.045]));
    trim.push(rbox(pw + 0.08, 0.06, 0.1, 0.012, [x, H - 0.39, zf + 0.05]));
    // panels between pilasters: a raised field framed by a bolection moulding
    const pxc = x + bay / 2; if (pxc + bay / 2 > x1 + 0.01) continue;
    const pw2 = bay - pw - 0.5, ph = 2.0, py = 1.15 + ph / 2 + 0.25;
    for (const [w, h, dx, dy] of [[pw2, 0.04, 0, ph / 2], [pw2, 0.04, 0, -ph / 2], [0.04, ph, pw2 / 2, 0], [0.04, ph, -pw2 / 2, 0]]) trim.push(rbox(w + (h < 0.05 ? 0.04 : 0), h, 0.03, 0.01, [pxc + dx, py + dy, zf + 0.015]));
    trim.push(rbox(pw2 - 0.12, ph - 0.12, 0.012, 0.004, [pxc, py, zf + 0.006]));
    if (lite) continue;
    const lw = pw2, lh = 0.62, ly = 0.6;
    for (const [w, h, dx, dy] of [[lw, 0.03, 0, lh / 2], [lw, 0.03, 0, -lh / 2], [0.03, lh, lw / 2, 0], [0.03, lh, -lw / 2, 0]]) trim.push(rbox(w + (h < 0.05 ? 0.03 : 0), h, 0.025, 0.008, [pxc + dx, ly + dy, zf + 0.012]));
  }
  return { wall: merge(wall), trim: merge(trim), brass: merge(brass) };
}

// A plinth: skirt, lacquered body with a shadow gap, a marble top with a brass edge band, a brass inlay
// strip up its front (it lights when the path arrives), and an engraved plaque.
export function plinthGeometries(w, d, h) {
  const body = [], top = [], brass = [];
  body.push(rbox(w + 0.05, 0.05, d + 0.05, 0.008, [0, 0.025, 0]));
  body.push(rbox(w, h - 0.1, d, 0.014, [0, 0.05 + (h - 0.1) / 2, 0]));
  body.push(rbox(w - 0.03, 0.02, d - 0.03, 0.004, [0, h - 0.055, 0]));          // shadow gap
  top.push(rbox(w + 0.03, 0.034, d + 0.03, 0.006, [0, h - 0.017, 0]));
  brass.push(rbox(w + 0.036, 0.009, d + 0.036, 0.003, [0, h - 0.0375, 0]));
  brass.push(rbox(w + 0.058, 0.008, d + 0.058, 0.003, [0, 0.054, 0]));
  return { body: merge(body), top: merge(top), brass: merge(brass) };
}

// ------------------------------------------------------------------ materials
export function materials(env) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const wood = woodTexture({ seed: 5 }), woodLight = woodTexture({ seed: 9, dark: [120, 92, 60], light: [196, 160, 112] });
  const M = {
    brass: std({ color: '#c9a259', metalness: 1, roughness: 0.36, envMapIntensity: 0.75 }),
    brassDark: std({ color: '#a8823f', metalness: 1, roughness: 0.42 }),
    brassDS: std({ color: '#c9a050', metalness: 1, roughness: 0.34, side: THREE.DoubleSide }),
    nickel: std({ color: '#cfcac0', metalness: 1, roughness: 0.22 }),
    steel: std({ color: '#b8bcc0', metalness: 1, roughness: 0.42 }),
    chrome: std({ color: '#e4e6e8', metalness: 1, roughness: 0.08 }),
    alu: std({ color: '#6c6f74', metalness: 1, roughness: 0.46 }),
    copper: std({ color: '#d0794a', metalness: 1, roughness: 0.3 }),
    gold: std({ color: '#f2c66a', metalness: 1, roughness: 0.18 }),
    ebonite: std({ color: '#151210', metalness: 0, roughness: 0.32 }),
    blackAnod: std({ color: '#121314', metalness: 0.6, roughness: 0.45 }),
    rubber: std({ color: '#141312', metalness: 0, roughness: 0.75 }),
    pvc: std({ color: '#1a1a1b', metalness: 0, roughness: 0.48 }),
    whitePlastic: std({ color: '#e9e6df', metalness: 0, roughness: 0.4 }),
    cloth: std({ color: '#5c2316', metalness: 0, roughness: 0.85 }),
    redWire: std({ color: '#a8261c', metalness: 0, roughness: 0.4 }),
    wood: std({ map: wood, roughness: 0.48, metalness: 0 }),
    woodLight: std({ map: woodLight, roughness: 0.6, metalness: 0 }),
    terracotta: std({ color: '#6a3418', roughness: 0.92, metalness: 0 }),
    soil: std({ color: '#2a1d14', roughness: 1, metalness: 0 }),
    leaf: std({ color: '#3f6a2a', roughness: 0.6, metalness: 0, side: THREE.DoubleSide }),
    galena: std({ color: '#8d9196', metalness: 0.85, roughness: 0.28, flatShading: true }),
    plinth: std({ color: '#1c1916', roughness: 0.4, metalness: 0, envMapIntensity: 0.6 }),
    marble: std({ color: '#2a2622', roughness: 0.42, metalness: 0, envMapIntensity: 0.8 }),
    trim: std({ color: '#2c241e', roughness: 0.62, metalness: 0, envMapIntensity: 0.4 }),
    glass: std({ color: '#1a1c1e', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.12, envMapIntensity: 1.0, side: THREE.DoubleSide, depthWrite: false }),
    glassTint: std({ color: '#33464a', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, envMapIntensity: 1.0, side: THREE.DoubleSide, depthWrite: false }),
    acrylic: std({ color: '#1c1e20', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.08, envMapIntensity: 1.0, side: THREE.DoubleSide, depthWrite: false }),
    dial: std({ color: '#efe6d2', roughness: 0.7, metalness: 0 }),
    black: std({ color: '#050505', roughness: 0.6, metalness: 0 }),
  };
  M.brass.userData.detail = { albedo: 0.03, rough: 0.18, grime: 0.015, scratch: 0.2 };
  M.brassDark.userData.detail = { albedo: 0.06, rough: 0.25, grime: 0.06, scratch: 0.2 };
  M.alu.userData.detail = { albedo: 0.03, rough: 0.2, grime: 0.02, scratch: 0.18 };
  M.marble.userData.detail = { albedo: 0.12, rough: 0.3, scale: 2 };
  M.plinth.userData.detail = { albedo: 0.06, rough: 0.35, scratch: 0.1, grime: 0.05, scale: 2 };
  void env;
  return M;
}

// ------------------------------------------------------------------ the Jaipur Foot's section (sagittal):
// skin-coloured vulcanised rubber shell, a tread layer, microcellular rubber, the wooden ankle block with
// its bolt. Painted from the same field the mesh is made from; fieldAt(x, y) < 0 inside the foot at z = 0.
export function footSectionTexture(fieldAt, box2, { W = 1024, H = 448 } = {}) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const [x0, y0, x1, y1] = box2, R = rng(1969);
  const inBlock = (x, y) => y > 0.034 && y < 0.096 && x > 0.028 + (0.096 - y) * 0.15 && x < 0.112 - (0.096 - y) * 0.25;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (x1 - x0) * (i + 0.5) / W, y = y1 - (y1 - y0) * (j + 0.5) / H;
    const f = fieldAt(x, y), k = (j * W + i) * 4;
    if (f > -0.0006) { d[k + 3] = 0; continue; }
    let col;
    if (f > -0.0045) col = [150, 102, 74];                                    // skin rubber
    else if (y < 0.0085) col = [58, 44, 36];                                  // tread rubber
    else if (Math.abs(x - 0.071) < 0.0055 && y > 0.05) col = [150, 154, 158];  // bolt
    else if (inBlock(x, y)) {                                                 // willow wood block
      const gr = 0.5 + 0.5 * Math.sin(y * 900 + fbm2(x * 40, y * 300, 2) * 4);
      col = [196 - 40 * gr, 160 - 36 * gr, 108 - 28 * gr];
    } else {                                                                  // microcellular rubber
      const pore = R() < 0.07 ? 0.72 : 1, n = 0.94 + 0.08 * fbm2(x * 300, y * 300, 2);
      col = [212 * pore * n, 196 * pore * n, 160 * pore * n];
    }
    // a hairline where layers are bonded
    d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // bond lines around the block
  g.strokeStyle = 'rgba(70,46,26,0.8)'; g.lineWidth = 2;
  const P = (x, y) => [(x - x0) / (x1 - x0) * W, (y1 - y) / (y1 - y0) * H];
  g.beginPath(); [[0.028 + 0.062 * 0.15, 0.034], [0.028, 0.096], [0.112, 0.096], [0.112 - 0.062 * 0.25, 0.034]].forEach(([x, y], i) => { const [px, py] = P(x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath(); g.stroke();
  const t = toTexture(c); t.anisotropy = 8;
  return t;
}

// smoked-glass record of the crescograph: rows of white dots scratched through soot, rising in steps
export function smokedGlassTexture() {
  const W = 512, H = 384, c = mkCanvas(W, H), g = c.getContext('2d');
  noiseFill(g, W, H, [26, 22, 20], 0.35, 0.02, 0.02, 11);
  g.fillStyle = 'rgba(240,232,214,0.95)';
  for (let r = 0; r < 3; r++) {
    let y = 300 - r * 30;
    for (let i = 0; i < 46; i++) { const x = 30 + i * 10; y -= (r === 0 ? 4.2 : r === 1 ? 2.6 : 1.4) * (0.8 + 0.4 * Math.sin(i * 1.7 + r)); g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill(); }
  }
  return toTexture(c);
}

// a galvanometer dial
export function dialTexture() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#2a2016'; g.fillStyle = '#2a2016'; g.lineWidth = 2;
  g.beginPath(); g.arc(S / 2, S * 0.62, S * 0.36, -Math.PI * 0.82, -Math.PI * 0.18); g.stroke();
  for (let i = 0; i <= 20; i++) { const a = -Math.PI * 0.82 + (Math.PI * 0.64) * i / 20, l = i % 5 ? 10 : 20; g.beginPath(); g.moveTo(S / 2 + Math.cos(a) * S * 0.36, S * 0.62 + Math.sin(a) * S * 0.36); g.lineTo(S / 2 + Math.cos(a) * (S * 0.36 - l), S * 0.62 + Math.sin(a) * (S * 0.36 - l)); g.stroke(); }
  g.font = fnt(18, 500); g.textAlign = 'center'; g.fillText('0', S / 2, S * 0.2); g.font = fnt(14, 400); g.fillText('GALVANOMETER', S / 2, S * 0.8);
  return toTexture(c);
}

// the trident (USB symbol), as a height map for the overmould's embossing
export function tridentTexture() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  const cx = 128;
  g.beginPath(); g.moveTo(40, cx); g.lineTo(200, cx); g.stroke();
  g.beginPath(); g.moveTo(200, cx - 18); g.lineTo(232, cx); g.lineTo(200, cx + 18); g.closePath(); g.fill();
  g.beginPath(); g.arc(40, cx, 16, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(80, cx); g.lineTo(110, cx - 40); g.lineTo(150, cx - 40); g.stroke();
  g.beginPath(); g.arc(156, cx - 40, 11, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(105, cx); g.lineTo(135, cx + 38); g.lineTo(168, cx + 38); g.stroke();
  g.fillRect(166, cx + 28, 20, 20);
  const t = toTexture(c, { srgb: false });
  return t;
}
