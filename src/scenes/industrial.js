// INDUSTRIAL REVOLUTION (24.5–29.0 s)
// Technique: hard-surface 3D + mechanical animation + simulation + sound synchronisation.
// Every impact, flash and stepped motion lands on the 0.5 s beat grid (global T).
//   Shot A  24.5–26.0  macro lens on an involute steel gear, sliding across its teeth inside the mechanism;
//                      the train advances like clockwork, one tick per beat. Ember rim light sweeps on at 25.0.
//   Shot B  26.0–26.5  pull back at speed: one gear becomes hundreds (instanced, correctly meshing trains),
//                      popping in as a radial wave from the hero gear.
//   Shot C  26.5–27.3  cut on the beat to a bank of pistons with real crank / connecting-rod kinematics —
//                      top dead centre is kicked on every beat, with ember flashes and camera shake.
//   Shot D  27.3–27.8  steam erupts from the exhaust valves (billboard smoke shader, back-lit ember rim).
//   Shot E  27.8–28.2  pull back to reveal the machine as flywheel, boiler, rivets and pipes assemble (lock on 28.0).
//   Shot F  28.2–29.0  dive onto the railway beside it: rails and sleepers rush under the lens, telegraph wire
//                      overhead arcs into a white flare at 28.75 for the 'flash' hand-over.
import * as THREE from 'three';
import { CUES, BEAT } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, smootherstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { pulse, beatPhase, beatIndex } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { glowSprite, lightShaft } from '../lib/materials.js';
import { Callout } from '../lib/hud.js';
import { MorphParticles, Dust } from '../lib/particles.js';
import { GLSL_NOISE } from '../lib/noise.js';
import { gearGeometry, meshAngle, steelMat, brassMat, ironMat, surfaceTexture, latheTexture } from './industrial-gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Billboard smoke: every particle's life is a pure function of uTime (birth, drag, buoyancy, curl-ish noise).
function makeSteam(count, emitters, { seed = 5, size = 0.9 } = {}) {
  const r = rng(seed);
  const emit = new Float32Array(count * 3), vel = new Float32Array(count * 3), sd = new Float32Array(count * 4), birth = new Float32Array(count), life = new Float32Array(count);
  let n = 0;
  const totalW = emitters.reduce((s, e) => s + e.weight, 0);
  for (const e of emitters) {
    const k = Math.round((count * e.weight) / totalW);
    for (let i = 0; i < k && n < count; i++, n++) {
      emit.set([e.pos.x + (r() - 0.5) * e.jitter, e.pos.y + (r() - 0.5) * e.jitter, e.pos.z + (r() - 0.5) * e.jitter], n * 3);
      const d = e.dir.clone().add(V((r() - 0.5) * e.spread, (r() - 0.5) * e.spread, (r() - 0.5) * e.spread)).normalize().multiplyScalar(e.speed * (0.6 + r() * 0.8));
      vel.set([d.x, d.y, d.z], n * 3);
      sd.set([r(), r(), r(), r()], n * 4);
      birth[n] = e.birth(r(), i / k);
      life[n] = e.life * (0.7 + r() * 0.6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(emit, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  g.setDrawRange(0, n);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uViewport: { value: 800 }, uSize: { value: size }, uOpacity: { value: 1 },
      uAmb: { value: new THREE.Color('#2a2d31') }, uKey: { value: new THREE.Color('#a0a8b0') }, uRim: { value: new THREE.Color('#ff9a52').multiplyScalar(1.8) },
      uLight: { value: new THREE.Vector2(0.6, 0.8) },
    },
    vertexShader: /* glsl */ `${GLSL_NOISE}
      attribute vec3 aVel; attribute vec4 aSeed; attribute float aBirth; attribute float aLife;
      uniform float uTime, uViewport, uSize; varying float vA; varying vec4 vSeed; varying float vAge;
      void main(){
        float age = uTime - aBirth;
        if (age < 0.0 || age > aLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float k = 2.4;
        vec3 p = position + aVel * (1.0 - exp(-k * age)) / k + vec3(0.0, 0.9 * age * age + 0.3 * age, 0.0);
        p += snoise3(p * 0.45 + aSeed.xyz * 9.0 + vec3(0.0, -uTime * 0.4, 0.0)) * (0.05 + age * 0.7);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float u = age / aLife;
        float s = uSize * mix(0.5, 1.9 + aSeed.w * 0.8, sqrt(u));
        gl_PointSize = min(900.0, s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.2, -mv.z));
        vA = smoothstep(0.0, 0.18, u) * (1.0 - smoothstep(0.35, 1.0, u)) * smoothstep(0.15, 0.9, -mv.z);
        vSeed = aSeed; vAge = u;
      }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform float uOpacity; uniform vec3 uAmb, uKey, uRim; uniform vec2 uLight;
      varying float vA; varying vec4 vSeed; varying float vAge;
      void main(){
        vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
        float r = length(c);
        if (r > 1.0) discard;
        float n = snoise(vec3(c * 1.5 + vSeed.xy * 10.0, vSeed.z * 10.0 + vAge * 1.2)) * 0.5 + 0.5;
        float n2 = snoise(vec3(c * 3.6 + vSeed.yz * 10.0, vAge * 2.0 + vSeed.w * 5.0)) * 0.5 + 0.5;
        float d = smoothstep(1.0, 0.0, r + (n - 0.5) * 0.7 + (n2 - 0.5) * 0.35); d *= d;
        float a = d * vA * uOpacity;
        if (a < 0.003) discard;
        vec3 N = normalize(vec3(c, sqrt(max(0.0, 1.0 - r * r))));
        float rim = pow(1.0 - N.z, 1.4) * max(0.0, dot(normalize(c + 1e-4), normalize(uLight)));
        float front = max(0.0, dot(N, normalize(vec3(-0.4, 0.6, 0.7))));
        vec3 col = uAmb * (0.6 + n) + uKey * front * (0.4 + n2 * 0.6) + uRim * rim * (0.4 + n);
        gl_FragColor = vec4(col, a * 0.5);
      }`,
    transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.tick = (t, info) => { m.uniforms.uTime.value = t; m.uniforms.uViewport.value = info?.height ?? 800; };
  return pts;
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, ctx.aspect, 0.03, 260);
  const cue = (n) => CUES[n] - segment.start;
  const tGear = cue('gear'), tMany = cue('gearsMany'), tPist = cue('pistons'), tSteam = cue('steam'), tMach = cue('machine');
  const tFlash = 28.75 - segment.start;

  scene.environment = ctx.env;
  scene.environmentIntensity = 0.18;
  scene.fog = new THREE.FogExp2(0x070605, 0.016);
  const BG = 0x050403;

  // ---- lights ---------------------------------------------------------------
  const key = new THREE.DirectionalLight('#ffe2c4', 2.0); key.position.set(-6, 10, 8); scene.add(key);
  const rim = new THREE.DirectionalLight('#ff9448', 3.2); rim.position.set(6, 5, -9); scene.add(rim);
  const fill = new THREE.DirectionalLight('#8fb0d0', 0.7); fill.position.set(9, 2, 7); scene.add(fill);
  const side = new THREE.DirectionalLight('#ffd0a0', 0); side.position.set(12, 6, 5); scene.add(side);
  const ember = new THREE.PointLight('#ff7a30', 0, 9, 2); scene.add(ember);

  // ---- materials --------------------------------------------------------------
  const steel = steelMat({ roughness: 0.24, color: '#a9b2bc' });
  const steelPol = steelMat({ roughness: 0.12, color: '#cfd6dd', lathe: false });
  const brass = brassMat({ roughness: 0.26, lathe: true });
  const iron = ironMat();
  const ironDark = ironMat({ color: '#34373b', roughness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: '#2a1d17', metalness: 0.5, roughness: 0.55, roughnessMap: surfaceTexture('cast'), bumpMap: surfaceTexture('cast'), bumpScale: 0.4 });
  const pistonM = steelMat({ roughness: 0.3, color: '#8d959d', lathe: false });
  const forged = new THREE.MeshStandardMaterial({ color: '#6d737a', metalness: 1, roughness: 0.38, roughnessMap: surfaceTexture('cast'), bumpMap: surfaceTexture('cast'), bumpScale: 0.3 });
  const copperM = new THREE.MeshStandardMaterial({ color: '#c77a4a', metalness: 1, roughness: 0.3 });
  const woodM = new THREE.MeshStandardMaterial({ color: '#3b2a1e', metalness: 0, roughness: 0.85, map: surfaceTexture('walnut', 512, 9) });

  // =====================================================================================
  // SET 1 — gear wall with hero gear train
  const WALL = { z0: -5.6, dz: 0.55, x0: -30, x1: 6.5, y0: 0.6, y1: 19 };
  const H = V(-9, 9, WALL.z0 + 0.12);
  const heroZ = 36, heroM = 0.09;
  const hero = { z: heroZ, m: heroM, r: (heroZ * heroM) / 2 };
  const heroGeo = gearGeometry({ teeth: heroZ, module: heroM, thickness: 0.42, bevel: 0.03, bore: 0.22, spokes: 6, curveSegments: 16, flankSteps: 6, bevelSegments: 3 });
  const heroMesh = new THREE.Mesh(heroGeo, steel);
  const heroSpin = new THREE.Group(); heroSpin.position.copy(H); heroSpin.add(heroMesh); scene.add(heroSpin);
  // hub, bolts and keyed shaft
  {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.56, 64), steel); hub.rotation.x = Math.PI / 2; heroSpin.add(hub);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.3, 48), steelMat({ roughness: 0.2, color: '#aeb6bf' })); shaft.rotation.x = Math.PI / 2; heroSpin.add(shaft);
    const key0 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.32), ironDark); key0.position.y = 0.2; heroSpin.add(key0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.26;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 6), steelPol); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(a) * 0.37, Math.sin(a) * 0.37, 0.31); heroSpin.add(b);
    }
  }
  const pinZ = 14, pinDir = -0.52, wheelZ = 24, wheelDir = 2.35;
  const pinGeo = gearGeometry({ teeth: pinZ, module: heroM, thickness: 0.5, bevel: 0.025, bore: 0.12, spokes: 0, curveSegments: 12, flankSteps: 6 });
  const wheelGeo = gearGeometry({ teeth: wheelZ, module: heroM, thickness: 0.3, bevel: 0.022, bore: 0.15, spokes: 5, curveSegments: 12, flankSteps: 5 });
  const pinSpin = new THREE.Group(), wheelSpin = new THREE.Group();
  pinSpin.add(new THREE.Mesh(pinGeo, brass)); wheelSpin.add(new THREE.Mesh(wheelGeo, iron));
  const dPin = ((heroZ + pinZ) * heroM) / 2, dWheel = ((heroZ + wheelZ) * heroM) / 2;
  pinSpin.position.copy(H).add(V(Math.cos(pinDir) * dPin, Math.sin(pinDir) * dPin, 0.05));
  wheelSpin.position.copy(H).add(V(Math.cos(wheelDir) * dWheel, Math.sin(wheelDir) * dWheel, -0.02));
  scene.add(pinSpin, wheelSpin);
  [pinSpin, wheelSpin].forEach((g) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 32), steelPol); s.rotation.x = Math.PI / 2; g.add(s); });

  // procedural gear trains (instanced by tooth-count variant)
  const VARS = [10, 14, 18, 24, 32, 40];
  const WM = 0.12;
  const varGeo = VARS.map((z) => gearGeometry({ teeth: z, module: WM, thickness: 0.26, bevel: 0, bore: WM * 1.4, spokes: z >= 24 ? 5 : 0, curveSegments: 6, flankSteps: 2 }));
  const wall = []; // { x, y, z, s, v (variant), parent, dir, root, omega, layer }
  const R = rng(4242);
  const layerZ = (l) => WALL.z0 - l * WALL.dz;
  const fits = (x, y, ra, layer, skip = -1) => {
    for (let i = 0; i < wall.length; i++) {
      const g = wall[i]; if (g.layer !== layer || i === skip) continue;
      const d = Math.hypot(g.x - x, g.y - y);
      if (d < g.ra + ra + 0.08) return false;
    }
    return true;
  };
  // hero train occupies layer 0
  wall.push({ x: H.x, y: H.y, layer: 0, ra: hero.r + heroM, fixed: true });
  wall.push({ x: pinSpin.position.x, y: pinSpin.position.y, layer: 0, ra: (pinZ * heroM) / 2 + heroM, fixed: true });
  wall.push({ x: wheelSpin.position.x, y: wheelSpin.position.y, layer: 0, ra: (wheelZ * heroM) / 2 + heroM, fixed: true });
  const SCALES = [0.6, 0.8, 1.0, 1.0, 1.25, 1.6];
  for (let layer = 0; layer < 3; layer++) {
    let placed = 0, tries = 0;
    const target = [125, 100, 75][layer];
    while (placed < target && tries < 4000) {
      tries++;
      const s = SCALES[Math.floor(R() * SCALES.length)] * (layer === 2 ? 1.3 : 1);
      const v = Math.floor(R() * VARS.length);
      const ra = ((VARS[v] * WM) / 2 + WM) * s;
      const x = lerp(WALL.x0, WALL.x1, R()), y = lerp(WALL.y0, WALL.y1, R());
      if (!fits(x, y, ra, layer)) continue;
      const root = wall.length;
      wall.push({ x, y, s, v, layer, ra, parent: -1, root, omega: (0.25 + R() * 0.5) * (R() < 0.5 ? -1 : 1) / s, phase: R() * TAU });
      placed++;
      // grow a train from this root
      let tip = root, fails = 0;
      while (fails < 10 && placed < target) {
        const p = wall[fails > 5 ? root + Math.floor(R() * (wall.length - root)) : tip];
        if (p.fixed) { fails++; continue; }
        const cv = Math.floor(R() * VARS.length);
        const dir = R() * TAU;
        const rp = (VARS[p.v] * WM * p.s) / 2, rc = (VARS[cv] * WM * p.s) / 2;
        const cx = p.x + Math.cos(dir) * (rp + rc), cy = p.y + Math.sin(dir) * (rp + rc);
        const cra = rc + WM * p.s;
        if (cx < WALL.x0 || cx > WALL.x1 || cy < WALL.y0 || cy > WALL.y1 || !fits(cx, cy, cra, layer, wall.indexOf(p))) { fails++; continue; }
        wall.push({ x: cx, y: cy, s: p.s, v: cv, layer, ra: cra, parent: wall.indexOf(p), dir, root });
        tip = wall.length - 1; placed++; fails = 0;
        if (R() < 0.15) break;
      }
    }
  }
  const wallGears = wall.filter((g) => !g.fixed);
  const byVar = VARS.map(() => []);
  wallGears.forEach((g) => { g.idx = byVar[g.v].length; byVar[g.v].push(g); g.dist = Math.hypot(g.x - H.x, g.y - H.y); g.angle = 0; });
  const wallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 1, roughness: 0.34, roughnessMap: latheTexture(512, 11), bumpMap: latheTexture(512, 11), bumpScale: 0.3 });
  const tints = [new THREE.Color('#c29a5f'), new THREE.Color('#b9c0c8'), new THREE.Color('#8d949b'), new THREE.Color('#5d6167')];
  const wallMeshes = byVar.map((list, vi) => {
    const im = new THREE.InstancedMesh(varGeo[vi], wallMat, Math.max(1, list.length));
    im.count = list.length;
    list.forEach((g, i) => {
      const c = g.layer === 0 ? tints[R() < 0.35 ? 0 : 1] : g.layer === 1 ? tints[R() < 0.2 ? 0 : 2] : tints[3];
      im.setColorAt(i, c);
    });
    im.frustumCulled = false;
    scene.add(im);
    return im;
  });
  const wallByOrder = wallGears; // parents always precede children
  // back plate with rivet texture
  const backTex = surfaceTexture('cast', 512, 12); backTex.repeat.set(8, 5);
  const backPlate = new THREE.Mesh(new THREE.PlaneGeometry(46, 26), new THREE.MeshStandardMaterial({ color: '#2b2c2e', metalness: 0.8, roughness: 0.6, roughnessMap: backTex, bumpMap: backTex, bumpScale: 1 }));
  backPlate.position.set((WALL.x0 + WALL.x1) / 2, 9.5, layerZ(2) - 0.5); scene.add(backPlate);

  const calloutA = new Callout('INVOLUTE PROFILE · α 20°', { dx: 0.55, dy: 0.32, size: 0.05, color: '#ffd2a8', sub: 'Z 36 · MODULE 9 mm' });
  const calloutB = new Callout('PINION · Z 14 · i 2.57 : 1', { dx: 0.5, dy: -0.28, size: 0.05, color: '#ffd2a8' });
  scene.add(calloutA, calloutB);

  // =====================================================================================
  // SET 2 — steam engine (crank axis along x)
  const YC = 2.3, ZC = 3.0, CR = 0.42, CL = 1.55;
  const PX = [-1.8, -0.6, 0.6, 1.8];
  const PPH = [0, Math.PI, Math.PI, 0];
  const machine = new THREE.Group(); scene.add(machine);
  const crankUnits = [];
  {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 7.6, 32), steelPol); shaft.rotation.z = Math.PI / 2; shaft.position.set(0.9, YC, ZC); machine.add(shaft);
    // bearing pedestals
    [-2.6, -1.2, 0, 1.2, 2.6].forEach((x) => {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.3, YC, 0.7), iron); ped.position.set(x, YC / 2, ZC); machine.add(ped);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.32, 32), steel); cap.rotation.z = Math.PI / 2; cap.position.set(x, YC, ZC); machine.add(cap);
    });
    const webGeo = new THREE.BoxGeometry(0.12, CR + 0.3, 0.34); webGeo.translate(0, CR / 2 - 0.05, 0);
    const cwGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 32, 1, false, Math.PI, Math.PI); cwGeo.rotateZ(Math.PI / 2);
    const pinGeo2 = new THREE.CylinderGeometry(0.1, 0.1, 0.36, 24); pinGeo2.rotateZ(Math.PI / 2);
    const rodGeo = new THREE.BoxGeometry(0.1, CL, 0.16); rodGeo.translate(0, CL / 2, 0);
    const bigEnd = new THREE.CylinderGeometry(0.17, 0.17, 0.14, 32); bigEnd.rotateZ(Math.PI / 2);
    const pistonGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.55, 48); pistonGeo.translate(0, 0.2, 0);
    const ringGeo = new THREE.TorusGeometry(0.332, 0.012, 8, 48); ringGeo.rotateX(Math.PI / 2);
    PX.forEach((x, i) => {
      const crank = new THREE.Group(); crank.position.set(x, YC, ZC); machine.add(crank);
      const w1 = new THREE.Mesh(webGeo, steel); w1.position.x = -0.2; crank.add(w1);
      const w2 = new THREE.Mesh(webGeo, steel); w2.position.x = 0.2; crank.add(w2);
      const c1 = new THREE.Mesh(cwGeo, iron); c1.position.x = -0.2; crank.add(c1);
      const c2 = new THREE.Mesh(cwGeo, iron); c2.position.x = 0.2; crank.add(c2);
      const pin = new THREE.Mesh(pinGeo2, steelPol); pin.position.y = CR; crank.add(pin);
      const rod = new THREE.Group(); machine.add(rod);
      rod.add(new THREE.Mesh(rodGeo, forged));
      const be = new THREE.Mesh(bigEnd, steel); rod.add(be);
      const piston = new THREE.Group(); machine.add(piston);
      piston.add(new THREE.Mesh(pistonGeo, pistonM));
      for (let k = 0; k < 3; k++) { const rg = new THREE.Mesh(ringGeo, iron); rg.position.y = 0.35 + k * 0.07; piston.add(rg); }
      const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 16).rotateZ(Math.PI / 2), steel); piston.add(wrist);
      crankUnits.push({ crank, rod, piston, x, ph: PPH[i] });
    });
    // cylinder block: 4 open-bottom liners + head
    const yTop = YC + CR + CL;
    PX.forEach((x) => {
      const liner = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 48, 1, true), ironDark); liner.position.set(x, yTop + 0.9, ZC); machine.add(liner);
      const linerIn = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 1.3, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#1a1a1a', metalness: 0.8, roughness: 0.5, side: THREE.BackSide })); linerIn.position.copy(liner.position); machine.add(linerIn);
      const fl = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 10, 48).rotateX(Math.PI / 2), steel); fl.position.set(x, yTop + 0.28, ZC); machine.add(fl);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.18, 48), steel); head.position.set(x, yTop + 1.62, ZC); machine.add(head);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 6), steelPol); b.position.set(x + Math.cos(a) * 0.4, yTop + 1.74, ZC + Math.sin(a) * 0.4); machine.add(b); }
      const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 24), brass); valve.position.set(x, yTop + 1.94, ZC); machine.add(valve);
    });
    const chest = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.36, 0.5), paint); chest.position.set(0, yTop + 1.9, ZC - 0.6); machine.add(chest);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 1.2), paint); frame.position.set(0, yTop + 0.18, ZC); machine.add(frame);
    [-2.55, 2.55].forEach((x) => { const col = new THREE.Mesh(new THREE.BoxGeometry(0.24, yTop + 0.1, 0.24), paint); col.position.set(x, (yTop + 0.1) / 2, ZC + 0.5); machine.add(col); const col2 = col.clone(); col2.position.z = ZC - 0.5; machine.add(col2); });
  }
  const yTop = YC + CR + CL;
  // ember glow inside the cylinder heads (beat flashes)
  const emberSprites = PX.map((x) => { const s = glowSprite({ color: '#ff8a3a', intensity: 2.2, scale: 1.1 }); s.position.set(x, yTop + 0.3, ZC + 0.36); scene.add(s); return s; });

  // ---- assembly parts (lock on the beat at 28.0) --------------------------------
  const parts = [];
  const PR = rng(99);
  function addPart(obj, delay, spread = 7) {
    machine.add(obj);
    const dir = V(PR() - 0.5, PR() * 0.8, PR() - 0.9).normalize();
    parts.push({ obj, delay, p1: obj.position.clone(), q1: obj.quaternion.clone(), p0: obj.position.clone().addScaledVector(dir, spread * (0.7 + PR() * 0.6)), q0: new THREE.Quaternion().setFromEuler(new THREE.Euler((PR() - 0.5) * 2, (PR() - 0.5) * 2, (PR() - 0.5) * 2)).multiply(obj.quaternion) });
    return obj;
  }
  // flywheel
  const FW = { x: 4.7, r: 2.9 };
  const fly = new THREE.Group(); fly.position.set(FW.x, YC, ZC);
  {
    const rimShape = new THREE.Shape(); rimShape.absarc(0, 0, FW.r, 0, TAU, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, FW.r - 0.38, 0, TAU, true); rimShape.holes.push(hole);
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 96 });
    rimGeo.translate(0, 0, -0.275); rimGeo.rotateY(Math.PI / 2);
    fly.add(new THREE.Mesh(rimGeo, iron));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(FW.r + 0.045, FW.r + 0.045, 0.2, 128, 1, true), steelPol); band.rotation.z = Math.PI / 2; fly.add(band);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, FW.r - 0.5, 16), iron); sp.position.y = (FW.r - 0.5) / 2 + 0.3; const g = new THREE.Group(); g.rotation.x = (i / 6) * TAU; g.add(sp); fly.add(g);
    }
    const hubF = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.8, 48), steel); hubF.rotation.z = Math.PI / 2; fly.add(hubF);
  }
  addPart(fly, 0.0, 9);
  // boiler with rivets, dome, chimney, firebox
  const BO = { x0: -11.5, x1: -4.2, y: 2.6, z: 2.2, r: 1.75 };
  const boiler = new THREE.Group(); boiler.position.set((BO.x0 + BO.x1) / 2, BO.y, BO.z);
  const boilerLen = BO.x1 - BO.x0;
  {
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(BO.r, BO.r, boilerLen, 96, 1, true), paint); shell.rotation.z = Math.PI / 2; boiler.add(shell);
    [-1, 1].forEach((s) => { const cap = new THREE.Mesh(new THREE.SphereGeometry(BO.r, 64, 24, 0, TAU, 0, Math.PI / 2), paint); cap.scale.y = 0.35; cap.rotation.z = -s * Math.PI / 2; cap.position.x = (s * boilerLen) / 2; boiler.add(cap); });
    for (let i = 0; i <= 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(BO.r + 0.03, BO.r + 0.03, 0.14, 96, 1, true), iron); b.rotation.z = Math.PI / 2; b.position.x = -boilerLen / 2 + (boilerLen * i) / 6; boiler.add(b); }
    const rivG = new THREE.SphereGeometry(0.034, 6, 3, 0, TAU, 0, Math.PI / 2);
    const NRING = 7, NPER = 56;
    const rivets = new THREE.InstancedMesh(rivG, steel, NRING * NPER * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), pos = V(0, 0, 0);
    let ri = 0;
    for (let i = 0; i < NRING; i++) for (let side = -1; side <= 1; side += 2) for (let k = 0; k < NPER; k++) {
      const a = (k / NPER) * TAU, x = -boilerLen / 2 + (boilerLen * i) / 6 + side * 0.1;
      const nrm = V(0, Math.cos(a), Math.sin(a));
      pos.set(x, nrm.y * (BO.r + 0.03), nrm.z * (BO.r + 0.03));
      q.setFromUnitVectors(V(0, 1, 0), nrm);
      m4.compose(pos, q, sc); rivets.setMatrixAt(ri++, m4);
    }
    boiler.add(rivets);
    const dome = new THREE.Group(); dome.position.set(1.2, BO.r - 0.05, 0);
    dome.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.8, 48), brass));
    const dt = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 16, 0, TAU, 0, Math.PI / 2), brass); dt.position.y = 0.4; dome.add(dt);
    boiler.add(dome);
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 7.0, 48, 1, true), ironDark); chim.position.set(-2.6, BO.r + 3.3, 0); boiler.add(chim);
    const chimCap = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 12, 48).rotateX(Math.PI / 2), iron); chimCap.position.set(-2.6, BO.r + 6.8, 0); boiler.add(chimCap);
    const fireDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a20').multiplyScalar(3), toneMapped: false })); fireDoor.position.set(2.2, -0.9, BO.r * 0.92); fireDoor.rotation.x = -0.45; boiler.add(fireDoor);
    boiler.userData.fire = fireDoor;
    // pressure gauge
    const gauge = new THREE.Group(); gauge.position.set(-0.6, 0.55, BO.r + 0.12); boiler.add(gauge);
    gauge.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 48).rotateX(Math.PI / 2), brass));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.26, 48), new THREE.MeshStandardMaterial({ color: '#e8dfc8', roughness: 0.6 })); face.position.z = 0.051; gauge.add(face);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.22, 0.01).translate(0, 0.1, 0), new THREE.MeshStandardMaterial({ color: '#8a1a10' })); needle.position.z = 0.06; gauge.add(needle);
    boiler.userData.needle = needle;
  }
  addPart(boiler, 0.05, 8);
  // steam pipes
  const pipeGrp = new THREE.Group();
  {
    const domeTop = V(boiler.position.x + 1.2, BO.y + BO.r + 0.9, BO.z);
    const curve = new THREE.CatmullRomCurve3([domeTop, domeTop.clone().add(V(0, 1.2, 0)), V(-2.8, yTop + 3.2, ZC - 0.6), V(-1.5, yTop + 2.6, ZC - 0.6), V(-0.2, yTop + 2.1, ZC - 0.6)]);
    pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.16, 20), copperM));
    for (let k = 0; k <= 4; k++) { const p = curve.getPointAt(k / 4), tng = curve.getTangentAt(k / 4); const f = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.07, 24), steel); f.position.copy(p); f.quaternion.setFromUnitVectors(V(0, 1, 0), tng); pipeGrp.add(f); }
    PX.forEach((x, i) => {
      const c = new THREE.CatmullRomCurve3([V(x, yTop + 2.0, ZC), V(x, yTop + 2.8 + i * 0.1, ZC - 0.3), V(x + 0.5, yTop + 3.4 + i * 0.25, ZC - 1.6), V(x + 1.2, 13, ZC - 2.4)]);
      pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(c, 48, 0.09, 12), i % 2 ? copperM : steel));
    });
    const lowPipe = new THREE.CatmullRomCurve3([V(BO.x1 + 0.2, 1.2, BO.z + 0.8), V(-3.4, 0.6, ZC + 1.0), V(-2.6, 0.5, ZC + 1.2), V(3.0, 0.5, ZC + 1.2), V(3.6, 1.4, ZC + 1.2)]);
    pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(lowPipe, 96, 0.12, 16), copperM));
  }
  addPart(pipeGrp, 0.1, 6);
  // floor + light shafts
  const floorTex = surfaceTexture('cast', 512, 3); floorTex.repeat.set(40, 40);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#1c1b1a', metalness: 0.7, roughness: 0.55, roughnessMap: floorTex, bumpMap: floorTex, bumpScale: 1 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const shafts = [];
  for (let i = 0; i < 3; i++) {
    const s = lightShaft({ length: 22, radiusTop: 0.6, radiusBottom: 3.5, color: '#ffc89a', intensity: 0.09 });
    s.position.set(-8 + i * 6.5, 21, -3 + i * 1.5); s.rotation.z = 0.42; s.rotation.x = 0.12; scene.add(s); shafts.push(s);
  }
  const lamps = [];
  for (let i = 0; i < 8; i++) { const l = glowSprite({ color: '#ffb070', intensity: 0.7, scale: 1.2 }); l.position.set(-22 + i * 5.5, 14 + (i % 3) * 1.5, -3.5); scene.add(l); lamps.push(l); }

  // railway along z at x = RX
  const RX = 9.6, GAUGE = 0.72;
  const rail = new THREE.Group(); scene.add(rail);
  {
    const ish = new THREE.Shape([[-0.07, 0], [0.07, 0], [0.07, 0.02], [0.015, 0.035], [0.015, 0.12], [0.04, 0.13], [0.04, 0.17], [-0.04, 0.17], [-0.04, 0.13], [-0.015, 0.12], [-0.015, 0.035], [-0.07, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)));
    const rg = new THREE.ExtrudeGeometry(ish, { depth: 140, bevelEnabled: false, curveSegments: 1 }); rg.translate(0, 0.12, -100);
    [-1, 1].forEach((s) => { const m = new THREE.Mesh(rg, steelMat({ roughness: 0.18, color: '#c5ccd4', lathe: false })); m.position.x = RX + s * GAUGE; rail.add(m); });
    const NS = 210, sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.12, 0.24), woodM, NS);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < NS; i++) { m4.makeTranslation(RX, 0.07, 40 - i * 0.66); sl.setMatrixAt(i, m4); }
    rail.add(sl);
    const ballastTex = surfaceTexture('cast', 512, 17); ballastTex.repeat.set(3, 120);
    const ballast = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 140), new THREE.MeshStandardMaterial({ color: '#3a3632', roughness: 0.95, metalness: 0.1, map: ballastTex, bumpMap: ballastTex, bumpScale: 2 }));
    ballast.rotation.x = -Math.PI / 2; ballast.position.set(RX, 0.012, -30); rail.add(ballast);
    // telegraph poles + wires
    const poleM = woodM;
    const wireTop = [];
    for (let i = 0; i < 16; i++) {
      const z = 30 - i * 7;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 12), poleM); pole.position.set(RX + 2.2, 2.6, z); rail.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), poleM); arm.position.set(RX + 2.2, 4.9, z); rail.add(arm);
      [-0.55, 0.55].forEach((dx) => { const ins = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.16, 12), new THREE.MeshPhysicalMaterial({ color: '#8fb8a8', roughness: 0.1, clearcoat: 1 })); ins.position.set(RX + 2.2 + dx, 5.03, z); rail.add(ins); });
      wireTop.push(z);
    }
    [-0.55, 0.55].forEach((dx) => {
      const pts = [];
      for (let i = 0; i < wireTop.length - 1; i++) for (let k = 0; k < 8; k++) { const u = k / 8, z = lerp(wireTop[i], wireTop[i + 1], u); pts.push(V(RX + 2.2 + dx, 5.1 - Math.sin(u * Math.PI) * 0.35, z)); }
      rail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 600, 0.012, 5), copperM));
    });
  }
  // the hand-over arc: on the near wire, ahead of the dolly
  const ARC = V(RX + 2.2 - 0.55, 5.03, -5);
  const arcGlow = glowSprite({ color: '#e8f2ff', intensity: 3, scale: 2 }); arcGlow.position.copy(ARC); scene.add(arcGlow);
  const arcCore = glowSprite({ color: '#ffffff', intensity: 6, scale: 0.5 }); arcCore.position.copy(ARC); scene.add(arcCore);
  const sparkCount = 900;
  const sparkA = new Float32Array(sparkCount * 3), sparkB = new Float32Array(sparkCount * 3);
  {
    const r = rng(8);
    for (let i = 0; i < sparkCount; i++) {
      sparkA.set([ARC.x, ARC.y, ARC.z], i * 3);
      const d = V(r() - 0.5, r() - 0.3, r() - 0.5).normalize().multiplyScalar(0.5 + r() * 2.5);
      sparkB.set([ARC.x + d.x, ARC.y + d.y - r() * 1.5, ARC.z + d.z], i * 3);
    }
  }
  const sparks = new MorphParticles({ count: sparkCount, positions: sparkA, targets: sparkB, size: 0.035, color: '#ffd9a8', intensity: 4, stagger: 0.5, seed: 12 });
  scene.add(sparks);
  // embers floating in the machine hall
  const embers = new Dust({ count: 450, size: [26, 12, 16], center: [-2, 6, 2], particleSize: 0.022, color: '#ffa860', opacity: 0.7, intensity: 1.6, seed: 33 });
  const hallDust = new Dust({ count: 900, size: [30, 14, 20], center: [-2, 6, 0], particleSize: 0.016, color: '#ffe0c0', opacity: 0.3, intensity: 0.8, seed: 34 });
  scene.add(hallDust);

  // steam
  const beatBirth = (b0, spread) => (u) => b0 + u * spread;
  const emitters = [
    // eruption at the exhaust valves (27.3) then chuffs on 27.5 / 28.0 / 28.5
    ...PX.map((x, i) => ({ pos: V(x, yTop + 2.2, ZC), dir: V(0.35 * (i - 1.5), 1, 0.5), spread: 0.9, speed: 4.2, jitter: 0.2, life: 1.8, weight: 1.4, birth: (u) => tSteam + u * u * 0.6 })),
    { pos: V(-2.7, 3.9, ZC + 0.3), dir: V(-1, 0.15, 0.25), spread: 0.4, speed: 8, jitter: 0.1, life: 1.2, weight: 0.8, birth: (u) => tSteam + u * 0.3 },
    { pos: V(2.7, 3.9, ZC + 0.3), dir: V(1, 0.15, 0.25), spread: 0.4, speed: 8, jitter: 0.1, life: 1.2, weight: 0.8, birth: (u) => tSteam + u * 0.3 },
    ...[0, 1, 2].map((k) => ({ pos: V(-2.4 + k * 2.4, yTop + 2.2, ZC), dir: V(0, 1, 0.3), spread: 0.9, speed: 6, jitter: 0.3, life: 1.4, weight: 0.8, birth: (u) => [3.0, 3.5, 4.0][k] + u * 0.12 })),
    { pos: V(boiler.position.x + 1.2, BO.y + BO.r + 1.0, BO.z), dir: V(0, 1, 0.2), spread: 0.4, speed: 8, jitter: 0.1, life: 1.7, weight: 1.0, birth: (u) => tSteam + 0.2 + u * 1.5 },
    { pos: V(boiler.position.x - 2.6, BO.y + BO.r + 6.9, BO.z), dir: V(0.2, 1, 0), spread: 0.5, speed: 3, jitter: 0.3, life: 2.4, weight: 1.2, birth: (u) => 1.8 + u * 2.7 },
    { pos: V(RX - 1.0, 0.3, -3), dir: V(0.2, 1, 0.3), spread: 1.2, speed: 2, jitter: 1.2, life: 1.6, weight: 0.6, birth: (u) => 3.6 + u * 0.9 },
  ];
  const steam = makeSteam(3200, emitters, { size: 1.15, seed: 17 });
  scene.add(steam);

  // ---- HUD ---------------------------------------------------------------------
  const hud = ctx.makeHUD();
  const hudT = new TextPlane('WATT · STEAM ENGINE · 1769', { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#ffd9b8', intensity: 0.95 });
  const hudS = new TextPlane('120 RPM · 3.4 BAR · 40 HP', { font: FONTS.mono, height: 0.026, letterSpacing: 0.3, color: '#ffd9b8', intensity: 0.7 });
  hudT.position.set(-ctx.aspect + 0.16 + hudT.worldWidth / 2, -0.8, 0);
  hudS.position.set(-ctx.aspect + 0.16 + hudS.worldWidth / 2, -0.87, 0);
  hud.scene.add(hudT, hudS);

  // ---- camera shots ---------------------------------------------------------------
  function makePath(keys) {
    const curve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
    return (t, out) => curve.getPoint(clamp(timeWarp(t, warp), 0, 1), out);
  }
  const Hp = (x, y, z) => H.clone().add(V(x, y, z));
  const camA = makePath([[0, Hp(3.6, -2.4, 3.1)], [0.8, Hp(2.9, 1.9, 3.8)], [1.5, Hp(0.6, 0.8, 5.6)], [2.0, Hp(4.5, 0.2, 17)]]);
  const tgtA = makePath([[0, Hp(1.45, -0.85, 0)], [0.8, Hp(0.95, 0.35, 0)], [1.5, Hp(0.25, 0.1, 0)], [2.0, Hp(4.2, -1.8, 0)]]);
  const camC = makePath([[2.0, V(-2.3, 2.95, 6.3)], [2.8, V(0.9, 3.1, 6.2)], [3.05, V(1.7, 4.2, 8.2)], [3.35, V(3.4, 5.2, 11.0)], [3.85, V(11.5, 7.6, 15.5)], [4.12, V(RX + 0.2, 0.85, 13.5)], [4.5, V(RX + 0.05, 0.5, 3.8)]]);
  const tgtC = makePath([[2.0, V(-0.8, 3.55, 3.0)], [2.8, V(0.8, 3.7, 3.0)], [3.05, V(0.5, 5.9, 3.0)], [3.35, V(0.3, 5.3, 2.5)], [3.85, V(-3.0, 3.2, 1.0)], [4.12, V(RX - 0.4, 1.0, 0)], [4.5, V(RX - 0.15, 1.5, -8)]]);

  // ---- scratch ------------------------------------------------------------------
  const cp = V(0, 0, 0), ct = V(0, 0, 0), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), zAxis = V(0, 0, 1), s3 = V(1, 1, 1), p3 = V(0, 0, 0);
  const dof = { focus: 1.2, range: 0.5, amount: 0.8 };
  const bloom = { strength: 0.6 };
  const out = { scene, camera, hud, dof, bloom, exposure: 1, background: BG, update };

  // clockwork tick: advance one step per beat with an eased, slightly overshooting snap
  const tick = (T, len = 0.22) => { const n = Math.floor(T / BEAT), ph = sat((T - n * BEAT) / len); return n + ease.outBack(ph); };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const shotA = t < tPist;

    // ---------- gears -----------------------------------------------------------
    const heroAng = -tick(T) * (TAU / heroZ) * 1.0 - t * 0.05;
    heroSpin.rotation.z = heroAng;
    pinSpin.rotation.z = meshAngle(heroAng, heroZ, pinZ, pinDir);
    wheelSpin.rotation.z = meshAngle(heroAng, heroZ, wheelZ, wheelDir);
    const kick = tick(T, 0.18);
    const many = t - tMany;
    for (const g of wallByOrder) {
      if (g.parent < 0) g.angle = g.phase + g.omega * (t * 0.6 + kick * 0.35);
      else { const p = wall[g.parent]; g.angle = meshAngle(p.angle, VARS[p.v], VARS[g.v], g.dir); }
    }
    for (let vi = 0; vi < byVar.length; vi++) {
      const im = wallMeshes[vi];
      const list = byVar[vi];
      for (let i = 0; i < list.length; i++) {
        const g = list[i];
        const near = g.dist < 3.4 && g.layer > 0 ? 1 : 0;
        const wave = ease.outBack(sat((many - g.dist * 0.018 - g.layer * 0.05) / 0.28));
        const sc = Math.max(near, wave) * g.s;
        p3.set(g.x, g.y, layerZ(g.layer));
        q4.setFromAxisAngle(zAxis, g.angle);
        s3.set(sc, sc, g.s);
        m4.compose(p3, q4, sc > 0.001 ? s3 : s3.set(0, 0, 0));
        im.setMatrixAt(i, m4);
      }
      im.instanceMatrix.needsUpdate = true;
    }
    const set1 = shotA;
    wallMat.color.setScalar(shotA ? 1 : lerp(0.12, 0.3, smoothstep(3.2, 3.6, t)));
    heroSpin.visible = pinSpin.visible = wheelSpin.visible = true;
    calloutA.position.copy(H).add(V(Math.cos(0.35) * hero.r, Math.sin(0.35) * hero.r, 0.26));
    calloutB.position.copy(pinSpin.position).add(V(0.35, -0.3, 0.3));
    calloutA.reveal(ramp(t, tGear + 0.05, tGear + 0.55), 1 - smoothstep(1.35, 1.6, t));
    calloutB.reveal(ramp(t, tGear + 0.3, tGear + 0.8), 1 - smoothstep(1.35, 1.6, t));
    calloutA.visible = calloutB.visible = set1;

    // ---------- crank / pistons ---------------------------------------------------
    // one revolution per beat; TDC (θ = 0) is kicked on every beat and coasts to the next
    const n = Math.floor(T / BEAT), ph = (T - n * BEAT) / BEAT;
    const theta = TAU * (n + (1 - Math.pow(1 - ph, 1.9)));
    for (const u of crankUnits) {
      const th = theta + u.ph;
      u.crank.rotation.x = th;
      const s = Math.sin(th), c = Math.cos(th);
      const pinY = YC + CR * c, pinZ2 = ZC + CR * s;
      const yp = CR * c + Math.sqrt(CL * CL - CR * CR * s * s);
      u.piston.position.set(u.x, YC + yp, ZC);
      u.rod.position.set(u.x, pinY, pinZ2);
      u.rod.rotation.x = Math.atan2(ZC - pinZ2, YC + yp - pinY);
    }
    fly.rotation.x = theta * 0.25;
    const hit = pulse(T, { decay: 5 });
    emberSprites.forEach((s, i) => { const on = crankUnits[i].ph === 0 ? hit : 0; s.material.opacity = on * ramp(t, tPist - 0.05, tPist) ; s.visible = s.material.opacity > 0.01; s.scale.setScalar(0.6 + on * 0.9); });
    ember.position.set(0, yTop + 0.9, ZC + 0.2);
    ember.intensity = 10 * hit * ramp(t, tPist - 0.05, tPist) + 2 * ramp(t, tPist, tPist + 0.3);
    if (boiler.userData.fire) boiler.userData.fire.material.color.setRGB(1, 0.42, 0.12).multiplyScalar(2.2 + 1.8 * hit);
    boiler.userData.needle.rotation.z = 1.2 - 2.0 * ramp(t, 3.3, 3.6) - 0.15 * hit;

    // ---------- assembly --------------------------------------------------------
    const ta = t - (tMach - 0.2);
    for (const p of parts) {
      const k = ease.outCubic(sat((ta - p.delay) / (0.5 - p.delay)));
      p.obj.position.lerpVectors(p.p0, p.p1, k);
      p.obj.quaternion.slerpQuaternions(p.q0, p.q1, ease.inOutCubic(sat((ta - p.delay) / (0.5 - p.delay))));
      p.obj.visible = ta - p.delay > 0 || t > 4.0;
    }
    const lock = pulse(T, { decay: 4 }) * (Math.abs(T - 28.0) < 0.3 ? 1 : 0) * (T >= 28.0 ? 1 : 0);
    rim.intensity = 3.2 * (0.3 + 0.7 * ramp(t, tGear - 0.2, tGear + 0.3)) * (shotA ? 0.7 : 1) + 4 * lock;
    side.intensity = 1.6 * ramp(t, 3.2, 3.6);
    shafts.forEach((sh) => { sh.visible = t > 3.25; });

    // ---------- steam, sparks, dust ------------------------------------------------
    steam.tick(t, info);
    hallDust.tick(t, info);
    hallDust.u.opacity = 0.3 * ramp(t, tPist - 0.1, tPist);
    const fl = t - tFlash;
    sparks.tick(t, info);
    sparks.u.mix = sat((fl + 0.02) / 0.5);
    sparks.u.opacity = sat((fl + 0.05) / 0.05) * (1 - sat((fl - 0.1) / 0.4));
    sparks.visible = fl > -0.05;
    const fe = Math.exp(-Math.abs(fl) * 9) * (fl > -0.12 ? 1 : 0);
    arcGlow.visible = arcCore.visible = fl > -0.3;
    arcGlow.material.opacity = sat((fl + 0.3) / 0.25);
    arcGlow.scale.setScalar(1.2 + fe * 10);
    arcCore.scale.setScalar(0.4 + fe * 3 + 0.15 * Math.sin(T * 80));

    // ---------- camera --------------------------------------------------------------
    if (shotA) { camA(t, cp); tgtA(t, ct); } else { camC(t, cp); tgtC(t, ct); }
    // machine vibration on each slam
    const shake = (t > tPist && t < 4.0) ? hit * 0.035 : 0;
    cp.x += Math.sin(T * 91) * shake; cp.y += Math.sin(T * 77 + 1) * shake;
    camera.position.copy(cp);
    camera.up.set(shotA ? Math.sin(t * 0.8) * 0.05 : (t > 3.9 ? 0.08 * smoothstep(3.9, 4.3, t) : 0), 1, 0).normalize();
    camera.lookAt(ct);
    camera.fov = shotA ? lerp(26, 34, smoothstep(1.5, 2.0, t)) : t < 3.3 ? 30 : t < 4.0 ? lerp(30, 36, smoothstep(3.3, 3.85, t)) : lerp(36, 58, smoothstep(3.95, 4.5, t));
    camera.updateProjectionMatrix();

    // exposure / DOF per shot
    if (shotA) { dof.focus = cp.distanceTo(ct); dof.range = lerp(0.6, 3, smoothstep(1.5, 2.0, t)); dof.amount = lerp(0.8, 0.35, smoothstep(1.5, 2.0, t)); }
    else if (t < 3.3) { dof.focus = cp.distanceTo(ct); dof.range = 1.4; dof.amount = 0.6; }
    else if (t < 3.95) { dof.focus = cp.distanceTo(ct); dof.range = 5; dof.amount = 0.3; }
    else { dof.focus = 6; dof.range = 3; dof.amount = 0.45; }
    bloom.strength = 0.6 + 0.3 * hit * (t > tPist ? 1 : 0) + fe * 0.6;
    out.exposure = 1.0 + 0.15 * lock;

    // HUD
    const he = envelope(t, 3.35, 4.6, 0.25, 0.3);
    hudT.opacity = he; hudT.reveal = ramp(t, 3.35, 3.8, ease.outCubic);
    hudS.opacity = he * 0.9; hudS.reveal = ramp(t, 3.5, 3.95, ease.outCubic);
  }

  return out;
}
