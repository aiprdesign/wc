// KNOWLEDGE (42.5–46.0 s) — instanced-mesh choreography + multi-stage morphing +
// network visualisation.
//
//   42.5  zoom-in from computing: a warm core of light, the first pages leaving it
//   42.8  pagesFly   — thousands of printed pages burst out of the core, the camera
//                      pushes through the stream
//   43.6  pageSphere — the pages turn and fly to Fibonacci-sphere slots around the
//                      core (facing outward), the sphere starts to rotate
//   44.4  books      — a latitude wave turns every page into a leather volume, gold
//                      spines outward (a globe-shaped library)
//   44.9  pixels     — books collapse into cool-white voxels snapped to a grid
//   45.3  network    — voxels explode into a vast network of nodes + links + pulses,
//                      the camera speed-ramps through it into the 'flash' (45.75)
//
// One InstancedMesh (3000 thin boxes) carries pages → books → pixels entirely in the
// vertex shader: every stage is a pure function of the `uT` uniform.
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { MorphParticles, Dust } from '../lib/particles.js';
import { glowSprite } from '../lib/materials.js';
import { sat, lerp, smoothstep, ease, timeWarp, rng, envelope } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';

const N_PAGES = 3000;
const SPHERE_R = 2.4;
const CELL = 0.16;
const SPIN_AXIS = new THREE.Vector3(Math.sin(0.35), Math.cos(0.35), 0).normalize();
const SPIN_TOTAL = 2.2;

// ---------------------------------------------------------------------------
// Printed-page atlas: 4 × 2 typeset pages (Cormorant Garamond), cream paper.

const CORPUS = `Omnis cognitio nostra incipit a sensibus deinde procedit ad intellectum et finitur in ratione
qua nihil est altius ad elaborandam materiam intuitionis et eam sub summam unitatem cogitationis redigendam
natura enim simplex est et rerum causis superfluis non luxuriat hypotheses non fingo quidquid enim ex phaenomenis
non deducitur hypothesis vocanda est et hypotheses seu metaphysicae seu physicae in philosophia experimentali
locum non habent in hac philosophia propositiones deducuntur ex phaenomenis et redduntur generales per inductionem
sic impenetrabilitas mobilitas et impetus corporum et leges motuum et gravitatis innotuerunt satis est quod
gravitas revera existat et agat secundum leges a nobis expositas et ad corporum caelestium et maris nostri motus
omnes sufficiat liber naturae scriptus est lingua mathematica characteres autem sunt triangula circuli
aliaeque figurae geometricae sine quibus impossibile est humanitus quicquam intellegere eppur si muove`.split(/\s+/);

function buildPageAtlas(seed = 7) {
  const CW = 512, CH = 704, W = CW * 4, H = CH * 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = rng(seed);
  const ink = '#140d07', rubric = '#8c2410';
  let wi = Math.floor(r() * CORPUS.length);
  const word = () => CORPUS[(wi++) % CORPUS.length];

  const heads = ['LIBER PRIMVS', 'DE MOTV CORPORVM', 'PHILOSOPHIAE', 'ELEMENTORVM', 'DE REVOLVTIONIBVS', 'OPTICKS', 'LIBER TERTIVS', 'DIALOGO'];

  function spaced(text, x, y, spacing, align = 'center') {
    const widths = [...text].map((ch) => g.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (text.length - 1);
    let xx = align === 'center' ? x - total / 2 : x;
    [...text].forEach((ch, i) => { g.fillText(ch, xx, y); xx += widths[i] + spacing; });
  }

  // Justified paragraph block; returns the y after the last line.
  function block(x, y, w, lines, lh, { indentFirst = 0, dropCap = false } = {}) {
    g.font = `600 18px "${FONTS.serif}"`;
    g.fillStyle = ink;
    for (let li = 0; li < lines; li++) {
      let lx = x, lw = w;
      if (dropCap && li < 3) { lx = x + 56; lw = w - 56; }
      if (li === 0 && indentFirst) { lx += indentFirst; lw -= indentFirst; }
      const ws = [];
      let width = 0;
      const sp = g.measureText(' ').width;
      while (true) {
        const wd = word();
        const ww = g.measureText(wd).width;
        if (width + ww + (ws.length ? sp : 0) > lw && ws.length) { wi--; break; }
        ws.push([wd, ww]); width += ww + (ws.length > 1 ? sp : 0);
      }
      const last = li === lines - 1;
      const extra = !last && ws.length > 1 ? (lw - width) / (ws.length - 1) : 0;
      let xx = lx;
      ws.forEach(([wd, ww]) => { g.fillText(wd, xx, y + li * lh); xx += ww + sp + extra; });
    }
    return y + lines * lh;
  }

  for (let k = 0; k < 8; k++) {
    const x0 = (k % 4) * CW, y0 = Math.floor(k / 4) * CH;
    g.save();
    g.beginPath(); g.rect(x0, y0, CW, CH); g.clip();
    // paper
    const pg = g.createLinearGradient(x0, y0, x0 + CW, y0 + CH);
    pg.addColorStop(0, '#f1e6cd'); pg.addColorStop(1, '#e2d0ab');
    g.fillStyle = pg; g.fillRect(x0, y0, CW, CH);
    for (let i = 0; i < 900; i++) {
      const a = r() * 0.06;
      g.fillStyle = r() > 0.5 ? `rgba(120,90,50,${a})` : `rgba(255,250,235,${a})`;
      g.fillRect(x0 + r() * CW, y0 + r() * CH, 1 + r() * 2, 1 + r() * 2);
    }
    const vg = g.createRadialGradient(x0 + CW / 2, y0 + CH / 2, CW * 0.2, x0 + CW / 2, y0 + CH / 2, CW * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(90,60,25,0.28)');
    g.fillStyle = vg; g.fillRect(x0, y0, CW, CH);

    g.textBaseline = 'alphabetic';
    const L = x0 + 58, Wt = CW - 116;
    // running head + rule
    g.fillStyle = ink;
    g.font = `500 15px "${FONTS.serif}"`;
    spaced(heads[k], x0 + CW / 2, y0 + 50, 3.5);
    g.strokeStyle = 'rgba(42,32,23,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L, y0 + 62); g.lineTo(L + Wt, y0 + 62); g.stroke();

    let y = y0 + 98;
    const lh = 21.5;
    if (k === 3) {
      // title page
      g.fillStyle = ink; g.font = `600 44px "${FONTS.serif}"`;
      spaced('PRINCIPIA', x0 + CW / 2, y0 + 210, 6);
      g.font = `italic 400 22px "${FONTS.serif}"`;
      spaced('Mathematica', x0 + CW / 2, y0 + 250, 1);
      g.strokeStyle = 'rgba(42,32,23,0.7)';
      g.beginPath(); g.moveTo(x0 + CW / 2 - 80, y0 + 285); g.lineTo(x0 + CW / 2 + 80, y0 + 285); g.stroke();
      // ornament: compass rose
      const cx = x0 + CW / 2, cy = y0 + 400;
      g.beginPath(); g.arc(cx, cy, 52, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(cx, cy, 36, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 36 : 60;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.stroke();
      }
      g.fillStyle = rubric; g.font = `500 17px "${FONTS.serif}"`;
      spaced('LONDINI · MDCLXXXVII', x0 + CW / 2, y0 + 540, 3);
      g.fillStyle = ink; g.font = `italic 400 16px "${FONTS.serif}"`;
      spaced('Jussu Societatis Regiae', x0 + CW / 2, y0 + 575, 1);
    } else if (k === 1) {
      // two columns
      const cw = (Wt - 24) / 2;
      g.save(); g.font = `400 17px "${FONTS.serif}"`;
      block(L, y, cw, 25, lh);
      block(L + cw + 24, y, cw, 25, lh);
      g.restore();
      g.strokeStyle = 'rgba(42,32,23,0.35)';
      g.beginPath(); g.moveTo(L + cw + 12, y - 14); g.lineTo(L + cw + 12, y + 25 * lh - 14); g.stroke();
    } else if (k === 2 || k === 6) {
      // figure + caption + text
      const fy = k === 2 ? y : y0 + 400;
      const cx = x0 + CW / 2, cy = fy + 100;
      g.strokeStyle = 'rgba(42,32,23,0.85)'; g.lineWidth = 1.3;
      if (k === 2) {
        g.beginPath(); g.arc(cx, cy, 80, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - 80, cy); g.lineTo(cx + 80, cy); g.lineTo(cx + 24, cy - 76); g.closePath(); g.stroke();
        g.beginPath(); g.moveTo(cx + 24, cy - 76); g.lineTo(cx + 24, cy); g.stroke();
        g.font = `italic 400 16px "${FONTS.serif}"`; g.fillStyle = ink;
        g.fillText('A', cx - 96, cy + 5); g.fillText('B', cx + 86, cy + 5); g.fillText('C', cx + 26, cy - 82); g.fillText('D', cx + 28, cy + 18);
      } else {
        for (let i = 1; i <= 4; i++) { g.beginPath(); g.ellipse(cx, cy, 30 * i, 20 * i, 0.15, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = ink; g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2); g.fill();
        [[0.7, 1], [2.1, 2], [4.0, 3], [5.3, 4]].forEach(([a, i]) => { g.beginPath(); g.arc(cx + Math.cos(a) * 30 * i, cy + Math.sin(a) * 20 * i, 3.5, 0, Math.PI * 2); g.fill(); });
      }
      g.font = `italic 400 15px "${FONTS.serif}"`; g.fillStyle = ink;
      spaced(k === 2 ? 'Fig. IV — De triangulis in circulo' : 'Fig. II — Systema mundi', cx, cy + 118, 0.5);
      if (k === 2) block(L, cy + 160, Wt, 15, lh, { indentFirst: 22 });
      else block(L, y, Wt, 13, lh, { indentFirst: 22 });
    } else if (k === 5) {
      // mathematical page
      y = block(L, y, Wt, 8, lh, { indentFirst: 22 });
      g.font = `italic 400 24px "${FONTS.serif}"`; g.fillStyle = ink;
      spaced('F = G · m₁ m₂ / r²', x0 + CW / 2, y + 30, 1);
      spaced('a² + b² = c²', x0 + CW / 2, y + 72, 1);
      block(L, y + 116, Wt, 12, lh, { indentFirst: 22 });
    } else {
      // body with section heading and rubricated drop cap
      if (k === 4 || k === 7) {
        g.fillStyle = rubric; g.font = `600 19px "${FONTS.serif}"`;
        spaced(k === 4 ? 'CAPVT II' : 'PROPOSITIO XI', x0 + CW / 2, y + 4, 4);
        y += 42;
      }
      g.save();
      g.fillStyle = rubric; g.font = `600 78px "${FONTS.serif}"`;
      g.fillText('ABCDEFGHILMNOPQRST'[Math.floor(r() * 18)], L - 2, y + 44);
      g.restore();
      block(L, y, Wt, k === 4 || k === 7 ? 24 : 26, lh, { dropCap: true });
    }
    // page number
    g.fillStyle = ink; g.font = `400 15px "${FONTS.serif}"`;
    spaced(String(12 + k * 17), x0 + CW / 2, y0 + CH - 34, 1);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ---------------------------------------------------------------------------
// Shaders

const QUAT = /* glsl */ `
vec4 qAxisAngle(vec3 axis, float a){ float h = a * 0.5; return vec4(axis * sin(h), cos(h)); }
vec4 qMul(vec4 a, vec4 b){ return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
vec3 qRot(vec4 q, vec3 v){ vec3 t = 2.0 * cross(q.xyz, v); return v + q.w * t + cross(q.xyz, t); }
vec4 qFromTo(vec3 a, vec3 b){ float d = dot(a, b); if (d < -0.9999) return vec4(0.0, 1.0, 0.0, 0.0); return normalize(vec4(cross(a, b), 1.0 + d)); }
vec4 qNlerp(vec4 a, vec4 b, float t){ if (dot(a, b) < 0.0) b = -b; return normalize(mix(a, b, t)); }
`;

const pageVert = /* glsl */ `
${QUAT}
attribute vec4 aSeed;   // random
attribute vec3 aDir;    // fibonacci-sphere direction
attribute vec4 aFly;    // launch time, swirl angle, cone spread, speed
attribute vec4 aMisc;   // assemble start, atlas cell, leather index, radial offset
uniform float uT, uR, uAsmDur, uBook, uPix, uGone, uCell;
uniform vec3 uCore;
uniform vec4 uSpinQ;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vFace;
varying vec4 vInfo;
varying float vSeed;
const float PI = 3.14159265;
void main(){
  float m = smoothstep(aMisc.x, aMisc.x + uAsmDur, uT);
  float bk = smoothstep(0.0, 1.0, clamp((uBook - (0.5 - 0.5 * aDir.y) * 0.55 - aSeed.x * 0.1) / 0.35, 0.0, 1.0));
  float px = smoothstep(0.0, 1.0, clamp((uPix - aSeed.y * 0.45) / 0.45, 0.0, 1.0));

  // --- flight out of the core
  float age = uT - aFly.x;
  float ag = max(age, 0.0);
  float ang = aFly.y + ag * (0.5 + aSeed.z * 0.9);
  vec3 dirF = normalize(vec3(cos(ang) * aFly.z, sin(ang) * aFly.z, 1.0));
  vec3 flyPos = uCore + dirF * (ag * aFly.w);
  flyPos.y += sin(ag * 2.3 + aSeed.w * 6.2831) * 0.12 * ag;
  float appear = smoothstep(0.0, 0.3, age);
  vec3 ax = normalize(aSeed.yzw * 2.0 - 1.0 + vec3(1e-3));
  vec4 qF = qAxisAngle(ax, aSeed.x * 6.2831 + ag * (1.0 + aSeed.y * 2.2));

  // --- sphere slot, facing outward, roll aligned to meridians (books) or loose (pages)
  vec3 d = aDir;
  vec4 q0 = qFromTo(vec3(0.0, 0.0, 1.0), d);
  vec3 yv = qRot(q0, vec3(0.0, 1.0, 0.0));
  vec3 north = normalize(vec3(0.0, 1.0, 0.0) - d * d.y + vec3(1e-4, 0.0, 0.0));
  float roll = atan(dot(cross(yv, north), d), dot(yv, north));
  roll += (aSeed.w - 0.5) * 1.0 * (1.0 - bk);
  vec4 qOut = qMul(qAxisAngle(d, roll), q0);
  float lift = (0.25 + aSeed.z * 0.45) * (1.0 - bk) * (aSeed.x > 0.5 ? 1.0 : -1.0);
  vec4 qS = qMul(uSpinQ, qMul(qOut, qMul(qAxisAngle(vec3(0.0, 1.0, 0.0), bk * PI * 0.5), qAxisAngle(vec3(1.0, 0.0, 0.0), lift))));
  float rad = uR + aMisc.w - 0.11 * bk;
  vec3 cS = uCore + qRot(uSpinQ, d * rad);

  vec4 q = qNlerp(qF, qS, m);
  vec3 c = mix(flyPos, cS, m);
  vec3 swing = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-3));
  c += swing * sin(PI * m) * (0.3 + aSeed.z * 0.6);

  // --- voxels
  vec3 cq = uCore + floor((cS - uCore) / uCell + 0.5) * uCell;
  q = qNlerp(q, vec4(0.0, 0.0, 0.0, 1.0), px);
  c = mix(c, cq, px);

  vec3 size = mix(vec3(0.26, 0.36, 0.004), vec3(0.22, 0.34, 0.14), bk);
  size = mix(size, vec3(uCell * 0.5), px);
  float gone = smoothstep(aSeed.z * 0.5, aSeed.z * 0.5 + 0.5, uGone);
  float sc = mix(appear, 0.82 + 0.18 * bk, m) * (1.0 - gone);
  // bound volume: a rounded spine and a text block set in behind the boards (covers overhang the page edges)
  vec3 pos = position;
  vec3 n = normal;
  float vol = bk * (1.0 - px);
  if (vol > 0.0) {
    float zc = clamp(pos.z * 2.0, -1.0, 1.0);
    float inner = step(abs(pos.z), 0.49);
    if (pos.x < -0.49) pos.x -= 0.1 * (1.0 - zc * zc) * vol;                 // spine (and the head/tail edges along it)
    if (normal.x < -0.5) n = normalize(vec3(-1.0, 0.0, 0.8 * zc * vol));
    float blk = inner * vol * step(-0.45, pos.x);                              // text block: neither spine nor boards
    pos.x -= 0.07 * blk * smoothstep(-0.45, 0.5, pos.x);
    pos.y -= sign(pos.y) * 0.035 * blk * step(0.49, abs(pos.y));
  }
  vec3 lp = pos * size;

  // paper bend: a curl plus a travelling flutter, both vanishing as the page binds into a book
  float flatK = (1.0 - bk) * (1.0 - px);
  float curl = mix(0.6 + aSeed.x * 2.2, 0.9, m) * (aSeed.y > 0.5 ? 1.0 : -1.0);
  float fl = sin(position.x * 5.0 + uT * (6.0 + aSeed.z * 5.0) + aSeed.w * 20.0) * mix(0.025, 0.004, m);
  lp.z += (curl * lp.x * lp.x + fl) * flatK;
  if (abs(n.z) > 0.5) { n.x -= 2.0 * curl * lp.x * flatK * n.z; n = normalize(n); }

  vec3 wp = c + qRot(q, lp * sc);
  vN = qRot(q, n);
  vW = wp;
  vUv = uv;
  vFace = normal.z > 0.5 ? 0.0 : normal.z < -0.5 ? 1.0 : normal.x < -0.5 ? 2.0 : abs(normal.x) > 0.5 ? 3.0 : 4.0;
  vInfo = vec4(aMisc.y, aMisc.z, bk, px);
  vSeed = aSeed.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const pageFrag = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uLeather[6];
uniform vec3 uKeyDir, uKeyCol, uRimDir, uRimCol, uCore, uCoreCol, uPixCol;
uniform float uT, uFog, uCoreK, uFogStart;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vFace;
varying vec4 vInfo;
varying float vSeed;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1.0, 0.0), 1.0)), c = hash(vec3(i + vec2(0.0, 1.0), 1.0)), d = hash(vec3(i + vec2(1.0, 1.0), 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float band(float x, float a, float b){ return step(a, x) * step(x, b); }
float frameMask(vec2 uv, float m, float w){
  vec2 q = abs(uv - 0.5);
  float o = max(q.x, q.y * 0.94);
  return band(o, 0.5 - m - w, 0.5 - m);
}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float bk = vInfo.z, px = vInfo.w;
  float cell = vInfo.x;
  vec2 cuv = vec2((mod(cell, 4.0) + vUv.x) / 4.0, (1.0 - floor(cell / 4.0) + vUv.y) / 2.0);
  vec3 paperBase = vec3(0.86, 0.76, 0.58);
  vec3 paper;
  if (vFace < 0.5) paper = texture2D(uAtlas, cuv).rgb;
  else if (vFace < 1.5) { vec2 mu = vec2((mod(cell, 4.0) + 1.0 - vUv.x) / 4.0, cuv.y); paper = mix(paperBase, texture2D(uAtlas, mu).rgb, 0.18); }
  else paper = paperBase * 0.85;

  // leather volume
  int li = int(vInfo.y + 0.5);
  vec3 leather = uLeather[0];
  if (li == 1) leather = uLeather[1]; else if (li == 2) leather = uLeather[2]; else if (li == 3) leather = uLeather[3]; else if (li == 4) leather = uLeather[4]; else if (li == 5) leather = uLeather[5];
  float grain = vnoise(vUv * vec2(70.0, 90.0) + vSeed * 50.0) * 0.6 + vnoise(vUv * 9.0 + vSeed * 13.0) * 0.4;
  vec3 book = leather * (0.95 + 0.6 * grain);
  float goldM = 0.0;
  if (vFace < 1.5) {
    goldM = max(frameMask(vUv, 0.06, 0.018), frameMask(vUv, 0.1, 0.007));
  } else if (vFace < 2.5) {
    float v = vUv.y;
    goldM = max(max(band(v, 0.1, 0.125), band(v, 0.16, 0.172)), max(band(v, 0.83, 0.842), band(v, 0.875, 0.9)));
    float lab = band(v, 0.52, 0.7) * band(vUv.x, 0.12, 0.88);
    book = mix(book, book * 0.55, lab);
    goldM = max(goldM, lab * max(band(v, 0.52, 0.535), band(v, 0.685, 0.7)));
    goldM = max(goldM, lab * band(v, 0.58, 0.64) * step(0.55, vnoise(vec2(vUv.x * 22.0, vSeed * 91.0))) * band(vUv.x, 0.22, 0.78));
  } else {
    float s = vFace < 3.5 ? vUv.x : vUv.y;
    book = paperBase * (0.72 + 0.18 * sin(s * 420.0 + vSeed * 30.0)) * 0.9;
  }
  vec3 gold = vec3(1.0, 0.7, 0.3);
  book = mix(book, gold * 0.55, goldM);
  vec3 albedo = mix(paper, book, bk);
  float metal = goldM * bk;

  // lighting: warm key, cool rim, the core as a warm point light (+ paper translucency)
  vec3 L = normalize(uKeyDir);
  vec3 R = normalize(uRimDir);
  vec3 Lc = uCore - vW; float dc = length(Lc); Lc /= dc;
  float att = uCoreK / (1.0 + dc * dc * 0.09);
  float ndl = max(dot(N, L), 0.0);
  vec3 col = albedo * (0.035 + 0.09 * bk);   // (a little fill on the bound volumes: they face away from the key)
  col += albedo * uKeyCol * ndl * (1.0 - metal * 0.7);
  col += albedo * uRimCol * max(dot(N, R), 0.0) * 0.55;
  col += albedo * uCoreCol * max(dot(N, Lc), 0.0) * att;
  col += albedo * uCoreCol * max(dot(-N, Lc), 0.0) * att * 0.3 * (1.0 - bk);
  vec3 F = normalize(vec3(0.6, -0.1, 1.0));
  col += albedo * vec3(0.75, 0.62, 0.5) * max(dot(N, F), 0.0) * 0.32 * (1.0 - metal * 0.5);
  col += vec3(1.0, 0.7, 0.35) * pow(max(dot(N, normalize(F + V)), 0.0), 40.0) * metal * 0.9;
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(N, H), 0.0), mix(24.0, 70.0, metal)) * mix(0.05, 2.2, metal);
  col += uKeyCol * mix(vec3(1.0), gold, metal) * sp;
  vec3 Hr = normalize(R + V);
  col += uRimCol * gold * pow(max(dot(N, Hr), 0.0), 50.0) * metal * 1.4;
  col += uRimCol * pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.12 * (1.0 - px);

  // voxels: cool-white emissive with a stepped digital shimmer
  float fl = hash(floor(vW * 6.25) + floor(uT * 14.0));
  vec3 pix = uPixCol * (0.12 + 1.1 * step(0.8, fl) * fl) * (0.65 + 0.35 * max(dot(N, V), 0.0));
  if (vFace > 1.5) pix *= 0.7;
  col = mix(col, pix, px);

  float dist = length(cameraPosition - vW);
  col *= exp(-max(0.0, dist - uFogStart) * uFog);
  gl_FragColor = vec4(col, 1.0);
}`;

const linkVert = /* glsl */ `
attribute float aT;
attribute float aDelay;
varying float vT; varying float vDelay; varying float vFade;
void main(){
  vT = aT; vDelay = aDelay;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = smoothstep(70.0, 12.0, -mv.z) * smoothstep(0.2, 2.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const linkFrag = /* glsl */ `
uniform float uGrow, uOpacity; uniform vec3 uColor;
varying float vT; varying float vDelay; varying float vFade;
void main(){
  float g = clamp((uGrow - vDelay) / 0.35, 0.0, 1.0);
  if (vT > g) discard;
  float head = smoothstep(g - 0.15, g, vT) * step(g, 0.999);
  gl_FragColor = vec4(uColor * (1.0 + head * 3.0), uOpacity * vFade);
}`;

const pulseVert = /* glsl */ `
attribute vec3 aB;
attribute vec2 aSeed;
uniform float uT, uSize, uViewport, uGrow;
varying float vA;
void main(){
  float f = fract(uT * (0.6 + aSeed.x * 1.4) + aSeed.y);
  vec3 p = mix(position, aB, f);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
  vA = smoothstep(70.0, 10.0, -mv.z) * smoothstep(0.3, 2.0, -mv.z) * clamp((uGrow - aSeed.y * 0.5) / 0.3, 0.0, 1.0) * sin(3.14159 * f);
}`;
const pulseFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  if (a * vA * uOpacity < 0.003) discard;
  gl_FragColor = vec4(uColor, a * vA * uOpacity);
}`;

const streakVert = /* glsl */ `
attribute float aEnd;
uniform float uCamZ, uLen, uSpan;
varying float vA; varying float vEnd;
void main(){
  float z = uCamZ - uSpan + mod(position.z - uCamZ, uSpan);
  float a = smoothstep(uCamZ - uSpan, uCamZ - uSpan + 12.0, z) * smoothstep(uCamZ - 0.5, uCamZ - 6.0, z);
  vec3 p = vec3(position.xy, z + aEnd * uLen);
  vA = a; vEnd = aEnd;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const streakFrag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity;
varying float vA; varying float vEnd;
void main(){ gl_FragColor = vec4(uColor * (1.0 - vEnd * 0.8), vA * uOpacity * (1.0 - vEnd)); }`;

// ---------------------------------------------------------------------------

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 220);
  scene.add(camera);
  const cue = (name) => CUES[name] - segment.start;
  const C_FLY = cue('pagesFly'), C_SPH = cue('pageSphere'), C_BOOK = cue('books'), C_PIX = cue('pixels'), C_NET = cue('network');
  const DUR = segment.end - segment.start;
  const CORE = new THREE.Vector3(0, 0, -14);
  const r = rng(4242);

  // ---- instanced pages ---------------------------------------------------
  const box = new THREE.BoxGeometry(1, 1, 1, 6, 2, 3);   // z segments: the rounded spine / inset page block of the bound volumes
  const dirs = new Float32Array(N_PAGES * 3);
  const seeds = new Float32Array(N_PAGES * 4), fly = new Float32Array(N_PAGES * 4), misc = new Float32Array(N_PAGES * 4);
  const g = Math.PI * (3 - Math.sqrt(5));
  const order = [...Array(N_PAGES).keys()];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (let i = 0; i < N_PAGES; i++) {
    const k = order[i];                                   // shuffled slot so arrivals are scattered over the sphere
    const y = 1 - (k / (N_PAGES - 1)) * 2, rr = Math.sqrt(1 - y * y), th = g * k;
    dirs.set([Math.cos(th) * rr, y, Math.sin(th) * rr], i * 3);
    seeds.set([r(), r(), r(), r()], i * 4);
    // launch: a few already in flight at the head of the shot, most burst on the pagesFly cue
    const u = r();
    const launch = u < 0.12 ? -0.9 + u * 7 : C_FLY - 0.05 + Math.pow(r(), 1.6) * 0.5;
    const spread = 0.05 + Math.pow(r(), 0.8) * 0.32;
    fly.set([launch, r() * Math.PI * 2, spread, 9 + r() * 9], i * 4);
    const asm = C_SPH - 0.62 + Math.pow(r(), 1.5) * 0.55;
    misc.set([asm, Math.floor(r() * 8), Math.floor(r() * 6), r() * 0.07], i * 4);
  }
  box.setAttribute('aDir', new THREE.InstancedBufferAttribute(dirs, 3));
  box.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  box.setAttribute('aFly', new THREE.InstancedBufferAttribute(fly, 4));
  box.setAttribute('aMisc', new THREE.InstancedBufferAttribute(misc, 4));
  // (lighter than period leather: the darkest bindings vanished into the black void and the globe read as full of holes)
  const leather = ['#7a2418', '#93501f', '#2f5e3d', '#2f4470', '#62402a', '#a8662e'].map((c) => new THREE.Color(c));
  const pageMat = new THREE.ShaderMaterial({
    uniforms: {
      uT: { value: 0 }, uR: { value: SPHERE_R }, uAsmDur: { value: 0.5 }, uBook: { value: 0 }, uPix: { value: 0 }, uGone: { value: 0 },
      uCell: { value: CELL }, uCore: { value: CORE }, uSpinQ: { value: new THREE.Vector4(0, 0, 0, 1) },
      uAtlas: { value: buildPageAtlas() }, uLeather: { value: leather },
      uKeyDir: { value: new THREE.Vector3(-0.85, 0.55, 0.3) }, uKeyCol: { value: new THREE.Color(1.0, 0.82, 0.62).multiplyScalar(1.3) },
      uRimDir: { value: new THREE.Vector3(0.9, 0.2, -0.45) }, uRimCol: { value: new THREE.Color(0.55, 0.7, 1.0).multiplyScalar(1.1) },
      uCoreCol: { value: new THREE.Color(1.0, 0.72, 0.4).multiplyScalar(1.6) }, uCoreK: { value: 1 },
      uPixCol: { value: new THREE.Color(0.8, 0.9, 1.0).multiplyScalar(1.0) }, uFog: { value: 0.07 }, uFogStart: { value: 7 },
    },
    vertexShader: pageVert, fragmentShader: pageFrag,
  });
  // AR: the shader places every page round the core, so the vitrine's clip (which tests the unplaced
  // vertex) would cut them all: the sphere is left unclipped (it sits inside the vitrine anyway)
  pageMat.userData.arNoClip = true;
  const pages = new THREE.InstancedMesh(box, pageMat, N_PAGES);
  pages.frustumCulled = false;
  scene.add(pages);
  const pu = pageMat.uniforms;

  // CPU mirror of the shader's final voxel positions (spin has settled by then) → network start.
  const spinFinal = new THREE.Quaternion().setFromAxisAngle(SPIN_AXIS, SPIN_TOTAL);
  const voxel = new Float32Array(N_PAGES * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < N_PAGES; i++) {
    const rad = SPHERE_R + misc[i * 4 + 3] - 0.11;
    tmp.set(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]).multiplyScalar(rad).applyQuaternion(spinFinal);
    voxel[i * 3] = CORE.x + Math.floor(tmp.x / CELL + 0.5) * CELL;
    voxel[i * 3 + 1] = CORE.y + Math.floor(tmp.y / CELL + 0.5) * CELL;
    voxel[i * 3 + 2] = CORE.z + Math.floor(tmp.z / CELL + 0.5) * CELL;
  }

  // ---- network: nodes clustered around hubs along the flight corridor -----
  const hubs = [];
  for (let i = 0; i < 26; i++) {
    const z = -8 - i * 2.6 - r() * 2;
    const a = r() * Math.PI * 2, d = 2.2 + r() * 6;
    hubs.push(new THREE.Vector3(Math.cos(a) * d * 1.5, Math.sin(a) * d * 0.7, z));
  }
  const net = new Float32Array(N_PAGES * 3);
  const netCol = new Float32Array(N_PAGES * 3);
  const nodes = [];
  for (let i = 0; i < N_PAGES; i++) {
    let p;
    if (r() < 0.62) {
      const h = hubs[Math.floor(r() * hubs.length)];
      const s = 0.5 + r() * 1.8;
      p = new THREE.Vector3(h.x + (r() - 0.5) * s * 2, h.y + (r() - 0.5) * s * 1.4, h.z + (r() - 0.5) * s * 2);
    } else {
      p = new THREE.Vector3((r() - 0.5) * 30, (r() - 0.5) * 14, -7 - r() * 66);
    }
    const lat = Math.hypot(p.x, p.y * 1.4);
    if (lat < 0.9) { const k = 0.9 / Math.max(lat, 1e-3); p.x *= k; p.y *= k; }
    nodes.push(p);
    net.set([p.x, p.y, p.z], i * 3);
    const warm = r() < 0.08;
    const c = warm ? [1.0, 0.78, 0.5] : r() < 0.35 ? [0.55, 0.8, 1.0] : [0.85, 0.93, 1.0];
    netCol.set(c, i * 3);
  }
  const nodesP = new MorphParticles({ count: N_PAGES, positions: voxel, targets: net, colors: netCol, size: 0.085, intensity: 2.2, stagger: 0.3, seed: 9 });
  nodesP.u.sizeJitter = 0.6;
  scene.add(nodesP);

  // links: each node → up to 3 nearest neighbours within reach (+ hub backbone)
  const segs = [];
  const maxD2 = 3.2 * 3.2;
  for (let i = 0; i < nodes.length; i++) {
    const best = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const d2 = nodes[i].distanceToSquared(nodes[j]);
      if (d2 > maxD2) continue;
      if (best.length < 3) { best.push([d2, j]); best.sort((a, b) => a[0] - b[0]); }
      else if (d2 < best[2][0]) { best[2] = [d2, j]; best.sort((a, b) => a[0] - b[0]); }
    }
    for (const [, j] of best) if (j > i || r() < 0.3) segs.push([i, j]);
  }
  for (let i = 0; i < hubs.length - 1; i++) segs.push([-1 - i, -2 - i]);
  const hubPos = (k) => (k < 0 ? hubs[-1 - k] : nodes[k]);
  const lpos = new Float32Array(segs.length * 6), lt = new Float32Array(segs.length * 2), ld = new Float32Array(segs.length * 2);
  segs.forEach(([a, b], i) => {
    const A = hubPos(a), B = hubPos(b);
    lpos.set([A.x, A.y, A.z, B.x, B.y, B.z], i * 6);
    lt.set([0, 1], i * 2);
    const dl = sat((-A.z - 7) / 70) * 0.5 + r() * 0.3;
    ld.set([dl, dl], i * 2);
  });
  const linkGeo = new THREE.BufferGeometry();
  linkGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  linkGeo.setAttribute('aT', new THREE.BufferAttribute(lt, 1));
  linkGeo.setAttribute('aDelay', new THREE.BufferAttribute(ld, 1));
  const linkMat = new THREE.ShaderMaterial({
    uniforms: { uGrow: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.45, 0.68, 1.0).multiplyScalar(0.9) } },
    vertexShader: linkVert, fragmentShader: linkFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const links = new THREE.LineSegments(linkGeo, linkMat);
  links.frustumCulled = false;
  scene.add(links);

  // pulses travelling along links
  const NP = Math.min(2400, segs.length);
  const pA = new Float32Array(NP * 3), pB = new Float32Array(NP * 3), pS = new Float32Array(NP * 2);
  for (let i = 0; i < NP; i++) {
    const s = segs[Math.floor(r() * segs.length)];
    const A = hubPos(s[0]), B = hubPos(s[1]);
    pA.set([A.x, A.y, A.z], i * 3); pB.set([B.x, B.y, B.z], i * 3); pS.set([r(), r()], i * 2);
  }
  const pulseGeo = new THREE.BufferGeometry();
  pulseGeo.setAttribute('position', new THREE.BufferAttribute(pA, 3));
  pulseGeo.setAttribute('aB', new THREE.BufferAttribute(pB, 3));
  pulseGeo.setAttribute('aSeed', new THREE.BufferAttribute(pS, 2));
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 0.12 }, uViewport: { value: 800 }, uGrow: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.85, 0.95, 1.0).multiplyScalar(4) } },
    vertexShader: pulseVert, fragmentShader: pulseFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pulses = new THREE.Points(pulseGeo, pulseMat);
  pulses.frustumCulled = false;
  scene.add(pulses);

  // warp streaks for the speed ramp
  const NS = 700;
  const sPos = new Float32Array(NS * 6), sEnd = new Float32Array(NS * 2);
  for (let i = 0; i < NS; i++) {
    const a = r() * Math.PI * 2, d = 1.2 + Math.pow(r(), 0.7) * 9;
    const x = Math.cos(a) * d * 1.6, y = Math.sin(a) * d * 0.75, z = r() * 60;
    sPos.set([x, y, z, x, y, z], i * 6); sEnd.set([0, 1], i * 2);
  }
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  streakGeo.setAttribute('aEnd', new THREE.BufferAttribute(sEnd, 1));
  const streakMat = new THREE.ShaderMaterial({
    uniforms: { uCamZ: { value: 0 }, uLen: { value: 1 }, uSpan: { value: 60 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0.75, 0.88, 1.0).multiplyScalar(2.5) } },
    vertexShader: streakVert, fragmentShader: streakFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const streaks = new THREE.LineSegments(streakGeo, streakMat);
  streaks.frustumCulled = false;
  scene.add(streaks);

  // ---- light core + atmosphere -------------------------------------------
  const core = glowSprite({ color: '#ffc27a', intensity: 3, scale: 4 });
  const halo = glowSprite({ color: '#ff9a4a', intensity: 0.6, scale: 14 });
  core.position.copy(CORE); halo.position.copy(CORE);
  core.renderOrder = 5; halo.renderOrder = 4;
  scene.add(halo, core);
  const dust = new Dust({ count: 1800, size: [16, 9, 34], center: [0, 0, -6], color: '#ffd9a8', particleSize: 0.035, opacity: 0.45, intensity: 1.4, seed: 21 });
  scene.add(dust);

  // ---- HUD stage labels (only while DOF is off — the HUD pass clears depth) ----
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  // open-matte delivery (?aspect=1 …): keep these labels anchored bottom-left, scaled up to stay legible
  // and lifted clear of the showreel HUD line (identity in the 2.39 frame)
  const SQ = OUTPUT_ASPECT < 1.5, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y);
  const labelText = ['01 — PRINTED PAGE', '02 — BOUND VOLUME', '03 — DIGITAL BIT', '04 — GLOBAL NETWORK'];
  const labelCue = [C_SPH, C_BOOK, C_PIX, C_NET];
  const labels = labelText.map((s) => {
    const tp = new TextPlane(s, { font: FONTS.mono, weight: 400, height: 0.042 * UI, letterSpacing: 0.32, color: '#e8eef7', intensity: 1.1, align: 'left' });
    tp.position.set(HX(0.16) + tp.worldWidth / 2, HY(-0.84), 0);
    hud.scene.add(tp);
    return tp;
  });
  const caption = new TextPlane('Bibliotheca universalis', { font: FONTS.serif, italic: true, weight: 500, height: 0.062 * UI, color: '#f3e3c4', intensity: 1.0, align: 'left' });
  caption.position.set(HX(0.16) + caption.worldWidth / 2, HY(-0.76), 0);
  hud.scene.add(caption);
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0028), new THREE.MeshBasicMaterial({ color: new THREE.Color('#e8eef7').multiplyScalar(0.9), transparent: true, depthWrite: false }));
  hud.scene.add(tick);

  let lastT = 0;
  const self = {
    scene, camera, hud: null, background: 0x000000,
    // the page stream / globe library is a real 3D volume; the network flight is a speed-ramped corridor
    // AR: the page sphere round the core (its pages are see-through to the depth probe)
    arSubject: () => ({ centre: CORE, radius: SPHERE_R * 1.2 }),
    get exploreLimits() { return lastT < C_NET ? { yaw: 1.2, pitchDown: 0.5, pitchUp: 0.9, zoomOut: 2.4 } : { yaw: 0.9, pitchDown: 0.35, pitchUp: 0.6, zoomOut: 2.0 }; },
    dof: { focus: 8, range: 3, amount: 0 },
    bloom: { strength: 0.75 },
    exposure: 1,
    update,
    explorePosed,
  };
  // Viewer camera: (1) the page globe's depth fade is keyed to the lens distance — pulled back, the globe went
  // to a dark smudge beside its bright core; the fade now starts that much further out. (2) The warp streaks
  // are a lens trick (lines laid along the flight axis around the camera): seen off that axis they read as a
  // wall of parallel sticks, so they fade out as the view turns away from the flight direction.
  const exF = new THREE.Vector3();
  let camD = 0;
  function explorePosed(cam) {
    pu.uFogStart.value = 7 + Math.max(0, cam.position.distanceTo(CORE) - camD);
    exF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    streakMat.uniforms.uOpacity.value *= smoothstep(0.93, 0.985, -exF.z);
  }

  const camKeys = [[0, 6], [1.0, 1.2], [1.95, -5.4], [C_NET, -6.4], [3.02, -11], [3.28, -38], [3.5, -78]];
  const spinQ = new THREE.Quaternion();
  const COOL = new THREE.Color(0.8, 0.9, 1.0);
  const look = new THREE.Vector3();

  function update(t, info) {
    const T = info.T;
    // stage drivers
    pu.uT.value = t;
    const spinA = SPIN_TOTAL * ease.outCubic(sat((t - (C_SPH - 0.6)) / 1.9));
    spinQ.setFromAxisAngle(SPIN_AXIS, spinA);
    pu.uSpinQ.value.set(spinQ.x, spinQ.y, spinQ.z, spinQ.w);
    pu.uBook.value = sat((t - (C_BOOK - 0.2)) / 0.5) * 1.0;
    pu.uPix.value = sat((t - (C_PIX - 0.12)) / 0.42) * 1.0;
    pu.uGone.value = sat((t - (C_NET - 0.05)) / 0.35);
    const beat = pulse(T, { decay: 5 });
    pu.uCoreK.value = lerp(1.0, 0.35, sat((t - C_BOOK) / 0.6)) * (1 - sat((t - C_PIX) / 0.3)) * (1 + beat * 0.25);

    // network
    const netMix = sat((t - (C_NET - 0.08)) / 0.42);
    nodesP.u.mix = netMix;
    nodesP.u.opacity = sat((t - (C_NET - 0.1)) / 0.2);
    nodesP.u.noise = 0.05;
    nodesP.u.intensity = (0.5 + 1.7 * sat((t - C_NET) / 0.35)) * (1 + beat * 0.3);
    nodesP.visible = t > C_NET - 0.15;
    nodesP.tick(t, info);
    const grow = sat((t - (C_NET + 0.05)) / 0.5);
    linkMat.uniforms.uGrow.value = grow * 1.4;
    linkMat.uniforms.uOpacity.value = 0.55 * sat((t - C_NET) / 0.2);
    links.visible = t > C_NET;
    pulseMat.uniforms.uT.value = t;
    pulseMat.uniforms.uGrow.value = grow * 1.4;
    pulseMat.uniforms.uOpacity.value = sat((t - C_NET - 0.1) / 0.2);
    pulseMat.uniforms.uViewport.value = info.height;
    pulses.visible = t > C_NET;

    // camera: push through the stream, settle on the sphere, then speed-ramp through the network
    const cz = timeWarp(t, camKeys);
    const orbit = envelope(t, C_SPH - 0.4, C_NET + 0.1, 0.8, 0.6);
    const ox = Math.sin(t * 0.9) * 1.6 * orbit + Math.sin(t * 0.5) * 0.25;
    const oy = 0.45 * orbit + Math.sin(t * 0.7) * 0.12;
    camera.position.set(ox, oy, cz);
    const fwd = sat((t - C_NET) / 0.3);
    look.set(CORE.x * (1 - fwd) + ox * 0.6 * fwd, CORE.y * (1 - fwd) + oy * 0.6 * fwd, lerp(CORE.z, cz - 20, fwd));
    camera.lookAt(look);
    const speed = Math.abs(timeWarp(t + 0.01, camKeys) - cz) / 0.01;
    camera.rotation.z += Math.sin(t * 1.3) * 0.03 + fwd * Math.sin(t * 3.0) * 0.06;
    camera.fov = 35 + sat((speed - 10) / 140) * 28 + (1 - sat(t / 1.2)) * 4;
    camera.updateProjectionMatrix();
    camD = camera.position.distanceTo(CORE); pu.uFogStart.value = 7;

    streakMat.uniforms.uCamZ.value = cz;
    streakMat.uniforms.uLen.value = Math.min(18, speed * 0.05);
    streakMat.uniforms.uOpacity.value = sat((speed - 15) / 80) * 0.8;
    streaks.visible = speed > 15;

    // glow core: warm light of knowledge, cools to white as the data age begins
    const coreI = (2.2 + beat * 0.6) * (1 - sat((t - C_BOOK) / 0.5) * 0.6) * (1 - sat((t - C_PIX) / 0.3));
    core.material.color.setRGB(1.0, 0.76, 0.48).lerp(COOL, sat((t - C_PIX) / 0.3)).multiplyScalar(coreI);
    core.scale.setScalar(3.2 + beat * 0.6 + (1 - sat(t / 0.4)) * 1.5);
    halo.material.color.setRGB(1.0, 0.6, 0.3).multiplyScalar(0.55 * (1 - sat((t - C_PIX) / 0.4)));
    core.visible = coreI > 0.01;

    dust.tick(t, info);
    dust.u.opacity = 0.45 * (1 - sat((t - C_NET) / 0.3));

    // post
    const dofOn = t < C_SPH - 0.05;
    self.dof.amount = dofOn ? 0.55 * (1 - sat((t - (C_SPH - 0.4)) / 0.35)) : 0;
    self.dof.focus = Math.max(4, cz - CORE.z - 6);
    if (self.dof.amount <= 0.01) self.dof.focus = camera.position.distanceTo(t < C_NET ? CORE : look);   // unused by the film: Explore 3D orbits the sphere
    lastT = t;
    self.dof.range = 5;
    self.bloom.strength = 0.7 + sat((t - C_NET) / 0.4) * 0.3;
    self.exposure = 1;

    // HUD labels
    self.hud = dofOn ? null : hud;
    let anyVis = 0;
    labels.forEach((tp, i) => {
      const a = labelCue[i], b = i < 3 ? labelCue[i + 1] : DUR;
      const e = envelope(t, a - 0.02, b + 0.02, 0.08, 0.1, ease.linear);
      tp.reveal = sat((t - a) / 0.3);
      tp.opacity = e * (i === 3 ? 1 - sat((t - (C_NET + 0.3)) / 0.15) : 1);
      anyVis = Math.max(anyVis, tp.opacity);
    });
    caption.opacity = envelope(t, C_SPH, C_NET + 0.2, 0.3, 0.2);
    caption.reveal = sat((t - C_SPH) / 0.5);
    const tp = sat((t - C_SPH) / (DUR - C_SPH));
    tick.scale.set((0.5 * tp + 0.001) * UI, UI, 1);
    tick.position.set(HX(0.16) + tick.scale.x / 2, HY(-0.885), 0);
    tick.material.opacity = anyVis * 0.8;
  }

  return self;
}
