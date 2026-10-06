// SURGERY & MEDICINE — the Sushruta Samhita (28.5 – 32.0 s)
// One continuous move across a physician's table at dusk, lit through a pierced stone jali:
//   herbs        — a low macro on the materia medica: a granite mortar of green paste, neem, tulsi in a
//                  brass lota, turmeric rhizomes (one sliced, glowing orange), a clay diya; dust in the shaft
//   instruments  — the camera cranes up as the surgical set fans open round a brass lotus medallion on
//                  maroon velvet, like a museum display: lancets, probes, hooks, tongs, tubes, needles and
//                  the animal-mouthed forceps (lion, heron, crow) · "101 BLUNT · 20 SHARP"
//   rhinoplasty  — a gold line drawing lifts off the palm-leaf folio and stands up as a hologram: a head in
//                  profile, the leaf template, the cheek flap and the gold arrows that turn it onto the nose
//   surgeryHud   — callouts (cataract couching · 300+ procedures · practice on models) and a push into the
//                  rebuilt nose for the 'zoom' hand-over to the next chapter.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { Dust } from '../../lib/particles.js';
import { progressLine, segmentsLine, circlePoints } from '../../lib/lines.js';
import { gridTexture } from '../../lib/textures.js';
import { Callout, RingGauge, BracketFrame } from '../../lib/hud.js';
import { lightShaft, glowSprite } from '../../lib/materials.js';
import * as AS from './surgery-assets.js';

const GOLD = '#ffc978';
const GOLD_HOT = '#ffe2a6';
const AMBER = '#ffa84a';
const IVORY = '#ffe9c8';
const HERB = new THREE.Vector3(-2.25, 0, 0.3);        // herb still life (mortar centre)
const FAN = new THREE.Vector3(0.4, 0, -0.05);          // instrument display centre
const FOLIO = new THREE.Vector3(0.4, 0.0, -1.68);      // palm-leaf manuscript on its boards
const DIA_POS = new THREE.Vector3(0.4, 0.18, -1.22);   // hologram pivot (bottom centre) once raised
const DS = 1.1, DOX = -0.35, DOY = 0.72;               // diagram units → plate (profile scale / offset)
const SLOTS = 24, R0 = 0.4, ISCALE = 1.25, CLOTH_R = 1.32, CLOTH_Y = 0.024;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tHerb = cue('herbs'), tInst = cue('instruments'), tRhino = cue('rhinoplasty'), tHud = cue('surgeryHud');
  const DUR = segment.end - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.32;
  scene.fog = new THREE.FogExp2('#0d0805', 0.05);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.03, 200);
  const R = rng(2811);

  // ---------------------------------------------------------------- lights
  const JALI = V3(-3.3, 2.05, -3.15);
  const key = new THREE.SpotLight('#ffc27e', 70, 0, 0.36, 0.65, 2);
  key.position.copy(JALI).add(V3(0, 0, 0.15)); key.target.position.copy(HERB).add(V3(0.05, 0.1, 0.05));
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 1; key.shadow.camera.far = 9;
  scene.add(key, key.target);
  const fanSpot = new THREE.SpotLight('#fff0da', 24, 0, 0.42, 0.55, 2);
  fanSpot.position.set(0.75, 4.3, 1.1); fanSpot.target.position.copy(FAN);
  fanSpot.castShadow = true; fanSpot.shadow.mapSize.set(1024, 1024); fanSpot.shadow.bias = -0.0003; fanSpot.shadow.normalBias = 0.015;
  fanSpot.shadow.camera.near = 2; fanSpot.shadow.camera.far = 7;
  scene.add(fanSpot, fanSpot.target);
  const rim = new THREE.DirectionalLight('#a9bcff', 0.7); rim.position.set(3.5, 2.6, -4); scene.add(rim);
  const herbFill = new THREE.SpotLight('#ffd6a6', 14, 0, 0.5, 0.8, 2);   // soft warm fill on the herbs from the front-left
  herbFill.position.copy(HERB).add(V3(0.9, 1.5, 2.3)); herbFill.target.position.copy(HERB).add(V3(0.1, 0.1, 0)); scene.add(herbFill, herbFill.target);
  const hemi = new THREE.HemisphereLight('#6a4a32', '#0a0604', 0.28); scene.add(hemi);

  // ---------------------------------------------------------------- the room: teak table, plaster wall, jali screens
  const teak = AS.teakTexture(); teak.repeat.set(3.2, 2.4);
  const tableMat = new THREE.MeshPhysicalMaterial({ map: teak, color: '#ffdcb8', roughness: 0.62, envMapIntensity: 0.25 });
  const table = new THREE.Mesh(new THREE.PlaneGeometry(16, 7.6), tableMat);
  table.rotation.x = -Math.PI / 2; table.position.set(0, 0, 0.6); table.receiveShadow = true;
  scene.add(table);
  const wallMat = new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(22, 10), wallMat); wall.position.set(0, 4.2, -3.2); wall.receiveShadow = true;
  scene.add(wall);
  // pointed-arch jali windows: warm late light through the stone lattice
  const archShape = (w, h) => {
    const s = new THREE.Shape(), r = w / 2;
    s.moveTo(-r, -h / 2); s.lineTo(r, -h / 2); s.lineTo(r, h / 2 - r * 0.9);
    s.quadraticCurveTo(r, h / 2 - r * 0.15, 0, h / 2); s.quadraticCurveTo(-r, h / 2 - r * 0.15, -r, h / 2 - r * 0.9); s.closePath();
    return s;
  };
  const jaliTex = AS.jaliTexture(); jaliTex.repeat.set(4, 4);
  const jaliMat = new THREE.MeshBasicMaterial({ map: jaliTex, color: new THREE.Color('#ffb868').multiplyScalar(0.4), toneMapped: false, fog: false });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#6b5038', roughness: 0.85 });
  const jalis = [];
  for (const [x, y, w, h] of [[JALI.x, JALI.y, 1.25, 1.85], [4.3, 2.15, 1.1, 1.7]]) {
    const g = new THREE.ShapeGeometry(archShape(w, h), 24);
    const m = new THREE.Mesh(g, jaliMat); m.position.set(x, y, -3.19); scene.add(m); jalis.push(m);
    const fr = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const o = archShape(w + 0.22, h + 0.22); o.holes.push(new THREE.Path(archShape(w, h).getPoints(48).reverse())); return o; })(), { depth: 0.08, bevelEnabled: false, curveSegments: 24 }), frameMat);
    fr.position.set(x, y, -3.2); fr.castShadow = false; scene.add(fr);
  }
  // shaft from the left jali onto the herbs, plus a broad glow in the window
  const shaftDir = HERB.clone().add(V3(0.2, 0.0, -0.75)).sub(JALI);
  const shaft = lightShaft({ length: shaftDir.length() * 1.05, radiusTop: 0.6, radiusBottom: 1.0, color: '#ffc98c', intensity: 0.13 });
  shaft.position.copy(JALI).add(V3(0, 0, 0.05));
  shaft.quaternion.setFromUnitVectors(V3(0, -1, 0), shaftDir.clone().normalize());
  scene.add(shaft);
  const jaliGlow = glowSprite({ color: '#ffae5a', intensity: 0.5, scale: 3.4 }); jaliGlow.position.copy(JALI).add(V3(0, 0, 0.2)); scene.add(jaliGlow);
  const jaliGlow2 = glowSprite({ color: '#ffae5a', intensity: 0.35, scale: 3.0 }); jaliGlow2.position.set(4.3, 2.15, -3.0); scene.add(jaliGlow2);
  const dust = new Dust({ count: 1100, size: [2.2, 2.0, 3.6], center: [-2.75, 0.95, -1.35], color: '#ffd9a6', particleSize: 0.013, opacity: 0.55, intensity: 1.5, seed: 21 });
  dust.u.noise = 0.12; dust.u.noiseSpeed = 0.05;
  scene.add(dust);

  // ---------------------------------------------------------------- herbs
  const herbs = new THREE.Group(); herbs.position.copy(HERB); scene.add(herbs);
  const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const granite = AS.graniteTexture(); granite.repeat.set(5, 2);
  const stoneMat = new THREE.MeshStandardMaterial({ map: granite, color: '#e8e0d4', roughness: 0.78 });
  const mortar = new THREE.Mesh(AS.mortarGeometry(), stoneMat); mortar.scale.setScalar(0.85); herbs.add(mortar);
  const paste = new THREE.Mesh(new THREE.SphereGeometry(0.19, 40, 14).scale(1, 0.24, 1), new THREE.MeshPhysicalMaterial({ color: '#56742a', roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.5 }));
  { const p = paste.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.006 * Math.sin(x * 70) * Math.cos(z * 60)); } paste.geometry.computeVertexNormals(); }
  paste.position.y = 0.106; herbs.add(paste);
  const pestle = new THREE.Mesh(AS.pestleGeometry(), stoneMat);
  pestle.position.set(-0.05, 0.095, 0.0); pestle.rotation.set(0.15, 0.55, -0.78, 'YXZ'); herbs.add(pestle);
  // turmeric: whole rhizomes, two slices showing the orange flesh, a brass dish of ground haldi
  const skinMat = new THREE.MeshStandardMaterial({ color: '#a36c38', roughness: 0.78 });
  skinMat.userData.detail = { albedo: 0.35, rough: 0.6, bump: 0.0003, grime: 0.3, scale: 6 };
  const fleshMat = new THREE.MeshStandardMaterial({ color: '#ff8a12', roughness: 0.55, emissive: new THREE.Color('#5a1e00') });
  [[0.36, 0.42, 0.4, 1], [0.58, 0.24, -0.5, 2], [0.12, 0.6, 1.9, 3]].forEach(([x, z, ry, s]) => {
    const m = new THREE.Mesh(AS.turmericGeometry(s), skinMat); m.position.set(x, 0, z); m.rotation.y = ry; m.scale.setScalar(1.15); herbs.add(m);
  });
  [[0.34, 0.66, 0.0], [0.42, 0.6, 0.02]].forEach(([x, z, y], i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.033, 0.014, 24), [skinMat, fleshMat, fleshMat]);
    m.position.set(x, 0.007 + y, z); m.rotation.set(i ? 0.35 : 0, 0, i ? 0.25 : 0); herbs.add(m);
  });
  const brassMat = new THREE.MeshStandardMaterial({ color: '#d8a656', metalness: 1, roughness: 0.3 });
  const dish = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.13, 0.02], [0.145, 0.04], [0.138, 0.042], [0.12, 0.024], [0, 0.012]].map(([r, y]) => new THREE.Vector2(r, y)), 48), brassMat);
  dish.position.set(0.74, 0, -0.06); herbs.add(dish);
  const powder = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 14 }, (_, i) => { const u = 1 - i / 13; return new THREE.Vector2(Math.max(0.0005, 0.115 * u), 0.014 + 0.075 * Math.pow(1 - u * u, 1.3)); }), 40), new THREE.MeshStandardMaterial({ color: '#f0a81c', roughness: 1, side: THREE.DoubleSide }));
  powder.position.set(0.74, 0, -0.06); herbs.add(powder);
  // neem: two pinnate branches lying on the table (serrated, sickle-shaped leaflets)
  const neemTex = AS.leafTexture({ veins: 8, seed: 3 });
  const neemMat = new THREE.MeshStandardMaterial({ map: neemTex, color: '#ffffff', roughness: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color('#081404') });
  const neemGeo = AS.leafGeometry({ len: 0.12, width: 0.038, shape: 'lance', teeth: 11, serr: 0.32, fold: 0.18, curl: 0.06, sickle: 0.1 });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#5f6a2c', roughness: 0.6 });
  const NEEM_BR = [[[-0.58, 0.68], [-0.36, 0.56], [-0.14, 0.52], [0.04, 0.6]], [[-0.74, 0.28], [-0.56, 0.38], [-0.38, 0.36], [-0.2, 0.44]]];
  const neemLeaves = new THREE.InstancedMesh(neemGeo, neemMat, NEEM_BR.length * 26 + 16);
  let nl = 0;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), col = new THREE.Color();
  for (const br of NEEM_BR) {
    const curve = new THREE.CatmullRomCurve3(br.map(([x, z], i) => V3(x, 0.006 + 0.004 * Math.sin(i * 2), z)));
    herbs.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.0045, 6, false), stemMat));
    for (let k = 0; k < 13; k++) for (const s of [-1, 1]) {
      const u = 0.06 + (k / 12) * 0.9 + (s > 0 ? 0.02 : 0);
      curve.getPointAt(Math.min(1, u), p4); const tg = curve.getTangentAt(Math.min(1, u));
      const yaw = Math.atan2(-tg.z, tg.x) + s * (0.95 - k * 0.025) + (R() - 0.5) * 0.2;
      e4.set((R() - 0.5) * 0.5, yaw, 0.08 + R() * 0.12, 'YXZ');
      const sc = (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, u * 1.05))) * (0.9 + R() * 0.2);
      neemLeaves.setMatrixAt(nl, m4.compose(p4.clone().add(V3(0, 0.004, 0)), q4.setFromEuler(e4), s4.set(sc, sc, sc * (s > 0 ? 1 : -1))));
      neemLeaves.setColorAt(nl, col.setHSL(0.25 + R() * 0.04, 0.55, 0.22 + R() * 0.08));
      nl++;
    }
  }
  for (let k = 0; k < 16; k++) {                 // loose leaflets scattered round the mortar
    const a = R() * TAU, rr = 0.34 + R() * 0.32;
    p4.set(Math.cos(a) * rr, 0.003, Math.sin(a) * rr * 0.8 + 0.12);
    if (p4.z < -0.2 && p4.x > 0.2) continue;
    e4.set((R() - 0.5) * 0.3, R() * TAU, 0.05, 'YXZ');
    neemLeaves.setMatrixAt(nl, m4.compose(p4, q4.setFromEuler(e4), s4.setScalar(0.8 + R() * 0.3)));
    neemLeaves.setColorAt(nl, col.setHSL(0.22 + R() * 0.06, 0.5, 0.2 + R() * 0.1)); nl++;
  }
  neemLeaves.count = nl; herbs.add(neemLeaves);
  // tulsi: three sprigs in a brass lota, opposite leaves in decussate pairs, purple flower spikes
  const lota = new THREE.Mesh(AS.lotaGeometry(), brassMat); lota.position.set(0.48, 0, -0.34); lota.scale.setScalar(1.15); herbs.add(lota);
  const tulsiTex = AS.leafTexture({ veins: 5, seed: 7 });
  const tulsiMat = new THREE.MeshStandardMaterial({ map: tulsiTex, color: '#ffffff', roughness: 0.42, side: THREE.DoubleSide, emissive: new THREE.Color('#0a1606') });
  const tulsiGeo = AS.leafGeometry({ len: 0.075, width: 0.05, shape: 'ovate', teeth: 8, serr: 0.12, fold: 0.32, curl: -0.18 });
  const tulsiStemMat = new THREE.MeshStandardMaterial({ color: '#5a3448', roughness: 0.55 });
  const budMat = new THREE.MeshStandardMaterial({ color: '#8a4f8e', roughness: 0.5, emissive: new THREE.Color('#1a0820') });
  const tulsiLeaves = new THREE.InstancedMesh(tulsiGeo, tulsiMat, 80);
  const buds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0065, 8, 6), budMat, 160);
  let tl = 0, bd = 0;
  const lotaTop = V3(0.48, 0.24, -0.34);
  [[0.0, 0.42, 0.0], [2.1, 0.36, 0.35], [4.2, 0.32, -0.3]].forEach(([dir, h, lean]) => {
    const out = V3(Math.cos(dir), 0, Math.sin(dir));
    const pts = [lotaTop.clone(), lotaTop.clone().add(out.clone().multiplyScalar(0.03)).add(V3(0, h * 0.35, 0)), lotaTop.clone().add(out.clone().multiplyScalar(0.08 + lean * 0.05)).add(V3(0, h * 0.7, 0)), lotaTop.clone().add(out.clone().multiplyScalar(0.13 + lean * 0.08)).add(V3(0, h, 0))];
    const curve = new THREE.CatmullRomCurve3(pts);
    herbs.add(new THREE.Mesh(AS.varTube(curve, 30, 6, (u) => 0.0055 * (1 - u * 0.6)), tulsiStemMat));
    const nodes = 6;
    for (let k = 0; k < nodes; k++) {
      const u = 0.2 + (k / nodes) * 0.62;
      curve.getPointAt(u, p4);
      const sc = 1.15 - k * 0.1;
      for (const s of [0, Math.PI]) {
        const yaw = dir + k * Math.PI / 2 + s + (R() - 0.5) * 0.3;
        e4.set(0, yaw, 0.55 - k * 0.04 + (R() - 0.5) * 0.15, 'YXZ');
        tulsiLeaves.setMatrixAt(tl, m4.compose(p4, q4.setFromEuler(e4), s4.setScalar(sc * (0.9 + R() * 0.2))));
        tulsiLeaves.setColorAt(tl, col.setHSL(0.27 + R() * 0.03, 0.5, 0.24 + R() * 0.07)); tl++;
      }
    }
    for (let w = 0; w < 7; w++) {                  // flower spike: whorls of buds up the last stretch
      const u = 0.86 + w * 0.02; curve.getPointAt(Math.min(1, u), p4);
      for (let b = 0; b < 6; b++) {
        const a = (b / 6) * TAU + w * 0.5, rr = 0.011 * (1 - w / 9);
        buds.setMatrixAt(bd++, m4.compose(V3(p4.x + Math.cos(a) * rr, p4.y + 0.004, p4.z + Math.sin(a) * rr), q4.identity(), s4.setScalar(1 - w * 0.08)));
      }
    }
  });
  tulsiLeaves.count = tl; buds.count = bd; herbs.add(tulsiLeaves, buds);
  // clay diya with a living flame
  const diya = new THREE.Mesh(AS.diyaGeometry(), new THREE.MeshStandardMaterial({ color: '#9a4a26', roughness: 0.85 }));
  diya.position.set(-0.72, 0, -0.32); diya.rotation.y = -0.4; herbs.add(diya);
  const flame = new THREE.Mesh(AS.flameGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb04a').multiplyScalar(5), toneMapped: false }));
  const flamePos = V3(-0.72 + 0.118 * Math.cos(0.4), 0.056, -0.32 + 0.118 * Math.sin(0.4));
  flame.position.copy(flamePos); herbs.add(flame);
  const flameGlow = glowSprite({ color: '#ff9a3a', intensity: 1.1, scale: 0.42 }); flameGlow.position.copy(flamePos).add(V3(0, 0.04, 0)); herbs.add(flameGlow);
  const diyaLight = new THREE.PointLight('#ff9440', 0.5, 4, 2); diyaLight.position.copy(flamePos).add(V3(0, 0.08, 0)); herbs.add(diyaLight);
  shadowAll(herbs); flame.castShadow = false;

  // ---------------------------------------------------------------- the instrument display
  const display = new THREE.Group(); display.position.copy(FAN); scene.add(display);
  const velvet = new THREE.MeshPhysicalMaterial({ color: '#3d0a16', roughness: 0.92, sheen: 1, sheenRoughness: 0.42, sheenColor: new THREE.Color('#c0566a') });
  velvet.userData.detail = { albedo: 0.2, rough: 0.2, bump: 0.0002, scratch: 0, grime: 0.1, scale: 9 };
  const cloth = new THREE.Mesh(new THREE.CylinderGeometry(CLOTH_R, CLOTH_R + 0.02, CLOTH_Y, 96), velvet);
  cloth.position.y = CLOTH_Y / 2; cloth.receiveShadow = true; display.add(cloth);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(CLOTH_R + 0.012, 0.011, 8, 128), brassMat); rimRing.rotation.x = Math.PI / 2; rimRing.position.y = CLOTH_Y; display.add(rimRing);
  const lotusMat = new THREE.MeshStandardMaterial({ map: AS.lotusTexture(), color: '#f0c470', metalness: 1, roughness: 0.48 });
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.285, 0.018, 64), [brassMat, lotusMat, brassMat]);
  medallion.position.y = CLOTH_Y + 0.009; medallion.castShadow = medallion.receiveShadow = true; display.add(medallion);
  const steelMat = new THREE.MeshStandardMaterial({ color: '#e3e6ea', metalness: 1, roughness: 0.21 });
  steelMat.userData.detail = { scratch: 0.7, rough: 0.5, albedo: 0.08, bump: 0.00015, scale: 8 };
  const inst = AS.buildInstruments(5).map((b, i) => {
    const g = new THREE.Group(); g.scale.setScalar(ISCALE);
    const sm = new THREE.Mesh(b.steel, steelMat); g.add(sm);
    if (b.brass) g.add(new THREE.Mesh(b.brass, brassMat));
    shadowAll(g);
    display.add(g);
    const theta = -Math.PI / 2 + (i * TAU) / SLOTS;
    let delta = theta - Math.PI / 2; delta = Math.atan2(Math.sin(delta), Math.cos(delta)); if (i === 0) delta = -Math.PI;
    return { g, b, theta, delta, lift: (i % 4) * 0.012 };
  });
  const lion = inst.find((s) => s.b.kind === 'lion'), heron = inst.find((s) => s.b.kind === 'heron');

  // palm-leaf manuscript on its wooden boards behind the display, red cords through the holes
  const folio = new THREE.Group(); folio.position.copy(FOLIO); scene.add(folio);
  const boardMat = new THREE.MeshStandardMaterial({ map: teak, color: '#c89070', roughness: 0.6 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.022, 0.27), boardMat); board.position.y = 0.011; folio.add(board);
  const folioTex = AS.folioTexture();
  const leafEdge = new THREE.MeshStandardMaterial({ color: '#b89a62', roughness: 0.8 });
  const leafTop = new THREE.MeshStandardMaterial({ map: folioTex, color: '#ffffff', roughness: 0.62 });
  for (let k = 0; k < 4; k++) {
    const lf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.005, 0.23), [leafEdge, leafEdge, leafTop, leafEdge, leafEdge, leafEdge]);
    lf.position.set((k - 1.5) * 0.004, 0.025 + k * 0.0055, (k % 2) * 0.004); lf.rotation.y = (k - 1.5) * 0.004; folio.add(lf);
  }
  const cordMat = new THREE.MeshStandardMaterial({ color: '#8a1e1a', roughness: 0.7 });
  for (const hx of [-0.34, 0.34]) {
    const pts = [V3(hx, 0.05, 0), V3(hx + 0.05, 0.05, 0.08), V3(hx + 0.16, 0.025, 0.2), V3(hx + 0.28, 0.006, 0.26), V3(hx + 0.42, 0.003, 0.24)];
    folio.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.006, 6, false), cordMat));
  }
  shadowAll(folio);

  // ---------------------------------------------------------------- the rhinoplasty hologram
  const diaPivot = new THREE.Group(); scene.add(diaPivot);
  const dia = new THREE.Group(); diaPivot.add(dia);
  const D = (x, y, z = 0) => V3(DOX + x * DS, DOY + y * DS, z);           // diagram → plate coordinates
  const dPts = (pts, n = 6, z = 0) => AS.smoothPts(pts, n, 0).map((p) => D(p.x, p.y, z));
  const lines = [];                                                       // [line, t0, t1, baseOpacity]
  const addLine = (l, t0, t1, o = 1) => { dia.add(l); lines.push([l, t0, t1, o]); l.renderOrder = 5; return l; };
  const P = AS.PROFILE;
  const contour = [...P.front, ...P.nose.slice(1), ...P.lower.slice(1)];
  // backing plate: faint grid + corner brackets
  const PLATE_W = 2.5, PLATE_H = 1.62, PLATE_C = V3(0.12, 0.8, -0.02);
  const plateMat = new THREE.MeshBasicMaterial({ map: gridTexture({ cells: 12, sub: 4 }), color: new THREE.Color(GOLD).multiplyScalar(0.22), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), plateMat); plate.position.copy(PLATE_C); dia.add(plate);
  const bracket = new BracketFrame(PLATE_W, PLATE_H, { len: 0.12, color: GOLD, intensity: 1.2 }); bracket.position.copy(PLATE_C); dia.add(bracket);
  // head silhouette fill (very faint) and the outline
  const headShape = new THREE.Shape(dPts([...contour, ...P.back.slice().reverse().slice(0, -1)], 4).map((p) => new THREE.Vector2(p.x, p.y)));
  const fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(0.07), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(headShape, 4), fillMat); fill.position.z = -0.01; dia.add(fill);
  const LT = (a, b) => [tRhino + a, tRhino + b];
  addLine(progressLine(dPts([...P.front]), { color: GOLD, headColor: GOLD_HOT, intensity: 1.5, head: 0.05 }), ...LT(0.05, 0.25));
  addLine(progressLine(dPts([...P.lower]), { color: GOLD, headColor: GOLD_HOT, intensity: 1.5, head: 0.05 }), ...LT(0.12, 0.42));
  addLine(progressLine(dPts([...P.back]), { color: GOLD, headColor: GOLD_HOT, intensity: 1.3, head: 0.05 }), ...LT(0.05, 0.4));
  for (const [pts, a] of [[P.brow, 0.2], [P.eye, 0.24], [P.ear, 0.22], [P.jaw, 0.28], [P.cheekbone, 0.3], [P.ala, 0.34]]) addLine(progressLine(dPts(pts), { color: GOLD, intensity: 1.0, head: 0.08 }), ...LT(a, a + 0.22), 0.85);
  // echo of the contour a little behind: depth for the hologram as the camera moves
  addLine(progressLine(dPts([...contour], 6, -0.07), { color: GOLD, intensity: 0.45 }), ...LT(0.1, 0.45), 0.6);
  addLine(progressLine(dPts([...P.back], 6, -0.07), { color: GOLD, intensity: 0.4 }), ...LT(0.1, 0.45), 0.6);
  // the nose to be rebuilt: dashed first, then drawn solid as the flap swings in
  const nosePts = dPts(P.nose, 8);
  const dashes = [];
  for (let i = 0; i < nosePts.length - 1; i += 2) dashes.push([nosePts[i], nosePts[i + 1]]);
  const noseDash = addLine(segmentsLine(dashes, { color: GOLD_HOT, intensity: 1.1, orderFn: (a, b, i) => i / dashes.length * 0.7, stagger: 0.7 }), ...LT(0.18, 0.42), 0.9);
  const noseSolid = addLine(progressLine(nosePts, { color: GOLD_HOT, headColor: '#ffffff', intensity: 2.4, head: 0.08 }), ...LT(0.78, 1.05), 1);
  // cheek flap: outline + hatching, then the arrows that turn it onto the nose
  const flapPts = dPts(P.flap, 6);
  addLine(progressLine(flapPts, { color: AMBER, headColor: GOLD_HOT, intensity: 2.0, head: 0.06 }), ...LT(0.3, 0.6));
  const hatch = [];
  {
    const poly = flapPts.map((p) => [p.x, p.y]);
    for (let c = -2; c <= 2; c += 0.022) {             // lines x - y = c (45°)
      const hits = [];
      for (let i = 0; i < poly.length - 1; i++) {
        const [x1, y1] = poly[i], [x2, y2] = poly[i + 1];
        const f1 = x1 - y1 - c, f2 = x2 - y2 - c;
        if ((f1 < 0) !== (f2 < 0)) { const u = f1 / (f1 - f2); hits.push([x1 + (x2 - x1) * u, y1 + (y2 - y1) * u]); }
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k + 1 < hits.length; k += 2) hatch.push([V3(hits[k][0], hits[k][1], 0.002), V3(hits[k + 1][0], hits[k + 1][1], 0.002)]);
    }
  }
  addLine(segmentsLine(hatch, { color: AMBER, intensity: 0.55, orderFn: (a) => sat((a.x - flapPts[0].x + 0.25) / 0.3) * 0.5, stagger: 0.5 }), ...LT(0.42, 0.68), 0.8);
  const arrowHead = (pts, size = 0.035) => {
    const a = pts[pts.length - 1], b = pts[pts.length - 3], d = a.clone().sub(b).normalize(), n = V3(-d.y, d.x, 0);
    return [[a, a.clone().addScaledVector(d, -size).addScaledVector(n, size * 0.6)], [a, a.clone().addScaledVector(d, -size).addScaledVector(n, -size * 0.6)]];
  };
  const arcPts = new THREE.QuadraticBezierCurve3(D(-0.05, 0.0, 0.01), D(-0.02, 0.24, 0.01), D(0.14, 0.11, 0.01)).getPoints(40);
  const arrow = addLine(progressLine(arcPts, { color: GOLD_HOT, headColor: '#ffffff', intensity: 2.6, head: 0.06 }), ...LT(0.5, 0.8));
  const arrowTip = addLine(segmentsLine(arrowHead(arcPts), { color: GOLD_HOT, intensity: 2.6, orderFn: () => 0, stagger: 0 }), ...LT(0.78, 0.84));
  const turnPts = circlePoints(0.04 * DS, 40, { start: -2.4, end: 1.2, center: D(0.075, -0.02, 0.01) });
  addLine(progressLine(turnPts, { color: GOLD, intensity: 2.0, head: 0.06 }), ...LT(0.56, 0.84));
  addLine(segmentsLine(arrowHead(turnPts, 0.025), { color: GOLD, intensity: 2.0, orderFn: () => 0, stagger: 0 }), ...LT(0.82, 0.86));
  // the leaf template, sized to the nose, with its dimension and a dotted path to the cheek
  const LEAF_C = V3(0.86, 0.86, 0);
  const leafOutline = [];
  for (let i = 0; i <= 44; i++) {               // up the right edge to the drip tip, back down the left
    const k = i <= 22 ? i / 22 : (44 - i) / 22, side = i <= 22 ? 1 : -1;
    const w = 0.115 * Math.pow(Math.sin(Math.PI * Math.pow(k, 0.7)), 1.1) * (1 - 0.25 * k);
    leafOutline.push(V3(LEAF_C.x + side * w, LEAF_C.y - 0.21 + 0.42 * k, 0));
  }
  addLine(progressLine(leafOutline, { color: GOLD, intensity: 1.6, head: 0.06 }), ...LT(0.25, 0.55));
  const veins = [[LEAF_C.clone().add(V3(0, -0.22, 0)), LEAF_C.clone().add(V3(0, 0.2, 0))]];
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const y = -0.12 + k * 0.08; veins.push([LEAF_C.clone().add(V3(0, y, 0)), LEAF_C.clone().add(V3(s * 0.07 * (1 - k * 0.15), y + 0.06, 0))]); }
  addLine(segmentsLine(veins, { color: GOLD, intensity: 0.8, orderFn: (a, b, i) => i / veins.length * 0.6, stagger: 0.6 }), ...LT(0.4, 0.65), 0.8);
  const dimX = LEAF_C.x + 0.19;
  addLine(segmentsLine([[V3(dimX, LEAF_C.y - 0.2, 0), V3(dimX, LEAF_C.y + 0.2, 0)], [V3(dimX - 0.025, LEAF_C.y - 0.2, 0), V3(dimX + 0.025, LEAF_C.y - 0.2, 0)], [V3(dimX - 0.025, LEAF_C.y + 0.2, 0), V3(dimX + 0.025, LEAF_C.y + 0.2, 0)]], { color: IVORY, intensity: 0.9, orderFn: (a, b, i) => (i === 0 ? 0 : 0.4), stagger: 0.5 }), ...LT(0.45, 0.7), 0.8);
  const dotPath = new THREE.QuadraticBezierCurve3(LEAF_C.clone().add(V3(-0.15, -0.12, 0)), D(0.25, -0.25, 0), D(-0.04, -0.1, 0)).getPoints(36);
  const dots = []; for (let i = 0; i < dotPath.length - 1; i += 2) dots.push([dotPath[i], dotPath[i + 1]]);
  addLine(segmentsLine([...dots, ...arrowHead(dotPath, 0.03)], { color: IVORY, intensity: 0.9, orderFn: (a, b, i) => Math.min(1, i / dots.length) * 0.7, stagger: 0.7 }), ...LT(0.55, 0.85), 0.75);
  const plateLabel = (txt, x, y, h, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, height: h, letterSpacing: 0.16, color: IVORY, intensity: 1.0, depthWrite: false, ...o }); tp.position.set(x, y, 0.005); tp.renderOrder = 6; dia.add(tp); return tp; };
  const leafLab = plateLabel('LEAF TEMPLATE', LEAF_C.x, LEAF_C.y - 0.3, 0.042);
  const titleLab = plateLabel('NASAL RECONSTRUCTION · CHEEK FLAP', PLATE_C.x, PLATE_C.y - PLATE_H / 2 + 0.09, 0.064, { color: GOLD_HOT, intensity: 1.15, weight: 500 });
  const flapLab = plateLabel('CHEEK FLAP', D(-0.08, -0.2).x, D(-0.08, -0.2).y, 0.036, { color: AMBER, intensity: 1.1 });
  const noseRing = new RingGauge(0.2, { ticks: 60, color: GOLD, intensity: 1.0, tickLen: 0.02, majorEvery: 5 });
  noseRing.position.copy(D(0.12, 0.08, 0.02)); dia.add(noseRing);
  const sweep = progressLine(circlePoints(0.23, 80, { start: Math.PI / 2, end: Math.PI / 2 - TAU * 0.7 }), { color: GOLD_HOT, intensity: 1.8, head: 0.05 });
  noseRing.add(sweep);
  const folioGlow = glowSprite({ color: '#ffb860', intensity: 0.6, scale: 1.6 }); folioGlow.position.copy(FOLIO).add(V3(0, 0.06, 0)); scene.add(folioGlow);

  // ---------------------------------------------------------------- screen HUD
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  const SQ = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UI = TALL ? 1.9 : SQ ? 1.6 : 1, UC = TALL ? 1.85 : SQ ? 1.45 : 1, UCX = SQ ? 0.85 : 1;
  const PK = Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.15);
  const MH = FILM_ASPECT / OUTPUT_ASPECT;                  // HUD half-height of the delivered frame
  const BOT = SQ ? -Math.min(MH * 0.62, 2.2) : -0.78;
  const hudG = new THREE.Group(); hud.scene.add(hudG);
  const centerText = (txt, y, o = {}) => { const tp = new TextPlane(txt, { font: FONTS.mono, letterSpacing: 0.2, color: IVORY, intensity: 1.2, ...o, height: (o.height ?? 0.05) * UI }); tp.position.set(0, y, 0); hudG.add(tp); return tp; };
  const countLab = centerText('101 BLUNT · 20 SHARP INSTRUMENTS', BOT, { weight: 500 });
  const countSub = centerText('YANTRAS · SHASTRAS · SUSHRUTA SAMHITA', BOT - 0.075 * UI, { height: 0.03, intensity: 0.7 });
  const cw = countLab.worldWidth * 0.55;
  const countRule = segmentsLine([[V3(-cw, BOT + 0.05 * UI, 0), V3(cw, BOT + 0.05 * UI, 0)]], { color: IVORY, intensity: 0.7, orderFn: () => 0, stagger: 0 }); hudG.add(countRule);
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UCX, dy: dy * UC, size: 0.046 * UC, color: IVORY, sub, intensity: 1.35 }); hudG.add(c); return c; };
  const callLion = mkCall('SIMHAMUKHA', 'LION-FACED FORCEPS', 0.7, 0.26);
  const callHeron = mkCall('KANKAMUKHA', 'HERON-FACED FORCEPS', -0.7, 0.26);
  const callEye = mkCall('CATARACT COUCHING', 'EYE SURGERY', -0.62, 0.2);
  const callProc = mkCall('300+ PROCEDURES', '121 INSTRUMENTS', 0.62, -0.22);
  const modelLab = centerText('PRACTISED FIRST ON MODELS · GOURDS · CUCUMBERS · LEATHER BAGS OF WATER', BOT - 0.02, { height: 0.034, intensity: 0.85, size: 72 });
  const anchors = [
    [callLion, () => lion.g.localToWorld(lion.b.head.clone())],
    [callHeron, () => heron.g.localToWorld(heron.b.head.clone())],
    [callEye, () => dia.localToWorld(D(0.03, 0.21, 0))],
    [callProc, () => dia.localToWorld(D(-0.05, -0.0, 0))],
  ];
  const tmp = new THREE.Vector3();
  const placeHud = (cam) => {
    for (const [c, f] of anchors) {
      if (!c.visible) continue;
      tmp.copy(f()).project(cam);
      c.position.set(tmp.x * A * PK, tmp.y * PK, 0);
    }
  };

  // ---------------------------------------------------------------- camera path
  const CAM = [V3(-1.9, 0.56, 1.6), V3(-1.62, 0.62, 1.46), V3(0.3, 2.3, 2.0), V3(0.42, 2.1, 2.14), V3(0.4, 1.2, 2.95), V3(0.37, 1.12, 2.5), V3(0.27, 0.95, 0.42)];
  const LOOK = [V3(-2.3, 0.12, 0.24), V3(-2.12, 0.12, 0.2), V3(0.4, 0.0, 0.18), V3(0.4, 0.04, 0.1), V3(0.36, 1.04, -1.1), V3(0.32, 1.0, -1.16), V3(0.25, 0.9, -1.22)];
  const camCurve = new THREE.CatmullRomCurve3(CAM, false, 'centripetal'), lookCurve = new THREE.CatmullRomCurve3(LOOK, false, 'centripetal');
  const SK = [[0, 0], [tInst - 0.1, 1], [tInst + 0.68, 2], [tRhino, 3], [tRhino + 0.55, 4], [tHud + 0.05, 5], [tHud + 0.42, 5.4], [DUR, 6]];
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  let lastT = 0;
  const api = {
    scene, camera, hud,
    dof: { focus: 1.4, range: 0.5, amount: 0.7 },
    bloom: { strength: 0.75 },
    exposure: 1.0,
    harmony: 0.6,
    background: 0x050302,
    exploreLimits: { yaw: 1.1, pitchDown: 0.45, pitchUp: 0.7, zoomOut: 2.2 },
    arSubject: (t) => (t < tInst - 0.05 ? { centre: HERB.clone().add(V3(-0.15, 0.15, 0.05)), radius: 0.95 }
      : t < tRhino ? { centre: FAN.clone().add(V3(0, 0.05, 0)), radius: 1.45 }
      : { centre: V3(0.4, 0.75, -1.0), radius: 1.5 }),
    explorePosed(cam) { cam.updateMatrixWorld(); placeHud(cam); },
    update(t, info) {
      const T = info.T;
      lastT = t;
      const beat = pulse(T, { decay: 9 });

      // -------- camera: herb macro → crane over the display → tilt up to the hologram → push into the nose
      const s = timeWarp(t, SK) / 6;
      camCurve.getPoint(sat(s), camPos); lookCurve.getPoint(sat(s), look);
      if (s > 1) camPos.lerp(look, Math.min(0.3, (s - 1) * 2));
      camPos.x += Math.sin(t * 1.3) * 0.012; camPos.y += Math.sin(t * 1.7 + 1) * 0.008;   // a breath of handheld
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.8) * 0.012, 1, 0).normalize();
      camera.lookAt(look);
      const fanW = ramp(t, tInst - 0.1, tInst + 0.6), diaW = ramp(t, tRhino, tRhino + 0.5), push = ramp(t, tHud, DUR, ease.inQuad);
      camera.fov = lerp(lerp(lerp(29, 34, fanW), 33, diaW), 27, push);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // -------- light: the jali shaft carries the herbs; the display spot comes up with the fan
      const shaftK = 1 - 0.55 * ramp(t, tInst, tRhino);
      key.intensity = 70 * (0.92 + 0.08 * Math.sin(t * 0.9)) * (0.75 + 0.25 * shaftK);
      shaft.material.uniforms.uIntensity.value = 0.1 * shaftK; shaft.material.uniforms.uTime.value = t;
      fanSpot.intensity = 24 * (0.12 + 0.88 * ramp(t, tInst - 0.15, tInst + 0.3, ease.outCubic)) * (1 - 0.35 * ramp(t, tRhino, tRhino + 0.4));
      dust.tick(t, info); dust.u.opacity = 0.55 * shaftK;
      const fl = 1 + 0.08 * Math.sin(t * 23) + 0.05 * Math.sin(t * 37 + 1) + 0.04 * Math.sin(t * 61);
      flame.scale.set(1, fl, 1); flame.rotation.z = 0.06 * Math.sin(t * 9);
      diyaLight.intensity = 0.5 * fl; flameGlow.material.color.setRGB(1.0, 0.6, 0.23).multiplyScalar(1.1 * fl);

      // -------- the fan of instruments opens round the medallion
      for (let i = 0; i < SLOTS; i++) {
        const it = inst[i], d = Math.abs(it.delta) / Math.PI;
        const p = ramp(t, tInst - 0.1 + d * 0.14, tInst + 0.38 + d * 0.12, ease.outCubic);
        const ang = Math.PI / 2 + it.delta * p;
        const r = lerp(0.3, R0, p);
        it.g.position.set(Math.cos(ang) * r, CLOTH_Y + it.lift * Math.sin(Math.PI * p) + (1 - p) * i * 0.0012, -Math.sin(ang) * r);
        it.g.rotation.set(0, ang, 0);
      }
      display.updateMatrixWorld(true);

      // -------- the hologram lifts off the folio and draws itself
      const lift = ramp(t, tRhino - 0.08, tRhino + 0.42, ease.inOutCubic);
      diaPivot.visible = t > tRhino - 0.1;
      diaPivot.position.lerpVectors(V3(FOLIO.x, FOLIO.y + 0.05, FOLIO.z + 0.1), DIA_POS, lift);
      diaPivot.rotation.x = lerp(-Math.PI / 2, 0, lift);
      diaPivot.scale.setScalar(lerp(0.55, 1, lift));
      diaPivot.updateMatrixWorld(true);
      const holo = ramp(t, tRhino - 0.05, tRhino + 0.25);
      const flick = 0.93 + 0.07 * Math.sin(t * 41) * Math.sin(t * 13);
      for (const [l, t0, t1, o] of lines) { l.progress = ramp(t, t0, t1, ease.inOutSine); l.opacity = o * holo * flick; }
      noseDash.opacity *= 1 - 0.85 * ramp(t, tRhino + 0.8, tRhino + 1.0);
      noseSolid.intensity = 2.4 + beat * 0.8 * ramp(t, tHud, tHud + 0.2);
      arrow.intensity = arrowTip.intensity = 2.6 + 0.6 * beat;
      plateMat.opacity = holo * 0.9; fillMat.opacity = holo * ramp(t, tRhino + 0.2, tRhino + 0.6);
      bracket.reveal(ramp(t, tRhino + 0.0, tRhino + 0.35, ease.outCubic), holo);
      for (const [lab, a] of [[titleLab, 0.32], [leafLab, 0.5], [flapLab, 0.62]]) { const p = ramp(t, tRhino + a, tRhino + a + 0.3); lab.reveal = 1; lab.opacity = p * holo; }
      titleLab.opacity *= 1 - ramp(t, tHud + 0.1, tHud + 0.3);
      const ringIn = ramp(t, tHud - 0.05, tHud + 0.35, ease.outCubic);
      noseRing.reveal(ringIn, 0.9); noseRing.rotation.z = t * 0.6; noseRing.visible = ringIn > 0;
      sweep.progress = ramp(t, tHud + 0.1, tHud + 0.6); sweep.opacity = ringIn;
      folioGlow.material.opacity = envelope(t, tRhino - 0.15, DUR + 1, 0.2, 0.1) * 0.9;

      // -------- screen HUD
      const cIn = ramp(t, tInst + 0.32, tInst + 0.62, ease.outCubic), cOut = 1 - ramp(t, tRhino - 0.05, tRhino + 0.2);
      countLab.reveal = cIn; countLab.opacity = cIn > 0 ? cOut : 0;
      countSub.reveal = ramp(t, tInst + 0.42, tInst + 0.75); countSub.opacity = countSub.reveal > 0 ? cOut * 0.9 : 0;
      countRule.progress = cIn; countRule.opacity = 0.8 * cOut;
      const callP = (c, a, b, out) => { const p = ramp(t, a, b, ease.outCubic); c.visible = p > 0 && out > 0; if (c.visible) { c.reveal(p, out); if (c.sub) c.sub.reveal = sat((p - 0.4) / 0.5); } };
      callP(callLion, tInst + 0.38, tInst + 0.7, cOut);
      callP(callHeron, tInst + 0.46, tInst + 0.78, cOut);
      const hOut = 1 - ramp(t, DUR - 0.2, DUR + 0.2);
      callP(callEye, tHud + 0.0, tHud + 0.3, hOut);
      callP(callProc, tHud + 0.12, tHud + 0.42, hOut);
      const mIn = ramp(t, tHud + 0.25, tHud + 0.55);
      modelLab.reveal = mIn; modelLab.opacity = mIn > 0 ? hOut : 0;
      placeHud(camera);

      // -------- lens
      const focusHerb = camPos.distanceTo(tmp.copy(HERB).add(V3(0, 0.12, 0)));
      const focusFan = camPos.distanceTo(FAN);
      const focusDia = camPos.distanceTo(dia.localToWorld(D(0.05, 0.1, 0)));
      api.dof.focus = lerp(lerp(focusHerb, focusFan, fanW), focusDia, diaW);
      api.dof.range = lerp(lerp(0.45, 1.6, fanW), 1.1, diaW);
      api.dof.amount = lerp(lerp(0.75, 0.3, fanW), 0.45, diaW);
      api.bloom.strength = 0.72 + 0.12 * diaW + 0.1 * push;
      api.exposure = 1.0 + 0.04 * envelope(t, tInst - 0.1, tInst + 0.5, 0.2, 0.3);
      api.harmony = lerp(0.55, 0.85, fanW);
    },
  };
  return api;
}
