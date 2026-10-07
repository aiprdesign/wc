// Procedural surfaces for THE FIRST CITIES (indus.js). Everything is computed in the shader from the
// part's rest-pose position (glued to the part while it rises), so there is no texture tile and no period:
//   brick  — Harappan baked brick, 1 : 2 : 4, English bond on walls and running bond on paving; per-brick
//            firing colour, size jitter, chipped arrises, missing bricks, mud mortar with dust in the joints;
//            weathering in world space: broad tonal blotches, rising damp with salt bloom at the foot,
//            rain streaks under the wall top, and a mud-plaster skin (per part: aTag.x) that survives high
//            up and wears off lower down, with its own shrinkage cracks and a broken rim.
//   roof   — mud plaster over reed and timber: hand-smoothed tone, two scales of drying cracks, water
//            stains, scuffed tracks and worn hollows showing the coarse straw-mud layer underneath.
//   bitumen— the Great Bath lining: brick set in gypsum, sealed with dark glossy bitumen.
//   wood   — weathered timber (lintels, ladders, frames, spouts).
//   pot    — red-slipped pottery with black painted bands.
//   cloth  — cotton (per-part dye in aTag.w).
// aTag = (plaster amount 0..1, base y, top y, seed 0..1) per part.
import * as THREE from 'three';
import { patchRise } from './indus-assets.js';

export const INDUS_NOISE = /* glsl */ `
float iH2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float iH3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 191.999))) * 43758.5453); }
float iN2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(iH2(i), iH2(i + vec2(1.0, 0.0)), f.x), mix(iH2(i + vec2(0.0, 1.0)), iH2(i + vec2(1.0, 1.0)), f.x), f.y); }
float iFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * iN2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(1.7, 9.2); a *= 0.5; } return s / 0.9375; }
// cellular: x = distance to nearest feature, y = F2 - F1 (≈ distance to the cell border), z = cell hash
vec3 iCell(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y)), o = vec2(iH2(i + g), iH2(i + g + 17.3));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = iH2(i + g + 3.1); } else if (d < d2) d2 = d;
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}`;

const SURF_GLSL = /* glsl */ `
varying vec3 vRP; varying vec3 vRN; varying vec4 vTag;
// one baked brick on a face. uv in metres (u along the wall, v up); w = metres per pixel.
// out: colour, height (1 face, 0 joint, <0 missing), roughness offset
vec3 brickTone(vec2 id, float seed){
  float a = iH2(id + seed * 13.1), b = iH2(id + 7.13 + seed), c = iH2(id + 21.7 - seed);
  vec3 col = mix(vec3(0.40, 0.155, 0.08), vec3(0.50, 0.30, 0.17), a * a);  // brick red → buff
  col *= 0.72 + 0.5 * b;
  if (c > 0.92) col = mix(col, vec3(0.16, 0.085, 0.06), 0.8);               // over-fired, dark
  else if (c < 0.08) col = mix(col, vec3(0.58, 0.44, 0.31), 0.6);           // under-fired, pale
  return col;
}
vec3 brickBond(vec2 uv, float seed, float w, bool paving, out float h, out float mortar){
  float CH = paving ? 0.14 : 0.08;                           // course: 7 cm brick + 1 cm joint (paving: 14 cm wide)
  float k = floor(uv.y / CH), hdr = mod(k, 2.0);
  float unit = paving ? 0.28 : (hdr > 0.5 ? 0.14 : 0.28);
  float uu = uv.x + (paving ? hdr * 0.14 : hdr * 0.07) + seed * 0.37;
  float i = floor(uu / unit);
  vec2 id = vec2(i + seed * 31.0, k);
  float r1 = iH2(id + 1.3), r2 = iH2(id + 5.9), r3 = iH2(id + 9.7);
  vec2 f = vec2(uu - i * unit, uv.y - k * CH);
  float jx = 0.004 + 0.004 * r1, jy = 0.0035 + 0.003 * r2;   // joints of uneven width: hand-laid
  float ed = min(min(f.x, unit - f.x) - jx, min(f.y, CH - f.y) - jy);
  ed -= 0.005 * iN2(uv * 95.0 + seed) * (0.4 + r3);        // chipped arrises
  float aa = max(w, 2e-4);
  float face = smoothstep(-aa * 0.6, aa * 0.6 + 0.004, ed);
  face = 1.0 - (1.0 - face) * min(1.0, 0.009 / aa);       // a joint thinner than a pixel → a faint line
  vec3 col = brickTone(id, seed);
  // grain on the face: sand, pits, a worn lighter centre
  float g = iN2(uv * 140.0 + id) * 0.6 + iN2(uv * 33.0 - id) * 0.4;
  col *= 0.88 + 0.22 * g;
  // macro close-ups: sand grains, pits and fire-cracks resolve (sub-millimetre)
  float micro = 1.0 - smoothstep(0.0004, 0.002, aa);
  if (micro > 0.0){
    float gr = iN2(uv * 900.0 + id * 3.0) * 0.5 + iN2(uv * 2600.0) * 0.5;
    vec3 pit = iCell(uv * 260.0 + id);
    float pm = (1.0 - smoothstep(0.06, 0.16, pit.x)) * step(0.7, pit.z);
    col *= 1.0 - micro * (0.16 * (gr - 0.5) * 2.0 * 0.5 + 0.45 * pm);
    col = mix(col, vec3(0.62, 0.5, 0.36), micro * 0.25 * step(0.97, pit.z) * (1.0 - smoothstep(0.1, 0.25, pit.x)));   // lime nodules
    g += micro * (gr - 0.5) * 0.3 - micro * pm * 0.8;
  }
  col *= 1.0 + 0.08 * smoothstep(0.004, 0.025, ed);
  h = face * (0.85 + 0.15 * g);
  if (r3 > 0.988 && !paving){ h = -0.6; col *= 0.35; }      // a missing brick: a dark socket
  vec3 mort = vec3(0.21, 0.155, 0.105) * (0.8 + 0.4 * iN2(uv * 60.0));
  if (paving) mort = mix(mort, vec3(0.44, 0.36, 0.27), 0.6); // pale dust packed in the floor joints
  mortar = 1.0 - face;
  return mix(mort, col, face);
}
// a crack line, area-correct: dM metres from its centre line, half-width cw; thinner than a pixel → fainter
float crackL(float dM, float cw, float w){ float ww = max(w, cw); return (1.0 - smoothstep(0.0, ww, dM)) * min(1.0, cw / max(w, 1e-5)); }
// a sparse network of drying cracks at frequency fq (cells per metre): edges come and go along their length
float cracks(vec2 uv, float fq, float cw, float w, float density, float seed){
  vec3 c = iCell(uv * fq + seed * 7.3);
  float keep = smoothstep(1.0 - density - 0.12, 1.0 - density + 0.12, iN2(uv * fq * 1.3 + 4.1 + seed));
  return crackL(c.y * 0.5 / fq, cw, w) * keep;
}
float bumpH;          // height for the derivative bump
float roughK;         // roughness for this fragment
vec3 iAlb;            // albedo
`;

// the fragment main for each kind (runs in place of map_fragment; writes iAlb, bumpH, roughK)
const KIND = {
  brick: /* glsl */ `
  {
    vec3 P = vRP, N = normalize(vRN), A = abs(N);
    float w = length(fwidth(P));
    float seed = vTag.w;
    bool top = A.y > max(A.x, A.z) + 0.05;
    vec2 uv = top ? vec2(P.x, P.z) : (A.x > A.z ? vec2(P.z, P.y) : vec2(P.x, P.y));
    float fS = A.x > A.z ? 1.0 : 0.0;
    float hB, mort;
    vec3 col = brickBond(uv, fS + (top ? 2.0 : 0.0), w, top, hB, mort);
    float det = 1.0 - smoothstep(0.03, 0.06, w);           // courses resolve
    float det2 = 1.0 - smoothstep(0.05, 0.16, w);          // single bricks resolve
    vec3 mean = mix(vec3(0.38, 0.19, 0.11), vec3(0.46, 0.28, 0.17), iN2(uv * 2.3 + seed * 9.0));
    mean *= 0.85 + 0.3 * iN2(vec2(uv.x * 0.7, uv.y * 4.0) + seed);   // rows and batches of bricks
    col = mix(mix(mean, brickTone(floor(uv / vec2(0.21, 0.08)), fS) * 0.97, det2), col, det);
    hB = mix(0.5, hB, det);
    // broad weathering: blotches, per-part age
    float m1 = iFbm(P.xz * 0.21 + P.y * vec2(0.37, 0.11) + seed * 7.0);
    float m2 = iFbm(uv * 1.7 + seed * 3.0);
    col *= 0.78 + 0.34 * m1 + 0.1 * (m2 - 0.5);
    col = mix(col, col.ggg * vec3(1.15, 0.98, 0.86), 0.25 * smoothstep(0.45, 0.8, m1));   // sun-bleached
    float rough = 0.9 - 0.08 * hB;
    if (!top){
      float base = vTag.y, ttop = max(vTag.z, base + 0.5);
      float hb = P.y - base, hr = ttop - P.y, fr = clamp(hb / (ttop - base), 0.0, 1.0);
      // rising damp: a dark wavy band at the foot, salt bloom on its upper edge
      float dl = 0.35 + 0.45 * iN2(vec2(uv.x * 0.9, seed * 11.0)) + 0.2 * iN2(vec2(uv.x * 4.0, 3.0));
      float damp = 1.0 - smoothstep(dl - 0.12, dl + 0.05, hb);
      col *= 1.0 - 0.32 * damp;
      float salt = smoothstep(0.08, 0.0, abs(hb - dl)) * smoothstep(0.45, 0.75, iN2(uv * 9.0 + 2.0));
      salt += damp * smoothstep(0.62, 0.85, iFbm(uv * 5.0 + 4.0)) * 0.7;
      col = mix(col, vec3(0.62, 0.58, 0.52), clamp(salt, 0.0, 1.0) * 0.65 * det2 + clamp(salt, 0.0, 1.0) * 0.25 * (1.0 - det2));
      // splash dirt in the bottom 30 cm
      col = mix(col, vec3(0.26, 0.19, 0.13), (1.0 - smoothstep(0.0, 0.3, hb)) * 0.5);
      // rain streaks running down from the wall top
      float s = iN2(vec2(uv.x * 3.1 + seed * 5.0, uv.y * 0.18)) * 0.7 + iN2(vec2(uv.x * 11.0, uv.y * 0.6)) * 0.3;
      float st = smoothstep(0.55, 0.85, s) * (1.0 - smoothstep(0.2, 3.0, hr));
      col *= 1.0 - 0.3 * st;
      // mud plaster: survives high up, worn off lower down and in patches
      float cov = vTag.x * 1.25 - 1.15 * (1.0 - fr) + (iFbm(uv * 1.15 + seed * 5.0) - 0.5) * 1.0 + (iN2(uv * 7.0) - 0.5) * 0.12;
      float pm = smoothstep(-0.01, 0.02, cov);
      if (vTag.x > 0.0 && pm > 0.0){
        vec3 pc = vec3(0.39, 0.29, 0.20) * (0.84 + 0.3 * iFbm(uv * 3.3 + 1.0)) * (0.9 + 0.2 * seed);
        pc *= 0.94 + 0.12 * iN2(uv * 40.0);
        float cr = cracks(uv, 1.8, 0.004, w, 0.45, seed) + 0.6 * cracks(uv, 5.5, 0.0015, w, 0.35, seed + 3.0);
        pc *= 1.0 - 0.45 * cr;
        pc *= 1.0 - 0.25 * st - 0.2 * damp;
        float rim = smoothstep(0.02, 0.05, cov);           // broken edge: thin, slightly darker
        pc *= 0.8 + 0.2 * rim;
        col = mix(col, pc, pm);
        hB = mix(hB, 1.15 + 0.12 * iN2(uv * 18.0) - 0.4 * cr, pm);
        rough = mix(rough, 0.97, pm);
      }
    } else {
      // paving and wall tops: trodden smooth in the middle, dust settled
      float dust = smoothstep(0.4, 0.8, iFbm(P.xz * 0.6 + 5.0));
      col = mix(col, vec3(0.42, 0.34, 0.25), dust * 0.45);
      rough = mix(rough, 0.82, 0.3);
    }
    iAlb = col; bumpH = hB * 0.008; roughK = rough;
  }`,
  roof: /* glsl */ `
  {
    vec3 P = vRP; float w = length(fwidth(P)); float seed = vTag.w;
    vec2 uv = P.xz;
    float det = 1.0 - smoothstep(0.01, 0.05, w), det2 = 1.0 - smoothstep(0.04, 0.2, w);
    vec3 pc = mix(vec3(0.33, 0.28, 0.22), vec3(0.42, 0.33, 0.24), seed) * (0.85 + 0.3 * fract(seed * 7.0));
    pc *= 0.8 + 0.34 * iFbm(uv * 0.55 + seed * 17.0);
    pc *= 0.93 + 0.12 * iFbm(uv * 3.1 + 2.0);
    // hand-smoothing: soft swirls
    pc *= 0.97 + 0.06 * sin(dot(uv, vec2(3.1, 1.7)) * 2.0 + iN2(uv * 1.3) * 6.0) * det2;
    // worn hollows showing the coarse straw-mud under-layer
    float wear = iFbm(uv * 0.42 + seed * 31.0 + 4.0);
    float wm = smoothstep(0.66, 0.7, wear);
    vec3 under = vec3(0.27, 0.20, 0.13) * (0.8 + 0.4 * iN2(vec2(uv.x * 9.0, uv.y * 90.0)));   // straw streaks
    // drying cracks: a coarse network and a fine one
    float cr = cracks(uv, 1.4, 0.005, w, 0.5, seed) + 0.6 * cracks(uv, 4.5, 0.0018, w, 0.4, seed + 5.0);
    // water stains (rings) and dark damp patches
    float stn = iFbm(uv * 0.25 + 40.0 + seed * 3.0);
    pc *= 1.0 - 0.18 * smoothstep(0.58, 0.62, stn) * (1.0 - smoothstep(0.62, 0.7, stn));
    pc *= 1.0 - 0.14 * smoothstep(0.62, 0.8, stn);
    vec3 col = mix(pc, under, wm);
    col *= 1.0 - 0.5 * clamp(cr, 0.0, 1.0);
    iAlb = col;
    bumpH = (1.0 - 0.6 * wm - 0.8 * cr + 0.1 * iN2(uv * 25.0)) * 0.01;
    roughK = 0.97;
  }`,
  bitumen: /* glsl */ `
  {
    vec3 P = vRP, N = normalize(vRN), A = abs(N);
    float w = length(fwidth(P));
    bool top = A.y > max(A.x, A.z) + 0.05;
    vec2 uv = top ? vec2(P.x, P.z) : (A.x > A.z ? vec2(P.z, P.y) : vec2(P.x, P.y));
    float hB, mort;
    vec3 col = brickBond(uv, 4.0 + (top ? 1.0 : 0.0), w, top, hB, mort);
    float det = 1.0 - smoothstep(0.008, 0.035, w);
    col = mix(vec3(0.3, 0.2, 0.14), col, det);
    mort = mort * det;
    vec3 bit = vec3(0.035, 0.028, 0.022) * (0.8 + 0.4 * iN2(uv * 20.0));
    float seal = clamp(0.55 + 0.5 * (iFbm(uv * 1.4) - 0.5) + mort, 0.0, 1.0);   // bitumen wash, thick in the joints
    col = mix(col * 0.55, bit, seal);
    float tide = smoothstep(${'DECK_TIDE'} - 0.3, ${'DECK_TIDE'}, P.y);         // dried, dusty above the old waterline
    col = mix(col, vec3(0.2, 0.16, 0.12), tide * 0.5 * (1.0 - float(top)));
    iAlb = col; bumpH = hB * 0.006; roughK = mix(0.75, 0.22, seal) + tide * 0.3;
  }`,
  wood: /* glsl */ `
  {
    vec3 P = vRP, N = normalize(vRN), A = abs(N); float seed = vTag.w;
    float along = vTag.x > 0.5 ? P.y : (A.x > A.z ? P.z : P.x);
    float across = vTag.x > 0.5 ? (A.x > A.z ? P.z : P.x) : (A.y > 0.5 ? (A.x > A.z ? P.x : P.z) : P.y);
    if (A.y > 0.5 && vTag.x <= 0.5) across = A.x > A.z ? P.x : P.z;
    float g = iN2(vec2(along * 3.0, across * 70.0 + seed * 9.0)) * 0.6 + iN2(vec2(along * 0.8, across * 25.0)) * 0.4;
    vec3 col = mix(vec3(0.085, 0.06, 0.04), vec3(0.2, 0.15, 0.1), g) * (0.85 + 0.3 * seed);
    col = mix(col, col.ggg * 1.2, 0.3);                    // sun-greyed
    iAlb = col; bumpH = g * 0.003; roughK = 0.85;
  }`,
  pot: /* glsl */ `
  {
    vec3 P = vRP; float seed = vTag.w; float hy = (P.y - vTag.y) / max(vTag.z - vTag.y, 0.05);
    vec3 col = vec3(0.36, 0.13, 0.07) * (0.85 + 0.3 * seed);
    float band = step(0.5, fract(hy * 5.0 + seed)) * step(0.45, hy) * step(hy, 0.85);
    col = mix(col, vec3(0.03, 0.02, 0.02), band * 0.85);
    col *= 0.9 + 0.2 * iN2(P.xz * 30.0 + P.y * 10.0);
    iAlb = col; bumpH = 0.0; roughK = 0.6;
  }`,
  cloth: /* glsl */ `
  {
    vec3 P = vRP; float seed = vTag.w;
    vec3 col = seed < 0.33 ? vec3(0.62, 0.56, 0.46) : seed < 0.6 ? vec3(0.32, 0.07, 0.05) : seed < 0.85 ? vec3(0.05, 0.08, 0.2) : vec3(0.45, 0.28, 0.06);
    col *= 0.85 + 0.15 * iN2(P.xz * 6.0);
    float weave = 0.95 + 0.05 * sin(P.x * 900.0) * sin(P.z * 900.0);
    iAlb = col * weave; bumpH = 0.0; roughK = 0.95;
  }`,
};

const BUMP_GLSL = /* glsl */ `
  {
    vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
    vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
    float det = dot(sX, R1) * faceDirection;
    vec3 grad = sign(det) * (dFdx(bumpH) * R1 + dFdy(bumpH) * R2);
    vec3 nb = abs(det) * normal - grad;
    if (dot(nb, nb) > 1e-20 && abs(det) > 1e-14) normal = normalize(nb);
  }`;

function patchSurface(sh, kind, { tide = 0 } = {}) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aTag; varying vec3 vRP; varying vec3 vRN; varying vec4 vTag;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRP = position; vRN = normal; vTag = aTag;');
  const main = KIND[kind].replaceAll('DECK_TIDE', tide.toFixed(3));
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>\n${INDUS_NOISE}\n${SURF_GLSL}`)
    .replace('#include <map_fragment>', `${main}\ndiffuseColor.rgb *= iAlb;`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= roughK;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP_GLSL}`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= iAlb * 2.6;');
}

// A city part material: rises with the city (U = rise uniforms) and carries the procedural surface.
export function cityMaterial(kind, U, params = {}, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, ...params });
  m.onBeforeCompile = (sh) => { if (U) patchRise(sh, U); patchSurface(sh, kind, opts); };
  m.customProgramCacheKey = () => `indus-surf-${kind}-${U ? 'r' : 's'}-${opts.tide ?? 0}`;
  m.userData.noAntiTile = true;
  m.defaultAttributeValues = { ...(m.defaultAttributeValues ?? {}), aTag: [0, 0, 0, 0.5] };
  return m;
}
