// WATER WISDOM — Udaipur, the 'City of Lakes', for src/scenes/india/water.js.
// Lake Pichola (made in 1362, enlarged by Maharana Udai Singh II in the 16th century) with:
//   · the LAKE PALACE, Jag Niwas (1743–1746, Maharana Jagat Singh II): white walls rising straight from
//     the water round a garden court — three storeys of cusped arches and balconied windows on the
//     front, two on the other wings, a projecting central pavilion under a large dome, octagonal corner
//     towers and a skyline of domed chhatris, a boat landing with steps into the lake
//   · the CITY PALACE on the east shore: a long cream-white cliff of storeys, towers and cupolas above
//     the ghats, the old city's houses climbing the slope round it
//   · green Aravalli hills all round (a ridge close behind the palace, which the camera crosses to Jaipur)
//   · everything above the water doubled in it (mirrored geometry under a translucent, rippled lake)
// Layout in metres: the Lake Palace at the origin, lake surface y = 0, the palace front turned to face
// the incoming camera (south-west).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm2 } from '../../lib/noise.js';
import { rng, smoothstep, lerp } from '../../lib/math.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { Kit, instanceKit, lathe, M4, plasterMaterial, stoneMaterial } from './water-assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const V2 = (x, y) => new THREE.Vector2(x, y);
export const PALACE = V(0, 0, 0);
const PAL_RY = -0.86;                   // palace front (+z local) turned toward the camera's approach
export const RIDGE_Z = -175;            // the green ridge behind the palace (crossed on the way to Jaipur)
export const JAIPUR = V(40, 0, -335);   // the Hawa Mahal's street front (its façade faces +z)
const CITY_X = 282;                     // the City Palace's lake front

// ------------------------------------------------------------------------------------------- terrain
const LAKE = { cx: -300, rx: 540, cz: 380, rz: 490 };
function lakeQ(x, z) {
  const a = Math.abs((x - LAKE.cx) / LAKE.rx), b = Math.abs((z - LAKE.cz) / LAKE.rz);
  return Math.pow(a ** 4 + b ** 4, 0.25) + 0.035 * fbm2(x / 160, z / 160, 3);
}
export function heightAt(x, z) {
  const q = lakeQ(x, z);
  // land rising from the shore, the Aravalli hills beyond
  let h = q < 1 ? -3.5 : Math.min(14, (q - 1) * 70) + smoothstep(1.12, 1.75, q) * (55 + 120 * (0.5 + 0.5 * fbm2(x / 420, z / 420, 4)));
  if (q >= 1) {
    h += 4 * fbm2(x / 60, z / 60, 3) * smoothstep(1.0, 1.1, q);
    // rugged Aravalli relief: ridged noise on the hills
    const rg = 1 - Math.abs(fbm2(x / 130 + 3, z / 130, 4));
    h += smoothstep(1.1, 1.5, q) * 45 * rg * rg;
  }
  // the ridge behind the palace
  const ridge = 46 * Math.exp(-(((z - RIDGE_Z) / 42) ** 2)) * (0.85 + 0.25 * fbm2(x / 140, 3.7, 3)) * smoothstep(-650, -380, x) * smoothstep(700, 420, x);
  h = Math.max(h, q < 1 ? h : 0) + ridge * smoothstep(0.96, 1.02, q);
  // the plain of Jaipur beyond it, the Nahargarh hills further north
  const jp = smoothstep(RIDGE_Z - 60, RIDGE_Z - 110, z);
  if (jp > 0) {
    const plain = 0.6 * fbm2(x / 80, z / 80, 2) + 0.5;
    const north = smoothstep(-760, -980, z) * (45 + 50 * (0.5 + 0.5 * fbm2(x / 260, z / 260, 3)));
    h = lerp(h, plain + north, jp);
  }
  // terraces for the City Palace and the old city on the east shore
  const ec = smoothstep(CITY_X - 30, CITY_X - 12, x) * smoothstep(-200, -150, z) * smoothstep(240, 190, z);
  h = lerp(h, Math.max(h, 9), ec);
  return h;
}
function axisCoords(a, b, step, far, grow = 1.14) {
  const out = [];
  for (let x = a; x <= b + 1e-6; x += step) out.push(x);
  let s = step, x = a; while (x > a - far) { s *= grow; x -= s; out.unshift(x); }
  s = step; x = out[out.length - 1]; while (x < b + far) { s *= grow; x += s; out.push(x); }
  return out;
}
// the terrain grid; `mirror`: only what stands above the water, flipped (for the reflection)
function terrainGeometry(lite, mirror) {
  const st = mirror ? (lite ? 24 : 16) : lite ? 16 : 10;
  const xs = axisCoords(-380, 420, st, 2600), zs = axisCoords(-420, 320, st, 2600);
  const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), hs = new Float32Array(nx * nz);
  const cDeep = new THREE.Color('#244a1f'), cGrass = new THREE.Color('#5a8a32'), cDry = new THREE.Color('#8c8a4c'), cRock = new THREE.Color('#7b6a56'), cShore = new THREE.Color('#b8a585'), cCity = new THREE.Color('#b39a7c'), tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = xs[i], z = zs[j], y = heightAt(x, z), k = (j * nx + i);
    hs[k] = y;
    pos[k * 3] = x; pos[k * 3 + 1] = mirror ? -Math.max(y, 0) - 0.02 : y; pos[k * 3 + 2] = z;
    const n1 = fbm2(x / 90 + 7, z / 90, 3) * 0.5 + 0.5, n2 = fbm2(x / 25, z / 25 + 3, 2) * 0.5 + 0.5;
    const n3 = fbm2(x / 9 + 11, z / 9, 2) * 0.5 + 0.5;
    // monsoon green: forest in the folds, scrub and grass between, dry patches
    tmp.copy(cGrass).lerp(cDeep, smoothstep(0.42, 0.62, n1 * 0.75 + n3 * 0.35)).lerp(cDry, smoothstep(0.62, 0.86, n2) * 0.4);
    tmp.multiplyScalar(0.85 + 0.3 * n3);
    // rock on the steeper, higher ground
    const dx = heightAt(x + 4, z) - y, dz = heightAt(x, z + 4) - y, sl = Math.hypot(dx, dz) / 4;
    tmp.lerp(cRock, smoothstep(0.55, 1.0, sl) * 0.7);
    tmp.lerp(cShore, smoothstep(2.5, 0.3, y) * (y > -1 ? 1 : 0));
    if (z < RIDGE_Z - 110 && z > -470) tmp.lerp(cCity, 0.5 * smoothstep(260, 120, Math.abs(x - JAIPUR.x)));
    col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + nx;
    const hmax = Math.max(hs[a], hs[a + 1], hs[b], hs[b + 1]);
    if (mirror ? hmax < 0.2 : hmax < -2.5) continue;          // nothing under the lake: the mirrored world shows there
    if (mirror) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------------------- trees
// round-crowned trees (neem, pipal, mango): a trunk (and limbs, near) under a dome of lumpy leaf
// clusters; vertex colour darkens into the crown and under it, the foliage shader breaks each cluster
// into leaf clumps (world-space noise), each instance gets its own green
const treeGeoCache = {};
export function treeGeometry(lite) {
  if (treeGeoCache[lite]) return treeGeoCache[lite];
  const r = rng(lite ? 12 : 13), parts = [];
  const bark = [0.2, 0.15, 0.1];
  parts.push([new THREE.CylinderGeometry(0.16, 0.34, 3.4, lite ? 5 : 7).translate(0, 1.7, 0).toNonIndexed(), bark]);
  if (!lite) for (const [ax, az] of [[0.9, 0.3], [-0.7, -0.6], [0.1, 0.9]]) {
    const limb = new THREE.CylinderGeometry(0.07, 0.13, 2.0, 5).translate(0, 1.0, 0);
    limb.rotateZ(-ax * 0.6); limb.rotateX(az * 0.6); limb.translate(0, 2.9, 0);
    parts.push([limb.toNonIndexed(), bark]);
  }
  const lobes = lite ? [[0, 4.7, 0, 2.4], [1.4, 4.0, 0.7, 1.8], [-1.3, 4.1, -0.6, 1.9]]
    : [[0, 4.5, 0, 2.0], [1.6, 4.0, 0.6, 1.5], [-1.5, 4.1, -0.5, 1.6], [0.4, 5.6, -0.4, 1.5], [-0.5, 4.2, 1.5, 1.4], [0.6, 4.3, -1.6, 1.4], [-0.8, 5.3, 0.6, 1.2]];
  for (const [x, y, z, rr] of lobes) {
    const g = mergeVertices(new THREE.IcosahedronGeometry(rr, lite ? 0 : 1).deleteAttribute('normal').deleteAttribute('uv')), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const k = 1 + 0.2 * Math.sin(vx * 3.1 + vy * 2.3) * Math.sin(vz * 2.7 - vy * 1.7) + (r() - 0.5) * 0.16;
      p.setXYZ(i, vx * k + x, vy * k * (vy < 0 ? 0.6 : 0.85) + y, vz * k + z);
    }
    g.computeVertexNormals();
    parts.push([g.toNonIndexed(), null]);
  }
  const n = parts.reduce((s, [g]) => s + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of parts) {
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
    for (let v = 0; v < g.attributes.position.count; v++) {
      const x = g.attributes.position.getX(v), y = g.attributes.position.getY(v), z = g.attributes.position.getZ(v);
      const out = Math.min(1, Math.hypot(x, y - 4.5, z) / 2.8), up = Math.min(1, Math.max(0, (y - 3.2) / 3));
      const sh = (0.55 + 0.45 * out) * (0.7 + 0.45 * up);
      C.set(c ?? [0.16 * sh, 0.3 * sh, 0.09 * sh], (o + v) * 3);
    }
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return (treeGeoCache[lite] = geo);
}
let treeMatCache = null;
const treeMat = () => {
  if (treeMatCache) return treeMatCache;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.userData.noAntiTile = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { mat4 mm = modelMatrix;
          #ifdef USE_INSTANCING
            mm = modelMatrix * instanceMatrix;
          #endif
          vTW = (mm * vec4(transformed, 1.0)).xyz; }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTW;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float a = snoise(vTW * 1.7) * 0.5 + 0.5, b = snoise(vTW * 5.3 + 7.0) * 0.5 + 0.5;
          diffuseColor.rgb *= 0.62 + 0.55 * smoothstep(0.25, 0.85, a * 0.7 + b * 0.45);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.15, 1.1, 0.7), smoothstep(0.7, 0.95, b) * 0.4); }`);
  };
  m.customProgramCacheKey = () => 'waterFoliage';
  return (treeMatCache = m);
};
// place(r) → [x, y, z, scale] or null; mirrorY: also return a mirrored copy about that water level
export function buildTrees({ lite = false, count = 200, seed = 5, place, mirror = null }) {
  const r = rng(seed), list = [];
  for (let k = 0; k < count * 8 && list.length < count; k++) { const p = place(r); if (p) list.push([...p, r() * 6.28, 0.85 + 0.3 * r()]); }
  const geo = treeGeometry(lite), mat = treeMat();
  const grp = new THREE.Group();
  const mk = (flip, sel) => {
    const L = sel ? list.filter(sel) : list;
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, L.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color(), rr = rng(seed + 1);
    L.forEach(([x, y, z, s, a, sy], i) => {
      q.setFromAxisAngle(V(0, 1, 0), a);
      m4.compose(V(x, flip ? -y + 0.3 : y - 0.3, z), q, V(s, (flip ? -1 : 1) * s * sy, s)); im.setMatrixAt(i, m4);
      tint.setRGB(0.8 + 0.35 * rr(), 0.85 + 0.3 * rr(), 0.75 + 0.3 * rr()); im.setColorAt(i, tint);
    });
    im.count = L.length;
    im.castShadow = !flip; im.receiveShadow = !flip;
    im.computeBoundingSphere();
    return im;
  };
  grp.add(mk(false));
  if (mirror) { const m = mk(true, mirror); m.name = 'treeMirror'; grp.userData.mirror = m; }
  return grp;
}

// ------------------------------------------------------------------------------------------- arches
// a cusped (multifoil) Rajput arch: from (−w/2, spring) over to (w/2, spring); nc lobes
function archPts(w, spring, rise, n = 14, nc = 5, cusp = 0.08) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, a = Math.PI * (1 - s);
    let x = Math.cos(a) * w / 2, y = Math.sin(a) * rise;
    // pointed crown
    y += rise * 0.18 * Math.pow(1 - Math.abs(2 * s - 1), 3);
    const sc = cusp * w * Math.abs(Math.sin(Math.PI * nc * s)) * (s > 0.04 && s < 0.96 ? 1 : 0);
    const nx = Math.cos(a), ny = Math.sin(a);
    x -= nx * sc; y -= ny * sc;
    pts.push(V2(x, spring + y));
  }
  return pts;
}
function archPanel(w, spring, rise, n, nc, cusp) { return new THREE.Shape([V2(-w / 2, 0), ...archPts(w, spring, rise, n, nc, cusp), V2(w / 2, 0)]); }
function archFrame(W, H, w, spring, rise, n, nc, cusp) {
  const s = new THREE.Shape([V2(-W / 2, 0), V2(W / 2, 0), V2(W / 2, H), V2(-W / 2, H)]);
  s.holes.push(new THREE.Path([V2(-w / 2, 0), ...archPts(w, spring, rise, n, nc, cusp), V2(w / 2, 0)].reverse()));
  return s;
}
const extrude = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });

// one bay of a white façade (local: face at z = 0, foot at y = 0, facing +z); kind: arcade | window | balcony
function bayKit(kind, { BW = 3.0, SH = 4.4, lite = false, frame = 'white', dark = 'dark' } = {}) {
  const K = new Kit(), n = lite ? 8 : 14;
  const w = kind === 'arcade' ? 1.9 : 1.25, spring = kind === 'arcade' ? 2.3 : 1.75, rise = kind === 'arcade' ? 1.05 : 0.75;
  const fy = kind === 'arcade' ? 0.15 : 0.7;
  K.at(0, fy, 0, 0, () => {
    K.put(dark, new THREE.ShapeGeometry(archPanel(w, spring, rise, n, lite ? 0 : 5, lite ? 0 : 0.07)), { pos: [0, 0, 0.02], tint: 1 });
    if (!lite) {
      K.put(frame, extrude(archFrame(w + 0.5, spring + rise + 0.55, w, spring, rise, n, 5, 0.07), 0.14), { pos: [0, 0, 0], ao: (x, y, z) => (z < 0.05 ? 0.8 : 1) });
      K.box(frame, -w / 2 - 0.36, w / 2 + 0.36, spring + rise + 0.55, spring + rise + 0.68, 0, 0.22, { ao: 0.9 });     // hood moulding
      // the inner reveal: a dark-shaded jamb strip either side, so the opening reads deep
      for (const sx of [-1, 1]) K.box(frame, sx * w / 2 - 0.04, sx * w / 2 + 0.04, 0, spring, -0.02, 0.14, { tint: 0.7 });
    } else K.box(frame, -w / 2 - 0.2, w / 2 + 0.2, spring + rise + 0.2, spring + rise + 0.32, 0, 0.12);
  });
  if (kind === 'balcony') {
    const bw = w + 0.9;
    K.box(frame, -bw / 2, bw / 2, 0.55, 0.7, 0, 0.75, { ao: (x, y) => (y < 0.6 ? 0.7 : 1) });
    if (!lite) {
      for (const sx of [-1, 0, 1]) K.box(frame, sx * bw * 0.36 - 0.07, sx * bw * 0.36 + 0.07, 0.05, 0.55, 0, 0.55 - 0.3 * 0, { ao: 0.75 });  // brackets
      for (let i = 0; i <= 6; i++) K.box(frame, -bw / 2 + 0.08 + i * (bw - 0.16) / 6 - 0.03, -bw / 2 + 0.08 + i * (bw - 0.16) / 6 + 0.03, 0.7, 1.35, 0.62, 0.68);
      K.box(frame, -bw / 2, bw / 2, 1.35, 1.43, 0.58, 0.74);
      // its little curved roof (bangaldar eave) over the window
      K.put(frame, new THREE.CylinderGeometry(0.95, 0.95, bw, 10, 1, true, -Math.PI / 2 + 0.25, Math.PI - 0.5).rotateZ(Math.PI / 2).scale(1, 0.35, 0.8), { pos: [0, fy + spring + rise + 0.75, 0.25] });
    } else K.box(frame, -bw / 2, bw / 2, 0.7, 1.3, 0.6, 0.7);
  } else if (kind === 'window' && !lite) K.box(frame, -w / 2 - 0.25, w / 2 + 0.25, 0.6, 0.72, 0, 0.3, { ao: 0.85 });
  // pilasters at the bay edges
  if (!lite) for (const sx of [-1, 1]) K.box(frame, sx * BW / 2 - 0.16, sx * BW / 2 + 0.16, 0, SH - 0.5, 0, 0.1, { tint: 0.97 });
  return K;
}
// chhatri: plinth, four pillars, flared eave, a ribbed dome and a finial (2.4 m square at scale 1)
function chhatriKit(lite) {
  const K = new Kit();
  K.box('white', -1.2, 1.2, 0, 0.32, -1.2, 1.2, { ao: 0.9 });
  K.box('white', -1.05, 1.05, 0.32, 0.42, -1.05, 1.05);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    K.box('white', sx * 0.85 - 0.11, sx * 0.85 + 0.11, 0.42, 2.05, sz * 0.85 - 0.11, sz * 0.85 + 0.11);
    if (!lite) K.box('white', sx * 0.85 - 0.16, sx * 0.85 + 0.16, 1.85, 2.05, sz * 0.85 - 0.16, sz * 0.85 + 0.16);
  }
  K.box('dark', -0.75, 0.75, 0.42, 1.95, -0.75, 0.75, { tint: 0.6 });   // the shaded interior
  for (const s of [-1, 1]) { K.box('white', -1.0, 1.0, 1.95, 2.12, s * 0.85 - 0.12, s * 0.85 + 0.12); K.box('white', s * 0.85 - 0.12, s * 0.85 + 0.12, 1.95, 2.12, -1.0, 1.0); }
  K.put('white', new THREE.CylinderGeometry(1.05, 1.62, 0.28, 4, 1, false, Math.PI / 4), { pos: [0, 2.22, 0], ao: (x, y) => (y < 2.15 ? 0.65 : 1) });
  K.box('white', -1.0, 1.0, 2.36, 2.62, -1.0, 1.0);
  K.put('white', lathe([[0.95, 0], [0.98, 0.15], [0.92, 0.55], [0.7, 0.95], [0.38, 1.18], [0.12, 1.28], [0, 1.3]], lite ? 8 : 16), { pos: [0, 2.62, 0] });
  if (!lite) K.put('white', lathe([[0.3, 0], [0.4, 0.06], [0.3, 0.14]], 12), { pos: [0, 3.86, 0], tint: 0.95 });
  K.put('gold', lathe([[0.1, 0], [0.16, 0.12], [0.06, 0.3], [0.11, 0.4], [0.03, 0.72], [0, 0.75]], 6), { pos: [0, 3.92, 0] });
  return K;
}

// ------------------------------------------------------------------------------------------- materials
function makeUdaipurMaterials() {
  return {
    white: plasterMaterial({ color: '#ffffff', tintA: '#e4ddd1', tintB: '#cdc3b4', rough: 0.62, name: 'udWhite' }),
    shade: plasterMaterial({ color: '#ffffff', tintA: '#ddd5c8', tintB: '#c9bfb0', rough: 0.7, name: 'udShade' }),
    base: stoneMaterial({ color: '#ffffff', tintA: '#bfb3a0', tintB: '#8e8577', course: 0.55, block: 1.1, name: 'udBase' }),
    cream: plasterMaterial({ color: '#ffffff', tintA: '#efe3c6', tintB: '#d8c6a0', rough: 0.72, name: 'udCream' }),
    ochre: plasterMaterial({ color: '#ffffff', tintA: '#e3c58e', tintB: '#c9a66c', rough: 0.75, name: 'udOchre' }),
    dark: new THREE.MeshStandardMaterial({ color: '#23262c', roughness: 0.6, metalness: 0 }),
    gold: new THREE.MeshStandardMaterial({ color: '#d9ad5a', roughness: 0.32, metalness: 1 }),
    green: plasterMaterial({ color: '#ffffff', tintA: '#66b03c', tintB: '#4c8a2c', rough: 0.95, name: 'udLawn' }),
    roof: stoneMaterial({ color: '#ffffff', tintA: '#ddd4c4', tintB: '#c2b8a6', course: 0.9, block: 0.9, stain: 0, rough: 0.8, joint: 0.3, name: 'udRoof' }),
  };
}

// ------------------------------------------------------------------------------------------- Lake Palace
// local frame: centre at the origin, front (+z); 100 × 80 m round a garden court
function buildLakePalace(M, { lite = false } = {}) {
  const K = new Kit(), R = rng(31);
  const SH = 4.4, X = 50, Z = 40;
  const bays = { arcade: [], window: [], balcony: [] };
  const chh = [];                                   // [x, y, z, scale]
  const wing = (x0, x1, z0, z1, n, faces) => {
    const top = n * SH;
    K.box('white', x0, x1, 0.9, top, z0, z1, { ao: (x, y) => 0.86 + 0.14 * Math.min(1, (y - 0.9) / 3) });
    // storey bands (chhajja eaves) and the parapet
    for (let s = 1; s <= n; s++) {
      const y = s * SH;
      const o = s === n ? 0.6 : 0.45;
      K.box('white', x0 - o, x1 + o, y - 0.5, y - 0.32, z0 - o, z1 + o, { ao: (xx, yy) => (yy < y - 0.45 ? 0.62 : 1) });
      if (!lite) K.box('shade', x0 - 0.12, x1 + 0.12, y - 0.85, y - 0.5, z0 - 0.12, z1 + 0.12, { tint: 0.95 });
    }
    K.box('white', x0, x1, top, top + 1.0, z0, z1);
    // the roof terrace: paved, behind a low parapet with a moulded coping
    K.box('roof', x0 + 0.3, x1 - 0.3, top + 1.0, top + 1.04, z0 + 0.3, z1 - 0.3);
    if (!lite) for (const [a0, a1, b0, b1] of [[x0, x1, z0, z0 + 0.3], [x0, x1, z1 - 0.3, z1], [x0, x0 + 0.3, z0, z1], [x1 - 0.3, x1, z0, z1]]) {
      K.box('white', a0, a1, top + 1.0, top + 1.5, b0, b1, { ao: (x, y) => (y < top + 1.15 ? 0.8 : 1) });
      K.box('white', a0 - 0.06, a1 + 0.06, top + 1.5, top + 1.58, b0 - 0.06, b1 + 0.06);
    }
    // bays along the outward faces
    for (const f of faces) {
      const along = f === 'S' || f === 'N' ? x1 - x0 : z1 - z0, nb = Math.floor(along / 3.0);
      for (let s = 0; s < n; s++) for (let b = 0; b < nb; b++) {
        const u = -along / 2 + (b + 0.5) * (along / nb);
        const kind = s === 0 ? 'arcade' : (b % 3 === 1 || s === n - 1 && b % 2 === 0) ? 'balcony' : 'window';
        const y = s === 0 ? 0.9 : s * SH;
        let x, z, ry;
        if (f === 'S') { x = (x0 + x1) / 2 + u; z = z1; ry = 0; }
        else if (f === 'N') { x = (x0 + x1) / 2 - u; z = z0; ry = Math.PI; }
        else if (f === 'E') { x = x1; z = (z0 + z1) / 2 - u; ry = Math.PI / 2; }
        else { x = x0; z = (z0 + z1) / 2 + u; ry = -Math.PI / 2; }
        bays[kind].push(M4(x, y, z, ry));
      }
    }
    return top;
  };
  // the island base: stone walls straight out of the water, a darker band at the waterline
  K.box('base', -X - 1, X + 1, -1.5, 0.9, -Z - 1, Z + 1, { ao: (x, y) => 0.7 + 0.3 * Math.min(1, (y + 0.2) / 1.0) });
  if (!lite) K.box('white', -X - 1.15, X + 1.15, 0.9, 1.05, -Z - 1.15, Z + 1.15);
  // wings round the court
  const tF = wing(-X, X, Z - 14, Z, 2, ['S']);
  wing(-X, -X + 13, -Z + 13, Z - 14, 2, ['W']);
  wing(X - 13, X, -Z + 13, Z - 14, 2, ['E']);
  wing(-X, X, -Z, -Z + 13, 2, ['N', 'W', 'E']);
  // the side faces of the front wing (3 storeys) and the courtyard faces (seen from the air)
  for (const sx of [-1, 1]) for (let s = 0; s < 2; s++) for (let b = 0; b < 4; b++) bays[s === 0 ? 'arcade' : 'window'].push(M4(sx * X, s === 0 ? 0.9 : s * SH, Z - 14 + 1.75 + b * 3.5 - 0.0, sx * Math.PI / 2));
  for (let b = 0; b < 24; b++) bays.arcade.push(M4(-X + 13 + 1.5 + b * 3.08, 0.9, -Z + 13, 0));
  for (let b = 0; b < 24; b++) bays.window.push(M4(-X + 13 + 1.5 + b * 3.08, SH, -Z + 13, 0));
  for (let b = 0; b < 24; b++) bays.arcade.push(M4(X - 13 - 1.5 - b * 3.08, 0.9, Z - 14, Math.PI));
  // the garden court: lawn, a central pool and fountain kiosk, a few trees
  K.box('roof', -X + 13, X - 13, 0.9, 1.0, -Z + 13, Z - 14, { tint: 0.95 });
  for (const [a, b] of [[-X + 14, -11], [11, X - 14]]) for (const [c, d] of [[-Z + 14, -8], [8, Z - 15]]) K.box('green', a, b, 1.0, 1.08, c, d, { tint: 0.9 + R() * 0.15 });
  K.box('white', -9, 9, 0.9, 1.25, -6, 6);
  K.box('dark', -8.2, 8.2, 1.2, 1.27, -5.2, 5.2, { tint: 0.9 });
  chh.push([0, 1.25, 0, 1.3]);
  for (const [x, z] of [[-26, -12], [-24, 10], [26, -10], [22, 12], [-12, 16], [14, -18]]) K.box('white', x - 1.4, x + 1.4, 0.9, 1.4, z - 1.4, z + 1.4);
  // the central pavilion on the front: 4 storeys, projecting, under a large dome
  {
    const px = 9, z0 = Z - 2, z1 = Z + 5, top = 3 * SH;
    K.box('white', -px, px, 0.9, top, z0, z1);
    for (let s = 1; s <= 3; s++) K.box('white', -px - 0.5, px + 0.5, s * SH - 0.5, s * SH - 0.32, z0, z1 + 0.5, { ao: (x, y) => (y < s * SH - 0.45 ? 0.62 : 1) });
    for (let s = 0; s < 3; s++) for (let b = 0; b < 5; b++) bays[s === 0 ? 'arcade' : s === 1 ? 'balcony' : 'window'].push(M4(-px + 1.8 + b * 3.6, s === 0 ? 0.9 : s * SH, z1, 0));
    for (const sx of [-1, 1]) for (let s = 1; s < 3; s++) bays.window.push(M4(sx * px, s * SH, (z0 + z1) / 2 + 1.5, sx * Math.PI / 2));
    K.box('white', -px, px, top, top + 1.0, z0, z1);
    // drum and dome
    const cz = (z0 + z1) / 2 - 2;
    K.put('white', new THREE.CylinderGeometry(4.6, 4.6, 2.0, 8, 1, false, Math.PI / 8), { pos: [0, top + 1.0, cz] });
    K.put('white', new THREE.CylinderGeometry(5.0, 5.0, 0.3, 8, 1, false, Math.PI / 8), { pos: [0, top + 2.1, cz], ao: 0.85 });
    // the dome rises from a ring of lotus petals (a fluted, slightly bulbous Rajput dome)
    if (!lite) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; K.put('white', new THREE.SphereGeometry(0.75, 6, 4).scale(1, 0.55, 0.5), { pos: [Math.sin(a) * 4.15, top + 2.45, cz + Math.cos(a) * 4.15], ry: a, tint: 0.95 }); }
    const dome = lathe([[4.3, 0], [4.55, 0.7], [4.5, 1.8], [4.0, 3.0], [3.1, 4.1], [1.9, 4.9], [0.8, 5.4], [0.3, 5.55], [0, 5.6]], lite ? 12 : 32);
    if (!lite) { const p = dome.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(x, z), k = 1 + 0.025 * Math.cos(a * 16); p.setX(i, x * k); p.setZ(i, z * k); } dome.computeVertexNormals(); }
    K.put('white', dome, { pos: [0, top + 2.25, cz] });
    K.put('white', lathe([[1.0, 0], [1.25, 0.18], [0.9, 0.4]], 16), { pos: [0, top + 7.8, cz], tint: 0.96 });
    K.put('gold', lathe([[0.3, 0], [0.42, 0.25], [0.2, 0.6], [0.3, 0.85], [0.07, 1.6], [0, 1.7]], 8), { pos: [0, top + 8.15, cz] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) chh.push([sx * (px - 1.2), top + 1.0, cz + sz * 4.2, 0.8]);
  }
  // projecting bays at x = ±27 on the front, each with a chhatri on top
  for (const sx of [-1, 1]) {
    const x = sx * 27, top = 3 * SH;  // (three storeys: rising above the two-storey front)
    K.box('white', x - 4.5, x + 4.5, 0.9, top, Z - 1, Z + 3);
    for (let s = 0; s < 3; s++) for (let b = 0; b < 3; b++) bays[s === 0 ? 'arcade' : 'balcony'].push(M4(x - 3 + b * 3, s === 0 ? 0.9 : s * SH, Z + 3, 0));
    for (let s = 1; s <= 3; s++) K.box('white', x - 5, x + 5, s * SH - 0.5, s * SH - 0.32, Z - 1, Z + 3.5, { ao: (xx, y) => (y < s * SH - 0.45 ? 0.62 : 1) });
    K.box('white', x - 4.5, x + 4.5, top, top + 1.0, Z - 1, Z + 3);
    chh.push([x, top + 1.0, Z + 1, 1.5]);
  }
  // octagonal corner towers with a chhatri
  for (const [sx, sz, n] of [[-1, 1, 2], [1, 1, 2], [-1, -1, 2], [1, -1, 2]]) {
    const x = sx * X, z = sz * Z, top = n * SH + 3.2;
    K.put('white', new THREE.CylinderGeometry(4.6, 4.9, top - 0.9, 8, 1, false, Math.PI / 8), { pos: [x, 0.9 + (top - 0.9) / 2, z] });
    for (let s = 1; s <= n + 1; s++) { const y = Math.min(s * SH, top); K.put('white', new THREE.CylinderGeometry(5.3, 5.3, 0.2, 8, 1, false, Math.PI / 8), { pos: [x, y - 0.4, z], ao: 0.85 }); }
    for (let s = 0; s <= n; s++) for (let f = 0; f < 8; f++) {
      if (s === 0 && f % 2) continue;
      const a = Math.PI / 8 + f * Math.PI / 4 + Math.PI / 8, r = 4.55;
      bays.window.push(M4(x + Math.sin(a) * r, s === 0 ? 0.9 : s * SH, z + Math.cos(a) * r, a, [0.62, 0.8, 1]));
    }
    K.box('white', x - 3.6, x + 3.6, top, top + 0.8, z - 3.6, z + 3.6);
    chh.push([x, top + 0.8, z, 1.45]);
  }
  // chhatris along the parapets
  for (let x = -42; x <= 42; x += 6) if (Math.abs(x) > 11 && Math.abs(Math.abs(x) - 27) > 6) chh.push([x, tF + 1.0, Z - 1.6, 0.62]);
  for (let x = -40; x <= 40; x += 8) chh.push([x, 2 * SH + 1.0, -Z + 1.8, 0.62]);
  for (const sx of [-1, 1]) for (let z = -28; z <= 20; z += 8) chh.push([sx * (X - 1.8), 2 * SH + 1.0, z, 0.62]);
  // the boat landing: steps into the water and a small arched gate pavilion
  for (let i = 0; i < 6; i++) K.box('base', -6 + i * 0.15, 6 - i * 0.15, -1.2, 0.9 - i * 0.18 + 0.0, Z + 5 + i * 0.5, Z + 5.5 + i * 0.5, { tint: 0.95 - i * 0.03 });
  K.box('white', -6.5, 6.5, 0.6, 0.9, Z + 5, Z + 8.2);
  for (const sx of [-1, 1]) K.box('white', sx * 5.2 - 0.5, sx * 5.2 + 0.5, 0.9, 4.6, Z + 5.3, Z + 6.3);
  K.box('white', -5.8, 5.8, 4.6, 5.3, Z + 5.1, Z + 6.5);
  bays.arcade.push(M4(0, 0.9, Z + 6.3, 0, [2.6, 1.15, 1]));
  chh.push([0, 5.3, Z + 5.8, 1.0]);

  const grp = new THREE.Group();
  grp.add(K.build(M));
  let tris = K.tris();
  for (const [kind, list] of Object.entries(bays)) {
    if (!list.length) continue;
    const bk = bayKit(kind, { lite });
    grp.add(instanceKit(bk, M, list)); tris += bk.tris() * list.length;
  }
  const ck = chhatriKit(lite);
  grp.add(instanceKit(ck, M, chh.map(([x, y, z, s]) => M4(x, y, z, 0, s))));
  tris += ck.tris() * chh.length;
  return { group: grp, tris };
}

// ------------------------------------------------------------------------------------------- City Palace
// a long front facing −x (the lake) at x = CITY_X on a terrace 9 m up: blocks of 4–7 storeys, towers,
// balconies and cupolas, the old city round it
function buildCityPalace(M, { lite = false, mirror = false, sparse = false } = {}) {
  const K = new Kit(), R = rng(17);
  const g0 = 9, wins = [], balc = [], chh = [];
  const blocks = [[-150, -110, 22, 'cream'], [-110, -78, 30, 'cream'], [-78, -40, 26, 'ochre'], [-40, -6, 34, 'cream'], [-6, 30, 29, 'cream'], [30, 62, 24, 'ochre'], [62, 100, 31, 'cream'], [100, 132, 20, 'cream']];
  for (const [z0, z1, h, mat] of blocks) {
    const x0 = CITY_X, depth = 18 + R() * 10;
    K.box(mat, x0, x0 + depth, g0 - 6, g0 + h, z0, z1, { ao: (x, y) => 0.8 + 0.2 * Math.min(1, (y - g0 + 6) / 8) });
    const ns = Math.floor(h / 4.2);
    for (let s = 1; s <= ns; s++) if (!lite || s % 2 === 0) K.box(mat, x0 - 0.5, x0 + 0.2, g0 + s * 4.2 - 0.35, g0 + s * 4.2 - 0.15, z0, z1, { ao: 0.75 });
    K.box(mat, x0 - 0.15, x0 + depth, g0 + h, g0 + h + 1.1, z0, z1);
    const nw = Math.floor((z1 - z0) / 3.2);
    for (let s = 0; s < ns; s++) for (let w = 0; w < nw; w++) {
      const z = z0 + (w + 0.5) * (z1 - z0) / nw, y = g0 + s * 4.2 + 0.4;
      if (R() < (sparse ? (mirror ? 0.75 : 0.5) : 0.12)) continue;
      ((s > 1 && R() < 0.18) ? balc : wins).push(M4(x0, y, z, -Math.PI / 2, 0.8));
    }
    // towers at the block ends, cupolas on the roof
    if (R() < 0.75) {
      const tz = R() < 0.5 ? z0 : z1, th = h + 6;
      K.put(mat, new THREE.CylinderGeometry(3.2, 3.4, th, 8, 1, false, Math.PI / 8), { pos: [x0 + 2, g0 + th / 2, tz] });
      chh.push([x0 + 2, g0 + th, tz, 1.1]);
    }
    for (let z = z0 + 5; z < z1 - 3; z += 9 + R() * 5) chh.push([x0 + 3 + R() * 6, g0 + h + 1.1, z, 0.75 + R() * 0.3]);
  }
  // the ghats: broad steps down into the lake below the palace
  for (let i = 0; i < 10; i++) K.box('base', CITY_X - 26 + i * 1.6, CITY_X - 24.4 + i * 1.6 + 30, -2, 0.2 + i * 0.9, -170, 150, { tint: 0.92 + 0.08 * (i % 2) });
  const grp = new THREE.Group();
  grp.add(K.build(M));
  let tris = K.tris();
  const wk = bayKit('window', { lite: true, BW: 3.2, frame: 'cream' });
  grp.add(instanceKit(wk, M, wins)); tris += wk.tris() * wins.length;
  const bk = bayKit('balcony', { lite, BW: 3.2, frame: 'white' });
  grp.add(instanceKit(bk, M, balc)); tris += bk.tris() * balc.length;
  const ck = chhatriKit(true);
  grp.add(instanceKit(ck, M, chh.map(([x, y, z, s]) => M4(x, y, z, 0, s)))); tris += ck.tris() * chh.length;
  // the old city: white and cream houses with roof terraces on the slopes round the palace
  const HK = new Kit();
  HK.box('white', -0.5, 0.5, 0, 1, -0.5, 0.5);
  HK.box('white', -0.53, 0.53, 0.94, 1.0, -0.53, 0.53);
  HK.box('dark', -0.2, 0.2, 0.25, 0.55, 0.5, 0.505);
  HK.box('dark', -0.38, -0.14, 0.62, 0.82, 0.5, 0.505); HK.box('dark', 0.14, 0.38, 0.62, 0.82, 0.5, 0.505);
  const hm = [], tints = [], r = rng(99);
  for (let k = 0; k < (mirror ? 0 : 1100) && hm.length < (sparse ? 110 : 320); k++) {
    const x = CITY_X - 40 + r() * 260, z = -260 + r() * 520;
    if (x > CITY_X - 6 && x < CITY_X + 34 && z > -152 && z < 134) continue;
    const y = heightAt(x, z); if (y < 1.5 || y > 45) continue;
    const w = 6 + r() * 7, d = 6 + r() * 7, h = 5 + r() * 9;
    hm.push(new THREE.Matrix4().compose(V(x, y - 1, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.PI / 2 + (r() - 0.5) * 0.3), V(w, h + 1, d)));
    const c = r(); tints.push(new THREE.Color().setRGB(1, 0.97 - 0.06 * c, 0.92 - 0.14 * c));
  }
  if (hm.length) { grp.add(instanceKit(HK, M, hm, { tints })); tris += HK.tris() * hm.length; }
  return { group: grp, tris };
}

// ------------------------------------------------------------------------------------------- the lake
function lakeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSunDir: { value: V(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.88, 0.7) }, uDeep: { value: new THREE.Color('#0b3d5c') }, uTeal: { value: new THREE.Color('#1f6f86') }, uSky: { value: new THREE.Color('#9cc2e0') }, uFog: { value: new THREE.Color('#bfd0dc') }, uFogD: { value: 0.0008 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform float uTime, uFogD; uniform vec3 uSunDir, uSunCol, uDeep, uTeal, uSky, uFog; varying vec3 vW;
      float wave(vec2 p){ return snoise(vec3(p * vec2(0.08, 0.22), uTime * 0.3)) * 0.5 + snoise(vec3(p * vec2(0.3, 0.6) + 5.0, uTime * 0.55)) * 0.3 + snoise(vec3(p * 1.3 + 9.0, uTime * 0.9)) * 0.2; }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW.xz - cameraPosition.xz);
        float amp = 0.5 / (1.0 + dist * 0.004), e = 0.4;
        float w0 = wave(vW.xz), wx = wave(vW.xz + vec2(e, 0.0)), wz = wave(vW.xz + vec2(0.0, e));
        vec3 N = normalize(vec3(-(wx - w0) / e * amp, 1.0, -(wz - w0) / e * amp));
        float cosV = max(dot(-V, N), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - cosV, 5.0);
        // translucent: the mirrored world shows through where the surface reflects (grazing), the
        // water's own blue-green body where it is seen from above
        vec3 body = mix(uTeal, uDeep, smoothstep(0.2, 0.9, cosV));
        float a = clamp(mix(0.78, 0.34, fres) + 0.12 * w0, 0.25, 0.86);
        // wind lanes and ripple bands: the reflection breaks up across them
        float lane = smoothstep(0.15, 0.7, snoise(vec3(vW.x * 0.004, vW.z * 0.03, uTime * 0.05)) * 0.5 + 0.5 + 0.3 * snoise(vec3(vW.xz * vec2(0.02, 0.12), 3.0)));
        a = mix(a, max(a, 0.82), lane * 0.55);
        body = mix(body, body * 1.25 + vec3(0.02, 0.05, 0.07), lane * 0.4);
        vec3 R = reflect(V, N);
        float s = max(dot(R, uSunDir), 0.0);
        vec3 col = body + uSunCol * (pow(s, mix(900.0, 120.0, clamp(dist / 900.0, 0.0, 1.0))) * 22.0 + pow(s, 30.0) * 0.12);
        a = max(a, clamp(pow(s, 300.0) * 6.0, 0.0, 1.0));
        // little sky-coloured ripples break the reflection up
        col = mix(col, uSky, 0.18 * smoothstep(0.3, 0.9, w0) * fres);
        float f = 1.0 - exp(-(dist * uFogD) * (dist * uFogD));
        col = mix(col, uFog, f); a = mix(a, 1.0, f * 0.85);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, fog: false,
  });
}

// ------------------------------------------------------------------------------------------- build
export function buildUdaipur({ lite = false } = {}) {
  const M = makeUdaipurMaterials();
  const group = new THREE.Group();
  const lakeSet = new THREE.Group();          // what only the lake half of the shot needs
  group.add(lakeSet);
  // terrain (and its reflection)
  const tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 });
  const terrain = new THREE.Mesh(terrainGeometry(lite, false), tMat); terrain.receiveShadow = true; terrain.castShadow = true;
  group.add(terrain);
  const terrainMirror = new THREE.Mesh(terrainGeometry(true, true), tMat);
  lakeSet.add(terrainMirror);
  // the palace, turned to the camera; its reflection is a lighter build of the same model
  const pal = buildLakePalace(M, { lite });
  pal.group.position.copy(PALACE); pal.group.rotation.y = PAL_RY;
  lakeSet.add(pal.group);
  const palM = buildLakePalace(M, { lite: true });
  palM.group.position.copy(PALACE); palM.group.rotation.y = PAL_RY; palM.group.scale.y = -1;
  palM.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  lakeSet.add(palM.group);
  // the garden court's trees
  const toW = (x, y, z) => V(x, y, z).applyAxisAngle(V(0, 1, 0), PAL_RY).add(PALACE);
  const courtT = [[-28, -14], [-22, 12], [28, -12], [24, 14], [-14, 18], [16, -20], [-34, 2], [34, 0]];
  const court = buildTrees({ lite, count: courtT.length, seed: 41, place: ((i) => (r) => { const [x, z] = courtT[i++ % courtT.length]; const w = toW(x, 1.0, z); return [w.x, 1.3, w.z, 0.85 + r() * 0.3]; })(0) });
  lakeSet.add(court);
  const city = buildCityPalace(M, { lite: true, sparse: lite });
  lakeSet.add(city.group);
  const cityM = buildCityPalace(M, { lite: true, mirror: true, sparse: lite });
  cityM.group.scale.y = -1; cityM.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
  lakeSet.add(cityM.group);
  // trees: hills and shores (reflected where they stand near the water), and on the ridge
  const place = (r) => {
    const x = -700 + r() * 1300, z = -560 + r() * 1100;
    const y = heightAt(x, z);
    if (y < 1.0 || y > 150) return null;
    if (x > CITY_X - 45 && x < CITY_X + 50 && z > -170 && z < 160) return null;
    if (Math.abs(x - JAIPUR.x) < 120 && z < RIDGE_Z - 80 && z > -420) return null;    // the city streets
    const d = Math.hypot(x, z);
    if (d > 520 && r() < 0.6) return null;      // denser where the camera passes
    return [x, y, z, 0.9 + r() * 0.9];
  };
  // far trees: light crowns; near the camera's way over the ridge: the detailed ones
  const nearPath = (x, z) => Math.abs(x - 10) < 90 && z < RIDGE_Z + 50 && z > RIDGE_Z - 130;
  const trees = buildTrees({ lite: true, count: lite ? 200 : 760, seed: 21, place: (r) => { const p = place(r); return p && !nearPath(p[0], p[2]) ? p : null; }, mirror: ([x, y, z]) => y < 30 && lakeQ(x, z) < 1.22 });
  group.add(trees);
  if (trees.userData.mirror) lakeSet.add(trees.userData.mirror);
  const treesNear = buildTrees({ lite, count: lite ? 25 : 42, seed: 23, place: (r) => {
    const x = -80 + r() * 180, z = RIDGE_Z - 130 + r() * 180, y = heightAt(x, z);
    return y > 2 ? [x, y, z, 0.9 + r() * 0.8] : null;
  } });
  group.add(treesNear);
  // the lake surface
  const lakeMat = lakeMaterial();
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200).rotateX(-Math.PI / 2), lakeMat);
  lake.position.set(-300, 0, 500); lake.renderOrder = 3;
  lakeSet.add(lake);

  const toWorld = (x, y, z) => V(x, y, z).applyAxisAngle(V(0, 1, 0), PAL_RY).add(PALACE);
  const api = {
    group, lakeSet, heightAt, PALACE, JAIPUR, RIDGE_Z,
    PALACE_LABEL: toWorld(0, 28.5, 37),
    LAKE_LABEL: V(-150, 6, 40),
    tris: { palace: pal.tris, palaceMirror: palM.tris, city: city.tris, cityMirror: city.tris },
    update(t, camera, fog) {
      lakeMat.uniforms.uTime.value = t;
      if (fog) { lakeMat.uniforms.uFogD.value = Math.max(0.0006, fog.density); lakeMat.uniforms.uFog.value.copy(fog.color); }
      void camera;
    },
    // the camera over the lake, up over the palace and the ridge, down into Jaipur
    cameraKeys(T_CUT, T_UDA, T_JAI, DUR, jai) {
      const H = jai.CENTRE;
      return [
        [T_CUT - 0.2, V(-292, 7.5, 238), V(0, 9, -6)],
        [T_UDA, V(-232, 8.2, 190), V(4, 10, -8)],
        [T_UDA + 0.5, V(-138, 11, 116), V(10, 12, -14)],
        [T_JAI - 0.25, V(-46, 40, 4), V(22, 8, -80)],
        [T_JAI + 0.06, V(10, 84, -150), V(H.x, 4, H.z - 40)],
        [T_JAI + 0.5, V(H.x - 10, 27, H.z + 78), V(H.x, 11, H.z)],
        [DUR + 0.3, V(H.x - 4, 9.5, H.z + 40), V(H.x + 1, 10.5, H.z - 4)],
      ];
    },
  };
  return api;
}
// trees for the other sets (the stepwell's courtyard)
buildUdaipur.trees = buildTrees;
