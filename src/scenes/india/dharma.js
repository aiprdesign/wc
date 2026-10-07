// THE PATH OF PEACE · FROM ASHOKA TO GANDHI (38.5 – 43.0 s)
// Technique: signed-distance sculpture (the four lions, surface-nets meshed), procedural architecture
// (lathe and revolve grids, low relief wrapped onto a drum), a shader-etched inscription, noise-dissolve
// morphing (stone wheel → gold chakra → wooden charkha), atmospheric dawn (sky, layered mist, fog) and a
// crowd of walkers animated in the vertex shader. One continuous camera, locked to the cues:
//   lionCapital 38.9  dawn mist: the Lion Capital of Ashoka (Sarnath) on its polished pillar
//   edicts      39.7  the hush: lines of Brahmi-like script ignite on the pillar shaft (abstract, not text)
//   wheel       40.5  the swell: the 24-spoke wheel at the front lion's feet lifts off in gold and turns
//   charkha     41.3  the turning wheel dissolves into Gandhi's spinning wheel; the yarn draws out
//   saltMarch   41.9  the lift: the camera cranes up over the capital to a long road to the sea, walkers
//   republic    42.4  the sea glows; the flag unfurls; 1947 · 1950
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, rng } from '../../lib/math.js';
import { Dust } from '../../lib/particles.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout, faceCamera } from '../../lib/hud.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { progressLine } from '../../lib/lines.js';
import { buildLand, SHORE_GLSL } from './dharma-land.js';
import {
  V3, CAP, CHARKHA, capitalGeometries, wheelParts, charkhaGeometries, charkhaFrame,
  inscriptionCanvas, flagTexture, marcherGeometry,
} from './dharma-assets.js';

const GROUND_Y = -6;
const SEA_Z = -150;
const HUD_GOLD = '#ffe2ae';

// --------------------------------------------------------------------------------------------- shaders
const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir; uniform float uLift;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 zen = vec3(0.016, 0.026, 0.075), mid = vec3(0.16, 0.13, 0.24), hor = vec3(0.66, 0.38, 0.25);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.17, h));
  c = mix(c, zen, smoothstep(0.12, 0.7, h));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.6, 0.3) * (pow(s, 5.0) * 0.45 + pow(s, 60.0) * 1.6);
  vec2 ah = normalize(d.xz + 1e-5), sh = normalize(uSunDir.xz);
  float anti = max(dot(ah, -sh), 0.0);
  c += vec3(0.6, 0.34, 0.44) * anti * anti * exp(-abs(h - 0.07) * 13.0) * 0.3;      // the anti-twilight arch
  c = mix(c, vec3(0.34, 0.24, 0.21), smoothstep(0.0, -0.06, h));
  return c * uLift;
}`;

// Dissolve: the surface exists where the object-space noise lies between uOut and uIn; a hot rim at both fronts.
function withDissolve(mat, U, edge = '#ffb35a', freq = 7) {
  mat.userData.noBatch = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.uniforms.uEdgeCol = { value: new THREE.Color(edge) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDisP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDisP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vDisP; uniform float uIn, uOut; uniform vec3 uEdgeCol;
      float dHash(vec3 p){ return fract(sin(dot(p, vec3(17.1, 113.7, 59.3))) * 43758.5453); }
      float dNoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dn = dNoise(vDisP * ${freq.toFixed(1)}) * 0.7 + dNoise(vDisP * ${(freq * 3.1).toFixed(1)}) * 0.3;
        if (dn > uIn || dn < uOut) discard;
        float dEdge = (1.0 - smoothstep(0.0, 0.035, uIn - dn)) * step(uIn, 1.05) + (1.0 - smoothstep(0.0, 0.035, dn - uOut)) * step(-0.05, uOut);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uEdgeCol * dEdge * 2.6;');
  };
  mat.customProgramCacheKey = () => `dharma-dissolve-${freq}`;
  return mat;
}
const disU = () => ({ uIn: { value: 1.2 }, uOut: { value: -0.2 } });
const setDis = (U, pin, pout) => { U.uIn.value = pin * 1.25 - 0.12; U.uOut.value = pout * 1.25 - 0.13; };

// Polished Chunar sandstone (the Mauryan "mirror" finish): buff stone mottled in object space, fine dark
// speckles, faint rain streaks and duller weathered patches; on the shaft, an incised inscription — the
// grooves bend the normal (lit lower wall, shadowed upper wall, a bright lip), hold grime, and glow when lit.
const STONE_NOISE = /* glsl */ `
float stH(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float stN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(stH(i), stH(i + vec3(1,0,0)), f.x), mix(stH(i + vec3(0,1,0)), stH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(stH(i + vec3(0,0,1)), stH(i + vec3(1,0,1)), f.x), mix(stH(i + vec3(0,1,1)), stH(i + vec3(1,1,1)), f.x), f.y), f.z); }`;
function sandstone(mat, { ins = null, band = null } = {}) {
  mat.onBeforeCompile = (sh) => {
    if (ins) Object.assign(sh.uniforms, ins);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSP; varying vec3 vST; varying vec3 vSB;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSP = position;
        vST = normalize(normalMatrix * normalize(vec3(position.z, 0.0, -position.x) + vec3(1e-6)));
        vSB = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSP; varying vec3 vST; varying vec3 vSB;
      ${ins ? 'uniform sampler2D uIns; uniform float uP, uGlow;' : ''}
      ${STONE_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float stM = stN(vSP * 3.1) * 0.5 + stN(vSP * 9.3) * 0.3 + stN(vSP * 31.0) * 0.2;
        float stAz = atan(vSP.x, vSP.z);
        float stStreak = smoothstep(0.58, 0.9, stN(vec3(stAz * 22.0, vSP.y * 0.9, 3.0))) * (0.6 + 0.4 * stN(vSP * 6.0));
        float stSpeck = smoothstep(0.82, 0.9, stN(vSP * 190.0)) * 0.8 + smoothstep(0.9, 0.96, stN(vSP * 70.0 + 9.0));
        float stWeather = clamp(stStreak * 0.7 + smoothstep(0.62, 0.8, stN(vSP * 1.7 + 4.0)) * 0.5, 0.0, 1.0);
        diffuseColor.rgb *= mix(vec3(0.88, 0.87, 0.85), vec3(1.05, 1.02, 0.97), stM);
        diffuseColor.rgb *= 1.0 - 0.3 * stSpeck;
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.8, 0.76, 0.72), stWeather);
        float insD = 0.0; vec3 insT = vec3(0.0); float insIn = 0.0; vec2 insG = vec2(0.0);
        ${ins ? `{
          vec2 iuv = vec2((stAz + ${band.a.toFixed(4)}) / ${(2 * band.a).toFixed(4)}, (vSP.y - (${band.y1.toFixed(4)})) / ${(band.y0 - band.y1).toFixed(4)});
          insIn = (iuv.x > 0.0 && iuv.x < 1.0 && iuv.y > 0.0 && iuv.y < 1.0) ? 1.0 : 0.0;
          if (insIn > 0.5) {
            const float E = 1.25 / 1024.0;
            insT = texture2D(uIns, iuv).rgb;
            float wear = 0.65 + 0.35 * stN(vSP * 40.0);
            insD = insT.r * wear;
            insG = vec2(texture2D(uIns, iuv + vec2(E, 0.0)).r - texture2D(uIns, iuv - vec2(E, 0.0)).r,
                        texture2D(uIns, iuv + vec2(0.0, E)).r - texture2D(uIns, iuv - vec2(0.0, E)).r) * wear;
            diffuseColor.rgb *= 1.0 - 0.6 * smoothstep(0.05, 0.8, insD);        // grime and shade down in the cut
            float wl = dot(insG, normalize(vec2(-0.45, 1.0))) * 3.0;             // walls facing the low sun / turned away
            diffuseColor.rgb *= 1.0 + 0.9 * clamp(wl, 0.0, 1.0) - 0.6 * clamp(-wl, 0.0, 1.0);
          }
        }` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(0.55, 1.5, stWeather) + 0.25 * stSpeck + 0.5 * smoothstep(0.1, 0.6, insD), 0.08, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${ins ? `if (insIn > 0.5) {
          // groove depth ~3.5 mm; slope = Δdepth / Δworld across the 2.5-texel central difference
          vec2 slope = insG * vec2(0.0035 / (2.5 / 1024.0 * ${band.w.toFixed(4)}), 0.0035 / (2.5 / 1024.0 * ${band.h.toFixed(4)}));
          normal = normalize(normal + (slope.x * vST + slope.y * vSB) * faceDirection);
        }` : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        ${ins ? `if (insIn > 0.5 && insT.b > 0.04) {
          float ord = insT.g / max(insT.b, 1e-3);
          float lit = step(ord, uP) * smoothstep(0.04, 0.5, insT.b);
          float front = exp(-max(uP - ord, 0.0) * 28.0);
          totalEmissiveRadiance += vec3(1.0, 0.6, 0.26) * lit * (front * 6.0 * (0.3 + 0.7 * smoothstep(0.1, 0.8, insD)) + uGlow * smoothstep(0.4, 1.0, insD));
        }` : ''}`);
  };
  mat.customProgramCacheKey = () => `dharma-sandstone-${ins ? 1 : 0}`;
  return mat;
}

// Hermite spline through timed keys [[t, Vector3], …] (C1: tangents from the neighbours).
function spline(keys, t, out) {
  const n = keys.length;
  if (t <= keys[0][0]) return out.copy(keys[0][1]);
  if (t >= keys[n - 1][0]) return out.copy(keys[n - 1][1]);
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, p0] = keys[i], [t1, p1] = keys[i + 1], h = t1 - t0, u = (t - t0) / h;
  const tan = (k) => {
    const a = keys[Math.max(0, k - 1)], b = keys[Math.min(n - 1, k + 1)];
    return b[1].clone().sub(a[1]).multiplyScalar(1 / (b[0] - a[0]));
  };
  const m0 = tan(i).multiplyScalar(h), m1 = tan(i + 1).multiplyScalar(h);
  const u2 = u * u, u3 = u2 * u;
  return out.copy(p0).multiplyScalar(2 * u3 - 3 * u2 + 1).addScaledVector(m0, u3 - 2 * u2 + u)
    .addScaledVector(p1, -2 * u3 + 3 * u2).addScaledVector(m1, u3 - u2);
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tLion = cue('lionCapital'), tEd = cue('edicts'), tWh = cue('wheel'), tCh = cue('charkha'), tSM = cue('saltMarch'), tRep = cue('republic');
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.2;
  const FOG_D = 0.0026, FOG_DAY = new THREE.Color().setRGB(0.62, 0.45, 0.34);
  scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(0.44, 0.3, 0.25), FOG_D);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 4000);

  const SUN_DIR = V3(-1, 0.26, 0.6).normalize();         // low dawn sun from the left (east), raking across the stone

  // ------------------------------------------------------------------------------------------- sky
  const skyU = { uSunDir: { value: SUN_DIR.clone() }, uLift: { value: 1 }, uTime: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `${GLSL_NOISE}${SKY_GLSL} uniform float uTime; varying vec3 vP;
      void main(){
        vec3 d = normalize(vP);
        vec3 c = skyCol(d);
        // thin dawn cloud streaks low over the horizon, lit from beneath
        float band = smoothstep(0.015, 0.06, d.y) * (1.0 - smoothstep(0.1, 0.3, d.y));
        float n = snoise(vec3(d.x * 2.2 + uTime * 0.01, d.y * 26.0, d.z * 2.2)) * 0.6 + snoise(vec3(d.x * 7.0, d.y * 60.0, d.z * 7.0)) * 0.4;
        float cl = smoothstep(0.15, 0.7, n) * band;
        float s = max(dot(d, uSunDir), 0.0);
        c = mix(c, vec3(0.85, 0.44, 0.32) * uLift * (0.7 + 0.6 * s), cl * 0.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  // ------------------------------------------------------------------------------------------- lights
  const sun = new THREE.DirectionalLight('#ffc996', 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(30).add(V3(0, 1, 0));
  sun.target.position.set(0, 1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -1.6, right: 1.6, top: 2.2, bottom: -2.4, near: 20, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight('#a9b8ff', 1.1);
  rim.position.set(3, 4, -9);
  scene.add(rim);
  const hemi = new THREE.HemisphereLight('#9aa0c8', '#4a3424', 0.4);
  scene.add(hemi);
  const wheelLight = new THREE.PointLight('#ffbf6a', 0, 9, 1.6);
  scene.add(wheelLight);

  // ------------------------------------------------------------------------------------------- the pillar & capital
  const stone = new THREE.MeshPhysicalMaterial({ color: '#cbbfa8', roughness: 0.32, metalness: 0, clearcoat: 0.5, clearcoatRoughness: 0.14, sheen: 0.08, sheenColor: new THREE.Color('#ffe6c0'), sheenRoughness: 0.5, envMapIntensity: 1.1 });
  stone.userData.detail = { albedo: 0.12, rough: 0.35, grime: 0.15 };
  sandstone(stone);
  const geos = capitalGeometries(lite);
  const capital = new THREE.Group();
  scene.add(capital);
  for (const g of [geos.bell, geos.neck, geos.reliefs, geos.lions]) {
    const m = new THREE.Mesh(g, stone); m.castShadow = g !== geos.reliefs; m.receiveShadow = true; capital.add(m);   // (the low relief on the drum shades too little to cast)
  }
  // the shaft carries the inscription band (incised into the stone itself): glyphs ignite one by one, then
  // hold a warm glow down in the cut
  const INS_Y0 = -0.14, INS_Y1 = -0.98, INS_A = 1.15;
  const shaftR = (y) => CAP.shaftR + (-y) * 0.007;
  const insTex = toTexture(inscriptionCanvas({}), { srgb: false });
  const insU = { uIns: { value: insTex }, uP: { value: -0.05 }, uGlow: { value: 0 } };
  const rMid = shaftR((INS_Y0 + INS_Y1) / 2);
  const shaftMat = sandstone(stone.clone(), { ins: insU, band: { a: INS_A, y0: INS_Y0, y1: INS_Y1, w: 2 * INS_A * rMid, h: INS_Y0 - INS_Y1 } });
  shaftMat.userData.detail = { albedo: 0.1, rough: 0.3, grime: 0.12 };
  const shaftPts = [new THREE.Vector2(0, 0), new THREE.Vector2(CAP.shaftR - 0.004, 0), new THREE.Vector2(CAP.shaftR, -0.004)];
  for (let i = 1; i <= 6; i++) { const y = -0.004 - (i / 6) * (-(GROUND_Y - 1) - 0.004); shaftPts.push(new THREE.Vector2(shaftR(y), y)); }
  const shaft = new THREE.Mesh(new THREE.LatheGeometry(shaftPts.reverse(), 128), shaftMat);   // bottom → top: outward faces
  shaft.castShadow = shaft.receiveShadow = true;
  capital.add(shaft);

  // ------------------------------------------------------------------------------------------- the gold chakra
  const W = V3(0, 1.22, 2.05);                              // where the wheel comes to rest, between camera and capital
  const WHEEL_FROM = V3(0, CAP.wheelY, CAP.abacusR + 0.016);
  const chakraU = disU();
  const gold = withDissolve(new THREE.MeshStandardMaterial({ color: '#e8b65c', metalness: 1, roughness: 0.3, emissive: '#ff9a30', emissiveIntensity: 0 }), chakraU, '#fff0c0', 6);
  gold.userData.detail = { albedo: 0.08, grime: 0, rough: 0.25, scratch: 0.2 };
  const chakra = new THREE.Mesh(wheelParts({ depth: 0.1 }), gold);
  chakra.visible = false;
  scene.add(chakra);
  // radiance: a ray burst behind the wheel (24 rays turning with it) and a soft core
  const raysU = { uI: { value: 0 }, uRot: { value: 0 } };
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: raysU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uI, uRot; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0; float r = length(p), a = atan(p.y, p.x);
        float ray = pow(0.5 + 0.5 * cos(a * 24.0 - uRot * 24.0), 10.0) * (0.55 + 0.45 * sin(a * 7.0 + 1.3));
        float ray2 = pow(0.5 + 0.5 * cos(a * 12.0 + uRot * 6.0 + 0.4), 30.0);
        float fall = exp(-(r - 0.19) * 3.2) * smoothstep(0.18, 0.24, r);
        float core = exp(-r * 5.0) * 0.12 * smoothstep(0.16, 0.22, r);
        vec3 c = vec3(1.0, 0.72, 0.36) * ((ray * 1.4 + ray2 * 0.8) * fall + core) * (1.0 - smoothstep(0.75, 1.0, r));
        gl_FragColor = vec4(c * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  rays.scale.setScalar(5.2);
  rays.renderOrder = 3;
  scene.add(rays);
  const halo = glowSprite({ color: '#ffc46e', intensity: 1, scale: 2.2 });
  scene.add(halo);

  // ------------------------------------------------------------------------------------------- the charkha
  const ckWheelU = disU(), ckFrameU = disU();
  const woodMat = (U) => withDissolve(new THREE.MeshStandardMaterial({ color: '#8a5a32', roughness: 0.55, metalness: 0 }), U, '#ffb35a', 6);
  const cordMat = (U) => withDissolve(new THREE.MeshStandardMaterial({ color: '#efe4cc', roughness: 0.85 }), U, '#ffd9a0', 6);
  const metalMat = (U) => withDissolve(new THREE.MeshStandardMaterial({ color: '#9aa0a8', roughness: 0.3, metalness: 1 }), U, '#ffd9a0', 6);
  const charkha = new THREE.Group();
  charkha.position.copy(W);
  scene.add(charkha);
  const ckWheel = new THREE.Group();
  const cg = charkhaGeometries();
  ckWheel.add(new THREE.Mesh(cg.wood, woodMat(ckWheelU)), new THREE.Mesh(cg.cord, cordMat(ckWheelU)), new THREE.Mesh(cg.metal, metalMat(ckWheelU)));
  charkha.add(ckWheel);
  const cf = charkhaFrame();
  const ckFrame = new THREE.Group();
  ckFrame.add(new THREE.Mesh(cf.wood, woodMat(ckFrameU)), new THREE.Mesh(cf.cord, cordMat(ckFrameU)), new THREE.Mesh(cf.metal, metalMat(ckFrameU)));
  charkha.add(ckFrame);
  // yarn: from the spindle's tip out to a roll of carded cotton held in the air
  const S = CHARKHA.spindle;
  const yarnPts = [];
  for (let i = 0; i <= 30; i++) { const u = i / 30; yarnPts.push(V3(S.x + u * 0.85, S.y + u * 0.42 + Math.sin(u * Math.PI) * 0.03, 0.3 + u * 0.32)); }
  const yarn = progressLine(yarnPts, { color: '#fff4dc', headColor: '#ffffff', intensity: 2.2, head: 0.06 });
  charkha.add(yarn);
  const cotton = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 1, transparent: true, opacity: 0 }));
  cotton.scale.set(1.6, 0.8, 0.8);
  cotton.position.copy(yarnPts[30]).add(V3(0.06, 0.02, 0.02));
  charkha.add(cotton);

  // ------------------------------------------------------------------------------------------- the land
  // fields, the dusty road at ground level, trees, villages, the beach (dharma-land.js); the road runs from
  // the pillar's foot to the sea
  const ROAD_O = V3(2.2, GROUND_Y, 6), ROAD_D = V3(-0.1, 0, -1).normalize();
  const land = buildLand({ GROUND_Y, SEA_Z, ROAD_O, ROAD_D, SUN_DIR, lite });
  scene.add(land.group);

  // the shore and the sea (sky reflection, wave normals, a glow that rises at the end)
  const seaU = { ...skyU, uGlow: { value: 0 }, uFogCol: { value: scene.fog.color }, uFogD: { value: FOG_D } };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 2600), new THREE.ShaderMaterial({
    uniforms: seaU,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `${GLSL_NOISE}${SKY_GLSL}${SHORE_GLSL(SEA_Z)} uniform float uTime, uGlow, uFogD; uniform vec3 uFogCol; varying vec3 vW;
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        vec2 q = vW.xz * vec2(0.06, 0.11);
        vec3 n = normalize(vec3(snoise(vec3(q, uTime * 0.4)) * 0.05 + snoise(vec3(q * 4.0, uTime)) * 0.025, 1.0,
                               snoise(vec3(q + 7.3, uTime * 0.4)) * 0.05 + snoise(vec3(q * 4.0 + 3.1, uTime)) * 0.025));
        vec3 R = reflect(V, n); R.y = abs(R.y);
        float fr = 0.03 + 0.97 * pow(1.0 - max(dot(-V, n), 0.0), 5.0);
        vec3 c = mix(vec3(0.02, 0.075, 0.08) * (0.85 + 0.3 * uLift), skyCol(R), fr);   // the Arabian Sea at Dandi: blue-green
        float sp = pow(max(snoise(vec3(vW.xz * 0.35, uTime * 1.5)), 0.0), 6.0);
        // the shallows and the surf: sandy water near the beach, lines of breakers rolling in, a swash of foam
        float sh = shoreZ(vW.x) - 1.5 - vW.z;
        float sn = snoise(vec3(vW.xz * 0.06, 2.0));
        c = mix(vec3(0.1, 0.17, 0.13) * uLift * (0.8 + 0.6 * fr), c, smoothstep(0.0, 22.0, sh + sn * 4.0));   // green shallows over sand
        float wph = sh * 0.21 + sn * 1.6 + uTime * 1.3;
        float crest = smoothstep(0.86, 0.99, sin(wph)) * exp(-max(sh, 0.0) / 45.0) * smoothstep(1.0, 6.0, sh);
        crest *= smoothstep(-0.3, 0.4, snoise(vec3(vW.xz * vec2(0.05, 0.3), uTime * 0.3)));
        float swash = (1.0 - smoothstep(0.0, 3.0 + 1.5 * sin(uTime * 0.9 + vW.x * 0.02), sh)) * (0.55 + 0.45 * snoise(vec3(vW.xz * 0.5, uTime * 0.6)));
        float foam = clamp(crest * 0.85 + swash, 0.0, 1.0) * step(-0.5, sh);
        c = mix(c, vec3(0.78, 0.66, 0.58) * uLift * (1.0 + 0.4 * uGlow), foam * 0.85);
        c *= 1.0 + 0.35 * uGlow;
        c += vec3(1.0, 0.72, 0.38) * uGlow * (0.06 + sp * 0.9) * (0.3 + fr);
        float d = length(vW - cameraPosition), f = 1.0 - exp(-pow(d * uFogD, 2.0));
        c = mix(c, uFogCol, f);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, GROUND_Y - 0.05, SEA_Z - 1290);
  scene.add(sea);

  // dawn mist: layered sheets of drifting noise lit by the low sun
  const mistU = { uTime: { value: 0 }, uOp: { value: 1 }, uLift: skyU.uLift };
  const mists = [-1.15, -2.7, -4.3].map((y, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.ShaderMaterial({
      uniforms: { ...mistU, uSeed: { value: i * 17.3 }, uK: { value: 1 - i * 0.18 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `${GLSL_NOISE} uniform float uTime, uOp, uSeed, uK, uLift; varying vec3 vW;
        void main(){
          vec2 p = vW.xz * 0.018 + vec2(uTime * 0.05, uSeed);
          float n = snoise(vec3(p, uSeed)) * 0.55 + snoise(vec3(p * 2.7, uSeed + 3.0)) * 0.3 + snoise(vec3(p * 7.0, uSeed + 9.0)) * 0.15;
          float dens = smoothstep(-0.45, 0.75, n) * uOp * uK;
          dens *= 1.0 - smoothstep(250.0, 650.0, length(vW.xz - vec2(0.0, -150.0)));
          vec3 V = normalize(vW - cameraPosition);
          float a = 1.0 - exp(-dens * 0.22 / max(abs(V.y), 0.025));       // a slab: thicker at grazing angles
          vec3 c = mix(vec3(0.34, 0.25, 0.26), vec3(0.66, 0.47, 0.36), smoothstep(-0.2, 0.8, n)) * uLift;
          gl_FragColor = vec4(c, a * 0.9);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    m.renderOrder = 4 + (2 - i);
    scene.add(m);
    return m;
  });

  // ------------------------------------------------------------------------------------------- the march
  const WALK_SPEED = 1.3;
  const mg = marcherGeometry({ count: lite ? 110 : 200, origin: ROAD_O, dir: ROAD_D, sStart: 8, sEnd: 104, shadowDir: V3(-SUN_DIR.x, 0, -SUN_DIR.z).normalize() });
  const walkU = { uTime: { value: 0 }, uDir: { value: ROAD_D.clone() }, uSide: { value: mg.side.clone() }, uSpeed: { value: WALK_SPEED } };
  const walkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });   // (the carried flags are single sheets)
  walkMat.userData.noBatch = true;
  walkMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, walkU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 aPivot; attribute vec2 aSwing; uniform float uTime, uSpeed; uniform vec3 uDir, uSide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wPh = uTime * 6.6 + aSwing.y, wAng = aSwing.x * sin(wPh);
        vec3 wRel = transformed - aPivot;
        wRel = wRel * cos(wAng) + cross(uSide, wRel) * sin(wAng) + uSide * dot(uSide, wRel) * (1.0 - cos(wAng));
        transformed = aPivot + wRel + uDir * (uSpeed * uTime) + vec3(0.0, 0.03 * abs(sin(wPh)), 0.0);`);
  };
  walkMat.customProgramCacheKey = () => 'dharma-walk';
  const walkers = new THREE.Mesh(mg.body, walkMat);
  walkers.frustumCulled = false;
  scene.add(walkers);
  const shAlpha = (() => {
    const c = mkCanvas(64, 128), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
    const gx = g.createLinearGradient(0, 0, 64, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.3, 'rgba(0,0,0,0)'); gx.addColorStop(0.7, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 64, 128);
    return toTexture(c, { srgb: false });
  })();
  const shMat = new THREE.MeshBasicMaterial({ color: '#1a0f08', alphaMap: shAlpha, transparent: true, opacity: 0.26, depthWrite: false });
  shMat.userData.noBatch = true;
  shMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, walkU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSpeed; uniform vec3 uDir;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += uDir * (uSpeed * uTime);');
  };
  shMat.customProgramCacheKey = () => 'dharma-walk-shadow';
  const shadows = new THREE.Mesh(mg.shadow, shMat);
  shadows.frustumCulled = false; shadows.renderOrder = 2;
  scene.add(shadows);
  const LEAD = ROAD_O.clone().addScaledVector(ROAD_D, 104 + 2.6);

  // ------------------------------------------------------------------------------------------- the flag
  const POLE = V3(9.2, GROUND_Y, -4), POLE_H = 13, FLAG_W = 2.7, FLAG_H = 1.8;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, POLE_H, 10), new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.35, metalness: 0.6 }));
  pole.position.copy(POLE).add(V3(0, POLE_H / 2, 0));
  scene.add(pole);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: '#e8c070', roughness: 0.25, metalness: 1 }));
  finial.position.copy(POLE).add(V3(0, POLE_H + 0.1, 0));
  scene.add(finial);
  const flagGeo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 36, 16);
  flagGeo.translate(FLAG_W / 2, -FLAG_H / 2, 0);
  const flagRest = flagGeo.attributes.position.array.slice();
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.8, side: THREE.DoubleSide }));
  flag.position.copy(POLE).add(V3(0.08, POLE_H - 0.15, 0));
  flag.rotation.y = -0.55;
  scene.add(flag);

  // ------------------------------------------------------------------------------------------- dust in the light
  const dust = new Dust({ count: lite ? 500 : 1200, size: [7, 4, 8], center: [0, 1.0, 1.6], particleSize: 0.012, color: '#ffe2b8', opacity: 0.5, intensity: 1.5 });
  scene.add(dust);

  // ------------------------------------------------------------------------------------------- callouts
  const mk = (label, sub, dx, dy) => { const c = new Callout(label, { dx, dy, size: 0.058, color: HUD_GOLD, sub, intensity: 1.7 }); if (c.sub) c.sub.intensity = 1.5;
    c.traverse((o) => { if (o.material) { o.material.depthTest = false; o.material.depthWrite = false; } o.renderOrder = 20; });   // labels float over the land
    scene.add(c); return c; };
  const cCap = mk('LION CAPITAL · SARNATH', "c. 250 BC · INDIA'S NATIONAL EMBLEM", -0.5, -0.3);
  const cEd = mk("ASHOKA'S EDICTS · c. 260 BC", 'NONVIOLENCE · TOLERANCE · CARE FOR ALL LIVING BEINGS', -0.5, -0.12);
  const cWh = mk('THE ASHOKA CHAKRA · 24 SPOKES', "ON INDIA'S FLAG", 0.42, 0.3);
  const cCh = mk('THE CHARKHA', 'HAND SPINNING · SELF-RELIANCE', 0.36, 0.26);
  const cSM = mk('SALT MARCH · 1930', '385 km TO DANDI', 0.45, -0.22);
  const cInd = mk('INDEPENDENCE · 15 AUGUST 1947', null, -0.42, 0.26);
  const cCon = mk('CONSTITUTION · 26 JANUARY 1950', "THE WORLD'S LARGEST DEMOCRACY", -0.45, -0.3);
  const REF = 4.4;                                          // callouts are authored for this camera distance
  const anchors = {
    cap: V3(-CAP.abacusR * 0.95, CAP.wheelY - 0.05, CAP.abacusR * 0.3),
    ed: V3(-Math.sin(0.9) * 0.345, -0.62, Math.cos(0.9) * 0.345),
    ind: POLE.clone().add(V3(0.1, POLE_H - 0.1, 0)),
    con: V3(-14, GROUND_Y + 0.5, SEA_Z + 4),
  };
  const place = (c, anchor, p, out = 1) => {
    c.position.copy(anchor);
    faceCamera(c, camera);
    c.scale.setScalar(camera.position.distanceTo(anchor) / REF * Math.tan(camera.fov * Math.PI / 360) / Math.tan(17.5 * Math.PI / 180));
    c.reveal(p, out);
    c.visible = p > 0 && out > 0;
  };

  // ------------------------------------------------------------------------------------------- camera path
  // [t, camera position, look-at point]; the look is splined as a direction from the camera (no overshoot
  // when the target leaps from the wheel to the far road)
  const SHOT = [
    [-0.4, V3(-1.5, 0.62, 3.75), V3(-1.02, 1.12, -0.36)],
    [0.0, V3(-1.3, 0.62, 3.6), V3(-0.95, 1.12, -0.33)],
    [tEd - 0.1, V3(-0.75, 0.42, 3.5), V3(-0.82, 0.8, -0.2)],
    [tEd + 0.45, V3(-0.12, -0.24, 3.4), V3(-0.6, -0.56, 0)],
    [tWh - 0.05, V3(0.0, -0.14, 3.45), V3(-0.35, -0.3, 0.1)],
    [tWh + 0.22, V3(0.1, 0.5, 4.2), V3(0.0, 1.05, 1.1)],
    [tWh + 0.5, V3(0.2, 1.0, 4.85), W.clone()],
    [tCh, V3(0.42, 1.08, 4.95), W.clone()],
    [tSM - 0.14, V3(1.2, 1.25, 4.85), W.clone().add(V3(0.5, -0.1, 0))],
    [tSM + 0.4, V3(3.3, 3.4, 10.2), V3(-4, -3.2, -40)],
    [tRep + 0.3, V3(5.0, 6.0, 13.6), V3(-7, -6.2, -80)],
    [DUR + 0.5, V3(5.6, 6.6, 14.8), V3(-8, -6.2, -88)],
  ];
  const camKeys = SHOT.map(([t, p]) => [t, p]);
  const dirKeys = SHOT.map(([t, p, l]) => [t, l.clone().sub(p).normalize()]);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const dof = { focus: 5, range: 1.5, amount: 0.35 };
  const bloom = { strength: 0.7 };
  let subject = { centre: V3(0, 1.0, 0), radius: 1.3 };

  // wheel spin: eases up to speed after it lifts off (integrated analytically: pure in t)
  const spin = (t) => { const a = t - tWh, T0 = 0.45, w = 2.6; return a <= 0 ? 0 : a < T0 ? w * a * a / (2 * T0) : w * T0 / 2 + w * (a - T0); };

  function update(t, info) {
    // --------------------------------------------------------------- camera
    spline(camKeys, t, camPos);
    spline(dirKeys, t, camLook).normalize();
    camPos.x += Math.sin(t * 0.8) * 0.02; camPos.y += Math.sin(t * 1.1 + 1) * 0.012;
    camera.position.copy(camPos);
    camera.lookAt(camLook.add(camPos));
    camera.fov = 35 - 13 * envelope(t, tEd - 0.05, tWh + 0.5, 0.5, 0.45) + 2 * ramp(t, tSM - 0.1, tRep + 0.3);
    camera.updateProjectionMatrix();

    // --------------------------------------------------------------- light & atmosphere: dawn → hush → swell → day
    const hush = envelope(t, tEd - 0.15, tWh + 0.1, 0.3, 0.15);
    const swell = ramp(t, tWh - 0.05, tWh + 0.35, ease.outCubic);
    const lift = ramp(t, tSM - 0.1, tSM + 0.4, ease.inOutSine);
    const rep = ramp(t, tRep - 0.05, tRep + 0.45, ease.outCubic);
    sun.intensity = (3.0 + 0.5 * swell - 0.2 * lift) * (1 - 0.32 * hush);
    rim.intensity = 1.1 * (1 - 0.3 * hush) + 0.4 * swell;
    hemi.intensity = 0.38 + 0.45 * lift;
    skyU.uLift.value = (1.0 + 0.1 * swell + 0.2 * lift + 0.15 * rep) * (1 - 0.18 * hush);
    skyU.uTime.value = t;
    scene.environmentIntensity = 0.2 + 0.03 * swell;
    mistU.uTime.value = t;
    mistU.uOp.value = 1 - ramp(t, tSM - 0.25, tSM + 0.35);
    for (const m of mists) m.visible = mistU.uOp.value > 0.002;
    scene.fog.density = lerp(0.0095, 0.0036, lift);                         // morning haze over the plain
    seaU.uFogD.value = scene.fog.density;
    scene.fog.color.setRGB(0.5, 0.35, 0.28).lerp(FOG_DAY, lift).multiplyScalar(skyU.uLift.value);

    // --------------------------------------------------------------- the inscription (the hush)
    insU.uP.value = t < tEd - 0.1 ? -0.05 : lerp(-0.02, 1.02, ramp(t, tEd - 0.05, tEd + 0.72, ease.inOutSine));
    insU.uGlow.value = 0.45 + 0.35 * swell;

    // --------------------------------------------------------------- the wheel lifts off in gold and turns
    const fly = ramp(t, tWh - 0.02, tWh + 0.5, ease.inOutCubic);
    const ang = spin(t);
    chakra.visible = t > tWh - 0.05 && t < tCh + 0.4;
    chakra.position.copy(WHEEL_FROM).lerp(W, fly);
    chakra.position.y += Math.sin(Math.PI * fly) * 0.12;
    const sc = lerp(CAP.wheelR * 1.03, 0.53, ease.inOutSine(fly));
    chakra.scale.setScalar(sc);
    chakra.rotation.set(0, 0, -ang);
    gold.emissiveIntensity = 0.03 + 0.13 * envelope(t, tWh - 0.05, tCh + 0.3, 0.25, 0.4) * lerp(0.4, 1, ramp(t, tWh + 0.3, tWh + 0.5)) + 0.12 * Math.exp(-Math.max(0, t - tWh) * 5) * (t > tWh ? 1 : 0);
    const out = ramp(t, tCh - 0.04, tCh + 0.3, ease.inOutSine);
    setDis(chakraU, 1, out);
    const radiance = envelope(t, tWh, tCh + 0.25, 0.35, 0.35);
    raysU.uI.value = radiance * lerp(0.3, 1, fly) * (0.55 + 0.06 * Math.sin(t * 9));
    raysU.uRot.value = ang / 24 * 1.0 + t * 0.05;
    rays.visible = radiance > 0.001;
    rays.position.copy(chakra.position).addScaledVector(tmp.copy(camera.position).sub(chakra.position).normalize(), -0.08);
    faceCamera(rays, camera);
    rays.scale.setScalar(sc * 10.5);
    halo.position.copy(chakra.position);
    halo.material.opacity = radiance * 0.1;
    halo.visible = radiance > 0.001;
    halo.scale.setScalar(sc * 4.5);
    wheelLight.position.copy(chakra.position).add(V3(0, 0.1, -0.9));
    wheelLight.intensity = radiance * fly * fly * 1.6;

    // --------------------------------------------------------------- the charkha
    const ckIn = ramp(t, tCh - 0.06, tCh + 0.26, ease.inOutSine), ckFr = ramp(t, tCh + 0.06, tCh + 0.42, ease.inOutSine);
    const ckOut = ramp(t, tSM - 0.16, tSM + 0.1, ease.inOutSine);
    setDis(ckWheelU, ckIn, ckOut); setDis(ckFrameU, ckFr, ckOut);
    charkha.visible = ckIn > 0 && ckOut < 1;
    ckWheel.rotation.z = -ang;
    yarn.progress = ramp(t, tCh + 0.25, tCh + 0.6, ease.outCubic);
    yarn.opacity = 1 - ckOut;
    cotton.material.opacity = ramp(t, tCh + 0.45, tCh + 0.6) * (1 - ckOut);
    cotton.visible = cotton.material.opacity > 0.01;

    // --------------------------------------------------------------- the march & the republic
    walkU.uTime.value = t;
    walkers.visible = shadows.visible = t > tSM - 0.35;
    seaU.uGlow.value = 0.2 * lift + 0.8 * rep;
    const unfurl = ramp(t, tRep - 0.1, tRep + 0.42, ease.outCubic);
    flag.visible = unfurl > 0.01;
    {
      const p = flagGeo.attributes.position, A = flagRest;
      for (let i = 0; i < p.count; i++) {
        const x = A[i * 3], y = A[i * 3 + 1], u = x / FLAG_W;
        const w = (0.16 + 0.1 * u) * u * Math.sin(u * 7.5 - t * 7.0 + y * 0.6) + 0.05 * u * Math.sin(u * 13 - t * 11 + y * 1.7);
        p.setXYZ(i, x * lerp(0.06, 1, unfurl) , y * lerp(0.92, 1, unfurl) - u * u * 0.25 * (1 - unfurl), w * (0.4 + 0.6 * unfurl));
      }
      p.needsUpdate = true;
      flagGeo.computeVertexNormals();
    }
    pole.visible = finial.visible = t > tSM - 0.4;

    // --------------------------------------------------------------- callouts
    place(cCap, anchors.cap, ramp(t, tLion + 0.3, tLion + 0.75, ease.outCubic), 1 - ramp(t, tEd + 0.05, tEd + 0.3));
    place(cEd, anchors.ed, ramp(t, tEd + 0.2, tEd + 0.62, ease.outCubic), 1 - ramp(t, tWh + 0.02, tWh + 0.25));
    place(cWh, tmp.set(0.44, 0.24, 0).multiplyScalar(sc / 0.53).add(chakra.position), ramp(t, tWh + 0.35, tWh + 0.68, ease.outCubic), 1 - ramp(t, tCh - 0.02, tCh + 0.15));
    place(cCh, W.clone().add(V3(S.x + 0.02, S.y + 0.05, 0.1)), ramp(t, tCh + 0.2, tCh + 0.5, ease.outCubic), 1 - ramp(t, tSM - 0.2, tSM));
    place(cSM, LEAD.clone().addScaledVector(ROAD_D, WALK_SPEED * t).add(V3(0, 2.0, 0)), ramp(t, tSM + 0.2, tSM + 0.52, ease.outCubic), 1 - ramp(t, tRep + 0.12, tRep + 0.3));
    place(cInd, anchors.ind, ramp(t, tRep + 0.1, tRep + 0.42, ease.outCubic));
    place(cCon, anchors.con, ramp(t, tRep + 0.18, tRep + 0.5, ease.outCubic));

    // --------------------------------------------------------------- lens & grade
    dust.tick(t, info);
    dust.u.opacity = 0.45 * (1 - lift);
    dust.visible = lift < 1;
    if (t < tWh + 0.1) { dof.focus = camera.position.distanceTo(tmp.set(0, lerp(1.2, -0.5, ramp(t, tEd - 0.2, tEd + 0.3)), lerp(0.1, 0.33, ramp(t, tEd - 0.2, tEd + 0.3)))); dof.range = 1.6; dof.amount = 0.2; }
    else if (t < tSM) { dof.focus = camera.position.distanceTo(chakra.visible ? chakra.position : W); dof.range = 1.2; dof.amount = 0.35; }
    else { dof.focus = lerp(camera.position.distanceTo(W), 70, ramp(t, tSM, tSM + 0.4)); dof.range = lerp(1, 60, ramp(t, tSM, tSM + 0.4)); dof.amount = lerp(0.35, 0.08, ramp(t, tSM, tSM + 0.4)); }
    bloom.strength = 0.7 + 0.15 * radiance - 0.1 * hush + 0.05 * rep;
    api.exposure = (1.0 + 0.12 * swell + 0.05 * rep) * (1 - 0.1 * hush);

    if (t < tWh + 0.3) subject = { centre: V3(0, 0.7, 0), radius: 1.5 };
    else if (t < tSM + 0.1) subject = { centre: W.clone().add(V3(0.45, -0.1, 0)), radius: 1.3 };
    else subject = { centre: ROAD_O.clone().addScaledVector(ROAD_D, 40), radius: 45 };
  }

  const api = {
    scene, camera, update, dof, bloom, exposure: 1,
    arSubject: () => subject,
    exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomIn: 0.4, zoomOut: 2.5 },
  };
  return api;
}
