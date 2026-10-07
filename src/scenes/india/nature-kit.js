// NATURE KIT — living landscape pieces shared by the Indus, Temples, Nalanda, Dharma, Metallurgy, Textiles
// and Yoga chapters (build time only; every animated value is a pure function of the `uTime` uniform).
//   · trees as instanced, wind-swayed meshes with procedural leaf-clump shading and sun translucency:
//       neem · mango (dense domes) · peepal (broad, open) · banyan (wide crown, prop trunks, aerial roots)
//       · ashoka (the columnar mast tree) · cypress (Mughal gardens) · palm (coconut, curved trunk)
//   · grass tufts (instanced blades, wind sway), and GLSL for pasture / lawn / crop-field albedo in world space
//   · a river / tank water shader: blue-green body, sky reflection, far-bank reflection band, ripples, sun
//     glint and foam where it meets the bank (an `aEdge` attribute from riverRibbon, or none)
//   · zebu cattle (a low-poly instanced herd)
// Colours are linear. Nothing here has a texture period: all detail is a function of position.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../../lib/math.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- GLSL
export const NK_NOISE = /* glsl */ `
float nkH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nkH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float nkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(nkH(i), nkH(i + vec2(1, 0)), f.x), mix(nkH(i + vec2(0, 1)), nkH(i + vec2(1, 1)), f.x), f.y); }
float nkN3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(nkH3(i), nkH3(i + vec3(1,0,0)), f.x), mix(nkH3(i + vec3(0,1,0)), nkH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(nkH3(i + vec3(0,0,1)), nkH3(i + vec3(1,0,1)), f.x), mix(nkH3(i + vec3(0,1,1)), nkH3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float nkF(vec2 p){ return nkN(p) * 0.5 + nkN(p * 2.03 + 1.7) * 0.3 + nkN(p * 4.1 + 3.3) * 0.2; }
`;

// Albedo of living ground in world space (q: metres, w: footprint of a pixel in metres, for fading detail).
//   nkPasture: grazed pasture — sun-bleached yellow-greens, dark blue-green clumps, dry patches, bare trails
//   nkLawn:    a kept lawn — finer, more even, faint mowing bands along `dir`
//   nkCrop:    a field of a crop in rows along `dir` (kind 0 young wheat, 1 mustard, 2 rice paddy, 3 cotton,
//              4 indigo, 5 sugar cane); returns the row-and-soil albedo
export const NK_GROUND = /* glsl */ `
vec3 nkPasture(vec2 q, float w, float dry){
  float n1 = nkF(q * 0.013 + 3.1), n2 = nkF(q * 0.07 + 7.7), n3 = nkN(q * 0.45 + 1.3);
  float det = 1.0 - smoothstep(0.05, 0.35, w), n4 = mix(0.5, nkN(q * 3.1 + 9.0), det);
  vec3 sunG = vec3(0.16, 0.27, 0.045), deepG = vec3(0.06, 0.15, 0.05), straw = vec3(0.3, 0.25, 0.11);
  vec3 c = mix(sunG, deepG, smoothstep(0.35, 0.75, n2 * 0.7 + n3 * 0.4));
  c = mix(c, c * vec3(1.15, 1.08, 0.7), smoothstep(0.5, 0.8, n1));                         // yellower drifts
  c = mix(c, straw, smoothstep(0.62, 0.85, n1 * 0.6 + n2 * 0.5) * (0.35 + 0.6 * dry));      // dry patches
  c *= 0.82 + 0.36 * n4;
  return c;
}
vec3 nkLawn(vec2 q, float w, vec2 dir){
  float n1 = nkF(q * 0.05 + 1.1), n2 = nkN(q * 0.6 + 4.2);
  float det = 1.0 - smoothstep(0.03, 0.25, w), n3 = mix(0.5, nkN(q * 6.0 + 2.0), det);
  vec3 c = mix(vec3(0.14, 0.27, 0.055), vec3(0.085, 0.2, 0.055), smoothstep(0.3, 0.8, n1));
  float band = dot(q, dir);
  c *= 1.0 + 0.05 * smoothstep(-0.3, 0.3, sin(band * 0.75)) * (1.0 - smoothstep(0.4, 2.0, w));             // mowing bands
  c = mix(c, vec3(0.16, 0.17, 0.06), smoothstep(0.7, 0.9, n1 * 0.7 + n2 * 0.4) * 0.35);
  return c * (0.88 + 0.24 * n3);
}
vec3 nkCrop(vec2 q, float w, vec2 dir, float kind, float seed){
  vec2 nrm = vec2(-dir.y, dir.x);
  float a = dot(q, nrm), along = dot(q, dir);
  float pitch = kind > 4.5 ? 1.2 : (kind > 1.5 && kind < 2.5 ? 0.3 : 0.45);
  float row = abs(fract(a / pitch) - 0.5) * 2.0;                                              // 0 on a row, 1 between
  float aa = clamp(w / pitch, 0.0, 1.0);
  float cover = kind > 1.5 && kind < 2.5 ? 0.85 : 0.62;
  float plant = mix(1.0 - smoothstep(cover - 0.15, cover + 0.15, row), cover, aa);
  float n = nkF(q * 0.09 + seed * 13.0), m = nkN(q * vec2(0.8, 0.8) + seed);
  vec3 soil = vec3(0.17, 0.12, 0.08) * (0.8 + 0.3 * n);
  vec3 leaf;
  if (kind < 0.5) leaf = mix(vec3(0.07, 0.18, 0.035), vec3(0.11, 0.2, 0.04), n);           // young wheat
  else if (kind < 1.5) leaf = mix(vec3(0.42, 0.36, 0.02), vec3(0.6, 0.48, 0.03), m);       // mustard in flower
  else if (kind < 2.5) { leaf = mix(vec3(0.06, 0.2, 0.06), vec3(0.1, 0.24, 0.05), n); soil = vec3(0.05, 0.08, 0.075); } // paddy: water between
  else if (kind < 3.5) { leaf = mix(vec3(0.05, 0.12, 0.035), vec3(0.08, 0.15, 0.04), n);   // cotton: dark leaves, white bolls
    leaf = mix(leaf, vec3(0.75, 0.73, 0.68), step(0.82, nkN(q * 7.0 + seed)) * (1.0 - smoothstep(0.02, 0.15, w))); }
  else if (kind < 4.5) leaf = mix(vec3(0.04, 0.11, 0.06), vec3(0.06, 0.13, 0.07), n);      // indigo: blue-green shrubs
  else leaf = mix(vec3(0.1, 0.19, 0.05), vec3(0.14, 0.22, 0.06), n);                         // sugar cane
  return mix(soil, leaf, plant * (0.75 + 0.25 * m));
}
`;

// ------------------------------------------------------------------------------------------- foliage material
// sun = { dir: Vector3 (towards the sun, world), color: Color } — held by reference, so a scene can animate it.
// Geometry attributes: position, normal, color (albedo, linear), aLeaf (x: 1 leaf / 0 wood, y: sway weight).
export function foliageMaterial({ sun, wind = 1, trans = 1, detail = 1, side = THREE.FrontSide, tag = '', haze = null } = {}) {
  const u = {
    uHazeC: { value: haze?.color ?? new THREE.Color() }, uHazeK: haze?.k ?? { value: 0 },
    uTime: { value: 0 }, uWind: { value: wind }, uTrans: { value: trans },
    uSunDir: { value: sun?.dir ?? V(0.3, 0.8, 0.4).normalize() }, uSunCol: { value: sun?.color ?? new THREE.Color(1, 0.9, 0.7) },
  };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, side });
  m.userData.noDetail = true; m.userData.noAntiTile = true; m.userData.u = u;
  if (haze) m.fog = false;              // far trees: a scene-controlled haze instead of the scene's fog
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aLeaf; attribute vec2 aF; uniform float uTime, uWind; varying vec3 vLP; varying float vLeaf; varying vec2 vF;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLeaf = aLeaf.x; vLP = position; vF = aF;
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz; vLP += ip * 0.37;
          #endif
          float ph = dot(ip.xz, vec2(0.071, 0.053));
          float g = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 2.1 + ph * 1.7) * 0.3;            // the gusts: whole crown
          float f = sin(uTime * 5.3 + dot(position, vec3(1.7, 2.3, 1.1)) + ph) * 0.35 * aLeaf.x;  // leaf flutter
          transformed.x += (g * 0.09 + f * 0.03) * aLeaf.y * uWind;
          transformed.z += (g * 0.05 + f * 0.03) * aLeaf.y * uWind;
          transformed.y += f * 0.02 * aLeaf.y * uWind;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${NK_NOISE}
        uniform vec3 uSunDir, uSunCol, uHazeC; uniform float uTrans, uHazeK; varying vec3 vLP; varying float vLeaf; varying vec2 vF; float nkBump;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vF.x > 0.0) {
          // palm frond: a comb of leaflets swept towards the tip, cut out along the frond
          float av = abs(vF.y);
          float comb = fract(vF.x * 38.0 - av * 2.2);
          if (av > 0.12 && (comb > 0.58 || av > 0.97 - 0.25 * (1.0 - vF.x))) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          // leaf clumps: lit tufts with dark gaps between them (scale ≈ 0.35 m), and a finer leaf flicker
          float w = length(fwidth(vLP));
          float det = ${detail.toFixed(2)} * (1.0 - smoothstep(0.15, 0.9, w));
          float c1 = nkN3(vLP * 2.6), c2 = nkN3(vLP * 7.3 + 4.0);
          float clump = mix(0.55, smoothstep(0.25, 0.75, c1 * 0.75 + c2 * 0.35), det);
          float lf = vLeaf;
          diffuseColor.rgb *= mix(1.0, 0.55 + 0.6 * clump, lf);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.85, 1.0, 1.25), lf * (1.0 - clump) * 0.5);  // blue-green in the gaps
          nkBump = lf * clump * 0.04 * det;
          // bark: vertical fissures
          float bark = (1.0 - lf) * nkN(vec2(atan(vLP.x, vLP.z) * 6.0, vLP.y * 1.3)) ;
          diffuseColor.rgb *= mix(1.0, 0.7 + 0.5 * bark, 1.0 - lf);
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
          float dt = dot(sX, R1);
          vec3 grad = sign(dt) * (dFdx(nkBump) * R1 + dFdy(nkBump) * R2);
          vec3 nb = abs(dt) * normal - grad;
          if (dot(nb, nb) > 1e-20 && abs(dt) > 1e-14) normal = normalize(nb);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // light through the leaves: looking towards the sun the crown glows yellow-green at its edges
          vec3 Ls = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz), Vv = normalize(vViewPosition);
          float back = pow(max(dot(-Vv, Ls), 0.0), 3.0);
          float rim = 1.0 - abs(dot(normal, Vv));
          float wrap = max(dot(-normal, Ls), 0.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.05, 1.15, 0.55) * uSunCol * uTrans * vLeaf * (back * (0.35 + 0.9 * rim) + wrap * 0.18);
        }`)
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeC, uHazeK);');
  };
  m.customProgramCacheKey = () => 'nk-foliage' + detail + tag + (haze ? 'h' : '');
  return m;
}

// ------------------------------------------------------------------------------------------- tree geometry
// each part: a geometry with position + normal; we add color and aLeaf and merge.
function paint(g, fn) {
  g = g.index ? g.toNonIndexed() : g;
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const p = g.attributes.position, n = g.attributes.normal, C = new Float32Array(p.count * 3), L = new Float32Array(p.count * 2);
  const c = new THREE.Color(), out = { leaf: 0, sway: 0, fu: 0, fv: 0 }, F = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    out.fu = 0; out.fv = 0;
    fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), c, out, i);
    C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; L[i * 2] = out.leaf; L[i * 2 + 1] = out.sway; F[i * 2] = out.fu; F[i * 2 + 1] = out.fv;
  }
  g.setAttribute('color', new THREE.BufferAttribute(C, 3)); g.setAttribute('aLeaf', new THREE.BufferAttribute(L, 2)); g.setAttribute('aF', new THREE.BufferAttribute(F, 2));
  return g;
}
const BARK = new THREE.Color(0.11, 0.085, 0.065), BARK_PALE = new THREE.Color(0.25, 0.22, 0.19);

// a tapered, slightly bent limb from a to b (radius r0 → r1)
function limb(a, b, r0, r1, sides = 6, bend = 0.15, seed = 1, segs = 3) {
  const r = rng(seed), pts = [];
  const off = V(r() - 0.5, 0, r() - 0.5).multiplyScalar(a.distanceTo(b) * bend);
  for (let i = 0; i <= segs; i++) { const u = i / segs; pts.push(a.clone().lerp(b, u).addScaledVector(off, Math.sin(u * Math.PI))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, segs * 2, 1, sides, false);
  // taper: scale each ring about the curve
  const p = g.attributes.position, ringN = sides + 1;
  for (let s = 0; s <= segs * 2; s++) {
    const u = s / (segs * 2), c = curve.getPointAt(u), rr = r0 + (r1 - r0) * u;
    for (let k = 0; k < ringN; k++) { const i = s * ringN + k; const v = V(p.getX(i), p.getY(i), p.getZ(i)).sub(c).multiplyScalar(rr).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  return g;
}

// a lumpy leaf clump (icosphere displaced by low-frequency noise)
function clump(cx, cy, cz, rx, ry, rz, detail, r) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, a = r() * 10, b = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.17 * Math.sin(x * 3.1 + y * 2.3 + a) * Math.sin(z * 2.7 - y * 1.7 + b) + 0.08 * Math.sin(x * 7.0 + z * 5.0 + a);
    p.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rz * k);
  }
  g.computeVertexNormals();
  return g;
}

// crown colouring: lit top, darker blue-green underside and interior, per-clump hue jitter
function crownPainter(base, { top, bottom, cx = 0, cz = 0, h0, h1, jitter }) {
  const lo = base.clone().multiply(new THREE.Color(0.6, 0.68, 0.85)), hi = base.clone().multiply(new THREE.Color(1.18, 1.12, 0.85));
  return (x, y, z, nx, ny, nz, c, o) => {
    const v = Math.min(1, Math.max(0, (y - h0) / (h1 - h0)));
    c.copy(lo).lerp(base, Math.min(1, v * 1.6)).lerp(hi, Math.max(0, v - 0.55) * 1.6 * (0.5 + 0.5 * Math.max(0, ny)));
    const out = (nx * (x - cx) + nz * (z - cz)) / (Math.hypot(x - cx, z - cz) + 1e-3);
    c.multiplyScalar((0.72 + 0.28 * Math.max(0, out) + 0.12 * ny) * jitter);
    o.leaf = 1; o.sway = Math.max(0, (y - bottom) / (top - bottom)) ** 1.5 * (0.6 + 0.4 * Math.hypot(x - cx, z - cz) / 6);
  };
}
function barkPainter(col = BARK, swayTop = 0, yMax = 1) {
  return (x, y, z, nx, ny, nz, c, o) => { c.copy(col).multiplyScalar(0.8 + 0.3 * Math.max(0, nx * 0.6 + ny * 0.4)); o.leaf = 0; o.sway = swayTop * Math.max(0, y / yMax) ** 2; };
}

const KINDS = {
  // [crown base colour, height]
  neem: { col: [0.1, 0.21, 0.04] },
  mango: { col: [0.06, 0.15, 0.045] },
  peepal: { col: [0.115, 0.22, 0.045] },
  banyan: { col: [0.075, 0.18, 0.045] },
  ashoka: { col: [0.065, 0.17, 0.04] },
  cypress: { col: [0.04, 0.115, 0.05] },
  palm: { col: [0.12, 0.2, 0.05] },
  shrub: { col: [0.13, 0.24, 0.05] },
};

// Builds one tree geometry (metres, base at the origin). Variation comes from `seed`.
export function treeGeometry(kind = 'neem', seed = 1, lite = false) {
  const r = rng(seed * 7919 + kind.length), parts = [];
  const det = lite ? 0 : 1, base = new THREE.Color(...KINDS[kind].col);
  const jit = () => 0.88 + 0.24 * r();
  if (kind === 'palm') {
    const H = 9 + r() * 5, lean = V(r() - 0.5, 0, r() - 0.5).normalize().multiplyScalar(H * (0.12 + r() * 0.18));
    const top = V(lean.x, H, lean.z);
    const trunk = limb(V(0, 0, 0), top, 0.22, 0.15, lite ? 4 : 7, 0.0, seed, lite ? 2 : 4);
    // the curve: bow towards the lean
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i), k = (y / H); tp.setX(i, tp.getX(i) + lean.x * (k * k - k) * 0.6); tp.setZ(i, tp.getZ(i) + lean.z * (k * k - k) * 0.6); }
    trunk.computeVertexNormals();
    parts.push(paint(trunk, (x, y, z, nx, ny, nz, c, o) => { const ring = 0.75 + 0.25 * Math.abs(Math.sin(y * 9)); c.copy(BARK_PALE).multiplyScalar(ring * (0.6 + 0.3 * Math.max(0, nx))); o.leaf = 0; o.sway = 0.25 * (y / H) ** 2; }));
    // fronds: arched ribbons with a folded midrib, leaflet comb cut in by the shader's clump noise
    const NF = lite ? 7 : 15;
    for (let f = 0; f < NF; f++) {
      const az = (f / NF) * TAU + r() * 0.3, el = 0.55 - (f % 3) * 0.35 + r() * 0.2, L = 3.6 + r() * 1.4;
      const segs = lite ? 4 : 8, pos = [], dir = V(Math.cos(az), 0, Math.sin(az)), side = V(-dir.z, 0, dir.x);
      for (let s = 0; s <= segs; s++) {
        const u = s / segs, d = u * L, y = Math.sin(el) * d - 0.42 * d * d / L * (1.4 - el);
        const wdt = 0.75 * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (1 - 0.3 * u) + 0.05;
        const c = top.clone().addScaledVector(dir, Math.cos(el) * d).add(V(0, y, 0));
        const droop = -0.28 * wdt;
        pos.push(c.clone().addScaledVector(side, -wdt).add(V(0, droop, 0)), c.clone().add(V(0, 0.06, 0)), c.clone().addScaledVector(side, wdt).add(V(0, droop, 0)));
      }
      const P = [], idx = [];
      pos.forEach((v) => P.push(v.x, v.y, v.z));
      for (let s = 0; s < segs; s++) { const a = s * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
      let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
      const fc = base.clone().multiplyScalar(jit());
      // across-frond coordinate: signed distance from the midrib in the side direction, normalised
      parts.push(paint(g, (x, y, z, nx, ny, nz, c, o) => {
        const d = Math.hypot(x - top.x, z - top.z) / L, sd = (x - top.x) * side.x + (z - top.z) * side.z;
        c.copy(fc).multiplyScalar(0.75 + 0.45 * d).lerp(new THREE.Color(0.2, 0.17, 0.06), f % 5 === 0 ? 0.45 : 0); o.leaf = 1; o.sway = 0.35 + d * 1.3;
        o.fu = d * 1.0 + 0.001; o.fv = Math.abs(sd) > 0.02 ? Math.sign(sd) : 0;
      }));
    }
    // coconuts
    if (!lite) for (let k = 0; k < 5; k++) { const a = r() * TAU; parts.push(paint(new THREE.IcosahedronGeometry(0.16, 0).translate(top.x + Math.cos(a) * 0.3, H - 0.35, top.z + Math.sin(a) * 0.3), (x, y, z, nx, ny, nz, c, o) => { c.setRGB(0.16, 0.13, 0.05); o.leaf = 0; o.sway = 0.25; })); }
    return finish(parts);
  }
  if (kind === 'cypress') {
    const H = 8 + r() * 3, prof = [[0, 0], [0.22, 0], [0.22, 1.0], [1.05, 1.6], [1.3, 3.5], [1.15, 5.6], [0.7, 7.6], [0.12, 9.4], [0, 10]];
    const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b * H / 10)), lite ? 8 : 14, r() * 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.1 * Math.sin(y * 4.1 + Math.atan2(z, x) * 3) + 0.06 * Math.sin(y * 9.3); p.setXYZ(i, x * k, y, z * k); }
    g.computeVertexNormals();
    const pc = crownPainter(base, { top: H, bottom: 0, h0: 0.5, h1: H, jitter: jit() });
    parts.push(paint(g, (x, y, z, nx, ny, nz, c, o) => { if (y < 1.0 && Math.hypot(x, z) < 0.3) { c.copy(BARK); o.leaf = 0; o.sway = 0; return; } pc(x, y, z, nx, ny, nz, c, o); o.sway *= 0.6; }));
    return finish(parts);
  }
  if (kind === 'ashoka') {
    // the mast tree: a tall narrow cone of drooping tiers
    const H = 9 + r() * 4, tiers = lite ? 5 : 8;
    parts.push(paint(limb(V(0, 0, 0), V(0, H * 0.95, 0), 0.18, 0.05, 5, 0.03, seed, 2), barkPainter(BARK, 0.1, H)));
    for (let i = 0; i < tiers; i++) {
      const u = i / (tiers - 1), y = 1.6 + u * (H - 2.4), rad = (1 - u * 0.7) * (1.7 + r() * 0.4);
      const g = new THREE.ConeGeometry(rad, (H - 1.6) / tiers * 1.9, lite ? 7 : 11, 1, true).translate(0, y, 0);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k), a = Math.atan2(z, x); const kk = 1 + 0.18 * Math.sin(a * 5 + i * 1.7); p.setX(k, x * kk); p.setZ(k, z * kk); }
      g.computeVertexNormals();
      parts.push(paint(g, crownPainter(base, { top: H, bottom: 1, h0: 1, h1: H, jitter: jit() })));
    }
    return finish(parts);
  }
  if (kind === 'shrub') {
    const n = lite ? 2 : 3;
    for (let i = 0; i < n; i++) { const a = r() * TAU, d = r() * 0.5; parts.push(paint(clump(Math.cos(a) * d, 0.55 + r() * 0.2, Math.sin(a) * d, 0.7 + r() * 0.3, 0.55, 0.7 + r() * 0.3, det, r), crownPainter(base, { top: 1.3, bottom: 0, h0: 0, h1: 1.3, jitter: jit() }))); }
    return finish(parts);
  }
  // broad-leaved trees: trunk + limbs + crown of clumps
  const P = {
    neem: { H: 9, W: 4.2, flat: 0.75, trunk: 0.32, clumps: 9, rise: 0.42 },
    mango: { H: 10, W: 5.0, flat: 0.85, trunk: 0.4, clumps: 11, rise: 0.3 },
    peepal: { H: 13, W: 6.2, flat: 0.7, trunk: 0.5, clumps: 12, rise: 0.38 },
    banyan: { H: 12, W: 10.5, flat: 0.42, trunk: 0.9, clumps: 16, rise: 0.36 },
  }[kind];
  const H = P.H * (0.85 + r() * 0.3), W = P.W * (0.85 + r() * 0.3), cy = H - W * P.flat, trunkTop = H * P.rise;
  parts.push(paint(limb(V(0, -0.3, 0), V((r() - 0.5) * 0.6, trunkTop + (lite ? W * 0.3 : 0.5), (r() - 0.5) * 0.6), P.trunk, P.trunk * 0.6, lite ? 4 : 8, 0.12, seed, lite ? 1 : 2), barkPainter(kind === 'peepal' ? BARK_PALE.clone().multiplyScalar(0.7) : BARK, 0, H)));
  const nLimb = lite ? 0 : 5, cl = [];
  for (let i = 0; i < nLimb; i++) {
    const a = (i / nLimb) * TAU + r() * 0.8, d = W * (0.45 + r() * 0.3), end = V(Math.cos(a) * d, cy + (r() - 0.2) * W * P.flat * 0.6, Math.sin(a) * d);
    parts.push(paint(limb(V(0, trunkTop, 0), end, P.trunk * 0.5, P.trunk * 0.15, lite ? 4 : 5, 0.25, seed + i, 2), barkPainter(BARK, 0.25, H)));
  }
  const NC = lite ? Math.ceil(P.clumps * 0.5) : P.clumps;
  for (let i = 0; i < NC; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * W * 0.62, rr = W * (0.32 + r() * 0.16) * (kind === 'banyan' ? 0.75 : 1) * (lite ? 1.22 : 1);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    const y = cy + (1 - (d / (W * 0.62)) ** 2) * W * P.flat * 0.55 + (r() - 0.5) * W * 0.12;
    cl.push(clump(x, y, z, rr, rr * (P.flat + 0.15), rr, det, r));
  }
  const pc = crownPainter(base, { top: H, bottom: trunkTop, h0: cy - W * P.flat * 0.7, h1: H, jitter: jit() });
  for (const g of cl) parts.push(paint(g, pc));
  if (kind === 'banyan') {
    // prop trunks and hanging aerial roots under the spread
    const nr = lite ? 5 : 22;
    for (let i = 0; i < nr; i++) {
      const a = r() * TAU, d = W * (0.25 + r() * 0.6), x = Math.cos(a) * d, z = Math.sin(a) * d, ytop = cy - W * P.flat * 0.25;
      const reach = r() < 0.4 ? 0 : 0.35 + r() * 0.5;   // 0 = reaches the ground (a prop trunk)
      const thick = reach === 0 ? 0.12 + r() * 0.12 : 0.03 + r() * 0.03;
      parts.push(paint(limb(V(x, ytop, z), V(x + (r() - 0.5) * 0.3, reach * ytop - 0.2, z + (r() - 0.5) * 0.3), thick, thick * 0.8, lite ? 3 : 4, 0.04, seed + 50 + i, 1), barkPainter(BARK_PALE.clone().multiplyScalar(0.6), reach ? 0.3 : 0, H)));
    }
  }
  return finish(parts);
}
function finish(parts) {
  const g = mergeGeometries(parts, false);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

// Plants a list of trees as instanced meshes. items: [{ kind, x, y, z, s = 1, rot = random, tint = 1, seed? }]
// variants: geometry variants per kind (instances are spread over them). Returns { group, mats, tris, update(t) }.
export function plantForest(items, { sun, lite = false, variants = 3, wind = 1, trans = 1, castShadow = true, receiveShadow = true, seed = 1, material = null, haze = null } = {}) {
  const group = new THREE.Group(), byKey = new Map(), r = rng(seed);
  for (const it of items) {
    const v = it.variant ?? Math.floor(r() * (lite ? Math.min(2, variants) : variants));
    const key = it.kind + ':' + v + ':' + (lite || it.lite ? 1 : 0);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(it);
  }
  const mat = material ?? foliageMaterial({ sun, wind, trans, side: THREE.DoubleSide, tag: lite ? 'l' : '', haze });
  let tris = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), c = new THREE.Color(), up = V(0, 1, 0);
  for (const [key, list] of byKey) {
    const [kind, v, lk] = key.split(':');
    const geo = treeGeometry(kind, 101 + Number(v) * 37 + seed, lk === '1');
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      const s = it.s ?? 1;
      q.setFromAxisAngle(up, it.rot ?? r() * TAU);
      m4.compose(p3.set(it.x, it.y ?? 0, it.z), q, s3.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sx ?? 1)));
      im.setMatrixAt(i, m4);
      const t = it.tint ?? 1, hue = (r() - 0.5) * 0.12;
      c.setRGB(t * (1 + hue), t * (1 + hue * 0.3), t * (1 - hue * 0.5)); im.setColorAt(i, c);
    });
    im.castShadow = castShadow; im.receiveShadow = receiveShadow;
    im.computeBoundingSphere();
    group.add(im);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * list.length;
  }
  return { group, mat, tris, update(t) { mat.userData.u.uTime.value = t; } };
}

// ------------------------------------------------------------------------------------------- grass
// A tuft of blades (base at origin, ≈ 0.4 m tall), coloured root → tip, sway weight rising to the tip.
export function grassTuftGeometry(seed = 1, { blades = 7, h = 0.42, lite = false } = {}) {
  const r = rng(seed), P = [], C = [], L = [], nb = lite ? Math.ceil(blades / 2) : blades;
  const root = new THREE.Color(0.03, 0.06, 0.02), tipA = new THREE.Color(0.16, 0.25, 0.05), tipB = new THREE.Color(0.28, 0.25, 0.09), c = new THREE.Color();
  for (let b = 0; b < nb; b++) {
    const a = r() * TAU, d = r() * 0.09, bx = Math.cos(a) * d, bz = Math.sin(a) * d, hh = h * (0.6 + r() * 0.6);
    const lean = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(hh * (0.25 + r() * 0.35)), wdt = 0.018 + r() * 0.012;
    const side = V(-Math.sin(a + 1.2), 0, Math.cos(a + 1.2)).multiplyScalar(wdt);
    const tip = c.copy(tipA).lerp(tipB, r() < 0.25 ? 0.7 : r() * 0.25).clone();
    const segs = 2, pts = [];
    for (let s = 0; s <= segs; s++) { const u = s / segs; pts.push(V(bx + lean.x * u * u, hh * u, bz + lean.z * u * u)); }
    for (let s = 0; s < segs; s++) {
      const u0 = s / segs, u1 = (s + 1) / segs, w0 = 1 - u0, w1 = s + 1 === segs ? 0 : 1 - u1;
      const a0 = pts[s].clone().addScaledVector(side, -w0), b0 = pts[s].clone().addScaledVector(side, w0);
      const a1 = pts[s + 1].clone().addScaledVector(side, -w1), b1 = pts[s + 1].clone().addScaledVector(side, w1);
      const quads = s + 1 === segs ? [[a0, b0, a1, u0, u0, u1]] : [[a0, b0, a1, u0, u0, u1], [b0, b1, a1, u0, u1, u1]];
      for (const [p0, p1, p2, k0, k1, k2] of quads) for (const [p, k] of [[p0, k0], [p1, k1], [p2, k2]]) {
        P.push(p.x, p.y, p.z); const cc = root.clone().lerp(tip, Math.pow(k, 0.7)); C.push(cc.r, cc.g, cc.b); L.push(1, k * k * 1.6);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(L, 2));
  // normals pointing up (grass lit like the ground it stands on, no dark backfaces)
  const N = new Float32Array(P.length); for (let i = 1; i < N.length; i += 3) N[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}

// Scatter grass tufts: sample(r) returns [x, y, z, scale] or null (rejected). Returns { mesh, tris, update }.
export function plantGrass({ sun, count = 4000, sample, lite = false, seed = 3, wind = 1.4, tint = null } = {}) {
  const geo = grassTuftGeometry(seed, { lite });
  const mat = foliageMaterial({ sun, wind, trans: 0.8, detail: 0, side: THREE.DoubleSide, tag: 'grass' });
  const r = rng(seed + 11), list = [];
  for (let k = 0; k < count * 6 && list.length < count; k++) { const s = sample(r); if (s) list.push(s); }
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), c = new THREE.Color();
  list.forEach(([x, y, z, s], i) => {
    m4.compose(p3.set(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2)), s3.set(s, s * (0.7 + r() * 0.6), s));
    im.setMatrixAt(i, m4);
    const k = 0.85 + r() * 0.3; c.setRGB(k * (tint?.r ?? 1), k * (tint?.g ?? 1), k * (tint?.b ?? 1)); im.setColorAt(i, c);
  });
  im.count = list.length;
  im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false;
  return { mesh: im, mat, tris: geo.attributes.position.count / 3 * list.length, update(t) { mat.userData.u.uTime.value = t; } };
}

// ------------------------------------------------------------------------------------------- water
// A river / tank surface. sky = { hor: Color, zen: Color, sunDir: Vector3, sunCol: Color } by reference.
// opts: deep / shallow body colours (linear), bank colour + elevation for the reflected far bank,
// fog { color, density } by reference, scale of the ripples, foam at edges (needs aEdge: 0 at the bank).
export function waterMaterial({ sky, deep = [0.012, 0.05, 0.055], shallow = [0.04, 0.12, 0.1], bank = null, bankElev = 0.02,
  fog = null, scale = 1, speed = 1, foam = 0.6, glint = 1, flowDir = [0, 1], useEdge = false, opacity = 1, mirror = 0 } = {}) {
  const u = {
    uTime: { value: 0 }, uHor: { value: sky.hor }, uZen: { value: sky.zen }, uSunDir: { value: sky.sunDir }, uSunCol: { value: sky.sunCol },
    uDeep: { value: new THREE.Color(...deep) }, uShallow: { value: new THREE.Color(...shallow) },
    uBank: { value: bank ?? new THREE.Color(0.02, 0.04, 0.02) }, uBankE: { value: bank ? bankElev : -1 },
    uFogC: { value: fog?.color ?? new THREE.Color(0, 0, 0) }, uFogD: { value: fog ? fog.density : 0 },
    uScale: { value: scale }, uSpeed: { value: speed }, uFoam: { value: foam }, uGlint: { value: glint }, uFlow: { value: new THREE.Vector2(...flowDir).normalize() },
    uOpacity: { value: opacity }, uMirror: { value: mirror }, uK: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: opacity < 1, depthWrite: opacity >= 1,
    vertexShader: /* glsl */ `attribute float aEdge; varying vec3 vW; varying float vEdge;
      void main(){ vEdge = ${useEdge ? 'aEdge' : '1.0'}; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${NK_NOISE}
      uniform vec3 uHor, uZen, uSunDir, uSunCol, uDeep, uShallow, uBank, uFogC; uniform vec2 uFlow;
      uniform float uTime, uBankE, uFogD, uScale, uSpeed, uFoam, uGlint, uOpacity, uMirror, uK;
      varying vec3 vW; varying float vEdge;
      float hgt(vec2 p){
        vec2 f = uFlow * uTime * uSpeed;
        return nkN(p * 0.9 - f * 0.6) * 0.5 + nkN(p * 2.3 + vec2(3.1, 1.7) - f) * 0.3 + nkN(p * 6.1 - f * 1.6 + 7.0) * 0.2
             + 0.25 * sin(dot(p, vec2(1.3, 0.4)) * 2.0 - uTime * 1.7) * 0.3;
      }
      void main(){
        vec3 Vd = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        vec2 p = vW.xz * uScale;
        float e = 0.06, h0 = hgt(p), hx = hgt(p + vec2(e, 0.0)), hz = hgt(p + vec2(0.0, e));
        float amp = 0.55 / (1.0 + dist * 0.012 / uScale);
        vec3 N = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
        vec3 R = reflect(Vd, N); R.y = abs(R.y);
        float fr = 0.02 + 0.98 * pow(1.0 - max(dot(-Vd, N), 0.0), 5.0);
        vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.45, R.y));
        float s = max(dot(R, uSunDir), 0.0);
        sky += uSunCol * pow(s, 8.0) * 0.4;
        // the reflected far bank (trees) as a dark-green band just above the horizon
        float az = atan(R.z, R.x);
        float bh = uBankE * (0.7 + 0.5 * nkN(vec2(az * 40.0, 0.0)) + 0.3 * nkN(vec2(az * 9.0, 2.0)));
        sky = mix(sky, uBank, (1.0 - smoothstep(bh * 0.6, bh, R.y)) * step(0.0, uBankE));
        // body: blue-green, lighter and greener where shallow (near the banks) and where the sun scatters in it
        vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 0.6, vEdge));
        body *= 0.85 + 0.3 * nkN(p * 0.15 + 3.0);
        body += uShallow * uSunCol * 0.25 * max(uSunDir.y, 0.0);
        vec3 col = mix(body, sky, clamp(fr + uMirror, 0.0, 1.0));
        col += uSunCol * uGlint * (pow(s, mix(900.0, 90.0, clamp(dist / 400.0, 0.0, 1.0))) * 22.0 + pow(s, 60.0) * 0.4);
        // foam and wet glint where the water meets the bank
        float fm = (1.0 - smoothstep(0.0, 0.08, vEdge)) * smoothstep(0.45, 0.75, nkN(p * 3.0 + uFlow * uTime * 0.7) * 0.7 + nkN(p * 9.0) * 0.4);
        col = mix(col, vec3(0.6, 0.62, 0.58) * (0.5 + 0.5 * max(uSunDir.y, 0.15)) + uSunCol * 0.1, fm * uFoam);
        col = mix(col, uFogC, 1.0 - exp(-uFogD * uFogD * dist * dist));
        gl_FragColor = vec4(col * uK, uOpacity);
      }`,
  });
  m.userData.u = u;
  return m;
}

// A water ribbon along a polyline (Vector3[]: x, z used; y = level), half-width wFn(u) → geometry with aEdge.
export function riverRibbon(points, wFn, { level = 0, segs = 200, across = 6 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(p.x, 0, p.z)), false, 'centripetal');
  const pos = [], edge = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, c = curve.getPointAt(u), t = curve.getTangentAt(u), nx = -t.z, nz = t.x, w = wFn(u);
    for (let j = 0; j <= across; j++) { const k = j / across * 2 - 1; pos.push(c.x + nx * w * k, level, c.z + nz * w * k); edge.push(1 - Math.abs(k)); }
    if (i < segs) for (let j = 0; j < across; j++) { const a = i * (across + 1) + j, b = a + across + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1)); g.setIndex(idx);
  g.computeVertexNormals(); g.computeBoundingSphere();
  return { geometry: g, curve };
}

// ------------------------------------------------------------------------------------------- cattle
// A humped zebu (≈ 2.2 m long, +x forward), grazing (head down) or standing; low-poly, vertex-coloured.
export function zebuGeometry(grazing = true, seed = 1) {
  const r = rng(seed), parts = [];
  const coat = [new THREE.Color(0.55, 0.52, 0.47), new THREE.Color(0.42, 0.33, 0.24), new THREE.Color(0.62, 0.6, 0.56), new THREE.Color(0.2, 0.17, 0.14)][Math.floor(r() * 4)];
  const add = (g, col = coat, k = 1) => parts.push(paint(g, (x, y, z, nx, ny, nz, c, o) => { c.copy(col).multiplyScalar(k * (0.7 + 0.35 * Math.max(0, ny))); o.leaf = 0; o.sway = 0; }));
  add(new THREE.SphereGeometry(1, 7, 5).scale(0.85, 0.42, 0.36).translate(0, 1.15, 0));            // barrel
  add(new THREE.SphereGeometry(1, 6, 4).scale(0.22, 0.2, 0.18).translate(0.45, 1.55, 0));          // hump
  const hx = grazing ? 1.05 : 1.0, hy = grazing ? 0.45 : 1.35;
  add(new THREE.CylinderGeometry(0.13, 0.22, 0.75, 6).rotateZ(grazing ? 2.3 : 1.0).translate(0.8, grazing ? 0.85 : 1.3, 0));   // neck
  add(new THREE.SphereGeometry(1, 5, 4).scale(0.28, 0.14, 0.13).rotateZ(grazing ? -1.1 : -0.4).translate(hx, hy, 0));          // head
  add(new THREE.SphereGeometry(1, 5, 4).scale(0.35, 0.18, 0.06).translate(0.75, grazing ? 0.6 : 0.95, 0), coat, 0.85);          // dewlap
  for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.03, 0.22, 4).rotateZ(s * 0.3).translate(hx - 0.1, hy + 0.17, s * 0.09), new THREE.Color(0.1, 0.09, 0.08));
  for (const [x, z] of [[0.55, 0.17], [0.55, -0.17], [-0.55, 0.17], [-0.55, -0.17]]) add(new THREE.CylinderGeometry(0.05, 0.065, 0.95, 5).translate(x, 0.48, z), coat, 0.8);
  add(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 4).rotateZ(-0.25).translate(-0.9, 0.95, 0), coat, 0.7);   // tail
  return finish(parts);
}
export function plantHerd(items, { sun, lite = false } = {}) {
  const mat = foliageMaterial({ sun, wind: 0, trans: 0, detail: 0, tag: 'cow' });
  const group = new THREE.Group(); let tris = 0;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  for (const grazing of [true, false]) for (const sd of lite ? [1] : [1, 2, 3]) {
    const list = items.filter((it, i) => !!it.grazing === grazing && (lite || (i % 3) + 1 === sd));
    if (!list.length) continue;
    const geo = zebuGeometry(grazing, sd * 17 + (grazing ? 3 : 0)), im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { m4.compose(p3.set(it.x, it.y ?? 0, it.z), q.setFromAxisAngle(up, it.rot ?? 0), s3.setScalar(it.s ?? 1)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true; group.add(im);
    tris += geo.attributes.position.count / 3 * list.length;
  }
  return { group, tris };
}
