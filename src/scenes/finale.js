// FINALE (50.0–60.0 s) — large-scale particle systems + restrained, elegant title design.
//
//   50.0  dissolve in from the montage starfield: the camera sits inside a cloud of stars
//   50.5  pullBack    — the camera pulls back; the stars fall into orbital shells and rings
//                       around a procedural night-side Earth (70k particles, warm → cool)
//   51.5  musicDrop   — everything calms: slow orbital drift, twinkling, city lights
//   52.5  ideasLine   — "IDEAS BUILD UPON IDEAS." emerges letter by letter (Cinzel, glow)
//                       while the camera cranes up and Earth sinks to the bottom of frame
//   55.0  ideasOut    — the line dissolves upward; pause
//   56.0  finalImpact — ACHIEVEMENTS / OF WESTERN CIVILIZATION lands with one impact: a
//                       white-hot flash cooling to gold, a light sweep across the letters,
//                       a hairline rule and a shockwave pulse through the particle field
//   57.4  closingLine — "A MOTION DESIGN STUDY" (IBM Plex Mono, wide tracking)
//   59.0  fadeOut     — everything eases down; the engine fades to black over the last 0.6 s
// Text lives in the 3D scene (child of the camera, depth-writing) so DOF can soften the
// background while the typography stays razor sharp.
import * as THREE from 'three';
import { CUES } from '../timeline.js';
import { TextPlane, KineticText, FONTS } from '../lib/text.js';
import { MorphParticles } from '../lib/particles.js';
import { GLSL_NOISE } from '../lib/noise.js';
import { sat, lerp, smoothstep, ease, rng, envelope, TAU } from '../lib/math.js';

const RE = 1.6;

const earthVert = /* glsl */ `
uniform float uRot;
varying vec3 vN; varying vec3 vO; varying vec3 vW;
void main(){
  float c = cos(uRot), s = sin(uRot);
  vO = vec3(c * position.x + s * position.z, position.y, -s * position.x + c * position.z) / ${RE.toFixed(2)};
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const earthFrag = /* glsl */ `
${GLSL_NOISE}
uniform vec3 uSun; uniform float uTime, uCity, uAtmo, uBright;
varying vec3 vN; varying vec3 vO; varying vec3 vW;
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 n = normalize(vO);
  float cont = fbm(n * 1.6 + vec3(4.2, 1.3, -2.0)) + 0.18 * snoise(n * 6.0);
  float land = smoothstep(0.03, 0.075, cont);
  float lat = abs(n.y);
  float ice = smoothstep(0.84, 0.92, lat + 0.04 * snoise(n * 9.0));
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float ndl = dot(N, uSun);
  float day = smoothstep(-0.1, 0.3, ndl);
  vec3 ocean = vec3(0.004, 0.012, 0.028);
  float g = snoise(n * 11.0) * 0.5 + 0.5;
  vec3 ground = mix(vec3(0.07, 0.058, 0.04), vec3(0.11, 0.09, 0.06), g);
  ground = mix(ground, vec3(0.035, 0.055, 0.03), smoothstep(0.45, 0.0, lat) * 0.55);
  vec3 alb = mix(ocean, ground, land);
  alb = mix(alb, vec3(0.45, 0.5, 0.55), ice);
  float clouds = smoothstep(0.05, 0.55, fbm(n * 2.6 + vec3(uTime * 0.012, 0.0, 0.0)) + 0.15 * snoise(n * 9.0));
  vec3 sunCol = vec3(1.0, 0.95, 0.88) * 2.4;
  vec3 col = alb * max(ndl, 0.0) * sunCol;
  vec3 H = normalize(uSun + V);
  col += (1.0 - land) * (1.0 - ice) * pow(max(dot(N, H), 0.0), 70.0) * 0.9 * day * vec3(1.0, 0.88, 0.7) * (1.0 - clouds * 0.8);
  col = mix(col, vec3(0.7, 0.72, 0.75) * max(ndl, 0.0) * 1.6, clouds * 0.55);
  col += alb * vec3(1.0, 0.45, 0.18) * exp(-pow(ndl / 0.09, 2.0)) * 0.8;
  // city lights: clustered speckles on land, strongest near coasts, only on the night side
  float dens = smoothstep(-0.1, 0.55, fbm(n * 5.0 + vec3(7.0))) * land * (1.0 - ice);
  dens *= 0.6 + 0.8 * smoothstep(0.16, 0.06, cont);
  float sp = hash(floor(n * 220.0));
  float sp2 = hash(floor(n * 520.0) + 3.0);
  float lights = (step(0.86, sp) * 0.7 + step(0.93, sp2) * 0.6) * dens + smoothstep(0.35, 0.9, dens) * 0.18;
  col += vec3(1.0, 0.6, 0.26) * lights * (1.0 - day) * uCity * (1.0 - clouds * 0.6);
  // inner atmospheric rim
  float fr = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += vec3(0.28, 0.55, 1.0) * fr * smoothstep(-0.35, 0.5, ndl) * 1.3 * uAtmo;
  gl_FragColor = vec4(col * uBright, 1.0);
}`;
const atmoFrag = /* glsl */ `
uniform vec3 uSun; uniform float uAtmo;
varying vec3 vN; varying vec3 vW;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float rim = pow(clamp(0.72 + dot(N, V), 0.0, 1.0), 5.0);   // backside shell: bright just outside the limb
  float sun = smoothstep(-0.45, 0.6, dot(N, uSun));
  vec3 c = mix(vec3(1.0, 0.55, 0.3), vec3(0.35, 0.65, 1.0), smoothstep(-0.1, 0.4, dot(N, uSun)));
  gl_FragColor = vec4(c * rim * sun * 2.6 * uAtmo, 1.0);
}`;

const orbVert = /* glsl */ `
attribute vec4 aOrb;   // radius, inclination, node, phase
attribute vec4 aSeed;
attribute vec3 aColor;
uniform float uSpin, uForm, uStagger, uSize, uViewport, uWaveR, uWaveAmp, uTime, uTwinkle;
varying vec3 vColor; varying float vAlpha;
void main(){
  float r = aOrb.x;
  float th = aOrb.w + uSpin * 0.55 * pow(r / 2.0, -1.5) * (0.8 + 0.4 * aSeed.x);
  vec3 p = vec3(cos(th), 0.0, sin(th)) * r;
  p.y += (aSeed.y - 0.5) * 0.05 * r;
  float ci = cos(aOrb.y), si = sin(aOrb.y);
  p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
  float cn = cos(aOrb.z), sn = sin(aOrb.z);
  p = vec3(cn * p.x + sn * p.z, p.y, -sn * p.x + cn * p.z);
  float m = clamp((uForm - aSeed.z * uStagger) / (1.0 - uStagger), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  vec3 q = mix(position, p, m);
  q += (aSeed.wxy - 0.5) * sin(3.14159 * m) * 1.5;
  float rr = length(q);
  float wave = exp(-pow((rr - uWaveR) / 0.6, 2.0)) * uWaveAmp;
  q += q / max(rr, 1e-3) * wave * 0.3;
  vec4 mv = modelViewMatrix * vec4(q, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = uSize * (0.4 + aSeed.w * 1.2);
  gl_PointSize = max(1.0, s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z));
  vColor = aColor * (1.0 + wave * 3.0);
  vAlpha = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (1.5 + aSeed.x * 5.0) + aSeed.y * 40.0));
}`;
const orbFrag = /* glsl */ `
uniform float uOpacity, uIntensity;
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a * vAlpha * uOpacity < 0.003) discard;
  gl_FragColor = vec4(vColor * uIntensity, a * vAlpha * uOpacity);
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

function sweepOverlay(tp) {
  const m = new THREE.Mesh(tp.geometry, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tp.material.uniforms.uMap.value }, uS: { value: -1 }, uW: { value: 0.06 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.6).multiplyScalar(3) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: sweepFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  m.renderOrder = 12;
  m.position.z = 0.002;
  return m;
}

// Text that writes depth where its glyphs are (so DOF keeps it sharp).
const solid = (tp) => { tp.material.depthWrite = true; return tp; };

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 400);
  scene.add(camera);
  const cue = (n) => CUES[n] - segment.start;
  const C_PULL = cue('pullBack'), C_DROP = cue('musicDrop'), C_IDEAS = cue('ideasLine'), C_OUT = cue('ideasOut');
  const C_IMPACT = cue('finalImpact'), C_CLOSE = cue('closingLine'), C_FADE = cue('fadeOut');
  const DUR = segment.end - segment.start;
  const r = rng(6060);
  const sunDir = new THREE.Vector3(0.95, 0.32, -0.42).normalize();

  // ---- Earth -----------------------------------------------------------------
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uTime: { value: 0 }, uRot: { value: 0 }, uCity: { value: 3 }, uAtmo: { value: 1 }, uBright: { value: 1 } },
    vertexShader: earthVert, fragmentShader: earthFrag,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 160, 96), earthMat);
  earth.rotation.z = 0.35;
  scene.add(earth);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uAtmo: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: atmoFrag, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE * 1.06, 96, 48), atmoMat);
  scene.add(atmo);

  // ---- orbital particle field (the montage's stars fall into these shells) ------
  const N = 72000;
  const start = new Float32Array(N * 3), orb = new Float32Array(N * 4), seeds = new Float32Array(N * 4), cols = new Float32Array(N * 3);
  const families = [];
  for (let f = 0; f < 9; f++) families.push({ inc: 0.15 + r() * 1.25, node: r() * TAU, r0: 2.1 + r() * 3.4, w: 0.05 + r() * 0.25 });
  const warm = new THREE.Color(1.0, 0.74, 0.42), gold = new THREE.Color(1.0, 0.86, 0.62), ice = new THREE.Color(0.62, 0.8, 1.0), white = new THREE.Color(0.92, 0.95, 1.0);
  const c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const u = r();
    let rad, inc, node;
    if (u < 0.3) {           // main disc, like a ring system of achievements
      rad = 2.1 + Math.pow(r(), 1.1) * 3.2; inc = 0.3 + (r() - 0.5) * 0.04; node = 0.25;
    } else if (u < 0.8) {     // thin inclined orbital rings
      const fm = families[Math.floor(r() * families.length)];
      rad = fm.r0 + (r() - 0.5) * fm.w; inc = fm.inc + (r() - 0.5) * 0.02; node = fm.node;
    } else {                  // diffuse shell
      rad = 2.0 + Math.pow(r(), 1.5) * 6.0; inc = Math.acos(r() * 2 - 1); node = r() * TAU;
    }
    orb.set([rad, inc, node, r() * TAU], i * 4);
    seeds.set([r(), r(), r(), r()], i * 4);
    // start: the starfield of the montage's last shot, spread around the opening camera
    start.set([(r() - 0.5) * 22 + 2.5, (r() - 0.5) * 12, (r() - 0.5) * 16 - 2], i * 3);
    const k = sat((rad - 2.1) / 4.5);
    c.copy(warm).lerp(gold, sat(k * 2)).lerp(ice, sat(k * 1.6 - 0.5));
    if (r() < 0.15) c.copy(white);
    const b = 0.6 + r() * 0.6;
    cols.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.BufferAttribute(start, 3));
  og.setAttribute('aOrb', new THREE.BufferAttribute(orb, 4));
  og.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  og.setAttribute('aColor', new THREE.BufferAttribute(cols, 3));
  const orbMat = new THREE.ShaderMaterial({
    uniforms: {
      uSpin: { value: 0 }, uForm: { value: 0 }, uStagger: { value: 0.55 }, uSize: { value: 0.017 }, uViewport: { value: 800 },
      uWaveR: { value: -10 }, uWaveAmp: { value: 0 }, uTime: { value: 0 }, uTwinkle: { value: 0.35 }, uOpacity: { value: 1 }, uIntensity: { value: 2.0 },
    },
    vertexShader: orbVert, fragmentShader: orbFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const field = new THREE.Points(og, orbMat);
  field.frustumCulled = false;
  scene.add(field);
  const ou = orbMat.uniforms;

  // distant stars
  const NB = 5000, bp = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) {
    const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), d = 90 + r() * 40;
    bp.set([s * Math.cos(th) * d, u * d, s * Math.sin(th) * d], i * 3);
  }
  const bg = new MorphParticles({ count: NB, positions: bp, size: 0.3, intensity: 0.9, color: '#dfe8ff', seed: 3 });
  bg.u.twinkle = 0.5; bg.u.sizeJitter = 0.8;
  scene.add(bg);

  // ---- typography (child of the camera, at distance ZT) ---------------------------
  const ZT = 6;
  const typo = new THREE.Group();
  typo.position.z = -ZT;
  camera.add(typo);
  const halfH = ZT * Math.tan(THREE.MathUtils.degToRad(17.5));

  const ideas = new KineticText('IDEAS BUILD UPON IDEAS.', { font: FONTS.display, weight: 400, height: 0.2, letterSpacing: 0.34, color: '#f6ead2', intensity: 1.15, shadow: 22 });
  ideas.position.y = halfH * 0.5;
  ideas.letters.forEach((l) => solid(l.mesh));
  typo.add(ideas);

  const titleY = halfH * 0.16;
  const title = solid(new TextPlane('ACHIEVEMENTS', { font: FONTS.display, weight: 600, height: 0.44, letterSpacing: 0.13, color: '#f4e3c1', intensity: 1.1, shadow: 3 }));
  title.position.y = titleY;
  const sub = solid(new TextPlane('OF WESTERN CIVILIZATION', { font: FONTS.display, weight: 400, height: 0.19, letterSpacing: 0.36, color: '#eadcc0', intensity: 1.0, shadow: 2 }));
  const pad = 0.25 * 0.44 * 2;                                                  // canvas padding on both sides
  const wTitle = title.worldWidth - pad, wSub = sub.worldWidth - 0.25 * 0.19 * 2;
  const subScale = (wTitle * 0.985) / wSub;
  sub.scale.setScalar(subScale);
  sub.position.y = titleY - 0.44 * 0.62 - 0.19 * subScale * 0.55;
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0045), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.85, 0.6).multiplyScalar(1.4), transparent: true, depthWrite: true }));
  rule.position.y = titleY - 0.44 * 0.5;
  rule.renderOrder = 10;
  const sweepT = sweepOverlay(title), sweepS = sweepOverlay(sub);
  sweepT.position.copy(title.position).setZ(0.002);
  sweepS.position.copy(sub.position).setZ(0.002); sweepS.scale.copy(sub.scale);
  typo.add(title, sub, rule, sweepT, sweepS);

  const closing = solid(new TextPlane('A MOTION DESIGN STUDY', { font: FONTS.mono, weight: 400, height: 0.088, letterSpacing: 0.6, color: '#e4eaf3', intensity: 1.05 }));
  closing.position.y = sub.position.y - 0.34;
  typo.add(closing);

  const self = { scene, camera, background: 0x000000, dof: { focus: ZT, range: 2.2, amount: 0 }, bloom: { strength: 0.75 }, exposure: 1, update };

  // ---- camera path ---------------------------------------------------------------
  const P0 = new THREE.Vector3(2.9, 0.7, 3.4), T0 = new THREE.Vector3(3.6, 0.3, -1.0);
  const P1 = new THREE.Vector3(0, 0.9, 11.0), T1 = new THREE.Vector3(0, 0.55, 0);
  const P2 = new THREE.Vector3(0, 1.2, 10.2), T2 = new THREE.Vector3(0, 3.25, 0);
  const pos = new THREE.Vector3(), tgt = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const TITLE_GOLD = new THREE.Color('#f4e3c1');

  function update(t, info) {
    // pull back (fast → slow), then a slow majestic crane that sinks Earth to the bottom of frame
    const pull = ease.outCubic(sat((t - (C_PULL - 0.2)) / 2.3));
    const crane = ease.inOutSine(sat((t - (C_IDEAS - 0.2)) / (C_IMPACT - C_IDEAS)));
    a.copy(P0).lerp(P1, pull); b.copy(T0).lerp(T1, pull);
    pos.copy(a).lerp(P2, crane); tgt.copy(b).lerp(T2, crane);
    pos.z += t * 0.03 - (1 - pull) * 0.25 * t;
    const drift = 0.12 - t * 0.022;
    const cs = Math.cos(drift), sn = Math.sin(drift);
    pos.set(cs * pos.x + sn * pos.z, pos.y, -sn * pos.x + cs * pos.z);
    // impact: tiny camera kick
    const kt = t - C_IMPACT;
    const kick = kt > 0 ? Math.exp(-kt * 5) : 0;
    pos.y += Math.sin(kt * 50) * 0.012 * kick;
    camera.position.copy(pos);
    camera.lookAt(tgt);
    camera.fov = 35 + (1 - pull) * 10 - kick * 0.8;
    camera.updateProjectionMatrix();

    // Earth
    earthMat.uniforms.uTime.value = t;
    earthMat.uniforms.uRot.value = 0.6 + t * 0.035;
    const fade = 1 - sat((t - C_FADE) / (DUR - C_FADE)) * 0.7;
    const revealE = smoothstep(0.1, 1.6, t);
    earthMat.uniforms.uBright.value = revealE * fade * (1 - smoothstep(C_IMPACT - 1.2, C_IMPACT, t) * 0.2 + kick * 0.15);
    earthMat.uniforms.uCity.value = 3.0 * revealE * fade;
    atmoMat.uniforms.uAtmo.value = revealE * fade * (1 + kick * 0.8);
    earthMat.uniforms.uAtmo.value = revealE * fade * (1 + kick * 0.5);

    // particles: form during the pull-back, calm after the drop, pulse on the impact
    ou.uForm.value = ease.inOutSine(sat((t - 0.05) / 2.5));
    ou.uSpin.value = t * 0.35 + ease.outCubic(sat(t / 1.5)) * 0.9;
    ou.uTime.value = t;
    ou.uViewport.value = info.height;
    ou.uWaveR.value = kt > 0 ? RE + kt * 4.5 : -10;
    ou.uWaveAmp.value = kt > 0 ? Math.exp(-kt * 0.6) * 1.4 : 0;
    const preDim = 1 - envelope(t, C_IMPACT - 0.9, C_IMPACT + 0.02, 0.8, 0.02) * 0.35;
    ou.uIntensity.value = (2.1 + (1 - sat((t - C_PULL) / 1.5)) * 0.8 - smoothstep(C_IMPACT, C_IMPACT + 1.5, t) * 0.5) * preDim * fade * (1 + kick * 0.6);
    ou.uOpacity.value = sat(t / 0.25 + 0.5);
    bg.tick(t, info);
    bg.u.opacity = revealE * fade;

    // IDEAS BUILD UPON IDEAS.
    const n = ideas.letters.length;
    ideas.letters.forEach((l, i) => {
      const s0 = C_IDEAS + l.u * 1.4;
      const k = ease.outCubic(sat((t - s0) / 0.9));
      const o0 = C_OUT + l.u * 0.45;
      const out = ease.inCubic(sat((t - o0) / 0.6));
      l.mesh.opacity = k * (1 - out);
      l.mesh.position.set(l.base.x, l.base.y - (1 - k) * 0.05 + out * 0.08, 0);
      l.mesh.scale.setScalar(1 + (1 - k) * 0.25);
      l.mesh.intensity = 1.15 + (1 - k) * 1.5 + envelope(t, C_IDEAS + 1.6 + i * 0.03, C_IDEAS + 2.3 + i * 0.03, 0.3, 0.4) * 0.35;
    });
    ideas.visible = t > C_IDEAS - 0.1 && t < C_OUT + 1.2;

    // final title — one impact
    const on = kt >= 0 ? 1 : 0;
    const attack = sat(kt / 0.05);
    title.opacity = attack * on * fade;
    sub.opacity = sat((kt - 0.08) / 0.25) * on * fade;
    const heat = kt > 0 ? Math.exp(-kt * 3.0) : 0;
    title.intensity = 1.1 + heat * 2.2;
    sub.intensity = 1.0 + heat * 1.4;
    title.color.setRGB(1, 1, 1).lerp(TITLE_GOLD, 1 - heat);
    title.scale.setScalar(1 + heat * 0.035);
    const sw = sat((kt - 0.15) / 1.4);
    sweepT.material.uniforms.uS.value = lerp(-0.15, 1.15, ease.inOutSine(sw));
    sweepT.material.uniforms.uOpacity.value = on * (sw > 0 && sw < 1 ? 1 : 0) * fade;
    sweepS.material.uniforms.uS.value = lerp(-0.15, 1.15, ease.inOutSine(sat((kt - 0.3) / 1.4)));
    sweepS.material.uniforms.uOpacity.value = on * (kt > 0.3 && kt < 1.7 ? 0.8 : 0) * fade;
    const rl = ease.inOutCubic(sat((kt - 0.35) / 1.1));
    rule.scale.x = Math.max(0.001, rl * wTitle * 0.55);
    rule.material.opacity = rl * 0.8 * fade;
    rule.visible = on && rl > 0;
    rule.position.y = (title.position.y + sub.position.y) / 2 + 0.01;
    title.visible = title.opacity > 0.001;

    closing.opacity = sat((t - C_CLOSE) / 0.4) * 0.9 * fade;
    closing.reveal = ease.outCubic(sat((t - C_CLOSE) / 1.0));

    // lens + grade
    self.dof.focus = ZT;
    self.dof.range = 2.2;
    self.dof.amount = smoothstep(C_DROP, C_IDEAS, t) * 0.7 + smoothstep(C_IMPACT - 0.8, C_IMPACT, t) * 0.2;
    self.bloom.strength = 0.8 + kick * 0.4;
    self.exposure = (1 + kick * 0.25) * lerp(1, 0.75, sat((t - C_FADE) / (DUR - C_FADE)));
  }

  return self;
}
