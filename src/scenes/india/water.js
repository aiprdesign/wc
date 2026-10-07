// WATER WISDOM — Rajasthan's stepwells and lakes (5.0 s of story, after Architecture)
// Two graceful moves joined by a soft cut through the monsoon rain:
//   stepwell 0.0  high over Chand Baori, Abhaneri (c. 9th century) the camera tips over the rim and descends
//                 into the stepwell: thirteen storeys of criss-crossing flights on three sides, the pillared
//                 pavilion gallery on the fourth, blue-green water far below · "CHAND BAORI · ABHANERI"
//   monsoon  2.2  how it works: monsoon rain streaks into the well and the water climbs the steps; two level
//                 lines mark the dry-season and the monsoon water ("RAIN COLLECTED AND STORED"); the rain
//                 thickens into a white sheet and the shot dissolves through it …
//   udaipur  3.0  … onto Lake Pichola, Udaipur, the 'City of Lakes', washed clean: the white Lake Palace
//                 (Jag Niwas, 1746) on blue water, the City Palace on the shore, green Aravalli hills,
//                 everything doubled in the lake · "LAKE PICHOLA · MADE 1362, ENLARGED 16TH C."
//   jaipur   4.0  the camera lifts over the palace and the ridge behind it and comes down on Jaipur's pink
//                 city: the honeycomb façade of the Hawa Mahal (1799, 953 jharokha windows) — still
//                 drifting in as the chapter hands over.
// Technique: procedural architecture merged per material (water-assets.js, water-udaipur.js,
// water-jaipur.js), a world-space procedural stone shader (no textures, nothing tiles), analytic
// water shaders (the well's reflection traced to its opening, the lake over mirrored geometry), a
// pure-function-of-time rain field, world-anchored callouts.
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT, FILM_ASPECT } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, timeWarp, clamp, smoothstep } from '../../lib/math.js';
import { GLSL_NOISE, fbm2 } from '../../lib/noise.js';
import { TextPlane, FONTS } from '../../lib/text.js';
import { progressLine } from '../../lib/lines.js';
import { Callout, faceCamera } from '../../lib/hud.js';
import { makeWellMaterials, buildStepwell, STONE_U, WELL, wellHalf, storeyY } from './water-assets.js';
import { buildUdaipur } from './water-udaipur.js';
import { buildJaipur } from './water-jaipur.js';

// Story-relative beat offsets (seconds from the chapter's start). If the film defines the cues
// waterStepwell / waterMonsoon / waterUdaipur / waterJaipur, those win.
export const BEATS = { stepwell: 0.0, monsoon: 2.2, udaipur: 3.0, jaipur: 4.0 };
export const CUT = 2.95;           // the soft cut (through the rain) from the stepwell to Udaipur, before `udaipur`

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const LABEL = '#ffe9c4', AQUA = '#bff3ee';
// water in the well: the dry-season level (two storeys of water) and the monsoon level it climbs to
const DRY_Y = storeyY(11.3), WET_Y = storeyY(9.5);

// ------------------------------------------------------------------------------------- sky
const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir, uZen, uHor, uSunCol; uniform float uCover, uStorm, uTime;
vec3 skyCol(vec3 d){
  float h = max(d.y, 0.0);
  vec3 c = mix(uHor, uZen, pow(smoothstep(0.0, 0.55, h), 0.8));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 900.0) * 30.0 + pow(s, 60.0) * 0.5 + pow(s, 6.0) * 0.12) * (1.0 - uStorm);
  // clouds: fbm on a plane above
  vec2 p = d.xz / (h + 0.09) * 0.9 + vec2(uTime * 0.02, 0.0);
  float n = snoise(vec3(p * 0.55, 1.3)) * 0.55 + snoise(vec3(p * 1.3, 4.1)) * 0.3 + snoise(vec3(p * 3.1, 7.7)) * 0.15;
  float thr = 1.0 - uCover;
  float cov = smoothstep(thr - 0.08, thr + 0.22, n * 0.5 + 0.5);
  float lit = 0.75 + 0.25 * snoise(vec3(p * 1.7 + 2.0, 9.0));
  vec3 cc = mix(vec3(1.0, 0.98, 0.95) * (0.9 + 0.5 * pow(s, 4.0)) * lit, vec3(0.32, 0.35, 0.4) * lit, uStorm);
  c = mix(c, cc * mix(1.0, 0.75, smoothstep(0.0, 0.25, h)), cov * smoothstep(0.0, 0.06, h) * 0.92);
  return c;
}`;
function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSunDir: { value: V(0, 1, 0) }, uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uCover: { value: 0.2 }, uStorm: { value: 0 }, uTime: { value: 0 }, uMirror: { value: 0.72 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `${GLSL_NOISE}\n${SKY_GLSL}\nuniform float uMirror; varying vec3 vD;
      void main(){ vec3 d = normalize(vD); float below = step(d.y, 0.0); d.y = abs(d.y); vec3 c = skyCol(d); c *= mix(1.0, uMirror, below); gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
}

export function create(ctx, segment) {
  const beat = (k, cue) => (CUES[cue] != null ? CUES[cue] - segment.start : BEATS[k]);
  const T_WELL = beat('stepwell', 'waterStepwell'), T_MON = beat('monsoon', 'waterMonsoon');
  const T_UDA = beat('udaipur', 'waterUdaipur'), T_JAI = beat('jaipur', 'waterJaipur');
  const T_CUT = T_UDA - (BEATS.udaipur - CUT);
  const DUR = segment.end - segment.start;
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.FogExp2('#b8c4cc', 0.002);
  const camera = new THREE.PerspectiveCamera(36, ctx.aspect, 0.1, 6000);

  // ------------------------------------------------------------------------------------- light
  const sun = new THREE.DirectionalLight('#fff0d8', 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight('#a9c8ec', '#8a6e50', 0.55);
  scene.add(hemi);
  const sunDir = V(0, 1, 0);
  function setSun(dir, c, half, depth = 400) {
    sunDir.copy(dir).normalize();
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(sunDir, depth * 0.5);
    const sc = sun.shadow.camera;
    if (sc.right !== half || sc.far !== depth) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = depth; sc.updateProjectionMatrix(); }
  }
  const SUN_A = V(0.42, 0.78, 0.55).normalize();        // the well: high, from the south-east-ish behind the camera
  const SUN_B = V(-0.5, 0.42, 0.75).normalize();        // Udaipur / Jaipur: lower, warm, behind the camera's left shoulder

  // ------------------------------------------------------------------------------------- sky
  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // ===================================================================================== SHOT A: CHAND BAORI
  const shotA = new THREE.Group(); scene.add(shotA);
  const WM = makeWellMaterials();
  const well = buildStepwell(WM, { lite });
  shotA.add(well.group);
  // the ground round the stepwell's courtyard: dusty earth and scrub greening after the rain, neem trees
  {
    const g = new THREE.PlaneGeometry(900, 900, lite ? 40 : 80, lite ? 40 : 80).rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), cA = new THREE.Color('#857762'), cG = new THREE.Color('#4a6a2a'), cL = new THREE.Color('#6f8f3c');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), r = Math.max(Math.abs(x), Math.abs(z));
      const h = r < 34 ? -0.6 : -0.6 + Math.pow(Math.max(0, (Math.hypot(x, z) - 120) / 300), 1.6) * 40 * (0.6 + 0.4 * Math.sin(x * 0.013 + z * 0.007));
      p.setY(i, h);
      const n = fbm2(x / 40, z / 40, 4) * 0.5 + 0.5, n2 = fbm2(x / 9 + 5, z / 9, 2) * 0.5 + 0.5;
      // trodden earth by the courtyard, monsoon grass and scrub beyond
      c.copy(cA).lerp(cL, smoothstep(0.3, 0.6, n) * smoothstep(28, 50, r)).lerp(cG, smoothstep(0.55, 0.8, n * 0.7 + n2 * 0.4) * smoothstep(30, 60, r));
      c.multiplyScalar(0.85 + 0.25 * n2); col.set([c.r, c.g, c.b], i * 3);
    }
    // no ground over the well's courtyard (the rim paving is there)
    const ix = g.index.array, keep = [];
    for (let i = 0; i < ix.length; i += 3) {
      const inside = [ix[i], ix[i + 1], ix[i + 2]].every((v) => Math.max(Math.abs(p.getX(v)), Math.abs(p.getZ(v))) < WELL.A0 + 8.4);
      if (!inside) keep.push(ix[i], ix[i + 1], ix[i + 2]);
    }
    g.setIndex(keep);
    g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
    ground.receiveShadow = true;
    shotA.add(ground);
  }
  const wellTrees = buildUdaipur.trees({ lite, count: lite ? 40 : 90, seed: 77, place: (r) => {
    const a = r() * Math.PI * 2, d = 32 + r() * 160; return [Math.cos(a) * d, -0.6, Math.sin(a) * d, 0.8 + r() * 0.7];
  } });
  shotA.add(wellTrees);

  // the water in the well: deep blue-green; its reflection traced up to the opening (sky inside it,
  // sunlit or shaded stone outside it); rain rings in the monsoon
  const wellWaterU = {
    uTime: { value: 0 }, uRain: { value: 0 }, uSunDir: { value: SUN_A.clone() }, uSky: { value: new THREE.Color() }, uSkyHi: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color('#0b3a36') }, uShallow: { value: new THREE.Color('#2f7a68') }, uA0: { value: WELL.A0 }, uLevel: { value: DRY_Y }, uDim: { value: 1 }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0 },
  };
  const wellWater = new THREE.Mesh(new THREE.PlaneGeometry(2 * WELL.A0, 2 * WELL.A0, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: wellWaterU,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */ `${GLSL_NOISE}
      uniform float uTime, uRain, uA0, uLevel, uDim, uFogD; uniform vec3 uSunDir, uSky, uSkyHi, uDeep, uShallow, uFogCol; varying vec3 vW;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      vec2 rings(vec2 p){
        vec2 g = vec2(0.0);
        for (int k = 0; k < 2; k++) {
          vec2 q = p * (k == 0 ? 1.6 : 2.3) + float(k) * 7.3, c = floor(q), f = fract(q) - 0.5;
          float r = h2(c), ph = fract(uTime * (1.1 + r) + r * 9.0);
          vec2 o = (vec2(h2(c + 3.1), h2(c + 5.7)) - 0.5) * 0.5;
          vec2 d = f - o; float L = length(d), rr = ph * 0.5;
          float w = sin((L - rr) * 40.0) * exp(-abs(L - rr) * 30.0) * (1.0 - ph);
          g += normalize(d + 1e-4) * w;
        }
        return g;
      }
      void main(){
        vec3 V = normalize(vW - cameraPosition);
        float n1 = snoise(vec3(vW.xz * 0.7, uTime * 0.25)), n2 = snoise(vec3(vW.xz * 2.1 + 4.0, uTime * 0.45));
        vec2 slope = vec2(n1 - snoise(vec3(vW.xz * 0.7 + vec2(0.05, 0.0), uTime * 0.25)), n1 - snoise(vec3(vW.xz * 0.7 + vec2(0.0, 0.05), uTime * 0.25))) * 0.6
                   + vec2(n2 - snoise(vec3(vW.xz * 2.1 + 4.0 + vec2(0.05, 0.0), uTime * 0.45)), 0.0) * 0.25;
        slope += rings(vW.xz) * 0.06 * uRain;
        vec3 N = normalize(vec3(slope.x, 1.0, slope.y));
        vec3 R = reflect(V, N);
        float tUp = (0.0 - vW.y) / max(R.y, 1e-3);
        vec2 hit = vW.xz + R.xz * tUp;
        float inOpen = (1.0 - smoothstep(uA0 - 2.0, uA0 + 1.0, abs(hit.x))) * (1.0 - smoothstep(uA0 - 2.0, uA0 + 1.0, abs(hit.y)));
        // the walls seen in the water: lit on the faces turned to the sun, shaded on the others
        vec2 wd = normalize(R.xz + 1e-4);
        float lit = smoothstep(-0.2, 0.4, -dot(wd, normalize(uSunDir.xz)));
        vec3 wall = mix(vec3(0.07, 0.06, 0.05), vec3(0.42, 0.33, 0.24), lit) * uDim;
        vec3 refl = mix(wall, mix(uSky, uSkyHi, smoothstep(0.6, 1.0, R.y)), inOpen);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        float edge = smoothstep(2.5, 0.0, min(abs(abs(vW.x) - (uA0 - 0.0)), 50.0));
        vec3 body = mix(uDeep, uShallow, 0.35 + 0.35 * n1) * (0.55 + 0.45 * uDim);
        vec3 col = mix(body, refl, clamp(fres + 0.12, 0.0, 1.0));
        float s = max(dot(R, uSunDir), 0.0);
        col += vec3(1.0, 0.95, 0.85) * pow(s, 500.0) * 12.0 * inOpen * uDim;
        col = mix(col, col * 0.8 + vec3(0.04, 0.05, 0.05), uRain * 0.3);
        float fd = length(vW - cameraPosition) * uFogD;
        col = mix(col, uFogCol, 1.0 - exp(-fd * fd));
        gl_FragColor = vec4(col, 0.94);
      }`,
    transparent: true, depthWrite: true,
  }));
  wellWater.renderOrder = 2;
  shotA.add(wellWater);

  // rain: streaks falling through the opening (each loops on its own phase: a pure function of time)
  const NR = lite ? 1600 : 4200;
  const rainGeo = new THREE.BufferGeometry();
  {
    const seeds = new Float32Array(NR * 2 * 4);
    let s = 12345; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < NR; i++) { const a = [rnd(), rnd(), rnd(), 0.7 + rnd() * 0.6]; seeds.set(a, i * 8); seeds.set(a, i * 8 + 4); }
    const end = new Float32Array(NR * 2); for (let i = 0; i < NR; i++) end[i * 2 + 1] = 1;
    rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 6), 3));
    rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
    rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  }
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uBox: { value: new THREE.Vector4(-20, 20, -20, 20) }, uTop: { value: 22 }, uBot: { value: -30 }, uCol: { value: new THREE.Color('#dbe9f2') } },
    vertexShader: `attribute vec4 aSeed; attribute float aEnd; uniform float uTime, uOn, uTop, uBot; uniform vec4 uBox; varying float vA;
      void main(){
        float H = uTop - uBot, sp = 26.0 * aSeed.w;
        float y = uTop - fract(uTime * sp / H + aSeed.z) * H;
        vec3 p = vec3(mix(uBox.x, uBox.y, aSeed.x), y, mix(uBox.z, uBox.w, aSeed.y));
        p += vec3(0.08, 1.0, 0.03) * aEnd * 0.55 * aSeed.w;
        vA = uOn * (0.25 + 0.75 * aEnd) * step(fract(aSeed.x * 91.7 + aSeed.y * 13.1), uOn * 1.2);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, vA * 0.22); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; rain.renderOrder = 6;
  scene.add(rain);

  // the diagram: the dry-season and monsoon water levels, drawn round the well at the riser faces
  const levelLoop = (y, col, inten) => {
    const k = -y / WELL.H, a = wellHalf(Math.floor(k)) - WELL.D - 0.15;
    const l = progressLine([V(-a, y, a), V(a, y, a), V(a, y, -a), V(-a, y, -a), V(-a, y, a)], { color: col, intensity: inten, head: 0.03 });
    l.material.depthTest = true; l.renderOrder = 8; shotA.add(l); return l;
  };
  const dryLine = levelLoop(DRY_Y + 0.05, '#ffd590', 1.6), wetLine = levelLoop(WET_Y + 0.05, AQUA, 2.0);
  dryLine.material.depthTest = false; dryLine.renderOrder = 9;     // the old mark still reads under the risen water

  // ===================================================================================== SHOT B: UDAIPUR → JAIPUR
  const shotB = new THREE.Group(); scene.add(shotB);
  const uda = buildUdaipur({ lite });
  shotB.add(uda.group);
  const jai = buildJaipur({ lite, at: uda.JAIPUR, groundY: uda.heightAt });
  shotB.add(jai.group);

  // ------------------------------------------------------------------------------------- labels
  const labels = [];
  function label(text, sub, at, a, b, { dx = 0.5, dy = 0.3, k = 1, group = scene } = {}) {
    const c = new Callout(text, { dx, dy, size: 0.07, color: LABEL, sub, intensity: 1.6 });
    c.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });
    c.position.copy(at); c.userData.win = [a, b]; c.userData.k = k;
    group.add(c); labels.push(c);
    return c;
  }
  const NARROW = OUTPUT_ASPECT < 1.5;
  label('CHAND BAORI · ABHANERI, RAJASTHAN', 'c. 9TH CENTURY · ABOUT 3,500 STEPS IN 13 STOREYS', V(-3.5, storeyY(10.6), -1.5), T_WELL + 0.35, T_MON - 0.05, { dx: NARROW ? 0.12 : 0.34, dy: 0.24 });
  const lDry = label('DRY SEASON', 'THE STEPS FOLLOW THE WATER DOWN', V(-(wellHalf(11) - WELL.D - 0.15), DRY_Y + 0.05, -3.0), T_MON + 0.1, T_CUT - 0.02, { dx: NARROW ? 0.1 : -0.26, dy: -0.16, k: 0.8 });
  const lWet = label('MONSOON LEVEL', 'RAIN COLLECTED AND STORED', V(-(wellHalf(9) - WELL.D - 0.15), WET_Y + 0.05, -5.0), T_MON + 0.28, T_CUT - 0.02, { dx: NARROW ? 0.1 : -0.26, dy: 0.18, k: 0.8 });
  label('LAKE PICHOLA · UDAIPUR', "THE 'CITY OF LAKES' · MADE 1362, ENLARGED 16TH C.", uda.LAKE_LABEL, T_UDA - 0.02, T_JAI - 0.25, { dx: NARROW ? 0.1 : -0.42, dy: 0.2 });
  label('LAKE PALACE · JAG NIWAS · 1746', 'WHITE PALACE ON ITS OWN ISLAND', uda.PALACE_LABEL, T_UDA + 0.2, T_JAI - 0.15, { dx: NARROW ? 0.12 : 0.3, dy: 0.2, k: 0.8 });
  label('HAWA MAHAL · JAIPUR · 1799', '953 JHAROKHA WINDOWS · PINK SANDSTONE', jai.LABEL, T_JAI + 0.3, DUR + 1, { dx: NARROW ? -0.12 : -0.42, dy: 0.06, k: 0.85 });
  void lDry; void lWet;

  // ------------------------------------------------------------------------------------- HUD caption
  const hud = ctx.makeHUD();
  const SQ = OUTPUT_ASPECT < 1.5, TALL = OUTPUT_ASPECT < 0.8, UI = TALL ? 1.9 : SQ ? 1.6 : 1;
  const MH = FILM_ASPECT / OUTPUT_ASPECT;
  const capA = new TextPlane('MONSOON RAIN, KEPT FOR THE DRY MONTHS', { font: FONTS.mono, weight: 500, letterSpacing: 0.2, color: LABEL, intensity: 1.25, height: 0.046 * UI });
  const TOP = SQ ? Math.min(MH * 0.62, 2.2) : 0.8;
  capA.position.set(0, TOP, 0); hud.scene.add(capA); capA.opacity = 0;

  // ------------------------------------------------------------------------------------- camera
  const A_KEYS = [
    [T_WELL - 0.6, V(-1, 40, 44), V(0, -16, -2)],
    [T_WELL, V(2, 30, 36), V(0, -18, -3)],
    [T_WELL + 0.9, V(6.5, 12, 19.5), V(-2, -19, -8)],
    [T_WELL + 1.7, V(8.2, -3.0, 10.6), V(-4, -21, -10)],
    [T_MON, V(7.9, -6.6, 9.2), V(-3.8, -22.2, -9.4)],
    [T_CUT + 0.2, V(7.0, -9.0, 7.9), V(-3.2, -23.2, -8.4)],
  ];
  const B_KEYS = uda.cameraKeys(T_CUT, T_UDA, T_JAI, DUR, jai);
  const mkPath = (keys) => ({
    pos: new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal'),
    look: new THREE.CatmullRomCurve3(keys.map((k) => k[2]), false, 'centripetal'),
    warp: keys.map((k, i) => [k[0], i / (keys.length - 1)]),
  });
  const pathA = mkPath(A_KEYS), pathB = mkPath(B_KEYS);
  const camPos = V(0, 0, 0), camLook = V(0, 0, 0);

  // ------------------------------------------------------------------------------------- per-frame
  const ZEN_A = new THREE.Color(0.1, 0.3, 0.66), HOR_A = new THREE.Color(0.6, 0.74, 0.86);
  const ZEN_S = new THREE.Color(0.17, 0.2, 0.25), HOR_S = new THREE.Color(0.42, 0.46, 0.5);
  const ZEN_B = new THREE.Color(0.08, 0.27, 0.66), HOR_B = new THREE.Color(0.58, 0.72, 0.86);
  const SUNC = new THREE.Color(1.0, 0.92, 0.8), SUNC_B = new THREE.Color(1.0, 0.86, 0.68);
  const FOG_A = new THREE.Color('#c9cdc9'), FOG_RAIN = new THREE.Color('#9aa6ad'), FOG_B = new THREE.Color('#a9c2d8');
  const tmpC = new THREE.Color();

  const dof = { focus: 30, range: 30, amount: 0.08 };
  const bloom = { strength: 0.5 };
  const api = {
    scene, camera, hud, dof, bloom, exposure: 1, background: 0x9db6cc,
    exploreLimits: { yaw: 1.1, pitchDown: 0.5, pitchUp: 0.6, zoomIn: 0.15, zoomOut: 2.0, fly: 1.6 },
    arSubject: (t) => (t < T_CUT ? { centre: V(0, -12, 0), radius: 26 } : t < T_JAI - 0.1 ? { centre: uda.PALACE.clone().setY(10), radius: 70 } : { centre: jai.CENTRE.clone(), radius: 28 }),
    explorePosed(cam) { cam.updateMatrixWorld(); poseLabels(cam, api._t ?? 0); },
    update,
  };

  function poseLabels(cam, t) {
    const fk = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(18));
    for (const c of labels) {
      const [a, b] = c.userData.win;
      const p = ramp(t, a, a + 0.3, ease.outCubic), o = 1 - ramp(t, b - 0.15, b);
      c.visible = p > 0 && o > 0;
      if (!c.visible) continue;
      faceCamera(c, cam);
      c.scale.setScalar(cam.position.distanceTo(c.position) * 0.25 * fk * c.userData.k * (NARROW ? 0.8 : 1));
      c.reveal(p, o);
    }
  }

  function update(t, info) {
    api._t = t;
    const A = t < T_CUT;
    shotA.visible = A; shotB.visible = !A;
    // monsoon: rain and storm build, the water climbs; the rain sheet carries the cut
    const storm = A ? ramp(t, T_MON - 0.25, T_MON + 0.35, ease.inOutSine) : 0;
    const rainOn = A ? ramp(t, T_MON - 0.05, T_MON + 0.3, ease.outCubic) : 1 - ramp(t, T_CUT, T_CUT + 0.3, ease.outCubic);
    const sheet = envelope(t, T_CUT - 0.28, T_CUT + 0.2, 0.26, 0.19, ease.inOutSine);
    const fill = ramp(t, T_MON + 0.05, T_CUT - 0.05, ease.inOutSine);
    const level = lerp(DRY_Y, WET_Y, fill);

    // ---- camera
    const P = A ? pathA : pathB;
    const u = clamp(timeWarp(t, P.warp), 0, 1);
    P.pos.getPoint(u, camPos); P.look.getPoint(u, camLook);
    camPos.x += Math.sin(t * 1.3) * (A ? 0.03 : 0.25); camPos.y += Math.sin(t * 1.7 + 1) * (A ? 0.025 : 0.15);
    camera.position.copy(camPos);
    camera.up.set(A ? 0 : Math.sin(t * 0.8) * 0.01 + 0.03 * envelope(t, T_JAI - 0.4, T_JAI + 0.4, 0.3, 0.3), 1, 0).normalize();
    camera.lookAt(camLook);
    camera.fov = A ? lerp(40, 46, ramp(t, T_WELL, T_MON, ease.inOutSine)) : lerp(30, 38, ramp(t, T_UDA + 0.4, T_JAI + 0.1, ease.inOutSine)) - 4 * ramp(t, T_JAI + 0.2, DUR + 0.3, ease.inOutSine);
    camera.near = A ? 0.1 : 0.5;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    sky.position.copy(camera.position); sky.scale.setScalar(3000);

    // ---- sky, sun, fog
    const su = skyMat.uniforms;
    su.uTime.value = t;
    if (A) {
      setSun(SUN_A, V(0, -12, 0), 30, 140);
      su.uZen.value.copy(ZEN_A).lerp(ZEN_S, storm); su.uHor.value.copy(HOR_A).lerp(HOR_S, storm);
      su.uSunCol.value.copy(SUNC); su.uCover.value = lerp(0.22, 0.75, storm); su.uStorm.value = storm * 0.85; su.uMirror.value = 0.7;
      sun.intensity = lerp(3.2, 0.45, storm); sun.color.copy(SUNC);
      hemi.intensity = lerp(0.6, 0.85, storm); hemi.color.set('#a9c8ec'); hemi.groundColor.set('#8a6e50');
      scene.environmentIntensity = lerp(0.32, 0.22, storm);
      scene.fog.color.copy(FOG_A).lerp(FOG_RAIN, storm); scene.fog.density = lerp(0.0025, 0.012, storm) + 0.06 * sheet;
    } else {
      setSun(SUN_B, t < T_JAI - 0.15 ? uda.PALACE.clone().setY(8) : jai.CENTRE, t < T_JAI - 0.15 ? 120 : 60, 900);
      const clear = ramp(t, T_CUT, T_UDA + 0.2, ease.outCubic);
      su.uZen.value.copy(ZEN_S).lerp(ZEN_B, clear); su.uHor.value.copy(HOR_S).lerp(HOR_B, clear);
      su.uSunCol.value.copy(SUNC_B); su.uCover.value = lerp(0.6, 0.26, clear); su.uStorm.value = (1 - clear) * 0.5; su.uMirror.value = 0.6;
      sun.intensity = lerp(0.9, 2.5, clear); sun.color.copy(SUNC_B);
      hemi.intensity = 0.6; hemi.color.set('#a6c6ea'); hemi.groundColor.set('#6f7a4a');
      scene.environmentIntensity = 0.34;
      scene.fog.color.copy(FOG_RAIN).lerp(FOG_B, clear); scene.fog.density = lerp(0.0025, 0.0005, clear) + 0.012 * sheet;
    }

    // ---- shot A: water, stone wetness, rain, diagram
    if (A) {
      STONE_U.uWaterY.value = level; STONE_U.uStainY.value = WET_Y + 0.4; STONE_U.uRain.value = 0.6 * rainOn;
      wellWater.position.y = level;
      wellWaterU.uTime.value = t; wellWaterU.uRain.value = rainOn; wellWaterU.uLevel.value = level; wellWaterU.uDim.value = lerp(1, 0.45, storm);
      wellWaterU.uSky.value.copy(su.uHor.value).lerp(su.uZen.value, 0.5); wellWaterU.uSkyHi.value.copy(su.uZen.value).multiplyScalar(1.2);
      wellWaterU.uSunDir.value.copy(SUN_A);
      wellWaterU.uFogCol.value.copy(scene.fog.color); wellWaterU.uFogD.value = scene.fog.density;
      const dl = ramp(t, T_MON + 0.05, T_MON + 0.35, ease.outCubic), lo = 1 - ramp(t, T_CUT - 0.18, T_CUT - 0.02);
      dryLine.progress = dl; dryLine.opacity = lo * 0.9; dryLine.visible = dl > 0;
      wetLine.progress = ramp(t, T_MON + 0.22, T_MON + 0.52, ease.outCubic); wetLine.opacity = lo; wetLine.visible = wetLine.progress > 0;
      rainMat.uniforms.uBox.value.set(-WELL.A0, WELL.A0, -WELL.A0, WELL.A0); rainMat.uniforms.uTop.value = 24; rainMat.uniforms.uBot.value = level;
    } else {
      STONE_U.uWaterY.value = -100; STONE_U.uStainY.value = -100; STONE_U.uRain.value = 0.4 * rainOn;
      // the last of the shower over the lake, round the camera
      rainMat.uniforms.uBox.value.set(camPos.x - 40, camPos.x + 40, camPos.z - 40, camPos.z + 40); rainMat.uniforms.uTop.value = camPos.y + 25; rainMat.uniforms.uBot.value = 0;
    }
    rainMat.uniforms.uTime.value = t; rainMat.uniforms.uOn.value = Math.min(1, rainOn + sheet);
    rain.visible = rainMat.uniforms.uOn.value > 0.002;

    // ---- shot B
    if (!A) {
      uda.update(t, camera, scene.fog);
      jai.update(t, camera);
      // (the ridge hides the switch: the lake is behind the camera, Jaipur still behind the crest)
      uda.lakeSet.visible = t < T_JAI - 0.05;
      jai.group.visible = t >= T_JAI - 0.05;
    }

    // ---- labels and caption
    poseLabels(camera, t);
    const cp = ramp(t, T_MON + 0.15, T_MON + 0.45, ease.outCubic);
    capA.reveal = cp; capA.opacity = cp > 0 ? 1 - ramp(t, T_CUT - 0.2, T_CUT - 0.05) : 0;

    // ---- lens and grade
    const fd = camera.position.distanceTo(camLook);
    dof.focus = fd; dof.range = Math.max(A ? 10 : 40, fd * 0.9); dof.amount = A ? 0.12 : 0.08;
    bloom.strength = (A ? 0.45 : 0.32) + 0.35 * sheet;
    api.exposure = 1.0 + 0.35 * sheet - 0.06 * storm * (1 - sheet);
    void info;
  }
  return api;
}
