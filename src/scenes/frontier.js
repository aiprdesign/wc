// THE NEW FRONTIER (49.5 – 56.0 s) — American achievements 1981 → 2026 and the vision of Mars.
// Technique: one continuous camera journey through seven worlds joined by MATCH CUTS and SPEED RAMPS —
// every hand-over matches shape, direction of motion or colour so the eye carries straight through:
//   49.5  from the knowledge 'flash': the white core of a booster exhaust
//   49.9  SPACE SHUTTLE · 1981 — ascent over a cloud deck, the stack rolls heads-down, the boosters separate
//   50.7  HUBBLE · 1990 — the tank's cylinder becomes the telescope's; the camera glides along it and dives
//         through the open aperture into a Hubble-style deep field of procedural galaxies (four-spike stars)
//   51.5  HUMAN GENOME · 2003 — the hero spiral galaxy's stars flow into the double helix (seen end-on it IS
//         a spiral); a read head sweeps the strand, glyphs scramble and lock into A / C / G / T
//   52.3  JAMES WEBB · 2021 — gold base pair → gold mirror: 18 hexagons, wings swing into place, the
//         five-layer sunshield opens like a fan, a light sweep crosses the primary
//   53.1  MARS · PERSEVERANCE & INGENUITY · 2021 — the helicopter's rotors spool up and it lifts off;
//         the camera tilts up with it …
//   53.9  ARTEMIS — … and the vertical motion carries on into a heavy-lift rocket climbing across a vast Moon
//   54.42 NEXT · THE VISION — a compact 'next steps' story in four fast match cuts:
//         54.42 a crewed interplanetary ship over Earth and Moon; its engines light on the 54.6 cue
//         54.80 fire → fire: the lander's retro-burn tears a sheet of red dust off the Martian plain at dawn
//         (no first-footsteps beat: no human has walked on Mars yet — the landing hands to the outpost)
//         55.10 an outpost grows: habitat domes, a greenhouse glowing green, solar fields, rover tracks,
//               a crane push to the greenhouse at frame centre that hands over ('zoom').
// Worlds share one scene and one set of lights (constant light count → no shader recompiles at the cuts);
// the sky, Earth and Moon are an analytic ray-cast backdrop (pixel-exact limbs, one draw call).
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { segmentsLine } from '../lib/lines.js';
import { glowSprite } from '../lib/materials.js';
import { Callout } from '../lib/hud.js';
import { MorphParticles, Dust } from '../lib/particles.js';
import { GLSL_NOISE } from '../lib/noise.js';
import { buildFlag, bootprintTexture, regolithTextures, terrainGeometry, makeEnv, suitEnv } from './moonshot-assets.js';
import {
  V3, buildShuttle, buildHubble, buildWebb, buildRover, buildIngenuity, buildHeavyLift,
  visionMaterials, buildLander, buildMarsShip, buildAstronaut, buildHabitat, buildDomeFrame, buildGreenhouse, buildCrewRover, buildTracks, makeBlast,
  makeBackdrop, makeStars, makeSmoke, makeDownwash, makeDeepField, buildHelix, helixTargets, spiralGalaxy, buildGlyphs, marsField, HELIX,
} from './frontier-assets.js';

// exhaust plume: open cone pointing down −Y from its apex, additive; optional shock diamonds
function plumeMat(color, intensity, { diamonds = 0, alpha = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uA: { value: alpha }, uT: { value: 0 }, uD: { value: diamonds } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `${GLSL_NOISE}
      uniform vec3 uColor; uniform float uI, uA, uT, uD; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.4);
        float along = 1.0 - vUv.y;
        float n = 0.72 + 0.28 * snoise(vec3(vUv.x * 7.0, along * 6.0 - uT * 26.0, 0.0));
        float dia = uD > 0.0 ? mix(1.0, 0.45 + 0.9 * pow(abs(cos(along * 3.14159 * 7.0)), 6.0), uD) : 1.0;
        float a = facing * pow(1.0 - along, 1.5) * n * dia * uA;
        gl_FragColor = vec4(uColor * uI * (0.5 + 1.2 * (1.0 - along)) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
}
function plume(r0, r1, len, mat) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 28, 1, true); g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}

export function create(ctx, segment) {
  const cue = (n) => CUES[n] - segment.start;
  const tShut = cue('shuttle'), tHub = cue('hubble'), tGen = cue('genome'), tWebb = cue('webb'), tRov = cue('rover'), tArt = cue('artemis'), tMars = cue('marsVision');
  const DUR = segment.end - segment.start;
  const tDive = tHub + 0.44;            // through Hubble's aperture into the deep field
  const tSep = tShut + 0.58;            // booster separation
  const tLift = tRov + 0.3;             // helicopter lift-off
  // the vision: four fast shots; the ship's engines light on the marsVision cue
  // no human has walked on Mars yet: the first-footsteps beat (astronaut + flag) is retired and its
  // window collapses to zero length — the landing hands straight to the (uncrewed) outpost
  const tVis = tMars - 0.18, tIgn = tMars, tEDL = tMars + 0.2, tBase = tMars + 0.5, tStep = tBase;
  const SQ = OUTPUT_ASPECT < 1.5;
  const R = rng(2026);

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.fog = new THREE.Fog(0x000000, 1e5, 2e5);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 3000);

  // ---------------------------------------------------------------- shared lights (constant set)
  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03;
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

  // backdrop + stars (camera-centred)
  const sky = makeBackdrop(); scene.add(sky);
  const SU = sky.userData.u;
  const stars = makeStars(4200); scene.add(stars);
  const worlds = {};
  const mk = (name) => { const g = new THREE.Group(); g.visible = false; scene.add(g); worlds[name] = g; return g; };

  // ================================================================ 1 · ASCENT (1 unit = 10 m)
  const wA = mk('ascent');
  const LEAN = 0.4;
  const AX = V3(-Math.sin(LEAN), Math.cos(LEAN), 0), DN = V3(-Math.cos(LEAN), -Math.sin(LEAN), 0), SIDE = V3(0, 0, 1);
  const stackQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(SIDE, AX, DN));
  const shuttle = buildShuttle();
  const stack = new THREE.Group(); stack.quaternion.copy(stackQ); wA.add(stack);
  stack.add(shuttle.group);
  const srbPlumeMatCore = plumeMat('#fff1d8', 2.4), srbPlumeMatOut = plumeMat('#ffb468', 0.8, { alpha: 0.6 });
  const srbFx = shuttle.srbs.map((s) => {
    const core = plume(0.12, 0.3, 1.6, srbPlumeMatCore); core.position.y = shuttle.srbExit; s.add(core);
    const out = plume(0.17, 0.95, 5.0, srbPlumeMatOut); out.position.y = shuttle.srbExit; s.add(out);
    const glow = glowSprite({ color: '#ffdcae', intensity: 2.2, scale: 1.2 }); glow.position.y = shuttle.srbExit - 0.12; s.add(glow);
    const bsm = glowSprite({ color: '#fff4e2', intensity: 2.2, scale: 0.3 }); bsm.position.y = 4.1; s.add(bsm);
    return { core, out, glow, bsm };
  });
  const ssmeMat = plumeMat('#cfe0ff', 2.6, { diamonds: 0.9 });
  const ssmeFx = shuttle.ssme.map((p) => { const m = plume(0.07, 0.16, 1.1, ssmeMat); m.position.copy(p); shuttle.group.add(m); return m; });
  const ssmeGlow = glowSprite({ color: '#dfe8ff', intensity: 2.2, scale: 0.9 }); ssmeGlow.position.set(0, 0.1, 0.8); shuttle.group.add(ssmeGlow);
  const smokeA = makeSmoke(7000, { t0: -3.2, t1: tSep, seed: 7 }); wA.add(smokeA);
  const SA = smokeA.userData.u;
  SA.uV0.value = 14; SA.uAcc.value = 4; SA.uSpread0.value = 0.12; SA.uSpreadK.value = 0.85; SA.uLife.value = 3.2; SA.uSize.value = 0.95; SA.uHotK.value = 14;
  SA.uAxis.value.copy(AX); SA.uTEnd.value = tSep;
  const srbExitW = [V3(), V3()];
  const SUN_A = V3(0.75, 0.33, 0.58).normalize();
  // camera keys in the stack frame (x: toward camera side, y: thrust axis, z: orbiter side)
  const toW = (x, y, z) => V3(x, y, z).applyQuaternion(stackQ);
  const aCam = new THREE.CatmullRomCurve3([toW(1.7, -1.9, -0.6), toW(4.2, -0.9, 0.2), toW(7.8, 0.7, 1.3), toW(7.2, 2.0, 1.6), toW(4.2, 3.6, 1.3), toW(2.1, 5.2, 0.9)], false, 'centripetal');
  const aLook = new THREE.CatmullRomCurve3([toW(0.6, -1.0, 0.1), toW(0.3, 0.6, 0.2), toW(0, 2.1, 0.3), toW(0, 2.6, 0.35), toW(0, 3.7, 0.3), toW(-0.1, 5.2, 0.2)], false, 'centripetal');
  const aK = [[0, 0], [0.3, 0.14], [0.62, 0.4], [0.95, 0.58], [1.12, 0.84], [1.24, 1]];

  // ================================================================ 2 · ORBIT — Hubble (1 unit = 4 m)
  const wO = mk('orbit');
  const hubble = buildHubble();
  const hub = new THREE.Group(); wO.add(hub); hub.add(hubble.group);
  hub.rotation.set(0.2, -0.55, 0.62);
  hub.updateMatrixWorld();
  const toH = (x, y, z) => V3(x, y, z).applyMatrix4(hub.matrixWorld);
  const oCam = new THREE.CatmullRomCurve3([toH(1.5, 0.45, -2.6), toH(2.9, 1.2, 0.2), toH(3.1, 1.3, 3.2), toH(0.35, 0.12, 4.2), toH(0.02, 0.0, 1.4), toH(0.0, 0.0, 0.2)], false, 'centripetal');
  const oLook = new THREE.CatmullRomCurve3([toH(-0.2, 0, -1.0), toH(0.2, 0.1, 0.0), toH(0.1, 0.05, 0.6), toH(0, 0, 0.8), toH(0, 0, -0.3), toH(0, 0, -1.0)], false, 'centripetal');
  const oK = [[tHub - 0.02, 0], [tHub + 0.12, 0.22], [tHub + 0.25, 0.42], [tHub + 0.35, 0.62], [tDive - 0.02, 0.84], [tDive + 0.06, 1]];
  const SUN_O = V3(0.55, 0.55, 0.62).normalize();
  const EARTH_O = V3(0.05, -1.0, -0.25).normalize().multiplyScalar(1.09);

  // ================================================================ 3 · COSMOS — deep field → galaxy → double helix
  const wC = mk('cosmos');
  const field = makeDeepField(1500); wC.add(field);
  const helix = buildHelix(); wC.add(helix.group);
  const NP = 16000;
  const tgt = helixTargets(NP, helix.pairs);
  const galaxyPos = spiralGalaxy(NP, tgt.col);
  const dna = new MorphParticles({ count: NP, positions: galaxyPos, targets: tgt.pos, colors: tgt.col, size: 0.03, intensity: 1.6, stagger: 0.45, seed: 3 });
  const dnaSpin = new THREE.Group(); dnaSpin.add(dna); wC.add(dnaSpin);
  const glyphs = buildGlyphs(helix.pairs); wC.add(glyphs);
  const GU = glyphs.userData.u;
  const readRing = new THREE.Mesh(new THREE.TorusGeometry(HELIX.R + 0.42, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd08a').multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  wC.add(readRing);
  const readGlow = glowSprite({ color: '#ffd9a0', intensity: 1.4, scale: 2.4 }); wC.add(readGlow);
  const galCore = glowSprite({ color: '#ffe2b8', intensity: 2.2, scale: 2.2 }); wC.add(galCore);
  const cCam = new THREE.CatmullRomCurve3([V3(0.4, 0.3, 40), V3(0.2, 0.2, 22), V3(0, 0.05, 10.5), V3(0.6, 0.3, 8.2), V3(4.6, 1.2, 5.2), V3(6.0, 1.3, 1.0), V3(5.2, 1.05, -1.1), V3(2.2, 0.6, -1.25)], false, 'centripetal');
  const cLook = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0.2), V3(0, 0, 0.2), V3(0, 0, -0.3), V3(0, 0, -0.9), V3(0.1, 0.1, -1.3)], false, 'centripetal');
  const cK = [[tDive - 0.06, 0], [tDive + 0.08, 0.14], [tGen - 0.08, 0.28], [tGen + 0.08, 0.4], [tGen + 0.34, 0.56], [tGen + 0.52, 0.7], [tWebb - 0.16, 0.84], [tWebb + 0.02, 1]];

  // ================================================================ 4 · WEBB (1 unit = 1 m)
  const wW = mk('webb');
  const SPACE_ENV = makeEnv(ctx.renderer, { ground: [0.015, 0.016, 0.02], glowDir: V3(0.1, 1, 0.1), glow: [0.5, 0.45, 0.52] });
  const GOLD_ENV = makeEnv(ctx.renderer, { ground: [0.03, 0.03, 0.035], glowDir: V3(-0.2, 0.05, 1), glow: [1.3, 1.12, 0.9] });
  const webb = buildWebb(SPACE_ENV, GOLD_ENV); wW.add(webb.group);
  const W_MC = V3(0, 4.25, -1.2);
  const wCam = new THREE.CatmullRomCurve3([V3(0.2, 4.4, 4.3), V3(1.2, 4.9, 7.8), V3(4.8, 6.4, 13.5), V3(8.8, 6.6, 14.8), V3(10.6, 6.9, 16.2)], false, 'centripetal');
  const wLook = new THREE.CatmullRomCurve3([V3(0, 4.25, -1.2), V3(0, 4.1, -1.2), V3(0, 3.2, -1.0), V3(0, 1.8, -0.5), V3(0, 1.6, -0.5)], false, 'centripetal');
  const wK = [[tWebb - 0.02, 0], [tWebb + 0.16, 0.2], [tWebb + 0.42, 0.5], [tWebb + 0.68, 0.82], [tRov + 0.05, 1]];
  const SUN_W = V3(0.6, 0.55, 0.75).normalize();

  // ================================================================ 5 & 8–10 · MARS (metres): shared plain; rover site, landing, first steps, outpost
  const wM = mk('mars');
  const mf = marsField();
  const reg = regolithTextures(256, 42);
  const marsMat = new THREE.MeshStandardMaterial({ map: reg.albedo, bumpMap: reg.bump, bumpScale: 1.6, color: '#c77a4c', roughness: 0.95, metalness: 0 });
  reg.albedo.repeat.set(1, 1);
  const terrain = new THREE.Mesh(terrainGeometry(mf, { size: 260, segs: 200, k: 1.7, uvScale: 1 / 3 }), marsMat);
  terrain.receiveShadow = true; wM.add(terrain);
  // explore only: a coarse fogged skirt beyond the 260 m plain, so a pulled-back camera never finds its edge
  const skirt = (() => {
    const geo = new THREE.RingGeometry(122, 420, 96, 14); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), k = Math.min(1, 128 / r);
      p.setY(i, mf(x * k, z * k) - 0.35 + (r - 128) * 0.02 * (1 + 0.6 * Math.sin(x * 0.021 + 1.7) * Math.sin(z * 0.017 - 0.6)));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, marsMat); m.receiveShadow = true; m.visible = false; wM.add(m); return m;
  })();
  const MARS_ENV = makeEnv(ctx.renderer, { ground: [0.35, 0.17, 0.08], glowDir: V3(0, 1, 0), glow: [0.35, 0.25, 0.18] });
  // the outpost is laid out for its closing crane shot: BF = view direction from BCAM, BR = screen right
  const BF = V3(-0.76, 0, -0.65).normalize(), BR = V3(-BF.z, 0, BF.x), BCAM = V3(24, 0, -2);
  const baseAt = (depth, lat) => { const p = V3(BCAM.x + BF.x * depth + BR.x * lat, 0, BCAM.z + BF.z * depth + BR.z * lat); p.y = mf(p.x, p.z); return p; };
  const LANDER = baseAt(52, 12), CARGO = baseAt(74, 30), HAB = baseAt(46, -17), GH = baseAt(29, 0), CROVER = baseAt(21, 10);
  const AST = V3(1.3, 0, -4.4); AST.y = mf(AST.x, AST.z);
  const SOLAR0 = baseAt(40, -34);
  const DOMEF = baseAt(38, 9.5);
  const KEEP_OUT = [[DOMEF, 4.5], [LANDER, 7], [CARGO, 7], [HAB, 7], [V3(8.5, 0, 3.5).applyAxisAngle(V3(0, 1, 0), -0.6).add(HAB), 6], [GH, 7.5], [CROVER, 4], [AST, 2.5]];
  // rocks
  {
    const rockGeo = new THREE.IcosahedronGeometry(1, 2);
    const p = rockGeo.attributes.position, v = V3(), rr = rng(77);
    const bumps = Array.from({ length: 6 }, () => V3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize());
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); let k = 1; bumps.forEach((b, j) => { k -= Math.max(0, v.dot(b) - 0.5) * (0.6 + j * 0.05); }); v.multiplyScalar(k); v.y *= 0.6; p.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
    const rockMat = new THREE.MeshStandardMaterial({ color: '#8f5537', roughness: 0.9, metalness: 0, bumpMap: reg.bump, bumpScale: 2, flatShading: true });
    const N = 260, rocks = new THREE.InstancedMesh(rockGeo, rockMat, N);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = V3(), pos = V3();
    const segD = (x, z, a, b) => { const dx = b.x - a.x, dz = b.z - a.z, u = sat(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - a.x - dx * u, z - a.z - dz * u); };
    let n = 0, tries = 0;
    while (n < N && tries++ < 8000) {
      const x = (rr() - 0.5) * 140, z = (rr() - 0.5) * 140 - 20, size = 0.05 + Math.pow(rr(), 4) * 0.9;
      if (Math.hypot(x, z) < 3.5) continue;                          // helicopter pad
      if (segD(x, z, AST, LANDER) < 2.2 + size * 2) continue;        // boot-print corridor to the lander
      if (Math.hypot(x + 4.8, z + 3.0) < 3) continue;
      if (KEEP_OUT.some(([c, r]) => Math.hypot(x - c.x, z - c.z) < r + size)) continue;
      pos.set(x, mf(x, z) - size * 0.2, z); e.set(rr() * 0.4, rr() * TAU, rr() * 0.4); q.setFromEuler(e); s.set(size * (0.8 + rr() * 0.5), size, size * (0.8 + rr() * 0.5));
      M4.compose(pos, q, s); rocks.setMatrixAt(n++, M4);
    }
    rocks.count = n; rocks.castShadow = true; rocks.receiveShadow = true;
    wM.add(rocks);
  }
  // rover site
  const roverSet = new THREE.Group(); wM.add(roverSet);
  const rover = buildRover(); rover.group.position.set(-4.8, mf(-4.8, -3.0), -3.0); rover.group.rotation.y = 1.1; roverSet.add(rover.group);
  const heli = buildIngenuity(); roverSet.add(heli.group);
  const HELI0 = V3(0, mf(0, 0), 0);
  const wash = makeDownwash(1600); wash.position.copy(HELI0); roverSet.add(wash);
  const SUN_R = V3(-0.62, 0.58, 0.52).normalize();
  const G = (x, y, z) => V3(x, mf(x, z) + y, z);        // height above the Martian ground
  const rCam = new THREE.CatmullRomCurve3([G(1.55, 0.5, 3.7), G(1.35, 0.52, 3.1), G(1.1, 0.62, 2.8), G(0.95, 0.9, 2.9), G(0.9, 1.3, 3.2)], false, 'centripetal');
  const rK = [[tRov - 0.02, 0], [tRov + 0.2, 0.3], [tLift + 0.1, 0.55], [tArt - 0.2, 0.8], [tArt + 0.02, 1]];

  // ---------------------------------------------------------------- the vision on Mars
  const VM = visionMaterials(MARS_ENV);
  const visionSet = new THREE.Group(); wM.add(visionSet);
  const SUN_V = V3(0.22, 0.075, -0.97).normalize();                       // outpost: low raking dawn light
  const SUN_B = V3(0.152, 0.105, -0.983).normalize();                     // landing: peeking past the lander
  const SUN_C = V3(0.496, 0.113, -0.86).normalize();                     // first footsteps: low, right of the flag
  const sunNow = V3();
  const sunDisc = glowSprite({ color: '#fff6ea', intensity: 5, scale: 12 }); sunDisc.material.fog = false; visionSet.add(sunDisc);
  // the crew lander: retro-burn landing, then standing at the head of the boot-print trail
  const lander = buildLander(VM); lander.group.position.copy(LANDER); lander.group.rotation.y = 0.35; visionSet.add(lander.group);
  const retroCore = plumeMat('#fff0d8', 2.6), retroOut = plumeMat('#ff9f5e', 0.9, { alpha: 0.7 });
  const retro = lander.exits.map((p) => {
    const core = plume(0.3, 0.8, 3.2, retroCore), out = plume(0.6, 3.2, 8, retroOut);
    core.position.copy(p); out.position.copy(p); lander.group.add(core, out); return { core, out };
  });
  const retroGlow = glowSprite({ color: '#ffd2a0', intensity: 2.6, scale: 7 }); retroGlow.position.set(0, -0.4, 0); lander.group.add(retroGlow);
  const blast = makeBlast(3400, { t0: tEDL - 1.6, t1: tStep, seed: 31 }); blast.position.copy(LANDER); visionSet.add(blast);
  const BU = blast.userData.u;
  // first footsteps: an astronaut plants the flag at the end of a trail of boot prints from the lander
  const SUIT_ENV = suitEnv(ctx.renderer, { sun: SUN_C, ground: [0.62, 0.36, 0.24], sky: [0.16, 0.12, 0.11], sunCol: [36, 31, 26], haze: [0.6, 0.42, 0.3] });   // the gold visor mirrors the dawn
  const astro = buildAstronaut({ envMap: SUIT_ENV }); astro.group.position.copy(AST); astro.group.rotation.y = Math.PI / 2 - 0.12; visionSet.add(astro.group);
  const flag = buildFlag({ envMap: MARS_ENV });
  const FLAG_L = V3(0.02, 0, 0.44);             // astronaut-local: the pole stands just in front of him, the cloth flies ahead
  flag.position.copy(FLAG_L); flag.rotation.y = -Math.PI / 2 + 0.12; flag.scale.setScalar(0.86); astro.group.add(flag);
  const flagU = flag.userData.clothMat.userData.u;
  const handT = [V3(), V3()], elbowHint = [V3(1, -0.6, -0.2).normalize(), V3(-1, -0.6, -0.2).normalize()];
  // boot prints: alternating steps from the astronaut back to the lander, shaded against the low sun
  const printTex = bootprintTexture();
  const prints = (() => {
    const pts = [], A0 = V3(AST.x, 0, AST.z - 0.55), A1 = V3(LANDER.x, 0, LANDER.z).addScaledVector(V3(AST.x - LANDER.x, 0, AST.z - LANDER.z).normalize(), 6.5);
    const len = A0.distanceTo(A1), n = Math.floor(len / 0.68), dir = V3().subVectors(A0, A1).normalize(), perp = V3(-dir.z, 0, dir.x);
    for (let i = 0; i < n; i++) {
      const u = i / n, wob = Math.sin(u * 7.0 + 0.4) * 0.5 * Math.min(1, u * 4);
      const x = A0.x + (A1.x - A0.x) * u + perp.x * (wob + (i % 2 ? 0.16 : -0.16)), z = A0.z + (A1.z - A0.z) * u + perp.z * (wob + (i % 2 ? 0.16 : -0.16));
      pts.push([x, z, Math.atan2(dir.x, dir.z)]);
    }
    const base = new THREE.PlaneGeometry(1, 1); base.rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const aP = new Float32Array(pts.length * 4);
    pts.forEach(([x, z, w], i) => aP.set([x, mf(x, z) + 0.012, z, w + (R() - 0.5) * 0.1], i * 4));
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4)); g.instanceCount = pts.length;
    const u = { uMap: { value: printTex }, uSun: { value: V3(0, 1, 0) }, uK: { value: 0.75 }, uFogC: { value: new THREE.Color() }, uFogN: { value: 30 }, uFogF: { value: 200 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, fog: false,
      vertexShader: /* glsl */ `attribute vec4 aP; varying vec2 vUv; varying float vD;
        void main(){ float c = cos(aP.w), s = sin(aP.w); vec3 p = position * vec3(0.3, 1.0, 0.6);
          p.xz = mat2(c, -s, s, c) * p.xz; vec4 mv = modelViewMatrix * vec4(p + aP.xyz, 1.0); vD = -mv.z; vUv = uv; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uSun, uFogC; uniform float uK, uFogN, uFogF; varying vec2 vUv; varying float vD;
        void main(){
          vec2 q = vec2(vUv.x, vUv.y);
          vec2 e = vec2(1.0 / 256.0, 1.0 / 512.0) * 2.0;
          float h = -texture2D(uMap, q).r + texture2D(uMap, q).g * 0.4;
          float hx = -texture2D(uMap, q + vec2(e.x, 0.0)).r + texture2D(uMap, q + vec2(e.x, 0.0)).g * 0.4;
          float hy = -texture2D(uMap, q + vec2(0.0, e.y)).r + texture2D(uMap, q + vec2(0.0, e.y)).g * 0.4;
          vec3 n = normalize(vec3(-(hx - h) * 6.0, 1.0, (hy - h) * 6.0));
          float lit = dot(n, normalize(uSun)) - normalize(uSun).y;
          float mask = smoothstep(0.02, 0.2, texture2D(uMap, q).r + texture2D(uMap, q).g);
          vec3 col = lit > 0.0 ? vec3(1.0, 0.72, 0.5) * lit * 1.3 : vec3(0.0);
          float shade = clamp(-lit * 1.2, 0.0, 0.7) + texture2D(uMap, q).r * 0.1;
          float fog = smoothstep(uFogN, uFogF, vD);
          gl_FragColor = vec4(col * (1.0 - fog), mask * max(shade, length(col) * 0.6) * uK * (1.0 - fog));
          if (lit < 0.0) gl_FragColor = vec4(vec3(0.05, 0.02, 0.01), mask * shade * uK * (1.0 - fog));
        }`,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.u = u;
    return mesh;
  })();
  visionSet.add(prints);
  const PU = prints.userData.u;
  const marsDust = new Dust({ count: 700, size: [14, 5, 22], center: [0, 0, 0], color: '#ffc9a0', particleSize: 0.035, opacity: 0.35, intensity: 1.0, seed: 21 });
  visionSet.add(marsDust);
  // the outpost: habitat, greenhouse, crew rover, a second lander, solar fields, rover tracks
  const baseSet = new THREE.Group(); visionSet.add(baseSet);
  const habitat = buildHabitat(VM); habitat.group.position.copy(HAB); habitat.group.rotation.y = -0.6; baseSet.add(habitat.group);
  const beacon = glowSprite({ color: '#ffc46a', intensity: 3, scale: 1.2 }); beacon.position.copy(habitat.beaconPos).applyAxisAngle(V3(0, 1, 0), -0.6).add(HAB); baseSet.add(beacon);
  const green = buildGreenhouse(5.8, VM); green.group.position.copy(GH); green.group.position.y -= 0.1; green.group.rotation.y = 0.3; baseSet.add(green.group);
  const crover = buildCrewRover(VM); crover.group.position.copy(CROVER); crover.group.rotation.y = Math.atan2(-BF.x - BR.x * 0.8, -BF.z - BR.z * 0.8); baseSet.add(crover.group);
  const domeF = buildDomeFrame(3.4, VM); domeF.group.position.copy(DOMEF); domeF.group.position.y -= 0.05; baseSet.add(domeF.group);
  const cargo = buildLander(VM); cargo.group.position.copy(CARGO); cargo.group.rotation.y = 1.1; cargo.group.scale.setScalar(0.95); baseSet.add(cargo.group);
  {
    const panelGeo = new THREE.BoxGeometry(3.4, 0.06, 1.7), postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6);
    const rowsN = 4, colsN = 7, n = rowsN * colsN;
    const panels = new THREE.InstancedMesh(panelGeo, VM.pv, n), posts = new THREE.InstancedMesh(postGeo, VM.dark, n);
    const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = V3(1, 1, 1), p = V3();
    let i = 0;
    for (let r = 0; r < rowsN; r++) for (let c = 0; c < colsN; c++) {
      const x = SOLAR0.x + BR.x * (c * 3.8 - 12) + BF.x * r * 4.2, z = SOLAR0.z + BR.z * (c * 3.8 - 12) + BF.z * r * 4.2, y = mf(x, z);
      e.set(-0.55, Math.atan2(BR.x, BR.z) - Math.PI / 2, 0, 'YXZ'); q.setFromEuler(e);
      M4.compose(p.set(x, y + 1.35, z), q, one); panels.setMatrixAt(i, M4);
      M4.compose(p.set(x, y + 0.65, z), q.identity(), one); posts.setMatrixAt(i, M4); i++;
    }
    panels.castShadow = panels.receiveShadow = true; posts.castShadow = true;
    baseSet.add(panels, posts);
    const tr = (d, l) => { const p = baseAt(d, l); return [p.x, p.z]; };
    const tracks = buildTracks([
      [tr(50, 9), tr(40, 15), tr(30, 16.5), tr(21, 10), tr(14, 4.4), tr(4, -3), tr(-10, -9)],
      [tr(45, -10), tr(37, -9), tr(28, -9.5), tr(20, -7), tr(12, -2), tr(2, 6), tr(-10, 12)],
    ], mf, { width: 0.5, gauge: 2.6 });
    baseSet.add(tracks);
  }
  const CR_DIR = V3(-BF.x - BR.x * 0.8, 0, -BF.z - BR.z * 0.8).normalize();
  const bCam = new THREE.CatmullRomCurve3([baseAt(-2, 3.5).setY(12.5), baseAt(1.5, 2.6).setY(11.2), baseAt(5, 1.6).setY(9.8), baseAt(10, 0.6).setY(8.0)], false, 'centripetal');
  const bLook = new THREE.CatmullRomCurve3([baseAt(36, -1.5).setY(0), baseAt(34, -0.8).setY(0.8), baseAt(31, -0.3).setY(1.8), baseAt(29, 0).setY(2.6)], false, 'centripetal');
  const bK = [[tBase - 0.02, 0], [tBase + 0.2, 0.25], [DUR - 0.5, 0.45], [DUR + 0.02, 1]];
  bCam.points.forEach((p) => { p.y += mf(p.x, p.z); });

  // ================================================================ 7 · THE VOYAGE (metres): a crewed ship leaving Earth and Moon behind
  const wV = mk('voyage');
  const ship = buildMarsShip(visionMaterials(SPACE_ENV));
  // composed from the opening camera's basis: the ship climbs away to the upper right, its plume streaming back
  // toward the lens over a half-lit Earth; the Moon hangs upper left
  const vF0 = V3(20, 2.4, -32.6).normalize(), vR0 = V3().crossVectors(vF0, V3(0, 1, 0)).normalize(), vU0 = V3().crossVectors(vR0, vF0);
  const vDir = (f, r, u) => V3().addScaledVector(vF0, f).addScaledVector(vR0, r).addScaledVector(vU0, u).normalize();
  const SHIP_F = vDir(0.22, 1, 0.26), SHIP_ROLL = 0.9;
  const VCAM0 = V3().addScaledVector(SHIP_F, -8).addScaledVector(vF0, -68).addScaledVector(vU0, -4);
  const shipBase = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), SHIP_F);
  const shipQ = new THREE.Quaternion().setFromAxisAngle(SHIP_F, SHIP_ROLL).multiply(shipBase);
  ship.group.quaternion.copy(shipQ); wV.add(ship.group);
  for (const w of ship.wings) w.rotation.x = 0.45;
  const shipCore = plumeMat('#e4eeff', 2.2, { diamonds: 0.8 }), shipOut = plumeMat('#9fbfff', 0.55, { alpha: 0.7 });
  const shipFx = ship.exits.map((p) => {
    const core = plume(0.45, 1.0, 16, shipCore), out = plume(1.0, 6.5, 55, shipOut);
    core.position.copy(p); out.position.copy(p); ship.group.add(core, out);
    return { core, out };
  });
  const shipGlow = glowSprite({ color: '#dfe9ff', intensity: 1.3, scale: 6 }); shipGlow.position.set(0, -37, 0); ship.group.add(shipGlow);
  const SUN_Y = vDir(0.2, 0.9, 0.4);
  const EARTH_Y = vDir(1, 0.12, -1.0);
  const MOON_Y = vDir(1, -0.36, 0.42);
  const EARTH_ROT = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, 2.2, 0.1)));
  const EARTH_C = V3(-0.022, 0.407, -0.913).normalize();   // Earth in the first-footsteps sky: upper left of the astronaut

  // ================================================================ 6 · ARTEMIS (1 unit = 10 m), night, a vast Moon
  const wR = mk('artemis');
  const sls = buildHeavyLift(); wR.add(sls.group);
  const slsCore = plume(0.16, 0.5, 3.0, plumeMat('#fff0d0', 6.5));
  const slsOut = plume(0.3, 1.6, 9.0, plumeMat('#ffab5c', 2.4, { alpha: 0.8 }));
  sls.group.add(slsCore, slsOut); slsCore.position.y = -0.35; slsOut.position.y = -0.35;
  const slsGlow = glowSprite({ color: '#ffd8a8', intensity: 7, scale: 5.5 }); slsGlow.position.y = -0.8; sls.group.add(slsGlow);
  const smokeR = makeSmoke(5000, { t0: tArt - 3.0, t1: tVis + 0.1, seed: 12 }); wR.add(smokeR);
  const SR = smokeR.userData.u;
  SR.uV0.value = 10; SR.uAcc.value = 16; SR.uSpread0.value = 0.25; SR.uSpreadK.value = 1.6; SR.uLife.value = 2.5; SR.uSize.value = 1.4; SR.uHotK.value = 8; SR.uAxis.value.set(0, 1, 0);
  SR.uTint.value.set('#ffb886');
  const artY = (t) => { const u = t - (tArt - 1.2); return 2 + 6 * u + 9 * u * u; };
  const MOON_DIR = V3(0.03, 0.44, -1).normalize();
  const R_CAM = V3(0, 3.0, 82);

  // ================================================================ HUD (open-matte aware; captions bottom-left, lifted clear of the reel line)
  const hud = ctx.makeHUD();
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const ICE = '#dfe9f7', GOLD = '#f0b445';
  const SHOTS = [
    { t: tShut, end: tHub - 0.06, main: 'SPACE SHUTTLE · 1981', sub: 'STS-1 · COLUMBIA · FIRST FLIGHT 12 APRIL 1981' },
    { t: tHub + 0.02, end: tGen - 0.06, main: 'HUBBLE · 1990', sub: 'SPACE TELESCOPE · DEPLOYED FROM DISCOVERY · STS-31' },
    { t: tGen + 0.02, end: tWebb - 0.06, main: 'HUMAN GENOME · 2003', sub: 'HUMAN GENOME PROJECT · 3 BILLION BASE PAIRS READ' },
    { t: tWebb + 0.02, end: tRov - 0.06, main: 'JAMES WEBB · 2021', sub: '18 GOLD SEGMENTS · 6.5 M PRIMARY · LAUNCHED 25 DEC 2021' },
    { t: tRov + 0.02, end: tArt - 0.06, main: 'MARS · PERSEVERANCE & INGENUITY · 2021', sub: 'JEZERO CRATER · FIRST POWERED FLIGHT ON ANOTHER PLANET' },
    { t: tArt + 0.02, end: tVis - 0.05, main: 'ARTEMIS · RETURNING TO THE MOON', sub: 'CREWED LUNAR EXPLORATION PROGRAM' },
    { t: tVis + 0.02, end: DUR - 0.3 },
  ];
  // captions: one per milestone; the vision (07) carries three short beats under one index
  const CAPS = [...SHOTS.slice(0, 6),
    { t: tVis + 0.02, end: tStep - 0.04, fast: true, main: 'THE VISION · CREWED MISSIONS TO MARS', sub: 'NOT YET FLOWN · THE GOAL FOR THE 2030s AND BEYOND' },
    { t: tStep + 0.01, end: tBase - 0.03, fast: true, main: 'THE VISION · FIRST FOOTSTEPS ON MARS', sub: 'EARTH · A BLUE STAR IN THE MARTIAN DAWN' },
    { t: tBase + 0.01, end: DUR - 0.3, fast: true, main: 'THE VISION · A NEW HOME AMONG THE STARS', sub: 'TOMORROW · HABITATS · GREENHOUSES · POWER' },
  ].filter((c) => c.end > c.t);   // drops the retired first-footsteps caption
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const capMain = CAPS.map((s) => tpLeft(s.main, { font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: '#f3f6fb', intensity: 1.15 }, HX(0.16), HY(-0.78)));
  const capSub = CAPS.map((s) => tpLeft(s.sub, { font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: ICE, intensity: 0.85 }, HX(0.165), HY(-0.838)));
  const capIdx = SHOTS.map((s, i) => tpLeft(`0${i + 1}`, { font: FONTS.mono, weight: 500, height: 0.026 * UI, letterSpacing: 0.2, color: GOLD, intensity: 1.3 }, HX(0.16), HY(-0.715)));
  const idxOf = tpLeft('/ 07  THE NEW FRONTIER', { font: FONTS.mono, weight: 300, height: 0.022 * UI, letterSpacing: 0.3, color: ICE, intensity: 0.75 }, HX(0.16) + 0.06 * UI, HY(-0.715));
  const RAIL_W = 0.95 * UI, RAIL_X = HX(0.16), RAIL_Y = HY(-0.895);
  const rail = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: '#8ea6c6', intensity: 0.55, orderFn: () => 0, stagger: 0 });
  const railTicks = segmentsLine(SHOTS.map((_, i) => { const x = RAIL_X + RAIL_W * i / 6; return [V3(x, RAIL_Y - 0.01 * UI, 0), V3(x, RAIL_Y + 0.01 * UI, 0)]; }), { color: '#cfe0f5', intensity: 0.8, orderFn: (a, b, i) => i / 7, stagger: 0.7 });
  const railFill = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: GOLD, intensity: 1.4, orderFn: () => 0, stagger: 0 });
  const railDot = new THREE.Mesh(new THREE.CircleGeometry(0.009 * UI, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), toneMapped: false, transparent: true }));
  hud.scene.add(rail, railTicks, railFill, railDot);
  // the vision line, centred
  const leap = new TextPlane('The next giant leap.', { font: FONTS.serif, italic: true, weight: 500, height: 0.1 * Math.sqrt(HH), letterSpacing: 0.02, color: '#f6efe4', intensity: 1.1 });
  leap.position.set(0, SQ ? HH * 0.42 : 0.6, 0); leap.opacity = 0; hud.scene.add(leap);
  // callouts pinned to 3D anchors (projected every frame through the delivered lens)
  const CS = 0.03 * UI;
  const callHeli = new Callout('INGENUITY · 1.8 KG', { dx: 0.3 * UI, dy: 0.2 * UI, size: CS, color: ICE, intensity: 1.2, sub: 'FIRST FLIGHT · 19 APRIL 2021' });
  const callRover = new Callout('PERSEVERANCE', { dx: -0.3 * UI, dy: 0.26 * UI, size: CS, color: ICE, intensity: 1.1 });
  const callEarth = new Callout('EARTH', { dx: -0.26 * UI, dy: 0.14 * UI, size: CS, color: ICE, intensity: 1.2, sub: '225 MILLION KM' });
  hud.scene.add(callHeli, callRover, callEarth);

  // ================================================================ animation
  const camPos = V3(), look = V3(), tmp = V3(), tmp2 = V3(), tmp3 = V3(), tmp4 = V3(), UPV = V3(0, 1, 0);
  const heliPos = V3();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv)) * HH, tmp3.z < 0 ? 1 : 0);
    return out;
  };
  const place = (curvePos, curveLook, keys, t, roll = 0, up = null) => {
    const u = sat(timeWarp(t, keys));
    curvePos.getPoint(u, camPos); curveLook.getPoint(u, look);
    camera.position.copy(camPos);
    if (up) camera.up.copy(up); else camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (roll) camera.rotateZ(roll);
    return u;
  };
  const cuts = [tHub, tDive, tWebb, tRov, tArt, tVis, tEDL, tBase];
  const cutW = [0.55, 0.55, 0.55, 0.55, 0.55, 0.2, 0.3, 0.25];      // the vision cuts come fast: lighter accents
  const WORLD_OF = [worlds.ascent, worlds.orbit, worlds.cosmos, worlds.webb, worlds.mars, worlds.artemis, worlds.voyage, worlds.mars, worlds.mars, worlds.mars];
  const WORLD_LIST = Object.values(worlds);
  const shotOf = (t) => (t < tHub ? 0 : t < tDive ? 1 : t < tWebb ? 2 : t < tRov ? 3 : t < tArt ? 4 : t < tVis ? 5 : t < tEDL ? 6 : t < tStep ? 7 : t < tBase ? 8 : 9);
  const upO = V3();
  const RES = { focus: 6, dofAmt: 0, dofRange: 3, harmony: 1, bloom: 0.7, exposure: 1, envI: 0.3 };
  const ret = (focus, dofAmt, dofRange, harmony, bloom, exposure, envI) => {
    RES.focus = focus; RES.dofAmt = dofAmt; RES.dofRange = dofRange; RES.harmony = harmony; RES.bloom = bloom; RES.exposure = exposure; RES.envI = envI;
    return RES;
  };

  // EXPLORE: the backdrop and stars follow the viewer's camera, and on Mars the camera is kept above the ground
  let exploring = false;
  const explorePosed = (cam) => {
    if (!exploring) return;
    if (wM.visible) {
      const gy = mf(cam.position.x, cam.position.z) + 0.5;
      if (cam.position.y < gy) { cam.position.y = gy; cam.updateMatrixWorld(); }
    }
    sky.position.copy(cam.position); stars.position.copy(cam.position);
  };
  let shotNow = 0;
  const EX_LIM = { 2: { zoomIn: 0.6, fly: 1.2 }, 7: { pitchDown: 0.25 }, 9: { fly: 1.6 } };

  const api = {
    scene, camera, hud,
    get exploreLimits() { return EX_LIM[shotNow] ?? {}; },
    explore(t) {
      exploring = true;
      skirt.visible = wM.visible;
      webb.sweep.uSweepK.value = 0;              // the light sweep is a film accent: off while the set is explored
      webb.sweep.uSpecMax.value = 1.4;           // … and a sun glint off the gold from a free angle is capped, so it can't flood the frame
    },
    explorePosed,
    exploreEnd() { exploring = false; skirt.visible = false; },
    dof: { focus: 6, range: 3, amount: 0 },
    bloom: { strength: 0.7 },
    exposure: 1,
    harmony: 1,
    background: 0x000000,
    update(t, info) {
      const T = info.T;
      const shot = shotOf(t);
      shotNow = shot; exploring = false; skirt.visible = false;
      for (let i = 0; i < WORLD_LIST.length; i++) WORLD_LIST[i].visible = false;
      WORLD_OF[shot].visible = true;
      roverSet.visible = shot === 4; visionSet.visible = shot >= 7;
      camera.near = 0.05; camera.far = 3000; camera.fov = 35;
      glowL.intensity = 0;
      scene.fog.near = 1e5; scene.fog.far = 2e5;
      stars.visible = true; stars.material.opacity = 1;
      SU.uGain.value = 1; SU.uEarthK.value = 0; SU.uHaze.value = 1; SU.uMoonK.value = 0; SU.uAur.value = 1; SU.uSunK.value = 1;
      const r = shot === 0 ? this._ascent(t, info) : shot === 1 ? this._orbit(t, info) : shot === 2 ? this._cosmos(t, info) : shot === 3 ? this._webb(t, info)
        : shot === 4 ? this._rover(t, info) : shot === 5 ? this._artemis(t, info) : shot === 6 ? this._voyage(t, info) : this._mars(t, info, shot);
      const { focus, dofAmt, dofRange, harmony, bloom, exposure, envI } = r;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      sky.position.copy(camera.position); sky.scale.setScalar(800);
      stars.position.copy(camera.position);
      SU.uTime.value = t;
      scene.environmentIntensity = envI;
      // cut accents: a short exposure lift across every match cut (the eye reads it as one move)
      let cutK = 0;
      for (let i = 0; i < cuts.length; i++) cutK = Math.max(cutK, cutW[i] * envelope(t, cuts[i] - 0.06, cuts[i] + 0.08, 0.06, 0.08, ease.inOutSine));
      api.exposure = exposure * (1 + cutK);
      api.bloom.strength = bloom + cutK * 0.45;
      api.harmony = harmony;
      api.dof.focus = focus; api.dof.range = dofRange; api.dof.amount = dofAmt;
      this._hud(t, T, shot);
    },

    // ---------------------------------------------------------------- 1 · ascent
    _ascent(t, info) {
      const T = info.T;
      place(aCam, aLook, aK, t);
      camera.fov = 34 + (1 - ramp(t, 0, 0.55, ease.outCubic)) * 14 + ramp(t, 0.95, 1.24, ease.inCubic) * 8;
      SU.uMode.value = 0; SU.uSun.value.copy(SUN_A);
      stars.material.opacity = 0.35;
      setKey(SUN_A, '#fff2df', 3.2, stack.position, 7, 60);
      setRim(tmp.set(-0.8, 0.25, -0.55), '#8fb6ff', 1.2);
      hemi.color.set('#46679e'); hemi.groundColor.set('#1a2231'); hemi.intensity = 0.55;
      // booster separation: they fall behind, drift outward and tumble; their plumes tail off
      const ds = Math.max(0, t - tSep);
      for (let i = 0; i < 2; i++) {
        const s = shuttle.srbs[i];
        const sx = i ? 1 : -1;
        s.position.set(sx * (0.64 + ds * 0.9 + ds * ds * 2.5), -ds * ds * 26 - ds * 2.5, -ds * 0.4);
        s.rotation.set(-ds * 0.3, 0, -sx * ds * 1.6);
        const fx = srbFx[i];
        const on = 1 - ramp(t, tSep - 0.02, tSep + 0.1, ease.outQuad);
        const flick = 0.9 + 0.1 * Math.sin(T * 91 + i * 2) * Math.sin(T * 37);
        fx.core.visible = fx.out.visible = on > 0.01;
        fx.core.material.uniforms.uA.value = on * flick; fx.out.material.uniforms.uA.value = 0.75 * on * flick;
        fx.core.material.uniforms.uT.value = fx.out.material.uniforms.uT.value = T;
        fx.glow.material.opacity = on * flick; fx.glow.scale.setScalar(1.1 + 0.2 * flick);
        const bsm = envelope(t, tSep - 0.01, tSep + 0.09, 0.01, 0.08);
        fx.bsm.material.opacity = bsm; fx.bsm.visible = bsm > 0.01; fx.bsm.scale.setScalar(0.2 + bsm * 0.35);
      }
      ssmeMat.uniforms.uT.value = T; ssmeMat.uniforms.uA.value = 0.85 + 0.15 * Math.sin(T * 60);
      ssmeGlow.material.opacity = 0.9;
      // smoke column from the booster exits
      srbExitW[0].set(-0.64, shuttle.srbExit - 0.1, 0).applyQuaternion(stackQ); srbExitW[1].set(0.64, shuttle.srbExit - 0.1, 0).applyQuaternion(stackQ);
      SA.uSrc0.value.copy(srbExitW[0]); SA.uSrc1.value.copy(srbExitW[1]);
      SA.uT.value = t; SA.uViewport.value = info.height; SA.uSun.value.copy(SUN_A);
      glowL.position.copy(srbExitW[0]).lerp(srbExitW[1], 0.5).addScaledVector(AX, -0.6);
      glowL.color.set('#ffb070'); glowL.intensity = 4 * (1 - ramp(t, tSep, tSep + 0.1));
      // the stack shudders slightly under thrust
      stack.position.set(Math.sin(T * 47) * 0.004, Math.sin(T * 53) * 0.004, 0);
      const f = camera.position.distanceTo(tmp.set(0, 2.4, 0).applyQuaternion(stackQ));
      return ret(f, 0, 4, 0.9, 0.75, 1.0 + (1 - ramp(t, 0.2, 0.5)) * 0.1, 0.35);
    },

    // ---------------------------------------------------------------- 2 · orbit: Hubble
    _orbit(t, info) {
      const T = info.T;
      upO.set(0, 1, 0).applyQuaternion(hub.quaternion).lerp(tmp.set(-0.35, 1, 0.1).normalize(), 0.5).normalize();
      place(oCam, oLook, oK, t, 0, upO);
      camera.fov = 36 + ramp(t, tDive - 0.12, tDive, ease.inCubic) * 18;
      SU.uMode.value = 1; SU.uSun.value.copy(SUN_O); SU.uPC.value.copy(EARTH_O); SU.uPR.value = 1.0;
      SU.uPRot.value.identity();
      setKey(SUN_O, '#fff6ea', 3.2, hub.position, 5, 40);
      setRim(tmp.set(0, -1, 0.2), '#5f8fe0', 1.0);
      hemi.color.set('#000000'); hemi.groundColor.set('#2c4f8a'); hemi.intensity = 0.8;
      hubble.arrays[0].rotation.x = hubble.arrays[1].rotation.x = 0.35 + Math.sin(T * 0.3) * 0.02;
      const f = camera.position.distanceTo(hub.position);
      const inside = ramp(t, tDive - 0.1, tDive, ease.inQuad);
      return ret(Math.max(0.8, f), 0, 3, 1, 0.72, 1 + inside * 0.8, 0.45);
    },

    // ---------------------------------------------------------------- 3 · cosmos: deep field → galaxy → helix
    _cosmos(t, info) {
      const T = info.T;
      const u = place(cCam, cLook, cK, t, -0.42 * ramp(t, tGen + 0.05, tGen + 0.45, ease.inOutSine));
      camera.fov = 40 - ramp(t, tDive, tGen, ease.outCubic) * 6;
      camera.near = 0.02;
      SU.uMode.value = 2;
      stars.material.opacity = 0.5 * (1 - ramp(t, tGen, tGen + 0.3));
      setKey(tmp.set(0.4, 0.8, 0.5).normalize(), '#e2ecff', 2.6, tmp2.set(0, 0, 0), 6, 40);
      setRim(tmp.set(-0.6, -0.2, -0.8), '#ffc27a', 2.2);
      hemi.color.set('#1a2230'); hemi.groundColor.set('#000000'); hemi.intensity = 0.2;
      // deep field: exits into soft bokeh behind the helix
      const fIn = ramp(t, tDive - 0.04, tDive + 0.12);
      field.userData.u.uOpacity.value = fIn * lerp(1, 0.22, ramp(t, tGen, tGen + 0.35));
      // hero galaxy: particles morph into the helix (seen end-on it is a spiral)
      const mix = ramp(t, tGen - 0.02, tGen + 0.42, ease.inOutCubic);
      dna.u.mix = mix; dna.u.noise = 0.02; dna.u.swirl = 0;
      dna.u.opacity = fIn * (1 - 0.65 * ramp(t, tGen + 0.4, tGen + 0.7));
      dna.u.intensity = 1.6 + (1 - mix) * 0.6;
      dna.u.size = lerp(0.045, 0.026, mix);
      dna.tick(t, info);
      dnaSpin.rotation.z = -t * 0.9 + mix * 0.9;
      galCore.material.opacity = fIn * (1 - mix);
      galCore.scale.setScalar(2.4 * (1 - mix * 0.7));
      // solid helix sweeps in behind the particles; the read head locks each base in turn
      const rev = ramp(t, tGen + 0.2, tGen + 0.62, ease.inOutSine);
      helix.u.uReveal.value = lerp(-HELIX.LEN / 2 - 0.2, HELIX.LEN / 2 + 0.3, rev);
      helix.group.visible = rev > 0;
      const rd = ramp(t, tGen + 0.28, tWebb - 0.08, ease.inOutSine);
      GU.uRead.value = lerp(-HELIX.LEN / 2 - 0.4, HELIX.LEN / 2 + 0.2, rd);
      GU.uT.value = T; GU.uOpacity.value = ramp(t, tGen + 0.2, tGen + 0.4);
      GU.uSize.value = 0.21;
      readRing.position.set(0, 0, -GU.uRead.value);
      readRing.material.opacity = envelope(t, tGen + 0.26, tWebb, 0.1, 0.08);
      readRing.visible = readRing.material.opacity > 0.01;
      readGlow.position.copy(readRing.position); readGlow.material.opacity = readRing.material.opacity * 0.5;
      const f = camera.position.length();
      const dofAmt = 0.55 * ramp(t, tGen + 0.1, tGen + 0.4);
      return ret(Math.max(1.5, camera.position.distanceTo(tmp.set(0, 0, 0.3 * (1 - u)))), dofAmt, 2.2, 1, 0.82, 1 + (1 - fIn) * 0.8, 0.5);
    },

    // ---------------------------------------------------------------- 4 · Webb
    _webb(t, info) {
      place(wCam, wLook, wK, t, lerp(0.28, 0, ramp(t, tWebb, tWebb + 0.4, ease.outCubic)));
      camera.fov = 38;
      SU.uMode.value = 2;
      setKey(SUN_W, '#fff0d8', 3.4, tmp2.set(0, 2, 0), 12, 80);
      setRim(tmp.set(-0.8, -0.25, -0.5), '#9fc0ff', 1.0);
      hemi.color.set('#232a38'); hemi.groundColor.set('#0a0a0c'); hemi.intensity = 0.35;
      webb.sweep.uSpecMax.value = 1e4;
      const unfold = ramp(t, tWebb + 0.02, tWebb + 0.34, ease.inOutCubic);
      webb.wings['-1'].rotation.y = -(1 - unfold) * Math.PI / 2;
      webb.wings['1'].rotation.y = (1 - unfold) * Math.PI / 2;
      const k = ramp(t, tWebb + 0.08, tWebb + 0.55, ease.outCubic);
      for (let i = 0; i < webb.layers.length; i++) {
        const L = webb.layers[i];
        const ki = sat(k * 1.15 - i * 0.04);
        L.position.y = -i * 0.32 * ki - 0.02 * i;
        L.scale.set(0.55 + 0.45 * ki, 0.2 + 0.8 * ki, 0.4 + 0.6 * ki);
      }
      // spreader bars ride the corners of the top and bottom membranes
      const L0 = webb.layers[0], L4 = webb.layers[4];
      for (let i = 0; i < webb.spreaders.length; i++) {
        const b = webb.spreaders[i], [cx, cz] = b.userData.c;
        tmp.set(cx * L0.scale.x, L0.position.y - 0.12 * L0.scale.y, cz * L0.scale.z);
        tmp2.set(cx * L4.scale.x, L4.position.y - 0.52 * L4.scale.y, cz * L4.scale.z);
        b.position.copy(tmp); tmp3.subVectors(tmp, tmp2);
        const len = Math.max(0.01, tmp3.length()); b.scale.set(1, len, 1);
        b.quaternion.setFromUnitVectors(UPV, tmp3.divideScalar(len));
      }
      const sw = ramp(t, tWebb + 0.36, tRov - 0.02, ease.inOutSine);
      webb.sweep.uSweep.value = lerp(-6, 7, sw); webb.sweep.uSweepK.value = 0.45 * Math.sin(Math.PI * sw);
      const f = camera.position.distanceTo(W_MC);
      return ret(f, 0.25, f * 0.6, 0.9, 0.75, 1, 0.45);
    },

    // ---------------------------------------------------------------- 5 · Mars: Perseverance + Ingenuity
    _rover(t, info) {
      const T = info.T;
      // helicopter: rotors spool up, it lifts off and climbs, accelerating
      const lift = t < tLift ? 0 : Math.pow((t - tLift) / (tArt - tLift), 1.6) * 3.4;
      heliPos.copy(HELI0); heliPos.y += lift + (t > tLift ? Math.sin((t - tLift) * 9) * 0.01 : 0);
      heli.group.position.copy(heliPos);
      heli.group.rotation.set(0, 0.6 + lift * 0.05, Math.sin(t * 5) * 0.01 * sat(lift));
      const spool = ramp(t, tRov - 0.1, tLift - 0.05, ease.inQuad);
      heli.rotors[0].rotation.y = t * 7.3; heli.rotors[1].rotation.y = -t * 7.3 + 0.8;
      for (let i = 0; i < 2; i++) { const b = heli.blurs[i].material.uniforms; b.uO.value = spool; b.uAng.value = (i ? -1 : 1) * t * 21; }
      wash.userData.u.uT.value = t; wash.userData.u.uK.value = spool * (1 - ramp(t, tLift + 0.3, tArt, ease.inQuad)); wash.userData.u.uViewport.value = info.height;
      // camera: low beside the pad, then tilts up with the climb
      const u = place(rCam, rCam, rK, t);
      look.copy(heliPos).add(tmp.set(-0.75 * (1 - ramp(t, tLift, tArt)), 0.25 + lift * 0.35, -1.4 * (1 - ramp(t, tLift, tArt))));
      camera.lookAt(look);
      camera.fov = 40 - ramp(t, tLift, tArt, ease.inOutSine) * 4;
      SU.uMode.value = 3; SU.uSun.value.copy(SUN_R); SU.uHaze.value = 1;
      stars.visible = false;
      scene.fog.color.set('#9a6446'); scene.fog.near = 30; scene.fog.far = 220;
      setKey(SUN_R, '#ffe6cc', 3.6, tmp2.set(-1.5, 0, -2.5), 9, 60);
      setRim(tmp.set(0.6, 0.3, -0.7), '#ffb27a', 0.5);
      hemi.color.set('#d49a6a'); hemi.groundColor.set('#4e2412'); hemi.intensity = 0.8;
      const f = camera.position.distanceTo(heliPos);
      return ret(f, 0.5 * (1 - ramp(t, tLift + 0.2, tArt)), 1.4 + lift, 0.35, 0.6, 1.0, 0.35);
    },

    // ---------------------------------------------------------------- 6 · Artemis
    _artemis(t, info) {
      const T = info.T;
      const y = artY(t);
      sls.group.position.set(0, y, 0);
      sls.group.rotation.z = -0.03 - ramp(t, tArt, tVis) * 0.03;
      const flick = 0.88 + 0.12 * Math.sin(T * 97) * Math.sin(T * 41);
      slsCore.material.uniforms.uT.value = slsOut.material.uniforms.uT.value = T;
      slsCore.material.uniforms.uA.value = flick; slsOut.material.uniforms.uA.value = 0.8 * flick;
      slsGlow.material.opacity = flick;
      SR.uT.value = t; SR.uViewport.value = info.height; SR.uSun.value.set(0, -1, 0);
      SR.uSrc0.value.set(-0.64, y - 0.5, 0); SR.uSrc1.value.set(0.64, y - 0.5, 0);
      SR.uGain.value = 0.55;
      // long lens from far away: the rocket crosses the face of the Moon; then a push into the lunar limb
      const push = ramp(t, tVis - 0.3, tVis + 0.02, ease.inCubic);
      camera.position.copy(R_CAM);
      tmp.set(0, y + 4.5, 0).sub(R_CAM).normalize().lerp(MOON_DIR, 0.45 + 0.55 * push).normalize();
      look.copy(R_CAM).addScaledVector(tmp, 100);
      camera.lookAt(look);
      camera.fov = lerp(11, 5.2, push);
      SU.uMode.value = 4;
      const moonC = tmp2.copy(MOON_DIR).multiplyScalar(1);
      SU.uPC.value.copy(moonC); SU.uPR.value = 0.105;
      SU.uSun.value.set(0.6, 0.2, 0.8).normalize();
      SU.uPRot.value.identity();
      stars.material.opacity = 0.25;
      setKey(tmp.copy(MOON_DIR).negate().add(tmp4.set(0.3, 0.1, 0)).normalize(), '#c9d6f2', 0.35, sls.group.position, 12, 80);
      setRim(MOON_DIR, '#c9d6f2', 1.4);
      hemi.color.set('#0b1020'); hemi.groundColor.set('#000000'); hemi.intensity = 0.1;
      glowL.position.set(0, y - 1.2, 0); glowL.color.set('#ffb070'); glowL.intensity = 260 * flick;
      return ret(camera.position.distanceTo(sls.group.position), 0, 20, 0.85, 0.78, 1 - push * 0.12, 0.12);
    },

    // ---------------------------------------------------------------- 7 · the voyage: a crewed ship over Earth and Moon; ignition on the cue
    _voyage(t, info) {
      const T = info.T;
      const k = t - tVis, burn = Math.max(0, t - tIgn);
      const ign = ramp(t, tIgn - 0.01, tIgn + 0.05, ease.outCubic);
      const flash = envelope(t, tIgn - 0.01, tIgn + 0.14, 0.02, 0.12);
      ship.group.position.copy(SHIP_F).multiplyScalar(k * 5 + 170 * burn * burn);
      const flick = 0.9 + 0.1 * Math.sin(T * 83) * Math.sin(T * 31);
      shipCore.uniforms.uT.value = shipOut.uniforms.uT.value = T;
      shipCore.uniforms.uA.value = ign * flick; shipOut.uniforms.uA.value = 0.7 * ign * flick;
      for (let i = 0; i < shipFx.length; i++) shipFx[i].core.visible = shipFx[i].out.visible = ign > 0.001;
      shipGlow.visible = ign > 0.001; shipGlow.material.opacity = ign; shipGlow.scale.setScalar(6 + flash * 9);
      // camera: a tracking shot that gives ground as the ship surges toward it, with a short thrust shudder
      const sh = burn > 0 ? 0.06 * Math.exp(-burn * 8) : 0;
      camera.position.copy(VCAM0).addScaledVector(vR0, 6 * k).addScaledVector(vU0, 2 * k).add(tmp2.set(Math.sin(T * 71) * sh, Math.sin(T * 57) * sh, 0));
      look.copy(ship.group.position).addScaledVector(SHIP_F, -14);
      camera.lookAt(look);
      camera.fov = 31 - ramp(t, tVis, tEDL, ease.inOutSine) * 3;
      SU.uMode.value = 1; SU.uSun.value.copy(SUN_Y); SU.uPC.value.copy(EARTH_Y); SU.uPR.value = 0.6;
      SU.uPRot.value.copy(EARTH_ROT);
      SU.uMoonK.value = 1; SU.uMoonDir.value.copy(MOON_Y); SU.uMoonR.value = 0.03;
      stars.material.opacity = 0.8;
      setKey(SUN_Y, '#fff4e6', 3.4, ship.group.position, 45, 160);
      setRim(EARTH_Y, '#6f9be8', 1.1);
      hemi.color.set('#000000'); hemi.groundColor.set('#28497c'); hemi.intensity = 0.5;
      glowL.position.copy(ship.group.position).addScaledVector(SHIP_F, -40);
      glowL.color.set('#cfe0ff'); glowL.intensity = 4000 * ign * flick;
      const f = camera.position.distanceTo(ship.group.position);
      return ret(f, 0, 40, 0.85, 0.75, 1.0 + flash * 0.12, 0.4);
    },

    // ---------------------------------------------------------------- 8–10 · Mars at dawn: landing, first footsteps, the outpost
    _mars(t, info, shot) {
      const T = info.T;
      const land = shot === 7, steps = shot === 8, base = shot === 9;
      baseSet.visible = base; blast.visible = land; astro.group.visible = steps; prints.visible = steps;
      for (let i = 0; i < retro.length; i++) retro[i].core.visible = retro[i].out.visible = land;
      retroGlow.visible = land;
      lander.group.position.copy(LANDER);
      sunNow.copy(land ? SUN_B : steps ? SUN_C : SUN_V);
      SU.uMode.value = 5; SU.uSun.value.copy(sunNow); SU.uEarthDir.value.copy(EARTH_C); SU.uEarthK.value = steps ? 1 : 0;
      stars.material.opacity = 0.3;
      if (steps) { scene.fog.color.set('#4a3028'); scene.fog.near = 30; scene.fog.far = 260; } else { scene.fog.color.set('#6a4636'); scene.fog.near = 20; scene.fog.far = 260; }
      SU.uGain.value = steps ? 0.8 : 1; SU.uAur.value = steps ? 0.5 : 1; SU.uSunK.value = steps ? 0.06 : 1;
      setRim(tmp.copy(sunNow).setY(0.35).normalize(), '#8fb0ff', steps ? 1.1 : 0.7);
      hemi.color.set(steps ? '#6c5048' : '#5a4a5c'); hemi.groundColor.set('#3a170c'); hemi.intensity = steps ? 0.22 : 0.55;
      const r = land ? this._landing(t, info) : steps ? this._steps(t, info) : this._base(t, info);
      camera.updateMatrixWorld();
      sunDisc.position.copy(camera.position).addScaledVector(sunNow, 600); sunDisc.scale.setScalar(steps ? 9 : 18); sunDisc.material.opacity = steps ? 0.7 : 1;
      flagU.uSunV.value.copy(sunNow).transformDirection(camera.matrixWorldInverse);
      flagU.uSunCol.value.set('#ffcf9e').multiplyScalar(key.intensity / Math.PI);
      PU.uSun.value.copy(sunNow); PU.uFogC.value.copy(scene.fog.color); PU.uFogN.value = scene.fog.near; PU.uFogF.value = scene.fog.far;
      beacon.material.opacity = 0.35 + 0.65 * pulse(T, { div: 1, decay: 6 });
      marsDust.tick(t, info);
      return r;
    },
    _landing(t, info) {
      const T = info.T, k = t - tEDL;
      const alt = 4.6 - k * 6.5;
      lander.group.position.y = LANDER.y + alt;
      const flick = 0.88 + 0.12 * Math.sin(T * 97) * Math.sin(T * 43);
      retroCore.uniforms.uT.value = retroOut.uniforms.uT.value = T;
      retroCore.uniforms.uA.value = flick; retroOut.uniforms.uA.value = 0.8 * flick;
      retroGlow.material.opacity = flick;
      BU.uT.value = t; BU.uViewport.value = info.height; BU.uSun.value.copy(SUN_B); BU.uHot.value = 1;
      // low on the plain: a slow push and tilt as the lander settles into its own dust storm
      camera.position.set(LANDER.x - 9, 0, LANDER.z + 25).addScaledVector(tmp.set(0.8, 0, -3.5), k);
      camera.position.y = mf(camera.position.x, camera.position.z) + 1.3 + k * 0.6;
      look.set(LANDER.x, LANDER.y + 4.8 + alt * 0.4, LANDER.z);
      camera.lookAt(look);
      camera.fov = 32 - k * 6;
      setKey(SUN_B, '#ffcf9e', 3.4, LANDER, 30, 120);
      glowL.position.set(LANDER.x, LANDER.y + 0.6, LANDER.z); glowL.color.set('#ffa860'); glowL.intensity = 600 * flick;
      marsDust.position.set(camera.position.x, camera.position.y - 2, camera.position.z - 8);
      const f = camera.position.distanceTo(lander.group.position);
      return ret(f, 0.3, 12, 0.42, 0.78, 1.0, 0.3);
    },
    _steps(t, info) {
      // the pole is driven home; both gloves ride it down (two-bone IK)
      const plant = 1 - ramp(t, tStep - 0.04, tStep + 0.24, ease.outCubic);
      flag.position.set(FLAG_L.x, FLAG_L.y + 0.3 * plant, FLAG_L.z);
      flag.rotation.x = -0.07 * plant;
      handT[0].set(FLAG_L.x + 0.06, 1.0 + 0.3 * plant, FLAG_L.z - 0.04);
      handT[1].set(FLAG_L.x - 0.05, 1.28 + 0.3 * plant, FLAG_L.z - 0.04);
      astro.setArm(0, handT[0], elbowHint[0]); astro.setArm(1, handT[1], elbowHint[1]);
      const u = ramp(t, tStep, tBase + 0.05);
      camera.position.set(AST.x - 0.6 + u * 0.15, 0, AST.z + 6.4 - u * 0.7);
      camera.position.y = mf(camera.position.x, camera.position.z) + 0.55 + u * 0.06;
      look.set(AST.x + 0.6, AST.y + 1.05, AST.z);
      camera.lookAt(look);
      camera.fov = 30;
      setKey(SUN_C, '#ffcf9e', 3.4, tmp2.set(AST.x, AST.y, AST.z - 4), 9, 60);
      marsDust.position.set(AST.x, AST.y - 1, AST.z + 1);
      const f = camera.position.distanceTo(tmp.set(AST.x, AST.y + 1.2, AST.z));
      return ret(f, 0.4, 4, 0.42, 0.6, 1.05, 0.12);
    },
    _base(t, info) {
      place(bCam, bLook, bK, t);
      domeF.grow(0.12 + 0.78 * ramp(t, tBase, tBase + 0.4, ease.inOutSine));      // the outpost grows: a new dome is skinned
      // the crew rover rolls along its tracks toward the lens
      const d = (t - tBase) * 2.2;
      crover.group.position.set(CROVER.x + CR_DIR.x * d, 0, CROVER.z + CR_DIR.z * d);
      crover.group.position.y = mf(crover.group.position.x, crover.group.position.z);
      camera.fov = 34 - ramp(t, tBase, DUR, ease.inOutSine) * 6;
      setKey(SUN_V, '#ffcf9e', 3.4, GH, 48, 200);
      scene.fog.color.set('#6e4a38'); scene.fog.near = 25; scene.fog.far = 240;
      marsDust.position.set(camera.position.x + BF.x * 8, camera.position.y - 3, camera.position.z + BF.z * 8);
      const f = camera.position.distanceTo(GH);
      return ret(f, 0.25 * (1 - ramp(t, DUR - 0.7, DUR - 0.4)), 20, 0.42, 0.7, 1.05, 0.32);
    },

    // ---------------------------------------------------------------- HUD
    _hud(t, T, shot) {
      for (let i = 0; i < CAPS.length; i++) {
        const s = CAPS[i], k = s.fast ? 0.55 : 1;
        const e = envelope(t, s.t - 0.01, s.end, 0.06 * k, 0.12 * k, ease.linear);
        capMain[i].opacity = e; capMain[i].reveal = ramp(t, s.t, s.t + 0.28 * k, ease.outCubic);
        capSub[i].opacity = e * 0.9; capSub[i].reveal = ramp(t, s.t + 0.08 * k, s.t + 0.42 * k, ease.outCubic);
      }
      for (let i = 0; i < SHOTS.length; i++) {
        const s = SHOTS[i];
        capIdx[i].opacity = envelope(t, s.t - 0.01, s.end, 0.06, 0.12, ease.linear); capIdx[i].reveal = ramp(t, s.t, s.t + 0.12);
      }
      const on = envelope(t, tShut - 0.02, DUR - 0.25, 0.15, 0.2);
      idxOf.opacity = on * 0.8; idxOf.reveal = ramp(t, tShut, tShut + 0.4);
      rail.progress = ramp(t, tShut - 0.05, tShut + 0.4, ease.outCubic); rail.opacity = on;
      railTicks.progress = ramp(t, tShut, tShut + 0.45); railTicks.opacity = on;
      let pos = 0;
      for (let i = 0; i < SHOTS.length; i++) pos += ramp(t, SHOTS[i].t - 0.12, SHOTS[i].t + 0.08, ease.inOutCubic);
      pos = Math.max(0, pos - 1) / 6;
      railFill.progress = Math.max(0.0001, pos); railFill.opacity = on;
      railDot.position.set(RAIL_X + RAIL_W * pos, RAIL_Y, 0); railDot.material.opacity = on * (0.6 + 0.4 * pulse(T, { decay: 5 }));
      // vision line
      const lo = envelope(t, tStep + 0.03, DUR - 0.3, 0.1, 0.22);
      leap.opacity = lo; leap.reveal = ramp(t, tStep + 0.03, tStep + 0.36, ease.outCubic);
      // callouts
      if (shot === 4) {
        projHud(tmp.copy(heliPos).add(tmp2.set(0.1, 0.45, 0)), callHeli.position);
        callHeli.position.z = 0;
        callHeli.reveal(ramp(t, tRov + 0.12, tRov + 0.45), envelope(t, tRov + 0.1, tArt - 0.04, 0.05, 0.1));
        projHud(tmp.copy(rover.group.position).add(tmp2.set(0, 2.4, 0)), callRover.position); callRover.position.z = 0;
        callRover.reveal(ramp(t, tRov + 0.2, tRov + 0.5), envelope(t, tRov + 0.18, tLift + 0.2, 0.05, 0.1) * 0.9);
      } else { callHeli.reveal(0, 0); callRover.reveal(0, 0); }
      if (shot === 8) {
        projHud(tmp.copy(camera.position).addScaledVector(EARTH_C, 500), callEarth.position); callEarth.position.z = 0;
        callEarth.reveal(ramp(t, tStep + 0.05, tStep + 0.22), envelope(t, tStep + 0.04, tBase - 0.02, 0.04, 0.05));
      } else callEarth.reveal(0, 0);
    },
  };
  return api;
}
