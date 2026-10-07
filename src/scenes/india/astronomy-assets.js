// ASTRONOMY — Jantar Mantar close-up detail (Explore): the Samrat Yantra's masonry trims, a real stair
// (stone tread slabs with worn, rounded nosings over plastered risers), moulded arch surrounds, plinths
// and string courses, the marble declination scales along the gnomon's edges, a proper chhatri
// (octagonal columns, bracket capitals, a sloping chhajja, a ribbed dome and kalash finial), and the
// Rama Yantras as built: twelve wall piers with openings, raised graduated floor sectors, a central
// pillar. Plus the procedural lime-plaster and marble maps. Geometry is returned in the jaipur
// group's frame (metres), non-indexed with box-projected UVs, ready to merge.
import * as THREE from 'three';
import { rng, TAU } from '../../lib/math.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { FONTS } from '../../lib/text.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// normalise for merging (non-indexed, position / normal / uv)
export function prepGeo(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  n.clearGroups();
  return n;
}
// planar UVs per triangle along its dominant axis, `s` UV units per metre (vertical faces: v = height)
export function boxUV(g, s = 1) {
  const p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2);
  const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
  for (let i = 0; i + 2 < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    b.sub(a); c.sub(a); b.cross(c);
    const ax = Math.abs(b.x), ay = Math.abs(b.y), az = Math.abs(b.z);
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
// quad strip between polylines (Vector3 arrays of equal length)
function strip(A, B) {
  const pos = [], idx = [];
  for (let i = 0; i < A.length; i++) pos.push(A[i].x, A[i].y, A[i].z, B[i].x, B[i].y, B[i].z);
  for (let i = 0; i < A.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ maps
// Lime plaster over rubble, ochre-pink: trowel mottling, patched repairs, hairline cracks, faint
// block courses scored into the render (0.6 m rows, staggered 1.2 m joints). One tile = 4 m.
export function plasterMaps() {
  const S = 1024, M = 4, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  const h = new Float32Array(S * S), r = rng(1734);
  const per = (x, y, f, o = 4) => {   // tileable fbm by blending the four wraps
    const u = x / S, v = y / S;
    const A = fbm2(u * f, v * f, o), B = fbm2((u - 1) * f, v * f, o), C = fbm2(u * f, (v - 1) * f, o), D = fbm2((u - 1) * f, (v - 1) * f, o);
    return (A * (1 - u) + B * u) * (1 - v) + (C * (1 - u) + D * u) * v;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n1 = per(x, y, 3), n2 = per(x, y, 14, 3), n3 = noise2(x / 1.6, y / 1.6);
    const row = (y / S) * M / 0.6, rowI = Math.floor(row), fy = row - rowI;
    const colOff = (rowI % 2) * 0.6, col = ((x / S) * M + colOff) / 1.2, fx = col - Math.floor(col);
    const joint = Math.max(1 - Math.min(fy, 1 - fy) * 0.6 / 0.012, 1 - Math.min(fx, 1 - fx) * 1.2 / 0.012, 0);
    const o = (y * S + x) * 4;
    const l = 0.92 + 0.12 * n1 + 0.06 * n2 + 0.03 * n3 - 0.12 * Math.max(0, joint);
    d[o] = 226 * l; d[o + 1] = 176 * l; d[o + 2] = 136 * l; d[o + 3] = 255;
    h[y * S + x] = 0.5 * n2 + 0.25 * n3 - 1.4 * Math.max(0, joint);
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 26; k++) {                 // repairs: paler patches of newer lime
    g.fillStyle = `rgba(${r() < 0.5 ? '246,214,182' : '196,150,116'},${0.15 + r() * 0.2})`;
    g.beginPath(); const cx = r() * S, cy = r() * S, rr = 20 + r() * 80;
    for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU, q = rr * (0.7 + 0.3 * noise2(cx + Math.cos(a), cy + Math.sin(a))); g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.7); }
    g.fill();
  }
  g.strokeStyle = 'rgba(90,55,35,0.35)'; g.lineWidth = 1;   // hairline cracks
  for (let k = 0; k < 18; k++) {
    let x = r() * S, y = r() * S, a = r() * TAU; g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 20; i++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  const bc = document.createElement('canvas'); bc.width = bc.height = S;
  const bg = bc.getContext('2d'), bi = bg.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const v = Math.max(0, Math.min(255, 128 + h[i] * 90)); bi.data[i * 4] = bi.data[i * 4 + 1] = bi.data[i * 4 + 2] = v; bi.data[i * 4 + 3] = 255; }
  bg.putImageData(bi, 0, 0);
  const bump = new THREE.CanvasTexture(bc); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.anisotropy = 8;
  return { map, bump, metres: M };
}

// White marble declination scale for the gnomon's edges: one tile = 1 m along the slope; ticks every
// 2.5 cm, longer every 10 cm, a drilled dot at every 50 cm; slab joints at the tile ends.
export function declinationTexture() {
  const W = 1024, H = 96, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(23);
  g.fillStyle = '#e9e2d4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '150,140,125' : '255,252,245'},${0.04 + r() * 0.06})`; g.beginPath(); g.ellipse(r() * W, r() * H, 10 + r() * 80, 2 + r() * 6, (r() - 0.5) * 0.4, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(40,30,22,0.85)';
  g.lineWidth = 2; g.beginPath(); g.moveTo(0, 14); g.lineTo(W, 14); g.moveTo(0, H - 14); g.lineTo(W, H - 14); g.stroke();
  for (let k = 0; k < 40; k++) {
    const x = (k + 0.5) * W / 40, L = k % 4 === 0 ? 0.5 : 0.28;
    g.lineWidth = k % 4 === 0 ? 2.4 : 1.4;
    g.beginPath(); g.moveTo(x, 14); g.lineTo(x, 14 + L * (H - 28)); g.stroke();
    if (k % 20 === 10) { g.fillStyle = 'rgba(40,30,22,0.9)'; g.beginPath(); g.arc(x, H - 26, 4, 0, TAU); g.fill(); }
  }
  g.fillStyle = 'rgba(80,65,50,0.6)'; g.fillRect(0, 0, 2, H);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Graduated marble sector top for the Rama Yantra floors (radial lines every 1°, numerals every 10°).
export function sectorTexture() {
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(7);
  g.fillStyle = '#e6dccb'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '150,135,115' : '255,250,240'},${0.04 + r() * 0.05})`; g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 40, 2 + r() * 8, r() * 3, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(45,32,22,0.8)';
  for (let k = 0; k <= 30; k++) { const x = (k / 30) * W; g.lineWidth = k % 10 === 0 ? 3 : k % 5 === 0 ? 2 : 1; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, k % 5 === 0 ? H : H * 0.55); g.stroke(); }
  for (const y of [0.25, 0.5, 0.75]) { g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, y * H); g.lineTo(W, y * H); g.stroke(); }
  g.font = `600 40px "${FONTS.serif}"`; g.fillStyle = 'rgba(45,32,22,0.85)'; g.textAlign = 'center';
  for (const k of [10, 20]) g.fillText(String(k), (k / 30) * W, H * 0.68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ the Samrat Yantra in detail
// c: the scene's construction constants { H, W2, TAN, LAT, ZN, ZTOP, ZTOE, PAR, ARCHES, cz, quad: [{lo, hi, gLo, gHi}] }
// Returns { stone, tread, marble, chhatri } arrays of prepped geometries (in metres, uv not yet set).
export function samratDetail(c, { lite = false } = {}) {
  const { H, W2, TAN, LAT, ZN, ZTOP, ZTOE, PAR, ARCHES } = c;
  const yEdge = (z) => (ZTOE - z) * TAN + PAR;
  const stone = [], tread = [], marble = [];
  const put = (list, g, x = 0, y = 0, z = 0) => { const q = prepGeo(g); q.translate(x, y, z); list.push(q); return q; };
  const R = rng(64);

  // ---- the stair: plastered risers under stone tread slabs with rounded, worn nosings
  {
    const N = 64, rise = H / N, tr = rise / TAN, w = 2 * W2 - 0.84, th = 0.07, nose = 0.05;
    const prof = new THREE.Shape();   // tread section in (z, y): front nose rounded
    prof.moveTo(0, 0); prof.lineTo(tr + nose - 0.03, 0); prof.quadraticCurveTo(tr + nose, 0, tr + nose, th * 0.5); prof.quadraticCurveTo(tr + nose, th, tr + nose - 0.03, th); prof.lineTo(0, th); prof.closePath();
    for (let i = 0; i < N; i++) {
      const top = (i + 1) * rise, zf = ZTOE - i * tr;           // front edge of this step
      put(stone, new THREE.BoxGeometry(w, rise + 0.4 - th, tr), 0, top - th - (rise + 0.4 - th) / 2, zf - tr / 2);
      const g = new THREE.ExtrudeGeometry(prof, { depth: w - 0.02, steps: lite ? 2 : 8, bevelEnabled: false, curveSegments: lite ? 2 : 4 });
      // shape (sx, sy) → world (z = zf + nose - sx … , y), depth → x
      g.rotateY(-Math.PI / 2);                                 // depth (z) → -x ; shape x → z
      const p = g.attributes.position, wear = 0.012 + R() * 0.012;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k), z = p.getZ(k), y = p.getY(k);
        const xc = x + (w - 0.02) / 2;                         // centred across the stair
        const fz = Math.max(0, 1 - Math.abs((z - (tr + nose) * 0.75) / ((tr + nose) * 0.5)));
        const dip = y > th * 0.6 ? wear * Math.max(0, 1 - (xc / (w * 0.42)) ** 2) * (0.4 + 0.6 * fz) : 0;
        p.setXYZ(k, xc, y - dip + (R() - 0.5) * 0.002, zf - tr + z);
      }
      g.computeVertexNormals();
      put(tread, g, 0, top - th, 0);
    }
  }

  // ---- the gnomon's walls: plinth, string course under the parapet, arch surrounds with keystones
  const len = H / Math.sin(LAT), zm = (ZTOE + ZTOP) / 2;
  for (const s of [-1, 1]) {
    const zEnd = ZTOE - 1.6;
    put(stone, new THREE.BoxGeometry(0.16, 0.65, zEnd - ZN + 0.16), s * (W2 + 0.08), 0.325, (zEnd + ZN - 0.16) / 2);
    put(stone, new THREE.BoxGeometry(0.1, 0.08, zEnd - ZN + 0.1), s * (W2 + 0.05), 0.69, (zEnd + ZN - 0.1) / 2);
    // string course: a projecting band just under the parapet's top, down the whole slope
    const sc = new THREE.BoxGeometry(0.08, 0.2, len - 2.4); sc.rotateX(LAT);
    put(stone, sc, s * (W2 + 0.04), yEdge(zm) - 0.42, zm + 0.0);
    const sc2 = new THREE.BoxGeometry(0.05, 0.06, len - 2.4); sc2.rotateX(LAT);
    put(stone, sc2, s * (W2 + 0.025), yEdge(zm) - 0.6, zm);
    // the vertical north face's band
    for (const [ys, hh] of [[H - 0.42, 0.2], [H - 0.6, 0.06]]) put(stone, new THREE.BoxGeometry(0.08, hh, ZTOP - ZN), s * (W2 + 0.04), ys, (ZN + ZTOP) / 2);
    // arch surrounds
    for (const [zc, top] of ARCHES) {
      const hw = zc > 10 ? 1.25 : 1.5, x = -zc, y0 = 0.6, f = 0.26;
      const outer = new THREE.Shape();
      outer.moveTo(x - hw - f, y0 - 0.02); outer.lineTo(x + hw + f, y0 - 0.02); outer.lineTo(x + hw + f, top - hw); outer.absarc(x, top - hw, hw + f, 0, Math.PI, false); outer.lineTo(x - hw - f, y0 - 0.02);
      const hole = new THREE.Path();
      hole.moveTo(x - hw, y0 - 0.02); hole.lineTo(x - hw, top - hw); hole.absarc(x, top - hw, hw, Math.PI, 0, true); hole.lineTo(x + hw, y0 - 0.02); hole.lineTo(x - hw, y0 - 0.02);
      outer.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: lite ? 10 : 20 });
      g.rotateY(Math.PI / 2);
      put(stone, g, s > 0 ? W2 : -W2 - 0.07, 0, 0);
      // keystone and impost blocks
      const ks = new THREE.BoxGeometry(0.16, 0.5, 0.42); put(stone, ks, s * (W2 + 0.08), top + 0.12, zc);
      for (const e of [-1, 1]) put(stone, new THREE.BoxGeometry(0.12, 0.18, 0.5), s * (W2 + 0.06), top - hw, zc + e * (hw + 0.13));
      // the reveal (inner faces of the opening) gets a stepped jamb
      for (const e of [-1, 1]) put(stone, new THREE.BoxGeometry(2 * W2 - 0.3, 0.08, 0.08), 0, y0 + 0.04, zc + e * (hw - 0.04));
    }
  }
  // the declination scales: marble strips along the parapet tops, and their coping on the stair side
  for (const s of [-1, 1]) {
    const m = new THREE.BoxGeometry(0.34, 0.025, len); m.rotateX(LAT);
    const q = put(marble, m, s * (W2 - 0.2), yEdge(zm) + 0.0125 - 0.0, zm);
    const uv = q.attributes.uv, p = q.attributes.position;   // u along the slope in metres
    for (let i = 0; i < p.count; i++) uv.setXY(i, ((ZTOE - p.getZ(i)) / Math.cos(LAT)), (p.getX(i) - s * (W2 - 0.2)) / 0.34 + 0.5);
    const cp = new THREE.BoxGeometry(0.06, 0.1, len - 0.4); cp.rotateX(LAT);
    put(stone, cp, s * (W2 - 0.42 - 0.03), yEdge(zm) - 0.05, zm);
  }

  // ---- the chhatri on the top platform
  const chh = [];
  {
    const cz = (ZN + ZTOP) / 2, y0 = H, seg = lite ? 12 : 24;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 1.05, z = cz + sz * 1.05;
      put(chh, new THREE.BoxGeometry(0.36, 0.14, 0.36), x, y0 + 0.07, z);
      put(chh, new THREE.BoxGeometry(0.3, 0.1, 0.3), x, y0 + 0.19, z);
      const shaft = new THREE.CylinderGeometry(0.1, 0.12, 1.75, 8); put(chh, shaft, x, y0 + 0.24 + 0.875, z);
      for (const yb of [0.55, 1.5]) put(chh, new THREE.CylinderGeometry(0.135, 0.135, 0.05, 8), x, y0 + yb, z);
      put(chh, new THREE.CylinderGeometry(0.16, 0.11, 0.16, 8), x, y0 + 2.07, z);          // capital
      // brackets carrying the chhajja, outward on both faces
      for (const [dx, dz] of [[sx, 0], [0, sz]]) {
        const b = new THREE.BoxGeometry(dx ? 0.42 : 0.1, 0.12, dz ? 0.42 : 0.1); put(chh, b, x + dx * 0.21, y0 + 2.1, z + dz * 0.21);
        const b2 = new THREE.BoxGeometry(dx ? 0.22 : 0.08, 0.12, dz ? 0.22 : 0.08); put(chh, b2, x + dx * 0.13, y0 + 1.98, z + dz * 0.13);
      }
    }
    put(chh, new THREE.BoxGeometry(2.6, 0.2, 2.6), 0, y0 + 2.27, cz);                       // lintel frame
    // the chhajja: a thin sloping eave all round
    const ch = new THREE.CylinderGeometry(1.42, 2.15, 0.34, 4, 1, true); ch.rotateY(Math.PI / 4); put(chh, ch, 0, y0 + 2.2, cz);
    const ch2 = new THREE.CylinderGeometry(2.15, 2.15, 0.06, 4, 1, false); ch2.rotateY(Math.PI / 4); put(chh, ch2, 0, y0 + 2.0, cz);
    put(chh, new THREE.BoxGeometry(2.2, 0.22, 2.2), 0, y0 + 2.48, cz);                     // drum base
    // ribbed dome on a short drum, lotus band, kalash finial
    const prof = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, a = u * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.02, 1.0 * Math.cos(a) * (1 + 0.12 * Math.sin(a * 2))), 0.25 + 1.05 * Math.sin(a))); }
    prof.unshift(new THREE.Vector2(1.0, 0.0), new THREE.Vector2(1.04, 0.12), new THREE.Vector2(1.0, 0.25));
    const dg = new THREE.LatheGeometry(prof, seg * 2);
    const dp = dg.attributes.position;
    for (let i = 0; i < dp.count; i++) { const x = dp.getX(i), z = dp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.025 * Math.pow(Math.abs(Math.cos(a * 8)), 0.5) * (dp.getY(i) > 0.3 ? 1 : 0); dp.setX(i, x * k); dp.setZ(i, z * k); }
    put(chh, dg, 0, y0 + 2.59, cz);
    const fin = [[0, 0], [0.2, 0], [0.22, 0.05], [0.12, 0.1], [0.16, 0.2], [0.07, 0.3], [0.12, 0.38], [0.05, 0.48], [0.08, 0.53], [0.02, 0.7], [0, 0.72]];
    put(chh, new THREE.LatheGeometry(fin.map(([r, y]) => new THREE.Vector2(r, y)), seg), 0, y0 + 3.88, cz);
  }

  // ---- the quadrants' walls: a moulded plinth at the foot of both faces
  for (const q of c.quad) {
    for (const [gl, out] of [[q.gLo, 1], [q.gHi, -1]]) {
      const A = gl.map((p) => V(p.x, 0, p.z + out * 0.14)), B = gl.map((p) => V(p.x, 0.6, p.z + out * 0.14)), C = gl.map((p) => V(p.x, 0.68, p.z + out * 0.02));
      if (out > 0) { put(stone, strip(A, B)); put(stone, strip(B, C)); } else { put(stone, strip(B, A)); put(stone, strip(C, B)); }
    }
  }
  return { stone, tread, marble, chhatri: chh };
}

// ------------------------------------------------------------------ the Rama Yantra
// A cylindrical wall of twelve piers (open between them, each pier pierced by two arched niches),
// twelve raised floor sectors with graduated marble tops at waist height, and the central pillar.
export function ramaYantra(x0, z0, { lite = false } = {}) {
  const wall = [], marble = [];
  const RO = 6.5, RI = 6.0, HW = 4.2, seg = lite ? 4 : 8;
  const put = (list, g, x = 0, y = 0, z = 0) => { const q = prepGeo(g); q.translate(x0 + x, y, z0 + z); list.push(q); return q; };
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * TAU + 0.06, a1 = ((k + 1) / 12) * TAU - 0.06;
    const sh = new THREE.Shape();   // pier: an annular sector in plan, extruded up
    sh.absarc(0, 0, RO, a0, a1, false); sh.absarc(0, 0, RI, a1, a0, true); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: HW, bevelEnabled: false, curveSegments: seg });
    g.rotateX(-Math.PI / 2);
    put(wall, g);
    // a coping on each pier and a plinth
    const cp = new THREE.Shape(); cp.absarc(0, 0, RO + 0.1, a0 - 0.008, a1 + 0.008, false); cp.absarc(0, 0, RI - 0.1, a1 + 0.008, a0 - 0.008, true); cp.closePath();
    const cg = new THREE.ExtrudeGeometry(cp, { depth: 0.18, bevelEnabled: false, curveSegments: seg }); cg.rotateX(-Math.PI / 2); put(wall, cg, 0, HW, 0);
    const pg = new THREE.ExtrudeGeometry(cp, { depth: 0.35, bevelEnabled: false, curveSegments: seg }); pg.rotateX(-Math.PI / 2); put(wall, pg, 0, 0, 0);
    // the floor sector between centre and wall, raised, with its graduated top
    const fa0 = (k / 12) * TAU + 0.004, fa1 = fa0 + TAU / 12 * 0.5 - 0.008;
    const fs = new THREE.Shape(); fs.absarc(0, 0, RI - 0.05, fa0, fa1, false); fs.lineTo(Math.cos(fa1) * 0.7, Math.sin(fa1) * 0.7); fs.lineTo(Math.cos(fa0) * 0.7, Math.sin(fa0) * 0.7); fs.closePath();
    const fg = new THREE.ExtrudeGeometry(fs, { depth: 0.95, bevelEnabled: false, curveSegments: seg }); fg.rotateX(-Math.PI / 2); put(wall, fg);
    const mt = new THREE.ShapeGeometry(fs, seg); mt.rotateX(-Math.PI / 2);
    const q = put(marble, mt, 0, 0.955, 0);
    const p = q.attributes.position, uv = q.attributes.uv;
    for (let i = 0; i < p.count; i++) { const dx = p.getX(i) - x0, dz = p.getZ(i) - z0, a = Math.atan2(-dz, dx) - fa0; const w = a - Math.floor(a / TAU + 0.02) * TAU; uv.setXY(i, Math.min(1, Math.max(0, w / (fa1 - fa0))), Math.hypot(dx, dz) / RI); }
  }
  put(wall, new THREE.CylinderGeometry(0.42, 0.5, 0.5, 12), 0, 0.25, 0);
  put(wall, new THREE.CylinderGeometry(0.3, 0.35, 4.2, 12), 0, 2.6, 0);
  put(wall, new THREE.CylinderGeometry(0.4, 0.32, 0.22, 12), 0, 4.8, 0);
  return { wall, marble };
}
