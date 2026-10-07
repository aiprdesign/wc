// MODERN INVENTIONS — a gallery of invention by Indian scientists, engineers and craftsmen (after The Modern
// Mind; 5.0 s of story). One continuous camera move along a dark, warm museum gallery: polished stone floor,
// panelled wall, lacquered plinths with marble tops. A thread of light inlaid in the floor runs ahead of the
// camera; each time it reaches a plinth the plinth's inlay and its spotlight come up and the exhibit wakes.
//   bose        +0.0  J. C. Bose's millimetre-wave apparatus (Calcutta, 1895): the coil sparks, waves cross
//                     from horn to horn through a wire grating, the galvanometer kicks; his crescograph beside it
//   saha        +0.9  a backlit spectrogram of the stellar classes; the ionization equation (1920) writes itself
//   chandra     +1.6  a white dwarf under a bell jar shrinks as its mass climbs the curve to the limit, 1.4 M☉
//   kapany      +2.3  light leaves a lamp, runs through a loop of glass fibres and the picture reappears on a
//                     screen (Kapany & Hopkins, Nature, 1954)
//   patel       +2.9  a CO2 laser strikes (Bell Labs, 1964): violet discharge, the invisible beam scorches firebrick
//   jaipurFoot  +3.4  the Jaipur Foot (1969), whole and in section: rubber, wood (Dr P. K. Sethi, Ram Chandra Sharma)
//   usb         +3.9  a USB plug (4× scale) slides home into its port; the LED lights (Ajay Bhatt, Intel, 1996)
//   upi         +4.4  a phone scans a QR standee and the payment goes through (UPI, NPCI, 2016); the camera
//                     pushes into the screen for the cut
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { Callout } from '../../lib/hud.js';
import { glowSprite, lightShaft } from '../../lib/materials.js';
import { progressTube } from '../../lib/lines.js';
import { Dust } from '../../lib/particles.js';
import * as A from './inventors-assets.js';
import * as X from './inventors-models.js';

// Beats, in story seconds from the start of the segment. If the film defines the cue named in CUE_NAMES it
// wins (the score and the timeline own the numbers); otherwise these offsets are used.
export const BEATS = { bose: 0.0, saha: 0.9, chandra: 1.6, kapany: 2.3, patel: 2.9, jaipurFoot: 3.4, usb: 3.9, upi: 4.4 };
export const CUE_NAMES = { bose: 'jcBose', saha: 'sahaEquation', chandra: 'chandrasekhar', kapany: 'fibreOptics', patel: 'co2Laser', jaipurFoot: 'jaipurFoot', usb: 'usb', upi: 'upi' };
export const STORY_LENGTH = 5.0;

const V3 = A.V3;
const INK = '#f3ecdc', GOLD = '#f0b445', WARM = '#ffd2a0';

// the gallery: one plinth per exhibit (x along the gallery; the crescograph stands back, beside Bose)
const EX = [
  { k: 'bose', x: 0.0, z: 0, w: 1.0, d: 0.42, h: 0.86, plaque: ['J. C. BOSE', 'CALCUTTA · 1895'] },
  { k: 'cresc', x: 1.12, z: -0.74, w: 0.46, d: 0.4, h: 0.74, plaque: ['CRESCOGRAPH', 'J. C. BOSE'] },
  { k: 'saha', x: 2.35, z: 0, w: 0.62, d: 0.5, h: 0.86, plaque: ['MEGHNAD SAHA', '1920'] },
  { k: 'chandra', x: 4.15, z: 0, w: 0.5, d: 0.5, h: 0.9, plaque: ['S. CHANDRASEKHAR', '1930'] },
  { k: 'kapany', x: 5.95, z: 0, w: 0.86, d: 0.52, h: 0.88, plaque: ['KAPANY · HOPKINS', '1954'] },
  { k: 'patel', x: 7.9, z: 0, w: 0.98, d: 0.44, h: 0.84, plaque: ['C. K. N. PATEL', 'BELL LABS · 1964'] },
  { k: 'jaipurFoot', x: 9.85, z: 0, w: 0.64, d: 0.42, h: 0.84, plaque: ['JAIPUR FOOT', 'SETHI · SHARMA · 1969'] },
  { k: 'usb', x: 11.65, z: 0, w: 0.72, d: 0.46, h: 0.92, plaque: ['UNIVERSAL SERIAL BUS', 'AJAY BHATT · INTEL · 1996'] },
  { k: 'upi', x: 13.4, z: 0, w: 0.5, d: 0.42, h: 0.98, plaque: ['UPI', 'NPCI · 2016'] },
];
const WALL_Z = -1.75;

export function create(ctx, segment) {
  const DUR = segment.end - segment.start;
  const beat = (k) => (CUES[CUE_NAMES[k]] != null ? CUES[CUE_NAMES[k]] - segment.start : BEATS[k]);
  const B = Object.fromEntries(Object.keys(BEATS).map((k) => [k, beat(k)]));
  B.cresc = B.bose;
  const SQ = OUTPUT_ASPECT < 1.5;
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.34;
  scene.fog = new THREE.FogExp2(0x070504, 0.075);
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.03, 120);
  A.setDetail(lite);
  const M = A.materials(ctx.env);

  // ---------------------------------------------------------------- the room
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 14, 1, 1), A.floorMaterial());
  floor.rotation.x = -Math.PI / 2; floor.position.set(6.5, 0, 5.25); floor.receiveShadow = true; scene.add(floor);
  const wallMat = A.wallMaterial();
  const WG = A.wallGeometries(-10, 24, WALL_Z, { bay: 3.6, H: 4.4, lite });
  const wall = new THREE.Mesh(WG.wall, wallMat); wall.receiveShadow = true; scene.add(wall);
  const trim = new THREE.Mesh(WG.trim, M.trim); trim.receiveShadow = true; scene.add(trim);
  scene.add(new THREE.Mesh(WG.brass, M.brassDark));
  // backdrop beyond the fog (the gallery falls away into warm dark)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vD; void main(){ float h = vD.y; vec3 c = mix(vec3(0.016, 0.011, 0.008), vec3(0.004, 0.003, 0.003), smoothstep(-0.1, 0.5, h)); gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.position.set(6.5, 1, 0); scene.add(sky);
  // ceiling track with its fixtures
  const trackY = 3.3;
  scene.add(new THREE.Mesh(A.merge([A.box(30, 0.03, 0.05, [6.5, trackY, 1.25]), A.box(30, 0.012, 0.012, [6.5, trackY - 0.02, 1.25])]), M.blackAnod));

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight('#4a3828', '#0a0705', 0.08); scene.add(hemi);
  const rim = new THREE.DirectionalLight('#ffe2c0', 0.9); rim.position.set(10, 10, -5); rim.target.position.set(6, 0.8, 0); scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight('#c8d4ff', 0.18); fill.position.set(-4, 3, 8); scene.add(fill);
  // two shadow keys that leapfrog along the gallery (even exhibits / odd exhibits): constant light count
  const keys = [0, 1].map(() => {
    const s = new THREE.SpotLight('#ffe0b8', 0, 9, 0.32, 0.75, 1.6);
    s.castShadow = true; s.shadow.mapSize.set(lite ? 512 : 1024, lite ? 512 : 1024); s.shadow.bias = -0.0002; s.shadow.normalBias = 0.01;
    s.shadow.camera.near = 0.5; s.shadow.camera.far = 6; scene.add(s, s.target); return s;
  });

  // ---------------------------------------------------------------- plinths, plaques, inlays, spots, shafts, washes
  const R = rng(1895);
  const plinths = EX.map((e, i) => {
    const g = new THREE.Group(); g.position.set(e.x, 0, e.z); scene.add(g);
    const PG = A.plinthGeometries(e.w, e.d, e.h);
    const body = new THREE.Mesh(PG.body, M.plinth), top = new THREE.Mesh(PG.top, M.marble), br = new THREE.Mesh(PG.brass, M.brass);
    for (const m of [body, top, br]) { m.castShadow = m.receiveShadow = true; g.add(m); }
    // plaque on the front, slightly tilted
    const plM = new THREE.MeshStandardMaterial({ map: A.plaqueTexture(e.plaque), metalness: 1, roughness: 0.34 });
    const pl = new THREE.Mesh(A.rbox(0.24, 0.07, 0.004, 0.0015), plM); pl.position.set(0, e.h - 0.17, e.d / 2 + 0.006); pl.rotation.x = -0.12; g.add(pl);
    for (const sx of [-1, 1]) g.add(new THREE.Mesh(A.cyl(0.0035, 0.0035, 0.003, 10, [sx * 0.108, e.h - 0.17, e.d / 2 + 0.0085], [Math.PI / 2, 0, 0]), M.brassDark));
    // the inlay strip that lights when the thread arrives
    const inlayM = new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: true });
    const inlay = new THREE.Mesh(A.box(0.008, e.h - 0.32, 0.002), inlayM); inlay.position.set(0, (e.h - 0.32) / 2 + 0.07, e.d / 2 + 0.0012); g.add(inlay);
    // spotlight from the track, a faint shaft in the haze, a warm wash on the wall behind
    const sp = new THREE.SpotLight(WARM, 0, 7, 0.36, 0.85, 1.8);
    sp.position.set(e.x - 0.45, trackY - 0.12, 1.25); sp.target.position.set(e.x, e.h + 0.12, e.z); scene.add(sp, sp.target);
    const fx = new THREE.Mesh(A.merge([A.cyl(0.035, 0.03, 0.12, 16, [0, -0.06, 0]), A.cyl(0.012, 0.012, 0.08, 8, [0, 0.04, 0])]), M.blackAnod);
    fx.position.copy(sp.position).add(V3(0, 0.08, 0)); fx.lookAt(sp.target.position); fx.rotateX(Math.PI / 2); fx.position.y += 0; scene.add(fx);
    const lensM = new THREE.MeshBasicMaterial({ color: '#000000' });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.027, 20), lensM); lens.position.copy(sp.position); lens.lookAt(sp.target.position); scene.add(lens);
    const dir = sp.target.position.clone().sub(sp.position), len = dir.length();
    const shaft = lightShaft({ length: len, radiusTop: 0.03, radiusBottom: 0.32, color: '#ffd8a8', intensity: 0 });
    shaft.position.copy(sp.position); shaft.quaternion.setFromUnitVectors(V3(0, -1, 0), dir.normalize()); scene.add(shaft);
    const washM = new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color('#ffb877') } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uI; uniform vec3 uC; varying vec2 vUv; void main(){ vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.25); float a = exp(-dot(p, p) * 7.0); gl_FragColor = vec4(uC * a * uI, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const wash = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.0), washM); wash.position.set(e.x + 0.15, 1.5, WALL_Z + 0.03); scene.add(wash);
    void R;
    return { e, g, inlayM, sp, lensM, shaft, washM, i };
  });

  // ---------------------------------------------------------------- the thread of light in the floor
  const pathPts = [V3(-2.2, 0, 1.0)];
  EX.forEach((e) => { if (e.k === 'cresc') return; pathPts.push(V3(e.x - e.w / 2 - 0.25, 0, 0.46), V3(e.x, 0, e.z + e.d / 2 + 0.1), V3(e.x + e.w / 2 + 0.25, 0, 0.46)); });
  pathPts.push(V3(16, 0, 1.0));
  const pathC = new THREE.CatmullRomCurve3(pathPts.map((p) => p.setY(0.0015)), false, 'centripetal');
  const thread = progressTube(pathC, { radius: 0.0035, segments: lite ? 260 : 900, radial: lite ? 3 : 4, color: '#ffbf6a', intensity: 0.32, tail: 0 });
  thread.scale.y = 0.35; scene.add(thread);
  const inlayGeo = new THREE.TubeGeometry(pathC, lite ? 260 : 900, 0.006, lite ? 3 : 4, false);
  const inlayPath = new THREE.Mesh(inlayGeo, M.brassDark); inlayPath.scale.y = 0.2; inlayPath.receiveShadow = true; scene.add(inlayPath);
  // arc parameter where the thread passes each plinth
  const uAt = (x) => { let best = 0, bd = 1e9; for (let i = 0; i <= 2000; i++) { const p = pathC.getPointAt(i / 2000); const dd = Math.abs(p.x - x) + Math.abs(p.z - 0.4) * 0.2; if (dd < bd) { bd = dd; best = i / 2000; } } return best; };
  const threadKeys = [[-0.6, uAt(-1.2)]];
  EX.forEach((e) => { if (e.k !== 'cresc') threadKeys.push([B[e.k] - 0.16, uAt(e.x)]); });
  threadKeys.push([DUR + 0.6, uAt(EX[EX.length - 1].x + 0.05)]);
  const onAt = (k) => B[k] - 0.14;       // the thread arrives

  // ---------------------------------------------------------------- the exhibits
  const ex = {};
  const place = (k, obj) => { const e = EX.find((q) => q.k === k); obj.group.position.set(e.x, e.h, e.z); scene.add(obj.group); ex[k] = { ...obj, e }; };
  place('bose', X.buildBose(M));
  place('cresc', X.buildCrescograph(M));
  place('saha', X.buildSaha(M));
  place('chandra', X.buildChandra(M, lite));
  place('kapany', X.buildFibre(M, lite));
  place('patel', X.buildLaser(M));
  place('jaipurFoot', X.buildJaipur(M, lite));
  place('usb', X.buildUSB(M));
  ex.usb.group.rotation.y = Math.PI;
  place('upi', X.buildUPI(M));
  scene.updateMatrixWorld(true);

  // ---- Bose: spark at the discharger, glow in the radiator, waves between the horns
  const bose = ex.bose;
  const spark = glowSprite({ color: '#cfe0ff', intensity: 2, scale: 0.03 }); bose.group.add(spark); spark.position.copy(bose.anchors.coilGap);
  const sparkLineGeo = new THREE.BufferGeometry(); sparkLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
  const sparkLine = new THREE.Line(sparkLineGeo, new THREE.LineBasicMaterial({ color: new THREE.Color('#dfe8ff').multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  bose.group.add(sparkLine);
  const txGlow = glowSprite({ color: '#ffe0b0', intensity: 0.5, scale: 0.04 }); txGlow.position.set(-0.2, bose.Y, 0); bose.group.add(txGlow);
  const waveMat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uO; varying vec2 vUv; void main(){ vec2 p = vUv * 2.0 - 1.0; float r = max(abs(p.x), abs(p.y)); float ring = exp(-((r - 0.86) * 14.0) * ((r - 0.86) * 14.0)) * (0.6 + 0.4 * sin(atan(p.y, p.x) * 6.0));
      gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * ring * uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const waves = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), waveMat.clone()); m.rotation.y = Math.PI / 2; bose.group.add(m); return m; });
  // ---- Saha
  const saha = ex.saha;
  const starGlows = saha.stars.map((s) => { const g = glowSprite({ color: '#' + s.col.getHexString(), intensity: 0.6, scale: 0.03 }); g.position.set(s.x, s.y, 0.17); saha.group.add(g); return g; });
  // ---- Chandrasekhar
  const ch = ex.chandra;
  const wdGlow = glowSprite({ color: '#cfe0ff', intensity: 1.0, scale: 0.08 }); wdGlow.position.copy(ch.anchors.star); ch.group.add(wdGlow);
  const marker = glowSprite({ color: '#fff0d0', intensity: 4, scale: 0.03 }); ch.group.add(marker);
  // ---- Kapany
  const kp = ex.kapany;
  const lampGlow = glowSprite({ color: '#ffd59a', intensity: 1.3, scale: 0.05 }); lampGlow.position.set(-0.215, 0.115, 0); kp.group.add(lampGlow);
  // ---- Patel
  const pt = ex.patel;
  const spotGlow = glowSprite({ color: '#ffb060', intensity: 3.5, scale: 0.035 }); spotGlow.position.copy(pt.spot); pt.group.add(spotGlow);
  const sparks = Array.from({ length: lite ? 8 : 16 }, (_, i) => { const s = glowSprite({ color: '#ffc070', intensity: 3, scale: 0.006 }); pt.group.add(s); return { s, a: R() * TAU, v: 0.25 + R() * 0.35, ph: R(), up: 0.2 + R() * 0.6, i }; });
  // ---- USB, UPI
  const usb = ex.usb, upi = ex.upi;
  const ledGlow = glowSprite({ color: '#7dffb0', intensity: 2.5, scale: 0.02 }); usb.group.add(ledGlow);
  usb.led.geometry.computeBoundingBox(); usb.led.geometry.boundingBox.getCenter(ledGlow.position);
  scene.updateMatrixWorld(true);

  // dust in the light
  const dust = new Dust({ count: lite ? 700 : 1600, size: [17, 2.6, 2.6], center: [6.7, 1.45, 0.25], particleSize: 0.006, color: '#ffe0b8', opacity: 0.4, intensity: 1.1, seed: 64 });
  scene.add(dust);

  // ---------------------------------------------------------------- HUD (open-matte aware; captions bottom-left)
  const hud = ctx.makeHUD();
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const next = (k) => { const ks = ['bose', 'saha', 'chandra', 'kapany', 'patel', 'jaipurFoot', 'usb', 'upi']; const i = ks.indexOf(k); return i < ks.length - 1 ? B[ks[i + 1]] : DUR + 0.3; };
  const CAPS = [
    { k: 'bose', main: 'J. C. BOSE · CALCUTTA · 1895', sub: 'MILLIMETRE-WAVE RADIO · HORN ANTENNAS · GALENA DETECTOR', tag: 'IEEE MILESTONE · 2012' },
    { k: 'saha', main: 'MEGHNAD SAHA · 1920', sub: "THE IONIZATION EQUATION · A STAR'S SPECTRUM GIVES ITS TEMPERATURE" },
    { k: 'chandra', main: 'S. CHANDRASEKHAR · 1930', sub: 'A WHITE DWARF CANNOT EXCEED ABOUT 1.4 SOLAR MASSES', tag: 'NOBEL PRIZE IN PHYSICS · 1983' },
    { k: 'kapany', main: 'NARINDER SINGH KAPANY & HAROLD HOPKINS · 1954', sub: 'A FLEXIBLE FIBRE-OPTIC IMAGING BUNDLE · NATURE', tag: 'KAPANY NAMED THE FIELD: FIBRE OPTICS' },
    { k: 'patel', main: 'C. KUMAR N. PATEL · BELL LABS · 1964', sub: 'THE CARBON-DIOXIDE LASER · INFRARED, 10.6 µm', tag: 'STILL A WORKHORSE OF CUTTING AND SURGERY' },
    { k: 'jaipurFoot', main: 'JAIPUR FOOT · 1969', sub: 'DR P. K. SETHI WITH CRAFTSMAN RAM CHANDRA SHARMA', tag: 'RUBBER AND WOOD · LOW COST · FITTED TO OVER A MILLION PEOPLE' },
    { k: 'usb', main: 'AJAY BHATT · INTEL · USB 1.0, 1996', sub: 'CO-INVENTOR OF THE UNIVERSAL SERIAL BUS, WITH THE INTEL TEAM AND INDUSTRY PARTNERS' },
    { k: 'upi', main: 'UPI · NPCI · 2016', sub: 'UNIFIED PAYMENTS INTERFACE · REAL-TIME PAYMENTS BY PHONE AND QR CODE', tag: 'NOW BILLIONS OF PAYMENTS A MONTH' },
  ];
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const caps = CAPS.map((c) => ({
    ...c, a: B[c.k] + 0.06, b: next(c.k) - 0.02,
    m: tpLeft(c.main, { font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: '#f6f2ea', intensity: 1.15 }, HX(0.16), HY(-0.78)),
    s: tpLeft(c.sub, { font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: INK, intensity: 0.85, size: 80 }, HX(0.165), HY(-0.838)),
    g: c.tag ? tpLeft(c.tag, { font: FONTS.mono, weight: 400, height: 0.021 * UI, letterSpacing: 0.26, color: GOLD, intensity: 1.1, size: 80 }, HX(0.165), HY(-0.885)) : null,
  }));
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.2), transparent: true, toneMapped: false }));
  hud.scene.add(rule);
  const CS = 0.03 * UI;
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UI, dy: dy * UI, size: CS, color: INK, intensity: 1.2, sub }); hud.scene.add(c); c.visible = false; return c; };
  const CALLS = [
    { c: mkCall('HORN ANTENNA', 'RADIATES MILLIMETRE WAVES', -0.26, 0.2), k: 'bose', at: bose.anchors.txHorn, a: 0.12, b: 0.62 },
    { c: mkCall('GALENA DETECTOR', 'A CRYSTAL AND A FINE SPRING', 0.26, 0.17), k: 'bose', at: bose.anchors.galena, a: 0.22, b: 0.62 },
    { c: mkCall('CRESCOGRAPH · J. C. BOSE', 'RECORDS THE GROWTH OF A PLANT', 0.22, 0.18), k: 'cresc', at: ex.cresc.anchors.plate, a: 0.6, b: 0.88 },
    { c: mkCall('HYDROGEN LINES PEAK NEAR 10,000 K', 'EXPLAINED BY IONIZATION', -0.3, 0.16), k: 'saha', at: saha.anchors.plateA, a: B.saha + 0.2, b: B.chandra - 0.06 },
    { c: mkCall('CHANDRASEKHAR LIMIT', 'ABOUT 1.4 SOLAR MASSES', 0.24, 0.14), k: 'chandra', at: ch.anchors.limit, a: B.chandra + 0.3, b: B.kapany - 0.06 },
    { c: mkCall('IMAGE CARRIED BY GLASS FIBRES', 'EACH FIBRE PIPES ONE POINT OF LIGHT', 0.24, 0.16), k: 'kapany', at: kp.anchors.screen, a: B.kapany + 0.32, b: B.patel - 0.05 },
    { c: mkCall('CO2 GLOW DISCHARGE', 'BETWEEN TWO MIRRORS', -0.24, 0.18), k: 'patel', at: pt.anchors.tube, a: B.patel + 0.1, b: B.jaipurFoot - 0.05 },
    { c: mkCall('VULCANISED RUBBER', 'MOULDED LIKE A REAL FOOT', -0.26, 0.16), k: 'jaipurFoot', at: ex.jaipurFoot.anchors.rubber, a: B.jaipurFoot + 0.08, b: B.usb - 0.05 },
    { c: mkCall('WOODEN ANKLE BLOCK', 'INSIDE MICROCELLULAR RUBBER', 0.24, 0.17), k: 'jaipurFoot', at: ex.jaipurFoot.anchors.wood, a: B.jaipurFoot + 0.16, b: B.usb - 0.05 },
    { c: mkCall('USB-A PLUG', 'FOUR CONTACTS · POWER AND DATA', 0.22, 0.17), k: 'usb', at: usb.anchors.plug, a: B.usb + 0.12, b: B.upi - 0.05 },
    { c: mkCall('SCAN · PAY · DONE', 'IN SECONDS, BANK TO BANK', 0.22, 0.15), k: 'upi', at: upi.anchors.standee, a: B.upi + 0.15, b: DUR + 0.3 },
  ];

  // ---------------------------------------------------------------- camera plan (one continuous move)
  const F = (k, dx = 0, dy = 0, dz = 0) => ex[k].group.localToWorld(ex[k].anchors.focus.clone()).add(V3(dx, dy, dz));
  const P = (k, dx, dy, dz) => { const e = EX.find((q) => q.k === k); return V3(e.x + dx, e.h + dy, e.z + dz); };
  const CAM = [
    [-0.15, P('bose', -0.78, 0.36, 1.12), F('bose', -0.16, -0.02, 0)],
    [B.bose + 0.45, P('bose', 0.0, 0.32, 0.98), F('bose', 0.1, -0.02, 0)],
    [B.saha - 0.24, P('bose', 0.66, 0.36, 0.92), P('cresc', 0.05, 0.16, 0)],
    [B.saha + 0.08, P('saha', -0.44, 0.4, 1.46), F('saha', 0.0, 0.04, 0)],
    [B.chandra - 0.14, P('saha', 0.2, 0.38, 1.38), F('saha', 0.06, 0.04, 0)],
    [B.chandra + 0.1, P('chandra', -0.34, 0.3, 0.92), F('chandra', 0.0, -0.01, 0)],
    [B.kapany - 0.13, P('chandra', 0.18, 0.26, 0.86), F('chandra', 0.03, 0.0, 0)],
    [B.kapany + 0.09, P('kapany', -0.36, 0.34, 0.98), F('kapany', 0.0, 0.0, 0)],
    [B.patel - 0.12, P('kapany', 0.2, 0.32, 0.92), F('kapany', 0.06, -0.01, 0)],
    [B.patel + 0.08, P('patel', -0.42, 0.24, 0.92), F('patel', 0.0, 0.0, 0)],
    [B.jaipurFoot - 0.11, P('patel', 0.16, 0.24, 0.86), F('patel', 0.1, 0.0, 0)],
    [B.jaipurFoot + 0.08, P('jaipurFoot', -0.3, 0.42, 0.72), F('jaipurFoot', 0.0, 0.0, 0)],
    [B.usb - 0.11, P('jaipurFoot', 0.14, 0.4, 0.68), F('jaipurFoot', 0.05, 0.0, 0)],
    [B.usb + 0.08, P('usb', -0.28, 0.3, 0.66), F('usb', 0.0, 0.0, 0)],
    [B.upi - 0.11, P('usb', 0.14, 0.28, 0.6), F('usb', 0.05, 0.0, 0)],
    [B.upi + 0.1, P('upi', -0.22, 0.24, 0.62), F('upi', 0.0, 0.0, 0)],
    [DUR + 0.1, P('upi', -0.02, 0.15, 0.26), F('upi', -0.03, 0.02, 0.02)],
  ];
  const camK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[1][c]]));
  const lookK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[2][c]]));
  const ORDER = ['bose', 'saha', 'chandra', 'kapany', 'patel', 'jaipurFoot', 'usb', 'upi'];
  const focusOf = (t) => { let k = ORDER[0]; for (const q of ORDER) if (t >= B[q] - 0.12) k = q; return k; };

  // ---------------------------------------------------------------- HUD projection
  const tmp3 = V3();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv)) * HH, 0);
    return out;
  };

  const camPos = V3(), look = V3(), tmp = V3(), tmp2 = V3();
  const _a = V3(), _b = V3();
  const distToSeg = (p, a, b) => { _a.copy(b).sub(a); const u = Math.min(1, Math.max(0, _b.copy(p).sub(a).dot(_a) / _a.lengthSq())); return _b.copy(a).addScaledVector(_a, u).distanceTo(p); };
  const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  const api = {
    scene, camera, hud, dof: { focus: 1.2, range: 0.6, amount: 0.35 }, bloom: { strength: 0.75 }, exposure: 1, harmony: 0.85, background: 0x050403,
    exploreLimits: { yaw: 1.1, pitchDown: 0.45, pitchUp: 0.55, zoomIn: 0.15, zoomOut: 2.6 },
    arSubject: (t) => { const k = focusOf(t); return { centre: F(k), radius: 0.42 }; },
    update(t, info) {
      const T = info?.T ?? t + segment.start;
      const bp = pulse(T, { decay: 6 });

      // -------- camera
      const tc = Math.min(Math.max(t, -0.15), DUR + 0.1);
      camPos.set(timeWarp(tc, camK[0]), timeWarp(tc, camK[1]), timeWarp(tc, camK[2]));
      look.set(timeWarp(tc, lookK[0]), timeWarp(tc, lookK[1]), timeWarp(tc, lookK[2]));
      camPos.y += Math.sin(t * 1.1) * 0.006; camPos.x += Math.sin(t * 0.7 + 1) * 0.008;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.8) * 0.01, 1, 0).normalize();
      camera.lookAt(look);
      camera.fov = 32 - 2 * ramp(t, B.upi + 0.2, DUR + 0.1, ease.inQuad);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // -------- the thread and the plinths waking
      const prog = timeWarp(Math.min(Math.max(t, -0.6), DUR + 0.6), threadKeys);
      thread.progress = Math.max(0.0001, Math.min(1, prog)); thread.opacity = 1;
      for (const p of plinths) {
        const k = p.e.k, on = k === 'cresc' || k === 'bose' ? 1 : ramp(t, onAt(k), onAt(k) + 0.25, ease.outCubic);
        const flash = k === 'cresc' || k === 'bose' ? 0 : envelope(t, onAt(k), onAt(k) + 0.45, 0.05, 0.35);
        p.inlayM.color.set('#ffbf6a').multiplyScalar(0.05 + 1.6 * on + 2.5 * flash);
        p.sp.intensity = 6.5 * (0.12 + 0.88 * on);
        p.lensM.color.set('#ffe2b8').multiplyScalar(0.1 + 1.1 * on);
        const sd = distToSeg(camera.position, p.sp.position, p.sp.target.position);
        p.shaft.material.uniforms.uIntensity.value = 0.012 * (0.15 + 0.85 * on) * ramp(sd, 0.6, 1.6, ease.linear);
        p.washM.uniforms.uI.value = 0.035 * (0.15 + 0.85 * on);
      }
      // shadow keys: even exhibits on key 0, odd on key 1; each fades up at its exhibit and down as the next takes over
      keys[0].intensity = keys[1].intensity = 0;
      ORDER.forEach((k, i) => {
        const s = keys[i % 2], nxt = ORDER[i + 1];
        const a = B[k] - 0.18, b = nxt ? B[nxt] + 0.12 : DUR + 1;
        if (t >= a - 0.2 && t < b) {
          const e = EX.find((q) => q.k === k);
          s.position.set(e.x - 0.9, e.h + 1.6, e.z + 1.2); s.target.position.set(e.x, e.h + 0.1, e.z);
          s.intensity = 4 * envelope(t, a, b, 0.18, 0.18);
        }
      });

      // -------- Bose
      const bOn = 1 - ramp(t, B.chandra, B.chandra + 0.2);
      const fr = Math.floor(t * 26), sparkOn = bOn > 0 && h1(fr) > 0.35 && t < B.saha + 0.6;
      spark.visible = sparkOn; sparkLine.visible = sparkOn; txGlow.visible = bOn > 0;
      if (sparkOn) {
        spark.scale.setScalar(0.02 + 0.018 * h1(fr + 3));
        const pa = sparkLineGeo.attributes.position, c = bose.anchors.coilGap;
        for (let i = 0; i < 9; i++) { const u = i / 8; pa.setXYZ(i, c.x - 0.0115 + 0.023 * u, c.y + (i % 8 ? (h1(fr * 9 + i) - 0.5) * 0.006 : 0), c.z + (i % 8 ? (h1(fr * 13 + i) - 0.5) * 0.004 : 0)); }
        pa.needsUpdate = true;
      }
      txGlow.material.opacity = sparkOn ? 0.9 : 0.25;
      bose.key.rotation.z = sparkOn ? -0.06 : 0;
      waves.forEach((w, i) => {
        const u = (t * 1.5 + i / waves.length) % 1;
        w.position.set(-0.118 + 0.236 * u, bose.Y, 0);
        const s = 1 + 0.25 * Math.sin(u * Math.PI);
        w.scale.set(s, s, 1);
        w.material.uniforms.uO.value = 0.12 * Math.sin(Math.PI * u) * bOn * (u > 0.5 ? 0.75 : 1);
        w.visible = bOn > 0;
      });
      const kick = ramp(t, 0.1, 0.3, ease.outBack) - 0.4 * ramp(t, 0.6, 1.0);
      bose.needle.rotation.y = 0.75 * kick + 0.04 * Math.sin(t * 23) * kick;

      // -------- Saha
      saha.eq.material.uniforms.uReveal.value = ramp(t, B.saha + 0.02, B.saha + 0.5, ease.inOutSine);
      saha.eq.material.uniforms.uOp.value = ramp(t, onAt('saha'), B.saha + 0.05);
      const sOn = ramp(t, onAt('saha'), onAt('saha') + 0.2);
      saha.plate.color.setScalar(0.05 + 0.4 * sOn);
      starGlows.forEach((g, i) => { g.material.opacity = sOn * (0.7 + 0.3 * Math.sin(t * 5 + i)); });
      saha.stars.forEach((st) => st.m.material.color.copy(st.col).multiplyScalar(0.1 + 0.75 * sOn));

      // -------- Chandrasekhar
      const m = lerp(0.55, 1.42, ramp(t, B.chandra - 0.05, B.chandra + 0.5, ease.inOutSine));
      const rr = A.wdRadius(m) / A.wdRadius(0.55);
      ch.star.scale.setScalar(0.35 + 0.65 * rr);
      const cOn = ramp(t, onAt('chandra'), onAt('chandra') + 0.25);
      ch.starMat.uniforms.uI.value = (0.4 + 0.8 * cOn) * (1 + 0.5 * (1 - rr));
      wdGlow.scale.setScalar((0.05 + 0.05 * rr) * (0.4 + 0.6 * cOn));
      ch.toPlot(m, marker.position); marker.visible = cOn > 0.05;
      ch.plot.material.uniforms.uReveal.value = ramp(t, onAt('chandra'), B.chandra + 0.5, ease.inOutSine);
      ch.plot.material.uniforms.uOp.value = 0.3 + 0.7 * cOn;

      // -------- Kapany & Hopkins
      const kOn = ramp(t, B.kapany - 0.08, B.kapany + 0.05);
      kp.fibreU.uT.value = t; kp.fibreU.uOn.value = kOn; kp.fibreU.uFront.value = ramp(t, B.kapany - 0.02, B.kapany + 0.32, ease.inOutSine) * 1.05;
      kp.screenU.uOn.value = ramp(t, B.kapany + 0.26, B.kapany + 0.38);
      kp.coneM.opacity = kp.screenU.uOn.value;
      kp.lens.material.color.set('#ffd9a0').multiplyScalar(0.15 + 1.6 * kOn);
      kp.slide.material.color.setScalar(0.1 + 1.5 * kOn);
      lampGlow.visible = kOn > 0.01; lampGlow.material.opacity = kOn;

      // -------- Patel
      const strike = t - (B.patel - 0.04);
      const pOn = strike > 0 ? Math.min(1, strike / 0.03) * (0.85 + 0.15 * h1(Math.floor(t * 40))) : 0;
      pt.plasmaU.uT.value = t; pt.plasmaU.uI.value = 0.7 * pOn * (1 + 1.2 * Math.exp(-Math.max(0, strike) * 10));
      const bOnL = ramp(t, B.patel + 0.12, B.patel + 0.2);
      pt.beamU.uT.value = t; pt.beamU.uI.value = 0.18 * bOnL;
      spotGlow.visible = bOnL > 0; spotGlow.scale.setScalar(0.02 + 0.02 * bOnL + 0.005 * Math.sin(t * 50));
      pt.char.material.opacity = 0.85 * ramp(t, B.patel + 0.15, B.patel + 0.5);
      sparks.forEach((sp) => {
        const age = ((t - B.patel - 0.15) * 2.2 + sp.ph) % 1;
        const ok = t > B.patel + 0.15 && t < DUR + 1;
        sp.s.visible = ok;
        if (ok) { const tau = age * 0.25; sp.s.position.set(pt.spot.x - Math.cos(sp.a) * sp.v * tau * 0.4 - 0.002, pt.spot.y + sp.up * tau - 2.5 * tau * tau, pt.spot.z + Math.sin(sp.a) * sp.v * tau * 0.5); sp.s.material.opacity = 1 - age; }
      });

      // -------- USB
      const ins = ramp(t, B.usb + 0.06, B.usb + 0.36, ease.inOutCubic);
      usb.plug.position.x = usb.XB - usb.insertDepth + (1 - ins) * 0.075;
      const ledOn = ramp(t, B.usb + 0.38, B.usb + 0.42);
      usb.led.material.color.set('#7dffb0').multiplyScalar(0.05 + 2.2 * ledOn);
      ledGlow.visible = ledOn > 0; ledGlow.material.opacity = ledOn;

      // -------- UPI
      const paid = ramp(t, B.upi + 0.3, B.upi + 0.38);
      upi.scrU.uScan.value = 0.28 + 0.44 * (0.5 + 0.5 * Math.sin((t - B.upi) * 11));
      upi.scrU.uMix.value = paid;
      upi.scrU.uFlash.value = envelope(t, B.upi + 0.3, B.upi + 0.7, 0.03, 0.3);
      upi.scrU.uI.value = (0.48 + 0.1 * ramp(t, onAt('upi'), B.upi)) * (1 + 0.25 * paid);

      // -------- captions and call-outs
      let ruleW = 0, ruleOp = 0;
      for (const c of caps) {
        const e = envelope(t, c.a, c.b, 0.08, 0.08), p = ramp(t, c.a, c.a + 0.2, ease.outCubic);
        c.m.opacity = e; c.m.reveal = p;
        c.s.opacity = e; c.s.reveal = ramp(t, c.a + 0.05, c.a + 0.28, ease.outCubic);
        if (c.g) { c.g.opacity = e; c.g.reveal = ramp(t, c.a + 0.1, c.a + 0.34, ease.outCubic); }
        if (e > ruleOp) { ruleOp = e; ruleW = 0.95 * UI * p; }
      }
      rule.visible = ruleOp > 0.001; rule.material.opacity = ruleOp * 0.6;
      rule.scale.x = Math.max(0.001, ruleW); rule.position.set(HX(0.16) + ruleW / 2, HY(-0.73), 0);
      for (const q of CALLS) {
        const op = envelope(t, q.a, q.b, 0.06, 0.08), p = ramp(t, q.a, q.a + 0.25, ease.outCubic);
        tmp2.copy(ex[q.k].group.localToWorld(tmp.copy(q.at)));
        projHud(tmp2, q.c.position); q.c.reveal(p, op); q.c.visible = op > 0.001 && tmp3.z < 0;
      }

      // -------- atmosphere, lens
      dust.tick(t, info);
      const fk = focusOf(t), fp = F(fk);
      api.dof.focus = camera.position.distanceTo(fp); api.dof.range = 0.45 + 0.25 * api.dof.focus; api.dof.amount = 0.3;
      api.bloom.strength = 0.75 + 0.15 * envelope(t, B.patel - 0.05, B.patel + 0.3, 0.03, 0.2) + 0.25 * ramp(t, B.upi + 0.3, DUR + 0.1, ease.inQuad);
      api.exposure = 1.0 + 0.06 * envelope(t, B.upi + 0.3, B.upi + 0.7, 0.03, 0.3) + 0.15 * ramp(t, DUR - 0.3, DUR + 0.1, ease.inQuad);
    },
  };
  return api;
}
