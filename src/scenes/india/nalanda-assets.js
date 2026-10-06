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
const BRICK_GLSL = /* glsl */ `
#define BL ${BL.toFixed(3)}
#define BH ${BH.toFixed(3)}
varying vec3 vBW; varying vec3 vBN;
uniform float uRise, uDelayK, uRuinLo, uRuinHi, uHot, uJag, uSlice;
uniform vec2 uCentre;
uniform vec3 uTint;
float bh3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float bn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = bh3(vec3(i, 7.0)), b = bh3(vec3(i + vec2(1.0, 0.0), 7.0)), c = bh3(vec3(i + vec2(0.0, 1.0), 7.0)), d = bh3(vec3(i + vec2(1.0), 7.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
// brick cell of a point on a wall face: (index along the wall, course, wall key, along coordinate in bricks)
vec4 bCell(vec3 w, vec3 n){
  bool zx = abs(n.x) > abs(n.z);
  float along = zx ? w.z : w.x, other = zx ? w.x : w.z;
  float course = floor(w.y / BH);
  float s = along / BL + mod(course, 2.0) * 0.5;
  return vec4(floor(s), course, floor(other / 2.5), s);
}
float bRuin(vec2 xz){ float n = bn2(xz * 0.11) * 0.58 + bn2(xz * 0.37 + 3.1) * 0.32 + bn2(xz * 0.8 + 7.7) * 0.1; return mix(uRuinLo, uRuinHi, smoothstep(0.25, 0.8, n)); }
// 1 where a brick stands: below the broken ruin line, or below the build front (which lags with distance
// from the centre of the campus); hot = freshly laid
float bVisible(vec3 w, vec3 n, out float hot){
  vec4 c = bCell(w - n * 0.02, n);
  float r = bh3(vec3(floor(c.x / 3.0), floor(c.y / 2.0), c.z) + 0.37) * 0.72 + bh3(c.xyz + 0.37) * 0.28;
  float base = c.y * BH;
  float ruin = bRuin(w.xz);
  float front = uRise - uDelayK * length(w.xz - uCentre);
  float tR = base + r * BH * uJag, tB = base + r * BH * 1.6;
  hot = tR < ruin ? 0.0 : 1.0 - smoothstep(0.0, BH * 2.0, front - tB);
  return (tR < ruin || tB < front) && w.y > uSlice ? 1.0 : 0.0;
}`;

const BRICK_VERT = (src) => src
  .replace('#include <common>', `#include <common>\nvarying vec3 vBW; varying vec3 vBN;`)
  .replace('#include <project_vertex>', `#include <project_vertex>
    vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vBN = normalize(mat3(modelMatrix) * normal);`);

// U: shared uniforms (uRise, uDelayK, uCentre, uHot); per material: ruin heights, jaggedness, tint.
export function brickMaterial(U, { ruinLo = 0.5, ruinHi = 2.0, jag = 4, tint = [1, 1, 1], slice = false, key = 'b' } = {}) {
  const u = { ...U, uRuinLo: { value: ruinLo }, uRuinHi: { value: ruinHi }, uJag: { value: jag }, uTint: { value: new THREE.Vector3(...tint) }, uSlice: slice ? { value: -100 } : { value: -100 } };
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  m.userData.u = u;
  m.userData.noDetail = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = BRICK_VERT(sh.vertexShader);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${BRICK_GLSL}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bHot;
        if (bVisible(vBW, normalize(vBN), bHot) < 0.5) discard;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float bMortar = 0.0;
        {
          vec3 N = normalize(vBN);
          vec3 w = vBW - N * 0.02;
          float s, v; vec3 id;
          if (abs(N.y) > 0.7) { float row = floor(w.z / (BH * 1.6)); s = w.x / BL + mod(row, 2.0) * 0.5; v = w.z / (BH * 1.6); id = vec3(floor(s), row, 91.0); }
          else { vec4 c = bCell(w, N); s = c.w; v = w.y / BH; id = c.xyz; }
          float r = bh3(id + 1.7), r2 = bh3(id + 9.1);
          float fs = fwidth(s), fv = fwidth(v);
          float us = fract(s), uv2 = fract(v);
          float ms = smoothstep(0.025, 0.025 + fs * 1.5 + 0.01, min(us, 1.0 - us));
          float mv = smoothstep(0.07, 0.07 + fv * 1.5 + 0.02, min(uv2, 1.0 - uv2));
          float brickM = ms * mv;
          float detail = 1.0 - smoothstep(0.1, 0.4, max(fs, fv));
          vec3 bc = mix(vec3(0.22, 0.058, 0.03), vec3(0.40, 0.12, 0.058), r) * mix(0.82, 1.12, r2);
          bc = mix(bc, vec3(0.16, 0.05, 0.03), step(0.94, r2) * 0.7);           // a few dark over-fired bricks
          vec3 mc = vec3(0.32, 0.25, 0.18);
          vec3 avg = mix(vec3(0.30, 0.088, 0.044), mc, 0.14);
          vec3 col = mix(avg, mix(mc, bc, brickM), detail);
          float bl = bn2(vBW.xz * 0.55 + vBW.y * 0.3) * 0.55 + bn2(vBW.xz * 2.7 - vBW.y * 1.3) * 0.45;
          col *= mix(0.74, 1.12, bl);
          col *= mix(0.6, 1.0, smoothstep(0.0, 0.8, vBW.y));                     // damp, darker foot of the walls
          if (!gl_FrontFacing) col = mix(vec3(0.24, 0.075, 0.04), vec3(0.36, 0.12, 0.065), bl);   // the broken wall tops
          diffuseColor.rgb = col * uTint;
          bMortar = 1.0 - brickM * detail;
        }`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        if (!gl_FrontFacing) normal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.82, 0.98, bMortar);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * uHot * bHot * 2.0;
        totalEmissiveRadiance += vec3(1.0, 0.7, 0.35) * 1.2 * (1.0 - smoothstep(0.0, 0.08, vBW.y - uSlice)) * step(-50.0, uSlice);`);
  };
  m.customProgramCacheKey = () => 'nalanda-brick-v1';
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
  d.customProgramCacheKey = () => 'nalanda-brick-depth-v1';
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
  float ridge = 1.0 - abs(mn(p * 0.9 + 3.0) * 2.0 - 1.0);
  vec3 c = mix(vec3(0.030, 0.022, 0.014), vec3(0.046, 0.032, 0.019), f);
  c += vec3(0.020, 0.012, 0.006) * pow(ridge, 6.0);
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
          vec3 lawn = mix(vec3(0.050, 0.068, 0.022), vec3(0.110, 0.105, 0.040), n1 * 0.6 + n2 * 0.4);
          vec3 earth = mix(vec3(0.16, 0.085, 0.045), vec3(0.24, 0.14, 0.075), n2);
          float bare = smoothstep(0.62, 0.78, n1 * 0.45 + n2 * 0.35 + n3 * 0.2);
          vec3 col = mix(lawn, earth, max(bare, uEarth * (0.75 + 0.25 * n3)));
          col *= 0.82 + 0.3 * n3 + 0.12 * n4;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uMapMix > 0.001) gl_FragColor.rgb = mix(gl_FragColor.rgb, mapLand(vGW.xz / ${DEG.toFixed(1)}) * uMapK, uMapMix);`);
  };
  m.customProgramCacheKey = () => 'nalanda-ground-v1';
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
export function monkGeometries() {
  const standRobe = lathe([[0, 0], [0.2, 0], [0.22, 0.06], [0.2, 0.5], [0.19, 0.95], [0.2, 1.22], [0.21, 1.34], [0.17, 1.44], [0.07, 1.5], [0, 1.5]]);
  const standHead = new THREE.SphereGeometry(0.105, 10, 8); standHead.translate(0, 1.6, 0);
  const seatRobe = lathe([[0, 0], [0.4, 0], [0.42, 0.06], [0.4, 0.16], [0.22, 0.22], [0.17, 0.3], [0.16, 0.5], [0.19, 0.66], [0.17, 0.74], [0.07, 0.8], [0, 0.8]]);
  const seatHead = new THREE.SphereGeometry(0.105, 10, 8); seatHead.translate(0, 0.9, 0);
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
const MAINLAND_CLOSE = [[138.0, 64.0], [20.0, 64.0], [20.0, 34.0], [34.2, 31.3]];
const CASPIAN = [[49.0, 46.5], [51.5, 47.0], [53.0, 45.3], [51.3, 44.5], [52.7, 42.0], [53.0, 40.5], [54.0, 38.0], [53.9, 36.9], [51.8, 36.6], [50.0, 37.4],
  [49.0, 38.5], [49.5, 40.3], [48.0, 41.8], [47.5, 43.5], [47.0, 44.6], [48.0, 46.0]];
const AFRICA = [[34.9, 29.5], [34.2, 27.8], [32.6, 29.9], [33.5, 27.0], [35.5, 24.0], [36.9, 22.0], [37.4, 19.0], [38.6, 17.9], [39.7, 15.3], [41.2, 14.2],
  [42.4, 13.0], [43.3, 11.8], [44.3, 10.4], [45.8, 10.8], [47.6, 11.2], [49.0, 11.3], [51.2, 11.8], [51.1, 10.4], [50.4, 8.5], [49.4, 6.5], [47.9, 4.3],
  [46.0, 2.2], [43.5, -0.5], [41.6, -1.8], [40.1, -3.3], [39.2, -5.5], [39.4, -7.5], [39.7, -10.0], [40.5, -14.0], [40.6, -20.0]];
const AFRICA_CLOSE = [[20.0, -20.0], [20.0, 31.0], [32.3, 31.3]];
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
        vec3 c = vec3(0.004, 0.010, 0.020) * (0.8 + 0.4 * mn(vP * 0.4)) * (1.0 - smoothstep(30.0, 90.0, d) * 0.7);
        c += vec3(1.0, 0.7, 0.4) * 0.05 * graticule(vP) * (1.0 - smoothstep(uR * 0.6, uR, d)) * step(0.01, uR);
        gl_FragColor = vec4(c * uMap, 1.0);
      }`,
    depthWrite: false,
  });
  const oceanG = new THREE.PlaneGeometry(220, 160, 1, 1); oceanG.rotateX(-Math.PI / 2); oceanG.translate(10, 0, -5);
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
        vec3 c = mapLand(vP) * uMapK;
        c += vec3(1.0, 0.7, 0.4) * 0.06 * graticule(vP) * (1.0 - smoothstep(uR * 0.6, uR, length(vP))) * step(0.01, uR);
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
