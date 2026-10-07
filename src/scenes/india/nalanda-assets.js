// Assets for THE FIRST UNIVERSITIES (nalanda.js): the procedural brick material that lets the excavated
// ruins of Nalanda rebuild course by course (a GPU build front, pure function of a few uniforms), the
// lawn / packed-earth ground that turns into the map as the camera climbs, the dusk sky, the stylised
// monk figures, and the schematic map of Asia (coastlines as lon / lat polylines, projected about Nalanda).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BL = 0.5, BH = 0.16;                 // stylised brick: length, course height (m)
export const DEG = 111000;                         // metres per map unit (one degree of latitude)
export const LON0 = 85.44, LAT0 = 25.13;           // Nalanda Mahavihara, Bihar
export const COS0 = Math.cos(LAT0 * Math.PI / 180);
// map units (x east, z south, both in degrees of latitude) — the map group is scaled by DEG to metres
export const proj = (lon, lat, y = 0) => new THREE.Vector3((lon - LON0) * COS0, y, -(lat - LAT0));

// ------------------------------------------------------------------------------------------------ brick
// Every brick is its own: the pattern is computed from the world position (no texture, no period), with
// jittered head joints, a tone from a clay palette, mottling, chipped arrises, a few missing or over-fired
// bricks, raked and dirty joints, damp and moss at the foot, rain streaks, lime-plaster remnants, and a
// screen-space bump (bricks proud of the mortar). Floors are laid in herringbone with worn paths and dust.
const BRICK_GLSL = /* glsl */ `
#define BL ${BL.toFixed(3)}
#define BH ${BH.toFixed(3)}
varying vec3 vBW; varying vec3 vBN;
uniform float uRise, uDelayK, uRuinLo, uRuinHi, uHot, uJag, uSlice, uAge, uPlaster;
uniform vec2 uCentre;
uniform vec3 uTint;
float bh3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float bn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = bh3(vec3(i, 7.0)), b = bh3(vec3(i + vec2(1.0, 0.0), 7.0)), c = bh3(vec3(i + vec2(0.0, 1.0), 7.0)), d = bh3(vec3(i + vec2(1.0), 7.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
float bfbm(vec2 p){ return bn2(p) * 0.5 + bn2(p * 2.03 + 5.2) * 0.3 + bn2(p * 4.1 + 1.7) * 0.2; }
// brick cell of a point on a wall face: (index along the wall, course, wall key, along coordinate in bricks)
vec4 bCell(vec3 w, vec3 n){
  bool zx = abs(n.x) > abs(n.z);
  float along = zx ? w.z : w.x, other = zx ? w.x : w.z;
  float course = floor(w.y / BH);
  float s = along / BL + mod(course, 2.0) * 0.5;
  return vec4(floor(s), course, floor(other / 2.5), s);
}
// head joints are not on a grid: each joint is shifted by up to ±0.11 brick
float bJ(float i, vec4 c){ return (bh3(vec3(i, c.y, c.z) + 4.1) - 0.5) * 0.22; }
// the brick index with jittered joints; jl / jr: joint offsets left / right
float bIdx(vec4 c, out float jl, out float jr){
  float i = c.x, f = c.w - i;
  jl = bJ(i, c); jr = bJ(i + 1.0, c);
  if (f < jl) { i -= 1.0; jr = jl; jl = bJ(i, c); }
  else if (f > 1.0 + jr) { i += 1.0; jl = jr; jr = bJ(i + 1.0, c); }
  return i;
}
float bRuin(vec2 xz){ float n = bn2(xz * 0.11) * 0.58 + bn2(xz * 0.37 + 3.1) * 0.32 + bn2(xz * 0.8 + 7.7) * 0.1; return mix(uRuinLo, uRuinHi, smoothstep(0.25, 0.8, n)) + (bn2(xz * 2.3 + 1.3) - 0.5) * 0.5; }
// 1 where a brick stands: below the broken ruin line, or below the build front (which lags with distance
// from the centre of the campus); hot = freshly laid
float bVisible(vec3 w, vec3 n, out float hot){
  vec4 c = bCell(w - n * 0.02, n);
  float jl, jr; c.x = bIdx(c, jl, jr);
  float r = bh3(vec3(floor(c.x / 3.0), floor(c.y / 2.0), c.z) + 0.37) * 0.72 + bh3(c.xyz + 0.37) * 0.28;
  float base = c.y * BH;
  float ruin = bRuin(w.xz);
  float front = uRise - uDelayK * length(w.xz - uCentre);
  float tR = base + r * BH * uJag, tB = base + r * BH * 1.6;
  hot = tR < ruin ? 0.0 : 1.0 - smoothstep(0.0, BH * 2.0, front - tB);
  return (tR < ruin || tB < front) && w.y > uSlice ? 1.0 : 0.0;
}
// herringbone of 2:1 bricks (p in brick widths): lattice (1,1), (2,-2); each cell holds one H and one V brick
void herring(vec2 p, out vec3 id, out float e, out vec2 lc){
  float s = floor((p.x + p.y) * 0.5), t = floor((p.x - p.y) * 0.25);
  vec2 O = vec2(s + 2.0 * t, s - 2.0 * t);
  e = 0.0; id = vec3(0.0); lc = vec2(0.0);
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    vec2 o = O + float(i) * vec2(1.0, 1.0) + float(j) * vec2(2.0, -2.0);
    vec2 q = p - o;
    if (q.x >= 0.0 && q.x < 2.0 && q.y >= 0.0 && q.y < 1.0) { e = min(min(q.x, 2.0 - q.x), min(q.y, 1.0 - q.y)); id = vec3(o, 0.0); lc = q; }
    vec2 r = q - vec2(2.0, -1.0);
    if (r.x >= 0.0 && r.x < 1.0 && r.y >= 0.0 && r.y < 2.0) { e = min(min(r.x, 1.0 - r.x), min(r.y, 2.0 - r.y)); id = vec3(o, 1.0); lc = r.yx; }
  }
}
float bSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// worn paths (1) and dust (y) on the courtyard floors and the avenue
vec2 bWear(vec2 p){
  float cv = 55.0 * floor(p.x / 55.0 + 0.5);
  vec2 q = vec2(p.x - cv, p.y);
  float d = 1e3, dust = 0.0;
  if (abs(q.x) < 12.2 && abs(q.y) < 12.2) {
    float m = max(abs(q.x), abs(q.y));
    d = abs(m - 10.9);
    d = min(d, bSeg(q, vec2(0.0, 12.0), vec2(0.0, -10.5)));
    d = min(d, bSeg(q, vec2(-11.0, 0.0), vec2(4.8, 0.0)));
    d = min(d, bSeg(q, vec2(0.0, 6.5), vec2(-5.4, 6.5)));
    d = min(d, bSeg(q, vec2(-10.0, -10.0), vec2(-3.6, -6.6)));
    d = min(d, bSeg(q, vec2(10.0, -10.0), vec2(4.6, -7.6)));
    dust = 1.0 - smoothstep(0.0, 1.6, 11.9 - m);
    dust = max(dust, (1.0 - smoothstep(0.0, 0.9, abs(q.x - 8.1) - 2.5)) * (1.0 - smoothstep(0.0, 0.9, abs(q.y) - 2.6)) * 0.6);
  } else if (p.y < -27.5 && p.y > -44.5) { d = max(abs(p.y + 36.0) - 2.6, 0.0); dust = 1.0 - smoothstep(0.0, 2.5, min(p.y + 44.0, -28.0 - p.y)); }
  float n = bn2(p * 0.9) * 0.6 + bn2(p * 3.7) * 0.4;
  float worn = 1.0 - smoothstep(0.5, 1.7, d + (n - 0.5) * 1.1);
  dust = max(dust * (0.6 + 0.6 * n), smoothstep(0.62, 0.85, bfbm(p * 0.35 + 4.0)) * 0.7) * (1.0 - worn * 0.8);
  return vec2(worn, dust);
}
vec3 bClay(float r){
  vec3 a = vec3(0.34, 0.095, 0.045), b = vec3(0.43, 0.16, 0.075), c = vec3(0.25, 0.065, 0.04), d = vec3(0.45, 0.24, 0.12);
  return r < 0.4 ? mix(a, b, r / 0.4) : r < 0.75 ? mix(b, c, (r - 0.4) / 0.35) : mix(c, d, (r - 0.75) / 0.25);
}`;

const BRICK_VERT = (src) => src
  .replace('#include <common>', `#include <common>\nvarying vec3 vBW; varying vec3 vBN;`)
  .replace('#include <project_vertex>', `#include <project_vertex>
    vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vBN = normalize(mat3(modelMatrix) * normal);`);

const BRICK_FRAG = /* glsl */ `
        float bMortar = 0.0, bHgt = 0.0, bRough = 0.9, bDet = 1.0;
        {
          vec3 N = normalize(vBN);
          vec3 w = vBW - N * 0.02;
          bool zx = abs(N.x) > abs(N.z);
          float fpx = length(fwidth(vBW));
          bool floorP = N.y > 0.7 && vBW.y < 0.4, topP = N.y > 0.7 && !floorP;
          vec3 id; float eM, mw; vec2 fc;
          if (floorP) {
            float e; vec2 lc; herring(w.xz / 0.2, id, e, lc);
            id.z += 91.0; eM = e * 0.2; mw = 0.009; fc = w.xz;
          } else if (topP) {
            float row = floor(w.z / (BH * 1.6)); float s = w.x / BL + mod(row, 2.0) * 0.5, v = w.z / (BH * 1.6) - row;
            id = vec3(floor(s), row, 57.0); float us = fract(s);
            eM = min(min(us, 1.0 - us) * BL, min(v, 1.0 - v) * BH * 1.6); mw = 0.008; fc = w.xz;
          } else {
            vec4 c = bCell(w, N);
            float jl, jr, i = bIdx(c, jl, jr);
            float v = w.y / BH - c.y;
            id = vec3(i, c.y, c.z);
            eM = min(min(c.w - i - jl, i + 1.0 + jr - c.w) * BL, min(v, 1.0 - v) * BH);
            mw = mix(0.008, 0.016, bh3(id + 2.3));
            fc = vec2(zx ? w.z : w.x, w.y);
          }
          float r = bh3(id + 1.7), r2 = bh3(id + 9.1), r3 = bh3(id + 3.3), r4 = bh3(id + 7.7);
          bDet = 1.0 - smoothstep(floorP ? 0.05 : 0.03, floorP ? 0.15 : 0.1, fpx);
          // chipped arrises, more on the old ruins
          float chip = smoothstep(0.5, 0.95, bn2(fc * 16.0 + id.xy * 1.7)) * mix(0.008, 0.026, uAge);
          float e = eM - chip;
          float aa = fpx * 0.8 + 0.001;
          float brickM = smoothstep(mw - aa, mw + aa, e);
          float miss = (!floorP && !topP) ? step(1.0 - 0.03 * uAge - 0.003, r4) : 0.0;
          // colour: palette tone, mottling, over-fired dark bricks, lighter worn arrises
          vec3 bc = bClay(floorP ? r * 0.6 : r) * (floorP ? mix(0.78, 1.18, r2) : mix(0.88, 1.08, r2));
          float burnt = step(floorP ? 0.975 : 0.95, r3);
          bc = mix(bc, vec3(0.13, 0.05, 0.04), burnt * 0.8);
          bc *= 0.9 + 0.18 * bn2(fc * 9.0 + id.xy * 3.1);
          bc = mix(bc, bc * 1.25 + 0.015, (1.0 - smoothstep(mw, mw + 0.03, e)) * 0.45);
          float dirt = bn2(fc * 2.1 + 9.0) * 0.6 + (1.0 - smoothstep(0.0, 1.2, vBW.y)) * 0.6;
          vec3 mc = mix(vec3(0.34, 0.29, 0.22), vec3(0.15, 0.12, 0.09), clamp(dirt, 0.0, 1.0));
          mc = mix(mc, vec3(0.06, 0.075, 0.03), uAge * smoothstep(0.5, 0.8, bn2(fc * 1.7 + 3.0)) * (1.0 - smoothstep(0.2, 1.4, vBW.y)) * 0.8);   // weeds in the low joints
          vec3 col = mix(mc, bc, brickM);
          col = mix(col, vec3(0.06, 0.025, 0.015), miss * 0.85);
          vec3 avg = mix(bClay(0.5) * 0.97, mc, 0.13);
          col = mix(avg * (0.85 + 0.3 * r2), col, bDet);
          // height (m): brick faces proud of the joints, surface grain, a tilt per brick, missing bricks recessed
          float hb = smoothstep(mw - 0.002, mw + 0.012, e) * 0.012 + (bn2(fc * 34.0) - 0.5) * 0.0025 + (r2 - 0.5) * 0.004 * smoothstep(mw, mw + 0.04, e);
          hb -= miss * 0.05 * smoothstep(mw, mw + 0.02, e);
          bRough = mix(0.97, mix(0.8, 0.92, r), brickM);
          bRough = mix(bRough, 0.55, burnt * brickM);
          bMortar = 1.0 - brickM * bDet;
          // macro variation in world space
          float bl = bn2(vBW.xz * 0.55 + vBW.y * 0.3) * 0.55 + bn2(vBW.xz * 2.7 - vBW.y * 1.3) * 0.45;
          col *= mix(0.8, 1.1, bl);
          if (!floorP && !topP) {
            // rain streaks, a damp foot, moss, salt bloom on the old walls
            float st = bn2(vec2(fc.x * 4.0, fc.y * 0.25 + 3.0)) * 0.7 + bn2(vec2(fc.x * 13.0, fc.y * 0.6)) * 0.3;
            col *= 1.0 - smoothstep(0.55, 0.85, st) * mix(0.12, 0.3, uAge);
            col *= mix(0.62, 1.0, smoothstep(0.0, 0.8 + 0.4 * bl, vBW.y));
            float moss = (1.0 - smoothstep(0.0, 0.7 + bfbm(fc * 1.3) * 0.9, vBW.y)) * smoothstep(0.4, 0.7, bfbm(fc * 2.2 + 7.0)) * uAge;
            col = mix(col, vec3(0.045, 0.06, 0.022), moss * 0.75);
            float salt = (1.0 - smoothstep(0.1, 0.6, abs(vBW.y - 0.45 - bl * 0.3))) * smoothstep(0.55, 0.8, bn2(fc * 3.0)) * uAge;
            col = mix(col, vec3(0.36, 0.33, 0.29), salt * 0.35);
            // lime plaster: remnant patches with crumbly edges, standing proud of the brick
            float pm = bfbm(fc * 0.7 + id.z * 3.7) + (bn2(fc * 11.0) - 0.5) * 0.12;
            float pth = 1.0 - uPlaster;
            float pk = smoothstep(pth, pth + 0.015, pm) * step(0.25, vBW.y);
            vec3 pc = vec3(0.56, 0.5, 0.41) * (0.8 + 0.3 * bn2(fc * 5.0)) * mix(1.0, 0.7, smoothstep(0.3, 0.9, st));
            col = mix(col, pc, pk);
            hb = mix(hb, 0.02 + (bn2(fc * 20.0) - 0.5) * 0.004, pk);
            bRough = mix(bRough, 0.93, pk);
            bMortar *= 1.0 - pk;
          } else if (topP && vBW.y > 4.0) {
            // terrace roofs and copings: lime concrete, patched and stained, brick showing where it has worn
            float pm = bfbm(vBW.xz * 0.45 + 2.0) + (bn2(vBW.xz * 9.0) - 0.5) * 0.15;
            float pk = smoothstep(0.27, 0.31, pm);
            vec3 pc = vec3(0.5, 0.43, 0.34) * (0.75 + 0.35 * bfbm(vBW.xz * 2.5)) * mix(1.0, 0.65, smoothstep(0.55, 0.8, bn2(vBW.xz * 0.7 + 5.0)));
            vec2 cw = vBW.xz + (vec2(bn2(vBW.xz * 3.1), bn2(vBW.xz * 3.1 + 7.0)) - 0.5) * 0.25;
            float cr = 1.0 - smoothstep(0.0, 0.018, abs(bn2(cw * 0.9 + 11.0) - 0.5));
            float cr2 = 1.0 - smoothstep(0.0, 0.012, abs(bn2(cw * 2.7 + 3.0) - 0.5));
            float cracks = max(cr * smoothstep(0.5, 0.7, bn2(vBW.xz * 0.3)), cr2 * smoothstep(0.55, 0.75, bn2(vBW.xz * 0.5 + 2.0))) * bDet;
            pc *= 1.0 - cracks * 0.35;
            pc = mix(pc, vec3(0.2, 0.17, 0.12), smoothstep(0.6, 0.85, bfbm(vBW.xz * 0.25 + 9.0)) * 0.5);    // damp, lichen-dark ponding
            col = mix(col, pc, pk);
            hb = mix(hb, 0.02 + (bn2(vBW.xz * 18.0) - 0.5) * 0.004 - cracks * 0.006, pk);
            bRough = mix(bRough, 0.9, pk);
            bMortar *= 1.0 - pk;
          } else if (floorP) {
            vec2 wd = bWear(vBW.xz);
            col = mix(col, col * 1.15 + 0.012, wd.x * 0.6);
            hb *= 1.0 - wd.x * 0.7;
            bRough = mix(bRough, 0.68, wd.x * brickM);
            vec3 dc = vec3(0.33, 0.25, 0.17) * (0.8 + 0.4 * bn2(vBW.xz * 6.0));
            float dk = clamp(wd.y + (1.0 - brickM) * 0.5 * (1.0 - wd.x), 0.0, 1.0);
            col = mix(col, dc, dk * 0.75);
            hb *= 1.0 - wd.y * 0.6;
            col = mix(col, vec3(0.05, 0.07, 0.02), uAge * smoothstep(0.55, 0.85, bfbm(vBW.xz * 0.8)) * 0.7);   // grass over the old floors
            col *= mix(0.65, 1.0, smoothstep(0.0, 1.2, 11.9 - max(abs(vBW.x - 55.0 * floor(vBW.x / 55.0 + 0.5)), abs(vBW.z))) * 0.5 + 0.5);
          }
          if (!gl_FrontFacing) {   // the broken wall tops: crumbled brick, earth and grass
            float g = bfbm(vBW.xz * 1.6);
            col = mix(vec3(0.22, 0.07, 0.035), vec3(0.36, 0.13, 0.065), bl) * (0.8 + 0.3 * bn2(vBW.xz * 9.0));
            col = mix(col, vec3(0.06, 0.08, 0.025), smoothstep(0.5, 0.75, g) * uAge * 0.9);
            hb = (bn2(vBW.xz * 12.0) + bn2(vBW.xz * 30.0) * 0.5) * 0.02;
            bRough = 0.97; bMortar = 1.0;
          }
          bHgt = hb * bDet;
          diffuseColor.rgb = col * uTint;
        }`;

const BRICK_BUMP = /* glsl */ `
        {
          vec3 bp = -vViewPosition;
          vec3 dpx = dFdx(bp), dpy = dFdy(bp);
          float hx = dFdx(bHgt), hy = dFdy(bHgt);
          vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx);
          float det = dot(dpx, R1);
          vec3 grad = sign(det) * (hx * R1 + hy * R2);
          vec3 nb = abs(det) * normal - grad;
          if (abs(det) > 1e-14 && dot(nb, nb) > 1e-20 && dot(nb, nb) < 1e20) normal = normalize(nb);
        }`;

// U: shared uniforms (uRise, uDelayK, uCentre, uHot, uAge); per material: ruin heights, jaggedness, tint, plaster.
export function brickMaterial(U, { ruinLo = 0.5, ruinHi = 2.0, jag = 4, tint = [1, 1, 1], slice = false, plaster = 0.12 } = {}) {
  const u = { ...U, uAge: U.uAge ?? { value: 1 }, uRuinLo: { value: ruinLo }, uRuinHi: { value: ruinHi }, uJag: { value: jag }, uTint: { value: new THREE.Vector3(...tint) }, uSlice: { value: -100 }, uPlaster: { value: plaster } };
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.userData.u = u;
  m.userData.noDetail = true;
  m.userData.noAntiTile = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = BRICK_VERT(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${BRICK_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bHot;
        if (bVisible(vBW, normalize(vBN), bHot) < 0.5) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${BRICK_FRAG}`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (!gl_FrontFacing) normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BRICK_BUMP}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = bRough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * uHot * bHot * 2.0;
        totalEmissiveRadiance += vec3(1.0, 0.7, 0.35) * 1.2 * (1.0 - smoothstep(0.0, 0.08, vBW.y - uSlice)) * step(-50.0, uSlice);`);
  };
  m.customProgramCacheKey = () => 'nalanda-brick-v2';
  // shadows: the same discard, so the ruins cast ruin-shaped shadows
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = BRICK_VERT(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${BRICK_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bHot;
        if (bVisible(vBW, normalize(vBN), bHot) < 0.5) discard;`);
  };
  d.customProgramCacheKey = () => 'nalanda-brick-depth-v2';
  m.userData.depth = d;
  return m;
}

// ----------------------------------------------------------------------------------- map land shading
// shared by the campus ground (blended in as the camera climbs) and the map's land polygons
export const MAP_GLSL = /* glsl */ `
float mh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1.0, 0.0)), f.x), mix(mh(i + vec2(0.0, 1.0)), mh(i + vec2(1.0)), f.x), f.y); }
// p: map units (x east, y = z south)
vec3 mapLand(vec2 p){
  float f = 0.0, a = 0.5, fr = 1.2;
  for (int i = 0; i < 8; i++) { f += a * mn(p * fr + float(i) * 7.13); fr *= 2.3; a *= 0.62; }
  vec3 c = vec3(0.037, 0.026, 0.016) * (0.86 + 0.28 * f);
  return c;
}
float graticule(vec2 p){
  vec2 ll = vec2(p.x / ${COS0.toFixed(6)} + ${LON0.toFixed(3)}, ${LAT0.toFixed(3)} - p.y) / 10.0;
  vec2 g = abs(fract(ll + 0.5) - 0.5) / max(fwidth(ll), vec2(1e-6));
  return 1.0 - smoothstep(0.0, 1.2, min(g.x, g.y));
}`;

export function groundMaterial(G) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.97 });
  m.userData.noDetail = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, G);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vGW; uniform float uEarth, uMapMix, uMapK;\n${MAP_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 g = vGW.xz;
          float n1 = mn(g * 0.045), n2 = mn(g * 0.33 + 5.0), n3 = mn(g * 2.6 + 9.0), n4 = mn(g * 11.0);
          // the kept lawns round the excavations: sunlit yellow-greens and deeper blue-green drifts
          vec3 lawn = mix(vec3(0.075, 0.165, 0.035), vec3(0.15, 0.25, 0.05), n1 * 0.6 + n2 * 0.4);
          lawn = mix(lawn, vec3(0.05, 0.13, 0.05), smoothstep(0.55, 0.85, n2) * 0.5);
          vec3 earth = mix(vec3(0.16, 0.085, 0.045), vec3(0.24, 0.14, 0.075), n2);
          float bare = smoothstep(0.62, 0.78, n1 * 0.45 + n2 * 0.35 + n3 * 0.2);
          // the living campus: grass courts worn to packed earth along the walks
          vec3 col = mix(lawn, earth, max(bare, uEarth * smoothstep(0.3, 0.6, n2 * 0.7 + n3 * 0.3)));
          col *= 0.82 + 0.3 * n3 + 0.12 * n4;
          // close up: blades and clover in the lawn, dry straw, little bare scuffs (fades out with distance)
          float gd = 1.0 - smoothstep(0.02, 0.12, length(fwidth(vGW)));
          float n5 = mn(g * 37.0), n6 = mn(g * 111.0 + 3.0), n7 = mn(g * 7.3 + 1.0);
          vec3 fine = mix(vec3(0.75, 0.85, 0.6), vec3(1.25, 1.12, 0.75), smoothstep(0.55, 0.8, n6)) * (0.8 + 0.4 * n5);
          fine = mix(fine, vec3(1.6, 1.15, 0.8), smoothstep(0.78, 0.9, n7) * 0.5);
          col *= mix(vec3(1.0), fine, gd * (1.0 - uEarth));
          diffuseColor.rgb = col;
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uMapMix > 0.001) gl_FragColor.rgb = mix(gl_FragColor.rgb, mapLand(vGW.xz / ${DEG.toFixed(1)}) * uMapK, uMapMix);`);
  };
  m.customProgramCacheKey = () => 'nalanda-ground-v2';
  return m;
}

// ------------------------------------------------------------------------------------------------- sky
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 0.3, 1) }, uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uK: { value: 1 }, uStars: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun, uHor, uZen, uSunCol; uniform float uK, uStars; varying vec3 vD;
      float sh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vD); float h = d.y;
        vec3 c = mix(uHor, uZen, smoothstep(-0.02, 0.5, h));
        vec2 a = normalize(d.xz + 1e-5), s = normalize(uSun.xz + 1e-5);
        float az = max(dot(a, s), 0.0), sd = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * pow(az, 4.0) * (1.0 - smoothstep(-0.05, 0.35, h)) * 0.9;
        c += uSunCol * (pow(sd, 1200.0) * 40.0 + pow(sd, 40.0) * 0.8);
        vec3 q = floor(d * 380.0);
        float st = step(0.9975, sh(q)) * smoothstep(0.05, 0.3, h);
        c += vec3(0.8, 0.85, 1.0) * st * uStars * (0.4 + 0.6 * sh(q + 3.0));
        if (h < 0.0) c = mix(c, uHor * 0.7, smoothstep(0.0, -0.1, h));
        gl_FragColor = vec4(c * uK, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
}

// ------------------------------------------------------------------------------------------- figures
// Stylised monks: a robe of revolution (one shoulder bare is suggested by a sash band) and a shaven head.
function lathe(points, seg = 12) { const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), seg); g.computeVertexNormals(); return g; }
export function monkGeometries(lite = false) {
  const sg = lite ? 7 : 12, hs = lite ? [6, 4] : [10, 8];
  const standRobe = lathe([[0, 0], [0.2, 0], [0.22, 0.06], [0.2, 0.5], [0.19, 0.95], [0.2, 1.22], [0.21, 1.34], [0.17, 1.44], [0.07, 1.5], [0, 1.5]], sg);
  const standHead = new THREE.SphereGeometry(0.105, ...hs); standHead.translate(0, 1.6, 0);
  const seatRobe = lathe([[0, 0], [0.4, 0], [0.42, 0.06], [0.4, 0.16], [0.22, 0.22], [0.17, 0.3], [0.16, 0.5], [0.19, 0.66], [0.17, 0.74], [0.07, 0.8], [0, 0.8]], sg);
  const seatHead = new THREE.SphereGeometry(0.105, ...hs); seatHead.translate(0, 0.9, 0);
  return { standRobe, standHead, seatRobe, seatHead };
}

// ---------------------------------------------------------------------------------------------- map
// Schematic coastlines (lon, lat). Rough by design: a few hundred points for the whole of Asia.
// Mainland: from the Gulf of Aqaba round Arabia, Persia, India, Southeast Asia, China and Korea to the
// Sea of Okhotsk. CLOSE adds the inland edge that closes the fill polygon (not drawn as coast).
const MAINLAND = [[35.0, 29.4], [35.7, 27.5], [37.5, 24.5], [39.1, 21.7], [40.5, 19.5], [41.5, 17.5], [42.7, 15.6], [43.3, 13.0], [44.5, 12.7], [45.0, 12.8],
  [48.5, 14.0], [51.5, 15.3], [52.2, 15.7], [55.2, 17.5], [56.8, 18.5], [57.8, 19.7], [58.6, 20.5], [59.8, 22.4], [58.6, 23.6], [56.7, 24.4], [56.3, 26.3],
  [55.5, 25.5], [54.4, 24.3], [52.5, 24.2], [51.6, 24.4], [51.6, 25.3], [51.2, 26.1], [50.5, 25.0], [50.0, 26.5], [49.0, 27.6], [48.4, 28.5], [48.0, 29.9],
  [49.5, 30.0], [50.5, 29.3], [51.4, 27.9], [52.6, 27.4], [54.8, 26.5], [56.3, 27.1], [57.3, 25.9], [59.0, 25.4], [61.6, 25.2], [64.5, 25.2], [66.6, 25.4],
  [67.3, 24.8], [67.6, 23.8], [68.6, 23.2], [70.1, 22.9], [69.1, 22.4], [69.0, 22.0], [70.0, 21.0], [70.9, 20.7], [72.1, 21.2], [72.6, 21.9], [72.9, 21.0],
  [72.8, 19.0], [73.1, 17.6], [73.5, 16.0], [74.1, 14.8], [74.7, 13.2], [75.2, 12.0], [75.8, 11.0], [76.3, 9.6], [77.0, 8.3], [77.6, 8.1], [78.2, 8.9],
  [79.0, 9.3], [79.3, 10.3], [79.85, 10.3], [79.9, 11.8], [80.3, 13.4], [80.1, 15.4], [80.9, 15.8], [82.3, 16.6], [83.4, 17.7], [84.8, 19.2], [86.4, 20.0],
  [87.0, 21.0], [86.9, 21.6], [88.2, 21.6], [89.1, 21.7], [90.3, 21.9], [91.2, 22.5], [91.8, 22.3], [92.0, 21.2], [92.3, 20.7], [93.0, 19.8], [94.0, 18.8],
  [94.4, 17.6], [94.3, 16.1], [95.3, 15.8], [96.3, 16.4], [97.6, 16.6], [97.8, 15.0], [98.2, 13.5], [98.6, 11.8], [98.5, 10.0], [98.3, 8.4], [98.8, 7.9],
  [99.7, 6.4], [100.3, 5.4], [100.4, 4.0], [101.3, 2.8], [102.6, 1.9], [103.5, 1.3], [104.2, 1.4], [103.5, 2.8], [103.4, 4.3], [103.0, 5.6], [102.2, 6.2],
  [101.2, 6.9], [100.4, 7.3], [99.9, 8.3], [99.3, 9.3], [99.2, 10.6], [99.6, 11.8], [100.0, 12.8], [100.6, 13.5], [101.3, 12.7], [102.4, 12.2], [102.9, 11.6],
  [103.6, 10.5], [104.4, 10.4], [104.9, 9.2], [104.8, 8.6], [105.3, 8.8], [106.6, 9.6], [107.0, 10.4], [108.0, 10.7], [109.0, 11.3], [109.2, 12.6], [109.3, 13.8],
  [108.9, 15.2], [108.2, 16.1], [107.1, 17.1], [106.3, 18.3], [105.7, 19.0], [106.0, 20.0], [106.8, 20.7], [107.9, 21.5], [108.8, 21.6], [109.7, 21.5],
  [109.9, 20.4], [110.4, 20.3], [110.6, 21.2], [111.6, 21.6], [113.0, 22.2], [114.2, 22.3], [115.5, 22.7], [116.6, 23.2], [117.8, 24.1], [118.6, 24.6],
  [119.5, 25.5], [119.6, 26.6], [120.2, 27.3], [120.8, 28.1], [121.6, 29.0], [121.9, 29.9], [121.3, 30.6], [121.9, 31.0], [121.4, 31.8], [120.9, 32.6],
  [120.4, 33.8], [119.3, 34.8], [119.4, 35.5], [120.3, 36.1], [120.9, 36.4], [122.5, 36.9], [122.1, 37.5], [121.0, 37.6], [120.3, 37.6], [119.2, 37.2],
  [118.9, 37.9], [117.8, 38.6], [117.6, 39.1], [118.5, 39.2], [119.5, 39.8], [120.5, 40.3], [121.3, 40.9], [122.3, 40.5], [121.6, 39.4], [121.3, 38.8],
  [122.2, 39.2], [123.4, 39.7], [124.4, 40.0], [125.0, 39.6], [125.4, 39.4], [125.2, 38.4], [125.0, 37.9], [125.7, 37.7], [126.6, 37.1], [126.5, 36.1],
  [126.6, 35.1], [126.3, 34.5], [127.4, 34.7], [128.5, 34.9], [129.2, 35.2], [129.5, 35.9], [129.4, 36.8], [129.1, 37.7], [128.6, 38.4], [128.1, 38.9],
  [127.5, 39.6], [128.4, 40.0], [129.7, 40.8], [129.8, 41.7], [130.7, 42.3], [131.4, 42.8], [132.4, 43.2], [133.9, 42.8], [135.5, 43.9], [137.2, 45.4],
  [138.6, 47.0], [140.2, 48.5], [140.6, 50.0], [141.3, 52.2], [141.5, 53.5], [140.5, 56.0], [138.0, 58.0]];
const MAINLAND_CLOSE = [[138.0, 75.0], [10.0, 75.0], [10.0, 34.0], [34.2, 31.3]];
const CASPIAN = [[49.0, 46.5], [51.5, 47.0], [53.0, 45.3], [51.3, 44.5], [52.7, 42.0], [53.0, 40.5], [54.0, 38.0], [53.9, 36.9], [51.8, 36.6], [50.0, 37.4],
  [49.0, 38.5], [49.5, 40.3], [48.0, 41.8], [47.5, 43.5], [47.0, 44.6], [48.0, 46.0]];
const AFRICA = [[34.9, 29.5], [34.2, 27.8], [32.6, 29.9], [33.5, 27.0], [35.5, 24.0], [36.9, 22.0], [37.4, 19.0], [38.6, 17.9], [39.7, 15.3], [41.2, 14.2],
  [42.4, 13.0], [43.3, 11.8], [44.3, 10.4], [45.8, 10.8], [47.6, 11.2], [49.0, 11.3], [51.2, 11.8], [51.1, 10.4], [50.4, 8.5], [49.4, 6.5], [47.9, 4.3],
  [46.0, 2.2], [43.5, -0.5], [41.6, -1.8], [40.1, -3.3], [39.2, -5.5], [39.4, -7.5], [39.7, -10.0], [40.5, -14.0], [40.6, -20.0]];
const AFRICA_CLOSE = [[10.0, -20.0], [10.0, 31.0], [32.3, 31.3]];
const ISLANDS = [
  [[79.9, 9.7], [80.4, 9.8], [81.2, 8.6], [81.9, 7.4], [81.6, 6.4], [80.6, 5.9], [80.0, 6.4], [79.8, 7.6], [79.7, 8.7]],                               // Sri Lanka
  [[95.3, 5.6], [96.3, 5.2], [97.5, 5.2], [98.5, 4.0], [100.4, 2.3], [101.4, 2.0], [103.4, 0.6], [103.8, -1.0], [104.8, -2.2], [106.0, -3.2], [105.9, -5.8],
    [104.6, -5.9], [103.4, -4.9], [102.3, -4.0], [101.0, -2.5], [100.3, -1.0], [99.2, 0.3], [98.6, 1.8], [97.6, 2.9], [96.4, 3.9], [95.4, 4.9]],           // Sumatra
  [[105.2, -6.8], [106.0, -5.9], [107.2, -6.0], [108.3, -6.3], [110.4, -6.9], [111.5, -6.6], [112.6, -6.9], [113.8, -7.5], [114.6, -7.8], [114.4, -8.7],
    [112.6, -8.4], [110.2, -8.1], [108.3, -7.8], [106.4, -7.4], [105.6, -6.9]],                                                                             // Java
  [[115.2, -8.1], [115.7, -8.4], [115.2, -8.8], [114.6, -8.4]],                                                                                            // Bali
  [[116.0, -8.4], [119.0, -8.2], [122.5, -8.2], [123.0, -8.4], [121.0, -8.9], [118.0, -9.0], [116.1, -8.9]],                                              // Lombok – Flores
  [[123.6, -10.3], [125.1, -9.1], [127.3, -8.4], [126.8, -8.9], [124.3, -10.2]],                                                                           // Timor
  [[109.0, 1.6], [109.6, 2.0], [111.1, 1.8], [111.8, 2.8], [113.1, 3.2], [114.6, 4.6], [115.4, 5.2], [116.1, 6.0], [117.0, 7.0], [117.7, 6.4], [119.2, 5.3],
    [118.2, 4.4], [117.8, 3.0], [118.0, 1.9], [118.9, 0.9], [117.9, 0.7], [117.5, -0.6], [116.6, -1.5], [116.2, -3.4], [114.6, -3.8], [113.1, -3.2],
    [111.8, -3.4], [110.2, -2.9], [110.0, -1.4], [109.1, -0.3]],                                                                                            // Borneo
  [[119.5, -5.5], [119.4, -3.5], [118.8, -2.6], [119.6, -0.5], [120.2, 0.6], [121.5, 1.1], [123.0, 1.0], [124.9, 1.6], [124.4, 0.5], [123.0, 0.5],
    [121.4, 0.5], [120.9, -0.3], [121.6, -0.9], [123.4, -0.9], [122.0, -2.0], [122.4, -3.5], [123.0, -4.6], [121.5, -4.7], [121.0, -3.0], [120.6, -5.4]],     // Sulawesi
  [[120.6, 18.5], [122.2, 18.5], [122.0, 17.0], [121.6, 15.8], [121.9, 14.2], [124.0, 13.0], [123.9, 12.6], [122.5, 13.6], [121.0, 13.7], [120.6, 14.5],
    [119.9, 15.5], [120.4, 17.5]],                                                                                                                          // Luzon
  [[121.9, 6.9], [122.5, 8.2], [124.0, 8.3], [125.5, 9.6], [126.5, 8.0], [126.2, 6.3], [125.4, 5.6], [124.2, 6.4], [123.2, 7.5]],                          // Mindanao
  [[120.1, 23.0], [120.7, 22.0], [121.0, 22.6], [121.9, 24.8], [121.5, 25.3], [120.7, 24.5]],                                                              // Taiwan
  [[108.6, 19.2], [109.6, 20.0], [110.6, 20.1], [111.0, 19.6], [110.4, 18.6], [109.5, 18.2], [108.7, 18.5]],                                               // Hainan
  [[129.7, 33.2], [130.2, 31.3], [131.3, 31.4], [132.0, 33.0], [133.0, 32.8], [134.7, 33.8], [135.4, 33.5], [136.9, 34.3], [138.2, 34.6], [139.2, 34.9],
    [140.0, 35.0], [140.9, 35.7], [140.6, 36.9], [141.0, 38.3], [141.9, 39.5], [141.4, 41.4], [140.0, 41.3], [140.0, 40.0], [139.7, 39.0], [138.8, 37.8],
    [137.3, 36.8], [136.7, 36.4], [135.9, 35.6], [134.0, 35.5], [132.6, 35.4], [131.0, 34.3], [130.9, 33.9], [129.9, 33.6]],                                // Japan (Kyushu – Honshu)
  [[140.0, 41.5], [140.1, 42.5], [141.3, 43.3], [141.7, 45.4], [142.9, 44.6], [144.4, 44.0], [145.3, 43.3], [143.9, 42.9], [143.3, 42.0], [141.2, 42.4],
    [140.5, 41.7]],                                                                                                                                         // Hokkaido
  [[142.0, 46.0], [142.4, 49.0], [142.2, 51.5], [142.9, 54.2], [143.4, 52.0], [143.2, 49.3], [143.6, 46.5]],                                               // Sakhalin
];
// the Ganga past Patna (Nalanda lies on the plain south of it)
export const GANGA = [[78.2, 29.9], [78.9, 28.6], [79.9, 27.2], [80.4, 26.4], [81.3, 25.9], [81.9, 25.4], [83.0, 25.3], [84.0, 25.6], [85.1, 25.6],
  [86.0, 25.4], [87.3, 25.2], [87.9, 24.7], [88.3, 23.9], [88.4, 23.0], [88.1, 22.2], [88.0, 21.6]];

// Builds the map: ocean, land fill, coastlines (drawing outward from Nalanda), river, graticule.
export function buildMap(M) {
  const group = new THREE.Group();
  const P2 = ([lon, lat]) => { const v = proj(lon, lat); return new THREE.Vector2(v.x, -v.z); };   // shape space (y north)
  // ocean: a big plane with the graticule
  const oceanMat = new THREE.ShaderMaterial({
    uniforms: M,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uMap, uR; varying vec2 vP;\n${MAP_GLSL}
      void main(){
        float d = length(vP);
        vec3 c = vec3(0.004, 0.010, 0.020) * (0.8 + 0.4 * mn(vP * 0.4)) * (1.0 - smoothstep(30.0, 150.0, d) * 0.85);
        c += vec3(1.0, 0.7, 0.4) * 0.05 * graticule(vP) * (1.0 - smoothstep(uR * 0.6, uR, d)) * step(0.01, uR);
        gl_FragColor = vec4(c * uMap, 1.0);
      }`,
    depthWrite: false,
  });
  const oceanG = new THREE.PlaneGeometry(1600, 1600, 1, 1); oceanG.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanG, oceanMat);
  ocean.position.y = -6 / DEG; ocean.renderOrder = -10; ocean.frustumCulled = false;
  group.add(ocean);
  // land
  const shapes = [];
  const main = new THREE.Shape([...MAINLAND, ...MAINLAND_CLOSE].map(P2));
  main.holes.push(new THREE.Path(CASPIAN.map(P2)));
  shapes.push(main, new THREE.Shape([...AFRICA, ...AFRICA_CLOSE].map(P2)));
  for (const isl of ISLANDS) shapes.push(new THREE.Shape(isl.map(P2)));
  const landG = mergeGeometries(shapes.map((s) => { const g = new THREE.ShapeGeometry(s); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; }));
  landG.rotateX(-Math.PI / 2);
  const landMat = new THREE.ShaderMaterial({
    uniforms: M,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uMap, uR, uMapK; varying vec2 vP;\n${MAP_GLSL}
      void main(){
        float far = smoothstep(32.0, 70.0, length(vP * vec2(1.0, 1.3)));
        vec3 c = mix(mapLand(vP) * uMapK, vec3(0.004, 0.010, 0.020) * 0.5, far);
        c += vec3(1.0, 0.7, 0.4) * 0.06 * graticule(vP) * (1.0 - far) * (1.0 - smoothstep(uR * 0.6, uR, length(vP))) * step(0.01, uR);
        gl_FragColor = vec4(c, 1.0);
      }`,
    depthWrite: false,
  });
  const land = new THREE.Mesh(landG, landMat);
  land.position.y = -3 / DEG; land.renderOrder = -9; land.frustumCulled = false;
  group.add(land);
  // coastlines: line segments carrying their distance from Nalanda; they draw outward as uR grows
  const coastMat = new THREE.ShaderMaterial({
    uniforms: { ...M, uColor: { value: new THREE.Color('#ffc984') }, uI: { value: 1.6 } },
    vertexShader: 'attribute float aD; varying float vD; void main(){ vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uMap, uR, uI; uniform vec3 uColor; varying float vD;
      void main(){
        if (vD > uR) discard;
        float head = 1.0 - smoothstep(0.0, 6.0, uR - vD);
        gl_FragColor = vec4(uColor * uI * (0.55 + 2.5 * head) * uMap, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  });
  const segs = [], dist = [];
  const addLine = (pts, closed) => {
    const vs = pts.map(([lon, lat]) => proj(lon, lat));
    const n = closed ? vs.length : vs.length - 1;
    for (let i = 0; i < n; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length];
      segs.push(a.x, 0, a.z, b.x, 0, b.z);
      dist.push(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z));
    }
  };
  addLine(MAINLAND, false); addLine(CASPIAN, true); addLine(AFRICA, false);
  for (const isl of ISLANDS) addLine(isl, true);
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
  cg.setAttribute('aD', new THREE.Float32BufferAttribute(dist, 1));
  const coast = new THREE.LineSegments(cg, coastMat);
  coast.renderOrder = 4; coast.frustumCulled = false;
  group.add(coast);
  // the Ganga
  const rs = [], rd = [];
  const gv = GANGA.map(([lon, lat]) => proj(lon, lat));
  for (let i = 0; i < gv.length - 1; i++) { rs.push(gv[i].x, 0, gv[i].z, gv[i + 1].x, 0, gv[i + 1].z); rd.push(gv[i].length(), gv[i + 1].length()); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(rs, 3));
  rg.setAttribute('aD', new THREE.Float32BufferAttribute(rd, 1));
  const riverMat = coastMat.clone();
  riverMat.uniforms = { ...M, uColor: { value: new THREE.Color('#7fb6ff') }, uI: { value: 0.9 } };
  const river = new THREE.LineSegments(rg, riverMat);
  river.renderOrder = 4; river.frustumCulled = false;
  group.add(river);
  return { group, ocean, land, coast, river };
}

// A route of light: a ribbon of constant on-screen width along a curve, drawn start → end by `progress`.
export function ribbon(curve, { n = 160, width = 0.0032, color = '#ffd08a', intensity = 1.6 } = {}) {
  const pts = curve.getSpacedPoints(n);
  const pos = [], nxt = [], side = [], uu = [], idx = [];
  pts.forEach((p, i) => {
    const q = i < n ? pts[i + 1] : p.clone().multiplyScalar(2).sub(pts[i - 1]);
    for (const sd of [-1, 1]) { pos.push(p.x, p.y, p.z); nxt.push(q.x, q.y, q.z); side.push(sd); uu.push(i / n); }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aNext', new THREE.Float32BufferAttribute(nxt, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uOpacity: { value: 1 }, uW: { value: width }, uColor: { value: new THREE.Color(color) }, uI: { value: intensity } },
    vertexShader: `attribute vec3 aNext; attribute float aSide, aU; uniform float uW; varying float vSide, vU;
      void main(){
        vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 b = projectionMatrix * modelViewMatrix * vec4(aNext, 1.0);
        float asp = projectionMatrix[1][1] / projectionMatrix[0][0];
        vec2 d = (b.xy / b.w - a.xy / a.w) * vec2(asp, 1.0);
        d = length(d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
        vec2 o = vec2(-d.y, d.x) * uW * aSide;
        o.x /= asp;
        a.xy += o * a.w;
        vSide = aSide; vU = aU;
        gl_Position = a;
      }`,
    fragmentShader: `uniform float uProgress, uOpacity, uI; uniform vec3 uColor; varying float vSide, vU;
      void main(){
        if (vU > uProgress) discard;
        float e = 1.0 - smoothstep(0.2, 1.0, abs(vSide));
        float head = (1.0 - smoothstep(0.0, 0.06, uProgress - vU)) * step(uProgress, 0.999);
        gl_FragColor = vec4(uColor * uI * (1.0 + 3.0 * head) * e * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  Object.defineProperty(mesh, 'progress', { get() { return m.uniforms.uProgress.value; }, set(v) { m.uniforms.uProgress.value = v; mesh.visible = v > 0 && m.uniforms.uOpacity.value > 0; } });
  Object.defineProperty(mesh, 'opacity', { get() { return m.uniforms.uOpacity.value; }, set(v) { m.uniforms.uOpacity.value = v; mesh.visible = v > 0 && m.uniforms.uProgress.value > 0; } });
  return mesh;
}

// ------------------------------------------------------------------------------------- ruin dressing
// Rubble (brickbats and low heaps) and grass tufts round the excavated walls. Instanced; each instance
// vanishes as the build front passes its foot (pure function of the shared uniforms), grass sways with uTime.
export function debrisMaterial(U, kind) {
  const grass = kind === 'grass';
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: grass ? 0.85 : 0.95, vertexColors: grass, side: grass ? THREE.DoubleSide : THREE.FrontSide, flatShading: kind === 'heap' });
  m.userData.noDetail = true; m.userData.noAntiTile = true;
  const u = { uTime: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uRise, uDelayK, uTime; uniform vec2 uCentre;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        ${grass ? 'transformed.xz += vec2(sin(uTime * 2.1 + ip.x * 0.7 + ip.z * 0.3), cos(uTime * 1.7 + ip.z * 0.6)) * 0.06 * position.y * position.y / 0.16;' : ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        if (uRise - uDelayK * length(ip.xz - uCentre) > ip.y + 0.12) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'nalanda-debris-' + kind;
  return m;
}
export function grassTuftGeometry(r) {
  const pos = [], col = [], nor = [];
  const n = 7;
  for (let b = 0; b < n; b++) {
    const a = r() * Math.PI * 2, rad = r() * 0.07, h = 0.18 + r() * 0.3, w = 0.018 + r() * 0.014, lean = 0.05 + r() * 0.12, la = a + (r() - 0.5);
    const bx = Math.cos(a) * rad, bz = Math.sin(a) * rad, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + Math.cos(la) * lean, h, bz + Math.sin(la) * lean);
    const dry = r();
    const tip = dry < 0.18 ? [0.26, 0.22, 0.09] : [0.11 + r() * 0.06, 0.2 + r() * 0.07, 0.04];
    col.push(0.025, 0.035, 0.012, 0.025, 0.035, 0.012, ...tip);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
