// Surface realism: every lit (standard / physical) material in the film gets procedural
// micro-surface detail, so nothing reads as uniform CG plastic:
//   · roughness variation — smudges, polish and wear (the biggest single cue that a surface is real)
//   · albedo variation     — faint mottling and grime, never a perfectly flat colour
//   · micro-normal detail  — pores / grain / hammering as a bump, scattering the highlight
//   · scratches            — fine directional wear on metals
// One small tileable noise texture (cached, shared) is sampled tri-planar in the object's own
// space (scaled to world size, so it never swims on moving parts and needs no UVs). The family of
// each material (metal / polished / matte) sets how strong each cue is. Cost: six fetches of a
// 256² texture per lit pixel, the same at every quality level. Opt out with
// `material.userData.noDetail = true`; tune with `material.userData.detail = { albedo, rough, bump, scratch }`.
import * as THREE from 'three';

let detailTex = null;
// Tileable value noise, several octaves per channel. R: grain / pores (fine), G: smudges and
// grime (medium blotches), B: broad weathering, A: scratches (thin random strokes).
function makeDetailTexture(N = 256) {
  let seed = 90127;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lattice = (cells) => { const g = new Float32Array(cells * cells); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const octave = (cells) => {
    const g = lattice(cells), out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / N * cells, fy = y / N * cells, ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells];
      const c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
      out[y * N + x] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }
    return out;
  };
  const fbm = (cellsList, weights) => {
    const acc = new Float32Array(N * N); let ws = 0;
    cellsList.forEach((c, k) => { const o = octave(c); for (let i = 0; i < acc.length; i++) acc[i] += o[i] * weights[k]; ws += weights[k]; });
    for (let i = 0; i < acc.length; i++) acc[i] /= ws;
    return acc;
  };
  const stretch = (a, gain) => { let m = 0; for (const v of a) m += v; m /= a.length; for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, 0.5 + (a[i] - m) * gain)); return a; };
  const R = stretch(fbm([128, 64, 32, 16], [0.35, 0.3, 0.2, 0.15]), 2.6);
  const G = stretch(fbm([16, 8, 4], [0.3, 0.4, 0.3]), 2.4);
  const B = stretch(fbm([8, 4, 2], [0.3, 0.4, 0.3]), 2.2);
  const A = new Float32Array(N * N);
  // scratches: short, faint, mostly parallel strokes with a few strays (wrapped, so they tile)
  for (let s = 0; s < 420; s++) {
    const x0 = rnd() * N, y0 = rnd() * N, stray = rnd() < 0.25;
    const ang = stray ? rnd() * Math.PI : 0.12 + (rnd() - 0.5) * 0.25, len = 8 + rnd() * 60, w = 0.25 + rnd() * 0.55;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let t = 0; t < len; t += 0.5) {
      const px = Math.floor(x0 + dx * t + N) % N, py = Math.floor(y0 + dy * t + N) % N;
      A[py * N + px] = Math.max(A[py * N + px], w * (1 - Math.abs(t / len * 2 - 1) * 0.6));
    }
  }
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = R[i] * 255; data[i * 4 + 1] = G[i] * 255; data[i * 4 + 2] = B[i] * 255; data[i * 4 + 3] = A[i] * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
export function surfaceDetailTexture() { return (detailTex ??= makeDetailTexture()); }

// Family presets: albedo variation, relative roughness variation, bump height (world units, the
// scenes are authored in metres), scratch strength and grime. Shared uniforms (one set per family),
// so the whole film can be tuned at once: SURFACE.metal.value.set(…).
const FAMILY = {
  metal:    { albedo: 0.16, rough: 1.0, bump: 0.00003, scratch: 0.8, grime: 0.25 },
  polished: { albedo: 0.12, rough: 0.7, bump: 0.00002, scratch: 0.25, grime: 0.18 },
  matte:    { albedo: 0.22, rough: 0.35, bump: 0.0007, scratch: 0.0, grime: 0.28 },
};
// per set: a = (albedo, rough, bump, scratch), g = grime, k = pattern scale (1 = the metre-based default;
// larger = finer, for parts modelled larger than life)
const uni = (p) => ({ a: { value: new THREE.Vector4(p.albedo, p.rough, p.bump, p.scratch) }, g: { value: p.grime }, k: { value: p.scale ?? 1 } });
export const SURFACE = Object.fromEntries(Object.entries(FAMILY).map(([k, p]) => [k, uni(p)]));
export const SURFACE_SCALE = { value: new THREE.Vector2(2.8, 0.33) };   // cycles per metre: fine (~35 cm tile), broad (~3 m)
export function familyOf(m) {
  if (m.metalness >= 0.5) return 'metal';
  return m.roughness < 0.42 ? 'polished' : 'matte';
}


const VERT_PARS = /* glsl */ `
varying vec3 vSdP; varying vec3 vSdN;`;
const VERT_MAIN = /* glsl */ `
  {
    vec4 sdp = vec4(transformed, 1.0); vec3 sdn = objectNormal;
    #ifdef USE_BATCHING
      sdp = batchingMatrix * sdp; sdn = mat3(batchingMatrix) * sdn;
    #endif
    #ifdef USE_INSTANCING
      sdp = instanceMatrix * sdp; sdn = mat3(instanceMatrix) * sdn;
    #endif
    // object space scaled to world size: the pattern is glued to the part, at a physical scale
    float sds = pow(max(length(modelMatrix[0].xyz) * length(modelMatrix[1].xyz) * length(modelMatrix[2].xyz), 1e-12), 1.0 / 3.0);
    vSdP = sdp.xyz * sds; vSdN = sdn;
  }`;
const FRAG_PARS = /* glsl */ `
uniform sampler2D tSurfDetail; uniform vec4 uSd; uniform float uSdGrime, uSdK; uniform vec2 uSdScale;
varying vec3 vSdP; varying vec3 vSdN;
vec4 sdTri(vec3 p, vec3 w){
  return texture2D(tSurfDetail, p.yz) * w.x + texture2D(tSurfDetail, p.zx + vec2(0.37, 0.61)) * w.y + texture2D(tSurfDetail, p.xy + vec2(0.71, 0.13)) * w.z;
}`;

function inject(sh, u) {
  sh.uniforms.tSurfDetail = { value: surfaceDetailTexture() };
  sh.uniforms.uSd = u.a; sh.uniforms.uSdGrime = u.g; sh.uniforms.uSdK = u.k; sh.uniforms.uSdScale = SURFACE_SCALE;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>${VERT_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>${VERT_MAIN}`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>${FRAG_PARS}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 sdW = abs(vSdN); sdW = sdW * sdW; sdW *= sdW; sdW /= max(dot(sdW, vec3(1.0)), 1e-5);
  vec4 sdF = sdTri(vSdP * (uSdScale.x * uSdK), sdW);       // fine: ~35 cm tile (grain, scratches)
  vec4 sdB = sdTri(vSdP * (uSdScale.y * uSdK), sdW);       // broad: ~3 m tile (smudges, weathering)
  float sdSmudge = sdB.g * 0.65 + sdF.g * 0.35;
  float sdGrime = smoothstep(0.5, 0.9, sdB.b * 0.55 + sdB.g * 0.45);
  diffuseColor.rgb *= 1.0 + uSd.x * ((sdSmudge - 0.5) * 1.3 + (sdF.r - 0.5) * 0.7);
  diffuseColor.rgb *= 1.0 - uSdGrime * sdGrime;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor *= 1.0 + uSd.y * ((sdSmudge - 0.5) * 1.5 + (sdF.r - 0.5) * 0.35);
  roughnessFactor += uSd.w * sdF.a * 0.22;
  roughnessFactor = clamp(roughnessFactor, 0.02, 1.0);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    // micro-relief as a bump (Mikkelsen's surface gradient, unnormalised: slopes are physical)
    float sdH = (sdF.r - 0.5) * uSd.z - sdF.a * (uSd.z * uSd.w * 0.6);
    vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
    vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
    float det = dot(sX, R1) * faceDirection;
    vec3 grad = sign(det) * (dFdx(sdH) * R1 + dFdy(sdH) * R2);
    vec3 nb = abs(det) * normal - grad;
    if (dot(nb, nb) > 1e-20 && abs(det) > 1e-14) normal = normalize(nb);
  }`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  #ifdef USE_CLEARCOAT
    material.clearcoatRoughness = clamp(material.clearcoatRoughness * (0.7 + 0.6 * sdSmudge) + sdF.a * 0.08, 0.02, 1.0);
  #endif`);
}

// Physically plausible parameters (a material is a metal or it is not; albedos live between
// charcoal and fresh snow). Partial metalness is what makes CG read as plastic: a grey dielectric
// with a tinted, half-strength mirror on top. Metals become fully metallic (keeping their
// specular colour, lifted to a real metal's minimum reflectance); dielectrics lose the fake
// metal and keep their diffuse brightness. Maps and vertex colours are left alone.
const lumOf = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
export function physicalize(m) {
  if (!m?.isMeshStandardMaterial || m.userData?.noPhys || m.userData?.physDone) return;
  m.userData.physDone = true;
  const plain = !m.map && !m.vertexColors;
  const L0 = lumOf(m.color);
  // near-black, near-mirror "metal" is a stand-in for dark glass (windows, visors, lenses): a
  // dielectric reflects 4 %, a metal can't be that dark
  const glassy = plain && m.metalness > 0 && L0 < 0.012 && m.roughness < 0.16;
  if (glassy) {
    m.metalness = 0;
    return;
  }
  if (m.metalness >= 0.5 && m.metalness < 1) {
    m.metalness = 1;
  } else if (m.metalness > 0 && m.metalness < 0.5) {
    // keep the diffuse energy it had: colour · (1 − metalness)
    m.color.multiplyScalar(Math.max(0.35, 1 - m.metalness));
    m.metalness = 0;
  }
  const L = lumOf(m.color);
  if (m.metalness >= 1) {
    const MIN_F0 = 0.16;   // darkest real metals (weathered iron, gunmetal) reflect ~50%; keep some of the look's darkness
    if (plain && L > 1e-5 && L < MIN_F0) m.color.multiplyScalar(MIN_F0 / L);
  } else if (plain && L > 1e-5) {
    if (L < 0.02) m.color.multiplyScalar(0.02 / L);          // charcoal, soot, black paint ≈ 2–4 %
    else if (L > 0.85) m.color.multiplyScalar(0.85 / L);     // nothing but fresh snow is whiter
  }
}

// Apply to one material (idempotent). Chains any onBeforeCompile the scene already installed.
export function addSurfaceDetail(m) {
  if (!m || m.userData?.sdDone || m.userData?.noDetail) return false;
  if (!(m.isMeshStandardMaterial)) return false;          // physical is a subclass
  if (m.wireframe) return false;
  // glass and glows keep their clean look (additive, see-through without depth, or transmissive);
  // materials that merely fade in (transparent, opacity animated, depth-writing) are surfaces
  if (m.blending === THREE.AdditiveBlending || (m.transparent && !m.depthWrite) || m.transmission > 0) return false;
  if (m.transparent && m.opacity < 0.9 && m.opacity > 0.001) return false;
  const fam = familyOf(m);
  const u = m.userData?.detail ? uni({ ...FAMILY[fam], ...m.userData.detail }) : SURFACE[fam];
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  // the default cache key is the onBeforeCompile source: evaluate the old key against the old hook
  const baseKey = () => { const cur = m.onBeforeCompile; m.onBeforeCompile = prev; try { return prevKey.call(m); } finally { m.onBeforeCompile = cur; } };
  m.onBeforeCompile = function (sh, r) { prev?.call(this, sh, r); inject(sh, u); };
  const tag = '|sd1';
  m.customProgramCacheKey = () => baseKey() + tag;
  m.userData.sdDone = true;
  m.needsUpdate = true;
  return true;
}

export function addSurfaceDetailToScene(root, { phys = true } = {}) {
  const seen = new Set();
  root.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || o.isSprite) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      if (!o.geometry?.attributes?.normal) continue;
      if (phys) physicalize(m);
      addSurfaceDetail(m);
    }
  });
  return seen.size;
}
