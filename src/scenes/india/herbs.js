// HERBS & AYURVEDA — the ancient knowledge of spices and healing plants (50.5 – 55.0 s story)
// Morning on the Malabar coast: a carved teak apothecary bench in a walled herb garden above the sea,
// low sun behind the plants (every leaf lit through), one continuous dolly along the bench:
//   garden        +0.0  wide: sunlight through a neem bough over the garden, beds of turmeric and ginger,
//                       a pepper vine on its pole, the tulsi vrindavan; the bench laid out · "AYURVEDA"
//   turmeric      +0.5  rhizomes on a banana leaf, one cut and a few slices glowing orange, a hammered brass
//                       bowl heaped with golden powder · Farmana, an Indus site, c. 2500 BCE
//   gingerPepper  +1.1  ginger 'hands', a cut pepper vine with green and red spikes, a bowl of black
//                       peppercorns · native to the Malabar coast · Ramesses II, 1213 BCE
//   spices        +1.7  the masala dabba: cardamom, cloves, cumin, mustard, fenugreek, turmeric, cinnamon;
//                       a tied bundle of cinnamon quills · cloves came from the Maluku islands by trade
//   tulsiNeem     +2.3  the camera lifts to the tulsi planter (holy basil in flower, a lamp in its niche)
//                       under the neem bough; neem leaves and twigs on the bench
//   ashwagandha   +2.9  dried roots tied on a woven tray, a fresh sprig with red berries in papery husks
//   chyawanprash  +3.4  dark herbal jam in a clay handi, a wooden spoon, amla on a plate, a lit diya ·
//                       a recipe recorded in the Charaka Samhita
//   grinding      +3.9  a granite kharal, the pestle grinding; the palm-leaf manuscript; the camera cranes
//                       up and back over the garden wall to the sea and a dhow — on into the dissolve.
// Offsets are story seconds from the segment start; CUE_NAMES lets the film's timeline override each.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { Dust } from '../../lib/particles.js';
import { Callout } from '../../lib/hud.js';
import { lightShaft, glowSprite } from '../../lib/materials.js';
import * as A from './herbs-assets.js';
import * as S from './herbs-set.js';

// story-relative beat offsets (seconds from the start of the segment)
export const BEATS = { garden: 0.0, turmeric: 0.5, gingerPepper: 1.1, spices: 1.7, tulsiNeem: 2.3, ashwagandha: 2.9, chyawanprash: 3.4, grinding: 3.9 };
// optional global cue names (src/films/india.js CUES) that override the offsets when present
export const CUE_NAMES = { garden: 'herbGarden', turmeric: 'turmeric', gingerPepper: 'blackPepper', spices: 'spiceBox', tulsiNeem: 'tulsi', ashwagandha: 'ashwagandha', chyawanprash: 'chyawanprash', grinding: 'charaka' };

const V3 = A.V3;
const GOLD = '#ffd08a', IVORY = '#fff0d8';
const TOP = S.TABLE.top;
// where each still life sits on the bench (x, z)
const ST = { turmeric: [-1.72, 0.0], pepper: [-1.1, 0.0], spice: [-0.5, -0.02], tulsi: [0.15, 0.0], ashwa: [0.72, -0.02], chyawan: [1.3, 0.0], kharal: [1.9, 0.0] };
const D2R = Math.PI / 180;
const SUN_EL = 20 * D2R, SUN_AZ = 35 * D2R;
const SUN_DIR = V3(-Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL));
const SEA_Y = -9;

export function create(ctx, segment) {
  const beat = (k) => (CUES[CUE_NAMES[k]] !== undefined ? CUES[CUE_NAMES[k]] - segment.start : BEATS[k]);
  const tG = beat('garden'), tTur = beat('turmeric'), tPep = beat('gingerPepper'), tSpi = beat('spices'), tTul = beat('tulsiNeem');
  const tAsh = beat('ashwagandha'), tChy = beat('chyawanprash'), tGri = beat('grinding');
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';
  const L = (full, low) => (lite ? low : full);
  A.LOD.k = lite ? 0.55 : 1;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.FogExp2('#c79a76', 0.018);
  const camera = new THREE.PerspectiveCamera(36, ctx.aspect, 0.02, 3000);
  const R = rng(5055);

  // ---------------------------------------------------------------- helpers
  const add = (geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = 1, { cast = true, receive = true, parent = scene } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
    m.castShadow = cast; m.receiveShadow = receive; parent.add(m); return m;
  };
  const inst = (geo, mat, list, { colors = null, cast = true, receive = true, parent = scene } = {}) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.count = list.length;
    if (colors) colors.forEach((c, i) => im.setColorAt(i, c));
    im.castShadow = cast; im.receiveShadow = receive; im.computeBoundingSphere(); parent.add(im);
    return im;
  };
  const at = (x, y, z, ry = 0, s = 1) => new THREE.Matrix4().compose(V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), V3(s, s, s));
  const col = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);
  const jitterCol = (hex, amt = 0.15) => { const c = new THREE.Color(hex); const k = 1 + (R() - 0.5) * 2 * amt; return c.multiplyScalar(k).offsetHSL((R() - 0.5) * 0.02, 0, 0); };

  // ---------------------------------------------------------------- light
  const key = new THREE.DirectionalLight('#ffc993', 7.5);
  key.position.copy(SUN_DIR).multiplyScalar(20).add(V3(0, 0.8, -0.3));
  key.target.position.set(0, 0.8, -0.3);
  key.castShadow = true; key.shadow.mapSize.set(L(2048, 1024), L(2048, 1024));
  Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 2.6, bottom: -2.6, near: 8, far: 36 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.012;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#c8d4e8', '#8a5a36', 0.32); scene.add(hemi);
  const fill = new THREE.DirectionalLight('#ffdcb4', 0.55); fill.position.set(1.0, 2.2, 4); scene.add(fill);
  const rimL = new THREE.DirectionalLight('#ffd6a8', 0.35); rimL.position.set(4, 1.5, -3); scene.add(rimL);

  // ---------------------------------------------------------------- sky and sea
  const skyU = { uSunDir: { value: SUN_DIR.clone() }, uZen: { value: col('#4d78b8') }, uHor: { value: col('#f2c8a0') }, uSunCol: { value: new THREE.Color(1.0, 0.72, 0.42) }, uHaze: { value: col('#f0c49a') }, uTime: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}\n${S.SKY_GLSL}\nvarying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir)), 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  const seaU = { ...skyU, uFogCol: { value: col('#e8b890') } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.ShaderMaterial({
    uniforms: seaU, fog: false,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}\n${S.SKY_GLSL}
      uniform vec3 uFogCol; varying vec3 vW;
      float rip(vec2 p){ return snoise(vec3(p * vec2(0.08, 0.2), uTime * 0.3)) * 0.5 + snoise(vec3(p * vec2(0.3, 0.7) + 5.0, uTime * 0.6)) * 0.3 + snoise(vec3(p * vec2(1.1, 2.0), uTime)) * 0.2; }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW.xz - cameraPosition.xz);
        float amp = 0.6 / (1.0 + dist * 0.004);
        float e = 0.4, n0 = rip(vW.xz), nx = rip(vW.xz + vec2(e, 0.0)), nz = rip(vW.xz + vec2(0.0, e));
        vec3 N = normalize(vec3(-(nx - n0) / e * amp, 1.0, -(nz - n0) / e * amp));
        vec3 Rf = reflect(V, N); Rf.y = abs(Rf.y) + 0.002;
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 col = mix(vec3(0.03, 0.07, 0.08), skyCol(normalize(Rf)), fres);
        float s = max(dot(normalize(Rf), uSunDir), 0.0);
        col += uSunCol * (pow(s, mix(900.0, 90.0, clamp(dist / 1500.0, 0.0, 1.0))) * 30.0 + pow(s, 30.0) * 0.4);
        col = mix(col, uFogCol, 1.0 - exp(-dist * 0.0011));
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, SEA_Y, -3000 - 14); sea.renderOrder = -5; scene.add(sea);
  // a far headland to the left, hazy
  {
    const N = 160, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = lerp(-1.25, -0.55, u), d = lerp(700, 1100, u);
      const h = 20 + 38 * Math.pow(Math.sin(u * Math.PI), 0.7) + 10 * Math.sin(u * 23) * Math.sin(u * 7) + 6 * Math.sin(u * 61);
      pos.push(Math.sin(a) * d, SEA_Y - 2, -Math.cos(a) * d, Math.sin(a) * d, SEA_Y + h, -Math.cos(a) * d);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color: col('#b8927e'), fog: false, side: THREE.DoubleSide }); m.userData.noDetail = true;
    scene.add(new THREE.Mesh(g, m));
  }
  // the dhows: lateen-rigged trading boats on the morning sea (the spice route)
  const dhowG = S.dhowGeometry();
  const hullMat = new THREE.MeshStandardMaterial({ color: '#3a2a20', roughness: 0.8, side: THREE.DoubleSide });
  const leafMaps = { pin: A.leafMaps('pinnate', 3), neem: A.leafMaps('neem', 5), palm: A.leafMaps('palmate', 7), par: A.leafMaps('parallel', 9), lan: A.leafMaps('lantern', 11) };
  const sailMat = A.leafMaterial({ map: leafMaps.lan.map, color: '#e8d8b8', rough: 0.9, trans: 0.8, flutter: 0 });
  const dhows = [[14, -120, 0.4, 1], [-40, -260, -0.3, 0.9]].map(([x, z, ry, s]) => {
    const g = new THREE.Group(); g.position.set(x, SEA_Y + 0.2, z); g.rotation.y = ry; g.scale.setScalar(s);
    add(dhowG.hull, hullMat, [0, 0, 0], [0, 0, 0], 1, { cast: false, receive: false, parent: g });
    add(dhowG.sail, sailMat, [0, 0, 0], [0, 0, 0], 1, { cast: false, receive: false, parent: g });
    scene.add(g); return { g, x, z };
  });

  // ---------------------------------------------------------------- ground, courtyard, beds, wall
  const groundMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 });
  const groundPatch = (m, dark = 1) => {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vGW;\n${GLSL_NOISE}`).replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 p = vGW.xz;
          float n1 = snoise(vec3(p * 0.3, 1.0)) * 0.5 + 0.5, n2 = snoise(vec3(p * 2.1, 3.0)) * 0.5 + 0.5, n3 = snoise(vec3(p * 8.0, 5.0)) * 0.5 + 0.5;
          vec3 soil = mix(vec3(0.24, 0.11, 0.06), vec3(0.36, 0.18, 0.1), n2);
          vec3 grass = mix(vec3(0.12, 0.16, 0.05), vec3(0.24, 0.27, 0.08), n3);
          float g = smoothstep(0.5, 0.78, n1 * 0.7 + n3 * 0.3) * ${dark < 1 ? '0.15' : '0.85'};
          vec3 c = mix(soil, grass, g);
          float lf = smoothstep(0.78, 0.86, snoise(vec3(p * 13.0, 7.0))); c = mix(c, vec3(0.42, 0.26, 0.1), lf * 0.6);
          diffuseColor.rgb *= c * ${(1.7 * dark).toFixed(2)}; }`);
    };
    m.customProgramCacheKey = () => 'herbGround' + dark;
    return m;
  };
  groundPatch(groundMat);
  const ground = add(new THREE.PlaneGeometry(40, 16, 1, 1).rotateX(-Math.PI / 2), groundMat, [0, -0.002, -1], [0, 0, 0], 1, { cast: false });
  ground.renderOrder = -1;
  const stoneT = S.stoneTexture();
  const flagMat = new THREE.MeshStandardMaterial({ map: stoneT.map, normalMap: stoneT.normalMap, vertexColors: true, roughness: 0.82 });
  add(S.flagstones(R, -4.2, 4.6, -1.55, 3.2), flagMat, [0, 0, 0], [0, 0, 0], 1, { cast: false });
  const lat = S.lateriteTexture();
  const latMat = new THREE.MeshStandardMaterial({ map: lat.map, normalMap: lat.normalMap, vertexColors: true, roughness: 0.95 });
  latMat.userData.noAntiTile = true;
  const bedSoilMat = groundPatch(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), 0.62);
  const BEDS = [[-3.5, -1.95, -3.3, -1.75], [-1.65, -0.35, -3.3, -1.95], [0.95, 2.75, -3.3, -1.75], [-3.4, 3.4, -5.7, -4.3]];
  {
    const blocks = [];
    for (const [x0, x1, z0, z1] of BEDS) {
      blocks.push(...S.blockRun(R, V3(x0, 0, z1), V3(x1, 0, z1), { h: 0.18, d: 0.2, len: 0.38 }), ...S.blockRun(R, V3(x0, 0, z0), V3(x1, 0, z0), { h: 0.18, d: 0.2, len: 0.38 }));
      blocks.push(...S.blockRun(R, V3(x0, 0, z0 + 0.1), V3(x0, 0, z1 - 0.1), { h: 0.18, d: 0.2, len: 0.38 }), ...S.blockRun(R, V3(x1, 0, z0 + 0.1), V3(x1, 0, z1 - 0.1), { h: 0.18, d: 0.2, len: 0.38 }));
      add(new THREE.PlaneGeometry(x1 - x0 - 0.2, z1 - z0 - 0.2).rotateX(-Math.PI / 2), bedSoilMat, [(x0 + x1) / 2, 0.15, (z0 + z1) / 2], [0, 0, 0], 1, { cast: false });
    }
    // the garden wall: five courses of laterite with a lime-plastered coping
    blocks.push(...S.blockRun(R, V3(-9, 0, -6.6), V3(9, 0, -6.6), { h: 0.2, d: 0.34, len: 0.45, courses: 5, jit: 0.01 }));
    add(A.merge(blocks, true), latMat, [0, 0, 0], [0, 0, 0], 1, { cast: true });
    const cope = new THREE.MeshStandardMaterial({ color: '#d8cdb8', roughness: 0.9 });
    add(new THREE.BoxGeometry(18, 0.08, 0.42), cope, [0, 1.04, -6.6], [0, 0, 0], 1, { cast: false });
  }

  // ---------------------------------------------------------------- plants (shared leaf materials)
  const leafGeo = {
    tulsi: A.leafGeometry({ len: 1, width: 0.62, shape: 'ovate', teeth: 9, serr: 0.06, fold: 0.18, curl: -0.08, nl: L(6, 4), nw: 4 }),
    tulsiLo: A.leafGeometry({ len: 1, width: 0.62, shape: 'ovate', fold: 0.18, curl: -0.08, nl: 4, nw: 2 }),
    neem: A.leafGeometry({ len: 1, width: 0.28, shape: 'lance', teeth: 12, serr: 0.18, fold: 0.12, curl: -0.12, sickle: 0.12, nl: L(8, 6), nw: 2 }),
    neemLo: A.leafGeometry({ len: 1, width: 0.28, shape: 'lance', fold: 0.12, curl: -0.12, sickle: 0.12, nl: 4, nw: 2 }),
    pepper: A.leafGeometry({ len: 1, width: 0.78, shape: 'cordate', fold: 0.12, curl: -0.1, nl: L(9, 6), nw: 4 }),
    ashwa: A.leafGeometry({ len: 1, width: 0.55, shape: 'ovate', fold: 0.1, curl: -0.04, nl: 8, nw: 4 }),
    broad: A.leafGeometry({ len: 1, width: 0.36, shape: 'broad', fold: 0.08, curl: -0.35, wave: 0.15, nl: 8, nw: 2 }),
    long: A.leafGeometry({ len: 1, width: 0.16, shape: 'long', fold: 0.1, curl: -0.3, nl: 5, nw: 2 }),
    bush: A.leafGeometry({ len: 1, width: 0.5, shape: 'ovate', fold: 0.2, curl: -0.15, nl: 4, nw: 2 }),
    banana: A.leafGeometry({ len: 1, width: 0.36, shape: 'broad', fold: 0.04, curl: -0.25, wave: 0.12, nl: 12, nw: 4 }),
  };
  const mats = {
    tulsi: A.leafMaterial({ ...leafMaps.pin, rough: 0.5, trans: 1.0, flutter: 0.6 }),
    neem: A.leafMaterial({ ...leafMaps.neem, rough: 0.38, trans: 1.1, flutter: 1.0, sheen: 0.4 }),
    neemFlat: A.leafMaterial({ ...leafMaps.neem, rough: 0.4, trans: 0.6, flutter: 0 }),
    pepper: A.leafMaterial({ ...leafMaps.palm, rough: 0.28, trans: 0.8, flutter: 0.35, sheen: 0.6 }),
    pepperFlat: A.leafMaterial({ ...leafMaps.palm, rough: 0.3, trans: 0.5, flutter: 0, sheen: 0.6 }),
    ashwa: A.leafMaterial({ ...leafMaps.pin, rough: 0.72, trans: 0.6, flutter: 0 }),
    garden: A.leafMaterial({ ...leafMaps.par, rough: 0.5, trans: 1.0, flutter: 0.35 }),
    bush: A.leafMaterial({ ...leafMaps.pin, rough: 0.55, trans: 1.0, flutter: 0.7 }),
    banana: A.leafMaterial({ ...leafMaps.par, rough: 0.4, trans: 1.2, flutter: 0.06 }),
    bananaFlat: A.leafMaterial({ ...leafMaps.par, rough: 0.42, trans: 0.4, flutter: 0, sheen: 0.15, color: '#3a8a18' }),
    husk: A.leafMaterial({ ...leafMaps.lan, rough: 0.8, trans: 1.2, flutter: 0 }),
  };
  const smallT = S.teakSmallMaps();
  const barkMat = new THREE.MeshStandardMaterial({ map: smallT.map, normalMap: smallT.normalMap, color: '#e8dccc', roughness: 0.95 });
  const greenStem = new THREE.MeshStandardMaterial({ color: '#5a7a2c', roughness: 0.6 });
  const woodyStem = new THREE.MeshStandardMaterial({ color: '#6a4a34', roughness: 0.8 });
  const purpleStem = new THREE.MeshStandardMaterial({ color: '#5a3a44', roughness: 0.6 });

  // the tulsi vrindavan and its bush
  const planterMat = new THREE.MeshStandardMaterial({ map: S.planterTexture(), vertexColors: true, roughness: 0.9 });
  const PL = S.PLANTER.pos;
  add(S.planterGeometry(), planterMat, [PL.x, 0, PL.z], [0, 0.12, 0]);
  add(new THREE.CircleGeometry(0.26, 24).rotateX(-Math.PI / 2), bedSoilMat, [PL.x, S.PLANTER.soilY, PL.z], [0, 0, 0], 1, { cast: false });
  const tulsi = S.tulsiPlant(7, { base: V3(PL.x, S.PLANTER.soilY, PL.z), height: 0.58, branches: L(14, 8), nodes: L(9, 6), purple: 0.4 });
  add(tulsi.wood, purpleStem); add(tulsi.spikes, purpleStem, [0, 0, 0], [0, 0, 0], 1, { cast: false });
  const tulsiCol = (l) => new THREE.Color('#5f9a34').lerp(new THREE.Color('#5a3048'), l.purple).multiplyScalar(1.1 + R() * 0.35 + (l.u > 0.8 ? 0.25 : 0));
  inst(leafGeo.tulsi, mats.tulsi, tulsi.leaves.map((l) => l.m), { colors: tulsi.leaves.map(tulsiCol) });
  const floretMat = new THREE.MeshStandardMaterial({ color: '#5a2a66', roughness: 0.7 });
  if (!lite) inst(new THREE.IcosahedronGeometry(0.0016, 0), floretMat, tulsi.florets.map((p) => at(p.x, p.y, p.z)), { cast: false });
  // the lamp in the niche
  const nicheP = V3(0, 0.39, 0.215).applyAxisAngle(V3(0, 1, 0), 0.12).add(V3(PL.x, 0, PL.z));
  const clay = A.clayMaps(5), clayMat = new THREE.MeshStandardMaterial({ map: clay.map, normalMap: clay.normalMap, roughness: 0.85 });
  const diyaG = A.diyaGeometry(), flameG = A.flameGeometry();
  const flameMat = new THREE.MeshBasicMaterial({ color: col('#ffb050', 3.2), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  flameMat.userData.noDetail = true;
  const flames = [];
  const lamp = (p, s = 1) => {
    add(diyaG, clayMat, [p.x, p.y, p.z], [0, 0, 0], s);
    const fx = p.x + 0.054 * s, fy = p.y + 0.024 * s;
    const f = add(flameG, flameMat, [fx, fy, p.z], [0, 0, 0], s, { cast: false, receive: false });
    const g = glowSprite({ color: '#ffa040', intensity: 1.4, scale: 0.14 * s }); g.position.set(fx, fy + 0.014 * s, p.z); g.material.fog = false; scene.add(g);
    const pl = new THREE.PointLight('#ffa050', 0.25 * s, 0.9, 2); pl.position.set(p.x, p.y + 0.06, p.z); scene.add(pl);
    flames.push({ f, g, pl, s, ph: R() * 10 });
  };
  lamp(nicheP.clone().add(V3(-0.035, 0, 0)), 0.7);

  // the neem tree: trunk out at the left, a bough reaching over the bench (it dapples the light), and a canopy
  const neemTrunk = [V3(-3.9, 0, -2.6), V3(-3.8, 1.4, -2.55), V3(-3.65, 2.8, -2.4), V3(-3.5, 4.2, -2.5)];
  add(A.varTube(new THREE.CatmullRomCurve3(neemTrunk), 30, 12, (u, a) => lerp(0.2, 0.12, u) * (1 + 0.08 * Math.sin(a * 4 + u * 12) + 0.05 * Math.sin(a * 9))), barkMat);
  const boughs = [
    S.neemBough(3, { start: V3(-3.65, 2.6, -2.4), ctrl: V3(-1.5, 2.35, -1.2), end: V3(0.75, 1.62, -0.38), leaves: L(44, 26), leafLen: 0.26, r0: 0.07 }),
    S.neemBough(4, { start: V3(-3.6, 3.1, -2.45), ctrl: V3(-2.4, 3.5, -3.0), end: V3(-1.0, 3.1, -3.4), leaves: L(36, 16), leafLen: 0.28, r0: 0.07 }),
    S.neemBough(6, { start: V3(-3.55, 3.7, -2.5), ctrl: V3(-4.2, 4.2, -1.4), end: V3(-4.8, 3.6, -0.4), leaves: L(30, 14), leafLen: 0.28, r0: 0.06 }),
  ];
  const neemGroup = new THREE.Group(); scene.add(neemGroup);
  const neemCol = (l) => new THREE.Color(l.age < 0.12 ? '#93ad3c' : l.age > 0.95 ? '#a89a38' : '#4f8a2a').multiplyScalar(0.8 + R() * 0.35);
  boughs.forEach((b, i) => {
    add(b.wood, barkMat, [0, 0, 0], [0, 0, 0], 1, { parent: neemGroup });
    add(b.rachis, greenStem, [0, 0, 0], [0, 0, 0], 1, { parent: neemGroup });
    inst(i === 0 ? leafGeo.neem : leafGeo.neemLo, mats.neem, b.leaflets.map((l) => l.m), { colors: b.leaflets.map(neemCol), parent: neemGroup });
  });

  // the pepper vine on its pole (a silver-oak stake), fruit spikes hanging
  const PEP = V3(-1.0, 0, -1.62);
  add(A.varTube(new THREE.CatmullRomCurve3([PEP, PEP.clone().add(V3(0.02, 1.3, 0)), PEP.clone().add(V3(-0.02, 2.6, 0.03))]), 16, 9, (u, a) => 0.07 * (1 - u * 0.3) * (1 + 0.05 * Math.sin(a * 5 + u * 30))), barkMat);
  const vine = S.pepperVine(5, { base: PEP, height: 2.45, leaves: L(150, 70), spikes: L(16, 9) });
  add(vine.vine, greenStem);
  inst(leafGeo.pepper, mats.pepper, vine.leaves, { colors: vine.leaves.map(() => jitterCol('#3a7024', 0.2)) });
  const drupeMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const drupeG = new THREE.IcosahedronGeometry(1, L(1, 0));
  const spikeParts = [], drupeM = [], drupeC = [];
  const drupeLoM = [], drupeLoC = [];
  const addSpike = (base, seed, ripe, far = false) => {
    const sp = A.pepperSpike(seed, { n: far ? L(30, 18) : L(44, 26) });
    const g = sp.rachis.clone().applyMatrix4(base); spikeParts.push(g);
    const v = V3();
    for (const d of sp.drupes) {
      v.copy(d.p).applyMatrix4(base);
      const r = 0.0029 * d.s;
      (far ? drupeLoM : drupeM).push(new THREE.Matrix4().compose(v.clone(), new THREE.Quaternion(), V3(r, r, r)));
      const k = sat(ripe * 1.6 - d.u * 0.8 + (R() - 0.5) * 0.3);
      (far ? drupeLoC : drupeC).push(new THREE.Color('#3f6e1a').lerp(new THREE.Color('#c79a1c'), sat(k * 2)).lerp(new THREE.Color('#b01c0c'), sat(k * 2 - 1)));
    }
  };
  vine.spikes.forEach((s, i) => addSpike(s.m, 40 + i, s.ripe * 0.7, true));

  // garden beds: turmeric (broad leaves), ginger (reeds), mixed herbs, bananas at the back corners
  {
    const big = [], gs = [], bushes = [], bushC = [];
    const [ax0, ax1, az0, az1] = BEDS[0];
    for (let i = 0; i < L(14, 8); i++) big.push(...S.clumpLeaves(R, V3(lerp(ax0 + 0.25, ax1 - 0.25, R()), 0.15, lerp(az0 + 0.25, az1 - 0.25, R())), { n: 6, len: [0.4, 0.6], lean: [0.7, 1.4] }));
    const [bx0, bx1, bz0, bz1] = BEDS[1];
    const gingerStemsG = [];
    for (let i = 0; i < L(6, 4); i++) { const g = S.gingerStems(R, V3(lerp(bx0 + 0.3, bx1 - 0.3, R()), 0.15, lerp(bz0 + 0.25, bz1 - 0.25, R())), { n: 6, h: 0.6 }); gingerStemsG.push(g.stems); gs.push(...g.leaves); }
    add(A.merge(gingerStemsG), greenStem);
    const herbSpots = [];
    const [cx0, cx1, cz0, cz1] = BEDS[2];
    for (let i = 0; i < L(14, 7); i++) herbSpots.push(V3(lerp(cx0 + 0.25, cx1 - 0.25, R()), 0.15, lerp(cz0 + 0.25, cz1 - 0.25, R())));
    const [dx0, dx1, dz0, dz1] = BEDS[3];
    for (let i = 0; i < L(26, 10); i++) herbSpots.push(V3(lerp(dx0 + 0.3, dx1 - 0.3, R()), 0.15, lerp(dz0 + 0.25, dz1 - 0.25, R())));
    for (const sp of herbSpots) {
      const tone = ['#4f7a2c', '#5e8a34', '#3f6a2a', '#6a8a3a', '#4a2a3a'][Math.floor(R() * 5)];
      const lv = S.bushLeaves(R, sp, { n: L(30, 16), r: 0.16 + R() * 0.1, h: 0.25 + R() * 0.25, size: [0.08, 0.13] });
      bushes.push(...lv); lv.forEach(() => bushC.push(jitterCol(tone, 0.2)));
    }
    inst(leafGeo.broad, mats.garden, big, { colors: big.map(() => jitterCol('#4f8f30', 0.15)) });
    inst(leafGeo.long, mats.garden, gs, { colors: gs.map(() => jitterCol('#4a7f28', 0.15)) });
    inst(leafGeo.bush, mats.bush, bushes, { colors: bushC });
    const banL = [], banS = [];
    for (const [x, z, sd] of [[-4.6, -3.4, 2], [4.0, -5.9, 3], [-2.6, -6.0, 4]]) { const b = S.bananaPlant(sd, 2.4); banS.push(b.stems.translate(x, 0, z)); b.leaves.forEach((m) => banL.push(m.premultiply(new THREE.Matrix4().makeTranslation(x, 0, z)))); }
    add(A.merge(banS), new THREE.MeshStandardMaterial({ color: '#6a7a3a', roughness: 0.7 }));
    inst(leafGeo.banana, mats.banana, banL, { colors: banL.map(() => jitterCol('#4a8a2a', 0.1)) });
  }
  // coconut palms beyond the wall (on the slope down to the sea) and two in the garden
  {
    const trunks = [], fronds = [];
    const spots = [[-6.5, -9, -3.5, 11], [-2.5, -11, -4.5, 12], [2.0, -9.5, -3.8, 10], [5.8, -12, -5, 13], [8.5, -8.6, -3.2, 10], [-9.5, -10.5, -4.2, 12], [11.5, -10.5, -4, 12], [-13, -9.5, -4, 11]].slice(0, L(8, 5));
    spots.forEach(([x, z, y, h], i) => { const p = S.coconutPalm(60 + i, h); trunks.push(p.trunk.translate(x, y, z)); fronds.push(p.fronds.translate(x, y, z)); });
    add(A.merge(trunks), new THREE.MeshStandardMaterial({ color: '#6a5a48', roughness: 0.9 }), [0, 0, 0], [0, 0, 0], 1, { cast: false });
    const frondMat = A.leafMaterial({ ...leafMaps.par, rough: 0.5, trans: 1.3, flutter: 0, color: '#5a7a2c' });
    add(A.merge(fronds), frondMat, [0, 0, 0], [0, 0, 0], 1, { cast: false });
  }

  // ---------------------------------------------------------------- the bench
  const teak = S.teakMaps(L(2048, 1024), L(400, 200));
  const topMat = new THREE.MeshStandardMaterial({ map: teak.map, normalMap: teak.normalMap, roughnessMap: teak.roughnessMap, roughness: 1, color: '#ffffff' });
  topMat.normalScale.set(0.6, 0.6);
  const tg = S.tableGeometry();
  add(tg.top, topMat);
  const carve = S.carvingMaps();
  const apronMat = new THREE.MeshStandardMaterial({ map: smallT.map, normalMap: carve.normalMap, color: '#c8a890', roughness: 0.6 });
  add(tg.apron, apronMat);
  const legMat = new THREE.MeshStandardMaterial({ map: smallT.map, normalMap: smallT.normalMap, color: '#b89a84', roughness: 0.55 });
  add(tg.legs, legMat);

  // ---------------------------------------------------------------- shared prop materials
  const brass = A.brassMaterial(A.brassMaps(3, { patina: 0.45 }));
  const brass2 = A.brassMaterial(A.brassMaps(8, { patina: 0.25 }));
  const granite = A.graniteMaps(8), graniteMat = new THREE.MeshStandardMaterial({ map: granite.map, normalMap: granite.normalMap, roughness: 0.72 });
  const clayDark = A.clayMaps(9, { base: [120, 58, 34], slip: [40, 22, 16], band: [0.6, 0.8] }), handiMat = new THREE.MeshStandardMaterial({ map: clayDark.map, normalMap: clayDark.normalMap, roughness: 0.6 });
  const skinT = A.skinMaps('turmeric', 2), skinG = A.skinMaps('ginger', 4);
  const turSkin = new THREE.MeshStandardMaterial({ map: skinT.map, normalMap: skinT.normalMap, roughness: 0.78 });
  const ginSkin = new THREE.MeshStandardMaterial({ map: skinG.map, normalMap: skinG.normalMap, roughness: 0.8 });
  const turFlesh = new THREE.MeshStandardMaterial({ map: A.fleshTexture('turmeric', 4), roughness: 0.5, emissive: '#ff5000', emissiveIntensity: 0.22 });
  const ginFlesh = new THREE.MeshStandardMaterial({ map: A.fleshTexture('ginger', 6), roughness: 0.6 });
  const powderMat = new THREE.MeshStandardMaterial({ color: '#f0a018', roughness: 0.96, emissive: '#ff8a00', emissiveIntensity: 0.03 });
  powderMat.userData.detail = { albedo: 0.35, bump: 0.6, scale: 3 };
  const pepperMat = new THREE.MeshStandardMaterial({ color: '#2a1e17', roughness: 0.82 });
  const cardMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const cloveMat = new THREE.MeshStandardMaterial({ color: '#5a2c1a', roughness: 0.6 });
  const cinOut = new THREE.MeshStandardMaterial({ map: skinG.map, normalMap: skinG.normalMap, color: '#8a4a2e', roughness: 0.9 });
  const cinIn = new THREE.MeshStandardMaterial({ color: '#b46a38', roughness: 0.8 });
  const seedMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
  const berryMat = new THREE.MeshPhysicalMaterial({ color: '#c81c08', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.15 });
  const amlaMat = new THREE.MeshPhysicalMaterial({ color: '#c6d88c', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: '#3a4a10', emissiveIntensity: 0.05 });
  const amlaFlesh = new THREE.MeshStandardMaterial({ color: '#e6eebc', roughness: 0.5 });
  const jamMat = new THREE.MeshPhysicalMaterial({ color: '#2a0f06', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
  const pasteMat = new THREE.MeshStandardMaterial({ color: '#7a7a2a', roughness: 0.75 });
  const neemPaste = new THREE.MeshStandardMaterial({ color: '#4a6a22', roughness: 0.7 });
  const spoonMat = new THREE.MeshStandardMaterial({ map: smallT.map, color: '#e0c0a0', roughness: 0.6 });
  const twineMat = new THREE.MeshStandardMaterial({ color: '#b09068', roughness: 0.95 });
  const bowlG = A.lathe(A.PROFILES.bowl, 56), katoriG = A.lathe(A.PROFILES.katori, 40);

  // ---------------------------------------------------------------- turmeric
  {
    const [x, z] = ST.turmeric;
    add(S.bananaLeafPiece(0.5, 0.27, 41), mats.bananaFlat, [x - 0.3, TOP + 0.0015, z - 0.03], [0, 0.12, 0], 1, { cast: false });
    for (const [dx, dz, ry, sd, cut] of [[-0.12, 0.0, 0.4, 1, false], [-0.02, -0.08, -0.5, 2, false], [-0.17, -0.1, 1.9, 3, false], [0.05, 0.05, 0.9, 4, true]]) {
      const r = A.rhizomeGeometry(sd, { kind: 'turmeric', fingers: 4, cut });
      const m = add(r.geometry, turSkin, [x + dx, TOP + 0.002, z + dz], [0, ry, 0]);
      if (r.cap) {
        const disc = new THREE.CircleGeometry(r.cap.r * 1.08, 20);
        const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), r.cap.dir);
        const d = add(disc, turFlesh, [r.cap.pos.x, r.cap.pos.y, r.cap.pos.z], [0, 0, 0], 1, { parent: m });
        d.quaternion.copy(q);
      }
    }
    for (let i = 0; i < 6; i++) {
      const s = add(A.sliceGeometry(0.014 + R() * 0.004, 0.0035, 10 + i), [turFlesh, turSkin], [x + 0.1 + (i % 3) * 0.035 + R() * 0.01, TOP + 0.0005 + (i > 3 ? 0.004 : 0), z + 0.11 + Math.floor(i / 3) * 0.035], [(R() - 0.5) * 0.15, R() * TAU, (R() - 0.5) * 0.15]);
      s.castShadow = true;
    }
    // the brass bowl of powder, a little spilled on the wood
    add(bowlG, brass, [x + 0.16, TOP, z - 0.12], [0, 0.5, 0], 0.95);
    add(A.heapGeometry(0.083, 0.048, 3), powderMat, [x + 0.16, TOP + 0.011, z - 0.12], [0, 0, 0], 1);
    add(A.heapGeometry(0.035, 0.006, 5), powderMat, [x + 0.27, TOP, z - 0.02], [0, 0, 0], [1.3, 1, 0.8], { cast: false });
    add(A.spoonGeometry(0.14), spoonMat, [x + 0.25, TOP, z - 0.05], [0, 2.6, 0]);
  }

  // ---------------------------------------------------------------- ginger and black pepper
  {
    const [x, z] = ST.pepper;
    for (const [dx, dz, ry, sd, cut] of [[-0.14, 0.09, 0.3, 21, false], [-0.04, 0.15, 2.4, 22, true]]) {
      const r = A.rhizomeGeometry(sd, { kind: 'ginger', fingers: 3, cut });
      const m = add(r.geometry, ginSkin, [x + dx, TOP + 0.001, z + dz], [0, ry, 0]);
      if (r.cap) { const d = add(new THREE.CircleGeometry(r.cap.r * 1.05, 20), ginFlesh, [r.cap.pos.x, r.cap.pos.y, r.cap.pos.z], [0, 0, 0], 1, { parent: m }); d.scale.set(1, 0.72, 1); d.quaternion.setFromUnitVectors(V3(0, 0, 1), r.cap.dir); }
    }
    // a cut length of pepper vine on a banana leaf: stem, heart-shaped leaves and four spikes
    add(S.bananaLeafPiece(0.46, 0.25, 43), mats.bananaFlat, [x - 0.2, TOP + 0.0015, z - 0.17], [0, -0.08, 0], 1, { cast: false });
    const vs = [V3(x - 0.18, TOP + 0.008, z - 0.2), V3(x - 0.05, TOP + 0.009, z - 0.14), V3(x + 0.1, TOP + 0.008, z - 0.18), V3(x + 0.2, TOP + 0.007, z - 0.12)];
    add(A.stem(vs, 0.0045, 0.003, 6, 80), greenStem);
    const flatLeaves = [];
    [[0.1, 1, 0.12], [0.32, -1, 0.13], [0.55, 1, 0.115], [0.78, -1, 0.125], [0.95, 1, 0.1]].forEach(([u, s, sz]) => {
      const c = new THREE.CatmullRomCurve3(vs), p = c.getPointAt(u), t = c.getTangentAt(u);
      const d = V3(-t.z * s, 0, t.x * s).add(t.clone().multiplyScalar(0.5)).normalize();
      flatLeaves.push(S.leafMatrix(p.clone().add(V3(0, 0.002, 0)), d.add(V3(0, 0.08, 0)), V3(0, 1, 0), sz, (R() - 0.5) * 0.2));
    });
    inst(leafGeo.pepper, mats.pepperFlat, flatLeaves, { colors: flatLeaves.map(() => jitterCol('#3c7a22', 0.12)) });
    [[0.2, 0.2, 0.15], [0.42, -0.4, 0.9], [0.62, 0.5, 0.4], [0.85, -0.2, 0.05]].forEach(([u, ry, ripe], i) => {
      const c = new THREE.CatmullRomCurve3(vs), p = c.getPointAt(u);
      const m = new THREE.Matrix4().makeRotationY(ry).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.06));
      m.setPosition(p.x, TOP + 0.0045, p.z + 0.012);
      addSpike(m, 70 + i, ripe);
    });
    // the bowl of black peppercorns, a few spilled
    add(bowlG, brass2, [x + 0.13, TOP, z + 0.1], [0, 2.1, 0], 0.82);
    const pcG = A.peppercornGeometry(0.0026, 7);
    const pcs = A.moundMatrices(L(210, 100), { r: 0.062, h: 0.03, y0: 0.012, seed: 9 }).map((m) => m.premultiply(at(x + 0.13, TOP, z + 0.1)));
    for (let i = 0; i < 12; i++) pcs.push(at(x + 0.05 + R() * 0.2, TOP + 0.0024, z + 0.18 + R() * 0.08, R() * TAU));
    inst(pcG, pepperMat, pcs);
  }
  add(A.merge(spikeParts), greenStem, [0, 0, 0], [0, 0, 0], 1);
  inst(drupeG, drupeMat, drupeM, { colors: drupeC });
  inst(new THREE.IcosahedronGeometry(1, 0), drupeMat, drupeLoM, { colors: drupeLoC, cast: false });

  // ---------------------------------------------------------------- the spice box (masala dabba)
  {
    const [x, z] = ST.spice;
    const tin = new THREE.Group(); tin.position.set(x, TOP, z); tin.rotation.y = 0.3; scene.add(tin);
    add(A.lathe(A.PROFILES.tin, 64), brass, [0, 0, 0], [0, 0, 0], 1, { parent: tin });
    const slots = [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * TAU / 6) * 0.101, Math.sin(i * TAU / 6) * 0.101])];
    const ks = 0.93;
    slots.forEach(([sx, sz]) => add(katoriG, brass2, [sx, 0.007, sz], [0, R() * TAU, 0], ks, { parent: tin }));
    const fill = (k, geo, mat, n, opt = {}, colors = null) => {
      const [sx, sz] = slots[k];
      const list = A.moundMatrices(n, { r: 0.038 * ks, h: 0.03, y0: 0.007 + 0.014, seed: 30 + k, ...opt }).map((m) => m.premultiply(new THREE.Matrix4().makeTranslation(sx, 0, sz)));
      return inst(geo, mat, list, { colors: colors ? list.map(() => colors()) : null, parent: tin, cast: false });
    };
    fill(0, A.cardamomGeometry(), cardMat, L(46, 24), { flat: true, h: 0.026 }, () => jitterCol('#8fa65a', 0.15));
    fill(1, A.cloveGeometry(), cloveMat, L(80, 40), { h: 0.028 });
    fill(2, A.cuminGeometry(), seedMat, L(300, 120), { flat: true, h: 0.03 }, () => jitterCol('#7a6040', 0.15));
    fill(3, A.mustardGeometry(), seedMat, L(420, 160), { h: 0.03 }, () => jitterCol('#3a2016', 0.25));
    fill(4, A.fenugreekGeometry(), seedMat, L(280, 120), { h: 0.03 }, () => jitterCol('#c08a34', 0.12));
    add(A.heapGeometry(0.036, 0.024, 7), powderMat, [slots[5][0], 0.007 + 0.013, slots[5][1]], [0, 0, 0], 1, { parent: tin, cast: false });
    // the sixth katori: short pieces of cinnamon quill
    const [cx, cz] = slots[6];
    for (let i = 0; i < L(6, 3); i++) {
      const q = A.cinnamonGeometry(0.045, 0.0045, 50 + i);
      const g = new THREE.Group(); g.position.set(cx + (R() - 0.5) * 0.04, 0.03 + i * 0.004, cz + (R() - 0.5) * 0.03); g.rotation.set((R() - 0.5) * 0.4, R() * TAU, (R() - 0.5) * 0.4); g.position.x -= 0.02;
      add(q.outer, cinOut, [0, 0, 0], [0, 0, 0], 1, { parent: g, cast: false }); add(q.inner, cinIn, [0, 0, 0], [0, 0, 0], 1, { parent: g, cast: false }); tin.add(g);
    }
    // the lid, set down upside-down beside the tin
    add(A.lathe(A.PROFILES.lid, 64), brass, [x + 0.12, TOP + 0.016, z - 0.26], [Math.PI, 0, 0], 0.9);
    // a tied bundle of cinnamon quills, and loose pods and cloves on the wood
    const bundle = new THREE.Group(); bundle.position.set(x + 0.16, TOP, z + 0.18); bundle.rotation.y = 0.35; scene.add(bundle);
    for (let i = 0; i < 5; i++) {
      const q = A.cinnamonGeometry(0.12 + R() * 0.02, 0.0058, 60 + i);
      const g = new THREE.Group(); const a = i * 1.25; g.position.set(-0.06, 0.006 + (i > 2 ? 0.009 : 0) + Math.sin(a) * 0.002, (i % 3 - 1) * 0.011 + Math.cos(a) * 0.002); g.rotation.x = R() * TAU;
      add(q.outer, cinOut, [0, -0.0055, 0], [0, 0, 0], 1, { parent: g }); add(q.inner, cinIn, [0, -0.0055, 0], [0, 0, 0], 1, { parent: g });
      g.position.y += 0.0055; bundle.add(g);
    }
    for (const dx of [-0.02, 0.025]) add(new THREE.TorusGeometry(0.02, 0.0018, 5, 20), twineMat, [dx, 0.012, 0], [0, Math.PI / 2, 0], [1, 0.75, 1], { parent: bundle });
    const loose = [], looseC = [];
    for (let i = 0; i < 9; i++) { loose.push(new THREE.Matrix4().compose(V3(x - 0.14 + R() * 0.2, TOP + 0.0038, z + 0.14 + R() * 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * TAU, 0)), V3(1, 1, 1))); looseC.push(jitterCol('#8fa65a', 0.15)); }
    inst(A.cardamomGeometry(), cardMat, loose, { colors: looseC });
    const lc = []; for (let i = 0; i < 12; i++) lc.push(new THREE.Matrix4().compose(V3(x - 0.18 + R() * 0.3, TOP + 0.0015, z + 0.15 + R() * 0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + (R() - 0.5) * 0.3, R() * TAU, 0)), V3(1, 1, 1)));
    inst(A.cloveGeometry(), cloveMat, lc);
  }

  // ---------------------------------------------------------------- neem on the bench (leaves, twigs, paste)
  {
    const [x, z] = ST.tulsi;
    const lf = [], rach = [];
    for (let k = 0; k < 3; k++) {
      const o = V3(x - 0.12 + k * 0.04, TOP + 0.003 + k * 0.002, z + 0.08 + k * 0.03), ang = -0.3 + k * 0.35, L0 = 0.22;
      const d = V3(Math.cos(ang), 0, -Math.sin(ang)), side = V3(-d.z, 0, d.x);
      rach.push(A.stem([o, o.clone().addScaledVector(d, L0 * 0.5).add(V3(0, 0.002, 0)), o.clone().addScaledVector(d, L0)], 0.0016, 0.0008, 4, 100));
      const n = 11;
      for (let i = 0; i < n; i++) {
        const u = 0.12 + (i / (n - 1)) * 0.86, p = o.clone().addScaledVector(d, L0 * u).add(V3(0, 0.0015, 0)), s = i % 2 ? 1 : -1;
        const ld = i === n - 1 ? d.clone() : side.clone().multiplyScalar(s).addScaledVector(d, 0.5).normalize();
        lf.push(S.leafMatrix(p, ld.add(V3(0, 0.05, 0)), V3(0, 1, 0), 0.05 + 0.015 * Math.sin(Math.PI * u), s * 0.1));
      }
    }
    add(A.merge(rach), greenStem);
    inst(leafGeo.neem, mats.neemFlat, lf, { colors: lf.map(() => jitterCol('#4f8a2a', 0.15)) });
    // datun: neem twigs, a small tied bunch
    const tw = [];
    for (let i = 0; i < 5; i++) tw.push(A.bake(new THREE.CylinderGeometry(0.0042, 0.0048, 0.17 + R() * 0.02, 7), [0, 0.0045 + (i > 2 ? 0.008 : 0), (i % 3 - 1) * 0.0095], [R() * TAU, 0, Math.PI / 2]));
    add(A.merge(tw), woodyStem, [x + 0.17, TOP, z + 0.17], [0, -0.4, 0]);
    add(new THREE.TorusGeometry(0.014, 0.0016, 5, 18), twineMat, [x + 0.17, TOP + 0.009, z + 0.17], [0, -0.4 + Math.PI / 2, 0], [1, 0.8, 1]);
    // a clay saucer of ground neem paste
    add(A.lathe(A.PROFILES.plate, 40), clayMat, [x + 0.04, TOP, z - 0.17], [0, 0, 0], 0.62);
    add(A.heapGeometry(0.05, 0.012, 13), neemPaste, [x + 0.04, TOP + 0.007, z - 0.17], [0, 0, 0], 1, { cast: false });
  }

  // ---------------------------------------------------------------- ashwagandha
  {
    const [x, z] = ST.ashwa;
    const weave = S.weaveMaps(), trayMat = new THREE.MeshStandardMaterial({ map: weave.map, normalMap: weave.normalMap, roughness: 0.85, side: THREE.DoubleSide });
    const tray = S.trayGeometry(0.19);
    add(tray.base, trayMat, [x + 0.02, TOP + 0.001, z - 0.05]); add(tray.rim, trayMat, [x + 0.02, TOP + 0.001, z - 0.05]);
    const roots = A.ashwaRootGeometry(3, L(10, 6));
    const rootMat = new THREE.MeshStandardMaterial({ map: skinG.map, normalMap: skinG.normalMap, color: '#d8c4a0', roughness: 0.9 });
    add(roots.roots, rootMat, [x + 0.02, TOP + 0.006, z - 0.05], [0, 0.5, 0], 1.15);
    add(roots.twine, twineMat, [x + 0.02, TOP + 0.006, z - 0.05], [0, 0.5, 0], 1.15);
    // the fresh sprig: a stem, soft leaves, husks (some opened on their red berries)
    const sp = [V3(x - 0.16, TOP + 0.004, z + 0.2), V3(x - 0.05, TOP + 0.006, z + 0.17), V3(x + 0.06, TOP + 0.006, z + 0.2), V3(x + 0.14, TOP + 0.005, z + 0.16)];
    add(A.stem(sp, 0.0032, 0.0018, 6, 80), greenStem);
    const c = new THREE.CatmullRomCurve3(sp), lv = [], husksC = [], husksO = [], berries = [];
    for (let i = 0; i < 7; i++) {
      const u = 0.08 + i * 0.13, p = c.getPointAt(u), t = c.getTangentAt(u), s = i % 2 ? 1 : -1;
      const d = V3(-t.z * s, 0, t.x * s).addScaledVector(t, 0.4).normalize();
      lv.push(S.leafMatrix(p.clone().add(V3(0, 0.003, 0)), d.add(V3(0, 0.06, 0)), V3(0, 1, 0), 0.06 + R() * 0.02, s * 0.1));
      // husks hang in the leaf axils
      const hp = p.clone().addScaledVector(V3(-t.z * -s, 0, t.x * -s), 0.012).add(V3(0, 0.008, 0));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 * (0.8 + R() * 0.3), R() * TAU, 0));
      const open = i % 3 === 1;
      (open ? husksO : husksC).push(new THREE.Matrix4().compose(hp, q, V3(1, 1, 1)));
      if (open) { const bp = V3(0, 0.0075, 0).applyQuaternion(q).add(hp); berries.push(new THREE.Matrix4().compose(bp, new THREE.Quaternion(), V3(0.0052, 0.0052, 0.0052))); }
    }
    for (let i = 0; i < 4; i++) berries.push(new THREE.Matrix4().compose(V3(x + 0.02 + R() * 0.12, TOP + 0.005, z + 0.25 + R() * 0.05), new THREE.Quaternion(), V3(0.0052, 0.0052, 0.0052)));
    for (let i = 0; i < 2; i++) husksC.push(new THREE.Matrix4().compose(V3(x - 0.1 + R() * 0.06, TOP + 0.007, z + 0.27), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, R() * TAU, 0)), V3(1, 1, 1)));
    inst(leafGeo.ashwa, mats.ashwa, lv, { colors: lv.map(() => jitterCol('#6b8a48', 0.12)) });
    inst(A.huskGeometry(false), mats.husk, husksC, { colors: husksC.map((_, i) => new THREE.Color(i % 2 ? '#c8b07a' : '#a8b070')) });
    inst(A.huskGeometry(true), mats.husk, husksO, { colors: husksO.map(() => new THREE.Color('#d8bc84')) });
    inst(new THREE.SphereGeometry(1, 14, 10), berryMat, berries);
  }

  // ---------------------------------------------------------------- chyawanprash and amla
  {
    const [x, z] = ST.chyawan;
    add(A.lathe(A.PROFILES.handi, 56), handiMat, [x - 0.02, TOP, z - 0.08], [0, 0.7, 0], 1);
    // the jam: a glossy dark surface with a soft swirl, just below the rim
    const jam = A.gridSurf((u, v, p) => { const a = u * TAU, r = v * 0.07; p.set(Math.cos(a) * r, 0.003 * Math.sin(a * 3 + r * 120) * v + 0.004 * (1 - v * v), Math.sin(a) * r); }, 36, 8, true);
    add(jam, jamMat, [x - 0.02, TOP + 0.138, z - 0.08], [0, 0, 0], 1, { cast: false });
    const spoon = add(A.spoonGeometry(0.2), spoonMat, [x - 0.17, TOP + 0.13, z - 0.06], [0, -0.15, -0.38]);
    // amla on a clay plate; one cut in half
    add(A.lathe(A.PROFILES.plate, 48), clayMat, [x + 0.17, TOP, z + 0.12], [0, 0, 0], 1.0);
    const amG = A.amlaGeometry(0.0145), am = [];
    for (const [dx, dz] of [[0, 0], [0.03, 0.018], [-0.028, 0.02], [0.012, -0.03], [-0.034, -0.016], [0.04, -0.016]]) am.push(new THREE.Matrix4().compose(V3(x + 0.17 + dx, TOP + 0.024, z + 0.12 + dz), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * TAU, (R() - 0.5) * 0.4)), V3(1, 1, 1)));
    am.push(new THREE.Matrix4().compose(V3(x + 0.17, TOP + 0.05, z + 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.4, 0.1)), V3(1, 1, 1)));
    am.push(new THREE.Matrix4().compose(V3(x + 0.04, TOP + 0.0135, z + 0.2), new THREE.Quaternion(), V3(1, 1, 1)));
    inst(amG, amlaMat, am);
    // one fruit cut in half: a cut face up (six pale segments round the stone), the other half dome-up
    const halfG = new THREE.SphereGeometry(0.0145, 24, 10, 0, TAU, 0, Math.PI / 2);
    add(halfG, amlaMat, [x + 0.08, TOP + 0.0145, z + 0.235], [Math.PI, 0, 0]);
    const segTex = (() => { const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N; const g2 = cv.getContext('2d');
      g2.fillStyle = '#eef2c4'; g2.fillRect(0, 0, N, N); g2.strokeStyle = 'rgba(150,170,80,0.7)'; g2.lineWidth = 2;
      for (let k = 0; k < 6; k++) { const a2 = k * TAU / 6; g2.beginPath(); g2.moveTo(N / 2, N / 2); g2.lineTo(N / 2 + Math.cos(a2) * N / 2, N / 2 + Math.sin(a2) * N / 2); g2.stroke(); }
      g2.beginPath(); g2.arc(N / 2, N / 2, N * 0.16, 0, TAU); g2.fillStyle = '#b8a070'; g2.fill();
      g2.beginPath(); g2.arc(N / 2, N / 2, N * 0.49, 0, TAU); g2.lineWidth = 3; g2.strokeStyle = '#a8bc60'; g2.stroke();
      const tx2 = new THREE.CanvasTexture(cv); tx2.colorSpace = THREE.SRGBColorSpace; return tx2; })();
    amlaFlesh.map = segTex;
    add(new THREE.CircleGeometry(0.0144, 24).rotateX(-Math.PI / 2), amlaFlesh, [x + 0.08, TOP + 0.0146, z + 0.235], [0, 0, 0], 1, { cast: false });
    add(halfG, amlaMat, [x + 0.112, TOP, z + 0.25], [0, 0, 0]);
    // a small clay dish with a spoonful of the jam, where the camera can read it
    add(A.lathe(A.PROFILES.plate, 40), clayMat, [x - 0.06, TOP, z + 0.13], [0, 0, 0], 0.5);
    const dollop = A.gridSurf((u, v, p) => { const a = u * TAU, r = v * 0.034; p.set(Math.cos(a) * r * (1 + 0.08 * Math.sin(a * 3)), 0.016 * Math.pow(1 - v * v, 1.2) * (1 + 0.15 * Math.sin(a * 2 + v * 5)), Math.sin(a) * r); }, 32, 8, true);
    add(dollop, jamMat, [x - 0.06, TOP + 0.006, z + 0.13], [0, 0, 0], 1, { cast: true });
    // a lit diya beside the jar
    lamp(V3(x - 0.17, TOP, z + 0.17), 1);
    // a small brass pot of ghee, its lid off
    add(A.lathe(A.PROFILES.lota, 40), brass2, [x - 0.16, TOP, z - 0.24], [0, 1.0, 0], 0.55);
  }

  // ---------------------------------------------------------------- the kharal and the manuscript
  const pestle = new THREE.Group();
  const MORTAR = V3(ST.kharal[0] - 0.02, TOP, ST.kharal[1] - 0.07);
  {
    add(A.lathe(A.PROFILES.mortar, 56), graniteMat, [MORTAR.x, TOP, MORTAR.z], [0, 0, 0], 0.9);
    add(A.heapGeometry(0.082, 0.012, 21), pasteMat, [MORTAR.x, TOP + 0.05 * 0.9 + 0.002, MORTAR.z], [0, 0, 0], 1, { cast: false });
    add(A.pestleGeometry(0.2, 0.024), graniteMat, [0, 0, 0], [0, 0, 0], 1, { parent: pestle });
    scene.add(pestle);
    const ms = S.manuscriptGeometry(33, L(26, 14));
    const g = new THREE.Group(); g.position.set(ST.kharal[0] + 0.12, TOP, ST.kharal[1] + 0.13); g.rotation.y = -0.14; scene.add(g);
    const stackMat = new THREE.MeshStandardMaterial({ color: '#c4a268', roughness: 0.82 });
    const folioMat = new THREE.MeshStandardMaterial({ map: S.palmLeafTexture(), roughness: 0.7 });
    const coverMat = new THREE.MeshStandardMaterial({ map: smallT.map, normalMap: smallT.normalMap, color: '#c07a5a', roughness: 0.55 });
    add(ms.stack, stackMat, [0, 0, 0], [0, 0, 0], 1, { parent: g });
    add(ms.top, folioMat, [0, 0, 0], [0, 0, 0], 1, { parent: g });
    add(ms.covers, coverMat, [0, 0, 0], [0, 0, 0], 1, { parent: g });
    add(ms.string, twineMat, [0, 0, 0], [0, 0, 0], 1, { parent: g });
    // a brass bowl of ground churna by the mortar
    add(bowlG, brass, [MORTAR.x - 0.18, TOP, MORTAR.z + 0.12], [0, 1.4, 0], 0.62);
    add(A.heapGeometry(0.052, 0.026, 25), new THREE.MeshStandardMaterial({ color: '#9a7a44', roughness: 0.95 }), [MORTAR.x - 0.18, TOP + 0.007, MORTAR.z + 0.12], [0, 0, 0], 1, { cast: false });
  }
  // the brass lota by the planter, and a tulsi leaf offering on the step
  add(A.lathe(A.PROFILES.lota, 48), brass, [PL.x + 0.52, 0, PL.z + 0.32], [0, 0.4, 0], 1.1);

  // ---------------------------------------------------------------- air: light shafts and motes
  const shafts = [];
  for (const [x, z, r, k] of [[-0.3, -0.25, 0.18, 0.04], [0.9, -0.4, 0.3, 0.035]]) {
    const s = lightShaft({ length: 7, radiusTop: r * 0.6, radiusBottom: r, color: '#ffd29a', intensity: k * 0.4 });
    const target = V3(x, TOP, z);
    s.position.copy(target).addScaledVector(SUN_DIR, 6.5);
    s.quaternion.setFromUnitVectors(V3(0, -1, 0), SUN_DIR.clone().negate());
    s.material.fog = false; s.renderOrder = 6; scene.add(s); shafts.push(s);
  }
  const dust = new Dust({ count: L(900, 400), size: [5, 1.6, 2.4], center: [0, 1.4, -0.4], color: '#ffe0b0', particleSize: 0.008, opacity: 0.5 });
  dust.material.fog = false; scene.add(dust);
  const gold = new Dust({ count: L(260, 120), size: [0.3, 0.18, 0.3], center: [ST.turmeric[0] + 0.16, TOP + 0.12, ST.turmeric[1] - 0.12], color: '#ffc040', particleSize: 0.004, opacity: 0.8, seed: 19 });
  gold.material.fog = false; scene.add(gold);
  const sunGlow = glowSprite({ color: '#ffd8a0', intensity: 0.55, scale: 140 }); sunGlow.material.fog = false; sunGlow.material.depthWrite = false; scene.add(sunGlow);

  // ---------------------------------------------------------------- camera path (one continuous dolly)
  const tx = (k) => ST[k][0];
  const KEYS = [
    [tG, V3(-2.95, 1.62, 1.75), V3(-1.45, 0.98, -0.9)],
    [tTur, V3(tx('turmeric') - 0.32, 1.08, 0.64), V3(tx('turmeric') + 0.03, 0.8, -0.02)],
    [tPep, V3(tx('pepper') - 0.3, 1.06, 0.62), V3(tx('pepper') + 0.03, 0.82, -0.08)],
    [tSpi, V3(tx('spice') - 0.28, 1.14, 0.58), V3(tx('spice') + 0.04, 0.79, 0.0)],
    [tTul, V3(tx('tulsi') - 0.32, 1.2, 0.9), V3(tx('tulsi') + 0.14, 1.12, -0.75)],
    [tAsh, V3(tx('ashwa') - 0.3, 1.06, 0.62), V3(tx('ashwa') + 0.02, 0.8, 0.04)],
    [tChy, V3(tx('chyawan') - 0.3, 1.07, 0.6), V3(tx('chyawan') + 0.04, 0.84, -0.02)],
    [tGri, V3(tx('kharal') - 0.32, 1.1, 0.62), V3(tx('kharal') + 0.02, 0.82, 0.02)],
    [DUR, V3(2.95, 2.05, 2.45), V3(0.35, 0.6, -3.6)],
  ];
  const camCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');
  const SK = KEYS.map((k, i) => [k[0], i / (KEYS.length - 1)]);
  const camPos = V3(), look = V3();

  // ---------------------------------------------------------------- screen HUD: callouts and captions
  const hud = ctx.makeHUD();
  const AS = ctx.aspect;
  const SQ = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UI = TALL ? 1.9 : SQ ? 1.6 : 1, UC = TALL ? 1.85 : SQ ? 1.45 : 1, UCX = SQ ? 0.85 : 1;
  const PK = Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.15);
  const MH = FILM_ASPECT / OUTPUT_ASPECT;
  const BOT = SQ ? -Math.min(MH * 0.62, 2.2) : -0.8;
  const centerText = (txt, y, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, letterSpacing: 0.2, color: IVORY, intensity: 1.2, ...o, height: (o.height ?? 0.05) * UI }); tp.position.set(o.x ?? 0, y, 0); hud.scene.add(tp); tp.opacity = 0; return tp; };
  const mkCall = (label, sub, dx, dy, color = IVORY) => { const c = new Callout(label, { dx: dx * UCX, dy: dy * UC, size: 0.042 * UC, color, sub, intensity: 1.35 }); hud.scene.add(c); c.visible = false; return c; };
  // [callout, world anchor, from, to]
  const W = (k, dx, dy, dz) => V3(ST[k][0] + dx, TOP + dy, ST[k][1] + dz);
  const calls = [
    [mkCall('TURMERIC · HALDI', 'TRACES IN COOKING POTS AT FARMANA, AN INDUS SITE · c. 2500 BCE', 0.3, 0.3, GOLD), W('turmeric', 0.13, 0.008, 0.12), tTur + 0.08, tPep - 0.06],
    [mkCall('GINGER', 'ALSO TRACED IN THE FARMANA POTS', -0.32, 0.36), W('pepper', -0.14, 0.02, 0.09), tPep + 0.06, tSpi - 0.08],
    [mkCall('BLACK PEPPER', 'NATIVE TO THE MALABAR COAST', 0.3, 0.32, GOLD), W('pepper', 0.05, 0.012, -0.17), tPep + 0.14, tSpi - 0.06],
    [mkCall('CARDAMOM', 'NATIVE TO THE WESTERN GHATS', -0.3, 0.34), W('spice', 0.0, 0.05, -0.02), tSpi + 0.06, tTul - 0.08],
    [mkCall('CLOVE', 'NATIVE TO THE MALUKU ISLANDS, INDONESIA · REACHED INDIA BY ANCIENT TRADE', 0.28, 0.36, GOLD), W('spice', 0.07, 0.05, -0.07), tSpi + 0.12, tTul - 0.06],
    [mkCall('CINNAMON QUILLS', null, 0.3, -0.2), W('spice', 0.16, 0.012, 0.18), tSpi + 0.18, tTul - 0.06],
    [mkCall('TULSI · HOLY BASIL', 'SACRED IN HINDU HOMES · THE TULSI VRINDAVAN', 0.34, -0.12, GOLD), V3(PL.x + 0.1, 1.3, PL.z + 0.1), tTul + 0.06, tAsh - 0.08],
    [mkCall('NEEM', 'CALLED "SARVA ROGA NIVARINI" IN TRADITION', -0.3, -0.16), W('tulsi', -0.06, 0.006, 0.12), tTul + 0.12, tAsh - 0.06],
    [mkCall('ASHWAGANDHA', 'ITS ROOT IS USED IN AYURVEDA AS A RASAYANA, A TONIC', 0.3, 0.32, GOLD), W('ashwa', 0.02, 0.02, -0.05), tAsh + 0.06, tChy - 0.06],
    [mkCall('RED BERRIES IN PAPERY HUSKS', null, -0.3, -0.22), W('ashwa', -0.06, 0.01, 0.19), tAsh + 0.14, tChy - 0.06],
    [mkCall('CHYAWANPRASH', 'A RECIPE RECORDED IN THE CHARAKA SAMHITA', -0.32, 0.34, GOLD), W('chyawan', -0.02, 0.14, -0.08), tChy + 0.06, tGri - 0.06],
    [mkCall('AMLA · INDIAN GOOSEBERRY', 'THE BASE OF THE TRADITIONAL RECIPE', 0.3, 0.22), W('chyawan', 0.17, 0.03, 0.12), tChy + 0.14, tGri - 0.06],
    [mkCall('KHARAL · MORTAR AND PESTLE', null, -0.3, 0.3), V3(MORTAR.x, TOP + 0.11, MORTAR.z), tGri + 0.04, DUR - 0.25],
    [mkCall('PALM-LEAF MANUSCRIPT', null, 0.3, -0.2, GOLD), W('kharal', 0.12, 0.05, 0.13), tGri + 0.1, DUR - 0.25],
  ];
  const capOpen = centerText('AYURVEDA · THE KNOWLEDGE OF LIFE', BOT, { weight: 500, color: GOLD, height: 0.046 });
  const capPepper = centerText('PEPPERCORNS WERE FOUND IN THE MUMMY OF RAMESSES II · 1213 BCE', BOT, { height: 0.032, intensity: 0.9 });
  const capSpice = centerText('THE SPICE BOX · MASALA DABBA', BOT, { height: 0.034, intensity: 0.9 });
  const capCharaka = centerText('CHARAKA SAMHITA · SUSHRUTA SAMHITA', BOT + 0.06 * UI, { weight: 500, height: 0.044, color: GOLD });
  const capPlants = centerText('HUNDREDS OF MEDICINAL PLANTS DESCRIBED', BOT, { height: 0.032, intensity: 0.9 });
  const tmp = V3();
  const toHud = (w, out) => { tmp.copy(w).project(camera); return out.set(tmp.x * AS * PK, tmp.y * PK, 0); };
  const placeHud = () => { for (const [c, w] of calls) if (c.visible) toHud(w, c.position); };

  // ---------------------------------------------------------------- per-frame
  const sunV = V3();
  const api = {
    scene, camera, hud,
    dof: { focus: 0.6, range: 0.4, amount: 0.5 },
    bloom: { strength: 0.6 },
    exposure: 1.0,
    background: 0x1a120c,
    exploreLimits: { yaw: 1.3, pitchDown: 0.6, pitchUp: 0.7, zoomIn: 0.25, zoomOut: 3.0, fly: 3 },
    arSubject: (t) => {
      const k = t < tTur - 0.2 ? null : t < tPep - 0.3 ? 'turmeric' : t < tSpi - 0.3 ? 'pepper' : t < tTul - 0.3 ? 'spice' : t < tAsh - 0.3 ? 'tulsi' : t < tChy - 0.3 ? 'ashwa' : t < tGri - 0.3 ? 'chyawan' : t < DUR - 0.3 ? 'kharal' : null;
      return k ? { centre: V3(ST[k][0], TOP + 0.06, ST[k][1]), radius: 0.3 } : { centre: V3(0, 0.9, -0.6), radius: 3.2 };
    },
    explorePosed(cam) { cam.updateMatrixWorld(); placeHud(); },
    update(t, info) {
      // -------- camera
      const s = timeWarp(t, SK);
      camCurve.getPoint(sat(s), camPos); lookCurve.getPoint(sat(s), look);
      camPos.x += Math.sin(t * 1.1) * 0.004; camPos.y += Math.sin(t * 1.6 + 1) * 0.003;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.6) * 0.006, 1, 0).normalize();
      camera.lookAt(look);
      const wideIn = 1 - ramp(t, 0, tTur, ease.inOutSine), wideOut = ramp(t, tGri + 0.15, DUR, ease.inOutSine);
      camera.fov = 34 + 6 * wideIn + 6 * wideOut;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sky.position.copy(camPos);
      sunGlow.position.copy(camPos).addScaledVector(SUN_DIR, 1200);

      // -------- light, leaves, air
      sunV.copy(SUN_DIR).transformDirection(camera.matrixWorldInverse);
      A.LEAF_U.uSunV.value.copy(sunV); A.LEAF_U.uTime.value = t;
      A.LEAF_U.uWind.value = 0.8 + 0.25 * Math.sin(t * 0.9);
      skyU.uTime.value = t;
      key.intensity = 7.5;
      // the neem bough sways a little (pivot at the trunk)
      neemGroup.rotation.set(Math.sin(t * 0.8) * 0.004, 0, Math.sin(t * 0.63 + 1) * 0.005);
      for (const f of flames) {
        const k = 0.85 + 0.15 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2);
        f.f.scale.set(f.s * (0.95 + 0.05 * k), f.s * (0.8 + 0.25 * k), f.s * (0.95 + 0.05 * k));
        f.f.rotation.z = Math.sin(t * 5 + f.ph) * 0.06;
        f.g.material.color.setRGB(1.0, 0.62, 0.25).multiplyScalar(1.3 * k); f.pl.intensity = 0.22 * f.s * k;
      }
      for (const sh of shafts) sh.material.uniforms.uTime.value = t;
      dust.tick(t, info); gold.tick(t, info);
      gold.u.opacity = 0.75 * envelope(t, tTur - 0.25, tPep, 0.2, 0.3);
      gold.visible = gold.u.opacity > 0.003;
      dhows.forEach((d, i) => { d.g.position.x = d.x + t * (i ? 0.6 : -0.9); d.g.rotation.z = Math.sin(t * 0.9 + i) * 0.03; });

      // -------- the kharal: the pestle grinds round the bowl
      const ga = t * 2.4 + 2.0 * ramp(t, tGri - 0.2, DUR, ease.inOutSine);
      const tilt = 0.42;
      const rr = 0.032;
      pestle.position.set(MORTAR.x + Math.cos(ga) * rr, TOP + 0.052, MORTAR.z + Math.sin(ga) * rr);
      pestle.rotation.set(0, 0, 0);
      pestle.quaternion.setFromAxisAngle(V3(-Math.sin(ga), 0, Math.cos(ga)), -tilt);

      // -------- HUD
      for (const [c, , a, b] of calls) {
        const p = ramp(t, a, a + 0.22, ease.outCubic), out = 1 - ramp(t, b - 0.12, b, ease.inOutSine);
        c.visible = p > 0 && out > 0; if (c.visible) c.reveal(p, out);
      }
      const show = (tp, a, b, o0, o1) => { const p = ramp(t, a, b, ease.outCubic), out = 1 - ramp(t, o0, o1); tp.reveal = p; tp.opacity = p > 0 ? out : 0; tp.visible = tp.opacity > 0.002; };
      show(capOpen, 0.02, 0.3, tTur - 0.12, tTur + 0.02);
      show(capPepper, tPep + 0.2, tPep + 0.45, tSpi - 0.12, tSpi);
      show(capSpice, tSpi + 0.18, tSpi + 0.42, tTul - 0.12, tTul);
      show(capCharaka, tGri + 0.12, tGri + 0.4, DUR + 1, DUR + 2);
      show(capPlants, tGri + 0.2, tGri + 0.48, DUR + 1, DUR + 2);
      placeHud();

      // -------- lens and post
      const focusD = camPos.distanceTo(look);
      api.dof.focus = focusD;
      const wide = Math.max(wideIn, wideOut);
      api.dof.range = lerp(0.22, 2.5, wide);
      api.dof.amount = lerp(0.55, 0.25, wide);
      api.bloom.strength = 0.32 + 0.1 * wide;
      api.exposure = 1.0;
    },
  };
  return api;
}
