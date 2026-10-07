// Metallurgy chapter — procedural masonry and carving.
//   masonry(mat, opts): patches a MeshStandard/Physical material with a world-space, aperiodic masonry shader:
//     per-block tone / size jitter (split blocks, row offsets), bevelled + chipped edges, dirt in the joints,
//     broad colour drift and weathering streaks, ground grime, and an analytic relief (the height field's
//     gradient bends the shading normal, so joints and chips catch the light). No texture: nothing repeats.
//     mode 0 = no blocks (macro colour + grain only), 1 = coursed blocks on every face.
//   carvingTexture(): one canvas of two carved bands (calligraphy over a recessed ground; a floral scroll),
//     used as map + bumpMap on ribbons whose UVs run along their length.
//   inscriptionTexture(): faint Gupta-Brahmi-like lines for the Iron Pillar.
import * as THREE from 'three';
import { GLSL_NOISE } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { rng, TAU } from '../../lib/math.js';

const MS_VERT_PARS = /* glsl */ `varying vec3 vMsW; varying vec3 vMsN; varying vec3 vMsL;`;
const MS_VERT_MAIN = /* glsl */ `
  {
    vec4 msp = vec4(transformed, 1.0);
    vec3 msn = objectNormal;
    #ifdef USE_INSTANCING
      msp = instanceMatrix * msp; msn = mat3(instanceMatrix) * msn;
    #endif
    vMsL = msp.xyz;
    vMsW = (modelMatrix * msp).xyz;
    vMsN = normalize(mat3(modelMatrix) * msn);
  }`;

const MS_FRAG_PARS = /* glsl */ `
  varying vec3 vMsW; varying vec3 vMsN; varying vec3 vMsL;
  uniform vec4 uMs1;   // course, block, split probability, bevel
  uniform vec4 uMs2;   // relief, joint width, tone variation, mode
  uniform vec4 uMs3;   // macro scale, streaks, ground grime, chips
  uniform vec4 uMs4;   // ground level y, grain, roughness base, roughness joint
  uniform vec3 uMsA, uMsB, uMsM; uniform float uMsR;
  vec3 msGrad; float msJoint; vec4 msC;
  float msH1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // block cell of plane point q: x = distance to the nearest joint (m), yzw = per-block hashes
  vec4 msCell(vec2 q){
    float C = uMs1.x, B = uMs1.y;
    float row = floor(q.y / C);
    float x = q.x + msH1(vec2(row, 7.1)) * 13.0 * B;
    float col = floor(x / B), fx = x - col * B;
    float x0 = 0.0, x1 = B, id = col * 2.0;
    if (msH1(vec2(col, row) + 3.3) < uMs1.z) {
      float s = (0.28 + 0.44 * msH1(vec2(col, row) + 9.1)) * B;
      if (fx < s) x1 = s; else { x0 = s; id += 1.0; }
    }
    float fy = q.y - row * C;
    float d = min(min(fx - x0, x1 - fx), min(fy, C - fy));
    vec2 b = vec2(id, row);
    return vec4(d, msH1(b), msH1(b + 5.7), msH1(b + 11.3));
  }
  float msHeight(vec2 q, out vec4 c){
    float g = uMs4.y * (snoise(vec3(q * 9.0, 1.7)) * 0.6 + snoise(vec3(q * 31.0, 4.1)) * 0.4);
    if (uMs2.w < 0.5) { c = vec4(1.0, 0.5, 0.5, 0.5); return g; }
    c = msCell(q);
    float bev = uMs1.w;
    float h = smoothstep(0.0, bev, c.x) * 0.012 * (0.8 + 0.4 * c.y);
    float chip = smoothstep(0.45, 0.8, snoise(vec3(q * 3.3, 2.7))) * (1.0 - smoothstep(0.0, bev * 3.5, c.x)) * uMs3.w;
    float pit = smoothstep(0.62, 0.9, snoise(vec3(q * 11.0, 5.3))) * 0.004 * uMs3.w;
    return h - chip * 0.014 - pit + g;
  }`;

const PLANE_BOX = /* glsl */ `
    if (an.y > max(an.x, an.z)) { q = vMsW.xz; Tu = vec3(1.0, 0.0, 0.0); Tv = vec3(0.0, 0.0, 1.0); }
    else if (an.x > an.z) { q = vMsW.zy; Tu = vec3(0.0, 0.0, 1.0); Tv = vec3(0.0, 1.0, 0.0); }
    else { q = vMsW.xy; Tu = vec3(1.0, 0.0, 0.0); Tv = vec3(0.0, 1.0, 0.0); }`;
// cylindrical: blocks wrap round a vertical axis through the object's origin (towers, drums)
export const PLANE_CYL = /* glsl */ `
    { float ca = atan(vMsL.z, vMsL.x); q = vec2(ca * uMsR, vMsL.y); Tu = vec3(-sin(ca), 0.0, cos(ca)); Tv = vec3(0.0, 1.0, 0.0);
      if (an.y > 0.85) { q = vMsW.xz; Tu = vec3(1.0, 0.0, 0.0); Tv = vec3(0.0, 0.0, 1.0); } }`;
const MS_COLOR = (plane) => /* glsl */ `
  {
    vec3 an = abs(vMsN); vec2 q; vec3 Tu, Tv;
    ${plane}
    float fw = length(fwidth(q));
    float e = max(0.003, fw * 0.5);
    vec4 c1, c2;
    float h0 = msHeight(q, msC);
    float hu = msHeight(q + vec2(e, 0.0), c1), hv = msHeight(q + vec2(0.0, e), c2);
    float fade = 1.0 - smoothstep(0.02, 0.09, fw);
    msGrad = ((hu - h0) * Tu + (hv - h0) * Tv) / e * uMs2.x * fade;
    float gl = length(msGrad); if (gl > 1.2) msGrad *= 1.2 / gl;
    // colour: two stones drifting over the wall (world space, broad), per-block tone, streaks, grime, joints
    vec3 W = vMsW;
    float mac = snoise(W * uMs3.x) * 0.55 + snoise(W * uMs3.x * 3.1 + 7.0) * 0.3 + snoise(W * uMs3.x * 9.0 + 3.0) * 0.15;
    float pick = smoothstep(0.2, 0.8, 0.5 + 0.55 * mac + (msC.z - 0.5) * 0.3);
    vec3 col = mix(uMsA, uMsB, pick);
    col *= 1.0 + (msC.y - 0.5) * uMs2.z;
    col *= 1.0 + 0.06 * snoise(vec3(q * 2.3, msC.w * 5.0));
    float vert = 1.0 - smoothstep(0.5, 0.8, an.y);
    float st = smoothstep(0.1, 0.8, snoise(vec3(W.x * 2.6 + W.z * 2.6, W.y * 0.22, msC.y)));
    col *= 1.0 - uMs3.y * st * vert * 0.35;
    float gnd = 1.0 - smoothstep(uMs4.x, uMs4.x + 1.1 + 0.4 * snoise(W * 1.3), W.y);
    col = mix(col, col * vec3(0.62, 0.57, 0.52), gnd * uMs3.z);
    float jw = max(uMs2.y, fw * 0.6);
    msJoint = uMs2.w < 0.5 ? 0.0 : 1.0 - smoothstep(jw * 0.4, jw, msC.x);
    float chipDark = smoothstep(0.0, -0.01, h0 - 0.004) * 0.25;
    col = mix(col, uMsM, msJoint * 0.7) * (1.0 - chipDark * fade);
    diffuseColor.rgb *= col;
  }`;

export function masonry(m, o = {}) {
  const u = {
    uMs1: { value: new THREE.Vector4(o.course ?? 0.52, o.block ?? 0.95, o.split ?? 0.45, o.bevel ?? 0.025) },
    uMs2: { value: new THREE.Vector4(o.relief ?? 1, o.joint ?? 0.012, o.tone ?? 0.22, o.mode ?? 1) },
    uMs3: { value: new THREE.Vector4(o.macro ?? 0.18, o.streak ?? 1, o.grime ?? 0.8, o.chips ?? 1) },
    uMs4: { value: new THREE.Vector4(o.ground ?? 0, o.grain ?? 0.0012, o.rough ?? 0.86, o.roughJoint ?? 1) },
    uMsA: { value: new THREE.Color(...(o.colA ?? [0.6, 0.36, 0.22])) },
    uMsB: { value: new THREE.Color(...(o.colB ?? [0.72, 0.55, 0.38])) },
    uMsM: { value: new THREE.Color(...(o.colM ?? [0.2, 0.14, 0.1])) },
    uMsR: { value: o.cylR ?? 7 },
    ...(o.uniforms ?? {}),
  };
  m.color?.set('#ffffff');
  m.userData.noAntiTile = true;
  m.userData.ms = u;
  const tag = o.tag ?? 'ms';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${MS_VERT_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${MS_VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\n${MS_FRAG_PARS}\n${o.pars ?? ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MS_COLOR(o.plane ?? PLANE_BOX)}\n${o.color ?? ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(uMs4.z * (0.92 + 0.16 * msC.y), uMs4.w, msJoint);
        ${o.rough ?? ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          nW = normalize(nW - msGrad);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'mms-' + tag;
  return m;
}

// ---------------------------------------------------------------------------------------------------------
// carved bands: canvas rows 0..H/2 = calligraphy (raised letters on a recessed, scrolled ground),
// rows H/2..H = a running floral scroll with a bead border. Brightness = height (map + bump).
// With flipY the calligraphy band sits at v ∈ [0.5, 1], the floral band at v ∈ [0, 0.5].
export function carvingTexture(W = 4096, seed = 3) {
  const H = W / 8, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(seed), h2 = H / 2;
  const k = H / 512;
  const LOW = '#5a5a5a', MID = '#9a9a9a', HIGH = '#f0f0f0';
  g.fillStyle = LOW; g.fillRect(0, 0, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // --- band A: calligraphy
  const fillet = (y, w) => { g.fillStyle = HIGH; g.fillRect(0, y, W, w); g.fillStyle = '#7a7a7a'; g.fillRect(0, y + w, W, 2 * k); };
  fillet(4 * k, 14 * k); fillet(h2 - 20 * k, 14 * k);
  // ground: a faint scroll behind the letters (lower relief)
  g.strokeStyle = '#767676'; g.lineWidth = 4 * k;
  for (let x = 0; x < W; x += 60 * k) { g.beginPath(); g.arc(x, h2 * 0.42, 22 * k, 0, TAU * 0.8); g.stroke(); }
  const base = h2 * 0.72;
  g.strokeStyle = HIGH; g.fillStyle = HIGH;
  for (let x = 30 * k; x < W - 60 * k;) {
    const word = 3 + Math.floor(r() * 5);
    g.lineWidth = (9 + r() * 3) * k;
    g.beginPath(); g.moveTo(x, base);
    let xx = x;
    for (let i = 0; i < word; i++) {
      const kind = r(), w = (18 + r() * 22) * k;
      if (kind < 0.38) {                     // tall upright (alif / lam)
        g.lineTo(xx, base); g.moveTo(xx, base); g.lineTo(xx + 2 * k, base - (110 + r() * 60) * k); g.moveTo(xx, base);
        if (r() < 0.4) { g.moveTo(xx + 2 * k, base - (110 + r() * 40) * k); g.lineTo(xx + 14 * k, base - (128 + r() * 30) * k); g.moveTo(xx, base); }
      } else if (kind < 0.6) {               // bowl below the line
        g.quadraticCurveTo(xx + w * 0.5, base + (46 + r() * 20) * k, xx + w, base - 6 * k);
      } else if (kind < 0.8) {               // loop (waw / mim)
        g.lineTo(xx + w * 0.3, base); g.moveTo(xx + w * 0.55 + 12 * k, base - 12 * k);
        g.arc(xx + w * 0.55, base - 12 * k, 12 * k, 0, TAU); g.moveTo(xx + w * 0.55, base);
      } else {                               // tooth strokes
        for (let j = 0; j < 3; j++) { const tx = xx + w * (j + 0.5) / 3; g.lineTo(tx, base); g.lineTo(tx, base - 24 * k); g.moveTo(tx, base); }
      }
      xx += w; g.lineTo(xx, base);
    }
    g.stroke();
    // dots and small vowel marks
    for (let j = 0; j < word; j++) { if (r() < 0.6) { g.beginPath(); g.arc(x + r() * (xx - x), base + (r() < 0.5 ? 32 : -60 - r() * 40) * k, 5 * k, 0, TAU); g.fill(); } }
    // a rosette filling the gap above long words
    if (r() < 0.5) { const cx = x + (xx - x) * 0.5, cy = h2 * 0.3; for (let p = 0; p < 6; p++) { g.beginPath(); g.ellipse(cx + Math.cos(p * TAU / 6) * 9 * k, cy + Math.sin(p * TAU / 6) * 9 * k, 6 * k, 3.5 * k, p * TAU / 6, 0, TAU); g.fill(); } }
    x = xx + (14 + r() * 26) * k;
  }
  // --- band B: floral scroll
  const y0 = h2;
  g.fillStyle = LOW; g.fillRect(0, y0, W, h2);
  fillet(y0 + 6 * k, 10 * k); fillet(y0 + h2 - 18 * k, 10 * k);
  g.fillStyle = HIGH;
  for (let x = 8 * k; x < W; x += 22 * k) { g.beginPath(); g.arc(x, y0 + 30 * k, 6 * k, 0, TAU); g.fill(); g.beginPath(); g.arc(x + 11 * k, y0 + h2 - 30 * k, 6 * k, 0, TAU); g.fill(); }
  const mid = y0 + h2 / 2, amp = 52 * k, per = 200 * k;
  g.strokeStyle = HIGH; g.lineWidth = 10 * k; g.beginPath();
  for (let x = 0; x <= W; x += 4) { const y = mid + Math.sin(x / per * TAU) * amp; x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
  for (let i = 0, x = per / 4; x < W; x += per / 2, i++) {
    const up = i % 2 === 0, cy = mid + (up ? -1 : 1) * amp, sy = up ? 1 : -1;
    // tendril spiral off the stem
    g.lineWidth = 6 * k; g.beginPath();
    for (let a = 0; a < 2.6 * Math.PI; a += 0.15) { const rr = 40 * k * (1 - a / (2.8 * Math.PI)); const px = x + per * 0.2 + Math.cos(a) * rr, py = mid + sy * (amp * 0.15) + Math.sin(a) * rr * sy; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.stroke();
    // lotus / leaf at the crest
    g.fillStyle = HIGH;
    for (let p = -2; p <= 2; p++) { g.beginPath(); g.ellipse(x + p * 9 * k, cy + sy * 6 * k - Math.abs(p) * sy * -4 * k, 6 * k, 22 * k, p * 0.35, 0, TAU); g.fill(); }
    g.fillStyle = MID; g.beginPath(); g.arc(x, cy + sy * 18 * k, 8 * k, 0, TAU); g.fill();
    g.fillStyle = HIGH;
  }
  // soften: carving reads as rounded relief, not a cut-out
  const c2 = mkCanvas(W, H), g2 = c2.getContext('2d');
  g2.filter = `blur(${1.6 * k}px)`; g2.drawImage(c, 0, 0);
  const t = toTexture(c2, { repeat: true, srgb: false });
  t.anisotropy = 8;
  return t;
}

// a ribbon of thickness `proud` along a 2D centreline (x, y) at z, width w; UVs: u = length / tile, v ∈ [v0, v1]
export function ribbon(pts, w, z, proud, { tile = 7.2, v0 = 0.5, v1 = 1, u0 = 0 } = {}) {
  const n = pts.length, pos = [], uv = [], idx = [];
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const off = [];
  const segN = (a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
  for (let i = 0; i < n; i++) {
    const n1 = segN(pts[Math.max(0, i - 1)], pts[Math.max(1, i)]), n2 = segN(pts[Math.min(n - 2, i)], pts[Math.min(n - 1, i + 1)]);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const s = 1 / Math.max(0.35, mx * n1[0] + my * n1[1]);      // mitred corners keep the band's width
    off.push([mx * s * w / 2, my * s * w / 2]);
  }
  // front face (z + proud), then the two edge walls back to z
  const push = (x, y, zz, uu, vv) => { pos.push(x, y, zz); uv.push(uu, vv); };
  const ring = (side, zz, vv) => { for (let i = 0; i < n; i++) push(pts[i].x + side * off[i][0], pts[i].y + side * off[i][1], zz, u0 + L[i] / tile, vv); };
  ring(1, z + proud, v1); ring(-1, z + proud, v0);           // 0: front A, n: front B
  ring(1, z, v1); ring(1, z + proud, v1);                    // 2n: edge A
  ring(-1, z + proud, v0); ring(-1, z, v0);                  // 4n: edge B
  const quad = (A, B) => { for (let i = 0; i < n - 1; i++) { const a = A + i, b = B + i; idx.push(a, b, a + 1, a + 1, b, b + 1); } };
  quad(0, n); quad(2 * n, 3 * n); quad(4 * n, 5 * n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  // keep the winding facing +z for the front face
  const p = ng.attributes.position, nrm = ng.attributes.normal;
  let flip = false;
  for (let i = 0; i < 3; i++) if (nrm.getZ(i) < 0) flip = true;
  if (flip) { for (let i = 0; i < p.count; i += 3) { for (const a of [p, ng.attributes.uv]) { const s = a.itemSize; for (let k = 0; k < s; k++) { const t = a.getComponent(i + 1, k); a.setComponent(i + 1, k, a.getComponent(i + 2, k)); a.setComponent(i + 2, k, t); } } } ng.computeVertexNormals(); }
  return ng;
}

// faint lines of an early-Brahmi-like script, black on white (1 = plain iron, 0 = engraved)
export function inscriptionTexture(W = 1024, seed = 11) {
  const H = W * 0.75, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(seed), k = W / 1024;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#000000'; g.lineCap = 'round'; g.lineWidth = 7 * k;
  const lines = 6, lh = H / (lines + 0.6);
  for (let l = 0; l < lines; l++) {
    const y = lh * (l + 0.8);
    for (let x = 30 * k; x < W - 40 * k;) {
      const s = (24 + r() * 8) * k, kind = Math.floor(r() * 7);
      g.beginPath();
      if (kind === 0) { g.moveTo(x, y - s); g.lineTo(x, y + s * 0.4); g.moveTo(x - s * 0.5, y - s); g.lineTo(x + s * 0.5, y - s); }
      else if (kind === 1) { g.arc(x, y - s * 0.3, s * 0.5, 0, TAU); }
      else if (kind === 2) { g.moveTo(x - s * 0.5, y + s * 0.4); g.lineTo(x, y - s); g.lineTo(x + s * 0.5, y + s * 0.4); }
      else if (kind === 3) { g.moveTo(x - s * 0.5, y - s); g.lineTo(x - s * 0.5, y + s * 0.4); g.lineTo(x + s * 0.5, y + s * 0.4); g.lineTo(x + s * 0.5, y - s); }
      else if (kind === 4) { g.moveTo(x - s * 0.5, y - s); g.lineTo(x + s * 0.5, y - s); g.moveTo(x, y - s); g.quadraticCurveTo(x + s, y, x - s * 0.4, y + s * 0.4); }
      else if (kind === 5) { g.moveTo(x, y - s); g.lineTo(x, y + s * 0.4); g.moveTo(x, y - s * 0.3); g.lineTo(x + s * 0.5, y - s * 0.3); }
      else { g.arc(x, y, s * 0.45, Math.PI, TAU); g.moveTo(x - s * 0.45, y); g.lineTo(x - s * 0.45, y + s * 0.4); }
      if (r() < 0.35) { g.moveTo(x + s * 0.2, y - s); g.lineTo(x + s * 0.5, y - s * 1.35); }
      g.stroke();
      x += s * (1.35 + r() * 0.5) + (r() < 0.12 ? 20 * k : 0);
    }
  }
  return toTexture(c, { srgb: false });
}
