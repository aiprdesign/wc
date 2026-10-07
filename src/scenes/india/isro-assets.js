// TO THE MOON AND MARS — build-time assets for the ISRO chapter. Procedural hardware built from primitives
// (no logos or flags), an analytic dusk / blue-hour sky with a reflecting sea (one draw), a horizon-aware
// starfield, pure-function particle systems (launch billows, lunar touchdown dust) and planet shaders
// (the Moon with an M3-style water overlay, a rust-red Mars). Everything animated is driven by uniforms.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU } from '../../lib/math.js';
import { fbm2 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { PLANET_VERT, MOON_FRAG } from '../moonshot-assets.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ------------------------------------------------------------------ geometry helpers
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  return geo.applyMatrix4(_m);
}
// merge keeping position / normal / uv / color (missing colours → white)
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
// thin cylinder between two points
export function rod(a, b, r, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg, 1);
  _q.setFromUnitVectors(V3(0, 1, 0), _v.copy(b).sub(a).normalize());
  _m.compose(_s.copy(a).lerp(b, 0.5), _q, V3(1, 1, 1));
  return g.applyMatrix4(_m);
}
// thin box beam between two points (lattice members)
export function beam(a, b, w) {
  const g = new THREE.BoxGeometry(w, a.distanceTo(b), w);
  _q.setFromUnitVectors(V3(0, 1, 0), _v.copy(b).sub(a).normalize());
  _m.compose(_s.copy(a).lerp(b, 0.5), _q, V3(1, 1, 1));
  return g.applyMatrix4(_m);
}
// tube along a curve with a radius function r(u)
function tubeAlong(curve, rFn, segs = 24, radial = 8) {
  const pos = [], idx = [], frames = curve.computeFrenetFrames(segs, false), P = V3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs; curve.getPointAt(u, P); const r = rFn(u), N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) { const a = (j / radial) * TAU; pos.push(P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r, P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r, P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r); }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function treadTexture() {
  const c = mkCanvas(64, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(6, i * 16 + 3, 52, 6); }
  return toTexture(c, { srgb: false, repeat: true });
}

// ------------------------------------------------------------------ exhaust plume (open cone along −Y from its apex, additive)
export function plumeMat(color, intensity, { diamonds = 0, alpha = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uA: { value: alpha }, uT: { value: 0 }, uD: { value: diamonds } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `${GLSL_NOISE}
      uniform vec3 uColor; uniform float uI, uA, uT, uD; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
        float along = 1.0 - vUv.y;
        float n = 0.72 + 0.28 * snoise(vec3(vUv.x * 7.0, along * 6.0 - uT * 26.0, 0.0));
        float dia = uD > 0.0 ? mix(1.0, 0.45 + 0.9 * pow(abs(cos(along * 3.14159 * 7.0)), 6.0), uD) : 1.0;
        float a = facing * pow(1.0 - along, 1.5) * n * dia * uA;
        gl_FragColor = vec4(uColor * uI * (0.5 + 1.2 * (1.0 - along)) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}
export function plume(r0, r1, len, mat) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 24, 1, true); g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}

// ------------------------------------------------------------------ sky: dusk over the Arabian Sea (0) · blue hour at Sriharikota (1)
const skyFrag = /* glsl */ `
${GLSL_NOISE}
uniform int uMode; uniform vec3 uSun; uniform float uTime, uGain;
varying vec3 vDir;
vec3 sky(vec3 d){
  vec3 L = normalize(uSun);
  float e = d.y;
  vec2 hz = normalize(d.xz + 1e-5), lz = normalize(L.xz + 1e-5);
  float az = dot(hz, lz);                       // 1 toward the (set) sun, −1 away
  float t = pow(clamp(e, 0.0, 1.0), 0.5);
  vec3 c;
  if (uMode == 0) {
    vec3 hSun = vec3(0.95, 0.36, 0.11), hAway = vec3(0.14, 0.08, 0.15);
    vec3 hor = mix(hAway, hSun, pow(az * 0.5 + 0.5, 2.6));
    vec3 mid = mix(vec3(0.025, 0.034, 0.1), vec3(0.2, 0.085, 0.1), pow(az * 0.5 + 0.5, 3.0));
    vec3 zen = vec3(0.006, 0.014, 0.05);
    c = mix(hor, mid, smoothstep(0.0, 0.16, e));
    c = mix(c, zen, smoothstep(0.12, 0.75, e));
    c += vec3(1.3, 0.5, 0.15) * (pow(max(dot(d, L), 0.0), 60.0) * 0.35 + pow(max(dot(d, L), 0.0), 6.0) * 0.08) * smoothstep(0.25, 0.0, e);          // afterglow over the set sun
    c += vec3(0.24, 0.1, 0.16) * exp(-abs(e - 0.05) * 30.0) * (0.5 - 0.5 * az) * 0.6;   // belt of Venus
    // thin stratus streaks lit from below
    float k = 1.0 / max(e + 0.035, 0.02);
    vec2 uv = d.xz * k * vec2(0.18, 0.9);
    float cl = smoothstep(0.15, 0.75, snoise(vec3(uv * 0.6, 1.3)) * 0.6 + snoise(vec3(uv * 2.2, 4.1)) * 0.4);
    float band = smoothstep(0.015, 0.05, e) * (1.0 - smoothstep(0.1, 0.24, e));
    vec3 clc = mix(vec3(0.08, 0.04, 0.07), vec3(1.4, 0.48, 0.2), pow(az * 0.5 + 0.5, 2.0));
    c = mix(c, clc, cl * band * 0.8);
  } else {
    vec3 hor = mix(vec3(0.05, 0.075, 0.13), vec3(0.20, 0.12, 0.09), pow(az * 0.5 + 0.5, 3.0));
    vec3 zen = vec3(0.003, 0.007, 0.026);
    c = mix(hor, vec3(0.012, 0.025, 0.07), smoothstep(0.0, 0.2, e));
    c = mix(c, zen, smoothstep(0.15, 0.8, e));
    c += vec3(0.3, 0.16, 0.08) * pow(max(dot(d, L), 0.0), 10.0) * 0.4;
  }
  return c;
}
void main(){
  vec3 d = normalize(vDir);
  vec3 col;
  if (d.y >= 0.0) col = sky(d);
  else {
    // the sea: a wavy mirror of the sky, darker water below, haze at the horizon
    float k = 1.0 / max(-d.y, 0.002);
    vec2 p = d.xz * k;
    vec2 g = vec2(snoise(vec3(p * vec2(0.9, 2.6) + vec2(0.0, uTime * 0.6), 0.3)), snoise(vec3(p * vec2(0.8, 2.2) - vec2(uTime * 0.4, 0.0), 5.1)));
    g += 0.5 * vec2(snoise(vec3(p * 5.0 + uTime, 2.0)), snoise(vec3(p * 5.0 - uTime, 7.0)));
    float fade = exp(-k * 0.02);
    vec3 n = normalize(vec3(g.x * 0.09 * fade, 1.0, g.y * 0.09 * fade));
    vec3 r = reflect(d, n); r.y = abs(r.y);
    float fr = 0.03 + 0.97 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
    // blue-green water body under the reflection, and a glitter path toward the (low) sun
    col = sky(r) * fr * 0.85 + (uMode == 0 ? vec3(0.012, 0.045, 0.05) : vec3(0.006, 0.024, 0.03)) * (1.0 - fr);
    vec3 Lr = normalize(vec3(uSun.x, abs(uSun.y) + 0.03, uSun.z));
    float gl = pow(max(dot(r, Lr), 0.0), 260.0) * (0.6 + 0.4 * snoise(vec3(p * 6.0, uTime * 2.0)));
    col += (uMode == 0 ? vec3(1.3, 0.6, 0.25) : vec3(0.35, 0.3, 0.3)) * gl * 1.4;
    col = mix(col, sky(vec3(d.x, 0.004, d.z)), exp(-(-d.y) * 140.0) * 0.8);
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}`;
export function makeSky() {
  const u = { uMode: { value: 0 }, uSun: { value: V3(0, -0.03, -1) }, uTime: { value: 0 }, uGain: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; vec4 p = projectionMatrix * viewMatrix * w; p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: skyFrag,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), m);
  mesh.renderOrder = -1000; mesh.frustumCulled = false; mesh.userData.u = u;
  return mesh;
}

// a water surface (lagoon / sea) drawn with the sky's own sea: the fragment shader sees a downward view ray,
// so the plane shows the same blue-green mirror of the sky, its waves and the sun's glitter path.
export function makeWaterSurface(sky, geo) {
  const m = new THREE.ShaderMaterial({
    uniforms: sky.userData.u, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: skyFrag,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = false; return mesh;
}

// ------------------------------------------------------------------ vegetation (instanced; colours per vertex, tinted per instance)
// a grass tuft: thin tapering blades fanned out (double-sided)
export function grassTuftGeometry(seed = 3, blades = 7) {
  const R = rng(seed), pos = [], col = [], c0 = new THREE.Color('#3b5a1f'), c1 = new THREE.Color('#8aa64a'), c = new THREE.Color();
  for (let i = 0; i < blades; i++) {
    const a = R() * TAU, lean = 0.15 + R() * 0.35, h = 0.55 + R() * 0.45, w = 0.025 + R() * 0.015;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz * w, sz = dx * w;
    const tip = [dx * lean * h, h, dz * lean * h];
    pos.push(-sx, 0, -sz, sx, 0, sz, ...tip);
    c.copy(c0); col.push(c.r, c.g, c.b, c.r, c.g, c.b); c.copy(c0).lerp(c1, 0.6 + R() * 0.4); col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  // normals pointing up-ish read better for thin blades lit from any side
  const n = g.attributes.normal; for (let i = 0; i < n.count; i++) { const y = n.getY(i); n.setXYZ(i, n.getX(i) * 0.4, Math.abs(y) * 0.4 + 0.8, n.getZ(i) * 0.4); }
  g.attributes.normal.needsUpdate = true; g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.count * 2), 2));
  return g;
}
// a lumpy shrub (darker inside, lighter crown)
export function shrubGeometry(seed = 5, detail = 1) {
  const R = rng(seed), g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  const bumps = Array.from({ length: 7 }, () => new THREE.Vector3(R() - 0.5, R() * 0.6, R() - 0.5).normalize());
  const col = new Float32Array(p.count * 3), c0 = new THREE.Color('#1c3214'), c1 = new THREE.Color('#47662a'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize(); let k = 0.8; bumps.forEach((b) => { k += Math.max(0, v.dot(b) - 0.55) * 0.9; });
    v.multiplyScalar(k); v.y = v.y * 0.7 + 0.45; p.setXYZ(i, v.x, Math.max(0, v.y), v.z);
    c.copy(c0).lerp(c1, Math.max(0, Math.min(1, v.y / 1.2)) * 0.8 + R() * 0.2); col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // soft, rounded shading (normals from the crown's centre, not the facets)
  const nn = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i) - 0.35, p.getZ(i)).normalize(); nn.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  return g;
}
// a casuarina (the island's shelter-belt tree): slim trunk, stacked drooping feathery cones
export function casuarinaGeometry(seed = 9) {
  const R = rng(seed), geos = [], h = 1;
  geos.push(tint(cyl(0.012, 0.025, 0.55, 5, [0, 0.275, 0]), '#4a3a2c'));
  for (let i = 0; i < 4; i++) {
    const y = 0.3 + i * 0.17, r = 0.2 - i * 0.04 + R() * 0.03;
    const c = new THREE.ConeGeometry(r, 0.32, 7, 1, true); c.translate(0, y + 0.16, 0);
    geos.push(tint(c, ['#1e3219', '#243c1e', '#2a4423', '#304c28'][i]));
  }
  return merge(geos).scale(1, h, 1);
}

// camera-centred stars that can fade toward (and below) the horizon
export function makeStarfield(n = 5000, seed = 63) {
  const R = rng(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = 900;
    pos.set([s * Math.cos(a) * r, u * r, s * Math.sin(a) * r], i * 3);
    const b = Math.pow(R(), 3.0) * 1.7 + 0.05, w = R();
    col.set([b * (0.9 + w * 0.15), b * 0.97, b * (1.1 - w * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const u = { uOpacity: { value: 1 }, uHorizon: { value: 0 }, uSize: { value: 1.7 }, uPix: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `attribute vec3 color; uniform float uHorizon, uSize, uPix; varying vec3 vC;
      void main(){ vec3 d = normalize(position); float h = uHorizon > 0.0 ? smoothstep(uHorizon * 0.02, uHorizon * 0.35, d.y) : 1.0;
        vC = color * h; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize * uPix; }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(vC * a * uOpacity, 1.0); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -900; p.userData.u = u;
  return p;
}

// ------------------------------------------------------------------ launch billows: ground cloud thrown out by the exhaust (pure function of uT)
// Puffs leave the pad along the ground (optionally in two lobes, as from a flame trench), slow, swell and rise;
// lit by the sky/sun from one side and by the fire from below while young.
export function makeBillow(n, { t0 = 0, t1 = 1, seed = 5, lobes = 0, speed = [4, 22], rise = [0.5, 5], size = [1.2, 3.2] } = {}) {
  const R = rng(seed), aA = new Float32Array(n * 4), aB = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let th = R() * TAU;
    if (lobes && R() < 0.75) th = (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.9;
    aA.set([th, speed[0] + Math.pow(R(), 0.8) * (speed[1] - speed[0]), rise[0] + Math.pow(R(), 1.5) * (rise[1] - rise[0]), size[0] + R() * (size[1] - size[0])], i * 4);
    aB.set([t0 + (t1 - t0) * Math.pow((i + R()) / n, 1.3), R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(aA, 4)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
  const u = {
    uT: { value: 0 }, uViewport: { value: 800 }, uSun: { value: V3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#ffffff') }, uAmb: { value: new THREE.Color('#303844') },
    uFire: { value: new THREE.Color('#ffa050') }, uFireK: { value: 1 }, uK: { value: 1 }, uGrow: { value: 1 }, uSpread: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `attribute vec4 aA; attribute vec4 aB; uniform float uT, uViewport, uFireK, uK, uGrow, uSpread; uniform vec3 uSun, uSunCol, uAmb, uFire;
      varying vec3 vCol; varying float vA;
      void main(){
        float age = uT - aB.x;
        if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); return; }
        float r = 0.6 + aA.y * uSpread * (1.0 - exp(-1.6 * age)) / 1.6;
        float y = 0.3 + aA.z * (1.0 - exp(-0.9 * age)) * (0.3 + 0.05 * r) + 0.4 * aB.w * age;
        float a = aA.x + 0.12 * sin(age * 2.0 + aB.w * 6.28);
        vec4 w = modelMatrix * vec4(cos(a) * r, y, sin(a) * r, 1.0);
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        float sz = aA.w * uGrow * (0.45 + sqrt(age) * 1.5) * (0.7 + 0.03 * r);
        gl_PointSize = min(sz * uViewport * 0.5 * projectionMatrix[1][1] / max(0.1, -mv.z), 320.0);
        vec3 rad = normalize(vec3(cos(a), 0.6, sin(a)));
        float lit = 0.35 + 0.65 * max(dot(rad, normalize(uSun)), 0.0);
        float top = smoothstep(0.0, 8.0, y);
        float hot = exp(-age * 2.2) * exp(-r * 0.05);
        float dist = length(vec2(r, y));
        vCol = uAmb * (0.45 + 1.1 * aB.y) * (0.7 + 0.6 * lit) + uSunCol * lit * top + uFire * uFireK * (hot * 1.6 + 2.0 * exp(-dist * 0.085) * (0.6 + 0.4 * aB.y));
        vA = smoothstep(0.0, 0.06, age) * (0.45 + 0.45 * aB.z) * uK;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.1, d); a *= a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * (1.0 - 0.35 * d), a); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.u = u;
  return p;
}

// ------------------------------------------------------------------ lunar touchdown dust: flat radial sheets under the engines + a bloom on touchdown
export function makeLunarDust(n, { tEmit0, tLand, seed = 23, altAt }) {
  const R = rng(seed), NB = Math.floor(n * 0.3), NS = n - NB;
  const aP = new Float32Array(n * 4), aO = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const bloom = i >= NS;
    const t0 = bloom ? tLand + R() * 0.07 : tEmit0 + (tLand - tEmit0) * Math.sqrt(R());
    const near = bloom ? 1 : Math.max(0, 1 - altAt(t0) / 7);
    const th = R() * TAU;
    const v = bloom ? 1.0 + R() * 4.0 : (4 + R() * 12) * (0.5 + 0.5 * near);
    const vy = bloom ? 0.3 + R() * 1.2 : 0.1 + R() * 0.8;
    const r0 = bloom ? 0.5 + R() * 1.6 : 0.8 + R() * 1.8;
    aP.set([th, v, t0, vy], i * 4);
    aO.set([r0, (bloom ? 0.12 + R() * 0.2 : 0.06 + R() * 0.1) * (bloom ? 1 : 0.6 + near * 0.6), bloom ? 1 : 0, R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aP', new THREE.BufferAttribute(aP, 4)); g.setAttribute('aO', new THREE.BufferAttribute(aO, 4));
  const u = { uTime: { value: 0 }, uViewport: { value: 800 }, uOpacity: { value: 1 }, uLand: { value: tLand }, uSun: { value: V3(1, 0, 0) } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `attribute vec4 aP; attribute vec4 aO; uniform float uTime, uViewport, uLand; uniform vec3 uSun; varying float vA; varying float vL;
      void main(){
        float age = uTime - aP.z;
        if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vL = 0.0; return; }
        float r = aO.x + aP.y * age;
        float y = max(0.03, aP.w * age - 0.81 * age * age) + 0.03;
        vec3 p = vec3(cos(aP.x) * r, y, sin(aP.x) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        bool bloom = aO.z > 0.5;
        float fade = bloom ? exp(-age * 2.4) : exp(-age * 2.6) * (1.0 - smoothstep(uLand + 0.04, uLand + 0.4, uTime));
        vA = fade * smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(9.0, 20.0, r)) * (bloom ? 0.09 : 0.2);
        vL = 0.55 + 0.45 * max(dot(normalize(vec3(cos(aP.x), 0.3, sin(aP.x))), normalize(uSun)), 0.0);
        gl_PointSize = aO.y * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z) * (bloom ? 1.0 + age * 1.6 : 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uOpacity; varying float vA; varying float vL;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA * uOpacity; if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.8, 0.77, 0.72) * vL, a); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.u = u;
  return p;
}

// ------------------------------------------------------------------ planets
// The Moon (moonshot's crater shader) + an M3-style false-colour water/hydroxyl overlay at high latitudes,
// painted in by a pushbroom scan line (uScan: −1 → 1 along the object's x axis).
const MOON_WATER_FRAG = MOON_FRAG
  .replace('c3 = craters(p * 21.0 + 7.7);', 'c3 = craters(p * 31.0 + 7.7);')
  .replace('(c1.y + c2.y * 0.6 + c3.y * 0.3) * 0.18', '(c1.y * 0.12 + c2.y * 0.5 + c3.y * 0.3) * 0.18')
  .replace('uniform float uBump, uGain;', 'uniform float uBump, uGain, uWater, uScan, uTime;')
  .replace('gl_FragColor = vec4(col * uGain, 1.0);', `
  float lat = abs(p.y);
  float pol = smoothstep(0.84, 0.92, lat + 0.05 * snoise(p * 5.0));
  float patchy = smoothstep(-0.3, 0.3, snoise(p * 8.0) * 0.5 + snoise(p * 21.0) * 0.3 + snoise(p * 47.0) * 0.15 + pol * 0.25);
  float scan = 1.0 - smoothstep(uScan - 0.02, uScan + 0.04, p.x);
  float edge = exp(-pow((p.x - uScan) / 0.015, 2.0)) * step(0.5, lat);
  float w = pol * patchy * scan * uWater;
  vec3 blue = vec3(0.08, 0.42, 1.0);
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  col *= vec3(1.12, 1.0, 0.8);                       // neutral grey under the film's cool grade
  col = mix(col, vec3(0.0, 0.32, 1.0) * (lum * 2.1 + 0.04 * body), w);
  col += vec3(0.4, 0.75, 1.0) * edge * uWater * 0.35 * (0.3 + body) * smoothstep(0.7, 0.85, lat);
  gl_FragColor = vec4(col * uGain, 1.0);`);
export function moonWaterMesh(radius, sun, segs = 128) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uBump: { value: radius * 0.4 }, uGain: { value: 1 }, uWater: { value: 0 }, uScan: { value: -1.2 }, uTime: { value: 0 } },
    vertexShader: PLANET_VERT, fragmentShader: MOON_WATER_FRAG,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, segs, Math.round(segs * 0.7)), mat);
}

// Mars: rust plains, dark albedo provinces, a canyon scar, craters, a north polar cap, dusty limb haze.
const MARS_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform vec3 uSun; uniform float uBump, uGain;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float craters(vec3 p){
  vec3 i = floor(p), f = fract(p); float h = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash33(i + g);
    vec3 r = g + 0.15 + o * 0.7 - f; float rad = 0.08 + 0.26 * o.x * o.x * o.x; float q = length(r) / rad;
    if (q < 1.6 && o.y > 0.45) { float bowl = q < 1.0 ? (q * q - 1.0) : 0.0; float rim = exp(-pow((q - 1.0) / 0.25, 2.0)); h += (bowl * 0.6 + rim * 0.3) * rad; }
  }
  return h;
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * snoise(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
void main(){
  vec3 p = normalize(vL);
  float dark = smoothstep(0.0, 0.5, fbm(p * 1.6 + vec3(2.0, 0.5, 1.0)) + 0.3 * snoise(p * 6.0) + 0.15 * snoise(p * 17.0));
  float bright = smoothstep(0.1, 0.6, fbm(p * 2.3 + vec3(7.0, 1.0, 3.0)));
  // canyon scar: a long trough along the equator over one hemisphere
  float lon = atan(p.z, p.x);
  float canyon = exp(-pow((p.y + 0.12 + 0.05 * sin(lon * 3.0)) / 0.025, 2.0)) * smoothstep(0.2, 0.6, sin(lon - 0.4)) * (0.6 + 0.4 * snoise(p * 20.0));
  float h = craters(p * 4.0) * 0.5 + craters(p * 11.0 + 2.0) * 0.22 + fbm(p * 7.0) * 0.03 - canyon * 0.2;
  vec3 rust = vec3(0.66, 0.24, 0.085), ochre = vec3(0.8, 0.42, 0.19), umber = vec3(0.28, 0.11, 0.05);
  vec3 alb = mix(rust, ochre, bright * 0.7);
  alb = mix(alb, umber, dark * 0.8);
  alb = mix(alb, umber * 0.7, canyon);
  alb *= 0.9 + 0.1 * snoise(p * 26.0) + 0.06 * snoise(p * 90.0);
  float cap = smoothstep(0.86, 0.92, p.y + 0.03 * snoise(p * 12.0));
  alb = mix(alb, vec3(0.95, 0.93, 0.9), cap);
  vec3 N = normalize(vN);
  vec3 dpdx = dFdx(vW), dpdy = dFdy(vW);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 R1 = cross(dpdy, N), R2 = cross(N, dpdx); float det = dot(dpdx, R1);
  vec3 grad = sign(det) * (dhx * R1 + dhy * R2);
  N = normalize(abs(det) * N - grad * uBump);
  vec3 L = normalize(uSun), V = normalize(cameraPosition - vW);
  float ndl = max(dot(N, L), 0.0);
  float body = smoothstep(-0.05, 0.12, dot(normalize(vN), L));
  vec3 col = alb * pow(ndl, 0.8) * body * 1.75;
  float mu = max(dot(normalize(vN), V), 0.0);
  col += vec3(0.95, 0.5, 0.3) * pow(1.0 - mu, 4.0) * smoothstep(-0.2, 0.4, dot(normalize(vN), L)) * 0.22;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;
const HAZE_FRAG = /* glsl */ `
uniform vec3 uSun, uColor; uniform float uI;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){ vec3 N = normalize(vN), V = normalize(cameraPosition - vW); float f = pow(1.0 - abs(dot(N, V)), 4.0);
  float day = smoothstep(-0.25, 0.45, dot(N, normalize(uSun))); gl_FragColor = vec4(uColor * uI * day, f * day); }`;
export function marsMesh(radius, sun, segs = 128) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uBump: { value: radius * 0.14 }, uGain: { value: 1 } }, vertexShader: PLANET_VERT, fragmentShader: MARS_FRAG });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, Math.round(segs * 0.7)), mat);
  const haze = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uColor: { value: new THREE.Color('#ff9a6a') }, uI: { value: 0.7 } },
    vertexShader: PLANET_VERT, fragmentShader: HAZE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
  }));
  g.add(body, haze); g.userData.mat = mat;
  return g;
}

// ================================================================== set dressing (metres); the hero hardware is in isro-hardware.js

// coconut palm (silhouette-grade: tapered ringed trunk, drooping pinnate fronds, a nut cluster)
export function palmGeometry(seed = 1, h = 9) {
  const R = rng(seed), geos = [];
  const lean = (R() - 0.5) * 0.5 + 0.18, dir = R() * TAU;
  const lx = Math.cos(dir) * lean * h * 0.35, lz = Math.sin(dir) * lean * h * 0.35;
  const top = V3(lx, h, lz);
  const curve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(lx * 0.15, h * 0.35, lz * 0.15), V3(lx * 0.55, h * 0.72, lz * 0.55), top]);
  geos.push(tubeAlong(curve, (u) => (0.24 * (1 - 0.4 * u)) * (1 + 0.06 * Math.sin(u * 160)) + (u < 0.05 ? (0.05 - u) * 2 : 0), 30, 7));
  // fronds
  const pos = [], NF = 15 + Math.floor(R() * 4);
  const tmp = V3(), side = V3(), up = V3(0, 1, 0);
  for (let f = 0; f < NF; f++) {
    const a = (f / NF) * TAU + R() * 0.3, el = 0.75 - R() * 0.75, L = 3.6 + R() * 1.4;
    const d0 = V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
    side.crossVectors(d0, up).normalize();
    const pts = [];
    for (let i = 0; i <= 14; i++) { const s = i / 14; const p = top.clone().addScaledVector(d0, s * L); p.y -= (s * L) * (s * L) * 0.13 * (1.3 - el * 0.4); pts.push(p); }
    for (let i = 1; i < 14; i++) {
      const s = i / 14, p = pts[i], tan = tmp.subVectors(pts[i + 1], pts[i - 1]).normalize();
      const ll = 0.95 * Math.sin(Math.PI * Math.min(1, s * 1.1)) + 0.12;
      for (const sd of [-1, 1]) {
        const tip = p.clone().addScaledVector(side, sd * ll * 0.9).addScaledVector(tan, ll * 0.45); tip.y -= ll * 0.3;
        const b = p.clone().addScaledVector(tan, 0.09);
        pos.push(p.x, p.y, p.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
      }
    }
    for (let i = 0; i < 14; i++) {                       // rachis as a thin strip
      const a0 = pts[i], a1 = pts[i + 1], w = 0.03 * (1 - i / 14) + 0.01;
      pos.push(a0.x - side.x * w, a0.y, a0.z - side.z * w, a0.x + side.x * w, a0.y, a0.z + side.z * w, a1.x, a1.y, a1.z);
    }
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.computeVertexNormals();
  // colours: ringed grey-brown trunk, fronds from deep green to sun-yellowed tips (older, lower fronds drier), green nuts
  tint(geos[0], '#6a5a48');
  { const cA = new THREE.Color('#2f6a1e'), cB = new THREE.Color('#7fa33a'), cD = new THREE.Color('#a0903e'), c = new THREE.Color(), n = pos.length / 3, colA = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const y = pos[i * 3 + 1], dy = Math.max(0, Math.min(1, (top.y - y) / 3)), j = Math.floor(i / 9);
      c.copy(cA).lerp(cB, ((j * 7919) % 13) / 13 * 0.6 + (i % 3 === 2 ? 0.25 : 0)).lerp(cD, dy * dy * 0.7); colA.set([c.r, c.g, c.b], i * 3); }
    fg.setAttribute('color', new THREE.BufferAttribute(colA, 3)); }
  geos.push(fg);
  for (let i = 0; i < 7; i++) { const a = R() * TAU; geos.push(tint(bake(new THREE.SphereGeometry(0.13, 8, 6), [top.x + Math.cos(a) * 0.22, top.y - 0.3 - R() * 0.2, top.z + Math.sin(a) * 0.22]), '#6f7d2c')); }
  return merge(geos);
}

// the church by the shore (the first station's office): nave, front gable, a small belfry with a cross
export function churchGeometry() {
  const g = [];
  g.push(box(7, 4.6, 13, [0, 2.3, 0]));
  const roof = new THREE.Shape(); roof.moveTo(-3.8, 0); roof.lineTo(3.8, 0); roof.lineTo(0, 2.6); roof.closePath();
  const rg = new THREE.ExtrudeGeometry(roof, { depth: 13.4, bevelEnabled: false }); rg.translate(0, 4.6, -6.7); g.push(rg);
  const fac = new THREE.Shape(); fac.moveTo(-4, 0); fac.lineTo(4, 0); fac.lineTo(4, 5.2); fac.lineTo(2.2, 5.2); fac.lineTo(0, 8.4); fac.lineTo(-2.2, 5.2); fac.lineTo(-4, 5.2); fac.closePath();
  const fg = new THREE.ExtrudeGeometry(fac, { depth: 0.6, bevelEnabled: false }); fg.translate(0, 0, 6.5); g.push(fg);
  g.push(box(1.2, 1.6, 0.8, [0, 9.1, 6.8]));
  g.push(box(0.12, 1.3, 0.12, [0, 10.5, 6.8]), box(0.7, 0.12, 0.12, [0, 10.7, 6.8]));
  return merge(g);
}

// a bicycle (rocket parts famously went to the pad this way) with a nose cone tied to the carrier
export function bicycleGeometry() {
  const g = [], r = 0.34;
  for (const x of [-0.52, 0.52]) {
    g.push(bake(new THREE.TorusGeometry(r, 0.018, 6, 32), [x, r, 0]));
    for (let i = 0; i < 6; i++) g.push(rod(V3(x, r, 0), V3(x + Math.cos(i * 1.047) * r, r + Math.sin(i * 1.047) * r, 0), 0.004, 3));
  }
  const BB = V3(0, 0.3, 0), SEAT = V3(-0.14, 0.86, 0), HEAD = V3(0.38, 0.88, 0), RH = V3(-0.52, r, 0), FH = V3(0.52, r, 0);
  [[BB, SEAT], [BB, HEAD], [SEAT, HEAD], [BB, RH], [SEAT, RH], [HEAD, FH], [HEAD, V3(0.34, 1.02, 0)]].forEach(([a, b]) => g.push(rod(a, b, 0.016, 5)));
  g.push(rod(V3(0.34, 1.02, -0.26), V3(0.34, 1.02, 0.26), 0.014, 5));
  g.push(box(0.24, 0.05, 0.1, [-0.15, 0.9, 0]));
  g.push(box(0.4, 0.03, 0.18, [-0.42, 0.74, 0]), rod(V3(-0.6, 0.74, 0), RH, 0.01, 3));
  g.push(bake(lathe([[0.1, 0], [0.1, 0.3], [0.07, 0.55], [0.03, 0.72], [0.001, 0.78]], 14), [-0.35, 0.86, 0], [0, 0, Math.PI / 2]));
  return merge(g);
}

// ------------------------------------------------------------------ lunar south-polar terrain (CPU heightfield, metres)
// Craters smaller than the local mesh spacing fade out with distance, so the far field and the horizon stay smooth.
export function southPoleField(seed = 31, { RM = 520 } = {}) {
  const r = rng(seed), craters = [];
  let tries = 0;
  while (craters.length < 190 && tries++ < 6000) {
    const R = 1.0 + Math.pow(r(), 3.0) * 24;
    const x = (r() - 0.5) * 300, z = (r() - 0.5) * 300;
    if (Math.hypot(x, z) < 9 + R * 1.6) continue;                    // the landing site
    if (Math.abs(x + 3) < 4 + R * 1.4 && z > 0 && z < 40) continue;  // the camera's ground
    craters.push({ x, z, R, d: R * (0.2 + r() * 0.14) });
  }
  [[16, -14, 6], [-22, -8, 9], [30, 6, 12], [6, -34, 14], [-40, -38, 22], [46, -40, 26], [9, 16, 2.2], [-12, -16, 3.5]].forEach(([x, z, R]) => craters.push({ x, z, R, d: R * 0.3 }));
  const profile = (q) => (q < 1 ? q * q - 1 : 0) * 0.85 + Math.exp(-(((q - 1) / 0.26) ** 2)) * 0.32 + (q > 1 ? 0.1 * Math.exp(-(q - 1) * 2.2) : 0);
  const height = (x, z) => {
    const d = Math.hypot(x, z), minR = 0.6 + d * 0.035;
    let h = fbm2(x * 0.011 + 3.3, z * 0.011 - 1.7, 4) * 2.6 + fbm2(x * 0.06 + 5, z * 0.06, 3) * 0.35;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i], dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, lim = c.R * 2.4;
      if (d2 > lim * lim) continue;
      const k = Math.min(1, Math.max(0, (c.R - minR) / minR));
      if (k <= 0) continue;
      h += c.d * profile(Math.sqrt(d2) / c.R) * k;
    }
    return h;
  };
  const h0 = height(0, 0);
  return (x, z) => {
    const d = Math.hypot(x, z), flat = Math.exp(-((d / 8) ** 2));
    return height(x, z) * (1 - flat * 0.85) + h0 * flat * 0.85 - h0 - (d * d) / (2 * RM);
  };
}
