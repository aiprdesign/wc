// THE MOONSHOT — build-time assets: planet shaders, Apollo hardware built from primitives,
// procedural lunar terrain, canvas textures (foil, flag, regolith, bootprint) and a
// seven-segment "DSKY" digit system shared by the HUD and the 3D guidance computer.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, fbm2, noise2, noise4 } from '../lib/noise.js';
import { rng, TAU } from '../lib/math.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { TextPlane, FONTS } from '../lib/text.js';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ planets
export const PLANET_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

// Procedural Earth: oceans, continents, ice, clouds, specular glint, terminator glow, city lights.
export const EARTH_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform vec3 uSun; uniform float uTime, uGain;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
void main(){
  vec3 p = normalize(vL);
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW), L = normalize(uSun);
  float c = fbm(p * 1.35 + vec3(3.1, 0.0, 1.7)) + 0.12 * snoise(p * 7.0);
  float land = smoothstep(0.0, 0.03, c);
  float coast = smoothstep(-0.05, 0.0, c) * (1.0 - land);
  float lat = abs(p.y);
  float ice = smoothstep(0.8, 0.9, lat + 0.06 * snoise(p * 9.0));
  float arid = smoothstep(0.0, 0.5, snoise(p * 2.2 + 5.0)) * (1.0 - smoothstep(0.2, 0.55, lat));
  vec3 ocean = mix(vec3(0.004, 0.02, 0.06), vec3(0.01, 0.055, 0.095), coast);
  vec3 ground = mix(vec3(0.05, 0.075, 0.035), vec3(0.2, 0.15, 0.085), arid);
  ground *= 0.8 + 0.4 * snoise(p * 18.0);
  vec3 surf = mix(ocean, ground, land);
  surf = mix(surf, vec3(0.75, 0.8, 0.85), ice);
  vec3 cp = p * vec3(3.2, 7.0, 3.2) + vec3(uTime * 0.02, 0.0, 0.0);
  float cl = smoothstep(0.12, 0.75, fbm(cp) * 0.75 + 0.3 * snoise(p * 16.0) * snoise(p * 3.0 + 7.0)) * 0.85;
  float ndl = dot(N, L);
  float day = smoothstep(-0.08, 0.25, ndl);
  vec3 col = surf * day * 1.8;
  col = mix(col, vec3(0.82, 0.86, 0.92) * day * 1.1, cl * 0.8);
  vec3 H = normalize(L + V);
  col += vec3(1.0, 0.9, 0.75) * pow(max(dot(N, H), 0.0), 220.0) * (1.0 - land) * (1.0 - cl) * day * 0.8;
  col += vec3(1.0, 0.42, 0.16) * exp(-pow(ndl / 0.1, 2.0)) * 0.1 * (1.0 - cl * 0.5);
  vec3 q = p * 150.0; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
  float h = hash3(cell);
  float cluster = smoothstep(0.0, 0.35, snoise(p * 5.0 + 2.0)) * land * (1.0 - ice);
  float dotm = smoothstep(0.3, 0.05, length(f)) * step(0.72 - cluster * 0.35, h) * cluster;
  float night = 1.0 - smoothstep(-0.2, 0.05, ndl);
  col += vec3(1.0, 0.62, 0.3) * dotm * night * (1.0 - cl * 0.8) * 2.5;
  float rim = 1.0 - max(dot(N, V), 0.0);
  col = mix(col, vec3(0.25, 0.5, 1.0) * day * 0.9, pow(rim, 3.0) * 0.8);
  gl_FragColor = vec4(col * uGain, 1.0);
}`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uSun; uniform float uPower, uIntensity; uniform vec3 uColor;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
void main(){
  vec3 N = normalize(vN), V = normalize(cameraPosition - vW);
  float f = pow(1.0 - abs(dot(N, V)), uPower);
  float day = smoothstep(-0.3, 0.4, dot(N, normalize(uSun)));
  gl_FragColor = vec4(uColor * uIntensity * (0.08 + day), f * (0.05 + day));
}`;

// Procedural Moon: three octaves of 3D-Voronoi craters (bowl + raised rim), maria albedo,
// bump-mapped with screen-space derivatives, hard terminator.
export const MOON_FRAG = /* glsl */ `
${GLSL_NOISE}
uniform vec3 uSun; uniform float uBump, uGain;
varying vec3 vN; varying vec3 vW; varying vec3 vL;
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec2 craters(vec3 p){
  vec3 i = floor(p), f = fract(p); float h = 0.0, a = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash33(i + g);
    vec3 r = g + 0.15 + o * 0.7 - f; float rad = 0.12 + 0.32 * o.x * o.x; float q = length(r) / rad;
    if (q < 1.8) {
      float bowl = q < 1.0 ? (q * q - 1.0) : 0.0;
      float rim = exp(-pow((q - 1.0) / 0.22, 2.0));
      h += (bowl * 0.7 + rim * 0.3) * rad;
      a += (rim * 0.5 + max(0.0, 1.0 - q) * 0.15) * step(0.8, o.y);   // fresh bright craters
    }
  }
  return vec2(h, a);
}
void main(){
  vec3 p = normalize(vL);
  vec2 c1 = craters(p * 3.0), c2 = craters(p * 8.0 + 3.1), c3 = craters(p * 21.0 + 7.7);
  float h = c1.x * 0.6 + c2.x * 0.28 + c3.x * 0.12 + snoise(p * 40.0) * 0.006;
  float maria = smoothstep(0.05, 0.3, snoise(p * 1.3 + 2.0) * 0.7 + snoise(p * 3.1) * 0.3);
  float alb = mix(0.62, 0.36, maria) * (0.9 + 0.2 * snoise(p * 12.0)) + (c1.y + c2.y * 0.6 + c3.y * 0.3) * 0.18;
  vec3 N = normalize(vN);
  vec3 dpdx = dFdx(vW), dpdy = dFdy(vW);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 R1 = cross(dpdy, N), R2 = cross(N, dpdx); float det = dot(dpdx, R1);
  vec3 grad = sign(det) * (dhx * R1 + dhy * R2);
  N = normalize(abs(det) * N - grad * uBump);
  vec3 L = normalize(uSun);
  float ndl = max(dot(N, L), 0.0);
  float body = smoothstep(-0.02, 0.06, dot(normalize(vN), L));
  vec3 col = vec3(0.96, 0.95, 0.93) * alb * pow(ndl, 0.85) * body * 2.4;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

export function earthMesh(radius, sun, { segs = 128 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uTime: { value: 0 }, uGain: { value: 1 } }, vertexShader: PLANET_VERT, fragmentShader: EARTH_FRAG });
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, segs, Math.round(segs * 0.66)), mat);
  const atmo = (r, power, inten, col, side) => new THREE.Mesh(new THREE.SphereGeometry(radius * r, 96, 64), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun }, uPower: { value: power }, uIntensity: { value: inten }, uColor: { value: new THREE.Color(col) } },
    vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
  }));
  g.add(body, atmo(1.012, 2.6, 1.5, '#5f9cff', THREE.FrontSide), atmo(1.05, 4.5, 1.2, '#4a8cff', THREE.BackSide));
  g.userData.body = body; g.userData.mat = mat;
  return g;
}

export function moonMesh(radius, sun) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uBump: { value: radius * 0.9 }, uGain: { value: 1 } }, vertexShader: PLANET_VERT, fragmentShader: MOON_FRAG });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 160, 110), mat);
}

// ------------------------------------------------------------------ canvas textures
export function crinkleTexture(seed = 3, size = 512) {
  const r = rng(seed), c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = r() * size, y = r() * size, s = 10 + r() * 60, l = Math.floor(90 + r() * 90);
    g.fillStyle = `rgba(${l},${l},${l},0.35)`;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) g.lineTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
    g.closePath(); g.fill();
  }
  for (let i = 0; i < 500; i++) {
    const x = r() * size, y = r() * size, a = r() * TAU, s = 8 + r() * 50, l = r() > 0.5 ? 230 : 30;
    g.strokeStyle = `rgba(${l},${l},${l},${0.15 + r() * 0.3})`; g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s); g.stroke();
  }
  return toTexture(c, { srgb: false, repeat: true });
}

// Ascent-stage skin: light grey panels, black thermal paint and panel seams.
export function panelTexture(seed = 5, size = 512) {
  const r = rng(seed), c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#b8bbbf'; g.fillRect(0, 0, size, size);
  const cells = 8, s = size / cells;
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) {
    const v = r();
    g.fillStyle = v < 0.22 ? '#2a2b2e' : v < 0.5 ? '#c9cbce' : v < 0.7 ? '#a8abb0' : '#bfc1c4';
    g.fillRect(x * s, y * s, s, s);
  }
  g.strokeStyle = 'rgba(40,40,44,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= cells; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, size); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(size, i * s); g.stroke(); }
  g.fillStyle = 'rgba(30,30,30,0.6)';
  for (let i = 0; i < 260; i++) { g.beginPath(); g.arc(r() * size, r() * size, 1.2, 0, TAU); g.fill(); }
  return toTexture(c, { repeat: true });
}

// Service-module skin: polished aluminium with radiator stripes.
export function smTexture(size = 512) {
  const c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#d7dade'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 64; i++) { const x = (i / 64) * size; g.fillStyle = i % 2 ? '#eef0f2' : '#bfc3c8'; g.fillRect(x, 0, size / 64 * 0.6, size); }
  g.fillStyle = '#9aa0a6'; for (let y = 0; y < 6; y++) g.fillRect(0, y * size / 6, size, 2);
  g.fillStyle = '#e4e6e8'; g.fillRect(0, size * 0.42, size, size * 0.16);
  return toTexture(c, { repeat: true });
}

// Stars and stripes (50 stars, 13 stripes), cloth-like shading baked in lightly.
export function flagTexture(w = 1024, h = 540) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  const sh = h / 13;
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f2eee6' : '#b3223a'; g.fillRect(0, i * sh, w, Math.ceil(sh)); }
  const cw = w * 0.4, ch = sh * 7;
  g.fillStyle = '#243668'; g.fillRect(0, 0, cw, ch);
  g.fillStyle = '#f4f1ea';
  const star = (x, y, R) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? R * 0.382 : R; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
  for (let row = 0; row < 9; row++) {
    const n = row % 2 ? 5 : 6;
    for (let k = 0; k < n; k++) {
      const x = cw * ((row % 2 ? 2 : 1) + k * 2) / 12, y = ch * (row + 1) / 10;
      star(x, y, ch * 0.042);
    }
  }
  return toTexture(c);
}

// Tileable regolith: albedo (sRGB) + height (bump), built from 4D-torus noise + craterlets + pebbles.
export function regolithTextures(size = 512, seed = 9) {
  const r = rng(seed);
  const H = new Float32Array(size * size);
  const R4 = 0.9;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = (x / size) * TAU, b = (y / size) * TAU;
    let s = 0, amp = 1, f = 1;
    for (let o = 0; o < 4; o++) { s += amp * noise4(Math.cos(a) * R4 * f, Math.sin(a) * R4 * f, Math.cos(b) * R4 * f + 7, Math.sin(b) * R4 * f + 3); amp *= 0.5; f *= 2.1; }
    H[y * size + x] = s * 0.35;
  }
  // craterlets (wrapped so the tile stays seamless)
  for (let i = 0; i < 220; i++) {
    const cx = r() * size, cy = r() * size, rad = 2 + Math.pow(r(), 3) * 26, depth = 0.25 + r() * 0.35;
    const R2 = rad * 1.8;
    for (let dy = -R2; dy <= R2; dy++) for (let dx = -R2; dx <= R2; dx++) {
      const q = Math.hypot(dx, dy) / rad; if (q > 1.8) continue;
      const bowl = q < 1 ? q * q - 1 : 0, rim = Math.exp(-(((q - 1) / 0.25) ** 2));
      const X = ((Math.round(cx + dx) % size) + size) % size, Y = ((Math.round(cy + dy) % size) + size) % size;
      H[Y * size + X] += (bowl * 0.7 + rim * 0.3) * depth;
    }
  }
  // pebbles
  const peb = new Float32Array(size * size);
  for (let i = 0; i < 1600; i++) {
    const cx = r() * size, cy = r() * size, rad = 0.8 + r() * 2.2;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const q = Math.hypot(dx, dy) / rad; if (q > 1) continue;
      const X = ((Math.round(cx + dx) % size) + size) % size, Y = ((Math.round(cy + dy) % size) + size) % size;
      H[Y * size + X] += Math.sqrt(1 - q * q) * 0.35; peb[Y * size + X] = 1;
    }
  }
  const ca = mkCanvas(size), cb = mkCanvas(size);
  const ia = ca.getContext('2d').createImageData(size, size), ib = cb.getContext('2d').createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const h = H[i];
    const hv = Math.max(0, Math.min(255, 128 + h * 150));
    const al = Math.max(0, Math.min(255, 150 + h * 40 + peb[i] * 30 + (r() - 0.5) * 22));
    ia.data[i * 4] = al; ia.data[i * 4 + 1] = al * 0.985; ia.data[i * 4 + 2] = al * 0.955; ia.data[i * 4 + 3] = 255;
    ib.data[i * 4] = ib.data[i * 4 + 1] = ib.data[i * 4 + 2] = hv; ib.data[i * 4 + 3] = 255;
  }
  ca.getContext('2d').putImageData(ia, 0, 0); cb.getContext('2d').putImageData(ib, 0, 0);
  return { albedo: toTexture(ca, { repeat: true }), bump: toTexture(cb, { srgb: false, repeat: true }) };
}

// Apollo overshoe print. R = depth (sole + transverse tread bars), G = displaced rim around it.
// Canvas maps to 0.22 m (x) × 0.44 m (y); toe at the top (v = 1).
export function bootprintTexture(w = 256, h = 512) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const sole = new Path2D();
  sole.moveTo(w * 0.14, h * 0.34);
  sole.bezierCurveTo(w * 0.12, h * 0.08, w * 0.88, h * 0.08, w * 0.86, h * 0.34);
  sole.bezierCurveTo(w * 0.85, h * 0.55, w * 0.74, h * 0.62, w * 0.76, h * 0.8);
  sole.bezierCurveTo(w * 0.78, h * 0.96, w * 0.22, h * 0.96, w * 0.24, h * 0.8);
  sole.bezierCurveTo(w * 0.26, h * 0.62, w * 0.15, h * 0.55, w * 0.14, h * 0.34);
  sole.closePath();
  g.globalCompositeOperation = 'lighter';
  // rim: soft ring just outside the outline
  g.filter = 'blur(9px)'; g.strokeStyle = 'rgb(0,200,0)'; g.lineWidth = 26; g.stroke(sole); g.filter = 'none';
  // depth
  const d = mkCanvas(w, h), dg = d.getContext('2d');
  dg.save(); dg.clip(sole);
  dg.fillStyle = 'rgb(170,0,0)'; dg.fillRect(0, 0, w, h);
  dg.fillStyle = 'rgb(255,0,0)';
  for (let i = 0; i < 20; i++) { const y = h * 0.12 + i * h * 0.04; dg.fillRect(0, y, w, h * 0.019); }
  dg.restore();
  g.filter = 'blur(1.2px)'; g.drawImage(d, 0, 0); g.filter = 'none';
  // cut the rim where the sole is
  const out = mkCanvas(w, h), og = out.getContext('2d');
  og.drawImage(c, 0, 0);
  const id = og.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) { const r = id.data[i * 4]; id.data[i * 4 + 1] = Math.round(id.data[i * 4 + 1] * Math.max(0, 1 - r / 90)); }
  og.putImageData(id, 0, 0);
  const t = toTexture(out, { srgb: false });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------ lunar terrain (CPU heightfield)
export function makeTerrainField(seed = 21, { RM = 900 } = {}) {
  const r = rng(seed);
  const craters = [];
  const clear = (x, z, R) => {
    if (Math.hypot(x, z) < 11 + R * 1.6) return false;                         // landing site
    if (Math.abs(x) < 7 + R * 1.5 && z > 0 && z < 70) return false;            // earthrise sight-line corridor
    return true;
  };
  let tries = 0;
  while (craters.length < 170 && tries++ < 5000) {
    const R = 1.2 + Math.pow(r(), 3.2) * 30;
    const x = (r() - 0.5) * 360, z = (r() - 0.5) * 360;
    if (!clear(x, z, R)) continue;
    craters.push({ x, z, R, d: R * (0.22 + r() * 0.14) });
  }
  // a few intimate small craters near the site for the descent composition
  [[-14, -6, 3.2], [9, -13, 2.2], [-8, 16, 1.6], [15, 8, 2.6], [-20, 4, 5.5], [24, -18, 7.5], [-30, -30, 11]].forEach(([x, z, R]) => craters.push({ x, z, R, d: R * 0.3 }));
  const profile = (q) => {
    const bowl = q < 1 ? q * q - 1 : 0;
    const rim = Math.exp(-(((q - 1) / 0.24) ** 2));
    const ejecta = q > 1 ? 0.12 * Math.exp(-(q - 1) * 2.2) : 0;
    return bowl * 0.85 + rim * 0.32 + ejecta;
  };
  const height = (x, z) => {
    let h = fbm2(x * 0.011 + 3.3, z * 0.011 - 1.7, 4) * 2.6 + fbm2(x * 0.07 + 5, z * 0.07, 3) * 0.3;
    for (let i = 0; i < craters.length; i++) {
      const c = craters[i], dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, lim = c.R * 2.4;
      if (d2 > lim * lim) continue;
      h += c.d * profile(Math.sqrt(d2) / c.R);
    }
    return h;
  };
  const h0 = height(0, 0);
  // flatten the landing site; curvature (exaggerated small moon) makes a close, rounded horizon
  const field = (x, z) => {
    const d = Math.hypot(x, z);
    const flat = Math.exp(-((d / 9) ** 2));
    let h = height(x, z) * (1 - flat * 0.85) + h0 * flat * 0.85 - h0;
    h -= (d * d) / (2 * RM);
    return h;
  };
  return { field, craters };
}

// Plane with a denser grid near the origin (u → sign(u)|u|^k), displaced by `field`.
export function terrainGeometry(field, { size = 180, segs = 300, k = 1.55, uvScale = 1 / 6, skip = null } = {}) {
  const n = segs + 1, pos = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const idx = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / segs) * 2 - 1, v = (j / segs) * 2 - 1;
    const x = Math.sign(u) * Math.pow(Math.abs(u), k) * size, z = Math.sign(v) * Math.pow(Math.abs(v), k) * size;
    let y = field(x, z);
    if (skip && skip(x, z)) y -= 0.02;
    const o = j * n + i;
    pos.set([x, y, z], o * 3); uv.set([x * uvScale, z * uvScale], o * 2);
  }
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ Apollo hardware (metres)
const strut = (a, b, r, mat, seg = 8) => {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
};

export function apolloMaterials() {
  const crinkle = crinkleTexture();
  const panel = panelTexture();
  return {
    gold: new THREE.MeshStandardMaterial({ color: '#e3ad52', metalness: 1, roughness: 0.3, bumpMap: crinkle, bumpScale: 3, envMapIntensity: 0.55 }),
    goldDark: new THREE.MeshStandardMaterial({ color: '#b07a2c', metalness: 1, roughness: 0.4, bumpMap: crinkle, bumpScale: 2.5, envMapIntensity: 0.5 }),
    silverFoil: new THREE.MeshStandardMaterial({ color: '#d6d9dd', metalness: 1, roughness: 0.25, bumpMap: crinkle, bumpScale: 2, envMapIntensity: 0.6 }),
    blackFoil: new THREE.MeshStandardMaterial({ color: '#1b1b1d', metalness: 0.4, roughness: 0.55, bumpMap: crinkle, bumpScale: 2, envMapIntensity: 0.4 }),
    skin: new THREE.MeshStandardMaterial({ map: panel, metalness: 0.45, roughness: 0.42, envMapIntensity: 0.55 }),
    dark: new THREE.MeshStandardMaterial({ color: '#35363a', metalness: 0.85, roughness: 0.35, envMapIntensity: 0.6 }),
    bell: new THREE.MeshStandardMaterial({ color: '#4a4640', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#e8e8e4', metalness: 0.1, roughness: 0.6, envMapIntensity: 0.5 }),
    sm: new THREE.MeshStandardMaterial({ map: smTexture(), metalness: 1, roughness: 0.22, envMapIntensity: 0.9 }),
    cm: new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 1, roughness: 0.12, envMapIntensity: 1.0 }),
    window: new THREE.MeshStandardMaterial({ color: '#07090b', metalness: 0.3, roughness: 0.06, emissive: new THREE.Color('#a8f0c0'), emissiveIntensity: 0.25, envMapIntensity: 1.2 }),
  };
}

// Lunar Module. Origin at the footpad contact plane; front (windows, hatch, ladder) faces +Z.
export function buildLM(M, { folded = false } = {}) {
  const lm = new THREE.Group();
  const add = (m, parent = lm) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  // descent stage: octagonal box, gold foil with black/silver panels
  const DS_Y = 1.55, DS_H = 1.65, DS_R = 2.15;
  const ds = add(new THREE.Mesh(new THREE.CylinderGeometry(DS_R, DS_R, DS_H, 8, 1), M.gold));
  ds.rotation.y = Math.PI / 8; ds.position.y = DS_Y + DS_H / 2;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, pnl = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, DS_H * 0.82, 0.05), k % 2 ? M.blackFoil : M.silverFoil));
    const rr = DS_R * Math.cos(Math.PI / 8) + 0.01;
    pnl.position.set(Math.sin(a) * rr, DS_Y + DS_H / 2, Math.cos(a) * rr); pnl.rotation.y = a;
  }
  // descent engine
  const bellPts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; bellPts.push(new THREE.Vector2(0.32 + 0.5 * Math.pow(u, 1.4), -u * 1.05)); }
  const bell = add(new THREE.Mesh(new THREE.LatheGeometry(bellPts, 32), M.bell));
  bell.position.y = DS_Y + 0.05;
  // legs
  const legs = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
    const top = V3(s * 1.95, DS_Y + DS_H * 0.8, c * 1.95);
    const foot = folded ? V3(s * 2.6, DS_Y + 0.2, c * 2.6) : V3(s * 4.2, 0.28, c * 4.2);
    const lowA = V3(s * 1.6 + c * 0.9, DS_Y + 0.1, c * 1.6 - s * 0.9), lowB = V3(s * 1.6 - c * 0.9, DS_Y + 0.1, c * 1.6 + s * 0.9);
    const mid = top.clone().lerp(foot, 0.62);
    add(strut(top, foot, 0.09, M.gold));
    add(strut(lowA, mid, 0.04, M.silverFoil));
    add(strut(lowB, mid, 0.04, M.silverFoil));
    const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.34, 0.16, 24), M.silverFoil));
    pad.position.copy(foot).setY(foot.y - 0.2);
    if (!folded && k !== 0) add(strut(pad.position.clone(), pad.position.clone().add(V3(0, -1.2, 0)).add(V3(s * 0.3, 0, c * 0.3)), 0.012, M.silverFoil, 4)).visible = false;
    legs.push({ top, foot, pad });
  }
  // front porch + ladder on the +Z leg
  if (!folded) {
    const porch = add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.05, 0.8), M.silverFoil));
    porch.position.set(0, DS_Y + DS_H + 0.02, DS_R + 0.3);
    const lt = V3(0, DS_Y + DS_H, DS_R + 0.55), lb = V3(0, 0.55, 3.35);
    [-0.25, 0.25].forEach((dx) => add(strut(lt.clone().setX(dx), lb.clone().setX(dx), 0.025, M.gold, 6)));
    for (let i = 1; i < 9; i++) { const p = lt.clone().lerp(lb, i / 9); add(strut(p.clone().setX(-0.25), p.clone().setX(0.25), 0.018, M.gold, 6)); }
  }
  // ascent stage
  const as = new THREE.Group(); as.position.y = DS_Y + DS_H + 0.05; lm.add(as);
  const shape = new THREE.Shape();
  [[-1.35, -0.9], [1.35, -0.9], [1.35, 0.35], [0.8, 1.15], [-0.8, 1.15], [-1.35, 0.35]].forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const cabG = new THREE.ExtrudeGeometry(shape, { depth: 2.0, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  cabG.rotateX(-Math.PI / 2);
  const cab = add(new THREE.Mesh(cabG, M.skin), as);
  cab.position.y = 0.1;
  // front face upper: two triangular windows angled like the real LM
  const tri = (sx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sx * 0.62, 0, 0, sx * 0.05, 0.62, 0], 3));
    g.setIndex(sx > 0 ? [0, 1, 2] : [0, 2, 1]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.window); m.position.set(sx * 0.1, 1.2, 1.22); m.rotation.x = -0.28; return m;
  };
  const winL = tri(-1), winR = tri(1); as.add(winL, winR);
  const winFrame = (w) => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(w.geometry), new THREE.LineBasicMaterial({ color: '#16171a' })); w.add(e); };
  winFrame(winL); winFrame(winR);
  // hatch
  const hatch = add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.06), M.dark), as); hatch.position.set(0, 0.62, 1.2);
  // docking tunnel + drogue on top
  const tun = add(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.45, 32), M.skin), as); tun.position.set(0, 2.35, -0.05);
  // aft equipment bay
  const aft = add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.3, 1.1), M.blackFoil), as); aft.position.set(0, 1.05, -1.45);
  // side tanks
  [-1, 1].forEach((sx) => { const tk = add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.15, 24), M.skin), as); tk.position.set(sx * 1.45, 0.75, -0.25); });
  // RCS quads on the four corners
  for (const [x, z] of [[-1.5, 0.55], [1.5, 0.55], [-1.5, -1.2], [1.5, -1.2]]) {
    const q = new THREE.Group(); q.position.set(x, 1.85, z); as.add(q);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), M.goldDark), q);
    for (const d of [V3(1, 0, 0), V3(-1, 0, 0), V3(0, 1, 0), V3(0, -1, 0)]) {
      const n = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 10, 1, true), M.bell), q);
      n.position.copy(d).multiplyScalar(0.22); n.quaternion.setFromUnitVectors(V3(0, -1, 0), d);
    }
  }
  // rendezvous radar (front-top) and S-band steerable dish (top-right)
  const rr = add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI * 0.32), M.white), as);
  rr.position.set(0, 2.45, 0.85); rr.rotation.x = -1.1;
  const boom = add(strut(V3(1.0, 2.1, -0.5), V3(1.35, 2.75, -0.7), 0.03, M.silverFoil), as);
  const dish = add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 12, 0, TAU, 0, Math.PI * 0.3), M.white), as);
  dish.position.set(1.35, 2.9, -0.7); dish.rotation.set(-0.5, 0, -0.6);
  [V3(-1.2, 2.1, -1.2), V3(0.6, 2.1, -1.7)].forEach((b) => add(strut(b, b.clone().add(V3(0, 0.7, 0.1)), 0.012, M.silverFoil, 4), as));
  lm.userData = { ascent: as, bell, windows: [winL, winR], legs, bellY: DS_Y - 1.0, winPos: V3(-0.35, as.position.y + 1.42, 1.3) };
  lm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  void boom;
  return lm;
}

// Command + service module. Axis along +Z; CM apex (docking probe) at +Z.
export function buildCSM(M) {
  const g = new THREE.Group();
  const smLen = 7.4, R = 1.96;
  const sm = new THREE.Mesh(new THREE.CylinderGeometry(R, R, smLen, 48), M.sm); sm.rotation.x = Math.PI / 2; g.add(sm);
  const bellPts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; bellPts.push(new THREE.Vector2(0.45 + 0.95 * Math.pow(u, 1.5), -u * 2.9)); }
  const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 40), M.bell); bell.rotation.x = Math.PI / 2; bell.position.z = -smLen / 2 - 0.1; g.add(bell);
  const aftCap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.2, 48), M.dark); aftCap.rotation.x = Math.PI / 2; aftCap.position.z = -smLen / 2; g.add(aftCap);
  const cmPts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(R, 0), new THREE.Vector2(R * 0.98, 0.15), new THREE.Vector2(0.55, 3.25), new THREE.Vector2(0.4, 3.4), new THREE.Vector2(0.001, 3.45)];
  const cm = new THREE.Mesh(new THREE.LatheGeometry(cmPts, 48), M.cm); cm.rotation.x = Math.PI / 2; cm.position.z = smLen / 2 + 0.02; g.add(cm);
  // RCS quads + high-gain antenna
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, q = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), M.silverFoil);
    q.position.set(Math.cos(a) * (R + 0.15), Math.sin(a) * (R + 0.15), 1.6); q.rotation.z = a; g.add(q);
  }
  const hga = new THREE.Group(); hga.position.set(0, -R - 1.6, -3.2); g.add(hga);
  hga.add(strut(V3(0, 1.6, 0), V3(0, 0, 0), 0.05, M.silverFoil));
  for (let k = 0; k < 4; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 8, 0, TAU, 0, Math.PI * 0.3), M.white); d.position.set((k % 2 - 0.5) * 0.9, -0.2, (Math.floor(k / 2) - 0.5) * 0.9); d.rotation.x = Math.PI; hga.add(d); }
  g.userData.length = smLen + 3.45 + 3;
  return g;
}

export function buildFlag(M, flagTex) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 10), M.white); pole.position.y = 1.2; g.add(pole);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.3, 8), M.white); rod.rotation.z = Math.PI / 2; rod.position.set(0.64, 2.3, 0); g.add(rod);
  const cloth = new THREE.PlaneGeometry(1.25, 0.76, 48, 24);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.625, y = p.getY(i);
    // Apollo flag: rigid top rod, loose lower edge with permanent wrinkles (no wind)
    const hang = (0.38 - y) / 0.76;
    const z = Math.sin(x * 9.0 + 0.6) * 0.035 * (0.3 + hang) + Math.sin(x * 23 + y * 4) * 0.012 * hang + Math.sin(x * 4.2) * 0.05 * hang;
    p.setZ(i, z);
  }
  cloth.computeVertexNormals();
  const fm = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 });
  const flag = new THREE.Mesh(cloth, fm); flag.position.set(0.645, 2.3 - 0.38 - 0.01, 0); g.add(flag);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.cloth = flag;
  return g;
}

// ------------------------------------------------------------------ seven-segment digits
// Atlas: 16 cells. R = lit glyph, G = ghost (all segments, as on a real EL display).
export const SEG = { blank: 10, plus: 11, minus: 12 };
export function segAtlas() {
  const CW = 96, CH = 160, c = mkCanvas(CW * 16, CH), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const T = 13, L = 50, M = 12;                 // thickness, segment length, margin
  const x0 = (CW - L - T) / 2, y0 = (CH - 2 * L - T) / 2;
  const hseg = (x, y) => { g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + T / 2 + 2, y - T / 2); g.lineTo(x + L - T / 2 - 2, y - T / 2); g.lineTo(x + L - 2, y); g.lineTo(x + L - T / 2 - 2, y + T / 2); g.lineTo(x + T / 2 + 2, y + T / 2); g.closePath(); g.fill(); };
  const vseg = (x, y) => { g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + T / 2, y + T / 2 + 2); g.lineTo(x + T / 2, y + L - T / 2 - 2); g.lineTo(x, y + L - 2); g.lineTo(x - T / 2, y + L - T / 2 - 2); g.lineTo(x - T / 2, y + T / 2 + 2); g.closePath(); g.fill(); };
  const segs = {
    a: (ox) => hseg(ox + x0 + T / 2, y0 + T / 2), g: (ox) => hseg(ox + x0 + T / 2, y0 + T / 2 + L), d: (ox) => hseg(ox + x0 + T / 2, y0 + T / 2 + 2 * L),
    f: (ox) => vseg(ox + x0 + T / 2, y0 + T / 2), b: (ox) => vseg(ox + x0 + T / 2 + L, y0 + T / 2),
    e: (ox) => vseg(ox + x0 + T / 2, y0 + T / 2 + L), c: (ox) => vseg(ox + x0 + T / 2 + L, y0 + T / 2 + L),
  };
  const MAP = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg', '', 'g', 'g'];
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 13; k++) {
    const ox = k * CW;
    g.fillStyle = 'rgb(0,255,0)';
    if (k === SEG.plus) { segs.g(ox); g.fillRect(ox + x0 + T / 2 + L / 2 - T / 2, y0 + T / 2 + L - L * 0.42, T, L * 0.84); }
    else for (const s of 'abcdefg') segs[s](ox);
    g.fillStyle = 'rgb(255,0,0)';
    for (const s of MAP[k]) segs[s](ox);
    if (k === SEG.plus) g.fillRect(ox + x0 + T / 2 + L / 2 - T / 2, y0 + T / 2 + L - L * 0.42, T, L * 0.84);
  }
  void M;
  const t = toTexture(c, { srgb: false });
  return t;
}

// Instanced digit field. `cells`: [{x, y, h}] in local units. setDigit(i, idx), setColor(i, color, intensity).
export class SegDigits extends THREE.Mesh {
  constructor(cells, atlas, { color = '#a8f0bf', intensity = 1.4, ghost = 0.07, additive = true } = {}) {
    const n = cells.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(n * 3), idx = new Float32Array(n), col = new Float32Array(n * 3);
    const c0 = new THREE.Color(color).multiplyScalar(intensity);
    cells.forEach((c, i) => { off.set([c.x, c.y, c.h ?? 1], i * 3); idx[i] = SEG.blank; col.set([c0.r, c0.g, c0.b], i * 3); });
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(col, 3));
    geo.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlas }, uOpacity: { value: 1 }, uGhost: { value: ghost } },
      vertexShader: /* glsl */ `attribute vec3 aOff; attribute float aIdx; attribute vec3 aCol; varying vec2 vUv; varying vec3 vCol;
        void main(){ vUv = vec2((aIdx + uv.x) / 16.0, uv.y); vCol = aCol; vec3 p = vec3(position.x * aOff.z * 0.6 + aOff.x, position.y * aOff.z + aOff.y, 0.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uOpacity, uGhost; varying vec2 vUv; varying vec3 vCol;
        void main(){ vec4 t = texture2D(uMap, vUv); float a = max(t.r, t.g * uGhost); if (a * uOpacity < 0.004) discard;
          gl_FragColor = vec4(vCol * (t.r + t.g * uGhost * 0.6), a * uOpacity); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.frustumCulled = false;
    this.renderOrder = 12;
    this.n = n;
  }
  set opacity(v) { this.material.uniforms.uOpacity.value = v; this.visible = v > 0.001; }
  setDigit(i, k) { this.geometry.attributes.aIdx.array[i] = k; }
  setColor(i, c, k = 1) { const a = this.geometry.attributes.aCol.array; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  // write a signed/unsigned integer into cells [i0, i0+n) (sign cell first when signed)
  writeNumber(i0, n, value, signed = false) {
    let v = Math.round(Math.abs(value));
    let k = n - 1;
    const d = this.geometry.attributes.aIdx.array;
    for (; k >= (signed ? 1 : 0); k--) { d[i0 + k] = v % 10; v = Math.floor(v / 10); }
    if (signed) d[i0] = value < 0 ? SEG.minus : SEG.plus;
  }
  commit() { this.geometry.attributes.aIdx.needsUpdate = true; this.geometry.attributes.aCol.needsUpdate = true; }
}

// 3D DSKY: anodised body, lamp panel, EL display window, 19-key keypad. Width ≈ 2 units. Faces +Z.
export function buildDSKY(atlas, M) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#3a3e44', metalness: 0.7, roughness: 0.42, envMapIntensity: 0.7 });
  const bezel = new THREE.MeshStandardMaterial({ color: '#23262a', metalness: 0.6, roughness: 0.5, envMapIntensity: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#030504', metalness: 0.1, roughness: 0.05, envMapIntensity: 1.4 });
  const keyM = new THREE.MeshStandardMaterial({ color: '#d0cfca', metalness: 0.05, roughness: 0.55, envMapIntensity: 0.6 });
  const lampOff = new THREE.MeshStandardMaterial({ color: '#8d8c86', metalness: 0.1, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.02 });
  const lampAmber = new THREE.MeshStandardMaterial({ color: '#8d6a3a', metalness: 0.1, roughness: 0.35, emissive: new THREE.Color('#ffb35c'), emissiveIntensity: 0 });
  const box = new THREE.Mesh(new RoundedBoxGeometry(2.1, 2.25, 0.4, 3, 0.06), body); box.position.z = -0.2; g.add(box);
  // lamp panel (left) + display (right)
  const lampWin = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.96, 0.06, 2, 0.02), bezel); lampWin.position.set(-0.5, 0.5, 0.01); g.add(lampWin);
  const dispWin = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.96, 0.06, 2, 0.02), bezel); dispWin.position.set(0.49, 0.5, 0.01); g.add(dispWin);
  const dispGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.88), glass); dispGlass.position.set(0.49, 0.5, 0.045); g.add(dispGlass);
  const LAMPS = ['UPLINK\nACTY', 'TEMP', 'NO ATT', 'GIMBAL\nLOCK', 'STBY', 'PROG', 'KEY REL', 'RESTART', 'OPR ERR', 'TRACKER', '', 'ALT', '', 'VEL'];
  const lamps = [];
  LAMPS.forEach((txt, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = -0.7 + col * 0.4, y = 0.88 - row * 0.126;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.108, 0.02), txt === 'PROG' ? lampAmber : lampOff); m.position.set(x, y, 0.05); g.add(m);
    if (txt) { const tp = new TextPlane(txt, { font: FONTS.sans, weight: 600, height: 0.032, lineHeight: 1.0, color: '#141414', intensity: 1, blending: THREE.NormalBlending }); tp.position.set(x, y, 0.062); g.add(tp); }
    lamps.push(m);
  });
  // EL display: labels + digits (local to the display window)
  const disp = new THREE.Group(); disp.position.set(0.49, 0.5, 0.05); g.add(disp);
  const GREEN = '#9ff2b8';
  const lab = (t, x, y, w = 0.2) => {
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.055), new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(0.9), toneMapped: false })); bg.position.set(x, y, 0.001); disp.add(bg);
    const tp = new TextPlane(t, { font: FONTS.sans, weight: 600, height: 0.036, letterSpacing: 0.06, color: '#07100a', intensity: 1, blending: THREE.NormalBlending }); tp.position.set(x, y, 0.003); disp.add(tp);
  };
  const compActy = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(1.4), toneMapped: false, transparent: true })); compActy.position.set(-0.26, 0.33, 0.001); disp.add(compActy);
  lab('PROG', 0.2, 0.37); lab('VERB', -0.2, 0.17); lab('NOUN', 0.2, 0.17);
  const cells = [];
  const DH = 0.11, DW = 0.068;
  // PROG (2), VERB (2), NOUN (2), R1..R3 (sign + 5)
  [[0.2, 0.27], [-0.2, 0.07], [0.2, 0.07]].forEach(([cx, cy]) => { for (let k = 0; k < 2; k++) cells.push({ x: cx + (k - 0.5) * DW, y: cy, h: DH }); });
  for (let rI = 0; rI < 3; rI++) for (let k = 0; k < 6; k++) cells.push({ x: -0.19 + k * DW, y: -0.1 - rI * 0.13, h: DH });
  const digits = new SegDigits(cells, atlas, { color: GREEN, intensity: 2.2, ghost: 0.05 });
  disp.add(digits);
  const sepM = new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(0.8), toneMapped: false });
  for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.006), sepM); s.position.set(0, -0.03 - k * 0.13, 0.001); disp.add(s); }
  // keypad
  const KEYS = [['VERB', 0, 0.5], ['NOUN', 0, 1.5], ['+', 1, 0], ['-', 1, 1], ['0', 1, 2], ['7', 2, 0], ['4', 2, 1], ['1', 2, 2], ['8', 3, 0], ['5', 3, 1], ['2', 3, 2],
    ['9', 4, 0], ['6', 4, 1], ['3', 4, 2], ['CLR', 5, 0], ['PRO', 5, 1], ['KEY\nREL', 5, 2], ['ENTR', 6, 0.5], ['RSET', 6, 1.5]];
  const keyGeo = new RoundedBoxGeometry(0.235, 0.235, 0.09, 2, 0.03);
  KEYS.forEach(([t, cx, cy]) => {
    const k = new THREE.Mesh(keyGeo, keyM); k.position.set(-0.78 + cx * 0.26, -0.28 - cy * 0.27, 0.03); g.add(k);
    const tp = new TextPlane(t, { font: FONTS.sans, weight: 600, height: t.length > 2 ? 0.04 : 0.075, lineHeight: 1.0, color: '#111111', intensity: 1, blending: THREE.NormalBlending });
    tp.position.set(k.position.x, k.position.y, 0.08); g.add(tp);
  });
  // mounting screws
  const screwG = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12);
  for (const [x, y] of [[-0.98, 1.05], [0.98, 1.05], [-0.98, -1.05], [0.98, -1.05]]) { const s = new THREE.Mesh(screwG, bezel); s.rotation.x = Math.PI / 2; s.position.set(x, y, 0.01); g.add(s); }
  g.userData = { digits, compActy, lamps, lampAmber, disp };
  void M; void mergeGeometries; void noise2;
  return g;
}
