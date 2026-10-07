// THE PATH OF PEACE — procedural models for src/scenes/india/dharma.js (build time only).
//   · the Lion Capital of Ashoka (Sarnath): inverted-lotus bell, cable neck, abacus drum with its four
//     24-spoke wheels and four animals in low relief (elephant, bull, horse, lion), four seated lions
//     back to back (signed-distance sculpture, surface-nets mesher)
//   · the Ashoka Chakra (24 spokes) as a gold hero wheel
//   · a standing charkha (spinning wheel): laced double-spoke wheel, drive band, spindle, yarn
//   · an abstract Brahmi-like inscription (canvas: mask + reveal order), India's flag
//   · a column of walking figures (merged geometry, gait driven in the vertex shader)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sdfBody, meshBody } from '../../lib/sdfmesh.js';
import { rng, sat, lerp } from '../../lib/math.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------- geometry utils
// position + normal only, non-indexed, so parts of any origin merge
export function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  n.morphAttributes = {};
  return n;
}
const ell = (c, r, k = 0, ang = 0) => ({ type: 'ell', c, r, k, ang });
const cone = (a, b, ra, rb, k = 0, flat = 1) => ({ type: 'cone', a, b, ra, rb, k, flat });

// A part authored flat (x along the surface, y up, z out of it) wrapped onto a drum of radius R, centred on
// the azimuth a0 (azimuth measured from +z towards +x).
export function bendOnDrum(g, R, a0) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = a0 + x / R, r = R + z;
    p.setXYZ(i, Math.sin(a) * r, y, Math.cos(a) * r);
    if (n) { const nx = n.getX(i), nz = n.getZ(i); n.setXYZ(i, Math.cos(a) * nx + Math.sin(a) * nz, n.getY(i), -Math.sin(a) * nx + Math.cos(a) * nz); }
  }
  p.needsUpdate = true;
  return g;
}

// A surface of revolution r(θ, y) on a grid (wrapping round θ, so no seam), smooth normals.
function revolveGrid(ys, NA, rad) {
  const pos = [], idx = [];
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < NA; i++) {
    const a = i / NA * TAU, r = rad(a, ys[j], j);
    pos.push(Math.sin(a) * r, ys[j], Math.cos(a) * r);
  }
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < NA; i++) {
    const a = j * NA + i, b = j * NA + (i + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// --------------------------------------------------------------------------------------------- the capital
// Local frame: the top of the shaft is y = 0; lions face ±x / ±z; the 'front' lion faces +z.
export const CAP = {
  shaftR: 0.33,          // shaft radius at the top
  bellTop: 0.6,
  abacusY0: 0.7, abacusY1: 0.98, abacusR: 0.43,
  wheelY: 0.84, wheelR: 0.092,
  lionScale: 1.0,
};

// inverted lotus bell: 20 hanging petals with a central rib, turned out at the tips
function bellGeometry(lite) {
  const N = 20, NA = lite ? 160 : 240;
  const ys = [];
  for (let j = 0; j <= (lite ? 40 : 60); j++) { const u = j / (lite ? 40 : 60); ys.push(CAP.bellTop * Math.pow(u, 1.25)); }
  const g = revolveGrid(ys, NA, (a, y) => {
    const u = y / CAP.bellTop;
    let r = 0.262 + 0.148 * Math.pow(1 - u, 1.7);
    const phi = ((a / TAU) * N) % 1 - 0.5;                   // −0.5 … 0.5 across a petal
    const hw = 0.47 * Math.min(1, Math.sqrt(Math.max(0, u - 0.004) / 0.085));   // rounded petal tip at the bottom
    const amp = 0.02 * (1 - 0.55 * u) * (1 - sat((u - 0.86) / 0.14));
    if (Math.abs(phi) < hw) {
      const q = phi / hw;
      r += amp * Math.sqrt(1 - q * q) + 0.0035 * Math.exp(-((phi / 0.035) ** 2)) * (1 - u);
      r += 0.013 * Math.pow(sat(1 - u / 0.07), 2) * Math.sqrt(1 - q * q);   // the tip turns out
    }
    return r;
  });
  // underside: a flat ring from the shaft into the bell's lip
  const under = new THREE.RingGeometry(CAP.shaftR - 0.01, 0.4, 96, 1); under.rotateX(Math.PI / 2); under.translate(0, 0.0005, 0);
  return mergeGeometries([prep(g), prep(under)]);
}

// cable (rope) moulding round the neck, a plain band, and the abacus drum with fillets
function neckGeometry(lite) {
  const parts = [];
  const NA = lite ? 160 : 256, NM = 14;
  {
    // twisted torus: the tube radius swells along diagonal strands
    const R0 = 0.272, rt = 0.026, pos = [], idx = [];
    for (let i = 0; i < NA; i++) for (let j = 0; j < NM; j++) {
      const a = i / NA * TAU, b = j / NM * TAU;
      const rr = rt + 0.006 * Math.pow(Math.abs(Math.sin(a * 46 + b)), 0.6);
      const r = R0 + Math.cos(b) * rr;
      pos.push(Math.sin(a) * r, 0.618 + Math.sin(b) * rr, Math.cos(a) * r);
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NM; j++) {
      const a = i * NM + j, b = ((i + 1) % NA) * NM + j, c = i * NM + (j + 1) % NM, d = ((i + 1) % NA) * NM + (j + 1) % NM;
      idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    parts.push(prep(g));
  }
  const lathe = (pts, seg = 128) => { const g = new THREE.LatheGeometry(pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]).map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return prep(g); };
  parts.push(lathe([[0.2, 0.6], [0.262, 0.6], [0.262, 0.6], [0.262, 0.64], [0.25, 0.645], [0.25, 0.69], [0.25, 0.69], [0.4, 0.69], [0.4, 0.69], [0.438, 0.693], [0.44, 0.708], [0.43, 0.712], [0.43, 0.712],
    [0.43, 0.97], [0.43, 0.97], [0.44, 0.972], [0.442, 0.985], [0.43, 0.99], [0.43, 0.99], [0.03, 0.99]], 160));
  const cap = new THREE.CircleGeometry(0.035, 12); cap.rotateX(-Math.PI / 2); cap.translate(0, 0.99, 0); parts.push(prep(cap));
  return mergeGeometries(parts);
}

// 24-spoke wheel authored flat (facing +z), radius 1
export function wheelParts({ spokes = 24, rimIn = 0.84, rimOut = 1, hub = 0.17, depth = 0.1, lobes = true, lo = false } = {}) {
  const parts = [];
  const ring = new THREE.Shape(); ring.absarc(0, 0, rimOut, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, rimIn, 0, TAU, true); ring.holes.push(hole);
  const rg = new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: 0.02, bevelSegments: lo ? 1 : 2, curveSegments: lo ? 40 : 96 });
  rg.translate(0, 0, -depth / 2); parts.push(prep(rg));
  // spokes: slender lozenges, widest a third of the way out
  const sp = new THREE.Shape(), r0 = hub * 0.9, r1 = rimIn + 0.01, w = 0.032;
  sp.moveTo(r0, 0); sp.quadraticCurveTo(lerp(r0, r1, 0.3), w * 1.3, r1, w * 0.45); sp.lineTo(r1, -w * 0.45); sp.quadraticCurveTo(lerp(r0, r1, 0.3), -w * 1.3, r0, 0);
  const sg = new THREE.ExtrudeGeometry(sp, { depth: depth * 0.6, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: 0.006, bevelSegments: 1, curveSegments: lo ? 3 : 8 });
  sg.translate(0, 0, -depth * 0.3);
  const spk = prep(sg);
  for (let i = 0; i < spokes; i++) parts.push(spk.clone().rotateZ(i / spokes * TAU));
  // hub: a boss with a ring round it
  const hb = new THREE.CylinderGeometry(hub, hub, depth * 1.4, lo ? 16 : 48); hb.rotateX(Math.PI / 2); parts.push(prep(hb));
  const hr = new THREE.TorusGeometry(hub, depth * 0.22, lo ? 5 : 8, lo ? 16 : 48); hr.translate(0, 0, depth * 0.5); parts.push(prep(hr));
  const hc = new THREE.SphereGeometry(hub * 0.55, lo ? 10 : 20, lo ? 5 : 10); hc.scale(1, 1, 0.6); hc.translate(0, 0, depth * 0.7); parts.push(prep(hc));
  // little lobes on the inner rim between the spokes (as on the flag's chakra)
  if (lobes) for (let i = 0; i < spokes; i++) {
    const a = (i + 0.5) / spokes * TAU, l = new THREE.CylinderGeometry(0.032, 0.032, depth * 0.8, 12, 1, false, 0, Math.PI);
    l.rotateX(Math.PI / 2); l.rotateZ(a + Math.PI); l.translate(Math.cos(a) * rimIn, Math.sin(a) * rimIn, 0); parts.push(prep(l));
  }
  return mergeGeometries(parts);
}

// the four animals of the abacus in low relief (x along the drum, facing +x; y up; z out of the surface)
function animalPrims(kind) {
  const L = (x0, y0, x1, y1, ra, rb, k = 0.006) => cone([x0, y0, 0], [x1, y1, 0], ra * 1.3, rb * 1.3, k * 1.3, 0.55);
  const E = (x, y, rx, ry, rz, k = 0.008, ang = 0) => ell([x, y, 0], [rx * 1.05, ry * 1.08, Math.max(rz, 0.03)], k * 1.2, ang);
  if (kind === 'elephant') return [
    E(0, 0.098, 0.082, 0.052, 0.026, 0), E(-0.02, 0.118, 0.06, 0.04, 0.026), E(0.083, 0.112, 0.042, 0.044, 0.028),
    E(0.064, 0.112, 0.026, 0.036, 0.036, 0.004),                                              // ear, standing proud
    L(0.112, 0.105, 0.13, 0.055, 0.017, 0.012), L(0.13, 0.055, 0.124, 0.012, 0.012, 0.008),     // trunk
    L(0.108, 0.082, 0.138, 0.07, 0.006, 0.004, 0.003),                                          // tusk
    L(-0.058, 0.07, -0.06, 0.004, 0.019, 0.017), L(-0.03, 0.07, -0.028, 0.004, 0.018, 0.016),
    L(0.035, 0.07, 0.04, 0.004, 0.019, 0.017), L(0.062, 0.07, 0.066, 0.004, 0.018, 0.016),
    L(-0.082, 0.11, -0.092, 0.05, 0.005, 0.003, 0.003),
  ];
  if (kind === 'bull') return [
    E(0, 0.085, 0.078, 0.04, 0.025, 0), E(0.046, 0.128, 0.03, 0.026, 0.026, 0.012),           // body, hump
    E(0.078, 0.082, 0.032, 0.046, 0.024, 0.012), E(0.108, 0.098, 0.03, 0.021, 0.023, 0.01, -0.55),   // neck/dewlap, head
    L(0.104, 0.118, 0.112, 0.15, 0.006, 0.003, 0.003), L(0.094, 0.118, 0.098, 0.146, 0.005, 0.003, 0.003),   // horns
    L(-0.058, 0.07, -0.06, 0.003, 0.012, 0.008), L(-0.035, 0.07, -0.03, 0.003, 0.011, 0.008),
    L(0.05, 0.07, 0.054, 0.003, 0.012, 0.008), L(0.07, 0.07, 0.078, 0.003, 0.011, 0.008),
    L(-0.078, 0.1, -0.09, 0.03, 0.004, 0.003, 0.003), E(-0.09, 0.028, 0.006, 0.01, 0.008, 0.003),
  ];
  if (kind === 'horse') return [
    E(0, 0.1, 0.082, 0.042, 0.026, 0), E(-0.045, 0.104, 0.04, 0.04, 0.026, 0.02),
    L(0.055, 0.11, 0.09, 0.15, 0.028, 0.019, 0.012), E(0.11, 0.146, 0.036, 0.017, 0.022, 0.01, -0.75),   // neck, head
    E(0.07, 0.142, 0.03, 0.008, 0.026, 0.004, 0.8),                                              // mane crest
    L(0.052, 0.088, 0.09, 0.05, 0.011, 0.008), L(0.09, 0.05, 0.124, 0.046, 0.008, 0.006, 0.004),  // forelegs, galloping
    L(0.044, 0.085, 0.066, 0.045, 0.011, 0.008), L(0.066, 0.045, 0.088, 0.058, 0.008, 0.006, 0.004),
    L(-0.052, 0.09, -0.088, 0.046, 0.013, 0.009), L(-0.088, 0.046, -0.122, 0.022, 0.009, 0.006, 0.004),
    L(-0.046, 0.088, -0.062, 0.04, 0.012, 0.008), L(-0.062, 0.04, -0.094, 0.018, 0.008, 0.006, 0.004),
    L(-0.07, 0.112, -0.112, 0.094, 0.009, 0.004, 0.006),
  ];
  return [                                                                                       // lion, walking
    E(0, 0.088, 0.072, 0.033, 0.024, 0), E(0.062, 0.108, 0.036, 0.046, 0.03, 0.012), E(0.094, 0.108, 0.026, 0.022, 0.026, 0.008),
    E(0.116, 0.1, 0.013, 0.011, 0.018, 0.004),
    L(-0.052, 0.075, -0.056, 0.004, 0.012, 0.009), L(-0.028, 0.075, -0.022, 0.004, 0.011, 0.009),
    L(0.045, 0.075, 0.05, 0.004, 0.012, 0.009), L(0.068, 0.075, 0.074, 0.004, 0.011, 0.009),
    L(-0.068, 0.1, -0.1, 0.122, 0.004, 0.003, 0.003), L(-0.1, 0.122, -0.108, 0.145, 0.003, 0.003, 0.002), E(-0.108, 0.15, 0.009, 0.011, 0.012, 0.004),
  ];
}

// The seated lion facing +z, rear at the centre of the capital, standing on y = 0 (the top of the abacus).
function lionPrims() {
  const P = [];
  for (const s of [-1, 1]) {
    P.push(cone([s * 0.1, 0.12, 0.0], [s * 0.112, 0.045, 0.13], 0.06, 0.04, 0.04));               // folded hind leg
    P.push(ell([s * 0.098, 0.18, 0.0], [0.075, 0.14, 0.15], 0.05));                                // haunch
    P.push(ell([s * 0.116, 0.034, 0.17], [0.044, 0.032, 0.08], 0.03));                             // hind paw
    P.push(ell([s * 0.088, 0.36, 0.215], [0.05, 0.075, 0.06], 0.04));                              // elbow / shoulder
    P.push(cone([s * 0.078, 0.4, 0.24], [s * 0.08, 0.08, 0.298], 0.06, 0.044, 0.04));              // foreleg
    P.push(cone([s * 0.08, 0.1, 0.3], [s * 0.08, 0.04, 0.322], 0.045, 0.042, 0.02));
    P.push(ell([s * 0.08, 0.034, 0.34], [0.052, 0.035, 0.06], 0.025));                             // forepaw
    for (const t of [-1.5, -0.5, 0.5, 1.5]) P.push(ell([s * 0.08 + t * 0.019, 0.022, 0.387], [0.012, 0.018, 0.017], 0.006));   // toes
    P.push(ell([s * 0.062, 0.79, 0.325], [0.05, 0.055, 0.05], 0.02));                             // cheeks
    P.push(ell([s * 0.033, 0.798, 0.405], [0.034, 0.03, 0.028], 0.012));                           // whisker pads
    P.push(ell([s * 0.04, 0.869, 0.358], [0.038, 0.017, 0.03], 0.01, s * 0.3));                    // brow ridges
    P.push(ell([s * 0.044, 0.849, 0.366], [0.014, 0.01, 0.01], 0.004));                            // eyes
    P.push(ell([s * 0.08, 0.93, 0.25], [0.026, 0.03, 0.016], 0.01));                               // ears
  }
  P.push(ell([0, 0.36, 0.05], [0.12, 0.2, 0.17], 0.05));                                           // torso
  P.push(ell([0, 0.47, 0.19], [0.128, 0.17, 0.12], 0.06));                                          // chest
  P.push(ell([0, 0.67, 0.13], [0.168, 0.25, 0.155], 0.05));                                         // mane mass
  P.push(ell([0, 0.835, 0.265], [0.108, 0.1, 0.1], 0.03));                                         // cranium
  P.push(ell([0, 0.88, 0.33], [0.07, 0.035, 0.04], 0.02));                                          // forehead
  P.push(ell([0, 0.8, 0.375], [0.064, 0.048, 0.06], 0.02));                                         // muzzle
  P.push(cone([0, 0.885, 0.33], [0, 0.835, 0.42], 0.034, 0.025, 0.02));                             // nose bridge
  P.push(ell([0, 0.828, 0.433], [0.026, 0.017, 0.014], 0.008));                                     // nose pad
  P.push(cone([0, 0.716, 0.29], [0, 0.726, 0.36], 0.034, 0.026, 0.02));                             // throat → chin
  P.push(ell([0, 0.728, 0.372], [0.045, 0.02, 0.05], 0.008));                                       // lower jaw (the mouth stands open)
  // the ruff: a ring of locks framing the face
  for (let k = 0; k < 16; k++) {
    const f = k / 16 * TAU, cx = Math.cos(f), cy = Math.sin(f);
    const p = [cx * 0.128, 0.815 + cy * 0.125, 0.3 - 0.02 * Math.abs(cy)];
    P.push(cone(p, [p[0] + cx * 0.05, p[1] + cy * 0.05 - 0.012, p[2] - 0.035], 0.03, 0.009, 0.012));
  }
  // the mane: tiers of flame-like locks hanging down, brick-bonded, wrapping round to the neighbours
  for (let j = 0; j < 7; j++) {
    const y = 0.905 - j * 0.066, s = Math.sqrt(Math.max(0.05, 1 - ((y - 0.67) / 0.27) ** 2));
    const n = 13, off = (j % 2) * 0.5;
    for (let i = 0; i < n; i++) {
      const th = ((i + off) / (n - 1) - 0.5) * 2 * 2.3;
      if (j < 3 && Math.abs(th) < 0.62) continue;                                                  // the face
      const ox = Math.sin(th), oz = Math.cos(th);
      const x = ox * 0.172 * s, z = 0.13 + oz * 0.158 * s;
      const len = 0.075 - j * 0.002;
      P.push(cone([x - ox * 0.004, y + 0.026, z - oz * 0.004], [x + ox * 0.026, y - len, z + oz * 0.026], 0.029, 0.007, 0.012));
    }
  }
  return P;
}

export function capitalGeometries(lite) {
  const R = CAP.abacusR;
  // abacus wheels (stone, in relief), at the four lions' feet
  const wheelFlat = wheelParts({ depth: 0.12, lobes: false, lo: true });
  wheelFlat.scale(CAP.wheelR, CAP.wheelR, CAP.wheelR); wheelFlat.translate(0, CAP.wheelY, 0.004);
  const wheels = [0, 1, 2, 3].map((k) => bendOnDrum(wheelFlat.clone(), R, k * Math.PI / 2));
  // animals between them: bull to the right of the front wheel, horse to the left, then elephant, lion
  const kinds = [['bull', 1, 1], ['elephant', 3, 1], ['lion', 5, 1], ['horse', 7, -1]];
  const animals = kinds.map(([kind, slot, dir]) => {
    const prims = animalPrims(kind).map((p) => (dir > 0 ? p : p.type === 'ell'
      ? { ...p, c: [-p.c[0], p.c[1], p.c[2]], ang: -(p.ang ?? 0) } : { ...p, a: [-p.a[0], p.a[1], p.a[2]], b: [-p.b[0], p.b[1], p.b[2]] }));
    const n = prep(meshBody(sdfBody(prims), [-0.175, -0.014, -0.012], [0.175, 0.205, 0.05], lite ? 0.0075 : 0.0058));
    n.scale(1.1, 1.1, 1.0); n.translate(0, CAP.abacusY0 + 0.03, 0);
    // (the animals walk sunwise round the drum: each faces away from the wheel at the front lion's feet)
    return bendOnDrum(n, R, slot * Math.PI / 4);
  });
  const lion = meshBody(sdfBody(lionPrims()), [-0.235, 0.0, -0.17], [0.235, 0.96, 0.46], lite ? 0.017 : 0.0125);
  const lions = [0, 1, 2, 3].map((k) => { const g = lion.clone(); g.rotateY(k * Math.PI / 2); g.translate(0, CAP.abacusY1 - 0.004, 0); return g; });
  return {
    bell: bellGeometry(lite),
    neck: neckGeometry(lite),
    reliefs: mergeGeometries([...wheels, ...animals]),
    lions: mergeGeometries(lions),
  };
}

// --------------------------------------------------------------------------------------------- the charkha
// Standing charkha, wheel centre at the origin, axle along z, the base running out along +x to the spindle.
export const CHARKHA = { R: 0.55, spindle: V3(1.32, -0.36, 0), pulleyR: 0.035 };
export function charkhaGeometries() {
  const R = CHARKHA.R, wood = [], cord = [], metal = [];
  // two hubs on the axle, each with 8 spokes, the rear set turned half a spoke
  for (const [z, off] of [[-0.075, 0], [0.075, 0.5]]) {
    const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 20); hub.rotateX(Math.PI / 2); hub.translate(0, 0, z); wood.push(prep(hub));
    for (let i = 0; i < 8; i++) {
      const a = (i + off) / 8 * TAU;
      const sp = new THREE.CylinderGeometry(0.011, 0.016, R - 0.04, 8); sp.translate(0, (R - 0.04) / 2 + 0.03, 0); sp.rotateZ(a - Math.PI / 2);
      sp.translate(0, 0, z); wood.push(prep(sp));
      const tip = new THREE.SphereGeometry(0.017, 10, 6); tip.translate(Math.cos(a) * (R - 0.005), Math.sin(a) * (R - 0.005), z); wood.push(prep(tip));
    }
  }
  const axle = new THREE.CylinderGeometry(0.018, 0.018, 0.42, 12); axle.rotateX(Math.PI / 2); axle.translate(0, 0, 0.02); metal.push(prep(axle));
  // the laced rim: cord zig-zagging between the tips of the two spoke sets
  const lace = [];
  for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU, z = i % 2 ? 0.075 : -0.075; lace.push(V3(Math.cos(a) * R, Math.sin(a) * R, z)); }
  for (let i = 0; i < 16; i++) cord.push(prep(new THREE.TubeGeometry(new THREE.LineCurve3(lace[i], lace[i + 1]), 1, 0.005, 5)));
  // crank on the front end of the axle
  const arm = new THREE.BoxGeometry(0.03, 0.17, 0.025); arm.translate(0, -0.07, 0.24); wood.push(prep(arm));
  const handle = new THREE.CylinderGeometry(0.014, 0.014, 0.09, 10); handle.rotateX(Math.PI / 2); handle.translate(0, -0.145, 0.285); wood.push(prep(handle));
  return { wood: mergeGeometries(wood), cord: mergeGeometries(cord), metal: mergeGeometries(metal) };
}
// the static frame: base plank, uprights, spindle block, spindle, and the drive band round wheel and pulley
export function charkhaFrame() {
  const R = CHARKHA.R, S = CHARKHA.spindle, wood = [], cord = [], metal = [];
  const baseY = -R - 0.1;
  const plank = new THREE.BoxGeometry(2.05, 0.05, 0.36); plank.translate(0.42, baseY, 0); wood.push(prep(plank));
  for (const z of [-0.16, 0.16]) {
    const post = new THREE.BoxGeometry(0.06, R + 0.12, 0.05); post.translate(0, baseY + (R + 0.12) / 2, z); wood.push(prep(post));
    const brace = new THREE.BoxGeometry(0.36, 0.035, 0.04); brace.rotateZ(0.6); brace.translate(0.12, baseY + 0.12, z); wood.push(prep(brace));
  }
  const blockH = S.y - baseY + 0.06;
  const block = new THREE.BoxGeometry(0.08, blockH, 0.22); block.translate(S.x, baseY + blockH / 2, 0); wood.push(prep(block));
  const sp = new THREE.CylinderGeometry(0.006, 0.0035, 0.42, 8); sp.rotateX(Math.PI / 2); sp.translate(S.x, S.y, 0.1); metal.push(prep(sp));
  const pul = new THREE.CylinderGeometry(CHARKHA.pulleyR, CHARKHA.pulleyR, 0.03, 16); pul.rotateX(Math.PI / 2); pul.translate(S.x, S.y, 0); wood.push(prep(pul));
  // drive band: the external tangents of the two circles, joined by arcs (in the wheel's plane, z = 0)
  const d = Math.hypot(S.x, S.y), base = Math.atan2(S.y, S.x), al = Math.acos((R - CHARKHA.pulleyR) / d);
  const pts = [];
  for (let i = 0; i <= 48; i++) { const a = base + al + (TAU - 2 * al) * i / 48; pts.push(V3(Math.cos(a) * (R + 0.006), Math.sin(a) * (R + 0.006), 0)); }
  for (let i = 0; i <= 10; i++) { const a = base - al + 2 * al * i / 10; pts.push(V3(S.x + Math.cos(a) * (CHARKHA.pulleyR + 0.004), S.y + Math.sin(a) * (CHARKHA.pulleyR + 0.004), 0)); }
  cord.push(prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 140, 0.0045, 5, true)));
  return { wood: mergeGeometries(wood), cord: mergeGeometries(cord), metal: mergeGeometries(metal), baseY };
}

// --------------------------------------------------------------------------------------- the inscription
// Abstract Brahmi-like script: strokes, crosses, arcs and hooks with little vowel ticks — no real text.
// R: stroke coverage, G: coverage × reveal order (line by line, left to right). order = G / R.
// An abstract inscription in the manner of Ashokan Brahmi (not a readable text): letters built from straight
// strokes, right angles, dots, circles and half-circles at one stroke weight, with vowel ticks at the head
// or the foot, in neat horizontal lines without word gaps. Returns a canvas whose channels are
//   R = groove depth (a V-section, deepest along the stroke centre), G = reveal order × mask, B = mask.
const BRAHMI = [
  // [strokes, top anchor u, bottom anchor u]; strokes: ['l', u0,v0,u1,v1] | ['c', u,v,r] | ['a', u,v,r,a0,a1] | ['d', u,v]
  [[['l', .5, 0, .5, 1], ['l', .1, .42, .9, .42]], .5, .5],                                   // ka  +
  [[['l', .12, 1, .5, 0], ['l', .5, 0, .88, 1]], .5, .88],                                     // ga  Λ
  [[['l', .25, 0, .25, 1], ['l', .25, 0, .82, 0], ['l', .25, .5, .74, .5], ['l', .25, 1, .82, 1]], .25, .25],   // ja
  [[['a', .62, .5, .44, Math.PI / 2, Math.PI * 1.5]], .62, .62],                               // ṭa  ⊂
  [[['c', .5, .5, .4], ['d', .5, .5]], .5, .5],                                                // tha ⊙
  [[['l', .5, 0, .5, 1], ['l', .12, 1, .88, 1]], .5, .88],                                     // na  ⊥
  [[['l', .14, 0, .14, 1], ['l', .14, 1, .86, 1], ['l', .86, 1, .86, 0]], .86, .86],           // pa  ⊔
  [[['l', .14, 0, .14, 1], ['l', .14, 1, .86, 1], ['l', .86, 1, .86, 0], ['l', .86, 0, .14, 0]], .5, .5],   // ba  □
  [[['l', .16, 0, .5, .44], ['l', .84, 0, .5, .44], ['c', .5, .72, .28]], .84, .5],            // ma
  [[['l', .12, 0, .12, 1], ['l', .12, 1, .88, 1], ['l', .88, 1, .88, 0], ['l', .5, .3, .5, 1]], .88, .5],   // ya
  [[['l', .5, 0, .5, 1]], .5, .5],                                                             // ra  |
  [[['l', .72, 0, .72, 1], ['l', .72, 1, .26, 1], ['l', .26, 1, .26, .62]], .72, .72],         // la
  [[['l', .5, 0, .5, .42], ['c', .5, .7, .28]], .5, .5],                                       // va
  [[['l', .76, 0, .76, 1], ['l', .76, .42, .24, .42], ['l', .24, .42, .24, 1]], .76, .76],     // sa
  [[['l', .26, 0, .26, 1], ['a', .55, 1, .29, Math.PI, Math.PI * 1.55]], .26, .26],             // ha
  [[['a', .38, .5, .46, -Math.PI / 2, Math.PI / 2]], .38, .38],                                // da  ⊃
  [[['l', .2, 0, .2, 1], ['a', .2, .5, .5, -Math.PI / 2, Math.PI / 2]], .2, .2],               // dha D
  [[['a', .5, .5, .36, 0, Math.PI], ['l', .86, .5, .86, 0], ['l', .14, .5, .14, .2]], .86, .5],  // ca
  [[['l', .72, 0, .72, 1], ['l', .72, .14, .26, .14], ['l', .26, .14, .26, .52], ['l', .26, .52, .72, .52]], .72, .72],   // a
  [[['d', .5, .12], ['d', .16, .86], ['d', .84, .86]], .5, .5],                                // i  ∴
  [[['l', .24, 0, .24, 1], ['l', .24, 1, .82, 1]], .24, .82],                                  // u  L
  [[['l', .5, 0, .12, 1], ['l', .12, 1, .88, 1], ['l', .88, 1, .5, 0]], .5, .5],               // e  △
  [[['l', .5, 0, .5, .46], ['l', .5, .46, .14, 1], ['l', .5, .46, .86, 1]], .5, .5],           // ta  λ
  [[['l', .12, 1, .5, 0], ['l', .5, 0, .88, 1], ['l', .5, 0, .5, 1]], .5, .5],                 // śa
  [[['l', .16, 0, .84, 0], ['l', .5, 0, .5, 1], ['l', .5, 1, .16, 1], ['l', .16, 1, .16, .74]], .5, .5],  // ṇa
  [[['l', .16, 1, .16, 0], ['l', .16, 0, .84, 0], ['l', .84, 0, .84, 1], ['l', .84, 1, .58, 1]], .84, .84],  // bha
  [[['l', .5, 0, .5, .56], ['c', .5, .78, .22]], .5, .5],                                      // kha
  [[['l', .14, 0, .14, 1], ['l', .14, 1, .86, 1], ['l', .86, 1, .86, 0], ['l', .86, 0, .62, .22]], .86, .86],   // pha
];
export function inscriptionCanvas({ W = 1024, H = 1024, lines = 9, perLine = 13, seed = 9 } = {}) {
  const r = rng(seed);
  const mk = () => { const c = mkCanvas(W, H), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.lineCap = 'round'; g.lineJoin = 'miter'; g.miterLimit = 3; return [c, g]; };
  const [hc, hg] = mk(), [oc, og] = mk();
  const lh = H / (lines + 0.4), sz = lh * 0.56, sw = sz * 0.12, gap = sz * 0.36;
  const glyphs = [];
  for (let li = 0; li < lines; li++) {
    const y0 = (li + 0.3) * lh + (lh - sz) / 2 + (r() - 0.5) * lh * 0.03;
    let x = sz * (0.5 + r() * 0.2) + (li % 3 === 1 ? sz * 0.15 : 0);
    while (x < W - sz * 1.2) {
      const [strokes, ta, ba] = BRAHMI[Math.floor(r() * BRAHMI.length)];
      const w = sz * (0.62 + r() * 0.12);
      const ox = x, oy = y0 + (r() - 0.5) * sz * 0.05, X = (u) => ox + u * w, Y = (v) => oy + v * sz, rr = (w + sz) / 2;
      const path = new Path2D();
      for (const s of strokes) {
        if (s[0] === 'l') { path.moveTo(X(s[1]), Y(s[2])); path.lineTo(X(s[3]), Y(s[4])); }
        else if (s[0] === 'c') { path.moveTo(X(s[1]) + s[3] * rr, Y(s[2])); path.arc(X(s[1]), Y(s[2]), s[3] * rr, 0, TAU); }
        else if (s[0] === 'a') { path.moveTo(X(s[1]) + Math.cos(s[4]) * s[3] * rr, Y(s[2]) + Math.sin(s[4]) * s[3] * rr); path.arc(X(s[1]), Y(s[2]), s[3] * rr, s[4], s[5]); }
      }
      const dots = strokes.filter((s) => s[0] === 'd');
      // vowel signs: a tick right at the head (ā), up-hooked (i), left (e), both (o), at the foot (u), a dot (ṃ)
      const vm = r(), L = sz * 0.3;
      if (vm < 0.22) { path.moveTo(X(ta), Y(0)); path.lineTo(X(ta) + L, Y(0)); }
      else if (vm < 0.32) { path.moveTo(X(ta), Y(0)); path.lineTo(X(ta) + L, Y(0)); path.lineTo(X(ta) + L, Y(0) - L * 0.7); }
      else if (vm < 0.42) { path.moveTo(X(ta), Y(0)); path.lineTo(X(ta) - L, Y(0)); }
      else if (vm < 0.48) { path.moveTo(X(ta) - L, Y(0)); path.lineTo(X(ta) + L, Y(0)); }
      else if (vm < 0.58) { path.moveTo(X(ba), Y(1)); path.lineTo(X(ba), Y(1) + L * 0.55); path.lineTo(X(ba) + L * 0.8, Y(1) + L * 0.55); }
      else if (vm < 0.64) dots.push(['d', 1.2, 0.5]);
      glyphs.push({ path, dots: dots.map((d) => [X(d[1]), Y(d[2])]), order: (li + (x / W) * 0.92) / lines, wear: r() });
      x += w + gap * (0.85 + r() * 0.35);
    }
  }
  // depth: stacked strokes, narrower ones deeper (a chisel's V-section); worn letters are shallower
  const PASSES = 6;
  hg.globalCompositeOperation = 'lighter';
  for (const gl of glyphs) {
    const depth = gl.wear < 0.12 ? 0.55 : 0.85 + gl.wear * 0.15;
    for (let k = 0; k < PASSES; k++) {
      const v = Math.round(255 / PASSES * depth);
      hg.strokeStyle = hg.fillStyle = `rgb(${v},${v},${v})`;
      const wk = sw * (1.25 - k / PASSES * 1.0);
      hg.lineWidth = wk; hg.stroke(gl.path);
      for (const [dx, dy] of gl.dots) { hg.beginPath(); hg.arc(dx, dy, sw * 0.9 * (1.25 - k / PASSES) , 0, TAU); hg.fill(); }
    }
    og.strokeStyle = og.fillStyle = `rgb(0,${Math.round(gl.order * 255)},255)`;
    og.lineWidth = sw * 1.25; og.stroke(gl.path);
    for (const [dx, dy] of gl.dots) { og.beginPath(); og.arc(dx, dy, sw * 1.15, 0, TAU); og.fill(); }
  }
  // soften the steps; then pack depth into R
  const soft = mkCanvas(W, H), sg = soft.getContext('2d');
  sg.filter = `blur(${Math.max(1, sw * 0.12).toFixed(1)}px)`; sg.drawImage(hc, 0, 0); sg.filter = 'none';
  const hd = sg.getImageData(0, 0, W, H).data, od = og.getImageData(0, 0, W, H);
  for (let i = 0; i < od.data.length; i += 4) od.data[i] = hd[i];
  og.putImageData(od, 0, 0);
  return oc;
}

// ---------------------------------------------------------------------------------------------- the flag
// India's flag (2:3): saffron, white, green, with the navy 24-spoke Ashoka Chakra on the white band.
export function flagTexture() {
  const W = 768, H = 512, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#ff9933'; g.fillRect(0, 0, W, H / 3);
  g.fillStyle = '#ffffff'; g.fillRect(0, H / 3, W, H / 3);
  g.fillStyle = '#138808'; g.fillRect(0, 2 * H / 3, W, H / 3);
  const cx = W / 2, cy = H / 2, R = H / 3 * 0.45;
  g.strokeStyle = '#000080'; g.fillStyle = '#000080';
  g.lineWidth = R * 0.1; g.beginPath(); g.arc(cx, cy, R * 0.95, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, R * 0.17, 0, TAU); g.fill();
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    g.beginPath();
    g.moveTo(cx + ca * R * 0.17, cy + sa * R * 0.17);
    g.lineTo(cx + ca * R * 0.5 + px * R * 0.045, cy + sa * R * 0.5 + py * R * 0.045);
    g.lineTo(cx + ca * R * 0.92, cy + sa * R * 0.92);
    g.lineTo(cx + ca * R * 0.5 - px * R * 0.045, cy + sa * R * 0.5 - py * R * 0.045);
    g.closePath(); g.fill();
    const b = (i + 0.5) / 24 * TAU;
    g.beginPath(); g.arc(cx + Math.cos(b) * R * 0.92, cy + Math.sin(b) * R * 0.92, R * 0.035, 0, TAU); g.fill();
  }
  return toTexture(c);
}

// ------------------------------------------------------------------------------------------- the marchers
// A column of figures along the road. Each vertex knows its walker's swing pivot (hip / shoulder) and gait
// phase; the vertex shader swings limbs and carries every walker forward along the road (pure in uTime).
export function marcherGeometry({ count, origin, dir, sStart, sEnd, shadowDir = dir, seed = 1930 }) {
  const r = rng(seed), side = new THREE.Vector3(-dir.z, 0, dir.x);   // (dir × up) points to the walker's right
  const pos = [], nrm = [], col = [], piv = [], swg = [];
  const shadow = [];
  const add = (g, color, pivot, amp, phase, m) => {
    const n = prep(g); n.applyMatrix4(m);
    const p = n.attributes.position, q = n.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(q.getX(i), q.getY(i), q.getZ(i));
      col.push(color.r, color.g, color.b); piv.push(pivot.x, pivot.y, pivot.z); swg.push(amp, phase);
    }
  };
  const basis = new THREE.Matrix4().makeBasis(side, new THREE.Vector3(0, 1, 0), dir.clone().negate());   // local −z = forward
  const C = (r0, g0, b0, k = 1) => new THREE.Color(r0 * k, g0 * k, b0 * k);
  const cyl = (rt, rb, h, y, seg = 6, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open).translate(0, y, 0);
  // the 1921 Swaraj flag the marchers carried: white, green and red with the charkha (a dark disc at this size)
  const flagQuad = (y0, h, w, c) => { const g = new THREE.PlaneGeometry(w, h, 2, 1); g.translate(w / 2, y0 - h / 2, 0); return [g, c]; };
  for (let i = 0; i < count; i++) {
    const lead = i === 0;
    // rows of two or three abreast, loosely kept
    const row = Math.floor((i - 1) / 2), s = lead ? sEnd + 2.6 : sEnd - (row + 0.5) * (sEnd - sStart) / Math.ceil(count / 2) + (r() - 0.5) * 0.9;
    const three = (row % 7) === 3 && i % 2 === 0;
    const lane = lead ? 0 : three ? 0.05 + (r() - 0.5) * 0.2 : (i % 2 ? -0.55 : 0.55) + (r() - 0.5) * 0.35;
    const base = origin.clone().addScaledVector(dir, s).addScaledVector(side, lane);
    const m = basis.clone().setPosition(base);
    const phase = r() * TAU;
    const kind = lead ? 'lead' : r() < 0.1 ? 'woman' : 'man';
    const flagger = !lead && kind === 'man' && r() < 0.045;
    const k = 0.9 + r() * 0.15;
    const khadi = r() < 0.75 ? C(0.74, 0.72, 0.66, k) : C(0.66, 0.6, 0.49, k);
    const skin = C(0.2, 0.11, 0.07, 0.75 + r() * 0.45);
    const scale = lead ? 0.95 : (kind === 'woman' ? 0.88 : 0.92) + r() * 0.14, girth = lead ? 0.82 : 0.88 + r() * 0.25;
    const ms = m.clone().multiply(new THREE.Matrix4().makeScale(scale * girth, scale, scale * girth));
    const P = (x, y, z) => new THREE.Vector3(x * girth, y, z).multiplyScalar(scale).applyMatrix4(m);
    const body = (g, c) => add(g, c, P(0, 0, 0), 0, phase, ms);
    let top = khadi;
    if (kind === 'woman') {
      const sari = [C(0.74, 0.72, 0.67), C(0.74, 0.72, 0.67), C(0.13, 0.14, 0.3), C(0.36, 0.08, 0.06), C(0.75, 0.36, 0.08)][Math.floor(r() * 5)];
      top = sari;
      body(cyl(0.16, 0.15, 0.55, 1.17).scale(1, 1, 0.75), sari);
      body(cyl(0.15, 0.27, 0.98, 0.5, 8).scale(1, 1, 0.85), sari);                                  // the sari's fall
      body(new THREE.SphereGeometry(0.115, 6, 4).translate(0, 1.58, 0.01), sari);                    // the pallu over the head
      body(new THREE.SphereGeometry(0.085, 6, 4).translate(0, 1.56, -0.04), skin);                   // the face
    } else {
      const shawl = lead || r() < 0.25;
      body(cyl(0.2, 0.16, 0.6, 1.18).scale(1, 1, 0.72), lead ? skin : khadi);                         // kurta / bare chest
      body(cyl(0.18, 0.22, 0.42, 0.72).scale(1, 1, 0.8), khadi);                                      // dhoti
      if (shawl) {
        const sc = lead ? C(0.78, 0.76, 0.7) : r() < 0.5 ? C(0.56, 0.47, 0.34, k) : C(0.7, 0.66, 0.56, k);
        body(cyl(0.215, 0.2, 0.34, 1.3, 6, true).scale(1, 1, 0.76).rotateZ(0.32 * (r() < 0.5 ? 1 : -1)), sc);   // draped across one shoulder
        if (lead) top = skin;
      }
      body(new THREE.SphereGeometry(0.1, 6, 4).translate(0, 1.6, lead ? -0.05 : 0), skin);
      const hat = r();
      if (!lead && hat < 0.5) body(new THREE.BoxGeometry(0.19, 0.07, 0.24).translate(0, 1.69, 0), C(0.8, 0.79, 0.75));   // Gandhi cap
      else if (!lead && hat < 0.72) {                                                                   // a turban
        const tc = [C(0.78, 0.76, 0.7), C(0.75, 0.36, 0.08), C(0.6, 0.42, 0.12), C(0.72, 0.7, 0.62)][Math.floor(r() * 4)];
        body(cyl(0.125, 0.11, 0.12, 1.7, 8).scale(1, 1, 1.08), tc);
      }
      if (!lead && r() < 0.08) body(new THREE.BoxGeometry(0.34, 0.16, 0.28).translate(0, 1.78, 0), C(0.55, 0.45, 0.32, k));   // a bundle on the head
      if (!lead && r() < 0.18) body(new THREE.BoxGeometry(0.16, 0.22, 0.08).translate(-0.22, 0.98, 0.02), C(0.42, 0.33, 0.2, k));   // a cloth bag
    }
    body(cyl(0.045, 0.05, 0.1, 1.5, 5, true), skin);
    for (const sd of [-1, 1]) {
      const hip = P(sd * 0.09, 0.9, 0), sh = P(sd * 0.23, 1.45, 0);
      add(cyl(0.06, 0.055, 0.34, 0.9 - 0.17, 5, true).translate(sd * 0.09, 0, 0), kind === 'woman' ? top : khadi, hip, sd * 0.42, phase, ms);   // thigh in the dhoti
      add(cyl(0.05, 0.04, 0.5, 0.56 - 0.25, 5, true).translate(sd * 0.09, 0, 0), skin, hip, sd * 0.42, phase, ms);                            // bare shin
      const bareArm = lead && sd > 0;
      add(cyl(0.048, 0.042, 0.42, 1.45 - 0.21, 5, true).translate(sd * 0.23, 0, 0), bareArm ? skin : top, sh, -sd * (bareArm ? 0.12 : flagger && sd > 0 ? 0.05 : 0.32), phase, ms);
      add(cyl(0.04, 0.035, 0.2, 1.45 - 0.5, 5, true).translate(sd * 0.23, 0, 0), skin, sh, -sd * (bareArm ? 0.12 : flagger && sd > 0 ? 0.05 : 0.32), phase, ms);
    }
    const staff = (len, rx, z, c, amp, mm) => add(new THREE.CylinderGeometry(0.018, 0.018, len, 5).rotateX(rx).translate(0.29, len / 2 - 0.02 + 0.0, z), c, P(0.23, 1.45, 0), amp, phase, mm);
    if (lead) staff(1.75, 0.18, -0.22, C(0.3, 0.2, 0.12), -0.12, m);
    else if (flagger) {
      add(new THREE.CylinderGeometry(0.016, 0.016, 2.7, 5).translate(0.27, 1.35, -0.08), C(0.28, 0.2, 0.12), P(0.23, 1.45, 0), -0.05, phase, ms);
      const fw = 0.95, fh = 0.21;
      for (const [g, c] of [flagQuad(2.68, fh, fw, C(0.8, 0.79, 0.74)), flagQuad(2.68 - fh, fh, fw, C(0.06, 0.3, 0.07)), flagQuad(2.68 - 2 * fh, fh, fw, C(0.55, 0.06, 0.04))]) {
        g.translate(0.28, 0, -0.08); const pa = g.attributes.position;
        for (let j = 0; j < pa.count; j++) { const u = (pa.getX(j) - 0.28) / fw; pa.setZ(j, pa.getZ(j) + Math.sin(u * 4.5) * 0.08 * u); pa.setY(j, pa.getY(j) - u * u * 0.06); }
        g.computeVertexNormals();
        add(g, c, P(0.23, 1.45, 0), -0.05, phase, ms);
      }
      add(new THREE.CircleGeometry(0.06, 8).translate(0.28 + fw / 2, 2.68 - 1.5 * fh, -0.05), C(0.12, 0.07, 0.04), P(0.23, 1.45, 0), -0.05, phase, ms);
    } else if (r() < 0.14) staff(1.5, 0.12, -0.12, C(0.24, 0.16, 0.1), -0.3, ms);
    // long morning shadow, falling ahead of the walker down the road (a tapering quad on the ground)
    const len = (flagger ? 9 : 6.5) * scale, wd = 0.42 * scale, sside = V3(-shadowDir.z, 0, shadowDir.x);
    const c0 = base.clone().addScaledVector(sside, -wd / 2).add(V3(0, 0.08, 0)), c1 = base.clone().addScaledVector(sside, wd / 2).add(V3(0, 0.08, 0));
    const c2 = c1.clone().addScaledVector(shadowDir, len).addScaledVector(sside, -wd * 0.25), c3 = c0.clone().addScaledVector(shadowDir, len).addScaledVector(sside, wd * 0.25);
    for (const [v, u, w] of [[c0, 0, 0], [c1, 1, 0], [c2, 1, 1], [c0, 0, 0], [c2, 1, 1], [c3, 0, 1]]) shadow.push(v.x, v.y, v.z, u, w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aPivot', new THREE.Float32BufferAttribute(piv, 3));
  g.setAttribute('aSwing', new THREE.Float32BufferAttribute(swg, 2));
  g.computeBoundingSphere();
  const sgeo = new THREE.BufferGeometry(), sPos = [], sUv = [];
  for (let i = 0; i < shadow.length; i += 5) { sPos.push(shadow[i], shadow[i + 1], shadow[i + 2]); sUv.push(shadow[i + 3], shadow[i + 4]); }
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  sgeo.setAttribute('uv', new THREE.Float32BufferAttribute(sUv, 2));
  sgeo.computeBoundingSphere();
  return { body: g, shadow: sgeo, side };
}
