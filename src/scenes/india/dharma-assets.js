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
      r += amp * Math.sqrt(1 - q * q) + 0.0035 * Math.exp(-(phi / 0.035) ** 2) * (1 - u);
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
  const lathe = (pts, seg = 128) => prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
  parts.push(lathe([[0, 0.6], [0.262, 0.6], [0.262, 0.6], [0.262, 0.64], [0.25, 0.645], [0.25, 0.69], [0.25, 0.69], [0.4, 0.69], [0.4, 0.69], [0.438, 0.693], [0.44, 0.708], [0.43, 0.712], [0.43, 0.712],
    [0.43, 0.97], [0.43, 0.97], [0.44, 0.972], [0.442, 0.985], [0.43, 0.99], [0.43, 0.99], [0, 0.99]], 160));
  return mergeGeometries(parts);
}

// 24-spoke wheel authored flat (facing +z), radius 1
export function wheelParts({ spokes = 24, rimIn = 0.84, rimOut = 1, hub = 0.17, depth = 0.1, lobes = true } = {}) {
  const parts = [];
  const ring = new THREE.Shape(); ring.absarc(0, 0, rimOut, 0, TAU, false);
  const hole = new THREE.Path(); hole.absarc(0, 0, rimIn, 0, TAU, true); ring.holes.push(hole);
  const rg = new THREE.ExtrudeGeometry(ring, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: 0.02, bevelSegments: 2, curveSegments: 96 });
  rg.translate(0, 0, -depth / 2); parts.push(prep(rg));
  // spokes: slender lozenges, widest a third of the way out
  const sp = new THREE.Shape(), r0 = hub * 0.9, r1 = rimIn + 0.01, w = 0.032;
  sp.moveTo(r0, 0); sp.quadraticCurveTo(lerp(r0, r1, 0.3), w * 1.3, r1, w * 0.45); sp.lineTo(r1, -w * 0.45); sp.quadraticCurveTo(lerp(r0, r1, 0.3), -w * 1.3, r0, 0);
  const sg = new THREE.ExtrudeGeometry(sp, { depth: depth * 0.6, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: 0.006, bevelSegments: 1, curveSegments: 8 });
  sg.translate(0, 0, -depth * 0.3);
  const spk = prep(sg);
  for (let i = 0; i < spokes; i++) parts.push(spk.clone().rotateZ(i / spokes * TAU));
  // hub: a boss with a ring round it
  const hb = new THREE.CylinderGeometry(hub, hub, depth * 1.4, 48); hb.rotateX(Math.PI / 2); parts.push(prep(hb));
  const hr = new THREE.TorusGeometry(hub, depth * 0.22, 8, 48); hr.translate(0, 0, depth * 0.5); parts.push(prep(hr));
  const hc = new THREE.SphereGeometry(hub * 0.55, 20, 10); hc.scale(1, 1, 0.6); hc.translate(0, 0, depth * 0.7); parts.push(prep(hc));
  // little lobes on the inner rim between the spokes (as on the flag's chakra)
  if (lobes) for (let i = 0; i < spokes; i++) {
    const a = (i + 0.5) / spokes * TAU, l = new THREE.CylinderGeometry(0.032, 0.032, depth * 0.8, 12, 1, false, 0, Math.PI);
    l.rotateX(Math.PI / 2); l.rotateZ(a + Math.PI); l.translate(Math.cos(a) * rimIn, Math.sin(a) * rimIn, 0); parts.push(prep(l));
  }
  return mergeGeometries(parts);
}

// the four animals of the abacus in low relief (x along the drum, facing +x; y up; z out of the surface)
function animalPrims(kind) {
  const L = (x0, y0, x1, y1, ra, rb, k = 0.006) => cone([x0, y0, 0], [x1, y1, 0], ra, rb, k, 0.42);
  const E = (x, y, rx, ry, rz, k = 0.008, ang = 0) => ell([x, y, 0], [rx, ry, rz], k, ang);
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
    E(0, 0.1, 0.072, 0.034, 0.024, 0),
    L(0.055, 0.11, 0.092, 0.152, 0.024, 0.015, 0.01), E(0.112, 0.145, 0.032, 0.013, 0.02, 0.008, -0.75),   // neck, head
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
    P.push(cone([s * 0.078, 0.4, 0.24], [s * 0.08, 0.08, 0.298], 0.052, 0.038, 0.04));             // foreleg
    P.push(cone([s * 0.08, 0.1, 0.3], [s * 0.08, 0.04, 0.322], 0.04, 0.038, 0.02));
    P.push(ell([s * 0.08, 0.034, 0.34], [0.047, 0.034, 0.058], 0.025));                            // forepaw
    for (const t of [-1.5, -0.5, 0.5, 1.5]) P.push(ell([s * 0.08 + t * 0.019, 0.022, 0.387], [0.012, 0.018, 0.017], 0.006));   // toes
    P.push(ell([s * 0.05, 0.788, 0.33], [0.048, 0.05, 0.05], 0.02));                               // cheeks
    P.push(ell([s * 0.034, 0.866, 0.344], [0.036, 0.016, 0.03], 0.01, s * 0.3));                   // brow ridges
    P.push(ell([s * 0.04, 0.846, 0.354], [0.013, 0.009, 0.01], 0.004));                            // eyes
    P.push(ell([s * 0.074, 0.905, 0.238], [0.026, 0.031, 0.016], 0.01));                           // ears
  }
  P.push(ell([0, 0.36, 0.05], [0.12, 0.2, 0.17], 0.05));                                           // torso
  P.push(ell([0, 0.47, 0.19], [0.128, 0.17, 0.12], 0.06));                                          // chest
  P.push(ell([0, 0.67, 0.13], [0.168, 0.25, 0.155], 0.05));                                         // mane mass
  P.push(ell([0, 0.83, 0.268], [0.094, 0.09, 0.094], 0.03));                                        // cranium
  P.push(ell([0, 0.806, 0.372], [0.054, 0.04, 0.056], 0.02));                                       // upper muzzle
  P.push(cone([0, 0.872, 0.322], [0, 0.828, 0.408], 0.03, 0.022, 0.02));                            // nose bridge
  P.push(ell([0, 0.822, 0.424], [0.022, 0.015, 0.012], 0.008));                                     // nose pad
  P.push(cone([0, 0.718, 0.29], [0, 0.726, 0.35], 0.032, 0.026, 0.02));                             // throat → chin
  P.push(ell([0, 0.726, 0.36], [0.04, 0.019, 0.048], 0.008));                                       // lower jaw (the mouth stands open)
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
  const wheelFlat = wheelParts({ depth: 0.12, lobes: false });
  wheelFlat.scale(CAP.wheelR, CAP.wheelR, CAP.wheelR); wheelFlat.translate(0, CAP.wheelY, 0.004);
  const wheels = [0, 1, 2, 3].map((k) => bendOnDrum(wheelFlat.clone(), R, k * Math.PI / 2));
  // animals between them: bull to the right of the front wheel, horse to the left, then elephant, lion
  const kinds = [['bull', 1, 1], ['elephant', 3, 1], ['lion', 5, 1], ['horse', 7, -1]];
  const animals = kinds.map(([kind, slot, dir]) => {
    const prims = animalPrims(kind).map((p) => (dir > 0 ? p : p.type === 'ell'
      ? { ...p, c: [-p.c[0], p.c[1], p.c[2]], ang: -(p.ang ?? 0) } : { ...p, a: [-p.a[0], p.a[1], p.a[2]], b: [-p.b[0], p.b[1], p.b[2]] }));
    const n = prep(meshBody(sdfBody(prims), [-0.165, -0.012, -0.012], [0.165, 0.2, 0.05], lite ? 0.006 : 0.0042));
    n.translate(0, CAP.abacusY0 + 0.038, 0);
    // (the animals walk sunwise round the drum: each faces away from the wheel at the front lion's feet)
    return bendOnDrum(n, R, slot * Math.PI / 4);
  });
  const lion = meshBody(sdfBody(lionPrims()), [-0.235, 0.0, -0.17], [0.235, 0.96, 0.46], lite ? 0.014 : 0.009);
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
export function inscriptionCanvas({ W = 1024, H = 1024, lines = 8, perLine = 14, seed = 9 } = {}) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const lh = H / lines, gw = W / (perLine + 1), sz = Math.min(lh * 0.62, gw * 0.85);
  const glyphs = [
    (s) => { s.m(0.5, 0); s.l(0.5, 1); s.m(0.15, 0.4); s.l(0.85, 0.4); },                 // +  (ka)
    (s) => { s.m(0.1, 1); s.l(0.5, 0); s.l(0.9, 1); },                                    // Λ  (ga)
    (s) => { s.arc(0.5, 0.55, 0.38, Math.PI, 0); s.m(0.12, 0.55); s.l(0.12, 1); },        // ⊓-ish
    (s) => { s.m(0.15, 0); s.l(0.15, 0.6); s.arc(0.5, 0.6, 0.35, Math.PI, 0, true); s.l(0.85, 0); },   // U  (pa)
    (s) => { s.circ(0.5, 0.62, 0.3); s.m(0.2, 0.32); s.l(0.5, 0); s.l(0.8, 0.32); },     // circle + V (ma)
    (s) => { s.m(0.5, 0); s.q(0.15, 0.3, 0.5, 0.5); s.q(0.85, 0.7, 0.5, 1); },            // wavy (ra)
    (s) => { s.m(0.75, 0); s.l(0.75, 0.75); s.q(0.75, 1, 0.45, 1); s.q(0.2, 1, 0.2, 0.75); },   // J (la)
    (s) => { s.m(0.15, 0.1); s.l(0.15, 0.6); s.arc(0.5, 0.6, 0.35, Math.PI, 0, true); s.l(0.85, 0.1); s.m(0.5, 0.95); s.l(0.5, 0.15); },   // ψ (ya)
    (s) => { s.m(0.3, 0); s.l(0.3, 1); s.m(0.3, 0); s.q(0.95, 0.5, 0.3, 1); },            // D (da)
    (s) => { s.circ(0.5, 0.5, 0.36); s.dot(0.5, 0.5); },                                   // ⊙ (tha)
    (s) => { s.m(0.15, 0.1); s.l(0.85, 0.1); s.m(0.5, 0.1); s.l(0.5, 1); },               // T
    (s) => { s.m(0.8, 0.05); s.l(0.2, 0.05); s.l(0.2, 0.95); s.l(0.8, 0.95); s.m(0.2, 0.5); s.l(0.65, 0.5); },   // E (ja)
    (s) => { s.m(0.2, 0); s.l(0.2, 1); s.l(0.8, 1); s.m(0.8, 0.45); s.l(0.8, 1); },       // L-hook (ha)
    (s) => { s.m(0.5, 0); s.l(0.5, 1); s.m(0.5, 0.35); s.l(0.85, 0.15); s.m(0.5, 0.65); s.l(0.15, 0.85); },   // forked
  ];
  for (let li = 0; li < lines; li++) {
    let x = gw * (0.6 + r() * 0.3);
    const y0 = li * lh + (lh - sz) / 2 + (r() - 0.5) * lh * 0.04;
    for (let k = 0; k < perLine; k++) {
      const order = (li + x / W) / lines;
      const col = `rgb(255,${Math.round(order * 255)},0)`;
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = sz * (0.09 + r() * 0.02);
      const w = sz * (0.62 + r() * 0.2), ox = x, oy = y0;
      const X = (u) => ox + u * w, Y = (v) => oy + v * sz;
      const s = {
        m: (u, v) => { g.moveTo(X(u), Y(v)); }, l: (u, v) => { g.lineTo(X(u), Y(v)); },
        q: (cu, cv, u, v) => { g.quadraticCurveTo(X(cu), Y(cv), X(u), Y(v)); },
        arc: (u, v, rr, a0, a1, ccw = false) => { g.arc(X(u), Y(v), rr * w, a0, a1, ccw); },
        circ: (u, v, rr) => { g.moveTo(X(u) + rr * w, Y(v)); g.arc(X(u), Y(v), rr * w, 0, TAU); },
        dot: (u, v) => { g.moveTo(X(u) + 1, Y(v)); g.arc(X(u), Y(v), sz * 0.05, 0, TAU); },
      };
      g.beginPath(); glyphs[Math.floor(r() * glyphs.length)](s); g.stroke();
      // vowel marks: a tick at the head or the foot, sometimes
      const vm = r();
      if (vm < 0.35) { g.beginPath(); g.moveTo(X(0.5), Y(0)); g.lineTo(X(0.95), Y(-0.16)); g.stroke(); }
      else if (vm < 0.5) { g.beginPath(); g.moveTo(X(0.5), Y(1)); g.lineTo(X(0.5), Y(1.14)); g.lineTo(X(0.8), Y(1.14)); g.stroke(); }
      else if (vm < 0.62) { g.beginPath(); g.moveTo(X(0.0), Y(0.2)); g.lineTo(X(-0.22), Y(0.2)); g.stroke(); }
      x += w + sz * (0.38 + r() * 0.25) + (r() < 0.12 ? sz * 0.5 : 0);
      if (x > W - gw * 0.8) break;
    }
  }
  return c;
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
export function marcherGeometry({ count, origin, dir, sStart, sEnd, seed = 1930 }) {
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
  const parts = (lead) => {
    const torso = new THREE.CylinderGeometry(0.15, 0.19, 0.62, 7); torso.translate(0, 1.18, 0);
    const head = new THREE.SphereGeometry(0.105, 8, 6); head.translate(0, 1.6, lead ? -0.04 : 0);
    const wrap = new THREE.CylinderGeometry(0.19, 0.24, 0.42, 7); wrap.translate(0, 0.78, 0);   // dhoti
    return { torso, head, wrap };
  };
  const leg = new THREE.CylinderGeometry(0.055, 0.045, 0.62, 5); leg.translate(0, -0.31, 0);
  const arm = new THREE.CylinderGeometry(0.045, 0.04, 0.6, 5); arm.translate(0, -0.3, 0);
  const staff = new THREE.CylinderGeometry(0.018, 0.018, 1.75, 5);
  for (let i = 0; i < count; i++) {
    const lead = i === 0;
    const s = lead ? sEnd + 2.2 : lerp(sEnd, sStart, (i + r() * 0.6) / count);
    const lane = lead ? 0 : ((i % 3) - 1) * 0.85 + (r() - 0.5) * 0.35;
    const base = origin.clone().addScaledVector(dir, s).addScaledVector(side, lane);
    const m = basis.clone().setPosition(base);
    const phase = r() * TAU, tone = 0.82 + r() * 0.18;
    const cloth = new THREE.Color(0.86 * tone, 0.82 * tone, 0.74 * tone), skin = new THREE.Color(0.33, 0.2, 0.13);
    const { torso, head, wrap } = parts(lead);
    const P = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const scale = lead ? 0.96 : 0.92 + r() * 0.14;
    const ms = m.clone().multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    add(torso, cloth, P(0, 0, 0), 0, phase, ms);
    add(head, skin, P(0, 0, 0), 0, phase, ms);
    add(wrap, cloth, P(0, 0, 0), 0, phase, ms);
    for (const sd of [-1, 1]) {
      add(leg.clone().translate(sd * 0.09, 0.9, 0), skin, P(sd * 0.09 * scale, 0.9 * scale, 0), sd * 0.42, phase, ms);
      add(arm.clone().translate(sd * 0.23, 1.45, 0), lead && sd > 0 ? skin : cloth, P(sd * 0.23 * scale, 1.45 * scale, 0), -sd * (lead && sd > 0 ? 0.12 : 0.32), phase, ms);
    }
    if (lead) add(staff.clone().rotateX(0.18).translate(0.3, 0.95, -0.22), new THREE.Color(0.3, 0.2, 0.12), P(0.23, 1.45, 0), -0.12, phase, m);
    // long morning shadow, falling ahead of the walker down the road (a tapering quad on the ground)
    const len = 7.5 * scale, wd = 0.42 * scale;
    const c0 = base.clone().addScaledVector(side, -wd / 2).add(V3(0, 0.03, 0)), c1 = base.clone().addScaledVector(side, wd / 2).add(V3(0, 0.03, 0));
    const c2 = c1.clone().addScaledVector(dir, len).addScaledVector(side, -wd * 0.25), c3 = c0.clone().addScaledVector(dir, len).addScaledVector(side, wd * 0.25);
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
