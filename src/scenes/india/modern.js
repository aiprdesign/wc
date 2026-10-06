// THE MODERN MIND (46.5 – 50.0 s) — Ramanujan, Raman, Bose.
// One continuous track through a dark "laboratory of the mind", left to right, carried by a single
// thread of light: chalk becomes a beam, the beam's scattered light becomes particles, the particles
// fall into one state, and that state becomes the flash.
//   ramanujan      46.8  a slate hangs in a cool pool of light; chalk writes itself with glowing heads:
//                        1729 = 1³ + 12³ = 9³ + 10³ big and central, his 1914 series for 1/π, the
//                        partition numbers with his mod-5 congruence circled, a staircase of Ferrers diagrams
//   ramanBeam      47.8  the underline of 1729 ignites and runs off the slate as light; the camera whips
//                        with it onto an optical bench: a violet filter makes it monochromatic, it crosses a
//                        flask of clear liquid (the beam's track glows inside); almost all the scattered light
//                        keeps its colour (Rayleigh) but a few photons leave shifted (Raman) — a spectrum
//                        plate draws the strong line and the faint new lines
//   boseCondensate 48.6  the photons stream on and become a gas of identical particles over a velocity plot;
//                        it cools, the jitter dies, the broad hump shrinks and a sharp elliptical peak rises
//                        out of it — the classic Bose–Einstein condensate picture; the condensed particles all
//                        take one colour
//   labGlow        49.2  the peak's tip flares; every particle falls into it; rings run out across the plot and
//                        the camera pushes into the point for the 'flash' cut
import * as THREE from 'three';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { progressTube, segmentsLine } from '../../lib/lines.js';
import { Dust } from '../../lib/particles.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout, faceCamera } from '../../lib/hud.js';
import { fbm2 } from '../../lib/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CHALK = '#eef2f6';
const HUD_COL = '#dde8f6';

// ------------------------------------------------------------------------------------------ spectra
// CIE 1931 multi-lobe fit (Wyman, Sloan & Shirley 2013) → linear sRGB, normalised to max 1 (as science.js)
const lobe = (x, mu, s1, s2) => { const q = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * q * q); };
function specRGB(lam) {
  const X = 1.056 * lobe(lam, 599.8, 37.9, 31.0) + 0.362 * lobe(lam, 442.0, 16.0, 26.7) - 0.065 * lobe(lam, 501.1, 20.4, 26.2);
  const Y = 0.821 * lobe(lam, 568.8, 46.9, 40.5) + 0.286 * lobe(lam, 530.9, 16.3, 31.1);
  const Z = 1.217 * lobe(lam, 437.0, 11.8, 36.0) + 0.681 * lobe(lam, 459.0, 26.0, 13.8);
  const c = [Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z), Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z), Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)];
  const m = Math.max(...c, 1e-4);
  return new THREE.Color(c[0] / m, c[1] / m, c[2] / m);
}
const GLSL_SPEC = /* glsl */ `
  float lobe(float x, float mu, float s1, float s2){ float q = (x - mu) / (x < mu ? s1 : s2); return exp(-0.5 * q * q); }
  vec3 specCol(float lam){
    float X = 1.056*lobe(lam,599.8,37.9,31.0) + 0.362*lobe(lam,442.0,16.0,26.7) - 0.065*lobe(lam,501.1,20.4,26.2);
    float Y = 0.821*lobe(lam,568.8,46.9,40.5) + 0.286*lobe(lam,530.9,16.3,31.1);
    float Z = 1.217*lobe(lam,437.0,11.8,36.0) + 0.681*lobe(lam,459.0,26.0,13.8);
    vec3 c = max(vec3(0.0), vec3(3.2406*X - 1.5372*Y - 0.4986*Z, -0.9689*X + 1.8758*Y + 0.0415*Z, 0.0557*X - 0.2040*Y + 1.0570*Z));
    return c / max(max(c.r, c.g), max(c.b, 1e-4));
  }`;
// The mercury 435.8 nm line and the Raman lines a typical liquid adds to it: Stokes shifts of 992 and 3062 cm⁻¹
// (to longer wavelengths) and a much fainter anti-Stokes line (shorter). λ' = 1 / (1/λ ∓ Δν̃).
const LAM0 = 435.8;
const shift = (dnu) => 1e7 / (1e7 / LAM0 - dnu);
const LINES = [
  { lam: LAM0, amp: 1.0 },
  { lam: shift(992), amp: 0.17 },
  { lam: shift(3062), amp: 0.1 },
  { lam: shift(-992), amp: 0.045 },
];
const LAM_A = 405, LAM_B = 520;

// ------------------------------------------------------------------------------------------ chalk
// Formulas are typeset onto canvases (the web-font subsets have no maths glyphs, so π, √, Σ, ∞ and ≡ are
// drawn as strokes), then "chalked": grain, drop-outs and a soft edge.
// upright (digits, operators): Inter — Cormorant's old-style 1 reads as an I; italic letters: Cormorant Garamond
const fnt = (size, italic = false) => (italic ? `italic 500 ${size}px "${FONTS.serif}"` : `400 ${size}px "${FONTS.sans}"`);
function runsDraw(g, list, x, y, S) {
  for (const [t, k = 'n'] of list) {
    const sup = k.startsWith('sup'), it = k.endsWith('i');
    const sz = sup ? S * 0.6 : S;
    g.font = fnt(sz, it);
    g.fillText(t, x, sup ? y - S * 0.42 : y);
    x += g.measureText(t).width + (sup ? S * 0.05 : it ? S * 0.03 : 0);
  }
  return x;
}
function runsWidth(g, list, S) {
  let x = 0;
  for (const [t, k = 'n'] of list) { const sup = k.startsWith('sup'), it = k.endsWith('i'); g.font = fnt(sup ? S * 0.6 : S, it); x += g.measureText(t).width + (sup ? S * 0.05 : it ? S * 0.03 : 0); }
  return x;
}
function strokePath(g, pts, w) { g.lineWidth = w; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); }
function drawPi(g, x, y, S) {
  g.lineWidth = S * 0.06;
  g.beginPath(); g.moveTo(x + S * 0.02, y - S * 0.38); g.quadraticCurveTo(x + S * 0.08, y - S * 0.47, x + S * 0.2, y - S * 0.45); g.lineTo(x + S * 0.58, y - S * 0.46); g.stroke();
  g.beginPath(); g.moveTo(x + S * 0.21, y - S * 0.45); g.quadraticCurveTo(x + S * 0.2, y - S * 0.15, x + S * 0.09, y); g.stroke();
  g.beginPath(); g.moveTo(x + S * 0.42, y - S * 0.45); g.quadraticCurveTo(x + S * 0.38, y - S * 0.08, x + S * 0.47, y - S * 0.01); g.quadraticCurveTo(x + S * 0.53, y + S * 0.01, x + S * 0.56, y - S * 0.07); g.stroke();
  return x + S * 0.62;
}
function drawSqrt(g, x, y, S, inner) {
  strokePath(g, [[x, y - S * 0.3], [x + S * 0.09, y - S * 0.36], [x + S * 0.22, y + S * 0.03], [x + S * 0.38, y - S * 0.8], [x + S * 0.44 + inner, y - S * 0.8]], S * 0.05);
  return x + S * 0.42;
}
function drawSigma(g, cx, cy, S) {
  const top = cy - S * 0.68, bot = cy + S * 0.62, l = cx - S * 0.4, r = cx + S * 0.42;
  g.lineJoin = 'miter';
  strokePath(g, [[r + S * 0.02, top + S * 0.16], [r, top], [l, top], [cx + S * 0.06, cy - S * 0.03], [l, bot], [r + S * 0.04, bot], [r + S * 0.07, bot - S * 0.17]], S * 0.075);
  g.lineJoin = 'round';
}
function drawInfinity(g, cx, cy, w) {
  g.lineWidth = w * 0.13; g.beginPath();
  for (let i = 0; i <= 64; i++) { const t = (i / 64) * TAU, d = 1 + Math.sin(t) ** 2; const x = cx + (w / 2) * Math.cos(t) / d, y = cy + (w / 2) * Math.sin(t) * Math.cos(t) / d; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
}
function drawEquiv(g, x, y, S) { for (const k of [0.17, 0.31, 0.45]) strokePath(g, [[x + S * 0.04, y - S * k], [x + S * 0.52, y - S * k]], S * 0.05); return x + S * 0.6; }

function chalkify(c, seed = 1) {
  const g = c.getContext('2d'), img = g.getImageData(0, 0, c.width, c.height), d = img.data, R = rng(seed);
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (!d[i + 3]) continue;
    const n = fbm2(x * 0.09, y * 0.09, 2) * 0.5 + 0.5;
    let a = d[i + 3] * (0.58 + 0.42 * n);
    if (R() < 0.13) a *= 0.35;
    d[i + 3] = a; d[i] = d[i + 1] = d[i + 2] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// paint(g) draws on a scratch canvas from x = pad and returns its right edge; the result is cropped.
function chalkCanvas(H, paint, seed) {
  const s = mkCanvas(3000, H), g = s.getContext('2d');
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(255,255,255,0.6)'; g.shadowBlur = 2;
  const right = Math.min(3000, Math.ceil(paint(g)) + 30);
  const c = mkCanvas(right, H); c.getContext('2d').drawImage(s, 0, 0);
  return chalkify(c, seed);
}

// chalk plane: reveals left→right (the writing front), freshly written chalk glows, lit by the slate's pool
const chalkVert = /* glsl */ `varying vec2 vUv; varying vec3 vW;
  void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const chalkFrag = /* glsl */ `uniform sampler2D uMap; uniform float uReveal, uSoft, uI, uOp; uniform vec3 uColor, uPool; uniform float uPoolR;
  varying vec2 vUv; varying vec3 vW;
  void main(){
    float a = texture2D(uMap, vUv).a;
    float e = uReveal * (1.0 + uSoft) - uSoft;
    float vis = smoothstep(e + uSoft, e, vUv.x);
    a *= vis * uOp;
    if (a < 0.01) discard;
    float fresh = (uReveal < 1.0) ? exp(-max(0.0, e + uSoft - vUv.x) * 18.0) : 0.0;
    vec3 d = vW - uPool;
    float pool = 0.5 + 0.62 * exp(-dot(d.xy, d.xy) / (uPoolR * uPoolR));
    gl_FragColor = vec4(uColor * uI * pool * (1.0 + 3.0 * fresh) + vec3(0.25, 0.18, 0.1) * fresh * 2.0, a);
  }`;

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 200);
  const cue = (name) => CUES[name] - segment.start;
  const DUR = segment.end - segment.start;
  const tR = cue('ramanujan'), tB = cue('ramanBeam'), tC = cue('boseCondensate'), tG = cue('labGlow');
  const lite = ctx.engine?.quality === 'lite';

  scene.environment = ctx.env;
  scene.environmentIntensity = 0.35;
  scene.fog = new THREE.FogExp2(0x04060a, 0.045);

  // ============================================================================== world anchors
  const YU = -0.43;                       // the underline of 1729: the height of the light all the way along
  const ZB = 0.03;                        // beam plane (just proud of the slate's face)
  const FX = 5.9;                         // violet filter
  const FL = V(7.2, YU, ZB);              // flask bulb centre
  const BULB = 0.32;
  const DUMP_X = 8.32;
  const CB = V(13.4, -1.0, ZB);           // condensate plot centre
  const RAIL_Y = YU - 0.62;
  const FLOOR_Y = -2.1;

  // ============================================================================== lights
  const slateKey = new THREE.SpotLight('#dfe9ff', 110, 22, 0.72, 0.9, 1.6);
  slateKey.position.set(-2.8, 4.6, 6.0); slateKey.target.position.set(-0.5, 0.1, 0);
  scene.add(slateKey, slateKey.target);
  const benchKey = new THREE.SpotLight('#d6e2ff', 36, 16, 0.5, 0.9, 1.6);
  benchKey.position.set(6.6, 4.6, 2.4); benchKey.target.position.set(7.4, YU - 0.35, 0);
  scene.add(benchKey, benchKey.target);
  const becKey = new THREE.SpotLight('#cfdcff', 40, 16, 0.42, 0.9, 1.6);
  becKey.position.set(12.7, 4.8, 1.9); becKey.target.position.copy(CB);
  scene.add(becKey, becKey.target);
  const rim = new THREE.DirectionalLight('#8fa8ff', 1.1); rim.position.set(6, 3, -6); scene.add(rim);
  const chalkLight = new THREE.PointLight('#ffe8cc', 0, 2.5, 2); scene.add(chalkLight);
  const violetLight = new THREE.PointLight('#6a4cff', 0, 5, 1.6); violetLight.position.copy(FL); scene.add(violetLight);
  const tipLight = new THREE.PointLight('#ffd49a', 0, 7, 1.6); scene.add(tipLight);

  // ============================================================================== backdrop, floor, dust
  const backdrop = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vD; void main(){
      float h = vD.y;
      vec3 c = mix(vec3(0.010, 0.013, 0.022), vec3(0.002, 0.003, 0.006), smoothstep(0.0, 0.6, h));
      c += vec3(0.020, 0.028, 0.050) * exp(-pow((h + 0.02) * 9.0, 2.0));
      c = mix(c, vec3(0.004, 0.005, 0.008), smoothstep(-0.05, -0.5, h));
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  backdrop.position.set(6, 0, 0);
  scene.add(backdrop);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 64), new THREE.MeshStandardMaterial({ color: '#040507', roughness: 0.62, metalness: 0.2, envMapIntensity: 0.08 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(6, FLOOR_Y, 0); floor.material.userData.noDetail = true;
  scene.add(floor);
  const dustA = new Dust({ count: lite ? 700 : 1400, size: [9, 5, 6], center: [0, 0.3, 1.2], particleSize: 0.011, color: '#dbe6ff', opacity: 0.45, intensity: 1.2, seed: 31 });
  const dustB = new Dust({ count: lite ? 700 : 1400, size: [10, 5, 6], center: [10, 0, 1.0], particleSize: 0.011, color: '#d8deff', opacity: 0.45, intensity: 1.2, seed: 32 });
  scene.add(dustA, dustB);

  // ============================================================================== the slate
  const SW = 7.2, SH = 3.8, SC = V(0, 0.22, -0.04);
  const slateTex = (() => {
    const W = 960, H = 506, c = mkCanvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), R0 = rng(78);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const n = fbm2(u * 5, v * 2.6, 3) * 0.5 + (R0() - 0.5) * 0.12;
      const l = 1 + n * 0.2, i = (y * W + x) * 4;
      img.data[i] = 29 * l; img.data[i + 1] = 34 * l; img.data[i + 2] = 38 * l; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // erasure smudges: broad soft arcs of old chalk dust
    const R = rng(77);
    g.lineCap = 'round';
    // eraser wipes: long, slightly wavy horizontal passes, each a faint haze of chalk dust
    for (let i = 0; i < 34; i++) {
      g.strokeStyle = `rgba(205,214,222,${0.012 + R() * 0.02})`; g.lineWidth = 16 + R() * 26;
      g.shadowColor = 'rgba(205,214,222,0.25)'; g.shadowBlur = 14;
      const x = R() * W - 60, y = R() * H, l = 120 + R() * 380, a = (R() - 0.5) * 0.25;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + l * 0.33, y + Math.sin(a) * l * 0.33 + (R() - 0.5) * 20, x + l * 0.66, y + Math.sin(a) * l * 0.66 + (R() - 0.5) * 20, x + l, y + Math.sin(a) * l);
      g.stroke();
    }
    g.shadowBlur = 0;
    // ghosts of earlier working, half wiped
    g.fillStyle = 'rgba(220,228,235,0.028)';
    const ghosts = ['n = 1, 2, 3 ...', '1 + 2 + 3 + 4 + ...', 'q = e', 'x + 1/x', '1/1 + 1/4 + 1/9', '(1 - q)', '2, 3, 5, 7, 11, 13', 'e', 'k = 0'];
    for (let i = 0; i < 18; i++) { g.font = fnt(16 + R() * 22, true); g.fillText(ghosts[i % ghosts.length], R() * W * 0.9, 30 + R() * (H - 40)); }
    return toTexture(c);
  })();
  const slateMat = new THREE.MeshStandardMaterial({ map: slateTex, roughness: 0.86, metalness: 0, envMapIntensity: 0.22 });
  slateMat.userData.noDetail = true;   // (its own texture carries the stone; the engine's metre-scale grime read as blotches)
  const slate = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, 0.08), slateMat);
  slate.position.copy(SC); scene.add(slate);
  const oak = new THREE.MeshStandardMaterial({ color: '#2b1e15', roughness: 0.55, metalness: 0, envMapIntensity: 0.5 });
  {
    const fw = 0.09, fz = SC.z + 0.01;
    const top = new THREE.Mesh(new THREE.BoxGeometry(SW + fw * 2, fw, 0.13), oak); top.position.set(SC.x, SC.y + SH / 2 + fw / 2, fz);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(SW + fw * 2, fw, 0.13), oak); bot.position.set(SC.x, SC.y - SH / 2 - fw / 2, fz);
    const l = new THREE.Mesh(new THREE.BoxGeometry(fw, SH, 0.13), oak); l.position.set(SC.x - SW / 2 - fw / 2, SC.y, fz);
    const r = new THREE.Mesh(new THREE.BoxGeometry(fw, SH, 0.13), oak); r.position.set(SC.x + SW / 2 + fw / 2, SC.y, fz);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(SW, 0.03, 0.16), oak); ledge.position.set(SC.x, SC.y - SH / 2 - fw - 0.015, SC.z + 0.09);
    scene.add(top, bot, l, r, ledge);
    const chalkMat = new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.95 });
    [[-1.2, 0.3], [-1.05, -0.2], [2.3, 0.1]].forEach(([x, a]) => {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, x > 0 ? 0.07 : 0.11, 12), chalkMat);
      s.rotation.set(0, a, Math.PI / 2); s.position.set(x, ledge.position.y + 0.03, ledge.position.z); scene.add(s);
    });
  }

  const chalkPlanes = [];
  function chalkPlane(c, em, S, { x, y, align = 'center', t0, t1, intensity = 1.0, head = true, z = 0.004 }) {
    const k = em / S, w = c.width * k, h = c.height * k;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: toTexture(c) }, uReveal: { value: 0 }, uSoft: { value: 0.025 }, uI: { value: intensity }, uOp: { value: 1 }, uColor: { value: new THREE.Color(CHALK) }, uPool: { value: V(-0.4, 0.0, 0) }, uPoolR: { value: 3.0 } },
      vertexShader: chalkVert, fragmentShader: chalkFrag, transparent: true, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(align === 'left' ? x + w / 2 : x, y, z);
    m.renderOrder = 3;
    scene.add(m);
    const sp = head ? glowSprite({ color: '#fff1dc', intensity: 1.5, scale: em * 0.5 }) : null;
    if (sp) scene.add(sp);
    const o = { m, mat, w, h, t0, t1, sp, em };
    chalkPlanes.push(o);
    return o;
  }

  // 1729 = 1³ + 12³ = 9³ + 10³
  {
    const S = 150;
    const runs = [['1729 = 1'], ['3', 'sup'], [' + 12'], ['3', 'sup'], [' = 9'], ['3', 'sup'], [' + 10'], ['3', 'sup']];
    const c = chalkCanvas(Math.round(S * 1.6), (g) => runsDraw(g, runs, 30, S * 1.12, S), 11);
    chalkPlane(c, 0.27, S, { x: 0.12, y: -0.1, t0: tR - 0.08, t1: tR + 0.55, intensity: 1.05 });
  }
  // the underline (chalk, then it lifts off as light)
  const UL_X0 = -1.45, UL_X1 = 1.7;
  {
    const S = 100, len = (UL_X1 - UL_X0) / 0.1 * S;
    const c = chalkCanvas(60, (g) => { g.lineWidth = 7; g.beginPath(); g.moveTo(20, 34); for (let x = 20; x <= len; x += 12) g.lineTo(x, 34 + Math.sin(x * 0.011) * 3 - (x / len) * 4); g.stroke(); return len; }, 12);
    chalkPlane(c, 0.1, S, { x: UL_X0 - 0.02, y: YU, align: 'left', t0: tR + 0.58, t1: tR + 0.7, intensity: 1.0 });
  }
  // 1729 = 7 · 13 · 19 and the reason it is famous
  {
    const S = 120;
    const c = chalkCanvas(Math.round(S * 1.5), (g) => runsDraw(g, [['1729 = 7 · 13 · 19']], 30, S * 1.05, S), 13);
    chalkPlane(c, 0.1, S, { x: -0.3, y: -0.62, t0: tR + 0.25, t1: tR + 0.6, intensity: 0.85, head: false });
    const c2 = chalkCanvas(Math.round(S * 1.5), (g) => runsDraw(g, [['the smallest sum of two cubes in two ways', 'i']], 30, S * 1.05, S), 14);
    chalkPlane(c2, 0.088, S, { x: 1.5, y: -0.62, t0: tR + 0.35, t1: tR + 0.85, intensity: 0.8, head: false });
  }
  // 1/π = (2√2 / 9801) Σ_{k=0}^{∞} (4k)! (1103 + 26390k) / ((k!)⁴ 396^{4k})   (Ramanujan, 1914)
  {
    const S = 100, F = S * 0.82, H = Math.round(S * 2.9), AX = H * 0.5;
    const c = chalkCanvas(H, (g) => {
      let x = 30;
      const bar = (x0, w) => strokePath(g, [[x0, AX], [x0 + w, AX]], S * 0.045);
      // 1 / π
      g.font = fnt(F); const w1 = g.measureText('1').width, wp = F * 0.62, b1 = Math.max(w1, wp) + F * 0.3;
      runsDraw(g, [['1']], x + (b1 - w1) / 2, AX - F * 0.2, F); drawPi(g, x + (b1 - wp) / 2, AX + F * 0.78, F); bar(x, b1); x += b1 + S * 0.22;
      g.font = fnt(S); runsDraw(g, [['=']], x, AX + S * 0.24, S); x += g.measureText('=').width + S * 0.22;
      // 2√2 / 9801
      g.font = fnt(F); const w2 = g.measureText('2').width, w9 = g.measureText('9801').width;
      const wn = w2 + F * 0.46 + w2, b2 = Math.max(wn, w9) + F * 0.3;
      let nx = x + (b2 - wn) / 2;
      runsDraw(g, [['2']], nx, AX - F * 0.2, F); nx += w2 + F * 0.02;
      nx = drawSqrt(g, nx, AX - F * 0.2, F, w2); runsDraw(g, [['2']], nx + F * 0.02, AX - F * 0.2, F);
      runsDraw(g, [['9801']], x + (b2 - w9) / 2, AX + F * 0.85, F); bar(x, b2); x += b2 + S * 0.18;
      // Σ with its limits
      const cx = x + S * 0.45;
      drawSigma(g, cx, AX, S);
      drawInfinity(g, cx, AX - S * 0.98, S * 0.42);
      const lim = [['k', 'i'], ['=0']], wl = runsWidth(g, lim, S * 0.42);
      runsDraw(g, lim, cx - wl / 2, AX + S * 1.08, S * 0.42);
      x += S * 1.05;
      // (4k)! (1103 + 26390k) / ((k!)⁴ 396^{4k})
      const num = [['(4'], ['k', 'i'], [')! (1103 + 26390'], ['k', 'i'], [')']];
      const den = [['('], ['k', 'i'], ['!)'], ['4', 'sup'], [' 396'], ['4', 'sup'], ['k', 'supi']];
      const wN = runsWidth(g, num, F), wD = runsWidth(g, den, F), b3 = Math.max(wN, wD) + F * 0.3;
      runsDraw(g, num, x + (b3 - wN) / 2, AX - F * 0.22, F);
      runsDraw(g, den, x + (b3 - wD) / 2, AX + F * 0.9, F);
      bar(x, b3);
      return x + b3;
    }, 15);
    chalkPlane(c, 0.115, S, { x: -2.2, y: 0.32, t0: tR - 0.75, t1: tR + 0.3, intensity: 0.95 });
  }
  // partitions: p(n) with Ramanujan's congruence p(5k+4) ≡ 0 (mod 5) circled, and the Ferrers staircase of p(5) = 7
  {
    const S = 100;
    const ring = (g, x0, x1, y) => { g.lineWidth = S * 0.035; g.beginPath(); g.ellipse((x0 + x1) / 2, y - S * 0.3, (x1 - x0) / 2 + S * 0.16, S * 0.46, -0.06, 0.2, TAU + 0.5); g.stroke(); };
    const seq = (g, items, x, y, hot) => {
      items.forEach((n, i) => {
        g.font = fnt(S); const s = String(n), w = g.measureText(s).width;
        runsDraw(g, [[s]], x, y, S);
        if (hot.includes(n)) ring(g, x, x + w, y);
        x += w;
        if (i < items.length - 1 || items.length > 9) { runsDraw(g, [[', ']], x, y, S); g.font = fnt(S); x += g.measureText(', ').width; }
      });
      return x;
    };
    const c1 = chalkCanvas(Math.round(S * 1.7), (g) => { let x = runsDraw(g, [['p', 'i'], ['('], ['n', 'i'], [') :  ']], 30, S * 1.15, S); return seq(g, [1, 1, 2, 3, 5, 7, 11, 15, 22, 30], x, S * 1.15, [5, 30]); }, 16);
    chalkPlane(c1, 0.085, S, { x: 1.95, y: 0.62, align: 'left', t0: tR - 0.1, t1: tR + 0.4, intensity: 0.9 });
    const c2 = chalkCanvas(Math.round(S * 1.7), (g) => { const x = seq(g, [42, 56, 77, 101, 135, 176, 231, 297, 385, 490], 30 + S * 1.2, S * 1.15, [135, 490]); return runsDraw(g, [['...']], x, S * 1.15, S); }, 17);
    chalkPlane(c2, 0.085, S, { x: 1.95, y: 0.47, align: 'left', t0: tR + 0.3, t1: tR + 0.7, intensity: 0.9 });
    const c3 = chalkCanvas(Math.round(S * 1.7), (g) => {
      let x = runsDraw(g, [['p', 'i'], ['(5'], ['k', 'i'], [' + 4)  ']], 30 + S * 1.2, S * 1.15, S);
      x = drawEquiv(g, x, S * 1.15, S);
      return runsDraw(g, [['  0  (mod 5)']], x, S * 1.15, S);
    }, 18);
    chalkPlane(c3, 0.085, S, { x: 1.95, y: 0.3, align: 'left', t0: tR + 0.5, t1: tR + 0.85, intensity: 0.95 });
    const parts = [[5], [4, 1], [3, 2], [3, 1, 1], [2, 2, 1], [2, 1, 1, 1], [1, 1, 1, 1, 1]];
    const c4 = chalkCanvas(Math.round(S * 1.9), (g) => {
      const d = S * 0.26; let x = 30;
      g.shadowBlur = 0;
      parts.forEach((p) => {
        p.forEach((n, r) => { for (let k = 0; k < n; k++) { g.beginPath(); g.arc(x + k * d + d / 2, 22 + r * d + d / 2, d * 0.27, 0, TAU); g.fill(); } });
        x += Math.max(...p) * d + S * 0.38;
      });
      return runsDraw(g, [['  '], ['p', 'i'], ['(5) = 7']], x, S * 1.0, S);
    }, 19);
    chalkPlane(c4, 0.12, S, { x: -3.2, y: -0.42, align: 'left', t0: tR - 0.7, t1: tR + 0.25, intensity: 0.85 });
  }

  // ============================================================================== the beam
  const beamPts = [V(UL_X1, YU, ZB), V(FX, YU, ZB), V(FL.x - BULB, YU, ZB), V(FL.x + BULB, YU, ZB), V(DUMP_X - 0.06, YU, ZB)];
  const VIOLET = specRGB(LAM0);   // the 435.8 nm line
  const tube = (a, b, r, col, I, op = 1) => { const m = progressTube(new THREE.LineCurve3(a, b), { radius: r, segments: 48, radial: 8, color: col, intensity: I, opacity: op }); scene.add(m); return m; };
  const segs = [
    { core: tube(beamPts[0], beamPts[1], 0.0075, '#fff4e4', 3.4), halo: tube(beamPts[0], beamPts[1], 0.032, '#ffeedd', 0.2, 0.5) },
    { core: tube(beamPts[1], beamPts[2], 0.0075, VIOLET.clone().lerp(new THREE.Color(1, 1, 1), 0.25), 4.0), halo: tube(beamPts[1], beamPts[2], 0.034, VIOLET, 0.35, 0.6) },
    { core: tube(beamPts[2], beamPts[3], 0.011, VIOLET.clone().lerp(new THREE.Color(1, 1, 1), 0.35), 5.5), halo: tube(beamPts[2], beamPts[3], 0.05, VIOLET, 0.6, 0.7) },
    { core: tube(beamPts[3], beamPts[4], 0.0065, VIOLET.clone().lerp(new THREE.Color(1, 1, 1), 0.2), 2.6), halo: tube(beamPts[3], beamPts[4], 0.03, VIOLET, 0.22, 0.5) },
  ];
  // the light front: chalk end of the underline (t = tR + 0.7) → filter → flask entry exactly on ramanBeam → beam dump
  const FRONT = [[tR + 0.68, UL_X1], [tB - 0.08, FX], [tB, FL.x - BULB], [tB + 0.1, DUMP_X]];
  const frontX = (t) => {
    if (t <= FRONT[0][0]) return -Infinity;
    for (let i = 1; i < FRONT.length; i++) if (t <= FRONT[i][0]) return lerp(FRONT[i - 1][1], FRONT[i][1], (t - FRONT[i - 1][0]) / (FRONT[i][0] - FRONT[i - 1][0]));
    return DUMP_X + 1;
  };
  const frontGlow = glowSprite({ color: '#ffffff', intensity: 3, scale: 0.35 }); scene.add(frontGlow);
  const WHITE_HOT = new THREE.Color(1, 0.96, 0.9);

  // ============================================================================== the optical bench
  const anod = new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.35, metalness: 0.85, envMapIntensity: 0.9 });
  const steelM = new THREE.MeshStandardMaterial({ color: '#b9c1cc', roughness: 0.25, metalness: 1, envMapIntensity: 1.0 });
  const bench = new THREE.Group(); scene.add(bench);
  {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.06, 0.14), anod); rail.position.set(7.0, RAIL_Y, ZB); bench.add(rail);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.006, 0.03), steelM); groove.position.set(7.0, RAIL_Y + 0.032, ZB); bench.add(groove);
    for (const sx of [5.15, 8.85]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, RAIL_Y - FLOOR_Y, 16), anod); leg.position.set(sx, (RAIL_Y + FLOOR_Y) / 2, ZB); bench.add(leg); const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.03, 32), anod); ft.position.set(sx, FLOOR_Y + 0.015, ZB); bench.add(ft); }
    const carrier = (x, topY) => {
      const cr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.18), anod); cr.position.set(x, RAIL_Y + 0.06, ZB); bench.add(cr);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), steelM); knob.rotation.x = Math.PI / 2; knob.position.set(x, RAIL_Y + 0.06, ZB + 0.11); bench.add(knob);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, topY - RAIL_Y - 0.09, 12), steelM); post.position.set(x, (topY + RAIL_Y + 0.09) / 2, ZB); bench.add(post);
    };
    carrier(FX, YU - 0.19); carrier(FL.x, FL.y - BULB - 0.04); carrier(DUMP_X, YU - 0.07);
    // flask ring support
    const ringS = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 8, 48), steelM); ringS.rotation.x = Math.PI / 2; ringS.position.set(FL.x, FL.y - BULB + 0.05, ZB); bench.add(ringS);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.17, 8), steelM); arm.rotation.z = Math.PI / 2; arm.position.set(FL.x - 0.085, FL.y - BULB + 0.05, ZB); bench.add(arm);
    // beam dump: a black cylinder with a hot spot
    const dump = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 24), anod); dump.rotation.z = Math.PI / 2; dump.position.set(DUMP_X, YU, ZB); bench.add(dump);
  }
  // filter: violet glass disc in a ring mount
  const filterMat = new THREE.MeshStandardMaterial({ color: '#2a1470', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85, emissive: VIOLET.clone(), emissiveIntensity: 0.15, envMapIntensity: 1.6 });
  const filter = new THREE.Group(); filter.position.set(FX, YU, ZB); scene.add(filter);
  {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.018, 48), filterMat); disc.rotation.z = Math.PI / 2; filter.add(disc);
    const mount = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 12, 64), anod); mount.rotation.y = Math.PI / 2; filter.add(mount);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12), anod); stem.position.y = -0.18; filter.add(stem);
  }
  const filterGlow = glowSprite({ color: VIOLET.clone().lerp(new THREE.Color(1, 1, 1), 0.3), intensity: 1.2, scale: 0.3 }); filterGlow.position.set(FX, YU, ZB); scene.add(filterGlow);
  const dumpGlow = glowSprite({ color: VIOLET.clone(), intensity: 1.4, scale: 0.22 }); dumpGlow.position.set(DUMP_X - 0.07, YU, ZB); scene.add(dumpGlow);

  // flask: lathe-turned round-bottom flask; additive glass shading (fresnel sheen + speculars), liquid with a
  // volumetric beam track (ray-to-beam distance) and the faint violet glow of light scattered in every direction
  const flask = new THREE.Group(); flask.position.copy(FL); scene.add(flask);
  const NECK = 0.075;
  const outerPts = [];
  {
    const a0 = Math.asin(NECK / BULB);
    for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + (i / 40) * (Math.PI - a0 - 0.0001); outerPts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * BULB), Math.sin(a) * BULB)); }
    const yN = Math.sqrt(BULB * BULB - NECK * NECK);
    outerPts.push(new THREE.Vector2(NECK, yN + 0.05), new THREE.Vector2(NECK, 0.72), new THREE.Vector2(NECK + 0.018, 0.735), new THREE.Vector2(NECK + 0.016, 0.75), new THREE.Vector2(NECK - 0.006, 0.75));
  }
  const keyDir = V(-0.4, 0.75, 0.55).normalize();
  const glassMat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 1 }, uKey: { value: keyDir }, uBeam: { value: 0 }, uViolet: { value: VIOLET.clone() } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uO, uBeam; uniform vec3 uKey, uViolet; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){
        vec3 N = normalize(vN), Vd = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float mu = abs(dot(N, Vd));
        float F = 0.04 + 0.96 * pow(1.0 - mu, 4.0);
        vec3 R = reflect(-Vd, N);
        vec3 env = mix(vec3(0.03, 0.035, 0.05), vec3(0.42, 0.48, 0.6), smoothstep(-0.1, 0.9, R.y));
        float spec = pow(max(0.0, dot(R, uKey)), 160.0) * 3.0 + pow(max(0.0, dot(R, normalize(vec3(0.7, 0.4, -0.6)))), 90.0) * 1.2;
        float near = exp(-length(vL.yz) * 7.0);
        vec3 col = env * F * 0.85 + vec3(0.92, 0.96, 1.0) * spec * (0.3 + F) + uViolet * uBeam * (F * 0.5 + near * 0.25);
        gl_FragColor = vec4(col * uO, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const flaskGlass = new THREE.Mesh(new THREE.LatheGeometry(outerPts, 64), glassMat); flaskGlass.renderOrder = 4; flask.add(flaskGlass);
  const LIQ = 0.13;
  const liqPts = [];
  {
    const r = BULB - 0.012, aTop = Math.asin(LIQ / r);
    for (let i = 0; i <= 30; i++) { const a = -Math.PI / 2 + (i / 30) * (aTop + Math.PI / 2); liqPts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), Math.sin(a) * r)); }
    liqPts.push(new THREE.Vector2(0.001, LIQ));
  }
  const liqU = { uBeam: { value: 0 }, uViolet: { value: VIOLET.clone() }, uA: { value: V(FL.x - BULB, FL.y, FL.z) }, uB: { value: V(FL.x + BULB, FL.y, FL.z) }, uTime: { value: 0 } };
  const liqMat = new THREE.ShaderMaterial({
    uniforms: liqU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uBeam, uTime; uniform vec3 uViolet, uA, uB; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 ro = cameraPosition, rd = normalize(vW - cameraPosition);
        vec3 u = uB - uA, w0 = ro - uA;
        float a = dot(rd, rd), b = dot(rd, u), c = dot(u, u), d = dot(rd, w0), e = dot(u, w0);
        float den = a * c - b * b;
        float sc = (b * e - c * d) / den, tc = clamp((a * e - b * d) / den, 0.0, 1.0);
        vec3 p1 = ro + rd * sc, p2 = uA + u * tc;
        float dist = length(p1 - p2);
        float track = exp(-dist * dist / 0.0009) * 1.4 + exp(-dist * 9.0) * 0.35;
        float mu = abs(dot(normalize(vN), -rd));
        float F = pow(1.0 - mu, 3.0);
        vec3 tint = vec3(0.012, 0.016, 0.026) + vec3(0.06, 0.08, 0.12) * F;
        float flick = 0.9 + 0.1 * sin(uTime * 31.0 + tc * 20.0);
        vec3 col = tint + uViolet * uBeam * (track * flick + 0.07 + F * 0.15);
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqPts, 64), liqMat); liquid.renderOrder = 3; flask.add(liquid);

  // scattered photons: emitted all along the beam's path in the liquid, in every direction. Most keep the
  // beam's colour (Rayleigh); a few come out shifted (Raman): Stokes to longer wavelengths, rarely anti-Stokes.
  const ptsVert = /* glsl */ `
    attribute vec4 aO; attribute vec4 aD; attribute vec3 aCol;
    uniform float uT, uViewport, uSize, uFade;
    varying vec3 vCol; varying float vA;
    void main(){
      float te = aO.w, age = uT - te;
      vec3 p = vec3(aO.x, aO.y, aO.z) + aD.xyz * max(age, 0.0) * aD.w;
      float dist = max(age, 0.0) * aD.w;
      vA = step(0.0, age) * (1.0 - smoothstep(0.5, 1.6, dist)) * uFade;
      vCol = aCol;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = uSize * (0.6 + 0.8 * fract(te * 91.7)) * (aCol.g > 0.25 ? 1.25 : 1.0) * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
    }`;
  const ptsFrag = /* glsl */ `varying vec3 vCol; varying float vA; uniform float uI;
    void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * uI, a); }`;
  const NPH = lite ? 900 : 1800;
  const phU = { uT: { value: 0 }, uViewport: { value: 800 }, uSize: { value: 0.022 }, uFade: { value: 1 }, uI: { value: 2.6 } };
  const photons = (() => {
    const R = rng(404), aO = new Float32Array(NPH * 4), aD = new Float32Array(NPH * 4), col = new Float32Array(NPH * 3);
    const cols = LINES.map((l) => specRGB(l.lam));
    for (let i = 0; i < NPH; i++) {
      const x = FL.x - BULB * 0.85 + R() * BULB * 1.7;
      aO.set([x, FL.y, FL.z, tB + 0.02 + Math.pow(R(), 0.8) * 0.85], i * 4);
      const u = R() * 2 - 1, th = R() * TAU, s = Math.sqrt(1 - u * u);
      aD.set([s * Math.cos(th), u, s * Math.sin(th), 0.9 + R() * 1.4], i * 4);
      const q = R(), k = q < 0.93 ? 0 : q < 0.965 ? 1 : q < 0.99 ? 2 : 3;
      const c = cols[k]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NPH * 3), 3));
    g.setAttribute('aO', new THREE.BufferAttribute(aO, 4)); g.setAttribute('aD', new THREE.BufferAttribute(aD, 4)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: phU, vertexShader: ptsVert, fragmentShader: ptsFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.frustumCulled = false; scene.add(m);
    return m;
  })();

  // spectrum plate: the photographic strip (as on Raman's spectrograms) and a spectrometer trace above it
  const PLATE_W = 1.36, PLATE_H = 0.58;
  const plate = new THREE.Group(); plate.position.set(8.5, -0.74, 0.38); plate.rotation.y = -0.36; scene.add(plate);
  const lx = (lam) => (lam - LAM_A) / (LAM_B - LAM_A);
  const plateU = {
    uL: { value: LINES.map((l) => l.lam) }, uAmp: { value: LINES.map((l) => l.amp) }, uLit: { value: [0, 0, 0, 0] },
    uSweep: { value: 0 }, uO: { value: 0 }, uTime: { value: 0 },
  };
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(PLATE_W, PLATE_H), new THREE.ShaderMaterial({
    uniforms: plateU,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_SPEC + /* glsl */ `
      uniform float uL[4], uAmp[4], uLit[4], uSweep, uO, uTime; varying vec2 vUv;
      float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      void main(){
        vec2 uv = vUv;
        float lam = mix(${LAM_A.toFixed(1)}, ${LAM_B.toFixed(1)}, uv.x);
        vec3 col = vec3(0.006, 0.008, 0.014);
        float a = 0.78;
        // frame
        vec2 e = min(uv, 1.0 - uv) * vec2(${PLATE_W.toFixed(2)}, ${PLATE_H.toFixed(2)});
        float fr = smoothstep(0.006, 0.0, abs(min(e.x, e.y) - 0.012));
        col += vec3(0.5, 0.6, 0.8) * fr * 0.35;
        // strip
        float sy = smoothstep(0.1, 0.115, uv.y) * smoothstep(0.34, 0.325, uv.y);
        vec3 strip = specCol(lam) * 0.03;
        for (int i = 0; i < 4; i++) { float d = (lam - uL[i]) / 0.75; strip += specCol(uL[i]) * exp(-d * d) * uLit[i] * (i == 0 ? 3.2 : 1.6 + uAmp[i] * 6.0); }
        col += strip * sy;
        // ticks every 10 nm, long at 420 / 460 / 500
        float tk = mod(lam + 0.0001, 10.0);
        float tkd = min(tk, 10.0 - tk) / (${(LAM_B - LAM_A).toFixed(1)} / ${PLATE_W.toFixed(2)});
        float major = step(abs(mod(lam - 420.0 + 20.0, 40.0) - 20.0), 5.0);
        float tkm = smoothstep(0.003, 0.0, tkd) * step(uv.y, 0.09) * step(mix(0.065, 0.035, major), uv.y);
        col += vec3(0.55, 0.62, 0.75) * tkm * 0.6;
        // trace
        float y0 = 0.44, f = 0.006 * hash(floor(lam * 4.0) + floor(uTime * 24.0));
        for (int i = 0; i < 4; i++) { float d = (lam - uL[i]) / 1.4; f += uAmp[i] * exp(-d * d) * uLit[i]; }
        float yc = y0 + 0.47 * f;
        float g = uv.y - yc;
        float px = abs(g) / max(length(vec2(dFdx(g), dFdy(g))), 1e-5);
        float on = step(uv.x, uSweep);
        float line = (1.0 - smoothstep(0.6, 1.8, px)) * on;
        float lead = exp(-pow((uv.x - uSweep) * 60.0, 2.0)) * step(y0, uv.y) * step(uv.y, 0.93);
        vec3 lc = mix(vec3(0.75, 0.85, 1.0), specCol(lam), 0.65);
        col += lc * line * 1.6 + specCol(lam) * step(uv.y, yc) * step(y0, uv.y) * on * 0.1 + vec3(0.6, 0.7, 1.0) * lead * 0.25;
        col += vec3(0.4, 0.5, 0.7) * smoothstep(0.004, 0.0, abs(uv.y - y0)) * 0.35 * step(0.03, uv.x) * step(uv.x, 0.97);
        gl_FragColor = vec4(col * uO, a * uO);
      }`,
    transparent: true, depthWrite: false,
  }));
  plate.add(plateMesh);
  const plateTitle = new TextPlane('SPECTRUM OF THE SCATTERED LIGHT', { font: FONTS.mono, height: 0.032, letterSpacing: 0.22, color: HUD_COL, intensity: 1.0, align: 'left' });
  plateTitle.position.set(-PLATE_W / 2 + plateTitle.worldWidth / 2 + 0.01, PLATE_H / 2 + 0.05, 0.002); plate.add(plateTitle);
  const tickLabels = [420, 460, 500].map((n) => {
    const tp = new TextPlane(`${n}`, { font: FONTS.mono, height: 0.026, letterSpacing: 0.1, color: HUD_COL, intensity: 0.8 });
    tp.position.set((lx(n) - 0.5) * PLATE_W, -PLATE_H / 2 - 0.035, 0.002); plate.add(tp); return tp;
  });
  const nmLabel = new TextPlane('nm', { font: FONTS.mono, height: 0.026, letterSpacing: 0.1, color: HUD_COL, intensity: 0.8 });
  nmLabel.position.set(PLATE_W / 2 - 0.06, -PLATE_H / 2 - 0.035, 0.002); plate.add(nmLabel);
  const lineLabel = (txt, sub, lam, y, dx) => {
    const c = new Callout(txt, { dx, dy: 0.1, size: 0.034, color: '#e6ecff', sub, intensity: 1.2 });
    c.position.set((lx(lam) - 0.5) * PLATE_W, y, 0.004); plate.add(c); return c;
  };
  const yPeak = (amp) => -PLATE_H / 2 + (0.44 + 0.47 * amp) * PLATE_H;
  const calRay = lineLabel('RAYLEIGH', 'SAME COLOUR', LAM0, yPeak(1) - 0.02, -0.18);
  const calRam = lineLabel('RAMAN', 'NEW COLOURS', LINES[1].lam, yPeak(LINES[1].amp) + 0.01, 0.2);

  // ============================================================================== the condensate
  const GLSL_BEC = /* glsl */ `
    uniform float uTh, uSig, uC, uCx, uCz;
    float becH(vec2 p){
      float th = uTh * exp(-dot(p, p) / (2.0 * uSig * uSig));
      vec2 q = vec2(p.x / uCx, p.y / uCz);
      float tf = max(0.0, 1.0 - dot(q, q));
      return th + uC * pow(tf, 1.5);
    }`;
  const becU = { uTh: { value: 0.36 }, uSig: { value: 0.62 }, uC: { value: 0 }, uCx: { value: 0.25 }, uCz: { value: 0.36 }, uO: { value: 1 }, uGlow: { value: 0 }, uRing: { value: 0 } };
  const PEAK = 0.78;
  const L = 3.4, NSEG = lite ? 96 : 140;
  const surfGeo = new THREE.PlaneGeometry(2, 2, NSEG, NSEG);
  surfGeo.rotateX(-Math.PI / 2);
  { const p = surfGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 1.55) * L / 2, 0, Math.sign(z) * Math.pow(Math.abs(z), 1.55) * L / 2); } }
  const surface = new THREE.Mesh(surfGeo, new THREE.ShaderMaterial({
    uniforms: becU,
    vertexShader: GLSL_BEC + /* glsl */ `varying vec2 vP; varying float vH; varying vec3 vN; varying vec3 vW;
      void main(){
        vec2 p = position.xz; float h = becH(p);
        float e = 0.01;
        vec3 n = normalize(vec3(-(becH(p + vec2(e, 0.0)) - becH(p - vec2(e, 0.0))) / (2.0 * e), 1.0, -(becH(p + vec2(0.0, e)) - becH(p - vec2(0.0, e))) / (2.0 * e)));
        vP = p; vH = h; vN = normalize(mat3(modelMatrix) * n);
        vec4 w = modelMatrix * vec4(p.x, h, p.y, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `uniform float uO, uGlow, uRing, uC; varying vec2 vP; varying float vH; varying vec3 vN; varying vec3 vW;
      vec3 ramp4(float h){
        vec3 c0 = vec3(0.025, 0.03, 0.16), c1 = vec3(0.08, 0.32, 0.9), c2 = vec3(0.4, 0.58, 0.9), c3 = vec3(1.05, 0.68, 0.3);
        return h < 0.22 ? mix(c0, c1, h / 0.22) : h < 0.55 ? mix(c1, c2, (h - 0.22) / 0.33) : mix(c2, c3, clamp((h - 0.55) / 0.4, 0.0, 1.0));
      }
      void main(){
        float r = length(vP);
        float hn = vH / 0.95;
        vec3 base = ramp4(hn);
        vec3 N = normalize(vN), Vd = normalize(cameraPosition - vW);
        float dif = 0.45 + 0.55 * max(0.0, dot(N, normalize(vec3(-0.4, 0.9, 0.5))));
        float rimF = pow(1.0 - abs(dot(N, Vd)), 3.0);
        vec2 gq = vP / 0.1;
        vec2 gd = abs(fract(gq - 0.5) - 0.5) / fwidth(gq);
        float grid = 1.0 - smoothstep(0.4, 1.4, min(gd.x, gd.y));
        float ring = exp(-pow((r - uRing) * 18.0, 2.0)) * step(0.01, uRing) * (1.0 - smoothstep(0.6, 1.7, uRing));
        vec3 col = base * (dif * 0.42 + 0.4 * smoothstep(0.35, 0.9, hn)) + base * grid * (1.15 - 0.3 * smoothstep(0.4, 0.9, hn)) + base * rimF * 0.5 + vec3(1.6, 1.25, 0.7) * ring * 1.5;
        col *= 1.0 + uGlow * 0.6 * smoothstep(0.6, 1.0, hn);
        float a = min(1.0, 0.6 + 0.4 * grid + 0.3 * smoothstep(0.3, 0.8, hn)) * smoothstep(1.7, 1.15, r) * uO;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, side: THREE.DoubleSide, depthWrite: true,
  }));
  surface.position.copy(CB).add(V(0, 0.012, 0)); surface.renderOrder = 2; surface.frustumCulled = false;
  scene.add(surface);
  // the plot's platform: a dark disc with a brushed rim, axes and tick marks
  const becRig = new THREE.Group(); scene.add(becRig);
  {
    const platMat = new THREE.MeshStandardMaterial({ color: '#0a0c11', roughness: 0.48, metalness: 0.5, envMapIntensity: 0.4 });
    platMat.userData.detail = { albedo: 0.04, rough: 0.25, grime: 0.03, scratch: 0.15, scale: 4 };
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.9, 0.06, 96), platMat);
    plat.position.copy(CB).add(V(0, -0.03, 0)); becRig.add(plat);
    const rimR = new THREE.Mesh(new THREE.TorusGeometry(1.875, 0.012, 8, 160), steelM); rimR.rotation.x = Math.PI / 2; rimR.position.copy(CB); becRig.add(rimR);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, CB.y - FLOOR_Y, 32), anod); stand.position.set(CB.x, (CB.y + FLOOR_Y) / 2 - 0.03, CB.z); becRig.add(stand);
    const ax = [], y = CB.y + 0.004;
    ax.push([V(CB.x - 1.65, y, CB.z), V(CB.x + 1.65, y, CB.z)], [V(CB.x, y, CB.z - 1.65), V(CB.x, y, CB.z + 1.65)]);
    for (let i = -6; i <= 6; i++) { if (!i) continue; const d = i * 0.25; ax.push([V(CB.x + d, y, CB.z - 0.04), V(CB.x + d, y, CB.z + 0.04)], [V(CB.x - 0.04, y, CB.z + d), V(CB.x + 0.04, y, CB.z + d)]); }
    const axes = segmentsLine(ax, { color: '#9fb6e6', intensity: 0.7, opacity: 0.6, stagger: 0 });
    becRig.add(axes);
  }
  const axisLabel = new TextPlane('VELOCITY DISTRIBUTION', { font: FONTS.mono, height: 0.045, letterSpacing: 0.25, color: HUD_COL, intensity: 0.85 });
  axisLabel.rotation.x = -Math.PI / 2; axisLabel.position.set(CB.x, CB.y + 0.006, CB.z + 1.55); scene.add(axisLabel);

  // the bosons: identical particles sampled on the distribution. They arrive as a stream from the flask, jitter
  // hot, slow as the gas cools, most fall into the narrow peak (all taking one colour), then all into its tip.
  const NB = lite ? 2600 : 5200;
  const bU = {
    uT: { value: 0 }, uPh: { value: 0 }, uAmp: { value: 0.16 }, uViewport: { value: 800 }, uSize: { value: 0.032 },
    uCB: { value: CB.clone() }, uFL: { value: V(FL.x + 2.4, FL.y + 0.5, FL.z) }, uTip: { value: V(0, 0, 0) }, uSigScale: { value: 1 },
    uStream0: { value: tB + 0.5 }, uCond0: { value: tC + 0.02 }, uGlow0: { value: tG - 0.05 }, uI: { value: 1.6 },
    uTh: becU.uTh, uSig: becU.uSig, uC: becU.uC, uCx: becU.uCx, uCz: becU.uCz,
  };
  const bosons = (() => {
    const R = rng(1924), aA = new Float32Array(NB * 4), aB = new Float32Array(NB * 4), col = new Float32Array(NB * 3);
    const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-6, R()))) * Math.cos(TAU * R());
    const pal = [specRGB(430), specRGB(445), specRGB(460), specRGB(480), specRGB(500), specRGB(520)];
    for (let i = 0; i < NB; i++) {
      let gx = gauss() * 0.55, gz = gauss() * 0.55;
      const rr = Math.hypot(gx, gz); if (rr > 1.45) { gx *= 1.45 / rr; gz *= 1.45 / rr; }
      const u = Math.sqrt(R()), a = R() * TAU;
      aA.set([gx, gz, R(), R()], i * 4);
      aB.set([Math.cos(a) * u * 0.2, Math.sin(a) * u * 0.3, R(), R()], i * 4);
      const c = pal[Math.floor(R() * pal.length)]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(aA, 4)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: bU,
      vertexShader: GLSL_BEC + /* glsl */ `
        attribute vec4 aA; attribute vec4 aB; attribute vec3 aCol;
        uniform float uT, uPh, uAmp, uViewport, uSize, uStream0, uCond0, uGlow0, uSigScale;
        uniform vec3 uCB, uFL, uTip;
        varying vec3 vCol; varying float vA;
        void main(){
          float s = aA.z, s2 = aA.w;
          vec2 g = aA.xy * uSigScale + uAmp * vec2(sin(uPh * (2.6 + s * 4.0) + s * 40.0), cos(uPh * (2.2 + s2 * 3.6) + s2 * 23.0));
          float cf = step(s2, 0.8);
          float c = clamp((uT - uCond0 - s2 * 0.5) / 0.3, 0.0, 1.0); c = c * c * (3.0 - 2.0 * c) * cf;
          vec2 p = mix(g, aB.xy, c);
          float h = becH(p);
          vec3 pos = uCB + vec3(p.x, h + 0.015 + (1.0 - c) * 0.05 * aB.z, p.y);
          // arrival: an arc from the flask
          float ar = clamp((uT - uStream0 - s * 0.25) / 0.4, 0.0, 1.0); float arE = ar * ar * (3.0 - 2.0 * ar);
          vec3 src = uFL + (vec3(s, s2, aB.z) - 0.5) * vec3(0.2, 0.3, 0.2);
          vec3 mid = mix(src, pos, 0.5) + vec3(0.0, 0.9 + s2 * 0.6, (aB.w - 0.5) * 1.4);
          vec3 q = mix(mix(src, mid, arE), mix(mid, pos, arE), arE);
          // the flash: everything falls into the tip
          float k = clamp((uT - uGlow0 - s * 0.28) / 0.42, 0.0, 1.0); k = k * k * k;
          q = mix(q, uTip, k);
          vCol = mix(aCol, vec3(1.0, 0.78, 0.48) * 0.5, c) * (1.0 + k * 2.0);
          vA = smoothstep(0.0, 0.35, ar) * (1.0 - smoothstep(0.85, 1.0, k));
          vec4 mv = modelViewMatrix * vec4(q, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (0.6 + 0.8 * aB.w) * (1.0 - 0.5 * c) * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
        }`,
      fragmentShader: /* glsl */ `varying vec3 vCol; varying float vA; uniform float uI;
        void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * uI, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.frustumCulled = false; scene.add(m);
    return m;
  })();
  // the flash point
  const tipGlow = glowSprite({ color: '#fff0d6', intensity: 3, scale: 0.4 }); scene.add(tipGlow);
  const tipCore = glowSprite({ color: '#ffffff', intensity: 6, scale: 0.12 }); scene.add(tipCore);
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uI; varying vec2 vUv;
      void main(){ vec2 p = vUv * 2.0 - 1.0; float s = exp(-p.y * p.y * 900.0) * pow(1.0 - abs(p.x), 3.0) + exp(-p.y * p.y * 90.0) * pow(1.0 - abs(p.x), 6.0) * 0.25;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * s * uI, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  streak.renderOrder = 20; scene.add(streak);
  const flashRings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 160), new THREE.MeshBasicMaterial({ color: '#ffd59a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.rotation.x = Math.PI / 2; scene.add(m); return m;
  });
  const becCall = new Callout('BOSE–EINSTEIN CONDENSATE', { dx: 0.55, dy: 0.32, size: 0.05, color: '#f2ecdf', sub: 'FIRST MADE 1995', intensity: 1.3 });
  scene.add(becCall);

  // ============================================================================== HUD captions
  const hud = ctx.makeHUD();
  const capX = -ctx.aspect + 0.16, capY = -0.74;
  const mkCap = (lines, a, b) => {
    const g = new THREE.Group(); hud.scene.add(g);
    const tps = lines.map((s, i) => { const tp = new TextPlane(s, { font: FONTS.mono, height: i ? 0.03 : 0.036, letterSpacing: 0.3, color: HUD_COL, intensity: i ? 0.8 : 1.0, align: 'left' }); tp.position.set(capX + tp.worldWidth / 2, capY - i * 0.058, 0); g.add(tp); return tp; });
    const rule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color(HUD_COL).multiplyScalar(0.8), transparent: true, toneMapped: false }));
    g.add(rule);
    return { tps, rule, a, b };
  };
  const caps = [
    mkCap(['RAMANUJAN · LETTER TO HARDY · 1913'], tR + 0.05, tB - 0.1),
    mkCap(['THE RAMAN EFFECT · 1928', 'NOBEL PRIZE IN PHYSICS · 1930'], tB + 0.05, tC - 0.02),
    mkCap(['BOSE STATISTICS · 1924', 'BOSONS ARE NAMED AFTER S. N. BOSE'], tC + 0.04, tG + 0.35),
  ];

  // ============================================================================== camera plan
  // per-component monotone Hermite keys (timeWarp): the slate track, a whip with the light, the bench,
  // a whip with the particle stream, the condensate, the push into the point
  const TIP_Y = CB.y + 0.012 + 0.17 + 0.78;       // peak height at full condensate (thermal 0.17 + PEAK)
  const CAM = [
    [-0.15, V(-2.75, 0.2, 2.9), V(-1.95, 0.02, 0)],
    [tR + 0.35, V(-0.75, 0.2, 3.35), V(0.0, 0.02, 0)],
    [tR + 0.68, V(0.3, 0.15, 3.3), V(0.95, -0.05, 0)],
    [tB - 0.1, V(2.6, 0.12, 3.0), V(4.3, -0.3, 0)],
    [tB + 0.12, V(6.25, 0.3, 2.75), V(7.55, -0.22, 0)],
    [tC - 0.12, V(6.85, 0.36, 2.55), V(7.9, -0.16, 0)],
    [tC + 0.05, V(9.2, 0.8, 3.1), V(11.2, -0.4, 0)],
    [tC + 0.3, V(12.25, 0.95, 3.45), V(13.35, -0.42, 0)],
    [tG, V(12.75, 0.62, 2.55), V(13.4, -0.12, 0)],
    [DUR + 0.05, V(13.3, 0.4, 1.3), V(13.4, TIP_Y - 0.06, 0)],
  ];
  const camK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[1][c]]));
  const lookK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[2][c]]));

  const dof = { focus: 3.2, range: 1.2, amount: 0.4 };
  const bloom = { strength: 0.7 };
  const camPos = V(0, 0, 0), camLook = V(0, 0, 0), tip = V(0, 0, 0), tmp = V(0, 0, 0);

  // decelerating thermal-jitter phase (∫ speed dt, evaluated in closed steps so it is a pure function of t)
  const speedAt = (t) => 15 * (1 - 0.88 * ramp(t, tC, tC + 0.55, ease.outQuad));
  const phaseAt = (t) => { const n = 48, h = t / n; let s = 0; for (let i = 0; i < n; i++) s += speedAt((i + 0.5) * h) * h; return s; };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const beat = pulse(T, { decay: 6 });

    // ------------------------------------------------------------ camera
    const tc = Math.min(Math.max(t, -0.15), DUR + 0.05);
    camPos.set(timeWarp(tc, camK[0]), timeWarp(tc, camK[1]), timeWarp(tc, camK[2]));
    camLook.set(timeWarp(tc, lookK[0]), timeWarp(tc, lookK[1]), timeWarp(tc, lookK[2]));
    camPos.x += Math.sin(t * 0.9) * 0.015; camPos.y += Math.sin(t * 1.3 + 1) * 0.01;
    camera.position.copy(camPos);
    camera.up.set(Math.sin(t * 0.7) * 0.012 - 0.06 * envelope(t, tB - 0.2, tB + 0.2, 0.2, 0.2) + 0.05 * envelope(t, tC - 0.15, tC + 0.3, 0.15, 0.25), 1, 0).normalize();
    camera.lookAt(camLook);
    camera.fov = 35 - 3 * ramp(t, tG, DUR, ease.inQuad);
    camera.updateProjectionMatrix();

    // ------------------------------------------------------------ slate & chalk
    const slateOn = t < tB + 0.35;
    slate.visible = slateOn;
    let headPos = null;
    for (const c of chalkPlanes) {
      const p = sat((t - c.t0) / (c.t1 - c.t0));
      c.mat.uniforms.uReveal.value = p;
      c.m.visible = slateOn && p > 0;
      c.mat.uniforms.uOp.value = 1;
      if (c.sp) {
        const writing = p > 0 && p < 1;
        c.sp.visible = writing && slateOn;
        if (writing) {
          const e = p * (1 + 0.025) - 0.025 + 0.0125;
          const wob = Math.sin(t * 52 + c.t0 * 10) * 0.28 + Math.sin(t * 23 + c.t0 * 3) * 0.12;
          c.sp.position.set(c.m.position.x + (e - 0.5) * c.w, c.m.position.y + wob * c.em * 0.7, 0.03);
          c.sp.scale.setScalar(Math.min(0.14, c.em * 0.55) * (0.85 + 0.25 * Math.sin(t * 40 + c.t0)));
          if (!headPos || c.em > 0.2) headPos = c.sp.position;
        }
      }
    }
    if (headPos) { chalkLight.position.copy(headPos).add(tmp.set(0, 0, 0.25)); chalkLight.intensity = 0.6; } else chalkLight.intensity = 0;
    slateKey.intensity = 110 * (1 - 0.6 * ramp(t, tB, tB + 0.3));

    // ------------------------------------------------------------ the light
    const fx = frontX(t);
    for (let i = 0; i < segs.length; i++) {
      const a = beamPts[i].x, b = beamPts[i + 1].x;
      const pr = sat((fx - a) / (b - a));
      const on = pr > 0 ? 1 : 0;
      const fade = 1 - ramp(t, tC + 0.25, tC + 0.6);
      segs[i].core.progress = Math.max(0.0001, pr); segs[i].halo.progress = Math.max(0.0001, pr);
      segs[i].core.opacity = on * fade; segs[i].halo.opacity = on * fade * (i === 2 ? 0.7 : 0.5);
    }
    const fOn = fx > UL_X1 && fx < DUMP_X;
    frontGlow.visible = fOn;
    if (fOn) {
      frontGlow.position.set(fx, YU, ZB);
      frontGlow.material.color.copy(fx < FX ? WHITE_HOT : VIOLET).multiplyScalar(fx < FX ? 2.4 : 3.2);
      frontGlow.scale.setScalar(fx < FX ? 0.3 : 0.38);
    }
    const tFilt = FRONT[1][0];
    const fHit = Math.exp(-Math.max(0, t - tFilt) * 7) * (t > tFilt ? 1 : 0);
    const passing = t > tFilt ? 1 - ramp(t, tC + 0.25, tC + 0.6) : 0;
    filterMat.emissiveIntensity = 0.15 + passing * 0.5 + fHit * 2.5;
    filterGlow.visible = t > tFilt;
    filterGlow.scale.setScalar(0.16 + 0.4 * fHit);
    filterGlow.material.opacity = passing;
    dumpGlow.visible = t > FRONT[3][0];
    dumpGlow.material.opacity = passing;

    // ------------------------------------------------------------ the flask, the scattering
    const hit = t - tB;
    const beamOn = hit > 0 ? (1 + 1.2 * Math.exp(-hit * 6)) * (1 - ramp(t, tC + 0.25, tC + 0.6)) : 0;
    liqU.uBeam.value = beamOn; liqU.uTime.value = t;
    glassMat.uniforms.uBeam.value = beamOn;
    violetLight.intensity = 6 * beamOn;
    phU.uT.value = t; phU.uViewport.value = info?.height ?? 800;
    phU.uFade.value = 1 - ramp(t, tC + 0.1, tC + 0.5);
    photons.visible = hit > 0 && t < tC + 0.55;
    const benchVis = t > tR + 0.45 && t < tG + 0.2;
    bench.visible = filter.visible = flask.visible = benchVis;

    // spectrum plate: Rayleigh line first, the faint Raman lines build up after it
    const pO = ramp(t, tB + 0.02, tB + 0.2) * (1 - ramp(t, tC + 0.3, tC + 0.6));
    plateU.uO.value = pO; plateU.uTime.value = t;
    plateU.uSweep.value = ramp(t, tB + 0.08, tB + 0.55, ease.inOutSine);
    const lit = plateU.uLit.value;
    lit[0] = ramp(t, tB + 0.06, tB + 0.16);
    lit[1] = ramp(t, tB + 0.25, tB + 0.5) * (0.85 + 0.15 * Math.sin(t * 37));
    lit[2] = ramp(t, tB + 0.32, tB + 0.58) * (0.85 + 0.15 * Math.sin(t * 29 + 1));
    lit[3] = ramp(t, tB + 0.4, tB + 0.65);
    plate.visible = pO > 0.002;
    plateTitle.reveal = ramp(t, tB + 0.05, tB + 0.35, ease.outCubic); plateTitle.opacity = pO;
    tickLabels.forEach((l) => { l.opacity = pO * 0.9; }); nmLabel.opacity = pO * 0.9;
    calRay.reveal(ramp(t, tB + 0.14, tB + 0.45, ease.outCubic), pO);
    calRam.reveal(ramp(t, tB + 0.38, tB + 0.68, ease.outCubic), pO);

    // ------------------------------------------------------------ the condensate
    const cool = ramp(t, tC - 0.02, tC + 0.55, ease.inOutCubic);
    becU.uTh.value = lerp(0.38, 0.17, cool);
    becU.uSig.value = lerp(0.6, 0.46, cool);
    becU.uC.value = PEAK * ramp(t, tC + 0.05, tC + 0.5, ease.inOutCubic);
    becU.uCx.value = 0.25; becU.uCz.value = 0.36;
    const becIn = ramp(t, tB + 0.35, tC - 0.05);
    becU.uO.value = becIn * (1 - 0.85 * ramp(t, tG, tG + 0.55));
    becU.uGlow.value = 0.5 * envelope(t, tG - 0.1, tG + 0.5, 0.1, 0.3);
    becU.uRing.value = t > tG ? (t - tG) * 2.6 : 0;
    surface.visible = becIn > 0.002;
    becRig.visible = t > tC - 0.3;
    const peakH = becU.uTh.value + becU.uC.value;
    tip.set(CB.x, CB.y + 0.012 + peakH, CB.z);
    bU.uT.value = t; bU.uPh.value = phaseAt(t); bU.uViewport.value = info?.height ?? 800;
    bU.uAmp.value = lerp(0.17, 0.025, cool);
    bU.uSigScale.value = becU.uSig.value / 0.6;
    bU.uTip.value.copy(tip);
    bU.uI.value = 2.4 + 0.6 * beat * ramp(t, tC, tG);
    bosons.visible = t > tB + 0.4;

    // the call-out at the peak
    becCall.position.copy(tip).add(tmp.set(0.02, -0.06, 0));
    faceCamera(becCall, camera);
    becCall.reveal(ramp(t, tC + 0.15, tC + 0.45, ease.outCubic), 1 - ramp(t, tG + 0.15, tG + 0.4));
    axisLabel.opacity = becIn * (1 - ramp(t, tG + 0.2, tG + 0.5));
    axisLabel.reveal = ramp(t, tC - 0.05, tC + 0.35, ease.outCubic);

    // ------------------------------------------------------------ the flash
    const g = ramp(t, tG, DUR + 0.1, ease.inCubic);
    const gl = ramp(t, tC + 0.3, tG, ease.outCubic) * 0.3 + ramp(t, tG - 0.05, tG + 0.25, ease.outCubic) * 0.5 + g;
    tipGlow.visible = tipCore.visible = streak.visible = gl > 0.002;
    tipGlow.position.copy(tip); tipCore.position.copy(tip);
    tipGlow.scale.setScalar(0.25 + 0.25 * ramp(t, tG - 0.05, tG + 0.25) + 2.2 * g + 0.06 * beat);
    tipGlow.material.color.set('#ffe6c4').multiplyScalar(1.0 + 1.2 * ramp(t, tG - 0.05, tG + 0.25) + 3 * g);
    tipCore.scale.setScalar(0.06 + 0.06 * ramp(t, tG - 0.05, tG + 0.2) + 0.6 * g);
    tipCore.material.color.setScalar(2 + 4 * ramp(t, tG - 0.05, tG + 0.2) + 8 * g);
    streak.position.copy(tip); streak.quaternion.copy(camera.quaternion);
    streak.scale.set(0.8 + 1.6 * ramp(t, tG - 0.05, tG + 0.4, ease.outCubic) + 5 * g, 0.6 + 2 * g, 1);
    streak.material.uniforms.uI.value = gl * 1.6;
    tipLight.position.copy(tip).add(tmp.set(0, 0.15, 0));
    tipLight.intensity = 1.5 * ramp(t, tC + 0.2, tG) + 3 * ramp(t, tG, tG + 0.3) + 14 * g;
    flashRings.forEach((m, i) => {
      const a = t - tG - i * 0.12;
      m.visible = a > 0;
      if (a > 0) {
        m.position.set(CB.x, CB.y + 0.02 + becU.uTh.value * Math.exp(-Math.pow(a * 3, 2) / (2 * 0.46 * 0.46)), CB.z);
        m.scale.setScalar(0.12 + a * 3.0);
        m.material.color.set('#ffd59a').multiplyScalar(2.4 * (1 - sat(a / 0.75)));
      }
    });

    // ------------------------------------------------------------ captions
    for (const c of caps) {
      const e = envelope(t, c.a, c.b, 0.12, 0.15);
      c.tps.forEach((tp, i) => { tp.opacity = e; tp.reveal = ramp(t, c.a + i * 0.06, c.a + 0.3 + i * 0.06, ease.outCubic); });
      const rw = 0.95 * ramp(t, c.a, c.a + 0.3, ease.outCubic);
      c.rule.scale.x = Math.max(0.001, rw); c.rule.material.opacity = e * 0.6; c.rule.visible = e > 0;
      c.rule.position.set(capX + rw / 2, capY + 0.05, 0);
    }

    // ------------------------------------------------------------ atmosphere, lens
    dustA.tick(t, info); dustB.tick(t, info);
    dustA.u.opacity = 0.45 * (1 - ramp(t, tB, tB + 0.3));
    dustB.u.opacity = 0.4 * ramp(t, tR + 0.6, tB);
    if (t < tB - 0.05) { dof.focus = camera.position.z - 0.02; dof.range = 1.4; dof.amount = 0.35; }
    else if (t < tC) { dof.focus = camera.position.distanceTo(FL); dof.range = 1.6; dof.amount = 0.35; }
    else { dof.focus = camera.position.distanceTo(tip) * 0.95; dof.range = 1.5; dof.amount = 0.35 * (1 - g); }
    bloom.strength = 0.72 + 0.15 * envelope(t, tB - 0.05, tB + 0.4, 0.05, 0.3) + 0.35 * g;
    api.exposure = 1 + 0.3 * ramp(t, tG + 0.3, DUR, ease.inQuad);
    api.harmony = lerp(0.65, 0.2, envelope(t, tB - 0.1, tC + 0.5, 0.15, 0.3));
  }

  const AR = [
    { centre: V(0, 0.25, 0), radius: 3.4 },
    { centre: V(7.2, YU + 0.2, 0), radius: 1.9 },
    { centre: CB.clone().add(V(0, 0.45, 0)), radius: 1.9 },
  ];
  const api = {
    scene, camera, hud, update, dof, bloom, exposure: 1, harmony: 0.65, background: 0x020306,
    arSubject: (t) => AR[t < tB - 0.15 ? 0 : t < tC - 0.05 ? 1 : 2],
    exploreLimits: { yaw: 0.9, pitchDown: 0.35, pitchUp: 0.6, zoomOut: 2.2 },
  };
  return api;
}
