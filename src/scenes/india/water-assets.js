// WATER WISDOM — shared building kit, materials and the stepwell for src/scenes/india/water.js.
//
// Kit: plain parts gathered per material key and merged into one mesh per key, each part carrying a
// vertex colour (tint × baked occlusion) so hundreds of hand-placed stones each have their own tone.
// Materials are MeshStandard with a world-space procedural layer (no texture, so nothing can tile):
// macro colour drift, coursed ashlar joints with a per-block tone (hashed from the block's own course and
// index, so no period exists), vertical rain streaks, a dark water-stain band with moss below the high
// water mark, and a wet darkening just above the current water level.
//
// CHAND BAORI, Abhaneri (c. 9th century): a square stepwell about 35 m across at the top and about 30 m
// deep in 13 storeys. On three sides each storey is a riser wall carrying a row of stepped triangles —
// double flights that criss-cross up to the terrace above, about 3,500 narrow steps in all; the fourth
// (north) side is a multi-storey pavilion gallery of pillared loggias with projecting balconies and
// shrine niches. An arcaded cloister rings the rim. Modelled at that scale in metres, rim at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { rng } from '../../lib/math.js';

// ------------------------------------------------------------------------------------------- kit
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function prepGeo(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  return n;
}
export class Kit {
  constructor() { this.L = {}; this.o = [0, 0, 0, 0]; }
  // local frame helper: run fn with an offset (x, y, z) and a yaw
  at(x, y, z, ry, fn) { const p = this.o; this.o = [p[0] + x * Math.cos(p[3]) + z * Math.sin(p[3]), p[1] + y, p[2] - x * Math.sin(p[3]) + z * Math.cos(p[3]), p[3] + ry]; fn(); this.o = p; }
  put(key, g, { pos = [0, 0, 0], rx = 0, ry = 0, rz = 0, s = null, tint = 1, ao = 1 } = {}) {
    const n = prepGeo(g);
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _s.set(1, 1, 1); if (s != null) (typeof s === 'number' ? _s.setScalar(s) : _s.set(...s));
    _m4.compose(_v.set(...pos), _q, _s); n.applyMatrix4(_m4);
    const [ox, oy, oz, oy2] = this.o;
    if (ox || oy || oz || oy2) { _m4.makeRotationY(oy2).setPosition(ox, oy, oz); n.applyMatrix4(_m4); }
    const p = n.attributes.position, c = new Float32Array(p.count * 3);
    const tc = typeof tint === 'number' ? [tint, tint, tint] : tint;
    for (let i = 0; i < p.count; i++) {
      const a = typeof ao === 'function' ? ao(p.getX(i), p.getY(i), p.getZ(i)) : ao;
      c[i * 3] = tc[0] * a; c[i * 3 + 1] = tc[1] * a; c[i * 3 + 2] = tc[2] * a;
    }
    n.setAttribute('color', new THREE.BufferAttribute(c, 3));
    (this.L[key] ??= []).push(n);
    return n;
  }
  box(key, x0, x1, y0, y1, z0, z1, o = {}) {
    return this.put(key, new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), { ...o, pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] });
  }
  tris() { let n = 0; for (const l of Object.values(this.L)) for (const g of l) n += g.attributes.position.count / 3; return n; }
  geometries() { const out = {}; for (const [k, l] of Object.entries(this.L)) if (l.length) out[k] = mergeGeometries(l); return out; }
  build(mats, { cast = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [k, g] of Object.entries(this.geometries())) {
      if (!mats[k]) { console.warn('[water] no material', k); continue; }
      const m = new THREE.Mesh(g, mats[k]); m.castShadow = cast; m.receiveShadow = receive; m.name = k;
      grp.add(m);
    }
    return grp;
  }
}
// One unit (a Kit) instanced at many matrices: one InstancedMesh per material key. `tints` (optional)
// gives each instance its own colour multiplier.
export function instanceKit(kit, mats, matrices, { tints = null, cast = true, receive = true } = {}) {
  const grp = new THREE.Group();
  for (const [k, g] of Object.entries(kit.geometries())) {
    if (!mats[k]) { console.warn('[water] no material', k); continue; }
    const im = new THREE.InstancedMesh(g, mats[k], matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    if (tints) tints.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = cast; im.receiveShadow = receive; im.name = k;
    im.computeBoundingSphere();
    grp.add(im);
  }
  return grp;
}
export const lathe = (pts, seg = 16, phi = 0) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), seg, phi);
export const M4 = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));

// ------------------------------------------------------------------------------------------- materials
// Shared uniforms of the procedural stone (the scene animates the water levels).
export const STONE_U = { uWaterY: { value: -100 }, uStainY: { value: -100 }, uWet: { value: 0 }, uRain: { value: 0 } };
const STONE_GLSL = /* glsl */ `
${GLSL_NOISE}
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// ashlar joints on a face: (u along the face, y up); returns (joint mask, per-block tone)
vec2 ashlar(float u, float y, float ch, float bl){
  float c = floor(y / ch);
  float uu = u + wHash(vec2(c, 7.1)) * 3.7;
  float len = bl * (0.75 + 0.5 * wHash(vec2(c, 3.3)));
  float b = floor(uu / len);
  float fx = fract(uu / len) * len, fy = fract(y / ch) * ch;
  float d = min(min(fx, len - fx), min(fy, ch - fy));
  return vec2(1.0 - smoothstep(0.004, 0.022, d), wHash(vec2(b, c)));
}`;
// kind: course height / block length for the ashlar (0 = none); tintA/tintB: the two stone hues
export function stoneMaterial({ color = '#ffffff', rough = 0.88, tintA = '#d8c2a0', tintB = '#a99a86', course = 0.45, block = 0.9, stain = 1, streak = 1, joint = 0.35, name = 'stone' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, vertexColors: true });
  const U = { ...STONE_U, uTA: { value: new THREE.Color(tintA) }, uTB: { value: new THREE.Color(tintB) } };
  m.userData.noAntiTile = true;
  m.userData.detail = { albedo: 0.5, grime: 0.4 };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW; varying vec3 vSN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { mat4 mm = modelMatrix;
          #ifdef USE_INSTANCING
            mm = modelMatrix * instanceMatrix;
          #endif
          vSW = (mm * vec4(transformed, 1.0)).xyz; vSN = normalize(mat3(mm) * objectNormal); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSW; varying vec3 vSN; uniform vec3 uTA, uTB; uniform float uWaterY, uStainY, uWet, uRain;
      ${STONE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wp = vSW, wn = normalize(vSN);
        float m1 = snoise(wp * 0.07) * 0.5 + 0.5, m2 = snoise(wp * 0.45 + 3.1) * 0.5 + 0.5, m3 = snoise(wp * 2.3 + 9.0) * 0.5 + 0.5;
        diffuseColor.rgb *= mix(uTA, uTB, smoothstep(0.25, 0.75, m1 + (m2 - 0.5) * 0.3)) * (0.84 + 0.24 * m2 + 0.12 * (m3 - 0.5));
        float vert = 1.0 - abs(wn.y);
        ${course > 0 ? `{
          float uf = abs(wn.x) > abs(wn.z) ? wp.z : wp.x;
          vec2 a = vert > 0.5 ? ashlar(uf, wp.y, ${course.toFixed(3)}, ${block.toFixed(3)}) : ashlar(wp.x, wp.z, ${(block * 0.8).toFixed(3)}, ${(block * 1.2).toFixed(3)});
          diffuseColor.rgb *= (1.0 - ${joint.toFixed(2)} * a.x) * (0.9 + 0.2 * a.y);
        }` : ''}
        float streak = smoothstep(0.5, 0.95, snoise(vec3((wp.x + wp.z) * 2.2, wp.y * 0.18, 1.7)) * 0.5 + 0.5 + 0.25 * (m3 - 0.5));
        diffuseColor.rgb *= 1.0 - ${(0.22 * streak).toFixed(3)} * streak * vert;
        float below = smoothstep(uStainY + 0.3, uStainY - 0.8, wp.y) * ${stain.toFixed(2)};
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.6, 0.66, 0.6), below * 0.85);
        float moss = below * smoothstep(0.35, 0.85, wn.y + 0.25 * vert * m2) * smoothstep(0.42, 0.7, m2 * 0.6 + m3 * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.17, 0.06) * (0.8 + 0.4 * m3), moss * 0.8);
        float wet = smoothstep(uWaterY + 0.7, uWaterY + 0.05, wp.y) * ${stain.toFixed(2)};
        wet = max(wet, uRain * (0.35 + 0.4 * smoothstep(0.5, 1.0, wn.y)));
        diffuseColor.rgb *= 1.0 - 0.38 * wet;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * (0.86 + 0.28 * m2) - 0.5 * wet, 0.12, 1.0);`);
  };
  m.customProgramCacheKey = () => `waterStone|${name}|${course}|${block}|${stain}`;
  return m;
}
// plain plastered / painted surfaces: macro drift only
export function plasterMaterial({ color = '#f2ede4', rough = 0.7, tintA = '#ffffff', tintB = '#e6ddd0', name = 'plaster', stain = 0 } = {}) {
  return stoneMaterial({ color, rough, tintA, tintB, course: 0, stain, name, streak: 0.6 });
}
export function makeWellMaterials() {
  return {
    wall: stoneMaterial({ color: '#ffffff', tintA: '#cdb592', tintB: '#9d9080', course: 0.42, block: 0.95, name: 'wall' }),
    step: stoneMaterial({ color: '#ffffff', tintA: '#d4bd99', tintB: '#a7998a', course: 0, name: 'step' }),
    trim: stoneMaterial({ color: '#ffffff', tintA: '#c9b08b', tintB: '#9a8c7c', course: 0, name: 'trim' }),
    pave: stoneMaterial({ color: '#ffffff', tintA: '#cbb390', tintB: '#9e917f', course: 0.9, block: 1.2, stain: 0, name: 'pave', joint: 0.45 }),
    carve: stoneMaterial({ color: '#ffffff', tintA: '#c4a985', tintB: '#8f8273', course: 0, name: 'carve', rough: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ color: '#1a140f', roughness: 1 }),
  };
}

// ------------------------------------------------------------------------------------------- the stepwell
export const WELL = { A0: 17.5, N: 13, H: 2.3, S: 1.12, D: 0.82, NS: 12, GAL: 4 };
export const wellHalf = (k) => WELL.A0 - k * WELL.S;          // riser wall of storey k
export const storeyY = (k) => -k * WELL.H;                      // top of storey k
export const WELL_FLOOR = storeyY(WELL.N);
const GAL_Z = -(wellHalf(WELL.GAL) - 0.3);                      // the gallery front (north)
const GAL_BOT = storeyY(WELL.GAL);

// pillar with base, octagonal-chamfered shaft, bands and a bracket capital (local: foot at y = 0)
function pillar(K, key, h, w, { lite = false } = {}) {
  const b = w * 1.35;
  K.box(key, -b / 2, b / 2, 0, h * 0.07, -b / 2, b / 2, { ao: 0.85 });
  K.box(key, -b * 0.42, b * 0.42, h * 0.07, h * 0.11, -b * 0.42, b * 0.42, { ao: 0.9 });
  K.put(key, new THREE.CylinderGeometry(w * 0.56, w * 0.6, h * 0.74, lite ? 4 : 8, 1, false, Math.PI / 8), { pos: [0, h * 0.11 + h * 0.37, 0], tint: 1.02 });
  if (!lite) for (const f of [0.34, 0.62]) K.put(key, new THREE.CylinderGeometry(w * 0.64, w * 0.64, h * 0.035, 8, 1, false, Math.PI / 8), { pos: [0, h * f, 0], tint: 0.95 });
  K.box(key, -w * 0.55, w * 0.55, h * 0.85, h * 0.9, -w * 0.55, w * 0.55);
  K.box(key, -w * 1.25, w * 1.25, h * 0.9, h * 0.96, -w * 0.45, w * 0.45, { ao: 0.92 });    // bracket arms
  K.box(key, -w * 0.45, w * 0.45, h * 0.9, h * 0.96, -w * 1.25, w * 1.25, { ao: 0.92 });
  K.box(key, -w * 0.7, w * 0.7, h * 0.96, h, -w * 0.7, w * 0.7);
}

export function buildStepwell(mats, { lite = false } = {}) {
  const { A0, N, H, S, D, NS } = WELL;
  const K = new Kit(), R = rng(1307);
  const rise = H / NS, OUT = A0 + 9;
  const tri = (key) => key;
  // ---- the storeys: a square ring of wall mass per storey (its top is the terrace), a lip on each edge
  for (let k = 0; k < N; k++) {
    const a = wellHalf(k), y0 = storeyY(k + 1), y1 = storeyY(k);
    const back = k === 0 ? OUT : wellHalf(k - 1);
    const tone = () => 0.92 + R() * 0.14;
    // the riser walls (inner face at a) and the mass behind them
    for (const s of [-1, 1]) {
      K.box('wall', -back, back, y0, y1, s > 0 ? a : -back, s > 0 ? back : -a, { tint: tone(), ao: (x, y) => 0.78 + 0.22 * Math.min(1, (y - y0) / 0.9) });
      K.box('wall', s > 0 ? a : -back, s > 0 ? back : -a, y0, y1, -a, a, { tint: tone(), ao: (x, y) => 0.78 + 0.22 * Math.min(1, (y - y0) / 0.9) });
    }
    // lip / coping along the terrace edge at the top of this riser
    const lt = 0.12, lo = 0.06;
    for (const s of [-1, 1]) {
      K.box('trim', -a - lo, a + lo, y1 - lt, y1, s * (a - lo), s * (a + 0.4), { tint: tone() });
      K.box('trim', s * (a - lo), s * (a + 0.4), y1 - lt, y1, -a + lo, a - lo, { tint: tone() });
    }
  }
  // the pool floor
  const af = wellHalf(N);
  K.box('wall', -af - 0.5, af + 0.5, WELL_FLOOR - 0.5, WELL_FLOOR, -af - 0.5, af + 0.5, { tint: 0.7 });

  // ---- the stepped triangles: double flights on the east, west and south walls
  let steps = 0;
  const flights = (k, side) => {
    const a = wellHalf(k), y0 = storeyY(k + 1);
    // the face runs along u; the gallery closes the north end of the east and west walls up top
    let u0 = -a + D + 0.05, u1 = a - D - 0.05;
    if (side !== 'S' && k < WELL.GAL) u0 = Math.max(u0, GAL_Z + 0.4);
    const B = 2 * NS * 0.19, nT = Math.floor((u1 - u0) / B);
    if (nT < 1) return;
    const c0 = (u0 + u1) / 2 - (nT * B) / 2;
    for (let j = 0; j < nT; j++) {
      const uc = c0 + (j + 0.5) * B;
      const toneT = 0.9 + R() * 0.16;
      for (let i = 0; i < NS; i++) {
        const w = B * (1 - i / NS) - 0.02, yb = y0 + i * rise;
        const jit = (R() - 0.5) * 0.025, dj = (R() - 0.5) * 0.04;
        const dd = D - 0.02 * i / NS + dj;
        // (u, depth) → world: S face (+z), E face (+x), W face (−x)
        const g = new THREE.BoxGeometry(w, rise + 0.004, dd);
        const tint = toneT * (0.93 + R() * 0.12);
        const ao = (x, y, z) => { const dep = side === 'S' ? (a - z) : side === 'E' ? (a - x) : (a + x); return 0.72 + 0.28 * Math.min(1, dep / dd) - (y < yb + 0.02 ? 0.06 : 0); };
        if (side === 'S') K.put('step', g, { pos: [uc + jit, yb + rise / 2, a - dd / 2], tint, ao });
        else if (side === 'E') K.put('step', g, { pos: [a - dd / 2, yb + rise / 2, uc + jit], ry: Math.PI / 2, tint, ao });
        else K.put('step', g, { pos: [-a + dd / 2, yb + rise / 2, uc + jit], ry: Math.PI / 2, tint, ao });
        steps += 2;   // a flight on each slope of the triangle
        // a few worn / broken treads: a chip off one end
        if (!lite && R() < 0.05 && i > 1) {
          const cg = new THREE.BoxGeometry(0.12 + R() * 0.12, 0.05, 0.12 + R() * 0.2);
          const ex = (R() < 0.5 ? -1 : 1) * (w / 2 - 0.05);
          if (side === 'S') K.put('trim', cg, { pos: [uc + ex, yb + rise + 0.02, a - dd + 0.1], tint: 0.8 });
          else if (side === 'E') K.put('trim', cg, { pos: [a - dd + 0.1, yb + rise + 0.02, uc + ex], tint: 0.8 });
          else K.put('trim', cg, { pos: [-a + dd - 0.1, yb + rise + 0.02, uc + ex], tint: 0.8 });
        }
      }
    }
  };
  for (let k = 0; k < N; k++) { flights(k, 'S'); flights(k, 'E'); flights(k, 'W'); }
  void tri;

  // ---- the north side below the gallery: plain terraces and one straight central stair per storey
  for (let k = WELL.GAL; k < N; k++) {
    const a = wellHalf(k), y0 = storeyY(k + 1);
    for (let i = 0; i < NS; i++) K.box('step', -1.1, 1.1, y0 + i * rise, y0 + (i + 1) * rise, -a, -a + D * (1 - i / NS) + 0.02, { tint: 0.92 + R() * 0.1, ao: 0.9 });
    steps += NS;
  }

  // ---- the gallery (north): three storeys of pillared loggias, a projecting pavilion, shrine niches
  const G = new Kit();
  {
    const z = GAL_Z, levels = 3, LH = -GAL_BOT / levels;
    const zb = z - 2.6;                         // back wall of the loggias
    const halfAt = (y) => wellHalf(Math.min(WELL.GAL, Math.floor(-y / H)));
    for (let l = 0; l < levels; l++) {
      const yt = -l * LH, yb = yt - LH, hw = halfAt(yb + 0.1) + 0.6;
      // floor slab, back wall with doorways, ceiling, chhajja eave
      G.box('pave', -hw, hw, yb - 0.35, yb, zb - 0.2, z + 0.15, { tint: 0.95 });
      G.box('wall', -hw, hw, yb, yt, zb - 1.0, zb, { tint: 0.85, ao: (x, y) => 0.55 + 0.25 * Math.min(1, (y - yb) / LH) });
      G.box('trim', -hw, hw, yt - 0.42, yt, zb, z + 0.25, { tint: 0.95, ao: 0.8 });
      G.box('trim', -hw, hw, yt - 0.52, yt - 0.42, z - 0.05, z + 0.8, { tint: 1.0, ao: (x, y) => (y < yt - 0.5 ? 0.7 : 1) });   // chhajja
      G.box('trim', -hw, hw, yb, yb + 0.85, z - 0.25, z + 0.05, { tint: 0.95 });                                               // parapet / railing
      const nd = Math.floor((2 * hw) / 2.4);
      for (let d = 0; d < nd; d++) {
        const x = -hw + 1.2 + d * 2.4 + ((2 * hw) - nd * 2.4) / 2;
        if (Math.abs(x) < 3.2 && l < 2) continue;    // the pavilion stands there
        G.box('dark', x - 0.45, x + 0.45, yb + 0.05, yb + Math.min(2.1, LH - 0.6), zb + 0.01, zb + 0.03);
        G.box('carve', x - 0.6, x + 0.6, yb + Math.min(2.1, LH - 0.6), yb + Math.min(2.1, LH - 0.6) + 0.18, zb, zb + 0.12, { ao: 0.8 });
      }
      // pillars (instanced below), the parapet's small carved panels
      for (let x = -hw + 0.6; x <= hw - 0.6 + 1e-6; x += (2 * hw - 1.2) / Math.max(1, Math.round((2 * hw - 1.2) / 1.6))) {
        if (Math.abs(x) < 3.0 && l < 2) continue;
        G.L.__pillars ??= []; G.L.__pillars.push([x, yb, z - 0.1, LH - 0.52]);
      }
      if (!lite) for (let x = -hw + 0.9; x < hw - 0.6; x += 1.6) G.box('carve', x - 0.5, x + 0.5, yb + 0.15, yb + 0.7, z + 0.05, z + 0.08, { tint: 0.85 });
    }
    // the projecting central pavilion: two storeys of balconies on brackets, a curved eave and a domed roof
    const px = 2.9, pz = z + 2.0;
    for (let l = 0; l < 2; l++) {
      const yb = -(l + 1) * LH, yt = yb + LH;
      G.box('pave', -px, px, yb - 0.3, yb + 0.05, z, pz, { tint: 0.95 });
      for (let i = 0; i < 4; i++) G.box('carve', -px + 0.4 + i * (2 * px - 0.8) / 3 - 0.14, -px + 0.4 + i * (2 * px - 0.8) / 3 + 0.14, yb - 0.95, yb - 0.3, pz - 0.5, pz - 0.2, { ao: 0.75 });
      G.box('trim', -px - 0.1, px + 0.1, yb + 0.05, yb + 0.9, pz - 0.18, pz + 0.02);
      G.box('trim', -px - 0.4, px + 0.4, yt - 0.5, yt - 0.35, z, pz + 0.7, { ao: (x, y) => (y < yt - 0.45 ? 0.7 : 1) });
      for (const sx of [-1, 1]) G.box('trim', sx * px - 0.1, sx * px + 0.1, yb + 0.05, yt - 0.5, z, pz, { tint: 0.95 });
      for (const x of [-px + 0.15, -px / 3, px / 3, px - 0.15]) { G.L.__pillars ??= []; G.L.__pillars.push([x, yb + 0.05, pz - 0.1, LH - 0.6]); }
      G.box('dark', -1.0, 1.0, yb + 0.05, yb + 2.2, z - 2.55, z - 2.5);
    }
    // the pavilion's roof at the rim: a ribbed dome on an octagonal drum
    G.put('trim', new THREE.CylinderGeometry(2.4, 2.6, 0.9, 8), { pos: [0, 0.45, z - 0.3], tint: 0.95 });
    G.put('carve', lathe([[2.3, 0], [2.3, 0.2], [2.15, 0.9], [1.7, 1.6], [1.0, 2.1], [0.35, 2.35], [0, 2.4]], lite ? 10 : 20), { pos: [0, 0.9, z - 0.3] });
    G.put('trim', lathe([[0.3, 0], [0.42, 0.18], [0.2, 0.42], [0.28, 0.55], [0.06, 0.95], [0, 1]], 8), { pos: [0, 3.25, z - 0.3] });
    // shrine niches either side of the pavilion: deep framed recesses with a carved figure block
    for (const sx of [-1, 1]) {
      const x = sx * 5.6, yb = -LH * 2 + 0.3;
      G.box('carve', x - 1.0, x + 1.0, yb, yb + 2.6, zb + 0.02, zb + 0.35, { ao: 0.8 });
      G.box('dark', x - 0.7, x + 0.7, yb + 0.2, yb + 2.2, zb + 0.36, zb + 0.37);
      G.put('carve', new THREE.CapsuleGeometry(0.28, 0.9, 3, 8), { pos: [x, yb + 1.0, zb + 0.6], tint: 0.8 });
      G.put('carve', new THREE.SphereGeometry(0.2, 8, 6), { pos: [x, yb + 1.75, zb + 0.6], tint: 0.8 });
    }
    // the mass under the gallery down to its foot (the steps of storey GAL start there)
    G.box('wall', -wellHalf(WELL.GAL), wellHalf(WELL.GAL), GAL_BOT - 0.01, GAL_BOT + 0.35, z - 3, z + 0.6, { tint: 0.95 });
  }
  const pillarsAt = G.L.__pillars; delete G.L.__pillars;

  // ---- the rim: paving with the opening cut out, a parapet, and the arcaded cloister on three sides
  const RIM = new Kit();
  {
    const P = 8.5;
    RIM.box('pave', -A0 - P, A0 + P, -0.4, 0, A0, A0 + P);
    RIM.box('pave', -A0 - P, A0 + P, -0.4, 0, -A0 - P, -A0);
    RIM.box('pave', A0, A0 + P, -0.4, 0, -A0, A0);
    RIM.box('pave', -A0 - P, -A0, -0.4, 0, -A0, A0);
    // parapet with a moulded coping
    for (const s of [-1, 1]) {
      RIM.box('trim', -A0 - 0.45, A0 + 0.45, 0, 0.62, s > 0 ? A0 : -A0 - 0.45, s > 0 ? A0 + 0.45 : -A0, { ao: (x, y) => 0.8 + 0.2 * Math.min(1, y / 0.5) });
      RIM.box('trim', s > 0 ? A0 : -A0 - 0.45, s > 0 ? A0 + 0.45 : -A0, 0, 0.62, -A0, A0, { ao: (x, y) => 0.8 + 0.2 * Math.min(1, y / 0.5) });
      RIM.box('carve', -A0 - 0.55, A0 + 0.55, 0.62, 0.72, s > 0 ? A0 - 0.08 : -A0 - 0.55, s > 0 ? A0 + 0.55 : -A0 + 0.08);
      RIM.box('carve', s > 0 ? A0 - 0.08 : -A0 - 0.55, s > 0 ? A0 + 0.55 : -A0 + 0.08, 0.62, 0.72, -A0, A0);
    }
    // cloister: plinth, back wall, roof slab and eave on S, E, W; its pillars are instanced
    const C0 = A0 + 2.2, C1 = A0 + 6.0, CH = 3.6;
    const sides = [[1, 'z'], [1, 'x'], [-1, 'x']];
    for (const [s, ax] of sides) {
      const b = (u0, u1, y0, y1, d0, d1, o) => (ax === 'z' ? RIM.box(o?.k ?? 'pave', u0, u1, y0, y1, s * d0, s * d1, o) : RIM.box(o?.k ?? 'pave', s * d0, s * d1, y0, y1, u0, u1, o));
      const L0 = -C1, L1 = ax === 'z' ? C1 : C1;
      b(L0, L1, 0, 0.35, C0 - 0.4, C1, { k: 'trim', tint: 0.95 });
      b(L0, L1, 0.35, CH + 0.3, C1 - 0.5, C1, { k: 'wall', tint: 0.9, ao: (x, y) => 0.7 + 0.3 * Math.min(1, y / 3) });
      b(L0, L1, CH, CH + 0.3, C0 - 0.6, C1, { k: 'trim' });
      b(L0, L1, CH - 0.12, CH, C0 - 1.0, C0 - 0.2, { k: 'trim', tint: 0.92, ao: 0.75 });
      b(L0, L1, CH + 0.3, CH + 0.75, C0 - 0.3, C0 - 0.05, { k: 'carve' });
    }
    // the courtyard outside the cloister and the ground beyond it
    RIM.box('pave', -A0 - 60, A0 + 60, -0.6, -0.02, A0 + P, A0 + 60, { tint: 0.85 });
  }
  const cloisterAt = [];
  {
    const C0 = A0 + 2.2, n = Math.round((2 * (A0 + 6)) / 2.6);
    for (let i = 0; i <= n; i++) {
      const u = -(A0 + 5.5) + i * (2 * (A0 + 5.5)) / n;
      cloisterAt.push([u, 0.35, C0 - 0.6], [C0 - 0.6, 0.35, u], [-(C0 - 0.6), 0.35, u]);
    }
  }

  // ---- assemble
  const grp = new THREE.Group();
  grp.add(K.build(mats), G.build(mats), RIM.build(mats));
  const PK = new Kit(); pillar(PK, 'carve', 1, 0.34, { lite });
  const pm = [...pillarsAt.map(([x, y, z, h]) => M4(x, y, z, 0, [1, h, 1])), ...cloisterAt.map(([x, y, z]) => M4(x, y, z, 0, [1.05, 3.6 - 0.35 - 0.12, 1.05]))];
  grp.add(instanceKit(PK, mats, pm));
  const tris = K.tris() + G.tris() + RIM.tris() + PK.tris() * pm.length;
  return { group: grp, steps, tris };
}
