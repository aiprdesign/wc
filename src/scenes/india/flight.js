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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, rng, TAU } from '../../lib/math.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout } from '../../lib/hud.js';
import { plume, plumeMat } from './isro-assets.js';
import * as A from './flight-assets.js';
import * as X from './flight-allahabad.js';
import * as C from './flight-craft.js';

const V3 = A.V3;

// Many drifting cloud cards in ONE draw call (they were one mesh each: ~60 draws for the dream and the wipe).
// The cards are concatenated in the order the renderer drew them (renderOrder, then far → near), so the
// see-through layering is unchanged; every frame each card's quad is re-placed at its own offset (pure in t).
function cardBatch(cards, mat, renderOrder) {
  const list = cards.slice().sort((a, b) => a.ro - b.ro || a.z - b.z);
  const g = mergeGeometries(list.map((c) => c.geo.index ? c.geo.toNonIndexed() : c.geo));
  const base = g.attributes.position.array.slice(), ranges = [];
  let o = 0; for (const c of list) { const n = c.geo.index ? c.geo.index.count : c.geo.attributes.position.count; ranges.push([o, n]); o += n; }
  g.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = renderOrder; mesh.frustumCulled = false;
  // place(i, x, y, z): card i (in the caller's order) at offset (x, y, z); commit() uploads
  const slot = new Map(list.map((c, k) => [c, k]));
  const P = g.attributes.position.array;
  mesh.place = (c, x, y, z) => { const [a, n] = ranges[slot.get(c)]; for (let v = a; v < a + n; v++) { P[v * 3] = base[v * 3] + x; P[v * 3 + 1] = base[v * 3 + 1] + y; P[v * 3 + 2] = base[v * 3 + 2] + z; } };
  mesh.commit = () => { g.attributes.position.needsUpdate = true; };
  return mesh;
}

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
  const SM = X.setMaterials();
  // the 1911 biplane: doped linen that glows between its ribs against the light, varnished spruce, steel wire
  M.fabric = new THREE.MeshStandardMaterial({ color: '#d4c6a6', map: X.linenSurface(), emissive: '#f0bc72', emissiveMap: X.linenTranslucency(), emissiveIntensity: 0, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  M.spruce = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: X.spruceTexture(), roughness: 0.4, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.16 });
  M.steel = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 1, roughness: 0.2, envMapIntensity: 1.6 });
  M.lite = lite;

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
  const setSky = (zen, hor, haze, sun, sunDir, { space = 0, cloud = 1, gain = 1, cum = 0, cumS = 0.62 } = {}) => {
    SKU.uZen.value.set(zen); SKU.uHor.value.set(hor); SKU.uHaze.value.set(haze); SKU.uSunCol.value.set(sun); SKU.uSun.value.copy(sunDir);
    SKU.uSpace.value = space; SKU.uCloud.value = cloud; SKU.uGain.value = gain; SKU.uCum.value = cum; SKU.uCumS.value = cumS;
  };

  const worlds = [];
  const mk = () => { const g = new THREE.Group(); g.visible = false; scene.add(g); worlds.push(g); return g; };

  // ================================================================ 1 · THE DREAM — the painted world
  const w1 = mk();
  const vim = A.buildVimana(M); w1.add(vim.group);
  vim.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // (the heading word must not fall in its shadow)
  const cloudTex = A.paintedCloudAtlas(11);
  const cardMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: new THREE.Color(0.92, 0.9, 0.86), vertexColors: true });
  const cards = [];
  const cardGeo = (cell, w) => {
    const g = A.paintedCloudGeo(cell, w), n = g.attributes.position.count, col = new Float32Array(n * 3);
    const warm = (R() - 0.5) * 0.1, l = 0.94 + R() * 0.1;
    for (let i = 0; i < n; i++) { const y = g.attributes.position.getY(i) / w + 0.5; col.set([l * (1 + warm) * (0.94 + 0.06 * y), l * (0.95 + 0.05 * y), l * (1 - warm) * (0.9 + 0.1 * y)], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (R() < 0.5) g.scale(-1, 1, 1);
    g.scale(1, 0.82 + R() * 0.3, 1);
    return g;
  };
  const addCard = (x, y, z, w, speed) => {
    cards.push({ geo: cardGeo(Math.floor(R() * 4), w), x, y, z, speed, bob: R() * TAU, ro: -5 - Math.round(-z) });
  };
  for (let i = 0; i < 9; i++) addCard(-8 + i * 1.8 + R() * 0.8, -0.9 - R() * 0.9, -2.8 + R() * 5.2, 3.6 + R() * 2.2, 0.25);          // the bed the vimana rides on
  for (let i = 0; i < 22; i++) addCard(-30 + R() * 64, -7 + R() * 13, -14 - R() * 34, 7 + R() * 9, 0.12);                           // far banks
  for (let i = 0; i < 6; i++) addCard(-7 + i * 3 + R(), -3.9 + R() * 1.3, 4.5 + R() * 3.5, 2.8 + R() * 1.4, 0.6);                    // foreground, drifting fast (parallax)
  // two batches: the banks behind the vimana, and the foreground cards drawn over its see-through parts
  const cardsBack = cardBatch(cards.filter((c) => c.ro < 0), cardMat, -30), cardsFront = cardBatch(cards.filter((c) => c.ro >= 0), cardMat, 2);
  w1.add(cardsBack, cardsFront);
  const sunCard = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: A.paintedSunTexture(), transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.5, 1.3, 1.0) }));
  sunCard.position.set(-17, 8.5, -38); sunCard.renderOrder = -60; w1.add(sunCard);
  // a few painted birds (cranes) in a loose skein, as the miniatures draw them
  const birdG = A.merge([A.plate([[0, 0], [0.5, 0.18], [0.9, 0.1], [0.5, 0.06], [0.05, -0.02], [-0.5, 0.06], [-0.9, 0.1], [-0.5, 0.18]], 0.01, 0)]);
  const birds = [];
  for (let i = 0; i < 7; i++) birds.push({ x: -12 + i * 1.3 + R(), y: 6.2 + Math.abs(i - 3) * 0.5 + R() * 0.3, z: -16, ph: R() * TAU });
  const birdIM = new THREE.InstancedMesh(birdG, new THREE.MeshBasicMaterial({ color: '#2a1608', fog: false, side: THREE.DoubleSide }), birds.length);
  birdIM.frustumCulled = false; w1.add(birdIM);
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bs = V3(), _bp = V3();

  // the wipe: painted clouds rise over the lens and become real cloud, which parts over Allahabad (camera-attached)
  const wipe = new THREE.Group(); scene.add(wipe);
  const wipeMat = cardMat.clone(); wipeMat.depthTest = false;
  const wipeCards = [];
  for (let row = 0; row < 5; row++) for (let i = 0; i < 5; i++) {
    const w = 2.6 + R() * 0.6, geo = cardGeo((row + i) % 4, w);
    const u = { x: -2.3 + i * 1.15 + (R() - 0.5) * 0.3 + (row % 2) * 0.5, y: [-0.55, 0.2, 0.9, -1.35, 1.6][row], z: -3.0 - row * 0.12 - R() * 0.1, d: (row % 3) * 0.06 + R() * 0.05 };
    wipeCards.push({ geo, ro: 900 + row, ...u });
  }
  const wipeBatch = cardBatch(wipeCards, wipeMat, 900); wipe.add(wipeBatch);
  const puffTex = A.puffTexture(7);
  const WP = 110, wipePuffs = new A.SoftPoints(WP, { map: puffTex, near: 0.2 });
  wipePuffs.material.depthTest = false; wipePuffs.renderOrder = 950;
  const wpData = []; for (let i = 0; i < WP; i++) wpData.push({ x: -2.6 + R() * 5.2, y: -1.1 + R() * 2.2, z: -2.4 - R() * 1.2, s: 0.9 + R() * 0.9, rot: R() * TAU, sh: R() });
  wipe.add(wipePuffs);

  // ================================================================ 2 · ALLAHABAD, 18 FEBRUARY 1911 (metres; river toward −Z)
  const w2 = mk();
  const SUN2 = V3(0.55, 0.3, -0.78).normalize();
  {
    w2.add(X.groundMesh('field', 3600, lite ? 8 : 24));
    const river = A.makeWater(SKU, 4000, 1140, { body: '#1a6e6c', silt: '#2a7a6a', fadeFar: 1300, glitter: 1, confluence: ['#5a8a6a', 60, -0.15] }); river.position.set(0, 0.06, -80 - 570); w2.add(river);
    // the far bank: a low line of trees at Naini, hazed by distance
    const tg = new THREE.IcosahedronGeometry(1, 1), far = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), 160);
    const mtx = new THREE.Matrix4(), fc = new THREE.Color();
    for (let i = 0; i < 160; i++) { const s = 6 + R() * 10; mtx.compose(V3(-1900 + i * 25 + R() * 14, s * 0.45, -1228 - R() * 60), new THREE.Quaternion(), V3(s * (1.1 + R() * 0.8), s * (0.7 + R() * 0.5), s)); far.setMatrixAt(i, mtx); far.setColorAt(i, fc.set(['#2e5a26', '#3c6a2c', '#4a7232', '#2a5228'][i % 4])); }
    w2.add(far);
  }
  // ---- the exhibition: Indo-Saracenic halls, a grandstand, striped shamianas, bell tents, bunting, shade trees
  const occupied = [];   // [x, z, r] — keep trees out of the buildings
  {
    // (lite — phones, AR, VR: the set receives the biplane's shadow but casts none; only the aircraft cast)
    const meshOf = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast && !lite; m.receiveShadow = true; w2.add(m); return m; };
    const place = (geo, p, ry) => A.bake(geo, p, [0, ry, 0]);
    const stone = [], recess = [], dome = [], gilt = [], flagsA = [], flagsB = [], buntLines = [];
    for (const [x, z, w, d, h, ry, wings] of [[-50, -64, 30, 12, 8, 0.18, 1], [98, -60, 34, 13, 9, -0.42, 1]]) {
      const H = X.hallGeo(w, d, h, { wings });
      stone.push(place(H.stone, [x, 0, z], ry)); recess.push(place(H.recess, [x, 0, z], ry)); dome.push(place(H.dome, [x, 0, z], ry)); gilt.push(place(H.gilt, [x, 0, z], ry));
      const top = V3(x, H.top, z);
      flagsA.push(A.bake(X.pennantGeo(3.2, 1.5, x, false), [x, H.top + 0.2, z], [0, 0.5, 0]));
      // strings of bunting from the finial down to the corner towers
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const c = V3(sx * (w / 2 + 0.2), 8 + h - 5, sz * (d / 2 + 0.2)).applyAxisAngle(V3(0, 1, 0), ry).add(V3(x, 0, z)); c.y = 0.88 + h + 2.2 + 3.2;
        buntLines.push([top.clone().setY(H.top - 1.2), c, 0.9]);
      }
      occupied.push([x, z, w * 0.75]);
    }
    meshOf(A.merge(stone), SM.stone); meshOf(A.merge(recess), SM.recess, false); meshOf(A.merge(dome), SM.dome); meshOf(A.merge(gilt), SM.gilt);
    // grandstand on the right, angled toward the field, its tiers full of spectators
    const GS = X.grandstandGeo(26, 6), gsP = V3(46, 0, -50), gsR = -0.8;
    meshOf(place(GS.wood, [gsP.x, 0, gsP.z], gsR), SM.timber); meshOf(place(GS.roof, [gsP.x, 0, gsP.z], gsR), SM.stripes[0]);
    occupied.push([gsP.x, gsP.z, 20]);
    const gsSpots = [];
    const RG = rng(77);
    for (const [y, zz] of GS.seats) for (let x = -12.6; x <= 12.6; x += 0.56) {
      if (RG() > (lite ? 0.16 : 0.72)) continue;
      const p = V3(x + (RG() - 0.5) * 0.15, 0, zz - 0.15).applyAxisAngle(V3(0, 1, 0), gsR).add(gsP);
      gsSpots.push([p.x, p.z, 0.95, true, y]);
    }
    for (let i = 0; i < 9; i++) flagsB.push(A.bake(X.pennantGeo(1.6, 0.7, i, true), V3(-12 + i * 3, 6.9, 0.6).applyAxisAngle(V3(0, 1, 0), gsR).add(gsP).toArray(), [0, gsR + 0.4, 0]));
    // shamianas (four colourways), bell tents
    const roofs = [[], [], [], []], vals = [[], [], [], []], poles = [], bells = [];
    [[-44, -16, 11, 7, 0.1], [-40, -40, 9, 7, -0.05], [-62, -28, 12, 8, 0.2], [37, -20, 10, 7, -0.1], [62, -30, 12, 8, 0.05], [64, -12, 9, 6, 0.3], [-30, -54, 8, 6, 0], [-72, -48, 9, 6, 0.4]].forEach(([x, z, w, d, ry], k) => {
      const sh = A.shamianaGeo(w, d, 3.2);
      roofs[k % 4].push(A.bake(sh.roof, [x, 0, z], [0, ry, 0])); vals[(k + 1) % 4].push(A.bake(sh.val, [x, 0, z], [0, ry, 0])); poles.push(A.bake(sh.poles, [x, 0, z], [0, ry, 0]));
      const top = V3(x, 3.2 + 1.6, z);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) buntLines.push([top, V3(sx * w / 2, 3.65, sz * d / 2).applyAxisAngle(V3(0, 1, 0), ry).add(V3(x, 0, z)), 0.35]);
      flagsB.push(A.bake(X.pennantGeo(1.1, 0.5, k * 3, true), [x, 4.75, z], [0, 0.4 + k, 0]));
      occupied.push([x, z, Math.max(w, d) * 0.7]);
    });
    for (let k = 0; k < 4; k++) { if (roofs[k].length) meshOf(A.merge(roofs[k]), SM.stripes[k]); if (vals[k].length) meshOf(A.merge(vals[k]), SM.stripes[k]); }
    meshOf(A.merge(poles), SM.timber);
    for (let i = 0; i < 16; i++) {
      const sx = i % 2 ? 1 : -1, x = sx * (32 + R() * 50), z = -4 - R() * 56, r = 2 + R() * 0.7, h = 4.2 + R() * 0.8;
      if (occupied.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + 3)) continue;
      bells.push(A.bake(A.bellTentGeo(r, h), [x, 0, z])); poles.push(A.cyl(0.04, 0.04, 1.2, 4, [x, h + 0.5, z]));
      flagsA.push(A.bake(X.pennantGeo(0.8, 0.4, i, false), [x, h + 1.05, z], [0, R() * 3, 0]));
      occupied.push([x, z, r + 1]);
    }
    meshOf(A.merge(bells), SM.canvas);
    // rope barrier and tall bunting poles along both sides of the field
    const posts = [], ropes = [], bpoles = [];
    for (const sx of [-1, 1]) {
      const X0 = sx * 18.6;
      for (let z = 6; z >= -58; z -= 3) { posts.push(A.cyl(0.05, 0.06, 0.95, 5, [X0, 0.47, z])); if (z > -58) ropes.push(...[0, 1, 2].map((k) => A.rod(V3(X0, 0.88 - 0.1 * Math.sin(Math.PI * k / 3), z - k), V3(X0, 0.88 - 0.1 * Math.sin(Math.PI * (k + 1) / 3), z - k - 1), 0.015, 3))); }
      let prev = null;
      for (let z = 6; z >= -58; z -= 8) {
        const top = V3(sx * 18.9, 7.6, z);
        bpoles.push(A.cyl(0.06, 0.08, 7.8, 6, [top.x, 3.9, z]), A.bake(new THREE.SphereGeometry(0.1, 6, 4), [top.x, 7.85, z]));
        flagsA.push(A.bake(X.pennantGeo(1.8, 0.8, z, true), [top.x, 7.8, z], [0, sx > 0 ? Math.PI + 0.3 : 0.3, 0]));
        if (prev) buntLines.push([prev, top.clone().setY(7.2), 0.75]);
        prev = top.clone().setY(7.2);
      }
    }
    buntLines.push([V3(-18.9, 7.2, -58), V3(18.9, 7.2, -58), 1.6], [V3(-18.9, 7.2, 6), V3(-30, 6.0, 14), 0.6], [V3(18.9, 7.2, 6), V3(30, 6.0, 14), 0.6]);
    meshOf(A.merge([...posts, ...bpoles]), SM.timber, false); meshOf(A.merge(ropes), SM.rope, false);
    meshOf(X.buntingGeo(buntLines, 5), SM.bunting, false); meshOf(X.cordGeo(buntLines), SM.recess, false);
    meshOf(A.merge(flagsA), M.flag, false);
    const saffron = new THREE.MeshStandardMaterial({ color: '#e8962a', roughness: 0.8, side: THREE.DoubleSide });
    meshOf(A.merge(flagsB), saffron, false);
    // shade trees round the grounds and along the bank (kept clear of the field, the halls and the camera)
    const crowns = [], trunks = [], RT = rng(404);
    let placed = 0;
    for (let tries = 0; tries < 900 && placed < (lite ? 16 : 40); tries++) {
      const x = -170 + RT() * 340, z = -78 + RT() * 120;
      if (Math.abs(x) < 33 && z > -70) continue;
      if (Math.abs(x) < 26) continue;                                  // keep the view down to the river open
      if (Math.hypot(x + 10, z - 10) < 22) continue;
      if (occupied.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + 4)) continue;
      const h = 8 + RT() * 7, T = X.shadeTree(placed * 13 + 5, h, lite ? 6 : 9);
      crowns.push(A.bake(T.crown, [x, 0, z], [0, RT() * TAU, 0])); trunks.push(A.bake(T.trunk, [x, 0, z]));
      occupied.push([x, z, h * 0.35]); placed++;
    }
    meshOf(A.merge(crowns), SM.leaf); meshOf(A.merge(trunks), SM.bark);
    // living ground cover: instanced bushes and grass clumps round the grounds and along the bank (kept off the
    // polo ground, the crowd lines, the buildings and the water)
    {
      const RS = rng(616), N = lite ? 220 : 760, spotsB = [];
      for (let tries = 0; tries < N * 6 && spotsB.length < N; tries++) {
        const x = -210 + RS() * 420, z = -76 + RS() * 120;
        if (Math.abs(x) < 26 && z > -66) continue;
        if (Math.hypot(x + 10, z - 10) < 8) continue;
        if (occupied.some(([ox, oz, or]) => Math.hypot(x - ox, z - oz) < or + 1)) continue;
        spotsB.push([x, z]);
      }
      const bush = new THREE.IcosahedronGeometry(1, 0); bush.translate(0, 0.55, 0);
      const im = new THREE.InstancedMesh(bush, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), spotsB.length);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), greens = ['#2e6a20', '#3e7a28', '#4c8a30', '#2a5a1e', '#5a8a34', '#6a8a3a'];
      spotsB.forEach(([x, z], i) => {
        const big = RS() < 0.35, s = big ? 0.9 + RS() * 1.3 : 0.25 + RS() * 0.35;
        q.setFromEuler(new THREE.Euler(0, RS() * TAU, 0)); mtx.compose(V3(x, -0.15 * s, z), q, V3(s * (1 + RS() * 0.6), s * (0.6 + RS() * 0.5), s * (1 + RS() * 0.6)));
        im.setMatrixAt(i, mtx); im.setColorAt(i, c.set(greens[Math.floor(RS() * greens.length)]).multiplyScalar(0.8 + RS() * 0.35));
      });
      im.castShadow = !lite; im.receiveShadow = true; w2.add(im);
    }
    // country boats on the river
    const hulls = [], sails = [], RB = rng(88);
    for (let i = 0; i < (lite ? 5 : 10); i++) {
      const b = X.boatGeos(i + 1, 7 + RB() * 5), p = [-80 + RB() * 340, 0.05, -110 - RB() * 380], ry = RB() * TAU;
      hulls.push(A.bake(b.hull, p, [0, ry, 0])); if (b.sail) sails.push(A.bake(b.sail, p, [0, ry, 0]));
    }
    meshOf(A.merge(hulls), SM.boat, false); if (sails.length) meshOf(A.merge(sails), SM.sail, false);
    // ---- the crowd: rows along the rope, knots round the shamianas, the grandstand, people on the bank
    const RC = rng(1911), spots = [...gsSpots];
    const keep = lite ? 0.2 : 1;
    for (const sx of [-1, 1]) for (let row = 0; row < 6; row++) {
      const pr = [0.95, 0.9, 0.78, 0.6, 0.4, 0.22][row] * keep;
      for (let z = 6; z > -58; z -= 0.52) {
        const gap = Math.sin(z * 0.21 + sx * 1.7) > 0.86;               // the odd gap in the line
        if (gap || RC() > pr) continue;
        spots.push([sx * (19.25 + row * 0.6 + (RC() - 0.5) * 0.3), z + (RC() - 0.5) * 0.3, 1]);
      }
    }
    for (const [x, z, r] of occupied) {
      if (r > 12 || r < 3) continue;
      const nn = Math.round(10 * keep);
      for (let i = 0; i < nn; i++) { const a = RC() * TAU, rr = r * (0.4 + RC() * 0.9); spots.push([x + Math.cos(a) * rr, z + Math.sin(a) * rr, 1]); }
    }
    for (let i = 0; i < 90 * keep; i++) spots.push([-26 + RC() * 52, -64 - RC() * 9, 1]);
    for (let i = 0; i < 70 * keep; i++) { const x = (RC() < 0.5 ? -1 : 1) * (28 + RC() * 40), z = -4 - RC() * 56; spots.push([x, z, 1]); }
    const facing = (x, z) => (Math.abs(x) < 34 && z > -60 ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : z < -60 ? Math.PI : Math.atan2(-x, -z - 20));
    w2.add(X.buildCrowd2(SM, spots.filter((p) => p[3] !== true), { seed: 4, facing, lite }));
    w2.add(X.buildCrowd2(SM, spots.filter((p) => p[3] === true), { seed: 5, facing: () => gsR, parasols: 0, lite }));
  }
  const som = C.buildSommer(M); w2.add(som.group);
  som.disc.material = new THREE.MeshBasicMaterial({ map: X.propDiscTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
  if (som.prop) som.prop.visible = false;                         // at speed the blades read only as the blurred disc
  const somAt = (t, out) => {
    const tau = t - tA, lift = Math.max(0, tau - 0.32);
    out.set(-16 + 15 * tau + 3 * tau * tau, 2.6 * lift * lift + 1.1 * lift, -4 - 2.2 * tau * tau);
    return out;
  };

  // ================================================================ 3 · JUHU, BOMBAY, 15 OCTOBER 1932 (sea toward −Z)
  const w3 = mk();
  let sandU = null;
  const SUN3 = V3(0.55, 0.62, -0.25).normalize();
  {
    const sand = X.groundMesh('sand', 3600, lite ? 8 : 24); w3.add(sand); sandU = sand.material.userData.U;
    const sea = A.makeWater(SKU, 4000, 2400, { body: '#0f4f5e', silt: '#1f6e6a', waveK: 1.6, fadeFar: 1800 }); sea.position.set(0, 0.05, -18 - 1200); w3.add(sea);
    const palms = [], fronds = [];
    for (let i = 0; i < 30; i++) { const p = A.palmGeos(i * 7 + 3, 8 + R() * 5); const x = -150 + i * 10 + R() * 6, z = 24 + R() * 40; palms.push(A.bake(p.trunk, [x, 0, z])); fronds.push(A.bake(p.fronds, [x, 0, z])); }
    const pm = new THREE.Mesh(A.merge(palms), M.trunk), fm = new THREE.Mesh(A.merge(fronds), M.palmFrond);
    for (const m of [pm, fm]) { m.castShadow = !lite; m.receiveShadow = true; w3.add(m); }
    // beach scrub under the palms (instanced)
    {
      const RS = rng(1015), N = lite ? 70 : 240;
      const bush = new THREE.IcosahedronGeometry(1, 0); bush.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(bush, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), N);
      const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), greens = ['#2e6a22', '#3c7a2a', '#4a7a2e', '#5a8030'];
      for (let i = 0; i < N; i++) {
        const x = -160 + RS() * 320, z = 19 + RS() * 40, s = 0.4 + RS() * 1.2;
        q.setFromEuler(new THREE.Euler(0, RS() * TAU, 0)); mtx.compose(V3(x, -0.1 * s, z), q, V3(s * (1.2 + RS() * 0.6), s * (0.5 + RS() * 0.4), s * (1.2 + RS() * 0.6)));
        im.setMatrixAt(i, mtx); im.setColorAt(i, c.set(greens[i % 4]).multiplyScalar(0.8 + RS() * 0.3));
      }
      im.castShadow = !lite; im.receiveShadow = true; w3.add(im);
    }
    // Koli fishing boats drawn up on the sand below the palms, with their masts
    const RB = rng(1932), bh = [], bs = [];
    for (let i = 0; i < (lite ? 4 : 8); i++) {
      const b = X.boatGeos(i + 20, 7 + RB() * 4), p = [-150 + i * 17 + RB() * 8, -0.25, 9 + RB() * 9], ry = Math.PI / 2 + (RB() - 0.5) * 0.6;
      bh.push(A.bake(b.hull, p, [0, ry, 0.06 * (RB() - 0.5)])); // (sails furled on the beach: hulls and masts only)
    }
    for (const [geo, mat] of [[bh, SM.boat], [bs, SM.sail]]) if (geo.length) { const m = new THREE.Mesh(A.merge(geo), mat); m.castShadow = !lite; m.receiveShadow = true; w3.add(m); }
    const spots = []; for (let i = 0; i < 22; i++) spots.push([10 + R() * 14, 3 + R() * 6]);
    for (let i = 0; i < (lite ? 6 : 16); i++) spots.push([-140 + R() * 120, 8 + R() * 10]);
    w3.add(X.buildCrowd2(SM, spots, { seed: 9, facing: () => Math.PI, parasols: 0.25, lite }));
  }
  const foam = [];
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1.2 + i * 0.5), X.foamMaterial(i === 0 ? 0.9 : 1.0 - i * 0.22)); f.rotation.x = -Math.PI / 2; f.position.set(0, i === 0 ? 0.02 : 0.07, i === 0 ? -16.6 : -18.6 - (i - 1) * 4); w3.add(f); foam.push(f); }
  const puss = C.buildPussMoth(M); w3.add(puss.group);
  const pussAt = (t, out) => { const tau = t - tT; return out.set(-42 + 38 * tau, 1.75 + 3.6 - 1.4 * tau, 0); };

  // ================================================================ 4–5 · ABOVE THE CLOUDS (metres)
  const w4 = mk();
  const SUN4 = V3(0.35, 0.5, -0.79).normalize();
  const DECK_N = lite ? 520 : 1000, LAYER_N = lite ? 160 : 300;
  const deck = new A.SoftPoints(DECK_N + LAYER_N, { map: A.puffTexture(3), near: 3 });
  const deckData = [];
  for (let i = 0; i < DECK_N; i++) { const y = -75 + R() * 40; deckData.push({ x: -600 + R() * 1200, y, z: -800 + R() * 950, s: 34 + R() * 40, a: 0.3 + R() * 0.3, rot: R() * TAU, top: (y + 75) / 40 }); }
  for (let i = 0; i < LAYER_N; i++) { const y = 26 + R() * 14; deckData.push({ x: -70 + R() * 140, y, z: -150 + R() * 125, s: 10 + R() * 14, a: 0.22 + R() * 0.2, rot: R() * TAU, top: 0.6 + (y - 24) / 40 }); }
  w4.add(deck);
  const marut = C.buildMarut(M); w4.add(marut.group);
  const MA = V3(-95, 5, -44), MB = V3(42, -1.5, 8), MD = MB.clone().sub(MA).normalize();
  const marutAt = (t, out) => out.copy(MA).lerp(MB, (t - tM + 0.06) / 0.62);
  const marutQ = new THREE.Quaternion().setFromUnitVectors(V3(1, 0, 0), MD).multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), -0.42));
  marut.group.quaternion.copy(marutQ);
  const marutGlow = marut.nozzles.map((p) => { const s = glowSprite({ color: '#ffb880', intensity: 1.2, scale: 1.4 }); s.position.copy(p); marut.group.add(s); return s; });
  const glint = glowSprite({ color: '#fff6e6', intensity: 3, scale: 1 }); w4.add(glint);
  const tej = C.buildTejas(M); w4.add(tej.group);
  const abCore = plume(0.3, 0.12, 3.2, plumeMat('#fff0d8', 3.4, { diamonds: 0.8 })), abOut = plume(0.45, 0.9, 7.5, plumeMat('#ff9a50', 1.4, { alpha: 0.7 }));
  for (const p of [abCore, abOut]) { p.position.copy(tej.nozzle); p.rotation.z = -Math.PI / 2; tej.group.add(p); }
  const abGlow = glowSprite({ color: '#ffc890', intensity: 4, scale: 6 }); abGlow.position.copy(tej.nozzle); tej.group.add(abGlow);
  const SUN5 = V3(0.62, 0.42, 0.66).normalize();
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
  const SL_N = 34, slPos = new Float32Array(SL_N * 6), slData = [];
  for (let i = 0; i < SL_N; i++) slData.push({ x: R() * 24 - 12, y: (R() - 0.5) * 5, z: -6 - R() * 8, len: 0.5 + R() * 1.4, sp: 30 + R() * 30 });
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
    { a: tT + 0.04, b: tM - 0.03, main: '15 OCTOBER 1932 · J. R. D. TATA', sub: 'KARACHI → BOMBAY · THE MAIL FLIGHT THAT BECAME AIR INDIA', tag: "INDIA'S FIRST PILOT'S LICENCE, No. 1 · 1929" },
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
    for (const c of cards) (c.ro < 0 ? cardsBack : cardsFront).place(c, c.x + c.speed * (t + 0.3), c.y + 0.06 * Math.sin(t * 1.3 + c.bob), c.z);
    cardsBack.commit(); cardsFront.commit();
    birds.forEach((u, i) => { birdIM.setMatrixAt(i, _bm.compose(_bp.set(u.x + t * 1.2, u.y + 0.08 * Math.sin(t * 5 + u.ph), u.z), _bq, _bs.set(0.55, 0.55 * (0.6 + 0.4 * Math.sin(t * 9 + u.ph)), 0.55))); });
    birdIM.instanceMatrix.needsUpdate = true;
    // dreamlike: a slow push and drift, then the camera rises into the clouds at the cut
    const up = ramp(t, 0.7, tA + 0.05, ease.inCubic);
    camPos.set(lerp(1.6, 0.8, k), lerp(0.2, 0.7, k) + up * 1.2, lerp(17.5, 14.8, ease.outSine(k)));
    look.set(vimPos.x - 3.3, 3.2 + up * 1.4, 0);
    camera.position.copy(camPos); camera.up.set(Math.sin(t * 0.8) * 0.015, 1, 0).normalize(); camera.lookAt(look);
    camera.fov = 30;
    pSky.visible = true; pSky.userData.u.uTime.value = t; pSky.userData.u.uGain.value = 0.82;
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
    som.rotor.rotation.x = -T * 70; som.disc.rotation.z = -T * 23; som.disc.material.opacity = 0.9;
    const k = ease.inOutSine(sat(tau / (tT - tA)));
    camPos.set(lerp(-13, -3, k), lerp(1.3, 4.8, ease.inQuad(k)), lerp(9, 12, k));
    look.copy(somPos).add(tmp.set(2.6 - 0.6 * k, 2.4 - 0.6 * k, 0));
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 32;
    rSky.visible = true;
    // a clear, warm February morning: deep blue overhead, pale gold-blue at the horizon, fair-weather cumulus
    setSky('#2878c0', '#b0d0e4', '#dedcd2', '#fff0e2', SUN2, { cloud: 0.5, gain: 0.94, cum: 0.6 });
    setKey(SUN2, '#ffe0b4', 3.9, somPos, 14, 120);
    setRim(V3(-0.6, 0.4, 0.7).normalize(), '#9ab8e0', 0.7, somPos);
    setHemi('#a6c0e4', '#6e5c3e', 0.72);
    setFog('#c3d0dc', 420, 5200);
    scene.environmentIntensity = 0.75;
    // the linen glows between its ribs when the camera looks toward the sun through the wings
    tmp.copy(look).sub(camPos).normalize();
    M.fabric.emissiveIntensity = 0.05 + 0.3 * Math.pow(sat(tmp.dot(SUN2) * 0.9 + 0.25), 1.5);
    pin(callSom, tmp.copy(somPos).add(tmp2.set(0.6, 3.2, 0)), ramp(t, tA + 0.62, tA + 0.85), envelope(t, tA + 0.6, tT - 0.06, 0.04, 0.1));
    pin(callNaini, tmp.set(160, 10, -1220), ramp(t, tA + 0.75, tA + 1.0), envelope(t, tA + 0.73, tT - 0.03, 0.04, 0.06));
    return ret(camPos.distanceTo(somPos), 0, 1.02, 0.45);
  }

  function shotJuhu(t, T) {
    const tau = t - tT;
    pussAt(t, pussPos); puss.group.position.copy(pussPos);
    puss.group.rotation.set(0.05 * Math.sin(tau * 3), 0, 0.07 + 0.02 * Math.sin(tau * 5));
    puss.prop.rotation.x = T * 80;
    const k = sat(tau / (tM - tT));
    camPos.set(-4 - 0.8 * k, 1.3 + 0.1 * k, -5.5);
    look.copy(pussAt(t - 0.05, tmp)).add(tmp2.set(1.5, -0.6, 0));
    // the camera shakes as the aircraft whips past
    const sh = 0.05 * envelope(t, tT + 0.3, tM, 0.1, 0.25);
    camPos.x += Math.sin(T * 61) * sh; camPos.y += Math.sin(T * 47 + 1) * sh;
    camera.position.copy(camPos); camera.lookAt(look);
    camera.fov = 34;
    const tide = Math.sin(T * 0.9) * 0.6;
    for (let i = 0; i < foam.length; i++) { foam[i].position.z = (i === 0 ? -16.6 + tide : -18.6 - (i - 1) * 4 + Math.sin(T * 0.9 + i * 1.3) * 0.6); foam[i].material.uniforms.uTime.value = T; }
    sandU.uTide.value = tide;
    rSky.visible = true;
    setSky('#1c70b8', '#a2cce6', '#c8d8e4', '#fff0d8', SUN3, { cloud: 0.8, gain: 0.97, cum: 0.72, cumS: 0.4 });
    setKey(SUN3, '#fff4e2', 3.0, pussPos, 12, 120);
    setRim(V3(-0.7, 0.4, 0.3).normalize(), '#bcd8f0', 1.2, pussPos);
    setHemi('#bcd4ee', '#a08a68', 0.8);
    setFog('#b9cde0', 250, 3200);
    scene.environmentIntensity = 0.8;
    pin(callPuss, tmp.copy(pussPos).add(tmp2.set(-2.5, 0.9, 0)), ramp(t, tT + 0.12, tT + 0.32), envelope(t, tT + 0.1, tM - 0.05, 0.04, 0.08));
    return ret(camPos.distanceTo(pussPos), 0, 1.0);
  }

  function skyWorld(t, T, space, SUN = SUN4) {
    rSky.visible = true;
    setSky('#1f4f9c', '#9fbde0', '#c4d6ea', '#fff0d8', SUN, { cloud: 0, space, gain: 1.1 });
    setFog('#b8cce4', 300, 4000);
    scene.environmentIntensity = 0.8;
    for (let i = 0; i < deckData.length; i++) {
      const c = deckData[i], x = c.x + t * 2.0;
      deck.P[i * 3] = x; deck.P[i * 3 + 1] = c.y; deck.P[i * 3 + 2] = c.z;
      deck.S[i] = c.s; deck.A[i] = c.a; deck.Rot[i] = c.rot + t * 0.05;
      tmp.set(x - camPos.x, c.y - camPos.y, c.z - camPos.z).normalize();
      const fwd = Math.pow(Math.max(0, tmp.dot(SUN)), 12) * 0.8, lit = c.top * c.top, dark = 1 - 0.55 * space;
      deck.C[i * 3] = (0.3 + lit * 0.72 + fwd * 1.1) * dark; deck.C[i * 3 + 1] = (0.34 + lit * 0.67 + fwd * 0.9) * dark; deck.C[i * 3 + 2] = (0.43 + lit * 0.6 + fwd * 0.62) * dark;
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
    glint.visible = g > 0.001; glint.position.copy(marut.canopy).applyQuaternion(marutQ).add(marPos); glint.scale.setScalar(1.5 + 3.5 * g); glint.material.opacity = g;
    for (const s of marutGlow) s.material.opacity = 0.8;
    return ret(camPos.distanceTo(marPos), 0, 1.0, 0.75);
  }

  function shotTejas(t, T) {
    const tau = t - tJ;
    tejAt(t, tejPos); tej.group.position.copy(tejPos); tejQ(t, qTmp); tej.group.quaternion.copy(qTmp);
    const k = sat(tau / (DUR - tJ));
    const ck = ease.inOutSine(sat(tau / 0.9));
    camPos.set(lerp(9, 5, ck), lerp(-1, 14, ck), lerp(16, 24, ck));
    look.copy(tejAt(t - 0.03, tmp)).add(tmp2.set(0, 2, 0));
    const sh = 0.12 * envelope(t, tJ + 0.05, DUR, 0.1, 0.3);
    camPos.x += Math.sin(T * 67) * sh; camPos.y += Math.sin(T * 59 + 1) * sh;
    camera.position.copy(camPos); camera.up.set(0.12 * ck, 1, 0).normalize(); camera.lookAt(look);
    camera.fov = 32 - 4 * k;
    const space = 0.6 * ramp(tau, 0.25, 0.95, ease.inQuad);
    skyWorld(t, T, space, SUN5);
    setKey(SUN5, '#fff2e0', 4.0, tejPos, 14, 120);
    setRim(V3(-0.5, -0.4, 0.7).normalize(), '#8fb0e0', 0.8, tejPos);
    setHemi('#8fb0e0', '#c8d4e4', 0.6 - 0.25 * space);
    // afterburner
    const flick = 0.85 + 0.15 * Math.sin(T * 97) * Math.sin(T * 41);
    const ab = 0.55 + 0.45 * ramp(tau, 0.0, 0.2);
    abCore.material.uniforms.uA.value = ab * flick; abOut.material.uniforms.uA.value = 0.7 * ab * flick;
    abCore.material.uniforms.uT.value = abOut.material.uniforms.uT.value = T;
    abGlow.material.opacity = ab * flick; abGlow.scale.setScalar(3 + 3 * ab);
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
    // a paused frame: the pusher's blades show through a fainter blur disc (the film shows only the disc)
    explore() { if (shotNow === 1 && som.prop) { som.prop.visible = true; som.disc.material.opacity = 0.35; } },
    exploreEnd() { if (som.prop) som.prop.visible = false; },
    explorePosed(cam) {
      pSky.position.copy(cam.position); rSky.position.copy(cam.position);
      wipe.visible = false; for (const c of CALLS) c.reveal(0, 0);
    },
    update(t, info) {
      const T = info.T;
      const shot = shotOf(t);
      shotNow = shot;
      worlds[0].visible = shot === 0; worlds[1].visible = shot === 1; worlds[2].visible = shot === 2; worlds[3].visible = shot >= 3;
      if (som.prop) som.prop.visible = false;
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
      const paintOut = ramp(t, tA - 0.02, tA + 0.1, ease.linear);
      const part = ramp(t, tA + 0.0, tA + 0.36, ease.inOutCubic);
      const wipeOn = t > 0.7 && t < tA + 0.6;
      wipe.visible = true;
      wipeMat.opacity = 1 - paintOut;
      wipeBatch.visible = wipeOn && wipeMat.opacity > 0.002;
      if (wipeBatch.visible) {
        for (const u of wipeCards) { const cv = ramp(t, 0.72 + u.d, tA - 0.02 + u.d * 0.3, ease.inOutSine); wipeBatch.place(u, u.x + (t - 0.7) * 0.5, lerp(u.y - 2.6, u.y, cv), u.z); }
        wipeBatch.commit();
      }
      wipePuffs.visible = wipeOn && t > tA - 0.04;
      if (wipePuffs.visible) {
        const fin = ramp(t, tA - 0.04, tA + 0.1, ease.linear), fout = 1 - ramp(t, tA + 0.25, tA + 0.58, ease.inQuad);
        for (let i = 0; i < WP; i++) {
          const d = wpData[i], sx = Math.sign(d.x) || 1;
          wipePuffs.P[i * 3] = d.x + sx * part * (2.6 + d.sh * 2) ; wipePuffs.P[i * 3 + 1] = d.y + part * (d.y > 0 ? 0.8 : -0.8); wipePuffs.P[i * 3 + 2] = d.z + part * 1.2;
          wipePuffs.S[i] = d.s * (1 + part * 0.6); wipePuffs.Rot[i] = d.rot + t * 0.3;
          wipePuffs.A[i] = 0.8 * fin * fout;
          const l = 0.42 + 0.22 * d.sh + 0.28 * (d.y + 1.1); wipePuffs.C[i * 3] = l * 1.04; wipePuffs.C[i * 3 + 1] = l * 0.98; wipePuffs.C[i * 3 + 2] = l * 0.9;
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
        slGeo.attributes.position.needsUpdate = true; speedLines.material.opacity = slOn * 0.28;
      }

      api.exposure = r.exposure * (1 + 0.1 * envelope(t, tT - 0.05, tT + 0.12, 0.04, 0.1) + 0.12 * envelope(t, tM - 0.04, tM + 0.08, 0.03, 0.06) + 0.12 * envelope(t, tJ - 0.04, tJ + 0.08, 0.03, 0.06));
      api.bloom.strength = r.bloom;
      // the real-sky shots keep a little more of their true blue through the grade's colour harmony
      api.harmony = shot === 1 || shot === 2 ? 0.6 : 1;
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
