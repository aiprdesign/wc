// Taj Mahal — the helpers behind temple-taj.js: procedural textures and materials (Makrana marble with a
// warm light-wrap, Thuluth-style calligraphy in black inlay, pietra-dura floral spandrels, carved dado
// panels as a normal map, jali screens, the minarets' inlaid stripes) and the geometry kit: a per-part
// collector that carries its own second UV set and a baked occlusion tint, four-centred Mughal arches,
// arched frames, half-domed niche shells, moulding rings and lathed solids.
import * as THREE from 'three';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { fbm2 } from '../../lib/noise.js';
import { rng } from '../../lib/math.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ============================================================================================ textures
// tileable value from fbm (four-corner blend), u, v in [0, 1)
function tileNoise(u, v, f, oct, seed) {
  const s = (a, b) => fbm2(a * f + seed, b * f - seed, oct);
  return s(u, v) * (1 - u) * (1 - v) + s(u - 1, v) * u * (1 - v) + s(u, v - 1) * (1 - u) * v + s(u - 1, v - 1) * u * v;
}
function pixels(w, h, fn) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p = fn(x / w, y / h, x, y), i = (y * w + x) * 4; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255; }
  g.putImageData(img, 0, 0);
  return c;
}
// Makrana marble: a warm white body, faint cloud and a few soft grey-amber veins (one tile = 4 m)
function marbleTex(size) {
  return pixels(size, size, (u, v) => {
    const cloud = tileNoise(u, v, 3, 4, 11) * 0.025 + tileNoise(u, v, 9, 3, 5) * 0.012;
    const t = tileNoise(u, v, 2, 5, 3);
    const band = Math.abs(Math.sin((u + v * 0.5 + t * 1.6) * Math.PI * 2));
    const vein = Math.pow(1 - band, 22) * 0.055 + Math.pow(1 - band, 5) * 0.012;
    const k = 1 + cloud - vein;
    return [246 * k, 242 * k - vein * 20, 235 * k - vein * 34];
  });
}
// a calligraphic flat nib: the path is stroked several times along the nib's edge (thick / thin strokes)
function nibStroke(g, path, nib, ang = -0.78) {
  const dx = Math.cos(ang) * nib, dy = Math.sin(ang) * nib;
  for (let k = 0; k <= 8; k++) {
    const f = k / 8 - 0.5;
    g.save(); g.translate(dx * f, dy * f); path(g); g.stroke(); g.restore();
  }
}
// Thuluth-like band (NOT real text): two rules, tall shafts, sweeping bowls, loops, a second tier of small
// letters and the diacritical diamonds. u runs along the band (one tile = 12 band widths), v across it.
function calligraphyTex() {
  const W = 2048, H = 170, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(23);
  const bg = pixels(256, 32, (u, v) => { const k = 1 + tileNoise(u, v, 4, 3, 2) * 0.03; return [240 * k, 234 * k, 224 * k]; });
  g.drawImage(bg, 0, 0, W, H);
  const ink = '#15110e';
  g.fillStyle = ink; g.fillRect(0, H * 0.045, W, H * 0.035); g.fillRect(0, H * 0.92, W, H * 0.035);
  g.strokeStyle = ink; g.lineWidth = 2.6; g.lineCap = 'round'; g.lineJoin = 'round';
  const yb = H * 0.64, u = H * 0.095, nib = u * 1.3;
  const glyph = (x, type, s = 1, y0 = yb) => {
    const U = u * s, N = nib * s;
    const P = (fn) => nibStroke(g, (q) => { q.beginPath(); fn(q); }, N);
    switch (type) {
      case 'alif': P((q) => { q.moveTo(x, y0); q.lineTo(x + 0.55 * U, y0 - 4.9 * U); q.lineTo(x + 0.25 * U, y0 - 5.1 * U); }); return 1.5 * U;
      case 'lam': P((q) => { q.moveTo(x + 0.6 * U, y0 - 4.8 * U); q.lineTo(x + 0.2 * U, y0 - 0.4 * U); q.quadraticCurveTo(x + 0.3 * U, y0 + 0.4 * U, x + 2.2 * U, y0); }); return 2.6 * U;
      case 'kashida': { const L = (2 + r() * 3) * U; P((q) => { q.moveTo(x, y0); q.bezierCurveTo(x + L * 0.3, y0 + 0.5 * U, x + L * 0.7, y0 - 0.3 * U, x + L, y0); }); return L; }
      case 'bowl': P((q) => { q.moveTo(x + 0.2 * U, y0 - 1.4 * U); q.bezierCurveTo(x - 0.4 * U, y0 + 1.8 * U, x + 3.2 * U, y0 + 2.0 * U, x + 3.4 * U, y0 - 0.9 * U); }); return 3.6 * U;
      case 'loop': P((q) => { q.ellipse(x + 0.8 * U, y0 - 0.6 * U, 0.6 * U, 0.55 * U, 0, 0, Math.PI * 2); q.moveTo(x + 0.3 * U, y0 - 0.2 * U); q.quadraticCurveTo(x + 0.2 * U, y0 + 1.3 * U, x - 0.9 * U, y0 + 1.5 * U); }); return 1.8 * U;
      case 'ess': P((q) => { q.moveTo(x, y0 - 2.6 * U); q.bezierCurveTo(x + 2.2 * U, y0 - 3.2 * U, x - 0.6 * U, y0 - 0.6 * U, x + 1.8 * U, y0); }); return 2.2 * U;
      case 'tooth': P((q) => { q.moveTo(x, y0); q.lineTo(x + 0.3 * U, y0 - 1.3 * U); q.moveTo(x + 0.3 * U, y0); q.lineTo(x + 0.9 * U, y0 - 1.0 * U); q.lineTo(x + 1.2 * U, y0); }); return 1.4 * U;
      default: return U;
    }
  };
  const dot = (x, y, s) => { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = ink; g.fillRect(-s / 2, -s / 2, s, s); g.restore(); };
  const big = ['alif', 'lam', 'kashida', 'bowl', 'loop', 'ess', 'tooth', 'alif', 'kashida', 'lam'];
  const small = ['tooth', 'loop', 'ess', 'kashida'];
  let x = 12;
  while (x < W - 3.5 * u) {
    const n = 2 + Math.floor(r() * 4);
    for (let k = 0; k < n && x < W - 3.5 * u; k++) {
      const t = big[Math.floor(r() * big.length)];
      const x0 = x; x += glyph(x, t) + u * 0.25;
      if (r() < 0.55) dot(x0 + u * (0.4 + r()), yb + u * (1.3 + r() * 0.6), u * 0.55);
      if (t === 'kashida' || t === 'bowl') {
        // the upper tier: small letters and diamonds stacked over the long strokes
        let xs = x0 + u * 0.4;
        const ys = yb - u * (3.0 + r() * 0.8);
        for (let j = 0; j < 2 && xs < x - u; j++) xs += glyph(xs, small[Math.floor(r() * small.length)], 0.5, ys) + u * 0.2;
        dot(x0 + u * (0.8 + r() * 1.5), yb - u * (4.4 + r() * 0.4), u * 0.45);
      }
      if (r() < 0.3) { g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0 + u, yb - 4.3 * u); g.lineTo(x0 + 2.0 * u, yb - 4.8 * u); g.stroke(); g.lineWidth = 2.6; }
    }
    x += u * (0.9 + r() * 0.8);
  }
  return c;
}
// pietra dura: scrolling vines with leaves and flowers in carnelian, lapis, jade and amber (tile = 2.4 m)
function floralTex() {
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(41);
  g.drawImage(pixels(128, 128, (u, v) => { const k = 1 + tileNoise(u, v, 3, 3, 9) * 0.03; return [242 * k, 237 * k, 228 * k]; }), 0, 0, S, S);
  const wrap = (fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  const cols = ['#b2482a', '#3e5d91', '#c5922f', '#c25d42', '#8a3a5a'];
  const leafC = ['#5f7f4e', '#4b6a44', '#6f8c55'];
  const stems = [[0.27, 0.0], [0.77, Math.PI]];
  for (const [y0, ph] of stems) {
    const yAt = (x) => S * y0 + S * 0.2 * Math.sin((x / S) * Math.PI * 2 + ph);
    wrap(() => {
      g.strokeStyle = '#4f5d43'; g.lineWidth = 3.2; g.beginPath();
      for (let x = 0; x <= S; x += 4) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x)));
      g.stroke();
    });
    // tendrils, leaves and flowers along the stem
    for (let k = 0; k < 8; k++) {
      const x = (k + 0.5) * S / 8, y = yAt(x), side = k % 2 ? 1 : -1, sl = Math.cos((x / S) * Math.PI * 2 + ph) * 0.53;
      const ang = Math.atan(sl * Math.PI * 2 * 0.085 * S / S * 6) + side * 1.0;
      const lc = leafC[k % 3], fc = cols[Math.floor(r() * cols.length)];
      wrap(() => {
        // tendril
        g.strokeStyle = '#55634a'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(x, y);
        const tx = x + Math.cos(ang) * 30, ty = y + side * 26;
        g.quadraticCurveTo(x + Math.cos(ang) * 14, y + side * 30, tx, ty); g.stroke();
        // two leaves
        for (const [lx, ly, la] of [[x + 9, y + side * 6, ang - 0.4], [x - 10, y - side * 5, ang + Math.PI + 0.3]]) {
          g.save(); g.translate(lx, ly); g.rotate(la); g.fillStyle = lc; g.beginPath(); g.ellipse(9, 0, 10, 3.6, 0, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(30,40,25,0.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 0); g.lineTo(18, 0); g.stroke(); g.restore();
        }
        // a flower at the tendril's end: five petals round a dark eye, or a tulip
        g.save(); g.translate(tx, ty);
        if (k % 3 === 0) {
          g.rotate(side > 0 ? 0 : Math.PI); g.fillStyle = fc;
          for (const dx of [-5, 0, 5]) { g.beginPath(); g.ellipse(dx, -6, 3.6, 8, dx * 0.06, 0, Math.PI * 2); g.fill(); }
          g.fillStyle = '#4f6a40'; g.fillRect(-1, 0, 2, 7);
        } else {
          for (let p = 0; p < 5; p++) { g.rotate(Math.PI * 2 / 5); g.fillStyle = fc; g.beginPath(); g.ellipse(0, -5.5, 3.4, 5.2, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(40,20,15,0.5)'; g.lineWidth = 0.7; g.stroke(); }
          g.fillStyle = '#d8b24a'; g.beginPath(); g.arc(0, 0, 2.6, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      });
    }
  }
  return c;
}
// carved dado panel (relief): a cusped arch panel with a flowering plant; height → normal map, plus an
// albedo with a little cavity darkening so the carving reads in shade. Panel aspect 1 : 1.25.
function dadoTex() {
  const W = 256, H = 320, hc = mkCanvas(W, H), g = hc.getContext('2d');
  const grey = (v) => `rgb(${v * 255 | 0},${v * 255 | 0},${v * 255 | 0})`;
  g.fillStyle = grey(0.85); g.fillRect(0, 0, W, H);
  g.fillStyle = grey(1.0); g.fillRect(4, 4, W - 8, H - 8);
  // the recessed field under a cusped (multifoil) arch
  const m = 26, top = 78;
  g.fillStyle = grey(0.3); g.beginPath(); g.moveTo(m, H - m); g.lineTo(m, top + 20);
  const cx = W / 2, rx = W / 2 - m;
  for (let i = 0; i <= 5; i++) {
    const a0 = Math.PI + i * Math.PI / 5, a1 = a0 + Math.PI / 5, am = (a0 + a1) / 2;
    const px = cx + Math.cos(a1) * rx, py = top + 20 + Math.sin(a1) * 52 - (i === 2 ? 0 : 0);
    g.quadraticCurveTo(cx + Math.cos(am) * (rx * 0.82), top + 20 + Math.sin(am) * 40, px, py);
  }
  g.lineTo(W - m, H - m); g.closePath(); g.fill();
  // the plant: stem, paired leaves, three tulips and a mound of small leaves
  const blob = (x, y, rx2, ry2, rot, hi = 0.95) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry2 / rx2);
    const gr = g.createRadialGradient(0, -rx2 * 0.2, 0, 0, 0, rx2); gr.addColorStop(0, grey(hi)); gr.addColorStop(0.7, grey(hi * 0.8)); gr.addColorStop(1, grey(0.4));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx2, 0, Math.PI * 2); g.fill(); g.restore();
  };
  g.strokeStyle = grey(0.8); g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, H - m - 18); g.bezierCurveTo(cx - 6, 210, cx + 6, 160, cx, 118); g.stroke();
  g.lineWidth = 4;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx, 170); g.quadraticCurveTo(cx + s * 30, 150, cx + s * 52, 128); g.stroke();
    for (const [y, l] of [[250, 1], [214, 0.9], [184, 0.75]]) blob(cx + s * 30 * l, y - 12, 30 * l, 9, s * -0.55, 0.9);
    blob(cx + s * 56, 118, 13, 17, s * 0.4, 1.0);   // side tulips
    blob(cx + s * 62, 106, 6, 11, s * 0.7, 0.95);
    blob(cx + s * 50, 106, 6, 11, s * 0.1, 0.95);
  }
  blob(cx, 106, 15, 21, 0, 1.0);                     // the crowning tulip
  blob(cx - 8, 92, 6, 13, -0.25, 0.95); blob(cx + 8, 92, 6, 13, 0.25, 0.95);
  for (let i = -3; i <= 3; i++) blob(cx + i * 15, H - m - 12 - (3 - Math.abs(i)) * 3, 12, 8, i * 0.3, 0.75);
  // soften (blur) and read back
  const bc = mkCanvas(W, H), bg = bc.getContext('2d'); bg.filter = 'blur(1.6px)'; bg.drawImage(hc, 0, 0);
  const hd = bg.getImageData(0, 0, W, H).data, h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = hd[i * 4] / 255;
  const at = (x, y) => h[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
  const S = 5.5;
  const nrm = pixels(W, H, (u, v, x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * S, dy = (at(x, y + 1) - at(x, y - 1)) * S;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
  const alb = pixels(W, H, (u, v, x, y) => {
    const hv = at(x, y), lap = (at(x - 2, y) + at(x + 2, y) + at(x, y - 2) + at(x, y + 2)) / 4 - hv;
    const k = (0.8 + 0.2 * hv) * (1 - Math.max(0, lap) * 1.6);
    return [244 * k, 238 * k, 229 * k];
  });
  return { nrm, alb };
}
// jali (pierced screen): an octagon-and-star lattice, marble bars over dark (alpha: holes cut out)
function jaliTex(alpha) {
  const S = 256, n = 4;
  return pixels(S, S, (u, v) => {
    const x = u * n, y = v * n;
    const fr = (t) => Math.abs(t - Math.round(t));
    const d = Math.min(fr(x), fr(y), fr(x + y) / Math.SQRT2 * 1.0, fr(x - y) / Math.SQRT2 * 1.0);
    const bar = sstep(0.075, 0.05, d);
    const k = 0.86 + 0.14 * sstep(0.075, 0.0, d);
    return alpha ? [232 * k, 226 * k, 216 * k, bar > 0.5 ? 255 : 0] : [26 + (232 * k - 26) * bar, 21 + (226 * k - 21) * bar, 18 + (216 * k - 18) * bar];
  });
}
// pierced balustrade for the minaret galleries: rails top and bottom, a row of small pointed arches cut out
function railTex() {
  const W = 256, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#ece6dc'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(120,110,100,0.35)'; g.fillRect(0, 18, W, 2); g.fillRect(0, H - 20, W, 2);
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  const n = 4, w = W / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * w + w * 0.2, x1 = (i + 1) * w - w * 0.2, xm = (x0 + x1) / 2, yb = H - 26, ys = 52, ya = 30;
    g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, ys); g.quadraticCurveTo(x0, ya + 6, xm, ya); g.quadraticCurveTo(x1, ya + 6, x1, ys); g.lineTo(x1, yb); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}
// minaret cladding: long white slabs edged with black inlay lines (one tile = one slab width × 4 m)
function minarTex() {
  const W = 128, H = 512;
  return pixels(W, H, (u, v, x, y) => {
    const k = 1 + tileNoise(u, v, 3, 3, 17) * 0.025;
    const line = x < 7 || Math.abs(y - H / 2) < 1.2 ? 1 : 0;
    return line ? [34, 28, 24] : [244 * k, 239 * k, 230 * k];
  });
}

// ============================================================================================ materials
// light-wrap and a faint back-scatter on the direct sun: marble's soft, glowing terminator
function wrapLight(m, tag) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        void tajWrap( const in IncidentLight L, const in vec3 n, const in vec3 v, const in PhysicalMaterial mat, inout ReflectedLight rl ) {
          float nl = dot( n, L.direction );
          float w = clamp( ( nl + 0.4 ) / 1.4, 0.0, 1.0 );
          float extra = max( w * w - max( nl, 0.0 ), 0.0 ) * 0.6;
          float bs = pow( clamp( dot( v, -L.direction ), 0.0, 1.0 ), 6.0 ) * 0.1;
          rl.directDiffuse += L.color * ( extra + bs ) * vec3( 1.0, 0.84, 0.66 ) * BRDF_Lambert( mat.diffuseColor );
        }`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replaceAll(
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); tajWrap( directLight, geometryNormal, geometryViewDir, material, reflectedLight );'));
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => `${key ? key() : ''}|${tag}`;
}
const ch1 = (t) => { t.channel = 1; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
export function makeTajMaterials(M, lite) {
  if (M.tajMarble) return;
  const mt = toTexture(marbleTex(lite ? 256 : 512), { repeat: true });
  M.tajMarble = new THREE.MeshPhysicalMaterial({ map: mt, color: '#f8f3ec', roughness: 0.4, vertexColors: true, sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffe8cf') });
  M.tajMarble.userData.detail = { albedo: 0.03, rough: 0.35, grime: 0.05, bump: 0.000012 };
  wrapLight(M.tajMarble, 'taj-wrap-v1');
  const decal = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, ...o });
  M.tajCalli = decal({ map: ch1(toTexture(calligraphyTex(), { repeat: true })), roughness: 0.32, color: '#f6f1ea' });
  M.tajFloral = decal({ map: ch1(toTexture(floralTex(), { repeat: true })), roughness: 0.34, color: '#f6f1ea' });
  const dd = dadoTex();
  M.tajDado = decal({ map: ch1(toTexture(dd.alb, { repeat: true })), normalMap: ch1(toTexture(dd.nrm, { srgb: false, repeat: true })), normalScale: new THREE.Vector2(1.3, 1.3), roughness: 0.45, color: '#f6f1ea' });
  M.tajBlack = decal({ color: '#1e1a17', roughness: 0.25 });
  M.tajJali = new THREE.MeshStandardMaterial({ map: ch1(toTexture(jaliTex(false), { repeat: true })), roughness: 0.6, vertexColors: true, color: '#f2ece4' });
  M.tajRail = new THREE.MeshStandardMaterial({ map: ch1(toTexture(jaliTex(true), { repeat: true })), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, vertexColors: true, color: '#f4efe8' });
  M.tajBalus = new THREE.MeshStandardMaterial({ map: ch1(toTexture(railTex(), { repeat: true })), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.45, vertexColors: true, color: '#f4efe8' });
  M.tajMinar = new THREE.MeshPhysicalMaterial({ map: ch1(toTexture(minarTex(), { repeat: true })), color: '#f8f3ec', roughness: 0.4, vertexColors: true, sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffe8cf') });
  M.tajMinar.userData.detail = M.tajMarble.userData.detail;
  wrapLight(M.tajMinar, 'taj-wrap-v1');
  M.tajDark = new THREE.MeshStandardMaterial({ color: '#2a211b', roughness: 0.85, vertexColors: true });
  M.tajRed = new THREE.MeshStandardMaterial({ map: M.redsand?.map ?? null, color: '#d99c80', roughness: 0.85, vertexColors: true });
  M.tajGold = new THREE.MeshStandardMaterial({ color: '#eabb60', metalness: 1, roughness: 0.26, vertexColors: true });
}
export const TAJ_KEYS = ['tajMarble', 'tajCalli', 'tajFloral', 'tajDado', 'tajBlack', 'tajJali', 'tajRail', 'tajBalus', 'tajMinar', 'tajDark', 'tajRed', 'tajGold'];
const CUSTOM = new Set(TAJ_KEYS);

// ============================================================================================ geometry kit
// Collects parts straight into the Parts lists (P.L[key]); every part of a Taj key carries position,
// normal, uv (zero: the world UV is written at merge time), uv1 (its own texture coordinates) and a
// colour (baked occlusion, multiplied into the albedo). A transform stack places sub-assemblies.
const _m = new THREE.Matrix4();
export class Kit {
  constructor(P, lite) { this.P = P; this.lite = lite; this.m = new THREE.Matrix4(); this.st = []; this.tris = 0; }
  push(mat) { this.st.push(this.m); this.m = this.m.clone().multiply(mat); }
  pop() { this.m = this.st.pop(); }
  // run fn in a frame moved to (x, y, z) and turned by ry about y
  at(x, y, z, ry, fn) { this.push(new THREE.Matrix4().makeRotationY(ry || 0).setPosition(x, y, z)); fn(); this.pop(); }
  atM(mat, fn) { this.push(mat); fn(); this.pop(); }
  put(key, g, o = {}) {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.attributes.normal) n.computeVertexNormals();
    const p = n.attributes.position, cnt = p.count;
    const custom = CUSTOM.has(key);
    let uv1 = null, col = null;
    if (custom) {
      uv1 = new Float32Array(cnt * 2); col = new Float32Array(cnt * 3);
      const src = n.attributes.uv, f = o.uv1, ao = o.ao ?? 1, nr = n.attributes.normal;
      const s = o.uvs ?? [1, 1];
      for (let i = 0; i < cnt; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (f === 'own' && src) { uv1[i * 2] = src.getX(i) * s[0]; uv1[i * 2 + 1] = src.getY(i) * s[1]; }
        else if (typeof f === 'function') { const t = f(x, y, z); uv1[i * 2] = t[0]; uv1[i * 2 + 1] = t[1]; }
        const a = typeof ao === 'function' ? ao(x, y, z, nr.getX(i), nr.getY(i), nr.getZ(i)) : ao;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = a;
      }
    }
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(cnt * 2), 2));
    if (custom) { n.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); n.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
    n.morphAttributes = {}; n.clearGroups();
    const mm = this.m.clone();
    if (o.pos || o.ry) mm.multiply(_m.makeRotationY(o.ry || 0).setPosition(...(o.pos ?? [0, 0, 0])));
    n.applyMatrix4(mm);
    (this.P.L[key] ??= []).push(n);
    this.tris += cnt / 3;
    if (this.stats) this.stats[this.sec] = (this.stats[this.sec] ?? 0) + cnt / 3;
    return n;
  }
  box(key, x0, x1, y0, y1, z0, z1, o = {}) { return this.put(key, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), { ...o, pos: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] }); }
  // a flat panel in the local x–y plane at depth z (facing +z), uv1 0..1 across it (times rep)
  panel(key, x0, x1, y0, y1, z, o = {}) {
    const rep = o.rep ?? [1, 1];
    return this.put(key, new THREE.PlaneGeometry(x1 - x0, y1 - y0), { ...o, uv1: 'own', uvs: rep, pos: [(x0 + x1) / 2, (y0 + y1) / 2, z] });
  }
}

// ============================================================================================ shapes
// Four-centred (Mughal) arch, LEFT half: points from the springing (−w/2, 0) to the apex (0, rise).
// A short haunch arc of radius r1 turns into a long arc of radius R that meets its mirror at a point.
export function archHalf(w, rise, n = 12, theta = 0.66, r1f = 0.27) {
  const hw = w / 2, r1 = r1f * w, c1x = -hw + r1;
  const ex = c1x - r1 * Math.cos(theta), ey = r1 * Math.sin(theta);
  const dx = Math.cos(theta), dy = -Math.sin(theta);
  const apexAt = (R) => { const cx = ex + dx * R, cy = ey + dy * R; return cy + Math.sqrt(Math.max(R * R - cx * cx, 0)); };
  let lo = -ex / dx + 1e-6, hi = lo * 80, R;
  if (rise <= apexAt(lo)) R = lo; else if (rise >= apexAt(hi)) R = hi;
  else { for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (apexAt(mid) < rise) lo = mid; else hi = mid; } R = (lo + hi) / 2; }
  const cx = ex + dx * R, cy = ey + dy * R, ay = cy + Math.sqrt(Math.max(R * R - cx * cx, 0));
  const nh = Math.max(2, Math.round(n * 0.4)), nb = Math.max(2, n - nh), pts = [];
  for (let i = 0; i <= nh; i++) { const a = Math.PI - theta * i / nh; pts.push([c1x + r1 * Math.cos(a), r1 * Math.sin(a)]); }
  const a0 = Math.atan2(ey - cy, ex - cx), a1 = Math.atan2(ay - cy, -cx);
  for (let i = 1; i <= nb; i++) { const a = a0 + (a1 - a0) * i / nb; pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
  pts[pts.length - 1][0] = 0;
  // the true apex can fall a little short of `rise` when clamped: scale to hit it exactly
  const k = rise / pts[pts.length - 1][1];
  return pts.map(([x, y]) => [x, y * k]);
}
// full arch from the left springing over the apex to the right springing, lifted by `spring`
export function archFull(w, rise, spring = 0, n = 12) {
  const L = archHalf(w, rise, n);
  const R = L.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return [...L, ...R].map(([x, y]) => [x, y + spring]);
}
// U-shaped frame outline: rect W × (y0..H) with an arched opening (w, springing height, rise) cut up from y0
export function uFrameShape(W, H, w, spring, rise, n = 12, y0 = 0) {
  const a = archFull(w, rise, spring, n);
  const pts = [V2(-W / 2, y0), V2(-w / 2, y0), ...a.map(([x, y]) => V2(x, y)), V2(w / 2, y0), V2(W / 2, y0), V2(W / 2, H), V2(-W / 2, H)];
  return new THREE.Shape(pts);
}
// rect with several arched holes (blind arcades); holes: [{x, w, y0, spring, rise}]
export function arcadeShape(x0, x1, y0, y1, holes, n = 10) {
  const sh = new THREE.Shape([V2(x0, y0), V2(x1, y0), V2(x1, y1), V2(x0, y1)]);
  for (const h of holes) {
    const a = archFull(h.w, h.rise, h.y0 + h.spring, n).map(([x, y]) => V2(h.x + x, y));
    sh.holes.push(new THREE.Path([V2(h.x - h.w / 2, h.y0), ...a, V2(h.x + h.w / 2, h.y0)].reverse()));
  }
  return sh;
}
// the arch outline closed at its foot (a filled arched panel)
export function archPanelShape(w, spring, rise, n = 12, y0 = 0) {
  return new THREE.Shape([V2(-w / 2, y0), ...archFull(w, rise, spring, n).map(([x, y]) => V2(x, y)), V2(w / 2, y0)]);
}
// a band following an arch: between the arch (w, rise) and a larger one (w + 2t, rise + t), legs down to y0
export function archBandShape(w, spring, rise, t, n = 14, y0 = 0) {
  const o = archFull(w + 2 * t, rise + t * 1.05, spring, n), i = archFull(w, rise, spring, n);
  return new THREE.Shape([V2(-w / 2 - t, y0), ...o.map(([x, y]) => V2(x, y)), V2(w / 2 + t, y0), V2(w / 2, y0), ...i.slice().reverse().map(([x, y]) => V2(x, y)), V2(-w / 2, y0)]);
}
// spandrel: the rect (±hx, from springing to top) minus the arch (w, rise)
export function spandrelShape(hx, top, w, spring, rise, n = 14) {
  const a = archFull(w, rise, spring, n);
  return new THREE.Shape([V2(-hx, spring), ...a.map(([x, y]) => V2(x, y)), V2(hx, spring), V2(hx, top), V2(-hx, top)]);
}
export const extrude = (shape, depth) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -depth); return g; };

// Half-domed niche shell, recessed behind z = 0 to depth D: walls on a half-octagon-like plan (front
// corners ±w/2, back facet ±back·w/2), vertical to the springing, then each plan section shrinks with the
// arch so the hood closes at the apex (a faceted Mughal semi-dome). Opening foot at y = 0.
// opts.from: 'floor' (whole niche) or 'hood' (only the half-dome, above the springing).
export function nicheShell(w, spring, rise, D, { back = 0.45, n = 12, from = 'floor', floor = true } = {}) {
  const hw = w / 2, Q = [[-1, 0], [-back, -1], [back, -1], [1, 0]];
  const arch = archHalf(w, rise, n);
  const lv = [];
  if (from === 'floor') lv.push([0, 1]);
  lv.push([spring, 1]);
  for (let j = 1; j < arch.length; j++) lv.push([spring + arch[j][1], Math.max(-arch[j][0] / hw, 0)]);
  const pos = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.BufferGeometry(), P = [], I = [];
    for (const [y, f] of lv) { for (const q of [Q[k], Q[k + 1]]) P.push(q[0] * hw * f, y, q[1] * D * f); }
    for (let i = 0; i < lv.length - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    pos.push(g.toNonIndexed());
  }
  if (floor && from === 'floor') {
    const p = Q.map(([x, z]) => [x * hw, 0, z * D]);
    const f = new THREE.BufferGeometry();
    f.setAttribute('position', new THREE.Float32BufferAttribute([...p[0], ...p[2], ...p[1], ...p[0], ...p[3], ...p[2]], 3));
    f.computeVertexNormals();
    pos.push(f);
  }
  return mergeList(pos);
}
export function mergeList(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
// Moulding ring round a convex polygon (x, z): prof = [[offset, y], …] traversed bottom → top with the
// solid on the inside; flat-shaded, mitred corners.
export function ringMould(poly, prof) {
  const n = poly.length; let cx = 0, cz = 0; for (const [x, z] of poly) { cx += x / n; cz += z / n; }
  const en = poly.map((a, i) => {
    const b = poly[(i + 1) % n]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    let nx = dz, nz = -dx; if (nx * ((a[0] + b[0]) / 2 - cx) + nz * ((a[1] + b[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  });
  const vm = poly.map((_, i) => { const a = en[(i + n - 1) % n], b = en[i], d = 1 + a[0] * b[0] + a[1] * b[1]; return [(a[0] + b[0]) / d, (a[1] + b[1]) / d]; });
  const P = [];
  const pt = (i, o, y) => [poly[i][0] + vm[i][0] * o, y, poly[i][1] + vm[i][1] * o];
  for (let k = 0; k < prof.length - 1; k++) {
    const [o0, y0] = prof[k], [o1, y1] = prof[k + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, A = pt(i, o0, y0), B = pt(j, o0, y0), C = pt(j, o1, y1), Dd = pt(i, o1, y1);
      // expected outward normal of this face
      const ex = en[i][0] * (y1 - y0), ey = -(o1 - o0), ez = en[i][1] * (y1 - y0);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], wx = Dd[0] - A[0], wy = Dd[1] - A[1], wz = Dd[2] - A[2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      if (nx * ex + ny * ey + nz * ez >= 0) P.push(...A, ...B, ...C, ...A, ...C, ...Dd); else P.push(...A, ...C, ...B, ...A, ...Dd, ...C);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
  return g;
}
// straight moulding strip along x (−L/2 … L/2), profile [[out, y]] towards +z from z = 0, closed at the back
export function mouldStrip(L, prof) {
  const pts = [V2(0, prof[0][1]), ...prof.map(([o, y]) => V2(o, y)), V2(0, prof[prof.length - 1][1])];
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: L, bevelEnabled: false });
  // shape x = outward (→ z), shape y = up; extrusion along z (→ x)
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, -1, L / 2, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
  return g;
}
// lathe from [[r, y]] pairs
export const lathe = (pts, seg = 32, phi0 = 0) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(r, 0), y)), seg, phi0);
// smooth profile through control points (centripetal Catmull–Rom), resampled to n points
export function smoothProfile(ctrl, n) {
  const c = new THREE.SplineCurve(ctrl.map(([r, y]) => V2(r, y)));
  return c.getSpacedPoints(n).map((v) => [v.x, v.y]);
}
// lathe with flat facets round the axis (octagonal kiosks, eaves, bases): each facet keeps its own normal
export function latheFlat(pts, seg = 8, phi0 = Math.PI / 8) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => V2(Math.max(r, 0), y)), seg, phi0).toNonIndexed();
  g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
// bend a part authored flat (x along the wall, z outward from a wall at z = 0) round a cylinder of radius R
export function bendRound(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = x / R, r = R + z; p.setXYZ(i, Math.sin(a) * r, p.getY(i), Math.cos(a) * r); }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  return g;
}
