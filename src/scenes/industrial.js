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
// Volumetric-looking steam: soft gaussian puffs eroded by animated noise (edges fray and thin out as
// they age), lit as a scattering medium — Henyey–Greenstein forward scattering toward a back light
// (bright silver linings where the puff is thin and faces the light), a soft key from above and a cool
// ambient in the dense core. Every particle's life is a pure function of uTime (birth, drag, buoyancy,
// growing turbulence); nothing is simulated per frame.
function makeSteam(count, emitters, { seed = 5, lightPos = new THREE.Vector3(0, 10, -8), keyDir = new THREE.Vector3(-0.4, 0.8, 0.5) } = {}) {
  const r = rng(seed);
  const emit = new Float32Array(count * 3), vel = new Float32Array(count * 3), sd = new Float32Array(count * 4), birth = new Float32Array(count), life = new Float32Array(count), size = new Float32Array(count);
  let n = 0;
  const totalW = emitters.reduce((s, e) => s + e.weight, 0);
  const d = new THREE.Vector3();
  for (const e of emitters) {
    const k = Math.round((count * e.weight) / totalW);
    for (let i = 0; i < k && n < count; i++, n++) {
      emit[n * 3] = e.pos.x + (r() - 0.5) * e.jitter; emit[n * 3 + 1] = e.pos.y + (r() - 0.5) * e.jitter; emit[n * 3 + 2] = e.pos.z + (r() - 0.5) * e.jitter;
      d.copy(e.dir).add(new THREE.Vector3((r() - 0.5) * e.spread, (r() - 0.5) * e.spread, (r() - 0.5) * e.spread)).normalize().multiplyScalar(e.speed * (0.6 + r() * 0.8));
      vel[n * 3] = d.x; vel[n * 3 + 1] = d.y; vel[n * 3 + 2] = d.z;
      sd[n * 4] = r(); sd[n * 4 + 1] = r(); sd[n * 4 + 2] = r(); sd[n * 4 + 3] = r();
      birth[n] = e.birth(r(), i / k);
      life[n] = e.life * (0.7 + r() * 0.6);
      size[n] = (e.size ?? 1) * (0.7 + r() * 0.6);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(emit, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setDrawRange(0, n);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uViewport: { value: 800 }, uOpacity: { value: 1 },
      uAmb: { value: new THREE.Color('#565a60') }, uKey: { value: new THREE.Color('#bdb9b2') }, uBack: { value: new THREE.Color('#ffe2c2').multiplyScalar(3.0) },
      uLightPos: { value: lightPos.clone() }, uKeyW: { value: keyDir.clone().normalize() },
      uFirePos: { value: new THREE.Vector3() }, uFire: { value: new THREE.Color('#ff8a3c') }, uFireI: { value: 0 },
      uNear: { value: new THREE.Vector2(0.35, 1.4) },
    },
    vertexShader: /* glsl */ `${GLSL_NOISE}
      attribute vec3 aVel; attribute vec4 aSeed; attribute float aBirth; attribute float aLife; attribute float aSize;
      uniform float uTime, uViewport, uFireI; uniform vec3 uLightPos, uKeyW, uFirePos; uniform vec2 uNear;
      varying float vA; varying vec4 vSeed; varying float vAge; varying float vPhase; varying vec2 vL2; varying vec3 vKey; varying float vFire; varying vec2 vF2;
      void main(){
        float age = uTime - aBirth;
        if (age < 0.0 || age > aLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float u = age / aLife;
        float k = 2.6;
        vec3 p = position + aVel * (1.0 - exp(-k * age)) / k;
        p.y += 0.28 * age * age + 0.22 * age;                                   // buoyancy
        p += snoise3(p * 0.42 + aSeed.xyz * 9.0 + vec3(0.0, -uTime * 0.45, 0.0)) * (0.03 + age * 0.55);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = aSize * mix(0.14, 2.5 + aSeed.w * 0.9, pow(u, 0.5));
        gl_PointSize = min(1000.0, s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.2, -mv.z));
        // expanding puffs thin out; fade in fast, dissipate slowly; never pop against the lens
        vA = smoothstep(0.0, 0.07, u) * pow(1.0 - u, 1.3) * smoothstep(uNear.x, uNear.y, -mv.z) / (0.6 + 0.8 * u);
        vec3 L = normalize(uLightPos - p), Vv = normalize(cameraPosition - p);
        float g = 0.7, ct = dot(-Vv, L);
        vPhase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * ct, 1.5) * (1.0 - g) * (1.0 - g) / (1.0 + g);
        vec3 lv = (viewMatrix * vec4(L, 0.0)).xyz; vL2 = normalize(lv.xy + vec2(1e-4));
        vKey = normalize((viewMatrix * vec4(uKeyW, 0.0)).xyz);
        vec3 fd = uFirePos - p; float fl = length(fd);
        vFire = uFireI / (1.0 + fl * fl * 0.35);
        vec3 fv = (viewMatrix * vec4(fd / max(fl, 1e-3), 0.0)).xyz; vF2 = normalize(fv.xy + vec2(1e-4));
        vSeed = aSeed; vAge = u;
      }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform float uOpacity; uniform vec3 uAmb, uKey, uBack, uFire;
      varying float vA; varying vec4 vSeed; varying float vAge; varying float vPhase; varying vec2 vL2; varying vec3 vKey; varying float vFire; varying vec2 vF2;
      void main(){
        vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
        float r2 = dot(c, c);
        if (r2 > 1.0) discard;
        float a = vSeed.w * 6.283 + vAge * 0.9;
        vec2 cr = mat2(cos(a), -sin(a), sin(a), cos(a)) * c;
        vec3 q = vec3(cr * 0.8 + vSeed.xy * 10.0, vSeed.z * 10.0 + vAge * 0.7);
        float n1 = snoise(q);
        float n2 = snoise(q * 2.3 + vec3(n1 * 0.6, -n1 * 0.4, vAge));
        float n3 = snoise(q * 5.1 + vec3(n2 * 0.5, 0.0, vAge * 2.0));
        float f = clamp(0.5 + 0.5 * (n1 * 0.62 + n2 * 0.28 + n3 * 0.1), 0.0, 1.0);
        // billows: gaussian body eroded by the noise; erosion grows with age so edges fray into wisps
        float body = exp(-r2 * 2.4);
        float dens = smoothstep(0.0, 1.1, body * (0.3 + 1.2 * f) - (0.1 + 0.5 * vAge) * (1.0 - f) - 0.04);
        float alpha = dens * vA * uOpacity * 0.42;
        if (alpha < 0.003) discard;
        vec3 N = normalize(vec3(c, sqrt(max(0.0, 1.0 - r2))));
        float limb = max(0.0, dot(normalize(c + 1e-4), vL2)) * sqrt(r2);
        float thin = 1.0 - smoothstep(0.05, 0.7, dens);
        float self = mix(0.55, 1.0, f);                                  // crude self-shadowing in the folds
        vec3 col = (uAmb * (0.5 + 0.6 * f) + uKey * (0.25 + 0.75 * max(0.0, dot(N, vKey)))) * self
                 + uBack * vPhase * (0.2 + 1.2 * thin + 0.8 * limb)
                 + uFire * vFire * (0.35 + 0.9 * max(0.0, dot(normalize(c + 1e-4), vF2)) * sqrt(r2)) * (0.6 + 0.4 * thin);
        gl_FragColor = vec4(col, alpha);
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
  const ember = new THREE.PointLight('#ff7a30', 0, 16, 2); scene.add(ember);

  // ---- materials --------------------------------------------------------------
  const steel = steelMat({ roughness: 0.24, color: '#a9b2bc' });
  const steelPol = steelMat({ roughness: 0.12, color: '#cfd6dd', lathe: false });
  const brass = brassMat({ roughness: 0.34, lathe: true });   // broader highlights: the macro DOF turned tight ones into blown orange bokeh
  const iron = ironMat();
  const ironDark = ironMat({ color: '#34373b', roughness: 0.7 });
  const paint = new THREE.MeshStandardMaterial({ color: '#2a1d17', metalness: 0.5, roughness: 0.55, roughnessMap: surfaceTexture('cast'), bumpMap: surfaceTexture('cast'), bumpScale: 0.4 });
  const pistonM = steelMat({ roughness: 0.3, color: '#8d959d', lathe: false });
  const forged = new THREE.MeshStandardMaterial({ color: '#6d737a', metalness: 1, roughness: 0.38, roughnessMap: surfaceTexture('cast'), bumpMap: surfaceTexture('cast'), bumpScale: 0.3 });
  const copperM = new THREE.MeshStandardMaterial({ color: '#c77a4a', metalness: 1, roughness: 0.3 });

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
  const varGeo = VARS.map((z) => gearGeometry({ teeth: z, module: WM, thickness: 0.26, bevel: 0.012, bevelSegments: 1, bore: WM * 1.4, spokes: z >= 24 ? 5 : 0, curveSegments: 8, flankSteps: 3 }));
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
  // (the plate stops just past the gear wall: the railway beside the hall runs out under open sky —
  // a full-width plate would stand across the track as a flat grey wall that clips the trackside steam)
  const BP_X0 = WALL.x0 - 4.75, BP_X1 = WALL.x1 + 0.9;
  const backPlate = new THREE.Mesh(new THREE.PlaneGeometry(BP_X1 - BP_X0, 26), new THREE.MeshStandardMaterial({ color: '#2b2c2e', metalness: 0.8, roughness: 0.6, roughnessMap: backTex, bumpMap: backTex, bumpScale: 1 }));
  backPlate.position.set((BP_X0 + BP_X1) / 2, 9.5, layerZ(2) - 0.5); scene.add(backPlate);

  const calloutA = new Callout('INVOLUTE PROFILE · α 20°', { dx: 0.55, dy: 0.32, size: 0.05, color: '#ffd2a8', sub: 'Z 36 · MODULE 9 mm' });
  const calloutB = new Callout('PINION · Z 14 · i 2.57 : 1', { dx: 0.5, dy: -0.28, size: 0.05, color: '#ffd2a8' });
  scene.add(calloutA, calloutB);

  // =====================================================================================
  // SET 2 — twin horizontal mill engine: two cylinders drive cranks 90° apart on one shaft, a rope-grooved
  // flywheel turning in its pit between them, a flyball governor, and a Lancashire boiler front with
  // glowing furnace doors, gauges and brass fittings. Crank axis along z; strokes along x.
  const YC = 2.0, ZC = 3.0, XC = 0, CR = 0.55, CL = 2.25, ROD = 1.5;
  const ENG = [{ z: ZC + 1.4, ph: 0, near: true }, { z: ZC - 1.4, ph: Math.PI / 2, near: false }];
  const machine = new THREE.Group(); scene.add(machine);
  // (set-2 polish is kept a touch broader than set 1's: tight highlights on small parts bloom into glare)
  const oiled = new THREE.MeshPhysicalMaterial({ color: '#c6cdd4', metalness: 1, roughness: 0.24, clearcoat: 0.45, clearcoatRoughness: 0.32, roughnessMap: latheTexture(512, 7) });
  const steelPol2 = steelMat({ roughness: 0.26, color: '#c4cbd2', lathe: false });
  const maroon = new THREE.MeshStandardMaterial({ color: '#3b1712', metalness: 0.25, roughness: 0.55, bumpMap: surfaceTexture('cast'), bumpScale: 0.12 });
  const brassPol = brassMat({ roughness: 0.3, color: '#c9a060' });
  const lagging = new THREE.MeshStandardMaterial({ color: '#4a2e1d', metalness: 0.1, roughness: 0.6, map: surfaceTexture('walnut', 512, 21), bumpMap: surfaceTexture('walnut', 512, 21), bumpScale: 0.3 });
  const boreMat = new THREE.MeshStandardMaterial({ color: '#8f969d', metalness: 1, roughness: 0.28, side: THREE.BackSide });
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const alongX = (g) => g.rotateZ(Math.PI / 2);
  const alongZ = (g) => g.rotateX(Math.PI / 2);
  const engines = [];
  const CYL = { x0: -5.15, x1: -2.95, r: 0.66 };
  for (const e of ENG) {
    const u = { e, parts: {} };
    const g = new THREE.Group(); g.position.z = e.z; machine.add(g);
    // cast bed (girder with top flange) from cylinder to main bearing
    add(g, new THREE.BoxGeometry(6.3, 1.05, 0.62), maroon, -2.2, 0.53, 0);
    add(g, new THREE.BoxGeometry(6.4, 0.1, 0.95), maroon, -2.2, 1.1, 0);
    add(g, new THREE.BoxGeometry(6.44, 0.03, 0.97), brassPol, -2.2, 1.16, 0);            // brass lining
    // cylinder pedestal + lagged cylinder with brass bands and polished covers
    add(g, new THREE.BoxGeometry(1.9, YC - 1.15, 0.8), maroon, (CYL.x0 + CYL.x1) / 2, 1.15 + (YC - 1.15) / 2 - 0.05, 0);
    const len = CYL.x1 - CYL.x0, cx = (CYL.x0 + CYL.x1) / 2;
    if (e.near) {
      // cut-away: a window in the lagging and bore lets us watch the piston work
      const gap = 0.62, mid = 0.42;
      add(g, alongX(new THREE.CylinderGeometry(CYL.r, CYL.r, len, 64, 1, true, mid + gap, TAU - 2 * gap)), lagging, cx, YC, 0);
      add(g, alongX(new THREE.CylinderGeometry(0.5, 0.5, len, 64, 1, true, mid + gap, TAU - 2 * gap)), boreMat, cx, YC, 0);
      for (const s of [-1, 1]) {
        const a = mid + s * gap;
        const face = add(g, new THREE.BoxGeometry(len, CYL.r - 0.5, 0.012), oiled, cx, YC + Math.sin(a) * 0.58, Math.cos(a) * 0.58);
        face.rotation.x = -a + Math.PI / 2;
      }
      // warm interior glow (steam admission flashes on each stroke)
      u.inner = new THREE.PointLight('#ffb070', 0, 2.2, 2); u.inner.position.set(cx, YC + 0.1, 0.25); g.add(u.inner);
    } else {
      add(g, alongX(new THREE.CylinderGeometry(CYL.r, CYL.r, len, 64)), lagging, cx, YC, 0);
    }
    for (const bx of [CYL.x0 + 0.3, cx, CYL.x1 - 0.3]) {
      add(g, alongX(new THREE.CylinderGeometry(CYL.r + 0.012, CYL.r + 0.012, 0.07, 64, 1, true, e.near ? 0.42 + 0.62 : 0, e.near ? TAU - 1.24 : TAU)), brassPol, bx, YC, 0);
    }
    for (const [x, s] of [[CYL.x0, -1], [CYL.x1, 1]]) {
      add(g, alongX(new THREE.CylinderGeometry(0.74, 0.74, 0.12, 64)), steelPol2, x + s * 0.02, YC, 0);
      add(g, alongX(new THREE.CylinderGeometry(0.5, 0.56, 0.1, 48)), steel, x + s * 0.12, YC, 0);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; add(g, alongX(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 6)), brassPol, x + s * 0.09, YC + Math.sin(a) * 0.66, Math.cos(a) * 0.66); }
    }
    // stuffing gland (brass) where the piston rod leaves the front cover
    add(g, alongX(new THREE.CylinderGeometry(0.15, 0.19, 0.22, 32)), brassPol, CYL.x1 + 0.25, YC, 0);
    // Corliss steam chest on top: valve bonnets, wrist plate, oil cups
    add(g, new THREE.BoxGeometry(len - 0.2, 0.36, 0.7), maroon, cx, YC + CYL.r + 0.16, 0);
    for (const bx of [CYL.x0 + 0.25, CYL.x1 - 0.25]) {
      add(g, alongZ(new THREE.CylinderGeometry(0.16, 0.16, 0.86, 32)), steelPol2, bx, YC + CYL.r + 0.12, 0);
      add(g, alongZ(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 16)), brassPol, bx, YC + CYL.r + 0.12, 0);
      add(g, new THREE.CylinderGeometry(0.05, 0.07, 0.14, 16), brassPol, bx, YC + CYL.r + 0.42, 0);        // oil cup
    }
    const wrist = new THREE.Group(); wrist.position.set(cx, YC + 0.05, 0.72); g.add(wrist);
    add(wrist, alongZ(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32)), steelPol2);
    for (const a of [0.5, 2.6]) { const arm = add(wrist, new THREE.BoxGeometry(0.42, 0.04, 0.03), oiled, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.03); arm.rotation.z = a; }
    u.wrist = wrist;
    // guide bars (upper / lower) on their chairs
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(2.2, 0.08, 0.34), oiled, -1.95, YC + s * 0.24, 0);
    add(g, new THREE.BoxGeometry(2.2, YC - 0.3 - 1.15, 0.12), maroon, -1.95, 1.15 + (YC - 0.3 - 1.15) / 2, 0);
    // main bearing pedestal with brass cap and oil cup
    add(g, new THREE.BoxGeometry(0.8, YC - 1.15 + 0.15, 0.55), maroon, XC, 1.15 + (YC - 1.15) / 2, e.z > ZC ? -0.62 : 0.62);
    add(g, alongZ(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 32)), brassPol, XC, YC, e.z > ZC ? -0.62 : 0.62);
    add(g, new THREE.CylinderGeometry(0.05, 0.08, 0.2, 16), brassPol, XC, YC + 0.38, e.z > ZC ? -0.62 : 0.62);
    // moving parts ---------------------------------------------------------------
    const piston = new THREE.Group(); g.add(piston);
    add(piston, alongX(new THREE.CylinderGeometry(0.49, 0.49, 0.3, 48)), oiled);
    for (let k = -1; k <= 1; k++) add(piston, new THREE.TorusGeometry(0.492, 0.014, 8, 48).rotateY(Math.PI / 2), iron, k * 0.08, 0, 0);
    add(piston, alongX(new THREE.CylinderGeometry(0.065, 0.065, ROD + 0.2, 20)), oiled, (ROD + 0.2) / 2, 0, 0);
    const cross = new THREE.Group(); g.add(cross);
    add(cross, new THREE.BoxGeometry(0.42, 0.3, 0.3), oiled);
    add(cross, new THREE.BoxGeometry(0.46, 0.06, 0.36), brassPol, 0, 0.17, 0);
    add(cross, new THREE.BoxGeometry(0.46, 0.06, 0.36), brassPol, 0, -0.17, 0);
    add(cross, alongZ(new THREE.CylinderGeometry(0.07, 0.07, 0.44, 16)), steelPol2);
    const rod = new THREE.Group(); g.add(rod);                                        // local +x from crosshead pin to crank pin
    const shank = add(rod, alongX(new THREE.CylinderGeometry(0.1, 0.075, CL - 0.5, 24)), oiled, CL / 2, 0, 0);
    shank.scale.set(1, 1.35, 0.8);
    add(rod, new THREE.BoxGeometry(0.34, 0.26, 0.2), oiled, 0.05, 0, 0);
    add(rod, new THREE.BoxGeometry(0.42, 0.4, 0.22), oiled, CL - 0.02, 0, 0);
    add(rod, new THREE.BoxGeometry(0.1, 0.44, 0.24), brassPol, CL - 0.02, 0, 0);
    const crank = new THREE.Group(); crank.position.set(XC, YC, 0); g.add(crank);
    const discZ = e.z > ZC ? -0.3 : 0.3;
    const discShape = new THREE.Shape(); discShape.absarc(0, 0, 0.82, 0, TAU, false);
    const discGeo = new THREE.ExtrudeGeometry(discShape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 64 }); discGeo.translate(0, 0, -0.08);
    add(crank, discGeo, forged, 0, 0, discZ);
    add(crank, new THREE.CylinderGeometry(0.8, 0.8, 0.2, 48, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2), iron, 0, 0, discZ);   // counterweight, opposite the pin
    add(crank, alongZ(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 24)), steelPol2, CR, 0, discZ / 2);
    add(crank, alongZ(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 24)), forged, 0, 0, discZ * 1.6);
    u.parts = { piston, cross, rod, crank, g };
    engines.push(u);
  }
  // crankshaft + flywheel (rope-grooved rim, eight spokes, keyed hub), turning in a floor pit
  const FW = { r: 2.35, w: 0.62 };
  const fly = new THREE.Group(); fly.position.set(XC, YC, ZC); machine.add(fly);
  add(machine, alongZ(new THREE.CylinderGeometry(0.17, 0.17, 4.0, 32)), steelPol2, XC, YC, ZC);
  {
    const rimShape = new THREE.Shape(); rimShape.absarc(0, 0, FW.r, 0, TAU, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, FW.r - 0.3, 0, TAU, true); rimShape.holes.push(hole);
    const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: FW.w, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 128 });
    rimGeo.translate(0, 0, -FW.w / 2);
    add(fly, rimGeo, iron);
    for (let k = 0; k < 6; k++) add(fly, new THREE.TorusGeometry(FW.r + 0.02, 0.028, 8, 160), ironDark, 0, 0, -FW.w / 2 + 0.07 + k * 0.096);   // rope grooves
    add(fly, new THREE.TorusGeometry(FW.r - 0.3, 0.035, 8, 160), brassPol, 0, 0, FW.w / 2 + 0.01);
    for (let i = 0; i < 8; i++) {
      const sg = new THREE.Group(); sg.rotation.z = (i / 8) * TAU; fly.add(sg);
      const sp = add(sg, new THREE.CylinderGeometry(0.08, 0.15, FW.r - 0.75, 16), iron, 0, (FW.r - 0.75) / 2 + 0.5, 0); sp.scale.z = 0.7;
    }
    add(fly, alongZ(new THREE.CylinderGeometry(0.55, 0.55, 0.72, 48)), steel);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; add(fly, alongZ(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 6)), brassPol, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0); }
    // pit: a black slot in the floor with an iron kerb
    add(machine, new THREE.BoxGeometry(FW.r * 2 + 0.4, 0.02, FW.w + 0.5), new THREE.MeshBasicMaterial({ color: '#000000' }), XC, 0.012, ZC);
    for (const s of [-1, 1]) add(machine, new THREE.BoxGeometry(FW.r * 2 + 0.6, 0.12, 0.1), iron, XC, 0.06, ZC + s * (FW.w / 2 + 0.3));
  }
  // flyball governor on its column above the near bed
  const gov = new THREE.Group(); gov.position.set(1.2, 0, ENG[0].z - 0.1); machine.add(gov);
  const govSpin = new THREE.Group(); govSpin.position.y = 3.45; gov.add(govSpin);
  {
    add(gov, new THREE.CylinderGeometry(0.1, 0.2, 3.4, 20), maroon, 0, 1.7, 0);
    add(gov, new THREE.CylinderGeometry(0.17, 0.17, 0.08, 24), brassPol, 0, 3.4, 0);
    add(govSpin, new THREE.CylinderGeometry(0.03, 0.03, 0.8, 12), steelPol2, 0, 0.4, 0);
    add(govSpin, new THREE.SphereGeometry(0.05, 16, 12), brassPol, 0, 0.82, 0);
    for (const s of [-1, 1]) {
      const arm = new THREE.Group(); arm.position.y = 0.74; arm.rotation.z = s * 0.62; govSpin.add(arm);
      add(arm, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), steelPol2, 0, -0.25, 0);
      add(arm, new THREE.SphereGeometry(0.11, 32, 24), brassPol, 0, -0.52, 0);
    }
    add(govSpin, new THREE.CylinderGeometry(0.07, 0.07, 0.06, 20), brassPol, 0, 0.3, 0);
  }

  // governor linkage and drive: links from the ball arms down to the sliding sleeve, the sleeve's lever and the
  // throttle rod down the column; a bevel gearbox under the spindle, turned by a flat belt from a pulley on the
  // end of the crankshaft (the governor senses the engine's speed through it)
  const nutG = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 6);
  const beltM = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 0.75, metalness: 0, bumpMap: surfaceTexture('cast', 512, 41), bumpScale: 0.15 });
  const govPulley = new THREE.Group();
  {
    const linkY0 = 0.74, sleeveY = 0.3;
    for (const s of [-1, 1]) {
      const a = s * 0.62, mid = V(-Math.sin(a) * 0.25, linkY0 - Math.cos(a) * 0.25, 0), sl = V(s * 0.075, sleeveY + 0.02, 0);
      const len = mid.distanceTo(sl), link = add(govSpin, new THREE.CylinderGeometry(0.01, 0.01, len, 8), steelPol2, (mid.x + sl.x) / 2, (mid.y + sl.y) / 2, 0);
      link.quaternion.setFromUnitVectors(V(0, 1, 0), mid.clone().sub(sl).normalize());
      for (const p of [mid, sl]) add(govSpin, new THREE.SphereGeometry(0.018, 12, 8), brassPol, p.x, p.y, p.z);
    }
    // sleeve lever (pivoted on a bracket on the column) and the throttle rod to the stop valve on the steam main
    add(gov, new THREE.BoxGeometry(0.05, 0.16, 0.05), maroon, 0.2, 3.32, 0);
    const lever = add(gov, new THREE.BoxGeometry(0.46, 0.035, 0.03), steelPol2, 0.08, 3.76, 0.1); lever.rotation.z = -0.12;
    add(gov, new THREE.BoxGeometry(0.03, 0.44, 0.03), steelPol2, 0.3, 3.52, 0.1);
    add(gov, alongZ(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 10)), brassPol, 0.3, 3.74, 0.1);
    add(gov, new THREE.CylinderGeometry(0.012, 0.012, 2.2, 8), steelPol2, 0.3, 2.2, 0.1);                  // throttle rod
    add(gov, new THREE.BoxGeometry(0.1, 0.1, 0.1), brassPol, 0.3, 1.08, 0.1);                              // throttle valve body on the column
    // bevel gearbox under the spindle, its cross shaft and pulley
    add(gov, new THREE.BoxGeometry(0.3, 0.24, 0.3), maroon, 0, 3.24, 0);
    add(gov, new THREE.BoxGeometry(0.34, 0.03, 0.34), brassPol, 0, 3.37, 0);
    for (const [x, z] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) add(gov, nutG, brassPol, x, 3.395, z);
    const gpz = 0.65;                                                     // pulley plane, world z = crankshaft end
    add(gov, alongZ(new THREE.CylinderGeometry(0.03, 0.03, gpz + 0.1, 12)), steelPol2, 0, 3.24, (gpz + 0.1) / 2);
    add(gov, alongZ(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16)), brassPol, 0, 3.24, 0.2);             // bearing
    govPulley.position.set(0, 3.24, gpz); gov.add(govPulley);
    add(govPulley, alongZ(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 40)), iron);
    add(govPulley, alongZ(new THREE.CylinderGeometry(0.06, 0.06, 0.13, 16)), steel);
    for (let k = 0; k < 4; k++) { const sp = add(govPulley, new THREE.BoxGeometry(0.28, 0.03, 0.03), iron); sp.rotation.z = (k / 4) * Math.PI; }
  }
  // crankshaft pulley and the open flat belt up to the governor pulley (tangent runs + wrap arcs)
  {
    const cz = ENG[0].z + 0.55, gz = gov.position.z + 0.65;             // (both at world z ≈ 4.9)
    const e0 = engines[0].parts.crank, cpz = cz - ENG[0].z;
    const cpul = new THREE.Group(); cpul.position.set(0, 0, cpz); e0.add(cpul);
    add(cpul, alongZ(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 48)), iron);
    add(cpul, alongZ(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 20)), steel);
    for (let k = 0; k < 3; k++) { const sp = add(cpul, new THREE.BoxGeometry(0.5, 0.05, 0.04), iron); sp.rotation.z = (k / 3) * Math.PI; }
    const A = new THREE.Vector2(XC, YC), B = new THREE.Vector2(gov.position.x, 3.24), rA = 0.345, rB = 0.205;
    const d = B.clone().sub(A), L = d.length(), ang = Math.atan2(d.y, d.x), off = Math.acos((rA - rB) / L);
    const pts = [];
    const arc = (c, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(V(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, 0)); } };
    arc(A, rA, ang + off, ang + TAU - off, 40);                           // wraps the far side of the big pulley
    arc(B, rB, ang - off, ang + off, 20);                                 // …and the far side of the small one
    pts.push(pts[0].clone());
    const beltPath = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const beltShape = new THREE.Shape([[-0.004, -0.04], [0.004, -0.04], [0.004, 0.04], [-0.004, 0.04]].map(([x, y]) => new THREE.Vector2(x, y)));
    const belt = new THREE.Mesh(new THREE.ExtrudeGeometry(beltShape, { steps: 160, extrudePath: beltPath }), beltM);
    belt.position.z = (cz + gz) / 2; machine.add(belt);
  }
  // valve gear (near engine): an eccentric on an outboard extension of the crankshaft (carried by its own
  // bearing pedestal) and its rod back to a drive pin on the Corliss wrist plate; links from the plate's arms
  // rock the steam valves in their bonnets
  const ECC = 0.13, EZ = 0.8;
  const eccRod = new THREE.Group(); engines[0].parts.g.add(eccRod);
  const valveLinks = [];
  {
    const g0 = engines[0].parts.g, crank0 = engines[0].parts.crank;
    add(crank0, alongZ(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 24)), steelPol2, 0, 0, 0.78);         // shaft extension
    add(crank0, alongZ(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 40)), forged, ECC, 0, EZ);             // eccentric sheave
    add(g0, new THREE.BoxGeometry(0.4, YC - 0.2, 0.22), maroon, XC, (YC - 0.2) / 2, 1.0);                  // outboard pedestal
    add(g0, new THREE.BoxGeometry(0.62, 0.06, 0.36), maroon, XC, 0.03, 1.0);
    add(g0, alongZ(new THREE.CylinderGeometry(0.22, 0.22, 0.28, 32)), brassPol, XC, YC, 1.0);
    add(g0, new THREE.CylinderGeometry(0.04, 0.06, 0.16, 16), brassPol, XC, YC + 0.28, 1.0);              // oil cup
    for (const dx of [-0.16, 0.16]) add(g0, nutG, steelPol2, XC + dx, YC + 0.2, 1.0);
    add(eccRod, new THREE.TorusGeometry(0.265, 0.035, 10, 40), brassPol, 0, 0, 0);                         // strap
    for (const s of [-1, 1]) add(eccRod, new THREE.BoxGeometry(0.1, 0.06, 0.08), brassPol, 0, s * 0.28, 0); // strap lugs
    const rodBar = add(eccRod, alongX(new THREE.CylinderGeometry(0.028, 0.028, 1, 12)), forged, -0.5, 0, 0); // unit length, scaled in update
    eccRod.userData = { rodBar };
    add(engines[0].wrist, alongZ(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 12)), brassPol, 0, -0.2, 0.06);   // drive pin
    const cx = (CYL.x0 + CYL.x1) / 2, vy = YC + CYL.r + 0.12;
    for (const bx of [CYL.x0 + 0.25, CYL.x1 - 0.25]) {
      add(g0, alongZ(new THREE.CylinderGeometry(0.03, 0.03, 0.36, 12)), steelPol2, bx, vy, 0.6);            // valve spindle
      add(g0, alongZ(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16)), steelPol2, bx, vy, 0.77);           // crank boss
      const link = add(g0, alongX(new THREE.CylinderGeometry(0.014, 0.014, 1, 8)), steelPol2, 0, 0, 0.77);
      valveLinks.push({ link, bx, vy, tip: bx < cx ? [Math.cos(2.6) * 0.4, Math.sin(2.6) * 0.4] : [Math.cos(0.5) * 0.4, Math.sin(0.5) * 0.4] });
    }
  }
  // drain cocks under each cylinder end (the blasts of steam at 27.3 come out of these) and bolted caps
  for (const e of ENG) {
    const g = engines.find((u) => u.e === e).parts.g;
    for (const x of [CYL.x0 + 0.35, CYL.x1 - 0.35]) {
      add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), copperM, x, 1.42, 0.45);
      add(g, new THREE.SphereGeometry(0.045, 14, 10), brassPol, x, 1.32, 0.45);
      add(g, alongZ(new THREE.CylinderGeometry(0.022, 0.028, 0.1, 12)), brassPol, x, 1.32, 0.52);
      const h = add(g, new THREE.BoxGeometry(0.16, 0.018, 0.018), steelPol2, x + 0.07, 1.36, 0.45); h.rotation.z = 0.35;
    }
    // hex nuts on the main bearing cap and cylinder pedestal
    const bz = e.z > ZC ? -0.62 : 0.62;
    for (const dx of [-0.24, 0.24]) for (const dz of [-0.17, 0.17]) add(g, nutG, steelPol2, XC + dx, YC - 0.04 + 0.33, bz + dz);
    for (const dx of [-0.8, -0.3, 0.3, 0.8]) { const n = add(g, nutG, steelPol2, (CYL.x0 + CYL.x1) / 2 + dx, 1.25, 0.41); n.rotation.x = Math.PI / 2; }
  }

  // Lancashire boiler, front end toward camera: riveted shell on brick seating, two furnace doors,
  // pressure gauge, water glasses, stop valve, safety valve, whistle and a stack at the back
  const BO = { x: -8.9, y: 2.15, z0: -4.2, z1: 4.6, r: 1.65 };
  const boiler = new THREE.Group(); boiler.position.set(BO.x, BO.y, 0); scene.add(boiler);
  const boilerLen = BO.z1 - BO.z0;
  {
    const shellMat = new THREE.MeshPhysicalMaterial({ color: '#2d2926', metalness: 0.6, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.4, bumpMap: surfaceTexture('cast', 512, 12), bumpScale: 0.3 });
    add(boiler, alongZ(new THREE.CylinderGeometry(BO.r, BO.r, boilerLen, 96, 1, true)), shellMat, 0, 0, (BO.z0 + BO.z1) / 2);
    add(boiler, new THREE.BoxGeometry(BO.r * 2 + 0.5, BO.y - 0.7, boilerLen - 0.4), new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.9, bumpMap: surfaceTexture('cast', 512, 5), bumpScale: 1 }), 0, -BO.y + (BO.y - 0.7) / 2, (BO.z0 + BO.z1) / 2);
    // front plate (slightly dished), steel band and rivet rings
    add(boiler, alongZ(new THREE.CylinderGeometry(BO.r + 0.04, BO.r + 0.04, 0.1, 96)), shellMat, 0, 0, BO.z1);
    add(boiler, new THREE.TorusGeometry(BO.r + 0.02, 0.05, 12, 96), steelPol2, 0, 0, BO.z1 + 0.04);
    const rivG = new THREE.SphereGeometry(0.03, 8, 4, 0, TAU, 0, Math.PI / 2);
    const NFR = 64, NSEAM = 5, NPER = 72;
    const rivets = new THREE.InstancedMesh(rivG, steelPol2, NFR * 2 + NSEAM * NPER * 2);
    const m4r = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V(1, 1, 1), pos = V(0, 0, 0), nrm = V(0, 0, 0), Yup = V(0, 1, 0);
    let ri = 0;
    for (let ring = 0; ring < 2; ring++) for (let k = 0; k < NFR; k++) {
      const a = (k / NFR) * TAU, rr = BO.r - 0.1 - ring * 0.1;
      pos.set(Math.cos(a) * rr, Math.sin(a) * rr, BO.z1 + 0.05); q.setFromUnitVectors(Yup, nrm.set(0, 0, 1)); m4r.compose(pos, q, sc); rivets.setMatrixAt(ri++, m4r);
    }
    for (let i = 0; i < NSEAM; i++) for (let side = -1; side <= 1; side += 2) for (let k = 0; k < NPER; k++) {
      const a = (k / NPER) * TAU, z = BO.z1 - 0.3 - i * (boilerLen - 0.6) / (NSEAM - 1) + side * 0.06;
      nrm.set(Math.cos(a), Math.sin(a), 0);
      pos.set(nrm.x * BO.r, nrm.y * BO.r, z); q.setFromUnitVectors(Yup, nrm); m4r.compose(pos, q, sc); rivets.setMatrixAt(ri++, m4r);
    }
    rivets.count = ri; boiler.add(rivets);
    for (let i = 0; i < NSEAM; i++) add(boiler, alongZ(new THREE.CylinderGeometry(BO.r + 0.012, BO.r + 0.012, 0.18, 96, 1, true)), shellMat, 0, 0, BO.z1 - 0.3 - i * (boilerLen - 0.6) / (NSEAM - 1));
    // furnace doors: fire seen through the grate slots (animated in update)
    const fireMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uI: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `${GLSL_NOISE}
        uniform float uT, uI; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p);
          if (r > 0.5) discard;
          float n = snoise(vec3(p * 5.0 + vec2(0.0, -uT * 1.6), uT * 0.7)) * 0.5 + 0.5;
          float n2 = snoise(vec3(p * 11.0 + vec2(0.0, -uT * 2.6), uT * 1.3)) * 0.5 + 0.5;
          float heat = clamp(0.55 + 0.6 * (n * 0.7 + n2 * 0.3) - (p.y + 0.5) * 0.45, 0.0, 1.0);
          vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.22), heat) * (0.6 + 1.6 * heat * heat);
          float slots = smoothstep(0.02, 0.05, abs(fract(vUv.x * 7.0) - 0.5));        // door bars
          float rim = smoothstep(0.5, 0.42, r);
          gl_FragColor = vec4(c * uI * mix(0.18, 1.0, slots) * rim, 1.0);
        }`,
    });
    const doors = [];
    for (const dx of [-0.72, 0.72]) {
      const d = add(boiler, new THREE.CircleGeometry(0.44, 48), fireMat, dx, -0.55, BO.z1 + 0.061); doors.push(d);
      add(boiler, new THREE.TorusGeometry(0.46, 0.05, 12, 48), iron, dx, -0.55, BO.z1 + 0.07);
      const hinge = new THREE.Group(); hinge.position.set(dx + 0.47, -0.55, BO.z1 + 0.09); hinge.rotation.y = -1.95; boiler.add(hinge);   // door swung open
      add(hinge, new THREE.CylinderGeometry(0.45, 0.45, 0.06, 48).rotateX(Math.PI / 2), iron, -0.46, 0, 0);
      add(hinge, new THREE.CylinderGeometry(0.06, 0.06, 0.1, 16).rotateX(Math.PI / 2), brassPol, -0.62, 0, 0.05);
    }
    boiler.userData.fire = fireMat;
    // pressure gauge: brass bezel, painted dial with ticks, red working line, needle
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    { const x = gc.getContext('2d'); x.fillStyle = '#efe6cf'; x.beginPath(); x.arc(128, 128, 128, 0, TAU); x.fill();
      x.strokeStyle = '#2a2018'; x.lineCap = 'round';
      for (let i = 0; i <= 40; i++) { const a = Math.PI * 0.75 + (i / 40) * Math.PI * 1.5, L = i % 5 ? 12 : 22; x.lineWidth = i % 5 ? 2 : 4; x.beginPath(); x.moveTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112); x.lineTo(128 + Math.cos(a) * (112 - L), 128 + Math.sin(a) * (112 - L)); x.stroke(); }
      x.strokeStyle = '#a3261a'; x.lineWidth = 6; x.beginPath(); x.arc(128, 128, 104, Math.PI * 0.75 + Math.PI * 1.5 * 0.78, Math.PI * 0.75 + Math.PI * 1.5 * 0.86); x.stroke();
      x.fillStyle = '#2a2018'; x.font = '600 26px "IBM Plex Mono", monospace'; x.textAlign = 'center'; x.fillText('LB / IN²', 128, 190); }
    const gTex = new THREE.CanvasTexture(gc); gTex.colorSpace = THREE.SRGBColorSpace;
    const gauge = new THREE.Group(); gauge.position.set(0, 0.72, BO.z1 + 0.08); boiler.add(gauge);
    add(gauge, alongZ(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 64)), brassPol);
    add(gauge, new THREE.TorusGeometry(0.34, 0.03, 12, 64), brassPol, 0, 0, 0.05);
    add(gauge, new THREE.CircleGeometry(0.32, 64), new THREE.MeshStandardMaterial({ map: gTex, roughness: 0.5 }), 0, 0, 0.052);
    add(gauge, new THREE.CircleGeometry(0.33, 64), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, roughness: 0.02, metalness: 0, clearcoat: 1 }), 0, 0, 0.07);
    const needle = add(gauge, new THREE.BoxGeometry(0.014, 0.27, 0.008).translate(0, 0.11, 0), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.4 }), 0, 0, 0.06);
    add(gauge, new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16).rotateX(Math.PI / 2), brassPol, 0, 0, 0.065);
    add(gauge, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 12), brassPol, 0, -0.5, -0.02);                   // syphon pipe
    boiler.userData.needle = needle;
    // water gauge glasses with brass cocks
    for (const dx of [-1.02, 1.02]) {
      add(boiler, new THREE.CylinderGeometry(0.035, 0.035, 0.62, 16), new THREE.MeshPhysicalMaterial({ color: '#cfe0e6', transparent: true, opacity: 0.35, roughness: 0.02, clearcoat: 1 }), dx, 0.55, BO.z1 + 0.2);
      add(boiler, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc890').multiplyScalar(0.5) }), dx, 0.42, BO.z1 + 0.2);
      for (const dy of [0.22, 0.88]) add(boiler, new THREE.BoxGeometry(0.12, 0.1, 0.22), brassPol, dx, dy, BO.z1 + 0.14);
    }
    // top fittings: stop valve with hand wheel, safety valve with lever and weight, whistle
    add(boiler, new THREE.CylinderGeometry(0.28, 0.34, 0.5, 32), brassPol, 0, BO.r + 0.2, 2.6);
    const wheel = add(boiler, new THREE.TorusGeometry(0.28, 0.03, 10, 48), brassPol, 0, BO.r + 0.62, 2.6); wheel.rotation.x = Math.PI / 2;
    add(boiler, new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), steelPol2, 0, BO.r + 0.5, 2.6);
    add(boiler, new THREE.CylinderGeometry(0.22, 0.3, 0.45, 32), brassPol, 0, BO.r + 0.2, -1.2);
    const lever = add(boiler, new THREE.BoxGeometry(0.06, 0.06, 1.4), steelPol2, 0, BO.r + 0.5, -1.7);
    add(boiler, new THREE.CylinderGeometry(0.14, 0.14, 0.22, 24), iron, 0, BO.r + 0.4, -2.35);
    add(boiler, new THREE.CylinderGeometry(0.05, 0.08, 0.5, 16), brassPol, 0.6, BO.r + 0.25, 3.8);
    add(boiler, new THREE.CylinderGeometry(0.1, 0.1, 0.12, 16), brassPol, 0.6, BO.r + 0.56, 3.8);
    lever.userData = {};
    // stack at the back
    add(boiler, new THREE.CylinderGeometry(0.55, 0.62, 9, 48, 1, true), ironDark, 0, BO.r + 4.0, BO.z0 + 0.6);
    add(boiler, new THREE.TorusGeometry(0.58, 0.1, 12, 48).rotateX(Math.PI / 2), iron, 0, BO.r + 8.5, BO.z0 + 0.6);
  }
  // steam main (lagged, brass-flanged) from the stop valve across to both steam chests; exhaust up to the roof
  const pipeGrp = new THREE.Group(); machine.add(pipeGrp);
  {
    const chestY = YC + CYL.r + 0.34, chestX = (CYL.x0 + CYL.x1) / 2;
    const main = new THREE.CatmullRomCurve3([V(BO.x, BO.y + BO.r + 0.45, 2.6), V(BO.x, BO.y + BO.r + 1.3, 2.6), V(-6.6, 4.3, ZC), V(chestX - 0.4, 4.1, ZC), V(chestX, 3.6, ZC)]);
    const lagMat = new THREE.MeshStandardMaterial({ color: '#4b4540', roughness: 0.85, metalness: 0.05, bumpMap: surfaceTexture('cast', 512, 8), bumpScale: 0.6 });
    pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(main, 120, 0.17, 20), lagMat));
    for (let k = 1; k <= 4; k++) { const p = main.getPointAt(k / 5), tng = main.getTangentAt(k / 5); const f = add(pipeGrp, new THREE.CylinderGeometry(0.23, 0.23, 0.06, 24), brassPol, p.x, p.y, p.z); f.quaternion.setFromUnitVectors(V(0, 1, 0), tng); }
    for (const e of ENG) {
      const br = new THREE.CatmullRomCurve3([V(chestX, 3.6, ZC), V(chestX, 3.2, (ZC + e.z) / 2), V(chestX, chestY, e.z)]);
      pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(br, 32, 0.11, 16), copperM));
      add(pipeGrp, new THREE.CylinderGeometry(0.19, 0.19, 0.06, 24), brassPol, chestX, chestY + 0.02, e.z);
    }
    const exh = new THREE.CatmullRomCurve3([V(CYL.x0 + 0.4, 1.1, ENG[1].z - 0.5), V(CYL.x0 + 0.2, 3.0, ENG[1].z - 0.9), V(-5.2, 6.5, ZC - 3.0), V(-5.0, 11, ZC - 3.4)]);
    pipeGrp.add(new THREE.Mesh(new THREE.TubeGeometry(exh, 64, 0.22, 16), ironDark));
  }
  const EXH = V(-5.0, 11.0, ZC - 3.4);
  // floor + light shafts
  // cast-iron floor plates (2 m) with raised diamond tread, worn seams and grime: the open-matte frame shows a lot
  // of floor, and a uniform grey plane read as empty
  const fc = document.createElement('canvas'); fc.width = fc.height = 512;
  {
    const x = fc.getContext('2d'), r = rng(303);
    x.drawImage(surfaceTexture('cast', 512, 3).image, 0, 0);
    x.globalAlpha = 0.55;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const cx = i * 32 + (j % 2) * 16 + 8, cy = j * 32 + 16, l = 150 + r() * 40;
      x.fillStyle = `rgb(${l},${l},${l})`; x.save(); x.translate(cx, cy); x.rotate((i + j) % 2 ? 0.6 : -0.6); x.fillRect(-10, -2.5, 20, 5); x.restore();
    }
    x.globalAlpha = 1;
    x.strokeStyle = 'rgba(8,8,8,0.95)'; x.lineWidth = 5; x.strokeRect(2, 2, 508, 508);
    x.strokeStyle = 'rgba(150,150,150,0.35)'; x.lineWidth = 1.5; x.strokeRect(6, 6, 500, 500);
    for (let k = 0; k < 4; k++) { const cx = [14, 498][k % 2], cy = [14, 498][k >> 1]; x.fillStyle = 'rgba(190,190,190,0.7)'; x.beginPath(); x.arc(cx, cy, 5, 0, TAU); x.fill(); }
  }
  const floorTex = new THREE.CanvasTexture(fc); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.anisotropy = 8; floorTex.repeat.set(80, 80);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#1c1b1a', metalness: 0.55, roughness: 0.62, roughnessMap: floorTex, bumpMap: floorTex, bumpScale: 1.4 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const shafts = [];
  for (let i = 0; i < 3; i++) {
    const s = lightShaft({ length: 22, radiusTop: 0.6, radiusBottom: 3.5, color: '#ffc89a', intensity: 0.09 });
    s.position.set(-8 + i * 6.5, 21, -3 + i * 1.5); s.rotation.z = 0.42; s.rotation.x = 0.12; scene.add(s); shafts.push(s);
  }
  const lamps = [];

  // railway along z at x = RX: a raised ballast bed of crushed stone, weathered timber sleepers on it,
  // cast-iron base plates, and rails with rust-brown webs under a polished running band; a telegraph line
  // of timber poles with glass insulators and lit copper wires beside it, all receding to a dawn haze.
  const RX = 9.6, GAUGE = 0.72;
  const BED = { top: 0.16, wTop: 1.45, wBot: 2.1 };           // half-widths of the ballast shoulder
  const SL = { h: 0.14, y: BED.top + 0.04 };                   // sleepers sit ~4 cm proud of the stone
  const RAIL_Y = SL.y + SL.h / 2 + 0.014;                       // rail foot on the base plates
  const rail = new THREE.Group(); scene.add(rail);
  {
    // crushed-stone texture (albedo + bump share one canvas; stones ~1–2 cm)
    const gc = document.createElement('canvas'); gc.width = gc.height = 512;
    {
      const x = gc.getContext('2d'), r = rng(91);
      x.fillStyle = '#2c2926'; x.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 2600; i++) {
        const px = r() * 512, py = r() * 512, rr = 3 + r() * 7, l = 60 + r() * 90, w = r() < 0.3 ? 12 : 0;
        x.fillStyle = `rgb(${l + w},${l + w * 0.6},${l - w * 0.2})`;
        x.beginPath();
        const n = 5 + Math.floor(r() * 3), a0 = r() * TAU;
        for (let k = 0; k < n; k++) { const a = a0 + (k / n) * TAU, q = rr * (0.7 + r() * 0.5); const X = px + Math.cos(a) * q, Y = py + Math.sin(a) * q * 0.8; k ? x.lineTo(X, Y) : x.moveTo(X, Y); }
        x.closePath(); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); x.arc(px - rr * 0.25, py - rr * 0.25, rr * 0.35, 0, TAU); x.fill();
      }
    }
    const gravel = new THREE.CanvasTexture(gc); gravel.wrapS = gravel.wrapT = THREE.RepeatWrapping; gravel.anisotropy = 8; gravel.colorSpace = THREE.SRGBColorSpace;
    const gravelBump = new THREE.CanvasTexture(gc); gravelBump.wrapS = gravelBump.wrapT = THREE.RepeatWrapping; gravelBump.anisotropy = 8;
    const ballastM = new THREE.MeshStandardMaterial({ color: '#b3aca3', roughness: 0.92, metalness: 0, map: gravel, bumpMap: gravelBump, bumpScale: 1.6 });
    // bed cross-section (trapezoid) swept along z with world-scaled UVs (u across, v along the track)
    const Z0 = 40, Z1 = -100, TILE = 0.9;
    const prof = [[-BED.wBot, 0.0], [-BED.wTop, BED.top], [BED.wTop, BED.top], [BED.wBot, 0.0]];
    const pos = [], uv = [], idx = [];
    let across = 0;
    for (let k = 0; k < prof.length - 1; k++) {
      const [x0, y0] = prof[k], [x1, y1] = prof[k + 1], len = Math.hypot(x1 - x0, y1 - y0), b = pos.length / 3;
      for (const [x, y, u] of [[x0, y0, across], [x1, y1, across + len]]) for (const z of [Z0, Z1]) { pos.push(RX + x, y, z); uv.push(u / TILE, (Z0 - z) / TILE); }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      across += len;
    }
    const bedGeo = new THREE.BufferGeometry();
    bedGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bedGeo.setIndex(idx); bedGeo.computeVertexNormals();
    rail.add(new THREE.Mesh(bedGeo, ballastM));
    // sleepers: weathered timber (walnut grain multiplied up to a grey-brown), per-sleeper tone and a slight skew
    // weathered, creosoted timber: grey-brown with long grain streaks and a few checks (cracks) along the length
    const wc = document.createElement('canvas'); wc.width = 512; wc.height = 128;
    {
      const x = wc.getContext('2d'), r = rng(64);
      x.fillStyle = '#6b5d50'; x.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 220; i++) {
        const y = r() * 128, l = r(), a = 0.06 + r() * 0.16;
        x.strokeStyle = l > 0.5 ? `rgba(38,30,24,${a})` : `rgba(150,136,118,${a})`;
        x.lineWidth = 0.5 + r() * 2.2;
        x.beginPath(); x.moveTo(0, y);
        for (let X = 0; X <= 512; X += 32) x.lineTo(X, y + Math.sin(X * 0.01 + i) * (1 + r() * 2));
        x.stroke();
      }
      for (let i = 0; i < 9; i++) { const y = 10 + r() * 108, x0 = r() * 380; x.strokeStyle = 'rgba(20,15,12,0.7)'; x.lineWidth = 1 + r() * 1.5; x.beginPath(); x.moveTo(x0, y); x.lineTo(x0 + 40 + r() * 110, y + (r() - 0.5) * 4); x.stroke(); }
    }
    const woodTex = new THREE.CanvasTexture(wc); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.anisotropy = 8;
    const woodBump = new THREE.CanvasTexture(wc); woodBump.anisotropy = 8;
    const sleeperM = new THREE.MeshStandardMaterial({ color: '#d8d0c6', roughness: 0.9, metalness: 0, map: woodTex, bumpMap: woodBump, bumpScale: 1.4 });
    const NS = 210, sl = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, SL.h, 0.25), sleeperM, NS);
    const plates = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.018, 0.2), ironMat({ color: '#3d3a38', roughness: 0.7 }), NS * 2);
    const m4 = new THREE.Matrix4(), rr = rng(77), sc = new THREE.Color(), qq = new THREE.Quaternion(), yAx = V(0, 1, 0), one = V(1, 1, 1), pp = V(0, 0, 0);
    for (let i = 0; i < NS; i++) {
      const z = 40 - i * 0.66;
      qq.setFromAxisAngle(yAx, (rr() - 0.5) * 0.025);
      m4.compose(pp.set(RX + (rr() - 0.5) * 0.04, SL.y, z), qq, one); sl.setMatrixAt(i, m4);
      const v = 0.8 + rr() * 0.35; sl.setColorAt(i, sc.setRGB(v, v * (0.96 + rr() * 0.05), v * (0.9 + rr() * 0.08)));
      for (const s of [-1, 1]) { m4.makeTranslation(RX + s * GAUGE, SL.y + SL.h / 2 + 0.005, z); plates.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4); }
    }
    rail.add(sl, plates);
    // rails: flat-bottom profile in weathered iron + a polished running band on the head
    const ish = new THREE.Shape([[-0.07, 0], [0.07, 0], [0.07, 0.02], [0.015, 0.035], [0.015, 0.12], [0.04, 0.13], [0.04, 0.17], [-0.04, 0.17], [-0.04, 0.13], [-0.015, 0.12], [-0.015, 0.035], [-0.07, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)));
    const rg = new THREE.ExtrudeGeometry(ish, { depth: 140, bevelEnabled: false, curveSegments: 1 }); rg.translate(0, RAIL_Y, -100);
    const railIron = new THREE.MeshStandardMaterial({ color: '#6a5446', metalness: 0.75, roughness: 0.55, roughnessMap: surfaceTexture('cast', 512, 23), bumpMap: surfaceTexture('cast', 512, 23), bumpScale: 0.3 });
    const band = new THREE.BoxGeometry(0.056, 0.004, 140); band.translate(0, RAIL_Y + 0.172, -30);
    const bandM = steelMat({ roughness: 0.2, color: '#d6dce2', lathe: false }); bandM.envMapIntensity = 4;   // the worn running band mirrors the sky
    // track hardware: dog spikes gripping the rail foot at every base plate, and bolted fishplates at the
    // rail joints (every 9 m) on both sides of the web
    {
      const spikeG = new THREE.BoxGeometry(0.035, 0.03, 0.05), spikeM = ironMat({ color: '#2e2b29', roughness: 0.6 });
      const spikes = new THREE.InstancedMesh(spikeG, spikeM, NS * 4);
      let k = 0;
      for (let i = 0; i < NS; i++) {
        const z = 40 - i * 0.66;
        for (const s of [-1, 1]) for (const o of [-1, 1]) { m4.makeTranslation(RX + s * GAUGE + o * 0.085, RAIL_Y + 0.012, z + o * 0.04); spikes.setMatrixAt(k++, m4); }
      }
      rail.add(spikes);
      const NJ = Math.floor(140 / 9), plateG = new THREE.BoxGeometry(0.014, 0.075, 0.6), boltG = new THREE.CylinderGeometry(0.014, 0.014, 0.022, 6).rotateZ(Math.PI / 2);
      const fish = new THREE.InstancedMesh(plateG, railIron, NJ * 4), bolts = new THREE.InstancedMesh(boltG, spikeM, NJ * 16);
      let f = 0, b = 0;
      for (let j = 0; j < NJ; j++) {
        const z = 36 - j * 9;
        for (const s of [-1, 1]) for (const o of [-1, 1]) {
          const x = RX + s * GAUGE + o * 0.024;
          m4.makeTranslation(x, RAIL_Y + 0.078, z); fish.setMatrixAt(f++, m4);
          for (const dz of [-0.21, -0.07, 0.07, 0.21]) { m4.makeTranslation(x + o * 0.012, RAIL_Y + 0.078, z + dz); bolts.setMatrixAt(b++, m4); }
        }
      }
      rail.add(fish, bolts);
    }
    [-1, 1].forEach((s) => {
      const m = new THREE.Mesh(rg, railIron); m.position.x = RX + s * GAUGE; rail.add(m);
      const h = new THREE.Mesh(band, bandM); h.position.x = RX + s * GAUGE; rail.add(h);
    });
    // telegraph poles (weathered timber) with cross-arms, glass insulators and copper wires
    const poleM = new THREE.MeshStandardMaterial({ color: '#5a4c40', roughness: 0.85, metalness: 0, bumpMap: surfaceTexture('walnut', 512, 31), bumpScale: 1 });
    const insM = new THREE.MeshPhysicalMaterial({ color: '#8fb8a8', roughness: 0.1, clearcoat: 1, emissive: '#1c3a30', emissiveIntensity: 0.6 });
    const poleG = new THREE.CylinderGeometry(0.09, 0.12, 5.2, 12), armG = new THREE.BoxGeometry(1.4, 0.1, 0.1), insG = new THREE.CylinderGeometry(0.05, 0.07, 0.16, 12);
    const wireTop = [];
    for (let i = 0; i < 16; i++) {
      const z = 30 - i * 7;
      const pole = new THREE.Mesh(poleG, poleM); pole.position.set(RX + 2.2, 2.6, z); rail.add(pole);
      const arm = new THREE.Mesh(armG, poleM); arm.position.set(RX + 2.2, 4.9, z); rail.add(arm);
      [-0.55, 0.55].forEach((dx) => { const ins = new THREE.Mesh(insG, insM); ins.position.set(RX + 2.2 + dx, 5.03, z); rail.add(ins); });
      wireTop.push(z);
    }
    // the wires hang from the insulator tops (y 5.11) and are lit copper: a dark metal tube this thin reads as
    // a floating black line against the haze, so they carry a faint warm emissive of their own
    const wireM = new THREE.MeshStandardMaterial({ color: '#d08a58', metalness: 0.85, roughness: 0.32, emissive: '#6a3818', emissiveIntensity: 0.9 });
    [-0.55, 0.55].forEach((dx) => {
      const pts = [];
      for (let i = 0; i < wireTop.length - 1; i++) for (let k = 0; k < 8; k++) { const u = k / 8, z = lerp(wireTop[i], wireTop[i + 1], u); pts.push(V(RX + 2.2 + dx, 5.11 - Math.sin(u * Math.PI) * 0.3, z)); }
      pts.push(V(RX + 2.2 + dx, 5.11, wireTop[wireTop.length - 1]));
      rail.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 1200, 0.01, 5), wireM));
    });
  }
  // dawn haze far down the line: silhouettes the poles and gives the rails a horizon to converge on
  const dawn = glowSprite({ color: '#ffb877', intensity: 0.7, scale: 60 }); dawn.material.fog = false; dawn.position.set(RX + 1, 3, -95); scene.add(dawn);
  const dawnCore = glowSprite({ color: '#ffe2bf', intensity: 0.7, scale: 14 }); dawnCore.material.fog = false; dawnCore.position.set(RX + 0.5, 1.4, -94); scene.add(dawnCore);
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

  // steam: gland wisps (macro), the drain-cock blast at 27.3 and on each stroke after, the exhaust
  // chuffing from the roof on the beat, the boiler's safety valve lifting, stack smoke, trackside drift
  const beats = (t0, n, w) => (u) => t0 + Math.floor(u * n) * BEAT + (u * n - Math.floor(u * n)) * w;
  const cockY = YC - CYL.r - 0.02, nearZ = ENG[0].z;
  const emitters = [
    { pos: V(CYL.x1 + 0.3, YC + 0.05, nearZ + 0.1), dir: V(0.4, 1, 0.5), spread: 0.8, speed: 0.5, jitter: 0.08, life: 1.3, weight: 0.35, size: 0.3, birth: (u) => 1.85 + u * 2.7 },
    { pos: V(CYL.x0 + 0.35, cockY, nearZ + 0.35), dir: V(-0.15, -0.25, 1), spread: 0.4, speed: 7.5, jitter: 0.04, life: 1.1, weight: 1.5, size: 0.4, birth: (u) => (u < 0.55 ? tSteam + (u / 0.55) * 0.3 : beats(tSteam + 0.2, 3, 0.14)((u - 0.55) / 0.45)) },
    { pos: V(CYL.x1 - 0.35, cockY, nearZ + 0.35), dir: V(0.15, -0.25, 1), spread: 0.4, speed: 7.5, jitter: 0.04, life: 1.1, weight: 1.5, size: 0.4, birth: (u) => (u < 0.55 ? tSteam + 0.04 + (u / 0.55) * 0.3 : beats(tSteam + 0.45, 3, 0.14)((u - 0.55) / 0.45)) },
    { pos: V(CYL.x0 + 0.35, cockY, ENG[1].z + 0.3), dir: V(-0.3, -0.3, 1), spread: 0.4, speed: 5.5, jitter: 0.05, life: 1.0, weight: 0.45, size: 0.55, birth: (u) => tSteam + 0.08 + u * 0.35 },
    { pos: EXH.clone(), dir: V(0.1, 1, 0.15), spread: 0.5, speed: 5, jitter: 0.2, life: 2.0, weight: 0.9, size: 1.3, birth: beats(tSteam - 0.3, 4, 0.16) },
    { pos: V(BO.x, BO.y + BO.r + 0.55, -1.2), dir: V(0.12, 1, 0.1), spread: 0.35, speed: 7, jitter: 0.1, life: 2.1, weight: 1.3, size: 1.1, birth: (u) => tSteam + 0.05 + u * 1.65 },
    { pos: V(BO.x, BO.y + BO.r + 8.6, BO.z0 + 0.6), dir: V(0.25, 1, 0.1), spread: 0.45, speed: 2.4, jitter: 0.3, life: 2.6, weight: 0.8, size: 1.7, birth: (u) => 1.6 + u * 2.9 },
    // (trackside drift retired: at the vanishing point it read as a flat grey block against the dawn haze; the
    //  slot is kept so the other emitters' particle counts and seeds stay exactly as approved)
    { pos: V(RX + 0.3, 1.7, -16), dir: V(0.2, 1, 0.3), spread: 1.2, speed: 1.2, jitter: 1.4, life: 1.6, weight: 0.45, size: 0.9, birth: () => 99 },
  ];
  const steam = makeSteam(5200, emitters, { seed: 17, lightPos: V(-12, 6, -9), keyDir: key.position });
  scene.add(steam);
  const STEAM_BACK = steam.material.uniforms.uBack.value.clone();
  steam.material.uniforms.uFirePos.value.set(BO.x, 1.6, BO.z1 + 0.9);

  // ---- HUD ---------------------------------------------------------------------
  const hud = ctx.makeHUD();
  const hudT = new TextPlane('TWIN MILL ENGINE · 19TH C.', { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#ffd9b8', intensity: 0.95 });
  const hudS = new TextPlane('LANCASHIRE BOILER · 1844', { font: FONTS.mono, height: 0.026, letterSpacing: 0.3, color: '#ffd9b8', intensity: 0.7 });
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
  // C: cut-away macro on the near cylinder, dolly along piston rod → crosshead → con-rod → crank;
  // D: crane up and back as steam erupts; E: hero wide of the whole engine hall (lock on 28.0); F: railway
  // (C stays a medium shot: the chapter word floats ~2.8 units in front of the lens with a real light in it,
  // and machinery closer than that would take a hot spot of its light)
  const camC = makePath([[2.0, V(-5.4, 3.7, 11.2)], [2.5, V(-3.6, 3.6, 11.0)], [2.8, V(-2.3, 2.9, 9.7)], [3.1, V(-0.7, 1.9, 9.1)], [3.5, V(2.9, 0.95, 10.4)], [3.75, V(6.4, 1.4, 12.6)], [4.12, V(RX + 0.2, 0.85, 13.5)], [4.5, V(RX + 0.05, 0.5, 3.8)]]);
  const tgtC = makePath([[2.0, V(-3.2, 2.3, 3.6)], [2.5, V(-2.2, 2.3, 3.5)], [2.8, V(-2.7, 2.1, 4.0)], [3.1, V(-3.0, 2.3, 3.6)], [3.5, V(-3.1, 2.95, 2.5)], [3.75, V(-1.4, 2.7, 1.8)], [4.12, V(RX - 0.4, 1.0, 0)], [4.5, V(RX - 0.15, 1.5, -8)]]);

  // ---- scratch ------------------------------------------------------------------
  const cp = V(0, 0, 0), ct = V(0, 0, 0), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), zAxis = V(0, 0, 1), s3 = V(1, 1, 1), p3 = V(0, 0, 0);
  const dof = { focus: 1.2, range: 0.5, amount: 0.8 };
  const bloom = { strength: 0.6 };
  // explore: complete the sets (see explore() below)
  let exMode = false, lastInfo = null;
  // (C/D: the cut-away cylinder's lamp and the drain-cock steam are lit for a medium shot — pushed right up to
  // them they burn into a white haze, so the engine shots don't zoom in as far)
  const LIM_A = { yaw: 0.45, pitchUp: 0.7, zoomOut: 2.4 }, LIM_ENGINE = { zoomIn: 0.75 }, LIM_HALL = {};
  let lastT = 0;
  const out = {
    scene, camera, hud, dof, bloom, exposure: 1, harmony: 1, background: BG, update, explore, exploreEnd, explorePosed,
    // shot A is a macro a few units off the gear wall: a wide yaw only grazes the wall edge-on (gear rims
    // filling the lens); the engine hall and railway take the default window
    // (0.45: the director already looks at the wall ~35° off square, so a wider swing turns it edge-on to a void)
    get exploreLimits() { return lastT < tPist ? LIM_A : lastT < tMach ? LIM_ENGINE : LIM_HALL; },
  };

  // clockwork tick: advance one step per beat with an eased, slightly overshooting snap
  const tick = (T, len = 0.22) => { const n = Math.floor(T / BEAT), ph = sat((T - n * BEAT) / len); return n + ease.outBack(ph); };

  function update(t, info) {
    lastInfo = info; lastT = t;
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
        // (explore: the whole wall is built, not only the gears that have popped in so far)
        const wave = exMode ? 1 : ease.outBack(sat((many - g.dist * 0.018 - g.layer * 0.05) / 0.28));
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
    // As the camera pulls back from the gear wall (26.0–26.5) the key would mirror off hundreds of flat gear
    // faces straight into the lens (a white wash in the open-matte frame): dim the key, broaden the wall's
    // highlights. In the engine hall the wall recedes into a soft, matte backdrop.
    const pull = smoothstep(1.35, 1.85, t);
    key.intensity = shotA ? lerp(2.0, 0.55, pull) : 1.5;
    wallMat.color.setScalar(shotA ? lerp(1, 0.42, pull) : 0.13);
    wallMat.roughness = shotA ? lerp(0.34, 0.6, pull) : 0.8;
    heroSpin.visible = pinSpin.visible = wheelSpin.visible = shotA;
    calloutA.position.copy(H).add(V(Math.cos(0.35) * hero.r, Math.sin(0.35) * hero.r, 0.26));
    calloutB.position.copy(pinSpin.position).add(V(0.35, -0.3, 0.3));
    calloutA.reveal(ramp(t, tGear + 0.05, tGear + 0.55), 1 - smoothstep(1.35, 1.6, t));
    calloutB.reveal(ramp(t, tGear + 0.3, tGear + 0.8), 1 - smoothstep(1.35, 1.6, t));
    calloutA.visible = calloutB.visible = set1;
    calloutA.quaternion.identity(); calloutB.quaternion.identity();   // (explorePosed turns them to the viewer)

    // ---------- engine --------------------------------------------------------------
    // half a revolution per beat (60 rpm): a dead centre lands on every beat, with a slight surge
    // through each power stroke — the flywheel carries it, the governor balls ride out on their arms
    const n = Math.floor(T / BEAT), ph = (T - n * BEAT) / BEAT;
    const theta = Math.PI * (n + ph + 0.05 * Math.sin(TAU * ph));
    const hit = pulse(T, { decay: 5 });
    for (const u of engines) {
      const th = theta + u.e.ph, P = u.parts;
      P.crank.rotation.z = th;
      const px = XC + CR * Math.cos(th), dy = CR * Math.sin(th);
      const xh = px - Math.sqrt(CL * CL - dy * dy);
      P.cross.position.set(xh, YC, 0);
      P.rod.position.set(xh, YC, 0); P.rod.rotation.z = Math.atan2(dy, px - xh);
      P.piston.position.set(xh - ROD - 0.2, YC, 0);
      u.wrist.rotation.z = 0.32 * Math.sin(th + Math.PI / 2);
      if (u.inner) u.inner.intensity = (0.8 + 2.4 * hit) * ramp(t, tPist - 0.3, tPist);
    }
    fly.rotation.z = theta;
    govSpin.rotation.y = theta * 2.0;
    govPulley.rotation.z = theta * (0.345 / 0.205);                  // driven by the open belt from the crankshaft
    {
      // eccentric rod: from the sheave centre (turning with the near crank) to the wrist plate's drive pin
      const th0 = theta + engines[0].e.ph, wr = engines[0].wrist, rz = wr.rotation.z, ur = eccRod.userData;
      const ex = XC + ECC * Math.cos(th0), ey = YC + ECC * Math.sin(th0);
      const wx = wr.position.x + 0.2 * Math.sin(rz), wy = wr.position.y - 0.2 * Math.cos(rz);
      eccRod.position.set(ex, ey, EZ);
      const dxr = ex - wx, dyr = ey - wy, lr = Math.hypot(dxr, dyr);
      eccRod.rotation.z = Math.atan2(dyr, dxr);
      ur.rodBar.scale.set(lr - 0.26, 1, 1); ur.rodBar.position.x = -(lr - 0.26) / 2 - 0.26;
      // valve links: wrist-plate arm tip → valve crank
      for (const v of valveLinks) {
        const tx = wr.position.x + v.tip[0] * Math.cos(rz) - v.tip[1] * Math.sin(rz), ty = wr.position.y + v.tip[0] * Math.sin(rz) + v.tip[1] * Math.cos(rz);
        const lx = v.bx - tx, ly = v.vy - ty;
        v.link.position.set((v.bx + tx) / 2, (v.vy + ty) / 2, 0.77);
        v.link.rotation.z = Math.atan2(ly, lx); v.link.scale.set(Math.hypot(lx, ly), 1, 1);
      }
    }
    const on2 = ramp(t, tPist - 0.3, tPist);
    const flick = 0.82 + 0.1 * Math.sin(T * 23.0) + 0.08 * Math.sin(T * 37.0 + 1.3);
    ember.position.set(BO.x, 1.5, BO.z1 + 0.9);
    ember.intensity = 26 * flick * on2;
    ember.distance = 9;
    steam.material.uniforms.uFireI.value = 2.2 * flick * on2;
    boiler.userData.fire.uniforms.uT.value = T;
    boiler.userData.fire.uniforms.uI.value = 1.6 * flick;
    boiler.userData.needle.rotation.z = 2.1 - 2.9 * ramp(t, 2.6, 3.4) - 0.04 * hit;
    const set2 = !shotA;
    machine.visible = boiler.visible = set2 || t > tPist - 0.6;

    const lock = pulse(T, { decay: 4 }) * (Math.abs(T - 28.0) < 0.3 ? 1 : 0) * (T >= 28.0 ? 1 : 0);
    rim.intensity = shotA ? 3.2 * (0.3 + 0.7 * ramp(t, tGear - 0.2, tGear + 0.3)) * 0.45 : 2.0 + 2.0 * lock;
    rim.color.setHex(shotA ? 0xff9448 : 0xffc890);
    // set 2: the back light comes from high up (roof lights) — a low back light mirrors off the floor and
    // the engine beds straight into the lens as a glare
    if (shotA) rim.position.set(6, 5, -9); else rim.position.set(3, 16, -7);
    side.intensity = 1.6 * ramp(t, 3.2, 3.6);
    shafts.forEach((sh) => { sh.visible = t > 2.75; });
    dawn.visible = dawnCore.visible = t > 3.7;
    dawn.material.opacity = dawnCore.material.opacity = ramp(t, 3.7, 4.05);

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
    camera.fov = shotA ? lerp(26, 34, smoothstep(1.5, 2.0, t)) : t < 4.0 ? 30 + 7 * smoothstep(2.9, 3.45, t) - 1 * smoothstep(3.5, 3.9, t) : lerp(36, 58, smoothstep(3.95, 4.5, t));
    camera.updateProjectionMatrix();

    // exposure / DOF per shot
    if (shotA) { dof.focus = cp.distanceTo(ct); dof.range = lerp(0.6, 3, smoothstep(1.5, 2.0, t)); dof.amount = lerp(0.8, 0.35, smoothstep(1.5, 2.0, t)); }
    else if (t < 3.3) { dof.focus = cp.distanceTo(ct); dof.range = 1.4; dof.amount = 0.6; }
    else if (t < 3.95) { dof.focus = cp.distanceTo(ct); dof.range = 5; dof.amount = 0.3; }
    else { dof.focus = 6; dof.range = 3; dof.amount = 0.45; }
    bloom.strength = 0.6 + 0.3 * hit * (t > tPist ? 1 : 0) + fe * 0.6;
    out.exposure = 1.0 + 0.15 * lock;
    // the prism's spectrum wipe (science → here) keeps its true colours until it has crossed the frame
    out.harmony = smoothstep(0.3, 0.52, t);

    // HUD
    const he = envelope(t, 3.35, 4.6, 0.25, 0.3);
    hudT.opacity = he; hudT.reveal = ramp(t, 3.35, 3.8, ease.outCubic);
    hudS.opacity = he * 0.9; hudS.reveal = ramp(t, 3.5, 3.95, ease.outCubic);
  }

  // Explore: the gear wall is shown whole (in the film most of it pops in at 26.0 as the camera pulls back),
  // and the set is given a room around it.
  function explore(t) {
    if (!exMode) { exMode = true; update(t, lastInfo); }
    // the whole wall, seen off-axis, would mirror the key into the lens as a white wash: broaden its highlights
    // …and so would the hero gear's polished faces: off the film's angle the flat steel faces mirror the
    // environment's bright panels (and the key) and wash the frame white (restored in exploreEnd)
    if (t < tPist) {
      wallMat.roughness = Math.max(wallMat.roughness, 0.62);
      steel.roughness = 0.5; steelPol.roughness = 0.34;
      key.intensity *= 0.55;
      scene.environmentIntensity = 0.08;
    } else { steel.roughness = 0.24; steelPol.roughness = 0.12; scene.environmentIntensity = 0.18; }
    // sunlit steam seen from below, against its back light, blooms into a lamp-like white disc
    // (and a puff right at the lens — a live zoom-in pushes into the drain-cock blast — is a white-out: thin it sooner)
    steam.material.uniforms.uBack.value.copy(STEAM_BACK).multiplyScalar(0.5);
    steam.material.uniforms.uNear.value.set(1.0, 2.6);
  }
  function exploreEnd() {
    exMode = false; steel.roughness = 0.24; steelPol.roughness = 0.12; scene.environmentIntensity = 0.18;
    steam.material.uniforms.uBack.value.copy(STEAM_BACK); steam.material.uniforms.uNear.value.set(0.35, 1.4);
  }
  // the macro callouts are read-outs pinned to the gears: keep them facing the viewer from any angle
  function explorePosed(cam) {
    calloutA.quaternion.copy(cam.quaternion); calloutB.quaternion.copy(cam.quaternion);
    // engine hall: the high back light mirrors off the oiled floor plates straight into a camera craned up
    // over the machine (a blown orange disc) — fade it as the view lines up with its mirror direction
    if (lastT >= tPist) {
      exF.set(0, 0, 1).applyQuaternion(cam.quaternion);                 // toward the camera
      exM.set(-rim.position.x, rim.position.y, -rim.position.z).normalize();
      rim.intensity *= 1 - 0.8 * smoothstep(0.7, 0.93, exF.dot(exM));
      // …and looking steeply down, the metallic floor plates mirror the environment's bright ceiling panels
      exF.set(0, 0, -1).applyQuaternion(cam.quaternion);
      scene.environmentIntensity = 0.18 * (1 - 0.6 * smoothstep(0.5, 0.85, -exF.y));
    }
  }
  const exF = V(0, 0, 0), exM = V(0, 0, 0);

  return out;
}
