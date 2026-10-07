// The weaver's courtyard for the textiles chapter (src/scenes/india/textiles.js): a procedural stone
// floor (per-slab tone, worn and chipped arrises, grime in the joints, dye stains, no period), lime-washed
// walls with an indigo dado, fallen plaster showing brick, damp and streaks; a cornice and kangura
// cresting; a sunrise gateway flanked by domed pillars; a carved teak doorway left ajar onto a lamp-lit
// room; a sandstone jharokha; dyed cloth lengths drying on lines (backlit by the dawn); dye vats,
// cotton heaps, baskets, potted tulsi, a print-block table with its ink tray; distant trees.
// Build-time only, except the small update(t) at the end (pure function of t).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU, lerp } from '../../lib/math.js';
import { noise2, noise3 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { glowSprite } from '../../lib/materials.js';
import { merge } from './textiles-assets.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------------ shader kit
const COMMON = /* glsl */ `
varying vec3 vTxP; varying vec3 vTxN;
float th21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 th22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float tvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th21(i), th21(i + vec2(1.0, 0.0)), f.x), mix(th21(i + vec2(0.0, 1.0)), th21(i + vec2(1.0, 1.0)), f.x), f.y); }
float tfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * tvn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; } return s; }
float tfbm3(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * tvn(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1; a *= 0.5; } return s / 0.875; }
float tss(float a, float b, float x){ float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
`;

// A MeshStandardMaterial whose colour, roughness and relief come from `surf(p, n, col, rough, h)` in world
// space (h in metres drives a derivative bump). `glsl` defines surf.
export function procMaterial(glsl, { key, color = '#ffffff', roughness = 0.85, metalness = 0, bump = 1, uniforms = {}, defines = '', side } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (side) m.side = side;
  m.userData.noAntiTile = true; m.userData.noDetail = true; m.userData.noBatch = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTxP; varying vec3 vTxN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 wp = vec4(transformed, 1.0); vec3 wn = objectNormal;
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp; wn = mat3(instanceMatrix) * wn;
          #endif
          vTxP = (modelMatrix * wp).xyz; vTxN = normalize(mat3(modelMatrix) * wn); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + defines + COMMON + glsl)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pxRough = roughness; float pxH = 0.0; vec3 pxCol = diffuseColor.rgb;
        surf(vTxP, normalize(vTxN), pxCol, pxRough, pxH); diffuseColor.rgb = pxCol;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = pxRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float hx = dFdx(pxH), hy = dFdy(pxH);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          vec3 gr = sign(det) * (hx * r1 + hy * r2); normal = normalize(abs(det) * normal - gr * ${bump.toFixed(3)}); }`);
  };
  m.customProgramCacheKey = () => 'textiles-proc-' + key;
  return m;
}

// Courtyard flags: courses of hand-cut sandstone slabs (row height and slab width vary per course,
// some slabs split, joints wobble), each slab its own tone, tilt and wear; chipped arrises, grime
// in the joints, a polished path where the weaver walks, indigo / madder stains and the wet ring
// round the dye vats. All from world position — no tile repeats.
const FLOOR_GLSL = /* glsl */ `
uniform vec2 uVat; uniform vec2 uTray;
// irregular ashlar: staggered 1.9 m super-cells, each split recursively by random axis-aligned
// cuts into slabs of 0.45–1.3 m (so no joint runs on for long and nothing repeats)
vec4 flags(vec2 p, out vec2 cid){
  vec2 q = p + 0.016 * (vec2(tvn(p * 2.3), tvn(p * 2.3 + 17.0)) - 0.5);
  const float S = 2.7;
  float r = floor(q.y / S);
  vec2 o = vec2(th21(vec2(r, 9.1)) * S, 0.0);
  vec2 c = floor((q + o) / S);
  vec2 lo = c * S - o, hi = lo + S;
  vec2 key = c + vec2(0.37, 0.71);
  for (int i = 0; i < 5; i++) {
    vec2 sz = hi - lo;
    float h = th21(key + float(i) * 7.13);
    if (max(sz.x, sz.y) < 0.95) break;
    if (i >= 1 && h < 0.22 && max(sz.x, sz.y) < 1.5) break;
    bool cutX = sz.x > sz.y * 1.25 ? true : (sz.y > sz.x * 1.25 ? false : h > 0.5);
    float f = 0.34 + 0.32 * th21(key * 1.7 + float(i) * 3.1);
    if (cutX) { float m = mix(lo.x, hi.x, f); if (q.x < m) { hi.x = m; key = fract(key * 0.618) * 97.0 + vec2(1.0, 0.0); } else { lo.x = m; key = fract(key * 0.618) * 97.0 + vec2(2.0, 3.0); } }
    else { float m = mix(lo.y, hi.y, f); if (q.y < m) { hi.y = m; key = fract(key * 0.618) * 97.0 + vec2(0.0, 1.0); } else { lo.y = m; key = fract(key * 0.618) * 97.0 + vec2(5.0, 2.0); } }
  }
  cid = key + c * 13.0;
  float d = min(min(q.x - lo.x, hi.x - q.x), min(q.y - lo.y, hi.y - q.y));
  vec2 l = (q - lo) / (hi - lo);
  return vec4(d, th21(cid + 0.13), l);
}
void surf(vec3 P, vec3 N, inout vec3 col, inout float rough, inout float H){
  vec2 p = P.xz;
  vec2 cid; vec4 f = flags(p, cid);
  float id = f.y, id2 = th21(cid + 7.7), id3 = th21(cid + 2.1);
  // slab tone: buff, rose and grey-lime sandstones
  vec3 buff = vec3(0.56, 0.43, 0.31), rose = vec3(0.58, 0.39, 0.31), lime = vec3(0.52, 0.49, 0.44), dark = vec3(0.42, 0.33, 0.25);
  vec3 c = mix(buff, rose, smoothstep(0.35, 0.85, id));
  c = mix(c, lime, smoothstep(0.7, 1.0, id2) * 0.8);
  c = mix(c, dark, smoothstep(0.75, 1.0, id3) * 0.6);
  c *= 0.72 + 0.45 * th21(cid + 4.4);
  // bedding laminations and grain within the slab (oriented per slab)
  float ang = id2 * 3.14159;
  vec2 rp = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * p;
  float bed = tvn(vec2(rp.x * 0.9 + id * 40.0, rp.y * 11.0));
  c *= 0.9 + 0.18 * bed;
  float grain = tfbm(p * 9.0 + id * 13.0);
  c *= 0.86 + 0.28 * grain;
  float px = max(length(fwidth(p)), 1e-4);
  // pitting and fine sand grain (fades out with distance)
  float fine = tvn(p * 85.0 + id * 7.0);
  float fineK = 1.0 - smoothstep(0.004, 0.02, px);
  c *= 1.0 - 0.1 * fineK * smoothstep(0.7, 0.95, fine);
  // macro weathering (lichen-dark, sun-bleached)
  float macro = tfbm3(p * 0.11 + 2.0);
  c *= 0.82 + 0.36 * macro;
  float bleach = tvn(p * 0.35 + 9.0);
  c = mix(c, vec3(0.62, 0.55, 0.45), smoothstep(0.65, 0.95, bleach) * 0.35);
  // joints: width varies, arrises chipped and rounded by wear
  float chip = tfbm3(p * 14.0 + id * 5.0);
  float jw = 0.003 + 0.005 * th21(cid + 9.3) + 0.01 * smoothstep(0.65, 0.92, chip);
  float d = f.x;
  float aa = px * 0.9;
  float joint = 1.0 - smoothstep(jw, jw + aa + 0.002, d);
  float edgeW = smoothstep(jw, jw + 0.05, d);              // the worn, rounded edge band
  float fadeJ = 1.0 - smoothstep(0.015, 0.06, px);           // joints dissolve into tone far away
  vec3 grime = vec3(0.12, 0.09, 0.065) * (0.7 + 0.6 * tvn(p * 30.0));
  float moss = smoothstep(0.55, 0.8, tvn(p * 0.7 + 30.0)) * (1.0 - smoothstep(4.5, 7.5, length(p - vec2(-0.3, 0.6))));
  grime = mix(grime, vec3(0.1, 0.13, 0.06), moss * 0.7);
  c = mix(c, c * 0.8, (1.0 - edgeW) * 0.5 * fadeJ);
  c = mix(c, grime, joint * fadeJ * 0.75);
  c = mix(c, c * 0.9, (1.0 - fadeJ) * 0.25);
  // the weaver's path: worn smoother and paler round the loom
  float path = exp(-pow(length((p - vec2(0.0, 1.9)) * vec2(0.6, 1.0)), 2.0) * 0.5) + exp(-pow(abs(p.x - 2.0), 2.0) * 1.2) * smoothstep(3.5, 0.0, abs(p.y + 1.5));
  path = clamp(path, 0.0, 1.0);
  c = mix(c, c * 1.08 + vec3(0.02), path * 0.35);
  // dye stains: indigo blotches near the vats and the loom, madder by the print table
  float sN = tfbm(p * 1.6 + 40.0);
  float nearVat = exp(-dot(p - uVat, p - uVat) * 0.12);
  float nearTray = exp(-dot(p - uTray, p - uTray) * 1.6);
  float ind = smoothstep(0.58, 0.66, sN + nearVat * 0.28 - 0.06) * (0.25 + nearVat);
  float drips = smoothstep(0.82, 0.86, tvn(p * 9.0 + 3.0)) * nearVat;
  ind = clamp(ind + drips * 0.8, 0.0, 1.0);
  c = mix(c, c * vec3(0.32, 0.4, 0.78), ind * 0.75);
  float mad = smoothstep(0.6, 0.68, tfbm(p * 2.4 + 70.0) + nearTray * 0.35 - 0.1) * nearTray;
  c = mix(c, c * vec3(0.95, 0.45, 0.35), mad * 0.8);
  float tur = smoothstep(0.62, 0.7, tfbm(p * 2.0 + 120.0)) * exp(-dot(p - uVat - vec2(0.4, 1.4), p - uVat - vec2(0.4, 1.4)) * 1.0);
  c = mix(c, c * vec3(1.25, 1.0, 0.45), tur * 0.6);
  float wet = smoothstep(0.35, 0.75, nearVat + 0.25 * (tfbm3(p * 3.0) - 0.5)) * 0.9;
  c *= 1.0 - 0.38 * wet;
  col *= c * 0.52;
  // relief: per-slab tilt, worn edges, pits, joint recesses
  vec2 tilt = (vec2(th21(cid + 1.0), th21(cid + 2.0)) - 0.5) * 0.004;
  H = dot(tilt, vec2(f.z, f.w)) - 0.004 * (1.0 - edgeW) * (1.0 - edgeW) - 0.004 * joint;
  H += fineK * 0.0006 * fine + 0.0012 * grain - 0.002 * smoothstep(0.75, 0.95, chip) * (1.0 - edgeW);
  H *= fadeJ * 0.8 + 0.2;
  rough = mix(0.86, 0.7, path) - 0.1 * bed;
  rough = mix(rough, 0.97, joint);
  rough = mix(rough, 0.32, wet);
  rough = mix(rough, 0.6, ind * 0.4);
}`;

// Lime-washed walls: a cream wash that varies wall to wall and patch to patch, a faded indigo dado
// with a ragged top, rising damp and a tide line, rain streaks under the cornice, and patches where
// the plaster has fallen to show the brick behind (per-brick tone, recessed mortar).
const WALL_GLSL = /* glsl */ `
void surf(vec3 P, vec3 N, inout vec3 col, inout float rough, inout float H){
  bool horiz = abs(N.y) > 0.6;
  vec2 uv = horiz ? P.xz : vec2(abs(N.x) > abs(N.z) ? P.z : P.x, P.y);
  float y = P.y;
  float px = max(length(fwidth(uv)), 1e-4);
  // lime wash
  vec3 cream = vec3(0.8, 0.72, 0.58);
  float blot = tfbm(uv * 0.35 + 4.0);
  cream = mix(cream, vec3(0.82, 0.62, 0.42), smoothstep(0.5, 0.8, blot) * 0.55);
  cream = mix(cream, vec3(0.78, 0.6, 0.55), smoothstep(0.55, 0.85, tfbm3(uv * 0.21 + 30.0)) * 0.4);
  float brush = tvn(vec2(uv.x * 3.0, uv.y * 0.6) + 11.0) * 0.6 + tvn(uv * 16.0) * 0.4;
  cream *= 0.9 + 0.16 * brush;
  vec3 c = cream;
  float dado = 0.0;
#ifndef NO_DADO
  // indigo dado
  float edge = 1.05 + 0.06 * (tvn(vec2(uv.x * 2.5, 1.0)) - 0.5) + 0.03 * (tvn(vec2(uv.x * 14.0, 2.0)) - 0.5);
  dado = (1.0 - tss(edge - 0.01, edge + 0.01, y)) * (horiz ? 0.0 : 1.0);
  vec3 ind = mix(vec3(0.16, 0.27, 0.5), vec3(0.32, 0.45, 0.62), tfbm(uv * 1.2 + 7.0));
  ind = mix(ind, cream * 0.9, smoothstep(0.62, 0.8, tfbm(uv * 2.2 + 3.0)) * 0.7);
  c = mix(c, ind, dado);
  float band = (1.0 - tss(0.006, 0.012, abs(y - edge - 0.04))) * (horiz ? 0.0 : 1.0);
  c = mix(c, vec3(0.5, 0.16, 0.09), band * 0.8);
#endif
  // fallen plaster: brick behind
  float lowBias = (1.0 - tss(0.0, 1.6, y)) * 0.12;
  float pm = tfbm(uv * 1.3 + 21.0) + lowBias;
  float fall = tss(0.68, 0.695, pm) * (horiz ? 0.0 : 1.0);
  float rim = tss(0.655, 0.68, pm) * (1.0 - fall) * (horiz ? 0.0 : 1.0);
  vec2 bq = uv / vec2(0.23, 0.075);
  float row = floor(bq.y); bq.x += mod(row, 2.0) * 0.5;
  vec2 bid = floor(bq), bf = fract(bq);
  float mort = 1.0 - min(tss(0.0, 0.07, bf.x) * tss(1.0, 0.93, bf.x), tss(0.0, 0.14, bf.y) * tss(1.0, 0.86, bf.y));
  vec3 brick = vec3(0.47, 0.25, 0.16) * (0.7 + 0.5 * th21(bid)) * (0.9 + 0.2 * tvn(uv * 30.0));
  brick = mix(brick, vec3(0.55, 0.5, 0.44), mort);
  c = mix(c, c * 0.78, rim * 0.6);
  c = mix(c, brick, fall);
  // damp and tide line
  float tide = 0.32 + 0.12 * tvn(vec2(uv.x * 1.3, 5.0));
  float damp = (1.0 - tss(tide - 0.08, tide + 0.02, y)) * (horiz ? 0.0 : 1.0);
  c = mix(c, c * vec3(0.62, 0.66, 0.6), damp * 0.7);
  c *= 1.0 - 0.25 * exp(-pow((y - tide) / 0.02, 2.0)) * (horiz ? 0.0 : 1.0);
  // rain streaks from the top
  float streak = tvn(vec2(uv.x * 7.0, uv.y * 0.35)) * tvn(vec2(uv.x * 23.0, uv.y * 0.8));
  c *= 1.0 - 0.35 * smoothstep(0.25, 0.6, streak) * tss(1.2, 3.3, y) * (horiz ? 0.0 : 1.0);
  // soot and grime gathered in the lower corners / on ledges
  c *= horiz ? 0.85 + 0.15 * tvn(uv * 4.0) : 1.0;
  col *= c * 1.15;
  float fineK = 1.0 - smoothstep(0.003, 0.02, px);
  H = 0.0015 * brush + fineK * 0.0008 * tvn(uv * 70.0) - 0.008 * fall - 0.004 * fall * mort + 0.002 * rim;
  rough = mix(0.92, 0.85, dado * 0.5);
  rough = mix(rough, 0.95, fall);
}`;

// ------------------------------------------------------------------------------------------------ textures
function shadeCanvas(W, H, fn) {
  const c = mkCanvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = fn(x / W, y / H, x, y), i = (y * W + x) * 4;
    d[i] = Math.max(0, Math.min(255, o[0] * 255)); d[i + 1] = Math.max(0, Math.min(255, o[1] * 255)); d[i + 2] = Math.max(0, Math.min(255, o[2] * 255)); d[i + 3] = o[3] === undefined ? 255 : o[3] * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// carved relief: kind 'vine' (a running scroll band, repeat along u), 'panel' (rosette in a sunk
// panel), 'jaali' (pierced lattice, alpha). Returns { map, bump } sharing UVs.
function carving(kind, { W = 512, H = 128, base = [0.36, 0.2, 0.11], seed = 1 } = {}) {
  const hgt = new Float32Array(W * H);
  const at = (u, v) => {
    if (kind === 'vine') {
      // stem: a sine scroll; leaves and rosettes in the bays; beaded borders
      const s = 0.5 + 0.22 * Math.sin(u * TAU * 4);
      let h = 0;
      h = Math.max(h, smooth(0.05, 0.02, Math.abs(v - s)));
      for (let k = 0; k < 8; k++) {
        const cu = (k + 0.5) / 8, cv = k % 2 ? 0.28 : 0.72;
        const du = (u - cu) * (W / H), dv = v - cv, r = Math.hypot(du, dv), a = Math.atan2(dv, du);
        const pr = 0.13 * (0.65 + 0.35 * Math.abs(Math.cos(a * 3)));
        h = Math.max(h, smooth(pr + 0.01, pr - 0.02, r) * (0.75 + 0.25 * Math.cos(r * 50)));
        h = Math.max(h, smooth(0.035, 0.02, r));
      }
      const bead = (vv) => { const dv = (v - vv) * H, du = ((u * W) % 10) - 5; return smooth(4, 2.5, Math.hypot(du, dv)); };
      h = Math.max(h, bead(0.07), bead(0.93));
      h = Math.max(h, smooth(0.015, 0.0, v) + smooth(0.985, 1.0, v));
      return h;
    }
    if (kind === 'panel') {
      const du = u - 0.5, dv = v - 0.5, r = Math.hypot(du, dv), a = Math.atan2(dv, du);
      const frame = Math.max(smooth(0.42, 0.44, Math.max(Math.abs(du), Math.abs(dv))), 0);
      const pr = 0.3 * (0.55 + 0.45 * Math.pow(Math.abs(Math.cos(a * 4)), 0.7));
      let h = 0.25 + 0.75 * frame;
      h = Math.max(h, smooth(pr + 0.01, pr - 0.02, r) * (0.7 + 0.3 * Math.cos(r * 60)));
      h = Math.max(h, smooth(0.07, 0.05, r));
      const cd = Math.hypot(Math.abs(du) - 0.36, Math.abs(dv) - 0.36);
      h = Math.max(h, smooth(0.05, 0.035, cd));
      return h;
    }
    // jaali: interlaced octagon-and-star lattice (1 = solid)
    const gu = (u * 6) % 1 - 0.5, gv = (v * 3) % 1 - 0.5;
    const oct = Math.max(Math.abs(gu) + Math.abs(gv), Math.max(Math.abs(gu), Math.abs(gv)) * 1.41);
    const ring = Math.abs(oct - 0.52);
    const diag = Math.min(Math.abs(gu - gv), Math.abs(gu + gv));
    return Math.max(smooth(0.08, 0.05, ring), smooth(0.05, 0.03, diag) * smooth(0.25, 0.3, Math.max(Math.abs(gu), Math.abs(gv))), smooth(0.44, 0.47, Math.max(Math.abs(gu), Math.abs(gv))));
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hgt[y * W + x] = at(x / W, y / H);
  const bump = shadeCanvas(W, H, (u, v, x, y) => { const h = hgt[y * W + x]; return [h, h, h, 1]; });
  const map = shadeCanvas(W, H, (u, v, x, y) => {
    const h = hgt[y * W + x], gr = 0.85 + 0.15 * Math.sin((v * 9 + noise2(u * 4 + seed, v * 3) * 1.6) * Math.PI) + 0.08 * noise2(u * 40, v * 6);
    const k = (0.5 + 0.5 * h) * gr * (kind === 'jaali' ? 1 : 1);
    return [base[0] * k, base[1] * k, base[2] * k, kind === 'jaali' ? (h > 0.5 ? 1 : 0) : 1];
  });
  const mt = toTexture(map, { repeat: true }), bt = toTexture(bump, { srgb: false, repeat: true });
  return { map: mt, bump: bt };
}

function clothTexture(kind, seed) {
  const W = 256, H = 512, r = rng(seed);
  const dots = [];
  for (let i = 0; i < 260; i++) dots.push([r(), r()]);
  return toTexture(shadeCanvas(W, H, (u, v) => {
    const mott = 0.85 + 0.15 * noise2(u * 6 + seed, v * 3) + 0.06 * noise2(u * 40, v * 60);
    const streak = 0.94 + 0.06 * noise2(u * 50, v * 2 + seed);
    let c;
    if (kind === 'indigo') {
      c = [0.1, 0.18, 0.44];
      // bandhani resist dots in a lattice of lozenges
      const gu = (u * 12) % 1 - 0.5, gv = (v * 22 + (Math.floor(u * 12) % 2) * 0.5) % 1 - 0.5;
      const d = Math.hypot(gu, gv * 0.9);
      const dot = smooth(0.17, 0.11, d) * smooth(0.12, 0.3, v) * smooth(0.95, 0.85, v);
      c = c.map((x, i) => x + ([0.62, 0.66, 0.7][i] - x) * dot * 0.85);
      const sel = smooth(0.04, 0.02, Math.min(u, 1 - u));
      c = c.map((x, i) => x + ([0.75, 0.72, 0.62][i] - x) * sel * 0.8);
    } else if (kind === 'madder') {
      c = [0.5, 0.06, 0.04];
      const bd = v > 0.82 || v < 0.06;
      const st = Math.abs(Math.sin(v * 140)) > 0.85 ? 1 : 0;
      if (v > 0.82) { const fu = (u * 10) % 1 - 0.5, fv = ((v - 0.82) / 0.18) - 0.5; const fl = smooth(0.32, 0.25, Math.hypot(fu, fv) * (1 + 0.4 * Math.cos(8 * Math.atan2(fv, fu)))); c = [0.5 - 0.42 * fl + 0.36 * fl, 0.06 + 0.4 * fl, 0.04 + 0.02 * fl]; }
      if (bd && st) c = [0.08, 0.03, 0.03];
      if (Math.abs(v - 0.8) < 0.006 || Math.abs(v - 0.08) < 0.006) c = [0.85, 0.6, 0.15];
    } else if (kind === 'turmeric') {
      c = [0.86, 0.52, 0.06];
      const sel = smooth(0.06, 0.04, Math.min(u, 1 - u));
      c = c.map((x, i) => x + ([0.6, 0.08, 0.04][i] - x) * sel);
      if (v > 0.88 && Math.abs(Math.sin(u * 90)) > 0.6) c = [0.6, 0.12, 0.05];
    } else {   // ajrakh: rows of madder and indigo lozenges with black outlines, white dots, banded borders
      const gu = (u * 8) % 1 - 0.5, row = Math.floor(v * 14), gv = (v * 14) % 1 - 0.5;
      const lz = Math.abs(gu) + Math.abs(gv) * 1.2;
      c = row % 2 ? [0.06, 0.09, 0.26] : [0.42, 0.05, 0.04];
      if (lz < 0.34) c = row % 2 ? [0.45, 0.06, 0.05] : [0.06, 0.09, 0.26];
      if (Math.abs(lz - 0.34) < 0.03) c = [0.03, 0.02, 0.02];
      if (lz < 0.07) c = [0.8, 0.74, 0.6];
      if (v > 0.9 || v < 0.06) c = Math.abs(Math.sin(v * 220)) > 0.7 ? [0.03, 0.02, 0.02] : [0.45, 0.05, 0.04];
    }
    return c.map((x) => x * mott * streak);
  }));
}

function weaveTexture() {
  return toTexture(shadeCanvas(256, 256, (u, v) => {
    const a = (u * 16) % 1, b = (v * 24) % 1, row = Math.floor(v * 24), col = Math.floor(u * 16);
    const over = (row + col) % 2 === 0;
    const s = over ? Math.sin(a * Math.PI) : Math.sin(b * Math.PI);
    const k = 0.45 + 0.55 * s * (0.85 + 0.15 * noise2(u * 30, v * 30));
    return [0.62 * k, 0.45 * k, 0.24 * k];
  }), { repeat: true });
}

// ------------------------------------------------------------------------------------------------ geometry helpers
let LK = 1;   // lite: coarser profiles
function lathe(knots, seg = 24, n = 0) {
  const pts = new THREE.SplineCurve(knots.map(([r, y]) => V2(Math.max(0, r), y))).getPoints(Math.max(knots.length + 1, Math.round((n || knots.length * 3) * LK))).map((p) => V2(Math.max(0, p.x), p.y));
  return new THREE.LatheGeometry(pts, seg);
}
let RB_SEG = 2;
const rbox = (w, h, d, r = 0.02, s = RB_SEG) => new RoundedBoxGeometry(w, h, d, Math.min(s, RB_SEG), Math.min(r, w / 2.01, h / 2.01, d / 2.01));
const uvScale = (g, sx, sy) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * sx, uv.getY(i) * sy); return g; };
// a turned post / baluster (profile in [r, y] from y = 0 to h)
function turned(h, r, seg = 16) {
  return lathe([[r * 1.35, 0], [r * 1.35, h * 0.05], [r * 1.05, h * 0.07], [r * 1.25, h * 0.11], [r, h * 0.15], [r * 0.85, h * 0.4], [r * 1.25, h * 0.52], [r * 0.8, h * 0.6], [r * 0.82, h * 0.85], [r * 1.2, h * 0.9], [r * 1.3, h * 0.96], [r * 1.35, h]], seg, 40);
}

// ------------------------------------------------------------------------------------------------ the courtyard
export function buildCourtyard(scene, { lite = false, cottonMat, wood, woodDark } = {}) {
  const R = rng(9907);
  RB_SEG = lite ? 1 : 2; LK = lite ? 0.45 : 1;
  const set = new THREE.Group(); set.name = 'courtyard'; scene.add(set);
  const add = (geo, mat, { cast = false, parent = set } = {}) => { const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.castShadow = cast; parent.add(m); return m; };

  // -------- materials
  const floorU = { uVat: { value: V2(3.6, -3.4) }, uTray: { value: V2(2.3, 0.35) } };
  const floorMat = procMaterial(FLOOR_GLSL, { key: 'floor', color: '#ffffff', roughness: 0.85, bump: 1.0, uniforms: floorU });
  const wallMat = procMaterial(WALL_GLSL, { key: 'wall', color: '#ffffff', roughness: 0.9, bump: 1.0 });
  const plasterMat = procMaterial(WALL_GLSL, { key: 'plaster', color: '#f2e6d4', roughness: 0.9, bump: 1.0, defines: '#define NO_DADO\n' });
  const sandstone = new THREE.MeshStandardMaterial({ color: '#c08e66', roughness: 0.82 });
  sandstone.userData.detail = { albedo: 0.22, rough: 0.4, bump: 0.0012, grime: 0.35 };
  const vine = carving('vine', { base: [0.42, 0.24, 0.13], seed: 3 });
  const vineStone = carving('vine', { base: [0.78, 0.55, 0.38], seed: 5 });
  const panelC = carving('panel', { W: 256, H: 256, base: [0.4, 0.22, 0.12], seed: 7 });
  const carvedWood = new THREE.MeshStandardMaterial({ map: vine.map, bumpMap: vine.bump, bumpScale: 2.2, roughness: 0.6, color: '#c89a78' });
  const carvedStone = new THREE.MeshStandardMaterial({ map: vineStone.map, bumpMap: vineStone.bump, bumpScale: 2.5, roughness: 0.85, color: '#ffffff' });
  const panelWood = new THREE.MeshStandardMaterial({ map: panelC.map, bumpMap: panelC.bump, bumpScale: 2.5, roughness: 0.58, color: '#c89a78' });
  for (const m of [carvedWood, carvedStone, panelWood]) m.userData.noAntiTile = true;
  const teak = woodDark;
  const brassM = new THREE.MeshStandardMaterial({ color: '#c8964a', metalness: 1, roughness: 0.35 });
  const terracotta = new THREE.MeshStandardMaterial({ color: '#9a4a2c', roughness: 0.8 });
  terracotta.userData.detail = { albedo: 0.25, rough: 0.3, bump: 0.0008, grime: 0.45 };
  const dark = new THREE.MeshStandardMaterial({ color: '#0d0806', roughness: 1 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#b39a72', roughness: 0.9 });
  const foliage = new THREE.MeshStandardMaterial({ color: '#203a1a', roughness: 0.8, side: THREE.DoubleSide });
  const treeMat = new THREE.MeshStandardMaterial({ color: '#34452a', roughness: 0.95 });
  const barkMat = new THREE.MeshStandardMaterial({ color: '#2a1d14', roughness: 0.95 });

  // -------- floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 72), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.userData.worldFloor = true;
  set.add(floor);

  // -------- walls
  const WH = 3.4, WT = 0.5;
  const ZB = -9, XW = -9, XE = 5.4, ZF = 7.2;
  const GAP0 = -7.75, GAP1 = -2.85;               // the sunrise gateway in the back wall
  const DOORX = -0.55, DOORW = 1.3, DOORH = 2.35;  // the carved doorway
  const JX = 1.75, JY = 1.95;                     // the jharokha
  const wallBox = (x0, x1, y0, y1, z0, z1, mat = wallMat) => add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat);
  // back wall: left stub | gate | right run with the door opening
  wallBox(XW - WT, GAP0 - 0.3, 0, WH, ZB - WT, ZB);
  wallBox(GAP1 + 0.3, DOORX - DOORW / 2 - 0.2, 0, WH, ZB - WT, ZB);
  wallBox(DOORX + DOORW / 2 + 0.2, XE + WT, 0, WH, ZB - WT, ZB);
  wallBox(DOORX - DOORW / 2 - 0.2, DOORX + DOORW / 2 + 0.2, DOORH + 0.42, WH, ZB - WT, ZB);
  // side and front walls
  wallBox(XW - WT, XW, 0, WH, ZB - WT, ZF + WT);
  wallBox(XE, XE + WT, 0, WH, ZB - WT, ZF + WT);
  wallBox(XW - WT, XE + WT, 0, WH, ZF, ZF + WT);
  // plinth (a moulded stone base) and cornice / coping along each inner face
  const runs = [   // [x0, z0, x1, z1, inward normal]
    [XW, ZB, GAP0 - 0.3, ZB, V3(0, 0, 1)], [GAP1 + 0.3, ZB, DOORX - DOORW / 2 - 0.2, ZB, V3(0, 0, 1)], [DOORX + DOORW / 2 + 0.2, ZB, XE, ZB, V3(0, 0, 1)],
    [XW, ZB, XW, ZF, V3(1, 0, 0)], [XE, ZB, XE, ZF, V3(-1, 0, 0)], [XW, ZF, XE, ZF, V3(0, 0, -1)],
  ];
  const corniceRuns = [[XW, ZB, GAP0 - 0.3, ZB, V3(0, 0, 1)], [GAP1 + 0.3, ZB, XE, ZB, V3(0, 0, 1)], ...runs.slice(3)];
  const moulding = (x0, z0, x1, z1, n, y, h, out, mat, r = 0.015) => {
    const len = Math.hypot(x1 - x0, z1 - z0), alongX = Math.abs(n.z) > 0.5;
    const g = rbox(alongX ? len : out * 2, h, alongX ? out * 2 : len, r, 2);
    return add(g.translate((x0 + x1) / 2, y + h / 2, (z0 + z1) / 2), mat);
  };
  for (const [x0, z0, x1, z1, n] of runs) {
    moulding(x0, z0, x1, z1, n, 0, 0.26, 0.07, sandstone);
    moulding(x0, z0, x1, z1, n, 0.26, 0.05, 0.045, sandstone, 0.012);
  }
  for (const [x0, z0, x1, z1, n] of corniceRuns) {
    moulding(x0, z0, x1, z1, n, WH - 0.42, 0.06, 0.05, plasterMat, 0.012);
    moulding(x0, z0, x1, z1, n, WH - 0.36, 0.1, 0.1, plasterMat);
    moulding(x0, z0, x1, z1, n, WH - 0.26, 0.05, 0.16, sandstone, 0.012);   // the drip ledge (chhajja line)
    moulding(x0, z0, x1, z1, n, WH, 0.08, WT * 0.5 + 0.06, sandstone, 0.02);   // coping
  }
  // small brackets under the drip ledge
  if (!lite) {
    const br = new THREE.Shape(); br.moveTo(0, 0); br.lineTo(0.16, 0); br.bezierCurveTo(0.12, -0.05, 0.06, -0.06, 0.04, -0.14); br.lineTo(0, -0.16); br.closePath();
    const bg = new THREE.ExtrudeGeometry(br, { depth: 0.06, bevelEnabled: false, curveSegments: 6 }).translate(0, 0, -0.03);
    const list = [];
    const put = (x, z, rotY) => list.push([x, z, rotY]);
    for (let x = XW + 0.6; x < XE - 0.2; x += 0.75) if ((x < GAP0 - 0.4 || x > GAP1 + 0.4)) put(x, ZB, -Math.PI / 2);
    for (let z = ZB + 0.6; z < ZF - 0.2; z += 0.75) { put(XW, z, 0); put(XE, z, Math.PI); }
    const im = new THREE.InstancedMesh(bg, sandstone, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach(([x, z, ry], i) => { q.setFromAxisAngle(V3(0, 1, 0), ry); im.setMatrixAt(i, m4.compose(V3(x, WH - 0.26, z), q, V3(1, 1, 1))); });
    im.receiveShadow = true; set.add(im);
  }
  // kangura cresting along the wall tops (the silhouette against the dawn sky)
  {
    const sh = new THREE.Shape();
    sh.moveTo(-0.14, 0); sh.lineTo(0.14, 0); sh.lineTo(0.14, 0.1); sh.lineTo(0.09, 0.13); sh.lineTo(0.09, 0.2); sh.quadraticCurveTo(0.08, 0.3, 0, 0.36); sh.quadraticCurveTo(-0.08, 0.3, -0.09, 0.2); sh.lineTo(-0.09, 0.13); sh.lineTo(-0.14, 0.1); sh.closePath();
    const kg = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false, curveSegments: lite ? 3 : 5 }).translate(0, 0, -0.07);
    const list = [];
    for (let x = XW - 0.1; x < XE + 0.3; x += 0.42) if (x < GAP0 - 0.5 || x > GAP1 + 0.5) list.push([x, ZB - WT / 2, 0]);
    for (let z = ZB + 0.2; z < ZF; z += 0.42) { list.push([XW - WT / 2, z, Math.PI / 2]); list.push([XE + WT / 2, z, Math.PI / 2]); }
    const im = new THREE.InstancedMesh(kg, sandstone, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach(([x, z, ry], i) => { q.setFromAxisAngle(V3(0, 1, 0), ry); im.setMatrixAt(i, m4.compose(V3(x, WH + 0.08, z), q, V3(1, 1, 1))); });
    im.receiveShadow = true; im.castShadow = false; set.add(im);
  }
  // pilasters (base, shaft, capital)
  const pilaster = (x, z, n) => {
    const alongX = Math.abs(n.z) > 0.5, w = 0.36, dpt = 0.07;
    const g = new THREE.Group(); g.position.set(x + n.x * 0.0, 0, z + n.z * 0.0); set.add(g);
    const box = (bw, bh, bd, y, mat, r = 0.012) => add(rbox(alongX ? bw : bd * 2, bh, alongX ? bd * 2 : bw, r).translate(0, y + bh / 2, 0), mat, { parent: g });
    box(w + 0.1, 0.38, dpt + 0.05, 0, sandstone); box(w + 0.04, 0.06, dpt + 0.03, 0.38, sandstone);
    box(w, WH - 0.95, dpt, 0.44, plasterMat);
    box(w + 0.06, 0.07, dpt + 0.03, WH - 0.55, sandstone); box(w + 0.12, 0.08, dpt + 0.05, WH - 0.5, sandstone);
  };
  for (const x of [GAP1 + 0.55, 3.3]) pilaster(x, ZB, V3(0, 0, 1));
  for (const z of [-5.2, -0.8, 3.6]) { pilaster(XW, z, V3(1, 0, 0)); pilaster(XE, z, V3(-1, 0, 0)); }

  // -------- the sunrise gateway: two domed pillars and a low parapet between
  for (const gx of [GAP0 - 0.3, GAP1 + 0.3]) {
    const g = new THREE.Group(); g.position.set(gx, 0, ZB - WT / 2); set.add(g);
    add(rbox(0.86, 0.5, 0.86, 0.02).translate(0, 0.25, 0), sandstone, { parent: g, cast: true });
    add(rbox(0.74, 0.08, 0.74, 0.015).translate(0, 0.54, 0), sandstone, { parent: g });
    add(new THREE.BoxGeometry(0.66, WH - 0.2, 0.66).translate(0, 0.58 + (WH - 0.2) / 2 - 0.02, 0), wallMat, { parent: g, cast: true });
    const capY = WH + 0.36;
    add(rbox(0.8, 0.08, 0.8, 0.015).translate(0, capY - 0.08, 0), sandstone, { parent: g });
    add(rbox(0.92, 0.1, 0.92, 0.02).translate(0, capY, 0), sandstone, { parent: g });
    // a little chhatri: four posts under an onion dome with a finial
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(turned(0.42, 0.03, 8).translate(sx * 0.3, capY + 0.1, sz * 0.3), sandstone, { parent: g });
    add(rbox(0.86, 0.06, 0.86, 0.015).translate(0, capY + 0.55, 0), sandstone, { parent: g });
    const dome = lathe([[0.36, 0], [0.4, 0.05], [0.42, 0.16], [0.38, 0.3], [0.26, 0.44], [0.1, 0.55], [0.035, 0.62], [0.05, 0.66], [0.02, 0.72], [0.03, 0.76], [0, 0.86]], lite ? 12 : 18, 32);
    add(dome.translate(0, capY + 0.58, 0), sandstone, { parent: g });
  }
  {
    const L = GAP1 - GAP0 + 0.0, cx = (GAP0 + GAP1) / 2, z = ZB - WT / 2;
    wallBox(GAP0, GAP1, 0, 0.5, z - 0.2, z + 0.2, plasterMat);
    add(rbox(L, 0.07, 0.52, 0.02).translate(cx, 0.535, z), sandstone);
    add(rbox(L, 0.2, 0.5, 0.02).translate(cx, 0.1, z + 0.05), sandstone);
    // steps down into the field beyond
    add(rbox(L - 0.4, 0.08, 0.5, 0.015).translate(cx, 0.04, z - 0.5), sandstone);
  }

  // -------- the carved doorway
  {
    const g = new THREE.Group(); g.position.set(DOORX, 0, ZB); set.add(g);
    const W = DOORW, Hd = DOORH;
    // the dark room behind, lamp-lit
    add(new THREE.BoxGeometry(W + 0.4, Hd + 0.4, 0.05).translate(0, (Hd + 0.4) / 2, -WT - 1.6), dark, { parent: g });
    const roomGlow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.3, Hd), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.12, 0.04), fog: true }));
    roomGlow.position.set(0, Hd / 2, -WT - 1.55); g.add(roomGlow);
    add(new THREE.BoxGeometry(W + 0.4, 0.04, 1.7).translate(0, -0.01, -WT - 0.8), sandstone, { parent: g });
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.05, Hd + 0.4, 1.7).translate(sx * (W / 2 + 0.2), (Hd + 0.4) / 2, -WT - 0.8), dark, { parent: g });
    add(new THREE.BoxGeometry(W + 0.4, 0.05, 1.7).translate(0, Hd + 0.42, -WT - 0.8), dark, { parent: g });
    // three stepped jambs, outermost carved, and a lintel stack
    const jamb = (off, w, d, mat, hExtra) => {
      for (const sx of [-1, 1]) { const b = rbox(w, Hd + hExtra, d, 0.012); uvScale(b, 1, 6); add(b.translate(sx * (W / 2 + off + w / 2), (Hd + hExtra) / 2, d / 2 - 0.02 - off * 0.4), mat, { parent: g, cast: true }); }
      const l = rbox(W + 2 * (off + w), w, d, 0.012); uvScale(l, 6, 1);
      add(l.translate(0, Hd + hExtra - w / 2, d / 2 - 0.02 - off * 0.4), mat, { parent: g });
    };
    jamb(0, 0.09, 0.16, teak, 0.09);
    jamb(0.09, 0.08, 0.13, carvedWood, 0.17);
    jamb(0.17, 0.12, 0.1, carvedWood, 0.29);
    // over-door: a projecting carved lintel band with a central block and hanging pendants
    const lb = rbox(W + 0.85, 0.18, 0.22, 0.015); uvScale(lb, 5, 1);
    add(lb.translate(0, Hd + 0.38, 0.1), carvedWood, { parent: g, cast: true });
    add(rbox(0.22, 0.26, 0.26, 0.02).translate(0, Hd + 0.4, 0.13), panelWood, { parent: g });
    add(rbox(W + 1.0, 0.05, 0.36, 0.012).translate(0, Hd + 0.5, 0.15), teak, { parent: g });
    const pend = lathe([[0, 0], [0.018, 0.01], [0.022, 0.03], [0.012, 0.05], [0.016, 0.07], [0.004, 0.1], [0, 0.11]], 8, 14);
    for (let k = 0; k < 9; k++) add(pend.clone().rotateX(Math.PI).translate(-((W + 0.7) / 2) + (k / 8) * (W + 0.7), Hd + 0.29, 0.2), brassM, { parent: g });
    // threshold and step
    add(rbox(W + 0.6, 0.12, 0.42, 0.02).translate(0, 0.06, 0.1), sandstone, { parent: g, cast: true });
    add(rbox(W + 1.0, 0.07, 0.4, 0.02).translate(0, 0.035, 0.42), sandstone, { parent: g });
    // two leaves: raised panels, brass studs; the right one ajar
    const leaf = (sx, ang) => {
      const lg = new THREE.Group(); lg.position.set(sx * W / 2, 0.12, -0.06); lg.rotation.y = sx * ang; g.add(lg);
      const lw = W / 2 - 0.005;
      add(rbox(lw, Hd - 0.12, 0.06, 0.01).translate(-sx * lw / 2, (Hd - 0.12) / 2, 0), teak, { parent: lg, cast: true });
      for (let k = 0; k < 3; k++) {
        const ph = (Hd - 0.4) / 3;
        const pnl = rbox(lw - 0.16, ph - 0.12, 0.03, 0.012);
        add(pnl.translate(-sx * lw / 2, 0.14 + ph * k + ph / 2, 0.035), panelWood, { parent: lg });
      }
      if (!lite) {
        const stud = new THREE.SphereGeometry(0.014, 8, 6, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2);
        const pos = [];
        for (let j = 0; j < 9; j++) for (let i = 0; i < 2; i++) pos.push([-sx * (i ? lw - 0.05 : 0.05), 0.12 + j * ((Hd - 0.36) / 8), 0.03]);
        for (let k = 0; k < 4; k++) pos.push([-sx * lw / 2, 0.14 + k * ((Hd - 0.4) / 3), 0.03]);
        const im = new THREE.InstancedMesh(stud, brassM, pos.length), m4 = new THREE.Matrix4();
        pos.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2]))); lg.add(im);
      }
      // ring handle
      add(new THREE.TorusGeometry(0.035, 0.006, 6, 18).translate(-sx * (lw - 0.1), Hd * 0.47, 0.05), brassM, { parent: lg });
    };
    leaf(-1, -0.15);
    leaf(1, -0.95);
  }
  const doorLight = new THREE.PointLight('#ff9c52', 0, 4.2, 2); doorLight.position.set(DOORX + 0.1, 1.3, ZB - 0.9); set.add(doorLight);
  const doorLamp = glowSprite({ color: '#ffb060', intensity: 1.2, scale: 0.35 }); doorLamp.position.set(DOORX - 0.35, 1.05, ZB - 1.3); set.add(doorLamp);

  // -------- the jharokha (sandstone, projecting from the back wall)
  {
    const g = new THREE.Group(); g.position.set(JX, JY, ZB); set.add(g);
    const W = 1.5, D = 0.62;
    // corbels
    const sh = new THREE.Shape();
    sh.moveTo(0, 0); sh.lineTo(D - 0.02, 0); sh.lineTo(D - 0.02, -0.07);
    sh.bezierCurveTo(D - 0.12, -0.1, D - 0.28, -0.12, D - 0.32, -0.3); sh.bezierCurveTo(D - 0.36, -0.46, 0.14, -0.52, 0.0, -0.6); sh.closePath();
    const cg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: lite ? 5 : 10 }).rotateY(-Math.PI / 2);
    for (const x of [-0.6, 0, 0.6]) add(cg.clone().translate(x + 0.06, 0, 0), sandstone, { parent: g, cast: true });
    // base slab, carved frieze and a beaded lip
    add(rbox(W + 0.14, 0.1, D + 0.06, 0.02).translate(0, 0.05, (D + 0.06) / 2), sandstone, { parent: g, cast: true });
    const fr = rbox(W + 0.06, 0.12, D, 0.01); uvScale(fr, 4, 1);
    add(fr.translate(0, -0.06, D / 2), carvedStone, { parent: g });
    // balustrade with jaali screens
    const jaaliC = lite ? null : carving('jaali', { W: 384, H: 192, base: [0.76, 0.52, 0.36] });
    const jaaliMat = lite ? sandstone : new THREE.MeshStandardMaterial({ map: jaaliC.map, bumpMap: jaaliC.bump, bumpScale: 3, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    const fpanel = new THREE.PlaneGeometry(W - 0.12, 0.4);
    add(fpanel.translate(0, 0.32, D - 0.04), jaaliMat, { parent: g });
    for (const sx of [-1, 1]) { const sp = new THREE.PlaneGeometry(D - 0.12, 0.4); uvScale(sp, 0.45, 1); add(sp.rotateY(Math.PI / 2).translate(sx * (W / 2 - 0.04), 0.32, D / 2), jaaliMat, { parent: g }); }
    add(rbox(W, 0.05, 0.08, 0.015).translate(0, 0.55, D - 0.04), sandstone, { parent: g });
    // dark interior and a lamp
    add(new THREE.BoxGeometry(W - 0.1, 1.2, 0.03).translate(0, 0.65, 0.03), dark, { parent: g });
    const lamp = glowSprite({ color: '#ffb060', intensity: 1.0, scale: 0.3 }); lamp.position.set(0.3, 0.68, 0.25); g.add(lamp);
    // columns
    for (const x of [-W / 2 + 0.06, -0.25, 0.25, W / 2 - 0.06]) add(turned(0.86, 0.035, lite ? 8 : 10).translate(x, 0.1, D - 0.05), sandstone, { parent: g, cast: true });
    // cusped arches between the columns (a pierced facade plate)
    const plate = new THREE.Shape(); plate.moveTo(-W / 2, 0); plate.lineTo(W / 2, 0); plate.lineTo(W / 2, 0.38); plate.lineTo(-W / 2, 0.38); plate.closePath();
    const bays = [[-W / 2 + 0.1, -0.29], [-0.21, 0.21], [0.29, W / 2 - 0.1]];
    for (const [a, b] of bays) {
      const hole = new THREE.Path(), cx = (a + b) / 2, hw = (b - a) / 2;
      hole.moveTo(a, -0.001); hole.lineTo(a, 0.08);
      const N = lite ? 18 : 36;
      for (let i = 0; i <= N; i++) {
        const u = i / N, th = Math.PI * (1 - u);
        const cusp = 0.025 * Math.abs(Math.sin(u * Math.PI * 5));
        const r = hw - cusp;
        hole.lineTo(cx + Math.cos(th) * r, 0.08 + Math.sin(th) * (0.24 - cusp) + 0.04 * Math.pow(Math.sin(th * 0.5 + (u > 0.5 ? Math.PI / 2 : 0)), 8) * 0);
      }
      hole.lineTo(b, -0.001); hole.closePath();
      plate.holes.push(hole);
    }
    const pg = new THREE.ExtrudeGeometry(plate, { depth: 0.05, bevelEnabled: false, curveSegments: 4 });
    add(pg.translate(0, 0.6, D - 0.08), sandstone, { parent: g });
    // eave (chhajja) and the curved bangla roof with drooping ends
    const eave = rbox(W + 0.4, 0.04, D + 0.3, 0.015); eave.rotateX(0.18);
    add(eave.translate(0, 1.02, (D + 0.3) / 2 - 0.02), sandstone, { parent: g, cast: true });
    const rs = new THREE.Shape(); rs.moveTo(0, 0); rs.lineTo(D + 0.18, -0.06); rs.quadraticCurveTo(D * 0.7, 0.36, 0, 0.44); rs.closePath();
    const rg = new THREE.ExtrudeGeometry(rs, { depth: W + 0.3, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 10, steps: lite ? 8 : 14 });
    rg.rotateY(-Math.PI / 2).translate((W + 0.3) / 2, 0, 0);
    { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / ((W + 0.3) / 2); p.setY(i, p.getY(i) - 0.1 * x * x * x * x); } rg.computeVertexNormals(); }
    add(rg.translate(0, 1.07, 0), sandstone, { parent: g, cast: true });
    for (const x of [-0.45, 0, 0.45]) add(lathe([[0.04, 0], [0.05, 0.03], [0.03, 0.06], [0.012, 0.09], [0.018, 0.11], [0, 0.15]], 10, 16).translate(x, 1.5, 0.12), brassM, { parent: g });
  }

  // -------- drying lines with dyed cloth lengths (backlit by the dawn)
  const clothParts = [];
  const transU = { uL: { value: V3(-0.7, 0.45, -0.5).normalize() }, uBack: { value: 1 }, uTime: { value: 0 }, uKey: { value: new THREE.Color(1, 0.8, 0.6) } };
  const clothMat = (kind, seed) => {
    const m = new THREE.MeshStandardMaterial({ map: clothTexture(kind, seed), roughness: 0.92, side: THREE.DoubleSide });
    m.userData.noAntiTile = true;
    m.userData.detail = { albedo: 0.08, rough: 0.2, bump: 0.0004, grime: 0.1 };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, transU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 swayDir; attribute float hang; uniform float uTime; varying vec3 vClW;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { float ph = dot(position, vec3(0.7, 0.0, 0.9));
            float s = sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.3 + ph * 2.1) * 0.25;
            transformed += swayDir * s * 0.045 * pow(hang, 1.6); }`)
        .replace('#include <project_vertex>', '#include <project_vertex>\nvClW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uL; uniform float uBack; uniform vec3 uKey; varying vec3 vClW;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float bt = max(dot(normalize(vClW - cameraPosition), uL), 0.0);
            vec3 tc = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(0.55));
            totalEmissiveRadiance += tc * uKey * uBack * (0.05 + 1.5 * pow(bt, 2.0)); }`);
    };
    m.customProgramCacheKey = () => 'textiles-drycloth';
    return m;
  };
  const kinds = { indigo: clothMat('indigo', 3), madder: clothMat('madder', 5), turmeric: clothMat('turmeric', 7), ajrakh: clothMat('ajrakh', 9) };
  const pole = turned(2.45, 0.035, lite ? 8 : 12);
  const dryLine = (a, b, top, sag, cloths) => {
    // poles with finials, the rope (a catenary), cloths hung over it
    for (const p of [a, b]) {
      add(pole.clone().translate(p.x, 0, p.z), wood, { cast: true });
      add(lathe([[0.05, 0], [0.06, 0.03], [0.03, 0.08], [0.015, 0.12], [0, 0.14]], 10, 16).translate(p.x, 2.45, p.z), wood);
      add(rbox(0.18, 0.08, 0.18, 0.02).translate(p.x, 0.04, p.z), sandstone);
    }
    const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
    const nrm = V3(-dir.z, 0, dir.x);
    const ropeY = (u) => top - sag * 4 * u * (1 - u);
    const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(a.clone().addScaledVector(dir, u * len).setY(ropeY(u))); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 5), ropeMat);
    for (const { u0, u1, L, kind, seed } of cloths) {
      const r = rng(seed), nx = lite ? 10 : 18, ny = lite ? 14 : 26;
      const g = new THREE.PlaneGeometry(1, 1, nx, ny), p = g.attributes.position, uv = g.attributes.uv;
      const sway = new Float32Array(p.count * 3), hang = new Float32Array(p.count);
      const ph1 = r() * 6, ph2 = r() * 6, k1 = 14 + r() * 8, k2 = 30 + r() * 10;
      for (let i = 0; i < p.count; i++) {
        const fu = uv.getX(i), fv = 1 - uv.getY(i);       // fv: 0 at the rope → 1 at the hem
        const u = lerp(u0, u1, fu), along = u * len;
        const hemWob = 0.04 * noise2(fu * 4 + seed, 1.3);
        const yy = ropeY(u) - 0.01 - fv * (L + hemWob);
        const amp = 0.02 + 0.07 * Math.pow(fv, 0.8);
        const fold = amp * (0.6 * Math.sin(fu * k1 * (u1 - u0) + ph1) + 0.4 * Math.sin(fu * k2 * (u1 - u0) + ph2)) + 0.05 * Math.sin(Math.PI * fu) * fv;
        const pos = a.clone().addScaledVector(dir, along).addScaledVector(nrm, fold).setY(yy);
        p.setXYZ(i, pos.x, pos.y, pos.z);
        sway[i * 3] = nrm.x; sway[i * 3 + 1] = 0; sway[i * 3 + 2] = nrm.z; hang[i] = fv;
      }
      g.setAttribute('swayDir', new THREE.BufferAttribute(sway, 3)); g.setAttribute('hang', new THREE.BufferAttribute(hang, 1));
      g.computeVertexNormals();
      const m = add(g, kinds[kind], { cast: true }); m.frustumCulled = false;
      clothParts.push(m);
      // pegs
      for (const fu of [0.08, 0.92]) { const u = lerp(u0, u1, fu), q = a.clone().addScaledVector(dir, u * len).setY(ropeY(u) + 0.015); add(new THREE.BoxGeometry(0.014, 0.06, 0.02).translate(q.x, q.y, q.z), wood); }
    }
  };
  // line A: across the back, right of the doorway (in front of the vats)
  dryLine(V3(2.75, 0, -6.4), V3(5.0, 0, -6.4), 2.38, 0.12, [
    { u0: 0.04, u1: 0.3, L: 1.5, kind: 'indigo', seed: 11 },
    { u0: 0.34, u1: 0.62, L: 1.62, kind: 'madder', seed: 12 },
    { u0: 0.66, u1: 0.95, L: 1.4, kind: 'turmeric', seed: 13 },
  ]);
  // line B: along the west side
  dryLine(V3(-7.4, 0, -7.6), V3(-7.4, 0, -2.4), 2.3, 0.14, [
    { u0: 0.05, u1: 0.33, L: 1.45, kind: 'turmeric', seed: 21 },
    { u0: 0.37, u1: 0.66, L: 1.55, kind: 'ajrakh', seed: 22 },
    { u0: 0.7, u1: 0.95, L: 1.35, kind: 'indigo', seed: 23 },
  ]);

  // -------- dye vats on a plastered platform
  {
    const g = new THREE.Group(); g.position.set(3.7, 0, -3.5); g.rotation.y = 0.0; set.add(g);
    add(rbox(1.0, 0.42, 2.9, 0.05, 3).translate(0, 0.21, 0), plasterMat, { parent: g, cast: true });
    add(rbox(1.08, 0.06, 2.98, 0.02).translate(0, 0.44, 0), sandstone, { parent: g });
    const potRim = lathe([[0.36, -0.05], [0.37, 0.0], [0.4, 0.03], [0.41, 0.06], [0.38, 0.08], [0.34, 0.07], [0.33, 0.0], [0.33, -0.1]], lite ? 18 : 32);
    const liquids = [
      { z: -0.95, c: '#05081e', foam: true }, { z: 0, c: '#3a0606', foam: false }, { z: 0.95, c: '#6a3e04', foam: false },
    ];
    for (const L of liquids) {
      add(potRim.clone().translate(0, 0.47, L.z), terracotta, { parent: g, cast: true });
      const lm = new THREE.MeshPhysicalMaterial({ color: L.c, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05, metalness: 0 });
      lm.userData.noDetail = true;
      add(new THREE.CircleGeometry(0.34, lite ? 20 : 36).rotateX(-Math.PI / 2).translate(0, 0.5, L.z), lm, { parent: g });
      if (L.foam) {
        // the coppery 'flower' of a live indigo vat
        const fc = shadeCanvas(128, 128, (u, v) => { const r = Math.hypot(u - 0.5, v - 0.5), n = noise2(u * 18, v * 18) * 0.5 + 0.5; const a = smooth(0.32, 0.12, r) * smooth(0.35, 0.65, n + 0.25); return [0.55 * n + 0.2, 0.3 * n + 0.08, 0.32 * n + 0.18, a]; });
        const fm = new THREE.MeshStandardMaterial({ map: toTexture(fc), transparent: true, metalness: 0.6, roughness: 0.3, depthWrite: false });
        add(new THREE.CircleGeometry(0.3, 24).rotateX(-Math.PI / 2).translate(0.03, 0.502, L.z - 0.02), fm, { parent: g });
      }
    }
    // a stirring paddle leaning on the platform, folded cloth stacked at the end
    add(new THREE.CylinderGeometry(0.018, 0.018, 1.7, 8).rotateZ(0.5).translate(-0.6, 0.78, 0.45), wood, { parent: g, cast: true });
    for (let k = 0; k < 4; k++) add(rbox(0.5, 0.06, 0.38, 0.025).translate(0.0, 0.5 + 0.06 * k, 1.55 + 0.01 * (k % 2)), [kinds.indigo, kinds.madder, kinds.indigo, kinds.turmeric][k], { parent: g, cast: true });
  }
  // a second, freestanding vat (a large pot sunk in a ring of plaster)
  {
    const g = new THREE.Group(); g.position.set(3.1, 0, -1.4); set.add(g);
    add(lathe([[0.42, 0], [0.48, 0.08], [0.5, 0.22], [0.44, 0.38], [0.37, 0.44], [0.4, 0.48], [0.36, 0.5], [0.33, 0.42], [0.0, 0.4]], lite ? 18 : 32).translate(0, 0, 0), terracotta, { parent: g, cast: true });
    const lm = new THREE.MeshPhysicalMaterial({ color: '#04071a', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }); lm.userData.noDetail = true;
    add(new THREE.CircleGeometry(0.34, 24).rotateX(-Math.PI / 2).translate(0, 0.44, 0), lm, { parent: g });
  }

  // -------- print table, ink tray and resting blocks (beside the cloth)
  const tray = new THREE.Group(); tray.position.set(2.35, 0, 0.35); tray.rotation.y = -0.12; set.add(tray);
  {
    add(rbox(0.9, 0.06, 0.62, 0.02).translate(0, 0.24, 0), wood, { parent: tray, cast: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(turned(0.21, 0.022, 8).translate(sx * 0.38, 0.0, sz * 0.25), woodDark, { parent: tray, cast: true });
    // tray with a dye-soaked pad
    add(rbox(0.46, 0.05, 0.36, 0.012).translate(-0.18, 0.295, 0), woodDark, { parent: tray, cast: true });
    const pad = new THREE.MeshPhysicalMaterial({ color: '#8a1a0e', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }); pad.userData.noDetail = true;
    add(new THREE.PlaneGeometry(0.4, 0.3).rotateX(-Math.PI / 2).translate(-0.18, 0.322, 0), pad, { parent: tray });
    // small bowls of turmeric and indigo
    const bowl = lathe([[0.0, 0], [0.05, 0.0], [0.07, 0.02], [0.075, 0.045], [0.07, 0.05], [0.0, 0.03]], 16);
    add(bowl.clone().translate(0.2, 0.27, -0.16), terracotta, { parent: tray });
    add(bowl.clone().translate(0.32, 0.27, 0.0), terracotta, { parent: tray });
    const tm = new THREE.MeshStandardMaterial({ color: '#c88a0c', roughness: 0.5 }), im2 = new THREE.MeshStandardMaterial({ color: '#0a1240', roughness: 0.3 });
    add(new THREE.CircleGeometry(0.062, 16).rotateX(-Math.PI / 2).translate(0.2, 0.313, -0.16), tm, { parent: tray });
    add(new THREE.CircleGeometry(0.062, 16).rotateX(-Math.PI / 2).translate(0.32, 0.313, 0.0), im2, { parent: tray });
  }

  // -------- cotton: heaps on spread cloths, baskets, potted tulsi
  const heapGeo = (r, h, seed) => {
    const g = new THREE.SphereGeometry(1, lite ? 16 : 26, lite ? 10 : 16, 0, TAU, 0, Math.PI / 2), p = g.attributes.position, v = V3(0, 0, 0);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 0.14 * noise3(v.x * 2.5 + seed, v.y * 2.5, v.z * 2.5) + 0.07 * noise3(v.x * 7, v.y * 7 + seed, v.z * 7) + 0.03 * noise3(v.x * 18, v.y * 18, v.z * 18 + seed);
      v.multiplyScalar(1 + n); p.setXYZ(i, v.x * r, Math.max(0, v.y) * h, v.z * r);
    }
    g.computeVertexNormals(); return g;
  };
  const spread = (x, z, w, d, rot, kind) => { const m = add(new THREE.PlaneGeometry(w, d, 6, 6).rotateX(-Math.PI / 2), kinds[kind]); m.position.set(x, 0.008, z); m.rotation.y = rot; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.006 * noise2(p.getX(i) * 4, p.getZ(i) * 4)); m.geometry.computeVertexNormals(); };
  spread(-3.85, 3.2, 1.5, 1.2, 0.35, 'madder');
  add(heapGeo(0.55, 0.38, 3).translate(-3.9, 0.01, 3.15), cottonMat, { cast: true });
  add(heapGeo(0.3, 0.22, 7).translate(-3.35, 0.01, 3.55), cottonMat, { cast: true });
  spread(-0.3, 3.6, 1.1, 0.9, -0.2, 'indigo');
  add(heapGeo(0.38, 0.28, 11).translate(-0.35, 0.01, 3.6), cottonMat, { cast: true });
  const basketTex = weaveTexture(); basketTex.repeat.set(10, 3);
  const basketMat = new THREE.MeshStandardMaterial({ map: basketTex, roughness: 0.85, side: THREE.DoubleSide, color: '#e8c89a' }); basketMat.userData.noAntiTile = true;
  const basket = (x, z, r, h, fill) => {
    add(lathe([[r * 0.72, 0], [r * 0.9, h * 0.15], [r, h * 0.6], [r * 1.02, h]], lite ? 14 : 26, 12).translate(x, 0, z), basketMat, { cast: true });
    add(new THREE.CircleGeometry(r * 0.72, 16).rotateX(-Math.PI / 2).translate(x, 0.004, z), basketMat);
    add(new THREE.TorusGeometry(r * 1.02, 0.018, 6, lite ? 18 : 32).rotateX(Math.PI / 2).translate(x, h, z), basketMat);
    if (fill) add(heapGeo(r * 0.98, r * 0.6, x * 3 + z).translate(x, h - 0.05, z), cottonMat, { cast: true });
  };
  basket(-4.75, 2.55, 0.3, 0.34, true);
  basket(-2.85, 3.95, 0.24, 0.28, true);
  basket(0.75, 3.8, 0.26, 0.3, false);
  basket(4.5, -5.0, 0.32, 0.36, true);
  // potted tulsi / ferns along the walls and at the gate
  const leafG = (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.02, 0.025, 0, 0.06); s.quadraticCurveTo(-0.02, 0.025, 0, 0); return new THREE.ShapeGeometry(s, 3); })();
  const shrub = (seed, n, rad, h) => {
    const r = rng(seed), parts = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = Math.sqrt(r()) * rad, y = h * (0.3 + 0.7 * r()) * (1 - 0.4 * (rr / rad));
      const lg = leafG.clone().scale(1 + r() * 0.8, 1 + r() * 0.8, 1).rotateX(-0.6 - r() * 0.8).rotateY(-a + Math.PI / 2 + (r() - 0.5));
      parts.push(lg.translate(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    return merge(parts);
  };
  const potG = lathe([[0.12, 0], [0.17, 0.05], [0.21, 0.2], [0.19, 0.3], [0.16, 0.34], [0.2, 0.37], [0.2, 0.4], [0.15, 0.4]], lite ? 14 : 24);
  const pots = [[-8.45, -8.45, 1.2], [GAP0 - 0.95, ZB + 0.55, 1.0], [GAP1 + 0.95, ZB + 0.55, 1.05], [4.85, -8.45, 1.1], [4.85, 2.6, 0.9], [-8.5, 1.5, 1.0], [-8.5, 5.5, 1.15], [DOORX - 1.15, ZB + 0.45, 0.85], [DOORX + 1.15, ZB + 0.45, 0.85]];
  pots.forEach(([x, z, s], k) => {
    add(potG.clone().scale(s, s, s).translate(x, 0, z), terracotta, { cast: true });
    add(shrub(100 + k, lite ? 70 : 150, 0.26 * s, 0.55 * s).translate(x, 0.36 * s, z), foliage, { cast: true });
  });
  // brass lota and diyas by the door
  const lota = lathe([[0, 0], [0.06, 0.0], [0.09, 0.05], [0.085, 0.1], [0.05, 0.14], [0.035, 0.17], [0.05, 0.2], [0.0, 0.19]], 18);
  add(lota.clone().translate(DOORX + 0.95, 0.07, ZB + 0.55), brassM, { cast: true });
  add(lota.clone().scale(0.8, 0.8, 0.8).translate(2.1, 0.0, 3.2), brassM, { cast: true });
  const diyaFlames = [];
  for (const [x, z] of [[DOORX - 0.75, ZB + 0.42], [DOORX + 0.75, ZB + 0.42]]) {
    add(lathe([[0, 0], [0.04, 0.0], [0.055, 0.02], [0.05, 0.03], [0.0, 0.02]], 12).translate(x, 0.07, z), terracotta);
    const fl = glowSprite({ color: '#ffb35a', intensity: 1.6, scale: 0.16 }); fl.position.set(x, 0.14, z); set.add(fl); diyaFlames.push(fl);
  }

  // -------- beyond the walls: trees, and a far line of trees under the sunrise
  if (!lite) {
    // neem: a short trunk forking into branches under a broad, clumped crown
    const tree = (x, z, h, rad, seed) => {
      const r = rng(seed), wood = [], parts = [];
      wood.push(new THREE.CylinderGeometry(0.14, 0.24, h * 0.5, 7).translate(x, h * 0.25, z));
      for (let i = 0; i < 4; i++) { const a = r() * TAU, l = rad * (0.5 + 0.4 * r()); const tip = V3(x + Math.cos(a) * l, h * (0.72 + 0.12 * r()), z + Math.sin(a) * l); const base = V3(x, h * 0.48, z); const d = tip.clone().sub(base); wood.push(new THREE.CylinderGeometry(0.05, 0.1, d.length(), 5).translate(0, d.length() / 2, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize())).translate(base.x, base.y, base.z)); }
      add(merge(wood), barkMat);
      for (let i = 0; i < 16; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * rad; parts.push(new THREE.IcosahedronGeometry(rad * (0.28 + 0.2 * r()), 1).scale(1, 0.7, 1).translate(x + Math.cos(a) * rr, h * (0.8 + 0.16 * r()) - 0.25 * rr, z + Math.sin(a) * rr)); }
      const g = merge(parts), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const n = noise3(p.getX(i) * 1.3, p.getY(i) * 1.3, p.getZ(i) * 1.3) * 0.22; p.setXYZ(i, p.getX(i) + n, p.getY(i) + n * 0.6, p.getZ(i) + n); }
      g.computeVertexNormals();
      add(g, treeMat);
    };
    // a date palm: a leaning, tapering trunk and a crown of arching fronds
    const palm = (x, z, h, lean, seed) => {
      const r = rng(seed);
      const top = V3(x + lean * 0.8, h, z + lean * 0.3);
      const curve = new THREE.CatmullRomCurve3([V3(x, 0, z), V3(x + lean * 0.15, h * 0.4, z + lean * 0.05), V3(x + lean * 0.5, h * 0.8, z + lean * 0.18), top]);
      const trunk = new THREE.TubeGeometry(curve, 14, 1, 6, false), tp = trunk.attributes.position, c = V3(0, 0, 0), v = V3(0, 0, 0);
      for (let i = 0; i <= 14; i++) { curve.getPointAt(i / 14, c); const rr = 0.2 - 0.08 * (i / 14) + 0.015 * Math.sin(i * 3); for (let j = 0; j <= 6; j++) { const k = i * 7 + j; v.fromBufferAttribute(tp, k).sub(c).multiplyScalar(rr).add(c); tp.setXYZ(k, v.x, v.y, v.z); } }
      trunk.computeVertexNormals(); add(trunk, barkMat);
      const fr = [];
      for (let k = 0; k < 13; k++) {
        const a = (k / 13) * TAU + r() * 0.3, L = 2.2 + r() * 0.9, up = 0.5 + r() * 0.6, N = 9, pos = [], idx = [];
        const dir = V3(Math.cos(a), 0, Math.sin(a)), side = V3(-dir.z, 0, dir.x);
        for (let i = 0; i <= N; i++) {
          const u = i / N, w = 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05)) * (1 - 0.3 * u);
          const pc = top.clone().addScaledVector(dir, u * L).setY(top.y + up * u * 1.6 - (up + 1.6) * u * u);
          const droop = 0.12 * u;
          const a1 = pc.clone().addScaledVector(side, w).setY(pc.y - droop), a2 = pc.clone().addScaledVector(side, -w).setY(pc.y - droop);
          pos.push(a1.x, a1.y, a1.z, pc.x, pc.y + 0.03, pc.z, a2.x, a2.y, a2.z);
          if (i < N) { const b = i * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        fr.push(g);
      }
      add(merge(fr), foliage);
    };
    tree(-12.5, -12.5, 8.5, 2.6, 1); tree(3.5, -14.0, 9.0, 3.0, 2); tree(-14.0, -2.5, 7.5, 2.4, 4);
    palm(-10.6, -11.0, 7.6, 0.9, 7); palm(7.6, -7.5, 8.4, -0.7, 8); palm(-1.2, -13.2, 7.0, 0.5, 9);
    // the far tree line (low, so the sun clears it)
    const far = [];
    for (let i = 0; i < 26; i++) { const x = -22 + i * 1.9 + R() * 1.2, z = -34 - R() * 6; far.push(new THREE.IcosahedronGeometry(1.0 + R() * 1.3, 1).scale(1.3, 0.55, 1).translate(x, 0.3 + R() * 0.4, z)); }
    add(merge(far), treeMat);
  }

  return {
    floor, floorMat, wallMat, tray,
    doorLight,
    update(t, { dawn, keyDir, keyCol, keyI }) {
      transU.uTime.value = t;
      transU.uL.value.copy(keyDir);
      transU.uKey.value.copy(keyCol).multiplyScalar(keyI / 3.2);
      transU.uBack.value = 0.9 + 0.6 * dawn;
      doorLight.intensity = 2.6 * (1 - 0.5 * dawn) * (0.92 + 0.08 * Math.sin(t * 9.0) * Math.sin(t * 5.3));
      for (let i = 0; i < diyaFlames.length; i++) diyaFlames[i].scale.setScalar(0.16 * (0.9 + 0.1 * Math.sin(t * 11 + i * 2)));
    },
  };
}
