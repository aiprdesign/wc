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
import { brickMaterial, groundMaterial, skyMaterial, monkGeometries, buildMap, ribbon, proj, DEG } from './nalanda-assets.js';

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
  const U = { uRise: { value: -50 }, uDelayK: { value: 0.26 }, uCentre: { value: new THREE.Vector2(0, -8) }, uHot: { value: 0 } };
  const vihMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.6, jag: 5 });
  const temMat = brickMaterial(U, { ruinLo: 8.0, ruinHi: 12.0, jag: 3, tint: [0.96, 0.9, 0.86] });
  const libMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.2, jag: 5 });
  const facadeMat = brickMaterial(U, { ruinLo: 0.3, ruinHi: 2.2, jag: 5, slice: true });
  const woodMat = new THREE.MeshStandardMaterial({ color: '#3a2214', roughness: 0.75 });
  const voidMat = new THREE.MeshStandardMaterial({ color: '#0b0705', roughness: 1 });
  const waterMat = new THREE.MeshStandardMaterial({ color: '#05080a', roughness: 0.08, metalness: 0 });
  // parts that are not brick (shelves, dark doorways) exist only once the build front has passed them
  const frontClip = (mat, key) => {
    mat.userData.noDetail = true;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vFW; uniform float uRise, uDelayK; uniform vec2 uCentre;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vFW.y > uRise - uDelayK * length(vFW.xz - uCentre) - 0.3) discard;');
    };
    mat.customProgramCacheKey = () => 'nalanda-clip-' + key;
  };
  frontClip(woodMat, 'wood'); frontClip(voidMat, 'void');
  const GU = { uEarth: { value: 0 }, uMapMix: { value: 0 }, uMapK: { value: 1 } };
  const groundMat = groundMaterial(GU);

  // ------------------------------------------------------------------------------------- builders
  const accs = new Map();
  const acc = (mat) => { if (!accs.has(mat)) accs.set(mat, []); return accs.get(mat); };
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

  // ---- vihara: two-storey cells round a courtyard, verandah on pillars, a well, a raised platform
  const CELL = 3.04, IN0 = 14.4, IN1 = 15.2, OUT = 20, OW = 1.2;
  function vihara(cx, cz, hero) {
    const M = vihMat;
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
        o.push({ a: c - 0.5, b: c + 0.5, h: 2.24 });
      }
      if (entrance) o.push({ a: c0 - 1.6, b: c0 + 1.6, h: 3.36 });
      return o;
    };
    wall(M, 'x', cx - IN1, cx + IN1, cz + IN0, cz + IN1, VH, doors(cx, true));
    wall(M, 'x', cx - IN1, cx + IN1, cz - IN1, cz - IN0, VH, doors(cx, false));
    wall(M, 'z', cz - IN0, cz + IN0, cx - IN1, cx - IN0, VH, doors(cz, false).map((o) => ({ ...o })));
    wall(M, 'z', cz - IN0, cz + IN0, cx + IN0, cx + IN1, VH, doors(cz, false));
    // cell partitions
    for (let k = 0; k <= 10; k++) {
      const p = -IN1 + k * CELL;
      if (!(Math.abs(p) < 0.1)) box(M, cx + p - 0.25, cx + p + 0.25, 0, VH, cz + IN1, cz + OUT - OW);      // south range (open entrance hall)
      box(M, cx + p - 0.25, cx + p + 0.25, 0, VH, cz - OUT + OW, cz - IN1);                              // north
      box(M, cx - OUT + OW, cx - IN1, 0, VH, cz + p - 0.25, cz + p + 0.25);                              // west
      box(M, cx + IN1, cx + OUT - OW, 0, VH, cz + p - 0.25, cz + p + 0.25);                              // east
    }
    // verandah: plinth, two storeys of pillars, the gallery floor with its parapet, the roof
    ring(M, cx, cz, 11.9, IN0, 0, 0.3);
    const PL = 12.2, pil = [];
    for (let k = 0; k <= 8; k++) { const p = -PL + k * PL / 4; pil.push([p, PL], [p, -PL]); if (k > 0 && k < 8) pil.push([PL, p], [-PL, p]); }
    for (const [px, pz] of pil) {
      box(M, cx + px - 0.32, cx + px + 0.32, 0.3, 4.0, cz + pz - 0.32, cz + pz + 0.32);
      box(M, cx + px - 0.42, cx + px + 0.42, 3.84, 4.0, cz + pz - 0.42, cz + pz + 0.42);                 // capital block
      box(M, cx + px - 0.24, cx + px + 0.24, 5.0, VH, cz + pz - 0.24, cz + pz + 0.24);
    }
    ring(M, cx, cz, 11.85, IN0, 4.0, 4.32);
    ring(M, cx, cz, 11.85, 12.2, 4.32, 5.0);
    ring(M, cx, cz, 11.85, OUT + 0.25, VH, VH + 0.32);                                                    // roof
    ring(M, cx, cz, OUT - 0.4, OUT + 0.25, VH + 0.32, VH + 1.1);                                          // parapets
    ring(M, cx, cz, 11.85, 12.25, VH + 0.32, VH + 0.9);
    // outer face: plinth moulding, string course, pilasters
    ring(M, cx, cz, OUT, OUT + 0.6, 0, 0.6);
    ring(M, cx, cz, OUT, OUT + 0.16, 4.0, 4.32);
    for (let k = 0; k <= 12; k++) {
      const p = -OUT + 0.4 + k * (2 * OUT - 0.8) / 12;
      if (Math.abs(p) > 3.4) box(M, cx + p - 0.35, cx + p + 0.35, 0.6, VH, cz + OUT, cz + OUT + 0.18);
      box(M, cx + p - 0.35, cx + p + 0.35, 0.6, VH, cz - OUT - 0.18, cz - OUT);
      box(M, cx - OUT - 0.18, cx - OUT, 0.6, VH, cz + p - 0.35, cz + p + 0.35);
      box(M, cx + OUT, cx + OUT + 0.18, 0.6, VH, cz + p - 0.35, cz + p + 0.35);
    }
    // gate porch and steps
    box(M, cx - 3.4, cx - 2.0, 0, VH + 0.9, cz + OUT, cz + OUT + 2.6); box(M, cx + 2.0, cx + 3.4, 0, VH + 0.9, cz + OUT, cz + OUT + 2.6);
    box(M, cx - 3.4, cx + 3.4, 3.36, VH + 0.9, cz + OUT + 1.6, cz + OUT + 2.6);
    for (let s = 0; s < 3; s++) box(M, cx - 2.8, cx + 2.8, 0, 0.6 - s * 0.2, cz + OUT + 2.6, cz + OUT + 3.2 + s * 0.6);
    // courtyard: paving, a well, the raised platform with its steps
    box(M, cx - 11.9, cx + 11.9, 0, 0.1, cz - 11.9, cz + 11.9);
    const well = new THREE.CylinderGeometry(0.95, 1.0, 0.8, 18); put(M, well, cx - 6.5, 0.4, cz + 6.5);
    const water = new THREE.CircleGeometry(0.72, 18); water.rotateX(-Math.PI / 2); put(waterMat, water, cx - 6.5, 0.62, cz + 6.5);
    box(M, cx + 5.6, cx + 10.6, 0, 1.0, cz - 2.6, cz + 2.6);
    box(M, cx + 4.8, cx + 5.6, 0, 0.5, cz - 1.2, cz + 1.2);
    // dark doorways of the cells (seen from the courtyard)
    if (hero) for (const s of [1, -1]) for (let k = 0; k < 10; k++) {
      const c = -IN1 + (k + 0.5) * CELL;
      if (s > 0 && (k === 4 || k === 5)) continue;
      box(voidMat, cx + c - 0.5, cx + c + 0.5, 0.3, 2.24, cz + s * (IN0 + 0.05), cz + s * (IN1 - 0.05));
      box(voidMat, cx + s * (IN0 + 0.05), cx + s * (IN1 - 0.05), 0.3, 2.24, cz + c - 0.5, cz + c + 0.5);
    }
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
      for (let k = 0; k <= n; k++) {
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
    put(M, new THREE.CylinderGeometry(4.2, 4.4, 1.2, 28), cx, 21.0, cz);
    put(M, new THREE.SphereGeometry(4.0, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), cx, 21.6, cz);
    box(M, cx - 0.9, cx + 0.9, 25.4, 26.4, cz - 0.9, cz + 0.9);
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
      box(M, x - 1.1, x + 1.1, 0, 0.6, z - 1.1, z + 1.1);
      put(M, new THREE.CylinderGeometry(0.9, 0.95, 0.7, 16), x, 0.95, z);
      put(M, new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), x, 1.3, z);
      box(M, x - 0.3, x + 0.3, 2.15, 2.6, z - 0.3, z + 0.3);
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
        const L = 0.36 + r() * 0.1, n = 1 + Math.floor(r() * 3), dd = 0.12 + r() * 0.14;
        for (let j = 0; j < n; j++) {
          const th = 0.055, bw = 0.075 + r() * 0.02;
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
      for (const zc of [-10.4, -6.8, -3.2, 0.4, 4.0, 7.6, 11.0]) if (Math.abs(zc) < 12) shelfUnit(x1 - 1, Math.min(zc, 11.1), -1, 3.4, y0, r);
      for (const xc of [x0 + 4, x0 + 8, x0 + 12, x0 + 16]) { shelfUnit(xc, z0 + 1, 2, 3.8, y0, r); shelfUnit(xc, z1 - 1, -2, 3.8, y0, r); }
      // low reading desks near the opening
      for (const zc of [-3.2, 3.2]) box(woodMat, x0 + 2.2, x0 + 3.0, y0, y0 + 0.45, zc - 1.2, zc + 1.2);
    }
  }

  // the scholars' groups in the hero courtyard (the last one on the raised platform)
  const GROUPS = [V(-3.6, 0.1, -6.6), V(4.6, 0.1, -7.6), V(-2.6, 0.1, 3.6), V(3.6, 0.1, 7.4), V(8.1, 1.0, 0.0)];
  for (const g of GROUPS.slice(0, 4)) box(vihMat, g.x - 0.6, g.x + 0.6, 0.1, 0.35, g.z - 0.6, g.z + 0.6);
  for (const x of VIH_X) vihara(x, 0, x === 0);
  for (const x of TEM_X) temple(x, TEM_Z);
  library();
  // the avenue: a paved processional way with kerbs
  box(vihMat, -170, 170, 0, 0.12, AVE.z0, AVE.z1);
  box(vihMat, -170, 170, 0, 0.3, AVE.z1, AVE.z1 + 0.6); box(vihMat, -170, 170, 0, 0.3, AVE.z0 - 0.6, AVE.z0);

  const meshes = [];
  for (const [mat, list] of accs) {
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.castShadow = mat !== waterMat && mat !== woodMat && mat !== voidMat; m.receiveShadow = true;
    if (mat.userData.depth) m.customDepthMaterial = mat.userData.depth;
    m.frustumCulled = false;
    scene.add(m); meshes.push(m);
  }
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

  // ground: lawn over the excavations today, packed earth on the living campus; turns into the map from above
  const ground = new THREE.Mesh(new THREE.CircleGeometry(20000, 96), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true;
  scene.add(ground);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMaterial());
  sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);

  // ------------------------------------------------------------------------------------- figures
  const MG = monkGeometries();
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
  const mkInst = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
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
    yardLights.forEach((l, i) => { l.intensity = lampK * (9 + 2 * Math.sin(t * 9 + i * 2)) * (1 - ramp(t, 3.0, 3.4)); });
    GL.uGlowY.value = lerp(-2, 22, ramp(t, tLib - 0.36, tLib + 0.25, ease.inOutSine));
    GL.uGlowK.value = libK * 1.1;
    GL.uTime.value = t;
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
