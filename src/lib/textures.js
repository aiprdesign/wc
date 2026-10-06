// Procedural canvas textures (marble, parchment, metal, blueprint, manuscripts…).
// Everything is generated at load time — no image assets are shipped.
import * as THREE from 'three';
import { fbm2, noise2 } from './noise.js';
import { rng } from './math.js';
import { FONTS } from './text.js';

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(c, { srgb = true, repeat = false, anisotropy = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

// Fill image data with a per-pixel function returning [r,g,b,a] 0..255. Runs at reduced res for speed.
function paint(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = fn(x / w, y / h, x, y);
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Carrara-style marble: soft white body with grey veins from turbulent sine bands.
export function marbleTexture({ size = 512, seed = 0, tint = [236, 230, 219], vein = [120, 114, 106] } = {}) {
  return cached(`marble${size}${seed}${tint}`, () => {
    const c = paint(size, size, (u, v) => {
      const s = seed * 13.1;
      const turb = fbm2(u * 3 + s, v * 3 - s, 6);
      const band = Math.abs(Math.sin((u * 2.2 + v * 1.1 + turb * 2.6) * Math.PI * 2));
      const veinAmt = Math.pow(1 - band, 18) * 0.9 + Math.pow(1 - band, 4) * 0.12;
      const cloud = fbm2(u * 8 + 7 + s, v * 8, 4) * 0.06;
      const k = Math.min(1, veinAmt);
      return [0, 1, 2].map((j) => Math.max(0, Math.min(255, tint[j] * (1 + cloud) * (1 - k) + vein[j] * k)));
    });
    return toTexture(c, { repeat: true });
  });
}

// Aged parchment: warm fibres, blotches, darker burnt edges.
export function parchmentTexture({ size = 512, seed = 0 } = {}) {
  return cached(`parch${size}${seed}`, () => {
    const c = paint(size, size, (u, v) => {
      const n = fbm2(u * 4 + seed, v * 4, 5);
      const fib = noise2(u * 180, v * 9 + seed) * 0.04;
      const edge = Math.min(u, v, 1 - u, 1 - v);
      const burn = Math.pow(1 - Math.min(1, edge * 7), 2.2) * 0.55;
      const blot = Math.max(0, fbm2(u * 2.3 - seed, v * 2.3 + 4, 4)) * 0.25;
      const l = 1 + n * 0.12 + fib - burn - blot;
      return [217 * l, 196 * l, 155 * l];
    });
    return toTexture(c, { repeat: false });
  });
}

// Brushed metal (greyscale; tint via material.color). Good as map + roughnessMap.
export function brushedMetalTexture({ size = 512, seed = 0 } = {}) {
  return cached(`brushed${size}${seed}`, () => {
    const r = rng(seed + 9);
    const c = canvas(size, size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 3; i++) {
      const y = r() * size, a = r() * 0.08, l = 120 + r() * 120;
      ctx.strokeStyle = `rgba(${l},${l},${l},${a})`;
      ctx.lineWidth = r() * 1.5 + 0.3;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y + (r() - 0.5) * 3); ctx.stroke();
    }
    return toTexture(c, { repeat: true });
  });
}

// Soft round sprite for particles (white, alpha falloff).
export function dotTexture(size = 128) {
  return cached(`dot${size}`, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return toTexture(c, { srgb: false });
  });
}

// Blueprint / engineering grid on transparent background (white lines; tint via material colour).
export function gridTexture({ size = 1024, cells = 16, sub = 4, major = 0.55, minor = 0.16 } = {}) {
  return cached(`grid${size}${cells}${sub}`, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const step = size / cells;
    for (let i = 0; i <= cells * sub; i++) {
      const p = Math.round((i * step) / sub) + 0.5;
      const isMajor = i % sub === 0;
      ctx.strokeStyle = `rgba(255,255,255,${isMajor ? major : minor})`;
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    return toTexture(c, { srgb: false, repeat: true });
  });
}

// Tileable RGBA noise data texture for shaders.
export function noiseDataTexture(size = 256, seed = 3) {
  return cached(`noise${size}${seed}`, () => {
    const r = rng(seed);
    const data = new Uint8Array(size * size * 4);
    for (let i = 0; i < data.length; i++) data[i] = Math.floor(r() * 256);
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    return t;
  });
}

const LATIN = [
  'In principio erat verbum', 'Elementa geometriae', 'De revolutionibus orbium',
  'Philosophiae naturalis', 'Principia mathematica', 'De architectura libri decem',
  'Quod erat demonstrandum', 'Sidereus nuncius', 'De humani corporis fabrica',
  'Lex naturae', 'Res publica', 'Ars longa vita brevis', 'Scientia potentia est',
  'Dialogo sopra i due massimi sistemi', 'Novum organum', 'Optice lux',
];

// Manuscript / notebook page with handwritten Latin lines and geometric constructions.
// kind: 'geometry' | 'astronomy' | 'architecture' | 'text'
// ink: CSS colour. transparent: draw only ink (for glowing overlays) instead of on parchment.
// phrases: the titles the handwriting is made of (Latin by default)
export function manuscriptTexture({ w = 1024, h = 1024, seed = 1, kind = 'geometry', ink = 'rgba(58,36,18,0.9)', transparent = false, phrases = LATIN } = {}) {
  return cached(`ms${w}${h}${seed}${kind}${ink}${transparent}${phrases === LATIN ? '' : phrases.join('|')}`, () => {
    const r = rng(seed * 97 + 5);
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    if (!transparent) {
      ctx.drawImage(parchmentTexture({ size: 512, seed: seed % 4 }).image, 0, 0, w, h);
    }
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineCap = 'round';
    const S = Math.min(w, h);
    const wobble = (x, y, x2, y2) => {
      ctx.beginPath(); ctx.moveTo(x, y);
      const mx = (x + x2) / 2 + (r() - 0.5) * S * 0.004, my = (y + y2) / 2 + (r() - 0.5) * S * 0.004;
      ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
    };
    const circle = (x, y, rad) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke(); };
    ctx.lineWidth = S * 0.0022;
    const cx = w * (0.35 + r() * 0.3), cy = h * (0.3 + r() * 0.15), R = S * (0.16 + r() * 0.08);
    if (kind === 'geometry') {
      circle(cx, cy, R);
      const n = 3 + Math.floor(r() * 4);
      const pts = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) wobble(pts[i][0], pts[i][1], pts[j][0], pts[j][1]);
      circle(cx, cy, R * 0.5); wobble(cx - R * 1.3, cy, cx + R * 1.3, cy); wobble(cx, cy - R * 1.3, cx, cy + R * 1.3);
      pts.forEach(([x, y], i) => { ctx.font = `italic ${S * 0.026}px "${FONTS.serif}"`; ctx.fillText(String.fromCharCode(65 + i), x + S * 0.01, y - S * 0.01); });
    } else if (kind === 'astronomy') {
      for (let i = 1; i <= 5; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, R * i * 0.28, R * i * 0.2, 0.2, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(cx, cy, S * 0.012, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 5; i++) { const a = r() * 6.28, k = (i + 1) * 0.28; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * k, cy + Math.sin(a) * R * k * 0.72, S * 0.006, 0, 6.28); ctx.fill(); }
      for (let i = 0; i < 24; i++) { const a = (i / 24) * 6.28; wobble(cx + Math.cos(a) * R * 1.45, cy + Math.sin(a) * R * 1.45, cx + Math.cos(a) * R * 1.55, cy + Math.sin(a) * R * 1.55); }
      circle(cx, cy, R * 1.45);
    } else if (kind === 'architecture') {
      const bw = R * 2.4, bh = R * 1.6, x0 = cx - bw / 2, y0 = cy - bh / 2;
      wobble(x0, y0 + bh * 0.28, cx, y0 - bh * 0.05); wobble(cx, y0 - bh * 0.05, x0 + bw, y0 + bh * 0.28);
      wobble(x0, y0 + bh * 0.28, x0 + bw, y0 + bh * 0.28); wobble(x0, y0 + bh * 0.36, x0 + bw, y0 + bh * 0.36);
      const cols = 6;
      for (let i = 0; i < cols; i++) { const x = x0 + bw * (0.07 + (i / (cols - 1)) * 0.86); wobble(x - bw * 0.02, y0 + bh * 0.36, x - bw * 0.02, y0 + bh); wobble(x + bw * 0.02, y0 + bh * 0.36, x + bw * 0.02, y0 + bh); }
      wobble(x0 - bw * 0.05, y0 + bh, x0 + bw * 1.05, y0 + bh);
      ctx.setLineDash([S * 0.006, S * 0.008]); circle(cx, y0 + bh * 0.6, bh * 0.55); ctx.setLineDash([]);
    }
    // Handwritten lines of Latin.
    const lines = kind === 'text' ? 22 : 9;
    const top = kind === 'text' ? h * 0.08 : cy + R * 1.7;
    ctx.font = `italic ${S * 0.032}px "${FONTS.serif}"`;
    for (let i = 0; i < lines; i++) {
      const y = top + i * S * 0.042;
      if (y > h * 0.94) break;
      let txt = '';
      while (txt.length < 46) txt += phrases[Math.floor(r() * phrases.length)] + ' · ';
      ctx.save(); ctx.translate(w * 0.08, y); ctx.rotate((r() - 0.5) * 0.01);
      ctx.fillText(txt, 0, 0); ctx.restore();
    }
    return toTexture(c);
  });
}
