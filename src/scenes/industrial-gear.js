// Shared hard-surface kit for the science / industrial / electricity sequences:
// involute spur gears (ExtrudeGeometry of a toothed Shape with spokes, bore and bevel),
// lathe-turned metal textures and a few PBR presets tuned for macro shots.
import * as THREE from 'three';
import { rng } from '../lib/math.js';

const inv = (a) => Math.tan(a) - a;

// Toothed outline (THREE.Shape) of an involute spur gear.
//   teeth z, module m (pitch radius = m·z/2), pressure angle 20°.
//   hub: bore radius, spokes: count of spokes (0 = solid web with round lightening holes)
export function gearShape({ teeth = 24, module = 0.1, bore = 0.25, spokes = 5, rimFrac = 0.78, hubFrac = 0.34, flankSteps = 4, holes = true } = {}) {
  const z = teeth, m = module;
  const r = (m * z) / 2, ra = r + m, rr = Math.max(r - 1.25 * m, m * 0.5);
  const alpha = (20 * Math.PI) / 180, rb = r * Math.cos(alpha);
  const invP = inv(alpha);
  const half = (R) => {
    // angular half-thickness of the tooth at radius R
    if (R <= rb) return Math.PI / (2 * z) + invP;
    const aR = Math.acos(rb / R);
    return Math.PI / (2 * z) + invP - inv(aR);
  };
  const pts = [];
  const r0 = Math.max(rr, rb * 0.999);
  for (let i = 0; i < z; i++) {
    const c = (i / z) * Math.PI * 2;
    // root arc leading into this tooth
    const prevEnd = c - (Math.PI * 2) / z + half(rr), thisStart = c - half(rr);
    for (let k = 1; k <= 2; k++) {
      const a = prevEnd + ((thisStart - prevEnd) * k) / 3;
      pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
    }
    // leading flank (root → tip)
    for (let k = 0; k <= flankSteps; k++) {
      const R = k === 0 ? rr : r0 + ((ra - r0) * k) / flankSteps;
      const a = c - half(R);
      pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    }
    // trailing flank (tip → root)
    for (let k = flankSteps; k >= 0; k--) {
      const R = k === 0 ? rr : r0 + ((ra - r0) * k) / flankSteps;
      const a = c + half(R);
      pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R));
    }
  }
  const shape = new THREE.Shape(pts);
  if (bore > 0) {
    const h = new THREE.Path(); h.absarc(0, 0, bore, 0, Math.PI * 2, true); shape.holes.push(h);
  }
  if (holes && spokes > 0) {
    const rin = Math.max(r * hubFrac, bore + m * 1.4), rout = rr * rimFrac;
    if (rout - rin > m * 1.2) {
      const spokeW = Math.max(m * 1.1, r * 0.09);
      for (let s = 0; s < spokes; s++) {
        const a0 = (s / spokes) * Math.PI * 2, a1 = ((s + 1) / spokes) * Math.PI * 2;
        const pin = spokeW / 2 / rin, pout = spokeW / 2 / rout;
        const p = new THREE.Path();
        p.moveTo(Math.cos(a0 + pin) * rin, Math.sin(a0 + pin) * rin);
        p.absarc(0, 0, rout, a0 + pout, a1 - pout, false);
        p.lineTo(Math.cos(a1 - pin) * rin, Math.sin(a1 - pin) * rin);
        p.absarc(0, 0, rin, a1 - pin, a0 + pin, true);
        shape.holes.push(p);
      }
    }
  }
  shape.userData = { r, ra, rr, rb };
  return shape;
}

// Extruded, bevelled gear centred on z. UVs of the caps map to [0,1] over the tip diameter
// so a lathe texture reads as concentric machining marks.
export function gearGeometry(opts = {}) {
  const { thickness = 0.12, bevel = 0.012, curveSegments = 10, bevelSegments = 2 } = opts;
  const shape = gearShape(opts);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, curveSegments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments, steps: 1,
  });
  g.translate(0, 0, -thickness / 2);
  const ra = shape.userData.ra + bevel;
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / (2 * ra) + 0.5, pos.getY(i) / (2 * ra) + 0.5);
  g.computeVertexNormals();
  g.userData = { ...shape.userData, teeth: opts.teeth ?? 24, module: opts.module ?? 0.1 };
  return g;
}

// Pitch radius helper.
export const pitchRadius = (teeth, module) => (teeth * module) / 2;

// Angle of a driven gear meshing with a driver whose current angle is thetaA.
// Centres: driven sits at polar angle `dir` from the driver at distance rA + rB.
// Tooth i of a gear lies at angle theta + 2πi/z; at contact a tooth of A faces a gap of B.
export function meshAngle(thetaA, zA, zB, dir) {
  const k = zA / zB;
  return -thetaA * k + dir * (1 + k) + Math.PI + Math.PI / zB;
}

// ---------------------------------------------------------------------------
const texCache = new Map();

// Lathe-turned concentric machining marks (greyscale). Use as roughnessMap/bumpMap on gear caps.
export function latheTexture(size = 512, seed = 3) {
  const key = `lathe${size}${seed}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a8a8a'; ctx.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (let i = 0; i < size * 0.9; i++) {
    const rad = (i / (size * 0.9)) * size * 0.72, l = 110 + r() * 110;
    ctx.strokeStyle = `rgba(${l},${l},${l},${0.25 + r() * 0.35})`;
    ctx.lineWidth = 0.6 + r() * 1.4;
    ctx.beginPath(); ctx.arc(size / 2, size / 2, rad, 0, Math.PI * 2); ctx.stroke();
  }
  // a few fine scratches
  for (let i = 0; i < 60; i++) {
    const l = 150 + r() * 80; ctx.strokeStyle = `rgba(${l},${l},${l},0.12)`; ctx.lineWidth = 0.5;
    const x = r() * size, y = r() * size, a = r() * Math.PI, L = 20 + r() * 80;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8; t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

// Fine noise/grain texture for cast iron, bakelite, walnut etc. kind: 'cast' | 'walnut' | 'bakelite'
export function surfaceTexture(kind = 'cast', size = 512, seed = 5) {
  const key = `surf${kind}${size}${seed}`;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const r = rng(seed);
  if (kind === 'walnut') {
    ctx.fillStyle = '#5a3620'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 260; i++) {
      const y = r() * size, amp = 3 + r() * 10, f = 0.004 + r() * 0.01, ph = r() * 6.28;
      const l = r();
      ctx.strokeStyle = l > 0.5 ? `rgba(40,20,10,${0.15 + r() * 0.3})` : `rgba(140,90,55,${0.08 + r() * 0.18})`;
      ctx.lineWidth = 0.6 + r() * 2.5;
      ctx.beginPath();
      for (let x = 0; x <= size; x += 8) { const yy = y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.3; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
    }
  } else {
    const base = kind === 'bakelite' ? 22 : 70;
    const img = ctx.createImageData(size, size); const d = img.data;
    for (let i = 0; i < size * size; i++) {
      const v = base + (r() - 0.5) * (kind === 'bakelite' ? 10 : 50);
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (kind === 'cast') {
      for (let i = 0; i < 400; i++) { const l = 40 + r() * 90; ctx.fillStyle = `rgba(${l},${l},${l},0.25)`; ctx.beginPath(); ctx.arc(r() * size, r() * size, 1 + r() * 5, 0, 6.28); ctx.fill(); }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (kind === 'walnut') t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

// PBR presets
export function brassMat({ roughness = 0.24, color = '#c9a063', lathe = false } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  if (lathe) { m.roughnessMap = latheTexture(); m.bumpMap = latheTexture(); m.bumpScale = 0.4; }
  return m;
}
export function steelMat({ roughness = 0.3, color = '#b9c1ca', lathe = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness });
  if (lathe) { m.roughnessMap = latheTexture(512, 7); m.bumpMap = latheTexture(512, 7); m.bumpScale = 0.5; }
  return m;
}
export function ironMat({ roughness = 0.62, color = '#51555b' } = {}) {
  const t = surfaceTexture('cast');
  return new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness, roughnessMap: t, bumpMap: t, bumpScale: 0.6 });
}
