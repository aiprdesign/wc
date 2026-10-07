// HERBS & AYURVEDA — procedural assets, part 2: the set. The carved teak apothecary bench, the tulsi
// vrindavan (the plinth planter of holy basil), the living plants (tulsi bush, neem bough, pepper vine on
// its pole, turmeric / ginger / herb beds, banana and coconut palms), laterite beds and wall, flagstones,
// the palm-leaf manuscript, a woven tray, a banana leaf, the sea and a dhow beyond the garden wall.
// Plants return instance transforms; herbs.js turns them into InstancedMeshes.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, lerp, sat, TAU } from '../../lib/math.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { V3, LOD, merge, bake, tint, lathe, gridSurf, varTube, stem, heightToNormal } from './herbs-assets.js';

const canvasHeight = (c) => { const { width: W, height: H } = c, d = c.getContext('2d').getImageData(0, 0, W, H).data, h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = d[i * 4] / 255; return h; };

// ------------------------------------------------------------------ table (the apothecary bench)
export const TABLE = { x0: -2.35, x1: 2.35, z0: -0.46, z1: 0.46, top: 0.78, th: 0.07 };

// Oiled teak laid 1:1 over the whole top (no repeat): long grain with drift, cathedral figure, pores,
// darker wear rings where pots have stood, knife scores, a turmeric stain or two.
export function teakMaps(W = 2048, H = 400, seed = 11) {
  const R = rng(seed), h = new Float32Array(W * H);
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  const rc = mkCanvas(W, H), rx = rc.getContext('2d'), rimg = rx.createImageData(W, H), rd = rimg.data;
  const rings = [...Array(9)].map(() => [R() * W, R() * H, 30 + R() * 50]);
  const stains = [...Array(5)].map(() => [R() * W, R() * H, 20 + R() * 40]);
  const planks = [0.0, 0.27, 0.51, 0.76, 1.0];
  for (let y = 0; y < H; y++) {
    const v = y / H, plank = planks.findIndex((p, i) => v >= p && v < planks[i + 1]);
    const pv = (v - planks[plank]) / (planks[plank + 1] - planks[plank]);
    const seam = Math.min(...planks.map((p) => Math.abs(v - p))) * H < 1.6 ? 1 : 0;
    for (let x = 0; x < W; x++) {
      const u = x / W, i = y * W + x, o = i * 4;
      const warp = fbm2(u * 3 + plank * 5, v * 4, 3) * 0.6;
      const g = Math.sin((pv * 46 + warp * 9 + fbm2(u * 0.8, plank, 2) * 6 + Math.abs(u - 0.4 - plank * 0.1) * 2) * Math.PI);
      const fig = Math.pow(Math.abs(g), 0.4);
      const pore = noise2(x / 1.3, y / 0.6 + plank * 40) > 0.62 ? 1 : 0;
      let ring = 0; for (const [rx0, ry0, rr] of rings) { const q = Math.hypot(x - rx0, y - ry0); ring = Math.max(ring, Math.exp(-(((q - rr) / 4) ** 2)) * 0.5 + (q < rr ? 0.08 : 0)); }
      let st = 0; for (const [sx, sy, sr] of stains) { const q = Math.hypot((x - sx) * 0.8, y - sy) / sr; st = Math.max(st, sat(1 - q) * (0.5 + 0.5 * noise2(x / 9, y / 9))); }
      const tone = 0.82 + fbm2(u * 2 + plank * 3, v * 2, 3) * 0.25 + (plank % 2 ? 0.05 : -0.03);
      let r = (96 + fig * 34) * tone, gg = (54 + fig * 20) * tone, b = (28 + fig * 10) * tone;
      r *= 1 - pore * 0.25 - ring * 0.25 - seam * 0.6; gg *= 1 - pore * 0.28 - ring * 0.28 - seam * 0.6; b *= 1 - pore * 0.3 - ring * 0.3 - seam * 0.6;
      r = lerp(r, 170, st * 0.35); gg = lerp(gg, 96, st * 0.35); b = lerp(b, 14, st * 0.35);
      d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
      h[i] = 0.5 + fig * 0.03 - pore * 0.05 - seam * 0.4 - ring * 0.01;
      const rough = 0.58 + (1 - fig) * 0.12 + pore * 0.1 - ring * 0.14 + seam * 0.3;
      rd[o] = rd[o + 1] = rd[o + 2] = sat(rough) * 255; rd[o + 3] = 255;
    }
  }
  // knife scores and scratches
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  cx.strokeStyle = 'rgba(40,20,8,0.25)'; cx.lineWidth = 0.8;
  for (let k = 0; k < 140; k++) { const x0 = R() * W, y0 = R() * H, a = (R() - 0.5) * 0.6 + (R() < 0.3 ? Math.PI / 2 : 0), l = 10 + R() * 50; cx.beginPath(); cx.moveTo(x0, y0); cx.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); cx.stroke(); }
  const map = toTexture(cc, { anisotropy: 8 });
  const roughnessMap = toTexture(rc, { srgb: false, anisotropy: 8 });
  const normalMap = heightToNormal(h, W, H, 4, false);
  return { map, normalMap, roughnessMap };
}
// Small-part teak (legs, apron, covers): a seamless-in-u grain block, mapped per part.
export function teakSmallMaps(seed = 13, W = 512, H = 256) {
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data, h = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, o = (y * W + x) * 4;
    const g = Math.sin((u * 18 + fbm2(Math.cos(u * TAU) + seed, v * 3, 3) * 2 + Math.sin(v * 6) * 0.3) * Math.PI * 2);
    const fig = Math.pow(Math.abs(g), 0.4), tone = 0.85 + fbm2(Math.cos(u * TAU) * 2, Math.sin(u * TAU) * 2 + v, 3) * 0.2;
    d[o] = (90 + fig * 30) * tone; d[o + 1] = (50 + fig * 18) * tone; d[o + 2] = (26 + fig * 9) * tone; d[o + 3] = 255;
    h[y * W + x] = 0.5 + fig * 0.03;
  }
  cx.putImageData(img, 0, 0);
  const map = toTexture(cc, { repeat: true, anisotropy: 4 });
  return { map, normalMap: heightToNormal(h, W, H, 3, true) };
}
// Carved relief for the apron (one long strip, never repeating): a running vine scroll with leaves and
// rosettes, framed by bead mouldings.
export function carvingMaps(W = 2048, H = 128, seed = 21) {
  const R = rng(seed), c = mkCanvas(W, H); let x = c.getContext('2d');
  x.fillStyle = '#7a7a7a'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#a8a8a8'; x.fillRect(0, 0, W, 12); x.fillRect(0, H - 12, W, 12);
  for (let i = 0; i < W; i += 9) { x.beginPath(); x.arc(i + 4, 18, 3.2, 0, TAU); x.arc(i + 4, H - 18, 3.2, 0, TAU); x.fillStyle = '#b8b8b8'; x.fill(); }
  const base = x; const lc = mkCanvas(W, H); { const y2 = lc.getContext('2d'); x = y2; }
  x.strokeStyle = '#d0d0d0'; x.lineWidth = 7; x.beginPath();
  for (let i = 0; i <= W; i += 4) { const y = H / 2 + Math.sin(i / 52) * 26; i ? x.lineTo(i, y) : x.moveTo(i, y); }
  x.stroke();
  for (let k = 0; k * 52 * Math.PI < W + 200; k++) {
    const cxp = k * 52 * Math.PI + 26 * Math.PI / 2, s = k % 2 ? 1 : -1, cy = H / 2 + s * 18;
    // a curling tendril with leaves into each loop of the scroll
    x.lineWidth = 4; x.beginPath(); x.moveTo(cxp - 30, H / 2 - s * 8); x.quadraticCurveTo(cxp, cy + s * 24, cxp + 14, cy); x.stroke();
    for (let j = 0; j < 3; j++) {
      const a = -1.2 + j * 1.2 + (R() - 0.5) * 0.3, lx = cxp + Math.cos(a) * 18, ly = cy + Math.sin(a) * 12 * s;
      x.save(); x.translate(lx, ly); x.rotate(a); x.beginPath(); x.ellipse(6, 0, 11, 4.5, 0, 0, TAU); x.fillStyle = '#c4c4c4'; x.fill(); x.restore();
    }
    // rosette
    x.save(); x.translate(cxp + 60, H / 2 - s * 26);
    for (let p = 0; p < 8; p++) { x.rotate(TAU / 8); x.beginPath(); x.ellipse(5, 0, 6, 2.6, 0, 0, TAU); x.fillStyle = '#c8c8c8'; x.fill(); }
    x.beginPath(); x.arc(0, 0, 3, 0, TAU); x.fillStyle = '#e0e0e0'; x.fill(); x.restore();
  }
  base.filter = 'blur(1.4px)'; base.drawImage(lc, 0, 0); base.filter = 'none';
  const h = canvasHeight(c);
  for (let i = 0; i < h.length; i++) h[i] += noise2((i % W) / 3, Math.floor(i / W) / 3) * 0.02;
  return { normalMap: heightToNormal(h, W, H, 7, false), ao: h };
}

// The bench: a thick moulded top, a carved apron front and back, turned legs, low stretchers.
// Returns { top, apron, legs } geometries (top UVs map the whole top 1:1; apron UVs the whole strip).
export function tableGeometry() {
  const { x0, x1, z0, z1, top, th } = TABLE, Lx = x1 - x0;
  // cross-section of the top (z, y), front edge → top → back edge → underside, with an ogee moulding
  const edge = (s) => [[0, -th], [0.004, -th + 0.006], [0.012, -th + 0.016], [0.016, -th * 0.55], [0.012, -th * 0.42], [0.016, -th * 0.3], [0.02, -0.012], [0.017, -0.004], [0.012, 0]].map(([dz, y]) => [s * dz, y]);
  const prof = [
    ...edge(1).map(([dz, y]) => [z1 + dz - 0.02, y]),
    ...edge(-1).reverse().map(([dz, y]) => [z0 + dz + 0.02, y]),
  ];
  prof.push(prof[0]);
  const nx = 2, pos = [], uv = [], idx = [];
  let acc = 0; const vs = [0];
  for (let i = 1; i < prof.length; i++) { acc += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]); vs.push(acc); }
  for (let i = 0; i < prof.length; i++) for (let k = 0; k <= nx; k++) {
    const x = x0 + (k / nx) * Lx, [z, y] = prof[i];
    pos.push(x, top + y, z);
    uv.push((x - x0) / Lx, y > -0.001 ? (z - z0) / (z1 - z0) : 0.5 + (vs[i] / acc - 0.5) * 0.15);
  }
  for (let i = 0; i < prof.length - 1; i++) for (let k = 0; k < nx; k++) { const a = i * (nx + 1) + k, b = a + nx + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  let topG = new THREE.BufferGeometry();
  topG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); topG.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); topG.setIndex(idx);
  topG = topG.toNonIndexed(); topG.computeVertexNormals();
  // end caps
  const sh = new THREE.Shape(prof.slice(0, -1).map(([z, y]) => new THREE.Vector2(z, y)));
  const capR = new THREE.ShapeGeometry(sh); capR.rotateY(Math.PI / 2); capR.translate(x1, top, 0);
  const capL = new THREE.ShapeGeometry(sh); capL.rotateY(-Math.PI / 2); capL.translate(x0, top, 0);
  for (const c of [capL, capR]) { const u = c.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, 0.5 + u.getX(i) * 0.1, 0.5 + u.getY(i) * 0.4); }
  const topAll = merge([topG, capL, capR]);
  // apron (front and back): carved strip UVs
  const ap = [];
  for (const [z, ry] of [[z1 - 0.045, 0], [z0 + 0.045, Math.PI]]) {
    const g = new THREE.BoxGeometry(Lx - 0.22, 0.11, 0.025);
    const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i), u.getY(i));
    bake(g, [0, top - th - 0.055, z], [0, ry, 0]); ap.push(g);
  }
  for (const x of [x0 + 0.1, x1 - 0.1]) ap.push(bake(new THREE.BoxGeometry(0.025, 0.11, (z1 - z0) - 0.12), [x, top - th - 0.055, 0]));
  // turned legs
  const legP = [[0, 0], [0.034, 0], [0.04, 0.012], [0.036, 0.03], [0.03, 0.05], [0.026, 0.12], [0.03, 0.16], [0.042, 0.2], [0.046, 0.25], [0.04, 0.3], [0.028, 0.33], [0.034, 0.35], [0.026, 0.37], [0.024, 0.46], [0.03, 0.5], [0.038, 0.53], [0.03, 0.56], [0.034, 0.58], [0.04, 0.6], [0.04, top - th], [0, top - th]];
  const legs = [];
  for (const x of [x0 + 0.1, 0, x1 - 0.1]) for (const z of [z0 + 0.06, z1 - 0.06]) legs.push(bake(lathe(legP, 20), [x, 0, z]));
  for (const z of [z0 + 0.06, z1 - 0.06]) legs.push(bake(new THREE.CylinderGeometry(0.014, 0.014, Lx - 0.2, 10), [0, 0.1, z], [0, 0, Math.PI / 2]));
  for (const x of [x0 + 0.1, 0, x1 - 0.1]) legs.push(bake(new THREE.CylinderGeometry(0.014, 0.014, z1 - z0 - 0.12, 10), [x, 0.1, 0], [Math.PI / 2, 0, 0]));
  return { top: topAll, apron: merge(ap), legs: merge(legs) };
}

// ------------------------------------------------------------------ the tulsi vrindavan
// Lime-washed masonry planter on a two-step plinth: painted ochre and red bands, a lotus on each face, an
// arched niche with a lamp in front, cornice, a parapet with corner horns. Plaster weathered: rain streaks,
// moss at the foot, chips showing the brick under the wash.
export function planterTexture(seed = 17, N = 512) {
  const R = rng(seed), c = mkCanvas(N, N), x = c.getContext('2d');
  const img = x.createImageData(N, N), d = img.data;
  const chips = [...Array(14)].map(() => [R() * N, R() * N, 4 + R() * 14]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, o = (j * N + i) * 4;
    const n = fbm2(u * 6 + seed, v * 6, 4);
    const streak = Math.pow(sat(fbm2(u * 22, v * 1.2 + seed, 3) + 0.2), 3) * sat(1.2 - v);    // rain streaks run down
    const moss = sat((v - 0.78) * 4 + n * 0.8);
    let chip = 0; for (const [cx0, cy0, r] of chips) { const q = Math.hypot(i - cx0, (j - cy0) * 1.3) / r + noise2(i / 4, j / 4) * 0.3; if (q < 1) chip = 1; }
    let r = 244, g = 226, b = 212;
    const k = 0.95 + n * 0.06 - streak * 0.08;
    r *= k; g *= k; b *= k;
    r = lerp(r, 92, moss * 0.6); g = lerp(g, 104, moss * 0.6); b = lerp(b, 60, moss * 0.6);
    if (chip) { r = 150; g = 82; b = 58; }
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  // painted motif: a lotus in red and ochre with a border of dots (hand-painted: slightly uneven)
  x.globalAlpha = 0.85;
  x.translate(N / 2, N * 0.46);
  for (let p = 0; p < 8; p++) {
    x.save(); x.rotate(-Math.PI / 2 + (p - 3.5) * 0.32); x.beginPath(); x.ellipse(0, -N * 0.12, N * 0.04, N * 0.12, 0, 0, TAU);
    x.fillStyle = p % 2 ? '#b8442a' : '#d27a2c'; x.fill(); x.restore();
  }
  x.beginPath(); x.ellipse(0, 0, N * 0.15, N * 0.035, 0, 0, Math.PI); x.fillStyle = '#c8952e'; x.fill();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.fillStyle = '#a63a26';
  for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(N * 0.06 + i * N * 0.0345, N * 0.08 + (R() - 0.5) * 2, 4.5, 0, TAU); x.fill(); x.beginPath(); x.arc(N * 0.06 + i * N * 0.0345, N * 0.9 + (R() - 0.5) * 2, 4.5, 0, TAU); x.fill(); }
  x.globalAlpha = 1;
  // re-weather over the paint
  x.globalCompositeOperation = 'multiply';
  for (let k = 0; k < 30; k++) { x.fillStyle = `rgba(120,110,90,${0.08 + R() * 0.1})`; x.fillRect(R() * N, R() * N * 0.5, 2 + R() * 4, N * (0.2 + R() * 0.5)); }
  x.globalCompositeOperation = 'source-over';
  return toTexture(c, { anisotropy: 4 });
}
export const PLANTER = { pos: V3(0.32, 0, -1.05), soilY: 1.03, niche: V3(0, 0.43, 0.29) };
export function planterGeometry() {
  const parts = [], col = (g, hex) => tint(g, hex);
  const plainUV = (g, u0 = 0.06, v0 = 0.12) => { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u0 + u.getX(i) * 0.25, v0 + u.getY(i) * 0.06); return g; };
  const rb = (w, h, d, y, hex, r = 0.012) => { const g = plainUV(new RoundedBoxGeometry(w, h, d, 2, r)); g.translate(0, y, 0); parts.push(col(g, hex)); return g; };
  rb(0.88, 0.1, 0.88, 0.05, '#a65a3c', 0.015);
  rb(0.76, 0.08, 0.76, 0.14, '#c07a4e');
  rb(0.66, 0.05, 0.66, 0.205, '#efe6d4', 0.01);
  // the shaft: three plain faces + the front with its arched niche
  const W = 0.56, y0 = 0.23, y1 = 0.86, H = y1 - y0, T = 0.06;
  const face = (geo, ry) => { geo.rotateY(ry); parts.push(col(geo, '#f2ead8')); };
  for (const ry of [Math.PI / 2, Math.PI, -Math.PI / 2]) { const g = new THREE.BoxGeometry(W, H, T); g.translate(0, y0 + H / 2, W / 2 - T / 2); face(g, ry); }
  const fr = new THREE.Shape([V2(-W / 2, 0), V2(W / 2, 0), V2(W / 2, H), V2(-W / 2, H)]);
  const arch = new THREE.Path(); const aw = 0.085, ab = 0.16, at = 0.36;
  arch.moveTo(-aw, ab); arch.lineTo(-aw, at); arch.absarc(0, at, aw, Math.PI, 0, false); arch.lineTo(aw, ab); arch.lineTo(-aw, ab);
  fr.holes.push(arch);
  const front = new THREE.ExtrudeGeometry(fr, { depth: T, bevelEnabled: false, curveSegments: 12 });
  { const u = front.attributes.uv, p = front.attributes.position; for (let i = 0; i < u.count; i++) u.setXY(i, p.getX(i) / W + 0.5, p.getY(i) / H); }
  front.translate(0, y0, W / 2 - T); parts.push(col(front, '#f2ead8'));
  // the niche: back wall and floor, darker, soot above the lamp
  const nb = new THREE.ShapeGeometry(new THREE.Shape(arch.getPoints(12))); nb.translate(0, y0, W / 2 - T - 0.07); parts.push(col(nb, '#6a5040'));
  {
    // the niche's reveal: a strip round the arch outline, facing inwards
    const pts = arch.getPoints(12), zf = W / 2 - T, zb = zf - 0.07, pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (a.distanceTo(b) < 1e-6) continue;
      pos.push(a.x, y0 + a.y, zf, b.x, y0 + b.y, zf, a.x, y0 + a.y, zb, b.x, y0 + b.y, zf, b.x, y0 + b.y, zb, a.x, y0 + a.y, zb);
    }
    const ns = new THREE.BufferGeometry(); ns.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ns.computeVertexNormals();
    // flip to face the arch's centre if needed
    const n0 = V3().fromBufferAttribute(ns.attributes.normal, 0), p0 = V3().fromBufferAttribute(ns.attributes.position, 0);
    if (n0.dot(V3(0, y0 + 0.28, p0.z).sub(p0)) < 0) { const a = ns.attributes.position.array; for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; } ns.computeVertexNormals(); }
    parts.push(col(ns, '#8a6a52'));
  }
  // taper the shaft a little towards the top
  // mouldings, cornice, parapet with horns
  rb(0.62, 0.035, 0.62, 0.878, '#d8a248', 0.008);
  rb(0.6, 0.02, 0.6, 0.905, '#a63a26', 0.005);
  rb(0.7, 0.05, 0.7, 0.94, '#efe6d4', 0.012);
  for (const [w, d, x, z] of [[0.62, 0.05, 0, 0.285], [0.62, 0.05, 0, -0.285], [0.05, 0.52, 0.285, 0], [0.05, 0.52, -0.285, 0]]) {
    const g = plainUV(new RoundedBoxGeometry(w, 0.1, d, 2, 0.01), 0.5, 0.12); g.translate(x, 1.015, z); parts.push(col(g, '#f0e6d2'));
  }
  const hornP = [[0, 0], [0.04, 0], [0.042, 0.012], [0.03, 0.02], [0.036, 0.04], [0.028, 0.07], [0.012, 0.095], [0.006, 0.11], [0.0, 0.12]];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(col(bake(lathe(hornP, 16), [sx * 0.285, 1.065, sz * 0.285]), sx * sz > 0 ? '#d27a2c' : '#c8952e'));
  const g = merge(parts, true);
  return g;
}
const V2 = (x, y) => new THREE.Vector2(x, y);

// ------------------------------------------------------------------ plants
// basis matrix for a leaf: its +x along dir, its face (+y) towards up, scaled
const _m = new THREE.Matrix4(), _x = V3(), _y = V3(), _z = V3();
export function leafMatrix(pos, dir, up, s, roll = 0) {
  _x.copy(dir).normalize();
  _y.copy(up).addScaledVector(_x, -up.dot(_x)).normalize();
  if (roll) _y.applyAxisAngle(_x, roll);
  _z.crossVectors(_x, _y);
  return new THREE.Matrix4().makeBasis(_x, _y, _z).scale(V3(s, s, s)).setPosition(pos);
}
const randUnit = (R) => { const a = R() * TAU, z = R() * 2 - 1, r = Math.sqrt(1 - z * z); return V3(Math.cos(a) * r, z, Math.sin(a) * r); };

// Tulsi: a woody bush; opposite leaf pairs at each node (turned 90° node to node) and slender purple
// flower spikes at the branch tips. Leaves are unit-length instances (geometry len 1), scaled.
export function tulsiPlant(seed = 1, { base = V3(), height = 0.55, branches = 7, nodes = 6, purple = 0.35 } = {}) {
  const R = rng(seed), wood = [], leaves = [], spikes = [], florets = [];
  const trunkTop = base.clone().add(V3(0, height * 0.1, 0));
  wood.push(stem([base, base.clone().add(V3(0.005, height * 0.1, 0)), trunkTop], 0.011, 0.008, 7));
  for (let b = 0; b < branches; b++) {
    const az = (b / branches) * TAU + R() * 0.5, lean = 0.45 + R() * 0.6;
    const len = height * (0.65 + R() * 0.35);
    const start = trunkTop.clone().add(V3(0, (R() - 0.3) * height * 0.08, 0));
    const dir = V3(Math.cos(az) * lean, 1, Math.sin(az) * lean).normalize();
    const pts = [start];
    for (let k = 1; k <= 4; k++) { const p = pts[k - 1].clone().addScaledVector(dir, len / 4); p.x += (R() - 0.5) * 0.02; p.z += (R() - 0.5) * 0.02; pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts);
    wood.push(varTube(curve, 10, 5, (u) => lerp(0.0065, 0.0018, u)));
    // side shoots
    for (let s = 0; s < 2; s++) {
      const u0 = 0.35 + s * 0.25 + R() * 0.08, p0 = curve.getPointAt(u0), saz = az + (s ? 1 : -1) * (0.7 + R() * 0.5);
      const sd = V3(Math.cos(saz) * 0.8, 0.9, Math.sin(saz) * 0.8).normalize(), sl = len * (0.3 + R() * 0.15);
      const sc = new THREE.CatmullRomCurve3([p0, p0.clone().addScaledVector(sd, sl * 0.5), p0.clone().addScaledVector(sd, sl).add(V3(0, sl * 0.15, 0))]);
      wood.push(varTube(sc, 6, 4, (u) => lerp(0.0028, 0.0012, u)));
      addLeaves(sc, Math.max(2, Math.round(nodes * 0.6)), saz, 0.7, sc.getPointAt(1), sd);
    }
    addLeaves(curve, nodes, az, 1, pts[4], dir);
  }
  function addLeaves(curve, n, az, k, tip, tdir) {
    for (let i = 0; i < n; i++) {
      const u = 0.18 + (i / n) * 0.78, p = curve.getPointAt(u), t = curve.getTangentAt(u);
      const rot = i * Math.PI / 2 + az, size = (0.04 + 0.028 * Math.sin(Math.PI * u)) * k * (0.85 + R() * 0.3);
      for (const s of [0, Math.PI]) {
        const side = V3(Math.cos(rot + s), 0, Math.sin(rot + s));
        side.addScaledVector(t, -side.dot(t)).normalize();
        const d = side.clone().multiplyScalar(0.85).addScaledVector(t, 0.35 + R() * 0.2).add(V3(0, -0.15 + R() * 0.1, 0)).normalize();
        const up = V3(0, 1, 0).addScaledVector(t, 0.3);
        leaves.push({ m: leafMatrix(p, d, up, size, (R() - 0.5) * 0.5), purple: R() < purple ? 0.5 + R() * 0.5 : R() * 0.25, u });
      }
    }
    // the flower spike: a slender raceme with whorls of tiny florets
    const sl = 0.05 + R() * 0.05, sdir = tdir.clone().add(V3(0, 0.6, 0)).normalize();
    const s0 = tip.clone(), s1 = tip.clone().addScaledVector(sdir, sl);
    spikes.push(stem([s0, s0.clone().lerp(s1, 0.5).add(V3((R() - 0.5) * 0.006, 0, 0)), s1], 0.0013, 0.0006, 4, 100));
    for (let w = 0; w < 6; w++) {
      const p = s0.clone().lerp(s1, 0.15 + w * 0.14);
      for (let f = 0; f < 2; f++) { const a = f * Math.PI + w * 1.1; florets.push(p.clone().add(V3(Math.cos(a) * 0.0028, 0, Math.sin(a) * 0.0028))); }
    }
  }
  return { wood: merge(wood), leaves, spikes: merge(spikes), florets };
}

// Neem: a bough springing from the trunk, with pinnately compound leaves (a rachis carrying 9–15 sickle-
// shaped, toothed leaflets). Returns the wood, the green rachises and the leaflet transforms.
export function neemBough(seed = 3, { start, ctrl, end, leaves = 30, leafLen = 0.24, r0 = 0.04 }) {
  const R = rng(seed), wood = [], rach = [], leaflets = [];
  const main = new THREE.CatmullRomCurve3([start, ctrl, end]);
  wood.push(varTube(main, 40, 9, (u, a) => lerp(r0, r0 * 0.12, Math.pow(u, 0.8)) * (1 + 0.06 * Math.sin(a * 3 + u * 20))));
  // twigs off the bough, each ending in a spray of compound leaves
  const twigs = Math.max(4, Math.round(leaves / 4));
  for (let k = 0; k < twigs; k++) {
    const u = 0.25 + (k / twigs) * 0.73, p = main.getPointAt(u), t = main.getTangentAt(u);
    const side = randUnit(R); side.y = -Math.abs(side.y) * 0.5 - 0.2; side.addScaledVector(t, -side.dot(t)).normalize();
    const tl = 0.12 + R() * 0.12, te = p.clone().addScaledVector(side, tl).addScaledVector(t, tl * 0.6);
    const tc = new THREE.CatmullRomCurve3([p, p.clone().lerp(te, 0.5).add(V3(0, 0.02, 0)), te]);
    wood.push(varTube(tc, 8, 5, (uu) => lerp(r0 * 0.25 * (1 - u * 0.6), 0.0025, uu)));
    const per = Math.max(3, Math.round(leaves / twigs));
    for (let j = 0; j < per; j++) {
      const ang = (j / per) * TAU + R() * 0.6;
      const td = tc.getTangentAt(1);
      const ld = V3(Math.cos(ang), -0.25 - R() * 0.6, Math.sin(ang)).multiplyScalar(0.8).addScaledVector(td, 0.6).normalize();
      compound(te.clone(), ld, leafLen * (0.75 + R() * 0.4));
    }
  }
  function compound(p0, dir, L) {
    const droop = 0.35 + R() * 0.3;
    const pts = [p0, p0.clone().addScaledVector(dir, L * 0.5).add(V3(0, L * 0.06, 0)), p0.clone().addScaledVector(dir, L).add(V3(0, -L * droop * 0.5, 0))];
    const c = new THREE.CatmullRomCurve3(pts);
    rach.push(varTube(c, 8, 4, (u) => lerp(0.0016, 0.0007, u)));
    const n = 9 + Math.floor(R() * 6);
    for (let i = 0; i < n; i++) {
      const u = 0.12 + (i / (n - 1)) * 0.86, q = c.getPointAt(Math.min(1, u)), t = c.getTangentAt(Math.min(1, u));
      const sideRef = V3(0, 1, 0).cross(t).normalize();
      const s = i % 2 ? 1 : -1;
      const terminal = i === n - 1;
      const d = terminal ? t.clone() : sideRef.clone().multiplyScalar(s).addScaledVector(t, 0.55).add(V3(0, -0.25, 0)).normalize();
      const size = (0.045 + 0.02 * Math.sin(Math.PI * u)) * (L / 0.24) * (0.9 + R() * 0.2);
      leaflets.push({ m: leafMatrix(q, d, V3(0, 1, 0).addScaledVector(t, -0.2), size, s * (0.25 + R() * 0.25)), age: R() });
    }
  }
  return { wood: merge(wood), rachis: merge(rach), leaflets };
}

// Black pepper: a vine climbing its support pole (a spiral with nodes), heart-shaped leaves and hanging
// fruit spikes; the spike transforms are returned so the drupes can be instanced.
export function pepperVine(seed = 5, { base = V3(), height = 2.4, poleR = 0.07, turns = 3.2, leaves = 90, spikes = 12 } = {}) {
  const R = rng(seed), vine = [], leafM = [], spikeM = [];
  const pts = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40, a = u * turns * TAU + seed; pts.push(base.clone().add(V3(Math.cos(a) * (poleR + 0.012), u * height, Math.sin(a) * (poleR + 0.012)))); }
  const c = new THREE.CatmullRomCurve3(pts);
  vine.push(varTube(c, 160, 5, (u) => lerp(0.009, 0.004, u)));
  for (let i = 0; i < leaves; i++) {
    const u = 0.08 + (i / leaves) * 0.9, p = c.getPointAt(u), a = u * turns * TAU + seed;
    const out = V3(Math.cos(a), 0, Math.sin(a));
    const d = out.clone().multiplyScalar(0.7 + R() * 0.3).add(V3((R() - 0.5) * 0.6, -0.45 - R() * 0.4, (R() - 0.5) * 0.6)).normalize();
    // short side shoot carrying the leaf a little away from the pole
    const lp = p.clone().addScaledVector(out, 0.03 + R() * 0.05);
    vine.push(stem([p, p.clone().lerp(lp, 0.5).add(V3(0, 0.01, 0)), lp], 0.0025, 0.0018, 4, 80));
    leafM.push(leafMatrix(lp, d, out.clone().add(V3(0, 0.8, 0)), 0.09 + R() * 0.05, (R() - 0.5) * 0.6));
  }
  for (let i = 0; i < spikes; i++) {
    const u = 0.2 + R() * 0.7, p = c.getPointAt(u), a = u * turns * TAU + seed;
    const out = V3(Math.cos(a), 0, Math.sin(a)), q = p.clone().addScaledVector(out, 0.04);
    spikeM.push({ m: new THREE.Matrix4().makeRotationY(R() * TAU).setPosition(q), ripe: R() });
  }
  return { vine: merge(vine), leaves: leafM, spikes: spikeM };
}

// Low herbs in the beds: a cluster of leaves round a centre (generic herb bush).
export function bushLeaves(R, centre, { n = 40, r = 0.18, h = 0.3, size = [0.05, 0.08] } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * r, y = centre.y + h * (0.25 + 0.75 * R()) * (1 - (rr / r) * 0.5);
    const p = V3(centre.x + Math.cos(a) * rr, y, centre.z + Math.sin(a) * rr);
    const d = V3(Math.cos(a), 0.2 + R() * 0.5, Math.sin(a)).normalize();
    out.push(leafMatrix(p, d, V3(0, 1, 0), lerp(size[0], size[1], R()), (R() - 0.5) * 0.8));
  }
  return out;
}
// Turmeric / ginger / banana-like plants: long leaves rising from a clump and arching over.
export function clumpLeaves(R, centre, { n = 6, len = [0.35, 0.5], lean = [0.3, 0.9], lift = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.8, l = lerp(lean[0], lean[1], R());
    const d = V3(Math.cos(a) * l, 1, Math.sin(a) * l).normalize();
    out.push(leafMatrix(centre.clone().add(V3(0, lift, 0)), d, V3(Math.cos(a), 0.2, Math.sin(a)).negate().add(V3(0, 0.5, 0)), lerp(len[0], len[1], R()), (R() - 0.5) * 0.4));
  }
  return out;
}
// Ginger: reedy pseudo-stems with two ranks of narrow leaves.
export function gingerStems(R, centre, { n = 6, h = 0.55 } = {}) {
  const stems = [], leaves = [];
  for (let i = 0; i < n; i++) {
    const p0 = centre.clone().add(V3((R() - 0.5) * 0.12, 0, (R() - 0.5) * 0.12)), lean = V3((R() - 0.5) * 0.25, 1, (R() - 0.5) * 0.25).normalize();
    const hh = h * (0.7 + R() * 0.4), p1 = p0.clone().addScaledVector(lean, hh);
    stems.push(stem([p0, p0.clone().lerp(p1, 0.5), p1], 0.005, 0.0025, 5, 12));
    const plane = R() * TAU;
    for (let k = 0; k < 8; k++) {
      const u = 0.25 + k / 10, p = p0.clone().lerp(p1, u), s = k % 2 ? 1 : -1;
      const d = V3(Math.cos(plane) * s, 0.5 + R() * 0.3, Math.sin(plane) * s).normalize();
      leaves.push(leafMatrix(p, d, V3(0, 1, 0), 0.14 + R() * 0.06, s * 0.3));
    }
  }
  return { stems: merge(stems), leaves };
}
// Coconut palm: a leaning ringed trunk and a crown of fronds (rachis + two rows of leaflet strips).
export function coconutPalm(seed = 1, h = 8) {
  const R = rng(seed), lean = V3((R() - 0.5) * 0.5, 1, (R() - 0.5) * 0.3).normalize();
  const top = lean.clone().multiplyScalar(h).add(V3(Math.sin(seed) * 0.6, 0, 0));
  const tc = new THREE.CatmullRomCurve3([V3(), top.clone().multiplyScalar(0.5).add(V3(0.25, 0, 0)), top]);
  const trunk = varTube(tc, 24, 8, (u) => lerp(0.2, 0.13, u) * (1 + 0.04 * Math.pow(Math.abs(Math.sin(u * 90)), 6)));
  const pos = [], uv = [];
  const quad = (a, b, c, d, ua, ub) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z); uv.push(ua, 0, ub, 0, ua, 1, ub, 0, ub, 1, ua, 1); };
  const rachis = [];
  const F = LOD.k < 1 ? 9 : 15, NL = LOD.k < 1 ? 14 : 24;
  for (let f = 0; f < F; f++) {
    const az = (f / F) * TAU + R() * 0.3, el = 0.6 - (f % 3) * 0.35 - R() * 0.3;
    const L = 3.2 + R() * 1.2, dir = V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const pts = [top.clone(), top.clone().addScaledVector(dir, L * 0.5).add(V3(0, L * 0.1, 0)), top.clone().addScaledVector(dir, L).add(V3(0, -L * 0.45, 0))];
    const c = new THREE.CatmullRomCurve3(pts);
    rachis.push(varTube(c, 6, 3, (u) => lerp(0.05, 0.01, u)));
    const side = V3(0, 1, 0).cross(dir).normalize();
    for (let i = 0; i < NL; i++) {
      const u = 0.1 + (i / NL) * 0.88, p = c.getPointAt(u), t = c.getTangentAt(u);
      const ll = 0.9 * Math.sin(Math.PI * (0.25 + u * 0.7));
      for (const s of [-1, 1]) {
        const ld = side.clone().multiplyScalar(s).addScaledVector(t, 0.7).add(V3(0, -0.5, 0)).normalize();
        const q = p.clone().addScaledVector(ld, ll), w = t.clone().multiplyScalar(0.035);
        quad(p.clone().sub(w), p.clone().add(w), q.clone().sub(w.clone().multiplyScalar(0.3)), q.clone().add(w.clone().multiplyScalar(0.3)), 0, 1);
      }
    }
  }
  const fr = new THREE.BufferGeometry();
  fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fr.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fr.computeVertexNormals();
  const nuts = [];
  for (let k = 0; k < 6; k++) { const a = k * 1.1; nuts.push(bake(new THREE.SphereGeometry(0.11, 6, 4), [top.x + Math.cos(a) * 0.18, top.y - 0.25 - (k % 2) * 0.1, top.z + Math.sin(a) * 0.18])); }
  return { trunk: merge([trunk, ...rachis, ...nuts]), fronds: fr };
}
// Banana plant: a pseudo-stem and a few huge torn leaves.
export function bananaPlant(seed = 2, h = 2.4) {
  const R = rng(seed), stems = [stem([V3(), V3(0.02, h * 0.5, 0), V3(0, h, 0.02)], 0.11, 0.07, 9, 6)], leaves = [];
  for (let k = 0; k < 7; k++) {
    const az = k * 2.3 + R(), el = 0.55 - k * 0.08, top = V3(0, h * (0.85 + R() * 0.15), 0);
    const d = V3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const pet = top.clone().addScaledVector(d, 0.45);
    stems.push(stem([top, top.clone().lerp(pet, 0.5).add(V3(0, 0.05, 0)), pet], 0.025, 0.015, 5, 6));
    leaves.push(leafMatrix(pet, d.clone().add(V3(0, -0.3, 0)).normalize(), V3(0, 1, 0), 1.5 + R() * 0.5, (R() - 0.5) * 0.5));
  }
  return { stems: merge(stems), leaves };
}

// Laterite blocks (beds, wall): every block its own size, tone and texture offset; chipped corners.
export function lateriteTexture(seed = 23, N = 256) {
  const c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, o = (j * N + i) * 4;
    const n = fbm2(u * 8 + seed, v * 8, 4), pit = noise2(i / 3.5 + seed, j / 3.5) > 0.45 ? 1 : 0, vein = Math.abs(fbm2(u * 5, v * 5 + seed, 3)) < 0.04 ? 1 : 0;
    const k = 0.85 + n * 0.3 - pit * 0.35;
    d[o] = (168 + vein * 30) * k; d[o + 1] = (84 + vein * 30) * k; d[o + 2] = (52 + vein * 10) * k; d[o + 3] = 255;
    h[j * N + i] = 0.5 + n * 0.05 - pit * 0.1;
  }
  x.putImageData(img, 0, 0);
  const map = toTexture(c, { repeat: true, anisotropy: 4 });
  const normalMap = heightToNormal(h, N, N, 4, true); normalMap.wrapT = THREE.RepeatWrapping;
  map.userData = { noAntiTile: true };
  return { map, normalMap };
}
export function blockRun(R, a, b, { h = 0.2, d = 0.22, len = 0.4, y = 0, courses = 1, jit = 0.012 } = {}) {
  const parts = [], dir = b.clone().sub(a), L = dir.length(); dir.normalize();
  const ry = Math.atan2(-dir.z, dir.x);
  for (let c = 0; c < courses; c++) {
    let s = c % 2 ? -len / 2 : 0;
    while (s < L) {
      const l = Math.min(len * (0.8 + R() * 0.4), L - Math.max(0, s)); if (l < 0.05) break;
      const s0 = Math.max(0, s), mid = s0 + l / 2;
      const g = new THREE.BoxGeometry(l - 0.012, h - 0.01 - R() * 0.012, d - R() * 0.02);
      const u = g.attributes.uv, ox = R(), oy = R(); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * l * 2 + ox, u.getY(i) * h * 2 + oy);
      const p = a.clone().addScaledVector(dir, mid);
      bake(g, [p.x + (R() - 0.5) * jit, y + c * h + h / 2 + (R() - 0.5) * 0.006, p.z + (R() - 0.5) * jit], [(R() - 0.5) * 0.03, ry + (R() - 0.5) * 0.04, (R() - 0.5) * 0.03]);
      tint(g, '#ffffff', 0.78 + R() * 0.4);
      parts.push(g);
      s = s0 + l;
    }
  }
  return parts;
}
// Flagstones of the courtyard (kota-like stone), each slab its own tone, a little proud or sunk.
export function flagstones(R, x0, x1, z0, z1, s = 0.55) {
  const parts = [];
  for (let z = z0; z < z1 - 0.01; z += s) {
    let x = x0 - R() * s;
    while (x < x1) {
      const w = s * (0.8 + R() * 0.6), d = Math.min(s, z1 - z);
      const g = LOD.k < 1 ? new THREE.BoxGeometry(w - 0.02, 0.04, d - 0.02) : new RoundedBoxGeometry(w - 0.02, 0.04, d - 0.02, 1, 0.008);
      const u = g.attributes.uv, ox = R(), oy = R(); for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * w + ox, u.getY(i) * d + oy);
      bake(g, [x + w / 2, -0.012 + (R() - 0.5) * 0.008, z + d / 2], [(R() - 0.5) * 0.01, (R() - 0.5) * 0.02, (R() - 0.5) * 0.01]);
      const k = 0.75 + R() * 0.45; tint(g, R() < 0.2 ? '#c8b89a' : '#a8a088', k);
      parts.push(g); x += w;
    }
  }
  return merge(parts, true);
}
export function stoneTexture(seed = 29, N = 256) {
  const c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, h = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, o = (j * N + i) * 4, n = fbm2(u * 5 + seed, v * 5, 5), sp = noise2(i / 1.8, j / 1.8 + seed);
    const k = 0.82 + n * 0.3 + sp * 0.05;
    d[o] = 200 * k; d[o + 1] = 196 * k; d[o + 2] = 182 * k; d[o + 3] = 255;
    h[j * N + i] = 0.5 + n * 0.03 + sp * 0.01;
  }
  x.putImageData(img, 0, 0);
  const map = toTexture(c, { repeat: true, anisotropy: 4 });
  const normalMap = heightToNormal(h, N, N, 3, true); normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

// ------------------------------------------------------------------ manuscript, tray, banana leaf
// Palm-leaf folio of the Charaka Samhita (the script is suggested, not legible): rows of looped glyphs
// incised and inked, two string holes, fibre lines, darkened edges.
export function palmLeafTexture(seed = 31, W = 1024, H = 128) {
  const R = rng(seed), c = mkCanvas(W, H), x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = i / W, v = j / H, o = (j * W + i) * 4;
    const fib = noise2(i / 40, j / 1.2 + seed) * 0.06, n = fbm2(u * 6, v * 2 + seed, 3) * 0.12;
    const edge = Math.min(u, 1 - u, v * 6, (1 - v) * 6), dark = sat(1 - edge * 8) * 0.35;
    const k = 0.92 + fib + n - dark;
    d[o] = 214 * k; d[o + 1] = 178 * k; d[o + 2] = 112 * k; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(38,24,14,0.85)'; x.lineWidth = 1.3; x.lineCap = 'round';
  for (let row = 0; row < 4; row++) {
    const y = 26 + row * 25;
    let px = 30;
    while (px < W - 30) {
      if (Math.abs(px - W * 0.3) < 22 || Math.abs(px - W * 0.7) < 22) { px += 44; continue; }
      // a glyph: a headline stroke over loops and hooks
      const gw = 9 + R() * 7;
      x.beginPath(); x.moveTo(px, y - 7); x.lineTo(px + gw, y - 7); x.stroke();
      x.beginPath(); x.arc(px + gw * 0.4, y, 3 + R() * 2, R() * 3, R() * 3 + 4); x.stroke();
      if (R() < 0.6) { x.beginPath(); x.moveTo(px + gw * 0.8, y - 7); x.lineTo(px + gw * 0.8, y + 5); x.stroke(); }
      if (R() < 0.3) { x.beginPath(); x.arc(px + gw * 0.5, y - 11, 2.5, Math.PI, 0); x.stroke(); }
      px += gw + 2 + (R() < 0.15 ? 10 : 0);
    }
  }
  for (const hx of [W * 0.3, W * 0.7]) { x.beginPath(); x.arc(hx, H / 2, 6, 0, TAU); x.fillStyle = '#2a1a10'; x.fill(); }
  return toTexture(c, { anisotropy: 8 });
}
export function manuscriptGeometry(seed = 33, n = 26, L = 0.34, Wd = 0.042) {
  const R = rng(seed), leaves = [], top = [];
  for (let i = 0; i < n; i++) {
    const g = gridSurf((u, v, p) => p.set((u - 0.5) * L, Math.sin(u * Math.PI) * 0.002 + (v - 0.5) * 0.0004, (v - 0.5) * Wd * (1 - 0.15 * Math.pow(Math.abs(u - 0.5) * 2, 6))), 16, 1);
    const box = new THREE.BoxGeometry(L * 0.995, 0.0011, Wd * 0.98);
    bake(box, [(R() - 0.5) * 0.003, 0.016 + i * 0.0012, (R() - 0.5) * 0.002], [0, (R() - 0.5) * 0.012, 0]);
    leaves.push(box);
    if (i === n - 1) { bake(g, [0, 0.016 + n * 0.0012 + 0.0006, 0], [0, 0.004, 0]); top.push(g); }
  }
  // the wooden covers: thick boards with chamfered edges and a carved border (bottom one under the stack,
  // the top one set aside, open)
  const cover = (y, x, ry) => { const g = new RoundedBoxGeometry(L + 0.012, 0.012, Wd + 0.01, 2, 0.003); bake(g, [x, y, 0], [0, ry, 0]); return g; };
  const covers = [cover(0.009, 0, 0), cover(0.006, 0.0, 0)];
  covers[1].translate(0, 0, Wd + 0.035); covers[1].rotateY(0.05);
  // the string, through the holes, gathered with a knot and a wooden bead
  const str = [];
  for (const hx of [-0.3 + 0.5, 0.7 - 0.5]) {
    const x0 = (hx - 0.5) * L;
    str.push(stem([V3(x0, 0.0, 0), V3(x0, 0.05, 0), V3(x0 + 0.01, 0.052, 0.012), V3(x0 + 0.03, 0.03, 0.05), V3(x0 + 0.06, 0.004, 0.085)], 0.0012, 0.0012, 5, 300));
  }
  const bead = bake(new THREE.SphereGeometry(0.006, 12, 8), [0.068 - L * 0.2, 0.006, 0.09]);
  return { stack: merge(leaves), top: merge(top), covers: merge(covers), string: merge([...str, bead]) };
}
// Woven bamboo tray (round, shallow) with a basket weave texture + normal map (planar UV).
export function weaveMaps(N = 512, seed = 37) {
  const c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data, h = new Float32Array(N * N);
  const S = 24;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const cu = Math.floor(i / S), cv = Math.floor(j / S), fu = (i % S) / S, fv = (j % S) / S;
    const over = (cu + cv) % 2 === 0;
    const across = over ? fv : fu, along = over ? fu : fv;
    const strand = Math.sin(across * Math.PI);
    const k = 0.75 + 0.25 * strand + noise2(i / 30 + cu * 3, j / 30 + seed) * 0.08 - (along < 0.08 || along > 0.92 ? 0.25 : 0);
    const o = (j * N + i) * 4;
    d[o] = 204 * k; d[o + 1] = 164 * k; d[o + 2] = 100 * k; d[o + 3] = 255;
    h[j * N + i] = 0.5 + strand * 0.25 * (0.6 + 0.4 * Math.sin(along * Math.PI));
  }
  x.putImageData(img, 0, 0);
  return { map: toTexture(c, { anisotropy: 4 }), normalMap: heightToNormal(h, N, N, 2.5, true) };
}
export function trayGeometry(r = 0.2) {
  const base = gridSurf((u, v, p) => { const a = u * TAU, rr = v * r; p.set(Math.cos(a) * rr, Math.pow(v, 3) * 0.022, Math.sin(a) * rr); }, 48, 10);
  { const uv = base.attributes.uv, pp = base.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + pp.getX(i) / (2 * r), 0.5 + pp.getZ(i) / (2 * r)); }
  const ix = base.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; }
  base.computeVertexNormals();
  const rim = new THREE.TorusGeometry(r, 0.008, 6, 64); rim.rotateX(Math.PI / 2); rim.translate(0, 0.022, 0);
  return { base, rim };
}
// A torn section of banana leaf lying flat (along +x), wavy, with frayed tears between the veins.
export function bananaLeafPiece(L = 0.5, W = 0.26, seed = 41) {
  const R = rng(seed), tears = [...Array(4)].map(() => [0.15 + R() * 0.7, 0.3 + R() * 0.5]);
  return gridSurf((u, v, p) => {
    let w = v;
    for (const [tu, depth] of tears) { const k = Math.exp(-(((u - tu) / 0.012) ** 2)); if (v > 1 - depth) w -= k * 0.02; }
    const edge = 1 - 0.06 * noise2(u * 30, seed) * Math.pow(Math.abs(v - 0.5) * 2, 4);
    p.set(u * L, 0.004 * Math.sin(u * 16 + v * 2) * v + 0.006 * Math.pow(Math.abs(v - 0.1), 2), (w - 0.1) * W * edge);
  }, 30, 8);
}

// ------------------------------------------------------------------ sea, sky, dhow
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir, uZen, uHor, uSunCol, uHaze; uniform float uTime;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHor, uZen, pow(smoothstep(-0.02, 0.55, h), 0.7));
  float s = max(dot(d, uSunDir), 0.0);
  float az = atan(d.x, -d.z);
  float cl = smoothstep(0.35, 0.9, snoise(vec3(az * 1.6, h * 10.0, 1.0)) * 0.6 + snoise(vec3(az * 5.0, h * 26.0, 4.0)) * 0.4);
  float band = smoothstep(0.02, 0.08, h) * (1.0 - smoothstep(0.12, 0.35, h));
  c = mix(c, uSunCol * (0.35 + 1.2 * pow(s, 5.0)) + uHaze * 0.4, cl * band * 0.45);
  c += uSunCol * (pow(s, 8.0) * 0.35 + pow(s, 64.0) * 0.6 + pow(s, 600.0) * 2.0);
  c += uSunCol * smoothstep(0.9994, 0.9997, s) * 12.0;
  c = mix(c, uHaze, (1.0 - smoothstep(0.0, 0.12, abs(h))) * 0.55);
  return c;
}`;
// The dhow: a long low hull with a raked stem and a high stern, one mast and its lateen sail.
export function dhowGeometry() {
  const hull = gridSurf((u, v, p) => {
    const x = (u - 0.5) * 12, a = v * Math.PI;                   // a: 0 → π round the underside
    const beam = 1.6 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.6), depth = 1.1 * Math.pow(Math.sin(Math.PI * u), 0.4);
    const sheer = 1.0 + 0.6 * Math.pow(u, 3) + 0.4 * Math.pow(1 - u, 3);
    p.set(x + (1 - u) * Math.cos(a) * 0 , sheer - Math.sin(a) * depth, Math.cos(a) * beam);
  }, 24, 8);
  const mast = bake(new THREE.CylinderGeometry(0.08, 0.12, 9, 6), [0.6, 5.4, 0], [0, 0, 0.12]);
  const sail = new THREE.BufferGeometry();
  const sp = [V3(-5.2, 2.6, 0), V3(5.6, 10.6, 0), V3(1.5, 1.8, 0.4)];
  const mid = V3(0.4, 5.6, 0.9);
  sail.setAttribute('position', new THREE.Float32BufferAttribute([...sp[0].toArray(), ...mid.toArray(), ...sp[2].toArray(), ...sp[0].toArray(), ...sp[1].toArray(), ...mid.toArray(), ...mid.toArray(), ...sp[1].toArray(), ...sp[2].toArray()], 3));
  sail.computeVertexNormals();
  const yard = stem([V3(-5.4, 2.5, 0), V3(0, 6.6, 0.05), V3(5.8, 10.8, 0)], 0.08, 0.05, 5, 3);
  return { hull: merge([hull, mast, yard]), sail };
}
