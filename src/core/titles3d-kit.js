// Shared toolkit for the 3D chapter-title treatments (see words3d.js):
//   - facetMaterial: one physically based letter material whose FRONT FACE, BEVEL and
//     SIDES each get their own finish (marble face + gold inlay bevel, cast bronze with
//     polished edges, forged iron with ember-hot edges…), plus low emissive terms the
//     treatments animate (light sweep, landing flash, glow, edge heat, surface pattern).
//   - small helpers for the gold companion graphics (hairlines, sampled polylines,
//     streak particles, glow dots). Everything is built once; updates never allocate.
import * as THREE from 'three';
import { GLSL_NOISE } from '../lib/noise.js';
import { progressLine } from '../lib/lines.js';
import { dotTexture } from '../lib/textures.js';

// The film's 10% accent (60-30-10 grade) — every companion graphic is drawn in it.
export const GOLD = '#f0b445';
export const GOLD_HOT = '#ffd89a';

const PATTERN = { none: 0, marble: 1, parchment: 2, circuit: 3, brushed: 4, forged: 5, patina: 6, pearl: 7 };

// look: { face|edge|side: { color, metal, rough }, pattern, env, clearcoat, sheen, iridescence,
//         glow, edgeGlow, flash, pat (emissive colours) }
export function facetMaterial(look, env, shared, key) {
  const f = look.face, e = look.edge ?? f, s = look.side ?? f;
  const m = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 1, roughness: 1, envMap: env, envMapIntensity: look.env ?? 0.6,
    transparent: true, fog: false,
    clearcoat: look.clearcoat ?? 0, clearcoatRoughness: look.clearcoatRoughness ?? 0.18,
    sheen: look.sheen ?? 0, sheenColor: new THREE.Color(look.sheenColor ?? '#ffffff'), sheenRoughness: 0.45,
    iridescence: look.iridescence ?? 0, iridescenceIOR: 1.35,
  });
  const u = {
    ...shared,
    uFlash: { value: 0 }, uGlow: { value: 0 }, uEdgeGlow: { value: 0 }, uPattern: { value: 0 },
    uLetterX: { value: 0 },
  };
  m.userData.u = u;
  const pattern = PATTERN[look.pattern ?? 'none'];
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.defines = { ...(sh.defines ?? {}), W3_PATTERN: pattern };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uWordInv; varying vec3 vWordPos; varying vec3 vObjN; varying vec3 vObjP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vObjP = transformed; vObjN = objectNormal;
        vWordPos = (uWordInv * modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWordPos; varying vec3 vObjN; varying vec3 vObjP;
        uniform float uSweep, uSweepW, uSweepK, uTime, uClipY, uCap, uFlash, uGlow, uEdgeGlow, uPattern, uLetterX;
        uniform vec3 uTint, uFaceCol, uEdgeCol, uSideCol, uGlowCol, uEdgeGlowCol, uFlashCol, uPatCol;
        uniform vec2 uFaceMR, uEdgeMR, uSideMR;
        ${GLSL_NOISE}
        float w3hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vWordPos.y < uClipY) discard;                     // rise-out-of-the-plinth reveals
        float nzA = abs(normalize(vObjN).z);
        float fFace = smoothstep(0.9, 0.985, nzA);
        float fSide = 1.0 - smoothstep(0.04, 0.25, nzA);
        float fEdge = clamp(1.0 - fFace - fSide, 0.0, 1.0);
        vec3 fP = vObjP + vec3(uLetterX, 0.0, 0.0);           // pattern space: stuck to the letter, continuous across the word
        vec3 fCol = uFaceCol * fFace + uEdgeCol * fEdge + uSideCol * fSide;
        float fRough = 0.0, fMetal = 0.0, fPat = 0.0;
        #if W3_PATTERN == 1
          // veined marble (face + sides; the bevel stays gold inlay)
          float n1 = snoise(fP * 1.4), n2 = snoise(fP * 3.3 + 7.0);
          float band = abs(sin((fP.x * 0.85 + fP.y * 1.9 + n1 * 1.5 + n2 * 0.45) * 3.3));
          float vein = pow(1.0 - band, 12.0) * 0.8 + pow(1.0 - band, 3.0) * 0.1;
          fCol = mix(fCol, fCol * vec3(0.5, 0.48, 0.46), vein * (1.0 - fEdge)) * (0.97 + 0.05 * n2);
          fRough += vein * 0.12;
        #elif W3_PATTERN == 2
          // parchment: mottled, fibrous, darker blotches
          float pn = snoise(fP * 1.1) * 0.5 + snoise(fP * 4.2) * 0.3 + snoise(fP * 11.0) * 0.12;
          float fib = snoise(vec3(fP.x * 1.6, fP.y * 26.0, fP.z));
          fCol *= mix(1.0, (0.86 + 0.14 * pn) * (1.0 - 0.04 * fib), 1.0 - fEdge);
          fRough += 0.08 * fib;
        #elif W3_PATTERN == 3
          // silicon die: etched gold micro-traces on the face
          vec2 g = fP.xy * 6.5; vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
          float h = w3hash(id);
          float tr = h < 0.5 ? abs(fr.x) : abs(fr.y);
          float trace = (1.0 - smoothstep(0.04, 0.09, tr)) * step(0.3, fract(h * 7.13));
          float via = 1.0 - smoothstep(0.1, 0.17, length(fr));
          fPat = max(trace, via * step(0.78, h)) * fFace;
          fCol = mix(fCol, uEdgeCol * 0.55, fPat * 0.7);
          fMetal += fPat * 0.6; fRough -= fPat * 0.05;
        #elif W3_PATTERN == 4
          // brushed / turned metal: fine horizontal grain
          float gr = snoise(vec3(fP.x * 0.7, fP.y * 95.0, fP.z * 3.0));
          fRough += 0.07 * gr; fCol *= 1.0 + 0.035 * gr;
        #elif W3_PATTERN == 5
          // forged iron: hammered mottling + faint hot fissures on the face
          float fn = snoise(fP * 3.0) * 0.5 + snoise(fP * 8.0) * 0.25;
          fCol *= 0.72 + 0.4 * (fn * 0.5 + 0.5);
          fRough += 0.14 * snoise(fP * 11.0);
          fPat = pow(1.0 - abs(snoise(fP * vec3(1.8, 2.2, 1.8) + 3.0)), 40.0) * fFace;
        #elif W3_PATTERN == 6
          // cast bronze: dark patina mottling on the face, the chisel edges worn bright
          float bn = snoise(fP * 2.4) * 0.5 + snoise(fP * 7.0) * 0.25;
          fCol *= mix(1.0, 0.72 + 0.36 * (bn * 0.5 + 0.5), 1.0 - fEdge);
          fRough += 0.12 * bn * (1.0 - fEdge);
        #elif W3_PATTERN == 7
          // pearl: soft cloudy nacre
          float pl = snoise(fP * 2.2) * 0.5 + snoise(fP * 5.0) * 0.25;
          fCol *= 0.97 + 0.05 * pl;
        #endif
        diffuseColor.rgb *= fCol;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        vec2 fMR = uFaceMR * fFace + uEdgeMR * fEdge + uSideMR * fSide;
        metalnessFactor = clamp(fMR.x + fMetal, 0.0, 1.0);
        roughnessFactor = clamp(fMR.y + fRough, 0.04, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // light sweep across the word (its own space), kept low: the words never blow out
          float band = exp(-pow((vWordPos.x + vWordPos.y * 0.35 - uSweep) / uSweepW, 2.0));
          float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.5);
          float flick = 0.72 + 0.28 * snoise(vec3(fP.xy * 3.0, uTime * 1.7));
          totalEmissiveRadiance += uTint * band * uSweepK * (0.4 + 0.6 * max(fEdge, fFace * 0.6));
          totalEmissiveRadiance += uGlowCol * uGlow;
          totalEmissiveRadiance += uEdgeGlowCol * uEdgeGlow * (fEdge + fSide * 0.4 + fres * 0.4 + fPat * 0.8) * flick;
          totalEmissiveRadiance += uFlashCol * uFlash * (fEdge + 0.2);
          totalEmissiveRadiance += uPatCol * uPattern * fPat;
        }`)
      .replace('#include <opaque_fragment>', `{
          // soft-knee cap on the lit surface (scene lights vary a lot): the words never blow out,
          // only their small emissive accents may kiss the bloom threshold
          vec3 litC = max(outgoingLight - totalEmissiveRadiance, vec3(0.0));
          float lumC = dot(litC, vec3(0.2126, 0.7152, 0.0722)), kneeC = uCap * 0.55;
          if (lumC > kneeC) litC *= (kneeC + (uCap - kneeC) * (1.0 - exp(-(lumC - kneeC) / (uCap - kneeC)))) / lumC;
          outgoingLight = litC + totalEmissiveRadiance;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => `word3d-v3-${key}`;
  return m;
}

// Word-level uniforms shared by every letter of one title.
export function sharedUniforms(look) {
  const f = look.face, e = look.edge ?? f, s = look.side ?? f;
  const col = (c) => ({ value: new THREE.Color(c) });
  return {
    uSweep: { value: -99 }, uSweepW: { value: 0.45 }, uSweepK: { value: look.sweep ?? 0.22 }, uTime: { value: 0 },
    uClipY: { value: -99 }, uCap: { value: look.cap ?? 0.78 }, uWordInv: { value: new THREE.Matrix4() },
    uTint: col(look.tint ?? '#ffe6b8'),
    uFaceCol: col(f.color), uEdgeCol: col(e.color), uSideCol: col(s.color),
    uFaceMR: { value: new THREE.Vector2(f.metal, f.rough) }, uEdgeMR: { value: new THREE.Vector2(e.metal, e.rough) },
    uSideMR: { value: new THREE.Vector2(s.metal, s.rough) },
    uGlowCol: col(look.glow ?? GOLD_HOT), uEdgeGlowCol: col(look.edgeGlow ?? GOLD), uFlashCol: col(look.flash ?? GOLD_HOT),
    uPatCol: col(look.pat ?? GOLD),
  };
}

// Gold hairline through points (lib progressLine) — the companion graphics' basic stroke.
export function hairline(points, { color = GOLD, intensity = 0.9, opacity = 0.7, head = 0.05, fade = 0, closed = false, headColor = GOLD_HOT } = {}) {
  const l = progressLine(points, { color, headColor, intensity, opacity, head, fade, closed });
  l.progress = 0;
  l.renderOrder = 2;
  return l;
}

// Arc-length sampled polyline (for things that ride a path: planets, data pulses, contrails).
export class Polyline {
  constructor(points) {
    this.p = points.map((v) => v.clone());
    this.len = [0];
    for (let i = 1; i < this.p.length; i++) this.len.push(this.len[i - 1] + this.p[i].distanceTo(this.p[i - 1]));
    this.total = this.len[this.len.length - 1] || 1;
  }
  at(u, out) {
    const d = Math.min(Math.max(u, 0), 1) * this.total, L = this.len;
    let lo = 0, hi = L.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] < d) lo = mid; else hi = mid; }
    const seg = L[hi] - L[lo] || 1;
    return out.copy(this.p[lo]).lerp(this.p[hi], (d - L[lo]) / seg);
  }
}

// Additive line segments with per-vertex colour, rewritten every frame (sparks, arcs).
export function dynamicSegments(count) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 6), col = new Float32Array(count * 6);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false;
  l.renderOrder = 3;
  return l;
}

// Additive round points with per-vertex colour (data pulses, glints). size is set per frame.
export function dynamicPoints(count, color = GOLD_HOT) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.PointsMaterial({
    size: 0.05, map: dotTexture(), vertexColors: true, color, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, toneMapped: false, fog: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 3;
  return p;
}

// Deterministic hash in [0, 1).
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); };
