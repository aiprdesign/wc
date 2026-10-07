// GIFTS TO THE WORLD — cotton, chintz and indigo, chess, yoga (42.5 – 47.0 s)
// One continuous move through a dawn courtyard where a pit loom stands beside cotton plants:
//   cottonBoll  — macro on a cotton boll: the dried bur splits, the white lobes puff open in the low
//                 sun; fibres stream off and twist into one glowing thread that runs to the loom
//   loom        — the thread becomes the weft: the shuttle flies through the shed, the reed beats,
//                 the plain-weave cloth (procedural over-under shader) grows band by band ·
//                 "COTTON · MEHRGARH, c. 5000 BC"
//   chintz      — carved teak blocks stamp madder, turmeric and indigo flowers across the cloth in a
//                 wave; then an indigo dye front washes over it (the yellow leaves turn green, as in
//                 real chintz, where green was indigo over yellow) · "INDIGO · GREEK INDIKON, 'INDIAN'"
//   chess       — gold lines draw an 8 × 8 ashtapada on the printed cloth and ivory and ebony
//                 chaturanga pieces rise out of it (raja, mantri, gaja, ashva, ratha, padati)
//   chessSpread — the camera pulls up: a line of light runs west over a map on the courtyard floor,
//                 India → Persia → the Arab world → Europe, and the pieces turn into the abstract
//                 shatranj set, then the modern Staunton set, as it passes
//   yoga        — the light lifts off the map and settles into a seated figure (padmasana) before
//                 the rising sun, breathing softly; push in for the 'zoom' hand-over.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { sat, lerp, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { MorphParticles, Dust } from '../../lib/particles.js';
import { progressLine, progressTube, segmentsLine, circlePoints } from '../../lib/lines.js';
import { Callout } from '../../lib/hud.js';
import { glowSprite } from '../../lib/materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as AS from './textiles-assets.js';
import { buildCourtyard } from './textiles-set.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const CLOTH_Y = 0.14;                 // the cloth plane (a pit loom: the warp runs just above the floor)
const HALF = 1.3;                     // cloth half-width (2.6 m square of woven cloth)
const SQ = 0.3;                       // board square (8 × 8 = 2.4 m)
const PITCH = 0.025;                  // thread pitch (shader and warp share it)
const N_WARP = 104;
const FELL0 = 0.62, FELL1 = -1.3, NP = 8, BAND = (FELL0 - FELL1) / NP;
const HEDDLE_Z = -1.78, BACK_Z = -2.7, BACK_Y = 0.27;
const BOLL = V3(-1.72, 0.56, 2.3);
const FIG = V3(-4.6, 0, -4.4);        // the seated figure (base centre)
const FIG_H = 2.0;
const GOLD = '#ffcf85', IVORY = '#ffeccc', INDIGO_HUD = '#cfe0ff';

// ------------------------------------------------------------------ cloth shader (plain weave + print + dye + board)
const CLOTH_GLSL = /* glsl */ `
uniform float uFell, uBandLo, uShX, uDir, uPrint0, uTime, uIndigo, uGrid, uSweep, uSweep2, uGridGlow;
varying vec3 vWP;
struct ClothS { vec3 col; float rough; vec2 grad; vec3 emis; float cut; };
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float sstep(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
const float PI_ = 3.14159265;
const vec3 CREAM = vec3(0.74, 0.65, 0.48);
const vec3 MADDER = vec3(0.52, 0.03, 0.022);
const vec3 MADDER_D = vec3(0.13, 0.01, 0.008);
const vec3 TURMERIC = vec3(0.88, 0.5, 0.03);
const vec3 LEAFY = vec3(0.8, 0.6, 0.08);
const vec3 LEAF = vec3(0.04, 0.2, 0.09);
const vec3 INDIGO = vec3(0.01, 0.022, 0.15);
const vec3 INDIGO_L = vec3(0.03, 0.09, 0.42);
const vec3 GOLDC = vec3(1.0, 0.64, 0.22);

// one block impression: colour + coverage, q in [-1, 1]^2
vec4 motif(vec2 q, float dye){
  vec3 col = MADDER * 0.85; float a = 0.0;
  float r = length(q), ang = atan(q.y, q.x);
  // dotted ground
  vec2 dq = fract(q * 3.5 + 0.5) - 0.5;
  a = sstep(0.11, 0.06, length(dq)) * 0.8 * step(0.62, r);
  // corner flowers (shared by four impressions)
  vec2 cq = abs(q) - 1.0; float rc = length(cq), ac = atan(cq.y, cq.x);
  float rp = 0.3 * (0.6 + 0.4 * abs(cos(3.0 * ac)));
  float cf = sstep(rp + 0.02, rp - 0.01, rc);
  vec3 c = mix(TURMERIC * 1.1, TURMERIC, sstep(0.0, rp, rc));
  c = mix(c, MADDER_D, sstep(rp - 0.06, rp - 0.02, rc));
  c = mix(c, MADDER, sstep(0.1, 0.07, rc));
  col = mix(col, c, cf); a = max(a, cf);
  // mid-edge buds
  float rb = min(length(vec2(abs(q.x) - 1.0, q.y)), length(vec2(q.x, abs(q.y) - 1.0)));
  float bud = sstep(0.11, 0.09, rb);
  col = mix(col, mix(MADDER, TURMERIC, sstep(0.05, 0.035, rb)), bud); a = max(a, bud);
  // leaves on the diagonals (yellow; green once indigo goes over them)
  vec2 ad = abs(q);
  float u = (ad.x + ad.y) * 0.70711, v = (ad.x - ad.y) * 0.70711;
  float lt = (u - 0.74) / 0.22;
  float lw = 0.12 * max(0.0, 1.0 - lt * lt) * (1.0 - 0.25 * lt);
  float leaf = sstep(lw + 0.012, lw - 0.004, abs(v)) * step(abs(lt), 1.0);
  c = mix(LEAFY, LEAF, dye);
  c = mix(c, MADDER_D, sstep(0.012, 0.004, abs(v)) * 0.8);
  c = mix(c, MADDER_D * 1.4, sstep(lw - 0.03, lw - 0.004, abs(v)) * 0.7);
  col = mix(col, c, leaf); a = max(a, leaf);
  float stem = sstep(0.016, 0.008, abs(v)) * step(0.42, u) * step(u, 0.54);
  col = mix(col, mix(LEAFY, LEAF, dye), stem); a = max(a, stem);
  // the central rosette: eight madder petals, an inner turmeric ring, an indigo eye
  float rr = 0.5 * (0.66 + 0.34 * pow(abs(cos(4.0 * ang)), 0.8));
  float fl = sstep(rr + 0.015, rr - 0.005, r);
  c = mix(MADDER * 1.8, MADDER, sstep(0.15, rr, r));
  c *= 0.85 + 0.15 * cos(ang * 24.0);
  c = mix(c, MADDER_D, sstep(rr - 0.05, rr - 0.012, r));
  float rr2 = 0.27 * (0.7 + 0.3 * abs(cos(4.0 * ang + 0.785)));
  float f2 = sstep(rr2 + 0.01, rr2 - 0.005, r);
  c = mix(c, mix(TURMERIC, MADDER_D, sstep(rr2 - 0.04, rr2 - 0.01, r)), f2);
  c = mix(c, INDIGO_L, sstep(0.1, 0.085, r));
  c = mix(c, TURMERIC, sstep(0.045, 0.035, r));
  col = mix(col, c, fl); a = max(a, fl);
  return vec4(col, a);
}

ClothS cloth(vec2 p){
  ClothS o;
  bool woven = p.y > uFell || (p.y > uBandLo && (uDir > 0.0 ? p.x < uShX : p.x > uShX));
  o.cut = woven ? 0.0 : 1.0;
  // plain weave: warp along z, weft along x, over-under in a checker of crossings
  vec2 g = (p + ${HALF.toFixed(2)}) / ${PITCH.toFixed(4)};
  vec2 id = floor(g), f = fract(g) - 0.5;
  float warpTop = mod(id.x + id.y, 2.0);
  float pxs = max(length(fwidth(g)), 1e-4);
  float detail = 1.0 - smoothstep(0.35, 0.9, pxs);
  float cw = cos(f.x * PI_), cf = cos(f.y * PI_);
  float sh = warpTop > 0.5 ? (0.5 + 0.5 * cw) * (0.78 + 0.22 * cf) : (0.5 + 0.5 * cf) * (0.78 + 0.22 * cw);
  float fib = warpTop > 0.5 ? vnoise(vec2(g.x * 3.0, g.y * 14.0)) : vnoise(vec2(g.x * 14.0, g.y * 3.0));
  sh *= 0.88 + 0.24 * fib;
  float slub = 0.92 + 0.08 * h21(vec2(id.y, 7.0)) + 0.04 * h21(vec2(id.x, 3.0));
  float shade = mix(0.84, sh, detail) * slub;
  vec2 grad = warpTop > 0.5 ? vec2(-sin(f.x * PI_), -0.25 * sin(f.y * PI_)) : vec2(-0.25 * sin(f.x * PI_), -sin(f.y * PI_));
  o.grad = grad * 0.6 * detail;
  // indigo front (from the west), with a wet, glinting edge
  float wob = 0.08 * (vnoise(p * 6.0) - 0.5) * 2.0 + 0.05 * sin(p.y * 7.0);
  float dye = sstep(uIndigo + 0.05, uIndigo - 0.05, p.x + wob);
  float wd = (p.x + wob - uIndigo) / 0.045; float wet = exp(-wd * wd);
  vec3 col = mix(CREAM, INDIGO, dye);
  vec3 emis = vec3(0.0);
  // block printing: 4 × 4 impressions, stamped in a diagonal wave from the front-left
  vec2 cg = (p + ${HALF.toFixed(2)}) / 0.65; vec2 cid = clamp(floor(cg), 0.0, 3.0); vec2 q = (fract(cg) - 0.5) * 2.0;
  float ts = uPrint0 + (cid.x + (3.0 - cid.y)) * 0.05;
  float rv = clamp((uTime - ts) / 0.07, 0.0, 1.0);
  float pm = sstep(rv * 1.7, rv * 1.7 - 0.25, length(q)) * step(ts, uTime);
  if (pm > 0.001) {
    vec4 m = motif(q, dye);
    vec3 mc = m.rgb * mix(1.0, 0.82, dye);
    col = mix(col, mc, m.a * pm);
    emis += mc * m.a * pm * 1.4 * exp(-max(0.0, uTime - ts) * 12.0);
  }
  col *= shade;
  emis += vec3(0.02, 0.09, 0.75) * wet * 0.35 * step(-1.5, uIndigo);
  // the ashtapada: gold lines of an 8 × 8 board, drawn from the centre out
  vec2 gl = abs(fract((p + 1.2) / ${SQ.toFixed(2)} + 0.5) - 0.5) * ${SQ.toFixed(2)};
  float inB = step(abs(p.x), 1.204) * step(abs(p.y), 1.204);
  float dl = min(gl.x, gl.y), aa = fwidth(dl) + 1e-4;
  float line = (1.0 - smoothstep(0.0045, 0.0045 + aa, dl)) * inB;
  float fr = abs(max(abs(p.x), abs(p.y)) - 1.25);
  line = max(line, 1.0 - smoothstep(0.006, 0.006 + fwidth(fr) + 1e-4, fr));
  float gr = sstep(uGrid * 1.95, uGrid * 1.95 - 0.18, length(p));
  col = mix(col, GOLDC * 0.85, line * gr);
  emis += GOLDC * line * gr * (0.25 + uGridGlow);
  float s1 = (p.x - uSweep) / 0.06, s2 = (p.x - uSweep2) / 0.06; float sw = exp(-s1 * s1) + exp(-s2 * s2);
  emis += vec3(1.0, 0.72, 0.38) * 0.9 * sw * step(abs(p.y), 1.25);
  o.col = col;
  o.rough = mix(0.9, 0.4, wet);
  o.emis = emis;
  return o;
}`;

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tB = cue('cottonBoll'), tL = cue('loom'), tC = cue('chintz'), tK = cue('chess'), tS = cue('chessSpread'), tY = cue('yoga');
  const DUR = segment.end - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.22;
  scene.fog = new THREE.FogExp2('#1a120e', 0.05);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.02, 200);
  const R = rng(4250);
  const lite = ctx.engine?.quality === 'lite';
  const DBGCAM = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('texcam') : null;   // TEMP debug
  AS.setDetail(lite);

  // timing of the weave
  const P0 = tL - 0.08, PER = 0.11, CROSS = 0.095;
  const PRINT0 = tC + 0.02;

  // ---------------------------------------------------------------- lights
  const key = new THREE.DirectionalLight('#ffcf98', 3.2);
  key.position.set(-3.6, 2.5, -2.6); key.target.position.set(0, 0, 0.2);
  key.castShadow = true; key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -3.6, right: 3.6, top: 3.6, bottom: -3.6, near: 0.5, far: 12 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#7f92c4', '#3a2216', 0.5); scene.add(hemi);
  // cool skylight from the open (camera) side: the shaded faces of the walls read blue against the warm key
  const skyFill = new THREE.DirectionalLight('#8fa6d8', 0.55); skyFill.position.set(3, 4, 6); scene.add(skyFill);
  const boardSpot = new THREE.SpotLight('#fff0da', 0, 0, 0.55, 0.6, 2);
  boardSpot.position.set(2.4, 4.6, 3.6); boardSpot.target.position.set(0, 0, 0);
  scene.add(boardSpot, boardSpot.target);
  const bollFill = new THREE.PointLight('#ffd9b0', 0.4, 2.5, 2); bollFill.position.copy(BOLL).add(V3(0.35, 0.18, 0.45)); scene.add(bollFill);
  const sunLight = new THREE.DirectionalLight('#ff9a5a', 0); sunLight.position.set(-4.6, 1.2, -14); sunLight.target.position.copy(FIG); scene.add(sunLight, sunLight.target);

  // ---------------------------------------------------------------- sky, ground, air
  const skyU = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color('#0a0605') },
    uSunDir: { value: V3(-0.17, 0.02, -0.98).normalize() }, uSunCol: { value: new THREE.Color(1.0, 0.55, 0.25) }, uSun: { value: 0 }, uHalo: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uTop, uHor, uGround, uSunDir, uSunCol; uniform float uSun, uHalo; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(uHor, uTop, smoothstep(0.0, 0.32, h));
        c = mix(c, c * vec3(1.0, 0.75, 1.15), smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.12, 0.3, h)));
        // thin dawn cloud streaks low over the horizon, lit from beneath on the sun side
        { vec2 cp = d.xz / max(h + 0.06, 0.02); float cn = sin(cp.x * 0.9 + sin(cp.y * 0.7) * 1.3) * 0.5 + 0.5; cn *= sin(cp.y * 2.3 + cp.x * 0.4) * 0.5 + 0.5;
          float band = smoothstep(0.02, 0.06, h) * (1.0 - smoothstep(0.1, 0.24, h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          vec3 cc = mix(uTop * 0.7, uSunCol * (0.25 + 0.9 * uHalo), pow(sd, 6.0) * 0.8 + 0.1);
          c = mix(c, cc, smoothstep(0.55, 0.9, cn) * band * 0.55); }
        c = mix(c, uGround, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        float disc = smoothstep(0.99935, 0.99955, s);
        c += uSunCol * (disc * uSun * 2.6 + pow(s, 300.0) * uHalo * 0.7 + pow(s, 14.0) * uHalo * 0.2);
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const dust = new Dust({ count: lite ? 600 : 1400, size: [6, 2.2, 5], center: [-0.6, 0.9, 0.8], color: '#ffd9a8', particleSize: 0.012, opacity: 0.5, intensity: 1.4, seed: 31 });
  dust.u.noise = 0.12; dust.u.noiseSpeed = 0.05;
  scene.add(dust);

  // ---------------------------------------------------------------- materials
  const woodTex = AS.woodTexture(); woodTex.repeat.set(2, 1);
  const woodTex2 = AS.woodTexture({ seed: 5, base: [190, 128, 78], dark: [112, 64, 32] }); woodTex2.repeat.set(2, 1);
  const wood = new THREE.MeshStandardMaterial({ map: woodTex2, color: '#d2bca6', roughness: 0.56 });
  const woodDark = new THREE.MeshStandardMaterial({ map: woodTex, color: '#7a5038', roughness: 0.55 });
  const blockTex = AS.woodTexture({ seed: 9, base: [200, 142, 88], dark: [118, 70, 34] });
  const blockWood = new THREE.MeshStandardMaterial({ map: blockTex, color: '#ffffff', roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: '#d8a656', metalness: 1, roughness: 0.32 });
  const cottonMat = new THREE.MeshPhysicalMaterial({ color: '#efe6d2', roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color('#fff4e0') });
  const yarnMat = new THREE.MeshPhysicalMaterial({ color: '#efe2c4', roughness: 0.62, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#fff0d0'), emissive: new THREE.Color('#2a2014') });
  const lobeMat = new THREE.MeshPhysicalMaterial({ color: '#f4f0e8', roughness: 1, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color('#fff6ea'), emissive: new THREE.Color('#2a2420') });
  const burMat = new THREE.MeshStandardMaterial({ color: '#8a5a34', roughness: 0.6, side: THREE.DoubleSide });
  const bractMat = new THREE.MeshStandardMaterial({ color: '#4d5a26', roughness: 0.7, side: THREE.DoubleSide });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f6e2a', roughness: 0.55, side: THREE.DoubleSide });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#5a3a24', roughness: 0.7 });
  const petalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color('#1a1008') });
  const loomWood = new THREE.MeshStandardMaterial({ map: blockTex, color: '#d4b49a', roughness: 0.5 });
  const shadowAll = (o) => o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const dyeFace = new THREE.MeshPhysicalMaterial({ color: '#6a1208', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  const court = buildCourtyard(scene, { lite, keyLight: key, cottonMat, leafMat, wood, woodDark, blockWood, dyeFace });

  // ---------------------------------------------------------------- cotton plants and the hero boll
  const lobeGeos = [0, 1, 2, 3].map((k) => AS.lobeGeometry(k * 3.1 + 1));
  const burGeo = AS.burGeometry(0.058, 0.03), bractGeo = AS.bractGeometry();
  const orient = (m, a, tilt) => { m.rotation.set(tilt, Math.atan2(Math.cos(a), Math.sin(a)), 0, 'YXZ'); };
  // an open boll (static) or the hero (animated): returns parts to pose
  function makeBoll(parent, open = 1) {
    const g = new THREE.Group(); parent.add(g);
    const bracts = [0, 2.1, 4.2].map((a) => { const m = new THREE.Mesh(bractGeo, bractMat); m.position.set(Math.cos(a) * 0.012, -0.034, Math.sin(a) * 0.012); orient(m, a, 0.75); g.add(m); return m; });
    const burs = [0, 1, 2, 3].map((k) => { const a = Math.PI / 4 + (k * Math.PI) / 2; const m = new THREE.Mesh(burGeo, burMat); g.add(m); return { m, a }; });
    const lobes = [0, 1, 2, 3].map((k) => { const a = (k * Math.PI) / 2; const m = new THREE.Mesh(lobeGeos[k], lobeMat); g.add(m); return { m, a }; });
    const pose = (o) => {
      for (const { m, a } of burs) { m.position.set(Math.cos(a) * 0.008, -0.026, Math.sin(a) * 0.008); orient(m, a, lerp(0.12, 1.15, o)); }
      for (const { m, a } of lobes) {
        const r = lerp(0.006, 0.021, o), s = lerp(0.5, 1, o);
        m.position.set(Math.cos(a) * r, lerp(-0.008, 0.01, o), Math.sin(a) * r);
        m.scale.set(0.027 * s, 0.028 * s, 0.027 * s);
      }
    };
    pose(open);
    return { g, pose, bracts };
  }
  function makePlant(base, h, seed, bolls = 3, flower = false, exactTop = null) {
    const pr = rng(seed), plant = new THREE.Group(); plant.position.copy(base); scene.add(plant);
    const top = exactTop ?? V3((pr() - 0.5) * 0.06, h, (pr() - 0.5) * 0.06);
    const stemCurve = new THREE.CatmullRomCurve3([V3(0, 0, 0), V3(0.02, h * 0.35, -0.01), V3(-0.01, h * 0.7, 0.01), top]);
    plant.add(new THREE.Mesh(AS.varTube(stemCurve, 24, 6, (u) => 0.009 - 0.005 * u), stemMat));
    const tips = [];
    for (let k = 0; k < bolls; k++) {
      const u = 0.5 + (k / Math.max(1, bolls)) * 0.4, p = stemCurve.getPointAt(u), a = pr() * TAU, len = 0.08 + pr() * 0.07;
      const end = p.clone().add(V3(Math.cos(a) * len, 0.05 + pr() * 0.04, Math.sin(a) * len));
      plant.add(new THREE.Mesh(AS.varTube(new THREE.CatmullRomCurve3([p, p.clone().lerp(end, 0.5).add(V3(0, 0.03, 0)), end]), 10, 5, () => 0.004), stemMat));
      tips.push(end);
    }
    for (let k = 0; k < 6; k++) {
      const u = 0.2 + (k / 6) * 0.65, p = stemCurve.getPointAt(u), a = pr() * TAU;
      const leaf = new THREE.Mesh(AS.cottonLeafGeometry(0.06 + pr() * 0.035, seed + k), leafMat);
      leaf.position.copy(p); leaf.rotation.set((pr() - 0.5) * 0.4, a, -0.25 - pr() * 0.3, 'YXZ');
      plant.add(leaf);
    }
    const out = [];
    for (const tp of tips) { const b = makeBoll(plant, 1); b.g.position.copy(tp).add(V3(0, 0.03, 0)); b.g.rotation.y = pr() * TAU; out.push(b); }
    if (flower) {
      const fl = new THREE.Group(); fl.position.copy(stemCurve.getPointAt(0.82)).add(V3(0.11, 0.0, 0.06)); fl.rotation.set(0.35, 0, -0.5);
      for (let k = 0; k < 5; k++) { const pm = new THREE.Mesh(AS.petalGeometry(), petalMat); pm.rotation.set(0.55, (k / 5) * TAU, 0, 'YXZ'); fl.add(pm); }
      plant.add(new THREE.Mesh(AS.varTube(new THREE.CatmullRomCurve3([stemCurve.getPointAt(0.7), fl.position.clone().add(V3(-0.03, -0.04, -0.02)), fl.position]), 8, 5, () => 0.0035), stemMat));
      plant.add(fl);
    }
    shadowAll(plant);
    return { plant, top: stemCurve.getPointAt(1).add(base), out };
  }
  // hero plant: its top boll is the animated one
  const hero = makePlant(V3(BOLL.x + 0.03, 0, BOLL.z + 0.04), BOLL.y - 0.045, 17, 1, true, V3(-0.03, BOLL.y - 0.045, -0.04));
  const heroBoll = makeBoll(scene, 0);
  heroBoll.g.position.copy(BOLL); heroBoll.g.rotation.y = 0.4;
  shadowAll(heroBoll.g);
  for (const [x, z, h, s, n] of [[-2.32, 1.55, 0.62, 31, 3], [-2.1, 2.95, 0.5, 32, 3], [-2.85, 2.35, 0.7, 33, 4], [-2.65, 0.65, 0.66, 34, 3], [-1.25, 3.2, 0.42, 35, 2], [-3.2, 1.2, 0.74, 36, 4], [-1.95, 0.2, 0.55, 37, 3]]) makePlant(V3(x, 0, z), h, s, n, s % 2 === 0);

  // fibres: a halo of loose fibre on the open lobes, and the stream that twists into the thread
  const lobeWorld = (k, o = 1) => { const a = (k * Math.PI) / 2 - 0.4, r = lerp(0.006, 0.021, o); return V3(BOLL.x + Math.cos(a) * r, BOLL.y + lerp(-0.008, 0.01, o), BOLL.z + Math.sin(a) * r); };
  const onLobe = (out, i, jitter) => {
    const k = Math.floor(R() * 4), c = lobeWorld(k), u = R() * 2 - 1, th = R() * TAU, s = Math.sqrt(1 - u * u);
    const rr = 0.025 * (1 + jitter * Math.pow(R(), 2));
    out[i * 3] = c.x + s * Math.cos(th) * rr; out[i * 3 + 1] = c.y + u * rr * 1.12; out[i * 3 + 2] = c.z + s * Math.sin(th) * rr;
  };
  const N_HALO = 2600, haloP = new Float32Array(N_HALO * 3);
  for (let i = 0; i < N_HALO; i++) onLobe(haloP, i, 0.45);
  const halo = new MorphParticles({ count: N_HALO, positions: haloP, targets: haloP, size: 0.0035, color: '#fff6ea', intensity: 1.1, opacity: 0, seed: 12 });
  halo.u.noise = 0.0015; halo.u.noiseFreq = 40; halo.u.noiseSpeed = 0.3;
  scene.add(halo);
  const threadCurve = new THREE.CatmullRomCurve3([BOLL.clone().add(V3(0.0, 0.02, 0)), V3(-1.8, 0.47, 1.85), V3(-1.76, 0.3, 1.2), V3(-1.62, CLOTH_Y + 0.025, FELL0 - 0.035)]);
  const N_FIB = 5200, fibA = new Float32Array(N_FIB * 3), fibB = new Float32Array(N_FIB * 3);
  {
    const p = new THREE.Vector3(), tg = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), up = V3(0, 1, 0);
    for (let i = 0; i < N_FIB; i++) {
      onLobe(fibA, i, 0.2);
      const s = Math.pow(i / N_FIB, 0.85);
      threadCurve.getPointAt(s, p); threadCurve.getTangentAt(s, tg);
      n1.crossVectors(tg, up).normalize(); n2.crossVectors(tg, n1).normalize();
      const ph = s * 260 + (i % 3) * 2.1, rr = 0.0025 + 0.003 * R();
      p.addScaledVector(n1, Math.cos(ph) * rr).addScaledVector(n2, Math.sin(ph) * rr);
      fibB[i * 3] = p.x; fibB[i * 3 + 1] = p.y; fibB[i * 3 + 2] = p.z;
    }
  }
  const fibres = new MorphParticles({ count: N_FIB, positions: fibA, targets: fibB, size: 0.004, color: '#fff3e2', intensity: 1.3, opacity: 0, seed: 13, stagger: 0.75 });
  fibres.u.noiseFreq = 9; fibres.u.noiseSpeed = 0.4;
  scene.add(fibres);
  const thread = progressTube(threadCurve, { radius: 0.0032, segments: 160, radial: 6, color: '#fff1d8', intensity: 1.6, additive: false });
  thread.material.transparent = true; thread.material.depthWrite = true;
  scene.add(thread);

  // ---------------------------------------------------------------- the pit loom
  const loom = new THREE.Group(); scene.add(loom);
  const LP = AS.loomParts();
  const beam = (x0, x1, y, z, r, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, x1 - x0, 24).rotateZ(Math.PI / 2), mat); m.position.set((x0 + x1) / 2, y, z); loom.add(m); return m; };
  const part = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); loom.add(m); return m; };
  beam(-1.55, 1.55, 0.07, 1.4, 0.07, cottonMat);             // breast beam, wound with finished cloth
  for (const sx of [-1, 1]) { beam(sx * 1.55, sx * 1.8, 0.07, 1.4, 0.045, loomWood); part(LP.boss, loomWood, sx * 1.585, 0.07, 1.4); }
  part(LP.ratchet, woodDark, 1.68, 0.07, 1.4); part(LP.pawl, woodDark, 1.68, 0.15, 1.47).rotation.x = -0.5;
  beam(-1.5, 1.5, BACK_Y - 0.03, BACK_Z, 0.05, yarnMat);       // back beam with the warp wound on it
  for (const sx of [-1, 1]) { beam(sx * 1.5, sx * 1.8, BACK_Y - 0.03, BACK_Z, 0.04, loomWood); part(LP.boss, loomWood, sx * 1.535, BACK_Y - 0.03, BACK_Z).scale.setScalar(0.8); }
  part(LP.ratchet, woodDark, -1.66, BACK_Y - 0.03, BACK_Z).scale.setScalar(0.8);
  for (const [x, z, h] of [[-1.86, 1.4, 0.24], [1.86, 1.4, 0.24], [-1.86, BACK_Z, 0.4], [1.86, BACK_Z, 0.4]]) {
    part(LP.post(h, 0.042), loomWood, x, 0, z);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10).rotateZ(Math.PI / 2), woodDark, x * 0.985, h - 0.12, z);    // the peg the beam end rests on
  }
  // overhead frame for the heddles: turned uprights with finials and a crossbar with collars
  for (const sx of [-1, 1]) {
    part(LP.upright, loomWood, sx * 1.84, 0, HEDDLE_Z - 0.04);
    part(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16).rotateZ(Math.PI / 2), wood, sx * 1.72, 1.68, HEDDLE_Z - 0.04);
  }
  part(new THREE.CylinderGeometry(0.032, 0.032, 3.86, 16).rotateZ(Math.PI / 2), loomWood, 0, 1.68, HEDDLE_Z - 0.04);
  // a low weaver's plank at the pit edge and a bobbin winder beside it
  part(new RoundedBoxGeometry(0.9, 0.05, 0.3, 2, 0.015), wood, 0.1, 0.28, 2.05);
  for (const sx of [-1, 1]) part(LP.post(0.26, 0.03), loomWood, 0.1 + sx * 0.36, 0, 2.05);
  // the beater hangs from the crossbar on two swords (posed every frame)
  const swords = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.014, 1, 8, 1).translate(0, 0.5, 0), wood, 2);
  swords.castShadow = true; swords.frustumCulled = false; scene.add(swords);
  // the two heddle shafts (bars and string heddles), each hung from the crossbar
  const shafts = [0, 1].map((k) => {
    const g = new THREE.Group(); g.position.z = HEDDLE_Z - k * 0.07; scene.add(g);
    for (const y of [0.31, -0.04]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.9, 10).rotateZ(Math.PI / 2), wood); m.position.y = CLOTH_Y + y; g.add(m); }
    const segs = [];
    for (let i = k; i < N_WARP; i += 2) { const x = -HALF + PITCH * (i + 0.5); segs.push([V3(x, CLOTH_Y - 0.03, 0), V3(x, CLOTH_Y + 0.3, 0)]); }
    for (const sx of [-1.2, 1.2]) segs.push([V3(sx, CLOTH_Y + 0.31, 0), V3(sx, 1.66 - (CLOTH_Y), 0)]);
    const strings = segmentsLine(segs, { color: '#d8c8a8', intensity: 0.5, additive: false, orderFn: () => 0, stagger: 0 });
    strings.material.transparent = true;
    g.add(strings);
    return g;
  });
  // the reed in its beater
  const reed = new THREE.Group(); scene.add(reed);
  for (const y of [0.0, 0.25]) { const m = new THREE.Mesh(new RoundedBoxGeometry(2.9, y ? 0.04 : 0.05, y ? 0.05 : 0.07, 2, 0.014), wood); m.position.y = CLOTH_Y - 0.06 + y; reed.add(m); }
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.32, 0.06, 2, 0.012), wood); m.position.set(sx * 1.43, CLOTH_Y + 0.06, 0); reed.add(m); }
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.22), new THREE.MeshStandardMaterial({ map: AS.reedTexture(N_WARP), alphaTest: 0.4, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide })); m.position.y = CLOTH_Y + 0.065; reed.add(m); }
  // warp threads: fell → heddles → back beam, opening and closing the shed every pick
  const warpGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 1, 5, 1, true).translate(0, 0.5, 0);
  const warp = new THREE.InstancedMesh(warpGeo, yarnMat, N_WARP * 2);
  warp.frustumCulled = false; warp.castShadow = true;
  scene.add(warp);
  // shuttle
  const shG = AS.shuttleGeometry();
  const shuttle = new THREE.Group();
  shuttle.add(new THREE.Mesh(shG.wood, blockWood), new THREE.Mesh(shG.brass, brass), new THREE.Mesh(shG.pirn, yarnMat));
  shadowAll(shuttle); scene.add(shuttle);
  const weft = progressLine([V3(0, 0, 0), V3(1, 0, 0)], { color: '#fff0d8', intensity: 1.4, additive: false });
  weft.material.transparent = true; scene.add(weft);
  shadowAll(loom);

  // the cloth (one plane: woven area, print, dye and board all in its shader)
  const clothU = {
    uFell: { value: FELL0 }, uBandLo: { value: FELL0 - BAND }, uShX: { value: -9 }, uDir: { value: 1 }, uPrint0: { value: PRINT0 },
    uTime: { value: 0 }, uIndigo: { value: -9 }, uGrid: { value: 0 }, uSweep: { value: 9 }, uSweep2: { value: 9 }, uGridGlow: { value: 0 },
  };
  const clothMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
  clothMat.userData.noDetail = true; clothMat.userData.noPhys = true; clothMat.userData.noBatch = true;
  clothMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, clothU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + CLOTH_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\nClothS cs = cloth(vWP.xz);\nif (cs.cut > 0.5) discard;\ndiffuseColor.rgb = cs.col;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = cs.rough;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n{ vec3 tX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz); vec3 tZ = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz); normal = normalize(normal - tX * cs.grad.x - tZ * cs.grad.y); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += cs.emis;');
  };
  clothMat.customProgramCacheKey = () => 'textiles-cloth-1';
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2).rotateX(-Math.PI / 2), clothMat);
  cloth.position.y = CLOTH_Y + 0.003; cloth.receiveShadow = true;
  scene.add(cloth);

  // print blocks (16 impressions)
  const blk = AS.blockGeometry(0.46);
  const blocks = new THREE.InstancedMesh(blk.box, blockWood, 16);
  const reliefs = new THREE.InstancedMesh(blk.relief, dyeFace, 16);
  const knobs = new THREE.InstancedMesh(blk.knob, wood, 16);
  for (const m of [blocks, reliefs, knobs]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
  // spare blocks resting on the print table (one turned over to show its relief)
  {
    const tg = court.tray;
    const put = (x, z, ry, flip, s) => { const g = new THREE.Group(); g.position.set(x, flip ? 0.33 + 0.08 * s : 0.305 + 0.035 * s, z); g.rotation.set(flip ? Math.PI : 0, ry, 0); g.scale.setScalar(s); tg.add(g);
      for (const [geo, mat] of [[blk.box, blockWood], [blk.relief, dyeFace], [blk.knob, wood]]) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); } };
    put(0.22, 0.12, 0.3, false, 0.5); put(0.15, -0.18, -0.4, true, 0.45);
  }

  // ---------------------------------------------------------------- chess
  const sets = AS.chessSets();
  const ivoryMat = new THREE.MeshPhysicalMaterial({ color: '#f0e2c4', roughness: 0.34, sheen: 0.4, sheenColor: new THREE.Color('#fff2d8'), clearcoat: 0.35, clearcoatRoughness: 0.3 });
  const ebonyMat = new THREE.MeshPhysicalMaterial({ color: '#1e130c', roughness: 0.24, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  const BACK = [4, 3, 2, 1, 0, 2, 3, 4];
  const pieces = [];
  for (let side = 0; side < 2; side++) for (let f = 0; f < 8; f++) for (const pawn of [false, true]) {
    const rank = side === 0 ? (pawn ? 1 : 0) : (pawn ? 6 : 7);
    const x = -1.05 + SQ * f, z = 1.05 - SQ * rank;
    pieces.push({ type: pawn ? 5 : BACK[f], side, x, z, rotY: side === 0 ? Math.PI : 0, f, pawn });
  }
  // one InstancedMesh per (era, type, side)
  const inst = [];
  for (let e = 0; e < 3; e++) for (let ty = 0; ty < 6; ty++) for (let side = 0; side < 2; side++) {
    const list = pieces.filter((p) => p.type === ty && p.side === side);
    const m = new THREE.InstancedMesh(sets[e][ty], side ? ebonyMat : ivoryMat, list.length);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
    list.forEach((p, i) => { (p.slots ??= [])[e] = [m, i]; });
    m.userData.n = list.length; m.userData.on = false;
    inst.push(m);
  }
  pieces.forEach((p) => {
    p.rise = tK + 0.03 + 0.03 * Math.abs(p.f - 3.5) + (p.pawn ? 0.07 : 0) + p.side * 0.05;
    p.ts1 = tS + 0.05 + ((1.2 - p.x) / 2.4) * 0.19;
    p.ts2 = tS + 0.33 + ((1.2 - p.x) / 2.4) * 0.19;
  });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2), ringMat, pieces.length);
  rings.frustumCulled = false; rings.setColorAt(0, new THREE.Color(0, 0, 0)); scene.add(rings);

  // ---------------------------------------------------------------- the westward route on the courtyard floor
  const mapG = new THREE.Group(); scene.add(mapG);
  const MY = 0.006;
  const grat = [];
  for (let x = -6.6; x <= -1.4; x += 0.6) grat.push([V3(x, MY, -3.6), V3(x, MY, 1.4)]);
  for (let z = -3.6; z <= 1.41; z += 0.6) grat.push([V3(-6.6, MY, z), V3(-1.75, MY, z)]);
  const graticule = segmentsLine(grat, { color: '#c89a5a', headColor: '#ffe0b0', intensity: 0.35, head: 0.05, orderFn: (a, b) => Math.min(1, Math.hypot((a.x + b.x) / 2 + 1.4, (a.z + b.z) / 2) / 6) * 0.7, stagger: 0.7 });
  mapG.add(graticule);
  const NODES = [
    { p: V3(-1.42, CLOTH_Y, -0.05), name: null },
    { p: V3(-2.75, MY, -0.95), name: 'SHATRANJ · PERSIA' },
    { p: V3(-3.85, MY, -0.5), name: 'ARAB WORLD' },
    { p: V3(-5.3, MY, -2.7), name: 'CHESS · EUROPE' },
  ];
  const routeSegs = [];
  const routeT = [[tS + 0.02, tS + 0.2], [tS + 0.2, tS + 0.32], [tS + 0.32, tS + 0.5]];
  const routeCurves = [];
  for (let k = 0; k < 3; k++) {
    const a = NODES[k].p, b = NODES[k + 1].p, mid = a.clone().lerp(b, 0.5).add(V3(0, 0.0, 0.25 * (k === 1 ? -1 : 1)));
    if (k === 0) mid.y = 0.03;
    const c = new THREE.CatmullRomCurve3([a, mid, b]);
    routeCurves.push(c);
    const tube = progressTube(c, { radius: 0.012, segments: 80, radial: 6, color: '#ffc46e', intensity: 2.6, tail: 0 });
    mapG.add(tube); routeSegs.push(tube);
  }
  const nodeFx = NODES.slice(1).map((n) => {
    const ring = progressLine(circlePoints(0.16, 64, { plane: 'xz', center: n.p.clone().add(V3(0, 0.004, 0)) }), { color: '#ffd28a', intensity: 1.8, head: 0.08 });
    const glow = glowSprite({ color: '#ffb35a', intensity: 1.6, scale: 0.7 }); glow.position.copy(n.p).add(V3(0, 0.08, 0));
    mapG.add(ring, glow);
    return { ring, glow };
  });

  // ---------------------------------------------------------------- the seated figure at sunrise
  const field = AS.figureField();
  const figGroup = new THREE.Group(); figGroup.position.copy(FIG); figGroup.rotation.y = 0.2; figGroup.scale.setScalar(FIG_H); scene.add(figGroup);
  const mask = AS.figureMask(field);
  const silMat = new THREE.MeshBasicMaterial({ map: mask, color: new THREE.Color('#120a08'), transparent: true, opacity: 0, depthWrite: false, fog: false });
  const sil = new THREE.Mesh(new THREE.PlaneGeometry(mask.userData.w, mask.userData.h), silMat);
  sil.position.set(mask.userData.cx, mask.userData.cy, -0.004); figGroup.add(sil);
  const figSegs = AS.contourSegments(field, -0.6, 0.6, -0.04, 1.06, 0.0055);
  const figLines = segmentsLine(figSegs, { color: '#ffc77a', headColor: '#fff2d0', intensity: 1.7, head: 0.06, orderFn: (a, b) => sat(1 - (a.y + b.y) / 2 / 1.0) * 0.6 + R() * 0.05, stagger: 0.7 });
  figLines.material.fog = false;
  figGroup.add(figLines);
  // particles: route light → figure (contour-dense, a soft fill inside)
  const N_FIG = 9000, figA = new Float32Array(N_FIG * 3), figB = new Float32Array(N_FIG * 3), figC = new Float32Array(N_FIG * 3);
  {
    const p = new THREE.Vector3(), cA = new THREE.Color('#ffd79a'), cB = new THREE.Color('#ff9a4a'), cc = new THREE.Color();
    figGroup.updateMatrixWorld(true);
    for (let i = 0; i < N_FIG; i++) {
      const k = Math.floor(R() * 3);
      routeCurves[k].getPointAt(R(), p); p.x += (R() - 0.5) * 0.08; p.z += (R() - 0.5) * 0.08; p.y += R() * 0.05;
      figA[i * 3] = p.x; figA[i * 3 + 1] = p.y; figA[i * 3 + 2] = p.z;
      let x, y;
      const onEdge = R() < 0.72;
      if (onEdge) {
        const sg = figSegs[Math.floor(R() * figSegs.length)], u = R();
        x = lerp(sg[0].x, sg[1].x, u) + (R() - 0.5) * 0.008; y = lerp(sg[0].y, sg[1].y, u) + (R() - 0.5) * 0.008;
      } else {
        do { x = (R() - 0.5) * 1.0; y = R() * 1.02; } while (field(x, y) > -0.005);
      }
      p.set(x, y, (R() - 0.5) * 0.03).applyMatrix4(figGroup.matrixWorld);
      figB[i * 3] = p.x; figB[i * 3 + 1] = p.y; figB[i * 3 + 2] = p.z;
      cc.copy(cA).lerp(cB, R() * 0.6).multiplyScalar(onEdge ? 1 : 0.3); figC[i * 3] = cc.r; figC[i * 3 + 1] = cc.g; figC[i * 3 + 2] = cc.b;
    }
  }
  const figPts = new MorphParticles({ count: N_FIG, positions: figA, targets: figB, colors: figC, size: 0.018, intensity: 1.6, opacity: 0, seed: 21, stagger: 0.6 });
  figPts.u.noiseFreq = 1.2; figPts.u.noiseSpeed = 0.2;
  figPts.material.fog = false;
  scene.add(figPts);
  const sunGlow = glowSprite({ color: '#ff8a40', intensity: 0, scale: 2.4 }); sunGlow.position.set(FIG.x - 1.1, 0.75, FIG.z - 6.2); sunGlow.material.fog = false; scene.add(sunGlow);
  const chestGlow = glowSprite({ color: '#ffc070', intensity: 0, scale: 1.4 }); chestGlow.material.fog = false; scene.add(chestGlow);

  // ---------------------------------------------------------------- screen HUD (callouts track world anchors)
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  const SQF = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UC = TALL ? 1.85 : SQF ? 1.45 : 1, UCX = SQF ? 0.8 : 1;
  const PK = Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.15);
  const mkCall = (label, sub, dx, dy, color = IVORY) => { const c = new Callout(label, { dx: dx * UCX, dy: dy * UC, size: 0.05 * UC, color, sub, intensity: 1.4 }); hud.scene.add(c); c.visible = false; return c; };
  const callCotton = mkCall('COTTON', 'MEHRGARH · c. 5000 BC', -0.5, -0.2);
  const callIndigo = mkCall('INDIGO', "FROM THE GREEK INDIKON, 'INDIAN'", -0.6, 0.32, INDIGO_HUD);
  const callChat = mkCall('CHATURANGA', 'INDIA · c. 6TH CENTURY AD', TALL ? -0.4 : 0.45, 0.12, GOLD);
  const callNodes = NODES.slice(1).map((n, i) => mkCall(n.name, null, i === 2 ? -0.45 : -0.35, i === 1 ? -0.22 : i === 2 ? 0.06 : 0.22, GOLD));
  const callYoga = mkCall('YOGA', 'UNESCO INTANGIBLE HERITAGE · 2016', TALL ? 0.1 : 0.55, TALL ? -0.3 : -0.16, IVORY);
  const tmp = new THREE.Vector3();
  const toHud = (w, out) => { tmp.copy(w).project(camera); return out.set(tmp.x * A * PK, tmp.y * PK, 0); };
  const anchors = [
    [callCotton, () => V3(-0.95, CLOTH_Y, 0.85)],
    [callIndigo, () => V3(-0.75, CLOTH_Y, 0.55)],
    [callChat, () => V3(0.15, CLOTH_Y + 0.3, -1.05)],
    ...callNodes.map((c, i) => [c, () => NODES[i + 1].p.clone().add(V3(0, 0.05, 0))]),
    [callYoga, () => figGroup.localToWorld(TALL ? V3(0.05, 0.08, 0) : V3(0.42, 0.2, 0))],
  ];

  // ---------------------------------------------------------------- camera path
  const CAM = [V3(-1.47, 0.6, 2.82), V3(-1.47, 0.6, 2.76), V3(-1.15, 0.8, 2.85), V3(0.7, 1.45, 1.75), V3(0.3, 3.1, 2.05), V3(1.1, 1.25, 2.45), V3(-0.3, 4.0, 4.1), V3(-2.3, 1.2, 1.5), V3(-3.95, 0.8, 0.0)];
  const LOOK = [V3(-1.64, 0.61, 2.3), V3(-1.64, 0.61, 2.3), V3(-1.5, 0.22, 0.9), V3(-0.25, -0.1, -1.6), V3(0.0, 0.1, -0.2), V3(0.0, 0.22, 0.05), V3(-1.95, 0.0, -0.7), V3(-4.5, 0.95, -4.4), V3(-4.6, 0.95, -4.4)];
  const camCurve = new THREE.CatmullRomCurve3(CAM, false, 'centripetal'), lookCurve = new THREE.CatmullRomCurve3(LOOK, false, 'centripetal');
  const SK = [[0, 0], [tB, 1], [tL - 0.05, 2], [tL + 0.45, 3], [tC + 0.35, 4], [tK + 0.4, 5], [tS + 0.5, 6], [tY + 0.3, 7], [DUR, 8]];
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();

  // ---------------------------------------------------------------- per-frame helpers
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), e4 = new THREE.Euler(), col = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const yAxis = V3(0, 1, 0), dirV = new THREE.Vector3();
  const seg = (m, i, a, b) => { dirV.subVectors(b, a); const len = dirV.length(); q4.setFromUnitVectors(yAxis, dirV.multiplyScalar(1 / len)); m.setMatrixAt(i, m4.compose(a, q4, s4.set(1, len, 1))); };
  const wA = new THREE.Vector3(), wB = new THREE.Vector3(), wC = new THREE.Vector3();
  const cTopA = new THREE.Color(0.006, 0.009, 0.024), cTopB = new THREE.Color(0.05, 0.085, 0.2);
  const cHorA = new THREE.Color(0.11, 0.06, 0.05), cHorB = new THREE.Color(1.0, 0.46, 0.2);
  const swapOut = (t, ts) => 1 - ramp(t, ts - 0.05, ts + 0.04, ease.inCubic);
  const swapIn = (t, ts) => ramp(t, ts - 0.01, ts + 0.11, ease.outBack);

  // weave state at t: completed fell, band in progress, shuttle
  function weave(t) {
    const fpk = (t - P0) / PER;
    if (fpk < 0) return { fell: FELL0, lo: FELL0 - BAND, shX: -9, dir: 1, front: FELL0, sx: -1.62, k: 0, ph: 0, active: false };
    const k = Math.min(NP - 1, Math.floor(fpk)), ph = Math.min(1, (t - P0 - k * PER) / CROSS);
    const dir = k % 2 === 0 ? 1 : -1, fell = FELL0 - k * BAND, lo = fell - BAND;
    const sx = dir * lerp(-1.62, 1.62, ease.inOutSine(ph));
    const shX = dir * lerp(-1.32, 1.32, ph) + dir * (ph >= 1 ? 9 : 0);
    return { fell, lo, shX, dir, front: lo, sx, k, ph, active: true, fpk };
  }

  let lastT = 0;
  const api = {
    scene, camera, hud,
    dof: { focus: 0.7, range: 0.12, amount: 0.8 },
    bloom: { strength: 0.7 },
    exposure: 1.0,
    background: 0x020101,
    exploreLimits: { yaw: 1.1, pitchDown: 0.4, pitchUp: 0.7, zoomOut: 2.4 },
    arSubject: (t) => (t < tL - 0.1 ? { centre: BOLL.clone(), radius: 0.35 }
      : t < tS + 0.1 ? { centre: V3(0, 0.25, -0.2), radius: 1.9 }
      : t < tY + 0.1 ? { centre: V3(-2.4, 0.2, -0.9), radius: 3.6 }
      : { centre: FIG.clone().add(V3(0, FIG_H * 0.5, 0)), radius: 2.0 }),
    explorePosed(cam) { cam.updateMatrixWorld(); placeHud(); },
    update(t, info) {
      const T = info.T;
      lastT = t;
      const beat = pulse(T, { decay: 8 });

      // -------- camera
      const s = timeWarp(t, SK) / 8;
      camCurve.getPoint(sat(s), camPos); lookCurve.getPoint(sat(s), look);
      // during the weave the camera rides back with the fell, keeping it (and the shuttle) below the heading
      const wLoom = envelope(t, tL - 0.25, tC + 0.3, 0.4, 0.35);
      if (wLoom > 0) {
        const fz = lerp(FELL0, FELL1 + 0.15, ease.inOutSine(sat((t - P0 + 0.05) / (NP * PER))));
        camPos.lerp(wA.set(0.55, 1.25, fz + 1.55), wLoom);
        look.lerp(wB.set(-0.2, 0.0, fz - 0.95), wLoom);
      }
      if (s > 1) camPos.lerp(look, Math.min(0.3, (s - 1) * 2));
      camPos.x += Math.sin(t * 1.3) * 0.006; camPos.y += Math.sin(t * 1.7 + 1) * 0.005;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.8) * 0.01, 1, 0).normalize();
      camera.lookAt(look);
      const macro = 1 - ramp(t, tB + 0.35, tL + 0.2);
      camera.fov = lerp(lerp(30, 36, 1 - macro), 30, ramp(t, tY, DUR, ease.inQuad)) + 5 * envelope(t, tS - 0.2, tY + 0.35, 0.35, 0.4);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      sky.position.copy(camPos);
      skyU.uSunDir.value.set(FIG.x - camPos.x, 0, FIG.z - camPos.z).normalize().setY(0.032).normalize();
      sunGlow.position.copy(camPos).addScaledVector(skyU.uSunDir.value, camPos.distanceTo(FIG) + 7);

      // -------- sky and light: pre-dawn → sunrise
      const dawn = ramp(t, tS + 0.25, DUR, ease.inOutSine);
      skyU.uTop.value.copy(cTopA).lerp(cTopB, dawn);
      skyU.uHor.value.copy(cHorA).lerp(cHorB, dawn);
      skyU.uSun.value = ramp(t, tY - 0.1, DUR, ease.outCubic) * 1.2;
      skyU.uHalo.value = 0.6 + 1.2 * dawn;
      scene.fog.color.copy(skyU.uHor.value).multiplyScalar(0.8);
      skyU.uGround.value.copy(scene.fog.color);
      scene.fog.density = lerp(0.05, 0.032, dawn);
      key.intensity = 3.2 * (1 - 0.45 * dawn);
      key.color.setRGB(1, lerp(0.81, 0.62, dawn), lerp(0.6, 0.42, dawn));
      sunLight.intensity = 2.2 * dawn;
      court.update(t, { dawn, keyDir: wC.copy(key.position).sub(key.target.position).normalize(), keyCol: key.color, keyI: key.intensity });
      hemi.intensity = 0.5 + 0.25 * dawn;
      boardSpot.intensity = 34 * envelope(t, tC - 0.25, tY + 0.4, 0.3, 0.4);
      bollFill.intensity = 0.4 * macro;
      dust.tick(t, info); dust.u.opacity = 0.5 * (1 - 0.6 * dawn);

      // -------- the boll opens; fibres stream into the thread
      const open = ramp(t, tB - 0.05, tB + 0.42, ease.outBack);
      heroBoll.pose(lerp(0.4, 1, sat(open)) + Math.max(0, open - 1) * 0.6);
      heroBoll.g.rotation.y = 0.4 + t * 0.05;
      halo.tick(t, info);
      halo.u.opacity = ramp(t, tB + 0.05, tB + 0.35) * (1 - ramp(t, tL + 0.3, tL + 0.7)) * 0.4;
      halo.u.intensity = 0.8 + 0.3 * envelope(t, tB, tB + 0.5, 0.1, 0.3);
      fibres.tick(t, info);
      const fm = ramp(t, tB + 0.2, tL + 0.05, ease.inOutSine);
      fibres.u.mix = fm;
      fibres.u.noise = 0.004 + 0.02 * Math.sin(Math.PI * fm);
      fibres.u.opacity = ramp(t, tB + 0.15, tB + 0.3) * (1 - ramp(t, tL + 0.15, tL + 0.45));
      fibres.visible = fibres.u.opacity > 0.002;
      thread.progress = ramp(t, tB + 0.35, tL - 0.02, ease.inOutSine);
      thread.opacity = 1 - ramp(t, tL + 0.35, tL + 0.6);
      thread.intensity = 1.0 + 0.5 * envelope(t, tB + 0.3, tL + 0.2, 0.2, 0.3);

      // -------- the weave
      const W = weave(t);
      clothU.uFell.value = W.fell; clothU.uBandLo.value = W.lo; clothU.uShX.value = W.shX; clothU.uDir.value = W.dir;
      clothU.uTime.value = t;
      const shed = W.active ? Math.cos(Math.PI * (Math.floor(W.fpk) + ramp(W.fpk - Math.floor(W.fpk), 0.84, 1.0, ease.inOutSine))) : 1;
      const shedAmp = 0.055 * (1 - ramp(t, tC + 0.05, tC + 0.3));
      const zFront = W.active ? (W.ph < 1 ? W.lo : W.lo) : W.fell;
      const zf = Math.max(FELL1, zFront);
      for (let i = 0; i < N_WARP; i++) {
        const x = -HALF + PITCH * (i + 0.5), up = (i % 2 === 0 ? 1 : -1) * shed * shedAmp;
        wA.set(x, CLOTH_Y, zf); wB.set(x, CLOTH_Y + up, HEDDLE_Z - (i % 2) * 0.07); wC.set(x, BACK_Y + 0.02, BACK_Z);
        seg(warp, i * 2, wA, wB); seg(warp, i * 2 + 1, wB, wC);
      }
      warp.instanceMatrix.needsUpdate = true;
      shafts[0].position.y = shed * shedAmp; shafts[1].position.y = -shed * shedAmp;
      const frac = W.active ? W.fpk - Math.floor(W.fpk) : 0;
      const reedOpen = W.active && t < P0 + NP * PER ? (frac < 0.86 ? ramp(frac, 0, 0.2) : 1 - ramp(frac, 0.86, 1.0, ease.inCubic)) : 0;
      const loomOut = ramp(t, tC + 0.05, tC + 0.5, ease.inOutCubic);   // the beater swings back to the heddles once the cloth is done
      reed.position.z = lerp(zf - 0.05 - 0.13 * reedOpen, HEDDLE_Z + 0.16, loomOut);
      for (const k of [0, 1]) { const sx = k ? 1 : -1; seg(swords, k, wA.set(sx * 1.43, CLOTH_Y + 0.2, reed.position.z), wB.set(sx * 1.55, 1.66, HEDDLE_Z + 0.1)); }
      swords.instanceMatrix.needsUpdate = true;
      const shY = CLOTH_Y + 0.022;
      shuttle.position.set(W.sx, shY, zf - 0.035);
      shuttle.rotation.set(0, 0, W.active && W.ph < 1 ? -W.dir * 0.04 : 0);
      const shutOut = ramp(t, tC - 0.05, tC + 0.15);
      shuttle.scale.setScalar(1.35 * (1 - shutOut)); shuttle.visible = shutOut < 0.999;
      // the weft trailing from the selvedge into the shuttle
      const inPick = W.active && W.ph > 0 && W.ph < 1;
      weft.visible = inPick;
      if (inPick) {
        const xs = -W.dir * 1.32;
        weft.geometry.attributes.position.setXYZ(0, xs, shY - 0.006, zf - 0.03);
        weft.geometry.attributes.position.setXYZ(1, W.sx - W.dir * 0.12, shY, zf - 0.035);
        weft.geometry.attributes.position.needsUpdate = true;
        weft.progress = 1; weft.opacity = 0.9;
      }

      // -------- block printing and the indigo front
      for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) {
        const i = cz * 4 + cx, ts = PRINT0 + (cx + (3 - cz)) * 0.05;
        const down = ramp(t, ts - 0.075, ts, ease.inQuad), up = ramp(t, ts + 0.02, ts + 0.09, ease.inCubic);
        const vis = t > ts - 0.08 && t < ts + 0.095;
        if (!vis) { blocks.setMatrixAt(i, ZERO); reliefs.setMatrixAt(i, ZERO); knobs.setMatrixAt(i, ZERO); continue; }
        const y = CLOTH_Y + 0.04 + (1 - down) * 0.36 + up * 0.5;
        p4.set(-HALF + 0.65 * (cx + 0.5), y, -HALF + 0.65 * (cz + 0.5));
        e4.set((1 - down) * 0.12 - up * 0.18, (i % 3) * 0.02, (1 - down) * -0.08);
        q4.setFromEuler(e4); s4.setScalar(1 - up * 0.5);
        m4.compose(p4, q4, s4); blocks.setMatrixAt(i, m4); reliefs.setMatrixAt(i, m4); knobs.setMatrixAt(i, m4);
      }
      blocks.instanceMatrix.needsUpdate = true; reliefs.instanceMatrix.needsUpdate = true; knobs.instanceMatrix.needsUpdate = true;
      { const on = t > PRINT0 - 0.09 && t < PRINT0 + 0.4; for (const m of [blocks, reliefs, knobs]) { m.count = on ? 16 : 0; m.visible = on; } }
      clothU.uIndigo.value = t < tC + 0.2 ? -9 : lerp(-1.65, 1.75, ramp(t, tC + 0.25, tC + 0.66, ease.inOutSine));

      // -------- chess: the board draws, the pieces rise, then change as the light passes west
      clothU.uGrid.value = ramp(t, tK - 0.1, tK + 0.25, ease.outCubic);
      clothU.uGridGlow.value = 0.5 * envelope(t, tK - 0.1, tK + 0.5, 0.1, 0.3) + 0.15 * beat * ramp(t, tK, tK + 0.2);
      const sw1 = ramp(t, tS + 0.03, tS + 0.27, ease.linear), sw2 = ramp(t, tS + 0.31, tS + 0.55, ease.linear);
      clothU.uSweep.value = sw1 > 0 && sw1 < 1 ? lerp(1.4, -1.4, sw1) : 9;
      clothU.uSweep2.value = sw2 > 0 && sw2 < 1 ? lerp(1.4, -1.4, sw2) : 9;
      for (const m of inst) m.userData.on = false;
      for (let k = 0; k < pieces.length; k++) {
        const p = pieces[k];
        const rp = ramp(t, p.rise, p.rise + 0.34, ease.outCubic);
        const H = AS.PIECE_H[p.type];
        const sc = [rp * swapOut(t, p.ts1), swapIn(t, p.ts1) * swapOut(t, p.ts2), swapIn(t, p.ts2)];
        if (t < p.ts1 - 0.06) { sc[1] = 0; sc[2] = 0; }
        for (let e = 0; e < 3; e++) {
          const [m, i] = p.slots[e];
          const v = sc[e];
          if (v < 0.002) { m.setMatrixAt(i, ZERO); continue; }
          m.userData.on = true;
          const y = e === 0 ? CLOTH_Y - (1 - rp) * (H + 0.02) : CLOTH_Y;
          p4.set(p.x, y, p.z); q4.setFromAxisAngle(yAxis, p.rotY + (e === 0 ? (1 - rp) * 0.6 : 0));
          s4.set(e === 0 ? 1 : Math.max(0.001, v), e === 0 ? 1 : Math.max(0.001, v), e === 0 ? 1 : Math.max(0.001, v));
          if (e === 0 && t > p.ts1 - 0.06) s4.setScalar(Math.max(0.001, v));
          m.setMatrixAt(i, m4.compose(p4, q4, s4));
        }
        // flash rings: emergence and each change
        const fr = envelope(t, p.rise - 0.02, p.rise + 0.3, 0.04, 0.25), f1 = envelope(t, p.ts1 - 0.03, p.ts1 + 0.2, 0.03, 0.17), f2 = envelope(t, p.ts2 - 0.03, p.ts2 + 0.2, 0.03, 0.17);
        const fl = Math.max(fr, f1, f2), age = fl === fr ? ramp(t, p.rise, p.rise + 0.3) : fl === f1 ? ramp(t, p.ts1, p.ts1 + 0.2) : ramp(t, p.ts2, p.ts2 + 0.2);
        if (fl < 0.01) { rings.setMatrixAt(k, ZERO); continue; }
        rings.setMatrixAt(k, m4.compose(p4.set(p.x, CLOTH_Y + 0.006, p.z), q4.identity(), s4.setScalar(0.8 + age * 0.9)));
        rings.setColorAt(k, col.setRGB(1.0, 0.7, 0.35).multiplyScalar(fl * 1.6));
      }
      for (const m of inst) { m.instanceMatrix.needsUpdate = true; m.count = m.userData.on ? m.userData.n : 0; m.visible = m.userData.on; }   // hidden eras cost nothing
      rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;

      // -------- the route west
      const mapOn = ramp(t, tS - 0.05, tS + 0.35) * (1 - ramp(t, tY + 0.25, tY + 0.6));
      graticule.progress = ramp(t, tS - 0.05, tS + 0.45, ease.outCubic); graticule.opacity = mapOn * 0.85;
      routeSegs.forEach((r, k) => { r.progress = ramp(t, routeT[k][0], routeT[k][1], ease.inOutSine); r.opacity = mapOn; r.intensity = 2.6 + 1.2 * beat; });
      nodeFx.forEach((n, k) => {
        const tA = routeT[k][1];
        n.ring.progress = ramp(t, tA - 0.02, tA + 0.2, ease.outCubic); n.ring.opacity = mapOn;
        const g = envelope(t, tA - 0.03, DUR + 1, 0.05, 0.1) * mapOn;
        n.glow.visible = g > 0.01; n.glow.material.opacity = g; n.glow.scale.setScalar(0.5 + 0.5 * Math.exp(-Math.max(0, t - tA) * 6) + 0.2);
      });

      // -------- the figure at sunrise
      figPts.tick(t, info);
      const fmx = ramp(t, tY - 0.12, tY + 0.42, ease.inOutSine);
      figPts.u.mix = fmx;
      figPts.u.noise = 0.03 + 0.25 * Math.sin(Math.PI * fmx);
      const breath = 0.5 + 0.5 * Math.sin((t - tY) * 2.4 - 1.2);
      figPts.u.opacity = ramp(t, tY - 0.2, tY) * 0.9;
      figPts.visible = figPts.u.opacity > 0.002;
      figPts.u.size = lerp(0.03, 0.016, fmx) * (1 + 0.15 * breath * fmx);
      figPts.u.intensity = 1.5 + 0.5 * breath * fmx;
      figLines.progress = ramp(t, tY + 0.12, tY + 0.5, ease.inOutSine);
      figLines.opacity = 0.9; figLines.intensity = 1.5 + 0.6 * breath;
      silMat.opacity = ramp(t, tY + 0.05, tY + 0.35) * 0.97; sil.visible = silMat.opacity > 0.002;
      figGroup.scale.setScalar(FIG_H * (1 + 0.006 * breath * fmx));
      sunGlow.material.opacity = 1; sunGlow.material.color.setRGB(1.0, 0.42, 0.16).multiplyScalar(dawn * 0.3);
      chestGlow.position.copy(figGroup.localToWorld(wA.set(0, 0.55, 0.02)));
      chestGlow.material.color.setRGB(1.0, 0.72, 0.4).multiplyScalar(ramp(t, tY + 0.2, tY + 0.6) * (0.1 + 0.15 * breath));

      // -------- HUD
      const callP = (c, a, b, out) => { const p = ramp(t, a, b, ease.outCubic); c.visible = p > 0 && out > 0; if (c.visible) c.reveal(p, out); };
      callP(callCotton, tL + 0.12, tL + 0.42, 1 - ramp(t, tC - 0.05, tC + 0.12));
      callP(callIndigo, tC + 0.36, tC + 0.6, 1 - ramp(t, tK + 0.0, tK + 0.15));
      callP(callChat, tK + 0.2, tK + 0.5, 1 - ramp(t, tY - 0.15, tY + 0.05));
      callNodes.forEach((c, k) => callP(c, routeT[k][1] - 0.02, routeT[k][1] + 0.22, 1 - ramp(t, tY + 0.05, tY + 0.3)));
      callP(callYoga, tY + 0.3, tY + 0.6, 1 - ramp(t, DUR - 0.12, DUR + 0.1));
      placeHud();

      // -------- lens and post
      const focusBoll = camPos.distanceTo(BOLL);
      const focusLoom = camPos.distanceTo(wA.set(0, CLOTH_Y, zf));
      const focusBoard = camPos.distanceTo(wB.set(0, 0.2, 0));
      const focusMap = camPos.distanceTo(wC.set(-2.4, 0, -0.9));
      const focusFig = camPos.distanceTo(FIG) * 0.98;
      const kL = ramp(t, tB + 0.4, tL + 0.2), kB = ramp(t, tC, tK + 0.2), kM = ramp(t, tS, tS + 0.4), kF = ramp(t, tY - 0.05, tY + 0.35);
      api.dof.focus = lerp(lerp(lerp(lerp(focusBoll, focusLoom, kL), focusBoard, kB), focusMap, kM), focusFig, kF);
      api.dof.range = lerp(lerp(lerp(0.14, 0.9, kL), 1.4, kB), 3.0, kM);
      api.dof.amount = lerp(lerp(0.85, 0.35, kL), 0.25, kB);
      api.bloom.strength = 0.7 + 0.12 * envelope(t, tC, tC + 0.5, 0.1, 0.3) + 0.15 * dawn;
      api.exposure = 1.0 + 0.05 * envelope(t, tK, tK + 0.4, 0.1, 0.3);
      if (DBGCAM) { const v = DBGCAM.split(',').map(Number); camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]); camera.fov = v[6] || 40; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); api.dof.amount = 0; }
    },
  };
  function placeHud() {
    for (const [c, f] of anchors) { if (!c.visible) continue; toHud(f(), c.position); }
  }
  return api;
}
