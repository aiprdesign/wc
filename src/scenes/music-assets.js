// MUSIC — build-time assets for "Music: Bach, Mozart, Beethoven" (Western film).
// Everything here is procedural: the instruments (an arched-plate string family — cello and violin —
// with f-holes, purfling, scroll, pegs, bridge, strings and bow; a keyboard family — a Viennese
// fortepiano and an 1820s grand — with instanced keys and hammers), the organ façade, the hall's music
// stands and choir, and the canvas textures (woods, varnished plates, the stylised manuscripts whose
// noteheads the scene lights in time with the score). No facsimile, no logos.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU, clamp, lerp } from '../lib/math.js';
import { fbm2, noise2 } from '../lib/noise.js';
import { FONTS } from '../lib/text.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
let DET = 1;                                 // geometric detail (lite: fewer segments)
export function setDetail(lite) { DET = lite ? 0.55 : 1; }
const sg = (n, min = 3) => Math.max(min, Math.round(n * DET));

// ------------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(V3(...p), _q.setFromEuler(_e.set(r[0], r[1], r[2])), V3(...s));
  geo.applyMatrix4(_m);
  return geo;
}
export function merge(geos) {
  const gs = geos.filter(Boolean).map((g) => {
    let h = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k);
    if (!h.attributes.uv) h.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(h.attributes.position.count * 2), 2));
    if (!h.attributes.normal) h.computeVertexNormals();
    return h;
  });
  const m = mergeGeometries(gs, false);
  return m;
}
export const box = (w, h, d, p, r) => bake(new THREE.BoxGeometry(w, h, d), p, r);
export const rbox = (w, h, d, rad, p, r) => bake(new RoundedBoxGeometry(w, h, d, DET < 1 ? 1 : 2, Math.min(rad, w / 2.01, h / 2.01, d / 2.01)), p, r);
export const cyl = (r0, r1, h, seg, p, r) => bake(new THREE.CylinderGeometry(r0, r1, h, sg(seg, 5)), p, r);
export const lathe = (pts, segs = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), sg(segs, 8));
export function rod(a, b, r, seg = 6) {
  const d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, sg(seg, 4), 1, true);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize()), V3(1, 1, 1)));
  return g;
}
export function tube(points, r, segs = 24, radial = 6, closed = false) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), closed, 'centripetal');
  return new THREE.TubeGeometry(c, sg(segs, 6), r, sg(radial, 4), closed);
}
// a tube whose radius follows rFn(u)
export function taperTube(points, rFn, segs = 32, radial = 8) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : V3(...p))), false, 'centripetal');
  const S = sg(segs, 8), R = sg(radial, 5);
  const g = new THREE.TubeGeometry(c, S, 1, R, false);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const P = new THREE.Vector3();
  for (let i = 0; i <= S; i++) {
    c.getPointAt(i / S, P);
    const r = rFn(i / S);
    for (let j = 0; j <= R; j++) {
      const k = i * (R + 1) + j;
      pos.setXYZ(k, P.x + nrm.getX(k) * r, P.y + nrm.getY(k) * r, P.z + nrm.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ canvas helpers
export function mkCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function toTex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function pixels(w, h, fn) {
  const c = mkCanvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = fn(i / w, j / h), k = (j * w + i) * 4; d[k] = p[0]; d[k + 1] = p[1]; d[k + 2] = p[2]; d[k + 3] = p[3] ?? 255; }
  x.putImageData(img, 0, 0);
  return c;
}
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// straight-grained wood, tiling in u and v (grain runs along u)
export function woodTexture({ W = 512, H = 256, seed = 1, dark = [60, 32, 16], light = [126, 74, 38], rings = 18, figure = 0 } = {}) {
  const r = rng(seed), o = r() * 50;
  return toTex(pixels(W, H, (u, v) => {
    // periodic noise: sample on a torus-ish mapping so the texture tiles
    const a = TAU * u, b = TAU * v;
    const n = fbm2(Math.cos(a) * 1.2 + o, Math.sin(a) * 1.2 + v * 0.0 + Math.cos(b) * 2.5, 4) ;
    const g = 0.5 + 0.5 * Math.sin((v * rings + n * 2.2 + fbm2(Math.cos(b) * 3 + o, Math.sin(b) * 3, 3) * 0.8) * TAU);
    const fine = 0.5 + 0.5 * noise2(Math.cos(b) * 40 + o, Math.sin(b) * 40 + u * 0.0);
    const fig = figure ? 0.5 + 0.5 * Math.sin((u * 26 + n * 3) * TAU) : 0.5;
    const k = clamp(0.25 + 0.5 * Math.pow(g, 1.6) + 0.15 * (fine - 0.5) + figure * 0.25 * (fig - 0.5) + 0.25 * n, 0, 1);
    return mix3(dark, light, k);
  }), { repeat: true });
}

// ------------------------------------------------------------------ the violin-family outline
// right half (x, y) in units of body length (y 0 = bottom block, 1 = top); mirrored for the left
const HALF = [
  [0.0, 0.0], [0.09, 0.006], [0.17, 0.026], [0.235, 0.064], [0.275, 0.12], [0.291, 0.19], [0.288, 0.25], [0.274, 0.3],
  [0.258, 0.335], [0.252, 0.352], [0.247, 0.362], [0.226, 0.364], [0.196, 0.372], [0.172, 0.395], [0.159, 0.435], [0.155, 0.48],
  [0.158, 0.525], [0.17, 0.562], [0.192, 0.585], [0.219, 0.594], [0.236, 0.598], [0.236, 0.612], [0.236, 0.64], [0.237, 0.69],
  [0.232, 0.75], [0.216, 0.81], [0.188, 0.866], [0.148, 0.918], [0.1, 0.958], [0.05, 0.985], [0.0, 0.992],
];
export function bodyOutline(n = 72) {
  const right = new THREE.CatmullRomCurve3(HALF.map(([x, y]) => V3(x, y, 0)), false, 'centripetal').getSpacedPoints(Math.round(n / 2));
  const pts = [];
  for (const p of right) pts.push([p.x, p.y]);                      // bottom → top on the right
  for (let i = right.length - 2; i > 0; i--) pts.push([-right[i].x, right[i].y]);   // top → bottom on the left
  return pts;
}
const C0 = [0, 0.5];
// arched plate: rings from the centre to the outline; z = sign * arch(r)
function plateGeometry(outline, L, archH, sign, rings) {
  const N = outline.length, R = rings;
  const pos = [], uv = [], idx = [];
  const arch = (s) => { const k = Math.max(0, 1 - s * s); return archH * (Math.pow(k, 0.85) - 0.12 * Math.max(0, s - 0.86) / 0.14 * 0); };
  pos.push(C0[0] * L, C0[1] * L, sign * arch(0)); uv.push(0.5, 0.5);
  for (let r = 1; r <= R; r++) {
    const s = r / R;
    for (let i = 0; i < N; i++) {
      const [ox, oy] = outline[i];
      const x = C0[0] + (ox - C0[0]) * s, y = C0[1] + (oy - C0[1]) * s;
      // the arch also falls along the length (long arch) — flatter in the waist, recurve at the edge
      const ly = Math.abs(y - 0.5) * 2;
      const z = arch(s) * (1 - 0.25 * ly * ly) + (s > 0.9 ? -archH * 0.08 * Math.sin((s - 0.9) / 0.1 * Math.PI) : 0);
      pos.push(x * L, y * L, sign * z);
      uv.push(x / 0.62 + 0.5, y);
    }
  }
  for (let i = 0; i < N; i++) { const a = 1 + i, b = 1 + ((i + 1) % N); idx.push(0, a, b); }
  for (let r = 1; r < R; r++) for (let i = 0; i < N; i++) {
    const a = 1 + (r - 1) * N + i, b = 1 + (r - 1) * N + ((i + 1) % N), c = 1 + r * N + i, d = 1 + r * N + ((i + 1) % N);
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(sign > 0 ? idx : idx.map((v, i, arr) => arr[i - (i % 3) + (2 - (i % 3))]));
  g.computeVertexNormals();
  return g;
}
function ribGeometry(outline, L, h, inset = 0.004) {
  const N = outline.length, pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const [x, y] = outline[i % N], [px, py] = outline[(i + N - 1) % N];
    if (i) acc += Math.hypot(x - px, y - py);
    const cx = x - Math.sign(x) * inset, cy = y;
    pos.push(cx * L, cy * L, 0, cx * L, cy * L, -h); uv.push(acc * 2, 0, acc * 2, 1);
  }
  for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // outward normals (the outline runs counter-clockwise seen from +z)
  return g;
}

// the varnished plates: spruce top (f-holes, purfling, rosin dust) or flamed maple back
export function plateTexture(kind, { seed = 1, varnish = [118, 46, 14], W = 512, H = 1024 } = {}) {
  const outline = bodyOutline(120);
  const r = rng(seed), o = r() * 100;
  const c = pixels(W, H, (u, v) => {
    const x = (u - 0.5) * 0.62, y = 1 - v;
    if (kind === 'top') {
      // spruce: straight grain, narrower at the centre joint
      const gx = Math.abs(x);
      const g = 0.5 + 0.5 * Math.sin((gx * (190 - gx * 120) + noise2(y * 3 + o, gx * 10) * 0.35) * TAU);
      const late = Math.pow(g, 7);
      const n = fbm2(x * 8 + o, y * 6, 3);
      const base = mix3([176, 98, 38], varnish, 0.55 + 0.25 * n);
      const k = 1 - 0.38 * late;
      // wear: the varnish thinner around the edges and centre (paler)
      return base.map((v2) => clamp(v2 * k * (0.92 + 0.12 * n), 0, 255));
    }
    // flamed maple, book-matched: regular bands across the width, sloping down from the centre joint
    const fx = Math.abs(x);
    const w = y * 46 + fx * 16 + fbm2(fx * 3 + o, y * 2.5, 2) * 0.9;
    const f = 0.5 + 0.5 * Math.sin(w * TAU * 0.5);
    const flame = Math.pow(f, 2.2) * (0.75 + 0.25 * noise2(fx * 12 + o, y * 4));
    const n = fbm2(x * 5 + o, y * 5, 3);
    const base = mix3([120, 56, 20], [196, 124, 54], 0.3 + 0.38 * flame + 0.12 * n);
    return mix3(base, varnish, 0.35);
  });
  const x = c.getContext('2d');
  const P = (px, py) => [(px / 0.62 + 0.5) * W, (1 - py) * H];
  // purfling: dark–light–dark, inset from the edge
  const path = (inset) => {
    x.beginPath();
    outline.forEach(([px, py], i) => {
      const d = Math.hypot(px - C0[0], py - C0[1]);
      const s = Math.max(0, 1 - inset / Math.max(d, 1e-3));
      const [X, Y] = P(C0[0] + (px - C0[0]) * s, C0[1] + (py - C0[1]) * s);
      if (i) x.lineTo(X, Y); else x.moveTo(X, Y);
    });
    x.closePath();
  };
  // edge shading
  x.lineJoin = 'round';
  for (let k = 0; k < 6; k++) { path(0.002 + k * 0.004); x.strokeStyle = `rgba(40,12,4,${0.16 - k * 0.025})`; x.lineWidth = 6; x.stroke(); }
  path(0.021); x.strokeStyle = 'rgba(25,10,5,0.95)'; x.lineWidth = 2.6; x.stroke();
  path(0.021); x.strokeStyle = 'rgba(220,190,140,0.8)'; x.lineWidth = 0.9; x.stroke();
  if (kind === 'top') {
    // f-holes
    const f = (side) => {
      const s = side;
      x.save();
      const [ux, uy] = P(s * 0.115, 0.6), [lx, ly] = P(s * 0.13, 0.37);
      x.strokeStyle = 'rgba(12,5,2,1)'; x.fillStyle = 'rgba(12,5,2,1)'; x.lineCap = 'round';
      x.lineWidth = W * 0.011;
      x.beginPath(); x.moveTo(ux, uy);
      x.bezierCurveTo(ux + s * W * 0.06, uy + H * 0.07, lx - s * W * 0.06, ly - H * 0.07, lx, ly); x.stroke();
      x.lineWidth = W * 0.004;
      x.beginPath(); x.moveTo(ux - s * W * 0.03, uy - H * 0.012); x.quadraticCurveTo(ux - s * W * 0.01, uy - H * 0.004, ux, uy); x.stroke();
      x.beginPath(); x.moveTo(lx + s * W * 0.035, ly + H * 0.012); x.quadraticCurveTo(lx + s * W * 0.012, ly + H * 0.004, lx, ly); x.stroke();
      x.beginPath(); x.arc(ux - s * W * 0.03, uy - H * 0.012, W * 0.012, 0, TAU); x.fill();
      x.beginPath(); x.arc(lx + s * W * 0.035, ly + H * 0.012, W * 0.014, 0, TAU); x.fill();
      // the two notches marking the bridge line
      const [nx, ny] = P(s * 0.115, 0.455);
      x.lineWidth = 2; x.beginPath(); x.moveTo(nx - s * 6, ny); x.lineTo(nx + s * 6, ny); x.stroke();
      x.restore();
    };
    f(1); f(-1);
    // rosin dust under the strings, between bridge and fingerboard
    const [rx, ry] = P(0, 0.52);
    const gr = x.createRadialGradient(rx, ry, 2, rx, ry, W * 0.16);
    gr.addColorStop(0, 'rgba(255,240,215,0.32)'); gr.addColorStop(1, 'rgba(255,240,215,0)');
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
  } else {
    // the centre joint
    const [jx] = P(0, 0); x.strokeStyle = 'rgba(60,20,6,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(jx, 0); x.lineTo(jx, H); x.stroke();
  }
  return toTex(c);
}

// ------------------------------------------------------------------ a violin-family instrument
// Built lying in its own frame: body y 0..L (bottom → top), front +z. Returns
//   { group, strings: [{a, b}] (bridge → nut, local), bridgeY, stringZ(y), mats }
export function stringInstrument({ L = 0.356, rib = 0.031, arch = 0.015, neck = 0.37, kind = 'violin', mats, seed = 1, lite = false }) {
  const g = new THREE.Group();
  const outline = bodyOutline(lite ? 48 : 80);
  const top = new THREE.Mesh(plateGeometry(outline, L, arch, 1, lite ? 5 : 8), mats.top);
  const back = new THREE.Mesh(plateGeometry(outline, L, arch * 0.9, -1, lite ? 4 : 6), mats.back);
  back.position.z = -rib;
  const ribs = new THREE.Mesh(ribGeometry(outline, L, rib), mats.rib);
  top.castShadow = back.castShadow = ribs.castShadow = true;
  g.add(top, back, ribs);
  // neck, fingerboard, pegbox, scroll (heights relative to the top's edge, z = 0)
  const yNut = L * (1 + neck), fbLen = L * 0.76, fbTopZ = (y) => lerp(L * 0.06, L * 0.035, (y - (yNut - fbLen)) / fbLen) + arch * 0.4;
  const fbW0 = L * 0.12, fbW1 = L * 0.065;
  // fingerboard: a tapered slab from the nut down over the body
  {
    const y0 = yNut - fbLen, y1 = yNut, sh = new THREE.Shape();
    sh.moveTo(-fbW0 / 2, y0); sh.lineTo(fbW0 / 2, y0); sh.lineTo(fbW1 / 2, y1); sh.lineTo(-fbW1 / 2, y1); sh.closePath();
    const fg = new THREE.ExtrudeGeometry(sh, { depth: L * 0.016, bevelEnabled: true, bevelThickness: L * 0.004, bevelSize: L * 0.003, bevelSegments: 1, curveSegments: 1 });
    fg.translate(0, 0, 0);
    // tilt so it rises toward the bridge (z grows as y falls)
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + fbTopZ(p.getY(i)) - L * 0.02);
    fg.computeVertexNormals();
    const fb = new THREE.Mesh(fg, mats.ebony); fb.castShadow = true; g.add(fb);
  }
  // neck (maple, rounded) behind the fingerboard
  g.add(new THREE.Mesh(taperTube([[0, L * 0.98, -L * 0.01], [0, (L + yNut) / 2, -L * 0.006], [0, yNut, 0.0]], (u) => lerp(L * 0.06, L * 0.05, u), 8, 10), mats.rib));
  // the heel
  g.add(new THREE.Mesh(rbox(L * 0.09, L * 0.06, L * 0.09, L * 0.02, [0, L * 0.99, -L * 0.03]), mats.rib));
  // pegbox: two cheeks and a back
  const pbL = L * 0.22, pbW = L * 0.075, yPb = yNut + pbL / 2;
  g.add(new THREE.Mesh(merge([
    box(L * 0.012, pbL, L * 0.07, [-pbW / 2, yPb, -L * 0.03], [0.12, 0, 0]),
    box(L * 0.012, pbL, L * 0.07, [pbW / 2, yPb, -L * 0.03], [0.12, 0, 0]),
    box(pbW, pbL, L * 0.012, [0, yPb, -L * 0.07], [0.12, 0, 0]),
    box(pbW + L * 0.012, L * 0.02, L * 0.06, [0, yNut + L * 0.005, -L * 0.02]),
  ]), mats.rib));
  // nut
  g.add(new THREE.Mesh(box(fbW1, L * 0.012, L * 0.012, [0, yNut, fbTopZ(yNut) + L * 0.002]), mats.ebony));
  // scroll: a volute on each side and a centre ridge
  {
    const spiral = (side, rScale) => {
      const pts = [], c = V3(0, yNut + pbL + L * 0.06, -L * 0.075);
      const turns = 1.75, n = lite ? 26 : 44;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * turns * TAU, rr = L * 0.07 * Math.pow(0.42, a / TAU);
        pts.push(V3(side * L * 0.028 * (1 - 0.5 * i / n), c.y + Math.sin(-a + 0.3) * rr * rScale, c.z + Math.cos(-a + 0.3) * rr * rScale));
      }
      return pts;
    };
    const geos = [taperTube(spiral(0, 1), (u) => L * 0.022 * (1 - 0.7 * u) + L * 0.004, lite ? 26 : 48, 8)];
    for (const s of [-1, 1]) geos.push(taperTube(spiral(s, 0.94), (u) => L * 0.014 * (1 - 0.6 * u) + L * 0.003, lite ? 24 : 40, 6));
    const sc = new THREE.Mesh(merge(geos), mats.rib); sc.castShadow = true; g.add(sc);
  }
  // pegs: two on each side, rosewood with a shaped head
  {
    const geos = [];
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, y = yNut + L * (0.045 + i * 0.045), z = -L * 0.035;
      geos.push(cyl(L * 0.008, L * 0.011, L * 0.12, 8, [side * L * 0.06, y, z], [0, 0, Math.PI / 2]));
      const head = new THREE.SphereGeometry(L * 0.03, sg(10), sg(6)); head.scale(0.32, 1, 0.75);
      geos.push(bake(head, [side * L * 0.135, y, z]));
      geos.push(cyl(L * 0.014, L * 0.014, L * 0.012, 8, [side * L * 0.107, y, z], [0, 0, Math.PI / 2]));
    }
    g.add(new THREE.Mesh(merge(geos), mats.ebony));
  }
  // bridge: a carved maple outline with heart and kidneys (an extrusion with holes)
  const bridgeY = L * 0.455, bridgeH = L * (kind === 'cello' ? 0.12 : 0.093), bW = L * (kind === 'cello' ? 0.125 : 0.115);
  {
    const sh = new THREE.Shape();
    sh.moveTo(-bW / 2, 0); sh.lineTo(-bW * 0.28, 0); sh.quadraticCurveTo(0, bridgeH * 0.32, bW * 0.28, 0); sh.lineTo(bW / 2, 0);
    sh.quadraticCurveTo(bW * 0.36, bridgeH * 0.45, bW * 0.42, bridgeH * 0.8);
    sh.quadraticCurveTo(0, bridgeH * 1.08, -bW * 0.42, bridgeH * 0.8);
    sh.quadraticCurveTo(-bW * 0.36, bridgeH * 0.45, -bW / 2, 0);
    const heart = new THREE.Path(); heart.absellipse(0, bridgeH * 0.58, bW * 0.05, bridgeH * 0.07, 0, TAU, false); sh.holes.push(heart);
    for (const s of [-1, 1]) { const k = new THREE.Path(); k.absellipse(s * bW * 0.2, bridgeH * 0.42, bW * 0.035, bridgeH * 0.1, 0, TAU, false); sh.holes.push(k); }
    const bg = new THREE.ExtrudeGeometry(sh, { depth: L * 0.006, bevelEnabled: false, curveSegments: lite ? 4 : 8 });
    // shape y (height) → +z out of the top; extrusion depth → along the strings
    bg.rotateX(Math.PI / 2); bg.translate(0, bridgeY + L * 0.003, arch * 0.92);
    const br = new THREE.Mesh(bg, mats.bridge); br.castShadow = true; g.add(br);
  }
  // tailpiece + saddle + endpin button
  {
    const sh = new THREE.Shape(), w0 = L * 0.05, w1 = L * 0.085, y0 = L * 0.02, y1 = L * 0.33;
    sh.moveTo(-w0 / 2, y0); sh.lineTo(w0 / 2, y0); sh.lineTo(w1 / 2, y1); sh.quadraticCurveTo(0, y1 + L * 0.015, -w1 / 2, y1); sh.closePath();
    const tg = new THREE.ExtrudeGeometry(sh, { depth: L * 0.012, bevelEnabled: true, bevelThickness: L * 0.004, bevelSize: L * 0.004, bevelSegments: 1, curveSegments: 4 });
    const p = tg.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + lerp(L * 0.008, arch + L * 0.03, (p.getY(i) - y0) / (y1 - y0)));
    tg.computeVertexNormals();
    const tp = new THREE.Mesh(tg, mats.ebony); tp.castShadow = true; g.add(tp);
    g.add(new THREE.Mesh(box(L * 0.06, L * 0.01, L * 0.012, [0, L * 0.004, -L * 0.002]), mats.ebony));
  }
  // strings: bridge top → nut, spread across the bridge's arc
  const strings = [];
  const spreadB = bW * 0.68, spreadN = fbW1 * 0.75, archR = bW * 0.9;
  for (let i = 0; i < 4; i++) {
    const u = (i - 1.5) / 1.5;
    const xb = u * spreadB / 2, zb = arch * 0.92 + bridgeH * 0.98 - (xb * xb) / (2 * archR);
    const a = V3(xb, bridgeY, zb + L * 0.003), b = V3(u * spreadN / 2, yNut, fbTopZ(yNut) + L * 0.006);
    const tail = V3(u * L * 0.022, L * 0.3, arch + L * 0.045);
    strings.push({ a, b, tail, angle: Math.atan2(xb, archR) });
  }
  const sGeos = [];
  strings.forEach((s, i) => { const r = L * (0.0016 + (3 - i) * 0.0004); sGeos.push(rod(s.a, s.b, r, 4), rod(s.tail, s.a, r, 4)); });
  g.add(new THREE.Mesh(merge(sGeos), mats.string));
  return { group: g, strings, bridgeY, bridgeTopZ: arch * 0.92 + bridgeH, yNut, L, archR, rib };
}

// the vibrating strings: a lens-shaped blur between bridge and nut (additive), width per string from aAmp
export function stringBlur(strings, L, color = '#ffcf8a') {
  const n = strings.length, segs = 24;
  const pos = [], side = [], along = [], sid = [];
  strings.forEach((s, k) => {
    for (let i = 0; i <= segs; i++) {
      const u = i / segs, p = s.a.clone().lerp(s.b, u);
      for (const sd of [-1, 1]) { pos.push(p.x, p.y, p.z + L * 0.002); side.push(sd); along.push(u); sid.push(k); }
    }
  });
  const idx = [];
  for (let k = 0; k < n; k++) for (let i = 0; i < segs; i++) { const a = (k * (segs + 1) + i) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(sid, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uAmp: { value: new THREE.Vector4() }, uColor: { value: new THREE.Color(color) }, uW: { value: L * 0.012 }, uT: { value: 0 } },
    vertexShader: /* glsl */ `attribute float aSide, aU, aS; uniform vec4 uAmp; uniform float uW, uT; varying float vSide; varying float vA; varying float vU;
      void main(){ float a = aS < 0.5 ? uAmp.x : aS < 1.5 ? uAmp.y : aS < 2.5 ? uAmp.z : uAmp.w;
        float env = sin(3.14159 * aU); vA = a; vSide = aSide; vU = aU;
        vec3 p = position; p.x += aSide * (uW * 0.18 + uW * a * env);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uT; varying float vSide; varying float vA; varying float vU;
      void main(){ float edge = 1.0 - abs(vSide); float core = pow(edge, 0.6);
        float stand = 0.75 + 0.25 * sin(vU * 40.0 + uT * 60.0);
        float a = vA * core * stand; if (a < 0.002) discard; gl_FragColor = vec4(uColor * a * 1.5, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// a bow: stick (cambered), frog, tip, hair. Local frame: hair along +x from frog (x 0) to tip (x len), hair at y 0
export function bow({ len = 0.73, mats, lite = false }) {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(V3(u * len, 0.022 + 0.012 * Math.sin(Math.PI * u) * -1 + 0.012 + u * 0.004, 0)); }
  const stick = new THREE.Mesh(taperTube(pts, (u) => lerp(0.0043, 0.0028, u), lite ? 16 : 32, 6), mats.bowStick);
  stick.castShadow = true;
  const frog = new THREE.Mesh(merge([
    rbox(0.05, 0.022, 0.012, 0.004, [0.03, 0.012, 0]),
    box(0.04, 0.004, 0.0125, [0.03, 0.002, 0]),
  ]), mats.ebony);
  const eye = new THREE.Mesh(cyl(0.0035, 0.0035, 0.0128, 10, [0.032, 0.013, 0], [Math.PI / 2, 0, 0]), mats.pearl);
  const button = new THREE.Mesh(cyl(0.0042, 0.0042, 0.02, 8, [-0.006, 0.024, 0], [0, 0, Math.PI / 2]), mats.silver);
  const tip = new THREE.Mesh(merge([box(0.012, 0.03, 0.009, [len, 0.016, 0]), box(0.004, 0.03, 0.0092, [len - 0.006, 0.016, 0])]), mats.ivory);
  const hair = new THREE.Mesh(box(len - 0.05, 0.0012, 0.011, [0.05 + (len - 0.05) / 2 - 0.006, 0.0, 0]), mats.hair);
  g.add(stick, frog, eye, button, tip, hair);
  return g;
}

// ------------------------------------------------------------------ manuscripts
// Stylised staff notation drawn with the pen: staves, clefs, key signature, beamed groups. Returns
// { texture, notes: [[u, v] …] } — the lit notes' head centres in UV (v up) for the glow overlay.
export function manuscript(kind, { W = 1024, H = 1400, seed = 3 } = {}) {
  const c = mkCanvas(W, H), x = c.getContext('2d'), r = rng(seed);
  // paper: warm laid paper, foxing, darker edges
  const img = pixels(W >> 2, H >> 2, (u, v) => {
    const n = fbm2(u * 6 + seed, v * 8, 4), e = Math.min(u, 1 - u, v, 1 - v);
    const k = 0.86 + 0.1 * n - 0.25 * Math.pow(1 - clamp(e * 9, 0, 1), 2);
    return [236 * k, 214 * k, 170 * k];
  });
  x.imageSmoothingEnabled = true; x.drawImage(img, 0, 0, W, H);
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(150,96,40,${0.03 + r() * 0.05})`; x.beginPath(); x.arc(r() * W, r() * H, 2 + r() * 14, 0, TAU); x.fill(); }
  for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(120,90,50,0.08)'; x.fillRect(0, (i / 120) * H, W, 1); }   // laid lines
  const ink = 'rgba(46,26,12,0.92)', inkF = 'rgba(46,26,12,0.55)';
  const S = W * 0.0125;                     // staff space
  const left = W * 0.08, right = W * 0.93;
  const notes = [];
  const staff = (yb, alpha = 1) => {
    x.strokeStyle = `rgba(52,30,14,${0.7 * alpha})`; x.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) { x.beginPath(); const y = yb - i * S; x.moveTo(left, y + (r() - 0.5)); x.bezierCurveTo(W * 0.4, y + (r() - 0.5) * 2, W * 0.7, y + (r() - 0.5) * 2, right, y + (r() - 0.5)); x.stroke(); }
    x.beginPath(); x.moveTo(left, yb); x.lineTo(left, yb - 4 * S); x.moveTo(right, yb); x.lineTo(right, yb - 4 * S); x.stroke();
  };
  const clef = (type, yb) => {
    x.strokeStyle = ink; x.fillStyle = ink; x.lineWidth = S * 0.22; x.lineCap = 'round';
    const cx = left + S * 1.4;
    if (type === 'bass') {
      x.beginPath(); x.arc(cx + S * 0.3, yb - 3 * S, S * 0.95, Math.PI * 1.05, Math.PI * 0.05, false);
      x.quadraticCurveTo(cx + S * 1.2, yb - 1.2 * S, cx - S * 0.5, yb - 0.2 * S); x.stroke();
      x.beginPath(); x.arc(cx - S * 0.45, yb - 3 * S, S * 0.32, 0, TAU); x.fill();
      for (const d of [2.5, 3.5]) { x.beginPath(); x.arc(cx + S * 1.65, yb - d * S, S * 0.17, 0, TAU); x.fill(); }
    } else {
      // treble: a spiral round the G line, a tall loop, a tail
      x.beginPath();
      const gy = yb - S;
      x.moveTo(cx + S * 0.2, gy + S * 0.4);
      x.bezierCurveTo(cx - S * 0.9, gy + S * 0.2, cx - S * 0.6, gy - S * 1.4, cx + S * 0.4, gy - S * 1.2);
      x.bezierCurveTo(cx + S * 1.5, gy - S * 0.8, cx + S * 1.0, gy + S * 0.9, cx - S * 0.2, gy + S * 0.8);
      x.bezierCurveTo(cx - S * 1.6, gy + S * 0.5, cx - S * 1.0, gy - S * 2.2, cx + S * 0.2, gy - S * 3.4);
      x.bezierCurveTo(cx + S * 1.0, gy - S * 4.4, cx + S * 0.9, gy - S * 5.6, cx + S * 0.35, gy - S * 5.2);
      x.bezierCurveTo(cx - S * 0.2, gy - S * 4.6, cx + S * 0.3, gy - S * 1.0, cx + S * 0.6, gy + S * 1.6);
      x.stroke();
      x.beginPath(); x.arc(cx + S * 0.1, gy + S * 1.7, S * 0.3, 0, TAU); x.fill();
    }
  };
  const sharp = (cx, y) => {
    x.strokeStyle = ink; x.lineWidth = S * 0.12;
    x.beginPath(); x.moveTo(cx - S * 0.18, y - S * 1.1); x.lineTo(cx - S * 0.18, y + S * 1.0); x.moveTo(cx + S * 0.18, y - S * 1.0); x.lineTo(cx + S * 0.18, y + S * 1.1); x.stroke();
    x.lineWidth = S * 0.26;
    x.beginPath(); x.moveTo(cx - S * 0.42, y - S * 0.25); x.lineTo(cx + S * 0.42, y - S * 0.45); x.moveTo(cx - S * 0.42, y + S * 0.42); x.lineTo(cx + S * 0.42, y + S * 0.22); x.stroke();
  };
  const head = (cx, y, filled = true) => {
    x.save(); x.translate(cx, y); x.rotate(-0.35); x.beginPath(); x.ellipse(0, 0, S * 0.62, S * 0.44, 0, 0, TAU);
    if (filled) { x.fillStyle = ink; x.fill(); } else { x.strokeStyle = ink; x.lineWidth = S * 0.16; x.stroke(); }
    x.restore();
  };
  const ledger = (cx, pos, yb) => {
    x.strokeStyle = ink; x.lineWidth = 1.4;
    for (let p = -2; p >= pos; p -= 2) { x.beginPath(); x.moveTo(cx - S * 0.95, yb - p * S / 2); x.lineTo(cx + S * 0.95, yb - p * S / 2); x.stroke(); }
    for (let p = 10; p <= pos; p += 2) { x.beginPath(); x.moveTo(cx - S * 0.95, yb - p * S / 2); x.lineTo(cx + S * 0.95, yb - p * S / 2); x.stroke(); }
  };
  // groups: [{ pos: [...], beams: 0|1|2, lit: [bool], dx }] drawn left → right from x0; returns x end
  const group = (x0, yb, posArr, { beams = 2, dx = S * 2.6, lit = false, stems = true, filled = true } = {}) => {
    const avg = posArr.reduce((a, b) => a + b, 0) / posArr.length, up = avg < 4;
    const ys = posArr.map((p) => yb - (p * S) / 2), xs = posArr.map((_, i) => x0 + i * dx);
    const tipY = up ? Math.min(...ys) - S * 3.3 : Math.max(...ys) + S * 3.3;
    posArr.forEach((p, i) => {
      ledger(xs[i], p, yb); head(xs[i], ys[i], filled);
      if (lit) notes.push([xs[i] / W, 1 - ys[i] / H]);
      if (stems) {
        const sx = xs[i] + (up ? S * 0.56 : -S * 0.56);
        x.strokeStyle = ink; x.lineWidth = S * 0.13;
        x.beginPath(); x.moveTo(sx, ys[i] + (up ? -S * 0.2 : S * 0.2)); x.lineTo(sx, posArr.length > 1 && beams ? tipY : (up ? ys[i] - S * 3.3 : ys[i] + S * 3.3)); x.stroke();
        if (posArr.length === 1 && beams) {   // a flag
          x.lineWidth = S * 0.22; x.beginPath(); const fy = up ? ys[i] - S * 3.3 : ys[i] + S * 3.3;
          x.moveTo(sx, fy); x.quadraticCurveTo(sx + S * 1.0, fy + (up ? S * 1.2 : -S * 1.2), sx + S * 0.6, fy + (up ? S * 2.4 : -S * 2.4)); x.stroke();
        }
      }
    });
    if (posArr.length > 1 && beams) {
      const sx0 = xs[0] + (up ? S * 0.56 : -S * 0.56), sx1 = xs[xs.length - 1] + (up ? S * 0.56 : -S * 0.56);
      x.fillStyle = ink;
      for (let b = 0; b < beams; b++) { const y = tipY + (up ? b : -b) * S * 0.75; x.beginPath(); x.moveTo(sx0, y - S * 0.22); x.lineTo(sx1, y - S * 0.22); x.lineTo(sx1, y + S * 0.22); x.lineTo(sx0, y + S * 0.22); x.closePath(); x.fill(); }
    }
    return x0 + posArr.length * dx;
  };
  const rest8 = (cx, yb) => { x.fillStyle = ink; x.beginPath(); x.arc(cx - S * 0.2, yb - S * 2.4, S * 0.25, 0, TAU); x.fill(); x.strokeStyle = ink; x.lineWidth = S * 0.16; x.beginPath(); x.moveTo(cx - S * 0.2, yb - S * 2.2); x.quadraticCurveTo(cx + S * 0.3, yb - S * 2.0, cx + S * 0.5, yb - S * 2.6); x.lineTo(cx - S * 0.1, yb - S * 0.6); x.stroke(); };
  const bar = (cx, yb) => { x.strokeStyle = ink; x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx, yb); x.lineTo(cx, yb - 4 * S); x.stroke(); };
  const commonTime = (cx, yb) => { x.fillStyle = ink; x.font = `600 ${S * 3.2}px "${FONTS.serif}"`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('C', cx, yb - 2 * S); };
  const title = (t, sub) => {
    x.fillStyle = 'rgba(46,26,12,0.9)'; x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = `italic 500 ${W * 0.05}px "${FONTS.serif}"`; x.fillText(t, W / 2, H * 0.085);
    if (sub) { x.font = `italic 400 ${W * 0.026}px "${FONTS.serif}"`; x.fillText(sub, W * 0.2, H * 0.135); }
  };
  // filler: faint plausible later staves (stepwise figures) so the page reads as a page
  const filler = (y0, n, clefType, keyS) => {
    for (let s = 0; s < n; s++) {
      const yb = y0 + s * S * 11;
      if (yb > H * 0.95) break;
      staff(yb, 0.8); clef(clefType, yb);
      keyS.forEach((p, i) => sharp(left + S * 3.6 + i * S * 1.0, yb - (p * S) / 2));
      let cx = left + S * 6;
      let p0 = 2 + Math.floor(r() * 4);
      while (cx < right - S * 8) {
        const k = 4, arr = [];
        for (let i = 0; i < k; i++) { p0 = clamp(p0 + Math.round((r() - 0.5) * 5), -1, 10); arr.push(p0); }
        cx = group(cx, yb, arr, { beams: r() < 0.6 ? 2 : 1, dx: S * 2.4 }) + S * 0.6;
        if (r() < 0.25) { bar(cx - S * 0.5, yb); cx += S * 0.9; }
      }
    }
  };
  const keyD = (yb, clefType) => {   // two sharps: F# and C#
    const ps = clefType === 'bass' ? [6, 3] : [8, 5];
    ps.forEach((p, i) => sharp(left + S * 3.6 + i * S * 1.0, yb - (p * S) / 2));
  };
  if (kind === 'bach') {
    title('Prélude', 'Suite I'); x.textAlign = 'left';
    const yb = H * 0.26; staff(yb); clef('bass', yb); keyD(yb, 'bass'); commonTime(left + S * 6.3, yb);
    // bar 1 lit (D3 A3 F#4 E4 F#4 A3 F#4 A3), bar 2 lit (D3 B3 G4 F#4 G4 B3 G4 B3), bar 3 in ink
    const bars = [[4, 8, 13, 12, 13, 8, 13, 8], [4, 9, 14, 13, 14, 9, 14, 9], [4, 10, 14, 13, 14, 10, 14, 10]];
    let cx = left + S * 8.2;
    bars.forEach((b, bi) => {
      cx = group(cx, yb, b.slice(0, 4), { lit: bi < 2, dx: S * 1.85 }) + S * 0.35; cx = group(cx, yb, b.slice(4), { lit: bi < 2, dx: S * 1.85 }) + S * 0.35;
      bar(cx - S * 0.2, yb); cx += S * 0.8;
    });
    filler(yb + S * 12, 8, 'bass', [6, 3]);
  } else if (kind === 'mozart') {
    title('Allegro', 'Violino I');
    const yb = H * 0.26; staff(yb); clef('treble', yb); keyD(yb, 'treble'); commonTime(left + S * 6.3, yb);
    // D5 · A4 D5 · A4 D5 A4 D5 F#5 | A5
    let cx = left + S * 8.4;
    cx = group(cx, yb, [6], { beams: 0, lit: true, dx: S * 3.2 });
    rest8(cx, yb); cx += S * 2.0;
    cx = group(cx, yb, [3], { beams: 1, lit: true, dx: S * 3 });
    cx = group(cx, yb, [6], { beams: 0, lit: true, dx: S * 3.2 });
    rest8(cx, yb); cx += S * 2.0;
    cx = group(cx, yb, [3], { beams: 1, lit: true, dx: S * 3 });
    bar(cx, yb); cx += S * 1.4;
    cx = group(cx, yb, [6, 3, 6, 8], { beams: 1, lit: true, dx: S * 2.6 });
    cx = group(cx, yb, [10], { beams: 0, lit: true, dx: S * 3.2 });
    rest8(cx, yb); cx += S * 2.4;
    bar(cx, yb);
    filler(yb + S * 12, 8, 'treble', [8, 5]);
  } else {
    title('Allegro assai', 'Finale · Bassi');
    const yb = H * 0.26; staff(yb); clef('treble', yb); keyD(yb, 'treble'); commonTime(left + S * 6.3, yb);
    // F# F# G A | A G F# E | D D E F# | F#. E E   (D major)
    const tune = [[1, 1, 2, 3], [3, 2, 1, 0], [-1, -1, 0, 1]];
    let cx = left + S * 8.4;
    tune.forEach((b) => {
      b.forEach((p) => { cx = group(cx, yb, [p], { beams: 0, lit: true, dx: S * 3.6 }); });
      bar(cx - S * 0.8, yb); cx += S * 0.6;
    });
    // the last bar: a dotted quarter, an eighth, a half note
    const dotX = cx + S * 1.0;
    cx = group(cx, yb, [1], { beams: 0, lit: true, dx: S * 4.4 });
    x.fillStyle = ink; x.beginPath(); x.arc(dotX, yb - S * 0.5 - S * 0.5, S * 0.2, 0, TAU); x.fill();
    cx = group(cx, yb, [0], { beams: 1, lit: true, dx: S * 3.4 });
    cx = group(cx, yb, [0], { beams: 0, lit: true, dx: S * 4.4, filled: false });
    bar(cx - S * 0.8, yb);
    filler(yb + S * 12, 8, 'treble', [8, 5]);
  }
  return { texture: toTex(c), notes, aspect: W / H };
}

// ------------------------------------------------------------------ keyboards
const isBlack = (n) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
// Keyboard instrument. Local frame: keyboard front edge at z = 0 (keys run to +z), case behind (−z),
// bass at −x. Returns the group and an animate(t, notes) hook data.
export function keyboardInstrument({ lo, hi, octW = 0.16, length = 2.2, caseH = 0.26, height = 0.78, mats, reversed = false, legs = 'square', lite = false, lidAngle = 0.55 }) {
  const g = new THREE.Group();
  const whites = []; for (let n = lo; n <= hi; n++) if (!isBlack(n)) whites.push(n);
  const ww = octW / 7, KW = whites.length * ww, x0 = -KW / 2;
  const keyX = (n) => {
    if (!isBlack(n)) return x0 + (whites.indexOf(n) + 0.5) * ww;
    return x0 + (whites.indexOf(n - 1) + 1) * ww;
  };
  const cheek = 0.04, X0 = x0 - cheek - 0.02, X1 = -x0 + cheek + 0.02;   // case width
  const zF = -0.02;                      // case front (the keys run forward from here)
  const strLen = (n) => lerp(length - 0.12, 0.28, Math.pow((n - lo) / (hi - lo), 0.8));
  // case outline (x, z): straight bass side, tail, bentside following the string lengths
  const outline = [[X0, zF], [X1, zF]];
  const N = lite ? 10 : 18;
  for (let i = 0; i <= N; i++) {
    const u = 1 - i / N, n = lerp(lo, hi, u), x = Math.min(X1, keyX(Math.round(n)) + 0.03);
    outline.push([lerp(X1, x, i === 0 ? 0 : 1), zF - 0.12 - strLen(n) - 0.04]);
  }
  outline.push([X0, zF - 0.12 - strLen(lo) - 0.06]);
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  // walls with a hollow (offset the outline inward)
  const inner = offsetPoly(outline, 0.022);
  const hole = new THREE.Path(inner.map(([x, z]) => new THREE.Vector2(x, -z)).reverse());
  const wallShape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z))); wallShape.holes.push(hole);
  const yBot = height - caseH;
  const walls = new THREE.ExtrudeGeometry(wallShape, { depth: caseH, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 4 });
  walls.rotateX(-Math.PI / 2); walls.translate(0, yBot, 0);
  uvWorld(walls, 2.5);
  const caseM = new THREE.Mesh(walls, mats.case); caseM.castShadow = true; caseM.receiveShadow = true; g.add(caseM);
  // bottom
  const bot = new THREE.ShapeGeometry(shape, 4); bot.rotateX(-Math.PI / 2); bot.translate(0, yBot + 0.01, 0);
  g.add(new THREE.Mesh(bot, mats.caseDark));
  // soundboard with strings, bridge, pins (one canvas)
  const sb = new THREE.ShapeGeometry(new THREE.Shape(inner.map(([x, z]) => new THREE.Vector2(x, -z))), 4);
  sb.rotateX(-Math.PI / 2);
  const zMin = Math.min(...outline.map((p) => p[1])), sbY = height - 0.07;
  sb.translate(0, sbY, 0);
  {
    const p = sb.attributes.position, uv = sb.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - X0) / (X1 - X0), (p.getZ(i) - zMin) / (zF - zMin));
  }
  const sbTex = soundboardTexture({ lo, hi, keyX, X0, X1, zMin, zF, strLen, reversed });
  const sbMat = new THREE.MeshStandardMaterial({ map: sbTex, roughness: 0.55, metalness: 0.15 });
  g.add(new THREE.Mesh(sb, sbMat));
  // keybed + key slip + cheeks
  const keyLen = reversed ? 0.12 : 0.145, kz = 0.02;
  g.add(new THREE.Mesh(merge([
    box(X1 - X0, 0.05, keyLen + 0.06, [(X0 + X1) / 2, height - caseH + 0.02, zF + (keyLen + 0.06) / 2 - 0.02]),
    rbox(cheek, 0.07, keyLen + 0.05, 0.008, [x0 - cheek / 2 - 0.004, height - 0.035, zF + (keyLen + 0.05) / 2]),
    rbox(cheek, 0.07, keyLen + 0.05, 0.008, [-x0 + cheek / 2 + 0.004, height - 0.035, zF + (keyLen + 0.05) / 2]),
    box(KW + 0.01, 0.03, 0.012, [0, height - 0.075, zF + keyLen + 0.035]),
  ]), mats.case));
  // nameboard + music desk (the desk holds the score)
  g.add(new THREE.Mesh(merge([
    box(KW, 0.035, 0.012, [0, height - 0.04, zF - 0.012]),
  ]), mats.caseDark));
  // keys (instanced)
  const yKey = height - 0.06;
  const wGeo = rbox(ww * 0.93, 0.02, keyLen, 0.002); wGeo.translate(0, 0, keyLen / 2);
  const bGeo = rbox(ww * 0.55, 0.022, keyLen * 0.6, 0.003); bGeo.translate(0, 0, keyLen * 0.3);
  const kW = new THREE.InstancedMesh(wGeo, reversed ? mats.ebony : mats.ivory, whites.length);
  const blacks = []; for (let n = lo; n <= hi; n++) if (isBlack(n)) blacks.push(n);
  const kB = new THREE.InstancedMesh(bGeo, reversed ? mats.ivory : mats.ebony, blacks.length);
  kW.castShadow = kB.castShadow = false; kW.receiveShadow = kB.receiveShadow = true;
  g.add(kW, kB);
  // hammers (instanced): leather-covered heads on shanks, poking up just behind the nameboard
  const hGeo = merge([cyl(0.0022, 0.0022, 0.05, 5, [0, -0.025, 0]), rbox(ww * 0.78, 0.022, 0.016, 0.005, [0, 0.006, 0])]);
  const hm = new THREE.InstancedMesh(hGeo, mats.leather, hi - lo + 1);
  g.add(hm);
  const zHam = zF - 0.07, yHam = sbY + 0.012;
  const _o = new THREE.Object3D();
  const keyIndex = (n) => (isBlack(n) ? blacks.indexOf(n) : whites.indexOf(n));
  function pose(n, down, ham) {
    // key: pivot dip at the front; hammer: rises by ham (0..1) into the strings
    _o.position.set(keyX(n), yKey + (isBlack(n) ? 0.018 : 0) - down * 0.009, zF + kz * 0);
    _o.rotation.set(down * 0.06, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix();
    (isBlack(n) ? kB : kW).setMatrixAt(keyIndex(n), _o.matrix);
    _o.position.set(keyX(n), yHam - 0.012 + ham * 0.06, zHam - (isBlack(n) ? 0.006 : 0)); _o.rotation.set(-0.25 * ham, 0, 0); _o.updateMatrix();
    hm.setMatrixAt(n - lo, _o.matrix);
  }
  for (let n = lo; n <= hi; n++) pose(n, 0, 0);
  // per-note string glow (instanced quads along each played string; colour = amplitude)
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  // lid (propped open on the treble side) + prop stick
  const zCut = zF - 0.3;   // the lid starts behind the music desk (its front flap folded away)
  const lidOutline = [[X0, zCut], [X1, zCut], ...outline.slice(2)];
  const lidG = new THREE.ExtrudeGeometry(new THREE.Shape(lidOutline.map(([x, z]) => new THREE.Vector2(x - X0, -z))), { depth: 0.014, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1, curveSegments: 4 });
  lidG.rotateX(-Math.PI / 2); uvWorld(lidG, 2.5);
  const lid = new THREE.Mesh(lidG, mats.case); lid.castShadow = true;
  const lidPivot = new THREE.Group(); lidPivot.position.set(X0, height + 0.006, 0); lidPivot.rotation.z = lidAngle; lidPivot.add(lid);
  g.add(lidPivot);
  if (lidAngle > 0.01) {
    const zp = zF - 0.75, tipX = X0 + (X1 - X0) * 0.9;
    const a = V3(tipX - 0.08, height, zp), b = V3(X0 + Math.cos(lidAngle) * (tipX - X0), height + Math.sin(lidAngle) * (tipX - X0), zp);
    g.add(new THREE.Mesh(rod(a, b, 0.009, 6), mats.case));
  }
  // legs
  const legGeos = [];
  const legAt = [[X0 + 0.07, zF - 0.05], [X1 - 0.07, zF - 0.05], [X0 + 0.1, zMin + 0.12]];
  if (legs === 'square') legAt.push([(X0 + X1) / 2 - 0.05, zMin + 0.35 + 0.0], [X0 + 0.12, (zF + zMin) / 2]);
  for (const [lx, lz] of legAt) {
    if (legs === 'square') legGeos.push(bake(new THREE.CylinderGeometry(0.018, 0.034, yBot, 4, 1).rotateY(Math.PI / 4), [lx, yBot / 2, lz]), box(0.08, 0.04, 0.08, [lx, yBot - 0.02, lz]));
    else legGeos.push(bake(lathe([[0.012, 0], [0.02, 0.01], [0.022, 0.03], [0.03, 0.05], [0.026, 0.09], [0.034, 0.2], [0.05, 0.42], [0.042, 0.47], [0.06, 0.5], [0.062, 0.54], [0.05, 0.56], [0.055, yBot]], 14), [lx, 0, lz]));
  }
  const legM = new THREE.Mesh(merge(legGeos), mats.case); legM.castShadow = true; g.add(legM);
  if (legs !== 'square') g.add(new THREE.Mesh(merge(legAt.map(([lx, lz]) => cyl(0.016, 0.016, 0.02, 8, [lx, 0.008, lz], [Math.PI / 2, 0, 0]))), mats.brass));
  // a moulding round the top of the case (ebony on the fortepiano, a brass bead on the grand) and one round the
  // bottom edge
  if (mats.trim) {
    const loop = (y, r) => { const pts = outline.map(([x, z]) => V3(x, y, z)); pts.push(pts[0].clone()); return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05), sg(160, 60), r, 5, false); };
    g.add(new THREE.Mesh(merge([loop(height + 0.004, 0.006), loop(yBot + 0.03, 0.005)]), mats.trim));
  }
  return { group: g, keyX, pose, kW, kB, hm, X0, X1, zF, zMin, height, sbY, zHam, yHam, strLen, KW, lid, lidPivot, glowGeo, glowMat, deskZ: zF - 0.06, keyLen };
}
function offsetPoly(poly, d) {
  const n = poly.length, out = [];
  // signed area → orientation
  let A = 0; for (let i = 0; i < n; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % n]; A += x1 * y2 - x2 * y1; }
  const s = A > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = poly[(i + n - 1) % n], [bx, by] = poly[i], [cx, cy] = poly[(i + 1) % n];
    const n1 = norm2(by - ay, -(bx - ax)), n2 = norm2(cy - by, -(cx - bx));
    let nx = n1[0] + n2[0], ny = n1[1] + n2[1]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const cos = Math.max(0.4, nx * n1[0] + ny * n1[1]);
    out.push([bx - s * nx * d / cos, by - s * ny * d / cos]);
  }
  return out;
}
const norm2 = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
// box-projected UVs in world units (so wood grain keeps its scale on every face)
export function uvWorld(g, k = 1) {
  const p = g.attributes.position; g.computeVertexNormals(); const nn = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(nn.getX(i)), ay = Math.abs(nn.getY(i)), az = Math.abs(nn.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * k; uv[i * 2 + 1] = v * k * 4;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function soundboardTexture({ lo, hi, keyX, X0, X1, zMin, zF, strLen, reversed }) {
  const W = 1024, H = 1024, c = mkCanvas(W, H), x = c.getContext('2d');
  const U = (px) => ((px - X0) / (X1 - X0)) * W, Vz = (z) => (1 - (z - zMin) / (zF - zMin)) * H;
  // spruce soundboard
  const img = pixels(256, 256, (u, v) => { const g = 0.5 + 0.5 * Math.sin((u * 60 + fbm2(u * 4, v * 2, 3) * 1.5) * TAU); const n = fbm2(u * 3, v * 3, 3); return mix3([150, 96, 46], [212, 160, 98], 0.45 + 0.3 * n - 0.25 * Math.pow(g, 6)); });
  x.drawImage(img, 0, 0, W, H);
  // wrest plank (front) darker
  x.fillStyle = 'rgba(70,36,16,0.9)'; x.fillRect(0, Vz(zF) - H * 0.07, W, H * 0.07);
  // bridge: a curve following the string ends
  x.strokeStyle = 'rgba(70,34,14,0.95)'; x.lineWidth = 7; x.beginPath();
  for (let n = lo; n <= hi; n++) { const px = U(keyX(n)), pz = Vz(zF - 0.12 - strLen(n) + 0.05); if (n === lo) x.moveTo(px, pz); else x.lineTo(px, pz); }
  x.stroke();
  // strings: brass in the bass, iron above; tuning pins at the front, hitch pins at the back
  for (let n = lo; n <= hi; n++) {
    const px = U(keyX(n)), zs = Vz(zF - 0.045), ze = Vz(zF - 0.12 - strLen(n));
    const brass = n < lo + 18;
    const k = n < lo + 10 ? 1 : 2;
    for (let s = 0; s < k; s++) {
      const dx = (s - (k - 1) / 2) * 2.2;
      x.strokeStyle = brass ? 'rgba(232,180,100,0.95)' : 'rgba(228,226,220,0.95)'; x.lineWidth = brass ? 1.6 : 1.1;
      x.beginPath(); x.moveTo(px + dx, zs); x.lineTo(px + dx, ze); x.stroke();
      x.fillStyle = 'rgba(200,200,205,1)'; x.beginPath(); x.arc(px + dx, zs + 6 + (n % 2) * 8, 2.4, 0, TAU); x.fill();
      x.fillStyle = 'rgba(40,30,20,1)'; x.beginPath(); x.arc(px + dx, ze - 4, 1.6, 0, TAU); x.fill();
    }
  }
  // dampers' felt line (a dark band behind the strike line)
  x.fillStyle = 'rgba(30,22,16,0.55)'; x.fillRect(0, Vz(zF - 0.1) , W, H * 0.012);
  return toTex(c);
}

// ------------------------------------------------------------------ the organ façade
// Pipes in towers and flats, a carved case with cornices and gilt pipe-shades. Local: centred on x = 0,
// front at z = 0, floor at y = 0. Returns { group, pipes (InstancedMesh), glow }.
export function organFacade({ mats, lite = false, width = 4.2, height = 5.0 }) {
  const g = new THREE.Group();
  const flats = [   // [centre x, base y, n pipes, tallest, shortest, radius, z]
    [-1.65, 1.6, 5, 2.6, 2.0, 0.07, 0.15],
    [-0.92, 1.9, lite ? 7 : 9, 1.3, 2.0, 0.045, 0.0],
    [0, 1.6, 5, 2.9, 2.2, 0.08, 0.2],
    [0.92, 1.9, lite ? 7 : 9, 2.0, 1.3, 0.045, 0.0],
    [1.65, 1.6, 5, 2.0, 2.6, 0.07, 0.15],
  ];
  const list = [];
  for (const [cx, by, n, t0, t1, rr, z] of flats) {
    const span = n * rr * 2.25;
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? i / (n - 1) : 0.5;
      const tower = Math.abs(cx) > 1.3 || cx === 0;
      const L = tower ? lerp(t0, t1, 1 - Math.abs(u - 0.5) * 2) * (0.85 + 0.15 * (1 - Math.abs(u - 0.5) * 2)) : lerp(t0, t1, u);
      const zz = tower ? z + 0.12 * (1 - Math.abs(u - 0.5) * 2) : z;
      list.push({ x: cx - span / 2 + rr * 1.12 + i * rr * 2.25, y: by, L, r: rr, z: zz });
    }
  }
  const body = new THREE.CylinderGeometry(1, 1, 1, lite ? 10 : 16, 1, true); body.translate(0, 0.5, 0);
  const foot = new THREE.CylinderGeometry(1, 0.25, 1.6, lite ? 10 : 16, 1, true); foot.translate(0, -0.8, 0);
  const mouth = new THREE.PlaneGeometry(1.2, 0.9); mouth.translate(0, 0.45, 1.01);
  const pipes = new THREE.InstancedMesh(body, mats.tin, list.length);
  const feet = new THREE.InstancedMesh(foot, mats.tin, list.length);
  const mouths = new THREE.InstancedMesh(mouth, mats.mouth, list.length);
  const o = new THREE.Object3D();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z); o.scale.set(p.r, p.L, p.r); o.updateMatrix(); pipes.setMatrixAt(i, o.matrix);
    o.scale.set(p.r, p.r, p.r); o.updateMatrix(); feet.setMatrixAt(i, o.matrix); mouths.setMatrixAt(i, o.matrix);
  });
  pipes.castShadow = false; pipes.receiveShadow = true;
  g.add(pipes, feet, mouths);
  // the case: impost (the base), towers' cornices, side panels, a crowning entablature
  const W2 = width / 2;
  const geos = [
    rbox(width, 1.2, 0.7, 0.02, [0, 0.6, -0.25]),
    box(width + 0.12, 0.08, 0.82, [0, 1.24, -0.22]),
    box(width + 0.2, 0.12, 0.9, [0, 1.34, -0.2]),
    box(width + 0.12, 0.06, 0.8, [0, 1.45, -0.22]),
    box(0.16, height - 1.4, 0.6, [-W2 + 0.02, 1.4 + (height - 1.4) / 2, -0.25]),
    box(0.16, height - 1.4, 0.6, [W2 - 0.02, 1.4 + (height - 1.4) / 2, -0.25]),
    box(width, height - 1.4, 0.06, [0, 1.4 + (height - 1.4) / 2, -0.55]),
  ];
  // cornices over the three towers and the flats
  for (const [cx, , , , , rr] of flats) {
    const tower = Math.abs(cx) > 1.3 || cx === 0, top = tower ? (cx === 0 ? 4.85 : 4.45) : 3.75, w = tower ? 0.62 + rr * 2 : 0.85;
    geos.push(box(w + 0.1, 0.08, 0.5, [cx, top, -0.05]), box(w + 0.18, 0.06, 0.56, [cx, top + 0.07, -0.05]), box(w, 0.2, 0.42, [cx, top - 0.14, -0.08]));
    if (tower) geos.push(box(w * 0.9, 0.1, 0.36, [cx, 1.55, 0.0]));
  }
  // panelled base: raised fielded panels
  for (let i = 0; i < 6; i++) geos.push(rbox(0.52, 0.66, 0.03, 0.01, [-W2 + 0.4 + i * (width - 0.8) / 5, 0.62, 0.11]));
  const caseM = new THREE.Mesh(merge(geos), mats.organCase); caseM.receiveShadow = true; g.add(caseM);
  // gilt pipe-shades: carved filigree on a plane (alpha)
  const shadeTex = filigreeTexture();
  const shadeMat = new THREE.MeshStandardMaterial({ map: shadeTex, alphaTest: 0.4, color: '#e2b25a', metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
  const shadeG = [];
  for (const [cx, , , , , rr] of flats) {
    const tower = Math.abs(cx) > 1.3 || cx === 0, top = tower ? (cx === 0 ? 4.85 : 4.45) : 3.75, w = tower ? 0.62 + rr * 2 : 0.85;
    shadeG.push(bake(new THREE.PlaneGeometry(w, 0.5), [cx, top - 0.5, 0.18]));
  }
  shadeG.push(bake(new THREE.PlaneGeometry(1.2, 0.7), [0, 5.3, 0.0]));   // the crowning cartouche
  g.add(new THREE.Mesh(merge(shadeG), shadeMat));
  // a warm glow behind the pipes (candle light on the case back)
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 1 }, uC: { value: new THREE.Color('#ff9a40') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uI; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = vUv - vec2(0.5, 0.42); float d = length(p * vec2(1.0, 1.4)); float a = exp(-d * d * 7.0) * uI; gl_FragColor = vec4(uC * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.1, height), glowMat);
  glow.position.set(0, height / 2 + 0.6, -0.45);
  g.add(glow);
  return { group: g, pipes, list, glow };
}
function filigreeTexture() {
  const W = 512, H = 256, c = mkCanvas(W, H), x = c.getContext('2d'), r = rng(17);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff'; x.lineCap = 'round';
  const scroll = (cx, cy, R, dir, turns = 1.4) => {
    x.beginPath();
    for (let i = 0; i <= 40; i++) { const a = (i / 40) * turns * TAU, rr = R * Math.pow(0.45, a / TAU); const px = cx + dir * Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
    x.stroke();
  };
  // symmetric acanthus scrolls hanging from a top rail
  x.lineWidth = 10; x.beginPath(); x.moveTo(0, 12); x.lineTo(W, 12); x.stroke();
  for (let i = 0; i < 4; i++) {
    const px = 40 + i * 58, R = 30 + r() * 14;
    for (const s of [-1, 1]) {
      const X = s < 0 ? px : W - px;
      x.lineWidth = 7; x.beginPath(); x.moveTo(X, 12); x.quadraticCurveTo(X + s * 20, 60, X + s * 4, 100 + R * 0.5); x.stroke();
      scroll(X + s * 4, 100 + R * 0.5 + R * 0.6, R * 0.6, s);
      x.lineWidth = 4; scroll(X - s * 18, 60, R * 0.4, -s, 1.2);
    }
  }
  x.lineWidth = 8; scroll(W / 2 - 40, 120, 60, -1); scroll(W / 2 + 40, 120, 60, 1);
  x.beginPath(); x.arc(W / 2, 60, 22, 0, TAU); x.fill();
  // tassel drops
  for (let i = 0; i < 9; i++) { const px = 30 + i * 56; x.beginPath(); x.moveTo(px - 6, 12); x.lineTo(px + 6, 12); x.lineTo(px, 40 + (i % 2) * 20); x.closePath(); x.fill(); }
  const t = toTex(c); return t;
}

// ------------------------------------------------------------------ the hall: music stands, chairs, choir
export function standGeometry() {
  return merge([
    cyl(0.008, 0.008, 1.0, 6, [0, 0.55, 0]),
    ...[0, 1, 2].map((i) => rod(V3(0, 0.12, 0), V3(Math.cos(i * TAU / 3) * 0.22, 0.0, Math.sin(i * TAU / 3) * 0.22), 0.007, 4)),
    box(0.46, 0.32, 0.012, [0, 1.12, 0], [-0.35, 0, 0]),
    box(0.46, 0.02, 0.05, [0, 0.96, 0.05], [-0.35, 0, 0]),
  ]);
}
export function pageGeometry() { const g = new THREE.PlaneGeometry(0.42, 0.29); bake(g, [0, 1.125, 0.012], [-0.35, 0, 0]); return g; }
export function chairGeometry() {
  return merge([
    rbox(0.42, 0.04, 0.4, 0.01, [0, 0.46, 0]),
    rbox(0.4, 0.42, 0.03, 0.01, [0, 0.72, -0.19], [-0.1, 0, 0]),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => cyl(0.014, 0.012, 0.46, 5, [a * 0.18, 0.23, b * 0.17])),
  ]);
}
export function figureGeometry(lite) {
  // a seated / standing silhouette: shoulders, torso, head (no features)
  const body = lathe([[0.0, 0], [0.2, 0.02], [0.21, 0.4], [0.19, 0.8], [0.2, 1.05], [0.21, 1.22], [0.17, 1.33], [0.07, 1.38], [0.06, 1.44], [0.0, 1.46]], lite ? 7 : 10);
  body.scale(1, 1, 0.62);
  const head = new THREE.SphereGeometry(0.1, lite ? 7 : 10, lite ? 5 : 8); head.scale(0.9, 1.1, 0.95); head.translate(0, 1.56, 0);
  return merge([body, head]);
}
