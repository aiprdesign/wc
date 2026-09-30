// Per-sequence image-based lighting. Instead of one neutral grey studio for every scene, each
// sequence gets a procedural environment built from its own lights: soft "softbox" lobes in the
// directions (and colours) of its key and rim lights, a sky / ground gradient taken from its
// hemisphere light (or, failing that, from the key's colour), so metals and marble reflect the
// light that actually falls on them and the ambient term has direction and colour instead of a
// flat grey. The result is normalised to the average irradiance of the studio room it replaces,
// so each scene's authored `scene.environmentIntensity` keeps meaning what it meant.
// Built once per sequence at load (a PMREM of a single shaded sphere): no per-frame cost.
import * as THREE from 'three';

// Average irradiance of three's RoomEnvironment (measured: E(±X, ±Y, ±Z) mean over the six axes).
const ROOM_IRRADIANCE = 1.06;

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// Gather the scene's directional / spot lights: world direction towards the light, colour and
// illuminance at the subject. `peak` maps light → the largest intensity seen during warm-up.
export function sceneLights(scene, peak = new Map()) {
  const out = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isLight || o.userData?.noEnv) return;
    const I = Math.max(peak.get(o) ?? 0, o.intensity);
    if (!(I > 0)) return;
    if (o.isDirectionalLight || o.isSpotLight) {
      o.getWorldPosition(p); o.target.getWorldPosition(q);
      const d = p.clone().sub(q), dist = d.length();
      if (!(dist > 1e-6)) return;
      const E = o.isSpotLight ? I / Math.max(1, dist * dist) : I;
      out.push({ dir: d.normalize(), color: o.color.clone(), E: E * lum(o.color) });
    } else if (o.isHemisphereLight) {
      out.push({ hemi: true, sky: o.color.clone(), ground: o.groundColor.clone(), E: I });
    }
  });
  return out;
}

const MAX_BOX = 3;
function envMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    uniforms: {
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uDir: { value: Array.from({ length: MAX_BOX }, () => new THREE.Vector3(0, 1, 0)) },
      uCol: { value: Array.from({ length: MAX_BOX }, () => new THREE.Color(0, 0, 0)) },
      uSize: { value: new Array(MAX_BOX).fill(0.3) },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGround; uniform vec3 uDir[${MAX_BOX}]; uniform vec3 uCol[${MAX_BOX}]; uniform float uSize[${MAX_BOX}];
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, d.y));
        // the ground: darker straight down (the object's own shadow), a bright band near the horizon
        vec3 gnd = uGround * mix(1.0, 0.55, smoothstep(-0.1, -0.9, d.y));
        vec3 c = mix(gnd, sky, smoothstep(-0.04, 0.04, d.y));
        for (int i = 0; i < ${MAX_BOX}; i++) {
          float a = acos(clamp(dot(d, uDir[i]), -1.0, 1.0));
          c += uCol[i] * (1.0 - smoothstep(uSize[i] * 0.55, uSize[i], a));   // soft-edged round softbox
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// Irradiance (for the six axis normals, averaged) of the analytic environment: numerical, on the CPU.
function meanIrradiance(u) {
  const dirs = [], N = 24;
  for (let i = 0; i < N; i++) for (let j = 0; j < N * 2; j++) {
    const th = Math.acos(1 - 2 * (i + 0.5) / N), ph = (j + 0.5) / (N * 2) * Math.PI * 2;
    dirs.push(new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)));
  }
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let sum = 0;
  for (const d of dirs) {
    const sky = u.uHorizon.value.clone().lerp(u.uZenith.value, sm(0, 0.7, d.y));
    const gnd = u.uGround.value.clone().multiplyScalar(1 + (0.55 - 1) * sm(-0.1, -0.9, d.y));
    const c = gnd.lerp(sky, sm(-0.04, 0.04, d.y));
    for (let i = 0; i < MAX_BOX; i++) {
      const a = Math.acos(Math.min(1, Math.max(-1, d.dot(u.uDir.value[i]))));
      c.addScaledVector(u.uCol.value[i], 1 - sm(u.uSize.value[i] * 0.55, u.uSize.value[i], a));
    }
    sum += lum(c);
  }
  // mean radiance == mean over the six axes of irradiance / π for any environment
  return sum / dirs.length;
}

/**
 * Build a PMREM environment matched to `lights` (from sceneLights). Returns a texture, or null
 * when the scene has no usable key light (it then keeps the default studio).
 */
export function buildSceneEnvironment(renderer, lights, { size = 128, level = 1, look = {} } = {}) {
  const keys = lights.filter((l) => !l.hemi && l.E > 0).sort((a, b) => b.E - a.E).slice(0, MAX_BOX);
  if (!keys.length) return null;
  const hemi = lights.filter((l) => l.hemi).sort((a, b) => b.E - a.E)[0];
  const mat = envMaterial(), u = mat.uniforms;
  const key = keys[0].color.clone();
  const keyChroma = key.clone().multiplyScalar(1 / Math.max(1e-4, lum(key)));
  // sky and ground: the hemisphere light's colours when the scene has one; otherwise a dim sky
  // tinted by the key and a ground that bounces the key's colour (warm floors under warm light)
  if (hemi) {
    const hs = hemi.sky.clone(), hg = hemi.ground.clone();
    u.uZenith.value.copy(hs).multiplyScalar(0.8);
    u.uHorizon.value.copy(hs).lerp(new THREE.Color(1, 1, 1).multiplyScalar(lum(hs)), 0.4);
    u.uGround.value.copy(hg).lerp(keyChroma.clone().multiplyScalar(Math.max(lum(hg), 0.02)), 0.5);
  } else {
    const grey = new THREE.Color(1, 1, 1);
    u.uZenith.value.copy(grey.clone().lerp(keyChroma, 0.35)).multiplyScalar(0.35);
    u.uHorizon.value.copy(grey.clone().lerp(keyChroma, 0.5)).multiplyScalar(0.55);
    u.uGround.value.copy(keyChroma).multiplyScalar(0.3);
  }
  if (look.zenith) u.uZenith.value.set(look.zenith);
  if (look.horizon) u.uHorizon.value.set(look.horizon);
  if (look.ground) u.uGround.value.set(look.ground);
  // normalise the ambient gradient so it carries `ambient` of the energy, the softboxes the rest
  const ambient = look.ambient ?? 0.75;   // the key itself is an analytic light: the softboxes only add its bounce and size
  const zero = () => { for (let i = 0; i < MAX_BOX; i++) u.uCol.value[i].setRGB(0, 0, 0); };
  zero();
  const a0 = meanIrradiance(u);
  const sA = a0 > 1e-6 ? (ROOM_IRRADIANCE * ambient) / a0 : 0;
  for (const k of ['uZenith', 'uHorizon', 'uGround']) u[k].value.multiplyScalar(sA);
  const Etot = keys.reduce((s, k) => s + k.E, 0);
  keys.forEach((k, i) => {
    u.uDir.value[i].copy(k.dir);
    u.uSize.value[i] = i === 0 ? 0.5 : 0.6;            // radians: large, soft lobes (bounce around the key's direction)
    u.uCol.value[i].copy(k.color).multiplyScalar(1 / Math.max(1e-4, lum(k.color))).multiplyScalar(k.E / Etot);
  });
  const withBoxes = meanIrradiance(u) - ROOM_IRRADIANCE * ambient;
  const sB = withBoxes > 1e-6 ? (ROOM_IRRADIANCE * (1 - ambient)) / withBoxes : 0;
  for (let i = 0; i < MAX_BOX; i++) u.uCol.value[i].multiplyScalar(sB);
  for (const k of ['uZenith', 'uHorizon', 'uGround']) u[k].value.multiplyScalar(level);
  for (let i = 0; i < MAX_BOX; i++) u.uCol.value[i].multiplyScalar(level);

  const scene = new THREE.Scene();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat);
  scene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02, 0.1, 100, { size }).texture;
  pmrem.dispose(); sphere.geometry.dispose(); mat.dispose();
  return tex;
}
