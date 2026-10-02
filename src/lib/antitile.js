// ANTI-TILING: a repeated texture on a big surface (floors, ground, backdrops, fabric) shows its grid
// — the same blotch every metre, in rows. noTile() is texture bombing (after Inigo Quilez's
// "texture repetition" technique 3): a smooth noise picks, per region, one of eight random offsets
// into the texture and blends between neighbouring choices, so the pattern never lines up; sampled
// with the true derivatives, so mipmapping stays clean. A faint broad variation in brightness hides
// the last trace of a period. Cost: two texture fetches instead of one.
import * as THREE from 'three';

export const NOTILE_GLSL = /* glsl */ `
float atHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float atNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(atHash(i), atHash(i + vec2(1.0, 0.0)), f.x), mix(atHash(i + vec2(0.0, 1.0)), atHash(i + vec2(1.0, 1.0)), f.x), f.y); }
vec4 noTile(sampler2D s, vec2 uv){
  float k = atNoise(uv * 0.45) * 8.0, f = fract(k), ia = floor(k), ib = ia + 1.0;
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec4 a = textureGrad(s, uv + sin(vec2(3.0, 7.0) * ia), dx, dy);
  vec4 b = textureGrad(s, uv + sin(vec2(3.0, 7.0) * ib), dx, dy);
  vec3 d = a.rgb - b.rgb;
  return mix(a, b, smoothstep(0.2, 0.8, f - 0.1 * (d.x + d.y + d.z)));
}`;

// Patch one MeshStandard/Physical material (idempotent; chains any existing onBeforeCompile).
export function antiTile(m) {
  if (!m || !m.isMeshStandardMaterial || m.userData.atDone) return false;
  m.userData.atDone = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  const baseKey = () => { const cur = m.onBeforeCompile; m.onBeforeCompile = prev; try { return prevKey.call(m); } finally { m.onBeforeCompile = cur; } };
  m.onBeforeCompile = function (sh, r) {
    prev?.call(this, sh, r);
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOTILE_GLSL}`);
    f = f.replace('#include <map_fragment>', `#ifdef USE_MAP
      vec4 sampledDiffuseColor = noTile(map, vMapUv);
      diffuseColor *= sampledDiffuseColor;
      diffuseColor.rgb *= 0.92 + 0.16 * atNoise(vMapUv * 0.13 + 3.7);
    #endif`);
    f = f.replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
    #ifdef USE_ROUGHNESSMAP
      roughnessFactor *= noTile(roughnessMap, vRoughnessMapUv).g;
    #endif`);
    f = f.replace('#include <emissivemap_fragment>', `#ifdef USE_EMISSIVEMAP
      totalEmissiveRadiance *= noTile(emissiveMap, vEmissiveMapUv).rgb;
    #endif`);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => baseKey() + '|at1';
  m.needsUpdate = true;
  return true;
}

// Every lit material whose colour map repeats over a large area, or over a big surface.
export function antiTileScene(root) {
  const box = new THREE.Box3(), size = new THREE.Vector3();
  let n = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.userData.batch) return;   // merged small parts (lib/batch.js) were never big surfaces
    for (const m of [o.material].flat()) {
      const t = m?.map;
      if (!m?.isMeshStandardMaterial || !t || t.wrapS !== THREE.RepeatWrapping || m.userData.noAntiTile) continue;
      const reps = Math.abs(t.repeat.x * t.repeat.y);
      if (reps < 4) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getSize(size);
        if (Math.max(size.x, size.z) < 6) continue;
      }
      if (antiTile(m)) n++;
    }
  });
  return n;
}
