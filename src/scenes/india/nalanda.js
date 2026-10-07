// THE FIRST UNIVERSITIES — Nalanda Mahavihara, Bihar, c. AD 427 – 1200 (story 34.5 – 39.0 s)
// One continuous camera move:
//   34.5  low over the excavated red-brick ruins as they are today: rows of student-cell walls, the
//         stepped mound of a temple beyond, afternoon light
//   34.8  nalandaBricks — the camera drifts in over the broken walls
//   35.6  nalandaRise   — the ruins rebuild course by course (a hot build front lays every brick), the
//                         camera cranes up as the campus stands again in golden light: a row of
//                         monasteries (viharas: cells round a courtyard, a well, a raised platform)
//                         facing a row of temples (chaityas: stepped brick pyramids, corner towers,
//                         a great stair) across a broad avenue; monks walk the avenue
//   36.5  scholars      — dusk: down over a courtyard where small groups sit round their teachers by
//                         lamplight; the subjects taught float up in gold
//   37.3  library       — the library's facade peels away floor by floor as the camera rises: shelves
//                         of palm-leaf manuscripts glowing (DHARMAGANJA, the 'mart of truth')
//   38.1  asiaRoutes    — the camera climbs away (powers of ten) until the campus is a cluster of
//                         lamps and the plain becomes a schematic map of Asia; routes of light run out
//                         from Nalanda to China, Tibet, Korea, Srivijaya, Sri Lanka and Central Asia
// Technique: procedural architecture (boxes merged per material), a GPU brick build front (per-brick
// thresholds, ruin line, freshly-laid glow; nalanda-assets.js), instanced figures, a lamp point cloud,
// a facade slice wipe, emissive manuscript shelves, a log-altitude zoom onto a projected coastline map.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, timeWarp } from '../../lib/math.js';
import { progressLine, circlePoints } from '../../lib/lines.js';
import { Dust } from '../../lib/particles.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout, faceCamera } from '../../lib/hud.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { pulse } from '../../lib/rhythm.js';
import * as NK from './nature-kit.js';
import { brickMaterial, groundMaterial, skyMaterial, monkGeometries, buildMap, ribbon, proj, DEG, debrisMaterial, grassTuftGeometry } from './nalanda-assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = '#ffcf85', LABEL = '#ffe3b3';
const VH = 8.32;                                        // vihara wall height: two storeys (52 courses)
const VIH_X = [-110, -55, 0, 110];                      // the row of monasteries (the hero at x = 0)
const TEM_X = [-82.5, -27.5, 27.5, 82.5], TEM_Z = -66;  // the row of temples across the avenue
const AVE = { z0: -44, z1: -28 };
const LIB = { x0: 46, x1: 68, z0: -14, z1: 14 };        // the library, east of the hero vihara
const FL = [0.6, 5.6, 10.6, 15.6], LIB_TOP = 20.6;      // library floor levels

// sky / light keys over the shot: today (afternoon) → golden hour → dusk → night
const C = (r, g, b) => new THREE.Color(r, g, b);
const SKY_KEYS = [
  { t: 0.0, hor: C(0.78, 0.72, 0.62), zen: C(0.22, 0.38, 0.66), sun: C(1.0, 0.84, 0.64), si: 3.8 },
  { t: 1.1, hor: C(0.8, 0.6, 0.42), zen: C(0.19, 0.3, 0.56), sun: C(1.0, 0.7, 0.42), si: 3.8 },
  { t: 1.9, hor: C(0.85, 0.42, 0.2), zen: C(0.12, 0.16, 0.36), sun: C(1.0, 0.52, 0.24), si: 3.4 },
  { t: 2.4, hor: C(0.34, 0.16, 0.16), zen: C(0.04, 0.06, 0.16), sun: C(0.9, 0.3, 0.12), si: 0.5 },
  { t: 2.9, hor: C(0.05, 0.045, 0.075), zen: C(0.008, 0.012, 0.035), sun: C(0.5, 0.2, 0.1), si: 0.0 },
];
function skyAt(t, out) {
  let i = 0;
  while (i < SKY_KEYS.length - 2 && t > SKY_KEYS[i + 1].t) i++;
  const a = SKY_KEYS[i], b = SKY_KEYS[i + 1], u = ease.inOutSine(sat((t - a.t) / (b.t - a.t)));
  out.hor.copy(a.hor).lerp(b.hor, u); out.zen.copy(a.zen).lerp(b.zen, u); out.sun.copy(a.sun).lerp(b.sun, u);
  out.si = lerp(a.si, b.si, u);
  return out;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tBricks = cue('nalandaBricks'), tRise = cue('nalandaRise'), tSch = cue('scholars'), tLib = cue('library'), tMap = cue('asiaRoutes');
  const dur = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.3;
  scene.background = new THREE.Color(0, 0, 0);
  scene.fog = new THREE.FogExp2(new THREE.Color(0.5, 0.45, 0.42), 0.004);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 3000);

  // ------------------------------------------------------------------------------------- materials
  const U = { uRise: { value: -50 }, uDelayK: { value: 0.26 }, uCentre: { value: new THREE.Vector2(0, -8) }, uHot: { value: 0 }, uAge: { value: 1 } };
  const vihMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.6, jag: 5 });
  const temMat = brickMaterial(U, { ruinLo: 8.0, ruinHi: 12.0, jag: 3, tint: [0.96, 0.9, 0.86] });
  const libMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.2, jag: 5 });
  const facadeMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.2, jag: 5, slice: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#4e2f19', roughness: 0.72 });
  const voidMat = new THREE.MeshStandardMaterial({ color: '#0b0705', roughness: 1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#05080a', roughness: 0.08, metalness: 0 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: '#8a7559', roughness: 0.8, side: THREE.DoubleSide });   // Chunar-like sandstone
  const potMat = new THREE.MeshStandardMaterial({ color: '#6e2e16', roughness: 0.7 });                             // terracotta
  const doorMat = new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: 0.7 });                            // sal-wood door leaves
  const cellGlowMat = new THREE.MeshStandardMaterial({ color: '#0b0705', roughness: 1, emissive: new THREE.Color(1.0, 0.4, 0.12), emissiveIntensity: 0 });   // a lamp lit inside the cell
  // parts that are not brick (shelves, dark doorways) exist only once the build front has passed them
  // (grain: 'wood' = streaks along the long axis of each piece, 'stone' = speckle and weathering)
  const frontClip = (mat, key, grain) => {
    mat.userData.noDetail = true;
    mat.userData.noAntiTile = true;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; varying vec3 vFN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz; vFN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
          varying vec3 vFW; varying vec3 vFN; uniform float uRise, uDelayK; uniform vec2 uCentre;
          float fh(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
          float fn3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(fh(i), fh(i + vec3(1,0,0)), f.x), mix(fh(i + vec3(0,1,0)), fh(i + vec3(1,1,0)), f.x), f.y),
                       mix(mix(fh(i + vec3(0,0,1)), fh(i + vec3(1,0,1)), f.x), mix(fh(i + vec3(0,1,1)), fh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFW.y > uRise - uDelayK * length(vFW.xz - uCentre) - 0.3) discard;');
      if (grain === 'wood') sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { vec3 q = vFW * vec3(1.0, 1.0, 1.0); vec3 an = abs(normalize(vFN));
            float g = fn3(q * vec3(3.0, 40.0, 3.0)) * 0.5 + fn3(q * vec3(40.0, 3.0, 3.0)) * an.z * 0.5 + fn3(q * vec3(3.0, 3.0, 40.0)) * an.x * 0.5;
            diffuseColor.rgb *= 0.7 + 0.45 * g + 0.25 * (fn3(vFW * 1.7) - 0.5); }`);
      if (grain === 'stone') sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
          { float g = fn3(vFW * 9.0) * 0.5 + fn3(vFW * 31.0) * 0.3 + fn3(vFW * 2.3) * 0.2;
            diffuseColor.rgb *= 0.72 + 0.5 * g; diffuseColor.rgb *= mix(0.65, 1.0, smoothstep(0.0, 0.5, vFW.y - 0.1 + fn3(vFW * 4.0) * 0.3)); }`);
    };
    mat.customProgramCacheKey = () => 'nalanda-clip-' + key;
  };
  frontClip(woodMat, 'wood', 'wood'); frontClip(voidMat, 'void'); frontClip(stoneMat, 'stone', 'stone'); frontClip(potMat, 'pot', 'stone'); frontClip(doorMat, 'door', 'wood'); frontClip(cellGlowMat, 'cellglow');
  const GU = { uEarth: { value: 0 }, uMapMix: { value: 0 }, uMapK: { value: 1 } };
  const groundMat = groundMaterial(GU);

  // ------------------------------------------------------------------------------------- builders
  // geometry is gathered per area (each monastery, each temple, the library, the site) and per material:
  // one mesh per pair, so the frustum (and AR's vitrine) can skip a whole monument, and a monument out of
  // the shot can be switched off
  const accs = new Map();
  let zone = 'site';
  const acc = (mat) => { const k = zone; if (!accs.has(k)) accs.set(k, new Map()); const z = accs.get(k); if (!z.has(mat)) z.set(mat, []); return z.get(mat); };
  const box = (mat, x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    acc(mat).push(g);
  };
  const put = (mat, g, x, y, z) => { g.translate(x, y, z); acc(mat).push(g); };
  // a square ring of four boxes between half-sizes a (inner) and b (outer), centred on (cx, cz)
  const ring = (mat, cx, cz, a, b, y0, y1) => {
    box(mat, cx - b, cx + b, y0, y1, cz + a, cz + b); box(mat, cx - b, cx + b, y0, y1, cz - b, cz - a);
    box(mat, cx + a, cx + b, y0, y1, cz - a, cz + a); box(mat, cx - b, cx - a, y0, y1, cz - a, cz + a);
  };
  // a straight wall along 'x' (between a0 and a1, thickness t0..t1 in z) or along 'z', pierced by openings
  // [{ a, b, h }] (from the floor up to h)
  function wall(mat, axis, a0, a1, t0, t1, y1, openings = []) {
    const levels = [...new Set([0, ...openings.map((o) => o.h), y1])].sort((p, q) => p - q);
    for (let k = 0; k < levels.length - 1; k++) {
      const y0 = levels[k], ya = levels[k + 1];
      const cut = openings.filter((o) => o.h > y0).sort((p, q) => p.a - q.a);
      let s = a0;
      const seg = (p, q) => { if (q - p > 0.01) { if (axis === 'x') box(mat, p, q, y0, ya, t0, t1); else box(mat, t0, t1, y0, ya, p, q); } };
      for (const o of cut) { seg(s, o.a); s = Math.max(s, o.b); }
      seg(s, a1);
    }
  }

  // geometry in a local frame on one face of a square court: u along the face, n out from the face (towards
  // the centre for inner faces), y up. side 0..3 = south / north / east / west; F = the face's distance
  // from the centre (cx, cz). The basis is right-handed (U = Y × N) so nothing is mirrored.
  const _fm = new THREE.Matrix4(), _fu = new THREE.Vector3(), _fn = new THREE.Vector3();
  const frame = (cx, cz, side, F, inward = true) => {
    const sg = inward ? 1 : -1;
    const N = [V(0, 0, -1), V(0, 0, 1), V(-1, 0, 0), V(1, 0, 0)][side].multiplyScalar(sg);
    const O = [V(cx, 0, cz + F), V(cx, 0, cz - F), V(cx + F, 0, cz), V(cx - F, 0, cz)][side];
    const Uv = V(0, 1, 0).cross(N);
    return new THREE.Matrix4().makeBasis(Uv, V(0, 1, 0), N).setPosition(O);
  };
  const fgeo = (mat, M, g) => { g.applyMatrix4(M); acc(mat).push(g); };
  const fbox = (mat, M, u0, u1, y0, y1, n0, n1) => {
    const g = new THREE.BoxGeometry(Math.abs(u1 - u0), Math.abs(y1 - y0), Math.abs(n1 - n0));
    g.translate((u0 + u1) / 2, (y0 + y1) / 2, (n0 + n1) / 2);
    fgeo(mat, M, g);
  };
  // a moulded band round a square court: [[out, y0, y1], …] stacked profiles (out = offset from the face)
  const moulding = (mat, cx, cz, face, steps, inward) => {
    for (const [o, y0, y1] of steps) {
      if (inward) ring(mat, cx, cz, face - o, face, y0, y1);
      else ring(mat, cx, cz, face, face + o, y0, y1);
    }
  };
  const lathe = (pts, seg) => { const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg); return g; };
  const PLINTH = [[0.22, 0, 0.1], [0.14, 0.1, 0.2], [0.2, 0.2, 0.26], [0.1, 0.26, 0.36], [0.16, 0.36, 0.42]];   // foot, dado, torus, neck, lip
  const CORNICE = [[0.08, -0.62, -0.5], [0.16, -0.5, -0.4], [0.26, -0.4, -0.3], [0.36, -0.3, -0.18], [0.3, -0.18, 0]];

  // ---- vihara: two-storey cells round a courtyard, verandah on pillars, a well, a raised platform
  const CELL = 3.04, IN0 = 14.4, IN1 = 15.2, OUT = 20, OW = 1.2;
  const niches = [];                                  // lamp niches (positions, for the lamp cloud)
  function vihara(cx, cz, hero) {
    const M = vihMat, rr = rng(911 + cx);
    const DH = hero ? 2.5 : 2.24;                     // door openings: corbelled tops on the hero
    // outer walls; gate in the south wall
    wall(M, 'x', cx - OUT, cx + OUT, cz + OUT - OW, cz + OUT, VH, [{ a: cx - 2, b: cx + 2, h: 3.36 }]);
    wall(M, 'x', cx - OUT, cx + OUT, cz - OUT, cz - OUT + OW, VH);
    wall(M, 'z', cz - OUT + OW, cz + OUT - OW, cx - OUT, cx - OUT + OW, VH);
    wall(M, 'z', cz - OUT + OW, cz + OUT - OW, cx + OUT - OW, cx + OUT, VH);
    // inner walls with a door to every cell (the entrance hall in the middle of the south range)
    const doors = (c0, entrance) => {
      const o = [];
      for (let k = 0; k < 10; k++) {
        const c = c0 - IN1 + (k + 0.5) * CELL;
        if (entrance && (k === 4 || k === 5)) continue;
        o.push({ a: c - 0.5, b: c + 0.5, h: DH });
      }
      if (entrance) o.push({ a: c0 - 1.6, b: c0 + 1.6, h: 3.36 });
      return o;
    };
    wall(M, 'x', cx - IN1, cx + IN1, cz + IN0, cz + IN1, VH, doors(cx, true));
    wall(M, 'x', cx - IN1, cx + IN1, cz - IN1, cz - IN0, VH, doors(cx, false));
    wall(M, 'z', cz - IN0, cz + IN0, cx - IN1, cx - IN0, VH, doors(cz, false));
    wall(M, 'z', cz - IN0, cz + IN0, cx + IN0, cx + IN1, VH, doors(cz, false));
    // cell partitions
    for (let k = 0; k <= 10; k++) {
      const p = -IN1 + k * CELL;
      if (!(Math.abs(p) < 0.1)) box(M, cx + p - 0.25, cx + p + 0.25, 0, VH, cz + IN1, cz + OUT - OW);      // south range (open entrance hall)
      box(M, cx + p - 0.25, cx + p + 0.25, 0, VH, cz - OUT + OW, cz - IN1);                              // north
      box(M, cx - OUT + OW, cx - IN1, 0, VH, cz + p - 0.25, cz + p + 0.25);                              // west
      box(M, cx + IN1, cx + OUT - OW, 0, VH, cz + p - 0.25, cz + p + 0.25);                              // east
    }
    // verandah: a moulded plinth, two storeys of piers, the gallery floor with its parapet, the roof
    moulding(M, cx, cz, 11.9, PLINTH.map(([o, y0, y1]) => [o, y0 * 0.75, y1 * 0.75]), true);
    ring(M, cx, cz, 11.9, IN0, 0, 0.32);
    const PL = 12.2, pil = [];
    for (let k = 0; k <= 8; k++) { const p = -PL + k * PL / 4; pil.push([p, PL], [p, -PL]); if (k > 0 && k < 8) pil.push([PL, p], [-PL, p]); }
    const oct = (r, h) => { const g = new THREE.CylinderGeometry(r, r, h, 8, 1, true); g.rotateY(Math.PI / 8); return g; };
    for (const [px, pz] of pil) {
      const x = cx + px, z = cz + pz;
      box(M, x - 0.44, x + 0.44, 0.3, 0.62, z - 0.44, z + 0.44);                                         // pier base
      if (lite && !hero) { box(M, x - 0.3, x + 0.3, 0.62, 3.64, z - 0.3, z + 0.3); box(M, x - 0.22, x + 0.22, 5.0, VH - 0.3, z - 0.22, z + 0.22); continue; }
      box(M, x - 0.38, x + 0.38, 0.62, 0.8, z - 0.38, z + 0.38);
      if (hero) put(M, oct(0.3, 2.84), x, 0.8 + 1.42, z); else box(M, x - 0.3, x + 0.3, 0.8, 3.64, z - 0.3, z + 0.3);
      box(M, x - 0.38, x + 0.38, 3.36, 3.5, z - 0.38, z + 0.38);                                         // capital: necking, abacus
      box(M, x - 0.46, x + 0.46, 3.5, 3.64, z - 0.46, z + 0.46);
      box(M, x - 0.26, x + 0.26, 5.0, 5.18, z - 0.26, z + 0.26);
      if (hero) put(M, oct(0.21, VH - 5.6), x, 5.18 + (VH - 5.6) / 2, z); else box(M, x - 0.22, x + 0.22, 5.18, VH - 0.42, z - 0.22, z + 0.22);
      box(M, x - 0.3, x + 0.3, VH - 0.42, VH - 0.3, z - 0.3, z + 0.3);
    }
    // timber: a lintel beam on the piers, brackets, joist ends under the gallery, the upper storey's beam
    if (hero) {
      for (const s of [1, -1]) {
        box(woodMat, cx - PL - 0.3, cx + PL + 0.3, 3.64, 3.98, cz + s * PL - 0.22, cz + s * PL + 0.22);
        box(woodMat, cx + s * PL - 0.22, cx + s * PL + 0.22, 3.64, 3.98, cz - PL - 0.3, cz + PL + 0.3);
        box(woodMat, cx - PL - 0.2, cx + PL + 0.2, VH - 0.3, VH - 0.04, cz + s * PL - 0.16, cz + s * PL + 0.16);
        box(woodMat, cx + s * PL - 0.16, cx + s * PL + 0.16, VH - 0.3, VH - 0.04, cz - PL - 0.2, cz + PL + 0.2);
      }
      for (const [px, pz] of pil) {
        const along = Math.abs(Math.abs(pz) - PL) < 0.01 ? 'x' : 'z';
        if (Math.abs(px) === PL && Math.abs(pz) === PL) continue;
        if (along === 'x') box(woodMat, cx + px - 0.62, cx + px + 0.62, 3.4, 3.64, cz + pz - 0.14, cz + pz + 0.14);
        else box(woodMat, cx + px - 0.14, cx + px + 0.14, 3.4, 3.64, cz + pz - 0.62, cz + pz + 0.62);
      }
      for (let a = -PL + 0.3; a <= PL - 0.3; a += lite ? 1.24 : 0.62) for (const s of [1, -1]) {
        box(woodMat, cx + a - 0.07, cx + a + 0.07, 3.98, 4.12, cz + s * (PL - 0.5), cz + s * (PL - 0.22));
        box(woodMat, cx + s * (PL - 0.5), cx + s * (PL - 0.22), 3.98, 4.12, cz + a - 0.07, cz + a + 0.07);
      }
    }
    ring(M, cx, cz, 11.85, IN0, 4.12, 4.32);                                                               // gallery floor
    ring(M, cx, cz, 11.7, 11.92, 4.18, 4.3);                                                               // its nosing
    ring(M, cx, cz, 11.85, 12.2, 4.32, 4.96);                                                              // parapet
    ring(M, cx, cz, 11.75, 12.3, 4.96, 5.06);                                                              // its coping
    ring(M, cx, cz, 11.85, OUT + 0.25, VH, VH + 0.32);                                                     // roof
    ring(M, cx, cz, 11.7, 11.88, VH + 0.02, VH + 0.26);                                                    // eave fascia
    ring(M, cx, cz, OUT - 0.4, OUT + 0.25, VH + 0.32, VH + 1.1);                                           // parapets
    ring(M, cx, cz, OUT - 0.5, OUT + 0.35, VH + 1.1, VH + 1.2);
    // merlons on the outer parapet, corner pavilions with little domes, rain spouts
    for (let side = 0; side < 4; side++) {
      const Mf = frame(cx, cz, side, OUT, false);
      if (!lite || hero) for (let u = -OUT + 1.2; u <= OUT - 1.2; u += 1.25) if (!(side === 0 && Math.abs(u) < 3.6)) fbox(M, Mf, u - 0.3, u + 0.3, VH + 1.2, VH + 1.62, -0.45, 0.25);
      for (let u = -OUT + 4; u < OUT - 3; u += 8) fbox(woodMat, Mf, u - 0.08, u + 0.08, VH + 0.1, VH + 0.24, 0.2, 0.75);
    }
    if (!lite || hero) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + sx * (OUT - 1.6), z = cz + sz * (OUT - 1.6);
      box(M, x - 1.3, x + 1.3, VH + 0.32, VH + 0.6, z - 1.3, z + 1.3);
      for (const a of [-1, 1]) for (const b of [-1, 1]) box(M, x + a * 0.95 - 0.16, x + a * 0.95 + 0.16, VH + 0.6, VH + 2.3, z + b * 0.95 - 0.16, z + b * 0.95 + 0.16);
      box(M, x - 1.25, x + 1.25, VH + 2.3, VH + 2.5, z - 1.25, z + 1.25);
      box(M, x - 1.4, x + 1.4, VH + 2.5, VH + 2.62, z - 1.4, z + 1.4);
      put(M, stupaGeo(0.9, lite ? 8 : 12, 5), x, VH + 2.62, z);
      put(M, new THREE.CylinderGeometry(0.03, 0.05, 0.6, 5), x, VH + 2.62 + 1.1 + 0.3, z);
    }
    ring(M, cx, cz, 11.85, 12.25, VH + 0.32, VH + 0.9);
    ring(M, cx, cz, 11.78, 12.32, VH + 0.9, VH + 0.98);
    // inner (courtyard) faces of the cell ranges: plinth, cornice, string course at the gallery
    moulding(M, cx, cz, IN0, CORNICE.map(([o, y0, y1]) => [o * 0.7, VH + y0 * 0.7, VH + y1 * 0.7]), true);
    // outer face: moulded plinth, string course, pilasters with bases and capitals, a stepped cornice
    moulding(M, cx, cz, OUT, PLINTH.map(([o, y0, y1]) => [o * 2.4, y0 * 1.6, y1 * 1.6]), false);
    ring(M, cx, cz, OUT, OUT + 0.16, 4.0, 4.32);
    ring(M, cx, cz, OUT, OUT + 0.26, 4.06, 4.2);
    moulding(M, cx, cz, OUT, CORNICE.map(([o, y0, y1]) => [o, VH + y0, VH + y1]), false);
    for (let k = 0; k <= 12; k++) {
      const p = -OUT + 0.4 + k * (2 * OUT - 0.8) / 12;
      for (let side = 0; side < 4; side++) {
        if (side === 0 && Math.abs(p) <= 3.4) continue;
        const Mf = frame(cx, cz, side, OUT, false);
        fbox(M, Mf, p - 0.35, p + 0.35, 0.6, VH - 0.62, 0, 0.18);
        if (lite && !hero) continue;
        fbox(M, Mf, p - 0.45, p + 0.45, 0.67, 0.95, 0, 0.3);
        fbox(M, Mf, p - 0.45, p + 0.45, VH - 0.95, VH - 0.62, 0, 0.26);
      }
    }
    // gate porch: piers, a lintel, a corbelled arch over the gate, steps
    box(M, cx - 3.4, cx - 2.0, 0, VH + 0.9, cz + OUT, cz + OUT + 2.6); box(M, cx + 2.0, cx + 3.4, 0, VH + 0.9, cz + OUT, cz + OUT + 2.6);
    box(M, cx - 3.4, cx + 3.4, 3.36, VH + 0.9, cz + OUT + 1.6, cz + OUT + 2.6);
    box(M, cx - 3.6, cx + 3.6, VH + 0.9, VH + 1.2, cz + OUT - 0.1, cz + OUT + 2.8);
    for (const s of [-1, 1]) {
      box(M, cx + s * 3.4, cx + s * 3.62, 0, 1.0, cz + OUT, cz + OUT + 2.8);
      box(M, cx + s * 3.36, cx + s * 3.56, VH - 0.6, VH + 0.9, cz + OUT, cz + OUT + 2.7);
    }
    box(woodMat, cx - 2.15, cx + 2.15, 3.1, 3.36, cz + OUT + 1.55, cz + OUT + 2.65);
    for (let s = 0; s < 3; s++) box(M, cx - 2.8, cx + 2.8, 0, 0.6 - s * 0.2, cz + OUT + 2.6, cz + OUT + 3.2 + s * 0.6);
    for (const s of [-1, 1]) box(M, cx + s * 2.8, cx + s * 3.1, 0, 0.75, cz + OUT + 2.6, cz + OUT + 4.6);
    // courtyard: paving (herringbone in the shader), the platform, the well
    box(M, cx - 11.9, cx + 11.9, 0, 0.1, cz - 11.9, cz + 11.9);
    box(M, cx + 5.6, cx + 10.6, 0, 1.0, cz - 2.6, cz + 2.6);
    ring(M, cx + 8.1, cz, 2.5, 2.7, 0, 0.18); ring(M, cx + 8.1, cz, 2.5, 2.62, 0.18, 0.3);
    ring(M, cx + 8.1, cz, 2.5, 2.66, 0.84, 0.92); ring(M, cx + 8.1, cz, 2.5, 2.74, 0.92, 1.04);
    for (let s = 0; s < 3; s++) box(M, cx + 4.7 + s * 0.3, cx + 5.6, 0, 0.34 * (s + 1), cz - 1.2, cz + 1.2);
    box(M, cx + 4.6, cx + 5.6, 0, 0.5, cz - 1.45, cz - 1.2); box(M, cx + 4.6, cx + 5.6, 0, 0.5, cz + 1.2, cz + 1.45);
    // the well: a brick shaft, a carved stone ring, a stone apron, a timber frame with a pulley
    put(M, new THREE.CylinderGeometry(0.95, 1.0, 0.7, hero ? 24 : 14, 1, hero), cx - 6.5, 0.35, cz + 6.5);
    const water = new THREE.CircleGeometry(0.74, 18); water.rotateX(-Math.PI / 2); put(waterMat, water, cx - 6.5, 0.45, cz + 6.5);
    if (hero) {
      const prof = [[0.74, 0.6], [0.74, 0.98], [0.82, 1.02], [1.02, 1.02], [1.08, 0.98], [1.08, 0.94], [1.02, 0.9], [1.04, 0.84], [1.12, 0.8], [1.12, 0.72], [1.04, 0.68], [1.04, 0.6]];
      put(stoneMat, lathe(prof.slice().reverse(), 32), cx - 6.5, 0, cz + 6.5);
      put(stoneMat, lathe([[1.0, 0.1], [1.9, 0.1], [1.95, 0.13], [1.9, 0.16], [1.0, 0.16]].reverse(), 32), cx - 6.5, 0, cz + 6.5);
      for (const s of [-1, 1]) {
        box(woodMat, cx - 6.5 + s * 1.3 - 0.08, cx - 6.5 + s * 1.3 + 0.08, 0.16, 2.3, cz + 6.42, cz + 6.58);
        box(stoneMat, cx - 6.5 + s * 1.3 - 0.14, cx - 6.5 + s * 1.3 + 0.14, 0.12, 0.28, cz + 6.36, cz + 6.64);
      }
      box(woodMat, cx - 8.0, cx - 5.0, 2.22, 2.36, cz + 6.43, cz + 6.57);
      const wheel = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14); wheel.rotateX(Math.PI / 2); put(woodMat, wheel, cx - 6.5, 2.05, cz + 6.5);
      put(woodMat, new THREE.CylinderGeometry(0.008, 0.008, 1.5, 4), cx - 6.31, 1.3, cz + 6.5);
      const pot = lathe([[0.0, 0], [0.1, 0.02], [0.15, 0.1], [0.14, 0.2], [0.08, 0.26], [0.09, 0.3], [0, 0.3]], 12); put(potMat, pot, cx - 6.31, 0.4, cz + 6.5);
      for (const [dx, dz] of [[1.4, 1.2], [1.65, 1.0], [-1.5, 1.3]]) put(potMat, lathe([[0.0, 0], [0.12, 0.02], [0.18, 0.14], [0.16, 0.28], [0.09, 0.34], [0.1, 0.39], [0, 0.39]], 12), cx - 6.5 + dx, 0.15, cz + 6.5 + dz);
    }
    // the courtyard faces of the cell ranges (hero): moulded plinth, pilasters at the partitions, timber-framed
    // doorways under corbelled tops, half-open doors, lamp niches; steps down from the verandah
    if (hero) for (let side = 0; side < 4; side++) {
      const Mf = frame(cx, cz, side, IN0, true);
      for (const [o, y0, y1] of [[0.12, 0.32, 0.44], [0.08, 0.44, 0.56], [0.13, 0.56, 0.62]]) {
        for (let k = 0; k < 10; k++) {
          const c = -IN1 + (k + 0.5) * CELL;
          if (side === 0 && (k === 4 || k === 5)) continue;
          fbox(M, Mf, c - CELL / 2, c - 0.5, y0, y1, 0, o); fbox(M, Mf, c + 0.5, c + CELL / 2, y0, y1, 0, o);
        }
      }
      for (let k = 0; k <= 10; k++) {
        const p = -IN1 + k * CELL;
        if (k === 0 || k === 10 || (side === 0 && k === 5)) continue;
        fbox(M, Mf, p - 0.26, p + 0.26, 0.32, 3.9, 0, 0.12);
        fbox(M, Mf, p - 0.34, p + 0.34, 3.6, 3.76, 0, 0.18);
        fbox(M, Mf, p - 0.2, p + 0.2, 4.32, VH - 0.5, 0, 0.1);
        fbox(M, Mf, p - 0.28, p + 0.28, VH - 0.7, VH - 0.5, 0, 0.16);
      }
      for (let k = 0; k < 10; k++) {
        const c = -IN1 + (k + 0.5) * CELL;
        if (side === 0 && (k === 4 || k === 5)) continue;
        // corbelled top: brick steps closing over the opening
        fbox(M, Mf, c - 0.5, c - 0.36, 2.24, 2.37, -0.8, 0); fbox(M, Mf, c + 0.36, c + 0.5, 2.24, 2.37, -0.8, 0);
        fbox(M, Mf, c - 0.5, c - 0.2, 2.37, 2.5, -0.8, 0); fbox(M, Mf, c + 0.2, c + 0.5, 2.37, 2.5, -0.8, 0);
        // timber frame: jambs, lintel, sill (threshold)
        fbox(woodMat, Mf, c - 0.58, c - 0.44, 0.32, 2.12, -0.06, 0.05); fbox(woodMat, Mf, c + 0.44, c + 0.58, 0.32, 2.12, -0.06, 0.05);
        fbox(woodMat, Mf, c - 0.74, c + 0.74, 2.0, 2.2, -0.08, 0.07);
        fbox(stoneMat, Mf, c - 0.6, c + 0.6, 0.3, 0.37, -0.3, 0.1);
        // dark cell beyond, two leaves (one ajar, one wide open) hung on the jambs
        fbox(rr() < 0.3 ? cellGlowMat : voidMat, Mf, c - 0.5, c + 0.5, 0.3, 2.5, -0.8, -0.74);              // the dark cell beyond the reveal
        const a1 = 0.2 + rr() * 0.9, a2 = 1.1 + rr() * 0.4;
        for (const [hx, sgn, ang] of [[c - 0.44, 1, a1], [c + 0.44, -1, a2]]) {
          const parts = [new THREE.BoxGeometry(0.44, 1.78, 0.045).translate(sgn * 0.22, 0.34 + 0.89, 0)];
          if (!lite) for (const yb of [0.55, 1.2, 1.85]) parts.push(new THREE.BoxGeometry(0.42, 0.06, 0.03).translate(sgn * 0.22, yb, -0.035));
          const g = mergeGeometries(parts);
          g.rotateY(sgn * ang); g.translate(hx, 0, -0.08);
          fgeo(doorMat, Mf, g);
        }
        // lamp niche between this door and the next pilaster (alternate sides)
        const nu = c + (k % 2 ? 0.98 : -0.98);
        fbox(voidMat, Mf, nu - 0.14, nu + 0.14, 1.32, 1.64, -0.02, 0.012);
        fbox(M, Mf, nu - 0.22, nu + 0.22, 1.24, 1.32, 0, 0.09);
        fbox(M, Mf, nu - 0.2, nu - 0.14, 1.32, 1.7, 0, 0.05); fbox(M, Mf, nu + 0.14, nu + 0.2, 1.32, 1.7, 0, 0.05);
        fbox(M, Mf, nu - 0.2, nu + 0.2, 1.64, 1.72, 0, 0.06); fbox(M, Mf, nu - 0.12, nu + 0.12, 1.72, 1.8, 0, 0.04);
        niches.push(V(nu, 1.4, 0.04).applyMatrix4(Mf));
        // the upper storey's cell door, on the gallery: dark opening, timber frame, a stepped brick hood
        fbox(rr() < 0.25 ? cellGlowMat : voidMat, Mf, c - 0.42, c + 0.42, 4.32, 6.2, -0.01, 0.012);
        fbox(woodMat, Mf, c - 0.52, c - 0.42, 4.32, 6.2, 0, 0.06); fbox(woodMat, Mf, c + 0.42, c + 0.52, 4.32, 6.2, 0, 0.06);
        fbox(woodMat, Mf, c - 0.66, c + 0.66, 6.2, 6.36, 0, 0.08);
        fbox(M, Mf, c - 0.6, c + 0.6, 6.36, 6.5, 0, 0.1); fbox(M, Mf, c - 0.4, c + 0.4, 6.5, 6.64, 0, 0.07); fbox(M, Mf, c - 0.2, c + 0.2, 6.64, 6.78, 0, 0.04);
      }
      // steps from the courtyard up onto the verandah (centre of each side)
      const Mv = frame(cx, cz, side, 11.9, true);
      for (let s = 0; s < 2; s++) fbox(M, Mv, -1.3, 1.3, 0, 0.11 * (s + 1) + 0.1, 0, 0.32 * (2 - s));
      fbox(M, Mv, -1.5, -1.3, 0, 0.42, 0, 0.7); fbox(M, Mv, 1.3, 1.5, 0, 0.42, 0, 0.7);
    }
  }

  // a stupa of revolution on a base at y = 0: moulded drum (base torus, dado, two bands), a hemispherical dome
  // (R = dome radius; everything scales with it), built from the bottom up so its faces look outwards
  function stupaGeo(R, seg, steps = 10) {
    const k = R / 4.0;
    const pts = [[0.001, 0], [4.6, 0], [4.6, 0.18], [4.42, 0.26], [4.42, 0.6], [4.56, 0.66], [4.56, 0.8], [4.3, 0.86], [4.3, 1.1], [4.5, 1.16], [4.5, 1.3], [4.08, 1.36]];
    for (let i = 1; i <= steps; i++) { const a = (i / steps) * Math.PI / 2; pts.push([Math.max(0.001, 4.0 * Math.cos(a)), 1.36 + 3.6 * Math.sin(a)]); }
    return lathe(pts.map(([r, y]) => [r * k, y * k]), seg);
  }

  // ---- chaitya: a stepped brick temple with corner towers, a great stair to the south, a stupa on top
  function temple(cx, cz) {
    const M = temMat;
    box(M, cx - 17, cx + 17, 0, 1.0, cz - 17, cz + 17);
    ring(M, cx, cz, 17, 17.3, 0.7, 1.0);
    const tiers = [[15, 1.0, 6.0], [12, 6.0, 11.0], [9, 11.0, 15.4], [5.4, 15.4, 20.4]];
    for (const [h, y0, y1] of tiers) {
      box(M, cx - h, cx + h, y0, y1, cz - h, cz + h);
      ring(M, cx, cz, h, h + 0.35, y1 - 0.4, y1);                     // cornice
      ring(M, cx, cz, h, h + 0.2, y0, y0 + 0.45);                      // base band
      // central projections on the four faces, each with its own cornice
      const pr = h / 3, PJ = 0.6, yt = y1 - 0.4;
      box(M, cx - pr, cx + pr, y0, yt, cz + h, cz + h + PJ); box(M, cx - pr, cx + pr, y0, yt, cz - h - PJ, cz - h);
      box(M, cx + h, cx + h + PJ, y0, yt, cz - pr, cz + pr); box(M, cx - h - PJ, cx - h, y0, yt, cz - pr, cz + pr);
      box(M, cx - pr - 0.2, cx + pr + 0.2, yt, y1, cz + h, cz + h + PJ + 0.3); box(M, cx - pr - 0.2, cx + pr + 0.2, yt, y1, cz - h - PJ - 0.3, cz - h);
      box(M, cx + h, cx + h + PJ + 0.3, yt, y1, cz - pr - 0.2, cz + pr + 0.2); box(M, cx - h - PJ - 0.3, cx - h, yt, y1, cz - pr - 0.2, cz + pr + 0.2);
      // pilasters
      const n = Math.max(3, Math.round(h * 2 / 2.3));
      if (!lite) for (let k = 0; k <= n; k++) {
        const p = -h + 0.5 + k * (2 * h - 1) / n;
        const f = Math.abs(p) < pr - 0.3 ? h + PJ : h;
        if (Math.abs(Math.abs(p) - pr) < 0.35) continue;
        for (const sgn of [1, -1]) {
          box(M, cx + p - 0.24, cx + p + 0.24, y0 + 0.45, yt, cz + sgn * f, cz + sgn * (f + 0.22));
          box(M, cx + sgn * f, cx + sgn * (f + 0.22), y0 + 0.45, yt, cz + p - 0.24, cz + p + 0.24);
        }
      }
    }
    // shrine door and the stupa: drum, dome, harmika, mast and parasols
    box(voidMat, cx - 1.3, cx + 1.3, 15.4, 18.6, cz + 5.4, cz + 5.5);
    put(M, stupaGeo(4.0, lite ? 18 : 28), cx, 20.4, cz);
    box(M, cx - 1.1, cx + 1.1, 25.3, 25.5, cz - 1.1, cz + 1.1);
    box(M, cx - 0.9, cx + 0.9, 25.5, 26.2, cz - 0.9, cz + 0.9);
    box(M, cx - 1.15, cx + 1.15, 26.2, 26.4, cz - 1.15, cz + 1.15);
    put(M, new THREE.CylinderGeometry(0.14, 0.14, 3.4, 8), cx, 27.9, cz);
    for (const [r, y] of [[1.3, 27.0], [1.0, 27.8], [0.7, 28.5]]) put(M, new THREE.CylinderGeometry(r, r, 0.14, 16), cx, y, cz);
    // corner towers
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = cx + sx * 15, z = cz + sz * 15;
      box(M, x - 2.7, x + 2.7, 1.0, 15.6, z - 2.7, z + 2.7);
      box(M, x - 3.0, x + 3.0, 15.0, 15.6, z - 3.0, z + 3.0);
      box(M, x - 2.1, x + 2.1, 15.6, 16.9, z - 2.1, z + 2.1);
      box(M, x - 1.5, x + 1.5, 16.9, 17.8, z - 1.5, z + 1.5);
      put(M, new THREE.SphereGeometry(1.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, 17.8, z);
      for (const [a, b] of [[-2.7, -1.0], [1.0, 2.7]]) {                   // corner pilasters
        box(M, x + a, x + b, 1.0, 15.0, z + sz * 2.7, z + sz * 2.95);
        box(M, x + sx * 2.7, x + sx * 2.95, 1.0, 15.0, z + a, z + b);
      }
    }
    // the great stair on the south face, up to the second terrace, between stepped balustrades
    const N = 36, rise = 11.0 / N, run = 0.44, z0 = cz + 12;
    for (let i = 0; i < N; i++) {
      const ze = z0 + (N - i) * run;
      box(M, cx - 3.0, cx + 3.0, 0, (i + 1) * rise, z0, ze);
      if (i % 3 === 0) for (const s of [-1, 1]) box(M, cx + s * 3.0, cx + s * 3.8, 0, (i + 3) * rise + 0.9, z0, ze);
    }
    // votive stupas round the forecourt
    for (let k = 0; k < 8; k++) {
      const x = cx + (k - 3.5) * 4.4, z = cz + 17 + 12 + (k % 2) * 2.2;
      if (Math.abs(x - cx) < 4.2) continue;
      box(M, x - 1.25, x + 1.25, 0, 0.12, z - 1.25, z + 1.25);
      box(M, x - 1.12, x + 1.12, 0.12, 0.5, z - 1.12, z + 1.12);
      box(M, x - 1.22, x + 1.22, 0.5, 0.6, z - 1.22, z + 1.22);
      put(M, stupaGeo(0.85, lite ? 8 : 12, 5), x, 0.6, z);
      box(M, x - 0.24, x + 0.24, 1.6, 1.86, z - 0.24, z + 0.24);
      box(M, x - 0.32, x + 0.32, 1.86, 1.94, z - 0.32, z + 0.32);
      put(M, new THREE.CylinderGeometry(0.035, 0.035, 0.6, 5), x, 2.2, z);
      for (const [rr2, yy] of [[0.32, 2.16], [0.22, 2.34]]) put(M, new THREE.CylinderGeometry(rr2 * 0.8, rr2, 0.05, 10), x, yy, z);
    }
  }

  // ---- the library: four floors of shelves; its west face (towards the hero vihara) can be sliced away
  const bundleParts = [];
  function shelfUnit(x, z, face, w, y0, r) {
    // face: +1 → faces +x / -1 → faces -x (unit runs along z) ; +2/-2 → faces ±z (runs along x)
    const alongZ = Math.abs(face) === 1, s = Math.sign(face), D = 0.5, H = 3.7;
    const B = (a0, a1, yy0, yy1, d0, d1) => {     // a along the unit, d out from the back (0 = back)
      if (alongZ) box(woodMat, x + s * d0, x + s * d1, yy0, yy1, z + a0, z + a1);
      else box(woodMat, x + a0, x + a1, yy0, yy1, z + s * d0, z + s * d1);
    };
    B(-w / 2, w / 2, y0, y0 + H, 0, 0.05);
    B(-w / 2, -w / 2 + 0.07, y0, y0 + H, 0, D); B(w / 2 - 0.07, w / 2, y0, y0 + H, 0, D);
    const NS = 5;
    for (let k = 0; k <= NS; k++) {
      const yb = y0 + 0.12 + k * (H - 0.2) / NS;
      B(-w / 2, w / 2, yb - 0.05, yb, 0, D);
      if (k === NS) break;
      // palm-leaf bundles lying along the shelf, in stacks of one to three
      let a = -w / 2 + 0.12;
      while (a < w / 2 - 0.5) {
        const L = lite ? 1.0 + r() * 0.3 : 0.36 + r() * 0.1, n = lite ? 1 : 1 + Math.floor(r() * 3), dd = 0.12 + r() * 0.14;
        for (let j = 0; j < n; j++) {
          const th = lite ? 0.1 : 0.055, bw = lite ? 0.24 : 0.075 + r() * 0.02;
          const g = new THREE.BoxGeometry(alongZ ? bw : L, th, alongZ ? L : bw);
          const cxx = alongZ ? x + s * (dd + bw / 2) : x + a + L / 2, czz = alongZ ? z + a + L / 2 : z + s * (dd + bw / 2);
          g.translate(cxx, yb + th / 2 + j * (th + 0.004), czz);
          const pal = [[0.42, 0.06, 0.03], [0.6, 0.24, 0.04], [0.5, 0.3, 0.1], [0.3, 0.05, 0.04], [0.55, 0.42, 0.25], [0.2, 0.08, 0.05]][Math.floor(r() * 6)];
          const v = 0.8 + r() * 0.4, seed = r();
          const n24 = g.attributes.position.count;
          g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n24 }, () => [pal[0] * v, pal[1] * v, pal[2] * v]).flat(), 3));
          g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(n24).fill(seed), 1));
          bundleParts.push(g);
        }
        a += L + 0.04 + r() * 0.06;
      }
    }
  }
  function library() {
    const { x0, x1, z0, z1 } = LIB, M = libMat, r = rng(427);
    box(M, x0 - 0.6, x1 + 0.6, 0, 0.6, z0 - 0.6, z1 + 0.6);                                     // plinth
    box(M, x0, x1, 0, LIB_TOP + 0.4, z0, z0 + 1); box(M, x0, x1, 0, LIB_TOP + 0.4, z1 - 1, z1);    // north / south walls
    box(M, x1 - 1, x1, 0, LIB_TOP + 0.4, z0 + 1, z1 - 1);                                          // east wall
    for (const y of FL.slice(1)) box(M, x0 + 1, x1 - 1, y - 0.4, y, z0 + 1, z1 - 1);               // floors
    box(M, x0, x1, LIB_TOP, LIB_TOP + 0.4, z0, z1);                                                  // roof
    // roof parapet and outer pilasters / string courses on the three solid sides
    box(M, x0, x1, LIB_TOP + 0.4, LIB_TOP + 1.3, z0, z0 + 0.4); box(M, x0, x1, LIB_TOP + 0.4, LIB_TOP + 1.3, z1 - 0.4, z1);
    box(M, x1 - 0.4, x1, LIB_TOP + 0.4, LIB_TOP + 1.3, z0, z1); box(M, x0, x0 + 0.4, LIB_TOP + 0.4, LIB_TOP + 1.3, z0, z1);
    for (const y of FL.slice(1)) {
      box(M, x0 - 0.15, x1 + 0.15, y - 0.4, y, z0 - 0.15, z0); box(M, x0 - 0.15, x1 + 0.15, y - 0.4, y, z1, z1 + 0.15);
      box(M, x1, x1 + 0.15, y - 0.4, y, z0, z1);
    }
    for (let k = 0; k <= 8; k++) {
      const p = x0 + 0.5 + k * (x1 - x0 - 1) / 8;
      box(M, p - 0.3, p + 0.3, 0.6, LIB_TOP, z0 - 0.16, z0); box(M, p - 0.3, p + 0.3, 0.6, LIB_TOP, z1, z1 + 0.16);
      const q = z0 + 0.5 + k * (z1 - z0 - 1) / 8;
      box(M, x1, x1 + 0.16, 0.6, LIB_TOP, q - 0.3, q + 0.3);
    }
    // the west facade (sliced away in the library beat): wall, pilasters, string courses
    box(facadeMat, x0, x0 + 1, 0.6, LIB_TOP + 0.4, z0 + 1, z1 - 1);
    for (let k = 0; k <= 8; k++) { const q = z0 + 1.4 + k * (z1 - z0 - 2.8) / 8; box(facadeMat, x0 - 0.16, x0, 0.6, LIB_TOP, q - 0.3, q + 0.3); }
    for (const y of FL.slice(1)) box(facadeMat, x0 - 0.15, x0, y - 0.4, y, z0 + 1, z1 - 1);
    box(facadeMat, x0 - 0.9, x0, 0.6, 4.2, -1.4, 1.4);                                             // door frame
    // shelves: a row facing the opening, a second row behind it, the back wall, the side walls
    for (const y of FL) {
      const y0 = y;
      for (const zc of [-9.0, -4.6, 4.6, 9.0]) shelfUnit(x0 + 6.5, zc, -1, 4.0, y0, r);
      if (!lite) for (const zc of [-8.0, -3.0, 3.0, 8.0]) shelfUnit(x0 + 12.5, zc, -1, 4.6, y0, r);
      if (!lite) for (const zc of [-10.4, -6.8, -3.2, 0.4, 4.0, 7.6, 11.0]) if (Math.abs(zc) < 12) shelfUnit(x1 - 1, Math.min(zc, 11.1), -1, 3.4, y0, r);
      for (const xc of [x0 + 4, x0 + 8, x0 + 12, x0 + 16]) { shelfUnit(xc, z0 + 1, 2, 3.8, y0, r); shelfUnit(xc, z1 - 1, -2, 3.8, y0, r); }
      // low reading desks near the opening
      for (const zc of [-3.2, 3.2]) box(woodMat, x0 + 2.2, x0 + 3.0, y0, y0 + 0.45, zc - 1.2, zc + 1.2);
    }
  }

  // the scholars' groups in the hero courtyard (the last one on the raised platform)
  const GROUPS = [V(-3.6, 0.1, -6.6), V(4.6, 0.1, -7.6), V(-2.6, 0.1, 3.6), V(3.6, 0.1, 7.4), V(8.1, 1.0, 0.0)];
  zone = 'v0';
  for (const g of GROUPS.slice(0, 4)) box(vihMat, g.x - 0.6, g.x + 0.6, 0.1, 0.35, g.z - 0.6, g.z + 0.6);
  for (const x of VIH_X) { zone = 'v' + x; vihara(x, 0, x === 0); }
  for (const x of TEM_X) { zone = 't' + x; temple(x, TEM_Z); }
  zone = 'lib'; library();
  // the avenue: a paved processional way with kerbs
  zone = 'site';
  box(vihMat, -170, 170, 0, 0.12, AVE.z0, AVE.z1);
  box(vihMat, -170, 170, 0, 0.3, AVE.z1, AVE.z1 + 0.6); box(vihMat, -170, 170, 0, 0.3, AVE.z0 - 0.6, AVE.z0);

  const zones = {};
  for (const [z, byMat] of accs) {
    const grp = zones[z] = new THREE.Group();
    scene.add(grp);
    for (const [mat, list] of byMat) {
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = mat === vihMat || mat === temMat || mat === libMat || mat === facadeMat; m.receiveShadow = true;
      if (mat.userData.depth) m.customDepthMaterial = mat.userData.depth;
      m.geometry.computeBoundingSphere();
      grp.add(m);
    }
  }
  // out of the shot from the scholars' courtyard to the library (behind the camera or wide of its frame,
  // at every delivery aspect): the western monasteries and temples
  const offInCourt = ['v-110', 'v-55', 't-82.5', 't-27.5'].map((z) => zones[z]);
  // ruin dressing: brickbats and low rubble heaps at the feet of the walls, grass tufts; each one clears as
  // the build front reaches it. Sampled near the walls of the monasteries (denser where the camera looks).
  const rd = rng(1206);
  const wallDist = (lx, lz) => {           // distance (m) from a point to the nearest wall of a vihara at the origin
    const m = Math.max(Math.abs(lx), Math.abs(lz)), tg = Math.abs(lx) >= Math.abs(lz) ? lz : lx;
    let d = Math.min(Math.max(IN0 - m, m - IN1), Math.max(OUT - OW - m, m - OUT));
    if (m > IN1 && m < OUT - OW) { const q = ((tg + IN1) % CELL + CELL) % CELL; d = Math.min(d, Math.min(q, CELL - q) - 0.25); }
    return d;
  };
  const nearWall = (cx, cz, spread) => {
    for (let tries = 0; tries < 40; tries++) {
      const m = lerp(IN0 - 2.6, OUT + 3.0, rd()), tg = (rd() * 2 - 1) * m, side = Math.floor(rd() * 4);
      const lx = side < 2 ? tg : (side === 2 ? m : -m), lz = side < 2 ? (side === 0 ? m : -m) : tg;
      const d = wallDist(lx, lz);
      if (d < 0.06 || rd() > Math.exp(-d / spread)) continue;
      const mm = Math.max(Math.abs(lx), Math.abs(lz));
      return V(cx + lx, mm < 11.9 ? 0.1 : mm < IN0 ? 0.32 : 0, cz + lz);
    }
    return null;
  };
  const templeFoot = (cx, cz) => { const a = rd() * 4, tg = (rd() * 2 - 1) * 18, m = 17.4 + Math.pow(rd(), 2) * 3.5; const sd = Math.floor(a);
    return V(cx + (sd < 2 ? tg : sd === 2 ? m : -m), 0, cz + (sd < 2 ? (sd === 0 ? m : -m) : tg)); };
  const pickSite = () => { const u = rd(); return u < 0.42 ? [0, 0, 'v'] : u < 0.72 ? [-55, 0, 'v'] : u < 0.8 ? [-110, 0, 'v'] : u < 0.84 ? [110, 0, 'v'] : [TEM_X[Math.floor(rd() * 4)], TEM_Z, 't']; };
  const debris = (geo, mat, n, place) => {
    const im = new THREE.InstancedMesh(geo, mat, n);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let p = null;
      while (!p) { const [cx, cz, k] = pickSite(); p = k === 'v' ? nearWall(cx, cz, place.spread) : templeFoot(cx, cz); }
      place.set(p, i, col);
      im.setMatrixAt(i, _dm.compose(p, _dq.setFromEuler(_de.set(place.tilt * (rd() - 0.5), rd() * 6.28, place.tilt * (rd() - 0.5))), _ds.set(...place.scale())));
      if (place.color) im.setColorAt(i, col);
    }
    im.receiveShadow = true; im.castShadow = false; im.frustumCulled = false;
    scene.add(im);
    return im;
  };
  const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _ds = new THREE.Vector3(), _de = new THREE.Euler();
  const batMat = debrisMaterial(U, 'bat'), heapMat = debrisMaterial(U, 'heap'), grassMat = debrisMaterial(U, 'grass');
  const clay = [[0.34, 0.1, 0.05], [0.43, 0.16, 0.075], [0.26, 0.07, 0.04], [0.45, 0.24, 0.12], [0.2, 0.09, 0.05]];
  debris(new THREE.BoxGeometry(0.24, 0.075, 0.12), batMat, lite ? 400 : 2600, {
    spread: 0.35, tilt: 0.6, color: true, scale: () => [0.5 + rd() * 0.6, 1, 0.6 + rd() * 0.5],
    set: (p, i, c) => { p.y += 0.03; c.setRGB(...clay[Math.floor(rd() * 5)]).multiplyScalar(0.85 + rd() * 0.3); },
  });
  debris(new THREE.IcosahedronGeometry(1, 0), heapMat, lite ? 80 : 260, {
    spread: 0.4, tilt: 0.25, color: true, scale: () => [0.25 + rd() * 0.5, 0.1 + rd() * 0.16, 0.25 + rd() * 0.5],
    set: (p, i, c) => { p.y -= 0.03; c.setRGB(...clay[Math.floor(rd() * 5)]).lerp(new THREE.Color(0.12, 0.08, 0.045), 0.3 + rd() * 0.4).multiplyScalar(0.6); },
  });
  // (the lawn in front of the opening shot gets its own scatter, thinning with distance)
  const lawnGeo = grassTuftGeometry(rng(78));
  const lawn = new THREE.InstancedMesh(lawnGeo, grassMat, lite ? 500 : 2400);
  for (let i = 0; i < lawn.count; i++) {
    let x, z;
    do { if (rd() < 0.6) { x = -50 + rd() * 45; z = 14 + rd() * 32; } else { x = -75 + rd() * 75; z = -2 + Math.pow(rd(), 0.7) * 50; } } while (Math.max(Math.abs(x), Math.abs(z)) < 23 || Math.max(Math.abs(x + 55), Math.abs(z)) < 23);
    const k = 0.45 + rd() * 0.8;
    lawn.setMatrixAt(i, _dm.compose(V(x, 0, z), _dq.setFromEuler(_de.set(0, rd() * 6.28, 0)), _ds.set(k, k * (0.6 + rd() * 0.7), k)));
  }
  lawn.receiveShadow = true; lawn.frustumCulled = false;
  scene.add(lawn);
  const grassTufts = debris(grassTuftGeometry(rng(77)), grassMat, lite ? 650 : 3600, {
    spread: 0.8, tilt: 0.3, color: false, scale: () => { const k = 0.6 + rd() * 0.9; return [k, k * (0.7 + rd() * 0.6), k]; },
    set: () => {},
  });

  // manuscripts: one mesh, vertex colours, an emissive glow that climbs the floors
  const GL = { uGlowY: { value: -10 }, uGlowK: { value: 0 }, uTime: { value: 0 } };
  const bundleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  bundleMat.userData.noDetail = true;
  bundleMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, GL, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSeed; varying float vSeed; varying float vWY; varying vec2 vWXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSeed = aSeed; vec4 bwp = modelMatrix * vec4(transformed, 1.0); vWY = bwp.y; vWXZ = bwp.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlowY, uGlowK, uTime, uRise, uDelayK; uniform vec2 uCentre; varying float vSeed; varying float vWY; varying vec2 vWXZ;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWY > uRise - uDelayK * length(vWXZ - uCentre) - 0.3) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fy = 0.6 + 5.0 * floor((vWY - 0.6) / 5.0);
        float lit = smoothstep(fy + vSeed * 1.6, fy + vSeed * 1.6 + 1.2, uGlowY);
        float fl = 0.75 + 0.25 * sin(uTime * (3.0 + vSeed * 4.0) + vSeed * 40.0);
        totalEmissiveRadiance += mix(vColor.rgb * 2.0, vec3(1.0, 0.62, 0.26), 0.65) * lit * fl * uGlowK * (0.5 + vSeed);`);
  };
  bundleMat.customProgramCacheKey = () => 'nalanda-bundles-v1';
  const bundles = new THREE.Mesh(mergeGeometries(bundleParts), bundleMat);
  bundles.frustumCulled = false;
  scene.add(bundles);

  // trees round the site: mango groves (Nalanda's own legend: a mango grove bought for the Buddha), neem,
  // peepal and a banyan or two, with ashoka along the approach — beyond the excavations, framing the ruins
  const leafSun = { dir: new THREE.Vector3(0.5, 0.5, 0.5).normalize(), color: new THREE.Color(2, 1.7, 1.3) };
  const forest = (() => {
    const items = [], rf = rng(512);
    const clearOf = (x, z) => x > -150 && x < 150 && z > -108 && z < 40;
    for (let k = 0; k < 4000 && items.length < (lite ? 100 : 180); k++) {
      const x = -420 + rf() * 840, z = -480 + rf() * 620;
      if (clearOf(x, z)) continue;
      if (Math.hypot(x + 30, z - 30) < 70) continue;                    // the opening camera's own lawn
      const grove = Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.4) > -0.1;
      if (!grove && rf() < 0.75) continue;
      const q = rf(), kind = q < 0.45 ? 'mango' : q < 0.7 ? 'neem' : q < 0.84 ? 'peepal' : q < 0.92 ? 'banyan' : 'ashoka';
      const d = Math.min(Math.abs(x) - 150, Math.abs(z + 34) - 74);
      items.push({ kind, x, y: -0.1, z, s: 0.85 + rf() * 0.4, lite: true, tint: 0.85 + rf() * 0.3 });
      void d;
    }
    return NK.plantForest(items, { sun: leafSun, lite, variants: 3, seed: 9, wind: 0.7, castShadow: false });   // (groves round the site: receive only)
  })();
  scene.add(forest.group);

  // ground: lawn over the excavations today, packed earth on the living campus; turns into the map from above
  const ground = new THREE.Mesh(new THREE.CircleGeometry(20000, 96), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial());
  sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);

  // ------------------------------------------------------------------------------------- figures
  const MG = monkGeometries(lite);
  const robeCols = [[0.62, 0.24, 0.035], [0.55, 0.32, 0.07], [0.4, 0.1, 0.035], [0.3, 0.055, 0.035], [0.66, 0.36, 0.08]];
  const robeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.16, 0.095), roughness: 0.6 });
  const rm = rng(630);
  const seated = [], walkers = [];
  // courtyard groups round their teachers (the hero vihara), and the platform
  GROUPS.forEach((g, gi) => {
    const plat = gi === 4;
    seated.push({ p: g.clone().add(V(0, plat ? 0 : 0.25, 0)), ry: plat ? -Math.PI / 2 : rm() * 6.28, s: 1.05, c: 2 });      // the teacher
    const n = plat ? 9 : 6 + Math.floor(rm() * 3);
    for (let k = 0; k < n; k++) {
      const a = plat ? Math.PI + (k / (n - 1) - 0.5) * 1.9 : (k / n) * Math.PI * 1.5 + gi;
      const rr = plat ? 3.6 + (k % 2) * 1.0 : 1.7 + (k % 2) * 0.7;
      const p = V(g.x + Math.cos(a) * rr, plat ? 0.1 : g.y, g.z + Math.sin(a) * rr);
      seated.push({ p, ry: Math.atan2(g.x - p.x, g.z - p.z), s: 0.95 + rm() * 0.1, c: Math.floor(rm() * 5) });
    }
  });
  // readers in the library
  for (const y of FL) for (const zc of [-3.2, 3.2]) for (const dz of [-0.6, 0.6]) seated.push({ p: V(LIB.x0 + 3.6, y, zc + dz), ry: -Math.PI / 2, s: 1, c: Math.floor(rm() * 5) });
  // walkers: the avenue, the verandahs, between the buildings, on the temple stairs
  for (let k = 0; k < (lite ? 40 : 70); k++) {
    const dir = rm() < 0.5 ? 1 : -1;
    walkers.push({ p: V(-150 + rm() * 300, 0.12, lerp(AVE.z0 + 1.5, AVE.z1 - 1.5, rm())), d: V(dir, 0, 0), v: 0.9 + rm() * 0.5, c: Math.floor(rm() * 5) });
  }
  for (let k = 0; k < 16; k++) {
    const side = k % 4, a = -11 + rm() * 22, dir = rm() < 0.5 ? 1 : -1;
    const p = side === 0 ? V(a, 0.3, 13.1) : side === 1 ? V(a, 0.3, -13.1) : side === 2 ? V(13.1, 0.3, a) : V(-13.1, 0.3, a);
    walkers.push({ p, d: side < 2 ? V(dir, 0, 0) : V(0, 0, dir), v: 0.7 + rm() * 0.4, c: Math.floor(rm() * 5) });
  }
  for (let k = 0; k < 24; k++) {
    const x = -140 + rm() * 280, dir = rm() < 0.5 ? 1 : -1;
    walkers.push({ p: V(x, 0.02, lerp(21, AVE.z1, rm())), d: V(0, 0, -dir), v: 0.8 + rm() * 0.4, c: Math.floor(rm() * 5) });
  }
  for (const tx of TEM_X) for (let k = 0; k < 3; k++) {
    const i = 4 + Math.floor(rm() * 28);
    walkers.push({ p: V(tx - 2 + rm() * 4, (i + 1) * 11 / 36, TEM_Z + 12 + (36 - i) * 0.44 - 0.2), d: V(0, 0, 0), v: 0, c: Math.floor(rm() * 5) });
  }
  // (figures a few texels wide in a shadow map that spans the campus: they receive but do not cast)
  const mkInst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const seatRobe = mkInst(MG.seatRobe, robeMat, seated.length), seatHead = mkInst(MG.seatHead, headMat, seated.length);
  const walkRobe = mkInst(MG.standRobe, robeMat, walkers.length), walkHead = mkInst(MG.standHead, headMat, walkers.length);
  const tmpC = new THREE.Color();
  seated.forEach((s, i) => seatRobe.setColorAt(i, tmpC.setRGB(...robeCols[s.c])));
  walkers.forEach((s, i) => walkRobe.setColorAt(i, tmpC.setRGB(...robeCols[s.c])));
  const frontAt = (x, z) => U.uRise.value - U.uDelayK.value * Math.hypot(x - U.uCentre.value.x, z - U.uCentre.value.y);

  // ------------------------------------------------------------------------------------- lamps
  // one point cloud: ghee lamps in the courtyards, torches on the avenue, lamps in the library
  const lampPos = [], lampSize = [], lampSeed = [], lampGroup = [];
  const lamp = (p, size, group) => { lampPos.push(p.x, p.y, p.z); lampSize.push(size); lampSeed.push(rm()); lampGroup.push(group); };
  GROUPS.forEach((g, gi) => lamp(g.clone().add(V(gi === 4 ? -1.2 : 0.55, 0.35, gi === 4 ? 0 : 0.4)), 0.9, 0));
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const r = 12.9 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); lamp(V(Math.cos(a) * r, 1.0, Math.sin(a) * r), 0.55, 0); }
  for (const p of niches) lamp(p, 0.32, 0);                              // a ghee lamp in every wall niche
  for (const x of VIH_X) if (x !== 0) { for (let k = 0; k < 6; k++) lamp(V(x - 8 + rm() * 16, 0.8, -8 + rm() * 16), 0.8, 1); }
  for (const x of VIH_X) for (const s of [-1, 1]) lamp(V(x + s * 2.7, 3.0, 22.8), 0.9, 1);
  for (let x = -160; x <= 160; x += 11) { lamp(V(x, 2.6, AVE.z1 + 0.3), 0.6, 1); lamp(V(x + 5.5, 2.6, AVE.z0 - 0.3), 0.6, 1); }
  for (const tx of TEM_X) { for (let k = 0; k < 6; k++) for (const s of [-1, 1]) lamp(V(tx + s * 3.4, (k * 6 + 3) * 11 / 36 + 1.4, TEM_Z + 12 + (36 - k * 6 - 3) * 0.44), 0.8, 1); lamp(V(tx, 16.6, TEM_Z + 5.8), 1.6, 1); }
  for (const y of FL) { for (const zc of [-3.2, 3.2]) lamp(V(LIB.x0 + 2.6, y + 0.7, zc), 0.6, 2); for (const zc of [-6.8, 0, 6.8]) lamp(V(LIB.x0 + 9.5, y + 3.6, zc), 0.8, 2); }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lampPos, 3));
  lampGeo.setAttribute('aSize', new THREE.Float32BufferAttribute(lampSize, 1));
  lampGeo.setAttribute('aSeed', new THREE.Float32BufferAttribute(lampSeed, 1));
  lampGeo.setAttribute('aGroup', new THREE.Float32BufferAttribute(lampGroup, 1));
  const lampMat = new THREE.ShaderMaterial({
    uniforms: { uG: { value: new THREE.Vector3() }, uTime: { value: 0 }, uVP: { value: 800 } },
    vertexShader: `attribute float aSize, aSeed, aGroup; uniform vec3 uG; uniform float uTime, uVP; varying float vI;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float k = aGroup < 0.5 ? uG.x : aGroup < 1.5 ? uG.y : uG.z;
        float fl = 0.8 + 0.2 * sin(uTime * (7.0 + aSeed * 5.0) + aSeed * 30.0) * sin(uTime * 3.1 + aSeed * 11.0);
        float px = aSize * projectionMatrix[1][1] * 0.5 * uVP / max(-mv.z, 0.1);
        vI = k * fl * max(min(1.0, px * px / 9.0), 0.12);
        gl_PointSize = max(px, 3.0);
        gl_Position = projectionMatrix * mv;
        if (k <= 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }`,
    fragmentShader: `varying float vI;
      void main(){
        vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q);
        if (d > 1.0) discard;
        float core = exp(-d * 40.0), halo = exp(-d * 5.0) * 0.35;
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * (core * 6.0 + halo) * vI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const lamps = new THREE.Points(lampGeo, lampMat);
  lamps.frustumCulled = false; lamps.renderOrder = 6;
  scene.add(lamps);
  // the plain by night, seen on the climb: scattered village lamps thinning out with distance
  const vil = [], rv = rng(1190);
  for (let k = 0; k < (lite ? 900 : 2200); k++) {
    const d = k % 2 ? Math.exp(lerp(Math.log(400), Math.log(4e5), Math.pow(rv(), 0.55))) : 4e5 * Math.sqrt(rv()), a = rv() * Math.PI * 2;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    if (Math.hypot(x, z) < 2500) continue;
    const n = 1 + Math.floor(rv() * 4);
    for (let j = 0; j < n; j++) vil.push(x + (rv() - 0.5) * d * 0.004, 2, z + (rv() - 0.5) * d * 0.004);
  }
  const vilGeo = new THREE.BufferGeometry();
  vilGeo.setAttribute('position', new THREE.Float32BufferAttribute(vil, 3));
  const vilMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 }, uR: { value: 1 } },
    vertexShader: 'uniform float uK, uR; varying float vK; void main(){ vK = uK * smoothstep(0.012, 0.1, length(position.xz) / uR); gl_PointSize = 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vK; void main(){ gl_FragColor = vec4(vec3(1.0, 0.6, 0.28) * vK, 1.0); }',
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const villages = new THREE.Points(vilGeo, vilMat);
  villages.frustumCulled = false; villages.renderOrder = 5;
  scene.add(villages);

  // ------------------------------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight('#ffd7a8', 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 1, far: 500 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, 0, -20);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#8aa0c8', '#3a2414', 0.4);
  scene.add(hemi);
  const yardLights = GROUPS.slice(0, 4).map((g) => { const l = new THREE.PointLight('#ff9a4a', 0, 14, 2); l.position.copy(g).add(V(0.5, 1.2, 0.4)); scene.add(l); return l; });
  const libLight = new THREE.PointLight('#ffa050', 0, 26, 1.6);
  scene.add(libLight);
  const libGlow = new THREE.PointLight('#ff9040', 0, 30, 1.8);
  libGlow.position.set(LIB.x0 - 4, 8, 0);
  scene.add(libGlow);
  const dust = new Dust({ count: lite ? 900 : 2200, size: [70, 18, 70], center: [-5, 8, 5], particleSize: 0.06, color: '#ffd9a8', opacity: 0.5, intensity: 1.3 });
  scene.add(dust);

  // ------------------------------------------------------------------------------------- labels
  const ruinLabel = new Callout('NALANDA MAHAVIHARA · BIHAR', { dx: 2.4, dy: 1.5, size: 0.42, color: LABEL, sub: 'THE RUINS TODAY · UNESCO WORLD HERITAGE 2016', intensity: 1.4 });
  ruinLabel.position.set(-21, 1.2, 9);
  const vihLabel = new Callout('VIHARA · MONASTERY', { dx: -4, dy: 5, size: 1.0, color: LABEL, sub: 'STUDENT CELLS ROUND A COURTYARD', intensity: 1.5 });
  vihLabel.position.set(-19.5, VH + 1.2, -19.5);
  const temLabel = new Callout('CHAITYA · TEMPLE', { dx: 4, dy: 4.5, size: 1.0, color: LABEL, sub: 'STEPPED BRICK · CORNER TOWERS', intensity: 1.5 });
  temLabel.position.set(-27.5, 22, TEM_Z);
  const SUBJ = [['GRAMMAR', 'SHABDAVIDYA', -1.6, 1.1], ['LOGIC', 'HETUVIDYA', 1.6, 1.1], ['MEDICINE', 'CHIKITSAVIDYA', -1.8, 0.9], ['THE VEDAS', null, 1.6, 1.0], ['BUDDHIST PHILOSOPHY', null, 1.8, 0.5]];
  const subjLabels = SUBJ.map(([l, s, dx, dy], i) => {
    const c = new Callout(l, { dx, dy, size: 0.36, color: '#ffd89a', sub: s, intensity: 1.8 });
    c.position.copy(GROUPS[i]).add(V(0, i === 4 ? 1.2 : 1.4, 0));
    return c;
  });
  const libLabel = new Callout('DHARMAGANJA', { dx: 1.5, dy: 0.9, size: 0.55, color: LABEL, sub: "THE LIBRARY · 'MART OF TRUTH'", intensity: 1.6 });
  libLabel.position.set(LIB.x0 + 1.1, 10.2, LIB.z1 - 1.1);
  scene.add(ruinLabel, vihLabel, temLabel, libLabel, ...subjLabels);
  // the library's section line, drawn up the cut face as the facade peels away
  const cutPts = [V(LIB.x0 + 1, 0.6, LIB.z0 + 1)];
  for (const y of [...FL.slice(1), LIB_TOP]) cutPts.push(V(LIB.x0 + 1, y - 0.4, LIB.z0 + 1));
  cutPts.push(V(LIB.x0 + 1, LIB_TOP + 0.4, LIB.z0 + 1), V(LIB.x0 + 1, LIB_TOP + 0.4, LIB.z1 - 1), V(LIB.x0 + 1, 0.6, LIB.z1 - 1));
  const cutLine = progressLine(cutPts, { color: GOLD, intensity: 1.6, head: 0.03 });
  const slabLines = FL.slice(1).map((y) => progressLine([V(LIB.x0 + 1.01, y - 0.4, LIB.z0 + 1), V(LIB.x0 + 1.01, y - 0.4, LIB.z1 - 1)], { color: GOLD, intensity: 1.3 }));
  scene.add(cutLine, ...slabLines);

  // ------------------------------------------------------------------------------------- the map
  const MU = { uMap: { value: 0 }, uR: { value: 0 }, uMapK: { value: 1 } };
  const map = buildMap(MU);
  map.group.scale.setScalar(DEG);
  map.group.visible = false;
  scene.add(map.group);
  const mapFx = new THREE.Group();                 // routes, markers, labels (map units, scaled with the map)
  map.group.add(mapFx);
  const W = (lon, lat) => proj(lon, lat);
  // routes: waypoints (lon, lat); arcs lift off the map a little
  const ROUTES = [
    { pts: [[85.44, 25.13], [80.5, 27.8], [75.5, 31.2], [72.8, 33.75], [69.0, 34.9], [66.9, 36.7], [67.0, 39.65], [71.5, 40.5], [76.0, 39.5], [82.5, 41.5], [89.2, 42.9], [94.7, 40.1], [100.0, 37.5], [104.0, 36.0], [108.9, 34.3]], t0: 0.0, d: 0.62, lift: 1.2, col: '#ffd08a' },   // Xuanzang: overland to Chang'an
    { pts: [[108.9, 34.3], [114.0, 35.6], [119.0, 37.0], [123.5, 37.5], [126.9, 37.0], [129.2, 35.8]], t0: 0.36, d: 0.26, lift: 0.8, col: '#ffd08a' },                                                     // on to Korea
    { pts: [[85.44, 25.13], [87.0, 27.0], [89.0, 28.6], [91.1, 29.65]], t0: 0.1, d: 0.25, lift: 1.5, col: '#ffe0a8' },                                                                                       // over the Himalaya to Tibet
    { pts: [[85.44, 25.13], [87.9, 22.3], [88.4, 20.0], [86.5, 16.0], [83.0, 12.0], [81.6, 9.6], [80.4, 8.35]], t0: 0.12, d: 0.4, lift: 0.7, col: '#ffc070' },                                              // by sea to Sri Lanka
    { pts: [[85.44, 25.13], [87.9, 22.3], [90.5, 17.0], [93.0, 10.5], [97.0, 7.0], [100.4, 5.9], [102.5, 2.8], [104.75, -2.99]], t0: 0.18, d: 0.45, lift: 0.8, col: '#ffc070' },                           // Tamralipti → Kedah → Srivijaya
    { pts: [[104.75, -2.99], [106.5, 1.5], [108.5, 7.0], [110.0, 12.0], [112.0, 17.5], [113.3, 23.1]], t0: 0.34, d: 0.3, lift: 0.8, col: '#ffc070' },                                                       // Yijing's sea route to Guangzhou
  ];
  const routes = ROUTES.map((R) => {
    const base = R.pts.map(([lon, lat]) => W(lon, lat));
    const curve0 = new THREE.CatmullRomCurve3(base, false, 'centripetal');
    const L = curve0.getLength(), N = 80, pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N, p = curve0.getPointAt(u); p.y = Math.sin(Math.PI * u) * Math.min(4, R.lift * L * 0.06) + 0.05; pts.push(p); }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const tube = ribbon(curve, { n: 160, width: 0.0032, color: R.col, intensity: 1.5 });
    tube.renderOrder = 7;
    mapFx.add(tube);
    const head = glowSprite({ color: '#ffd9a0', intensity: 3, scale: 2.2 });
    head.renderOrder = 8;
    mapFx.add(head);
    const pul = [0, 1, 2].map(() => { const s = glowSprite({ color: '#ffe2b8', intensity: 1.6, scale: 1.1 }); s.renderOrder = 8; mapFx.add(s); return s; });
    return { ...R, curve, tube, head, pul };
  });
  const nalandaGlow = glowSprite({ color: '#ffc070', intensity: 2.6, scale: 3.4 });
  const nalandaHalo = glowSprite({ color: '#ff9040', intensity: 0.5, scale: 9 });
  nalandaGlow.renderOrder = nalandaHalo.renderOrder = 8;
  nalandaGlow.position.set(0, 0.1, 0); nalandaHalo.position.set(0, 0.1, 0);
  mapFx.add(nalandaHalo, nalandaGlow);
  const nalandaRing = progressLine(circlePoints(1.6, 48, { plane: 'xz' }), { color: GOLD, intensity: 2 });
  nalandaRing.position.y = 0.06; nalandaRing.renderOrder = 8;
  mapFx.add(nalandaRing);
  const PLACES = [
    ['NALANDA', 85.44, 25.13, 1.0, 0, 1.25, '#ffd89a'],
    ["CHANG'AN", 108.9, 34.3, 1.0, 0.5, 1.0, LABEL], ['KOREA', 129.2, 35.8, -1.0, 0.56, 1.0, LABEL], ['TIBET', 91.1, 29.65, 1.0, 0.3, 1.0, LABEL],
    ['SRI LANKA', 80.4, 8.35, -1.0, 0.45, 1.0, LABEL], ['SRIVIJAYA', 104.75, -2.99, 1.0, 0.4, 1.0, LABEL], ['CENTRAL ASIA', 67.0, 39.65, -1.0, 0.32, 1.0, LABEL],
    ['TAKSHASHILA', 72.8, 33.75, -1.0, 0.18, 0.8, '#d8c4a0'],
  ];
  const places = PLACES.map(([name, lon, lat, side, t0, k, col]) => {
    const lab = new TextPlane(name, { font: FONTS.mono, weight: 500, height: 1, color: col, intensity: 1.5, letterSpacing: 0.14 });
    lab.renderOrder = 12; lab.material.depthTest = false;
    const dot = glowSprite({ color: '#ffd9a0', intensity: 2.2, scale: 1.2 });
    dot.renderOrder = 8;
    const at = W(lon, lat);
    dot.position.copy(at).setY(0.08);
    mapFx.add(lab, dot);
    return { lab, dot, at, side, t0, k };
  });
  const ROUTE_LABELS = [['XUANZANG · 630s', 0, 0.56, 0.2, -1], ['YIJING · 670s', 5, 0.5, 0.42, 1]];
  const routeLabels = ROUTE_LABELS.map(([txt, ri, u, t0, up]) => {
    const lab = new TextPlane(txt, { font: FONTS.mono, weight: 400, height: 1, color: '#ffe8c4', intensity: 1.3, letterSpacing: 0.12 });
    lab.renderOrder = 12; lab.material.depthTest = false;
    mapFx.add(lab);
    return { lab, ri, u, t0, up };
  });

  // ------------------------------------------------------------------------------------- camera
  // t < T_ZOOM: keyframes (position, look); from T_ZOOM: orbit about a target with a log-distance climb
  const T_ZOOM = 2.8;
  const G_MAP = proj(98.0, 16.0).multiplyScalar(DEG);                  // the map's centre at the end (metres)
  const RK = [[2.8, Math.log(33)], [3.12, Math.log(37)], [3.3, Math.log(90)], [3.46, Math.log(1600)], [3.62, Math.log(7e4)], [3.82, Math.log(9e5)], [4.1, Math.log(4.9e6)], [4.5, Math.log(8.2e6)], [5.0, Math.log(9.4e6)]];
  const R_END = 8.2e6;
  const zoomU = (r) => sat((Math.log(r) - Math.log(30)) / (Math.log(R_END) - Math.log(30)));
  const libTarget = (t, out) => out.set(LIB.x0 + 7, lerp(5.5, 13.5, ramp(t, T_ZOOM, 3.25, ease.inOutSine)), lerp(-1.5, -3, ramp(t, T_ZOOM, 3.25)));
  const _g = new THREE.Vector3(), _d = new THREE.Vector3();
  function zoomCam(t, pos, look) {
    const r = Math.exp(timeWarp(t, RK)), u = zoomU(r);
    libTarget(t, _g);
    const sig = Math.min(1.1, r / R_END);
    _g.lerp(G_MAP, sig);
    const yaw = lerp(-0.3, -Math.PI / 2 + 0.12, smoothstep(0.1, 0.62, u));
    const pLib = lerp(-0.13, -0.05, ramp(t, T_ZOOM, 3.2));
    const pitch = pLib * (1 - smoothstep(0, 0.12, u)) + timeWarp(u, [[0, 0], [0.1, -0.25], [0.38, -1.42], [0.6, -1.42], [1.0, -1.1], [1.2, -1.06]]);
    _d.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
    look.copy(_g); pos.copy(_g).addScaledVector(_d, -r);
    return r;
  }
  const kp = V(0, 0, 0), kl = V(0, 0, 0);
  zoomCam(T_ZOOM, kp, kl);
  const KEYS = [
    [-0.3, V(-29.5, 5.2, 28.5), V(0, 0.2, -3)],
    [1.05, V(-25.0, 6.6, 22.5), V(2, 0.8, -5)],
    [1.72, V(-36, 31, 52), V(4, 2, -44)],
    [2.15, V(-17, 12.8, 6.8), V(3, 0.2, -1)],
    [2.52, V(-10, 12.4, 5.5), V(14, 3.5, -1.5)],
    [2.68, V(12, 16.5, 8), V(52, 10, -2)],
    [T_ZOOM, kp.clone(), kl.clone()],
  ];
  const KX = (sel, c) => KEYS.map((k) => [k[0], k[sel][c]]);
  const keyTracks = [1, 2].map((sel) => ['x', 'y', 'z'].map((c) => KX(sel, c)));
  const camPos = V(0, 0, 0), camLook = V(0, 0, 0);

  // ------------------------------------------------------------------------------------- update
  const dof = { focus: 20, range: 10, amount: 0 };
  const bloom = { strength: 0.7 };
  const SK = { hor: new THREE.Color(), zen: new THREE.Color(), sun: new THREE.Color(), si: 0 };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _up = V(0, 1, 0);
  const fogBase = new THREE.Color(), _cs = new THREE.Vector3();
  let lastT = 0, lastR = 30;

  function update(t, info) {
    const T = info?.T ?? (t + segment.start);
    lastT = t;
    // ---- build: ruins → living campus
    U.uRise.value = t < tRise - 0.08 ? -50 : timeWarp(t, [[tRise - 0.08, -0.6], [tRise + 0.55, 9.8], [tRise + 1.1, 64]]);
    U.uHot.value = envelope(t, tRise - 0.1, tRise + 1.9, 0.1, 0.5);
    U.uAge.value = lerp(1, 0.22, ramp(t, tRise + 0.1, tRise + 0.9));      // the weathering of the ruins washes away as the campus stands
    GU.uEarth.value = ramp(t, tRise + 0.1, tRise + 1.0);

    // ---- camera
    let r = 30;
    if (t < T_ZOOM) {
      for (let c = 0; c < 3; c++) {
        camPos.setComponent(c, timeWarp(t, keyTracks[0][c]));
        camLook.setComponent(c, timeWarp(t, keyTracks[1][c]));
      }
      camPos.x += Math.sin(t * 0.9) * 0.06; camPos.y += Math.sin(t * 1.3 + 1) * 0.04;
    } else r = zoomCam(t, camPos, camLook);
    lastR = r;
    camera.position.copy(camPos);
    camera.up.copy(_up);
    camera.lookAt(camLook);
    const alt = Math.max(1, camPos.y);
    camera.near = Math.max(0.1, alt * 0.02);
    camera.far = Math.max(3000, r * 40, alt * 40);
    camera.fov = 35;
    camera.updateProjectionMatrix();
    sky.position.copy(camPos);

    // ---- light: afternoon → golden hour → dusk → night
    skyAt(t, SK);
    const el = timeWarp(t, [[0, 0.44], [1.1, 0.32], [1.75, 0.2], [2.4, -0.02], [3.0, -0.12]]);
    const az = timeWarp(t, [[0, 3.55], [2.0, 3.45], [3.0, 3.4]]);
    const sd = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az) - 0.25).normalize();
    sun.position.copy(sun.target.position).addScaledVector(sd, 200);
    sun.color.copy(SK.sun);
    sun.intensity = SK.si * smoothstep(-0.04, 0.06, el);
    leafSun.dir.copy(sd); leafSun.color.copy(SK.sun).multiplyScalar(sun.intensity * 0.55);
    const sm = sky.material.uniforms;
    sm.uSun.value.copy(sd); sm.uHor.value.copy(SK.hor); sm.uZen.value.copy(SK.zen); sm.uSunCol.value.copy(SK.sun).multiplyScalar(smoothstep(-0.1, 0.05, el));
    sm.uStars.value = ramp(t, 2.5, 3.1);
    const night = ramp(t, 2.0, 2.8);
    hemi.color.copy(SK.zen).multiplyScalar(2.2).lerp(new THREE.Color(0.12, 0.16, 0.3), night * 0.5);
    hemi.groundColor.setRGB(0.22, 0.13, 0.08).multiplyScalar(1 - night * 0.7);
    hemi.intensity = lerp(0.55, 0.35, night);
    scene.environmentIntensity = lerp(0.32, 0.07, night);
    fogBase.copy(SK.hor).lerp(new THREE.Color(0.45, 0.45, 0.48), 0.35).multiplyScalar(0.8);
    scene.fog.color.copy(fogBase);
    scene.fog.density = lerp(0.0019, 0.0014, ramp(t, tRise, tRise + 1)) / (1 + Math.max(0, alt - 30) / 60);

    // ---- lamps and lamplight
    const lampK = ramp(t, tSch - 0.4, tSch + 0.25);
    const libK = ramp(t, tLib - 0.4, tLib);
    const fadeUp = 1 - ramp(Math.log(r), Math.log(2500), Math.log(2.5e4));
    lampMat.uniforms.uG.value.set(lampK * 1.0, ramp(t, tSch - 0.25, tSch + 0.4) * 0.8, Math.max(libK, lampK * 0.4) * 1.1).multiplyScalar(fadeUp * (1 + 0.12 * pulse(T, { decay: 6 }) * lampK));
    lampMat.uniforms.uTime.value = t;
    lampMat.uniforms.uVP.value = info?.height ?? 800;
    cellGlowMat.emissiveIntensity = lampK * 0.22;
    yardLights.forEach((l, i) => { l.intensity = lampK * (9 + 2 * Math.sin(t * 9 + i * 2)) * (1 - ramp(t, 3.0, 3.4)); });
    GL.uGlowY.value = lerp(-2, 22, ramp(t, tLib - 0.36, tLib + 0.25, ease.inOutSine));
    GL.uGlowK.value = libK * 1.1;
    GL.uTime.value = t;
    grassMat.userData.u.uTime.value = t;
    libLight.position.set(LIB.x0 + 6, Math.min(GL.uGlowY.value, 12) + 1.5, 0);
    libLight.intensity = libK * 26 * (1 - ramp(Math.log(r), Math.log(300), Math.log(3000)));
    libGlow.intensity = libK * 40 * (1 - ramp(Math.log(r), Math.log(300), Math.log(3000)));
    facadeMat.userData.u.uSlice.value = t < tLib - 0.38 ? -100 : lerp(0.4, LIB_TOP + 1.5, ramp(t, tLib - 0.36, tLib + 0.2, ease.inOutSine));

    vilMat.uniforms.uK.value = 0.55 * ramp(Math.log(r), Math.log(250), Math.log(1500)) * (1 - ramp(Math.log(r), Math.log(6e5), Math.log(3e6)));
    villages.visible = vilMat.uniforms.uK.value > 0.001;
    vilMat.uniforms.uR.value = r;
    // ---- figures
    const live = (x, z, h = 1.6) => sat((frontAt(x, z) - h * 0.6) / 1.4) * ramp(t, tRise + 0.25, tRise + 0.6);
    seated.forEach((s, i) => {
      const k = live(s.p.x, s.p.z) * (s.p.y > 3 ? ramp(t, tRise + 0.6, tRise + 1.0) : 1);
      _s.set(s.s, s.s * Math.max(0.001, k), s.s);
      _q.setFromEuler(_e.set(0, s.ry, 0));
      _m.compose(s.p, _q, _s);
      seatRobe.setMatrixAt(i, _m); seatHead.setMatrixAt(i, _m);
    });
    walkers.forEach((w, i) => {
      _p.copy(w.p).addScaledVector(w.d, w.v * t);
      const step = Math.abs(Math.sin(t * w.v * 4.2 + i)) * 0.035 * (w.v > 0 ? 1 : 0);
      _p.y += step;
      const k = live(_p.x, _p.z);
      _s.set(1, Math.max(0.001, k), 1);
      _q.setFromEuler(_e.set(0, Math.atan2(w.d.x, w.d.z) + (w.v > 0 ? 0 : Math.PI), Math.sin(t * w.v * 4.2 + i) * 0.03 * (w.v > 0 ? 1 : 0)));
      _m.compose(_p, _q, _s);
      walkRobe.setMatrixAt(i, _m); walkHead.setMatrixAt(i, _m);
    });
    for (const m of [seatRobe, seatHead, walkRobe, walkHead]) m.instanceMatrix.needsUpdate = true;
    const figsOn = t > tRise + 0.2 && r < 3000;
    seatRobe.visible = seatHead.visible = walkRobe.visible = walkHead.visible = figsOn;

    // ---- labels
    const show = (c, a, b, fi = 0.35, fo = 0.25) => {
      const p = ramp(t, a, a + fi, ease.outCubic), o = 1 - ramp(t, b - fo, b);
      c.visible = p > 0 && o > 0; if (c.visible) { faceCamera(c, camera); c.reveal(p, o); }
    };
    show(ruinLabel, tBricks + 0.15, tRise + 0.2);
    show(vihLabel, tRise + 0.45, tSch + 0.05);
    show(temLabel, tRise + 0.6, tSch + 0.1);
    subjLabels.forEach((c, i) => show(c, tSch + 0.02 + i * 0.09, tLib + 0.05, 0.3, 0.2));
    show(libLabel, tLib + 0.05, tMap - 0.15, 0.3, 0.2);
    cutLine.progress = ramp(t, tLib - 0.36, tLib + 0.25, ease.inOutSine);
    cutLine.opacity = 1 - ramp(Math.log(r), Math.log(200), Math.log(1500));
    slabLines.forEach((l, i) => { l.progress = ramp(t, tLib - 0.2 + i * 0.12, tLib + i * 0.12); l.opacity = cutLine.opacity; });

    // ---- the map
    const mapK = ramp(Math.log(r), Math.log(600), Math.log(6000));
    map.group.visible = mapK > 0;
    GU.uMapMix.value = ramp(Math.log(r), Math.log(400), Math.log(5000));
    forest.group.visible = t < tSch + 0.35; forest.update(t);
    for (const g of offInCourt) g.visible = !(t > tSch + 0.1 && t < T_ZOOM);   // (once the camera is down in the dusk courtyard the groves are out of sight)
    GU.uMapK.value = 1;
    MU.uMap.value = mapK;
    MU.uR.value = lerp(0.0, 75, ramp(t, 3.5, 4.25, ease.inOutSine));
    const rp = (R) => ramp(t, tMap + R.t0, tMap + R.t0 + R.d, ease.inOutSine);
    const camScale = (p) => camera.position.distanceTo(_cs.copy(p).multiplyScalar(DEG)) / DEG;   // map-unit distance from the camera
    routes.forEach((R) => {
      const p = rp(R);
      R.tube.progress = p; R.tube.opacity = mapK;
      R.head.visible = p > 0 && p < 1;
      if (R.head.visible) { R.curve.getPointAt(p, R.head.position); R.head.scale.setScalar(camScale(R.head.position) * 0.022); }
      R.pul.forEach((s, j) => {
        const u = ((t - (tMap + R.t0 + R.d)) * 0.45 / Math.max(0.3, R.d) + j / 3) % 1;
        s.visible = p >= 1 && mapK > 0;
        if (s.visible) { R.curve.getPointAt(u, s.position); s.scale.setScalar(camScale(s.position) * 0.011); }
      });
    });
    const nk = ramp(Math.log(r), Math.log(2e3), Math.log(2e4));
    const ns = camScale(nalandaGlow.position);
    nalandaGlow.scale.setScalar(ns * 0.016 * (1 + 0.25 * pulse(T, { decay: 5 }))); nalandaHalo.scale.setScalar(ns * 0.05);
    nalandaGlow.material.opacity = nalandaHalo.material.opacity = nk;
    nalandaGlow.visible = nalandaHalo.visible = nk > 0;
    nalandaRing.scale.setScalar(ns * 0.022); nalandaRing.progress = ramp(t, tMap - 0.2, tMap + 0.2); nalandaRing.opacity = nk;
    places.forEach((P, i) => {
      const p = ramp(t, tMap + P.t0, tMap + P.t0 + 0.25, ease.outCubic) * mapK;
      P.lab.visible = P.dot.visible = p > 0;
      if (!P.lab.visible) return;
      const s = camScale(P.at) * 0.016 * P.k;
      P.lab.scale.setScalar(s);
      faceCamera(P.lab, camera);
      _d.set(1, 0, 0).applyQuaternion(camera.quaternion);
      P.lab.position.copy(P.at).addScaledVector(_d, P.side * (P.lab.worldWidth * s / 2 + s * 0.9));
      P.lab.position.y += s * 0.3;
      P.lab.reveal = p; P.lab.opacity = p > 0.02 ? 1 : 0;
      P.dot.scale.setScalar(s * 1.4 * (i === 0 ? 0 : 1));
    });
    routeLabels.forEach((L) => {
      const p = ramp(t, tMap + L.t0, tMap + L.t0 + 0.3, ease.outCubic) * mapK;
      L.lab.visible = p > 0;
      if (!p) return;
      const R = routes[L.ri];
      R.curve.getPointAt(L.u, _p);
      const s = camScale(_p) * 0.013;
      L.lab.scale.setScalar(s);
      faceCamera(L.lab, camera);
      _d.set(0, 1, 0).applyQuaternion(camera.quaternion);
      L.lab.position.copy(_p).addScaledVector(_d, s * 1.1 * L.up);
      L.lab.reveal = p; L.lab.opacity = 1;
    });

    // ---- atmosphere, lens
    dust.tick(t, info);
    dust.u.opacity = 0.45 * (1 - night * 0.6) * (1 - ramp(Math.log(r), Math.log(60), Math.log(400)));
    dust.visible = r < 400;
    dof.amount = t > tSch - 0.1 && t < tLib - 0.1 ? 0.22 * envelope(t, tSch - 0.1, tLib - 0.1, 0.2, 0.2) : 0;
    dof.focus = camera.position.distanceTo(camLook);
    dof.range = 8;
    bloom.strength = 0.7 + 0.15 * lampK * (1 - mapK) + 0.1 * mapK;
    api.exposure = lerp(0.95, 1.4, night) * lerp(1, 0.9, mapK);
  }

  const AR_C = [V(0, 2, -15), V(0, 1, 0), V((LIB.x0 + LIB.x1) / 2, 8, 0)];
  const api = {
    scene, camera, update, dof, bloom, exposure: 1,
    get exploreLimits() { return lastR > 1000 ? { yaw: 0.5, pitchDown: 0.3, pitchUp: 0.3, zoomOut: 1.5 } : { yaw: 1.1, pitchDown: 0.4, pitchUp: 0.7, zoomOut: 2.4 }; },
    // AR: the campus while it rebuilds, the courtyard of scholars, the library, then the map round Nalanda
    arSubject: (t) => (t < tSch - 0.1 ? { centre: AR_C[0], radius: 75 }
      : t < tLib - 0.1 ? { centre: AR_C[1], radius: 18 }
      : t < tMap - 0.3 ? { centre: AR_C[2], radius: 18 }
      : { centre: G_MAP.clone().multiplyScalar(0.6), radius: 3.2e6 }),
  };
  return api;
}
