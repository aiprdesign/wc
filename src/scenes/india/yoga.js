// YOGA & PRANAYAMA — the science of breath (46.5 – 51.0 s)
// Dawn on the river ghats, one continuous camera move:
//   (in)          the 'zoom' from Gifts to the World lands on a seated figure at the water's edge, its back to
//                 us, outlined in gold against the glow on the river
//   yogaSunrise   46.8  the sun's limb clears the far bank on the orchestra's hit; the glitter path ignites
//                       and the camera cranes back up the stone steps: plinth, umbrellas, shrines, boats, mist
//   suryaNamaskar 47.3  twelve stylised figures stand in an arc on the landing, each holding one position of the
//                       sun salutation; a wave of light runs along the row, every figure flowing out of the
//                       previous position into its own (pranamasana … pranamasana) · "SURYA NAMASKAR · 12 POSITIONS"
//   pranayama     48.4  the camera swoops down to the seated figure, which turns into a translucent hologram:
//                       breath (cool light) enters the left nostril, runs down the trachea, the bronchial tree
//                       lights generation by generation and the lungs fill while the diaphragm drops — the
//                       inhale is the orchestra's held tension · gauge "INHALE 4 · HOLD 4 · EXHALE 8"
//   nadiShodhana  49.0  close on the head: the held breath; the sequence of alternate-nostril breathing
//   exhale        49.6  the release: warm light leaves through the right nostril, a calm wave of light runs out
//                       across the water, the lungs empty and the diaphragm rises
//   eightLimbs    50.1  a ring of eight segments around the figure, pranayama (the fourth) lit brightest
//   yogaDay       50.5  the figure's light flies out onto a globe turning into dawn, practice points lighting
//                       as the sunrise line crosses them · 21 JUNE · UNESCO 2016 — on into the dissolve.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { MorphParticles, Dust, sampleGeometry } from '../../lib/particles.js';
import { progressLine, segmentsLine, circlePoints } from '../../lib/lines.js';
import { Callout } from '../../lib/hud.js';
import { glowSprite } from '../../lib/materials.js';
import * as AS from './yoga-assets.js';
import * as NK from './nature-kit.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = '#ffcf85', IVORY = '#ffe9c8', AIR = '#bfe6ff', WARM = '#ffb866';
const S_BASE = V3(0, 0.36, -3.9);          // the seated figure: plinth top, at the water's edge
const ROW_N = 12, ROW_DX = 1.56;
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ sky (shared by the dome and the water)
const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir, uTop, uHor, uSunCol, uMistCol; uniform float uSun, uHalo, uMist;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.34, max(h, 0.0)));
  c = mix(c, c * vec3(1.08, 0.74, 1.12), smoothstep(0.03, 0.12, h) * (1.0 - smoothstep(0.12, 0.3, h)));
  float s = max(dot(d, uSunDir), 0.0);
  float az = atan(d.x, -d.z);
  // thin dawn cloud streaks, lit from below near the sun
  float st = smoothstep(0.55, 0.95, snoise(vec3(az * 2.2, h * 34.0, 3.0)) * 0.6 + snoise(vec3(az * 7.0, h * 70.0, 9.0)) * 0.4);
  float band = smoothstep(0.025, 0.06, h) * (1.0 - smoothstep(0.1, 0.22, h));
  c = mix(c, uSunCol * (0.25 + 1.4 * pow(s, 6.0)) + vec3(0.12, 0.06, 0.1), st * band * 0.8);
  c += uSunCol * pow(s, 7.0) * 0.28 * uHalo * (1.0 - smoothstep(-0.02, 0.22, h));
  c += uSunCol * (pow(s, 260.0) * 0.7 + pow(s, 28.0) * 0.14) * uHalo;
  float disc = smoothstep(0.99968, 0.99973, s);
  c += uSunCol * vec3(1.0, 0.9, 0.75) * disc * uSun * 5.0;
  c = mix(c, uHor * 0.55, smoothstep(0.0, -0.04, h));
  return mix(c, uMistCol, uMist * (1.0 - smoothstep(0.0, 0.5, h) * 0.6));
}`;

// points flowing along a curve (resampled into a uniform array): fract(aU + t·speed) inside [tail, head]
const FLOW_VERT = /* glsl */ `
uniform vec3 uPts[32]; uniform float uTime, uSpeed, uHead, uTail, uSize, uViewport, uR0, uR1;
attribute float aU; attribute vec3 aJ;
varying float vA;
void main(){
  float s = fract(aU + uTime * uSpeed);
  float f = s * 31.0; int i = int(min(floor(f), 30.0)); float k = f - float(i);
  vec3 p = mix(uPts[i], uPts[i + 1], k);
  p += aJ * mix(uR0, uR1, smoothstep(0.0, 0.45, s));
  vA = smoothstep(uTail - 0.04, uTail + 0.02, s) * (1.0 - smoothstep(uHead - 0.03, uHead, s));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
}`;
const FLOW_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; varying float vA;
void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a * vA * uOpacity; if (a < 0.004) discard; gl_FragColor = vec4(uColor, a); }`;
function flowPoints(curve, n, { color = AIR, intensity = 2, size = 0.008, speed = 1.2, r0 = 0.02, r1 = 0.003, seed = 3 } = {}) {
  const r = rng(seed), g = new THREE.BufferGeometry();
  const u = new Float32Array(n), j = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { u[i] = r(); const a = r() * TAU, rr = Math.sqrt(r()); j[i * 3] = Math.cos(a) * rr; j[i * 3 + 1] = (r() - 0.5) * 0.6; j[i * 3 + 2] = Math.sin(a) * rr; }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aU', new THREE.BufferAttribute(u, 1)); g.setAttribute('aJ', new THREE.BufferAttribute(j, 3));
  const pts = curve.getSpacedPoints(31);
  const m = new THREE.ShaderMaterial({
    uniforms: { uPts: { value: pts }, uTime: { value: 0 }, uSpeed: { value: speed }, uHead: { value: 0 }, uTail: { value: 0 }, uSize: { value: size }, uViewport: { value: 800 },
      uR0: { value: r0 }, uR1: { value: r1 }, uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: 1 } },
    vertexShader: FLOW_VERT, fragmentShader: FLOW_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 4;
  return p;
}

// holographic shell (fresnel + scanlines + a travelling scan band), additive
function holoMaterial({ color = '#ffe2b0', deep = '#5a3a1c', intensity = 1, base = 0.04, power = 2.2 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uIntensity: { value: intensity }, uOpacity: { value: 0 },
      uTime: { value: 0 }, uBase: { value: base }, uPower: { value: power }, uScanY: { value: -10 }, uFill: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor, uDeep; uniform float uIntensity, uOpacity, uTime, uBase, uPower, uScanY, uFill;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(normalize(vN), V)), uPower);
        float scan = 0.84 + 0.16 * sin(vW.y * 260.0 - uTime * 6.0);
        float band = exp(-((vW.y - uScanY) / 0.018) * ((vW.y - uScanY) / 0.018));
        vec3 col = mix(uDeep, uColor, f) * uIntensity * (1.0 + uFill * 1.6) + uColor * band * 1.5;
        float a = ((uBase + uFill * 0.25 + f * 0.9) * scan + band * 0.5) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// the figures: warm satin mannequins with a gold rim and a per-instance glow (x) / solidity (y)
function figureMaterial(instanced) {
  const m = new THREE.MeshStandardMaterial({ color: '#80604a', roughness: 0.42, metalness: 0 });
  const U = { uRim: { value: new THREE.Color() }, uGlowCol: { value: new THREE.Color(1.0, 0.72, 0.38) }, uSunV: { value: new THREE.Vector3() }, uGlowSelf: { value: 0 }, uSolidSelf: { value: 1 } };
  m.userData.U = U; m.userData.noDetail = true; m.userData.noBatch = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      ${instanced ? 'attribute vec2 aGlow;' : ''} varying vec2 vGlow; uniform float uGlowSelf, uSolidSelf;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      ${instanced ? 'vGlow = aGlow;' : 'vGlow = vec2(uGlowSelf, uSolidSelf);'}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vGlow; uniform vec3 uRim, uGlowCol, uSunV;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= vGlow.y;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { vec3 Vv = normalize(vViewPosition); float fr = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 2.6);
        float toward = 0.3 + 0.7 * clamp(dot(normal, uSunV) * 0.6 + 0.4, 0.0, 1.0);
        totalEmissiveRadiance += uRim * fr * toward + uGlowCol * vGlow.x * (0.3 + 1.2 * fr); }`);
  };
  m.customProgramCacheKey = () => 'yogaFig' + (instanced ? 'I' : 'S');
  return m;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tSun = cue('yogaSunrise'), tSur = cue('suryaNamaskar'), tPra = cue('pranayama'), tNadi = cue('nadiShodhana');
  const tEx = cue('exhale'), tLimb = cue('eightLimbs'), tDay = cue('yogaDay');
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.25;
  scene.fog = new THREE.FogExp2('#3a2a26', 0.012);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 900);
  const R = rng(4691);

  // ---------------------------------------------------------------- light
  const sunDir = new THREE.Vector3();
  const sunAt = (t, out) => { const e = (-1.4 + 1.1 * (t - tSun)) * D2R, a = -6 * D2R; return out.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); };
  const key = new THREE.DirectionalLight('#ffb070', 3.0);
  key.castShadow = true; key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 8, bottom: -8, near: 1, far: 70 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
  key.target.position.set(0, 0.8, -1);
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#6f84b8', '#4a3024', 0.55); scene.add(hemi);
  const fill = new THREE.DirectionalLight('#9fb4e0', 0.35); fill.position.set(4, 6, 12); scene.add(fill);

  // ---------------------------------------------------------------- sky
  const skyU = {
    uSunDir: { value: new THREE.Vector3() }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color(1.0, 0.56, 0.26) },
    uMistCol: { value: new THREE.Color() }, uSun: { value: 1 }, uHalo: { value: 1 }, uMist: { value: 0 }, uTime: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}\n${SKY_GLSL}\nvarying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir)), 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // ---------------------------------------------------------------- the river
  const waterU = { ...skyU, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.004 }, uGlitter: { value: 0 }, uWave: { value: 0 }, uWaveR: { value: 0 }, uBankCol: { value: new THREE.Color(0.03, 0.05, 0.03) }, uBodyK: { value: 0 } };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400, 1, 1), new THREE.ShaderMaterial({
    uniforms: waterU, fog: false,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}\n${SKY_GLSL}
      uniform vec3 uFogCol, uBankCol; uniform float uFogD, uGlitter, uTime, uWave, uWaveR, uBodyK; varying vec3 vW;
      float rip(vec2 p){ return snoise(vec3(p * vec2(0.9, 2.6), uTime * 0.35)) * 0.45 + snoise(vec3(p * vec2(2.6, 6.0) + 7.0, uTime * 0.6)) * 0.3 + snoise(vec3(p * vec2(7.0, 12.0), uTime)) * 0.15; }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW.xz - cameraPosition.xz);
        float amp = 0.05 / (1.0 + dist * 0.03);
        float e = 0.03, n0 = rip(vW.xz), nx = rip(vW.xz + vec2(e, 0.0)), nz = rip(vW.xz + vec2(0.0, e));
        // the exhale's ring wave on the water
        float rr = length(vW.xz - vec2(${S_BASE.x.toFixed(2)}, ${S_BASE.z.toFixed(2)}));
        float ring = exp(-((rr - uWaveR) / 0.35) * ((rr - uWaveR) / 0.35)) * uWave;
        vec3 N = normalize(vec3(-(nx - n0) / e * amp, 1.0, -(nz - n0) / e * amp));
        vec3 R = reflect(V, N); R.y = abs(R.y) + 0.002;
        vec3 refl = skyCol(normalize(R));
        // the far bank's tree line, mirrored: a dark green band just under the horizon, broken where the
        // low sandbank faces the sunrise
        { vec3 Rn = normalize(R); float az = atan(Rn.x, -Rn.z);
          float gap = smoothstep(0.17, 0.3, abs(az + 0.105));
          float bh = (0.004 + gap * (0.022 + 0.012 * snoise(vec3(az * 30.0, 1.0, 0.0)) + 0.006 * snoise(vec3(az * 90.0, 3.0, 0.0))));
          refl = mix(refl, uBankCol, (1.0 - smoothstep(bh * 0.7, bh, Rn.y)) * 0.85); }
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        // the Ganga's body: blue-green, catching the dawn light where the water is seen from above
        vec3 body = vec3(0.045, 0.15, 0.14) * (0.7 + 0.5 * uBodyK) + vec3(0.05, 0.08, 0.04) * uGlitter * 0.3;
        body *= 0.85 + 0.3 * snoise(vec3(vW.xz * 0.05, 4.0));
        // away from the glitter path the reflection takes the river's own blue-green
        float toSun = pow(max(dot(normalize(R.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0), 6.0);
        refl *= mix(vec3(0.62, 1.0, 0.98), vec3(1.0), toSun);
        vec3 col = mix(body, refl, fres * mix(0.55, 0.85, toSun));
        float s = max(dot(normalize(R), uSunDir), 0.0);
        float pw = mix(1400.0, 60.0, clamp(dist / 160.0, 0.0, 1.0));
        col += uSunCol * (pow(s, pw) * 26.0 + pow(s, 40.0) * 0.28) * uGlitter;
        col += vec3(1.0, 0.78, 0.46) * ring * 1.6;
        col = mix(col, uFogCol, 1.0 - exp(-dist * uFogD));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0.0; water.renderOrder = -5; scene.add(water);

  // the far bank: a low, hazy line of trees on the horizon
  {
    const N = 400, pos = [], idx = [], r = rng(9);
    for (let i = 0; i <= N; i++) {
      const a = (i / N - 0.5) * 2.4, x = Math.sin(a) * 520, z = -Math.cos(a) * 520 + 40;
      const h = 1.6 + 2.2 * Math.max(0, Math.sin(i * 0.31) * 0.5 + Math.sin(i * 0.083 + 1) * 0.7 + (r() - 0.5) * 0.6);
      pos.push(x, -0.5, z, x, h, z);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const bankMat = new THREE.MeshBasicMaterial({ color: '#2a1d1c', fog: false, side: THREE.DoubleSide });
    bankMat.userData.noDetail = true;
    const bank = new THREE.Mesh(g, bankMat); bank.userData.bankMat = bankMat; scene.add(bank);
    var bankM = bankMat;   // eslint-disable-line no-var
  }

  // trees on the far bank (beyond the sandbank that faces the sunrise) and on the terrace above the ghats:
  // peepal, neem, mango, banyan and a few palms, lit through by the low sun (nature-kit); the far ones take a
  // scene-controlled haze instead of the dense dawn fog, so the tree line reads as the mist allows
  const leafSun = { dir: new THREE.Vector3(0, 0.05, -1), color: new THREE.Color(1.6, 0.9, 0.45) };
  const bankHaze = { color: new THREE.Color(), k: { value: 0.4 } };
  const farTrees = (() => {
    const items = [], r = rng(77);
    for (let i = 0; i < (lite ? 140 : 400); i++) {
      const a = (r() - 0.5) * 2.3;
      if (Math.abs(a + 0.105) < 0.2 + 0.08 * r()) continue;             // the low sandbank under the sun
      const d = 505 + r() * 40, x = Math.sin(a) * d, z = -Math.cos(a) * d + 40, q = r();
      const kind = q < 0.3 ? 'peepal' : q < 0.55 ? 'neem' : q < 0.75 ? 'mango' : q < 0.88 ? 'banyan' : 'palm';
      items.push({ kind, x, y: -0.6, z, s: (0.7 + r() * 0.5) * (lite ? 1.15 : 1), lite: true, tint: 0.75 + r() * 0.3 });
    }
    return NK.plantForest(items, { sun: leafSun, lite: true, variants: 2, seed: 21, wind: 0.4, haze: bankHaze, castShadow: false, receiveShadow: false });
  })();
  scene.add(farTrees.group);
  const ghatTrees = NK.plantForest([
    { kind: 'peepal', x: -8.5, y: AS.GHAT.terraceY - 0.1, z: 12.6, s: 0.85 }, { kind: 'neem', x: 12.5, y: AS.GHAT.terraceY - 0.1, z: 12.2, s: 0.8 },
    { kind: 'banyan', x: -27, y: AS.GHAT.terraceY - 0.1, z: 12.0, s: 0.75 }, { kind: 'peepal', x: 30, y: AS.GHAT.terraceY - 0.1, z: 12.4, s: 0.8 },
  ], { sun: leafSun, lite, variants: 2, seed: 3, wind: 0.6 });
  scene.add(ghatTrees.group);

  // ---------------------------------------------------------------- the ghats
  const stoneTex = AS.stoneTexture(5);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, vertexColors: true, roughness: 0.9, color: '#c9a488' });
  const steps = new THREE.Mesh(AS.ghatGeometry(), stoneMat); steps.receiveShadow = true; steps.castShadow = true; scene.add(steps);
  const plinthMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85, color: '#c49a7c' });
  const plinth = new THREE.Mesh(AS.plinthGeometry(1.7, S_BASE.y), plinthMat); plinth.position.set(S_BASE.x, 0, S_BASE.z);
  plinth.receiveShadow = true; plinth.castShadow = true; scene.add(plinth);
  const shrineMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.8, color: '#d9a27a' });
  const shrines = [[-6.4, -3.7, 1.0, 0.35, true], [7.6, 0.3, 1.0, 0], [-12.5, 8.5, 1.7, 0], [13.5, 9.0, 1.45, 0], [-22, 3.5, 1.3, 0], [21, -2.4, 1.1, 0.2]];
  for (const [x, z, s, rot, own] of shrines) {
    const m = new THREE.Mesh(AS.shrineGeometry(s), shrineMat);
    const y = own ? 0.3 : Math.max(0, AS.stepHeightAt(z));
    m.position.set(x, y, z); m.rotation.y = rot; m.castShadow = true; m.receiveShadow = true; scene.add(m);
    if (own) { const p = new THREE.Mesh(AS.plinthGeometry(1.5, 0.3), plinthMat); p.position.set(x, 0, z); p.receiveShadow = true; scene.add(p); }
  }
  // the bathing ghats' umbrellas
  const umb = AS.umbrellaGeometry();
  const poleMat = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.8 });
  const canopyMats = ['#b8743a', '#8a4a2c', '#c49a5a'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide }));
  [[-11.6, -2.2], [-15.2, -1.0], [11.8, -2.4], [15.6, -1.2], [-19.5, 0.4], [19.4, 0.6], [-27, -2.0], [26, -1.6]].forEach(([x, z], i) => {
    const y = Math.max(0, AS.stepHeightAt(z));
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set((R() - 0.5) * 0.08, R() * TAU, (R() - 0.5) * 0.1);
    const pole = new THREE.Mesh(umb.pole, poleMat), can = new THREE.Mesh(umb.canopy, canopyMats[i % 3]);
    pole.castShadow = can.castShadow = true; g.add(pole, can); scene.add(g);
  });
  // palaces behind the terrace (the backdrop when the camera turns along the bank)
  {
    const parts = [], r = rng(31);
    for (let x = -46; x < 46;) {
      const w = 5 + r() * 7, h = 7 + r() * 10, d = 6 + r() * 4;
      parts.push(new THREE.BoxGeometry(w, h, d).translate(x + w / 2, AS.GHAT.terraceY + h / 2, 15 + d / 2 + r() * 2));
      if (r() < 0.5) parts.push(new THREE.SphereGeometry(1.2, 12, 8, 0, TAU, 0, Math.PI / 2).translate(x + w / 2, AS.GHAT.terraceY + h + 0.6, 17), new THREE.CylinderGeometry(1.3, 1.3, 0.6, 12).translate(x + w / 2, AS.GHAT.terraceY + h + 0.3, 17));
      x += w + 0.3;
    }
    const pal = new THREE.Mesh(AS.worldUV(AS.merge(parts), 2.5), new THREE.MeshStandardMaterial({ map: stoneTex, color: '#a07862', roughness: 0.9 }));
    pal.receiveShadow = true; scene.add(pal);
  }
  // boats
  const boatG = AS.boatGeometry();
  const boatMat = new THREE.MeshStandardMaterial({ color: '#3a281c', roughness: 0.7, side: THREE.DoubleSide });
  const boats = [[-13, -24, 0.4], [10, -38, -0.3], [-30, -62, 0.1], [26, -70, 0.6]].map(([x, z, ry]) => {
    const b = new THREE.Mesh(boatG, boatMat); b.position.set(x, -0.18, z); b.rotation.y = ry; scene.add(b); return { b, x, z };
  });
  // floating lamps (diyas) drifting downstream
  const DIYA_N = 46, diyas = [];
  for (let i = 0; i < DIYA_N; i++) {
    const s = glowSprite({ color: '#ffb35a', intensity: 1.2, scale: 0.35 }); s.material.fog = false;
    diyas.push({ s, x: (R() - 0.5) * 50, z: -4.4 - R() * 22, v: 0.08 + R() * 0.12, ph: R() * TAU });
    scene.add(s);
  }

  // mist over the water: layered soft sheets, lit towards the sun
  const mistU = { uTime: { value: 0 }, uCol: { value: new THREE.Color() }, uOp: { value: 0.5 } };
  const mistMat = new THREE.ShaderMaterial({
    uniforms: mistU, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform float uTime, uOp; uniform vec3 uCol; varying vec3 vW;
      void main(){
        float n = snoise(vec3(vW.x * 0.05 + uTime * 0.08, vW.z * 0.12, vW.y + uTime * 0.05)) * 0.6 + snoise(vec3(vW.x * 0.17 - uTime * 0.1, vW.z * 0.3, 2.0)) * 0.4;
        float d = length(vW.xz - cameraPosition.xz);
        float a = smoothstep(-0.25, 0.8, n) * smoothstep(2.0, 9.0, d) * (1.0 - smoothstep(120.0, 300.0, d)) * uOp;
        gl_FragColor = vec4(uCol, a * 0.5);
      }`,
  });
  for (const [y, z0] of [[0.25, -4], [0.75, -6], [1.6, -10]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(500, 300), mistMat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, z0 - 150); m.renderOrder = 3; scene.add(m);
  }
  const dust = new Dust({ count: lite ? 500 : 1100, size: [10, 4, 10], center: [0, 1.8, -2], color: '#ffd9a0', particleSize: 0.02, opacity: 0.4 });
  dust.material.fog = false; scene.add(dust);

  // ---------------------------------------------------------------- the row: twelve positions of the sun salutation
  const boneGeo = AS.boneGeometries(lite);
  const figMatI = figureMaterial(true);
  const inst = {};
  for (const kind of AS.BONES) {
    const n = AS.BONE_COUNT[kind] * ROW_N, g = boneGeo[kind];
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2));
    const im = new THREE.InstancedMesh(g, figMatI, n);
    im.castShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    inst[kind] = im; scene.add(im);
  }
  const rowPos = [...Array(ROW_N)].map((_, i) => { const x = (i - (ROW_N - 1) / 2) * ROW_DX; return V3(x, AS.GHAT.landingY, 1.3 - 1.9 * Math.pow(x / 8.6, 2)); });
  const rowT = (i) => tSur + i / 12;     // sixteenth-note sextuplets of the 120 BPM bar
  const floorPts = [];
  for (let i = 0; i <= 80; i++) { const x = -9.4 + (18.8 * i) / 80; floorPts.push(V3(x, AS.GHAT.landingY + 0.012, 1.3 - 1.9 * Math.pow(x / 8.6, 2) - 0.02)); }
  const floorLine = progressLine(floorPts, { color: GOLD, headColor: '#fff2d0', intensity: 1.6, head: 0.05 }); floorLine.material.fog = false; scene.add(floorLine);
  const footDots = rowPos.map((p) => { const s = glowSprite({ color: '#ffc070', intensity: 1, scale: 0.4 }); s.position.copy(p).add(V3(0, 0.03, 0)); s.material.fog = false; scene.add(s); return s; });

  // ---------------------------------------------------------------- the seated figure (solid → hologram)
  const sGroup = new THREE.Group(); sGroup.position.copy(S_BASE); sGroup.rotation.y = Math.PI; scene.add(sGroup);
  const seatGeo = AS.seatedGeometry(lite);
  const figMatS = figureMaterial(false); figMatS.transparent = true;
  const sSolid = new THREE.Mesh(seatGeo, figMatS); sSolid.castShadow = true; sGroup.add(sSolid);
  const holoBody = holoMaterial({ color: '#ffe0b0', deep: '#4a2e18', intensity: 0.55, base: 0.02 });
  const sHolo = new THREE.Mesh(seatGeo, holoBody); sHolo.renderOrder = 2; sGroup.add(sHolo);
  // depth-only proxy drawn after the additive layers, so depth of field keeps the hologram in focus
  const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true, depthWrite: true });
  depthMat.userData.noDetail = true;
  const sDepth = new THREE.Mesh(seatGeo, depthMat); sDepth.renderOrder = 20; sGroup.add(sDepth);
  const sWorld = (v, out = new THREE.Vector3()) => out.copy(v).applyAxisAngle(V3(0, 1, 0), Math.PI).add(S_BASE);
  // lungs
  const lungMat = holoMaterial({ color: '#ffa48a', deep: '#5a1e18', intensity: 0.6, base: 0.04, power: 1.8 });
  const lungs = [-1, 1].map((s) => {
    const g = AS.lungGeometry(s, lite); g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    const m = new THREE.Mesh(g, lungMat); m.position.copy(c); m.renderOrder = 3; sGroup.add(m); return m;
  });
  // diaphragm dome
  const diaG = new THREE.SphereGeometry(0.2, 28, 10, 0, TAU, 0, 0.95).scale(0.78, 0.55, 0.6);
  const diaMat = holoMaterial({ color: '#ffd4a0', deep: '#3a2010', intensity: 0.8, base: 0.08, power: 1.4 });
  const dia = new THREE.Mesh(diaG, diaMat); dia.position.set(0, 0.255, 0); dia.renderOrder = 3; sGroup.add(dia);
  // bronchial tree
  const tree = AS.bronchialTree(lite), GEN = Math.max(...tree.map((s) => s[2]));
  const treeLines = segmentsLine(tree.map(([a, b]) => [a, b]), { color: '#ffe8d0', headColor: '#ffffff', intensity: 1.6, head: 0.05, orderFn: (a, b, i) => (tree[i][2] / (GEN + 1)) * 0.82, stagger: 0.82 });
  treeLines.material.fog = false; treeLines.renderOrder = 5; sGroup.add(treeLines);
  // the air filling the lungs: points bud from the airway tips into the lung volume
  const NF = lite ? 1400 : 3200, fa = new Float32Array(NF * 3), fb = new Float32Array(NF * 3);
  {
    const lungPts = [AS.sampleLung(-1, NF / 2, 5), AS.sampleLung(1, NF / 2, 6)];
    const tips = [-1, 1].map((s) => tree.filter((t) => t[2] >= 3 && Math.sign(t[1].x) === s).map((t) => t[1]));
    for (let i = 0; i < NF; i++) {
      const side = i % 2, b = lungPts[side][i >> 1];
      let best = tips[side][0], bd = 1e9;
      for (let k = 0; k < 24; k++) { const c = tips[side][Math.floor(R() * tips[side].length)]; const d = c.distanceToSquared(b); if (d < bd) { bd = d; best = c; } }
      fa.set([best.x, best.y, best.z], i * 3); fb.set([b.x, b.y, b.z], i * 3);
    }
  }
  const fillPts = new MorphParticles({ count: NF, positions: fa, targets: fb, size: 0.0055, color: '#cfeeff', intensity: 1.0, opacity: 0, seed: 77, stagger: 0.55 });
  fillPts.material.fog = false; fillPts.renderOrder = 6; sGroup.add(fillPts);
  // airflow: in through the left nostril, out through the right
  const flowIn = flowPoints(AS.airwayCurve(1, false), lite ? 500 : 1100, { color: AIR, intensity: 2.4, size: 0.0075, speed: 1.6, r0: 0.03, r1: 0.003, seed: 11 });
  const flowOut = flowPoints(AS.airwayCurve(-1, true), lite ? 500 : 1100, { color: WARM, intensity: 2.2, size: 0.008, speed: 0.9, r0: 0.003, r1: 0.05, seed: 12 });
  flowOut.material.uniforms.uR0.value = 0.003; sGroup.add(flowIn, flowOut);
  // r0/r1 for the exhale: tight inside, spreading outside (the curve starts inside)
  {
    const v = flowOut.material.vertexShader.replace('mix(uR0, uR1, smoothstep(0.0, 0.45, s))', 'mix(uR0, uR1, smoothstep(0.6, 1.0, s))');
    flowOut.material.vertexShader = v;
  }
  const nostrilGlow = [AS.SEAT.nostrilL, AS.SEAT.nostrilR].map((p, i) => { const s = glowSprite({ color: i ? WARM : AIR, intensity: 0, scale: 0.06 }); s.position.copy(p); s.material.fog = false; sGroup.add(s); return s; });
  const chestGlow = glowSprite({ color: '#ffc070', intensity: 0, scale: 0.9 }); chestGlow.position.copy(AS.SEAT.chest); chestGlow.material.fog = false; sGroup.add(chestGlow);
  // the exhale: a calm shell of light expanding from the chest
  const waveMat = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.75, 0.45) } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uOp; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(uCol * 1.6, f * uOp); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const wave = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), waveMat); wave.position.copy(sWorld(AS.SEAT.chest)); wave.renderOrder = 7; scene.add(wave);

  // ---------------------------------------------------------------- Patanjali's eight limbs: a ring of eight segments
  const LIMBS = ['YAMA', 'NIYAMA', 'ASANA', 'PRANAYAMA', 'PRATYAHARA', 'DHARANA', 'DHYANA', 'SAMADHI'];
  const RING_Y = S_BASE.y + 0.02, RIN = 1.02, ROUT = 1.17;
  // camera azimuth at the ring beat decides where 'front' is (set after the camera keys below)
  const ringSegs = [];

  // ---------------------------------------------------------------- the globe
  const GLOBE_C = sWorld(V3(0, 0.52, 0)), GLOBE_R = 0.72;
  const globe = new THREE.Group(); globe.position.copy(GLOBE_C); scene.add(globe);
  const globeSun = new THREE.Vector3(1, 0, 0);
  const shellMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: globeSun }, uOp: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun; uniform float uOp; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 V = normalize(cameraPosition - vW); vec3 N = normalize(vN);
        float f = pow(1.0 - abs(dot(N, V)), 2.5); float l = dot(N, uSun);
        float dawn = exp(-(l / 0.09) * (l / 0.09));
        vec3 col = vec3(0.25, 0.45, 0.8) * f * 0.6 + vec3(1.0, 0.62, 0.3) * dawn * 0.55 + vec3(0.5, 0.42, 0.3) * smoothstep(-0.1, 0.4, l) * 0.12 + vec3(0.03, 0.06, 0.12);
        gl_FragColor = vec4(col * uOp, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_R, 48, 32), shellMat); shell.renderOrder = 8; globe.add(shell);
  const gDepth = new THREE.Mesh(shell.geometry, depthMat); gDepth.renderOrder = 20; globe.add(gDepth);
  const spin = new THREE.Group(); globe.add(spin);
  const GP_VERT = /* glsl */ `
    attribute float aKind; uniform vec3 uSun; uniform float uSize, uViewport, uR;
    varying vec3 vC; varying float vA;
    void main(){
      vec3 n = normalize(mat3(modelMatrix) * position);
      float l = dot(n, uSun);
      vec4 mv = modelViewMatrix * vec4(position * uR, 1.0);
      vec3 V = normalize(cameraPosition - (modelMatrix * vec4(position * uR, 1.0)).xyz);
      float facing = smoothstep(-0.15, 0.25, dot(n, V));
      float dawn = exp(-((l - 0.02) / 0.07) * ((l - 0.02) / 0.07));
      float day = smoothstep(-0.03, 0.12, l);
      if (aKind < 0.5) { vC = mix(vec3(0.5, 0.32, 0.14) * 0.6, vec3(1.0, 0.86, 0.62) * 1.2, day) + vec3(1.0, 0.6, 0.25) * dawn * 1.5; vA = facing * 0.9; }
      else { vC = vec3(1.0, 0.85, 0.55) * (day * 2.0 + dawn * 5.0); vA = facing * (day + dawn); }
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * (aKind < 0.5 ? 1.0 : 2.2 + dawn * 2.0) * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
    }`;
  const GP_FRAG = /* glsl */ `uniform float uOp; varying vec3 vC; varying float vA;
    void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA * uOp; if (a < 0.004) discard; gl_FragColor = vec4(vC, a); }`;
  const landV = AS.landDots(lite ? 9000 : 16000);
  const cityV = AS.CITIES.map(([lo, la]) => AS.llToVec(lo, la).multiplyScalar(1.004));
  const gpGeo = new THREE.BufferGeometry();
  {
    const all = [...landV, ...cityV], pos = new Float32Array(all.length * 3), kind = new Float32Array(all.length);
    all.forEach((v, i) => { pos.set([v.x, v.y, v.z], i * 3); kind[i] = i < landV.length ? 0 : 1; });
    gpGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gpGeo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  }
  const gpMat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: globeSun }, uSize: { value: 0.0105 }, uViewport: { value: 800 }, uR: { value: GLOBE_R * 1.003 }, uOp: { value: 0 } },
    vertexShader: GP_VERT, fragmentShader: GP_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const gp = new THREE.Points(gpGeo, gpMat); gp.frustumCulled = false; gp.renderOrder = 9; spin.add(gp);
  const grat = [];
  for (let la = -60; la <= 60; la += 30) { const pts = []; for (let i = 0; i <= 96; i++) pts.push(AS.llToVec((i / 96) * 360, la).multiplyScalar(GLOBE_R * 1.001)); for (let i = 0; i < 96; i++) grat.push([pts[i], pts[i + 1]]); }
  for (let lo = 0; lo < 360; lo += 30) { const pts = []; for (let i = 0; i <= 48; i++) pts.push(AS.llToVec(lo, -90 + (i / 48) * 180).multiplyScalar(GLOBE_R * 1.001)); for (let i = 0; i < 48; i++) grat.push([pts[i], pts[i + 1]]); }
  const gratLines = segmentsLine(grat, { color: '#9cc0ff', intensity: 0.35, orderFn: (a) => 0.5 - a.y / GLOBE_R * 0.4, stagger: 0.6 }); gratLines.material.fog = false; gratLines.renderOrder = 8; spin.add(gratLines);
  // the figure's light flies out onto the globe
  const NM = lite ? 2000 : 4500, ma = new Float32Array(NM * 3), mb = new Float32Array(NM * 3);
  {
    const sp = sampleGeometry(seatGeo, NM, { seed: 15 }), v = new THREE.Vector3();
    for (let i = 0; i < NM; i++) {
      sWorld(v.set(sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]), v); ma.set([v.x, v.y, v.z], i * 3);
      const lv = landV[Math.floor(R() * landV.length)];
      mb.set([GLOBE_C.x + lv.x * GLOBE_R, GLOBE_C.y + lv.y * GLOBE_R, GLOBE_C.z + lv.z * GLOBE_R], i * 3);
    }
  }
  const morph = new MorphParticles({ count: NM, positions: ma, targets: mb, size: 0.012, color: '#ffd9a0', intensity: 1.8, opacity: 0, seed: 23, stagger: 0.5 });
  morph.material.fog = false; morph.renderOrder = 9; scene.add(morph);

  // ---------------------------------------------------------------- camera path
  const KEYS = [
    [0.0, V3(0.22, 1.12, -1.6), V3(0.0, 0.98, -4.6)],
    [tSun + 0.05, V3(0.16, 1.55, 0.4), V3(0, 0.95, -5.0)],
    [tSur + 0.12, V3(0.0, 4.6, 9.5), V3(0, 0.75, -5.0)],
    [tSur + 0.85, V3(-0.3, 4.9, 11.6), V3(0, 0.85, -2.5)],
    [tPra - 0.08, V3(1.75, 3.4, 3.8), V3(0.2, 0.95, -3.9)],
    [tPra + 0.3, V3(1.78, 1.06, -5.05), V3(0, 0.86, -3.9)],
    [tNadi, V3(1.45, 1.1, -5.0), V3(0, 0.93, -3.9)],
    [tEx - 0.1, V3(0.98, 1.2, -4.78), V3(0, 1.06, -3.95)],
    [tEx + 0.25, V3(1.65, 1.26, -5.25), V3(0, 0.96, -3.9)],
    [tLimb + 0.25, V3(2.4, 2.3, -6.3), V3(0, 0.3, -3.9)],
    [DUR, V3(3.0, 2.75, -7.8), V3(0, 0.7, -3.9)],
  ];
  const camCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');
  const SK = KEYS.map((k, i) => [k[0], i / (KEYS.length - 1)]);
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  // ring placement: PRANAYAMA (the fourth) sits front-right as seen from the ring beat's camera
  {
    const cp = KEYS[9][1];
    const phiC = Math.atan2(cp.z - S_BASE.z, cp.x - S_BASE.x);
    const STEP = TAU / 8, GAP = 0.06;
    for (let k = 0; k < 8; k++) {
      const mid = phiC - 0.42 + (k - 3) * STEP;
      const pos = [], idx = [];
      const NS = 16;
      for (let i = 0; i <= NS; i++) {
        const a = mid - STEP / 2 + GAP / 2 + ((STEP - GAP) * i) / NS;
        pos.push(Math.cos(a) * RIN, 0, Math.sin(a) * RIN, Math.cos(a) * ROUT, 0, Math.sin(a) * ROUT);
      }
      for (let i = 0; i < NS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
      const mesh = new THREE.Mesh(g, m); mesh.position.set(S_BASE.x, RING_Y, S_BASE.z); mesh.renderOrder = 8; scene.add(mesh);
      ringSegs.push({ mesh, mid, anchor: V3(S_BASE.x + Math.cos(mid) * (ROUT + 0.12), RING_Y, S_BASE.z + Math.sin(mid) * (ROUT + 0.12)) });
    }
  }
  const ringLines = [RIN - 0.04, ROUT + 0.04].map((r) => { const l = progressLine(circlePoints(r, 128, { plane: 'xz', center: V3(S_BASE.x, RING_Y, S_BASE.z) }), { color: GOLD, intensity: 0.9, head: 0.04 }); l.material.fog = false; scene.add(l); return l; });
  // globe orientation: India faces the globe-beat camera at yogaDay, on the sunrise line
  const psi = Math.atan2(KEYS[10][1].x - GLOBE_C.x, KEYS[10][1].z - GLOBE_C.z);
  const spin0 = psi - 108 * D2R;            // the sunrise line starts over East Asia and sweeps west

  // ---------------------------------------------------------------- screen HUD
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  const SQ = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UI = TALL ? 1.9 : SQ ? 1.6 : 1, UC = TALL ? 1.85 : SQ ? 1.45 : 1, UCX = SQ ? 0.85 : 1;
  const PK = Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.15);
  const MH = FILM_ASPECT / OUTPUT_ASPECT;
  const BOT = SQ ? -Math.min(MH * 0.62, 2.2) : -0.8;
  const centerText = (txt, y, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, letterSpacing: 0.2, color: IVORY, intensity: 1.2, ...o, height: (o.height ?? 0.05) * UI }); tp.position.set(o.x ?? 0, y, 0); hud.scene.add(tp); tp.opacity = 0; return tp; };
  const suryaLab = centerText('SURYA NAMASKAR · 12 POSITIONS', BOT, { weight: 500, color: GOLD });
  const suryaSub = centerText('THE SUN SALUTATION', BOT - 0.072 * UI, { height: 0.03, intensity: 0.75 });
  const numLabs = rowPos.map((_, i) => centerText(String(i + 1), 0, { height: 0.034, color: GOLD, intensity: 1.1, letterSpacing: 0 }));
  const mkCall = (label, sub, dx, dy, color = IVORY) => { const c = new Callout(label, { dx: dx * UCX, dy: dy * UC, size: 0.046 * UC, color, sub, intensity: 1.35 }); hud.scene.add(c); c.visible = false; return c; };
  const callPra = mkCall('PRANAYAMA', 'CONTROL OF THE BREATH · YOGA SUTRA 2.49', -0.62, 0.04);
  const callNadi = mkCall('NADI SHODHANA', 'ALTERNATE-NOSTRIL BREATHING', -0.52, 0.2, '#d8eeff');
  // the breath gauge: 4 counts in, 4 held, 8 out
  const gaugeLab = centerText('INHALE 4 · HOLD 4 · EXHALE 8', BOT, { weight: 500, height: 0.042 });
  const CELL_W = 0.052 * UI, CELL_G = 0.012 * UI, cells = [];
  const cellCols = [...Array(16)].map((_, i) => new THREE.Color(i < 4 ? AIR : i < 8 ? '#ffffff' : WARM));
  for (let i = 0; i < 16; i++) {
    const x = (i - 7.5) * (CELL_W + CELL_G) + (i >= 4 ? CELL_G : 0) + (i >= 8 ? CELL_G : 0) - CELL_G;
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W, 0.022 * UI), new THREE.MeshBasicMaterial({ color: new THREE.Color(IVORY).multiplyScalar(0.35), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const fillM = new THREE.Mesh(new THREE.PlaneGeometry(CELL_W, 0.022 * UI), new THREE.MeshBasicMaterial({ color: cellCols[i].clone().multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    frame.position.set(x, BOT - 0.065 * UI, 0); fillM.position.copy(frame.position); fillM.position.z = 0.01;
    hud.scene.add(frame, fillM); cells.push({ frame, fill: fillM });
  }
  const stepY = BOT + 0.15 * UI;
  const nadiSteps = [['IN · LEFT', AIR, -0.42], ['HOLD', '#ffffff', 0], ['OUT · RIGHT', WARM, 0.42]].map(([s, c, x]) => centerText(s, stepY, { height: 0.034, color: c, intensity: 1.0, x: x * UI }));
  const limbTitle = centerText("PATANJALI'S EIGHT LIMBS (ASHTANGA)", stepY + 0.03 * UI, { weight: 500, height: 0.042, color: GOLD });
  const limbLabs = LIMBS.map((s, k) => centerText(s, 0, { height: k === 3 ? 0.048 : 0.036, color: k === 3 ? '#fff0c8' : GOLD, intensity: k === 3 ? 1.6 : 0.95, weight: k === 3 ? 500 : 400, letterSpacing: 0.14 }));
  const dayLab = centerText('INTERNATIONAL DAY OF YOGA · 21 JUNE', stepY, { weight: 500, height: 0.044, color: '#fff0d8' });
  const unescoLab = centerText('UNESCO INTANGIBLE HERITAGE · 2016', BOT, { height: 0.032, intensity: 0.85 });
  const tmp = new THREE.Vector3();
  const toHud = (w, out) => { tmp.copy(w).project(camera); return out.set(tmp.x * A * PK, tmp.y * PK, 0); };
  const placeHud = () => {
    if (callPra.visible) toHud(sWorld(V3(0.07, 0.47, 0.02)), callPra.position);
    if (callNadi.visible) toHud(sWorld(AS.SEAT.nose), callNadi.position);
    numLabs.forEach((l, i) => { if (l.visible) { toHud(rowPos[i], l.position); l.position.y -= 0.06 * UI; } });
    limbLabs.forEach((l, k) => { if (l.visible) { toHud(ringSegs[k].anchor, l.position); const dx = l.position.x - toHud(V3(S_BASE.x, RING_Y, S_BASE.z), tmp).x; l.position.x += Math.sign(dx) * (l.worldWidth * 0.5 - 0.02) * Math.min(1, Math.abs(dx) * 4); } });
  };

  // ---------------------------------------------------------------- per-frame state
  const m4 = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), blended = {};
  const cTopA = new THREE.Color(0.012, 0.018, 0.05), cTopB = new THREE.Color(0.05, 0.08, 0.19);
  const cHorA = new THREE.Color(0.42, 0.17, 0.1), cHorB = new THREE.Color(0.82, 0.36, 0.15);
  const fogA = new THREE.Color(0.32, 0.2, 0.17), fogMist = new THREE.Color(0.1, 0.105, 0.13);
  const col = new THREE.Color();
  const sunV = new THREE.Vector3(), camRight = new THREE.Vector3();

  const api = {
    scene, camera, hud,
    dof: { focus: 2.4, range: 1.2, amount: 0.5 },
    bloom: { strength: 0.75 },
    exposure: 1.0,
    background: 0x020101,
    exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomOut: 2.2 },
    arSubject: (t) => (t < tSur - 0.1 ? { centre: sWorld(V3(0, 0.45, 0)), radius: 0.9 }
      : t < tPra - 0.1 ? { centre: V3(0, 2.0, 1.2), radius: 10.5 }
      : t < tLimb ? { centre: sWorld(V3(0, 0.5, 0)), radius: 0.75 }
      : { centre: GLOBE_C.clone(), radius: 1.35 }),
    explorePosed(cam) { cam.updateMatrixWorld(); placeHud(); },
    update(t, info) {
      const T = info.T;
      const beat = pulse(T, { decay: 8 });

      // -------- camera
      const s = timeWarp(t, SK);
      camCurve.getPoint(sat(s), camPos); lookCurve.getPoint(sat(s), look);
      camPos.x += Math.sin(t * 1.3) * 0.01; camPos.y += Math.sin(t * 1.7 + 1) * 0.007;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.7) * 0.008, 1, 0).normalize();
      camera.lookAt(look);
      const wide = envelope(t, tSun, tPra + 0.1, 0.6, 0.35), close = envelope(t, tPra, tLimb + 0.1, 0.3, 0.4);
      camera.fov = 35 + 3 * wide - 6 * close + 3 * ramp(t, tLimb, DUR);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sky.position.copy(camPos);

      // -------- sun, sky, water, mist
      sunAt(t, sunDir);
      const crest = ramp(t, tSun - 0.12, tSun + 0.25, ease.outCubic), flash = Math.exp(-Math.max(0, t - tSun) * 4.5) * (t > tSun - 0.04 ? 1 : 0);
      const dawn = ramp(t, 0, DUR, ease.outSine);
      skyU.uSunDir.value.copy(sunDir);
      skyU.uTop.value.copy(cTopA).lerp(cTopB, dawn);
      skyU.uHor.value.copy(cHorA).lerp(cHorB, crest * 0.8 + dawn * 0.2);
      skyU.uSunCol.value.setRGB(1.0, 0.5 + 0.12 * dawn, 0.22 + 0.1 * dawn);
      skyU.uSun.value = 1 + flash * 1.0; skyU.uHalo.value = 0.6 + 0.5 * crest + flash * 0.5;
      const mist = ramp(t, tPra - 0.2, tNadi + 0.2) * 0.75 + ramp(t, tLimb, DUR) * 0.15;
      skyU.uMist.value = mist * 0.6; skyU.uTime.value = t;
      scene.fog.color.copy(fogA).lerp(fogMist, mist);
      scene.fog.density = lerp(0.012, 0.075, mist);
      skyU.uMistCol.value.copy(scene.fog.color);
      waterU.uFogCol.value.copy(skyU.uHor.value).multiplyScalar(0.8).lerp(scene.fog.color, mist);
      waterU.uFogD.value = lerp(0.0035, 0.05, mist);
      waterU.uGlitter.value = 0.2 + 0.6 * crest + flash * 0.5;
      const wv = t - tEx; waterU.uWave.value = wv > 0 ? Math.exp(-wv * 2.6) * sat(wv * 8) : 0; waterU.uWaveR.value = 0.9 + Math.max(0, wv) * 3.2;
      bankM.color.setRGB(0.15, 0.1, 0.1).lerp(scene.fog.color, 0.35 + 0.5 * mist);
      bankHaze.color.copy(skyU.uHor.value).multiplyScalar(0.55).lerp(scene.fog.color, mist); bankHaze.k.value = 0.52 + 0.45 * mist;
      waterU.uBankCol.value.setRGB(0.025, 0.05, 0.03).lerp(bankHaze.color, bankHaze.k.value * 0.8); waterU.uBodyK.value = dawn;
      leafSun.dir.copy(sunDir); leafSun.color.copy(skyU.uSunCol.value).multiplyScalar(1.2 + 1.6 * crest);
      farTrees.update(t); ghatTrees.update(t);
      mistU.uTime.value = t; mistU.uCol.value.copy(skyU.uHor.value).multiplyScalar(0.7).lerp(scene.fog.color, mist); mistU.uOp.value = 0.3 + 0.5 * mist;
      key.position.copy(S_BASE).addScaledVector(sunDir, 40); key.position.y = Math.max(key.position.y, 2.5);
      key.target.position.set(0, 0.8, -1);
      key.intensity = (1.6 + 1.8 * crest) * (1 - 0.55 * mist);
      key.color.setRGB(1.0, 0.6 + 0.1 * dawn, 0.36 + 0.1 * dawn);
      hemi.intensity = 0.45 + 0.2 * dawn;
      dust.tick(t, info); dust.u.opacity = 0.35 * (1 - mist);
      for (const d of diyas) {
        d.s.position.set(d.x + d.v * t, 0.06, d.z);
        const k = 0.8 + 0.2 * Math.sin(t * 9 + d.ph) * Math.sin(t * 5.3 + d.ph * 2);
        d.s.material.color.setRGB(1.0, 0.68, 0.32).multiplyScalar(1.3 * k * (1 - 0.4 * mist));
      }
      boats.forEach((b, i) => { b.b.position.x = b.x + t * 0.25 * (i % 2 ? -1 : 1); b.b.position.y = -0.18 + 0.02 * Math.sin(t * 1.2 + i); b.b.rotation.z = 0.02 * Math.sin(t * 0.9 + i * 2); });
      sunV.copy(sunDir).transformDirection(camera.matrixWorldInverse);
      figMatI.userData.U.uSunV.value.copy(sunV); figMatS.userData.U.uSunV.value.copy(sunV);

      // -------- the row
      const rimRow = 1.2 + 1.2 * crest;
      figMatI.userData.U.uRim.value.setRGB(1.0, 0.62, 0.3).multiplyScalar(rimRow * (1 - 0.6 * mist));
      for (const kind of AS.BONES) inst[kind]._n = 0;
      for (let i = 0; i < ROW_N; i++) {
        const ti = rowT(i);
        const on = t > ti - 0.09;
        const k = ramp(t, ti - 0.06, ti + 0.24, ease.inOutCubic);
        AS.blendPose(AS.POSES[i], AS.POSES[i + 1], k, blended);
        const sol = AS.solvePose(blended);
        const glow = on ? (2.4 * Math.exp(-Math.max(0, t - ti) * 4.2) * sat((t - ti + 0.09) / 0.09) + 0.12 + 0.6 * pulse(T, { decay: 10 }) * envelope(t, tSur, tPra, 0.1, 0.2) * 0.3) : 0;
        const solid = on ? ramp(t, ti - 0.02, ti + 0.3) : 0;
        for (const seg of sol.segs) {
          const im = inst[seg.kind], j = im._n++;
          if (on) im.setMatrixAt(j, AS.segMatrix(seg, m4, 1, rowPos[i])); else im.setMatrixAt(j, ZERO);
          im.geometry.attributes.aGlow.setXY(j, glow * (1 - 0.5 * mist), 0.06 + 0.94 * solid);
        }
      }
      for (const kind of AS.BONES) { inst[kind].instanceMatrix.needsUpdate = true; inst[kind].geometry.attributes.aGlow.needsUpdate = true; }
      floorLine.progress = ramp(t, tSur - 0.12, rowT(11) + 0.05, ease.linear); floorLine.opacity = 0.85 * (1 - 0.7 * mist);
      footDots.forEach((d, i) => { const ti = rowT(i); const g = t > ti - 0.05 ? 0.5 + 1.6 * Math.exp(-(t - ti) * 5) : 0; d.material.opacity = 1; d.material.color.setRGB(1.0, 0.72, 0.4).multiplyScalar(g * (1 - 0.7 * mist)); d.visible = g > 0.01; });

      // -------- the seated figure: gold-rimmed silhouette → hologram → light
      const holo = ramp(t, tPra - 0.12, tPra + 0.25), gone = ramp(t, tDay - 0.08, tDay + 0.3, ease.inOutSine);
      const openGlow = 1 - ramp(t, 0, tSur);
      figMatS.userData.U.uRim.value.setRGB(1.0, 0.66, 0.32).multiplyScalar((rimRow + 2.2 * openGlow + 1.2 * flash) * (1 - holo));
      figMatS.userData.U.uGlowSelf.value = 0.18 * openGlow + 0.5 * flash;
      figMatS.opacity = 1 - holo; sSolid.visible = holo < 0.999; figMatS.depthWrite = holo < 0.5;
      const inhale = ramp(t, tPra, tNadi, ease.inOutSine), exh = ramp(t, tEx, tEx + 0.9, ease.inOutSine);
      const full = inhale * (1 - exh);
      const hOp = holo * (1 - gone);
      const flick = 0.94 + 0.06 * Math.sin(t * 43) * Math.sin(t * 11);
      holoBody.uniforms.uOpacity.value = hOp * flick; holoBody.uniforms.uTime.value = t;
      holoBody.uniforms.uScanY.value = S_BASE.y + lerp(-0.1, 1.1, sat((t - tPra + 0.1) / 0.55)); holoBody.uniforms.uFill.value = 0.15 * envelope(t, tEx, tEx + 0.6, 0.05, 0.4);
      sHolo.visible = hOp > 0.002; sDepth.visible = holo > 0.01 && gone < 0.5;
      lungMat.uniforms.uOpacity.value = hOp * 0.95; lungMat.uniforms.uTime.value = t; lungMat.uniforms.uFill.value = full * 0.4 + 0.12 * beat * full;
      lungMat.uniforms.uScanY.value = holoBody.uniforms.uScanY.value;
      lungs.forEach((m) => { m.visible = hOp > 0.002; m.scale.setScalar(1 + 0.075 * full); });
      diaMat.uniforms.uOpacity.value = hOp * 0.8; diaMat.uniforms.uTime.value = t; dia.visible = hOp > 0.002;
      dia.position.y = 0.255 - 0.04 * full; dia.scale.set(1 + 0.04 * full, 1 - 0.3 * full, 1 + 0.04 * full);
      treeLines.progress = ramp(t, tPra + 0.22, tNadi + 0.05, ease.inOutSine);
      treeLines.opacity = hOp; treeLines.intensity = 0.8 + 0.8 * full + 0.4 * beat * full;
      fillPts.tick(t, info); fillPts.u.mix = ramp(t, tPra + 0.3, tNadi + 0.15, ease.inOutSine) * (1 - exh);
      fillPts.u.opacity = hOp * (0.25 + 0.75 * sat(fillPts.u.mix * 3)) * (1 - 0.6 * exh); fillPts.u.noise = 0.002 + 0.003 * full;
      fillPts.visible = fillPts.u.opacity > 0.003;
      // breath in through the left nostril (pranayama → nadi shodhana), out through the right on the release
      const fi = flowIn.material.uniforms, fo = flowOut.material.uniforms;
      fi.uTime.value = t; fi.uViewport.value = info?.height ?? 800; fi.uHead.value = ramp(t, tPra - 0.05, tPra + 0.35, ease.outCubic); fi.uTail.value = ramp(t, tNadi - 0.15, tNadi + 0.12, ease.inCubic);
      fi.uOpacity.value = hOp; flowIn.visible = hOp > 0.01 && fi.uHead.value > 0 && fi.uTail.value < 1;
      fo.uTime.value = t; fo.uViewport.value = info?.height ?? 800; fo.uHead.value = ramp(t, tEx - 0.02, tEx + 0.5, ease.outCubic); fo.uTail.value = ramp(t, tEx + 0.6, tLimb + 0.35, ease.inSine);
      fo.uOpacity.value = hOp; flowOut.visible = hOp > 0.01 && fo.uHead.value > 0 && fo.uTail.value < 1;
      nostrilGlow[0].material.color.set(AIR).multiplyScalar(hOp * (envelope(t, tPra, tNadi + 0.3, 0.1, 0.25) * 1.2 + envelope(t, tNadi, tEx, 0.05, 0.1) * 0.6));
      nostrilGlow[1].material.color.set(WARM).multiplyScalar(hOp * envelope(t, tEx - 0.05, tLimb + 0.2, 0.08, 0.3) * 1.6);
      chestGlow.material.color.setRGB(1.0, 0.72, 0.42).multiplyScalar(0.12 * openGlow + 0.35 * flash + hOp * (0.1 + 0.22 * full) + 0.5 * envelope(t, tEx - 0.02, tEx + 0.5, 0.04, 0.4));
      const we = t - tEx;
      wave.visible = we > 0 && we < 1.4; if (wave.visible) { wave.scale.setScalar(0.25 + we * 2.6); waveMat.uniforms.uOp.value = Math.exp(-we * 4.5) * sat(we * 10) * 0.2; }

      // -------- the eight limbs
      const ringOut = 1 - ramp(t, tDay + 0.05, tDay + 0.35);
      ringSegs.forEach((r, k) => {
        const p = ramp(t, tLimb - 0.02 + k * 0.028, tLimb + 0.1 + k * 0.028, ease.outCubic);
        const hi = k === 3 ? 1 + 1.4 * ramp(t, tLimb + 0.18, tLimb + 0.3) + 0.6 * beat : 0.55;
        r.mesh.material.opacity = p * ringOut; r.mesh.visible = p * ringOut > 0.002;
        r.mesh.material.color.set(k === 3 ? '#ffe0a0' : GOLD).multiplyScalar(hi * 1.4);
        r.mesh.position.y = RING_Y + (k === 3 ? 0.03 * ramp(t, tLimb + 0.18, tLimb + 0.3) : 0);
      });
      ringLines.forEach((l, i) => { l.progress = ramp(t, tLimb - 0.05 + i * 0.05, tLimb + 0.3 + i * 0.05, ease.inOutSine); l.opacity = 0.7 * ringOut; });

      // -------- the globe
      const gIn = ramp(t, tDay - 0.12, tDay + 0.3, ease.outCubic);
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      globeSun.copy(camRight).multiplyScalar(Math.cos(23.44 * D2R)).addScaledVector(V3(0, 1, 0), Math.sin(23.44 * D2R)).normalize();
      spin.rotation.y = spin0 + (t - tDay) * 1.25;
      shellMat.uniforms.uOp.value = gIn; shell.visible = gIn > 0.002; gDepth.visible = gIn > 0.3;
      gpMat.uniforms.uOp.value = ramp(t, tDay + 0.02, tDay + 0.35); gpMat.uniforms.uViewport.value = info?.height ?? 800; gp.visible = gpMat.uniforms.uOp.value > 0.002;
      gratLines.progress = ramp(t, tDay - 0.05, tDay + 0.4); gratLines.opacity = gIn * 0.8;
      morph.tick(t, info); morph.u.mix = ramp(t, tDay - 0.1, tDay + 0.32, ease.inOutCubic);
      morph.u.opacity = envelope(t, tDay - 0.14, tDay + 0.5, 0.06, 0.2); morph.visible = morph.u.opacity > 0.003; morph.u.noise = 0.01;
      globe.scale.setScalar(0.85 + 0.15 * gIn);

      // -------- HUD
      const show = (tp, a, b, out) => { const p = ramp(t, a, b, ease.outCubic); tp.reveal = p; tp.opacity = p > 0 ? out : 0; };
      const sOut = 1 - ramp(t, tPra - 0.25, tPra - 0.05);
      show(suryaLab, tSur + 0.15, tSur + 0.45, sOut);
      show(suryaSub, tSur + 0.25, tSur + 0.55, sOut * 0.9);
      numLabs.forEach((l, i) => { const ti = rowT(i); l.reveal = 1; l.opacity = t > ti ? sat((t - ti) / 0.08) * sOut * 0.9 : 0; });
      const callP = (c, a, b, out) => { const p = ramp(t, a, b, ease.outCubic); c.visible = p > 0 && out > 0; if (c.visible) c.reveal(p, out); };
      callP(callPra, tPra + 0.12, tPra + 0.42, 1 - ramp(t, tLimb - 0.1, tLimb + 0.05));
      callP(callNadi, tNadi + 0.02, tNadi + 0.3, 1 - ramp(t, tEx + 0.35, tEx + 0.5));
      const gOut = 1 - ramp(t, tDay - 0.1, tDay + 0.05);
      show(gaugeLab, tPra + 0.05, tPra + 0.3, gOut);
      const counts = t < tPra ? 0 : t < tNadi ? 4 * (t - tPra) / (tNadi - tPra) : t < tEx ? 4 + 4 * (t - tNadi) / (tEx - tNadi) : 8 + 8 * sat((t - tEx) / (tDay - tEx));
      const gp0 = ramp(t, tPra, tPra + 0.25);
      cells.forEach((c, i) => {
        c.frame.material.opacity = gp0 * gOut * 0.7; c.frame.visible = c.frame.material.opacity > 0.002;
        const f = sat(counts - i);
        c.fill.material.opacity = f * gOut; c.fill.visible = f * gOut > 0.002;
        c.fill.material.color.copy(cellCols[i]).multiplyScalar(1.4 + (f > 0 && f < 1 ? 1.5 : 0));
      });
      const nIn = ramp(t, tNadi + 0.08, tNadi + 0.3), nOut = 1 - ramp(t, tLimb - 0.15, tLimb);
      const act = [envelope(t, tPra, tNadi + 0.05, 0.05, 0.1) + (t > tNadi && t < tEx ? 0.0 : 0), envelope(t, tNadi, tEx + 0.02, 0.05, 0.05), envelope(t, tEx, tLimb + 0.2, 0.05, 0.1)];
      nadiSteps.forEach((l, i) => { l.reveal = 1; l.opacity = nIn * nOut * (0.4 + 0.6 * Math.max(act[i], i === 0 ? 0.5 * ramp(t, tNadi, tNadi + 0.2) * (1 - ramp(t, tNadi + 0.2, tNadi + 0.4)) : 0)); l.intensity = 0.8 + 1.1 * act[i]; });
      const lOut = 1 - ramp(t, tDay, tDay + 0.15);
      show(limbTitle, tLimb + 0.05, tLimb + 0.3, lOut);
      limbLabs.forEach((l, k) => { const p = ramp(t, tLimb + 0.02 + k * 0.028, tLimb + 0.12 + k * 0.028); l.reveal = p; l.opacity = p > 0 ? lOut : 0; });
      show(dayLab, tDay + 0.08, tDay + 0.36, 1);
      show(unescoLab, tDay + 0.16, tDay + 0.42, 0.95);
      placeHud();

      // -------- lens and post
      const focusD = camPos.distanceTo(look);
      api.dof.focus = focusD;
      api.dof.range = lerp(lerp(1.2, 6.0, wide), 0.7, close);
      api.dof.amount = lerp(0.45, 0.6, close) * (1 - 0.6 * wide);
      api.bloom.strength = 0.72 + 0.25 * flash + 0.12 * close + 0.15 * envelope(t, tEx - 0.02, tEx + 0.5, 0.04, 0.4) + 0.1 * gIn;
      api.exposure = 1.0 + 0.1 * flash + 0.06 * envelope(t, tEx, tEx + 0.5, 0.05, 0.4) - 0.1 * close;
    },
  };
  return api;
}
