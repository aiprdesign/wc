// COMPUTING — "branches of intelligence" finale (binary cue → zoom hand-over).
// A glowing neural core; five luminous branches grow out of it (bezier ribbons with twigs and
// travelling data pulses), each ending in a live UI card: CHAT · IMAGE · VIDEO · CODING · ROBOTICS.
// Card content is pre-rendered once into layered canvas atlases plus a "timing map" (per-pixel
// appear / disappear / blink), so every demo is a pure function of the card's progress uniform —
// word-by-word streaming, char-by-char typing, ghost-text accept, diffusion denoise (mip-blur +
// noise in the shader), filmstrip scrubbing (frame atlas) — with zero per-frame canvas work.
import * as THREE from 'three';
import { FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { sat, lerp, ease, ramp, rng, TAU } from '../lib/math.js';
import { FONTS } from '../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { glowSprite } from '../lib/materials.js';

const CW = 720, CH = 496, HEAD = 72, TS = 0.5;          // card canvas size, header, timing-map scale
const CARD_ASPECT = CW / CH;
const TAN_V = Math.tan(THREE.MathUtils.degToRad(35 / 2)); // scene camera fov 35
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ canvas helpers
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const font = (w, s, f = FONTS.sans) => `${w} ${s}px "${f}"`;
function spacing(g, px) { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; }

// A card = L stacked layers (colour atlas) + a half-res timing atlas:
//   R = appear progress, G = disappear progress (255 = never), B = blink phase (0 = steady).
function cardCanvas(L) {
  const col = mkCanvas(CW, CH * L), tim = mkCanvas(CW * TS, CH * L * TS);
  const g = col.getContext('2d'), gt = tim.getContext('2d');
  gt.fillStyle = 'rgb(0,255,0)'; gt.fillRect(0, 0, tim.width, tim.height);
  const layer = (i) => g.setTransform(1, 0, 0, 1, 0, i * CH);
  const mark = (i, x, y, w, h, a, d = 1, b = 0) => {
    gt.fillStyle = `rgb(${Math.round(sat(a) * 255)},${Math.round(sat(d) * 255)},${Math.round(sat(b) * 255)})`;
    gt.fillRect(Math.floor((x - 3) * TS), Math.floor((y - 3 + i * CH) * TS), Math.ceil((w + 6) * TS), Math.ceil((h + 6) * TS));
  };
  return { col, tim, g, gt, layer, mark, L };
}

function chrome(g, idx, label, status) {
  rr(g, 3, 3, CW - 6, CH - 6, 20);
  const bg = g.createLinearGradient(0, 0, 0, CH);
  bg.addColorStop(0, 'rgba(24,32,46,0.94)'); bg.addColorStop(1, 'rgba(8,11,17,0.94)');
  g.fillStyle = bg; g.fill();
  g.save(); g.clip(); g.fillStyle = 'rgba(160,200,255,0.07)'; g.fillRect(0, 0, CW, HEAD); g.restore();
  rr(g, 3, 3, CW - 6, CH - 6, 20); g.strokeStyle = 'rgba(170,205,255,0.42)'; g.lineWidth = 2; g.stroke();
  g.fillStyle = 'rgba(170,205,255,0.2)'; g.fillRect(3, HEAD, CW - 6, 1.5);
  g.textBaseline = 'middle';
  g.fillStyle = '#6f8db8'; g.font = font(400, 22, FONTS.mono); spacing(g, 1); g.fillText(`0${idx}`, 26, HEAD / 2 + 1);
  g.fillStyle = '#eef4fc'; g.font = font(500, 36, FONTS.mono); spacing(g, 5); g.fillText(label, 70, HEAD / 2 + 1);
  g.font = font(400, 17, FONTS.mono); spacing(g, 3);
  const sw = g.measureText(status).width;
  g.fillStyle = '#86a6cf'; g.fillText(status, CW - 26 - sw, HEAD / 2 + 1);
  g.beginPath(); g.arc(CW - 40 - sw, HEAD / 2 + 1, 5, 0, TAU); g.fillStyle = '#9cc8ff'; g.fill();
  spacing(g, 0);
}

// ------------------------------------------------------------------ procedural pictures
// Scene coordinates are in units of the picture height, centred horizontally, so crops of any aspect agree.
function drawScene(g, x, y, w, h, o) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const X = (u) => x + w / 2 + u * h, Y = (v) => y + v * h;
  const hz = o.horizon ?? 0.62;
  const sky = g.createLinearGradient(0, y, 0, Y(hz));
  sky.addColorStop(0, o.sky[0]); sky.addColorStop(0.6, o.sky[1]); sky.addColorStop(1, o.sky[2]);
  g.fillStyle = sky; g.fillRect(x, y, w, Y(hz) - y + 1);
  const sx = X(o.sun[0]), sy = Y(o.sun[1]);
  const gl = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.9);
  gl.addColorStop(0, o.glow); gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gl; g.fillRect(x, y, w, Y(hz) - y);
  g.beginPath(); g.arc(sx, sy, h * (o.sunR ?? 0.075), 0, TAU); g.fillStyle = o.sunCol; g.fill();
  if (o.stars) { const R = rng(o.seed + 99); g.fillStyle = 'rgba(220,232,255,0.8)'; for (let i = 0; i < 70; i++) g.fillRect(x + R() * w, y + R() * h * hz * 0.8, 1.4, 1.4); }
  // water
  const wa = g.createLinearGradient(0, Y(hz), 0, y + h);
  wa.addColorStop(0, o.water[0]); wa.addColorStop(1, o.water[1]);
  g.fillStyle = wa; g.fillRect(x, Y(hz), w, y + h - Y(hz));
  const R = rng(o.seed + 7);
  for (let i = 0; i < 26; i++) {
    const v = hz + 0.02 + Math.pow(R(), 1.6) * (1 - hz), len = (0.04 + R() * 0.12) * (1 - (v - hz) * 0.5);
    g.fillStyle = `rgba(${o.glint},${0.15 + R() * 0.35})`;
    g.fillRect(X(o.sun[0] - len / 2 + (R() - 0.5) * 0.1 * (v - hz) * 6), Y(v), len * h, Math.max(1, h * 0.006));
  }
  // ridges (far → near)
  const pan = o.pan ?? 0;
  for (let L = 0; L < 3; L++) {
    const r = rng(o.seed + L * 17), a = r() * 9, b = r() * 9, c = r() * 9;
    const amp = 0.13 - L * 0.03, base = hz - 0.005;
    g.beginPath(); g.moveTo(x, Y(hz) + 1);
    for (let i = 0; i <= 90; i++) {
      const u = -w / h / 2 + (i / 90) * (w / h), q = u + pan * (0.15 + L * 0.25) + L * 3.1;
      const m = 0.5 + 0.28 * Math.sin(q * 2.3 + a) + 0.16 * Math.sin(q * 5.7 + b) + 0.06 * Math.sin(q * 13.1 + c);
      g.lineTo(X(u), Y(base - amp * m * (o.ridgeMask ? o.ridgeMask(u) : 1)));
    }
    g.lineTo(x + w, Y(hz) + 1); g.closePath();
    g.fillStyle = o.ridge[L]; g.fill();
  }
  if (o.lighthouse) {
    const lx = o.lighthouse, top = hz - 0.34;
    g.beginPath(); g.moveTo(X(lx - 0.45), Y(hz) + 2); g.quadraticCurveTo(X(lx - 0.2), Y(hz - 0.2), X(lx - 0.06), Y(hz - 0.18));
    g.lineTo(X(lx + 0.5), Y(hz - 0.2)); g.lineTo(X(lx + 0.6), Y(hz) + 2); g.closePath(); g.fillStyle = '#05070b'; g.fill();
    g.beginPath(); g.moveTo(X(lx - 0.03), Y(hz - 0.18)); g.lineTo(X(lx - 0.02), Y(top)); g.lineTo(X(lx + 0.02), Y(top)); g.lineTo(X(lx + 0.03), Y(hz - 0.18)); g.closePath(); g.fill();
    g.fillRect(X(lx - 0.028), Y(top - 0.05), 0.056 * h, 0.05 * h);
    const bm = g.createLinearGradient(X(lx), 0, X(lx - 0.9), 0);
    bm.addColorStop(0, 'rgba(255,226,170,0.55)'); bm.addColorStop(1, 'rgba(255,226,170,0)');
    g.beginPath(); g.moveTo(X(lx), Y(top - 0.025)); g.lineTo(X(lx - 0.95), Y(top - 0.12)); g.lineTo(X(lx - 0.95), Y(top + 0.06)); g.closePath(); g.fillStyle = bm; g.fill();
    g.beginPath(); g.arc(X(lx), Y(top - 0.025), h * 0.014, 0, TAU); g.fillStyle = '#fff1d0'; g.fill();
  }
  if (o.bird != null) {
    const ph = o.bird, bx = X(-1.2 + ph * 2.4), by = Y(0.44 + Math.sin(ph * 5) * 0.03), s = h * 0.11;
    const fl = Math.sin(ph * TAU * 3.2);
    g.fillStyle = '#070a10'; g.strokeStyle = '#070a10'; g.lineWidth = Math.max(1.2, h * 0.012); g.lineCap = 'round';
    g.beginPath(); g.ellipse(bx, by, s * 0.32, s * 0.09, -0.05, 0, TAU); g.fill();
    for (const sd of [-1, 1]) {
      g.beginPath(); g.moveTo(bx + sd * s * 0.05, by);
      g.quadraticCurveTo(bx + sd * s * 0.45, by - s * (0.1 + fl * 0.45), bx + sd * s * 0.95, by - s * fl * 0.55 + s * 0.12);
      g.stroke();
    }
  }
  g.restore();
}
const MOODS = [
  { seed: 11, sky: ['#0d1626', '#2a3d5a', '#b99a6e'], glow: 'rgba(255,214,150,0.55)', sunCol: '#ffe6b8', sun: [0.25, 0.5], water: ['#1a2638', '#070a10'], glint: '255,220,170', ridge: ['#26344a', '#172233', '#0a1019'], lighthouse: 0.55 },
  { seed: 23, sky: ['#070c16', '#152238', '#4a6384'], glow: 'rgba(170,205,255,0.35)', sunCol: '#e8f0ff', sun: [-0.35, 0.28], sunR: 0.05, stars: true, water: ['#101a2a', '#05070b'], glint: '200,220,255', ridge: ['#1b2638', '#111a28', '#070b12'], lighthouse: -0.5 },
  { seed: 37, sky: ['#1a2233', '#4d5d77', '#c7b18c'], glow: 'rgba(255,230,190,0.5)', sunCol: '#fff0d4', sun: [-0.1, 0.55], water: ['#2c3a4e', '#0b0f16'], glint: '255,235,200', ridge: ['#4a5870', '#303d52', '#141b27'], lighthouse: 0.62 },
  { seed: 51, sky: ['#0a1220', '#1f3552', '#7f95b2'], glow: 'rgba(190,215,255,0.45)', sunCol: '#f4f8ff', sun: [0.35, 0.46], water: ['#152236', '#06090e'], glint: '210,228,255', ridge: ['#223047', '#152033', '#080d15'], lighthouse: -0.6 },
];

// ------------------------------------------------------------------ the five cards
function chatCard() {
  const C = cardCanvas(3), { g } = C;
  C.layer(0); chrome(g, 1, 'CHAT AI', 'LIVE');
  g.textBaseline = 'middle';
  // user bubble
  const q = 'How does a transistor work?';
  g.font = font(400, 28); const qw = g.measureText(q).width;
  const bx = CW - 30 - qw - 44, by = 94;
  rr(g, bx, by, qw + 44, 54, 24); g.fillStyle = 'rgba(120,165,230,0.32)'; g.fill();
  g.fillStyle = '#eef4fc'; g.fillText(q, bx + 22, by + 28);
  C.mark(0, bx, by, qw + 44, 54, 0.03);
  // assistant avatar
  const ax = 46, ay = 196;
  g.beginPath(); g.arc(ax, ay, 19, 0, TAU); g.strokeStyle = 'rgba(170,205,255,0.7)'; g.lineWidth = 2; g.stroke();
  [[-7, 5], [7, 5], [0, -7]].forEach(([dx, dy]) => { g.beginPath(); g.arc(ax + dx, ay + dy, 3.2, 0, TAU); g.fillStyle = '#cfe3ff'; g.fill(); });
  g.beginPath(); g.moveTo(ax - 7, ay + 5); g.lineTo(ax, ay - 7); g.lineTo(ax + 7, ay + 5); g.closePath(); g.strokeStyle = 'rgba(207,227,255,0.6)'; g.lineWidth = 1.5; g.stroke();
  C.mark(0, ax - 22, ay - 22, 44, 44, 0.12);
  // reply: streamed word by word
  const reply = 'It is a tiny electronic switch: a small signal at the gate controls a much larger current. Billions of them, working together, make a processor.';
  g.font = font(400, 27);
  const rx = 76, maxW = CW - rx - 58, lh = 38, words = reply.split(' ');
  const lines = [[]]; let lw = 0;
  for (const wd of words) { const ww = g.measureText(wd + ' ').width; if (lw + ww > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push([wd, lw]); lw += ww; }
  const ry = 172, rh = lines.length * lh + 26;
  rr(g, rx, ry, CW - rx - 30, rh, 20); g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill(); g.strokeStyle = 'rgba(170,205,255,0.18)'; g.lineWidth = 1.5; g.stroke();
  C.mark(0, rx, ry, CW - rx - 30, rh, 0.3);
  let k = 0; const N = words.length;
  C.layer(1);
  lines.forEach((ln, li) => ln.forEach(([wd, ox]) => {
    const tx = rx + 22 + ox, ty = ry + 13 + lh * li + lh / 2;
    g.fillStyle = '#dde8f6'; g.fillText(wd, tx, ty);
    C.mark(1, tx - 2, ty - lh / 2 + 3, g.measureText(wd).width + 4, lh - 6, 0.32 + (k / (N - 1)) * 0.5);
    k++;
  }));
  // input bar
  C.layer(0);
  rr(g, 24, 410, CW - 48, 60, 30); g.fillStyle = 'rgba(255,255,255,0.035)'; g.fill(); g.strokeStyle = 'rgba(170,205,255,0.26)'; g.lineWidth = 1.5; g.stroke();
  g.font = font(300, 25); g.fillStyle = 'rgba(175,195,222,0.55)'; g.fillText('Ask anything…', 54, 441);
  g.beginPath(); g.arc(CW - 58, 440, 20, 0, TAU); g.fillStyle = 'rgba(156,200,255,0.85)'; g.fill();
  g.beginPath(); g.moveTo(CW - 58, 430); g.lineTo(CW - 58, 451); g.moveTo(CW - 66, 438); g.lineTo(CW - 58, 430); g.lineTo(CW - 50, 438); g.strokeStyle = '#0b1220'; g.lineWidth = 3; g.lineCap = 'round'; g.stroke();
  // layer 2: typing indicator
  C.layer(2);
  rr(g, rx, ry, 104, 50, 22); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill(); g.strokeStyle = 'rgba(170,205,255,0.2)'; g.stroke();
  C.mark(2, rx, ry, 104, 50, 0.13, 0.3);
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(rx + 30 + i * 22, ry + 25, 6.5, 0, TAU); g.fillStyle = '#d6e6fa'; g.fill(); C.mark(2, rx + 21 + i * 22, ry + 16, 18, 18, 0.13, 0.3, (i + 1) / 4); }
  return C;
}

function imageCard() {
  const C = cardCanvas(2), { g } = C;
  C.layer(0); chrome(g, 2, 'IMAGE AI', 'DIFFUSION');
  g.textBaseline = 'middle';
  rr(g, 24, 88, CW - 48, 54, 27); g.fillStyle = 'rgba(255,255,255,0.04)'; g.fill(); g.strokeStyle = 'rgba(170,205,255,0.24)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = '#9cc8ff'; g.font = font(500, 24, FONTS.mono); g.fillText('›', 44, 115);
  const prompt = 'a lighthouse on a cliff at dusk';
  g.font = font(400, 23, FONTS.mono);
  let x = 70;
  C.layer(1);
  for (let i = 0; i < prompt.length; i++) {
    const ch = prompt[i], cw = g.measureText(ch).width;
    g.fillStyle = '#e3ecf8'; g.fillText(ch, x, 115);
    C.mark(1, x, 100, cw, 30, 0.01 + (i / prompt.length) * 0.15);
    x += cw;
  }
  // grid frame (the shader paints the pictures inside)
  C.layer(0);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { rr(g, 24 + i * 341, 160 + j * 145, 331, 135, 8); g.strokeStyle = 'rgba(170,205,255,0.22)'; g.lineWidth = 1.5; g.stroke(); }
  g.fillStyle = 'rgba(170,205,255,0.14)'; g.fillRect(24, 456, CW - 48, 4);
  g.font = font(400, 16, FONTS.mono); spacing(g, 2); g.fillStyle = '#7690b4';
  g.fillText('SEED 1956', 24, 480); const r = '4 × 1024²'; g.fillText(r, CW - 24 - g.measureText(r).width, 480); spacing(g, 0);
  // picture atlas (2×2), mipmapped for the denoise blur
  const PW = 512, PH = 209, pc = mkCanvas(PW * 2, PH * 2), pg = pc.getContext('2d');
  MOODS.forEach((m, k) => drawScene(pg, (k % 2) * PW, Math.floor(k / 2) * PH, PW, PH, m));
  const pics = toTexture(pc); pics.generateMipmaps = true; pics.minFilter = THREE.LinearMipmapLinearFilter;
  return Object.assign(C, { extra: { uImg: pics, uRect: new THREE.Vector4(24 / CW, 1 - 440 / CH, 696 / CW, 1 - 160 / CH), uBar: new THREE.Vector4(24 / CW, 1 - 460 / CH, 696 / CW, 1 - 456 / CH) } });
}

function videoCard() {
  const C = cardCanvas(1), { g } = C;
  C.layer(0); chrome(g, 3, 'VIDEO AI', '24 FPS');
  // 12 frames of a gull gliding over the sea (camera slowly panning)
  const FW = 384, FH = 138, fc = mkCanvas(FW * 4, FH * 3), fg = fc.getContext('2d');
  const mood = { seed: 64, sky: ['#0b1322', '#26395a', '#b3966c'], glow: 'rgba(255,214,150,0.5)', sunCol: '#ffe6b8', sun: [0.15, 0.52], water: ['#1a2638', '#06090e'], glint: '255,222,175', ridge: ['#26344a', '#172233', '#0a1019'] };
  for (let k = 0; k < 12; k++) drawScene(fg, (k % 4) * FW, Math.floor(k / 4) * FH, FW, FH, { ...mood, pan: k / 11 * 0.8, bird: 0.08 + (k / 11) * 0.84 });
  g.textBaseline = 'middle';
  rr(g, 22, 86, CW - 44, 246, 6); g.fillStyle = '#05070b'; g.fill();
  g.font = font(400, 16, FONTS.mono); spacing(g, 2); g.fillStyle = '#7690b4';
  g.fillText('CLIP 01 · 00:04', 24, 348);
  g.font = font(300, 19); spacing(g, 0); g.fillStyle = 'rgba(200,215,235,0.75)';
  const pr = 'a gull gliding over the sea'; g.fillText(pr, CW - 24 - g.measureText(pr).width, 348);
  // strip: 6 thumbnails (every other frame)
  for (let j = 0; j < 6; j++) {
    const k = j * 2, tx = 24 + j * 112, ty = 372;
    g.drawImage(fc, (k % 4) * FW, Math.floor(k / 4) * FH, FW, FH, tx + 1, ty, 110, 40);
    g.strokeStyle = 'rgba(170,205,255,0.25)'; g.lineWidth = 1; g.strokeRect(tx + 1.5, ty + 0.5, 109, 39);
  }
  for (let i = 0; i <= 48; i++) { const tx = 24 + i * 14; g.fillStyle = i % 4 ? 'rgba(170,205,255,0.22)' : 'rgba(170,205,255,0.5)'; g.fillRect(tx, 420, 1.5, i % 4 ? 6 : 11); }
  g.font = font(400, 15, FONTS.mono); spacing(g, 1); g.fillStyle = '#6f8db8';
  ['00:00', '00:01', '00:02', '00:03', '00:04'].forEach((s, i) => g.fillText(s, 24 + i * 168 - (i === 4 ? 44 : 0), 448));
  // transport
  g.beginPath(); g.moveTo(30, 466); g.lineTo(30, 486); g.lineTo(46, 476); g.closePath(); g.fillStyle = '#cfe3ff'; g.fill();
  g.fillStyle = 'rgba(170,205,255,0.2)'; g.fillRect(60, 475, CW - 84, 2); spacing(g, 0);
  const frames = toTexture(fc);
  return Object.assign(C, { extra: { uImg: frames, uRect: new THREE.Vector4(24 / CW, 1 - 330 / CH, 696 / CW, 1 - 88 / CH), uStrip: new THREE.Vector4(24 / CW, 1 - 414 / CH, 696 / CW, 1 - 370 / CH) } });
}

function codeCard() {
  const C = cardCanvas(5), { g } = C;
  C.layer(0); chrome(g, 4, 'CODING AI', 'PY');
  const KW = '#8fb8ff', ID = '#e3ecf8', PU = '#93a3ba', NU = '#e3c27f', CM = '#5f7392', FN = '#bfe0ff';
  const LINES = [
    [[CM, '# nth Fibonacci number']],
    [[KW, 'def '], [FN, 'fib'], [PU, '(n):']],
    [[ID, '    a, b '], [PU, '= '], [NU, '0'], [PU, ', '], [NU, '1']],
    [[KW, '    for '], [ID, '_ '], [KW, 'in '], [FN, 'range'], [PU, '(n):']],
    [[ID, '        a, b '], [PU, '= '], [ID, 'b, a '], [PU, '+ '], [ID, 'b']],
    [[KW, '    return '], [ID, 'a']],
    [],
    [[FN, 'print'], [PU, '('], [FN, 'fib'], [PU, '('], [NU, '10'], [PU, '))']],
  ];
  const X0 = 78, Y0 = 108, LH = 40;
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(4, HEAD + 2, CW - 8, 356);
  g.textBaseline = 'middle'; g.font = font(400, 22, FONTS.mono);
  for (let l = 0; l < LINES.length; l++) { g.fillStyle = '#4f6280'; g.fillText(String(l + 1), 30, Y0 + l * LH); }
  g.font = font(400, 25, FONTS.mono);
  const cw = g.measureText('M').width;
  // typed segments: [line, t0, t1] (line 1–3 typed, 4–6 suggested, 8 typed after accept)
  const TYPED = [[0, 0.0, 0.1], [1, 0.1, 0.19], [2, 0.19, 0.3], [7, 0.66, 0.8]];
  const GHOST_IN = 0.36, ACCEPT = 0.56;
  const caret = (l, c, a, d, blink = 0) => { const x = X0 + c * cw; C.layer(4); g.fillStyle = '#eef4fc'; g.fillRect(x, Y0 + l * LH - 15, 3, 30); C.mark(4, x, Y0 + l * LH - 15, 3, 30, a, d, blink); };
  const drawLine = (l, layerIdx, colorOverride, timeFn) => {
    C.layer(layerIdx); let c = 0;
    for (const [col, s] of LINES[l]) for (const ch of s) {
      if (ch !== ' ') { g.fillStyle = colorOverride ?? col; g.fillText(ch, X0 + c * cw, Y0 + l * LH); const tm = timeFn(c); C.mark(layerIdx, X0 + c * cw, Y0 + l * LH - 17, cw, 34, tm[0], tm[1]); }
      c++;
    }
    return c;
  };
  for (const [l, a, b] of TYPED) {
    const n = LINES[l].reduce((s, [, t]) => s + t.length, 0);
    drawLine(l, 1, null, (c) => [a + (c / n) * (b - a), 1]);
    for (let c = 0; c < n; c++) caret(l, c + 1, a + (c / n) * (b - a), a + ((c + 1) / n) * (b - a));
  }
  // idle caret after line 3 (blinking) until the suggestion is accepted
  const n3 = LINES[2].reduce((s, [, t]) => s + t.length, 0);
  caret(2, n3, 0.3, GHOST_IN, 0.5);
  // ghost suggestion (layer 2), accepted colour (layer 3)
  for (const l of [3, 4, 5]) { drawLine(l, 2, '#4c5b72', () => [GHOST_IN + (l - 3) * 0.02, ACCEPT]); drawLine(l, 3, null, () => [ACCEPT, 1]); }
  // "Tab" chip while the ghost is showing
  C.layer(2); g.font = font(500, 16, FONTS.mono); spacing(g, 2);
  const chipX = X0 + 23 * cw, chipY = Y0 + 3 * LH - 15;
  rr(g, chipX, chipY, 96, 30, 6); g.fillStyle = 'rgba(156,200,255,0.16)'; g.fill(); g.strokeStyle = 'rgba(156,200,255,0.5)'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = '#cfe3ff'; g.fillText('TAB ⇥', chipX + 14, chipY + 16);
  C.mark(2, chipX, chipY, 96, 30, GHOST_IN + 0.04, ACCEPT); spacing(g, 0);
  // accepted: highlight band + a thin gold gutter bar (layer 4)
  C.layer(4);
  g.fillStyle = 'rgba(156,200,255,0.1)'; g.fillRect(64, Y0 + 3 * LH - 20, CW - 90, 3 * LH);
  C.mark(4, 64, Y0 + 3 * LH - 20, CW - 90, 3 * LH, ACCEPT, ACCEPT + 0.14);
  g.fillStyle = '#e3c27f'; g.fillRect(62, Y0 + 3 * LH - 18, 3, 3 * LH - 4);
  C.mark(4, 58, Y0 + 3 * LH - 18, 8, 3 * LH - 4, ACCEPT);
  caret(5, 12, ACCEPT, 0.66, 0.5);
  caret(7, 14, 0.8, 1, 0.5);
  // status bar
  C.layer(0);
  g.fillStyle = 'rgba(160,200,255,0.06)'; g.fillRect(4, 432, CW - 8, 60);
  C.layer(1); g.font = font(400, 17, FONTS.mono); spacing(g, 1);
  g.fillStyle = '#86a6cf'; g.fillText('✓ suggestion accepted · 3 lines', 26, 462); C.mark(1, 26, 450, 360, 26, ACCEPT + 0.02);
  g.fillStyle = '#eef4fc'; g.font = font(500, 20, FONTS.mono); g.fillText('▶ 55', CW - 96, 462); C.mark(1, CW - 100, 448, 80, 28, 0.86);
  spacing(g, 0);
  return C;
}

function robotCard() {
  const C = cardCanvas(2), { g } = C;
  C.layer(0); chrome(g, 5, 'ROBOTICS', '6-AXIS');
  const vg = g.createRadialGradient(CW / 2, 330, 20, CW / 2, 330, 380);
  vg.addColorStop(0, 'rgba(90,130,190,0.12)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = vg; g.fillRect(6, HEAD + 2, CW - 12, CH - HEAD - 8);
  g.textBaseline = 'middle'; g.font = font(400, 19, FONTS.mono); spacing(g, 2);
  const steps = [['01  LOCATE', 0, 0.18], ['02  GRASP', 0.18, 0.44], ['03  PLACE', 0.44, 1]];
  steps.forEach(([s, a, b], i) => {
    const y = 104 + i * 30;
    C.layer(0); g.fillStyle = '#4f6280'; g.fillText(s, 30, y);
    C.layer(1); g.fillStyle = '#eef4fc'; g.fillText(s, 30, y); g.fillStyle = '#9cc8ff'; g.fillRect(18, y - 8, 3, 16);
    C.mark(1, 16, y - 12, 200, 24, a, b);
  });
  C.layer(0); g.fillStyle = '#7690b4'; const gl = 'GRIP'; g.fillText(gl, CW - 104, 104);
  g.beginPath(); g.arc(CW - 34, 104, 8, 0, TAU); g.strokeStyle = 'rgba(170,205,255,0.6)'; g.lineWidth = 1.5; g.stroke();
  C.layer(1); g.beginPath(); g.arc(CW - 34, 104, 5.5, 0, TAU); g.fillStyle = '#e3c27f'; g.fill(); C.mark(1, CW - 44, 94, 20, 20, 0.31, 0.77);
  C.layer(0); g.font = font(400, 15, FONTS.mono); g.fillStyle = '#5a6f90';
  g.fillText('J1 J2 J3 · IK', CW - 150, 134);
  spacing(g, 0);
  return C;
}

// ------------------------------------------------------------------ card material
const CARD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CARD_FS = /* glsl */ `
uniform sampler2D uCol, uTim; uniform float uP, uTime, uOpacity, uReveal, uFlash; uniform vec3 uWipe;
#if defined(IMG) || defined(VID)
uniform sampler2D uImg; uniform vec4 uRect;
#endif
#ifdef IMG
uniform vec4 uBar;
#endif
#ifdef VID
uniform vec4 uStrip;
#endif
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
bool inRect(vec2 p, vec4 r){ return p.x >= r.x && p.x <= r.z && p.y >= r.y && p.y <= r.w; }
void main(){
  float w = dot(uWipe.xy, vUv) + uWipe.z;            // 0 at the port → 1 at the far side
  float rv = uReveal * 1.25 - 0.05;
  if (w > rv) discard;
  vec3 P = vec3(0.0); float A = 0.0;
  for (int i = 0; i < LAYERS; i++) {
    vec2 uv = vec2(vUv.x, (vUv.y + float(LAYERS - 1 - i)) / float(LAYERS));
    vec4 c = texture2D(uCol, uv); vec3 tm = texture2D(uTim, uv).rgb;
    float vis = clamp((uP - tm.r) / 0.02, 0.0, 1.0);
    if (tm.g < 0.996) vis *= 1.0 - clamp((uP - tm.g) / 0.02, 0.0, 1.0);
    if (tm.b > 0.02) vis *= 0.25 + 0.75 * step(0.0, sin(uTime * 13.0 - tm.b * 7.0));
    float ca = c.a * vis;
    P = P * (1.0 - ca) + c.rgb * ca; A = A * (1.0 - ca) + ca;
    if (i == 0) {
#ifdef IMG
      vec2 q = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
      if (q.x >= 0.0 && q.x < 1.0 && q.y >= 0.0 && q.y < 1.0) {
        vec2 cq = q * 2.0, cell = floor(cq), lq = fract(cq);
        vec2 gap = vec2(0.0075, 0.018);
        if (lq.x > gap.x && lq.x < 1.0 - gap.x && lq.y > gap.y && lq.y < 1.0 - gap.y) {
          vec2 lu = (lq - gap) / (1.0 - 2.0 * gap);
          float k = cell.x + (1.0 - cell.y) * 2.0;
          float kk = clamp((uP - 0.17 - k * 0.07) / 0.42, 0.0, 1.0);
          float ab = kk * kk * (3.0 - 2.0 * kk);
          vec3 img = textureLod(uImg, (cell + lu) * 0.5, (1.0 - ab) * 6.0).rgb;
          float n = hash(floor(lu * vec2(150.0, 62.0)) + floor(uTime * 20.0) * vec2(3.1, 7.3));
          vec3 nz = vec3(0.07, 0.09, 0.13) + vec3(0.34, 0.38, 0.46) * n * n;
          vec3 c2 = mix(nz, img, ab) + (n - 0.5) * 0.35 * ab * (1.0 - ab);
          c2 *= clamp(uP / 0.08, 0.0, 1.0);
          // selected tile: thin gold keyline once resolved
          vec2 e = min(lu, 1.0 - lu) * vec2(2.45, 1.0);
          float sel = step(k, 0.5) * smoothstep(0.62, 0.72, uP) * step(min(e.x, e.y), 0.022);
          c2 = mix(c2, vec3(0.95, 0.72, 0.36), sel);
          P = c2; A = 1.0;
        }
      }
      if (inRect(vUv, uBar) && (vUv.x - uBar.x) / (uBar.z - uBar.x) < clamp((uP - 0.17) / 0.63, 0.0, 1.0)) { P = vec3(0.62, 0.78, 1.0); A = 1.0; }
#endif
#ifdef VID
      vec2 q = (vUv - uRect.xy) / (uRect.zw - uRect.xy);
      float ph = clamp(uP * 1.1, 0.0, 1.0);
      if (q.x >= 0.0 && q.x < 1.0 && q.y >= 0.0 && q.y < 1.0) {
        float f = ph * 11.0, f0 = floor(f), f1 = min(f0 + 1.0, 11.0);
        vec2 u0 = (vec2(mod(f0, 4.0), 2.0 - floor(f0 / 4.0)) + q) / vec2(4.0, 3.0);
        vec2 u1 = (vec2(mod(f1, 4.0), 2.0 - floor(f1 / 4.0)) + q) / vec2(4.0, 3.0);
        vec3 c2 = mix(texture2D(uImg, u0).rgb, texture2D(uImg, u1).rgb, f - f0);
        P = c2 * clamp(uP / 0.06, 0.0, 1.0); A = 1.0;
      }
#endif
    }
  }
#ifdef VID
  {
    float ph = clamp(uP * 1.1, 0.0, 1.0);
    float xh = mix(uStrip.x, uStrip.z, ph);
    float s = step(uStrip.y, vUv.y) * step(vUv.y, uStrip.w);
    if (vUv.x < xh && vUv.x > uStrip.x) P += vec3(0.05, 0.08, 0.12) * s;
    float line = step(abs(vUv.x - xh), 0.0022) * step(uStrip.y - 0.015, vUv.y) * step(vUv.y, uStrip.w + 0.01);
    float knob = step(abs(vUv.x - xh), 0.007) * step(uStrip.w + 0.006, vUv.y) * step(vUv.y, uStrip.w + 0.024);
    P = mix(P, vec3(1.3, 1.35, 1.4), line); P = mix(P, vec3(0.95, 0.72, 0.36), knob); A = max(A, max(line, knob));
  }
#endif
  vec3 col = P / max(A, 1e-4);
  float edge = exp(-abs(w - rv) * 70.0) * step(uReveal, 0.999);
  col += vec3(0.7, 0.85, 1.0) * edge * 2.0; A = max(A, edge * 0.8);
  vec2 d2 = min(vUv, 1.0 - vUv) * vec2(${CARD_ASPECT.toFixed(4)}, 1.0);
  float rim = exp(-min(d2.x, d2.y) * 90.0) * uFlash * step(0.2, A);
  col += vec3(0.7, 0.86, 1.0) * rim * 1.4;
  gl_FragColor = vec4(col, A * uOpacity);
}`;
function cardMaterial(C, mode) {
  const colTex = toTexture(C.col), timTex = toTexture(C.tim, { srgb: false });
  const uniforms = { uCol: { value: colTex }, uTim: { value: timTex }, uP: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uReveal: { value: 0 }, uFlash: { value: 0 }, uWipe: { value: new THREE.Vector3(1, 0, 0) } };
  for (const [k, v] of Object.entries(C.extra ?? {})) uniforms[k] = { value: v };
  const defines = { LAYERS: C.L }; if (mode) defines[mode] = 1;
  return new THREE.ShaderMaterial({ uniforms, defines, vertexShader: CARD_VS, fragmentShader: CARD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ------------------------------------------------------------------ branch ribbons
const BR_VS = /* glsl */ `attribute float aS; attribute float aV; attribute vec4 aB;
varying float vS; varying float vV; varying vec4 vB;
void main(){ vS = aS; vV = aV; vB = aB; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BR_FS = /* glsl */ `uniform float uTime, uOpacity; varying float vS; varying float vV; varying vec4 vB;
void main(){
  float grow = clamp((uTime - vB.x) / vB.y, 0.0, 1.0);
  if (vS > grow) discard;
  float av = abs(vV);
  float core = 1.0 - smoothstep(0.1, 0.32, av);
  float glow = exp(-av * 3.2) * (1.0 - av);
  float done = step(0.999, grow);
  float sp = 0.9 + vB.z * 0.6, h = vB.z * 7.0;
  float d1 = fract(uTime * sp + h) - vS, d2 = fract(uTime * sp + h + 0.5) - vS;
  float pul = (step(0.0, d1) * exp(-d1 * 16.0) + step(0.0, d2) * exp(-d2 * 16.0)) * done * (1.0 - vB.w * 0.6);
  float tip = exp(-(grow - vS) * 45.0) * (1.0 - done);
  vec3 base = vec3(0.30, 0.52, 0.95) * (1.0 - vB.w * 0.35);
  vec3 c = base * (core * 0.7 + glow * 0.26) + vec3(0.92, 0.97, 1.0) * (pul * 3.2 + tip * 3.0) * (core + glow * 0.5);
  c *= smoothstep(0.0, 0.07, vS);
  gl_FragColor = vec4(c * uOpacity, 1.0);
}`;

// ------------------------------------------------------------------ build
// P: { Y0, Zc, D_REF } — frame-centre height, card plane z and reference camera distance (world-B local).
export function buildBranches({ Y0, Zc, D_REF, tStart }) {
  const group = new THREE.Group();
  const OA = OUTPUT_ASPECT;
  const halfH = TAN_V * D_REF * (OA < FILM_ASPECT ? Math.pow(FILM_ASPECT / OA, 0.85) : 1), halfW = halfH * OA;
  const square = OA < 1.5;
  const ux = halfW, uy = square ? halfW : halfH;         // square & portrait: one unit for both axes
  // [id, builder, mode, xn, yn, wn]  (order = growth order)
  const LAYOUT = square
    ? { core: [0, 0.12], cards: [[-0.575, 0.4, 0.6], [0.575, 0.4, 0.6], [0.6, -0.16, 0.6], [-0.6, -0.16, 0.6], [0, -0.545, 0.54]] }
    : { core: [0, 0.12], cards: [[-0.76, 0.5, 0.29], [0.76, 0.5, 0.29], [0.62, -0.45, 0.29], [-0.62, -0.45, 0.29], [0, -0.58, 0.25]] };
  const DEFS = [[chatCard, null], [imageCard, 'IMG'], [videoCard, 'VID'], [codeCard, null], [robotCard, null]];
  const core = V3(LAYOUT.core[0] * ux, Y0 + LAYOUT.core[1] * uy, Zc);
  const unit = uy / 5.95;                                   // 1 at the square reference

  // ---- neural core
  const coreG = new THREE.Group(); coreG.position.copy(core); group.add(coreG);
  const RC = 0.85 * unit;
  const nodesP = [];
  { const n = 54, ga = Math.PI * (3 - Math.sqrt(5)); for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) * 2 / n, r = Math.sqrt(1 - y * y); nodesP.push(V3(Math.cos(i * ga) * r, y, Math.sin(i * ga) * r).multiplyScalar(RC)); } }
  const nShell = nodesP.length, R = rng(8128);
  for (let i = 0; i < 16; i++) { const v = V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(RC * (0.25 + R() * 0.35)); nodesP.push(v); }
  const nodeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#e4f0ff').multiplyScalar(2.0), toneMapped: false, transparent: true });
  const nodeMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03 * unit, 10, 8), nodeMat, nodesP.length); nodeMesh.frustumCulled = false;
  coreG.add(nodeMesh);
  const eP = [], eT = [], eH = [], seen = new Set();
  const link = (i, j) => { const k = i < j ? `${i}-${j}` : `${j}-${i}`; if (seen.has(k)) return; seen.add(k); const a = nodesP[i], b = nodesP[j]; eP.push(a.x, a.y, a.z, b.x, b.y, b.z); const h = R(); eT.push(0, 1); eH.push(h, h); };
  nodesP.forEach((p, i) => {
    const pool = i < nShell ? [...Array(nShell).keys()] : [...Array(nodesP.length).keys()];
    pool.filter((j) => j !== i).sort((a, b) => p.distanceToSquared(nodesP[a]) - p.distanceToSquared(nodesP[b])).slice(0, 3).forEach((j) => link(i, j));
  });
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(eP, 3));
  edgeGeo.setAttribute('aT', new THREE.Float32BufferAttribute(eT, 1));
  edgeGeo.setAttribute('aH', new THREE.Float32BufferAttribute(eH, 1));
  const edgeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `attribute float aT; attribute float aH; varying float vT; varying float vH; void main(){ vT = aT; vH = aH; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime, uOpacity; varying float vT; varying float vH;
      void main(){ float ph = fract(vT * 0.5 - uTime * 1.4 + vH * 3.0);
        float p = smoothstep(0.08, 0.0, abs(ph - 0.5)) * step(0.3, vH);
        gl_FragColor = vec4(vec3(0.42, 0.62, 1.0) * (0.5 + p * 3.5), uOpacity * (0.5 + p)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  coreG.add(new THREE.LineSegments(edgeGeo, edgeMat));
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cc8ff').multiplyScalar(1.1), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const rings = [0, 1].map((k) => { const m = new THREE.Mesh(new THREE.TorusGeometry(RC * (1.28 + k * 0.16), 0.006 * unit, 6, 160), ringMat); group.add(m); m.position.copy(core); return m; });
  const halo = glowSprite({ color: '#bcd8ff', intensity: 0.85, scale: 1 }); halo.position.copy(core); group.add(halo);
  const nucleus = glowSprite({ color: '#fff0d6', intensity: 1.7, scale: 1 }); nucleus.position.copy(core); group.add(nucleus);

  // ---- cards
  const cards = LAYOUT.cards.map(([xn, yn, wn], i) => {
    const [builder, mode] = DEFS[i];
    const C = builder();
    const w = wn * ux, h = w / CARD_ASPECT;
    const mat = cardMaterial(C, mode);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); mesh.renderOrder = 3;
    const bottom = Math.abs(xn) < 0.15, side = Math.sign(xn);
    mesh.position.set(xn * ux, Y0 + yn * uy, Zc);
    mesh.rotation.y = bottom ? 0 : side * -0.1;
    group.add(mesh); mesh.updateMatrixWorld(true);
    const port = bottom ? V3(0, h / 2, 0) : V3(-side * w / 2, 0, 0);
    mesh.localToWorld(port); group.worldToLocal(port);  // group sits at the origin at build time
    const out = bottom ? V3(0, -1, 0) : V3(side, 0, 0);
    mat.uniforms.uWipe.value.set(bottom ? 0 : -side, bottom ? -1 : 0, bottom ? 1 : side > 0 ? 1 : 0);
    // (x: left-anchored cards wipe with +x, right-anchored with −x; bottom card wipes downward)
    if (!bottom) mat.uniforms.uWipe.value.set(side > 0 ? 1 : -1, 0, side > 0 ? 0 : 1);
    return { mesh, mat, w, h, port, out, bottom, i, sp: 0, ph: 0, t0: tStart + i * 0.045 };
  });

  // ---- Explore 3D only: a smoked-glass backing slab with a lit rim behind every card, so seen off-axis or
  // from behind the cards are physical panels (the film always faces them square-on, where it is invisible)
  const slabMat = new THREE.MeshStandardMaterial({ color: '#0a0f17', metalness: 0.55, roughness: 0.28, envMapIntensity: 0.8 });
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cc8ff').multiplyScalar(0.9), toneMapped: false });
  const backs = cards.map((c) => {
    const W = c.w, H = c.h, r = Math.min(W, H) * 0.035, D = 0.045 * unit;
    const sh = new THREE.Shape();
    sh.moveTo(-W / 2 + r, -H / 2); sh.lineTo(W / 2 - r, -H / 2); sh.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r);
    sh.lineTo(W / 2, H / 2 - r); sh.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2); sh.lineTo(-W / 2 + r, H / 2);
    sh.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r); sh.lineTo(-W / 2, -H / 2 + r); sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -D - 0.004 * unit);
    const slab = new THREE.Mesh(g, slabMat);
    const rimPts = sh.getSpacedPoints(96).map((p) => V3(p.x, p.y, -D - 0.004 * unit));
    const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rimPts), rimMat);
    const grp = new THREE.Group(); grp.add(slab, rim);
    grp.position.copy(c.mesh.position); grp.rotation.copy(c.mesh.rotation);
    grp.visible = false; group.add(grp);
    return grp;
  });
  function showBacks() {
    for (let i = 0; i < cards.length; i++) { const c = cards[i]; backs[i].visible = c.mesh.visible; backs[i].scale.copy(c.mesh.scale); }
  }

  // ---- branches (+ twigs) as one ribbon mesh
  const pos = [], aS = [], aV = [], aB = [], idx = [], dotsP = [];
  const ribbon = (curve, width, taper, start, dur, h, kind) => {
    const N = 72, base = pos.length / 3, pts = curve.getSpacedPoints(N), tan = new THREE.Vector3();
    for (let k = 0; k <= N; k++) {
      const s = k / N; curve.getTangentAt(Math.min(s, 0.999), tan);
      const nx = -tan.y, ny = tan.x, nl = Math.hypot(nx, ny) || 1, wd = width * lerp(1, taper, s) / 2;
      for (const v of [-1, 1]) { pos.push(pts[k].x + (nx / nl) * wd * v, pts[k].y + (ny / nl) * wd * v, pts[k].z); aS.push(s); aV.push(v); aB.push(start, dur, h, kind); }
      if (k < N) { const a = base + k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  };
  const BR_DUR = 0.24;
  cards.forEach((c) => {
    const dir = c.port.clone().sub(core).normalize();
    const P0 = core.clone().addScaledVector(dir, RC * 0.55), P3 = c.port.clone();
    const L = P0.distanceTo(P3);
    const P1 = P0.clone().addScaledVector(dir.clone().lerp(c.out, 0.35).normalize(), L * 0.38);
    const P2 = P3.clone().addScaledVector(c.out, -L * 0.42);
    const curve = new THREE.CubicBezierCurve3(P0, P1, P2, P3);
    const hsh = R();
    c.sp = 0.9 + hsh * 0.6; c.ph = hsh * 7.0;
    c.bStart = c.t0 - BR_DUR; c.arrive = c.t0;
    ribbon(curve, 0.17 * unit, 0.55, c.bStart, BR_DUR, hsh, 0);
    // twigs
    [0.36, 0.64].forEach((s, k) => {
      const B = curve.getPointAt(s), T = curve.getTangentAt(s);
      const sgn = (k === 0 ? 1 : -1) * (c.i % 2 ? -1 : 1);
      const Nn = V3(-T.y, T.x, 0).normalize().multiplyScalar(sgn);
      const len = (0.55 + R() * 0.35) * unit;
      const E = B.clone().addScaledVector(T, len * 0.45).addScaledVector(Nn, len);
      const tw = new THREE.CubicBezierCurve3(B.clone(), B.clone().addScaledVector(T, len * 0.35), E.clone().addScaledVector(Nn, -len * 0.45), E);
      const ts = c.bStart + s * BR_DUR;
      ribbon(tw, 0.1 * unit, 0.35, ts, 0.16, R(), 1);
      dotsP.push({ p: B, t: ts, r: 0.035 * unit }, { p: E, t: ts + 0.16, r: 0.05 * unit });
    });
  });
  const brGeo = new THREE.BufferGeometry();
  brGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  brGeo.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  brGeo.setAttribute('aV', new THREE.Float32BufferAttribute(aV, 1));
  brGeo.setAttribute('aB', new THREE.Float32BufferAttribute(aB, 4));
  brGeo.setIndex(idx);
  const brMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } }, vertexShader: BR_VS, fragmentShader: BR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const branches = new THREE.Mesh(brGeo, brMat); branches.frustumCulled = false; branches.renderOrder = 1; group.add(branches);
  cards.forEach((c) => dotsP.push({ p: c.port, t: c.arrive, r: 0.06 * unit, port: true }));
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dcebff').multiplyScalar(1.8), toneMapped: false });
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), dotMat, dotsP.length); dots.frustumCulled = false; dots.renderOrder = 4; group.add(dots);
  const portRings = new THREE.InstancedMesh(new THREE.RingGeometry(1.7, 2.0, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cc8ff').multiplyScalar(1.2), toneMapped: false, transparent: true, depthWrite: false }), cards.length);
  portRings.frustumCulled = false; portRings.renderOrder = 4; group.add(portRings);

  // ---- robot arm on the ROBOTICS card
  const rc = cards[4];
  const robot = new THREE.Group();
  const rSteel = new THREE.MeshStandardMaterial({ color: '#aab5c2', metalness: 0.85, roughness: 0.42 });
  const rDark = new THREE.MeshStandardMaterial({ color: '#2b3038', metalness: 0.8, roughness: 0.4 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.03, 0.42), new THREE.MeshStandardMaterial({ color: '#10141a', metalness: 0.6, roughness: 0.45 })); plate.position.set(0.28, -0.625, 0); robot.add(plate);
  const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9cc8ff').multiplyScalar(0.9), toneMapped: false });
  const PA = V3(0.3, 0, 0.12), PB = V3(0.66, 0, -0.06);
  for (const p of [PA, PB]) { const pad = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.095, 32), padMat); pad.rotation.x = -Math.PI / 2; pad.position.set(p.x, -0.608, p.z); robot.add(pad); }
  const rbase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 32), rDark); rbase.position.y = -0.56; robot.add(rbase);
  const yaw = new THREE.Group(); yaw.position.y = -0.51; robot.add(yaw);
  const sh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), rDark); sh.position.y = 0.08; yaw.add(sh);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.1, 24), rSteel); col.position.y = 0.03; yaw.add(col);
  const shoulder = new THREE.Group(); shoulder.position.y = 0.1; yaw.add(shoulder);
  const L1 = 0.55, L2 = 0.48, GRIP = 0.13;
  const up1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, L1, 0.09), rSteel); up1.position.y = L1 / 2; shoulder.add(up1);
  const elbow = new THREE.Group(); elbow.position.y = L1; shoulder.add(elbow);
  elbow.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), rDark));
  const fore = new THREE.Mesh(new THREE.BoxGeometry(0.07, L2, 0.07), rSteel); fore.position.y = L2 / 2; elbow.add(fore);
  const wrist = new THREE.Group(); wrist.position.y = L2; elbow.add(wrist);
  wrist.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), rDark));
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.06), rDark); palm.position.y = 0.045; wrist.add(palm);
  const fingers = [-1, 1].map((s) => { const f = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.05), rSteel); f.position.set(s * 0.07, 0.1, 0); wrist.add(f); return f; });
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial({ color: '#f0c46a', metalness: 1, roughness: 0.25, emissive: '#6a4a14', emissiveIntensity: 0.25 }));
  robot.add(cube);
  // stands in front of the card; position/scale compensated for perspective so it reads inside the card body
  const dz = rc.h * 0.16, kp = (D_REF - dz) / D_REF;
  const rs = rc.h * 0.62 * kp;
  robot.scale.setScalar(rs);
  const platY = rc.mesh.position.y - rc.h * 0.5 + rc.h * 0.14;          // where the plate's front edge should read
  robot.position.set(rc.mesh.position.x - rc.w * 0.17, Y0 + (platY - Y0) * kp + 0.62 * rs, Zc + dz); robot.rotation.x = 0.3;
  group.add(robot);
  const SHY = -0.51 + 0.1, FLOOR = -0.61, CUBE_Y = FLOOR + 0.05;
  const psiA = Math.atan2(-PA.z, PA.x), psiB = Math.atan2(-PB.z, PB.x), rA = Math.hypot(PA.x, PA.z), rB = Math.hypot(PB.x, PB.z);
  const pose = { psi: 0, r: 0, y: 0, grip: 0, carry: 0 };
  function robotPose(p) {
    const e = ease.inOutCubic;
    const REST = [-0.15, 0.36, CUBE_Y + GRIP + 0.4];
    let psi = REST[0], r = REST[1], y = REST[2];
    const k1 = ramp(p, 0.0, 0.18, e); psi = lerp(REST[0], psiA, k1); r = lerp(REST[1], rA, k1); y = lerp(REST[2], CUBE_Y + GRIP + 0.22, k1);
    y = lerp(y, CUBE_Y + GRIP, ramp(p, 0.18, 0.28, e));
    y = lerp(y, CUBE_Y + GRIP + 0.26, ramp(p, 0.36, 0.46, e));
    psi = lerp(psi, psiB, ramp(p, 0.42, 0.66, e)); r = lerp(r, rB, ramp(p, 0.42, 0.66, e));
    y = lerp(y, CUBE_Y + GRIP + 0.005, ramp(p, 0.64, 0.74, e));
    const back = ramp(p, 0.8, 0.98, e);
    psi = lerp(psi, REST[0], back); r = lerp(r, REST[1], back); y = lerp(y, REST[2], back);
    pose.psi = psi; pose.r = r; pose.y = y;
    pose.grip = ramp(p, 0.28, 0.34, e) * (1 - ramp(p, 0.75, 0.8, e));
    pose.carry = p >= 0.31 && p < 0.77 ? 1 : 0;
  }
  function robotApply(p) {
    robotPose(p);
    const r = pose.r, hh = pose.y + GRIP - SHY;               // wrist target relative to the shoulder pivot
    const d = Math.min(Math.hypot(r, hh), L1 + L2 - 1e-3);
    const phi = Math.atan2(r, hh);
    const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const bend = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
    const th1 = phi - alpha;
    yaw.rotation.y = pose.psi;
    shoulder.rotation.z = -th1; elbow.rotation.z = -bend; wrist.rotation.z = -(Math.PI - th1 - bend);
    const spread = lerp(0.09, 0.059, pose.grip);
    fingers[0].position.x = -spread; fingers[1].position.x = spread;
    if (pose.carry) cube.position.set(r * Math.cos(pose.psi), pose.y, -r * Math.sin(pose.psi));
    else if (p < 0.31) cube.position.set(PA.x, CUBE_Y, PA.z);
    else cube.position.set(PB.x, CUBE_Y, PB.z);
    cube.rotation.y = pose.carry ? pose.psi - psiA : p < 0.31 ? 0 : psiB - psiA;
  }

  // ---- update
  const M = new THREE.Matrix4();
  function update(t, T, zoom, coreIn) {
    for (const b of backs) b.visible = false;
    // core
    coreG.rotation.set(0.35 + Math.sin(t * 0.6) * 0.1, t * 0.45, 0);
    const cIn = coreIn;
    for (let i = 0; i < nodesP.length; i++) { const p = nodesP[i], s = sat(cIn * 1.6 - (i / nodesP.length) * 0.6) * (1 + zoom * 0.5); M.makeScale(s, s, s).setPosition(p.x, p.y, p.z); nodeMesh.setMatrixAt(i, M); }
    nodeMesh.instanceMatrix.needsUpdate = true;
    nodeMesh.visible = cIn > 0.001;
    edgeMat.uniforms.uTime.value = T; edgeMat.uniforms.uOpacity.value = sat(cIn * 1.4 - 0.3);
    rings[0].rotation.set(1.2 + Math.sin(t * 0.5) * 0.1, t * 0.7, 0.3);
    rings[1].rotation.set(-0.9, -t * 0.5, 1.1 + t * 0.2);
    ringMat.opacity = sat(cIn * 2 - 1) * 0.8;
    const beat = Math.pow(0.5 + 0.5 * Math.cos(T * Math.PI * 4), 6);
    halo.material.opacity = cIn * (0.75 + beat * 0.15); halo.scale.setScalar(RC * (3.4 + zoom * 3));
    nucleus.material.opacity = cIn * (0.8 + zoom * 0.4); nucleus.scale.setScalar(RC * (1.0 + beat * 0.1 + zoom * 2.5));
    // branches
    brMat.uniforms.uTime.value = t;
    branches.visible = t > cards[0].bStart - 0.01;
    // dots
    for (let i = 0; i < dotsP.length; i++) {
      const d = dotsP[i], k = ease.outBack(sat((t - d.t) / 0.12));
      const s = d.r * k * (d.port ? 1 + 0.25 * Math.max(0, Math.sin(t * 9)) : 1);
      M.makeScale(s, s, s).setPosition(d.p.x, d.p.y, d.p.z + 0.01); dots.setMatrixAt(i, M);
    }
    dots.instanceMatrix.needsUpdate = true;
    // cards
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], u = c.mat.uniforms;
      const rev = ramp(t, c.arrive - 0.02, c.arrive + 0.2, ease.outCubic);
      c.mesh.visible = rev > 0.001;
      u.uReveal.value = rev; u.uTime.value = t; u.uP.value = sat((t - c.arrive) / 0.75);
      const f1 = t * c.sp + c.ph;
      const fl = Math.max(Math.exp(-(f1 - Math.floor(f1)) * 14), Math.exp(-(f1 + 0.5 - Math.floor(f1 + 0.5)) * 14));
      u.uFlash.value = (0.25 + fl) * sat((t - c.arrive) / 0.2) + (1 - sat((t - c.arrive) / 0.25)) * rev * 1.5;
      c.mesh.scale.setScalar(0.94 + 0.06 * rev);
      const pr = ease.outBack(sat((t - c.arrive + 0.03) / 0.14)) * 0.06 * unit;
      M.makeScale(pr, pr, pr).setPosition(c.port.x, c.port.y, c.port.z + 0.012); portRings.setMatrixAt(i, M);
    }
    portRings.instanceMatrix.needsUpdate = true;
    // robot
    const rrv = cards[4].mat.uniforms.uReveal.value;
    robot.visible = rrv > 0.05;
    robot.scale.setScalar(rs * ease.outBack(sat((rrv - 0.3) / 0.7)) + 1e-4);
    robotApply(cards[4].mat.uniforms.uP.value);
  }
  return { group, update, showBacks, core, cards, coreG };
}
