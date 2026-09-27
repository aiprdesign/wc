// MEDICINE (31.5 – 35.0 s)
// Technique: microscopic macro camera (speed-ramped dive through translucent cells, a DNA
// double helix and red blood cells with heavy depth of field), then scientific
// visualisation: a Vesalius-style engraving — rasterised from the very same 3D heart
// model, so the lines match — lifts off the parchment into a beating holographic heart,
// wrapped in a holographic HUD (ring gauges, beat-locked ECG, MRI-style scan slice and
// rapid-fire callouts: anatomy → sanitation → vaccination → imaging → medical technology).
import * as THREE from 'three';
import { CUES } from '../timeline.js';
import { sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { GLSL_NOISE, noise3 } from '../lib/noise.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { MorphParticles, sampleBox, sampleGeometry } from '../lib/particles.js';
import { progressLine, circlePoints, segmentsLine, revealLines } from '../lib/lines.js';
import { parchmentTexture, gridTexture, canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { Callout, RingGauge, BracketFrame } from '../lib/hud.js';
import { glowSprite } from '../lib/materials.js';

const TEAL = '#8fe8d8';
const ICE = '#cfeeff';
const CORAL = '#ff9a86';
const STAGE = new THREE.Vector3(0, 0, -40);     // anatomy stage centre (inside the big cell)
const PAGE_W = 4.2, PAGE_H = 3.0;
const HEART_S = 0.7;                             // heart model → world scale
const HEART_ON_PAGE = new THREE.Vector2(-0.85, -0.02);

// ------------------------------------------------------------------ heart model
// A stylised anatomical heart: deformed-sphere ventricles, atria, great vessels and
// coronary arteries. Everything lives in one local frame so the engraving can be
// rasterised from exactly the same triangles.
const ROT = 0.42; // apex tilts to the viewer's right, as in a frontal anatomical view
function deformBody(x, y, z, out) {
  const k = y < 0 ? 1 + y * 0.6 : 1 + y * 0.1 - y * y * 0.22;
  let px = x * k, pz = z * k * 0.8;
  let py = y * 1.1 - (y < 0 ? y * y * 0.12 : 0);
  // interventricular groove on the anterior surface
  const g = x - 0.28 * y - 0.12;
  const dent = 1 - 0.06 * Math.exp(-(g * g) / 0.005) * sat(z * 2.5) - 0.03 * Math.exp(-((y - 0.42) ** 2) / 0.004);
  const lump = 1 + noise3(x * 1.7, y * 1.7, z * 1.7) * 0.025;
  px *= dent * lump; py *= dent * lump; pz *= dent * lump;
  const c = Math.cos(ROT), s = Math.sin(ROT);
  return out.set((px * c - py * s) * 0.95, (px * s + py * c) * 0.95, pz * 0.95);
}
function surfacePoint(x, y, z, lift = 1.03) {
  const l = Math.hypot(x, y, z);
  return deformBody(x / l, y / l, z / l, new THREE.Vector3()).multiplyScalar(lift);
}
function buildHeart() {
  const parts = { body: [], vessels: [], coronary: [] };
  const body = new THREE.SphereGeometry(1, 72, 54);
  const p = body.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { deformBody(p.getX(i), p.getY(i), p.getZ(i), v); p.setXYZ(i, v.x, v.y, v.z); }
  body.computeVertexNormals();
  parts.body.push(body);
  const blob = (r, sx, sy, sz, x, y, z) => { const g = new THREE.SphereGeometry(r, 36, 26); g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  parts.body.push(blob(0.4, 1.0, 1.15, 0.85, -0.78, 0.5, 0.05));   // right atrium
  parts.body.push(blob(0.36, 1.1, 0.9, 0.9, 0.3, 0.72, -0.38));    // left atrium
  parts.body.push(blob(0.16, 1.3, 0.8, 0.8, 0.62, 0.62, 0.12));    // left auricle
  const tube = (pts, r, seg = 48) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((a) => new THREE.Vector3(...a))), seg, r, 18, false);
  // aorta (ascending, arch, descending) + arch branches
  parts.vessels.push(tube([[-0.05, 0.7, 0.0], [-0.12, 1.15, 0.02], [0.0, 1.42, -0.1], [0.28, 1.46, -0.3], [0.48, 1.28, -0.48], [0.55, 0.85, -0.6], [0.55, 0.15, -0.65]], 0.22, 64));
  parts.vessels.push(tube([[-0.04, 1.42, -0.09], [-0.1, 1.68, -0.06], [-0.14, 1.9, -0.04]], 0.075));
  parts.vessels.push(tube([[0.16, 1.5, -0.22], [0.17, 1.72, -0.22], [0.18, 1.93, -0.22]], 0.062));
  parts.vessels.push(tube([[0.36, 1.42, -0.38], [0.44, 1.64, -0.42], [0.54, 1.86, -0.45]], 0.068));
  // pulmonary trunk and its branches
  parts.vessels.push(tube([[0.18, 0.55, 0.42], [0.28, 0.92, 0.36], [0.36, 1.1, 0.16], [0.72, 1.14, -0.04], [1.06, 1.04, -0.1]], 0.19));
  parts.vessels.push(tube([[0.36, 1.1, 0.16], [0.0, 1.1, -0.25], [-0.48, 1.06, -0.35]], 0.13));
  // superior & inferior vena cava
  parts.vessels.push(tube([[-0.72, 0.75, 0.02], [-0.67, 1.2, -0.02], [-0.63, 1.72, -0.05]], 0.15));
  parts.vessels.push(tube([[-0.72, 0.05, -0.14], [-0.73, -0.25, -0.16], [-0.74, -0.5, -0.18]], 0.13, 24));
  // coronary arteries follow the surface
  const lad = []; for (let i = 0; i <= 20; i++) { const y = 0.75 - i * 0.085; const x = 0.28 * y + 0.12; lad.push(surfacePoint(x, y, Math.sqrt(Math.max(0.02, 1 - x * x - y * y)))); }
  const rca = []; for (let i = 0; i <= 20; i++) { const a = 1.2 + i * 0.1; rca.push(surfacePoint(Math.cos(a) * 0.9, 0.42, Math.sin(a) * 0.9)); }
  const cx = []; for (let i = 0; i <= 16; i++) { const a = 1.25 - i * 0.12; cx.push(surfacePoint(Math.cos(a) * 0.9, 0.44, Math.sin(a) * 0.9)); }
  const dg1 = []; for (let i = 0; i <= 10; i++) { const u = i / 10; dg1.push(surfacePoint(0.32 + u * 0.4, 0.5 - u * 0.75, 0.8 - u * 0.2)); }
  const dg2 = []; for (let i = 0; i <= 10; i++) { const u = i / 10; dg2.push(surfacePoint(-0.2 - u * 0.25, 0.3 - u * 0.7, 0.9 - u * 0.2)); }
  for (const pts of [lad, rca, cx, dg1, dg2]) parts.coronary.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.028, 8, false));
  // centre the model on its visual middle
  for (const list of Object.values(parts)) for (const g of list) g.translate(0, -0.45, 0);
  return parts;
}

// ------------------------------------------------------------------ engraving
// Software-rasterise the heart (shade + depth) with canvas triangles, then turn the
// tones into contour-following engraved hatching, like a 16th-century woodcut.
function engrave(parts) {
  const W = 2048, H = Math.round(W * PAGE_H / PAGE_W), ppu = W / PAGE_W;
  const toPx = (x, y) => [(HEART_ON_PAGE.x + x * HEART_S + PAGE_W / 2) * ppu, (PAGE_H / 2 - (HEART_ON_PAGE.y + y * HEART_S)) * ppu];
  const tris = [];
  const L = new THREE.Vector3(-0.55, 0.6, 0.6).normalize();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const g of [...parts.body, ...parts.vessels, ...parts.coronary]) {
    const ng = g.index ? g.toNonIndexed() : g, pos = ng.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
      if (n.z <= 0) continue;
      const shade = Math.max(0, n.dot(L)) * 0.85 + 0.15 * n.z;
      tris.push([toPx(a.x, a.y), toPx(b.x, b.y), toPx(c.x, c.y), (a.z + b.z + c.z) / 3, shade]);
    }
  }
  tris.sort((p, q) => p[3] - q[3]);
  const cv = mkCanvas(W, H), cx = cv.getContext('2d');
  cx.lineJoin = 'round';
  for (const [p0, p1, p2, z, s] of tris) {
    const col = `rgb(${Math.round(s * 255)},${Math.round(sat((z + 1.2) / 2.4) * 255)},255)`;
    cx.fillStyle = col; cx.strokeStyle = col; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(p0[0], p0[1]); cx.lineTo(p1[0], p1[1]); cx.lineTo(p2[0], p2[1]); cx.closePath(); cx.fill(); cx.stroke();
  }
  const src = cx.getImageData(0, 0, W, H).data;
  const ink = new Float32Array(W * H);
  const sp = 7.5; // hatch spacing (px)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, m = src[i * 4 + 2];
      if (m < 128) continue;
      const sh = src[i * 4] / 255, dz = src[i * 4 + 1] / 255;
      const d = sat(1.05 - sh * 1.15);
      // family 1 follows the form (phase bent by depth); family 2 cross-hatches the shadows
      const ph1 = (y * 0.92 + x * 0.38 + dz * 140) / sp;
      const l1 = Math.abs(ph1 - Math.floor(ph1) - 0.5) * 2;
      let k = smoothstep(d * 0.85 + 0.12, d * 0.85 - 0.02, l1);
      if (d > 0.45) {
        const ph2 = (x * 0.9 - y * 0.42 - dz * 90) / (sp * 0.9);
        const l2 = Math.abs(ph2 - Math.floor(ph2) - 0.5) * 2;
        k = Math.max(k, smoothstep((d - 0.45) * 1.3 + 0.1, (d - 0.45) * 1.3 - 0.05, l2));
      }
      // outlines: silhouette + depth discontinuities
      const mN = src[(i - W) * 4 + 2] < 128 || src[(i + W) * 4 + 2] < 128 || src[(i - 1) * 4 + 2] < 128 || src[(i + 1) * 4 + 2] < 128;
      const dzN = Math.max(Math.abs(src[(i - W * 2 < 0 ? i : i - W * 2) * 4 + 1] - src[i * 4 + 1]), Math.abs(src[(i + 2) * 4 + 1] - src[i * 4 + 1]));
      if (mN || dzN > 14) k = 1;
      ink[i] = k * 0.95;
    }
  }
  // thicken silhouettes a touch
  const out = new Float32Array(ink);
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (ink[i] >= 0.95 && (src[(i - 2) * 4 + 2] < 128 || src[(i + 2) * 4 + 2] < 128 || src[(i - 2 * W) * 4 + 2] < 128 || src[(i + 2 * W) * 4 + 2] < 128)) { out[i - 1] = out[i + 1] = out[i - W] = out[i + W] = 1; }
  }

  // Page: parchment, ink, figure labels, title and a column of Latin text.
  const page = mkCanvas(W, H), pc = page.getContext('2d');
  pc.drawImage(parchmentTexture({ size: 512, seed: 3 }).image, 0, 0, W, H);
  const glow = mkCanvas(W, H), gc = glow.getContext('2d');
  const pImg = pc.getImageData(0, 0, W, H), gImg = gc.createImageData(W, H);
  const pd = pImg.data, gd = gImg.data;
  for (let i = 0; i < W * H; i++) {
    const k = out[i]; if (k <= 0) continue;
    pd[i * 4] = lerp(pd[i * 4], 46, k); pd[i * 4 + 1] = lerp(pd[i * 4 + 1], 30, k); pd[i * 4 + 2] = lerp(pd[i * 4 + 2], 16, k);
    gd[i * 4] = gd[i * 4 + 1] = gd[i * 4 + 2] = 255; gd[i * 4 + 3] = Math.round(k * 255);
  }
  pc.putImageData(pImg, 0, 0); gc.putImageData(gImg, 0, 0);
  const inkCol = 'rgba(46,30,16,0.92)';
  const drawText = (ctx2, col) => {
    ctx2.fillStyle = col; ctx2.strokeStyle = col; ctx2.lineWidth = 2.2;
    ctx2.textBaseline = 'middle';
    ctx2.font = `600 ${58}px "${FONTS.display}"`; ctx2.textAlign = 'center';
    ctx2.fillText('DE HVMANI CORPORIS FABRICA', W * 0.5, H * 0.075);
    ctx2.font = `italic 500 ${40}px "${FONTS.serif}"`;
    ctx2.fillText('Liber sextus · De corde, vitae principio', W * 0.5, H * 0.125);
    ctx2.beginPath(); ctx2.moveTo(W * 0.2, H * 0.155); ctx2.lineTo(W * 0.8, H * 0.155); ctx2.stroke();
    // labels with leader lines (anchors in heart-local coordinates)
    ctx2.font = `italic 500 ${32}px "${FONTS.serif}"`;
    const lab = [['A · Aorta', 0.3, 1.45, 1.25, 1.75], ['B · Vena cava', -0.66, 1.5, -1.25, 1.7], ['C · Ventriculus', 0.35, -0.3, 1.3, -0.6], ['D · Arteria pulmonalis', 1.0, 1.06, 1.3, 1.2], ['E · Auricula', -0.9, 0.4, -1.25, 0.15]];
    for (const [t, ax, ay, lx, ly] of lab) {
      const [x0, y0] = toPx(ax, ay - 0.45), [x1, y1] = toPx(lx, ly - 0.45);
      ctx2.beginPath(); ctx2.moveTo(x0, y0); ctx2.lineTo(x1, y1); ctx2.stroke();
      ctx2.textAlign = lx < ax ? 'right' : 'left';
      ctx2.fillText(t, x1 + (lx < ax ? -12 : 12), y1);
    }
    ctx2.font = `italic 400 ${34}px "${FONTS.serif}"`; ctx2.textAlign = 'left';
    const words = 'Cor est viscus carneum, pyramidis figura, in medio thoracis situm, cuius motu sanguis per arterias in universum corpus distribuitur; ventriculi duo, dexter et sinister, septo medio discreti, auriculae duae venas excipiunt. Ex sinistro ventriculo aorta, ex dextro vena arteriosa oritur. Motus cordis constat systole et diastole, quae alternis vicibus sine intermissione succedunt, donec vita manet.'.split(' ');
    let line = '', yy = H * 0.26;
    const x0 = W * 0.64, maxW = W * 0.3;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx2.measureText(test).width > maxW) { ctx2.fillText(line, x0, yy); line = w; yy += 46; } else line = test;
    }
    ctx2.fillText(line, x0, yy);
    ctx2.font = `600 ${44}px "${FONTS.display}"`; ctx2.textAlign = 'center';
    ctx2.fillText('FIG. VI', W * 0.79, H * 0.2);
    ctx2.font = `italic 400 ${30}px "${FONTS.serif}"`;
    ctx2.fillText('Basileae · MDXLIII', W * 0.79, H * 0.9);
    ctx2.lineWidth = 3; ctx2.strokeRect(W * 0.03, H * 0.04, W * 0.94, H * 0.92);
    ctx2.lineWidth = 1.2; ctx2.strokeRect(W * 0.036, H * 0.048, W * 0.928, H * 0.904);
  };
  drawText(pc, inkCol);
  drawText(gc, 'rgba(255,255,255,0.85)');
  return { page: toTexture(page, { anisotropy: 8 }), glow: toTexture(glow, { srgb: false, anisotropy: 8 }) };
}

// ------------------------------------------------------------------ shaders
const CELL_VERT = /* glsl */ `
attribute float aSeed;
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDepth; varying float vSeed;
void main(){
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
    im = instanceMatrix;
  #endif
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vec4 mv = viewMatrix * wp;
  vN = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * normal);
  vV = normalize(-mv.xyz); vP = position; vDepth = -mv.z; vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;
const CELL_FRAG = /* glsl */ `
${GLSL_NOISE}
float sat01(float x){ return clamp(x, 0.0, 1.0); }
uniform vec3 uColor, uCore; uniform float uTime, uOpacity, uFog, uPower, uBase, uIntensity;
varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vDepth; varying float vSeed;
void main(){
  vec3 n = normalize(vN), v = normalize(vV);
  float nv = abs(dot(n, v));
  float f = pow(1.0 - nv, uPower);
  float lit = 0.35 + 1.0 * max(dot(n, normalize(vec3(-0.55, 0.6, 0.45))), 0.0);
  float org = snoise(vP * 3.0 + vec3(vSeed * 17.0, uTime * 0.15, 0.0));
  float org2 = snoise(vP * 8.0 + vec3(0.0, vSeed * 5.0, uTime * 0.2));
  float grain = smoothstep(0.25, 0.85, org) * 0.6 + smoothstep(0.5, 0.95, org2) * 0.45;
  float body = pow(nv, 1.5) * uBase * (1.0 + grain * 2.2);
  float fog = exp(-vDepth * uFog);
  vec3 col = mix(uCore, uColor, sat01(f * 1.3)) * uIntensity;
  float a = (f * 0.75 * lit + body) * fog * uOpacity;
  gl_FragColor = vec4(col, a);
}`;
function cellMaterial({ color = TEAL, core = '#2a6b66', power = 2.4, base = 0.035, intensity = 1.0, fog = 0.03 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uFog: { value: fog }, uPower: { value: power }, uBase: { value: base }, uIntensity: { value: intensity } },
    vertexShader: CELL_VERT, fragmentShader: CELL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Holographic heart: fresnel shell, scanlines, a travelling MRI slice band.
function holoMaterial({ color = TEAL, deep = '#1d5f73', intensity = 1.2, base = 0.05 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uDeep: { value: new THREE.Color(deep) }, uSliceCol: { value: new THREE.Color(ICE) },
      uIntensity: { value: intensity }, uOpacity: { value: 0 }, uTime: { value: 0 }, uSliceY: { value: 100 }, uSliceAmt: { value: 0 }, uBase: { value: base }, uBeat: { value: 0 },
    },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor, uDeep, uSliceCol; uniform float uIntensity, uOpacity, uTime, uSliceY, uSliceAmt, uBase, uBeat;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(normalize(vN), V)), 2.2);
        float scan = 0.82 + 0.18 * sin(vW.y * 160.0 - uTime * 5.0);
        float band = exp(-pow((vW.y - uSliceY) / 0.02, 2.0)) * uSliceAmt;
        float scanned = smoothstep(uSliceY - 0.01, uSliceY + 0.25, vW.y) * uSliceAmt * 0.35;
        vec3 col = mix(uDeep, uColor, f) * uIntensity * (1.0 + uBeat * 0.6 + scanned) + uSliceCol * band * 0.9;
        float a = ((uBase + f * 0.85) * scan + band * 0.6) * uOpacity;
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// ECG trace swept left→right like a bedside monitor. Pure function of global time.
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
function ecg(T) {
  let u = T % 0.5; if (u > 0.3) u -= 0.5;
  return gauss(u, 0, 0.007) - 0.18 * gauss(u, -0.02, 0.006) - 0.32 * gauss(u, 0.022, 0.008) + 0.24 * gauss(u, 0.15, 0.035) + 0.1 * gauss(u, -0.11, 0.018);
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tDive = cue('microDive'), tAnat = cue('anatomy'), tHud = cue('medicalHud');
  const DUR = segment.end - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.35;
  scene.fog = new THREE.FogExp2('#03171b', 0.03);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 200);
  const R = rng(3107);

  const key = new THREE.DirectionalLight('#eaf6ff', 2.6); key.position.set(-4, 6, 5); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#7fe6d6', 2.0); rim.position.set(5, 2, -8); scene.add(rim);
  scene.add(new THREE.AmbientLight('#1a3438', 0.6));

  // ---------------------------------------------------------------- micro world
  const micro = new THREE.Group(); scene.add(micro);
  const cellMat = cellMaterial({ color: TEAL, core: '#2f7d78', base: 0.06, power: 2.8, intensity: 0.85 });
  const nucMat = cellMaterial({ color: '#e2f4ff', core: '#6e8fb8', power: 1.4, base: 0.3, intensity: 0.6 });
  const sphere = new THREE.IcosahedronGeometry(1, 5);
  const cells = [];
  // the helix lies across the flight path at z ≈ -14 (axis direction ≈ (-0.97, 0, 0.25))
  const dnaDist = (x, y, z) => { const dx = x - 0.4, dz = z + 14; const along = -0.97 * dx + 0.25 * dz; const px = dx + 0.97 * along, pz = dz - 0.25 * along; return Math.hypot(px, y + 1.05, pz); };
  let guard = 0;
  while (cells.length < 34 && guard++ < 3000) {
    const z = 4 - R() * 34, r = 0.45 + R() * 1.3;
    const x = (R() - 0.5) * 16, y = (R() - 0.5) * 7;
    const corridor = Math.hypot(x - 0.3 * Math.sin(z * 0.1), y) - r;
    const dnaD = dnaDist(x, y, z) - r;
    if (corridor < 1.0 || dnaD < 1.1) continue;
    if (cells.some((c) => c.p.distanceTo(new THREE.Vector3(x, y, z)) < c.r + r + 0.3)) continue;
    cells.push({ p: new THREE.Vector3(x, y, z), r, seed: R(), spin: (R() - 0.5) * 0.6 });
  }
  const cellMesh = new THREE.InstancedMesh(sphere, cellMat, cells.length);
  const nucMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), nucMat, cells.length);
  const seedAttr = new Float32Array(cells.map((c) => c.seed));
  cellMesh.geometry = sphere.clone(); cellMesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
  nucMesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr.slice(), 1));
  cellMesh.frustumCulled = nucMesh.frustumCulled = false;
  micro.add(cellMesh, nucMesh);

  // DNA double helix — instanced nucleotides + base-pair bonds.
  const BP = 132, HR = 0.42, RISE = 0.155;
  const dna = new THREE.Group(); dna.position.set(0.4, -1.05, -14); dna.rotation.set(0.0, Math.PI / 2 + 0.25, 0.12); dna.scale.setScalar(1.3); micro.add(dna);
  const dnaSpin = new THREE.Group(); dnaSpin.position.z = BP * RISE / 2 - 1.5; dna.add(dnaSpin);
  const nucGeo = new THREE.IcosahedronGeometry(0.085, 2);
  const dnaMat = new THREE.MeshPhysicalMaterial({ color: '#cfe9e6', roughness: 0.25, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.5, sheenColor: new THREE.Color('#9ff0e2'), envMapIntensity: 0.6 });
  const backbone = new THREE.InstancedMesh(nucGeo, dnaMat, BP * 2);
  const bondGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 10, 1); bondGeo.rotateZ(Math.PI / 2); bondGeo.translate(0.5, 0, 0);
  const bondMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.8, emissive: new THREE.Color('#081818') });
  const bonds = new THREE.InstancedMesh(bondGeo, bondMat, BP * 2);
  const baseCols = [new THREE.Color('#7fe0cf'), new THREE.Color(CORAL), new THREE.Color('#f4d9a6'), new THREE.Color('#a9c9ff')];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const strandA = [], strandB = [];
  for (let i = 0; i < BP; i++) {
    const th = i * TAU / 10, z = -i * RISE;
    const A = new THREE.Vector3(Math.cos(th) * HR, Math.sin(th) * HR, z);
    const B = new THREE.Vector3(Math.cos(th + Math.PI * 0.78) * HR, Math.sin(th + Math.PI * 0.78) * HR, z);
    strandA.push(A); strandB.push(B);
    backbone.setMatrixAt(i * 2, m4.makeTranslation(A.x, A.y, A.z)); backbone.setMatrixAt(i * 2 + 1, m4.makeTranslation(B.x, B.y, B.z));
    backbone.setColorAt(i * 2, new THREE.Color('#dff5f2')); backbone.setColorAt(i * 2 + 1, new THREE.Color('#dff5f2'));
    const mid = v1.copy(A).lerp(B, 0.5), len = A.distanceTo(mid);
    for (let s = 0; s < 2; s++) {
      const from = s === 0 ? A : B;
      v2.copy(mid).sub(from).normalize();
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), v2);
      m4.compose(from, q, sc.set(len, 1, 1));
      bonds.setMatrixAt(i * 2 + s, m4);
      const k = Math.floor(R() * 4);
      bonds.setColorAt(i * 2 + s, baseCols[s === 0 ? k : 3 - k]);
    }
  }
  dnaSpin.add(backbone, bonds);
  for (const pts of [strandA, strandB]) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), BP * 4, 0.035, 6, false), dnaMat);
    dnaSpin.add(tube);
  }
  // Red blood cells — smooth biconcave discs, soft coral.
  const rbcProfile = [];
  for (let i = 0; i <= 24; i++) { const r = Math.sin((i / 24) * Math.PI / 2); const h = Math.sqrt(Math.max(0, 1 - r * r)) * (0.1 + r * r - 0.9 * r ** 4); rbcProfile.push(new THREE.Vector2(r, h * 0.5 + 0.0001)); }
  for (let i = 23; i >= 0; i--) { const r = Math.sin((i / 24) * Math.PI / 2); const h = Math.sqrt(Math.max(0, 1 - r * r)) * (0.1 + r * r - 0.9 * r ** 4); rbcProfile.push(new THREE.Vector2(r, -h * 0.5 - 0.0001)); }
  const rbcGeo = new THREE.LatheGeometry(rbcProfile, 48); rbcGeo.computeVertexNormals();
  const rbcMat = new THREE.MeshPhysicalMaterial({ color: '#e6786a', roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.25, sheen: 1, sheenColor: new THREE.Color('#ffc2b0'), emissive: new THREE.Color('#2a0806'), side: THREE.DoubleSide });
  const RBC = 46;
  const rbc = new THREE.InstancedMesh(rbcGeo, rbcMat, RBC);
  const rbcData = [];
  for (let i = 0; i < RBC; i++) {
    let x, y, z, tries = 0;
    do { x = (R() - 0.5) * 12; y = (R() - 0.5) * 6; z = 3 - R() * 32; tries++; } while ((Math.hypot(x, y) < 0.9 || dnaDist(x, y, z) < 1.0) && tries < 50);
    rbcData.push({ p: new THREE.Vector3(x, y, z), s: 0.28 + R() * 0.22, axis: new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), q0: new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), w: 0.4 + R() * 1.2, drift: new THREE.Vector3((R() - 0.5) * 0.4, (R() - 0.5) * 0.3, 0.6 + R() * 0.6) });
  }
  rbc.frustumCulled = false;
  micro.add(rbc);

  // Bokeh / plasma particles and soft haze glows.
  const motes = new MorphParticles({ count: 2600, positions: sampleBox(2600, 16, 8, 40, { seed: 31, center: [0, 0, -15] }), size: 0.045, color: '#bff8ee', intensity: 1.1, opacity: 0.55, seed: 32 });
  motes.u.noise = 0.25; motes.u.noiseFreq = 0.3; motes.u.noiseSpeed = 0.2; motes.u.twinkle = 0.5;
  const bokeh = new MorphParticles({ count: 260, positions: sampleBox(260, 14, 7, 38, { seed: 33, center: [0, 0, -14] }), size: 0.22, color: '#7fe0cf', intensity: 0.5, opacity: 0.25, seed: 34 });
  bokeh.u.noise = 0.4; bokeh.u.noiseFreq = 0.15;
  micro.add(motes, bokeh);
  const hazes = [];
  for (let i = 0; i < 7; i++) {
    const g = glowSprite({ color: i % 3 === 0 ? '#ff9f8a' : '#5fcfc0', intensity: 0.18, scale: 9 + R() * 6 });
    g.position.set((R() - 0.5) * 18, (R() - 0.5) * 6, -6 - i * 5);
    hazes.push(g); micro.add(g);
  }

  // The big cell that encloses the anatomy stage — the camera dives through its membrane.
  const bigCell = new THREE.Mesh(new THREE.IcosahedronGeometry(6.4, 6), cellMaterial({ color: '#a8f4e8', core: '#1c6a66', base: 0.04, power: 2.6, intensity: 0.7, fog: 0.012 }));
  bigCell.geometry.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(bigCell.geometry.attributes.position.count).fill(0.7), 1));
  bigCell.position.copy(STAGE);
  scene.add(bigCell);

  // ---------------------------------------------------------------- anatomy stage
  const parts = buildHeart();
  const tex = engrave(parts);
  const PAGE_POS = new THREE.Vector3(STAGE.x, STAGE.y, STAGE.z - 0.3);
  const pageMat = new THREE.MeshBasicMaterial({ map: tex.page, color: 0xffffff });
  const page = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W, PAGE_H), pageMat);
  page.position.copy(PAGE_POS);
  scene.add(page);
  const glowPage = new THREE.Mesh(new THREE.PlaneGeometry(PAGE_W, PAGE_H), new THREE.MeshBasicMaterial({ map: tex.glow, color: new THREE.Color(TEAL).multiplyScalar(1.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  scene.add(glowPage);

  const heartRoot = new THREE.Group(); scene.add(heartRoot);
  const heart = new THREE.Group(); heartRoot.add(heart);
  const holoBody = holoMaterial({ color: TEAL, deep: '#123f4c', intensity: 0.8, base: 0.04 });
  const holoVessel = holoMaterial({ color: '#b9f2ff', deep: '#1a4660', intensity: 0.75, base: 0.04 });
  const holoCor = holoMaterial({ color: CORAL, deep: '#6a2a24', intensity: 1.6, base: 0.35 });
  const holoMats = [holoBody, holoVessel, holoCor];
  for (const g of parts.body) heart.add(new THREE.Mesh(g, holoBody));
  for (const g of parts.vessels) heart.add(new THREE.Mesh(g, holoVessel));
  for (const g of parts.coronary) heart.add(new THREE.Mesh(g, holoCor));
  const lattice = revealLines(parts.body[0], { mode: 'wire', order: 'y', color: '#6fd8c8', headColor: '#e8fffa', intensity: 0.22, head: 0.06 });
  heart.add(lattice);
  const heartDust = new MorphParticles({ count: 2400, positions: sampleGeometry(parts.body[0], 2400, { seed: 41 }), size: 0.025, color: '#c8fff4', intensity: 1.6, opacity: 0.8, seed: 42 });
  heartDust.u.noise = 0.02; heartDust.u.twinkle = 0.7;
  heart.add(heartDust);
  const heartFocus = new THREE.Vector3();

  // 3D HUD around the heart: tilted ring gauges and the scan slice.
  const hud3 = new THREE.Group(); scene.add(hud3);
  const ringA = new RingGauge(1.4, { ticks: 96, color: '#8fe8d8', intensity: 0.75, tickLen: 0.05, majorEvery: 8 });
  const ringB = new RingGauge(1.62, { ticks: 144, color: '#a9d8ff', intensity: 0.5, tickLen: 0.035, majorEvery: 12 });
  const arcA = progressLine(circlePoints(1.48, 90, { start: 0, end: TAU * 0.62 }), { color: '#e9fffb', intensity: 1.4, head: 0.03 });
  ringA.add(arcA);
  const ringAHolder = new THREE.Group(); ringAHolder.add(ringA); ringAHolder.rotation.set(1.28, 0.18, 0);
  const ringBHolder = new THREE.Group(); ringBHolder.add(ringB); ringBHolder.rotation.set(1.42, -0.35, 0.2);
  hud3.add(ringAHolder, ringBHolder);
  const sliceGrid = gridTexture({ cells: 12, sub: 4 });
  const slice = new THREE.Group(); hud3.add(slice);
  const slicePlane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), new THREE.MeshBasicMaterial({ map: sliceGrid, color: new THREE.Color('#8fe8d8').multiplyScalar(0.55), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  slicePlane.rotation.x = -Math.PI / 2;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const sliceFrame = segmentsLine([[V3(-1.4, 0, -1), V3(1.4, 0, -1)], [V3(1.4, 0, -1), V3(1.4, 0, 1)], [V3(1.4, 0, 1), V3(-1.4, 0, 1)], [V3(-1.4, 0, 1), V3(-1.4, 0, -1)]], { color: ICE, intensity: 1.3, orderFn: (a, b, i) => i * 0.1, stagger: 0.4 });
  slice.add(slicePlane, sliceFrame);

  // ---------------------------------------------------------------- screen HUD
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  const hudG = new THREE.Group(); hud.scene.add(hudG);
  const leftText = (txt, x, y, o) => { const tp = new TextPlane(txt, { font: FONTS.mono, height: 0.042, letterSpacing: 0.18, color: ICE, intensity: 1.1, ...o }); tp.position.set(x + tp.worldWidth / 2, y, 0); hudG.add(tp); return tp; };
  const hTitle = leftText('CARDIAC MODEL  ·  VOLUMETRIC RECONSTRUCTION', -A + 0.22, 0.83, {});
  const hSub = leftText('FIG. VI  ·  FROM ENGRAVING TO HOLOGRAM  ·  1543 → TODAY', -A + 0.22, 0.76, { height: 0.03, intensity: 0.6 });
  const hRule = segmentsLine([[V3(-A + 0.22, 0.715, 0), V3(-A + 1.5, 0.715, 0)]], { color: ICE, intensity: 0.6, orderFn: () => 0, stagger: 0 });
  hudG.add(hRule);
  const bracket = new BracketFrame(1.55, 1.62, { len: 0.1, color: '#bfeee6', intensity: 0.8 });
  hudG.add(bracket);
  // ECG monitor
  const ECG_N = 360, ECG_W = 1.15, ECG_H = 0.17, ECG_X = A - 0.2 - ECG_W, ECG_Y = -0.7;
  const ecgPos = new Float32Array(ECG_N * 3), ecgX = new Float32Array(ECG_N);
  for (let i = 0; i < ECG_N; i++) { ecgX[i] = i / (ECG_N - 1); ecgPos[i * 3] = ECG_X + ecgX[i] * ECG_W; ecgPos[i * 3 + 1] = ECG_Y; }
  const ecgGeo = new THREE.BufferGeometry();
  ecgGeo.setAttribute('position', new THREE.BufferAttribute(ecgPos, 3));
  ecgGeo.setAttribute('aX', new THREE.BufferAttribute(ecgX, 1));
  const ecgMat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#9ff5e6') } },
    vertexShader: `attribute float aX; varying float vX; void main(){ vX = aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uHead, uOpacity; uniform vec3 uColor; varying float vX;
      void main(){ float age = fract(uHead - vX + 1.0); if (age > 0.94) discard;
        float a = (1.0 - smoothstep(0.5, 0.94, age)) * uOpacity; float head = smoothstep(0.04, 0.0, age);
        gl_FragColor = vec4(uColor * (1.2 + head * 3.0), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ecgLine = new THREE.Line(ecgGeo, ecgMat); ecgLine.frustumCulled = false; hudG.add(ecgLine);
  const ecgGridSegs = [];
  for (let i = 0; i <= 10; i++) ecgGridSegs.push([V3(ECG_X + i * ECG_W / 10, ECG_Y - ECG_H * 0.9, 0), V3(ECG_X + i * ECG_W / 10, ECG_Y + ECG_H * 1.4, 0)]);
  for (let j = 0; j <= 3; j++) ecgGridSegs.push([V3(ECG_X, ECG_Y - ECG_H * 0.9 + j * ECG_H * 0.77, 0), V3(ECG_X + ECG_W, ECG_Y - ECG_H * 0.9 + j * ECG_H * 0.77, 0)]);
  const ecgGrid = segmentsLine(ecgGridSegs, { color: '#5fb8ae', intensity: 0.18, stagger: 0.5, seed: 5 });
  hudG.add(ecgGrid);
  const ecgLab = leftText('ECG · LEAD II', ECG_X, ECG_Y + ECG_H * 1.75, { height: 0.03, intensity: 0.7 });
  const hrLab = new TextPlane('HR 120', { font: FONTS.mono, weight: 500, height: 0.07, letterSpacing: 0.08, color: '#bff8ee', intensity: 1.3 });
  hrLab.position.set(ECG_X + ECG_W - hrLab.worldWidth / 2 + 0.03, ECG_Y + ECG_H * 1.95, 0); hudG.add(hrLab);
  const bpmLab = leftText('BPM', ECG_X + ECG_W - 0.02, ECG_Y + ECG_H * 1.62, { height: 0.026, intensity: 0.6 });
  bpmLab.position.x = ECG_X + ECG_W - bpmLab.worldWidth / 2 + 0.03;
  // left column of small readouts with ring gauges
  const gauges = [];
  [['SpO₂', '98 %', 0.78], ['PERFUSION', '4.2 L/MIN', 0.55], ['CT DOSE', '1.1 mSv', 0.34]].forEach(([k, v, f], i) => {
    const g = new THREE.Group(); g.position.set(A - 1.55 + i * 0.5, 0.8, 0); hudG.add(g);
    const ring = new RingGauge(0.075, { ticks: 36, color: '#8fe8d8', intensity: 0.6, tickLen: 0.012, majorEvery: 9 });
    const arc = progressLine(circlePoints(0.06, 48, { start: Math.PI / 2, end: Math.PI / 2 - TAU * f }), { color: '#e9fffb', intensity: 1.5, head: 0.05 });
    g.add(ring, arc);
    const kt = new TextPlane(k, { font: FONTS.mono, height: 0.026, letterSpacing: 0.18, color: ICE, intensity: 0.6 }); kt.position.set(0.13 + kt.worldWidth / 2, 0.025, 0);
    const vt = new TextPlane(v, { font: FONTS.mono, weight: 500, height: 0.04, letterSpacing: 0.06, color: '#dffcf6', intensity: 1.2 }); vt.position.set(0.13 + vt.worldWidth / 2, -0.028, 0);
    g.add(kt, vt);
    gauges.push({ g, ring, arc, kt, vt });
  });
  // callouts — anchored to projected points on the heart
  const CALL = [
    ['ANATOMY', '1543 · DE FABRICA', [0.2, 1.0, -0.15], 0.6, 0.12],
    ['SANITATION', '1854 · PUBLIC HEALTH', [-0.8, 0.05, 0.3], -0.6, 0.14],
    ['VACCINATION', '1796 · SMALLPOX', [0.75, -0.3, 0.35], 0.58, 0.1],
    ['IMAGING', '1895 · X-RAY → MRI', [-0.45, -0.6, 0.45], -0.6, -0.08],
    ['MEDICAL TECHNOLOGY', '1958 · PACEMAKER', [0.35, -1.3, 0.2], -0.7, -0.14],
  ].map(([label, sub, anchor, dx, dy], i) => {
    const c = new Callout(label, { dx, dy, size: 0.048, color: i % 2 ? '#dffcf6' : '#bff8ee', sub, intensity: 1.35 });
    hudG.add(c);
    return { c, anchor: new THREE.Vector3(...anchor), t0: tHud + i * 0.22 };
  });

  // ---------------------------------------------------------------- animation
  const camPos = new THREE.Vector3(), look = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const heartStart = new THREE.Vector3(PAGE_POS.x + HEART_ON_PAGE.x, PAGE_POS.y + HEART_ON_PAGE.y, PAGE_POS.z + 0.02);
  const heartEnd = new THREE.Vector3(STAGE.x, STAGE.y + 0.02, STAGE.z + 0.25);
  const qa = new THREE.Quaternion(), qm = new THREE.Quaternion(), m5 = new THREE.Matrix4(), s5 = new THREE.Vector3(), p5 = new THREE.Vector3();
  const ZK = [[0, 6.2], [tDive, 4.7], [tDive + 0.45, -8.5], [tDive + 0.8, -26.5], [tAnat - 0.05, -33.95], [tAnat + 0.25, -34.55], [DUR, -35.4]];

  const api = {
    scene, camera, hud: null,
    dof: { focus: 5, range: 2.5, amount: 0 },
    bloom: { strength: 0.75 },
    exposure: 1.0,
    background: 0x010608,
    update(t, info) {
      const T = info.T;
      const beat = pulse(T, { decay: 10 }), beat2 = pulse(T, { decay: 12, offset: 0.13 });

      // -------- camera: speed-ramped dive, then a slow orbit around the heart
      const z = timeWarp(t, ZK);
      const sway = 1 - ramp(t, tAnat - 0.4, tAnat + 0.1);
      camPos.set(0.32 * Math.sin(t * 1.4 + 0.4) * sway, 0.1 + 0.16 * Math.sin(t * 1.1) * sway, z);
      const orbit = ramp(t, tAnat + 0.15, DUR, ease.inOutSine) * 0.62 + ramp(t, tHud, DUR, ease.inQuad) * 0.12;
      if (t > tAnat - 0.3) {
        const d = camPos.z - STAGE.z;
        const w = ramp(t, tAnat - 0.3, tAnat + 0.2);
        tmp.set(STAGE.x + Math.sin(orbit) * d, STAGE.y + 0.1 + ramp(t, tAnat, DUR) * 0.35, STAGE.z + Math.cos(orbit) * d);
        camPos.lerp(tmp, w);
      }
      camera.position.copy(camPos);
      // look ahead during the dive, settle on the page then on the lifting heart
      look.set(camPos.x * 0.4 + 0.15 * Math.sin(t * 0.8), camPos.y * 0.4, camPos.z - 12);
      tmp.copy(STAGE).add(tmp2.set(0, 0, 0.3));
      look.lerp(tmp, ramp(t, tAnat - 0.45, tAnat - 0.05));
      camera.up.set(Math.sin(t * 0.9) * 0.05 * sway, 1, 0).normalize();
      camera.lookAt(look);
      camera.fov = 35 + (1 - ramp(t, 0, tDive + 0.3)) * 3 - envelope(t, tDive, tAnat, 0.3, 0.4) * 4;
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // -------- micro world
      const microVis = 1 - ramp(t, tAnat, tAnat + 0.3);
      micro.visible = microVis > 0.001;
      cellMat.uniforms.uTime.value = nucMat.uniforms.uTime.value = t;
      cellMat.uniforms.uOpacity.value = nucMat.uniforms.uOpacity.value = microVis;
      if (micro.visible) {
        for (let i = 0; i < cells.length; i++) {
          const c = cells[i];
          const breathe = 1 + 0.03 * Math.sin(t * 2.0 + c.seed * 20);
          qa.setFromAxisAngle(tmp.set(0, 1, 0), c.spin * t + c.seed * 6);
          p5.set(c.p.x, c.p.y + Math.sin(t * 0.7 + c.seed * 9) * 0.1, c.p.z);
          m5.compose(p5, qa, s5.setScalar(c.r * breathe));
          cellMesh.setMatrixAt(i, m5);
          tmp2.set(0.28 * Math.sin(c.seed * 40), 0.22 * Math.cos(c.seed * 30), 0.1).multiplyScalar(c.r).applyQuaternion(qa);
          m5.compose(p5.add(tmp2), qa, s5.setScalar(c.r * 0.34));
          nucMesh.setMatrixAt(i, m5);
        }
        cellMesh.instanceMatrix.needsUpdate = nucMesh.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < RBC; i++) {
          const d = rbcData[i];
          qm.setFromAxisAngle(d.axis, d.w * t).multiply(d.q0);
          p5.copy(d.drift).multiplyScalar(t).add(d.p);
          m5.compose(p5, qm, s5.setScalar(d.s));
          rbc.setMatrixAt(i, m5);
        }
        rbc.instanceMatrix.needsUpdate = true;
        dnaSpin.rotation.z = t * 0.9;
        motes.tick(t, info); bokeh.tick(t, info);
        motes.u.opacity = 0.55 * microVis; bokeh.u.opacity = 0.25 * microVis;
      }
      // big cell: glowing target at the end of the tunnel → membrane rush → gone
      const bc = bigCell.material.uniforms;
      bc.uTime.value = t;
      bc.uOpacity.value = (0.9 + 0.8 * envelope(t, tAnat - 0.35, tAnat + 0.15, 0.2, 0.2)) * (1 - ramp(t, tAnat + 0.05, tAnat + 0.6));
      bigCell.visible = bc.uOpacity.value > 0.001;

      // -------- anatomy: engraving → hologram
      const pageVis = ramp(t, tAnat - 0.5, tAnat - 0.1);
      page.visible = pageVis > 0.001 && t < DUR;
      const lift = ramp(t, tAnat + 0.02, tAnat + 0.55, ease.inOutCubic);
      const dim = 1 - ramp(t, tAnat + 0.15, tHud + 0.3) * 0.84;
      pageMat.color.setScalar(0.62 * pageVis * dim);
      page.position.set(PAGE_POS.x - lift * 0.9, PAGE_POS.y, PAGE_POS.z - lift * 0.8);
      page.rotation.y = lift * 0.32;
      glowPage.position.copy(page.position).add(tmp.set(0, 0, 0.02 + lift * 0.25));
      glowPage.rotation.copy(page.rotation);
      glowPage.material.opacity = envelope(t, tAnat - 0.05, tHud + 0.1, 0.2, 0.4) * 0.75;

      const holo = ramp(t, tAnat - 0.02, tAnat + 0.35);
      heartRoot.visible = holo > 0.001;
      heartRoot.position.lerpVectors(heartStart, heartEnd, lift);
      heartRoot.scale.set(HEART_S, HEART_S, HEART_S * lerp(0.02, 1, ease.outCubic(lift)));
      heartRoot.rotation.y = ramp(t, tAnat + 0.3, DUR, ease.inOutSine) * -0.5;
      const bs = 1 + (0.055 * beat + 0.028 * beat2) * ramp(t, tAnat + 0.3, tAnat + 0.6);
      heart.scale.set(bs, bs * (1 - 0.01 * beat), bs);
      const sliceOn = envelope(t, tHud + 0.35, DUR + 0.2, 0.15, 0.1);
      const sliceY = heartEnd.y + lerp(1.35, -1.05, ramp(t, tHud + 0.4, DUR - 0.05, ease.inOutSine)) * HEART_S;
      for (const m of holoMats) {
        m.uniforms.uTime.value = t; m.uniforms.uOpacity.value = holo; m.uniforms.uBeat.value = beat;
        m.uniforms.uSliceY.value = sliceY; m.uniforms.uSliceAmt.value = sliceOn;
      }
      lattice.progress = ramp(t, tAnat + 0.2, tHud + 0.3); lattice.opacity = holo * 0.9;
      heartDust.tick(t, info); heartDust.u.opacity = holo * 0.6; heartDust.u.intensity = 0.9 + beat * 1.0;
      heartRoot.updateMatrixWorld(true);
      heartFocus.setFromMatrixPosition(heart.matrixWorld);

      // -------- 3D HUD
      hud3.position.copy(heartEnd);
      const hudIn = ramp(t, tHud - 0.15, tHud + 0.35, ease.outCubic);
      hud3.visible = hudIn > 0.001;
      ringA.reveal(hudIn, 0.9); ringB.reveal(ramp(t, tHud - 0.05, tHud + 0.5), 0.8);
      arcA.progress = ramp(t, tHud + 0.1, tHud + 0.7, ease.outCubic) * (0.8 + 0.2 * Math.sin(t * 3));
      ringA.rotation.z = t * 0.5; ringB.rotation.z = -t * 0.3;
      ringAHolder.scale.setScalar(1 + beat * 0.012);
      slice.position.y = sliceY - heartEnd.y;
      slicePlane.material.opacity = sliceOn * 0.22;
      sliceFrame.progress = sliceOn; sliceFrame.opacity = sliceOn * 0.8;

      // -------- screen HUD (sharp, composited after DOF)
      const hudOn = t > tAnat + 0.3;
      api.hud = hudOn ? hud : null;
      if (hudOn) {
        const hA = ramp(t, tHud - 0.1, tHud + 0.35, ease.outCubic);
        hTitle.reveal = hA; hTitle.opacity = hA > 0 ? 1 : 0;
        hSub.reveal = ramp(t, tHud, tHud + 0.4); hSub.opacity = hSub.reveal > 0 ? 1 : 0;
        hRule.progress = hA; hRule.opacity = 0.8;
        bracket.reveal(ramp(t, tAnat + 0.45, tAnat + 0.8, ease.outCubic), 0.9);
        tmp.copy(heartFocus).project(camera); bracket.position.set(tmp.x * A, tmp.y + 0.02, 0);
        const eIn = ramp(t, tHud + 0.05, tHud + 0.3);
        ecgMat.uniforms.uOpacity.value = eIn;
        const period = 2.0, head = (T / period) % 1;
        ecgMat.uniforms.uHead.value = head;
        for (let i = 0; i < ECG_N; i++) {
          let age = head - ecgX[i]; if (age < 0) age += 1;
          ecgPos[i * 3 + 1] = ECG_Y + ecg(T - age * period) * ECG_H;
        }
        ecgGeo.attributes.position.needsUpdate = true;
        ecgGrid.progress = eIn; ecgGrid.opacity = 0.9;
        ecgLab.reveal = eIn; ecgLab.opacity = eIn > 0 ? 1 : 0;
        hrLab.reveal = ramp(t, tHud + 0.1, tHud + 0.35); hrLab.opacity = hrLab.reveal > 0 ? 1 : 0; hrLab.intensity = 1.2 + beat * 1.2;
        bpmLab.reveal = hrLab.reveal; bpmLab.opacity = hrLab.opacity;
        gauges.forEach((g, i) => {
          const p = ramp(t, tHud + 0.15 + i * 0.1, tHud + 0.55 + i * 0.1, ease.outCubic);
          g.ring.reveal(p, 0.9); g.arc.progress = p; g.arc.opacity = p > 0 ? 1 : 0;
          g.kt.reveal = p; g.kt.opacity = p > 0 ? 1 : 0; g.vt.reveal = sat(p * 1.3 - 0.2); g.vt.opacity = p > 0.15 ? 1 : 0;
        });
        for (const { c, anchor, t0 } of CALL) {
          const p = ramp(t, t0, t0 + 0.32, ease.outCubic);
          c.visible = p > 0;
          if (!c.visible) continue;
          tmp.copy(anchor).applyMatrix4(heart.matrixWorld).project(camera);
          c.position.set(tmp.x * A, tmp.y, 0);
          c.reveal(p, 1);
          if (c.sub) c.sub.reveal = sat((p - 0.4) / 0.5); // (lib Callout never finishes the sub-label wipe)
        }
      }

      // -------- lens
      if (t < tAnat + 0.1) {
        // focus rides along the helix just ahead of the camera
        const fd = Math.max(1.2, camPos.z + 14 + 0.6);
        api.dof.focus = t > tAnat - 0.35 ? lerp(fd, camPos.distanceTo(PAGE_POS), ramp(t, tAnat - 0.35, tAnat - 0.05)) : fd;
        api.dof.range = 1.4 + Math.max(0, camPos.z + 14) * 0.12;
        api.dof.amount = 0.75 * (1 - ramp(t, tAnat - 0.2, tAnat + 0.1));
      } else {
        api.dof.focus = camPos.distanceTo(heartFocus); api.dof.range = 3; api.dof.amount = 0;
      }
      api.exposure = 1.0 + envelope(t, tAnat - 0.3, tAnat + 0.2, 0.15, 0.25) * 0.25;
      api.bloom.strength = 0.8 + envelope(t, tAnat - 0.3, tAnat + 0.3, 0.2, 0.2) * 0.4;
    },
  };
  return api;
}
