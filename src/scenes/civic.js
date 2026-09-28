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
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * uEdgeGain * (1.0 - smoothstep(0.0, 0.06, dd)) * step(0.001, uDissolve) * step(uDissolve, 0.999);`);
  };
  material.customProgramCacheKey = () => 'civic-dissolve-' + key;
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
  // seal
  const sx = W * 0.5, sy = H * 0.92, sr = W * 0.085;
  if (withBg) {
    const g = ctx.createRadialGradient(sx - sr * 0.3, sy - sr * 0.3, sr * 0.1, sx, sy, sr);
    g.addColorStop(0, '#b3302a'); g.addColorStop(1, '#5e1210');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,6,4,0.8)';
  }
  ctx.lineWidth = W * 0.005;
  ctx.beginPath(); ctx.arc(sx, sy, sr * 0.72, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = withBg ? 'rgba(40,6,4,0.85)' : ink; ctx.textAlign = 'center';
  ctx.font = `700 ${W * 0.045}px "${FONTS.display}"`; ctx.fillText('LEX', sx, sy + W * 0.004);
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
    sheets.push({ sh, mat, base: V(x, y, z), rot: [(R() - 0.5) * 0.6, R() * Math.PI * 2, (R() - 0.5) * 0.5], spin: (R() - 0.5) * 0.5, t0: cue('parchment') + i * 0.07 + R() * 0.08, drift: V((R() - 0.5) * 0.4, (R() - 0.2) * 0.3, (R() - 0.5) * 0.4) });
  });

  // ---------------------------------------------------------------- Greek assembly (Pnyx + stoa)
  const marbleMap = marbleTexture({ seed: 12 });
  const greekMat = withDissolve(new THREE.MeshPhysicalMaterial({ color: '#e9e0d0', roughness: 0.42, clearcoat: 0.2, emissive: '#000000', side: THREE.DoubleSide }), '#ffc070', 'greek');
  const hemi = hemicycleGeometry(1.1, 7, 0.3, 0.14);
  const colG = new THREE.CylinderGeometry(0.075, 0.09, 1.35, 16);
  const greekParts = [[hemi, 0, 0, 0]];
  greekParts.push([new THREE.CylinderGeometry(0.42, 0.5, 0.36, 24), 0, 0.18, 0.2]);     // bema
  greekParts.push([new THREE.BoxGeometry(8.2, 0.16, 1.3), 0, 0.08, -4.1]);              // stylobate
  for (let i = 0; i < 15; i++) greekParts.push([colG, -3.85 + i * 0.55, 0.16 + 0.675, -3.75]);
  greekParts.push([new THREE.BoxGeometry(8.1, 0.2, 0.3), 0, 1.61, -3.75]);             // architrave
  greekParts.push([new THREE.BoxGeometry(8.3, 0.1, 1.4), 0, 1.76, -4.1]);              // roof slab
  greekParts.push([new THREE.BoxGeometry(8.2, 1.6, 0.12), 0, 0.96, -4.72]);             // back wall
  const greekGeo = bakeParts(greekParts);
  greekGeo.computeVertexNormals();
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
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, side: THREE.DoubleSide, transparent: true, opacity: 0, envMapIntensity: 0.6, color: '#f4ead8' });
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
  const parlParts = [
    [new THREE.BoxGeometry(3.4, 0.95, 2.6), 0, 0.475, -1.9],
    [new THREE.BoxGeometry(3.6, 0.08, 2.8), 0, 0.99, -1.9],
    [new THREE.BoxGeometry(1.9, 0.7, 2.0), -2.6, 0.35, -2.0],
    [new THREE.BoxGeometry(1.9, 0.7, 2.0), 2.6, 0.35, -2.0],
    [new THREE.BoxGeometry(2.05, 0.07, 2.12), -2.6, 0.735, -2.0],
    [new THREE.BoxGeometry(2.05, 0.07, 2.12), 2.6, 0.735, -2.0],
    [new THREE.BoxGeometry(7.4, 0.08, 2.9), 0, 0.04, -1.9],
    [new THREE.BoxGeometry(2.0, 0.1, 0.5), 0, 0.05, 0.55],
    [new THREE.BoxGeometry(1.8, 0.1, 0.4), 0, 0.15, 0.5],
    [new THREE.BoxGeometry(1.6, 0.1, 0.3), 0, 0.25, 0.45],
    [new THREE.CylinderGeometry(1.62, 1.7, 0.22, 48), 0, 1.14, -1.9],
    [new THREE.CylinderGeometry(1.2, 1.2, 0.95, 48), 0, 1.72, -1.9],
    [new THREE.CylinderGeometry(1.62, 1.62, 0.16, 48), 0, 2.28, -1.9],
    [new THREE.CylinderGeometry(1.28, 1.34, 0.28, 48), 0, 2.5, -1.9],
    // portico (ground level, so the drum colonnade stays visible above it)
    [new THREE.BoxGeometry(2.2, 0.1, 0.9), 0, 0.3, -0.25],
    [new THREE.BoxGeometry(2.2, 0.14, 0.9), 0, 1.02, -0.25],
  ];
  for (let i = 0; i < 6; i++) parlParts.push([new THREE.CylinderGeometry(0.055, 0.065, 0.62, 14), -0.9 + i * 0.36, 0.66, 0.1]);
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) parlParts.push([new THREE.BoxGeometry(0.07, 0.56, 0.05), sx * (1.8 + i * 0.26), 0.36, -0.98]);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) parlParts.push([new THREE.BoxGeometry(0.16, 0.26, 0.04), sx * (0.55 + i * 0.28), 0.62, -0.58]);
  const ped = new THREE.CylinderGeometry(0.62, 0.62, 2.3, 3, 1); ped.rotateZ(Math.PI / 2); ped.scale(1, 0.42, 0.75);
  parlParts.push([ped, 0, 1.22, -0.25]);
  parlParts.push([hemicycleGeometry(0.7, 5, 0.22, 0.09), 0, 0, 2.55, 0]);
  const parlGeo = bakeParts(parlParts);
  parlGeo.computeVertexNormals();
  const parl = new THREE.Mesh(parlGeo, parlMat);
  scene.add(parl);
  const domeParts = [];
  const domeG = new THREE.SphereGeometry(1.3, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2);
  domeParts.push([domeG, 0, 2.62, -1.9]);
  domeParts.push([new THREE.CylinderGeometry(0.16, 0.18, 0.42, 16), 0, 4.1, -1.9]);
  domeParts.push([new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 4.3, -1.9]);
  const domeGeo = bakeParts(domeParts);
  domeGeo.computeVertexNormals();
  const dome = new THREE.Mesh(domeGeo, domeGoldMat);
  scene.add(dome);
  // Gilded ribs traced over the dome as it materialises
  const ribs = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, pts = [];
    for (let k = 0; k <= 24; k++) { const e = (k / 24) * Math.PI / 2; pts.push(V(Math.sin(a) * Math.cos(e) * 1.315, 2.62 + Math.sin(e) * 1.315, -1.9 + Math.cos(a) * Math.cos(e) * 1.315)); }
    const l = progressLine(pts, { color: '#ffd28a', headColor: '#fff4dc', intensity: 1.4, head: 0.06 });
    scene.add(l); ribs.push(l);
  }
  // Drum colonnade (the letters of REPRESENTATION become these columns)
  const DRUM_C = V(0, 1.72, -1.9), DRUM_R = 1.46, NCOL = 22;
  const drumCols = [];
  const drumColGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.95, 14); drumColGeo.translate(0, 0.475, 0);
  const drumColMat = new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f3ecdf', roughness: 0.3, clearcoat: 0.3, emissive: new THREE.Color('#ffc57a'), emissiveIntensity: 0 });
  const camP = new THREE.Vector3(), camL = new THREE.Vector3();
  camAt(DUR, camP, camL);
  const viewAng = Math.atan2(camP.x - DRUM_C.x, camP.z - DRUM_C.z);
  for (let i = 0; i < NCOL; i++) {
    const a = viewAng + ((i + 0.5) / NCOL) * Math.PI * 2 - Math.PI;
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

  for (const w of [civicWord, lawWord, repWord]) for (const L of w.letters) L.mesh.material.depthTest = false;
  civicSub.material.depthTest = false; lawSub.material.depthTest = false;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  const bloom = { strength: 0.8 };

  return {
    scene, camera, bloom, exposure: 1,
    update(t, info) {
      const T = info.T;
      camAt(t, pos, look);
      // tiny impact shake on LAW
      const shake = Math.exp(-Math.max(0, t - wL - 0.12) * 9) * (t > wL + 0.12 ? 1 : 0) * 0.03;
      camera.position.set(pos.x + Math.sin(t * 73) * shake, pos.y + Math.cos(t * 61) * shake, pos.z);
      camera.lookAt(look);
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
        S.mat.opacity = ramp(t, -0.2, 0.25) * (1 - 0.35 * ramp(t, 2.6, 3.6));
      }

      // ------------------------------------------------ greek → particles → documents → particles → parliament
      const gd = ramp(t, 1.2, 1.75, ease.inOutSine);
      greekMat.userData.dissolve.uDissolve.value = gd;
      greek.visible = gd < 0.999;
      p1.tick(t, info); p2.tick(t, info);
      const m1 = ramp(t, 1.3, 2.05, ease.inOutSine);
      p1.u.mix = m1;
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
      p2.u.mix = m2;
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
        const fd = lg - 0.08 + L.index * 0.011;
        const f = ramp(t, fd, fd + 0.3, ease.inOutCubic);
        const tg = repTargets[i].local;
        const arc = Math.sin(Math.PI * f) * 0.35;
        L.mesh.position.set(lerp(L.base.x, tg.x, f), lerp(L.base.y - (1 - k) * 0.2, tg.y, f) + arc, lerp(L.base.z, tg.z, f));
        L.mesh.scale.set(lerp(1, 0.28, f), lerp(1, 3.2, f), 1);
        L.mesh.rotation.z = (1 - k) * (L.u - 0.5) * 0.4;
        const fade = 1 - ramp(t, fd + 0.27, fd + 0.45);
        L.mesh.opacity = k * fade;
        L.mesh.intensity = 1.7 + (1 - k) * 2 + f * 2.5;
      }
      // drum columns grow from the landing glyphs (others grow on their own)
      for (let i = 0; i < drumCols.length; i++) {
        const c = drumCols[i];
        const ti = lg + 0.1 + (c.fed ? 0 : 0.08) + Math.abs(Math.sin(c.a - viewAng)) * 0.12;
        const g = ramp(t, ti, ti + 0.25, ease.outCubic);
        c.m.scale.set(1, Math.max(0.001, g), 1);
        c.m.visible = g > 0.001;
      }
      drumColMat.emissiveIntensity = 1.4 * (1 - ramp(t, lg + 0.35, lg + 0.7)) * (t > lg ? 1 : 0) + 0.15;

      // callouts
      callGreek.reveal(ramp(t, 0.45, 0.95, ease.outCubic), 1 - ramp(t, 1.05, 1.3));
      callGreek.quaternion.copy(faceQ);
      callParl.reveal(ramp(t, 3.35, 3.8, ease.outCubic), 1);
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
}
