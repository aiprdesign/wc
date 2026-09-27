// GPU particle systems. All motion is computed in the vertex shader from
// uniforms (time, mix, scatter…) so the state is a pure function of time.
import * as THREE from 'three';
import { GLSL_NOISE } from './noise.js';
import { rng } from './math.js';

const vert = /* glsl */ `
${GLSL_NOISE}
attribute vec3 aTarget;
attribute vec4 aSeed;
attribute vec3 aColor;
uniform float uTime, uMix, uStagger, uNoise, uNoiseFreq, uNoiseSpeed, uSize, uViewport, uScatter, uSwirl, uTwinkle, uSizeJitter;
uniform vec3 uScatterCenter;
uniform float uUseColor;
varying vec3 vColor;
varying float vAlpha;
void main(){
  float m = clamp((uMix - aSeed.x * uStagger) / max(1e-4, 1.0 - uStagger), 0.0, 1.0);
  m = m * m * (3.0 - 2.0 * m);
  vec3 p = mix(position, aTarget, m);
  // turbulence strongest mid-flight, plus a constant drift amount
  float flight = sin(3.14159 * m);
  vec3 n = snoise3(p * uNoiseFreq + vec3(uTime * uNoiseSpeed) + aSeed.yzw * 10.0);
  p += n * (uNoise + flight * uNoise * 2.0);
  // explode outward from uScatterCenter
  vec3 dir = normalize(p - uScatterCenter + (aSeed.yzw - 0.5) * 0.6);
  p += dir * uScatter * (0.4 + aSeed.y * 1.2);
  // swirl around Y axis
  float ang = uSwirl * (0.5 + aSeed.z) * (1.0 - m * 0.0);
  float cs = cos(ang), sn = sin(ang);
  p.xz = mat2(cs, -sn, sn, cs) * p.xz;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = uSize * (1.0 - uSizeJitter + uSizeJitter * 2.0 * aSeed.w);
  // true world-space diameter: uSize world units → pixels
  gl_PointSize = s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
  vColor = mix(vec3(1.0), aColor, uUseColor);
  vAlpha = 1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * (2.0 + aSeed.x * 6.0) + aSeed.y * 40.0));
}`;
const frag = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uIntensity;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a = a * a;
  if (a * uOpacity * vAlpha < 0.003) discard;
  gl_FragColor = vec4(uColor * vColor * uIntensity, a * uOpacity * vAlpha);
}`;

// MorphParticles: points that travel from `positions` (A) to `targets` (B) as uniforms.mix goes 0→1.
//   p.u.mix, p.u.stagger (0..0.9 per-particle delay), p.u.noise (world amplitude), p.u.noiseFreq,
//   p.u.scatter (explode distance), p.u.swirl (radians), p.u.size (WORLD-space diameter of a particle),
//   p.u.opacity, p.u.intensity (HDR), p.u.time (set every frame), p.u.color
// Call setA()/setB() to swap shapes for multi-stage morphs.
export class MorphParticles extends THREE.Points {
  constructor({ count, positions, targets, colors = null, size = 0.05, color = '#ffffff', opacity = 1, intensity = 1.5, additive = true, seed = 1, stagger = 0.35 } = {}) {
    const geo = new THREE.BufferGeometry();
    const a = positions ?? new Float32Array(count * 3);
    const b = targets ?? a.slice();
    geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    geo.setAttribute('aTarget', new THREE.BufferAttribute(b, 3));
    const r = rng(seed);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < seeds.length; i++) seeds[i] = r();
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors ?? new Float32Array(count * 3).fill(1), 3));
    const uniforms = {
      uTime: { value: 0 }, uMix: { value: 0 }, uStagger: { value: stagger }, uNoise: { value: 0 },
      uNoiseFreq: { value: 0.6 }, uNoiseSpeed: { value: 0.15 }, uSize: { value: size },
      uViewport: { value: 800 }, uScatter: { value: 0 }, uSwirl: { value: 0 }, uTwinkle: { value: 0 },
      uSizeJitter: { value: 0.5 }, uScatterCenter: { value: new THREE.Vector3() },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uIntensity: { value: intensity },
      uUseColor: { value: colors ? 1 : 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    super(geo, mat);
    this.count = count;
    this.frustumCulled = false;
    // Friendly proxy: p.u.mix = 0.5 instead of p.material.uniforms.uMix.value = 0.5
    this.u = new Proxy({}, {
      get: (_, k) => { const n = 'u' + k[0].toUpperCase() + k.slice(1); const v = uniforms[n].value; return v; },
      set: (_, k, v) => { const n = 'u' + k[0].toUpperCase() + k.slice(1); if (uniforms[n].value?.isColor || uniforms[n].value?.isVector3) uniforms[n].value.copy(v); else uniforms[n].value = v; return true; },
    });
  }
  setA(arr) { this.geometry.attributes.position.array.set(arr); this.geometry.attributes.position.needsUpdate = true; }
  setB(arr) { this.geometry.attributes.aTarget.array.set(arr); this.geometry.attributes.aTarget.needsUpdate = true; }
  setColors(arr) { this.geometry.attributes.aColor.array.set(arr); this.geometry.attributes.aColor.needsUpdate = true; this.material.uniforms.uUseColor.value = 1; }
  // Call every frame: p.tick(t, info) — info.height is the render-target height in pixels.
  tick(time, info) { this.material.uniforms.uTime.value = time; this.material.uniforms.uViewport.value = info?.height ?? 800; }
}

// ---------------------------------------------------------------------------
// Shape samplers → Float32Array(n*3)

export function sampleSphere(n, radius = 1, { surface = true, seed = 2, center = [0, 0, 0] } = {}) {
  const r = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const k = surface ? radius : radius * Math.cbrt(r());
    out[i * 3] = center[0] + s * Math.cos(th) * k; out[i * 3 + 1] = center[1] + u * k; out[i * 3 + 2] = center[2] + s * Math.sin(th) * k;
  }
  return out;
}
// Evenly distributed (Fibonacci) sphere, deterministic order — nice for "network nodes".
export function fibonacciSphere(n, radius = 1) {
  const out = new Float32Array(n * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = g * i;
    out[i * 3] = Math.cos(th) * rr * radius; out[i * 3 + 1] = y * radius; out[i * 3 + 2] = Math.sin(th) * rr * radius;
  }
  return out;
}
export function sampleBox(n, sx = 1, sy = 1, sz = 1, { seed = 3, center = [0, 0, 0] } = {}) {
  const r = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    out[i * 3] = center[0] + (r() - 0.5) * sx; out[i * 3 + 1] = center[1] + (r() - 0.5) * sy; out[i * 3 + 2] = center[2] + (r() - 0.5) * sz;
  }
  return out;
}
export function sampleRing(n, radius = 1, { thickness = 0.02, seed = 4, tilt = 0 } = {}) {
  const r = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, k = radius + (r() - 0.5) * thickness;
    const x = Math.cos(a) * k, z = Math.sin(a) * k, y = (r() - 0.5) * thickness;
    out[i * 3] = x; out[i * 3 + 1] = y * Math.cos(tilt) - z * Math.sin(tilt); out[i * 3 + 2] = y * Math.sin(tilt) + z * Math.cos(tilt);
  }
  return out;
}
export function sampleDisk(n, radius = 1, { seed = 5 } = {}) {
  const r = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, k = Math.sqrt(r()) * radius; out[i * 3] = Math.cos(a) * k; out[i * 3 + 1] = Math.sin(a) * k; out[i * 3 + 2] = 0; }
  return out;
}
// Area-weighted random points on a mesh surface (applies the geometry as-is; bake transforms first).
export function sampleGeometry(geometry, n, { seed = 6 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const tris = pos.count / 3;
  const areas = new Float32Array(tris);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < tris; i++) {
    a.fromBufferAttribute(pos, i * 3); b.fromBufferAttribute(pos, i * 3 + 1); c.fromBufferAttribute(pos, i * 3 + 2);
    total += b.sub(a).cross(c.sub(a)).length() * 0.5;
    areas[i] = total;
  }
  const r = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = r() * total;
    let lo = 0, hi = tris - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < x) lo = mid + 1; else hi = mid; }
    a.fromBufferAttribute(pos, lo * 3); b.fromBufferAttribute(pos, lo * 3 + 1); c.fromBufferAttribute(pos, lo * 3 + 2);
    let u = r(), v = r();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    out[i * 3] = a.x + (b.x - a.x) * u + (c.x - a.x) * v;
    out[i * 3 + 1] = a.y + (b.y - a.y) * u + (c.y - a.y) * v;
    out[i * 3 + 2] = a.z + (b.z - a.z) * u + (c.z - a.z) * v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dust motes drifting through volumetric light. update(t) is deterministic.
export class Dust extends MorphParticles {
  constructor({ count = 1500, size = [16, 8, 16], center = [0, 0, 0], color = '#ffe2b0', particleSize = 0.03, opacity = 0.5, intensity = 1.2, seed = 11 } = {}) {
    const p = sampleBox(count, size[0], size[1], size[2], { seed, center });
    super({ count, positions: p, targets: p, size: particleSize, color, opacity, intensity, seed });
    this.u.noise = 0.35; this.u.noiseFreq = 0.25; this.u.noiseSpeed = 0.08; this.u.twinkle = 0.6;
  }
}
