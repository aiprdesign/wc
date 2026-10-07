// Great Stupa, Sanchi — materials, carved-relief textures, geometry primitives and sculpted figures for
// temple-sanchi.js. Everything here is in metres, in the stupa's own frame (+z = south, +x = east, y up;
// the four toranas stand at the cardinal points at radius G.RT).
//
// Materials (registered on M under new keys, one merged mesh each):
//   sanchiStone  — buff-to-grey sandstone of the railings, gateways and figures: large-scale buff/grey
//                  mottling, black lichen colonies, rain streaks on vertical faces, dark damp lichen near the
//                  ground, lighter worn arrises (curvature from screen-space derivatives of the normal)
//   sanchiRelief — the carved faces of the toranas: the shader maps each fragment into its gateway's own
//                  frame and samples two carved-relief normal/height atlases (architrave friezes; pillar
//                  panels) with exact, per-face UVs (the Parts world UVs are not used)
//   sanchiDome   — the anda and medhi facing: running-bond courses computed in spherical / cylindrical
//                  coordinates (stone pillows, joints, per-block tone and tilt), weathering streaks
//   sanchiAshlar — coursed ashlar of the stair, landing and harmika plinth (planar coursing)
//   sanchiPave   — the stone flags of the processional paths (polar coursing)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas as mkCanvas } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';

// ------------------------------------------------------------------------------------------- layout
// Gateway (torana) layout in its own frame: x across the passage, y up, z outward (front = +z).
export const G = {
  RT: 27.1,                 // radius of the gateways' centre line
  PX: 1.7, PW: 0.7,         // pillar centres (±PX) and square section
  PLINTH: 0.25, SHAFT: 4.6, // pillar shaft from the plinth to the abacus
  CAP0: 4.75, CAP1: 5.85,   // capital (four animals back to back)
  A: [6.26, 7.58, 8.9],     // architrave centres (bottom of the lowest at 5.95)
  AH: 0.62, AD: 0.55,       // architrave height and depth
  LB: 3.0, VX: 3.08, VRAD: 0.34,   // beam half-length, volute centre and radius
  BOW: 0.08,                // the architraves' gentle upward bow at mid-span
};
export const bow = (x) => G.BOW * Math.max(0, 1 - (x / 3.1) ** 2);
// Stupa (shared with the dome shader)
export const S = {
  DR: 18.3, DH: 4.3,        // medhi radius and height
  RB: 16.9,                 // anda radius where it springs from the berm
  YC: -0.28, RD: 17.51,     // anda arc centre (on the axis) and radius: flattened top at y = 16.5, r ≈ 5
  TOP: 16.5,
  VR: 24.5,                 // ground railing (vedika) radius
};
S.A0 = Math.asin((S.DH - S.YC) / S.RD);

// ------------------------------------------------------------------------------------------- shader
const GLSL_COMMON = /* glsl */ `
varying vec3 vSP; varying vec3 vSN;
float sHash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sHash(i), sHash(i + vec3(1,0,0)), f.x), mix(sHash(i + vec3(0,1,0)), sHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sHash(i + vec3(0,0,1)), sHash(i + vec3(1,0,1)), f.x), mix(sHash(i + vec3(0,1,1)), sHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sFbm(vec3 p){ return sNoise(p) * 0.5 + sNoise(p * 2.03 + 7.1) * 0.3 + sNoise(p * 4.01 + 3.3) * 0.2; }
vec3 sLin(vec3 c){ return pow(c, vec3(2.2)); }
// smoothstep pillow: height and slope of a stone's rounded arris, d = distance to the joint (m), w = rounding
vec2 sPillow(float d, float w){ float t = clamp(d / w, 0.0, 1.0); return vec2(t * t * (3.0 - 2.0 * t), 6.0 * t * (1.0 - t) / w); }
#ifdef S_RELIEF
uniform sampler2D tSFrieze; uniform sampler2D tSPanel;
#endif
`;

// coursed masonry: running bond with irregular block lengths. In: s (m along the course direction's normal),
// u-angle data. Out (via inout): colour, gradient (gx along T, gy along B).
const GLSL_MAIN = /* glsl */ `
  vec3 sP = vSP; vec3 sN = normalize(vSN);
  vec3 sNW = sN;            // perturbed normal (stupa frame)
  float sRough = 1.0;
  float sBig = sFbm(sP * 0.11);
  float sMid = sNoise(sP * 0.8 + 11.0);
  vec3 sCol = mix(sLin(vec3(0.75, 0.62, 0.47)), sLin(vec3(0.61, 0.56, 0.49)), smoothstep(0.32, 0.72, sBig * 0.75 + sMid * 0.25));
  float sWearK = 1.0, sLichK = 1.0;
  float sPx = max(length(fwidth(sP)), 1e-4);          // metres per pixel
#if defined(S_DOME) || defined(S_PAVE) || defined(S_ASHLAR)
  {
    vec3 T, B; float s, u, ch, bl, n = 0.0;
  #if defined(S_DOME)
    float r = length(sP.xz), phi = atan(sP.z, sP.x);
    T = vec3(-sin(phi), 0.0, cos(phi)); B = normalize(cross(T, sN));
    float Rk;
    if (sP.y < ${S.DH.toFixed(3)} - 0.02 && abs(sN.y) < 0.6) { s = sP.y; ch = 0.36; Rk = ${S.DR.toFixed(3)}; B = vec3(0.0, 1.0, 0.0); }
    else { s = ${S.RD.toFixed(3)} * (atan(sP.y - (${S.YC.toFixed(3)}), r) - ${S.A0.toFixed(5)}); ch = 0.42;
      s += 0.09 * (sNoise(vec3(sP.x * 0.35, 0.0, sP.z * 0.35)) - 0.5) + 0.05 * (sNoise(sP * 1.3) - 0.5);    // old courses wander
      Rk = ${S.RD.toFixed(3)} * cos(${S.A0.toFixed(5)} + (floor(s / ch) + 0.5) * ch / ${S.RD.toFixed(3)}); }
    float kc = floor(s / ch);
    n = max(floor(6.2831853 * max(Rk, 0.3) / 0.92), 3.0);
    u = phi / 6.2831853 * n + 0.5 * mod(kc, 2.0) + 0.31 * sHash(vec3(kc, 1.3, 7.7));
    bl = 6.2831853 * Rk / n;
  #elif defined(S_PAVE)
    float r = length(sP.xz), phi = atan(sP.z, sP.x);
    T = vec3(-sin(phi), 0.0, cos(phi)); B = vec3(cos(phi), 0.0, sin(phi));
    ch = 0.95; s = r;
    float kc = floor(s / ch), Rk = (kc + 0.5) * ch;
    n = max(floor(6.2831853 * Rk / 1.35), 3.0);
    u = phi / 6.2831853 * n + 0.5 * mod(kc, 2.0) + 0.27 * sHash(vec3(kc, 5.1, 2.2));
    bl = 6.2831853 * Rk / n;
  #else
    vec3 an = abs(sN);
    if (an.y > 0.7) { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 0.0, 1.0); s = sP.z; ch = 0.8; u = sP.x / 1.15; bl = 1.15; }
    else if (an.x > an.z) { T = vec3(0.0, 0.0, 1.0); B = vec3(0.0, 1.0, 0.0); s = sP.y; ch = 0.32; u = sP.z / 0.86; bl = 0.86; }
    else { T = vec3(1.0, 0.0, 0.0); B = vec3(0.0, 1.0, 0.0); s = sP.y; ch = 0.32; u = sP.x / 0.86; bl = 0.86; }
    float kc = floor(s / ch);
    u += 0.5 * mod(kc, 2.0) + 0.23 * sHash(vec3(kc, 3.3, 1.1));
  #endif
    float fv = fract(s / ch), fu = fract(u);
    float bi = floor(u); if (n > 0.0) bi = mod(bi, n);
    float r1 = sHash(vec3(kc, bi, 3.7)), r2 = sHash(vec3(bi, kc, 9.1));
    // irregular lengths: some blocks are split in two
    if (r2 > 0.55) { float sp = 0.32 + 0.36 * r1;
      if (fu < sp) { fu /= sp; bl *= sp; r1 = fract(r1 * 7.31); } else { fu = (fu - sp) / (1.0 - sp); bl *= 1.0 - sp; r1 = fract(r1 * 3.17); } }
    float du = min(fu, 1.0 - fu) * bl, dv = min(fv, 1.0 - fv) * ch;
    float aa = 1.0 - smoothstep(0.045, 0.16, sPx);                 // fade the masonry pattern to its average
    float jw = 0.018;
    float joint = 1.0 - smoothstep(jw, jw + max(0.025, sPx * 1.2), min(du, dv));
    // per-block tone: buff, grey, a few pale (restored) and dark (blackened) stones
    vec3 cb = mix(sLin(vec3(0.72, 0.61, 0.48)), sLin(vec3(0.58, 0.54, 0.48)), r1);
    cb *= 0.84 + 0.3 * sHash(vec3(bi * 1.7, kc * 0.3, 1.0));
    cb = mix(cb, sLin(vec3(0.79, 0.69, 0.56)), step(0.93, r2) * 0.6);
    cb = mix(cb, sLin(vec3(0.40, 0.38, 0.34)), step(r2, 0.06) * 0.6);
    sCol = mix(sCol, cb, 0.5 * aa + 0.2);
  #ifdef S_DOME
    sCol *= 1.0 - joint * (0.32 * aa + 0.06);
    // the anda weathers dark: black lichen in broad patches and long streaks washed down from the top
    float dk = smoothstep(0.52, 0.78, sFbm(sP * 0.32 + 3.0) * 0.45 + sNoise(vec3(sP.x * 1.4, sP.y * 0.1, sP.z * 1.4)) * 0.55);
    sCol = mix(sCol, sLin(vec3(0.38, 0.34, 0.29)), 0.45 * dk);
    sCol *= 0.9 + 0.1 * smoothstep(${S.DH.toFixed(2)}, ${(S.DH + 4).toFixed(2)}, sP.y);   // damp, darker springing
    sLichK = 0.6;
  #else
    sCol *= 1.0 - joint * (0.5 * aa + 0.1);
  #endif
    // stone pillows (rounded arrises) and a slight tilt per stone: the coursing catches the low sun
    vec2 hx = sPillow(du, 0.07), hy = sPillow(dv, 0.06);
    float A = 0.03;
    float gx = A * hy.x * hx.y * (fu < 0.5 ? 1.0 : -1.0) + (r1 - 0.5) * 0.14;
    float gy = A * hx.x * hy.y * (fv < 0.5 ? 1.0 : -1.0) + (r2 - 0.5) * 0.14;
    #ifdef S_PAVE
      gx *= 0.5; gy *= 0.5;
    #endif
    sNW = normalize(sN - aa * (gx * T + gy * B));
    sRough *= 1.0 + 0.15 * joint;
    sWearK = 0.6;
  }
#endif
#ifdef S_RELIEF
  {
    // into this fragment's gateway frame: gl = (across, up, outward from the gate's centre line)
    vec3 gl, gn, TX, TZ; float q;
    if (abs(sP.z) >= abs(sP.x)) {
      if (sP.z > 0.0) { gl = vec3(sP.x, sP.y, sP.z - ${G.RT.toFixed(3)}); gn = sN; TX = vec3(1,0,0); TZ = vec3(0,0,1); q = 0.0; }
      else { gl = vec3(-sP.x, sP.y, -sP.z - ${G.RT.toFixed(3)}); gn = vec3(-sN.x, sN.y, -sN.z); TX = vec3(-1,0,0); TZ = vec3(0,0,-1); q = 2.0; }
    } else {
      if (sP.x > 0.0) { gl = vec3(-sP.z, sP.y, sP.x - ${G.RT.toFixed(3)}); gn = vec3(-sN.z, sN.y, sN.x); TX = vec3(0,0,-1); TZ = vec3(1,0,0); q = 1.0; }
      else { gl = vec3(sP.z, sP.y, -sP.x - ${G.RT.toFixed(3)}); gn = vec3(sN.z, sN.y, -sN.x); TX = vec3(0,0,1); TZ = vec3(-1,0,0); q = 3.0; }
    }
    vec2 uv = vec2(-1.0); vec3 T = TX; int atlas = 0; vec2 gdu = vec2(0.0), gdv = vec2(0.0);
    float side = 0.0;
    float ax = abs(gl.x);
    float bw = ${G.BOW.toFixed(3)} * max(0.0, 1.0 - (gl.x / 3.1) * (gl.x / 3.1));
    if (gl.y < ${G.SHAFT.toFixed(3)} + 0.01) {
      // pillar shaft: four columns of panels (front, back, inner side, outer side)
      float cx = sign(gl.x) * ${G.PX.toFixed(3)};
      float v = (gl.y - ${G.PLINTH.toFixed(3)}) / ${(G.SHAFT - G.PLINTH).toFixed(3)};
      float col = -1.0, uu = 0.0;
      if (abs(gn.z) > 0.97) { float sg = sign(gn.z); uu = sg * (gl.x - cx) / ${G.PW.toFixed(3)} + 0.5; col = mod((sg > 0.0 ? 0.0 : 1.0) + q, 2.0); T = TX * sg; }
      else if (abs(gn.x) > 0.97) { float sg = sign(gn.x); uu = -sg * gl.z / ${G.PW.toFixed(3)} + 0.5; col = sg * sign(gl.x) < 0.0 ? 2.0 : 3.0; T = -TZ * sg; }
      if (col >= 0.0) { uv = vec2((col + clamp(uu, 0.002, 0.998)) / 4.0, v); atlas = 1; }
    } else if (ax < ${G.LB.toFixed(3)} && abs(gn.z) > 0.97) {
      float sg = sign(gn.z);
      for (int k = 0; k < 3; k++) {
        float yc = (k == 0 ? ${G.A[0].toFixed(3)} : k == 1 ? ${G.A[1].toFixed(3)} : ${G.A[2].toFixed(3)}) + bw;
        float v = (gl.y - yc) / ${G.AH.toFixed(3)} + 0.5;
        if (v > -0.02 && v < 1.02) {
          float row = mod(float(k) + q + (sg > 0.0 ? 0.0 : 2.0), 4.0);
          uv = vec2((sg * gl.x + ${G.LB.toFixed(3)}) / ${(2 * G.LB).toFixed(3)}, (row + clamp(v, 0.004, 0.996)) / 4.0);
          atlas = 0; T = TX * sg;
        }
      }
      // the square dies between the architraves, over the pillars
      if (uv.x < 0.0 && abs(ax - ${G.PX.toFixed(3)}) < 0.37) {
        for (int k = 0; k < 2; k++) {
          float y0 = (k == 0 ? ${G.A[0].toFixed(3)} : ${G.A[1].toFixed(3)}) + ${(G.AH / 2).toFixed(3)} + bw;
          float v = (gl.y - y0) / ${(G.A[1] - G.A[0] - G.AH).toFixed(3)};
          if (v > -0.02 && v < 1.02) { float uu = sg * (gl.x - sign(gl.x) * ${G.PX.toFixed(3)}) / 0.72 + 0.5;
            uv = vec2((mod(float(k) + q, 4.0) + clamp(uu, 0.002, 0.998)) / 4.0, 0.816 + 0.168 * clamp(v, 0.0, 1.0)); atlas = 1; T = TX * sg; }
        }
      }
    }
    if (uv.x >= 0.0) {
      // gradients from a continuous proxy, so the face switches don't blow up the mip level
      vec2 pr = vec2(dot(sP, T), sP.y);
      vec2 dx = dFdx(pr), dy = dFdy(pr);
      vec2 sc = atlas == 0 ? vec2(1.0 / ${(2 * G.LB).toFixed(3)}, 0.25 / ${G.AH.toFixed(3)}) : vec2(0.25 / ${G.PW.toFixed(3)}, 1.0 / ${(G.SHAFT - G.PLINTH).toFixed(3)});
      vec4 tx = atlas == 0 ? textureGrad(tSFrieze, uv, dx * sc, dy * sc) : textureGrad(tSPanel, uv, dx * sc, dy * sc);
      vec3 nts = tx.xyz * 2.0 - 1.0;
      vec3 Bv = vec3(0.0, 1.0, 0.0);
      sNW = normalize(T * nts.x + Bv * nts.y + sN * max(nts.z, 0.2));
      float h = tx.w;
      sCol *= mix(0.68, 1.04, smoothstep(0.12, 0.8, h));       // carved recesses hold shadow and grime
      sCol = mix(sCol, sCol * 1.12, smoothstep(0.6, 0.95, h) * 0.6);   // raised forms worn pale
      sRough *= mix(1.05, 0.92, h);
    }
  }
#endif
  // weathering, common to all
  float sVert = 1.0 - abs(sN.y);
  float sStreak = sNoise(vec3(sP.x * 2.6, sP.y * 0.22, sP.z * 2.6) + 5.0) * 0.7 + sNoise(vec3(sP.x * 9.0, sP.y * 0.5, sP.z * 9.0)) * 0.3;
  sCol *= 1.0 - 0.3 * smoothstep(0.52, 0.85, sStreak) * sVert;
  float sBase = 1.0 - smoothstep(0.0, 1.9, sP.y);
  float sL = sNoise(sP * 2.1 + 2.0) * 0.55 + sMid * 0.45;
  float sLich = smoothstep(0.38, 0.62, sL + 0.4 * sBase - 0.15) * sBase * sLichK;
  sCol = mix(sCol, sLin(vec3(0.27, 0.28, 0.23)), 0.82 * sLich);
  float sSpot = smoothstep(0.66, 0.84, sNoise(sP * 1.3 + 17.0) * 0.7 + sNoise(sP * 5.0) * 0.3);
  sCol = mix(sCol, sLin(vec3(0.30, 0.29, 0.26)), 0.5 * sSpot);
  sCol *= 1.0 - 0.18 * smoothstep(0.5, 1.0, sN.y) * smoothstep(0.4, 0.8, sNoise(sP * 3.0 + 1.0));   // crust on the tops
  float sCurv = length(fwidth(sN)) / sPx;
  float sWear = smoothstep(3.0, 14.0, sCurv) * (1.0 - sLich) * sWearK;
  sCol = mix(sCol, sCol * 1.3 + 0.015, sWear * 0.75);
  sRough *= 1.0 - 0.1 * sWear;
  diffuseColor.rgb *= sCol;
`;

function sanchiMaterial(define, { color = '#ffffff', roughness = 0.9, uniforms = {}, detail } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  m.userData.sanchi = define;
  if (detail) m.userData.detail = detail;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vSN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vSP = transformed; vSN = objectNormal;');
    sh.fragmentShader = `#define ${define}\n` + sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${GLSL_MAIN}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor * sRough, 0.05, 1.0);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(normal + mat3(viewMatrix) * (sNW - sN));');
  };
  m.customProgramCacheKey = () => `sanchi-${define}-v1`;
  return m;
}

export function sanchiMaterials(M, { lite = false } = {}) {
  if (M.sanchiStone) return M;
  const fr = friezeAtlas(lite), pa = panelAtlas(lite);
  M.sanchiStone = sanchiMaterial('S_STONE', { roughness: 0.88 });
  M.sanchiRelief = sanchiMaterial('S_RELIEF', { roughness: 0.86, uniforms: { tSFrieze: { value: fr }, tSPanel: { value: pa } } });
  M.sanchiDome = sanchiMaterial('S_DOME', { roughness: 0.93, detail: { albedo: 0.06, rough: 0.2, bump: 0.0005, scratch: 0, grime: 0.06 } });
  M.sanchiAshlar = sanchiMaterial('S_ASHLAR', { roughness: 0.9 });
  M.sanchiPave = sanchiMaterial('S_PAVE', { roughness: 0.92, detail: { albedo: 0.05, rough: 0.15, bump: 0.0004, scratch: 0, grime: 0.05 } });
  return M;
}

// ------------------------------------------------------------------------------------------- relief textures
// Carved relief is drawn as a height field on a canvas (max-composited domed forms, blurred to round them),
// then turned into a tangent-space normal map with the height kept in alpha (for cavity shading).
class Relief {
  constructor(W, H) {
    this.c = mkCanvas(W, H); this.g = this.c.getContext('2d'); this.W = W; this.H = H;
    this.g.fillStyle = '#000'; this.g.fillRect(0, 0, W, H);
  }
  lv(l) { const v = Math.round(Math.min(1, Math.max(0, l)) * 255); return `rgb(${v},${v},${v})`; }
  // flat level (replaces)
  rect(x, y, w, h, l) { const g = this.g; g.globalCompositeOperation = 'source-over'; g.fillStyle = this.lv(l); g.fillRect(x, y, w, h); }
  // domed blob: radial gradient from l1 (centre) to l0 (rim), max-composited
  blob(x, y, rx, ry, l0, l1, rot = 0) {
    const g = this.g; g.save(); g.globalCompositeOperation = 'lighten';
    g.translate(x, y); g.rotate(rot); g.scale(Math.max(rx, 0.5), Math.max(ry, 0.5));
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, this.lv(l1)); gr.addColorStop(0.7, this.lv(l0 + (l1 - l0) * 0.55)); gr.addColorStop(1, this.lv(l0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // a limb / stroke at a level
  line(pts, w, l) {
    const g = this.g; g.save(); g.globalCompositeOperation = 'lighten'; g.strokeStyle = this.lv(l); g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke(); g.restore();
  }
  curve(pts, w, l) {   // quadratic through midpoints
    const g = this.g; g.save(); g.globalCompositeOperation = 'lighten'; g.strokeStyle = this.lv(l); g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    const L = pts[pts.length - 1]; g.lineTo(L[0], L[1]); g.stroke(); g.restore();
  }
  poly(pts, l) { const g = this.g; g.save(); g.globalCompositeOperation = 'lighten'; g.fillStyle = this.lv(l); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.fill(); g.restore(); }
  // incised line (darkens)
  incise(pts, w, l) { const g = this.g; g.save(); g.globalCompositeOperation = 'darken'; g.strokeStyle = this.lv(l); g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); g.restore(); }
  blur(px) { const g = this.g, t = mkCanvas(this.W, this.H), tg = t.getContext('2d'); tg.drawImage(this.c, 0, 0); g.save(); g.globalCompositeOperation = 'source-over'; g.filter = `blur(${px}px)`; g.drawImage(t, 0, 0); g.restore(); g.filter = 'none'; }
  // → DataTexture: RGB normal (tangent space, +x right, +y up), A height. depth = relief depth (m), mx/my = metres per px
  toNormalMap(depth, mx, my) {
    const { W, H } = this, src = this.g.getImageData(0, 0, W, H).data;
    const h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = src[i * 4] / 255;
    const out = new Uint8Array(W * H * 4), kx = depth / mx, ky = depth / my;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const xl = Math.max(x - 1, 0), xr = Math.min(x + 1, W - 1), yu = Math.max(y - 1, 0), yd = Math.min(y + 1, H - 1);
      const dx = (h[y * W + xr] - h[y * W + xl]) / (xr - xl) * kx;
      const dyUp = -(h[yd * W + x] - h[yu * W + x]) / (yd - yu) * ky;          // canvas y runs down
      let nx = -dx, ny = -dyUp, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const o = ((H - 1 - y) * W + x) * 4;                                       // row 0 = bottom (v = 0)
      out[o] = (nx * 0.5 + 0.5) * 255; out[o + 1] = (ny * 0.5 + 0.5) * 255; out[o + 2] = (nz * 0.5 + 0.5) * 255; out[o + 3] = h[y * W + x] * 255;
    }
    const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  }

  // ---- motifs. (x, y) = foot point in px, h = height in px, d = facing (±1)
  figure(x, y, h, { d = 1, pose = 0, l = 0.78, female = false } = {}) {
    const k = h;
    this.line([[x - 0.05 * k, y], [x - 0.04 * k, y - 0.42 * k]], 0.085 * k, l - 0.12);
    this.line([[x + 0.05 * k, y], [x + 0.04 * k, y - 0.42 * k]], 0.085 * k, l - 0.12);
    this.blob(x, y - 0.46 * k, (female ? 0.16 : 0.13) * k, 0.11 * k, l - 0.25, l - 0.02);       // hips, dhoti
    this.blob(x, y - 0.66 * k, 0.12 * k, 0.17 * k, l - 0.25, l);                                 // torso
    if (female) { this.blob(x + d * 0.05 * k, y - 0.71 * k, 0.05 * k, 0.05 * k, l - 0.1, l + 0.08); }
    this.blob(x, y - 0.89 * k, 0.085 * k, 0.095 * k, l - 0.2, l + 0.06);                          // head
    this.blob(x, y - 0.97 * k, 0.1 * k, 0.06 * k, l - 0.2, l + 0.02);                              // turban
    const sh = [x, y - 0.78 * k];
    if (pose === 0) {        // hands joined in worship
      this.line([[sh[0] - 0.1 * k, sh[1]], [x + d * 0.04 * k, y - 0.62 * k], [x + d * 0.08 * k, y - 0.74 * k]], 0.05 * k, l - 0.05);
      this.line([[sh[0] + 0.1 * k, sh[1]], [x + d * 0.08 * k, y - 0.74 * k]], 0.05 * k, l - 0.05);
    } else if (pose === 1) { // one arm raised (a parasol, a fly-whisk or a garland)
      this.line([[sh[0] + d * 0.1 * k, sh[1]], [x + d * 0.2 * k, y - 0.92 * k], [x + d * 0.17 * k, y - 1.08 * k]], 0.05 * k, l - 0.05);
      this.line([[sh[0] - d * 0.1 * k, sh[1]], [x - d * 0.14 * k, y - 0.5 * k]], 0.05 * k, l - 0.05);
    } else {                 // arms down, holding
      this.line([[sh[0] - 0.1 * k, sh[1]], [x - 0.15 * k, y - 0.5 * k]], 0.05 * k, l - 0.05);
      this.line([[sh[0] + 0.1 * k, sh[1]], [x + 0.15 * k, y - 0.5 * k]], 0.05 * k, l - 0.05);
    }
    this.incise([[x - 0.12 * k, y - 0.4 * k], [x + 0.12 * k, y - 0.4 * k]], 0.012 * k, l - 0.3);
  }
  parasol(x, y, h, l = 0.72) { this.line([[x, y], [x, y - h]], 0.025 * h, l - 0.1); this.blob(x, y - h, 0.16 * h, 0.05 * h, l - 0.2, l); }
  elephant(x, y, h, { d = 1, rider = true, l = 0.8 } = {}) {
    const k = h;
    for (const [lx, sl] of [[-0.32, -0.05], [-0.14, 0.02], [0.18, -0.04], [0.34, 0.03]]) this.line([[x + d * lx * k, y], [x + d * (lx + sl) * k, y - 0.42 * k]], 0.15 * k, l - 0.18 + (lx > 0 ? 0.04 : 0));
    this.blob(x, y - 0.55 * k, 0.5 * k, 0.32 * k, l - 0.3, l);                       // body
    this.blob(x + d * 0.45 * k, y - 0.66 * k, 0.24 * k, 0.26 * k, l - 0.2, l + 0.06);  // head
    this.blob(x + d * 0.36 * k, y - 0.62 * k, 0.12 * k, 0.2 * k, l - 0.1, l + 0.1);   // ear
    this.curve([[x + d * 0.62 * k, y - 0.6 * k], [x + d * 0.72 * k, y - 0.35 * k], [x + d * 0.66 * k, y - 0.08 * k], [x + d * 0.74 * k, y - 0.02 * k]], 0.09 * k, l);   // trunk
    this.line([[x + d * 0.58 * k, y - 0.52 * k], [x + d * 0.74 * k, y - 0.46 * k]], 0.035 * k, l + 0.05);                 // tusk
    this.line([[x - d * 0.5 * k, y - 0.6 * k], [x - d * 0.56 * k, y - 0.3 * k]], 0.03 * k, l - 0.2);                     // tail
    this.blob(x - d * 0.02 * k, y - 0.84 * k, 0.3 * k, 0.07 * k, l - 0.1, l + 0.04);                                     // caparison
    if (rider) { this.figure(x + d * 0.22 * k, y - 0.82 * k, 0.5 * k, { d, pose: 2, l: l + 0.04 }); }
  }
  horse(x, y, h, { d = 1, rider = true, l = 0.8 } = {}) {
    const k = h;
    for (const [lx, sl] of [[-0.3, -0.06], [-0.2, 0.03], [0.22, 0.08], [0.3, -0.02]]) this.line([[x + d * lx * k, y], [x + d * (lx + sl * 0.5) * k, y - 0.42 * k]], 0.055 * k, l - 0.15);
    this.blob(x, y - 0.55 * k, 0.4 * k, 0.17 * k, l - 0.25, l);
    this.line([[x + d * 0.3 * k, y - 0.6 * k], [x + d * 0.48 * k, y - 0.88 * k]], 0.14 * k, l - 0.05);
    this.blob(x + d * 0.56 * k, y - 0.84 * k, 0.12 * k, 0.06 * k, l - 0.15, l + 0.04, d * 0.6);
    this.curve([[x - d * 0.38 * k, y - 0.6 * k], [x - d * 0.5 * k, y - 0.45 * k], [x - d * 0.46 * k, y - 0.25 * k]], 0.05 * k, l - 0.15);
    if (rider) this.figure(x - d * 0.02 * k, y - 0.6 * k, 0.55 * k, { d, pose: 1, l: l + 0.04 });
  }
  lion(x, y, h, { d = 1, l = 0.8 } = {}) {
    const k = h;
    for (const lx of [-0.3, -0.2, 0.22, 0.3]) this.line([[x + d * lx * k, y], [x + d * lx * k, y - 0.4 * k]], 0.08 * k, l - 0.15);
    this.blob(x - d * 0.05 * k, y - 0.5 * k, 0.38 * k, 0.18 * k, l - 0.25, l);
    this.blob(x + d * 0.3 * k, y - 0.68 * k, 0.22 * k, 0.26 * k, l - 0.2, l + 0.05);   // mane
    this.blob(x + d * 0.42 * k, y - 0.72 * k, 0.11 * k, 0.11 * k, l, l + 0.12);         // face
    this.curve([[x - d * 0.4 * k, y - 0.55 * k], [x - d * 0.6 * k, y - 0.7 * k], [x - d * 0.55 * k, y - 0.9 * k]], 0.035 * k, l - 0.1);
  }
  peacock(x, y, h, { d = 1, l = 0.8 } = {}) {
    const k = h;
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 - d * (0.25 + i * 0.16); this.blob(x - d * 0.1 * k + Math.cos(a) * 0.55 * k, y - 0.35 * k + Math.sin(a) * 0.5 * k, 0.08 * k, 0.18 * k, l - 0.35, l - 0.08, a + Math.PI / 2); }
    this.blob(x, y - 0.32 * k, 0.16 * k, 0.12 * k, l - 0.2, l + 0.05);
    this.line([[x + d * 0.08 * k, y - 0.38 * k], [x + d * 0.14 * k, y - 0.62 * k]], 0.05 * k, l);
    this.blob(x + d * 0.15 * k, y - 0.65 * k, 0.05 * k, 0.045 * k, l, l + 0.1);
    this.line([[x - 0.03 * k, y - 0.2 * k], [x - 0.03 * k, y]], 0.03 * k, l - 0.2); this.line([[x + 0.04 * k, y - 0.2 * k], [x + 0.05 * k, y]], 0.03 * k, l - 0.2);
  }
  stupa(x, y, h, l = 0.82) {
    const k = h;
    this.poly([[x - 0.42 * k, y], [x + 0.42 * k, y], [x + 0.42 * k, y - 0.14 * k], [x - 0.42 * k, y - 0.14 * k]], l - 0.2);
    this.blob(x, y - 0.14 * k, 0.36 * k, 0.45 * k, l - 0.3, l + 0.05);
    this.poly([[x - 0.07 * k, y - 0.56 * k], [x + 0.07 * k, y - 0.56 * k], [x + 0.07 * k, y - 0.66 * k], [x - 0.07 * k, y - 0.66 * k]], l);
    this.line([[x, y - 0.66 * k], [x, y - 0.95 * k]], 0.025 * k, l - 0.05);
    for (const [yy, w] of [[0.74, 0.16], [0.84, 0.12], [0.93, 0.08]]) this.blob(x, y - yy * k, w * k, 0.025 * k, l - 0.15, l + 0.05);
    for (let i = -2; i <= 2; i++) this.incise([[x + i * 0.12 * k - 0.05 * k, y - 0.34 * k], [x + i * 0.12 * k, y - 0.28 * k], [x + i * 0.12 * k + 0.05 * k, y - 0.34 * k]], 0.012 * k, l - 0.15);   // garlands
    // flanking parasols / flags
    this.parasol(x - 0.38 * k, y - 0.55 * k, 0.4 * k, l - 0.05); this.parasol(x + 0.38 * k, y - 0.55 * k, 0.4 * k, l - 0.05);
  }
  tree(x, y, h, { l = 0.78, rail = true, seed = 1 } = {}) {
    const k = h, r = rng(seed);
    this.line([[x, y - 0.18 * k], [x - 0.02 * k, y - 0.55 * k]], 0.07 * k, l - 0.12);
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 0.34 * k; this.blob(x + Math.cos(a) * rr * 1.1, y - 0.72 * k + Math.sin(a) * rr * 0.8, 0.07 * k, 0.065 * k, l - 0.2, l + 0.04 - r() * 0.1, a); }
    if (rail) { this.poly([[x - 0.25 * k, y], [x + 0.25 * k, y], [x + 0.25 * k, y - 0.2 * k], [x - 0.25 * k, y - 0.2 * k]], l - 0.18);
      for (let i = 0; i < 6; i++) this.incise([[x - 0.25 * k + i * 0.1 * k, y], [x - 0.25 * k + i * 0.1 * k, y - 0.2 * k]], 0.015 * k, l - 0.32);
      for (const yy of [0.07, 0.13]) this.incise([[x - 0.25 * k, y - yy * k], [x + 0.25 * k, y - yy * k]], 0.012 * k, l - 0.3); }
  }
  wheel(x, y, rad, l = 0.82) {
    this.g.save(); this.g.globalCompositeOperation = 'lighten'; this.g.strokeStyle = this.lv(l); this.g.lineWidth = rad * 0.16; this.g.beginPath(); this.g.arc(x, y, rad * 0.88, 0, Math.PI * 2); this.g.stroke(); this.g.restore();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; this.line([[x + Math.cos(a) * rad * 0.15, y + Math.sin(a) * rad * 0.15], [x + Math.cos(a) * rad * 0.82, y + Math.sin(a) * rad * 0.82]], rad * 0.06, l - 0.08); this.blob(x + Math.cos(a) * rad * 1.02, y + Math.sin(a) * rad * 1.02, rad * 0.07, rad * 0.07, l - 0.15, l); }
    this.blob(x, y, rad * 0.2, rad * 0.2, l - 0.1, l + 0.1);
  }
  lotus(x, y, rad, l = 0.8, petals = 12) {
    for (let i = 0; i < petals; i++) { const a = i / petals * Math.PI * 2; this.blob(x + Math.cos(a) * rad * 0.6, y + Math.sin(a) * rad * 0.6, rad * 0.38, rad * 0.16, l - 0.3, l, a); }
    for (let i = 0; i < petals; i++) { const a = (i + 0.5) / petals * Math.PI * 2; this.blob(x + Math.cos(a) * rad * 0.38, y + Math.sin(a) * rad * 0.38, rad * 0.24, rad * 0.11, l - 0.2, l + 0.05, a); }
    this.blob(x, y, rad * 0.22, rad * 0.22, l - 0.1, l + 0.12);
  }
  // building front (city gate / palace): storeys with arched (chaitya) windows, figures on balconies
  palace(x, y, w, h, l = 0.78) {
    this.poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y - h * 0.62], [x - w / 2, y - h * 0.62]], l - 0.25);
    this.poly([[x - w * 0.55, y - h * 0.62], [x + w * 0.55, y - h * 0.62], [x + w * 0.55, y - h * 0.7], [x - w * 0.55, y - h * 0.7]], l);
    this.blob(x, y - h * 0.7, w * 0.4, h * 0.3, l - 0.25, l - 0.05);
    for (let i = -1; i <= 1; i++) { const cx = x + i * w * 0.3; this.g.save(); this.g.globalCompositeOperation = 'darken'; this.g.fillStyle = this.lv(l - 0.45); this.g.beginPath(); this.g.ellipse(cx, y - h * 0.38, w * 0.09, h * 0.16, 0, 0, Math.PI * 2); this.g.fill(); this.g.restore();
      this.figure(cx, y - h * 0.25, h * 0.3, { pose: 0, l: l - 0.05 }); }
  }
  frameH(x0, x1, y0, y1, l = 0.82, beads = true) {
    this.rect(x0, y0, x1 - x0, y1 - y0, l);
    if (beads) { const hh = y1 - y0, n = Math.floor((x1 - x0) / (hh * 1.3)); for (let i = 0; i < n; i++) this.blob(x0 + (i + 0.5) * (x1 - x0) / n, (y0 + y1) / 2, hh * 0.32, hh * 0.32, l - 0.1, l + 0.1); }
  }
}

// Architrave friezes: 4 rows (each the full 6 m face of a beam), the row picked per architrave/face/gate.
function friezeAtlas(lite) {
  const W = lite ? 1024 : 2048, RH = lite ? 128 : 256, R = new Relief(W, RH * 4);
  const pxm = W / (2 * G.LB), pym = RH / G.AH;
  const X = (lx) => (lx + G.LB) * pxm;
  const ROW = (k) => k * RH;                 // canvas y of the row's top (row k = atlas row 3 - k after the flip)
  const drawRow = (row, k) => {
    const top = ROW(row), bot = top + RH, fy = (m) => bot - m * pym;    // metres from the beam's bottom
    const band = 0.05 * pym;
    R.rect(0, top, W, RH, 0.3);
    R.frameH(0, W, top, top + band, 0.85); R.frameH(0, W, bot - band, bot, 0.85);
    // panel dividers
    const cuts = [-2.98, -2.08, -1.32, 1.32, 2.08, 2.98];
    for (const c of cuts) R.rect(X(c) - 0.025 * pxm, top, 0.05 * pxm, RH, 0.82);
    const g0 = fy(0.07), fh = 0.47;            // ground line and field height (m)
    const r = rng(17 + k * 13);
    if (k === 0) {         // procession: elephants, horsemen, parasol bearers
      R.elephant(X(-0.95), g0, fh * 0.92 * pym, { d: 1 });
      R.horse(X(-0.3), g0, fh * 0.85 * pym, { d: 1 });
      R.figure(X(0.2), g0, fh * 0.95 * pym, { pose: 1 }); R.parasol(X(0.3), g0 - 0.35 * pym, 0.35 * pym);
      R.figure(X(0.48), g0, fh * 0.95 * pym, { pose: 0 });
      R.elephant(X(0.98), g0, fh * 0.92 * pym, { d: 1 });
      for (const s of [-1, 1]) { R.lotus(X(s * 1.7), fy(0.31), 0.24 * pym); R.lion(X(s * 2.53), g0, fh * 0.9 * pym, { d: s }); }
    } else if (k === 1) {  // the stupa worshipped: trees, worshippers, elephants bringing lotus garlands
      R.stupa(X(0), g0, fh * pym);
      for (const s of [-1, 1]) { R.tree(X(s * 0.55), g0, fh * pym, { seed: 3 + s }); R.figure(X(s * 0.3), g0, fh * 0.8 * pym, { d: -s, pose: 0 }); R.elephant(X(s * 1.0), g0, fh * 0.85 * pym, { d: -s, rider: false }); }
      for (const s of [-1, 1]) { R.wheel(X(s * 1.7), fy(0.31), 0.2 * pym); R.peacock(X(s * 2.53), g0, fh * pym, { d: s }); }
    } else if (k === 2) {  // the Buddhas of the past: stupas and Bodhi trees in a row
      const xs = [-1.08, -0.72, -0.36, 0, 0.36, 0.72, 1.08];
      xs.forEach((x, i) => (i % 2 === 0 ? R.stupa(X(x), g0, fh * 0.95 * pym, 0.8) : R.tree(X(x), g0, fh * pym, { seed: 11 + i })));
      for (const s of [-1, 1]) { R.figure(X(s * 1.55), g0, fh * pym, { d: -s, pose: 1, female: true }); R.figure(X(s * 1.85), g0, fh * pym, { d: -s, pose: 0 }); R.elephant(X(s * 2.53), g0, fh * 0.9 * pym, { d: s }); }
    } else {               // a Jataka in the forest: elephants under the banyans, a palace, figures
      R.palace(X(-0.85), g0, 0.6 * pxm, fh * pym);
      R.tree(X(-0.3), g0, fh * pym, { rail: false, seed: 31 }); R.tree(X(0.62), g0, fh * pym, { rail: false, seed: 33 }); R.tree(X(1.12), g0, fh * pym, { rail: false, seed: 35 });
      R.elephant(X(0.12), g0, fh * 0.8 * pym, { d: -1, rider: false }); R.elephant(X(0.88), g0, fh * 0.62 * pym, { d: 1, rider: false });
      for (const s of [-1, 1]) { R.figure(X(s * 1.55), g0, fh * pym, { d: -s, pose: 2, female: s > 0 }); R.figure(X(s * 1.85), g0, fh * pym, { d: -s, pose: 1 }); R.horse(X(s * 2.53), g0, fh * 0.9 * pym, { d: s, rider: true }); }
    }
    void r;
  };
  for (let k = 0; k < 4; k++) drawRow(3 - k, k);    // canvas row 3 = atlas row 0 (bottom of the texture)
  R.blur(lite ? 0.8 : 1.3);
  return R.toNormalMap(0.05, 1 / pxm, 1 / pym);
}

// Pillar panels: 4 columns (front A, front B, inner sides: lotus vine, outer sides), each a full shaft face.
function panelAtlas(lite) {
  const CW = lite ? 128 : 256, H = lite ? 1024 : 2048, R = new Relief(CW * 4, H);
  const LEN = G.SHAFT - G.PLINTH, pxm = CW / G.PW, pym = H / LEN;
  const fy = (m) => H - m * pym;                 // metres above the plinth → canvas y
  for (let c = 0; c < 4; c++) {
    const x0 = c * CW, X = (u) => x0 + u * CW, Wm = (m) => m * pxm;
    R.rect(x0, 0, CW, H, 0.85);                   // the pillar's face (raised margin)
    const panels = c === 2 ? [[0.12, LEN - 0.08]] : [[0.12, 1.2], [1.3, 1.95], [2.05, 2.7], [2.8, 3.45], [3.55, LEN - 0.07]];
    panels.forEach(([a, b], i) => {
      R.rect(X(0.07), fy(b), CW * 0.86, (b - a) * pym, 0.3);     // sunk field
      const gy = fy(a + 0.04), ph = (b - a - 0.08) * pym, cx = X(0.5);
      if (c === 2) {    // vertical lotus-vine meander, flowers in the loops
        const n = 9, step = (b - a) / n, pts = [];
        for (let t = 0; t <= 120; t++) { const m = a + 0.05 + (b - a - 0.1) * t / 120; pts.push([cx + Math.sin(t / 120 * n * Math.PI) * CW * 0.22, fy(m)]); }
        R.curve(pts, Wm(0.03), 0.72);
        for (let j = 0; j < n; j++) { const m = a + (j + 0.5) * step, s = j % 2 ? 1 : -1; R.lotus(cx + s * CW * 0.17, fy(m), Wm(0.1), 0.8, 10); R.blob(cx - s * CW * 0.22, fy(m + step * 0.3), Wm(0.07), Wm(0.03), 0.45, 0.72, s * 0.8); }
        return;
      }
      const kind = (i + c * 2) % 6;
      if (i === 0) { R.figure(cx, gy, ph * 0.92, { pose: c === 1 ? 1 : 2, female: c === 3 }); return; }   // door guardian / yakshi
      if (kind === 0) R.stupa(cx, gy, ph * 0.85);
      else if (kind === 1) { R.tree(cx, gy - ph * 0.2, ph * 0.75, { seed: c * 7 + i }); R.figure(cx - CW * 0.32, gy, ph * 0.5, { d: 1 }); R.figure(cx + CW * 0.32, gy, ph * 0.5, { d: -1 }); }
      else if (kind === 2) { R.line([[cx, gy], [cx, gy - ph * 0.5]], Wm(0.05), 0.72); R.wheel(cx, gy - ph * 0.68, ph * 0.22); R.figure(cx - CW * 0.33, gy, ph * 0.45, { d: 1 }); R.figure(cx + CW * 0.33, gy, ph * 0.45, { d: -1 }); }
      else if (kind === 3) R.elephant(cx - CW * 0.08, gy, ph * 0.62, { d: 1 });
      else if (kind === 4) R.palace(cx, gy, CW * 0.8, ph * 0.95);
      else { R.figure(cx - CW * 0.2, gy, ph * 0.8, { d: 1, pose: 1 }); R.figure(cx + CW * 0.2, gy, ph * 0.8, { d: -1, pose: 0, female: true }); }
    });
    // rosette bands between the panels
    for (let i = 0; i < panels.length - 1; i++) { const m = (panels[i][1] + panels[i + 1][0]) / 2; for (let j = 0; j < 4; j++) R.blob(X((j + 0.5) / 4), fy(m), Wm(0.03), Wm(0.03), 0.85, 0.98); }
  }
  R.blur(lite ? 0.8 : 1.3);
  return R.toNormalMap(0.045, 1 / pxm, 1 / pym);
}

// ------------------------------------------------------------------------------------------- geometry
const UP = new THREE.Vector3(0, 1, 0);
function clean(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
// Box with chamfered arrises; the chamfers carry interpolated normals, so they read as softly worn edges.
export function chamferBox(w, h, d, e = 0.03) {
  const a = [w / 2, h / 2, d / 2];
  e = Math.min(e, a[0] * 0.45, a[1] * 0.45, a[2] * 0.45);
  const pos = [], nor = [];
  // point on face `ax` (sign s[ax]) near corner s
  const pt = (ax, s) => { const p = [0, 0, 0]; for (let i = 0; i < 3; i++) p[i] = s[i] * (i === ax ? a[i] : a[i] - e); return p; };
  const nm = (ax, s) => { const n = [0, 0, 0]; n[ax] = s[ax]; return n; };
  const tri = (A, B, C) => {
    const ux = B[0][0] - A[0][0], uy = B[0][1] - A[0][1], uz = B[0][2] - A[0][2], vx = C[0][0] - A[0][0], vy = C[0][1] - A[0][1], vz = C[0][2] - A[0][2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cx = A[0][0] + B[0][0] + C[0][0], cy = A[0][1] + B[0][1] + C[0][1], cz = A[0][2] + B[0][2] + C[0][2];
    const L = nx * cx + ny * cy + nz * cz < 0 ? [A, C, B] : [A, B, C];
    for (const [p, n] of L) { pos.push(...p); nor.push(...n); }
  };
  const quad = (A, B, C, D) => { tri(A, B, C); tri(A, C, D); };
  const S = [-1, 1];
  for (let ax = 0; ax < 3; ax++) for (const sa of S) {         // faces
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3, c = (s1, s2) => { const s = [0, 0, 0]; s[ax] = sa; s[o1] = s1; s[o2] = s2; return [pt(ax, s), nm(ax, s)]; };
    quad(c(-1, -1), c(1, -1), c(1, 1), c(-1, 1));
  }
  for (let ax = 0; ax < 3; ax++) {                               // edge chamfers between faces o1 and o2 (running along ax)
    const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
    for (const s1 of S) for (const s2 of S) {
      const mk = (f, sa) => { const s = [0, 0, 0]; s[ax] = sa; s[o1] = s1; s[o2] = s2; return [pt(f, s), nm(f, s)]; };
      quad(mk(o1, -1), mk(o1, 1), mk(o2, 1), mk(o2, -1));
    }
  }
  for (const sx of S) for (const sy of S) for (const sz of S) { const s = [sx, sy, sz]; tri([pt(0, s), nm(0, s)], [pt(1, s), nm(1, s)], [pt(2, s), nm(2, s)]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// Sweep a closed profile [[across, up], …] along a path given by points and horizontal "across" vectors.
// frames: [{ p: Vector3, a: Vector3 (across), u: Vector3 (up) }]
function sweep(profile, frames, { capEnds = false } = {}) {
  const np = profile.length, nf = frames.length, pos = [], idx = [];
  for (const f of frames) for (const [x, y] of profile) pos.push(f.p.x + f.a.x * x + f.u.x * y, f.p.y + f.a.y * x + f.u.y * y, f.p.z + f.a.z * x + f.u.z * y);
  for (let i = 0; i < nf - 1; i++) for (let j = 0; j < np; j++) {
    const a = i * np + j, b = i * np + (j + 1) % np, c = (i + 1) * np + j, d = (i + 1) * np + (j + 1) % np;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  // make sure the faces point outward: test one triangle against the profile centroid
  const f0 = frames[0], p = g.attributes.position, A = new THREE.Vector3().fromBufferAttribute(p, idx[0]), B = new THREE.Vector3().fromBufferAttribute(p, idx[1]), C = new THREE.Vector3().fromBufferAttribute(p, idx[2]);
  const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
  let cx = 0, cy = 0; for (const [x, y] of profile) { cx += x / np; cy += y / np; }
  const cen = f0.p.clone().addScaledVector(f0.a, cx).addScaledVector(f0.u, cy);
  if (n.dot(A.clone().sub(cen)) < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  if (!capEnds) return g;
  return g;
}
// Lens (biconvex) section of the vedika crossbars (suchi): w thick, h tall, n points
export function lensProfile(w, h, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; const c = Math.cos(t), s = Math.sin(t); out.push([w / 2 * s * (0.75 + 0.25 * Math.abs(c)), h / 2 * Math.sign(c) * Math.abs(c) ** 0.8]); }
  return out;
}
// Rounded coping (ushnisha): flat base, vertical sides, a half-round top
export function copingProfile(w, h, n = 8) {
  const out = [[-w / 2, 0], [-w / 2 + 0.001, 0], [w / 2 - 0.001, 0], [w / 2, 0], [w / 2, h - w / 2]];
  for (let i = 1; i < n; i++) { const t = i / n * Math.PI; out.push([w / 2 * Math.cos(t), h - w / 2 + w / 2 * Math.sin(t)]); }
  out.push([-w / 2, h - w / 2]);
  return out;
}
// along an arc of radius R (centre on the axis), angles a0 → a1, at height y
export function ringSweep(profile, R, a0, a1, y, segs) {
  const fr = [];
  for (let i = 0; i <= segs; i++) { const a = a0 + (a1 - a0) * i / segs, c = Math.cos(a), s = Math.sin(a); fr.push({ p: new THREE.Vector3(c * R, y, s * R), a: new THREE.Vector3(c, 0, s), u: UP }); }
  return sweep(profile, fr);
}
// along a straight line from A to B (Vector3, may slope); the profile stays vertical
export function lineSweep(profile, A, B, segs = 1) {
  const d = new THREE.Vector3().subVectors(B, A), h = new THREE.Vector3(d.x, 0, d.z).normalize(), across = new THREE.Vector3(h.z, 0, -h.x);
  const fr = []; for (let i = 0; i <= segs; i++) fr.push({ p: A.clone().addScaledVector(d, i / segs), a: across, u: UP });
  return sweep(profile, fr);
}

// ------------------------------------------------------------------------------------------- sculpture
// Simplified sculpture in the round from spheres, capsules and tubes; q scales the segment counts.
export class Sculpt {
  constructor(q = 1, sx = 1) { this.q = q; this.sx = sx; this.list = []; }
  seg(n, min = 4) { return Math.max(min, Math.round(n * this.q)); }
  v(p) { return new THREE.Vector3(p[0] * this.sx, p[1], p[2]); }
  push(g) { this.list.push(clean(g)); return this; }
  ell(c, r, rot = null, seg = 10) {
    const g = new THREE.SphereGeometry(1, this.seg(seg, 5), this.seg(seg * 0.7, 3));
    g.scale(r[0], r[1], r[2]); if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1] * this.sx, rot[2] * this.sx)));
    const p = this.v(c); g.translate(p.x, p.y, p.z); return this.push(g);
  }
  ball(c, r, seg = 10) { return this.ell(c, [r, r, r], null, seg); }
  cap(a, b, r, seg = 8) {
    const A = this.v(a), B = this.v(b), d = new THREE.Vector3().subVectors(B, A), L = d.length();
    const g = new THREE.CapsuleGeometry(r, Math.max(L, 1e-3), this.seg(3, 1), this.seg(seg, 4));
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return this.push(g);
  }
  cyl(a, b, r0, r1, seg = 8) {
    const A = this.v(a), B = this.v(b), d = new THREE.Vector3().subVectors(B, A), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, this.seg(seg, 4), 1, this.q < 0.5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); return this.push(g);
  }
  tube(pts, r, seg = 16, rad = 6) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => this.v(p)));
    return this.push(new THREE.TubeGeometry(curve, this.seg(seg, 3), r, this.seg(rad, 3), false));
  }
  box(c, s, e = 0.02) { const g = chamferBox(s[0], s[1], s[2], e); const p = this.v(c); g.translate(p.x, p.y, p.z); return this.push(g); }
  torus(c, R, r, rot = [0, 0, 0], seg = 20, arc = Math.PI * 2) {
    const g = new THREE.TorusGeometry(R, r, this.seg(6, 3), this.seg(seg, 6), arc);
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1] * this.sx, rot[2] * this.sx)));
    const p = this.v(c); g.translate(p.x, p.y, p.z); return this.push(g);
  }
  geometry() { return mergeGeometries(this.list); }
}

// All figures face +z, stand on y = 0, and are about 1 m tall at scale 1.
export function elephantGeo(q = 1, { rider = true } = {}) {
  const s = new Sculpt(q);
  s.ell([0, 0.62, -0.02], [0.31, 0.32, 0.46]);                        // body
  s.ell([0, 0.66, -0.3], [0.27, 0.27, 0.22]);                         // haunches
  s.ell([0, 0.78, 0.42], [0.21, 0.23, 0.2]);                          // head
  s.ell([0, 0.93, 0.44], [0.13, 0.1, 0.12]);                          // domed brow
  for (const x of [-1, 1]) {
    s.ell([x * 0.22, 0.78, 0.36], [0.05, 0.2, 0.16], [0, x * 0.35, 0], 8);   // ears
    s.cap([x * 0.07, 0.62, 0.55], [x * 0.11, 0.52, 0.72], 0.025, 5);  // tusks
    for (const z of [-0.3, 0.24]) s.cyl([x * 0.17, 0, z], [x * 0.17, 0.52, z], 0.095, 0.11, 8);   // legs
  }
  s.tube([[0, 0.72, 0.58], [0, 0.55, 0.68], [0, 0.32, 0.66], [0, 0.12, 0.72], [0, 0.06, 0.8]], 0.055, 12, 6);  // trunk
  s.cap([0, 0.66, -0.5], [0, 0.35, -0.58], 0.02, 4);                  // tail
  if (rider) {
    s.box([0, 0.94, -0.02], [0.5, 0.06, 0.5], 0.02);                  // caparison
    s.cap([0, 1.02, 0.22], [0, 1.22, 0.22], 0.075, 6);                // mahout
    s.ball([0, 1.34, 0.24], 0.07, 8);
    s.ell([0, 1.4, 0.24], [0.08, 0.04, 0.08], null, 8);
    for (const x of [-1, 1]) s.cap([x * 0.08, 1.04, 0.24], [x * 0.17, 0.92, 0.3], 0.035, 4);
    s.cap([0, 1.02, -0.14], [0, 1.18, -0.14], 0.07, 6); s.ball([0, 1.28, -0.14], 0.065, 8);   // rider
  }
  return s.geometry();
}
export function lionGeo(q = 1) {      // seated lion (the Ashokan type): forelegs straight, chest high, heavy mane
  const s = new Sculpt(q);
  s.ell([0, 0.27, -0.2], [0.21, 0.25, 0.25]);                         // haunches
  s.ell([0, 0.5, -0.04], [0.18, 0.3, 0.2], [-0.35, 0, 0]);            // body rising
  s.ell([0, 0.62, 0.12], [0.19, 0.24, 0.16]);                         // chest
  s.ell([0, 0.8, 0.1], [0.25, 0.26, 0.22]);                           // mane
  // the mane: locks spread over the crown, cheeks and shoulders (the face left clear)
  const locks = q >= 0.8 ? [[0.95, [-1.2, -0.4, 0.4, 1.2]], [0.35, [-1.5, -0.95, 0.95, 1.5]], [-0.25, [-1.6, -0.9, 0.9, 1.6]], [0.5, [-2.3, 2.3, 3.14]]]
    : [[0.9, [-0.8, 0.8]], [0.2, [-1.3, 1.3]], [-0.3, [-1.5, 1.5]]];
  for (const [el, azs] of locks) for (const az of azs) {
    const d = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
    s.ell([d[0] * 0.24, 0.8 + d[1] * 0.25, 0.1 + d[2] * 0.21], [0.075, 0.09, 0.075], [-el * 0.6, az, 0], 6);
  }
  s.ell([0, 0.81, 0.26], [0.13, 0.14, 0.12]);                         // face
  s.ell([0, 0.76, 0.36], [0.085, 0.07, 0.07], null, 8);               // muzzle
  s.ell([0, 0.69, 0.33], [0.065, 0.03, 0.05], null, 6);               // open jaw
  for (const x of [-1, 1]) {
    s.ball([x * 0.1, 0.97, 0.24], 0.04, 6);                           // ears
    s.ball([x * 0.05, 0.86, 0.36], 0.022, 5);                         // eyes
    s.cap([x * 0.1, 0.05, 0.25], [x * 0.1, 0.55, 0.16], 0.055, 6);    // forelegs
    s.ell([x * 0.1, 0.035, 0.29], [0.065, 0.035, 0.085], null, 6);    // fore paws
    s.ell([x * 0.17, 0.05, 0.0], [0.06, 0.05, 0.11], null, 6);        // hind paws
  }
  s.tube([[0.18, 0.08, -0.38], [0.24, 0.05, -0.1], [0.24, 0.08, 0.06]], 0.025, 6, 4);
  return s.geometry();
}
export function dwarfGeo(q = 1) {      // pot-bellied yaksha (gana), arms raised to carry the load
  const s = new Sculpt(q);
  for (const x of [-1, 1]) {
    s.cap([x * 0.13, 0.04, 0.06], [x * 0.16, 0.34, 0.02], 0.08, 6);
    s.ell([x * 0.13, 0.03, 0.12], [0.07, 0.035, 0.1], null, 6);
    s.cap([x * 0.2, 0.74, 0], [x * 0.3, 0.94, 0.02], 0.055, 6);
    s.cap([x * 0.3, 0.94, 0.02], [x * 0.2, 1.08, 0.02], 0.05, 6);
  }
  s.ell([0, 0.45, 0.06], [0.25, 0.25, 0.26]);                         // belly
  s.ell([0, 0.7, 0.0], [0.22, 0.17, 0.18]);                           // chest
  s.ball([0, 0.9, 0.04], 0.13, 10);
  s.ell([0, 1.0, 0.02], [0.15, 0.06, 0.14], null, 8);                 // turban
  return s.geometry();
}
export function horseGeo(q = 1, { rider = true } = {}) {
  const s = new Sculpt(q);
  s.ell([0, 0.52, 0], [0.15, 0.17, 0.36]);
  s.cap([0, 0.6, 0.25], [0, 0.84, 0.38], 0.08, 6);                    // neck
  s.cap([0, 0.86, 0.4], [0, 0.74, 0.55], 0.055, 6);                   // head
  for (const x of [-1, 1]) for (const z of [-0.25, 0.25]) s.cap([x * 0.08, 0.02, z], [x * 0.08, 0.42, z], 0.035, 5);
  s.tube([[0, 0.6, -0.34], [0, 0.45, -0.44], [0, 0.25, -0.46]], 0.03, 6, 4);
  if (rider) {
    s.cap([0, 0.72, 0], [0, 0.98, 0.02], 0.07, 6); s.ball([0, 1.1, 0.03], 0.07, 8);
    s.ell([0, 1.16, 0.03], [0.08, 0.035, 0.08], null, 6);
    for (const x of [-1, 1]) { s.cap([x * 0.1, 0.72, 0.04], [x * 0.14, 0.5, 0.1], 0.04, 4); s.cap([x * 0.09, 0.92, 0.02], [x * 0.12, 0.78, 0.18], 0.03, 4); }
  }
  return s.geometry();
}
// standing yaksha / yakshi (chauri bearer): one arm raised with the fly-whisk
export function humanGeo(q = 1, { female = false, arm = 1, sx = 1 } = {}) {
  const s = new Sculpt(q, sx);
  for (const x of [-1, 1]) { s.cap([x * 0.06, 0.03, 0.01], [x * 0.07, 0.46, 0], 0.045, 6); s.torus([x * 0.06, 0.06, 0.01], 0.05, 0.016, [Math.PI / 2, 0, 0], 8); }
  s.ell([0, 0.5, 0], [female ? 0.15 : 0.12, 0.1, 0.09]);               // hips, dhoti
  s.ell([0, 0.68, 0], [0.11, 0.15, 0.08]);                             // torso
  if (female) for (const x of [-1, 1]) s.ball([x * 0.05, 0.73, 0.06], 0.045, 6);
  s.ball([0, 0.89, 0.01], 0.075, 8);
  s.ell([0, 0.96, 0], [0.085, 0.055, 0.085], null, 8);                 // turban / headdress
  s.cap([0.1, 0.8, 0], [0.16, 0.6, 0.04], 0.03, 4);
  if (arm) { s.cap([-0.1, 0.8, 0], [-0.17, 0.96, 0.03], 0.03, 4); s.cap([-0.17, 0.96, 0.03], [-0.13, 1.1, 0.04], 0.028, 4); s.cyl([-0.13, 1.06, 0.05], [-0.1, 1.28, 0.06], 0.012, 0.012, 4); s.ell([-0.09, 1.32, 0.06], [0.04, 0.07, 0.04], null, 6); }
  else s.cap([-0.1, 0.8, 0], [-0.16, 0.6, 0.04], 0.03, 4);
  return s.geometry();
}
// shalabhanjika: the tree-nymph bracket — a yakshi in a triple-bent pose holding a mango branch, the tree's
// crown above her. Built upright (feet at the origin, ~1.25 m), leaning set by the caller. sx mirrors.
export function shalabhanjikaGeo(q = 1, sx = 1) {
  const s = new Sculpt(q, sx);
  // legs crossed at the ankles, hip thrust to one side
  s.cap([0.02, 0.02, 0.02], [0.07, 0.5, 0.0], 0.05, 6);
  s.cap([-0.05, 0.02, 0.04], [-0.02, 0.5, 0.0], 0.05, 6);
  for (const x of [0.02, -0.05]) s.torus([x, 0.07, 0.02], 0.055, 0.02, [Math.PI / 2, 0, 0], 8);   // anklets
  s.ell([0.05, 0.56, 0], [0.16, 0.11, 0.1]);                           // wide hips
  s.torus([0.05, 0.6, 0], 0.13, 0.022, [Math.PI / 2, 0, 0], 12);       // girdle (mekhala)
  s.ell([0.0, 0.76, 0.01], [0.1, 0.14, 0.075], [0, 0, 0.12]);          // waist and torso, swaying back
  for (const x of [-1, 1]) s.ball([x * 0.055 - 0.01, 0.82, 0.065], 0.05, 8);
  s.ball([-0.03, 0.99, 0.02], 0.075, 8);                                // head, tilted
  s.ell([-0.03, 1.06, 0.0], [0.085, 0.05, 0.08], null, 8);
  // raised arm gripping the branch, the other wrapped round the trunk
  s.cap([-0.09, 0.9, 0], [-0.17, 1.06, 0.02], 0.028, 5); s.cap([-0.17, 1.06, 0.02], [-0.1, 1.2, 0.0], 0.026, 5);
  s.cap([0.09, 0.9, 0], [0.16, 0.72, -0.04], 0.028, 5); s.cap([0.16, 0.72, -0.04], [0.08, 0.62, -0.09], 0.026, 5);
  // the tree: trunk behind her, the branch she holds, a crown of leaf clusters and mangoes
  s.tube([[0.12, 0.0, -0.12], [0.1, 0.5, -0.14], [0.02, 0.95, -0.12], [-0.05, 1.2, -0.06]], 0.045, 10, 6);
  s.tube([[-0.05, 1.2, -0.06], [-0.12, 1.24, 0.0], [-0.22, 1.22, 0.05]], 0.025, 6, 4);
  const r = rng(5);
  for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; s.ell([-0.04 + Math.cos(a) * 0.17, 1.3 + Math.sin(a) * 0.05 + r() * 0.05, -0.05 + Math.sin(a) * 0.12], [0.1, 0.07, 0.09], null, 6); }
  s.ell([-0.04, 1.34, -0.05], [0.18, 0.08, 0.14], null, 8);
  return s.geometry();
}
// triratna ("three jewels") emblem over each pillar: a disc below, the crescent arms curling outward and a
// central pointed prong; a carved slab ~1.1 m tall on a small lotus pedestal
export function triratnaGeo(q = 1) {
  const s = new Sculpt(q);
  s.box([0, 0.08, 0], [0.42, 0.16, 0.3], 0.02);
  s.cyl([0, 0.16, 0], [0, 0.26, 0], 0.15, 0.1, 10);
  s.torus([0, 0.42, 0], 0.15, 0.055, [0, 0, 0], 16);                  // the wheel below
  s.cyl([0, 0.42, -0.05], [0, 0.42, 0.05], 0.1, 0.1, 10);
  s.tube([[-0.36, 0.86], [-0.33, 0.7], [-0.2, 0.6], [0, 0.56], [0.2, 0.6], [0.33, 0.7], [0.36, 0.86]].map(([x, y]) => [x, y, 0]), 0.06, 18, 6);   // crescent
  for (const x of [-1, 1]) s.tube([[x * 0.36, 0.86, 0], [x * 0.42, 0.98, 0], [x * 0.5, 0.98, 0], [x * 0.5, 0.9, 0]], 0.045, 8, 5);              // curled tips
  s.cap([0, 0.56, 0], [0, 0.92, 0], 0.055, 6);
  s.ell([0, 1.0, 0], [0.09, 0.13, 0.06], null, 6);                    // pointed jewel
  return s.geometry();
}
// dharmachakra on its pedestal: rim with beaded edge, hub, 32 spokes (16 at lower q)
export function chakraGeo(q = 1) {
  const s = new Sculpt(q), R = 0.6, cy = 0.9;
  s.box([0, 0.11, 0], [0.62, 0.22, 0.45], 0.02);
  s.box([0, 0.28, 0], [0.24, 0.14, 0.2], 0.02);
  s.cyl([0, 0.34, 0], [0, cy - R + 0.05, 0], 0.07, 0.07, 8);
  s.torus([0, cy, 0], R, 0.06, [0, 0, 0], 40);
  s.torus([0, cy, 0], R * 0.82, 0.025, [0, 0, 0], 32);
  s.cyl([0, cy, -0.1], [0, cy, 0.1], 0.13, 0.13, 14);
  const ns = q >= 0.8 ? 32 : 16;
  for (let i = 0; i < ns; i++) { const a = i / ns * Math.PI * 2; s.cyl([Math.cos(a) * 0.12, cy + Math.sin(a) * 0.12, 0], [Math.cos(a) * (R - 0.04), cy + Math.sin(a) * (R - 0.04), 0], 0.018, 0.014, 4); }
  const nb = q >= 0.8 ? 24 : 12;
  for (let i = 0; i < nb; i++) { const a = (i + 0.5) / nb * Math.PI * 2; s.ball([Math.cos(a) * (R + 0.075), cy + Math.sin(a) * (R + 0.075), 0], 0.035, 6); }
  return s.geometry();
}
// the volute: a spiral ridge winding in to a central boss, on one face (z = 0 plane, facing +z)
export function spiralGeo(R, q = 1, sx = 1) {
  const s = new Sculpt(q, sx), pts = [], turns = 2.4, n = Math.round(56 * q);
  for (let i = 0; i <= n; i++) { const t = i / n, a = Math.PI / 2 - t * turns * Math.PI * 2, r = R * (1 - t * 0.86); pts.push([Math.cos(a) * r, Math.sin(a) * r, 0]); }
  s.tube(pts, R * 0.085, n, 5);
  s.ball([0, 0, 0], R * 0.2, 8);
  return s.geometry();
}
