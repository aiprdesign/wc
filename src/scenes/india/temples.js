// STONE AND SPIRIT — rock-cut and built stone, 3rd c. BC – AD 1653 (story 31.5 – 35.0 s)
// One continuous golden-hour move across a "museum of monuments", the sun sinking as it goes:
//   (stupa) low past a torana to the Great Stupa at Sanchi → the camera climbs and swings right over a
//   basalt escarpment → (kailasa) the rock inside the trench is cut away from the top down and the Kailasa
//   temple stands free inside it, a gold line marking the cutting plane, dust lifting off the fresh cut →
//   the camera dives towards Thanjavur → (brihadeeswarar) the 66 m granite vimana glows in the last sun,
//   a dimension line rising beside it → a fast pan right, down to the water → (taj) the Taj Mahal against
//   the afterglow, reflected in the long channel, still moving into the luma wipe.
// Technique: procedural architecture (temples-assets.js, merged per material), a world-space "carving"
// patch (rock fill shrinking from the top, hot band on the newly exposed stone), mirrored geometry under a
// translucent water surface for the reflection, a time-lapse sky / sun, non-uniform terrain grid.
import * as THREE from 'three';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, rng, timeWarp, clamp } from '../../lib/math.js';
import { fbm2 } from '../../lib/noise.js';
import { progressLine } from '../../lib/lines.js';
import { Callout, Dimension, faceCamera } from '../../lib/hud.js';
import { Parts, makeMaterials, buildStupa, buildKailasa, buildCliff, buildTower, buildTaj, rockBox, prep, K, TAJ_PY } from './temples-assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD = '#ffd590';
// world layout (metres)
const STUPA = V(0, 0, 0);
const KAI = V(125, 0, -115);
const TOWER = V(252, 0, -30);
const TAJ = V(487.5, 0, 160);          // plinth centre; its front (local +z) faces world −x, down the channel
const TAJ_RY = -Math.PI / 2;
const WATER_Y = -0.35;
const GARDEN = { x0: -70, x1: 70, z0: -60, z1: 237.5, ch: 5 };   // Taj-local garden rect and channel half-width
// Taj-local → world
const tajW = (x, y, z) => V(TAJ.x - z, y, TAJ.z + x);

// sun: low in the south-west behind the camera's right shoulder, sinking through the shot
const SUN_AZ = new THREE.Vector2(0.5, 0.866).normalize();
const sunDirAt = (e, out = new THREE.Vector3()) => out.set(SUN_AZ.x * Math.cos(e), Math.sin(e), SUN_AZ.y * Math.cos(e));

function skyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uSun: { value: V(0, 0.2, 1) }, uHor: { value: new THREE.Color() }, uZen: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uGlow: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: `uniform vec3 uSun, uHor, uZen, uSunCol; uniform float uGlow; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float refl = d.y < 0.0 ? 1.0 : 0.0;
        d.y = abs(d.y);                                   // below the horizon: the mirrored sky (seen in the water)
        float h = d.y;
        vec3 c = mix(uHor, uZen, smoothstep(0.0, 0.5, h));
        vec2 a = normalize(d.xz + 1e-5), s = normalize(uSun.xz);
        float az = max(dot(a, s), 0.0), sd = max(dot(d, normalize(uSun)), 0.0);
        c += uSunCol * pow(az, 4.0) * (1.0 - smoothstep(0.0, 0.35, h)) * 0.9 * uGlow;
        c += vec3(0.55, 0.3, 0.36) * pow(1.0 - az, 3.0) * (1.0 - smoothstep(0.0, 0.22, h)) * 0.22;
        c += uSunCol * (pow(sd, 1400.0) * 40.0 + pow(sd, 90.0) * 1.4 + pow(sd, 10.0) * 0.4) * uGlow;
        c = mix(c, c * vec3(0.55, 0.62, 0.7), refl);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
}

// non-uniform coordinates: fine steps over the set, growing geometrically out to the horizon
function axisCoords(a, b, step, far) {
  const out = [];
  for (let x = a; x <= b + 1e-6; x += step) out.push(x);
  let s = step, x = a; while (x > a - far) { s *= 1.13; x -= s; out.unshift(x); }
  s = step; x = out[out.length - 1]; while (x < b + far) { s *= 1.13; x += s; out.push(x); }
  return out;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const dur = segment.end - segment.start;
  const T_ST = cue('stupa'), T_KA = cue('kailasa'), T_BR = cue('brihadeeswarar'), T_TJ = cue('taj');
  const lite = ctx.engine?.quality === 'lite';

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.35;
  const FOG = 0.0016;
  scene.fog = new THREE.FogExp2('#c79a72', FOG);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.5, 6000);

  const M = makeMaterials();

  // ------------------------------------------------------------------------------------- monuments
  const stupa = new Parts(); buildStupa(stupa);
  const stupaG = stupa.build(M, { sand: 0.22, sandDark: 0.3 });
  stupaG.position.copy(STUPA);
  scene.add(stupaG);

  // Kailasa: temple (carved), cliff, and the rock fill that is cut away
  const kai = new THREE.Group(); kai.position.copy(KAI); scene.add(kai);
  const kt = new Parts(); buildKailasa(kt);
  const cutU = { uCut: { value: 100 }, uCutHot: { value: new THREE.Color('#ffb060') } };
  M.basalt.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cutU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCutY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vCutY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCutY; uniform float uCut; uniform vec3 uCutHot;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float dc = vCutY - uCut; totalEmissiveRadiance += uCutHot * (2.2 * exp(-max(dc, 0.0) / 0.35) + 0.25 * exp(-max(dc, 0.0) / 3.0)) * step(0.0, dc); }`);
  };
  M.basalt.customProgramCacheKey = () => 'kailasa-cut-v1';
  kai.add(kt.build(M, { basalt: 0.18, dark: 0.2 }));
  const cl = new Parts(); buildCliff(cl);
  kai.add(cl.build(M, { cliff: 0.08 }));
  const KW = K.X1 - K.X0, KD = K.Z1 - K.Z0;
  const fillBody = new THREE.Mesh((() => { const g = rockBox(KW - 0.1, K.H, KD, { cell: 5, amp: 0.7, freq: 0.07, seed: 9 }); g.translate(0, K.H / 2, 0); return g; })(), M.cliff);
  fillBody.position.set((K.X0 + K.X1) / 2, 0, (K.Z0 + K.Z1) / 2);
  fillBody.castShadow = fillBody.receiveShadow = true;
  const cutMat = new THREE.MeshStandardMaterial({ map: M.basalt.map, color: '#e2cdb2', roughness: 0.9 });
  const capGeo = (() => {
    const g = new THREE.PlaneGeometry(KW - 0.2, KD - 0.2, 42, 26); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, 0.35 * fbm2(x * 0.09, z * 0.09, 3) + 0.08 * Math.sin(x * 1.7 + z * 0.4)); }
    g.computeVertexNormals();
    const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 0.18; uv[i * 2 + 1] = p.getZ(i) * 0.18; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  })();
  const cap = new THREE.Mesh(capGeo, cutMat);
  cap.position.set((K.X0 + K.X1) / 2, 0, (K.Z0 + K.Z1) / 2);
  cap.receiveShadow = true;
  kai.add(fillBody, cap);
  // the cutting plane: a gold outline round the trench at the cut level
  const cutRect = progressLine([V(K.X0, 0, K.Z1), V(K.X0, 0, K.Z0), V(K.X1, 0, K.Z0), V(K.X1, 0, K.Z1), V(K.X0, 0, K.Z1)], { color: GOLD, intensity: 2.2, head: 0.02 });
  cutRect.position.y = 0;
  kai.add(cutRect);
  // dust and chips lifting off the fresh cut (a pure function of time: each grain loops on its own phase)
  const NCH = lite ? 500 : 1000;
  const chipGeo = new THREE.BufferGeometry();
  {
    const r = rng(77), a = new Float32Array(NCH * 4);
    for (let i = 0; i < NCH; i++) { a[i * 4] = r(); a[i * 4 + 1] = r(); a[i * 4 + 2] = r(); a[i * 4 + 3] = 0.6 + r() * 0.8; }
    chipGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NCH * 3), 3));
    chipGeo.setAttribute('aSeed', new THREE.BufferAttribute(a, 4));
  }
  const chipMat = new THREE.ShaderMaterial({
    uniforms: { uCut: { value: 0 }, uTime: { value: 0 }, uOn: { value: 0 }, uBox: { value: new THREE.Vector4(K.X0, K.X1, K.Z0, K.Z1) }, uColor: { value: new THREE.Color('#ffcf98') }, uScale: { value: 1 } },
    vertexShader: `attribute vec4 aSeed; uniform float uCut, uTime, uOn, uScale; uniform vec4 uBox; varying float vA;
      void main(){
        float life = fract(uTime * 0.9 * aSeed.w + aSeed.z);
        vec3 p = vec3(mix(uBox.x, uBox.y, aSeed.x), uCut + life * (3.0 + 7.0 * fract(aSeed.y * 7.13)), mix(uBox.z, uBox.w, aSeed.y));
        p.x += sin(aSeed.z * 40.0 + life * 3.0) * 1.5 * life; p.z += cos(aSeed.x * 37.0 + life * 2.0) * 1.5 * life;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.5 + 0.8 * aSeed.w) * 420.0 / -mv.z;
        vA = uOn * (1.0 - life) * smoothstep(0.0, 0.08, life);
      }`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
      void main(){ vec2 q = gl_PointCoord - 0.5; float d = dot(q, q); if (d > 0.25) discard; gl_FragColor = vec4(uColor * 1.4, vA * pow(1.0 - d * 4.0, 2.0) * 0.35); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const chips = new THREE.Points(chipGeo, chipMat); chips.frustumCulled = false;
  kai.add(chips);

  // Brihadeeswarar
  const tw = new Parts(); buildTower(tw);
  const towerG = tw.build(M, { granite: 0.2, graniteDark: 0.2 });
  towerG.position.copy(TOWER);
  scene.add(towerG);

  // Taj Mahal, its garden, channel and reflection
  const tj = new Parts(); buildTaj(tj);
  const tajG = tj.build(M, { marble: 0.06, marbleShade: 0.06, redsand: 0.2 });
  tajG.position.copy(TAJ); tajG.rotation.y = TAJ_RY;
  scene.add(tajG);
  const tajMirror = new THREE.Group();
  for (const m of tajG.children) { const c = new THREE.Mesh(m.geometry, m.material); c.castShadow = false; c.receiveShadow = true; tajMirror.add(c); }
  tajMirror.position.set(TAJ.x, 2 * WATER_Y, TAJ.z); tajMirror.rotation.y = TAJ_RY; tajMirror.scale.y = -1;
  scene.add(tajMirror);
  const garden = new Parts();
  {
    const { x0, x1, z0, z1, ch } = GARDEN;
    garden.box('grass', x0, -13, -0.4, 0.05, 47.5, z1); garden.box('grass', 13, x1, -0.4, 0.05, 47.5, z1);
    garden.box('path', -13, -ch - 0.8, -0.4, 0.12, 47.5, z1); garden.box('path', ch + 0.8, 13, -0.4, 0.12, 47.5, z1);
    garden.box('path', x0, x1, -0.4, 0.1, z0, 47.5);
    for (const s of [-1, 1]) {
      garden.box('marble', s > 0 ? ch : -ch - 0.8, s > 0 ? ch + 0.8 : -ch, -0.4, 0.3, 47.5, z1);    // coping
      garden.box('marbleShade', s > 0 ? ch - 0.05 : -ch, s > 0 ? ch : -ch + 0.05, -3, 0.3, 47.5, z1);   // channel wall
      garden.box('redsand', s > 0 ? x1 : x0 - 2, s > 0 ? x1 + 2 : x0, 0, 7, z0, z1);                 // enclosure walls
      garden.box('redsand', s > 0 ? x1 - 0.5 : x0 - 2.5, s > 0 ? x1 + 2.5 : x0 + 0.5, 7, 7.8, z0, z1);
      // the long beds and paths of the charbagh across the garden
    }
    garden.box('marble', -ch - 0.8, ch + 0.8, -0.4, 0.3, z1 - 0.8, z1);
    garden.box('marbleShade', -ch, ch, -3, 0.3, z1 - 0.85, z1 - 0.8);
    for (const z of [110, 175]) for (const s of [-1, 1]) garden.box('path', s > 0 ? 13 : x0, s > 0 ? x1 : -13, -0.4, 0.1, z - 3, z + 3);
  }
  const gardenG = garden.build(M, { grass: 0.1, path: 0.12, marble: 0.1, marbleShade: 0.1, redsand: 0.2 });
  gardenG.position.copy(TAJ); gardenG.rotation.y = TAJ_RY;
  scene.add(gardenG);
  // cypresses along the channel (and their reflections)
  const cypGeo = (() => { const g = new THREE.LatheGeometry([[0, 0], [0.25, 0], [0.25, 1.2], [1.5, 2.2], [1.9, 4.5], [1.6, 7], [0.9, 9.2], [0, 10.5]].map(([r, y]) => new THREE.Vector2(r, y)), 10); return g; })();
  const cypPos = [];
  for (let z = 58; z < GARDEN.z1 - 10; z += 11) for (const x of [-12, 12, -30, 30]) if (Math.abs(x) < 20 || (Math.round(z / 11) % 2 === 0)) cypPos.push([x, z]);
  const cyp = new THREE.InstancedMesh(cypGeo, M.foliage, cypPos.length), cypM = new THREE.InstancedMesh(cypGeo, M.foliage, cypPos.length);
  {
    const m4 = new THREE.Matrix4(), r = rng(5);
    cypPos.forEach(([x, z], i) => {
      const w = tajW(x, 0, z), s = 0.62 + r() * 0.16;
      m4.makeScale(s, s * (0.9 + r() * 0.25), s).setPosition(w.x, 0, w.z); cyp.setMatrixAt(i, m4);
      m4.makeScale(s, -s * (0.9 + r() * 0.25), s).setPosition(w.x, 2 * WATER_Y, w.z); cypM.setMatrixAt(i, m4);
    });
  }
  cyp.castShadow = cyp.receiveShadow = true;
  scene.add(cyp, cypM);
  // the water: a translucent, faintly rippled surface over the mirrored world
  const waterMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color('#1c2532') }, uSunCol: { value: new THREE.Color('#ffb070') } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uTint, uSunCol; varying vec3 vW;
      void main(){
        vec3 v = normalize(cameraPosition - vW);
        float rip = sin(vW.x * 0.9 + uTime * 2.0) * sin(vW.z * 2.3 - uTime * 1.3) + 0.5 * sin(vW.x * 2.7 - uTime * 3.1 + vW.z);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        float a = mix(0.62, 0.22, fres) + 0.05 * rip;
        vec3 c = uTint + uSunCol * 0.06 * max(rip, 0.0);
        gl_FragColor = vec4(c, clamp(a, 0.1, 0.8));
      }`,
    transparent: true, depthWrite: false,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * GARDEN.ch, GARDEN.z1 - 47.5).rotateX(-Math.PI / 2), waterMat);
  { const c = tajW(0, WATER_Y, (47.5 + GARDEN.z1) / 2); water.position.copy(c); water.rotation.y = TAJ_RY; }
  scene.add(water);

  // ------------------------------------------------------------------------------------- terrain
  const inTajLocal = (x, z) => { const lx = z - TAJ.z, lz = TAJ.x - x; return [lx, lz]; };
  function groundH(x, z) {
    // flatten round the monuments
    const dS = Math.hypot(x - STUPA.x, z - STUPA.z), dT = Math.hypot(x - TOWER.x, z - (TOWER.z + 20));
    let flat = smoothstep(32, 60, dS) * smoothstep(55, 95, dT);
    const [lx, lz] = inTajLocal(x, z);
    const gx = Math.max(Math.abs(lx) - 66, 0), gz = Math.max(lz - 233, -58 - lz, 0), gd = Math.hypot(gx, gz);
    const dip = 1 - smoothstep(0, 1.5, gd);
    flat *= smoothstep(0, 30, gd);
    let h = (0.9 * fbm2(x / 70, z / 70, 3) + 0.25) * flat;
    // the Deccan escarpment round Kailasa: a plateau at the cliff top, the trench left clear
    const dx = x - KAI.x, dz = z - KAI.z;
    // talus at the foot of the cliff (not in front of the trench)
    const inX = smoothstep(K.L - 4, K.L + 6, dx) * smoothstep(K.R + 4, K.R - 6, dx);
    h += 6 * smoothstep(34, 22, dz) * smoothstep(20, 23, dz) * inX * smoothstep(40, 52, Math.abs(dx)) * (0.6 + 0.4 * fbm2(x / 20, z / 20, 2));
    // the plateau: inside the cliff blocks (their faces are the escarpment) and on behind them
    // (beyond the cut cliff the ridge falls away as a natural hillside)
    const ext = Math.max(0, K.L - dx, dx - K.R);
    let m = smoothstep(K.L - 90, K.L + 6, dx) * smoothstep(K.R + 90, K.R - 6, dx) * smoothstep(22 + ext * 0.9, 6, dz) * (1 - 0.35 * smoothstep(0, 80, ext));
    m *= Math.max(smoothstep(42, 52, Math.abs(dx)), 1 - smoothstep(-40, -30, dz));
    h = lerp(h, 33.4 + 2.5 * fbm2(x / 60, z / 60, 3) * smoothstep(-80, -110, dz) * smoothstep(0, 10, ext + Math.max(0, -dz - 140)) + 4 * fbm2(x / 35, z / 35, 3) * smoothstep(0, 20, ext), m);
    // distant hills (kept low towards the sun)
    const rx = x - 250, rz = z - 30, r = Math.hypot(rx, rz);
    const toSun = Math.max(0, (rx * SUN_AZ.x + rz * SUN_AZ.y) / Math.max(r, 1));
    h += smoothstep(500, 1300, r) * (50 + 70 * fbm2(x / 380, z / 380, 4)) * (1 - 0.85 * toSun);
    return lerp(h, -95, dip);
  }
  {
    const xs = axisCoords(-160, 640, lite ? 8 : 6, 3200), zs = axisCoords(-210, 290, lite ? 8 : 6, 3200);
    const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), idx = [];
    const cA = new THREE.Color('#9a8150'), cB = new THREE.Color('#6b5a36'), cC = new THREE.Color('#55602e'), cR = new THREE.Color('#7a6a5a'), tmp = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = xs[i], z = zs[j], y = groundH(x, z), k = (j * nx + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      const n1 = fbm2(x / 45 + 7, z / 45, 3) * 0.5 + 0.5, n2 = fbm2(x / 12, z / 12 + 3, 2) * 0.5 + 0.5;
      tmp.copy(cA).lerp(cB, n1).lerp(cC, smoothstep(0.55, 0.8, n2) * 0.6);
      if (y > 20) tmp.lerp(cR, 0.6);
      col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
    }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + nx; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.receiveShadow = true;
    scene.add(ground);
  }
  // trees: round-crowned (neem, banyan) scattered on the plain, clear of the monuments and the camera
  {
    const parts = [new THREE.CylinderGeometry(0.25, 0.4, 3.2, 6).translate(0, 1.6, 0)];
    for (const [x, y, z, r] of [[0, 4.4, 0, 2.6], [1.4, 3.9, 0.6, 1.9], [-1.3, 4.0, -0.5, 2.0], [0.2, 5.4, -0.9, 1.7]]) parts.push(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z));
    const trunkFol = parts.map(prep);
    const tree = new THREE.BufferGeometry();
    // merge by hand (one geometry, foliage colour on the crown via vertex colours)
    const n = trunkFol.reduce((s, g) => s + g.attributes.position.count, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
    let o = 0;
    trunkFol.forEach((g, gi) => {
      P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3);
      const c = gi === 0 ? [0.25, 0.18, 0.12] : [0.2 + gi * 0.02, 0.26, 0.11];
      for (let v = 0; v < g.attributes.position.count; v++) C.set(c, (o + v) * 3);
      o += g.attributes.position.count;
    });
    tree.setAttribute('position', new THREE.BufferAttribute(P, 3)); tree.setAttribute('normal', new THREE.BufferAttribute(N, 3)); tree.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const r = rng(12), list = [];
    const avoid = [[STUPA.x, STUPA.z, 34], [TOWER.x, TOWER.z + 15, 75], [-46, 60, 12], [-24, 62, 14], [184, 94, 18], [204, 104, 18]];
    for (let k = 0; k < 4000 && list.length < (lite ? 140 : 260); k++) {
      const x = -150 + r() * 780, z = -160 + r() * 380;
      if (avoid.some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      const [lx, lz] = inTajLocal(x, z); if (Math.abs(lx) < 110 && lz > -120 && lz < 250) continue;
      if (Math.abs(x - KAI.x) < 50 && z - KAI.z < 30 && z - KAI.z > -36) continue;
      if (z - KAI.z < 36 && z - KAI.z > 18 && x - KAI.x > K.L - 5 && x - KAI.x < K.R + 5) continue;
      list.push([x, groundH(x, z), z, 0.8 + r() * 0.9, r() * 6.28]);
    }
    const trees = new THREE.InstancedMesh(tree, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach(([x, y, z, s, a], i) => { q.setFromAxisAngle(V(0, 1, 0), a); m4.compose(V(x, y - 0.3, z), q, V(s, s, s)); trees.setMatrixAt(i, m4); });
    trees.castShadow = trees.receiveShadow = true;
    scene.add(trees);
  }

  // ------------------------------------------------------------------------------------- sky and light
  const skyMat = skyMaterial();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const sun = new THREE.DirectionalLight('#ffd2a0', 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.25;
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight('#9fb3d6', '#6a4a2c', 0.5);
  scene.add(fill);
  const sunDir = new THREE.Vector3();
  function setSun(c, half) {
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(sunDir, 600);
    const sc = sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 300; sc.far = 900;
    sc.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------------------------- callouts
  const labels = [];
  function label(text, sub, at, a, b, { dx = 0.55, dy = 0.32, k = 1 } = {}) {
    const c = new Callout(text, { dx, dy, size: 0.07, color: '#ffe6bf', sub, intensity: 1.6 });
    c.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });
    c.position.copy(at); c.userData.win = [a, b]; c.userData.k = k;
    scene.add(c); labels.push(c);
    return c;
  }
  label('GREAT STUPA · SANCHI', '3RD C. BC · BEGUN UNDER ASHOKA', V(15, 7, 10), T_ST + 0.12, T_KA - 0.1, { dx: 0.5, dy: -0.12 });
  label('KAILASA · ELLORA · 8TH CENTURY', 'CARVED FROM ONE ROCK', V(KAI.x + 13, 12, KAI.z - 6), T_KA + 0.3, T_BR - 0.08, { dx: 0.55, dy: -0.18 });
  label('THANJAVUR · 1010', '66 m GRANITE TOWER', V(TOWER.x - 9, 36, TOWER.z + 9), T_BR + 0.05, T_TJ - 0.15, { dx: -0.5, dy: -0.12 });
  label('TAJ MAHAL · 1632–1653', 'AGRA · WHITE MAKRANA MARBLE', tajW(43.5, 28, 43.5), T_TJ + 0.1, dur + 1, { dx: 0.4, dy: -0.12 });
  // the tower's height, drawn beside it
  const dimG = new THREE.Group();
  const dim66 = new Dimension(V(0, 0, 0), V(0, 66, 0), '66 m', { size: 2.6, tick: 1.6, color: '#ffe6bf', intensity: 1.8 });
  dimG.add(dim66);
  dim66.label.rotation.z = 0; dim66.label.position.set(5.5, 33, 0);
  dimG.position.set(TOWER.x + 22, 0, TOWER.z + 18);
  dim66.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 20; } });
  scene.add(dimG);

  // ------------------------------------------------------------------------------------- camera
  const KEYS = [
    [-0.25, V(-46, 3.4, 60), V(2, 9.5, 0)],
    [T_ST, V(-24, 4.6, 62), V(5, 10, 0)],
    [T_ST + 0.45, V(30, 36, 62), V(KAI.x - 30, 10, KAI.z)],
    [T_KA + 0.05, V(KAI.x - 34, 76, KAI.z + 96), V(KAI.x - 8, 12, KAI.z - 62)],
    [T_KA + 0.6, V(KAI.x + 26, 70, KAI.z + 98), V(KAI.x - 2, 12, KAI.z - 60)],
    [T_BR + 0.05, V(184, 6, 94), V(TOWER.x + 4, 38, TOWER.z)],
    [T_BR + 0.4, V(204, 6, 104), V(TOWER.x + 40, 34, TOWER.z + 24)],
    [T_TJ + 0.05, V(258, 7, TAJ.z), V(TAJ.x, 30, TAJ.z)],
    [dur + 0.3, V(298, 6.6, TAJ.z), V(TAJ.x, 31, TAJ.z)],
  ];

  const posC = new THREE.CatmullRomCurve3(KEYS.map((k) => k[1]), false, 'centripetal');
  const lookC = new THREE.CatmullRomCurve3(KEYS.map((k) => k[2]), false, 'centripetal');
  const warp = KEYS.map((k, i) => [k[0], i / (KEYS.length - 1)]);
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), shC = new THREE.Vector3();

  const dof = { focus: 60, range: 60, amount: 0.12 };
  const bloom = { strength: 0.6 };
  const api = { scene, camera, update, dof, bloom, exposure: 1, exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomOut: 2.4 } };

  const HOR0 = new THREE.Color(1.0, 0.66, 0.42), HOR1 = new THREE.Color(0.95, 0.5, 0.36);
  const ZEN0 = new THREE.Color(0.2, 0.3, 0.52), ZEN1 = new THREE.Color(0.13, 0.17, 0.36);
  const SUN0 = new THREE.Color(1.0, 0.78, 0.52), SUN1 = new THREE.Color(1.0, 0.52, 0.28);

  function update(t, info) {
    // ---- time-lapse sun
    const day = ramp(t, -0.3, dur + 0.3);
    const elev = THREE.MathUtils.degToRad(lerp(13, 3.2, day));
    sunDirAt(elev, sunDir);
    skyMat.uniforms.uSun.value.copy(sunDir);
    skyMat.uniforms.uHor.value.copy(HOR0).lerp(HOR1, day);
    skyMat.uniforms.uZen.value.copy(ZEN0).lerp(ZEN1, day);
    skyMat.uniforms.uSunCol.value.copy(SUN0).lerp(SUN1, day);
    sun.color.copy(SUN0).lerp(SUN1, day);
    sun.intensity = lerp(3.4, 2.9, day);
    fill.intensity = lerp(0.55, 0.28, day);
    scene.environmentIntensity = lerp(0.36, 0.2, day);
    scene.fog.color.copy(skyMat.uniforms.uHor.value).multiplyScalar(0.8);
    waterMat.uniforms.uTime.value = t;

    // ---- carving Kailasa from the top down
    const cutP = ramp(t, T_KA - 0.05, T_KA + 0.72, ease.inOutSine);
    const h = lerp(K.H, -0.3, cutP);
    fillBody.scale.y = Math.max(h, 0.01) / K.H;
    fillBody.visible = h > 0.05;
    cap.position.y = h; cap.visible = h > 0.05;
    cutU.uCut.value = cutP > 0 && cutP < 1 ? KAI.y + h : -100;
    cutRect.position.y = h + 0.2;
    cutRect.progress = ramp(t, T_KA - 0.1, T_KA + 0.2, ease.outCubic);
    cutRect.opacity = (1 - ramp(t, T_KA + 0.62, T_KA + 0.78)) * (cutP > 0 || t > T_KA - 0.1 ? 1 : 0);
    chipMat.uniforms.uCut.value = h; chipMat.uniforms.uTime.value = t;
    chipMat.uniforms.uOn.value = envelope(t, T_KA - 0.05, T_KA + 0.8, 0.1, 0.2);
    chips.visible = chipMat.uniforms.uOn.value > 0.001;

    // ---- camera: one continuous move
    const u = clamp(timeWarp(t, warp), 0, 1);
    posC.getPoint(u, camPos); lookC.getPoint(u, camLook);
    camPos.x += Math.sin(t * 1.4) * 0.15; camPos.y += Math.sin(t * 1.9 + 1) * 0.08;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = lerp(36, 31, ramp(t, T_BR + 0.2, T_TJ + 0.3, ease.inOutSine));
    camera.updateProjectionMatrix();
    sky.position.copy(camera.position); sky.scale.setScalar(3000);

    // shadows follow the monument in view
    const wS = 1 - ramp(t, T_ST + 0.3, T_KA - 0.1), wK = ramp(t, T_ST + 0.3, T_KA - 0.1) * (1 - ramp(t, T_KA + 0.6, T_BR)), wB = ramp(t, T_KA + 0.6, T_BR) * (1 - ramp(t, T_BR + 0.3, T_TJ)), wT = ramp(t, T_BR + 0.3, T_TJ);
    shC.set(0, 0, 0).addScaledVector(V(0, 8, 0), wS).addScaledVector(V(KAI.x, 12, KAI.z), wK).addScaledVector(V(TOWER.x, 20, TOWER.z + 10), wB).addScaledVector(tajW(0, 20, 60), wT);
    setSun(shC, 60 * wS + 85 * wK + 85 * wB + 150 * wT);

    // ---- callouts: world-anchored, facing the camera, constant size on screen
    const fk = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(17.5));
    for (const c of labels) {
      const [a, b] = c.userData.win;
      const p = ramp(t, a, a + 0.32, ease.outCubic), o = 1 - ramp(t, b - 0.15, b);
      c.visible = p > 0 && o > 0;
      if (!c.visible) continue;
      faceCamera(c, camera);
      c.scale.setScalar(camera.position.distanceTo(c.position) * 0.27 * fk * c.userData.k);
      c.reveal(p, o);
    }
    dimG.rotation.set(0, Math.atan2(camera.position.x - dimG.position.x, camera.position.z - dimG.position.z), 0);
    dim66.reveal(ramp(t, T_BR - 0.05, T_BR + 0.4, ease.outCubic), 1 - ramp(t, T_TJ - 0.25, T_TJ - 0.05));
    dimG.visible = t > T_BR - 0.1 && t < T_TJ;

    // ---- lens and grade
    const fd = camera.position.distanceTo(camLook);
    dof.focus = fd; dof.range = Math.max(20, fd * 0.9); dof.amount = 0.1;
    bloom.strength = 0.6 + 0.2 * envelope(t, T_KA, T_KA + 0.8, 0.2, 0.3);
    api.exposure = 1.0;
  }

  api.arSubject = (t) => (t >= T_TJ - 0.2 ? { centre: tajW(0, 30, 0), radius: 75 }
    : t >= T_BR - 0.3 ? { centre: V(TOWER.x, 30, TOWER.z + 10), radius: 50 }
    : t >= T_KA - 0.3 ? { centre: V(KAI.x, 14, KAI.z - 4), radius: 55 }
    : { centre: V(0, 10, 0), radius: 32 });
  void TAJ_PY;
  return api;
}
