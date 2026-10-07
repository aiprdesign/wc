// THE STATUE OF UNITY — Sardar Vallabhbhai Patel, 182 m, the world's tallest statue (inaugurated
// 31 October 2018 on Sadhu Bet, an island in the Narmada at Kevadia — Ekta Nagar — in Gujarat, facing the
// Sardar Sarovar Dam; sculptor Ram V. Sutar; bronze cladding over a steel and reinforced-concrete core).
// One continuous morning flight (story-relative beats, exported below):
//   B_VALLEY   0.0  low over the blue-green river between green hills, the statue rising ahead on its island
//   B_CRANE    1.2  a rising crane up the figure: sandals and dhoti folds, the hands at the sides, the shawl
//                   over the shoulders, the face — bronze panels with their seams and weathered patina
//   B_HEIGHT   2.5  pulled back: the 182 m height line, the Statue of Liberty (93 m with its pedestal) drawn
//                   beside it for scale, visitors on the plaza
//   B_PULLBACK 3.2  the full monument on its pedestal, the dam across the gorge behind, the river, the hills
// The figure is a low-poly, flat-shaded bronze (unity-figure.js: a signed-distance sculpture decimated to
// crisp facets); the site, materials and the Liberty silhouette are in unity-assets.js. update(t) is a pure function of t.
import * as THREE from 'three';
import { OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { sat, ease, ramp, envelope, timeWarp } from '../../lib/math.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { segmentsLine, progressLine } from '../../lib/lines.js';
import { Callout } from '../../lib/hud.js';
import { buildFigure, FIG_H } from './unity-figure.js';
import * as AS from './unity-assets.js';

export const B_VALLEY = 0.0, B_CRANE = 1.2, B_HEIGHT = 2.5, B_PULLBACK = 3.2;
export const BEATS = { valley: B_VALLEY, crane: B_CRANE, height: B_HEIGHT, pullback: B_PULLBACK };

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const IVORY = '#fff1dc', GOLD = '#ffd08a', SKYC = '#cfe6ff';
const { SCALE, FEET_Y, PLAZA_Y, DAM_Z, CREST_Y, RES_Y } = AS.SITE;
const TOP_Y = FEET_Y + FIG_H * SCALE;        // 252 m
const LIB_X = 150;                            // the Liberty silhouette stands beside the statue, to its left

export function create(ctx, segment) {
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, ctx.aspect, 1.0, 30000);

  // ---------------------------------------------------------------- sun, sky, haze
  const sunDir = V3(0.5, 0.48, 0.72).normalize();     // morning: the sun in the east, ahead of the statue, from its left
  const skyU = {
    uSunDir: { value: sunDir.clone() }, uZenith: { value: new THREE.Color(0.07, 0.19, 0.55) }, uHorizon: { value: new THREE.Color(0.55, 0.67, 0.82) },
    uSunCol: { value: new THREE.Color(1.0, 0.86, 0.66) }, uGround: { value: new THREE.Color(0.1, 0.13, 0.09) }, uTime: { value: 0 }, uRes: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), AS.skyMaterial(skyU));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
  scene.fog = new THREE.FogExp2(new THREE.Color(0.5, 0.62, 0.78), 0.00011);

  // image-based light: the same sky over a green valley floor, prefiltered once
  {
    const envScene = new THREE.Scene();
    const envSky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), AS.skyMaterial({ ...skyU, uGround: { value: new THREE.Color(0.06, 0.09, 0.05) } }));
    envScene.add(envSky);
    try {
      const gen = ctx.engine?.pmrem ?? new THREE.PMREMGenerator(ctx.renderer);
      scene.environment = gen.fromScene(envScene, 0, 1, 200, { size: 128 }).texture;
      if (!ctx.engine?.pmrem) gen.dispose();
    } catch (e) { console.warn('[unity] environment', e); scene.environment = ctx.env; }
    envSky.geometry.dispose(); envSky.material.dispose();
  }
  scene.environmentIntensity = 0.75;

  const key = new THREE.DirectionalLight('#fff0dc', 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(lite ? 2048 : 4096, lite ? 2048 : 4096);
  Object.assign(key.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 1200 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6;
  key.target.position.set(0, 110, 10);
  key.position.copy(key.target.position).addScaledVector(sunDir, 600);
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#a9c6ec', '#3d4a2c', 0.55); scene.add(hemi);
  const rim = new THREE.DirectionalLight('#bcd6ff', 0.5); rim.position.set(-400, 300, -500); rim.userData.noEnv = true; scene.add(rim);

  // ---------------------------------------------------------------- the valley, the river, the dam
  const terrain = new THREE.Mesh(AS.buildTerrain(lite), AS.terrainMaterial(skyU));
  terrain.receiveShadow = true; scene.add(terrain);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(17000, 16000).rotateX(-Math.PI / 2).translate(0, 0, 1000), AS.waterMaterial(skyU));
  river.renderOrder = -1; scene.add(river);
  const resU = { ...skyU, uRes: { value: 1 } };
  const reservoir = new THREE.Mesh(new THREE.PlaneGeometry(17000, 7000).rotateX(-Math.PI / 2).translate(0, RES_Y, DAM_Z + 3502), AS.waterMaterial(resU));
  scene.add(reservoir);
  const dam = AS.buildDam(lite);
  const concreteM = AS.stoneMaterial({ color: '#a9a69c', ch: 1.5, bl: 17, streak: 1.0, rough: 0.85, key: 'concrete' });
  const damMesh = new THREE.Mesh(dam.concrete, concreteM); damMesh.receiveShadow = true; scene.add(damMesh);
  const steelM = new THREE.MeshStandardMaterial({ color: '#3c4044', roughness: 0.55, metalness: 0.7, side: THREE.DoubleSide });
  steelM.userData.noBatch = true;
  scene.add(new THREE.Mesh(dam.steel, steelM));
  const bridge = new THREE.Mesh(AS.buildBridge(lite), concreteM); bridge.castShadow = bridge.receiveShadow = true; scene.add(bridge);
  const trees = AS.buildTrees(lite); scene.add(trees);

  // ---------------------------------------------------------------- the pedestal and the plaza
  const ped = AS.buildPedestal(lite);
  const stoneM = AS.stoneMaterial({ color: '#b9ab98', key: 'stone' });
  const paleM = AS.stoneMaterial({ color: '#cfc3b0', ch: 1.2, bl: 2.4, streak: 0.4, rough: 0.7, key: 'pale' });
  const darkM = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.25, metalness: 0.3 }); darkM.userData.noBatch = true;
  for (const [g, m] of [[ped.stone, stoneM], [ped.pale, paleM], [ped.dark, darkM]]) { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; scene.add(o); }
  const people = AS.buildPeople(lite); scene.add(people);

  // ---------------------------------------------------------------- life: ferries on the river, birds round the statue
  const boatM = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.5 }); boatM.userData.noBatch = true;
  const boatTrim = new THREE.MeshStandardMaterial({ color: '#2f5f8f', roughness: 0.5 }); boatTrim.userData.noBatch = true;
  const wakeM = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, uniforms: THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    vertexShader: '#include <common>\n#include <fog_pars_vertex>\nvarying vec2 vUv; void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: '#include <common>\n#include <fog_pars_fragment>\nvarying vec2 vUv; void main(){ float x = abs(vUv.x - 0.5) * 2.0, y = vUv.y; float v = exp(-pow((x - (1.0 - y) * 0.9) * 7.0, 2.0)) + 0.5 * exp(-pow(x * 5.0, 2.0)) * y; gl_FragColor = vec4(vec3(0.85, 0.9, 0.9), v * y * y * 0.55);\n#include <fog_fragment>\n}',
  });
  const boats = [[-1, 140, 380, 2.6], [1, -90, 620, -3.4]].map(([side, x, z0, v]) => {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.0, 22, 8, 1).rotateX(Math.PI / 2).scale(1, 0.7, 1), boatM);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 11).translate(0, 2.4, -1.5), boatM);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.4, 12.5).translate(0, 3.9, -1.5), boatTrim);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.5, 19).translate(0, 0.7, 0), boatTrim);
    const wake = new THREE.Mesh(new THREE.PlaneGeometry(26, 70).rotateX(-Math.PI / 2).translate(0, 0.15, -44), wakeM);
    g.add(hull, deck, roof, stripe, wake);
    for (const o of [hull, deck, roof, stripe]) o.castShadow = true;
    scene.add(g);
    return { g, x, z0, v, side };
  });
  const birdM = new THREE.MeshBasicMaterial({ color: '#141210', side: THREE.DoubleSide, fog: true });
  const wingG = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.22, 0.95, 0.02, -0.08], 3));
  wingG.computeVertexNormals();
  const birds = [...Array(lite ? 8 : 16)].map((_, i) => {
    const g = new THREE.Group();
    const L = new THREE.Mesh(wingG, birdM), Rw = new THREE.Mesh(wingG, birdM); Rw.scale.x = -1;
    g.add(L, Rw); g.scale.setScalar(2.2 + (i % 4) * 0.35); scene.add(g);
    return { g, L, Rw, r: 120 + (i * 37) % 150, y: 150 + (i * 53) % 110, ph: i * 0.83, w: (0.32 + (i % 5) * 0.05) * (i % 3 ? 1 : -1), f: 9 + (i % 4) };
  });

  // ---------------------------------------------------------------- the statue
  const fig = buildFigure({ lite });
  const bronzeM = AS.bronzeMaterial();
  const statue = new THREE.Group();
  statue.position.set(0, FEET_Y, 0); statue.scale.setScalar(SCALE);
  { const o = new THREE.Mesh(fig.geometry, bronzeM); o.castShadow = o.receiveShadow = true; statue.add(o); }
  scene.add(statue);
  const S = (x, y, z) => V3(x * SCALE, FEET_Y + y * SCALE, z * SCALE);   // figure units → world

  // ---------------------------------------------------------------- scale graphics: the height lines and Liberty
  const lib = AS.libertyGeometry();
  const libM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.78, 0.88, 1.0), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, fog: false });
  const liberty = new THREE.Group(); liberty.position.set(LIB_X, FEET_Y, 10);
  const libFill = new THREE.Mesh(lib.geometry, libM); libFill.renderOrder = 6;
  const libLine = progressLine(lib.outline.concat([lib.outline[0]]), { color: SKYC, headColor: '#ffffff', intensity: 2.4, head: 0.03 });
  libLine.material.fog = false; libLine.renderOrder = 7;
  liberty.add(libFill, libLine); scene.add(liberty);
  const DIM_X = -48;
  const dimSegs = (x, y0, y1, tick) => [[V3(x, y0, 0), V3(x, y1, 0)], [V3(x - tick, y0, 0), V3(x + tick, y0, 0)], [V3(x - tick, y1, 0), V3(x + tick, y1, 0)]];
  const dimMain = segmentsLine(dimSegs(0, FEET_Y, TOP_Y, 7), { color: GOLD, intensity: 1.7, orderFn: (a, b, i) => (i === 0 ? 0 : 0.55), stagger: 0.5 });
  const dimLib = segmentsLine(dimSegs(0, FEET_Y, FEET_Y + 93, 6), { color: SKYC, intensity: 1.5, orderFn: (a, b, i) => (i === 0 ? 0 : 0.55), stagger: 0.5 });
  const groundLine = segmentsLine([[V3(-90, FEET_Y, 0), V3(LIB_X + 40, FEET_Y, 0)]], { color: IVORY, intensity: 0.8, stagger: 0 });
  const dims = new THREE.Group(); dims.position.set(0, 0, 18);
  dimMain.position.x = DIM_X; dimLib.position.x = LIB_X + 22;
  for (const l of [dimMain, dimLib, groundLine]) { l.material.fog = false; l.renderOrder = 7; dims.add(l); }
  scene.add(dims);

  // ---------------------------------------------------------------- camera path
  const KEYS = [
    [B_VALLEY - 0.6, V3(-180, 18, 1820), V3(0, 150, 0)],
    [B_VALLEY, V3(-168, 22, 1480), V3(0, 152, 0)],
    [0.6, V3(-142, 34, 1040), V3(0, 150, 0)],
    [1.08, V3(-100, 58, 480), V3(0, 132, 0)],
    [B_CRANE + 0.12, V3(-74, 84, 220), V3(0, 106, 6)],
    [1.85, V3(-62, 158, 156), V3(0, 166, 10)],
    [2.32, V3(-138, 176, 92), V3(0, 214, 4)],   // chest-up, 3/4 from below, on the side away from the sun: the head against the bright sky, rim-lit
    [B_HEIGHT + 0.12, V3(-122, 214, 360), V3(18, 178, 0)],
    [3.05, V3(-215, 182, 690), V3(46, 160, 0)],
    [B_PULLBACK + 0.4, V3(560, 240, 760), V3(40, 150, 250)],
    [DUR, V3(840, 300, -140), V3(312, 200, 319)],
    [DUR + 0.6, V3(990, 330, -200), V3(380, 200, 340)],
  ];
  const camCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
  const lookCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');
  const SK = KEYS.map((k, i) => [k[0], i / (KEYS.length - 1)]);
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  // ---------------------------------------------------------------- screen HUD
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  const SQ = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UI = TALL ? 1.9 : SQ ? 1.6 : 1, UC = TALL ? 1.85 : SQ ? 1.45 : 1, UCX = SQ ? 0.85 : 1;
  const PK = Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.15);
  const MH = FILM_ASPECT / OUTPUT_ASPECT;
  const BOT = SQ ? -Math.min(MH * 0.62, 2.2) : -0.78;
  const text = (txt, y, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, letterSpacing: 0.2, color: IVORY, intensity: 1.2, ...o, height: (o.height ?? 0.05) * UI }); tp.position.set(o.x ?? 0, y, 0); hud.scene.add(tp); tp.opacity = 0; return tp; };
  // a soft dark band behind the lower-third lines (they sit over bright stone and sky)
  const bandM = new THREE.ShaderMaterial({
    uniforms: { uOp: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOp; varying vec2 vUv; void main(){ float a = sin(vUv.y * 3.14159) * (0.35 + 0.65 * sin(vUv.x * 3.14159)); gl_FragColor = vec4(0.0, 0.0, 0.0, uOp * 0.42 * a * a); }',
  });
  const band = new THREE.Mesh(new THREE.PlaneGeometry(A * 1.6, 0.34 * UI), bandM); band.position.set(0, BOT - 0.03 * UI, -1); band.renderOrder = 9; hud.scene.add(band);
  const title = text('STATUE OF UNITY', BOT + 0.03 * UI, { weight: 500, height: 0.058, color: GOLD, letterSpacing: 0.26 });
  const titleSub = text('SARDAR VALLABHBHAI PATEL · INAUGURATED 31 OCTOBER 2018', BOT - 0.055 * UI, { height: 0.03, intensity: 0.95 });
  const place = text('SADHU BET · NARMADA RIVER · EKTA NAGAR, GUJARAT', BOT - 0.11 * UI, { height: 0.026, intensity: 0.7 });
  const sculptor = text('SCULPTOR · RAM V. SUTAR', BOT, { height: 0.034, intensity: 1.0, color: GOLD });
  const tallest = text("THE WORLD'S TALLEST STATUE", BOT + 0.03 * UI, { weight: 500, height: 0.046, color: GOLD });
  const twice = text('ROUGHLY TWICE AS TALL AS THE STATUE OF LIBERTY', BOT - 0.045 * UI, { height: 0.028, intensity: 0.85 });
  const lab182 = text('182 m', 0, { weight: 500, height: 0.05, color: GOLD, letterSpacing: 0.12 });
  const lab93 = text('93 m', 0, { weight: 500, height: 0.04, color: SKYC, letterSpacing: 0.12 });
  const labLib = text('STATUE OF LIBERTY · WITH PEDESTAL', 0, { height: 0.022, color: SKYC, intensity: 0.9, letterSpacing: 0.14 });
  const mkCall = (label, sub, dx, dy, color = IVORY) => { const c = new Callout(label, { dx: dx * UCX, dy: dy * UC, size: 0.042 * UC, color, sub, intensity: 1.35 }); hud.scene.add(c); c.visible = false; return c; };
  const callBronze = mkCall('BRONZE CLADDING', 'OVER A STEEL AND REINFORCED-CONCRETE CORE', 0.42, 0.16);
  const callGallery = mkCall('VIEWING GALLERY', 'ABOUT 153 m UP', 0.4, 0.12);
  const callDam = mkCall('SARDAR SAROVAR DAM', 'THE STATUE FACES IT', -0.3, 0.2, SKYC);
  const callRiver = mkCall('NARMADA', null, 0.28, -0.12, SKYC);
  const tmp = new THREE.Vector3();
  const toHud = (w, out) => { tmp.copy(w).project(camera); return out.set(tmp.x * A * PK, tmp.y * PK, 0); };
  const placeHud = () => {
    camera.updateMatrixWorld();
    if (callBronze.visible) toHud(S(0.2, 1.02, 0.12), callBronze.position);
    if (callGallery.visible) toHud(S(0.06, 1.42, 0.13), callGallery.position);
    if (callDam.visible) toHud(V3(AS.riverX(DAM_Z) - 120, CREST_Y - 30, DAM_Z - 40), callDam.position);
    if (callRiver.visible) toHud(V3(AS.riverX(700) + 40, 0, 700), callRiver.position);
    if (lab182.visible) { toHud(V3(DIM_X, (FEET_Y + TOP_Y) / 2, 18), lab182.position); lab182.position.x -= lab182.worldWidth * 0.5 + 0.03; }
    if (lab93.visible) { toHud(V3(LIB_X + 22, FEET_Y + 46.5, 18), lab93.position); lab93.position.x += lab93.worldWidth * 0.5 + 0.03; }
    if (labLib.visible) { toHud(V3(LIB_X, FEET_Y - 8, 10), labLib.position); }
  };

  // ---------------------------------------------------------------- per-frame
  const camDir = new THREE.Vector3();
  const api = {
    scene, camera, hud,
    dof: { focus: 600, range: 400, amount: 0 },
    bloom: { strength: 0.35 },
    exposure: 1.0,
    background: 0x8fa6bd,
    sceneEnv: false,
    envLook: { tint: 0.2 },
    exploreLimits: { yaw: 1.4, pitchDown: 0.5, pitchUp: 0.9, zoomIn: 0.08, zoomOut: 3.0, fly: 3.0 },
    arSubject: () => ({ centre: V3(0, 140, 8), radius: 140 }),
    explorePosed(cam) { cam.updateMatrixWorld(); placeHud(); },
    update(t, info) {
      // -------- camera
      const s = timeWarp(t, SK);
      camCurve.getPoint(sat(s), camPos); lookCurve.getPoint(sat(s), look);
      const close = envelope(t, B_CRANE - 0.05, B_HEIGHT + 0.1, 0.25, 0.25);
      camPos.x += Math.sin(t * 1.1) * 0.6 * (1 - close); camPos.y += Math.sin(t * 1.6 + 1) * 0.4;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.6) * 0.006, 1, 0).normalize();
      camera.lookAt(look);
      camera.fov = 36 - 4 * close + 11 * ramp(t, B_PULLBACK, DUR + 0.2, ease.inOutSine);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sky.position.copy(camPos);
      for (const b of boats) {
        const z = b.z0 + b.v * t, x = AS.riverX(z) + b.x;
        const z2 = z + Math.sign(b.v) * 5, x2 = AS.riverX(z2) + b.x;
        b.g.position.set(x, 0.6 + 0.15 * Math.sin(t * 2 + b.x), z);
        b.g.rotation.y = Math.atan2(x2 - x, z2 - z);
      }
      for (const b of birds) {
        const a = b.ph + b.w * t, flap = Math.sin(t * b.f + b.ph * 3) * 0.55;
        b.g.position.set(Math.cos(a) * b.r + 20, b.y + 6 * Math.sin(t * 0.8 + b.ph), Math.sin(a) * b.r + 40);
        b.g.rotation.set(0, -a + (b.w > 0 ? 0 : Math.PI), 0.25 * Math.sign(b.w));
        b.L.rotation.z = flap; b.Rw.rotation.z = -flap;
      }
      skyU.uTime.value = t; resU.uTime.value = t;

      // -------- light (a slow drift of cloud light over the valley)
      key.intensity = 3.2 * (0.94 + 0.06 * Math.sin(t * 0.9));
      key.target.position.set(0, 110, 10); key.position.copy(key.target.position).addScaledVector(sunDir, 600);

      // -------- scale graphics
      const hIn = ramp(t, B_HEIGHT - 0.05, B_HEIGHT + 0.45, ease.outCubic), hOut = 1 - ramp(t, B_PULLBACK + 0.05, B_PULLBACK + 0.35);
      const hv = hIn * hOut;
      dimMain.progress = hIn; dimMain.opacity = hOut;
      dimLib.progress = ramp(t, B_HEIGHT + 0.15, B_HEIGHT + 0.55, ease.outCubic); dimLib.opacity = hOut;
      groundLine.progress = ramp(t, B_HEIGHT - 0.1, B_HEIGHT + 0.3); groundLine.opacity = hOut * 0.8;
      libLine.progress = ramp(t, B_HEIGHT + 0.02, B_HEIGHT + 0.3, ease.inOutSine); libLine.opacity = hOut;
      libM.opacity = 0.5 * ramp(t, B_HEIGHT + 0.05, B_HEIGHT + 0.3) * hOut;   // a solid, pale flat silhouette
      liberty.visible = hv > 0.001 || libLine.progress > 0 && hOut > 0;
      // the silhouette and the height lines turn to face the camera (about the vertical)
      camera.getWorldDirection(camDir);
      const yaw = Math.atan2(-camDir.x, -camDir.z);
      liberty.rotation.y = yaw; dims.rotation.y = yaw;

      // -------- HUD
      const tIn = envelope(t, B_VALLEY + 0.12, B_CRANE + 0.02, 0.22, 0.2);
      title.opacity = tIn; title.reveal = ramp(t, 0.12, 0.5, ease.outCubic);
      titleSub.opacity = envelope(t, 0.3, B_CRANE + 0.02, 0.2, 0.2); titleSub.reveal = ramp(t, 0.3, 0.7, ease.outCubic);
      place.opacity = envelope(t, 0.45, B_CRANE + 0.02, 0.2, 0.2) * 0.9; place.reveal = ramp(t, 0.45, 0.85, ease.outCubic);
      const cb = envelope(t, B_CRANE + 0.15, 1.95, 0.08, 0.12);
      callBronze.visible = cb > 0; if (cb > 0) callBronze.reveal(ramp(t, B_CRANE + 0.15, B_CRANE + 0.5, ease.outCubic), cb);
      const cg = envelope(t, 1.98, B_HEIGHT + 0.05, 0.08, 0.12);
      callGallery.visible = cg > 0; if (cg > 0) callGallery.reveal(ramp(t, 1.98, 2.3, ease.outCubic), cg);
      sculptor.opacity = envelope(t, 1.55, B_HEIGHT, 0.15, 0.15) * 0.95; sculptor.reveal = ramp(t, 1.55, 1.9, ease.outCubic);
      tallest.opacity = envelope(t, B_HEIGHT + 0.2, B_PULLBACK + 0.15, 0.15, 0.15); tallest.reveal = ramp(t, B_HEIGHT + 0.2, B_HEIGHT + 0.55, ease.outCubic);
      twice.opacity = envelope(t, B_HEIGHT + 0.4, B_PULLBACK + 0.15, 0.15, 0.15) * 0.9; twice.reveal = ramp(t, B_HEIGHT + 0.4, B_HEIGHT + 0.8, ease.outCubic);
      lab182.opacity = hv * sat((t - B_HEIGHT - 0.25) * 6); lab93.opacity = hv * sat((t - B_HEIGHT - 0.45) * 6); labLib.opacity = hv * sat((t - B_HEIGHT - 0.55) * 6) * 0.9;
      const cd = envelope(t, B_PULLBACK + 0.35, DUR + 0.5, 0.15, 0.1);
      callDam.visible = cd > 0; if (cd > 0) callDam.reveal(ramp(t, B_PULLBACK + 0.35, B_PULLBACK + 0.7, ease.outCubic), cd);
      const cr = envelope(t, 0.55, B_CRANE - 0.05, 0.15, 0.15);
      callRiver.visible = cr > 0; if (cr > 0) callRiver.reveal(ramp(t, 0.55, 0.85, ease.outCubic), cr * 0.9);
      bandM.uniforms.uOp.value = Math.max(title.opacity, sculptor.opacity, tallest.opacity); band.visible = bandM.uniforms.uOp.value > 0.001;
      placeHud();

      // -------- grade
      api.dof.focus = camPos.distanceTo(V3(0, look.y, 0));
      api.dof.range = api.dof.focus * 0.6;
      api.dof.amount = 0.25 * close;
      api.bloom.strength = 0.3 + 0.1 * close;
      api.exposure = 1.0;
    },
  };
  return api;
}
