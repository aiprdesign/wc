// THE ITALIAN RENAISSANCE (20.0 – 26.5 s) — one continuous camera journey in the film's warm sepia-and-gold
// Renaissance look (renaissance.js's ink, gold and procedural drawing technique):
//   italyDome        +0.0  Florence at golden hour: the camera glides over terracotta roofs to Santa Maria
//                          del Fiore and Brunelleschi's dome (1420–1436), the largest masonry dome ever built.
//   brunelleschi     +0.9  a cutaway lifts two webs away: the section shows the double shell; in the opening
//                          the inner shell's bricks are laid course by course in herringbone. The dome draws
//                          itself in ink, the frame turns to parchment …
//   leonardoNotebook +1.9  … and the drawing is a page of Leonardo's notebook: mirror script writes itself,
//                          right to left, beside it (decorative strokes, no text).
//   aerialScrew      +2.5  sepia drawings draw stroke by stroke and lift off the sheets into wood-and-linen
//   ornithopter      +3.2  models — designs, never built in his lifetime — the strokes inflating into 3D
//   armouredCar      +3.9  with the model.
//   sistine          +4.6  the camera rises into the dark; gold linework builds a barrel vault around it and the
//                          Sistine Chapel lights up, the ceiling's colour sweeping from the entrance to the
//                          altar as Michelangelo painted it (1508–1512) …
//   creationOfAdam   +5.4  … up to the Creation of Adam: two hands drawn as stroke art, the fresco colour
//                          returning beneath the ink, the gap between the fingers glowing (dissolve → science).
// The three sets live far apart in one scene and only the current one is shown; the hand-overs are a
// match-cut through parchment (the dome's ink lines become the page's) and a dip through dark gold
// linework (the vault's lines are posed for the chapel camera before the cut).
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { clamp, lerp, ease, ramp, envelope, timeWarp, smoothstep, sat } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { Callout } from '../lib/hud.js';
import { glowSprite, lightShaft } from '../lib/materials.js';
import { segmentsLine } from '../lib/lines.js';
import { Dust } from '../lib/particles.js';
import { V, SEPIA, GOLD, EMBER, inkOpts, orderedStrokes, pageTexture } from './italy-assets.js';
import { buildFlorence, CUT_DIR } from './italy-florence.js';
import { buildStudy, SHEETS, PAGE_Y } from './italy-leonardo.js';
import { buildChapel, ADAM, HALL } from './italy-sistine.js';

// beats (local seconds) when the film doesn't define the cue
const BEATS = { italyDome: 0.0, brunelleschi: 0.9, leonardoNotebook: 1.9, aerialScrew: 2.5, ornithopter: 3.2, armouredCar: 3.9, sistine: 4.6, creationOfAdam: 5.4 };
const STUDY_O = V(300, 0, 0), CHAPEL_O = V(600, 0, 0);
const DPAGE = 0.36;                     // the page camera's height above the dome sketch at the match-cut

function makePath(keys) {
  const pos = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
  const tgt = new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal');
  const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
  return (t, P, T) => { const u = clamp(timeWarp(t, warp), 0, 1); pos.getPoint(u, P); tgt.getPoint(u, T); };
}

export function create(ctx, segment) {
  const lite = ctx.engine?.quality === 'lite';
  const cue = (n) => (CUES[n] !== undefined ? CUES[n] - segment.start : BEATS[n]);
  const B = Object.fromEntries(Object.keys(BEATS).map((k) => [k, cue(k)]));
  const DUR = segment.end - segment.start;
  const TC1 = B.leonardoNotebook, TC2 = B.sistine;          // the two hand-overs

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.35;
  scene.fog = new THREE.Fog('#d9b88f', 40, 200);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.5, 450);
  scene.add(camera);

  // ------------------------------------------------------------------------------------------ sets
  const flo = buildFlorence({ lite });
  scene.add(flo.root);
  // sky dome: a warm golden-hour gradient with the sun's glow (Florence only)
  const sunDir = V(-0.5, 0.42, 0.76).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0);
        vec3 top = vec3(0.3, 0.36, 0.48), mid = vec3(0.86, 0.66, 0.44), hor = vec3(0.98, 0.74, 0.48);
        vec3 c = mix(hor, mid, smoothstep(0.0, 0.12, h)); c = mix(c, top, smoothstep(0.1, 0.75, h));
        float s = max(dot(normalize(vD), uSun), 0.0);
        c += vec3(1.0, 0.75, 0.45) * (pow(s, 24.0) * 1.2 + pow(s, 4.0) * 0.25);
        gl_FragColor = vec4(c * 0.8, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  flo.root.add(sky);

  // the dome's ink drawing (world space): drawn over the model, then on parchment
  const inkSegs = [], inkOrd = [];
  {
    const kinds = { construct: 0.0, drum: 0.15, rib: 0.25, ring: 0.42, section: 0.55, lantern: 0.7 };
    flo.ink.forEach((l, li) => {
      const o0 = kinds[l.kind] ?? 0.5;
      l.o = o0; l.span = 0.3;
      for (let i = 0; i < l.pts.length - 1; i++) { inkSegs.push([l.pts[i], l.pts[i + 1]]); inkOrd.push(o0 + (i / (l.pts.length - 1)) * 0.3 + (li % 5) * 0.01); }
    });
  }
  const inkF = orderedStrokes(inkSegs, inkOrd.map((o) => o / 1.05), { color: GOLD, headColor: '#fff3d6', intensity: 1.4, opacity: 1, head: 0.02, additive: false, depthTest: false }, 0.03);
  inkF.renderOrder = 60;
  flo.root.add(inkF);

  // Florence camera path (needed now: the page sketch is the drawing seen through it at the match-cut)
  const pathF = makePath([
    [-0.6, V(-31, 15.5, 27), V(0, 6.4, 0)],
    [0.0, V(-24, 12.8, 22.5), V(0, 6.6, 0)],
    [0.5, V(-16.5, 11.0, 19), V(0, 6.9, 0)],
    [0.95, V(-7.5, 10.2, 15.8), V(0, 7.0, 0)],
    [1.45, V(Math.cos(1.38) * 9.0, 11.6, Math.sin(1.38) * 9.0), V(0.35, 7.2, 0.9)],
    [TC1, V(Math.cos(CUT_DIR) * 14.6, 10.6, Math.sin(CUT_DIR) * 14.6), V(0, 7.15, 0)],
    [TC1 + 0.4, V(Math.cos(CUT_DIR + 0.04) * 15, 10.7, Math.sin(CUT_DIR + 0.04) * 15), V(0, 7.15, 0)],
  ]);
  const poser = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 100);
  const _P = V(), _T = V();
  const poseCam = (cam, P, T, up = V(0, 1, 0)) => { cam.position.copy(P); cam.up.copy(up); cam.lookAt(T); cam.updateMatrixWorld(true); };
  // the page sketch: every ink point seen through the Florence camera at TC1, laid on the page as the page
  // camera (DPAGE above the sheet, looking straight down, screen-up = −z) sees the same directions
  const sp = SHEETS.dome;
  pathF(TC1, _P, _T); poseCam(poser, _P, _T);
  const domeInk = flo.ink.map((l) => ({
    o: l.o / 1.05, span: l.span / 1.05,
    pts: l.pts.map((p) => { const c = p.clone().applyMatrix4(poser.matrixWorldInverse); const k = DPAGE / Math.max(1e-3, -c.z); return V(sp.x + c.x * k, 0, sp.z - c.y * k); }),
  }));

  const study = buildStudy({ lite, domeInk });
  study.root.position.copy(STUDY_O);
  scene.add(study.root);
  const chapel = buildChapel({ lite });
  chapel.root.position.copy(CHAPEL_O);
  scene.add(chapel.root);

  // chapel: light shafts through the south windows, dust
  const shafts = [];
  for (const wx of [-10.2, -3.4, 3.4, 10.2]) {
    const s = lightShaft({ length: 19, radiusTop: 0.7, radiusBottom: 2.4, color: '#ffe6bf', intensity: 0.05 });
    s.position.set(wx, 12.6, -HALL.W / 2 + 0.4);
    s.lookAt(V(wx + 3.5, 0, 4.5).add(CHAPEL_O)); s.rotateX(-Math.PI / 2);
    chapel.root.add(s); shafts.push(s);
  }
  const dustC = new Dust({ count: lite ? 600 : 1400, size: [36, 16, 12], center: [0, 9, 0], color: '#ffe6c0', particleSize: 0.05, opacity: 0.4, intensity: 1.2, seed: 15 });
  chapel.root.add(dustC);
  const dustS = new Dust({ count: lite ? 300 : 700, size: [1.6, 0.6, 0.8], center: [0.4, 0.3, 0], color: '#ffe2b8', particleSize: 0.0016, opacity: 0.45, intensity: 1.3, seed: 21 });
  study.root.add(dustS);
  const gapGlow = glowSprite({ color: '#ffd9a0', intensity: 3, scale: 0.2 });
  gapGlow.position.copy(chapel.gap); gapGlow.renderOrder = 6;
  chapel.root.add(gapGlow);

  // the vault's gold construction lines: in the chapel (after the cut) and as a ghost posed for the chapel
  // camera in front of the desk camera (before it)
  const goldSegs = [];
  for (const pl of chapel.gold) for (let i = 0; i < pl.length - 1; i++) goldSegs.push([pl[i], pl[i + 1]]);
  const goldOrd = goldSegs.map(([a, b]) => sat(((a.x + b.x) / 2 + HALL.L / 2) / HALL.L * 0.8 + (1 - ((a.y + b.y) / 2) / 21) * 0.2));
  const goldOpts = { color: GOLD, headColor: '#fff4dc', intensity: 1.15, opacity: 1, head: 0.03, additive: true };
  const goldC = orderedStrokes(goldSegs, goldOrd, goldOpts, 0.05);
  chapel.root.add(goldC);
  const ghost = new THREE.Group(); ghost.matrixAutoUpdate = false;
  const goldG = orderedStrokes(goldSegs, goldOrd, { ...goldOpts, depthTest: false }, 0.05);
  goldG.renderOrder = 40;
  ghost.add(goldG); scene.add(ghost);

  // ------------------------------------------------------------------------------------------ lights
  const sun = new THREE.DirectionalLight('#ffd9a6', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#f1d9b5', '#5b4330', 0.8);
  const fill = new THREE.DirectionalLight('#9fb4d8', 0.4);
  scene.add(hemi, fill, fill.target);

  // ------------------------------------------------------------------------------------------ overlay
  // parchment on the lens for the match-cut (the dome's ink lines draw over it)
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: pageTexture(), color: '#efdcb6', transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: true }));
  overlay.renderOrder = 50; overlay.frustumCulled = false;
  camera.add(overlay);

  // ------------------------------------------------------------------------------------------ HUD
  const hud = ctx.makeHUD();
  const SQ = OUTPUT_ASPECT < 1.5, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HXp = (dx) => -FILM_ASPECT + dx * UI, HYp = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const CREAM = '#f6e7c8', SAND = '#e6cf9f', HGOLD = '#f0b445';
  const mainO = { size: 110, font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: CREAM, intensity: 1.15 };
  const subO = { size: 100, font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: SAND, intensity: 0.9 };
  const topO = { size: 100, font: FONTS.mono, weight: 500, height: 0.024 * UI, letterSpacing: 0.26, color: HGOLD, intensity: 1.25 };
  const NEVER = 'DESIGNED, NEVER BUILT IN HIS LIFETIME';
  const CAPS = [
    { a: 0.12, b: TC1 - 0.12, main: 'SANTA MARIA DEL FIORE · FLORENCE', subs: [[B.brunelleschi, "BRUNELLESCHI'S DOME · 1420–1436 · HERRINGBONE BRICK · DOUBLE SHELL"], [B.brunelleschi + 0.35, 'STILL THE LARGEST MASONRY DOME EVER BUILT']] },
    { a: TC1 + 0.08, b: B.aerialScrew - 0.03, main: 'LEONARDO DA VINCI · NOTEBOOKS', subs: [[TC1 + 0.2, 'MIRROR WRITING, RIGHT TO LEFT']] },
    { a: B.aerialScrew, b: B.ornithopter - 0.03, top: 'LEONARDO DA VINCI · NOTEBOOKS', main: 'AERIAL SCREW · c. 1489', subs: [[B.aerialScrew + 0.1, NEVER]] },
    { a: B.ornithopter, b: B.armouredCar - 0.03, top: 'LEONARDO DA VINCI · NOTEBOOKS', main: 'ORNITHOPTER · c. 1490', subs: [[B.ornithopter + 0.1, NEVER]] },
    { a: B.armouredCar, b: TC2 - 0.12, top: 'LEONARDO DA VINCI · NOTEBOOKS', main: 'ARMOURED VEHICLE · 1487', subs: [[B.armouredCar + 0.1, NEVER]] },
    { a: TC2 + 0.1, b: B.creationOfAdam - 0.03, main: 'SISTINE CHAPEL · VATICAN', subs: [[TC2 + 0.2, 'MICHELANGELO · CEILING 1508–1512'], [TC2 + 0.45, 'PAINTED FROM THE ENTRANCE TOWARDS THE ALTAR']] },
    { a: B.creationOfAdam + 0.05, b: DUR - 0.3, top: 'SISTINE CHAPEL · VATICAN', main: 'THE CREATION OF ADAM', subs: [[B.creationOfAdam + 0.15, 'MICHELANGELO · CEILING 1508–1512']] },
  ].map((c) => ({
    ...c,
    m: tpLeft(c.main, mainO, HXp(0.16), HYp(-0.78)),
    s: c.subs.map(([at, txt], i) => ({ at, tp: tpLeft(txt, subO, HXp(0.165), HYp(-0.838 - i * 0.05)) })),
    tp: c.top ? tpLeft(c.top, topO, HXp(0.16), HYp(-0.715)) : null,
  }));
  const CS = 0.03 * UI;
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UI, dy: dy * UI, size: CS, color: CREAM, intensity: 1.2, sub }); hud.scene.add(c); c.visible = false; return c; };
  const calls = [
    { c: mkCall('OUTER SHELL', 'THIN · TILED · WITH WHITE MARBLE RIBS', 0.26, 0.2), at: flo.anchors.outer, a: B.brunelleschi + 0.3, b: TC1 - 0.32 },
    { c: mkCall('INNER SHELL', 'THICK · THE STRUCTURE', -0.3, -0.14), at: flo.anchors.inner, a: B.brunelleschi + 0.42, b: TC1 - 0.32 },
    { c: mkCall('HERRINGBONE BRICKWORK', 'SPINA PESCE · NO CENTERING', -0.28, 0.18), at: null, a: B.brunelleschi + 0.55, b: TC1 - 0.3 },
  ];
  const tmp3 = V();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv2 = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv2 * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv2)) * HH, 0);
    return out;
  };

  // ------------------------------------------------------------------------------------------ paths
  const pathD = makePath([
    [TC1, V(sp.x, PAGE_Y + DPAGE, sp.z + 0.0001), V(sp.x, PAGE_Y, sp.z)],
    [TC1 + 0.38, V(-0.06, 0.42, 0.3), V(0.0, 0.012, -0.01)],
    [B.aerialScrew + 0.05, V(0.05, 0.3, 0.39), V(0.11, 0.06, -0.01)],
    [B.aerialScrew + 0.52, V(0.15, 0.27, 0.41), V(0.12, 0.11, 0)],
    [B.ornithopter + 0.08, V(0.41, 0.27, 0.43), V(0.47, 0.05, 0.01)],
    [B.ornithopter + 0.52, V(0.52, 0.24, 0.42), V(0.48, 0.08, 0)],
    [B.armouredCar + 0.08, V(0.76, 0.26, 0.43), V(0.81, 0.05, 0)],
    [B.armouredCar + 0.42, V(0.86, 0.27, 0.39), V(0.82, 0.09, -0.02)],
    [TC2 + 0.02, V(0.9, 0.38, 0.3), V(0.92, 0.95, -0.4)],
  ]);
  const AX = ADAM.xc;
  const pathC = makePath([
    [TC2 - 0.4, V(-19.6, 2.6, 1.1), V(-8.5, 11.0, 0)],
    [TC2, V(-18.6, 4.0, 1.2), V(-6.5, 14.2, 0)],
    [TC2 + 0.4, V(-9.5, 8.3, 0.8), V(1.5, 18.2, 0)],
    [B.creationOfAdam, V(-0.6, 13.8, 0.3), V(AX - 0.4, 20.1, 0)],
    [B.creationOfAdam + 0.4, V(AX - 0.62, 16.8, 0.1), V(AX - 0.06, 20.7, 0)],
    [DUR + 0.1, V(AX - 0.08, 18.65, 0.02), V(AX + 0.03, 20.7, 0)],
  ]);
  const upC = (P, T, out) => { const d = _u.subVectors(T, P).normalize(); const k = smoothstep(0.95, 1.45, Math.asin(clamp(d.y, -1, 1))); return out.set(-k, 1 - k, 0).normalize(); };
  const _u = V(), _up = V(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const upD = (t, out) => { const k = ramp(t, TC1, TC1 + 0.3, ease.inOutSine); return out.set(0, k, -(1 - k)).normalize(); };

  // ------------------------------------------------------------------------------------------ update
  const dof = { focus: 10, range: 3, amount: 0 }, bloom = { strength: 0.6 };
  const api = { scene, camera, hud, dof, bloom, exposure: 1, harmony: 1, background: 0x120b07 };
  let phase = 'F';
  const LIM = {
    F: { yaw: 1.0, pitchDown: 0.35, pitchUp: 0.6, zoomIn: 0.4, zoomOut: 1.8 },
    D: { yaw: 1.1, pitchDown: 0.35, pitchUp: 0.7, zoomIn: 0.3, zoomOut: 2.0, fly: 1.2 },
    C: { yaw: 1.2, pitchDown: 0.4, pitchUp: 0.9, zoomIn: 0.4, zoomOut: 1.6 },
  };
  const subj = V(), subjW = V();
  const M = study.models;
  const MODEL_T = { screw: [B.aerialScrew - 0.12, B.aerialScrew + 0.18], orni: [B.ornithopter - 0.14, B.ornithopter + 0.16], car: [B.armouredCar - 0.14, B.armouredCar + 0.15] };
  const cSep = new THREE.Color(SEPIA), cGold = new THREE.Color(GOLD), cTmp = new THREE.Color();
  const q1 = new THREE.Quaternion(), qy = new THREE.Quaternion(), Y = V(0, 1, 0);

  api.update = (t, info) => {
    const T = info?.T ?? t + segment.start;
    phase = t < TC1 ? 'F' : t < TC2 ? 'D' : 'C';
    flo.root.visible = phase === 'F';
    study.root.visible = phase === 'D';
    chapel.root.visible = phase === 'C';
    ghost.visible = false;
    overlay.visible = false;
    let exposure = 1;

    if (phase === 'F') {
      // ---------------------------------------------------------------- Florence
      pathF(t, _P, _T); poseCam(camera, _P, _T);
      camera.near = 0.5; camera.far = 450;
      scene.fog.color.set('#c39466'); scene.fog.near = 70; scene.fog.far = 300;
      api.background = 0xc39466;
      sun.color.set('#ffcf94'); sun.intensity = 2.7;
      sun.position.copy(sunDir).multiplyScalar(45); sun.target.position.set(-2, 3, 0);
      const sc = sun.shadow.camera; sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 5; sc.far = 100; sc.updateProjectionMatrix();
      hemi.color.set('#e9cfa8'); hemi.groundColor.set('#5a3d28'); hemi.intensity = 0.55;
      fill.color.set('#9fb4d8'); fill.position.set(8, 6, -6); fill.target.position.set(0, 5, 0); fill.intensity = 0.35;
      scene.environmentIntensity = 0.25;
      // cutaway: the two webs lift outward and fade; bricks laid course by course
      const open = ramp(t, B.brunelleschi, B.brunelleschi + 0.45, ease.inOutCubic);
      const dir = V(Math.cos(CUT_DIR), 0, Math.sin(CUT_DIR));
      for (const m of flo.cutGroup) { m.position.copy(dir).multiplyScalar(open * 3.2).setY(open * 1.4); m.visible = open < 0.98; }
      for (const m of flo.cutMats) m.opacity = 1 - ramp(t, B.brunelleschi + 0.08, B.brunelleschi + 0.42);
      const C = flo.bricks.courses;
      const laid = flo.bricks.lay(lerp(C * 0.22, C * 0.97, ramp(t, B.brunelleschi + 0.05, TC1 - 0.1, ease.linear)));
      flo.bricks.mesh.visible = open > 0.02;
      // ink: the dome draws itself, then the frame turns to parchment
      const inkP = ramp(t, B.brunelleschi + 0.45, TC1 - 0.12, ease.inOutSine);
      inkF.progress = inkP; inkF.material.depthTest = false;
      const parch = ramp(t, TC1 - 0.3, TC1 - 0.04, ease.inOutSine);
      inkF.material.uniforms.uColor.value.copy(cGold).lerp(cSep, parch);
      inkF.intensity = lerp(1.6, 1.0, parch);
      inkF.opacity = Math.min(1, inkP * 4);
      overlay.visible = parch > 0.001;
      overlay.material.opacity = parch;
      exposure = 1 + 0.05 * parch;
      // callouts
      for (const q of calls) {
        const op = envelope(t, q.a, q.b, 0.08, 0.12), p = ramp(t, q.a, q.a + 0.3, ease.outCubic);
        const at = q.at ?? (laid ? subjW.setFromMatrixPosition(laid.m) : flo.anchors.inner);
        projHud(at, q.c.position); q.c.reveal(p, op); q.c.visible = op > 0.001 && tmp3.z < 0;
      }
      dof.focus = camera.position.distanceTo(flo.domeCentre); dof.range = 6; dof.amount = 0.12 * (1 - parch);
      bloom.strength = 0.55 + 0.15 * parch;
      api.harmony = 1;
    } else for (const q of calls) q.c.visible = false;

    if (phase === 'D') {
      // ---------------------------------------------------------------- the study
      pathD(t, _P, _T); upD(t, _up);
      poseCam(camera, _P.add(STUDY_O), _T.add(STUDY_O), _up);
      camera.near = 0.01; camera.far = 30;
      scene.fog.near = 1000; scene.fog.far = 2000;
      api.background = 0x0f0905;
      const dim = 1 - ramp(t, TC2 - 0.38, TC2 - 0.04, ease.inOutSine);
      sun.color.set('#ffdcae'); sun.intensity = 3.1 * dim;
      sun.position.set(-0.55, 0.85, 0.5).multiplyScalar(2.5).add(STUDY_O).add(V(0.4, 0, 0)); sun.target.position.copy(STUDY_O).add(V(0.4, 0, 0));
      const sc = sun.shadow.camera; sc.left = -1.0; sc.right = 1.0; sc.top = 0.7; sc.bottom = -0.7; sc.near = 0.5; sc.far = 5; sc.updateProjectionMatrix();
      hemi.color.set('#e8cfa8'); hemi.groundColor.set('#2a1a10'); hemi.intensity = 0.32 * dim;
      fill.color.set('#9fb4d8'); fill.position.copy(STUDY_O).add(V(1.5, 0.6, -0.4)); fill.target.position.copy(STUDY_O); fill.intensity = 0.25 * dim;
      scene.environmentIntensity = 0.3 * dim;
      // overlay out (the page under the parchment)
      const ov = 1 - ramp(t, TC1, TC1 + 0.17, ease.inOutSine);
      overlay.visible = ov > 0.001; overlay.material.opacity = ov;
      // the dome page and its notes
      study.domeStrokes.progress = 1; study.domeStrokes.opacity = 0.9;
      study.domeScript.progress = ramp(t, TC1 + 0.05, B.aerialScrew - 0.02, ease.linear); study.domeScript.opacity = 0.8;
      // each model: drawn, then lifted into 3D
      let focusKey = 'screw';
      for (const [k, [a, l]] of Object.entries(MODEL_T)) {
        const m = M[k];
        const draw = ramp(t, a, a + 0.36, ease.inOutSine);
        m.strokes.forEach((s) => { s.progress = s.userData.lead ? draw : ramp(t, a + 0.04, a + 0.4, ease.inOutSine); });
        m.hatch.progress = ramp(t, a + 0.14, a + 0.42, ease.linear);
        m.script.progress = ramp(t, a + 0.02, a + 0.5, ease.linear);
        m.script.opacity = 0.8;
        const L = ramp(t, l, l + 0.42, ease.inOutCubic);
        const flat = Math.max(0.002, L);
        m.lift.scale.set(m.scale, m.scale * flat, m.scale);
        m.lift.position.y = L * m.hover;
        const spin = Math.max(0, t - l) * 0.55 * L;
        qy.setFromAxisAngle(Y, m.yaw1 + spin);
        m.inner.quaternion.copy(study.q0).slerp(qy, L);
        const glow = envelope(t, l, l + 0.6, 0.15, 0.3);
        const inkOut = 1 - ramp(t, l + 0.22, l + 0.6);
        for (const s of m.strokes) { s.material.uniforms.uColor.value.copy(cSep).lerp(cGold, glow * 0.75); s.intensity = 1 + glow * 0.45; }
        m.strokes.forEach((s) => { s.opacity = s.userData.op * inkOut; });
        m.hatch.opacity = 0.5 * (1 - ramp(t, l - 0.02, l + 0.22));
        const solid = ramp(t, l + 0.06, l + 0.4, ease.inOutSine);
        for (const mt of m.mats) mt.opacity = solid;
        for (const s of m.solids) s.visible = solid > 0.01;
        // motion once built: the screw turns, the wings beat
        if (k === 'screw') m.model.screw.rotation.y = -Math.max(0, t - l - 0.2) * 2.2 * solid;
        if (k === 'orni') { const amp = 0.38 * solid; m.model.wings.forEach((w, i) => { w.rotation.x = (i ? -1 : 1) * (amp * Math.sin(Math.max(0, t - l) * 9.0) - 0.06 * solid); }); }
        if (t > a - 0.3) focusKey = k;
      }
      const fm = M[focusKey];
      fm.lift.getWorldPosition(subj);
      dof.focus = camera.position.distanceTo(subj); dof.range = 0.06 + dof.focus * 0.25; dof.amount = 0.5 * ramp(t, TC1 + 0.12, TC1 + 0.4) * dim;
      bloom.strength = 0.6;
      exposure = lerp(0.55, 1, dim);
      dustS.tick(t, info);
      // the ghost of the vault's linework, posed for the chapel camera, in front of the desk camera
      const gp = ramp(t, TC2 - 0.36, TC2, ease.linear);
      if (gp > 0) {
        pathC(t, _P, _T); upC(_P, _T, _up); poseCam(poser, _P.add(CHAPEL_O), _T.add(CHAPEL_O), _up);
        _m.copy(camera.matrixWorld).multiply(_m2.copy(poser.matrixWorld).invert()).multiply(_m2.makeTranslation(CHAPEL_O.x, CHAPEL_O.y, CHAPEL_O.z));
        ghost.matrix.copy(_m); ghost.matrixWorldNeedsUpdate = true;
        ghost.visible = true;
        goldG.progress = gp; goldG.opacity = 1;
      }
      api.harmony = 1;
    }

    if (phase === 'C') {
      // ---------------------------------------------------------------- the Sistine Chapel
      pathC(t, _P, _T); upC(_P, _T, _up);
      poseCam(camera, _P.add(CHAPEL_O), _T.add(CHAPEL_O), _up);
      camera.near = 0.05; camera.far = 120;
      scene.fog.near = 1000; scene.fog.far = 2000;
      api.background = 0x0d0906;
      const lit = ramp(t, TC2, TC2 + 0.4, ease.inOutSine);
      sun.color.set('#ffe1b4'); sun.intensity = 1.3 * lit;
      sun.position.copy(CHAPEL_O).add(V(8, 30, -22)); sun.target.position.copy(CHAPEL_O).add(V(2, 8, 0));
      const sc = sun.shadow.camera; sc.left = -25; sc.right = 25; sc.top = 25; sc.bottom = -25; sc.near = 1; sc.far = 80; sc.updateProjectionMatrix();
      hemi.color.set('#f6e5c6'); hemi.groundColor.set('#c9a272'); hemi.intensity = 1.25 * lit;
      fill.color.set('#ffd9a8'); fill.position.copy(CHAPEL_O).add(V(-8, 0, 5)); fill.target.position.copy(CHAPEL_O).add(V(3, 20, 0)); fill.intensity = 1.1 * lit;
      scene.environmentIntensity = 0.3 * lit;
      chapel.wallMat.emissiveIntensity = 1.6 * lit;
      for (const s of shafts) s.material.uniforms.uIntensity.value = 0.05 * lit * (1 - 0.6 * ramp(t, B.creationOfAdam, B.creationOfAdam + 0.5));
      // the gold construction lines finish, then give way to the paint
      goldC.progress = 1;
      goldC.opacity = 1 - ramp(t, TC2 + 0.2, TC2 + 0.6);
      // Michelangelo's order: entrance → altar
      chapel.front.value = lerp(-0.02, 1.05, ramp(t, TC2 - 0.05, B.creationOfAdam - 0.1, ease.linear));
      // the Creation of Adam: the hands drawn as stroke art over the cartoon, then the colour returns
      const c0 = B.creationOfAdam - 0.08;
      const [sA, sB, sC, sH, sG] = chapel.strokes;
      sA.progress = ramp(t, c0, c0 + 0.45, ease.inOutSine);
      sB.progress = ramp(t, c0 + 0.05, c0 + 0.55, ease.inOutSine);
      sC.progress = ramp(t, c0 + 0.15, c0 + 0.6, ease.inOutSine);
      sH.progress = ramp(t, c0 + 0.25, c0 + 0.7, ease.linear);
      sG.progress = ramp(t, c0 + 0.1, c0 + 0.5, ease.inOutSine);
      const col = ramp(t, c0 + 0.5, c0 + 0.95, ease.inOutSine);
      chapel.colourMat.opacity = col; chapel.colourPatch.visible = col > 0.003;
      const inkK = 1 - 0.15 * col;
      sA.opacity = 0.5 * inkK; sB.opacity = 1.0 * inkK; sC.opacity = 0.4 * inkK; sH.opacity = 0.7 * (1 - 0.3 * col); sG.opacity = 0.6 * inkK;
      const g = ramp(t, c0 + 0.45, c0 + 0.95, ease.inOutSine);
      gapGlow.visible = g > 0.002;
      gapGlow.material.color.set('#ffd9a0').multiplyScalar(1.6 * g * (0.85 + 0.15 * pulse(T, { decay: 4 })));
      gapGlow.scale.setScalar(0.1 + 0.16 * g);
      dustC.tick(t, info);
      const fp = t < B.creationOfAdam ? V(_T.x, _T.y, _T.z) : gapGlow.getWorldPosition(subjW);
      dof.focus = camera.position.distanceTo(fp); dof.range = 2 + dof.focus * 0.2; dof.amount = 0.18;
      bloom.strength = 0.55 + 0.35 * g;
      exposure = lerp(0.45, 1, lit) * (1 + 0.08 * g);
      api.harmony = 0.3;
    }

    // overlay sized to cover the frame (any delivery aspect) just past the near plane
    if (overlay.visible) {
      const d = camera.near * 1.5, h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 2.2;
      overlay.position.set(0, 0, -d); overlay.scale.set(h * FILM_ASPECT, h, 1);
    }
    camera.updateProjectionMatrix();
    api.exposure = exposure;

    // captions
    for (const c of CAPS) {
      const e = envelope(t, c.a - 0.01, c.b, 0.08, 0.12, ease.linear), p = ramp(t, c.a, c.a + 0.25, ease.outCubic);
      c.m.opacity = e; c.m.reveal = p;
      c.s.forEach(({ at, tp }) => { tp.opacity = e * 0.9 * ramp(t, at - 0.02, at + 0.06, ease.linear); tp.reveal = ramp(t, at, at + 0.3, ease.outCubic); });
      if (c.tp) { c.tp.opacity = e; c.tp.reveal = ramp(t, c.a, c.a + 0.15); }
    }
  };

  Object.defineProperty(api, 'exploreLimits', { get: () => LIM[phase] });
  // Explore: no lens overlay or ghost; the dome's ink respects depth off-axis; the desk keeps its light
  api.explore = (t) => {
    overlay.visible = false; ghost.visible = false; for (const q of calls) q.c.visible = false;
    inkF.material.depthTest = true;
    if (phase === 'D') { sun.intensity = 3.1; hemi.intensity = 0.32; fill.intensity = 0.25; scene.environmentIntensity = 0.3; api.exposure = 1; }
  };
  api.exploreEnd = () => { inkF.material.depthTest = false; };
  api.arSubject = (t) => {
    const ph = t < TC1 ? 'F' : t < TC2 ? 'D' : 'C';
    if (ph === 'F') return { centre: flo.domeCentre, radius: 5.2 };
    if (ph === 'D') {
      let k = 'screw';
      for (const [kk, [a]] of Object.entries(MODEL_T)) if (t > a - 0.3) k = kk;
      if (t < B.aerialScrew - 0.2) return { centre: V(0, 0.02, 0).add(STUDY_O), radius: 0.32 };
      return { centre: M[k].lift.getWorldPosition(V()), radius: 0.2 };
    }
    return { centre: V(0, 10, 0).add(CHAPEL_O), radius: 21 };
  };
  return api;
}
