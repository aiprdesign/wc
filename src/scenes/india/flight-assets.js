// THE DREAM OF FLIGHT — build-time assets: five procedural aircraft (the Pushpaka Vimana of the Ramayana as an
// illustrated-manuscript object, the 1911 Humber-Sommer pusher biplane, J. R. D. Tata's 1932 de Havilland Puss
// Moth, the HF-24 Marut and the Tejas), the painted (miniature) sky and its scalloped gold-edged clouds, an
// analytic real sky whose function is shared by the river / sea reflections, soft sun-lit particle clouds, and
// the set dressing of the Allahabad exhibition grounds and Juhu beach. Everything animated is posed by flight.js.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, clamp, sat, smoothstep, TAU } from '../../lib/math.js';
import { fbm2, GLSL_NOISE } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture, brushedMetalTexture } from '../../lib/textures.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = V3(0, 1, 0);

// ------------------------------------------------------------------ geometry helpers
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  return geo.applyMatrix4(_m);
}
// merge keeping position / normal / uv / color (missing uv → 0, missing colour → white)
export function merge(geos) {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    if (!n.attributes.color) n.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 3).fill(1), 3));
    n.clearGroups();
    return n;
  });
  return mergeGeometries(list, false);
}
export function tint(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
export const lathe = (pts, segs = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), segs);
export const box = (w, h, d, p, r) => bake(new THREE.BoxGeometry(w, h, d), p, r);
export const cyl = (r0, r1, h, seg, p, r) => bake(new THREE.CylinderGeometry(r0, r1, h, seg), p, r);
export function rod(a, b, r, seg = 6, r1 = r) {
  const g = new THREE.CylinderGeometry(r1, r, a.distanceTo(b), seg, 1);
  _q.setFromUnitVectors(UP, _v.copy(b).sub(a).normalize());
  _m.compose(_s.copy(a).lerp(b, 0.5), _q, V3(1, 1, 1));
  return g.applyMatrix4(_m);
}
// streamlined strut (elliptic section, long axis along the flow +X)
export function strut(a, b, w, d, seg = 8) {
  const g = new THREE.CylinderGeometry(1, 1, a.distanceTo(b), seg, 1); g.scale(d, 1, w);
  const Y = b.clone().sub(a).normalize();
  let X = V3(1, 0, 0).addScaledVector(Y, -Y.x); if (X.lengthSq() < 1e-4) X = V3(0, 0, 1).addScaledVector(Y, -Y.z); X.normalize();
  const Z = V3().crossVectors(X, Y);
  _m.makeBasis(X, Y, Z).setPosition(a.clone().lerp(b, 0.5));
  return g.applyMatrix4(_m);
}
// tube along a curve with a radius function r(u)
export function tubeAlong(curve, rFn, segs = 24, radial = 8) {
  const pos = [], idx = [], frames = curve.computeFrenetFrames(segs, false), P = V3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; curve.getPointAt(u, P); const r = rFn(u), N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) { const a = (j / radial) * TAU; pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a grid surface from (u, v) → Vector3, u and v in [0, 1]
export function gridSurf(fn, nu, nv) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i / nu, j / nv); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = j * (nu + 1) + i; idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function flipIfInward(g, test) {
  // test(position, normal) > 0 when the normal points outward
  const P = g.attributes.position, N = g.attributes.normal, p = V3(), n = V3();
  let s = 0;
  for (let i = 0; i < P.count; i += Math.max(1, Math.floor(P.count / 64))) { p.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); s += Math.sign(test(p, n)); }
  if (s < 0) {
    const idx = g.index.array;
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    g.index.needsUpdate = true; g.computeVertexNormals();
  }
  return g;
}
// Fuselage: rings of a superellipse section. fn(x) → [halfWidth, halfHeight, centreY, exponent]; x from x1 (nose) to x0
export function bodyGeo(x0, x1, fn, nx = 64, nr = 32) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nx; j++) {
    const x = lerp(x1, x0, j / nx), [w, h, yc, e] = fn(x);
    for (let i = 0; i <= nr; i++) {
      const a = (i / nr) * TAU, ca = Math.cos(a), sa = Math.sin(a), k = 2 / (e || 2);
      pos.push(x, yc + Math.max(h, 1e-4) * Math.sign(ca) * Math.pow(Math.abs(ca), k), Math.max(w, 1e-4) * Math.sign(sa) * Math.pow(Math.abs(sa), k));
      uv.push(j / nx, i / nr);
    }
  }
  for (let j = 0; j < nx; j++) for (let i = 0; i < nr; i++) { const a = j * (nr + 1) + i, b = a + 1, c = a + nr + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return flipIfInward(g, (p, n) => { const [, , yc] = fn(p.x); return n.y * (p.y - yc) + n.z * p.z; });
}
// airfoil loop (LE → upper → TE → lower), u in [0, 1] along the chord
function foil(n, t, cam) {
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = cam * 4 * x * (1 - x);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  return [...up, ...lo.slice(1, -1).reverse()];
}
// Lifting surface lofted through stations { x: LE x, y, z, c: chord, t: thickness/chord, cam: camber }.
// plane 'h': sections in the XY plane stacked along z; 'v': sections in the XZ plane stacked along y (fins).
export function wingGeo(stations, { n = 12, plane = 'h', t = 0.12, cam = 0.02, cap = true } = {}) {
  const loops = stations.map((s) => foil(n, s.t ?? t, s.cam ?? cam).map(([u, v]) => (plane === 'h'
    ? V3(s.x - u * s.c, s.y + v * s.c, s.z) : V3(s.x - u * s.c, s.y, s.z + v * s.c))));
  const m = loops[0].length, ns = loops.length, pos = [], uv = [], idx = [];
  loops.forEach((L, j) => L.forEach((p, i) => { pos.push(p.x, p.y, p.z); uv.push(i / m, j / (ns - 1)); }));
  // skin winding: the triangle normal is S × T (S: station direction, T: loop tangent = −X on the upper side)
  const f = stations[0], l = stations[ns - 1], S = V3(l.x - f.x, l.y - f.y, l.z - f.z);
  const nrm = V3().crossVectors(S, V3(-1, 0, 0)), flip = (plane === 'h' ? nrm.y : nrm.z) < 0;
  for (let j = 0; j < ns - 1; j++) for (let i = 0; i < m; i++) {
    const a = j * m + i, b = j * m + ((i + 1) % m), c = (j + 1) * m + i, d = (j + 1) * m + ((i + 1) % m);
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  if (cap) for (const j of [0, ns - 1]) {
    const L = loops[j], base = pos.length / 3, cx = L.reduce((s2, p) => s2.add(p), V3()).multiplyScalar(1 / m);
    pos.push(cx.x, cx.y, cx.z); uv.push(0.5, j / (ns - 1));
    // fan normal (Newell) vs the wanted direction (−S at the first station, +S at the last)
    const nw = V3(); for (let i = 0; i < m; i++) { const p = L[i], q = L[(i + 1) % m]; nw.x += (p.y - q.y) * (p.z + q.z); nw.y += (p.z - q.z) * (p.x + q.x); nw.z += (p.x - q.x) * (p.y + q.y); }
    // Newell gives the normal of the loop traversed i → i+1; the fan (p_i, C, p_i+1) faces the opposite way
    const want = j === 0 ? -1 : 1, rev = -nw.dot(S) * want < 0;
    for (let i = 0; i < m; i++) { const A = j * m + i, B = j * m + ((i + 1) % m); if (rev) idx.push(A, B, base); else idx.push(A, base, B); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// thin flat plate with an outline shape (fins, tail surfaces, feathers) extruded with a soft bevel
export function plate(pts, depth, bevel = 0.01) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}
// a tapered, twisted propeller blade along +Y (root at 0), chord along Z
export function bladeGeo(len, root, tip, twist = 0.7, thick = 0.03) {
  const g = new THREE.BoxGeometry(thick, len, 1, 1, 10, 1); g.translate(0, len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), u = y / len, ch = root + (tip - root) * u - 0.3 * root * Math.pow(u, 8), a = twist * (1 - u);
    const z = p.getZ(i) * ch, x = p.getX(i) * (1 - 0.5 * u);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  g.computeVertexNormals();
  return g;
}
// position-only, welded copy of a set of geometries with smooth normals (for the ink outline)
export function outlineGeo(geos) {
  const list = geos.map((g) => { const n = new THREE.BufferGeometry(); n.setAttribute('position', (g.index ? g.toNonIndexed() : g).attributes.position.clone()); return n; });
  const m = mergeVertices(mergeGeometries(list, false), 1e-4); m.computeVertexNormals();
  return m;
}
export function inkMaterial(color, width) {
  return new THREE.ShaderMaterial({
    uniforms: { uW: { value: width }, uC: { value: new THREE.Color(color) } },
    vertexShader: 'uniform float uW; void main(){ vec3 p = position + normal * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
    fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }',
    side: THREE.BackSide,
  });
}

// ------------------------------------------------------------------ soft particles (sun-lit puffs)
const SOFT_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
uniform float uViewport, uNear;
varying float vAlpha; varying vec3 vColor; varying float vRot;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z), 1400.0);
  vAlpha = aAlpha * smoothstep(uNear * 0.3, uNear, -mv.z); vColor = aColor; vRot = aRot;
}`;
const SOFT_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uOpacity;
varying float vAlpha; varying vec3 vColor; varying float vRot;
void main(){
  vec2 c = gl_PointCoord - 0.5; float cs = cos(vRot), sn = sin(vRot);
  c = mat2(cs, -sn, sn, cs) * c;
  vec4 t = texture2D(uMap, c + 0.5);
  float a = t.a * vAlpha * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;
export function puffTexture(seed = 1) {
  const S = 128, c = mkCanvas(S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, r = Math.hypot(u, v) * 2;
    const n = fbm2(u * 4 + seed * 7.1, v * 4 - seed * 3.3, 5) * 0.5 + 0.5;
    const a = sat((1 - r) * 1.4 + (n - 0.55) * 1.6) * smoothstep(1.0, 0.7, r);
    const i = (y * S + x) * 4;
    const shade = 0.75 + 0.25 * (0.5 - v) + (n - 0.5) * 0.3;
    d[i] = d[i + 1] = d[i + 2] = Math.round(sat(shade) * 255); d[i + 3] = Math.round(Math.pow(a, 1.3) * 255);
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}
export class SoftPoints extends THREE.Points {
  constructor(count, { map, additive = false, near = 1.0 } = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    geo.setAttribute('aRot', new THREE.BufferAttribute(new Float32Array(count), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uOpacity: { value: 1 }, uViewport: { value: 800 }, uNear: { value: near } },
      vertexShader: SOFT_VERT, fragmentShader: SOFT_FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.P = geo.attributes.position.array; this.S = geo.attributes.aSize.array; this.A = geo.attributes.aAlpha.array; this.C = geo.attributes.aColor.array; this.Rot = geo.attributes.aRot.array;
  }
  commit(info) {
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aColor.needsUpdate = a.aRot.needsUpdate = true;
    this.material.uniforms.uViewport.value = info?.height ?? 800;
  }
}

// ------------------------------------------------------------------ the real sky (shared by the dome and the water)
const SKY_FN = /* glsl */ `
uniform vec3 uSun, uZen, uHor, uHaze, uSunCol;
uniform float uSpace, uCloud, uTime, uGain;
vec3 skyCol(vec3 d){
  vec3 L = normalize(uSun);
  float e = d.y;
  float t = pow(clamp(e, 0.0, 1.0), 0.42);
  vec3 c = mix(uHor, uZen, t);
  c = mix(c, uHaze, exp(-abs(e) * 16.0) * 0.7);
  float s = max(dot(d, L), 0.0);
  c += uSunCol * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.45);
  // high altitude: the blue deepens toward black overhead
  vec3 deep = mix(vec3(0.004, 0.012, 0.05), vec3(0.0006, 0.0015, 0.008), smoothstep(0.2, 1.0, e));
  c = mix(c, deep + uHor * 0.2 * exp(-max(e, 0.0) * 10.0), uSpace * smoothstep(-0.25, 0.35, e));
  // a far cumulus band low over the horizon (lit toward the sun)
  if (uCloud > 0.0 && e > -0.02) {
    float k = 1.0 / (max(e, 0.0) + 0.05);
    vec2 uv = d.xz * k * 0.16;
    float n = snoise(vec3(uv, 1.7)) * 0.6 + snoise(vec3(uv * 2.7, 4.1)) * 0.3 + snoise(vec3(uv * 7.0, 9.0)) * 0.1;
    float cov = smoothstep(0.12, 0.55, n) * (1.0 - smoothstep(0.03, 0.2, e)) * smoothstep(-0.02, 0.012, e) * uCloud;
    float lit = 0.5 + 0.5 * dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(L.x, 0.0, L.z) + 1e-5));
    vec3 cc = mix(uHaze * 0.85, uSunCol * 0.55 + vec3(0.95), lit * smoothstep(0.1, 0.8, n));
    c = mix(c, cc, cov * 0.85);
  }
  c += uSunCol * pow(s, 1800.0) * 30.0;
  return c * uGain;
}`;
export function skyUniforms() {
  return {
    uSun: { value: V3(0.3, 0.4, -0.8).normalize() }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
    uHaze: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSpace: { value: 0 }, uCloud: { value: 1 },
    uTime: { value: 0 }, uGain: { value: 1 },
  };
}
export function makeRealSky(u) {
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; vec4 p = projectionMatrix * viewMatrix * w; p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: `${GLSL_NOISE}\n${SKY_FN}\nvarying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); vec3 c = d.y > -0.02 ? skyCol(d) : mix(skyCol(vec3(d.x, -0.02, d.z)), uHaze * 0.5 * uGain, smoothstep(-0.02, -0.3, d.y)); gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
  mesh.renderOrder = -1000; mesh.frustumCulled = false;
  return mesh;
}
// river / sea: a wavy mirror of the same sky, silt or blue water underneath, hazed with distance
export function makeWater(u, w, d, { body = '#2a3a30', silt = '#6a5a3a', waveK = 1, fadeFar = 900 } = {}) {
  const uu = { ...u, uBody: { value: new THREE.Color(body) }, uSilt: { value: new THREE.Color(silt) }, uWave: { value: waveK }, uFar: { value: fadeFar } };
  const m = new THREE.ShaderMaterial({
    uniforms: uu, fog: false,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `${GLSL_NOISE}\n${SKY_FN}\nuniform vec3 uBody, uSilt; uniform float uWave, uFar; varying vec3 vW;
      void main(){
        vec3 v = vW - cameraPosition; float dist = length(v); vec3 d = v / dist;
        vec2 p = vW.xz;
        float fade = exp(-dist * 0.004);
        vec2 g = vec2(snoise(vec3(p * vec2(0.08, 0.3) + vec2(0.0, uTime * 0.5), 0.3)), snoise(vec3(p * vec2(0.07, 0.25) - vec2(uTime * 0.4, 0.0), 5.1)));
        g += 0.5 * vec2(snoise(vec3(p * 0.6 + uTime, 2.0)), snoise(vec3(p * 0.6 - uTime, 7.0)));
        vec3 n = normalize(vec3(g.x * 0.07 * uWave * fade, 1.0, g.y * 0.07 * uWave * fade));
        vec3 r = reflect(d, n); r.y = max(abs(r.y), 0.003);
        float fr = 0.025 + 0.975 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
        float silt = smoothstep(-0.3, 0.6, snoise(vec3(p * 0.004, 3.0)));
        vec3 bodyC = mix(uBody, uSilt, silt) * (0.5 + 0.5 * max(dot(vec3(0.0, 1.0, 0.0), normalize(uSun)), 0.0)) * uGain;
        vec3 col = mix(bodyC, skyCol(r), fr);
        col = mix(col, skyCol(vec3(d.x, 0.003, d.z)), smoothstep(uFar * 0.25, uFar, dist));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ------------------------------------------------------------------ the painted sky (miniature-painting style)
export function makePaintedSky() {
  const u = { uTime: { value: 0 }, uGain: { value: 1 }, uSun: { value: V3(-0.55, 0.32, -0.77).normalize() } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; vec4 p = projectionMatrix * viewMatrix * w; p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: `${GLSL_NOISE}
      uniform float uTime, uGain; uniform vec3 uSun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float e = d.y;
        vec3 parch = vec3(0.80, 0.62, 0.36), warm = vec3(0.86, 0.52, 0.22), lapis = vec3(0.012, 0.04, 0.26);
        float wob = 0.035 * snoise(vec3(d.x * 3.0, d.z * 3.0, 1.0)) + 0.012 * snoise(vec3(d.xz * 14.0, 2.0));
        // a band of lapis across the top of the page, parchment-gold below, warm glow toward the painted sun
        float band = smoothstep(0.30, 0.36, e + wob);
        vec3 c = mix(parch, warm, smoothstep(0.25, -0.05, e) * 0.35);
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(0.9, 0.55, 0.15) * pow(s, 5.0) * 0.5;
        // thin gold horizontal streaks (the gold-washed skies of the miniatures)
        float st = snoise(vec3(d.x * 2.0, e * 46.0, d.z * 2.0));
        c = mix(c, vec3(1.15, 0.78, 0.3), smoothstep(0.55, 0.75, st) * smoothstep(0.32, 0.12, e) * 0.35);
        vec3 top = lapis * (0.8 + 0.4 * snoise(vec3(d.xz * 5.0, 7.0)));
        top += vec3(0.9, 0.62, 0.2) * smoothstep(0.97, 1.0, snoise(vec3(d * 40.0))) * 1.5;   // gold-leaf stars
        c = mix(c, top, band);
        c = mix(c, vec3(1.2, 0.85, 0.35), (1.0 - smoothstep(0.0, 0.006, abs(e + wob - 0.333))) * 0.9);   // the gold rule along the band
        // paper grain and age
        float gr = snoise(vec3(d * 380.0)) * 0.5 + snoise(vec3(d * 90.0)) * 0.5;
        c *= 0.93 + 0.07 * gr;
        c *= 1.0 - 0.22 * smoothstep(0.2, 0.9, snoise(vec3(d * 2.2 + 3.0)));
        gl_FragColor = vec4(c * uGain, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), m);
  mesh.renderOrder = -1000; mesh.frustumCulled = false; mesh.userData.u = u;
  return mesh;
}
// scalloped, gold-edged clouds of the Mughal / Rajput miniatures (2 × 2 atlas, transparent)
export function paintedCloudAtlas(seed = 11) {
  const S = 1024, c = mkCanvas(S), g = c.getContext('2d'), R = rng(seed);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 512, oy = Math.floor(cell / 2) * 512;
    // lobes along a wavy ribbon
    const lobes = [];
    const n = 7 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = 70 + u * 372, base = 300 + Math.sin(u * 5 + cell) * 30;
      const r = 34 + R() * 46 * Math.sin(Math.PI * (0.15 + 0.7 * u)) + 14;
      lobes.push([x, base - r * 0.55 - R() * 30, r]);
      if (R() < 0.7) lobes.push([x + (R() - 0.5) * 30, base + 20, r * (0.45 + R() * 0.25)]);
    }
    const all = (rad, fill) => { g.fillStyle = fill; for (const [x, y, r] of lobes) { g.beginPath(); g.arc(ox + x, oy + y, r + rad, 0, TAU); g.fill(); } };
    g.save(); g.beginPath(); g.rect(ox, oy, 512, 512); g.clip();
    all(9, '#4a2a12');          // ink line
    all(6, '#d4a243');          // gold edge
    all(2.5, '#f6e6b8');        // inner pale line
    // fill: cream-white to a cool blue-grey underside
    const gr = g.createLinearGradient(0, oy + 180, 0, oy + 360);
    gr.addColorStop(0, '#fbf6ea'); gr.addColorStop(0.6, '#e9e4dc'); gr.addColorStop(1, '#a9b8cf');
    all(0, gr);
    // the curls inside each lobe (thin blue-grey and gold arcs)
    for (const [x, y, r] of lobes) {
      if (r < 30) continue;
      g.strokeStyle = 'rgba(90,110,150,0.55)'; g.lineWidth = 2.2;
      g.beginPath(); for (let k = 0; k <= 30; k++) { const a = Math.PI * 1.05 + k / 30 * Math.PI * 1.6, rr = r * (0.75 - k / 30 * 0.45); const px = ox + x + Math.cos(a) * rr, py = oy + y + r * 0.1 + Math.sin(a) * rr; if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
      g.strokeStyle = 'rgba(200,150,60,0.7)'; g.lineWidth = 1.4;
      g.beginPath(); g.arc(ox + x, oy + y + r * 0.1, r * 0.82, Math.PI * 1.15, Math.PI * 1.75); g.stroke();
    }
    g.restore();
  }
  const t = toTexture(c, { anisotropy: 8 });
  return t;
}
export function paintedCloudGeo(cell, w) {
  const g = new THREE.PlaneGeometry(w, w);
  const uv = g.attributes.uv, ox = (cell % 2) * 0.5, oy = 0.5 - Math.floor(cell / 2) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + uv.getX(i) * 0.5, oy + uv.getY(i) * 0.5);
  return g;
}
// a painted gold sun with wavy rays
export function paintedSunTexture() {
  const S = 512, c = mkCanvas(S), g = c.getContext('2d'), m = S / 2;
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * TAU, long = i % 2 === 0;
    g.strokeStyle = long ? 'rgba(232,170,60,0.95)' : 'rgba(214,120,40,0.85)'; g.lineWidth = long ? 6 : 4;
    g.beginPath();
    for (let k = 0; k <= 20; k++) { const r = 92 + k / 20 * (long ? 150 : 110), w = Math.sin(k / 20 * Math.PI * 3) * 0.05; const px = m + Math.cos(a + w) * r, py = m + Math.sin(a + w) * r; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
    g.stroke();
  }
  g.fillStyle = '#4a2a12'; g.beginPath(); g.arc(m, m, 92, 0, TAU); g.fill();
  const gr = g.createRadialGradient(m - 20, m - 20, 10, m, m, 88); gr.addColorStop(0, '#fff2b8'); gr.addColorStop(0.6, '#f0b440'); gr.addColorStop(1, '#c87a20');
  g.fillStyle = gr; g.beginPath(); g.arc(m, m, 86, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(160,80,20,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(m, m, 70, 0, TAU); g.stroke();
  return toTexture(c);
}

// ------------------------------------------------------------------ textures
function bandTexture() {
  // the vimana's painted friezes: gold, a vermilion band with gold lotus petals, a lapis band of pearls
  const W = 1024, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  const m = mkCanvas(W, H), mg = m.getContext('2d');
  g.fillStyle = '#d9a845'; g.fillRect(0, 0, W, H); mg.fillStyle = '#fff'; mg.fillRect(0, 0, W, H);
  const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, y0, W, y1 - y0); mg.fillStyle = '#000'; mg.fillRect(0, y0, W, y1 - y0); };
  band(60, 120, '#a8241a');
  for (let i = 0; i < 40; i++) {           // lotus petals in gold on the vermilion
    const x = i * W / 40 + W / 80;
    g.fillStyle = '#e2b450'; mg.fillStyle = '#fff';
    for (const ctx of [g, mg]) { ctx.beginPath(); ctx.moveTo(x - 9, 116); ctx.quadraticCurveTo(x - 10, 80, x, 64); ctx.quadraticCurveTo(x + 10, 80, x + 9, 116); ctx.closePath(); ctx.fill(); }
    g.fillStyle = '#a8241a'; g.beginPath(); g.moveTo(x - 4, 112); g.quadraticCurveTo(x, 86, x + 4, 112); g.fill();
  }
  band(150, 190, '#1b3a8a');
  for (let i = 0; i < 64; i++) { const x = i * W / 64 + 8; g.fillStyle = '#f2ecdc'; g.beginPath(); g.arc(x, 170, 6, 0, TAU); g.fill(); }
  g.fillStyle = '#5a3412'; for (const y of [58, 120, 148, 190]) g.fillRect(0, y, W, 3);
  // fine chased lines in the gold
  g.strokeStyle = 'rgba(120,70,20,0.5)'; g.lineWidth = 1.5;
  for (let i = 0; i < 80; i++) { const x = i * W / 80; g.beginPath(); g.arc(x, 30, 12, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(x, 222, 12, Math.PI, TAU); g.stroke(); }
  const t = toTexture(c, { anisotropy: 8 }); t.wrapS = THREE.RepeatWrapping;
  const mt = toTexture(m, { srgb: false, anisotropy: 8 }); mt.wrapS = THREE.RepeatWrapping;
  return { map: t, metal: mt };
}
function fabricTexture() {
  // doped linen over ribs: the ribs show as darker bands, the leading-edge spar as a solid stripe
  const W = 512, H = 1024, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#ece0c4'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${150 + R() * 60},${130 + R() * 50},${90 + R() * 40},0.06)`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); }
  for (let k = 0; k <= 26; k++) { const y = k * H / 26; const gr = g.createLinearGradient(0, y - 6, 0, y + 6); gr.addColorStop(0, 'rgba(120,96,60,0)'); gr.addColorStop(0.5, 'rgba(120,96,60,0.45)'); gr.addColorStop(1, 'rgba(120,96,60,0)'); g.fillStyle = gr; g.fillRect(0, y - 6, W, 12); }
  g.fillStyle = 'rgba(110,80,46,0.5)'; g.fillRect(0, 0, W * 0.05, H); g.fillRect(W * 0.95, 0, W * 0.05, H);
  g.fillStyle = 'rgba(110,80,46,0.25)'; g.fillRect(W * 0.47, 0, W * 0.06, H);
  return toTexture(c, { anisotropy: 8 });
}
function woodTexture(seed = 3) {
  const W = 64, H = 512, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = '#8a5a2e'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${60 + R() * 40},${34 + R() * 20},${14},${0.15 + R() * 0.2})`; g.fillRect(R() * W, 0, 1 + R() * 2, H); }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function panelTexture(base, seed = 1, { lines = 'rgba(30,34,40,0.45)', rivets = true } = {}) {
  const W = 1024, H = 512, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(seed);
  if (base === 'metal') { g.drawImage(brushedMetalTexture({ seed }).image, 0, 0, W, H); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 0, W, H); }
  else { g.fillStyle = base; g.fillRect(0, 0, W, H); for (let i = 0; i < 1500; i++) { const l = R() * 30 - 15; g.fillStyle = `rgba(${128 + l},${128 + l},${128 + l},0.05)`; g.fillRect(R() * W, R() * H, 2 + R() * 8, 2 + R() * 8); } }
  for (let k = 0; k < 14; k++) { const l = 200 + R() * 40; g.fillStyle = `rgba(${l},${l},${l},0.06)`; g.fillRect(k * W / 14, 0, W / 14, H); }
  g.fillStyle = lines;
  for (let k = 0; k <= 14; k++) g.fillRect(k * W / 14, 0, 1.5, H);
  for (let k = 0; k <= 6; k++) g.fillRect(0, k * H / 6, W, 1.2);
  if (rivets) { g.fillStyle = 'rgba(40,44,50,0.25)'; for (let k = 0; k <= 14; k++) for (let y = 4; y < H; y += 9) g.fillRect(k * W / 14 + 4, y, 1.2, 1.2); }
  const t = toTexture(c, { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function groundTexture(kind = 'earth', seed = 7) {
  const S = 512, c = mkCanvas(S), g = c.getContext('2d'), R = rng(seed);
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm2(x / 64 + seed, y / 64, 4) * 0.5 + 0.5, f = fbm2(x / 9, y / 9 + seed, 2) * 0.5 + 0.5;
    let r, gg, b;
    if (kind === 'earth') {                       // trampled dust with patches of dry grass
      const grass = smoothstep(0.5, 0.65, n);
      r = lerp(150, 112, grass) * (0.85 + 0.3 * f); gg = lerp(124, 112, grass) * (0.85 + 0.3 * f); b = lerp(88, 60, grass) * (0.85 + 0.3 * f);
    } else {                                      // beach sand, ripples
      const rip = 0.5 + 0.5 * Math.sin((y + n * 40) * 0.35);
      r = (206 + 20 * f - 10 * rip) * (0.92 + 0.12 * n); gg = (184 + 18 * f - 10 * rip) * (0.92 + 0.12 * n); b = (146 + 14 * f - 8 * rip) * (0.92 + 0.12 * n);
    }
    const i = (y * S + x) * 4; d[i] = clamp(r, 0, 255); d[i + 1] = clamp(gg, 0, 255); d[i + 2] = clamp(b, 0, 255); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(60,48,30,${0.05 + R() * 0.1})`; g.fillRect(R() * S, R() * S, 1 + R() * 3, 1 + R() * 3); }
  const t = toTexture(c, { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function stripeTexture(a = '#b8261c', b = '#f1e6cf', n = 12) {
  const W = 256, H = 64, c = mkCanvas(W, H), g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * W / n, 0, W / n + 1, H); }
  const t = toTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ------------------------------------------------------------------ materials
export function flightMaterials() {
  const band = bandTexture();
  const goldC = '#e9b85a';
  const M = {
    gold: new THREE.MeshStandardMaterial({ color: goldC, metalness: 1, roughness: 0.28, envMapIntensity: 1.4 }),
    goldHull: new THREE.MeshStandardMaterial({ color: '#ffffff', map: band.map, metalnessMap: band.metal, metalness: 1, roughness: 0.34, envMapIntensity: 1.3, side: THREE.DoubleSide }),
    vermilion: new THREE.MeshStandardMaterial({ color: '#b52a1a', roughness: 0.62, metalness: 0, side: THREE.DoubleSide }),
    lapis: new THREE.MeshStandardMaterial({ color: '#1d3c94', roughness: 0.5, metalness: 0.05 }),
    ivory: new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.45, metalness: 0 }),
    teal: new THREE.MeshStandardMaterial({ color: '#137a6e', roughness: 0.4, metalness: 0.1 }),
    ink: inkMaterial('#2a1406', 0.035),
    // 1911
    fabric: new THREE.MeshStandardMaterial({ color: '#ffffff', map: fabricTexture(), roughness: 0.82, metalness: 0, side: THREE.DoubleSide }),
    spruce: new THREE.MeshStandardMaterial({ color: '#c08a52', map: woodTexture(3), roughness: 0.45, metalness: 0 }),
    wire: new THREE.LineBasicMaterial({ color: '#2a2622', transparent: true, opacity: 0.75 }),
    engine: new THREE.MeshStandardMaterial({ color: '#7a7c80', roughness: 0.42, metalness: 0.85, map: brushedMetalTexture({ seed: 9 }) }),
    brass: new THREE.MeshStandardMaterial({ color: '#c99a4c', roughness: 0.3, metalness: 1 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.85, metalness: 0 }),
    canvasBag: new THREE.MeshStandardMaterial({ color: '#b9a98a', roughness: 0.95, metalness: 0 }),
    leather: new THREE.MeshStandardMaterial({ color: '#4a2e1a', roughness: 0.6, metalness: 0 }),
    cloth: new THREE.MeshStandardMaterial({ color: '#d6d0c2', roughness: 0.9, metalness: 0 }),
    skin: new THREE.MeshStandardMaterial({ color: '#c8916a', roughness: 0.6, metalness: 0 }),
    prop: new THREE.MeshStandardMaterial({ color: '#7a4a24', map: woodTexture(8), roughness: 0.32, metalness: 0 }),
    // 1932
    cream: new THREE.MeshPhysicalMaterial({ color: '#e7dcc2', roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, map: panelTexture('#e7dcc2', 4, { lines: 'rgba(80,70,50,0.25)', rivets: false }) }),
    maroon: new THREE.MeshPhysicalMaterial({ color: '#6e1a1c', roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12 }),
    silverDope: new THREE.MeshStandardMaterial({ color: '#c3c6c8', roughness: 0.45, metalness: 0.55, map: fabricTexture() }),
    glass: new THREE.MeshStandardMaterial({ color: '#0b1218', roughness: 0.04, metalness: 0.3, envMapIntensity: 2.2 }),
    // jets
    alu: new THREE.MeshStandardMaterial({ color: '#d4d8dd', metalness: 1, roughness: 0.3, map: panelTexture('metal', 12), envMapIntensity: 1.25 }),
    tejas: new THREE.MeshStandardMaterial({ color: '#9aa1a8', metalness: 0.35, roughness: 0.48, map: panelTexture('#a9afb5', 21, { lines: 'rgba(40,46,52,0.35)' }) }),
    radome: new THREE.MeshStandardMaterial({ color: '#6c7178', metalness: 0.2, roughness: 0.55 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#2b2c2f', metalness: 0.8, roughness: 0.45 }),
    canopy: new THREE.MeshStandardMaterial({ color: '#2a2412', roughness: 0.03, metalness: 0.6, envMapIntensity: 2.4 }),
    saffron: new THREE.MeshStandardMaterial({ color: '#f08a1c', roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.5 }),
    green: new THREE.MeshStandardMaterial({ color: '#1f7a2e', roughness: 0.5 }),
    // set dressing
    tent: new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.9, side: THREE.DoubleSide }),
    tentStripe: new THREE.MeshStandardMaterial({ color: '#ffffff', map: stripeTexture(), roughness: 0.9, side: THREE.DoubleSide }),
    plaster: new THREE.MeshStandardMaterial({ color: '#e9dfca', roughness: 0.85 }),
    arch: new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.9 }),
    pole: new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.8 }),
    foliage: new THREE.MeshStandardMaterial({ color: '#3f5a26', roughness: 0.9, vertexColors: true }),
    trunk: new THREE.MeshStandardMaterial({ color: '#4c3a2a', roughness: 0.9 }),
    palmFrond: new THREE.MeshStandardMaterial({ color: '#4d6a2a', roughness: 0.8, side: THREE.DoubleSide }),
    flag: new THREE.MeshStandardMaterial({ color: '#c8361e', roughness: 0.8, side: THREE.DoubleSide }),
    crowdBody: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 }),
    crowdHead: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
    umbrella: new THREE.MeshStandardMaterial({ color: '#1a1716', roughness: 0.7, side: THREE.DoubleSide }),
  };
  return M;
}

// ================================================================== 1 · PUSHPAKA VIMANA (legend; units m, prow +X)
export function buildVimana(M) {
  const g = new THREE.Group();
  const gold = [], hull = [], verm = [], lapis = [], ivory = [], teal = [], ink = [];
  const L = 3.1;                                              // half length
  const W = (u) => 1.25 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.55);
  const D = (u) => 0.85 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.7);
  const gun = (u) => 0.3 + 1.0 * Math.pow(Math.abs(2 * u - 1), 3.2);
  // hull: a boat swept up to points at prow and stern
  const hullG = gridSurf((u, v) => { const a = (v - 0.5) * Math.PI; return V3(lerp(-L, L, u), gun(u) - D(u) * Math.cos(a), W(u) * Math.sin(a)); }, 64, 24);
  // the friezes run along the hull: remap uv (u along → repeat, v around → band layout from the gunwale down)
  { const uv = hullG.attributes.uv; for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, u * 3, 1 - Math.abs(v - 0.5) * 2 * 0.95); } }
  hull.push(hullG);
  // gunwale moulding (gold tubes along both sheers)
  for (const s of [1, -1]) {
    const pts = []; for (let i = 0; i <= 40; i++) { const u = 0.02 + i / 40 * 0.96; pts.push(V3(lerp(-L, L, u), gun(u) + 0.02, s * W(u))); }
    gold.push(tubeAlong(new THREE.CatmullRomCurve3(pts), () => 0.045, 60, 8));
  }
  // deck
  { const sh = new THREE.Shape(); for (let i = 0; i <= 40; i++) { const u = 0.08 + i / 40 * 0.84, x = lerp(-L, L, u); if (i) sh.lineTo(x, W(u) * 0.97); else sh.moveTo(x, W(u) * 0.97); } for (let i = 40; i >= 0; i--) { const u = 0.08 + i / 40 * 0.84; sh.lineTo(lerp(-L, L, u), -W(u) * 0.97); }
    const dg = new THREE.ShapeGeometry(sh); dg.rotateX(Math.PI / 2); dg.translate(0, 0.34, 0); verm.push(dg); }
  // stepped plinth with a frieze and a railing of tiny balusters
  gold.push(box(3.9, 0.16, 1.9, [0, 0.42, 0]));
  hull.push(bake(new THREE.BoxGeometry(3.5, 0.22, 1.66), [0, 0.61, 0]));
  gold.push(box(3.62, 0.06, 1.78, [0, 0.75, 0]));
  const PY = 0.78;                                            // pavilion floor
  for (const [x0, z0, x1, z1, n] of [[-1.74, 0.82, 1.74, 0.82, 22], [-1.74, -0.82, 1.74, -0.82, 22], [1.74, -0.82, 1.74, 0.82, 10], [-1.74, -0.82, -1.74, 0.82, 10]]) {
    for (let i = 0; i <= n; i++) { const x = lerp(x0, x1, i / n), z = lerp(z0, z1, i / n); gold.push(bake(lathe([[0.03, 0], [0.04, 0.04], [0.022, 0.08], [0.035, 0.16], [0.02, 0.24], [0.03, 0.27]], 8), [x, PY, z])); }
    gold.push(rod(V3(x0, PY + 0.28, z0), V3(x1, PY + 0.28, z1), 0.022, 6));
  }
  // eight pillars (pot base, slim fluted shaft, bracket capital)
  const pillar = lathe([[0.13, 0], [0.13, 0.06], [0.09, 0.1], [0.12, 0.2], [0.07, 0.3], [0.055, 0.34], [0.05, 1.1], [0.07, 1.16], [0.11, 1.24], [0.09, 1.3], [0.14, 1.34], [0.14, 1.4]], 14);
  const PX = [-1.2, 0, 1.2], PZ = 0.66, PH = 1.4;
  const posts = [];
  for (const x of PX) for (const z of [PZ, -PZ]) posts.push([x, z]);
  posts.push([-1.2, 0], [1.2, 0]);
  for (const [x, z] of posts) gold.push(bake(pillar.clone(), [x, PY, z]));
  // cusped arch valances between the pillars (vermilion field, gold frame)
  const archPanel = (w) => {
    // a valance whose lower edge is a cusped (multifoil) arch
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0.42); s.lineTo(w / 2, 0.42); s.lineTo(w / 2, 0);
    const K = 7, P = (k) => { const u = k / K; return [(w / 2) * (1 - 2 * u), 0.3 * Math.pow(Math.sin(Math.PI * u), 0.7)]; };
    for (let k = 0; k < K; k++) {
      const [x0, y0] = P(k), [x1, y1] = P(k + 1), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, l = Math.hypot(mx, my + 0.05) || 1;
      s.quadraticCurveTo(mx + mx / l * 0.05, my + (my + 0.05) / l * 0.05, x1, y1);
    }
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false, curveSegments: 6 });
  };
  for (const z of [PZ, -PZ]) for (const x of [-0.6, 0.6]) verm.push(bake(archPanel(1.1), [x, PY + PH - 0.44, z - 0.02]));
  for (const x of [-1.2, 1.2]) for (const z of [-0.33, 0.33]) verm.push(bake(archPanel(0.6), [x - 0.02, PY + PH - 0.44, z], [0, Math.PI / 2, 0]));
  // swagged pearl garlands between pillar tops
  for (const [a, b] of [[[-1.2, PZ], [0, PZ]], [[0, PZ], [1.2, PZ]], [[-1.2, -PZ], [0, -PZ]], [[0, -PZ], [1.2, -PZ]]]) {
    for (let i = 1; i < 14; i++) { const u = i / 14, x = lerp(a[0], b[0], u), z = a[1] + Math.sign(a[1]) * 0.05; ivory.push(bake(new THREE.SphereGeometry(0.022, 6, 4), [x, PY + PH - 0.5 - Math.sin(Math.PI * u) * 0.22, z])); }
  }
  // entablature, sloping chhajja eave, parapet of merlons
  const EY = PY + PH;
  gold.push(box(2.62, 0.12, 1.5, [0, EY + 0.06, 0]));
  lapis.push(box(2.56, 0.1, 1.44, [0, EY + 0.17, 0]));
  { const ch = lathe([[1.0, 0], [0.82, 0.14]], 4); ch.rotateY(Math.PI / 4); ch.scale(2.15, 1, 1.38); verm.push(bake(ch, [0, EY + 0.22, 0])); }
  for (let i = 0; i < 18; i++) for (const z of [0.64, -0.64]) gold.push(bake(new THREE.ConeGeometry(0.05, 0.14, 4), [-1.2 + i * 2.4 / 17, EY + 0.44, z]));
  for (let i = 0; i < 8; i++) for (const x of [1.2, -1.2]) gold.push(bake(new THREE.ConeGeometry(0.05, 0.14, 4), [x, EY + 0.44, -0.64 + i * 1.28 / 7]));
  gold.push(box(2.46, 0.06, 1.34, [0, EY + 0.37, 0]));
  // drum + onion dome + lotus + kalasha finial
  const DY = EY + 0.4;
  lapis.push(cyl(0.6, 0.62, 0.32, 32, [0, DY + 0.16, 0]));
  for (const y of [DY + 0.02, DY + 0.3]) gold.push(bake(new THREE.TorusGeometry(0.62, 0.03, 6, 40), [0, y, 0], [Math.PI / 2, 0, 0]));
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; gold.push(box(0.05, 0.22, 0.02, [Math.cos(a) * 0.615, DY + 0.16, Math.sin(a) * 0.615], [0, -a, 0])); }
  const domeP = []; for (let i = 0; i <= 24; i++) { const u = i / 24, r = 0.58 + 0.28 * Math.sin(Math.PI * Math.min(1, u * 1.5)) - 0.58 * Math.pow(u, 2.2); domeP.push([Math.max(0.03, r * (1 - Math.pow(u, 6))), DY + 0.32 + u * 1.25]); }
  gold.push(lathe(domeP, 40));
  // ribs on the dome (raised gold lines read as the painter's line work)
  for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, pts = domeP.slice(1, 22).map(([r, y]) => V3(Math.cos(a) * (r + 0.012), y, Math.sin(a) * (r + 0.012))); ink.push(tubeAlong(new THREE.CatmullRomCurve3(pts), () => 0.012, 24, 4)); }
  const topY = DY + 0.32 + 1.25;
  gold.push(bake(lathe([[0.03, 0], [0.12, 0.05], [0.14, 0.12], [0.08, 0.18], [0.11, 0.26], [0.13, 0.34], [0.06, 0.42], [0.025, 0.46], [0.018, 0.8], [0.0, 0.84]], 16), [0, topY - 0.02, 0]));
  // four corner chhatris (domed kiosks on posts)
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const x = sx * 1.05, z = sz * 0.52, y0 = EY + 0.4;
    for (const [dx, dz] of [[0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]]) gold.push(cyl(0.022, 0.022, 0.32, 6, [x + dx, y0 + 0.16, z + dz]));
    lapis.push(box(0.4, 0.05, 0.4, [x, y0 + 0.34, z]));
    gold.push(bake(lathe([[0.2, 0], [0.22, 0.06], [0.18, 0.18], [0.08, 0.3], [0.02, 0.36], [0.01, 0.48]], 16), [x, y0 + 0.36, z]));
  }
  // a throne-cushion under the canopy
  verm.push(box(0.9, 0.22, 0.6, [-0.1, PY + 0.11, 0]));
  gold.push(box(0.96, 0.05, 0.66, [-0.1, PY + 0.24, 0]));
  ivory.push(cyl(0.09, 0.09, 0.56, 12, [-0.45, PY + 0.32, 0], [Math.PI / 2, 0, 0]));
  // the hamsa (swan) prow: a long S-neck rising from the bow, head, beak, crest
  const neck = new THREE.CatmullRomCurve3([V3(2.75, 0.95, 0), V3(3.25, 1.25, 0), V3(3.55, 1.85, 0), V3(3.35, 2.4, 0), V3(3.42, 2.75, 0), V3(3.7, 2.92, 0)]);
  gold.push(tubeAlong(neck, (u) => lerp(0.24, 0.085, Math.pow(u, 0.7)), 40, 12));
  gold.push(bake(new THREE.SphereGeometry(0.13, 16, 10), [3.74, 2.95, 0], [0, 0, -0.25], [1.45, 0.9, 0.85]));
  verm.push(bake(new THREE.ConeGeometry(0.05, 0.26, 10), [3.98, 2.88, 0], [0, 0, -Math.PI / 2 - 0.35]));
  for (const s of [1, -1]) ink.push(bake(new THREE.SphereGeometry(0.02, 6, 4), [3.8, 2.99, s * 0.1]));
  for (let i = 0; i < 3; i++) gold.push(bake(new THREE.ConeGeometry(0.03, 0.3, 6), [3.6 - i * 0.07, 3.1 + i * 0.03, 0], [0, 0, 0.6 + i * 0.3]));
  // swan wings folded along the bow (feather plates)
  for (const s of [1, -1]) for (let i = 0; i < 6; i++) {
    const f = plate([[0, 0], [0.75 - i * 0.07, 0.06], [0.95 - i * 0.08, 0.13], [0.7 - i * 0.06, 0.2], [0, 0.12]], 0.025, 0.008);
    gold.push(bake(f, [2.2 - i * 0.16, 0.62 + i * 0.07, s * (0.98 - i * 0.05)], [s * 0.15, s * (0.22 + i * 0.03), 0.25 - i * 0.03]));
  }
  // the peacock fan at the stern
  for (let i = 0; i < 11; i++) {
    const a = lerp(-0.25, 1.35, i / 10), len = 1.15 + 0.25 * Math.sin(Math.PI * i / 10);
    const f = plate([[0, -0.03], [len * 0.6, -0.09], [len, 0], [len * 0.6, 0.09], [0, 0.03]], 0.02, 0.006);
    const rot = [0, 0, Math.PI - a]; const base = [-2.95, 1.2, 0];
    gold.push(bake(f, base, rot));
    const ex = base[0] + Math.cos(Math.PI - a) * len * 0.82, ey = base[1] + Math.sin(Math.PI - a) * len * 0.82;
    lapis.push(bake(new THREE.SphereGeometry(0.085, 12, 8), [ex, ey, 0], [0, 0, 0], [1.2, 1, 0.35]));
    teal.push(bake(new THREE.SphereGeometry(0.05, 10, 6), [ex, ey, 0], [0, 0, 0], [1.2, 1, 0.55]));
  }
  // bells hanging under the hull
  for (let i = 0; i < 7; i++) { const u = 0.25 + i * 0.5 / 6, x = lerp(-L, L, u), y = gun(u) - D(u) - 0.05; gold.push(rod(V3(x, y + 0.08, 0), V3(x, y - 0.12, 0), 0.008, 4), bake(lathe([[0.001, 0], [0.06, 0.0], [0.05, 0.05], [0.035, 0.11], [0.01, 0.13]], 10), [x, y - 0.25, 0])); }
  // banner poles at the plinth corners
  const poles = [[1.75, 0.85], [1.75, -0.85], [-1.75, 0.85], [-1.75, -0.85]];
  for (const [x, z] of poles) { gold.push(cyl(0.028, 0.035, 2.6, 8, [x, 0.5 + 1.3, z]), bake(new THREE.SphereGeometry(0.06, 10, 8), [x, 3.14, z]), bake(new THREE.ConeGeometry(0.04, 0.16, 8), [x, 3.26, z])); }

  const add = (geos, mat, outline = true) => { if (!geos.length) return null; const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); if (outline) ink.push(...geos); return m; };
  add(hull, M.goldHull); add(gold, M.gold); add(verm, M.vermilion); add(lapis, M.lapis); add(ivory, M.ivory, false); add(teal, M.teal, false);
  // ink outline (the painter's line) around the solid parts
  const lineGeos = ink.filter((x) => x.attributes.position.count > 3);
  const om = new THREE.Mesh(outlineGeo(lineGeos), M.ink); g.add(om);
  // pennants: swallow-tailed streamers on the four poles and the finial (posed in update)
  const flags = [];
  const flagAt = (x, y, z, len, h, col) => {
    const geo = new THREE.PlaneGeometry(len, h, 16, 2); geo.translate(len / 2, -h / 2, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / len, yy = p.getY(i);
      if (Math.abs(yy + h / 2) < 1e-4 && u > 0.99) p.setX(i, len * 0.82);      // swallow tail notch
      p.setY(i, yy * (1 - 0.7 * u));
    }
    geo.userData.base = Float32Array.from(p.array);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, side: THREE.DoubleSide }));
    m.position.set(x, y, z); g.add(m); flags.push(m); return m;
  };
  for (const [x, z] of poles) flagAt(x, 3.05, z, 1.5, 0.32, z > 0 ? '#c22a18' : '#e0a030');
  flagAt(0, topY + 0.74, 0, 1.2, 0.26, '#c22a18');
  return { group: g, flags, topY };
}
// pennants ripple (pure function of t): bend each flag along its length
export function waveFlags(flags, t, wind = 1) {
  flags.forEach((m, k) => {
    const p = m.geometry.attributes.position, b = m.geometry.userData.base;
    for (let i = 0; i < p.count; i++) {
      const x = b[i * 3], u = x / 1.5;
      p.setZ(i, Math.sin(x * 4.2 - t * 9 * wind + k) * 0.12 * u + Math.sin(x * 9 - t * 15 + k * 2) * 0.03 * u);
      p.setY(i, b[i * 3 + 1] - u * u * 0.1);
    }
    p.needsUpdate = true; m.geometry.computeVertexNormals();
  });
}

// ================================================================== 2 · HUMBER-SOMMER BIPLANE, 1911 (m; nose +X, origin on the ground)
export function buildSommer(M) {
  const g = new THREE.Group();
  const wood = [], fab = [], eng = [], brass = [], rub = [], bag = [], wires = [], dark = [], cloth = [], skin = [], leather = [];
  const LE = 0.95, CH = 1.85, YL = 1.15, YU = 2.95;
  const plane = (y, span, chord, xle = LE) => { const st = []; for (let i = 0; i <= 8; i++) { const z = -span + i / 8 * 2 * span; st.push({ x: xle, y, z, c: chord }); } return st; };
  fab.push(wingGeo(plane(YL, 4.3, CH), { n: 10, t: 0.035, cam: 0.05 }));
  fab.push(wingGeo(plane(YU, 5.3, CH), { n: 10, t: 0.035, cam: 0.05 }));
  // interplane struts (front and rear spars) and the slanting extension struts out to the upper tips
  const yAt = (y, x) => y + 0.05 * CH * 4 * ((LE - x) / CH) * (1 - (LE - x) / CH);
  const fx = LE - 0.18, rx = LE - CH * 0.72;
  for (const z of [-0.65, 0.65, -2.0, 2.0, -3.4, 3.4, -4.25, 4.25]) for (const x of [fx, rx]) wood.push(strut(V3(x, yAt(YL, x), z), V3(x, yAt(YU, x), z), 0.022, 0.05));
  for (const s of [1, -1]) for (const x of [fx, rx]) wood.push(strut(V3(x, yAt(YL, x), s * 4.25), V3(x, yAt(YU, x), s * 5.15), 0.02, 0.045));
  // bracing wires: an X in each bay, front and rear
  const bays = [-5.15, -4.25, -3.4, -2.0, -0.65, 0.65, 2.0, 3.4, 4.25, 5.15];
  for (let i = 0; i < bays.length - 1; i++) {
    const z0 = bays[i], z1 = bays[i + 1]; if (Math.abs(z0) > 4.3 || Math.abs(z1) > 4.3) continue;
    for (const x of [fx, rx]) wires.push(V3(x, yAt(YL, x), z0), V3(x, yAt(YU, x), z1), V3(x, yAt(YL, x), z1), V3(x, yAt(YU, x), z0));
    // drag wires across the wing (in plan)
  }
  // skids (curling up at the front) on struts, with paired wheels
  for (const s of [1, -1]) {
    const z = s * 0.95;
    const sk = new THREE.CatmullRomCurve3([V3(-1.2, 0.42, z), V3(0.4, 0.4, z), V3(1.8, 0.48, z), V3(2.7, 0.8, z), V3(3.0, 1.25, z), V3(2.85, 1.5, z)]);
    wood.push(tubeAlong(sk, () => 0.04, 40, 6));
    wood.push(strut(V3(fx, YL, z), V3(fx, 0.42, z), 0.022, 0.05), strut(V3(rx, YL, z), V3(rx + 0.2, 0.42, z), 0.022, 0.05), strut(V3(2.2, 0.55, z), V3(LE + 0.05, YL, z), 0.02, 0.04));
    wood.push(strut(V3(2.85, 1.48, z), V3(LE, YU - 0.02, z * 0.7), 0.018, 0.035));
    for (const dz of [0.22, -0.22]) {
      const wz = z + dz, wx = 0.35, wr = 0.33;
      rub.push(bake(new THREE.TorusGeometry(wr, 0.04, 8, 28), [wx, wr, wz]));
      brass.push(cyl(0.05, 0.05, 0.12, 10, [wx, wr, wz], [Math.PI / 2, 0, 0]));
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; dark.push(rod(V3(wx, wr, wz + (k % 2 ? 0.04 : -0.04)), V3(wx + Math.cos(a) * wr * 0.95, wr + Math.sin(a) * wr * 0.95, wz), 0.004, 3)); }
    }
    dark.push(rod(V3(0.35, 0.33, z - 0.3), V3(0.35, 0.33, z + 0.3), 0.02, 6));
    // rubber-cord shock absorbers wrapped on the axle
    dark.push(bake(new THREE.TorusGeometry(0.05, 0.02, 6, 10), [0.35, 0.38, z], [0, Math.PI / 2, 0]));
  }
  // tail booms (wide at the wing to clear the propeller, converging to the box tail)
  const TX0 = -5.9, TX1 = -7.0, TY0 = 1.75, TY1 = 2.55, TZ = 0.85;
  for (const s of [1, -1]) {
    wood.push(rod(V3(LE - CH, YU, s * 1.5), V3(TX0, TY1, s * TZ), 0.03, 6), rod(V3(LE - CH, YL, s * 1.5), V3(TX0, TY0, s * TZ), 0.03, 6));
    const mx = -3.4, k = (mx - (LE - CH)) / (TX0 - (LE - CH));
    const zm = lerp(1.5, TZ, k) * s, yu = lerp(YU, TY1, k), yl = lerp(YL, TY0, k);
    wood.push(rod(V3(mx, yl, zm), V3(mx, yu, zm), 0.022, 6), rod(V3(TX0, TY0, s * TZ), V3(TX0, TY1, s * TZ), 0.022, 6));
    wires.push(V3(mx, yl, zm), V3(TX0, TY1, s * TZ), V3(mx, yu, zm), V3(TX0, TY0, s * TZ), V3(LE - CH, YL, s * 1.5), V3(mx, yu, zm), V3(LE - CH, YU, s * 1.5), V3(mx, yl, zm));
  }
  for (const [x, y] of [[-3.4, lerp(YL, TY0, (-3.4 - (LE - CH)) / (TX0 - (LE - CH)))], [-3.4, lerp(YU, TY1, (-3.4 - (LE - CH)) / (TX0 - (LE - CH)))], [TX0, TY0], [TX0, TY1]]) {
    const k = (x - (LE - CH)) / (TX0 - (LE - CH)), z = lerp(1.5, TZ, k);
    wood.push(rod(V3(x, y, -z), V3(x, y, z), 0.018, 5));
  }
  // box tail: two horizontal surfaces, two rudders between them
  for (const y of [TY0, TY1]) fab.push(wingGeo([{ x: TX0 + 0.15, y, z: -1.35, c: 1.25 }, { x: TX0 + 0.15, y, z: 0, c: 1.25 }, { x: TX0 + 0.15, y, z: 1.35, c: 1.25 }], { n: 8, t: 0.04, cam: 0.02 }));
  for (const s of [1, -1]) fab.push(bake(plate([[0, 0], [0.75, 0], [0.8, 0.8], [0, 0.8]], 0.03, 0.006), [TX1 - 0.2, TY0, s * 0.55], [0, 0, 0]));
  for (const s of [1, -1]) wood.push(rod(V3(TX1 - 0.18, TY0, s * 0.55), V3(TX1 - 0.18, TY1, s * 0.55), 0.015, 5));
  // seat, footbar, control column, the pilot (cloth coat, leather cap), two mail bags
  wood.push(box(0.5, 0.04, 0.44, [1.15, YL + 0.12, 0]), box(0.04, 0.4, 0.44, [0.92, YL + 0.32, 0]));
  wood.push(rod(V3(1.0, YL + 0.08, -0.3), V3(1.95, 0.62, -0.3), 0.02, 5), rod(V3(1.0, YL + 0.08, 0.3), V3(1.95, 0.62, 0.3), 0.02, 5));
  wood.push(rod(V3(1.95, 0.62, -0.3), V3(1.95, 0.62, 0.3), 0.02, 5), rod(V3(1.85, 0.65, 0), V3(2.25, 0.55, 0), 0.02, 5));
  dark.push(rod(V3(1.45, YL + 0.1, 0), V3(1.42, YL + 0.68, 0), 0.015, 5), bake(new THREE.TorusGeometry(0.1, 0.012, 5, 16), [1.42, YL + 0.72, 0], [0, Math.PI / 2, 0]));
  cloth.push(bake(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), [1.08, YL + 0.55, 0], [0, 0, -0.18], [1, 1, 1.15]));
  for (const s of [1, -1]) { cloth.push(rod(V3(1.12, YL + 0.18, s * 0.12), V3(1.75, 0.75, s * 0.15), 0.065, 6)); cloth.push(rod(V3(1.12, YL + 0.68, s * 0.2), V3(1.38, YL + 0.72, s * 0.08), 0.05, 6)); }
  skin.push(bake(new THREE.SphereGeometry(0.12, 14, 10), [1.13, YL + 1.0, 0]));
  leather.push(bake(new THREE.SphereGeometry(0.13, 14, 10, 0, TAU, 0, Math.PI * 0.55), [1.12, YL + 1.02, 0]));
  dark.push(bake(new THREE.TorusGeometry(0.05, 0.015, 5, 12), [1.24, YL + 1.04, 0.05], [0, Math.PI / 2, 0]), bake(new THREE.TorusGeometry(0.05, 0.015, 5, 12), [1.24, YL + 1.04, -0.05], [0, Math.PI / 2, 0]));
  for (const s of [1, -1]) {
    bag.push(bake(new THREE.SphereGeometry(0.22, 12, 10), [0.45, YL + 0.22, s * 0.48], [0.2 * s, 0.3, 0.1], [1.3, 0.85, 0.9]));
    bag.push(bake(new THREE.CylinderGeometry(0.05, 0.1, 0.12, 8), [0.45, YL + 0.42, s * 0.48]));
    leather.push(bake(new THREE.TorusGeometry(0.2, 0.012, 4, 20), [0.45, YL + 0.22, s * 0.48], [0, 0, Math.PI / 2], [1.25, 1, 1]));
  }
  // fuel tank (brass) above the lower wing
  brass.push(cyl(0.15, 0.15, 0.8, 16, [0.1, YL + 0.35, 0], [Math.PI / 2, 0, 0]));
  wood.push(rod(V3(0.1, YL, -0.3), V3(0.1, YL + 0.22, -0.3), 0.015, 4), rod(V3(0.1, YL, 0.3), V3(0.1, YL + 0.22, 0.3), 0.015, 4));
  // engine bearers
  const EX = LE - CH - 0.15, EYc = 2.05;
  for (const s of [1, -1]) wood.push(rod(V3(EX + 0.6, YL, s * 0.35), V3(EX + 0.05, EYc, s * 0.12), 0.025, 5), rod(V3(EX + 0.6, YU, s * 0.35), V3(EX + 0.05, EYc, s * 0.12), 0.025, 5));
  eng.push(cyl(0.06, 0.06, 0.5, 10, [EX + 0.25, EYc, 0], [0, 0, Math.PI / 2]));
  add(g, wood, M.spruce); add(g, fab, M.fabric); add(g, brass, M.brass); add(g, rub, M.rubber); add(g, bag, M.canvasBag); add(g, dark, M.darkMetal); add(g, cloth, M.cloth); add(g, skin, M.skin); add(g, leather, M.leather); add(g, eng, M.engine);
  const wireGeo = new THREE.BufferGeometry().setFromPoints(wires); const wl = new THREE.LineSegments(wireGeo, M.wire); g.add(wl);
  // rotary engine + pusher propeller (turn together about X)
  const rot = new THREE.Group(); rot.position.set(EX, EYc, 0); g.add(rot);
  {
    const re = [], rf = [];
    re.push(cyl(0.17, 0.17, 0.18, 20, [0, 0, 0], [0, 0, Math.PI / 2]));
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU, dir = V3(0, Math.cos(a), Math.sin(a)), at = (r) => V3(0, dir.y * r, dir.z * r);
      re.push(rod(at(0.15), at(0.42), 0.055, 10));
      for (let f = 0; f < 7; f++) rf.push(bake(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 12), [0, dir.y * (0.2 + f * 0.03), dir.z * (0.2 + f * 0.03)], [a, 0, 0]));
      rf.push(rod(at(0.42), V3(0.12, dir.y * 0.16, dir.z * 0.16), 0.01, 4));
    }
    rot.add(new THREE.Mesh(merge(re), M.engine), new THREE.Mesh(merge(rf), M.darkMetal));
    const pr = [];
    for (const s of [0, Math.PI]) pr.push(bake(bladeGeo(1.25, 0.2, 0.12, 0.5, 0.04), [-0.22, 0, 0], [s, 0, 0]));
    pr.push(cyl(0.08, 0.08, 0.12, 12, [-0.22, 0, 0], [0, 0, Math.PI / 2]));
    rot.add(new THREE.Mesh(merge(pr), M.prop));
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a3a20').multiplyScalar(0.5), transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.set(EX - 0.22, EYc, 0); disc.rotation.y = Math.PI / 2; g.add(disc);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  disc.castShadow = false;
  return { group: g, rotor: rot, disc, bags: V3(0.45, YL + 0.3, 0.48) };
}
function add(g, geos, mat) { if (!geos.length) return null; const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }

// ================================================================== 3 · DE HAVILLAND PUSS MOTH, 1932 (m; nose +X, origin at the datum)
export function buildPussMoth(M) {
  const g = new THREE.Group();
  const body = [], trim = [], wingS = [], dark = [], glass = [], rub = [], metal = [];
  const fus = (x) => {
    // nose x = 2.55 … tail x = -4.95
    if (x > 1.95) { const u = (x - 1.95) / 0.6; return [0.4 * Math.sqrt(Math.max(0, 1 - u * u * 0.85)) + 0.02, 0.48 * Math.sqrt(Math.max(0, 1 - u * u * 0.8)) + 0.02, -0.05 - 0.05 * u, 2.6]; }
    if (x > -0.4) { const u = (1.95 - x) / 2.35; return [lerp(0.4, 0.5, Math.min(1, u * 2)), lerp(0.48, 0.66, Math.min(1, u * 1.6)), lerp(-0.05, 0.02, u), 3.2]; }
    const u = (-0.4 - x) / 4.55; return [lerp(0.5, 0.07, Math.pow(u, 0.9)), lerp(0.66, 0.16, Math.pow(u, 0.85)), lerp(0.02, 0.3, u * u), lerp(3.2, 2.4, u)];
  };
  body.push(bodyGeo(-4.95, 2.55, fus, 72, 28));
  // a dark-red cheat stripe and the cowling seam (thin bands standing proud of the skin)
  for (const s of [1, -1]) trim.push(gridSurf((u, v) => { const x = lerp(2.4, -4.6, u), [w, h, yc] = fus(x), y = yc + lerp(-0.05, 0.07, v) * (h / 0.6); return V3(x, y, s * (w * 1.003 + 0.004)); }, 40, 2));
  // high wing: tapered, square-raked tips, slight dihedral; the wing sits on the cabin roof
  const ws = []; for (let i = 0; i <= 12; i++) { const s = i / 12, z = s * 5.6; ws.push({ x: 1.02 - s * 0.15, y: 0.68 + s * 0.18, z, c: lerp(1.75, 1.2, s) - (s > 0.92 ? (s - 0.92) * 4 : 0) }); }
  wingS.push(wingGeo(ws, { n: 12, t: 0.13, cam: 0.025 }));
  wingS.push(wingGeo(ws.map((w) => ({ ...w, z: -w.z })), { n: 12, t: 0.13, cam: 0.025 }));
  // V-struts from the lower longeron to the wing, with a jury strut
  for (const s of [1, -1]) {
    const foot = V3(0.4, -0.6, s * 0.48);
    metal.push(strut(foot, V3(0.8, 0.72 + 0.18 * 0.5, s * 2.8), 0.03, 0.07), strut(foot, V3(-0.25, 0.72 + 0.18 * 0.5, s * 2.8), 0.03, 0.07));
    metal.push(strut(V3(0.55, -0.1, s * 1.55), V3(0.55, 0.78, s * 1.55), 0.015, 0.03));
  }
  // undercarriage: faired legs splayed out, wheels, tail skid
  for (const s of [1, -1]) {
    const top = V3(0.95, -0.5, s * 0.46), axle = V3(0.95, -1.42, s * 1.05);
    metal.push(strut(top, axle, 0.06, 0.13, 10), rod(V3(0.4, -0.6, s * 0.46), axle, 0.025, 6));
    rub.push(bake(new THREE.TorusGeometry(0.24, 0.085, 10, 24), [axle.x, axle.y, axle.z + s * 0.06]));
    metal.push(cyl(0.16, 0.16, 0.12, 18, [axle.x, axle.y, axle.z + s * 0.06], [Math.PI / 2, 0, 0]));
  }
  dark.push(rod(V3(-4.4, 0.22, 0), V3(-4.7, -0.12, 0), 0.025, 5));
  // tail: the de Havilland curved fin and rudder, tailplane and elevators
  body.push(plate([[-3.9, 0.42], [-4.3, 0.75], [-4.55, 1.05], [-4.72, 1.25], [-4.88, 1.33], [-5.02, 1.3], [-5.1, 1.15], [-5.12, 0.8], [-5.08, 0.4], [-4.98, 0.15], [-4.6, 0.25]], 0.05, 0.012));
  const tp = (s) => plate([[0, 0], [0.15 * s, 1.55], [-0.35, 1.7], [-0.8, 1.6], [-0.9, 0.25], [-0.85, 0]].map(([x, z]) => [x, z]), 0.05, 0.012);
  for (const s of [1, -1]) wingS.push(bake(tp(1), [-4.15, 0.32, 0], [s * Math.PI / 2, 0, 0]));
  // cockpit and cabin glazing: windscreen, three side windows each side, roof light
  glass.push(gridSurf((u, v) => { const x = lerp(1.35, 1.02, v), [w, h, yc] = fus(x), a = lerp(-0.65, 0.65, u); return V3(x + 0.01, yc + Math.cos(a) * h * 0.97 + 0.01, Math.sin(a) * w * 0.98); }, 10, 3));
  for (const s of [1, -1]) for (const [x0, x1] of [[0.95, 0.45], [0.38, -0.12], [-0.2, -0.55]]) {
    glass.push(gridSurf((u, v) => { const x = lerp(x0, x1, u), [w, h, yc] = fus(x); return V3(x, yc + lerp(0.05, 0.5, v) * h, s * (w * 1.004 + 0.006)); }, 4, 2));
  }
  // engine cowl details: exhaust pipe down the port side, louvres, spinner and the two-blade metal propeller
  dark.push(rod(V3(2.25, -0.3, -0.42), V3(0.6, -0.45, -0.5), 0.03, 6));
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) dark.push(box(0.12, 0.012, 0.01, [2.2 - i * 0.07, 0.05, s * 0.415]));
  const prop = new THREE.Group(); prop.position.set(2.62, -0.07, 0); g.add(prop);
  { const pr = [bake(bladeGeo(1.0, 0.13, 0.08, 0.5, 0.025), [0, 0, 0], [0, 0, 0]), bake(bladeGeo(1.0, 0.13, 0.08, 0.5, 0.025), [0, 0, 0], [Math.PI, 0, 0])];
    pr.forEach((p) => p.rotateZ(0)); const pm = new THREE.Mesh(merge(pr), M.engine); pm.rotation.y = 0; prop.add(pm);
    prop.add(new THREE.Mesh(bake(lathe([[0.13, 0], [0.12, 0.08], [0.07, 0.17], [0.0, 0.22]], 16), [0, 0, 0], [0, 0, -Math.PI / 2]), M.maroon)); }
  // the blade geometry is along +Y; turn the whole rotor so it spins about X
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9aa0a6').multiplyScalar(0.35), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  disc.position.set(2.66, -0.07, 0); disc.rotation.y = Math.PI / 2; g.add(disc);
  add(g, body, M.cream); add(g, trim, M.maroon); add(g, wingS, M.silverDope); add(g, dark, M.darkMetal); add(g, glass, M.glass); add(g, rub, M.rubber); add(g, metal, M.engine);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  disc.castShadow = false;
  return { group: g, prop, disc };
}

// IAF roundel (saffron / white / green discs) lying on a surface: centre p, normal axis rotation r
function roundel(M, parent, p, r, rad) {
  for (const [k, mat, dz] of [[1, M.saffron, 0], [0.66, M.white, 0.004], [0.33, M.green, 0.008]]) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(rad * k, 28), mat);
    m.position.set(...p); m.rotation.set(...r); m.translateZ(dz + 0.01); parent.add(m);
  }
}

// ================================================================== 4 · HAL HF-24 MARUT, 1961 (m; nose +X)
export function buildMarut(M) {
  const g = new THREE.Group();
  const skin = [], dark = [], glass = [];
  const fus = (x) => {
    // nose 7.9 … tail -7.9; twin engines side by side → a wide, flat-sided rear fuselage
    if (x > 4.0) { const u = (x - 4.0) / 3.9; const r = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.2 * u); return [0.62 * Math.pow(r, 1.1) + 0.01, 0.66 * Math.pow(r, 1.1) + 0.01, 0.05 - 0.12 * u * u, 2]; }
    if (x > -4.0) { const u = (4.0 - x) / 8; return [lerp(0.62, 0.92, Math.min(1, u * 2.5)), lerp(0.66, 0.78, Math.min(1, u * 2)), 0.05, lerp(2, 2.7, Math.min(1, u * 2))]; }
    const u = (-4.0 - x) / 3.9; return [lerp(0.92, 0.82, u), lerp(0.78, 0.5, u), 0.05 - 0.05 * u, 2.7];
  };
  skin.push(bodyGeo(-7.9, 7.9, fus, 90, 32));
  // canopy bubble with a frame line, dorsal spine behind it
  glass.push(bake(new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2), [4.5, 0.62, 0], [0, 0, 0], [1.25, 0.5, 0.42]));
  skin.push(bake(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2), [2.2, 0.66, 0], [0, 0, 0], [2.6, 0.26, 0.3]));
  // side intakes (half-round, behind the cockpit)
  for (const s of [1, -1]) {
    skin.push(bake(lathe([[0.42, 0], [0.44, 0.15], [0.4, 1.6], [0.2, 3.0], [0.01, 3.4]], 20), [3.0, -0.05, s * 0.7], [0, 0, Math.PI / 2]));
    dark.push(bake(new THREE.CircleGeometry(0.37, 20), [3.01, -0.05, s * 0.7], [0, Math.PI / 2, 0]));
  }
  // 45° swept wing, mid-set; swept fin; low-set swept tailplane
  const span = 4.5, root = 0.75;
  const wst = []; for (let i = 0; i <= 8; i++) { const s = i / 8, z = root + s * (span - root); wst.push({ x: 1.6 - (z - root) * 1.0, y: -0.05 - s * 0.08, z, c: lerp(4.2, 1.35, s) }); }
  for (const sd of [1, -1]) skin.push(wingGeo(wst.map((w) => ({ ...w, z: sd * w.z })), { n: 12, t: 0.06, cam: 0.0 }));
  const fst = []; for (let i = 0; i <= 6; i++) { const s = i / 6; fst.push({ x: -3.6 - s * 2.3, y: 0.7 + s * 2.4, z: 0, c: lerp(3.6, 1.1, s) }); }
  skin.push(wingGeo(fst, { n: 10, plane: 'v', t: 0.06, cam: 0 }));
  const tst = []; for (let i = 0; i <= 5; i++) { const s = i / 5, z = 0.5 + s * 2.3; tst.push({ x: -5.4 - (z - 0.5) * 1.0, y: -0.1, z, c: lerp(2.2, 0.8, s) }); }
  for (const sd of [1, -1]) skin.push(wingGeo(tst.map((w) => ({ ...w, z: sd * w.z })), { n: 10, t: 0.06, cam: 0 }));
  // twin jet pipes
  for (const s of [1, -1]) { dark.push(bake(lathe([[0.36, 0], [0.34, 0.5], [0.31, 0.62]], 20, true), [-7.75, 0.0, s * 0.42], [0, 0, Math.PI / 2])); dark.push(bake(new THREE.CircleGeometry(0.3, 20), [-7.6, 0.0, s * 0.42], [0, -Math.PI / 2, 0])); }
  dark.push(bake(new THREE.CircleGeometry(1, 24), [-7.89, 0.0, 0], [0, -Math.PI / 2, 0], [0.84, 0.52, 1]));
  // pitot on the nose, under-wing tanks
  dark.push(rod(V3(7.85, 0.0, 0), V3(8.6, 0.0, 0), 0.025, 5));
  for (const s of [1, -1]) skin.push(bake(lathe([[0.001, 0], [0.18, 0.5], [0.24, 1.2], [0.22, 2.2], [0.001, 2.9]], 14), [1.6, -0.6, s * 2.3], [0, 0, -Math.PI / 2]));
  add(g, skin, M.alu); add(g, dark, M.darkMetal); add(g, glass, M.canopy);
  // roundels on the upper wings
  for (const s of [1, -1]) roundel(M, g, [-1.4, 0.02, s * 3.3], [-Math.PI / 2, 0, 0], 0.42);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, nozzles: [V3(-7.9, 0, 0.42), V3(-7.9, 0, -0.42)], canopy: V3(4.6, 0.85, 0) };
}

// ================================================================== 5 · HAL TEJAS (m; nose +X)
export function buildTejas(M) {
  const g = new THREE.Group();
  const skin = [], dome = [], dark = [], glass = [];
  const fus = (x) => {
    if (x > 4.0) { const u = (x - 4.0) / 2.6; const r = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.25 * u); return [0.5 * Math.pow(r, 1.2) + 0.01, 0.52 * Math.pow(r, 1.2) + 0.01, 0.1 - 0.12 * u * u, 2]; }
    if (x > -4.5) { const u = (4.0 - x) / 8.5; return [lerp(0.5, 0.68, Math.min(1, u * 3)), lerp(0.52, 0.68, Math.min(1, u * 3)), 0.1, 2.3]; }
    const u = (-4.5 - x) / 2.1; return [lerp(0.68, 0.5, u), lerp(0.68, 0.5, u), 0.1 - 0.06 * u, lerp(2.3, 2, u)];
  };
  const nose = bodyGeo(4.0, 6.6, fus, 24, 32), main = bodyGeo(-6.6, 4.0, fus, 60, 32);
  dome.push(nose); skin.push(main);
  // canopy: one-piece bubble; a dorsal spine to the fin
  glass.push(bake(new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI / 2), [3.2, 0.5, 0], [0, 0, 0], [1.35, 0.52, 0.4]));
  skin.push(bake(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2), [0.2, 0.62, 0], [0, 0, 0], [3.4, 0.22, 0.34]));
  // side intakes under the wing roots (Y-duct), splitter plates
  for (const s of [1, -1]) {
    skin.push(bodyGeo(-1.5, 1.9, (x) => { const u = (1.9 - x) / 3.4; return [0.32 * (1 - 0.6 * u * u), 0.38 * (1 - 0.5 * u * u), -0.3 + 0.1 * u, 3]; }, 16, 18).translate(0, 0, s * 0.72));
    dark.push(bake(new THREE.CircleGeometry(1, 18), [1.91, -0.3, s * 0.72], [0, Math.PI / 2, 0], [0.3, 0.36, 1]));
  }
  // compound delta: steep inner leading edge, shallower outer; straight trailing edge; thin section
  const LEx = (z) => (z < 2.0 ? lerp(2.6, -1.3, (z - 0.6) / 1.4) : lerp(-1.3, -4.7, (z - 2.0) / 2.1));
  const wst = []; for (let i = 0; i <= 14; i++) { const z = 0.6 + i / 14 * 3.5, te = lerp(-5.9, -5.45, (z - 0.6) / 3.5); wst.push({ x: LEx(z), y: -0.12, z, c: Math.max(0.5, LEx(z) - te) }); }
  for (const sd of [1, -1]) skin.push(wingGeo(wst.map((w) => ({ ...w, z: sd * w.z })), { n: 12, t: 0.045, cam: 0 }));
  // a single tall swept fin
  const fst = []; for (let i = 0; i <= 6; i++) { const s = i / 6; fst.push({ x: -2.7 - s * 2.2, y: 0.62 + s * 2.6, z: 0, c: lerp(3.8, 1.0, s) }); }
  skin.push(wingGeo(fst, { n: 10, plane: 'v', t: 0.05, cam: 0 }));
  // afterburner nozzle with petals
  dark.push(bake(lathe([[0.52, 0], [0.5, 0.3], [0.44, 0.75], [0.42, 0.8]], 24), [-6.5, 0.04, 0], [0, 0, Math.PI / 2]));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; dark.push(box(0.5, 0.012, 0.2, [-7.05, 0.04 + Math.cos(a) * 0.43, Math.sin(a) * 0.43], [a, 0, 0])); }
  dark.push(bake(new THREE.CircleGeometry(0.4, 20), [-6.95, 0.04, 0], [0, -Math.PI / 2, 0]));
  dark.push(rod(V3(6.55, 0.08, 0), V3(7.3, 0.08, 0), 0.02, 5));
  add(g, skin, M.tejas); add(g, dome, M.radome); add(g, dark, M.darkMetal); add(g, glass, M.canopy);
  for (const s of [1, -1]) roundel(M, g, [-3.4, -0.03, s * 2.6], [-Math.PI / 2, 0, 0], 0.36);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, nozzle: V3(-7.2, 0.04, 0), tips: [V3(-4.9, -0.12, 4.1), V3(-4.9, -0.12, -4.1)] };
}

// ================================================================== set dressing
// a seated / standing crowd: bodies + heads (turbans, caps, sun helmets) + a few black umbrellas, instanced
export function buildCrowd(M, spots, seed = 4) {
  const R = rng(seed), n = spots.length;
  const bodyG = merge([bake(new THREE.CylinderGeometry(0.17, 0.24, 1.15, 7), [0, 0.58, 0]), bake(new THREE.SphereGeometry(0.2, 7, 5), [0, 1.13, 0], [0, 0, 0], [1.05, 0.6, 0.8])]);
  const headG = merge([bake(new THREE.SphereGeometry(0.11, 8, 6), [0, 1.37, 0]), bake(new THREE.SphereGeometry(0.13, 8, 5, 0, TAU, 0, Math.PI * 0.55), [0, 1.42, 0], [0, 0, 0], [1.05, 0.9, 1.05])]);
  const umbG = merge([bake(new THREE.ConeGeometry(0.62, 0.22, 10, 1, true), [0, 2.1, 0]), bake(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), [0.12, 1.6, 0])]);
  const bodies = new THREE.InstancedMesh(bodyG, M.crowdBody, n), heads = new THREE.InstancedMesh(headG, M.crowdHead, n);
  const umb = []; const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const robes = ['#efe9dc', '#e8e0cc', '#f3efe6', '#d9cfb8', '#2b2a2e', '#3a3328', '#c98a3a', '#9a3a2a', '#e6dcc4', '#efe9dc'];
  const tops = ['#f2ede2', '#c8402a', '#e6a23a', '#efe9dc', '#d86a8a', '#f2ede2', '#2a2420', '#e8e2d2'];
  spots.forEach(([x, z, sc = 1], i) => {
    const s = (0.92 + R() * 0.16) * sc;
    q.setFromAxisAngle(UP, R() * TAU); mtx.compose(V3(x, 0, z), q, V3(s, s * (0.95 + R() * 0.1), s));
    bodies.setMatrixAt(i, mtx); heads.setMatrixAt(i, mtx);
    bodies.setColorAt(i, c.set(robes[Math.floor(R() * robes.length)]));
    heads.setColorAt(i, c.set(tops[Math.floor(R() * tops.length)]));
    if (R() < 0.08) umb.push(mtx.clone());
  });
  const um = new THREE.InstancedMesh(umbG, M.umbrella, Math.max(1, umb.length));
  umb.forEach((m, i) => um.setMatrixAt(i, m)); um.count = umb.length;
  const grp = new THREE.Group(); grp.add(bodies, heads, um);
  for (const m of [bodies, heads, um]) { m.castShadow = true; m.receiveShadow = true; }
  return grp;
}
// a shamiana (flat-roofed striped canopy on poles with a scalloped valance) or a bell tent
export function shamianaGeo(w, d, h) {
  const roof = [], val = [], poles = [];
  roof.push(box(w, 0.06, d, [0, h + 0.4, 0]));
  roof.push(bake(new THREE.ConeGeometry(Math.hypot(w, d) / 2, 0.8, 4, 1, true), [0, h + 0.8, 0], [0, Math.PI / 4, 0], [w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414]));
  for (const [sx, sz, len, ry] of [[0, d / 2, w, 0], [0, -d / 2, w, 0], [w / 2, 0, d, Math.PI / 2], [-w / 2, 0, d, Math.PI / 2]]) {
    const n = Math.round(len / 0.6), s = new THREE.Shape(); s.moveTo(-len / 2, 0); s.lineTo(len / 2, 0);
    for (let i = n; i > 0; i--) { const x0 = -len / 2 + i * len / n, x1 = x0 - len / n; s.quadraticCurveTo((x0 + x1) / 2, -0.55, x1, -0.3); }
    s.closePath();
    val.push(bake(new THREE.ShapeGeometry(s, 4), [sx, h + 0.4, sz], [0, ry, 0]));
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) poles.push(cyl(0.05, 0.05, h + 0.4, 6, [sx * w / 2, (h + 0.4) / 2, sz * d / 2]));
  poles.push(cyl(0.06, 0.06, h + 1.6, 6, [0, (h + 1.6) / 2, 0]));
  return { roof: merge(roof), val: merge(val), poles: merge(poles) };
}
export function bellTentGeo(r, h) {
  return merge([bake(new THREE.CylinderGeometry(r, r, h * 0.35, 16, 1, true), [0, h * 0.175, 0]), bake(new THREE.ConeGeometry(r * 1.05, h * 0.7, 16, 1, true), [0, h * 0.35 + h * 0.35, 0])]);
}
// exhibition pavilion: a white hall with an arcade, corner chhatris and a central dome
export function pavilionGeo(w, d, h) {
  const wall = [], arch = [];
  wall.push(box(w, h, d, [0, h / 2, 0]), box(w + 0.4, 0.3, d + 0.4, [0, h + 0.15, 0]));
  wall.push(cyl(0.01, d * 0.3, 0.6, 16, [0, h + 0.6, 0]), bake(lathe([[d * 0.3, 0], [d * 0.34, d * 0.15], [d * 0.24, d * 0.38], [0.05, d * 0.5], [0.02, d * 0.62]], 20), [0, h + 0.9, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { wall.push(box(1.0, 1.0, 1.0, [sx * (w / 2 - 0.3), h + 0.8, sz * (d / 2 - 0.3)])); wall.push(bake(lathe([[0.6, 0], [0.62, 0.2], [0.4, 0.55], [0.05, 0.8], [0.02, 1.0]], 12), [sx * (w / 2 - 0.3), h + 1.3, sz * (d / 2 - 0.3)])); }
  const n = Math.max(3, Math.round(w / 2.2));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * w / n, aw = w / n * 0.6, ah = h * 0.62;
    const s = new THREE.Shape(); s.moveTo(-aw / 2, 0); s.lineTo(-aw / 2, ah * 0.65); s.quadraticCurveTo(-aw / 2, ah, 0, ah * 1.08); s.quadraticCurveTo(aw / 2, ah, aw / 2, ah * 0.65); s.lineTo(aw / 2, 0); s.closePath();
    arch.push(bake(new THREE.ShapeGeometry(s, 4), [x, 0.05, d / 2 + 0.01]));
  }
  return { wall: merge(wall), arch: merge(arch) };
}
// a rounded shade tree (neem / mango): trunk + lumpy crown with vertex-colour variation
export function treeGeo(seed = 1, h = 7) {
  const R = rng(seed), crown = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.IcosahedronGeometry(h * (0.22 + R() * 0.12), 1);
    const p = s.attributes.position; for (let k = 0; k < p.count; k++) { const v = V3().fromBufferAttribute(p, k); v.multiplyScalar(1 + (fbm2(v.x * 0.8 + seed, v.z * 0.8 + v.y, 2)) * 0.25); p.setXYZ(k, v.x, v.y, v.z); }
    s.computeVertexNormals();
    bake(s, [(R() - 0.5) * h * 0.5, h * (0.62 + R() * 0.25), (R() - 0.5) * h * 0.5]);
    crown.push(tint(s, R() < 0.5 ? '#c8d8a8' : '#a8bc88'));
  }
  return { crown: merge(crown), trunk: merge([cyl(h * 0.03, h * 0.05, h * 0.65, 7, [0, h * 0.32, 0])]) };
}
// coconut palm with separate trunk / frond geometry (for colour)
export function palmGeos(seed = 1, h = 9) {
  const R = rng(seed);
  const lean = (R() - 0.5) * 0.5 + 0.2, dir = R() * TAU, lx = Math.cos(dir) * lean * h * 0.35, lz = Math.sin(dir) * lean * h * 0.35, top = V3(lx, h, lz);
  const trunk = tubeAlong(new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(lx * 0.15, h * 0.35, lz * 0.15), V3(lx * 0.55, h * 0.72, lz * 0.55), top]), (u) => 0.22 * (1 - 0.4 * u) * (1 + 0.06 * Math.sin(u * 160)), 24, 7);
  const pos = [], NF = 14 + Math.floor(R() * 4), tmp = V3(), side = V3();
  for (let f = 0; f < NF; f++) {
    const a = (f / NF) * TAU + R() * 0.3, el = 0.7 - R() * 0.8, L = 3.4 + R() * 1.4;
    const d0 = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); side.crossVectors(d0, UP).normalize();
    const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12, p = top.clone().addScaledVector(d0, s * L); p.y -= (s * L) ** 2 * 0.13 * (1.3 - el * 0.4); pts.push(p); }
    for (let i = 1; i < 12; i++) {
      const s = i / 12, p = pts[i], tan = tmp.subVectors(pts[i + 1], pts[i - 1]).normalize(), ll = 0.95 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + 0.12;
      for (const sd of [-1, 1]) { const tip = p.clone().addScaledVector(side, sd * ll * 0.9).addScaledVector(tan, ll * 0.45); tip.y -= ll * 0.3; const b = p.clone().addScaledVector(tan, 0.1); pos.push(p.x, p.y, p.z, b.x, b.y, b.z, tip.x, tip.y, tip.z); }
    }
  }
  const fr = new THREE.BufferGeometry(); fr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fr.computeVertexNormals();
  return { trunk, fronds: fr };
}
