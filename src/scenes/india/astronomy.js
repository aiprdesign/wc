// ASTRONOMY — "The measure of the sky" (20.0 – 25.0 s)
// Technique: procedural planet shading (baked Earth maps, shared with the finale), analytic
// motion graphics (a circle rolled out into its circumference, the jya half-chords drawn as a
// table), procedural architecture with a wire → stone build, and a physically placed sun: the
// Samrat Yantra's shadow is cast by the real gnomon onto its real quadrant, the sun turning about
// the celestial pole at 15° an hour.
//   Shot 1  0.0–1.2  night: the Earth turns on its tilted axis while the stars stay fixed
//                    (the camera only dollies, so the star field does not move on screen).
//   Shot 2  1.2–2.3  the equator lifts off as a circle of light and rolls out its circumference:
//                    π ≈ 62832 / 20000 = 3.1416 (Aryabhatiya, 499).
//   Shot 3  2.3–3.2  push into the circle: 24 half-chords (jya) at 3°45', the table of differences.
//   Shot 4  3.2–5.0  dawn at Jaipur: the Samrat Yantra builds from wire to sandstone and lime;
//                    a time-lapse sun sweeps the gnomon's shadow across the graduated quadrant;
//                    a raking sun throws coloured flares into the 'spectrum' wipe.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, rng, TAU } from '../../lib/math.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { progressLine, segmentsLine, revealLines, circlePoints } from '../../lib/lines.js';
import { glowSprite } from '../../lib/materials.js';
import { Dust } from '../../lib/particles.js';
import { Callout, faceCamera } from '../../lib/hud.js';
import { GLSL_NOISE } from '../../lib/noise.js';
import { bakeEarth, earthVert, earthFrag, atmoVert, atmoFrag } from '../finale-earth.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const GOLD = '#ffcf85';
const AXIS_TILT = 23.44 * DEG;          // the Earth's axial tilt
const LAT = 27 * DEG;                   // Jaipur ≈ 26.9° N: the gnomon's hypotenuse rises at this angle
// Aryabhata's sine table: first differences of the jya for R = 3438, every 3°45' (they sum to R)
const JYA_DIFF = [225, 224, 222, 219, 215, 210, 205, 199, 191, 183, 174, 164, 154, 143, 131, 119, 106, 93, 79, 65, 51, 37, 22, 7];
const ARCHES = [[13, 6.4], [6.8, 7.2], [-6, 9], [-13, 9], [-19.5, 9]];   // gnomon openings: [z centre, crown height]
const MW_NORMAL = V(0.32, 0.78, -0.54).normalize();   // the Milky Way's plane (normal), shared by sky and stars

// ---------------------------------------------------------------------------------------------
// helpers

// A glowing ribbon in its group's XY plane, rebuilt from a polyline (pure: set from t every frame).
class Ribbon extends THREE.Mesh {
  constructor(n, { width = 0.05, color = GOLD, core = 3.2, glow = 0.5 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const side = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { side[i * 2] = 1; side[i * 2 + 1] = -1; }
    g.setAttribute('aS', new THREE.BufferAttribute(side, 1));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uCore: { value: core }, uGlow: { value: glow }, uOpacity: { value: 1 } },
      vertexShader: 'attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uCore, uGlow, uOpacity; varying float vS;
        void main(){ float s = abs(vS); float core = smoothstep(0.22, 0.04, s); float glow = pow(1.0 - s, 2.6);
          gl_FragColor = vec4(uColor * (core * uCore + glow * uGlow + core * core * 1.5) * uOpacity, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    super(g, m);
    this.n = n; this.width = width; this.frustumCulled = false;
  }
  set opacity(v) { this.material.uniforms.uOpacity.value = v; this.visible = v > 0.002; }
  // xy: Float32Array(2n)
  setPoints(xy) {
    const p = this.geometry.attributes.position.array, n = this.n, w = this.width / 2;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = xy[b * 2] - xy[a * 2], ty = xy[b * 2 + 1] - xy[a * 2 + 1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const x = xy[i * 2], y = xy[i * 2 + 1];
      p[i * 6] = x - ty * w; p[i * 6 + 1] = y + tx * w; p[i * 6 + 2] = 0;
      p[i * 6 + 3] = x + ty * w; p[i * 6 + 4] = y - tx * w; p[i * 6 + 5] = 0;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}

// A world-space mono label whose string changes with time (redrawn only when it changes).
class LiveLabel extends THREE.Mesh {
  constructor({ height = 1, chars = 14, color = '#ffe6c0', intensity = 1.4 } = {}) {
    const size = 96, c = document.createElement('canvas');
    c.width = Math.ceil(chars * size * 0.66); c.height = Math.ceil(size * 1.4);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const w = height * c.width / size, h = height * c.height / size;
    super(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, depthWrite: false, toneMapped: false }));
    Object.assign(this, { c, g: c.getContext('2d'), tex, size, str: null });
    this.renderOrder = 11;
  }
  set(str) {
    if (str === this.str) return;
    this.str = str;
    const { g, c, size } = this;
    g.clearRect(0, 0, c.width, c.height);
    g.font = `500 ${size}px "${FONTS.mono}"`; g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(str, c.width / 2, c.height / 2);
    this.tex.needsUpdate = true;
  }
}

// normalise for merging (non-indexed, position / normal / uv)
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  n.clearGroups();
  return n;
}
// quad strip between two polylines (arrays of Vector3 of equal length), with optional uv rows
function strip(A, B, uvA = null, uvB = null) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < A.length; i++) {
    pos.push(A[i].x, A[i].y, A[i].z, B[i].x, B[i].y, B[i].z);
    uv.push(...(uvA ? uvA[i] : [0, 0]), ...(uvB ? uvB[i] : [0, 0]));
  }
  for (let i = 0; i < A.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}

// World-space build front: geometry exists only below uBuild (world Y, noisy edge); a hot rim glows
// at the front (the classical chapter's wire → stone language).
function withBuild(material, edgeColor = '#ffb766') {
  const u = { uBuild: { value: 100 }, uEdge: { value: new THREE.Color(edgeColor) }, uEdgeGain: { value: 2.2 } };
  material.userData.build = u;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBuildW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vBuildW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBuildW; uniform float uBuild, uEdgeGain; uniform vec3 uEdge;
        float bHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float bNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(bHash(i), bHash(i+vec2(1,0)), f.x), mix(bHash(i+vec2(0,1)), bHash(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bn = (bNoise(vBuildW.xz * 0.35 + vBuildW.y * 0.08) - 0.5) * 1.6;
        float bd = uBuild + bn - vBuildW.y;
        if (bd < 0.0) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float bSlope = smoothstep(0.002, 0.04, fwidth(vBuildW.y));
        totalEmissiveRadiance += uEdge * uEdgeGain * mix(0.04, 1.0, bSlope) * (1.0 - smoothstep(0.0, 0.6, bd));`);
  };
  material.customProgramCacheKey = () => 'astro-build-v1';
  return material;
}

// The graduated marble band of a quadrant: quarter-degree ticks, degrees, 5° and 15° (one hour) marks,
// hour numerals (Latin, as the film's type has no Devanagari). hourAt(deg along the arc) → hour.
function scaleTexture(hourAt, seed) {
  const W = 2048, H = 288, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#e8dfcf'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {                     // veins and weathering in the marble
    g.fillStyle = `rgba(${r() < 0.5 ? '150,135,115' : '255,250,240'},${0.03 + r() * 0.05})`;
    g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 60, 2 + r() * 10, r() * 3, 0, TAU); g.fill();
  }
  for (let k = 0; k < 24; k++) { g.fillStyle = 'rgba(70,55,40,0.5)'; g.fillRect(Math.round((k / 24) * W), 0, 2, H); }   // slab joints
  g.strokeStyle = 'rgba(45,32,22,0.85)';
  g.lineWidth = 3; g.beginPath(); g.moveTo(0, 18); g.lineTo(W, 18); g.moveTo(0, H - 18); g.lineTo(W, H - 18); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 30); g.lineTo(W, 30); g.moveTo(0, H - 30); g.lineTo(W, H - 30); g.stroke();
  for (let q = 0; q <= 360; q++) {
    const x = (q / 360) * W, deg = q / 4;
    const L = q % 60 === 0 ? 0.42 : q % 20 === 0 ? 0.3 : q % 4 === 0 ? 0.2 : 0.11;
    g.lineWidth = q % 60 === 0 ? 3.5 : q % 4 === 0 ? 2 : 1.2;
    g.beginPath(); g.moveTo(x, 30); g.lineTo(x, 30 + L * H); g.moveTo(x, H - 30); g.lineTo(x, H - 30 - L * H); g.stroke();
    if (q % 60 === 0 && q > 0 && q < 360) {
      g.font = `600 52px "${FONTS.serif}"`; g.fillStyle = 'rgba(45,32,22,0.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(hourAt(deg)), x, H / 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------------------------------------

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const dur = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.1;
  scene.fog = new THREE.FogExp2('#d79a74', 0);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.05, 2400);
  scene.add(camera);
  const r = rng(499);

  const tAry = cue('aryabhata'), tPi = cue('piDigits'), tSine = cue('sineTable'), tJM = cue('jantarMantar'), tShadow = cue('samratShadow');
  const tCut = tJM;                     // night → dawn at Jaipur

  // =========================================================================== sky + stars
  const skyU = { uDawn: { value: 0 }, uSun: { value: V(1, 0.2, 0).normalize() }, uMW: { value: MW_NORMAL } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU,
    vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GLSL_NOISE + /* glsl */ `
      uniform float uDawn; uniform vec3 uSun, uMW; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        // night: deep space, a faint Milky Way with a dark dust lane
        float b = dot(d, uMW);
        float n1 = snoise(d * 2.6) * 0.5 + 0.5, n2 = snoise(d * 8.0 + 3.0) * 0.5 + 0.5, n3 = snoise(d * 22.0 - 5.0) * 0.5 + 0.5;
        float band = exp(-b * b / 0.016) * (0.35 + 0.65 * n1) * (0.6 + 0.4 * n3);
        float lane = exp(-pow((b - 0.012) / 0.022, 2.0)) * smoothstep(0.35, 0.75, n2);
        vec3 night = vec3(0.0022, 0.003, 0.0075) + vec3(0.06, 0.052, 0.07) * band * (1.0 - 0.8 * lane)
                   + vec3(0.016, 0.01, 0.026) * exp(-b * b / 0.15) * n1 + vec3(0.012, 0.004, 0.006) * pow(n2, 3.0);
        // dawn over Jaipur: zenith blue, rose band, a hot gold horizon under the sun
        float h = d.y, cs = max(dot(d, uSun), 0.0), az = pow(cs, 2.0);
        vec3 zen = vec3(0.03, 0.09, 0.3), mid = vec3(0.55, 0.32, 0.36), hor = vec3(1.45, 0.6, 0.22);
        vec3 c = mix(mid * (0.7 + 0.5 * az), zen, smoothstep(0.03, 0.55, h));
        c = mix(c, mix(vec3(0.85, 0.42, 0.42), hor, smoothstep(0.0, 0.6, cs)) * (0.5 + 1.1 * az), 1.0 - smoothstep(-0.02, 0.16 + 0.3 * az, h));
        c += vec3(1.5, 0.8, 0.38) * pow(cs, 14.0) * 0.45 + vec3(3.0, 2.2, 1.3) * pow(cs, 900.0) * 2.0;
        c *= 0.9 + 0.12 * n1;
        c = mix(c, vec3(0.32, 0.17, 0.11), smoothstep(0.0, -0.06, h));
        gl_FragColor = vec4(mix(night, c, uDawn), 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  const NS = lite ? 5000 : 11000;
  const sPos = new Float32Array(NS * 3), sCol = new Float32Array(NS * 3), sSize = new Float32Array(NS), sPh = new Float32Array(NS);
  {
    const d = V(0, 0, 0), tmp = V(0, 0, 0);
    for (let i = 0; i < NS; i++) {
      const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u);
      d.set(s * Math.cos(th), u, s * Math.sin(th));
      const inBand = i > NS * 0.5;
      if (inBand) {                                  // crowd towards the galactic plane
        const g = (r() + r() + r() - 1.5) * 0.16;
        tmp.copy(MW_NORMAL).multiplyScalar(d.dot(MW_NORMAL));
        d.sub(tmp).normalize().multiplyScalar(Math.sqrt(1 - g * g)).addScaledVector(MW_NORMAL, g);
      }
      sPos.set([d.x * 900, d.y * 900, d.z * 900], i * 3);
      const m = Math.pow(r(), inBand ? 9 : 5.5);       // a few bright stars, a great many faint ones
      sSize[i] = 1.1 + m * 4.2;
      const k = r(), c = k < 0.2 ? [0.7, 0.8, 1.0] : k < 0.75 ? [1.0, 0.96, 0.9] : k < 0.92 ? [1.0, 0.82, 0.6] : [1.0, 0.66, 0.45];
      const I = (inBand ? 0.22 : 0.45) + m * 3.6;
      sCol.set([c[0] * I, c[1] * I, c[2] * I], i * 3);
      sPh[i] = r();
    }
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aPh', new THREE.BufferAttribute(sPh, 1));
  const starU = { uViewport: { value: 800 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uZenith: { value: 0 } };
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: starU,
    vertexShader: /* glsl */ `attribute vec3 aColor; attribute float aSize, aPh; uniform float uViewport, uOpacity, uTime, uZenith;
      varying vec3 vC;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, aSize * uViewport / 560.0);
        float tw = 0.78 + 0.22 * sin(uTime * (3.0 + aPh * 6.0) + aPh * 60.0);
        float h = normalize(position).y;
        vC = aColor * uOpacity * tw * mix(1.0, smoothstep(0.3, 0.95, h) * 0.6, uZenith); }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d2 = dot(p, p);
      float a = exp(-d2 * 30.0) + 0.25 * exp(-d2 * 8.0); if (a < 0.01) discard; gl_FragColor = vec4(vC * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  scene.add(stars);

  // =========================================================================== shot 1: the Earth
  const night = new THREE.Group();
  scene.add(night);
  const maps = bakeEarth(ctx.renderer, { width: lite ? 1024 : 2048 });
  const sunE = V(0.95, 0.3, 0.05).normalize(), sunObj = V(0, 0, 0), shadeE = sunE.clone();
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      uSurf: { value: maps.surf }, uAux: { value: maps.aux }, uSun: { value: sunE }, uSunObj: { value: sunObj }, uShade: { value: shadeE },
      uCloudOff: { value: 0 }, uCity: { value: 0.6 }, uBright: { value: 1 }, uWarm: { value: 0.15 }, uTime: { value: 0 },
    },
    vertexShader: earthVert, fragmentShader: earthFrag,
  });
  const tilt = new THREE.Group();
  tilt.rotation.set(0.18, 0, AXIS_TILT);             // the axis leans up and to the left
  night.add(tilt);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, lite ? 96 : 160, lite ? 64 : 100), earthMat);
  tilt.add(earth);
  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunE }, uShade: { value: shadeE }, uR: { value: 1 }, uHs: { value: 0.012 }, uAtmo: { value: 1.3 }, uMie: { value: 0 }, uWarm: { value: 0.1 } },
    vertexShader: atmoVert, fragmentShader: atmoFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.07, 96, 64), atmoMat);
  atmo.renderOrder = 3;
  night.add(atmo);

  // the axis (dashed, through the poles) and on out to the celestial pole among the fixed stars
  const axisDash = segmentsLine(Array.from({ length: 30 }, (_, i) => { const y = -1.75 + i * 0.1167; return [V(0, y, 0), V(0, y + 0.07, 0)]; }),
    { color: GOLD, intensity: 1.6, orderFn: (a, b, i) => (i / 30) * 0.6, stagger: 0.6 });
  const axisFar = progressLine([V(0, 1.75, 0), V(0, 900, 0)], { color: GOLD, intensity: 0.5, head: 0.0 });
  tilt.add(axisDash, axisFar);
  const poleStar = glowSprite({ color: '#fff2da', intensity: 3.5, scale: 18 });
  tilt.add(poleStar);
  poleStar.position.set(0, 880, 0);
  // the turning: an arc arrow round the equator, eastward
  const spinArcPts = circlePoints(1.28, 64, { start: -0.35, end: 2.0, plane: 'xz' }).map((p) => p.set(p.x, 0, -p.z));
  const spinArc = progressLine(spinArcPts, { color: GOLD, intensity: 1.8, head: 0.08 });
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), transparent: true, toneMapped: false, depthWrite: false }));
  tilt.add(spinArc, arrowHead);
  const equator = new Ribbon(161, { width: 0.05, core: 2.4, glow: 0.45 });
  {
    const xy = new Float32Array(161 * 2);
    for (let i = 0; i <= 160; i++) { const a = (i / 160) * TAU; xy[i * 2] = Math.cos(a); xy[i * 2 + 1] = Math.sin(a); }
    equator.setPoints(xy);
  }
  const equatorGrp = new THREE.Group();
  equatorGrp.add(equator);
  night.add(equatorGrp);

  const earthCallout = new Callout('THE EARTH TURNS ON ITS AXIS', { dx: -0.75, dy: -0.06, size: 0.12, color: '#ffe6bf', sub: 'ARYABHATIYA, 499', intensity: 1.6 });
  night.add(earthCallout);
  const poleLabel = new TextPlane('THE STARS STAND STILL', { font: FONTS.mono, height: 0.07, letterSpacing: 0.3, color: '#dfe8ff', intensity: 1.0 });
  earthCallout.add(poleLabel);
  poleLabel.position.set(-0.75 - 0.024 - poleLabel.worldWidth / 2, -0.06 - 0.12 * 2.05, 0);

  // =========================================================================== shot 2: π
  // The diagram plane: a ground line, a circle of diameter D that rolls out its circumference.
  const G = new THREE.Group();
  G.position.set(-3.1, -0.95, 4.2);
  night.add(G);
  const R = 0.7, D = 2 * R, X0 = -2.45, YG = -0.5, CIRC = TAU * R;
  const NP = 241;
  const rollXY = new Float32Array(NP * 2);
  const rollPoints = (s) => {
    for (let i = 0; i < NP; i++) {
      const u = (i / (NP - 1)) * CIRC;
      if (u <= s) { rollXY[i * 2] = X0 + u; rollXY[i * 2 + 1] = YG; }
      else { const a = -Math.PI / 2 + (u - s) / R; rollXY[i * 2] = X0 + s + R * Math.cos(a); rollXY[i * 2 + 1] = YG + R + R * Math.sin(a); }
    }
    return rollXY;
  };
  const roll = new Ribbon(NP, { width: 0.06, core: 3.4, glow: 0.55 });
  G.add(roll);
  // the wheel's ghost outline and its turning diameter
  const ghostRing = progressLine(circlePoints(R, 120), { color: GOLD, intensity: 0.55 });
  const spoke = segmentsLine([[V(-R, 0, 0), V(R, 0, 0)]], { color: '#fff0d0', intensity: 1.4, orderFn: () => 0, stagger: 0 });
  const hubDot = glowSprite({ color: GOLD, intensity: 2, scale: 0.12 });
  const wheel = new THREE.Group();
  wheel.add(ghostRing, spoke, hubDot);
  G.add(wheel);
  const groundGuide = progressLine([V(X0 - 0.35, YG, 0), V(X0 + CIRC + 0.95, YG, 0)], { color: '#d9c7a6', intensity: 0.35 });
  G.add(groundGuide);
  // diameters along the ground: 1, 2, 3 and π
  const ticks = [];
  for (const [k, label] of [[1, '1 D'], [2, '2 D'], [3, '3 D'], [Math.PI, 'π D']]) {
    const x = X0 + k * D, big = k === Math.PI;
    const tk = segmentsLine([[V(x, YG - (big ? 0.12 : 0.07), 0), V(x, YG + (big ? 0.12 : 0.07), 0)]], { color: big ? '#fff2d6' : GOLD, intensity: big ? 2.4 : 1.4, orderFn: () => 0, stagger: 0 });
    const lb = new TextPlane(label, { font: big ? FONTS.serif : FONTS.mono, italic: big, weight: big ? 600 : 400, height: big ? 0.15 : 0.065, letterSpacing: big ? 0 : 0.2, color: big ? '#fff0d6' : '#ffe2b8', intensity: big ? 1.7 : 1.1 });
    lb.position.set(x, YG + (big ? 0.27 : 0.17), 0);
    G.add(tk, lb);
    ticks.push({ x, tk, lb });
  }
  const diaLabel = new TextPlane('D = 20000', { font: FONTS.mono, height: 0.07, letterSpacing: 0.2, color: '#fff0d6', intensity: 1.3 });
  G.add(diaLabel);
  const eqPi = new TextPlane('π ≈ 62832 / 20000 = 3.1416', { font: FONTS.serif, italic: true, weight: 600, height: 0.26, color: '#fff0d6', intensity: 1.6 });
  eqPi.position.set(-0.25, YG - 0.42, 0);
  const eqRule = new TextPlane('(100 + 4) × 8 + 62000 = 62832, THE CIRCUMFERENCE OF A CIRCLE OF DIAMETER 20000', { font: FONTS.mono, size: 72, height: 0.052, letterSpacing: 0.16, color: '#ffe2b8', intensity: 1.05 });
  eqRule.position.set(-0.25, YG - 0.69, 0);
  const eqAsanna = new TextPlane('ARYABHATA CALLS IT ASANNA: "APPROXIMATE"', { font: FONTS.mono, height: 0.046, letterSpacing: 0.22, color: '#ffd9a0', intensity: 0.95 });
  eqAsanna.position.set(-0.25, YG - 0.81, 0);
  G.add(eqPi, eqRule, eqAsanna);

  // =========================================================================== shot 3: the jya
  const CC = V(X0 + CIRC, YG + R, 0);             // where the wheel comes to rest
  const sine = new THREE.Group();
  sine.position.copy(CC);
  G.add(sine);
  const radii = segmentsLine([[V(-R, 0, 0), V(R, 0, 0)], [V(0, -R, 0), V(0, R, 0)]], { color: '#e8d6b4', intensity: 0.6, orderFn: (a, b, i) => i * 0.2, stagger: 0.8 });
  sine.add(radii);
  const quadTicks = [], radial = [];
  for (let k = 0; k <= 24; k++) {
    const a = k * 3.75 * DEG, c = Math.cos(a), s = Math.sin(a);
    quadTicks.push([V(c * R, s * R, 0), V(c * (R + (k % 4 === 0 ? 0.09 : 0.045)), s * (R + (k % 4 === 0 ? 0.09 : 0.045)), 0)]);
    if (k > 0) radial.push([V(0, 0, 0), V(c * R, s * R, 0)]);
  }
  const qTicks = segmentsLine(quadTicks, { color: GOLD, intensity: 1.3, orderFn: (a, b, i) => (i / 25) * 0.7, stagger: 0.7 });
  const qRadial = segmentsLine(radial, { color: GOLD, intensity: 0.32, orderFn: (a, b, i) => (i / 24) * 0.85, stagger: 0.85 });
  sine.add(qTicks, qRadial);
  // the 24 half-chords: thin quads that rise from the radius to the circle, one after another
  const chordU = { uP: { value: 0 }, uOpacity: { value: 1 } };
  const chords = (() => {
    const pos = [], att = [], w = 0.0042;
    for (let k = 1; k <= 24; k++) {
      const a = k * 3.75 * DEG, x = Math.cos(a) * R, y = Math.sin(a) * R;
      const q = [[x - w, 0, 0], [x + w, 0, 0], [x + w, y, 1], [x - w, 0, 0], [x + w, y, 1], [x - w, y, 1]];
      for (const [px, py, v] of q) { pos.push(px, py, 0.001); att.push(k - 1, v); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aKV', new THREE.Float32BufferAttribute(att, 2));
    return new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: chordU,
      vertexShader: 'attribute vec2 aKV; varying vec2 vKV; void main(){ vKV = aKV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uP, uOpacity; varying vec2 vKV;
        void main(){ float f = uP * 24.0 - vKV.x; if (f <= 0.0 || vKV.y > f * 1.6) discard;
          float head = smoothstep(1.4, 0.0, f);                          // the newest chord burns brighter
          vec3 c = vec3(1.0, 0.76, 0.4) * (1.1 + 3.0 * head);
          gl_FragColor = vec4(c * uOpacity, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
  })();
  sine.add(chords);
  const chordDot = glowSprite({ color: '#fff0d0', intensity: 2.6, scale: 0.13 });
  sine.add(chordDot);
  const jyaCallout = new Callout('JYA · HALF-CHORD', { dx: -0.62, dy: 0.42, size: 0.062, color: '#ffe6bf', sub: 'R SIN θ', intensity: 1.4 });
  jyaCallout.position.set(Math.cos(60 * DEG) * R, Math.sin(60 * DEG) * R * 0.55, 0.002);
  sine.add(jyaCallout);
  const etym = new TextPlane('JYA → JIBA → SINUS → SINE', { font: FONTS.mono, height: 0.058, letterSpacing: 0.22, color: '#fff0d6', intensity: 1.3, align: 'left' });
  etym.position.set(R + 0.32 + etym.worldWidth / 2, -0.62, 0);
  const etymSub = new TextPlane('SANSKRIT · ARABIC · LATIN', { font: FONTS.mono, height: 0.038, letterSpacing: 0.3, color: '#ffd9a0', intensity: 0.9 });
  etymSub.position.set(R + 0.32 + etymSub.worldWidth / 2, -0.71, 0);
  sine.add(etym, etymSub);
  // the table of differences: two columns of twelve
  const tableHead = new TextPlane('JYA TABLE · R = 3438 · STEP 3°45\'', { font: FONTS.mono, height: 0.05, letterSpacing: 0.2, color: '#fff0d6', intensity: 1.25, align: 'left' });
  tableHead.position.set(R + 0.32 + tableHead.worldWidth / 2, 0.68, 0);
  sine.add(tableHead);
  const rows = JYA_DIFF.map((d, i) => {
    const arc = (i + 1) * 225, deg = Math.floor(arc / 60), min = arc % 60;
    const txt = `${String(deg).padStart(2, ' ')}°${String(min).padStart(2, '0')}'  ${String(d).padStart(3, ' ')}`;
    const tp = new TextPlane(txt, { font: FONTS.mono, height: 0.048, letterSpacing: 0.12, color: '#ffe2b8', intensity: 1.15, align: 'left' });
    const col = i < 12 ? 0 : 1, row = i % 12;
    tp.position.set(R + 0.32 + col * 0.66 + tp.worldWidth / 2, 0.55 - row * 0.083, 0);
    sine.add(tp);
    return tp;
  });
  const tableSum = new TextPlane('Σ = 3438 = R', { font: FONTS.mono, height: 0.05, letterSpacing: 0.2, color: '#fff2d6', intensity: 1.4, align: 'left' });
  tableSum.position.set(R + 0.32 + 0.66 + tableSum.worldWidth / 2, 0.55 - 12 * 0.083 - 0.02, 0);
  sine.add(tableSum);

  // night key light (the gold heading word is lit by the scene)
  const keyN = new THREE.DirectionalLight('#ffe2bd', 0);
  keyN.position.set(-3, 4, 9);
  scene.add(keyN);
  const fillN = new THREE.HemisphereLight('#8aa0d8', '#1a120c', 0);
  scene.add(fillN);

  // =========================================================================== shot 4: Jaipur
  const jaipur = new THREE.Group();
  scene.add(jaipur);
  const H = 27, W2 = 1.5;                            // gnomon height, half-thickness
  const TAN = Math.tan(LAT);
  const ZN = -24, ZTOP = -21, ZTOE = ZTOP + H / TAN;  // north wall, top platform edge, south toe (≈ 32)
  const PAR = 1.0;                                    // parapet height above the stair slope
  const yEdge = (z) => (ZTOE - z) * TAN + PAR;        // the shadow-casting edge (parallel to the Earth's axis)
  const AX = V(0, Math.sin(LAT), -Math.cos(LAT));     // the axis: up and to the north, at the latitude
  const E2 = V(0, -Math.cos(LAT), -Math.sin(LAT));    // down in the equatorial plane
  const QR = 14, QB = 3.2, HC = 14;                   // quadrant radius, band width, centre height
  const ZC = ZTOE - (HC - PAR) / TAN;
  const QC = (s) => V(s * W2, HC, ZC);                // quadrant centres sit on the edges
  const arcPt = (s, phi, out = V(0, 0, 0)) => out.copy(QC(s)).addScaledVector(V(s, 0, 0), QR * Math.cos(phi)).addScaledVector(E2, QR * Math.sin(phi));

  const P = { stone: [], west: [], east: [], wall: [] };
  const put = (k, g, x = 0, y = 0, z = 0) => { const q = prep(g); q.translate(x, y, z); P[k].push(q); };
  // gnomon: a right triangle with arched openings, extruded across its thickness (shape x = -z)
  {
    const sh = new THREE.Shape();
    sh.moveTo(-ZTOE, 0); sh.lineTo(-ZN, 0); sh.lineTo(-ZN, H); sh.lineTo(-ZTOP, H); sh.closePath();
    for (const [zc, top] of ARCHES) {
      const hw = zc > 10 ? 1.25 : 1.5, y0 = 0.6, x = -zc;
      const hole = new THREE.Path();
      hole.moveTo(x - hw, y0); hole.lineTo(x + hw, y0); hole.lineTo(x + hw, top - hw); hole.absarc(x, top - hw, hw, 0, Math.PI, false); hole.lineTo(x - hw, y0);
      sh.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * W2, bevelEnabled: false, curveSegments: 10 });
    g.rotateY(Math.PI / 2); g.translate(-W2, 0, 0);
    put('stone', g);
    // parapets along both edges of the stair
    const ps = new THREE.Shape();
    ps.moveTo(-ZTOE, 0); ps.lineTo(-ZTOP, H); ps.lineTo(-ZTOP, H + PAR); ps.lineTo(-ZTOE, PAR); ps.closePath();
    for (const s of [-1, 1]) {
      const pg = new THREE.ExtrudeGeometry(ps, { depth: 0.42, bevelEnabled: false });
      pg.rotateY(Math.PI / 2); pg.translate(s > 0 ? W2 - 0.42 : -W2, 0, 0);
      put('stone', pg);
    }
    // the stair: 64 steps up the hypotenuse
    const N = 64, rise = H / N, tread = rise / TAN;
    for (let i = 0; i < N; i++) {
      const b = new THREE.BoxGeometry(2 * W2 - 0.84, rise + 0.4, tread);
      put('stone', b, 0, (i + 1) * rise - (rise + 0.4) / 2, ZTOE - (i + 0.5) * tread);
    }
    // top platform parapet and the chhatri (pavilion)
    for (const [w, d, x, z] of [[2 * W2, 0.3, 0, ZN + 0.15], [0.3, ZTOP - ZN, -W2 + 0.15, (ZN + ZTOP) / 2], [0.3, ZTOP - ZN, W2 - 0.15, (ZN + ZTOP) / 2]]) put('stone', new THREE.BoxGeometry(w, 0.9, d), x, H + 0.45, z);
    const cz = (ZN + ZTOP) / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      put('stone', new THREE.CylinderGeometry(0.11, 0.13, 2.3, 10), sx * 1.05, H + 1.15, cz + sz * 1.05);
      put('stone', new THREE.BoxGeometry(0.34, 0.2, 0.34), sx * 1.05, H + 0.1, cz + sz * 1.05);
    }
    put('stone', new THREE.BoxGeometry(3.1, 0.24, 3.1), 0, H + 2.42, cz);
    put('stone', new THREE.BoxGeometry(3.4, 0.08, 3.4), 0, H + 2.58, cz);
    const dome = new THREE.SphereGeometry(1.15, 24, 10, 0, TAU, 0, Math.PI / 2); dome.scale(1, 1.1, 1);
    put('stone', dome, 0, H + 2.62, cz);
    put('stone', new THREE.CylinderGeometry(0.04, 0.09, 0.7, 8), 0, H + 4.1, cz);
    put('stone', new THREE.SphereGeometry(0.13, 10, 8), 0, H + 3.9, cz);
  }
  // the two quadrants: curved walls in the equatorial plane, the graduated band on top
  {
    const NQ = 72;
    for (const s of [-1, 1]) {
      const lo = [], hi = [], gLo = [], gHi = [], uvLo = [], uvHi = [];
      for (let j = 0; j <= NQ; j++) {
        const phi = (j / NQ) * Math.PI / 2, p = arcPt(s, phi);
        const a = p.clone().addScaledVector(AX, -QB / 2), b = p.clone().addScaledVector(AX, QB / 2);
        lo.push(a); hi.push(b); gLo.push(V(a.x, 0, a.z)); gHi.push(V(b.x, 0, b.z));
        uvLo.push([j / NQ, 0]); uvHi.push([j / NQ, 1]);
      }
      P[s < 0 ? 'west' : 'east'].push(prep(strip(lo, hi, uvLo, uvHi)));
      // the curved walls carry the plaster texture (courses and an arcade of arched recesses), in metres / 6
      for (const [top, gnd, flip] of [[lo, gLo, false], [hi, gHi, true]]) {
        let acc = 0;
        const uT = [], uG = [];
        top.forEach((p, i) => { if (i) acc += Math.hypot(p.x - top[i - 1].x, p.z - top[i - 1].z); uT.push([acc / 6, p.y / 6]); uG.push([acc / 6, 0]); });
        P.wall.push(prep(flip ? strip(top, gnd, uT, uG) : strip(gnd, top, uG, uT)));
      }
      put('stone', strip([gLo[0], lo[0]], [gHi[0], hi[0]]));
      // the lip either side of the band
      for (const [e, o] of [[lo, -1], [hi, 1]]) {
        const up = e.map((p) => p.clone().addScaledVector(AX, o * 0.25).add(V(0, 0.18, 0)));
        put('stone', strip(e, up));
      }
    }
  }
  // materials: sandstone and lime plaster (ochre-pink), white marble scales
  const stoneMat = withBuild(new THREE.MeshStandardMaterial({ color: '#d9ab84', roughness: 0.88, metalness: 0, side: THREE.DoubleSide }));
  const westTex = scaleTexture((deg) => 6 + Math.round(deg / 15), 3);      // west quadrant reads the morning: 6 → 12
  const eastTex = scaleTexture((deg) => 18 - Math.round(deg / 15), 5);     // east quadrant, the afternoon: 18 → 12
  const westMat = withBuild(new THREE.MeshStandardMaterial({ map: westTex, color: '#c4b9a8', roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), '#ffd9a0');
  const eastMat = withBuild(new THREE.MeshStandardMaterial({ map: eastTex, color: '#c4b9a8', roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), '#ffd9a0');
  const wallTex = (() => {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), rr = rng(1734), px = N / 6;   // 6 m tile
    g.fillStyle = '#dcae86'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rr() < 0.55 ? '120,75,45' : '245,215,185'},${0.03 + rr() * 0.06})`; g.beginPath(); g.ellipse(rr() * N, rr() * N, 4 + rr() * 50, 3 + rr() * 26, rr() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(110,70,45,0.22)'; g.lineWidth = 1.5;
    for (let k = 1; k < 12; k++) { g.beginPath(); g.moveTo(0, N - k * px * 0.5); g.lineTo(N, N - k * px * 0.5); g.stroke(); }
    // an arched recess (2.4 m wide, 3.6 m tall), shaded as if lit from above
    const ax = N / 2, aw = 1.2 * px, ay0 = N - 0.25 * px, ayTop = N - 3.6 * px;
    const arch = () => { g.beginPath(); g.moveTo(ax - aw, ay0); g.lineTo(ax - aw, ayTop + aw); g.arc(ax, ayTop + aw, aw, Math.PI, 0); g.lineTo(ax + aw, ay0); g.closePath(); };
    g.fillStyle = 'rgba(244,214,180,0.9)'; g.save(); g.translate(0, -5); g.scale(1, 1); arch(); g.restore(); g.fill();
    const gr = g.createLinearGradient(0, ayTop, 0, ay0); gr.addColorStop(0, 'rgba(60,30,18,0.95)'); gr.addColorStop(1, 'rgba(105,62,38,0.92)');
    g.fillStyle = gr; arch(); g.fill();
    g.strokeStyle = 'rgba(250,225,195,0.8)'; g.lineWidth = 6; arch(); g.stroke();
    g.fillStyle = 'rgba(120,75,45,0.35)'; g.fillRect(0, N - 0.25 * px, N, 0.25 * px);   // plinth
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
    return t;
  })();
  const wallMat = withBuild(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  eastMat.userData.build.uBuild = westMat.userData.build.uBuild;
  stoneMat.userData.build.uBuild = westMat.userData.build.uBuild;
  wallMat.userData.build.uBuild = westMat.userData.build.uBuild;
  const stoneGeo = mergeGeometries(P.stone), wallGeo = mergeGeometries(P.wall);
  const stoneMesh = new THREE.Mesh(stoneGeo, stoneMat);
  const westMesh = new THREE.Mesh(mergeGeometries(P.west), westMat);
  const eastMesh = new THREE.Mesh(mergeGeometries(P.east), eastMat);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  for (const m of [stoneMesh, westMesh, eastMesh, wallMesh]) { m.castShadow = m.receiveShadow = true; jaipur.add(m); }
  const wire = revealLines(mergeGeometries([stoneGeo, wallGeo]), { order: 'y', mode: 'edges', threshold: 28, color: GOLD, headColor: '#fff3d6', intensity: 0.3, head: 0.05 });
  jaipur.add(wire);

  // the courtyard and the plain
  const paveTex = (() => {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), rr = rng(77);
    g.fillStyle = '#b98c66'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rr() < 0.5 ? '90,60,40' : '230,200,170'},${0.04 + rr() * 0.06})`; g.fillRect(rr() * N, rr() * N, 6 + rr() * 40, 6 + rr() * 40); }
    g.strokeStyle = 'rgba(70,45,30,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 64); g.lineTo(N, i * 64); g.stroke(); }
    for (let j = 0; j < 8; j++) for (let i = 0; i <= 4; i++) { const x = i * 128 + (j % 2) * 64; g.beginPath(); g.moveTo(x, j * 64); g.lineTo(x, j * 64 + 64); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(18, 22); t.anisotropy = 8;
    return t;
  })();
  const court = new THREE.Mesh(new THREE.BoxGeometry(76, 0.4, 92), new THREE.MeshStandardMaterial({ map: paveTex, color: '#c9a585', roughness: 0.9 }));
  court.position.set(0, -0.2, 2);
  court.receiveShadow = true;
  jaipur.add(court);
  const plain = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ color: '#a27c5a', roughness: 1 }));
  plain.rotation.x = -Math.PI / 2; plain.position.y = -0.42;
  plain.receiveShadow = true;
  jaipur.add(plain);
  // the Aravalli ridge on the horizon (Nahargarh stands on it, north of the city)
  {
    const N = 220, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU, rad = 700 + 80 * Math.sin(a * 3.0 + 1.0);
      const north = Math.max(0, -Math.sin(a + 0.2));
      const h = (6 + 26 * north * north) * (0.55 + 0.45 * Math.abs(Math.sin(a * 17.0) * Math.cos(a * 7.0 + 1.0))) + 6 * Math.sin(a * 41.0) * north;
      pos.push(Math.cos(a) * rad, -1, Math.sin(a) * rad, Math.cos(a) * rad, h, Math.sin(a) * rad);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 3, k, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const hills = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#4a3446', side: THREE.DoubleSide, fog: true }));
    jaipur.add(hills);
  }
  // shadow-edge marker, time readout and the label
  const edgeBar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, QB + 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc46e').multiplyScalar(4.5), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  jaipur.add(edgeBar);
  const timeLabel = new LiveLabel({ height: 0.8, chars: 12, color: '#fff0d6', intensity: 1.5 });
  jaipur.add(timeLabel);
  const yantraCallout = new Callout('SAMRAT YANTRA · JAIPUR · 1734', { dx: 3.0, dy: 4.2, size: 0.6, color: '#fff0d8', sub: 'ACCURATE TO ABOUT 2 SECONDS', intensity: 1.5 });
  jaipur.add(yantraCallout);
  // sunbeams through the gnomon's arches (sheared prisms along the sun's direction, re-aimed each frame)
  const shaftU = { uI: { value: 0 }, uColor: { value: new THREE.Color('#ffc58a') } };
  const shafts = ARCHES.map(([zc, top]) => {
    const hw = zc > 10 ? 1.25 : 1.5, sh = new THREE.Shape();
    sh.moveTo(-hw, 0.6); sh.lineTo(hw, 0.6); sh.lineTo(hw, top - hw); sh.absarc(0, top - hw, hw, 0, Math.PI, false); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 8 });
    g.rotateY(Math.PI / 2);                   // extrude along +x, the arch in the (−z, y) plane
    g.scale(1, 1, -1);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: shaftU,
      vertexShader: 'varying float vA; varying vec3 vN, vV; void main(){ vA = position.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uI; uniform vec3 uColor; varying float vA; varying vec3 vN, vV;
        void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.4); float along = pow(max(1.0 - vA, 0.0), 1.6) * smoothstep(0.0, 0.03, vA);
          gl_FragColor = vec4(uColor * uI * f * along, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.matrixAutoUpdate = false; m.frustumCulled = false;
    m.userData.z = zc;
    jaipur.add(m);
    return m;
  });
  const dust = new Dust({ count: lite ? 700 : 1800, size: [70, 26, 60], center: [-6, 10, 8], particleSize: 0.09, color: '#ffe0b0', opacity: 0.5 });
  jaipur.add(dust);

  const sun = new THREE.DirectionalLight('#ffc48a', 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 260 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
  sun.target.position.set(0, 8, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#8ea3d6', '#9a6440', 0);
  scene.add(hemi);
  const sunDisc = glowSprite({ color: '#ffd9a8', intensity: 2.4, scale: 38 });
  scene.add(sunDisc);

  // sun direction for hour angle Ha (afternoon: west of the meridian), equinox (declination 0): the sun
  // turns about the axis at 15° an hour, and the gnomon's edge throws its shadow onto the EAST quadrant
  // at φ = 90° − Ha, where the scale reads 12 + Ha / 15 hours
  const Q_UP = V(0, Math.cos(LAT), Math.sin(LAT));   // the celestial equator's highest point (south)
  const sunDir = (Ha, out) => out.copy(Q_UP).multiplyScalar(Math.cos(Ha)).add(V(-Math.sin(Ha), 0, 0)).normalize();
  const hourAngle = (t) => lerp(56, 81, ramp(t, tShadow - 0.1, dur + 0.25, (x) => ease.inOutSine(x) * 0.75 + x * 0.25)) * DEG;

  // =========================================================================== flash + flares
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1dc').multiplyScalar(2.5), transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  flash.position.z = -0.2; flash.renderOrder = 100;
  camera.add(flash);
  const hud = ctx.makeHUD();
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.82, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const glowTex = glowSprite().material.map;
  const ghosts = [0.35, 0.62, 0.9, 1.25, 1.55, 1.9].map((k, i) => {
    const hue = i / 6;
    const col = new THREE.Color().setHSL(0.02 + hue * 0.72, 1, 0.55);
    const m = new THREE.SpriteMaterial({ map: i % 2 ? ringTex : glowTex, color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false });
    const s = new THREE.Sprite(m);
    s.userData = { k, size: 0.12 + ((i * 7) % 5) * 0.07 };
    hud.scene.add(s);
    return s;
  });
  const streak = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#9fc4ff'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
  const leak = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color('#ffb070'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
  hud.scene.add(streak, leak);

  // =========================================================================== animation
  const dof = { focus: 5, range: 2, amount: 0.3 };
  const bloom = { strength: 0.7 };
  const camPos = V(0, 0, 0), camTgt = V(0, 0, 0), tmpA = V(0, 0, 0), tmpB = V(0, 0, 0), sunV = V(1, 0, 0), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const qEq = new THREE.Quaternion(), ndc = V(0, 0, 0);
  const Gw = G.position.clone();                     // diagram origin (world; G has no rotation)
  const EARTH_P0 = V(2.05, 0.62, 5.5), EARTH_P1 = V(1.7, 0.5, 4.55);   // dolly only: the stars stay put
  const EARTH_LOOK_OFF = V(-3.3, -0.62, -5.5);
  const DIAG_POS = Gw.clone().add(V(0.05, 0.42, 6.6)), DIAG_TGT = Gw.clone().add(V(0.05, -0.12, 0));
  const SINE_POS = Gw.clone().add(V(CC.x + 0.8, CC.y + 0.1, 4.1)), SINE_TGT = Gw.clone().add(V(CC.x + 0.8, CC.y + 0.12, 0));
  // Jaipur camera: a crane from the south-west (the whole instrument against the dawn) round and up
  // over the west quadrant, looking down on the graduated band where the shadow runs
  const jPos = new THREE.CatmullRomCurve3([V(-30, 6, 82), V(-17, 9, 66), V(-2, 13, 52), V(10, 17, 40)], false, 'centripetal');
  const jTgt = new THREE.CatmullRomCurve3([V(2, 15.5, -2), V(4, 13.5, -1), V(8, 10.5, 0), V(11, 8, 1)], false, 'centripetal');
  const jaipurCam = (t, pos, tgt) => {
    const u = ramp(t, tCut, dur + 0.35, (x) => ease.outSine(x) * 0.45 + ease.inOutSine(x) * 0.55);
    jPos.getPoint(u, pos); jTgt.getPoint(u, tgt);
  };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const isNight = t < tCut;
    night.visible = isNight;
    jaipur.visible = !isNight;
    starU.uViewport.value = info?.height ?? 800;
    starU.uTime.value = T;

    if (isNight) {
      // ------------------------------------------------------------------ camera (night)
      const toDiag = ramp(t, tPi - 0.35, tPi + 0.3, ease.inOutCubic);
      const toSine = ramp(t, tSine - 0.15, tSine + 0.5, ease.inOutCubic);
      const d0 = ramp(t, -0.3, tPi, (x) => x);
      camPos.lerpVectors(EARTH_P0, EARTH_P1, d0);
      camTgt.copy(camPos).add(EARTH_LOOK_OFF);
      camPos.lerp(DIAG_POS, toDiag); camTgt.lerp(DIAG_TGT, toDiag);
      camPos.lerp(SINE_POS, toSine); camTgt.lerp(SINE_TGT, toSine);
      camPos.x += 0.06 * (t - tSine) * toSine; camPos.z -= 0.12 * Math.max(0, t - tSine - 0.5);
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(camTgt);
      camera.fov = 35; camera.updateProjectionMatrix();

      // ------------------------------------------------------------------ the Earth
      earth.rotation.y = 0.6 + t * 1.55;                      // eastward, a visible turn
      tilt.updateMatrixWorld(true);
      earth.getWorldQuaternion(qa);
      sunObj.copy(sunE).applyQuaternion(qa.invert());
      earthMat.uniforms.uTime.value = T;
      earthMat.uniforms.uCloudOff.value = t * 0.01;
      const dim = 1 - 0.72 * toDiag;
      earthMat.uniforms.uBright.value = dim * lerp(0.75, 1, ramp(t, -0.4, 0.6));
      atmoMat.uniforms.uAtmo.value = 1.3 * dim;
      const axP = ramp(t, tAry - 0.15, tAry + 0.45, ease.outCubic), axO = 1 - ramp(t, tPi - 0.1, tPi + 0.25);
      axisDash.progress = axP; axisDash.opacity = axO;
      axisFar.progress = ramp(t, tAry + 0.1, tAry + 0.9, ease.inQuad); axisFar.opacity = 0.6 * axO;
      poleStar.material.opacity = (0.35 + 0.65 * ramp(t, tAry + 0.5, tAry + 0.9)) * (1 - 0.6 * toDiag);
      spinArc.progress = ramp(t, tAry + 0.1, tAry + 0.6, ease.outCubic); spinArc.opacity = axO;
      spinArc.rotation.y = -t * 0.9;
      {
        const end = spinArcPts[Math.max(1, Math.round(spinArc.progress * (spinArcPts.length - 1)))];
        const prev = spinArcPts[Math.max(0, Math.round(spinArc.progress * (spinArcPts.length - 1)) - 1)];
        tmpA.copy(end).applyAxisAngle(V(0, 1, 0), spinArc.rotation.y);
        tmpB.copy(prev).applyAxisAngle(V(0, 1, 0), spinArc.rotation.y);
        arrowHead.position.copy(tmpA);
        arrowHead.quaternion.setFromUnitVectors(V(0, 1, 0), tmpA.clone().sub(tmpB).normalize());
        arrowHead.material.opacity = sat(spinArc.progress * 6) * axO; arrowHead.visible = arrowHead.material.opacity > 0.01;
      }
      // label at the north pole
      tmpA.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-0.97).add(tmpB.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(-0.22));
      earthCallout.position.copy(tmpA);
      faceCamera(earthCallout, camera);
      const lab = ramp(t, tAry + 0.35, tAry + 1.0, ease.outCubic), labO = 1 - ramp(t, tPi - 0.25, tPi + 0.05);
      earthCallout.reveal(lab, labO); earthCallout.visible = lab > 0 && labO > 0;
      poleLabel.reveal = ramp(t, tAry + 0.6, tAry + 1.05, ease.outCubic);
      poleLabel.opacity = labO * 0.9 * ramp(t, tAry + 0.55, tAry + 0.6);

      // ------------------------------------------------------------------ the equator lifts off and rolls
      const eqIn = ramp(t, tAry + 0.45, tAry + 0.85);
      const trans = ramp(t, tPi - 0.2, tPi + 0.28, ease.inOutCubic);
      qEq.copy(tilt.quaternion).multiply(qb.setFromAxisAngle(V(1, 0, 0), Math.PI / 2));
      equatorGrp.quaternion.copy(qEq).slerp(qa.identity(), trans);
      tmpA.copy(Gw).add(V(X0, YG + R, 0));
      equatorGrp.position.set(0, 0, 0).lerp(tmpA, trans);
      equatorGrp.scale.setScalar(lerp(1.012, R, trans));
      equatorGrp.rotation.z += 0;               // (no spin: a circle)
      const rollStart = tPi + 0.28, rollEnd = tSine - 0.08;
      const rolling = t >= rollStart;
      equator.opacity = rolling ? 0 : eqIn * (0.85 + 0.15 * trans);
      const sR = CIRC * ramp(t, rollStart, rollEnd, ease.inOutSine);
      roll.setPoints(rollPoints(sR));
      roll.opacity = rolling ? 1 - 0.55 * ramp(t, tSine + 0.2, tSine + 0.6) : 0;
      wheel.position.set(X0 + sR, YG + R, 0);
      wheel.rotation.z = -sR / R;
      const wheelO = rolling ? 1 : 0;
      ghostRing.progress = 1; ghostRing.opacity = wheelO * lerp(0.5, 1.4, ramp(t, tSine - 0.1, tSine + 0.3));
      spoke.progress = 1; spoke.opacity = wheelO * (1 - ramp(t, rollEnd, tSine + 0.15));
      hubDot.material.opacity = wheelO * (1 - 0.5 * ramp(t, rollEnd, tSine + 0.2));
      groundGuide.progress = ramp(t, tPi - 0.1, tPi + 0.4, ease.outCubic); groundGuide.opacity = 1 - ramp(t, tSine + 0.2, tSine + 0.6);
      diaLabel.position.set(X0, YG + R + 0.13, 0.01);
      diaLabel.reveal = ramp(t, rollStart - 0.05, rollStart + 0.2); diaLabel.opacity = ramp(t, rollStart - 0.05, rollStart) * (1 - ramp(t, rollStart + 0.3, rollStart + 0.45));
      for (const tk of ticks) {
        const reached = ramp(sR, tk.x - X0 - 0.02, tk.x - X0 + 0.08, (x) => x);
        const o = 1 - ramp(t, tSine + 0.25, tSine + 0.6);
        tk.tk.progress = reached; tk.tk.opacity = o;
        tk.lb.reveal = reached; tk.lb.opacity = reached > 0 ? o : 0;
      }
      eqPi.reveal = ramp(t, tPi + 0.05, tPi + 0.55, ease.outCubic); eqPi.opacity = (1 - ramp(t, tSine + 0.15, tSine + 0.45)) * (t > tPi ? 1 : 0);
      eqRule.reveal = ramp(t, tPi + 0.3, tPi + 0.8, ease.outCubic); eqRule.opacity = eqPi.opacity * 0.95;
      eqAsanna.reveal = ramp(t, tPi + 0.5, tPi + 0.95, ease.outCubic); eqAsanna.opacity = eqPi.opacity * 0.9;

      // ------------------------------------------------------------------ the jya
      const sOn = t > tSine - 0.2;
      sine.visible = sOn;
      if (sOn) {
        radii.progress = ramp(t, tSine - 0.05, tSine + 0.25); radii.opacity = 1;
        qTicks.progress = ramp(t, tSine, tSine + 0.5); qTicks.opacity = 1;
        const cp = ramp(t, tSine + 0.08, tCut - 0.12, (x) => ease.inOutSine(x) * 0.7 + x * 0.3);
        qRadial.progress = cp; qRadial.opacity = 1;
        chordU.uP.value = cp;
        const k = clamp(cp * 24, 0, 24), a = k * 3.75 * DEG;
        chordDot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.004);
        chordDot.material.opacity = cp > 0 && cp < 1 ? 1 : 0.4 * sat(cp * 10);
        jyaCallout.reveal(ramp(t, tSine + 0.35, tSine + 0.8)); jyaCallout.visible = t > tSine + 0.35;
        etym.reveal = ramp(t, tSine + 0.3, tSine + 0.75, ease.outCubic); etym.opacity = t > tSine + 0.3 ? 1 : 0;
        etymSub.reveal = ramp(t, tSine + 0.45, tSine + 0.85, ease.outCubic); etymSub.opacity = t > tSine + 0.45 ? 0.9 : 0;
        tableHead.reveal = ramp(t, tSine + 0.05, tSine + 0.4, ease.outCubic); tableHead.opacity = t > tSine ? 1 : 0;
        rows.forEach((row, i) => { const a0 = (i + 0.4) / 24; const v = sat((cp - a0) * 24 / 1.2); row.reveal = v; row.opacity = v > 0 ? 1 : 0; });
        tableSum.reveal = ramp(cp, 0.98, 1.0, (x) => x); tableSum.opacity = cp > 0.98 ? 1 : 0;
      }
      const flareUp = ramp(t, tCut - 0.25, tCut, ease.inQuad);
      chordU.uOpacity.value = 1 + 1.5 * flareUp;

      // lights
      keyN.intensity = 2.6; fillN.intensity = 0.25;
      sun.intensity = 0; hemi.intensity = 0; sunDisc.visible = false;
      skyU.uDawn.value = 0; starU.uOpacity.value = 1; starU.uZenith.value = 0;
      scene.fog.density = 0;
      scene.environmentIntensity = 0.12;
      dof.focus = lerp(lerp(camera.position.length(), camera.position.distanceTo(DIAG_TGT), toDiag), camera.position.distanceTo(SINE_TGT), toSine);
      dof.range = lerp(3, 4, toDiag); dof.amount = lerp(0.12, 0.15, toDiag);
      bloom.strength = 0.72 + 0.25 * flareUp;
      out.exposure = 1;
      out.harmony = 0.55;
    } else {
      // ------------------------------------------------------------------ Jaipur at dawn
      jaipurCam(t, camPos, camTgt);
      camPos.x += Math.sin(t * 0.8) * 0.12; camPos.y += Math.sin(t * 1.1 + 1) * 0.08;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.6) * 0.01, 1, 0).normalize();
      camera.lookAt(camTgt);
      camera.fov = lerp(36, 33, ramp(t, tCut, dur)); camera.updateProjectionMatrix();

      const Ha = hourAngle(t);
      sunDir(Ha, sunV);
      skyU.uSun.value.copy(sunV);
      skyU.uDawn.value = 1;
      starU.uZenith.value = 1;
      starU.uOpacity.value = lerp(0.9, 0.15, ramp(t, tCut, dur));
      const elev = Math.asin(sunV.y);
      sun.position.copy(sun.target.position).addScaledVector(sunV, 120);
      sun.color.setRGB(1.0, lerp(0.62, 0.84, sat(elev / (40 * DEG))), lerp(0.36, 0.66, sat(elev / (40 * DEG))));
      sun.intensity = lerp(4.2, 5.0, sat(elev / (40 * DEG)));
      hemi.intensity = 0.55; keyN.intensity = 0; fillN.intensity = 0;
      scene.environmentIntensity = 0.2;
      scene.fog.density = 0.0008;
      sunDisc.visible = true;
      sunDisc.position.copy(camera.position).addScaledVector(sunV, 900);

      // build: wire (gold, bottom → top), then sandstone and marble rise through it
      const wp = ramp(t, tCut - 0.05, tCut + 0.55, ease.outCubic);
      wire.progress = wp; wire.opacity = 1 - ramp(t, tCut + 0.65, tShadow + 0.1);
      const build = lerp(-2, H + 6, ramp(t, tCut + 0.2, tShadow - 0.05, ease.inOutSine));
      westMat.userData.build.uBuild.value = build;
      stoneMesh.visible = westMesh.visible = eastMesh.visible = wallMesh.visible = build > -1.5;

      // the shadow edge on the east quadrant: φ = 90° − H (the edge and the quadrant share the axis)
      const phi = Math.PI / 2 - Ha;
      arcPt(1, phi, tmpA);
      edgeBar.position.copy(tmpA).addScaledVector(AX, 0).add(V(0, 0.03, 0));
      tmpB.copy(QC(1)).sub(tmpA).normalize();                       // towards the centre
      edgeBar.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tmpB.clone().cross(AX).normalize(), tmpB, AX));
      edgeBar.position.addScaledVector(tmpB, 0.04);
      const eOn = ramp(t, tShadow - 0.15, tShadow + 0.2);
      edgeBar.material.opacity = eOn * (0.75 + 0.25 * Math.sin(T * 9));
      edgeBar.visible = eOn > 0.01;
      const hours = 12 + (Ha / DEG) / 15, hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60), ss = Math.floor(((hours - hh) * 60 - mm) * 60);
      timeLabel.set(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`);
      timeLabel.position.copy(tmpA).addScaledVector(tmpB, 1.6).add(V(0, 0.9, 0));
      faceCamera(timeLabel, camera);
      timeLabel.material.opacity = eOn; timeLabel.visible = eOn > 0.01;
      arcPt(1, 5 * DEG, tmpA);
      yantraCallout.position.copy(tmpA).add(V(0, 0.4, 0));
      faceCamera(yantraCallout, camera);
      const yc = ramp(t, tShadow + 0.05, tShadow + 0.6);
      yantraCallout.reveal(yc, 1 - ramp(t, dur - 0.08, dur + 0.3)); yantraCallout.visible = yc > 0;

      // the beams: from the west face, through the openings, on along −sun
      const sI = 0.05 + 0.12 * ramp(t, tShadow, dur + 0.2);
      shaftU.uI.value = sI * ramp(t, tCut + 0.6, tShadow - 0.1);
      tmpA.copy(sunV).multiplyScalar(-34);
      for (const m of shafts) { m.matrix.makeBasis(tmpA, V(0, 1, 0), V(0, 0, 1)).setPosition(-W2, 0, m.userData.z); m.visible = shaftU.uI.value > 0.002; }
      dust.tick(t, info); dust.u.opacity = 0.55;

      dof.focus = lerp(camera.position.distanceTo(tmpB.set(0, 10, 0)), camera.position.distanceTo(arcPt(1, phi, tmpA)), ramp(t, tShadow - 0.3, tShadow + 0.4));
      dof.range = 14; dof.amount = 0.25;
      bloom.strength = 0.7 + 0.15 * ramp(t, tShadow, dur);
      out.exposure = lerp(1.25, 1.0, ramp(t, tCut, tCut + 0.4));
      out.harmony = lerp(0.8, 0.45, ramp(t, tShadow, dur));
    }

    // ------------------------------------------------------------------ the cut: a flare of light
    const fl = Math.max(envelope(t, tCut - 0.14, tCut + 0.22, 0.13, 0.2, ease.inQuad), 0);
    flash.material.opacity = fl * 0.85; flash.visible = fl > 0.003;

    // ------------------------------------------------------------------ lens flares from the low sun (HUD)
    const fOn = isNight ? 0 : ramp(t, tCut + 0.1, tCut + 0.6);
    const top = hud.camera.top;
    ndc.copy(sunV).applyQuaternion(qb.copy(camera.quaternion).invert());
    const fy = 1 / Math.tan(camera.fov * DEG / 2);
    let nx, ny;
    if (ndc.z < -0.05) { nx = (ndc.x / -ndc.z) * fy / ctx.aspect; ny = (ndc.y / -ndc.z) * fy; }
    else { const l = Math.hypot(ndc.x, ndc.y) || 1; nx = (ndc.x / l) * 4; ny = (ndc.y / l) * 4; }
    nx = clamp(nx, -4, 4); ny = clamp(ny, -4, 4);
    const sx = nx * ctx.aspect, sy = ny * top;
    const near = Math.exp(-Math.max(0, Math.abs(sx) - ctx.aspect) * 0.35) * Math.exp(-Math.max(0, Math.abs(sy) - top) * 0.8);
    const boost = 1 + 1.4 * ramp(t, tShadow + 0.2, dur);
    ghosts.forEach((g, i) => {
      const k = g.userData.k;
      g.position.set(sx + (-sx) * k * 1.0, sy + (-sy) * k * 1.0, 0);
      g.scale.setScalar(g.userData.size * (1 + 0.3 * Math.sin(T * 0.7 + i)));
      g.material.opacity = fOn * near * 0.13 * boost;
      g.visible = g.material.opacity > 0.002;
    });
    leak.position.set(clamp(sx, -ctx.aspect - 0.2, ctx.aspect + 0.2), clamp(sy, -top - 0.2, top + 0.2), 0);
    leak.scale.setScalar(1.7); leak.material.opacity = fOn * near * 0.16 * boost; leak.visible = leak.material.opacity > 0.002;
    streak.position.set(clamp(sx, -ctx.aspect - 0.4, ctx.aspect + 0.4), sy, 0);
    streak.scale.set(4.5, 0.05, 1); streak.material.opacity = fOn * near * 0.4 * boost; streak.visible = streak.material.opacity > 0.002;
  }

  const out = {
    scene, camera, hud, update, dof, bloom, exposure: 1, harmony: 0.6,
    arSubject: (t) => (t < tPi - 0.1 ? { centre: V(0, 0, 0), radius: 1.6 }
      : t < tCut ? { centre: Gw.clone().add(V(t < tSine ? 0 : CC.x + 0.6, 0, 0)), radius: t < tSine ? 3.2 : 1.8 }
        : { centre: V(0, 12, 0), radius: 34 }),
    exploreLimits: { yaw: 1.0, pitchDown: 0.3, pitchUp: 0.7, zoomOut: 2.4 },
  };
  return out;
}
