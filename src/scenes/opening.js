// OPENING — THE IDEA (0.0 – 8.0 s)
// v12: a trailer cold open. From black, IGNITION on the first hit (a light burst, an anamorphic
// streak, a shockwave ring and gold sparks) → a flash-forward of gold-linework silhouettes on the
// 8ths (column · gear · rocket · Moon) that collapses into a point of light, the idea → the
// compass-and-straightedge construction explodes out of it stroke by stroke on the beat, every
// drawing head shedding sparks → a hard push through the linework and the layered 2.5D manuscripts
// → particles converge and the title SLAMs together (camera shake, a light-ray burst, a shockwave
// ring, a spark storm, white-hot letters cooling) → 2D→3D typography: the same glyph meshes
// extrude into monumental bronze/marble/gold letters that fly apart into the 'zoom'.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES, FILM_ASPECT } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp, rng, clamp } from '../lib/math.js';
import { progressLine, segmentsLine, circlePoints, goldenSpiralPoints } from '../lib/lines.js';
import { MorphParticles, Dust, sampleBox, sampleGeometry } from '../lib/particles.js';
import { TextPlane, KineticText, FONTS, letters3D } from '../lib/text.js';
import { manuscriptTexture, marbleTexture } from '../lib/textures.js';
import { glowSprite, lightShaft } from '../lib/materials.js';
import { pulse } from '../lib/rhythm.js';

const GOLD = '#e8bd6e';
const GOLD_HOT = '#fff0d0';
const GOLD_DIM = '#8c6a3c';
const Z_TITLE = -52;          // world z of the title plane
const PHI = (1 + Math.sqrt(5)) / 2;
const STEP = 0.125;           // a 16th of the score's beat grid (story seconds)

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const P = (arr) => arr.map(([x, y]) => V(x, y));
const decay = (t, t0, k) => (t >= t0 ? Math.exp(-(t - t0) * k) : 0);   // a hit's envelope: 1 on t0, then exponential

// ---- sparks: ballistic streaks with drag, a pure function of time (every spark carries its own
// origin, velocity, birth and life, so one system holds every burst of the sequence)
const SPARK_VERT = /* glsl */ `
attribute vec3 aVel;
attribute vec4 aLife;   // birth, life, end (0 tail · 1 head), seed
uniform float uTime, uDrag, uTrail, uSize, uViewport, uPoints;
uniform vec3 uGrav;
varying float vK, vA;
void main(){
  float age = uTime - aLife.x;
  float a = max(0.0, age - (1.0 - aLife.z) * uTrail);
  vec3 p = position + aVel * ((1.0 - exp(-uDrag * a)) / uDrag) + uGrav * (0.5 * a * a);
  float k = age / aLife.y;
  vK = k;
  vA = (age >= 0.0 && k < 1.0) ? (1.0 - k) * (1.0 - k) : 0.0;
  vA *= uPoints > 0.5 ? aLife.z : mix(0.08, 1.0, aLife.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPoints > 0.5 ? aLife.z * uSize * (0.5 + aLife.w) * (1.0 - 0.6 * clamp(k, 0.0, 1.0)) * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z) : 1.0;
}`;
const SPARK_FRAG = /* glsl */ `
uniform vec3 uHot, uCol;
uniform float uOpacity, uIntensity, uPoints;
varying float vK, vA;
void main(){
  float a = vA * uOpacity;
  if (uPoints > 0.5) a *= smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
  if (a < 0.003) discard;
  gl_FragColor = vec4(mix(uHot, uCol, smoothstep(0.0, 0.7, vK)) * uIntensity * a, 1.0);
}`;
function makeSparks(list, { drag = 3, trail = 0.045, grav = [0, -0.5, 0], size = 0.014, hot = '#fff3d6', col = '#ff9e3d', intensity = 2.2 } = {}) {
  const n = list.length;
  const pos = new Float32Array(n * 6), vel = new Float32Array(n * 6), life = new Float32Array(n * 8);
  let t0 = Infinity, t1 = -Infinity;
  list.forEach((s, i) => {
    for (let e = 0; e < 2; e++) {
      const j = i * 2 + e;
      pos[j * 3] = s.o.x; pos[j * 3 + 1] = s.o.y; pos[j * 3 + 2] = s.o.z;
      vel[j * 3] = s.v.x; vel[j * 3 + 1] = s.v.y; vel[j * 3 + 2] = s.v.z;
      life[j * 4] = s.birth; life[j * 4 + 1] = s.life; life[j * 4 + 2] = e; life[j * 4 + 3] = s.seed;
    }
    t0 = Math.min(t0, s.birth); t1 = Math.max(t1, s.birth + s.life + trail);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 4));
  const U = {
    uTime: { value: -10 }, uDrag: { value: drag }, uTrail: { value: trail }, uSize: { value: size }, uViewport: { value: 800 },
    uGrav: { value: new THREE.Vector3(...grav) }, uHot: { value: new THREE.Color(hot) }, uCol: { value: new THREE.Color(col) },
    uOpacity: { value: 1 }, uIntensity: { value: intensity },
  };
  // (the two materials share every uniform object but uPoints)
  const mat = (points) => new THREE.ShaderMaterial({ uniforms: { ...U, uPoints: { value: points } }, vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const group = new THREE.Group();
  const lines = new THREE.LineSegments(geo, mat(0)), heads = new THREE.Points(geo, mat(1));
  lines.frustumCulled = heads.frustumCulled = false;
  group.add(lines, heads);
  return {
    group, U,
    tick(t, h) { U.uTime.value = t; U.uViewport.value = h ?? 800; group.visible = t >= t0 && t <= t1; },
  };
}

// ---- a shockwave ring (camera-facing plane): a hot annulus with a faint wake inside it
const QUAD_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */ `
uniform float uR, uW, uI, uWake; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float d = (r - uR) / uW;
  float a = exp(-d * d) + uWake * step(r, uR) * exp((r - uR) / (uW * 6.0));
  a *= uI * smoothstep(1.0, 0.9, r);
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
// ---- a light-ray burst (god rays fanning out from behind the title; periodic value noise in angle)
const RAYS_FRAG = /* glsl */ `
uniform float uI, uLen, uRot; uniform vec3 uColor; varying vec2 vUv;
float h(float n){ return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
float vn(float x, float n){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h(mod(i, n)), h(mod(i + 1.0, n)), f); }
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float u = atan(p.y, p.x) / 6.2831853 + 0.5;
  float ray = pow(vn(fract(u + uRot) * 72.0, 72.0), 6.0) + 0.45 * pow(vn(fract(u - uRot * 0.7) * 25.0, 25.0), 3.0);
  float fall = exp(-r / max(0.02, uLen) * 2.4) * smoothstep(0.0, 0.05, r) * smoothstep(1.0, 0.75, r);
  float a = ray * fall * uI;
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
// ---- the anamorphic streak (HUD, screen space)
const STREAK_FRAG = /* glsl */ `
uniform float uI; uniform vec3 uColor; varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float x = max(1.0 - abs(p.x) * 2.0, 0.0);
  // tapered to a point at both tips (inside the frame) so it never reads as a flat band
  float a = exp(-pow(p.y * 2.0 / 0.035, 2.0)) * pow(x, 4.0) * 0.6 + exp(-pow(p.y * 2.0 / 0.01, 2.0)) * pow(x, 2.0) * 0.8 + exp(-pow(length(p * vec2(4.0, 1.0)) * 2.0 / 0.2, 2.0)) * 0.6;
  a = max(a * uI - 0.003, 0.0);   // (fades continuously to zero: a hard cut-off edge shows once bloomed)
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const fxMesh = (frag, uniforms, { depthTest = true } = {}) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending,
  }));
  m.frustumCulled = false;
  return m;
};

// ---- the flash-forward: four achievements in gold linework (≈ 1 unit tall, centred)
function iconShapes() {
  const mirror = (pts) => pts.map((p) => V(-p.x, p.y));
  // 1. an Ionic column on its stylobate, under a slice of entablature
  const column = { lines: [], segs: [] };
  column.lines.push(P([[-0.36, -0.5], [0.36, -0.5], [0.36, -0.465], [-0.36, -0.465], [-0.36, -0.5]]));
  column.lines.push(P([[-0.29, -0.465], [-0.29, -0.43], [0.29, -0.43], [0.29, -0.465]]));
  column.lines.push(P([[-0.2, -0.43], [-0.2, -0.4], [0.2, -0.4], [0.2, -0.43]]));
  column.lines.push(P([[-0.17, -0.4], [-0.17, -0.375], [0.17, -0.375], [0.17, -0.4]]));
  const shaft = [];
  for (let i = 0; i <= 16; i++) { const u = i / 16; shaft.push(V(0.14 - 0.025 * u ** 1.6 + 0.006 * Math.sin(u * Math.PI), -0.375 + u * 0.675)); }
  column.lines.push(shaft, mirror(shaft));
  for (const x of [-0.09, -0.045, 0, 0.045, 0.09]) column.segs.push([V(x, -0.36), V(x * 0.84, 0.285)]);
  column.lines.push(P([[-0.21, 0.3], [0.21, 0.3]]), P([[-0.24, 0.345], [0.24, 0.345], [0.24, 0.372], [-0.24, 0.372], [-0.24, 0.345]]));
  for (const s of [1, -1]) {
    const vol = [];
    for (let i = 0; i <= 48; i++) { const u = i / 48, a = -Math.PI / 2 + u * Math.PI * 5, r = 0.05 * (1 - 0.82 * u); vol.push(V(s * (0.2 + Math.cos(a) * r), 0.318 + Math.sin(a) * r)); }
    column.lines.push(vol);
  }
  column.lines.push(P([[-0.4, 0.372], [0.4, 0.372], [0.4, 0.43], [-0.4, 0.43], [-0.4, 0.372]]), P([[-0.44, 0.43], [-0.44, 0.5], [0.44, 0.5], [0.44, 0.43]]));
  for (let k = 0; k < 9; k++) { const x = -0.36 + k * 0.09; column.segs.push([V(x, 0.45), V(x, 0.48)]); }   // dentils

  // 2. a spur gear: 14 teeth, a rim, six lightening holes, a hub with its keyway
  const gear = { lines: [], segs: [] };
  const N = 14, w = (Math.PI * 2) / N, rIn = 0.38, rOut = 0.47;
  const teeth = [];
  const pa = (r, a) => V(Math.cos(a) * r, Math.sin(a) * r);
  for (let k = 0; k < N; k++) {
    const a0 = Math.PI / 2 + k * w;
    teeth.push(pa(rIn, a0), pa(rOut, a0 + 0.14 * w), pa(rOut, a0 + 0.44 * w), pa(rIn, a0 + 0.58 * w), pa(rIn, a0 + 0.8 * w));
  }
  teeth.push(teeth[0].clone());
  gear.lines.push(teeth, circlePoints(0.3, 96, { start: Math.PI / 2, end: Math.PI * 2.5 }), circlePoints(0.11, 48, { start: -Math.PI / 2, end: Math.PI * 1.5 }));
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; gear.lines.push(circlePoints(0.062, 36, { center: V(Math.cos(a) * 0.205, Math.sin(a) * 0.205), start: a + Math.PI, end: a + Math.PI * 3 })); }
  gear.lines.push(P([[-0.018, 0.045], [-0.018, 0.075], [0.018, 0.075], [0.018, 0.045]]), circlePoints(0.045, 36, { start: Math.PI / 2, end: Math.PI * 2.5 }));

  // 3. a Saturn V: profile drawn down both sides from the escape tower, stage joints, fins, engines
  const rocket = { lines: [], segs: [] };
  const X = 1.35;   // a little broader than true, so it reads at a glance
  const side = [[0, 0.56], [0.006, 0.5], [0.006, 0.47], [0.034, 0.42], [0.034, 0.37], [0.05, 0.3], [0.05, 0.17], [0.075, 0.1], [0.075, -0.14], [0.075, -0.47], [0.086, -0.5], [0, -0.5]].map(([x, y]) => [x * X, y]);
  rocket.lines.push(P(side), mirror(P(side)));
  for (const [y, hw] of [[0.37, 0.034], [0.3, 0.05], [0.17, 0.05], [0.1, 0.075], [-0.14, 0.075], [-0.2, 0.075]]) rocket.segs.push([V(-hw * X, y), V(hw * X, y)]);
  rocket.segs.push([V(-0.04 * X, -0.2), V(-0.04 * X, -0.47)], [V(0.04 * X, -0.2), V(0.04 * X, -0.47)]);
  const fin = P([[0.075 * X, -0.36], [0.125 * X, -0.47], [0.125 * X, -0.52], [0.086 * X, -0.5]]);
  rocket.lines.push(fin, mirror(fin));
  for (const cx of [-0.045, 0, 0.045]) rocket.lines.push(P([[(cx - 0.013) * X, -0.5], [(cx - 0.022) * X, -0.555], [(cx + 0.022) * X, -0.555], [(cx + 0.013) * X, -0.5]]));

  // 4. the Moon: disc, terminator, engraved hatching on the night side, craters, a translunar orbit
  const moon = { lines: [], segs: [] };
  const R0 = 0.4;
  moon.lines.push(circlePoints(R0, 160, { start: Math.PI / 2, end: Math.PI * 2.5 }));
  const term = [];
  for (let i = 0; i <= 40; i++) { const f = Math.PI / 2 - (i / 40) * Math.PI; term.push(V(-0.16 * Math.cos(f), R0 * Math.sin(f))); }
  moon.lines.push(term);
  for (let y = -0.34; y <= 0.341; y += 0.034) { const xl = -Math.sqrt(R0 * R0 - y * y), xt = -0.16 * Math.sqrt(Math.max(0, 1 - (y / R0) ** 2)); if (xt - xl > 0.03) moon.segs.push([V(xl + 0.012, y), V(xt - 0.012, y)]); }
  for (const [x, y, r] of [[0.13, 0.15, 0.07], [0.22, -0.1, 0.045], [0.03, -0.2, 0.085], [0.27, 0.19, 0.03], [0.09, 0.02, 0.028]]) moon.lines.push(circlePoints(r, 40, { center: V(x, y), start: Math.PI * 0.75, end: Math.PI * 2.75 }));
  const orbit = [];
  for (let i = 0; i <= 120; i++) {
    const a = (i / 120) * Math.PI * 2, x = Math.cos(a) * 0.66, y = Math.sin(a) * 0.12, c = Math.cos(-0.22), s = Math.sin(-0.22);
    const p = V(x * c - y * s, x * s + y * c);
    if (Math.sin(a) > 0 && p.length() < R0 + 0.01) { if (orbit.length > 1) moon.lines.push(orbit.splice(0)); else orbit.length = 0; continue; }
    orbit.push(p);
  }
  if (orbit.length > 1) moon.lines.push(orbit);
  return [column, gear, rocket, moon];
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 300);
  const R = rng(20260927);

  // ======================================================================
  // 0. COLD OPEN — ignition, flash-forward (all in the construction plane, z = 0)
  const RS = rng(4242);                       // sparks draw from their own stream: the layout below is unchanged
  const tIgn = cue('ignition'), tFF = cue('flashForward');
  const pA = cue('pointAppears');
  const tCol = tFF + 4 * 2 * STEP;            // the flash-forward collapses into the point …
  const sparkList = [];
  const fx = new THREE.Group();               // shares the construction's tilt
  fx.rotation.set(-0.05, 0.06, 0);
  scene.add(fx);
  // ignition: a white-hot core in a warm bloom, a shockwave ring and ~700 sparks
  const burstGlow = glowSprite({ color: '#ffb866', intensity: 1, scale: 1 });
  const burstCore = glowSprite({ color: '#fff6e6', intensity: 1, scale: 1 });
  fx.add(burstGlow, burstCore);
  const ringU = { uR: { value: 0 }, uW: { value: 0.02 }, uI: { value: 0 }, uWake: { value: 0.18 }, uColor: { value: new THREE.Color(1.0, 0.8, 0.5).multiplyScalar(2.6) } };
  const ring = fxMesh(RING_FRAG, ringU);
  ring.scale.setScalar(2.6);
  ring.position.z = 0.01;
  fx.add(ring);
  for (let i = 0; i < 420; i++) {
    const u = RS() * 2 - 1, th = RS() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const sp = 1.4 + 5.4 * RS() ** 2;
    sparkList.push({ o: V(0, 0, 0), v: V(Math.cos(th) * r * sp, Math.sin(th) * r * sp, (u * 0.45 - 0.15) * sp), birth: tIgn + RS() * 0.06, life: 0.35 + 0.75 * RS(), seed: RS() });
  }
  // the drawing heads shed sparks: `pts` (a polyline) is drawn over [t0, t1] with `fn`
  const headSparks = (pts, t0, t1, fn, { speed = 1, life = 0.4, per = 7, max = 48 } = {}) => {
    const L = [0];
    for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const tot = L.at(-1);
    const n = Math.max(5, Math.min(max, Math.round(tot * per)));
    for (let k = 0; k < n; k++) {
      const u = (k + RS()) / n;
      let lo = 0, hi = 1;
      for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2; if (fn(m) < u) lo = m; else hi = m; }
      const s = u * tot;
      let i = 1;
      while (i < L.length - 1 && L[i] < s) i++;
      const o = pts[i - 1].clone().lerp(pts[i], (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]));
      const a = RS() * Math.PI * 2, sp = speed * (0.25 + 1.3 * RS() * RS());
      sparkList.push({ o, v: V(Math.cos(a) * sp, Math.sin(a) * sp, (RS() - 0.3) * sp * 0.6), birth: t0 + (lo + hi) / 2 * (t1 - t0), life: life * (0.5 + RS()), seed: RS() });
    }
  };
  // flash-forward: one silhouette per 8th, drawn in a flash (every line at once, hot heads)
  const ICON_DRAW = 0.09;
  const icons = iconShapes().map((shape, k) => {
    const g = new THREE.Group();
    g.position.z = 0.02;
    fx.add(g);
    const t0 = tFF + k * 2 * STEP;
    const parts = [];
    const opts = { color: GOLD, headColor: GOLD_HOT, intensity: 1.5, head: 0.08 };
    shape.lines.forEach((pts, i) => {
      const obj = progressLine(pts, opts);
      g.add(obj);
      const d = (i % 5) * 0.006;
      parts.push({ obj, d });
      headSparks(pts, t0 + d, t0 + d + ICON_DRAW, ease.outQuart, { speed: 0.55, life: 0.3, per: 9, max: 22 });
    });
    if (shape.segs.length) {
      const obj = segmentsLine(shape.segs, { ...opts, intensity: 0.9, orderFn: (a, b, i) => (i / shape.segs.length) * 0.5, stagger: 0.5 });
      g.add(obj);
      parts.push({ obj, d: 0.02 });
    }
    return { g, parts, t0 };
  });

  // ======================================================================
  // 1. THE POINT
  const point = glowSprite({ color: '#ffd89a', intensity: 4, scale: 0.1 });
  const pointCore = glowSprite({ color: '#ffffff', intensity: 6, scale: 0.03 });
  scene.add(point, pointCore);

  // ======================================================================
  // 2. THE CONSTRUCTION GRID (plane z = 0) — authored on a 1.6 s draft (offsets a, b below),
  // played faster: every stroke starts on a 16th of the beat grid and is struck hard (outQuart)
  const grid = new THREE.Group();
  grid.rotation.set(-0.05, 0.06, 0);
  scene.add(grid);
  const anims = [];   // { obj, t0, t1, fn, op }
  const g0 = cue('gridStart'), g1 = cue('gridDone');   // 1.5 → 2.5
  const K = (g1 - g0) / 1.6;
  const at = (a) => g0 + Math.round((a * K) / STEP) * STEP;
  const HARD = ease.outQuart;
  const add = (obj, a, b, fn = HARD, op = 1, pts = null, sp = {}) => {
    const t0 = at(a), t1 = t0 + Math.max(0.1, (b - a) * K * 0.85);
    grid.add(obj); anims.push({ obj, t0, t1, fn, op }); obj.progress = 0;
    if (pts) headSparks(pts, t0, t1, fn, sp);
    return obj;
  };
  const lineOpts = (intensity = 1.2, extra = {}) => ({ color: GOLD, headColor: GOLD_HOT, intensity, head: 0.03, ...extra });
  const addLine = (pts, a, b, intensity, fn = HARD, sp = {}) => add(progressLine(pts, lineOpts(intensity)), a, b, fn, 1, pts, sp);

  // Axes shooting out of the point
  for (const [dx, dy, len] of [[1, 0, 7.2], [-1, 0, 7.2], [0, 1, 3.2], [0, -1, 3.2]]) {
    addLine([V(0, 0), V(dx * len, dy * len)], 0, 0.7, 1.0, HARD, { speed: 1.6, life: 0.45, per: 5 });
  }
  // Central circle + vesica piscis + outer circle (compass work)
  addLine(circlePoints(1, 160), 0.05, 0.5, 1.5);
  addLine(circlePoints(1, 160, { center: V(1, 0), start: Math.PI, end: Math.PI * 3 }), 0.25, 0.75, 1.0);
  addLine(circlePoints(1, 160, { center: V(-1, 0), start: 0, end: Math.PI * 2 }), 0.3, 0.8, 1.0);
  addLine(circlePoints(2, 200, { start: Math.PI / 2, end: Math.PI / 2 + Math.PI * 2 }), 0.4, 0.95, 1.2);
  add(progressLine(circlePoints(PHI, 200, { start: -Math.PI / 2, end: Math.PI * 1.5 }), lineOpts(0.55)), 0.5, 1.0, ease.outCubic);
  // Squares & diagonals
  addLine([V(-1, -1), V(1, -1), V(1, 1), V(-1, 1), V(-1, -1)], 0.45, 0.9, 1.0);
  addLine([V(-2, -2), V(2, -2), V(2, 2), V(-2, 2), V(-2, -2)], 0.55, 1.05, 1.1);
  add(progressLine([V(-2.6, -2.6), V(2.6, 2.6)], lineOpts(0.6)), 0.6, 1.0, HARD);
  add(progressLine([V(2.6, -2.6), V(-2.6, 2.6)], lineOpts(0.6)), 0.62, 1.02, HARD);
  // Golden rectangles either side, with their subdivisions + spirals
  const gw = 4 / PHI;                      // 2.472
  for (const s of [1, -1]) {
    addLine([V(2 * s, 2), V((2 + gw) * s, 2), V((2 + gw) * s, -2), V(2 * s, -2)], 0.75, 1.2, 1.0);
    // subdivide: square gw×gw at the far end, then the next…
    const segs = [];
    let x0 = 2, x1 = 2 + gw, y0 = -2, y1 = 2, dir = 0;
    for (let k = 0; k < 6; k++) {
      const w = x1 - x0, h = y1 - y0;
      if (dir === 0) { const yy = y1 - w; segs.push([V(x0 * s, yy), V(x1 * s, yy)]); y1 = yy; }
      else if (dir === 1) { const xx = x0 + h; segs.push([V(xx * s, y0), V(xx * s, y1)]); x0 = xx; }
      else if (dir === 2) { const yy = y0 + w; segs.push([V(x0 * s, yy), V(x1 * s, yy)]); y0 = yy; }
      else { const xx = x1 - h; segs.push([V(xx * s, y0), V(xx * s, y1)]); x1 = xx; }
      dir = (dir + 1) % 4;
    }
    add(segmentsLine(segs, lineOpts(0.8, { orderFn: (a, b, i) => i * 0.1, stagger: 0.6 })), 0.95, 1.45, HARD);
    const sp = goldenSpiralPoints(2.3, 2.2, 260).map((p) => V((2 + gw - 0.15 - p.x * 0.55) * s, p.y * 0.55 - 0.1, 0));
    addLine(sp.reverse(), 1.0, 1.55, 1.3, ease.outCubic);
  }
  // Temple elevation (stylobate, 8 columns, entablature, pediment) — built bottom-up
  {
    const segs = [];
    const W = 3.9, base = -2.35;
    for (let k = 0; k < 3; k++) { const y = base + k * 0.13, w = W + 0.35 - k * 0.12; segs.push([V(-w, y), V(w, y)]); segs.push([V(-w, y), V(-w, y + 0.13)]); segs.push([V(w, y), V(w, y + 0.13)]); }
    const top = 0.85;
    for (let i = 0; i < 8; i++) {
      const x = -W + 0.35 + i * ((2 * W - 0.7) / 7), r = 0.17;
      segs.push([V(x - r, base + 0.39), V(x - r * 0.82, top - 0.12)]);
      segs.push([V(x + r, base + 0.39), V(x + r * 0.82, top - 0.12)]);
      segs.push([V(x - r * 1.35, top - 0.12), V(x + r * 1.35, top - 0.12)]);
      segs.push([V(x - r * 1.35, top), V(x + r * 1.35, top)]);
    }
    segs.push([V(-W, top), V(W, top)], [V(-W, top + 0.3), V(W, top + 0.3)], [V(-W, top + 0.42), V(W, top + 0.42)]);
    segs.push([V(-W, top), V(-W, top + 0.42)], [V(W, top), V(W, top + 0.42)]);
    segs.push([V(-W - 0.1, top + 0.42), V(0, top + 1.55)], [V(0, top + 1.55), V(W + 0.1, top + 0.42)]);
    segs.push([V(-W + 0.45, top + 0.52), V(0, top + 1.38)], [V(0, top + 1.38), V(W - 0.45, top + 0.52)]);
    const ys = segs.map(([a, b]) => (a.y + b.y) / 2);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    add(segmentsLine(segs, lineOpts(0.9, { headColor: '#e8bd6e', head: 0.012, orderFn: (a, b) => ((a.y + b.y) / 2 - lo) / (hi - lo) * 0.75, stagger: 0.75 })), 0.55, 1.5, ease.inOutSine);
  }
  // Fine floor-plan grid growing radially from the point
  {
    const segs = [], st = 0.5;
    for (let x = -7; x <= 7.001; x += st) for (let y = -3; y < 3; y += st) segs.push([V(x, y), V(x, y + st)]);
    for (let y = -3; y <= 3.001; y += st) for (let x = -7; x < 7; x += st) segs.push([V(x, y), V(x + st, y)]);
    add(segmentsLine(segs, { color: GOLD_DIM, headColor: GOLD, intensity: 0.35, head: 0.02, orderFn: (a, b) => Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) / 7.8 * 0.8, stagger: 0.8 }), 0, 1.6, ease.outSine);
  }
  // Degree ring (astronomical markings)
  {
    const segs = [], n = 120;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r0 = 2.62, l = i % 10 === 0 ? 0.22 : i % 5 === 0 ? 0.13 : 0.07;
      segs.push([V(Math.cos(a) * r0, Math.sin(a) * r0), V(Math.cos(a) * (r0 + l), Math.sin(a) * (r0 + l))]);
    }
    add(segmentsLine(segs, lineOpts(0.9, { orderFn: (a, b, i) => (i / n) * 0.7, stagger: 0.7 })), 0.8, 1.6, ease.inOutSine);
    addLine(circlePoints(2.62, 220), 0.7, 1.3, 0.7, ease.outCubic);
  }
  // Hand annotations
  const labels = [];
  const addLabel = (txt, x, y, a, opts = {}) => {
    const l = new TextPlane(txt, { font: opts.mono ? FONTS.mono : FONTS.serif, italic: !opts.mono, weight: opts.mono ? 400 : 500, height: opts.h ?? 0.2, color: '#f3d6a0', intensity: 1.1, letterSpacing: opts.mono ? 0.15 : 0, revealDir: 'x' });
    l.position.set(x, y, 0.01);
    grid.add(l);
    labels.push({ l, t0: at(a) });
  };
  addLabel('A', 1.1, -0.3, 0.6); addLabel('B', -1.12, -0.3, 0.65);   // below the axis: the centred caption sits on it
  addLabel('φ', 2.1 + gw * 0.5, 2.2, 1.1, { h: 0.26 }); addLabel('φ', -2.1 - gw * 0.5, 2.2, 1.15, { h: 0.26 });
  addLabel('1 : 1.618', 3.25, -2.3, 1.2, { mono: true, h: 0.11 });
  addLabel('MODVLVS · I', -3.2, -2.3, 1.25, { mono: true, h: 0.11 });
  addLabel('De architectura', 0, 2.9, 1.3, { h: 0.22 });

  const sparksA = makeSparks(sparkList, { drag: 3, trail: 0.05, grav: [0, -0.45, 0], size: 0.016, intensity: 2.4 });
  fx.add(sparksA.group);

  // ======================================================================
  // 3. MANUSCRIPT LAYERS (2.5D planes at staggered depths along the flight path)
  const layers = [];
  const kinds = ['geometry', 'astronomy', 'architecture', 'text'];
  const parchTex = kinds.map((kind, i) => manuscriptTexture({ w: 768, h: 1024, seed: 3 + i, kind }));
  const inkTex = kinds.map((kind, i) => manuscriptTexture({ w: 768, h: 1024, seed: 11 + i, kind, ink: 'rgba(255,222,170,1)', transparent: true }));
  const pageGeo = (() => {
    const g = new THREE.PlaneGeometry(1.5, 2, 16, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -0.18 * (x / 0.75) * (x / 0.75)); }   // gentle page curl
    g.computeVertexNormals();
    return g;
  })();
  const NL = 18;
  for (let i = 0; i < NL; i++) {
    const ink = i % 3 === 1;
    const side = i % 2 === 0 ? 1 : -1;
    const z = 3.5 - i * 2.6 - R() * 1.0;
    const x = side * (1.9 + R() * 2.2);
    const y = (R() - 0.5) * 2.6;
    const s = 1.1 + R() * 1.1;
    const tex = ink ? inkTex[i % 4] : parchTex[(i + 1) % 4];
    const mat = ink
      ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.15, 0.75), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: tex, color: '#e8dcc4', roughness: 0.85, metalness: 0, transparent: true, opacity: 0, side: THREE.DoubleSide, envMapIntensity: 0.25 });
    const m = new THREE.Mesh(pageGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s * (ink ? 1.35 : 1));
    const base = { x, y, z, ry: -side * (0.35 + R() * 0.4), rz: (R() - 0.5) * 0.5, rx: (R() - 0.5) * 0.3, dx: (R() - 0.5) * 0.5, dy: (R() - 0.5) * 0.4, spin: (R() - 0.5) * 0.25 };
    m.rotation.set(base.rx, base.ry, base.rz);
    scene.add(m);
    layers.push({ m, mat, ink, base, t0: cue('layersStart') + (i < 7 ? i * 0.06 : 0.3 + i * 0.025) });
  }
  // a few large, very faint diagrams far behind the title for depth
  const farLayers = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: inkTex[(i + 1) % 4], color: new THREE.Color(0.5, 0.36, 0.22), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((i - 1) * 14, (i === 1 ? 1 : -1.5), Z_TITLE - 30 - i * 4);
    m.scale.setScalar(11);
    m.rotation.z = (i - 1) * 0.3;
    scene.add(m);
    farLayers.push(m);
  }

  // Dust along the whole path
  const dust = new Dust({ count: 3500, size: [18, 9, 80], center: [0, 0, -24], color: '#ffd9a8', particleSize: 0.028, opacity: 0.55, intensity: 1.3, seed: 5 });
  scene.add(dust);

  // ======================================================================
  // 4. TITLE — 3D glyph meshes (flat first), particle assembly onto their faces
  const titleGroup = new THREE.Group();
  titleGroup.position.set(0, 0, Z_TITLE);
  scene.add(titleGroup);
  const L1 = letters3D('ACHIEVEMENTS OF', { size: 1, depth: 0.55, bevel: 0.03, tracking: 0.16 });
  const L2 = letters3D('WESTERN CIVILIZATION', { size: 1, depth: 0.55, bevel: 0.03, tracking: 0.1 });
  const s2 = 10.4 / L2.width, s1 = 6.1 / L1.width;
  const Y1 = 0.95, Y2 = -0.3;
  const marbleMat = new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 7 }), color: '#e6dccb', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: new THREE.Color('#ffe7c2'), emissiveIntensity: 0, envMapIntensity: 0.4 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#e9b964', metalness: 1, roughness: 0.38, emissive: new THREE.Color('#ffb85a'), emissiveIntensity: 0, envMapIntensity: 0.55 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: '#b87a45', metalness: 1, roughness: 0.34, emissive: new THREE.Color('#ffa24a'), emissiveIntensity: 0, envMapIntensity: 0.55 });
  const glyphs = [];
  const flatParts1 = [], flatParts2 = [];
  const mkLine = (L, s, y, line) => {
    L.forEach((g, i) => {
      const mat = line === 0 ? (i >= L.length - 2 ? bronzeMat : marbleMat) : goldMat;   // 'OF' in bronze
      const mesh = new THREE.Mesh(g.geometry, mat);
      const base = V(g.x * s, y, 0);
      mesh.position.copy(base);
      mesh.scale.set(s, s, 0.02);
      titleGroup.add(mesh);
      const u = (g.x / L.width) + 0.5;
      glyphs.push({ mesh, base, s, line, u, rnd: [R(), R(), R(), R()] });
      const flat = g.geometry.clone();
      flat.scale(s, s, 0.02);
      flat.translate(base.x, base.y, 0);
      (line === 0 ? flatParts1 : flatParts2).push(flat.index ? flat.toNonIndexed() : flat);
    });
  };
  mkLine(L1, s1, Y1, 0);
  mkLine(L2, s2, Y2, 1);
  const N1 = 26000, N2 = 46000, NP = N1 + N2;
  const flat1 = mergeGeometries(flatParts1), flat2 = mergeGeometries(flatParts2);
  const tgt = new Float32Array(NP * 3);
  tgt.set(sampleGeometry(flat1, N1, { seed: 3 }), 0);
  tgt.set(sampleGeometry(flat2, N2, { seed: 4 }), N1 * 3);
  flat1.dispose(); flat2.dispose();
  const src = sampleBox(NP, 24, 11, 22, { seed: 9, center: [0, 0, 1] });
  const cols = new Float32Array(NP * 3);
  const cA = new THREE.Color('#fff1dc'), cB = new THREE.Color('#ffc46e'), cC = new THREE.Color('#ff9f4a'), tmp = new THREE.Color();
  for (let i = 0; i < NP; i++) {
    const r = R();
    if (i < N1) tmp.copy(cA).lerp(cB, r * 0.35); else tmp.copy(cB).lerp(r < 0.5 ? cA : cC, R() * 0.5);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  const titleParticles = new MorphParticles({ count: NP, positions: src, targets: tgt, colors: cols, size: 0.034, intensity: 1.6, stagger: 0.55, seed: 21 });
  titleParticles.u.noiseFreq = 0.35; titleParticles.u.noiseSpeed = 0.2;
  titleParticles.u.scatterCenter = V(0, 0.3, 0);
  titleGroup.add(titleParticles);

  // Subtitle (per-glyph kinetic reveal) + gold rule
  // the title's subtitle: the achievements shown stand on the ideas of many civilizations
  const sub = new KineticText('Built on the ideas of the whole world', { font: FONTS.display, weight: 400, height: 0.235, letterSpacing: 0.28, color: '#f1dcb4', intensity: 1.0 });
  sub.position.set(0, -1.42, 0.05);
  titleGroup.add(sub);
  const ruleL = progressLine([V(0, -0.98, 0.05), V(-5.3, -0.98, 0.05)], { color: GOLD, headColor: GOLD_HOT, intensity: 1.6, head: 0.05 });
  const ruleR = progressLine([V(0, -0.98, 0.05), V(5.3, -0.98, 0.05)], { color: GOLD, headColor: GOLD_HOT, intensity: 1.6, head: 0.05 });
  titleGroup.add(ruleL, ruleR);

  // The SLAM: a light-ray burst fanning out behind the letters, an anamorphic shockwave ring in the
  // title plane, and a spark storm thrown off the glyphs
  const raysU = { uI: { value: 0 }, uLen: { value: 0.3 }, uRot: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.74, 0.42).multiplyScalar(1.5) } };
  const rays = fxMesh(RAYS_FRAG, raysU);
  rays.position.set(0, 0.33, -1.2);
  rays.scale.setScalar(44);
  titleGroup.add(rays);
  const slamRingU = { uR: { value: 0 }, uW: { value: 0.02 }, uI: { value: 0 }, uWake: { value: 0.04 }, uColor: { value: new THREE.Color(1.0, 0.82, 0.55).multiplyScalar(2.2) } };
  const slamRing = fxMesh(RING_FRAG, slamRingU);
  slamRing.position.set(0, 0.33, 0.3);
  slamRing.scale.set(40, 22, 1);
  titleGroup.add(slamRing);
  const tLk = cue('titleLocked');
  const slamList = [];
  for (let i = 0; i < 1100; i++) {
    const j = Math.floor(RS() * NP) * 3;
    const o = V(tgt[j], tgt[j + 1], 0.1);
    const d = V(o.x * 0.55, o.y - 0.33, 0).normalize();
    const sp = 2.5 + 13 * RS() ** 2;
    slamList.push({ o, v: V(d.x * sp + (RS() - 0.5) * 2, d.y * sp + (RS() - 0.3) * 2.5, RS() * 6 - 0.5), birth: tLk + RS() * 0.06, life: 0.45 + 0.9 * RS(), seed: RS() });
  }
  const sparksT = makeSparks(slamList, { drag: 2.4, trail: 0.05, grav: [0, -2.4, 0], size: 0.036, intensity: 1.45 });
  titleGroup.add(sparksT.group);

  // HUD: the anamorphic streak of each hit (screen space; the film centres both on the frame)
  const hud = ctx.makeHUD();
  const streakU = { uI: { value: 0 }, uColor: { value: new THREE.Color('#ffd7a0') } };
  const streak = fxMesh(STREAK_FRAG, streakU, { depthTest: false });
  streak.scale.set(FILM_ASPECT * 2.5, 0.42, 1);
  hud.scene.add(streak);

  // Warm light beyond the title — the camera flies into it for the 'zoom' hand-over
  const beyond = glowSprite({ color: '#ffc27a', intensity: 1, scale: 30 });
  beyond.position.set(0, 0.35, Z_TITLE - 26);
  const beyondCore = glowSprite({ color: '#fff2da', intensity: 1, scale: 6 });
  beyondCore.position.copy(beyond.position);
  scene.add(beyond, beyondCore);
  const halo = glowSprite({ color: '#ffb766', intensity: 0.6, scale: 26 });
  halo.position.set(0, 0.4, Z_TITLE - 6);
  scene.add(halo);
  const shaft = lightShaft({ length: 30, radiusTop: 0.4, radiusBottom: 7, color: '#ffcf8a', intensity: 0.0 });
  shaft.position.set(-6, 16, Z_TITLE - 6);
  shaft.rotation.z = 0.45;
  scene.add(shaft);

  // Lights
  const key = new THREE.DirectionalLight('#ffe2b8', 2.2);
  key.position.set(-6, 7, 10);
  const rim = new THREE.DirectionalLight('#ffd7a0', 0);
  rim.position.set(3, 4, -12);
  const sweep = new THREE.PointLight('#fff0d8', 0, 16, 1.6);
  const fill = new THREE.AmbientLight('#2a1d12', 0.6);
  scene.add(key, rim, sweep, fill, key.target, rim.target);

  // ======================================================================
  // camera path (speed ramp): a slow creep toward the ignition, a snap back out as the construction
  // explodes, then a hard push through the linework and the manuscripts that stops dead on the SLAM
  const fT = cue('flyThrough'), tA = cue('titleAssemble'), tL = cue('titleLocked');
  const l3 = cue('letters3D'), lf = cue('lettersFly');
  const zKeys = [[0, 2.3], [tIgn, 2.15], [tFF, 2.02], [tCol, 1.7], [pA, 1.55], [pA + 0.4, 3.4], [g1, 7.4], [fT, 7.3], [fT + 0.25, -6], [tL - 0.25, -33], [tL, -40.6], [tL + 0.5, -41.1], [l3, -41.9], [lf, -42.9], [lf + 0.8, -44.2], [7.3, -45.6], [7.7, -49.6], [8.0, -55]];
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const dof = { focus: 10, range: 3, amount: 0 };
  const bloom = { strength: 0.75 };
  let lastT = 0, lastH = 800;
  const _cp = new THREE.Vector3(), _rc = new THREE.Vector3(), _rn = new THREE.Vector3(), _rv = new THREE.Vector3();
  // how face-on the viewer sees a plane (centre c, normal n), relative to the film camera (never above 1)
  const faceK = (c, n, cp) => {
    const f = (p) => smoothstep(0.3, 0.8, Math.abs(_rv.copy(p).sub(c).normalize().dot(n)));
    return Math.min(1, f(cp) / Math.max(0.05, f(camPos)));
  };
  // a GPU point never rasterises smaller than a pixel: once a world-sized particle falls under one, its
  // light no longer shrinks with distance and a dense cloud stacks into glare. The film is graded at the
  // director's distance dF; seen from dA, scale the cloud's opacity so each particle carries the light
  // its true size would (never brighter than the film's)
  const pxLight = (size, dF, dA) => {
    const k = size * lastH * 0.5 * camera.projectionMatrix.elements[5];
    const pf = k / Math.max(0.05, dF), pa = k / Math.max(0.05, dA);
    return Math.min(1, ((pa * pa) / (pf * pf)) * (Math.max(pf, 1) ** 2) / (Math.max(pa, 1) ** 2));
  };
  // Explore 3D windows per phase (read on entering explore, right after update(t))
  const LIM_GRID = { yaw: 0.5, pitchDown: 0.3, pitchUp: 0.4, zoomIn: 0.45, zoomOut: 2.2, fly: 1.2 };   // flat compass-and-straightedge linework
  const LIM_PAGES = { yaw: 0.8, pitchDown: 0.35, pitchUp: 0.5, zoomOut: 2.4, fly: 1.5 };                // 2.5D manuscript planes along the flight
  const LIM_TITLE = { yaw: 1.1, pitchDown: 0.35, pitchUp: 0.7, zoomOut: 2.6 };
  const LIM_TITLE_FLAT = { ...LIM_TITLE, yaw: 0.9 };   // before the extrusion the tightly tracked words crowd into each other past ~50°

  const api = {
    scene, camera, hud, dof, bloom, exposure: 1,
    get exploreLimits() { return lastT < fT + 0.15 ? LIM_GRID : lastT < tL - 0.3 ? LIM_PAGES : lastT < l3 ? LIM_TITLE_FLAT : LIM_TITLE; },
    // Explore: the flat title (between the particle lock and the extrusion) is paper-thin edge-on — give
    // the glyphs real depth (update() rebuilds the scale every frame, so this is idempotent)
    explore(t) {
      if (t > tL - 0.3 && t < l3 + 0.6) {
        for (const g of glyphs) if (g.mesh.visible) g.mesh.scale.z = Math.max(g.mesh.scale.z, g.s * 0.35);
      }
    },
    // After the viewer's camera is posed (explore, or the live offset). Everything touched here is
    // rebuilt by update() every frame, so the film's own frames never see it.
    explorePosed(cam) {
      cam.updateMatrixWorld();
      const cp = _cp.setFromMatrixPosition(cam.matrixWorld);
      // the ignition burst and the point of light are sized to the film camera's distance (a constant
      // size on screen): size them to the viewer's, or zooming in grew them into a frame-filling glare
      const dF0 = Math.max(0.5, camPos.length()), dA0 = Math.max(0.5, cp.length());
      const glowK = clamp(dA0 / dF0, 0.35, 2.5);
      if (burstCore.visible) { burstCore.scale.multiplyScalar(glowK); burstGlow.scale.multiplyScalar(glowK); }
      if (point.visible) { point.scale.multiplyScalar(glowK); pointCore.scale.multiplyScalar(glowK); }
      // the flash-forward's dense gold linework (1-px lines) piles up into a hot knot when zoomed out
      const lineK = Math.sqrt(clamp(dF0 / dA0, 0.4, 1));
      if (lineK < 1) for (const ic of icons) if (ic.g.visible) for (const { obj } of ic.parts) obj.intensity *= lineK;
      // manuscripts drifting up to the viewer's lens step back (the film's own near passes are kept:
      // nothing fades farther out than the film camera has that page)
      for (const L of layers) {
        if (!L.m.visible) continue;
        const h = L.m.scale.y, dA = L.m.position.distanceTo(cp), dF = L.m.position.distanceTo(camPos);
        const m = Math.min(dF, 3.6 * h);
        const k = smoothstep(0.45 * m, m, dA);
        if (k < 1) { L.mat.opacity *= k; L.m.visible = L.mat.opacity > 0.002; }
      }
      // the title's particle cloud: keep the film's light per particle from the viewer's distance
      const c = titleGroup.position, dFT = c.distanceTo(camPos), dAT = c.distanceTo(cp);
      if (titleParticles.visible) titleParticles.u.opacity *= pxLight(titleParticles.u.size, dFT, dAT);
      // the two hits (ignition, SLAM) are graded as a flash at the film's distance: pushed in close, their
      // sparks, shockwave rings and rays swelled until they washed the whole frame out
      const nearI = clamp(dA0 / dF0, 0.45, 1), nearS = clamp(dAT / Math.max(0.5, dFT), 0.45, 1);
      sparksA.U.uOpacity.value *= nearI; ringU.uI.value *= nearI;
      sparksT.U.uOpacity.value *= nearS; slamRingU.uI.value *= nearS; raysU.uI.value *= nearS;
      // both shockwave rings lie in their plane: turned toward edge-on they read as a stray sliver of
      // light off to one side, so they thin out as the view leaves the film's face-on axis
      if (ring.visible) {
        ring.getWorldPosition(_rc); ring.getWorldDirection(_rn);
        ringU.uI.value *= faceK(_rc, _rn, cp);
      }
      if (slamRing.visible) {
        slamRing.getWorldPosition(_rc); slamRing.getWorldDirection(_rn);
        slamRingU.uI.value *= faceK(_rc, _rn, cp);
      }
    },
    update(t, info) {
      const T = info.T;
      lastH = info.height ?? 800;
      // the two hits of the cold open: the ignition and the title SLAM (1 on the hit, decaying)
      const ign = decay(t, tIgn, 1), slam = decay(t, tL, 1);
      const aI = t - tIgn, aS = t - tL;
      // ---------------------------------------------------------------- camera
      const cz = timeWarp(t, zKeys);
      const orbit = ramp(t, l3 - 0.2, lf + 0.3, ease.inOutSine) * (1 - ramp(t, lf + 0.2, 7.6, ease.inOutSine));
      // the hand-held drift only after the point appears: the ignition and the flash-forward are dead centre
      const early = (1 - ramp(t, fT, fT + 0.5)) * ramp(t, pA - 0.2, pA + 0.4);
      const lift = 0.35 * ramp(t, fT + 0.3, tL);
      // impact shake: sharp on each hit, decaying fast (a small kick on every flash-forward cut)
      let cut = 0;
      for (const ic of icons) cut += decay(t, ic.t0, 22) * 0.004;
      const shI = (aI >= 0 ? Math.exp(-aI * 7) * 0.02 : 0) + cut;
      const shS = aS >= 0 ? Math.exp(-aS * 6.5) * 0.11 : 0;
      const sh = shI + shS;
      camPos.set(
        Math.sin(t * 0.7) * 0.25 * early + orbit * 3.6 + Math.sin(t * 1.3) * 0.05 * ramp(t, pA - 0.2, pA + 0.4) + (Math.sin(t * 83) + 0.6 * Math.sin(t * 131 + 2)) * sh,
        Math.sin(t * 0.5 + 1) * 0.12 * early + lift + orbit * 0.6 - 0.08 * ramp(t, lf, 8) + (Math.cos(t * 71 + 1) + 0.6 * Math.sin(t * 117)) * sh * 0.8,
        cz + Math.sin(t * 97) * shS * 0.6,
      );
      camera.position.copy(camPos);
      const lookZ = t < tL ? cz - 10 : Math.min(cz - 4, Z_TITLE);
      look.set(orbit * 0.6, lift - 0.05 * orbit, lookZ);
      if (t > 7.0) look.z = cz - 10;
      camera.up.set(Math.sin(t * 0.4) * 0.03 * early - 0.06 * ramp(t, lf, 8) + Math.sin(t * 61) * sh * 0.12, 1, 0).normalize();
      camera.lookAt(look);
      const camD = Math.max(0.5, camPos.z);

      // ---------------------------------------------------------------- ignition (cold open)
      // from black: a pinpoint gathering for a 16th, then the burst
      const pre = ramp(t, tIgn * 0.3, tIgn, ease.inQuad);
      burstCore.visible = burstGlow.visible = t > tIgn * 0.3 && aI < 0.9;
      if (burstCore.visible) {
        const k = aI >= 0 ? Math.exp(-aI * 9) : 0;
        burstCore.scale.setScalar(camD * (aI >= 0 ? 0.03 + 0.16 * k : 0.004 + 0.02 * pre));
        burstCore.material.color.setRGB(1, 0.96, 0.9).multiplyScalar(aI >= 0 ? 2.6 * Math.exp(-aI * 6) : 2 * pre);
        burstGlow.scale.setScalar(camD * (aI >= 0 ? 0.4 + 1.5 * Math.exp(-aI * 12) : 0.05 * pre));
        burstGlow.material.color.setRGB(1, 0.66, 0.34).multiplyScalar(aI >= 0 ? 0.2 + 1.4 * Math.exp(-aI * 20) : 0.4 * pre);
      }
      ringU.uR.value = ease.outCubic(sat(aI / 0.55));
      ringU.uW.value = 0.012 + 0.035 * ringU.uR.value;
      ringU.uI.value = aI >= 0 ? 0.8 * (1 - ringU.uR.value) ** 1.5 * sat(aI / 0.03) : 0;
      ring.visible = aI >= 0 && aI < 0.55;
      sparksA.tick(t, info.height);
      sparksA.U.uOpacity.value = sparksT.U.uOpacity.value = 1;   // (explorePosed may dim them)

      // ---------------------------------------------------------------- flash-forward
      // each silhouette flashes on its 8th and holds (a slow push) until the next cut; then all
      // four collapse, turning, into the point
      const col = ramp(t, tCol, pA, ease.inCubic);
      for (let k = 0; k < icons.length; k++) {
        const ic = icons[k];
        const own = t >= ic.t0 && t < ic.t0 + 2 * STEP;
        const inCol = t >= tCol && t < pA;
        ic.g.visible = own || inCol;
        if (!ic.g.visible) continue;
        const u = own ? (t - ic.t0) / (2 * STEP) : 1;
        const punch = own ? Math.exp(-(t - ic.t0) * 30) : 0;
        const s = own ? 0.9 + 0.14 * u + 0.08 * punch : 1.04 * (1 - col);
        ic.g.scale.setScalar(Math.max(1e-3, s));
        ic.g.rotation.z = inCol ? col * (k % 2 ? 0.9 : -0.9) : 0;
        const op = own ? 1 : 0.55 + 0.45 * col;
        const inten = own ? 1.4 + 2.6 * punch : 1.6 + 2.5 * col;
        for (const { obj, d } of ic.parts) {
          obj.progress = own ? ease.outQuart(sat((t - ic.t0 - d) / ICON_DRAW)) : 1;
          obj.opacity = op;
          obj.intensity = inten * (obj.isLineSegments ? 0.65 : 1);
        }
      }

      // ---------------------------------------------------------------- the point
      const pOn = ramp(t, pA, pA + 0.2, ease.outCubic);
      const pp = pulse(T, { decay: 5 });
      const pointFade = 1 - ramp(t, fT - 0.05, fT + 0.2);
      point.visible = pointCore.visible = pOn > 0 && pointFade > 0;
      const flash = Math.exp(-Math.max(0, t - pA) * 6) * pOn;
      point.scale.setScalar((0.06 + flash * 0.25 + pp * 0.012) * camD * pOn);
      point.material.opacity = pointFade;
      pointCore.scale.setScalar((0.012 + flash * 0.03) * camD * pOn);
      pointCore.material.opacity = pointFade;

      // ---------------------------------------------------------------- grid
      const gridFade = 1 - ramp(t, fT + 0.08, fT + 0.2);
      grid.visible = gridFade > 0.001 && t > g0 - 0.01;
      const gDim = lerp(1, 0.75, ramp(t, g1, fT + 0.1));
      for (const a of anims) {
        a.obj.progress = a.fn(sat((t - a.t0) / (a.t1 - a.t0)));
        a.obj.opacity = gridFade * gDim * a.op;
      }
      for (const { l, t0 } of labels) { l.reveal = ramp(t, t0, t0 + 0.25, ease.outCubic); l.opacity = gridFade * (t > t0 ? 0.85 : 0); }

      // ---------------------------------------------------------------- layers
      for (const L of layers) {
        const b = L.base;
        const appear = ramp(t, L.t0, L.t0 + 0.45, ease.outCubic);
        const d = camPos.z - (b.z);                    // distance ahead of camera
        const distFade = sat((40 - d) / 14) * sat((d + 0.3) / 1.2);
        L.m.position.set(b.x + b.dx * t * 0.3 - Math.sign(b.x) * (1 - appear) * 0.8, b.y + b.dy * t * 0.3, b.z + (1 - appear) * -1.5);
        L.m.rotation.set(b.rx, b.ry + (1 - appear) * 0.6 * Math.sign(b.x), b.rz + b.spin * t);
        const op = appear * distFade * (1 - ramp(t, tL - 0.4, tL - 0.1));
        L.mat.opacity = L.ink ? op * 0.9 : op;
        L.m.visible = op > 0.002;
      }
      const farOp = ramp(t, tL - 0.9, tL + 0.1) * (1 - ramp(t, 7.0, 7.8)) * 0.5;
      for (let i = 0; i < farLayers.length; i++) { farLayers[i].material.opacity = farOp; farLayers[i].visible = farOp > 0.002; farLayers[i].rotation.z = (i - 1) * 0.3 + t * 0.03 * (i % 2 ? 1 : -1); }

      dust.tick(t, info);
      dust.u.opacity = 0.55 * ramp(t, tIgn, pA);

      // ---------------------------------------------------------------- title particles
      // they accelerate into the letters and all land exactly on the SLAM
      titleParticles.tick(t, info);
      const mix = ramp(t, tA - 0.1, tL, ease.inQuad);
      titleParticles.u.mix = mix;
      titleParticles.u.noise = 0.05 + 0.25 * (1 - mix);
      const burst = ramp(t, l3, l3 + 1.2, ease.outCubic);
      titleParticles.u.scatter = burst * 3;
      titleParticles.u.swirl = burst * 0.3;
      const pOp = ramp(t, fT + 0.1, tA + 0.35) * lerp(1, 0.05, ramp(t, tL - 0.04, tL + 0.12)) * (1 - ramp(t, l3 + 0.05, l3 + 0.55));
      titleParticles.u.opacity = pOp;
      titleParticles.visible = pOp > 0.002;
      titleParticles.u.intensity = lerp(0.9, 1.4, mix) + 0.35 * ramp(t, tL - 0.25, tL, ease.inQuad) * (t < tL ? 1 : 0);
      titleParticles.u.size = lerp(0.032, 0.026, mix);

      // ---------------------------------------------------------------- title glyphs
      const flatOn = ramp(t, tL - 0.03, tL + 0.05, ease.outCubic);
      const glowK = flatOn * (1 - 0.96 * ramp(t, l3 - 0.1, l3 + 0.7));
      // once extruded and tumbling, glyphs turned away from the key went pure black and vanished from the words
      // (A, V, E of ACHIEVEMENTS): a faint self-glow keeps every letter legible against the dark
      const floorK = 0.12 * ramp(t, l3, l3 + 0.5);
      const heat = decay(t, tL - 0.03, 6);             // white-hot on the SLAM, cooling to gold
      marbleMat.emissiveIntensity = (0.55 + 0.9 * heat) * glowK + floorK;
      goldMat.emissiveIntensity = (0.7 + 1.0 * heat) * glowK + floorK * 0.6;
      bronzeMat.emissiveIntensity = (0.7 + 1.0 * heat) * glowK + floorK * 0.6;
      const flyK = ramp(t, lf, 8.0, ease.inQuad);
      const punch = 1 + 0.06 * decay(t, tL, 16);          // the letters land a touch large and settle
      for (const g of glyphs) {
        const vis = flatOn > 0.001;
        g.mesh.visible = vis;
        if (!vis) continue;
        const delay = (g.line === 0 ? 0.1 : 0) + Math.abs(g.u - 0.5) * 0.35;
        const ex = ramp(t, l3 + delay, l3 + delay + 0.55, ease.inOutCubic);
        g.mesh.scale.set(g.s, g.s, lerp(0.02, g.s * 0.72, ex));   // a shallower extrusion: tightly tracked glyphs no longer interpenetrate when seen from the orbit
        const lockS = lerp(0.985, 1, flatOn) * punch;
        g.mesh.scale.x *= lockS; g.mesh.scale.y *= lockS;
        const rot = ex * (g.rnd[0] - 0.5) * 0.24 + flyK * (g.rnd[1] - 0.5) * 1.6;
        g.mesh.rotation.set(flyK * (g.rnd[2] - 0.5) * 0.8, rot, flyK * (g.rnd[3] - 0.5) * 0.4);
        const side = g.line === 0 ? 1 : -1;
        g.mesh.position.set(
          g.base.x * (1 + flyK * 0.25) * punch,
          (g.base.y - 0.33) * punch + 0.33 + side * flyK * (0.45 + g.rnd[0] * 0.9),
          g.base.z + ex * (g.rnd[1] - 0.5) * 0.3 + flyK * lerp(-15, 3.5, g.rnd[2]),
        );
      }

      // the SLAM's light: rays, ring, sparks
      raysU.uI.value = aS >= -0.02 ? (0.3 + 0.45 * Math.exp(-Math.max(0, aS) * 6)) * Math.exp(-Math.max(0, aS) * 0.7) * (1 - ramp(t, l3 - 0.4, l3 + 0.2)) : 0;
      raysU.uLen.value = 0.12 + 0.7 * ease.outCubic(sat(aS / 0.4));
      raysU.uRot.value = t * 0.012;
      rays.visible = raysU.uI.value > 0.003;
      slamRingU.uR.value = ease.outCubic(sat(aS / 0.8));
      slamRingU.uW.value = 0.01 + 0.03 * slamRingU.uR.value;
      slamRingU.uI.value = aS >= 0 ? 0.5 * (1 - slamRingU.uR.value) ** 1.5 * sat(aS / 0.03) : 0;
      slamRing.visible = aS >= 0 && aS < 0.8;
      sparksT.tick(t, info.height);

      // HUD streak: both hits (the film centres the burst and the title on the frame)
      // (a quick flash on each hit: a slow, wide streak lingered behind the headings as a flat rectangle)
      streakU.uI.value = 1.1 * (aI >= 0 ? Math.exp(-aI * 10) : 0.1 * pre) + 0.5 * (aS >= 0 ? Math.exp(-aS * 30) : 0) + 0.1 * cut / 0.004;
      streak.scale.y = aS >= 0 ? 0.16 : 0.26;
      streak.scale.x = FILM_ASPECT * (1.05 + 0.6 * Math.exp(-Math.max(0, Math.min(aI >= 0 ? aI : 9, aS >= 0 ? aS : 9)) * 3));
      streak.visible = streakU.uI.value > 0.003;

      // subtitle
      const sT = cue('subtitle');
      const subOut = 1 - ramp(t, l3 - 0.1, l3 + 0.35);
      sub.visible = t > sT - 0.05 && subOut > 0;
      if (sub.visible) {
        for (const L of sub.letters) {
          const d = Math.abs(L.u - 0.5) * 0.55;
          const k = ramp(t, sT + d, sT + d + 0.45, ease.outCubic);
          L.mesh.opacity = k * subOut;
          L.mesh.position.set(L.base.x * lerp(1.12, 1, k), L.base.y - (1 - k) * 0.12 + (1 - subOut) * -0.2, L.base.z);
          L.mesh.intensity = 1.0 + (1 - k) * 1.5;
        }
      }
      const rp = ramp(t, sT - 0.25, sT + 0.5, ease.outCubic);
      ruleL.progress = ruleR.progress = rp;
      ruleL.opacity = ruleR.opacity = subOut * 0.9;

      // ---------------------------------------------------------------- lights & glow
      const is3D = ramp(t, l3 - 0.2, l3 + 0.6);
      key.intensity = lerp(1.2, 1.7, is3D);
      key.position.set(lerp(-6, -3, is3D), 7, Z_TITLE + 12);
      key.target.position.set(0, 0, Z_TITLE);
      rim.intensity = lerp(0.2, 0.7, is3D);
      rim.target.position.set(0, 0, Z_TITLE);
      rim.position.set(3 - 6 * ramp(t, l3, 8), 9, Z_TITLE - 8);
      // light sweep across the letters right after the SLAM, and again as they turn 3D
      const sw = ramp(t, tL - 0.05, tL + 1.0, ease.inOutSine);
      const sw2 = ramp(t, l3, l3 + 1.2, ease.inOutSine);
      sweep.position.set(lerp(-8, 8, t < l3 ? sw : sw2), 0.6, Z_TITLE + 2.2);
      sweep.intensity = 9 * envelope(t, tL - 0.05, tL + 1.0, 0.05, 0.45);

      const bOn = ramp(t, 6.4, 8.0, ease.inQuad);
      beyond.material.color.setRGB(1.0, 0.72, 0.4).multiplyScalar(0.1 + bOn * 0.6);
      beyondCore.material.color.setRGB(1.0, 0.92, 0.78).multiplyScalar(0.2 + bOn * 1.4);
      beyond.visible = beyondCore.visible = t > fT + 0.5;
      halo.material.color.setRGB(1.0, 0.68, 0.36).multiplyScalar(0.09 * ramp(t, tL - 0.4, tL + 0.3) * (1 - ramp(t, 7.2, 7.8)) + 0.05 * pulse(T, { decay: 3 }) * ramp(t, tL, tL + 0.4) + 0.035 * slam ** 6);
      halo.visible = t > tL - 0.5;
      shaft.material.uniforms.uIntensity.value = 0.08 * ramp(t, tL, tL + 0.9) * (1 - ramp(t, 7.0, 7.6));
      shaft.material.uniforms.uTime.value = t;

      // ---------------------------------------------------------------- post
      dof.range = 4.5;
      dof.amount = 0.35 * envelope(t, l3 - 0.2, 7.55, 0.4, 0.3);
      // while the lens is sharp the focus distance is unused by the film; it is where Explore 3D pivots,
      // so point it at what the shot is about: the construction plane, then the manuscripts, then the title
      dof.focus = Math.max(1, camPos.z - Z_TITLE);
      if (dof.amount <= 0.01 && t < tL - 0.4) dof.focus = t < fT + 0.15 ? Math.max(1, camPos.z) : 7;
      lastT = t;
      // a frame or two of flash on each hit (never a white-out: the plate is mostly black)
      api.exposure = 1 + 0.55 * (aI >= 0 ? Math.exp(-aI * 26) : 0) + 0.22 * (aS >= 0 ? Math.exp(-aS * 22) : 0);
      bloom.strength = 0.75 + 0.25 * envelope(t, pA, pA + 0.6, 0.05, 0.5) + 0.15 * ramp(t, 7.0, 8.0) + 0.45 * ign ** 3 + 0.25 * slam ** 6;
    },
  };
  return api;
}
