// THE MOONSHOT · THE AMERICAN CENTURY (38.5 – 43.0 s)
// Technique: planetary & lunar shading + hard-light cinematography. A stylised Apollo stack
// coasts out of Earth orbit along a glowing free-return figure-8; the camera plunges into a
// procedural Moon (3D-Voronoi craters, derivative bump mapping) and lands in a matched
// heightfield world lit by a single hard, low sun (long black shadows, no fill). The LM
// descends through a pure-function dust sheet under an Apollo-Guidance-Computer HUD
// (seven-segment digits counting down, a 1202 alarm); a boot presses a displaced print into
// the regolith; a vertigo dolly-zoom (fov locked to subject distance) makes the Earth loom
// up behind the LM while an American-century ticker builds across the frame; a crash zoom
// through the LM window lands on the DSKY, whose glowing digits dissolve into computing.
// Composed for 1:1 first (subjects and type centred, HUD laid out in the open-matte height).
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, KineticText, FONTS } from '../lib/text.js';
import { progressTube, progressLine, circlePoints, segmentsLine } from '../lib/lines.js';
import { glowSprite } from '../lib/materials.js';
import { BracketFrame } from '../lib/hud.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  V3, earthMesh, moonMesh, makeEnv, apolloMaterials, buildLM, buildCSM, buildFlag, buildDSKY, flagTexture,
  regolithTextures, bootprintTexture, makeTerrainField, terrainGeometry, segAtlas, SegDigits, SEG,
} from './moonshot-assets.js';

const GREEN = '#a8f0bf';
const AMBER = '#ffb766';
const ICE = '#d6e8ff';
const WARM = '#ffe3b8';

export function create(ctx, segment) {
  const cue = (n) => CUES[n] - segment.start;
  const tTL = cue('translunar'), tDesc = cue('lunarDescent'), tLand = cue('moonLanding'), tFoot = cue('footprint'), tRise = cue('earthrise'), tAGC = cue('guidanceComputer');
  const DUR = segment.end - segment.start;
  const tS1 = tDesc;          // space → lunar surface: the camera plunges into the Moon
  const tS2 = tAGC;           // surface → DSKY: the LM window fills the frame
  const R = rng(1969);

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 4000);

  // ================================================================ WORLD S — translunar coast
  const worldS = new THREE.Group(); scene.add(worldS);
  const SUN_S = V3(-1, 0.25, 0.3).normalize();
  const sunS = new THREE.DirectionalLight('#fff8ee', 4.2); sunS.position.copy(SUN_S).multiplyScalar(200); worldS.add(sunS);
  const earthS = earthMesh(10, SUN_S, { segs: 144, city: 0.35 }); worldS.add(earthS);
  earthS.rotation.z = 0.41;
  const MOON_P = V3(22, 3, -52), MOON_R = 3.2;
  const moon = moonMesh(MOON_R, SUN_S); moon.position.copy(MOON_P); moon.rotation.set(0.3, 2.2, 0); worldS.add(moon);
  {
    const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = 1500;
      pos.set([s * Math.cos(a) * r, u * r, s * Math.sin(a) * r], i * 3);
      const b = Math.pow(R(), 3) * 1.5 + 0.06; col.set([b * 0.95, b, b * 1.08], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    worldS.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  }
  // free-return figure-8 in the Earth–Moon plane
  const E1 = MOON_P.clone().normalize(), D = MOON_P.length();
  const E2 = new THREE.Vector3().crossVectors(E1, V3(0, 1, 0)).normalize();
  const E3 = new THREE.Vector3().crossVectors(E2, E1).normalize();
  const TP = (a, b) => E1.clone().multiplyScalar(a).addScaledVector(E2, b).addScaledVector(E3, b * 0.12);
  const trajPts = [[-4, -11.2], [3, -11.4], [9.5, -8.6], [D * 0.5, 0], [D - 6.5, 5.4], [D - 1, 5.0], [D + 3.1, 3.3], [D + 4.6, 0], [D + 3.1, -3.3], [D - 1, -5.0], [D - 6.5, -5.4], [D * 0.5, 0], [13, 8.2], [5, 11.2]].map(([a, b]) => TP(a, b));
  const trajCurve = new THREE.CatmullRomCurve3(trajPts, false, 'centripetal');
  const traj = progressTube(trajCurve, { radius: 0.05, segments: 420, radial: 6, color: '#cfe4ff', intensity: 1.1, tail: 0 });
  worldS.add(traj);
  const trajHead = glowSprite({ color: '#eaf4ff', intensity: 3, scale: 1.6 }); worldS.add(trajHead);
  const parking = progressLine(circlePoints(11.2, 200).map((p) => E1.clone().multiplyScalar(p.x).addScaledVector(E2, p.y).addScaledVector(E3, p.y * 0.12)), { color: '#8fb6ec', headColor: '#ffffff', intensity: 0.7, head: 0.03 });
  worldS.add(parking);
  const lunarOrbit = progressLine(circlePoints(MOON_R * 1.45, 160).map((p) => MOON_P.clone().addScaledVector(E1, p.x).addScaledVector(E2, p.y)), { color: '#8fb6ec', headColor: '#ffffff', intensity: 0.6, head: 0.03 });
  worldS.add(lunarOrbit);
  // Apollo stack: CSM + LM (transposed & docked), camera-relative hero object
  const LUNAR_ENV = makeEnv(ctx.renderer, { ground: [0.22, 0.21, 0.2] });
  const SPACE_ENV = makeEnv(ctx.renderer, { ground: [0.02, 0.025, 0.035], glowDir: V3(-0.4, -0.3, 1), glow: [0.35, 0.55, 1.0] });
  const MAT = apolloMaterials(SPACE_ENV);
  const setHardwareEnv = (env) => { for (const m of Object.values(MAT)) m.envMap = env; };
  const stack = new THREE.Group(); worldS.add(stack);
  const stackInner = new THREE.Group(); stack.add(stackInner);
  const csm = buildCSM(MAT); stackInner.add(csm);
  const lmStack = buildLM(MAT, { folded: true });
  lmStack.rotation.x = -Math.PI / 2;             // LM top (docking tunnel) mates with the CM apex
  lmStack.position.z = 3.7 + 3.45 + 6.2 + 0.15;
  stackInner.add(lmStack);
  stackInner.position.z = -3.5;
  stack.scale.setScalar(0.085);
  const rcs = [0, 1].map(() => { const g = glowSprite({ color: '#ffffff', intensity: 2.2, scale: 6 }); stackInner.add(g); return g; });
  rcs[0].position.set(2.4, 0.3, 1.6); rcs[1].position.set(-2.4, -0.3, 1.6);

  // ================================================================ WORLD L — lunar surface
  const L0 = V3(0, -6000, 0);
  const worldL = new THREE.Group(); worldL.position.copy(L0); scene.add(worldL);
  const SUN_L = V3(1, 0.26, -0.06).normalize();
  const sunL = new THREE.DirectionalLight('#fff4e6', 9);
  sunL.position.copy(L0).addScaledVector(SUN_L, 160); sunL.target.position.copy(L0);
  sunL.castShadow = true;
  sunL.shadow.mapSize.set(2048, 2048);
  Object.assign(sunL.shadow.camera, { left: -70, right: 70, top: 26, bottom: -26, near: 1, far: 1000 });
  sunL.shadow.bias = -0.0004; sunL.shadow.normalBias = 0.04;
  scene.add(sunL, sunL.target);
  const earthshine = new THREE.HemisphereLight('#9fb8e0', '#000000', 0.06); worldL.add(earthshine);

  const { field } = makeTerrainField(21);
  const PRINT = V3(-5.4, 0, 15.6); PRINT.y = field(PRINT.x, PRINT.z);
  const PATCH = 0.9;
  const inPatch = (x, z) => Math.abs(x - PRINT.x) < PATCH / 2 - 0.02 && Math.abs(z - PRINT.z) < PATCH / 2 - 0.02;
  const reg = regolithTextures();
  const terrainMat = new THREE.MeshStandardMaterial({ map: reg.albedo, bumpMap: reg.bump, bumpScale: 1.4, color: '#e2ddd4', roughness: 0.96, metalness: 0, envMapIntensity: 0.02 });
  const terrain = new THREE.Mesh(terrainGeometry(field, { size: 190, segs: 300, k: 1.6, uvScale: 1 / 5, skip: inPatch }), terrainMat);
  terrain.receiveShadow = true; terrain.castShadow = true;
  worldL.add(terrain);
  // footprint patch: dense grid, same material, bootprint displaced in the vertex shader
  const printTex = bootprintTexture();
  const pressU = { value: 0 };
  const patchGeo = new THREE.PlaneGeometry(PATCH, PATCH, 220, 220); patchGeo.rotateX(-Math.PI / 2);
  {
    const p = patchGeo.attributes.position, uv = patchGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + PRINT.x, z = p.getZ(i) + PRINT.z;
      p.setY(i, field(x, z) - PRINT.y);
      uv.setXY(i, x / 5, z / 5);
    }
    patchGeo.computeVertexNormals();
  }
  const patchMat = terrainMat.clone();
  const PRINT_ANG = 0.32;
  patchMat.onBeforeCompile = (sh) => {
    sh.uniforms.uPrint = { value: printTex }; sh.uniforms.uPress = pressU;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uPrint; uniform float uPress;
        float printH(vec2 p){
          float c = cos(${PRINT_ANG.toFixed(3)}), s = sin(${PRINT_ANG.toFixed(3)});
          vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          vec2 q = vec2(r.x / 0.22 + 0.5, -r.y / 0.44 + 0.5);
          if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return 0.0;
          vec4 t = texture2D(uPrint, q);
          return (-t.r * 0.034 + t.g * 0.014) * uPress;
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { float e = 0.003; float h0 = printH(position.xz), hx = printH(position.xz + vec2(e, 0.0)), hz = printH(position.xz + vec2(0.0, e));
          objectNormal = normalize(objectNormal + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e)); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        transformed.y += printH(position.xz);`);
  };
  patchMat.customProgramCacheKey = () => 'moonshot-print';
  const patch = new THREE.Mesh(patchGeo, patchMat); patch.position.copy(PRINT); patch.receiveShadow = true; worldL.add(patch);
  // rocks
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 2);
    const p = rockGeo.attributes.position, v = new THREE.Vector3(), rr = rng(77);
    const bumps = Array.from({ length: 6 }, () => V3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize());
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let k = 1; bumps.forEach((b, j) => { k -= Math.max(0, v.dot(b) - 0.55) * (0.6 + j * 0.05); });
      v.multiplyScalar(k); v.y *= 0.62; p.setXYZ(i, v.x, v.y, v.z);
    }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: '#b2ada5', roughness: 0.9, metalness: 0, bumpMap: reg.bump, bumpScale: 1.5, envMapIntensity: 0.02, flatShading: true });
    const N = 140, rocks = new THREE.InstancedMesh(rockGeo, rockMat, N);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let n = 0, tries = 0;
    while (n < N && tries++ < 4000) {
      const x = (rr() - 0.5) * 120, z = (rr() - 0.5) * 120 + 10, size = 0.06 + Math.pow(rr(), 4) * 0.9;
      if (Math.hypot(x, z) < 5.5) continue;
      if (Math.abs(x - PRINT.x) < 1.4 && Math.abs(z - PRINT.z) < 1.4) continue;
      if (Math.abs(x) < 2.5 && z > 6 && z < 58 && size > 0.2) continue;
      pos.set(x, field(x, z) - size * 0.15, z); e.set(rr() * 0.4, rr() * TAU, rr() * 0.4); q.setFromEuler(e); s.set(size * (0.8 + rr() * 0.5), size, size * (0.8 + rr() * 0.5));
      M4.compose(pos, q, s); rocks.setMatrixAt(n++, M4);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true;
    worldL.add(rocks);
  }
  // lunar module
  const lm = buildLM(MAT); worldL.add(lm);
  const lmd = lm.userData;
  const plume = (() => {
    const g = new THREE.CylinderGeometry(0.75, 3.4, 6, 40, 1, true); g.translate(0, -3, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = -position.y / 6.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uOpacity, uTime; varying float vH; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.5); float a = pow(1.0 - vH, 2.2) * f * uOpacity * (0.85 + 0.15 * sin(uTime * 90.0 + vH * 20.0));
          gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * a * 1.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; return mesh;
  })();
  plume.position.y = lmd.bellY; lm.add(plume);
  const engineGlow = glowSprite({ color: '#ffd9a8', intensity: 3.5, scale: 3.2 }); engineGlow.position.y = lmd.bellY - 0.1; lm.add(engineGlow);
  const engineLight = new THREE.PointLight('#ffd2a0', 0, 30, 2); engineLight.position.y = lmd.bellY - 0.4; lm.add(engineLight);
  // flag
  const flag = buildFlag(MAT, flagTexture());
  const FLAG_P = V3(-3.3, 0, 8.6); flag.position.set(FLAG_P.x, field(FLAG_P.x, FLAG_P.z) - 0.25, FLAG_P.z); flag.rotation.y = 0.75; worldL.add(flag);
  // boot
  const boot = new THREE.Group(); worldL.add(boot);
  {
    const soleShape = new THREE.Shape();
    const W = 0.155, Lh = 0.33;
    soleShape.moveTo(-W * 0.5, 0.03);
    soleShape.bezierCurveTo(-W * 0.55, Lh * 0.62, W * 0.55, Lh * 0.62, W * 0.5, 0.03);
    soleShape.bezierCurveTo(W * 0.45, -Lh * 0.2, W * 0.38, -Lh * 0.3, W * 0.34, -Lh * 0.36);
    soleShape.bezierCurveTo(W * 0.3, -Lh * 0.46, -W * 0.3, -Lh * 0.46, -W * 0.34, -Lh * 0.36);
    soleShape.bezierCurveTo(-W * 0.38, -Lh * 0.3, -W * 0.45, -Lh * 0.2, -W * 0.5, 0.03);
    const soleG = new THREE.ExtrudeGeometry(soleShape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
    soleG.rotateX(-Math.PI / 2);
    const soleM = new THREE.MeshStandardMaterial({ envMap: ctx.env, color: '#4f5860', roughness: 0.7, metalness: 0.05, envMapIntensity: 0.3 });
    const fabric = new THREE.MeshStandardMaterial({ color: '#9a978f', envMap: ctx.env, roughness: 0.92, metalness: 0, bumpMap: MAT.gold.bumpMap, bumpScale: 1.6, envMapIntensity: 0.25 });
    const sole = new THREE.Mesh(soleG, soleM); sole.position.y = 0.008; boot.add(sole);
    for (let i = 0; i < 12; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.012), soleM); bar.position.set(0, 0.0, 0.14 - i * 0.026); bar.scale.x = 1 - Math.abs(i - 4) * 0.05; boot.add(bar); }
    const foot = new THREE.Mesh(new RoundedBoxGeometry(0.165, 0.12, 0.345, 4, 0.05), fabric); foot.position.set(0, 0.105, -0.005); boot.add(foot);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 12, 0, TAU, 0, Math.PI / 2), fabric); toe.scale.set(0.98, 0.9, 0.9); toe.position.set(0, 0.1, -0.11); boot.add(toe);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.26, 24), fabric); ankle.position.set(0, 0.27, 0.06); ankle.rotation.x = -0.15; boot.add(ankle);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.7, 24), fabric); leg.position.set(0, 0.72, 0.1); leg.rotation.x = -0.1; boot.add(leg);
    for (const y of [0.2, 0.36]) { const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 28), MAT.dark); strap.rotation.x = Math.PI / 2 - 0.15; strap.position.set(0, y, 0.06 + (y - 0.2) * 0.1); boot.add(strap); }
    boot.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  // the Earth in the lunar sky
  const earthL = earthMesh(42, SUN_L, { segs: 128, city: 0.15 }); earthL.rotation.z = 0.41; worldL.add(earthL);
  const CAM_E = V3(0.6, 0, 62); CAM_E.y = field(CAM_E.x, CAM_E.z) + 1.9;
  const LOOK_E = V3(-0.25, CAM_E.y + Math.tan(THREE.MathUtils.degToRad(5)) * CAM_E.z, 0);
  const EARTH_D = 820;
  const earthDir = new THREE.Vector3();
  const placeEarth = (el) => {       // elevation (rad) above the camera→LM line, slight azimuth offset
    earthDir.copy(LOOK_E).sub(CAM_E).setY(0).normalize();
    earthDir.applyAxisAngle(V3(0, 1, 0), 0.012);
    earthDir.y = Math.tan(el); earthDir.normalize();
    earthL.position.copy(CAM_E).addScaledVector(earthDir, EARTH_D);
  };
  // dust: flat radial sheets blown out by the descent engine + a touchdown bloom (pure function of t)
  const lmAlt = (t) => { const u = sat((t - (tDesc - 0.15)) / (tLand - tDesc + 0.15)); return 23 * Math.pow(1 - u, 1.85); };
  const lmXZ = (t, out) => { const u = sat((t - (tDesc - 0.15)) / (tLand - tDesc + 0.15)); const k = Math.pow(1 - u, 1.6); return out.set(6.5 * k, 0, -4 * k); };
  const dust = (() => {
    const NS = 9000, NB = 3000, n = NS + NB;
    const aP = new Float32Array(n * 4), aO = new Float32Array(n * 4), tmpv = new THREE.Vector3();
    const tEmit0 = tDesc + 0.22;
    for (let i = 0; i < n; i++) {
      const bloom = i >= NS;
      const t0 = bloom ? tLand + R() * 0.06 : tEmit0 + (tLand - tEmit0) * Math.sqrt(R());
      lmXZ(t0, tmpv);
      const near = bloom ? 1 : 1 - lmAlt(t0) / 14;
      const theta = R() * TAU;
      const v = bloom ? 1.2 + R() * 4.5 : (5 + R() * 16) * (0.55 + 0.45 * near);
      const vy = bloom ? 0.3 + R() * 1.4 : 0.15 + R() * 1.1;
      const r0 = bloom ? 0.6 + R() * 2.4 : 1.2 + R() * 2.5;
      aP.set([theta, v, t0, vy], i * 4);
      aO.set([tmpv.x, tmpv.z, r0, (bloom ? 0.1 + R() * 0.16 : 0.05 + R() * 0.09) * (bloom ? 1 : 0.6 + near * 0.6)], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aP', new THREE.BufferAttribute(aP, 4));
    g.setAttribute('aO', new THREE.BufferAttribute(aO, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uViewport: { value: 800 }, uOpacity: { value: 1 }, uLand: { value: tLand } },
      vertexShader: /* glsl */ `attribute vec4 aP; attribute vec4 aO; uniform float uTime, uViewport, uLand; varying float vA;
        void main(){
          float age = uTime - aP.z;
          if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; return; }
          float r = aO.z + aP.y * age;
          float y = max(0.03, aP.w * age - 0.81 * age * age) + 0.03;
          vec3 p = vec3(aO.x + cos(aP.x) * r, y, aO.y + sin(aP.x) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          bool bloom = aP.z >= uLand - 0.001;
          float fade = bloom ? exp(-age * 1.9) : exp(-age * 2.6);
          vA = fade * smoothstep(0.0, 0.04, age) * (1.0 - smoothstep(12.0, 26.0, r)) * (bloom ? 0.28 : 0.8);
          gl_PointSize = aO.w * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z) * (bloom ? 1.0 + age * 1.5 : 1.0);
        }`,
      fragmentShader: /* glsl */ `uniform float uOpacity; varying float vA;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA * uOpacity; if (a < 0.003) discard;
          gl_FragColor = vec4(vec3(0.93, 0.89, 0.83) * 0.95, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; return pts;
  })();
  worldL.add(dust);

  // ================================================================ WORLD D — the guidance computer
  const D0 = V3(0, 4000, 0);
  const worldD = new THREE.Group(); worldD.position.copy(D0); scene.add(worldD);
  const atlas = segAtlas();
  const dsky = buildDSKY(atlas, MAT); worldD.add(dsky);
  const dsk = dsky.userData;
  {
    // surrounding LM panel: dark anodised plate with toggle switches and round gauges (context, soft in DOF)
    const plateM = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.6, roughness: 0.55, envMapIntensity: 0.5 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 0.1), plateM); plate.position.z = -0.45; worldD.add(plate);
    const swBase = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), swLever = new THREE.CylinderGeometry(0.012, 0.016, 0.16, 8);
    const chrome = new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.2, envMapIntensity: 1 });
    const rr = rng(4);
    for (let i = 0; i < 46; i++) {
      const x = (rr() - 0.5) * 8, y = (rr() - 0.5) * 6;
      if (Math.abs(x) < 1.35 && Math.abs(y) < 1.4) continue;
      const b = new THREE.Mesh(swBase, plateM); b.rotation.x = Math.PI / 2; b.position.set(x, y, -0.38); worldD.add(b);
      const l = new THREE.Mesh(swLever, chrome); l.position.set(x, y + 0.05, -0.32); l.rotation.x = rr() > 0.5 ? 0.6 : -0.6; worldD.add(l);
    }
    for (const [x, y] of [[-2.2, 1.2], [-2.2, -0.4], [2.3, 1.1], [2.3, -0.5], [-3.4, 0.4], [3.5, 0.3]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 10, 48), chrome); ring.position.set(x, y, -0.36); worldD.add(ring);
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshStandardMaterial({ color: '#0d0f11', roughness: 0.3, metalness: 0.2 })); face.position.set(x, y, -0.37); worldD.add(face);
      const needle = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#f2f2e8').multiplyScalar(0.8) })); needle.position.set(x, y + 0.12, -0.355); needle.rotation.z = rr() * 2 - 1; worldD.add(needle);
    }
    const key = new THREE.DirectionalLight('#fff1dd', 1.1); key.position.set(-5, 6, 2.5).add(D0); key.target.position.copy(D0); worldD.add(key); scene.add(key.target);
    const rim = new THREE.DirectionalLight('#bcd6ff', 0.9); rim.position.set(5, 2, -2).add(D0); rim.target.position.copy(D0); worldD.add(rim);
    const glow = new THREE.PointLight('#9ff2b8', 1.2, 3, 2); glow.position.set(0.49, -0.35, 0.45); worldD.add(glow);
  }
  // final landing display: P68 (landing confirmation), V06 N43 → Tranquility Base lat/long/alt
  const setDsky = (T, t) => {
    const d = dsk.digits;
    d.writeNumber(0, 2, 68); d.writeNumber(2, 2, 6); d.writeNumber(4, 2, 43);
    d.writeNumber(6, 6, 67, true); d.writeNumber(12, 6, 2347, true); d.writeNumber(18, 6, Math.max(0, 3 - Math.floor((t - tS2) * 12)), true);
    d.commit();
    dsk.compActy.material.opacity = pulse(T, { div: 2, decay: 3 }) > 0.4 ? 1 : 0.05;
  };

  // ================================================================ HUD (open-matte aware)
  const hud = ctx.makeHUD();
  const HW = FILM_ASPECT, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = Math.sqrt(HH);
  const hudTP = (txt, o, x = 0, y = 0, align = 'center') => {
    const tp = new TextPlane(txt, o);
    tp.position.set(align === 'left' ? x + tp.worldWidth / 2 : align === 'right' ? x - tp.worldWidth / 2 : x, y, 0);
    hud.scene.add(tp); tp.opacity = 0; return tp;
  };
  // translunar
  const tagTitle = new KineticText('THE MOONSHOT', { font: FONTS.display, weight: 400, height: 0.078 * UI, letterSpacing: 0.34, color: '#eef4ff', intensity: 1.1 });
  tagTitle.position.set(0, HH * 0.8, 0); hud.scene.add(tagTitle);
  const tagSub = hudTP('THE AMERICAN CENTURY', { font: FONTS.mono, height: 0.026 * UI, letterSpacing: 0.5, color: ICE, intensity: 0.85 }, 0, HH * 0.8 - 0.085 * UI);
  const tagRule = segmentsLine([[V3(-0.35 * UI, 0, 0), V3(0.35 * UI, 0, 0)]], { color: '#9fc2f0', intensity: 0.7, orderFn: () => 0, stagger: 0 });
  tagRule.position.set(0, HH * 0.8 - 0.05 * UI, 0); hud.scene.add(tagRule);
  const apLabel = hudTP('APOLLO 11 · JULY 1969', { font: FONTS.mono, weight: 500, height: 0.048 * UI, letterSpacing: 0.34, color: '#f2f6ff', intensity: 1.25 }, 0, -HH * 0.74);
  const apSub = hudTP('TRANS-LUNAR COAST · FREE-RETURN TRAJECTORY · 384 400 KM', { font: FONTS.mono, weight: 300, height: 0.022 * UI, letterSpacing: 0.3, color: ICE, intensity: 0.8 }, 0, -HH * 0.74 - 0.075 * UI);
  const apFrame = new BracketFrame(apLabel.worldWidth + 0.12 * UI, 0.2 * UI, { len: 0.05 * UI, color: '#cfe3ff', intensity: 0.9 });
  apFrame.position.set(0, -HH * 0.74 - 0.03 * UI, 0); hud.scene.add(apFrame);
  // descent: DSKY cluster (bottom-left) + site tag (top)
  const siteTag = hudTP('LUNAR MODULE EAGLE · MARE TRANQUILLITATIS', { font: FONTS.mono, height: 0.026 * UI, letterSpacing: 0.4, color: ICE, intensity: 0.9 }, 0, HH * 0.8);
  const dskyHud = new THREE.Group(); hud.scene.add(dskyHud);
  const SQ = OUTPUT_ASPECT < 1.5;
  const DS = 1.1 * Math.pow(UI, 1.25);
  dskyHud.scale.setScalar(DS);
  dskyHud.position.set(-HW + (SQ ? 0.26 : 0.16) * UI, -HH + (SQ ? 0.3 : 0.16) * UI, 0);
  const dLab = (txt, x, y, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, height: 0.022, letterSpacing: 0.16, color: GREEN, intensity: 1.0, ...o }); tp.position.set(x + tp.worldWidth / 2, y, 0.01); dskyHud.add(tp); return tp; };
  const dBox = (x, y, w, h, col, k, op = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), transparent: true, opacity: op, toneMapped: false, depthWrite: false })); m.position.set(x + w / 2, y, 0); dskyHud.add(m); return m; };
  const backing = dBox(-0.05, 0.28, 0.86, 0.72, '#000000', 1, 0.5);
  const hudCells = [];
  const DH = 0.078, DW = 0.052, RX = 0.03;
  [[0.52, 0.46], [0.13, 0.36], [0.52, 0.36]].forEach(([x, y]) => { for (let k = 0; k < 2; k++) hudCells.push({ x: x + k * DW, y, h: DH }); });
  for (let r = 0; r < 3; r++) for (let k = 0; k < 6; k++) hudCells.push({ x: RX + k * DW, y: 0.235 - r * 0.108, h: DH });
  const hudDigits = new SegDigits(hudCells, atlas, { color: GREEN, intensity: 1.35, ghost: 0.07 });
  dskyHud.add(hudDigits);
  const LBL = { height: 0.019, color: '#06140a', blending: THREE.NormalBlending, letterSpacing: 0.08, weight: 500 };
  const labBg = [dBox(0.38, 0.46, 0.1, 0.036, GREEN, 0.55), dBox(0.0, 0.36, 0.1, 0.036, GREEN, 0.55), dBox(0.38, 0.36, 0.1, 0.036, GREEN, 0.55)];
  const labTx = [dLab('PROG', 0.394, 0.46, LBL), dLab('VERB', 0.014, 0.36, LBL), dLab('NOUN', 0.394, 0.36, LBL)];
  const compBox = dBox(0.0, 0.46, 0.1, 0.06, GREEN, 1.3);
  const compTx = dLab('COMP\nACTY', 0.02, 0.46, { ...LBL, height: 0.016, lineHeight: 1.0 });
  const seps = segmentsLine([0.3, 0.19, 0.082].map((y) => [V3(0.0, y, 0), V3(0.72, y, 0)]), { color: GREEN, intensity: 0.45, orderFn: () => 0, stagger: 0 });
  dskyHud.add(seps);
  const regLab = ['ALT · FT', 'ALT RATE · FT/S', 'FWD VEL · FT/S'].map((str, i) => dLab(str, 0.37, 0.235 - i * 0.108, { height: 0.017, intensity: 0.75, letterSpacing: 0.14 }));
  const progLamp = dBox(0.62, 0.575, 0.1, 0.04, AMBER, 1.4);
  const progLampTx = dLab('PROG', 0.637, 0.575, { ...LBL, height: 0.018 });
  const dFrame = new BracketFrame(0.9, 0.76, { len: 0.05, color: '#bfe8cc', intensity: 0.8 }); dFrame.position.set(0.38, 0.28, 0); dskyHud.add(dFrame);
  const dHead = dLab('APOLLO GUIDANCE COMPUTER · DSKY', 0.0, 0.575, { height: 0.017, letterSpacing: 0.22, intensity: 0.75, color: ICE });
  const alarmTx = dLab('PROGRAM ALARM  1202', 0.0, 0.72, { height: 0.03, letterSpacing: 0.2, color: AMBER, intensity: 1.6, weight: 500 });
  const amber = new THREE.Color(AMBER), green = new THREE.Color(GREEN);
  // landing + footprint captions
  const eagle = hudTP('The Eagle has landed.', { font: FONTS.serif, italic: true, weight: 500, height: 0.095 * UI, letterSpacing: 0.02, color: '#f4f1ea', intensity: 1.05 }, 0, -HH * 0.6);
  const eagleSub = hudTP('TRANQUILITY BASE · 20 JULY 1969 · 20:17 UTC', { font: FONTS.mono, height: 0.022 * UI, letterSpacing: 0.36, color: ICE, intensity: 0.75 }, 0, -HH * 0.6 - 0.095 * UI);
  const stepTx = hudTP('ONE SMALL STEP', { font: FONTS.mono, height: 0.034 * UI, letterSpacing: 0.62, color: '#f2f0ea', intensity: 1.05 }, 0, -HH * 0.6);
  // earthrise ticker
  const tickTitle = new KineticText('THE AMERICAN CENTURY', { font: FONTS.display, weight: 400, height: 0.074 * UI, letterSpacing: 0.3, color: '#f3f6fb', intensity: 1.12 });
  tickTitle.position.set(0, HH * 0.76, 0); hud.scene.add(tickTitle);
  const ITEMS = [['1903', 'FLIGHT'], ['1947', 'TRANSISTOR'], ['1969', 'MOON'], ['1969', 'ARPANET'], ['1971', 'MICROPROCESSOR'], ['TODAY', 'AI']];
  const rowW = Math.min(4.3, 3.9 * UI), rowY = -HH * 0.74;
  const colW = rowW / ITEMS.length;
  const ticker = ITEMS.map(([y, n], i) => {
    const x = -rowW / 2 + colW * (i + 0.5);
    const year = hudTP(y, { font: FONTS.sans, weight: 200, height: 0.07 * UI, letterSpacing: 0.06, color: '#f2f6ff', intensity: 1.15 }, x, rowY + 0.035 * UI);
    const name = hudTP(n, { font: FONTS.mono, weight: 400, height: 0.027 * UI, letterSpacing: 0.22, color: ICE, intensity: 0.95 }, x, rowY - 0.05 * UI);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.008 * UI, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(2.2), toneMapped: false, transparent: true }));
    dot.position.set(x, rowY - 0.1 * UI, 0); hud.scene.add(dot);
    return { year, name, dot, x };
  });
  const tickLine = segmentsLine([[V3(-rowW / 2, rowY - 0.1 * UI, 0), V3(rowW / 2, rowY - 0.1 * UI, 0)]], { color: '#a9c8f0', intensity: 0.6, orderFn: () => 0, stagger: 0 });
  hud.scene.add(tickLine);
  const tickSeps = segmentsLine(ITEMS.slice(1).map((_, i) => { const x = -rowW / 2 + colW * (i + 1); return [V3(x, rowY - 0.065 * UI, 0), V3(x, rowY + 0.075 * UI, 0)]; }), { color: '#a9c8f0', intensity: 0.45, orderFn: (a, b, i) => i / ITEMS.length, stagger: 0.8 });
  hud.scene.add(tickSeps);
  const kinetic = (kt, t0, per, opacity, rise = 0.03 * UI) => kt.letters.forEach((l, i) => {
    const p = ease.outCubic(sat((tNow - t0 - i * per) / 0.28));
    l.mesh.opacity = p * opacity; l.mesh.position.set(l.base.x, l.base.y - (1 - p) * rise, 0);
  });
  let tNow = 0;

  // ================================================================ animation state
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const lmP = new THREE.Vector3();
  // S camera: Earth (matching flight's closing frame) → past Earth's limb → plunge into the Moon
  const nM = V3(0.15, 0.2, 0.97).normalize();
  const S_END = MOON_P.clone().addScaledVector(nM, MOON_R * 1.16);
  const S_LOOK_END = MOON_P.clone().addScaledVector(V3(0.02, 0.07, 1).normalize(), MOON_R);
  const sCamCurve = new THREE.CatmullRomCurve3([V3(1.2, 3.6, 40), V3(5.0, 4.0, 33.5), V3(12.5, 4.4, 18), V3(19.5, 4.2, -18), MOON_P.clone().addScaledVector(nM, MOON_R * 2.2), S_END], false, 'centripetal');
  const sCamK = [[0, 0], [0.45, 0.2], [0.72, 0.4], [0.92, 0.6], [1.03, 0.8], [tS1, 1]];
  const sLookCurve = new THREE.CatmullRomCurve3([V3(-0.9, 0.4, 0), V3(2.5, 0.8, -6), V3(15, 2.5, -34), MOON_P.clone(), MOON_P.clone().addScaledVector(nM, MOON_R * 0.6), S_LOOK_END], false, 'centripetal');
  // L camera (descent → landing), Catmull-Rom through keys; then shot-specific moves
  const lCamCurve = new THREE.CatmullRomCurve3([V3(-4, 36, 28), V3(-8.5, 13, 22), V3(-8.6, 4.0, 15.5), V3(-7.4, 2.7, 15.2)], false, 'centripetal');
  const lCamK = [[tS1, 0], [tS1 + 0.45, 0.33], [tLand, 0.67], [tLand + 0.33, 1]];
  const MACRO_A = PRINT.clone().add(V3(-0.26, 0.3, 0.5)), MACRO_B = PRINT.clone().add(V3(-0.2, 0.26, 0.4));
  const PRINT_LOOK = PRINT.clone().add(V3(0, 0.0, -0.04));
  const WIN = lmd.winPos.clone().add(V3(-0.02, -0.02, 0));
  const VERTIGO_W = 2 * PRINT.distanceTo(V3(0, 3.5, 0)) * Math.tan(THREE.MathUtils.degToRad(19));
  const fovFor = (d) => THREE.MathUtils.radToDeg(2 * Math.atan(VERTIGO_W / (2 * d)));
  const LM_C = V3(0, 3.5, 0);
  const FOV_E = fovFor(CAM_E.clone().setZ(CAM_E.z - 2.2).distanceTo(LM_C));

  const api = {
    scene, camera, hud,
    dof: { focus: 5, range: 2, amount: 0 },
    bloom: { strength: 0.7 },
    exposure: 1,
    background: 0x000000,
    update(t, info) {
      tNow = t;
      const T = info.T;
      const inS = t < tS1, inD = t >= tS2, inL = !inS && !inD;
      worldS.visible = inS; worldL.visible = inL; sunL.visible = inL; worldD.visible = inD;
      // r186: scene.environment ignores material.envMapIntensity — hero materials carry an explicit envMap
      scene.environmentIntensity = inS ? 0.5 : inL ? 0.015 : 0.22;
      setHardwareEnv(inS ? SPACE_ENV : LUNAR_ENV);
      if (inS) this._space(t, info); else if (inL) this._moon(t, info); else this._dsky(t, info);
      this._hud(t, T);
    },

    _space(t, info) {
      const u = sat(timeWarp(t, sCamK));
      sCamCurve.getPoint(u, camPos);
      sLookCurve.getPoint(u, look);
      camera.position.copy(camPos); camera.up.set(0, 1, 0); camera.lookAt(look);
      camera.fov = 35 + ramp(t, 0.85, tS1, ease.inQuad) * 12; camera.near = 0.02; camera.far = 4000; camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      earthS.userData.body.rotation.y = 1.2 + t * 0.06;
      earthS.userData.mat.uniforms.uTime.value = t;
      // trajectory draws from the parking orbit out to the Moon
      const tp = ramp(t, tTL - 0.12, 0.98, ease.inOutSine);
      traj.progress = tp; traj.opacity = 0.9;
      trajCurve.getPointAt(Math.max(0.001, tp), trajHead.position);
      trajHead.material.opacity = tp > 0.005 ? 1 : 0;
      parking.progress = ramp(t, 0, 0.5); parking.opacity = 0.55;
      lunarOrbit.progress = ramp(t, 0.55, 1.0); lunarOrbit.opacity = 0.5;
      // the stack rides just ahead of the lens, pointing at the Moon, slow PTC roll
      fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const pass = ramp(t, 0.62, 1.02, ease.inCubic);
      const dist = lerp(3.3, 0.35, pass), side = lerp(-0.3, -1.7, pass), vert = lerp(-0.3, -0.55, pass);
      stack.position.copy(camPos).addScaledVector(fwd, dist).addScaledVector(right, side).addScaledVector(up, vert);
      stack.lookAt(MOON_P);
      stackInner.rotation.z = 0.8 + t * 0.35;
      stack.visible = pass < 0.995;
      rcs[0].material.opacity = envelope(t, 0.52, 0.6, 0.01, 0.06); rcs[1].material.opacity = envelope(t, 0.54, 0.62, 0.01, 0.06);
      // lens
      api.dof.amount = 0;
      api.exposure = 1 + envelope(t, tS1 - 0.12, tS1 + 0.2, 0.12, 0.2, ease.inQuad) * 0.9;
      api.bloom.strength = 0.72;
      void info;
    },

    _moon(t, info) {
      const T = info.T;
      // ---------------- LM descent (pure function of t)
      const alt = lmAlt(t);
      lmXZ(t, lmP); lmP.y = alt - (t > tLand ? 0.05 * envelope(t, tLand, tLand + 0.4, 0.08, 0.3) : 0);
      lm.position.copy(lmP);
      const brake = sat(alt / 23);
      lm.rotation.set(-0.16 * brake, 0, 0.06 * brake);
      const burning = t < tLand ? 1 : 0;
      const flick = 0.9 + 0.1 * Math.sin(T * 83) * Math.sin(T * 37);
      plume.material.uniforms.uOpacity.value = burning * (0.25 + 0.2 * (1 - brake)) * flick;
      plume.material.uniforms.uTime.value = T;
      engineGlow.material.opacity = burning * flick; engineGlow.scale.setScalar(2.6 + (1 - brake) * 1.4);
      engineLight.intensity = burning * (60 + 90 * (1 - brake)) * flick;
      dust.material.uniforms.uTime.value = t; dust.material.uniforms.uViewport.value = info.height;
      dust.material.uniforms.uOpacity.value = 0.8;
      dust.visible = t > tDesc + 0.2;
      // boot presses into the regolith and lifts away
      const down = ramp(t, tFoot - 0.2, tFoot, ease.outCubic), lift = ramp(t, tFoot + 0.1, tFoot + 0.3, ease.inCubic);
      pressU.value = ramp(t, tFoot - 0.02, tFoot + 0.1, ease.outCubic);
      boot.visible = t > tFoot - 0.17 && lift < 1;
      boot.position.set(PRINT.x + (1 - down) * 0.03 - lift * 0.12, PRINT.y + (1 - down) * 0.45 - pressU.value * 0.028 + lift * 0.5, PRINT.z + (1 - down) * 0.1 - lift * 0.32);
      boot.rotation.set(0.3 * (1 - down) - lift * 0.8, PRINT_ANG, 0, 'YXZ');
      // Earth rises behind the LM
      placeEarth(THREE.MathUtils.degToRad(lerp(7.0, 8.5, ramp(t, tFoot, tAGC, ease.linear))));
      earthL.visible = t > tLand + 0.3;
      flag.visible = t > tLand + 0.3;
      earthL.userData.body.rotation.y = 2.1 + t * 0.05;
      earthL.userData.mat.uniforms.uTime.value = t;
      // LM windows glow from the DSKY and cabin lights; flare as we crash-zoom in
      MAT.window.emissiveIntensity = 0.7 + ramp(t, tS2 - 0.35, tS2, ease.inQuad) * 1.8;

      // ---------------- camera
      let fov = 35, dofAmt = 0, dofFocus = 10, dofRange = 3;
      if (t < tFoot - 0.18) {
        lCamCurve.getPoint(sat(timeWarp(t, lCamK)), camPos);
        look.copy(lmP).add(tmp.set(0, 2.4, 0));
        const kL = ramp(t, tS1, tS1 + 0.5, ease.inOutSine);
        tmp.set(0.5, 9, 0); look.lerp(tmp, 1 - kL);
        fov = 35 + (1 - ramp(t, tS1, tS1 + 0.3, ease.outCubic)) * 10;
        // swoop down to the regolith for the footprint
        const sw = ramp(t, tLand + 0.2, tFoot - 0.18, ease.inOutCubic);
        if (sw > 0) { camPos.lerp(MACRO_A, sw); look.lerp(PRINT_LOOK, sw); fov = lerp(fov, 38, sw); }
      } else if (t < tFoot + 0.3) {
        const k = ramp(t, tFoot - 0.18, tFoot + 0.3, ease.linear);
        camPos.copy(MACRO_A).lerp(MACRO_B, k);
        look.copy(PRINT_LOOK);
        fov = 38;
        dofAmt = 0.75; dofFocus = camPos.distanceTo(PRINT_LOOK); dofRange = 0.35;
      } else {
        // vertigo dolly-zoom: pull back & rise while the fov narrows to keep the LM's size locked,
        // then an accelerating (log-fov) zoom through the LM window
        const k = ramp(t, tFoot + 0.3, tRise + 0.08, ease.inOutCubic);
        camPos.copy(MACRO_B).lerp(CAM_E, k);
        const kl = ramp(t, tFoot + 0.3, tRise, ease.inOutSine);
        look.copy(PRINT_LOOK).lerp(LOOK_E, kl);
        fov = Math.min(38, fovFor(camPos.distanceTo(LM_C)));
        const z = ramp(t, tRise + 0.12, tS2, ease.inCubic);
        camPos.z -= z * 12;
        look.lerp(WIN, ramp(t, tRise + 0.3, tS2 - 0.04, ease.inOutCubic));
        fov = fov * Math.pow(0.5 / fov, z);
        dofAmt = 0.75 * (1 - ramp(t, tFoot + 0.3, tFoot + 0.55)); dofFocus = camPos.distanceTo(PRINT_LOOK); dofRange = 0.35 + k * 30;
      }
      camera.position.copy(camPos).add(L0);
      tmp2.copy(look).add(L0);
      camera.up.set(0, 1, 0); camera.lookAt(tmp2);
      camera.fov = fov; camera.near = t < tFoot + 0.4 && t > tFoot - 0.35 ? 0.02 : 0.1; camera.far = 4000; camera.updateProjectionMatrix();
      api.dof.amount = dofAmt; api.dof.focus = dofFocus; api.dof.range = dofRange;
      const inFlash = envelope(t, tS1 - 0.02, tS1 + 0.22, 0.02, 0.2, ease.outQuad);
      api.exposure = 1 + inFlash * 0.9 + ramp(t, tS2 - 0.1, tS2) * 0.15;
      api.bloom.strength = 0.45 + ramp(t, tS2 - 0.15, tS2) * 0.25;
    },

    _dsky(t, info) {
      const T = info.T;
      const k = ramp(t, tS2, DUR, ease.outCubic);
      camPos.set(lerp(-0.55, 0.52, k), lerp(0.1, 0.4, k), lerp(2.3, 0.52, k));
      look.set(lerp(0.3, 0.5, k), lerp(0.42, 0.38, k), 0.05);
      camera.position.copy(camPos).add(D0);
      tmp2.copy(look).add(D0);
      camera.up.set(0, 1, 0); camera.lookAt(tmp2);
      camera.fov = 35; camera.near = 0.02; camera.far = 100; camera.updateProjectionMatrix();
      setDsky(T, t);
      dsk.lampAmber.emissiveIntensity = 0;
      api.dof.amount = 0.55; api.dof.focus = camPos.distanceTo(tmp.set(0.49, 0.38, 0.05)); api.dof.range = 0.25 + (1 - k) * 0.5;
      const flash = 1 - ramp(t, tS2, tS2 + 0.25, ease.outCubic);
      api.exposure = 1 + flash * 0.3;
      api.bloom.strength = 0.85;
    },

    _hud(t, T) {
      // ---------- translunar: chapter tag + mission label
      const tagOn = envelope(t, 0.2, tS1 - 0.02, 0.2, 0.18);
      kinetic(tagTitle, 0.3, 0.035, tagOn);
      tagSub.opacity = tagOn * 0.9; tagSub.reveal = ramp(t, 0.55, 0.9);
      tagRule.progress = ramp(t, 0.4, 0.75); tagRule.opacity = tagOn;
      const apOn = envelope(t, tTL, tS1 - 0.02, 0.1, 0.15);
      apLabel.opacity = apOn; apLabel.reveal = ramp(t, tTL, tTL + 0.35, ease.outCubic);
      apSub.opacity = apOn * 0.85; apSub.reveal = ramp(t, tTL + 0.15, tTL + 0.6, ease.outCubic);
      apFrame.reveal(ramp(t, tTL, tTL + 0.3, ease.outCubic), apOn);
      // ---------- descent: site tag + AGC display
      const siteOn = envelope(t, tS1 + 0.05, tLand + 0.1, 0.15, 0.2);
      siteTag.opacity = siteOn; siteTag.reveal = ramp(t, tS1 + 0.05, tS1 + 0.45);
      const dOn = envelope(t, tS1 + 0.02, tLand + 0.3, 0.12, 0.2);
      dskyHud.visible = dOn > 0.001;
      if (dskyHud.visible) {
        const u = sat((t - tS1) / (tLand - tS1));
        const altFt = Math.max(0, 7200 * Math.pow(1 - u, 2.1));
        const rate = u < 1 ? -Math.max(1, 7200 * 2.1 * Math.pow(1 - u, 1.1) / 60) : 0;
        const vel = Math.max(0, 420 * Math.pow(1 - u, 1.4));
        const alarm = t > tS1 + 0.3 && t < tS1 + 0.56;
        const prog = t > tLand + 0.12 ? 68 : u < 0.45 ? 63 : u < 0.8 ? 64 : 66;
        const d = hudDigits;
        d.writeNumber(0, 2, prog);
        if (alarm) {
          d.writeNumber(2, 2, 5); d.writeNumber(4, 2, 9);
          d.writeNumber(6, 6, 1202, true); d.setDigit(6, SEG.blank);
          for (let i = 12; i < 24; i++) d.setDigit(i, SEG.blank);
        } else {
          d.writeNumber(2, 2, 6); d.writeNumber(4, 2, prog >= 66 ? 60 : 63);
          d.writeNumber(6, 6, altFt, true); d.writeNumber(12, 6, rate, true); d.writeNumber(18, 6, vel * 7.5, true);
        }
        const blink = alarm && Math.floor(T * 10) % 2 === 0;
        for (let i = 0; i < 24; i++) d.setColor(i, i >= 6 && i < 12 && alarm ? amber : green, (blink && i >= 6 && i < 12 ? 0.35 : 1) * (i >= 6 && i < 12 && alarm ? 1.5 : 1.35));
        d.commit();
        d.opacity = dOn;
        labBg.forEach((m) => { m.material.opacity = dOn; }); labTx.forEach((tp) => { tp.opacity = dOn; });
        backing.material.opacity = dOn * 0.45;
        const comp = pulse(T, { div: 2, decay: 5 }) > 0.35 ? 1 : 0.06;
        compBox.material.opacity = dOn * comp; compTx.opacity = dOn * (comp > 0.5 ? 1 : 0.25);
        seps.progress = ramp(t, tS1, tS1 + 0.3); seps.opacity = dOn;
        regLab.forEach((tp, i) => { tp.opacity = dOn * (alarm ? 0.25 : 1); tp.reveal = ramp(t, tS1 + 0.05 + i * 0.05, tS1 + 0.35 + i * 0.05); });
        const lampOn = alarm ? (blink ? 0.35 : 1) : 0.06;
        progLamp.material.opacity = dOn * lampOn; progLampTx.opacity = dOn * (alarm ? 1 : 0.2);
        dFrame.reveal(ramp(t, tS1, tS1 + 0.3), dOn);
        dHead.opacity = dOn; dHead.reveal = ramp(t, tS1 + 0.05, tS1 + 0.4);
        alarmTx.opacity = alarm ? (blink ? 0.5 : 1) * dOn : 0; alarmTx.reveal = ramp(t, tS1 + 0.3, tS1 + 0.38);
      }
      // ---------- landing hush
      const eOn = envelope(t, tLand + 0.15, tFoot + 0.14, 0.2, 0.12);
      eagle.opacity = eOn; eagle.reveal = ramp(t, tLand + 0.15, tLand + 0.5, ease.outCubic);
      eagleSub.opacity = eOn * 0.85; eagleSub.reveal = ramp(t, tLand + 0.25, tLand + 0.6);
      const sOn = envelope(t, tFoot + 0.16, tRise, 0.1, 0.12);
      stepTx.opacity = sOn; stepTx.reveal = ramp(t, tFoot + 0.16, tFoot + 0.42, ease.outCubic);
      // ---------- earthrise ticker (builds left → right on the sixteenths)
      const tkOn = envelope(t, tRise - 0.05, tS2 + 0.2, 0.1, 0.25);
      kinetic(tickTitle, tRise - 0.05, 0.022, tkOn);
      tickLine.progress = ramp(t, tRise, tRise + 0.45, ease.outCubic); tickLine.opacity = tkOn;
      tickSeps.progress = ramp(t, tRise + 0.05, tRise + 0.5); tickSeps.opacity = tkOn;
      ticker.forEach((it, i) => {
        const t0 = tRise + 0.04 + i * 0.07;
        const p = ramp(t, t0, t0 + 0.2, ease.outCubic);
        it.year.opacity = tkOn * sat(p * 3); it.year.reveal = p;
        it.year.position.y = rowY + 0.035 * UI - (1 - p) * 0.02 * UI;
        it.name.opacity = tkOn * sat(p * 3 - 0.5); it.name.reveal = ramp(t, t0 + 0.06, t0 + 0.28);
        it.dot.material.opacity = tkOn * sat(p * 4) * (0.5 + 0.5 * pulse(T - i * 0.0625, { div: 1, decay: 4 }));
        it.dot.visible = p > 0;
      });
    },
  };
  // prime the Earth position for the shader warm-up
  placeEarth(0.06);
  void clamp; void smoothstep; void WARM; void fovFor;
  return api;
}
