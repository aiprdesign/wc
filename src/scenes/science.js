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
import { bakePlanetMaps, planetUniforms, planetMaterial, atmosphereShell, ringMesh, sunMaterial, saturnRingTexture, uranusRingTexture, SATURN_RING, URANUS_RING } from '../lib/orrery-planets.js';

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

// The bloom duck the film applies while a chapter heading is up (core/words3d.js). Explore hides the
// headings (engine.headingsHidden), dropping the duck with them; the explore hook puts it back.
function headingDuck(ctx, inst, T) {
  let d = 0;
  const items = ctx.engine?.words3d?.items;
  if (items) for (const it of items) if (it.inst === inst) d = Math.max(d, ramp(T - it.t0, 0, 0.35) * (1 - ramp(T, it.t1 - 0.2, it.t1 + 0.35)));
  return d;
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.05, 200);
  const cue = (n) => CUES[n] - segment.start;
  const tFall = cue('fallStart'), tInst = cue('instruments'), tOrr = cue('orrery'), tBeam = cue('prismBeam'), tSpec = cue('spectrum');
  const DUR = segment.end - segment.start;

  scene.environment = ctx.env;
  const ENV_I = 0.4;
  scene.environmentIntensity = ENV_I;
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
  const P = S.clone().add(V(4.8, 2.0, 2.0));  // prism (raised: the beam climbs into it, the classic path)
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
  const ballBand = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.0035, 8, 128), new THREE.MeshStandardMaterial({ color: '#3a2610', metalness: 1, roughness: 0.4 }));
  ball.add(ballBand); ballBand.rotation.x = Math.PI / 2 - 0.35;
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
  const capF = new TextPlane('PRINCIPIA 1687 · IN MODERN NOTATION', { font: FONTS.mono, height: 0.045, letterSpacing: 0.3, color: '#ffdcb0', intensity: 0.9 });
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
  // (the added fittings fly in on their own random paths, so the original parts keep exactly theirs)
  const R2 = rng(177);
  function addFitting(mesh, group, delay, spread = 1.6) {
    group.add(mesh);
    const dir = V(R2() - 0.5, R2() - 0.5, -0.3 - R2() * 0.7).normalize();
    parts.push({
      mesh, delay,
      p1: mesh.position.clone(), q1: mesh.quaternion.clone(), s1: mesh.scale.clone(),
      p0: mesh.position.clone().addScaledVector(dir, spread * (0.6 + R2() * 0.8)),
      q0: new THREE.Quaternion().setFromEuler(new THREE.Euler((R2() - 0.5) * 4, (R2() - 0.5) * 4, (R2() - 0.5) * 4)).multiply(mesh.quaternion),
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
    // finder scope on two brackets, the rack-and-pinion focusing knobs, and the altazimuth mount: cradle
    // rings, trunnion fork, pillar and a tripod foot (the pillar stands plumb, whatever the tube's tilt)
    addFitting(along(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.42, 24), brass), 0.25), scope, 0.22).position.y = 0.14;
    for (const x of [0.1, 0.38]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.06, 0.018), brassPolish); b.position.set(x, 0.11, 0); addFitting(b, scope, 0.2); }
    addFitting(along(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 20), lensMat), 0.465), scope, 0.3).position.y = 0.14;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), brassPolish); rack.position.set(-0.62, -0.07, 0); addFitting(rack, scope, 0.18);
    for (const sz of [-1, 1]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 20).rotateX(Math.PI / 2), bronzeDark); k.position.set(-0.62, -0.08, sz * 0.05); addFitting(k, scope, 0.24); }
    for (const x of [-0.05, 0.3]) { const cr = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.012, 10, 48).rotateY(Math.PI / 2), bronzeDark); cr.position.x = x; addFitting(cr, scope, 0.16); }
    const mount = new THREE.Group(); mount.position.set(0.12, -0.1, 0); scope.add(mount);
    scope.updateMatrixWorld();
    mount.quaternion.copy(scope.quaternion).invert();                   // local frame of the mount = world axes
    const fork = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 10, 32, Math.PI), bronzeDark); fork.rotation.set(0, Math.PI / 2 + 0.35, Math.PI); fork.position.y = 0.05; addFitting(fork, mount, 0.26);
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20), brassPolish); boss.position.y = -0.09; addFitting(boss, mount, 0.28);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.034, 0.56, 20), brassLathe); pillar.position.y = -0.39; addFitting(pillar, mount, 0.3);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), brassPolish); collar.position.y = -0.68; addFitting(collar, mount, 0.32);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.4, top = V(Math.cos(a) * 0.03, -0.69, Math.sin(a) * 0.03), toe = V(Math.cos(a) * 0.26, -0.88, Math.sin(a) * 0.26);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, top.distanceTo(toe), 12), bronzeDark);
      leg.position.copy(top).add(toe).multiplyScalar(0.5); leg.quaternion.setFromUnitVectors(V(0, 1, 0), top.clone().sub(toe).normalize());
      addFitting(leg, mount, 0.34);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), brassPolish); foot.position.copy(toe); addFitting(foot, mount, 0.36);
    }
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
    // the zodiac band (a broad belt along the ecliptic ring), pole caps on the axis, and the stand's collar
    // and half-meridian yoke holding the sphere on its stem
    const zod = new THREE.Group(); zod.rotation.set(Math.PI / 2, 0, 0.41);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(RR * 0.975, RR * 0.975, 0.07, 128, 1, true), new THREE.MeshStandardMaterial({ color: '#b98c4e', metalness: 1, roughness: 0.32, side: THREE.DoubleSide }));
    band.rotation.x = -Math.PI / 2; zod.add(band);
    addFitting(zod, armil, 0.2, 2.2);
    armil.userData.zod = zod;
    for (const s of [1, -1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), brassPolish);
      cap.position.set(-Math.sin(0.41) * RR * 1.25 * s, Math.cos(0.41) * RR * 1.25 * s, 0); addFitting(cap, armil, 0.1);
    }
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(RR + 0.05, 0.016, 10, 64, Math.PI), bronzeDark); yoke.rotation.z = Math.PI; addFitting(yoke, armil, 0.28, 2.0);
    const coll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 24), brassPolish); coll.position.y = -RR - 0.05; addFitting(coll, armil, 0.3);
    for (const sx of [-1, 1]) { const pv = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 16).rotateZ(Math.PI / 2), brassPolish); pv.position.x = sx * (RR + 0.05); addFitting(pv, armil, 0.3); }
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
  // the train's frame: a pierced back plate with pillars, a steel arbor through each wheel with its collet
  {
    const plateShape = new THREE.Shape(); plateShape.absarc(0, 0, 0.62, 0, TAU, false);
    for (const [x, y, r] of [[0.28, -0.22, 0.08], [-0.3, 0.3, 0.07], [0.12, 0.42, 0.06]]) { const h = new THREE.Path(); h.absarc(x, y, r, 0, TAU, true); plateShape.holes.push(h); }
    const plateG = new THREE.ExtrudeGeometry(plateShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 48 });
    const plate = new THREE.Mesh(plateG, bronzeDark); plate.position.set(-0.05, 0.12, -0.12); addFitting(plate, gearGrp, 0.05, 2.0);
    const arborM = new THREE.MeshStandardMaterial({ color: '#b8bec6', metalness: 1, roughness: 0.2 });
    gearSpin.forEach((gs, i) => {
      const arbor = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 12).rotateX(Math.PI / 2), arborM); arbor.position.z = -0.04; gs.add(arbor);
      const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20).rotateX(Math.PI / 2), brassPolish); collet.position.z = 0.045; gs.add(collet);
      void i;
    });
    for (const [x, y] of [[0.4, 0.4], [-0.45, -0.25], [0.45, -0.4]]) { const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 12).rotateX(Math.PI / 2), brassPolish); pil.position.set(x - 0.05, y + 0.12, -0.06); addFitting(pil, gearGrp, 0.12); }
  }
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
  // (the dial and the base gearing set the scene's environment on their own materials — the same look — so the
  // explore hook can ease the studio reflections that flare off these flat faces)
  const glintMats = [];
  const glintMat = (m) => { m.envMap = ctx.env; m.envMapIntensity = ENV_I; glintMats.push(m); return m; };
  const hs = S.y - O.y;
  {
    // moulded plinth (lathe profile: foot, cavetto, drum, ovolo, top) standing on three bun feet
    const prof = [[0.001, -0.28], [1.42, -0.28], [1.44, -0.25], [1.4, -0.23], [1.33, -0.2], [1.3, -0.16], [1.3, -0.07], [1.33, -0.05], [1.35, -0.03], [1.31, -0.005], [1.26, 0], [0.001, 0]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    const plinth = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), bronzeDark); orrery.add(plinth);
    const plinthRim = new THREE.Mesh(new THREE.TorusGeometry(1.27, 0.03, 12, 128), brassPolish); plinthRim.rotation.x = Math.PI / 2; orrery.add(plinthRim);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.302, 1.302, 0.05, 128, 1, true), brassPolish); band.position.y = -0.115; orrery.add(band);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5, foot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 12), brass);
      foot.scale.set(1, 0.45, 1); foot.position.set(Math.cos(a) * 1.15, -0.31, Math.sin(a) * 1.15); orrery.add(foot);
    }
    // engraved calendar dial inlaid in the top: degree ticks, month divisions and a zodiac band
    const N = 1024, dc = document.createElement('canvas'); dc.width = dc.height = N;
    const g = dc.getContext('2d'), C = N / 2;
    g.fillStyle = '#6d5230'; g.fillRect(0, 0, N, N);
    g.strokeStyle = 'rgba(30,18,6,0.85)'; g.fillStyle = 'rgba(30,18,6,0.85)';
    const ring = (r, w) => { g.lineWidth = w; g.beginPath(); g.arc(C, C, r, 0, TAU); g.stroke(); };
    [0.99, 0.93, 0.86, 0.78, 0.7].forEach((k, i) => ring(C * k, i === 0 ? 5 : 2));
    for (let i = 0; i < 360; i++) { const a = (i / 360) * TAU, l = i % 10 === 0 ? 0.06 : i % 5 === 0 ? 0.04 : 0.025; g.lineWidth = i % 10 === 0 ? 2.2 : 1.2; g.beginPath(); g.moveTo(C + Math.cos(a) * C * 0.93, C + Math.sin(a) * C * 0.93); g.lineTo(C + Math.cos(a) * C * (0.93 - l), C + Math.sin(a) * C * (0.93 - l)); g.stroke(); }
    const signs = ['ARIES', 'TAVRVS', 'GEMINI', 'CANCER', 'LEO', 'VIRGO', 'LIBRA', 'SCORPIO', 'SAGITTAR', 'CAPRICOR', 'AQVARIVS', 'PISCES'];
    g.font = `600 ${Math.round(N * 0.026)}px "${FONTS.serif}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
    signs.forEach((sg, i) => {
      const a0 = (i / 12) * TAU; g.lineWidth = 2; g.beginPath(); g.moveTo(C + Math.cos(a0) * C * 0.7, C + Math.sin(a0) * C * 0.7); g.lineTo(C + Math.cos(a0) * C * 0.86, C + Math.sin(a0) * C * 0.86); g.stroke();
      const a = a0 + TAU / 24; g.save(); g.translate(C + Math.cos(a) * C * 0.82, C + Math.sin(a) * C * 0.82); g.rotate(a + Math.PI / 2); g.fillText(sg, 0, 0); g.restore();
    });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + TAU / 24; g.save(); g.translate(C + Math.cos(a) * C * 0.74, C + Math.sin(a) * C * 0.74); g.rotate(a + Math.PI / 2); g.font = `400 ${Math.round(N * 0.018)}px "${FONTS.serif}"`; g.fillText(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][i], 0, 0); g.restore(); }
    const dialTex = new THREE.CanvasTexture(dc); dialTex.colorSpace = THREE.SRGBColorSpace; dialTex.anisotropy = 8;
    const dialGeo = new THREE.RingGeometry(0.42, 1.25, 128, 1);
    { const p = dialGeo.attributes.position, uv = dialGeo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / 2.52, 0.5 + p.getY(i) / 2.52); }
    const dial = new THREE.Mesh(dialGeo, glintMat(new THREE.MeshPhysicalMaterial({ map: dialTex, color: '#e2bd7c', metalness: 1, roughness: 0.34, bumpMap: dialTex, bumpScale: -1.2, clearcoat: 0.2 })));
    dial.rotation.x = -Math.PI / 2; dial.position.y = 0.003; orrery.add(dial);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, hs, 24), brassPolish); column.position.y = hs / 2; orrery.add(column);
    // gilded cup carrying the sun
    const cupP = []; for (let i = 0; i <= 10; i++) { const u = i / 10; cupP.push(new THREE.Vector2(0.05 + 0.2 * Math.pow(u, 1.6), -0.3 + u * 0.13)); }
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupP, 48), brassPolish); cup.position.y = hs; orrery.add(cup);
  }
  // base gearing (flat): crown gear + pinions
  const crown = new THREE.Mesh(gearGeometry({ teeth: 56, module: 0.036, thickness: 0.05, bevel: 0.006, bore: 0.08, spokes: 8 }), glintMat(brassMat({ roughness: 0.3, lathe: true })));
  const crownSpin = new THREE.Group(); crownSpin.position.y = 0.05; crownSpin.rotation.x = -Math.PI / 2; crownSpin.add(crown); orrery.add(crownSpin);
  const pinions = [];
  for (let i = 0; i < 3; i++) {
    const pz = 14, dir = (i / 3) * TAU + 0.4, d = (56 + pz) * 0.036 / 2;
    const pg = new THREE.Mesh(gearGeometry({ teeth: pz, module: 0.036, thickness: 0.07, bevel: 0.006, bore: 0.03, spokes: 0 }), glintMat(brassMat({ roughness: 0.2, color: '#dcb97c', lathe: true })));
    const grp = new THREE.Group(); grp.position.set(Math.cos(dir) * d, 0.06, -Math.sin(dir) * d); grp.rotation.x = -Math.PI / 2; grp.add(pg); orrery.add(grp);
    pinions.push({ grp, pz, dir });
  }
  // sun: animated granulation, sunspots and faculae, photospheric limb darkening (orrery-planets.js)
  const sunMat = sunMaterial();
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.3, 96, 64), sunMat); sun.position.copy(S); sun.name = 'body:sun'; scene.add(sun);
  const sunGlow = glowSprite({ color: '#ffc98a', intensity: 0.55, scale: 1.7 }); sunGlow.position.copy(S); scene.add(sunGlow);
  const sunGlow2 = glowSprite({ color: '#ff9a4a', intensity: 0.16, scale: 5 }); sunGlow2.position.copy(S); scene.add(sunGlow2);
  const sunLight = new THREE.PointLight('#ffcf98', 0, 14, 2); sunLight.position.copy(S); scene.add(sunLight);
  // planets: GPU-baked surface maps, lit by the orrery's sun (phases and terminators face it), each
  // spinning on a correctly tilted axis that stays fixed in space while its arm carries it round.
  // Sizes are orrery-readable but ordered like the real bodies; Uranus and Neptune ride the two
  // lowest arms, outside the zodiac ring.
  const maps = bakePlanetMaps(ctx.renderer, { scale: ctx.engine?.quality === 'lite' ? 0.25 : 1 });   // (phones: quarter-size maps)
  const PU = planetUniforms(S, key.position);
  const unitSphere = new THREE.SphereGeometry(1, 64, 48);
  const DEG = Math.PI / 180;
  const PL = [
    { r: 0.75, s: 0.05, k: 'mercury', tilt: 0.03, az: 0, spin: 0.2 },
    { r: 1.1, s: 0.075, k: 'venus', tilt: 177.4, az: 0.6, spin: 0.15 },
    { r: 1.5, s: 0.082, k: 'earth', tilt: 23.44, az: 2.27, spin: 1.3, moon: true },
    { r: 1.95, s: 0.062, k: 'mars', tilt: 25.19, az: 1.9, spin: 1.25 },
    { r: 2.5, s: 0.17, k: 'jupiter', tilt: 3.13, az: 0.4, spin: 2.4 },
    { r: 3.1, s: 0.14, k: 'saturn', tilt: 26.73, az: 0.8, spin: 2.2, ring: 'saturn' },
    { r: 3.8, s: 0.105, k: 'uranus', tilt: 97.77, az: 2.0, spin: 1.6, ring: 'uranus', armY: hs - 1.05, sR: 0.1145, phase0: 2.3 },
    { r: 4.35, s: 0.1, k: 'neptune', tilt: 28.32, az: 1.0, spin: 1.7, armY: hs - 1.15, sR: 0.121, phase0: 3.6 },
  ];
  const ringTex = { saturn: saturnRingTexture(), uranus: uranusRingTexture() };
  const ringSpec = { saturn: SATURN_RING, uranus: URANUS_RING };
  const pr = rng(31), spinR = rng(77);
  PL.forEach((p, i) => {
    const grp = new THREE.Group(); grp.position.y = 0; orrery.add(grp);
    const armY = p.armY ?? hs - 0.95 + i * 0.1;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, p.r, 10), brass); arm.rotation.z = Math.PI / 2; arm.position.set(p.r / 2, armY, 0); grp.add(arm);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, hs - armY, 10), brassPolish); post.position.set(p.r, (hs + armY) / 2, 0); grp.add(post);
    // coaxial sleeves: each planet rides its own tube (outermost = lowest arm), capped by a knurled collar
    const sR = p.sR ?? 0.108 - i * 0.0065;
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(sR, sR, armY - 0.07, 32, 1, true), i % 2 ? brass : brassPolish); sleeve.position.y = 0.07 + (armY - 0.07) / 2; orrery.add(sleeve);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(sR + 0.014, sR + 0.014, 0.045, 32), brassPolish); collar.position.y = armY; grp.add(collar);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 20), bronzeDark); cw.rotation.z = Math.PI / 2; cw.position.set(-0.13 - sR, armY, 0); grp.add(cw);   // counterweight
    const cwArm = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.13, 8), brass); cwArm.rotation.z = Math.PI / 2; cwArm.position.set(-0.065 - sR, armY, 0); grp.add(cwArm);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), brassPolish); elbow.position.set(p.r, armY, 0); grp.add(elbow);
    // hold cancels the arm's revolution (axis fixed in space), tilt sets the obliquity, the body spins
    const hold = new THREE.Group(); hold.position.set(p.r, hs, 0); grp.add(hold);
    const tiltG = new THREE.Group(); tiltG.rotation.set(0, p.az, p.tilt * DEG); hold.add(tiltG);
    const ring = p.ring ? { tex: ringTex[p.ring], spec: ringSpec[p.ring] } : null;
    const planet = new THREE.Mesh(unitSphere, planetMaterial(p.k, maps, PU, ring ? { ringTex: ring.tex, ring: ring.spec, ringK: p.ring === 'saturn' ? 0.85 : 0.3 } : {}));
    planet.scale.setScalar(p.s); planet.name = `body:${p.k}`; tiltG.add(planet);
    if (p.k === 'earth' || p.k === 'venus') {
      const a = atmosphereShell(p.k === 'earth' ? [0.28, 0.55, 1.0] : [1.0, 0.86, 0.6], PU, p.k === 'earth' ? { k: 0.9, hs: 0.022 } : { k: 0.4, hs: 0.018 });
      const shell = new THREE.Mesh(unitSphere, a.material); shell.scale.setScalar(a.scale); planet.add(shell);
    }
    if (ring) {
      const rm = ringMesh(ring.tex, ring.spec, PU, p.ring === 'saturn' ? { k: 1, glow: 1 } : { k: 1, glow: 0.3 });
      rm.scale.setScalar(p.s); tiltG.add(rm);
    }
    const pcup = new THREE.Mesh(new THREE.CylinderGeometry(p.s * 0.45, 0.012, p.s * 0.35, 20), brassPolish); pcup.position.set(p.r, hs - p.s * 0.95, 0); grp.add(pcup);
    if (p.moon) {
      const mg = new THREE.Group(); mg.position.copy(hold.position); grp.add(mg);
      const mn = new THREE.Mesh(unitSphere, planetMaterial('moon', maps, PU)); mn.scale.setScalar(0.025); mn.name = 'body:moon'; mn.position.x = 0.17; mn.rotation.z = 6.7 * DEG; mg.add(mn);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 6), brass); rod.rotation.z = Math.PI / 2; rod.position.x = 0.085; mg.add(rod); p.moonGrp = mg;
    }
    const ph = pr() * TAU;
    p.grp = grp; p.hold = hold; p.planet = planet; p.phase = p.phase0 ?? ph; p.w = 1.25 * Math.pow(p.r, -1.5); p.spin0 = spinR() * TAU;
  });
  const earthMat = PL[2].planet.material;
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
  // A physically traced dispersing prism. Everything is laid out in prism-local coordinates (x along the
  // horizontal beam heading, y up, z toward the camera side): the white ray from the orrery's sun rises
  // into the left face, refracts per wavelength with Snell's law (Cauchy dispersion, exaggerated ×11 so
  // the fan reads on screen), crosses the glass as a narrow internal fan and leaves the right face as a
  // continuous spectrum — red least deviated, violet most — which lands on a matte card as a band.
  const prism = new THREE.Group(); prism.position.copy(P); prism.rotation.y = -Math.atan2(beamDir.z, beamDir.x); scene.add(prism);
  prism.updateMatrixWorld();
  const Sl = prism.worldToLocal(S.clone());
  const side = 0.9, hgt = side * Math.sqrt(3) / 2, DEPTH = 0.62;
  const v2 = (x, y) => new THREE.Vector2(x, y);
  const rot2 = (p, a) => v2(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a));
  // index of refraction by spectral coordinate u (0 = 700 nm red … 1 = 400 nm violet; uniform in 1/λ²)
  const invL2 = (u) => lerp(1 / 700 ** 2, 1 / 400 ** 2, u);
  const nOf = (u) => 1.5046 + 4200 * 11 * invL2(u);
  // choose the roll so the mid-spectrum ray passes at minimum deviation (the textbook symmetric path)
  const nMid = nOf(0.5), iMin = Math.asin(nMid * Math.sin(Math.PI / 6));
  let roll = 0, tA, tB, tC, Ein, dIn;
  for (let it = 0; it < 4; it++) {
    tA = rot2(v2(-side / 2, -hgt / 3), roll); tB = rot2(v2(side / 2, -hgt / 3), roll); tC = rot2(v2(0, (2 * hgt) / 3), roll);
    Ein = tA.clone().lerp(tC, 0.42);
    dIn = Ein.clone().sub(v2(Sl.x, Sl.y)).normalize();
    const nL = v2(-(tC.y - tA.y), tC.x - tA.x).normalize();           // outward normal of the entry face
    const inc = Math.acos(-dIn.dot(nL));
    roll += inc - iMin;                                                // rotating the prism by +δ lowers incidence by δ
  }
  const nLeft = v2(-(tC.y - tA.y), tC.x - tA.x).normalize();
  const nRight = v2(tC.y - tB.y, -(tC.x - tB.x)).normalize();
  const refract2 = (d, N, eta) => {                                    // N faces against d
    const ci = -d.dot(N), k = 1 - eta * eta * (1 - ci * ci);
    if (k < 0) return null;
    return d.clone().multiplyScalar(eta).add(N.clone().multiplyScalar(eta * ci - Math.sqrt(k))).normalize();
  };
  const reflect2 = (d, N) => d.clone().sub(N.clone().multiplyScalar(2 * d.dot(N)));
  const hitLine = (o, d, a, b) => {                                    // ray o + s·d against segment a–b → s
    const e = b.clone().sub(a), den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) return Infinity;
    const w = a.clone().sub(o);
    const s = (w.x * e.y - w.y * e.x) / den, q = (w.x * d.y - w.y * d.x) / den;
    return s > 1e-5 && q >= -1e-3 && q <= 1 + 1e-3 ? s : Infinity;
  };
  const NU = 72;
  const exitP = [], exitD = [], inD = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, n = nOf(u);
    const d1 = refract2(dIn, nLeft, 1 / n);
    const s = hitLine(Ein, d1, tB, tC);
    const X = Ein.clone().addScaledVector(d1, s);
    const d2 = refract2(d1, nRight.clone().negate(), n);
    inD.push(d1); exitP.push(X); exitD.push(d2);
  }
  const Xmid = exitP[NU >> 1], dMid = exitD[NU >> 1];
  // matte projection card: 2 units down-range, turned 48° toward the camera
  const DS = 2.15;
  const Q2 = Xmid.clone().addScaledVector(dMid, DS);
  const beta = 1.0;
  const cardN = V(-dMid.x * Math.cos(beta), -dMid.y * Math.cos(beta), Math.sin(beta)).normalize();
  const Q = V(Q2.x, Q2.y, 0);
  const lenAt = exitP.map((X, i) => { const d = exitD[i]; return ((Q.x - X.x) * cardN.x + (Q.y - X.y) * cardN.y) / (d.x * cardN.x + d.y * cardN.y); });
  const hitAt = exitP.map((X, i) => V(X.x + exitD[i].x * lenAt[i], X.y + exitD[i].y * lenAt[i], 0));

  // spectral colour: CIE 1931 multi-lobe fit (Wyman, Sloan & Shirley 2013) → XYZ → linear sRGB, gamut-clipped,
  // then blurred along the spectrum by the beam's finite width (as on a real card: that overlap is what
  // widens the thin yellow and cyan zones), value-normalised with a lift for the dim blues. Baked into a
  // 256×1 lookup so every shader samples identical colour.
  const SPEC_N = 256;
  const lobe = (x, mu, s1, s2) => { const q = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * q * q); };
  const rawSpec = [];
  for (let i = 0; i < SPEC_N; i++) {
    const lam = 1 / Math.sqrt(invL2(i / (SPEC_N - 1)));
    const X = 1.056 * lobe(lam, 599.8, 37.9, 31.0) + 0.362 * lobe(lam, 442.0, 16.0, 26.7) - 0.065 * lobe(lam, 501.1, 20.4, 26.2);
    const Y = 0.821 * lobe(lam, 568.8, 46.9, 40.5) + 0.286 * lobe(lam, 530.9, 16.3, 31.1);
    const Z = 1.217 * lobe(lam, 437.0, 11.8, 36.0) + 0.681 * lobe(lam, 459.0, 26.0, 13.8);
    rawSpec.push([Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z), Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z), Math.max(0, 0.0557 * X - 0.2040 * Y + 1.0570 * Z)]);
  }
  const specData = new Uint8Array(SPEC_N * 4);
  for (let i = 0; i < SPEC_N; i++) {
    const c = [0, 0, 0]; let ws = 0;
    for (let k = -14; k <= 14; k++) {
      const j = Math.min(SPEC_N - 1, Math.max(0, i + k)), w = Math.exp(-0.5 * (k / 6) ** 2);
      const r = rawSpec[j], m = Math.max(r[0], r[1], r[2], 1e-4);
      c[0] += (r[0] / m) * w; c[1] += (r[1] / m) * w; c[2] += (r[2] / m) * w; ws += w;
    }
    const m = Math.max(c[0], c[1], c[2]);
    const l = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / m;
    const k = (1 + 0.9 * (1 - l) ** 2) / m;                  // stored at half scale → ×2 in the shader
    for (let ch = 0; ch < 3; ch++) specData[i * 4 + ch] = Math.round(Math.min(1, (c[ch] * k) / 2) * 255);
    specData[i * 4 + 3] = 255;
  }
  const specTex = new THREE.DataTexture(specData, SPEC_N, 1, THREE.RGBAFormat);
  specTex.magFilter = specTex.minFilter = THREE.LinearFilter; specTex.needsUpdate = true;
  const SPECTRAL = /* glsl */ `
    uniform sampler2D uSpec;
    vec3 spectral(float u){ return texture2D(uSpec, vec2((clamp(u, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).rgb * 2.0; }`;

  // glass body: extruded triangle (bevelled so the edges catch speculars), custom additive glass shading —
  // fresnel sheen from a soft studio gradient, sharp key/sun speculars, and the beam's scatter glowing
  // through the body from its internal path. (No transmission pass: cheaper, and fully controllable.)
  const triShape = new THREE.Shape([tA, tB, tC]);
  const prismGeo = new THREE.ExtrudeGeometry(triShape, { depth: DEPTH, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3 });
  prismGeo.translate(0, 0, -DEPTH / 2);
  const E3 = V(Ein.x, Ein.y, 0), X3 = V(Xmid.x, Xmid.y, 0);
  const glassU = {
    uO: { value: 0 }, uBeam: { value: 0 }, uE: { value: E3 }, uX: { value: X3 },
    uKey: { value: key.position.clone().normalize() }, uSun: { value: S.clone() },
  };
  const glassMat = new THREE.ShaderMaterial({
    uniforms: glassU,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform float uO, uBeam; uniform vec3 uE, uX, uKey, uSun; varying vec3 vN; varying vec3 vW; varying vec3 vL;
      float segD(vec3 p, vec3 a, vec3 b){ vec3 ab = b - a; float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * h); }
      void main(){
        vec3 N = normalize(vN), Vd = normalize(cameraPosition - vW);
        if (!gl_FrontFacing) N = -N;
        float mu = abs(dot(N, Vd));
        float F = 0.04 + 0.96 * pow(1.0 - mu, 5.0);
        vec3 R = reflect(-Vd, N);
        vec3 env = mix(vec3(0.05, 0.04, 0.035), vec3(0.55, 0.48, 0.4), smoothstep(-0.2, 0.9, R.y)) + vec3(0.9, 0.7, 0.45) * pow(max(0.0, dot(R, normalize(uSun - vW))), 30.0) * 1.5;
        float spec = pow(max(0.0, dot(R, uKey)), 180.0) * 2.5;
        float dB = segD(vL, uE, uX);
        vec3 scatter = vec3(1.0, 0.97, 0.92) * (exp(-dB * dB / 0.004) * 0.55 + exp(-dB * 5.0) * 0.14) * uBeam;
        vec3 col = env * F * 0.9 + vec3(1.0, 0.95, 0.88) * spec * F * 4.0 + scatter + vec3(0.012, 0.014, 0.016);
        gl_FragColor = vec4(col * uO, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const prismMesh = new THREE.Mesh(prismGeo, glassMat); prismMesh.renderOrder = 2; prism.add(prismMesh);
  // polished arrises: nine thin rods whose brightness swells where the beam enters and leaves
  const edgeMat = new THREE.ShaderMaterial({
    uniforms: { uO: { value: 0 }, uBeam: { value: 0 }, uE: { value: E3 }, uX: { value: X3 } },
    vertexShader: /* glsl */ `varying vec3 vL; void main(){ vL = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uO, uBeam; uniform vec3 uE, uX; varying vec3 vL; uniform mat4 uInv;
      void main(){ vec3 p = (uInv * vec4(vL, 1.0)).xyz;
        float g = exp(-pow(length(p.xy - uE.xy), 2.0) / 0.02) + 0.8 * exp(-pow(length(p.xy - uX.xy), 2.0) / 0.02);
        float zf = exp(-p.z * p.z / 0.03);
        vec3 c = vec3(1.0, 0.94, 0.86) * (0.32 + g * zf * 2.2 * uBeam + g * 0.35 * uBeam);
        gl_FragColor = vec4(c * uO, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  edgeMat.uniforms.uInv = { value: prism.matrixWorld.clone().invert() };
  {
    const zf = DEPTH / 2 + 0.004, tri = [tA, tB, tC];
    const rodBetween = (a, b) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, len, 6, 1, true), edgeMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      prism.add(m);
    };
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      rodBetween(V(a.x, a.y, zf), V(b.x, b.y, zf));
      rodBetween(V(a.x, a.y, -zf), V(b.x, b.y, -zf));
      rodBetween(V(a.x, a.y, -zf), V(a.x, a.y, zf));
    }
  }
  // brass stand (cradle, column, foot) reaching down to the orrery's plinth level
  const baseY = Math.min(tA.y, tB.y);
  const BENCH = O.y - 0.365;                          // world y of the surface everything stands on (the orrery's bun feet)
  const standLen = (P.y + baseY - 0.05) - (BENCH + 0.06);
  const pcradle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.05, 0.05, 32), brassPolish); pcradle.position.y = baseY - 0.028; prism.add(pcradle);
  const pstand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, standLen, 20), brassPolish); pstand.position.y = baseY - 0.05 - standLen / 2; prism.add(pstand);
  // (the feet stand on the bench, below the film's frame: a satin cast finish — polished and clear-coated, their
  // flat tops mirrored the key light into a blown-out glint when Explore looks down at the bench)
  const footMat = new THREE.MeshStandardMaterial({ color: '#b08a55', metalness: 1, roughness: 0.55 });
  const pfoot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.06, 48), footMat); pfoot.position.y = baseY - 0.05 - standLen; prism.add(pfoot);
  // optical-bench fittings: a trunnion yoke holding the prism by its end faces (pivot bosses on the axis
  // through the centroid), a clamp collar with a thumbscrew on the stand, and a tripod spider on the foot
  {
    const cen = tA.clone().add(tB).add(tC).multiplyScalar(1 / 3);
    const zY = DEPTH / 2 + 0.035, yBar = baseY - 0.06;
    // (dark patinated bronze: polished brass this close to the orrery's sun bloomed into glowing bars through the glass)
    const yokeMat = new THREE.MeshStandardMaterial({ color: '#4a3220', metalness: 1, roughness: 0.5 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, zY * 2 + 0.05), yokeMat); bar.position.set(cen.x * 0, yBar, 0); prism.add(bar);
    for (const sz of [-1, 1]) {
      const h = cen.y - yBar;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.036, h + 0.04, 0.016), yokeMat);
      arm.position.set(cen.x * 0.5, yBar + h / 2, sz * zY); arm.rotation.z = Math.atan2(cen.x, h) * -1; prism.add(arm);
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 28), yokeMat); boss.rotation.x = Math.PI / 2; boss.position.set(cen.x, cen.y, sz * (zY - 0.005)); prism.add(boss);
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 16), bronzeDark); knob.rotation.x = Math.PI / 2; knob.position.set(cen.x, cen.y, sz * (zY + 0.03)); prism.add(knob);
    }
    const collarY = baseY - 0.05 - standLen * 0.42;
    const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.09, 28), brass); pc.position.y = collarY; prism.add(pc);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 10), brassPolish); screw.rotation.z = Math.PI / 2; screw.position.set(0.1, collarY, 0); prism.add(screw);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), bronzeDark); head.rotation.z = Math.PI / 2; head.position.set(0.15, collarY, 0); prism.add(head);
    const footY = baseY - 0.05 - standLen;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.3, leg = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.05), brass);
      leg.position.set(Math.cos(a) * 0.3, footY - 0.012, Math.sin(a) * 0.3); leg.rotation.y = -a; prism.add(leg);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.025, 16), bronzeDark); pad.position.set(Math.cos(a) * 0.46, footY - 0.02, Math.sin(a) * 0.46); prism.add(pad);
    }
  }

  // incoming beam: thin white-hot core + faint haze sheath (from the sun's surface to the entry point)
  const Ew = E3.clone(); prism.localToWorld(Ew);
  const sunEdge = S.clone().addScaledVector(Ew.clone().sub(S).normalize(), 0.26);
  const beam = progressTube(new THREE.LineCurve3(sunEdge, Ew), { radius: 0.0065, segments: 64, color: '#fff8f0', intensity: 3.2 });
  const beamHalo = progressTube(new THREE.LineCurve3(sunEdge, Ew), { radius: 0.035, segments: 64, color: '#ffeedd', intensity: 0.22, opacity: 0.5 });
  scene.add(beam, beamHalo);
  const entryGlow = glowSprite({ color: '#fff4e6', intensity: 1.1, scale: 0.35 }); entryGlow.position.copy(E3); prism.add(entryGlow);

  // spectral fans: columns (u) × rows (along the ray); vertex positions from per-column start/dir/length
  function fanMesh(starts, dirs, lens, frag, uniforms) {
    const pos = [], uvs = [], st = [], dr = [], ln = [], idx = [], ROWS = 24;
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= NU; i++) {
      // (the real rest positions, though the shader places the vertices: bounds, picking and scans see the fan's true shape)
      pos.push(starts[i].x + dirs[i].x * lens[i] * j / ROWS, starts[i].y + dirs[i].y * lens[i] * j / ROWS, 0); uvs.push(i / NU, j / ROWS);
      st.push(starts[i].x, starts[i].y, 0); dr.push(dirs[i].x, dirs[i].y, 0); ln.push(lens[i]);
    }
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(st, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
    g.setAttribute('aLen', new THREE.Float32BufferAttribute(ln, 1));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `attribute vec3 aStart, aDir; attribute float aLen; varying vec2 vUv; varying float vD; varying float vL;
        void main(){ vUv = uv; vD = uv.y * aLen; vL = aLen; vec3 p = aStart + aDir * vD; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: SPECTRAL + frag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
    return mesh;
  }
  // outer fan through the air: white where the colours still overlap at the exit face, separating with distance;
  // intensity falls as the fan widens; soft red/violet margins; a whisper of drifting haze
  const fanU = { uLen: { value: 0 }, uI: { value: 1 }, uTime: { value: 0 }, uSpec: { value: specTex } };
  const fan = fanMesh(exitP, exitD, lenAt, /* glsl */ `
    uniform float uLen, uI, uTime; varying vec2 vUv; varying float vD; varying float vL;
    void main(){
      if (vD > uLen) discard;
      float u = vUv.x;
      float edge = smoothstep(0.0, 0.07, u) * smoothstep(1.0, 0.9, u);
      float sep = smoothstep(0.0, 0.55, vD);
      vec3 c = mix(vec3(1.0, 0.97, 0.94) * 1.1, spectral(u), sep);
      float haze = 0.82 + 0.18 * sin(vD * 9.0 - uTime * 1.3 + sin(u * 7.0 + uTime) * 1.5);
      float front = 1.0 + 1.6 * smoothstep(uLen - 0.12, uLen, vD) * step(uLen, vL - 0.02);
      float landing = smoothstep(vL - 0.25, vL, vD);
      float I = uI * edge * haze * front * (0.34 / (1.0 + vD * 1.1)) * (1.0 - 0.35 * landing);
      gl_FragColor = vec4(c * I, 1.0);
    }`, fanU);
  prism.add(fan);
  // internal fan inside the glass (barely split, mostly white)
  const innerLens = exitP.map((X) => X.distanceTo(Ein));
  const innerU = { uLen: { value: 0 }, uI: { value: 1 }, uSpec: { value: specTex } };
  const innerFan = fanMesh(exitP.map(() => Ein), inD, innerLens, /* glsl */ `
    uniform float uLen, uI; varying vec2 vUv; varying float vD; varying float vL;
    void main(){
      if (vD > uLen * vL) discard;
      float u = vUv.x, s = vD / vL;
      float edge = smoothstep(0.0, 0.1, u) * smoothstep(1.0, 0.88, u);
      vec3 c = mix(vec3(1.0, 0.97, 0.93), spectral(u), 0.25 + 0.45 * s);
      gl_FragColor = vec4(c * uI * edge * (1.1 - 0.4 * s), 1.0);
    }`, innerU);
  prism.add(innerFan);
  // The fans above are sheets in the plane of incidence: face-on they read as a continuous spectrum, but a real
  // beam has a round cross-section (the hole in Newton's shutter), so the dispersed light is a flattened cone with
  // thickness. Volumetric rays: one camera-facing ribbon per wavelength (its width turns about the ray's own axis
  // toward whatever camera looks at it, so each ray is a soft glowing cylinder from any angle — film, live,
  // explore, Experience, headset). Face-on they overlap into the fan (white where they still coincide at the
  // exit face, separating into distinct coloured rays toward the card); edge-on they stack into a solid beam.
  const R_BEAM = 0.024;                                              // beam radius (the white beam's haze sheath)
  const RAY_K = 25;                                                  // rays across the spectrum (u = k / 24)
  const RAYS = /* glsl */ `
    attribute vec3 aStart, aDir; attribute float aLen, aU, aSide;
    uniform float uW0, uW1, uSp0, uSp1, uK, uLenF;
    varying float vD, vL, vU, vS, vF;
    void main(){
      float L = aLen * uLenF;
      float d = uv.y * L;
      vec4 mv = modelViewMatrix * vec4(aStart + aDir * d, 1.0);
      vec3 dv = normalize(mat3(modelViewMatrix) * aDir);
      vec3 sd = cross(dv, normalize(mv.xyz));
      float sl = length(sd);
      sd = sl > 1e-4 ? sd / sl : normalize(cross(dv, vec3(0.0, 1.0, 0.0)));
      float w = uW0 + uW1 * d, sp = max(1e-4, uSp0 + uSp1 * d);
      mv.xyz += sd * aSide * w;
      vD = d; vL = L; vU = aU; vS = aSide;
      vF = 1.0 / min(uK, 1.0 + 2.0 * w / sp);                        // overlap normalisation (face-on sum ≈ one sheet)
      gl_Position = projectionMatrix * mv;
    }`;
  function rayBundle(idxs, starts, dirs, lens, frag, uniforms, rows = 24) {
    const st = [], dr = [], ln = [], us = [], sd = [], uvs = [], pos = [], idx = [];
    idxs.forEach((i, k) => {
      const base = st.length / 3;
      for (let j = 0; j <= rows; j++) for (const s of [-1, 1]) {
        pos.push(starts[i].x + dirs[i].x * lens[i] * j / rows, starts[i].y + dirs[i].y * lens[i] * j / rows, s * R_BEAM); uvs.push(s * 0.5 + 0.5, j / rows);
        st.push(starts[i].x, starts[i].y, 0); dr.push(dirs[i].x, dirs[i].y, 0); ln.push(lens[i]); us.push(i / NU); sd.push(s);
      }
      for (let j = 0; j < rows; j++) { const a = base + j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('aStart', new THREE.Float32BufferAttribute(st, 3));
    g.setAttribute('aDir', new THREE.Float32BufferAttribute(dr, 3));
    g.setAttribute('aLen', new THREE.Float32BufferAttribute(ln, 1));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(sd, 1));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({
      uniforms, vertexShader: RAYS, fragmentShader: SPECTRAL + frag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false;
    return mesh;
  }
  const rayIdx = Array.from({ length: RAY_K }, (_, k) => Math.round((k / (RAY_K - 1)) * NU));
  // fan spread (red↔violet) grows linearly with distance from the exit face
  const spreadAt = (d) => V(exitP[0].x + exitD[0].x * d - exitP[NU].x - exitD[NU].x * d, exitP[0].y + exitD[0].y * d - exitP[NU].y - exitD[NU].y * d, 0).length();
  const sp0 = spreadAt(0) / (RAY_K - 1), sp1 = (spreadAt(lenAt[0]) - spreadAt(0)) / lenAt[0] / (RAY_K - 1);
  const rayU = {
    uLen: { value: 0 }, uI: { value: 1 }, uTime: { value: 0 }, uSpec: { value: specTex }, uLenF: { value: 1 },
    uW0: { value: R_BEAM }, uW1: { value: sp1 * 0.55 }, uSp0: { value: sp0 }, uSp1: { value: sp1 }, uK: { value: RAY_K },
  };
  const rays = rayBundle(rayIdx, exitP, exitD, lenAt, /* glsl */ `
    uniform float uLen, uI, uTime; varying float vD, vL, vU, vS, vF;
    void main(){
      if (vD > uLen) discard;
      float g = exp(-vS * vS * 3.2) * 0.75 + exp(-vS * vS * 22.0) * 0.5;   // soft sheath + brighter core
      float edge = smoothstep(-0.05, 0.06, vU) * smoothstep(1.05, 0.92, vU);
      float sep = smoothstep(0.0, 0.55, vD);
      vec3 c = mix(vec3(1.0, 0.97, 0.94) * 1.1, spectral(vU), sep);
      float haze = 0.85 + 0.15 * sin(vD * 9.0 - uTime * 1.3 + vU * 5.0);
      float front = 1.0 + 1.4 * smoothstep(uLen - 0.1, uLen, vD) * step(uLen, vL - 0.02);
      float landing = smoothstep(vL - 0.2, vL, vD);
      float I = uI * g * edge * haze * front * vF * (0.62 / (1.0 + vD * 0.9)) * (1.0 + 0.6 * landing);
      gl_FragColor = vec4(c * I, 1.0);
    }`, rayU);
  prism.add(rays);
  // inside the glass: the same rays, barely split, from the entry point to the exit face
  const innerRayU = { uLenF: { value: 0 }, uI: { value: 1 }, uSpec: { value: specTex }, uW0: { value: R_BEAM * 0.8 }, uW1: { value: 0 }, uSp0: { value: 1e-4 }, uSp1: { value: 0 }, uK: { value: 7 } };
  const innerRays = rayBundle([0, 12, 24, 36, 48, 60, 72], exitP.map(() => Ein), inD, innerLens, /* glsl */ `
    uniform float uI; varying float vD, vL, vU, vS, vF;
    void main(){
      float g = exp(-vS * vS * 3.0) * 0.7 + exp(-vS * vS * 20.0) * 0.6;
      float s = vD / max(vL, 1e-4);
      vec3 c = mix(vec3(1.0, 0.97, 0.93), spectral(vU), 0.2 + 0.45 * s);
      gl_FragColor = vec4(c * uI * g * vF * 1.3, 1.0);
    }`, innerRayU);
  prism.add(innerRays);
  // secondary rays: ~4 % external reflection off the entry face, internal reflection off the exit face
  // (landing on the base as a faint caustic) — the tell-tale ghosts of real glass
  const reflOut = reflect2(dIn, nLeft);
  // (drawn from its far end toward the prism with a full tail, so it is brightest at the glass and fades out)
  const ghostOut = progressTube(new THREE.LineCurve3(V(Ein.x + reflOut.x * 0.8, Ein.y + reflOut.y * 0.8, 0), E3.clone()), { radius: 0.0035, segments: 16, color: '#fff2e4', intensity: 0.3, tail: 1 });
  prism.add(ghostOut);
  const dRefl = reflect2(inD[NU >> 1], nRight);
  const sBase = Math.min(hitLine(Xmid, dRefl, tA, tB), hitLine(Xmid, dRefl, tA, tC));
  const Cst = Xmid.clone().addScaledVector(dRefl, Number.isFinite(sBase) ? sBase : 0.3);
  const ghostIn = progressTube(new THREE.LineCurve3(X3.clone(), V(Cst.x, Cst.y, 0)), { radius: 0.004, segments: 16, color: '#fff6ec', intensity: 0.22 });
  prism.add(ghostIn);
  const caustic = glowSprite({ color: '#ffe9d0', intensity: 0.5, scale: 0.16 }); caustic.position.set(Cst.x, Cst.y, 0); prism.add(caustic);

  // projection card: dark linen board on a slim brass post; the band is drawn in its shader from the
  // traced landing points (u mapped along the red→violet chord, gaussian across the beam width)
  const cardW = 0.95, cardH = 1.05;
  const cardGrp = new THREE.Group(); cardGrp.position.copy(Q);
  cardGrp.quaternion.setFromUnitVectors(V(0, 0, 1), cardN);
  prism.add(cardGrp);
  // align the card's local y with the band direction (red → violet chord projected in its plane)
  const chordW = hitAt[0].clone().sub(hitAt[NU]);
  {
    const yL = chordW.clone().applyQuaternion(cardGrp.quaternion.clone().invert()).setZ(0).normalize();
    cardGrp.rotateZ(Math.atan2(yL.y, yL.x) - Math.PI / 2);
  }
  const toCard = cardGrp.quaternion.clone().invert();
  const hitR = hitAt[0].clone().sub(Q).applyQuaternion(toCard), hitV = hitAt[NU].clone().sub(Q).applyQuaternion(toCard);
  const board = new THREE.Mesh(new THREE.BoxGeometry(cardW, cardH, 0.025), new THREE.MeshStandardMaterial({ color: '#23201d', roughness: 0.95, metalness: 0.0 }));
  board.position.z = -0.014; cardGrp.add(board);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(cardW + 0.03, cardH + 0.03, 0.02), bronzeDark); boardFrame.position.z = -0.03; cardGrp.add(boardFrame);
  // Newton's "oblong" image: every wavelength paints a disc the size of the beam where its ray lands, so the
  // spectrum is a band with rounded ends, red at the least-deviated end. Each colour lights as its own ray
  // arrives (violet has the shortest path to the tilted card, so it lands first): L(u) is the traced path
  // length, fitted as a quadratic through the red, middle and violet rays.
  const Lq0 = lenAt[0], Lqm = lenAt[NU >> 1], Lq1 = lenAt[NU];
  const bandU = {
    uLit: { value: 0 }, uI: { value: 1 }, uR: { value: new THREE.Vector2(hitR.x, hitR.y) }, uV: { value: new THREE.Vector2(hitV.x, hitV.y) },
    uReach: { value: 0 }, uLq: { value: V(Lq0, 4 * Lqm - 3 * Lq0 - Lq1, 2 * Lq0 + 2 * Lq1 - 4 * Lqm) }, uRw: { value: R_BEAM * 1.7 }, uSpec: { value: specTex },
  };
  const specBand = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), new THREE.ShaderMaterial({
    uniforms: bandU,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: SPECTRAL + /* glsl */ `uniform float uLit, uI, uReach, uRw; uniform vec2 uR, uV; uniform vec3 uLq; varying vec2 vP;
      void main(){
        vec2 ax = uV - uR; float L = length(ax); vec2 dir = ax / L;
        float u = dot(vP - uR, dir) / L, uc = clamp(u, 0.0, 1.0);
        float across = dot(vP - uR, vec2(-dir.y, dir.x));
        float dist = length(vP - (uR + ax * uc));                    // to the red→violet chord (rounded ends)
        float Lu = uLq.x + uLq.y * uc + uLq.z * uc * uc;
        float lit = smoothstep(Lu - 0.01, Lu + 0.05, uReach);
        float cov = smoothstep(uRw, uRw * 0.5, dist);
        float core = exp(-dist * dist / (uRw * uRw * 0.18));
        vec3 c = spectral(uc) * (cov * 0.95 + core * 0.45);
        float scatter = exp(-across * across / 0.02) * exp(-pow(max(0.0, abs(u - 0.5) - 0.5) * 6.0, 2.0)) * 0.07;
        c += spectral(uc) * scatter;
        gl_FragColor = vec4(c * uI * lit * uLit, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  specBand.position.z = 0.002; cardGrp.add(specBand);
  // the card's post reaches right down to the bench (prism-local y of the orrery's standing surface), on a tripod foot
  const benchY = BENCH - P.y;
  const postTop = Q.y - cardH / 2 + 0.1, postLen = Math.max(0.5, postTop - benchY);
  const cardPost = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, postLen, 12), brassPolish);
  cardPost.position.set(Q.x, postTop - postLen / 2, Q.z - 0.05); prism.add(cardPost);
  {
    const cp = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.08, 20), brass); cp.position.set(Q.x, postTop - 0.04, Q.z - 0.05); prism.add(cp);
    const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.05, 36), footMat); cf.position.set(Q.x, benchY + 0.025, Q.z - 0.05); prism.add(cf);
  }

  const lamRed = new TextPlane('λ 700 nm', { font: FONTS.mono, height: 0.04, letterSpacing: 0.2, color: '#ffc2b0', intensity: 1.1 });
  const lamVio = new TextPlane('λ 400 nm', { font: FONTS.mono, height: 0.04, letterSpacing: 0.2, color: '#d6c8ff', intensity: 1.1 });
  const capO = new TextPlane('NEWTON · OPTICKS · 1704', { font: FONTS.mono, height: 0.04, letterSpacing: 0.3, color: '#fff0dc', intensity: 1.0 });
  const eqN = equation([['n = sin θ'], ['1', 'sub'], [' / sin θ'], ['2', 'sub']], { height: 0.1, intensity: 1.4, color: '#fff0dc' });
  prism.add(capO, eqN);
  cardGrp.add(lamRed, lamVio);
  eqN.position.set(1.8, 0.24, 0.05); capO.position.set(1.8, 0.12, 0.05);
  {
    // pencilled onto the card beside each end of the band
    const across = V(hitR.y - hitV.y, -(hitR.x - hitV.x), 0).normalize();
    if (across.x < 0) across.negate();
    lamRed.position.copy(hitR).addScaledVector(across, 0.2).add(V(0, 0.03, 0.004));
    lamVio.position.copy(hitV).addScaledVector(across, 0.2).add(V(0, -0.03, 0.004));
  }

  // ---- Explore 3D only: the walnut bench under the orrery and the prism (the film keeps them in the dark)
  const bench = (() => {
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), r = rng(515);
    for (let i = 0; i < 12; i++) {
      const l = 0.8 + r() * 0.3, x0 = (i * N) / 12, w = N / 12;
      g.fillStyle = `rgb(${Math.round(52 * l)},${Math.round(31 * l)},${Math.round(17 * l)})`; g.fillRect(x0, 0, w, N);
      for (let k = 0; k < 70; k++) { g.strokeStyle = `rgba(${r() < 0.5 ? '15,7,2' : '110,70,38'},${0.1 + r() * 0.15})`; g.lineWidth = 1 + r() * 1.5; const xx = x0 + r() * w; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + (r() - 0.5) * 20, N * 0.3, xx + (r() - 0.5) * 20, N * 0.7, xx + (r() - 0.5) * 14, N); g.stroke(); }
      g.fillStyle = 'rgba(6,3,1,0.95)'; g.fillRect(x0, 0, 2, N);
    }
    g.globalCompositeOperation = 'destination-in';
    const fade = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N / 2);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = fade; g.fillRect(0, 0, N, N);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.CircleGeometry(9, 96), new THREE.MeshStandardMaterial({ map: tex, color: '#8a8a8a', transparent: true, roughness: 0.72, metalness: 0, envMapIntensity: 0.35 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((O.x + P.x) / 2 + 0.6, BENCH - 0.001, (O.z + P.z) / 2);
    m.visible = false; scene.add(m);
    return m;
  })();

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
  const camEnd = P.clone().addScaledVector(d0, 3.45).addScaledVector(beamDir, 0.8).add(V(0, -0.2, 0));
  const tgtEnd = P.clone().addScaledVector(beamDir, 1.0).add(V(0, -0.42, 0));
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
  let dirElev = 0;
  const dirToS = V(0, 0, 1);

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    bench.visible = false;
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
    armil.userData.zod.rotation.y = t * 0.6;                         // (the zodiac band turns with its ecliptic ring)
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
    PL.forEach((p) => {
      p.grp.rotation.y = p.phase + tw * p.w; p.hold.rotation.y = -p.grp.rotation.y;
      p.planet.rotation.y = p.spin0 + t * p.spin;
      if (p.moonGrp) p.moonGrp.rotation.y = tw * 3.0;
    });
    earthMat.uniforms.uCloudOff.value = t * 0.006;
    PU.uTime.value = t;
    const thC = t * 0.35;
    crownSpin.rotation.z = thC;
    pinions.forEach((pp) => { pp.grp.rotation.z = meshAngle(thC, 56, pp.pz, pp.dir); });
    const op = ramp(t, tOrr - 0.1, tOrr + 0.8, ease.inOutCubic);
    orbitLines.forEach((l, i) => { l.progress = sat(op * 1.4 - i * 0.07); l.opacity = 1 - smoothstep(4.3, 4.8, t) * 0.7; });
    orbitTicks.forEach((l, i) => { l.progress = sat(op * 1.4 - 0.25 - i * 0.05); l.opacity = 1 - smoothstep(4.3, 4.8, t) * 0.7; });
    zodiacLabels.forEach((l, i) => { l.opacity = sat(op * 2 - 0.5 - i * 0.04); });
    const sunI = 1 + 0.08 * Math.sin(T * 9.0);
    sunMat.uniforms.uI.value = 1.7 * sunI * (1 + envelope(t, tBeam - 0.3, tBeam + 0.3, 0.2, 0.2) * 0.9);   // bright but still a textured sphere, not a clipped white disc
    sunLight.intensity = 18 * ramp(t, 1.9, 2.5);   // brass under a close point light was blooming into a gold wash
    dirElev = elevOf(camPos);                       // the film's eye as seen from the sun (explorePosed compares against it)
    dirToS.copy(camPos).sub(S).normalize();
    for (const m of glintMats) m.envMapIntensity = ENV_I;
    sunGlow.material.opacity = 1; sun.rotation.y = t * 0.3; sunMat.uniforms.uT.value = t;
    PU.uSunI.value = 1.35 * (1 + envelope(t, tBeam - 0.3, tBeam + 0.3, 0.2, 0.2) * 0.1);

    // light: beam → prism → spectrum (the light itself is slow-motion: the fan unfurls over ~0.45 s)
    const bp = ramp(t, tBeam - 0.28, tBeam, ease.inQuad);
    beam.progress = bp; beamHalo.progress = bp;
    beam.opacity = bp > 0 ? 1 : 0; beamHalo.opacity = bp > 0 ? 0.5 : 0;
    const hit = t - tBeam;
    const on = hit > 0 ? 1 : 0;
    entryGlow.visible = hit > -0.02;
    entryGlow.scale.setScalar(0.22 + 0.5 * Math.exp(-Math.max(0, hit) * 8) * sat((hit + 0.02) / 0.02));
    innerU.uLen.value = sat(hit / 0.05);
    innerU.uI.value = 0.9 * on;
    innerFan.visible = hit > 0;
    const fe = ease.outCubic(sat((hit - 0.04) / 0.5));
    fanU.uLen.value = fe * (lenAt[0] + 0.05);
    fanU.uI.value = 1 + 0.5 * Math.exp(-Math.max(0, hit - 0.1) * 5);
    fanU.uTime.value = t;
    fan.visible = hit > 0.04;
    rayU.uLen.value = fanU.uLen.value; rayU.uI.value = fanU.uI.value; rayU.uTime.value = t; rays.visible = fan.visible;
    innerRayU.uLenF.value = innerU.uLen.value; innerRayU.uI.value = innerU.uI.value; innerRays.visible = innerFan.visible;
    const reach = fanU.uLen.value;
    bandU.uLit.value = sat((reach - Math.min(lenAt[0], lenAt[NU]) + 0.05) / 0.1);
    bandU.uReach.value = reach;
    bandU.uI.value = 1 + 0.35 * Math.exp(-Math.max(0, hit - 0.45) * 5);
    specBand.visible = bandU.uLit.value > 0;
    ghostIn.progress = sat((hit - 0.02) / 0.08); ghostOut.progress = 1;
    ghostOut.opacity = ghostIn.opacity = 0.6 * sat((hit - 0.02) / 0.06);
    caustic.visible = hit > 0.08;
    const glassO = ramp(t, 3.3, 3.8);
    glassU.uO.value = glassO; glassU.uBeam.value = on * (1 + 0.8 * Math.exp(-Math.max(0, hit) * 6));
    edgeMat.uniforms.uO.value = glassO; edgeMat.uniforms.uBeam.value = glassU.uBeam.value;
    lamRed.reveal = lamVio.reveal = ramp(t, tBeam + 0.4, tBeam + 0.7);
    lamRed.opacity = lamVio.opacity = ramp(t, tBeam + 0.4, tBeam + 0.45);
    eqN.reveal = ramp(t, tBeam + 0.05, tBeam + 0.45, ease.outCubic); eqN.opacity = ramp(t, tBeam + 0.05, tBeam + 0.1);
    capO.reveal = ramp(t, tBeam + 0.15, tBeam + 0.5, ease.outCubic); capO.opacity = eqN.opacity * 0.9;
    prism.visible = t > 3.0;
    // the grade's colour harmony steps aside so the spectrum shows every true hue
    // (the harmony only pulls off-palette hues; while the orrery is on show it eases so the planets keep
    // their true colours — Earth's oceans, the ice giants' blues — and the brass is untouched)
    out.harmony = Math.min(1 - 0.85 * envelope(t, 2.2, 4.05, 0.35, 0.2), 1 - 0.97 * ramp(t, tBeam - 0.05, tBeam + 0.2));

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
    else { dof.focus = camera.position.distanceTo(P) + 0.1; dof.range = 1.8; dof.amount = 0.4; }
    if (t >= 3.4 && t < 3.8) dof.focus = lerp(camera.position.distanceTo(S) * 0.75, camera.position.distanceTo(P), smoothstep(3.4, 3.8, t));
    // bloom eases while the orrery is close so the bodies' surfaces read through the glow
    bloom.strength = (0.55 + 0.2 * smoothstep(tBeam, tSpec, t)) * (1 - 0.22 * envelope(t, 2.3, 3.85, 0.3, 0.2));
  }

  function explore(t) {
    if (t > 1.8) { bench.visible = true; out.harmony = Math.min(out.harmony, 0.15); }
    // once the camera has swooped down to the orrery the instruments of shot 2 hang far overhead, out of the
    // film's frame: off-axis they read as leftovers of the previous shot floating in the void
    if (t > 2.6) scope.visible = armil.visible = gearGrp.visible = diag.visible = false;
    if (ctx.engine?.headingsHidden) bloom.strength *= 1 - 0.2 * headingDuck(ctx, out, t + segment.start);
  }
  // labels turn to the viewer's camera (the film turns them to its own); the Opticks caption on the prism too
  const _qp = new THREE.Quaternion(), _cw = new THREE.Vector3();
  const elevOf = (p) => Math.asin(clamp((p.y - S.y) / Math.max(1e-3, p.distanceTo(S)), -1, 1));
  function explorePosed(cam) {
    cam.updateMatrixWorld();
    // the orrery's sun lamp and the studio reflections flare off the flat brass of the dial, crown gear and
    // pinions: seen from off the film's line of sight (above it most of all) they bloomed into a white-hot
    // disc — the further the view turns away from the film's, the more both are eased (update() resets them)
    if (orrery.visible) {
      _cw.setFromMatrixPosition(cam.matrixWorld);
      const up = smoothstep(dirElev + 0.08, dirElev + 0.45, elevOf(_cw));
      const turn = smoothstep(0.12, 0.6, Math.acos(clamp(_cw.sub(S).normalize().dot(dirToS), -1, 1)));
      const k = Math.max(up, turn);
      sunLight.intensity *= 1 - 0.65 * k;
      for (const m of glintMats) m.envMapIntensity = ENV_I * (1 - 0.7 * k);
    }
    for (const l of labels3D) l.quaternion.copy(cam.quaternion);
    if (prism.visible) {
      _qp.copy(prism.quaternion).invert().multiply(cam.quaternion);
      eqN.quaternion.copy(_qp); capO.quaternion.copy(_qp);
    }
  }
  const out = { scene, camera, update, explore, explorePosed, hud, dof, bloom, exposure: 1, harmony: 1, background: BG, exploreLimits: { yaw: 1.2, pitchDown: 0.35, pitchUp: 0.85, zoomOut: 2.6 } };
  return out;
}
