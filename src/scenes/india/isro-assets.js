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
import { PLANET_VERT, MOON_FRAG, mliTexture, crinkleTexture } from '../moonshot-assets.js';

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

// ------------------------------------------------------------------ textures
// square solar-cell grid: dark blue cells, silver interconnects
export function cellTexture(n = 12, seed = 4) {
  const r = rng(seed), S = 256, c = mkCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#9aa0aa'; g.fillRect(0, 0, S, S);
  const cw = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const l = r() * 12;
    g.fillStyle = `rgb(${26 + l},${42 + l},${104 + l * 1.4})`; g.fillRect(i * cw + 1, j * cw + 1, cw - 2, cw - 2);
    g.fillStyle = 'rgba(170,180,200,0.22)'; g.fillRect(i * cw + 1.5, j * cw + cw * 0.5, cw - 3, 1);
  }
  return toTexture(c, { repeat: true });
}
// long solar array: cells in a w×h grid
export function arrayTexture(cols = 16, rows = 8, seed = 6) {
  const r = rng(seed), W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#8e939c'; g.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const l = r() * 10;
    g.fillStyle = `rgb(${20 + l},${28 + l},${70 + l * 1.5})`; g.fillRect(i * cw + 1.2, j * ch + 1.2, cw - 2.4, ch - 2.4);
  }
  g.strokeStyle = '#c4c8cf'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
  return toTexture(c);
}
// gold MLI foil: large soft panels, crinkle glints, a couple of taped seams (near-white: the material sets the gold)
export function foilTexture(seed = 29) {
  const S = 256, r = rng(seed), c = mkCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = r() * S, y = r() * S, rad = 30 + r() * 90, l = r() > 0.5 ? 255 : 196;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${l},${l - 12},${l - 40},0.22)`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  for (let i = 0; i < 140; i++) {
    const x = r() * S, y = r() * S, a = r() * TAU, len = 6 + r() * 30;
    g.strokeStyle = r() > 0.5 ? 'rgba(255,250,230,0.45)' : 'rgba(120,96,60,0.3)'; g.lineWidth = 0.6 + r() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  g.fillStyle = 'rgba(150,120,70,0.35)'; g.fillRect(S * 0.5 - 1.5, 0, 3, S); g.fillRect(0, S * 0.62 - 1.5, S, 3);
  return toTexture(c, { repeat: true });
}

// tyre-tread dents for the rover tracks (r = depth)
export function treadTexture() {
  const c = mkCanvas(64, 256), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 16; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(6, i * 16 + 3, 52, 6); }
  return toTexture(c, { srgb: false, repeat: true });
}

// ------------------------------------------------------------------ shared materials
export function isroMaterials(env = null) {
  const crinkle = crinkleTexture(7, 256);
  const mli = mliTexture(256, 23); mli.repeat.set(2, 2);
  const cells = cellTexture();
  const foil = foilTexture();
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); if (env) m.envMap = env; return m; };
  return {
    white: std({ color: '#e8e6e1', roughness: 0.42, metalness: 0, vertexColors: true, envMapIntensity: 0.7 }),
    paint: std({ color: '#ffffff', roughness: 0.5, metalness: 0.05, vertexColors: true, envMapIntensity: 0.6 }),
    alu: std({ color: '#b9bcc1', roughness: 0.38, metalness: 0.7, envMapIntensity: 0.7 }),
    dark: std({ color: '#1c1d21', roughness: 0.55, metalness: 0.4, envMapIntensity: 0.5 }),
    nozzle: std({ color: '#3a3836', roughness: 0.45, metalness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    gold: std({ color: '#e8b552', map: foil, metalness: 0.42, roughness: 0.36, bumpMap: crinkle, bumpScale: 0.6, envMapIntensity: 1.0 }),
    goldDeep: std({ color: '#b07a2c', map: mli, metalness: 0.6, roughness: 0.42, bumpMap: crinkle, bumpScale: 2, envMapIntensity: 0.9 }),
    silver: std({ color: '#c9cdd3', metalness: 0.7, roughness: 0.34, bumpMap: crinkle, bumpScale: 1.8, envMapIntensity: 0.9 }),
    cells: std({ map: cells, color: '#ffffff', metalness: 0.3, roughness: 0.3, envMapIntensity: 1.2 }),
    array: std({ map: arrayTexture(), color: '#ffffff', metalness: 0.4, roughness: 0.3, envMapIntensity: 1.2, side: THREE.DoubleSide }),
    dish: std({ color: '#ecebe6', roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    bay: std({ color: '#141416', roughness: 0.8, metalness: 0.2 }),
    concrete: std({ color: '#8a8780', roughness: 0.92, metalness: 0, envMapIntensity: 0.4 }),
    steel: std({ color: '#6c6f74', roughness: 0.55, metalness: 0.6, envMapIntensity: 0.5 }),
    wheel: std({ color: '#9a9ca0', roughness: 0.45, metalness: 0.8, envMapIntensity: 0.7 }),
    ramp: std({ color: '#b4b3ae', roughness: 0.55, metalness: 0.25, envMapIntensity: 0.6 }),
  };
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
    col = sky(r) * fr * 0.85 + (uMode == 0 ? vec3(0.008, 0.012, 0.02) : vec3(0.003, 0.006, 0.012));
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
        vA = fade * smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(9.0, 20.0, r)) * (bloom ? 0.2 : 0.26);
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

// ================================================================== HARDWARE (metres)

// Nike-Apache two-stage sounding rocket, ~8.3 m: fat Nike booster with four big fins, slim Apache upper stage.
export function buildNikeApache(M) {
  const g = new THREE.Group();
  const W = '#e9e6df', GR = '#9c9c98', BK = '#26262a';
  const body = [];
  body.push(tint(lathe([[0.15, 0], [0.19, 0.1], [0.21, 0.16], [0.21, 3.5], [0.17, 3.62], [0.1, 3.75], [0.09, 3.78]], 24), W));
  body.push(tint(cyl(0.212, 0.212, 0.22, 24, [0, 1.2, 0]), BK));                // roll band
  body.push(tint(cyl(0.212, 0.212, 0.08, 24, [0, 3.0, 0]), GR));
  body.push(tint(lathe([[0.0825, 3.76], [0.0825, 7.35], [0.075, 7.55], [0.06, 7.8], [0.038, 8.05], [0.015, 8.26], [0.001, 8.3]], 20), W));
  body.push(tint(cyl(0.084, 0.084, 0.5, 20, [0, 6.95, 0]), '#c8c6c0'));         // payload section
  body.push(tint(cyl(0.084, 0.084, 0.12, 20, [0, 5.4, 0]), BK));
  // fins: clipped deltas on the booster, small ones on the Apache
  const fin = (root, tip, span, sweep, th) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, root); s.lineTo(span, sweep + tip); s.lineTo(span, sweep); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false }); geo.translate(0, 0, -th / 2); return geo;
  };
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    body.push(tint(bake(fin(1.05, 0.38, 0.62, 0.05, 0.02), [Math.cos(a) * 0.2, 0.12, -Math.sin(a) * 0.2], [0, a, 0]), W));
    body.push(tint(bake(fin(0.42, 0.14, 0.2, 0.06, 0.012), [Math.cos(a) * 0.08, 3.86, -Math.sin(a) * 0.08], [0, a, 0]), W));
  }
  const mesh = new THREE.Mesh(merge(body), M.paint); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  const noz = new THREE.Mesh(lathe([[0.15, 0.02], [0.13, -0.06], [0.11, -0.1]], 20), M.nozzle); g.add(noz);
  return { group: g, exit: V3(0, -0.1, 0), length: 8.3 };
}

// rail launcher: pedestal, trunnion, a long box-girder rail at the launch elevation
export function buildLauncher(M, elev) {
  const g = new THREE.Group();
  const parts = [];
  parts.push(box(2.2, 0.35, 2.2, [0, 0.175, 0]));
  parts.push(box(1.1, 0.9, 1.1, [0, 0.8, 0]));
  parts.push(box(0.3, 0.6, 0.9, [0, 1.45, 0]));
  const rail = new THREE.Group();
  const rparts = [box(0.22, 9.2, 0.18, [0, 4.0, -0.32])];
  for (let i = 0; i < 12; i++) rparts.push(box(0.36, 0.05, 0.36, [0, -0.3 + i * 0.75, -0.32]));
  rparts.push(beam(V3(0, -0.4, -0.32), V3(0, 2.2, -1.3), 0.08));
  const rmesh = new THREE.Mesh(merge(rparts), M.dark); rmesh.castShadow = true; rail.add(rmesh);
  rail.position.set(0, 1.6, 0); rail.rotation.x = -(Math.PI / 2 - elev); g.add(rail);
  // A-frame brace from the pedestal to the rail
  const top = V3(0, 1.6, 0).add(V3(0, 3.0, -0.32).applyAxisAngle(V3(1, 0, 0), rail.rotation.x));
  parts.push(beam(V3(-0.8, 0.35, -0.9), top, 0.07), beam(V3(0.8, 0.35, -0.9), top, 0.07));
  const pm = new THREE.Mesh(merge(parts), M.dark); pm.castShadow = true; pm.receiveShadow = true; g.add(pm);
  return { group: g, rail };
}

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
  geos.push(fg);
  for (let i = 0; i < 7; i++) { const a = R() * TAU; geos.push(bake(new THREE.SphereGeometry(0.13, 8, 6), [top.x + Math.cos(a) * 0.22, top.y - 0.3 - R() * 0.2, top.z + Math.sin(a) * 0.22])); }
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

// Aryabhata: a 26-faced polyhedron (rhombicuboctahedron), ~1.4 m across, solar cells on every face but top and bottom
export function buildAryabhata(M) {
  const g = new THREE.Group();
  const k = 1 + Math.SQRT2, verts = [];
  const perms = [[1, 1, k], [1, k, 1], [k, 1, 1]];
  for (const [a, b, c] of perms) for (const sa of [-1, 1]) for (const sb of [-1, 1]) for (const sc of [-1, 1]) verts.push(V3(a * sa, b * sb, c * sc));
  const normals = [];
  for (const ax of [V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)]) { normals.push(ax.clone(), ax.clone().negate()); }
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const si of [-1, 1]) for (const sj of [-1, 1]) { const n = V3(); n.setComponent(i, si); n.setComponent(j, sj); normals.push(n.normalize()); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) normals.push(V3(sx, sy, sz).normalize());
  const S = 0.7 / Math.sqrt(2 + k * k);
  const shell = [], cells = [], caps = [];
  for (const n of normals) {
    let mx = -1e9; for (const v of verts) mx = Math.max(mx, v.dot(n));
    const face = verts.filter((v) => Math.abs(v.dot(n) - mx) < 1e-4);
    const c = face.reduce((a, v) => a.add(v), V3()).multiplyScalar(1 / face.length);
    const u = V3().subVectors(face[0], c).normalize(), w = V3().crossVectors(n, u);
    face.sort((a, b) => Math.atan2(V3().subVectors(a, c).dot(w), V3().subVectors(a, c).dot(u)) - Math.atan2(V3().subVectors(b, c).dot(w), V3().subVectors(b, c).dot(u)));
    const poly = (scale, lift, uvK) => {
      const pos = [], uv = [], nn = [];
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        for (const p of [c, a, b]) {
          const q = V3().subVectors(p, c).multiplyScalar(scale).add(c).addScaledVector(n, lift).multiplyScalar(S);
          pos.push(q.x, q.y, q.z); nn.push(n.x, n.y, n.z);
          const d = V3().subVectors(p, c).multiplyScalar(scale);
          uv.push(0.5 + d.dot(u) * uvK, 0.5 + d.dot(w) * uvK);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return geo;
    };
    shell.push(poly(1, 0, 0.3));
    if (Math.abs(n.y) > 0.99) caps.push(poly(0.82, 0.03, 0.3));
    else cells.push(poly(0.86, 0.025, 0.36));
  }
  const add = (geos, mat) => { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(shell, M.alu); add(cells, M.cells); add(caps, M.dark);
  // a few small whip antennas round the base and a short mast on top
  const ant = [];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; ant.push(rod(V3(Math.cos(a) * 0.3, -0.62, Math.sin(a) * 0.3), V3(Math.cos(a) * 0.62, -0.95, Math.sin(a) * 0.62), 0.006, 4)); }
  ant.push(cyl(0.04, 0.04, 0.12, 10, [0, 0.74, 0]));
  add(ant, M.alu);
  return { group: g };
}

// PSLV-XL (44 m): four-stage core, six strap-ons, the bulbous payload fairing; white with grey stage bands.
export function buildPSLV(M) {
  const g = new THREE.Group();
  const W = '#ecebe6', G1 = '#a9a8a4', DK = '#3a3a3c';
  const prof = [[0.9, 0], [1.4, 0.4], [1.4, 20.2], [1.4, 33.4], [1.0, 34.2], [1.0, 37.4], [1.6, 38.4], [1.6, 41.4], [1.45, 42.4], [1.15, 43.3], [0.6, 44.1], [0.15, 44.4], [0.001, 44.42]];
  const core = lathe(prof, 40);
  const pos = core.attributes.position, col = new Float32Array(pos.count * 3), cw = new THREE.Color(W), cg = new THREE.Color(G1), cd = new THREE.Color(DK), tc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    tc.copy(cw);
    if ((y > 19.9 && y < 21.0) || (y > 33.3 && y < 34.3)) tc.copy(cg);
    if (y > 37.3 && y < 37.55) tc.copy(cd);
    if (y < 0.5) tc.copy(cd);
    col.set([tc.r, tc.g, tc.b], i * 3);
  }
  core.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const parts = [core];
  parts.push(tint(cyl(1.415, 1.415, 0.16, 40, [0, 8.0, 0]), G1), tint(cyl(1.415, 1.415, 0.16, 40, [0, 27.5, 0]), G1), tint(cyl(1.615, 1.615, 0.1, 40, [0, 40.2, 0]), G1));
  const strapR = 1.4 + 0.52;
  const straps = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6;
    const x = Math.cos(a) * strapR, z = Math.sin(a) * strapR;
    const s = lathe([[0.42, 0], [0.5, 0.35], [0.5, 12.0], [0.45, 12.7], [0.3, 13.4], [0.12, 13.85], [0.001, 13.95]], 20);
    const sp = s.attributes.position, sc = new Float32Array(sp.count * 3);
    for (let k = 0; k < sp.count; k++) { const y = sp.getY(k); tc.copy(y < 0.4 ? cd : (y > 5.9 && y < 6.15) ? cg : cw); sc.set([tc.r, tc.g, tc.b], k * 3); }
    s.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    parts.push(bake(s, [x, 0.5, z]));
    parts.push(tint(beam(V3(x * 0.84, 2.0, z * 0.84), V3(x * 0.74, 2.0, z * 0.74), 0.12), G1), tint(beam(V3(x * 0.84, 11.0, z * 0.84), V3(x * 0.74, 11.0, z * 0.74), 0.12), G1));
    straps.push(V3(x, 0.45, z));
  }
  const mesh = new THREE.Mesh(merge(parts), M.white); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh);
  const nz = [bake(lathe([[0.55, 0.2], [0.7, -0.4], [0.85, -1.0]], 24), [0, 0, 0])];
  for (const s of straps) nz.push(bake(lathe([[0.3, 0.1], [0.36, -0.3], [0.42, -0.7]], 16), [s.x, s.y, s.z]));
  g.add(new THREE.Mesh(merge(nz), M.nozzle));
  return { group: g, coreExit: V3(0, -1.0, 0), strapExits: straps.map((s) => V3(s.x, s.y - 0.7, s.z)) };
}

// launch complex: deck, umbilical tower with swing arms, lightning masts
export function buildPad(M) {
  const g = new THREE.Group();
  const deck = [box(34, 2.2, 30, [0, -1.1 - 1.0, 0])];
  deck.push(box(8, 0.6, 8, [0, -0.7, 0]));
  const dm = new THREE.Mesh(merge(deck), M.concrete); dm.receiveShadow = true; dm.castShadow = true; g.add(dm);
  // umbilical tower: a 6 × 6 m lattice, 52 m tall, west of the vehicle
  const T = [], TX = -9.5, S = 3, H = 52;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.push(beam(V3(TX + sx * S, -1, sz * S), V3(TX + sx * S, H, sz * S), 0.35));
  for (let y = 0; y < H; y += 3.25) {
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [ax, az] = c[i], [bx, bz] = c[(i + 1) % 4];
      T.push(beam(V3(TX + ax * S, y, az * S), V3(TX + bx * S, y, bz * S), 0.2));
      T.push(beam(V3(TX + ax * S, y, az * S), V3(TX + bx * S, y + 3.25, bz * S), 0.12));
    }
    if (Math.round(y / 3.25) % 3 === 1) T.push(box(7, 0.25, 7, [TX, y, 0]));
  }
  T.push(box(7.4, 3, 7.4, [TX, H + 1.5, 0]));
  for (const y of [12, 26, 36, 41]) T.push(box(6.2, 0.5, 1.4, [TX + 5.4, y, 0]), beam(V3(TX + 3, y - 2.2, 0), V3(TX + 6.5, y - 0.2, 0), 0.18));
  const tm = new THREE.Mesh(merge(T), M.steel); tm.castShadow = true; tm.receiveShadow = true; g.add(tm);
  // lightning masts
  const L = [];
  for (const [x, z, h] of [[-52, -34, 76], [50, -46, 76]]) {
    L.push(cyl(0.3, 0.85, h, 8, [x, h / 2 - 1, z]));
    L.push(cyl(0.06, 0.06, 6, 4, [x, h + 2, z]));
  }
  const lm = new THREE.Mesh(merge(L), M.steel); lm.castShadow = true; g.add(lm);
  const lamps = [];
  for (let y = 6; y < H; y += 9.75) lamps.push(V3(TX + S + 0.2, y, -S - 0.2), V3(TX + S + 0.2, y, S + 0.2));
  return { group: g, lamps, towerX: TX };
}

// a dish antenna (paraboloid + rim + feed on a tripod), opening toward +Y, base at y = 0
export function dishGeometry(r, depth) {
  const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push([r * u, depth * u * u]); }
  return lathe(pts, 36);
}
function feedGeos(r, depth, f) {
  const g = [];
  for (let i = 0; i < 3; i++) { const a = i * TAU / 3; g.push(rod(V3(Math.cos(a) * r * 0.9, depth * 0.85, Math.sin(a) * r * 0.9), V3(0, f, 0), r * 0.012, 4)); }
  g.push(cyl(r * 0.07, r * 0.05, r * 0.14, 12, [0, f, 0]));
  return g;
}

// Chandrayaan-1 orbiter: a ~1.5 m cuboid bus in gold foil, one solar wing on a yoke, a boom-mounted dish
export function buildChandrayaan1(M) {
  const g = new THREE.Group();
  const add = (geos, mat) => { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add([box(1.5, 1.5, 1.5, [0, 0, 0])], M.gold);
  add([box(1.52, 0.04, 1.52, [0, 0.77, 0]), box(0.5, 0.25, 0.4, [-0.3, 0.9, 0.3]), box(0.35, 0.3, 0.35, [0.35, 0.92, -0.25]), cyl(0.12, 0.12, 0.35, 12, [0.4, 0.95, 0.4])], M.silver);
  add([box(0.04, 1.0, 0.9, [-0.77, 0.05, 0])], M.dark);
  // solar wing on +x
  const wing = new THREE.Group(); wing.position.set(0.76, 0, 0); g.add(wing);
  const wy = new THREE.Mesh(merge([rod(V3(0, 0, 0), V3(0.9, 0, 0), 0.03, 6), rod(V3(0.9, 0, -0.5), V3(0.9, 0, 0.5), 0.02, 4)]), M.alu); wing.add(wy);
  const panel = new THREE.Mesh(box(2.15, 0.035, 1.8, [0.9 + 1.075, 0, 0]), M.array); panel.castShadow = true; wing.add(panel);
  // high-gain dish on a boom from −x
  const boom = new THREE.Mesh(merge([rod(V3(-0.75, -0.2, 0), V3(-1.5, -0.6, 0), 0.025, 6)]), M.alu); g.add(boom);
  const dish = new THREE.Group(); dish.position.set(-1.55, -0.62, 0); dish.rotation.z = Math.PI / 2 + 0.4; g.add(dish);
  dish.add(new THREE.Mesh(dishGeometry(0.36, 0.1), M.dish), new THREE.Mesh(merge(feedGeos(0.36, 0.1, 0.25)), M.alu));
  return { group: g, wing };
}

// Mars Orbiter Mission: a gold-foil cuboid bus, a 2.2 m dish on top, one three-panel solar wing, the main engine below
export function buildMOM(M) {
  const g = new THREE.Group();
  const add = (geos, mat, parent = g) => { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  add([box(1.5, 1.5, 1.5, [0, 0, 0])], M.gold);
  add([box(1.52, 0.04, 1.52, [0, 0.77, 0]), box(1.52, 0.04, 1.52, [0, -0.77, 0]), box(0.3, 0.3, 0.3, [0.5, -0.9, 0.5]), box(0.04, 0.9, 1.0, [0, 0, 0.77])], M.silver);
  add([cyl(0.16, 0.2, 0.12, 16, [0, -0.83, 0]), box(0.05, 0.6, 0.6, [-0.77, 0.2, 0])], M.dark);
  // dish (2.2 m) on a short pedestal on top
  const dish = new THREE.Group(); dish.position.set(0, 0.95, 0); g.add(dish);
  dish.add(new THREE.Mesh(dishGeometry(1.1, 0.28), M.dish));
  add(feedGeos(1.1, 0.28, 0.82), M.alu, dish);
  add([cyl(0.12, 0.16, 0.2, 12, [0, 0.83, 0])], M.alu);
  // single solar wing (+x): three panels
  const wing = new THREE.Group(); wing.position.set(0.76, 0, 0); g.add(wing);
  add([rod(V3(0, 0, 0), V3(0.5, 0, 0), 0.03, 6)], M.alu, wing);
  for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(box(1.4, 0.035, 1.75, [0.5 + 0.72 + i * 1.44, 0, 0]), M.array); m.castShadow = true; wing.add(m); }
  // main engine (liquid apogee motor) and a few thrusters
  const noz = new THREE.Mesh(lathe([[0.07, 0], [0.1, -0.12], [0.16, -0.32], [0.2, -0.46]], 20), M.nozzle); noz.position.y = -0.88; g.add(noz);
  add([0, 1, 2, 3].map((i) => { const a = i * Math.PI / 2 + Math.PI / 4; return cyl(0.03, 0.05, 0.1, 8, [Math.cos(a) * 0.68, -0.82, Math.sin(a) * 0.68]); }), M.nozzle);
  return { group: g, exit: V3(0, -1.34, 0), wing, dish };
}

// Vikram lander (Chandrayaan-3): 2 × 2 × 1.17 m gold-foil box, four legs, four engines below, a side solar panel,
// and a ramp (two hinged segments) folded across the rover bay on +x. Origin: centre of the body's underside.
export const VIKRAM = { legDrop: 0.875, bayFloor: 0.02, rampLen: 0.95 };
export function buildVikram(M) {
  const g = new THREE.Group();
  const add = (geos, mat, parent = g) => { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const BH = 1.17, BY = 0.02, BT = 0.79;   // body height; bay floor; bay top
  // body around the bay (x 0.15…1, z ±0.47, y 0.02…0.79)
  add([
    box(1.15, BH, 2, [-0.425, BH / 2, 0]),
    box(0.85, BH - BT, 2, [0.575, (BH + BT) / 2, 0]),
    box(0.85, BT, 0.53, [0.575, BT / 2, 0.735]), box(0.85, BT, 0.53, [0.575, BT / 2, -0.735]),
  ], M.gold);
  add([box(0.85, 0.02, 0.94, [0.575, 0.01, 0]), box(0.02, BT, 0.94, [0.16, BT / 2, 0]), box(0.85, 0.02, 0.94, [0.575, BT - 0.01, 0])], M.bay);
  // top deck: silver foil, a radiator, instrument boxes, a small dish on a mast
  add([box(2.02, 0.04, 2.02, [0, BH + 0.02, 0]), box(0.5, 0.18, 0.4, [-0.5, BH + 0.13, 0.5]), box(0.36, 0.26, 0.3, [0.45, BH + 0.17, -0.55])], M.silver);
  add([cyl(0.12, 0.12, 0.2, 12, [0.55, BH + 0.14, 0.55])], M.dish);
  add([box(0.9, 0.05, 0.7, [-0.4, BH + 0.065, -0.45])], M.dish);
  add([cyl(0.03, 0.03, 0.35, 8, [-0.6, BH + 0.2, -0.65])], M.alu);
  const dsh = new THREE.Mesh(dishGeometry(0.22, 0.06), M.dish); dsh.position.set(-0.6, BH + 0.38, -0.65); dsh.rotation.set(0.4, 0, 0.5); g.add(dsh);
  // side solar panel on −z, and one on −x
  add([box(1.8, 0.95, 0.04, [0, 0.62, -1.03]), box(0.04, 0.95, 1.6, [-1.03, 0.62, 0])], M.array);
  // engines: four nozzles near the corners of the underside
  const nz = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) nz.push(bake(lathe([[0.06, 0], [0.08, -0.08], [0.12, -0.2], [0.14, -0.26]], 16), [sx * 0.55, 0, sz * 0.55]));
  add(nz, M.nozzle);
  add([box(1.6, 0.06, 1.6, [0, -0.03, 0])], M.silver);
  // legs
  const L = [], pads = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const foot = V3(sx * 1.42, -0.85, sz * 1.42), knee = V3(sx * 1.25, -0.35, sz * 1.25);
    L.push(rod(V3(sx * 0.98, 0.45, sz * 0.98), foot, 0.045, 8));
    L.push(rod(V3(sx * 0.98, 0.02, sz * 0.4), knee, 0.025, 6), rod(V3(sx * 0.4, 0.02, sz * 0.98), knee, 0.025, 6));
    pads.push(cyl(0.21, 0.17, 0.05, 18, [foot.x, -0.85, foot.z]));
  }
  add(L, M.alu); add(pads, M.silver);
  // ramp: segment A hinged at the bay floor edge (axis z), segment B hinged at A's far end
  const rampSeg = () => [box(VIKRAM.rampLen, 0.03, 0.86, [VIKRAM.rampLen / 2, 0.015, 0]), box(VIKRAM.rampLen, 0.06, 0.03, [VIKRAM.rampLen / 2, 0.06, 0.43]), box(VIKRAM.rampLen, 0.06, 0.03, [VIKRAM.rampLen / 2, 0.06, -0.43])];
  const rampA = new THREE.Group(); rampA.position.set(1.0, BY, 0); g.add(rampA);
  add(rampSeg(), M.ramp, rampA);
  const rampB = new THREE.Group(); rampB.position.set(VIKRAM.rampLen, 0, 0); rampA.add(rampB);
  add(rampSeg(), M.ramp, rampB);
  return { group: g, rampA, rampB, engines: [[-0.55, -0.55], [-0.55, 0.55], [0.55, -0.55], [0.55, 0.55]].map(([x, z]) => V3(x, -0.26, z)) };
}

// Pragyan rover: six wheels on rocker-bogies, a gold-foil body, one tilted solar panel, a navigation-camera mast.
// Origin: centre of the wheel contact patch; drives along +x.
export function buildPragyan(M) {
  const g = new THREE.Group();
  const add = (geos, mat, parent = g) => { const m = new THREE.Mesh(merge(geos), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  add([box(0.8, 0.24, 0.52, [0, 0.33, 0])], M.gold);
  add([box(0.82, 0.02, 0.54, [0, 0.46, 0])], M.silver);
  const panel = new THREE.Group(); panel.position.set(-0.38, 0.47, 0); panel.rotation.z = 0.42; g.add(panel);
  add([box(0.78, 0.02, 0.56, [0.39, 0.012, 0])], M.array, panel);
  add([cyl(0.015, 0.015, 0.24, 6, [0.34, 0.58, 0]), box(0.05, 0.03, 0.3, [0.34, 0.7, 0]), box(0.06, 0.06, 0.06, [0.36, 0.7, 0.12]), box(0.06, 0.06, 0.06, [0.36, 0.7, -0.12])], M.dark);
  const W = [], links = [];
  for (const sz of [-1, 1]) {
    for (const x of [-0.3, 0, 0.3]) W.push(bake(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18), [x, 0.1, sz * 0.34], [Math.PI / 2, 0, 0]));
    links.push(beam(V3(-0.3, 0.1, sz * 0.3), V3(-0.08, 0.27, sz * 0.3), 0.025), beam(V3(-0.08, 0.27, sz * 0.3), V3(0.3, 0.1, sz * 0.3), 0.025), beam(V3(0, 0.1, sz * 0.3), V3(0.12, 0.2, sz * 0.3), 0.02));
  }
  add(W, M.wheel); add(links, M.alu);
  return { group: g, gauge: 0.34 };
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
