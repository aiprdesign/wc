// THE DREAM OF FLIGHT — close-inspection detail shared by the aircraft (flight-craft.js):
//   · skin(): procedural object-space surface detail injected into a standard / physical material — panel
//     lines (optionally staggered and sheared to follow a swept spar), rivet rows as tiny domes, per-panel
//     tint / roughness variation, flow-wise streaks, paint chips, doped-fabric rib tapes and sag, fabric
//     over stringers, heat tint, and decals (IAF roundels, fin flash, registration letters) painted in the
//     shader so nothing floats off a curved skin. All of it is a function of the part's own position, so
//     there is no UV, no tiling and no swimming on moving parts. Relief goes into the normal through the
//     surface gradient of the height (Mikkelsen), the same way lib/surface.js does its micro-relief.
//   · glassMat(): canopy / cabin glazing that is see-through head-on and mirror-like at grazing angles.
//   · woodLam(): laminated propeller wood (walnut / ash plies show as contour bands on the curved blade).
//   · textures for instrument panels and registration letters; small reusable parts (turnbuckles,
//     wire-spoked wheels, seats, stylised pilots).
import * as THREE from 'three';
import { rng, lerp, TAU } from '../../lib/math.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { surfaceDetailTexture } from '../../lib/surface.js';
import { V3, bake, lathe, rod, tubeAlong } from './flight-assets.js';

const fl = (x) => { const s = String(+(+x).toPrecision(7)); return /[.e]/.test(s) ? s : s + '.0'; };
const lin = (hex) => { const c = new THREE.Color(hex); return `vec3(${fl(c.r)}, ${fl(c.g)}, ${fl(c.b)})`; };
const AX = ['x', 'y', 'z'];
const SAFF = lin('#ff9933'), WHITE = lin('#e6e6e2'), GREEN = lin('#138808');

const SK_PARS = /* glsl */ `
varying vec3 vSkP; varying vec3 vSkN;
float skHash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float skAA(float d, float w, float fw){ return 1.0 - smoothstep(w, w + fw, d); }
`;

// cfg: { panel: { s: [sx, sy, sz], lw, depth, stagger, tint, rough, grime, region: [xLo, xHi] },
//        shear: ['x', 'z', k] (q.x += |p.z|·k: lines follow a swept spar), rivet: { s, o, r, h },
//        noise: { rough, scale, streak, grime }, chip: { amt, scale, col, metal, rough },
//        fab: { mode: 'uv' | 'z', n | s, sag, tape, tw }, stringer: { xMax, n, yc, h, sag },
//        heat: [xFrom, xTo, amount], lines: [{ a: 'x', at, b: 'z', lo, hi, w, depth }],
//        decals: { rnd: [[x, y, z, R, axis, sign, tol]], flash: { x0, y0, y1, w, sk }, text: [{ U, V, u0, v0, w, h, sign, axis }] },
//        tex: Texture (for text decals) }
// lite (phones, AR, VR headsets): rivets stay (a few ALU ops; they are what a close look finds); the 3D-noise
// weathering and paint chips come from two fetches of the film's shared 256² detail map (lib/surface.js) instead
// of five simplex noises, projected along the part's dominant axis and stretched along the flow for streaks.
export function skin(mat, cfg = {}, lite = false) {
  const P = cfg.panel, Rv = cfg.rivet, N = cfg.noise, C = cfg.chip, F = cfg.fab, S = cfg.stringer, H = cfg.heat, D = cfg.decals ?? {};
  const DET = lite && (N || C);
  let b = `float skH = 0.0, skRo = 1.0, skChip = 0.0, decM = 0.0; vec3 skC = vec3(1.0), decC = vec3(0.0);
  {
  vec3 p = vSkP; vec3 n = normalize(vSkN); vec3 an = abs(n); float fw = max(length(fwidth(vSkP)), 1e-5);
  vec3 q = p; float L = 0.0, reg = 1.0; vec3 cid = vec3(0.0);
  ${DET ? 'vec2 skPU = an.x > an.y && an.x > an.z ? p.yz : (an.y > an.z ? p.zx : p.xy); float skFl = an.y > an.z ? p.z : p.y;' : ''}
  `;
  if (cfg.shear) { const [a, c, k] = cfg.shear; b += `q.${a} += abs(p.${c}) * ${fl(k)};\n`; }
  if (P?.region) { const [lo, hi] = P.region; b += `reg = smoothstep(${fl(lo - 0.015)}, ${fl(lo + 0.015)}, p.x) * (1.0 - smoothstep(${fl(hi - 0.015)}, ${fl(hi + 0.015)}, p.x));\n`; }
  const LW = P?.lw ?? 0.0035;
  const rivet = (a) => {
    if (!Rv) return '';
    const al = a === 'x' ? '(an.y > an.z ? q.z : q.y)' : 'q.x';
    return `{ float sa = (fract(${al} / ${fl(Rv.s)} + 0.5) - 0.5) * ${fl(Rv.s)};
      float dr = length(vec2(abs(ds - ${fl(Rv.o)}), sa));
      float rv = sqrt(max(0.0, 1.0 - dr * dr / ${fl(Rv.r * Rv.r)})) * wg * (1.0 - smoothstep(${fl(Rv.r)}, ${fl(Rv.r * 6)}, fw));
      skH += ${fl(Rv.h)} * rv; }`;
  };
  if (P) P.s.forEach((sp, i) => {
    if (!sp) return;
    const a = AX[i], j = AX[(i + 1) % 3], k = AX[(i + 2) % 3], st = P.stagger ?? 0;
    const sj = P.s[(i + 1) % 3] || 0.9, sk = P.s[(i + 2) % 3] || 0.9;
    b += `{ float qa = q.${a}${st ? ` + skHash(vec3(floor(q.${j} / ${fl(sj)}), floor(q.${k} / ${fl(sk)}), ${fl(i + 1)})) * ${fl(sp * st)}` : ''};
      float c = qa / ${fl(sp)}; float d = abs(fract(c + 0.5) - 0.5) * ${fl(sp)};
      float ds = d / sqrt(max(1.0 - an.${a} * an.${a}, 0.04));
      float wg = (1.0 - smoothstep(0.72, 0.93, an.${a})) * reg;
      float l = skAA(ds, ${fl(LW)}, fw) * wg * (1.0 - smoothstep(${fl(LW * 1.5)}, ${fl(LW * 9)}, fw));
      L = max(L, l); cid.${a} = floor(c);
      ${rivet(a)}
    }\n`;
  });
  // extra lines: hinge lines of control surfaces, doors, hatches. Line where p.a (|p.a| with absA) equals
  // at + sl·|p.b|, kept where p.c (|p.c| with symC) lies in [lo, hi]
  for (const l of cfg.lines ?? []) {
    const w = l.w ?? LW * 1.4, dp = l.depth ?? (P?.depth ?? 0.001) * 1.6;
    const A = l.absA ? `abs(p.${l.a})` : `p.${l.a}`, off = l.sl ? ` - ${fl(l.sl)} * abs(p.${l.b})` : '';
    const C = l.symC ? `abs(p.${l.c})` : `p.${l.c}`;
    const along = l.c ? `smoothstep(${fl(l.lo - 0.01)}, ${fl(l.lo + 0.01)}, ${C}) * (1.0 - smoothstep(${fl(l.hi - 0.01)}, ${fl(l.hi + 0.01)}, ${C}))` : '1.0';
    b += `{ float ds = abs(${A} - ${fl(l.at)}${off}) / sqrt(max(1.0 - an.${l.a} * an.${l.a}, 0.04));
      float m = skAA(ds, ${fl(w)}, fw) * ${along} * (1.0 - smoothstep(0.8, 0.95, an.${l.a})) * (1.0 - smoothstep(${fl(w * 1.5)}, ${fl(w * 12)}, fw));
      skH -= ${fl(dp)} * m; skC *= 1.0 - 0.45 * m; }\n`;
  }
  if (P) {
    b += `skH -= ${fl(P.depth ?? 0.001)} * L; skC *= 1.0 - ${fl(P.grime ?? 0.25)} * L;
      { float h1 = skHash(cid + 0.37), h2 = skHash(cid + 5.1);
        skC *= 1.0 + ${fl(P.tint ?? 0.04)} * (h1 - 0.5) * 2.0 * reg; skRo *= 1.0 + ${fl(P.rough ?? 0.12)} * (h2 - 0.5) * 2.0 * reg; }\n`;
  }
  if (N && lite) {
    const s = N.scale ?? 1.2;
    b += `{ vec4 d1 = texture2D(skDet, skPU * ${fl(s * 0.45)} + vec2(0.37, 0.11));
      vec4 d2 = texture2D(skDet, vec2(p.x * ${fl(s * 0.1)}, skFl * ${fl(s * 1.6)}) + vec2(0.13, 0.71));
      float n1 = (d1.g - 0.5) * 1.5 + (d1.r - 0.5) * 0.5;
      float st = (d2.g - 0.5) * 2.2;
      skRo *= 1.0 + ${fl(N.rough ?? 0.15)} * n1 + ${fl(N.streak ?? 0.12)} * st;
      skC *= 1.0 - ${fl(N.grime ?? 0.06)} * smoothstep(0.1, 0.9, st) - ${fl((N.grime ?? 0.06) * 0.5)} * n1; }\n`;
  }
  if (N && !lite) {
    const s = N.scale ?? 1.2;
    b += `{ float n1 = snoise(p * ${fl(s)}) * 0.6 + snoise(p * ${fl(s * 3.7)}) * 0.4;
      float st = snoise(vec3(p.x * ${fl(s * 0.35)}, p.y * ${fl(s * 6)}, p.z * ${fl(s * 6)}));
      skRo *= 1.0 + ${fl(N.rough ?? 0.15)} * n1 + ${fl(N.streak ?? 0.12)} * st;
      skC *= 1.0 - ${fl(N.grime ?? 0.06)} * smoothstep(0.1, 0.9, st) - ${fl((N.grime ?? 0.06) * 0.5)} * n1; }\n`;
  }
  if (C && lite) {
    const s = C.scale ?? 7;
    b += `{ float cn = (texture2D(skDet, skPU * ${fl(s * 0.06)} + vec2(0.71, 0.29)).r - 0.5) * 2.4;
      skChip = smoothstep(${fl(1 - (C.amt ?? 0.3))}, ${fl(1 - (C.amt ?? 0.3) + 0.05)}, cn + L * 0.5) * (1.0 - smoothstep(0.004, 0.03, fw));
      skH -= 0.00025 * skChip; }\n`;
  } else if (C) {
    const s = C.scale ?? 7;
    b += `{ float cn = snoise(p * ${fl(s)}) * 0.6 + snoise(p * ${fl(s * 3.3)}) * 0.4;
      skChip = smoothstep(${fl(1 - (C.amt ?? 0.3))}, ${fl(1 - (C.amt ?? 0.3) + 0.05)}, cn + L * 0.5) * (1.0 - smoothstep(0.004, 0.03, fw));
      skH -= 0.00025 * skChip; }\n`;
  }
  if (F) {
    if (F.mode === 'uv') {
      b += `{ float c = vMapUv.y * ${fl(F.n)}; float d = abs(fract(c + 0.5) - 0.5); float fwc = max(fwidth(c), 1e-4);
        float fade = 1.0 - smoothstep(0.12, 0.45, fwc);
        float tape = skAA(d, ${fl(F.tw ?? 0.05)}, fwc), sag = sin(3.14159 * fract(c));
        float stitch = tape * step(0.5, fract(vMapUv.x * ${fl(F.stitch ?? 160)})) * skAA(d, ${fl((F.tw ?? 0.05) * 0.35)}, fwc);
        skH += (${fl(F.tape ?? 0.0012)} * tape + 0.0003 * stitch - ${fl(F.sag ?? 0.004)} * sag * sag) * fade;
        skRo *= 1.0 - 0.15 * tape; }\n`;
    } else {
      b += `{ float c = p.z / ${fl(F.s)}; float d = abs(fract(c + 0.5) - 0.5) * ${fl(F.s)};
        float wg = smoothstep(0.45, 0.75, an.y), fade = 1.0 - smoothstep(0.02, 0.08, fw);
        float tape = skAA(d, ${fl(F.tw ?? 0.012)}, fw), sag = sin(3.14159 * fract(c));
        skH += (${fl(F.tape ?? 0.0008)} * tape - ${fl(F.sag ?? 0.0025)} * sag * sag) * wg * fade; skRo *= 1.0 - 0.1 * tape * wg; }\n`;
    }
  }
  if (S) {
    b += `{ vec2 qq = vec2(p.z, p.y - ${fl(S.yc ?? 0)}); float r = length(qq); float c = atan(qq.x, qq.y) / 6.28318 * ${fl(S.n)};
      float d = abs(fract(c + 0.5) - 0.5) * 6.28318 / ${fl(S.n)} * r;
      float rg = 1.0 - smoothstep(${fl(S.xMax - 0.05)}, ${fl(S.xMax + 0.05)}, p.x), fade = 1.0 - smoothstep(0.02, 0.08, fw);
      skH += (${fl(S.h ?? 0.0012)} * skAA(d, 0.008, fw) - ${fl(S.sag ?? 0.003)} * pow(sin(3.14159 * fract(c)), 2.0)) * rg * fade; }\n`;
  }
  if (H) {
    const [x0, x1, amt] = H;
    b += `{ float hz = 1.0 - smoothstep(${fl(Math.min(x0, x1))}, ${fl(Math.max(x0, x1))}, p.x);
      float band = 0.5 + 0.5 * sin(p.x * 11.0 + snoise(p * 2.3) * 2.5);
      vec3 hc = mix(vec3(0.95, 0.78, 0.5), vec3(0.5, 0.5, 0.78), band);
      skC *= mix(vec3(1.0), hc * 0.8, hz * ${fl(amt)}); skRo *= 1.0 + 0.35 * hz; }\n`;
  }
  for (const [x, y, z, R, ax, sg, tol = 0.25] of D.rnd ?? []) {
    const a = AX[ax], c = [x, y, z], o = [0, 1, 2].filter((i) => i !== ax);
    b += `{ vec2 d = vec2(p.${AX[o[0]]} - ${fl(c[o[0]])}, p.${AX[o[1]]} - ${fl(c[o[1]])}); float r = length(d);
      float m = skAA(r, ${fl(R)}, fw) * smoothstep(0.15, 0.35, n.${a} * ${fl(sg)}) * step(abs(p.${a} - ${fl(c[ax])}), ${fl(tol)});
      vec3 col = mix(${SAFF}, ${WHITE}, skAA(r, ${fl(R * 2 / 3)}, fw)); col = mix(col, ${GREEN}, skAA(r, ${fl(R / 3)}, fw));
      decC = mix(decC, col, m); decM = max(decM, m); }\n`;
  }
  if (D.flash) {
    const { x0, y0, y1, w, sk = 0 } = D.flash;
    b += `{ float u = (${fl(x0)} - (p.y - ${fl(y0)}) * ${fl(sk)} - p.x) / ${fl(w)};
      float m = smoothstep(-0.01, 0.01, u) * (1.0 - smoothstep(0.99, 1.01, u)) * step(${fl(y0)}, p.y) * step(p.y, ${fl(y1)}) * smoothstep(0.4, 0.6, an.z);
      vec3 col = u < 0.3333 ? ${SAFF} : (u < 0.6667 ? ${WHITE} : ${GREEN});
      decC = mix(decC, col, m); decM = max(decM, m); }\n`;
  }
  for (const t of D.text ?? []) {
    const U = t.U.map(fl).join(', '), Vv = t.V.map(fl).join(', ');
    b += `{ vec2 uv = vec2(dot(p, vec3(${U})) - ${fl(t.u0)}, dot(p, vec3(${Vv})) - ${fl(t.v0)}) / vec2(${fl(t.w)}, ${fl(t.h)});
      float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0) * smoothstep(0.3, 0.5, n.${AX[t.axis]} * ${fl(t.sign)});
      vec4 tx = texture2D(skTex, vec2(uv.x, uv.y));
      float m = tx.a * inside; decC = mix(decC, tx.rgb, m); decM = max(decM, m); }\n`;
  }
  b += '}\n';
  const chipCol = C ? lin(C.col ?? '#b9bec4') : 'vec3(0.0)';
  const key = 'flight-skin-' + JSON.stringify({ ...cfg, tex: undefined }) + (lite ? 'L' : '');
  const tex = cfg.tex;
  mat.onBeforeCompile = (sh) => {
    if (tex) sh.uniforms.skTex = { value: tex };
    if (DET) sh.uniforms.skDet = { value: surfaceDetailTexture() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkP; varying vec3 vSkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = position; vSkN = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_NOISE}\n${SK_PARS}\n${tex ? 'uniform sampler2D skTex;' : ''}${DET ? 'uniform sampler2D skDet;' : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${b}
        diffuseColor.rgb *= skC; diffuseColor.rgb = mix(diffuseColor.rgb, decC, decM); ${C ? `diffuseColor.rgb = mix(diffuseColor.rgb, ${chipCol}, skChip);` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * skRo, 0.03, 1.0); roughnessFactor = mix(roughnessFactor, ${fl(cfg.decalRough ?? 0.5)}, decM);
        ${C ? `roughnessFactor = mix(roughnessFactor, ${fl(C.rough ?? 0.35)}, skChip);` : ''}`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 0.0, decM); ${C ? `metalnessFactor = mix(metalnessFactor, ${fl(C.metal ?? 1)}, skChip);` : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
          float det = dot(sX, R1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(skH) * R1 + dFdy(skH) * R2);
          vec3 nb = abs(det) * normal - grad;
          if (dot(nb, nb) > 1e-20 && abs(det) > 1e-14) normal = normalize(nb);
        }`);
  };
  mat.customProgramCacheKey = () => key;
  // the film-wide micro detail (lib/surface.js) is replaced by this one: keep only its gentle cues
  mat.userData.detail = { albedo: 0.04, rough: 0.25, bump: 0.00002, scratch: 0.15, grime: 0.0, ...(cfg.detail ?? {}) };
  return mat;
}

// glazing: nearly clear head-on, a mirror toward grazing angles; reflections stay at full strength
export function glassMat({ tint = '#8ea4b4', base = 0.1, key = 'glass', gold = false, lumK = 0.35 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.03, metalness: 0, transparent: true, depthWrite: false, envMapIntensity: 1.8, specularIntensity: 1, specularColor: gold ? new THREE.Color('#ffd890') : new THREE.Color('#ffffff') });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      { float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 4.0);
        float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.a = clamp(${fl(base)} + fres * 0.85 + lum * ${fl(lumK)}, 0.0, 1.0); }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'flight-glass-' + key;
  m.userData.noDetail = true;
  return m;
}

// laminated propeller wood: plies stacked along the rotation axis (local X) show as contour bands on the
// twisted blade, long grain runs out along the blade, a brass sheath on the tips (beyond radius tipR)
export function woodLam(tipR = 10, { a = '#6a3a1c', b = '#a9743e', key = 'prop' } = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_NOISE}\nvarying vec3 vSkP; float wTip;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 p = vSkP; float r = length(p.yz);
          float ply = fract(p.x / 0.011 + 0.15 * snoise(vec3(r * 1.5, p.x * 20.0, 1.0)));
          float band = smoothstep(0.42, 0.5, ply) * (1.0 - smoothstep(0.92, 1.0, ply));
          float grain = snoise(vec3(p.x * 90.0, r * 2.2, atan(p.z, p.y) * 30.0)) * 0.5 + snoise(vec3(p.x * 300.0, r * 6.0, p.z * 300.0)) * 0.25;
          vec3 c = mix(${lin(a)}, ${lin(b)}, band) * (0.88 + 0.18 * grain);
          wTip = smoothstep(${fl(tipR - 0.004)}, ${fl(tipR + 0.004)}, r);
          diffuseColor.rgb = mix(c, ${lin('#c8a05a')}, wTip); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.28, wTip);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 1.0, wTip);');
  };
  m.customProgramCacheKey = () => 'flight-wood-' + key + tipR;
  return m;
}

// ------------------------------------------------------------------ textures
// registration letters (dark, on transparent), sampled by skin() text decals
export function letterTexture(text, { color = '#1e1612', w = 1024, h = 160, weight = 700, font = 'Arial Narrow, Arial, sans-serif', spacing = 0.06 } = {}) {
  const c = mkCanvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.fillStyle = color; g.textBaseline = 'middle';
  let size = h * 0.9; g.font = `${weight} ${size}px ${font}`;
  const chars = [...text], adv = (s) => chars.reduce((acc, ch) => acc + g.measureText(ch).width, 0) + spacing * s * (chars.length - 1);
  while (adv(size) > w * 0.96 && size > 10) { size *= 0.95; g.font = `${weight} ${size}px ${font}`; }
  // stretch horizontally to fill (1930s registration letters are tall and evenly spaced)
  const total = adv(size), sx = (w * 0.96) / total;
  g.save(); g.translate(w * 0.02, h / 2); g.scale(sx, 1);
  let x = 0; for (const ch of chars) { g.fillText(ch, x, 0); x += g.measureText(ch).width + spacing * size; }
  g.restore();
  const t = toTexture(c, { anisotropy: 8 }); t.flipY = true;
  return t;
}
// an instrument panel: 'wood' (1911 / 1932: dials on a varnished board), 'jet' (black, dials and warning
// lights), 'glass' (Tejas: three colour multifunction displays)
export function panelTexture(kind = 'wood', seed = 3) {
  const W = 512, H = 256, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(seed);
  if (kind === 'wood') {
    g.fillStyle = '#5a321a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${30 + R() * 30},${14 + R() * 12},6,${0.15 + R() * 0.2})`; g.lineWidth = 1 + R() * 2; g.beginPath(); const y0 = R() * H; for (let x = 0; x <= W; x += 16) g.lineTo(x, y0 + Math.sin(x * 0.01 + i) * 6); g.stroke(); }
  } else { g.fillStyle = '#16181b'; g.fillRect(0, 0, W, H); }
  const dial = (x, y, r) => {
    g.fillStyle = kind === 'wood' ? '#2a2a28' : '#3a3d40'; g.beginPath(); g.arc(x, y, r + 5, 0, TAU); g.fill();
    g.fillStyle = kind === 'wood' ? '#b89a5a' : '#555a60'; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.fill();
    g.fillStyle = kind === 'wood' ? '#efe6d0' : '#0b0c0e'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = kind === 'wood' ? '#1a1612' : '#e8e8e0'; g.lineWidth = 1.5;
    for (let k = 0; k <= 20; k++) { const a = Math.PI * 0.75 + k / 20 * Math.PI * 1.5, l = k % 5 ? 0.12 : 0.24; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.lineTo(x + Math.cos(a) * r * (0.92 - l), y + Math.sin(a) * r * (0.92 - l)); g.stroke(); }
    const a = Math.PI * 0.75 + R() * Math.PI * 1.5; g.strokeStyle = kind === 'wood' ? '#101010' : '#f2f2ea'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); g.stroke();
    g.fillStyle = '#888'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill();
  };
  if (kind === 'glass') {
    for (const [x, w] of [[24, 140], [186, 140], [348, 140]]) {
      g.fillStyle = '#050607'; g.fillRect(x - 6, 40, w + 12, 160);
      const gr = g.createLinearGradient(0, 46, 0, 194); gr.addColorStop(0, '#1d3f6a'); gr.addColorStop(0.5, '#3a6ea0'); gr.addColorStop(0.52, '#6a4a2a'); gr.addColorStop(1, '#3a2814');
      g.fillStyle = x === 186 ? gr : '#06140c'; g.fillRect(x, 46, w, 148);
      g.strokeStyle = x === 186 ? '#f4f4e8' : '#38e070'; g.lineWidth = 2;
      if (x !== 186) { g.strokeRect(x + 12, 60, w - 24, 50); g.beginPath(); g.arc(x + w / 2, 150, 30, 0, TAU); g.stroke(); for (let k = 0; k < 6; k++) g.fillRect(x + 10 + k * 22, 180, 14, 4); }
      else { g.beginPath(); g.moveTo(x + 20, 120); g.lineTo(x + w - 20, 120); g.stroke(); g.strokeRect(x + w / 2 - 14, 110, 28, 20); }
      g.fillStyle = '#2a2c30'; for (let k = 0; k < 5; k++) { g.fillRect(x + 8 + k * 27, 26, 18, 9); g.fillRect(x + 8 + k * 27, 206, 18, 9); }
    }
    for (let i = 0; i < 6; i++) { g.fillStyle = ['#d23a2a', '#e6a020', '#38c060'][i % 3]; g.fillRect(40 + i * 72, 228, 30, 12); }
  } else {
    const n = kind === 'wood' ? [[90, 128, 54], [230, 110, 44], [360, 128, 54], [460, 80, 28], [460, 180, 28]] : [[70, 80, 40], [170, 80, 40], [270, 80, 40], [370, 80, 40], [70, 180, 34], [170, 180, 34], [270, 180, 34], [370, 180, 34], [460, 130, 28]];
    for (const [x, y, r] of n) dial(x, y, r);
    if (kind === 'jet') for (let i = 0; i < 8; i++) { g.fillStyle = ['#c83020', '#e8a020', '#30a050', '#e8e0d0'][i % 4]; g.fillRect(440 + (i % 2) * 30, 20 + Math.floor(i / 2) * 20, 22, 12); }
    g.fillStyle = kind === 'wood' ? '#c8a860' : '#888'; for (const [x, y] of [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
  }
  return toTexture(c, { anisotropy: 8 });
}

// ------------------------------------------------------------------ small parts
// a rigging-wire turnbuckle at `a` along unit direction `dir`: barrel, threaded ends, eyes
export function turnbuckle(a, dir, s = 1) {
  const g = lathe([[0.0015, -0.06], [0.004, -0.058], [0.004, -0.032], [0.0065, -0.03], [0.0072, -0.02], [0.0072, 0.02], [0.0065, 0.03], [0.004, 0.032], [0.004, 0.058], [0.0015, 0.06]].map(([r, y]) => [r * s, y * s]), 6);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir);
  g.applyQuaternion(q); g.translate(a.x, a.y, a.z);
  return g;
}
// a wire eye / shackle at point p, ring axis perpendicular to dir
export function eye(p, dir, r = 0.008, t = 0.0022) {
  const g = new THREE.TorusGeometry(r, t, 3, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), V3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).normalize());
  g.applyQuaternion(q); g.translate(p.x, p.y, p.z);
  return g;
}
// a wire-spoked wheel (axle along Z) — returns { tyre, rim, hub, spokes } geometries
export function spokedWheel(c, R, tube, { spokes = 24, hubR = 0.045, hubW = 0.1, seg = 32, lite = false } = {}) {
  const tyre = bake(new THREE.TorusGeometry(R - tube, tube, lite ? 6 : 10, lite ? 20 : seg), [c.x, c.y, c.z]);
  const rimR = R - tube * 1.7;
  const rim = bake(lathe([[rimR - 0.004, -0.022], [rimR + 0.006, -0.026], [rimR + 0.002, -0.012], [rimR, 0], [rimR + 0.002, 0.012], [rimR + 0.006, 0.026], [rimR - 0.004, 0.022]], lite ? 18 : seg), [c.x, c.y, c.z], [Math.PI / 2, 0, 0]);
  const hub = [bake(lathe([[0.012, -hubW / 2 - 0.02], [hubR * 0.5, -hubW / 2 - 0.02], [hubR, -hubW / 2], [hubR, -hubW / 2 + 0.008], [hubR * 0.55, -hubW / 2 + 0.014], [hubR * 0.5, 0], [hubR * 0.55, hubW / 2 - 0.014], [hubR, hubW / 2 - 0.008], [hubR, hubW / 2], [hubR * 0.5, hubW / 2 + 0.02], [0.012, hubW / 2 + 0.02]], 14), [c.x, c.y, c.z], [Math.PI / 2, 0, 0])];
  const sp = [];
  const n = lite ? Math.round(spokes / 2) : spokes;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU, side = k % 2 ? 1 : -1, tang = (k % 4 < 2 ? 1 : -1) * 0.18;
    const p0 = V3(c.x + Math.cos(a + tang) * hubR * 0.9, c.y + Math.sin(a + tang) * hubR * 0.9, c.z + side * (hubW / 2 - 0.004));
    const p1 = V3(c.x + Math.cos(a) * (rimR - 0.004), c.y + Math.sin(a) * (rimR - 0.004), c.z + side * 0.004);
    sp.push(rod(p0, p1, 0.0018, 3));
  }
  return { tyre, rim, hub, spokes: sp };
}
// a seated pilot facing +X, hip at h; kind '1911' (cap worn back to front, goggles), '1932' (leather
// helmet, goggles up), 'jet' (bone-dome, visor, mask). hands: [left, right] target points (or null).
// Returns { suit, skin, head, dark, glass } geometry lists.
export function pilot(h, kind = 'jet', { hands = null, lean = 0.1, lite = false } = {}) {
  const out = { suit: [], skin: [], head: [], dark: [], glass: [] };
  const s = lite ? 6 : 10;
  const P = (x, y, z) => V3(h.x + x, h.y + y, h.z + z);
  const limb = (a, b, r0, r1, list) => { list.push(rod(a, b, r0, s, r1)); list.push(bake(new THREE.SphereGeometry(r0, s, Math.max(4, s / 2)), [b.x, b.y, b.z])); };
  // torso (a squashed tapered capsule), shoulders
  const top = P(-lean, 0.55, 0);
  out.suit.push(bake(lathe([[0.001, -0.02], [0.15, 0.0], [0.17, 0.12], [0.16, 0.3], [0.18, 0.44], [0.12, 0.54], [0.06, 0.58], [0.001, 0.6]], s + 2), [h.x, h.y, h.z], [0, 0, lean], [0.8, 1, 1.15]));
  for (const sd of [1, -1]) {
    const hip = P(0.02, 0.04, sd * 0.1), knee = P(0.44, 0.1, sd * 0.13), foot = P(0.62, -0.32, sd * 0.14);
    limb(hip, knee, 0.075, 0.06, out.suit); limb(knee, foot, 0.058, 0.045, out.suit);
    out.dark.push(bake(new THREE.BoxGeometry(0.2, 0.07, 0.09), [foot.x + 0.06, foot.y - 0.03, foot.z]));
    const sh = P(-lean + 0.02, 0.47, sd * 0.19), tgt = hands ? hands[sd > 0 ? 0 : 1] : P(0.42, 0.22, sd * 0.16);
    const el = sh.clone().lerp(tgt, 0.5).add(V3(-0.04, -0.12, sd * 0.05));
    limb(sh, el, 0.055, 0.048, out.suit); limb(el, tgt, 0.046, 0.036, out.suit);
    (kind === 'jet' ? out.dark : out.skin).push(bake(new THREE.SphereGeometry(0.042, s, s / 2), [tgt.x, tgt.y, tgt.z], [0, 0, 0], [1.2, 0.8, 1]));
  }
  // head
  const hc = P(-lean * 1.1 + 0.02, 0.72, 0);
  if (kind === 'jet') {
    out.head.push(bake(new THREE.SphereGeometry(0.135, s + 4, s), [hc.x, hc.y + 0.01, hc.z], [0, 0, 0], [1.08, 1.02, 0.98]));
    out.glass.push(bake(new THREE.SphereGeometry(0.142, s + 4, s, -Math.PI * 0.32, Math.PI * 0.64, Math.PI * 0.32, Math.PI * 0.26), [hc.x, hc.y + 0.01, hc.z], [0, Math.PI / 2, 0]));
    out.dark.push(bake(lathe([[0.001, 0], [0.05, 0.01], [0.055, 0.06], [0.03, 0.1]], s), [hc.x + 0.1, hc.y - 0.06, hc.z], [0, 0, -Math.PI / 2 + 0.5]));
    out.dark.push(tubeAlong(new THREE.CatmullRomCurve3([V3(hc.x + 0.16, hc.y - 0.1, hc.z), V3(hc.x + 0.1, hc.y - 0.3, hc.z + 0.06), V3(hc.x + 0.02, hc.y - 0.42, hc.z + 0.12)]), () => 0.014, 8, 5));
  } else {
    out.skin.push(bake(new THREE.SphereGeometry(0.11, s + 2, s), [hc.x, hc.y, hc.z], [0, 0, 0], [1.05, 1.15, 0.95]));
    out.skin.push(bake(new THREE.SphereGeometry(0.02, 6, 4), [hc.x + 0.105, hc.y - 0.01, hc.z]));
    if (kind === '1911') {
      out.head.push(bake(new THREE.SphereGeometry(0.118, s + 2, s, 0, TAU, 0, Math.PI * 0.5), [hc.x, hc.y + 0.02, hc.z], [0, 0, 0], [1.05, 0.7, 0.98]));
      out.head.push(bake(new THREE.CylinderGeometry(0.1, 0.1, 0.01, s + 2, 1, false, Math.PI * 0.5, Math.PI), [hc.x - 0.07, hc.y + 0.03, hc.z], [0, 0, 0.2], [1.2, 1, 1]));   // peak worn at the back
    } else {
      out.head.push(bake(new THREE.SphereGeometry(0.12, s + 2, s, 0, TAU, 0, Math.PI * 0.62), [hc.x - 0.005, hc.y + 0.01, hc.z], [0, 0, 0.15], [1.05, 1.08, 1.0]));
      for (const sd of [1, -1]) out.head.push(bake(new THREE.SphereGeometry(0.045, 8, 6), [hc.x - 0.01, hc.y - 0.04, hc.z + sd * 0.1], [0, 0, 0], [1, 1.3, 0.5]));
    }
    // goggles: on the eyes (1911) or pushed up on the brow (1932)
    const gy = kind === '1911' ? hc.y + 0.015 : hc.y + 0.085, gx = kind === '1911' ? hc.x + 0.09 : hc.x + 0.07;
    for (const sd of [1, -1]) {
      out.dark.push(bake(new THREE.TorusGeometry(0.03, 0.009, 5, 12), [gx, gy, hc.z + sd * 0.045], [0, Math.PI / 2, 0]));
      out.glass.push(bake(new THREE.CircleGeometry(0.028, 12), [gx + 0.006, gy, hc.z + sd * 0.045], [0, Math.PI / 2, 0]));
    }
    out.dark.push(bake(new THREE.TorusGeometry(0.115, 0.007, 4, 20, Math.PI * 1.1), [hc.x - 0.01, gy, hc.z], [Math.PI / 2, 0, -Math.PI * 0.55 + Math.PI], [1, 1, 1]));
    // collar / scarf
    out.suit.push(bake(new THREE.TorusGeometry(0.075, 0.03, 6, 14), [hc.x - 0.01, hc.y - 0.15, hc.z], [Math.PI / 2, 0.15, 0]));
  }
  return out;
}
// an ejection seat facing +X, its seat pan centre at p: bucket, tall back, head box, drogue container,
// firing handles (striped yellow/black), harness. Returns { frame, cushion, stripe, belt }.
export function ejectionSeat(p, { h = 1.05, w = 0.5, lite = false } = {}) {
  const o = { frame: [], cushion: [], stripe: [], belt: [] };
  const B = (sx, sy, sz, x, y, z, rz = 0, list = o.frame) => list.push(bake(new THREE.BoxGeometry(sx, sy, sz), [p.x + x, p.y + y, p.z + z], [0, 0, rz]));
  B(0.42, 0.06, w, 0.02, 0, 0);                                   // pan
  B(0.36, 0.06, w - 0.08, 0.03, 0.05, 0, 0, o.cushion);
  for (const sd of [1, -1]) { B(0.44, 0.24, 0.035, 0.02, 0.08, sd * w / 2); B(0.08, h, 0.05, -0.2, h / 2, sd * (w / 2 - 0.02), 0.12); }   // sides, rails
  B(0.07, h * 0.78, w - 0.06, -0.19, h * 0.42, 0, 0.12); B(0.06, h * 0.62, w - 0.14, -0.15, h * 0.4, 0, 0.12, o.cushion);
  B(0.24, 0.22, w * 0.78, -0.28, h * 0.98, 0, 0.12);              // head box / drogue container
  B(0.08, 0.16, w * 0.6, -0.15, h * 0.92, 0, 0.12, o.cushion);    // head pad
  // face-blind handle over the head box and the seat-pan handle between the knees
  o.stripe.push(bake(new THREE.TorusGeometry(0.1, 0.012, 5, 12, Math.PI), [p.x - 0.18, p.y + h * 1.08, p.z], [0, Math.PI / 2, 0]));
  o.stripe.push(bake(new THREE.TorusGeometry(0.045, 0.01, 5, 10, Math.PI), [p.x + 0.24, p.y + 0.04, p.z], [0, Math.PI / 2, -0.4]));
  if (!lite) for (const sd of [1, -1]) {
    o.belt.push(rod(V3(p.x - 0.16, p.y + h * 0.7, p.z + sd * 0.1), V3(p.x + 0.02, p.y + 0.35, p.z + sd * 0.07), 0.018, 4));
    o.belt.push(rod(V3(p.x - 0.1, p.y + 0.08, p.z + sd * 0.2), V3(p.x + 0.04, p.y + 0.3, p.z + sd * 0.05), 0.016, 4));
  }
  return o;
}
