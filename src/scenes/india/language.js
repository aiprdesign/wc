// LANGUAGE & GRAMMAR (12.0 – 16.0 s) — Indian film, chapter II: Panini's grammar, c. 4th century BC.
//
//   12.0  a lamp-lit scholar's table: a palm-leaf manuscript bundle (painted wooden covers, a cord through
//         the string hole) lies on its red wrapping cloth; the camera is already drifting in
//   12.3  palmLeaf    — the bundle lifts and fans open round its cord, covers at either end of the fan
//   13.0  sutras      — rows of script incise themselves into every folio, rule by rule (each sutra closed by
//                       a double bar), glowing as they are cut, then darkening like soot-filled incisions
//   13.8  grammarTree — the glowing strokes lift off the leaves and flow into a derivation in the air:
//                       √BHU (root) + A + TI → BHU+A+TI → BHO+A+TI (rule 7.3.84) → BHAVATI (rule 6.1.78)
//   14.8  scripts     — the word collapses into one Brahmi letter (KA, a cross) on the table, which branches
//                       across a map-like plane into seven of the scripts descended from Brahmi, while the
//                       manuscript folds shut again
//
// Technique: procedural modelling (extruded folios with cut string holes, bevelled covers, lathe-turned brass
// lamp, shelves of wrapped bundles), a writing shader (per-folio reveal ordered row by row, hot leading edge
// cooling to an incised dark line), self-drawing tubes for the derivation and the script family tree.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, timeWarp, fract } from '../../lib/math.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { segmentsLine, progressLine, progressTube, circlePoints } from '../../lib/lines.js';
import { glowSprite } from '../../lib/materials.js';
import { Dust } from '../../lib/particles.js';
import { Callout, BracketFrame, faceCamera } from '../../lib/hud.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { pulse } from '../../lib/rhythm.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = '#ffcf85';
const LABEL = '#ffe3b3';

// folio dimensions (scene units; a real folio is ~40 × 5 cm — the bundle is shown about 8× life size)
const LEAF_L = 3.2, LEAF_W = 0.42, LEAF_T = 0.012, HOLE_X = 0.95, HOLE_R = 0.034;
const COVER_L = 3.32, COVER_W = 0.5, COVER_T = 0.06;
const NLEAF = 13;
// script rows on a folio (texture v from the bottom): row r spans v ∈ [0.685 - 0.19 r, 0.875 - 0.19 r]
const ROWS = 4, ROW_TOP = 0.875, ROW_H = 0.19;

// ---------------------------------------------------------------------------------------------- textures
function paintCanvas(w, h, fn) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = fn(x / w, y / h), i = (y * w + x) * 4;
    d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Dark, oiled planks running along u (seams, butt joints, ring figure and fine grain).
function woodTexture({ seed = 1, planks = 4, base = [70, 40, 22] } = {}) {
  const c = paintCanvas(512, 512, (u, v) => {
    const j = Math.floor(v * planks), pv = v * planks - j, s = j * 13.7 + seed * 5.1;
    const broad = fbm2(u * 2.2 + s, pv * 0.7 + j, 4);
    const ring = 0.5 + 0.5 * Math.sin(pv * 34 + fbm2(u * 1.6 + s, pv * 1.3 + s, 3) * 9);
    const fine = noise2(u * 3 + s, pv * 160) * 0.5 + 0.5;
    let l = 0.72 + broad * 0.3 + ring * 0.12 + fine * 0.08;
    const seam = Math.min(pv, 1 - pv);
    if (seam < 0.014) l *= 0.3 + 0.7 * seam / 0.014;
    const bu = fract(u + j * 0.37 + seed * 0.21);
    if (bu < 0.004) l *= 0.35;
    return base.map((b, k) => Math.min(255, b * l * (k === 0 ? 1.05 : 1)));
  });
  return toTexture(c, { repeat: true });
}

// Palm-leaf folio: straw ground, longitudinal fibres, age spots, browned edges and ends.
function leafTexture(seed) {
  const c = paintCanvas(1024, 128, (u, v) => {
    const fib = noise2(u * 5 + seed, v * 70) * 0.05 + noise2(u * 30, v * 260 + seed) * 0.03;
    const blot = Math.max(0, fbm2(u * 6 + seed * 3, v * 1.6, 3)) * 0.16;
    const spot = Math.max(0, noise2(u * 40 + seed, v * 6) - 0.72) * 0.9;
    const e = Math.min(v, 1 - v), en = Math.min(u, 1 - u);
    const edge = 1 - smoothstep(0, 0.12, e) * smoothstep(0, 0.025, en);
    const l = 1 + fib - blot - spot;
    const a = [212, 186, 128], b = [128, 86, 44];
    return a.map((x, k) => Math.max(0, Math.min(255, lerp(x, b[k], edge * 0.75) * l)));
  });
  return toTexture(c);
}

// Script mask (white strokes on black): abstract aksharas in four rows, sutras closed by double bars,
// the zones round the two string holes left blank as on a real folio. Not real letters — geometry only.
function scriptTexture(seed) {
  const W = 2048, H = 256, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(seed * 31 + 7);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const holes = [0.5 - HOLE_X / LEAF_L, 0.5 + HOLE_X / LEAF_L];
  for (let row = 0; row < ROWS; row++) {
    const cy = H * (1 - (ROW_TOP - ROW_H * (row + 0.5))), gh = H * ROW_H * 0.6;
    let x = W * 0.035, sinceBar = 0, nextBar = 6 + Math.floor(r() * 9);
    while (x < W * 0.965) {
      const u = x / W;
      if (holes.some((h) => Math.abs(u - h) < 0.032)) { x += W * 0.004; continue; }
      const gw = gh * (0.7 + r() * 0.35), y0 = cy - gh / 2, y1 = cy + gh / 2;
      g.lineWidth = 6 + r() * 1.5;
      if (sinceBar >= nextBar) {                                        // || : the end of a sutra
        g.beginPath(); g.moveTo(x + gw * 0.2, y0); g.lineTo(x + gw * 0.2, y1); g.moveTo(x + gw * 0.55, y0); g.lineTo(x + gw * 0.55, y1); g.stroke();
        x += gw * 1.4; sinceBar = 0; nextBar = 5 + Math.floor(r() * 10); continue;
      }
      const prims = 2 + (r() < 0.35 ? 1 : 0);
      g.beginPath();
      for (let p = 0; p < prims; p++) {
        const k = Math.floor(r() * 8), mx = x + gw * (0.25 + r() * 0.5);
        switch (k) {
          case 0: g.moveTo(mx, y0); g.lineTo(mx, y1); break;                                                       // stem
          case 1: g.moveTo(mx, y0); g.lineTo(mx, y1 - gh * 0.25); g.quadraticCurveTo(mx, y1, mx - gw * 0.3, y1); break;   // hook
          case 2: g.moveTo(mx + gh * 0.2, cy); g.arc(mx, cy, gh * 0.2, 0, Math.PI * 2); break;                     // ring
          case 3: g.moveTo(x + gw * 0.85, y0 + gh * 0.1); g.quadraticCurveTo(x, cy, x + gw * 0.85, y1 - gh * 0.1); break;  // open bow
          case 4: g.moveTo(mx - gw * 0.3, cy); g.lineTo(mx + gw * 0.3, cy); g.moveTo(mx, y0 + gh * 0.15); g.lineTo(mx, y1 - gh * 0.15); break;   // cross
          case 5: g.moveTo(x + gw * 0.1, y0); g.lineTo(x + gw * 0.5, y1); g.lineTo(x + gw * 0.9, y0); break;     // angle
          case 6: g.moveTo(x + gw * 0.1, y0 + gh * 0.2); g.quadraticCurveTo(x + gw * 0.5, y1 + gh * 0.35, x + gw * 0.9, y0 + gh * 0.2); break;   // cup
          default: g.moveTo(x + gw * 0.1, y0); g.lineTo(x + gw * 0.9, y0); g.moveTo(mx, y0); g.lineTo(mx, cy); break;   // bar + drop
        }
      }
      g.stroke();
      if (r() < 0.18) { g.beginPath(); g.arc(x + gw * 0.5, y0 - gh * 0.24, 4, 0, Math.PI * 2); g.fill(); }   // a dot above
      x += gw * (1.08 + r() * 0.2) + (r() < 0.12 ? gw * 0.6 : 0);
      sinceBar++;
    }
  }
  return toTexture(c, { srgb: false });
}

// Painted wooden cover: lacquered red-brown with ochre borders, a lotus medallion and scrolling dots.
function coverTexture(seed) {
  const W = 1024, H = 160, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(seed + 3);
  const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, '#4a160c'); grd.addColorStop(0.5, '#6a2412'); grd.addColorStop(1, '#43140b');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${20 + r() * 40},${8 + r() * 10},${4},${0.12 + r() * 0.2})`; g.fillRect(r() * W, r() * H, 2 + r() * 30, 1 + r() * 1.5); }
  g.strokeStyle = '#c99a3c'; g.lineWidth = 5; g.strokeRect(14, 12, W - 28, H - 24);
  g.lineWidth = 2; g.strokeRect(26, 22, W - 52, H - 44);
  g.fillStyle = '#d2a447';
  for (let x = 44; x < W - 40; x += 22) { if (Math.abs(x - W * (0.5 - HOLE_X / LEAF_L)) < 30 || Math.abs(x - W * (0.5 + HOLE_X / LEAF_L)) < 30) continue; g.beginPath(); g.arc(x, 34, 3, 0, Math.PI * 2); g.arc(x, H - 34, 3, 0, Math.PI * 2); g.fill(); }
  const lotus = (cx, cy, R) => {
    g.save(); g.translate(cx, cy);
    for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); g.beginPath(); g.ellipse(0, -R * 0.55, R * 0.16, R * 0.42, 0, 0, Math.PI * 2); g.fillStyle = k % 2 ? '#d9ad52' : '#b8862e'; g.fill(); }
    g.beginPath(); g.arc(0, 0, R * 0.26, 0, Math.PI * 2); g.fillStyle = '#2f5a4a'; g.fill();
    g.beginPath(); g.arc(0, 0, R * 0.12, 0, Math.PI * 2); g.fillStyle = '#e6c06a'; g.fill();
    g.restore();
  };
  lotus(W / 2, H / 2, 48);
  for (const sx of [-1, 1]) {                                            // vine scrolls either side
    g.strokeStyle = '#c99a3c'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 60; i++) { const x = W / 2 + sx * (70 + i * 3.2); const y = H / 2 + Math.sin(i * 0.42) * 22; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    for (let i = 4; i < 60; i += 7) { const x = W / 2 + sx * (70 + i * 3.2), y = H / 2 + Math.sin(i * 0.42) * 22; g.beginPath(); g.ellipse(x, y - 10 * Math.sign(Math.cos(i * 0.42)), 5, 9, 0.4 * sx, 0, Math.PI * 2); g.fillStyle = '#2f5a4a'; g.fill(); }
  }
  return toTexture(c);
}

// Red wrapping cloth with a woven ground and gold border stripes.
function clothTexture() {
  const c = paintCanvas(512, 256, (u, v) => {
    const weave = (Math.sin(u * 900) * Math.sin(v * 450)) * 0.04 + noise2(u * 50, v * 25) * 0.05;
    const b = Math.min(v, 1 - v), stripe = (b > 0.05 && b < 0.09) || (b > 0.11 && b < 0.125);
    const motif = b > 0.16 && b < 0.2 && Math.sin(u * 140) > 0.6;
    const base = stripe || motif ? [176, 124, 46] : [112, 18, 14];
    const l = 1 + weave + fbm2(u * 3, v * 3, 3) * 0.12;
    return base.map((x) => Math.max(0, Math.min(255, x * l)));
  });
  return toTexture(c, { repeat: true });
}

// --------------------------------------------------------------------------------------------- geometry
function slabShape(L, W, rc, hr) {
  const s = new THREE.Shape(), x0 = -L / 2, x1 = L / 2, y0 = -W / 2, y1 = W / 2;
  s.moveTo(x0 + rc, y0); s.lineTo(x1 - rc, y0); s.quadraticCurveTo(x1, y0, x1, y0 + rc); s.lineTo(x1, y1 - rc);
  s.quadraticCurveTo(x1, y1, x1 - rc, y1); s.lineTo(x0 + rc, y1); s.quadraticCurveTo(x0, y1, x0, y1 - rc); s.lineTo(x0, y0 + rc);
  s.quadraticCurveTo(x0, y0, x0 + rc, y0);
  for (const hx of [-HOLE_X, HOLE_X]) { const h = new THREE.Path(); h.absarc(hx, 0, hr, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}
// Flat slab with two string holes, lying in XZ (thickness up +y from 0), UVs spanning the face, a slight arch.
function slabGeometry(L, W, T, rc, { bevel = 0, arch = 0, hr = HOLE_R } = {}) {
  const g = new THREE.ExtrudeGeometry(slabShape(L, W, rc, hr), bevel > 0
    ? { depth: T, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }
    : { depth: T, bevelEnabled: false, curveSegments: 10 });
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, (x + L / 2) / L, (y + W / 2) / W);
    p.setZ(i, p.getZ(i) + arch * (1 - (2 * y / W) ** 2));
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}

// Writing shader on a folio: strokes appear in reading order (row by row, left to right) as uReveal runs
// 0 → 1, white-hot at the stylus, cooling to an ember (uGlow) and leaving a dark, soot-filled incision.
function folioMaterial(map, script, tint) {
  const m = new THREE.MeshStandardMaterial({ map, color: tint, roughness: 0.66, metalness: 0 });
  const u = { uScript: { value: script }, uReveal: { value: 0 }, uGlow: { value: 0 }, uHot: { value: new THREE.Color('#ffbf66') } };
  m.userData.write = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFolioUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFolioUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vFolioUv; uniform sampler2D uScript; uniform float uReveal, uGlow; uniform vec3 uHot;
        float fMask, fWritten, fHead;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        fMask = texture2D(uScript, vFolioUv).r;
        float fRow = clamp(floor((${ROW_TOP.toFixed(3)} - vFolioUv.y) / ${ROW_H.toFixed(3)}), 0.0, ${(ROWS - 1).toFixed(1)});
        float fOrd = (fRow + clamp((vFolioUv.x - 0.03) / 0.94, 0.0, 1.0)) / ${ROWS.toFixed(1)};
        fWritten = smoothstep(fOrd - 0.003, fOrd + 0.003, uReveal);
        fHead = exp(-max(uReveal - fOrd, 0.0) * 90.0);
        diffuseColor.rgb *= 1.0 - 0.86 * fMask * fWritten;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uHot * fMask * fWritten * (fHead * 7.0 + uGlow);`);
  };
  m.customProgramCacheKey = () => 'india-folio-v1';
  return m;
}

// Text row with drawn arrows: parts are strings, or null for an arrow. Laid out centred on the origin.
function arrowRow(parts, { height = 0.1, color = LABEL, intensity = 1.4, font = FONTS.mono, weight = 400, letterSpacing = 0.1 } = {}) {
  const grp = new THREE.Group(), items = [];
  let x = 0;
  for (const p of parts) {
    if (p === null) {
      x += height * 0.25;
      const w = height * 1.4, y = 0, a = V(x, y, 0), b = V(x + w, y, 0);
      const ln = segmentsLine([[a, b], [b, V(b.x - height * 0.32, height * 0.24, 0)], [b, V(b.x - height * 0.32, -height * 0.24, 0)]], { color, intensity, orderFn: (_, __, i) => (i ? 0.5 : 0), stagger: 0.5 });
      grp.add(ln); items.push({ line: ln, x0: x, w }); x += w + height * 0.3;
    } else {
      const tp = new TextPlane(p, { font, weight, height, color, intensity, letterSpacing, revealDir: 'x' });
      const vis = tp.worldWidth - height * 0.5;
      tp.position.x = x - height * 0.25 + tp.worldWidth / 2; grp.add(tp); items.push({ text: tp, x0: x, w: vis }); x += vis;
    }
  }
  for (const c of grp.children) c.position.x -= x / 2;
  grp.width = x;
  grp.reveal = (p, op = 1) => {
    items.forEach((it) => {
      const q = sat((p * x - it.x0) / it.w);
      if (it.text) { it.text.reveal = q; it.text.opacity = q > 0 ? op : 0; } else { it.line.progress = q; it.line.opacity = op; }
    });
  };
  grp.reveal(0);
  return grp;
}

// Stylised letterforms as polylines in a unit box (x right, y up). Evocations built from strokes, not fonts.
const arcPts = (cx, cy, r, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const GLYPHS = {
  BRAHMI: [[[-0.5, 0], [0.5, 0]], [[0, 0.5], [0, -0.5]]],                                               // ka: a cross
  DEVANAGARI: [[[-0.5, 0.42], [0.5, 0.42]], [[0.06, 0.42], [0.06, -0.5]], [...arcPts(-0.17, 0.02, 0.21, 0.2, 2 * Math.PI - 0.2)], [[0.06, 0.04], [0.3, 0.12], [0.38, -0.08], [0.24, -0.26]]],
  BENGALI: [[[-0.5, 0.42], [0.5, 0.42]], [[0.12, 0.42], [0.12, -0.5]], [[0.12, 0.14], [-0.32, -0.08], [0.12, -0.3]], [[0.12, 0.0], [0.34, -0.12], [0.3, -0.3]]],
  TIBETAN: [[[-0.45, 0.42], [0.45, 0.42]], [[-0.36, 0.06], [0.36, 0.06]], [[0.02, 0.42], [0.02, -0.5]], [[-0.36, 0.06], [-0.36, -0.28]]],
  TAMIL: [[[-0.46, 0.32], [0.42, 0.32]], [[-0.08, 0.32], [-0.12, -0.36], [0.24, -0.38], [0.26, -0.02], [0.04, 0.02]]],
  SINHALA: [[...arcPts(-0.14, -0.14, 0.24, 0, 2 * Math.PI)], [...arcPts(0.1, -0.14, 0.34, Math.PI, 0.2, 12)], [[0.42, -0.07], [0.42, -0.46]]],
  KHMER: [[[-0.38, 0.22], [-0.38, -0.44]], [[0.38, 0.22], [0.38, -0.44]], [...arcPts(0, 0.1, 0.38, Math.PI, 0, 12)], [...arcPts(-0.24, 0.42, 0.08, 0, 2 * Math.PI, 10)]],
  THAI: [[[-0.34, -0.46], [-0.34, 0.14]], [...arcPts(0, 0.14, 0.34, Math.PI, 0, 12)], [[0.34, 0.14], [0.34, -0.46]], [[-0.34, 0.14], [-0.14, 0.32]]],
};

// ------------------------------------------------------------------------------------------------ scene
export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const DUR = segment.end - segment.start;
  const tLeaf = cue('palmLeaf'), tSutra = cue('sutras'), tTree = cue('grammarTree'), tScr = cue('scripts');
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.08;
  scene.background = new THREE.Color('#070403');
  const FOG = 0.034;
  scene.fog = new THREE.FogExp2('#0b0705', FOG);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 200);
  const R = rng(1202);

  // ----------------------------------------------------------------------------------- the room
  const plankTex = woodTexture({ seed: 2, base: [82, 44, 22] }); plankTex.repeat.set(1.6, 2.2);
  const deskMat = new THREE.MeshPhysicalMaterial({ map: plankTex, color: '#ffffff', roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4 });
  const desk = new THREE.Group(); scene.add(desk);
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(13, 0.22, 9.5), deskMat); top.position.set(0.5, -0.11, -2.0); top.receiveShadow = true; desk.add(top);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(13.1, 0.08, 9.6), deskMat); lip.position.set(0.5, -0.27, -2.0); desk.add(lip);
    const legMat = new THREE.MeshStandardMaterial({ map: plankTex, color: '#6e5a4a', roughness: 0.6 });
    for (const [x, z] of [[-5.6, 2.3], [6.6, 2.3], [-5.6, -6.3], [6.6, -6.3]]) {
      const leg = new THREE.Mesh(lathe([[0, 0], [0.28, 0], [0.3, 0.1], [0.2, 0.25], [0.24, 0.45], [0.18, 0.62], [0.26, 0.78], [0, 0.78]], 20), legMat);
      leg.position.set(x, -1.09, z); desk.add(leg);
    }
  }
  const floorTex = woodTexture({ seed: 7, base: [46, 28, 16] }); floorTex.repeat.set(8, 8);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.1; floor.receiveShadow = true; scene.add(floor);

  // back wall with shelves of wrapped manuscript bundles (the library behind the scholar)
  const wallTex = woodTexture({ seed: 11, base: [44, 26, 15], planks: 6 }); wallTex.repeat.set(3, 4);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.8 }));
  wall.position.set(0.5, 10, -9.2); scene.add(wall);
  {
    const shelfParts = [], bundleParts = [], bandParts = [];
    const cloth = [[0.34, 0.04, 0.02], [0.42, 0.2, 0.04], [0.28, 0.06, 0.03], [0.46, 0.28, 0.07], [0.16, 0.07, 0.05], [0.38, 0.13, 0.03]];
    for (const y of [0.9, 2.5, 4.1, 5.7]) {
      shelfParts.push(prep(new THREE.BoxGeometry(15, 0.14, 1.2).translate(0.5, y, -8.55)));
      let x = -6.6;
      while (x < 7.4) {
        const L = 1.2 + R() * 1.2, h = 0.22 + R() * 0.14, d = 0.32 + R() * 0.12, stack = R() < 0.4 ? 2 : 1;
        for (let s = 0; s < stack; s++) {
          const g = prep(new THREE.BoxGeometry(L, h, d).translate(x + L / 2, y + 0.07 + h / 2 + s * (h + 0.01), -8.5 + (R() - 0.5) * 0.2));
          const col = cloth[Math.floor(R() * cloth.length)], k = 0.7 + R() * 0.5, cols = new Float32Array(g.attributes.position.count * 3);
          for (let i = 0; i < cols.length; i += 3) { cols[i] = col[0] * k; cols[i + 1] = col[1] * k; cols[i + 2] = col[2] * k; }
          g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          bundleParts.push(g);
          for (const f of [0.25, 0.75]) bandParts.push(prep(new THREE.BoxGeometry(0.04, h + 0.02, d + 0.02).translate(x + L * f, y + 0.07 + h / 2 + s * (h + 0.01), -8.5)));
        }
        x += L + 0.08 + R() * 0.25;
      }
    }
    for (const x of [-6.9, 7.9]) shelfParts.push(prep(new THREE.BoxGeometry(0.2, 6.4, 1.2).translate(x, 3.2, -8.55)));
    const shelfMat = new THREE.MeshStandardMaterial({ map: plankTex, color: '#8a7060', roughness: 0.7 });
    scene.add(new THREE.Mesh(mergeGeometries(shelfParts), shelfMat));
    scene.add(new THREE.Mesh(mergeGeometries(bundleParts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })));
    scene.add(new THREE.Mesh(mergeGeometries(bandParts), new THREE.MeshStandardMaterial({ color: '#2a1a0e', roughness: 0.8 })));
  }

  // ----------------------------------------------------------------------------------- the lamp
  const brass = new THREE.MeshStandardMaterial({ color: '#c8913e', metalness: 1, roughness: 0.32 });
  const LAMP = V(-3.7, 0, 0.7);
  const lamp = new THREE.Group(); lamp.position.copy(LAMP); scene.add(lamp);
  {
    const stand = new THREE.Mesh(lathe([[0, 0], [0.42, 0], [0.44, 0.04], [0.3, 0.1], [0.12, 0.18], [0.08, 0.32], [0.1, 0.42], [0.07, 0.6], [0.14, 0.66], [0, 0.66]], 32), brass);
    const bowlG = lathe([[0, 0.64], [0.12, 0.64], [0.3, 0.7], [0.38, 0.8], [0.36, 0.83], [0.3, 0.76], [0, 0.73]], 40);
    const spout = new THREE.ConeGeometry(0.1, 0.36, 16, 1, true); spout.rotateZ(-Math.PI / 2); spout.scale(1, 0.45, 1); spout.translate(0.42, 0.8, 0);
    const bowl = new THREE.Mesh(mergeGeometries([prep(bowlG), prep(spout)]), brass);
    stand.castShadow = bowl.castShadow = true;
    const oil = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ color: '#2a1806', roughness: 0.1, metalness: 0.2 }));
    oil.rotation.x = -Math.PI / 2; oil.position.y = 0.765;
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 1 }));
    wick.position.set(0.5, 0.86, 0); wick.rotation.z = -0.5;
    lamp.add(stand, bowl, oil, wick);
  }
  const flame = new THREE.Mesh(lathe([[0, 0], [0.045, 0.03], [0.06, 0.09], [0.05, 0.16], [0.025, 0.24], [0, 0.3]], 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb24a').multiplyScalar(7), toneMapped: false }));
  flame.position.set(0.53, 0.9, 0); lamp.add(flame);
  const flameCore = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2d0').multiplyScalar(10), toneMapped: false }));
  flameCore.position.set(0.53, 0.94, 0); lamp.add(flameCore);
  const flameGlow = glowSprite({ color: '#ff9a40', intensity: 1.4, scale: 1.4 }); flameGlow.position.set(0.53, 1.0, 0); lamp.add(flameGlow);
  const lampLight = new THREE.PointLight('#ff9d4a', 0, 0, 2); lampLight.position.set(LAMP.x + 0.53, 1.15, LAMP.z); scene.add(lampLight);

  // ----------------------------------------------------------------------------------- lights
  const key = new THREE.SpotLight('#ffcb8c', 0, 0, 0.55, 0.7, 2);
  key.position.set(-5.5, 8.5, 6.5); key.target.position.set(0.2, 0.8, 0.2);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#d9bf9c', 0.55); rim.position.set(6, 5, -7); scene.add(rim);
  const fill = new THREE.HemisphereLight('#4a3828', '#0a0604', 0.25); scene.add(fill);
  const treeLight = new THREE.PointLight('#ffc070', 0, 0, 2); scene.add(treeLight);
  const mapLight = new THREE.PointLight('#ffc070', 0, 0, 2); scene.add(mapLight);

  const dust = new Dust({ count: 1400, size: [12, 5, 9], center: [0, 2.2, 0], color: '#ffd8a0', particleSize: 0.022, opacity: 0.45, intensity: 1.3, seed: 41 });
  scene.add(dust);
  const backGlow = glowSprite({ color: '#ff9f50', intensity: 0.22, scale: 14 }); backGlow.position.set(-1.5, 3.5, -8.4); scene.add(backGlow);

  // ----------------------------------------------------------------------------------- cloth, stylus
  const PIVOT = V(-1.35, 0.03, 1.45);
  {
    const cg = new THREE.PlaneGeometry(4.6, 1.9, 60, 24); cg.rotateX(-Math.PI / 2);
    const p = cg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), edge = smoothstep(0.55, 0.95, Math.abs(z) / 0.95);
      p.setY(i, 0.006 + Math.max(0, 0.022 * Math.sin(x * 3.1 + z * 1.3) * edge + 0.03 * edge + 0.012 * noise2(x * 1.5, z * 2)));
    }
    cg.computeVertexNormals();
    const clothMat = new THREE.MeshPhysicalMaterial({ map: clothTexture(), roughness: 0.85, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ff9a7a') });
    clothMat.map.repeat.set(1, 1);
    const cl = new THREE.Mesh(cg, clothMat); cl.position.set(0.2, 0, 1.5); cl.rotation.y = 0.04; cl.receiveShadow = true; scene.add(cl);
    const steel = new THREE.MeshStandardMaterial({ color: '#4a4440', metalness: 0.9, roughness: 0.4 });
    const stylus = new THREE.Mesh(mergeGeometries([prep(new THREE.CylinderGeometry(0.022, 0.022, 1.2, 12)), prep(new THREE.ConeGeometry(0.022, 0.16, 12).translate(0, 0.68, 0)), prep(new THREE.SphereGeometry(0.04, 12, 8).translate(0, -0.62, 0))]), steel);
    stylus.rotation.set(0, 0.4, Math.PI / 2); stylus.position.set(2.75, 0.03, 1.9); stylus.castShadow = true; scene.add(stylus);
  }

  // ----------------------------------------------------------------------------------- the manuscript
  const leafGeo = slabGeometry(LEAF_L, LEAF_W, LEAF_T, 0.12, { arch: 0.01 });
  const coverGeo = slabGeometry(COVER_L, COVER_W, COVER_T, 0.06, { bevel: 0.008, hr: HOLE_R * 1.1 });
  const leafMaps = [0, 1, 2].map((i) => leafTexture(3 + i * 7));
  const scripts = [0, 1, 2, 3].map((i) => scriptTexture(5 + i));
  const coverMat = new THREE.MeshStandardMaterial({ map: coverTexture(1), roughness: 0.42, metalness: 0 });
  const fan = new THREE.Group(); fan.rotation.order = 'YXZ'; scene.add(fan);
  const elems = [];
  let stackY = 0;
  const addElem = (geo, mat, thick, lift) => {
    const holder = new THREE.Object3D(), mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(HOLE_X, lift, 0); mesh.castShadow = mesh.receiveShadow = true;
    holder.add(mesh); fan.add(holder);
    elems.push({ holder, mesh, y0: stackY, flut: R() * 6.28, jit: (R() - 0.5) * 0.05, slip: (R() - 0.5) * 0.04 });
    stackY += thick;
  };
  const leafMats = [];
  addElem(coverGeo, coverMat, COVER_T + 0.016, 0.008);
  for (let k = 0; k < NLEAF; k++) {
    const tone = 0.88 + R() * 0.2, m = folioMaterial(leafMaps[k % 3], scripts[k % 4], new THREE.Color(tone, tone * (0.97 + R() * 0.05), tone * (0.9 + R() * 0.08)));
    leafMats.push(m);
    addElem(leafGeo, m, LEAF_T + 0.0035, 0);
  }
  addElem(coverGeo, coverMat, COVER_T + 0.016, 0.008);
  const NE = elems.length;
  // the cord through the left string hole, knotted at both ends
  const cordMat = new THREE.MeshStandardMaterial({ color: '#7a5a34', roughness: 0.9 });
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1, 8).translate(0, 0.5, 0), cordMat);
  const knotA = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#b98a3c', metalness: 0.6, roughness: 0.4 }));
  const knotB = knotA.clone();
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 10, 1, true), cordMat);
  fan.add(cord, knotA, knotB, tassel);

  const TH_MIN = -0.1, TH_MAX = 1.68;          // fan spread (rad), bottom cover → top cover
  function poseFan(t) {
    const open = ramp(t, tLeaf, tLeaf + 0.9, ease.outCubic) * (1 - ramp(t, tScr + 0.05, tScr + 0.95, ease.inOutCubic));
    const rise = ramp(t, tLeaf - 0.05, tLeaf + 0.75, ease.inOutCubic) * (1 - ramp(t, tScr, tScr + 0.9, ease.inOutCubic));
    fan.position.set(PIVOT.x, PIVOT.y + 0.6 * rise + 0.03 * Math.sin(t * 1.7) * rise, PIVOT.z - 0.15 * rise);
    fan.rotation.set(1.0 * rise, -0.06 - 0.06 * rise, 0);
    const spread = 1 + 1.6 * open;
    elems.forEach((e, k) => {
      const f = k / (NE - 1);
      e.holder.rotation.y = (lerp(TH_MIN, TH_MAX, f) + (k > 0 && k < NE - 1 ? e.jit : 0)) * open;
      e.mesh.position.x = HOLE_X + e.slip * open;
      e.holder.position.y = e.y0 * spread;
      e.holder.rotation.x = 0.05 * open * Math.sin(t * 2.1 + e.flut) * (k > 0 && k < NE - 1 ? 1 : 0.3);
    });
    const h = stackY * spread;
    cord.position.y = -0.04; cord.scale.y = h + 0.08;
    knotA.position.y = -0.05; knotB.position.y = h + 0.04; tassel.position.set(0, h + 0.17, 0);
    return open;
  }

  // ----------------------------------------------------------------------------------- callouts on the folios
  const calloutFolio = new Callout('PALM-LEAF FOLIO', { dx: -0.9, dy: 0.3, size: 0.085, color: LABEL, sub: 'CUT WITH A STYLUS · INKED WITH SOOT', intensity: 1.5 });
  const calloutAsht = new Callout('ASHTADHYAYI', { dx: 0.7, dy: 0.42, size: 0.1, color: LABEL, sub: '3,959 SUTRAS · 8 CHAPTERS', intensity: 1.6 });
  scene.add(calloutFolio, calloutAsht);
  const _anchor = new THREE.Vector3();
  const leafPoint = (k, lx, out) => { elems[k].mesh.updateWorldMatrix(true, false); return out.set(lx, LEAF_T, 0).applyMatrix4(elems[k].mesh.matrixWorld); };

  // ----------------------------------------------------------------------------------- the derivation tree
  const tree = new THREE.Group();
  const TREE_POS = V(3.1, 0.82, 0.85);
  tree.position.copy(TREE_POS); tree.rotation.y = -0.22; tree.scale.setScalar(0.84);
  scene.add(tree);
  const node = (word, x, y, { sub = null, size = 0.2, font = FONTS.display, weight = 600, w = null } = {}) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    const text = new TextPlane(word, { font, weight, height: size, color: '#ffe6bd', intensity: 1.7, letterSpacing: 0.08 });
    const fw = w ?? text.worldWidth * 0.86 + 0.1, fh = size * 1.55;
    const frame = new BracketFrame(fw, fh, { len: 0.07, color: GOLD, intensity: 1.3 });
    const glow = glowSprite({ color: '#ffb860', intensity: 1, scale: fw * 1.4 });
    g.add(glow, frame, text);
    let subT = null;
    if (sub) { subT = new TextPlane(sub, { font: FONTS.mono, weight: 400, height: 0.068, color: LABEL, intensity: 1.2, letterSpacing: 0.12 }); subT.position.y = -fh / 2 - 0.08; g.add(subT); }
    tree.add(g);
    const api = { g, text, frame, glow, sub: subT, top: V(x, y + fh / 2, 0), bottom: V(x, y - fh / 2, 0) };
    api.reveal = (p, op, flash = 0) => {
      g.visible = p > 0 && op > 0;
      text.reveal = sat(p * 1.4 - 0.2); text.opacity = op; text.intensity = 1.7 + flash * 3;
      frame.reveal(sat(p * 1.6), op);
      glow.material.opacity = op * (0.25 * sat(p) + flash * 1.2);
      if (subT) { subT.reveal = sat(p * 1.5 - 0.5); subT.opacity = op * 0.9; }
    };
    return api;
  };
  const nRoot = node('√BHU', -1.05, 0, { sub: 'ROOT · TO BE' });
  const nA = node('A', 0, 0, { sub: '3.1.68', w: 0.36 });
  const nTi = node('TI', 1.05, 0, { sub: 'ENDING · 3.4.78', w: 0.46 });
  const nJoin = node('BHU + A + TI', 0, 0.92, { size: 0.17, font: FONTS.mono, weight: 500 });
  const nGuna = node('BHO + A + TI', 0, 1.72, { size: 0.17, font: FONTS.mono, weight: 500 });
  const nWord = node('BHAVATI', 0, 2.6, { size: 0.3, sub: "'IS, BECOMES'" });
  const edgeTube = (a, b, bend = 0) => {
    const m = a.clone().lerp(b, 0.5).add(V(bend, 0, 0.02));
    return progressTube(new THREE.CatmullRomCurve3([a, m, b]), { radius: 0.01, segments: 40, radial: 6, color: GOLD, intensity: 2.2 });
  };
  const edges = [
    edgeTube(nRoot.top, nJoin.bottom.clone().add(V(-0.3, 0, 0)), -0.15), edgeTube(nA.top, nJoin.bottom, 0), edgeTube(nTi.top, nJoin.bottom.clone().add(V(0.3, 0, 0)), 0.15),
    edgeTube(nJoin.top, nGuna.bottom), edgeTube(nGuna.top, nWord.bottom),
  ];
  edges.forEach((e) => tree.add(e));
  const rule1 = new THREE.Group(), rule2 = new THREE.Group();
  const mkRule = (grp, num, from, to, y) => {
    const head = new TextPlane(`RULE ${num}`, { font: FONTS.mono, weight: 500, height: 0.075, color: GOLD, intensity: 1.6, letterSpacing: 0.12 });
    const row = arrowRow([from, null, to], { height: 0.085 });
    head.position.set(0.24 + head.worldWidth / 2, 0.05, 0); row.position.set(0.24 + row.width / 2 + 0.03, -0.07, 0);
    grp.add(head, row); grp.position.set(0.12, y, 0); tree.add(grp);
    return (p, op) => { head.reveal = sat(p * 1.6); head.opacity = p > 0 ? op : 0; row.reveal(sat(p * 1.4 - 0.3), op); };
  };
  const rule1Reveal = mkRule(rule1, '7.3.84', 'U', 'O', 1.32);
  const rule2Reveal = mkRule(rule2, '6.1.78', 'O', 'AV', 2.13);
  const header = arrowRow(['ROOT + SUFFIX', null, 'WORD'], { height: 0.11, intensity: 1.6, letterSpacing: 0.14 });
  header.position.set(0, -0.56, 0); tree.add(header);
  const caption = new TextPlane('RULES THAT GENERATE WORDS', { font: FONTS.mono, weight: 400, height: 0.075, color: LABEL, intensity: 1.2, letterSpacing: 0.22 });
  caption.position.set(0, 3.2, 0); tree.add(caption);
  const pbf = new Callout('PANINI-BACKUS FORM', { dx: 0.5, dy: -0.32, size: 0.075, color: '#d8c8a8', sub: 'A NAME PROPOSED BY P. Z. INGERMAN, 1967', intensity: 1.2 });
  pbf.position.set(1.3, 0.02, 0); tree.add(pbf);
  // strokes lifting off the folios into the three leaves of the tree
  const lifts = [];
  {
    poseFan(tTree + 0.15);
    fan.updateMatrixWorld(true); tree.updateMatrixWorld(true);
    const targets = [nRoot, nA, nTi];
    for (let i = 0; i < 9; i++) {
      const k = 2 + Math.round(i * 10 / 8), a = leafPoint(k, -0.2 + (i % 3) * 0.5, new THREE.Vector3());
      const tn = targets[i % 3], b = tn.g.position.clone().add(V(-0.12 + (R() - 0.5) * 0.08, 0.06 + (R() - 0.5) * 0.08, 0)).applyMatrix4(tree.matrixWorld);
      const m1 = a.clone().add(V(0.35 + R() * 0.3, 0.8 + R() * 0.35, 0.3)), m2 = b.clone().add(V(-0.7 - R() * 0.2, 0.45 + R() * 0.2, 0.1));
      const tube = progressTube(new THREE.CatmullRomCurve3([a, m1, m2, b]), { radius: 0.007, segments: 70, radial: 5, color: '#ffc874', intensity: 3.2, tail: 0.45 });
      scene.add(tube); lifts.push({ tube, d: (i % 3) * 0.03 + Math.floor(i / 3) * 0.045 });
    }
  }

  // ----------------------------------------------------------------------------------- Brahmi and its descendants
  const MAP0 = V(0.65, 0.016, -1.9);
  const mapGroup = new THREE.Group(); mapGroup.position.copy(MAP0); scene.add(mapGroup);
  const P2 = (x, z) => V(x, 0, z);                     // map plane coordinates (x east, z south)
  const rings = [1, 2, 3, 4, 5].map((r) => { const l = progressLine(circlePoints(r, 128, { plane: 'xz' }), { color: '#d0a46a', intensity: 0.32, head: 0.02 }); mapGroup.add(l); return l; });
  const radSegs = [];
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, r0 = k % 2 ? 2.2 : 0.55; radSegs.push([P2(Math.cos(a) * r0, Math.sin(a) * r0), P2(Math.cos(a) * 5.4, Math.sin(a) * 5.4)]); }
  for (let k = 0; k < 120; k++) { const a = k / 120 * Math.PI * 2, l = k % 10 ? 0.07 : 0.16; radSegs.push([P2(Math.cos(a) * 5, Math.sin(a) * 5), P2(Math.cos(a) * (5 + l), Math.sin(a) * (5 + l))]); }
  const radials = segmentsLine(radSegs, { color: '#d0a46a', intensity: 0.26, orderFn: (a) => Math.atan2(a.z, a.x) / (Math.PI * 2) * 0.5 + 0.25, stagger: 0.5 });
  mapGroup.add(radials);
  const north = new TextPlane('N', { font: FONTS.mono, weight: 500, height: 0.2, color: LABEL, intensity: 1.2 });
  north.rotation.x = -Math.PI / 2; north.position.set(0, 0, -5.55); mapGroup.add(north);
  // KA in Brahmi: the root of the family
  const glyphTubes = (strokes, scale, radius, intensity) => strokes.map((s) => {
    const pts = s.map(([x, y]) => V(x * scale, 0.01, -y * scale));
    const curve = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    return progressTube(curve, { radius, segments: Math.max(8, pts.length * 6), radial: 6, color: '#ffd9a0', intensity });
  });
  const brahmi = new THREE.Group(); mapGroup.add(brahmi);
  const kaTubes = glyphTubes(GLYPHS.BRAHMI, 0.62, 0.028, 3.2); kaTubes.forEach((t) => brahmi.add(t));
  const kaRing = progressLine(circlePoints(0.52, 96, { plane: 'xz' }), { color: GOLD, intensity: 1.6 }); brahmi.add(kaRing);
  const kaGlow = glowSprite({ color: '#ffb860', intensity: 1, scale: 2.2 }); kaGlow.position.y = 0.1; brahmi.add(kaGlow);
  const kaLabel = new TextPlane('BRAHMI', { font: FONTS.display, weight: 600, height: 0.3, color: '#ffe6bd', intensity: 1.7, letterSpacing: 0.12 });
  const kaSub = new TextPlane('KA · 3RD C. BC', { font: FONTS.mono, weight: 500, height: 0.14, color: LABEL, intensity: 1.6, letterSpacing: 0.08 });
  scene.add(kaLabel, kaSub);
  // the family: a northern and a southern line of descent (intermediate scripts left unnamed)
  const HUB_N = P2(-0.1, -1.25), HUB_S = P2(0.45, 1.0);
  const FAMILY = [
    { name: 'DEVANAGARI', at: P2(-2.75, -2.15), hub: HUB_N, d: 0.0, side: 'U' },
    { name: 'TIBETAN', at: P2(0.25, -3.35), hub: HUB_N, d: 0.06, side: 'U' },
    { name: 'BENGALI', at: P2(2.2, -2.45), hub: HUB_N, d: 0.1, side: 'R' },
    { name: 'TAMIL', at: P2(-1.25, 1.55), hub: HUB_S, d: 0.04, side: 'L' },
    { name: 'SINHALA', at: P2(-0.45, 2.6), hub: HUB_S, d: 0.1, side: 'L' },
    { name: 'KHMER', at: P2(3.85, 1.25), hub: HUB_S, d: 0.08, side: 'R' },
    { name: 'THAI', at: P2(3.4, -0.75), hub: 'KHMER', d: 0.2, side: 'R' },
  ];
  const trunkN = progressTube(new THREE.CatmullRomCurve3([P2(0, -0.55), P2(-0.12, -0.9), HUB_N]), { radius: 0.016, segments: 30, color: GOLD, intensity: 2.4 });
  const trunkS = progressTube(new THREE.CatmullRomCurve3([P2(0.1, 0.52), P2(0.32, 0.75), HUB_S]), { radius: 0.016, segments: 30, color: GOLD, intensity: 2.4 });
  mapGroup.add(trunkN, trunkS);
  const fam = FAMILY.map((f) => {
    const from = f.hub === 'KHMER' ? FAMILY[5].at.clone().add(P2(-0.15, -0.42)) : f.hub;
    const to = f.at.clone().add(f.at.clone().sub(from).normalize().multiplyScalar(-0.4));
    const mid = from.clone().lerp(to, 0.5).add(V((to.z - from.z) * 0.12, 0, -(to.x - from.x) * 0.12));
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const branch = progressTube(curve, { radius: 0.012, segments: 50, color: GOLD, intensity: 2.0 });
    const pulseT = progressTube(curve, { radius: 0.02, segments: 50, color: '#fff0d0', intensity: 3.5, tail: 0.18 });
    const g = new THREE.Group(); g.position.copy(f.at);
    const tubes = glyphTubes(GLYPHS[f.name], 0.5, 0.017, 2.6); tubes.forEach((t) => g.add(t));
    const ring = progressLine(circlePoints(0.36, 64, { plane: 'xz' }), { color: GOLD, intensity: 1.0 }); g.add(ring);
    const label = new TextPlane(f.name, { font: FONTS.mono, weight: 500, height: 0.2, color: '#ffe6bd', intensity: 1.6, letterSpacing: 0.14 });
    mapGroup.add(branch, pulseT, g); scene.add(label);
    return { ...f, branch, pulseT, g, tubes, ring, label };
  });
  const spark = progressTube(new THREE.CatmullRomCurve3([V(0, 0, 0), V(0, 0, 0), V(0, 0, 0)]), { radius: 0.014, segments: 60, color: '#fff0d0', intensity: 4, tail: 0.35 });
  {
    tree.updateMatrixWorld(true);
    const a = V(0, 2.6, 0).applyMatrix4(tree.matrixWorld), b = MAP0.clone();
    spark.geometry.dispose();
    spark.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, a.clone().add(V(-0.6, 0.9, -0.6)), b.clone().add(V(0.6, 2.2, 0.8)), b]), 80, 0.014, 6, false);
  }
  scene.add(spark);

  // ----------------------------------------------------------------------------------- camera (pure)
  const CAM = [
    // t, pos, look
    [-0.3, [1.7, 1.85, 6.7], [-0.45, 0.35, 1.2]],
    [0.3, [1.15, 2.1, 7.1], [-0.3, 0.6, 1.2]],
    [1.2, [-0.25, 2.4, 7.7], [-0.1, 1.4, 0.95]],
    [1.9, [-0.15, 2.7, 7.9], [0.6, 1.95, 0.85]],
    [2.75, [0.6, 3.0, 7.9], [1.4, 2.3, 0.7]],
    [3.45, [0.95, 5.8, 6.7], [1.05, 0.35, -2.0]],
    [4.3, [1.3, 7.8, 5.9], [1.15, 0.0, -2.75]],
  ];
  const keysOf = (j, c) => CAM.map((k) => [k[0], k[j][c]]);
  const CK = [1, 2].map((j) => [0, 1, 2].map((c) => keysOf(j, c)));
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  function camAt(t) {
    camPos.set(timeWarp(t, CK[0][0]), timeWarp(t, CK[0][1]), timeWarp(t, CK[0][2]));
    camLook.set(timeWarp(t, CK[1][0]), timeWarp(t, CK[1][1]), timeWarp(t, CK[1][2]));
  }

  const dof = { focus: 7, range: 3, amount: 0.35 };
  const bloom = { strength: 0.75 };
  const tmpV = new THREE.Vector3();

  function update(t, info) {

    const T = info?.T ?? t + segment.start;
    // ---- camera
    camAt(t);
    camPos.x += Math.sin(t * 0.9) * 0.025; camPos.y += Math.sin(t * 1.3 + 1) * 0.018;
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = lerp(35, 38, ramp(t, tScr, DUR + 0.3));
    camera.updateProjectionMatrix();

    // ---- lamp: a living flame (deterministic flicker)
    const flick = 1 + 0.07 * Math.sin(t * 37.0) + 0.05 * Math.sin(t * 23.3 + 1.7) + 0.04 * Math.sin(t * 11.1 + 0.4);
    flame.scale.set(1, flick * (1 + 0.05 * Math.sin(t * 17)), 1); flame.rotation.z = 0.06 * Math.sin(t * 5.3);
    flameGlow.material.opacity = 0.85 * flick;
    lampLight.intensity = 9 * flick;
    key.intensity = 150 * (0.96 + 0.04 * flick);

    // ---- the manuscript
    poseFan(t);
    leafMats.forEach((m, k) => {
      const u = m.userData.write, s = tSutra + k * 0.035;
      u.uReveal.value = ramp(t, s, s + 0.72, ease.linear) * 1.03;
      u.uGlow.value = 0.75 * ramp(t, s + 0.1, s + 0.4) * (1 - 0.92 * ramp(t, tTree + 0.05, tTree + 0.6)) + 0.35 * envelope(t, tTree - 0.05, tTree + 0.5, 0.05, 0.4);
    });
    // callouts
    const cf = ramp(t, tLeaf + 0.55, tLeaf + 1.05) * (1 - ramp(t, tTree - 0.15, tTree + 0.15));
    leafPoint(NE - 3, 1.25, _anchor); calloutFolio.position.copy(_anchor); faceCamera(calloutFolio, camera);
    calloutFolio.reveal(cf, 1); calloutFolio.visible = cf > 0;
    const ca = ramp(t, tSutra + 0.25, tSutra + 0.75) * (1 - ramp(t, tTree + 0.2, tTree + 0.5));
    leafPoint(3, 1.45, _anchor); calloutAsht.position.copy(_anchor); faceCamera(calloutAsht, camera);
    calloutAsht.reveal(ca, 1); calloutAsht.visible = ca > 0;

    // ---- the derivation
    const treeOut = 1 - ramp(t, tScr + 0.25, tScr + 0.7);
    tree.position.copy(TREE_POS).add(tmpV.set(0, 0.25 * ramp(t, tScr, tScr + 0.8, ease.inQuad), 0));
    tree.visible = t > tTree - 0.1 && treeOut > 0;
    lifts.forEach(({ tube, d }) => { const p = ramp(t, tTree + d, tTree + d + 0.42, ease.inOutSine) * 1.45; tube.progress = p; tube.opacity = p < 1.44 ? 1 : 0; });
    const nodeP = (a) => ramp(t, tTree + a, tTree + a + 0.2, ease.outCubic);
    const fire = (a) => Math.exp(-Math.max(0, t - (tTree + a)) * 6) * (t > tTree + a ? 1 : 0);
    nRoot.reveal(nodeP(0.2), treeOut, fire(0.26) * 0.5);
    nA.reveal(nodeP(0.25), treeOut, fire(0.31) * 0.5);
    nTi.reveal(nodeP(0.3), treeOut, fire(0.36) * 0.5);
    edges[0].progress = ramp(t, tTree + 0.34, tTree + 0.46); edges[1].progress = ramp(t, tTree + 0.36, tTree + 0.46); edges[2].progress = ramp(t, tTree + 0.38, tTree + 0.48);
    nJoin.reveal(nodeP(0.45), treeOut, fire(0.47));
    rule1Reveal(ramp(t, tTree + 0.48, tTree + 0.68), treeOut);
    edges[3].progress = ramp(t, tTree + 0.52, tTree + 0.62);
    nGuna.reveal(nodeP(0.6), treeOut, fire(0.62));
    rule2Reveal(ramp(t, tTree + 0.64, tTree + 0.84), treeOut);
    edges[4].progress = ramp(t, tTree + 0.66, tTree + 0.76);
    nWord.reveal(nodeP(0.74), treeOut, fire(0.76) * 1.3 + 0.6 * envelope(t, tScr - 0.1, tScr + 0.4, 0.1, 0.3));
    edges.forEach((e) => { e.opacity = treeOut; e.intensity = 2.2 + 2 * fire(0.76); });
    header.reveal(ramp(t, tTree + 0.2, tTree + 0.6), treeOut);
    caption.reveal = ramp(t, tTree + 0.75, tTree + 1.1); caption.opacity = treeOut * (caption.reveal > 0 ? 1 : 0);
    pbf.reveal(ramp(t, tTree + 0.85, tTree + 1.2), treeOut * 0.95); pbf.visible = t > tTree + 0.85 && treeOut > 0;
    treeLight.position.copy(TREE_POS).add(tmpV.set(0, 1.2, 0.6));
    treeLight.intensity = 6 * ramp(t, tTree + 0.1, tTree + 0.5) * treeOut + 10 * fire(0.76) * treeOut;

    // ---- Brahmi → the scripts of South and Southeast Asia
    spark.progress = ramp(t, tScr - 0.04, tScr + 0.22, ease.inOutSine) * 1.36; spark.opacity = spark.progress < 1.35 ? 1 : 0;
    const k0 = tScr + 0.14;
    const ka = ramp(t, k0, k0 + 0.22, ease.outCubic), kaFlash = Math.exp(-Math.max(0, t - k0 - 0.1) * 5) * (t > k0 ? 1 : 0);
    kaTubes.forEach((tb, i) => { tb.progress = ramp(t, k0 + i * 0.06, k0 + 0.16 + i * 0.06, ease.outCubic); tb.intensity = 3 + 4 * kaFlash; });
    kaRing.progress = ramp(t, k0 + 0.08, k0 + 0.4); kaRing.opacity = 1;
    kaGlow.material.opacity = 0.3 * ka + 1.2 * kaFlash; kaGlow.visible = ka > 0;
    brahmi.visible = t > k0 - 0.01;
    rings.forEach((l, i) => { l.progress = ramp(t, tScr + 0.25 + i * 0.07, tScr + 0.75 + i * 0.07); l.opacity = 0.9; });
    radials.progress = ramp(t, tScr + 0.3, tScr + 0.95); radials.opacity = 0.9;
    north.reveal = 1; north.opacity = ramp(t, tScr + 0.7, tScr + 0.9) * 0.8;
    mapLight.position.copy(MAP0).add(tmpV.set(0.3, 1.4, 0.3));
    mapLight.intensity = 9 * ka + 18 * kaFlash;
    // labels stand up and face the lens
    const camR0 = V(1, 0, 0).applyQuaternion(camera.quaternion), camU0 = V(0, 1, 0).applyQuaternion(camera.quaternion);
    kaLabel.position.copy(MAP0).add(tmpV.set(-0.72, 0.38, 0.0)).addScaledVector(camR0, -(kaLabel.worldWidth - 0.15) / 2).addScaledVector(camU0, 0.1); faceCamera(kaLabel, camera);
    kaLabel.reveal = ramp(t, k0 + 0.12, k0 + 0.4); kaLabel.opacity = kaLabel.reveal > 0 ? 1 : 0;
    kaSub.position.copy(MAP0).add(tmpV.set(-0.72, 0.38, 0.0)).addScaledVector(camR0, -(kaSub.worldWidth - 0.05) / 2).addScaledVector(camU0, -0.2); faceCamera(kaSub, camera);
    kaSub.reveal = ramp(t, k0 + 0.22, k0 + 0.55); kaSub.opacity = kaSub.reveal > 0 ? 1 : 0;
    const b0 = k0 + 0.1;
    trunkN.progress = ramp(t, b0, b0 + 0.18); trunkS.progress = ramp(t, b0, b0 + 0.18);
    const camUp = V(0, 1, 0).applyQuaternion(camera.quaternion), camRight = V(1, 0, 0).applyQuaternion(camera.quaternion);
    fam.forEach((f) => {
      const s = b0 + 0.1 + f.d;
      f.branch.progress = ramp(t, s, s + 0.26, ease.inOutSine);
      f.pulseT.progress = t > s + 0.26 ? fract((t - s - 0.26) * 0.9) * 1.2 : 0; f.pulseT.opacity = 0.8;
      const gp = ramp(t, s + 0.2, s + 0.42, ease.outCubic);
      f.tubes.forEach((tb, i) => { tb.progress = sat(gp * 1.3 - i * 0.1); });
      f.ring.progress = gp; f.ring.opacity = 0.8;
      f.g.visible = gp > 0;
      f.label.position.copy(MAP0).add(f.at).add(V(0, 0.05, 0));
      if (f.side === 'U') f.label.position.addScaledVector(camUp, 0.5);
      else f.label.position.addScaledVector(camRight, (f.side === 'R' ? 1 : -1) * (0.4 + (f.label.worldWidth - 0.085) / 2));
      faceCamera(f.label, camera);
      f.label.reveal = ramp(t, s + 0.24, s + 0.46); f.label.opacity = f.label.reveal > 0 ? 1 : 0;
    });

    // ---- atmosphere, lens
    dust.tick(t, info);
    fill.intensity = 0.22 + 0.06 * ramp(t, tScr, DUR);
    dof.focus = camera.position.distanceTo(camLook);
    dof.range = lerp(2.4, 5.5, ramp(t, tScr, DUR));
    dof.amount = 0.38;
    bloom.strength = 0.72 + 0.12 * pulse(T, { decay: 5 }) * ramp(t, tSutra, DUR);
  }

  const api = {
    scene, camera, update, dof, bloom, exposure: 1,
    exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomOut: 2.4 },
    arSubject: (t) => {
      const a = ramp(t, tTree - 0.2, tTree + 0.4), b = ramp(t, tScr + 0.1, tScr + 0.8);
      const c = V(-0.2, 1.2, 1.0).lerp(V(1.0, 1.8, 0.8), a).lerp(V(1.1, 0.0, -1.9), b);
      return { centre: c, radius: lerp(lerp(2.6, 3.6, a), 4.8, b) };
    },
  };
  return api;
}
