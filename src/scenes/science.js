// SCIENTIFIC REVOLUTION (20.0–25.0 s)
// Technique: scientific visualisation + speed ramping + assembly animation + light/refraction.
//   Shot 1  20.0–21.4  a polished brass sphere hangs almost frozen (timeWarp speed ramp), its ballistic
//                      trajectory drawn as a glowing curve with strobe ghosts, vectors and equations.
//   Shot 2  21.4–22.3  the camera pulls back through brass instruments that assemble around it
//                      (telescope, armillary sphere, gear train, orbital diagrams); the fall accelerates.
//   Shot 3  22.3–23.9  swoop down with the falling sphere into a rotating brass orrery, flying between its arms.
//   Shot 4  23.9–25.0  the orrery's sun fires a white beam into a glass prism → a spectral fan that sweeps
//                      left→right across frame into the 'spectrum' wipe.
import * as THREE from 'three';
import { CUES } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, smootherstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { progressTube, progressLine, segmentsLine, circlePoints } from '../lib/lines.js';
import { glowSprite } from '../lib/materials.js';
import { Dust } from '../lib/particles.js';
import { manuscriptTexture } from '../lib/textures.js';
import { gearGeometry, meshAngle, brassMat, latheTexture } from './industrial-gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Equation typesetting: runs of [text, 'n' | 'sub' | 'sup'] rendered to one canvas (the web-font
// subsets have no subscript digits, so we typeset them ourselves). Returns a TextPlane.
function equation(runs, { height = 0.1, color = '#ffd9a0', intensity = 1.4, font = FONTS.serif, italic = true, weight = 500, letterSpacing = 0.02 } = {}) {
  const size = 160, pad = Math.round(size * 0.35);
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const fontOf = (k) => `${italic ? 'italic ' : ''}${weight} ${k === 'n' ? size : Math.round(size * 0.58)}px "${font}"`;
  const widthOf = (t, k) => { ctx.font = fontOf(k); return ctx.measureText(t).width + t.length * letterSpacing * size; };
  const W = Math.ceil(runs.reduce((s, [t, k]) => s + widthOf(t, k ?? 'n'), 0) + pad * 2);
  const H = Math.ceil(size * 1.5 + pad);
  c.width = W; c.height = H;
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  let x = pad; const base = H / 2 + size * 0.3;
  for (const [t, k0] of runs) {
    const k = k0 ?? 'n';
    ctx.font = fontOf(k);
    const y = k === 'sub' ? base + size * 0.2 : k === 'sup' ? base - size * 0.42 : base;
    for (const ch of t) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + letterSpacing * size; }
  }
  const tp = new TextPlane(' ', { height, color, intensity });
  tp.material.uniforms.uMap.value.dispose();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  tp.material.uniforms.uMap.value = tex;
  const k = height / size;
  tp.geometry.dispose();
  tp.geometry = new THREE.PlaneGeometry(W * k, H * k);
  tp.worldWidth = W * k; tp.worldHeight = H * k;
  return tp;
}

function planetTexture(kind, seed = 1) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d'); const r = rng(seed);
  if (kind === 'jupiter' || kind === 'saturn') {
    const cols = kind === 'jupiter' ? ['#d8c3a0', '#b8875a', '#e9dcc4', '#9c6b45', '#d4b08a'] : ['#e6d4a8', '#cbb07a', '#efe2bf', '#b89a66'];
    for (let y = 0; y < 128; y += 2) { x.fillStyle = cols[Math.floor((Math.sin(y * 0.19 + r() * 0.6) * 0.5 + 0.5) * cols.length) % cols.length]; x.fillRect(0, y, 256, 2); }
    if (kind === 'jupiter') { x.fillStyle = 'rgba(170,80,50,0.8)'; x.beginPath(); x.ellipse(170, 80, 18, 8, 0, 0, TAU); x.fill(); }
  } else if (kind === 'earth') {
    x.fillStyle = '#1d3f6e'; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) { x.fillStyle = r() > 0.4 ? '#5a7a46' : '#a08c62'; x.beginPath(); x.ellipse(r() * 256, 20 + r() * 88, 8 + r() * 26, 5 + r() * 14, r() * 3, 0, TAU); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.fillRect(0, 0, 256, 8); x.fillRect(0, 120, 256, 8);
  } else {
    const base = { mercury: [150, 145, 140], venus: [226, 205, 160], mars: [182, 92, 58], moon: [170, 170, 165] }[kind];
    x.fillStyle = `rgb(${base})`; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 180; i++) { const l = 0.75 + r() * 0.4; x.fillStyle = `rgba(${base.map((v) => Math.min(255, v * l)).join(',')},0.6)`; x.beginPath(); x.arc(r() * 256, r() * 128, 1 + r() * 7, 0, TAU); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.05, 200);
  const cue = (n) => CUES[n] - segment.start;
  const tFall = cue('fallStart'), tInst = cue('instruments'), tOrr = cue('orrery'), tBeam = cue('prismBeam'), tSpec = cue('spectrum');
  const DUR = segment.end - segment.start;

  scene.environment = ctx.env;
  scene.environmentIntensity = 0.4;
  scene.fog = new THREE.FogExp2(0x060403, 0.035);
  const BG = 0x040302;

  // ---- lights --------------------------------------------------------------
  const key = new THREE.DirectionalLight('#ffd6a6', 2.4); key.position.set(-5, 7, 6); scene.add(key);
  const rim = new THREE.DirectionalLight('#fff1dc', 3.2); rim.position.set(4, 3, -7); scene.add(rim);
  const under = new THREE.DirectionalLight('#6a4a2a', 0.6); under.position.set(0, -6, 3); scene.add(under);

  // ---- world anchors -------------------------------------------------------
  // ballistic path: P(τ) = P0 + V0 τ + ½ G τ²   (τ = warped physical time)
  const P0 = V(-2.0, 1.2, 0), V0 = V(1.5, 0.5, 0), G = V(0, -2.1, 0);
  const fallPos = (tau, out) => out.copy(P0).addScaledVector(V0, tau).addScaledVector(G, 0.5 * tau * tau);
  const fallVel = (tau, out) => out.copy(V0).addScaledVector(G, tau);
  const tauKeys = [[0, -0.012], [tFall, 0], [tInst, 0.24], [2.0, 0.9], [2.5, 2.0], [3.0, 3.35], [3.6, 5.2]];
  const tauAt = (t) => timeWarp(t, tauKeys);

  const O = V(1.9, -7.9, -1.6);          // orrery base centre
  const S = O.clone().add(V(0, 1.35, 0)); // sun
  const P = S.clone().add(V(4.8, -0.05, 2.0)); // prism
  const beamDir = P.clone().sub(S).setY(0).normalize();
  const beamPerp = V(-beamDir.z, 0, beamDir.x).multiplyScalar(-1); // toward camera side (+z-ish)
  if (beamPerp.z < 0) beamPerp.multiplyScalar(-1);

  // ---- backdrop: faint astronomical manuscript ink + dust ------------------
  const inkTex = manuscriptTexture({ kind: 'astronomy', seed: 4, ink: 'rgba(255,220,160,0.9)', transparent: true });
  const inkTex2 = manuscriptTexture({ kind: 'geometry', seed: 9, ink: 'rgba(255,220,160,0.9)', transparent: true });
  const backMat = (tex, k) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#ffcf8a').multiplyScalar(k), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const back1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), backMat(inkTex, 0.07)); back1.position.set(-1, 0.5, -7); scene.add(back1);
  const back2 = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), backMat(inkTex2, 0.05)); back2.position.set(6, -1.5, -8); back2.rotation.z = 0.3; scene.add(back2);
  const back3 = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), backMat(inkTex, 0.05)); back3.position.copy(S).add(V(1, 1, -8)); back3.rotation.z = -0.4; scene.add(back3);
  const dustA = new Dust({ count: 1800, size: [12, 9, 12], center: [0, 0, 1.5], particleSize: 0.012, opacity: 0.55, intensity: 1.4, color: '#ffdcae', seed: 21 });
  const dustB = new Dust({ count: 1600, size: [12, 6, 10], center: [S.x + 1.5, S.y, S.z + 1], particleSize: 0.014, opacity: 0.5, intensity: 1.3, color: '#ffe2b8', seed: 22 });
  scene.add(dustA, dustB);

  // ---- hero: polished brass sphere ------------------------------------------
  const sphereMat = new THREE.MeshPhysicalMaterial({ color: '#c99a55', metalness: 1, roughness: 0.14, clearcoat: 0.4, clearcoatRoughness: 0.12, envMapIntensity: 0.75 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 96, 64), sphereMat);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.0035, 8, 128), new THREE.MeshStandardMaterial({ color: '#3a2610', metalness: 1, roughness: 0.4 }));
  ball.add(band); band.rotation.x = Math.PI / 2 - 0.35;
  scene.add(ball);

  // trajectory curve (arc-length table so the drawing front sits exactly on the sphere)
  const TMIN = -0.35, TMAX = 5.4, NS = 700;
  const trajPts = [], arc = new Float32Array(NS + 1), tauS = new Float32Array(NS + 1);
  for (let i = 0; i <= NS; i++) { const tau = TMIN + ((TMAX - TMIN) * i) / NS; tauS[i] = tau; trajPts.push(fallPos(tau, new THREE.Vector3())); if (i) arc[i] = arc[i - 1] + trajPts[i].distanceTo(trajPts[i - 1]); }
  const arcTotal = arc[NS];
  const arcFrac = (tau) => { const f = clamp((tau - TMIN) / (TMAX - TMIN), 0, 1) * NS; const i = Math.min(NS - 1, Math.floor(f)); return lerp(arc[i], arc[i + 1], f - i) / arcTotal; };
  const trajCurve = new THREE.CatmullRomCurve3(trajPts);
  const traj = progressTube(trajCurve, { radius: 0.0045, segments: 1400, radial: 6, color: '#ffc27a', intensity: 1.35 });
  const trajGlow = progressTube(trajCurve, { radius: 0.018, segments: 700, radial: 6, color: '#ff9a4a', intensity: 0.18, opacity: 0.5 });
  scene.add(traj, trajGlow);
  // predicted continuation: dashed
  const dashSegs = [];
  for (let i = 0; i < NS; i += 6) dashSegs.push([trajPts[i], trajPts[Math.min(NS, i + 3)]]);
  const dashed = segmentsLine(dashSegs, { color: '#ffd9a0', intensity: 0.8, opacity: 0.35, orderFn: (a, b, i) => i / dashSegs.length, stagger: 0.98 });
  scene.add(dashed);

  // strobe ghosts (multi-exposure photograph of the fall)
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffc98a') }, uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))),2.2); gl_FragColor = vec4(uColor*(0.03+f*1.1), uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ghostGeo = new THREE.SphereGeometry(0.2, 32, 24);
  const GH = 24, ghostDT = 0.25, ghosts = [];
  for (let k = 1; k <= GH; k++) {
    const g = new THREE.Mesh(ghostGeo, ghostMat.clone());
    fallPos(k * ghostDT, g.position); g.userData.tau = k * ghostDT;
    scene.add(g); ghosts.push(g);
  }
  // time-stamp ticks at the first ghosts (visible in the macro shot)
  const stampLabels = [];
  for (let k = 1; k <= 0; k++) {
    const lbl = new TextPlane(`t = ${(k * ghostDT).toFixed(2)} s`, { font: FONTS.mono, height: 0.022, letterSpacing: 0.12, color: '#ffdcb0', intensity: 1.0 });
    fallPos(k * ghostDT, lbl.position).add(V(0, -0.29, 0.02)); lbl.userData.tau = k * ghostDT;
    scene.add(lbl); stampLabels.push(lbl);
  }

  // vectors on the sphere: v (velocity) and g (gravity)
  function arrow(color, intensity) {
    const grp = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false, transparent: true, fog: false });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 1, 8).translate(0, 0.5, 0), m);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.035, 12).translate(0, 0.0175, 0), m);
    grp.add(shaft, head); grp.userData = { shaft, head, m };
    grp.setLen = (L) => { shaft.scale.y = Math.max(0.001, L); head.position.y = L; };
    return grp;
  }
  const vArrow = arrow('#ffe6b8', 2.2), gArrow = arrow('#ff9a4a', 2.2);
  scene.add(vArrow, gArrow);
  const vLbl = equation([['v']], { height: 0.07, intensity: 1.8, color: '#ffe6b8' });
  const gLbl = equation([['g']], { height: 0.07, intensity: 1.8, color: '#ffb070' });
  scene.add(vLbl, gLbl);

  // equations
  const eqS = equation([['s = '], ['½'], [' g t'], ['2', 'sup']], { height: 0.085, intensity: 1.6 });
  const eqA = equation([['a = dv / dt']], { height: 0.06, intensity: 1.4 });
  const eqF = equation([['F = G '], ['m', 'n'], ['1', 'sub'], [' m'], ['2', 'sub'], [' / r'], ['2', 'sup']], { height: 0.2, intensity: 1.5 });
  const eqK = equation([['T'], ['2', 'sup'], [' ∝ a'], ['3', 'sup']], { height: 0.13, intensity: 1.3 });
  const capS = new TextPlane('GALILEO · DISCORSI · 1638', { font: FONTS.mono, height: 0.02, letterSpacing: 0.3, color: '#ffdcb0', intensity: 0.9 });
  const capF = new TextPlane('NEWTON · PRINCIPIA MATHEMATICA · 1687', { font: FONTS.mono, height: 0.045, letterSpacing: 0.3, color: '#ffdcb0', intensity: 0.9 });
  const capK = new TextPlane('KEPLER · HARMONICES MUNDI · 1619', { font: FONTS.mono, height: 0.034, letterSpacing: 0.3, color: '#ffdcb0', intensity: 0.8 });
  fallPos(0.02, eqS.position).add(V(-0.12, 0.25, 0.05)); capS.position.copy(eqS.position).add(V(0, -0.075, 0));
  fallPos(0.3, eqA.position).add(V(0.2, -0.3, 0.06));
  eqF.position.set(-0.9, -0.75, 0.6); capF.position.copy(eqF.position).add(V(0, -0.17, 0));
  eqK.position.copy(S).add(V(-1.6, 1.05, 1.2)); capK.position.copy(eqK.position).add(V(0, -0.12, 0));
  const labels3D = [eqS, eqA, eqF, eqK, capS, capF, capK, vLbl, gLbl, ...stampLabels];
  labels3D.forEach((l) => scene.add(l));

  // ---- instruments (assembly) ----------------------------------------------
  const brass = brassMat({ roughness: 0.26 });
  const brassPolish = brassMat({ roughness: 0.14, color: '#d8b072' });
  const brassLathe = brassMat({ roughness: 0.3, lathe: true });
  const bronzeDark = new THREE.MeshStandardMaterial({ color: '#6b4524', metalness: 1, roughness: 0.42 });
  const leather = new THREE.MeshStandardMaterial({ color: '#2a1a10', metalness: 0.1, roughness: 0.6 });
  const lensMat = new THREE.MeshPhysicalMaterial({ color: '#a8c8d0', metalness: 0, roughness: 0.02, transmission: 0.2, clearcoat: 1, envMapIntensity: 2.5, transparent: true, opacity: 0.85 });
  const parts = [];
  const R = rng(77);
  function addPart(mesh, group, delay, spread = 1.6) {
    group.add(mesh);
    const dir = V(R() - 0.5, R() - 0.5, -0.3 - R() * 0.7).normalize();
    parts.push({
      mesh, delay,
      p1: mesh.position.clone(), q1: mesh.quaternion.clone(), s1: mesh.scale.clone(),
      p0: mesh.position.clone().addScaledVector(dir, spread * (0.6 + R() * 0.8)),
      q0: new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 4, (R() - 0.5) * 4, (R() - 0.5) * 4)).multiply(mesh.quaternion),
    });
    return mesh;
  }

  // (a) refracting telescope, upper-left foreground
  const scope = new THREE.Group(); scope.position.set(-2.0, 0.75, 2.6); scope.rotation.set(0.1, 0.35, 0.34); scene.add(scope);
  {
    const along = (m, x) => { m.rotation.z = -Math.PI / 2; m.position.x = x; return m; };
    addPart(along(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 1.3, 48, 1, true), leather), 0.1), scope, 0.0);
    addPart(along(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.5, 48), brassPolish), 0.95), scope, 0.08);
    addPart(along(new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.5, 40), brass), -0.75), scope, 0.14);
    addPart(along(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.18, 32), brassPolish), -1.08), scope, 0.2);
    for (let i = 0; i < 5; i++) addPart(along(new THREE.Mesh(new THREE.TorusGeometry(0.088 + (i === 4 ? 0.014 : 0), 0.012, 12, 48).rotateY(Math.PI / 2), brassPolish), -0.52 + i * 0.3), scope, 0.1 + i * 0.04, 1.6);
    const lens = along(new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.02, 48), lensMat), 1.2);
    addPart(lens, scope, 0.3, 1.2);
  }
  // (b) armillary sphere, right
  const armil = new THREE.Group(); armil.position.set(3.0, 0.05, 2.0); armil.rotation.set(0.25, -0.5, 0.1); scene.add(armil);
  const armRings = [];
  {
    const RR = 0.72;
    const ring = (r, tube, m) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 128), m);
    const specs = [[RR, 0.02, 0, 0, 0], [RR, 0.02, Math.PI / 2, 0, 0], [RR * 0.97, 0.016, Math.PI / 2, 0, 0.41], [RR * 0.97, 0.013, 0, Math.PI / 2, 0], [RR * 0.8, 0.011, Math.PI / 2, 0, 0], [RR * 0.8, 0.011, Math.PI / 2, 0, 0]];
    specs.forEach(([r, tb, rx, ry, rz], i) => {
      const m = ring(r, tb, i % 2 ? brassPolish : brass);
      m.rotation.set(rx, ry, rz);
      if (i === 4) m.position.y = RR * 0.4; if (i === 5) m.position.y = -RR * 0.4;
      if (i === 4 || i === 5) m.scale.setScalar(Math.sqrt(1 - 0.16) / 0.8 * 0.8 / 0.8);
      addPart(m, armil, 0.05 + i * 0.06, 2.2); armRings.push(m);
    });
    const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, RR * 2.5, 12), brassPolish); axis.rotation.z = 0.41;
    addPart(axis, armil, 0.02);
    const earth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), new THREE.MeshStandardMaterial({ map: planetTexture('earth', 3), roughness: 0.6, metalness: 0.1 }));
    addPart(earth, armil, 0.0, 1.0);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 24), bronzeDark); stem.position.y = -RR - 0.3;
    addPart(stem, armil, 0.3);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, 0.12, 48), brass); foot.position.y = -RR - 0.62;
    addPart(foot, armil, 0.35);
    // engraved ticks on the equator ring
    const tk = [];
    for (let i = 0; i < 72; i++) { const a = (i / 72) * TAU, l = i % 6 === 0 ? 0.06 : 0.03; tk.push([V(Math.cos(a) * RR * 1.03, 0, Math.sin(a) * RR * 1.03), V(Math.cos(a) * (RR * 1.03 + l), 0, Math.sin(a) * (RR * 1.03 + l))]); }
    armil.userData.ticks = segmentsLine(tk, { color: '#ffd28a', intensity: 1.2, orderFn: (a, b, i) => i / 72, stagger: 0.9 });
    armil.add(armil.userData.ticks);
  }
  // (c) gear train, lower-left
  const gearGrp = new THREE.Group(); gearGrp.position.set(-2.2, -1.25, 2.6); gearGrp.rotation.set(-0.15, 0.35, 0.1); scene.add(gearGrp);
  const gA = { z: 30, m: 0.03 }, gB = { z: 14, m: 0.03 }, gC = { z: 20, m: 0.03 };
  const gearA = new THREE.Mesh(gearGeometry({ teeth: gA.z, module: gA.m, thickness: 0.06, bevel: 0.006, bore: 0.05, spokes: 6 }), brassLathe);
  const gearB = new THREE.Mesh(gearGeometry({ teeth: gB.z, module: gB.m, thickness: 0.07, bevel: 0.006, bore: 0.04, spokes: 0 }), brassMat({ roughness: 0.2, color: '#d9b77a', lathe: true }));
  const gearC = new THREE.Mesh(gearGeometry({ teeth: gC.z, module: gC.m, thickness: 0.05, bevel: 0.005, bore: 0.04, spokes: 5 }), brassLathe);
  const dAB = (gA.z + gB.z) * gA.m / 2, dirAB = 0.35, dAC = (gA.z + gC.z) * gA.m / 2, dirAC = 2.6;
  gearB.position.set(Math.cos(dirAB) * dAB, Math.sin(dirAB) * dAB, 0);
  gearC.position.set(Math.cos(dirAC) * dAC, Math.sin(dirAC) * dAC, -0.01);
  const gearSpin = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  [gearA, gearB, gearC].forEach((g, i) => { gearSpin[i].position.copy(g.position); g.position.set(0, 0, 0); gearSpin[i].add(g); addPart(gearSpin[i], gearGrp, 0.1 + i * 0.1, 2.0); });
  // (d) orbital diagrams drawn in the background
  const diag = new THREE.Group(); diag.position.set(0.6, 0.2, -2.2); scene.add(diag);
  const ell = (a, b, rot) => { const pts = []; for (let i = 0; i <= 160; i++) { const th = (i / 160) * TAU; pts.push(V(Math.cos(th) * a - Math.sqrt(a * a - b * b), Math.sin(th) * b, 0).applyAxisAngle(V(0, 0, 1), rot)); } return pts; };
  const diagLines = [
    progressLine(ell(2.6, 1.7, 0.3), { color: '#e8b56a', intensity: 0.7, head: 0.03 }),
    progressLine(ell(1.6, 1.25, 0.3), { color: '#e8b56a', intensity: 0.6, head: 0.03 }),
    progressLine(circlePoints(3.4, 180), { color: '#e8b56a', intensity: 0.35, head: 0.03 }),
  ];
  diagLines.forEach((l) => diag.add(l));
  const diagTicks = [];
  for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, l = i % 10 === 0 ? 0.18 : 0.08; diagTicks.push([V(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0), V(Math.cos(a) * (3.4 + l), Math.sin(a) * (3.4 + l), 0)]); }
  const diagTk = segmentsLine(diagTicks, { color: '#e8b56a', intensity: 0.5, orderFn: (a, b, i) => i / 120, stagger: 0.9 });
  diag.add(diagTk);
  const focusDot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28a').multiplyScalar(2.5), transparent: true, toneMapped: false })); diag.add(focusDot);

  // ---- orrery ---------------------------------------------------------------
  const orrery = new THREE.Group(); orrery.position.copy(O); scene.add(orrery);
  const hs = S.y - O.y;
  {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.28, 96), bronzeDark); plinth.position.y = -0.14; orrery.add(plinth);
    const plinthRim = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.03, 12, 128), brassPolish); plinthRim.rotation.x = Math.PI / 2; orrery.add(plinthRim);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, hs, 24), brassPolish); column.position.y = hs / 2; orrery.add(column);
  }
  // base gearing (flat): crown gear + pinions
  const crown = new THREE.Mesh(gearGeometry({ teeth: 56, module: 0.036, thickness: 0.05, bevel: 0.006, bore: 0.08, spokes: 8 }), brassLathe);
  const crownSpin = new THREE.Group(); crownSpin.position.y = 0.05; crownSpin.rotation.x = -Math.PI / 2; crownSpin.add(crown); orrery.add(crownSpin);
  const pinions = [];
  for (let i = 0; i < 3; i++) {
    const pz = 14, dir = (i / 3) * TAU + 0.4, d = (56 + pz) * 0.036 / 2;
    const pg = new THREE.Mesh(gearGeometry({ teeth: pz, module: 0.036, thickness: 0.07, bevel: 0.006, bore: 0.03, spokes: 0 }), brassMat({ roughness: 0.2, color: '#dcb97c', lathe: true }));
    const grp = new THREE.Group(); grp.position.set(Math.cos(dir) * d, 0.06, -Math.sin(dir) * d); grp.rotation.x = -Math.PI / 2; grp.add(pg); orrery.add(grp);
    pinions.push({ grp, pz, dir });
  }
  // sun
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 5 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uI; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ float mu = abs(dot(normalize(vN), normalize(vV)));
        float g = 0.85 + 0.15*sin(vP.x*60.0+sin(vP.y*50.0)*2.0)*sin(vP.z*55.0);
        vec3 c = mix(vec3(1.0,0.45,0.12), vec3(1.0,0.9,0.7), pow(mu,0.7));
        gl_FragColor = vec4(c*uI*(0.45+0.55*mu)*g, 1.0); }`,
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 64, 48), sunMat); sun.position.copy(S); scene.add(sun);
  const sunGlow = glowSprite({ color: '#ffc98a', intensity: 0.55, scale: 1.7 }); sunGlow.position.copy(S); scene.add(sunGlow);
  const sunGlow2 = glowSprite({ color: '#ff9a4a', intensity: 0.16, scale: 5 }); sunGlow2.position.copy(S); scene.add(sunGlow2);
  const sunLight = new THREE.PointLight('#ffcf98', 0, 14, 2); sunLight.position.copy(S); scene.add(sunLight);
  // planets
  const PL = [
    { r: 0.75, s: 0.05, k: 'mercury', h: 0.18 }, { r: 1.1, s: 0.075, k: 'venus', h: 0.3 }, { r: 1.5, s: 0.082, k: 'earth', h: 0.42, moon: true },
    { r: 1.95, s: 0.062, k: 'mars', h: 0.54 }, { r: 2.5, s: 0.17, k: 'jupiter', h: 0.66 }, { r: 3.1, s: 0.14, k: 'saturn', h: 0.78, ring: true },
  ];
  const pr = rng(31);
  PL.forEach((p, i) => {
    const grp = new THREE.Group(); grp.position.y = 0; orrery.add(grp);
    const armY = hs - 0.95 + i * 0.1;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, p.r, 10), brass); arm.rotation.z = Math.PI / 2; arm.position.set(p.r / 2, armY, 0); grp.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, hs - armY, 10), brassPolish); post.position.set(p.r, (hs + armY) / 2, 0); grp.add(post);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 24), brassPolish); collar.position.y = armY; grp.add(collar);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(p.s, 48, 32), new THREE.MeshStandardMaterial({ map: planetTexture(p.k, i + 5), roughness: 0.55, metalness: 0.05 }));
    planet.position.set(p.r, hs, 0); grp.add(planet);
    if (p.ring) { const rg = new THREE.Mesh(new THREE.RingGeometry(p.s * 1.35, p.s * 2.2, 64), new THREE.MeshStandardMaterial({ color: '#d8c08a', roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })); rg.rotation.x = -Math.PI / 2 + 0.45; planet.add(rg); }
    if (p.moon) { const mg = new THREE.Group(); mg.position.copy(planet.position); grp.add(mg); const mn = new THREE.Mesh(new THREE.SphereGeometry(0.025, 24, 16), new THREE.MeshStandardMaterial({ map: planetTexture('moon', 9), roughness: 0.8 })); mn.position.x = 0.17; mg.add(mn); const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), brass); rod.rotation.z = Math.PI / 2; rod.position.x = 0.085; mg.add(rod); p.moonGrp = mg; }
    p.grp = grp; p.phase = pr() * TAU; p.w = 1.25 * Math.pow(p.r, -1.5);
  });
  // orbit rings (glowing lines) with ticks
  const orbitLines = [], orbitTicks = [];
  PL.forEach((p, i) => {
    const l = progressLine(circlePoints(p.r, 200, { plane: 'xz' }), { color: '#f0c070', intensity: 0.75, head: 0.02 });
    l.position.y = hs; orrery.add(l); orbitLines.push(l);
    const seg = [], n = 36;
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU, L = k % 3 === 0 ? 0.07 : 0.035; seg.push([V(Math.cos(a) * p.r, 0, Math.sin(a) * p.r), V(Math.cos(a) * (p.r + L), 0, Math.sin(a) * (p.r + L))]); }
    const t = segmentsLine(seg, { color: '#f0c070', intensity: 0.8, orderFn: (a, b, k) => k / n, stagger: 0.85 });
    t.position.y = hs; orrery.add(t); orbitTicks.push(t);
  });
  const zodiac = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.022, 10, 256), brass); zodiac.rotation.x = Math.PI / 2; zodiac.position.y = hs - 0.02; orrery.add(zodiac);
  const zodiacLabels = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU; const lb = new TextPlane(`${i * 30}°`, { font: FONTS.mono, height: 0.07, letterSpacing: 0.1, color: '#ffd9a0', intensity: 0.9 });
    lb.position.set(Math.cos(a) * 3.62, hs, Math.sin(a) * 3.62); lb.rotation.set(-Math.PI / 2, 0, -a - Math.PI / 2); orrery.add(lb); zodiacLabels.push(lb);
  }

  // ---- prism & light --------------------------------------------------------
  const prism = new THREE.Group(); prism.position.copy(P); prism.rotation.y = -Math.atan2(beamDir.z, beamDir.x); scene.add(prism);
  const side = 0.9, hgt = side * Math.sqrt(3) / 2;
  const triA = new THREE.Vector2(-side / 2, -hgt / 2), triB = new THREE.Vector2(side / 2, -hgt / 2), triC = new THREE.Vector2(0, hgt / 2);
  const triShape = new THREE.Shape([triA, triB, triC]);
  const prismGeo = new THREE.ExtrudeGeometry(triShape, { depth: 0.8, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
  prismGeo.translate(0, 0, -0.4);
  const glassMat = new THREE.MeshPhysicalMaterial({ fog: false, color: '#ffffff', metalness: 0, roughness: 0.0, transmission: 1, thickness: 0.35, ior: 1.52, transparent: true, envMapIntensity: 0.45, specularIntensity: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.02, attenuationColor: new THREE.Color('#dfefff'), attenuationDistance: 3 });
  const prismMesh = new THREE.Mesh(prismGeo, glassMat); prism.add(prismMesh);
  const prismEdges = new THREE.LineSegments(new THREE.EdgesGeometry(prismGeo, 30), new THREE.LineBasicMaterial({ color: new THREE.Color('#fff4e6').multiplyScalar(0.9), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  prism.add(prismEdges);
  const prismFres = new THREE.Mesh(prismGeo, new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uO; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(normalize(vN),normalize(vV))),4.0); gl_FragColor = vec4(vec3(0.85,0.92,1.0)*f*0.45*uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  prism.add(prismFres);
  // plinth for the prism (brass stand)
  const pstand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.4, 20), brassPolish); pstand.position.y = -hgt / 2 - 0.72; prism.add(pstand);
  const pfoot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.06, 48), brass); pfoot.position.y = -hgt / 2 - 1.42; prism.add(pfoot);
  const pcradle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 0.05, 32), brassPolish); pcradle.position.y = -hgt / 2 - 0.035; prism.add(pcradle);
  // ray geometry in prism-local coordinates
  const yIn = -0.04;
  const E = V(-side / 2 + ((yIn + hgt / 2) / hgt) * (side / 2), yIn, 0);
  const yOut = -0.13;
  const X = V(((hgt / 2 - yOut) / hgt) * (side / 2), yOut, 0);
  const Ew = E.clone(); prism.updateMatrixWorld(); prism.localToWorld(Ew);
  const beam = progressTube(new THREE.LineCurve3(S.clone(), Ew), { radius: 0.009, segments: 64, color: '#fff6ea', intensity: 4.0 });
  const beamHalo = progressTube(new THREE.LineCurve3(S.clone(), Ew), { radius: 0.05, segments: 64, color: '#ffe6c8', intensity: 0.4, opacity: 0.45 });
  const inner = progressTube(new THREE.LineCurve3(E.clone(), X.clone()), { radius: 0.012, segments: 16, color: '#ffffff', intensity: 4 });
  prism.add(inner);
  scene.add(beam, beamHalo);
  const entryGlow = glowSprite({ color: '#fff4e0', intensity: 2, scale: 0.6 }); entryGlow.position.copy(E); prism.add(entryGlow);
  const exitGlow = glowSprite({ color: '#ffffff', intensity: 1.5, scale: 0.4 }); exitGlow.position.copy(X); prism.add(exitGlow);
  // spectral fan: vertex shader places vertices from uniforms (angles, length) — pure function of t
  const FU = 96, FD = 24;
  const fanGeo = new THREE.BufferGeometry();
  {
    const uvs = [], idx = [];
    for (let j = 0; j <= FD; j++) for (let i = 0; i <= FU; i++) uvs.push(i / FU, j / FD);
    for (let j = 0; j < FD; j++) for (let i = 0; i < FU; i++) { const a = j * (FU + 1) + i, b = a + 1, c = a + FU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    fanGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(uvs.length / 2 * 3), 3));
    fanGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fanGeo.setIndex(idx);
  }
  const fanMat = new THREE.ShaderMaterial({
    uniforms: { uA0: { value: -0.3 }, uA1: { value: -0.5 }, uLen: { value: 0 }, uMax: { value: 9 }, uI: { value: 1.6 }, uApex: { value: X.clone() }, uO: { value: 1 } },
    vertexShader: `uniform float uA0, uA1, uLen, uMax; uniform vec3 uApex; varying vec2 vUv; varying float vD;
      void main(){ vUv = uv; float a = mix(uA0, uA1, uv.x); float d = uv.y * uMax; vD = d;
        vec3 p = uApex + vec3(cos(a), sin(a), 0.0) * d; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform float uLen, uMax, uI, uO; varying vec2 vUv; varying float vD;
      vec3 spec(float x){ // x: 0 red → 1 violet, roughly equal-luminance
        vec3 c = clamp(abs(mod(x*0.8*6.0 + vec3(0.0,4.0,2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        c += vec3(0.35,0.0,0.25) * smoothstep(0.82, 1.0, x);
        return c / (0.25 + dot(c, vec3(0.2126,0.7152,0.0722)) * 1.5); }
      void main(){
        if (vD > uLen) discard;
        float front = smoothstep(uLen, uLen - 0.35, vD);
        float edge = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
        float bands = 0.35 + 0.65 * pow(0.5 + 0.5*cos((vUv.x - 0.5/7.0) * 6.2831 * 7.0), 6.0);
        float near = 1.0 + 1.5 * exp(-vD * 3.0);
        float fall = 1.0 / (1.0 + vD * 0.12);
        vec3 c = spec(vUv.x) * bands * near * fall * uI * edge * front * (1.0 + 2.0 * smoothstep(uLen - 0.35, uLen, vD));
        gl_FragColor = vec4(c * uO, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const fan = new THREE.Mesh(fanGeo, fanMat); fan.frustumCulled = false; prism.add(fan);
  const lamRed = new TextPlane('λ 700 nm', { font: FONTS.mono, height: 0.045, letterSpacing: 0.2, color: '#ffb8a0', intensity: 1.2 });
  const lamVio = new TextPlane('λ 400 nm', { font: FONTS.mono, height: 0.045, letterSpacing: 0.2, color: '#c8b8ff', intensity: 1.2 });
  const capO = new TextPlane('NEWTON · OPTICKS · 1704', { font: FONTS.mono, height: 0.04, letterSpacing: 0.3, color: '#fff0dc', intensity: 1.0 });
  const eqN = equation([['n = sin θ'], ['1', 'sub'], [' / sin θ'], ['2', 'sub']], { height: 0.1, intensity: 1.4, color: '#fff0dc' });
  prism.add(lamRed, lamVio, capO, eqN);
  eqN.position.set(-1.05, 0.34, 0.05); capO.position.set(-1.05, 0.22, 0.05);

  // ---- HUD: chapter-like experiment captions --------------------------------
  const hud = ctx.makeHUD();
  const hudItems = [
    [new TextPlane('EXPERIMENTUM I · DE MOTU CORPORUM', { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#ffe0b8', intensity: 0.95, align: 'left' }), 0.35, 1.9],
    [new TextPlane('EXPERIMENTUM II · SYSTEMA MUNDI', { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#ffe0b8', intensity: 0.95, align: 'left' }), 2.35, 3.8],
    [new TextPlane('EXPERIMENTUM III · DE LUCE ET COLORIBUS', { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#fff0e0', intensity: 0.95, align: 'left' }), 3.9, 5.2],
  ];
  const hudRule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(0.8), transparent: true, toneMapped: false }));
  hud.scene.add(hudRule);
  hudItems.forEach(([tp]) => { tp.position.set(-ctx.aspect + 0.16 + tp.worldWidth / 2, 0.84, 0); hud.scene.add(tp); });

  // ---- camera rig -----------------------------------------------------------
  function makePath(keys) {
    const curve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
    return (t, out) => curve.getPoint(clamp(timeWarp(t, warp), 0, 1), out);
  }
  const d0 = beamPerp.clone();
  const camEnd = P.clone().addScaledVector(d0, 3.0).addScaledVector(beamDir, 0.85).add(V(0, 0.28, 0));
  const tgtEnd = P.clone().addScaledVector(beamDir, 1.25).add(V(0, -0.22, 0));
  const camPath = makePath([
    [1.3, V(-1.55, 1.33, 1.9)],
    [1.95, V(0.2, 0.45, 7.0)],
    [2.3, V(0.65, 0.2, 7.7)],
    [2.75, S.clone().add(V(-4.4, 1.7, 4.6))],
    [3.15, S.clone().add(V(-2.35, 0.42, 1.85))],
    [3.5, S.clone().add(V(0.7, 0.32, 2.8))],
    [3.9, S.clone().add(V(2.9, 0.38, 3.7))],
    [4.4, camEnd.clone().addScaledVector(beamDir, -0.35).addScaledVector(d0, 0.25)],
    [5.0, camEnd.clone().addScaledVector(beamDir, 0.25).addScaledVector(d0, -0.1)],
  ]);
  const tgtPath = makePath([
    [1.3, V(-1.45, 1.22, 0)],
    [1.95, V(0.05, -0.45, 0)],
    [2.3, V(0.3, -0.9, 0)],
    [2.75, S.clone().add(V(-0.3, -0.35, 0))],
    [3.15, S.clone()],
    [3.5, S.clone().add(V(0.4, 0, 0.1))],
    [3.9, S.clone().lerp(P, 0.7)],
    [4.4, tgtEnd.clone().addScaledVector(beamDir, -0.2)],
    [5.0, tgtEnd.clone().addScaledVector(beamDir, 0.35)],
  ]);

  // ---- per-frame scratch ----------------------------------------------------
  const tmpA = V(0, 0, 0), tmpB = V(0, 0, 0), ballPos = V(0, 0, 0), vel = V(0, 0, 0), camPos = V(0, 0, 0), camTgt = V(0, 0, 0);
  const Y = V(0, 1, 0), qTmp = new THREE.Quaternion(), down = V(0, -1, 0);
  const dof = { focus: 1.3, range: 0.6, amount: 0.6 };
  const bloom = { strength: 0.55 };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const tau = tauAt(t);
    fallPos(tau, ballPos);
    fallVel(tau, vel);
    ball.position.copy(ballPos);
    ball.rotation.set(0.4 + tau * 1.3, 0.2 + tau * 2.1, 0);
    ball.visible = tau < 4.6;

    // camera: shot-1 macro rig (locked, slow push) blended into the flight path
    const s1 = sat(t / tInst);
    const macroPos = tmpA.set(-1.58 - 0.16 * s1, 1.34 + 0.02 * s1, 2.0 - 0.15 * s1);
    const macroTgt = tmpB.set(-1.63, 1.235, 0).lerp(ballPos, 0.45);
    camPath(t, camPos); tgtPath(t, camTgt);
    const w = smootherstep(1.15, 1.9, t);
    camPos.lerpVectors(macroPos, camPos, w);
    camTgt.lerpVectors(macroTgt, camTgt, w);
    camera.position.copy(camPos);
    camera.up.set(Math.sin(t * 0.7) * 0.03 + Math.sin(smoothstep(2.4, 3.6, t) * Math.PI) * 0.12, 1, 0).normalize();
    camera.lookAt(camTgt);
    camera.fov = lerp(32, 38, smoothstep(2.2, 3.0, t)) - smoothstep(3.6, 4.4, t) * 6;
    camera.updateProjectionMatrix();

    // trajectory
    const frac = arcFrac(tau);
    traj.progress = Math.max(0.0001, frac);
    trajGlow.progress = Math.max(0.0001, frac);
    const trajFade = 1 - smoothstep(3.6, 4.2, t);
    traj.opacity = ramp(t, 0.0, 0.25) * trajFade;
    trajGlow.opacity = 0.5 * traj.opacity;
    dashed.progress = sat(ramp(t, 0.15, 1.2, ease.outCubic) * 0.35 + frac);
    dashed.opacity = 0.32 * envelope(t, 0.1, 2.6, 0.4, 0.5, ease.linear);

    ghosts.forEach((g) => {
      const a = tau - g.userData.tau;
      g.visible = a > 0 && t < 4.1;
      if (!g.visible) return;
      const pop = sat(a / 0.035);
      g.scale.setScalar(0.6 + 0.4 * ease.outBack(pop));
      g.material.uniforms.uOpacity.value = pop * 0.4 * (1 - smoothstep(3.3, 4.0, t));
    });
    stampLabels.forEach((l) => { const a = tau - l.userData.tau; l.opacity = sat(a / 0.04) * (1 - smoothstep(1.5, 1.9, t)); l.reveal = sat(a / 0.06); });

    // vectors
    const vecO = envelope(t, 0.3, 2.2, 0.4, 0.35);
    vArrow.visible = gArrow.visible = vLbl.visible = gLbl.visible = vecO > 0.001;
    if (vecO > 0.001) {
      const vl = vel.length(), vn = tmpA.copy(vel).divideScalar(vl || 1);
      vArrow.position.copy(ballPos).addScaledVector(vn, 0.21);
      vArrow.quaternion.setFromUnitVectors(Y, vn);
      vArrow.setLen((0.1 + vl * 0.14) * ramp(t, 0.3, 0.8, ease.outCubic));
      gArrow.position.copy(ballPos).addScaledVector(down, 0.21);
      gArrow.quaternion.setFromUnitVectors(Y, down);
      gArrow.setLen(0.3 * ramp(t, 0.45, 0.95, ease.outCubic));
      vArrow.userData.m.opacity = gArrow.userData.m.opacity = vecO;
      vLbl.position.copy(vArrow.position).addScaledVector(vn, vArrow.userData.head.position.y + 0.05).add(V(0, 0.03, 0));
      gLbl.position.copy(gArrow.position).add(tmpB.set(0.045, -gArrow.userData.head.position.y + 0.02, 0));
      vLbl.opacity = gLbl.opacity = vecO * ramp(t, 0.7, 1.0);
    }

    // equations
    eqS.reveal = ramp(t, 0.35, 0.95, ease.outCubic); eqS.opacity = 1 - smoothstep(1.7, 2.05, t);
    capS.reveal = ramp(t, 0.6, 1.1, ease.outCubic); capS.opacity = eqS.opacity * 0.9;
    eqA.reveal = ramp(t, 0.75, 1.3, ease.outCubic); eqA.opacity = 1 - smoothstep(1.7, 2.05, t);
    eqF.reveal = ramp(t, 1.55, 2.1, ease.outCubic); eqF.opacity = 1 - smoothstep(2.35, 2.6, t);
    capF.reveal = ramp(t, 1.75, 2.2, ease.outCubic); capF.opacity = eqF.opacity * 0.9;
    eqK.reveal = ramp(t, 2.55, 3.05, ease.outCubic); eqK.opacity = 1 - smoothstep(3.35, 3.6, t);
    capK.reveal = ramp(t, 2.7, 3.15, ease.outCubic); capK.opacity = eqK.opacity * 0.9;

    // instruments: staggered fly-in assembly
    const ta = t - (tInst - 0.25);
    for (const p of parts) {
      const k = ease.outCubic(sat((ta - p.delay) / 0.75));
      const kk = ease.inOutCubic(sat((ta - p.delay) / 0.75));
      p.mesh.position.lerpVectors(p.p0, p.p1, k);
      p.mesh.quaternion.slerpQuaternions(p.q0, p.q1, kk);
      p.mesh.scale.copy(p.s1).multiplyScalar(0.001 + 0.999 * sat(k * 3));
      p.mesh.visible = ta - p.delay > 0;
    }
    armil.rotation.y = -0.5 + t * 0.25;
    armRings[2].rotation.y = t * 0.6; armRings[3].rotation.x = t * 0.4;
    armil.userData.ticks.progress = ramp(t, tInst + 0.4, tInst + 1.1);
    const thA = t * 1.1;
    gearSpin[0].rotation.z = thA;
    gearSpin[1].rotation.z = meshAngle(thA, gA.z, gB.z, dirAB);
    gearSpin[2].rotation.z = meshAngle(thA, gA.z, gC.z, dirAC);
    const dp = ramp(t, tInst, tInst + 1.0, ease.inOutCubic);
    diagLines.forEach((l, i) => { l.progress = sat(dp * 1.3 - i * 0.15); l.opacity = 1 - smoothstep(2.4, 2.8, t); });
    diagTk.progress = sat(dp * 1.2 - 0.2); diagTk.opacity = 1 - smoothstep(2.4, 2.8, t);
    focusDot.material.opacity = sat(dp * 3) * (1 - smoothstep(2.4, 2.8, t)); focusDot.visible = focusDot.material.opacity > 0;
    diag.rotation.z = t * 0.05;
    const instVis = t < 3.0;
    scope.visible = armil.visible = gearGrp.visible = diag.visible = instVis;

    // orrery (continuously rotating; lines drawn in at the cue)
    const orrOn = t > 1.8;
    orrery.visible = sun.visible = sunGlow.visible = sunGlow2.visible = orrOn;
    const tw = t * 1.0;
    PL.forEach((p) => { p.grp.rotation.y = p.phase + tw * p.w; if (p.moonGrp) p.moonGrp.rotation.y = tw * 3.0; });
    const thC = t * 0.35;
    crownSpin.rotation.z = thC;
    pinions.forEach((pp) => { pp.grp.rotation.z = meshAngle(thC, 56, pp.pz, pp.dir); });
    const op = ramp(t, tOrr - 0.1, tOrr + 0.8, ease.inOutCubic);
    orbitLines.forEach((l, i) => { l.progress = sat(op * 1.4 - i * 0.07); l.opacity = 1 - smoothstep(4.3, 4.8, t) * 0.7; });
    orbitTicks.forEach((l, i) => { l.progress = sat(op * 1.4 - 0.25 - i * 0.05); l.opacity = 1 - smoothstep(4.3, 4.8, t) * 0.7; });
    zodiacLabels.forEach((l, i) => { l.opacity = sat(op * 2 - 0.5 - i * 0.04); });
    const sunI = 1 + 0.08 * Math.sin(T * 9.0);
    sunMat.uniforms.uI.value = 2.6 * sunI * (1 + envelope(t, tBeam - 0.3, tBeam + 0.3, 0.2, 0.2) * 0.6);
    sunLight.intensity = 26 * ramp(t, 1.9, 2.5);
    sunGlow.material.opacity = 1; sun.rotation.y = t * 0.3;

    // light: beam → prism → spectrum
    const bp = ramp(t, tBeam - 0.28, tBeam, ease.inQuad);
    beam.progress = bp; beamHalo.progress = bp;
    beam.opacity = bp > 0 ? 1 : 0; beamHalo.opacity = bp > 0 ? 0.45 : 0;
    const hit = t - tBeam;
    inner.progress = sat(hit / 0.06);
    inner.opacity = hit > 0 ? 1 : 0;
    entryGlow.visible = hit > -0.02;
    entryGlow.scale.setScalar(0.35 + 1.4 * Math.exp(-Math.max(0, hit) * 7) * sat((hit + 0.02) / 0.02));
    exitGlow.visible = hit > 0.05;
    const fp = sat((hit - 0.05) / 0.9);
    const fe = ease.outCubic(fp);
    fanMat.uniforms.uLen.value = fe * 9.0;
    fanMat.uniforms.uA0.value = lerp(-0.3, -0.06, ease.inOutCubic(sat((hit - 0.1) / 0.85)));
    fanMat.uniforms.uA1.value = lerp(-0.38, -0.72, ease.inOutCubic(sat((hit - 0.1) / 0.85)));
    fan.visible = hit > 0.05;
    fanMat.uniforms.uI.value = 0.5 + 0.5 * Math.exp(-Math.max(0, hit - 0.05) * 4);
    prismFres.material.uniforms.uO.value = ramp(t, 3.4, 3.9) * (1 + 0.6 * Math.exp(-Math.max(0, hit) * 5) * (hit > 0 ? 1 : 0));
    const a0 = fanMat.uniforms.uA0.value, a1 = fanMat.uniforms.uA1.value, Lr = Math.min(2.3, fe * 9);
    lamRed.position.set(X.x + Math.cos(a0) * Lr, X.y + Math.sin(a0) * Lr + 0.07, 0.02); lamRed.rotation.z = a0;
    lamVio.position.set(X.x + Math.cos(a1) * Lr * 0.8, X.y + Math.sin(a1) * Lr * 0.8 - 0.07, 0.02); lamVio.rotation.z = a1;
    lamRed.reveal = lamVio.reveal = ramp(t, tBeam + 0.25, tBeam + 0.55);
    lamRed.opacity = lamVio.opacity = ramp(t, tBeam + 0.25, tBeam + 0.3);
    eqN.reveal = ramp(t, tBeam + 0.05, tBeam + 0.45, ease.outCubic); eqN.opacity = ramp(t, tBeam + 0.05, tBeam + 0.1);
    capO.reveal = ramp(t, tBeam + 0.15, tBeam + 0.5, ease.outCubic); capO.opacity = eqN.opacity * 0.9;
    prism.visible = t > 3.0;

    // labels face the camera (flat zodiac numerals excepted)
    for (const l of labels3D) l.quaternion.copy(camera.quaternion);
    eqN.quaternion.identity(); capO.quaternion.identity();

    // HUD
    hudItems.forEach(([tp, a, b]) => { const e = envelope(t, a, b, 0.25, 0.3); tp.opacity = e; tp.reveal = ramp(t, a, a + 0.45, ease.outCubic); });
    const ruleE = envelope(t, 0.3, 5.2, 0.4, 0.3);
    hudRule.material.opacity = ruleE * 0.6; hudRule.visible = ruleE > 0;
    hudRule.scale.x = 0.9 * ramp(t, 0.3, 0.9, ease.outCubic);
    hudRule.position.set(-ctx.aspect + 0.16 + hudRule.scale.x / 2, 0.79, 0);

    // dust: slow-motion time for the motes near the fall
    dustA.tick(tau * 0.6 + t * 0.15, info); dustB.tick(t, info);
    dustA.u.opacity = 0.55 * (1 - smoothstep(2.6, 3.0, t));
    dustB.u.opacity = 0.5 * ramp(t, 2.0, 2.6);

    // depth of field
    if (t < 1.6) { dof.focus = camera.position.distanceTo(ballPos) - 0.1; dof.range = 0.7; dof.amount = 0.7; }
    else if (t < 2.4) { dof.focus = lerp(camera.position.distanceTo(ballPos), camera.position.distanceTo(S), smoothstep(2.0, 2.4, t)); dof.range = lerp(0.6, 1.2, smoothstep(1.6, 2.2, t)); dof.amount = 0.65; }
    else if (t < 3.8) { dof.focus = camera.position.distanceTo(S) * lerp(1, 0.75, smoothstep(2.9, 3.4, t)); dof.range = 1.6; dof.amount = 0.6; }
    else { dof.focus = lerp(dof.focus, camera.position.distanceTo(P), 1); dof.range = 1.1; dof.amount = 0.55; }
    if (t >= 3.4 && t < 3.8) dof.focus = lerp(camera.position.distanceTo(S) * 0.75, camera.position.distanceTo(P), smoothstep(3.4, 3.8, t));
    bloom.strength = 0.55 + 0.2 * smoothstep(tBeam, tSpec, t);
  }

  return { scene, camera, update, hud, dof, bloom, exposure: 1, background: BG };
}
