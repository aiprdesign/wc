// ART & THE RENAISSANCE (15.5 – 20.5 s)
// Technique: procedural drawing (a Vitruvian figure defined as signed-distance
// primitives → marching-squares contours in several wobbly passes + light-driven
// cross-hatching, ~9k strokes revealed in a staged order), 2D→3D transformation (the
// strokes lift off the canvas and the very same primitives inflate into a lit 3D
// study, camera orbit with DOF through Alberti perspective grids and proportion HUD)
// and a pigment particle explosion into the 'flash'.
import * as THREE from 'three';
import { CUES } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, rng, smoothstep } from '../lib/math.js';
import { progressLine, segmentsLine, circlePoints } from '../lib/lines.js';
import { MorphParticles, Dust, sampleGeometry } from '../lib/particles.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { fresnel, lightShaft, glowSprite } from '../lib/materials.js';
import { Callout, Dimension, faceCamera } from '../lib/hud.js';
import { noise2 } from '../lib/noise.js';
import { pulse } from '../lib/rhythm.js';
import { sdfBody, meshBody, profilePrim } from '../lib/sdfmesh.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const PHI = (1 + Math.sqrt(5)) / 2;
const SEPIA = '#5a2e16';
const CHALK = '#8a3f1f';
const EMBER = '#ff8a3a';
const GOLD = '#f2c46e';
const HUD = '#f3d08a';

// ---------------------------------------------------------------------------
// Figure: a smooth mannequin silhouette, one set of signed-distance primitives (round cones +
// ellipsoids, blended with a smooth minimum) that is both the drawing (its 2D projection, contoured)
// and the 3D study (the same field in 3D, meshed with surface nets). No face, fingers or muscles:
// just clean, correctly proportioned outlines (Vitruvius / Leonardo).
// Feet at y = -1.2, head top at 0.8 (height 2.0 = arm span), navel (circle centre) at y = 0,
// groin (square centre) at -0.2, chin at 0.55 (head = 1/8), shoulders 0.5 wide (1/4), elbows at
// ±0.5, wrists at ±0.8, knees at -0.7.
const SHOULDER = [0.2, 0.447], HIP = [0.09, -0.12];
const ARM_UP = 0.41, LEG_OUT = 0.3, LEG_B = 0.982;   // second pose: fingertips and soles on the circle
function figureParts(pose = 0) {
  const P = [];
  const cone = (a, b, ra, rb, k, flat = 1, limb = false) => P.push({ type: 'cone', a, b, ra, rb, flat, k, limb });
  const ell = (c, r, k, limb = false, ang = 0) => P.push({ type: 'ell', c, r, k, limb, ang });
  // head (an egg: cranium + jaw) and neck
  ell([0, 0.676, 0.004], [0.083, 0.117, 0.097], 0);
  ell([0, 0.622, 0.014], [0.06, 0.066, 0.068], 0.05);
  cone([0, 0.5, -0.008], [0, 0.61, 0], 0.043, 0.037, 0.035);
  // trunk (shared by both poses): one smooth profile from the neck over sloping shoulders (±0.25),
  // a V-shaped chest, a gentle waist at the navel and the hips down to the groin
  P.push({ ...profilePrim(
    [-0.25, -0.22, -0.18, -0.13, -0.07, 0.0, 0.08, 0.16, 0.25, 0.33, 0.38, 0.405, 0.43, 0.455, 0.478, 0.497, 0.517, 0.537, 0.575],
    [0.04, 0.11, 0.15, 0.165, 0.163, 0.148, 0.141, 0.153, 0.172, 0.188, 0.2, 0.225, 0.243, 0.247, 0.232, 0.195, 0.125, 0.062, 0.036],
    [0.04, 0.066, 0.082, 0.092, 0.095, 0.09, 0.085, 0.09, 0.1, 0.104, 0.1, 0.092, 0.082, 0.074, 0.066, 0.058, 0.05, 0.046, 0.04], 0.04), limb: false });
  const rot = (px, py, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), dx = px - cx, dy = py - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; };
  for (const s of [1, -1]) {
    // arm, drawn for the right side (x > 0) then mirrored; the pose rotates it about the shoulder
    const aa = pose === 0 ? 0 : ARM_UP * s, la = pose === 0 ? 0 : LEG_OUT * s;
    const A = (x, y, z = 0) => { const [rx, ry] = rot(x * s, y, SHOULDER[0] * s, SHOULDER[1], aa); return [rx, ry, z]; };
    const lk = pose === 0 ? 1 : LEG_B;   // (Leonardo: spreading the legs lowers the body a little)
    const L = (x, y, z = 0) => { const [rx, ry] = rot(x * s, HIP[1] + (y - HIP[1]) * lk, HIP[0] * s, HIP[1], la); return [rx, ry, z]; };
    cone(A(0.2, 0.447), A(0.5, 0.45), 0.05, 0.036, 0.04, 0.95, true);                // upper arm
    cone(A(0.5, 0.45), A(0.795, 0.452), 0.036, 0.023, 0.025, 0.95, true);            // forearm
    ell(A(0.868, 0.452), [0.062, 0.031, 0.016], 0.022, true, aa);                     // hand: a simple mitten
    cone(A(0.81, 0.452), A(0.975, 0.455), 0.025, 0.018, 0.02, 0.6, true);
    cone(L(0.09, -0.12), L(0.074, -0.69), 0.072, 0.042, 0.03, 0.92, true);           // thigh
    cone(L(0.074, -0.69), L(0.062, -1.12), 0.042, 0.024, 0.03, 0.95, true);           // shin
    ell(L(0.079, -0.84), [0.043, 0.13, 0.047], 0.04, true, la);                          // calf line
    const tx = 0.062 + 0.13 * Math.sin(0.5);
    cone(L(0.062, -1.157, -0.025), L(tx, -1.176, 0.13 * Math.cos(0.5) - 0.025), 0.03, 0.024, 0.025, 1, true);    // foot, turned out
  }
  return P;
}

// Marching squares over f on a grid → array of [Vector3, Vector3] segments (z = 0).
function contour(f, x0, x1, y0, y1, cell, keep = null) {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const vals = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f(x0 + i * cell, y0 + j * cell);
  const segs = [];
  const lerpP = (xa, ya, va, xb, yb, vb) => { const t = va / (va - vb); return [xa + (xb - xa) * t, ya + (yb - ya) * t]; };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const X = x0 + i * cell, Y = y0 + j * cell;
      const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1], c = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
      let idx = 0;
      if (a < 0) idx |= 1; if (b < 0) idx |= 2; if (c < 0) idx |= 4; if (d < 0) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const eB = () => lerpP(X, Y, a, X + cell, Y, b);                 // bottom edge
      const eR = () => lerpP(X + cell, Y, b, X + cell, Y + cell, c);   // right
      const eT = () => lerpP(X + cell, Y + cell, c, X, Y + cell, d);   // top
      const eL = () => lerpP(X, Y + cell, d, X, Y, a);                 // left
      const pairs = {
        1: [[eL, eB]], 2: [[eB, eR]], 3: [[eL, eR]], 4: [[eR, eT]], 5: [[eL, eT], [eB, eR]], 6: [[eB, eT]], 7: [[eL, eT]],
        8: [[eT, eL]], 9: [[eT, eB]], 10: [[eB, eL], [eR, eT]], 11: [[eT, eR]], 12: [[eR, eL]], 13: [[eR, eB]], 14: [[eB, eL]],
      }[idx];
      for (const [p, q] of pairs) {
        const A = p(), B = q();
        if (keep && !keep((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) continue;
        segs.push([V(A[0], A[1]), V(B[0], B[1])]);
      }
    }
  }
  return segs;
}

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

// The bloom duck the film applies while a chapter heading is up (core/words3d.js). Explore (and the clean
// Experience picture) hide the headings and drop the duck with them; the explore hook puts it back.
function headingDuck(ctx, inst, T) {
  let d = 0;
  const items = ctx.engine?.words3d?.items;
  if (items) for (const it of items) if (it.inst === inst) d = Math.max(d, ramp(T - it.t0, 0, 0.35) * (1 - ramp(T, it.t1 - 0.2, it.t1 + 0.35)));
  return d;
}

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

  // Explore 3D only (the film frames the canvas alone in the dark): the studio easel that holds it and
  // the boards it stands on, so from any angle the canvas is a real object rather than a floating card
  const EASEL_FOOT = -2.75;                          // world y of the studio floor
  const easel = new THREE.Group();
  {
    const easelWood = new THREE.MeshStandardMaterial({ color: '#4a2f19', roughness: 0.62, metalness: 0 });
    const brassE = new THREE.MeshStandardMaterial({ color: '#b8904e', roughness: 0.35, metalness: 1 });
    const beam = (a, b, w, d, mat = easelWood) => {
      const len = a.distanceTo(b), m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      easel.add(m); return m;
    };
    const topY = CH / 2 + 0.55, backZ = -CD / 2 - 0.13;
    for (const sx of [-1, 1]) beam(V(sx * 0.32, topY, backZ - 0.02), V(sx * 1.05, EASEL_FOOT, -0.03), 0.075, 0.06);  // front legs (behind the canvas down to its ledge)
    beam(V(0, topY + 0.1, backZ - 0.06), V(0, EASEL_FOOT, -1.7), 0.07, 0.06);                                     // rear leg
    beam(V(0, -CH / 2 - 0.2, backZ), V(0, topY + 0.18, backZ), 0.1, 0.05);                                        // mast
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.3, 0.07, 0.24), easelWood); ledge.position.set(0, -CH / 2 - 0.035, 0.04); easel.add(ledge);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.3, 0.09, 0.03), easelWood); lip.position.set(0, -CH / 2 + 0.01, 0.16); easel.add(lip);
    const topClamp = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.22), easelWood); topClamp.position.set(0, CH / 2 + 0.04, -0.03); easel.add(topClamp);
    beam(V(-0.62, -CH / 2 - 0.9, backZ + 0.02), V(0.62, -CH / 2 - 0.9, backZ + 0.02), 0.05, 0.05);             // cross brace
    for (const y of [CH / 2 + 0.04, -CH / 2 - 0.035]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16), brassE); k.rotation.x = Math.PI / 2; k.position.set(0, y, backZ - 0.07); easel.add(k); }
    // floorboards, fading into the dark
    const N = 512, fc = mkCanvas(N, N), g = fc.getContext('2d'), r = rng(88);
    for (let i = 0; i < 16; i++) {
      const l = 0.75 + r() * 0.35;
      g.fillStyle = `rgb(${Math.round(58 * l)},${Math.round(38 * l)},${Math.round(22 * l)})`; g.fillRect(i * 32, 0, 32, N);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(20,10,4,${0.08 + r() * 0.12})`; g.fillRect(i * 32 + r() * 32, r() * N, 1, 20 + r() * 120); }
      g.fillStyle = 'rgba(8,4,2,0.9)'; g.fillRect(i * 32, 0, 2, N);
      g.fillRect(i * 32, r() * N, 32, 2);
    }
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(N / 2, N / 2, N * 0.18, N / 2, N / 2, N / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, N, N);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 64), new THREE.MeshStandardMaterial({ map: toTexture(fc), transparent: true, roughness: 0.7, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.userData.worldFloor = true;
    easel.userData.floor = floor;
    scene.add(floor);
    canvasRig.add(easel);
    easel.visible = floor.visible = false;
  }

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
  const partsA = figureParts(0), partsB = figureParts(1);
  const bodyA = sdfBody(partsA);
  const fA = bodyA.field2;                                   // the drawing's silhouette = the 3D body seen head-on
  const fTorso = sdfBody(partsA.filter((p) => !p.limb)).field2;
  const fLimbsB = sdfBody(partsB.filter((p) => p.limb)).field2;
  const BX0 = -1.1, BX1 = 1.1, BY0 = -1.3, BY1 = 0.9;
  const wob = (amp, freq, seed) => (x, y) => fA(x, y) + amp * noise2(x * freq + seed, y * freq - seed * 0.7);
  const navelY = 0;
  const radialOrder = (a, b) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; return Math.min(1, Math.hypot(mx, (my - navelY) * 0.9) / 1.15); };
  const sketch = new THREE.Group();     // lives in world space so it can lift off the (receding) canvas
  scene.add(sketch);
  const inkOpts = (color, opacity, extra = {}) => ({ color, headColor: EMBER, intensity: 1, opacity, head: 0.012, additive: false, ...extra });

  // light construction pass (radial, from the navel outward)
  const segA = contour(wob(0.006, 3.0, 1.3), BX0, BX1, BY0, BY1, 0.0075);
  const strokesA = segmentsLine(segA, inkOpts(CHALK, 0.42, { orderFn: (a, b) => radialOrder(a, b) * 0.8 + R() * 0.05, stagger: 0.86 }));
  // firm pass (top → bottom with a little noise)
  const segB = contour(wob(0.0035, 7.0, 4.1), BX0, BX1, BY0, BY1, 0.0065);
  const strokesB = segmentsLine(segB, inkOpts(SEPIA, 0.9, { orderFn: (a, b) => (1 - ((a.y + b.y) / 2 - BY0) / (BY1 - BY0)) * 0.72 + Math.abs(a.x) * 0.08 + R() * 0.04, stagger: 0.86 }));
  // third, loose pass slightly outside the form
  const segC = contour((x, y) => fA(x, y) - 0.007 + 0.006 * noise2(x * 11 + 9, y * 11), BX0, BX1, BY0, BY1, 0.009);
  const strokesC = segmentsLine(segC.filter(() => R() < 0.55), inkOpts(CHALK, 0.32, { orderFn: (a, b) => radialOrder(a, b) * 0.7 + R() * 0.1, stagger: 0.8 }));
  // second pose (arms raised, legs apart) — limbs only, outside the torso
  const segP = contour((x, y) => fLimbsB(x, y) + 0.004 * noise2(x * 6, y * 6 + 3), BX0, BX1, BY0, BY1, 0.0085, (x, y) => fTorso(x, y) > 0.004);
  const strokesP = segmentsLine(segP, inkOpts(CHALK, 0.4, { orderFn: (a, b) => radialOrder(a, b) * 0.75 + R() * 0.05, stagger: 0.85 }));

  // hatching driven by a fake 3D normal: light from the upper left
  const hatch = [];
  {
    const L = V(-0.55, 0.55, 0.63).normalize(), N = new THREE.Vector3();
    const shade = (x, y) => {
      const d = fA(x, y);
      if (d > -0.004) return -1;
      const e = 0.004;
      const gx = fA(x + e, y) - fA(x - e, y), gy = fA(x, y + e) - fA(x, y - e);
      const gl = Math.hypot(gx, gy) || 1;
      const k = Math.sqrt(sat(-d / 0.075));
      N.set((gx / gl) * (1 - k), (gy / gl) * (1 - k), k).normalize();
      return Math.max(0, N.dot(L));
    };
    const layer = (ang, spacing, thr, len, seed) => {
      const r = rng(seed);
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      const ext = 1.7;
      for (let o = -ext; o <= ext; o += spacing) {
        let run = null;
        const step = 0.006;
        for (let s = -ext; s <= ext; s += step) {
          const x = px * o + dx * s, y = py * o + dy * s;
          if (x < BX0 || x > BX1 || y < BY0 || y > BY1) { run = null; continue; }
          const sh = shade(x, y);
          const dark = sh < 0 ? false : (1 - sh) > thr + 0.08 * noise2(x * 9 + seed, y * 9);
          if (dark) {
            if (!run) run = { x, y, n: 0, target: len * (0.6 + r() * 0.8) };
            run.n += step;
            if (run.n >= run.target) {
              const j = (r() - 0.5) * 0.004;
              hatch.push([V(run.x + j, run.y + j), V(x + j, y - j)]);
              run = null; s += step * (1 + Math.floor(r() * 3));
            }
          } else if (run) {
            if (run.n > 0.02) hatch.push([V(run.x, run.y), V(x - dx * step, y - dy * step)]);
            run = null;
          }
        }
      }
    };
    layer(-Math.PI / 4, 0.0125, 0.5, 0.07, 3);
    layer(Math.PI / 4, 0.016, 0.72, 0.06, 7);
    // (no hair or facial marks: the figure stays a clean silhouette, like the 3D study)
    layer(-Math.PI / 3, 0.022, 0.86, 0.05, 11);
  }
  const strokesH = segmentsLine(hatch, inkOpts(SEPIA, 0.7, { orderFn: (a, b) => (1 - ((a.y + b.y) / 2 - BY0) / (BY1 - BY0)) * 0.55 + R() * 0.3, stagger: 0.9, head: 0.02 }));
  // proportion ticks across the figure (head, chin, chest, navel, groin, knees)
  const ticks = [];
  for (const y of [0.8, 0.55, 0.3, 0.0, -0.2, -0.7, -1.2]) ticks.push([V(-0.22, y), V(0.22, y)]);
  for (const x of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) ticks.push([V(x, 0.4), V(x, 0.5)]);
  const strokesT = segmentsLine(ticks, inkOpts(SEPIA, 0.55, { orderFn: (a, b, i) => i / ticks.length * 0.3, stagger: 0.7 }));
  // compass circle + square (two passes each)
  const circleR = 1.2, sqHalf = 1.0, sqCy = -0.2;
  const sqPts = (o) => [V(-sqHalf - o, sqCy - sqHalf), V(sqHalf, sqCy - sqHalf - o), V(sqHalf + o, sqCy + sqHalf), V(-sqHalf, sqCy + sqHalf + o), V(-sqHalf - o, sqCy - sqHalf)];
  const sq1 = progressLine(sqPts(0), inkOpts(SEPIA, 0.85, { head: 0.02 }));
  const sq2 = progressLine(sqPts(0.004), inkOpts(CHALK, 0.4, { head: 0.02 }));
  const ci1 = progressLine(circlePoints(circleR, 240, { start: -Math.PI / 2, end: Math.PI * 1.5, center: V(0, navelY) }), inkOpts(SEPIA, 0.85, { head: 0.02 }));
  const ci2 = progressLine(circlePoints(circleR + 0.005, 240, { start: -Math.PI / 2 + 0.3, end: Math.PI * 1.5 + 0.3, center: V(0, navelY) }), inkOpts(CHALK, 0.4, { head: 0.02 }));
  sketch.add(strokesA, strokesB, strokesC, strokesP, strokesH, strokesT, sq1, sq2, ci1, ci2);
  // mirror-script handwriting
  const hand = [];
  const handLine = (txt, y, h = 0.075) => {
    const tp = new TextPlane(txt, { font: FONTS.serif, italic: true, weight: 500, height: h, color: '#4a2812', intensity: 1, blending: THREE.NormalBlending });
    tp.position.set(0, y, 0.001); tp.scale.x = -1;
    sketch.add(tp); hand.push(tp);
  };
  handLine('Vetruvio architecto mecte nella sua opera d’architectura', 1.42);
  handLine('che le misure dell’omo sono dalla natura distribuite', 1.3);
  handLine('tanto apre l’omo nelle braccia quanto è la sua altezza', -1.4);
  hand.forEach((h) => { h.material.uniforms.uColor.value.set('#4a2812'); });
  const strokeCount = segA.length + segB.length + segC.length + segP.length + hatch.length + ticks.length;

  // ---------------------------------------------------------------- 3D figure (same primitives)
  const figGroup = new THREE.Group();
  scene.add(figGroup);
  // the same field meshed in 3D: one smooth, seamless skin (surface nets, gradient normals)
  const figGeo = meshBody(bodyA, [-1.02, -1.22, -0.12], [1.02, 0.82, 0.13], 0.0085);
  // a silhouette, not a portrait: near-black form defined only by its gold rim light
  const figMat = new THREE.MeshStandardMaterial({ color: '#0d0b09', roughness: 0.85, metalness: 0, transparent: true, opacity: 0 });
  const figMesh = new THREE.Mesh(figGeo, figMat);
  const figRim = new THREE.Mesh(figGeo, fresnel({ color: '#ffc877', intensity: 2.0, power: 2.2, opacity: 0 }));
  figGroup.add(figMesh, figRim);
  // Leonardo's second pose (arms raised, legs spread onto the circle): a faint rim-lit ghost of the limbs,
  // the same pose the drawing sketches in lighter lines
  const ghostGeo = meshBody(sdfBody(partsB.filter((p) => p.limb)), [-1.0, -1.22, -0.1], [1.0, 0.84, 0.13], 0.011);
  const figGhost = new THREE.Mesh(ghostGeo, fresnel({ color: '#ffc877', intensity: 1.1, power: 2.0, opacity: 0 }));
  figGhost.renderOrder = 1;                                  // after the dark body, so its depth hides the ghost's roots
  figGroup.add(figGhost);
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
  const callRatio = new Callout('1 : 1.618', { dx: 0.75, dy: -0.35, size: 0.1, color: HUD, sub: 'SECTIO AUREA · OVERLAY', intensity: 1.6 });
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
  const fill = new THREE.AmbientLight('#2b1d12', 0.35);
  const key = new THREE.DirectionalLight('#ffe6c4', 0); key.position.set(-2.5, 3, 5); key.target.position.set(0, -0.2, 1);
  scene.add(rim, kick, fill, key, key.target);
  const beam = lightShaft({ length: 9, radiusTop: 0.2, radiusBottom: 2.6, color: '#ffe0b0', intensity: 0.1 });
  beam.position.copy(spot.position);
  beam.lookAt(0, 0, 0); beam.rotateX(-Math.PI / 2);
  scene.add(beam);
  const dust = new Dust({ count: 1600, size: [9, 6, 8], center: [0, 0, 2], color: '#ffe2b8', particleSize: 0.02, opacity: 0.45, intensity: 1.3, seed: 77 });
  scene.add(dust);

  // ---------------------------------------------------------------- update
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), C3 = V(0, -0.2, 1.0);
  const dof = { focus: 6, range: 1.6, amount: 0 };
  const bloom = { strength: 0.75 };
  const seqProg = (t, a, b) => sat((t - a) / (b - a));
  const cSepia = new THREE.Color(SEPIA), cGold = new THREE.Color(GOLD);

  let lastT = 0, rigOp = 0, hudOp = 0, lastInk = 1;
  const hudRev = [0, 0, 0, 0, 0, 0], hudParts = [dimH, dimW, dimN, dimN2, callRatio, callProp];
  const setHud = (k) => { for (let i = 0; i < 6; i++) hudParts[i].reveal(hudRev[i], hudOp * k); };
  const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();
  const LIM_2D = { yaw: 0.8, pitchDown: 0.3, pitchUp: 0.55, zoomIn: 0.35, zoomOut: 2.2, fly: 1.2 };   // the drawing on its canvas
  const LIM_3D = { yaw: 1.2, pitchDown: 0.35, pitchUp: 0.8, zoomOut: 2.1 };                        // the lifted figure; the grid ends past that
  return {
    scene, camera, dof, bloom, exposure: 1,
    strokeCount,
    get exploreLimits() { return lastT < m3 ? LIM_2D : LIM_3D; },
    explore(t) {
      if (ctx.engine?.explore?.active || ctx.engine?.clean) bloom.strength *= 1 - 0.45 * headingDuck(ctx, this, t + segment.start);
      easel.visible = true;
      // once the canvas recedes the lit figure and its drafting grid are the set: the canvas keeps its easel
      // (off-axis it otherwise hung as a dark card in the void) but not the studio boards below the grid
      if (t >= m3) return;
      const fl = easel.userData.floor;
      fl.visible = true;
      fl.position.set(canvasRig.position.x, EASEL_FOOT, canvasRig.position.z - 0.4);
    },
    // off-axis: the flat proportion rig (gold circle and square, dimension lines, the lifting strokes) fades
    // as it turns edge-on, where its additive lines stacked into a hot vertical streak; labels face the viewer
    explorePosed(cam) {
      if (lastT < m3 - 0.1) return;
      cam.updateMatrixWorld(); figGroup.updateMatrixWorld();
      figGroup.getWorldQuaternion(_q);
      const f = smoothstep(0.15, 0.5, Math.abs(_p.setFromMatrixPosition(cam.matrixWorld).sub(_n.setFromMatrixPosition(figGroup.matrixWorld)).normalize().dot(_n.set(0, 0, 1).applyQuaternion(_q))));
      gRing.opacity = gSquare.opacity = rigOp * f;
      setHud(f);
      faceCamera(callRatio.label, cam); faceCamera(callProp.label, cam);
      const ink = lastInk * f;
      strokesA.opacity = 0.42 * ink; strokesB.opacity = 0.9 * ink; strokesC.opacity = 0.32 * ink;
      strokesP.opacity = 0.4 * ink; strokesH.opacity = 0.7 * ink; strokesT.opacity = 0.55 * ink;
    },
    update(t, info) {
      const T = info.T;
      lastT = t;
      easel.visible = easel.userData.floor.visible = false;
      // ------------------------------------------------ camera
      const lift = ramp(t, m3, m3 + 0.6, ease.inOutCubic);
      const orb = ramp(t, m3 + 0.05, pB + 0.1, ease.inOutSine);
      const push = ramp(t, pB - 0.1, 5.0, ease.inQuad);
      const approach = ramp(t, 0, m3, ease.outCubic);
      // 2D phase: slow push toward the canvas; 3D phase: orbit the lifted figure
      const d2 = lerp(8.4, 5.5, approach);
      const ang = lerp(0.07, -1.05, orb);
      const rad = lerp(d2, 4.7, lift) - push * 1.8;
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
      spot.intensity = lerp(1.2, 4.6, ramp(t, 0.05, cC + 0.1, ease.outCubic)) * (1 - 0.7 * recede);
      spot.target.position.set(lerp(-0.45, 0, lift), lerp(0.5, -0.2, lift), lerp(0, C3.z, lift));
      key.intensity = 2.4 * lift;
      canvasMat.color.setRGB(0.95, 0.92, 0.87).multiplyScalar(1 - 0.86 * recede);   // the emptied canvas settles into shadow, not a grey card
      rim.intensity = 2.8 * lift;
      kick.intensity = 1.2 * lift;
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
      strokesH.progress = seqProg(t, s0 + 0.35 * span, s0 + span);
      strokesT.progress = seqProg(t, s0 + 0.7 * span, s0 + span);
      const inkOut = 1 - ramp(t, m3 + 0.25, m3 + 0.75);
      sq1.opacity = 0.85 * inkOut * (1 - lift); sq2.opacity = 0.4 * inkOut * (1 - lift);
      ci1.opacity = 0.85 * inkOut * (1 - lift); ci2.opacity = 0.4 * inkOut * (1 - lift);
      lastInk = inkOut;
      strokesA.opacity = 0.42 * inkOut; strokesB.opacity = 0.9 * inkOut; strokesC.opacity = 0.32 * inkOut;
      strokesP.opacity = 0.4 * inkOut; strokesH.opacity = 0.7 * inkOut; strokesT.opacity = 0.55 * inkOut;
      // strokes lift off the canvas plane and glow as they go
      const lineLift = ramp(t, m3 - 0.05, m3 + 0.7, ease.inOutCubic);
      sketch.position.set(lerp(canvasRig.position.x, 0, lineLift), lerp(canvasRig.position.y, 0, lineLift), lerp(canvasRig.position.z + SURF + 0.004, C3.z + 0.02, lineLift));
      sketch.rotation.set(canvasRig.rotation.x * (1 - lineLift), canvasRig.rotation.y * (1 - lineLift), canvasRig.rotation.z * (1 - lineLift));
      const glowIn = envelope(t, m3 - 0.1, m3 + 0.8, 0.2, 0.4);
      for (const s of [strokesA, strokesB, strokesC, strokesP, strokesH, strokesT]) {
        s.material.uniforms.uColor.value.copy(cSepia).lerp(cGold, glowIn);
        s.intensity = 1 + glowIn * 1.4;
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
      const ghost = ramp(t, m3 + 0.35, m3 + 0.9, ease.inOutSine) * (1 - burst);
      figGhost.material.uniforms.uOpacity.value = ghost * 0.55;
      figGhost.visible = ghost > 0.002;
      const ringOn = ramp(t, m3 + 0.1, m3 + 0.7, ease.inOutSine);
      gRing.progress = ringOn; gSquare.progress = ringOn;
      gRing.opacity = gSquare.opacity = rigOp = (1 - ramp(t, pB, pB + 0.3)) * 0.95;
      goldRig.scale.setScalar(1 + ramp(t, pB, 5.0, ease.outCubic) * 1.5);
      // HUD / proportion diagrams
      const h0 = m3 + 0.35;
      hudRev[0] = ramp(t, h0, h0 + 0.5, ease.outCubic); hudRev[1] = ramp(t, h0 + 0.1, h0 + 0.6, ease.outCubic);
      hudRev[2] = ramp(t, h0 + 0.25, h0 + 0.75, ease.outCubic); hudRev[3] = ramp(t, h0 + 0.35, h0 + 0.85, ease.outCubic);
      hudRev[4] = ramp(t, h0 + 0.45, h0 + 0.95, ease.outCubic); hudRev[5] = ramp(t, h0 + 0.3, h0 + 0.8, ease.outCubic);
      hudOp = 1 - burst;
      setHud(1);
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
