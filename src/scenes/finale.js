// FINALE (54.0–72.0 s) — an unhurried coda: from the montage's stars to an orbital sunrise.
//
//   54.0  dissolve in: montage stars stream away as the camera pulls back fast; only the
//         dark limb of Earth, rim-lit by a hidden sun, sits at the bottom of frame
//   54.5  pullBack    — speed ramp: the camera decelerates majestically, tilts down; the
//                       streaming stars curve into orbit and become a halo of golden motes
//   55.5  earthReveal — sunlight sweeps across a large procedural Earth (≈70 % of the
//                       square): oceans with glint, deserts, forests, clouds with shadows,
//                       city lights on the night side, a thin blue limb. Four luminous
//                       orbital arcs trace themselves around it.
//   56.5  storyOne    — "From the agora to the Moon," (Cormorant italic, per-letter)
//   58.5  storyTwo    — "twenty-five centuries of reason, courage and invention."
//   61.0  ideasLine   — IDEAS BUILD UPON IDEAS. (Cinzel, tracking in) while the camera
//                       begins to push in and tilt up towards the limb
//   63.4  ideasOut
//   63.6  sunrise     — the limb catches fire (Mie forward scattering); ≈64.1 the sun breaks
//                       over the horizon: hot core, restrained anamorphic streak, golden wash
//   65.0  finalImpact — ACHIEVEMENTS / OF WESTERN CIVILIZATION lands above the sunlit limb:
//                       heat cooling to gold, light sweep, hairline rule, a shockwave through
//                       the motes
//   66.8  closingLine — THE JOURNEY CONTINUES
//   67–70 calm hold: slow drift, the sun settles higher, the flare relaxes
//   70.0  fadeOut     — everything eases down to black by 72.0 (engine adds its last 0.6 s)
// Composed for the 1:1 delivery first (typography in the dark sky above Earth); the 2.39
// layout moves the story to the left of an Earth framed on the right.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../timeline.js';
import { FILM } from '../film.js';
import { TextPlane, KineticText, FONTS } from '../lib/text.js';
import { MorphParticles } from '../lib/particles.js';
import { sat, lerp, smoothstep, ease, rng, envelope, timeWarp, TAU } from '../lib/math.js';
import { makeRig, EARTH_R } from './finale-rig.js';
import { bakeEarth, earthVert, earthFrag, atmoVert, atmoFrag } from './finale-earth.js';

const R = EARTH_R;
const EARTH_SPIN0 = FILM.finale?.spin ?? 1.1;   // (each film turns its own lands toward the sunrise)

// ---- motes: the montage's stars → streaming → orbital halo ---------------------------
const moteCommon = /* glsl */ `
attribute vec3 aStart;
attribute vec4 aOrb;    // radius, inclination, node, phase
attribute vec4 aSeed;
attribute vec3 aColor;
uniform float uT, uForm, uStagger, uTravel, uWaveR, uWaveAmp;
uniform vec3 uFlow;
float gM; float gWave;
vec3 motePos(){
  float r = aOrb.x;
  float th = aOrb.w + uT * 0.16 * pow(r / ${(R * 1.3).toFixed(3)}, -1.5) * (0.75 + 0.5 * aSeed.x);
  vec3 p = vec3(cos(th), (aSeed.y - 0.5) * 0.03, sin(th)) * r;
  float ci = cos(aOrb.y), si = sin(aOrb.y);
  p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
  float cn = cos(aOrb.z), sn = sin(aOrb.z);
  p = vec3(cn * p.x + sn * p.z, p.y, -sn * p.x + cn * p.z);
  vec3 s = aStart + uFlow * uTravel * (0.6 + 0.8 * aSeed.w);
  float m = clamp((uForm - aSeed.z * uStagger) / (1.0 - uStagger), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  gM = m;
  vec3 q = mix(s, p, m);
  // fall into orbit along a curve rather than a straight line
  q += cross(normalize(p), vec3(0.0, 1.0, 0.0)) * sin(3.14159 * m) * (0.4 + aSeed.x * 0.5);
  float rr = length(q);
  gWave = exp(-pow((rr - uWaveR) / 0.32, 2.0)) * uWaveAmp;
  q += q / max(rr, 1e-3) * gWave * 0.09;
  return q;
}`;
const moteVert = /* glsl */ `
${moteCommon}
uniform float uSize, uViewport, uMaxPx, uTwinkle;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec3 q = motePos();
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = uSize * (0.35 + 1.3 * aSeed.w * aSeed.w);
  gl_PointSize = clamp(s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z), 1.0, uMaxPx);
  vColor = aColor * (1.0 + gWave * 2.5);
  float tw = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uT * (0.8 + aSeed.x * 3.0) + aSeed.y * 40.0));
  vAlpha = tw * smoothstep(0.25, 0.9, -mv.z);
}`;
const moteFrag = /* glsl */ `
uniform float uOpacity, uIntensity;
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  float o = a * vAlpha * uOpacity;
  if (o < 0.003) discard;
  gl_FragColor = vec4(vColor * uIntensity, o);
}`;
// the same motes drawn as motion streaks while they stream past (2 vertices per mote)
const streakVert = /* glsl */ `
${moteCommon}
attribute float aEnd;
uniform float uStreakLen;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec3 q = motePos();
  q -= uFlow * aEnd * uStreakLen * (0.6 + 0.8 * aSeed.w) * (1.0 - gM);
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vAlpha = (1.0 - aEnd) * (1.0 - gM) * smoothstep(0.2, 0.8, -mv.z);
}`;
const streakFrag = /* glsl */ `
uniform float uOpacity, uIntensity;
varying vec3 vColor; varying float vAlpha;
void main(){ float o = vAlpha * uOpacity; if (o < 0.003) discard; gl_FragColor = vec4(vColor * uIntensity, o); }`;

// ---- orbital arcs: thin luminous comets tracing their orbits ----------------------------
const arcVert = /* glsl */ `
varying float vU; varying vec3 vW; varying vec3 vN;
void main(){ vU = uv.x; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const arcFrag = /* glsl */ `
uniform float uHead, uLen, uIntensity, uBase, uFlash;
uniform vec3 uColor, uHeadColor;
varying float vU; varying vec3 vW; varying vec3 vN;
void main(){
  float d = fract(uHead - vU);                 // 0 at the head, growing along the tail
  float tail = uLen > 0.0 ? pow(clamp(1.0 - d / uLen, 0.0, 1.0), 2.2) : 0.0;
  float head = exp(-d * 180.0) * step(0.0, uLen) * smoothstep(0.0, 0.02, uLen);
  float edge = abs(dot(normalize(vN), normalize(cameraPosition - vW)));   // soft tube profile
  float prof = smoothstep(0.0, 0.8, edge) * smoothstep(1.3, 2.3, length(cameraPosition - vW));
  vec3 c = uColor * (tail * (1.0 + uFlash) + uBase) + uHeadColor * head * 5.0;
  float o = (tail + uBase + head) * prof;
  if (o < 0.002) discard;
  gl_FragColor = vec4(c * uIntensity * prof, 1.0);
}`;

// ---- sun core (in the 3D scene so Earth occludes it exactly) ----------------------------
const sunFrag = /* glsl */ `
uniform float uI; varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float core = smoothstep(0.1, 0.06, r);
  float glow = (exp(-r * 7.0) * 0.8 + exp(-r * 2.5) * 0.12) * smoothstep(1.0, 0.55, r);
  vec3 c = vec3(1.0, 0.97, 0.9) * core * 14.0 + vec3(1.0, 0.78, 0.5) * glow * 4.0;
  float o = max(core, glow);
  if (o * uI < 0.002) discard;
  gl_FragColor = vec4(c * uI, 1.0);
}`;
// ---- lens flare pieces (HUD, screen space) ---------------------------------------------
const flareFrag = /* glsl */ `
uniform float uI; uniform int uKind; uniform vec3 uColor; varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5;
  float a;
  if (uKind == 0) { float r = length(p) * 2.0; a = exp(-r * 4.0) * 0.8 + exp(-r * 1.6) * 0.25; a *= smoothstep(1.0, 0.7, r); }
  // (the streak tapers to a point at both tips, inside the frame: a wide, slow-falling one held over the
  // ending read as a flat glowing bar with hard ends)
  else if (uKind == 1) { float x = max(1.0 - abs(p.x) * 2.0, 0.0); a = exp(-pow(p.y * 2.0 / 0.035, 2.0)) * pow(x, 4.0) * 0.6; a += exp(-pow(p.y * 2.0 / 0.01, 2.0)) * pow(x, 2.2) * 0.8; }
  else { float r = length(p) * 2.0; a = smoothstep(1.0, 0.8, r) * smoothstep(0.35, 0.95, r) * 0.6 + smoothstep(1.0, 0.0, r) * 0.08; }
  // fade the faint tail continuously to zero (a hard cut-off showed, bloomed, as a rectangle's edge)
  a = max(a * uI - 0.003, 0.0);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const sweepFrag = /* glsl */ `
uniform sampler2D uMap; uniform float uS, uW, uOpacity; uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float a = texture2D(uMap, vUv).a;
  float x = vUv.x + (vUv.y - 0.5) * 0.12;
  float b = exp(-pow((x - uS) / uW, 2.0));
  float o = a * b * uOpacity;
  if (o < 0.002) discard;
  gl_FragColor = vec4(uColor * o, o);
}`;
const quadVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// camera-facing billboard (identical to a camera-aligned quad in the film; still faces the lens when the
// viewer explores the scene from another angle)
const billboardVert = `varying vec2 vUv; void main(){ vUv = uv; vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); c.xy += position.xy * length(modelMatrix[0].xyz); gl_Position = projectionMatrix * c; }`;

function sweepOverlay(tp) {
  const m = new THREE.Mesh(tp.geometry, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tp.material.uniforms.uMap.value }, uS: { value: -1 }, uW: { value: 0.06 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.62).multiplyScalar(1.6) } },
    vertexShader: quadVert, fragmentShader: sweepFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  m.renderOrder = 12;
  return m;
}
function flarePiece(kind, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uKind: { value: kind }, uColor: { value: new THREE.Color(color) } },
    vertexShader: quadVert, fragmentShader: flareFrag, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  m.renderOrder = 5;
  return m;
}
// visual width of a KineticText line (letter centres + one glyph)
function kineticWidth(k, h) {
  let a = Infinity, b = -Infinity;
  for (const l of k.letters) { a = Math.min(a, l.base.x); b = Math.max(b, l.base.x); }
  return b - a + h * 0.6;
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 400);
  scene.add(camera);
  // The rig, sun and every hand-tuned key below are authored on the original 54–72 s clock;
  // the timeline later moved the coda +6 s. SHIFT maps story time onto that authoring clock
  // (cues shift with it, so every beat still lands exactly on the score).
  const SHIFT = CUES.pullBack - 54.5;
  const G = (n) => CUES[n] - SHIFT;                   // cue seconds on the authoring clock (update works in it)
  const C_PULL = G('pullBack'), C_REVEAL = G('earthReveal'), C_S1 = G('storyOne'), C_S2 = G('storyTwo');
  const C_IDEAS = G('ideasLine'), C_OUT = G('ideasOut'), C_SUN = G('sunrise'), C_IMPACT = G('finalImpact');
  const C_CLOSE = G('closingLine'), C_FADE = G('fadeOut');
  const END = segment.end - SHIFT;
  const r = rng(7272);
  const rig = makeRig(THREE, { outAspect: OUTPUT_ASPECT, filmAspect: FILM_ASPECT });
  const W = rig.wide;                                 // 0 = square layout, 1 = 2.39 layout
  // harmony < 1 keeps Earth's true blues and greens out of the 60-30-10 grade
  // dof carries no blur here (amount 0, and no chapter heading racks it): its focus only tells Explore what the
  // shot looks at — the point of the view ray nearest Earth's centre — so the viewer orbits the planet
  // rather than an empty point in the sky
  // Explore limits follow the shot: the late camera rides ~0.7 above the surface, so the pull-in and the
  // pitch-down are held to what keeps the lens outside the atmosphere over the whole yaw window (checked
  // offline against the rig for both the 1:1 and 2.39 layouts; the table is the unsafe zoom + a margin)
  const ZOOM_IN = [[54, 0.3], [55.5, 0.54], [56, 0.6], [62, 0.65], [63, 0.65], [64, 0.74], [65, 0.81], [66, 0.86], [68, 0.89], [72, 0.93]];
  let exT = 58;
  const zoomInAt = (T) => {
    if (T <= ZOOM_IN[0][0]) return ZOOM_IN[0][1];
    for (let i = 1; i < ZOOM_IN.length; i++) if (T <= ZOOM_IN[i][0]) { const [a, va] = ZOOM_IN[i - 1], [b, vb] = ZOOM_IN[i]; return lerp(va, vb, (T - a) / (b - a)); }
    return ZOOM_IN[ZOOM_IN.length - 1][1];
  };
  const self = {
    scene, camera, background: 0x000000, bloom: { strength: 0.6 }, exposure: 1, harmony: 0.3, update, dof: { focus: 5, range: 3, amount: 0 },
    get exploreLimits() { return { zoomIn: zoomInAt(exT), zoomOut: 3, fly: 1.5, pitchDown: exT < 62 ? 0.35 : 0.05 }; },
  };

  // ---- Earth -----------------------------------------------------------------------
  const maps = bakeEarth(ctx.renderer, { width: ctx.engine?.quality === 'lite' ? 1024 : 4096 });   // (phones: 1024 — 4096² maps are 90 MB)
  const sunDir = new THREE.Vector3(0, 0, -1), sunObj = new THREE.Vector3(), shadeDir = new THREE.Vector3();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uSurf: { value: maps.surf }, uAux: { value: maps.aux }, uSun: { value: sunDir }, uSunObj: { value: sunObj }, uShade: { value: shadeDir },
      uCloudOff: { value: 0 }, uCity: { value: 1 }, uBright: { value: 1 }, uWarm: { value: 0 }, uTime: { value: 0 },
    },
    vertexShader: earthVert, fragmentShader: earthFrag,
  });
  const tilt = new THREE.Group();
  tilt.rotation.set(0.12, 0, 0.41);
  scene.add(tilt);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 160), earthMat);
  tilt.add(earth);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uShade: { value: shadeDir }, uR: { value: R }, uHs: { value: R * 0.0085 }, uAtmo: { value: 1 }, uMie: { value: 0 }, uWarm: { value: 0 } },
    vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.07, 160, 96), atmoMat);
  atmo.renderOrder = 3;
  scene.add(atmo);

  // ---- distant stars -----------------------------------------------------------------
  const NB = 5000, bp = new Float32Array(NB * 3), bc = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = 110 + r() * 40;
    bp.set([s * Math.cos(th) * d, u * d, s * Math.sin(th) * d], i * 3);
    const warm = r();
    bc.set([0.85 + 0.15 * warm, 0.88 + 0.06 * warm, 1.0 - 0.2 * warm], i * 3);
  }
  const bg = new MorphParticles({ count: NB, positions: bp, colors: bc, size: 0.32, intensity: 0.85, color: '#ffffff', seed: 3 });
  bg.u.twinkle = 0.45; bg.u.sizeJitter = 0.85;
  scene.add(bg);

  // ---- orbital families (shared by arcs and motes) -------------------------------------
  const FAM = [
    { r: 1.13, inc: 0.30, node: 0.5, speed: 0.021, head: 0.10, len: 0.34 },
    { r: 1.21, inc: -0.46, node: 1.9, speed: -0.016, head: 0.55, len: 0.28 },
    { r: 1.30, inc: 0.12, node: 3.4, speed: 0.013, head: 0.80, len: 0.40 },
    { r: 1.39, inc: 0.72, node: 5.0, speed: -0.011, head: 0.30, len: 0.25 },
  ];
  const arcs = FAM.map((f, i) => {
    const pts = [];
    for (let k = 0; k <= 256; k++) { const a = (k / 256) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * f.r * R, 0, Math.sin(a) * f.r * R)); }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const geo = new THREE.TubeGeometry(curve, 720, 0.0042, 6, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uHead: { value: 0 }, uLen: { value: 0 }, uIntensity: { value: 1 }, uBase: { value: 0.03 }, uFlash: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.72, 0.36).multiplyScalar(1.1) }, uHeadColor: { value: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(0.45) },
      },
      vertexShader: arcVert, fragmentShader: arcFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.set(0, f.node, 0, 'YXZ');
    const g = new THREE.Group(); g.add(mesh);
    mesh.rotation.set(f.inc, 0, 0); g.rotation.y = f.node;
    mesh.renderOrder = 4;
    scene.add(g);
    return { f, mesh, mat, i };
  });

  // ---- motes ---------------------------------------------------------------------------
  const NM = 6500, NS = 2200;
  const aStart = new Float32Array(NM * 3), aOrb = new Float32Array(NM * 4), aSeed = new Float32Array(NM * 4), aColor = new Float32Array(NM * 3);
  const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion(), p1 = new THREE.Vector3(), q1 = new THREE.Quaternion();
  rig.pose(54.0, p0, q0); rig.pose(55.5, p1, q1);
  const RUSH = p0.distanceTo(p1);
  const flow = p1.clone().sub(p0).normalize();                           // the camera rushes forward along it, through the stars
  const camR = new THREE.Vector3(1, 0, 0).applyQuaternion(q0), camU = new THREE.Vector3(0, 1, 0).applyQuaternion(q0);
  const gold = new THREE.Color(1.0, 0.7, 0.36), pale = new THREE.Color(1.0, 0.88, 0.68), cool = new THREE.Color(0.8, 0.88, 1.0);
  const col = new THREE.Color(), tv = new THREE.Vector3();
  for (let i = 0; i < NM; i++) {
    const u = r();
    let rad, inc, node;
    if (u < 0.55) { const f = FAM[Math.floor(r() * FAM.length)]; rad = f.r * R * (1 + (r() - 0.5) * 0.035); inc = f.inc + (r() - 0.5) * 0.03; node = f.node + (r() - 0.5) * 0.03; }
    else { rad = R * (1.08 + Math.pow(r(), 1.6) * 0.85); inc = Math.acos(r() * 2 - 1) - Math.PI / 2; node = r() * TAU; }
    aOrb.set([rad, inc, node, r() * TAU], i * 4);
    aSeed.set([r(), r(), r(), r()], i * 4);
    // start: a tube of stars around the rush path (static in world space — the lens flies through them),
    // thinning towards Earth so the planet reads clearly as it grows
    let along, ang, rr;
    do {
      along = 0.6 + Math.pow(r(), 1.35) * (RUSH + 1.0); ang = r() * TAU; rr = 0.3 + Math.pow(r(), 0.7) * 3.4;
      tv.copy(p0).addScaledVector(flow, along).addScaledVector(camR, Math.cos(ang) * rr * 1.2).addScaledVector(camU, Math.sin(ang) * rr);
    } while (tv.length() < R * 1.35);
    aStart.set([tv.x, tv.y, tv.z], i * 3);
    const k = (rad / R - 1.08) / 0.85;
    col.copy(gold).lerp(pale, sat(k * 1.6 + (r() - 0.5) * 0.5)).lerp(cool, sat(k * 1.4 - 0.4 + (r() - 0.5) * 0.4));
    const b = 0.5 + r() * 0.7;
    aColor.set([col.r * b, col.g * b, col.b * b], i * 3);
  }
  const moteUniforms = {
    uT: { value: 0 }, uForm: { value: 0 }, uStagger: { value: 0.6 }, uTravel: { value: 0 }, uFlow: { value: flow },
    uWaveR: { value: -10 }, uWaveAmp: { value: 0 },
  };
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(aStart, 3));
  mg.setAttribute('aStart', new THREE.BufferAttribute(aStart, 3));
  mg.setAttribute('aOrb', new THREE.BufferAttribute(aOrb, 4));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
  mg.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
  const moteMat = new THREE.ShaderMaterial({
    uniforms: { ...moteUniforms, uSize: { value: 0.012 }, uViewport: { value: 800 }, uMaxPx: { value: 5 }, uTwinkle: { value: 0.4 }, uOpacity: { value: 1 }, uIntensity: { value: 1.6 } },
    vertexShader: moteVert, fragmentShader: moteFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const motes = new THREE.Points(mg, moteMat);
  motes.frustumCulled = false; motes.renderOrder = 5;
  scene.add(motes);
  // streaks for the first NS motes
  const sg = new THREE.BufferGeometry();
  const dup = (src, n) => { const o = new Float32Array(NS * 2 * n); for (let i = 0; i < NS; i++) for (let e = 0; e < 2; e++) for (let c = 0; c < n; c++) o[(i * 2 + e) * n + c] = src[i * n + c]; return o; };
  const sStart = dup(aStart, 3);
  sg.setAttribute('position', new THREE.BufferAttribute(sStart, 3));
  sg.setAttribute('aStart', new THREE.BufferAttribute(sStart, 3));
  sg.setAttribute('aOrb', new THREE.BufferAttribute(dup(aOrb, 4), 4));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(dup(aSeed, 4), 4));
  sg.setAttribute('aColor', new THREE.BufferAttribute(dup(aColor, 3), 3));
  const aEnd = new Float32Array(NS * 2); for (let i = 0; i < NS; i++) aEnd[i * 2 + 1] = 1;
  sg.setAttribute('aEnd', new THREE.BufferAttribute(aEnd, 1));
  const streakMat = new THREE.ShaderMaterial({
    uniforms: { ...moteUniforms, uStreakLen: { value: 0 }, uOpacity: { value: 1 }, uIntensity: { value: 1.2 } },
    vertexShader: streakVert, fragmentShader: streakFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const streaks = new THREE.LineSegments(sg, streakMat);
  streaks.frustumCulled = false; streaks.renderOrder = 5;
  scene.add(streaks);

  // ---- sun core -------------------------------------------------------------------------
  const sunCore = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } }, vertexShader: billboardVert, fragmentShader: sunFrag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sunCore.renderOrder = 6;
  scene.add(sunCore);

  // ---- HUD: typography + lens flare (x ∈ [-2.39, 2.39], y ∈ [-M, M]) ------------------------
  const hud = ctx.makeHUD();
  self.hud = hud;
  const M = FILM_ASPECT / OUTPUT_ASPECT;
  const HX = FILM_ASPECT;
  // (no anamorphic streak: over the long sunrise hold, bloom smeared its bright core line into a flat,
  // hard-edged band beside the sun; the sun's own glow and the bloom carry the flare)
  const flareGlow = flarePiece(0, '#ffd9a8'), ghostA = flarePiece(2, '#9fc4ff'), ghostB = flarePiece(2, '#ffcf96');
  hud.scene.add(flareGlow, ghostA, ghostB);

  const L = (sq, wd) => lerp(sq, wd, W);
  // story (Cormorant italic, per-letter)
  const story1 = new KineticText(FILM.finale?.story1 ?? 'From the agora to the Moon,', { font: FONTS.serif, italic: true, weight: 500, height: 0.2, letterSpacing: 0.01, color: '#f1e6d0', intensity: 1.0 });
  const story2 = new KineticText(FILM.finale?.story2 ?? 'twenty-five centuries of reason, courage and invention.', { font: FONTS.serif, italic: true, weight: 400, height: 0.2, letterSpacing: 0.012, color: '#e7dcc6', intensity: 0.95 });
  story1.scale.setScalar(L(3.05, 1.7) / kineticWidth(story1, 0.2));
  story2.scale.setScalar(L(4.15, 2.05) / kineticWidth(story2, 0.2));
  story1.position.set(L(0, -1.1), L(0.735, 0.16) * M, 0);
  story2.position.set(L(0, -1.1), L(0.585, 0.0) * M, 0);
  hud.scene.add(story1, story2);
  // IDEAS BUILD UPON IDEAS.
  const ideas = new KineticText('IDEAS BUILD UPON IDEAS.', { font: FONTS.display, weight: 400, height: 0.2, letterSpacing: 0.32, color: '#f6ead2', intensity: 1.05 });
  const ideasScale = L(3.7, 2.05) / kineticWidth(ideas, 0.2);
  ideas.scale.setScalar(ideasScale);
  ideas.position.set(L(0, -1.1), L(0.66, 0.08) * M, 0);
  hud.scene.add(ideas);
  // title
  const title = new TextPlane('ACHIEVEMENTS', { font: FONTS.display, weight: 600, height: 0.3, letterSpacing: 0.12, color: '#f4e3c1', intensity: 1.0, depthWrite: false });
  const sub = new TextPlane(FILM.finale?.title2 ?? 'OF WESTERN CIVILIZATION', { font: FONTS.display, weight: 400, height: 0.3, letterSpacing: 0.34, color: '#ecdfc4', intensity: 0.95, depthWrite: false });
  const inkW = (tp, h) => tp.worldWidth - 0.25 * h * 2;
  const titleW = L(3.75, 2.55);
  const tS = titleW / inkW(title, 0.3), sS = (titleW * 0.985) / inkW(sub, 0.3);
  const titleH = 0.3 * tS, subH = 0.3 * sS;
  const titleY = L(0.53, 0.5) * M;
  const subY = titleY - titleH * 0.62 - subH * 0.62;
  title.position.set(0, titleY, 0); sub.position.set(0, subY, 0);
  const sweepT = sweepOverlay(title), sweepS = sweepOverlay(sub);
  sweepT.position.copy(title.position); sweepS.position.copy(sub.position);
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.84, 0.58).multiplyScalar(1.2), transparent: true, depthWrite: false, depthTest: false }));
  // centred in the VISIBLE gap (caps baseline → sub-heading cap line), a touch nearer the title so it never touches the sub-heading
  rule.position.set(0, (titleY - titleH * 0.5 + subY + subH * 0.5) / 2 + 0.002 + 0.13 * (titleY - subY), 0);
  rule.renderOrder = 11;
  // the title's subtitle (italic serif), then the closing line
  const world = new TextPlane(FILM.finale?.world ?? 'Built on the ideas of the whole world', { font: FONTS.serif, italic: true, weight: 500, height: 0.2, color: '#f1e2c6', intensity: 1.0, depthWrite: false });
  const wS = L(1.9, 1.35) / inkW(world, 0.2);
  world.scale.setScalar(wS);
  let worldY = subY - subH * 0.5 - L(0.2, 0.13) * M * 0.5 - 0.2 * wS * 0.5;
  // a film's closing words in their own script (the Indian film: वसुधैव कुटुम्बकम्, Vasudhaiva Kutumbakam),
  // in gold between the title and its translation
  let sanskrit = null;
  if (FILM.finale?.sanskrit) {
    sanskrit = new TextPlane(FILM.finale.sanskrit, { font: FONTS.deva, weight: 400, height: 0.2, color: '#f2d79c', intensity: 1.15, depthWrite: false });
    const kS = L(2.3, 1.55) / inkW(sanskrit, 0.2);
    sanskrit.scale.setScalar(kS);
    const kY = subY - subH * 0.5 - L(0.24, 0.16) * M * 0.5 - 0.2 * kS * 0.5;
    sanskrit.position.set(0, kY, 0);
    sanskrit.renderOrder = 10;
    hud.scene.add(sanskrit);
    worldY = kY - 0.2 * kS * 0.55 - L(0.12, 0.09) * M * 0.5 - 0.2 * wS * 0.5;
  }
  world.position.set(0, worldY, 0);
  const closing = new TextPlane('THE JOURNEY CONTINUES', { font: FONTS.mono, weight: 400, height: 0.2, letterSpacing: 0.62, color: '#e2e8f1', intensity: 0.95, depthWrite: false, soft: 0.25 });
  const cS = L(2.45, 1.6) / inkW(closing, 0.2);
  closing.scale.setScalar(cS);
  closing.position.set(0, worldY - 0.2 * wS * 0.5 - L(0.26, 0.17) * M * 0.5 - 0.2 * cS * 0.5, 0);
  hud.scene.add(title, sub, sweepT, sweepS, rule, world, closing);
  for (const o of [title, sub, world, closing]) o.renderOrder = 10;
  const TITLE_GOLD = new THREE.Color('#f4e3c1'), SUB_GOLD = new THREE.Color('#ecdfc4');

  // ---- per-frame scratch ----------------------------------------------------------------------
  const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), qa = new THREE.Quaternion();
  const ndc = new THREE.Vector3(), cdir = new THREE.Vector3(), inv = new THREE.Quaternion();
  const sPos = new THREE.Vector3(), sQuat = new THREE.Quaternion();

  // the HUD flare sits where the sun projects through the lens; the live camera keeps the HUD on, so it is
  // re-placed through the viewer's lens after that camera is posed (update() places it for the film's)
  let flareK = 0;
  const flareQ = new THREE.Quaternion();
  function placeFlare(q, fov) {
    rig.projectDir(sunDir, q, ndc);
    const fk = Math.tan(THREE.MathUtils.degToRad(17.5)) / Math.tan(THREE.MathUtils.degToRad(fov / 2));   // rig assumes fov 35
    ndc.x *= fk; ndc.y *= fk;
    const onScreen = ndc.z < 0 ? 1 : 0;
    const fl = onScreen * flareK;
    const sx = ndc.x * HX, sy = ndc.y * M;
    flareGlow.position.set(sx, sy, 0); flareGlow.scale.setScalar(L(1.3, 0.8));
    flareGlow.material.uniforms.uI.value = fl * 0.3;
    ghostA.position.set(-sx * 0.55, -sy * 0.55, 0); ghostA.scale.setScalar(0.22);
    ghostA.material.uniforms.uI.value = 0;
    ghostB.position.set(-sx * 1.1, -sy * 1.1, 0); ghostB.scale.setScalar(0.42);
    ghostB.material.uniforms.uI.value = 0;
    flareGlow.visible = flareGlow.material.uniforms.uI.value > 0.002;
    ghostA.visible = ghostB.visible = false;
  }
  self.explorePosed = (cam) => { cam.getWorldQuaternion(flareQ); placeFlare(flareQ, cam.fov); };

  function update(t, info) {
    const T = segment.start + t - SHIFT;

    // camera
    const d = rig.pose(T, pos, quat);
    camera.position.copy(pos);
    camera.quaternion.copy(quat);
    // tension → release: the lens slowly tightens on the darkening night side, holds its breath,
    // then opens up as the sun breaks over the limb
    const tighten = ease.inOutSine(sat((T - (C_S2 + 1.5)) / (C_OUT - C_S2 - 1.5)));
    const open = ease.inOutCubic(sat((T - C_SUN) / 2.2));
    camera.fov = 35 - 3.5 * tighten * (1 - open) + 1.2 * open;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // explore pivot: where the view ray passes nearest Earth's centre; when it only grazes the planet (the
    // sunrise shots look up past the limb), slide out along the ray to 2.6 so the pivot sits in open sky
    cdir.set(0, 0, -1).applyQuaternion(quat);
    let fo = -pos.dot(cdir);
    const h2 = pos.lengthSq() - fo * fo;
    if (h2 > (R * 0.9) ** 2 && h2 < 2.6 * 2.6) fo += Math.sqrt(2.6 * 2.6 - h2);
    self.dof.focus = Math.min(8, Math.max(1.5, fo));
    exT = T;

    // sun + Earth
    rig.sun(T, pos, quat, sunDir);
    earth.rotation.y = EARTH_SPIN0 + (T - 54) * 0.018;
    earth.updateMatrixWorld();
    inv.copy(earth.getWorldQuaternion(qa)).invert();
    // at sunrise the shading light leans towards the camera so a golden crescent washes over the clouds
    const lean = smoothstep(C_SUN - 0.2, C_SUN + 1.4, T) * 0.44;
    shadeDir.copy(sunDir).lerp(cdir.copy(pos).normalize(), lean).normalize();
    sunObj.copy(shadeDir).applyQuaternion(inv);
    const eu = earthMat.uniforms;
    const fadeK = smoothstep(C_FADE, END, T);                     // 0 → 1 over the last two seconds
    const fade = 1 - fadeK;
    const reveal = smoothstep(54.0, 55.4, T);
    const swell = smoothstep(C_SUN, C_SUN + 1.4, T);                // the sunrise
    eu.uCloudOff.value = (T - 54) * 0.0022;
    eu.uTime.value = T - 54;
    eu.uBright.value = lerp(0.8, 1, reveal) * lerp(1, 0.55, fadeK);
    const tension = smoothstep(C_S2 + 1.5, C_OUT, T) * (1 - smoothstep(C_SUN - 0.05, C_SUN + 0.5, T));
    eu.uCity.value = lerp(0.5, 1, reveal) * fade * (1 + 0.9 * tension);   // the cities creep up out of the dark
    eu.uWarm.value = swell * 0.35;
    const au = atmoMat.uniforms;
    au.uAtmo.value = lerp(2.6, 1, reveal) * lerp(1, 0.5, fadeK) * (1 + 0.35 * tension);
    const elev = rig.sunElev(T);
    au.uMie.value = lerp(0.03, 0, smoothstep(55.6, 56.4, T)) + smoothstep(C_SUN - 0.5, C_SUN + 0.6, T) * (1.0 + 0.5 * envelope(T, C_SUN, C_IMPACT + 1.5, 0.8, 1.5)) * lerp(1, 0.6, fadeK) * L(1, 0.65);
    au.uWarm.value = swell * 0.8;

    // sun core: sits along sunDir far behind Earth; the depth test lets the limb clip it
    const sunVis = smoothstep(-0.5, 0.45, elev);                    // fraction of the disc above the limb (deg)
    sunCore.position.copy(pos).addScaledVector(sunDir, 150);
    sunCore.quaternion.copy(quat);
    sunCore.scale.setScalar(150 * 0.07 * L(1, 0.6));
    sunCore.material.uniforms.uI.value = smoothstep(C_SUN - 0.2, C_SUN + 0.3, T) * lerp(1, 0.4, fadeK);
    sunCore.visible = T > C_SUN - 0.3;

    // lens flare in screen space
    flareK = sunVis * smoothstep(C_SUN, C_SUN + 0.8, T) * (0.75 + 0.45 * envelope(T, C_SUN + 0.4, C_IMPACT + 2.2, 0.8, 1.8)) * lerp(1, 0.35, fadeK);
    placeFlare(quat, camera.fov);

    // arcs trace themselves after the pull-back, then glide
    const draw = ease.inOutSine(sat((T - 54.9) / 2.6));
    const kt = T - C_IMPACT;
    const wave = kt > 0 ? Math.exp(-kt * 0.9) : 0;
    for (const a of arcs) {
      const u = a.mat.uniforms;
      u.uHead.value = a.f.head + (T - 54) * a.f.speed + draw * 0.18 * Math.sign(a.f.speed);
      u.uLen.value = a.f.len * draw;
      u.uBase.value = 0.008 * draw;
      u.uFlash.value = (kt > 0 ? Math.exp(-Math.pow((kt - 0.25 - a.i * 0.12) / 0.25, 2)) : 0) * 1.2;
      u.uIntensity.value = (1.0 + swell * 0.35) * fade;
      a.mesh.visible = draw > 0.001;
    }

    // motes: stream away, fall into orbit, drift; shockwave on the title hit
    const travel = 0;                                               // stars hold still: the camera moves
    for (const m of [moteMat, streakMat]) {
      const u = m.uniforms;
      u.uT.value = T - 54;
      u.uForm.value = ease.inOutSine(sat((T - 54.75) / 2.4));
      u.uTravel.value = travel;
      u.uWaveR.value = kt > 0 ? R * 1.02 + kt * 1.8 : -10;
      u.uWaveAmp.value = wave;
    }
    // motion streaks from the camera's own speed (stars smear forward along the rush, easing out)
    const speed = Math.abs(rig.pose(T + 0.02, sPos, sQuat) - rig.pose(T - 0.02, sPos, sQuat)) / 0.04;
    streakMat.uniforms.uStreakLen.value = -Math.min(0.55, speed * 0.014);
    streakMat.uniforms.uOpacity.value = sat(speed / 8) * 0.5;
    streaks.visible = T < 55.8 && speed > 0.3;
    const mu = moteMat.uniforms;
    mu.uViewport.value = info.height;
    mu.uMaxPx.value = Math.max(2, 5 * info.width / 1920 * (OUTPUT_ASPECT < 1.5 ? 1.4 : 1));
    mu.uIntensity.value = (1.5 + 1.6 * (1 - reveal)) * (1 + 0.3 * swell) * fade;
    mu.uOpacity.value = 0.85;
    bg.tick(t, info);
    bg.u.opacity = fade * (1 - 0.25 * swell);

    // story lines
    const storyOut = (u) => ease.inOutSine(sat((T - (60.35 + u * 0.35)) / 0.55));
    story1.letters.forEach((l) => {
      const k = ease.outCubic(sat((T - (C_S1 + l.u * 1.1)) / 1.0));
      const o = storyOut(l.u);
      l.mesh.opacity = k * (1 - o) * fade;
      l.mesh.position.set(l.base.x, l.base.y - (1 - k) * 0.06 + o * 0.05, 0);
      l.mesh.intensity = 1.0 + (1 - k) * 0.9;
    });
    story2.letters.forEach((l) => {
      const k = ease.outCubic(sat((T - (C_S2 + l.u * 1.3)) / 1.0));
      const o = storyOut(l.u);
      l.mesh.opacity = k * (1 - o) * 0.95 * fade;
      l.mesh.position.set(l.base.x, l.base.y - (1 - k) * 0.06 + o * 0.05, 0);
      l.mesh.intensity = 0.95 + (1 - k) * 0.9;
    });
    story1.visible = T > C_S1 - 0.1 && T < 61.5;
    story2.visible = T > C_S2 - 0.1 && T < 61.5;

    // IDEAS BUILD UPON IDEAS. — letters drift in from wide tracking and settle
    ideas.letters.forEach((l, i) => {
      const k = ease.outCubic(sat((T - (C_IDEAS + l.u * 1.0)) / 1.1));
      const o = ease.inOutSine(sat((T - (C_OUT - 0.5 + l.u * 0.2)) / 0.3));
      l.mesh.opacity = k * (1 - o);
      l.mesh.position.set(l.base.x * (1 + (1 - k) * 0.08), l.base.y + o * 0.06, 0);
      l.mesh.intensity = 1.05 + (1 - k) * 1.2 + envelope(T, C_IDEAS + 1.3 + l.u * 0.6, C_IDEAS + 2.0 + l.u * 0.6, 0.3, 0.4) * 0.3;
    });
    ideas.visible = T > C_IDEAS - 0.1 && T < C_OUT + 0.1;

    // final title — lands on the hit
    const on = kt >= 0 ? 1 : 0;
    const heat = kt > 0 ? Math.exp(-kt * 2.6) : 0;
    const land = ease.outCubic(sat(kt / 1.4));
    const textFade = 1 - smoothstep(C_FADE + 0.1, END - 0.35, T);
    title.opacity = on * sat(kt / 0.1) * textFade;
    title.intensity = 1.0 + heat * 0.7;
    title.color.setRGB(1, 0.98, 0.94).lerp(TITLE_GOLD, 1 - heat);
    title.scale.set(tS * (1 + (1 - land) * 0.03), tS * (1 + (1 - land) * 0.03), 1);
    title.position.y = titleY - (1 - land) * 0.012;
    const sk = ease.outCubic(sat((kt - 0.12) / 0.9));
    sub.opacity = on * sk * textFade;
    sub.intensity = 0.95 + heat * 0.4;
    sub.color.copy(SUB_GOLD);
    sub.scale.set(sS * (1 + (1 - sk) * 0.05), sS, 1);
    const sw = sat((kt - 0.2) / 1.5);
    sweepT.scale.copy(title.scale); sweepT.position.copy(title.position);
    sweepT.material.uniforms.uS.value = lerp(-0.15, 1.15, ease.inOutSine(sw));
    sweepT.material.uniforms.uOpacity.value = on * (sw > 0 && sw < 1 ? 1 : 0) * textFade;
    const sw2 = sat((kt - 0.4) / 1.5);
    sweepS.scale.copy(sub.scale);
    sweepS.material.uniforms.uS.value = lerp(-0.15, 1.15, ease.inOutSine(sw2));
    sweepS.material.uniforms.uOpacity.value = on * (sw2 > 0 && sw2 < 1 ? 0.8 : 0) * textFade;
    sweepT.visible = sweepT.material.uniforms.uOpacity.value > 0; sweepS.visible = sweepS.material.uniforms.uOpacity.value > 0;
    const rl = ease.inOutCubic(sat((kt - 0.35) / 1.3));
    rule.scale.set(Math.max(0.001, rl * titleW * 0.42), 0.0042 * L(1.2, 1), 1);
    rule.material.opacity = rl * 0.75 * textFade;
    rule.visible = on && rl > 0;
    if (sanskrit) {
      sanskrit.opacity = sat((T - C_CLOSE + 1.2) / 0.6) * 0.95 * textFade;
      sanskrit.reveal = ease.outCubic(sat((T - C_CLOSE + 1.2) / 1.2));
    }
    world.opacity = sat((T - C_CLOSE + 0.6) / 0.5) * 0.9 * textFade;
    world.reveal = ease.outCubic(sat((T - C_CLOSE + 0.6) / 1.1));
    closing.opacity = sat((T - C_CLOSE) / 0.5) * 0.85 * textFade;
    closing.reveal = ease.outCubic(sat((T - C_CLOSE) / 1.3));

    // grade
    // held breath just before the sunrise, then the light floods in
    const hold = envelope(T, C_OUT - 0.5, C_SUN + 0.05, 0.4, 0.05);
    const release = envelope(T, C_SUN + 0.15, C_IMPACT + 1.6, 0.7, 1.8);
    self.bloom.strength = 0.55 + swell * 0.25 * (1 - smoothstep(C_IMPACT + 2, C_FADE, T) * 0.5) - 0.08 * tension + 0.22 * release;
    self.exposure = (1 - 0.2 * tension - 0.07 * hold + 0.2 * release) * lerp(1, 0.25, ease.inQuad(fadeK));
  }

  return self;
}
