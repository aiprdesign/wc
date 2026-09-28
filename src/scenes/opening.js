// OPENING — THE IDEA (0.0 – 8.0 s)
// Technique: procedural compass-and-straightedge line construction → layered 2.5D
// manuscript compositing with a speed-ramped fly-through → particle-assembled
// typography → 2D→3D typography (the same glyph meshes extrude into monumental
// bronze/marble/gold letters the camera flies between, pushing into the 'zoom').
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp, rng, clamp } from '../lib/math.js';
import { progressLine, segmentsLine, circlePoints, goldenSpiralPoints } from '../lib/lines.js';
import { MorphParticles, Dust, sampleBox, sampleGeometry } from '../lib/particles.js';
import { TextPlane, KineticText, FONTS, letters3D } from '../lib/text.js';
import { manuscriptTexture, marbleTexture } from '../lib/textures.js';
import { glowSprite, lightShaft } from '../lib/materials.js';
import { pulse } from '../lib/rhythm.js';

const GOLD = '#e8bd6e';
const GOLD_HOT = '#fff0d0';
const GOLD_DIM = '#8c6a3c';
const Z_TITLE = -52;          // world z of the title plane
const PHI = (1 + Math.sqrt(5)) / 2;

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 300);
  const R = rng(20260927);

  // ======================================================================
  // 1. THE POINT
  const point = glowSprite({ color: '#ffd89a', intensity: 4, scale: 0.1 });
  const pointCore = glowSprite({ color: '#ffffff', intensity: 6, scale: 0.03 });
  scene.add(point, pointCore);

  // ======================================================================
  // 2. THE CONSTRUCTION GRID (plane z = 0)
  const grid = new THREE.Group();
  grid.rotation.set(-0.05, 0.06, 0);
  scene.add(grid);
  const anims = [];   // { obj, t0, t1, fn, op }
  const add = (obj, t0, t1, fn = ease.inOutCubic, op = 1) => { grid.add(obj); anims.push({ obj, t0, t1, fn, op }); obj.progress = 0; return obj; };
  const lineOpts = (intensity = 1.2, extra = {}) => ({ color: GOLD, headColor: GOLD_HOT, intensity, head: 0.03, ...extra });

  const g0 = cue('gridStart'), g1 = cue('gridDone');   // 1.0 → 2.6
  // Axes expanding outward from the point
  for (const [dx, dy, len] of [[1, 0, 7.2], [-1, 0, 7.2], [0, 1, 3.2], [0, -1, 3.2]]) {
    add(progressLine([V(0, 0), V(dx * len, dy * len)], lineOpts(1.0)), g0, g0 + 0.7, ease.outQuart);
  }
  // Central circle + vesica piscis + outer circle (compass work)
  add(progressLine(circlePoints(1, 160), lineOpts(1.5)), g0 + 0.05, g0 + 0.5, ease.inOutSine);
  add(progressLine(circlePoints(1, 160, { center: V(1, 0), start: Math.PI, end: Math.PI * 3 }), lineOpts(1.0)), g0 + 0.25, g0 + 0.75, ease.inOutSine);
  add(progressLine(circlePoints(1, 160, { center: V(-1, 0), start: 0, end: Math.PI * 2 }), lineOpts(1.0)), g0 + 0.3, g0 + 0.8, ease.inOutSine);
  add(progressLine(circlePoints(2, 200, { start: Math.PI / 2, end: Math.PI / 2 + Math.PI * 2 }), lineOpts(1.2)), g0 + 0.4, g0 + 0.95, ease.inOutSine);
  add(progressLine(circlePoints(PHI, 200, { start: -Math.PI / 2, end: Math.PI * 1.5 }), lineOpts(0.55)), g0 + 0.5, g0 + 1.0, ease.inOutSine);
  // Squares & diagonals
  add(progressLine([V(-1, -1), V(1, -1), V(1, 1), V(-1, 1), V(-1, -1)], lineOpts(1.0)), g0 + 0.45, g0 + 0.9);
  add(progressLine([V(-2, -2), V(2, -2), V(2, 2), V(-2, 2), V(-2, -2)], lineOpts(1.1)), g0 + 0.55, g0 + 1.05);
  add(progressLine([V(-2.6, -2.6), V(2.6, 2.6)], lineOpts(0.6)), g0 + 0.6, g0 + 1.0, ease.outCubic);
  add(progressLine([V(2.6, -2.6), V(-2.6, 2.6)], lineOpts(0.6)), g0 + 0.62, g0 + 1.02, ease.outCubic);
  // Golden rectangles either side, with their subdivisions + spirals
  const gw = 4 / PHI;                      // 2.472
  for (const s of [1, -1]) {
    add(progressLine([V(2 * s, 2), V((2 + gw) * s, 2), V((2 + gw) * s, -2), V(2 * s, -2)], lineOpts(1.0)), g0 + 0.75, g0 + 1.2);
    // subdivide: square gw×gw at the far end, then the next…
    const segs = [];
    let x0 = 2, x1 = 2 + gw, y0 = -2, y1 = 2, dir = 0;
    for (let k = 0; k < 6; k++) {
      const w = x1 - x0, h = y1 - y0;
      if (dir === 0) { const yy = y1 - w; segs.push([V(x0 * s, yy), V(x1 * s, yy)]); y1 = yy; }
      else if (dir === 1) { const xx = x0 + h; segs.push([V(xx * s, y0), V(xx * s, y1)]); x0 = xx; }
      else if (dir === 2) { const yy = y0 + w; segs.push([V(x0 * s, yy), V(x1 * s, yy)]); y0 = yy; }
      else { const xx = x1 - h; segs.push([V(xx * s, y0), V(xx * s, y1)]); x1 = xx; }
      dir = (dir + 1) % 4;
    }
    add(segmentsLine(segs, lineOpts(0.8, { orderFn: (a, b, i) => i * 0.1, stagger: 0.6 })), g0 + 0.95, g0 + 1.45);
    const sp = goldenSpiralPoints(2.3, 2.2, 260).map((p) => V((2 + gw - 0.15 - p.x * 0.55) * s, p.y * 0.55 - 0.1, 0));
    add(progressLine(sp.reverse(), lineOpts(1.3)), g0 + 1.0, g0 + 1.55, ease.inOutSine);
  }
  // Temple elevation (stylobate, 8 columns, entablature, pediment) — built bottom-up
  {
    const segs = [];
    const W = 3.9, base = -2.35;
    for (let k = 0; k < 3; k++) { const y = base + k * 0.13, w = W + 0.35 - k * 0.12; segs.push([V(-w, y), V(w, y)]); segs.push([V(-w, y), V(-w, y + 0.13)]); segs.push([V(w, y), V(w, y + 0.13)]); }
    const top = 0.85;
    for (let i = 0; i < 8; i++) {
      const x = -W + 0.35 + i * ((2 * W - 0.7) / 7), r = 0.17;
      segs.push([V(x - r, base + 0.39), V(x - r * 0.82, top - 0.12)]);
      segs.push([V(x + r, base + 0.39), V(x + r * 0.82, top - 0.12)]);
      segs.push([V(x - r * 1.35, top - 0.12), V(x + r * 1.35, top - 0.12)]);
      segs.push([V(x - r * 1.35, top), V(x + r * 1.35, top)]);
    }
    segs.push([V(-W, top), V(W, top)], [V(-W, top + 0.3), V(W, top + 0.3)], [V(-W, top + 0.42), V(W, top + 0.42)]);
    segs.push([V(-W, top), V(-W, top + 0.42)], [V(W, top), V(W, top + 0.42)]);
    segs.push([V(-W - 0.1, top + 0.42), V(0, top + 1.55)], [V(0, top + 1.55), V(W + 0.1, top + 0.42)]);
    segs.push([V(-W + 0.45, top + 0.52), V(0, top + 1.38)], [V(0, top + 1.38), V(W - 0.45, top + 0.52)]);
    const ys = segs.map(([a, b]) => (a.y + b.y) / 2);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    add(segmentsLine(segs, lineOpts(0.9, { headColor: '#e8bd6e', head: 0.012, orderFn: (a, b) => ((a.y + b.y) / 2 - lo) / (hi - lo) * 0.75, stagger: 0.75 })), g0 + 0.55, g1 - 0.1, ease.inOutSine);
  }
  // Fine floor-plan grid growing radially from the point
  {
    const segs = [], st = 0.5;
    for (let x = -7; x <= 7.001; x += st) for (let y = -3; y < 3; y += st) segs.push([V(x, y), V(x, y + st)]);
    for (let y = -3; y <= 3.001; y += st) for (let x = -7; x < 7; x += st) segs.push([V(x, y), V(x + st, y)]);
    add(segmentsLine(segs, { color: GOLD_DIM, headColor: GOLD, intensity: 0.35, head: 0.02, orderFn: (a, b) => Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) / 7.8 * 0.8, stagger: 0.8 }), g0, g1, ease.outSine);
  }
  // Degree ring (astronomical markings)
  {
    const segs = [], n = 120;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, r0 = 2.62, l = i % 10 === 0 ? 0.22 : i % 5 === 0 ? 0.13 : 0.07;
      segs.push([V(Math.cos(a) * r0, Math.sin(a) * r0), V(Math.cos(a) * (r0 + l), Math.sin(a) * (r0 + l))]);
    }
    add(segmentsLine(segs, lineOpts(0.9, { orderFn: (a, b, i) => (i / n) * 0.7, stagger: 0.7 })), g0 + 0.8, g1, ease.inOutSine);
    add(progressLine(circlePoints(2.62, 220), lineOpts(0.7)), g0 + 0.7, g0 + 1.3, ease.inOutSine);
  }
  // Hand annotations
  const labels = [];
  const addLabel = (txt, x, y, t0, opts = {}) => {
    const l = new TextPlane(txt, { font: opts.mono ? FONTS.mono : FONTS.serif, italic: !opts.mono, weight: opts.mono ? 400 : 500, height: opts.h ?? 0.2, color: '#f3d6a0', intensity: 1.1, letterSpacing: opts.mono ? 0.15 : 0, revealDir: 'x' });
    l.position.set(x, y, 0.01);
    grid.add(l);
    labels.push({ l, t0 });
  };
  addLabel('A', 1.1, -0.3, g0 + 0.6); addLabel('B', -1.12, -0.3, g0 + 0.65);   // below the axis: the centred caption sits on it addLabel('C', 0.14, 1.12, g0 + 0.7);
  addLabel('φ', 2.1 + gw * 0.5, 2.2, g0 + 1.1, { h: 0.26 }); addLabel('φ', -2.1 - gw * 0.5, 2.2, g0 + 1.15, { h: 0.26 });
  addLabel('1 : 1.618', 3.25, -2.3, g0 + 1.2, { mono: true, h: 0.11 });
  addLabel('MODVLVS · I', -3.2, -2.3, g0 + 1.25, { mono: true, h: 0.11 });
  addLabel('De architectura', 0, 2.9, g0 + 1.3, { h: 0.22 });

  // ======================================================================
  // 3. MANUSCRIPT LAYERS (2.5D planes at staggered depths along the flight path)
  const layers = [];
  const kinds = ['geometry', 'astronomy', 'architecture', 'text'];
  const parchTex = kinds.map((kind, i) => manuscriptTexture({ w: 768, h: 1024, seed: 3 + i, kind }));
  const inkTex = kinds.map((kind, i) => manuscriptTexture({ w: 768, h: 1024, seed: 11 + i, kind, ink: 'rgba(255,222,170,1)', transparent: true }));
  const pageGeo = (() => {
    const g = new THREE.PlaneGeometry(1.5, 2, 16, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -0.18 * (x / 0.75) * (x / 0.75)); }   // gentle page curl
    g.computeVertexNormals();
    return g;
  })();
  const NL = 18;
  for (let i = 0; i < NL; i++) {
    const ink = i % 3 === 1;
    const side = i % 2 === 0 ? 1 : -1;
    const z = 3.5 - i * 2.6 - R() * 1.0;
    const x = side * (1.9 + R() * 2.2);
    const y = (R() - 0.5) * 2.6;
    const s = 1.1 + R() * 1.1;
    const tex = ink ? inkTex[i % 4] : parchTex[(i + 1) % 4];
    const mat = ink
      ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.5, 1.15, 0.75), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ map: tex, color: '#e8dcc4', roughness: 0.85, metalness: 0, transparent: true, opacity: 0, side: THREE.DoubleSide, envMapIntensity: 0.25 });
    const m = new THREE.Mesh(pageGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(s * (ink ? 1.35 : 1));
    const base = { x, y, z, ry: -side * (0.35 + R() * 0.4), rz: (R() - 0.5) * 0.5, rx: (R() - 0.5) * 0.3, dx: (R() - 0.5) * 0.5, dy: (R() - 0.5) * 0.4, spin: (R() - 0.5) * 0.25 };
    m.rotation.set(base.rx, base.ry, base.rz);
    scene.add(m);
    layers.push({ m, mat, ink, base, t0: cue('layersStart') + (i < 7 ? i * 0.12 : 0.6 + i * 0.05) });
  }
  // a few large, very faint diagrams far behind the title for depth
  const farLayers = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2), new THREE.MeshBasicMaterial({ map: inkTex[(i + 1) % 4], color: new THREE.Color(0.5, 0.36, 0.22), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set((i - 1) * 14, (i === 1 ? 1 : -1.5), Z_TITLE - 30 - i * 4);
    m.scale.setScalar(11);
    m.rotation.z = (i - 1) * 0.3;
    scene.add(m);
    farLayers.push(m);
  }

  // Dust along the whole path
  const dust = new Dust({ count: 3500, size: [18, 9, 80], center: [0, 0, -24], color: '#ffd9a8', particleSize: 0.028, opacity: 0.55, intensity: 1.3, seed: 5 });
  scene.add(dust);

  // ======================================================================
  // 4. TITLE — 3D glyph meshes (flat first), particle assembly onto their faces
  const titleGroup = new THREE.Group();
  titleGroup.position.set(0, 0, Z_TITLE);
  scene.add(titleGroup);
  const L1 = letters3D('ACHIEVEMENTS OF', { size: 1, depth: 0.55, bevel: 0.03, tracking: 0.16 });
  const L2 = letters3D('WESTERN CIVILIZATION', { size: 1, depth: 0.55, bevel: 0.03, tracking: 0.1 });
  const s2 = 10.4 / L2.width, s1 = 6.1 / L1.width;
  const Y1 = 0.95, Y2 = -0.3;
  const marbleMat = new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 7 }), color: '#e6dccb', roughness: 0.3, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, emissive: new THREE.Color('#ffe7c2'), emissiveIntensity: 0, envMapIntensity: 0.4 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#e9b964', metalness: 1, roughness: 0.38, emissive: new THREE.Color('#ffb85a'), emissiveIntensity: 0, envMapIntensity: 0.55 });
  const bronzeMat = new THREE.MeshStandardMaterial({ color: '#b87a45', metalness: 1, roughness: 0.34, emissive: new THREE.Color('#ffa24a'), emissiveIntensity: 0, envMapIntensity: 0.55 });
  const glyphs = [];
  const flatParts1 = [], flatParts2 = [];
  const mkLine = (L, s, y, line) => {
    L.forEach((g, i) => {
      const mat = line === 0 ? (i >= L.length - 2 ? bronzeMat : marbleMat) : goldMat;   // 'OF' in bronze
      const mesh = new THREE.Mesh(g.geometry, mat);
      const base = V(g.x * s, y, 0);
      mesh.position.copy(base);
      mesh.scale.set(s, s, 0.02);
      titleGroup.add(mesh);
      const u = (g.x / L.width) + 0.5;
      glyphs.push({ mesh, base, s, line, u, rnd: [R(), R(), R(), R()] });
      const flat = g.geometry.clone();
      flat.scale(s, s, 0.02);
      flat.translate(base.x, base.y, 0);
      (line === 0 ? flatParts1 : flatParts2).push(flat.index ? flat.toNonIndexed() : flat);
    });
  };
  mkLine(L1, s1, Y1, 0);
  mkLine(L2, s2, Y2, 1);
  const N1 = 26000, N2 = 46000, NP = N1 + N2;
  const flat1 = mergeGeometries(flatParts1), flat2 = mergeGeometries(flatParts2);
  const tgt = new Float32Array(NP * 3);
  tgt.set(sampleGeometry(flat1, N1, { seed: 3 }), 0);
  tgt.set(sampleGeometry(flat2, N2, { seed: 4 }), N1 * 3);
  flat1.dispose(); flat2.dispose();
  const src = sampleBox(NP, 24, 11, 22, { seed: 9, center: [0, 0, 1] });
  const cols = new Float32Array(NP * 3);
  const cA = new THREE.Color('#fff1dc'), cB = new THREE.Color('#ffc46e'), cC = new THREE.Color('#ff9f4a'), tmp = new THREE.Color();
  for (let i = 0; i < NP; i++) {
    const r = R();
    if (i < N1) tmp.copy(cA).lerp(cB, r * 0.35); else tmp.copy(cB).lerp(r < 0.5 ? cA : cC, R() * 0.5);
    cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
  }
  const titleParticles = new MorphParticles({ count: NP, positions: src, targets: tgt, colors: cols, size: 0.034, intensity: 1.6, stagger: 0.55, seed: 21 });
  titleParticles.u.noiseFreq = 0.35; titleParticles.u.noiseSpeed = 0.2;
  titleParticles.u.scatterCenter = V(0, 0.3, 0);
  titleGroup.add(titleParticles);

  // Subtitle (per-glyph kinetic reveal) + gold rule
  const sub = new KineticText('Ideas • Discovery • Engineering • Art • Institutions', { font: FONTS.display, weight: 400, height: 0.235, letterSpacing: 0.28, color: '#f1dcb4', intensity: 1.0 });
  sub.position.set(0, -1.42, 0.05);
  titleGroup.add(sub);
  const ruleL = progressLine([V(0, -0.98, 0.05), V(-5.3, -0.98, 0.05)], { color: GOLD, headColor: GOLD_HOT, intensity: 1.6, head: 0.05 });
  const ruleR = progressLine([V(0, -0.98, 0.05), V(5.3, -0.98, 0.05)], { color: GOLD, headColor: GOLD_HOT, intensity: 1.6, head: 0.05 });
  titleGroup.add(ruleL, ruleR);

  // Warm light beyond the title — the camera flies into it for the 'zoom' hand-over
  const beyond = glowSprite({ color: '#ffc27a', intensity: 1, scale: 30 });
  beyond.position.set(0, 0.35, Z_TITLE - 26);
  const beyondCore = glowSprite({ color: '#fff2da', intensity: 1, scale: 6 });
  beyondCore.position.copy(beyond.position);
  scene.add(beyond, beyondCore);
  const halo = glowSprite({ color: '#ffb766', intensity: 0.6, scale: 26 });
  halo.position.set(0, 0.4, Z_TITLE - 6);
  scene.add(halo);
  const shaft = lightShaft({ length: 30, radiusTop: 0.4, radiusBottom: 7, color: '#ffcf8a', intensity: 0.0 });
  shaft.position.set(-6, 16, Z_TITLE - 6);
  shaft.rotation.z = 0.45;
  scene.add(shaft);

  // Lights
  const key = new THREE.DirectionalLight('#ffe2b8', 2.2);
  key.position.set(-6, 7, 10);
  const rim = new THREE.DirectionalLight('#ffd7a0', 0);
  rim.position.set(3, 4, -12);
  const sweep = new THREE.PointLight('#fff0d8', 0, 16, 1.6);
  const fill = new THREE.AmbientLight('#2a1d12', 0.6);
  scene.add(key, rim, sweep, fill, key.target, rim.target);

  // ======================================================================
  // camera path (speed ramp)
  const zKeys = [[0, 1.55], [cue('gridStart'), 1.35], [1.8, 3.4], [cue('gridDone'), 8.4], [cue('flyThrough'), 8.0], [3.45, -4], [3.85, -24], [4.35, -37.5], [cue('titleLocked'), -40.6], [cue('letters3D'), -41.9], [cue('lettersFly'), -42.9], [7.3, -45.6], [7.7, -49.6], [8.0, -55]];
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const dof = { focus: 10, range: 3, amount: 0 };
  const bloom = { strength: 0.75 };
  let lastT = 0;
  // Explore 3D windows per phase (read on entering explore, right after update(t))
  const LIM_GRID = { yaw: 0.5, pitchDown: 0.3, pitchUp: 0.4, zoomIn: 0.45, zoomOut: 2.2, fly: 1.2 };   // flat compass-and-straightedge linework
  const LIM_PAGES = { yaw: 0.8, pitchDown: 0.35, pitchUp: 0.5, zoomOut: 2.4, fly: 1.5 };                // 2.5D manuscript planes along the flight
  const LIM_TITLE = { yaw: 1.1, pitchDown: 0.35, pitchUp: 0.7, zoomOut: 2.6 };

  return {
    scene, camera, dof, bloom, exposure: 1,
    get exploreLimits() { return lastT < 3.1 ? LIM_GRID : lastT < 4.6 ? LIM_PAGES : LIM_TITLE; },
    // Explore: the flat title (between the particle lock and the extrusion) is paper-thin edge-on — give
    // the glyphs real depth (update() rebuilds the scale every frame, so this is idempotent)
    explore(t) {
      const l3 = cue('letters3D');
      if (t > cue('titleLocked') - 0.3 && t < l3 + 0.6) {
        for (const g of glyphs) if (g.mesh.visible) g.mesh.scale.z = Math.max(g.mesh.scale.z, g.s * 0.35);
      }
    },
    update(t, info) {
      const T = info.T;
      // ---------------------------------------------------------------- camera
      const cz = timeWarp(t, zKeys);
      const orbit = ramp(t, cue('letters3D') - 0.2, cue('lettersFly') + 0.3, ease.inOutSine) * (1 - ramp(t, cue('lettersFly') + 0.2, 7.6, ease.inOutSine));
      const early = 1 - ramp(t, 2.8, 3.6);
      camPos.set(
        Math.sin(t * 0.7) * 0.25 * early + orbit * 3.6 + Math.sin(t * 1.3) * 0.05,
        Math.sin(t * 0.5 + 1) * 0.12 * early + 0.35 * ramp(t, 3.6, 4.6) + orbit * 0.6 - 0.08 * ramp(t, cue('lettersFly'), 8),
        cz,
      );
      camera.position.copy(camPos);
      const lookZ = t < 5 ? cz - 10 : Math.min(cz - 4, Z_TITLE);
      look.set(orbit * 0.6, 0.35 * ramp(t, 3.6, 4.6) - 0.05 * orbit, lookZ);
      if (t > 7.0) look.z = cz - 10;
      camera.up.set(Math.sin(t * 0.4) * 0.03 * early - 0.06 * ramp(t, cue('lettersFly'), 8), 1, 0).normalize();
      camera.lookAt(look);

      // ---------------------------------------------------------------- the point
      const pA = cue('pointAppears');
      const pOn = ramp(t, pA, pA + 0.25, ease.outCubic);
      const camD = Math.max(0.5, camPos.z);
      const pp = pulse(T, { decay: 5 });
      const pointFade = 1 - ramp(t, 2.9, 3.3);
      point.visible = pointCore.visible = pOn > 0 && pointFade > 0;
      const flash = Math.exp(-Math.max(0, t - pA) * 6) * pOn;
      point.scale.setScalar((0.06 + flash * 0.25 + pp * 0.012) * camD * pOn);
      point.material.opacity = pointFade;
      pointCore.scale.setScalar((0.012 + flash * 0.03) * camD * pOn);
      pointCore.material.opacity = pointFade;

      // ---------------------------------------------------------------- grid
      const gridFade = 1 - ramp(t, 3.3, 3.55);
      grid.visible = gridFade > 0.001 && t > g0 - 0.01;
      const gDim = lerp(1, 0.75, ramp(t, g1, 3.2));
      for (const a of anims) {
        a.obj.progress = a.fn(sat((t - a.t0) / (a.t1 - a.t0)));
        a.obj.opacity = gridFade * gDim * a.op;
      }
      for (const { l, t0 } of labels) { l.reveal = ramp(t, t0, t0 + 0.4, ease.outCubic); l.opacity = gridFade * (t > t0 ? 0.85 : 0); }

      // ---------------------------------------------------------------- layers
      for (const L of layers) {
        const b = L.base;
        const appear = ramp(t, L.t0, L.t0 + 0.6, ease.outCubic);
        const d = camPos.z - (b.z);                    // distance ahead of camera
        const distFade = sat((40 - d) / 14) * sat((d + 0.3) / 1.2);
        L.m.position.set(b.x + b.dx * t * 0.3 - Math.sign(b.x) * (1 - appear) * 0.8, b.y + b.dy * t * 0.3, b.z + (1 - appear) * -1.5);
        L.m.rotation.set(b.rx, b.ry + (1 - appear) * 0.6 * Math.sign(b.x), b.rz + b.spin * t);
        const op = appear * distFade * (1 - ramp(t, 4.3, 4.8));
        L.mat.opacity = L.ink ? op * 0.9 : op;
        L.m.visible = op > 0.002;
      }
      const farOp = ramp(t, 3.8, 4.8) * (1 - ramp(t, 7.0, 7.8)) * 0.5;
      for (let i = 0; i < farLayers.length; i++) { farLayers[i].material.opacity = farOp; farLayers[i].visible = farOp > 0.002; farLayers[i].rotation.z = (i - 1) * 0.3 + t * 0.03 * (i % 2 ? 1 : -1); }

      dust.tick(t, info);
      dust.u.opacity = 0.55 * ramp(t, 0.9, 2.0);

      // ---------------------------------------------------------------- title particles
      const tA = cue('titleAssemble'), tL = cue('titleLocked');
      titleParticles.tick(t, info);
      const mix = ramp(t, tA - 0.15, tL + 0.05, ease.inOutSine);
      titleParticles.u.mix = mix;
      titleParticles.u.noise = 0.05 + 0.25 * (1 - mix);
      const burst = ramp(t, cue('letters3D'), cue('letters3D') + 1.2, ease.outCubic);
      titleParticles.u.scatter = burst * 3;
      titleParticles.u.swirl = burst * 0.3;
      const pOp = ramp(t, 3.1, 3.7) * lerp(1, 0.05, ramp(t, tL - 0.2, tL + 0.35)) * (1 - ramp(t, cue('letters3D') + 0.05, cue('letters3D') + 0.55));
      titleParticles.u.opacity = pOp;
      titleParticles.visible = pOp > 0.002;
      titleParticles.u.intensity = lerp(0.9, 1.4, mix) + 0.55 * ramp(t, tL - 0.3, tL) * (1 - ramp(t, tL, tL + 0.4));
      titleParticles.u.size = lerp(0.032, 0.026, mix);

      // ---------------------------------------------------------------- title glyphs
      const l3 = cue('letters3D'), lf = cue('lettersFly');
      const flatOn = ramp(t, tL - 0.3, tL + 0.25, ease.inOutSine);
      const glowK = flatOn * (1 - 0.96 * ramp(t, l3 - 0.1, l3 + 0.7));
      // once extruded and tumbling, glyphs turned away from the key went pure black and vanished from the words
      // (A, V, E of ACHIEVEMENTS): a faint self-glow keeps every letter legible against the dark
      const floorK = 0.12 * ramp(t, l3, l3 + 0.5);
      marbleMat.emissiveIntensity = 0.55 * glowK + floorK;
      goldMat.emissiveIntensity = 0.7 * glowK + floorK * 0.6;
      bronzeMat.emissiveIntensity = 0.7 * glowK + floorK * 0.6;
      const flyK = ramp(t, lf, 8.0, ease.inQuad);
      for (const g of glyphs) {
        const vis = flatOn > 0.001;
        g.mesh.visible = vis;
        if (!vis) continue;
        const delay = (g.line === 0 ? 0.1 : 0) + Math.abs(g.u - 0.5) * 0.35;
        const ex = ramp(t, l3 + delay, l3 + delay + 0.55, ease.inOutCubic);
        g.mesh.scale.set(g.s, g.s, lerp(0.02, g.s * 0.72, ex));   // a shallower extrusion: tightly tracked glyphs no longer interpenetrate when seen from the orbit
        // subtle scale-in while locking so the swap from particles feels organic
        const lockS = lerp(0.985, 1, flatOn);
        g.mesh.scale.x *= lockS; g.mesh.scale.y *= lockS;
        const rot = ex * (g.rnd[0] - 0.5) * 0.24 + flyK * (g.rnd[1] - 0.5) * 1.6;
        g.mesh.rotation.set(flyK * (g.rnd[2] - 0.5) * 0.8, rot, flyK * (g.rnd[3] - 0.5) * 0.4);
        const side = g.line === 0 ? 1 : -1;
        g.mesh.position.set(
          g.base.x * (1 + flyK * 0.25),
          g.base.y + side * flyK * (0.45 + g.rnd[0] * 0.9),
          g.base.z + ex * (g.rnd[1] - 0.5) * 0.3 + flyK * lerp(-15, 3.5, g.rnd[2]),
        );
      }

      // subtitle (5.4)
      const sT = cue('subtitle');
      const subOut = 1 - ramp(t, l3 - 0.1, l3 + 0.35);
      sub.visible = t > sT - 0.05 && subOut > 0;
      if (sub.visible) {
        for (const L of sub.letters) {
          const d = Math.abs(L.u - 0.5) * 0.55;
          const k = ramp(t, sT + d, sT + d + 0.45, ease.outCubic);
          L.mesh.opacity = k * subOut;
          L.mesh.position.set(L.base.x * lerp(1.12, 1, k), L.base.y - (1 - k) * 0.12 + (1 - subOut) * -0.2, L.base.z);
          L.mesh.intensity = 1.0 + (1 - k) * 1.5;
        }
      }
      const rp = ramp(t, sT - 0.25, sT + 0.5, ease.outCubic);
      ruleL.progress = ruleR.progress = rp;
      ruleL.opacity = ruleR.opacity = subOut * 0.9;

      // ---------------------------------------------------------------- lights & glow
      const is3D = ramp(t, l3 - 0.2, l3 + 0.6);
      key.intensity = lerp(1.2, 1.7, is3D);
      key.position.set(lerp(-6, -3, is3D), 7, Z_TITLE + 12);
      key.target.position.set(0, 0, Z_TITLE);
      rim.intensity = lerp(0.2, 0.7, is3D);
      rim.target.position.set(0, 0, Z_TITLE);
      rim.position.set(3 - 6 * ramp(t, l3, 8), 9, Z_TITLE - 8);
      // light sweep across the letters as they lock, and again as they turn 3D
      const sw = ramp(t, tL - 0.25, tL + 0.9, ease.inOutSine);
      const sw2 = ramp(t, l3, l3 + 1.2, ease.inOutSine);
      sweep.position.set(lerp(-8, 8, t < l3 ? sw : sw2), 0.6, Z_TITLE + 2.2);
      sweep.intensity = 9 * envelope(t, tL - 0.25, tL + 0.9, 0.3, 0.4);

      const bOn = ramp(t, 6.4, 8.0, ease.inQuad);
      beyond.material.color.setRGB(1.0, 0.72, 0.4).multiplyScalar(0.1 + bOn * 0.6);
      beyondCore.material.color.setRGB(1.0, 0.92, 0.78).multiplyScalar(0.2 + bOn * 1.4);
      beyond.visible = beyondCore.visible = t > 3.6;
      halo.material.color.setRGB(1.0, 0.68, 0.36).multiplyScalar(0.09 * ramp(t, 4.0, 5.0) * (1 - ramp(t, 7.2, 7.8)) + 0.05 * pulse(T, { decay: 3 }) * ramp(t, 4.5, 5.0));
      halo.visible = t > 3.8;
      shaft.material.uniforms.uIntensity.value = 0.08 * ramp(t, 4.6, 5.6) * (1 - ramp(t, 7.0, 7.6));
      shaft.material.uniforms.uTime.value = t;

      // ---------------------------------------------------------------- post
      dof.range = 4.5;
      dof.amount = 0.35 * envelope(t, l3 - 0.2, 7.55, 0.4, 0.3);
      // while the lens is sharp the focus distance is unused by the film; it is where Explore 3D pivots,
      // so point it at what the shot is about: the construction plane, then the manuscripts, then the title
      dof.focus = Math.max(1, camPos.z - Z_TITLE);
      if (dof.amount <= 0.01 && t < 4.6) dof.focus = t < 3.1 ? Math.max(1, camPos.z) : 7;
      lastT = t;
      bloom.strength = 0.75 + 0.25 * envelope(t, pA, pA + 0.6, 0.05, 0.5) + 0.15 * ramp(t, 7.0, 8.0);
    },
  };
}
