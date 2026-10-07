// WATER WISDOM — Jaipur's Hawa Mahal (1799), the closing glimpse of src/scenes/india/water.js.
// The 'Palace of Winds' built by Maharaja Sawai Pratap Singh (architect Lal Chand Ustad): a five-storey
// screen of pink sandstone, one room deep at the top, rising in a stepped pyramid over Siredeori Bazaar.
// Its honeycomb is made of jharokhas — projecting semi-hexagonal oriels, each with small arched latticed
// windows on its three faces (953 windows in all on the real building), a ledge and a little sloping eave
// at every storey, each column of oriels capped by a fluted cupola with a finial; white lime lines trace
// the arches and cornices. Below, a storey of arched shopfronts on the street; pink-washed houses either
// side; the Nahargarh hills behind.
// Local frame: the façade's foot at the origin, the street front facing +z, metres.
import * as THREE from 'three';
import { rng } from '../../lib/math.js';
import { Kit, instanceKit, lathe, M4, plasterMaterial, stoneMaterial } from './water-assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);

// a pointed arch panel (w × to the apex), foot at y = 0
function archShape(w, spring, rise, n = 8) {
  const pts = [V2(-w / 2, 0)];
  for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); pts.push(V2(Math.cos(a) * w / 2, spring + Math.sin(a) * rise + rise * 0.25 * Math.pow(1 - Math.abs(2 * i / n - 1), 3))); }
  pts.push(V2(w / 2, 0));
  return new THREE.Shape(pts);
}
function archBand(w, spring, rise, t, n = 8) {
  const s = archShape(w + 2 * t, spring, rise + t, n);
  s.holes.push(new THREE.Path(archShape(w, spring, rise, n).getPoints().reverse()));
  return s;
}

function jaliMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#e6b9a2', roughness: 0.7, vertexColors: true });
  m.userData.noAntiTile = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vJ;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvJ = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vJ;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 q = vJ * 18.0; q.x += 0.5 * mod(floor(q.y), 2.0);
          float d = length(fract(q) - 0.5);
          float hole = smoothstep(0.36, 0.3, d);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.035, 0.03), hole * 0.92); }`);
  };
  m.customProgramCacheKey = () => 'waterJali';
  return m;
}
function makeJaipurMaterials() {
  return {
    pink: stoneMaterial({ color: '#ffffff', tintA: '#e19a7c', tintB: '#c97a62', course: 0, rough: 0.8, stain: 0, name: 'hmPink' }),
    pinkDeep: stoneMaterial({ color: '#ffffff', tintA: '#c97f66', tintB: '#a9604c', course: 0, rough: 0.85, stain: 0, name: 'hmPinkDeep' }),
    line: plasterMaterial({ color: '#ffffff', tintA: '#f6eee2', tintB: '#e8dccb', rough: 0.6, name: 'hmLine' }),
    jali: jaliMaterial(),
    dark: new THREE.MeshStandardMaterial({ color: '#1f1612', roughness: 0.9 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d6a650', roughness: 0.35, metalness: 1 }),
    road: stoneMaterial({ color: '#ffffff', tintA: '#8a8178', tintB: '#6c655e', course: 0, rough: 0.92, stain: 0, name: 'hmRoad' }),
    pave: stoneMaterial({ color: '#ffffff', tintA: '#c9b9a2', tintB: '#a89880', course: 0.6, block: 0.6, rough: 0.9, stain: 0, name: 'hmPave', joint: 0.4 }),
    house: stoneMaterial({ color: '#ffffff', tintA: '#e3a184', tintB: '#cf8a6e', course: 0, rough: 0.85, stain: 0, name: 'hmHouse' }),
    awning: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, vertexColors: true }),
  };
}

// one jharokha storey (local: column centre on the wall plane z = 0, foot at y = 0, height SH)
const R6 = 0.8, AP = R6 * Math.cos(Math.PI / 6);
function orielKit(SH, { lite = false, base = false } = {}) {
  const K = new Kit(), seg = 6, t0 = Math.PI / 6;
  // ledge, body, eave
  K.put('line', new THREE.CylinderGeometry(R6 + 0.1, R6 + 0.06, 0.12, seg, 1, false, t0), { pos: [0, 0.06, 0] });
  K.put('pink', new THREE.CylinderGeometry(R6, R6, SH - 0.5, seg, 1, true, t0), { pos: [0, 0.12 + (SH - 0.5) / 2, 0] });
  K.put('pink', new THREE.CylinderGeometry(R6 * 0.8, R6 + 0.18, 0.22, seg, 1, false, t0), { pos: [0, SH - 0.27, 0], ao: (x, y) => (y < SH - 0.3 ? 0.6 : 1) });
  if (!lite) K.put('line', new THREE.CylinderGeometry(R6 + 0.19, R6 + 0.19, 0.035, seg, 1, true, t0), { pos: [0, SH - 0.38, 0] });
  if (base) K.put('pinkDeep', new THREE.CylinderGeometry(R6 - 0.02, 0.22, 0.6, seg, 1, false, t0), { pos: [0, -0.3, 0], ao: 0.7 });
  // a window on each of the three outward faces (latticed, under a white arch line)
  const ww = 0.46, sp = 0.62, rise = 0.24, y0 = 0.42;
  for (const a of [-Math.PI / 3, 0, Math.PI / 3]) {
    const cx = Math.sin(a) * (AP + 0.004), cz = Math.cos(a) * (AP + 0.004);
    K.put('jali', new THREE.ShapeGeometry(archShape(ww, sp, rise, lite ? 4 : 8)), { pos: [cx, y0, cz], ry: a });
    if (!lite) {
      K.put('line', new THREE.ShapeGeometry(archBand(ww, sp, rise, 0.05, 8)), { pos: [Math.sin(a) * (AP + 0.012), y0, Math.cos(a) * (AP + 0.012)], ry: a });
      K.put('line', new THREE.PlaneGeometry(ww + 0.16, 0.05), { pos: [Math.sin(a) * (AP + 0.012), y0 - 0.02, Math.cos(a) * (AP + 0.012)], ry: a });
      // a small carved panel under the window
      K.put('pinkDeep', new THREE.PlaneGeometry(ww, 0.22), { pos: [Math.sin(a) * (AP + 0.008), y0 - 0.2, Math.cos(a) * (AP + 0.008)], ry: a });
    }
  }
  return K;
}
// the cupola that caps a column of oriels (foot at y = 0)
function cupolaKit(lite) {
  const K = new Kit(), seg = lite ? 6 : 12;
  K.put('pink', new THREE.CylinderGeometry(0.62, R6 * 0.85, 0.35, 6, 1, false, Math.PI / 6), { pos: [0, 0.17, 0] });
  K.put('line', lathe([[0.62, 0], [0.66, 0.06], [0.6, 0.12]], seg), { pos: [0, 0.35, 0] });
  K.put('pink', lathe([[0.6, 0], [0.62, 0.12], [0.56, 0.38], [0.42, 0.6], [0.22, 0.76], [0.06, 0.84], [0, 0.85]], seg), { pos: [0, 0.47, 0] });
  K.put('gold', lathe([[0.06, 0], [0.1, 0.06], [0.04, 0.16], [0.07, 0.22], [0.02, 0.42], [0, 0.44]], 6), { pos: [0, 1.3, 0] });
  return K;
}

function buildHawaMahal(M, { lite = false } = {}) {
  const K = new Kit(), R = rng(1799);
  const NC = lite ? 20 : 26, CW = 1.62, HW = (NC * CW) / 2;
  const G = 4.2, SH = 2.75;                         // ground storey of shopfronts; one jharokha storey
  const storeysAt = (c) => { const d = Math.abs(c - (NC - 1) / 2); return d < 2.6 ? 5 : d < 5.1 ? 4 : d < 8.1 ? 3 : 2; };
  // plinth and steps to the street
  K.box('pave', -HW - 6, HW + 6, -0.6, 0.35, -1, 3.4, { tint: 0.95 });
  for (let i = 0; i < 2; i++) K.box('pave', -HW - 6, HW + 6, -0.6, 0.35 - (i + 1) * 0.17, 3.4 + i * 0.35, 3.75 + i * 0.35, { tint: 0.9 });
  // the ground storey: a wall of arched shopfronts under a deep chhajja
  K.box('pink', -HW - 4, HW + 4, 0.35, G, -3, 0, { ao: (x, y) => 0.75 + 0.25 * Math.min(1, y / 2) });
  const shops = [];
  for (let x = -HW - 2.6; x <= HW + 2.6; x += 2.6) shops.push(x);
  for (const x of shops) {
    K.put('dark', new THREE.ShapeGeometry(archShape(1.7, 2.2, 0.55, lite ? 4 : 8)), { pos: [x, 0.36, 0.02] });
    if (!lite) {
      K.put('line', new THREE.ShapeGeometry(archBand(1.7, 2.2, 0.55, 0.09, 8)), { pos: [x, 0.36, 0.03] });
      K.box('pinkDeep', x - 1.3, x - 1.0, 0.35, G - 0.6, 0, 0.18, { ao: 0.9 });
      // goods and shutters inside: a few warm colours in the dark
      K.box('awning', x - 0.75, x + 0.75, 0.36, 0.9 + R() * 0.4, -0.6, -0.1, { tint: [0.5 + R() * 0.5, 0.25 + R() * 0.4, 0.1 + R() * 0.3] });
    }
  }
  K.box('pink', -HW - 4.4, HW + 4.4, G - 0.45, G - 0.25, 0, 1.2, { ao: (x, y) => (y < G - 0.4 ? 0.55 : 1) });
  K.box('line', -HW - 4.4, HW + 4.4, G - 0.25, G - 0.2, 0, 1.25);
  // the façade wall behind the oriels: one band per storey, set back as the pyramid narrows
  const oriels = { base: [], mid: [] }, cups = [];
  for (let c = 0; c < NC; c++) {
    const x = -HW + (c + 0.5) * CW, ns = storeysAt(c);
    for (let s = 0; s < ns; s++) (s === 0 ? oriels.base : oriels.mid).push(M4(x, G + s * SH, 0.15, 0));
    cups.push(M4(x, G + ns * SH, 0.15, 0));
  }
  // wall bands (pink) with white string courses, a parapet on each tier's top
  const tiers = [2, 3, 4, 5];
  for (const n of tiers) {
    const cols = [...Array(NC).keys()].filter((c) => storeysAt(c) >= n);
    const x0 = -HW + cols[0] * CW - 0.25, x1 = -HW + (cols[cols.length - 1] + 1) * CW + 0.25;
    const y0 = G + (n - 1) * SH, y1 = G + n * SH;
    const ext = n === 2 ? 0 : 0;
    K.box('pink', x0 - ext, x1 + ext, n === 2 ? G : y0, y1 + 0.9, -3.2, 0, { ao: (x, y) => 0.8 + 0.2 * ((y - y0) / SH) });
    K.box('line', x0, x1, y1 + 0.9, y1 + 1.0, -3.2, 0.1);
    // the parapet's arched merlons between the cupolas
    if (!lite) for (let c = cols[0]; c <= cols[cols.length - 1]; c++) {
      const x = -HW + (c + 0.5) * CW;
      if (storeysAt(c) !== n) continue;
      K.put('pink', new THREE.ShapeGeometry(archShape(1.0, 0.25, 0.3, 6)), { pos: [x + CW / 2, y1 + 1.0, -0.05] });
    }
    for (let s = (n === 2 ? 0 : n - 1); s < n; s++) K.box('line', x0, x1, G + s * SH - 0.04, G + s * SH + 0.02, -0.02, 0.06);
  }
  // the crown: a central pavilion with a curved bangaldar roof and two small domed kiosks
  {
    const y = G + 5 * SH + 1.0;
    K.box('pink', -3.2, 3.2, y, y + 2.2, -1.5, 0.4);
    for (let i = 0; i < 3; i++) {
      const x = -2.1 + i * 2.1;
      K.put('jali', new THREE.ShapeGeometry(archShape(1.0, 0.95, 0.4, 8)), { pos: [x, y + 0.35, 0.41] });
      if (!lite) K.put('line', new THREE.ShapeGeometry(archBand(1.0, 0.95, 0.4, 0.07, 8)), { pos: [x, y + 0.35, 0.42] });
    }
    const roof = new THREE.CylinderGeometry(1.3, 1.3, 7.2, 14, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.75, 1.15);
    K.put('pink', roof, { pos: [0, y + 2.2, -0.55] });
    K.box('line', -3.65, 3.65, y + 2.1, y + 2.25, -2.0, 0.95);
    for (const x of [-1.6, 0, 1.6]) K.put('gold', lathe([[0.07, 0], [0.12, 0.08], [0.05, 0.2], [0.02, 0.55], [0, 0.58]], 6), { pos: [x, y + 3.15, -0.55] });
    for (const sx of [-1, 1]) cups.push(M4(sx * 4.3, y, 0.0, 0, 1.15));
  }
  // the sides: the screen's thin return walls and the palace masses behind it
  for (const sx of [-1, 1]) K.box('pinkDeep', sx > 0 ? HW + 0.3 : -HW - 4, sx > 0 ? HW + 4 : -HW - 0.3, G, G + 2 * SH + 1.0, -6, -0.1, { tint: 0.95 });
  K.box('pinkDeep', -HW + 3, HW - 3, G, G + 2 * SH, -26, -6, { tint: 0.9 });

  const grp = new THREE.Group();
  grp.add(K.build(M));
  let tris = K.tris();
  const ob = orielKit(SH, { lite, base: true }), om = orielKit(SH, { lite });
  grp.add(instanceKit(ob, M, oriels.base), instanceKit(om, M, oriels.mid));
  const ck = cupolaKit(lite);
  grp.add(instanceKit(ck, M, cups));
  tris += ob.tris() * oriels.base.length + om.tris() * oriels.mid.length + ck.tris() * cups.length;
  const windows = (oriels.base.length + oriels.mid.length) * 3;
  return { group: grp, tris, windows, HW, height: G + 5 * SH + 4.5 };
}

// pink-washed houses along the bazaar (local frame as the Hawa Mahal's): arched shopfronts, chhajjas,
// rooftop kiosks, awnings
function buildStreet(M, HW, { lite = false } = {}) {
  const K = new Kit(), R = rng(31);
  // road, kerbs and footways in front of the façade
  K.box('road', -260, 260, -1.2, -0.02, 4.2, 26, { tint: 1 });
  K.box('pave', -260, 260, -1.2, 0.18, 0, 4.2, { tint: 0.95 });
  K.box('pave', -260, 260, -1.2, 0.18, 26, 30, { tint: 0.95 });
  // houses either side of the Hawa Mahal (same side of the street) and across it at the far ends
  const row = (x0, x1, zf, face) => {
    let x = x0;
    while (x < x1) {
      const w = 7 + R() * 7, h = 7 + R() * 6, d = 12;
      const zb = face > 0 ? zf - d : zf, zt = face > 0 ? zf : zf + d;
      K.box('house', x, x + w - 0.3, 0.18, h, zb, zt, { tint: 0.9 + R() * 0.18, ao: (xx, y) => 0.8 + 0.2 * Math.min(1, y / 3) });
      K.box('house', x - 0.2, x + w - 0.1, h, h + 0.9, face > 0 ? zf - 0.3 : zf, face > 0 ? zf + 0.15 : zf + 0.45, { tint: 0.95 });
      K.box('line', x - 0.2, x + w - 0.1, h + 0.9, h + 1.0, face > 0 ? zf - 0.3 : zf, face > 0 ? zf + 0.2 : zf + 0.5);
      const fz = face > 0 ? zf + 0.02 : zf - 0.02;
      for (let sx = x + 1.6; sx < x + w - 1.2; sx += 2.4) {
        K.put('dark', new THREE.ShapeGeometry(archShape(1.5, 2.0, 0.45, lite ? 4 : 6)), { pos: [sx, 0.2, fz], ry: face > 0 ? 0 : Math.PI });
        K.put('dark', new THREE.ShapeGeometry(archShape(0.8, 1.0, 0.3, lite ? 4 : 6)), { pos: [sx, 4.4, fz], ry: face > 0 ? 0 : Math.PI });
        if (!lite) K.put('line', new THREE.ShapeGeometry(archBand(0.8, 1.0, 0.3, 0.07, 6)), { pos: [sx, 4.4, fz + face * 0.01], ry: face > 0 ? 0 : Math.PI });
      }
      K.box('house', x - 0.2, x + w - 0.1, 3.4, 3.6, face > 0 ? zf : zf - 1.1, face > 0 ? zf + 1.1 : zf, { ao: (xx, y) => (y < 3.5 ? 0.6 : 1) });
      if (!lite && R() < 0.5) K.box('awning', x + 0.5, x + w - 0.8, 2.6, 2.75, face > 0 ? zf : zf - 1.8, face > 0 ? zf + 1.8 : zf, { tint: [[0.75, 0.22, 0.18], [0.85, 0.62, 0.2], [0.2, 0.45, 0.6], [0.9, 0.85, 0.75]][Math.floor(R() * 4)] });
      if (R() < 0.35) { K.box('house', x + w / 2 - 1.2, x + w / 2 + 1.2, h + 0.9, h + 3.0, zb + 3, zb + 5.4, { tint: 0.95 }); K.put('house', lathe([[1.15, 0], [1.1, 0.4], [0.7, 0.9], [0, 1.1]], 8), { pos: [x + w / 2, h + 3.0, zb + 4.2] }); }
      x += w;
    }
  };
  row(-180, -HW - 4.5, 0, 1);
  row(HW + 4.5, 180, 0, 1);
  row(-200, -40, 30, -1);
  row(40, 200, 30, -1);
  return { group: K.build(M), tris: K.tris() };
}

export function buildJaipur({ lite = false, at, groundY }) {
  const M = makeJaipurMaterials();
  const y0 = 1.25;
  const group = new THREE.Group();
  group.position.set(at.x, y0, at.z);
  const hm = buildHawaMahal(M, { lite });
  group.add(hm.group);
  const st = buildStreet(M, hm.HW, { lite });
  group.add(st.group);
  // the walled city round it: pink-washed houses in the blocks of Jaipur's grid plan (1727)
  {
    const HK = new Kit();
    HK.box('house', -0.5, 0.5, 0, 1, -0.5, 0.5);
    HK.box('house', -0.52, 0.52, 0.93, 1.0, -0.52, 0.52, { tint: 1.05 });
    HK.box('line', -0.53, 0.53, 1.0, 1.012, -0.53, 0.53);
    for (const x of [-0.25, 0.25]) { HK.box('dark', x - 0.08, x + 0.08, 0.5, 0.75, 0.5, 0.505); HK.box('dark', 0.5, 0.505, 0.5, 0.75, x - 0.08, x + 0.08); }
    const r = rng(1727), mats = [], tints = [];
    const N = lite ? 260 : 720;
    for (let k = 0; k < N * 4 && mats.length < N; k++) {
      const bx = Math.floor(r() * 16) - 8, bz = Math.floor(r() * 14) - 11;
      const lx = bx * 42 + 6 + r() * 30, lz = bz * 42 + 6 + r() * 30;
      if (lz > -14 && lz < 44) continue;                         // the bazaar and its frontages
      if (Math.abs(lx) < hm.HW + 8 && lz > -32 && lz < 0) continue;
      if (lz > 92) continue;                                     // the ridge
      const wx = at.x + lx, wz = at.z + lz, gy = groundY ? groundY(wx, wz) : 0;
      if (gy > 8) continue;
      const w = 6 + r() * 9, d = 6 + r() * 9, h = 5 + r() * 9 + (r() < 0.1 ? 6 : 0);
      mats.push(new THREE.Matrix4().compose(V(lx, gy - y0 - 0.4, lz), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.floor(r() * 4) * Math.PI / 2), V(w, h, d)));
      const c = r(); tints.push(new THREE.Color().setRGB(1.0, 0.86 + 0.12 * c, 0.8 + 0.16 * c));
    }
    group.add(instanceKit(HK, M, mats, { tints }));
  }
  const CENTRE = V(at.x, y0 + 9.5, at.z);
  return {
    group, CENTRE, LABEL: V(at.x - 5.5, y0 + hm.height - 2.5, at.z - 1.0),
    tris: { hawa: hm.tris, street: st.tris }, windows: hm.windows,
    update() {},
  };
}
