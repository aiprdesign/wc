// ART & THE RENAISSANCE (15.5 – 20.5 s)
// Technique: procedural drawing (a Vitruvian figure defined as signed-distance
// primitives → marching-squares contours in several wobbly passes + light-driven
// cross-hatching, ~9k strokes revealed in a staged order), 2D→3D transformation (the
// strokes lift off the canvas and the very same primitives inflate into a lit 3D
// study, camera orbit with DOF through Alberti perspective grids and proportion HUD)
// and a pigment particle explosion into the 'flash'.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, clamp } from '../lib/math.js';
import { progressLine, segmentsLine, circlePoints } from '../lib/lines.js';
import { MorphParticles, Dust, sampleGeometry } from '../lib/particles.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { fresnel, lightShaft, glowSprite } from '../lib/materials.js';
import { Callout, Dimension, faceCamera } from '../lib/hud.js';
import { noise2 } from '../lib/noise.js';
import { pulse } from '../lib/rhythm.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const PHI = (1 + Math.sqrt(5)) / 2;
const SEPIA = '#5a2e16';
const CHALK = '#8a3f1f';
const EMBER = '#ff8a3a';
const GOLD = '#f2c46e';
const HUD = '#f3d08a';

// ---------------------------------------------------------------------------
// Figure: round cones (uneven capsules) + an ellipsoid head, all in the XY plane.
// Feet at y = -1.2, head top at 0.8 (height 2.0 = arm span), navel at y = 0.
function figureParts(pose = 0) {
  const P = [];
  const rc = (ax, ay, bx, by, ra, rb, flat = 1, limb = true) => P.push({ a: [ax, ay], b: [bx, by], ra, rb, flat, limb });
  // torso & neck (shared by both poses): V-shaped chest, abdomen, pelvis
  rc(0.105, 0.41, 0.07, 0.1, 0.098, 0.078, 0.6, false);
  rc(-0.105, 0.41, -0.07, 0.1, 0.098, 0.078, 0.6, false);
  rc(0, 0.36, 0, 0.12, 0.11, 0.1, 0.62, false);
  rc(0, 0.14, 0, -0.04, 0.1, 0.106, 0.66, false);
  rc(-0.2, 0.445, 0.2, 0.445, 0.062, 0.062, 0.8, false);
  rc(0, 0.5, 0, 0.6, 0.046, 0.041, 1, false);
  rc(-0.085, -0.075, 0.085, -0.075, 0.098, 0.098, 0.75, false);
  rc(0.09, -0.02, 0.09, -0.13, 0.095, 0.09, 0.75, false);
  rc(-0.09, -0.02, -0.09, -0.13, 0.095, 0.09, 0.75, false);
  if (pose === 0) {
    for (const s of [1, -1]) {
      rc(0.2 * s, 0.445, 0.31 * s, 0.447, 0.07, 0.056);
      rc(0.2 * s, 0.445, 0.52 * s, 0.45, 0.056, 0.042);
      rc(0.52 * s, 0.45, 0.8 * s, 0.452, 0.042, 0.031);
      rc(0.54 * s, 0.452, 0.66 * s, 0.452, 0.047, 0.04);
      rc(0.815 * s, 0.452, 0.975 * s, 0.456, 0.034, 0.018, 0.55);
      rc(0.085 * s, -0.12, 0.075 * s, -0.62, 0.076, 0.05);
      rc(0.075 * s, -0.62, 0.062 * s, -1.1, 0.047, 0.03);
      rc(0.077 * s, -0.68, 0.07 * s, -0.86, 0.053, 0.04);
      rc(0.062 * s, -1.13, 0.13 * s, -1.175, 0.03, 0.024, 0.8);
    }
  } else {
    const aa = 0.36;   // arms raised
    for (const s of [1, -1]) {
      const cx = 0.2 * s, cy = 0.445, dx = Math.cos(aa) * s, dy = Math.sin(aa);
      rc(cx, cy, cx + dx * 0.32, cy + dy * 0.32, 0.056, 0.044);
      rc(cx + dx * 0.32, cy + dy * 0.32, cx + dx * 0.6, cy + dy * 0.6, 0.043, 0.032);
      rc(cx + dx * 0.615, cy + dy * 0.615, cx + dx * 0.78, cy + dy * 0.78, 0.034, 0.018, 0.55);
      const la = 0.4, hx = 0.085 * s, hy = -0.12, ex = Math.sin(la) * s, ey = -Math.cos(la);
      rc(hx, hy, hx + ex * 0.5, hy + ey * 0.5, 0.076, 0.05);
      rc(hx + ex * 0.5, hy + ey * 0.5, hx + ex * 0.98, hy + ey * 0.98, 0.048, 0.031);
    }
  }
  return P;
}
const HEAD = { c: [0, 0.672], r: [0.094, 0.125] };

function sdRoundCone(px, py, part) {
  // local frame: origin at a, y along a→b
  const [ax, ay] = part.a, [bx, by] = part.b;
  const dx = bx - ax, dy = by - ay, h = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / h, uy = dy / h;
  const qx0 = px - ax, qy0 = py - ay;
  const ly = qx0 * ux + qy0 * uy, lx = Math.abs(-qx0 * uy + qy0 * ux);
  const r1 = part.ra, r2 = part.rb;
  const b = (r1 - r2) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = -b * lx + a * ly;
  if (k < 0) return Math.hypot(lx, ly) - r1;
  if (k > a * h) return Math.hypot(lx, ly - h) - r2;
  return lx * a + ly * b - r1;
}
function sdHead(px, py) {
  const x = (px - HEAD.c[0]) / HEAD.r[0], y = (py - HEAD.c[1]) / HEAD.r[1];
  return (Math.hypot(x, y) - 1) * Math.min(HEAD.r[0], HEAD.r[1]);
}
function makeSDF(parts, withHead = true) {
  return (x, y) => {
    let d = withHead ? sdHead(x, y) : 1e9;
    for (let i = 0; i < parts.length; i++) { const v = sdRoundCone(x, y, parts[i]); if (v < d) d = v; }
    return d;
  };
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

// A 3D round cone (lathe) from a to b in the XY plane, flattened in z.
function roundConeGeo(part, radial = 22) {
  const [ax, ay] = part.a, [bx, by] = part.b;
  const h = Math.hypot(bx - ax, by - ay);
  const r1 = part.ra, r2 = part.rb;
  const al = Math.asin(clamp((r1 - r2) / h, -0.99, 0.99));
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) { const th = -Math.PI / 2 + (al + Math.PI / 2) * (i / n); pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(th)), r1 * Math.sin(th))); }
  for (let i = 0; i <= n; i++) { const th = al + (Math.PI / 2 - al) * (i / n); pts.push(new THREE.Vector2(Math.max(1e-4, r2 * Math.cos(th)), h + r2 * Math.sin(th))); }
  const g = new THREE.LatheGeometry(pts, radial);
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(bx - ax, by - ay, 0).normalize());
  g.applyQuaternion(q);
  g.translate(ax, ay, 0);
  g.scale(1, 1, part.flat);
  return g;
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
  const partsA = figureParts(0), partsB = figureParts(1);
  const fA = makeSDF(partsA);
  const torsoParts = partsA.filter((p) => !p.limb);
  const fTorso = makeSDF(torsoParts);
  const limbsB = partsB.filter((p) => p.limb);
  const fLimbsB = makeSDF(limbsB, false);
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
  const hatch = [], details = [];
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
    // curls of hair around the crown + minimal facial marks (drawn last, with the ticks)
    const r = rng(19);
    for (let i = 0; i < 44; i++) {
      const a = -0.35 + (Math.PI + 0.7) * r(), k = 0.96 + r() * 0.2;
      const cx = HEAD.c[0] + Math.cos(a) * HEAD.r[0] * k, cy = HEAD.c[1] + 0.012 + Math.sin(a) * HEAD.r[1] * k;
      const cr = 0.01 + r() * 0.012, a0 = r() * Math.PI * 2;
      let px = cx + Math.cos(a0) * cr, py = cy + Math.sin(a0) * cr;
      for (let j = 1; j <= 5; j++) { const aa = a0 + j * 0.9; const qx = cx + Math.cos(aa) * cr, qy = cy + Math.sin(aa) * cr; details.push([V(px, py), V(qx, qy)]); px = qx; py = qy; }
    }
    const fy = HEAD.c[1];
    details.push([V(-0.052, fy + 0.012), V(-0.02, fy + 0.014)], [V(0.02, fy + 0.014), V(0.052, fy + 0.012)]);
    details.push([V(0.002, fy - 0.004), V(0.008, fy - 0.045)], [V(0.008, fy - 0.045), V(-0.008, fy - 0.05)]);
    details.push([V(-0.022, fy - 0.075), V(0.022, fy - 0.075)]);
    layer(-Math.PI / 3, 0.022, 0.86, 0.05, 11);
  }
  const strokesH = segmentsLine(hatch, inkOpts(SEPIA, 0.7, { orderFn: (a, b) => (1 - ((a.y + b.y) / 2 - BY0) / (BY1 - BY0)) * 0.55 + R() * 0.3, stagger: 0.9, head: 0.02 }));
  // proportion ticks across the figure (head, chin, chest, navel, groin, knees)
  const ticks = [];
  for (const y of [0.8, 0.55, 0.3, 0.0, -0.2, -0.7, -1.2]) ticks.push([V(-0.22, y), V(0.22, y)]);
  for (const x of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75]) ticks.push([V(x, 0.4), V(x, 0.5)]);
  const nTicks = ticks.length;
  ticks.push(...details);
  const strokesT = segmentsLine(ticks, inkOpts(SEPIA, 0.55, { orderFn: (a, b, i) => (i < nTicks ? i / nTicks * 0.3 : 0.25 + R() * 0.4), stagger: 0.7 }));
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
  handLine('Vitruvio architecto mette nella sua opera d’architectura', 1.42);
  handLine('che le misure dell’omo sono dalla natura distribuite', 1.3);
  handLine('tanto apre l’omo nelle braccia quanto è la sua altezza', -1.4);
  hand.forEach((h) => { h.material.uniforms.uColor.value.set('#4a2812'); });
  const strokeCount = segA.length + segB.length + segC.length + segP.length + hatch.length + ticks.length;

  // ---------------------------------------------------------------- 3D figure (same primitives)
  const figGroup = new THREE.Group();
  scene.add(figGroup);
  const figGeo = (() => {
    const parts = partsA.map((p) => roundConeGeo(p));
    const head = new THREE.SphereGeometry(1, 32, 20); head.scale(HEAD.r[0], HEAD.r[1], 0.11); head.translate(HEAD.c[0], HEAD.c[1], 0);
    parts.push(head);
    const clean = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; });
    const m = mergeGeometries(clean);
    m.computeVertexNormals();
    return m;
  })();
  // a silhouette, not a portrait: near-black form defined only by its gold rim light
  const figMat = new THREE.MeshStandardMaterial({ color: '#0d0b09', roughness: 0.85, metalness: 0, transparent: true, opacity: 0 });
  const figMesh = new THREE.Mesh(figGeo, figMat);
  const figRim = new THREE.Mesh(figGeo, fresnel({ color: '#ffc877', intensity: 2.0, power: 2.2, opacity: 0 }));
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
