// COMPUTING & DIGITAL TECHNOLOGY (38.5 – 43.0 s)
// Technique: morphing hard-surface evolution — a brass difference engine whose parts shrink,
// fly and re-arrange (with carried-over particles) into relays → vacuum tubes → transistors →
// a microprocessor; a dive through the package into a procedural die (glowing lanes, data
// pulses) matched at the same scale in a second world; then 0/1 glyph streams rise into a glowing
// neural core that grows five luminous branches of intelligence — CHAT · IMAGE · VIDEO · CODING ·
// ROBOTICS — each ending in a live UI card (see computing-ai.js); the camera then zooms into the core.
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { MorphParticles, sampleSphere } from '../lib/particles.js';
import { segmentsLine } from '../lib/lines.js';
import { canvas as mkCanvas, toTexture, brushedMetalTexture } from '../lib/textures.js';
import { glowSprite } from '../lib/materials.js';
import { buildBranches } from './computing-ai.js';

const STEEL_BLUE = '#9cc8ff';
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const DIE_K = 12;          // chip-die local units → die-world pattern units

// ------------------------------------------------------------------ procedural die layout
const DIE_GLSL = /* glsl */ `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
// energy-conserving anti-aliased line: widens with distance but keeps its average brightness
float lineE(float d, float w, float px){ float ww = max(w, px * 0.6); return (1.0 - smoothstep(ww, ww + px, d)) * (w / ww); }
vec3 dieColor(vec2 p, float time, float litR, float gain){
  vec2 fw = fwidth(p); float px = max(fw.x, fw.y) + 1e-5;
  vec2 B = floor(p / 6.0); float hb = h21(B + 0.37);
  vec3 tint = 0.5 + 0.5 * cos(6.2831 * (hb * 0.7 + vec3(0.0, 0.33, 0.67)));
  vec3 col = vec3(0.008, 0.01, 0.016) + tint * 0.008;
  float fineVis = 1.0 - smoothstep(0.012, 0.04, px);
  if (hb < 0.3) {
    vec2 f = fract(p * 16.0) - 0.5;
    float dotm = step(max(abs(f.x), abs(f.y) * 1.6), 0.28);
    col += vec3(0.028, 0.033, 0.048) * mix(0.42, dotm, fineVis);
  } else {
    float row = floor(p.y * 8.0), k = 0.5 + h21(vec2(row, 3.0));
    float fx = (p.x * 8.0 + h21(vec2(row, B.x)) * 10.0) * k;
    float cid = floor(fx), fr = fract(fx), fy = fract(p.y * 8.0);
    float rect = step(0.08, fr) * step(fr, 0.92) * step(0.16, fy) * step(fy, 0.84) * step(0.3, h21(vec2(cid, row)));
    col += vec3(0.024, 0.028, 0.038) * mix(0.35, rect, fineVis) * (0.6 + 0.4 * h21(vec2(cid, row + 1.0)));
  }
  vec2 bb = abs(fract(p / 6.0) - 0.5) * 6.0;
  float blk = lineE(3.0 - max(bb.x, bb.y), 0.02, px);
  float glow = 0.0, pul = 0.0;
  { float gx = p.x * 4.0, ix = floor(gx), d = abs(fract(gx) - 0.5) / 4.0;
    float on = step(0.45, h21(vec2(ix, floor(p.y + h21(vec2(ix, 1.3))))));
    float l = lineE(d, 0.005, px) * on;
    glow += l * 0.5;
    float hx = h21(vec2(ix, 7.7));
    pul += l * smoothstep(0.88, 1.0, fract(p.y * 0.35 - time * (0.7 + hx * 1.5) + hx * 9.0)) * step(0.5, hx); }
  { float iy = floor(p.y), d = abs(fract(p.y) - 0.5);
    float on = step(0.35, h21(vec2(floor(p.x / 3.0 + h21(vec2(2.1, iy))), iy)));
    float l = lineE(d, 0.013, px) * on;
    glow += l * 0.8;
    float hy = h21(vec2(5.5, iy));
    pul += l * smoothstep(0.9, 1.0, fract(p.x * 0.18 - time * (0.8 + hy * 1.6) + hy * 9.0)) * step(0.4, hy); }
  { float d = abs(fract(p.x / 3.0) - 0.5) * 3.0; glow += lineE(d, 0.045, px) * 0.22; }
  { float gy = p.y * 16.0, iy = floor(gy), d = abs(fract(gy) - 0.5) / 16.0;
    float on = step(0.62, h21(vec2(floor(p.x * 4.0 + h21(vec2(iy, 4.4)) * 3.0), iy)));
    glow += lineE(d, 0.0016, px) * on * fineVis * 0.5; }
  { vec2 v = abs(fract(vec2(p.x * 4.0, p.y)) - 0.5) * vec2(0.25, 1.0);
    float via = step(max(v.x, v.y), 0.018) * step(0.45, h21(floor(vec2(p.x * 4.0, p.y)))) * fineVis;
    glow += via * 1.2; }
  float r = length(p);
  float lit = smoothstep(litR, litR - 2.5, r);
  float front = smoothstep(1.5, 0.0, abs(r - litR)) * step(0.01, litR);
  vec3 lane = vec3(0.32, 0.58, 1.0);
  col += lane * (glow + blk * 0.3) * lit * gain * 0.55;
  col += vec3(0.85, 0.93, 1.0) * pul * 3.0 * lit * gain;
  col += lane * front * (glow + 0.04) * 0.6 * gain;
  return col;
}`;
function dieMaterial({ chip = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLit: { value: 0 }, uGain: { value: 1 }, uFog: { value: chip ? 0 : 0.045 } },
    vertexShader: `varying vec3 vW; varying float vD; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `${DIE_GLSL}
      uniform float uTime, uLit, uGain, uFog; varying vec3 vW; varying float vD;
      void main(){ vec2 p = ${chip ? `vW.xz * ${DIE_K.toFixed(1)}` : 'vW.xz'};
        vec3 c = dieColor(p, uTime, uLit, uGain);
        c *= exp(-vD * uFog);
        gl_FragColor = vec4(c, 1.0); }`,
  });
}

// ------------------------------------------------------------------ textures
function wheelTexture() {
  const W = 1024, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#8a6a36'); gr.addColorStop(0.15, '#d6b068'); gr.addColorStop(0.5, '#e8c67c'); gr.addColorStop(0.85, '#c49a52'); gr.addColorStop(1, '#7a5a2c');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(40,24,8,0.9)'; g.font = `600 80px "${FONTS.display}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) { g.save(); g.translate((i + 0.5) * W / 10, H / 2 + 4); g.scale(-1, 1); g.fillText(String(i), 0, 0); g.restore(); }
  g.strokeStyle = 'rgba(40,24,8,0.6)'; g.lineWidth = 3;
  for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(i * W / 10, 6); g.lineTo(i * W / 10, 18); g.moveTo(i * W / 10, H - 18); g.lineTo(i * W / 10, H - 6); g.stroke(); }
  return toTexture(c);
}
function traceTexture(seed = 5) {
  const S = 1024, c = mkCanvas(S), g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  const toPx = (u) => (u / 1.3 + 0.5) * S;
  for (let side = 0; side < 4; side++) for (let i = 0; i < 20; i++) {
    const t = -0.55 + (i + 0.5) * 1.1 / 20;
    const pin = side === 0 ? [t, -0.64] : side === 1 ? [0.64, t] : side === 2 ? [t, 0.64] : [-0.64, t];
    const d = [t * 0.38, t * 0.38];
    const die = side === 0 ? [d[0], -0.25] : side === 1 ? [0.25, d[1]] : side === 2 ? [d[0], 0.25] : [-0.25, d[1]];
    const mid = side % 2 === 0 ? [pin[0], lerp(pin[1], die[1], 0.4 + R() * 0.2)] : [lerp(pin[0], die[0], 0.4 + R() * 0.2), pin[1]];
    g.lineWidth = 2 + R() * 2;
    g.beginPath(); g.moveTo(toPx(pin[0]), toPx(pin[1])); g.lineTo(toPx(mid[0]), toPx(mid[1])); g.lineTo(toPx(die[0]), toPx(die[1])); g.stroke();
    g.beginPath(); g.arc(toPx(mid[0]), toPx(mid[1]), 3, 0, TAU); g.fillStyle = '#fff'; g.fill();
  }
  return toTexture(c, { srgb: false });
}
export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tCalc = cue('calculator'), tRel = cue('relays'), tTube = cue('tubes'), tTr = cue('transistors'), tProc = cue('processor'), tDive = cue('processorDive'), tBin = cue('binary');
  const DUR = segment.end - segment.start;
  const tSwitch = tDive + 0.22;                    // chip world → die world (matched framing)
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.7;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.01, 200);
  const R = rng(3885);
  const beatAt = (T) => pulse(T, { decay: 9 });

  // ================================================================ WORLD A — the bench
  const worldA = new THREE.Group(); scene.add(worldA);
  scene.fog = new THREE.Fog(0x000000, 5.5, 12);
  const key = new THREE.SpotLight('#ffe7c4', 60, 20, 0.36, 0.55, 1.4); key.position.set(-1.6, 4.6, 2.0); key.target.position.set(0, 0.5, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005;
  worldA.add(key, key.target);
  const rim = new THREE.DirectionalLight('#9cc8ff', 1.6); rim.position.set(3, 2, -4); worldA.add(rim);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#020203', metalness: 0.0, roughness: 0.8, envMapIntensity: 0.1, emissive: '#6fa8ff', emissiveMap: null, emissiveIntensity: 0 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; worldA.add(floor);

  // ---- materials
  const brass = new THREE.MeshStandardMaterial({ color: '#d9b56a', metalness: 1, roughness: 0.3, envMapIntensity: 1 });
  const brassWheel = new THREE.MeshStandardMaterial({ map: wheelTexture(), metalness: 0.95, roughness: 0.32 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.9, roughness: 0.4 });
  const steelM = new THREE.MeshStandardMaterial({ color: '#c9d0d8', metalness: 1, roughness: 0.28, map: brushedMetalTexture() });
  const steelR = new THREE.MeshStandardMaterial({ color: '#b9c0c8', metalness: 1, roughness: 0.5, map: brushedMetalTexture() });
  const copperM = new THREE.MeshStandardMaterial({ color: '#c47a42', metalness: 1, roughness: 0.48 });
  const bakelite = new THREE.MeshStandardMaterial({ color: '#17140f', metalness: 0.1, roughness: 0.5 });
  const epoxy = new THREE.MeshStandardMaterial({ color: '#0e0f11', metalness: 0.2, roughness: 0.38 });
  const goldM = new THREE.MeshStandardMaterial({ color: '#f0c46a', metalness: 1, roughness: 0.22 });
  // clear glass: near-black body drawn additively, so only its reflections (env + key highlight) add light
  // over the plate and filament inside — no milky diffuse shell
  const glassM = new THREE.MeshStandardMaterial({ color: '#06080b', metalness: 0, roughness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.1, depthWrite: false, blending: THREE.AdditiveBlending });
  const filM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3a').multiplyScalar(4), toneMapped: false });
  const haloM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a50').multiplyScalar(0.5), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sparkM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe8ff').multiplyScalar(1.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });

  const inst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; worldA.add(m); return m; };
  const M = new THREE.Matrix4(), Mb = new THREE.Matrix4(), Mp = new THREE.Matrix4(), qv = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const local = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V3(sx, sy, sz));

  // ---- stage 0: difference engine (3 columns × 6 figure wheels + gears + frame)
  const calcG = new THREE.Group(); worldA.add(calcG);
  const WHEELS = [];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 6; r++) WHEELS.push(V3((c - 1) * 0.62, 0.2 + r * 0.2, 0));
  const wheelGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 64, 1);
  const wheels = inst(wheelGeo, [brassWheel, brass, brass], WHEELS.length);
  const gearShape = new THREE.Shape();
  { const N = 14, r0 = 0.1, r1 = 0.125; for (let i = 0; i < N * 4; i++) { const a = (i / (N * 4)) * TAU, r = (i % 4 === 1 || i % 4 === 2) ? r1 : r0; i ? gearShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : gearShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }
  const hole = new THREE.Path(); hole.absarc(0, 0, 0.025, 0, TAU, true); gearShape.holes.push(hole);
  const gearGeo = new THREE.ExtrudeGeometry(gearShape, { depth: 0.03, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 }); gearGeo.rotateX(Math.PI / 2); gearGeo.translate(0, 0.015, 0);
  const GEARS = [];
  for (const gx of [-0.31, 0.31]) for (let k = 0; k < 5; k++) GEARS.push({ p: V3(gx, 0.3 + k * 0.2, 0.19), dir: (k % 2 ? 1 : -1) * (gx > 0 ? 1 : -1) });
  const gears = inst(gearGeo, brass, GEARS.length);
  const frameParts = [];
  const addFrame = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; calcG.add(m); frameParts.push(m); return m; };
  addFrame(new THREE.BoxGeometry(1.9, 0.07, 0.66), darkSteel, 0, 0.035, 0);
  addFrame(new THREE.BoxGeometry(1.9, 0.05, 0.66), darkSteel, 0, 1.43, 0);
  for (const x of [-0.9, 0.9]) for (const z of [-0.28, 0.28]) addFrame(new THREE.CylinderGeometry(0.025, 0.025, 1.38, 16), brass, x, 0.73, z);
  for (let c = 0; c < 3; c++) addFrame(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 12), steelM, (c - 1) * 0.62, 0.73, 0);
  for (const x of [-0.31, 0.31]) addFrame(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 10), steelM, x, 0.73, 0.19);
  // wheel counters with carry (pure function of time)
  const wheelAngle = (c, r, t) => {
    const s = Math.max(0, t - 0.05) * 9 + c * 37 + 3;
    const fs = Math.floor(s), fr = ease.inOutCubic(s - fs);
    const div = Math.pow(10, r), val = Math.floor(fs / div);
    const carry = (fs % div) === div - 1 ? fr : 0;
    return -(val + carry) * TAU / 10;
  };

  // ---- stage 1: relays (6 × 3 on the bench)
  const RELAYS = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) RELAYS.push(V3((i - 2.5) * 0.42, 0, (j - 1) * 0.46));
  const relayParts = [
    { mesh: inst(new THREE.BoxGeometry(0.34, 0.035, 0.24), bakelite, 18), L: local(0, 0.0175, 0) },
    { mesh: inst(new THREE.CylinderGeometry(0.058, 0.058, 0.16, 24), copperM, 18), L: local(-0.06, 0.115, 0) },
    { mesh: inst(new THREE.BoxGeometry(0.03, 0.2, 0.12), steelR, 18), L: local(0.035, 0.135, 0) },
    { mesh: inst(new THREE.BoxGeometry(0.02, 0.07, 0.05), steelR, 18), L: local(0.12, 0.07, 0) },
  ];
  const armGeo = new THREE.BoxGeometry(0.17, 0.012, 0.1); armGeo.translate(-0.085, 0, 0);
  const armature = inst(armGeo, steelR, 18);
  const relaySpark = inst(new THREE.SphereGeometry(0.011, 8, 6), sparkM, 18); relaySpark.castShadow = false;

  // ---- stage 2: vacuum tubes (8 × 3)
  const TUBES = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 8; i++) TUBES.push(V3((i - 3.5) * 0.3, 0, (j - 1) * 0.4));
  const bulbProfile = []; for (let i = 0; i <= 20; i++) { const u = i / 20; const y = 0.06 + u * 0.36; const r = u < 0.8 ? 0.068 + Math.sin(u * Math.PI / 0.8) * 0.006 : 0.068 * Math.sqrt(Math.max(0, 1 - ((u - 0.8) / 0.2) ** 2)) + 0.0001; bulbProfile.push(new THREE.Vector2(r, y)); }
  const tubeParts = [
    { mesh: inst(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 24), bakelite, 24), L: local(0, 0.03, 0) },
    { mesh: inst(new THREE.CylinderGeometry(0.038, 0.038, 0.17, 16, 1, true), darkSteel, 24), L: local(0, 0.22, 0) },
    { mesh: inst(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 16), steelM, 24), L: local(0, 0.38, 0) },
    { mesh: inst(new THREE.LatheGeometry(bulbProfile, 32), glassM, 24), L: local(0, 0, 0) },
  ];
  tubeParts[3].mesh.castShadow = false; tubeParts[3].mesh.renderOrder = 2;
  const filament = inst(new THREE.CylinderGeometry(0.007, 0.007, 0.13, 6), filM, 24); filament.castShadow = false;
  const halo = inst(new THREE.SphereGeometry(0.06, 12, 8), haloM, 24); halo.castShadow = false; halo.receiveShadow = false;

  // ---- stage 3: transistors (12 × 5): TO-92 epoxy bodies and TO-18 metal cans
  const TRS = []; for (let j = 0; j < 5; j++) for (let i = 0; i < 12; i++) TRS.push(V3((i - 5.5) * 0.18, 0, (j - 2) * 0.18));
  const to92Geo = new THREE.CylinderGeometry(0.032, 0.032, 0.06, 20, 1, false, -Math.PI / 2, Math.PI);
  const to92 = inst(to92Geo, epoxy, 60);
  const to92face = inst(new THREE.BoxGeometry(0.064, 0.06, 0.004), epoxy, 60);
  const canGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.045, 24);
  const cans = inst(canGeo, steelM, 60);
  const rims = inst(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 24), steelM, 60);
  const legs = inst(new THREE.CylinderGeometry(0.0028, 0.0028, 0.075, 5), steelM, 180);

  // ---- stage 4: microprocessor
  const chip = new THREE.Group(); worldA.add(chip);
  const traceTex = traceTexture();
  const subMat = new THREE.MeshStandardMaterial({ color: '#0f1b17', metalness: 0.3, roughness: 0.45, emissive: new THREE.Color('#79b4ff'), emissiveMap: traceTex, emissiveIntensity: 0 });
  const substrate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 1.3), [epoxy, epoxy, subMat, epoxy, epoxy, epoxy]); substrate.position.y = 0.03; substrate.castShadow = substrate.receiveShadow = true; chip.add(substrate);
  const dieChip = dieMaterial({ chip: true });
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.5), [epoxy, epoxy, dieChip, epoxy, epoxy, epoxy]); die.position.y = 0.07; chip.add(die);
  const DIE_TOP = 0.08;
  const lid = new THREE.Group(); chip.add(lid);
  const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.045, 0.92), new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 1, roughness: 0.22, map: brushedMetalTexture(), envMapIntensity: 1.3 }));
  lidMesh.castShadow = true; lid.add(lidMesh);
  const lidText = new TextPlane('μP · 64-BIT · 3 nm', { font: FONTS.mono, height: 0.045, letterSpacing: 0.2, color: '#3a4048', intensity: 1, blending: THREE.NormalBlending });
  lidText.rotation.x = -Math.PI / 2; lidText.position.set(0, 0.0235, 0.3); lid.add(lidText);
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.014, 0.1), goldM, 80); pins.castShadow = true;
  for (let s = 0; s < 4; s++) for (let i = 0; i < 20; i++) {
    const t = -0.55 + (i + 0.5) * 1.1 / 20;
    const rot = s * Math.PI / 2;
    M.compose(V3(Math.sin(rot) * 0.69 + Math.cos(rot) * t, 0.02, Math.cos(rot) * 0.69 - Math.sin(rot) * t), qv.setFromAxisAngle(V3(0, 1, 0), rot), sv.set(1, 1, 1));
    pins.setMatrixAt(s * 20 + i, M);
  }
  chip.add(pins);
  const chipGlow = glowSprite({ color: '#9cc8ff', intensity: 2, scale: 3 }); chipGlow.position.y = 0.2; chip.add(chipGlow);

  // ---- carried-over particles for each transformation
  const bursts = [[WHEELS, RELAYS], [RELAYS, TUBES], [TUBES, TRS], [TRS, [V3(0, 0.08, 0)]]].map(([A, B], k) => {
    const n = 800, pa = new Float32Array(n * 3), pb = new Float32Array(n * 3), r = rng(70 + k);
    for (let i = 0; i < n; i++) {
      const a = A[i % A.length], b = B[Math.floor(r() * B.length)];
      const ya = k === 0 ? a.y : 0.12;
      pa.set([a.x + (r() - 0.5) * 0.25, ya + (r() - 0.5) * 0.2, a.z + (r() - 0.5) * 0.25], i * 3);
      const sp = k === 3 ? 0.25 : 0.1;
      pb.set([b.x + (r() - 0.5) * sp, 0.05 + r() * (k === 3 ? 0.04 : 0.25), b.z + (r() - 0.5) * sp], i * 3);
    }
    const p = new MorphParticles({ count: n, positions: pa, targets: pb, size: 0.013, color: k === 2 ? '#ffe2c0' : '#cfe8ff', intensity: 1.5, opacity: 0, seed: 80 + k, stagger: 0.5 });
    p.u.noise = 0.05; p.u.noiseFreq = 2.0;
    worldA.add(p);
    return p;
  });

  // ================================================================ WORLD B — inside the die
  const B0 = V3(0, -500, 0);
  const worldB = new THREE.Group(); worldB.position.copy(B0); scene.add(worldB);
  const dieWorldMat = dieMaterial();
  const dieWorld = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), dieWorldMat); dieWorld.rotation.x = -Math.PI / 2; worldB.add(dieWorld);
  // the die-world plane shader uses world xz → offset for B0 is irrelevant in x/z
  const lightB = new THREE.DirectionalLight('#dfeaff', 2.4); lightB.position.set(-3, 6, 4).add(B0); lightB.target.position.copy(B0); scene.add(lightB, lightB.target);

  // branches of intelligence: neural core + five live UI cards (computing-ai.js)
  const AI_Y0 = 5.0, AI_ZC = -13, AI_DREF = 9;
  const ai = buildBranches({ Y0: AI_Y0, Zc: AI_ZC, D_REF: AI_DREF, tStart: tBin + 0.06 });
  worldB.add(ai.group);
  const coreW = ai.core.clone().add(B0);

  // binary glyph streams: die floor → the neural core
  const GLYPHS = 700;
  const atlas = (() => { const c = mkCanvas(256, 128), g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = `500 104px "${FONTS.mono}"`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('0', 64, 68); g.fillText('1', 192, 68); return toTexture(c, { srgb: false }); })();
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  gGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  gGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aS = new Float32Array(GLYPHS * 3), aE = new Float32Array(GLYPHS * 3), aC = new Float32Array(GLYPHS * 3), aP = new Float32Array(GLYPHS * 4);
  const tgt = ai.core;
  for (let i = 0; i < GLYPHS; i++) {
    const sx = (R() - 0.5) * 12, sz = AI_ZC + (R() - 0.5) * 13;
    aS.set([Math.round(sx * 4) / 4, 0.02, sz], i * 3);
    const th = R() * TAU, rr = 0.2 + R() * 0.45;
    aE.set([tgt.x + Math.cos(th) * rr, tgt.y + Math.sin(th) * rr, tgt.z], i * 3);
    aC.set([lerp(sx, tgt.x, 0.35), 1.2 + R() * 2.8, lerp(sz, tgt.z, 0.4)], i * 3);
    aP.set([R(), 0.3 + R() * 0.25, R(), 0.03 + R() * 0.03], i * 4);
  }
  gGeo.setAttribute('aS', new THREE.InstancedBufferAttribute(aS, 3));
  gGeo.setAttribute('aE', new THREE.InstancedBufferAttribute(aE, 3));
  gGeo.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  gGeo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  gGeo.instanceCount = GLYPHS;
  const glyphMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uStart: { value: tBin - 0.45 }, uSpan: { value: 0.38 }, uMap: { value: atlas }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `attribute vec3 aS; attribute vec3 aE; attribute vec3 aC; attribute vec4 aP;
      uniform float uTime, uStart, uSpan; varying vec2 vUv; varying float vA; varying float vBit;
      void main(){
        float tl = uStart + aP.x * uSpan; float u = (uTime - tl) / aP.y;
        vA = step(0.0, u) * step(u, 1.0) * sin(3.14159 * clamp(u, 0.0, 1.0));
        float k = clamp(u, 0.0, 1.0); float ku = k * k * (3.0 - 2.0 * k);
        vec3 p = mix(mix(aS, aC, ku), mix(aC, aE, ku), ku);
        vBit = step(0.5, fract(aP.z * 7.0 + floor(uTime * 9.0 + aP.z * 20.0) * 0.618));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        mv.xy += position.xy * aP.w * 2.0 * clamp(-mv.z / 4.0, 0.35, 1.0);
        vUv = vec2((uv.x + vBit) * 0.5, uv.y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; varying float vA; varying float vBit;
      void main(){ float a = texture2D(uMap, vUv).a * vA * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.6, 0.8, 1.0) * 1.25, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glyphs = new THREE.Mesh(gGeo, glyphMat); glyphs.frustumCulled = false; worldB.add(glyphs);

  // ================================================================ screen HUD: era captions + evolution timeline
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  // open-matte delivery (?aspect=1 …): keep the captions anchored bottom-left and scale them up to stay legible
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = Math.sqrt(HH) * (OUTPUT_ASPECT < 1.5 ? 1.25 : 1);
  const HX = (dx) => -A + dx * UI, HY = (y) => -HH + (1 + y) * UI + (OUTPUT_ASPECT < 1.5 ? 0.24 : 0);   // square: lift clear of the reel's bottom HUD line
  const STAGES = [['1822', 'MECHANICAL CALCULATION · BABBAGE', tCalc - 0.3], ['1937', 'ELECTROMECHANICAL RELAY · BELL LABS', tRel], ['1946', 'VACUUM TUBE · ENIAC · PHILADELPHIA', tTube], ['1947', 'TRANSISTOR · BELL LABS', tTr], ['1971', 'MICROPROCESSOR · SILICON VALLEY', tProc]];
  const capYear = STAGES.map(([y]) => { const tp = new TextPlane(y, { font: FONTS.sans, weight: 200, height: 0.1 * UI, letterSpacing: 0.05, color: '#e6f0ff', intensity: 1.1 }); tp.position.set(HX(0.2) + tp.worldWidth / 2, HY(-0.7), 0); hud.scene.add(tp); return tp; });
  const capName = STAGES.map(([, n]) => { const tp = new TextPlane(n, { font: FONTS.mono, height: 0.034 * UI, letterSpacing: 0.22, color: '#bcd4f2', intensity: 0.9 }); tp.position.set(HX(0.22) + tp.worldWidth / 2, HY(-0.8), 0); hud.scene.add(tp); return tp; });
  const TL_X0 = HX(0.22), TL_X1 = HX(1.5), TL_Y = HY(-0.87);
  const tlBase = segmentsLine([[V3(TL_X0, TL_Y, 0), V3(TL_X1, TL_Y, 0)]], { color: '#6f8fb8', intensity: 0.6, orderFn: () => 0, stagger: 0 });
  const tlTicks = segmentsLine(STAGES.map((_, i) => { const x = lerp(TL_X0, TL_X1, i / 4); return [V3(x, TL_Y - 0.012 * UI, 0), V3(x, TL_Y + 0.012 * UI, 0)]; }), { color: '#9cc8ff', intensity: 0.9, orderFn: (a, b, i) => i / 5, stagger: 0.8 });
  const tlDot = new THREE.Mesh(new THREE.CircleGeometry(0.009 * UI, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e6f2ff').multiplyScalar(2), toneMapped: false }));
  hud.scene.add(tlBase, tlTicks, tlDot);

  // ================================================================ animation
  const wheelNow = WHEELS.map((w) => w.clone());
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), upV = new THREE.Vector3();
  const azK = [[0, -1.25], [tRel, -0.95], [tTr, -0.6], [tDive, -0.18], [tSwitch, 0]];
  const elK = [[0, 0.2], [tRel, 0.38], [tTube, 0.5], [tTr, 0.62], [tProc, 0.9], [tDive, 1.25], [tSwitch, Math.PI / 2 - 0.0005]];
  const dK = [[0, 4.8], [tCalc, 4.4], [tRel, 3.2], [tTube, 2.8], [tTr, 1.95], [tProc, 2.1], [tDive, 1.7], [tSwitch, 0.25]];
  const tgK = [[0, 0.76], [tCalc + 0.2, 0.74], [tRel + 0.1, 0.18], [tTube, 0.2], [tTr, 0.08], [tProc, 0.06], [tDive, DIE_TOP], [tSwitch, DIE_TOP]];
  // per-element transition progress: a sweep across X
  const sweep = (t, t0, x, span = 2.4, len = 0.34) => ramp(t, t0 + ((x + span / 2) / span) * 0.22, t0 + ((x + span / 2) / span) * 0.22 + len, ease.inOutCubic);

  const api = {
    scene, camera, hud,
    dof: { focus: 3, range: 1.5, amount: 0 },
    bloom: { strength: 0.72 },
    exposure: 1.0,
    background: 0x000000,
    update(t, info) {
      const inA = t < tSwitch;
      worldA.visible = inA; worldB.visible = !inA; lightB.visible = !inA;
      scene.fog.near = inA ? 5.5 : 900; scene.fog.far = inA ? 12 : 1000;
      if (inA) this._bench(t, info); else this._die(t, info);
      this._hud(t);
    },
    _bench(t, info) {
      const T = info.T;
      // ---------------- camera orbit → top-down → dive
      const az = timeWarp(t, azK), el = Math.min(timeWarp(t, elK), Math.PI / 2 - 0.0005), d = Math.max(0.2, timeWarp(t, dK)), ty = timeWarp(t, tgK);
      const orbitSpin = t < tSwitch ? Math.sin(t * 0.7) * 0.03 : 0;
      camPos.set(Math.sin(az + orbitSpin) * Math.cos(el) * d, ty + Math.sin(el) * d, Math.cos(az + orbitSpin) * Math.cos(el) * d);
      look.set(0, ty, 0);
      camera.position.copy(camPos);
      upV.set(-Math.sin(az), 0, -Math.cos(az));
      tmp.set(0, 1, 0).lerp(upV, smoothstep(0.95, 1.45, el)).normalize();
      camera.up.copy(tmp);
      camera.lookAt(look);
      camera.fov = 35; camera.near = 0.01; camera.far = 60; camera.updateProjectionMatrix();

      // key light sweeps across the brass in darkness
      key.position.set(-1.6 + Math.sin(t * 0.6) * 0.5, 4.6, 2.0);
      key.intensity = (t < tRel - 0.2 ? 55 : 38) * ramp(t, 0, 0.35) + 5 * beatAt(T);
      floorMat.emissiveIntensity = 0;

      // ---------------- stage 0: calculator
      const calcSpin = t * 0.28;
      calcG.rotation.y = calcSpin;
      const tr0 = tRel - 0.18;
      let calcAlive = 0;
      WHEELS.forEach((w, i) => {
        wheelNow[i].copy(w).applyAxisAngle(tmp.set(0, 1, 0), calcSpin);
        const c = Math.floor(i / 6), r = i % 6;
        const k = sweep(t, tr0, w.x, 1.3, 0.3);
        const s = 1 - k;
        if (s <= 0.001) { wheels.setMatrixAt(i, ZERO); return; }
        calcAlive++;
        pv.copy(w).applyAxisAngle(tmp.set(0, 1, 0), calcSpin);
        tmp2.copy(RELAYS[i]); pv.lerp(tmp2.setY(0.1), k * 0.6);
        qv.setFromAxisAngle(tmp.set(0, 1, 0), wheelAngle(c, r, t) + calcSpin);
        M.compose(pv, qv, sv.set(s, s, s)); wheels.setMatrixAt(i, M);
      });
      wheels.instanceMatrix.needsUpdate = true;
      GEARS.forEach((g, i) => {
        const k = sweep(t, tr0 - 0.05, g.p.x, 1.3, 0.25), s = 1 - k;
        if (s <= 0.001) { gears.setMatrixAt(i, ZERO); return; }
        pv.copy(g.p).applyAxisAngle(tmp.set(0, 1, 0), calcSpin);
        qv.setFromAxisAngle(tmp.set(0, 1, 0), g.dir * t * 2.4 + calcSpin);
        M.compose(pv, qv, sv.set(s, s, s)); gears.setMatrixAt(i, M);
      });
      gears.instanceMatrix.needsUpdate = true;
      const frameK = ramp(t, tr0 - 0.1, tr0 + 0.25, ease.inCubic);
      calcG.visible = frameK < 0.999;
      calcG.scale.set(1 - frameK * 0.3, 1 - frameK, 1 - frameK * 0.3);
      frameParts.forEach((m) => { m.visible = frameK < 0.999; });
      wheels.visible = calcAlive > 0 || t < tr0; gears.visible = t < tr0 + 0.6;

      // ---------------- generic stage transitions (appear from previous positions)
      const stageXform = (dst, src, t0, tOut, i, out) => {
        const kIn = sweep(t, t0, dst.x);
        const kOut = tOut == null ? 0 : sweep(t, tOut, dst.x);
        const s = ease.outBack(kIn) * (1 - kOut);
        if (s <= 0.001) return 0;
        const from = src[i % src.length];
        out.set(lerp(from.x, dst.x, kIn), lerp(from.y + 0.05, 0, kIn) + Math.sin(kIn * Math.PI) * 0.18, lerp(from.z, dst.z, kIn));
        if (kOut > 0) out.lerp(tmp2.set(dst.x * 0.25, 0.05, dst.z * 0.25), kOut * 0.8);
        return s;
      };
      // relays
      const relIn = tRel - 0.18, relOut = tTube - 0.18;
      const bt = beatAt(T);
      for (let i = 0; i < 18; i++) {
        const s = stageXform(RELAYS[i], wheelNow, relIn, relOut, i, pv);
        if (s <= 0.001) { relayParts.forEach((p) => p.mesh.setMatrixAt(i, ZERO)); armature.setMatrixAt(i, ZERO); relaySpark.setMatrixAt(i, ZERO); continue; }
        Mb.compose(pv, qv.identity(), sv.set(s, s, s));
        relayParts.forEach((p) => { M.multiplyMatrices(Mb, p.L); p.mesh.setMatrixAt(i, M); });
        const closed = ((Math.floor(T * 4) + i * 3) % 5) < 2 ? 1 : 0;
        const ang = closed ? -0.02 : 0.14 * (1 - bt * 0.5);
        Mp.compose(tmp.set(0.075, 0.245, 0), qv.setFromAxisAngle(tmp2.set(0, 0, 1), ang), sv.set(1, 1, 1));
        M.multiplyMatrices(Mb, Mp); armature.setMatrixAt(i, M);
        const sp = 0;
        Mp.compose(tmp.set(0.12, 0.11, 0), qv.identity(), sv.setScalar(sp));
        M.multiplyMatrices(Mb, Mp); relaySpark.setMatrixAt(i, M);
      }
      relayParts.forEach((p) => { p.mesh.instanceMatrix.needsUpdate = true; }); armature.instanceMatrix.needsUpdate = true; relaySpark.instanceMatrix.needsUpdate = true;
      // tubes
      const tubeIn = tTube - 0.18, tubeOut = tTr - 0.18;
      for (let i = 0; i < 24; i++) {
        const s = stageXform(TUBES[i], RELAYS, tubeIn, tubeOut, i, pv);
        if (s <= 0.001) { tubeParts.forEach((p) => p.mesh.setMatrixAt(i, ZERO)); filament.setMatrixAt(i, ZERO); halo.setMatrixAt(i, ZERO); continue; }
        Mb.compose(pv, qv.identity(), sv.set(s, s, s));
        tubeParts.forEach((p) => { M.multiplyMatrices(Mb, p.L); p.mesh.setMatrixAt(i, M); });
        const warm = sat((t - tubeIn - 0.15 - (i % 8) * 0.02) / 0.25) * (0.85 + 0.15 * Math.sin(T * 31 + i * 7));
        Mp.compose(tmp.set(0, 0.22, 0), qv.identity(), sv.set(warm, 1, warm)); M.multiplyMatrices(Mb, Mp); filament.setMatrixAt(i, M);
        Mp.compose(tmp.set(0, 0.22, 0), qv.identity(), sv.set(1, 1.8, 1).multiplyScalar(warm)); M.multiplyMatrices(Mb, Mp); halo.setMatrixAt(i, M);
      }
      tubeParts.forEach((p) => { p.mesh.instanceMatrix.needsUpdate = true; }); filament.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true;
      // transistors
      const trIn = tTr - 0.18, trOut = tProc - 0.2;
      for (let i = 0; i < 60; i++) {
        const s = stageXform(TRS[i], TUBES, trIn, trOut, i, pv);
        const isCan = (i + Math.floor(i / 12)) % 3 === 0;
        if (s <= 0.001) { to92.setMatrixAt(i, ZERO); to92face.setMatrixAt(i, ZERO); cans.setMatrixAt(i, ZERO); rims.setMatrixAt(i, ZERO); for (let l = 0; l < 3; l++) legs.setMatrixAt(i * 3 + l, ZERO); continue; }
        Mb.compose(pv, qv.identity(), sv.set(s, s, s));
        if (isCan) {
          to92.setMatrixAt(i, ZERO); to92face.setMatrixAt(i, ZERO);
          Mp.compose(tmp.set(0, 0.098, 0), qv.identity(), sv.set(1, 1, 1)); M.multiplyMatrices(Mb, Mp); cans.setMatrixAt(i, M);
          Mp.compose(tmp.set(0, 0.078, 0), qv.identity(), sv.set(1, 1, 1)); M.multiplyMatrices(Mb, Mp); rims.setMatrixAt(i, M);
        } else {
          cans.setMatrixAt(i, ZERO); rims.setMatrixAt(i, ZERO);
          Mp.compose(tmp.set(0, 0.105, 0), qv.identity(), sv.set(1, 1, 1)); M.multiplyMatrices(Mb, Mp); to92.setMatrixAt(i, M);
          Mp.compose(tmp.set(0, 0.105, 0.0), qv.identity(), sv.set(1, 1, 1)); M.multiplyMatrices(Mb, Mp); to92face.setMatrixAt(i, M);
        }
        for (let l = 0; l < 3; l++) { Mp.compose(tmp.set((l - 1) * 0.02, 0.0375, 0), qv.identity(), sv.set(1, 1, 1)); M.multiplyMatrices(Mb, Mp); legs.setMatrixAt(i * 3 + l, M); }
      }
      [to92, to92face, cans, rims, legs].forEach((m) => { m.instanceMatrix.needsUpdate = true; });

      // processor
      const chipK = ramp(t, tProc - 0.15, tProc + 0.2, ease.outBack);
      chip.visible = chipK > 0.001;
      chip.scale.setScalar(Math.max(0.001, chipK));
      const lidUp = ramp(t, tDive - 0.28, tDive + 0.05, ease.inOutCubic);
      lid.position.set(0, 0.125 + lidUp * 0.9, -lidUp * 0.3);
      lid.rotation.x = -lidUp * 0.5;
      lid.visible = lidUp < 0.98;
      subMat.emissiveIntensity = ramp(t, tProc, tProc + 0.35) * (0.45 + beatAt(T) * 0.35);
      dieChip.uniforms.uTime.value = T; dieChip.uniforms.uLit.value = ramp(t, tDive - 0.2, tSwitch + 0.3) * 8; dieChip.uniforms.uGain.value = 1;
      chipGlow.material.opacity = ramp(t, tProc, tProc + 0.3) * (1 - lidUp) * 0.6;
      floorMat.emissiveIntensity = 0;

      // carried-over particles
      [relIn, tubeIn, trIn, tProc - 0.2].forEach((t0, k) => {
        const p = bursts[k];
        const m = ramp(t, t0, t0 + 0.5);
        p.visible = m > 0 && m < 1;
        p.u.mix = m; p.u.opacity = envelope(t, t0, t0 + 0.55, 0.08, 0.2) * 0.7; p.tick(t, info);
      });

      // ---------------- lens
      api.dof.amount = 0.45 * (1 - ramp(t, tProc, tDive));
      api.dof.focus = camPos.distanceTo(look); api.dof.range = 1.2 + d * 0.2;
      api.exposure = 1.0 + ramp(t, tDive + 0.1, tSwitch, ease.inQuad) * 0.25;
      api.bloom.strength = 0.72 + ramp(t, tDive, tSwitch) * 0.2;
    },
    _die(t, info) {
      const T = info.T;
      // matched to the end of the dive (same framing, 12× scale), then a crane-up + pitch into a level
      // glide that settles on the neural core, and finally a rapid push INTO the core ('zoom' hand-over).
      const pitch = ramp(t, tSwitch, tBin + 0.12, ease.inOutCubic);
      const rise = ramp(t, tSwitch, tBin + 0.3, ease.inOutSine);
      const zoom = ramp(t, DUR - 0.5, DUR, ease.inQuad);
      const push = timeWarp(t, [[tSwitch, 0], [tBin, 1.9], [tBin + 0.3, -(AI_ZC + AI_DREF)], [DUR - 0.5, -(AI_ZC + AI_DREF) + 0.3], [DUR, -AI_ZC - 0.55]]);
      camPos.set(0, lerp(3.0, AI_Y0, rise), -push).add(B0);
      camPos.y = lerp(camPos.y, coreW.y, ramp(t, DUR - 0.5, DUR, ease.inOutSine));
      tmp.set(0, -1, 0).lerp(tmp2.set(0, 0, -1), pitch).normalize();
      look.copy(camPos).add(tmp);
      tmp.set(camPos.x, coreW.y, coreW.z);
      look.lerp(tmp, zoom);
      camera.position.copy(camPos);
      upV.set(0, 0, -1).lerp(tmp2.set(0, 1, 0), smoothstep(0.1, 0.6, pitch)).normalize();
      camera.up.copy(upV); camera.lookAt(look);
      camera.fov = 35 + ramp(t, DUR - 0.45, DUR, ease.inQuad) * 7; camera.near = 0.02; camera.far = 200; camera.updateProjectionMatrix();

      dieWorldMat.uniforms.uTime.value = T;
      dieWorldMat.uniforms.uLit.value = ramp(t, tDive - 0.2, tSwitch + 0.3) * 8 + ramp(t, tSwitch, tBin + 0.4, ease.inQuad) * 60;
      const calm = ramp(t, tBin - 0.2, tBin + 0.35, ease.inOutSine);
      dieWorldMat.uniforms.uGain.value = 1 - calm * 0.55;
      dieWorldMat.uniforms.uFog.value = 0.045 + calm * 0.07;

      glyphMat.uniforms.uTime.value = t;
      glyphMat.uniforms.uOpacity.value = 1;
      glyphs.visible = t > tBin - 0.45 && t < tBin + 0.5;

      ai.update(t, T, zoom, ramp(t, tSwitch + 0.05, tBin + 0.05, ease.outCubic));
      api.dof.amount = 0;
      const flash = 1 - ramp(t, tSwitch, tSwitch + 0.25);
      api.exposure = 1.0 + flash * 0.25;
      api.bloom.strength = 0.72;
    },
    _hud(t) {
      const cur = t < tRel - 0.1 ? 0 : t < tTube - 0.1 ? 1 : t < tTr - 0.1 ? 2 : t < tProc - 0.1 ? 3 : 4;
      const hudOut = 1 - ramp(t, tDive, tDive + 0.25);
      STAGES.forEach(([, , ts], i) => {
        const tEnd = i < 4 ? STAGES[i + 1][2] - 0.1 : tDive + 0.25;
        const on = i === cur ? envelope(t, ts - 0.12, tEnd + 0.02, 0.15, 0.08) : 0;
        capYear[i].opacity = on * hudOut; capYear[i].reveal = ramp(t, ts - 0.1, ts + 0.15);
        capName[i].opacity = on * hudOut; capName[i].reveal = ramp(t, ts - 0.05, ts + 0.25);
      });
      const tlIn = ramp(t, 0.1, 0.5);
      tlBase.progress = tlIn; tlBase.opacity = hudOut * 0.9;
      tlTicks.progress = tlIn; tlTicks.opacity = hudOut;
      const pos = sat(timeWarp(t, [[0, 0], [tRel, 0.25], [tTube, 0.5], [tTr, 0.75], [tProc, 1]]));
      tlDot.position.set(lerp(TL_X0, TL_X1, pos), TL_Y, 0);
      tlDot.visible = hudOut > 0.01 && tlIn > 0.5;
    },
  };
  return api;
}
