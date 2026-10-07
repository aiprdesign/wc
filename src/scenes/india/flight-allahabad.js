// THE DREAM OF FLIGHT — the 1911 Allahabad exhibition grounds and the 1932 Juhu sands, built for the polish pass:
// procedural (world-space, period-free) ground shaders for the mowed field and the beach, foam lace, the
// Indo-Saracenic exhibition halls, a grandstand, striped shamianas, bunting, a dense and varied crowd of
// stylised figures (turbans, saris, sola topis, parasols — no faces), shade trees and country boats on the river.
// Everything is built once; flight.js only sets a few uniforms per frame (pure functions of t).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, TAU } from '../../lib/math.js';
import { fbm2, GLSL_NOISE } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { V3, bake, merge, tint, box, cyl, rod, lathe, plate, gridSurf } from './flight-assets.js';

const UP = V3(0, 1, 0);

// ------------------------------------------------------------------ procedural ground (no texture, no period)
// kind 'field': winter grass of the polo ground, mowed in stripes, tyre tracks of the practice runs, trampled
// dust along the crowd lines, a sandy river bank and cultivated land across the river.
// kind 'sand': Juhu — wind ripples, dunes, the tide line of weed, wet glossy sand toward the surf, wheel tracks.
const GROUND_COMMON = /* glsl */ `
varying vec3 vGW;
${GLSL_NOISE}
float lineMask(float d, float w, float fw){ return 1.0 - smoothstep(w, w + fw * 1.5 + 0.01, abs(d)); }
`;
const FIELD_FN = /* glsl */ `
vec3 groundCol(vec2 p, float fw, out float rough, out float h){
  float dF = 1.0 - smoothstep(0.08, 0.45, fw * 2.5);           // fade fine detail where a pixel covers it
  float dM = 1.0 - smoothstep(0.4, 3.0, fw);
  float m1 = snoise(vec3(p * 0.0045, 1.3)), m2 = snoise(vec3(p * 0.021, 4.7)), m3 = snoise(vec3(p * 0.09, 8.1));
  float f1 = snoise(vec3(p * 0.55, 2.2)) * dM, f2 = snoise(vec3(p * 2.7, 5.5)) * dF, f3 = snoise(vec3(p * 9.0, 3.1)) * dF;
  vec3 green = vec3(0.085, 0.24, 0.045), olive = vec3(0.16, 0.29, 0.07), straw = vec3(0.36, 0.36, 0.15), dust = vec3(0.47, 0.38, 0.25);
  vec3 c = mix(green, olive, smoothstep(-0.7, 0.7, m1));
  c = mix(c, straw, smoothstep(0.25, 0.9, m2) * 0.3);
  float blade = snoise(vec3(p.x * 1.2, p.y * 7.0, 4.4)) * dF;          // streaky grass, combed by the mower
  c *= 0.9 + 0.12 * m3 + 0.07 * f1 + 0.035 * f2 + 0.02 * f3 + 0.04 * blade;
  h = 0.45 * f2 + 0.25 * f3 + 0.3 * blade;
  rough = 0.95;
  // the polo ground: mowed in long stripes running with the take-off (along x)
  float inField = (1.0 - smoothstep(16.5, 18.5, abs(p.x))) * smoothstep(-64.0, -58.0, p.y) * (1.0 - smoothstep(10.0, 16.0, p.y));
  float sw = p.y + 0.35 * snoise(vec3(p * 0.03, 9.0));
  float stripe = smoothstep(-0.12, 0.12, sin(sw * 3.14159 / 4.2));
  c *= mix(1.0, mix(0.86, 1.1, stripe), inField * dM);
  c = mix(c, c * vec3(1.02, 1.04, 0.92), inField * 0.4);
  // the take-off run of the Humber-Sommer (two pairs of skid-wheels) and older practice runs
  float tr = 0.0;
  for (int k = 0; k < 4; k++) {
    float z0 = k == 0 ? -4.0 : k == 1 ? -9.5 : k == 2 ? 0.8 : -15.0;
    float cv = k == 0 ? 0.0 : k == 1 ? 0.0016 : k == 2 ? -0.0011 : 0.0024;
    float x0 = k == 0 ? -19.0 : -18.0, x1 = k == 0 ? -10.2 : k == 1 ? 12.0 : k == 2 ? 6.0 : 15.0;
    float zc = z0 + cv * (p.x - x0) * (p.x - x0) + 0.08 * snoise(vec3(p.x * 0.08, float(k), 0.0));
    float d = p.y - zc, m = 0.0;
    m = max(m, lineMask(abs(d) - 0.73, 0.055, fw)); m = max(m, lineMask(abs(d) - 1.17, 0.055, fw));
    float along = smoothstep(x0, x0 + 1.5, p.x) * (1.0 - smoothstep(x1 - 3.0, x1, p.x));
    tr = max(tr, m * along * (k == 0 ? 1.0 : 0.55) * (0.65 + 0.35 * snoise(vec3(p * 0.4, 2.0 + float(k)))));
  }
  c = mix(c, c * vec3(0.62, 0.6, 0.55) + vec3(0.03, 0.02, 0.01), tr * 0.85);
  h -= tr * 0.6;
  // trampled dust along the crowd lines and round the tents, worn foot paths
  float crowdLine = smoothstep(17.5, 19.5, abs(p.x)) * (1.0 - smoothstep(25.0, 31.0, abs(p.x))) * smoothstep(-66.0, -60.0, p.y) * (1.0 - smoothstep(6.0, 12.0, p.y));
  float patchy = smoothstep(-0.25, 0.55, snoise(vec3(p * 0.08, 6.0)) + 0.35 * f1);
  float worn = max(crowdLine * (0.45 + 0.55 * patchy), smoothstep(0.42, 0.75, m2 * 0.7 + snoise(vec3(p * 0.035, 12.0)) * 0.6) * 0.8);
  float path = lineMask(p.y + 30.0 - 0.06 * p.x - 6.0 * snoise(vec3(p.x * 0.01, 3.0, 1.0)), 0.9, fw) * smoothstep(19.0, 24.0, abs(p.x));
  worn = max(worn, path * 0.9);
  c = mix(c, dust * (0.9 + 0.15 * f2 + 0.1 * m3), worn);
  rough = mix(rough, 1.0, worn);
  // the river bank: grass gives way to sand, wet and darker at the water (river from z = -80)
  float bank = smoothstep(-62.0, -70.0, p.y + 2.5 * snoise(vec3(p.x * 0.02, 1.0, 5.0)));
  vec3 sand = vec3(0.60, 0.52, 0.37) * (0.9 + 0.12 * m3 + 0.08 * f2);
  sand = mix(sand, sand * 0.55, smoothstep(-77.0, -80.0, p.y));
  c = mix(c, sand, bank);
  rough = mix(rough, mix(0.9, 0.35, smoothstep(-77.5, -80.0, p.y)), bank);
  // across the river (Naini): a sand bar, then cultivated strips of wheat and mustard under the haze
  float farSide = smoothstep(-1200.0, -1230.0, p.y);
  vec2 q = vec2(p.x * 0.96 + p.y * 0.28, p.y * 0.96 - p.x * 0.28);
  float plot = fract(sin(dot(floor(q / vec2(60.0, 38.0)), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 crop = plot < 0.4 ? vec3(0.1, 0.26, 0.05) : plot < 0.58 ? vec3(0.55, 0.5, 0.1) : plot < 0.85 ? vec3(0.16, 0.3, 0.07) : vec3(0.42, 0.36, 0.22);
  crop = mix(sand, crop, smoothstep(-1235.0, -1260.0, p.y));
  c = mix(c, crop * (0.9 + 0.12 * m3), farSide);
  return c;
}`;
const SAND_FN = /* glsl */ `
uniform float uTide;
vec3 groundCol(vec2 p, float fw, out float rough, out float h){
  float dF = 1.0 - smoothstep(0.03, 0.18, fw * 2.0);
  float dM = 1.0 - smoothstep(0.4, 3.0, fw);
  float m1 = snoise(vec3(p * 0.006, 1.1)), m2 = snoise(vec3(p * 0.03, 2.3)), m3 = snoise(vec3(p * 0.12, 3.7));
  // wind ripples: wavelength ~ 0.45 m, direction and phase wandering, asymmetric crests
  vec2 w = p + 1.8 * vec2(snoise(vec3(p * 0.05, 1.0)), snoise(vec3(p * 0.05, 7.0)));
  float a = 0.35 + 0.4 * snoise(vec3(p * 0.008, 3.0));
  float ph = dot(w, vec2(cos(a), sin(a))) * 13.9 + 2.0 * snoise(vec3(p * 0.25, 4.0));
  float r = pow(0.5 + 0.5 * sin(ph), 1.6) * (0.6 + 0.4 * snoise(vec3(p * 0.15, 5.0)));
  float dune = snoise(vec3(p * 0.06, 6.0));
  float grain = snoise(vec3(p * 7.0, 8.0)) * dF;
  h = (r * 0.55 * dF + dune * 1.2 * dM + grain * 0.15);
  vec3 dry = vec3(0.47, 0.385, 0.26) * (0.9 + 0.1 * m1 + 0.06 * m2 + 0.05 * m3);
  dry = mix(dry, vec3(0.53, 0.45, 0.32), smoothstep(0.2, 0.9, dune) * 0.35);       // pale wind-blown crests
  dry *= 0.9 + 0.18 * r * dF + 0.06 * grain + 0.06 * m1;
  // footprint trails wandering down the beach from the onlookers, shells and weed scattered on the sand
  for (int k = 0; k < 3; k++) {
    float fk = float(k), zc = 2.5 + fk * 2.2 + 3.0 * sin(p.x * (0.045 + fk * 0.01) + fk * 2.0);
    float along = p.x * 1.45 + fk * 0.3, cell = floor(along), side = mod(cell, 2.0) * 2.0 - 1.0;
    vec2 fp = vec2((fract(along) - 0.5) / 1.45, p.y - zc - side * 0.14);
    float print = 1.0 - smoothstep(0.06, 0.1, length(fp * vec2(1.0, 1.9)));
    float trail = smoothstep(-80.0 + fk * 20.0, -60.0 + fk * 20.0, p.x) * (1.0 - smoothstep(14.0, 22.0, p.x));
    dry = mix(dry, dry * 0.72, print * trail * dF * 0.9); h -= print * trail * 0.6;
  }
  float shell = smoothstep(0.82, 0.9, snoise(vec3(p * 3.3, 12.0))) * dF;
  dry = mix(dry, vec3(0.78, 0.74, 0.66), shell * 0.7);
  // wind streaks and damp hollows: broad tonal shapes that still read at a grazing angle
  float streak = snoise(vec3(p.x * 0.02, p.y * 0.18, 9.5));
  dry *= 0.92 + 0.1 * streak;
  dry = mix(dry, dry * vec3(0.78, 0.76, 0.74), smoothstep(0.35, 0.75, snoise(vec3(p * 0.035, 13.0))) * 0.6);
  vec3 c = dry; rough = 0.95;
  // the tide line: a wiggly band of dark weed and shell grit
  float tl = -7.6 + 0.9 * snoise(vec3(p.x * 0.03, 2.0, 0.0)) + 0.3 * snoise(vec3(p.x * 0.2, 5.0, 0.0));
  float weed = lineMask(p.y - tl, 0.25, fw) * smoothstep(0.1, 0.6, snoise(vec3(p * vec2(0.6, 2.0), 9.0)));
  c = mix(c, vec3(0.16, 0.13, 0.08), weed * 0.75);
  // damp → wet → glassy toward the surf (sea from z = -18)
  float edge = 0.7 * snoise(vec3(p.x * 0.04, 3.0, 1.0)) + 0.25 * snoise(vec3(p.x * 0.25, 4.0, 1.0));
  float damp = smoothstep(-8.0, -10.5, p.y + edge);
  float wet = smoothstep(-11.0, -14.5, p.y + edge * 1.4);
  float glass = smoothstep(-14.5 - uTide, -16.5 - uTide, p.y + edge * 1.8);
  c = mix(c, c * vec3(0.66, 0.64, 0.62), damp);
  c = mix(c, vec3(0.24, 0.195, 0.14) * (0.9 + 0.12 * m3), wet);
  c = mix(c, vec3(0.17, 0.16, 0.14), glass);
  h *= 1.0 - 0.8 * wet;
  rough = mix(rough, 0.55, damp); rough = mix(rough, 0.28, wet); rough = mix(rough, 0.05, glass);
  // wheel tracks of an earlier landing along the beach
  float tk = max(lineMask(abs(p.y - 0.3 - 0.0015 * p.x) - 1.1, 0.07, fw), 0.0) * smoothstep(-90.0, -60.0, p.x) * (1.0 - smoothstep(10.0, 40.0, p.x));
  c = mix(c, c * 0.8, tk * 0.6 * (1.0 - wet)); h -= tk * 0.8;
  // back of the beach: sand gives way to scrub under the palms
  float scrub = smoothstep(16.0, 26.0, p.y + 4.0 * snoise(vec3(p.x * 0.05, 8.0, 2.0)));
  c = mix(c, mix(vec3(0.16, 0.3, 0.08), vec3(0.42, 0.4, 0.22), smoothstep(-0.3, 0.6, m3)), scrub * 0.85);
  return c;
}`;
export function groundMaterial(kind = 'field') {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0 });
  m.userData.noAntiTile = true; m.userData.noBatch = true;
  const U = { uTide: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GROUND_COMMON}\n${kind === 'sand' ? SAND_FN : FIELD_FN}`)
      .replace('#include <map_fragment>', `float gRough, gH; float gFw = length(fwidth(vGW.xz));
        vec3 gC = groundCol(vGW.xz, gFw, gRough, gH); diffuseColor.rgb *= gC;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * gRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 pw = vGW + vec3(0.0, gH * ${kind === 'sand' ? '0.06' : '0.05'}, 0.0); vec3 nw = normalize(cross(dFdx(pw), dFdy(pw)));
          if (nw.y < 0.0) nw = -nw; normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`);
  };
  m.customProgramCacheKey = () => `flight-ground-${kind}`;
  m.userData.U = U;
  return m;
}
export function groundMesh(kind, size = 3600, seg = 24) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, groundMaterial(kind)); m.receiveShadow = true;
  return m;
}

// foam lace over the surf line (transparent band; the lace is world-space noise, so no period)
export function foamMaterial(strength = 1) {
  const U = { uTime: { value: 0 }, uK: { value: strength } };
  return Object.assign(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `${GLSL_NOISE}
      uniform float uTime, uK; varying vec2 vUv; varying vec3 vW;
      void main(){
        vec2 p = vW.xz;
        float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
        float lace = snoise(vec3(p * vec2(0.35, 1.6) + vec2(uTime * 0.3, 0.0), 1.0)) * 0.6 + snoise(vec3(p * vec2(1.4, 4.0), uTime * 0.4)) * 0.4;
        float holes = smoothstep(-0.2, 0.45, lace + (band - 0.5) * 0.8);
        float a = band * holes * uK * (0.55 + 0.45 * snoise(vec3(p.x * 0.02, 3.0, uTime * 0.1)));
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.92, 0.95, 0.97) * (0.85 + 0.25 * holes), a);
      }`,
  }), { userData: { U } });
}

// ------------------------------------------------------------------ textures for the 1911 biplane
// doped linen seen against the light: bright between the ribs, the ribs, spars and tapes dark
export function linenTranslucency() {
  const W = 512, H = 1024, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(17);
  g.fillStyle = '#e8d6b0'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) { const l = 160 + R() * 70; g.fillStyle = `rgba(${l},${l * 0.86},${l * 0.62},0.08)`; g.fillRect(R() * W, R() * H, 1 + R() * 4, 1 + R() * 2); }
  for (let k = 0; k <= 26; k++) { const y = k * H / 26; g.fillStyle = 'rgba(40,26,12,0.85)'; g.fillRect(0, y - 3, W, 6); g.fillStyle = 'rgba(80,56,30,0.35)'; g.fillRect(0, y - 8, W, 16); }
  g.fillStyle = 'rgba(30,20,10,0.95)'; g.fillRect(0, 0, W * 0.07, H); g.fillRect(W * 0.93, 0, W * 0.07, H);
  g.fillStyle = 'rgba(30,20,10,0.85)'; g.fillRect(W * 0.44, 0, W * 0.12, H);
  g.fillStyle = 'rgba(40,26,12,0.8)'; g.fillRect(W * 0.17, 0, W * 0.035, H); g.fillRect(W * 0.795, 0, W * 0.035, H);   // rear spar
  return toTexture(c, { anisotropy: 8 });
}
// the same linen seen in reflected light: rib tapes and stitching as faint ridges, dope sheen varying
export function linenSurface() {
  const W = 512, H = 1024, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(23);
  g.fillStyle = '#efe2c6'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) { const l = 170 + R() * 60; g.fillStyle = `rgba(${l},${l * 0.88},${l * 0.68},0.07)`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1 + R() * 3); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(150,110,60,${0.04 + R() * 0.05})`; g.beginPath(); g.ellipse(R() * W, R() * H, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, TAU); g.fill(); }   // dope pooling
  for (let k = 0; k <= 26; k++) {
    const y = k * H / 26;
    g.fillStyle = 'rgba(200,176,130,0.9)'; g.fillRect(0, y - 4, W, 8);
    g.fillStyle = 'rgba(120,90,50,0.35)'; for (let x = 0; x < W; x += 9) g.fillRect(x, y - 1, 4, 2);   // rib stitching
  }
  g.fillStyle = 'rgba(150,112,64,0.5)'; g.fillRect(0, 0, W * 0.05, H); g.fillRect(W * 0.95, 0, W * 0.05, H);
  g.fillStyle = 'rgba(150,112,64,0.3)'; g.fillRect(W * 0.47, 0, W * 0.06, H);
  return toTexture(c, { anisotropy: 8 });
}
// varnished spruce: long fine grain with darker late-wood lines and a little figure
export function spruceTexture() {
  const W = 128, H = 1024, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(31);
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#c48a4a'); gr.addColorStop(0.5, '#d9a462'); gr.addColorStop(1, '#bb8040');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x0 = R() * W, wv = R() * 6, f = 0.004 + R() * 0.01, a = 0.1 + R() * 0.25, lw = 0.6 + R() * 1.6;
    g.strokeStyle = `rgba(${90 + R() * 30},${50 + R() * 20},${20},${a})`; g.lineWidth = lw; g.beginPath();
    for (let y = 0; y <= H; y += 16) { const x = x0 + Math.sin(y * f + i) * wv; if (y) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  const t = toTexture(c, { anisotropy: 8 }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// spinning propeller: a soft disc with two blurred blade sweeps and a brighter tip ring
export function propDiscTexture() {
  const S = 256, c = mkCanvas(S), g = c.getContext('2d'), m = S / 2;
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x - m) / m, v = (y - m) / m, r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r > 1) continue;
    const sweep = Math.pow(0.5 + 0.5 * Math.cos(2 * a), 3) * 0.7 + 0.3;          // the two blades' blur, densest at the trailing edge
    const chord = 1 - Math.pow(r, 6);
    const tip = Math.exp(-Math.pow((r - 0.93) / 0.035, 2));
    const hub = r < 0.1 ? 0 : 1;
    const al = (0.22 * sweep * chord + 0.5 * tip) * hub * Math.min(1, (1 - r) * 30);
    const i = (y * S + x) * 4, l = 0.35 + 0.65 * tip;
    d[i] = Math.round(255 * (0.45 + 0.4 * l)); d[i + 1] = Math.round(255 * (0.32 + 0.4 * l)); d[i + 2] = Math.round(255 * (0.2 + 0.4 * l)); d[i + 3] = Math.round(255 * Math.min(1, al));
  }
  g.putImageData(img, 0, 0);
  return toTexture(c);
}

// ------------------------------------------------------------------ striped canvas (several colourways)
export function stripeTex(a, b, n = 14, seed = 1) {
  const W = 256, H = 128, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(seed);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * W / n, 0, W / n + 1, H); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,30,20' : '255,250,235'},${0.03 + R() * 0.05})`; g.fillRect(R() * W, R() * H, 1 + R() * 6, 1 + R() * 2); }
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,40,20,0.18)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const t = toTexture(c, { anisotropy: 4 }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ------------------------------------------------------------------ set materials
export function setMaterials() {
  const stripe = (a, b, s) => { const m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: stripeTex(a, b, 14, s), roughness: 0.92, side: THREE.DoubleSide }); m.userData.noAntiTile = true; return m; };
  return {
    stripes: [stripe('#b0281c', '#efe3c8', 1), stripe('#2f5a2a', '#efe3c8', 2), stripe('#c98a1e', '#f1e6cc', 3), stripe('#24467e', '#efe6d0', 4)],
    canvas: new THREE.MeshStandardMaterial({ color: '#d9ccb0', roughness: 0.93, side: THREE.DoubleSide }),
    stone: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, vertexColors: true }),
    recess: new THREE.MeshStandardMaterial({ color: '#2a1f18', roughness: 1 }),
    dome: new THREE.MeshStandardMaterial({ color: '#f3ede0', roughness: 0.55, metalness: 0 }),
    gilt: new THREE.MeshStandardMaterial({ color: '#d8a548', roughness: 0.3, metalness: 1 }),
    timber: new THREE.MeshStandardMaterial({ color: '#6a4a30', roughness: 0.8, vertexColors: true }),
    bunting: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, vertexColors: true, side: THREE.DoubleSide }),
    rope: new THREE.MeshStandardMaterial({ color: '#b8a27c', roughness: 0.9 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, vertexColors: true }),
    bark: new THREE.MeshStandardMaterial({ color: '#4a3a2c', roughness: 0.95 }),
    boat: new THREE.MeshStandardMaterial({ color: '#4a3424', roughness: 0.8 }),
    sail: new THREE.MeshStandardMaterial({ color: '#d8c7a2', roughness: 0.9, side: THREE.DoubleSide }),
    person: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
    skin: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65 }),
    parasol: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide }),
  };
}

// ------------------------------------------------------------------ Indo-Saracenic exhibition hall
// a plinth, an arcaded front of cusped/pointed arches between pilasters (real recesses behind an extruded screen),
// a chhajja eave on brackets, a pierced parapet, octagonal corner towers with chhatris, a drum and onion dome
// with a gilt finial; red-sandstone dressings on cream plaster (vertex colours).
const CREAM = '#ede2cb', SAND = '#c98a5a', SANDD = '#a8673e';
function pointedArch(s, x, w, y0, h, hole = true) {
  const p = hole ? new THREE.Path() : s;
  p.moveTo(x - w / 2, y0); p.lineTo(x - w / 2, y0 + h * 0.62);
  p.quadraticCurveTo(x - w / 2, y0 + h * 0.92, x, y0 + h);
  p.quadraticCurveTo(x + w / 2, y0 + h * 0.92, x + w / 2, y0 + h * 0.62);
  p.lineTo(x + w / 2, y0); p.closePath?.();
  if (hole) s.holes.push(p);
}
export function hallGeo(w, d, h, { towers = true, wings = 0 } = {}) {
  const stone = [], recess = [], dome = [], gilt = [];
  const S = (g, col) => stone.push(tint(g, col));
  // plinth and steps
  S(box(w + 1.6, 0.7, d + 1.6, [0, 0.35, 0]), SANDD); S(box(w + 1.2, 0.18, d + 1.2, [0, 0.79, 0]), SAND);
  for (let i = 0; i < 4; i++) S(box(w * 0.3, 0.18, 0.4, [0, 0.09 + i * 0.18, d / 2 + 0.8 + (3 - i) * 0.4]), SAND);
  const y0 = 0.88;
  // walls (set back) and the dark recesses behind the arcade
  S(box(w - 0.4, h, d - 1.6, [0, y0 + h / 2, -0.6]), CREAM);
  recess.push(box(w - 0.6, h * 0.86, 0.1, [0, y0 + h * 0.43, d / 2 - 1.33]));
  // arcade screen: a cream wall with pointed arches cut out, faced by a thinner sandstone layer whose openings
  // are larger — the cream inner arch shows as a stepped reveal inside each sandstone frame
  const n = Math.max(3, Math.round(w / 3.1)), aw = w / n * 0.62, ah = h * 0.72;
  const screen = (k, depth, z, col) => {
    // (the openings stop just above the bottom edge: holes touching the outline break the triangulation)
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, -0.3); sh.lineTo(w / 2, -0.3); sh.lineTo(w / 2, h); sh.lineTo(-w / 2, h); sh.closePath();
    for (let i = 0; i < n; i++) pointedArch(sh, -w / 2 + (i + 0.5) * w / n, aw * k, 0.02, ah * (0.94 + 0.06 * k));
    S(bake(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 6 }), [0, y0, z]), col);
  };
  screen(0.84, 0.45, d / 2 - 0.45, CREAM);
  screen(1.0, 0.1, d / 2, SAND);
  // pilasters between the arches, an arch-head moulding, the string course
  for (let i = 0; i <= n; i++) { const x = -w / 2 + i * w / n; S(box(0.42, h, 0.2, [x, y0 + h / 2, d / 2 + 0.18]), SAND); S(box(0.6, 0.3, 0.32, [x, y0 + 0.15, d / 2 + 0.1]), SANDD); }
  S(box(w + 0.2, 0.22, d + 0.2, [0, y0 + h * 0.8, 0]), SAND);
  // chhajja: a sloping eave on brackets, then the parapet with merlons
  const ey = y0 + h;
  { const ch = lathe([[1.0, 0], [0.86, 0.36]], 4); ch.rotateY(Math.PI / 4); ch.scale((w + 2.2) / 1.414, 1, (d + 2.2) / 1.414); S(bake(ch, [0, ey - 0.36, 0]), SAND); }
  S(box(w + 0.4, 0.25, d + 0.4, [0, ey + 0.12, 0]), CREAM);
  for (let i = 0; i <= n * 2; i++) S(box(0.16, 0.5, 0.5, [-w / 2 + i * w / (n * 2), ey - 0.55, d / 2 + 0.55], [0.5, 0, 0]), SANDD);
  S(box(w + 0.3, 0.6, 0.25, [0, ey + 0.55, d / 2 + 0.05]), CREAM);
  S(box(w + 0.3, 0.6, 0.25, [0, ey + 0.55, -d / 2 - 0.05]), CREAM);
  S(box(0.25, 0.6, d + 0.3, [w / 2 + 0.05, ey + 0.55, 0]), CREAM);
  S(box(0.25, 0.6, d + 0.3, [-w / 2 - 0.05, ey + 0.55, 0]), CREAM);
  for (let i = 0; i <= n * 3; i++) { const x = -w / 2 + i * w / (n * 3); S(bake(new THREE.ConeGeometry(0.16, 0.42, 4), [x, ey + 1.06, d / 2 + 0.05]), SAND); }
  // corner towers: octagonal shafts, a balcony, chhatri (kiosk on columns) with an onion dome
  if (towers) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (w / 2 + 0.2), z = sz * (d / 2 + 0.2), th = h + 2.2;
    S(cyl(0.95, 1.05, th, 8, [x, y0 + th / 2, z]), CREAM);
    for (const yy of [h * 0.45, h * 0.8]) S(cyl(1.12, 1.12, 0.2, 8, [x, y0 + yy, z]), SAND);
    S(cyl(1.35, 1.1, 0.3, 8, [x, y0 + th, z]), SAND);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; S(cyl(0.08, 0.08, 1.4, 6, [x + Math.cos(a) * 0.8, y0 + th + 0.85, z + Math.sin(a) * 0.8]), CREAM); }
    S(cyl(1.15, 1.15, 0.18, 12, [x, y0 + th + 1.6, z]), SAND);
    dome.push(bake(lathe([[0.95, 0], [1.08, 0.3], [0.95, 0.75], [0.45, 1.25], [0.12, 1.55], [0.05, 1.7]], 14), [x, y0 + th + 1.68, z]));
    gilt.push(bake(lathe([[0.08, 0], [0.12, 0.1], [0.04, 0.25], [0.03, 0.7], [0, 0.75]], 6), [x, y0 + th + 3.35, z]));
  }
  // drum + great onion dome + lotus + gilt kalasha finial
  const R0 = Math.min(d, w) * 0.32, dy = ey + 0.9;
  S(cyl(R0 * 1.15, R0 * 1.2, 0.5, 20, [0, dy + 0.25, 0]), SAND);
  S(cyl(R0, R0, R0 * 0.75, 24, [0, dy + 0.5 + R0 * 0.375, 0]), CREAM);
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; recess.push(bake(new THREE.PlaneGeometry(R0 * 0.22, R0 * 0.45), [Math.cos(a) * (R0 + 0.01), dy + 0.5 + R0 * 0.38, Math.sin(a) * (R0 + 0.01)], [0, Math.PI / 2 - a, 0])); }
  S(cyl(R0 * 1.06, R0 * 1.06, 0.18, 24, [0, dy + 0.5 + R0 * 0.75, 0]), SAND);
  const db = dy + 0.6 + R0 * 0.75, dp = [];
  for (let i = 0; i <= 18; i++) { const u = i / 18, r = R0 * (0.98 + 0.26 * Math.sin(Math.PI * Math.min(1, u * 1.55)) - 1.0 * Math.pow(u, 2.1)); dp.push([Math.max(0.04, r), u * R0 * 2.1]); }
  dome.push(bake(lathe(dp, 32), [0, db, 0]));
  gilt.push(bake(lathe([[0.05, 0], [0.32, 0.1], [0.36, 0.3], [0.18, 0.45], [0.26, 0.65], [0.1, 0.9], [0.05, 1.6], [0, 1.75]], 10), [0, db + R0 * 2.1 - 0.1, 0]));
  // lower side wings with small domes
  for (let k = 0; k < wings; k++) for (const sx of [-1, 1]) {
    const ww = w * 0.38, x = sx * (w / 2 + ww / 2 + 0.6), hh = h * 0.72;
    S(box(ww + 0.8, 0.7, d * 0.8 + 0.8, [x, 0.35, -d * 0.1]), SANDD);
    S(box(ww, hh, d * 0.8, [x, y0 + hh / 2, -d * 0.1]), CREAM);
    const m = Math.max(2, Math.round(ww / 3));
    for (let i = 0; i < m; i++) { const ax = x - ww / 2 + (i + 0.5) * ww / m; recess.push(bake((() => { const s = new THREE.Shape(); pointedArch(s, 0, ww / m * 0.55, 0, hh * 0.7, false); return new THREE.ShapeGeometry(s, 5); })(), [ax, y0, d * 0.3 + 0.02])); S(box(0.32, hh, 0.16, [x - ww / 2 + i * ww / m, y0 + hh / 2, d * 0.3 + 0.05]), SAND); }
    S(box(ww + 0.5, 0.25, d * 0.8 + 0.5, [x, y0 + hh + 0.12, -d * 0.1]), SAND);
    dome.push(bake(lathe([[1.3, 0], [1.45, 0.4], [1.2, 1.0], [0.5, 1.6], [0.1, 2.0], [0.05, 2.15]], 14), [x, y0 + hh + 0.25, -d * 0.1]));
  }
  return { stone: merge(stone), recess: merge(recess), dome: merge(dome), gilt: merge(gilt), top: db + R0 * 2.1 + 1.6 };
}

// ------------------------------------------------------------------ grandstand: tiers, posts, striped awning
export function grandstandGeo(len, tiers = 6) {
  const wood = [], roof = [], seats = [];
  const td = 0.85, th = 0.48;
  for (let i = 0; i < tiers; i++) {
    wood.push(tint(box(len, 0.08, td, [0, 0.6 + i * th, -i * td]), i % 2 ? '#8a6a48' : '#7a5c3e'));
    wood.push(tint(box(len, th, 0.05, [0, 0.6 + i * th - th / 2, -i * td + td / 2]), '#5a4230'));
    seats.push([0.6 + i * th + 0.04, -i * td]);
  }
  const back = -tiers * td + td / 2, H = 0.6 + tiers * th;
  wood.push(tint(box(len, H + 2.4, 0.08, [0, (H + 2.4) / 2, back]), '#6a5038'));
  for (let x = -len / 2; x <= len / 2 + 0.01; x += len / 8) {
    wood.push(tint(box(0.16, 4.4, 0.16, [x, 2.2 + 0.4, td / 2 + 0.2]), '#4a3626'), tint(box(0.16, H + 2.6, 0.16, [x, (H + 2.6) / 2, back]), '#4a3626'));
    wood.push(tint(rod(V3(x, 0.4, td / 2 + 0.2), V3(x, H, back), 0.05, 4), '#4a3626'));
  }
  wood.push(tint(box(len, 0.06, 0.06, [0, 1.15, td / 2 + 0.25]), '#e8dcc4'), tint(box(len, 0.25, 0.08, [0, 0.35, td / 2 + 0.2]), '#e8dcc4'));
  // the awning: a pitched canvas roof (stripes run down the slope) with a scalloped valance
  const rf = gridSurf((u, v) => V3(lerp(-len / 2 - 0.4, len / 2 + 0.4, u), lerp(4.8, H + 2.5, v) + 0.25 * Math.sin(Math.PI * v), lerp(td / 2 + 0.6, back - 0.2, v)), 24, 4);
  { const uv = rf.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 3.2, uv.getY(i)); }
  roof.push(rf);
  const vs = new THREE.Shape(), nv = Math.round(len / 0.9); vs.moveTo(-len / 2 - 0.4, 0); vs.lineTo(len / 2 + 0.4, 0);
  for (let i = nv; i > 0; i--) { const x0 = -len / 2 - 0.4 + i * (len + 0.8) / nv, x1 = x0 - (len + 0.8) / nv; vs.quadraticCurveTo((x0 + x1) / 2, -0.7, x1, -0.35); }
  vs.closePath();
  const vg = new THREE.ShapeGeometry(vs, 4); { const uv = vg.attributes.uv, p = vg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 3.2, 0.5 + p.getY(i) * 0.3); }
  roof.push(bake(vg, [0, 4.8, td / 2 + 0.62]));
  return { wood: merge(wood), roof: merge(roof), seats, depth: td };
}

// ------------------------------------------------------------------ bunting strung on catenaries
// lines: [[a: Vector3, b: Vector3, sag]] — small triangular flags in a cycle of colours (vertex colours)
const BUNT = ['#c0281c', '#e8a020', '#f2ece0', '#2a5e2a', '#24469a', '#d8642a', '#7a1e3a'];
export function buntingGeo(lines, seed = 5, spacing = 0.5) {
  const R = rng(seed), pos = [], col = [], c = new THREE.Color(), P = V3(), T = V3(), N = V3();
  for (const [a, b, sag] of lines) {
    const L = a.distanceTo(b), n = Math.max(2, Math.floor(L / spacing));
    const at = (u, out) => out.copy(a).lerp(b, u).setY(lerp(a.y, b.y, u) - sag * 4 * u * (1 - u));
    T.copy(b).sub(a).setY(0).normalize(); N.crossVectors(T, UP);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n; at(u, P);
      const w = 0.16, hgt = 0.32 + R() * 0.04, sw = (R() - 0.5) * 0.12;
      const p0 = P.clone().addScaledVector(T, -w), p1 = P.clone().addScaledVector(T, w), p2 = P.clone().addScaledVector(N, sw); p2.y -= hgt;
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      c.set(BUNT[(i + Math.floor(R() * 1.3)) % BUNT.length]).multiplyScalar(0.9 + R() * 0.15);
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}
// the strings themselves (thin dark cord)
export function cordGeo(lines) {
  const out = [], P = V3(), Q = V3();
  for (const [a, b, sag] of lines) {
    const at = (u, o) => o.copy(a).lerp(b, u).setY(lerp(a.y, b.y, u) - sag * 4 * u * (1 - u));
    for (let i = 0; i < 6; i++) { at(i / 6, P); at((i + 1) / 6, Q); out.push(rod(P.clone(), Q.clone(), 0.012, 3)); }
  }
  return merge(out);
}

// ------------------------------------------------------------------ a waving pennant / flag (baked ripple)
export function pennantGeo(len, h, seed = 1, swallow = false) {
  const g = new THREE.PlaneGeometry(len, h, 8, 1); g.translate(len / 2, -h / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / len, y = p.getY(i);
    if (swallow && u > 0.99 && Math.abs(y + h / 2) < 1e-4) p.setX(i, len * 0.8);
    p.setY(i, -h / 2 + (y + h / 2) * (1 - 0.65 * u) - u * u * h * 0.2);
    p.setZ(i, Math.sin(u * 5 + seed) * 0.12 * u * len);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ shade trees (neem, mango, peepal) with tonal crowns
export function shadeTree(seed = 1, h = 9, lobes = 9) {
  const R = rng(seed), crown = [];
  const hue = [['#2c5a1c', '#4f8a2c'], ['#204a1a', '#3e7a26'], ['#36621e', '#64923a'], ['#2a5424', '#4a8232']][Math.floor(R() * 4)];
  const ca = new THREE.Color(hue[0]), cb = new THREE.Color(hue[1]), c = new THREE.Color();
  const spread = h * (0.32 + R() * 0.14);
  for (let i = 0; i < lobes; i++) {
    const r = h * (0.17 + R() * 0.1), s = new THREE.IcosahedronGeometry(r, 1);
    const cx = (R() - 0.5) * spread * 1.6, cz = (R() - 0.5) * spread * 1.6, cy = h * (0.58 + R() * 0.3) - Math.hypot(cx, cz) * 0.25;
    const p = s.attributes.position, col = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      const v = V3().fromBufferAttribute(p, k); v.multiplyScalar(1 + fbm2(v.x * 0.9 + seed + i, v.z * 0.9 + v.y, 2) * 0.32); p.setXYZ(k, v.x, v.y * 0.8, v.z);
      const up = (v.y / r) * 0.5 + 0.5;
      c.copy(ca).lerp(cb, Math.min(1, up * 0.9 + R() * 0.2)).multiplyScalar(0.55 + 0.55 * up); col.set([c.r, c.g, c.b], k * 3);
    }
    s.setAttribute('color', new THREE.BufferAttribute(col, 3)); s.computeVertexNormals();
    crown.push(bake(s, [cx, cy, cz]));
  }
  const trunk = [cyl(h * 0.035, h * 0.06, h * 0.62, 7, [0, h * 0.31, 0])];
  for (let k = 0; k < 3; k++) { const a = R() * TAU; trunk.push(rod(V3(0, h * 0.45, 0), V3(Math.cos(a) * spread * 0.5, h * 0.66, Math.sin(a) * spread * 0.5), h * 0.018, 5, h * 0.03)); }
  return { crown: merge(crown), trunk: merge(trunk) };
}

// ------------------------------------------------------------------ country boats on the river (hull, awning, mast, sail)
export function boatGeos(seed = 1, L = 9) {
  const R = rng(seed), hull = [], sail = [];
  const W = (u) => 1.05 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.6), D = (u) => 0.55 * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.8);
  const gun = (u) => 0.35 + 0.5 * Math.pow(Math.abs(2 * u - 1), 3);
  hull.push(gridSurf((u, v) => { const a = (v - 0.5) * Math.PI; return V3(lerp(-L / 2, L / 2, u), gun(u) - D(u) * Math.cos(a), W(u) * Math.sin(a)); }, 14, 6));
  if (R() < 0.6) hull.push(bake(new THREE.CylinderGeometry(0.85, 0.85, L * 0.3, 8, 1, true, 0, Math.PI), [-L * 0.08, 0.5, 0], [0, 0, Math.PI / 2]));
  if (R() < 0.75) {
    hull.push(cyl(0.05, 0.07, 6.5, 5, [L * 0.12, 3.6, 0]));
    // a lateen-like triangular sail bellied by the wind, its yard slanting up from the bow
    const tall = 4.2 + R() * 1.5, mx = L * 0.12, Aa = V3(mx + 1.2, 1.1, 0), Bb = V3(mx - 2.6, 1.3, 0), Cc = V3(mx - 0.4, 1.1 + tall, 0), bel = 0.45 + R() * 0.3;
    sail.push(gridSurf((u, v) => Aa.clone().addScaledVector(Bb.clone().sub(Aa), u * (1 - v)).addScaledVector(Cc.clone().sub(Aa), v).add(V3(0, 0, bel * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, v * 1.2 + 0.1)))), 6, 6));
  }
  return { hull: merge(hull), sail: sail.length ? merge(sail) : null };
}

// ------------------------------------------------------------------ the crowd: stylised figures, no faces
// spots: [x, z, scale?, seated?]; facing: optional function (x, z) → yaw. Five kinds of figure — men in kurta and
// turban, women in saris with the pallu over the head, British men in dark suits and sola topis, ladies in pale
// dresses and wide hats, and khaki police in red pagris — each body and headwear instanced with per-instance colour.
// lite (phones, AR, VR): the whole crowd is baked into ONE vertex-coloured mesh (one draw instead of a dozen,
// the same figures, colours and seeds) and it casts no shadow — a distant crowd only receives.
export function buildCrowd2(SM, spots, { seed = 4, facing = null, parasols = 0.07, lite = false } = {}) {
  const R = rng(seed), n = spots.length;
  const man = lathe([[0.12, 0], [0.17, 0.75], [0.2, 1.05], [0.24, 1.2], [0.07, 1.35], [0.05, 1.42]], 6);
  const woman = lathe([[0.27, 0], [0.22, 0.4], [0.16, 1.0], [0.2, 1.17], [0.06, 1.32], [0.05, 1.38]], 6);
  const head = bake(new THREE.IcosahedronGeometry(0.1, 0), [0, 1.5, 0], [0, 0, 0], [0.9, 1.08, 0.95]);
  const turban = bake(new THREE.SphereGeometry(0.135, 6, 3, 0, TAU, 0, Math.PI * 0.62), [0, 1.53, 0], [0.12, 0, 0], [1.05, 0.92, 1.1]);
  const topi = merge([bake(new THREE.SphereGeometry(0.13, 6, 3, 0, TAU, 0, Math.PI * 0.5), [0, 1.55, 0], [0, 0, 0], [1, 1.05, 1.15]), bake(new THREE.CylinderGeometry(0.2, 0.22, 0.02, 8, 1, true), [0, 1.55, 0]), bake(new THREE.CircleGeometry(0.2, 8), [0, 1.545, 0], [Math.PI / 2, 0, 0])]);
  const veil = merge([bake(new THREE.SphereGeometry(0.13, 6, 3, 0, TAU, 0, Math.PI * 0.6), [0, 1.52, -0.01], [-0.25, 0, 0], [1.02, 1.05, 1.05]), bake(new THREE.ConeGeometry(0.2, 0.42, 6, 1, true), [0, 1.3, -0.04])]);
  const hat = merge([bake(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 6), [0, 1.6, 0]), bake(new THREE.CylinderGeometry(0.27, 0.27, 0.015, 8, 1, true), [0, 1.56, 0]), bake(new THREE.CircleGeometry(0.27, 8), [0, 1.555, 0], [-Math.PI / 2, 0, 0])]);
  const parasol = merge([bake(new THREE.ConeGeometry(0.55, 0.2, 9, 1, true), [0.15, 2.05, 0]), bake(new THREE.CylinderGeometry(0.01, 0.01, 0.8, 3), [0.15, 1.6, 0])]);
  const kinds = [
    { body: man, hw: turban, w: 0.38, robes: ['#efe9dc', '#e6dcc6', '#d8ccb2', '#f4f0e6', '#c8b896', '#8a6a48', '#3a3a44', '#d9cdb5'], heads: ['#f2ede2', '#c8302a', '#e89a2a', '#f0e6d2', '#d0607a', '#2a5a9a', '#f4c430', '#8a2a3a', '#ffffff', '#3a7a3a'] },
    { body: woman, hw: veil, w: 0.27, robes: ['#b8241e', '#d8641a', '#2a6a3a', '#8a1e5a', '#e8b030', '#2a3a8a', '#c84a6a', '#f0e6d0', '#5a2a6a', '#1e7a7a'], heads: null },
    { body: man, hw: topi, w: 0.12, robes: ['#26262c', '#3a3530', '#4a4a50', '#e8e2d2', '#5a4a3a'], heads: ['#f4efe2', '#ebe3d0', '#d9cfb8'] },
    { body: woman, hw: hat, w: 0.08, robes: ['#f2ede4', '#e6dcc8', '#c8d0dc', '#dcc8c8', '#e8e0b8'], heads: ['#f6f0e0', '#2a2622', '#c8b090', '#8a2a3a'] },
    { body: man, hw: turban, w: 0.06, robes: ['#a8905c', '#9a845a'], heads: ['#b8261c', '#c02a1e'] },
  ];
  const tot = kinds.reduce((s, k) => s + k.w, 0);
  const pick = () => { let r = R() * tot; for (let i = 0; i < kinds.length; i++) { r -= kinds[i].w; if (r <= 0) return i; } return 0; };
  const per = kinds.map(() => []), heads = [], par = [];
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V3(), ps = V3();
  spots.forEach(([x, z, s0 = 1, seated = false, y0 = 0]) => {
    const k = pick(), child = R() < 0.1, s = s0 * (child ? 0.62 : 0.9 + R() * 0.16);
    const yaw = (facing ? facing(x, z) : R() * TAU) + (R() - 0.5) * 0.9;
    q.setFromAxisAngle(UP, yaw); ps.set(x, y0 + (seated ? -0.45 * s : 0), z); sc.set(s, s * (seated ? 0.95 : 0.94 + R() * 0.1), s);
    mtx.compose(ps, q, sc);
    const M = mtx.clone(); per[k].push(M); heads.push(M);
    if (R() < parasols && !seated) par.push(mtx.clone());
  });
  const grp = new THREE.Group(), c = new THREE.Color();
  const skinTones = ['#8a5a3a', '#a06a44', '#6e4a30', '#b47c52', '#7a5034'];
  const baked = [];
  const inst = (geo, mat, list, colFn) => {
    if (!list.length) return;
    if (lite) {
      const src = geo.index ? geo.toNonIndexed() : geo, n = src.attributes.position.count;
      list.forEach((M, i) => {
        c.set(colFn(i));
        const g = new THREE.BufferGeometry(); g.setAttribute('position', src.attributes.position.clone()); g.setAttribute('normal', src.attributes.normal.clone()); g.applyMatrix4(M);
        const col = new Float32Array(n * 3); for (let k = 0; k < n; k++) col.set([c.r, c.g, c.b], k * 3);
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); baked.push(g);
      });
      return;
    }
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((M, i) => { m.setMatrixAt(i, M); m.setColorAt(i, c.set(colFn(i))); });
    m.castShadow = true; m.receiveShadow = true; m.userData.noBatch = true; grp.add(m);
  };
  kinds.forEach((K, k) => {
    const robeOf = per[k].map(() => K.robes[Math.floor(R() * K.robes.length)]);
    inst(K.body, SM.person, per[k], (i) => robeOf[i]);
    inst(K.hw, SM.person, per[k], (i) => (K.heads ? K.heads[Math.floor(R() * K.heads.length)] : robeOf[i]));
  });
  const brit = new Set(); per[2].concat(per[3]).forEach((M) => brit.add(M));
  inst(head, SM.skin, heads, (i) => (brit.has(heads[i]) ? '#d8a888' : skinTones[Math.floor(R() * skinTones.length)]));
  inst(parasol, SM.parasol, par, () => ['#1a1716', '#1a1716', '#f2ece0', '#c8302a', '#2a3a6a', '#e8b030'][Math.floor(R() * 6)]);
  if (lite && baked.length) {
    SM.crowd ??= new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, vertexColors: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(mergeGeometries(baked), SM.crowd); m.receiveShadow = true; grp.add(m);
  }
  return grp;
}
