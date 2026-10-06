// INDIAN MONTAGE · LEGACY (55.5–60.5 s) — one continuous flight through morphing particle forms,
// each the summary of a chapter, one morph every 0.8 s on the climax of the score:
//   55.6 mGrid    the Indus city in 3/4 aerial: brick blocks on a street grid, the citadel mound with
//                 the Great Bath; gold edges draw outward, sparks sit on the roofs   (I · HARAPPA)
//   56.4 mZero    the roofs lift off and swirl into a great ring with a dot at its heart and ten ticks
//                 (the ten digits), the camera cranes up over it                  (III · SHUNYA)
//   57.2 mWheel   the ring becomes the rim of the 24-spoke wheel, cast in gold, turning faster
//                 (IX · DHARMA CHAKRA)
//   58.0 mTemple  the spokes gather upward into the 13-tier granite vimana of Thanjavur while the
//                 camera drops to the ground and looks up at it                    (VII · VIMANA)
//   58.8 mOrbit   the tower collapses into Mars; the craft comes in on its arrival arc, fires at
//                 periapsis on the cue and draws its long ellipse                  (XII · MANGALYAAN)
//   59.6 mStars   everything disperses into a calm, deep starfield, dark in the centre where STARS
//                 stands; the camera drifts on into it — the cut zooms through the A (core/words3d.js)
// One particle cloud carries every form (six shape attributes, morphed in the vertex shader, each
// shape sorted by azimuth so every morph sweeps coherently); each form also has its own solid model,
// self-drawing gold edges and a shock ring + ember burst on its cue. Labels: HUD, bottom left.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../../timeline.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { MorphParticles, sampleRing, sampleGeometry, Dust } from '../../lib/particles.js';
import { progressLine, segmentsLine, revealLines, circlePoints } from '../../lib/lines.js';
import { glowSprite } from '../../lib/materials.js';
import { sat, lerp, smoothstep, ease, timeWarp, rng, envelope, ramp, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { GLSL_NOISE } from '../../lib/noise.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ∫ smoothstep((τ−a)/(b−a)) dτ from a to t — angular speed ramps up while the angle stays a pure function of t
function intSmooth(t, a, b) {
  if (t <= a) return 0;
  const L = b - a;
  if (t >= b) return L * 0.5 + (t - b);
  const u = (t - a) / L;
  return L * (u * u * u - (u * u * u * u) / 2);
}

// Reorder a point set by azimuth (bins) and a secondary key in each bin, so particle i lands at a
// similar bearing in every shape: the morphs sweep instead of scrambling.
function sortPolar(arr, second = (x, y, z, r) => r) {
  const n = arr.length / 3, BINS = 360, keys = new Float64Array(n), idx = Array.from({ length: n }, (_, i) => i);
  let smax = 1e-6;
  const sec = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    sec[i] = second(x, y, z, Math.hypot(x, z));
    smax = Math.max(smax, Math.abs(sec[i]));
  }
  for (let i = 0; i < n; i++) {
    const az = Math.atan2(arr[i * 3 + 2], arr[i * 3]) + Math.PI;
    keys[i] = Math.min(BINS - 1, Math.floor((az / TAU) * BINS)) + Math.min(0.999, Math.max(0, sec[i] / smax) * 0.999);
  }
  idx.sort((a, b) => keys[a] - keys[b]);
  const out = new Float32Array(arr.length);
  idx.forEach((s, d) => { out[d * 3] = arr[s * 3]; out[d * 3 + 1] = arr[s * 3 + 1]; out[d * 3 + 2] = arr[s * 3 + 2]; });
  return out;
}

// ---------------------------------------------------------------------------
// The morph cloud: six shapes (position + aP1…aP5), uStage ∈ [0, 5] (k + per-particle staggered mix).
const cloudVert = /* glsl */ `
${GLSL_NOISE}
attribute vec3 aP1, aP2, aP3, aP4, aP5;
attribute vec4 aSeed;
uniform float uTime, uStage, uStagger, uViewport, uSpin1, uSpin2, uBurst, uNoise, uStarPx, uHit;
uniform vec3 uBurstC;
uniform vec3 uCol[6];
uniform float uSize[6], uInt[6];
varying vec3 vColor; varying float vAlpha;
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
vec3 shapeAt(int k){
  if (k == 0) return position;
  if (k == 1) return rotY(aP1, uSpin1);
  if (k == 2) return rotY(aP2, uSpin2);
  if (k == 3) return aP3;
  if (k == 4) return aP4;
  return aP5;
}
void main(){
  float s = clamp(uStage, 0.0, 5.0);
  int k = int(min(floor(s), 4.0));
  float f = s - float(k);
  float m = clamp((f - aSeed.x * uStagger) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  vec3 a = shapeAt(k), b = shapeAt(k + 1);
  vec3 p = mix(a, b, m);
  float flight = sin(3.14159 * m);
  // flight: lift in an arc and churn mid-way; a slow shimmer while held
  p.y += flight * (0.35 + aSeed.y * 1.2) * (k == 4 ? 0.0 : 1.0);
  vec3 n = snoise3(p * 0.45 + vec3(uTime * 0.25) + aSeed.yzw * 10.0);
  p += n * (uNoise + flight * (k == 4 ? 0.2 : 0.55));
  vec3 dir = normalize(p - uBurstC + (aSeed.yzw - 0.5) * 0.6);
  p += dir * uBurst * (0.15 + aSeed.z * 0.85) * (1.0 - float(k == 4) * m);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = mix(uSize[k], uSize[k + 1], m) * (0.45 + 1.1 * aSeed.w);
  float px = sz * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
  float starK = k == 4 ? m : 0.0;     // stars: a fixed pixel size (distant points), not a world size
  px = mix(px, uStarPx * (0.45 + 2.2 * aSeed.w * aSeed.w * aSeed.w), starK);
  vAlpha = clamp(px, 0.0, 1.0);
  gl_PointSize = max(px, 1.0);
  vec3 c = mix(uCol[k], uCol[k + 1], m);
  // stars: a spread of temperatures; every form: a few white-hot sparks
  vec3 starTint = aSeed.z < 0.3 ? vec3(0.75, 0.86, 1.0) : aSeed.z > 0.88 ? vec3(1.0, 0.82, 0.62) : vec3(1.0);
  c *= mix(vec3(1.0), starTint, starK);
  float hot = step(0.93, aSeed.y);
  c = mix(c, vec3(1.0, 0.97, 0.9), hot * 0.7);
  float inten = mix(uInt[k], uInt[k + 1], m) * (0.7 + 0.6 * aSeed.y + hot * 0.8) * (1.0 + uHit * 0.8 + flight * 0.6);
  float tw = 0.75 + 0.25 * sin(uTime * (2.0 + aSeed.x * 5.0) + aSeed.y * 40.0);
  vColor = c * inten;
  vAlpha *= mix(1.0, tw, starK);
}`;
const cloudFrag = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor; varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a * uOpacity * vAlpha < 0.003) discard;
  gl_FragColor = vec4(vColor, a * uOpacity * vAlpha);
}`;

// ---------------------------------------------------------------------------
// Models

// Indus lower town: blocks between main streets, split into house plots (many around a courtyard),
// and the citadel mound with the Great Bath and the granary.
function buildCity(r) {
  const geos = [], streets = [], extras = [];
  const box = (x, z, w, d, h, y0 = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y0 + h / 2, z); geos.push(g.toNonIndexed()); };
  const XS = [-10.2, -6.8, -3.4, 0, 3.4, 6.8, 10.2], ZS = [-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2], ST = 0.34;
  const lot = (x0, z0, x1, z1) => {
    const w = x1 - x0, d = z1 - z0;
    if (w < 0.22 || d < 0.22 || r() < 0.05) return;
    let h = 0.13 + r() * 0.15; if (r() < 0.14) h += 0.17;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (w > 0.6 && d > 0.6 && r() < 0.7) {   // courtyard house: rooms round an open court
      const t = 0.11 + r() * 0.05;
      box(cx, z0 + t / 2, w, t, h); box(cx, z1 - t / 2, w, t, h);
      box(x0 + t / 2, cz, t, d - 2 * t, h); box(x1 - t / 2, cz, t, d - 2 * t, h);
      if (r() < 0.5) box(x0 + t + 0.1, cz, 0.18, d - 2 * t, h * 0.8);   // a room across one side
    } else box(cx, cz, w, d, h);
  };
  const split = (x0, z0, x1, z1, dep) => {
    const w = x1 - x0, d = z1 - z0;
    if ((w < 1.0 && d < 1.0) || dep > 5) return lot(x0 + 0.02, z0 + 0.02, x1 - 0.02, z1 - 0.02);
    const gap = dep < 2 && r() < 0.65 ? 0.11 : 0.025, s = 0.36 + r() * 0.28;
    if (w > d) { const xm = x0 + w * s; split(x0, z0, xm - gap / 2, z1, dep + 1); split(xm + gap / 2, z0, x1, z1, dep + 1); }
    else { const zm = z0 + d * s; split(x0, z0, x1, zm - gap / 2, dep + 1); split(x0, zm + gap / 2, x1, z1, dep + 1); }
  };
  for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
    const x0 = XS[i] + ST / 2, x1 = XS[i + 1] - ST / 2, z0 = ZS[j] + ST / 2, z1 = ZS[j + 1] - ST / 2;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if ((cx / 10.5) ** 2 + (cz / 7.6) ** 2 > 1.0) continue;
    if (i === 1 && j === 1) {
      // citadel: a raised mud-brick mound; the Great Bath (a sunken pool in a colonnaded court) and the granary
      box(cx, cz, x1 - x0, z1 - z0, 0.4);
      const bx = cx + 0.5, bz = cz - 0.1, bw = 1.25, bd = 0.85, t = 0.1, y0 = 0.4;
      box(bx, bz - bd / 2, bw, t, 0.12, y0); box(bx, bz + bd / 2, bw, t, 0.12, y0);
      box(bx - bw / 2, bz, t, bd, 0.12, y0); box(bx + bw / 2, bz, t, bd, 0.12, y0);
      for (let a = 0; a < 3; a++) for (let b = 0; b < 4; b++) box(cx - 1.05 + a * 0.3, cz - 0.55 + b * 0.36, 0.22, 0.28, 0.16, y0);
      box(cx + 0.5, cz + 0.78, 1.5, 0.3, 0.2, y0); box(cx + 0.5, cz - 0.78, 1.5, 0.3, 0.24, y0);
      extras.push({ pool: [bx, y0 + 0.03, bz, bw - 2 * t - 0.12, bd - 2 * t - 0.12] });
      continue;
    }
    split(x0, z0, x1, z1, 0);
  }
  // main streets (centre lines) for the drawn grid and the particles
  for (let i = 1; i < XS.length - 1; i++) streets.push([V3(XS[i], 0.01, -7.4), V3(XS[i], 0.01, 7.4)]);
  for (let j = 1; j < ZS.length - 1; j++) streets.push([V3(-10.6, 0.01, ZS[j]), V3(10.6, 0.01, ZS[j])]);
  return { geo: mergeGeometries(geos), streets, pool: extras[0].pool };
}

// The 24-spoke wheel (Ashoka Chakra / dharma chakra) lying in the XZ plane, top face at y = depth.
function buildWheel(R = 3.0, depth = 0.12) {
  const ext = (shape) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 1, curveSegments: 64 }); g.rotateX(-Math.PI / 2); return g.index ? g.toNonIndexed() : g; };
  const parts = [];
  const rim = new THREE.Shape(); rim.absarc(0, 0, R + 0.1, 0, TAU, false);
  const rh = new THREE.Path(); rh.absarc(0, 0, R - 0.14, 0, TAU, true); rim.holes.push(rh);
  parts.push(ext(rim));
  const hub = new THREE.Shape(); hub.absarc(0, 0, 0.42, 0, TAU, false);
  const hh = new THREE.Path(); hh.absarc(0, 0, 0.16, 0, TAU, true); hub.holes.push(hh);
  parts.push(ext(hub));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU, c = Math.cos(a), s = Math.sin(a), px = -s, py = c;
    const P = (rr, w) => [c * rr + px * w, s * rr + py * w];
    // a slim spoke: narrow at the hub, swelling a third of the way out, tapering to the rim
    const pts = [P(0.36, 0.022), P(1.15, 0.07), P(R - 0.12, 0.018), P(R - 0.12, -0.018), P(1.15, -0.07), P(0.36, -0.022)];
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) sh.lineTo(...pts[i]); sh.closePath();
    parts.push(ext(sh));
    // the small half-discs on the inside of the rim between the spoke ends
    const b = a + Math.PI / 24, bump = new THREE.Shape(); bump.absarc(Math.cos(b) * (R - 0.14), Math.sin(b) * (R - 0.14), 0.075, 0, TAU, false);
    parts.push(ext(bump));
  }
  return mergeGeometries(parts);
}

// The vimana of the Brihadeeswarar temple at Thanjavur (1010): a moulded plinth, a two-storey wall
// with pilasters, thirteen diminishing tiers each edged with miniature shrines (kutas at the corners,
// barrel-roofed salas between), a neck and an octagonal domed cupola with its finial.
function buildVimana() {
  const geos = [];
  const add = (g, x, y, z) => { g.translate(x, y, z); geos.push(g.index ? g.toNonIndexed() : g); };
  const box = (w, h, d, x, y, z) => add(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z);
  let y = 0;
  [[3.3, 0.12], [3.1, 0.1], [3.2, 0.08]].forEach(([w, h]) => { box(w, h, w, 0, y, 0); y += h; });
  const W0 = 2.8, wallH = 1.32;
  box(W0, wallH, W0, 0, y, 0);
  for (let side = 0; side < 4; side++) for (let k = 0; k < 9; k++) {   // pilasters on each face
    const u = -W0 / 2 + 0.16 + (k / 8) * (W0 - 0.32), o = W0 / 2 + 0.03;
    const [x, z, w, d] = side === 0 ? [u, o, 0.09, 0.06] : side === 1 ? [u, -o, 0.09, 0.06] : side === 2 ? [o, u, 0.06, 0.09] : [-o, u, 0.06, 0.09];
    box(w, wallH, d, x, y, z);
  }
  box(W0 + 0.16, 0.07, W0 + 0.16, 0, y + 0.6, 0);
  y += wallH;
  box(W0 + 0.22, 0.1, W0 + 0.22, 0, y, 0); y += 0.1;
  for (let i = 0; i < 13; i++) {
    const u = i / 12, w = lerp(2.5, 0.92, u), h = lerp(0.34, 0.22, u);
    box(w * 0.84, h, w * 0.84, 0, y, 0);
    const kw = lerp(0.24, 0.13, u), sw = w * 0.3, half = w / 2 - kw / 2;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {   // corner kutas with pyramidal caps
      box(kw, h * 0.68, kw, sx * half, y, sz * half);
      add(new THREE.CylinderGeometry(0, kw * 0.62, h * 0.32, 4).rotateY(Math.PI / 4), sx * half, y + h * 0.68 + h * 0.16, sz * half);
    }
    for (let side = 0; side < 4; side++) {   // salas: barrel-roofed pavilions mid-face
      const o = w / 2 - 0.07, along = side < 2;
      const x = along ? 0 : side === 2 ? o : -o, z = along ? (side === 0 ? o : -o) : 0;
      box(along ? sw : 0.14, h * 0.6, along ? 0.14 : sw, x, y, z);
      const barrel = new THREE.CylinderGeometry(0.075, 0.075, sw, 8, 1, false, 0, Math.PI);
      barrel.rotateZ(Math.PI / 2); if (!along) barrel.rotateY(Math.PI / 2);
      add(barrel, x, y + h * 0.6, z);
      for (const sgn of [-1, 1]) {   // little panjara cells between kuta and sala
        const q = sgn * (sw / 2 + (half - kw / 2 - sw / 2) / 2);
        const cw = Math.max(0.05, half - kw / 2 - sw / 2 - 0.04);
        box(along ? cw : 0.1, h * 0.45, along ? 0.1 : cw, along ? q : x, y, along ? z : q);
      }
    }
    box(w + 0.05, 0.045, w + 0.05, 0, y + h, 0);
    y += h + 0.045;
  }
  add(new THREE.CylinderGeometry(0.46, 0.5, 0.24, 8, 1).rotateY(Math.PI / 8), 0, y + 0.12, 0); y += 0.24;
  const prof = [[0, 0], [0.5, 0], [0.58, 0.06], [0.64, 0.18], [0.63, 0.3], [0.56, 0.44], [0.42, 0.56], [0.24, 0.63], [0.08, 0.66], [0, 0.66]];
  add(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 8).rotateY(Math.PI / 8), 0, y, 0); y += 0.66;
  const kal = [[0, 0], [0.09, 0], [0.12, 0.06], [0.09, 0.12], [0.05, 0.16], [0.07, 0.2], [0.03, 0.3], [0.012, 0.36], [0, 0.37]];
  add(new THREE.LatheGeometry(kal.map(([a, b]) => new THREE.Vector2(a, b)), 12), 0, y, 0); y += 0.37;
  return { geo: mergeGeometries(geos), height: y };
}

// ---------------------------------------------------------------------------

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.45;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 400);
  const cue = (n) => CUES[n] - segment.start;
  const C = [cue('mGrid'), cue('mZero'), cue('mWheel'), cue('mTemple'), cue('mOrbit'), cue('mStars')];
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';
  const r = rng(5551);

  // ---- camera path (pure functions of t; also used at build time to orient the later forms) ----------
  const elK = [[0, 0.6], [C[1] - 0.32, 0.66], [C[1] + 0.2, 0.98], [C[2] + 0.1, 1.08], [C[3] - 0.36, 1.06], [C[3] + 0.2, 0.0], [C[4] - 0.34, 0.04], [C[4] + 0.18, 0.3], [C[5] - 0.1, 0.27], [C[5] + 0.6, 0.15], [DUR, 0.12]];
  const DK = [[0, 13.6], [C[1] - 0.3, 11.2], [C[1] + 0.2, 11.4], [C[2] + 0.3, 10.6], [C[3] - 0.32, 10.0], [C[3] + 0.2, 14.4], [C[4] - 0.34, 13.6], [C[4] + 0.18, 12.6], [C[5] - 0.15, 12.0], [C[5] + 0.6, 9.0], [DUR, 7.2]];
  const TY = [[0, 0], [C[3] - 0.36, 0], [C[3] + 0.2, 3.25], [C[4] - 0.34, 3.05], [C[4] + 0.18, 0.15], [DUR, 0.15]];
  const azAt = (t) => 0.5 + 0.17 * t + 0.22 * intSmooth(t, C[3] - 0.4, C[3] + 0.2) - 0.22 * intSmooth(t, C[4] - 0.4, C[4] + 0.2) + 0.2 * intSmooth(t, C[5] - 0.1, C[5] + 0.6);
  const camPose = (t, pos, tgt) => {
    const el = timeWarp(t, elK), az = azAt(t), D = timeWarp(t, DK);
    tgt.set(0, timeWarp(t, TY), 0);
    pos.set(Math.cos(el) * Math.sin(az) * D, Math.sin(el) * D, Math.cos(el) * Math.cos(az) * D).add(tgt);
    return { el, az, D };
  };

  // ---- lights ----------------------------------------------------------------------------------------
  const key = new THREE.DirectionalLight(0xffe2bc, 3.2);
  key.position.set(-7, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 40 });
  const rim = new THREE.DirectionalLight(0xa8c4ff, 1.4);
  rim.position.set(6, 4, -8);
  const hubLight = new THREE.PointLight(0xffc070, 0, 14, 1.6);
  hubLight.position.set(0, 0.8, 0);
  scene.add(key, key.target, rim, hubLight);
  const WARM = new THREE.Color('#ffe2bc'), COOL = new THREE.Color('#c9d8ff');

  // ---- sky dome + floor ------------------------------------------------------------------------------
  const tEnd = DUR - 0.25;
  const pEnd = new THREE.Vector3(), gEnd = new THREE.Vector3();
  camPose(tEnd, pEnd, gEnd);
  const FWD = gEnd.clone().sub(pEnd).normalize();     // where the camera looks while STARS is zoomed through
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { uHor: { value: new THREE.Color('#2a1a0e') }, uTop: { value: new THREE.Color('#040306') }, uNeb: { value: 0 }, uFwd: { value: FWD }, uO: { value: 1 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform vec3 uHor, uTop, uFwd; uniform float uNeb, uO; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(uHor, uTop, smoothstep(-0.12, 0.55, d.y));
        float n = snoise(d * 2.1) * 0.5 + 0.5, n2 = snoise(d * 5.3 + 7.0) * 0.5 + 0.5, n3 = snoise(d * 11.0 - 3.0) * 0.5 + 0.5;
        float neb = pow(n, 3.0) * (0.55 + 0.7 * n2);
        float clear = smoothstep(0.992, 0.9, dot(d, uFwd));      // the centre of the final view stays dark
        vec3 nc = vec3(0.035, 0.05, 0.13) * neb + vec3(0.11, 0.065, 0.03) * pow(n2 * n, 3.0) + vec3(0.06, 0.03, 0.08) * pow(n3, 6.0);
        col += uNeb * clear * nc;
        gl_FragColor = vec4(col * uO, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), skyMat);
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog('#1a110a', 22, 150);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#16110c', roughness: 0.62, metalness: 0.15, transparent: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(180, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);

  // ---- S0: the Indus city -------------------------------------------------------------------------
  const city = buildCity(rng(77));
  const brick = new THREE.MeshStandardMaterial({ color: '#a8714a', roughness: 0.9, metalness: 0 });
  const cityMesh = new THREE.Mesh(city.geo, brick);
  cityMesh.castShadow = cityMesh.receiveShadow = true;
  const cityG = new THREE.Group();
  cityG.add(cityMesh);
  const cityEdges = revealLines(city.geo, { order: 'radial', mode: 'edges', threshold: 30, color: '#ffc77a', headColor: '#fff4dc', intensity: 0.75, head: 0.06 });
  cityG.add(cityEdges);
  const [px, py, pz, pw, pd] = city.pool;
  const poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd).rotateX(-Math.PI / 2), poolMat);
  pool.position.set(px, py, pz);
  cityG.add(pool);
  scene.add(cityG);
  const streetLines = segmentsLine(city.streets, { color: '#ffd9a0', headColor: '#ffffff', intensity: 1.5, head: 0.08, orderFn: (a, b) => 0, stagger: 0 });
  scene.add(streetLines);

  // ---- S1: zero — the ring, the dot at its heart, ten ticks (the ten digits) ------------------------
  const R0 = 2.75, RY = 0.2;
  const zeroG = new THREE.Group(); zeroG.position.y = RY;
  scene.add(zeroG);
  const ringA = progressLine(circlePoints(R0 + 0.22, 256, { plane: 'xz' }), { color: '#ffe4b0', headColor: '#ffffff', intensity: 1.5, head: 0.04 });
  const ringB = progressLine(circlePoints(R0 - 0.22, 256, { plane: 'xz' }), { color: '#ffe4b0', headColor: '#ffffff', intensity: 1.2, head: 0.04 });
  const ringC = progressLine(circlePoints(R0 + 1.25, 256, { plane: 'xz' }), { color: '#d9b98a', intensity: 0.6, head: 0.02 });
  const tickSegs = [];
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; tickSegs.push([V3(Math.cos(a) * (R0 + 0.36), 0, -Math.sin(a) * (R0 + 0.36)), V3(Math.cos(a) * (R0 + 0.82), 0, -Math.sin(a) * (R0 + 0.82))]); }
  for (let k = 0; k < 100; k++) { if (k % 10 === 0) continue; const a = (k / 100) * TAU; tickSegs.push([V3(Math.cos(a) * (R0 + 0.36), 0, -Math.sin(a) * (R0 + 0.36)), V3(Math.cos(a) * (R0 + 0.48), 0, -Math.sin(a) * (R0 + 0.48))]); }
  const ticks = segmentsLine(tickSegs, { color: '#ffe0a8', headColor: '#ffffff', intensity: 1.3, orderFn: (a, b, i) => (i < 10 ? i * 0.03 : 0.3 + (i % 37) * 0.008), stagger: 0.6 });
  zeroG.add(ringA, ringB, ringC, ticks);
  const digits = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * TAU, d = new TextPlane(String(k), { font: FONTS.display, weight: 600, height: 0.34, color: '#ffe2b0', intensity: 1.5, depthWrite: false });
    d.position.set(Math.cos(a) * (R0 + 1.15), 0.05, -Math.sin(a) * (R0 + 1.15));
    zeroG.add(d); digits.push(d);
  }
  const bindu = glowSprite({ color: '#ffd28a', intensity: 3, scale: 1.2 });
  bindu.position.y = 0.25;
  zeroG.add(bindu);

  // ---- S2: the 24-spoke wheel ---------------------------------------------------------------------
  const wheelGeo = buildWheel(R0 + 0.05, 0.12);
  const goldMat = new THREE.MeshStandardMaterial({ color: '#f2c46c', metalness: 1, roughness: 0.3, transparent: true, emissive: new THREE.Color('#ff9a30'), emissiveIntensity: 0.05 });
  const wheel = new THREE.Mesh(wheelGeo, goldMat);
  wheel.castShadow = true;
  const wheelG = new THREE.Group(); wheelG.position.y = 0.06;
  const wheelEdges = revealLines(wheelGeo, { order: 'radial', mode: 'edges', threshold: 35, color: '#ffe6b8', headColor: '#ffffff', intensity: 0.9, head: 0.05 });
  wheelG.add(wheel, wheelEdges);
  const hubGlow = glowSprite({ color: '#ffcf80', intensity: 2.5, scale: 2.2 }); hubGlow.position.y = 0.3;
  wheelG.add(hubGlow);
  scene.add(wheelG);

  // ---- S3: the vimana -----------------------------------------------------------------------------
  const vim = buildVimana();
  const TROT = azAt(C[3] + 0.4) + 0.55;                 // a three-quarter view of the tower as the camera arrives
  vim.geo.rotateY(TROT);
  const granite = new THREE.MeshStandardMaterial({ color: '#4a3e33', roughness: 0.78, metalness: 0.05 });
  const vimMesh = new THREE.Mesh(vim.geo, granite);
  vimMesh.castShadow = vimMesh.receiveShadow = true;
  const vimEdges = revealLines(vim.geo, { order: 'y', mode: 'edges', threshold: 30, color: '#ffc672', headColor: '#fff2d6', intensity: 0.85, head: 0.05 });
  const vimG = new THREE.Group();
  vimG.add(vimMesh, vimEdges);
  scene.add(vimG);
  // the courtyard: the enclosure and the axis drawn on the ground
  const encl = [];
  const rotP = (x, z) => V3(Math.cos(TROT) * x + Math.sin(TROT) * z, 0.015, -Math.sin(TROT) * x + Math.cos(TROT) * z);
  const rect = (w, d) => { const c = [[-w, -d], [w, -d], [w, d], [-w, d]]; for (let i = 0; i < 4; i++) encl.push([rotP(...c[i]), rotP(...c[(i + 1) % 4])]); };
  rect(4.6, 3.4); rect(4.9, 3.7); rect(2.1, 2.1);
  encl.push([rotP(0, 2.1), rotP(0, 3.4)], [rotP(0, 3.7), rotP(0, 7.5)]);
  const enclosure = segmentsLine(encl, { color: '#ffc77a', headColor: '#ffffff', intensity: 1.0, head: 0.05, orderFn: (a) => sat(a.length() / 8) * 0.5, stagger: 0.5 });
  scene.add(enclosure);

  // ---- S4: Mars and the orbit ---------------------------------------------------------------------
  const azM = azAt(C[4] + 0.45);
  const RIGHT = V3(Math.cos(azM), 0, -Math.sin(azM)), BACK = V3(Math.sin(azM), 0, Math.cos(azM)), UP = V3(0, 1, 0);
  const MR = 1.38, M = RIGHT.clone().multiplyScalar(-4.5).add(V3(0, 0.25, 0));
  const tilt = -0.22, D2 = BACK.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(UP, Math.sin(tilt));
  const rP = 1.85, rA = 9.6, EA = (rP + rA) / 2, EC = EA - rP, EB = Math.sqrt(EA * EA - EC * EC), ECC = EC / EA;
  const orbitAt = (E, out = new THREE.Vector3()) => out.copy(M).addScaledVector(RIGHT, -EA * (Math.cos(E) - ECC)).addScaledVector(D2, EB * Math.sin(E));
  const marsMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: RIGHT.clone().multiplyScalar(0.8).addScaledVector(UP, 0.42).addScaledVector(BACK, 0.35).normalize() }, uO: { value: 1 } },
    vertexShader: 'varying vec3 vN, vObj, vW; void main(){ vObj = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform vec3 uSun; uniform float uO; varying vec3 vN, vObj, vW;
      void main(){
        vec3 p = normalize(vObj);
        float n = snoise(p * 2.3) * 0.5 + snoise(p * 5.1) * 0.25 + snoise(p * 12.0) * 0.12 + snoise(p * 26.0) * 0.05;
        vec3 base = mix(vec3(0.42, 0.15, 0.06), vec3(0.78, 0.4, 0.19), smoothstep(-0.35, 0.45, n));
        float dark = smoothstep(0.1, 0.5, snoise(p * 1.7 + 3.1) + n * 0.3);
        base = mix(base, vec3(0.2, 0.09, 0.05), dark * 0.65);
        float crater = smoothstep(0.55, 0.75, snoise(p * 18.0 + 9.0));
        base *= 1.0 - crater * 0.2;
        base = mix(base, vec3(0.95, 0.93, 0.9), smoothstep(0.88, 0.93, abs(p.y) + n * 0.04));
        vec3 N = normalize(vN), Vd = normalize(cameraPosition - vW);
        float l = dot(N, uSun);
        vec3 col = base * (max(l, 0.0) * 2.6 + 0.012);
        float rim = pow(1.0 - max(dot(N, Vd), 0.0), 3.0);
        col += vec3(1.0, 0.55, 0.32) * rim * 0.9 * smoothstep(-0.2, 0.5, l);
        gl_FragColor = vec4(col, uO);
      }`,
    transparent: true,
  });
  const mars = new THREE.Mesh(new THREE.SphereGeometry(MR, 96, 48), marsMat);
  mars.position.copy(M);
  scene.add(mars);
  const ORB_N = 360, orbitPts = [];
  for (let i = 0; i <= ORB_N; i++) orbitPts.push(orbitAt((i / ORB_N) * TAU));
  const orbitLen = [0];
  for (let i = 1; i <= ORB_N; i++) orbitLen.push(orbitLen[i - 1] + orbitPts[i].distanceTo(orbitPts[i - 1]));
  const orbitGhost = progressLine(orbitPts, { color: '#ffd9a8', intensity: 0.55, head: 0.01 });
  const orbitTrail = progressLine(orbitPts, { color: '#ffe6c0', headColor: '#ffffff', intensity: 2.2, head: 0.012, fade: 0.35 });
  // the arrival arc: in from beyond the right edge, round behind the planet to periapsis
  const peri = orbitAt(0);
  const arrival = new THREE.CatmullRomCurve3([
    peri.clone().addScaledVector(RIGHT, 13).addScaledVector(UP, 3.2).addScaledVector(BACK, -6),
    peri.clone().addScaledVector(RIGHT, 6.5).addScaledVector(UP, 1.4).addScaledVector(BACK, -4.2),
    M.clone().addScaledVector(BACK, -2.3).addScaledVector(UP, 0.35),
    peri.clone().addScaledVector(D2, -0.9).addScaledVector(RIGHT, 0.12),
    peri.clone(),
  ]);
  const arrPts = arrival.getSpacedPoints(160);
  const arrLine = progressLine(arrPts, { color: '#cfe0ff', headColor: '#ffffff', intensity: 1.6, head: 0.02, fade: 0.5 });
  const craft = glowSprite({ color: '#fff2dc', intensity: 3.2, scale: 0.55 });
  const burn = glowSprite({ color: '#ffb35c', intensity: 3, scale: 2.2 });
  burn.position.copy(peri);
  scene.add(orbitGhost, orbitTrail, arrLine, craft, burn);
  const kepler = (Mn) => { let E = Mn; for (let i = 0; i < 6; i++) E -= (E - ECC * Math.sin(E) - Mn) / (1 - ECC * Math.cos(E)); return E; };

  // ---- the morph cloud: one point per particle in each of the six forms -------------------------------
  const N = lite ? 16000 : 40000;
  const mk = () => new Float32Array(N * 3);
  const put = (arr, i, x, y, z) => { arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z; };
  const copyIn = (arr, start, src, count) => { arr.set(src.subarray(0, count * 3), start * 3); };
  // P0 city: roofs + walls, and the street lines
  const P0 = mk();
  {
    const nb = Math.floor(N * 0.78);
    copyIn(P0, 0, sampleGeometry(city.geo, nb, { seed: 11 }), nb);
    for (let i = nb; i < N; i++) { const [a, b] = city.streets[Math.floor(r() * city.streets.length)]; const u = r(); put(P0, i, lerp(a.x, b.x, u) + (r() - 0.5) * 0.1, 0.03, lerp(a.z, b.z, u) + (r() - 0.5) * 0.1); }
  }
  // P1 zero: ring band, halo, the dot, ticks, outer and inner circles
  const P1 = mk();
  for (let i = 0; i < N; i++) {
    const q = i / N, a = r() * TAU;
    if (q < 0.5) { const b = r() * TAU, m = 0.16 + (q > 0.42 ? 0.3 * r() * r() : 0); put(P1, i, Math.cos(a) * (R0 + Math.cos(b) * m), RY + Math.sin(b) * m, -Math.sin(a) * (R0 + Math.cos(b) * m)); }
    else if (q < 0.6) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = 0.24 * Math.cbrt(r()); put(P1, i, s * Math.cos(th) * rr, RY + 0.25 + u * rr, s * Math.sin(th) * rr); }
    else if (q < 0.78) { const k = Math.floor(r() * 10), aa = (k / 10) * TAU + (r() - 0.5) * 0.022, rr = R0 + 0.36 + r() * 0.46; put(P1, i, Math.cos(aa) * rr, RY + (r() - 0.5) * 0.04, -Math.sin(aa) * rr); }
    else if (q < 0.9) { const rr = R0 + 1.25 + (r() - 0.5) * 0.04; put(P1, i, Math.cos(a) * rr, RY, -Math.sin(a) * rr); }
    else { const rr = R0 - 0.62 + (r() - 0.5) * 0.03; put(P1, i, Math.cos(a) * rr, RY, -Math.sin(a) * rr); }
  }
  // P2 wheel: on the gold wheel, and a guide circle outside it
  const P2 = mk();
  {
    const nb = Math.floor(N * 0.86);
    const s = sampleGeometry(wheelGeo, nb, { seed: 13 });
    for (let i = 0; i < nb; i++) s[i * 3 + 1] += 0.06;
    copyIn(P2, 0, s, nb);
    for (let i = nb; i < N; i++) { const a = r() * TAU, rr = R0 + 0.55 + (r() - 0.5) * 0.05; put(P2, i, Math.cos(a) * rr, 0.08, -Math.sin(a) * rr); }
  }
  // P3 vimana: on the tower, and the courtyard lines
  const P3 = mk();
  {
    const nb = Math.floor(N * 0.84);
    copyIn(P3, 0, sampleGeometry(vim.geo, nb, { seed: 17 }), nb);
    for (let i = nb; i < N; i++) { const [a, b] = encl[Math.floor(r() * encl.length)]; const u = r(); put(P3, i, lerp(a.x, b.x, u), 0.03, lerp(a.z, b.z, u)); }
  }
  // P4 Mars: a shell on the planet, the ellipse, the arrival arc, and dust in the orbital plane
  const P4 = mk();
  {
    const tmp = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const q = i / N;
      if (q < 0.3) { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = MR * (1.03 + r() * 0.05); put(P4, i, M.x + s * Math.cos(th) * rr, M.y + u * rr, M.z + s * Math.sin(th) * rr); }
      else if (q < 0.76) { orbitAt(r() * TAU, tmp); put(P4, i, tmp.x + (r() - 0.5) * 0.08, tmp.y + (r() - 0.5) * 0.08, tmp.z + (r() - 0.5) * 0.08); }
      else if (q < 0.84) { arrival.getPoint(r(), tmp); put(P4, i, tmp.x + (r() - 0.5) * 0.05, tmp.y + (r() - 0.5) * 0.05, tmp.z + (r() - 0.5) * 0.05); }
      else { const a = r() * TAU, rr = 2.2 + Math.pow(r(), 0.6) * 9; tmp.copy(M).addScaledVector(RIGHT, Math.cos(a) * rr).addScaledVector(D2, Math.sin(a) * rr * 0.8); put(P4, i, tmp.x, tmp.y + (r() - 0.5) * 0.3, tmp.z); }
    }
  }
  // P5 stars: a deep shell all round, thinned in the centre of the final view
  const P5 = mk();
  {
    const d = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u);
        d.set(s * Math.cos(th), u, s * Math.sin(th));
        const c = d.dot(FWD);
        if (c > Math.cos(0.17) && r() > 0.06) continue;                 // keep the centre dark
        if (c > Math.cos(0.3) && r() > 0.45) continue;
        break;
      }
      const rr = 40 + Math.pow(r(), 0.7) * 110;
      put(P5, i, gEnd.x + d.x * rr, gEnd.y + d.y * rr, gEnd.z + d.z * rr);
    }
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(sortPolar(P0), 3));
  cloudGeo.setAttribute('aP1', new THREE.BufferAttribute(sortPolar(P1), 3));
  cloudGeo.setAttribute('aP2', new THREE.BufferAttribute(sortPolar(P2), 3));
  cloudGeo.setAttribute('aP3', new THREE.BufferAttribute(sortPolar(P3, (x, y) => -y), 3));   // hub → spire
  cloudGeo.setAttribute('aP4', new THREE.BufferAttribute(sortPolar(P4), 3));
  cloudGeo.setAttribute('aP5', new THREE.BufferAttribute(sortPolar(P5), 3));
  const seeds = new Float32Array(N * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = r();
  cloudGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uStage: { value: 0 }, uStagger: { value: 0.45 }, uViewport: { value: 800 }, uSpin1: { value: 0 }, uSpin2: { value: 0 },
      uBurst: { value: 0 }, uBurstC: { value: new THREE.Vector3() }, uNoise: { value: 0.012 }, uStarPx: { value: 2 }, uHit: { value: 0 }, uOpacity: { value: 1 },
      uCol: { value: ['#ffc77e', '#ffe9c4', '#ffd690', '#ffc070', '#ffd2a8', '#e8eeff'].map((c) => new THREE.Color(c)) },
      uSize: { value: [0.04, 0.05, 0.036, 0.042, 0.046, 0.05] },
      uInt: { value: [0.7, 1.7, 0.85, 0.95, 1.25, 1.5] },
    },
    vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.frustumCulled = false;
  scene.add(cloud);
  const cu = cloudMat.uniforms;

  // a handful of brighter stars with a soft halo (kept off the centre of the final view)
  const heroes = [];
  for (let i = 0; i < 16; i++) {
    const d = new THREE.Vector3();
    do { const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u); d.set(s * Math.cos(th), u, s * Math.sin(th)); } while (d.dot(FWD) < 0.86 || d.dot(FWD) > 0.975);
    const g = glowSprite({ color: r() < 0.3 ? '#ffd9a8' : '#dfe9ff', intensity: 2.2, scale: 2.4 + r() * 2.2 });
    g.position.copy(gEnd).addScaledVector(d, 90 + r() * 40);
    g.userData.ph = r() * TAU;
    scene.add(g); heroes.push(g);
  }

  // cue accents: an ember burst and a shock ring on every morph cue
  const burst = new MorphParticles({ count: lite ? 900 : 1800, positions: sampleRing(lite ? 900 : 1800, 1, { thickness: 0.3, seed: 8 }), size: 0.05, intensity: 2.4, seed: 12 });
  scene.add(burst);
  scene.traverse((o) => { if (o.isSprite) o.material.fog = false; });
  const shock = progressLine(circlePoints(1, 200, { plane: 'xz' }), { color: '#ffe2b0', headColor: '#ffffff', intensity: 2.0, head: 0.0 });
  scene.add(shock);
  const dust = new Dust({ count: lite ? 500 : 1100, size: [22, 7, 16], center: [0, 2.5, 0], color: '#ffdcae', particleSize: 0.03, opacity: 0.4, intensity: 1.2, seed: 4 });
  scene.add(dust);

  // ---- HUD labels (bottom left, as in the Western montage) ------------------------------------------
  const hud = ctx.makeHUD();
  const SQ = OUTPUT_ASPECT < 1.5, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y);
  const LABELS = [['I · HARAPPA', 'c. 2600 BC'], ['III · SHUNYA', 'ZERO · AD 628'], ['IX · DHARMA CHAKRA', '24 SPOKES'], ['VII · VIMANA', 'THANJAVUR · 1010'], ['XII · MANGALYAAN', 'MARS ORBIT · 2014'], ['IV · TARA · STARS', '']];
  const labels = LABELS.map(([a, b]) => {
    const tp = new TextPlane(a, { font: FONTS.mono, weight: 400, height: 0.042 * UI, letterSpacing: 0.32, color: '#f4ecdf', intensity: 1.1 });
    tp.position.set(HX(0.16) + tp.worldWidth / 2, HY(-0.84), 0);
    hud.scene.add(tp);
    let sub = null;
    if (b) {
      sub = new TextPlane(b, { font: FONTS.mono, weight: 300, height: 0.032 * UI, letterSpacing: 0.3, color: '#e9c98f', intensity: 0.95 });
      sub.position.set(HX(0.16) + tp.worldWidth + 0.05 * UI + sub.worldWidth / 2, HY(-0.84) - 0.003, 0);
      hud.scene.add(sub);
    }
    return { tp, sub };
  });

  const self = {
    scene, camera, hud, background: 0x000000, bloom: { strength: 0.8 }, exposure: 1, update,
    exploreLimits: { zoomOut: 2.5 },
    // AR: the forms stand on the plan centre (the orbit spreads wider); the starfield has no subject
    arSubject: (t) => (t < C[4] - 0.3 ? { centre: V3(0, 2.6, 0), radius: 5.5 } : t < C[5] - 0.2 ? { centre: V3(0, 1.5, 0), radius: 7 } : null),
  };

  const qInv = new THREE.Quaternion();
  const tgt = new THREE.Vector3(), cpos = new THREE.Vector3(), tmpC = new THREE.Color(), tv = new THREE.Vector3();

  function update(t, info) {
    const T = info.T;
    // ---- rhythm: hits on the morph cues (the score's), beat punches getting denser, calm for the stars
    let hit = 0;
    for (let i = 0; i < 6; i++) if (t >= C[i] - 0.02) hit = Math.max(hit, Math.exp(-(t - C[i] + 0.02) * 7));
    const div = t < C[2] ? 1 : t < C[4] ? 2 : 4;
    const calm = smoothstep(C[5], C[5] + 0.5, t);
    const beat = pulse(T, { div, decay: div === 1 ? 6 : 9 }) * (1 - calm);

    // ---- camera
    const { el } = camPose(t, cpos, tgt);
    camera.position.copy(cpos);
    camera.up.set(-Math.sin(el) * Math.sin(azAt(t)), Math.cos(el), -Math.sin(el) * Math.cos(azAt(t)));
    camera.lookAt(tgt);
    camera.rotateZ(0.04 * Math.sin(t * 0.9) - 0.03 * envelope(t, C[3] - 0.3, C[4], 0.3, 0.3));
    // the round forms sit a little low in frame (the heading stands just above the centre)
    camera.translateY(lerp(0.0, 0.55, envelope(t, C[1] - 0.3, C[3] + 0.1, 0.4, 0.4)));
    camera.fov = 35 - hit * (1 - calm) * 1.6 - beat * 0.8 + calm * 4;
    camera.updateProjectionMatrix();

    // ---- palette / light
    const toCool = smoothstep(C[3] + 0.3, C[5], t);
    key.color.copy(WARM).lerp(COOL, toCool);
    key.intensity = 3.2 * (1 - 0.6 * smoothstep(C[4] - 0.3, C[4], t));
    key.target.position.set(0, 0, 0);
    scene.environmentIntensity = 0.45 * (1 - 0.6 * toCool);
    const hubOn = envelope(t, C[1] - 0.2, C[3] - 0.05, 0.3, 0.35);
    hubLight.intensity = 30 * hubOn * (1 + hit * 0.8);
    skyMat.uniforms.uHor.value.set('#2a1a0e').lerp(tmpC.set('#060812'), smoothstep(C[4] - 0.4, C[5], t));
    skyMat.uniforms.uNeb.value = smoothstep(C[5] - 0.3, C[5] + 0.7, t);
    scene.fog.color.copy(skyMat.uniforms.uHor.value);
    floorMat.opacity = 1 - smoothstep(C[4] - 0.25, C[4] + 0.3, t);
    floor.visible = floorMat.opacity > 0.002;

    // ---- S0 city: rises as the shot opens, gold edges and streets draw outward, then it sinks
    const rise = lerp(0.35, 1, ramp(t, -0.2, 0.45, ease.outCubic));
    const sink = ramp(t, C[1] - 0.42, C[1] - 0.02, ease.inCubic);
    cityG.scale.set(1, Math.max(0.001, rise * (1 - sink)), 1);
    cityG.visible = sink < 0.999;
    brick.color.set('#a8714a').multiplyScalar(1 - 0.5 * sink);
    cityEdges.progress = Math.min(1.1, ramp(t, -0.5, 0.7, ease.outCubic) * 1.1);
    cityEdges.opacity = 0.85 * (1 - sink);
    cityEdges.intensity = 0.7 + hit * 0.6 + beat * 0.25;
    streetLines.progress = ramp(t, -0.3, 0.5, ease.outCubic);
    streetLines.opacity = 1 - ramp(t, C[1] - 0.4, C[1] - 0.05);
    streetLines.intensity = 1.3 + hit * 1.2;
    poolMat.opacity = 0.65 * (0.8 + 0.2 * Math.sin(t * 7)) * (1 - sink);

    // ---- S1 zero: ring and ticks draw round, digits rise, the dot glows
    const zIn = ramp(t, C[1] - 0.2, C[1] + 0.25, ease.outCubic), zOut = ramp(t, C[2] - 0.25, C[2] + 0.02);
    zeroG.visible = zIn > 0 && zOut < 1;
    const spin1 = 0.25 * intSmooth(t, C[1] - 0.3, C[1] + 0.2);
    zeroG.rotation.y = spin1;
    ringA.progress = ringB.progress = zIn * 1.05; ringC.progress = ramp(t, C[1] - 0.05, C[1] + 0.4) * 1.05;
    ringA.opacity = ringB.opacity = 1 - zOut;
    ringC.opacity = 1 - ramp(t, C[3] - 0.3, C[3]);           // the outer circle stays on as the wheel's guide
    ringC.visible = ringC.progress > 0 && ringC.opacity > 0;
    ringA.intensity = ringB.intensity = 1.3 + hit * 1.2 + beat * 0.4;
    ticks.progress = ramp(t, C[1] - 0.05, C[1] + 0.35); ticks.opacity = 1 - zOut;
    qInv.copy(zeroG.quaternion).invert();
    digits.forEach((d, k) => {
      const u = ramp(t, C[1] + 0.02 + k * 0.025, C[1] + 0.2 + k * 0.025, ease.outCubic);
      d.opacity = u * (1 - zOut);
      d.quaternion.copy(qInv).multiply(camera.quaternion);
      d.position.y = 0.05 + (1 - u) * -0.2;
    });
    bindu.material.opacity = zIn * (1 - ramp(t, C[3] - 0.3, C[3])) ;
    bindu.scale.setScalar(1.1 + hit * 0.8 + beat * 0.3);
    bindu.position.y = lerp(0.25, 0.22, zOut);

    // ---- S2 wheel: cast in gold from the ring, turning ever faster
    const wIn = ramp(t, C[2] - 0.15, C[2] + 0.2, ease.outCubic), wOut = ramp(t, C[3] - 0.32, C[3] - 0.04);
    const spin2 = 0.4 * intSmooth(t, C[2] - 0.5, C[2] + 0.3) + 1.6 * intSmooth(t, C[2] + 0.1, C[3]);
    wheelG.visible = wIn > 0 && wOut < 1;
    wheelG.rotation.y = spin2;
    wheelG.position.y = 0.06 + (1 - wIn) * -0.15 + wOut * 0.3;
    wheelG.scale.setScalar(lerp(0.94, 1, wIn) * (1 + wOut * 0.06));
    goldMat.opacity = wIn * (1 - ease.inQuad(wOut));
    goldMat.emissiveIntensity = 0.05 + hit * 0.5;
    wheel.visible = goldMat.opacity > 0.01;
    wheelEdges.progress = ramp(t, C[2] - 0.2, C[2] + 0.25) * 1.1;
    wheelEdges.opacity = 0.8 * (1 - wOut);
    hubGlow.material.opacity = wIn * (1 - wOut) * 0.8;
    hubGlow.scale.setScalar(1.6 + hit * 1.2 + beat * 0.4);

    // ---- S3 vimana: rises out of the ground course by course, gold edges climbing with it
    const vIn = ramp(t, C[3] - 0.2, C[3] + 0.22, ease.outCubic), vOut = ramp(t, C[4] - 0.36, C[4] - 0.02, ease.inCubic);
    vimG.visible = vIn > 0 && vOut < 1;
    vimG.scale.set(1, Math.max(0.001, vIn * (1 - vOut)), 1);
    vimEdges.progress = ramp(t, C[3] - 0.2, C[3] + 0.35) * 1.05;
    vimEdges.opacity = 0.9 * (1 - vOut);
    vimEdges.intensity = 0.8 + hit * 0.7 + beat * 0.3;
    granite.color.set('#4a3e33').multiplyScalar(1 - 0.6 * vOut);
    enclosure.progress = ramp(t, C[3] - 0.1, C[3] + 0.4); enclosure.opacity = 1 - vOut;

    // ---- S4 Mars: the planet, the arrival, the burn on the cue, the long ellipse
    const mIn = ramp(t, C[4] - 0.3, C[4] + 0.1, ease.outCubic), mOut = ramp(t, C[5] - 0.05, C[5] + 0.5);
    mars.visible = mIn > 0 && mOut < 1;
    mars.scale.setScalar(Math.max(0.001, lerp(0.5, 1, mIn) * (1 - 0.15 * mOut)));
    mars.rotation.y = 0.6 + t * 0.25;
    marsMat.uniforms.uO.value = mIn * (1 - mOut);
    const aU = ramp(t, C[4] - 0.42, C[4], ease.inQuad);         // craft along the arrival arc, speeding up
    arrLine.progress = aU; arrLine.opacity = (t < C[4] - 0.42 ? 0 : 1) * (1 - ramp(t, C[4] + 0.1, C[4] + 0.45));
    let craftPos;
    if (t < C[4]) craftPos = arrival.getPointAt(Math.min(1, aU), tv);
    else {
      const E = kepler(2.4 * (t - C[4]));
      craftPos = orbitAt(E, tv);
      const fi = Math.min(ORB_N, Math.floor((E / TAU) * ORB_N));
      orbitTrail.progress = Math.min(1, orbitLen[fi] / orbitLen[ORB_N]);
    }
    if (t < C[4]) orbitTrail.progress = 0;
    orbitTrail.opacity = 1 - mOut;
    craft.position.copy(craftPos);
    craft.visible = t > C[4] - 0.42 && mOut < 1;
    craft.material.opacity = 1 - mOut;
    craft.scale.setScalar(0.5 + beat * 0.15);
    orbitGhost.progress = ramp(t, C[4] - 0.05, C[4] + 0.4) * 1.02; orbitGhost.opacity = 0.8 * (1 - mOut);
    const burnU = t - C[4];
    burn.visible = burnU > -0.03 && burnU < 0.5;
    burn.material.opacity = burn.visible ? Math.exp(-Math.max(0, burnU) * 7) : 0;
    burn.scale.setScalar(1.2 + Math.max(0, burnU) * 4);

    // ---- S5 stars: calm, deep; a few brighter ones breathe
    heroes.forEach((g) => { g.material.opacity = smoothstep(C[5] + 0.1, C[5] + 0.7, t) * (0.75 + 0.25 * Math.sin(t * 2.2 + g.userData.ph)); g.visible = g.material.opacity > 0.01; });

    // ---- the morph cloud
    let stage = 0;
    for (let k = 1; k <= 4; k++) stage += ramp(t, C[k] - 0.36, C[k] + 0.06, ease.linear);
    stage += ramp(t, C[5] - 0.32, C[5] + 0.6, ease.linear);
    cu.uStage.value = stage;
    cu.uTime.value = t;
    cu.uViewport.value = info.height;
    cu.uStarPx.value = 2.1 * (info.height / 600);
    cu.uSpin1.value = spin1;
    cu.uSpin2.value = spin2;
    cu.uHit.value = hit * (1 - calm);
    cu.uOpacity.value = ramp(t, -0.4, 0.3);
    // a burst outward from each form's centre, right on its cue
    let bi = -1;
    for (let i = 1; i < 6; i++) if (t >= C[i] - 0.06) bi = i;
    const bc = bi === 4 ? M : bi === 3 ? V3(0, 1.5, 0) : V3(0, 0.2, 0);
    const bt = bi >= 0 ? t - (C[bi] - 0.06) : 9;
    cu.uBurstC.value.copy(bc);
    cu.uBurst.value = bi >= 0 && bi < 5 ? Math.sin(Math.PI * sat(bt / 0.4)) * 0.22 * (1 - sat(bt / 0.4)) : 0;

    // ---- cue accents
    if (bi >= 0 && bt < 0.6) {
      burst.visible = true;
      burst.position.copy(bc);
      if (bi === 3) burst.position.y = 0.05;
      burst.scale.setScalar([1, 3.0, 3.2, 2.6, MR * 1.2, 2.4][bi]);
      burst.u.scatter = ease.outCubic(sat(bt / 0.6)) * (1.2 + bi * 0.2);
      burst.u.opacity = (1 - sat(bt / 0.6)) * (bi === 5 ? 0.6 : 1);
      burst.u.color = tmpC.copy(WARM).lerp(COOL, sat((bi - 2) / 3));
      shock.visible = bi < 5;
      shock.position.copy(burst.position);
      shock.scale.setScalar(lerp(bi === 4 ? MR * 1.1 : 2.5, bi === 4 ? 6 : 9, ease.outCubic(sat(bt / 0.55))));
      shock.progress = 1;
      shock.opacity = 0.9 * (1 - sat(bt / 0.55)) ** 1.5;
    } else { burst.visible = false; shock.visible = false; }
    burst.u.swirl = t * 0.6;
    burst.tick(t, info);
    dust.tick(t, info);
    dust.u.opacity = 0.4 * (1 - smoothstep(C[4] - 0.2, C[4] + 0.2, t));

    // ---- labels
    labels.forEach(({ tp, sub }, i) => {
      const a = C[i], b = i < 5 ? C[i + 1] : DUR;
      const o = envelope(t, a - 0.02, b, 0.06, 0.08, ease.linear) * (1 - sat((t - (DUR - 0.5)) / 0.3));
      tp.opacity = o; tp.reveal = sat((t - a) / 0.25);
      if (sub) { sub.opacity = o * 0.9; sub.reveal = sat((t - a - 0.1) / 0.25); }
    });

    self.exposure = 1 + beat * 0.06 + hit * 0.05 * (1 - calm);
    self.bloom.strength = 0.8 + hit * 0.25 * (1 - calm) + beat * 0.1;
  }

  return self;
}
