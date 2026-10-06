// THE MASTERY OF METAL (24.5 – 29.0 s) — wootz crucible steel, the Iron Pillar of Delhi, zinc from Zawar.
// Technique: emissive heat shaders (blackbody ramp, cracked glowing charcoal), a world-space cutaway
// (the furnace wall and a sealed crucible open in section), a procedural banded-carbide (wootz) steel shader
// with a sweeping softbox reflection, a daylight architectural set, and a sectional diagram of a
// downward-distillation retort furnace. Every particle is a pure function of time (birth / life / ballistics).
//   A  24.5–26.6  night forge: a clay furnace roars, bag bellows pump on the beat, embers rise (forge 25.0);
//                 at 25.8 the front of the furnace opens in section: sealed crucibles glow white, the hero
//                 crucible in cutaway — iron and plant matter melt into a steel 'button'.
//   B  26.6–27.4  macro along a forged blade: the watered wootz pattern etches in under a sweeping highlight.
//   C  27.4–28.2  daylight, the Qutb complex: the camera circles the Iron Pillar; a thin film shimmers up it.
//   D  28.2–29.0  section of a Zawar retort furnace: zinc vapour drawn down into the cool chamber, silver drops;
//                 the fire bursts into sparks for the 'flash' hand-over.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout, Dimension, faceCamera } from '../../lib/hud.js';
import { progressLine } from '../../lib/lines.js';
import { Dust } from '../../lib/particles.js';
import { GLSL_NOISE, noise3 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { surfaceTexture } from '../industrial-gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// set origins (far apart; each shot shows one set)
const OA = V(0, 0, 0);          // forge
const OB = V(60, 0, 0);         // blade macro
const OC = V(-150, 0, 0);       // Iron Pillar courtyard
const OD = V(150, 0, 0);        // Zawar retort furnace

// blackbody-ish ramp: 0 = dull red … 1 = white heat (HDR, > 1 blooms)
const HOT_GLSL = /* glsl */ `
vec3 hotCol(float k){
  k = max(k, 0.0);
  vec3 c = mix(vec3(0.25, 0.012, 0.0), vec3(0.95, 0.16, 0.012), smoothstep(0.0, 0.3, k));
  c = mix(c, vec3(1.0, 0.45, 0.08), smoothstep(0.25, 0.55, k));
  c = mix(c, vec3(1.0, 0.78, 0.42), smoothstep(0.5, 0.85, k));
  c = mix(c, vec3(1.0, 0.97, 0.88), smoothstep(0.8, 1.1, k));
  return c * (0.08 + 3.2 * k * k);
}`;

// ---------------------------------------------------------------------------------------------------------
// materials

// Unlit glowing material for coals, crucibles, retorts: cracked crust over a hot core, per-piece seed.
// Discards the cut-away front (z > 0 above uCutY, in set-local space); heat can fall off below uY0..uY1.
function hotMaterial({ origin, scale = 18, crack = 1, heat = 1, base = [0.02, 0.015, 0.012], y0 = -100, y1 = -99 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uHeat: { value: heat }, uCrack: { value: crack }, uScale: { value: scale }, uFlick: { value: 1 },
      uCutY: { value: 99 }, uOrigin: { value: origin.clone() }, uY0: { value: y0 }, uY1: { value: y1 }, uBase: { value: new THREE.Vector3(...base) },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform vec3 uOrigin;
      varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vSeed;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vL = w.xyz - uOrigin; vSeed = aSeed;
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}${HOT_GLSL}
      uniform float uTime, uHeat, uCrack, uScale, uFlick, uCutY, uY0, uY1; uniform vec3 uBase;
      varying vec3 vL; varying vec3 vN; varying vec3 vV; varying float vSeed;
      void main(){
        if (vL.z > 0.004 && vL.y > uCutY) discard;
        vec3 q = vL * uScale + vec3(vSeed * 37.0, vSeed * 11.0, 0.0);
        float n = snoise(q + vec3(0.0, 0.0, uTime * 0.35));
        float n2 = snoise(q * 0.45 + vec3(uTime * 0.2, vSeed * 3.0, 1.7));
        float crack = 1.0 - smoothstep(0.0, 0.16, abs(n));
        float heat = uHeat * (0.75 + 0.25 * vSeed) * (0.92 + 0.08 * sin(uTime * 9.0 + vSeed * 40.0)) * uFlick;
        heat *= smoothstep(uY0, uY1, vL.y);
        float k = heat * mix(0.85 + 0.2 * n2, mix(0.5 + 0.2 * n2, 1.12, crack), uCrack);
        float ash = uCrack * (1.0 - crack) * smoothstep(0.1, 0.7, n2) * 0.7;
        float facing = 0.55 + 0.45 * abs(dot(normalize(vN), normalize(vV)));
        vec3 c = hotCol(k) * (1.0 - ash) * facing + (uBase + vec3(0.02) * ash) * facing;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// Flame tongues: additive noise on an open cone, faded at grazing angles so the cone never shows.
function flameMaterial(seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uI: { value: 1 }, uSeed: { value: seed } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `${GLSL_NOISE}${HOT_GLSL}
      uniform float uTime, uI, uSeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float y = vUv.y, ang = vUv.x * 6.2832;
        vec3 q = vec3(cos(ang) * 1.3, y * 2.6 - uTime * 2.6, sin(ang) * 1.3 + uSeed);
        float n = snoise(q) * 0.6 + snoise(q * 2.1 + 3.0) * 0.3 + snoise(q * 4.3 + 7.0) * 0.1;
        float shape = pow(1.0 - y, 1.3) * smoothstep(0.0, 0.15, y);
        float f = smoothstep(0.15, 0.85, shape + n * 0.5 - 0.12);
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        gl_FragColor = vec4(hotCol(0.3 + f * 0.65) * f * facing * uI, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Embers and sparks: one Points draw; per particle birth / life / gravity / size, ballistic with drag and
// turbulence, cooling from white to red over its life.
function makeEmbers(emitters, seed = 9) {
  const r = rng(seed);
  const count = emitters.reduce((s, e) => s + e.count, 0);
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), sd = new Float32Array(count * 4), bl = new Float32Array(count * 4);
  const d = V(0, 0, 0);
  let n = 0;
  for (const e of emitters) for (let i = 0; i < e.count; i++, n++) {
    pos.set([e.pos.x + (r() - 0.5) * e.jitter.x, e.pos.y + (r() - 0.5) * e.jitter.y, e.pos.z + (r() - 0.5) * e.jitter.z], n * 3);
    d.set(e.dir.x + (r() - 0.5) * e.spread, e.dir.y + (r() - 0.5) * e.spread, e.dir.z + (r() - 0.5) * e.spread).normalize().multiplyScalar(e.speed * (0.45 + r()));
    vel.set([d.x, d.y, d.z], n * 3);
    sd.set([r(), r(), r(), r()], n * 4);
    bl.set([e.birth(r(), i / e.count), e.life * (0.6 + 0.8 * r()), e.g, e.size * (0.6 + 0.8 * r())], n * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  g.setAttribute('aBL', new THREE.BufferAttribute(bl, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uViewport: { value: 800 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `${GLSL_NOISE}
      attribute vec3 aVel; attribute vec4 aSeed; attribute vec4 aBL;
      uniform float uTime, uViewport;
      varying float vK; varying float vA;
      void main(){
        float age = uTime - aBL.x;
        if (age < 0.0 || age > aBL.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        float u = age / aBL.y;
        vec3 p = position + aVel * (1.0 - exp(-1.4 * age)) / 1.4;
        p.y += 0.5 * aBL.z * age * age;
        p += snoise3(p * 2.2 + aSeed.xyz * 7.0 + vec3(0.0, -uTime * 0.8, 0.0)) * (0.02 + 0.18 * age) * aSeed.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float s = aBL.w * (1.0 - 0.55 * u);
        gl_PointSize = clamp(s * uViewport * 0.5 * projectionMatrix[1][1] / max(0.02, -mv.z), 1.3, 48.0);
        vK = mix(1.15, 0.32, pow(u, 0.7)) * (0.8 + 0.35 * aSeed.x);
        vA = smoothstep(0.0, 0.04, u) * (1.0 - smoothstep(0.65, 1.0, u)) * (0.65 + 0.35 * sin(uTime * (20.0 + aSeed.y * 30.0) + aSeed.z * 50.0));
      }`,
    fragmentShader: /* glsl */ `${HOT_GLSL}
      uniform float uOpacity; varying float vK; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.08, d);
        if (a * vA < 0.01) discard;
        gl_FragColor = vec4(hotCol(vK) * a * vA * uOpacity * 1.5, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.tick = (t, info) => { m.uniforms.uTime.value = t; m.uniforms.uViewport.value = info?.height ?? 800; };
  return pts;
}

// A soft dark plate behind a callout's label (and sub line), so mono text stays legible over bright plates.
function backCallout(c, { pad = 0.6, alpha = 0.5 } = {}) {
  const l = c.label, h = l.worldHeight * (c.sub ? 1.9 : 1.05), w = Math.max(l.worldWidth, c.sub?.worldWidth ?? 0) + l.worldHeight * pad;
  const cv = mkCanvas(256, 64), g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.08, 'rgba(0,0,0,1)'); grd.addColorStop(0.92, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: toTexture(cv, { srgb: false }), color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  const left = Math.min(l.position.x - l.worldWidth / 2, c.sub ? c.sub.position.x - c.sub.worldWidth / 2 : 1e9);
  m.position.set(left - l.worldHeight * pad / 2 + w / 2, c.sub ? (l.position.y + c.sub.position.y) / 2 : l.position.y, -l.worldHeight * 0.05);
  m.renderOrder = 9;
  c.add(m);
  c.back = { mesh: m, alpha };
  const rev = c.reveal.bind(c);
  c.reveal = (p, o = 1) => { rev(p, o); m.material.opacity = alpha * sat(p * 3 - 0.3) * o; m.visible = m.material.opacity > 0.001; };
  c.reveal(0);
  return c;
}

// ---------------------------------------------------------------------------------------------------------
// geometry helpers

const withSeed = (g, s) => { g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(s), 1)); return g; };
const lathe2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));

// A lathe body that can be shown cut in half (cutaway): `outer` and `inner` profiles ([r, y]) listed so that
// outer ++ inner walks round the wall's cross-section. back = the far half (z < 0) of both skins, cap = the
// cut faces in the z = 0 plane, front = the near half of the outer skin, full = the whole outer body.
function cutLathe(outer, inner, seg = 32) {
  const back = mergeGeometries([new THREE.LatheGeometry(lathe2(outer), seg, Math.PI / 2, Math.PI), new THREE.LatheGeometry(lathe2(inner), seg, Math.PI / 2, Math.PI)]);
  const poly = [...outer, ...inner];
  const cap = mergeGeometries([1, -1].map((s) => new THREE.ShapeGeometry(new THREE.Shape(poly.map(([r, y]) => new THREE.Vector2(s * r, y))))));
  return { back, cap, front: new THREE.LatheGeometry(lathe2(outer), seg, -Math.PI / 2, Math.PI), full: new THREE.LatheGeometry(lathe2(outer), seg) };
}

// Irregular charcoal / ore lumps merged into one geometry with a per-lump seed.
function lumps(n, place, seed, sMin, sMax) {
  const r = rng(seed), parts = [], e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const p = place(r);
    if (!p) continue;
    const s = lerp(sMin, sMax, r());
    const g = new THREE.IcosahedronGeometry(1, 0);
    g.scale(s * (0.75 + 0.5 * r()), s * (0.55 + 0.4 * r()), s * (0.75 + 0.5 * r()));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e.set(r() * TAU, r() * TAU, r() * TAU)));
    g.translate(p.x, p.y, p.z);
    g.deleteAttribute('uv');
    parts.push(withSeed(g, r()));
  }
  return mergeGeometries(parts);
}

// Lathe with angular modulation (flutes, reeds): mod(y, angle) → radius factor.
function latheMod(pts, seg, mod) {
  const g = new THREE.LatheGeometry(lathe2(pts), seg);
  const p = g.attributes.position, np = pts.length;
  for (let i = 0; i < p.count; i++) {
    const a = Math.floor(i / np) / seg * TAU, f = mod(p.getY(i), a);
    p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

// box-projected UVs in metres (non-indexed), so brick / stone textures keep their scale across parts
function worldUV(g, s = 1) {
  g = g.index ? g.toNonIndexed() : g;
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const nrm = c.sub(b).cross(a.sub(b)), ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
    for (let k = i; k < i + 3; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (ay >= ax && ay >= az) uv.set([x * s, z * s], k * 2); else if (ax >= az) uv.set([z * s, y * s], k * 2); else uv.set([x * s, y * s], k * 2);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const boxAt = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// ---------------------------------------------------------------------------------------------------------
// procedural textures

function pavingTexture() {
  const c = mkCanvas(1024), g = c.getContext('2d'), r = rng(61);
  g.fillStyle = '#3d362e'; g.fillRect(0, 0, 1024, 1024);
  for (let y = 0; y < 1024;) {
    const h = Math.min(90 + Math.floor(r() * 80), 1024 - y);
    for (let x = -Math.floor(r() * 120); x < 1024;) {
      const w = 110 + Math.floor(r() * 170), l = 150 + r() * 45, warm = r() * 16;
      g.fillStyle = `rgb(${l + warm | 0},${l + warm * 0.5 - 6 | 0},${l - 14 | 0})`;
      g.fillRect(x + 3, y + 3, w - 6, h - 6);
      for (let k = 0; k < 26; k++) { const dk = r() < 0.5; g.fillStyle = dk ? 'rgba(50,40,30,0.07)' : 'rgba(235,225,205,0.06)'; g.beginPath(); g.arc(x + r() * w, y + r() * h, 3 + r() * 20, 0, TAU); g.fill(); }
      x += w;
    }
    y += h;
  }
  return toTexture(c, { repeat: true });
}

// buff / red sandstone in coursed ashlar with low-relief carved bands (1 tile = 8 m)
function sandstoneTexture(seed = 5, tint = [176, 140, 106]) {
  const c = mkCanvas(1024), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = `rgb(${tint})`; g.fillRect(0, 0, 1024, 1024);
  // grain and weathering: many faint blotches at several scales
  for (const [n, s0, s1, a0] of [[500, 30, 90, 0.035], [2500, 4, 18, 0.05], [9000, 0.8, 3, 0.08]]) {
    for (let k = 0; k < n; k++) { const dk = r() < 0.55; g.fillStyle = dk ? `rgba(70,48,30,${a0 * r()})` : `rgba(255,238,210,${a0 * r()})`; g.beginPath(); g.arc(r() * 1024, r() * 1024, s0 + r() * (s1 - s0), 0, TAU); g.fill(); }
  }
  const course = 58;
  for (let y = 0, row = 0; y < 1024; y += course, row++) {
    // each block its own tone
    for (let x = (row % 2) * 70 - 140; x < 1024; x += 140) { const l = (r() - 0.5) * 0.12; g.fillStyle = l < 0 ? `rgba(60,40,25,${-l})` : `rgba(255,240,215,${l})`; g.fillRect(x, y, 140, course); }
    g.fillStyle = 'rgba(55,38,26,0.38)'; g.fillRect(0, y, 1024, 1.5);
    g.fillStyle = 'rgba(255,240,215,0.12)'; g.fillRect(0, y + 1.5, 1024, 1);
    g.fillStyle = 'rgba(55,38,26,0.3)';
    for (let x = (row % 2) * 70; x < 1024; x += 140) g.fillRect(x, y, 1.5, course);
    if (row % 6 === 3) {
      // a carved band: fillets and a running scroll in low relief (shadowed below, lit above)
      for (const [dy, a] of [[6, 0.3], [course - 8, 0.3]]) { g.fillStyle = `rgba(50,34,22,${a})`; g.fillRect(0, y + dy, 1024, 1.5); g.fillStyle = 'rgba(255,240,215,0.14)'; g.fillRect(0, y + dy - 1.5, 1024, 1.2); }
      g.strokeStyle = 'rgba(50,34,22,0.2)'; g.lineWidth = 1.1;
      for (let x = 0; x < 1024; x += 14) { g.beginPath(); g.moveTo(x, y + 12); g.lineTo(x + 7, y + course / 2); g.lineTo(x, y + course - 12); g.moveTo(x + 7, y + 12); g.lineTo(x, y + course / 2); g.lineTo(x + 7, y + course - 12); g.stroke(); }
    }
  }
  for (let k = 0; k < 120; k++) { const x = r() * 1024; const y0 = r() * 700; const grd = g.createLinearGradient(x, y0, x, y0 + 320); grd.addColorStop(0, 'rgba(40,30,22,0.07)'); grd.addColorStop(1, 'rgba(40,30,22,0)'); g.fillStyle = grd; g.fillRect(x, y0, 2 + r() * 7, 320); }
  return toTexture(c, { repeat: true });
}

function brickTexture() {
  const c = mkCanvas(512), g = c.getContext('2d'), r = rng(17);
  g.fillStyle = '#4a3a30'; g.fillRect(0, 0, 512, 512);
  const bh = 42, bw = 120;
  for (let y = 0, row = 0; y < 512; y += bh, row++) {
    for (let x = -(row % 2) * bw / 2; x < 512; x += bw) {
      const l = 0.75 + r() * 0.35, soot = r() < 0.15 ? 0.6 : 1;
      g.fillStyle = `rgb(${150 * l * soot | 0},${78 * l * soot | 0},${52 * l * soot | 0})`;
      g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(30,18,12,0.12)'; g.fillRect(x + r() * bw, y + r() * bh, 4 + r() * 10, 2 + r() * 4); }
    }
  }
  return toTexture(c, { repeat: true });
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 400);
  const cue = (name) => CUES[name] - segment.start;
  const tF = cue('forge'), tC = cue('crucible'), tW = cue('wootzPattern'), tP = cue('ironPillar'), tZ = cue('zinc');
  const dur = segment.end - segment.start;
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.1;
  scene.fog = new THREE.FogExp2(0x0a0604, 0.05);

  // ---- lights (always in the scene: only intensities change, so shaders never recompile on a cut) --------
  const key = new THREE.DirectionalLight('#ffffff', 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fire = new THREE.PointLight('#ff8a3a', 0, 0, 2);
  const fill = new THREE.PointLight('#ffb070', 0, 0, 2);
  const spot = new THREE.SpotLight('#ffe6c8', 0, 0, 0.5, 0.7, 2);
  scene.add(fire, fill, spot, spot.target);
  const hemi = new THREE.HemisphereLight('#a9c4e8', '#6b5640', 0);
  scene.add(hemi);
  const setKeyShadow = (half, near = 0.5, far = 80) => {
    const c = key.shadow.camera;
    if (c.right !== half || c.far !== far) { Object.assign(c, { left: -half, right: half, top: half, bottom: -half, near, far }); c.updateProjectionMatrix(); }
  };

  const groupA = new THREE.Group(), groupB = new THREE.Group(), groupC = new THREE.Group(), groupD = new THREE.Group();
  groupA.position.copy(OA); groupB.position.copy(OB); groupC.position.copy(OC); groupD.position.copy(OD);
  scene.add(groupA, groupB, groupC, groupD);

  // =========================================================================================================
  // SET A — the forge: a clay crucible furnace in a mud-walled workshop at night
  const furOut = (y) => 0.74 - 0.12 * y + 0.03 * Math.sin(Math.PI * Math.min(y, 1.15) / 1.15);
  const furIn = (y) => furOut(y) - 0.13;
  const FUR_GLSL = /* glsl */ `
    float furOut(float y){ return 0.74 - 0.12 * y + 0.03 * sin(3.14159 * min(y, 1.15) / 1.15); }`;
  const furProfile = (() => {
    const p = [];
    for (let i = 0; i <= 14; i++) { const y = 0.1 + (1.12 - 0.1) * i / 14; p.push([furIn(y), y]); }
    p.push([furIn(1.15) + 0.015, 1.16], [furIn(1.15) + 0.05, 1.176], [furOut(1.15) - 0.04, 1.176], [furOut(1.15) - 0.005, 1.155]);
    for (let i = 0; i <= 14; i++) { const y = 1.13 * (1 - i / 14); p.push([furOut(y) + 0.045 * Math.pow(1 - y / 1.13, 6), y]); }
    p.push([furIn(0.1), 0.0], [furIn(0.1), 0.0999]);
    return p;
  })();
  // furnace shell halves: hand-built clay (lumpy, displacement fades to zero at the cut plane), soot-blackened
  // round the rim and the stoke hole
  const furnaceHalf = (front) => {
    const g = new THREE.LatheGeometry(lathe2(furProfile), 56, front ? -Math.PI / 2 : Math.PI / 2, Math.PI);
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.02 * noise3(x * 4, y * 4, z * 4) * smoothstep(0, 0.12, Math.abs(z));
      p.setXYZ(i, x * k, y, z * k);
      const mouth = z > 0 ? Math.exp(-((x / 0.38) ** 2 + ((y - 0.5) / 0.4) ** 2)) : 0;
      const soot = sat(smoothstep(0.72, 1.17, y) * 0.8 + mouth * 0.75 + 0.18 * noise3(x * 3 + 5, y * 3, z * 3));
      const c = lerp(1, 0.2, soot);
      col.set([c, c * 0.96, c * 0.92], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  };
  const clayBump = surfaceTexture('cast', 512, 41);
  const furU = { uCutY: { value: 99 }, uHeat: { value: 1 }, uOrigin: { value: OA.clone() } };
  // modes: front (cut + stoke hole), lip (cut only), cap (the cut faces, shown once cut), back
  const furnaceMat = (mode) => {
    const m = new THREE.MeshStandardMaterial({ color: '#a8714a', roughness: 0.95, metalness: 0, vertexColors: mode !== 'cap', side: THREE.DoubleSide, bumpMap: clayBump, bumpScale: 1.5 });
    m.userData.detail = { albedo: 0.2, rough: 0.3, bump: 0.0008, scratch: 0, grime: 0.25 };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, furU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uOrigin; varying vec3 vFL;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFL = (modelMatrix * vec4(transformed, 1.0)).xyz - uOrigin;');
      const cut = mode === 'front' || mode === 'lip' ? 'if (vFL.z > -0.002 && vFL.y > uCutY) discard;' : mode === 'cap' ? 'if (vFL.y < uCutY) discard;' : '';
      const mouth = mode === 'front' ? `if (vFL.z > 0.2 && ((abs(vFL.x) < 0.2 && vFL.y > 0.2 && vFL.y < 0.46) || (vFL.y >= 0.46 && length(vec2(vFL.x, vFL.y - 0.46)) < 0.2))) discard;` : '';
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\nuniform float uCutY, uHeat; varying vec3 vFL;${HOT_GLSL}${FUR_GLSL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${cut}\n${mouth}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float rr = length(vFL.xz), ri = furOut(vFL.y) - 0.13;
            float gl = smoothstep(ri + 0.06, ri - 0.005, rr) * smoothstep(1.3, 0.12, vFL.y);
            float gm = 0.75 + 0.25 * sin(vFL.y * 37.0 + atan(vFL.z, vFL.x) * 9.0) * sin(vFL.y * 13.0 - atan(vFL.z, vFL.x) * 5.0);
            totalEmissiveRadiance += hotCol(gl * uHeat * 0.62 * gm) * gl;
            ${mode === 'front' || mode === 'cap' || mode === 'lip' ? 'totalEmissiveRadiance += vec3(1.0, 0.5, 0.18) * 1.2 * (1.0 - smoothstep(0.0, 0.015, abs(vFL.y - uCutY))) * step(-0.01, vFL.z);' : ''}
          }`);
    };
    m.customProgramCacheKey = () => 'mfur-' + mode;
    return m;
  };
  const furFront = new THREE.Mesh(furnaceHalf(true), furnaceMat('front'));
  const furBack = new THREE.Mesh(furnaceHalf(false), furnaceMat('back'));
  const furCap = new THREE.Mesh(mergeGeometries([1, -1].map((s) => new THREE.ShapeGeometry(new THREE.Shape(furProfile.slice(0, -1).map(([r, y]) => new THREE.Vector2(s * r, y)))))), furnaceMat('cap'));
  furCap.material.color.set('#b07a52');
  // the stoke hole: its reveal through the wall and a sooty clay lip round it
  const mouthPts = [];
  for (let i = 0; i <= 6; i++) mouthPts.push([-0.2, 0.2 + 0.26 * i / 6]);
  for (let i = 1; i < 16; i++) { const a = Math.PI * (1 - i / 16); mouthPts.push([Math.cos(a) * 0.2, 0.46 + Math.sin(a) * 0.2]); }
  for (let i = 0; i <= 6; i++) mouthPts.push([0.2, 0.46 - 0.26 * i / 6]);
  for (let i = 1; i < 6; i++) mouthPts.push([0.2 - 0.4 * i / 6, 0.2]);
  mouthPts.push(mouthPts[0]);
  const reveal = (() => {
    const pos = [], idx = [];
    mouthPts.forEach(([x, y]) => { pos.push(x, y, Math.sqrt(furIn(y) ** 2 - x * x) - 0.01, x, y, Math.sqrt(furOut(y) ** 2 - x * x) + 0.01); });
    for (let i = 0; i < mouthPts.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0.35), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
    g.computeVertexNormals();
    return g;
  })();
  const lipCurve = new THREE.CatmullRomCurve3(mouthPts.slice(0, -1).map(([x, y]) => V(x, y, Math.sqrt(furOut(y) ** 2 - x * x) + 0.012)), true);
  const lipG = new THREE.TubeGeometry(lipCurve, 64, 0.03, 8, true);
  lipG.setAttribute('color', new THREE.Float32BufferAttribute(new Array(lipG.attributes.position.count * 3).fill(0.3), 3));
  const lipMat = furnaceMat('lip');
  groupA.add(furFront, furBack, furCap, new THREE.Mesh(reveal, lipMat), new THREE.Mesh(lipG, lipMat));
  for (const m of [furFront, furBack]) { m.castShadow = true; m.receiveShadow = true; }

  // the charge: a bed of glowing charcoal, sealed crucibles standing in it
  const coalMat = hotMaterial({ origin: OA, scale: 22, crack: 1, heat: 1 });
  const CRU_AT = [[0, 0], [-0.3, -0.17], [0.3, -0.17], [-0.13, -0.38], [0.15, -0.37], [-0.44, 0.0], [0.44, -0.02], [-0.3, 0.22], [0.3, 0.22], [0.0, 0.34]];
  const coalBed = new THREE.Mesh(lumps(900, (r) => {
    const a = r() * TAU, rr = Math.sqrt(r()) * 0.5, y = 0.37 + r() * 0.08;
    if (rr > furIn(y) - 0.04) return null;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    for (const [cx, cz] of CRU_AT) if (Math.hypot(x - cx, z - cz) < 0.11) return null;
    return V(x, y, z);
  }, 7, 0.016, 0.032), coalMat);
  groupA.add(coalBed);
  const bedMat = hotMaterial({ origin: OA, scale: 30, crack: 1, heat: 0.8 });
  {
    const rb = furIn(0.1) - 0.01;
    const body = new THREE.CylinderGeometry(rb - 0.02, rb, 0.28, 40, 1, false, Math.PI / 2, Math.PI).translate(0, 0.24, 0);
    const face = new THREE.PlaneGeometry(2 * rb, 0.28).translate(0, 0.24, 0.001);
    const top = new THREE.CircleGeometry(rb - 0.02, 40, Math.PI, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.38, 0);
    groupA.add(new THREE.Mesh(mergeGeometries([body, face, top].map((g) => withSeed(g.index ? g.toNonIndexed() : g, 0.5))), bedMat));
  }
  const CRU_OUT = [[0, 0], [0.05, 0], [0.066, 0.012], [0.072, 0.05], [0.074, 0.19], [0.079, 0.2], [0.081, 0.212], [0.07, 0.232], [0.045, 0.248], [0.02, 0.254], [0, 0.256]];
  const CRU_IN = [[0, 0.214], [0.026, 0.212], [0.05, 0.205], [0.06, 0.19], [0.058, 0.06], [0.054, 0.035], [0.04, 0.023], [0, 0.022]];
  const cru = cutLathe(CRU_OUT, CRU_IN, 28);
  const crucibleMat = hotMaterial({ origin: OA, scale: 22, crack: 0.06, heat: 0.95 });
  {
    const parts = [], r = rng(23);
    const spots = [[-0.3, -0.17], [0.3, -0.17], [-0.13, -0.38], [0.15, -0.37], [-0.44, 0.0], [0.44, -0.02], [-0.3, 0.22], [0.3, 0.22], [0.0, 0.34]];
    for (const [x, z] of spots) { const g = cru.full.clone(); g.scale(1.25, 1.25, 1.25); g.rotateY(r() * TAU); g.rotateZ((r() - 0.5) * 0.12); g.translate(x, 0.3 + r() * 0.02, z); g.deleteAttribute('uv'); parts.push(withSeed(g, r())); }
    groupA.add(new THREE.Mesh(mergeGeometries(parts), crucibleMat));
  }
  // the hero crucible at the cut plane, in section: its own glow, contents that melt into a button
  const hero = new THREE.Group(); hero.position.set(0, 0.3, 0); hero.scale.setScalar(1.25); groupA.add(hero);
  const heroShell = hotMaterial({ origin: OA, scale: 22, crack: 0.06, heat: 0.9 });
  const heroCut = hotMaterial({ origin: OA, scale: 60, crack: 0.05, heat: 0.66 });
  hero.add(new THREE.Mesh(withSeed(cru.back.clone(), 0.6), heroShell), new THREE.Mesh(withSeed(cru.front.clone(), 0.6), heroShell), new THREE.Mesh(withSeed(cru.cap.clone(), 0.4), heroCut));
  const ironHot = hotMaterial({ origin: OA, scale: 120, crack: 0.6, heat: 0.3, base: [0.05, 0.05, 0.055] });
  const ironBits = new THREE.Group(); hero.add(ironBits);
  {
    const r = rng(31);
    for (let i = 0; i < 14; i++) {
      const g = withSeed(new THREE.BoxGeometry(0.018 + r() * 0.014, 0.01 + r() * 0.012, 0.016 + r() * 0.012), r());
      const m = new THREE.Mesh(g, ironHot);
      m.position.set((r() - 0.5) * 0.09, 0.035 + r() * 0.1, -0.008 - r() * 0.04);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      m.userData.base = m.position.clone();
      ironBits.add(m);
    }
  }
  const leafMat = new THREE.MeshStandardMaterial({ color: '#1d1a12', roughness: 0.9, emissive: '#ff6a1a', emissiveIntensity: 0, side: THREE.DoubleSide });
  const leaves = new THREE.Group(); hero.add(leaves);
  {
    const r = rng(37);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.CircleGeometry(0.014, 6); g.scale(1.6, 0.6, 1);
      const m = new THREE.Mesh(g, leafMat);
      m.position.set((r() - 0.5) * 0.08, 0.05 + r() * 0.11, -0.01 - r() * 0.035);
      m.rotation.set(r() * 3, r() * 3, r() * 3);
      leaves.add(m);
    }
  }
  const meltMat = hotMaterial({ origin: OA, scale: 70, crack: 0.08, heat: 1.05 });
  const melt = new THREE.Group(); hero.add(melt);
  const meltBody = new THREE.Mesh(withSeed(new THREE.CylinderGeometry(0.057, 0.052, 1, 24, 1, false, Math.PI / 2, Math.PI).translate(0, 0.5, 0), 0.8), meltMat);
  const meltFace = new THREE.Mesh(withSeed(new THREE.PlaneGeometry(0.11, 1).translate(0, 0.5, 0.0005), 0.8), meltMat);
  const meltDome = new THREE.Mesh(withSeed(new THREE.SphereGeometry(0.057, 24, 8, Math.PI, Math.PI, 0, Math.PI / 2), 0.8), meltMat);
  melt.add(meltBody, meltFace, meltDome);
  melt.position.y = 0.022;

  // flames licking out of the open top, a heat glow over it
  const flames = [[0.3, 0.42, 1.0, 0.62, 0], [0.18, 0.34, 1.1, 0.66, 3.1], [0.1, 0.22, 0.9, 0.7, 6.3]].map(([rt, rb, h, y, s]) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28, 1, true).translate(0, h / 2, 0), flameMaterial(s));
    m.position.y = y; m.renderOrder = 5; groupA.add(m); return m;
  });
  const heatGlow = glowSprite({ color: '#ff8a3c', intensity: 0.9, scale: 2.6 }); heatGlow.position.set(0, 1.25, 0); groupA.add(heatGlow);
  const mouthGlow = glowSprite({ color: '#ffb066', intensity: 0.8, scale: 0.9 }); mouthGlow.position.set(0, 0.4, 0.66); groupA.add(mouthGlow);

  // bag bellows (goatskin, two battens to open and close the slit), each blowing through a clay tuyere
  const leather = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.62, metalness: 0, bumpMap: surfaceTexture('cast', 512, 9), bumpScale: 1.2 });
  const wood = new THREE.MeshStandardMaterial({ color: '#5a4030', roughness: 0.8, map: surfaceTexture('walnut', 512, 21) });
  const tuyereMat = new THREE.MeshStandardMaterial({ color: '#6e4a32', roughness: 0.95 });
  const bellows = [-1, 1].map((s) => {
    const g = new THREE.Group(); g.position.set(s * 1.25, 0, -0.25); g.rotation.y = s > 0 ? Math.PI + 0.2 : -0.2; groupA.add(g);
    const bagG = new THREE.SphereGeometry(1, 28, 16);
    const p = bagG.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + 0.05 * Math.sin(x * 14 + z * 3) * (1 - Math.abs(y)) + 0.03 * noise3(x * 3, y * 3, z * 3); p.setXYZ(i, x * k, y * k, z * k); }
    bagG.computeVertexNormals(); bagG.scale(0.42, 0.22, 0.26);
    const bagPivot = new THREE.Group(); g.add(bagPivot);
    const bag = new THREE.Mesh(bagG, leather); bag.position.y = 0.22; bag.castShadow = true; bagPivot.add(bag);
    const battens = new THREE.Group(); g.add(battens);
    for (const dz of [-0.03, 0.03]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.035, 0.035), wood); b.position.set(-0.08, 0, dz); battens.add(b); }
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 12).rotateZ(Math.PI / 2), tuyereMat); nozzle.position.set(0.55, 0.18, 0); g.add(nozzle);
    return { g, bagPivot, battens, s };
  });

  // the workshop: earth floor, curved mud wall, timber posts and roof beams, a heap of charcoal, spare crucibles
  const earth = new THREE.MeshStandardMaterial({ color: '#4a3526', roughness: 0.95, bumpMap: surfaceTexture('cast', 512, 13), bumpScale: 2 });
  earth.map = surfaceTexture('cast', 512, 13); earth.map.repeat.set(10, 10); earth.bumpMap.repeat.set(10, 10);
  const floorA = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), earth); floorA.receiveShadow = true; groupA.add(floorA);
  const mud = new THREE.MeshStandardMaterial({ color: '#7a5a40', roughness: 0.95, side: THREE.BackSide, bumpMap: surfaceTexture('cast', 512, 19), bumpScale: 3 });
  mud.bumpMap.repeat.set(6, 2);
  const wallA = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 4, 48, 1, true, Math.PI - 1.9, 3.8).translate(0, 2, 0), mud); groupA.add(wallA);
  const timber = new THREE.MeshStandardMaterial({ color: '#3a2a1e', roughness: 0.85, map: surfaceTexture('walnut', 512, 33) });
  {
    const parts = [];
    for (const a of [-1.5, -0.6, 0.6, 1.5]) { const x = Math.sin(Math.PI + a) * 4.0, z = Math.cos(Math.PI + a) * 4.0; parts.push(new THREE.CylinderGeometry(0.11, 0.13, 3.4, 10).translate(x, 1.7, z)); }
    for (let i = 0; i < 6; i++) parts.push(new THREE.BoxGeometry(9, 0.2, 0.22).translate(0, 3.3, -3.6 + i * 1.3));
    parts.push(new THREE.BoxGeometry(0.24, 0.24, 9).translate(-1.6, 3.12, 0), new THREE.BoxGeometry(0.24, 0.24, 9).translate(1.6, 3.12, 0));
    groupA.add(new THREE.Mesh(mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; })), timber));
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(Math.PI / 2).translate(0, 3.45, 0), new THREE.MeshStandardMaterial({ color: '#2a2018', roughness: 1, bumpMap: surfaceTexture('walnut', 512, 5), bumpScale: 4 }));
    groupA.add(roof);
    const char = new THREE.Mesh(lumps(260, (r) => { const a = r() * TAU, rr = Math.sqrt(r()) * 0.55; return V(1.75 + Math.cos(a) * rr, Math.max(0.02, 0.38 * (1 - rr / 0.55)) * r(), 0.55 + Math.sin(a) * rr); }, 41, 0.035, 0.07), new THREE.MeshStandardMaterial({ color: '#17140f', roughness: 0.55, metalness: 0 }));
    groupA.add(char);
    const spare = [], r = rng(43);
    for (let i = 0; i < 9; i++) { const g = cru.full.clone(); g.translate(-1.55 + (i % 3) * 0.17 + (r() - 0.5) * 0.02, Math.floor(i / 3) === 2 ? 0 : 0, 0.55 + Math.floor(i / 3) * 0.17); spare.push(g); }
    groupA.add(new THREE.Mesh(mergeGeometries(spare), new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: 0.9 })));
    const tong = new THREE.MeshStandardMaterial({ color: '#2c2a28', metalness: 1, roughness: 0.55 });
    const tg = mergeGeometries([new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8).rotateZ(0.32).translate(0.88, 0.52, 0.42), new THREE.CylinderGeometry(0.012, 0.012, 1.1, 8).rotateZ(0.28).translate(0.92, 0.52, 0.46)]);
    groupA.add(new THREE.Mesh(tg, tong));
  }
  const smokeHaze = new Dust({ count: 500, size: [5, 3, 4], center: [0, 1.7, -0.5], particleSize: 0.02, color: '#ffb070', opacity: 0.5, intensity: 1.2, seed: 51 });
  groupA.add(smokeHaze);

  // callout on the cutaway
  const calloutA = new Callout('SEALED CLAY CRUCIBLE', { dx: 0.24, dy: -0.07, size: 0.019, color: '#ffe2c0', sub: 'IRON + CHARCOAL / PLANT MATTER MELT INTO STEEL', intensity: 1.3 });
  backCallout(calloutA); groupA.add(calloutA);

  // =========================================================================================================
  // SET B — a forged wootz blade, macro
  const BL = 0.82;
  const bladeW = (u) => 0.036 * (1 - 0.32 * u) * Math.sqrt(1 - Math.pow(sat((u - 0.84) / 0.16), 2));
  const bladeC = (u) => 0.06 * u * u;                       // the curve of the sabre (in the blade plane)
  const bladeT = (u, v) => 0.0062 * (1 - 0.55 * u) * Math.pow(0.5 + 0.5 * v, 0.75) - (v > 0.3 && v < 0.7 && u < 0.72 ? 0.0011 * Math.sin(Math.PI * (v - 0.3) / 0.4) * smoothstep(0.72, 0.6, u) : 0);
  const bladeGeo = (() => {
    const NU = 240, NV = 30, pos = [], uv = [], idx = [];
    const vert = (u, v, side) => { const w = bladeW(u); pos.push(u * BL, side * bladeT(u, v) / 2, bladeC(u) + v * w / 2); uv.push(u * BL, v * w / 2); };
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) vert(i / NU, -1 + 2 * j / NV, side);
      for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const a = b + i * (NV + 1) + j, c = a + NV + 1;
        if (side > 0) idx.push(a, a + 1, c, c, a + 1, c + 1); else idx.push(a, c, a + 1, c, c + 1, a + 1);
      }
    }
    const b = pos.length / 3;   // the spine (back of the blade)
    for (let i = 0; i <= NU; i++) { vert(i / NU, 1, 1); vert(i / NU, 1, -1); }
    for (let i = 0; i < NU; i++) { const a = b + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const bladeU = { uEtch: { value: 0 }, uSweepX: { value: 0 }, uSweepI: { value: 0 }, uPlaneY: { value: 0.5 } };
  const bladeMat = new THREE.MeshPhysicalMaterial({ color: '#c9ced3', metalness: 1, roughness: 0.2 });
  bladeMat.userData.detail = { albedo: 0.03, rough: 0.25, bump: 0.000005, scratch: 0.35, grime: 0.0, scale: 3 };
  bladeMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, bladeU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vBl; varying vec3 vWp;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBl = uv; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uEtch, uSweepX, uSweepI, uPlaneY; varying vec2 vBl; varying vec3 vWp;
        ${GLSL_NOISE}
        // wootz 'watered' pattern: sheets of carbide (bright) in a pearlite matrix (dark), drawn out along the
        // blade by forging, in a domain-warped field; fine dendritic speckle inside the bright bands
        float wootz(vec2 p){
          vec2 q = vec2(p.x * 9.0, p.y * 60.0);
          vec2 w = vec2(snoise(vec3(q * 0.5, 1.3)), snoise(vec3(q * 0.5 + vec2(5.2, 1.7), 4.1)));
          vec2 r = q + w * 1.7;
          float f = snoise(vec3(r * 0.8, 7.0)) * 0.6 + snoise(vec3(r * 1.9, 2.0)) * 0.3 + snoise(vec3(r * 4.1, 9.0)) * 0.1;
          float bands = abs(fract(f * 3.0 + p.y * 14.0) - 0.5) * 2.0;
          float carb = smoothstep(0.5, 0.82, bands);
          float sp = smoothstep(0.35, 0.85, snoise(vec3(p * vec2(380.0, 700.0), 3.0)));
          return clamp(carb * (0.8 + 0.2 * sp), 0.0, 1.0);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wz = wootz(vBl);
        float wk = mix(0.55, wz, uEtch);
        diffuseColor.rgb *= mix(0.26, 1.12, wk);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.36, 0.1, wk);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // a softbox strip overhead, swept along the blade: its mirror image in the polished steel
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 vW = normalize(cameraPosition - vWp);
          vec3 R = reflect(-vW, nW);
          float hit = 0.0;
          if (R.y > 0.04) {
            vec3 hp = vWp + R * ((uPlaneY - vWp.y) / R.y);
            float d = hp.x - uSweepX;
            hit = exp(-d * d / (0.06 * 0.06)) * 0.3 + exp(-d * d / (0.016 * 0.016));
          }
          totalEmissiveRadiance += diffuseColor.rgb * hit * uSweepI * mix(0.25, 1.0, wk);
        }`);
  };
  bladeMat.customProgramCacheKey = () => 'mwootz';
  const blade = new THREE.Mesh(bladeGeo, bladeMat);
  blade.position.set(0, 0.0034, 0); blade.castShadow = true;
  groupB.add(blade);
  // hilt: brass ferrule and guard, a dark grip (soft in the bokeh)
  const brassB = new THREE.MeshStandardMaterial({ color: '#8a6a3c', metalness: 1, roughness: 0.65 });
  groupB.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.11).translate(-0.012, 0.004, 0.0), brassB));
  groupB.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 16).rotateZ(Math.PI / 2).translate(-0.08, 0.008, 0.0), new THREE.MeshStandardMaterial({ color: '#1b1410', roughness: 0.6 })));
  const cloth = new THREE.MeshPhysicalMaterial({ color: '#120c09', roughness: 0.9, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color('#4a2614'), bumpMap: surfaceTexture('cast', 512, 61), bumpScale: 0.6 });
  cloth.bumpMap.repeat.set(30, 30);
  const clothM = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 1, 1).rotateX(-Math.PI / 2), cloth); clothM.receiveShadow = true; groupB.add(clothM);
  const bokeh = [];
  { const r = rng(71); for (let i = 0; i < 14; i++) { const s = glowSprite({ color: r() < 0.6 ? '#ff9a4a' : '#ffd29a', intensity: 0.5 + r() * 0.5, scale: 0.05 + r() * 0.08 }); s.position.set(-0.6 + r() * 2.2, 0.15 + r() * 0.5, -0.9 - r() * 1.4); groupB.add(s); bokeh.push(s); } }
  const calloutB = new Callout('WOOTZ CRUCIBLE STEEL · SOUTH INDIA', { dx: -0.012, dy: 0.012, size: 0.002, color: '#ffe6c8', sub: 'FROM c. 300 BC · TRADED TO PERSIA AND SYRIA: "DAMASCUS" BLADES', intensity: 1.3 });
  backCallout(calloutB, { alpha: 0.35 }); groupB.add(calloutB);

  // =========================================================================================================
  // SET C — the Iron Pillar of Delhi, Qutb complex, in daylight
  const PH = 7.21;
  const pillarProfile = (() => {
    const p = [[0, 0], [0.214, 0], [0.209, 0.03]];
    for (let i = 1; i <= 24; i++) { const y = 0.03 + (6.08 - 0.03) * i / 24; p.push([0.209 - (0.209 - 0.153) * (y / 6.08), y]); }
    p.push([0.162, 6.095], [0.172, 6.115], [0.165, 6.14], [0.268, 6.15]);
    for (let i = 1; i <= 12; i++) { const u = i / 12; p.push([0.155 + 0.115 * Math.pow(1 - u, 1.7), 6.15 + u * 0.47]); }
    p.push([0.165, 6.63], [0.19, 6.64], [0.19, 6.665], [0.172, 6.68], [0.2, 6.69], [0.2, 6.71], [0.172, 6.72]);
    for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + Math.PI * i / 14; p.push([0.172 + 0.09 * Math.cos(a), 6.82 + 0.1 * Math.sin(a)]); }
    p.push([0.15, 6.93], [0.15, 6.96], [0, 6.96]);
    return p;
  })();
  const pillarGeo = mergeGeometries([
    latheMod(pillarProfile, 96, (y, a) => {
      if (y > 6.15 && y < 6.62) return 0.975 + 0.07 * Math.pow(0.5 + 0.5 * Math.cos(16 * a), 0.7);            // inverted-lotus bell: reeded petals
      if (y > 6.725 && y < 6.915) return 0.965 + 0.08 * Math.pow(0.5 + 0.5 * Math.cos(28 * a), 0.5);           // amalaka: ribbed
      return 1;
    }),
    new THREE.BoxGeometry(0.42, 0.25, 0.42).translate(0, 6.96 + 0.125, 0).toNonIndexed(),
  ].map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#3a302a', roughness: 0.42, metalness: 0 });
  pillarMat.userData.detail = { albedo: 0.12, rough: 0.6, bump: 0.00004, scratch: 0.2, grime: 0.15 };
  pillarMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPl;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPl = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPl;
        float pHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float pNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(pHash(i), pHash(i + vec2(1, 0)), f.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pa = atan(vPl.z, vPl.x);
        vec2 pq = vec2(pa * 3.0, vPl.y * 6.0);
        float pn = pNoise(pq) * 0.55 + pNoise(pq * 3.1) * 0.3 + pNoise(pq * 9.0) * 0.15;
        float rust = smoothstep(0.95, 0.05, vPl.y + (pn - 0.5) * 0.5) * smoothstep(0.35, 0.65, pn + 0.15);
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.3 * pn), vec3(0.2, 0.075, 0.03), rust * 0.85);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.85, rust);`);
  };
  pillarMat.customProgramCacheKey = () => 'mpillar';
  const pillar = new THREE.Mesh(pillarGeo, pillarMat);
  pillar.position.y = 0.12; pillar.castShadow = true; pillar.receiveShadow = true;
  groupC.add(pillar);
  // the protective film (misawite): a thin-film shimmer that climbs the shaft
  const filmMat = new THREE.ShaderMaterial({
    uniforms: { uReveal: { value: -1 }, uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uReveal, uTime, uOpacity; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        if (vP.y > uReveal) discard;
        float c = abs(dot(normalize(vN), normalize(vV)));
        float f = pow(1.0 - c, 2.2);
        float th = c * 2.2 + vP.y * 0.9 + sin(atan(vP.z, vP.x) * 5.0 + vP.y * 3.0 - uTime * 2.0) * 0.12;
        vec3 film = 0.5 + 0.5 * cos(6.2832 * (th + vec3(0.0, 0.33, 0.67)));
        float front = smoothstep(0.35, 0.0, uReveal - vP.y);
        gl_FragColor = vec4(film * (0.15 + 0.85 * f) * (0.6 + 2.2 * front) * uOpacity, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const film = new THREE.Mesh(new THREE.LatheGeometry(lathe2(pillarProfile.slice(0, 27).map(([r, y]) => [r * 1.02 + 0.002, y])), 64), filmMat);
  film.position.y = 0.12; film.renderOrder = 6;
  groupC.add(film);

  // paving, plinth, a low railing
  const paveTex = pavingTexture(); paveTex.repeat.set(12, 12);
  const paving = new THREE.Mesh(new THREE.PlaneGeometry(96, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: paveTex, bumpMap: paveTex, bumpScale: 1.2, roughness: 0.82, color: '#ffffff' }));
  paving.receiveShadow = true; groupC.add(paving);
  const stoneTex = sandstoneTexture(5, [178, 150, 118]); stoneTex.repeat.set(1 / 8, 1 / 8);
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: stoneTex, bumpScale: 2.5, roughness: 0.88, color: '#e8ddd0' });
  const plinth = new THREE.Mesh(worldUV(boxAt(2.2, 0.12, 2.2, 0, 0.06, 0), 1 / 8), stoneMat); plinth.receiveShadow = true; plinth.castShadow = true; groupC.add(plinth);
  {
    const rail = [], h = 0.95, s = 1.55;
    for (const [x, z] of [[-s, -s], [0, -s], [s, -s], [s, 0], [s, s], [0, s], [-s, s], [-s, 0]]) rail.push(new THREE.BoxGeometry(0.05, h, 0.05).translate(x, h / 2, z));
    for (const y of [0.35, h - 0.03]) { rail.push(new THREE.BoxGeometry(2 * s, 0.03, 0.03).translate(0, y, s), new THREE.BoxGeometry(2 * s, 0.03, 0.03).translate(0, y, -s), new THREE.BoxGeometry(0.03, 0.03, 2 * s).translate(s, y, 0), new THREE.BoxGeometry(0.03, 0.03, 2 * s).translate(-s, y, 0)); }
    const railM = new THREE.Mesh(mergeGeometries(rail), new THREE.MeshStandardMaterial({ color: '#2a2725', metalness: 1, roughness: 0.6 }));
    railM.castShadow = true; groupC.add(railM);
  }
  // the arched stone screen of the mosque behind (pointed arches, ruined crest), cloisters, the Minar far off
  {
    const arch = (cx, w, hs) => {
      // pointed arch: two arcs of radius 0.85 w struck from the springing line
      const R = w * 0.85, th = Math.acos((R - w / 2) / R), cL = cx - w / 2 + R, cR = cx + w / 2 - R, pts = [];
      pts.push(new THREE.Vector2(cx - w / 2, 0.35));
      for (let i = 0; i <= 12; i++) { const a = Math.PI - th * i / 12; pts.push(new THREE.Vector2(cL + Math.cos(a) * R, hs + Math.sin(a) * R)); }
      for (let i = 1; i <= 12; i++) { const a = th - th * i / 12; pts.push(new THREE.Vector2(cR + Math.cos(a) * R, hs + Math.sin(a) * R)); }
      pts.push(new THREE.Vector2(cx + w / 2, 0.35));
      return new THREE.Path(pts.reverse());
    };
    const r = rng(81), crest = [];
    for (let x = 17; x >= -17; x -= 0.8) { const c = Math.abs(x) < 5 ? 15.2 : Math.abs(x) < 10 ? 11.5 : 9.8; crest.push(new THREE.Vector2(x, c - r() * (r() < 0.2 ? 1.6 : 0.4))); }
    const sh = new THREE.Shape([new THREE.Vector2(-17, 0), new THREE.Vector2(17, 0), ...crest]);
    // (holes cut a little above the paving: the screen stands on a low base)
    sh.holes.push(arch(0, 6.8, 8.2), arch(-7.6, 3.8, 5.0), arch(7.6, 3.8, 5.0), arch(-12.9, 3.0, 3.8), arch(12.9, 3.0, 3.8));
    const scr = new THREE.ExtrudeGeometry(sh, { depth: 2.4, bevelEnabled: false, curveSegments: 4 });
    scr.translate(0, 0, -15.5);
    const screen = new THREE.Mesh(worldUV(scr, 1 / 8), stoneMat); screen.castShadow = true; screen.receiveShadow = true; groupC.add(screen);
    // raised arch surrounds (a U of stone standing proud of the face), pilasters, a string course
    const archPts = (cx, w, hs) => { const R = w * 0.85, th = Math.acos((R - w / 2) / R), cL = cx - w / 2 + R, cR = cx + w / 2 - R, pts = [new THREE.Vector2(cx - w / 2, 0.35)];
      for (let i = 0; i <= 12; i++) { const a = Math.PI - th * i / 12; pts.push(new THREE.Vector2(cL + Math.cos(a) * R, hs + Math.sin(a) * R)); }
      for (let i = 1; i <= 12; i++) { const a = th - th * i / 12; pts.push(new THREE.Vector2(cR + Math.cos(a) * R, hs + Math.sin(a) * R)); }
      pts.push(new THREE.Vector2(cx + w / 2, 0.35)); return pts; };
    const frames = [];
    for (const [cx, w, hs, b] of [[0, 6.8, 8.2, 0.9], [-7.6, 3.8, 5.0, 0.55], [7.6, 3.8, 5.0, 0.55], [-12.9, 3.0, 3.8, 0.45], [12.9, 3.0, 3.8, 0.45]]) {
      const outer = archPts(cx, w + 2 * b, hs), inner = archPts(cx, w, hs).reverse();
      const g = new THREE.ExtrudeGeometry(new THREE.Shape([...outer, ...inner]), { depth: 0.28, bevelEnabled: false, curveSegments: 2 });
      g.translate(0, 0, -13.1); frames.push(g.index ? g.toNonIndexed() : g);
    }
    for (const x of [-10.4, -4.6, 4.6, 10.4]) frames.push(boxAt(0.9, Math.abs(x) < 5 ? 10.2 : 8.4, 0.22, x, Math.abs(x) < 5 ? 5.1 : 4.2, -13.0).toNonIndexed());
    for (const [x0, x1, y] of [[-17, -5.2, 8.6], [5.2, 17, 8.6]]) frames.push(boxAt(x1 - x0, 0.32, 0.36, (x0 + x1) / 2, y, -12.98).toNonIndexed());
    const frm = new THREE.Mesh(worldUV(mergeGeometries(frames.map((g) => { g.deleteAttribute('uv'); if (g.attributes.normal === undefined) g.computeVertexNormals(); return g; })), 1 / 8), stoneMat);
    frm.castShadow = true; frm.receiveShadow = true; groupC.add(frm);
    // the cloisters either side: stacked square piers carrying a flat stone roof, a back wall
    const cl = [];
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const x = sx * 12.5, z = -11 + k * 2.4;
        cl.push(boxAt(0.5, 0.5, 0.5, x, 0.25, z), boxAt(0.42, 3.0, 0.42, x, 2.0, z), boxAt(0.6, 0.35, 0.6, x, 3.65, z));
        cl.push(boxAt(0.5, 0.5, 0.5, x + sx * 2.4, 0.25, z), boxAt(0.42, 3.0, 0.42, x + sx * 2.4, 2.0, z), boxAt(0.6, 0.35, 0.6, x + sx * 2.4, 3.65, z));
      }
      cl.push(boxAt(4.0, 0.45, 23, sx * 13.7, 4.05, -1.4), boxAt(0.6, 4.3, 23, sx * 15.6, 2.15, -1.4));
    }
    const cloister = new THREE.Mesh(worldUV(mergeGeometries(cl.map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; })), 1 / 8), stoneMat);
    cloister.castShadow = true; cloister.receiveShadow = true; groupC.add(cloister);
    // Qutb Minar: fluted red sandstone shaft, projecting balconies
    const mp = [[0, 0]];
    const balc = [29.5, 45.5, 54.5, 63.5];
    for (let i = 0; i <= 60; i++) {
      const y = 72.5 * i / 60, rr = 7.15 - (7.15 - 1.5) * (y / 72.5);
      let bump = 0; for (const b of balc) bump = Math.max(bump, 0.9 * sat(1 - Math.abs(y - b) / 0.9));
      mp.push([rr + bump, y]);
    }
    mp.push([0, 72.5]);
    const minar = new THREE.Mesh(latheMod(mp, 72, (y, a) => (y < 29 ? 0.97 + 0.06 * Math.abs(Math.cos(12 * a)) : y < 45 ? 0.975 + 0.05 * Math.pow(Math.abs(Math.cos(12 * a)), 0.5) : 1)), new THREE.MeshStandardMaterial({ color: '#a8603e', roughness: 0.85, map: sandstoneTexture(9, [170, 96, 66]) }));
    minar.material.map.repeat.set(4, 6);
    minar.position.set(30, 0, -52); groupC.add(minar);
  }
  // sky dome: hazy Delhi daylight
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: V(-14, 11, 5).normalize() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `uniform vec3 uSun; varying vec3 vP;
      void main(){
        float h = max(vP.y, -0.05);
        vec3 zen = vec3(0.07, 0.27, 0.66), hor = vec3(0.7, 0.76, 0.78);
        vec3 c = mix(hor, zen, pow(smoothstep(-0.02, 0.75, h), 0.55));
        float s = max(0.0, dot(vP, uSun));
        c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.5 + pow(s, 300.0) * 6.0);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  groupC.add(sky);
  const calloutC1 = new Callout('IRON PILLAR · c. AD 400', { dx: 1.6, dy: -0.35, size: 0.3, color: '#fff3e0', sub: '~6 TONNES · 7.2 m · QUTB COMPLEX, DELHI', intensity: 1.25 });
  const calloutC2 = new Callout('A THIN PROTECTIVE FILM (MISAWITE) KEEPS RUST AWAY', { dx: -1.4, dy: -0.5, size: 0.24, color: '#fff3e0', sub: 'PHOSPHORUS-RICH IRON · A PASSIVE LAYER', intensity: 1.25 });
  const dimRig = new THREE.Group(); groupC.add(dimRig);
  const dimC = new Dimension(V(0.95, 0.12, 0), V(0.95, 0.12 + PH, 0), '7.2 m', { size: 0.22, tick: 0.14, color: '#fff3e0', intensity: 1.2 });
  dimRig.add(dimC);
  backCallout(calloutC1, { alpha: 0.4 }); backCallout(calloutC2, { alpha: 0.4 }); groupC.add(calloutC1, calloutC2);

  // =========================================================================================================
  // SET D — Zawar: downward distillation of zinc, in section
  const brick = brickTexture();
  const brickMat = new THREE.MeshStandardMaterial({ map: brick, bumpMap: brick, bumpScale: 1.5, roughness: 0.9, color: '#ffffff' });
  {
    const walls = [boxAt(3.4, 0.15, 1.7, 0, 0.075, -0.85), boxAt(3.4, 2.5, 0.2, 0, 1.25, -1.6), boxAt(0.2, 2.5, 1.7, -1.6, 1.25, -0.85), boxAt(0.2, 2.5, 1.7, 1.6, 1.25, -0.85)];
    const m = new THREE.Mesh(worldUV(mergeGeometries(walls.map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; })), 2.2), brickMat);
    m.receiveShadow = true; groupD.add(m);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2a2019', roughness: 0.95, bumpMap: surfaceTexture('cast', 512, 77), bumpScale: 2 }));
    ground.material.bumpMap.repeat.set(12, 12); groupD.add(ground);
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(30, 14).translate(0, 7, -4), new THREE.MeshStandardMaterial({ color: '#1a130e', roughness: 1 }));
    groupD.add(backdrop);
  }
  const RX = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
  // perforated plate: clay slab between the retort necks (front row cut through its holes)
  {
    const plate = [];
    const edges = [-1.5, ...RX.flatMap((x) => [x - 0.055, x + 0.055]), 1.5];
    for (let i = 0; i < edges.length; i += 2) plate.push(boxAt(edges[i + 1] - edges[i], 0.12, 1.5, (edges[i] + edges[i + 1]) / 2, 1.06, -0.75));
    const pm = new THREE.Mesh(worldUV(mergeGeometries(plate.map((g) => { const n = g.toNonIndexed(); n.deleteAttribute('uv'); return n; })), 2.2), new THREE.MeshStandardMaterial({ color: '#8a6450', roughness: 0.9, map: brick }));
    groupD.add(pm);
  }
  // retorts (brinjal-shaped, inverted: bulb up in the fire, neck down through the plate into a receiver)
  const RET_OUT = [[0, 1.82], [0.06, 1.81], [0.11, 1.76], [0.14, 1.66], [0.145, 1.56], [0.13, 1.44], [0.095, 1.33], [0.06, 1.25], [0.047, 1.18], [0.042, 0.9], [0.036, 0.6], [0.034, 0.52]];
  const RET_IN = [[0.022, 0.52], [0.024, 0.6], [0.028, 0.9], [0.032, 1.18], [0.045, 1.25], [0.08, 1.33], [0.115, 1.44], [0.128, 1.56], [0.124, 1.66], [0.097, 1.75], [0.05, 1.795], [0, 1.80]];
  const ret = cutLathe(RET_OUT, RET_IN, 28);
  const retMat = hotMaterial({ origin: OD, scale: 26, crack: 0.25, heat: 0.6, y0: 0.95, y1: 1.35, base: [0.05, 0.035, 0.028] });
  const retCapMat = hotMaterial({ origin: OD, scale: 40, crack: 0.1, heat: 0.5, y0: 0.95, y1: 1.4, base: [0.07, 0.05, 0.04] });
  {
    const back = [], caps = [], full = [], r = rng(91);
    RX.forEach((x) => {
      back.push(withSeed(ret.back.clone().translate(x, 0, 0), r())); caps.push(withSeed(ret.cap.clone().translate(x, 0, 0), r()));
      for (const z of [-0.5, -0.95]) full.push(withSeed(ret.full.clone().translate(x + (z < -0.6 ? 0.2 : 0), 0, z), r()));
    });
    const strip = (gs) => mergeGeometries(gs.map((g) => { g.deleteAttribute('uv'); return g; }));
    groupD.add(new THREE.Mesh(strip(back), retMat), new THREE.Mesh(strip(caps), retCapMat), new THREE.Mesh(strip(full), retMat));
  }
  // charge in the front bulbs (roasted ore + charcoal), fuel packed round the retorts
  const chargeMat = hotMaterial({ origin: OD, scale: 50, crack: 0.35, heat: 0.62, base: [0.08, 0.05, 0.035] });
  groupD.add(new THREE.Mesh(lumps(150, (r) => {
    const x = RX[Math.floor(r() * RX.length)], y = 1.36 + r() * 0.32, rr = 0.1 * Math.sqrt(r()), a = Math.PI + (r() - 0.5) * Math.PI;
    const z = Math.cos(a) * rr; if (z > -0.004) return null;
    return V(x + Math.sin(a) * rr * 1.1, y, z);
  }, 93, 0.012, 0.022), chargeMat));
  const fuelMat = hotMaterial({ origin: OD, scale: 14, crack: 1, heat: 0.8, base: [0.03, 0.02, 0.015] });
  groupD.add(new THREE.Mesh(lumps(420, (r) => {
    const x = -1.45 + r() * 2.9, y = 1.14 + r() * 0.85, z = -1.45 + r() * 1.3;
    for (const rx of RX) for (const rz of [0, -0.5, -0.95]) if (Math.hypot(x - rx - (rz < -0.6 ? 0.2 : 0), z - rz) < 0.17 && y < 1.85) return null;
    return V(x, y, z);
  }, 95, 0.05, 0.09), fuelMat));
  // receivers (round clay pots) — front row in section, holding a growing pool of zinc
  const POT_OUT = [[0, 0], [0.09, 0], [0.13, 0.07], [0.145, 0.15], [0.125, 0.25], [0.075, 0.3], [0.078, 0.32]];
  const POT_IN = [[0.062, 0.32], [0.06, 0.3], [0.108, 0.25], [0.127, 0.15], [0.112, 0.075], [0.075, 0.025], [0, 0.022]];
  const pot = cutLathe(POT_OUT, POT_IN, 28);
  const potMat = new THREE.MeshStandardMaterial({ color: '#7d5a44', roughness: 0.85, side: THREE.DoubleSide });
  const potCapMat = new THREE.MeshStandardMaterial({ color: '#9a6e52', roughness: 0.95 });
  {
    const back = [], caps = [], full = [];
    RX.forEach((x) => { back.push(pot.back.clone().translate(x, 0.15, 0)); caps.push(pot.cap.clone().translate(x, 0.15, 0)); for (const z of [-0.5, -0.95]) full.push(pot.full.clone().translate(x + (z < -0.6 ? 0.2 : 0), 0.15, z)); });
    groupD.add(new THREE.Mesh(mergeGeometries(back), potMat), new THREE.Mesh(mergeGeometries(caps), potCapMat), new THREE.Mesh(mergeGeometries(full), potMat));
  }
  const zincMat = new THREE.MeshStandardMaterial({ color: '#d9dfe4', metalness: 1, roughness: 0.14 });
  zincMat.userData.detail = { albedo: 0.02, rough: 0.3, bump: 0.000005, scratch: 0, grime: 0 };
  const pools = RX.map((x) => {
    const g = new THREE.Group(); g.position.set(x, 0.172, 0); groupD.add(g);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 1, 24, 1, false, Math.PI / 2, Math.PI).translate(0, 0.5, 0), zincMat));
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.21, 1).translate(0, 0.5, 0.0008), zincMat));
    return g;
  });
  const drops = RX.map((x) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), zincMat); m.position.set(x, 0.5, -0.004); groupD.add(m); return m; });
  // zinc vapour: points drawn down from each front bulb through the neck
  const vapour = (() => {
    const n = 120 * RX.length, pos = new Float32Array(n * 3), sd = new Float32Array(n * 4), r = rng(97);
    for (let i = 0; i < n; i++) { pos[i * 3] = RX[i % RX.length]; sd.set([r(), r(), r(), r()], i * 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uViewport: { value: 800 }, uO: { value: OD.clone() }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `attribute vec4 aSeed; uniform float uTime, uViewport; uniform vec3 uO; varying float vA;
        void main(){
          float s = fract(uTime * (0.5 + aSeed.w * 0.3) + aSeed.x);
          float ang = aSeed.y * 6.2832 + uTime * 1.5;
          vec3 p;
          if (s < 0.4) { float u = s / 0.4; vec3 a = vec3(cos(ang) * 0.09 * sqrt(aSeed.z), 1.4 + 0.26 * aSeed.y, 0.0); p = mix(a, vec3(0.0, 1.22, 0.0), u * u); }
          else { float u = (s - 0.4) / 0.6; p = vec3((aSeed.y - 0.5) * 0.03 * (1.0 - u * 0.4), mix(1.22, 0.56, u), 0.0); }
          p.z = -0.006 - 0.018 * aSeed.w;
          p.x += position.x; p += uO;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.012 * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z), 1.2, 20.0);
          vA = smoothstep(0.0, 0.08, s) * smoothstep(1.0, 0.85, s);
        }`,
      fragmentShader: /* glsl */ `uniform float uOpacity; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); if (a * vA < 0.01) discard; gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * 1.6 * a * vA * uOpacity, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
  })();
  scene.add(vapour);
  // diagram overlay: the section outline and flow arrows down each neck
  const GOLD = '#ffd49a';
  const outline = progressLine([V(-1.7, 0, 0.01), V(-1.7, 2.5, 0.01), V(-1.5, 2.5, 0.01), V(-1.5, 0.15, 0.01), V(1.5, 0.15, 0.01), V(1.5, 2.5, 0.01), V(1.7, 2.5, 0.01), V(1.7, 0, 0.01), V(-1.7, 0, 0.01)], { color: GOLD, intensity: 1.3, head: 0.03 });
  const plateLine = progressLine([V(-1.5, 1.12, 0.012), V(1.5, 1.12, 0.012)], { color: GOLD, intensity: 1.0 });
  groupD.add(outline, plateLine);
  const flowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(GOLD) } },
    vertexShader: 'attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uOpacity; uniform vec3 uColor; varying float vS;
      void main(){ float d = fract(vS * 7.0 - uTime * 2.2); float a = smoothstep(0.0, 0.1, d) * smoothstep(0.6, 0.35, d); gl_FragColor = vec4(uColor * 2.2, a * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  {
    const pos = [], s = [];
    for (const x of RX) {
      pos.push(x + 0.075, 1.5, 0.015, x + 0.075, 0.62, 0.015); s.push(0, 0.88);
      pos.push(x + 0.045, 0.68, 0.015, x + 0.075, 0.62, 0.015, x + 0.105, 0.68, 0.015, x + 0.075, 0.62, 0.015); s.push(0.82, 0.88, 0.82, 0.88);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(s, 1));
    const ls = new THREE.LineSegments(g, flowMat); ls.frustumCulled = false; groupD.add(ls);
  }
  const fireGlowD = glowSprite({ color: '#ff8a3c', intensity: 0.8, scale: 3.2 }); fireGlowD.position.set(0, 1.6, -0.6); groupD.add(fireGlowD);
  const burstGlow = glowSprite({ color: '#ffd8a8', intensity: 2.5, scale: 1 }); burstGlow.position.set(0, 1.9, 0.3); groupD.add(burstGlow);
  const calloutD1 = new Callout('ZAWAR, RAJASTHAN · ZINC BY DISTILLATION', { dx: 0.15, dy: 0.22, size: 0.055, color: '#ffe6c8', sub: 'c. 9TH — 14TH C. AD · EUROPE: 1738', intensity: 1.3 });
  const calloutD2 = new Callout('ZINC BOILS AT 907 °C', { dx: -0.55, dy: -0.2, size: 0.07, color: '#ffe6c8', sub: 'VAPOUR CONDENSES IN THE COOL CHAMBER', intensity: 1.3 });
  backCallout(calloutD1, { alpha: 0.45 }); backCallout(calloutD2, { alpha: 0.45 }); groupD.add(calloutD1, calloutD2);
  calloutD1.position.set(1.62, 2.3, 0.05);
  calloutD2.position.set(-1.16, 0.85, 0.05);

  // =========================================================================================================
  // embers & sparks (all sets, one draw)
  const beatBirth = (t0, n, w) => (u) => t0 + Math.floor(u * n) * 0.5 + (u * n - Math.floor(u * n)) * w;
  const embers = makeEmbers([
    { count: 900, pos: V(0, 1.05, 0), jitter: V(0.8, 0.1, 0.8), dir: V(0, 1, 0), spread: 0.9, speed: 1.1, life: 1.7, g: 0.35, size: 0.011, birth: (r) => -1.8 + r * 4.1 },
    { count: 700, pos: V(0, 1.0, 0), jitter: V(0.5, 0.1, 0.5), dir: V(0, 1, 0.15), spread: 1.0, speed: 2.2, life: 1.3, g: 0.2, size: 0.013, birth: beatBirth(-0.5, 6, 0.12) },
    { count: 500, pos: V(0, 1.0, 0), jitter: V(0.4, 0.1, 0.4), dir: V(0, 1, 0.25), spread: 1.2, speed: 3.2, life: 1.2, g: -0.4, size: 0.016, birth: (r) => tF - 0.03 + r * 0.16 },
    { count: 350, pos: V(0, 0.42, 0.62), jitter: V(0.3, 0.2, 0.05), dir: V(0, 0.6, 1), spread: 0.9, speed: 1.2, life: 1.0, g: -0.6, size: 0.009, birth: (r) => -1.0 + r * 3.0 },
    { count: 500, pos: V(OD.x, 2.3, -0.7), jitter: V(2.6, 0.2, 1.0), dir: V(0, 1, 0.2), spread: 0.8, speed: 1.0, life: 1.5, g: 0.3, size: 0.016, birth: (r) => tZ - 1.5 + r * 2.4 },
    { count: 1500, pos: V(OD.x, 1.8, -0.3), jitter: V(1.6, 0.4, 0.5), dir: V(0, 0.55, 1), spread: 1.1, speed: 6.5, life: 1.0, g: -2.2, size: 0.02, birth: (r) => tZ + 0.3 + r * r * 0.55 },
  ], 13);
  scene.add(embers);

  // =========================================================================================================
  // cameras
  function makePath(keys) {
    const curve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
    return (t, out) => curve.getPoint(clamp(timeWarp(t, warp), 0, 1), out);
  }
  const camA = makePath([[-0.1, V(2.0, 1.4, 4.4)], [0.7, V(1.45, 1.25, 3.5)], [tC, V(0.8, 1.12, 2.4)], [tC + 0.45, V(0.38, 1.02, 1.78)], [tW + 0.05, V(0.16, 0.96, 1.48)]]);
  const tgtA = makePath([[-0.1, V(0, 0.98, 0)], [0.7, V(0, 0.92, 0)], [tC, V(0, 0.78, 0)], [tC + 0.45, V(0, 0.7, 0)], [tW + 0.05, V(0, 0.66, 0)]]);
  const camB = makePath([[tW, V(0.1, 0.12, 0.085)], [tP, V(0.43, 0.115, 0.1)]]);
  const tgtB = makePath([[tW, V(0.17, 0.0, 0.01)], [tP, V(0.52, 0.0, 0.025)]]);
  const camD = makePath([[tZ, V(0.75, 1.45, 5.7)], [tZ + 0.45, V(0.45, 1.5, 5.25)], [dur + 0.05, V(0.12, 1.6, 4.7)]]);
  const tgtD = makePath([[tZ, V(0.1, 1.62, -0.5)], [tZ + 0.45, V(0.05, 1.62, -0.5)], [dur + 0.05, V(0, 1.62, -0.6)]]);

  const cp = V(0, 0, 0), ct = V(0, 0, 0), tmp = V(0, 0, 0);
  const dof = { focus: 4, range: 1.5, amount: 0.4 };
  const bloom = { strength: 0.7 };
  let lastT = 0;
  const flick = (T) => 0.86 + 0.08 * Math.sin(T * 23.0) + 0.06 * Math.sin(T * 37.0 + 1.3);
  const BG = new THREE.Color(0, 0, 0);

  function update(t, info) {
    lastT = t;
    const T = info?.T ?? t + segment.start;
    const shot = t < tW ? 0 : t < tP ? 1 : t < tZ ? 2 : 3;
    groupA.visible = shot === 0; groupB.visible = shot === 1; groupC.visible = shot === 2; groupD.visible = shot === 3;
    vapour.visible = shot === 3;
    const fl = flick(T), beat = pulse(T, { decay: 4 }), beat2 = pulse(T, { decay: 4, offset: 0.25 });
    embers.tick(t, info);
    camera.near = shot === 1 ? 0.01 : 0.1;

    // ---------------------------------------------------------------- A: forge
    if (shot === 0) {
      const roar = 0.82 + 0.3 * ramp(t, tF - 0.1, tF + 0.15, ease.outCubic) - 0.08 * ramp(t, tF + 0.2, tF + 0.9) + 0.12 * beat;
      for (const m of [coalMat, bedMat, crucibleMat, heroShell, heroCut, ironHot, meltMat]) { m.uniforms.uTime.value = T; m.uniforms.uFlick.value = fl; }
      const open = ramp(t, tC - 0.05, tC + 0.3);
      coalMat.uniforms.uHeat.value = lerp(0.92, 0.62, open) * roar;
      bedMat.uniforms.uHeat.value = lerp(0.85, 0.5, open) * roar;
      embers.material.uniforms.uOpacity.value = 1 - 0.75 * open;
      crucibleMat.uniforms.uHeat.value = lerp(0.9, 0.74, open) + 0.06 * ramp(t, tC - 0.3, tC + 0.1);
      heroShell.uniforms.uHeat.value = lerp(0.9, 0.7, open); heroCut.uniforms.uHeat.value = lerp(0.66, 0.5, open);
      smokeHaze.u.opacity = 0.5 * (1 - 0.8 * open);
      furU.uHeat.value = roar * lerp(1, 0.6, open);
      flames.forEach((f, i) => { f.material.uniforms.uTime.value = T + i * 0.37; f.material.uniforms.uI.value = (0.7 + 0.45 * beat) * roar * (i === 2 ? 1.2 : 0.85) * (1 - 0.85 * open); f.scale.set(1, 0.85 + 0.35 * roar + 0.15 * beat, 1); f.visible = open < 0.6; });
      heatGlow.material.opacity = (0.55 + 0.35 * roar) * (1 - 0.9 * open); heatGlow.scale.setScalar(2.4 + 0.5 * beat);
      mouthGlow.material.opacity = 0.7 * (1 - ramp(t, tC, tC + 0.3));
      // bellows: compress on the beat, refill between, the two bags alternating
      for (const b of bellows) {
        const c = b.s < 0 ? beat : beat2;
        b.bagPivot.scale.set(1, 1 - 0.4 * c, 1);
        b.battens.position.y = 0.44 * (1 - 0.4 * c) + 0.02;
      }
      // cutaway: the near half of the furnace peels away from the top down
      const cutY = lerp(1.5, -0.08, ramp(t, tC - 0.05, tC + 0.32, ease.inOutCubic));
      furU.uCutY.value = cutY;
      for (const m of [coalMat, bedMat, crucibleMat, heroShell, heroCut, ironHot, meltMat]) m.uniforms.uCutY.value = cutY;
      furCap.visible = cutY < 1.45;
      // inside the hero crucible: plant matter chars and burns away, the iron glows white and melts into a pool,
      // which settles into a domed steel 'button'
      const burn = ramp(t, tC + 0.12, tC + 0.42);
      leafMat.emissiveIntensity = 3 * Math.sin(Math.PI * burn); leaves.visible = burn < 1;
      leaves.children.forEach((l, i) => l.scale.setScalar(1 - ramp(burn, i * 0.05, 0.6 + i * 0.04)));
      const melt0 = ramp(t, tC + 0.25, tC + 0.68, ease.inOutSine);
      ironHot.uniforms.uHeat.value = lerp(0.42, 1.08, ramp(t, tC, tC + 0.4));
      ironBits.children.forEach((b, i) => { const k = 1 - ramp(melt0, i * 0.035, 0.45 + i * 0.035); b.scale.setScalar(Math.max(k, 0.001)); b.position.y = b.userData.base.y * k + 0.012 * (1 - k); b.visible = k > 0.01; });
      const h = 0.048 * melt0;
      melt.visible = h > 0.001;
      meltBody.scale.y = meltFace.scale.y = Math.max(h, 1e-4);
      meltDome.position.y = h; meltDome.scale.set(1, 0.28 * ramp(t, tC + 0.5, tW), 1);
      meltMat.uniforms.uHeat.value = lerp(1.05, 0.82, ramp(t, tC + 0.6, tW));
      // light
      fire.position.set(OA.x, lerp(0.95, 1.9, open), OA.z); fire.intensity = 9 * roar * fl * (1 - 0.9 * open); fire.color.set('#ff8a3a');
      fill.position.set(OA.x + lerp(0, 0.9, open), lerp(0.45, 1.2, open), lerp(0.95, 1.6, open)); fill.intensity = lerp(2.4, 0.25, open) * fl * roar; fill.color.set('#ffa24e');
      key.color.set('#7d93c4'); key.intensity = 0.4; key.position.set(OA.x - 3, 5, -4); key.target.position.set(OA.x, 0.6, 0); setKeyShadow(5, 0.5, 30);
      spot.intensity = 0; hemi.intensity = 0.04;
      scene.environmentIntensity = 0.07;
      scene.fog.color.set(0x0a0604); scene.fog.density = 0.045;
      // camera: slow push on the roaring furnace, then in to the section as it opens
      camA(t, cp); tgtA(t, ct);
      cp.x += Math.sin(t * 1.3) * 0.012; cp.y += Math.sin(t * 1.7 + 1) * 0.008;
      camera.fov = lerp(36, 31, ramp(t, tC - 0.2, tW));
      calloutA.position.set(0.07, 0.3 + 0.2, 0.012);
      calloutA.reveal(ramp(t, tC + 0.1, tC + 0.45), 1 - ramp(t, tW - 0.06, tW));
      dof.focus = lerp(cp.distanceTo(ct), Math.hypot(cp.x, cp.y - 0.45, cp.z), ramp(t, tC, tC + 0.3)); dof.range = lerp(1.6, 0.4, ramp(t, tC, tW)); dof.amount = 0.5;
      bloom.strength = lerp(0.72 + 0.12 * beat, 0.32, open);
      api.exposure = lerp(1.0, 0.9, open);
    }

    // ---------------------------------------------------------------- B: blade
    if (shot === 1) {
      const u = (t - tW) / (tP - tW);
      bladeU.uEtch.value = ramp(t, tW - 0.05, tW + 0.38, ease.inOutSine);
      bladeU.uSweepX.value = OB.x + lerp(0.12, 0.62, sat(u));
      bladeU.uSweepI.value = 2.2;
      bladeU.uPlaneY.value = 0.45;
      spot.position.set(OB.x + 0.35, 0.7, 0.9); spot.target.position.set(OB.x + 0.35, 0, 0.02); spot.intensity = 2.2; spot.angle = 0.35; spot.penumbra = 0.9; spot.color.set('#ffe9d2');
      key.color.set('#ffb070'); key.intensity = 0.6; key.position.set(OB.x + 1.6, 0.35, -0.1); key.target.position.set(OB.x + 0.35, 0, 0); setKeyShadow(0.7, 0.1, 4);
      fire.intensity = 0; fill.position.set(OB.x + 0.4, 0.25, -0.8); fill.intensity = 0.25; fill.color.set('#ff8a40');
      hemi.intensity = 0.05;
      scene.environmentIntensity = 0.22;
      scene.fog.density = 0.0;
      camB(t, cp); tgtB(t, ct); cp.add(OB); ct.add(OB);
      camera.fov = 30;
      calloutB.position.set(0.31, 0.008, bladeC(0.378) + 0.012);
      calloutB.reveal(ramp(t, tW + 0.08, tW + 0.4), 1 - ramp(t, tP - 0.05, tP));
      dof.focus = cp.distanceTo(ct); dof.range = 0.12; dof.amount = 0.5;
      bloom.strength = 0.65;
      api.exposure = 1.05;
    }

    // ---------------------------------------------------------------- C: the Iron Pillar
    if (shot === 2) {
      const u = sat((t - tP) / (tZ - tP + 0.15));
      const a = lerp(-0.6, 0.18, u), R = lerp(15.5, 14.2, u);
      cp.set(OC.x + Math.sin(a) * R, lerp(1.2, 1.55, u), Math.cos(a) * R);
      ct.set(OC.x, 4.7, 0);
      camera.fov = 37;
      key.color.set('#ffe2bf'); key.intensity = 4.6; key.position.set(OC.x - 14, 11, 5); key.target.position.set(OC.x, 0, -3); setKeyShadow(18, 1, 70);
      hemi.intensity = 0.3; hemi.color.set('#a8c2e6'); hemi.groundColor.set('#7a6048');
      fire.intensity = 0; fill.intensity = 0; spot.intensity = 0;
      scene.environmentIntensity = 0.35;
      scene.fog.color.set(0xb9ae9c); scene.fog.density = 0.0045;
      filmMat.uniforms.uTime.value = T;
      filmMat.uniforms.uReveal.value = lerp(-0.2, 6.3, ramp(t, tP + 0.3, tP + 0.75, ease.inOutSine));
      filmMat.uniforms.uOpacity.value = 0.55 * (1 - ramp(t, tZ - 0.1, tZ));
      calloutC1.position.set(0, 5.4, 0); calloutC2.position.set(0, 2.6, 0);
      calloutC1.reveal(ramp(t, tP + 0.05, tP + 0.4), 1);
      calloutC2.reveal(ramp(t, tP + 0.3, tP + 0.65), 1);
      dimC.reveal(ramp(t, tP + 0.1, tP + 0.5), 1);
      dof.focus = Math.hypot(cp.x - OC.x, cp.z); dof.range = 8; dof.amount = 0.2;
      bloom.strength = 0.3;
      api.exposure = 0.9;
    }

    // ---------------------------------------------------------------- D: Zawar
    if (shot === 3) {
      for (const m of [retMat, retCapMat, chargeMat, fuelMat]) { m.uniforms.uTime.value = T; m.uniforms.uFlick.value = fl; }
      const burst = ramp(t, tZ + 0.3, dur, ease.inQuad);
      fuelMat.uniforms.uHeat.value = 0.62 + 0.35 * burst;
      vapour.material.uniforms.uTime.value = T; vapour.material.uniforms.uViewport.value = info?.height ?? 800;
      flowMat.uniforms.uTime.value = T; flowMat.uniforms.uOpacity.value = 0.75 * ramp(t, tZ + 0.1, tZ + 0.35);
      outline.progress = ramp(t, tZ - 0.05, tZ + 0.4, ease.outCubic); outline.opacity = 0.8;
      plateLine.progress = ramp(t, tZ + 0.1, tZ + 0.4); plateLine.opacity = 0.7;
      const lvl = 0.035 + 0.055 * ramp(t, tZ - 0.2, dur);
      pools.forEach((p) => { p.scale.y = lvl; });
      drops.forEach((d, i) => {
        const ph = ((t * 1.7 + i * 0.37) % 1 + 1) % 1;
        if (ph < 0.62) { const s = 0.006 + 0.011 * (ph / 0.62); d.scale.setScalar(s); d.position.y = 0.52 - s * 0.9; }
        else { const ft = (ph - 0.62) / 1.7; d.scale.setScalar(0.016); d.position.y = 0.505 - 4.9 * ft * ft; }
        d.visible = d.position.y > 0.172 + lvl + 0.01;
      });
      fireGlowD.material.opacity = 0.7 + 0.3 * fl;
      burstGlow.material.opacity = burst; burstGlow.scale.setScalar(0.5 + 6 * burst * burst);
      fire.position.set(OD.x, 1.6, -0.3); fire.intensity = (5 + 10 * burst) * fl; fire.color.set('#ff8a3a');
      fill.position.set(OD.x + 0.3, 0.55, 1.4); fill.intensity = 1.6; fill.color.set('#9fb8e0');
      spot.position.set(OD.x + 2.5, 3.2, 4.5); spot.target.position.set(OD.x, 1.0, 0); spot.intensity = 26; spot.angle = 0.45; spot.penumbra = 0.9; spot.color.set('#ffd7aa');
      key.color.set('#8aa0c8'); key.intensity = 0.3; key.position.set(OD.x - 3, 6, 4); key.target.position.set(OD.x, 1, -0.5); setKeyShadow(3.5, 0.5, 20);
      hemi.intensity = 0.05;
      scene.environmentIntensity = 0.22;
      scene.fog.color.set(0x070504); scene.fog.density = 0.02;
      camD(t, cp); tgtD(t, ct); cp.add(OD); ct.add(OD);
      cp.x += Math.sin(t * 1.1) * 0.01;
      const shake = burst * 0.02; cp.x += Math.sin(T * 91) * shake; cp.y += Math.sin(T * 77 + 1) * shake;
      camera.fov = 35;
      calloutD1.reveal(ramp(t, tZ + 0.05, tZ + 0.4), 1 - ramp(t, dur - 0.25, dur));
      calloutD2.reveal(ramp(t, tZ + 0.22, tZ + 0.55), 1 - ramp(t, dur - 0.25, dur));
      dof.focus = cp.distanceTo(ct); dof.range = 2.2; dof.amount = 0.3;
      bloom.strength = 0.7 + 0.5 * burst;
      api.exposure = 1.0 + 0.25 * burst;
    }

    camera.position.copy(cp);
    camera.up.set(0, 1, 0);
    camera.lookAt(ct);
    camera.updateProjectionMatrix();
    for (const c of [calloutA, calloutB, calloutC1, calloutC2, calloutD1, calloutD2]) faceCamera(c, camera);
    dimRig.rotation.y = Math.atan2(camera.position.x - OC.x, camera.position.z);
    smokeHaze.tick(t, info);
    void tmp; void BG; void envelope;
  }

  const AR = [
    { centre: V(0, 0.6, 0), radius: 1.5 },
    { centre: V(OB.x + 0.35, 0.02, 0.02), radius: 0.5 },
    { centre: V(OC.x, 3.7, 0), radius: 4.6 },
    { centre: V(OD.x, 1.2, -0.7), radius: 2.0 },
  ];
  const api = {
    scene, camera, update, dof, bloom, exposure: 1,
    arSubject: (t) => AR[t < tW ? 0 : t < tP ? 1 : t < tZ ? 2 : 3],
    get exploreLimits() { return lastT < tW ? { yaw: 0.8, pitchDown: 0.3, pitchUp: 0.5, zoomOut: 2.0 } : lastT < tP ? { yaw: 0.5, pitchDown: 0.3, pitchUp: 0.4, zoomOut: 1.6 } : lastT < tZ ? { yaw: 1.2, pitchDown: 0.25, pitchUp: 0.8, zoomOut: 2.0 } : { yaw: 0.6, pitchDown: 0.3, pitchUp: 0.4, zoomOut: 1.8 }; },
  };
  return api;
}
