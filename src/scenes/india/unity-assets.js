// THE STATUE OF UNITY — the site for src/scenes/india/unity.js (build time only). Units: metres, y up.
// The statue stands at the origin on Sadhu Bet, a rocky island in the Narmada, and faces +z: east, up
// the river, towards the Sardar Sarovar Dam (here at z = DAM_Z, nearer than its true 3.2 km so that it
// shares a frame with the statue). The river flows from the dam towards −z.
//   · the valley: a displaced grid, dense round the island and along the camera's path, with the river's
//     rocky banks and green forested hills (Satpura to the south, Vindhya to the north), shaded
//     procedurally in world space: canopy and clumps, grass and laterite clearings, basalt on the steep
//     faces, silt and wet rock at the water's edge — no texture, so no period
//   · the river: blue-green, with the sky and the dark hills in its reflection, the shallows paler
//   · the pedestal: a broad plaza on the island, the memorial hall, two battered tiers and the plinth with
//     its cornice, stone-clad (procedural ashlar, joints anti-aliased with fwidth, rain streaks)
//   · the dam: a concrete gravity wall across the gorge, the spillway's piers, radial gates and road deck
//   · the bridge to the bank, trees, visitors on the plaza for scale; the Statue of Liberty silhouette
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, smoothstep, lerp } from '../../lib/math.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { GLSL_NOISE } from '../../lib/noise.js';

export const SITE = {
  SCALE: 100,          // figure metres → statue metres (182 m)
  FEET_Y: 70,          // top of the plinth: 58 m of base on a 12 m island
  PLAZA_Y: 16,
  DAM_Z: 2400, CREST_Y: 140, RES_Y: 124,
};

// ---------------------------------------------------------------------------------------------- the valley
export const riverX = (z) => 40 * Math.sin(z / 820 + 0.3) + 26 * Math.sin(z / 330 + 1.2);
export const riverHW = (z) => 235 + 55 * Math.sin(z / 650 + 2.0) - 45 * smoothstep(1500, 2350, z);
export const RIVER_GLSL = /* glsl */ `
float riverX(float z){ return 40.0 * sin(z / 820.0 + 0.3) + 26.0 * sin(z / 330.0 + 1.2); }
float riverHW(float z){ return 235.0 + 55.0 * sin(z / 650.0 + 2.0) - 45.0 * smoothstep(1500.0, 2350.0, z); }
float islandD(vec2 p){ return length(vec2(p.x / 150.0, (p.y + 8.0) / 118.0)); }`;

export function groundH(x, z) {
  const xr = riverX(z), a = Math.abs(x - xr), hw = riverHW(z);
  const n1 = fbm2(x * 0.00055 + 3.1, z * 0.00055 - 1.7, 4);
  const n2 = fbm2(x * 0.0024, z * 0.0024, 3);
  const r = 1 - Math.abs(noise2(x * 0.0011 + 7, z * 0.0011));
  const gorge = 140 * Math.exp(-(((z - SITE.DAM_Z) / 1500) ** 2)) * smoothstep(hw + 30, hw + 560, a);
  // (round the island the valley opens a little: the plain of Ekta Nagar, the hills stepping back)
  const open = 1 - 0.5 * Math.exp(-((z / 1100) ** 2));
  const hills = (200 + 170 * n1 + 110 * r * r) * smoothstep(hw + 60, hw + 1000, a) * open + 28 * n2 * smoothstep(hw - 20, hw + 400, a) + gorge;
  const land = 9 + 24 * smoothstep(hw, hw + 260, a) + hills + 3 * fbm2(x * 0.012, z * 0.012, 2);
  const bed = -7 + 3 * smoothstep(0, hw, a);
  let h = lerp(bed, land, smoothstep(hw - 25, hw + 45, a));
  const di = Math.hypot(x / 150, (z + 8) / 118) + 0.07 * noise2(x * 0.02, z * 0.02);
  if (di < 1.35) {
    const isl = 13.5 - 21 * smoothstep(0.62, 1.15, di) + 1.6 * fbm2(x * 0.03, z * 0.03, 2) * smoothstep(0.45, 0.8, di);
    h = Math.max(h, isl);
  }
  return h;
}

export function buildTerrain(lite) {
  const N = lite ? 110 : 150, X = 8500, Z0 = -7000, Z1 = 9000, ZC = 500;
  const warp = (u) => Math.sign(u) * Math.pow(Math.abs(u), 2.1);
  const pos = new Float32Array((N + 1) * (N + 1) * 3), idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
    const x = warp(u) * X, z = ZC + warp(v) * (v < 0 ? ZC - Z0 : Z1 - ZC);
    const k = (j * (N + 1) + i) * 3;
    pos[k] = x; pos[k + 1] = groundH(x, z); pos[k + 2] = z;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

// common chunk: world position / normal varyings for the onBeforeCompile shaders below
function worldVaryings(sh) {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN;\n${GLSL_NOISE}
float uHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`);
}
const flags = (m) => { m.userData.noDetail = true; m.userData.noBatch = true; m.userData.noAntiTile = true; return m; };


// soft shadows of the cumulus drifting over the valley (the same wind as the sky's clouds)
export const CLOUD_SHADOW_GLSL = /* glsl */ `
float cloudShadow(vec2 p, float t){
  float c = snoise(vec3(p * 0.00045 + vec2(t * 0.012, t * 0.004), 2.0)) * 0.65 + snoise(vec3(p * 0.0012 + vec2(t * 0.02, 0.0), 5.0)) * 0.35;
  return 1.0 - 0.42 * smoothstep(0.12, 0.5, c);
}`;

export function terrainMaterial(U) {
  const m = flags(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 }));
  m.onBeforeCompile = (sh) => {
    worldVaryings(sh);
    sh.uniforms.uTime = U.uTime;
    sh.fragmentShader = sh.fragmentShader.replace('varying vec3 vWP; varying vec3 vWN;', `varying vec3 vWP; varying vec3 vWN; uniform float uTime;`)
      .replace('float uHash(vec2 p)', `${CLOUD_SHADOW_GLSL}\nfloat uHash(vec2 p)`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 tN = normalize(vWN); float slope = 1.0 - tN.y, hY = vWP.y;
      float dist = length(vWP - cameraPosition), near = 1.0 - smoothstep(250.0, 1600.0, dist);
      float crown = snoise(vWP * 0.12) * 0.5 + 0.5, clump = snoise(vWP * 0.019 + 3.0) * 0.5 + 0.5, patchN = snoise(vWP * 0.0024 + 9.0) * 0.5 + 0.5;
      vec3 tc = mix(vec3(0.024, 0.056, 0.018), vec3(0.075, 0.16, 0.042), smoothstep(0.2, 0.85, clump));
      tc = mix(tc, vec3(0.13, 0.23, 0.06), smoothstep(0.55, 0.95, crown) * (0.25 + 0.5 * near));
      tc = mix(tc, tc * vec3(1.25, 1.1, 0.75), smoothstep(0.55, 0.8, patchN) * 0.6);
      float grass = smoothstep(0.62, 0.78, snoise(vWP * 0.0037 + 2.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.12, 0.3, slope));
      tc = mix(tc, vec3(0.13, 0.21, 0.055), grass * 0.75);
      float earth = smoothstep(0.8, 0.9, snoise(vWP * 0.0045 + 5.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.2, 0.4, slope));
      tc = mix(tc, vec3(0.23, 0.13, 0.07), earth * 0.55);
      float rock = smoothstep(0.38, 0.62, slope + 0.16 * snoise(vWP * 0.03));
      vec3 rockC = mix(vec3(0.12, 0.11, 0.1), vec3(0.27, 0.25, 0.21), snoise(vWP * 0.07) * 0.5 + 0.5);
      tc = mix(tc, rockC, rock);
      float shore = 1.0 - smoothstep(4.0, 10.0, hY + 3.5 * snoise(vWP * 0.02));
      vec3 shoreC = mix(vec3(0.17, 0.15, 0.13), vec3(0.4, 0.35, 0.27), smoothstep(-0.2, 0.6, snoise(vWP * 0.05)));
      tc = mix(tc, shoreC, shore);
      tc *= mix(0.5, 1.0, smoothstep(-0.5, 1.6, hY));
      diffuseColor.rgb = tc * cloudShadow(vWP.xz, uTime);
      float tRough = mix(0.92, 0.35, 1.0 - smoothstep(-0.5, 1.2, hY));`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { // canopy relief: the crowns and clumps catch the sun
        float e = 1.5, b0 = snoise(vWP * 0.12), bx = snoise((vWP + vec3(e, 0.0, 0.0)) * 0.12), bz = snoise((vWP + vec3(0.0, 0.0, e)) * 0.12);
        float c0 = snoise(vWP * 0.019 + 3.0), cx = snoise((vWP + vec3(e * 4.0, 0.0, 0.0)) * 0.019 + 3.0), cz = snoise((vWP + vec3(0.0, 0.0, e * 4.0)) * 0.019 + 3.0);
        vec3 gW = vec3(b0 - bx, 0.0, b0 - bz) * (0.7 * near) * (1.0 - rock) + vec3(c0 - cx, 0.0, c0 - cz) * 0.6;
        normal = normalize(normal + (viewMatrix * vec4(gW, 0.0)).xyz);
      }`);
  };
  m.customProgramCacheKey = () => 'unityTerrain';
  return m;
}

// ---------------------------------------------------------------------------------------------- sky & water
export const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir, uZenith, uHorizon, uSunCol, uGround; uniform float uTime;
vec3 skyCol(vec3 d, float clouds){
  float h = d.y;
  vec3 c = mix(uHorizon, uZenith, pow(max(h, 0.0), 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 6.0) * 0.18 + pow(s, 60.0) * 0.45);
  if (clouds > 0.0) {
    vec2 cp = d.xz / max(h + 0.06, 0.05);
    float cl = snoise(vec3(cp * 0.9 + vec2(uTime * 0.01, 0.0), 1.0)) * 0.55 + snoise(vec3(cp * 2.3, 4.0)) * 0.3 + snoise(vec3(cp * 6.1, 7.0)) * 0.15;
    float cov = smoothstep(0.18, 0.62, cl) * smoothstep(0.015, 0.1, h) * (1.0 - smoothstep(0.45, 0.85, h));
    float lit = 0.55 + 0.45 * smoothstep(0.2, 0.9, cl) + 0.6 * pow(s, 3.0);
    vec3 cc = mix(vec3(0.62, 0.66, 0.74), vec3(1.15, 1.1, 1.02), lit * 0.75) * 1.25;
    c = mix(c, cc, cov * 0.9 * clouds);
    c += uSunCol * smoothstep(0.99955, 0.99985, s) * 40.0 * clouds;
  }
  return mix(c, uGround, smoothstep(0.0, -0.1, h));
}`;

export function skyMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}\n${SKY_GLSL}\nvarying vec3 vDir; void main(){ gl_FragColor = vec4(skyCol(normalize(vDir), 1.0), 1.0); }`,
  });
}

export function waterMaterial(U) {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  Object.assign(uniforms, U);
  return new THREE.ShaderMaterial({
    uniforms, fog: true,
    vertexShader: /* glsl */ `#include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `#include <common>
      #include <fog_pars_fragment>
      ${GLSL_NOISE}\n${SKY_GLSL}\n${RIVER_GLSL}\n${CLOUD_SHADOW_GLSL}
      uniform float uRes; varying vec3 vW;
      // ripples drifting downstream (−z), three octaves at different angles so no direction bands
      float wav(vec2 p){ p.y += uTime * 5.0;
        vec2 q = mat2(0.8, 0.6, -0.6, 0.8) * p, r = mat2(0.5, -0.87, 0.87, 0.5) * p;
        return snoise(vec3(p * vec2(0.022, 0.015), uTime * 0.2)) * 0.45 + snoise(vec3(q * 0.075 + 7.0, uTime * 0.45)) * 0.32 + snoise(vec3(r * 0.24, uTime * 0.8)) * 0.23; }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float dist = length(vW - cameraPosition);
        // the finite difference spans the pixel's footprint: ripples finer than a pixel average out (no sparkle)
        float fp = length(fwidth(vW.xz));
        float e = clamp(fp * 1.5, 0.6, 60.0), amp = 0.9;
        float n0 = wav(vW.xz), nx = wav(vW.xz + vec2(e, 0.0)), nz = wav(vW.xz + vec2(0.0, e));
        vec3 N = normalize(vec3(-(nx - n0) / e * amp, 1.0, -(nz - n0) / e * amp));
        vec3 R = reflect(V, N); R.y = abs(R.y);
        vec3 refl = skyCol(normalize(R), 0.6);
        // the hills stand above the horizon all round the valley: low reflections show their dark green
        float az = atan(R.x, R.z);
        float hill = 0.035 + 0.06 * (0.5 + 0.5 * sin(az * 3.0 + 1.0)) + 0.03 * sin(az * 7.0);
        refl = mix(refl, vec3(0.035, 0.065, 0.04) + uHorizon * 0.08, 1.0 - smoothstep(hill - 0.02, hill + 0.02, R.y));
        refl *= vec3(0.72, 0.84, 0.88);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        // body colour: deep blue-green, paler and siltier in the shallows by the banks and the island
        float a = abs(vW.x - riverX(vW.z)), hw = riverHW(vW.z);
        float shallow = max(smoothstep(hw - 70.0, hw + 5.0, a), 1.0 - smoothstep(0.95, 1.3, islandD(vW.xz)));
        if (uRes > 0.5) shallow = 0.0;
        vec3 body = mix(vec3(0.01, 0.07, 0.075), vec3(0.05, 0.11, 0.075), shallow);
        body *= 0.7 + 0.6 * max(dot(uSunDir, vec3(0.0, 1.0, 0.0)), 0.0);
        float csh = cloudShadow(vW.xz, uTime);
        vec3 col = mix(body * csh, refl, fres);
        float s = max(dot(normalize(R), uSunDir), 0.0);
        col += uSunCol * (pow(s, mix(900.0, 120.0, clamp(dist / 3000.0, 0.0, 1.0))) * 14.0 + pow(s, 30.0) * 0.08) * (csh * 1.7 - 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- stone & concrete
// Ashlar in world space: courses `ch` high, blocks `bl` long, staggered; per-block tone; joints drawn
// with fwidth so they fade instead of shimmering far away; rain streaks under every ledge.
export function stoneMaterial({ color = '#b8aa98', ch = 1.6, bl = 3.4, streak = 0.5, rough = 0.78, key = 'stone' } = {}) {
  const m = flags(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 }));
  m.onBeforeCompile = (sh) => {
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 sN = abs(normalize(vWN));
      float sJ = 0.0, sTone = 0.0;
      if (sN.y > 0.75) {
        vec2 g = vWP.xz / vec2(${(bl * 0.8).toFixed(2)}, ${(bl * 0.8).toFixed(2)});
        vec2 f = abs(fract(g) - 0.5) * 2.0, w = fwidth(g) * 1.3;
        sJ = max(smoothstep(1.0 - w.x - 0.025, 1.0, f.x), smoothstep(1.0 - w.y - 0.025, 1.0, f.y)) * (1.0 - smoothstep(0.15, 0.45, max(w.x, w.y)));
        sTone = uHash(floor(g));
      } else {
        float u = sN.x > sN.z ? vWP.z : vWP.x;
        float row = floor(vWP.y / ${ch.toFixed(2)});
        vec2 g = vec2(u / ${bl.toFixed(2)} + 0.5 * mod(row, 2.0), vWP.y / ${ch.toFixed(2)});
        vec2 f = abs(fract(g) - 0.5) * 2.0, w = fwidth(g) * 1.3;
        sJ = max(smoothstep(1.0 - w.x - 0.03, 1.0, f.x), smoothstep(1.0 - w.y - 0.05, 1.0, f.y)) * (1.0 - smoothstep(0.15, 0.45, max(w.x, w.y)));
        sTone = uHash(vec2(floor(g.x), row));
        float st = smoothstep(0.35, 0.9, snoise(vec3(u * 0.35, vWP.y * 0.025, 0.0)) * 0.5 + 0.5);
        diffuseColor.rgb *= 1.0 - ${streak.toFixed(2)} * 0.45 * st * (0.6 + 0.4 * snoise(vec3(u * 2.0, vWP.y * 0.3, 3.0)));
      }
      diffuseColor.rgb *= (0.86 + 0.24 * sTone) * (1.0 - 0.42 * sJ) * (0.9 + 0.2 * snoise(vWP * 0.02));
      diffuseColor.rgb *= 0.8 + 0.2 * smoothstep(${SITE.PLAZA_Y.toFixed(1)}, ${(SITE.PLAZA_Y + 6).toFixed(1)}, vWP.y);
      float sRough = ${rough.toFixed(2)} + 0.12 * sJ + 0.08 * (sTone - 0.5);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sRough;');
  };
  m.customProgramCacheKey = () => 'unity-' + key;
  return m;
}

// ---------------------------------------------------------------------------------------------- the pedestal
// Rounded-rectangle bands: each band joins two levels [halfW, halfD, y, r] and has its own vertices
// (crisp edges between bands, smooth round the corners).
function ring(hw, hd, r, cz, cs) {
  const pts = [];
  const C = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let c = 0; c < 4; c++) {
    const [sx, sz] = C[c], a0 = [0, Math.PI / 2, Math.PI, Math.PI * 1.5][c];
    for (let i = 0; i <= cs; i++) {
      const a = a0 + (i / cs) * Math.PI / 2;
      pts.push([sx * (hw - r) + Math.cos(a) * r, cz + sz * (hd - r) + Math.sin(a) * r]);
    }
  }
  return pts;
}
export function loft(levels, { cz = 0, cs = 6, cap = true } = {}) {
  const geos = [];
  for (let l = 0; l < levels.length - 1; l++) {
    const [w0, d0, y0, r0] = levels[l], [w1, d1, y1, r1] = levels[l + 1];
    const A = ring(w0, d0, r0, cz, cs), B = ring(w1, d1, r1, cz, cs), n = A.length, P = [];
    for (let i = 0; i < n; i++) P.push(A[i][0], y0, A[i][1]);
    for (let i = 0; i < n; i++) P.push(B[i][0], y1, B[i][1]);
    const I = [];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; I.push(i, n + i, j, j, n + i, n + j); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    g.computeVertexNormals(); geos.push(g.toNonIndexed());
  }
  if (cap) {
    const [w, d, y, r] = levels[levels.length - 1], R = ring(w, d, r, cz, cs), P = [0, y, cz];
    for (const p of R) P.push(p[0], y, p[1]);
    const I = []; for (let i = 0; i < R.length; i++) I.push(0, 1 + ((i + 1) % R.length), 1 + i);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    g.computeVertexNormals(); geos.push(g.toNonIndexed());
  }
  for (const g of geos) { g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals(); }
  return mergeGeometries(geos);
}

export function buildPedestal(lite) {
  const cs = lite ? 3 : 6, F = SITE.FEET_Y, P = SITE.PLAZA_Y;
  const parts = { stone: [], pale: [], dark: [] };
  // the plaza: a broad deck on the island with a parapet
  parts.pale.push(loft([[96, 86, 4, 26], [96, 86, P - 0.6, 26], [97, 87, P - 0.3, 26.5], [97, 87, P, 26.5]], { cz: 4, cs }));
  parts.stone.push(loft([[97, 87, P, 26.5], [97, 87, P + 1.3, 26.5], [96.4, 86.4, P + 1.3, 26]], { cz: 4, cs, cap: false }));
  // the memorial hall: battered walls with a base course and a crowning band
  parts.stone.push(loft([[58, 52, P, 10], [58, 52, P + 1.2, 10], [56.5, 50.5, P + 1.6, 9.5], [54, 48, P + 15, 8], [55.2, 49.2, P + 15.6, 8.5], [55.2, 49.2, P + 17.4, 8.5], [53.5, 47.5, P + 18, 8]], { cz: 6, cs }));
  // the two tiers above it
  parts.stone.push(loft([[44, 41, P + 18, 7], [42, 39, P + 30, 6], [43, 40, P + 30.6, 6.5], [43, 40, P + 31.8, 6.5], [41, 38, P + 32.2, 6]], { cz: 7, cs }));
  // the plinth, slightly tapered, with its cornice
  parts.pale.push(loft([[30, 36, P + 32.2, 5], [30, 36, P + 33.4, 5], [28.5, 34.5, P + 34, 4.5], [26, 32, F - 4.2, 3.5], [27, 33, F - 3.6, 4], [27, 33, F - 2.6, 4], [28.6, 34.6, F - 1.5, 4.6], [28.6, 34.6, F - 0.6, 4.6], [28, 34, F, 4.4]], { cz: 9, cs }));
  // railings round the terraces and the plaza: a top rail, a mid rail and posts
  const railing = (hw, hd, r, y, cz, step) => {
    parts.dark.push(loft([[hw, hd, y + 1.0, r], [hw, hd, y + 1.15, r]], { cz, cs, cap: false }));
    parts.dark.push(loft([[hw, hd, y + 0.5, r], [hw, hd, y + 0.58, r]], { cz, cs, cap: false }));
    const R = ring(hw, hd, r, cz, cs);
    let acc = 0;
    for (let i = 0; i < R.length; i++) {
      const [x0, z0] = R[i], [x1, z1] = R[(i + 1) % R.length], L = Math.hypot(x1 - x0, z1 - z0);
      for (let d = step - acc; d < L; d += step) { const u = d / L; parts.dark.push(new THREE.BoxGeometry(0.16, 1.15, 0.16).translate(x0 + (x1 - x0) * u, y + 0.575, z0 + (z1 - z0) * u)); }
      acc = (acc + L) % step;
    }
  };
  railing(96.6, 86.6, 26.2, P + 1.3, 4, lite ? 9 : 4.5);
  railing(53, 47, 7.8, P + 18, 6, lite ? 8 : 4);
  railing(40.5, 37.5, 5.8, P + 32.2, 7, lite ? 8 : 4);
  // the gallery entrance and steps on the front (east) side, and windows of the hall as dark recesses
  const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  for (let k = 0; k < 10; k++) parts.pale.push(box(-16 + k * 0.4, 16 - k * 0.4, P, P + 0.35 * (k + 1), 58 + 1.4 * (9 - k), 58 + 1.4 * (10 - k) + 0.01));
  for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const x = -40 + i * 10;
    parts.dark.push(box(x - 2.6, x + 2.6, P + 4, P + 12.5, side > 0 ? 6 + 51.1 : 6 - 51.1 - 0.6, side > 0 ? 6 + 51.7 : 6 - 51.1).translate(0, 0, 0));
  }
  for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
    const z = 6 - 35 + i * 10;
    parts.dark.push(box(side > 0 ? 56.1 : -56.7, side > 0 ? 56.7 : -56.1, P + 4, P + 12.5, z - 2.6, z + 2.6));
  }
  const prep = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; };
  return Object.fromEntries(Object.entries(parts).map(([k, l]) => [k, mergeGeometries(l.map(prep))]));
}

// ---------------------------------------------------------------------------------------------- the dam
export function buildDam(lite) {
  const Z = SITE.DAM_Z, Y = SITE.CREST_Y, xr = riverX(Z), hw = riverHW(Z), L = hw + 820, SP = 230;
  const concrete = [], steel = [];
  // non-overflow blocks: vertical upstream face, crest road, a 0.78:1 downstream face
  const prof = (top) => { const s = new THREE.Shape(); s.moveTo(Z + 4, -12); s.lineTo(Z + 4, top + 1.6); s.lineTo(Z - 9, top + 1.6); s.lineTo(Z - 9, top - 6); s.lineTo(Z - 9 - 0.78 * (top + 6), -12); s.lineTo(Z + 4, -12); return s; };
  const ext = (shape, x0, x1) => { const g = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: 4 }); g.rotateY(Math.PI / 2); g.translate(x0, 0, 0); return g; };
  // (the shape is drawn in (z, y): ExtrudeGeometry's x → rotated onto −z; so map with a custom extrude)
  const wall = (x0, x1, top) => {
    const s = prof(top), pts = s.getPoints(4).map((p) => [p.x, p.y]);
    const P = [], I = [];
    const n = pts.length;
    for (const x of [x0, x1]) for (const [z, y] of pts) P.push(x, y, z);
    for (let i = 0; i < n - 1; i++) { const a = i, b = i + 1, c = n + i, d = n + i + 1; I.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I);
    const o = g.toNonIndexed(); o.computeVertexNormals(); return o;
  };
  void ext;
  concrete.push(wall(xr - L, xr - SP, Y), wall(xr + SP, xr + L, Y));
  // the spillway: an ogee crest at 121 m, piers to the deck, radial gates between them
  const OG = 121;
  concrete.push(wall(xr - SP, xr + SP, OG - 1.6));
  const NP = lite ? 16 : 31, pitch = (2 * SP) / (NP - 1);
  const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  for (let i = 0; i < NP; i++) {
    const x = xr - SP + i * pitch;
    concrete.push(box(x - 2.2, x + 2.2, OG - 30, Y + 1.6, Z - 22, Z + 6));
    if (i < NP - 1) {
      const g = new THREE.CylinderGeometry(20, 20, pitch - 4.6, lite ? 6 : 10, 1, true, -0.55, 0.85).rotateZ(Math.PI / 2).translate(x + pitch / 2, OG + 2, Z - 6 - 20 + 0.1);
      steel.push(g);
    }
  }
  concrete.push(box(xr - SP, xr + SP, Y - 1.2, Y + 1.6, Z - 10, Z + 4));
  // parapets and lamp posts along the crest road
  concrete.push(box(xr - L, xr + L, Y + 1.6, Y + 2.8, Z + 3.2, Z + 4));
  concrete.push(box(xr - L, xr + L, Y + 1.6, Y + 2.8, Z - 9, Z - 8.2));
  for (let x = xr - L + 20; x < xr + L; x += lite ? 80 : 40) steel.push(box(x - 0.2, x + 0.2, Y + 1.6, Y + 11, Z - 8.8, Z - 8.4));
  const prep = (g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); if (!n.attributes.normal) n.computeVertexNormals(); return n; };
  return { concrete: mergeGeometries(concrete.map(prep)), steel: mergeGeometries(steel.map(prep)) };
}

// ---------------------------------------------------------------------------------------------- the bridge
export function buildBridge(lite) {
  // from the island's north-west shore to the right bank, a deck on slender piers
  const a = new THREE.Vector3(-118, 15, -30), xr = riverX(-60), hw = riverHW(-60), b = new THREE.Vector3(xr - hw - 70, 20, -70);
  const dir = b.clone().sub(a), len = dir.length(), ang = Math.atan2(dir.x, dir.z);
  const parts = [];
  const deck = new THREE.BoxGeometry(14, 2.2, len).translate(0, -1.1, len / 2);
  const rail = (s) => new THREE.BoxGeometry(0.5, 1.3, len).translate(s * 6.8, 0.65, len / 2);
  parts.push(deck, rail(1), rail(-1));
  const np = lite ? 5 : 9;
  for (let i = 1; i < np; i++) { const z = (i / np) * len, y = a.y + (b.y - a.y) * (i / np); parts.push(new THREE.CylinderGeometry(2.2, 2.6, y + 8, 10).translate(0, -(y + 8) / 2 - 2, z)); }
  const g = mergeGeometries(parts.map((p) => { const n = p.toNonIndexed(); n.deleteAttribute('uv'); return n; }));
  g.rotateX(-Math.atan2(b.y - a.y, Math.hypot(dir.x, dir.z)));
  g.rotateY(ang); g.translate(a.x, a.y, a.z);
  return g;
}

// ---------------------------------------------------------------------------------------------- trees & people
export function buildTrees(lite) {
  const R = rng(5150), R0 = rng(808), n = lite ? 380 : 1250, M = [], C = [];
  // lumpy crowns: displace the sphere a little so instances read as foliage, not balls; the crowns near
  // the island (seen from the crane) get the finer sphere, the far ones the coarse one
  const crown = (detail) => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.18 * noise2(x * 2.3 + y, z * 2.3 - y); p.setXYZ(i, x * k, y * k * 0.8, z * k); }
    g.deleteAttribute('uv'); g.computeVertexNormals();
    return g;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let tries = 0;
  while (M.length < n && tries++ < n * 30) {
    // denser near the island and along the banks the camera passes
    const rr = 1900 * Math.pow(R(), 1.5), a = R() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = 450 + Math.sin(a) * rr * 1.25;
    const hw = riverHW(z), d = Math.abs(x - riverX(z));
    const isl = Math.hypot(x / 150, (z + 8) / 118);
    if (isl < 1.0 ? (isl < 0.8) : d < hw + 30) continue;
    const h = groundH(x, z);
    if (h < 4) continue;
    const e = 3, sl = Math.hypot(groundH(x + e, z) - groundH(x - e, z), groundH(x, z + e) - groundH(x, z - e)) / (2 * e);
    if (sl > 0.55 && R() < 0.8) continue;
    if (Math.abs(x) < 70 && z > -60 && z < 90) continue;   // the plaza
    { // keep the low opening flight over the river clear of big crowns right by the lens
      const ax = -180, az = 1820, bx = -95, bz = 420, ux = bx - ax, uz = bz - az, k = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz)));
      if (Math.hypot(x - ax - ux * k, z - az - uz * k) < 260) continue;
    }
    const w = 4 + 6 * R();
    s.set(w * (0.9 + 0.3 * R()), w * (0.8 + 0.5 * R()), w * (0.9 + 0.3 * R()));
    q.setFromAxisAngle(up, R() * 6.3);
    t.set(x, h + s.y * 0.7, z);
    M.push(m4.compose(t, q, s).clone());
    const g = 0.6 + 0.6 * R();
    C.push(new THREE.Color(0.075 * g + 0.03 * R(), 0.16 * g, 0.045 * g));
  }
  // the plaza's own trees: two rows round the deck, between the hall and the parapet
  for (const [hw, hd] of [[86, 76], [74, 66]]) {
    const R = ring(hw, hd, 20, 4, 4);
    for (let i = 0; i < R.length; i++) {
      const [x0, z0] = R[i], [x1, z1] = R[(i + 1) % R.length], L = Math.hypot(x1 - x0, z1 - z0);
      for (let d = 0; d < L; d += 13) {
        const x = x0 + (x1 - x0) * d / L, z = z0 + (z1 - z0) * d / L;
        if (Math.abs(x) < 20 && z > 50) continue;   // the front steps
        const w = 3.2 + 1.2 * R0(); s.set(w, w * 0.9, w); q.setFromAxisAngle(up, R0() * 6.3); t.set(x, SITE.PLAZA_Y + 1.4 + w * 0.6, z);
        M.push(m4.compose(t, q, s).clone()); const g = 0.7 + 0.5 * R0(); C.push(new THREE.Color(0.08 * g, 0.17 * g, 0.05 * g));
      }
    }
  }
  const mat = flags(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }));
  mat.onBeforeCompile = (sh) => {
    worldVaryings(sh);
    sh.vertexShader = sh.vertexShader.replace('vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float lf = snoise(vWP * 0.8) * 0.5 + 0.5, lc = snoise(vWP * 0.22 + 4.0) * 0.5 + 0.5;
      diffuseColor.rgb *= (0.55 + 0.7 * lf) * (0.75 + 0.5 * lc);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { float e = 0.4, a0 = snoise(vWP * 0.8), ax = snoise((vWP + vec3(e, 0.0, 0.0)) * 0.8), ay = snoise((vWP + vec3(0.0, e, 0.0)) * 0.8), az = snoise((vWP + vec3(0.0, 0.0, e)) * 0.8);
        normal = normalize(normal + (viewMatrix * vec4(vec3(a0 - ax, a0 - ay, a0 - az) * 1.6, 0.0)).xyz); }`);
  };
  mat.customProgramCacheKey = () => 'unityTrees';
  const group = new THREE.Group();
  const nearI = [], farI = [];
  M.forEach((m, i) => { const e = m.elements; (!lite && Math.hypot(e[12], e[14] - 20) < 520 ? nearI : farI).push(i); });
  for (const [list, detail] of [[nearI, 1], [farI, 0]]) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(crown(detail), mat, list.length);
    list.forEach((k, i) => { im.setMatrixAt(i, M[k]); im.setColorAt(i, C[k]); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.receiveShadow = true; im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

export function buildPeople(lite) {
  const R = rng(77), n = lite ? 60 : 200;
  const g = mergeGeometries([new THREE.CylinderGeometry(0.2, 0.26, 1.2, 5, 1, true).translate(0, 0.6, 0), new THREE.SphereGeometry(0.15, 5, 3).translate(0, 1.38, 0)].map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); return q; }));
  const mat = flags(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
  const im = new THREE.InstancedMesh(g, mat, n);
  const m4 = new THREE.Matrix4(), cols = ['#e8e0d0', '#c0392b', '#2c5f8a', '#f2c14e', '#7a4e8c', '#2d6a4f', '#e07a5f', '#ffffff', '#34495e'];
  for (let i = 0; i < n; i++) {
    let x, z;
    do { x = (R() - 0.5) * 180; z = 4 + (R() - 0.5) * 160; } while (Math.abs(x) < 60 && Math.abs(z - 6) < 54);
    const sc = 0.9 + 0.2 * R();
    m4.makeScale(sc, sc, sc).setPosition(x, SITE.PLAZA_Y, z);
    im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(cols[i % cols.length]).multiplyScalar(0.5));
  }
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
  im.computeBoundingSphere();
  return im;
}

// ---------------------------------------------------------------------------------------------- the Statue of Liberty
// A flat silhouette, 93 m from the ground to the torch (pedestal 47 m + statue 46 m), facing the viewer:
// her right arm (screen left) raises the torch, the tablet in her left.
export function libertyGeometry() {
  const L = [];   // traced anticlockwise from the bottom left
  L.push([-11, 0], [-11, 3], [-9.6, 3], [-9.6, 5], [-8.5, 6], [-7.6, 38], [-9.2, 39.5], [-9.2, 42.5], [-7.2, 43.5], [-7.0, 47], [-5.6, 47], [-5.6, 49]);
  L.push([-5.2, 50], [-4.7, 58], [-3.9, 66], [-4.2, 72], [-4.6, 75]);                                  // robe, waist, chest
  L.push([-5.3, 79], [-5.7, 83], [-5.9, 87.2], [-6.1, 88.6], [-7.0, 89.2], [-6.6, 91.2], [-6.2, 93], [-5.6, 91.4], [-5.0, 89.6], [-5.3, 88.6], [-4.8, 87.2], [-4.5, 82.6], [-3.6, 78.2]);   // raised arm and torch
  L.push([-1.7, 78.3], [-1.9, 80.2], [-1.85, 81.4]);                                                    // neck, head
  const c = [0, 81.6];
  for (let k = 0; k < 7; k++) {                                                                       // the seven rays of the crown
    const a = (165 - k * 25) * Math.PI / 180, b0 = a + 0.2, b1 = a - 0.2;
    L.push([c[0] + Math.cos(b0) * 2.0, c[1] + Math.sin(b0) * 2.0], [c[0] + Math.cos(a) * 4.0, c[1] + Math.sin(a) * 4.0], [c[0] + Math.cos(b1) * 2.0, c[1] + Math.sin(b1) * 2.0]);
  }
  L.push([1.85, 81.4], [1.9, 80.2], [1.7, 78.3], [3.6, 76.8], [4.6, 75.6], [5.3, 76.0], [6.6, 75.2], [6.0, 66.8], [4.7, 67.2], [4.0, 66], [4.7, 58], [5.2, 50]);   // tablet
  L.push([5.6, 49], [5.6, 47], [7.0, 47], [7.2, 43.5], [9.2, 42.5], [9.2, 39.5], [7.6, 38], [8.5, 6], [9.6, 5], [9.6, 3], [11, 3], [11, 0]);
  const g = new THREE.ShapeGeometry(new THREE.Shape(L.map(([x, y]) => new THREE.Vector2(x, y))), 1);
  return { geometry: g, outline: L.map(([x, y]) => new THREE.Vector3(x, y, 0.05)) };
}

// ---------------------------------------------------------------------------------------------- the bronze
// Object space (figure units): the cladding's panel seams (projected along the dominant axis, faded with
// fwidth), a tone per panel, darker weathered patina gathering in the folds and running down in streaks,
// a faint verdigris in the deepest recesses, the raised skin a little more polished.
export function bronzeMaterial() {
  const m = flags(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.85 }));
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float ao; attribute float kind; varying float vAo; varying float vKind; varying vec3 vObj; varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAo = ao; vKind = kind; vObj = transformed; vON = objectNormal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vAo; varying float vKind; varying vec3 vObj; varying vec3 vON;
      ${GLSL_NOISE}
      float bHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 an = abs(normalize(vON));
      vec2 q; float ax;
      if (an.x > an.y && an.x > an.z) { q = vObj.zy; ax = 1.0; } else if (an.y > an.z) { q = vObj.xz; ax = 2.0; } else { q = vObj.xy; ax = 3.0; }
      // panels of irregular size following the drape: narrow columns of tall panels (each column its own
      // panel height and row offset, so rows stagger), the joints wavering slightly; the seams are faint and
      // broken up by the patina, so the bronze reads first as one sculpted surface
      vec2 qw = q + vec2(0.004 * snoise(vec3(q * 9.0, ax)), 0.006 * snoise(vec3(q * 7.0, ax + 3.0)));
      float colW = 0.032, cx = floor(qw.x / colW), ph = 0.042 + 0.03 * bHash(vec2(cx, ax)), off = bHash(vec2(cx + 7.0, ax)) * ph;
      vec2 g = vec2(qw.x / colW, (qw.y + off) / ph);
      vec2 fw = fwidth(g), f = abs(fract(g) - 0.5) * 2.0;
      float seam = max(smoothstep(1.0 - fw.x * 1.2 - 0.03, 1.0, f.x), smoothstep(1.0 - fw.y * 1.2 - 0.03, 1.0, f.y));
      seam *= (1.0 - smoothstep(0.05, 0.22, max(fw.x, fw.y))) * (0.3 + 0.7 * vKind);
      seam *= smoothstep(0.25, 0.75, snoise(vec3(vObj * 14.0)) * 0.5 + 0.5);
      float tone = bHash(vec2(cx, floor(g.y)) + ax * 17.0) * 0.5 + 0.25;
      float cav = clamp(1.0 - vAo, 0.0, 1.0) * (0.4 + 0.6 * vKind);
      float streak = smoothstep(0.45, 0.95, snoise(vec3(vObj.x * 70.0, vObj.y * 5.0, vObj.z * 70.0)) * 0.5 + 0.5);
      float blot = snoise(vObj * 9.0) * 0.5 + 0.5;
      vec3 bz = mix(vec3(0.34, 0.21, 0.12), vec3(0.42, 0.27, 0.15), (tone - 0.5) * 0.25 * vKind + blot);
      vec3 dark = vec3(0.075, 0.055, 0.04);
      vec3 verd = vec3(0.1, 0.16, 0.12);
      vec3 bc = mix(bz, dark, clamp(cav * 1.3 + streak * 0.45, 0.0, 1.0) * 0.8);
      bc = mix(bc, verd, smoothstep(0.35, 0.8, cav) * 0.4 + streak * 0.1);
      bc *= 1.0 - 0.07 * seam;
      // the viewing gallery's openings: a row of small slits across the chest, facing the dam
      float gx = vObj.x / 0.021 + 0.5, gw = abs(fract(gx) - 0.5) * 2.0;
      float gal = step(0.62, normalize(vON).z) * step(abs(vObj.x), 0.115) * smoothstep(1.396, 1.399, vObj.y) * (1.0 - smoothstep(1.421, 1.424, vObj.y)) * (1.0 - smoothstep(0.55, 0.65, gw));
      bc = mix(bc, vec3(0.012, 0.014, 0.018), gal);
      diffuseColor.rgb = bc;
      float bMetal = mix(0.8, 0.3, clamp(cav * 1.2 + streak * 0.35, 0.0, 1.0));
      float bRough = 0.48 + 0.22 * cav + 0.04 * (tone - 0.5) * vKind + 0.03 * seam + 0.1 * streak - 0.06 * (1.0 - vKind);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal * (1.0 - gal); roughnessFactor = mix(roughnessFactor, 0.15, gal);');
  };
  m.customProgramCacheKey = () => 'unityBronze';
  return m;
}
