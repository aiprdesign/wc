// STONE AND SPIRIT — procedural monuments for src/scenes/india/temples.js.
// Every monument is modelled in metres in its own frame (front = +z) as plain parts gathered per material
// (Parts) and merged into a handful of meshes. Proportions follow the real buildings, simplified to the
// silhouettes and masses that read in a fast camera move:
//   Great Stupa, Sanchi  — railed drum (medhi), hemispherical anda, harmika and three-tiered chhatra,
//                          the ground railing (vedika) and the four toranas
//   Kailasa, Ellora      — the trench cut into the basalt, the temple on its high plinth: Nandi mandapa,
//                          pillared hall, Dravidian vimana, two elephants, two dhvajastambhas, cloisters
//   Brihadeeswarar       — the 66 m granite vimana (two-storey walls, 13 tiers, capstone and kalasha)
//   Taj Mahal            — plinth, chamfered block with pishtaqs, drum and onion dome, chhatris, minarets
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas as mkCanvas, toTexture, marbleTexture } from '../../lib/textures.js';
import { noise3, fbm2 } from '../../lib/noise.js';
import { rng } from '../../lib/math.js';

// ------------------------------------------------------------------------------------------- parts
// Non-indexed position / normal / uv, so hundreds of parts merge into one mesh per material.
export function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  return n;
}
// Box-projected world UVs per triangle (s = tiles per metre).
export function worldUV(g, s = 0.25) {
  const p = g.attributes.position, uv = g.attributes.uv, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const nrm = c.sub(b).cross(a.sub(b)); const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
    for (let k = i; k < i + 3; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (ay >= ax && ay >= az) uv.setXY(k, x * s, z * s); else if (ax >= az) uv.setXY(k, z * s, y * s); else uv.setXY(k, x * s, y * s);
    }
  }
  return g;
}
export class Parts {
  constructor() { this.L = {}; }
  add(key, g, x = 0, y = 0, z = 0, ry = 0) {
    const n = prep(g); if (ry) n.rotateY(ry); n.translate(x, y, z);
    (this.L[key] ??= []).push(n); return n;
  }
  box(key, x0, x1, y0, y1, z0, z1) { return this.add(key, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
  // merge each list into one mesh; `mats` maps key → material, `uvs` key → world-UV scale
  build(mats, uvs = {}, { cast = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [k, list] of Object.entries(this.L)) {
      if (!mats[k] || !list.length) continue;
      const g = worldUV(mergeGeometries(list), uvs[k] ?? 0.25);
      const m = new THREE.Mesh(g, mats[k]); m.castShadow = cast; m.receiveShadow = receive; m.name = k;
      grp.add(m);
    }
    return grp;
  }
}
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg);
// box with a gentle noise displacement (consistent for coincident vertices, so no cracks): hewn rock
export function rockBox(w, h, d, { cell = 4, amp = 0.6, freq = 0.08, seed = 0, front = 0, ragged = 0 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell)), Math.max(1, Math.round(d / cell)));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const f = freq;
    // a natural, weathered face at the front (+z), cut-straight faces elsewhere; a ragged skyline on top
    const fr = front * Math.min(1, Math.max(0, (z - (d / 2 - 8)) / 8)) * Math.min(1, (y + h / 2) / 6);
    const a = amp + fr;
    const top = ragged * Math.max(0, (y - (h / 2 - 1)) / 1) * (0.6 + noise3(x * 0.04 + seed, 3.1, z * 0.04));
    p.setXYZ(i, x + a * noise3(x * f + seed, y * f, z * f), y + amp * 0.35 * noise3(x * f, y * f + seed + 7, z * f) + top * 2.5 + fr * 0.4 * noise3(x * 0.11, y * 0.11, seed),
      z + a * noise3(x * f, y * f, z * f + seed + 13) + fr * 1.2 * noise3(x * 0.03 + seed, y * 0.05, 2.0));
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------- textures
// Ashlar coursing: courses of blocks with staggered joints, mottled stone (one tile = 1 / s metres).
function ashlarTexture({ base = [196, 168, 132], joint = [92, 76, 58], courses = 4, blocks = 3, seed = 1, speck = 0.18, size = 256 } = {}) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), r = rng(seed);
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm2(x / 40 + seed, y / 40, 4) * 0.5 + 0.5, s = r();
    const k = 0.82 + 0.3 * n + (s < speck ? (r() - 0.5) * 0.25 : 0);
    const i = (y * size + x) * 4;
    d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const ch = size / courses, bw = size / blocks;
  for (let k = 0; k < courses; k++) {
    const off = (k % 2) * bw / 2, y0 = Math.round(k * ch);
    // per-block tone (wrapping round the tile)
    for (let b = -1; b < blocks; b++) {
      const v = (r() - 0.5) * 0.14;
      g.fillStyle = v > 0 ? `rgba(255,240,220,${v})` : `rgba(30,20,10,${-v})`;
      g.fillRect(Math.round(off + b * bw), y0, Math.round(bw), Math.ceil(ch));
    }
    g.fillStyle = `rgb(${joint.join(',')})`;
    g.fillRect(0, y0, size, 2);
    for (let b = 0; b <= blocks; b++) g.fillRect(Math.round(off + b * bw) % size, y0, 2, Math.ceil(ch));
  }
  return toTexture(c, { repeat: true });
}
// Basalt: dark, grainy, with soft horizontal flow bands and chisel streaks.
function basaltTexture(size = 256) {
  const c = mkCanvas(size, size), g = c.getContext('2d'), r = rng(31);
  const img = g.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const band = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 6 + fbm2(x / 70, y / 30, 3) * 2.4);
    const n = fbm2(x / 22 + 3, y / 22, 4) * 0.5 + 0.5;
    const k = 0.7 + 0.22 * band + 0.3 * n + (r() - 0.5) * 0.16;
    const i = (y * size + x) * 4;
    d[i] = 142 * k; d[i + 1] = 122 * k; d[i + 2] = 104 * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(40,30,24,0.25)';
  for (let k = 0; k < 120; k++) { const x = r() * size, y = r() * size; g.lineWidth = 0.6 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 6 + r() * 14); g.stroke(); }
  return toTexture(c, { repeat: true });
}

// ------------------------------------------------------------------------------------------- materials
export function makeMaterials() {
  const sandMap = ashlarTexture({ base: [206, 178, 140], joint: [118, 98, 74], courses: 4, blocks: 2, seed: 3 });
  const graniteMap = ashlarTexture({ base: [212, 168, 118], joint: [110, 84, 58], courses: 5, blocks: 3, seed: 7, speck: 0.4 });
  const basaltMap = basaltTexture();
  const redMap = ashlarTexture({ base: [168, 82, 58], joint: [96, 44, 30], courses: 4, blocks: 3, seed: 9 });
  const marbleMap = marbleTexture({ seed: 4, tint: [244, 240, 234], vein: [196, 188, 180] });
  marbleMap.wrapS = marbleMap.wrapT = THREE.RepeatWrapping;
  return {
    sand: new THREE.MeshStandardMaterial({ map: sandMap, color: '#e6cfa8', roughness: 0.86 }),
    sandDark: new THREE.MeshStandardMaterial({ map: sandMap, color: '#b49a78', roughness: 0.9 }),
    basalt: new THREE.MeshStandardMaterial({ map: basaltMap, color: '#f2dcc4', roughness: 0.88 }),
    cliff: new THREE.MeshStandardMaterial({ map: basaltMap, color: '#e6cdb0', roughness: 0.95 }),
    granite: new THREE.MeshStandardMaterial({ map: graniteMap, color: '#f0d2a8', roughness: 0.78 }),
    marble: new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f6f1ea', roughness: 0.38, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff0dc') }),
    marbleShade: new THREE.MeshStandardMaterial({ map: marbleMap, color: '#b9b2aa', roughness: 0.5 }),
    graniteDark: new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 1 }),
    redsand: new THREE.MeshStandardMaterial({ map: redMap, color: '#d79a80', roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: '#17110d', roughness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#e9b85c', metalness: 1, roughness: 0.28 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#2e3a1c', roughness: 0.92 }),
    grass: new THREE.MeshStandardMaterial({ color: '#4c5a2a', roughness: 0.95 }),
    path: new THREE.MeshStandardMaterial({ map: redMap, color: '#c9a690', roughness: 0.9 }),
  };
}

// =========================================================================================== SANCHI
// Great Stupa: anda c. 36.6 m across and 16.5 m high on its drum; railing and gateways round it.
function torana(P, key = 'sand') {
  const PX = 2.9, PW = 0.78, PH = 5.6;
  for (const sx of [-1, 1]) {
    P.box(key, sx * PX - PW / 2 - 0.12, sx * PX + PW / 2 + 0.12, 0, 0.5, -PW / 2 - 0.12, PW / 2 + 0.12);   // base
    P.box(key, sx * PX - PW / 2, sx * PX + PW / 2, 0.5, PH, -PW / 2, PW / 2);                              // square pillar
    for (const y of [1.9, 3.5]) P.box('sandDark', sx * PX - PW / 2 - 0.02, sx * PX + PW / 2 + 0.02, y, y + 0.9, -PW / 2 - 0.02, PW / 2 + 0.02);   // carved panels
    P.add(key, lathe([[0.32, 0], [0.5, 0.15], [0.56, 0.45], [0.4, 0.6], [0.0, 0.6]], 12), sx * PX, PH, 0);  // bell capital
    P.box(key, sx * PX - 0.8, sx * PX + 0.8, PH + 0.6, PH + 1.55, -0.62, 0.62);                            // elephant / dwarf block
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) P.add('sandDark', new THREE.SphereGeometry(0.42, 10, 8).scale(1.1, 0.9, 0.8), sx * PX + ex * 0.5, PH + 1.05, ez * 0.42);
  }
  // three architraves, gently bowed, ending in spiral scrolls; dies and balusters between them
  const ys = [7.55, 8.95, 10.35], L = 4.9;
  ys.forEach((y, k) => {
    const g = new THREE.BoxGeometry(2 * L, 0.6, 0.62, 24, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const u = p.getX(i) / L; p.setY(i, p.getY(i) + 0.22 * (1 - u * u) * (k === 2 ? 1.2 : 1)); }
    g.computeVertexNormals();
    P.add(key, g, 0, y, 0);
    for (const sx of [-1, 1]) {
      P.add(key, new THREE.CylinderGeometry(0.46, 0.46, 0.66, 18).rotateX(Math.PI / 2), sx * L, y + 0.02, 0);
      P.add('sandDark', new THREE.TorusGeometry(0.28, 0.07, 6, 18), sx * L, y + 0.02, 0.34);
      P.add('sandDark', new THREE.TorusGeometry(0.28, 0.07, 6, 18), sx * L, y + 0.02, -0.34);
    }
    if (k < 2) {
      for (const sx of [-1, 1]) P.box(key, sx * PX - 0.42, sx * PX + 0.42, y + 0.3, ys[k + 1] - 0.15, -0.36, 0.36);
      for (const x of [-1.4, -0.47, 0.47, 1.4]) P.box('sandDark', x - 0.13, x + 0.13, y + 0.45, ys[k + 1] - 0.1, -0.2, 0.2);
    }
  });
  // crown: the wheel of the law on the centre, triratna emblems over the pillars
  const top = ys[2] + 0.52;
  P.add(key, new THREE.TorusGeometry(0.62, 0.11, 8, 28), 0, top + 0.8, 0);
  for (let s = 0; s < 8; s++) P.add(key, new THREE.BoxGeometry(0.06, 1.2, 0.1).rotateZ(s * Math.PI / 8), 0, top + 0.8, 0);
  P.box(key, -0.25, 0.25, top, top + 0.2, -0.25, 0.25);
  for (const sx of [-1, 1]) {
    P.box(key, sx * PX - 0.25, sx * PX + 0.25, top, top + 0.5, -0.2, 0.2);
    for (const dx of [-0.32, 0, 0.32]) P.box(key, sx * PX + dx - 0.07, sx * PX + dx + 0.07, top + 0.5, top + (dx === 0 ? 1.25 : 1.0), -0.08, 0.08);
  }
}
export function buildStupa(P) {
  const DR = 18.3, DH = 4.3;
  // drum (medhi) with its berm walk; a moulded foot and coping
  P.add('sand', lathe([[0, 0], [DR + 0.5, 0], [DR + 0.5, 0.45], [DR + 0.2, 0.6], [DR, DH - 0.35], [DR + 0.25, DH - 0.25], [DR + 0.25, DH], [0, DH]], 72));
  // railing on the berm
  const nb = 96;
  for (let i = 0; i < nb; i++) { const a = i / nb * Math.PI * 2; P.add('sand', new THREE.BoxGeometry(0.28, 1.25, 0.32), Math.cos(a) * (DR - 0.05), DH + 0.62, Math.sin(a) * (DR - 0.05), -a); }
  for (const [y, t] of [[DH + 0.5, 0.1], [DH + 0.9, 0.1], [DH + 1.32, 0.16]]) P.add('sand', new THREE.TorusGeometry(DR - 0.05, t, 4, 120).rotateX(Math.PI / 2), 0, y, 0);
  // the anda: a truncated hemisphere (arc centred just below the drum top), flat top for the harmika
  const yc = -0.7, rd = 17.91, a0 = Math.asin((DH - yc) / rd), a1 = Math.asin((16.5 - yc) / rd);
  const prof = [];
  for (let i = 0; i <= 24; i++) { const a = a0 + (a1 - a0) * i / 24; prof.push([Math.cos(a) * rd, yc + Math.sin(a) * rd]); }
  prof.push([0, 16.5]);
  P.add('sand', lathe([[DR - 1.05, DH], ...prof], 72));
  // harmika: square railing on the summit, then the shaft and the three parasols (chhatra)
  const HS = 2.6, HY = 16.4;
  P.box('sand', -HS - 0.2, HS + 0.2, HY, HY + 0.35, -HS - 0.2, HS + 0.2);
  for (let i = 0; i <= 8; i++) for (const s of [-1, 1]) {
    const u = -HS + i * (2 * HS / 8);
    P.box('sand', u - 0.13, u + 0.13, HY + 0.35, HY + 2.0, s * HS - 0.13, s * HS + 0.13);
    P.box('sand', s * HS - 0.13, s * HS + 0.13, HY + 0.35, HY + 2.0, u - 0.13, u + 0.13);
  }
  for (const y of [HY + 0.9, HY + 1.4]) { P.box('sandDark', -HS, HS, y, y + 0.14, -HS - 0.06, -HS + 0.06); P.box('sandDark', -HS, HS, y, y + 0.14, HS - 0.06, HS + 0.06); P.box('sandDark', -HS - 0.06, -HS + 0.06, y, y + 0.14, -HS, HS); P.box('sandDark', HS - 0.06, HS + 0.06, y, y + 0.14, -HS, HS); }
  P.box('sand', -HS - 0.35, HS + 0.35, HY + 2.0, HY + 2.45, -HS - 0.35, HS + 0.35);
  P.add('sand', new THREE.CylinderGeometry(0.24, 0.3, 6.2, 10), 0, HY + 3.1, 0);
  for (const [y, r] of [[HY + 3.4, 2.3], [HY + 4.6, 1.75], [HY + 5.75, 1.2]]) {
    P.add('sand', lathe([[0, 0], [r, 0.02], [r, 0.22], [r * 0.25, 0.42], [0, 0.42]], 28), 0, y, 0);
  }
  // double stairway on the south up to the berm
  for (const sx of [-1, 1]) for (let s = 0; s < 12; s++) {
    const h = (12 - s) * DH / 12, x0 = sx * (1.2 + s * 0.85);
    P.box('sand', Math.min(x0, x0 + sx * 0.85), Math.max(x0, x0 + sx * 0.85), 0, h, DR - 0.6, DR + 2.2);
  }
  P.box('sand', -12.2, 12.2, 0, 0.35, DR + 2.2, DR + 2.5);
  P.box('sand', -1.2, 1.2, 0, DH, DR - 0.4, DR + 2.3);
  // ground railing (vedika): posts, three lens-section crossbars, rounded coping, with gaps at the gates
  const VR = 24.5, gap = 0.17;
  for (let q = 0; q < 4; q++) {
    const s0 = q * Math.PI / 2 + Math.PI / 4 - (Math.PI / 4 - gap), arc = Math.PI / 2 - 2 * gap;
    const n = Math.round(arc * VR / 1.15);
    for (let i = 0; i <= n; i++) { const a = s0 + arc * i / n; P.add('sand', new THREE.BoxGeometry(0.42, 3.0, 0.42), Math.cos(a) * VR, 1.5, Math.sin(a) * VR, -a); }
    for (const [y, t, sy] of [[0.95, 0.24, 1.3], [1.6, 0.24, 1.3], [2.25, 0.24, 1.3], [3.05, 0.34, 0.85]]) {
      const tg = new THREE.TorusGeometry(VR, t, 5, Math.round(arc * 40), arc); tg.rotateZ(s0); tg.rotateX(Math.PI / 2); tg.scale(1, sy, 1);
      P.add('sand', tg, 0, y, 0);
    }
  }
  // the four gateways, just outside the railing at the cardinal points
  for (let q = 0; q < 4; q++) {
    const a = q * Math.PI / 2 + Math.PI / 2; // +z first (south, facing the camera)
    const T = new Parts(); torana(T);
    for (const [k, list] of Object.entries(T.L)) for (const g of list) { g.translate(0, 0, VR + 2.6); g.rotateY(a - Math.PI / 2); (P.L[k] ??= []).push(g); }
  }
}

// =========================================================================================== KAILASA
// Trench c. 84 × 52 m cut 34 m down into the basalt; the temple stands free in it.
export const K = { X0: -42, X1: 42, Z0: -30, Z1: 22, H: 34, L: -78, R: 78 };
function vimanaTiers(P, key, s0, y0, tiers, dS, tH, kuta, band = 0) {
  let s = s0, y = y0;
  for (let i = 0; i < tiers; i++) {
    P.box(key, -s, s, y, y + tH, -s, s);
    if (band) { const b = s * band; P.box(key, -b, b, y, y + tH * 0.8, -s - 0.7, s + 0.7); P.box(key, -s - 0.7, s + 0.7, y, y + tH * 0.8, -b, b); }
    P.box(key, -s - 0.25, s + 0.25, y + tH * 0.62, y + tH * 0.8, -s - 0.25, s + 0.25);   // cornice
    // parapet of miniature shrines: domed kutas at the corners, barrel-roofed salas between
    const n = Math.max(1, Math.round((2 * s) / (kuta * 2.6)) - 1);
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.box(key, cx * s - kuta / 2 * cx - kuta / 2, cx * s - kuta / 2 * cx + kuta / 2, y + tH, y + tH + kuta * 0.7, cz * s - kuta / 2 * cz - kuta / 2, cz * s - kuta / 2 * cz + kuta / 2);
      P.add(key, new THREE.SphereGeometry(kuta * 0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), cx * (s - kuta / 2), y + tH + kuta * 0.7, cz * (s - kuta / 2));
    }
    for (let j = 1; j <= n; j++) {
      const u = -s + j * (2 * s) / (n + 1), w = kuta * 1.3;
      for (const [fx, fz, rot] of [[u, s - kuta / 2, 0], [u, -s + kuta / 2, 0], [s - kuta / 2, u, 1], [-s + kuta / 2, u, 1]]) {
        const b = new THREE.BoxGeometry(w, kuta * 0.6, kuta * 0.8);
        const r = new THREE.CylinderGeometry(kuta * 0.42, kuta * 0.42, w, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, kuta * 0.3, 0);
        const g = mergeGeometries([prep(b), prep(r)]); if (rot) g.rotateY(Math.PI / 2);
        P.add(key, g, fx, y + tH + kuta * 0.3, fz);
      }
    }
    y += tH; s -= dS;
  }
  return { s: s + dS, y };
}
function elephant(P, key, x, z, ry) {
  const parts = [];
  parts.push(new THREE.SphereGeometry(1, 16, 12).scale(1.05, 1.0, 1.55).translate(0, 2.25, 0));        // body
  for (const [lx, lz] of [[-0.6, 0.85], [0.6, 0.85], [-0.6, -0.9], [0.6, -0.9]]) parts.push(new THREE.CylinderGeometry(0.34, 0.38, 1.7, 10).translate(lx, 0.85, lz));
  parts.push(new THREE.SphereGeometry(0.78, 14, 10).scale(1, 1.05, 0.95).translate(0, 2.75, 1.65));      // head
  for (const ex of [-1, 1]) parts.push(new THREE.SphereGeometry(0.75, 10, 8).scale(0.18, 0.95, 0.8).translate(ex * 0.75, 2.75, 1.45));   // ears
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.6, 2.25), new THREE.Vector3(0, 1.8, 2.55), new THREE.Vector3(0, 0.9, 2.5), new THREE.Vector3(0, 0.35, 2.75)]);
  parts.push(new THREE.TubeGeometry(trunk, 12, 0.24, 8).translate(0, 0, 0));
  for (const ex of [-1, 1]) parts.push(new THREE.ConeGeometry(0.09, 0.8, 6).rotateX(Math.PI / 2 + 0.6).translate(ex * 0.32, 2.15, 2.3));   // tusks
  parts.push(new THREE.BoxGeometry(2.4, 0.6, 3.6).translate(0, 0.3, 0));                               // pedestal of uncut rock
  const g = mergeGeometries(parts.map(prep)); g.rotateY(ry); g.scale(1.25, 1.25, 1.25);
  P.add(key, g, x, 0, z);
}
export function buildKailasa(P) {
  const B = 'basalt';
  // main plinth (with an elephant frieze), hall and vimana: axis along z, entrance towards +z
  P.box(B, -15, 15, 0, 7.6, -29, 2);
  P.box(B, -15.4, 15.4, 7.2, 8, -29.4, 2.4);
  P.box(B, -15.3, 15.3, 0, 1.1, -29.3, 2.3);
  for (let i = 0; i < 13; i++) { const u = -13.2 + i * 2.2; for (const s of [-1, 1]) { P.add(B, new THREE.SphereGeometry(0.85, 8, 6).scale(1.2, 1, 0.55), u, 3.0, s > 0 ? 2.0 : -29.0); } }
  for (let i = 0; i < 14; i++) { const u = -27 + i * 2.15; for (const s of [-1, 1]) P.add(B, new THREE.SphereGeometry(0.85, 8, 6).scale(0.55, 1, 1.2), s * 15, 3.0, u); }
  // pillared hall (mandapa) with a porch of square pillars; flat roof with a parapet
  P.box(B, -12.5, 12.5, 8, 16, -12, -1);
  P.box('dark', -11, 11, 8, 14.6, -1.2, -0.9);
  for (let i = 0; i < 6; i++) { const x = -9.5 + i * 3.8; P.box(B, x - 0.55, x + 0.55, 8, 15, -1, 0.1); P.box(B, x - 0.8, x + 0.8, 14.4, 15, -1.2, 0.3); }
  P.box(B, -13.3, 13.3, 15.6, 16.8, -12.6, 0.6);
  for (let i = 0; i < 9; i++) { const x = -12 + i * 3; P.add(B, new THREE.SphereGeometry(0.7, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), x, 16.8, 0.0); }
  P.box(B, -4.5, 4.5, 8, 13, 0, 3.4);          // the porch
  P.box('dark', -2.2, 2.2, 8, 12, 3.4, 3.45);
  P.box(B, -5.2, 5.2, 12.6, 13.8, -0.3, 4);
  // side porches
  for (const s of [-1, 1]) { P.box(B, s * 12.5, s * 16.5, 8, 13.5, -9.5, -3.5); P.box('dark', s * 16.5 - 0.02, s * 16.55, 8.6, 12.2, -8.2, -4.8); }
  // the vimana: walls over the sanctum, four tiers, square neck, octagonal dome and finial
  P.box(B, -9.5, 9.5, 8, 17.5, -28, -12);
  for (let i = 0; i < 5; i++) { const z = -26 + i * 3.4; for (const s of [-1, 1]) { P.box(B, s * 9.5 - 0.4 * s, s * 9.5 + 0.35 * s, 8.6, 17, z - 0.45, z + 0.45); } }
  for (const s of [-1, 1]) P.box('dark', s * 9.52 - 0.02, s * 9.55, 10, 15, -21.2, -18.8);
  P.box(B, -10.2, 10.2, 17.2, 18.2, -28.7, -11.3);
  const g = new Parts();
  const top = vimanaTiers(g, B, 8.4, 18.2, 4, 1.7, 3.0, 1.8);
  for (const [k, list] of Object.entries(g.L)) for (const q of list) { q.translate(0, 0, -20); (P.L[k] ??= []).push(q); }
  P.box(B, -2.6, 2.6, top.y, top.y + 1.4, -22.6, -17.4);
  P.add(B, new THREE.SphereGeometry(3.6, 8, 6, Math.PI / 8, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1), 0, top.y + 1.4, -20);
  P.add(B, lathe([[0.9, 0], [0.7, 0.6], [0.95, 1.0], [0.3, 1.8], [0, 2.2]], 10), 0, top.y + 4.4, -20);
  // bridge to the Nandi mandapa, which stands on its own plinth with a little shrine
  P.box(B, -2, 2, 6.4, 7.6, 2, 6);
  P.box(B, -4.8, 4.8, 0, 7.6, 6, 14.5);
  P.box(B, -5.1, 5.1, 7.2, 8, 5.7, 14.8);
  P.box(B, -3.6, 3.6, 8, 12.5, 6.8, 13.6);
  P.box('dark', -1.4, 1.4, 8, 11.4, 13.6, 13.66);
  P.add(B, new THREE.ConeGeometry(5.0, 3.6, 4, 1).rotateY(Math.PI / 4), 0, 14.3, 10.2);
  P.add(B, new THREE.SphereGeometry(0.9, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 16.1, 10.2);
  // two life-size elephants and two flagstaff pillars (dhvajastambha) in the court
  elephant(P, B, -12.5, 9, 0.18); elephant(P, B, 12.5, 9, -0.18);
  for (const s of [-1, 1]) {
    const x = s * 10.5, z = 17;
    P.box(B, x - 1.8, x + 1.8, 0, 1.6, z - 1.8, z + 1.8);
    P.box(B, x - 1.2, x + 1.2, 1.6, 2.6, z - 1.2, z + 1.2);
    P.add(B, new THREE.CylinderGeometry(0.62, 0.75, 12, 8), x, 8.6, z);
    for (const y of [5, 9, 12.5]) P.add(B, new THREE.CylinderGeometry(0.82, 0.82, 0.4, 8), x, y, z);
    P.add(B, lathe([[0.6, 0], [1.1, 0.4], [1.2, 0.9], [0.8, 1.2], [0, 1.2]], 10), x, 14.6, z);
    P.box(B, x - 1.0, x + 1.0, 15.8, 16.3, z - 1.0, z + 1.0);
    for (const dx of [-0.42, 0, 0.42]) P.box(B, x + dx - 0.1, x + dx + 0.1, 16.3, 16.3 + (dx === 0 ? 1.5 : 1.1), z - 0.1, z + 0.1);   // trishula
  }
  // cloisters cut into the foot of the trench walls: dark galleries behind square pillars
  const galleryAlong = (axis, fixed, a, b, sgn) => {
    for (let u = a + 2; u < b - 1; u += 3.6) {
      if (axis === 'x') P.box(B, u - 0.5, u + 0.5, 0, 7, fixed - sgn * 0.9 - 0.5, fixed - sgn * 0.9 + 0.5);
      else P.box(B, fixed - sgn * 0.9 - 0.5, fixed - sgn * 0.9 + 0.5, 0, 7, u - 0.5, u + 0.5);
    }
  };
  P.box('dark', K.X0 - 0.2, K.X0 + 0.05, 0, 7.4, K.Z0 + 1, K.Z1 - 2);
  P.box('dark', K.X1 - 0.05, K.X1 + 0.2, 0, 7.4, K.Z0 + 1, K.Z1 - 2);
  P.box('dark', K.X0 + 1, K.X1 - 1, 0, 7.4, K.Z0 - 0.2, K.Z0 + 0.05);
  galleryAlong('z', K.X0, K.Z0, K.Z1, -1); galleryAlong('z', K.X1, K.Z0, K.Z1, 1); galleryAlong('x', K.Z0, K.X0, K.X1, -1);
  for (const [x0, x1, z0, z1] of [[K.X0, K.X0 + 2.2, K.Z0, K.Z1], [K.X1 - 2.2, K.X1, K.Z0, K.Z1], [K.X0, K.X1, K.Z0, K.Z0 + 2.2]]) P.box(B, x0, x1, 7, 8.4, z0, z1);
}
// The cliff round the trench (three blocks of hewn rock) — key 'cliff'.
export function buildCliff(P) {
  const H = K.H;
  const blocks = [[K.L, K.X0, -130, K.Z1], [K.X1, K.R, -130, K.Z1], [K.X0, K.X1, -78, K.Z0]];
  blocks.forEach(([x0, x1, z0, z1], i) => P.add('cliff', rockBox(x1 - x0, H, z1 - z0, { cell: 3.5, amp: 0.7, freq: 0.07, seed: i * 3.1, front: i < 2 ? 3.5 : 0, ragged: 1 }), (x0 + x1) / 2, H / 2, (z0 + z1) / 2));
}

// =========================================================================================== THANJAVUR
// Brihadeeswarar: vimana c. 66 m — a two-storey square base, thirteen tiers, the capstone and kalasha.
export function buildTower(P) {
  const G = 'granite';
  const S = 15.5;
  P.box(G, -S - 1.6, S + 1.6, 0, 1.2, -S - 1.6, S + 1.6);
  P.box(G, -S - 1.0, S + 1.0, 1.2, 2.6, -S - 1.0, S + 1.0);
  P.box(G, -S - 1.3, S + 1.3, 2.6, 3.2, -S - 1.3, S + 1.3);
  // two storeys of walls with pilasters, niches and a projecting cornice (kapota) at each level
  for (const [y0, y1, s] of [[3.2, 9.4, S], [9.4, 15.4, S - 0.2]]) {
    P.box(G, -s, s, y0, y1, -s, s);
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const u = -s + 0.6 + i * (2 * s - 1.2) / n;
      for (const [x, z, rot] of [[u, s, 0], [u, -s, 0], [s, u, 1], [-s, u, 1]]) P.add(G, rot ? new THREE.BoxGeometry(0.7, y1 - y0 - 1.4, 0.75) : new THREE.BoxGeometry(0.75, y1 - y0 - 1.4, 0.7), x, (y0 + y1) / 2 - 0.4, z);
      if (i < n && i % 2 === 0) {
        const c = u + (2 * s - 1.2) / n / 2;
        for (const [x, z, rot] of [[c, s + 0.05, 0], [c, -s - 0.05, 0], [s + 0.05, c, 1], [-s - 0.05, c, 1]]) P.add('graniteDark', rot ? new THREE.BoxGeometry(0.1, 3.4, 1.5) : new THREE.BoxGeometry(1.5, 3.4, 0.1), x, y0 + 2.6, z);
      }
    }
    P.box(G, -s - 1.1, s + 1.1, y1 - 1.0, y1 - 0.2, -s - 1.1, s + 1.1);
    P.box(G, -s - 0.6, s + 0.6, y1 - 0.2, y1, -s - 0.6, s + 0.6);
  }
  // thirteen tiers to c. 55 m
  const top = vimanaTiers(P, G, S - 1.4, 15.4, 13, 0.72, 3.0, 1.9, 0.3);
  P.box(G, -4.8, 4.8, top.y, top.y + 2.4, -4.8, 4.8);
  P.box(G, -5.6, 5.6, top.y + 2.2, top.y + 2.8, -5.6, 5.6);
  // capstone (shikhara): octagonal dome; then the gilded kalasha
  P.add(G, new THREE.SphereGeometry(6.2, 8, 7, Math.PI / 8, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.95, 1), 0, top.y + 2.8, 0);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; P.add(G, new THREE.BoxGeometry(1.4, 1.7, 1.9), Math.cos(a) * 5.4, top.y + 3.6, Math.sin(a) * 5.4, -a); }   // Nandis at the corners
  P.add('gold', lathe([[0.9, 0], [1.25, 0.5], [0.75, 1.1], [0.95, 1.5], [0.5, 2.4], [0.25, 3.0], [0, 3.3]], 16), 0, top.y + 8.6, 0);
  // the front halls (ardhamandapa and mahamandapa) and a Nandi pavilion
  P.box(G, -9, 9, 0, 2.8, S, S + 10);
  P.box(G, -8, 8, 2.8, 11, S, S + 10);
  P.box(G, -12, 12, 0, 2.8, S + 10, S + 38);
  P.box(G, -11, 11, 2.8, 10.5, S + 10, S + 38);
  for (let i = 0; i < 9; i++) { const z = S + 11.5 + i * 3.1; for (const s of [-1, 1]) P.box(G, s * 11 - 0.3, s * 11 + 0.35 * s, 3.2, 9.8, z - 0.35, z + 0.35); }
  P.box(G, -11.8, 11.8, 10.1, 10.9, S + 9.6, S + 38.6);
  P.box(G, -6, 6, 10.9, 12.4, S + 14, S + 34);
  P.box('graniteDark', -2.2, 2.2, 2.8, 8.6, S + 38, S + 38.08);
  for (let i = 0; i < 4; i++) { const z = S + 13 + i * 6.4; for (const s of [-1, 1]) P.box('graniteDark', s * 11 - 0.05, s * 11 + 0.05 * s, 4.6, 8.0, z - 1, z + 1); }
  const NZ = S + 62;
  P.box(G, -6, 6, 0, 1.6, NZ - 6, NZ + 6);
  for (const [x, z] of [[-4.6, -4.6], [4.6, -4.6], [4.6, 4.6], [-4.6, 4.6]]) P.box(G, x - 0.5, x + 0.5, 1.6, 7.5, NZ + z - 0.5, NZ + z + 0.5);
  P.box(G, -5.6, 5.6, 7.5, 8.4, NZ - 5.6, NZ + 5.6);
  P.add(G, new THREE.ConeGeometry(5.6, 2.6, 4).rotateY(Math.PI / 4), 0, 9.7, NZ);
  P.add(G, new THREE.SphereGeometry(1.4, 10, 8).scale(1.6, 1, 2.2), 0, 2.8, NZ);   // the Nandi
  // the courtyard cloister (the back range only, so it never blocks the view)
  P.box(G, -55, 55, 0, 6.5, -58, -54);
}

// =========================================================================================== TAJ MAHAL
// Plinth 95 m square and 6.7 m high; the mausoleum c. 57 m square with chamfered corners; dome to c. 73 m.
const PY = 6.7;
// pointed (two-centred) arch outline, springing at the sides, apex at oh
function archPts(ow, oh) {
  const r = ow * 0.8, c = r - ow / 2, aEnd = Math.acos(c / r), spring = oh - Math.sqrt(r * r - c * c), pts = [];
  pts.push(new THREE.Vector2(-ow / 2, 0), new THREE.Vector2(-ow / 2, spring));
  for (let i = 1; i <= 10; i++) { const a = Math.PI - aEnd * i / 10; pts.push(new THREE.Vector2(c + Math.cos(a) * r, spring + Math.sin(a) * r)); }
  for (let i = 1; i <= 10; i++) { const a = aEnd * (1 - i / 10); pts.push(new THREE.Vector2(-c + Math.cos(a) * r, spring + Math.sin(a) * r)); }
  pts.push(new THREE.Vector2(ow / 2, 0));
  return pts;
}
// a frame w × h with a pointed-arch opening ow × oh, extruded `depth` towards +z
function archFrame(w, h, ow, oh, depth) {
  const sh = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(-w / 2, h)]);
  sh.holes.push(new THREE.Path(archPts(ow, oh).map((v) => new THREE.Vector2(v.x, Math.max(v.y, 0.01)))));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 });
}
const archBack = (ow, oh) => new THREE.ShapeGeometry(new THREE.Shape(archPts(ow, oh)));
// a bay on one face: frame + recessed back, authored facing +z at the face plane z = faceZ, turned by ry
// about the building's centre, then moved by (ox, oz)
function bay(P, w, h, ow, oh, depth, x, y, faceZ, ry, frameKey = 'marble', ox = 0, oz = 0) {
  const f = archFrame(w, h, ow, oh, depth); f.translate(x, y, 0);
  const b = archBack(ow, oh); b.translate(x, y, depth * 0.12);
  for (const [k, g] of [[frameKey, f], ['marbleShade', b]]) { g.translate(0, 0, faceZ); g.rotateY(ry); g.translate(ox, 0, oz); (P.L[k] ??= []).push(prep(g)); }
}
const placed = (P, key, g, x, y, z, ry) => { g.translate(x, y, z); g.rotateY(ry); (P.L[key] ??= []).push(prep(g)); };
function chhatri(P, x, y, z, r, h) {
  P.add('marble', new THREE.CylinderGeometry(r * 1.05, r * 1.1, h * 0.25, 8), x, y + h * 0.125, z);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; P.add('marble', new THREE.CylinderGeometry(r * 0.08, r * 0.08, h * 0.55, 6), x + Math.cos(a) * r * 0.85, y + h * 0.525, z + Math.sin(a) * r * 0.85); }
  P.add('marble', new THREE.CylinderGeometry(r * 1.15, r * 1.0, h * 0.12, 8), x, y + h * 0.86, z);
  P.add('marble', lathe([[r * 0.8, 0], [r * 0.98, r * 0.35], [r * 0.85, r * 0.8], [r * 0.4, r * 1.2], [r * 0.08, r * 1.45], [0, r * 1.5]], 16), x, y + h * 0.92, z);
  P.add('gold', new THREE.CylinderGeometry(0.02 * r, 0.08 * r, r * 0.9, 6), x, y + h * 0.92 + r * 1.9, z);
}
export function buildTaj(P) {
  const M = 'marble';
  // plinth with a band of blind arches all round
  P.box(M, -47.5, 47.5, 0, PY, -47.5, 47.5);
  P.box(M, -47.9, 47.9, PY - 0.5, PY, -47.9, 47.9);
  for (let i = 0; i < 18; i++) { const u = -44 + i * (88 / 17); for (let q = 0; q < 4; q++) { const g = archBack(3.2, 4.4); g.translate(u, 0.9, 47.52); g.rotateY(q * Math.PI / 2); (P.L.marbleShade ??= []).push(prep(g)); } }
  // the mausoleum: a square block with chamfered corners
  const HS = 28.3, CH = 8.6, TOP = PY + 31.5;
  const sh = new THREE.Shape([[-HS + CH, -HS], [HS - CH, -HS], [HS, -HS + CH], [HS, HS - CH], [HS - CH, HS], [-HS + CH, HS], [-HS, HS - CH], [-HS, -HS + CH]].map(([a, b]) => new THREE.Vector2(a, b)));
  const blk = new THREE.ExtrudeGeometry(sh, { depth: TOP - PY, bevelEnabled: false }); blk.rotateX(-Math.PI / 2); blk.translate(0, PY, 0);
  P.add(M, blk);
  const par = new THREE.ExtrudeGeometry(sh, { depth: 1.2, bevelEnabled: false }); par.rotateX(-Math.PI / 2); par.scale(1.015, 1, 1.015); par.translate(0, TOP, 0);
  P.add(M, par);
  // four pishtaqs (great arched portals), side bays in two storeys, chamfer bays, pinnacles
  for (let q = 0; q < 4; q++) {
    const ry = q * Math.PI / 2;
    bay(P, 23, TOP + 2.6 - PY, 15, 25, 1.2, 0, PY, HS, ry);
    for (const sx of [-1, 1]) for (const y of [PY, PY + 15]) bay(P, 7.2, 14, 5, 11.5, 0.8, sx * 15.6, y, HS, ry);
    for (const sx of [-1, 1]) {
      placed(P, M, new THREE.CylinderGeometry(0.55, 0.65, 8, 8), sx * 11.8, TOP + 1.2, HS + 0.6, ry);
      placed(P, M, new THREE.ConeGeometry(0.75, 2.2, 8), sx * 11.8, TOP + 6.3, HS + 0.6, ry);
    }
    // the chamfered corner: two stacked bays on the diagonal face
    const cw = CH * Math.SQRT2;
    for (const y of [PY, PY + 15]) bay(P, cw - 0.3, 14, cw * 0.62, 11.5, 0.7, 0, y, (HS - CH / 2) * Math.SQRT2, ry + Math.PI / 4);
  }
  // drum and onion dome, lotus cap and gilded finial
  P.add(M, new THREE.CylinderGeometry(13.2, 13.4, 6.5, 48), 0, TOP + 1.2 + 3.25, 0);
  const D0 = TOP + 7.7;
  P.add(M, lathe([[13.2, 0], [15.6, 3], [17.0, 7], [17.1, 10], [16.0, 13], [13.6, 16], [10.2, 18.5], [6.5, 20.4], [3.4, 21.6], [1.2, 22.2], [0, 22.4]].map(([r, y]) => [r, D0 + y]), 48));
  P.add('gold', lathe([[0.9, 0], [0.5, 0.8], [0.95, 1.6], [0.4, 2.4], [0.75, 3.1], [0.25, 4.0], [0.12, 6.2], [0, 6.6]].map(([r, y]) => [r, D0 + 22.0 + y]), 12));
  // four chhatris on the roof
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) chhatri(P, x * 17.5, TOP + 1.2, z * 17.5, 4.2, 7.5);
  // four minarets at the plinth corners
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const mx = x * 43.5, mz = z * 43.5;
    P.add(M, new THREE.CylinderGeometry(3.4, 3.6, 1.5, 12), mx, PY + 0.75, mz);
    const segs = [[0, 12.5, 2.9, 2.75], [13.3, 24.5, 2.65, 2.5], [25.3, 34.5, 2.4, 2.3]];
    for (const [y0, y1, r0, r1] of segs) {
      P.add(M, new THREE.CylinderGeometry(r1, r0, y1 - y0, 16), mx, PY + 1.5 + (y0 + y1) / 2, mz);
      P.add(M, new THREE.CylinderGeometry(r1 + 1.1, r1 + 0.2, 0.8, 16), mx, PY + 1.5 + y1 + 0.4, mz);
      P.add(M, new THREE.CylinderGeometry(r1 + 1.15, r1 + 1.15, 0.5, 16), mx, PY + 1.5 + y1 + 1.0, mz);
    }
    chhatri(P, mx, PY + 1.5 + 35.6, mz, 2.6, 4.6);
  }
  // the mosque and its twin (jawab) in red sandstone, either side on the terrace
  for (const sx of [-1, 1]) {
    const cx = sx * 98;
    P.box('redsand', cx - 11, cx + 11, 0, 3, -28, 28);
    P.box('redsand', cx - 9, cx + 9, 3, 15, -26, 26);
    for (let i = -1; i <= 1; i++) bay(P, 13, 12, 8, 10, 0.6, i * 15, 3, 9, -sx * Math.PI / 2, 'redsand', cx, 0);
    for (const dz of [-15, 0, 15]) {
      const r = dz === 0 ? 6 : 4.4;
      P.add('redsand', new THREE.CylinderGeometry(r, r, 2.2, 20), cx, 16.1, dz);
      P.add(M, lathe([[r, 0], [r * 1.15, r * 0.5], [r * 1.05, r * 1.0], [r * 0.55, r * 1.55], [0, r * 1.85]], 20), cx, 17.2, dz);
    }
    for (const dz of [-26, 26]) for (const dx of [-9, 9]) { P.add('redsand', new THREE.CylinderGeometry(0.9, 1.0, 17, 8), cx + dx, 8.5, dz); chhatri(P, cx + dx, 17, dz, 1.4, 2.8); }
  }
}
export const TAJ_PY = PY;
