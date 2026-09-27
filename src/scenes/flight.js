// FLIGHT & SPACE EXPLORATION (34.5 – 39.0 s)
// Technique: 2D→3D blueprint fold (one parametric airframe drives the plan / elevation /
// front drawings AND the 3D structure: the flattened plan-view wireframe literally
// extrudes into the aircraft before its brushed-aluminium skin sweeps on), a speed-ramped
// fly-over with vapour trails, sun-lit atmospheric particle clouds, a rocket launch with
// an HDR plume and a pure-function smoke trail, then planetary shading (procedural Earth,
// city lights, atmospheric rim) with orbital infographics and a station assembling in
// zero gravity.
import * as THREE from 'three';
import { CUES } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { GLSL_NOISE } from '../lib/noise.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { segmentsLine, progressLine, circlePoints } from '../lib/lines.js';
import { gridTexture, canvas as mkCanvas, toTexture, brushedMetalTexture } from '../lib/textures.js';
import { glowSprite } from '../lib/materials.js';
import { Dimension } from '../lib/hud.js';

const BP_LINE = '#d6e7ff';
const BP_DIM = '#8fb6ec';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ parametric airframe
// Generic 1930s-style twin-engine monoplane. Units: world metres/4. Nose points +X, span along Z.
const FUS_L = 4.2, FUS_R = 0.25;
function fusR(x) {
  const u = (x + FUS_L / 2) / FUS_L;
  if (u < 0 || u > 1) return 0;
  let r = u < 0.42 ? 0.1 + 0.9 * Math.pow(Math.sin((u / 0.42) * Math.PI / 2), 0.85) : 1;
  if (u > 0.84) r *= Math.sqrt(Math.max(0, 1 - ((u - 0.84) / 0.16) ** 2));
  return r * FUS_R;
}
const fusY = (x) => { const u = (x + FUS_L / 2) / FUS_L; return u < 0.42 ? (0.42 - u) ** 1.6 * 0.42 : 0; };
function airfoil(n = 14, t = 0.13) {
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const yc = 0.02 * (x < 0.4 ? (2 * 0.4 * x - x * x) / 0.16 : ((1 - 0.8) + 2 * 0.4 * x - x * x) / 0.36);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  return [...up, ...lo.slice(1, -1).reverse()]; // closed loop LE → upper → TE → lower → (LE)
}
const FOIL = airfoil();
// Lifting surface stations: { le: [x,y,z], chord, plane: 'h'|'v' }
function wingStations(side) {
  const out = [];
  for (let i = 0; i <= 10; i++) {
    const s = i / 10, z = side * (FUS_R * 0.6 + s * 2.35);
    out.push({ le: [0.42 - s * 0.24, -0.13 + s * 2.35 * 0.08, z], chord: lerp(0.98, 0.42, s), plane: 'h' });
  }
  return out;
}
function stabStations(side) {
  const out = [];
  for (let i = 0; i <= 5; i++) { const s = i / 5; out.push({ le: [-1.52 - s * 0.2, 0.12, side * (0.08 + s * 0.85)], chord: lerp(0.52, 0.26, s), plane: 'h' }); }
  return out;
}
function finStations() {
  const out = [];
  for (let i = 0; i <= 6; i++) { const s = i / 6; out.push({ le: [-1.42 - s * 0.36, 0.2 + s * 0.72, 0], chord: lerp(0.66, 0.3, s), plane: 'v' }); }
  return out;
}
function sectionPoints(st) {
  return FOIL.map(([u, v]) => {
    const x = st.le[0] - u * st.chord;
    return st.plane === 'h' ? V3(x, st.le[1] + v * st.chord, st.le[2]) : V3(x, st.le[1], st.le[2] + v * st.chord);
  });
}
// Loft a surface through sections (indexed, with UVs).
function loft(stations, cap = true) {
  const secs = stations.map(sectionPoints), m = secs[0].length, n = secs.length;
  const pos = [], uv = [], idx = [];
  secs.forEach((sec, j) => sec.forEach((p, i) => { pos.push(p.x, p.y, p.z); uv.push(i / m, j / (n - 1)); }));
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < m; i++) {
    const a = j * m + i, b = j * m + ((i + 1) % m), c = (j + 1) * m + i, d = (j + 1) * m + ((i + 1) % m);
    idx.push(a, c, b, b, c, d);
  }
  if (cap) {
    const last = secs[n - 1], base = pos.length / 3, cx = last.reduce((s, p) => s.add(p), V3(0, 0, 0)).multiplyScalar(1 / m);
    pos.push(cx.x, cx.y, cx.z); uv.push(0.5, 1);
    for (let i = 0; i < m; i++) idx.push((n - 1) * m + i, base, (n - 1) * m + ((i + 1) % m));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Tube through rings with an offset centre line (fuselage, nacelles).
function ringTube(x0, x1, rFn, yFn, zc = 0, yc = 0, nx = 48, nr = 32) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= nx; j++) {
    const x = lerp(x0, x1, j / nx), r = Math.max(rFn(x), 0.0005), y = yFn(x) + yc;
    for (let i = 0; i <= nr; i++) { const a = (i / nr) * TAU; pos.push(x, y + Math.cos(a) * r, zc + Math.sin(a) * r); uv.push(j / nx * 3, i / nr); }
  }
  for (let j = 0; j < nx; j++) for (let i = 0; i < nr; i++) {
    const a = j * (nr + 1) + i, b = a + 1, c = a + nr + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const NAC_Z = 0.98, NAC_Y = -0.05, NAC_X0 = -0.28, NAC_X1 = 0.98, NAC_R = 0.15;
const nacR = (x) => { const u = (x - NAC_X0) / (NAC_X1 - NAC_X0); return NAC_R * (u > 0.8 ? Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) * 0.6 + 0.4 : u < 0.3 ? 0.35 + 0.65 * Math.sin((u / 0.3) * Math.PI / 2) : 1); };

// Structural wireframe segments (frames, longerons, ribs, spars) — the blueprint AND the 3D build.
function airframeSegments() {
  const segs = [];
  const push = (a, b) => segs.push([a, b]);
  // fuselage frames + longerons
  const NR = 28;
  for (let k = 0; k <= 18; k++) {
    const x = -FUS_L / 2 + 0.05 + (k / 18) * (FUS_L - 0.1), r = fusR(x), y = fusY(x);
    for (let i = 0; i < NR; i++) {
      const a0 = (i / NR) * TAU, a1 = ((i + 1) / NR) * TAU;
      push(V3(x, y + Math.cos(a0) * r, Math.sin(a0) * r), V3(x, y + Math.cos(a1) * r, Math.sin(a1) * r));
    }
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let k = 0; k < 40; k++) {
      const x0 = -FUS_L / 2 + (k / 40) * FUS_L, x1 = -FUS_L / 2 + ((k + 1) / 40) * FUS_L;
      push(V3(x0, fusY(x0) + Math.cos(a) * fusR(x0), Math.sin(a) * fusR(x0)), V3(x1, fusY(x1) + Math.cos(a) * fusR(x1), Math.sin(a) * fusR(x1)));
    }
  }
  // lifting surfaces: ribs + leading/trailing edges + spars
  const surf = (stations) => {
    const secs = stations.map(sectionPoints), m = secs[0].length;
    secs.forEach((sec) => { for (let i = 0; i < m; i++) push(sec[i], sec[(i + 1) % m]); });
    for (const i of [0, 3, Math.floor(m / 4), Math.floor(m / 2), Math.floor(m * 0.75)]) for (let j = 0; j < secs.length - 1; j++) push(secs[j][i], secs[j + 1][i]);
  };
  surf(wingStations(1)); surf(wingStations(-1)); surf(stabStations(1)); surf(stabStations(-1)); surf(finStations());
  // nacelles + propeller discs
  for (const side of [1, -1]) {
    const zc = side * NAC_Z;
    for (let k = 0; k <= 6; k++) {
      const x = lerp(NAC_X0 + 0.02, NAC_X1 - 0.02, k / 6), r = nacR(x);
      for (let i = 0; i < 20; i++) { const a0 = (i / 20) * TAU, a1 = ((i + 1) / 20) * TAU; push(V3(x, NAC_Y + Math.cos(a0) * r, zc + Math.sin(a0) * r), V3(x, NAC_Y + Math.cos(a1) * r, zc + Math.sin(a1) * r)); }
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; for (let k = 0; k < 12; k++) { const x0 = lerp(NAC_X0, NAC_X1, k / 12), x1 = lerp(NAC_X0, NAC_X1, (k + 1) / 12); push(V3(x0, NAC_Y + Math.cos(a) * nacR(x0), zc + Math.sin(a) * nacR(x0)), V3(x1, NAC_Y + Math.cos(a) * nacR(x1), zc + Math.sin(a) * nacR(x1))); } }
    const px = NAC_X1 + 0.03;
    for (let i = 0; i < 36; i++) { const a0 = (i / 36) * TAU, a1 = ((i + 1) / 36) * TAU; push(V3(px, NAC_Y + Math.cos(a0) * 0.46, zc + Math.sin(a0) * 0.46), V3(px, NAC_Y + Math.cos(a1) * 0.46, zc + Math.sin(a1) * 0.46)); }
    for (let b = 0; b < 3; b++) { const a = (b / 3) * TAU + 0.3; push(V3(px, NAC_Y, zc), V3(px, NAC_Y + Math.cos(a) * 0.44, zc + Math.sin(a) * 0.44)); }
  }
  return segs;
}

function airframeMeshes(mats) {
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(ringTube(-FUS_L / 2, FUS_L / 2, fusR, fusY, 0, 0, 72, 40), mats.skin);
  for (const s of [1, -1]) { add(loft(wingStations(s)), mats.skin); add(loft(stabStations(s)), mats.skin); }
  add(loft(finStations()), mats.skin);
  const props = [];
  for (const side of [1, -1]) {
    add(ringTube(NAC_X0, NAC_X1, nacR, () => 0, side * NAC_Z, NAC_Y, 24, 24), mats.skin);
    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), mats.dark); spinner.scale.set(1.6, 1, 1); spinner.position.set(NAC_X1 + 0.03, NAC_Y, side * NAC_Z); g.add(spinner);
    const prop = new THREE.Group(); prop.position.copy(spinner.position); g.add(prop);
    for (let b = 0; b < 3; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.44, 0.06), mats.dark);
      blade.geometry.translate(0, 0.24, 0);
      const holder = new THREE.Group(); holder.rotation.x = (b / 3) * TAU; blade.rotation.y = 0.35; holder.add(blade); prop.add(holder);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.47, 48), mats.disc); disc.rotation.y = Math.PI / 2; prop.add(disc);
    props.push(prop);
  }
  // cabin windows + windshield
  const win = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.06, 0.02), mats.glass, 22);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 11; i++) for (const s of [1, -1]) {
    const x = -0.95 + i * 0.2, r = fusR(x);
    m4.makeRotationY(0).setPosition(x, 0.06, s * (r * 0.97));
    win.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4);
  }
  g.add(win);
  const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, 0.5), mats.glass);
  ws.scale.set(0.2, 0.12, 0.2); ws.rotation.z = -1.0; ws.position.set(1.52, 0.1, 0); g.add(ws);
  g.userData.props = props;
  return g;
}

// Skin reveal (object space, nose → tail) with a hot scan edge.
function withReveal(mat, edge = '#bfe0ff') {
  const u = { uReveal: { value: -10 }, uEdge: { value: new THREE.Color(edge) } };
  mat.userData.reveal = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vRevX;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 rvp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rvp = instanceMatrix * rvp;
        #endif
        vRevX = rvp.x;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRevX; uniform float uReveal; uniform vec3 uEdge;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (vRevX < uReveal) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uEdge * 5.0 * (1.0 - smoothstep(0.0, 0.1, vRevX - uReveal));');
  };
  mat.customProgramCacheKey = () => 'flight-reveal';
  return mat;
}

// ------------------------------------------------------------------ soft particle material
const SOFT_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; attribute float aRot;
uniform float uViewport, uNear;
varying float vAlpha; varying vec3 vColor; varying float vRot;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z), 900.0);
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
function puffTexture(seed = 1) {
  const S = 128, c = mkCanvas(S), g = c.getContext('2d'), R = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (R() - 0.5) * S * 0.45, y = S / 2 + (R() - 0.5) * S * 0.4, r = S * (0.12 + R() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4, r = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    d[i + 3] = Math.min(255, d[i + 3] * 1.6) * smoothstep(1.0, 0.65, r);
  }
  g.putImageData(img, 0, 0);
  const t = toTexture(c, { srgb: false });
  return t;
}
class SoftPoints extends THREE.Points {
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

// ------------------------------------------------------------------ Earth
const EARTH_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform vec3 uSun; uniform float uTime, uRadius;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 p = normalize(vL);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(uSun);
  float c = fbm(p * 1.35 + vec3(3.1, 0.0, 1.7)) + 0.12 * snoise(p * 7.0);
  float land = smoothstep(0.035, 0.07, c);
  float coast = smoothstep(0.0, 0.035, c) * (1.0 - land);
  float lat = abs(p.y);
  float ice = smoothstep(0.8, 0.9, lat + 0.06 * snoise(p * 9.0));
  float arid = smoothstep(0.0, 0.5, snoise(p * 2.2 + 5.0)) * (1.0 - smoothstep(0.2, 0.55, lat));
  vec3 ocean = mix(vec3(0.004, 0.018, 0.05), vec3(0.01, 0.05, 0.085), coast);
  vec3 ground = mix(vec3(0.035, 0.055, 0.025), vec3(0.13, 0.095, 0.05), arid);
  ground *= 0.8 + 0.4 * snoise(p * 18.0);
  vec3 surf = mix(ocean, ground, land);
  surf = mix(surf, vec3(0.75, 0.8, 0.85), ice);
  float cl = smoothstep(0.08, 0.55, fbm(p * 2.6 + vec3(uTime * 0.02, 0.0, 0.0)) + 0.1 * snoise(p * 12.0));
  float ndl = dot(N, L);
  float day = smoothstep(-0.12, 0.3, ndl);
  vec3 col = surf * day * 2.2;
  col = mix(col, vec3(0.85, 0.88, 0.92) * day * 1.6, cl * 0.85);
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, H), 0.0), 70.0) * (1.0 - land) * (1.0 - cl) * day * 1.6;
  col += vec3(1.0, 0.42, 0.16) * exp(-pow(ndl / 0.1, 2.0)) * 0.12 * (1.0 - cl * 0.5);
  // night side: city lights clustered on land
  vec3 q = p * 150.0; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
  float h = hash3(cell);
  float cluster = smoothstep(0.0, 0.35, snoise(p * 5.0 + 2.0)) * land * (1.0 - ice);
  float dotm = smoothstep(0.3, 0.05, length(f)) * step(0.72 - cluster * 0.35, h) * cluster;
  float night = 1.0 - smoothstep(-0.2, 0.05, ndl);
  col += vec3(1.0, 0.62, 0.3) * dotm * night * (1.0 - cl * 0.8) * 3.5;
  col += vec3(1.0, 0.6, 0.3) * cluster * night * 0.02;
  // limb darkening + atmospheric haze toward the rim
  float rim = 1.0 - max(dot(N, V), 0.0);
  col = mix(col, vec3(0.25, 0.5, 1.0) * day * 0.9, pow(rim, 3.0) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uPower, uIntensity; uniform vec3 uColor;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(N, V)), uPower);
  float day = smoothstep(-0.35, 0.4, dot(N, normalize(uSun)));
  gl_FragColor = vec4(uColor * uIntensity * (0.15 + day), f * (0.1 + day));
}`;

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tBp = cue('blueprint'), tFold = cue('aircraftFold'), tFly = cue('flyby'), tCloud = cue('clouds'), tRocket = cue('rocketLaunch'), tEarth = cue('earthWide');
  const DUR = segment.end - segment.start;
  const tSwitch = tEarth - 0.08;               // world A (atmosphere) → world B (orbit), under the staging flash
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 2000);
  const R = rng(3504);

  // ================================================================ WORLD A — blueprint → sky
  const worldA = new THREE.Group(); scene.add(worldA);
  const sun = new THREE.DirectionalLight('#fff2de', 3.2); sun.position.set(-3, 9, 6); scene.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 });
  const fill = new THREE.HemisphereLight('#9cc4ff', '#0a1420', 0.5); scene.add(fill);

  // sky dome: blueprint void → high-altitude sky
  const SUN_DIR = V3(0.82, 0.2, -0.54).normalize();
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uMix: { value: 0 }, uSun: { value: SUN_DIR }, uSpace: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `uniform float uMix, uSpace; uniform vec3 uSun; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float h = d.y;
        vec3 zen = mix(vec3(0.02, 0.06, 0.16), vec3(0.002, 0.006, 0.02), uSpace);
        vec3 hor = mix(vec3(0.42, 0.52, 0.66), vec3(0.05, 0.12, 0.3), uSpace);
        vec3 sky = mix(hor, zen, pow(smoothstep(-0.05, 0.7, h), 0.6));
        sky = mix(sky, vec3(0.08, 0.1, 0.14), smoothstep(0.0, -0.3, h));
        float s = max(dot(d, normalize(uSun)), 0.0);
        sky += vec3(1.0, 0.8, 0.55) * (pow(s, 8.0) * 0.6 + pow(s, 64.0) * 1.5) * (1.0 - uSpace * 0.6);
        vec3 bp = vec3(0.004, 0.012, 0.03);
        gl_FragColor = vec4(mix(bp, sky, uMix), 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
  sky.renderOrder = -10;
  worldA.add(sky);
  const sunGlow = glowSprite({ color: '#fff0d8', intensity: 5, scale: 60 });
  worldA.add(sunGlow);

  // --- blueprint sheet
  const sheet = new THREE.Group(); worldA.add(sheet);
  const sheetBase = new THREE.Mesh(new THREE.PlaneGeometry(15, 8.6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#0b2a52').multiplyScalar(0.55), transparent: true }));
  sheetBase.rotation.x = -Math.PI / 2; sheetBase.position.y = -0.01; sheet.add(sheetBase);
  const gridTex = gridTexture({ cells: 16, sub: 5 }).clone(); gridTex.needsUpdate = true; gridTex.repeat.set(15 / 4, 8.6 / 4);
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, color: new THREE.Color('#7fb2ff').multiplyScalar(0.32), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(15, 8.6), gridMat); grid.rotation.x = -Math.PI / 2; sheet.add(grid);
  const border = segmentsLine([[V3(-7.2, 0, -4.1), V3(7.2, 0, -4.1)], [V3(7.2, 0, -4.1), V3(7.2, 0, 4.1)], [V3(7.2, 0, 4.1), V3(-7.2, 0, 4.1)], [V3(-7.2, 0, 4.1), V3(-7.2, 0, -4.1)],
    [V3(2.4, 0, 2.2), V3(7.2, 0, 2.2)], [V3(2.4, 0, 2.2), V3(2.4, 0, 4.1)], [V3(2.4, 0, 3.1), V3(7.2, 0, 3.1)], [V3(5.2, 0, 3.1), V3(5.2, 0, 4.1)]],
  { color: BP_LINE, intensity: 0.8, stagger: 0.3, seed: 3 });
  border.position.y = 0.005; sheet.add(border);

  const segs = airframeSegments();
  const orderX = (a, b) => 0.6 * (1 - ((a.x + b.x) / 2 + 2.3) / 4.6);   // nose → tail
  const mkWire = (intensity = 0.95) => segmentsLine(segs, { color: BP_LINE, headColor: '#ffffff', intensity, orderFn: orderX, stagger: 0.6, head: 0.05 });
  const A0 = V3(-1.8, 0.0, 1.0);
  // plan view: the real 3D structure, flattened (scale.y → 0); it extrudes during the fold
  const planHolder = new THREE.Group(); planHolder.position.copy(A0); worldA.add(planHolder);
  const planWire = mkWire(1.0); planHolder.add(planWire);
  // elevation (side) view: aircraft rotated so its side lies on the sheet, hinged so it can stand up
  const sideHinge = new THREE.Group(); sideHinge.position.set(-1.8, 0.01, -2.35); worldA.add(sideHinge);
  const sideFlat = new THREE.Group(); sideFlat.scale.y = 0.001; sideHinge.add(sideFlat);
  const sideRot = new THREE.Group(); sideRot.rotation.x = Math.PI / 2; sideRot.position.z = -0.55; sideFlat.add(sideRot);
  const sideWire = mkWire(0.8); sideRot.add(sideWire);
  // front view: span along sheet X, height along sheet Z
  const frontFlat = new THREE.Group(); frontFlat.position.set(4.7, 0.01, -0.3); frontFlat.scale.y = 0.001; worldA.add(frontFlat);
  const frontRot = new THREE.Group(); frontRot.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1)); frontFlat.add(frontRot);
  const frontWire = mkWire(0.75); frontRot.add(frontWire);
  // dimensions + annotations lying on the sheet
  const anno = new THREE.Group(); anno.rotation.x = -Math.PI / 2; anno.position.y = 0.01; worldA.add(anno);  // anno local (x, y) = sheet (x, -z)
  const dims = [
    new Dimension(V3(-4.3, -1.0 + 2.55, 0), V3(-4.3, -1.0 - 2.55, 0), 'SPAN 20.4 M', { color: BP_DIM, size: 0.13, tick: 0.12, intensity: 1.0 }),
    new Dimension(V3(-3.9, 3.35, 0), V3(0.3, 3.35, 0), 'LENGTH 16.8 M', { color: BP_DIM, size: 0.13, tick: 0.12, intensity: 1.0 }),
    new Dimension(V3(2.25, -0.7, 0), V3(7.1, -0.7, 0), 'TRACK 7.8 M', { color: BP_DIM, size: 0.11, tick: 0.1, intensity: 0.9 }),
  ];
  dims.forEach((d) => anno.add(d));
  const label = (txt, x, y, h = 0.15, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, height: h, letterSpacing: 0.16, color: BP_LINE, intensity: 1.0, ...o }); tp.position.set(x + tp.worldWidth / 2, y, 0); anno.add(tp); return tp; };
  const labels = [
    label('FIG. 1 — PLAN', -3.9, -3.95 + 8.0 - 3.55, 0.15),
    label('FIG. 2 — ELEVATION', -3.9, 3.95, 0.15),
    label('FIG. 3 — FRONT', 2.5, 1.55, 0.15),
    label('GENERAL ARRANGEMENT', 2.6, -2.62, 0.2, { weight: 500 }),
    label('TWIN-ENGINE MONOPLANE · ALL-METAL STRESSED SKIN', 2.6, -2.9, 0.1, { intensity: 0.7 }),
    label('SCALE 1:48', 2.6, -3.6, 0.13),
    label('SHEET 1 / 4', 5.4, -3.6, 0.13),
    label('AIRFOIL 13% · DIHEDRAL 5°', -3.9, -3.9, 0.11, { intensity: 0.75 }),
  ];
  // center lines (dash-dot)
  const cl = [];
  for (let i = 0; i < 26; i++) { const x = -4.4 + i * 0.2; if (i % 3 !== 2) cl.push([V3(x, 0.006, 1.0), V3(x + 0.14, 0.006, 1.0)]); }
  for (let i = 0; i < 30; i++) { const z = -1.9 + i * 0.2; if (i % 3 !== 2) cl.push([V3(-1.8 + 0.4, 0.006, z), V3(-1.8 + 0.4, 0.006, z + 0.14)]); }
  const centerLines = segmentsLine(cl, { color: BP_DIM, intensity: 0.6, stagger: 0.5, seed: 9 });
  worldA.add(centerLines);

  // --- the aircraft
  const skinMat = withReveal(new THREE.MeshStandardMaterial({ color: '#dfe5ec', metalness: 1, roughness: 0.26, map: brushedMetalTexture(), roughnessMap: brushedMetalTexture(), envMapIntensity: 1.2 }));
  const darkMat = withReveal(new THREE.MeshStandardMaterial({ color: '#23262b', metalness: 0.7, roughness: 0.35 }));
  const glassMat = withReveal(new THREE.MeshStandardMaterial({ color: '#05080c', metalness: 0.2, roughness: 0.05, envMapIntensity: 2 }));
  const discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#aab4c0').multiplyScalar(0.25), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const plane = new THREE.Group(); worldA.add(plane);
  const planeBody = airframeMeshes({ skin: skinMat, dark: darkMat, glass: glassMat, disc: discMat });
  plane.add(planeBody);
  const revealMats = [skinMat, darkMat, glassMat];
  const props = planeBody.userData.props;

  // vapour trails from the wingtips (analytic path history)
  const TRAIL_N = 220;
  const trails = new SoftPoints(TRAIL_N * 2, { map: puffTexture(4), near: 0.6 });
  worldA.add(trails);

  // --- clouds: layered sun-lit particle deck
  const CLOUD_N = 1100;
  const clouds = new SoftPoints(CLOUD_N, { map: puffTexture(7), near: 2.5 });
  const cloudData = [];
  for (let i = 0; i < CLOUD_N; i++) {
    const layer = i < 700 ? 0 : 1;
    const y = layer === 0 ? 3.5 + R() * 5.5 : 11 + R() * 1.6;
    cloudData.push({ x: -10 + R() * 90, y, z: -60 + R() * 70, s: layer === 0 ? 3 + R() * 6 : 2 + R() * 3, a: layer === 0 ? 0.35 + R() * 0.3 : 0.12 + R() * 0.12, rot: R() * TAU, layer, top: layer === 0 ? (y - 3.5) / 5.5 : 1 });
  }
  worldA.add(clouds);
  // ice-crystal glints above the deck
  const glints = new SoftPoints(700, { map: puffTexture(11), additive: true, near: 0.3 });
  const glintData = [];
  for (let i = 0; i < 700; i++) glintData.push({ x: -5 + R() * 50, y: 6 + R() * 12, z: -25 + R() * 30, s: 0.05 + R() * 0.08, ph: R() * TAU });
  worldA.add(glints);

  // --- rocket
  const rocket = new THREE.Group(); worldA.add(rocket);
  const paint = new THREE.MeshStandardMaterial({ color: '#e9edf1', roughness: 0.42, metalness: 0.15 });
  const band = new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.5, metalness: 0.4 });
  const addR = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; rocket.add(m); return m; };
  addR(new THREE.CylinderGeometry(0.24, 0.24, 2.0, 32), paint, 1.0);
  addR(new THREE.CylinderGeometry(0.245, 0.245, 0.12, 32), band, 1.7);
  addR(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 32), band, 2.1);
  addR(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 32), paint, 2.7);
  const ogive = []; for (let i = 0; i <= 16; i++) { const u = i / 16; ogive.push(new THREE.Vector2(0.205 * Math.sqrt(1 - u * u), u * 0.8)); }
  addR(new THREE.LatheGeometry(ogive, 32), paint, 3.2);
  addR(new THREE.CylinderGeometry(0.12, 0.2, 0.3, 24, 1, true), band, -0.12);
  const finShape = new THREE.Shape(); finShape.moveTo(0, 0); finShape.lineTo(0.28, -0.1); finShape.lineTo(0.28, 0.12); finShape.lineTo(0, 0.55); finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.025, bevelEnabled: false }); finGeo.translate(0.22, 0.05, -0.012);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(finGeo, band); f.rotation.y = (i / 4) * TAU + Math.PI / 4; rocket.add(f); }
  const plumeMat = (col, inten, alpha) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(col) }, uI: { value: inten }, uA: { value: alpha }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${GLSL_NOISE}
      uniform vec3 uColor; uniform float uI, uA, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float along = 1.0 - vUv.y; float n = 0.75 + 0.25 * snoise(vec3(vUv.x * 6.0, vUv.y * 5.0 + uTime * 30.0, 0.0));
        float a = facing * pow(1.0 - along, 1.6) * n * uA;
        gl_FragColor = vec4(uColor * uI * (0.6 + 0.8 * (1.0 - along)), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const plumeCore = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.02, 1.6, 24, 1, true), plumeMat('#fff4dc', 7, 1)); plumeCore.geometry.translate(0, -0.8, 0); plumeCore.position.y = -0.25; rocket.add(plumeCore);
  const plumeOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 3.6, 24, 1, true), plumeMat('#ffb070', 3, 0.7)); plumeOuter.geometry.translate(0, -1.8, 0); plumeOuter.position.y = -0.2; rocket.add(plumeOuter);
  const nozzleGlow = glowSprite({ color: '#ffd9a8', intensity: 6, scale: 2.4 }); nozzleGlow.position.y = -0.5; rocket.add(nozzleGlow);
  const stageFlash = glowSprite({ color: '#fff6e8', intensity: 10, scale: 1 }); worldA.add(stageFlash);
  const rocketLight = new THREE.PointLight('#ffb070', 0, 30, 1.5); rocket.add(rocketLight); rocketLight.position.y = -1.2;
  const SMOKE_N = 1400, smoke = new SoftPoints(SMOKE_N, { map: puffTexture(21), near: 0.8 });
  const smokeData = [];
  for (let i = 0; i < SMOKE_N; i++) smokeData.push({ e: i / SMOKE_N, dx: R() - 0.5, dz: R() - 0.5, s: 0.6 + R() * 0.8, rot: R() * TAU, sh: R() });
  worldA.add(smoke);
  const PAD = V3(34, 0, -22);
  const rocketY = (t) => { const tau = t - (tRocket - 0.6); return tau < 0 ? -4 + tau : 2 + 18 * tau + 16 * tau * tau; };

  // ================================================================ WORLD B — orbit
  const E = V3(0, -3000, 0);
  const worldB = new THREE.Group(); worldB.position.copy(E); scene.add(worldB);
  const SUN_B = V3(-1, 0.22, 0.42).normalize();
  const sunB = new THREE.DirectionalLight('#ffffff', 3.4); sunB.position.copy(E).addScaledVector(SUN_B, 100); sunB.target.position.copy(E); scene.add(sunB, sunB.target);
  const earthR = 10;
  const earthMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN_B }, uTime: { value: 0 }, uRadius: { value: earthR } }, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(earthR, 160, 100), earthMat);
  const earthTilt = new THREE.Group(); earthTilt.rotation.z = 0.41; earthTilt.add(earth); worldB.add(earthTilt);
  const atmoMat = (power, inten, col, side) => new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN_B }, uPower: { value: power }, uIntensity: { value: inten }, uColor: { value: new THREE.Color(col) } }, vertexShader: EARTH_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(earthR * 1.012, 96, 64), atmoMat(2.6, 1.6, '#5f9cff', THREE.FrontSide));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(earthR * 1.05, 96, 64), atmoMat(4.5, 1.3, '#4a8cff', THREE.BackSide));
  worldB.add(atmo, halo);
  // stars
  const starN = 2200, starPos = new Float32Array(starN * 3), starCol = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = 400;
    starPos.set([s * Math.cos(a) * r, u * r, s * Math.sin(a) * r], i * 3);
    const b = Math.pow(R(), 3) * 1.6 + 0.08; starCol.set([b, b, b * 1.1], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3)); starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  worldB.add(stars);
  // orbital trajectories + satellites
  const orbits = [[13.2, 0.35, 0.2], [14.6, 1.05, 1.3], [16.4, -0.55, 2.4], [18.8, 0.18, -0.7]].map(([r, inc, node], i) => {
    const holder = new THREE.Group(); holder.rotation.set(inc, node, 0); worldB.add(holder);
    const line = progressLine(circlePoints(r, 256, { plane: 'xz' }), { color: i === 1 ? '#cfe8ff' : '#8fbaf0', headColor: '#ffffff', intensity: 0.85, head: 0.02 });
    holder.add(line);
    const sat = glowSprite({ color: '#e6f2ff', intensity: 3, scale: 0.7 }); holder.add(sat);
    const tickSegs = []; for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU; tickSegs.push([V3(Math.cos(a) * r, 0, Math.sin(a) * r), V3(Math.cos(a) * r, 0.12, Math.sin(a) * r)]); }
    const ticks = segmentsLine(tickSegs, { color: '#8fbaf0', intensity: 0.5, orderFn: (a, b, k) => k / 48 * 0.8, stagger: 0.8 });
    holder.add(ticks);
    return { holder, line, sat, ticks, r, w: 0.5 / Math.pow(r / 13, 1.5), ph: i * 1.7, t0: tEarth - 0.05 + i * 0.1 };
  });
  // ascent trail continuing from the launch (a thin bright streak leaving the planet)
  const ascentPts = [];
  for (let i = 0; i <= 80; i++) { const u = i / 80; const a = -0.9 + u * 1.3; const r = earthR * (1.0 + u * 0.3); ascentPts.push(V3(Math.cos(a) * r * 0.2 - 3, Math.sin(a) * r * 0.1 + 3.5 + u * 1.5, Math.sqrt(Math.max(0, r * r - 9 - 12)) * (0.96 + u * 0.05))); }
  const ascent = progressLine(ascentPts, { color: '#ffd7a8', headColor: '#ffffff', intensity: 2.2, head: 0.03, fade: 0.25 });
  worldB.add(ascent);
  // station assembling in zero gravity (camera-relative, co-orbiting)
  const station = new THREE.Group(); scene.add(station);
  const stSteel = new THREE.MeshStandardMaterial({ color: '#c9d0d8', metalness: 1, roughness: 0.3, map: brushedMetalTexture(), envMapIntensity: 0.6 });
  const stGold = new THREE.MeshStandardMaterial({ color: '#e0b25a', metalness: 1, roughness: 0.45, envMapIntensity: 0.6 });
  const cellCanvas = mkCanvas(256); { const g = cellCanvas.getContext('2d'); g.fillStyle = '#0c1a33'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#6f86a8'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(256, i * 32); g.stroke(); } }
  const panelMat = new THREE.MeshStandardMaterial({ map: toTexture(cellCanvas), color: '#8aa0c8', metalness: 0.8, roughness: 0.25, envMapIntensity: 1.2, side: THREE.DoubleSide });
  const parts = [];
  const part = (obj, from, dock, rot) => { station.add(obj); parts.push({ obj, home: obj.position.clone(), homeQ: obj.quaternion.clone(), from: V3(...from), dock, rot: V3(...rot) }); return obj; };
  const truss = new THREE.Group();
  { const L = 3.2; const bars = [];
    for (const [y, z] of [[0.07, 0.07], [0.07, -0.07], [-0.07, 0.07], [-0.07, -0.07]]) bars.push([V3(-L / 2, y, z), V3(L / 2, y, z)]);
    for (let i = 0; i <= 16; i++) { const x = -L / 2 + (i / 16) * L; bars.push([V3(x, 0.07, 0.07), V3(x, -0.07, -0.07)], [V3(x, 0.07, -0.07), V3(x, -0.07, 0.07)]); }
    for (const [a, b] of bars) { const len = a.distanceTo(b); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 6), stSteel); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize()); truss.add(m); } }
  part(truss, [0, 0, 0], tEarth + 0.0, [0, 0, 0]);
  const modA = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 32), stGold); modA.rotation.x = Math.PI / 2; modA.position.set(0, 0, 0.55);
  part(modA, [-0.8, 1.6, 2.8], tEarth + 0.15, [0.8, 1.2, 0]);
  const modB = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.7, 32), stSteel); modB.rotation.x = Math.PI / 2; modB.position.set(0, 0, -0.45);
  part(modB, [1.2, -1.4, -2.5], tEarth + 0.25, [-0.6, 0.5, 1.0]);
  [[-1.25, 1], [-1.25, -1], [1.25, 1], [1.25, -1]].forEach(([x, s], i) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 1.3), panelMat); p.position.set(x, 0, s * 0.78);
    part(p, [x * 2.2, (i % 2 ? -1 : 1) * 1.8, s * 3.2], tEarth + 0.3 + i * 0.07, [(i - 1.5) * 0.9, 0.7, 0.4]);
  });
  const dockFlashes = parts.map(() => { const g = glowSprite({ color: '#dff0ff', intensity: 3, scale: 0.35 }); station.add(g); return g; });

  // ================================================================ animation
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const planePos = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const camKeys = [
    [0.0, V3(0.9, 9.0, 7.6)], [0.6, V3(0.0, 7.6, 6.9)], [tFold, V3(-0.6, 5.6, 6.0)], [tFold + 0.35, V3(1.4, 2.6, 5.0)],
    [tFly, V3(5.2, 1.15, 2.6)], [tFly + 0.35, V3(6.4, 0.95, 1.7)], [tCloud, V3(7.8, 3.4, 1.2)], [tCloud + 0.3, V3(9.8, 7.4, 0.3)],
    [tRocket, V3(12.0, 11.6, -0.8)], [tRocket + 0.4, V3(14.0, 13.0, -2.2)], [tSwitch + 0.05, V3(15.4, 13.8, -3.2)],
  ];
  const camCurve = new THREE.CatmullRomCurve3(camKeys.map((k) => k[1]), false, 'centripetal');
  const camTK = camKeys.map((k, i) => [k[0], i / (camKeys.length - 1)]);
  const planeAt = (t, out) => {
    const lift = ramp(t, tFold, tFold + 0.45, ease.inOutCubic);
    out.set(A0.x, A0.y + lift * 1.1, A0.z);
    if (t > tFly) { const tau = t - tFly; out.x += 5.5 * tau + 30 * tau * tau; out.y += 0.6 * tau + 5 * tau * tau; out.z -= 0.6 * tau * tau; }
    return out;
  };
  const wingTip = V3(0, 0, 0);

  const api = {
    scene, camera,
    dof: { focus: 8, range: 4, amount: 0 },
    bloom: { strength: 0.7 },
    exposure: 1.0,
    background: 0x000000,
    update(t, info) {
      const inA = t < tSwitch;
      worldA.visible = inA; worldB.visible = !inA; station.visible = !inA;
      sun.visible = fill.visible = inA; sunB.visible = !inA;
      if (inA) this._worldA(t, info); else this._worldB(t, info);
    },
    _worldA(t, info) {
      // ---------------- camera
      camCurve.getPoint(clamp(timeWarp(t, camTK), 0, 1), camPos);
      planeAt(t, planePos);
      const shake = envelope(t, tFly + 0.2, tCloud + 0.1, 0.1, 0.25) * 0.035;
      camPos.x += Math.sin(t * 91) * shake; camPos.y += Math.sin(t * 67 + 1) * shake;
      // look: sheet → plan view → aircraft → sky/clouds → rocket
      look.set(0.2 - t * 0.5, 0, -0.1 + t * 0.4);
      tmp.copy(planePos).add(tmp2.set(0.3, 0.1, 0));
      look.lerp(tmp, ramp(t, tFold - 0.3, tFold + 0.3));
      const rY = rocketY(t);
      tmp.set(camPos.x + 14, camPos.y + 5 + (t - tCloud) * 6, camPos.z - 5);
      look.lerp(tmp, ramp(t, tFly + 0.28, tCloud + 0.1, ease.inOutSine));
      tmp.set(PAD.x, Math.max(rY, 9) + 1.5, PAD.z);
      look.lerp(tmp, ramp(t, tCloud + 0.35, tRocket + 0.15, ease.inOutSine));
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(look);
      camera.fov = 35 - ramp(t, tRocket, tSwitch) * 4 + envelope(t, tFly + 0.2, tCloud, 0.15, 0.2) * 6;
      camera.near = 0.05; camera.far = 2000;
      camera.updateProjectionMatrix();
      sky.position.copy(camPos);
      sunGlow.position.copy(camPos).addScaledVector(SUN_DIR, 700);

      // ---------------- sky / blueprint
      const skyMix = ramp(t, tFly - 0.1, tCloud - 0.1, ease.inOutSine);
      skyMat.uniforms.uMix.value = skyMix;
      skyMat.uniforms.uSpace.value = ramp(t, tRocket, tSwitch, ease.inQuad) * 0.7;
      sunGlow.material.opacity = skyMix;
      const sheetVis = 1 - ramp(t, tFly - 0.35, tFly + 0.15);
      sheet.visible = sheetVis > 0.001;
      sheetBase.material.opacity = sheetVis;
      gridMat.opacity = sheetVis * ramp(t, 0, 0.35);
      border.progress = ramp(t, 0.0, 0.5); border.opacity = sheetVis;
      const draw = ramp(t, 0.0, tFold - 0.1, ease.inOutSine);
      planWire.progress = ramp(t, 0.05, tBp + 0.55, ease.inOutSine);
      sideWire.progress = ramp(t, tBp - 0.1, tBp + 0.6, ease.inOutSine);
      frontWire.progress = ramp(t, tBp + 0.05, tBp + 0.7, ease.inOutSine);
      centerLines.progress = draw; centerLines.opacity = 0.8 * sheetVis;
      sideWire.opacity = sheetVis * (1 - ramp(t, tFold + 0.1, tFold + 0.45));
      frontWire.opacity = sheetVis * (1 - ramp(t, tFold, tFold + 0.35));
      sideHinge.rotation.x = -ramp(t, tFold, tFold + 0.4, ease.inOutCubic) * Math.PI / 2 * 0.9;   // elevation folds up off the sheet
      dims.forEach((d, i) => d.reveal(ramp(t, tBp + 0.15 + i * 0.12, tBp + 0.55 + i * 0.12), sheetVis * (1 - ramp(t, tFold, tFold + 0.3))));
      labels.forEach((l, i) => { const p = ramp(t, tBp + 0.1 + i * 0.05, tBp + 0.45 + i * 0.05); l.reveal = p; l.opacity = p > 0 ? sheetVis * (1 - ramp(t, tFold + 0.05, tFold + 0.35)) : 0; });

      // ---------------- fold: plan wire extrudes to 3D, skin sweeps on
      const extrude = ramp(t, tFold, tFold + 0.38, ease.inOutCubic);
      planHolder.position.copy(planePos);
      planHolder.scale.set(1, lerp(0.001, 1, extrude), 1);
      planWire.opacity = 1 - ramp(t, tFold + 0.4, tFly + 0.1);
      plane.position.copy(planePos);
      const bank = Math.sin(clamp((t - tFly) * 2.2, 0, Math.PI)) * 0.22;
      const pitch = ramp(t, tFly, tFly + 0.5) * 0.1;
      e.set(bank, 0, pitch); plane.quaternion.setFromEuler(e);
      planHolder.quaternion.copy(plane.quaternion);
      plane.scale.set(1, lerp(0.001, 1, extrude), 1);
      const reveal = lerp(2.4, -2.4, ramp(t, tFold + 0.22, tFly + 0.05, ease.inOutSine));
      for (const m of revealMats) m.userData.reveal.uReveal.value = reveal;
      plane.visible = t > tFold + 0.2;
      const spin = ramp(t, tFold + 0.4, tFly, ease.inQuad);
      props.forEach((p, i) => { p.rotation.x = t * (4 + spin * 40) + i; });
      discMat.opacity = spin * 0.5;
      sun.position.copy(planePos).add(tmp.set(-3, 9, 6)); sun.target.position.copy(planePos);
      sun.intensity = 3.2; fill.intensity = 0.5 + skyMix * 0.4;

      // ---------------- vapour trails
      const trailOn = ramp(t, tFly + 0.05, tFly + 0.3);
      trails.visible = trailOn > 0 && t < tRocket + 0.4;
      if (trails.visible) {
        for (let s = 0; s < 2; s++) for (let i = 0; i < TRAIL_N; i++) {
          const age = i * 0.006, ts = t - age, k = s * TRAIL_N + i;
          planeAt(Math.max(ts, tFly), tmp);
          wingTip.set(0.2, 0.05, (s ? -1 : 1) * 2.6);
          tmp.add(wingTip);
          tmp.y -= age * 0.3;
          trails.P[k * 3] = tmp.x; trails.P[k * 3 + 1] = tmp.y; trails.P[k * 3 + 2] = tmp.z;
          trails.S[k] = 0.08 + age * 1.6;
          trails.A[k] = trailOn * (ts > tFly ? 1 : 0) * (1 - i / TRAIL_N) * 0.55;
          trails.Rot[k] = i * 0.7;
        }
        trails.commit(info);
      }

      // ---------------- clouds
      const cloudOn = ramp(t, tFly + 0.05, tCloud - 0.05);
      clouds.visible = cloudOn > 0;
      if (clouds.visible) {
        for (let i = 0; i < CLOUD_N; i++) {
          const c = cloudData[i];
          const x = c.x + t * 1.2, y = c.y, z = c.z;
          clouds.P[i * 3] = x; clouds.P[i * 3 + 1] = y; clouds.P[i * 3 + 2] = z;
          clouds.S[i] = c.s;
          clouds.A[i] = c.a * cloudOn;
          clouds.Rot[i] = c.rot + t * 0.05;
          // sun-lit tops, blue-grey undersides, silver lining toward the sun
          tmp.set(x - camPos.x, y - camPos.y, z - camPos.z).normalize();
          const fwdScatter = Math.pow(Math.max(0, tmp.dot(SUN_DIR)), 6);
          const lit = 0.35 + 0.65 * c.top;
          clouds.C[i * 3] = (0.42 + lit * 0.62 + fwdScatter * 1.4);
          clouds.C[i * 3 + 1] = (0.47 + lit * 0.56 + fwdScatter * 1.15);
          clouds.C[i * 3 + 2] = (0.58 + lit * 0.45 + fwdScatter * 0.8);
        }
        clouds.commit(info);
      }
      glints.visible = t > tCloud - 0.1;
      if (glints.visible) {
        const g = ramp(t, tCloud - 0.1, tCloud + 0.3);
        for (let i = 0; i < glintData.length; i++) {
          const d = glintData[i];
          glints.P[i * 3] = d.x + t * 0.4; glints.P[i * 3 + 1] = d.y + Math.sin(t + d.ph) * 0.1; glints.P[i * 3 + 2] = d.z;
          glints.S[i] = d.s; glints.A[i] = g * (0.4 + 0.6 * Math.max(0, Math.sin(t * 7 + d.ph * 5)));
          glints.C[i * 3] = 1.6; glints.C[i * 3 + 1] = 1.5; glints.C[i * 3 + 2] = 1.3;
        }
        glints.commit(info);
      }

      // ---------------- rocket
      rocket.visible = t > tRocket - 0.6;
      rocket.position.set(PAD.x, rY, PAD.z);
      rocket.rotation.z = -ramp(t, tRocket, tSwitch) * 0.12;
      const flick = 0.85 + 0.15 * Math.sin(t * 97) * Math.sin(t * 41);
      plumeCore.material.uniforms.uTime.value = plumeOuter.material.uniforms.uTime.value = t;
      plumeOuter.scale.set(1 + ramp(t, tRocket, tSwitch) * 0.8, 1 + ramp(t, tRocket, tSwitch) * 0.6, 1 + ramp(t, tRocket, tSwitch) * 0.8);
      nozzleGlow.material.color.setRGB(1, 0.85, 0.66).multiplyScalar(6 * flick);
      rocketLight.intensity = 40 * flick;
      smoke.visible = rocket.visible;
      if (smoke.visible) {
        const t0 = tRocket - 0.6;
        for (let i = 0; i < SMOKE_N; i++) {
          const d = smokeData[i];
          const te = t0 + d.e * (tSwitch - t0);
          const age = t - te;
          if (age < 0) { smoke.A[i] = 0; continue; }
          const y0 = rocketY(te) - 0.4;
          const spread = 0.15 + age * 1.3;
          smoke.P[i * 3] = PAD.x + d.dx * spread * 2 + age * 0.9 - (te - t0) * 1.8 * ramp(te, tRocket, tSwitch) * 0.12 * 10 * 0;
          smoke.P[i * 3 + 1] = y0 - age * 1.5 + d.sh * 0.2;
          smoke.P[i * 3 + 2] = PAD.z + d.dz * spread * 2;
          smoke.S[i] = d.s * (0.7 + age * 3.2);
          smoke.Rot[i] = d.rot + age;
          const hot = Math.exp(-age * 14);
          smoke.A[i] = Math.min(1, age * 20) * (0.55 - Math.min(0.45, age * 0.35)) * (y0 > 7.5 ? 1 : 0.2);
          smoke.C[i * 3] = 0.85 + hot * 5.0; smoke.C[i * 3 + 1] = 0.85 + hot * 2.6; smoke.C[i * 3 + 2] = 0.9 + hot * 1.0;
        }
        smoke.commit(info);
      }
      // staging flash: covers the leap to orbit
      const fl = envelope(t, tSwitch - 0.12, tSwitch + 0.02, 0.1, 0.02, ease.inQuad);
      stageFlash.position.set(PAD.x, rY - 0.2, PAD.z);
      stageFlash.scale.setScalar(1 + fl * 40);
      stageFlash.material.opacity = fl;
      stageFlash.visible = fl > 0.001;

      // ---------------- lens
      api.dof.amount = envelope(t, tFold + 0.2, tCloud, 0.3, 0.25) * 0.5;
      api.dof.focus = camPos.distanceTo(planePos); api.dof.range = 2.2;
      api.exposure = 1.0 + fl * 1.8;
      api.bloom.strength = 0.7 + fl * 0.8 + ramp(t, tRocket, tSwitch) * 0.15;
    },
    _worldB(t, info) {
      const u = ramp(t, tSwitch, DUR, ease.outCubic);
      // camera pulls back — the planet recedes into darkness
      camPos.set(lerp(-1.5, -9.5, u), lerp(2.6, 7.5, u), lerp(27, 58, u)).add(E);
      look.set(lerp(1.8, 3.2, u), lerp(0.9, 0.3, u), 0).add(E);
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(look);
      camera.fov = 35; camera.near = 0.1; camera.far = 1200; camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      earth.rotation.y = 0.6 + t * 0.08;
      earthMat.uniforms.uTime.value = t;
      orbits.forEach((o) => {
        const p = ramp(t, o.t0, o.t0 + 0.55, ease.inOutCubic);
        o.line.progress = p; o.line.opacity = 0.75;
        o.ticks.progress = ramp(t, o.t0 + 0.2, o.t0 + 0.7); o.ticks.opacity = 0.6;
        const a = o.ph + t * o.w;
        o.sat.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
        o.sat.material.opacity = p;
      });
      ascent.progress = ramp(t, tSwitch, tSwitch + 0.6, ease.outQuad); ascent.opacity = 1 - ramp(t, tSwitch + 0.5, DUR);
      // station: parts drift in and dock (camera-relative so we co-orbit it)
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      station.position.copy(camPos).addScaledVector(fwd, 9.5).addScaledVector(right, -3.4).addScaledVector(up, -0.85);
      station.quaternion.copy(camera.quaternion);
      tmp.set(0.35 + t * 0.12, -0.6 + t * 0.1, 0.25);
      e.set(tmp.x, tmp.y, tmp.z); q.setFromEuler(e); station.quaternion.multiply(q);
      parts.forEach((p, i) => {
        const k = ramp(t, p.dock - 0.55, p.dock, ease.outCubic);
        p.obj.position.copy(p.home).addScaledVector(p.from, 1 - k);
        e.set(p.rot.x * (1 - k), p.rot.y * (1 - k), p.rot.z * (1 - k)); q.setFromEuler(e);
        p.obj.quaternion.copy(p.homeQ).premultiply(q);
        const f = envelope(t, p.dock - 0.02, p.dock + 0.22, 0.02, 0.2);
        dockFlashes[i].position.copy(p.home); dockFlashes[i].material.opacity = f; dockFlashes[i].visible = f > 0.001;
      });
      const flash = 1 - ramp(t, tSwitch, tSwitch + 0.22, ease.outCubic);
      api.dof.amount = 0;
      api.exposure = 1.0 + flash * 1.6;
      api.bloom.strength = 0.75 + flash * 0.6;
    },
  };
  return api;
}
