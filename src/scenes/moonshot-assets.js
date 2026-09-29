// THE MOONSHOT — build-time assets: planet shaders, Apollo hardware built from primitives,
// procedural lunar terrain, canvas textures (foil, flag, regolith, bootprint) and a
// seven-segment "DSKY" digit system shared by the HUD and the 3D guidance computer.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, fbm2, noise4 } from '../lib/noise.js';
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
uniform vec3 uSun; uniform float uTime, uGain, uCity;
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
  vec3 ocean = mix(vec3(0.006, 0.03, 0.11), vec3(0.018, 0.09, 0.16), coast);
  vec3 ground = mix(vec3(0.045, 0.085, 0.03), vec3(0.34, 0.24, 0.12), arid);
  ground *= 0.8 + 0.4 * snoise(p * 18.0);
  vec3 surf = mix(ocean, ground, land);
  surf = mix(surf, vec3(0.75, 0.8, 0.85), ice);
  vec3 cp = p * vec3(3.2, 7.0, 3.2) + vec3(uTime * 0.06, 0.0, uTime * 0.02);
  float cl = smoothstep(0.12, 0.75, fbm(cp) * 0.75 + 0.3 * snoise(p * 16.0) * snoise(p * 3.0 + 7.0)) * 0.85;
  float ndl = dot(N, L);
  float day = smoothstep(-0.08, 0.25, ndl);
  vec3 col = surf * day * 2.2;
  col = mix(col, vec3(0.92, 0.94, 0.97) * day * 1.2, cl * 0.85);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  col += vec3(1.0, 0.9, 0.75) * (pow(nh, 60.0) * 0.18 + pow(nh, 400.0) * 1.0) * (1.0 - land) * (1.0 - cl) * day;
  col += vec3(1.0, 0.42, 0.16) * exp(-pow(ndl / 0.08, 2.0)) * 0.05 * (1.0 - cl * 0.5);
  vec3 q = p * 150.0; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
  float h = hash3(cell);
  float cluster = smoothstep(0.0, 0.35, snoise(p * 5.0 + 2.0)) * land * (1.0 - ice);
  float dotm = smoothstep(0.3, 0.05, length(f)) * step(0.72 - cluster * 0.35, h) * cluster;
  float night = 1.0 - smoothstep(-0.2, 0.05, ndl);
  col += vec3(1.0, 0.62, 0.3) * dotm * night * (1.0 - cl * 0.8) * 2.5 * uCity * (0.6 + 0.4 * sin(uTime * 7.0 + h * 60.0));
  float rim = 1.0 - max(dot(N, V), 0.0);
  col = mix(col, vec3(0.3, 0.6, 1.0) * day * 1.25, pow(rim, 3.0) * 0.8);
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
  vec3 col = vec3(0.96, 0.95, 0.93) * alb * pow(ndl, 0.85) * body * 1.45;
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

export function earthMesh(radius, sun, { segs = 128, city = 1 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms: { uSun: { value: sun }, uTime: { value: 0 }, uGain: { value: 1 }, uCity: { value: city } }, vertexShader: PLANET_VERT, fragmentShader: EARTH_FRAG });
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

// Environment maps for the hardware: black sky, lit regolith (or a blue Earth glow) below.
export function makeEnv(renderer, { ground = [0.2, 0.19, 0.18], glowDir = null, glow = [0.25, 0.45, 0.9] } = {}) {
  const sc = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uGround: { value: new THREE.Vector3(...ground) }, uGlowDir: { value: (glowDir ?? new THREE.Vector3(0, -1, 0)).clone().normalize() }, uGlow: { value: new THREE.Vector3(...glow) }, uHasGlow: { value: glowDir ? 1 : 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uGround, uGlowDir, uGlow; uniform float uHasGlow;
      void main(){ vec3 d = normalize(vD); vec3 c = uGround * smoothstep(0.03, -0.3, d.y);
        c += uGlow * pow(max(dot(d, uGlowDir), 0.0), 6.0) * uHasGlow;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  return tex;
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

// Ascent-stage skin: anodised light-grey panels of varied size, a few black thermal panels, seams, rivets.
export function panelTexture(seed = 5, size = 512) {
  const r = rng(seed), c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#8a8985'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const w = size * (0.08 + r() * 0.3), h = size * (0.06 + r() * 0.25), x = r() * size, y = r() * size;
    const l = 122 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${l},${l - 2},${l - 6})`; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(60,60,64,0.55)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
  }
  g.fillStyle = '#26272a';
  for (let i = 0; i < 2; i++) { const w = size * (0.1 + r() * 0.12), h = size * (0.08 + r() * 0.1); g.fillRect(r() * size, r() * size, w, h); }
  g.fillStyle = 'rgba(40,40,40,0.5)';
  for (let i = 0; i < 300; i++) { g.beginPath(); g.arc(r() * size, r() * size, 1, 0, TAU); g.fill(); }
  return toTexture(c, { repeat: true });
}

// What you glimpse through the LM window: the DSKY's green digits, out of focus, in a dark cabin.
export function cabinGlowTexture(w = 256, h = 256) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const rg = g.createRadialGradient(w * 0.5, h * 0.42, 4, w * 0.5, h * 0.42, w * 0.55);
  rg.addColorStop(0, 'rgba(120,230,160,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  g.filter = 'blur(3px)'; g.fillStyle = 'rgba(170,250,190,0.95)'; g.font = `500 30px "${FONTS.mono}"`; g.textAlign = 'center';
  ['68', '06   43', '+00067', '+02347'].forEach((txt, i) => g.fillText(txt, w * 0.52, h * (0.22 + i * 0.13)));
  g.filter = 'none';
  const t = toTexture(c);
  return t;
}

// Service-module skin (u around, v aft → forward): polished aluminium in six sectors with access panels and
// fastener rows, EPS radiator panels (fine white fins) high on two sectors, ECS radiators low, and
// "UNITED STATES" in black running along one sector, as flown.
export function smTexture(w = 2048, h = 1024) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), r = rng(611);
  g.fillStyle = '#d4d7db'; g.fillRect(0, 0, w, h);
  // sector panels: subtle tone variation, seams, fastener rows
  for (let s = 0; s < 6; s++) {
    const x0 = s * w / 6;
    for (let k = 0; k < 5; k++) {
      const y0 = k * h / 5, l = 204 + Math.floor(r() * 26);
      g.fillStyle = `rgb(${l},${l + 2},${l + 5})`; g.fillRect(x0 + 3, y0 + 3, w / 6 - 6, h / 5 - 6);
    }
    g.fillStyle = 'rgba(70,74,80,0.8)'; g.fillRect(x0 - 2, 0, 4, h);
    g.fillStyle = 'rgba(60,62,66,0.5)';
    for (let y = 8; y < h; y += 14) { g.fillRect(x0 + 8, y, 3, 3); g.fillRect(x0 + w / 6 - 11, y, 3, 3); }
  }
  g.fillStyle = 'rgba(70,74,80,0.7)'; for (let k = 1; k < 5; k++) g.fillRect(0, k * h / 5 - 1, w, 2);
  // EPS radiators: two sectors, upper third — white paint with fine fins
  for (const s of [1, 4]) {
    const x0 = s * w / 6 + 14, x1 = (s + 1) * w / 6 - 14, y0 = h * 0.06, y1 = h * 0.36;
    g.fillStyle = '#eceeef'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let x = x0; x < x1; x += 6) { g.fillStyle = 'rgba(150,156,162,0.55)'; g.fillRect(x, y0, 1.5, y1 - y0); }
    g.strokeStyle = 'rgba(80,84,90,0.8)'; g.lineWidth = 3; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
  // ECS radiators low on two other sectors
  for (const s of [2, 5]) {
    const x0 = s * w / 6 + 20, x1 = (s + 1) * w / 6 - 20, y0 = h * 0.7, y1 = h * 0.9;
    g.fillStyle = '#e6e8ea'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0; y < y1; y += 8) { g.fillStyle = 'rgba(140,146,152,0.5)'; g.fillRect(x0, y, x1 - x0, 1.5); }
  }
  // RCS quad housings: darker mounting panels at the four 45° stations, forward end
  for (let k = 0; k < 4; k++) {
    const cx = ((k + 0.5) / 4) * w;
    g.fillStyle = '#b6babf'; g.fillRect(cx - 44, h * 0.08, 88, h * 0.24);
    g.strokeStyle = 'rgba(60,62,66,0.8)'; g.lineWidth = 2; g.strokeRect(cx - 44, h * 0.08, 88, h * 0.24);
  }
  // lettering: along the length, reading aft → forward
  g.save(); g.translate(w * 0.335, h * 0.62); g.rotate(-Math.PI / 2);
  g.fillStyle = '#121316'; g.font = `700 ${Math.round(h * 0.075)}px "${FONTS.sans}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  let x = -h * 0.42; const txt = 'UNITED STATES';
  const widths = [...txt].map((ch) => g.measureText(ch).width + h * 0.012), tot = widths.reduce((a, b) => a + b, 0);
  x = -tot / 2; [...txt].forEach((ch, i) => { g.fillText(ch, x + widths[i] / 2, 0); x += widths[i]; });
  g.restore();
  // soot / heat tint toward the aft end
  const gr = g.createLinearGradient(0, h, 0, h * 0.8); gr.addColorStop(0, 'rgba(60,55,50,0.35)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
  g.fillStyle = gr; g.fillRect(0, h * 0.8, w, h * 0.2);
  return toTexture(c, { anisotropy: 16 });
}

// Command-module skin (u around, v aft heat-shield rim → apex): Mylar-tape silver strips, the hatch with its
// window, two forward-facing rendezvous windows, two side windows, RCS engine ports and umbilical fairing.
export function cmTexture(w = 1024, h = 512) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), r = rng(1101);
  g.fillStyle = '#d8dadd'; g.fillRect(0, 0, w, h);
  // metallised Kapton / Mylar tape strips, running up the cone, each a slightly different sheen
  for (let i = 0; i < 96; i++) {
    const l = 196 + Math.floor(r() * 50);
    g.fillStyle = `rgb(${l},${l + 1},${l + 4})`; g.fillRect(i * w / 96, 0, w / 96 + 1, h);
  }
  g.fillStyle = 'rgba(90,92,96,0.35)'; for (let i = 0; i < 96; i++) g.fillRect(i * w / 96, 0, 1, h);
  g.fillStyle = 'rgba(80,82,86,0.6)'; for (const v of [0.06, 0.34, 0.62, 0.9]) g.fillRect(0, h * (1 - v), w, 2);
  // (canvas y = 1 − v; u = 0.5 faces the front, where the hatch is)
  const rr = (x, y, ww, hh, rad, fill, stroke) => {
    g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 3; g.stroke(); }
  };
  // hatch outline + hatch window
  rr(w * 0.5 - 62, h * 0.5, 124, h * 0.34, 10, null, 'rgba(60,62,66,0.9)');
  rr(w * 0.5 - 20, h * 0.56, 40, 40, 8, '#07090b', '#3a3c40');
  // side windows
  for (const u of [0.36, 0.64]) rr(w * u - 22, h * 0.58, 44, 44, 9, '#07090b', '#3a3c40');
  // rendezvous windows (forward-looking, up near the apex)
  for (const u of [0.44, 0.56]) rr(w * u - 14, h * 0.38, 28, 36, 7, '#07090b', '#3a3c40');
  // RCS engine ports: pitch/yaw/roll pairs round the cone
  for (let k = 0; k < 6; k++) {
    const u = (k + 0.25) / 6; g.fillStyle = '#1a1b1e';
    g.beginPath(); g.arc(w * u, h * 0.33, 7, 0, TAU); g.fill(); g.beginPath(); g.arc(w * u + 22, h * 0.33, 7, 0, TAU); g.fill();
  }
  // umbilical / tension-tie fairing
  g.fillStyle = '#9ea2a7'; g.fillRect(w * 0.02, h * 0.62, 40, h * 0.36); g.strokeStyle = 'rgba(60,62,66,0.8)'; g.lineWidth = 2; g.strokeRect(w * 0.02, h * 0.62, 40, h * 0.36);
  const t = toTexture(c, { anisotropy: 16 });
  return t;
}

// MLI blanket quilting for the descent stage (tileable, sRGB): gold / amber Kapton patches, taped seams, a few
// darker creases and bright crinkle glints. Near-white so the material colour sets the gold.
export function mliTexture(size = 512, seed = 17) {
  const c = mkCanvas(size), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#f1e9da'; g.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const hue = r(), l = 0.82 + r() * 0.18;
    const col = hue < 0.2 ? [255, 214, 160] : hue < 0.35 ? [255, 246, 226] : [250, 232, 200];
    g.fillStyle = `rgb(${Math.round(col[0] * l)},${Math.round(col[1] * l)},${Math.round(col[2] * l)})`;
    const ox = (r() - 0.5) * 6, oy = (r() - 0.5) * 6;
    g.fillRect(i * cell + ox, j * cell + oy, cell + 2, cell + 2);
  }
  // taped seams (wrapping)
  g.fillStyle = 'rgba(120,96,60,0.55)';
  for (let k = 0; k <= 4; k++) { g.fillRect(k * cell - 2, 0, 4, size); g.fillRect(0, k * cell - 2, size, 4); }
  // creases
  for (let i = 0; i < 70; i++) {
    const x = r() * size, y = r() * size, a = r() * TAU, s = 20 + r() * 90;
    g.strokeStyle = r() > 0.5 ? 'rgba(90,70,40,0.35)' : 'rgba(255,250,235,0.5)'; g.lineWidth = 1 + r() * 2.5;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.5) * s * 0.5, y + Math.sin(a + 0.5) * s * 0.5, x + Math.cos(a) * s, y + Math.sin(a) * s); g.stroke();
  }
  return toTexture(c, { repeat: true });
}

// SPS nozzle (u around, v exit → throat): light columbium extension with cooling bands, darker toward the throat.
export function nozzleTexture(h = 256) {
  const c = mkCanvas(64, h), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#50504e'); gr.addColorStop(0.35, '#8c8a86'); gr.addColorStop(1, '#a9a7a2');
  g.fillStyle = gr; g.fillRect(0, 0, 64, h);
  g.fillStyle = 'rgba(40,40,40,0.55)'; for (let k = 1; k < 9; k++) g.fillRect(0, h * k / 9, 64, k < 3 ? 3 : 1.5);
  g.fillStyle = '#2a2a2a'; g.fillRect(0, h - 10, 64, 10);
  return toTexture(c);
}

// The flag of the United States, drawn to the official proportions (Executive Order 10834):
// hoist A = 1, fly B = 1.9, canton C = 7/13 × D = 0.76, star field E = F = 0.054, G = H = 0.063,
// star diameter K = 0.0616, stripe L = 1/13. 50 stars in 9 staggered rows of 6 and 5.
// Colours: Old Glory Red #B22234, white, Old Glory Blue #3C3B6E.
export function drawUSFlag(g, x0, y0, A, { red = '#b22234', white = '#f7f5ef', blue = '#3c3b6e', starCol = white } = {}) {
  const B = A * 1.9, L = A / 13, C = A * 7 / 13, D = A * 0.76;
  const E = A * 0.054, F = A * 0.054, G = A * 0.063, H = A * 0.063, K = A * 0.0616;
  g.fillStyle = white; g.fillRect(x0, y0, B, A);
  g.fillStyle = red;
  for (let i = 0; i < 13; i += 2) { const ya = y0 + Math.round(i * L), yb = y0 + Math.round((i + 1) * L); g.fillRect(x0, ya, B, yb - ya); }
  g.fillStyle = blue; g.fillRect(x0, y0, D, Math.round(C));
  g.fillStyle = starCol;
  const R = K / 2, r = R * 0.381966;                     // regular five-pointed star
  const star = (cx, cy) => {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  };
  for (let row = 0; row < 9; row++) {
    const cy = y0 + E + row * F;
    for (let col = row % 2; col < 11; col += 2) star(x0 + G + col * H, cy);
  }
}

export function flagTexture(A = 1072) {
  const w = Math.round(A * 1.9), c = mkCanvas(w, A), g = c.getContext('2d');
  // dyed nylon, a touch richer than the print spec so Old Glory Red/Blue survive the film's cool grade
  drawUSFlag(g, 0, 0, A, { red: '#b3152f', blue: '#34366f' });
  // a faint dye/print irregularity so the nylon doesn't read as a flat vector fill
  const r = rng(76), id = g.getImageData(0, 0, w, A), d = id.data;
  for (let i = 0; i < w * A; i++) { const k = 1 + (r() - 0.5) * 0.035; d[i * 4] *= k; d[i * 4 + 1] *= k; d[i * 4 + 2] *= k; }
  g.putImageData(id, 0, 0);
  const t = toTexture(c, { anisotropy: 16 });
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Nylon plain weave (tileable): warp/weft threads with slub noise. Used as bump + roughness variation.
export function weaveTexture(size = 256, threads = 32) {
  const r = rng(12), c = mkCanvas(size), g = c.getContext('2d');
  const id = g.createImageData(size, size), d = id.data, p = size / threads;
  const slubX = Array.from({ length: threads }, () => 0.85 + r() * 0.3), slubY = Array.from({ length: threads }, () => 0.85 + r() * 0.3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const tx = Math.floor(x / p), ty = Math.floor(y / p), fx = (x % p) / p, fy = (y % p) / p;
    const over = (tx + ty) % 2 === 0;                     // which thread is on top in this cell
    const warp = Math.sin(fx * Math.PI) * slubX[tx], weft = Math.sin(fy * Math.PI) * slubY[ty];
    const h = over ? 0.55 + 0.45 * warp * (0.6 + 0.4 * Math.sin(fy * Math.PI)) : 0.55 + 0.45 * weft * (0.6 + 0.4 * Math.sin(fx * Math.PI));
    const v = Math.max(0, Math.min(255, h * 230 + (r() - 0.5) * 16));
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return toTexture(c, { srgb: false, repeat: true });
}

// Descent-stage placard: US flag decal over "UNITED / STATES" on a light thermal-paint panel
// (drawn into the front-left of the panel so the landing-leg strut doesn't cross it).
export function lmDecalTexture(w = 1024, h = 1024) {
  const c = mkCanvas(w, h), g = c.getContext('2d'), r = rng(8);
  g.fillStyle = '#9a9994'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) { const l = 170 + Math.floor(r() * 30); g.fillStyle = `rgba(${l},${l},${l - 4},0.35)`; g.fillRect(r() * w, r() * h, w * (0.1 + r() * 0.3), h * (0.05 + r() * 0.2)); }
  g.strokeStyle = 'rgba(70,70,74,0.6)'; g.lineWidth = 3;
  for (const y of [0.04, 0.96]) { g.beginPath(); g.moveTo(0, y * h); g.lineTo(w, y * h); g.stroke(); }
  g.fillStyle = 'rgba(40,40,40,0.45)';
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(w * (0.03 + i * 0.0375), h * 0.04, 3, 0, TAU); g.fill(); g.beginPath(); g.arc(w * (0.03 + i * 0.0375), h * 0.96, 3, 0, TAU); g.fill(); }
  const A = h * 0.2, x0 = w * 0.06, y0 = h * 0.12;
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 - 3, y0 - 3, A * 1.9 + 6, A + 6);
  drawUSFlag(g, x0, y0, A, { white: '#f1efe8' });
  g.fillStyle = '#101113'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `600 ${Math.round(h * 0.16)}px "${FONTS.sans}"`;
  const track = (txt, x, y, sp) => { for (const ch of txt) { g.fillText(ch, x, y); x += g.measureText(ch).width + sp; } };
  track('UNITED', x0 - h * 0.008, y0 + A + h * 0.215, h * 0.01);
  track('STATES', x0 - h * 0.008, y0 + A + h * 0.4, h * 0.01);
  return toTexture(c, { anisotropy: 16 });
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
  for (let i = 0; i < 140; i++) {
    const cx = r() * size, cy = r() * size, rad = 2 + Math.pow(r(), 3) * 26, depth = 0.12 + r() * 0.2;
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
  for (let i = 0; i < 1100; i++) {
    const cx = r() * size, cy = r() * size, rad = 0.7 + r() * 1.6;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const q = Math.hypot(dx, dy) / rad; if (q > 1) continue;
      const X = ((Math.round(cx + dx) % size) + size) % size, Y = ((Math.round(cy + dy) % size) + size) % size;
      H[Y * size + X] += Math.sqrt(1 - q * q) * 0.22; peb[Y * size + X] = 0.5;
    }
  }
  const ca = mkCanvas(size), cb = mkCanvas(size);
  const ia = ca.getContext('2d').createImageData(size, size), ib = cb.getContext('2d').createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const h = H[i];
    const hv = Math.max(0, Math.min(255, 128 + h * 150));
    const al = Math.max(0, Math.min(255, 150 + h * 30 + peb[i] * 18 + (r() - 0.5) * 18));
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
  g.filter = 'blur(7px)'; g.strokeStyle = 'rgb(0,220,0)'; g.lineWidth = 20; g.stroke(sole); g.filter = 'none';
  // depth: the sole pressed ~1.5 cm, its transverse ribs a further ~1 cm (crisp, as in AS11-40-5878)
  const d = mkCanvas(w, h), dg = d.getContext('2d');
  dg.save(); dg.clip(sole);
  dg.fillStyle = 'rgb(150,0,0)'; dg.fillRect(0, 0, w, h);
  dg.fillStyle = 'rgb(255,0,0)';
  for (let i = 0; i < 16; i++) { const y = h * 0.095 + i * h * 0.0613; dg.fillRect(0, y, w, h * 0.032); }   // 22 mm pitch at the 0.359 m print scale (the boot's tread bars)
  dg.restore();
  g.filter = 'blur(0.8px)'; g.drawImage(d, 0, 0); g.filter = 'none';
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
  const idx = [], sunk = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / segs) * 2 - 1, v = (j / segs) * 2 - 1;
    const x = Math.sign(u) * Math.pow(Math.abs(u), k) * size, z = Math.sign(v) * Math.pow(Math.abs(v), k) * size;
    const y = field(x, z);
    const sk = skip ? skip(x, z) : 0;
    if (sk) sunk.push([j * n + i, sk === true ? 0.02 : sk]);
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
  // sink skipped vertices only after the normals are taken, so their neighbours keep the true surface shading
  for (const [o, d] of sunk) pos[o * 3 + 1] -= d;
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

export function apolloMaterials(envMap = null) {
  const crinkle = crinkleTexture();
  const panel = panelTexture();
  const mli = mliTexture(); mli.repeat.set(3, 1);
  const M = {
    gold: new THREE.MeshStandardMaterial({ color: '#c09048', map: mli, metalness: 1, roughness: 0.46, bumpMap: crinkle, bumpScale: 3, envMapIntensity: 0.55 }),
    goldDark: new THREE.MeshStandardMaterial({ color: '#8e6428', metalness: 1, roughness: 0.4, bumpMap: crinkle, bumpScale: 2.5, envMapIntensity: 0.5 }),
    silverFoil: new THREE.MeshStandardMaterial({ color: '#b9bcc0', metalness: 1, roughness: 0.36, bumpMap: crinkle, bumpScale: 2, envMapIntensity: 0.6 }),
    blackFoil: new THREE.MeshStandardMaterial({ color: '#1b1b1d', metalness: 0.4, roughness: 0.55, bumpMap: crinkle, bumpScale: 2, envMapIntensity: 0.4 }),
    skin: new THREE.MeshStandardMaterial({ map: panel, metalness: 0.35, roughness: 0.48, envMapIntensity: 0.45 }),
    dark: new THREE.MeshStandardMaterial({ color: '#35363a', metalness: 0.85, roughness: 0.35, envMapIntensity: 0.6 }),
    bell: new THREE.MeshStandardMaterial({ color: '#4a4640', metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: '#9d9d98', metalness: 0.1, roughness: 0.6, envMapIntensity: 0.5 }),
    sm: new THREE.MeshStandardMaterial({ map: smTexture(), metalness: 0.6, roughness: 0.3, envMapIntensity: 0.9 }),
    cm: new THREE.MeshStandardMaterial({ map: cmTexture(), color: '#e4e6e9', metalness: 0.75, roughness: 0.26, envMapIntensity: 1.0 }),
    heat: new THREE.MeshStandardMaterial({ color: '#4d3524', metalness: 0.3, roughness: 0.7, envMapIntensity: 0.4 }),
    nozzle: new THREE.MeshStandardMaterial({ map: nozzleTexture(), metalness: 0.7, roughness: 0.36, side: THREE.DoubleSide, envMapIntensity: 0.7 }),
    chrome: new THREE.MeshStandardMaterial({ color: '#d4d7db', metalness: 1, roughness: 0.18, envMapIntensity: 0.9 }),
    paint: new THREE.MeshStandardMaterial({ color: '#141416', metalness: 0.1, roughness: 0.55, envMapIntensity: 0.3 }),
    decal: new THREE.MeshStandardMaterial({ map: lmDecalTexture(), metalness: 0.25, roughness: 0.55, envMapIntensity: 0.4 }),
    window: new THREE.MeshStandardMaterial({ color: '#07090b', metalness: 0.3, roughness: 0.06, emissive: new THREE.Color('#ffffff'), emissiveMap: cabinGlowTexture(), emissiveIntensity: 0.5, envMapIntensity: 1.2 }),
  };
  if (envMap) for (const m of Object.values(M)) m.envMap = envMap;
  return M;
}

// small parabolic dish (concave side toward +Y), radius r, focal length f
const dishGeo = (r, f, seg = 28) => {
  const pts = [];
  for (let i = 0; i <= 8; i++) { const x = Math.max(0.001, (i / 8) * r); pts.push(new THREE.Vector2(x, x * x / (4 * f))); }
  for (let i = 8; i >= 0; i--) { const x = Math.max(0.001, (i / 8) * r); pts.push(new THREE.Vector2(x * 0.999, x * x / (4 * f) - 0.012)); }
  return new THREE.LatheGeometry(pts, seg);
};
// rocket nozzle bell (throat at y = 0, exit toward −y)
const bellGeo = (rt, re, len, seg = 16, k = 1.5) => {
  const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(new THREE.Vector2(rt + (re - rt) * Math.pow(u, k), -u * len)); }
  return new THREE.LatheGeometry(pts, seg);
};

// Lunar Module. Origin at the footpad contact plane; front (windows, hatch, ladder leg) faces +Z.
// Descent stage: octagonal MLI-wrapped structure, four legs on the main axes (primary strut with its
// telescoping piston, two secondary struts, a deployment truss, dished footpads, and 1.5 m surface-contact
// probes on the three legs without the ladder). Ascent stage: faceted cabin, triangular windows, hatch,
// docking tunnel, propellant-tank cheeks, four RCS quads on booms, rendezvous-radar and S-band dishes,
// VHF antennas and the docking target.
export function buildLM(M, { folded = false } = {}) {
  const lm = new THREE.Group();
  const add = (m, parent = lm) => { parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = lm) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), parent); m.position.set(x, y, z); return m; };
  const DS_Y = 1.55, DS_H = 1.65, DS_R = 2.15, AP = DS_R * Math.cos(Math.PI / 8);
  // ---------------- descent stage
  const ds = add(new THREE.Mesh(new THREE.CylinderGeometry(DS_R, DS_R, DS_H, 8, 1), M.gold));
  ds.rotation.y = Math.PI / 8; ds.position.y = DS_Y + DS_H / 2;
  for (const y of [DS_Y + 0.035, DS_Y + DS_H - 0.035]) { const b = add(new THREE.Mesh(new THREE.CylinderGeometry(DS_R + 0.022, DS_R + 0.022, 0.07, 8, 1, true), M.silverFoil)); b.rotation.y = Math.PI / 8; b.position.y = y; }
  const shield = add(new THREE.Mesh(new THREE.CylinderGeometry(DS_R * 0.98, DS_R * 0.86, 0.14, 8), M.blackFoil)); shield.rotation.y = Math.PI / 8; shield.position.y = DS_Y - 0.07;
  // quadrant bays (the diagonal faces): silver / black foil blankets, the flag placard on the front-right bay
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, rr = AP + 0.012;
    const pnl = add(new THREE.Mesh(new THREE.BoxGeometry(1.42, DS_H * 0.8, 0.04), k === 2 ? M.blackFoil : M.silverFoil));
    pnl.position.set(Math.sin(a) * rr, DS_Y + DS_H / 2, Math.cos(a) * rr); pnl.rotation.y = a;
    if (k === 0 && M.decal) {
      const dc = add(new THREE.Mesh(new THREE.PlaneGeometry(1.38, DS_H * 0.78), M.decal));
      dc.position.set(Math.sin(a) * (rr + 0.022), DS_Y + DS_H / 2, Math.cos(a) * (rr + 0.022)); dc.rotation.y = a;
    }
    // bay stiffeners: two horizontal ribs across each blanket
    for (const dy of [-0.38, 0.38]) { const rib = add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.035, 0.03), M.dark)); rib.position.set(Math.sin(a) * (rr + 0.03), DS_Y + DS_H / 2 + dy, Math.cos(a) * (rr + 0.03)); rib.rotation.y = a; }
  }
  // descent engine: bell + skirt
  const bellPts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; bellPts.push(new THREE.Vector2(0.32 + 0.5 * Math.pow(u, 1.4), -u * 1.05)); }
  const bell = add(new THREE.Mesh(new THREE.LatheGeometry(bellPts, 32), M.bell));
  bell.position.y = DS_Y + 0.05;
  const skirt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.95, 0.22, 24, 1, true), M.blackFoil)); skirt.position.y = DS_Y - 0.2;
  // ---------------- landing gear
  const legs = [], probes = [];
  const PROBE_L = 1.5;
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, s = Math.sin(a), c = Math.cos(a);
    const top = V3(s * (AP + 0.14), DS_Y + DS_H * 0.8, c * (AP + 0.14));
    const foot = folded ? V3(s * 2.6, DS_Y + 0.2, c * 2.6) : V3(s * 4.2, 0.28, c * 4.2);
    // strut fittings on the main face
    const fit = box(0.46, 0.32, 0.28, M.dark, s * (AP + 0.1), top.y, c * (AP + 0.1)); fit.rotation.y = a;
    // primary strut: foil-wrapped outer cylinder, polished piston below
    const J = top.clone().lerp(foot, 0.56);
    add(strut(top, J, 0.1, M.gold, 12));
    add(strut(J.clone().lerp(top, 0.04), J.clone().lerp(foot, 0.06), 0.118, M.silverFoil, 12));
    add(strut(J, foot, 0.062, M.chrome, 12));
    // secondary struts from the lower corners of the stage to the outer cylinder's end, and the deployment truss
    const lowA = V3(s * AP + c * 0.95, DS_Y + 0.1, c * AP - s * 0.95), lowB = V3(s * AP - c * 0.95, DS_Y + 0.1, c * AP + s * 0.95);
    const J2 = top.clone().lerp(foot, 0.5);
    add(strut(lowA, J2, 0.045, M.gold, 8)); add(strut(lowB, J2, 0.045, M.gold, 8));
    for (const lo of [lowA, lowB]) {
      const hi = V3(s * (AP + 0.02) + (lo.x - s * AP) * 0.45, DS_Y + DS_H * 0.42, c * (AP + 0.02) + (lo.z - c * AP) * 0.45);
      add(strut(hi, lo.clone().lerp(J2, 0.5), 0.022, M.silverFoil, 6));
    }
    // footpad (a shallow dish), ball joint
    const padPts = [[0.001, 0], [0.2, 0.006], [0.35, 0.03], [0.44, 0.075], [0.47, 0.13], [0.47, 0.17], [0.43, 0.17], [0.2, 0.135], [0.001, 0.13]].map(([x, y]) => new THREE.Vector2(x, y));
    const pad = add(new THREE.Mesh(new THREE.LatheGeometry(padPts, 28), M.goldDark));
    pad.position.set(foot.x, foot.y - 0.28, foot.z);
    const ball = add(new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), M.chrome)); ball.position.set(foot.x, foot.y - 0.06, foot.z);
    legs.push({ top, foot, pad });
    // surface-contact probe (not on the ladder leg): hangs from the pad, folds outward as it drags on the surface
    if (!folded && k !== 0) {
      const pivot = new THREE.Group(); pivot.position.set(foot.x + s * 0.3, foot.y - 0.27, foot.z + c * 0.3); lm.add(pivot);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, PROBE_L, 6), M.chrome); rod.geometry.translate(0, -PROBE_L / 2, 0); pivot.add(rod);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), M.dark); tip.position.y = -PROBE_L; pivot.add(tip);
      const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 5), M.chrome); brace.geometry.translate(0, -0.18, 0); brace.position.set(-s * 0.3, 0.12, -c * 0.3); brace.rotation.set(c * 0.9, 0, -s * 0.9); pivot.add(brace);
      probes.push({ pivot, axis: V3(-c, 0, s), y0: foot.y - 0.27 });
    }
  }
  // front porch + ladder on the +Z leg's primary strut
  if (!folded) {
    const porch = box(1.1, 0.05, 0.8, M.silverFoil, 0, DS_Y + DS_H + 0.02, AP + 0.36);
    for (const dx of [-0.52, 0.52]) {
      add(strut(V3(dx, DS_Y + DS_H + 0.04, AP + 0.72), V3(dx, DS_Y + DS_H + 0.62, AP + 0.72), 0.014, M.gold, 6));
      add(strut(V3(dx, DS_Y + DS_H + 0.62, AP + 0.72), V3(dx * 0.9, DS_Y + DS_H + 0.9, 1.35), 0.014, M.gold, 6));
    }
    const L0 = legs[0], d = L0.foot.clone().sub(L0.top).normalize(), n = V3(0, d.z, -d.y);
    const lt = V3(0, DS_Y + DS_H, AP + 0.62), lb = L0.top.clone().lerp(L0.foot, 0.86).addScaledVector(n, 0.15);
    [-0.25, 0.25].forEach((dx) => add(strut(lt.clone().setX(dx), lb.clone().setX(dx), 0.022, M.gold, 6)));
    for (let i = 1; i < 10; i++) { const p = lt.clone().lerp(lb, i / 10); add(strut(p.clone().setX(-0.25), p.clone().setX(0.25), 0.017, M.gold, 6)); }
  }
  // thruster plume deflectors on the descent stage deck under the RCS quads
  for (const [x, z] of [[-1.5, 0.55], [1.5, 0.55], [-1.5, -1.2], [1.5, -1.2]]) {
    const pl = box(0.5, 0.02, 0.5, M.silverFoil, x * 0.98, DS_Y + DS_H + 0.2, z); pl.rotation.set(0, 0, -Math.sign(x) * 0.5);
    add(strut(V3(x * 0.8, DS_Y + DS_H, z), V3(x * 0.98, DS_Y + DS_H + 0.18, z), 0.015, M.silverFoil, 5));
  }
  // ---------------- ascent stage
  const as = new THREE.Group(); as.position.y = DS_Y + DS_H + 0.05; lm.add(as);
  const shape = new THREE.Shape();
  [[-1.35, -0.9], [1.35, -0.9], [1.35, 0.35], [0.8, 1.15], [-0.8, 1.15], [-1.35, 0.35]].forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  const cabG = new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  cabG.rotateX(-Math.PI / 2);
  const cab = add(new THREE.Mesh(cabG, M.skin), as);
  cab.position.y = 0.1;
  // upper cabin: set back from the window face, joined to it by a sloping forehead panel
  {
    const up = new THREE.Shape();
    [[-1.35, -0.9], [1.35, -0.9], [1.35, 0.2], [0.62, 0.8], [-0.62, 0.8], [-1.35, 0.2]].forEach(([x, z], i) => (i ? up.lineTo(x, -z) : up.moveTo(x, -z)));
    const ug = new THREE.ExtrudeGeometry(up, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    ug.rotateX(-Math.PI / 2);
    add(new THREE.Mesh(ug, M.skin), as).position.y = 1.9;
    const A = [-0.86, 1.96, 1.21], B = [0.86, 1.96, 1.21], C = [0.62, 2.16, 0.86], D = [-0.62, 2.16, 0.86], A2 = [-0.86, 1.96, 0.86], B2 = [0.86, 1.96, 0.86];
    const tris = [A, B, C, A, C, D, A, D, A2, B, B2, C];
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p[0] * 0.5 + 0.5, p[1] * 0.5 + p[2] * 0.3]), 2));
    fg.computeVertexNormals();
    add(new THREE.Mesh(fg, M.skin), as);
  }
  // black thermal surround + triangular windows (canted like the real LM's) + frames
  const triPts = (sx) => [V3(0, 0, 0), V3(sx * 0.7, 0, 0), V3(sx * 0.06, 0.66, 0)];
  const tri = (sx) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, sx * 0.7, 0, 0, sx * 0.06, 0.66, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(sx > 0 ? [0, 0, 1, 0, 0.1, 1] : [1, 0, 0, 0, 0.9, 1], 2));
    g.setIndex(sx > 0 ? [0, 1, 2] : [0, 2, 1]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.window); m.position.set(sx * 0.08, 1.14, 1.235); return m;
  };
  const winL = tri(-1), winR = tri(1); as.add(winL, winR);
  for (const [sx, w] of [[-1, winL], [1, winR]]) {
    const p = triPts(sx), cxy = p[0].clone().add(p[1]).add(p[2]).multiplyScalar(1 / 3);
    const sur = w.clone(); sur.material = M.blackFoil; sur.scale.setScalar(1.28); sur.position.set(w.position.x + cxy.x * (1 - 1.28), w.position.y + cxy.y * (1 - 1.28), 1.226); as.add(sur);
    for (let i = 0; i < 3; i++) { const a = p[i].clone().add(w.position), b = p[(i + 1) % 3].clone().add(w.position); a.z = b.z = 1.24; add(strut(a, b, 0.018, M.dark, 6), as); }
  }
  // hatch with its frame, handle and the handrails either side
  const hatch = box(0.85, 0.85, 0.06, M.dark, 0, 0.62, 1.2, as);
  box(0.95, 0.05, 0.05, M.silverFoil, 0, 1.07, 1.23, as); box(0.95, 0.05, 0.05, M.silverFoil, 0, 0.17, 1.23, as);
  box(0.12, 0.03, 0.04, M.chrome, 0.28, 0.62, 1.25, as);
  for (const sx of [-1, 1]) { add(strut(V3(sx * 0.58, 0.2, 1.27), V3(sx * 0.58, 1.02, 1.27), 0.016, M.gold, 6), as); for (const y of [0.2, 1.02]) add(strut(V3(sx * 0.58, y, 1.27), V3(sx * 0.58, y, 1.2), 0.012, M.gold, 5), as); }
  // docking tunnel, drogue ring, overhead rendezvous window, docking target
  const tun = add(new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.45, 32), M.skin), as); tun.position.set(0, 2.35, -0.05);
  const ring = add(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.035, 8, 32), M.chrome), as); ring.rotation.x = Math.PI / 2; ring.position.set(0, 2.575, -0.05);
  const ohw = add(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), M.window), as); ohw.rotation.x = -Math.PI / 2; ohw.position.set(-0.45, 2.172, 0.55);
  {
    const tg = new THREE.Group(); tg.position.set(-0.85, 2.16, 0.2); as.add(tg);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), M.chrome), tg).position.y = 0.17;
    const disc = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 24), M.paint), tg); disc.position.y = 0.34;
    box(0.36, 0.02, 0.04, M.white, 0, 0.35, 0, tg); box(0.04, 0.02, 0.36, M.white, 0, 0.35, 0, tg);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), M.white), tg).position.y = 0.45;
  }
  // aft equipment bay: black box, radiator fins, gas bottles
  const aft = box(2.3, 1.3, 1.1, M.blackFoil, 0, 1.05, -1.45, as);
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) box(0.03, 1.1, 0.12, M.silverFoil, x, 1.05, -2.02, as);
  for (const sx of [-1, 1]) { const b = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.5, 4, 14), M.white), as); b.position.set(sx * 0.95, 1.95, -1.55); }
  // propellant-tank cheeks
  [-1, 1].forEach((sx) => { const tk = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.55, 6, 24), M.skin), as); tk.position.set(sx * 1.42, 0.82, -0.25); });
  // RCS quads on booms: housing + four bells (up, down, outboard, fore/aft)
  for (const [x, z] of [[-1.5, 0.55], [1.5, 0.55], [-1.5, -1.2], [1.5, -1.2]]) {
    const q = new THREE.Group(); q.position.set(x * 1.06, 1.85, z); as.add(q);
    add(strut(V3(x * 0.84, 1.75, z), V3(x * 1.06, 1.85, z), 0.05, M.silverFoil, 8), as);
    add(strut(V3(x * 0.84, 2.1, z * 0.9), V3(x * 1.06, 1.9, z), 0.02, M.silverFoil, 5), as);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.04), M.goldDark), q);
    const nz = bellGeo(0.03, 0.075, 0.2, 14);
    for (const d of [V3(0, 1, 0), V3(0, -1, 0), V3(Math.sign(x), 0, 0), V3(0, 0, Math.sign(z))]) {
      const n = add(new THREE.Mesh(nz, M.bell), q);
      n.position.copy(d).multiplyScalar(0.15); n.quaternion.setFromUnitVectors(V3(0, -1, 0), d);
    }
  }
  // rendezvous radar: dish on a yoke, front-top
  {
    const rg = new THREE.Group(); rg.position.set(0.25, 2.16, 0.55); as.add(rg);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.14, 12), M.dark), rg).position.y = 0.07;
    for (const sx of [-1, 1]) box(0.03, 0.32, 0.06, M.silverFoil, sx * 0.3, 0.26, 0, rg);
    box(0.62, 0.04, 0.06, M.silverFoil, 0, 0.12, 0, rg);
    const dish = add(new THREE.Mesh(dishGeo(0.33, 0.24), M.white), rg); dish.position.y = 0.32; dish.rotation.x = 1.15;
    add(strut(V3(0, 0.32, 0), V3(0, 0.32 + Math.cos(1.15) * 0.26, Math.sin(1.15) * 0.26), 0.012, M.dark, 5), rg);
  }
  // S-band steerable antenna: boom, gimbal, dish
  add(strut(V3(1.0, 2.1, -0.5), V3(1.35, 2.75, -0.7), 0.03, M.silverFoil), as);
  add(strut(V3(1.35, 2.75, -0.7), V3(1.35, 2.9, -0.7), 0.05, M.dark, 8), as);
  const sdish = add(new THREE.Mesh(dishGeo(0.4, 0.28), M.white), as); sdish.position.set(1.35, 2.95, -0.7); sdish.rotation.set(-0.6, 0, -0.7);
  // VHF antennas (inverted-cone bases, angled whips) and the EVA antenna
  for (const [b, dir] of [[V3(-1.2, 2.16, -1.2), V3(-0.45, 1, -0.3)], [V3(0.6, 2.16, -1.7), V3(0.3, 1, -0.5)]]) {
    const cone = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 12), M.white), as); cone.position.copy(b).add(V3(0, 0.08, 0)); cone.rotation.x = Math.PI;
    add(strut(b.clone().add(V3(0, 0.12, 0)), b.clone().add(V3(0, 0.12, 0)).addScaledVector(dir.normalize(), 0.8), 0.009, M.silverFoil, 4), as);
  }
  add(strut(V3(0.7, 2.16, 0.7), V3(0.8, 2.6, 0.9), 0.008, M.silverFoil, 4), as);
  const setProbes = (h) => {
    for (const p of probes) {
      const hh = h + p.y0;
      const th = hh >= PROBE_L ? 0 : Math.min(1.52, Math.acos(Math.max(0, hh) / PROBE_L));
      p.pivot.quaternion.setFromAxisAngle(p.axis, th);
    }
  };
  lm.userData = { ascent: as, bell, windows: [winL, winR], legs, probes, setProbes, bellY: DS_Y - 1.0, winPos: V3(-0.35, as.position.y + 1.42, 1.3), topZ: as.position.y + 2.575 };
  lm.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return lm;
}

// Command + service module. Axis along +Z; CM apex (docking probe) at +Z. Proportions after the Block II CSM:
// SM Ø 3.9 m × 4.4 m, SPS nozzle 2.8 m, CM 3.2 m tall. userData: apexZ (CM docking ring), aftZ (nozzle exit).
export function buildCSM(M) {
  const g = new THREE.Group();
  const add = (m, parent = g) => { parent.add(m); return m; };
  const R = 1.96, SM_F = 3.7, smLen = 4.4, SM_A = SM_F - smLen;
  // service module shell, aft bulkhead, forward fairing ring
  const sm = add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, smLen, 72, 1, true), M.sm)); sm.rotation.x = Math.PI / 2; sm.position.z = (SM_F + SM_A) / 2;
  const aftCap = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.995, R * 0.995, 0.12, 64), M.dark)); aftCap.rotation.x = Math.PI / 2; aftCap.position.z = SM_A - 0.02;
  const aftRing = add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.04, 8, 72), M.chrome)); aftRing.position.z = SM_A;
  const fwdRing = add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.005, 0.03, 8, 72), M.dark)); fwdRing.position.z = SM_F - 0.02;
  // SPS engine: gimbal housing, throat, banded nozzle extension
  const eng = add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.4, 32), M.dark)); eng.rotation.x = Math.PI / 2; eng.position.z = SM_A - 0.25;
  const nzPts = []; for (let i = 0; i <= 18; i++) { const u = i / 18; nzPts.push(new THREE.Vector2(0.42 + 0.86 * Math.pow(u, 1.35), -u * 2.8)); }
  const nozzle = add(new THREE.Mesh(new THREE.LatheGeometry(nzPts, 48), M.nozzle)); nozzle.rotation.x = Math.PI / 2; nozzle.position.z = SM_A - 0.4;
  const lip = add(new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.03, 6, 48), M.dark)); lip.position.z = SM_A - 0.4 - 2.8;
  // RCS quads at the four 45° stations near the forward end: housing + two axial and two tangential bells
  const qb = bellGeo(0.04, 0.1, 0.3, 14);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, q = new THREE.Group();
    q.position.set(Math.cos(a) * (R + 0.12), Math.sin(a) * (R + 0.12), SM_F - 0.95); q.rotation.z = a; g.add(q);   // local X = radial
    add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.62, 0.7, 2, 0.05), M.silverFoil), q);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.95), M.dark), q).position.x = -0.12;
    for (const d of [V3(0, 0, 1), V3(0, 0, -1), V3(0, 1, 0), V3(0, -1, 0)]) {
      const n = add(new THREE.Mesh(qb, M.bell), q);
      n.position.copy(d).multiplyScalar(d.z ? 0.36 : 0.32); n.position.x = 0.05; n.quaternion.setFromUnitVectors(V3(0, -1, 0), d);
    }
  }
  // scimitar VHF antennas (two curved blades, 180° apart)
  {
    const sh = new THREE.Shape(); sh.absarc(0, 0, 0.75, 0.15, Math.PI * 0.85, false); sh.absarc(0, 0, 0.66, Math.PI * 0.85, 0.15, true); sh.closePath();
    const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false, curveSegments: 24 }); sg.translate(0, -0.2, -0.0125);
    const bx = V3(0, 0, 1), m4 = new THREE.Matrix4();
    for (const sx of [1, -1]) { const b = add(new THREE.Mesh(sg, M.white)); b.position.set(sx * R, 0, SM_A + 1.8); const by = V3(sx, 0, 0); b.quaternion.setFromRotationMatrix(m4.makeBasis(bx, by, V3(0, 0, 0).crossVectors(bx, by))); }
  }
  // high-gain antenna: boom off the aft end, four dishes round a central horn
  const hga = new THREE.Group(); hga.position.set(0, -R - 1.3, SM_A + 0.35); g.add(hga);
  add(strut(V3(0, 1.3, 0), V3(0, 0, 0), 0.05, M.silverFoil), hga);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.34), M.dark), hga).position.y = -0.05;
  add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 12), M.white), hga).position.y = -0.3;
  for (let k = 0; k < 4; k++) {
    const d = add(new THREE.Mesh(dishGeo(0.4, 0.3), M.white), hga);
    d.position.set((k % 2 - 0.5) * 0.9, -0.2, (Math.floor(k / 2) - 0.5) * 0.9); d.rotation.x = Math.PI;
    add(strut(V3(0, -0.05, 0), d.position.clone(), 0.018, M.silverFoil, 5), hga);
  }
  // command module: heat shield (bronze ablator), Mylar-taped cone, forward tunnel, docking probe
  const CM_Z = SM_F + 0.02, CH = 3.15;
  const hs = add(new THREE.Mesh(new THREE.LatheGeometry([[0.001, -0.22], [0.9, -0.17], [1.6, -0.08], [R + 0.01, 0.02], [R + 0.005, 0.1]].map(([x, y]) => new THREE.Vector2(x, y)), 64), M.heat));
  hs.rotation.x = Math.PI / 2; hs.position.z = CM_Z;
  const cmPts = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; cmPts.push(new THREE.Vector2(R - (R - 0.74) * u, 0.1 + u * 2.35)); }
  [[0.66, 2.62], [0.55, 2.78], [0.46, 2.88], [0.44, 3.1], [0.001, 3.12]].forEach(([x, y]) => cmPts.push(new THREE.Vector2(x, y)));
  const cm = add(new THREE.Mesh(new THREE.LatheGeometry(cmPts, 72), M.cm)); cm.rotation.x = Math.PI / 2; cm.position.z = CM_Z;
  const tunRing = add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 8, 36), M.chrome)); tunRing.position.z = CM_Z + CH - 0.04;
  add(strut(V3(0, 0, CM_Z + CH - 0.05), V3(0, 0, CM_Z + CH + 0.45), 0.07, M.chrome, 12));
  const probeTip = add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 12), M.chrome)); probeTip.rotation.x = Math.PI / 2; probeTip.position.z = CM_Z + CH + 0.52;
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3; add(strut(V3(Math.cos(a) * 0.4, Math.sin(a) * 0.4, CM_Z + CH - 0.05), V3(Math.cos(a) * 0.06, Math.sin(a) * 0.06, CM_Z + CH + 0.3), 0.014, M.chrome, 5)); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.apexZ = CM_Z + CH;
  g.userData.aftZ = SM_A - 0.4 - 2.8;
  g.userData.length = g.userData.apexZ - g.userData.aftZ;
  return g;
}

// Apollo Lunar Flag Assembly: two-piece anodised-aluminium pole with a hinged horizontal crossbar
// through the top hem, 3 × 5 ft nylon flag. On Apollo 11 the telescoping crossbar did not fully
// extend, so the cloth bunched into permanent ripples; the storage folds left creases. There is no
// wind: the cloth is a static, vertex-displaced sheet (pure geometry, built once).
// Origin: pole foot at the regolith surface (the pole continues 0.4 m into the ground).
export function buildFlag({ envMap = null } = {}) {
  const g = new THREE.Group();
  const A = 0.8, B = A * 1.9, BUNCH = 0.9, TOP = 2.2, X0 = 0.03;
  const alu = new THREE.MeshStandardMaterial({ color: '#a4a7ab', metalness: 0.85, roughness: 0.38, envMap, envMapIntensity: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: '#7b7e82', metalness: 0.85, roughness: 0.42, envMap, envMapIntensity: 0.5 });
  const add = (m) => { g.add(m); return m; };
  const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0165, TOP + 0.47, 18), alu)); pole.position.y = (TOP + 0.47) / 2 - 0.4;
  const joint = add(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.08, 18), dark)); joint.position.y = 1.05;
  const hinge = add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.075, 0.045, 2, 0.008), dark)); hinge.position.y = TOP + 0.005;
  const cap = add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 14, 8), alu)); cap.position.y = TOP + 0.06;
  const barL = B * BUNCH + 0.03;
  const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, barL, 12), alu)); bar.rotation.z = Math.PI / 2; bar.position.set(barL / 2 + 0.015, TOP, 0);
  const tip = add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), dark)); tip.position.set(barL + 0.02, TOP, 0);
  // cloth
  const SX = 170, SY = 90;
  const geo = new THREE.PlaneGeometry(B, A, SX, SY);
  const p = geo.attributes.position;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const crease = (d, w) => Math.exp(-((d / w) ** 2));
  for (let i = 0; i < p.count; i++) {
    const u = Math.min(1, Math.max(0, (p.getX(i) + B / 2) / B)), v = Math.min(1, Math.max(0, (p.getY(i) + A / 2) / A)), hang = 1 - v;
    const pin = sm(0, 0.06, u);                                   // hoist hem held along the pole
    let z = Math.sin(TAU * (u * 4.6 + 0.16 * hang + 0.1 + 0.11 * Math.sin(u * 9.1 + 0.7))) * (0.012 + 0.05 * hang) * (0.8 + 0.3 * Math.sin(u * 6.3 + 2.1)) * pin   // irregular bunching ripples off the crossbar
      + Math.sin(TAU * (u * 9.3 - 0.3 * hang) + 1.7) * 0.006 * (0.35 + hang) * pin
      + Math.sin(TAU * (u * 1.7 + 0.35)) * 0.028 * hang * hang * pin                          // broad lower billow
      + 0.045 * u * u * u * Math.pow(hang, 2.2);                                              // free fly corner curls out
    z += 0.0045 * (crease(v - 0.335, 0.011) - crease(v - 0.667, 0.011)) * pin;               // storage folds
    z += 0.004 * (crease(u - 0.25, 0.008) - crease(u - 0.5, 0.008) + crease(u - 0.75, 0.008)) * (0.3 + hang);
    const x = X0 + u * B * BUNCH;
    const y = TOP - 0.018 - hang * A - 0.03 * u * u * hang * hang;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const weave = weaveTexture();
  weave.repeat.set(52, 28);
  const flagTex = flagTexture();
  const cm = new THREE.MeshPhysicalMaterial({
    map: flagTex, side: THREE.DoubleSide, metalness: 0, roughness: 0.74, roughnessMap: weave, bumpMap: weave, bumpScale: 0.35,
    color: new THREE.Color(0.52, 0.52, 0.52), sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.07, 0.07, 0.075), envMap, envMapIntensity: 0.2,
  });
  // thin nylon: sunlight shining through from behind lights the dyed cloth (simple diffuse transmission)
  const u = { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uTrans: { value: 0.5 } };
  cm.userData.u = u;
  cm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunV, uSunCol; uniform float uTrans;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float bt = max(0.0, -dot(normal, uSunV)); reflectedLight.directDiffuse += diffuseColor.rgb * diffuseColor.rgb * uSunCol * bt * uTrans; }`);
  };
  cm.customProgramCacheKey = () => 'moonshot-flag-cloth';
  const cloth = add(new THREE.Mesh(geo, cm));
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { cloth, clothMat: cm, top: TOP, width: B * BUNCH, height: A };
  return g;
}

// ------------------------------------------------------------------ seven-segment digits
// Atlas: 16 cells. R = lit glyph, G = ghost (all segments, as on a real EL display).
export const SEG = { blank: 10, plus: 11, minus: 12 };
export function segAtlas() {
  const CW = 96, CH = 160, c = mkCanvas(CW * 16, CH), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  const T = 13, L = 50;                         // segment thickness, length
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
  return toTexture(c, { srgb: false });
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
export function buildDSKY(atlas) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: '#3a3e44', metalness: 0.7, roughness: 0.42, envMapIntensity: 0.7 });
  const bezel = new THREE.MeshStandardMaterial({ color: '#23262a', metalness: 0.6, roughness: 0.5, envMapIntensity: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: '#030504', metalness: 0.0, roughness: 0.32, envMapIntensity: 0.6 });
  const keyM = new THREE.MeshStandardMaterial({ color: '#9d9c97', metalness: 0.05, roughness: 0.55, envMapIntensity: 0.6 });
  const lampOff = new THREE.MeshStandardMaterial({ color: '#6a6964', metalness: 0.1, roughness: 0.35, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.02 });
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
  const compActy = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshBasicMaterial({ color: new THREE.Color(GREEN).multiplyScalar(0.8), toneMapped: false, transparent: true })); compActy.position.set(-0.26, 0.33, 0.001); disp.add(compActy);
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
  return g;
}

// ================================================================== SPACESUITS
// Procedural EVA suits built from swept tubes and lofts (no primitives-on-sticks):
//  · Apollo A7L — white Beta-cloth ITMG with soft folds (normal map baked from a canvas height field),
//    convolute bellows at shoulders / elbows / knees, lunar overshoes (blue-grey ribbed silicone sole whose
//    16 transverse bars match the bootprint texture, side and ankle straps), Chromel-R gloves with blue
//    silicone fingertips, LEVA helmet with a mirror-gold visor, PLSS + OPS backpack, chest RCU, oxygen
//    hoses on red/blue connectors, US flag patch on the left shoulder, regolith staining up the legs.
//  · a modern (Mars) suit in the same spirit: white with grey panels, hard upper torso, slim pack.
// Everything is posed at build time or through setArm() (two-bone IK) without allocation.
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3(), _sd = new THREE.Vector3(), _se = new THREE.Vector3();
const _sm4 = new THREE.Matrix4(), _sq = new THREE.Quaternion(), _sOne = new THREE.Vector3(1, 1, 1);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// convolute bellows: n ribs of the given pitch centred on x = 0 (Hann-windowed)
const convolute = (x, n, pitch, amp) => {
  const hw = n * pitch / 2;
  if (x <= -hw || x >= hw) return 0;
  const w = Math.cos(Math.PI * x / (2 * hw)); return amp * w * w * (0.5 + 0.5 * Math.cos(TAU * x / pitch));
};

// environment for suits: black sky, sunlit ground below a crisp horizon, a small hot sun — the gold visor
// mirrors this panorama; rough Beta cloth picks up the ground bounce as a fill from below
export function suitEnv(renderer, { sun, ground = [0.4, 0.38, 0.35], sky = [0, 0, 0], sunCol = [60, 56, 50], haze = [0.25, 0.22, 0.2] } = {}) {
  const sc = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: sun.clone().normalize() }, uG: { value: new THREE.Vector3(...ground) }, uS: { value: new THREE.Vector3(...sky) }, uSC: { value: new THREE.Vector3(...sunCol) }, uH: { value: new THREE.Vector3(...haze) } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vD; uniform vec3 uSun, uG, uS, uSC, uH;
      void main(){ vec3 d = normalize(vD); float s = max(dot(d, uSun), 0.0);
        float gnd = smoothstep(0.004, -0.02, d.y);
        vec2 az = normalize(uSun.xz + 1e-4), dz = normalize(d.xz + 1e-4);
        vec3 c = mix(uS, uG * (0.75 + 0.35 * max(dot(az, -dz), 0.0)) * (0.7 + 0.3 * smoothstep(-1.0, -0.1, d.y)), gnd);
        c += uSC * pow(s, 3000.0) + uH * pow(s, 40.0) * (1.0 - gnd);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  sc.add(new THREE.Mesh(new THREE.SphereGeometry(10, 96, 48), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0).texture;
  pm.dispose();
  return tex;
}

let _suitTex = null;
// tileable fabric: soft fold creases (mostly running around the limb) + fine basket weave → normal + cavity maps
export function suitTextures() {
  if (_suitTex) return _suitTex;
  const S = 512, r = rng(4242), c = mkCanvas(S), g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, S, S);
  const fold = (x0, y0, len, amp, k, ph, tilt, w, a) => {
    for (const [ox, oy, col, dy] of [[0, 0, 255, 0], [0, 0, 0, w * 0.9]]) {
      g.strokeStyle = `rgba(${col},${col},${col},${a})`; g.lineWidth = w;
      for (const tx of [-S, 0, S]) for (const ty of [-S, 0, S]) {
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const u = i / 24, x = x0 + (u - 0.5) * len, y = y0 + dy + tilt * (x - x0) + Math.sin(u * k * TAU + ph) * amp;
          if (i === 0) g.moveTo(x + tx + ox, y + ty + oy); else g.lineTo(x + tx + ox, y + ty + oy);
        }
        g.stroke();
      }
    }
  };
  g.filter = 'blur(5px)';
  for (let i = 0; i < 26; i++) fold(r() * S, r() * S, S * (0.3 + r() * 0.5), 4 + r() * 12, 0.6 + r() * 1.4, r() * TAU, (r() - 0.5) * 0.5, 7 + r() * 8, 0.35 + r() * 0.3);
  g.filter = 'blur(3px)';
  for (let i = 0; i < 40; i++) fold(r() * S, r() * S, S * (0.12 + r() * 0.25), 2 + r() * 6, 0.5 + r(), r() * TAU, (r() - 0.5) * 0.6, 3 + r() * 3, 0.12 + r() * 0.18);
  g.filter = 'none';
  const src = g.getImageData(0, 0, S, S).data, H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    const weave = 0.018 * (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2) + (((x >> 1) + (y >> 1)) & 1 ? 0.4 : -0.4));
    H[i] = src[i * 4] / 255 + weave;
  }
  const nc = mkCanvas(S), ng = nc.getContext('2d'), nid = ng.createImageData(S, S), nd = nid.data;
  const cc = mkCanvas(S), cg = cc.getContext('2d'), cid = cg.createImageData(S, S), cd = cid.data;
  const k = 5.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, xl = y * S + ((x + S - 1) % S), xr = y * S + ((x + 1) % S), yu = ((y + S - 1) % S) * S + x, yd = ((y + 1) % S) * S + x;
    const dx = (H[xr] - H[xl]) * k, dy = (H[yd] - H[yu]) * k;              // canvas y runs down = -v
    const l = Math.hypot(dx, dy, 1);
    nd[i * 4] = (-dx / l * 0.5 + 0.5) * 255; nd[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; nd[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; nd[i * 4 + 3] = 255;
    const cav = Math.min(1, Math.max(0, 0.9 + (H[i] - 0.5) * 0.5));        // valleys hold a little shade
    cd[i * 4] = cd[i * 4 + 1] = cd[i * 4 + 2] = cav * 255; cd[i * 4 + 3] = 255;
  }
  ng.putImageData(nid, 0, 0); cg.putImageData(cid, 0, 0);
  // US flag shoulder patch (embroidered: a thin border)
  const pc = mkCanvas(228, 128), pg = pc.getContext('2d');
  pg.fillStyle = '#d8d6d0'; pg.fillRect(0, 0, 228, 128);
  drawUSFlag(pg, 8, 8, 112, { red: '#a8182f', blue: '#2f3268' });
  _suitTex = {
    normal: toTexture(nc, { srgb: false, repeat: true }),
    cavity: toTexture(cc, { srgb: false, repeat: true }),
    patch: toTexture(pc),
  };
  return _suitTex;
}

export function suitMaterials({ envMap = null, modern = false } = {}) {
  const T = suitTextures();
  const phys = (o) => new THREE.MeshPhysicalMaterial({ envMap, ...o });
  return {
    fabric: phys({ color: modern ? '#c4c3bf' : '#bab7af', map: T.cavity, normalMap: T.normal, normalScale: new THREE.Vector2(modern ? 0.55 : 1, modern ? 0.55 : 1), roughness: 0.86, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color('#9da1a8'), vertexColors: true, envMapIntensity: 0.55 }),
    cover: phys({ color: modern ? '#c4c3bf' : '#b3b0a8', normalMap: T.normal, normalScale: new THREE.Vector2(0.12, 0.12), roughness: 0.82, sheen: 0.5, sheenRoughness: 0.55, sheenColor: new THREE.Color('#9da1a8'), vertexColors: true, envMapIntensity: 0.55 }),
    shell: phys({ color: modern ? '#d8d8d6' : '#d6d4ce', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, vertexColors: true, envMapIntensity: 0.7 }),
    rubber: phys({ color: modern ? '#4a4e54' : '#7890a6', roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color('#6d86a0'), vertexColors: true, envMapIntensity: 0.4 }),
    chromel: phys({ color: modern ? '#9aa0a6' : '#8f9aa6', metalness: 0.55, roughness: 0.5, normalMap: T.normal, normalScale: new THREE.Vector2(0.5, 0.5), vertexColors: true, envMapIntensity: 0.6 }),
    strap: phys({ color: modern ? '#6c7076' : '#9da2a6', roughness: 0.75, sheen: 0.4, sheenColor: new THREE.Color('#9aa0a8'), vertexColors: true, envMapIntensity: 0.4 }),
    metal: phys({ color: '#b9bcc0', metalness: 1, roughness: 0.3, envMapIntensity: 0.9 }),
    red: phys({ color: '#b01e22', metalness: 0.6, roughness: 0.32, envMapIntensity: 0.8 }),
    blue: phys({ color: '#1e4fb0', metalness: 0.6, roughness: 0.32, envMapIntensity: 0.8 }),
    dark: phys({ color: '#141518', metalness: 0.3, roughness: 0.35, envMapIntensity: 0.6 }),
    visor: phys({ color: '#e8b35a', metalness: 1, roughness: 0.09, clearcoat: 0.35, clearcoatRoughness: 0.04, envMapIntensity: 1.6 }),
    patch: phys({ map: T.patch, roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color('#888888'), envMapIntensity: 0.4 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfe9ff').multiplyScalar(1.5), toneMapped: false }),
  };
}

// finite-difference normals over a (rows × cols) vertex grid; cols wrap (last column duplicates the first)
const gridP = (pos, cols, i, j, o) => { const k = (i * cols + j) * 3; return o.set(pos[k], pos[k + 1], pos[k + 2]); };
function gridNormals(pos, nor, rows, cols, wrap = true) {
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(rows - 1, i + 1);
    let j0 = j - 1, j1 = j + 1;
    if (wrap) { if (j0 < 0) j0 = cols - 2; if (j1 > cols - 1) j1 = 1; } else { j0 = Math.max(0, j0); j1 = Math.min(cols - 1, j1); }
    gridP(pos, cols, i, j1, _sa).sub(gridP(pos, cols, i, j0, _sb));         // around
    gridP(pos, cols, i1, j, _sc).sub(gridP(pos, cols, i0, j, _sd));         // along
    _se.crossVectors(_sa, _sc).normalize();
    const k = (i * cols + j) * 3; nor[k] = _se.x; nor[k + 1] = _se.y; nor[k + 2] = _se.z;
  }
}
function gridIndex(rows, cols) {
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return idx;
}

// A limb tube swept along shoulder→elbow→wrist (or hip→knee→ankle) with a rounded bend. radius(s, L1, L2, R)
// and color(out, s, L1, L2, R, θ) are functions of arc length s and the unit radial direction R (figure space).
class SuitSweep {
  constructor({ rings = 56, segs = 24, radius, color = null, fillet = 0.075, vTile = 0.55, uRep = 1 }) {
    Object.assign(this, { rings, segs, radius, colorFn: color, fillet, vTile, uRep });
    const cols = segs + 1, n = rings * cols;
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3).fill(1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(gridIndex(rings, cols));
    this.geometry = g; this.uv = uv; this.col = col;
    this.rad = new Float32Array(n); this.L = [-1, -1];
    this.d1 = new THREE.Vector3(); this.d2 = new THREE.Vector3(); this.nB = new THREE.Vector3();
    this.C = new THREE.Vector3(); this.T = new THREE.Vector3(); this.B = new THREE.Vector3(); this.R = new THREE.Vector3();
    this.p0 = new THREE.Vector3(); this.p2 = new THREE.Vector3(); this.cc = new THREE.Color();
  }
  pose(a, b, c, hint) {
    const { rings, segs, d1, d2, nB, C, T, B, R } = this, cols = segs + 1;
    d1.subVectors(b, a); const L1 = d1.length(); d1.divideScalar(L1);
    d2.subVectors(c, b); const L2 = d2.length(); d2.divideScalar(L2);
    nB.crossVectors(d1, d2);
    if (nB.lengthSq() < 1e-6) { nB.crossVectors(d1, hint); if (nB.lengthSq() < 1e-6) nB.set(1, 0, 0).cross(d1); }
    nB.normalize();
    const fresh = Math.abs(L1 - this.L[0]) > 1e-4 || Math.abs(L2 - this.L[1]) > 1e-4;
    this.L[0] = L1; this.L[1] = L2;
    const rf = Math.min(this.fillet, 0.45 * L1, 0.45 * L2), Lt = L1 + L2;
    this.p0.copy(b).addScaledVector(d1, -rf); this.p2.copy(b).addScaledVector(d2, rf);
    for (let i = 0; i < rings; i++) {
      const s = i / (rings - 1) * Lt;
      if (s <= L1 - rf) { C.copy(a).addScaledVector(d1, s); T.copy(d1); }
      else if (s >= L1 + rf) { C.copy(b).addScaledVector(d2, s - L1); T.copy(d2); }
      else {
        const u = (s - (L1 - rf)) / (2 * rf), w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
        C.copy(this.p0).multiplyScalar(w0).addScaledVector(b, w1).addScaledVector(this.p2, w2);
        T.copy(d1).multiplyScalar(1 - u).addScaledVector(d2, u).normalize();
      }
      B.crossVectors(T, nB).normalize();
      const nn = _sa.crossVectors(B, T);                                     // re-orthogonalised bend normal
      for (let j = 0; j < cols; j++) {
        const th = j / segs * TAU, k = i * cols + j;
        R.copy(nn).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
        if (fresh) {
          this.rad[k] = this.radius(s, L1, L2, R);
          this.uv[k * 2] = j / segs * this.uRep; this.uv[k * 2 + 1] = s / this.vTile;
          if (this.colorFn) { this.cc.setRGB(1, 1, 1); this.colorFn(this.cc, s, L1, L2, R, th); this.col[k * 3] = this.cc.r; this.col[k * 3 + 1] = this.cc.g; this.col[k * 3 + 2] = this.cc.b; }
        }
        const rr = this.rad[k];
        this.pos[k * 3] = C.x + R.x * rr; this.pos[k * 3 + 1] = C.y + R.y * rr; this.pos[k * 3 + 2] = C.z + R.z * rr;
      }
    }
    gridNormals(this.pos, this.nor, rings, cols);
    const g = this.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    if (fresh) { g.attributes.uv.needsUpdate = true; g.attributes.color.needsUpdate = true; }
    g.computeBoundingSphere();
    return this;
  }
}

// geometry helpers for the suit: white vertex colours (so vertex-coloured materials work on any part)
const withColor = (geo, fn = null) => {
  const p = geo.attributes.position, arr = new Float32Array(p.count * 3).fill(1), c = new THREE.Color();
  if (fn) for (let i = 0; i < p.count; i++) { c.setRGB(1, 1, 1); fn(c, p.getX(i), p.getY(i), p.getZ(i)); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
};
const placeGeo = (geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => {
  _sm4.compose(_sa.set(p[0], p[1], p[2]), _sq.setFromEuler(new THREE.Euler(r[0], r[1], r[2])), _sb.set(s[0], s[1], s[2]));
  return geo.applyMatrix4(_sm4);
};
const mergeSuit = (geos) => {
  const list = geos.map((g) => {
    let n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.color) withColor(n);
    n.clearGroups();
    return n;
  });
  return mergeGeometries(list, false);
};
const meshOf = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; return m; };
// a tube along a smooth curve (hoses, harness straps)
const tubeGeo = (pts, r, seg = 48, rad = 10) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, rad, false);

// dust / panel colourers
const dustMix = (c, w, dust) => { c.r *= 1 - w * (1 - dust.r); c.g *= 1 - w * (1 - dust.g); c.b *= 1 - w * (1 - dust.b); };
const mottle = (x, y) => 0.55 + 0.45 * fbm2(x, y, 3);

// Lunar overshoe (A7L) / modern boot. Local frame: sole contact at y = 0, toe towards −Z (the bootprint's
// convention), ankle collar centre at (0, ankleY, 0.05). Returns merged meshes in a group.
export function buildSuitBoot(M, { modern = false, dust = null, dustK = 0.8, hi = false } = {}) {
  const g = new THREE.Group();
  const W = 0.155, Lh = 0.33;
  const shape = new THREE.Shape();
  shape.moveTo(-W * 0.5, 0.03);
  shape.bezierCurveTo(-W * 0.55, Lh * 0.62, W * 0.55, Lh * 0.62, W * 0.5, 0.03);
  shape.bezierCurveTo(W * 0.45, -Lh * 0.2, W * 0.38, -Lh * 0.3, W * 0.34, -Lh * 0.36);
  shape.bezierCurveTo(W * 0.3, -Lh * 0.46, -W * 0.3, -Lh * 0.46, -W * 0.34, -Lh * 0.36);
  shape.bezierCurveTo(-W * 0.38, -Lh * 0.3, -W * 0.45, -Lh * 0.2, -W * 0.5, 0.03);
  const K = hi ? 72 : 40, NF = hi ? 30 : 18, outline = shape.getSpacedPoints(K).slice(0, K).map((p) => [p.x, -p.y]);   // (x, z), toe at −z
  // sole: thick silicone slab + 16 transverse tread bars (pitch 22 mm — the print's ribs)
  const SOLE_Y = 0.009, SOLE_T = 0.034;
  const soleG = new THREE.ExtrudeGeometry(shape, { depth: SOLE_T, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: hi ? 3 : 2, curveSegments: hi ? 24 : 8 });
  soleG.rotateX(-Math.PI / 2); soleG.translate(0, SOLE_Y, 0);
  const widthAt = (z) => {                                               // outline half-width at z
    let w = 0;
    for (let k = 0; k < K; k++) { const [x0, z0] = outline[k], [x1, z1] = outline[(k + 1) % K]; if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) w = Math.max(w, Math.abs(x0 + (x1 - x0) * (z - z0) / (z1 - z0))); }
    return w;
  };
  const soleParts = [soleG];
  if (!modern) for (let i = 0; i < 16; i++) {
    const z = -0.165 + i * 0.022, w = Math.max(0.03, widthAt(z) * 2 - 0.012);
    if (widthAt(z) < 0.005) continue;                                    // the end bars fall past the toe / heel: they would float off the sole
    soleParts.push(placeGeo(new RoundedBoxGeometry(w, 0.013, 0.0114, 1, 0.003), [0, 0.0055, z]));
  } else for (let i = 0; i < 9; i++) {
    const z = -0.16 + i * 0.04, w = Math.max(0.03, widthAt(z) * 2 - 0.014);
    for (const sx of [-1, 1]) soleParts.push(placeGeo(new RoundedBoxGeometry(w * 0.44, 0.012, 0.022, 1, 0.004), [sx * w * 0.25, 0.006, z], [0, sx * 0.35, 0]));
  }
  // the upper: a loft from the sole outline up to an ankle collar (vertical walls curving into a domed toe)
  const ANK = { x: 0, z: 0.05, rx: 0.083, rz: 0.09 }, Y0 = SOLE_Y + SOLE_T + 0.002, YF = modern ? 0.17 : 0.2, YT = modern ? 0.24 : 0.28;
  const outlineAt = (u, o) => {                                          // u ∈ [0,1) around, linear between samples
    const x = ((u % 1) + 1) % 1 * K, k0 = Math.floor(x) % K, k1 = (k0 + 1) % K, t = x - Math.floor(x);
    o[0] = outline[k0][0] + (outline[k1][0] - outline[k0][0]) * t; o[1] = outline[k0][1] + (outline[k1][1] - outline[k0][1]) * t; return o;
  };
  const oo = [0, 0];
  const P = (u, f, out) => {                                             // f ∈ [0,1] foot, (1, 1.6] collar
    outlineAt(u, oo);
    const phi = Math.atan2(oo[1] - ANK.z, oo[0] - ANK.x);
    const ax = ANK.x + Math.cos(phi) * ANK.rx, az = ANK.z + Math.sin(phi) * ANK.rz;
    if (f <= 1) {
      const gk = Math.pow(f, 1.7), bul = 1 + 0.06 * Math.sin(Math.PI * Math.min(1, f * 1.3));
      const ox = ANK.x + (oo[0] - ANK.x) * bul, oz = ANK.z + (oo[1] - ANK.z) * bul;
      const inset = 0.004 * (1 - f);
      out.set(ox + (ax - ox) * gk - Math.cos(phi) * inset, Y0 + f * (YF - Y0), oz + (az - oz) * gk - Math.sin(phi) * inset);
    } else {
      const c = (f - 1) / 0.6, pinch = 1 - 0.08 * sstep(0.6, 1, c);
      out.set(ANK.x + Math.cos(phi) * ANK.rx * pinch, YF + c * (YT - YF), ANK.z + Math.sin(phi) * ANK.rz * pinch);
    }
    return out;
  };
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3(), pd = new THREE.Vector3(), nrm = new THREE.Vector3();
  let orient = 1;
  { P(0.5, 0.3, pa); P(0.5 + 0.001, 0.3, pb); P(0.5, 0.301, pc); pb.sub(pa); pc.sub(pa); nrm.crossVectors(pb, pc); pd.set(pa.x - ANK.x, 0, pa.z - ANK.z); orient = nrm.dot(pd) > 0 ? 1 : -1; }
  // a surface patch over (u0..u1) × (f0..f1), pushed out along the normal by `off`
  const surf = (u0, u1, nu, f0, f1, nf, off = 0, colFn = null) => {
    const cols = nu + 1, rows = nf + 1, pos = new Float32Array(rows * cols * 3), nor = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), col = new Float32Array(rows * cols * 3), c = new THREE.Color();
    const e = 1e-3;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const f = f0 + (f1 - f0) * i / nf, u = u0 + (u1 - u0) * j / nu, k = i * cols + j;
      P(u, f, pa); P(u + e, f, pb).sub(P(u - e, f, pc)); P(u, Math.min(1.6, f + e), pc).sub(P(u, Math.max(0, f - e), pd));
      nrm.crossVectors(pb, pc).normalize().multiplyScalar(orient);
      pa.addScaledVector(nrm, off);
      pos.set([pa.x, pa.y, pa.z], k * 3); nor.set([nrm.x, nrm.y, nrm.z], k * 3);
      uv[k * 2] = u * 1.4; uv[k * 2 + 1] = pa.y / 0.55;
      c.setRGB(1, 1, 1); if (colFn) colFn(c, pa, u, f); col.set([c.r, c.g, c.b], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const idx = gridIndex(rows, cols);
    if (orient < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    geo.setIndex(idx);
    return geo;
  };
  const dustC = dust ?? new THREE.Color(1, 1, 1);
  const bootDust = (c, p) => { if (dust) dustMix(c, dustK * (0.35 + 0.65 * sstep(0.2, 0.03, p.y)) * mottle(p.x * 30 + p.z * 20, p.y * 40), dustC); };
  const upper = surf(0, 1, K, 0, 1.6, NF, 0, bootDust);
  const fabricParts = [upper];
  const strapParts = [], rubberParts = [], metalParts = [];
  // silicone rand: the sole wraps a few centimetres up the foot
  rubberParts.push(surf(0, 1, K, 0, modern ? 0.1 : 0.16, 3, 0.0025, (c, p) => { if (dust) dustMix(c, 0.4 * mottle(p.x * 40, p.z * 40), dustC); }));
  // landmarks on the outline: heel (max z) and the two sides at mid-foot
  let kH = 0, kL = 0, kR = 0, kT = 0;
  outline.forEach(([x, z], k) => { if (z > outline[kH][1]) kH = k; if (z < outline[kT][1]) kT = k; if (Math.abs(z + 0.01) < 0.05) { if (x < outline[kL][0] || Math.abs(outline[kL][1] + 0.01) >= 0.05) kL = k; if (x > outline[kR][0] || Math.abs(outline[kR][1] + 0.01) >= 0.05) kR = k; } });
  const uH = kH / K, uL = kL / K, uR = kR / K, uT = kT / K;
  if (!modern) {
    // front closure flap over the instep, and the welt seam where the upper meets the silicone rand
    fabricParts.push(surf(uT - 0.05, uT + 0.05, hi ? 10 : 5, 0.3, 1.45, hi ? 18 : 9, 0.0035, bootDust));
    strapParts.push(surf(0, 1, K, 0.2, 0.235, 1, 0.0022, bootDust));
    // ankle strap (with a buckle on the outboard side), heel tab, and a strap down each side of the foot
    strapParts.push(surf(0, 1, K, 1.12, 1.26, 2, 0.004, bootDust));
    strapParts.push(surf(0, 1, K, 1.5, 1.6, 2, 0.003, bootDust));      // cuff
    for (const uc of [uL, uR]) strapParts.push(surf(uc - 0.016, uc + 0.016, hi ? 4 : 2, 0.12, 1.14, hi ? 12 : 6, 0.0035, bootDust));
    strapParts.push(surf(uH - 0.012, uH + 0.012, hi ? 3 : 2, 0.12, 1.2, hi ? 12 : 6, 0.0045, bootDust));
    for (const uc of [uL]) { P(uc, 1.19, pa); pb.set(pa.x - ANK.x, 0, pa.z - ANK.z).normalize(); metalParts.push(placeGeo(new RoundedBoxGeometry(0.022, 0.03, 0.008, 1, 0.003), [pa.x + pb.x * 0.007, pa.y, pa.z + pb.z * 0.007], [0, Math.atan2(pb.x, pb.z), 0])); }
  } else {
    strapParts.push(surf(0, 1, K, 1.3, 1.6, 4, 0.004));                  // grey cuff
    strapParts.push(surf(uH - 0.06, uH + 0.06, 6, 0.1, 0.55, 6, 0.0025));          // heel counter
  }
  soleParts.forEach((s) => withColor(s, (c, x, y, z) => { if (dust) dustMix(c, 0.5 * mottle(x * 40, z * 40), dustC); }));
  g.add(meshOf(mergeSuit(soleParts.concat(rubberParts)), M.rubber));
  g.add(meshOf(mergeSuit(fabricParts), M.fabric));
  g.add(meshOf(mergeSuit(strapParts), M.strap));
  if (metalParts.length) g.add(meshOf(mergeSuit(metalParts), M.metal));
  g.userData.ankle = new THREE.Vector3(ANK.x, YF + 0.03, ANK.z);
  return g;
}

// Glove. Local frame: wrist at the origin, fingers along +Y, palm facing −Z, thumb towards +X·side.
function buildGlove(M, { side = 1, curl = 0.25, modern = false, ring = null } = {}) {
  const g = new THREE.Group();
  const body = [], tips = [], rings = [];
  // gauntlet cuff (the forearm tube ends inside it) and palm
  body.push(new THREE.LatheGeometry([[0.056, -0.11], [0.066, -0.1], [0.063, -0.06], [0.052, -0.01], [0.046, 0.012]].map(([r, y]) => new THREE.Vector2(r, y)), 20));
  body.push(placeGeo(new RoundedBoxGeometry(0.09, 0.1, 0.042, 2, 0.018), [0, 0.055, 0.002]));
  rings.push(placeGeo(new THREE.TorusGeometry(0.058, 0.009, 8, 24), [0, -0.105, 0], [Math.PI / 2, 0, 0]));
  // fingers: two phalanges each, the distal one a silicone tip; curled toward the palm (−Z)
  const fx = [-0.031, -0.0105, 0.0105, 0.031], fl = [0.034, 0.04, 0.038, 0.03];
  fx.forEach((x, i) => {
    const r = 0.0118 - (i === 0 || i === 3 ? 0.0012 : 0), base = new THREE.Vector3(x * side, 0.1, 0);
    const a1 = curl * (0.9 + 0.1 * i), a2 = curl * 1.3;
    const d1 = new THREE.Vector3(0, Math.cos(a1), -Math.sin(a1)), mid = base.clone().addScaledVector(d1, fl[i]);
    const d2 = new THREE.Vector3(0, Math.cos(a1 + a2), -Math.sin(a1 + a2)), end = mid.clone().addScaledVector(d2, fl[i] * 0.72);
    const seg = (a, b, rr, list) => { const cg = new THREE.CapsuleGeometry(rr, a.distanceTo(b), 4, 10); _sq.setFromUnitVectors(_sa.set(0, 1, 0), _sb.subVectors(b, a).normalize()); _sm4.compose(_sc.copy(a).lerp(b, 0.5), _sq, _sOne); list.push(cg.applyMatrix4(_sm4)); };
    seg(base, mid, r, body); seg(mid, end, r * 0.97, tips);
  });
  // thumb: from the palm's side, angled across the palm
  const tb = new THREE.Vector3(0.042 * side, 0.03, -0.012), td = new THREE.Vector3(0.45 * side, 0.8, -0.4 - curl * 0.5).normalize();
  const tm = tb.clone().addScaledVector(td, 0.04), te = tm.clone().addScaledVector(td.clone().add(new THREE.Vector3(-0.3 * side, 0, -0.3 * curl)).normalize(), 0.03);
  { const cg = new THREE.CapsuleGeometry(0.0135, tb.distanceTo(tm), 4, 10); _sq.setFromUnitVectors(_sa.set(0, 1, 0), _sb.subVectors(tm, tb).normalize()); _sm4.compose(_sc.copy(tb).lerp(tm, 0.5), _sq, _sOne); body.push(cg.applyMatrix4(_sm4)); }
  { const cg = new THREE.CapsuleGeometry(0.0125, tm.distanceTo(te), 4, 10); _sq.setFromUnitVectors(_sa.set(0, 1, 0), _sb.subVectors(te, tm).normalize()); _sm4.compose(_sc.copy(tm).lerp(te, 0.5), _sq, _sOne); tips.push(cg.applyMatrix4(_sm4)); }
  g.add(meshOf(mergeSuit(body), modern ? M.fabric : M.chromel), meshOf(mergeSuit(tips), M.rubber), meshOf(mergeSuit(rings), ring ?? M.metal));
  return g;
}

// Helmet (LEVA over the pressure bubble). Local frame: head centre at the origin, face towards +Z.
function buildHelmet(M, { modern = false } = {}) {
  const g = new THREE.Group(), R = 0.208;
  const FRONT = Math.PI / 2;                                             // three.js sphere: phi = π/2 → +Z
  g.add(meshOf(new THREE.SphereGeometry(R * 0.93, 20, 12), M.dark));
  const shellParts = [
    new THREE.SphereGeometry(R, 44, 10, 0, TAU, 0, 0.62),                          // crown (over the visor)
    new THREE.SphereGeometry(R, 40, 22, FRONT + 1.08, TAU - 2.16, 0.6, 1.72),        // back and sides
  ];
  if (!modern) shellParts.push(new THREE.SphereGeometry(R * 1.035, 36, 3, FRONT - 1.12, 2.24, 0.52, 0.12));  // visor brow frame
  else shellParts.push(new THREE.SphereGeometry(R * 1.03, 36, 3, FRONT - 1.1, 2.2, 0.5, 0.1));
  const shell = mergeSuit(shellParts.map((s) => withColor(s, modern ? (c, x, y, z) => { if (Math.abs(x) > 0.16 && y > -0.05) c.setRGB(0.58, 0.6, 0.63); } : null)));
  g.add(meshOf(shell, M.shell));
  // gold sun visor, a hair proud of the shell
  const visor = meshOf(new THREE.SphereGeometry(R * 1.02, 48, 26, FRONT - 1.1, 2.2, 0.6, modern ? 1.45 : 1.55), M.visor);
  g.add(visor);
  // pivots, neck ring
  const bits = [], metal = [];
  for (const sx of [-1, 1]) metal.push(placeGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 16), [sx * R * 1.04, 0.0, 0.0], [0, 0, Math.PI / 2]));
  metal.push(placeGeo(new THREE.TorusGeometry(0.135, 0.017, 10, 36), [0, -0.175, -0.01], [Math.PI / 2, 0, 0]));
  bits.push(placeGeo(new THREE.CylinderGeometry(0.135, 0.15, 0.06, 36, 1, true), [0, -0.2, -0.01]));
  if (modern) {
    // side lamp / camera pods
    for (const sx of [-1, 1]) bits.push(placeGeo(new RoundedBoxGeometry(0.05, 0.05, 0.1, 2, 0.012), [sx * R * 1.08, 0.07, 0.02]));
  }
  g.add(meshOf(mergeSuit(metal), M.metal), meshOf(mergeSuit(bits), M.shell));
  if (modern) for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), M.lamp); l.position.set(sx * R * 1.08, 0.07, 0.071); g.add(l); }
  g.userData.visor = visor;
  return g;
}

// Full suited figure (≈1.85 m). Faces +Z, feet on y = 0. legs: [{hip, knee, ankle, yaw, pitch}] ×2 (figure's
// left = +X first). Returns { group, setArm(i, palmTarget, elbowHint) } — i = 0 left (+X), 1 right.
export function buildSuitFigure(M, { modern = false, legs, dust = null, curl = [0.3, 0.3] } = {}) {
  const g = new THREE.Group();
  const dustC = dust ?? new THREE.Color(1, 1, 1);
  const panel = new THREE.Color(0.6, 0.62, 0.66);
  // ---- torso: a swept D-section from the crotch to the neck ring (wide, flat-backed)
  const torso = new SuitSweep({
    rings: 40, segs: 36, fillet: 0.01, vTile: 0.6, uRep: 2,
    radius: (s, L1, L2, R) => {
      const y = 0.84 + s;
      const prof = [[0.84, 0.1], [0.9, 0.175], [0.98, 0.205], [1.1, 0.198], [1.25, 0.222], [1.4, 0.228], [1.49, 0.21], [1.56, 0.16], [1.61, 0.13]];
      let r = prof[0][1];
      for (let i = 0; i < prof.length - 1; i++) if (y >= prof[i][0]) { const [y0, r0] = prof[i], [y1, r1] = prof[i + 1]; r = r0 + (r1 - r0) * sstep(0, 1, (y - y0) / (y1 - y0)); }
      const ax = 1.2, az = R.z > 0 ? (modern ? 0.86 : 0.8) : 0.74;
      const e = 1 / Math.hypot(R.x / ax, R.z / az, R.y);
      const bag = modern ? 1 : 1 + 0.025 * noise4(R.x * 2, R.z * 2, y * 7, 1.3);
      return r * e * bag;
    },
    color: (c, s, L1, L2, R) => {
      const y = 0.84 + s;
      if (modern) { if (Math.abs(R.x) > 0.8 && y < 1.45 || (y > 1.03 && y < 1.1)) c.copy(panel); }
      else if (dust) dustMix(c, 0.25 * sstep(1.05, 0.86, y) * mottle(R.x * 3 + R.z * 5, y * 9), dustC);
    },
  }).pose(new THREE.Vector3(0, 0.84, 0), new THREE.Vector3(0, 1.225, 0), new THREE.Vector3(0, 1.61, 0), new THREE.Vector3(0, 0, 1));
  g.add(meshOf(torso.geometry, M.fabric));
  const fabricBits = [placeGeo(withColor(new THREE.SphereGeometry(0.12, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2)), [0, 0.85, 0], [0, 0, 0], [1.25, 0.7, 0.85])];
  // ---- legs (convolute knees; regolith staining climbing from the boots)
  const legR = (s, L1, L2, R) => {
    const x = s - L1;
    let r = s < L1 ? 0.128 - 0.02 * sstep(0, L1, s) : 0.108 - 0.022 * sstep(0, L2, x);
    r += convolute(x + 0.01, modern ? 3 : 6, 0.03, modern ? 0.006 : 0.011);
    r += 0.006 * Math.exp(-((((L2 - x) - 0.03) / 0.025) ** 2));            // fabric bunched over the boot cuff
    if (!modern) r *= 1 + 0.035 * noise4(R.x * 1.6, R.y * 1.6, R.z * 1.6, s * 5);
    return r;
  };
  const legSweeps = [];
  legs.forEach((L, li) => {
    const sx = L.side ?? (li === 0 ? 1 : -1);
    const sweep = new SuitSweep({
      rings: 50, segs: 22, fillet: 0.09, radius: legR,
      color: (c, s, L1, L2, R) => {
        const x = s - L1;
        if (modern) { if (Math.abs(x) < 0.07 || R.x * sx > 0.75) c.copy(panel); if (dust) dustMix(c, 0.5 * sstep(L2 - 0.3, L2, x) * mottle(R.x * 4 + s * 9, R.z * 4), dustC); return; }
        if (dust) dustMix(c, Math.min(1, 0.95 * sstep(L2 - 0.55, L2 - 0.05, x) + 0.35 * Math.exp(-(((x + 0.02) / 0.06) ** 2)) * sstep(-0.2, 0.6, R.z)) * mottle(R.x * 3.5 + s * 7, R.z * 3.5 + s * 3), dustC);
      },
    }).pose(L.hip, L.knee, L.ankle, new THREE.Vector3(sx, 0, 0));
    const legMesh = meshOf(sweep.geometry, M.fabric); g.add(legMesh);
    legSweeps.push(sweep);
    if (L.free) { legMesh.frustumCulled = false; return; }      // re-posed at runtime (sweep.pose); the caller supplies the boot
    const boot = buildSuitBoot(M, { modern, dust });
    boot.rotation.set(L.pitch ?? 0, Math.PI + (L.yaw ?? 0), 0, 'YXZ');
    boot.updateMatrix();
    const ak = boot.userData.ankle.clone().applyEuler(boot.rotation);
    boot.position.copy(L.ankle).sub(ak);
    if (L.ground != null) boot.position.y = Math.max(boot.position.y, L.ground);
    g.add(boot);
  });
  // ---- shoulders + arms (IK)
  const armR = (s, L1, L2, R) => {
    const x = s - L1;
    let r = s < L1 ? 0.098 - 0.018 * sstep(0.05, L1, s) : 0.08 - 0.022 * sstep(0, L2, x);
    r += convolute(x + 0.005, modern ? 3 : 5, 0.026, modern ? 0.005 : 0.0085);
    r += convolute(s - 0.085, modern ? 2 : 4, 0.03, modern ? 0.005 : 0.009);
    if (!modern) r *= 1 + 0.03 * noise4(R.x * 1.6, R.y * 1.6, R.z * 1.6, s * 5 + 7);
    return r;
  };
  const L1 = 0.3, L2 = 0.27, HAND = 0.075;
  const patchR = 0.1;
  const arms = [1, -1].map((sx, i) => {
    const sh = new THREE.Vector3(sx * 0.265, 1.465, 0.0);
    fabricBits.push(placeGeo(withColor(new THREE.SphereGeometry(0.112, 24, 14)), [sh.x, sh.y, sh.z], [0, 0, 0], [1, 1.05, 1]));
    const sweep = new SuitSweep({
      rings: 44, segs: 20, fillet: 0.06, radius: armR,
      color: (c, s, a, b, R) => { const x = s - a; if (modern && (Math.abs(x) < 0.05 || s < 0.12)) c.copy(panel); else if (dust) dustMix(c, 0.15 * mottle(s * 9, R.x * 3), dustC); },
    });
    const mesh = meshOf(sweep.geometry, M.fabric); mesh.frustumCulled = false; g.add(mesh);
    const glove = buildGlove(M, { side: sx, curl: curl[i], modern, ring: modern ? M.metal : (sx > 0 ? M.red : M.blue) }); g.add(glove);
    let patch = null;
    if (sx > 0) {
      const pg = new THREE.CylinderGeometry(patchR, patchR, 0.06, 12, 1, true, -0.55, 1.1);
      const uv = pg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k));
      patch = new THREE.Mesh(pg, M.patch); patch.castShadow = false; patch.receiveShadow = true; g.add(patch);
    }
    return { sx, sh, sweep, glove, patch, e: new THREE.Vector3(), w: new THREE.Vector3(), h: new THREE.Vector3() };
  });
  g.add(meshOf(mergeSuit(fabricBits), M.fabric));
  // ---- helmet
  const helmet = buildHelmet(M, { modern }); helmet.position.set(0, 1.775, 0.03); g.add(helmet);
  // ---- life support: PLSS + OPS (A7L) or a slim integrated pack (modern); chest RCU; hoses; connectors
  const pack = [], packShell = [], metal = [], dark = [], hose = [];
  if (!modern) {
    pack.push(placeGeo(new RoundedBoxGeometry(0.47, 0.62, 0.25, 3, 0.05), [0, 1.3, -0.3]));
    pack.push(placeGeo(new RoundedBoxGeometry(0.44, 0.19, 0.23, 3, 0.045), [0, 1.715, -0.295]));
    dark.push(placeGeo(new THREE.BoxGeometry(0.47, 0.012, 0.252), [0, 1.61, -0.3]));             // PLSS / OPS parting line
    metal.push(placeGeo(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 6), [0.17, 1.98, -0.36], [0.12, 0, 0.08]));
    metal.push(placeGeo(new THREE.SphereGeometry(0.009, 8, 6), [0.184, 2.15, -0.34]));
    // harness straps over the shoulders
    for (const sx of [-1, 1]) hose.push(tubeGeo([[sx * 0.16, 1.58, -0.2], [sx * 0.17, 1.62, -0.05], [sx * 0.16, 1.55, 0.13], [sx * 0.13, 1.42, 0.18]], 0.017, 20, 8));
    // RCU on the chest
    pack.push(placeGeo(new RoundedBoxGeometry(0.2, 0.12, 0.085, 2, 0.015), [0, 1.33, 0.225]));
    metal.push(placeGeo(new RoundedBoxGeometry(0.17, 0.085, 0.01, 1, 0.004), [0, 1.33, 0.268]));
    dark.push(placeGeo(new RoundedBoxGeometry(0.05, 0.025, 0.006, 1, 0.002), [-0.04, 1.35, 0.274]), placeGeo(new RoundedBoxGeometry(0.05, 0.025, 0.006, 1, 0.002), [0.04, 1.35, 0.274]));
    for (const [x, rr] of [[-0.07, 0.013], [-0.02, 0.011], [0.045, 0.016]]) metal.push(placeGeo(new THREE.CylinderGeometry(rr, rr, 0.02, 14), [x, 1.395, 0.23]));
    // oxygen hoses: from the PLSS round the right hip to the blue (inlet) and red (outlet) connectors
    hose.push(tubeGeo([[-0.2, 1.05, -0.24], [-0.29, 1.06, -0.08], [-0.25, 1.12, 0.1], [-0.13, 1.17, 0.19]], 0.02, 28, 10));
    hose.push(tubeGeo([[-0.17, 1.03, -0.24], [-0.27, 1.0, -0.06], [-0.22, 1.05, 0.12], [-0.08, 1.1, 0.2]], 0.02, 28, 10));
    // RCU cable up over the shoulder
    hose.push(tubeGeo([[0.21, 1.6, -0.2], [0.2, 1.6, 0.0], [0.13, 1.5, 0.17], [0.07, 1.38, 0.23]], 0.008, 24, 6));
  } else {
    pack.push(placeGeo(new RoundedBoxGeometry(0.46, 0.66, 0.2, 4, 0.07), [0, 1.36, -0.28]));
    packShell.push(placeGeo(withColor(new RoundedBoxGeometry(0.42, 0.2, 0.05, 2, 0.02), (c) => c.copy(panel)), [0, 1.5, -0.39]));
    packShell.push(placeGeo(withColor(new RoundedBoxGeometry(0.4, 0.12, 0.2, 3, 0.03), (c) => c.copy(panel)), [0, 1.07, -0.25]));
    // hard upper torso front + DCM chest box
    packShell.push(placeGeo(withColor(new THREE.SphereGeometry(0.235, 32, 12, 0, TAU, 0.5, 1.0), (c, x, y, z) => { if (y < 0.05 && y > 0.02) c.copy(panel); }), [0, 1.3, 0.0], [0, 0, 0], [1.14, 1, 0.8]));
    packShell.push(placeGeo(withColor(new RoundedBoxGeometry(0.22, 0.1, 0.08, 2, 0.02), (c) => c.copy(panel)), [0, 1.26, 0.2]));
    dark.push(placeGeo(new RoundedBoxGeometry(0.15, 0.05, 0.01, 1, 0.004), [0, 1.27, 0.242]));
    hose.push(tubeGeo([[-0.2, 1.08, -0.2], [-0.27, 1.12, -0.02], [-0.18, 1.2, 0.16], [-0.09, 1.22, 0.2]], 0.014, 30, 10));
  }
  // gas connectors on the torso front: blue (inlet) / red (outlet); the unused pair capped on the left
  const conn = (x, y, z, m) => { const c = placeGeo(new THREE.CylinderGeometry(0.026, 0.028, 0.03, 18), [x, y, z], [Math.PI / 2 - 0.25, 0, 0]); (m === 'red' ? red : blue).push(c); };
  const red = [], blue = [];
  if (!modern) { conn(-0.13, 1.17, 0.185, 'blue'); conn(-0.08, 1.1, 0.19, 'red'); conn(0.08, 1.17, 0.188, 'blue'); conn(0.13, 1.1, 0.183, 'red'); }
  else { conn(-0.09, 1.22, 0.2, 'blue'); }
  g.add(meshOf(mergeSuit(pack), M.cover));
  if (packShell.length) g.add(meshOf(mergeSuit(packShell), M.shell));
  if (metal.length) g.add(meshOf(mergeSuit(metal), M.metal));
  g.add(meshOf(mergeSuit(dark), M.dark), meshOf(mergeSuit(hose), M.strap));
  if (red.length) g.add(meshOf(mergeSuit(red), M.red));
  g.add(meshOf(mergeSuit(blue), M.blue));

  // ---- two-bone IK: shoulder → elbow → palm centre; the glove extends the forearm
  const d = new THREE.Vector3(), q = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const LT = L2 + HAND;
  function setArm(i, target, hint, palm = null) {
    const A = arms[i];
    d.subVectors(target, A.sh); let dist = d.length(); d.normalize();
    dist = Math.min(dist, L1 + LT - 0.005);
    A.h.copy(A.sh).addScaledVector(d, dist);
    const a = (L1 * L1 - LT * LT + dist * dist) / (2 * dist), k = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    q.copy(hint).addScaledVector(d, -hint.dot(d)).normalize();
    A.e.copy(A.sh).addScaledVector(d, a).addScaledVector(q, k);
    Y.subVectors(A.h, A.e).normalize();
    A.w.copy(A.e).addScaledVector(Y, L2);
    A.sweep.pose(A.sh, A.e, A.w, q);
    // glove frame: +Y along the forearm, palm (−Z) toward `palm` (default: toward the body's midline)
    Z.copy(palm ?? _sd.set(-A.sx, 0, 0)).negate(); Z.addScaledVector(Y, -Z.dot(Y));
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
    Z.normalize(); X.crossVectors(Y, Z);
    _sm4.makeBasis(X, Y, Z); A.glove.quaternion.setFromRotationMatrix(_sm4); A.glove.position.copy(A.w);
    if (A.patch) {
      // shoulder patch: on the outboard face of the upper arm, stars up
      const ua = _sa.subVectors(A.e, A.sh).normalize();
      const out = _sb.set(A.sx, 0.15, 0).addScaledVector(ua, -_sb.set(A.sx, 0.15, 0).dot(ua)).normalize();
      const yax = _sc.copy(ua).negate(), xax = _sd.crossVectors(yax, out);
      _sm4.makeBasis(xax, yax, out); A.patch.quaternion.setFromRotationMatrix(_sm4);
      const rr = armR(0.13, L1, L2, out) + 0.003;
      A.patch.position.copy(A.sh).addScaledVector(ua, 0.13).addScaledVector(out, rr - patchR);
      A.patch.scale.setScalar(1);
    }
  }
  // neutral pose
  setArm(0, new THREE.Vector3(0.36, 0.98, 0.05), new THREE.Vector3(0.3, 0, -1).normalize());
  setArm(1, new THREE.Vector3(-0.36, 0.98, 0.05), new THREE.Vector3(-0.3, 0, -1).normalize());
  return { group: g, setArm, helmet, visor: helmet.userData.visor, legSweeps };
}

// the macro-shot boot: a lunar overshoe and the leg above it (knee convolute, regolith-stained shin)
export function buildBootLeg(M, { dust = null } = {}) {
  const g = new THREE.Group();
  const boot = buildSuitBoot(M, { dust, dustK: 0.55, hi: true }); g.add(boot);
  const ak = boot.userData.ankle;
  const dustC = dust ?? new THREE.Color(1, 1, 1);
  const sweep = new SuitSweep({
    rings: 70, segs: 32, fillet: 0.12,
    radius: (s, L1, L2, R) => {
      const x = s - L1;
      let r = s < L1 ? 0.118 - 0.02 * sstep(0, L1, s) : 0.1 - 0.024 * sstep(0.05, L2, x);
      r += convolute(x + 0.01, 6, 0.03, 0.011);
      r += 0.006 * Math.exp(-((((L2 - x) - 0.025) / 0.02) ** 2));            // fabric bunched over the overshoe cuff
      return r * (1 + 0.04 * noise4(R.x * 1.6, R.y * 1.6, R.z * 1.6, s * 5));
    },
    color: (c, s, L1, L2, R) => { const x = s - L1; if (dust) dustMix(c, Math.min(1, 0.9 * sstep(L2 - 0.5, L2 - 0.05, x)) * mottle(R.x * 3.5 + s * 7, R.z * 3.5 + s * 3), dustC); },
  }).pose(new THREE.Vector3(0, 1.3, 0.12), new THREE.Vector3(0, 0.66, -0.05), new THREE.Vector3(ak.x, ak.y + 0.01, ak.z), new THREE.Vector3(1, 0, 0));
  g.add(meshOf(sweep.geometry, M.fabric));
  return g;
}
