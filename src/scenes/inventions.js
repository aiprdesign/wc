// INVENTION (49.5 – 56.0 s) — two centuries of invention, as a gallery. The Western film's counterpart of
// the Indian film's gallery of invention, built from the same kit (india/inventors-assets.js) but its own
// room: cool slate-blue walls, a blue-grey veined marble floor, Carrara-topped plinths with pewter fittings,
// neutral white light. One continuous camera move along nine plinths; an electric-white trace inlaid in the
// floor runs ahead of the camera, branches to each plinth on the beat and climbs its face to the label;
// the plinth's spot comes up, its year glows on the wall behind, and the exhibit wakes:
//   photograph  +0.0  a daguerreotype camera; on the silvered plate Niépce's rooftops develop (1826–27 · 1839)
//   lightBulb   +0.5  a carbon filament warms from red to gold and lights the gallery around it (1878–79)
//   motorwagen  +1.1  the Benz Patent-Motorwagen, 1:4: its horizontal flywheel spins up (1886)
//   cinema      +1.7  the Lumière cinématographe's lamp strikes; through the beam a train arrives (1895)
//   television  +2.5  the tube warms: a dot, a line, the test card (1926–27)
//   laser       +3.5  the helical flash lamp fires, the ruby glows and a red beam strikes the target (1960)
//   gps         +4.1  six orbital planes draw themselves round a GPS satellite; 24 satellites run (1978–95)
//   smartphone  +4.7  the phone wakes and unlocks; the 1994 touchscreen phone lies behind it (2007)
//   mrna        +5.3  the lipid nanoparticle lights, the mRNA runs out of it; the camera pushes into its glow,
//                     which the dissolve hands to the white core of the Shuttle's exhaust (The New Frontier)
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { lerp, ease, ramp, envelope, timeWarp, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { Callout } from '../lib/hud.js';
import { glowSprite } from '../lib/materials.js';
import { segmentsLine } from '../lib/lines.js';
import { Dust } from '../lib/particles.js';
import * as A from './inventions-assets.js';
import * as X from './inventions-models.js';

// Beats, in story seconds from the start of the segment. If the film defines the cue named in CUE_NAMES it
// wins (the score and the timeline own the numbers); otherwise these offsets are used.
export const BEATS = { photograph: 0.0, lightBulb: 0.5, motorwagen: 1.1, cinema: 1.7, television: 2.5, laser: 3.5, gps: 4.1, smartphone: 4.7, mrna: 5.3 };
export const CUE_NAMES = { photograph: 'photograph', lightBulb: 'lightBulb', motorwagen: 'motorwagen', cinema: 'cinema', television: 'television', laser: 'laser', gps: 'gps', smartphone: 'smartphone', mrna: 'mrna' };
export const STORY_LENGTH = 6.5;

const V3 = A.V3;
const ICE = '#dfe9f7', GOLD = '#f0b445', TRACE = '#cfe6ff', SPOT = '#f3f0ea';
const ORDER = Object.keys(BEATS);
// the gallery: one plinth per exhibit (x along the gallery), its label, its year on the wall, AR radius
const EX = [
  { k: 'photograph', x: 0.0, w: 0.62, d: 0.46, h: 0.9, plaque: ['DAGUERREOTYPE CAMERA', 'PARIS · 1839'], year: '1826', r: 0.32 },
  { k: 'lightBulb', x: 1.55, w: 0.34, d: 0.34, h: 1.0, plaque: ['CARBON-FILAMENT LAMP', '1879'], year: '1879', r: 0.22 },
  { k: 'motorwagen', x: 3.4, w: 1.0, d: 0.62, h: 0.6, plaque: ['BENZ PATENT-MOTORWAGEN', '1886 · MODEL AT 1:4'], year: '1886', r: 0.45 },
  { k: 'cinema', x: 5.6, w: 1.08, d: 0.44, h: 0.86, plaque: ['CINÉMATOGRAPHE', 'LUMIÈRE · 1895'], year: '1895', r: 0.5 },
  { k: 'television', x: 7.65, w: 0.6, d: 0.48, h: 0.78, plaque: ['TELEVISION RECEIVER', 'FROM 1926'], year: '1926', r: 0.32 },
  { k: 'laser', x: 9.6, w: 0.8, d: 0.42, h: 0.9, plaque: ['RUBY LASER · 2.5×', 'HUGHES RESEARCH · 1960'], year: '1960', r: 0.38 },
  { k: 'gps', x: 11.35, w: 0.5, d: 0.5, h: 0.55, plaque: ['GPS SATELLITE', '1978 · 1995'], year: '1978', r: 0.55 },
  { k: 'smartphone', x: 12.95, w: 0.5, d: 0.4, h: 1.0, plaque: ['SMARTPHONE', '2007'], year: '2007', r: 0.22 },
  { k: 'mrna', x: 14.6, w: 0.74, d: 0.46, h: 0.9, plaque: ['mRNA VACCINE', '2020'], year: '2020', r: 0.32 },
];
const WALL_Z = -1.6, ZT = 0.8, TRACK_Y = 3.25, TRACK_Z = 1.05;

export function create(ctx, segment) {
  const DUR = segment.end - segment.start;
  const beat = (k) => (CUES[CUE_NAMES[k]] != null ? CUES[CUE_NAMES[k]] - segment.start : BEATS[k]);
  const B = Object.fromEntries(ORDER.map((k) => [k, beat(k)]));
  const SQ = OUTPUT_ASPECT < 1.5;
  const lite = ctx.engine?.quality === 'lite';
  const NX = EX.length;
  const exOf = Object.fromEntries(EX.map((e, i) => [e.k, { ...e, i }]));

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.FogExp2(0x04060a, 0.07);
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.02, 120);
  A.setDetail(lite);
  const M = A.galleryMaterials(ctx.env, lite);

  // ---------------------------------------------------------------- the room (the kit's floor, wall and mouldings)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 14, 1, 1), A.galleryFloor());
  floor.rotation.x = -Math.PI / 2; floor.position.set(7, 0, 5.4); floor.receiveShadow = true; scene.add(floor);
  const WG = A.wallGeometries(-8, 22, WALL_Z, { bay: 3.3, H: 4.4, lite });
  const wall = new THREE.Mesh(WG.wall, A.galleryWall()); wall.receiveShadow = true; scene.add(wall);
  const trim = new THREE.Mesh(WG.trim, M.trim); trim.receiveShadow = true; scene.add(trim);
  scene.add(new THREE.Mesh(WG.brass, M.pewterDark));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vD; void main(){ float h = vD.y; vec3 c = mix(vec3(0.010, 0.013, 0.019), vec3(0.003, 0.004, 0.006), smoothstep(-0.1, 0.5, h)); gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.position.set(7, 1, 0); scene.add(sky);
  scene.add(new THREE.Mesh(A.merge([A.box(22, 0.03, 0.05, [7, TRACK_Y, TRACK_Z]), A.box(22, 0.012, 0.012, [7, TRACK_Y - 0.02, TRACK_Z])]), M.blackAnod));

  // ---------------------------------------------------------------- lights (constant count: no recompiles)
  scene.add(new THREE.HemisphereLight('#2c3a4e', '#06080b', 0.09));
  const rim = new THREE.DirectionalLight('#d6e4ff', 0.75); rim.position.set(12, 9, -6); rim.target.position.set(7, 0.8, 0); scene.add(rim, rim.target);
  const fill = new THREE.DirectionalLight('#ffe4c8', 0.12); fill.position.set(-4, 3, 8); scene.add(fill);
  // two shadow keys leapfrogging along the gallery (even exhibits / odd exhibits)
  const keys = [0, 1].map((i) => {
    const s = new THREE.SpotLight('#f4f1ec', 0, 9, 0.34, 0.75, 1.6);
    s.castShadow = !lite || i === 0; s.shadow.mapSize.set(lite ? 512 : 1024, lite ? 512 : 1024); s.shadow.bias = -0.0002; s.shadow.normalBias = 0.01;
    s.shadow.camera.near = 0.5; s.shadow.camera.far = 6; scene.add(s, s.target); return s;
  });
  // three exhibit spots from the track, handed along (exhibit j uses spot j mod 3)
  const spots = [0, 1, 2].map(() => { const s = new THREE.SpotLight(SPOT, 0, 7, 0.36, 0.85, 1.8); scene.add(s, s.target); return s; });
  // two practical lights the exhibits themselves give (filament, screens, flash, the nanoparticle's glow)
  const prac = [0, 1].map(() => { const p = new THREE.PointLight('#ffb070', 0, 2.5, 2); scene.add(p); return p; });

  // ---------------------------------------------------------------- plinths (merged across the gallery), labels, fixtures
  const body = [], top = [], band = [], plq = [], fixt = [], lensG = [], groove = [], traceG = [], washG = [], yearG = [], shaftG = [];
  const fixPos = [], fixTgt = [];
  const uvRemap = (g, i) => { const [u0, v0, u1, v1] = A.cellUV(i), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + (u1 - u0) * uv.getX(k), v0 + (v1 - v0) * uv.getY(k)); return g; };
  const withAttr = (g, name, v) => { g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; };
  // a flat inlaid trace along a polyline (normals per segment), arc length → aS (0 … 1), branch index → aI
  const tracePoly = (pts, nrm, width, idx, out, y0 = 0) => {
    let L = 0; const acc = [0];
    for (let k = 1; k < pts.length; k++) { L += pts[k].distanceTo(pts[k - 1]); acc.push(L); }
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], dir = b.clone().sub(a).normalize(), sd = new THREE.Vector3().crossVectors(dir, nrm[k]).normalize().multiplyScalar(width / 2), lift = nrm[k].clone().multiplyScalar(y0);
      const ext = dir.clone().multiplyScalar(width * 0.5);
      const p = [a.clone().sub(ext).sub(sd).add(lift), a.clone().sub(ext).add(sd).add(lift), b.clone().add(ext).add(sd).add(lift), b.clone().add(ext).sub(sd).add(lift)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.flatMap((q) => q.toArray()), 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 2, 3].flatMap(() => nrm[k].toArray()), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      g.setAttribute('aS', new THREE.Float32BufferAttribute([acc[k] / L, acc[k] / L, acc[k + 1] / L, acc[k + 1] / L], 1));
      g.setAttribute('aI', new THREE.Float32BufferAttribute([idx, idx, idx, idx], 1));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      out.push(g);
    }
  };
  const UPN = V3(0, 1, 0), FWD = V3(0, 0, 1);
  EX.forEach((e, i) => {
    const PG = A.plinthGeometries(e.w, e.d, e.h);
    body.push(PG.body.translate(e.x, 0, 0)); top.push(PG.top.translate(e.x, 0, 0)); band.push(PG.brass.translate(e.x, 0, 0));
    // the label: blackened steel, tilted back a little; two pewter pins
    const pl = A.rbox(0.22, 0.0688, 0.004, 0.0015); pl.rotateX(-0.12).translate(e.x, e.h - 0.17, e.d / 2 + 0.006);
    plq.push(uvRemap(pl, i));
    for (const sx of [-1, 1]) band.push(A.cyl(0.0032, 0.0032, 0.003, 10, [e.x + sx * 0.1, e.h - 0.17, e.d / 2 + 0.0085], [Math.PI / 2, 0, 0]));
    // the track fixture aimed at the exhibit, its lens
    const fp = V3(e.x - 0.42, TRACK_Y - 0.12, TRACK_Z), ft = V3(e.x, e.h + 0.14, 0);
    fixPos.push(fp); fixTgt.push(ft);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), ft.clone().sub(fp).normalize());
    const mtx = new THREE.Matrix4().compose(fp, q, V3(1, 1, 1));
    fixt.push(A.merge([A.cyl(0.034, 0.029, 0.13, 18, [0, 0.05, 0]), A.cyl(0.036, 0.036, 0.012, 18, [0, -0.012, 0]), A.box(0.012, 0.1, 0.02, [0, 0.14, 0])]).applyMatrix4(mtx));
    lensG.push(withAttr(new THREE.CircleGeometry(0.027, 18).rotateX(Math.PI / 2).translate(0, -0.019, 0).applyMatrix4(mtx), 'aI', i));
    // the faint cone of light in the haze
    if (!lite) {
      const len = ft.distanceTo(fp), cg = new THREE.CylinderGeometry(0.03, 0.34, len, 28, 1, true).translate(0, -len / 2, 0).applyMatrix4(mtx);
      const vh = new Float32Array(cg.attributes.position.count); for (let k = 0; k < vh.length; k++) vh[k] = cg.attributes.uv.getY(k);
      cg.setAttribute('aH', new THREE.BufferAttribute(vh, 1)); shaftG.push(withAttr(cg, 'aI', i));
    }
    // the wash on the wall behind, the year etched above it
    washG.push(withAttr(new THREE.PlaneGeometry(2.4, 3.0).translate(e.x + 0.1, 1.5, WALL_Z + 0.03), 'aI', i));
    yearG.push(withAttr(uvRemap(new THREE.PlaneGeometry(1.15, 0.36).translate(e.x + 0.05, 2.32, WALL_Z + 0.014), i), 'aI', i));
    // the branch: off the main trace at 45°, to the plinth's foot, up its skirt and its face to the label
    const zf = e.d / 2 + 0.11, J = V3(e.x - (ZT - zf), 0, ZT), K = V3(e.x, 0, zf), F0 = V3(e.x, 0, e.d / 2 + 0.026);
    const fl = [J, K, F0], up = [V3(e.x, 0, e.d / 2 + 0.0262), V3(e.x, 0.05, e.d / 2 + 0.0262), V3(e.x, 0.05, e.d / 2 + 0.0016), V3(e.x, e.h - 0.215, e.d / 2 + 0.0016)];
    const all = [...fl, ...up.slice(1)], nr = [UPN, UPN, FWD, UPN, FWD];
    tracePoly(all, nr, 0.007, i, traceG, 0.0012);
    tracePoly(all, nr, 0.016, i, groove, 0.0006);
    // node rings where the branch leaves the main trace
    const ring = new THREE.RingGeometry(0.009, 0.014, 20).rotateX(-Math.PI / 2).translate(J.x, 0.0014, J.z);
    withAttr(ring, 'aS', 0); withAttr(ring, 'aI', i); traceG.push(ring);
  });
  // the main trace, along the whole gallery
  const MX0 = -3, MX1 = 17.5;
  { const pts = [], nrm = []; for (let x = MX0; x <= MX1 + 1e-6; x += 0.5) { pts.push(V3(x, 0, ZT)); nrm.push(UPN); } tracePoly(pts, nrm, 0.007, -1, traceG, 0.0012); tracePoly(pts, nrm, 0.016, -1, groove, 0.0006);
    const p2 = pts.map((p) => p.clone().setZ(ZT + 0.022)); tracePoly(p2, nrm, 0.0028, -1, traceG, 0.0012); }
  const plinthBody = new THREE.Mesh(A.merge(body), M.plinth), plinthTop = new THREE.Mesh(A.merge(top), M.carrara), plinthBand = new THREE.Mesh(A.merge(band), M.pewter);
  for (const m of [plinthBody, plinthTop, plinthBand]) { m.castShadow = m.receiveShadow = true; scene.add(m); }
  const plaqueM = new THREE.MeshStandardMaterial({ map: A.labelAtlas(EX.map((e) => e.plaque)), metalness: 0.55, roughness: 0.38 });
  const plaques = new THREE.Mesh(A.merge(plq), plaqueM); plaques.receiveShadow = true; scene.add(plaques);
  scene.add(new THREE.Mesh(A.merge(fixt), M.blackAnod));
  const grooveMesh = new THREE.Mesh(A.merge(groove), M.pewterDark); grooveMesh.receiveShadow = true; scene.add(grooveMesh);

  // shared per-exhibit wake level (0 … 1) and the trace's progress, read by the glow shaders in the vertex stage
  const onU = { value: new Array(NX).fill(0) }, brU = { value: new Array(NX).fill(0) }, frontU = { value: MX0 }, shU = { value: new Array(NX).fill(0) };
  const idxVS = /* glsl */ `attribute float aI; uniform float uOn[${NX}]; float onOf(){ int i = int(aI + 0.5); return aI < -0.5 ? 1.0 : uOn[i]; }`;
  const glowMat = (frag, extra = {}, vsExtra = '', vsMain = '') => new THREE.ShaderMaterial({
    uniforms: { uOn: onU, ...extra },
    vertexShader: /* glsl */ `${idxVS}\n${vsExtra}\nvarying float vOn; varying vec2 vUv; void main(){ vOn = onOf(); vUv = uv; ${vsMain} gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  // the trace: dim inlay everywhere, lit behind its running front, a hot head at the front
  const traceMat = glowMat(/* glsl */ `uniform vec3 uC; uniform float uP; varying float vOn; varying vec2 vUv; varying float vS, vF;
      void main(){ float lit = step(vS, vF); float head = exp(-max(0.0, vF - vS) * 40.0) * lit * step(vF, 0.999);
        float base = 0.05;
        gl_FragColor = vec4(uC * (base + lit * (0.9 + 0.35 * uP) + head * 3.0), 1.0); }`,
  { uC: { value: new THREE.Color(TRACE) }, uB: brU, uFront: frontU, uP: { value: 0 } },
  /* glsl */ `attribute float aS; uniform float uB[${NX}]; uniform float uFront; varying float vS, vF;`,
  /* glsl */ `vS = aI < -0.5 ? (position.x - ${MX0.toFixed(2)}) / ${(MX1 - MX0).toFixed(2)} : aS; vF = aI < -0.5 ? (uFront - ${MX0.toFixed(2)}) / ${(MX1 - MX0).toFixed(2)} : uB[int(aI + 0.5)];`);
  const traces = new THREE.Mesh(mergeAttrs(traceG, ['position', 'normal', 'uv', 'aS', 'aI']), traceMat); traces.renderOrder = 1; scene.add(traces);
  const lensMat = glowMat(/* glsl */ `varying float vOn; varying vec2 vUv; void main(){ gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * (0.08 + 1.4 * vOn), 1.0); }`);
  lensMat.blending = THREE.NormalBlending; lensMat.transparent = false; lensMat.depthWrite = true;
  scene.add(new THREE.Mesh(mergeAttrs(lensG, ['position', 'normal', 'uv', 'aI']), lensMat));
  const washMat = glowMat(/* glsl */ `uniform vec3 uC; varying float vOn; varying vec2 vUv; void main(){ vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.25); float a = exp(-dot(p, p) * 7.0); gl_FragColor = vec4(uC * a * 0.03 * (0.15 + 0.85 * vOn), 1.0); }`, { uC: { value: new THREE.Color('#c8d8ff') } });
  scene.add(new THREE.Mesh(mergeAttrs(washG, ['position', 'normal', 'uv', 'aI']), washMat));
  const yearMat = glowMat(/* glsl */ `uniform sampler2D uMap; varying float vOn; varying vec2 vUv; void main(){ float a = texture2D(uMap, vUv).a; gl_FragColor = vec4(vec3(0.82, 0.88, 1.0) * a * (0.035 + 0.22 * vOn), 1.0); }`, { uMap: { value: A.yearAtlas(EX.map((e) => e.year)) } });
  scene.add(new THREE.Mesh(mergeAttrs(yearG, ['position', 'normal', 'uv', 'aI']), yearMat));
  if (shaftG.length) {
    const shaftMat = new THREE.ShaderMaterial({
      uniforms: { uS: shU },
      vertexShader: /* glsl */ `attribute float aI, aH; uniform float uS[${NX}]; varying float vS, vH; varying vec3 vN, vV;
        void main(){ vS = uS[int(aI + 0.5)]; vH = aH; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `varying float vS, vH; varying vec3 vN, vV;
        void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float along = pow(clamp(vH, 0.0, 1.0), 1.3) * smoothstep(0.0, 0.1, 1.0 - vH);
          gl_FragColor = vec4(vec3(0.92, 0.95, 1.0) * f * along * vS, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const sh = new THREE.Mesh(mergeAttrs(shaftG, ['position', 'normal', 'uv', 'aI', 'aH']), shaftMat); sh.renderOrder = 6; scene.add(sh);
  }

  // ---------------------------------------------------------------- the exhibits
  const ex = {};
  const place = (k, obj) => { const e = exOf[k]; obj.group.position.set(e.x, e.h, 0); scene.add(obj.group); ex[k] = { ...obj, e }; return ex[k]; };
  const dag = place('photograph', X.buildDaguerre(M));
  const bulb = place('lightBulb', X.buildBulb(M));
  const car = place('motorwagen', X.buildMotorwagen(M, lite));
  const cine = place('cinema', X.buildCinema(M));
  const tv = place('television', X.buildTV(M));
  const las = place('laser', X.buildLaser(M, lite));
  const gps = place('gps', X.buildGPS(M, lite));
  const phone = place('smartphone', X.buildPhone(M));
  const rna = place('mrna', X.buildMRNA(M, lite));
  scene.updateMatrixWorld(true);
  const W = (k, v) => ex[k].group.localToWorld(v.clone());

  // glows
  const bulbGlow = glowSprite({ color: '#ffb36a', intensity: 1.6, scale: 0.12 }); bulbGlow.position.copy(bulb.anchors.filament); bulb.group.add(bulbGlow);
  const cineGlow = glowSprite({ color: '#fff0d8', intensity: 1.5, scale: 0.05 }); cineGlow.position.copy(cine.anchors.lens); cine.group.add(cineGlow);
  const laserFlash = glowSprite({ color: '#dfe8ff', intensity: 2.5, scale: 0.25 }); laserFlash.position.copy(las.anchors.lamp); las.group.add(laserFlash);
  const laserSpot = glowSprite({ color: '#ff2a2a', intensity: 3.5, scale: 0.05 }); laserSpot.position.copy(las.beamTo).add(V3(-0.004, 0, 0)); las.group.add(laserSpot);
  const rnaGlow = glowSprite({ color: '#ff9ad8', intensity: 1.2, scale: 0.34 }); rnaGlow.position.copy(rna.NP); rna.group.add(rnaGlow);
  // the laser beam: a hot core and a soft halo (additive cylinders along x)
  const beamLen = las.beamTo.x - las.beamFrom.x;
  const beamMat = (c, i) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const beamCore = new THREE.Mesh(A.cyl(0.0012, 0.0012, beamLen, 8, [las.beamFrom.x + beamLen / 2, las.beamFrom.y, 0], [0, 0, Math.PI / 2]), beamMat('#ff3030', 4));
  const beamHalo = new THREE.Mesh(A.cyl(0.006, 0.006, beamLen, 12, [las.beamFrom.x + beamLen / 2, las.beamFrom.y, 0], [0, 0, Math.PI / 2]), beamMat('#ff2020', 0.35));
  las.group.add(beamCore, beamHalo);
  // GPS: six orbital planes (55°, 60° apart) round the satellite, revealed in turn; four satellites in each
  const ORB_R = 0.5, orbC = V3(0, gps.CY, 0);
  const orbitQ = Array.from({ length: 6 }, (_, k) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0.96, k * Math.PI / 3, 0, 'YXZ')));
  const ringGeos = orbitQ.map((q, k) => { const g = new THREE.TorusGeometry(ORB_R, 0.0011, 3, lite ? 96 : 160).rotateX(Math.PI / 2).applyQuaternion(q).translate(orbC.x, orbC.y, orbC.z); const n = g.attributes.position.count, a = new Float32Array(n), r = new Float32Array(n).fill(k), uv = g.attributes.uv; for (let i = 0; i < n; i++) a[i] = uv.getX(i); g.setAttribute('aU', new THREE.BufferAttribute(a, 1)); g.setAttribute('aR', new THREE.BufferAttribute(r, 1)); return g; });
  const orbRev = { value: new Array(6).fill(0) };
  const orbMat = new THREE.ShaderMaterial({
    uniforms: { uRev: orbRev, uC: { value: new THREE.Color('#9fd0ff') } },
    vertexShader: /* glsl */ `attribute float aU, aR; uniform float uRev[6]; varying float vU, vR; void main(){ vU = aU; vR = uRev[int(aR + 0.5)]; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uC; varying float vU, vR; void main(){ if (vU > vR) discard; float head = exp(-(vR - vU) * 30.0) * step(vR, 0.999); gl_FragColor = vec4(uC * (0.55 + 2.5 * head), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const orbits = new THREE.Mesh(mergeAttrs(ringGeos, ['position', 'normal', 'uv', 'aU', 'aR']), orbMat); orbits.renderOrder = 5; gps.group.add(orbits);
  const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.0055, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8ecff').multiplyScalar(3), toneMapped: false }), 24);
  dots.frustumCulled = false; gps.group.add(dots);
  const _dm = new THREE.Matrix4(), _dv = V3();
  // the mRNA's glow
  scene.updateMatrixWorld(true);

  // dust in the light
  const dust = new Dust({ count: lite ? 600 : 1500, size: [19, 2.6, 2.6], center: [7.4, 1.4, 0.3], particleSize: 0.006, color: '#e6eeff', opacity: 0.38, intensity: 1.05, seed: 1826 });
  scene.add(dust);

  // ---------------------------------------------------------------- the trace's front: reaches each junction just before its beat
  const junctionX = (e) => e.x - (ZT - (e.d / 2 + 0.11));
  const frontKeys = [[-0.6, junctionX(EX[0]) - 1.6], ...EX.map((e) => [B[e.k] - 0.2, junctionX(e)]), [DUR + 0.6, MX1]];
  const onAt = (k) => B[k] - 0.06;   // the branch has climbed the plinth: the exhibit wakes

  // ---------------------------------------------------------------- HUD (open-matte aware; captions bottom-left, as the film's other chapters)
  const hud = ctx.makeHUD();
  const HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y + 0.1);
  const nextB = (k) => { const i = ORDER.indexOf(k); return i < ORDER.length - 1 ? B[ORDER[i + 1]] : DUR - 0.2; };
  const CAPS = [
    { k: 'photograph', main: 'PHOTOGRAPHY · NIÉPCE 1826–27 · DAGUERRE 1839', sub: 'THE OLDEST SURVIVING CAMERA PHOTOGRAPH · THE DAGUERREOTYPE' },
    { k: 'lightBulb', main: 'ELECTRIC LIGHT · SWAN 1878 · EDISON 1879', sub: 'A CARBON FILAMENT GLOWING IN A VACUUM' },
    { k: 'motorwagen', main: 'AUTOMOBILE · BENZ PATENT-MOTORWAGEN · 1886', sub: "BERTHA BENZ'S 106 KM DRIVE, 1888" },
    { k: 'cinema', main: 'CINEMA · LUMIÈRE BROTHERS · PARIS 1895', sub: 'THE FIRST PAID PUBLIC SCREENING · 28 DECEMBER 1895' },
    { k: 'television', main: 'TELEVISION · BAIRD 1926 · FARNSWORTH 1927', sub: 'ALSO TAKAYANAGI, JAPAN, 1926' },
    { k: 'laser', main: 'LASER · MAIMAN · HUGHES RESEARCH · 1960', sub: 'THE FIRST LASER · A RUBY CRYSTAL · 16 MAY 1960' },
    { k: 'gps', main: 'GPS · FIRST SATELLITE 1978 · FULL CONSTELLATION 1995', sub: '24 SATELLITES · SIX ORBITAL PLANES · 20,200 KM UP' },
    { k: 'smartphone', main: 'SMARTPHONE · 2007 · (BEFORE IT: IBM SIMON, 1994)', sub: 'PHONE, CAMERA, MAP AND COMPUTER IN ONE POCKET' },
    { k: 'mrna', main: 'mRNA VACCINES · 2020 · KARIKÓ & WEISSMAN, NOBEL 2023', sub: 'MODIFIED mRNA, CARRIED INTO CELLS BY LIPID NANOPARTICLES' },
  ];
  const tpLeft = (txt, o, x, y) => { const tp = new TextPlane(txt, o); tp.position.set(x + tp.worldWidth / 2, y, 0); tp.opacity = 0; hud.scene.add(tp); return tp; };
  const caps = CAPS.map((c, i) => ({
    ...c, a: B[c.k] + 0.04, b: nextB(c.k) - 0.03,
    m: tpLeft(c.main, { font: FONTS.mono, weight: 500, height: 0.04 * UI, letterSpacing: 0.3, color: '#f3f6fb', intensity: 1.15 }, HX(0.16), HY(-0.78)),
    s: tpLeft(c.sub, { font: FONTS.mono, weight: 300, height: 0.024 * UI, letterSpacing: 0.26, color: ICE, intensity: 0.85 }, HX(0.165), HY(-0.838)),
    n: tpLeft(`0${i + 1}`, { font: FONTS.mono, weight: 500, height: 0.026 * UI, letterSpacing: 0.2, color: GOLD, intensity: 1.3 }, HX(0.16), HY(-0.715)),
  }));
  const idxOf = tpLeft('/ 09  INVENTION', { font: FONTS.mono, weight: 300, height: 0.022 * UI, letterSpacing: 0.3, color: ICE, intensity: 0.75 }, HX(0.16) + 0.06 * UI, HY(-0.715));
  const RAIL_W = 0.95 * UI, RAIL_X = HX(0.16), RAIL_Y = HY(-0.895);
  const rail = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: '#8ea6c6', intensity: 0.55, orderFn: () => 0, stagger: 0 });
  const railTicks = segmentsLine(EX.map((_, i) => { const x = RAIL_X + RAIL_W * i / 8; return [V3(x, RAIL_Y - 0.01 * UI, 0), V3(x, RAIL_Y + 0.01 * UI, 0)]; }), { color: '#cfe0f5', intensity: 0.8, orderFn: (a, b, i) => i / 9, stagger: 0.7 });
  const railFill = segmentsLine([[V3(RAIL_X, RAIL_Y, 0), V3(RAIL_X + RAIL_W, RAIL_Y, 0)]], { color: GOLD, intensity: 1.4, orderFn: () => 0, stagger: 0 });
  const railDot = new THREE.Mesh(new THREE.CircleGeometry(0.009 * UI, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.2), toneMapped: false, transparent: true }));
  hud.scene.add(rail, railTicks, railFill, railDot);
  const CS = 0.03 * UI;
  const mkCall = (label, sub, dx, dy) => { const c = new Callout(label, { dx: dx * UI, dy: dy * UI, size: CS, color: ICE, intensity: 1.2, sub }); hud.scene.add(c); c.visible = false; return c; };
  const CALLS = [
    { c: mkCall('SILVERED COPPER PLATE', 'THE IMAGE DEVELOPED IN MERCURY VAPOUR', -0.24, 0.16), k: 'photograph', at: dag.anchors.plate, a: 0.1, b: B.lightBulb - 0.04 },
    { c: mkCall('CARBON FILAMENT', 'IN AN EVACUATED GLASS BULB', 0.24, 0.15), k: 'lightBulb', at: bulb.anchors.filament, a: B.lightBulb + 0.12, b: B.motorwagen - 0.04 },
    { c: mkCall('HORIZONTAL FLYWHEEL', '954 CC · 0.75 HP · 16 KM/H', -0.26, 0.17), k: 'motorwagen', at: car.anchors.flywheel, a: B.motorwagen + 0.1, b: B.cinema - 0.04 },
    { c: mkCall('TILLER STEERING', null, 0.22, 0.14), k: 'motorwagen', at: car.anchors.tiller, a: B.motorwagen + 0.2, b: B.cinema - 0.04 },
    { c: mkCall('CAMERA, PRINTER AND PROJECTOR IN ONE', '16 FRAMES A SECOND · HAND-CRANKED', -0.22, 0.2), k: 'cinema', at: cine.anchors.box, a: B.cinema + 0.1, b: B.television - 0.04 },
    { c: mkCall('THE ARRIVAL OF A TRAIN', 'LA CIOTAT · FIRST SHOWN IN 1896', 0.2, 0.17), k: 'cinema', at: cine.anchors.screen, a: B.cinema + 0.35, b: B.television - 0.04 },
    { c: mkCall('CATHODE-RAY TUBE', 'AN ELECTRON BEAM PAINTS THE PICTURE', -0.25, 0.17), k: 'television', at: tv.anchors.screen, a: B.television + 0.25, b: B.laser - 0.05 },
    { c: mkCall('RUBY ROD · HELICAL FLASH LAMP', 'LIGHT AMPLIFIED BETWEEN SILVERED ENDS', -0.24, 0.2), k: 'laser', at: las.anchors.ruby, a: B.laser + 0.12, b: B.gps - 0.05 },
    { c: mkCall('DEEP RED · 694 NM', null, 0.2, 0.14), k: 'laser', at: las.anchors.target, a: B.laser + 0.3, b: B.gps - 0.05 },
    { c: mkCall('TWELVE-HELIX L-BAND ARRAY', 'TIMING SIGNALS FROM ATOMIC CLOCKS', 0.24, 0.17), k: 'gps', at: gps.anchors.array, a: B.gps + 0.12, b: B.smartphone - 0.05 },
    { c: mkCall('MULTI-TOUCH SCREEN', null, -0.22, 0.15), k: 'smartphone', at: phone.anchors.screen, a: B.smartphone + 0.14, b: B.mrna - 0.05 },
    { c: mkCall('IBM SIMON · 1994', 'THE FIRST TOUCHSCREEN SMARTPHONE', 0.22, 0.17), k: 'smartphone', at: phone.anchors.old, a: B.smartphone + 0.2, b: B.mrna - 0.05 },
    { c: mkCall('LIPID NANOPARTICLE', 'CARRIES THE mRNA INTO CELLS', -0.26, 0.17), k: 'mrna', at: rna.anchors.lnp, a: B.mrna + 0.12, b: DUR - 0.45 },
    { c: mkCall('mRNA', 'THE RECIPE FOR ONE PROTEIN', 0.22, -0.12), k: 'mrna', at: rna.anchors.strand, a: B.mrna + 0.35, b: DUR - 0.45 },
  ];

  // ---------------------------------------------------------------- camera plan: one continuous move (arrive on the beat, drift, glide on)
  const F = (k, dx = 0, dy = 0, dz = 0) => W(k, ex[k].anchors.focus).add(V3(dx, dy, dz));
  const P = (k, dx, dy, dz) => { const e = exOf[k]; return V3(e.x + dx, e.h + dy, dz); };
  const CAMP = {
    photograph: [[-0.4, 0.28, 0.92], [0.12, 0.25, 0.84], [-0.06, 0, 0], [0.04, 0, 0]],
    lightBulb: [[-0.3, 0.33, 0.72], [0.06, 0.3, 0.64], [-0.02, 0, 0], [0.02, 0, 0]],
    motorwagen: [[-0.55, 0.44, 1.06], [0.22, 0.38, 1.0], [-0.06, 0, 0], [0.06, 0, 0]],
    cinema: [[-0.5, 0.32, 1.08], [0.24, 0.3, 1.1], [-0.14, 0, 0], [0.16, 0.02, 0]],
    television: [[-0.42, 0.24, 0.98], [0.14, 0.21, 0.88], [-0.03, 0, 0], [0.03, 0, 0]],
    laser: [[-0.5, 0.3, 0.88], [0.16, 0.25, 0.8], [-0.08, 0, 0], [0.08, 0, 0]],
    gps: [[-0.5, 0.64, 1.18], [0.12, 0.6, 1.12], [-0.03, 0, 0], [0.03, 0, 0]],
    smartphone: [[-0.26, 0.24, 0.62], [0.06, 0.2, 0.54], [-0.01, 0, 0], [0.02, 0, 0]],
    mrna: [[-0.36, 0.3, 0.84], [-0.1, 0.26, 0.6], [-0.04, 0, 0], [0.02, 0, 0]],
  };
  const CAM = [];
  ORDER.forEach((k, i) => {
    const [a, d, la, ld] = CAMP[k];
    CAM.push([i === 0 ? -0.6 : B[k] + 0.07, P(k, ...a), F(k, ...la)]);
    if (i < ORDER.length - 1) CAM.push([B[ORDER[i + 1]] - 0.14, P(k, ...d), F(k, ...ld)]);
  });
  // the end: push into the nanoparticle's glowing heart, through the opening, for the dissolve
  const lnpW = W('mrna', rna.NP), cutW = V3(0.35, 0.45, 1).normalize();
  CAM.push([B.mrna + 0.55, P('mrna', ...CAMP.mrna[1]), lnpW.clone().add(V3(-0.02, -0.02, 0))]);
  CAM.push([DUR + 0.1, lnpW.clone().addScaledVector(cutW, 0.11).add(V3(-0.01, -0.005, 0)), lnpW.clone().add(V3(0.005, 0.0, 0))]);
  const camK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[1][c]]));
  const lookK = ['x', 'y', 'z'].map((c) => CAM.map((e) => [e[0], e[2][c]]));
  const focusOf = (t) => { let k = ORDER[0]; for (const q of ORDER) if (t >= B[q] - 0.14) k = q; return k; };
  const lastOf = (list, t, lead) => { let r = list[0]; for (const j of list) if (t >= B[EX[j].k] - lead) r = j; return r; };

  // ---------------------------------------------------------------- HUD projection (through the delivered lens)
  const tmp3 = V3();
  const projHud = (world, out) => {
    tmp3.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const m = FILM_ASPECT / OUTPUT_ASPECT;
    const tv2 = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (m > 1.0001 ? Math.pow(m, 0.85) : 1), th = tv2 * OUTPUT_ASPECT;
    const z = Math.max(1e-3, -tmp3.z);
    out.set((tmp3.x / (z * th)) * FILM_ASPECT, (tmp3.y / (z * tv2)) * HH, 0);
    return out;
  };
  const camPos = V3(), look = V3(), tmp = V3(), tmp2 = V3(), _a = V3(), _b = V3();
  const distToSeg = (p, a, b) => { _a.copy(b).sub(a); const u = Math.min(1, Math.max(0, _b.copy(p).sub(a).dot(_a) / _a.lengthSq())); return _b.copy(a).addScaledVector(_a, u).distanceTo(p); };
  const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const colTmp = new THREE.Color();
  // filament colour from a rough black body: dull red → orange → warm gold
  const filCol = (u, out) => out.setRGB(1.0, 0.18 + 0.5 * u * u, 0.03 + 0.22 * u * u * u);

  const api = {
    scene, camera, hud, dof: { focus: 1.0, range: 0.6, amount: 0.3 }, bloom: { strength: 0.75 }, exposure: 1, harmony: 0.85, background: 0x030406,
    exploreLimits: { yaw: 1.1, pitchDown: 0.45, pitchUp: 0.6, zoomIn: 0.12, zoomOut: 2.6 },
    arSubject: (t) => { const k = focusOf(t), e = exOf[k]; return { centre: k === 'gps' ? W('gps', orbC) : F(k), radius: e.r }; },
    update(t, info) {
      const T = info?.T ?? t + segment.start;
      const bp = pulse(T, { decay: 6 });

      // -------- camera
      const tc = Math.min(Math.max(t, -0.6), DUR + 0.1);
      camPos.set(timeWarp(tc, camK[0]), timeWarp(tc, camK[1]), timeWarp(tc, camK[2]));
      look.set(timeWarp(tc, lookK[0]), timeWarp(tc, lookK[1]), timeWarp(tc, lookK[2]));
      const calm = 1 - ramp(t, B.mrna + 0.4, DUR, ease.inOutSine);
      camPos.y += Math.sin(t * 1.1) * 0.005 * calm; camPos.x += Math.sin(t * 0.7 + 1) * 0.007 * calm;
      camera.position.copy(camPos);
      camera.up.set(Math.sin(t * 0.8) * 0.01 * calm, 1, 0).normalize();
      camera.lookAt(look);
      camera.fov = 32 - 4 * ramp(t, B.mrna + 0.3, DUR + 0.1, ease.inQuad);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // -------- the trace, the plinths waking, spots, shafts
      frontU.value = timeWarp(Math.min(Math.max(t, -0.6), DUR + 0.6), frontKeys);
      traceMat.uniforms.uP.value = bp;
      EX.forEach((e, i) => {
        const b0 = B[e.k] - 0.2;
        brU.value[i] = ramp(t, b0, onAt(e.k), ease.inOutSine);
        const on = ramp(t, onAt(e.k), onAt(e.k) + 0.2, ease.outCubic), flash = envelope(t, onAt(e.k), onAt(e.k) + 0.4, 0.04, 0.3);
        onU.value[i] = on + 0.8 * flash;
        const sd = distToSeg(camera.position, fixPos[i], fixTgt[i]);
        shU.value[i] = 0.014 * (0.15 + 0.85 * on) * ramp(sd, 0.5, 1.5, ease.linear);
      });
      for (let s = 0; s < 3; s++) {
        const list = EX.map((_, j) => j).filter((j) => j % 3 === s), j = lastOf(list, t, 0.6), e = EX[j];
        const sp = spots[s]; sp.position.copy(fixPos[j]); sp.target.position.copy(fixTgt[j]);
        sp.intensity = 7 * (0.12 + 0.88 * Math.min(1, onU.value[j]));
      }
      keys[0].intensity = keys[1].intensity = 0;
      ORDER.forEach((k, i) => {
        const s = keys[i % 2], nxt = ORDER[i + 1], a = B[k] - 0.2, b = nxt ? B[nxt] + 0.12 : DUR + 1;
        if (t >= a - 0.2 && t < b) {
          const e = exOf[k];
          s.position.set(e.x - 0.9, e.h + 1.7, 1.25); s.target.position.set(e.x, e.h + 0.12, 0);
          s.intensity = 3.6 * envelope(t, a, b, 0.18, 0.18);
        }
      });

      // -------- 1 · the daguerreotype develops
      dag.dev.uDev.value = ramp(t, B.photograph + 0.04, B.photograph + 0.5, ease.inOutSine);

      // -------- 2 · the filament warms; the practical light
      const fU = ramp(t, B.lightBulb - 0.05, B.lightBulb + 0.22, ease.inOutSine), flick = 1 + 0.03 * Math.sin(T * 50) * fU;
      filCol(fU, colTmp); bulb.filM.emissive.copy(colTmp).multiplyScalar((0.4 + 9 * fU * fU) * flick * ramp(t, B.lightBulb - 0.1, B.lightBulb - 0.02));
      bulbGlow.visible = fU > 0.01; bulbGlow.material.color.copy(colTmp).multiplyScalar(1.6 * fU * fU * flick); bulbGlow.scale.setScalar(0.06 + 0.08 * fU);

      // -------- 3 · the flywheel spins up (angle = integral of a ramping speed: pure in t)
      const ts = Math.max(0, t - B.motorwagen), spinA = ts < 0.5 ? 4 * TAU * ts * ts : 4 * TAU * (0.25 + (ts - 0.5));
      car.flywheel.rotation.y = -spinA;
      car.car.position.y = ts > 0 ? 0.00035 * Math.sin(T * 90) * Math.min(1, ts * 3) : 0;

      // -------- 4 · the cinématographe: the lamp strikes, the crank turns, the train arrives
      const lampOn = ramp(t, B.cinema - 0.12, B.cinema - 0.02), flk = 0.88 + 0.12 * h1(Math.floor(T * 16 * 1.3889));
      cine.filmU.uT.value = t; cine.filmU.uOn.value = lampOn * (0.94 + 0.06 * flk); cine.filmU.uP.value = ramp(t, B.cinema, B.cinema + 1.0, ease.linear);
      cine.beamU.uI.value = 0.05 * lampOn * flk; cine.beamU.uT.value = t;
      cine.glowM.color.set('#ff9a4a').multiplyScalar(0.05 + 2.5 * lampOn);
      cineGlow.visible = lampOn > 0.01; cineGlow.material.opacity = lampOn * flk;
      const crankA = Math.max(0, t - B.cinema) * 2 * TAU;
      cine.crank.rotation.z = -crankA; cine.reel.rotation.z = crankA * 0.35;

      // -------- 5 · the tube warms
      tv.scrU.uOn.value = ramp(t, B.television - 0.05, B.television + 0.42, ease.linear); tv.scrU.uT.value = t;

      // -------- 6 · the flash lamp fires, the ruby lases
      const fl = t - B.laser;
      const flashE = fl > -0.02 ? Math.exp(-Math.max(0, fl) * 9) * ramp(t, B.laser - 0.02, B.laser + 0.005) : 0;
      const lase = fl > 0.02 ? (0.75 + 0.25 * h1(Math.floor(T * 30))) * Math.min(1, (fl - 0.02) / 0.03) : 0;
      las.lampM.emissive.set('#dfe8ff').multiplyScalar(0.05 + 6 * flashE + 0.25 * lase);
      las.rubyM.emissive.set('#ff1030').multiplyScalar(0.02 + 1.6 * lase + 2.5 * flashE);
      laserFlash.visible = flashE > 0.01; laserFlash.material.opacity = flashE; laserFlash.scale.setScalar(0.12 + 0.2 * flashE);
      beamCore.visible = beamHalo.visible = laserSpot.visible = lase > 0;
      beamCore.material.opacity = beamHalo.material.opacity = lase; laserSpot.material.opacity = lase; laserSpot.scale.setScalar(0.03 + 0.012 * Math.sin(T * 60));

      // -------- 7 · the constellation draws itself; satellites run
      for (let k = 0; k < 6; k++) orbRev.value[k] = ramp(t, B.gps - 0.04 + k * 0.06, B.gps + 0.38 + k * 0.06, ease.inOutCubic);
      for (let k = 0; k < 24; k++) {
        const pl = k % 6, slot = Math.floor(k / 6), u = slot / 4 + pl * 0.04 + Math.max(0, t - B.gps) * 0.28;
        const vis = orbRev.value[pl] > (u % 1) || orbRev.value[pl] >= 0.999;
        _dv.set(Math.cos(u * TAU) * ORB_R, 0, -Math.sin(u * TAU) * ORB_R).applyQuaternion(orbitQ[pl]).add(orbC);
        _dm.makeTranslation(_dv.x, _dv.y, _dv.z); if (!vis || t < B.gps - 0.04) _dm.scale(_dv.set(0, 0, 0));
        dots.setMatrixAt(k, _dm);
      }
      dots.instanceMatrix.needsUpdate = true;
      gps.sat.rotation.y = -0.25 + 0.08 * Math.sin(t * 0.6);

      // -------- 8 · the phone wakes and unlocks
      phone.scrU.uOn.value = ramp(t, B.smartphone - 0.04, B.smartphone + 0.08); phone.scrU.uMix.value = ramp(t, B.smartphone + 0.25, B.smartphone + 0.45, ease.inOutSine); phone.scrU.uT.value = t;
      phone.lcdM.emissiveIntensity = 0.03 + 0.08 * ramp(t, onAt('smartphone'), onAt('smartphone') + 0.2);

      // -------- 9 · the nanoparticle lights; the mRNA runs out; the glow swells for the dissolve
      const rOn = ramp(t, B.mrna - 0.06, B.mrna + 0.2, ease.outCubic), swell = ramp(t, B.mrna + 0.5, DUR, ease.inQuad);
      rna.headM.emissive.set('#3fb6d0').multiplyScalar(0.02 + 0.32 * rOn + 0.6 * swell);
      rna.shellM.emissive.set('#1c6b80').multiplyScalar(0.02 + 0.3 * rOn + 0.5 * swell);
      rna.coreM.emissive.set('#ff4fa8').multiplyScalar(0.02 + 0.5 * rOn + 2.5 * swell);
      rna.strandU.uRev.value = 0.42 * ramp(t, B.mrna - 0.04, B.mrna + 0.12) + 0.58 * ramp(t, B.mrna + 0.1, B.mrna + 0.7, ease.inOutSine);
      rna.strandU.uI.value = 0.15 + 1.6 * rOn + 2.5 * swell; rna.strandU.uT.value = t;
      rnaGlow.visible = rOn > 0.01; rnaGlow.material.opacity = rOn; rnaGlow.scale.setScalar(0.18 + 0.12 * rOn + 0.5 * swell);
      rna.lnp.rotation.y = 0;

      // -------- practical lights: [bulb, tv, phone] on 0; [cinema, laser, mRNA] on 1
      {
        const p0 = prac[0], j0 = lastOf([1, 4, 7], t, 0.45), k0 = EX[j0].k;
        if (k0 === 'lightBulb') { p0.position.copy(W('lightBulb', bulb.anchors.filament)); filCol(fU, p0.color); p0.intensity = 0.16 * fU * fU * flick; p0.distance = 2.5; }
        else if (k0 === 'television') { p0.position.copy(W('television', tv.anchors.screen).add(V3(0.06, -0.02, 0.12))); p0.color.set('#c8dcff'); p0.intensity = 0.05 * ramp(t, B.television + 0.3, B.television + 0.5); }
        else { p0.position.copy(W('smartphone', phone.anchors.screen).add(V3(0, 0.02, 0.08))); p0.color.set('#a6c4ff'); p0.intensity = 0.012 * phone.scrU.uOn.value; }
        const p1 = prac[1], j1 = lastOf([3, 5, 8], t, 0.45), k1 = EX[j1].k;
        if (k1 === 'cinema') { p1.position.copy(W('cinema', cine.anchors.screen).add(V3(-0.1, -0.04, 0.05))); p1.color.set('#fff0dc'); p1.intensity = 0.04 * lampOn * flk; }
        else if (k1 === 'laser') { p1.position.copy(W('laser', las.anchors.lamp).add(V3(0, 0.03, 0.06))); p1.color.copy(colTmp.set('#dfe8ff').lerp(new THREE.Color('#ff2a2a'), 1 - flashE)); p1.intensity = 0.6 * flashE + 0.03 * lase; }
        else { p1.position.copy(W('mrna', rna.NP).add(V3(0, 0, 0.12))); p1.color.set('#ff8fd0'); p1.intensity = 0.03 * rOn + 0.2 * swell; }
      }

      // -------- captions, the index rail and call-outs
      for (const c of caps) {
        const e = envelope(t, c.a - 0.01, c.b, 0.06, 0.1, ease.linear), p = ramp(t, c.a, c.a + 0.22, ease.outCubic);
        c.m.opacity = e; c.m.reveal = p;
        c.s.opacity = e * 0.9; c.s.reveal = ramp(t, c.a + 0.06, c.a + 0.32, ease.outCubic);
        c.n.opacity = e; c.n.reveal = ramp(t, c.a, c.a + 0.12);
      }
      const on = envelope(t, -0.2, DUR - 0.35, 0.15, 0.2);
      idxOf.opacity = on * 0.8; idxOf.reveal = ramp(t, 0.0, 0.4);
      rail.progress = ramp(t, -0.05, 0.4, ease.outCubic); rail.opacity = on;
      railTicks.progress = ramp(t, 0.0, 0.45); railTicks.opacity = on;
      let pos = 0;
      for (const k of ORDER) pos += ramp(t, B[k] - 0.12, B[k] + 0.08, ease.inOutCubic);
      pos = Math.max(0, pos - 1) / 8;
      railFill.progress = Math.max(0.0001, pos); railFill.opacity = on;
      railDot.position.set(RAIL_X + RAIL_W * pos, RAIL_Y, 0); railDot.material.opacity = on * (0.6 + 0.4 * bp);
      for (const q of CALLS) {
        const op = envelope(t, q.a, q.b, 0.06, 0.08), p = ramp(t, q.a, q.a + 0.25, ease.outCubic);
        tmp2.copy(ex[q.k].group.localToWorld(tmp.copy(q.at)));
        projHud(tmp2, q.c.position); q.c.reveal(p, op); q.c.visible = op > 0.001 && tmp3.z < 0;
      }

      // -------- atmosphere, lens
      dust.tick(t, info);
      const fk = focusOf(t), fp = t > B.mrna + 0.4 ? lnpW : F(fk);
      api.dof.focus = camera.position.distanceTo(fp); api.dof.range = 0.4 + 0.25 * api.dof.focus; api.dof.amount = 0.3 * (1 - swell);
      api.bloom.strength = 0.75 + 0.2 * flashE + 0.12 * envelope(t, B.lightBulb, B.lightBulb + 0.5, 0.1, 0.3) + 0.5 * swell;
      api.exposure = 1.0 + 0.25 * swell * swell;
    },
  };
  return api;
}

// merge geometries keeping the named attributes (all must carry them)
function mergeAttrs(geos, keys) {
  const list = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; return n; });
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const size = list[0].attributes[k].itemSize, total = list.reduce((s, g) => s + g.attributes[k].count, 0), arr = new Float32Array(total * size);
    let o = 0; for (const g of list) { if (!g.attributes[k]) throw new Error(`inventions: missing ${k}`); arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
