// THE DREAM OF FLIGHT (53.5 – 58.0 s) — from an epic's dream to a jet climbing toward space, in five shots that
// get shorter and faster as the orchestra builds toward the ISRO launch.
//   pushpaka 53.6  THE DREAM (legend): the Pushpaka Vimana of the Ramayana as an illustrated manuscript come alive —
//                  a gold pavilion-chariot with a swan prow and a peacock-fan stern drifts slowly through scalloped,
//                  gold-edged painted clouds under a lapis band (miniature palette, ink outline). Dreamlike, slow.
//                  Toward the cut the painted clouds rise over the lens …
//   airmail  54.6  … and dissolve into real cloud that parts over Allahabad, 18 February 1911: the exhibition
//                  grounds by the river (shamianas, tents, white pavilions, a crowd), the Humber-Sommer pusher
//                  biplane (linen wings, spruce struts, wire bracing, box tail, rotary engine, mail bags) rolls,
//                  lifts off and climbs away toward the river; the camera cranes up and the water is revealed.
//   tataMail 55.8  hit: Juhu beach, Bombay, 1932 — J. R. D. Tata's Puss Moth whips low along the sand past the lens.
//   marut    56.6  above the cloud deck the HF-24 Marut streaks across (speed lines, a sun glint on the canopy).
//   tejas    57.1  Tejas pulls up into the vertical on afterburner, punches through a cloud layer and climbs into the
//                  darkening blue; the camera rises after it for the 'zoom' into ISRO.
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, rng, TAU } from '../../lib/math.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout } from '../../lib/hud.js';
import { plume, plumeMat } from './isro-assets.js';
import * as A from './flight-assets.js';

const V3 = A.V3;

export function create(ctx, segment) {
  const cue = (n) => CUES[n] - segment.start;
  const tP = cue('pushpaka'), tA = cue('airmail'), tT = cue('tataMail'), tM = cue('marut'), tJ = cue('tejas');
  const DUR = segment.end - segment.start;
  const SQ = OUTPUT_ASPECT < 1.5;
  const lite = ctx.engine?.quality === 'lite';
  const R = rng(1911);

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.fog = new THREE.Fog(0xffffff, 1e5, 2e5);
  const camera = new THREE.PerspectiveCamera(30, ctx.aspect, 0.1, 5000);
  const M = A.flightMaterials();

  // ---------------------------------------------------------------- one constant set of lights, re-aimed per shot
  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.castShadow = true; key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  const rim = new THREE.DirectionalLight('#ffffff', 1);
  const hemi = new THREE.HemisphereLight('#ffffff', '#000000', 0.5);
  scene.add(key, key.target, rim, rim.target, hemi);
  const setKey = (dir, color, intensity, center, half, far = 200) => {
    key.color.set(color); key.intensity = intensity;
    key.target.position.copy(center); key.position.copy(center).addScaledVector(dir, far * 0.5);
    const c = key.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 0.5; c.far = far; c.updateProjectionMatrix();
  };
  const setRim = (dir, color, intensity, center) => { rim.color.set(color); rim.intensity = intensity; rim.target.position.copy(center); rim.position.copy(center).addScaledVector(dir, 50); };
  const setHemi = (sky, ground, i) => { hemi.color.set(sky); hemi.groundColor.set(ground); hemi.intensity = i; };
  const setFog = (col, near, far) => { scene.fog.color.set(col); scene.fog.near = near; scene.fog.far = far; };

  // skies (camera-centred)
  const pSky = A.makePaintedSky(); scene.add(pSky);
  const SKU = A.skyUniforms();
  const rSky = A.makeRealSky(SKU); scene.add(rSky);
  const setSky = (zen, hor, haze, sun, sunDir, { space = 0, cloud = 1, gain = 1 } = {}) => {
    SKU.uZen.value.set(zen); SKU.uHor.value.set(hor); SKU.uHaze.value.set(haze); SKU.uSunCol.value.set(sun); SKU.uSun.value.copy(sunDir);
    SKU.uSpace.value = space; SKU.uCloud.value = cloud; SKU.uGain.value = gain;
  };

  const worlds = [];
  const mk = () => { const g = new THREE.Group(); g.visible = false; scene.add(g); worlds.push(g); return g; };

  // ================================================================ 1 · THE DREAM — the painted world
  const w1 = mk();
  const vim = A.buildVimana(M); w1.add(vim.group);
  const cloudTex = A.paintedCloudAtlas(11);
  const cardMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: new THREE.Color(0.92, 0.9, 0.86) });
  const cards = [];
  const addCard = (x, y, z, w, speed) => {
    const m = new THREE.Mesh(A.paintedCloudGeo(Math.floor(R() * 4), w), cardMat);
    m.position.set(x, y, z); m.userData = { x, y, z, speed, bob: R() * TAU }; m.renderOrder = -5 - Math.round(-z); w1.add(m); cards.push(m);
  };
  for (let i = 0; i < 9; i++) addCard(-8 + i * 1.8 + R() * 0.8, -0.9 - R() * 0.9, -2.8 + R() * 5.2, 3.6 + R() * 2.2, 0.25);          // the bed the vimana rides on
  for (let i = 0; i < 22; i++) addCard(-30 + R() * 64, -7 + R() * 13, -14 - R() * 34, 7 + R() * 9, 0.12);                           // far banks
  for (let i = 0; i < 6; i++) addCard(-7 + i * 3 + R(), -3.9 + R() * 1.3, 4.5 + R() * 3.5, 2.8 + R() * 1.4, 0.6);                    // foreground, drifting fast (parallax)
  const sunCard = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: A.paintedSunTexture(), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.5, 1.3, 1.0) }));
  sunCard.position.set(-17, 8.5, -38); sunCard.renderOrder = -60; w1.add(sunCard);
  // a few painted birds (cranes) in a loose skein, as the miniatures draw them
  const birdG = A.merge([A.plate([[0, 0], [0.5, 0.18], [0.9, 0.1], [0.5, 0.06], [0.05, -0.02], [-0.5, 0.06], [-0.9, 0.1], [-0.5, 0.18]], 0.01, 0)]);
  const birds = [];
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(birdG, new THREE.MeshBasicMaterial({ color: '#2a1608', fog: false, side: THREE.DoubleSide })); b.userData = { x: -12 + i * 1.3 + R(), y: 6.2 + Math.abs(i - 3) * 0.5 + R() * 0.3, z: -16, ph: R() * TAU }; b.scale.setScalar(0.55); w1.add(b); birds.push(b); }

  // the wipe: painted clouds rise over the lens and become real cloud, which parts over Allahabad (camera-attached)
  const wipe = new THREE.Group(); scene.add(wipe);
  const wipeMat = cardMat.clone(); wipeMat.depthTest = false;
  const wipeCards = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) {
    const w = 2.6 + R() * 0.6, m = new THREE.Mesh(A.paintedCloudGeo((row + i) % 4, w), wipeMat);
    m.userData = { x: -2.3 + i * 1.15 + (R() - 0.5) * 0.3 + (row % 2) * 0.5, y: [-0.55, 0.2, 0.9][row], z: -3.0 - row * 0.12 - R() * 0.1, d: row * 0.06 + R() * 0.05 };
    m.renderOrder = 900 + row; wipe.add(m); wipeCards.push(m);
  }
  const puffTex = A.puffTexture(7);
  const WP = 110, wipePuffs = new A.SoftPoints(WP, { map: puffTex, near: 0.2 });
  wipePuffs.material.depthTest = false; wipePuffs.renderOrder = 950;
  const wpData = []; for (let i = 0; i < WP; i++) wpData.push({ x: -2.6 + R() * 5.2, y: -1.1 + R() * 2.2, z: -2.4 - R() * 1.2, s: 0.9 + R() * 0.9, rot: R() * TAU, sh: R() });
  wipe.add(wipePuffs);

  // ================================================================ 2 · ALLAHABAD, 18 FEBRUARY 1911 (metres; river toward −Z)
  const w2 = mk();
  const SUN2 = V3(0.55, 0.3, -0.78).normalize();
  {
    const gt = A.groundTexture('earth', 7); gt.repeat.set(300, 300);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#d8c8a8', map: gt, roughness: 0.96 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; w2.add(ground);
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(4000, 16), new THREE.MeshStandardMaterial({ color: '#cdb994', roughness: 0.9 }));
    bank.rotation.x = -Math.PI / 2; bank.position.set(0, 0.03, -72); w2.add(bank);
    const river = A.makeWater(SKU, 4000, 1140, { body: '#3a4a3c', silt: '#6f6040', fadeFar: 1300 }); river.position.set(0, 0.06, -80 - 570); w2.add(river);
    // the far bank: a low line of trees at Naini, hazed by distance
    const tg = new THREE.IcosahedronGeometry(1, 1), far = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#4a5a38', roughness: 1 }), 140);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) { const s = 7 + R() * 9; mtx.compose(V3(-1700 + i * 25 + R() * 12, s * 0.5, -1225 - R() * 40), new THREE.Quaternion(), V3(s * 1.4, s * (0.8 + R() * 0.4), s)); far.setMatrixAt(i, mtx); }
    w2.add(far);
    const farLand = new THREE.Mesh(new THREE.PlaneGeometry(4000, 400), new THREE.MeshStandardMaterial({ color: '#8a7a58', roughness: 1 }));
    farLand.rotation.x = -Math.PI / 2; farLand.position.set(0, 0.1, -1420); w2.add(farLand);
  }
  // exhibition: shamianas, bell tents, two white pavilions, flags, shade trees — along both sides of the open field
  {
    const roofs = [], vals = [], poles = [], bells = [], walls = [], arches = [], crowns = [], trunks = [];
    for (const [x, z, w, d, ry] of [[-44, -16, 11, 7, 0.1], [-40, -40, 9, 7, -0.05], [-62, -28, 12, 8, 0.2], [37, -20, 10, 7, -0.1], [52, -42, 12, 8, 0.05], [64, -12, 9, 6, 0.3], [-30, -60, 8, 6, 0], [28, -58, 9, 6, 0]]) {
      const s = A.shamianaGeo(w, d, 3.2);
      for (const [list, geo] of [[roofs, s.roof], [vals, s.val], [poles, s.poles]]) list.push(A.bake(geo, [x, 0, z], [0, ry, 0]));
    }
    for (let i = 0; i < 16; i++) { const sx = i % 2 ? 1 : -1; bells.push(A.bake(A.bellTentGeo(2 + R() * 0.7, 4.2 + R() * 0.8), [sx * (30 + R() * 55), 0, -4 - R() * 58])); }
    for (const [x, z, w, d, h, ry] of [[-82, -52, 26, 11, 7, 0.25], [86, -46, 30, 11, 8, -0.3]]) { const p = A.pavilionGeo(w, d, h); walls.push(A.bake(p.wall, [x, 0, z], [0, ry, 0])); arches.push(A.bake(p.arch, [x, 0, z], [0, ry, 0])); }
    for (const [x, z, h] of [[-50, 4, 9], [-36, 8, 8], [44, 2, 10], [70, -30, 9], [-96, -20, 11], [100, -8, 10], [-24, -70, 7], [22, -70, 8], [-120, -60, 12], [120, -64, 12]]) { const tr = A.treeGeo(Math.floor(R() * 99), h); crowns.push(A.bake(tr.crown, [x, 0, z])); trunks.push(A.bake(tr.trunk, [x, 0, z])); }
    const add = (geos, mat) => { const m = new THREE.Mesh(A.merge(geos), mat); m.castShadow = true; m.receiveShadow = true; w2.add(m); return m; };
    add(roofs, M.tentStripe); add(vals, M.tentStripe); add(poles, M.pole); add(bells, M.tent); add(walls, M.plaster); add(arches, M.arch); add(crowns, M.foliage); add(trunks, M.trunk);
    // pennants on tall poles round the field
    const fl = [], fp = [];
    for (let i = 0; i < 14; i++) { const x = (i % 2 ? 1 : -1) * (26 + (i >> 1) * 6), z = -2 - (i >> 1) * 8; fp.push(A.cyl(0.05, 0.06, 8, 5, [x, 4, z])); fl.push(A.bake(A.plate([[0, 0], [1.6, -0.35], [0, -0.7]], 0.01, 0), [x, 7.9, z], [0, 0.4, 0])); }
    add(fp, M.pole); add(fl, M.flag);
  }
  // the crowd: lines along both sides of the field, a knot by the camera, people on the river bank
  {
    const spots = [];
    for (let i = 0; i < 260; i++) { const sx = i % 2 ? 1 : -1; spots.push([sx * (20 + R() * 6), -56 + R() * 58]); }
    for (let i = 0; i < 60; i++) spots.push([-22 + R() * 44, -64 - R() * 5]);
    for (let i = 0; i < 26; i++) spots.push([-19 + R() * 10, 1 + R() * 6]);
    for (let i = 0; i < 18; i++) spots.push([-6 + R() * 12, 14 + R() * 5]);
    w2.add(A.buildCrowd(M, spots, 4));
  }
  const som = A.buildSommer(M); w2.add(som.group);
  const somAt = (t, out) => {
    const tau = t - tA, lift = Math.max(0, tau - 0.32);
    out.set(-16 + 15 * tau + 3 * tau * tau, 2.6 * lift * lift + 1.1 * lift, -12 - 2.2 * tau * tau);
    return out;
  };

  // ================================================================ 3 · JUHU, BOMBAY, 15 OCTOBER 1932 (sea toward −Z)
  const w3 = mk();
  const SUN3 = V3(-0.38, 0.72, 0.58).normalize();
  {
    const st = A.groundTexture('sand', 9); st.repeat.set(300, 300);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ color: '#f4e6cc', map: st, roughness: 0.92 }));
    sand.rotation.x = -Math.PI / 2; sand.receiveShadow = true; w3.add(sand);
    const wet = new THREE.Mesh(new THREE.PlaneGeometry(4000, 12), new THREE.MeshStandardMaterial({ color: '#8a7658', roughness: 0.16, metalness: 0.1, map: st, envMapIntensity: 1.6 }));
    wet.rotation.x = -Math.PI / 2; wet.position.set(0, 0.02, -12); wet.receiveShadow = true; w3.add(wet);
    const sea = A.makeWater(SKU, 4000, 2400, { body: '#14485a', silt: '#2f6a68', waveK: 1.6, fadeFar: 1800 }); sea.position.set(0, 0.05, -18 - 1200); w3.add(sea);
    const palms = [], fronds = [];
    for (let i = 0; i < 30; i++) { const p = A.palmGeos(i * 7 + 3, 8 + R() * 5); const x = -150 + i * 10 + R() * 6, z = 24 + R() * 40; palms.push(A.bake(p.trunk, [x, 0, z])); fronds.push(A.bake(p.fronds, [x, 0, z])); }
    const pm = new THREE.Mesh(A.merge(palms), M.trunk), fm = new THREE.Mesh(A.merge(fronds), M.palmFrond);
    for (const m of [pm, fm]) { m.castShadow = true; m.receiveShadow = true; w3.add(m); }
    const spots = []; for (let i = 0; i < 22; i++) spots.push([10 + R() * 14, 3 + R() * 6]);
    w3.add(A.buildCrowd(M, spots, 9));
  }
  const foam = [];
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(4000, 0.7 + i * 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.97, 1.0).multiplyScalar(1.1 - i * 0.25), transparent: true, opacity: 0.75 - i * 0.2, depthWrite: false })); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.07, -18.5 - i * 4); w3.add(f); foam.push(f); }
  const puss = A.buildPussMoth(M); w3.add(puss.group);
  const pussAt = (t, out) => { const tau = t - tT; return out.set(-17 + 31 * tau, 1.75 + 3.3 - 1.3 * tau, -2.2); };

  // ================================================================ 4–5 · ABOVE THE CLOUDS (metres)
  const w4 = mk();
  const SUN4 = V3(0.35, 0.5, -0.79).normalize();
  const DECK_N = lite ? 520 : 1000, LAYER_N = lite ? 160 : 300;
  const deck = new A.SoftPoints(DECK_N + LAYER_N, { map: A.puffTexture(3), near: 3 });
  const deckData = [];
  for (let i = 0; i < DECK_N; i++) { const y = -75 + R() * 40; deckData.push({ x: -600 + R() * 1200, y, z: -800 + R() * 950, s: 34 + R() * 40, a: 0.3 + R() * 0.3, rot: R() * TAU, top: (y + 75) / 40 }); }
  for (let i = 0; i < LAYER_N; i++) { const y = 24 + R() * 16; deckData.push({ x: -80 + R() * 160, y, z: -150 + R() * 200, s: 10 + R() * 14, a: 0.22 + R() * 0.2, rot: R() * TAU, top: 0.6 + (y - 24) / 40 }); }
  w4.add(deck);
  const marut = A.buildMarut(M); w4.add(marut.group);
  const MA = V3(-95, 5, -44), MB = V3(52, -2, 5), MD = MB.clone().sub(MA).normalize();
  const marutAt = (t, out) => out.copy(MA).lerp(MB, (t - tM + 0.06) / 0.62);
  const marutQ = new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), MD).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -0.42));
  marut.group.quaternion.copy(marutQ);
  const marutGlow = marut.nozzles.map((p) => { const s = glowSprite({ color: '#ffb880', intensity: 1.2, scale: 1.4 }); s.position.copy(p); marut.group.add(s); return s; });
  const glint = glowSprite({ color: '#fff6e6', intensity: 5, scale: 1 }); w4.add(glint);
  const tej = A.buildTejas(M); w4.add(tej.group);
  const abCore = plume(0.3, 0.12, 3.2, plumeMat('#fff0d8', 3.4, { diamonds: 0.8 })), abOut = plume(0.45, 0.9, 7.5, plumeMat('#ff9a50', 1.4, { alpha: 0.7 }));
  for (const p of [abCore, abOut]) { p.position.copy(tej.nozzle); p.rotation.z = -Math.PI / 2; tej.group.add(p); }
  const abGlow = glowSprite({ color: '#ffc890', intensity: 4, scale: 6 }); abGlow.position.copy(tej.nozzle); tej.group.add(abGlow);
  const J0 = V3(6, -3, -12), VJ = 170;
  const thetaJ = (tau) => (Math.PI / 2) * ramp(tau, 0.03, 0.42, ease.inOutSine);
  const tejAt = (t, out) => {
    const tau = t - tJ, T = Math.max(0, tau), n = 40, h = T / n; let y = 0, z = 0;
    for (let i = 0; i < n; i++) { const th = thetaJ((i + 0.5) * h); y += Math.sin(th) * VJ * h; z -= Math.cos(th) * VJ * h; }
    return out.set(J0.x, J0.y + y, J0.z + z - Math.min(0, tau) * VJ);
  };
  const tejQ = (t, out) => {
    const th = thetaJ(t - tJ);
    return out.setFromAxisAngle(V3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), th)).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), 0.25 * Math.sin(Math.PI * ramp(t - tJ, 0.3, 0.9, ease.linear))));
  };
  // wingtip vortices during the pull-up
  const VAP_N = 200, vap = new A.SoftPoints(VAP_N, { map: A.puffTexture(5), near: 0.5 }); w4.add(vap);
  // speed lines (camera-attached) across the Marut pass
  const SL_N = 60, slPos = new Float32Array(SL_N * 6), slData = [];
  for (let i = 0; i < SL_N; i++) slData.push({ x: R() * 24 - 12, y: (R() - 0.5) * 5, z: -6 - R() * 8, len: 0.8 + R() * 2.4, sp: 30 + R() * 30 });
  const slGeo = new THREE.BufferGeometry(); slGeo.setAttribute('position', new THREE.BufferAttribute(slPos, 3));
  const speedLines = new THREE.LineSegments(slGeo, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  speedLines.frustumCulled = false; wipe.add(speedLines);

  // ================================================================ HUD (open-matte aware; captions bottom-left)
  const hud = ctx.makeHUD();
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const INK = '#f3ecdc', GOLD = '#f0b445';
  const CAPS = [
    { a: tP + 0.2, b: tA - 0.08, main: 'PUSHPAKA VIMANA · THE RAMAYANA', sub: "AN EPIC'S DREAM OF FLIGHT", tag: 'LEGEND' },
    { a: tA + 0.12, b: tT - 0.04, main: '18 FEBRUARY 1911 · ALLAHABAD → NAINI', sub: "HENRI PEQUET · THE WORLD'S FIRST OFFICIAL AIRMAIL · ABOUT 6,500 LETTERS" },
    { a: tT + 0.04, b: tM - 0.03, main: '15 OCTOBER 1932 · J. R. D. TATA · KARACHI → BOMBAY', sub: 'THE MAIL FLIGHT THAT BECAME AIR INDIA', tag: "INDIA'S FIRST PILOT'S LICENCE, No. 1 · 1929" },
    { a: tM + 0.03, b: tJ - 0.02, main: 'HF-24 MARUT · 1961', sub: 'THE FIRST INDIAN-DESIGNED JET FIGHTER' },
    { a: tJ + 0.05, b: DUR + 0.2, main: 'TEJAS · FIRST FLIGHT 2001', sub: 'HAL · 4 JANUARY 2001' },
  ];
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const caps = CAPS.map((c) => ({
    ...c,
    m: tpLeft(c.main, { font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: '#f6f2ea', intensity: 1.15 }, HX(0.16), HY(-0.78)),
    s: tpLeft(c.sub, { font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: INK, intensity: 0.85, size: 80 }, HX(0.165), HY(-0.838)),
    g: c.tag ? tpLeft(c.tag, { font: FONTS.mono, weight: 400, height: 0.021 * UI, letterSpacing: 0.26, color: GOLD, intensity: 1.1, size: 80 }, HX(0.165), HY(-0.885)) : null,
  }));
  const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.2), transparent: true, toneMapped: false }));
  hud.scene.add(rule);
  const CS = 0.03 * UI;
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UI, dy: dy * UI, size: CS, color: INK, intensity: 1.2, sub }); hud.scene.add(c); return c; };
  const callSom = mkCall('HUMBER-SOMMER BIPLANE', 'PUSHER · SPRUCE, WIRE AND LINEN', 0.3, 0.18);
  const callNaini = mkCall('NAINI', 'ABOUT 10 KM · ACROSS THE RIVER', 0.22, 0.14);
  const callPuss = mkCall('DE HAVILLAND PUSS MOTH', 'HIGH WING · ENCLOSED CABIN', -0.3, 0.2);
  const callTej = mkCall('TEJAS', 'TAILLESS COMPOUND DELTA', 0.26, -0.16);
  const CALLS = [callSom, callNaini, callPuss, callTej];

  // ================================================================ animation
  const camPos = V3(), look = V3(), tmp = V3(), tmp2 = V3(), tmp3 = V3(), qTmp = new THREE.Quaternion();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv)) * HH, 0);
    return out;
  };
  const pin = (c, world, p, op) => { projHud(world, c.position); c.reveal(p, op); c.visible = op > 0.001 && tmp3.z < 0; };
  const shotOf = (t) => (t < tA ? 0 : t < tT ? 1 : t < tM ? 2 : t < tJ ? 3 : 4);
  const ret = (focus, amt, exposure, bloom = 0.7) => ({ focus, amt, exposure, bloom });
  let shotNow = 0;
  const vimPos = V3(), somPos = V3(), pussPos = V3(), marPos = V3(), tejPos = V3();

  function shotDream(t, T) {
    const k = sat(t / tA);
    vimPos.set(lerp(-2.6, 0.8, k), 0.05 + 0.13 * Math.sin(t * 2.1), 0);
    vim.group.position.copy(vimPos);
    vim.group.rotation.set(0.025 * Math.sin(t * 1.6 + 1), -0.62 + 0.12 * k, 0.03 * Math.sin(t * 1.7));
    A.waveFlags(vim.flags, T, 0.7);
    for (const c of cards) { const u = c.userData; c.position.set(u.x + u.speed * (t + 0.3), u.y + 0.06 * Math.sin(t * 1.3 + u.bob), u.z); }
    for (const b of birds) { const u = b.userData; b.position.set(u.x + t * 1.2, u.y + 0.08 * Math.sin(t * 5 + u.ph), u.z); b.scale.y = 0.55 * (0.6 + 0.4 * Math.sin(t * 9 + u.ph)); }
    // dreamlike: a slow push and drift, then the camera rises into the clouds at the cut
    const up = ramp(t, 0.7, tA + 0.05, ease.inCubic);
    camPos.set(lerp(3.6, 2.4, k), lerp(0.5, 1.0, k) + up * 1.2, lerp(15.6, 12.6, ease.outSine(k)));
    look.set(vimPos.x - 1.55, 2.35 + up * 1.4, 0);
    camera.position.copy(camPos); camera.up.set(Math.sin(t * 0.8) * 0.015, 1, 0).normalize(); camera.lookAt(look);
    camera.fov = 30;
    pSky.visible = true; pSky.userData.u.uTime.value = t;
    setKey(V3(-0.45, 0.7, 0.55).normalize(), '#ffe0a8', 3.2, vimPos, 8, 60);
    setRim(V3(0.6, 0.35, -0.7).normalize(), '#ffcf88', 2.2, vimPos);
    setHemi('#ffe8c4', '#6a4426', 0.75);
    setFog('#ffffff', 1e5, 2e5);
    scene.environmentIntensity = 1.0;
    return ret(camPos.distanceTo(vimPos), 0.18, 1.0, 0.65);
  }

  function shotAirmail(t, T) {
    const tau = t - tA;
    somAt(t, somPos); som.group.position.copy(somPos);
    const vx = 15 + 6 * tau, vy = tau > 0.32 ? 5.2 * (tau - 0.32) + 1.1 : 0;
    som.group.rotation.set(0, 0.12 * tau, Math.atan2(vy, vx) * 0.9 + (tau > 0.25 && tau < 0.4 ? 0.02 : 0));
    som.rotor.rotation.x = -T * 70; som.disc.material.opacity = 0.22;
    const k = ease.inOutSine(sat(tau / (tT - tA)));
    camPos.set(lerp(-12, -4.5, k), lerp(1.45, 8.0, ease.inQuad(k)), lerp(6, 12.5, k));
    look.copy(somPos).add(tmp.set(2.5 + 1.5 * k, 1.6 - 0.6 * k, -1.5 * k));
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 32;
    rSky.visible = true;
    setSky('#4f78ac', '#e6c9a0', '#efd5b0', '#ffcf90', SUN2, { cloud: 1, gain: 1.05 });
    setKey(SUN2, '#ffdcac', 3.6, somPos, 14, 120);
    setRim(V3(-0.6, 0.4, 0.7).normalize(), '#9ab8e0', 0.6, somPos);
    setHemi('#b8c8e0', '#6a5640', 0.7);
    setFog('#e6cfac', 80, 1500);
    scene.environmentIntensity = 0.7;
    pin(callSom, tmp.copy(somPos).add(tmp2.set(0.6, 3.2, 0)), ramp(t, tA + 0.35, tA + 0.6), envelope(t, tA + 0.33, tT - 0.08, 0.04, 0.1));
    pin(callNaini, tmp.set(160, 10, -1220), ramp(t, tA + 0.75, tA + 1.0), envelope(t, tA + 0.73, tT - 0.03, 0.04, 0.06));
    return ret(camPos.distanceTo(somPos), 0, 1.0);
  }

  function shotJuhu(t, T) {
    const tau = t - tT;
    pussAt(t, pussPos); puss.group.position.copy(pussPos);
    puss.group.rotation.set(0.05 * Math.sin(tau * 3), 0, 0.07 + 0.02 * Math.sin(tau * 5));
    puss.prop.rotation.x = T * 80;
    const k = sat(tau / (tM - tT));
    camPos.set(4.5 - 1.2 * k, 1.35 + 0.15 * k, 9.5);
    look.copy(pussAt(t - 0.07, tmp)).add(tmp2.set(2.0, -0.2, 0));
    // the camera shakes as the aircraft whips past
    const sh = 0.05 * envelope(t, tT + 0.3, tM, 0.1, 0.25);
    camPos.x += Math.sin(T * 61) * sh; camPos.y += Math.sin(T * 47 + 1) * sh;
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 34;
    for (let i = 0; i < foam.length; i++) foam[i].position.z = -18.5 - i * 4 + Math.sin(T * 0.9 + i * 1.3) * 0.6;
    rSky.visible = true;
    setSky('#2f64b0', '#b9d4ea', '#dce8f0', '#fff0d8', SUN3, { cloud: 0.8, gain: 1.15 });
    setKey(SUN3, '#fff4e2', 4.2, pussPos, 12, 120);
    setRim(V3(0.5, 0.3, -0.8).normalize(), '#bcd8f0', 1.0, pussPos);
    setHemi('#bcd4ee', '#a08a68', 0.8);
    setFog('#d8e6ef', 120, 2200);
    scene.environmentIntensity = 0.8;
    pin(callPuss, tmp.copy(pussPos).add(tmp2.set(-1.0, 0.9, 0)), ramp(t, tT + 0.12, tT + 0.32), envelope(t, tT + 0.1, tM - 0.05, 0.04, 0.08));
    return ret(camPos.distanceTo(pussPos), 0, 1.0);
  }

  function skyWorld(t, T, space) {
    rSky.visible = true;
    setSky('#1f4f9c', '#9fbde0', '#c4d6ea', '#fff0d8', SUN4, { cloud: 0, space, gain: 1.1 });
    setFog('#b8cce4', 300, 4000);
    scene.environmentIntensity = 0.8;
    for (let i = 0; i < deckData.length; i++) {
      const c = deckData[i], x = c.x + t * 2.0;
      deck.P[i * 3] = x; deck.P[i * 3 + 1] = c.y; deck.P[i * 3 + 2] = c.z;
      deck.S[i] = c.s; deck.A[i] = c.a; deck.Rot[i] = c.rot + t * 0.05;
      tmp.set(x - camPos.x, c.y - camPos.y, c.z - camPos.z).normalize();
      const fwd = Math.pow(Math.max(0, tmp.dot(SUN4)), 12) * 0.8, lit = c.top * c.top, dark = 1 - 0.55 * space;
      deck.C[i * 3] = (0.2 + lit * 0.8 + fwd * 1.1) * dark; deck.C[i * 3 + 1] = (0.25 + lit * 0.74 + fwd * 0.9) * dark; deck.C[i * 3 + 2] = (0.34 + lit * 0.68 + fwd * 0.62) * dark;
    }
  }

  function shotMarut(t, T, info) {
    const tau = t - tM;
    marutAt(t, marPos); marut.group.position.copy(marPos);
    camPos.set(2 + 1.5 * sat(tau / 0.5), 0.8, 14);
    look.copy(marutAt(t - 0.045, tmp));
    const sh = 0.08 * envelope(t, tM + 0.2, tJ + 0.05, 0.08, 0.2);
    camPos.x += Math.sin(T * 71) * sh; camPos.y += Math.sin(T * 53 + 2) * sh;
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 32;
    skyWorld(t, T, 0);
    setKey(SUN4, '#fff4e4', 4.0, marPos, 14, 120);
    setRim(V3(-0.5, -0.4, 0.7).normalize(), '#8fb0e0', 0.8, marPos);
    setHemi('#9fbbe6', '#c8d4e4', 0.7);
    const g = envelope(t, tM + 0.25, tM + 0.5, 0.08, 0.15);
    glint.visible = g > 0.001; glint.position.copy(marut.canopy).applyQuaternion(marutQ).add(marPos); glint.scale.setScalar(2 + 10 * g); glint.material.opacity = g;
    for (const s of marutGlow) s.material.opacity = 0.8;
    return ret(camPos.distanceTo(marPos), 0, 1.0, 0.75);
  }

  function shotTejas(t, T) {
    const tau = t - tJ;
    tejAt(t, tejPos); tej.group.position.copy(tejPos); tejQ(t, qTmp); tej.group.quaternion.copy(qTmp);
    const k = sat(tau / (DUR - tJ));
    const ck = ease.inOutSine(sat(tau / 0.9));
    camPos.set(lerp(9, 6, ck), lerp(-1, 46, ease.inQuad(ck)), lerp(16, -34, ck));
    look.copy(tejAt(t - 0.03, tmp)).add(tmp2.set(0, 2, 0));
    const sh = 0.12 * envelope(t, tJ + 0.05, DUR, 0.1, 0.3);
    camPos.x += Math.sin(T * 67) * sh; camPos.y += Math.sin(T * 59 + 1) * sh;
    camera.position.copy(camPos); camera.up.set(0.12 * ck, 1, 0).normalize(); camera.lookAt(look);
    camera.fov = 32 - 4 * k;
    const space = 0.8 * ramp(tau, 0.25, 0.95, ease.inQuad);
    skyWorld(t, T, space);
    setKey(SUN4, '#fff2e0', 4.0, tejPos, 14, 120);
    setRim(V3(-0.5, -0.4, 0.7).normalize(), '#8fb0e0', 0.8, tejPos);
    setHemi('#8fb0e0', '#c8d4e4', 0.6 - 0.25 * space);
    // afterburner
    const flick = 0.85 + 0.15 * Math.sin(T * 97) * Math.sin(T * 41);
    const ab = 0.55 + 0.45 * ramp(tau, 0.0, 0.2);
    abCore.material.uniforms.uA.value = ab * flick; abOut.material.uniforms.uA.value = 0.7 * ab * flick;
    abCore.material.uniforms.uT.value = abOut.material.uniforms.uT.value = T;
    abGlow.material.opacity = ab * flick; abGlow.scale.setScalar(5 + 3 * ab + 6 * k);
    // wingtip vortices: soft points along the path history behind each tip
    const g = envelope(tau, 0.05, 0.75, 0.08, 0.3);
    vap.visible = g > 0.001;
    if (vap.visible) {
      for (let s = 0; s < 2; s++) for (let i = 0; i < VAP_N / 2; i++) {
        const age = i * 0.004, j = s * (VAP_N / 2) + i;
        tejAt(t - age, tmp); tejQ(t - age, qTmp); tmp2.copy(tej.tips[s]).applyQuaternion(qTmp).add(tmp);
        vap.P[j * 3] = tmp2.x; vap.P[j * 3 + 1] = tmp2.y; vap.P[j * 3 + 2] = tmp2.z;
        vap.S[j] = 0.3 + age * 6; vap.Rot[j] = i * 0.7;
        vap.A[j] = g * (1 - i / (VAP_N / 2)) * 0.35; vap.C[j * 3] = vap.C[j * 3 + 1] = vap.C[j * 3 + 2] = 1.1;
      }
    }
    pin(callTej, tmp.copy(tejPos), ramp(t, tJ + 0.12, tJ + 0.32), envelope(t, tJ + 0.1, DUR - 0.25, 0.04, 0.12));
    return ret(camPos.distanceTo(tejPos), 0, 1.0 + 0.1 * k, 0.75 + 0.2 * k);
  }

  const api = {
    scene, camera, hud,
    dof: { focus: 10, range: 4, amount: 0 },
    bloom: { strength: 0.7 },
    exposure: 1,
    harmony: 1,
    background: 0x000000,
    exploreLimits: { yaw: 0.7, pitchDown: 0.3, pitchUp: 0.5, zoomOut: 2.0 },
    arSubject: (t) => {
      const s = shotOf(t);
      if (s === 0) return { centre: vimPos.clone().add(V3(0.2, 1.6, 0)), radius: 4.5 };
      if (s === 1) return { centre: somPos.clone().add(V3(-1.5, 1.8, 0)), radius: 7 };
      if (s === 2) return { centre: pussPos.clone().add(V3(-1, -0.4, 0)), radius: 6 };
      if (s === 3) return { centre: marPos.clone(), radius: 9 };
      return { centre: tejPos.clone(), radius: 8 };
    },
    explorePosed(cam) {
      pSky.position.copy(cam.position); rSky.position.copy(cam.position);
      wipe.visible = false; for (const c of CALLS) c.reveal(0, 0);
    },
    update(t, info) {
      const T = info.T;
      const shot = shotOf(t);
      shotNow = shot;
      worlds[0].visible = shot === 0; worlds[1].visible = shot === 1; worlds[2].visible = shot === 2; worlds[3].visible = shot >= 3;
      marut.group.visible = shot === 3; tej.group.visible = shot === 4; vap.visible = false; glint.visible = false;
      pSky.visible = false; rSky.visible = false;
      camera.up.set(0, 1, 0); camera.near = shot === 0 ? 0.1 : 0.2; camera.far = 5000;
      for (const c of CALLS) c.reveal(0, 0);
      const r = [shotDream, shotAirmail, shotJuhu, shotMarut, shotTejas][shot](t, T, info);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      pSky.position.copy(camera.position); pSky.scale.setScalar(1000);
      rSky.position.copy(camera.position); rSky.scale.setScalar(1000);
      SKU.uTime.value = t;
      if (shot >= 3) deck.commit(info);
      if (shot === 4 && vap.visible) vap.commit(info);

      // ---- camera-attached layers: the cloud wipe (dream → Allahabad) and the speed lines
      wipe.position.copy(camera.position); wipe.quaternion.copy(camera.quaternion);
      const cover = ramp(t, 0.72, tA - 0.02, ease.inOutSine);
      const paintOut = ramp(t, tA - 0.07, tA + 0.08, ease.linear);
      const part = ramp(t, tA + 0.06, tA + 0.5, ease.inOutCubic);
      const wipeOn = t > 0.7 && t < tA + 0.6;
      wipe.visible = true;
      wipeMat.opacity = 1 - paintOut;
      for (const c of wipeCards) {
        const u = c.userData, cv = ramp(t, 0.72 + u.d, tA - 0.02 + u.d * 0.3, ease.inOutSine);
        c.position.set(u.x + (t - 0.7) * 0.5, lerp(u.y - 2.6, u.y, cv), u.z); c.visible = wipeOn && wipeMat.opacity > 0.002;
      }
      wipePuffs.visible = wipeOn && t > tA - 0.1;
      if (wipePuffs.visible) {
        const fin = ramp(t, tA - 0.1, tA + 0.03, ease.linear), fout = 1 - ramp(t, tA + 0.25, tA + 0.58, ease.inQuad);
        for (let i = 0; i < WP; i++) {
          const d = wpData[i], sx = Math.sign(d.x) || 1;
          wipePuffs.P[i * 3] = d.x + sx * part * (2.6 + d.sh * 2) ; wipePuffs.P[i * 3 + 1] = d.y + part * (d.y > 0 ? 0.8 : -0.8); wipePuffs.P[i * 3 + 2] = d.z + part * 1.2;
          wipePuffs.S[i] = d.s * (1 + part * 0.6); wipePuffs.Rot[i] = d.rot + t * 0.3;
          wipePuffs.A[i] = 0.92 * fin * fout;
          const l = 1.05 + 0.25 * d.sh; wipePuffs.C[i * 3] = l * 1.04; wipePuffs.C[i * 3 + 1] = l * 0.98; wipePuffs.C[i * 3 + 2] = l * 0.9;
        }
        wipePuffs.commit(info);
      }
      const slOn = envelope(t, tM - 0.02, tJ + 0.25, 0.05, 0.2);
      speedLines.visible = slOn > 0.001;
      if (speedLines.visible) {
        for (let i = 0; i < SL_N; i++) {
          const d = slData[i], x = ((d.x - t * d.sp) % 24 + 36) % 24 - 12;
          slPos.set([x, d.y, d.z, x + d.len, d.y, d.z], i * 6);
        }
        slGeo.attributes.position.needsUpdate = true; speedLines.material.opacity = slOn * 0.5;
      }

      api.exposure = r.exposure * (1 + 0.25 * envelope(t, tT - 0.05, tT + 0.12, 0.04, 0.1) + 0.12 * envelope(t, tM - 0.04, tM + 0.08, 0.03, 0.06) + 0.12 * envelope(t, tJ - 0.04, tJ + 0.08, 0.03, 0.06));
      api.bloom.strength = r.bloom;
      api.dof.focus = r.focus; api.dof.range = 4; api.dof.amount = r.amt;

      // ---- captions
      let ruleW = 0, ruleOp = 0;
      for (const c of caps) {
        const e = envelope(t, c.a, c.b, 0.08, 0.08), p = ramp(t, c.a, c.a + 0.22, ease.outCubic);
        c.m.opacity = e; c.m.reveal = p;
        c.s.opacity = e; c.s.reveal = ramp(t, c.a + 0.06, c.a + 0.3, ease.outCubic);
        if (c.g) { c.g.opacity = e; c.g.reveal = ramp(t, c.a + 0.12, c.a + 0.36, ease.outCubic); }
        if (e > ruleOp) { ruleOp = e; ruleW = 0.95 * UI * p; }
      }
      rule.visible = ruleOp > 0.001; rule.material.opacity = ruleOp * 0.6;
      rule.scale.x = Math.max(0.001, ruleW); rule.position.set(HX(0.16) + ruleW / 2, HY(-0.73), 0);
    },
  };
  return api;
}
