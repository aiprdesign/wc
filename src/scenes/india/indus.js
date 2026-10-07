// THE FIRST CITIES — Mohenjo-daro and Harappa, c. 2600 – 1900 BC (story 7.5 – 12.5 s)
// One continuous move, then a cut on the last hit:
//   dawn over the Indus plain → (indusDust) the baked-brick city rises out of the ground, citadel mound and
//   lower town → (indusGrid) gold survey lines draw the streets and every house settles onto the grid, the
//   camera climbing to a 3/4 aerial → (indusDrains) a dive to the street, whose surface goes cut-away to show
//   the covered brick drain under it, house drains joining, sump pits → (greatBath) up over the citadel wall
//   to the Great Bath as it fills → (indusWeights) cut to a macro of the cubical chert weights and a steatite
//   seal on a brick sill in the low sun.
// Technique: procedural city (recursive lot subdivision, courtyard houses baked into a few merged meshes),
// GPU rise / settle animation (indus-assets.js), an x-ray ground cut, custom water and dawn-sky shaders.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, timeWarp, clamp } from '../../lib/math.js';
import { segmentsLine, progressTube, progressLine, circlePoints } from '../../lib/lines.js';
import { Dust, MorphParticles } from '../../lib/particles.js';
import { Callout, Dimension, faceCamera } from '../../lib/hud.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { sectionTexture, chertTexture, sealTextures, Acc, STATIC, NOJIT, riseMaterial, riseDepth } from './indus-assets.js';
import { cityMaterial } from './indus-surface.js';
import { groundMasks, groundPatch } from './indus-ground.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SUN_DIR = V(0.85, 0.4, -0.38).normalize();         // low morning sun, east-north-east
const HORIZON = new THREE.Color(0.74, 0.53, 0.40), ZENITH = new THREE.Color(0.12, 0.21, 0.42), SUN_COL = new THREE.Color(1.0, 0.7, 0.42);
const FOG_D = 0.0008;
const GOLD = '#ffcf85';
const CIT_Y = 10;                                        // top of the citadel mound
const POOL = { x0: -43.5, x1: -36.5, z0: -6, z1: 6 };    // the Great Bath: c. 7 m × 12 m
const DECK_Y = CIT_Y + 0.3, POOL_D = 2.4;                // c. 2.4 m deep
const ST_HW = 4.5, DRAIN_Z = 1.6;                        // the drain street (E–W, z = 0) and its drain
const XR = { x0: 12, x1: 128 };                          // the stretch of street that goes x-ray

// The lower town: superblocks between the main streets (N–S at x = 72, 134; E–W at z = −62, 0, 58).
const TOWN_X = [[10, 67], [77, 130], [138, 194]];
const TOWN_Z = [[-118, -66], [-58, -ST_HW], [ST_HW, 54], [62, 114]];
const NS = [{ x: 72, w: 10 }, { x: 134, w: 8 }];
const EW = [{ z: -62, w: 8 }, { z: 0, w: 9 }, { z: 58, w: 8 }];

function subdivide(x0, x1, z0, z1, r, out) {
  const w = x1 - x0, d = z1 - z0;
  if (w <= 17 && d <= 17) { if (w > 5 && d > 5) out.push([x0, x1, z0, z1]); return; }
  const alongX = w >= d, L = alongX ? w : d;
  const s = (alongX ? x0 : z0) + L * (0.36 + r() * 0.28);
  const lane = r() < (L > 30 ? 0.55 : 0.22) ? 2.4 + r() : 0;
  if (alongX) { subdivide(x0, s - lane / 2, z0, z1, r, out); subdivide(s + lane / 2, x1, z0, z1, r, out); }
  else { subdivide(x0, x1, z0, s - lane / 2, r, out); subdivide(x0, x1, s + lane / 2, z1, r, out); }
}

// Dawn sky (direction only: drawn behind everything, follows the camera).
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR }, uHor: { value: HORIZON }, uZen: { value: ZENITH }, uSunCol: { value: SUN_COL }, uK: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun, uHor, uZen, uSunCol; uniform float uK; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uZen, smoothstep(0.0, 0.34, h));
        vec2 a = normalize(d.xz + 1e-5), s = normalize(uSun.xz);
        float az = max(dot(a, s), 0.0), sd = max(dot(d, uSun), 0.0);
        c += uSunCol * pow(az, 5.0) * (1.0 - smoothstep(-0.05, 0.4, h)) * 0.85;   // the warm band under the sun
        c += vec3(0.55, 0.32, 0.38) * pow(1.0 - az, 3.0) * (1.0 - smoothstep(0.0, 0.25, h)) * 0.25; // rose opposite
        c += uSunCol * (pow(sd, 900.0) * 60.0 + pow(sd, 60.0) * 1.2 + pow(sd, 8.0) * 0.35);
        // the Kirthar hills, faint and blue with distance, along the western horizon
        float az0 = atan(d.z, d.x);
        float ridge = 0.012 + 0.010 * sin(az0 * 9.0 + 1.3) * sin(az0 * 3.0) + 0.006 * sin(az0 * 23.0) + 0.003 * sin(az0 * 61.0);
        float west = smoothstep(0.1, -0.5, d.x);
        if (h < ridge * west && h > -0.01) c = mix(c, mix(uHor, uZen, 0.35) * 0.9, 0.55 * west);
        if (h < 0.0) c = mix(c, uHor * 0.85, smoothstep(0.0, -0.08, h));
        gl_FragColor = vec4(c * uK, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
}

// Water: sky reflection with a fresnel, rippled normals, sun glint, a lit body colour with caustics, fog.
function waterMaterial({ scale = 0.08, deep = [0.05, 0.12, 0.13], body = [0.0, 0.0, 0.0], speed = 0.15, caustic = 0, amp = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSun: { value: SUN_DIR }, uHor: { value: HORIZON }, uZen: { value: ZENITH }, uSunCol: { value: SUN_COL },
      uDeep: { value: new THREE.Vector3(...deep) }, uBody: { value: new THREE.Vector3(...body) }, uTime: { value: 0 }, uScale: { value: scale },
      uSpeed: { value: speed }, uCaustic: { value: caustic }, uAmp: { value: amp }, uFogD: { value: FOG_D }, uFogC: { value: HORIZON }, uK: { value: 1 },
    },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uSun, uHor, uZen, uSunCol, uDeep, uBody, uFogC; uniform float uTime, uScale, uSpeed, uCaustic, uFogD, uK, uAmp; varying vec3 vW;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hh(i), hh(i + vec2(1, 0)), f.x), mix(hh(i + vec2(0, 1)), hh(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec3 Vd = normalize(vW - cameraPosition);
        vec2 q = vW.xz * uScale + vec2(0.0, uTime * uSpeed);
        // gentle swell: a few crossing wave trains plus fine noise (slopes, not heights)
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.3) * cos(dot(q, vec2(5.1, 1.9)) * 6.0 + uTime * 2.3) * 0.05;
        g += vec2(-0.4, 0.9) * cos(dot(q, vec2(-2.3, 6.7)) * 6.0 + uTime * 1.7) * 0.04;
        g += vec2(0.6, -0.7) * cos(dot(q, vec2(7.9, -5.3)) * 6.0 + uTime * 3.1) * 0.025;
        g += (vec2(n2(q * 17.0 + 3.0), n2(q * 19.0 + 1.7)) - 0.5) * 0.05;
        vec3 N = normalize(vec3(g.x * uAmp, 1.0, g.y * uAmp));
        vec3 R = reflect(Vd, N);
        float fr = 0.02 + 0.98 * pow(1.0 - max(dot(-Vd, N), 0.0), 5.0);
        vec3 sky = mix(uHor, uZen, smoothstep(0.0, 0.5, R.y));
        float rs = max(dot(R, uSun), 0.0);
        vec3 col = mix(uDeep, sky, fr) + uSunCol * (pow(rs, 260.0) * 30.0 + pow(rs, 24.0) * 0.35);
        vec2 qw = q + (vec2(n2(q * 1.7), n2(q * 1.9 + 5.0)) - 0.5) * 1.2;
        float c1 = sin(qw.x * 7.0 + sin(qw.y * 5.0 + uTime * 1.3) * 1.4 + uTime * 0.9);
        float c2 = sin(qw.y * 6.0 + sin(qw.x * 4.0 - uTime * 1.1) * 1.6 - uTime * 0.7);
        float c = pow(1.0 - abs(c1 * c2), 7.0);
        col += uBody * (0.8 + uCaustic * c * 1.1);
        float d = length(vW - cameraPosition);
        col = mix(col, uFogC, 1.0 - exp(-uFogD * uFogD * d * d));
        gl_FragColor = vec4(col * uK, 1.0);
      }`,
  });
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const T_DUST = cue('indusDust'), T_GRID = cue('indusGrid'), T_DRAIN = cue('indusDrains'), T_BATH = cue('greatBath'), T_WT = cue('indusWeights');
  const dur = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.FogExp2(HORIZON.clone(), FOG_D);
  scene.background = new THREE.Color(0, 0, 0);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.5, 6000);

  const city = new THREE.Group(); scene.add(city);
  const shop = new THREE.Group(); scene.add(shop);   // the macro set (weights and seal), shown after the cut

  // ------------------------------------------------------------------------------------- materials
  const U = { uRise: { value: 0 }, uSettle: { value: 0 } };
  // procedural, world-space surfaces (indus-surface.js): no texture tile anywhere on the city
  const brickMat = cityMaterial('brick', U);
  const roofMat = cityMaterial('roof', U);
  const bitMat = cityMaterial('bitumen', U, {}, { tide: DECK_Y - 0.28 });
  const woodMat = cityMaterial('wood', U);
  const potMat = cityMaterial('pot', U);
  const clothMat = cityMaterial('cloth', U, { side: THREE.DoubleSide });
  const voidMat = riseMaterial(new THREE.MeshStandardMaterial({ color: '#1c130d', roughness: 0.95 }), U, 'void');
  const depthMat = riseDepth(U);
  const leafMat = riseMaterial(new THREE.MeshStandardMaterial({ color: '#53622c', roughness: 0.85, flatShading: true }), U, 'leaf');

  // ------------------------------------------------------------------------------------- the city
  const walls = new Acc(), roof = new Acc(), bit = new Acc(), voids = new Acc(), leaves = new Acc();
  const wood = new Acc(), pots = new Acc(), cloth = new Acc();
  if (lite) { const p = walls.prism.bind(walls); walls.prism = (x0, x1, y0, y1, z0, z1, o = {}) => p(x0, x1, y0, y1, z0, z1, { ...o, c: 0, bev: 0 }); }   // (phones: square arrises)
  const crownG = new THREE.IcosahedronGeometry(1, lite ? 0 : 1), trunkG = new THREE.CylinderGeometry(0.12, 0.18, 1, 5).toNonIndexed();
  // a few reusable parts (non-indexed, placed by clone + transform)
  const potG = [
    new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.24, 0.16], [0.25, 0.3], [0.17, 0.46], [0.12, 0.5], [0.14, 0.56], [0, 0.56]].map(([x, y]) => new THREE.Vector2(x, y)), 6).toNonIndexed(),
    new THREE.LatheGeometry([[0, 0], [0.2, 0.01], [0.3, 0.08], [0.32, 0.16], [0.28, 0.2], [0, 0.2]].map(([x, y]) => new THREE.Vector2(x, y)), 6).toNonIndexed(),
    new THREE.LatheGeometry([[0, 0], [0.22, 0.04], [0.34, 0.3], [0.34, 0.62], [0.24, 0.86], [0.2, 0.94], [0, 0.94]].map(([x, y]) => new THREE.Vector2(x, y)), 6).toNonIndexed(),
  ];
  const wellOut = new THREE.CylinderGeometry(0.62, 0.66, 0.72, 12, 1, true).toNonIndexed();
  const wellIn = new THREE.CylinderGeometry(0.42, 0.42, 0.72, 12, 1, true).toNonIndexed(); { const n = wellIn.attributes.normal, p = wellIn.attributes.position; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); for (let i = 0; i < p.count; i += 3) { const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1); p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)); p.setXYZ(i + 2, x, y, z); const nx = n.getX(i + 1), ny = n.getY(i + 1), nz = n.getZ(i + 1); n.setXYZ(i + 1, n.getX(i + 2), n.getY(i + 2), n.getZ(i + 2)); n.setXYZ(i + 2, nx, ny, nz); } }
  const wellTop = new THREE.RingGeometry(0.42, 0.62, 12, 1).rotateX(-Math.PI / 2).toNonIndexed();
  const wellWater = new THREE.CircleGeometry(0.42, 12).rotateX(-Math.PI / 2).toNonIndexed();
  const bitG = new THREE.BoxGeometry(0.28, 0.07, 0.14).toNonIndexed();
  const half = new THREE.BoxGeometry(0.15, 0.07, 0.13).toNonIndexed();
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
  const placed = (g, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => {
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz)); tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(s, s, s));
    return g.clone().applyMatrix4(tmpM);
  };
  const r = rng(1931);
  const fronts = [];                                         // houses fronting the drain street → house drains
  const riseDelay = (x, z) => T_DUST + 0.6 * sat(Math.hypot(x - 70, (z + 10) * 0.9) / 190) + 0.06 * Math.sin(z * 0.07 + x * 0.03) ** 2;

  // a box given on one face of a wall: u along the wall, v up, d outwards from the wall plane
  // face = { ax: 'x' | 'z', at, out: ±1 }
  function fbox(acc, F, u0, u1, v0, v1, d0, d1, blk, jit, opts) {
    const a = F.at + F.out * d0, b = F.at + F.out * d1, lo = Math.min(a, b), hi = Math.max(a, b);
    if (F.ax === 'z') acc.box(Math.min(u0, u1), Math.max(u0, u1), v0, v1, lo, hi, blk, jit, opts);
    else acc.box(lo, hi, v0, v1, Math.min(u0, u1), Math.max(u0, u1), blk, jit, opts);
  }
  // a doorway or a window: dark opening, brick jambs standing proud, a timber lintel, a brick threshold
  function opening(F, u, wdt, v0, v1, blk, jit, { door = true, seed = 0.5 } = {}) {
    const u0 = u - wdt / 2, u1 = u + wdt / 2;
    const outF = F.ax === 'z' ? (F.out > 0 ? 'pz' : 'nz') : (F.out > 0 ? 'px' : 'nx');
    fbox(voids, F, u0, u1, v0, v1, 0, 0.025, blk, jit, { faces: outF });
    if (!lite) { fbox(walls, F, u0 - 0.24, u0, v0, v1, 0, 0.09, blk, jit); fbox(walls, F, u1, u1 + 0.24, v0, v1, 0, 0.09, blk, jit); }
    wood.tag = [0, v1, v1 + 0.2, seed];
    fbox(wood, F, u0 - 0.36, u1 + 0.36, v1, v1 + 0.2, 0, 0.15, blk, jit);
    if (lite) return;
    if (door) { const t = walls.tag; walls.tag = [0, v0 - 1, v0, seed]; fbox(walls, F, u0 - 0.15, u1 + 0.15, v0, v0 + 0.12, 0, 0.38, blk, jit); walls.tag = t; }
    else {                                                    // a lattice of two bars
      wood.tag = [1, v0, v1, seed];
      const x = (u0 + u1) / 2; fbox(wood, F, x - 0.03, x + 0.03, v0, v1, 0, 0.05, blk, jit, { faces: F.ax === 'z' ? (F.out > 0 ? 'pz px nx' : 'nz px nx') : (F.out > 0 ? 'px pz nz' : 'nx pz nz') });
    }
  }
  function pot(acc, x, y, z, s, seed, ry = 0, force = false) {
    if (lite && !force) return;
    const g = potG[Math.floor(seed * 2.99)];
    const h = [0.56, 0.2, 0.94][Math.floor(seed * 2.99)] * s;
    acc.tag = [0, y, y + h, seed];
    acc.geo(placed(g, x, y, z, ry, s));
  }

  function house([x0, x1, z0, z1], baseY, delay, { tall = 1, near = false } = {}) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const two = r() < 0.2;
    const h = (3.0 + r() * 2.0) * tall * (two ? 1.5 : 1);
    const upper = !two && r() < 0.45;
    const blk = [cx, cz, delay + r() * 0.12, baseY + h + 3.4];
    const jit = [(r() - 0.5) * 3.4, (r() - 0.5) * 3.4, (r() - 0.5) * 0.18];
    const Y0 = baseY, Y1 = baseY + h;
    const seed = r(), plaster = r() < 0.55 ? 0 : 0.15 + r() * 0.55;
    const parapet = r() < 0.82, ch = 0.12 + r() * 0.08;
    const court = w >= 9 && d >= 9 && r() < 0.85;
    const rr = court ? clamp(Math.min(w, d) * 0.3, 2.6, 4.2) : 0;
    const hole = court ? [x0 + rr, x1 - rr, z0 + rr, z1 - rr] : null;
    walls.tag = [plaster, Y0, Y1, seed]; roof.tag = [0, Y0, Y1, seed];
    walls.prism(x0, x1, Y0, Y1, z0, z1, { c: ch, bev: parapet ? 0 : 0.07, top: roof, hole, blk, jit });
    const sides = [{ ax: 'z', at: z0, out: -1, u0: x0, u1: x1 }, { ax: 'z', at: z1, out: 1, u0: x0, u1: x1 }, { ax: 'x', at: x0, out: -1, u0: z0, u1: z1 }, { ax: 'x', at: x1, out: 1, u0: z0, u1: z1 }];
    if (parapet) {
      const t = 0.3, ph = 0.4 + r() * 0.45;
      walls.tag = [Math.max(plaster, 0.55), Y1 - 1.5, Y1 + ph, seed];
      walls.prism(x0, x1, Y1, Y1 + ph, z0, z1, { c: ch, bev: 0.05, top: roof, hole: [x0 + t, x1 - t, z0 + t, z1 - t], blk, jit, floor: null });
      if (court && r() < 0.6) walls.prism(hole[0] - t, hole[1] + t, Y1, Y1 + 0.3, hole[2] - t, hole[3] + t, { c: 0, bev: 0.04, top: roof, hole, blk, jit, floor: null });
      // drain spouts through the parapet, out over the street
      for (const F of sides) if (r() < 0.45 && !lite) {
        const u = lerp(F.u0, F.u1, 0.2 + r() * 0.6);
        wood.tag = [0, Y1, Y1 + 0.2, seed];
        fbox(wood, F, u - 0.09, u + 0.09, Y1 + 0.02, Y1 + 0.13, -0.05, 0.55, blk, jit);
      }
    }
    walls.tag = [plaster, Y0, Y1, seed];
    // a doorway on one side, small high windows on others
    const dside = Math.floor(r() * 4);
    for (const [i, F] of sides.entries()) {
      const L = F.u1 - F.u0;
      if (i === dside && L > 3) opening(F, lerp(F.u0, F.u1, 0.25 + r() * 0.5), 1.0 + r() * 0.2, Y0, Y0 + 2.0 + r() * 0.2, blk, jit, { seed });
      else if (L > 4 && r() < 0.55) {
        const n = L > 9 && r() < 0.5 ? 2 : 1;
        for (let k = 0; k < n; k++) opening(F, lerp(F.u0, F.u1, (k + 0.5 + (r() - 0.5) * 0.4) / n), 0.55, Y0 + Math.min(h - 1.1, 2.5), Y0 + Math.min(h - 0.45, 3.15), blk, jit, { door: false, seed });
      }
    }
    if (court) {
      const [hx0, hx1, hz0, hz1] = hole, cw = Math.min(hx1 - hx0, hz1 - hz0);
      const inner = [{ ax: 'z', at: hz0, out: 1, u0: hx0, u1: hx1 }, { ax: 'z', at: hz1, out: -1, u0: hx0, u1: hx1 }, { ax: 'x', at: hx0, out: 1, u0: hz0, u1: hz1 }, { ax: 'x', at: hx1, out: -1, u0: hz0, u1: hz1 }];
      walls.tag = [Math.min(1, plaster + 0.35), Y0, Y1, seed];
      for (const F of inner) if (r() < 0.75 && F.u1 - F.u0 > 2.2) opening(F, lerp(F.u0, F.u1, 0.3 + r() * 0.4), 0.95, Y0 + 0.04, Y0 + 2.0, blk, jit, { seed });
      // stairs up to the roof along the north inner wall, or a timber ladder
      const n = Math.ceil((Y1 - Y0) / 0.25), run = 0.27, rise = (Y1 - Y0) / n;
      if (r() < 0.55 && n * run < hx1 - hx0 - 0.4) {
        const sx = hx1 - n * run;
        walls.tag = [0.3, Y0, Y1, seed];
        for (let k = 0; k < n; k++) walls.box(sx + k * run, hx1, Y0 + k * rise, Y0 + (k + 1) * rise, hz0, hz0 + 0.95, blk, jit, { faces: 'nx py pz' });
      } else if (!lite) {
        const lx = lerp(hx0, hx1, 0.3 + r() * 0.4), lz = hz1 - 0.35;
        wood.tag = [1, Y0, Y1, seed];
        for (const e of [-0.24, 0.24]) wood.box(lx + e - 0.035, lx + e + 0.035, Y0, Y1 + 0.7, lz - 0.035, lz + 0.035, blk, jit, { faces: 'px nx pz nz py' });
        wood.tag = [0, Y0, Y1, seed];
        for (let y = Y0 + 0.3; y < Y1 + 0.5; y += 0.32) wood.box(lx - 0.24, lx + 0.24, y, y + 0.045, lz - 0.025, lz + 0.025, blk, jit, { faces: 'nz py' });
      }
      const ccx = (hx0 + hx1) / 2, ccz = (hz0 + hz1) / 2;
      if (cw > 3 && r() < 0.4) {                                                                  // a shade tree in the courtyard
        const tx = ccx + (r() - 0.5), tz = ccz + (r() - 0.5), th = 2.6 + r() * 2, cr = Math.min(2.6, cw * 0.42);
        leaves.geo(trunkG.clone().scale(1, th, 1).translate(tx, Y0 + th / 2, tz), blk, jit);
        leaves.geo(crownG.clone().scale(cr, cr * 0.75, cr).translate(tx, Y0 + th + cr * 0.4, tz), blk, jit);
        leaves.geo(crownG.clone().scale(cr * 0.7, cr * 0.55, cr * 0.7).translate(tx + cr * 0.5, Y0 + th + cr * 0.1, tz - cr * 0.3), blk, jit);
      } else if (r() < 0.6) {                                                                     // a well: a ring of wedge bricks
        const wx = hx0 + 1.0, wz = hz1 - 1.0;
        walls.tag = [0, Y0, Y0 + 0.72, seed];
        walls.geo(wellOut.clone().translate(wx, Y0 + 0.36, wz), blk, jit);
        walls.geo(wellIn.clone().translate(wx, Y0 + 0.36, wz), blk, jit);
        walls.geo(wellTop.clone().translate(wx, Y0 + 0.72, wz), blk, jit);
        voids.geo(wellWater.clone().translate(wx, Y0 + 0.5, wz), blk, jit);
        pot(pots, wx + 0.9, Y0 + 0.04, wz - 0.2, 0.9, r(), r() * 6);
      }
      // storage jars in a corner, a quern stone
      for (let k = 0, m = Math.floor(r() * 4); k < m; k++) pot(pots, hx1 - 0.45 - k * 0.55, Y0 + 0.04, hz1 - 0.45 - (k % 2) * 0.3, 0.8 + r() * 0.5, r(), r() * 6);
    } else if (r() < 0.6) {                                                                       // roof hatch over the inner stair
      const hx = lerp(x0 + 1, x1 - 1.8, r()), hz = lerp(z0 + 1, z1 - 1.8, r());
      voids.box(hx, hx + 0.8, Y1, Y1 + 0.012, hz, hz + 0.8, blk, jit, { faces: 'py' });
      wood.tag = [0, Y1, Y1 + 0.1, seed];
      wood.box(hx - 0.08, hx + 0.88, Y1, Y1 + 0.09, hz - 0.08, hz, blk, jit); wood.box(hx - 0.08, hx + 0.88, Y1, Y1 + 0.09, hz + 0.8, hz + 0.88, blk, jit);
      wood.box(hx - 0.08, hx, Y1, Y1 + 0.09, hz, hz + 0.8, blk, jit, { faces: 'px nx py' }); wood.box(hx + 0.8, hx + 0.88, Y1, Y1 + 0.09, hz, hz + 0.8, blk, jit, { faces: 'px nx py' });
    }
    if (upper) {                                                                                  // an upper room on one corner
      const e = 0;
      const ux = r() < 0.5 ? [x0 + e, x0 + Math.min(4.5, w * 0.45)] : [x1 - Math.min(4.5, w * 0.45), x1 - e];
      const uz = r() < 0.5 ? [z0 + e, z0 + Math.min(4, d * 0.4)] : [z1 - Math.min(4, d * 0.4), z1 - e];
      const uh = 2.5 + r() * 0.5;
      walls.tag = [Math.max(0.6, plaster), Y1, Y1 + uh, seed]; roof.tag = [0, Y1, Y1 + uh, seed];
      walls.prism(ux[0], ux[1], Y1, Y1 + uh, uz[0], uz[1], { c: ch, bev: 0.06, top: roof, blk, jit });
      // its door opens onto the roof terrace
      const F = ux[0] === x0 + e ? { ax: 'x', at: ux[1], out: 1, u0: uz[0], u1: uz[1] } : { ax: 'x', at: ux[0], out: -1, u0: uz[0], u1: uz[1] };
      if (uz[1] - uz[0] > 2.2) opening(F, (uz[0] + uz[1]) / 2, 0.85, Y1, Y1 + 1.8, blk, jit, { seed });
    }
    // roof life: drying cloth, a reed-mat sunshade on poles, jars
    if (!lite) {
      const free = (fx) => { const x = lerp(x0 + 0.8, x1 - 0.8, fx); return x; };
      const onRoofZ = (fz) => (court ? (fz < 0.5 ? lerp(z0 + 0.6, hole[2] - 0.6, fz * 2) : lerp(hole[3] + 0.6, z1 - 0.6, fz * 2 - 1)) : lerp(z0 + 0.8, z1 - 0.8, fz));
      if (r() < 0.3) {
        const x = free(r()), z = onRoofZ(r()), a = 0.7 + r() * 0.9, b = 0.5 + r() * 0.6;
        cloth.tag = [0, Y1, Y1, r()];
        cloth.box(x - a / 2, x + a / 2, Y1 + 0.005, Y1 + 0.025, z - b / 2, z + b / 2, blk, jit, { faces: 'py px nx pz nz' });
      }
      if (r() < 0.14 && !upper) {
        const x = free(0.3 + r() * 0.4), z = onRoofZ(r() < 0.5 ? 0.25 : 0.75), a = 1.2, b = 1.0, ph = 1.9;
        wood.tag = [1, Y1, Y1 + ph, seed];
        for (const [px, pz] of [[-a, -b], [a, -b], [a, b], [-a, b]]) wood.box(x + px - 0.04, x + px + 0.04, Y1, Y1 + ph, z + pz - 0.04, z + pz + 0.04, blk, jit, { faces: 'px nx pz nz' });
        cloth.tag = [0, Y1, Y1, 0.1 + r() * 0.15];
        cloth.box(x - a - 0.15, x + a + 0.15, Y1 + ph, Y1 + ph + 0.04, z - b - 0.15, z + b + 0.15, blk, jit, { faces: 'py px nx pz nz ny' });
      }
      for (let k = 0, m = r() < 0.35 ? 1 + Math.floor(r() * 3) : 0; k < m; k++) pot(pots, free(r()), Y1, onRoofZ(r()), 0.8 + r() * 0.4, r(), r() * 6);
      // brick rubble and broken bricks along the foot of the walls
      for (let k = 0, m = near ? 4 + Math.floor(r() * 6) : Math.floor(r() * 3); k < m; k++) {
        const F = sides[Math.floor(r() * 4)], u = lerp(F.u0, F.u1, r()), dd = 0.25 + r() * 0.9;
        const px = F.ax === 'z' ? u : F.at + F.out * dd, pz = F.ax === 'z' ? F.at + F.out * dd : u;
        walls.tag = [0, Y0 - 1, Y0, r()];
        walls.geo(placed(r() < 0.5 ? bitG : half, px, Y0 + 0.03, pz, r() * 6.3, 1, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5), blk, jit);
      }
    }
    // façades on the drain street: a doorway, and a drain chute down the wall to the street drain
    const side = Math.abs(z0 - ST_HW) < 0.01 ? 1 : Math.abs(z1 + ST_HW) < 0.01 ? -1 : 0;
    if (side && cx > XR.x0 && cx < XR.x1) {
      const zf = side > 0 ? z0 : z1, out = -side;
      const F = { ax: 'z', at: zf, out };
      const dx = x0 + 1.4 + r() * Math.max(0.1, w - 3.8);
      opening(F, dx + 0.5, 1.05, Y0, Y0 + 2.05, blk, jit, { seed });
      const cxh = dx > cx ? x0 + 0.8 + r() * (w * 0.3) : x1 - 0.8 - r() * (w * 0.3);
      walls.tag = [0, Y0, Y0 + 0.9, seed];
      walls.box(cxh - 0.25, cxh + 0.25, Y0, Y0 + 0.9, Math.min(zf, zf + out * 0.32), Math.max(zf, zf + out * 0.32), blk, jit);   // drain outlet at the foot of the wall
      voids.box(cxh - 0.09, cxh + 0.09, Y0 + 0.62, Y0 + 0.78, Math.min(zf, zf + out * 0.33), Math.max(zf, zf + out * 0.33), blk, jit, { faces: side > 0 ? 'nz' : 'pz' });
      fronts.push({ x: cxh, side });
    }
  }

  // lower town
  const lots = [];
  for (const [xa, xb] of TOWN_X) for (const [za, zb] of TOWN_Z) subdivide(xa, xb, za, zb, r, lots);
  for (const lot of lots) {
    const onDrain = Math.abs(lot[2] - ST_HW) < 0.01 || Math.abs(lot[3] + ST_HW) < 0.01;
    if (r() < 0.06 && !onDrain) {                                   // open yards: brick stacks, a well, jars
      const [x0, x1, z0, z1] = lot, blk = [(x0 + x1) / 2, (z0 + z1) / 2, riseDelay((x0 + x1) / 2, (z0 + z1) / 2), 3];
      walls.tag = [0, 0, 1.2, r()];
      for (let k = 0; k < 4; k++) { const x = lerp(x0 + 1.5, x1 - 2.5, r()), z = lerp(z0 + 1.5, z1 - 2.5, r()), hh = 0.6 + r() * 0.7; walls.prism(x, x + 1.1 + r() * 0.6, 0, hh, z, z + 0.9 + r() * 0.5, { c: 0.02, bev: 0.02, blk }); }
      continue;
    }
    house(lot, 0, riseDelay((lot[0] + lot[1]) / 2, (lot[2] + lot[3]) / 2), { near: onDrain || Math.abs((lot[0] + lot[1]) / 2 - 72) < 12 });
  }

  // citadel mound: a battered brick platform with bastions, its top open over the Great Bath's pool
  const CB = { x0: -128, x1: -12, z0: -84, z1: 84 }, BAT = 3;
  {
    const blk = [-70, 0, T_DUST - 0.36, CIT_Y + 1], j = NOJIT;
    const b0 = [CB.x0, CB.z0], b1 = [CB.x1, CB.z1], t0 = [CB.x0 + BAT, CB.z0 + BAT], t1 = [CB.x1 - BAT, CB.z1 - BAT];
    const P = (x, y, z) => V(x, y, z);
    walls.tag = [0.25, 0, CIT_Y, 0.4];
    walls.quad(P(b1[0], 0, b1[1]), P(b1[0], 0, b0[1]), P(t1[0], CIT_Y, t0[1]), P(t1[0], CIT_Y, t1[1]), blk, j);   // east
    walls.quad(P(b0[0], 0, b0[1]), P(b0[0], 0, b1[1]), P(t0[0], CIT_Y, t1[1]), P(t0[0], CIT_Y, t0[1]), blk, j);   // west
    walls.quad(P(b0[0], 0, b1[1]), P(b1[0], 0, b1[1]), P(t1[0], CIT_Y, t1[1]), P(t0[0], CIT_Y, t1[1]), blk, j);   // south
    walls.quad(P(b1[0], 0, b0[1]), P(b0[0], 0, b0[1]), P(t0[0], CIT_Y, t0[1]), P(t1[0], CIT_Y, t0[1]), blk, j);   // north
    roof.tag = [0, CIT_Y, CIT_Y, 0.55];
    const top = (xa, xb, za, zb) => roof.quad(P(xa, CIT_Y, zb), P(xb, CIT_Y, zb), P(xb, CIT_Y, za), P(xa, CIT_Y, za), blk, j);
    top(t0[0], t1[0], t0[1], POOL.z0); top(t0[0], t1[0], POOL.z1, t1[1]); top(t0[0], POOL.x0, POOL.z0, POOL.z1); top(POOL.x1, t1[0], POOL.z0, POOL.z1);
    // a brick footing course round the foot of the mound
    walls.tag = [0, 0, 1.2, 0.3];
    walls.prism(CB.x0 - 0.6, CB.x1 + 0.6, 0, 0.9, CB.z0 - 0.6, CB.z1 + 0.6, { c: 0.3, bev: 0.15, top: walls, hole: [CB.x0 + 0.2, CB.x1 - 0.2, CB.z0 + 0.2, CB.z1 - 0.2], blk, floor: null });
    // the curtain wall along the top edge
    walls.tag = [0.45, CIT_Y, CIT_Y + 1.5, 0.6];
    walls.prism(t0[0], t1[0], CIT_Y, CIT_Y + 1.5, t0[1], t1[1], { c: 0.3, bev: 0.08, top: roof, hole: [t0[0] + 1.1, t1[0] - 1.1, t0[1] + 1.1, t1[1] - 1.1], blk, floor: null });
    // bastions with a parapet
    const bastion = (xa, xb, za, zb, bb) => {
      walls.tag = [0.3, 0, CIT_Y + 2.2, r()];
      walls.prism(xa, xb, 0, CIT_Y + 2.2, za, zb, { c: 0.5, bev: 0, top: roof, blk: bb });
      walls.tag = [0.6, CIT_Y + 1.2, CIT_Y + 3.1, r()];
      walls.prism(xa, xb, CIT_Y + 2.2, CIT_Y + 3.1, za, zb, { c: 0.5, bev: 0.06, top: roof, hole: [xa + 0.6, xb - 0.6, za + 0.6, zb - 0.6], blk: bb, floor: null });
    };
    for (const z of [-64, -30, 30, 64]) bastion(CB.x1 - 6, CB.x1 + 2.5, z - 4, z + 4, [CB.x1, z, T_DUST - 0.2, CIT_Y + 3]);
    for (const x of [-100, -60]) bastion(x - 4, x + 4, CB.z1 - 6, CB.z1 + 2.5, [x, CB.z1, T_DUST - 0.2, CIT_Y + 3]);
  }

  // the Great Bath complex on the citadel
  {
    const d = T_DUST - 0.08, blk = [-40, 0, d, CIT_Y + 7], j = [0, 0, 0];
    const D = { x0: -49, x1: -31, z0: -15.5, z1: 15.5 };                       // open court round the pool
    const C = { x0: D.x0 - 3.2, x1: D.x1 + 3.2, z0: D.z0 - 3.2, z1: D.z1 + 3.2 }; // covered walk (colonnade)
    const O = { x0: -58, x1: -22, z0: -29, z1: 29 };                           // outer ring of rooms
    // brick deck (paving) over court and walk, open over the pool
    walls.tag = [0, DECK_Y - 1, DECK_Y, 0.7];
    const deck = (xa, xb, za, zb) => walls.box(xa, xb, CIT_Y, DECK_Y, za, zb, blk, j, { faces: 'py' });
    deck(C.x0, C.x1, C.z0, POOL.z0); deck(C.x0, C.x1, POOL.z1, C.z1); deck(C.x0, POOL.x0, POOL.z0, POOL.z1); deck(POOL.x1, C.x1, POOL.z0, POOL.z1);
    // the pool: brick walls and floor sealed with bitumen, a low coping round the rim
    bit.tag = [0, DECK_Y - POOL_D, DECK_Y, 0.5];
    bit.pit(POOL.x0, POOL.x1, DECK_Y - POOL_D, DECK_Y, POOL.z0, POOL.z1, blk, j);
    const cp = 0.4, ch = 0.14;
    walls.tag = [0, DECK_Y - 1, DECK_Y + ch, 0.2];
    walls.prism(POOL.x0 - cp, POOL.x1 + cp, DECK_Y, DECK_Y + ch, POOL.z0 - cp, POOL.z1 + cp, { c: 0.08, bev: 0.04, hole: [POOL.x0, POOL.x1, POOL.z0, POOL.z1], blk, jit: j, floor: null });
    // steps down into the pool at both ends (north and south), with a ledge at the foot
    const SW = 2.6, cx = (POOL.x0 + POOL.x1) / 2, n = 9, rise = (POOL_D - 0.25) / n, run = 0.3;
    for (const s of [1, -1]) {
      const zEnd = s > 0 ? POOL.z0 : POOL.z1;
      for (let k = 0; k < n; k++) {
        const za = zEnd + s * run * k, zb = zEnd + s * run * (k + 1);
        bit.box(cx - SW / 2, cx + SW / 2, DECK_Y - POOL_D, DECK_Y - rise * (k + 1), Math.min(za, zb), Math.max(za, zb), blk, j, { faces: s > 0 ? 'px nx pz py' : 'px nx nz py' });
      }
      // timber treads were set into the steps: a dark nosing on each
      wood.tag = [0, 0, 0, 0.3];
      for (let k = 0; k < n; k++) {
        const ze = zEnd + s * run * (k + 1);
        wood.box(cx - SW / 2 + 0.05, cx + SW / 2 - 0.05, DECK_Y - rise * (k + 1) - 0.06, DECK_Y - rise * (k + 1) + 0.012, Math.min(ze, ze - s * 0.07), Math.max(ze, ze - s * 0.07), blk, j, { faces: s > 0 ? 'pz py' : 'nz py' });
      }
      const za = zEnd + s * run * n, zb = za + s * 0.8;
      bit.box(POOL.x0, POOL.x1, DECK_Y - POOL_D, DECK_Y - POOL_D + 0.22, Math.min(za, zb), Math.max(za, zb), blk, j, { faces: s > 0 ? 'pz py' : 'nz py' });
    }
    // colonnade: brick piers round the court carrying the roof of the covered walk
    const PH = 3.4;
    walls.tag = [0.5, DECK_Y, DECK_Y + PH, 0.45];
    const pier = (x, z) => {
      walls.prism(x - 0.55, x + 0.55, DECK_Y, DECK_Y + PH, z - 0.55, z + 0.55, { c: 0.12, bev: 0, blk, jit: j });
      walls.prism(x - 0.68, x + 0.68, DECK_Y, DECK_Y + 0.28, z - 0.68, z + 0.68, { c: 0.1, bev: 0.06, top: walls, blk, jit: j });   // plinth
      wood.tag = [0, 0, 0, 0.6];
      wood.box(x - 0.7, x + 0.7, DECK_Y + PH - 0.22, DECK_Y + PH, z - 0.7, z + 0.7, blk, j, { faces: 'px nx pz nz ny' });          // timber bolster
    };
    for (let k = 0; k <= 5; k++) { const x = lerp(D.x0, D.x1, k / 5); pier(x, D.z0); pier(x, D.z1); }
    for (let k = 1; k < 9; k++) { const z = lerp(D.z0, D.z1, k / 9); pier(D.x0, z); pier(D.x1, z); }
    const RY0 = DECK_Y + PH, RY1 = RY0 + 0.45;
    walls.tag = [0.8, RY0, RY1, 0.5]; roof.tag = [0, RY0, RY1, 0.35];
    walls.box(C.x0, D.x1 + 0.6, RY0, RY1, C.z0, D.z0 - 0.6, blk, j, { top: roof, faces: 'px nx pz nz py ny' });
    walls.box(C.x0, D.x1 + 0.6, RY0, RY1, D.z1 + 0.6, C.z1, blk, j, { top: roof, faces: 'px nx pz nz py ny' });
    walls.box(C.x0, D.x0 - 0.6, RY0, RY1, D.z0 - 0.6, D.z1 + 0.6, blk, j, { top: roof, faces: 'px nx py ny' });
    // timber beams under the walk roof, facing the court, and a mud coping on top
    wood.tag = [0, 0, 0, 0.45];
    wood.box(C.x0, D.x1 + 0.75, RY0 - 0.02, RY0 + 0.3, D.z0 - 0.75, D.z0 - 0.45, blk, j, { faces: 'pz nz ny py' });
    wood.box(C.x0, D.x1 + 0.75, RY0 - 0.02, RY0 + 0.3, D.z1 + 0.45, D.z1 + 0.75, blk, j, { faces: 'pz nz ny py' });
    wood.box(D.x0 - 0.75, D.x0 - 0.45, RY0 - 0.02, RY0 + 0.3, D.z0 - 0.45, D.z1 + 0.45, blk, j, { faces: 'px nx ny py' });
    walls.tag = [0.9, RY1, RY1 + 0.3, 0.5];
    walls.box(C.x0, D.x1 + 0.6, RY1, RY1 + 0.28, D.z0 - 0.9, D.z0 - 0.6, blk, j, { top: roof });
    walls.box(C.x0, D.x1 + 0.6, RY1, RY1 + 0.28, D.z1 + 0.6, D.z1 + 0.9, blk, j, { top: roof });
    walls.box(D.x0 - 0.9, D.x0 - 0.6, RY1, RY1 + 0.28, D.z0 - 0.6, D.z1 + 0.6, blk, j, { top: roof });
    // outer rooms (cells) all round, a gap for the doorway in the south and east
    const RH = 4.6;
    walls.tag = [0.55, CIT_Y, CIT_Y + RH, 0.3]; roof.tag = [0, CIT_Y, CIT_Y + RH, 0.5];
    const room = (xa, xb, za, zb, c) => {
      walls.prism(xa, xb, CIT_Y, CIT_Y + RH, za, zb, { c, bev: 0, top: roof, blk, jit: j });
      walls.prism(xa, xb, CIT_Y + RH, CIT_Y + RH + 0.55, za, zb, { c, bev: 0.05, top: roof, hole: [xa + 0.3, xb - 0.3, za + 0.3, zb - 0.3], blk, jit: j, floor: null });
    };
    room(O.x0, O.x1, O.z0, C.z0, 0.2);
    room(O.x0, -42, C.z1, O.z1, [0.2, 0, 0, 0.2]);
    room(-38, O.x1, C.z1, O.z1, [0, 0.2, 0.2, 0]);
    room(O.x0, C.x0, C.z0, C.z1, 0);
    // doorways from the walk into the cells
    walls.tag = [0.7, CIT_Y, CIT_Y + RH, 0.3];
    for (let k = 0; k < 4; k++) {
      opening({ ax: 'z', at: C.z0, out: 1 }, lerp(C.x0 + 3, C.x1 - 3, k / 3), 1.1, DECK_Y, DECK_Y + 2.2, blk, j, { seed: 0.4 });
      if (k !== 2) opening({ ax: 'z', at: C.z1, out: -1 }, lerp(C.x0 + 3, C.x1 - 3, k / 3), 1.1, DECK_Y, DECK_Y + 2.2, blk, j, { seed: 0.4 });
    }
    walls.tag = [0.4, CIT_Y, DECK_Y + 0.9, 0.3];
    walls.prism(C.x1, O.x1, CIT_Y, DECK_Y + 0.9, C.z0, C.z1, { c: 0, bev: 0.06, top: walls, blk, jit: j });   // a low east wall
    // the brick drain that empties the bath, its covered outlet in the west
    walls.tag = [0, CIT_Y, DECK_Y, 0.8];
    walls.box(POOL.x0 - 4.6, POOL.x0 - 0.4, DECK_Y, DECK_Y + 0.22, 2.6, 3.4, blk, j);
    // big jars by the steps
    for (const [x, z] of [[POOL.x1 + 1.6, POOL.z0 - 1.4], [POOL.x1 + 2.3, POOL.z0 - 1.0], [POOL.x0 - 1.7, POOL.z1 + 1.5]]) pot(pots, x, DECK_Y, z, 1.1, 0.8, x, true);
  }
  // the rest of the citadel: larger halls and houses round the bath
  {
    const cl = [];
    subdivide(-121, -62, -77, 77, r, cl);
    subdivide(-58, -19, -77, -33, r, cl);
    subdivide(-58, -19, 33, 77, r, cl);
    for (const lot of cl) house(lot, CIT_Y, T_DUST - 0.15 + r() * 0.2, { tall: 1.15 });
  }

  // building rubble, spoil heaps and stacks of new bricks round the edge of the town
  if (!lite) {
    const mound = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
    for (let k = 0; k < 70; k++) {
      const edge = Math.floor(r() * 4);
      const x = edge === 0 ? 4 + r() * 3 : edge === 1 ? 197 + r() * 6 : 10 + r() * 185;
      const z = edge < 2 ? -118 + r() * 232 : edge === 2 ? -124 - r() * 5 : 118 + r() * 6;
      const blk = [x, z, riseDelay(x, z) + 0.1, 2.5];
      if (r() < 0.5) {
        const s = 1 + r() * 2.2;
        roof.tag = [0, 0, 0, r()];
        roof.geo(mound.clone().scale(s * (1 + r()), s * 0.5, s * (0.8 + r() * 0.6)).translate(x, -s * 0.12, z), blk);
      } else {
        walls.tag = [0, 0, 1, r()];
        for (let m = 0, M = 1 + Math.floor(r() * 3); m < M; m++) { const xx = x + (r() - 0.5) * 4, zz = z + (r() - 0.5) * 4; walls.prism(xx, xx + 0.9 + r() * 0.4, 0, 0.5 + r() * 0.6, zz, zz + 0.7 + r() * 0.4, { c: 0.01, bev: 0.015, blk }); }
        for (let m = 0; m < 10; m++) walls.geo(placed(r() < 0.6 ? bitG : half, x + (r() - 0.5) * 5, 0.03, z + (r() - 0.5) * 5, r() * 6.3, 1, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6), blk);
      }
    }
  }

  const cityMeshes = [];
  for (const [acc, mat] of [[walls, brickMat], [roof, roofMat], [bit, bitMat], [voids, voidMat], [leaves, leafMat], [wood, woodMat], [pots, potMat], [cloth, clothMat]]) {
    if (!acc.p.length) continue;
    const m = new THREE.Mesh(acc.geometry(), mat);
    m.castShadow = acc !== voids; m.receiveShadow = true; m.customDepthMaterial = depthMat; m.frustumCulled = false;
    city.add(m); cityMeshes.push(m);
  }

  // ------------------------------------------------------------------------------------- the plain
  const XU = { uXP: { value: new THREE.Vector2(60, 0) }, uXR: { value: 0 }, uXRect: { value: new THREE.Vector4(XR.x0, XR.x1, -ST_HW, ST_HW) }, uGold: { value: new THREE.Color(GOLD) } };
  const groundMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97 });
  groundMat.userData.noAntiTile = true;
  let gMasks = null;
  groundMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, XU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; uniform vec2 uXP; uniform float uXR; uniform vec4 uXRect; uniform vec3 uGold;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float xIn = step(uXRect.x, vGW.x) * step(vGW.x, uXRect.y) * step(uXRect.z, vGW.z) * step(vGW.z, uXRect.w);
        float xD = length((vGW.xz - uXP) * vec2(0.35, 1.0)) - uXR + sin(vGW.x * 1.7) * 0.25;
        if (xIn > 0.5 && xD < 0.0) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float far = smoothstep(150.0, 600.0, length(vGW.xz - vec2(40.0, 0.0)));
          diffuseColor.rgb *= mix(0.92, 1.06, far); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uGold * 4.0 * xIn * step(0.01, uXR) * (1.0 - smoothstep(0.0, 0.35, xD));`);
    groundPatch(sh, gMasks);
  };
  groundMat.customProgramCacheKey = () => 'indus-ground';
  // river course (the Indus runs to the east of the city)
  const river = new THREE.CatmullRomCurve3([V(700, 0, 1200), V(610, 0, 600), V(510, 0, 250), V(470, 0, -60), V(500, 0, -380), V(640, 0, -760), V(860, 0, -1500)], false, 'centripetal');
  const riverPts = river.getSpacedPoints(80);
  const riverDist = (x, z) => { let m = 1e9; for (const p of riverPts) m = Math.min(m, Math.hypot(p.x - x, p.z - z)); return m; };
  const RIVER_W = 150;
  gMasks = groundMasks({ riverPts, riverW: RIVER_W, lots, citadel: CB, streets: { ns: NS, ew: EW }, town: { x0: TOWN_X[0][0], x1: TOWN_X[2][1], z0: TOWN_Z[0][0], z1: TOWN_Z[3][1] } });
  {
    const g = new THREE.PlaneGeometry(5000, 5000, lite ? 80 : 140, lite ? 80 : 140);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), dc = Math.hypot(x - 30, z), dr = riverDist(x, z);
      let y = smoothstep(380, 1100, dc) * (Math.sin(x * 0.006) * Math.cos(z * 0.0047 + 1) * 9 + Math.sin(x * 0.019 + z * 0.013) * 3);
      y *= smoothstep(RIVER_W * 0.5 + 30, RIVER_W * 0.5 + 220, dr);
      if (dr < RIVER_W * 0.5 + 10) y -= 1.5 * (1 - dr / (RIVER_W * 0.5 + 10));
      p.setY(i, y);
    }
    g.computeVertexNormals();
    const ground = new THREE.Mesh(g, groundMat);
    ground.receiveShadow = true;
    city.add(ground);
  }
  const riverMat = waterMaterial({ scale: 0.02, deep: [0.06, 0.1, 0.11], speed: 0.3, amp: 0.35 });
  {
    const pos = [], idx = [], N = 160;
    for (let i = 0; i <= N; i++) {
      const u = i / N, c = river.getPointAt(u), tg = river.getTangentAt(u), nx = -tg.z, nz = tg.x, w = RIVER_W * (0.45 + 0.1 * Math.sin(u * 17));
      pos.push(c.x + nx * w, 0.25, c.z + nz * w, c.x - nx * w, 0.25, c.z - nz * w);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, riverMat); m.frustumCulled = false;
    m.material.side = THREE.DoubleSide;
    city.add(m);
  }
  // trees and scrub on the plain, thicker along the river
  {
    const parts = [], rt = rng(77);
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.2, 5).toNonIndexed(); trunk.translate(0, 1.6, 0);
    const crown = new THREE.IcosahedronGeometry(2.4, lite ? 0 : 1), crown0 = new THREE.IcosahedronGeometry(2.4, 0);
    let n = 0;
    for (let k = 0; k < 2600 && n < (lite ? 260 : 520); k++) {
      const x = -700 + rt() * 1500, z = -900 + rt() * 1700;
      const inCity = x > -150 && x < 215 && z > -140 && z < 135;
      const dr = riverDist(x, z);
      if (inCity || dr < RIVER_W * 0.55 || Math.hypot(x - 300, z - 262) < 175) continue;
      const pKeep = dr < RIVER_W * 0.5 + 120 ? 0.9 : 0.16;
      if (rt() > pKeep) continue;
      const s = 0.7 + rt() * 0.9, y0 = 0;
      const t1 = trunk.clone().scale(s, s, s).translate(x, y0, z);
      const c1 = crown.clone().scale(s * (1.1 + rt() * 0.5), s * (0.65 + rt() * 0.3), s * (1.1 + rt() * 0.5)).translate(x, y0 + 3.6 * s, z);
      const c2 = crown0.clone().scale(s * 0.8, s * 0.55, s * 0.8).translate(x + 1.1 * s, y0 + 3.1 * s, z + 0.6 * s);
      parts.push(t1, c1, c2); n++;
    }
    // low scrub scattered over the plain (denser near the camera's opening run: parallax, scale)
    const bush = new THREE.IcosahedronGeometry(0.6, 0);
    for (let k = 0; k < (lite ? 500 : 1800); k++) {
      const near = k % 2 === 0;
      const x = near ? 120 + rt() * 230 : -500 + rt() * 1100, z = near ? 60 + rt() * 240 : -700 + rt() * 1300;
      if ((x > -140 && x < 205 && z > -130 && z < 125) || riverDist(x, z) < RIVER_W * 0.55) continue;
      const sx = 0.6 + rt() * 1.4;
      parts.push(bush.clone().scale(sx, sx * (0.35 + rt() * 0.3), sx * (0.8 + rt() * 0.5)).translate(x, 0.1, z));
    }
    for (const q of parts) { q.deleteAttribute('uv'); }
    const trees = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ color: '#56602f', roughness: 0.9, flatShading: true }));
    trees.castShadow = trees.receiveShadow = true;
    city.add(trees);
  }

  // ------------------------------------------------------------------------------------- under the street
  const drains = new THREE.Group(); city.add(drains);
  const sectionMat = new THREE.MeshStandardMaterial({ map: sectionTexture(), color: '#d6b08a', roughness: 1, emissive: new THREE.Color('#5a3a22'), emissiveIntensity: 0.6 });
  sectionMat.map.repeat.set(0.25, 0.8);
  const dBrick = new Acc(), dLiner = new Acc(), dCover = new Acc(), dLift = new Acc(), dWaterMain = new Acc(), dWaterHouse = new Acc();
  for (const a of [dBrick, dCover, dLift]) a.tag = [0, -6, 5, 0.5];
  const TD = 1.35;                                            // trench depth
  dLiner.pit(XR.x0, XR.x1, -TD, 0, -ST_HW, ST_HW);
  const CW = 0.24, WT = 0.28, DY0 = -0.95, DY1 = -0.2;       // channel half-width, wall thickness, floor and top
  const sumps = [22, 40, 56, 90, 108, 122];
  const LIFT = [34, 66];                                     // covers lifted off here (exploded view)
  {
    // main drain: brick floor and walls; covers of brick laid across; sump pits at intervals
    const segs = []; let xa = XR.x0;
    for (const s of sumps) { segs.push([xa, s - 0.75]); xa = s + 0.75; }
    segs.push([xa, XR.x1]);
    for (const [a, b] of segs) {
      dBrick.box(a, b, DY0, DY1, DRAIN_Z - CW - WT, DRAIN_Z - CW, STATIC, NOJIT, { faces: 'pz nz py' });
      dBrick.box(a, b, DY0, DY1, DRAIN_Z + CW, DRAIN_Z + CW + WT, STATIC, NOJIT, { faces: 'pz nz py' });
      dBrick.box(a, b, DY0 - 0.1, DY0, DRAIN_Z - CW, DRAIN_Z + CW, STATIC, NOJIT, { faces: 'py' });
      for (let x = a + 0.02; x < b - 0.28; x += 0.3) {
        const acc = x > LIFT[0] && x < LIFT[1] ? dLift : dCover;
        acc.box(x, x + 0.28, DY1, DY1 + 0.07, DRAIN_Z - CW - WT * 0.8, DRAIN_Z + CW + WT * 0.8);
      }
      dWaterMain.box(a, b, DY0 + 0.2, DY0 + 0.21, DRAIN_Z - CW, DRAIN_Z + CW, STATIC, NOJIT, { faces: 'py' });
    }
    for (const s of sumps) {
      const h = 0.75, wt = 0.3;
      dBrick.pit(s - h, s + h, -TD + 0.05, DY1 + 0.07, DRAIN_Z - h, DRAIN_Z + h);
      dBrick.box(s - h - wt, s + h + wt, DY1 + 0.07 - 0.01, DY1 + 0.08, DRAIN_Z - h - wt, DRAIN_Z + h + wt, STATIC, NOJIT, { faces: 'py' });
      dWaterMain.box(s - h, s + h, DY0 + 0.05, DY0 + 0.06, DRAIN_Z - h, DRAIN_Z + h, STATIC, NOJIT, { faces: 'py' });
    }
    // house drains: from each chute across under the street into the main drain
    for (const f of fronts) {
      const z0 = f.side > 0 ? DRAIN_Z + CW + WT : -ST_HW, z1 = f.side > 0 ? ST_HW : DRAIN_Z - CW - WT;
      const w = 0.15, wt = 0.1, y0 = DY1 - 0.32, y1 = DY1 + 0.02;
      dBrick.box(f.x - w - wt, f.x - w, y0, y1, z0, z1, STATIC, NOJIT, { faces: 'px nx py' });
      dBrick.box(f.x + w, f.x + w + wt, y0, y1, z0, z1, STATIC, NOJIT, { faces: 'px nx py' });
      (f.x > LIFT[0] && f.x < LIFT[1] ? dLift : dCover).box(f.x - w - wt, f.x + w + wt, y1, y1 + 0.05, z0, z1, STATIC, NOJIT, { faces: 'px nx py' });
      dWaterHouse.box(f.x - w, f.x + w, y0 + 0.08, y0 + 0.09, z0, z1, STATIC, NOJIT, { faces: 'py' });
    }
  }
  // drain bricks: the same procedural baked brick (no tile), lit from within for the x-ray
  const coverMat = cityMaterial('brick', null, { color: '#ffe6d0', roughness: 1, emissive: new THREE.Color('#6a3a20'), emissiveIntensity: 0.4 });
  const dBrickMat = cityMaterial('brick', null, { color: '#ffe6d0', roughness: 1, emissive: new THREE.Color('#6a3a20'), emissiveIntensity: 0.5 });
  const wMain = waterMaterial({ scale: 0.9, deep: [0.04, 0.1, 0.11], body: [0.05, 0.16, 0.17], speed: -2.2, caustic: 1 });
  const wHouse = waterMaterial({ scale: 1.6, deep: [0.04, 0.1, 0.11], body: [0.05, 0.16, 0.17], speed: 1.2, caustic: 1 });
  for (const m of [wMain, wHouse]) m.uniforms.uFogD.value = 0;
  const liner = new THREE.Mesh(dLiner.geometry(), sectionMat);
  const dBr = new THREE.Mesh(dBrick.geometry(), dBrickMat);
  const covers = new THREE.Mesh(dCover.geometry(), coverMat);
  const lifted = new THREE.Mesh(dLift.geometry(), coverMat);
  const waterA = new THREE.Mesh(dWaterMain.geometry(), wMain), waterB = new THREE.Mesh(dWaterHouse.geometry(), wHouse);
  for (const m of [liner, dBr, covers, lifted]) { m.receiveShadow = true; m.castShadow = m !== liner; }
  drains.add(liner, dBr, covers, lifted, waterA, waterB);
  // x-ray drawing: gold outlines of the drain network and a ghost of the street surface
  const xrSegs = [];
  for (const zz of [DRAIN_Z - CW - WT, DRAIN_Z + CW + WT]) for (let x = XR.x0; x < XR.x1; x += 4) xrSegs.push([V(x, DY1 + 0.1, zz), V(Math.min(XR.x1, x + 4), DY1 + 0.1, zz)]);
  for (const f of fronts) xrSegs.push([V(f.x, DY1 + 0.1, f.side > 0 ? ST_HW : -ST_HW), V(f.x, DY1 + 0.1, f.side > 0 ? DRAIN_Z + CW + WT : DRAIN_Z - CW - WT)]);
  for (const s of sumps) { const h = 1.05, y = DY1 + 0.12; xrSegs.push([V(s - h, y, DRAIN_Z - h), V(s + h, y, DRAIN_Z - h)], [V(s + h, y, DRAIN_Z - h), V(s + h, y, DRAIN_Z + h)], [V(s + h, y, DRAIN_Z + h), V(s - h, y, DRAIN_Z + h)], [V(s - h, y, DRAIN_Z + h), V(s - h, y, DRAIN_Z - h)]); }
  const XP0 = new THREE.Vector2(84, 0);
  const xrLines = segmentsLine(xrSegs, { color: GOLD, intensity: 2.2, orderFn: (a) => sat(Math.abs(a.x - XP0.x) / 70) * 0.7, stagger: 0.7 });
  const ghostSegs = [];
  for (let x = XR.x0; x <= XR.x1; x += 1.5) ghostSegs.push([V(x, 0.03, -ST_HW), V(x, 0.03, ST_HW)]);
  for (let z = -ST_HW; z <= ST_HW + 0.01; z += 1.5) for (let x = XR.x0; x < XR.x1; x += 6) ghostSegs.push([V(x, 0.03, z), V(x + 6, 0.03, z)]);
  const ghost = segmentsLine(ghostSegs, { color: GOLD, intensity: 0.5, orderFn: (a) => sat(Math.abs(a.x - XP0.x) / 70) * 0.7, stagger: 0.7 });
  drains.add(xrLines, ghost);

  // ------------------------------------------------------------------------------------- survey lines
  const survey = new THREE.Group(); city.add(survey);
  const sSegs = [];
  const TZ0 = -118, TZ1 = 114, TX0 = 10, TX1 = 194;
  for (const s of NS) for (const e of [-1, 1]) sSegs.push([V(s.x + e * s.w / 2, 0.08, TZ0), V(s.x + e * s.w / 2, 0.08, TZ1)]);
  for (const s of EW) for (const e of [-1, 1]) sSegs.push([V(TX0, 0.08, s.z + e * s.w / 2), V(TX1, 0.08, s.z + e * s.w / 2)]);
  for (const [a, b] of [[TX0, TZ0], [TX1, TZ0], [TX1, TZ1], [TX0, TZ1]].map((p, i, A) => [p, A[(i + 1) % 4]])) sSegs.push([V(a[0], 0.08, a[1]), V(b[0], 0.08, b[1])]);
  const surveyEdges = segmentsLine(sSegs, { color: GOLD, intensity: 1.6, orderFn: (a, b, i) => i * 0.02, stagger: 0.7 });
  const tubes = [
    ...NS.map((s) => progressTube(new THREE.LineCurve3(V(s.x, 0.1, TZ0 - 25), V(s.x, 0.1, TZ1 + 25)), { radius: 0.32, segments: 8, radial: 4, color: GOLD, intensity: 3 })),
    ...EW.map((s) => progressTube(new THREE.LineCurve3(V(TX1 + 25, 0.1, s.z), V(-20, 0.1, s.z)), { radius: 0.32, segments: 8, radial: 4, color: GOLD, intensity: 3 })),
  ];
  const citOutline = progressLine([V(CB.x0, CIT_Y + 0.15, CB.z0), V(CB.x1, CIT_Y + 0.15, CB.z0), V(CB.x1, CIT_Y + 0.15, CB.z1), V(CB.x0, CIT_Y + 0.15, CB.z1)].map((v) => v.add(V(v.x < -60 ? BAT : -BAT, 0, v.z < 0 ? BAT : -BAT))), { closed: true, color: GOLD, intensity: 1.4 });
  // a compass on the ground: north is −z
  const compass = new THREE.Group();
  compass.position.set(-2, 0.12, -102);
  const ring = progressLine(circlePoints(9, 64, { plane: 'xz' }), { color: GOLD, intensity: 1.8 });
  const cross = segmentsLine([[V(0, 0, 12), V(0, 0, -14)], [V(-12, 0, 0), V(12, 0, 0)], [V(-2.5, 0, -10), V(0, 0, -14)], [V(2.5, 0, -10), V(0, 0, -14)]], { color: GOLD, intensity: 2, orderFn: (a, b, i) => i * 0.1, stagger: 0.5 });
  const nLabel = new TextPlane('N', { font: FONTS.display, weight: 700, height: 7, color: GOLD, intensity: 2.2 });
  nLabel.rotation.x = -Math.PI / 2; nLabel.position.set(0, 0.05, -20);
  compass.add(ring, cross, nLabel);
  survey.add(surveyEdges, ...tubes, citOutline, compass);

  // ------------------------------------------------------------------------------------- the Great Bath water
  const poolMat = waterMaterial({ scale: 0.35, deep: [0.03, 0.08, 0.09], body: [0.06, 0.2, 0.2], speed: 0.25, caustic: 1.2 });
  poolMat.uniforms.uFogD.value = FOG_D * 0.5;
  const poolWater = new THREE.Mesh(new THREE.PlaneGeometry(POOL.x1 - POOL.x0 - 0.02, POOL.z1 - POOL.z0 - 0.02).rotateX(-Math.PI / 2), poolMat);
  poolWater.position.set((POOL.x0 + POOL.x1) / 2, DECK_Y - POOL_D, (POOL.z0 + POOL.z1) / 2);
  city.add(poolWater);
  // inflow: a thin sheet of water spilling in at the north-east corner
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.9, 1).multiplyScalar(1.4), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  spill.position.set(POOL.x1 - 0.8, DECK_Y - 0.5, POOL.z0 + 0.02);
  city.add(spill);

  // ------------------------------------------------------------------------------------- dust
  const dustClouds = [];
  for (const [i, [xa, xb, za, zb, y, t0]] of [[-130, -10, -86, 86, 0.5, T_DUST - 0.05], [-60, -20, -30, 30, CIT_Y + 0.5, T_DUST + 0.15], [10, 100, -120, 115, 0.5, T_DUST + 0.2], [100, 195, -120, 115, 0.5, T_DUST + 0.45]].entries()) {
    const n = lite ? 500 : 1000, rr = rng(40 + i), A = new Float32Array(n * 3), B = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      let x = xa + rr() * (xb - xa), z = za + rr() * (zb - za);
      if (Math.hypot(x - 190, z - 160) < 110) { x -= 80; z -= 90; }   // none in the lens at the start
      const yy = y + rr() * 2;
      A.set([x, yy, z], k * 3);
      B.set([x + (rr() - 0.3) * 14, yy + 3 + rr() * 9, z + (rr() - 0.5) * 12], k * 3);
    }
    const p = new MorphParticles({ count: n, positions: A, targets: B, size: 7, color: '#d9c2a2', opacity: 0.12, intensity: 0.8, additive: false, seed: 9 + i, stagger: 0.5 });
    p.u.noise = 0.6; p.u.noiseFreq = 0.08;
    p.userData.t0 = t0;
    city.add(p); dustClouds.push(p);
  }
  const motes = new Dust({ count: lite ? 1500 : 3000, size: [120, 30, 110], center: [272, 14, 236], particleSize: 0.08, color: '#ffd9a8', opacity: 0.5, intensity: 1.4 });
  city.add(motes);

  // ------------------------------------------------------------------------------------- the macro set
  // weights in a row on a baked-brick sill: ratios 1, 2, 4 … 64, then decimal multiples 160, 320.
  // Chert is ~2.6 g/cm³ and the 16-unit weight ≈ 13.7 g, so the unit cube is ≈ 0.69 cm and side ∝ ∛ratio.
  // the same procedural baked brick as the city, resolving sand grains, pits and lime nodules at this scale
  const sillMat = cityMaterial('brick', null, { color: '#f4e4d2' });
  const sill = new THREE.Mesh(new THREE.PlaneGeometry(8, 3).rotateX(-Math.PI / 2), sillMat);
  sill.position.set(0.05, 0, 1.08); sill.receiveShadow = true;
  const backMat = cityMaterial('brick', null, { color: '#e2cdb6' });
  backMat.defaultAttributeValues.aTag = [0, -10, 10, 0.3];
  const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), backMat);
  back.position.set(0.05, 1.5, -0.42); back.receiveShadow = true;
  shop.add(sill, back);
  const RATIOS = [1, 2, 4, 8, 16, 32, 64, 160, 320];
  const S1 = 0.0069, GAP = 0.011;
  const tints = [[178, 170, 154], [160, 156, 148], [186, 172, 146], [150, 142, 130]];
  const chertMats = tints.map((tn, i) => new THREE.MeshStandardMaterial({ map: chertTexture({ seed: 21 + i, tint: tn }), roughness: 0.34 }));
  const weights = [];
  let wx = -0.135;
  RATIOS.forEach((ra, i) => {
    const s = S1 * Math.cbrt(ra);
    const g = new RoundedBoxGeometry(s, s, s, 2, s * 0.09);
    const m = new THREE.Mesh(g, chertMats[i % chertMats.length]);
    const cx = wx + s / 2, cz = 0.003 * Math.sin(i * 1.7);
    m.position.set(cx, s / 2, cz);
    m.rotation.y = (i % 2 ? 1 : -1) * (0.06 + 0.05 * Math.sin(i * 2.3));
    m.castShadow = m.receiveShadow = true;
    shop.add(m);
    weights.push({ m, s, x: cx, z: cz, ratio: ra });
    wx += s + GAP;
  });
  // numerals on the sill in front of each weight
  const numerals = weights.map((w) => {
    const tp = new TextPlane(String(w.ratio), { font: FONTS.mono, weight: 500, height: 0.0052, color: w.ratio === 16 ? '#ffd27a' : '#ffe9c8', intensity: w.ratio === 16 ? 2.2 : 1.5 });
    tp.rotation.x = -Math.PI / 2 + 0.35;
    tp.position.set(w.x, 0.0012, w.z + w.s / 2 + 0.008);
    shop.add(tp);
    return tp;
  });
  const tick = segmentsLine([[V(weights[6].x + weights[6].s / 2 + GAP * 0.5, 0.0005, 0.02), V(weights[6].x + weights[6].s / 2 + GAP * 0.5, 0.0005, 0.036)]], { color: GOLD, intensity: 2, stagger: 0 });
  shop.add(tick);
  // the seal (steatite, c. 3 cm square, fired white) and the clay impression it leaves
  const sealT = sealTextures({ size: 512, base: '#cbbfac' });
  const sealMat = new THREE.MeshStandardMaterial({ color: '#cfc4b2', roughness: 0.5 });
  const sealFaceMat = new THREE.MeshStandardMaterial({ map: sealT.map, bumpMap: sealT.bump, bumpScale: 6, roughness: 0.45 });
  const seal = new THREE.Group();
  const sealBody = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.009, 0.03, 2, 0.0012), sealMat);
  const sealFace = new THREE.Mesh(new THREE.PlaneGeometry(0.0285, 0.0285).rotateX(-Math.PI / 2), sealFaceMat);
  sealFace.position.y = 0.00451;
  sealBody.castShadow = sealBody.receiveShadow = true; sealFace.receiveShadow = true;
  seal.add(sealBody, sealFace);
  seal.position.set(0.07, 0.0045, 0.062); seal.rotation.y = -0.22;
  const impT = sealTextures({ size: 512, mirror: true, raised: true, base: '#b88b62' });
  const imp = new THREE.Group();
  const impBody = new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.006, 0.034, 2, 0.002), new THREE.MeshStandardMaterial({ color: '#a97c55', roughness: 0.9 }));
  const impFace = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: impT.map, bumpMap: impT.bump, bumpScale: 6, roughness: 0.85 }));
  impFace.position.y = 0.00301;
  impBody.castShadow = impBody.receiveShadow = true; impFace.receiveShadow = true;
  imp.add(impBody, impFace);
  imp.position.set(0.112, 0.003, 0.07); imp.rotation.y = 0.18;
  shop.add(seal, imp);
  const shopMotes = new Dust({ count: 900, size: [0.5, 0.25, 0.4], center: [0.05, 0.1, 0.0], particleSize: 0.0012, color: '#ffe2b8', opacity: 0.6, intensity: 2 });
  shop.add(shopMotes);

  // ------------------------------------------------------------------------------------- sky, light
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial());
  sky.renderOrder = -100; sky.frustumCulled = false;
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffd0a0', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight('#8ea4c8', '#7a5638', 0.55);
  scene.add(fill);
  const bounce = new THREE.PointLight('#ffb070', 0, 1.2, 2);   // warm bounce off the bricks in the macro
  bounce.position.set(-0.05, 0.08, 0.2);
  scene.add(bounce);
  const work = new THREE.PointLight('#ffd2a0', 0, 30, 1.5);   // lights the cutaway: the x-ray "lamp"
  scene.add(work);
  function setSun(cx, cy, cz, half, dist, nb) {
    sun.target.position.set(cx, cy, cz);
    sun.position.copy(SUN_DIR).multiplyScalar(dist).add(sun.target.position);
    const c = sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = dist * 0.02; c.far = dist * 2.5;
    c.updateProjectionMatrix();
    sun.shadow.normalBias = nb;
  }

  // ------------------------------------------------------------------------------------- callouts
  // world-anchored, facing the camera, scaled with distance so they read at a constant size on screen
  const labels = [];
  function label(parent, text, sub, at, a, b, { dx = 0.55, dy = 0.32, color = '#ffe6bf', k = 1 } = {}) {
    const c = new Callout(text, { dx, dy, size: 0.07, color, sub, intensity: 1.55 });
    c.position.copy(at); c.userData.win = [a, b]; c.userData.k = k;
    c.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.depthWrite = o.isMesh && !!o.material.uniforms?.uMap; o.renderOrder = 20; } });   // labels read over the set (text keeps its depth for the lens)
    parent.add(c); labels.push(c);
    return c;
  }
  label(city, 'CITADEL', 'RAISED MOUND', V(-70, CIT_Y + 6, -50), T_DUST + 0.95, T_GRID + 0.9, { dx: -0.5, dy: 0.3 });
  label(city, 'LOWER TOWN', 'HOUSES OF BAKED BRICK', V(150, 8, -40), T_DUST + 1.05, T_GRID + 0.9);
  label(city, 'STREETS ON A GRID', 'NORTH–SOUTH · EAST–WEST', V(72, 1, -40), T_GRID + 0.35, T_DRAIN - 0.05, { dx: 0.5, dy: 0.28 });
  label(drains, 'COVERED BRICK DRAIN', 'UNDER THE STREET', V(56, DY1 + 0.1, DRAIN_Z + CW + WT), T_DRAIN + 0.2, T_BATH - 0.05, { dx: 0.42, dy: 0.4 });
  const fHouse = fronts.slice().sort((p, q) => Math.abs(p.x - 47) - Math.abs(q.x - 47))[0];
  label(drains, 'HOUSE DRAIN', 'FROM A BATHING ROOM', V(fHouse.x, DY1 + 0.05, fHouse.side > 0 ? 3.4 : -3.4), T_DRAIN + 0.32, T_BATH - 0.05, { dx: -0.45, dy: 0.3 });
  label(drains, 'BAKED BRICK · 1 : 2 : 4', 'THICK : WIDE : LONG', V(39, 1.1, ST_HW), T_DRAIN + 0.42, T_BATH, { dx: 0.4, dy: 0.25 });
  label(city, 'GREAT BATH', 'c. 12 × 7 m · 2.4 m DEEP', V(POOL.x1 + 0.4, DECK_Y + 0.2, POOL.z0 - 0.4), T_BATH + 0.15, T_WT + 0.05, { dx: 0.45, dy: 0.42 });
  label(city, 'BITUMEN SEAL', 'WATERTIGHT BRICK LINING', V(POOL.x0 + 0.05, DECK_Y - 0.9, 2.5), T_BATH + 0.35, T_WT + 0.05, { dx: -0.45, dy: 0.12 });
  label(shop, 'CHERT CUBE WEIGHTS', 'RATIOS 1 · 2 · 4 · 8 · 16 · 32 · 64', V(weights[1].x, weights[1].s + 0.001, weights[1].z), T_WT + 0.12, dur + 1, { dx: 0.22, dy: 0.52 });
  label(shop, 'THEN DECIMAL', '160 · 320 …', V(weights[7].x, weights[7].s, weights[7].z), T_WT + 0.5, dur + 1, { dx: 0.3, dy: 0.17 });
  label(shop, 'UNIT 16 ≈ 13.7 g', null, V(weights[4].x, weights[4].s, weights[4].z), T_WT + 0.3, dur + 1, { dx: 0.2, dy: 0.26 });
  label(shop, 'STEATITE SEAL', 'SCRIPT STILL UNDECIPHERED', V(seal.position.x - 0.012, 0.009, seal.position.z), T_WT + 0.7, dur + 1, { dx: -0.42, dy: -0.08 });
  // the pool's dimensions, drawn flat on the deck
  const dimG = new THREE.Group();
  const dLong = new Dimension(V(0, 0, 0), V(12, 0, 0), '≈ 12 m', { size: 0.75, tick: 0.5, color: '#ffe6bf', intensity: 1.8 });
  dLong.rotation.set(-Math.PI / 2, 0, Math.PI / 2); dLong.position.set(POOL.x1 + 1.6, DECK_Y + 0.2, POOL.z1);
  const dShort = new Dimension(V(0, 0, 0), V(7, 0, 0), '≈ 7 m', { size: 0.75, tick: 0.5, color: '#ffe6bf', intensity: 1.8 });
  dShort.rotation.set(-Math.PI / 2, 0, 0); dShort.position.set(POOL.x0, DECK_Y + 0.2, POOL.z1 + 1.6);
  dimG.add(dLong, dShort); city.add(dimG);

  // ------------------------------------------------------------------------------------- camera
  const CITY_KEYS = [
    [-0.4, V(300, 13, 262), V(60, 6, -12)],
    [0.45, V(262, 17, 224), V(52, 5, -12)],
    [1.15, V(200, 38, 158), V(46, 2, -10)],
    [1.85, V(160, 60, 36), V(62, 0, -4)],
    [2.2, V(112, 13, -1), V(90, -0.7, 1.2)],
    [2.5, V(82, 7.8, -2.2), V(68, -0.7, 1.2)],
    [2.8, V(50, 7.4, -2.2), V(36, -0.7, 1.2)],
    [3.05, V(18, 15, 5), V(-30, 6, 0)],
    [3.35, V(-13, 25, 19), V(-39.5, 8.8, 0)],
    [3.8, V(-27, 17.5, 16), V(-40.5, 9.2, -0.6)],
  ];
  const SHOP_KEYS = [
    [T_WT - 0.1, V(-0.115, 0.07, 0.12), V(-0.075, 0.0, 0.0)],
    [T_WT + 0.6, V(-0.025, 0.105, 0.19), V(-0.005, 0.0, 0.02)],
    [dur + 0.2, V(0.05, 0.145, 0.265), V(0.03, 0.0, 0.026)],
  ];
  const mkPath = (keys) => ({
    pos: new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal'),
    look: new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal'),
    warp: keys.map((k, i) => [k[0], i / (keys.length - 1)]),
  });
  const cityPath = mkPath(CITY_KEYS), shopPath = mkPath(SHOP_KEYS);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function pose(path, t) {
    const u = clamp(timeWarp(t, path.warp), 0, 1);
    path.pos.getPoint(u, camPos); path.look.getPoint(u, camLook);
  }

  const dof = { focus: 60, range: 60, amount: 0.15 };
  const bloom = { strength: 0.6 };
  const api = { scene, camera, update, dof, bloom, exposure: 1, exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomOut: 2.5 } };

  // ------------------------------------------------------------------------------------- update
  function update(t, info) {
    const inShop = t >= T_WT;
    city.visible = !inShop; shop.visible = inShop;

    // the city rises, then settles onto the grid
    U.uRise.value = t;
    gMasks.townK.value = ramp(t, T_DUST + 0.15, T_DUST + 1.1);
    U.uSettle.value = ramp(t, T_GRID + 0.12, T_GRID + 0.78, ease.inOutCubic);
    for (const p of dustClouds) {
      const t0 = p.userData.t0;
      p.u.mix = ramp(t, t0, t0 + 1.6, ease.outCubic);
      p.u.opacity = 0.13 * envelope(t, t0 - 0.05, t0 + 1.9, 0.15, 0.9);
      p.visible = p.u.opacity > 0.002 && !inShop;
      p.tick(t, info);
    }
    motes.tick(t, info); shopMotes.tick(t, info);
    motes.u.opacity = 0.5 * (1 - ramp(t, 1.4, 2.0));

    // survey lines
    const gs = ramp(t, T_GRID - 0.05, T_GRID + 0.65, ease.outCubic), gFade = 1 - ramp(t, T_DRAIN - 0.25, T_DRAIN + 0.1);
    surveyEdges.progress = gs; surveyEdges.opacity = 0.9 * gFade;
    tubes.forEach((tb, i) => { tb.progress = ramp(t, T_GRID - 0.08 + i * 0.07, T_GRID + 0.5 + i * 0.07, ease.inOutCubic); tb.opacity = gFade; });
    citOutline.progress = ramp(t, T_GRID + 0.1, T_GRID + 0.7); citOutline.opacity = 0.8 * gFade;
    ring.progress = ramp(t, T_GRID + 0.15, T_GRID + 0.6); ring.opacity = gFade;
    cross.progress = ramp(t, T_GRID + 0.25, T_GRID + 0.7); cross.opacity = gFade;
    nLabel.opacity = gFade * ramp(t, T_GRID + 0.4, T_GRID + 0.7); nLabel.reveal = ramp(t, T_GRID + 0.4, T_GRID + 0.75);
    survey.visible = t > T_GRID - 0.1 && gFade > 0 && !inShop;

    // x-ray of the street: the surface opens round the look point, the covers lift off the drain
    const xr = ramp(t, T_DRAIN - 0.05, T_DRAIN + 0.55, ease.outCubic) * (1 - ramp(t, T_BATH + 0.25, T_BATH + 0.6));
    XU.uXR.value = xr * 58;
    XU.uXP.value.copy(XP0);
    drains.visible = xr > 0.001 && !inShop;
    xrLines.progress = ramp(t, T_DRAIN, T_DRAIN + 0.6); xrLines.opacity = 0.9 * sat(xr * 1.5);
    ghost.progress = ramp(t, T_DRAIN, T_DRAIN + 0.5); ghost.opacity = 0.35 * sat(xr * 1.5);
    lifted.position.y = 0.55 * ramp(t, T_DRAIN + 0.1, T_DRAIN + 0.55, ease.outCubic);
    for (const m of [wMain, wHouse]) m.uniforms.uTime.value = t;
    work.intensity = 45 * xr * (1 - ramp(t, T_BATH - 0.25, T_BATH));
    riverMat.uniforms.uTime.value = t;

    // the Great Bath fills
    const fillK = ramp(t, T_BATH, T_BATH + 0.72, ease.inOutSine);
    poolWater.position.y = lerp(DECK_Y - POOL_D + 0.02, DECK_Y - 0.28, fillK);
    poolWater.visible = fillK > 0.001 && !inShop;
    poolMat.uniforms.uTime.value = t;
    spill.visible = fillK > 0 && fillK < 1 && !inShop;
    spill.scale.y = Math.max(0.01, DECK_Y - poolWater.position.y - 0.05);
    spill.position.y = DECK_Y - spill.scale.y / 2 - 0.02;
    spill.material.opacity = 0.5 * (1 - ramp(t, T_BATH + 0.55, T_BATH + 0.72));
    const dimP = ramp(t, T_BATH + 0.1, T_BATH + 0.55);
    dLong.reveal(dimP, 1 - ramp(t, T_WT - 0.05, T_WT)); dShort.reveal(ramp(t, T_BATH + 0.2, T_BATH + 0.65), 1 - ramp(t, T_WT - 0.05, T_WT));

    // camera
    if (!inShop) {
      pose(cityPath, t);
      camPos.y = Math.max(camPos.y, 2.6);
      if (camPos.y < 14 && camPos.x > 10) camPos.z = clamp(camPos.z, -3.4, 3.4);   // never into the houses lining the street
      camPos.x += Math.sin(t * 1.3) * 0.25; camPos.y += Math.sin(t * 1.7 + 1) * 0.12;
      camera.near = 0.5; camera.far = 6000; camera.fov = lerp(34, 38, ramp(t, 1.9, 2.4)) - 4 * ramp(t, 2.9, 3.6);
    } else {
      pose(shopPath, t);
      camPos.y += Math.sin(t * 2.1) * 0.0006;
      camera.near = 0.004; camera.far = 40; camera.fov = 30;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 0.5);
    work.position.set(camLook.x - 4, 3.2, 0.8);

    // sun and its shadow frustum follow the action
    if (!inShop) {
      const k = ramp(t, 1.85, 2.35);
      const cx = lerp(30, camLook.x, k), cz = lerp(0, camLook.z, k);
      setSun(cx, 0, cz, lerp(175, 42, k), 500, lerp(0.15, 0.03, k));
      sun.intensity = 3.7; fill.intensity = 0.38; bounce.intensity = 0;
      scene.environmentIntensity = 0.25;
    } else {
      setSun(0.04, 0, 0.02, 0.26, 3, 0.0004);
      sun.intensity = 3.0; fill.intensity = 0.4; bounce.intensity = 0.03;
      scene.environmentIntensity = 0.22;
    }

    // callouts
    const fk = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(17.5));
    for (const c of labels) {
      const [a, b] = c.userData.win;
      const p = ramp(t, a, a + 0.4, ease.outCubic), o = 1 - ramp(t, b - 0.2, b);
      const parentOn = c.parent === shop ? inShop : !inShop && (c.parent !== drains || drains.visible);
      c.visible = p > 0 && o > 0 && parentOn;
      if (!c.visible) continue;
      faceCamera(c, camera);
      c.scale.setScalar(camera.position.distanceTo(c.position) * 0.27 * fk * c.userData.k);
      c.reveal(p, o);
    }
    for (const [i, n] of numerals.entries()) { const a = T_WT + 0.15 + i * 0.07; n.reveal = ramp(t, a, a + 0.25); n.opacity = ramp(t, a, a + 0.1); }
    tick.progress = ramp(t, T_WT + 0.5, T_WT + 0.7); tick.opacity = 1;

    // lens and grade
    if (!inShop) {
      const fd = camera.position.distanceTo(camLook);
      dof.focus = fd; dof.range = Math.max(8, fd * 0.9); dof.amount = 0.12 + 0.1 * ramp(t, 2.9, 3.4);
    } else {
      dof.focus = camera.position.distanceTo(camLook); dof.range = 0.16; dof.amount = 0.45;
    }
    bloom.strength = 0.6 + 0.25 * envelope(t, T_GRID - 0.1, T_GRID + 0.9, 0.2, 0.5);
    api.exposure = (inShop ? 1.0 : 1.12) + 0.35 * (1 - ramp(t, T_WT, T_WT + 0.18)) * (t >= T_WT ? 1 : 0);
  }

  api.arSubject = (t) => (t >= T_WT ? { centre: V(0.03, 0.01, 0.02), radius: 0.2 }
    : t >= T_BATH - 0.2 ? { centre: V(-40, CIT_Y, 0), radius: 32 }
    : t >= T_DRAIN - 0.1 ? { centre: V(60, 0, 0), radius: 40 }
    : { centre: V(30, 5, 0), radius: 170 });
  { let n = 0; scene.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); console.warn('INDUS TRIS', Math.round(n), lite, 'walls', walls.tris, 'roof', roof.tris, 'wood', wood.tris, 'pots', pots.tris, 'voids', voids.tris, 'leaves', leaves.tris, 'cloth', cloth.tris, 'lots', lots.length); scene.traverse((o) => { if (o.isMesh && o.geometry) { const g = o.geometry; const k = (g.index ? g.index.count : g.attributes.position.count) / 3; if (k > 5000) console.warn('MESH', o.material.type, Math.round(k)); } }); }
  return api;
}
