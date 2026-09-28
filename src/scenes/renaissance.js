// ART & THE RENAISSANCE (15.5 – 20.5 s)
// Technique: procedural drawing from a sculpted signed-distance-field body (see
// renaissance-body.js: ~300 anatomical primitives blended with smooth-min). Its
// orthographic silhouette field → marching-squares contours in several wobbly passes,
// its crease (cavity) field → interior anatomy lines, its front-surface normals →
// Leonardo-style left-handed hatching; ~10k strokes revealed in a staged order. Then a
// 2D→3D transformation: the strokes lift off the canvas and the very same field, meshed
// with surface nets, inflates into a marble statue (camera orbit with DOF through Alberti
// perspective grids and a proportion HUD) and a pigment particle explosion into the 'flash'.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, clamp } from '../lib/math.js';
import { progressLine, segmentsLine, circlePoints } from '../lib/lines.js';
import { MorphParticles, Dust, sampleGeometry } from '../lib/particles.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { fresnel, lightShaft, glowSprite } from '../lib/materials.js';
import { Callout, Dimension, faceCamera } from '../lib/hud.js';
import { noise2, noise3 } from '../lib/noise.js';
import { buildBody, meshBody, projectGroups } from './renaissance-body.js';
import { drawVitruvian } from './renaissance-drawing.js';
import { pulse } from '../lib/rhythm.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const PHI = (1 + Math.sqrt(5)) / 2;
const SEPIA = '#5a2e16';
const CHALK = '#8a3f1f';
const EMBER = '#ff8a3a';
const GOLD = '#f2c46e';
const HUD = '#f3d08a';

function weaveTexture() {
  const S = 512, c = mkCanvas(S, S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const wv = 0.5 + 0.5 * Math.sin(x * 1.6) * Math.sin(y * 1.6 + (Math.floor(x / 4) % 2) * 1.6);
    const n = noise2(x * 0.02, y * 0.02) * 0.018 + noise2(x * 0.3, y * 0.05) * 0.02;
    const l = 0.92 + wv * 0.05 + n;
    d[i] = 236 * l; d[i + 1] = 228 * l; d[i + 2] = 212 * l; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = toTexture(c, { repeat: true });
  t.repeat.set(3, 3.7);
  return t;
}

// Golden-rectangle subdivision + quarter-arc spiral (exactly aligned), portrait rect.
function goldenConstruction(x0, y0, w, h, steps = 9) {
  const dividers = [], spiral = [];
  let X0 = x0, X1 = x0 + w, Y0 = y0, Y1 = y0 + h;
  for (let k = 0; k < steps; k++) {
    const d = k % 4;
    let cx, cy, s, a0, a1;
    if (d === 0) { s = X1 - X0; cx = X0; cy = Y1 - s; a0 = Math.PI / 2; a1 = 0; dividers.push([V(X0, Y1 - s), V(X1, Y1 - s)]); Y1 -= s; }
    else if (d === 1) { s = Y1 - Y0; cx = X1 - s; cy = Y1; a0 = 0; a1 = -Math.PI / 2; dividers.push([V(X1 - s, Y0), V(X1 - s, Y1)]); X1 -= s; }
    else if (d === 2) { s = X1 - X0; cx = X1; cy = Y0 + s; a0 = -Math.PI / 2; a1 = -Math.PI; dividers.push([V(X0, Y0 + s), V(X1, Y0 + s)]); Y0 += s; }
    else { s = Y1 - Y0; cx = X0 + s; cy = Y0; a0 = Math.PI; a1 = Math.PI / 2; dividers.push([V(X0 + s, Y0), V(X0 + s, Y1)]); X0 += s; }
    const n = Math.max(6, Math.round(40 * Math.sqrt(s)));
    for (let i = (k === 0 ? 0 : 1); i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); spiral.push(V(cx + Math.cos(a) * s, cy + Math.sin(a) * s)); }
  }
  return { dividers, spiral };
}

function sharpen(obj) { obj.traverse((o) => { if (o.material) o.material.depthWrite = true; }); return obj; }

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.12;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 200);
  const R = rng(1504);

  const cC = cue('canvas'), cG = cue('goldenRatio'), s0 = cue('sketchStart'), s1 = cue('sketchDone'), m3 = cue('model3D'), pB = cue('paintBurst');

  // ---------------------------------------------------------------- canvas on its stretcher
  const CW = 2.6, CH = 3.2, CD = 0.06;
  const canvasRig = new THREE.Group();
  scene.add(canvasRig);
  const canvasMat = new THREE.MeshStandardMaterial({ map: weaveTexture(), color: '#f2ebdd', roughness: 0.92, metalness: 0 });
  const canvasBox = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), canvasMat);
  canvasRig.add(canvasBox);
  const wood = new THREE.MeshStandardMaterial({ color: '#5b3b20', roughness: 0.68, metalness: 0 });
  const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), wood); m.position.set(x, y, -CD / 2 - 0.05); canvasRig.add(m); };
  bar(CW - 0.02, 0.12, 0, CH / 2 - 0.07); bar(CW - 0.02, 0.12, 0, -CH / 2 + 0.07); bar(0.12, CH - 0.02, CW / 2 - 0.07, 0); bar(0.12, CH - 0.02, -CW / 2 + 0.07, 0);
  bar(CW - 0.2, 0.08, 0, 0); bar(0.08, CH - 0.2, 0, 0);
  const SURF = CD / 2 + 0.003;

  // ---------------------------------------------------------------- golden-ratio geometry on the canvas
  const gH = 3.0, gW = gH / PHI;
  const gc = goldenConstruction(-gW / 2, -gH / 2, gW, gH, 9);
  const goldGroup = new THREE.Group();
  goldGroup.position.z = SURF + 0.002;
  canvasRig.add(goldGroup);
  const gOpts = { color: GOLD, headColor: '#fff3d6', intensity: 0.85, head: 0.04 };
  const gRect = progressLine([V(-gW / 2, -gH / 2), V(gW / 2, -gH / 2), V(gW / 2, gH / 2), V(-gW / 2, gH / 2)], { ...gOpts, closed: true });
  const gDiv = segmentsLine(gc.dividers, { ...gOpts, orderFn: (a, b, i) => (i / gc.dividers.length) * 0.7, stagger: 0.7 });
  const gSpiral = progressLine(gc.spiral, { ...gOpts, intensity: 1.2 });
  const gDiag = segmentsLine([[V(-gW / 2, gH / 2), V(gW / 2, -gH / 2)], [V(gW / 2, gH / 2 - gW), V(-gW / 2, gH / 2)]], { ...gOpts, intensity: 0.7, orderFn: (a, b, i) => i * 0.2, stagger: 0.6 });
  goldGroup.add(gRect, gDiv, gSpiral, gDiag);

  // ---------------------------------------------------------------- the sketch (procedural strokes)
  // One sculpted SDF body drives everything: the drawing (orthographic fields) and the statue (mesh).
  const bodyA = buildBody();
  const MB = meshBody(bodyA);
  const GD = MB.grid;
  // the second pose (arms raised to the crown, legs opened 1/14 of the height): limbs only
  const bodyB = buildBody({ arm: 0.45, leg: 0.52, clipFloor: false });
  const PB = projectGroups(bodyB, (n) => /^(arm|hand|finger|thumb|leg|foot)/.test(n), { x0: -1.1, y0: -1.3, x1: 1.1, y1: 0.95, h: 0.008 });
  const DR = drawVitruvian({ grid: GD, poseB: PB, noise2, rng });
  const toV = (list) => list.map((q) => [V(q[0], q[1]), V(q[2], q[3])]);
  const segA = toV(DR.segA), segB = toV(DR.segB), segC = toV(DR.segC), segI = toV(DR.segI), segP = toV(DR.segP), hatch = toV(DR.hatch);
  const BX0 = -1.1, BX1 = 1.1, BY0 = -1.3, BY1 = 0.9;
  const navelY = 0;
  const radialOrder = (a, b) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; return Math.min(1, Math.hypot(mx, (my - navelY) * 0.9) / 1.15); };
  const topDown = (a, b) => 1 - ((a.y + b.y) / 2 - BY0) / (BY1 - BY0);
  const sketch = new THREE.Group();     // lives in world space so it can lift off the (receding) canvas
  scene.add(sketch);
  const inkOpts = (color, opacity, extra = {}) => ({ color, headColor: EMBER, intensity: 1, opacity, head: 0.012, additive: false, ...extra });
  // construction pass (radial from the navel), firm pass (top → bottom), loose outer pass,
  // interior anatomy (crease field), the faint second pose, then form-following hatching
  const strokesA = segmentsLine(segA, inkOpts(CHALK, 0.42, { orderFn: (a, b) => radialOrder(a, b) * 0.8 + R() * 0.05, stagger: 0.86 }));
  const strokesB = segmentsLine(segB, inkOpts(SEPIA, 0.9, { orderFn: (a, b) => topDown(a, b) * 0.72 + Math.abs(a.x) * 0.08 + R() * 0.04, stagger: 0.86 }));
  const strokesC = segmentsLine(segC, inkOpts(CHALK, 0.32, { orderFn: (a, b) => radialOrder(a, b) * 0.7 + R() * 0.1, stagger: 0.8 }));
  const strokesI = segmentsLine(segI, inkOpts(SEPIA, 0.75, { orderFn: (a, b) => topDown(a, b) * 0.7 + R() * 0.15, stagger: 0.85 }));
  const strokesP = segmentsLine(segP, inkOpts(CHALK, 0.4, { orderFn: (a, b) => radialOrder(a, b) * 0.75 + R() * 0.05, stagger: 0.85 }));
  const strokesH = segmentsLine(hatch, inkOpts(SEPIA, 0.7, { orderFn: (a, b) => (1 - ((a.y + b.y) / 2 - BY0) / (BY1 - BY0)) * 0.55 + R() * 0.3, stagger: 0.9, head: 0.02 }));
  // proportion ticks across the figure (head, chin, chest, navel, groin, knees)
  const ticks = [];
  for (const y of [0.8, 0.55, 0.3, 0.0, -0.2, -0.7, -1.2]) ticks.push([V(-0.22, y), V(0.22, y)]);
  for (const x of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) ticks.push([V(x, 0.4), V(x, 0.5)]);
  const nTicks = ticks.length;
  const strokesT = segmentsLine(ticks, inkOpts(SEPIA, 0.55, { orderFn: (a, b, i) => (i < nTicks ? i / nTicks * 0.3 : 0.25 + R() * 0.4), stagger: 0.7 }));
  // compass circle + square (two passes each)
  const circleR = 1.2, sqHalf = 1.0, sqCy = -0.2;
  const sqPts = (o) => [V(-sqHalf - o, sqCy - sqHalf), V(sqHalf, sqCy - sqHalf - o), V(sqHalf + o, sqCy + sqHalf), V(-sqHalf, sqCy + sqHalf + o), V(-sqHalf - o, sqCy - sqHalf)];
  const sq1 = progressLine(sqPts(0), inkOpts(SEPIA, 0.85, { head: 0.02 }));
  const sq2 = progressLine(sqPts(0.004), inkOpts(CHALK, 0.4, { head: 0.02 }));
  const ci1 = progressLine(circlePoints(circleR, 240, { start: -Math.PI / 2, end: Math.PI * 1.5, center: V(0, navelY) }), inkOpts(SEPIA, 0.85, { head: 0.02 }));
  const ci2 = progressLine(circlePoints(circleR + 0.005, 240, { start: -Math.PI / 2 + 0.3, end: Math.PI * 1.5 + 0.3, center: V(0, navelY) }), inkOpts(CHALK, 0.4, { head: 0.02 }));
  sketch.add(strokesA, strokesB, strokesC, strokesI, strokesP, strokesH, strokesT, sq1, sq2, ci1, ci2);
  // mirror-script handwriting
  const hand = [];
  const handLine = (txt, y, h = 0.075) => {
    const tp = new TextPlane(txt, { font: FONTS.serif, italic: true, weight: 500, height: h, color: '#4a2812', intensity: 1, blending: THREE.NormalBlending });
    tp.position.set(0, y, 0.001); tp.scale.x = -1;
    sketch.add(tp); hand.push(tp);
  };
  handLine('Vitruvio architecto mette nella sua opera d’architectura', 1.42);
  handLine('che le misure dell’omo sono dalla natura distribuite', 1.3);
  handLine('tanto apre l’omo nelle braccia quanto è la sua altezza', -1.4);
  hand.forEach((h) => { h.material.uniforms.uColor.value.set('#4a2812'); });
  const strokeCount = segA.length + segB.length + segC.length + segI.length + segP.length + hatch.length + ticks.length;

  // ---------------------------------------------------------------- 3D figure (same primitives)
  const figGroup = new THREE.Group();
  scene.add(figGroup);
  const figGeo = (() => {
    const g = new THREE.BufferGeometry();
    const P = MB.positions, nv = P.length / 3, col = new Float32Array(nv * 3);
    // Carrara marble baked per vertex: warm white body, faint grey veins, SDF ambient occlusion in the creases
    for (let i = 0; i < nv; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const turb = noise3(x * 3.1, y * 3.1, z * 3.1) * 0.6 + noise3(x * 7.3 + 4, y * 7.3, z * 7.3) * 0.25;
      const band = Math.abs(Math.sin((x * 1.7 + y * 1.1 - z * 0.8 + turb * 1.4) * Math.PI * 2));
      const vein = Math.pow(1 - band, 22) * 0.35 + Math.pow(1 - band, 5) * 0.05;
      const cloud = noise3(x * 4 + 9, y * 4, z * 4) * 0.03;
      const ao = MB.ao[i], occ = 0.28 + 0.72 * Math.pow(ao, 1.3);
      const k = (1 - vein + cloud) * occ;
      col[i * 3] = 0.8 * k + 0.03 * (1 - ao); col[i * 3 + 1] = 0.76 * k; col[i * 3 + 2] = 0.7 * k * (0.95 + 0.05 * ao);
    }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(MB.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(MB.index, 1));
    g.computeBoundingSphere();
    return g;
  })();
  const figMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.4, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffc996'), transparent: true, opacity: 0 });
  const figMesh = new THREE.Mesh(figGeo, figMat);
  const figRim = new THREE.Mesh(figGeo, fresnel({ color: '#ffc877', intensity: 0.8, power: 3.4, opacity: 0 }));
  figGroup.add(figMesh, figRim);
  // gold circle & square that lift off with the figure (3D proportion rig)
  const goldRig = new THREE.Group();
  figGroup.add(goldRig);
  const gRing = progressLine(circlePoints(circleR, 240, { start: -Math.PI / 2, end: Math.PI * 1.5, center: V(0, navelY) }), { color: GOLD, headColor: '#fff4dc', intensity: 1.8, head: 0.03 });
  const gSquare = progressLine(sqPts(0), { color: GOLD, headColor: '#fff4dc', intensity: 1.6, head: 0.03 });
  goldRig.add(gRing, gSquare);
  sharpen(goldRig);

  // proportion HUD (in the figure's space)
  const hudGroup = new THREE.Group();
  figGroup.add(hudGroup);
  const dimH = new Dimension(V(-1.32, -1.2, 0), V(-1.32, 0.8, 0), '1.000', { color: HUD, size: 0.07, tick: 0.06, intensity: 1.5 });
  const dimW = new Dimension(V(-1.0, 1.02, 0), V(1.0, 1.02, 0), '1.000', { color: HUD, size: 0.07, tick: 0.06, intensity: 1.5 });
  const dimN = new Dimension(V(1.32, -1.2, 0), V(1.32, 0.0, 0), '0.618', { color: HUD, size: 0.07, tick: 0.06, intensity: 1.5 });
  const dimN2 = new Dimension(V(1.32, 0.0, 0), V(1.32, 0.8, 0), '0.382', { color: HUD, size: 0.07, tick: 0.06, intensity: 1.5 });
  const callRatio = new Callout('1 : 1.618', { dx: 0.75, dy: -0.35, size: 0.1, color: HUD, sub: 'UMBILICUS · SECTIO AUREA', intensity: 1.6 });
  callRatio.position.set(0.02, 0.0, 0.1);
  const callProp = new Callout('PROPORTIO', { dx: 0.85, dy: 0.22, size: 0.11, color: HUD, sub: 'HOMO AD CIRCULUM ET QUADRATUM', intensity: 1.6 });
  callProp.position.set(0.09, 0.72, 0.1);
  hudGroup.add(dimH, dimW, dimN, dimN2, callRatio, callProp);
  sharpen(hudGroup);

  // Alberti's visual pyramid + perspective floor grid
  const perspective = new THREE.Group();
  scene.add(perspective);
  const FLOOR = -1.26;
  const floorSegs = [];
  for (let x = -8; x <= 8.001; x += 0.5) floorSegs.push([V(x, FLOOR, -9), V(x, FLOOR, 7)]);
  for (let z = -9; z <= 7.001; z += 0.5) floorSegs.push([V(-8, FLOOR, z), V(8, FLOOR, z)]);
  // split into short pieces so the grid can grow radially from the figure
  const floorPieces = [];
  for (const [a, b] of floorSegs) {
    const n = Math.round(a.distanceTo(b) / 0.5);
    for (let i = 0; i < n; i++) floorPieces.push([a.clone().lerp(b, i / n), a.clone().lerp(b, (i + 1) / n)]);
  }
  const floorGrid = segmentsLine(floorPieces, { color: '#c89a55', headColor: '#ffe3b0', intensity: 0.5, head: 0.03, orderFn: (a, b) => Math.min(1, Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2 - 1) / 9) * 0.8, stagger: 0.8 });
  perspective.add(floorGrid);
  const eye = V(0, 0.15, 6.2);
  const pyr = [];
  for (const c of [V(-1, -1.2, 1), V(1, -1.2, 1), V(1, 0.8, 1), V(-1, 0.8, 1), V(0, 0, 1)]) pyr.push([eye.clone(), c]);
  for (let i = -6; i <= 6; i++) pyr.push([V(i * 0.9, FLOOR, 5), V(0, FLOOR, -9)]);    // orthogonals to the vanishing point
  const pyramid = segmentsLine(pyr, { color: HUD, headColor: '#fff4dc', intensity: 0.9, head: 0.04, orderFn: (a, b, i) => (i / pyr.length) * 0.5, stagger: 0.6 });
  perspective.add(pyramid);
  const vpDot = glowSprite({ color: '#ffd7a0', intensity: 3, scale: 0.25 });
  vpDot.position.set(0, FLOOR, -9);
  perspective.add(vpDot);
  const eyeDot = glowSprite({ color: '#ffd7a0', intensity: 3, scale: 0.18 });
  eyeDot.position.copy(eye);
  perspective.add(eyeDot);
  const perspLabel = new TextPlane('PERSPECTIVA ARTIFICIALIS', { font: FONTS.mono, weight: 400, height: 0.085, letterSpacing: 0.3, color: HUD, intensity: 1.3 });
  perspLabel.position.set(2.6, FLOOR + 0.02, 2.2); perspLabel.rotation.x = -Math.PI / 2;
  perspective.add(perspLabel);
  sharpen(perspective);

  // Golden-section callouts beside the canvas
  const callPhi = new Callout('φ = 1.6180339…', { dx: 0.7, dy: 0.35, size: 0.1, color: HUD, sub: 'SECTIO AUREA', intensity: 1.5 });
  callPhi.position.set(gW / 2, gH / 2 - gW, SURF + 0.01);
  canvasRig.add(callPhi);

  // ---------------------------------------------------------------- paint particles
  const NPAINT = 36000;
  const paintSrc = sampleGeometry(figGeo, NPAINT, { seed: 5 });
  const paintTgt = new Float32Array(NPAINT * 3);
  const pigments = ['#c8872e', '#e34234', '#2a5caa', '#3fa796', '#e0b050', '#1f4f9a', '#9b2d20'].map((c) => new THREE.Color(c));
  const paintCol = new Float32Array(NPAINT * 3);
  for (let i = 0; i < NPAINT; i++) {
    // swirl-ring target (a vortex that frames the camera) with depth
    const a = R() * Math.PI * 2, rr = 2.2 + Math.pow(R(), 0.6) * 4.5;
    paintTgt[i * 3] = Math.cos(a) * rr; paintTgt[i * 3 + 1] = Math.sin(a) * rr * 0.75; paintTgt[i * 3 + 2] = (R() - 0.5) * 5 + 1.5;
    const band = Math.floor(((paintSrc[i * 3 + 1] + 1.3) / 2.3) * 5 + R() * 2.2) % pigments.length;
    const c = pigments[band];
    const k = 0.8 + R() * 0.4;
    paintCol[i * 3] = c.r * k; paintCol[i * 3 + 1] = c.g * k; paintCol[i * 3 + 2] = c.b * k;
  }
  const paint = new MorphParticles({ count: NPAINT, positions: paintSrc, targets: paintTgt, colors: paintCol, size: 0.03, intensity: 1.3, stagger: 0.35, seed: 44, additive: false });
  paint.u.noiseFreq = 0.9; paint.u.noiseSpeed = 0.3;
  paint.u.scatterCenter = V(0, -0.1, 0);
  figGroup.add(paint);

  // ---------------------------------------------------------------- lights & atmosphere
  const spot = new THREE.SpotLight('#ffe3bf', 0, 0, 0.27, 1.0, 0);
  spot.position.set(-3.2, 3.6, 5.5);
  scene.add(spot, spot.target);
  const rim = new THREE.DirectionalLight('#ffcf94', 0); rim.position.set(3, 3, -4);
  const kick = new THREE.DirectionalLight('#9fb8ff', 0); kick.position.set(-4, 1, -3);
  const fill = new THREE.AmbientLight('#2b1d12', 0.2);
  const key = new THREE.DirectionalLight('#ffe6c4', 0); key.position.set(-4.5, 3.2, 2.6); key.target.position.set(0, -0.2, 1);
  scene.add(rim, kick, fill, key, key.target);
  const beam = lightShaft({ length: 9, radiusTop: 0.2, radiusBottom: 2.6, color: '#ffe0b0', intensity: 0.1 });
  beam.position.copy(spot.position);
  beam.lookAt(0, 0, 0); beam.rotateX(-Math.PI / 2);
  scene.add(beam);
  const dust = new Dust({ count: 1600, size: [9, 6, 8], center: [0, 0, 2], color: '#ffe2b8', particleSize: 0.02, opacity: 0.45, intensity: 1.3, seed: 77 });
  scene.add(dust);

  // ---------------------------------------------------------------- update
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), C3 = V(0, -0.2, 1.0);
  const RAD3 = OUTPUT_ASPECT > 1.5 ? 4.8 : 4.15;         // orbit radius: the 1:1 frame can sit closer
  const dof = { focus: 6, range: 1.6, amount: 0 };
  const bloom = { strength: 0.75 };
  const seqProg = (t, a, b) => sat((t - a) / (b - a));
  const cSepia = new THREE.Color(SEPIA), cGold = new THREE.Color(GOLD);

  return {
    scene, camera, dof, bloom, exposure: 1,
    strokeCount,
    update(t, info) {
      const T = info.T;
      // ------------------------------------------------ camera
      const lift = ramp(t, m3, m3 + 0.6, ease.inOutCubic);
      const orb = ramp(t, m3 + 0.05, pB + 0.1, ease.inOutSine);
      const push = ramp(t, pB - 0.1, 5.0, ease.inQuad);
      const approach = ramp(t, 0, m3, ease.outCubic);
      // 2D phase: slow push toward the canvas; 3D phase: orbit the lifted figure
      const d2 = lerp(8.4, 5.5, approach);
      const ang = lerp(0.07, -1.05, orb);
      const rad = lerp(d2, RAD3, lift) - push * 1.8;
      const cy = lerp(lerp(0.25, 0.02, approach), 0.85, orb);
      const target = look.set(0, lerp(0.0, -0.1, lift), lerp(0, C3.z, lift));
      camPos.set(target.x + Math.sin(ang) * rad, cy, target.z + Math.cos(ang) * rad);
      camera.position.copy(camPos);
      camera.lookAt(target);

      // ------------------------------------------------ canvas: floats in, chiaroscuro light
      const arrive = ramp(t, -0.3, cC + 0.2, ease.outCubic);
      const recede = ramp(t, m3, m3 + 0.9, ease.inOutCubic);
      canvasRig.position.set(-recede * 0.6, lerp(-0.25, 0, arrive) + Math.sin(t * 0.9) * 0.02, lerp(-1.2, 0, arrive) - recede * 3.4);
      canvasRig.rotation.set(lerp(0.08, 0, arrive) + Math.sin(t * 0.7) * 0.01, lerp(-0.42, 0.04, arrive) + recede * 0.25, lerp(0.03, 0, arrive));
      spot.intensity = lerp(1.2, 4.6, ramp(t, 0.05, cC + 0.1, ease.outCubic)) * (1 - 0.7 * recede) * (1 - 0.55 * ramp(t, m3, m3 + 0.4));
      spot.target.position.set(lerp(-0.45, 0, lift), lerp(0.5, -0.2, lift), lerp(0, C3.z, lift));
      key.intensity = 2.3 * lift;
      canvasMat.color.setRGB(0.95, 0.92, 0.87).multiplyScalar(1 - 0.72 * recede);
      rim.intensity = 2.2 * lift;
      kick.intensity = 0.7 * lift;
      beam.material.uniforms.uIntensity.value = 0.08 + 0.05 * ramp(t, 0.1, cC);
      beam.material.uniforms.uTime.value = t;

      // ------------------------------------------------ golden ratio (16.3)
      const gFade = 1 - 0.82 * ramp(t, s0 + 0.2, s0 + 0.8) - 0.18 * ramp(t, m3 - 0.2, m3 + 0.2);
      gRect.progress = ramp(t, cG, cG + 0.4, ease.inOutCubic);
      gDiv.progress = ramp(t, cG + 0.2, cG + 0.75, ease.inOutSine);
      gSpiral.progress = ramp(t, cG + 0.3, cG + 1.1, ease.inOutSine);
      gDiag.progress = ramp(t, cG + 0.35, cG + 0.8, ease.outCubic);
      for (const o of [gRect, gDiv, gSpiral, gDiag]) o.opacity = gFade;
      callPhi.reveal(ramp(t, cG + 0.5, cG + 0.95, ease.outCubic), 1 - ramp(t, s0 + 0.4, s0 + 0.8));

      // ------------------------------------------------ the sketch (16.9 → 18.3), then lift-off
      const span = s1 - s0;
      sq1.progress = ramp(t, s0, s0 + 0.35 * span, ease.inOutSine);
      sq2.progress = ramp(t, s0 + 0.05 * span, s0 + 0.42 * span, ease.inOutSine);
      ci1.progress = ramp(t, s0 + 0.08 * span, s0 + 0.5 * span, ease.inOutSine);
      ci2.progress = ramp(t, s0 + 0.14 * span, s0 + 0.56 * span, ease.inOutSine);
      strokesA.progress = seqProg(t, s0 + 0.02 * span, s0 + 0.5 * span);
      strokesC.progress = seqProg(t, s0 + 0.12 * span, s0 + 0.6 * span);
      strokesB.progress = seqProg(t, s0 + 0.25 * span, s0 + 0.82 * span);
      strokesP.progress = seqProg(t, s0 + 0.45 * span, s0 + 0.92 * span);
      strokesI.progress = seqProg(t, s0 + 0.3 * span, s0 + 0.9 * span);
      strokesH.progress = seqProg(t, s0 + 0.35 * span, s0 + span);
      strokesT.progress = seqProg(t, s0 + 0.7 * span, s0 + span);
      const inkOut = 1 - ramp(t, m3 + 0.25, m3 + 0.75);
      sq1.opacity = 0.85 * inkOut * (1 - lift); sq2.opacity = 0.4 * inkOut * (1 - lift);
      ci1.opacity = 0.85 * inkOut * (1 - lift); ci2.opacity = 0.4 * inkOut * (1 - lift);
      strokesA.opacity = 0.42 * inkOut; strokesB.opacity = 0.9 * inkOut; strokesC.opacity = 0.32 * inkOut;
      strokesP.opacity = 0.4 * inkOut; strokesH.opacity = 0.7 * inkOut; strokesT.opacity = 0.55 * inkOut; strokesI.opacity = 0.75 * inkOut;
      // strokes lift off the canvas plane and glow as they go
      const lineLift = ramp(t, m3 - 0.05, m3 + 0.7, ease.inOutCubic);
      sketch.position.set(lerp(canvasRig.position.x, 0, lineLift), lerp(canvasRig.position.y, 0, lineLift), lerp(canvasRig.position.z + SURF + 0.004, C3.z + 0.02, lineLift));
      sketch.rotation.set(canvasRig.rotation.x * (1 - lineLift), canvasRig.rotation.y * (1 - lineLift), canvasRig.rotation.z * (1 - lineLift));
      const glowIn = envelope(t, m3 - 0.1, m3 + 0.8, 0.2, 0.4);
      for (const s of [strokesA, strokesB, strokesC, strokesI, strokesP, strokesH, strokesT]) {
        s.material.uniforms.uColor.value.copy(cSepia).lerp(cGold, glowIn);
        s.intensity = 1 + glowIn * 0.9;
      }
      for (let i = 0; i < hand.length; i++) {
        hand[i].reveal = ramp(t, s0 + (0.55 + i * 0.12) * span, s0 + (0.85 + i * 0.12) * span, ease.inOutSine);
        hand[i].opacity = 0.75 * inkOut * (1 - lift);
      }

      // ------------------------------------------------ 3D figure (18.4)
      figGroup.position.set(sketch.position.x, sketch.position.y, lerp(canvasRig.position.z + SURF + 0.004, C3.z, lineLift));
      figGroup.rotation.copy(sketch.rotation);
      const inflate = ramp(t, m3, m3 + 0.7, ease.outCubic);
      const burst = ramp(t, pB - 0.07, pB + 0.02, ease.inQuad);
      figGroup.scale.set(1, 1, lerp(0.03, 1, inflate));
      figMat.opacity = sat(inflate * 1.4) * (1 - burst);
      figMesh.visible = figMat.opacity > 0.002;
      figRim.material.uniforms.uOpacity.value = inflate * (1 - burst) * (0.7 + 0.3 * pulse(T, { decay: 4 }));
      figRim.visible = figMesh.visible;
      const ringOn = ramp(t, m3 + 0.1, m3 + 0.7, ease.inOutSine);
      gRing.progress = ringOn; gSquare.progress = ringOn;
      gRing.opacity = gSquare.opacity = (1 - ramp(t, pB, pB + 0.3)) * 0.95;
      goldRig.scale.setScalar(1 + ramp(t, pB, 5.0, ease.outCubic) * 1.5);
      // HUD / proportion diagrams
      const h0 = m3 + 0.35;
      dimH.reveal(ramp(t, h0, h0 + 0.5, ease.outCubic), 1 - burst);
      dimW.reveal(ramp(t, h0 + 0.1, h0 + 0.6, ease.outCubic), 1 - burst);
      dimN.reveal(ramp(t, h0 + 0.25, h0 + 0.75, ease.outCubic), 1 - burst);
      dimN2.reveal(ramp(t, h0 + 0.35, h0 + 0.85, ease.outCubic), 1 - burst);
      callRatio.reveal(ramp(t, h0 + 0.45, h0 + 0.95, ease.outCubic), 1 - burst);
      callProp.reveal(ramp(t, h0 + 0.3, h0 + 0.8, ease.outCubic), 1 - burst);
      faceCamera(callRatio.label, camera); faceCamera(callProp.label, camera);
      // perspective grid + visual pyramid
      floorGrid.progress = ramp(t, m3 + 0.15, m3 + 1.1, ease.outCubic);
      floorGrid.opacity = 1 - ramp(t, pB, pB + 0.4);
      pyramid.progress = ramp(t, m3 + 0.5, m3 + 1.2, ease.inOutSine);
      pyramid.opacity = (1 - ramp(t, pB, pB + 0.3)) * 0.8;
      const pv = ramp(t, m3 + 0.6, m3 + 1.0) * (1 - ramp(t, pB, pB + 0.3));
      vpDot.visible = eyeDot.visible = pv > 0.01;
      vpDot.material.opacity = eyeDot.material.opacity = pv;
      perspLabel.reveal = ramp(t, m3 + 0.8, m3 + 1.3, ease.outCubic);
      perspLabel.opacity = pv;

      // ------------------------------------------------ paint burst (19.9)
      paint.tick(t, info);
      const pm = ramp(t, pB + 0.02, pB + 0.75, ease.outCubic);
      paint.u.mix = pm;
      paint.u.scatter = ramp(t, pB, pB + 0.4, ease.outExpo) * 2.2;
      paint.u.swirl = pm * 1.6;
      paint.u.noise = 0.02 + 0.18 * Math.sin(Math.PI * Math.min(1, pm * 1.3));
      paint.u.size = lerp(0.022, 0.07, ramp(t, pB, pB + 0.4, ease.outCubic));
      const pOp = ramp(t, pB - 0.12, pB + 0.02);
      paint.u.opacity = pOp;
      paint.visible = pOp > 0.002;
      paint.u.intensity = 0.95 + 0.45 * Math.exp(-Math.max(0, t - pB) * 5);

      dust.tick(t, info);

      // ------------------------------------------------ post
      dof.focus = camPos.distanceTo(C3);
      dof.range = 1.4;
      dof.amount = 0.6 * envelope(t, m3 + 0.2, pB + 0.3, 0.4, 0.3);
      bloom.strength = 0.75 + 0.35 * ramp(t, pB, pB + 0.3) + 0.1 * envelope(t, m3 - 0.1, m3 + 0.6, 0.2, 0.4);
    },
  };
}
