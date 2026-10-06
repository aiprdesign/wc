// TO THE MOON AND MARS (49.5 – 56.0 s) — India in space, 1963 → 2023, in six shots joined by motion-matched cuts.
//   49.9  THUMBA · 1963 — dusk on the Kerala coast: palms, the church by the shore, a bicycle by the launcher;
//         a slim two-stage Nike-Apache leaves its rail on the drive's downbeat and the camera tilts up after it…
//   50.7  ARYABHATA · 1975 — … into orbit: the 26-faced satellite turns over a sunlit Earth limb (awe)
//   51.5  PSLV · SRIHARIKOTA — blue hour; the PSLV-XL lights (core + four ground-lit strap-ons), the flame
//         trench throws two walls of cloud sideways and the vehicle climbs off the pad (the pulse)
//   52.3  CHANDRAYAAN-1 · 2008 — the grey Moon, slow pan; the orbiter crosses in its polar orbit and an
//         M3-style scan paints the blue false-colour signature of water at high latitudes (golden)
//   53.1  MANGALYAAN · 2014 — thin and quiet: over the rust-red limb the gold-foil spacecraft fires its main
//         engine and a gold ellipse draws itself round Mars (the light moment of wonder)
//   53.9  CHANDRAYAAN-3 · 2023 — the rising build: Vikram descends over the south polar regolith (a sun four
//         degrees high, shadows tens of metres long, Earth low on the horizon) and touches down in a dust
//         bloom exactly on 54.6 (the heroic swell); the ramp unfolds, Pragyan rolls down leaving tracks, and
//         the camera cranes up and away toward the stars as the montage arrives ('zoom').
// One scene, one constant set of lights (no shader recompiles at the cuts); each shot is its own group.
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { segmentsLine, progressTube } from '../../lib/lines.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout } from '../../lib/hud.js';
import { makeBackdrop, makeSmoke } from '../frontier-assets.js';
import { makeEnv, regolithTextures, terrainGeometry, earthMesh } from '../moonshot-assets.js';
import * as A from './isro-assets.js';

const V3 = A.V3;

export function create(ctx, segment) {
  const cue = (n) => CUES[n] - segment.start;
  const tTh = cue('thumba'), tAr = cue('aryabhataSat'), tPs = cue('pslv'), tC1 = cue('chandrayaan1'), tMo = cue('mangalyaan'), tC3 = cue('chandrayaan3'), tSP = cue('southPole');
  const DUR = segment.end - segment.start;
  const SQ = OUTPUT_ASPECT < 1.5;
  const lite = ctx.engine?.quality === 'lite';
  const R = rng(1963);

  // cuts (local seconds)
  const cAr = tAr, cPs = tPs - 0.07, cC1 = tC1, cMo = tMo, cC3 = tC3;
  const tLaunch = tTh;                       // Nike-Apache leaves the rail on the cue (the drive lands on 49.875)
  const tIgn = tPs - 0.05, tLift = tPs + 0.07; // PSLV
  const tRamp = tSP + 0.12, tRov0 = tSP + 0.36;

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.fog = new THREE.Fog(0x000000, 1e5, 2e5);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 3000);

  // ---------------------------------------------------------------- shared lights (constant set)
  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.castShadow = true; key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight('#9fc0ff', 1);
  const hemi = new THREE.HemisphereLight('#8fa6c8', '#000000', 0.2);
  const glowL = new THREE.PointLight('#ffb070', 0, 0, 2);
  scene.add(key, key.target, rim, rim.target, hemi, glowL);
  const setKey = (dir, color, intensity, center, half, far = 200) => {
    key.color.set(color); key.intensity = intensity;
    key.target.position.copy(center); key.position.copy(center).addScaledVector(dir, far * 0.5);
    const c = key.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 0.5; c.far = far; c.updateProjectionMatrix();
  };
  const setRim = (dir, color, intensity) => { rim.color.set(color); rim.intensity = intensity; rim.position.copy(dir).multiplyScalar(50); rim.target.position.set(0, 0, 0); };

  // skies (camera-centred): dusk / blue hour with a sea, and the analytic orbit / deep-space backdrop
  const sky = A.makeSky(); scene.add(sky);
  const SK = sky.userData.u;
  const space = makeBackdrop(); scene.add(space);
  const SU = space.userData.u;
  const stars = A.makeStarfield(lite ? 3000 : 5200); scene.add(stars);
  const STU = stars.userData.u;

  const SPACE_ENV = makeEnv(ctx.renderer, { ground: [0.16, 0.15, 0.14], glowDir: V3(0.5, 0.6, 0.6), glow: [0.9, 0.85, 0.78] });
  const EARTH_ENV = makeEnv(ctx.renderer, { ground: [0.05, 0.12, 0.3], glowDir: V3(0.6, 0.5, 0.6), glow: [1.0, 0.95, 0.88] });
  const MOON_ENV = makeEnv(ctx.renderer, { ground: [0.3, 0.29, 0.27], glowDir: V3(-0.85, 0.1, 0.5), glow: [0.6, 0.58, 0.54] });
  const MG = A.isroMaterials(null);          // ground hardware: scene environment
  const MS = A.isroMaterials(SPACE_ENV);     // spacecraft in deep space
  const ME = A.isroMaterials(EARTH_ENV);     // in Earth orbit
  const MM = A.isroMaterials(MOON_ENV);      // on the Moon

  const worlds = [];
  const mk = () => { const g = new THREE.Group(); g.visible = false; scene.add(g); worlds.push(g); return g; };
  const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

  // ================================================================ 1 · THUMBA, 21 NOVEMBER 1963 (metres)
  const w1 = mk();
  const SUN1 = V3(-0.27, -0.03, -1).normalize();
  const KEY1 = V3(-0.3, 0.1, -1).normalize();
  const reg = regolithTextures(256, 42);
  {
    const sand = new THREE.MeshStandardMaterial({ color: '#4a3b2c', roughness: 0.95, bumpMap: reg.bump, bumpScale: 1.2, map: reg.albedo });
    const land = new THREE.Mesh(new THREE.PlaneGeometry(500, 260, 1, 1), sand);
    land.rotation.x = -Math.PI / 2; land.position.set(0, 0, 130 - 46); land.receiveShadow = true; w1.add(land);
    const beachM = new THREE.MeshStandardMaterial({ color: '#8d765a', roughness: 0.9, map: reg.albedo });
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(500, 9), beachM); beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.01, -41.5); w1.add(beach);
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(500, 0.7), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd2b0').multiplyScalar(0.55), transparent: true, opacity: 0.7, toneMapped: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(0, 0.02, -45.8); w1.add(foam);
  }
  const silM = new THREE.MeshStandardMaterial({ color: '#100c0a', roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.2 });
  const palmGeos = [A.palmGeometry(3, 9.5), A.palmGeometry(7, 11), A.palmGeometry(11, 8.5), A.palmGeometry(19, 12.5)];
  const palms = [];
  [[-15.5, 8, 0, 1.15], [-19, 2, 2, 1.1], [12, 4, 1, 1.05], [16.5, -3, 0, 1.2], [9.5, -11, 2, 0.9],
    [-30, -30, 3, 1], [-38, -34, 0, 1.1], [24, -30, 1, 1.0], [33, -36, 2, 1.15], [46, -33, 3, 1], [-50, -36, 1, 1.2], [5, -38, 0, 0.9], [-4, -37, 2, 1.0], [60, -38, 1, 1.1], [-64, -38, 2, 1.0]]
    .forEach(([x, z, v, s], i) => {
      const m = new THREE.Mesh(palmGeos[v], silM); m.position.set(x, 0, z); m.scale.setScalar(s); m.rotation.y = i * 1.7; m.castShadow = true; w1.add(m); palms.push(m);
    });
  const church = new THREE.Mesh(A.churchGeometry(), silM); church.position.set(-36, 0, -34); church.rotation.y = 0.7; church.scale.setScalar(0.9); church.castShadow = true; w1.add(church);
  const winM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(0.9), toneMapped: false });
  for (let i = 0; i < 3; i++) { const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 1.1), winM); wn.position.set(3.52, 2.4, -3.5 + i * 3.5); wn.rotation.y = Math.PI / 2; church.add(wn); }
  { const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), winM); door.position.set(0, 1.0, 7.12); church.add(door); }
  const bike = new THREE.Mesh(A.bicycleGeometry(), silM); bike.position.set(-3.4, 0, 3.2); bike.rotation.set(0, 0.35, 0.1); bike.castShadow = true; w1.add(bike);
  // launcher + rocket
  const ELEV = THREE.MathUtils.degToRad(82);
  const launcher = A.buildLauncher(MG, ELEV); w1.add(launcher.group);
  const nike = A.buildNikeApache(MG);
  const rocketHolder = new THREE.Group(); launcher.rail.add(rocketHolder);
  rocketHolder.position.set(0, -0.15, 0.02); rocketHolder.add(nike.group);
  const AX1 = V3(0, 1, 0).applyAxisAngle(V3(1, 0, 0), launcher.rail.rotation.x);
  const ACC1 = 120;
  const sN = (t) => (t > tLaunch ? 0.5 * ACC1 * (t - tLaunch) ** 2 : 0);
  const nikeCore = A.plume(0.11, 0.22, 2.4, A.plumeMat('#fff2d6', 3.2)), nikeOut = A.plume(0.16, 0.9, 7.0, A.plumeMat('#ffa758', 1.1, { alpha: 0.7 }));
  nikeCore.position.copy(nike.exit); nikeOut.position.copy(nike.exit); nike.group.add(nikeCore, nikeOut);
  const nikeGlow = glowSprite({ color: '#ffd6a0', intensity: 3, scale: 2.2 }); nikeGlow.position.set(0, -0.5, 0); nike.group.add(nikeGlow);
  const smoke1 = makeSmoke(lite ? 1800 : 3600, { t0: 0, t1: 1.0, seed: 7 }); w1.add(smoke1);
  const S1U = smoke1.userData.u;
  S1U.uV0.value = 0; S1U.uAcc.value = ACC1; S1U.uSpread0.value = 0.15; S1U.uSpreadK.value = 0.9; S1U.uLife.value = 3.0; S1U.uSize.value = 1.1; S1U.uHotK.value = 7;
  S1U.uAxis.value.copy(AX1); S1U.uGain.value = 0.42; S1U.uTint.value.set('#ffc6a8');
  const billow1 = A.makeBillow(lite ? 500 : 1000, { t0: tLaunch - 0.02, t1: tLaunch + 0.5, seed: 4, speed: [3, 10], rise: [0.3, 2.4], size: [0.6, 1.5] });
  billow1.position.set(0, 0.2, 0); w1.add(billow1);
  const B1U = billow1.userData.u;
  B1U.uAmb.value.set('#2a2230'); B1U.uSunCol.value.set('#a0603c'); B1U.uSun.value.copy(KEY1);
  const S1CAM = new THREE.CatmullRomCurve3([V3(-7.8, 1.45, 17.4), V3(-8.3, 1.4, 16.5), V3(-8.9, 1.25, 15.4)]);

  // ================================================================ 2 · ARYABHATA IN ORBIT, 1975 (metres; Earth on the backdrop)
  const w2 = mk();
  const arya = A.buildAryabhata(ME);
  const aryaSpin = new THREE.Group(); aryaSpin.rotation.set(0.42, 0, -0.2); aryaSpin.add(arya.group); w2.add(aryaSpin);
  const SUN2 = V3(0.55, 0.42, 0.72).normalize();
  const EARTH2 = V3(-0.1, -1, -0.08).normalize().multiplyScalar(1.03);
  const EROT2 = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, 1.2, 0.2)));
  const aryaGlint = glowSprite({ color: '#fff4e0', intensity: 2.5, scale: 0.5 }); w2.add(aryaGlint);

  // ================================================================ 3 · PSLV, SRIHARIKOTA (metres)
  const w3 = mk();
  const SUN3 = V3(0.9, -0.06, -0.42).normalize();
  {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: '#2a2a24', roughness: 1, map: reg.albedo, bumpMap: reg.bump, bumpScale: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -3.2; ground.receiveShadow = true; w3.add(ground);
    // a ring of low scrub on the horizon (the island's casuarina belt): dark bumps
    const scrubG = [];
    for (let i = 0; i < 70; i++) { const a = (i / 70) * TAU + R() * 0.05, r = 260 + R() * 80; scrubG.push(A.bake(new THREE.SphereGeometry(1, 8, 5), [Math.cos(a) * r, -3.2, Math.sin(a) * r], [0, 0, 0], [14 + R() * 18, 4 + R() * 6, 10 + R() * 10])); }
    const scrub = new THREE.Mesh(A.merge(scrubG), new THREE.MeshStandardMaterial({ color: '#0b0d0c', roughness: 1 })); w3.add(scrub);
  }
  const pad = A.buildPad(MG); w3.add(pad.group);
  const lampGlows = pad.lamps.map((p) => { const g = glowSprite({ color: '#e8f0ff', intensity: 1.6, scale: 2.6 }); g.position.copy(p); w3.add(g); return g; });
  const pslv = A.buildPSLV(MG);
  const pslvG = new THREE.Group(); pslvG.add(pslv.group); w3.add(pslvG);
  const ACC3 = 46;
  const yP = (t) => 0.6 + (t > tLift ? 0.5 * ACC3 * (t - tLift) ** 2 : 0);
  const coreCore = A.plume(0.8, 1.8, 12, A.plumeMat('#fff4dc', 5.5)), coreOut = A.plume(1.2, 6.5, 34, A.plumeMat('#ffa04a', 2.0, { alpha: 0.8 }));
  coreCore.position.copy(pslv.coreExit); coreOut.position.copy(pslv.coreExit); pslv.group.add(coreCore, coreOut);
  const GROUND_LIT = [0, 1, 3, 4];           // four strap-ons light on the pad; the other two are air-lit
  const strapFx = GROUND_LIT.map((i) => {
    const p = pslv.strapExits[i];
    const c = A.plume(0.36, 0.9, 8, A.plumeMat('#fff0d4', 5.0)), o = A.plume(0.55, 3.4, 24, A.plumeMat('#ff9a46', 1.7, { alpha: 0.75 }));
    c.position.copy(p); o.position.copy(p); pslv.group.add(c, o); return [c, o];
  });
  const pslvGlow = glowSprite({ color: '#ffcf96', intensity: 4, scale: 22 }); pslvGlow.position.set(0, -3, 0); pslv.group.add(pslvGlow);
  const smoke3 = makeSmoke(lite ? 2200 : 4200, { t0: 0, t1: 0.9, seed: 12 }); w3.add(smoke3);
  const S3U = smoke3.userData.u;
  S3U.uV0.value = 0; S3U.uAcc.value = ACC3; S3U.uSpread0.value = 1.2; S3U.uSpreadK.value = 3.4; S3U.uLife.value = 3.0; S3U.uSize.value = 3.2; S3U.uHotK.value = 5;
  S3U.uAxis.value.set(0, 1, 0); S3U.uGain.value = 0.55; S3U.uTint.value.set('#ffd2b0');
  const billow3 = A.makeBillow(lite ? 2000 : 4200, { t0: tIgn + 0.01, t1: tPs + 0.85, seed: 9, lobes: 1, speed: [24, 95], rise: [3, 22], size: [4, 9] });
  billow3.position.set(0, -2.2, 0); w3.add(billow3);
  const B3U = billow3.userData.u;
  B3U.uAmb.value.set('#1a2232'); B3U.uSunCol.value.set('#3e4a62'); B3U.uSun.value.set(0.3, 0.4, 0.8).normalize(); B3U.uFire.value.set('#ff9440');

  // ================================================================ 4 · CHANDRAYAAN-1 AT THE MOON, 2008 (Moon radius 100)
  const w4 = mk();
  const SUN4 = V3(0.82, 0.3, 0.5).normalize();
  const moon = A.moonWaterMesh(100, SUN4, lite ? 96 : 160); moon.rotation.x = 0.1; w4.add(moon);
  const MW = moon.material.uniforms;
  const ch1 = A.buildChandrayaan1(MS);
  const ch1G = new THREE.Group(); ch1G.add(ch1.group); w4.add(ch1G);
  ch1.group.rotation.set(0.25, -0.5, 0.12);
  const C1CAM = [V3(-9, 80, 152), V3(4, 79, 151)];
  const C1LOOK = [V3(-6, 67, 0), V3(8, 66, 0)];

  // ================================================================ 5 · MANGALYAAN AT MARS, 24 SEPTEMBER 2014 (Mars radius 10)
  const w5 = mk();
    const mars = A.marsMesh(10, V3(), lite ? 96 : 160); w5.add(mars);
  const marsBody = mars.children[0];
  mars.rotation.z = 0.44;
  const N5 = V3(0.1, 0.96, 0.25).normalize();
  const P5 = V3(-1, 0.05, 0.55); P5.addScaledVector(N5, -P5.dot(N5)).normalize();
  const Q5 = V3().crossVectors(N5, P5).normalize();
  const SUN5 = V3().addScaledVector(Q5, 0.3).addScaledVector(P5, 0.6).addScaledVector(N5, -0.7).normalize();
  mars.userData.mat.uniforms.uSun.value.copy(SUN5);
  const RP = 10.75, E5 = 0.86, PP = RP * (1 + E5);
  const orbitAt = (nu, out = V3()) => { const r = PP / (1 + E5 * Math.cos(nu)); return out.copy(P5).multiplyScalar(Math.cos(nu) * r).addScaledVector(Q5, Math.sin(nu) * r); };
  const ellA = new THREE.CatmullRomCurve3(Array.from({ length: 100 }, (_, i) => orbitAt(0.012 + (i / 99) * 2.6)));
  const orbA = progressTube(ellA, { radius: 0.016, segments: 360, color: '#ffc45a', intensity: 2.0 }); w5.add(orbA);
  const mom = A.buildMOM(MS);
  const MOM_S = 0.065;
  const momG = new THREE.Group(); momG.scale.setScalar(MOM_S); momG.add(mom.group); w5.add(momG);
  {
    // engine (−y) points along the velocity (a retro-burn); the wing (+x) stands out radially; the bus faces −N (the camera side)
    momG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(P5, Q5.clone().negate(), N5.clone().negate()));
    mom.wing.rotation.x = Math.PI / 2 - 0.35;
  }
  const momCore = A.plume(0.12, 0.3, 1.6, A.plumeMat('#fff3e0', 3.0)), momOut = A.plume(0.2, 1.1, 5.5, A.plumeMat('#ffc070', 1.0, { alpha: 0.6 }));
  momCore.position.copy(mom.exit); momOut.position.copy(mom.exit); mom.group.add(momCore, momOut);
  const momGlow = glowSprite({ color: '#ffe0b0', intensity: 2.4, scale: 1.4 }); momGlow.position.copy(mom.exit); mom.group.add(momGlow);
  const momAt = (t, out = V3()) => orbitAt(0, out);

  // ================================================================ 6 · CHANDRAYAAN-3 NEAR THE SOUTH POLE, 23 AUGUST 2023 (metres)
  const w6 = mk();
  const SUN6 = V3(-0.86, 0.1, 0.5).normalize();            // ~6° above the horizon
  const EARTH6 = V3(0.55, 0.05, -0.83).normalize();          // Earth hangs low near the horizon
  const field = A.southPoleField(31, { RM: 520 });
  const lunarMat = new THREE.MeshStandardMaterial({ map: reg.albedo, bumpMap: reg.bump, bumpScale: 1.4, color: '#f4efe6', roughness: 0.96, metalness: 0, envMapIntensity: 0.02 });
  const terrain = new THREE.Mesh(terrainGeometry(field, { size: 140, segs: lite ? 190 : 300, k: 1.6, uvScale: 1 / 4 }), lunarMat);
  terrain.receiveShadow = true; terrain.castShadow = true; w6.add(terrain);
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 1);
    const p = rockGeo.attributes.position, v = V3(), rr = rng(5);
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.75 + rr() * 0.5); v.y *= 0.6; p.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8d8a84', roughness: 0.92, bumpMap: reg.bump, bumpScale: 2, flatShading: true });
    const N = lite ? 160 : 320, rocks = new THREE.InstancedMesh(rockGeo, rockMat, N), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V3(), pos = V3();
    let n = 0, tries = 0;
    while (n < N && tries++ < 6000) {
      const x = (rr() - 0.5) * 90, z = (rr() - 0.5) * 90 - 10, size = 0.05 + Math.pow(rr(), 5) * 1.2;
      if (Math.hypot(x, z) < 4.5 || (Math.abs(x) < 1.6 && z > 0 && z < 7)) continue;
      pos.set(x, field(x, z) - size * 0.2, z); e.set(rr() * 0.4, rr() * TAU, rr() * 0.4); q.setFromEuler(e); s.set(size * (0.8 + rr() * 0.5), size, size * (0.8 + rr() * 0.5));
      M4.compose(pos, q, s); rocks.setMatrixAt(n++, M4);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true; w6.add(rocks);
  }
  const earth6 = earthMesh(9, SUN6.clone(), { segs: 64, city: 0 }); w6.add(earth6);
  const vik = A.buildVikram(MM);
  const PSI = -Math.PI / 2;                                // the ramp side (+x) faces the camera side (+z)
  const LAND = V3(0, field(0, 0) + A.VIKRAM.legDrop, 0);
  const vikG = new THREE.Group(); vikG.rotation.y = PSI; vikG.add(vik.group); w6.add(vikG);
  const RAMP_DIR = V3(1, 0, 0).applyAxisAngle(V3(0, 1, 0), PSI);
  const toLand = (x, y, z) => V3(x, y, z).applyAxisAngle(V3(0, 1, 0), PSI).add(LAND);
  const HINGE = toLand(1.0, A.VIKRAM.bayFloor, 0);
  const RL = A.VIKRAM.rampLen * 2;
  let ALPHA = 0.5;
  for (let i = 0; i < 4; i++) { const e = HINGE.clone().addScaledVector(RAMP_DIR, RL * Math.cos(ALPHA)); ALPHA = Math.asin(Math.min(0.9, (HINGE.y - field(e.x, e.z) - 0.04) / RL)); }
  const RAMP_END = HINGE.clone().addScaledVector(RAMP_DIR, RL * Math.cos(ALPHA)); RAMP_END.y = HINGE.y - RL * Math.sin(ALPHA);
  const prag = A.buildPragyan(MM); w6.add(prag.group);
  // rover path: bay floor → hinge → down the ramp → out across the regolith
  const path = [toLand(0.5, A.VIKRAM.bayFloor + 0.03, 0), HINGE.clone().setY(HINGE.y + 0.03), RAMP_END.clone().setY(RAMP_END.y + 0.03)];
  for (let i = 1; i <= 30; i++) { const p = RAMP_END.clone().addScaledVector(RAMP_DIR, i * 0.12); p.y = field(p.x, p.z) + 0.005; path.push(p); }
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
  const pathAt = (s, out) => {
    if (s <= 0) return out.copy(path[0]).addScaledVector(V3().subVectors(path[1], path[0]).normalize(), s);
    let i = 1; while (i < path.length - 1 && cum[i] < s) i++;
    const u = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return out.copy(path[i - 1]).lerp(path[i], Math.min(u, 1.5));
  };
  const S_FOOT = cum[2];
  const roverS = (t) => 3.3 * ramp(t, tRov0, DUR + 0.2, ease.inOutSine);
  // wheel tracks on the regolith beyond the ramp foot (revealed behind the rear wheels)
  const tracks = (() => {
    const tex = A.treadTexture(); tex.repeat.set(1, 1);
    const pos = [], uv = [], STEP = 0.06, NSEG = 60, W = 0.07;
    const side = V3(-RAMP_DIR.z, 0, RAMP_DIR.x);
    for (let i = 0; i < NSEG; i++) {
      for (const off of [-prag.gauge, prag.gauge]) {
        const a = RAMP_END.clone().addScaledVector(RAMP_DIR, i * STEP).addScaledVector(side, off), b = a.clone().addScaledVector(RAMP_DIR, STEP);
        const pts = [a.clone().addScaledVector(side, -W), a.clone().addScaledVector(side, W), b.clone().addScaledVector(side, -W), b.clone().addScaledVector(side, W)];
        pts.forEach((p) => { p.y = field(p.x, p.z) + 0.006; });
        const v0 = i * STEP * 4, v1 = (i + 1) * STEP * 4;
        pos.push(...pts[0].toArray(), ...pts[2].toArray(), ...pts[1].toArray(), ...pts[1].toArray(), ...pts[2].toArray(), ...pts[3].toArray());
        uv.push(0, v0, 0, v1, 1, v0, 1, v0, 0, v1, 1, v1);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ color: '#4e4b46', roughness: 1, transparent: true, alphaMap: tex, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.renderOrder = 1; mesh.userData.n = NSEG; mesh.userData.step = STEP;
    return mesh;
  })();
  w6.add(tracks);
  // descent profile: from 8 m to touchdown on the cue (arriving at ~1.7 m/s), a little lateral drift
  const D0 = tC3 - 0.12;
  const altAt = (t) => { const u = sat((t - D0) / (tSP - D0)); return 8.2 * (0.85 * (1 - u) ** 2 + 0.15 * (1 - u)); };
  const dust6 = A.makeLunarDust(lite ? 3000 : 6500, { tEmit0: tC3 + 0.12, tLand: tSP, altAt }); dust6.position.set(LAND.x, field(0, 0), LAND.z); w6.add(dust6);
  const D6U = dust6.userData.u; D6U.uSun.value.copy(SUN6);
  const vikFx = vik.engines.map((p) => { const c = A.plume(0.07, 0.32, 1.4, A.plumeMat('#dfe8ff', 0.8)); c.position.copy(p); vik.group.add(c); return c; });
  const vikGlow = glowSprite({ color: '#e6eeff', intensity: 1.0, scale: 1.8 }); vikGlow.position.set(0, -0.5, 0); vik.group.add(vikGlow);
  const C6CAM = new THREE.CatmullRomCurve3([V3(-5.8, 1.7, 12.8), V3(-4.1, 0.95, 8.9), V3(-3.0, 1.05, 7.7), V3(-3.8, 3.2, 11.0), V3(-7, 11, 20), V3(-11, 22, 31)], false, 'centripetal');
  const C6K = [[tC3 - 0.02, 0], [tSP, 1], [tSP + 0.55, 2], [tSP + 0.8, 2.55], [DUR - 0.2, 4.2], [DUR + 0.05, 5]];
  C6CAM.points.forEach((p) => { p.y += field(p.x, p.z); });

  // ================================================================ HUD (open-matte aware; captions bottom-left)
  const hud = ctx.makeHUD();
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const ICE = '#dfe9f7', GOLD = '#f0b445';
  const SHOTS = [
    { t: tTh - 0.12, end: cAr - 0.05, main: 'THUMBA · 21 NOVEMBER 1963', sub: "NIKE-APACHE · INDIA'S FIRST SOUNDING ROCKET · US-MADE" },
    { t: cAr + 0.03, end: cPs - 0.05, main: 'ARYABHATA · 1975', sub: "INDIA'S FIRST SATELLITE · LAUNCHED 19 APRIL 1975 ON A SOVIET KOSMOS-3M" },
    { t: cPs + 0.06, end: cC1 - 0.05, main: 'PSLV · SRIHARIKOTA', sub: "ISRO'S WORKHORSE LAUNCHER · FIRST SUCCESSFUL FLIGHT 1994" },
    { t: cC1 + 0.03, end: cMo - 0.05, main: 'CHANDRAYAAN-1 · 2008', sub: "WATER ON THE MOON (WITH NASA'S M3)" },
    { t: cMo + 0.03, end: cC3 - 0.05, main: 'MANGALYAAN · 24 SEPTEMBER 2014', sub: 'MARS ORBIT AT THE FIRST ATTEMPT', tag: 'FIRST ASIAN NATION TO REACH MARS ORBIT' },
    { t: cC3 + 0.03, end: DUR - 0.3, main: 'CHANDRAYAAN-3 · 23 AUGUST 2023', sub: 'FIRST LANDING NEAR THE LUNAR SOUTH POLE', tag: 'INDIA · THE FOURTH NATION TO SOFT-LAND ON THE MOON', tagT: tSP + 0.12 },
  ];
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const capMain = SHOTS.map((s) => tpLeft(s.main, { font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: '#f3f6fb', intensity: 1.15 }, HX(0.16), HY(-0.78)));
  const capSub = SHOTS.map((s) => tpLeft(s.sub, { font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: ICE, intensity: 0.85, size: 80 }, HX(0.165), HY(-0.838)));
  const capTag = SHOTS.map((s) => (s.tag ? tpLeft(s.tag, { font: FONTS.mono, weight: 400, height: 0.021 * UI, letterSpacing: 0.26, color: GOLD, intensity: 1.1, size: 80 }, HX(0.165), HY(-0.885)) : null));
  const capIdx = SHOTS.map((s, i) => tpLeft(`0${i + 1}`, { font: FONTS.mono, weight: 500, height: 0.026 * UI, letterSpacing: 0.2, color: GOLD, intensity: 1.3 }, HX(0.16), HY(-0.715)));
  const idxOf = tpLeft('/ 06', { font: FONTS.mono, weight: 300, height: 0.022 * UI, letterSpacing: 0.3, color: ICE, intensity: 0.75 }, HX(0.16) + 0.06 * UI, HY(-0.715));
  const RAIL_W = 0.95 * UI, RAIL_X = HX(0.16), RAIL_Y = HY(-0.935);
  const rail = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: '#8ea6c6', intensity: 0.55, orderFn: () => 0, stagger: 0 });
  const railTicks = segmentsLine(SHOTS.map((_, i) => { const x = RAIL_X + RAIL_W * i / 5; return [V3(x, RAIL_Y - 0.01 * UI, 0), V3(x, RAIL_Y + 0.01 * UI, 0)]; }), { color: '#cfe0f5', intensity: 0.8, orderFn: (a, b, i) => i / 6, stagger: 0.7 });
  const railFill = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: GOLD, intensity: 1.4, orderFn: () => 0, stagger: 0 });
  const railDot = new THREE.Mesh(new THREE.CircleGeometry(0.009 * UI, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), toneMapped: false, transparent: true }));
  hud.scene.add(rail, railTicks, railFill, railDot);
  const CS = 0.03 * UI;
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UI, dy: dy * UI, size: CS, color: ICE, intensity: 1.2, sub }); hud.scene.add(c); return c; };
  const callArya = mkCall('26-SIDED POLYHEDRON', 'ABOUT 1.4 M ACROSS · SOLAR CELLS', 0.3, 0.2);
  const callPslv = mkCall('PSLV-XL', 'FOUR STAGES · SIX STRAP-ON BOOSTERS', 0.32, 0.12);
  const callWater = mkCall('WATER · HYDROXYL', "SIGNATURE MAPPED BY NASA'S M3", 0.3, 0.16);
  const callMom = mkCall('MARS ORBITER MISSION', 'ORBIT INSERTION BURN', -0.3, 0.22);
  const callVik = mkCall('VIKRAM', 'LANDER', 0.28, 0.2);
  const callPrag = mkCall('PRAGYAN', 'ROVER · SIX WHEELS', -0.26, 0.16);
  const callSite = mkCall('SHIV SHAKTI POINT', 'THE LANDING SITE', 0.28, 0.18);
  const CALLS = [callArya, callPslv, callWater, callMom, callVik, callPrag, callSite];

  // ================================================================ animation
  const camPos = V3(), look = V3(), tmp = V3(), tmp2 = V3(), tmp3 = V3();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv)) * HH, 0);
    return out;
  };
  const pin = (call, world, p, o) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse); const behind = tmp3.z > 0;
    projHud(world, call.position);
    const inside = !behind && Math.abs(call.position.x) < FILM_ASPECT * 0.92 && Math.abs(call.position.y) < HH * 0.9;
    call.reveal(inside ? p : 0, inside ? o : 0);
  };
  const cuts = [cAr, cPs, cC1, cMo, cC3];
  const cutW = [0.5, 0.65, 0.45, 0.3, 0.5];
  const shotOf = (t) => (t < cAr ? 0 : t < cPs ? 1 : t < cC1 ? 2 : t < cMo ? 3 : t < cC3 ? 4 : 5);
  const RES = { focus: 6, dofAmt: 0, dofRange: 3, harmony: 1, bloom: 0.7, exposure: 1, envI: 0.3 };
  const ret = (focus, dofAmt, dofRange, harmony, bloom, exposure, envI) => Object.assign(RES, { focus, dofAmt, dofRange, harmony, bloom, exposure, envI });
  let shotNow = 0;
  const roverPos = V3(), roverFront = V3(), roverRear = V3(), vikPos = V3(), momPos = V3(), ch1Pos = V3();

  const EX_LIM = { 0: { yaw: 0.8, pitchDown: 0.2, zoomOut: 2.0, fly: 0.6 }, 1: { zoomIn: 0.6, zoomOut: 2.5 }, 2: { yaw: 0.5, pitchDown: 0.1, zoomOut: 1.6, fly: 0.3 }, 3: { zoomIn: 0.6, zoomOut: 1.6, fly: 0.5 }, 4: { zoomIn: 0.6, zoomOut: 2.0, fly: 0.6 }, 5: { yaw: 1.0, pitchDown: 0.3, zoomOut: 2.5, fly: 1.2 } };

  // ---------------------------------------------------------------- shots
  function shotThumba(t, T) {
    const s = sN(t);
    rocketHolder.position.y = -0.15 + s;
    const on = ramp(t, tLaunch - 0.03, tLaunch + 0.03, ease.outCubic);
    const flick = 0.9 + 0.1 * Math.sin(T * 91) * Math.sin(T * 37);
    nikeCore.visible = nikeOut.visible = nikeGlow.visible = on > 0.001;
    nikeCore.material.uniforms.uA.value = on * flick; nikeOut.material.uniforms.uA.value = 0.75 * on * flick;
    nikeCore.material.uniforms.uT.value = nikeOut.material.uniforms.uT.value = T;
    nikeGlow.material.opacity = on * flick; nikeGlow.scale.setScalar(2.2 + 1.8 * envelope(t, tLaunch - 0.02, tLaunch + 0.25, 0.02, 0.2));
    launcher.group.updateMatrixWorld(true);
    const exitW = nike.group.localToWorld(tmp.copy(nike.exit));
    S1U.uT.value = Math.max(0, t - tLaunch); S1U.uSrc0.value.copy(exitW); S1U.uSrc1.value.copy(exitW);
    S1U.uSun.value.copy(KEY1); S1U.uViewport.value = RES.vh; S1U.uTEnd.value = 9;
    smoke1.visible = t > tLaunch;
    B1U.uT.value = t; B1U.uViewport.value = RES.vh; B1U.uFireK.value = 0.35;
    glowL.position.copy(exitW).addScaledVector(AX1, -1.2); glowL.color.set('#ffb070'); glowL.intensity = 70 * on * flick;
    for (let i = 0; i < palms.length; i++) palms[i].rotation.z = Math.sin(T * 0.9 + i * 1.3) * 0.006;
    // camera: a low wide frame toward the afterglow; at launch it tilts up after the rocket (the cut is mid-tilt)
    const u = sat(t / cAr);
    S1CAM.getPoint(u, camPos);
    camera.position.copy(camPos);
    const rocketC = nike.group.localToWorld(tmp2.set(0, 4.2, 0));
    const follow = ramp(t, tLaunch + 0.06, cAr + 0.05, ease.inOutSine);
    look.set(-4.4 + t * 0.25, 4.0, -1).lerp(tmp.copy(rocketC).add(V3(-6.5 - 3 * follow, -3 - 6 * follow, 0)), follow * 0.85);
    camera.lookAt(look);
    camera.fov = 32 + 16 * ramp(t, tLaunch, cAr, ease.inOutSine);
    SK.uMode.value = 0; SK.uSun.value.copy(SUN1); SK.uTime.value = t; SK.uGain.value = 1;
    sky.visible = true;
    STU.uOpacity.value = 0.06; STU.uHorizon.value = 3;
    setKey(KEY1, '#ff9a5c', 1.5, V3(0, 3, 0), 22, 120);
    setRim(V3(0.5, 0.35, 0.9), '#7f8fc8', 0.5);
    hemi.color.set('#4a4870'); hemi.groundColor.set('#1a120c'); hemi.intensity = 0.55;
    return ret(camera.position.distanceTo(rocketC), 0, 14, 0.85, 0.62, 1.0, 0.25);
  }

  function shotArya(t, T) {
    const k = t - cAr;
    aryaSpin.rotation.y = k * 0.5;
    arya.group.rotation.y = 0.4 + k * 1.2;
    // camera arcs round the satellite, rising a touch (things drift up the frame: the tilt carries on)
    const a = lerp(0.35, 0.95, ease.inOutSine(sat(k / 0.85)));
    const r = lerp(5.0, 4.4, sat(k / 0.8));
    camera.position.set(Math.sin(a) * r, lerp(0.2, 0.75, ease.outCubic(sat(k / 0.8))), Math.cos(a) * r);
    const side = tmp2.set(Math.cos(a), 0, -Math.sin(a));
    look.set(0, -0.05, 0).addScaledVector(side, -lerp(1.1, 0.7, sat(k / 0.8)));
    camera.lookAt(look);
    camera.fov = 30 - 2 * sat(k / 0.8);
    SU.uMode.value = 1; SU.uSun.value.copy(SUN2); SU.uPC.value.copy(EARTH2); SU.uPR.value = 1.0; SU.uPRot.value.copy(EROT2); SU.uTime.value = t;
    space.visible = true;
    STU.uOpacity.value = 0.6; STU.uHorizon.value = 0;
    setKey(SUN2, '#fff6ea', 3.4, V3(0, 0, 0), 1.6, 20);
    setRim(V3(0, -1, -0.4), '#5f8fe0', 1.2);
    hemi.color.set('#000000'); hemi.groundColor.set('#2c4f8a'); hemi.intensity = 0.7;
    // a sun glint off the cells as a face swings through the mirror angle
    aryaGlint.position.copy(V3(0.3, 0.45, 0.4).applyEuler(aryaSpin.rotation).multiplyScalar(0.95));
    aryaGlint.material.opacity = Math.pow(Math.max(0, Math.sin(k * 4.0 + 0.4)), 12) * 0.8;
    return ret(camera.position.length(), 0, 3, 1, 0.75, 1.02, 0.4);
  }

  function shotPslv(t, T) {
    const y = yP(t);
    pslvG.position.set(0, y, 0);
    pslvG.rotation.z = -0.004 * sat((t - tLift) * 2);
    const ign = ramp(t, tIgn, tIgn + 0.06, ease.outCubic);
    const strapIgn = ramp(t, tIgn + 0.03, tIgn + 0.09, ease.outCubic);
    const flick = 0.88 + 0.12 * Math.sin(T * 97) * Math.sin(T * 41);
    coreCore.visible = coreOut.visible = ign > 0.001;
    coreCore.material.uniforms.uA.value = ign * flick; coreOut.material.uniforms.uA.value = 0.8 * ign * flick;
    coreCore.material.uniforms.uT.value = coreOut.material.uniforms.uT.value = T;
    for (const [c, o] of strapFx) { c.visible = o.visible = strapIgn > 0.001; c.material.uniforms.uA.value = strapIgn * flick; o.material.uniforms.uA.value = 0.8 * strapIgn * flick; c.material.uniforms.uT.value = o.material.uniforms.uT.value = T; }
    const flash = envelope(t, tIgn, tIgn + 0.3, 0.04, 0.26);
    pslvGlow.visible = ign > 0.001; pslvGlow.material.opacity = ign * flick; pslvGlow.scale.setScalar(20 + 22 * flash);
    S3U.uT.value = Math.max(0, t - tLift); S3U.uSrc0.value.set(0, y - 2.0, 0); S3U.uSrc1.value.set(0, y - 2.0, 0);
    S3U.uSun.value.set(0.3, 0.5, 0.8); S3U.uViewport.value = RES.vh; smoke3.visible = t > tLift;
    B3U.uT.value = t; B3U.uViewport.value = RES.vh; B3U.uFireK.value = 0.6 + 0.4 * ign;
    glowL.position.set(0, y - 4, 0); glowL.color.set('#ffa050'); glowL.intensity = 52000 * ign * flick * (1 + flash);
    // camera: low and wide across the pad; a shudder on ignition, then a tilt up with the climb
    const k = sat((t - cPs) / (cC1 - cPs));
    const sh = 0.25 * envelope(t, tIgn, tIgn + 0.5, 0.02, 0.45);
    camera.position.set(lerp(36, 33, k) + Math.sin(T * 73) * sh, 2.6 + Math.sin(T * 61) * sh, lerp(124, 119, k));
    look.set(-15, 19 + Math.max(0, y - 0.6) * 0.75, 0);
    camera.lookAt(look);
    camera.fov = 30 + 2 * k;
    SK.uMode.value = 1; SK.uSun.value.copy(SUN3); SK.uTime.value = t; SK.uGain.value = 1 + 0.5 * ign;
    sky.visible = true;
    STU.uOpacity.value = 0.5; STU.uHorizon.value = 1;
    setKey(V3(0.55, 0.35, 0.75).normalize(), '#dfe8ff', 4.2, V3(0, 20, 0), 40, 220);
    setRim(V3(-0.6, 0.2, -0.7), '#5d78b8', 0.5);
    hemi.color.set('#30406a'); hemi.groundColor.set('#0c0c10'); hemi.intensity = 0.5;
    for (let i = 0; i < lampGlows.length; i++) lampGlows[i].material.opacity = 0.8 + 0.2 * Math.sin(T * 2 + i);
    return ret(camera.position.distanceTo(pslvG.position), 0, 60, 0.85, 0.82, 1.02 + 0.1 * flash, 0.25);
  }

  function shotCh1(t, T) {
    const k = sat((t - cC1) / (cMo - cC1));
    camPos.lerpVectors(C1CAM[0], C1CAM[1], ease.inOutSine(k));
    look.lerpVectors(C1LOOK[0], C1LOOK[1], ease.inOutSine(k));
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 30;
    camera.updateMatrixWorld();
    // the orbiter crosses the frame left → right, 10 m from the lens (its polar orbit runs over the pole)
    const fwd = tmp.subVectors(look, camPos).normalize(), right = tmp2.crossVectors(fwd, V3(0, 1, 0)).normalize(), up = V3().crossVectors(right, fwd);
    ch1Pos.copy(camPos).addScaledVector(fwd, 15).addScaledVector(right, lerp(-8.5, 6.5, k)).addScaledVector(up, 0.6 - 0.3 * k);
    ch1G.position.copy(ch1Pos);
    ch1.group.rotation.y = -0.5 + k * 0.35;
    moon.rotation.y = 0.15 + k * 0.03;
    MW.uWater.value = ramp(t, tC1 + 0.08, tC1 + 0.3); MW.uGain.value = 0.72;
    MW.uScan.value = lerp(-0.6, 0.75, ramp(t, tC1 + 0.05, cMo - 0.05, ease.inOutSine));
    SU.uMode.value = 2; space.visible = true;
    STU.uOpacity.value = 0.8; STU.uHorizon.value = 0;
    setKey(SUN4, '#fff4e8', 3.4, ch1Pos, 6, 40);
    setRim(V3(-0.6, -0.4, -0.5), '#8090b0', 0.35);
    hemi.color.set('#202430'); hemi.groundColor.set('#3a3a3c'); hemi.intensity = 0.45;
    return ret(15, 0, 20, 0.9, 0.72, 1.0, 0.3);
  }

  function shotMom(t, T) {
    const k = sat((t - cMo) / (cC3 - cMo));
    momAt(t, momPos); momG.position.copy(momPos);
    const burn = envelope(t, tMo - 0.06, cC3 - 0.12, 0.06, 0.2);
    const flick = 0.9 + 0.1 * Math.sin(T * 83) * Math.sin(T * 29);
    momCore.visible = momOut.visible = momGlow.visible = burn > 0.001;
    momCore.material.uniforms.uA.value = burn * flick; momOut.material.uniforms.uA.value = 0.7 * burn * flick;
    momCore.material.uniforms.uT.value = momOut.material.uniforms.uT.value = T; momGlow.material.opacity = burn * flick;
    marsBody.rotation.y = 1.2 + t * 0.08;
    // gold orbit draws itself from the spacecraft, forward round the planet, and back
    const dA = ramp(t, tMo + 0.06, cC3 - 0.1, ease.inOutSine);
    orbA.progress = Math.max(0.0001, dA); orbA.opacity = 1;
    // camera: behind, above and to the side of the spacecraft, looking down its path: Mars is the horizon below
    camPos.copy(momPos).addScaledVector(Q5, lerp(-0.78, -0.6, k)).addScaledVector(P5, lerp(0.24, 0.31, k)).addScaledVector(N5, lerp(-0.86, -0.76, k));
    camera.position.copy(camPos);
    look.copy(momPos).addScaledVector(Q5, 0.75 + 0.1 * k).addScaledVector(P5, -0.12).addScaledVector(N5, 0.25);
    camera.up.copy(P5);
    camera.lookAt(look);
    camera.near = 0.01;
    camera.fov = 34 - 2 * k;
    SU.uMode.value = 2; space.visible = true;
    STU.uOpacity.value = 0.9; STU.uHorizon.value = 0;
    setKey(SUN5, '#fff1de', 3.2, momPos, 0.5, 6);
    setRim(tmp2.copy(momPos).normalize().negate(), '#ff9a6a', 0.6);
    hemi.color.set('#101218'); hemi.groundColor.set('#5a2a16'); hemi.intensity = 0.35;
    momG.updateMatrixWorld(true);
    glowL.position.copy(mom.group.localToWorld(tmp2.copy(mom.exit))); glowL.color.set('#ffc890'); glowL.intensity = 0.25 * burn;
    return ret(camPos.distanceTo(momPos), 0, 2, 0.85, 0.68, 0.98, 0.3);
  }

  function shotC3(t, T) {
    // lander: descent, touchdown on the cue, a small settle on the leg dampers
    const alt = altAt(t), u = sat((t - D0) / (tSP - D0));
    const settle = -0.05 * envelope(t, tSP, tSP + 0.4, 0.05, 0.33);
    vikPos.copy(LAND).add(tmp.set(-1.1 * (1 - u) ** 2, alt + settle, 0.4 * (1 - u) ** 2));
    vikG.position.copy(vikPos);
    vikG.rotation.set(0.03 * (1 - u), PSI + 0.06 * (1 - u), -0.02 * (1 - u));
    const eng = t < tSP - 0.02 ? 1 : 0;
    const flick = 0.85 + 0.15 * Math.sin(T * 97) * Math.sin(T * 43);
    for (const c of vikFx) { c.visible = eng > 0; c.material.uniforms.uA.value = flick * 0.8; c.material.uniforms.uT.value = T; }
    vikGlow.visible = eng > 0; vikGlow.material.opacity = flick * (0.5 + 0.5 * sat(1 - alt / 8));
    glowL.position.copy(vikPos).add(tmp.set(0, -0.9, 0)); glowL.color.set('#dfe8ff'); glowL.intensity = 10 * eng * flick;
    D6U.uTime.value = t; D6U.uViewport.value = RES.vh; dust6.visible = t > tC3;
    // ramp unfolds, then the rover rolls out
    const rA = ramp(t, tRamp, tRamp + 0.28, ease.inOutCubic), rB = ramp(t, tRamp + 0.05, tRamp + 0.33, ease.inOutCubic);
    vik.rampA.rotation.z = lerp(Math.PI / 2, -ALPHA, rA);
    vik.rampB.rotation.z = lerp(Math.PI, 0, rB);
    const s = roverS(t);
    pathAt(s + 0.3, roverFront); pathAt(s - 0.3, roverRear);
    roverPos.copy(roverFront).add(roverRear).multiplyScalar(0.5);
    const pitch = Math.atan2(roverFront.y - roverRear.y, Math.hypot(roverFront.x - roverRear.x, roverFront.z - roverRear.z));
    prag.group.position.copy(roverPos);
    if (t < tSP) prag.group.position.y += vikPos.y - LAND.y;
    prag.group.rotation.set(0, PSI, pitch, 'YZX');
    const trackLen = Math.max(0, s - 0.3 - S_FOOT);
    const nSeg = Math.min(tracks.userData.n, Math.floor(trackLen / tracks.userData.step));
    tracks.geometry.setDrawRange(0, nSeg * 12); tracks.visible = nSeg > 0;
    // camera: low on the regolith for the descent, a small shake at touchdown, then a crane up and away
    const cu = timeWarp(t, C6K) / 5;
    C6CAM.getPoint(sat(cu), camPos);
    const sh = t > tSP ? 0.035 * Math.exp(-(t - tSP) * 9) : 0;
    camera.position.copy(camPos).add(tmp.set(Math.sin(T * 71) * sh, Math.sin(T * 53) * sh, 0));
    const lookDescent = tmp.set(0.4, (vikPos.y - LAND.y) * 0.55 + 0.75 + field(0, 0), 0);
    const lookRover = tmp2.copy(roverPos).add(V3(0, 0.35, 0)).lerp(vikPos, 0.35);
    look.copy(lookDescent).lerp(lookRover, ramp(t, tSP + 0.1, tSP + 0.6, ease.inOutSine));
    const away = ramp(t, tSP + 0.75, DUR + 0.1, ease.inQuad);
    look.lerp(tmp.copy(camera.position).addScaledVector(EARTH6, 60).add(V3(0, 6, 0)), away * 0.5);
    camera.lookAt(look);
    camera.fov = 36 - 3 * ramp(t, tC3, tSP) + 6 * away;
    // sky: black, stars, Earth low on the horizon (kept at infinity)
    SU.uMode.value = 2; space.visible = true;
    STU.uOpacity.value = 0.55 + 0.4 * away; STU.uHorizon.value = 1;
    earth6.position.copy(camera.position).addScaledVector(EARTH6, 900);
    setKey(SUN6, '#fff4e6', 6.0, tmp.set(0, field(0, 0), 2), lerp(16, 60, away), 260);
    key.shadow.normalBias = 0.12; key.shadow.bias = -0.0012;
    setRim(V3(0.4, 0.3, -0.8), '#8fa8e0', 0.12);
    hemi.color.set('#0c1222'); hemi.groundColor.set('#4a4640'); hemi.intensity = 0.55;
    return ret(camera.position.distanceTo(vikPos), 0.35 * (1 - away), 4 + 20 * away, 0.6, 0.72, 1.0, 0.1);
  }

  // ---------------------------------------------------------------- HUD
  function updateHud(t, T, shot) {
    for (let i = 0; i < SHOTS.length; i++) {
      const s = SHOTS[i];
      const e = envelope(t, s.t - 0.01, s.end, 0.06, 0.12, ease.linear);
      capMain[i].opacity = e; capMain[i].reveal = ramp(t, s.t, s.t + 0.28, ease.outCubic);
      capSub[i].opacity = e * 0.9; capSub[i].reveal = ramp(t, s.t + 0.08, s.t + 0.42, ease.outCubic);
      if (capTag[i]) { const t0 = s.tagT ?? s.t + 0.2; capTag[i].opacity = e * ramp(t, t0, t0 + 0.12); capTag[i].reveal = ramp(t, t0, t0 + 0.35, ease.outCubic); }
      capIdx[i].opacity = e; capIdx[i].reveal = ramp(t, s.t, s.t + 0.12);
    }
    const on = envelope(t, SHOTS[0].t - 0.02, DUR - 0.25, 0.15, 0.2);
    idxOf.opacity = on * 0.8; idxOf.reveal = ramp(t, SHOTS[0].t, SHOTS[0].t + 0.4);
    rail.progress = ramp(t, SHOTS[0].t - 0.05, SHOTS[0].t + 0.4, ease.outCubic); rail.opacity = on;
    railTicks.progress = ramp(t, SHOTS[0].t, SHOTS[0].t + 0.45); railTicks.opacity = on;
    let pos = 0;
    for (let i = 0; i < SHOTS.length; i++) pos += ramp(t, SHOTS[i].t - 0.12, SHOTS[i].t + 0.08, ease.inOutCubic);
    pos = Math.max(0, pos - 1) / 5;
    railFill.progress = Math.max(0.0001, pos); railFill.opacity = on;
    railDot.position.set(RAIL_X + RAIL_W * pos, RAIL_Y, 0); railDot.material.opacity = on * (0.6 + 0.4 * pulse(T, { decay: 5 }));
    for (const c of CALLS) c.reveal(0, 0);
    if (shot === 1) pin(callArya, tmp.set(0.35, 0.35, 0.2), ramp(t, cAr + 0.15, cAr + 0.45), envelope(t, cAr + 0.12, cPs - 0.03, 0.05, 0.1));
    if (shot === 2) pin(callPslv, tmp.set(1.6, pslvG.position.y + 39.5, 0), ramp(t, tPs + 0.2, tPs + 0.5), envelope(t, tPs + 0.18, cC1 - 0.03, 0.05, 0.1));
    if (shot === 3) moon.updateMatrixWorld();
    if (shot === 3) pin(callWater, moon.localToWorld(tmp.copy(V3(-8, 96, 26).normalize().multiplyScalar(100))), ramp(t, tC1 + 0.35, tC1 + 0.62), envelope(t, tC1 + 0.32, cMo - 0.03, 0.05, 0.1));
    if (shot === 4) pin(callMom, momPos, ramp(t, tMo + 0.2, tMo + 0.5), envelope(t, tMo + 0.18, cC3 - 0.03, 0.05, 0.1));
    if (shot === 5) {
      pin(callVik, tmp.copy(vikPos).add(V3(0.6, 1.2, 0)), ramp(t, tC3 + 0.2, tC3 + 0.5), envelope(t, tC3 + 0.18, tSP + 0.6, 0.05, 0.12));
      pin(callPrag, tmp.copy(roverPos).add(V3(0, 0.55, 0)), ramp(t, tRov0 + 0.15, tRov0 + 0.45), envelope(t, tRov0 + 0.12, DUR - 0.5, 0.05, 0.12));
      pin(callSite, tmp.copy(LAND).add(V3(0, 1.2, 0)), ramp(t, tSP + 0.95, tSP + 1.2), envelope(t, tSP + 0.92, DUR - 0.12, 0.05, 0.1));
    }
  }

  const api = {
    scene, camera, hud,
    get exploreLimits() { return EX_LIM[shotNow] ?? {}; },
    arSubject: (t) => {
      const s = shotOf(t);
      if (s === 0) return { centre: V3(0, 4, -0.5), radius: 7 };
      if (s === 1) return { centre: V3(0, 0, 0), radius: 1.2 };
      if (s === 2) return { centre: V3(0, 24, 0), radius: 32 };
      if (s === 3) return { centre: ch1Pos.clone(), radius: 4 };
      if (s === 4) return { centre: momPos.clone(), radius: 0.45 };
      return { centre: LAND.clone().add(V3(0.8, 0, 0.6)), radius: 3.5 };
    },
    explorePosed(cam) {
      sky.position.copy(cam.position); space.position.copy(cam.position); stars.position.copy(cam.position);
      if (shotNow === 5) {
        earth6.position.copy(cam.position).addScaledVector(EARTH6, 900);
        const gy = field(cam.position.x, cam.position.z) + 0.4;
        if (cam.position.y < gy) { cam.position.y = gy; cam.updateMatrixWorld(); }
      }
      for (const c of CALLS) c.reveal(0, 0);
    },
    dof: { focus: 6, range: 3, amount: 0 },
    bloom: { strength: 0.7 },
    exposure: 1,
    harmony: 1,
    background: 0x000000,
    update(t, info) {
      const T = info.T;
      RES.vh = info.height;
      const shot = shotOf(t);
      shotNow = shot;
      for (let i = 0; i < worlds.length; i++) worlds[i].visible = i === shot;
      sky.visible = false; space.visible = false;
      camera.near = 0.1; camera.far = 3000; camera.up.set(0, 1, 0);
      glowL.intensity = 0; key.shadow.normalBias = 0.03; key.shadow.bias = -0.0004;
      SU.uGain.value = 1; SU.uEarthK.value = 0; SU.uHaze.value = 1; SU.uMoonK.value = 0; SU.uAur.value = 1; SU.uSunK.value = 1;
      const r = [shotThumba, shotArya, shotPslv, shotCh1, shotMom, shotC3][shot](t, T);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      sky.position.copy(camera.position); sky.scale.setScalar(800);
      space.position.copy(camera.position); space.scale.setScalar(800);
      stars.position.copy(camera.position);
      STU.uPix.value = Math.max(1, info.height / 900);
      scene.environmentIntensity = r.envI;
      // cut accents: a short exposure lift across each cut (the eye reads it as one move)
      let cutK = 0;
      for (let i = 0; i < cuts.length; i++) cutK = Math.max(cutK, cutW[i] * envelope(t, cuts[i] - 0.06, cuts[i] + 0.08, 0.06, 0.08, ease.inOutSine));
      // the heroic swell on touchdown
      const swell = 0.12 * envelope(t, tSP - 0.02, tSP + 0.5, 0.03, 0.45);
      api.exposure = r.exposure * (1 + cutK + swell);
      api.bloom.strength = r.bloom + cutK * 0.4 + swell;
      api.harmony = r.harmony;
      api.dof.focus = r.focus; api.dof.range = r.dofRange; api.dof.amount = r.dofAmt;
      updateHud(t, T, shot);
    },
  };
  return api;
}
