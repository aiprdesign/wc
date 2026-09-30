// DEMOCRACY, LAW & CIVIC INSTITUTIONS (12.0 – 16.0 s)
// Technique: paper-like procedural folding (analytic accordion + half-fold hinges,
// with per-panel normals so the key light rakes across the creases), kinetic
// typography (glyphs unfold, stamp, rise) and morphing: a Greek assembly dissolves into
// particles that become the ink of Roman legal documents, which dissolve again into a
// domed parliament whose drum colonnade is formed by the letters of REPRESENTATION.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES, OUTPUT_ASPECT } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, clamp } from '../lib/math.js';
import { MorphParticles, Dust, sampleGeometry } from '../lib/particles.js';
import { KineticText, TextPlane, FONTS } from '../lib/text.js';
import { parchmentTexture, manuscriptTexture, marbleTexture, canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { lightShaft, glowSprite } from '../lib/materials.js';
import { RingGauge, Callout } from '../lib/hud.js';
import { progressLine, circlePoints } from '../lib/lines.js';
import { pulse } from '../lib/rhythm.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const GOLD = '#f0c77e';

// ---------------------------------------------------------------------------
// Foldable sheet: accordion folds across X (nx panels) + one half-fold across Y.
// setFold(fx, fy): 1 = fully folded, 0 = flat. Pure function of its inputs.
class FoldSheet extends THREE.Mesh {
  constructor(w, h, nx, material) {
    const g = new THREE.PlaneGeometry(w, h, nx * 4, 16);
    super(g, material);
    this.w = w; this.h = h; this.nx = nx;
    const p = g.attributes.position;
    this.flat = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { this.flat[i * 2] = p.getX(i) + w / 2; this.flat[i * 2 + 1] = p.getY(i) + h / 2; }
    this.frustumCulled = false;
  }
  setFold(fx, fy, wave = 0, t = 0) {
    const { w, h, nx, flat } = this;
    const pos = this.geometry.attributes.position, nor = this.geometry.attributes.normal;
    const pw = w / nx, th = fx * 1.42, c = Math.cos(th), s = Math.sin(th);
    const y0 = h / 2, ph = fy * Math.PI * 0.93, cp = Math.cos(ph), sp = Math.sin(ph);
    const offX = -nx * pw * c / 2, offZ = -pw * s / 2;
    const yTop = y0 + y0 * cp, offY = -(Math.min(0, yTop) + Math.max(y0, yTop)) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = flat[i * 2], y = flat[i * 2 + 1];
      const k = Math.min(nx - 1, Math.floor(x / pw + 1e-5));
      const sg = k % 2 === 0 ? 1 : -1, a = x - k * pw;
      const X = k * pw * c + a * c;
      let Z = (k % 2 === 0 ? 0 : pw * s) + sg * a * s + offZ;
      Z += wave * Math.sin(x * 2.3 + y * 1.1 + t * 1.7) * 0.5 + wave * Math.sin(y * 3.1 - t * 1.1) * 0.3;
      let nxv = -sg * s, nzv = c, nyv = 0;
      let Y = y;
      if (y > y0 + 1e-5) {
        const dy = y - y0;
        Y = y0 + dy * cp + Z * sp;
        const Zr = -dy * sp + Z * cp;
        Z = Zr;
        nyv = nzv * sp; nzv = nzv * cp;
      }
      pos.setXYZ(i, X + offX, Y - h / 2 + offY + (h / 2), Z);
      nor.setXYZ(i, nxv, nyv, nzv);
    }
    pos.needsUpdate = true; nor.needsUpdate = true;
  }
}

// World-space noise dissolve for PBR materials: uDissolve 0 = solid, 1 = gone; hot edge.
function withDissolve(material, edgeColor = '#ffc070', key = 'a') {
  const u = { uDissolve: { value: 0 }, uEdge: { value: new THREE.Color(edgeColor) }, uEdgeGain: { value: 3 } };
  material.userData.dissolve = u;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDisW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vDisW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vDisW; uniform float uDissolve, uEdgeGain; uniform vec3 uEdge;
        float dHash(vec3 p){ return fract(sin(dot(p, vec3(17.1, 113.7, 57.3))) * 43758.5453); }
        float dNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(dHash(i), dHash(i+vec3(1,0,0)), f.x), mix(dHash(i+vec3(0,1,0)), dHash(i+vec3(1,1,0)), f.x), f.y),
                     mix(mix(dHash(i+vec3(0,0,1)), dHash(i+vec3(1,0,1)), f.x), mix(dHash(i+vec3(0,1,1)), dHash(i+vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dn = dNoise(vDisW * 3.1) * 0.65 + dNoise(vDisW * 9.0) * 0.35;
        float dd = dn - (uDissolve * 1.12 - 0.06);
        if (dd < 0.0) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // no UVs on the baked architecture: a world-space two-octave stone mottle keeps it from reading as flat plastic
        diffuseColor.rgb *= 0.84 + 0.26 * (dNoise(vDisW * 7.0) * 0.6 + dNoise(vDisW * 23.0) * 0.4);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * uEdgeGain * (1.0 - smoothstep(0.0, 0.06, dd)) * step(0.001, uDissolve) * step(uDissolve, 0.999);`);
  };
  material.customProgramCacheKey = () => 'civic-dissolve-v2-' + key;
  return material;
}

// Roman legal document (drawn once with parchment, once ink-only for particle targets).
const LEGAL = [
  'SI IN IVS VOCAT ITO', 'NI IT ANTESTAMINO', 'IGITVR EM CAPITO', 'SALVS POPVLI', 'SVPREMA LEX ESTO',
  'PRIVILEGIA NE IRROGANTO', 'CIVIS ROMANVS SVM', 'AEQVITAS IVSTITIA', 'IVS CIVILE', 'PACTA SVNT SERVANDA',
  'NEMO IVDEX IN CAVSA SVA', 'AVDIATVR ET ALTERA PARS', 'DVRA LEX SED LEX', 'VOX POPVLI', 'SENATVS CONSVLTVM',
];
function drawLegal(ctx, W, H, seed, withBg) {
  const r = rng(seed);
  if (withBg) ctx.drawImage(parchmentTexture({ size: 512, seed: seed % 3 }).image, 0, 0, W, H);
  const ink = withBg ? 'rgba(52,30,14,0.92)' : 'rgba(255,255,255,1)';
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${W * 0.1}px "${FONTS.display}"`;
  ctx.fillText(seed % 3 === 1 ? 'LEX' : seed % 3 === 0 ? 'IVS' : 'RES PVBLICA', W / 2, H * 0.09);
  ctx.font = `400 ${W * 0.042}px "${FONTS.display}"`;
  ctx.fillText('LEX · IVS · RES PVBLICA', W / 2, H * 0.155);
  ctx.lineWidth = W * 0.006;
  ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.185); ctx.lineTo(W * 0.9, H * 0.185); ctx.stroke();
  ctx.lineWidth = W * 0.002;
  ctx.beginPath(); ctx.moveTo(W * 0.1, H * 0.195); ctx.lineTo(W * 0.9, H * 0.195); ctx.stroke();
  // two columns of legal text
  ctx.font = `600 ${W * 0.034}px "${FONTS.display}"`;
  ctx.textAlign = 'left';
  for (let col = 0; col < 2; col++) {
    const x0 = W * (0.1 + col * 0.42);
    for (let i = 0; i < 17; i++) {
      const y = H * (0.235 + i * 0.037);
      let s = LEGAL[Math.floor(r() * LEGAL.length)];
      if (i % 6 === 0) { ctx.font = `700 ${W * 0.036}px "${FONTS.display}"`; s = ['TABVLA I', 'TABVLA III', 'TABVLA VIII', 'TABVLA XI'][Math.floor(r() * 4)]; }
      else ctx.font = `400 ${W * 0.03}px "${FONTS.display}"`;
      ctx.save(); ctx.translate(x0, y); ctx.scale(Math.min(1, (W * 0.36) / ctx.measureText(s).width), 1); ctx.fillText(s, 0, 0); ctx.restore();
    }
  }
  ctx.lineWidth = W * 0.002;
  ctx.beginPath(); ctx.moveTo(W * 0.5, H * 0.22); ctx.lineTo(W * 0.5, H * 0.86); ctx.stroke();
  // ruled double border with a running meander (Greek key) band at head and foot, and corner rosettes
  ctx.lineWidth = W * 0.004; ctx.strokeRect(W * 0.045, H * 0.03, W * 0.91, H * 0.94);
  ctx.lineWidth = W * 0.0015; ctx.strokeRect(W * 0.06, H * 0.04, W * 0.88, H * 0.92);
  const key = (y, s) => {
    ctx.lineWidth = W * 0.0022; ctx.beginPath();
    for (let x = W * 0.09; x < W * 0.91 - s; x += s) { ctx.moveTo(x, y + s * 0.8); ctx.lineTo(x, y); ctx.lineTo(x + s * 0.8, y); ctx.lineTo(x + s * 0.8, y + s * 0.6); ctx.lineTo(x + s * 0.3, y + s * 0.6); ctx.lineTo(x + s * 0.3, y + s * 0.3); ctx.lineTo(x + s * 0.55, y + s * 0.3); ctx.moveTo(x, y + s * 0.8); ctx.lineTo(x + s, y + s * 0.8); }
    ctx.stroke();
  };
  key(H * 0.198 + W * 0.006, W * 0.026); key(H * 0.862, W * 0.026);
  for (const [cx, cy] of [[W * 0.06, H * 0.04], [W * 0.94, H * 0.04], [W * 0.06, H * 0.96], [W * 0.94, H * 0.96]]) {
    ctx.beginPath(); ctx.arc(cx, cy, W * 0.012, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 8; k++) { const q = k * Math.PI / 4; ctx.beginPath(); ctx.arc(cx + Math.cos(q) * W * 0.02, cy + Math.sin(q) * W * 0.02, W * 0.006, 0, Math.PI * 2); ctx.fill(); }
  }
  // witnesses' subscriptions either side of the seal
  ctx.font = `600 ${W * 0.024}px "${FONTS.display}"`; ctx.textAlign = 'center';
  for (const sx of [0.24, 0.76]) {
    ctx.fillText(sx < 0.5 ? 'TESTES' : 'SIGNATORES', W * sx, H * 0.9);
    ctx.lineWidth = W * 0.0025; ctx.beginPath();
    for (let k = 0; k < 2; k++) { const y = H * (0.925 + k * 0.022); ctx.moveTo(W * (sx - 0.12), y); for (let j = 1; j <= 12; j++) ctx.lineTo(W * (sx - 0.12 + j * 0.02), y + Math.sin(j * 2.1 + seed + k * 3) * H * 0.005 - (j % 3 === 0 ? H * 0.006 : 0)); }
    ctx.stroke();
  }
  // seal: two silk tapes running out beneath a wax seal with an irregular poured edge, a raised rim, a
  // beaded ring, a laurel wreath and the legend
  const sx = W * 0.5, sy = H * 0.915, sr = W * 0.085, rs = rng(seed * 7 + 3);
  const tape = (dir) => { ctx.beginPath(); ctx.moveTo(sx + dir * sr * 0.2, sy); ctx.lineTo(sx + dir * sr * 1.35, sy + sr * 0.62); ctx.lineTo(sx + dir * sr * 1.15, sy + sr * 0.7); ctx.lineTo(sx + dir * sr * 1.12, sy + sr * 0.95); ctx.lineTo(sx + dir * sr * 0.8, sy + sr * 0.72); ctx.lineTo(sx - dir * sr * 0.1, sy + sr * 0.2); ctx.closePath(); };
  for (const dir of [-1, 1]) { tape(dir); if (withBg) { ctx.fillStyle = '#7a1f1a'; ctx.fill(); ctx.strokeStyle = 'rgba(40,6,4,0.7)'; ctx.lineWidth = W * 0.002; ctx.stroke(); } else { ctx.lineWidth = W * 0.003; ctx.stroke(); } }
  const lobes = Array.from({ length: 7 }, () => rs() * Math.PI * 2);
  ctx.beginPath();
  for (let k = 0; k <= 72; k++) { const q = k / 72 * Math.PI * 2; let rr = sr * (1 + 0.035 * Math.sin(q * 5 + lobes[0]) + 0.025 * Math.sin(q * 9 + lobes[1])); for (const l of lobes.slice(2)) rr += sr * 0.06 * Math.max(0, Math.cos(q - l)) ** 12; k ? ctx.lineTo(sx + Math.cos(q) * rr, sy + Math.sin(q) * rr) : ctx.moveTo(sx + Math.cos(q) * rr, sy + Math.sin(q) * rr); }
  ctx.closePath();
  if (withBg) {
    const g = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr * 1.1);
    g.addColorStop(0, '#c23a30'); g.addColorStop(0.6, '#8e1d17'); g.addColorStop(1, '#4e0f0c');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,170,0.35)'; ctx.lineWidth = W * 0.004;                     // raised rim catching the light
    ctx.beginPath(); ctx.arc(sx, sy, sr * 0.8, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,6,4,0.8)';
  } else { ctx.lineWidth = W * 0.004; ctx.stroke(); }
  const deep = withBg ? 'rgba(40,6,4,0.85)' : ink;
  ctx.lineWidth = W * 0.005; ctx.strokeStyle = deep;
  ctx.beginPath(); ctx.arc(sx, sy, sr * 0.76, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = deep;
  for (let k = 0; k < 28; k++) { const q = k / 28 * Math.PI * 2; ctx.beginPath(); ctx.arc(sx + Math.cos(q) * sr * 0.66, sy + Math.sin(q) * sr * 0.66, sr * 0.035, 0, Math.PI * 2); ctx.fill(); }
  for (const dir of [-1, 1]) for (let k = 0; k < 6; k++) {                                   // laurel sprays
    const q = Math.PI / 2 + dir * (0.5 + k * 0.32), lx = sx + Math.cos(q) * sr * 0.5, ly = sy + Math.sin(q) * sr * 0.5;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(q + dir * 0.9); ctx.beginPath(); ctx.ellipse(0, 0, sr * 0.1, sr * 0.04, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.font = `700 ${W * 0.04}px "${FONTS.display}"`; ctx.fillText('LEX', sx, sy - sr * 0.08);
  ctx.font = `600 ${W * 0.022}px "${FONTS.display}"`; ctx.fillText('S·P·Q·R', sx, sy + sr * 0.24);
}
function legalDoc(seed) {
  const W = 512, H = 768;
  const c = mkCanvas(W, H); drawLegal(c.getContext('2d'), W, H, seed, true);
  const ci = mkCanvas(W, H); drawLegal(ci.getContext('2d'), W, H, seed, false);
  return { tex: toTexture(c), inkCanvas: ci };
}
// Points on the inked pixels of a canvas, mapped to a sheet of size w×h centred at origin.
function canvasInkPoints(c, n, w, h, seed) {
  const ctx = c.getContext('2d');
  const { width: W, height: H } = c;
  const d = ctx.getImageData(0, 0, W, H).data;
  const filled = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 100) filled.push(x, y);
  const r = rng(seed), out = new Float32Array(n * 3), cnt = filled.length / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * cnt) * 2;
    out[i * 3] = ((filled[k] + r() * 2) / W - 0.5) * w;
    out[i * 3 + 1] = (0.5 - (filled[k + 1] + r() * 2) / H) * h;
    out[i * 3 + 2] = 0.01;
  }
  return out;
}

// Stepped semicircular assembly (Pnyx / hemicycle) as a half lathe with end caps.
function hemicycleGeometry(r0 = 1.1, steps = 7, run = 0.3, rise = 0.14) {
  const prof = [V(r0 - 0.001, 0)];
  let r = r0, y = 0;
  prof.push(new THREE.Vector2(r, y));
  for (let i = 0; i < steps; i++) { y += rise; prof.push(new THREE.Vector2(r, y)); r += run; prof.push(new THREE.Vector2(r, y)); }
  prof.push(new THREE.Vector2(r, 0));
  const pts = prof.slice(1).map((p) => new THREE.Vector2(p.x, p.y));
  const lathe = new THREE.LatheGeometry(pts, 64, Math.PI / 2, Math.PI);   // opens toward +z
  const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
  const capA = new THREE.ShapeGeometry(shape);
  const capB = capA.clone();
  capA.rotateY(0); capB.rotateY(Math.PI);
  const parts = [lathe, capA, capB].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); if (!n.attributes.normal) n.computeVertexNormals(); return n; });
  const m = mergeGeometries(parts);
  m.computeVertexNormals();
  return m;
}
function bakeParts(list) {
  return mergeGeometries(list.map(([g, x, y, z, ry = 0, sx = 1, sy = 1, sz = 1]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (n.attributes.uv) n.deleteAttribute('uv');
    n.scale(sx, sy, sz); n.rotateY(ry); n.translate(x, y, z);
    return n;
  }));
}

// ---- architectural detail -------------------------------------------------------------------------------
// Every part below is baked with the rest of its building into one mesh per material (bakeParts), so the
// detail costs draw calls nothing.
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// Fluted shaft from y = 0 to h: concave flutes meeting in sharp arrises (each flute its own vertex strip, so
// the normals break at the arris), a taper from r0 to r1 and a slight entasis.
function flutedShaft(r0, r1, h, flutes = 20, M = 3) {
  const rows = [0, 0.33, 0.66, 1], dA = Math.PI * 2 / flutes, pos = [], uv = [], idx = [];
  for (let f = 0; f < flutes; f++) {
    const b = pos.length / 3;
    for (const u of rows) {
      const r = lerp(r0, r1, u) + r0 * 0.02 * Math.sin(Math.PI * u), dep = r * 0.07;
      for (let s = 0; s <= M; s++) { const a = (f + s / M) * dA, t = 2 * s / M - 1, rr = r - dep * (1 - t * t); pos.push(Math.cos(a) * rr, u * h, Math.sin(a) * rr); uv.push(a / (Math.PI * 2), u); }
    }
    for (let k = 0; k < rows.length - 1; k++) for (let s = 0; s < M; s++) { const a = b + k * (M + 1) + s, c = a + M + 1; idx.push(a, c, a + 1, c, c + 1, a + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return v * v * v * p0 + 3 * v * v * u * p1 + 3 * v * u * u * p2 + u * u * u * p3; };
// Greek Doric capital on a shaft top of radius rt at y0: annulets, a taut echinus, the square abacus.
function doricCapital(rt, y0, h, abW) {
  const hA = h * 0.36, e0 = y0 + h * 0.14, e1 = y0 + h - hA, r0 = rt * 1.07, r1 = abW * 0.48;
  const pts = [[0, y0], [rt, y0], [rt * 1.035, y0 + h * 0.03], [rt * 1.035, y0 + h * 0.06], [rt * 1.055, y0 + h * 0.09], [rt * 1.055, y0 + h * 0.12], [r0, e0]];
  for (let i = 1; i <= 6; i++) { const u = i / 6; pts.push([bez(r0, r0 + 0.55 * (r1 - r0), r1, r1, u), bez(e0, e0 + 0.42 * (e1 - e0), e0 + 0.8 * (e1 - e0), e1, u)]); }
  pts.push([0, e1]);
  return [lathe(pts, 16), new THREE.BoxGeometry(abW, hA, abW).translate(0, e1 + hA / 2, 0)];
}
// Corinthian capital on a shaft top of radius rt at y0: the bell (kalathos) with two rows of eight acanthus
// leaves curling out, corner volutes, and the abacus with concave sides and its fleurons.
function corinthianCapital(rt, y0, h) {
  const parts = [], hb = h * 0.84, top = y0 + hb, hA = h - hb;
  parts.push(lathe([[0, y0], [rt * 1.07, y0], [rt * 1.07, y0 + h * 0.05], [rt, y0 + h * 0.07], [rt * 1.02, y0 + h * 0.35], [rt * 1.1, y0 + h * 0.62], [rt * 1.22, y0 + h * 0.8], [rt * 1.3, top], [0, top]], 16));
  for (const [row, hh, off] of [[0, 0.4, 0], [1, 0.64, 0.5]]) for (let k = 0; k < 8; k++) {
    const a = (k + off) / 8 * Math.PI * 2, L = h * hh, w = rt * 0.66;
    const lf = new THREE.BoxGeometry(w, L, rt * 0.12, 1, 3, 1), p = lf.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = p.getY(i) / L + 0.5; p.setX(i, p.getX(i) * (1 - 0.6 * v * v)); p.setZ(i, p.getZ(i) + rt * 0.32 * v * v * v); }
    lf.computeVertexNormals();
    lf.translate(0, L / 2 + y0 + h * 0.06, rt * (row ? 1.0 : 1.04)); lf.rotateY(a);
    parts.push(lf);
  }
  for (let k = 0; k < 4; k++) {                                               // corner volutes (helices)
    const a = Math.PI / 4 + k * Math.PI / 2;
    parts.push(new THREE.TorusGeometry(rt * 0.16, rt * 0.07, 4, 10).translate(0, top - h * 0.1, rt * 1.36).rotateY(a));
  }
  const s = rt * 1.55, c = rt * 1.3, e = s * 0.2, q = 2 * c - s, sh = new THREE.Shape();
  sh.moveTo(s, -(s - e)); sh.quadraticCurveTo(q, 0, s, s - e); sh.lineTo(s - e, s); sh.quadraticCurveTo(0, q, -(s - e), s); sh.lineTo(-s, s - e);
  sh.quadraticCurveTo(-q, 0, -s, -(s - e)); sh.lineTo(-(s - e), -s); sh.quadraticCurveTo(0, -q, s - e, -s); sh.closePath();
  const ab = new THREE.ExtrudeGeometry(sh, { depth: hA, bevelEnabled: false, curveSegments: 6 }); ab.rotateX(-Math.PI / 2); ab.translate(0, top, 0);
  parts.push(ab);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; parts.push(new THREE.SphereGeometry(rt * 0.13, 6, 4).translate(Math.sin(a) * c, top + hA * 0.5, Math.cos(a) * c)); }
  return parts;
}
// Attic base (square plinth, torus, scotia, torus) under a shaft of radius r, from y0 to y0 + h.
function atticBase(r, y0, h) {
  const hp = h * 0.32, y1 = y0 + hp, t = h - hp, P = [[0, y1]];
  for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i / 5 * Math.PI; P.push([r * 1.14 + Math.cos(a) * t * 0.2, y1 + t * 0.2 + Math.sin(a) * t * 0.2]); }
  P.push([r * 1.05, y1 + t * 0.42], [r * 0.99, y1 + t * 0.52], [r * 1.04, y1 + t * 0.62]);
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI; P.push([r * 1.05 + Math.cos(a) * t * 0.13, y1 + t * 0.75 + Math.sin(a) * t * 0.13]); }
  P.push([r * 1.01, y0 + h], [0, y0 + h]);
  return [new THREE.BoxGeometry(r * 2.75, hp, r * 2.75).translate(0, y0 + hp / 2, 0), lathe(P, 16)];
}
// Quads between consecutive cross-sections; a moulding run round a rectangle (profile [[out, y], ...] bottom → top).
function loft(sections) {
  const np = sections[0].length, pos = [], idx = [];
  for (const s of sections) for (const v of s) pos.push(v.x, v.y, v.z);
  for (let k = 0; k < sections.length - 1; k++) for (let j = 0; j < np - 1; j++) { const a = k * np + j, b = a + np; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
function ringMoulding(profile, hx, hz) {
  const C = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  const sec = (c) => profile.map(([o, y]) => new THREE.Vector3(c[0] * (hx + o), y, c[1] * (hz + o)));
  return mergeGeometries(C.map((c, s) => loft([sec(c), sec(C[(s + 1) % 4])])));
}
// Window facing +z, centred on the origin: a glazed pane with glazing bars, a moulded surround (architrave),
// a sill on brackets, and a head: 'tri' (pediment), 'seg' (segmental pediment), 'flat' (cornice), 'arch'
// (round-headed, with a keystone). Returns { frame: [geos], glass: [geos] }.
function windowUnit(w, h, head = 'flat') {
  const f = Math.max(0.01, w * 0.13), d = 0.012, frame = [], glass = [];
  const bx = (W, H, D, x, y, z) => frame.push(new THREE.BoxGeometry(W, H, D).translate(x, y, z));
  if (head === 'arch') {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, -h / 2); sh.lineTo(w / 2, -h / 2); sh.lineTo(w / 2, h / 2 - w / 2); sh.absarc(0, h / 2 - w / 2, w / 2, 0, Math.PI, false); sh.closePath();
    glass.push(new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: false, curveSegments: 8 }));
    const ring = new THREE.Shape(); ring.absarc(0, h / 2 - w / 2, w / 2 + f, 0, Math.PI, false); ring.lineTo(-w / 2, h / 2 - w / 2); ring.absarc(0, h / 2 - w / 2, w / 2, Math.PI, 0, true); ring.closePath();
    frame.push(new THREE.ExtrudeGeometry(ring, { depth: d, bevelEnabled: false, curveSegments: 8 }));
    for (const sx of [-1, 1]) bx(f, h - w / 2, d, sx * (w / 2 + f / 2), -w / 4, d / 2);
    bx(f * 1.1, f * 1.6, d * 1.5, 0, h / 2 + f * 0.5, d * 0.75);                                    // keystone
    bx(w * 0.05, h - w / 2, 0.006, 0, -w / 4, 0.006);
  } else {
    glass.push(new THREE.BoxGeometry(w, h, 0.004).translate(0, 0, 0.002));
    bx(w + 2 * f, f, d, 0, h / 2 + f / 2, d / 2); bx(w + 2 * f, f, d, 0, -h / 2 - f / 2, d / 2);
    for (const sx of [-1, 1]) bx(f, h, d, sx * (w / 2 + f / 2), 0, d / 2);
    bx(w * 0.06, h, 0.006, 0, 0, 0.006); for (const k of [-1, 1]) bx(w, w * 0.05, 0.006, 0, k * h / 6, 0.006);   // glazing bars
    const yh = h / 2 + f, W = w + 2 * f + 0.02;
    bx(W - 0.01, f * 0.9, d * 0.8, 0, yh + f * 0.45, d * 0.4);                                       // frieze
    bx(W, f * 0.7, d * 2.2, 0, yh + f * 1.25, d * 1.1);                                              // cornice
    if (head === 'tri' || head === 'seg') {
      const sh = new THREE.Shape(), rise = W * (head === 'tri' ? 0.24 : 0.2);
      sh.moveTo(-W / 2, 0); sh.lineTo(W / 2, 0);
      if (head === 'tri') sh.lineTo(0, rise); else sh.quadraticCurveTo(0, rise * 2, -W / 2, 0);
      sh.closePath();
      frame.push(new THREE.ExtrudeGeometry(sh, { depth: d * 2.2, bevelEnabled: false, curveSegments: 6 }).translate(0, yh + f * 1.6, 0));
    }
    bx(w + 2 * f + 0.024, f * 0.8, d * 2.6, 0, -h / 2 - f - f * 0.4, d * 1.3);                      // sill
    for (const sx of [-1, 1]) bx(f * 0.7, f * 1.3, d * 1.8, sx * (w / 2 + f * 0.4), -h / 2 - f - f * 1.4, d * 0.9);   // brackets
  }
  return { frame, glass };
}
// Baluster (a vase-turned post) of height h; a balustrade along x (centred) of length L: plinth, balusters,
// rail, with a pedestal at each end.
const balusterGeo = (h) => lathe([[0, 0], [h * 0.17, 0], [h * 0.17, h * 0.08], [h * 0.1, h * 0.13], [h * 0.2, h * 0.36], [h * 0.09, h * 0.62], [h * 0.07, h * 0.72], [h * 0.12, h * 0.78], [h * 0.12, h * 0.86], [h * 0.16, h * 0.9], [h * 0.16, h], [0, h]], 6);
function balustrade(L, h, pitch = h * 0.42) {
  const out = [], bal = balusterGeo(h * 0.72), n = Math.max(2, Math.round((L - h * 0.5) / pitch));
  out.push(new THREE.BoxGeometry(L, h * 0.14, h * 0.3).translate(0, h * 0.07, 0));
  for (let i = 0; i < n; i++) out.push(bal.clone().translate(-L / 2 + h * 0.25 + (i + 0.5) * (L - h * 0.5) / n, h * 0.14, 0));
  out.push(new THREE.BoxGeometry(L, h * 0.14, h * 0.32).translate(0, h * 0.93, 0));
  for (const sx of [-1, 1]) out.push(new THREE.BoxGeometry(h * 0.34, h * 1.08, h * 0.36).translate(sx * (L / 2 - h * 0.17), h * 0.54, 0));
  return out;
}
// Aisle stairs up a stepped hemicycle: half-height steps in the back half of every tread, along each angle.
function aisleSteps(parts, r0, steps, run, rise, x0, z0, phis) {
  for (const phi of phis) for (let i = 0; i < steps - 1; i++) {
    const r = r0 + i * run + run * 0.75;
    parts.push([new THREE.BoxGeometry(run * 0.62, rise / 2, run / 2), x0 + Math.sin(phi) * r, (i + 1) * rise + rise / 4, z0 + Math.cos(phi) * r, phi]);
  }
}

// The bloom duck the film applies while a chapter heading is up (core/words3d.js). Explore hides the
// headings (engine.headingsHidden), dropping the duck with them; the explore hook puts it back.
function headingDuck(ctx, inst, T) {
  let d = 0;
  const items = ctx.engine?.words3d?.items;
  if (items) for (const it of items) if (it.inst === inst) d = Math.max(d, ramp(T - it.t0, 0, 0.35) * (1 - ramp(T, it.t1 - 0.2, it.t1 + 0.35)));
  return d;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.14;
  scene.fog = new THREE.FogExp2('#0a0705', 0.035);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 200);
  const R = rng(1215);

  // ---------------------------------------------------------------- camera path (pure)
  const DUR = segment.end - segment.start;
  function camAt(t, pos, look) {
    const u = ease.inOutSine(sat(t / DUR));
    const ang = lerp(0.72, -0.34, u);
    const rad = lerp(11.8, 8.3, ease.outCubic(sat(t / DUR))) - 0.4 * ramp(t, 3.3, 4.0);
    const y = lerp(3.9, 1.9, u);
    pos.set(Math.sin(ang) * rad, y, Math.cos(ang) * rad);
    look.set(lerp(0.4, 0, u), lerp(0.7, 1.8, ramp(t, 1.0, 3.2)), 0);
    return pos;
  }

  // ---------------------------------------------------------------- lights & atmosphere
  const key = new THREE.DirectionalLight('#ffdcae', 1.5); key.position.set(6, 9, 5);
  const rim = new THREE.DirectionalLight('#ffc98a', 1.4); rim.position.set(-4, 5, -9);
  const fill = new THREE.HemisphereLight('#3a2a1c', '#050302', 0.3);
  scene.add(key, rim, fill);
  const shaft = lightShaft({ length: 14, radiusTop: 0.5, radiusBottom: 4.2, color: '#ffd29a', intensity: 0.16 });
  shaft.position.set(0.8, 10.5, -0.5); shaft.rotation.z = 0.12;
  scene.add(shaft);
  const dust = new Dust({ count: 2600, size: [18, 8, 18], center: [0, 2.5, 1], color: '#ffdcae', particleSize: 0.026, opacity: 0.5, intensity: 1.4, seed: 31 });
  scene.add(dust);
  const backGlow = glowSprite({ color: '#ffb766', intensity: 0.5, scale: 16 });
  backGlow.position.set(0, 2.2, -7);
  scene.add(backGlow);

  // ---------------------------------------------------------------- floating parchment sheets (unfold @ 12.3)
  const sheets = [];
  const sheetTex = [0, 1, 2, 3].map((i) => manuscriptTexture({ w: 768, h: 1024, seed: 40 + i, kind: i === 2 ? 'architecture' : 'text' }));
  // placed in the camera's frame at t≈0.5 (so they frame the stage instead of covering it), then left in world space
  const sheetDefs = [
    [-3.3, 1.05, 6.2, 0.95], [3.7, -1.0, 7.0, 1.05], [-5.2, -1.3, 9.5, 1.2], [5.3, 1.35, 10.5, 1.1],
    [-2.6, 2.05, 12.5, 0.9], [2.9, 2.3, 14.0, 1.0], [-7.2, 0.5, 15.0, 1.3], [7.4, -0.4, 16.5, 1.2],
  ];
  {
    const P = new THREE.Vector3(), L = new THREE.Vector3();
    camAt(0.5, P, L);
    const f = L.clone().sub(P).normalize(), rt = new THREE.Vector3().crossVectors(f, V(0, 1, 0)).normalize(), up = new THREE.Vector3().crossVectors(rt, f);
    sheetDefs.forEach((d) => { const w = P.clone().addScaledVector(rt, d[0]).addScaledVector(up, d[1]).addScaledVector(f, d[2]); d[0] = w.x; d[1] = w.y; d[2] = w.z; });
  }
  sheetDefs.forEach(([x, y, z, s], i) => {
    const mat = new THREE.MeshStandardMaterial({ map: sheetTex[i % 4], color: '#efe3cc', roughness: 0.82, side: THREE.DoubleSide, transparent: true, opacity: 1, envMapIntensity: 0.5 });
    const sh = new FoldSheet(1.5 * s, 2.0 * s, 4 + (i % 2), mat);
    sh.position.set(x, y, z);
    scene.add(sh);
    sheets.push({ sh, mat, base: V(x, y, z), rot: [(R() - 0.5) * 0.6, R() * Math.PI * 2, (R() - 0.5) * 0.5], spin: (R() - 0.5) * 0.5, t0: cue('parchment') + i * 0.07 + R() * 0.08, drift: V((R() - 0.5) * 0.4, (R() - 0.2) * 0.3, (R() - 0.5) * 0.4), k: 0 });
  });

  // ---------------------------------------------------------------- Greek assembly (Pnyx + stoa)
  const marbleMap = marbleTexture({ seed: 12 });
  const greekMat = withDissolve(new THREE.MeshPhysicalMaterial({ color: '#e9e0d0', roughness: 0.42, clearcoat: 0.2, emissive: '#000000', side: THREE.DoubleSide }), '#ffc070', 'greek');
  const hemi = hemicycleGeometry(1.1, 7, 0.3, 0.14);
  const greekParts = [[hemi, 0, 0, 0]];
  aisleSteps(greekParts, 1.1, 7, 0.3, 0.14, 0, 0, [Math.PI * 0.62, Math.PI * 0.81, Math.PI, Math.PI * 1.19, Math.PI * 1.38]);
  greekParts.push([new THREE.CylinderGeometry(0.42, 0.5, 0.36, 24), 0, 0.18, 0.2]);     // bema
  greekParts.push([lathe([[0.5, 0.36], [0.46, 0.36], [0.46, 0.39], [0.44, 0.4], [0, 0.4]], 24), 0, 0, 0.2]);   // its moulded rim
  for (let k = 0; k < 3; k++) greekParts.push([new THREE.BoxGeometry(0.5 - k * 0.1, 0.12, 0.14), 0, 0.06 + k * 0.12, 0.72 - k * 0.1]);   // speakers' steps
  // the stoa: a Doric colonnade on a three-stepped crepidoma, fluted shafts without bases, annulets, echinus and
  // abacus; architrave with taenia and regulae, a triglyph frieze, a geison with mutules and a sima; a lean-to
  // roof of pan and cover tiles with antefixes along the eaves; back wall and end walls with antae
  [[8.6, 0.055, 1.75, 0.0275, -4.08], [8.4, 0.055, 1.55, 0.0825, -4.1], [8.2, 0.05, 1.35, 0.135, -4.1]].forEach(([w, h, d, y, z]) => greekParts.push([new THREE.BoxGeometry(w, h, d), 0, y, z]));
  {
    const shaftG = flutedShaft(0.09, 0.072, 1.24, 20, 3), capG = doricCapital(0.072, 1.24, 0.11, 0.21);
    for (let i = 0; i < 15; i++) { const x = -3.85 + i * 0.55; greekParts.push([shaftG, x, 0.16, -3.75]); for (const g of capG) greekParts.push([g, x, 0.16, -3.75]); }
    greekParts.push([new THREE.BoxGeometry(8.1, 0.09, 0.24), 0, 1.555, -3.77]);                 // architrave
    greekParts.push([new THREE.BoxGeometry(8.12, 0.015, 0.25), 0, 1.6075, -3.765]);             // taenia
    greekParts.push([new THREE.BoxGeometry(8.08, 0.105, 0.2), 0, 1.6675, -3.8]);                // frieze (metope plane)
    const tri = [], regula = new THREE.BoxGeometry(0.12, 0.012, 0.012), gutta = new THREE.CylinderGeometry(0.005, 0.006, 0.01, 5);
    for (const gx of [-0.04, 0, 0.04]) tri.push(new THREE.BoxGeometry(0.026, 0.1, 0.022).translate(gx, 0, 0));      // glyph bars
    for (const sx of [-1, 1]) tri.push(new THREE.BoxGeometry(0.01, 0.1, 0.018).translate(sx * 0.055, 0, 0));        // half-glyphs
    tri.push(new THREE.BoxGeometry(0.13, 0.014, 0.026).translate(0, 0.052, 0));                                     // capital band
    for (let i = 0; i < 29; i++) {
      const x = -3.85 + i * 0.275;
      for (const g of tri) greekParts.push([g, x, 1.665, -3.69]);
      greekParts.push([regula, x, 1.594, -3.644]);
      for (let k = 0; k < 6; k++) greekParts.push([gutta, x - 0.05 + k * 0.02, 1.583, -3.644]);
      greekParts.push([new THREE.BoxGeometry(0.1, 0.012, 0.08), x, 1.719, -3.6], [new THREE.BoxGeometry(0.1, 0.012, 0.08), x + 0.1375, 1.719, -3.6]);   // mutules
    }
    greekParts.push([new THREE.BoxGeometry(8.3, 0.055, 0.42), 0, 1.752, -3.76]);                // geison
    greekParts.push([new THREE.BoxGeometry(8.32, 0.02, 0.02), 0, 1.786, -3.55]);                // hawksbeak crown
    greekParts.push([new THREE.BoxGeometry(8.3, 0.1, 1.1), 0, 1.76, -4.25]);                    // ceiling
    const roof = new THREE.BoxGeometry(8.5, 0.05, 1.62); roof.rotateX(0.2);
    greekParts.push([roof, 0, 1.97, -4.12], [new THREE.BoxGeometry(8.2, 0.42, 0.12), 0, 1.96, -4.72]);
    const cover = new THREE.CylinderGeometry(0.02, 0.02, 1.62, 6, 1, false, -Math.PI / 2, Math.PI); cover.rotateX(-Math.PI / 2); cover.rotateX(0.2);
    const ante = new THREE.ExtrudeGeometry((() => { const sh = new THREE.Shape(); sh.moveTo(-0.028, 0); sh.lineTo(0.028, 0); for (let k = 0; k <= 6; k++) { const a = k / 6 * Math.PI; sh.lineTo(Math.cos(a) * (k % 2 ? 0.03 : 0.042), 0.012 + Math.sin(a) * (k % 2 ? 0.03 : 0.042)); } sh.closePath(); return sh; })(), { depth: 0.006, bevelEnabled: false });
    for (let i = 0; i < 70; i++) {
      const x = -4.19 + i * (8.38 / 69);
      greekParts.push([cover, x, 1.997, -4.12]);
      greekParts.push([ante, x, 1.8, -3.325]);
    }
    for (const x of [-4.06, 4.06]) {
      greekParts.push([new THREE.BoxGeometry(0.12, 1.6, 1.1), x, 0.96, -4.2]);
      greekParts.push([new THREE.BoxGeometry(0.16, 1.24, 0.16), x, 0.78, -3.7]);                // anta
      greekParts.push([new THREE.BoxGeometry(0.19, 0.06, 0.19), x, 1.43, -3.7]);                // anta capital
    }
  }
  const greekGeo = bakeParts(greekParts);
  const greek = new THREE.Mesh(greekGeo, greekMat);
  scene.add(greek);

  // ---------------------------------------------------------------- Roman legal documents (fold open again)
  const docs = [];
  const docW = 1.55, docH = 2.3;
  const docPts = [];
  const docDefs = [[-1.75, 1.75, 0.35, 0.28], [0, 1.95, 0.7, 0], [1.75, 1.75, 0.35, -0.28]];
  const NDOC = 42000;
  docDefs.forEach(([x, y, z, ry], i) => {
    const { tex, inkCanvas } = legalDoc(i);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffe2b8', emissiveIntensity: 0.22, roughness: 0.78, side: THREE.DoubleSide, transparent: true, opacity: 0, envMapIntensity: 0.6, color: '#f4ead8' });
    const sh = new FoldSheet(docW, docH, 3, mat);
    sh.position.set(x, y, z); sh.rotation.y = ry;
    scene.add(sh);
    docs.push({ sh, mat, t0: i * 0.06 });
    const pts = canvasInkPoints(inkCanvas, NDOC / 3, docW, docH, 70 + i);
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    const v = new THREE.Vector3();
    for (let k = 0; k < pts.length; k += 3) { v.set(pts[k], pts[k + 1], pts[k + 2]).applyMatrix4(m); pts[k] = v.x; pts[k + 1] = v.y; pts[k + 2] = v.z; }
    docPts.push(pts);
  });
  const docTargets = new Float32Array(NDOC * 3);
  docPts.forEach((p, i) => docTargets.set(p, i * (NDOC / 3) * 3));

  // ---------------------------------------------------------------- Parliament (dome, drum, portico, hemicycle)
  const parlMat = withDissolve(new THREE.MeshPhysicalMaterial({ color: '#efe7da', roughness: 0.34, clearcoat: 0.3, emissive: '#000000', side: THREE.DoubleSide }), '#ffd08a', 'parl');
  const domeGoldMat = withDissolve(new THREE.MeshStandardMaterial({ color: '#d9a85a', metalness: 1, roughness: 0.42, emissive: '#000000', envMapIntensity: 0.6 }), '#ffe0a0', 'dome');
  // the drum colonnade's angles are set by the closing camera (the letters of REPRESENTATION land on it)
  const DRUM_C = V(0, 1.72, -1.9), DRUM_R = 1.46, NCOL = 22;
  const camP = new THREE.Vector3(), camL = new THREE.Vector3();
  camAt(DUR, camP, camL);
  const viewAng = Math.atan2(camP.x - DRUM_C.x, camP.z - DRUM_C.z);
  const colAng = (i) => viewAng + ((i + 0.5) / NCOL) * Math.PI * 2 - Math.PI;

  // A neoclassical parliament: rusticated base course, piano nobile with pilasters and pedimented windows,
  // entablatures with dentil cornices and balustrades; a hexastyle Corinthian portico with its pediment and
  // stairs; wings and end pavilions; the drum (stepped podium, colonnade, arched windows, entablature,
  // balustrade, attic), the ribbed gilded dome and a glazed lantern with its cupola and finial.
  const parlParts = [], wins = [];
  const put = (g, x = 0, y = 0, z = 0, ry = 0) => parlParts.push([g, x, y, z, ry]);
  const putAll = (gs, x = 0, y = 0, z = 0, ry = 0) => { for (const g of gs) put(g, x, y, z, ry); };
  const box = (w, h, d, x, y, z) => put(new THREE.BoxGeometry(w, h, d), x, y, z);
  const winAt = (u, x, y, z, ry = 0) => { putAll(u.frame, x, y, z, ry); for (const g of u.glass) wins.push([g, x, y, z, ry]); };
  // entablature profile [[out, y], ...] from yb, h high: two-fascia architrave, frieze, dentil band, corona, cyma
  const entab = (yb, h) => { const k = (v) => yb + v * h; return [[0, k(0)], [0.005, k(0)], [0.005, k(0.18)], [0.008, k(0.2)], [0.008, k(0.38)], [0.003, k(0.42)], [0.003, k(0.64)], [0.014, k(0.72)], [0.014, k(0.72)], [0.044, k(0.78)], [0.048, k(0.8)], [0.048, k(0.9)], [0.054, k(0.94)], [0.058, k(1)], [0, k(1)]]; };
  const dentilG = new THREE.BoxGeometry(0.011, 0.012, 0.012);
  const dentilRing = (cx, cz, hx, hz, y, sides) => {
    const n = (L) => Math.max(1, Math.round(L / 0.024)), o = 0.009;
    for (const sd of sides) {
      const along = sd === 'F' || sd === 'B', L = 2 * (along ? hx : hz), c = n(L);
      for (let i = 0; i < c; i++) {
        const u = -L / 2 + (i + 0.5) * L / c;
        if (sd === 'F') put(dentilG, cx + u, y, cz + hz + o); else if (sd === 'B') put(dentilG, cx + u, y, cz - hz - o);
        else put(dentilG, cx + (sd === 'R' ? hx + o : -hx - o), y, cz + u, Math.PI / 2);
      }
    }
  };
  const plinthRing = (hx, hz, x, z, y0 = 0.08) => put(ringMoulding([[0.028, y0], [0.028, y0 + 0.032], [0.012, y0 + 0.042], [0.012, y0 + 0.05], [0, y0 + 0.06]], hx, hz), x, 0, z);
  const pilaster = (x, z, y0, y1, w = 0.05, ry = 0) => {
    const d = 0.016, g = [new THREE.BoxGeometry(w + 0.012, 0.02, d + 0.008).translate(0, y0 + 0.01, (d + 0.008) / 2), new THREE.BoxGeometry(w, y1 - y0 - 0.05, d).translate(0, (y0 + y1) / 2 - 0.005, d / 2),
      new THREE.BoxGeometry(w + 0.016, 0.012, d + 0.01).translate(0, y1 - 0.024, (d + 0.01) / 2), new THREE.BoxGeometry(w + 0.024, 0.014, d + 0.014).translate(0, y1 - 0.007, (d + 0.014) / 2)];
    putAll(g, x, 0, z, ry);
  };
  // raking cornice + roof slopes of a pediment over [-hw, hw] at yb (front face at zf, depth dz back from it)
  const pediment = (cx, yb, zf, hw, rise, dz) => {
    const sh = new THREE.Shape([new THREE.Vector2(-hw + 0.02, 0), new THREE.Vector2(hw - 0.02, 0), new THREE.Vector2(0, rise - 0.01)]);
    put(new THREE.ExtrudeGeometry(sh, { depth: dz, bevelEnabled: false }), cx, yb, zf - 0.018 - dz);          // tympanum (recessed)
    const th = Math.atan2(rise, hw), L = Math.hypot(hw, rise) + 0.05;
    for (const sg of [-1, 1]) {
      const at = (g, oy, oz) => { g.rotateZ(-sg * th); put(g, cx + sg * hw / 2, yb + rise / 2 + oy / Math.cos(th), zf + oz); };
      at(new THREE.BoxGeometry(L, 0.028, dz + 0.06), 0.022, -dz / 2 + 0.02);                                   // raking geison + roof slope
      at(new THREE.BoxGeometry(L, 0.022, 0.03), 0.048, 0.035);                                                 // raking sima
      at(new THREE.BoxGeometry(L, 0.012, 0.014), 0.002, 0.012);                                                // bed moulding
    }
    for (const [x, y, s] of [[0, rise + 0.07, 1], [-hw, 0.05, 0.7], [hw, 0.05, 0.7]]) {                       // acroteria
      put(new THREE.BoxGeometry(0.06 * s, 0.035 * s, 0.05 * s), cx + x, yb + y, zf + 0.02);
      put(new THREE.SphereGeometry(0.03 * s, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.4, 0.5), cx + x, yb + y + 0.017 * s, zf + 0.02);
    }
  };

  // podium of the whole building, with a moulded edge
  box(7.4, 0.08, 2.9, 0, 0.04, -1.9);
  put(ringMoulding([[0.02, 0], [0.02, 0.058], [0.008, 0.07], [0, 0.08]], 3.7, 1.45), 0, 0, -1.9);
  // --- main block
  box(3.4, 0.95, 2.6, 0, 0.475, -1.9);
  box(3.4, 0.05, 2.6, 0, 0.97, -1.9);
  plinthRing(1.7, 1.3, 0, -1.9);
  put(ringMoulding([[0, 0.43], [0.01, 0.435], [0.01, 0.45], [0.004, 0.455], [0, 0.46]], 1.7, 1.3), 0, 0, -1.9);   // string course
  put(ringMoulding(entab(0.845, 0.15), 1.7, 1.3), 0, 0, -1.9);
  dentilRing(0, -1.9, 1.7, 1.3, 0.845 + 0.68 * 0.15, 'FLR');
  {
    const up = [windowUnit(0.12, 0.2, 'tri'), windowUnit(0.12, 0.2, 'seg')], low = windowUnit(0.11, 0.15, 'flat');
    for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) {
      const x = sx * (0.5 + i * 0.26);
      winAt(up[i % 2], x, 0.64, -0.6); winAt(low, x, 0.27, -0.6);
    }
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) pilaster(sx * (0.63 + i * 0.26), -0.6, 0.46, 0.845);
    for (const sx of [-1, 1]) pilaster(sx * 1.655, -0.6, 0.46, 0.845, 0.07);
    winAt(windowUnit(0.26, 0.44, 'arch'), 0, 0.57, -0.6);                                                    // great door behind the portico
  }
  // balustrade round the main roof
  for (const [L, x, z, ry] of [[3.3, 0, -0.63, 0], [3.3, 0, -3.17, 0], [2.5, 1.67, -1.9, Math.PI / 2], [2.5, -1.67, -1.9, Math.PI / 2]]) putAll(balustrade(L, 0.1), x, 0.995, z, ry);
  // --- portico: stylobate, six Corinthian columns (and two returns) on Attic bases, entablature, pediment, stairs
  box(2.2, 0.1, 0.9, 0, 0.3, -0.25);
  put(ringMoulding([[0.01, 0.25], [0.01, 0.33], [0.004, 0.34], [0, 0.35]], 1.1, 0.45), 0, 0, -0.25);
  {
    const col = [...atticBase(0.046, 0.35, 0.035), flutedShaft(0.046, 0.039, 0.5, 24, 3).translate(0, 0.385, 0), ...corinthianCapital(0.039, 0.885, 0.105)];
    for (let i = 0; i < 6; i++) putAll(col, -0.9 + i * 0.36, 0, 0.1);
    for (const sx of [-1, 1]) putAll(col, sx * 0.9, 0, -0.3);
  }
  put(ringMoulding(entab(0.99, 0.13), 1.06, 0.4), 0, 0, -0.24);
  box(2.12, 0.13, 0.8, 0, 1.055, -0.24);                                                                      // coffered soffit block
  for (let i = 0; i < 5; i++) for (const k of [0, 1]) box(0.28, 0.012, 0.28, -0.72 + i * 0.36, 0.985, -0.04 - k * 0.36);   // coffers
  dentilRing(0, -0.24, 1.06, 0.4, 0.99 + 0.68 * 0.13, 'FLR');
  pediment(0, 1.12, 0.218, 1.12, 0.3, 0.84);
  for (let k = 0; k < 5; k++) { const h = 0.07 * (k + 1), d = 0.08 * (5 - k); box(2.0, h, d, 0, h / 2, 0.2 + d / 2); }   // stairs
  for (const sx of [-1, 1]) {                                                                                 // cheek blocks with urns
    box(0.14, 0.42, 0.44, sx * 1.07, 0.21, 0.42); box(0.17, 0.03, 0.47, sx * 1.07, 0.435, 0.42);
    put(lathe([[0, 0], [0.03, 0], [0.03, 0.01], [0.015, 0.02], [0.04, 0.055], [0.036, 0.075], [0.02, 0.085], [0.024, 0.09], [0, 0.092]], 10), sx * 1.07, 0.45, 0.42);
  }
  // --- wings
  for (const sx of [-1, 1]) {
    const cx = sx * 2.6;
    box(1.9, 0.7, 2.0, cx, 0.35, -2.0); box(1.9, 0.02, 2.0, cx, 0.71, -2.0);
    plinthRing(0.95, 1.0, cx, -2.0);
    put(ringMoulding(entab(0.6, 0.12), 0.95, 1.0), cx, 0, -2.0);
    dentilRing(cx, -2.0, 0.95, 1.0, 0.6 + 0.68 * 0.12, 'FB');
    const up = [windowUnit(0.1, 0.18, 'tri'), windowUnit(0.1, 0.18, 'seg')], low = windowUnit(0.09, 0.08, 'flat');
    for (let i = 0; i < 5; i++) { const x = sx * (1.93 + i * 0.26); winAt(up[i % 2], x, 0.4, -1.0); winAt(low, x, 0.2, -1.0); }
    for (let i = 0; i < 6; i++) pilaster(sx * (1.8 + i * 0.26), -1.0, 0.14, 0.6, 0.045);
    putAll(balustrade(1.8, 0.09), cx, 0.72, -1.03);
  }
  // --- end pavilions: engaged Corinthian columns framing a round-headed window, pediment
  {
    const col = [...atticBase(0.03, 0.14, 0.025), flutedShaft(0.03, 0.026, 0.545, 20, 3).translate(0, 0.165, 0), ...corinthianCapital(0.026, 0.71, 0.07)];
    const arch = windowUnit(0.12, 0.32, 'arch'), low = windowUnit(0.1, 0.09, 'flat');
    for (const sx of [-1, 1]) {
      const cx = sx * 3.45;
      box(0.55, 0.9, 2.2, cx, 0.45, -2.0); box(0.55, 0.01, 2.2, cx, 0.905, -2.0);
      plinthRing(0.275, 1.1, cx, -2.0);
      put(ringMoulding(entab(0.78, 0.13), 0.275, 1.1), cx, 0, -2.0);
      dentilRing(cx, -2.0, 0.275, 1.1, 0.78 + 0.68 * 0.13, sx > 0 ? 'FR' : 'FL');
      for (const dx of [-0.12, 0.12]) putAll(col, cx + dx, 0, -0.875);
      for (const dx of [-0.245, 0.245]) pilaster(cx + dx, -0.9, 0.14, 0.78, 0.04);
      winAt(arch, cx, 0.5, -0.9); winAt(low, cx, 0.235, -0.9);
      pediment(cx, 0.91, -0.842, 0.33, 0.12, 0.3);
    }
  }
  // --- drum: stepped podium, wall with arched windows between the columns, entablature, balustrade, attic
  put(lathe([[0, 1.03], [1.72, 1.03], [1.72, 1.09], [1.7, 1.1], [1.68, 1.1], [1.68, 1.16], [1.66, 1.17], [1.64, 1.17], [1.64, 1.25], [0, 1.25]], 72), 0, 0, -1.9);
  put(new THREE.CylinderGeometry(1.2, 1.2, 0.95, 72), 0, 1.72, -1.9);
  put(lathe([[0, 2.2], [1.54, 2.2], [1.54, 2.23], [1.55, 2.232], [1.55, 2.255], [1.545, 2.26], [1.545, 2.3], [1.56, 2.31], [1.56, 2.31], [1.62, 2.33], [1.625, 2.335], [1.625, 2.35], [1.63, 2.355], [1.63, 2.36], [0, 2.36]], 96), 0, 0, -1.9);
  put(lathe([[0, 2.36], [1.35, 2.36], [1.35, 2.39], [1.33, 2.4], [1.3, 2.4], [1.3, 2.6], [1.33, 2.61], [1.345, 2.625], [1.345, 2.64], [0, 2.64]], 96), 0, 0, -1.9);   // attic
  {
    const dw = windowUnit(0.11, 0.4, 'arch'), aw = windowUnit(0.07, 0.08, 'flat'), bal = balusterGeo(0.065);
    for (let i = 0; i < NCOL; i++) {
      const a = colAng(i) + Math.PI / NCOL;
      winAt(dw, Math.sin(a) * 1.198, 1.7, -1.9 + Math.cos(a) * 1.198, a);
      winAt(aw, Math.sin(a) * 1.298, 2.49, -1.9 + Math.cos(a) * 1.298, a);
    }
    for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; put(dentilG, Math.sin(a) * 1.554, 2.303, -1.9 + Math.cos(a) * 1.554, a); }
    for (let i = 0; i < 90; i++) { const a = (i + 0.5) / 90 * Math.PI * 2; put(bal, Math.sin(a) * 1.58, 2.375, -1.9 + Math.cos(a) * 1.58); }
    put(lathe([[1.55, 2.36], [1.61, 2.36], [1.61, 2.375], [1.55, 2.375]], 96), 0, 0, -1.9);                   // balustrade plinth
    put(lathe([[1.555, 2.44], [1.605, 2.44], [1.608, 2.45], [1.605, 2.458], [1.555, 2.458], [1.555, 2.44]], 96), 0, 0, -1.9);   // rail
  }
  // --- lantern: base, glazed core ringed by colonnettes, entablature (the cupola and finial are gilded)
  put(lathe([[0, 3.84], [0.34, 3.84], [0.34, 3.9], [0.32, 3.91], [0.3, 3.91], [0.3, 3.96], [0, 3.96]], 32), 0, 0, -1.9);
  wins.push([new THREE.CylinderGeometry(0.17, 0.17, 0.2, 20), 0, 4.06, -1.9]);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = Math.sin(a) * 0.24, z = -1.9 + Math.cos(a) * 0.24;
    put(new THREE.CylinderGeometry(0.011, 0.013, 0.18, 6), x, 4.05, z); put(new THREE.BoxGeometry(0.034, 0.02, 0.034), x, 4.15, z, a);
  }
  put(lathe([[0, 4.16], [0.27, 4.16], [0.27, 4.19], [0.29, 4.2], [0.29, 4.215], [0, 4.215]], 32), 0, 0, -1.9);
  // hemicycle of the chamber in front, with its aisle stairs
  put(hemicycleGeometry(0.7, 5, 0.22, 0.09), 0, 0, 2.55, 0);
  aisleSteps(parlParts, 0.7, 5, 0.22, 0.09, 0, 2.55, [Math.PI * 0.7, Math.PI, Math.PI * 1.3]);
  const parlGeo = bakeParts(parlParts);
  const parl = new THREE.Mesh(parlGeo, parlMat);
  scene.add(parl);
  // windows: warm-lit glazing set into the facades (dissolves with the building)
  const winMat = withDissolve(new THREE.MeshStandardMaterial({ color: '#1a120b', roughness: 0.25, metalness: 0.2, emissive: new THREE.Color('#ffb45a'), emissiveIntensity: 0.55 }), '#ffd08a', 'win');
  winMat.userData.dissolve.uDissolve = parlMat.userData.dissolve.uDissolve;   // one dissolve front for the whole building
  parl.add(new THREE.Mesh(bakeParts(wins), winMat));
  // the gilded dome: sixteen raised ribs, a ring at its springing, the lantern's cupola and finial
  const domeParts = [];
  domeParts.push([new THREE.SphereGeometry(1.3, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.62, -1.9]);
  const RIB_H = 0.024;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, T = V(Math.cos(a), 0, -Math.sin(a)), w = 0.022, secs = [];
    const prof = [[w, 0], [w, RIB_H * 0.8], [w * 0.5, RIB_H], [-w * 0.5, RIB_H], [-w, RIB_H * 0.8], [-w, 0]];
    for (let k = 0; k <= 24; k++) {
      const e = (k / 24) * 1.34, N = V(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
      secs.push(prof.map(([u, o]) => N.clone().multiplyScalar(1.297 + o).addScaledVector(T, u)));
    }
    domeParts.push([loft(secs), 0, 2.62, -1.9]);
  }
  domeParts.push([new THREE.TorusGeometry(1.302, 0.02, 6, 96).rotateX(Math.PI / 2), 0, 2.655, -1.9]);
  domeParts.push([new THREE.SphereGeometry(0.22, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.1, 1), 0, 4.215, -1.9]);
  domeParts.push([lathe([[0, 4.45], [0.03, 4.45], [0.02, 4.48], [0.04, 4.52], [0.02, 4.56], [0.008, 4.6], [0.004, 4.68], [0, 4.7]], 12), 0, 0, -1.9]);
  const domeGeo = bakeParts(domeParts);
  const dome = new THREE.Mesh(domeGeo, domeGoldMat);
  scene.add(dome);
  // Gilded ribs traced over the dome as it materialises (riding on the raised ribs)
  const RIB_R = 1.297 + RIB_H + 0.005;
  const ribs = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, pts = [];
    for (let k = 0; k <= 24; k++) { const e = (k / 24) * Math.PI / 2; pts.push(V(Math.sin(a) * Math.cos(e) * RIB_R, 2.62 + Math.sin(e) * RIB_R, -1.9 + Math.cos(a) * Math.cos(e) * RIB_R)); }
    const l = progressLine(pts, { color: '#ffd28a', headColor: '#fff4dc', intensity: 1.4, head: 0.06 });
    scene.add(l); ribs.push(l);
  }
  // Drum colonnade (the letters of REPRESENTATION become these columns): Corinthian, fluted, on Attic bases
  const drumCols = [];
  const drumColGeo = mergeGeometries([...atticBase(0.064, 0, 0.05), flutedShaft(0.062, 0.052, 0.8, 24, 3).translate(0, 0.05, 0), ...corinthianCapital(0.052, 0.85, 0.1)].map((g) => (g.index ? g.toNonIndexed() : g)));
  const drumColMat = new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f3ecdf', roughness: 0.3, clearcoat: 0.3, emissive: new THREE.Color('#ffc57a'), emissiveIntensity: 0 });
  for (let i = 0; i < NCOL; i++) {
    const a = colAng(i);
    const m = new THREE.Mesh(drumColGeo, drumColMat);
    m.position.set(DRUM_C.x + Math.sin(a) * DRUM_R, 1.25, DRUM_C.z + Math.cos(a) * DRUM_R);
    scene.add(m);
    drumCols.push({ m, a });
  }
  // columns in front (facing the camera) sorted left→right on screen for the letter mapping
  drumCols.forEach((c) => { c.d = Math.cos(c.a - viewAng); });
  const frontCols = drumCols.filter((c) => c.d > -0.05)
    .sort((p, q) => Math.sin(p.a - viewAng) - Math.sin(q.a - viewAng));

  // ---------------------------------------------------------------- particles: greek → docs, docs → parliament
  const greekPts = sampleGeometry(greekGeo, NDOC, { seed: 81 });
  const parlPts = (() => {
    const a = sampleGeometry(parlGeo, Math.floor(NDOC * 0.62), { seed: 82 }), b = sampleGeometry(domeGeo, NDOC - Math.floor(NDOC * 0.62), { seed: 83 });
    const o = new Float32Array(NDOC * 3); o.set(a, 0); o.set(b, a.length); return o;
  })();
  const pc = new Float32Array(NDOC * 3), pc2 = new Float32Array(NDOC * 3);
  const cGold = new THREE.Color('#ffc978'), cInk = new THREE.Color('#ff9e58'), cWhite = new THREE.Color('#fff2dc'), tc = new THREE.Color();
  for (let i = 0; i < NDOC; i++) {
    tc.copy(cGold).lerp(R() < 0.5 ? cWhite : cInk, R() * 0.6); pc[i * 3] = tc.r; pc[i * 3 + 1] = tc.g; pc[i * 3 + 2] = tc.b;
    tc.copy(cWhite).lerp(cGold, R() * 0.7); pc2[i * 3] = tc.r; pc2[i * 3 + 1] = tc.g; pc2[i * 3 + 2] = tc.b;
  }
  const p1 = new MorphParticles({ count: NDOC, positions: greekPts, targets: docTargets, colors: pc, size: 0.02, intensity: 1.1, stagger: 0.45, seed: 91 });
  const p2 = new MorphParticles({ count: NDOC, positions: docTargets, targets: parlPts, colors: pc2, size: 0.024, intensity: 1.1, stagger: 0.45, seed: 92 });
  p1.u.noiseFreq = p2.u.noiseFreq = 0.8;
  scene.add(p1, p2);

  // ---------------------------------------------------------------- kinetic words (world-placed along the camera path)
  const placeWord = (obj, t, dist, dx = 0, dy = 0) => {
    const P = new THREE.Vector3(), L = new THREE.Vector3();
    camAt(t, P, L);
    const f = L.clone().sub(P).normalize();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, f);
    obj.position.copy(P).addScaledVector(f, dist).addScaledVector(right, dx).addScaledVector(up, dy);
    obj.lookAt(P.clone().addScaledVector(up, dy * 0.0));
    scene.add(obj);
    obj.updateMatrixWorld(true);
  };
  const wC = cue('wordCivic'), wL = cue('wordLaw'), wR = cue('wordRepresentation'), lg = cue('lettersToGeometry');
  const civicWord = new KineticText('CIVIC PARTICIPATION', { font: FONTS.display, weight: 600, height: 0.2, letterSpacing: 0.2, color: '#fff0d6', intensity: 1.6 });
  // open matte (square): the frame is taller, so sit higher to clear the centred 3D chapter word (LAW)
  placeWord(civicWord, wC + 0.3, 3.4, 0, OUTPUT_ASPECT < 1.5 ? 0.86 : 0.62);
  const civicSub = new TextPlane('Ekklesia  ·  the assembly of citizens', { font: FONTS.serif, italic: true, weight: 500, height: 0.085, color: '#f0d7a8', intensity: 1.1 });
  civicSub.position.set(0, -0.2, 0);
  civicWord.add(civicSub);

  const lawWord = new KineticText('LAW', { font: FONTS.display, weight: 700, height: 0.62, letterSpacing: 0.45, color: '#fff3dc', intensity: 1.8 });
  placeWord(lawWord, wL + 0.3, 3.7, 0, 0.2);
  const seal = new RingGauge(0.95, { ticks: 96, color: GOLD, intensity: 1.6, tickLen: 0.05, majorEvery: 8 });
  seal.position.set(0, 0, -0.05);
  lawWord.add(seal);
  const seal2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePoints(1.2, 128)), new THREE.LineBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  seal2.position.z = -0.05;
  lawWord.add(seal2);
  const lawSub = new TextPlane('LEX  ·  IVS  ·  RES PVBLICA', { font: FONTS.mono, weight: 400, height: 0.07, letterSpacing: 0.35, color: '#f0d7a8', intensity: 1.2 });
  lawSub.position.set(0, -0.62, 0);
  lawWord.add(lawSub);

  const repWord = new KineticText('REPRESENTATION', { font: FONTS.display, weight: 600, height: 0.24, letterSpacing: 0.26, color: '#fff0d6', intensity: 1.7 });
  placeWord(repWord, wR + 0.35, 3.6, 0, 0.84);
  // local-space flight targets for each REPRESENTATION glyph → a drum column (computed once; path is deterministic)
  const inv = new THREE.Matrix4().copy(repWord.matrixWorld).invert();
  const repTargets = repWord.letters.map((L, i) => {
    const c = frontCols[Math.round((i / (repWord.count - 1)) * (frontCols.length - 1) * 0.86 + (frontCols.length - 1) * 0.07)];
    const w = c.m.position.clone().add(V(0, 0.48, 0));
    c.fed = true;
    return { local: w.applyMatrix4(inv), col: c };
  });

  // Callouts (tiny infographic annotations)
  const callGreek = new Callout('PNYX · EKKLESIA', { dx: 0.9, dy: 0.55, size: 0.11, color: '#f3d5a0', sub: 'ASSEMBLY OF CITIZENS', intensity: 1.3 });
  callGreek.position.set(1.9, 1.05, 0.9);
  const callParl = new Callout('HEMICYCLE', { dx: -0.9, dy: 0.5, size: 0.1, color: '#f3d5a0', sub: 'REPRESENTATIVE ASSEMBLY', intensity: 1.3 });
  callParl.position.set(-1.0, 0.45, 2.1);
  scene.add(callGreek, callParl);

  // Explore 3D only: the assembly, the documents and the parliament otherwise float in a void — give them
  // a paved civic floor (concentric courses + radial joints) that melts into the dark at its rim
  const stageFloor = (() => {
    const N = 1024, c = mkCanvas(N, N), g = c.getContext('2d'), rr = rng(77), C = N / 2;
    g.fillStyle = '#20170f'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '255,230,190' : '0,0,0'},${0.02 + rr() * 0.04})`; g.fillRect(rr() * N, rr() * N, 2 + rr() * 6, 2 + rr() * 6); }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
    const ringR = [];
    for (let r = 40; r < C; r += 26 + r * 0.05) ringR.push(r);
    ringR.forEach((r, k) => {
      g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke();
      const n = Math.max(8, Math.round(r * 0.09)), off = (k % 2) * 0.5;
      for (let j = 0; j < n; j++) { const a = ((j + off) / n) * Math.PI * 2, r0 = ringR[k - 1] ?? 0; g.beginPath(); g.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); g.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); g.stroke(); }
    });
    g.strokeStyle = 'rgba(240,199,126,0.18)'; g.lineWidth = 4;
    for (const r of [ringR[3], ringR[9], ringR[10]]) if (r) { g.beginPath(); g.arc(C, C, r, 0, Math.PI * 2); g.stroke(); }
    // fade to transparent at the rim
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(C, C, C * 0.45, C, C, C);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, N, N);
    const m = new THREE.Mesh(new THREE.CircleGeometry(15, 96), new THREE.MeshStandardMaterial({ map: toTexture(c), transparent: true, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.3 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, -0.004, -0.8); m.renderOrder = -1; m.visible = false;
    scene.add(m);
    return m;
  })();

  const wordMats = [...[civicWord, lawWord, repWord].flatMap((w) => w.letters.map((L) => L.mesh.material)), civicSub.material, lawSub.material];
  const setWordDepth = (on) => { for (const m of wordMats) m.depthTest = on; };
  setWordDepth(false);
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), sv = new THREE.Vector3();
  const bloom = { strength: 0.8 };
  const dof = { focus: 10, range: 3, amount: 0 };     // never blurs; its focus is the Explore 3D pivot (the stage)
  const callRev = [0, 0, 0];
  let lastM1 = 0, lastM2 = 0;
  const _cp = new THREE.Vector3(), _cd = new THREE.Vector3(), DOC_C = V(0, 1.9, 0.5), STAGE_C = V(0, 1.4, -1);

  const api = {
    scene, camera, bloom, dof, exposure: 1,
    exploreLimits: { yaw: 1.15, pitchDown: 0.3, pitchUp: 0.75, zoomIn: 0.35, zoomOut: 2.4, fly: 1.4 },
    // (the kinetic words ignore depth so they read over the set in the film's framing; orbiting, they must not
    // show through the buildings)
    explore(t) {
      stageFloor.visible = true; setWordDepth(true);
      // explore hides the chapter heading (LAW) and with it the film's bloom duck: put it back
      if (ctx.engine?.headingsHidden) bloom.strength *= 1 - 0.45 * headingDuck(ctx, api, t + segment.start);
    },
    // off the film's axis: callouts turn to the viewer, props drifting up to the lens step back, and the
    // additive particle clouds are kept from stacking into glare (edge-on on the documents, or zoomed out)
    explorePosed(cam) {
      cam.updateMatrixWorld();
      const cp = _cp.setFromMatrixPosition(cam.matrixWorld);
      for (const S of sheets) if (S.k > 0.002) { S.mat.opacity = S.k * smoothstep(2.2, 4.2, S.sh.position.distanceTo(cp)); S.sh.visible = S.mat.opacity > 0.002; }
      callGreek.quaternion.copy(cam.quaternion); callParl.quaternion.copy(cam.quaternion);
      callGreek.reveal(callRev[0], callRev[1] * smoothstep(0.9, 2.0, callGreek.position.distanceTo(cp)));
      callParl.reveal(callRev[2], smoothstep(0.9, 2.0, callParl.position.distanceTo(cp)));
      _cd.copy(cp).sub(DOC_C).normalize();
      let face = 1;
      for (let i = 0; i < docDefs.length; i++) { const ry = docDefs[i][3]; face = Math.min(face, Math.abs(_cd.x * Math.sin(ry) + _cd.z * Math.cos(ry))); }
      const edge = lerp(0.15, 1, smoothstep(0.25, 0.7, face));
      const far = Math.pow(clamp(pos.distanceTo(STAGE_C) / Math.max(0.1, cp.distanceTo(STAGE_C)), 0.35, 1), 1.3);
      p1.u.opacity *= lerp(1, edge, lastM1) * far;
      p2.u.opacity *= lerp(1, edge, 1 - lastM2) * far;
    },
    exploreEnd() { setWordDepth(false); },
    update(t, info) {
      const T = info.T;
      camAt(t, pos, look);
      dof.focus = pos.distanceTo(look);
      stageFloor.visible = false;
      // tiny impact shake on LAW
      const shake = Math.exp(-Math.max(0, t - wL - 0.12) * 9) * (t > wL + 0.12 ? 1 : 0) * 0.03;
      camera.position.set(pos.x + Math.sin(t * 73) * shake, pos.y + Math.cos(t * 61) * shake, pos.z);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      const faceQ = camera.quaternion;

      // ------------------------------------------------ parchment sheets
      for (let i = 0; i < sheets.length; i++) {
        const S = sheets[i];
        const k = ramp(t, S.t0, S.t0 + 0.75, ease.inOutCubic);
        const fy = 1 - ramp(t, S.t0, S.t0 + 0.4, ease.inOutSine);
        const fx = 1 - ramp(t, S.t0 + 0.2, S.t0 + 0.85, ease.inOutCubic);
        S.sh.setFold(fx, fy, 0.03 * k, t + i);
        S.sh.position.copy(S.base).addScaledVector(S.drift, t);
        S.sh.rotation.set(S.rot[0] + t * 0.05, S.rot[1] + S.spin * t, S.rot[2] + (1 - k) * 0.6);
        S.sh.scale.setScalar(lerp(0.7, 1, k));
        // a sheet that drifts up to the lens would sweep across the frame as a huge out-of-focus slab: fade it out first
        const dCam = S.sh.position.distanceTo(pos);
        // from the documents on, the stage is the frame centre: sheets drifting across it step back
        sv.copy(S.sh.position).project(camera);
        const onStage = (sv.z < 1 ? 1 : 0) * (1 - smoothstep(0.3, 0.6, Math.abs(sv.x))) * (1 - smoothstep(1.6, 2.3, Math.abs(sv.y))) * ramp(t, 1.5, 1.9);   // NDC y spans ±2.39 in the square open matte
        S.k = ramp(t, -0.2, 0.25) * (1 - 0.35 * ramp(t, 2.6, 3.6)) * (1 - 0.9 * onStage);
        S.mat.opacity = S.k * smoothstep(2.2, 4.2, dCam);
        S.sh.visible = S.mat.opacity > 0.002;
      }

      // ------------------------------------------------ greek → particles → documents → particles → parliament
      const gd = ramp(t, 1.2, 1.75, ease.inOutSine);
      greekMat.userData.dissolve.uDissolve.value = gd;
      greek.visible = gd < 0.999;
      p1.tick(t, info); p2.tick(t, info);
      const m1 = ramp(t, 1.3, 2.05, ease.inOutSine);
      p1.u.mix = m1; lastM1 = m1;
      p1.u.noise = 0.02 + 0.12 * Math.sin(Math.PI * m1);
      const p1op = ramp(t, 1.15, 1.45) * lerp(0.6, 1, m1) * (1 - ramp(t, 2.05, 2.35));
      p1.u.opacity = p1op; p1.visible = p1op > 0.002;
      p1.u.intensity = 1.0 + 0.6 * (1 - m1);

      for (let i = 0; i < docs.length; i++) {
        const D = docs[i];
        const inT = 1.72 + D.t0, outT = 2.45 + D.t0;
        const open = ramp(t, inT, inT + 0.45, ease.outCubic) * (1 - ramp(t, outT + 0.1, outT + 0.55, ease.inCubic));
        D.sh.setFold(1 - open, 1 - ramp(t, inT - 0.1, inT + 0.25) * (1 - ramp(t, outT + 0.3, outT + 0.6)), 0.015, t + i * 2);
        const op = ramp(t, inT + 0.05, inT + 0.35) * (1 - ramp(t, outT + 0.25, outT + 0.6));
        D.mat.opacity = op;
        D.sh.visible = op > 0.002;
      }
      const m2 = ramp(t, 2.45, 3.15, ease.inOutSine);
      p2.u.mix = m2; lastM2 = m2;
      p2.u.noise = 0.02 + 0.14 * Math.sin(Math.PI * m2);
      const p2op = ramp(t, 2.35, 2.55) * (1 - ramp(t, 3.15, 3.5));
      p2.u.opacity = p2op; p2.visible = p2op > 0.002;
      p2.u.intensity = 1.0 + 0.5 * Math.sin(Math.PI * m2);

      const pb = 1 - ramp(t, 2.85, 3.4, ease.inOutSine);
      parlMat.userData.dissolve.uDissolve.value = pb;
      domeGoldMat.userData.dissolve.uDissolve.value = 1 - ramp(t, 2.95, 3.5, ease.inOutSine);
      parl.visible = pb < 0.999;
      dome.visible = domeGoldMat.userData.dissolve.uDissolve.value < 0.999;
      for (let i = 0; i < ribs.length; i++) { ribs[i].progress = ramp(t, 2.8 + i * 0.012, 3.25 + i * 0.012, ease.inOutSine); ribs[i].opacity = 0.9 - 0.55 * ramp(t, 3.4, 3.9); }

      // ------------------------------------------------ words
      // CIVIC PARTICIPATION: glyphs unfold like paper from their baseline, then fly off
      civicWord.visible = t > wC - 0.05 && t < wL + 0.1;
      if (civicWord.visible) {
        const out = ramp(t, wL - 0.35, wL + 0.05, ease.inCubic);
        for (const L of civicWord.letters) {
          const d = L.index * 0.022;
          const k = ramp(t, wC + d, wC + d + 0.32, ease.outCubic);
          L.mesh.rotation.set(-(1 - k) * 1.5 + out * (L.u - 0.5) * 2, out * (L.u - 0.5) * 1.5, 0);
          L.mesh.position.set(L.base.x * (1 + out * 0.8), L.base.y - (1 - k) * 0.1 + out * (Math.sin(L.index * 2.3) * 0.5), L.base.z + out * (1.2 + Math.cos(L.index * 1.7) * 0.8));
          L.mesh.opacity = k * (1 - out);
          L.mesh.intensity = 1.6 + (1 - k) * 2;
        }
        civicSub.reveal = ramp(t, wC + 0.25, wC + 0.7, ease.outCubic);
        civicSub.opacity = 1 - out;
      }
      // LAW: stamped down with a seal ring shockwave
      // the flat LAW word is retired: the chapter's 3D heading (core/words3d.js) carries it now
      lawWord.visible = false;
      if (lawWord.visible) {
        const out = ramp(t, wR - 0.45, wR - 0.05, ease.inCubic);
        for (const L of lawWord.letters) {
          const d = L.index * 0.05;
          const k = ramp(t, wL + d, wL + d + 0.18, ease.inQuad);
          L.mesh.scale.setScalar(lerp(2.4, 1, k));
          L.mesh.position.set(L.base.x, L.base.y, L.base.z + (1 - k) * 0.9 - out * 1.2);
          L.mesh.opacity = sat(k * 1.6) * (1 - out);
          L.mesh.intensity = 1.2 + Math.exp(-Math.max(0, t - wL - d - 0.18) * 7) * 1.4 * k;
        }
        const sp = ramp(t, wL + 0.1, wL + 0.7, ease.outCubic);
        seal.reveal(sp, 1 - out);
        seal.rotation.z = -t * 0.35;
        seal.scale.setScalar(lerp(0.85, 1, sp) * (1 + out * 0.4));
        const shock = ramp(t, wL + 0.12, wL + 0.6, ease.outCubic);
        seal2.scale.setScalar(lerp(0.4, 1.9, shock));
        seal2.material.opacity = (1 - shock) * (t > wL + 0.12 ? 1 : 0);
        lawSub.reveal = ramp(t, wL + 0.3, wL + 0.75, ease.outCubic);
        lawSub.opacity = 1 - out;
      }
      // REPRESENTATION: rises in from the centre, then each glyph flies to a drum column
      repWord.visible = t > wR - 0.05;
      for (let i = 0; i < repWord.letters.length; i++) {
        const L = repWord.letters[i];
        const d = Math.abs(L.u - 0.5) * 0.3;
        const k = ramp(t, wR + d, wR + d + 0.35, ease.outCubic);
        // slowed down: a longer, staggered flight so each glyph visibly becomes a column
        const fd = lg - 0.05 + L.index * 0.032;
        const f = ramp(t, fd, fd + 0.7, ease.inOutCubic);
        const tg = repTargets[i].local;
        const arc = Math.sin(Math.PI * f) * 0.35;
        L.mesh.position.set(lerp(L.base.x, tg.x, f), lerp(L.base.y - (1 - k) * 0.2, tg.y, f) + arc, lerp(L.base.z, tg.z, f));
        L.mesh.scale.set(lerp(1, 0.28, f), lerp(1, 3.2, f), 1);
        L.mesh.rotation.z = (1 - k) * (L.u - 0.5) * 0.4;
        const fade = 1 - ramp(t, fd + 0.62, fd + 0.85);
        L.mesh.opacity = k * fade;
        L.mesh.intensity = 1.7 + (1 - k) * 2 + f * 2.5;
      }
      // drum columns grow from the landing glyphs (others grow on their own)
      for (let i = 0; i < drumCols.length; i++) {
        const c = drumCols[i];
        const ti = lg + 0.35 + (c.fed ? 0 : 0.2) + Math.abs(Math.sin(c.a - viewAng)) * 0.3;
        const g = ramp(t, ti, ti + 0.55, ease.outCubic);
        c.m.scale.set(1, Math.max(0.001, g), 1);
        c.m.visible = g > 0.001;
      }
      drumColMat.emissiveIntensity = 1.4 * (1 - ramp(t, lg + 0.9, lg + 1.3)) * (t > lg ? 1 : 0) + 0.15;

      // callouts
      callRev[0] = ramp(t, 0.45, 0.95, ease.outCubic); callRev[1] = 1 - ramp(t, 1.05, 1.3); callRev[2] = ramp(t, 3.35, 3.8, ease.outCubic);
      callGreek.reveal(callRev[0], callRev[1]);
      callGreek.quaternion.copy(faceQ);
      callParl.reveal(callRev[2], 1);
      callParl.quaternion.copy(faceQ);

      // atmosphere
      dust.tick(t, info);
      shaft.material.uniforms.uTime.value = t;
      shaft.material.uniforms.uIntensity.value = 0.14 + 0.06 * ramp(t, 3.0, 4.0);
      backGlow.material.color.setRGB(1, 0.7, 0.4).multiplyScalar(0.35 + 0.5 * ramp(t, 3.1, 4.0) + 0.15 * pulse(T, { decay: 4 }));
      rim.intensity = 1.4 + 1.4 * ramp(t, 3.0, 4.0);
      bloom.strength = 0.8 + 0.2 * envelope(t, wL, wL + 0.6, 0.05, 0.4);
    },
  };
  return api;
}
