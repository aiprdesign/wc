// FINAL MONTAGE (45.5–50.5 s) — shape-driven match cuts + motion-graphics rhythm editing.
//
// One continuous top-down "plan view" in which every motif is born from the geometry
// of the previous one (no cuts):
//   45.6 mColumns  ring of fluted marble columns (camera cranes from oblique to plan view)
//   46.4 mGears    the abaci of the capitals ARE the teeth of a bronze gear (columns sink,
//                  gear rises in exactly the same silhouette); two gears mesh left/right
//   47.2 mOrbits   the gear's hub / rim / pitch circles and the side-gear centres become
//                  orbit rings; the side gears shrink into planets, the hub into the sun
//   48.0 mAtoms    the orbits contract and tilt into electron orbitals, planets become
//                  electrons, the sun condenses into a nucleus
//   48.8 mCircuit  the atom shrinks into one node of a lattice of atoms whose orbitals
//                  round off into circuit pads; copper traces grow between them
//   49.6 mStars    pads and traces dissolve into particles that scatter in depth — the
//                  camera dives through them into a starfield (dissolve → finale)
// Accents: sub-second flashes on the beat grid (sketch, steam, equation, spark, ECG,
// chip, aircraft, rocket, network), dimming the plate beneath them. Beat punches get
// denser (1/4 → 1/8 → 1/16 notes) as the sequence accelerates.
import * as THREE from 'three';
import { CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { MorphParticles, sampleRing, Dust } from '../lib/particles.js';
import { progressLine, segmentsLine, circlePoints, goldenSpiralPoints } from '../lib/lines.js';
import { marble, bronze, steel, glowSprite } from '../lib/materials.js';
import { RingGauge } from '../lib/hud.js';
import { sat, lerp, smoothstep, ease, timeWarp, rng, envelope, TAU } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';

// ---------------------------------------------------------------------------
// Geometry helpers

// Spur gear in the XZ plane (top face at y = depth), teeth centred on angles k·2π/teeth.
function gearGeometry({ teeth = 12, root = 2.0, tip = 2.4, rimIn = 1.55, hub = 0.62, axle = 0.18, spokes = 6, spokeW = 0.3, depth = 0.35, windows = true }) {
  const s = new THREE.Shape();
  const pa = TAU / teeth, hr = pa * 0.29, ht = pa * 0.16;
  const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  let first = true;
  for (let k = 0; k < teeth; k++) {
    const c = k * pa;
    const pts = [P(c - hr, root), P(c - ht, tip), P(c + ht, tip), P(c + hr, root)];
    for (let j = 1; j < 5; j++) pts.push(P(c + hr + ((pa - 2 * hr) * j) / 5, root));
    for (const [x, y] of pts) { if (first) { s.moveTo(x, y); first = false; } else s.lineTo(x, y); }
  }
  s.closePath();
  const ax = new THREE.Path(); ax.absarc(0, 0, axle, 0, TAU, true); s.holes.push(ax);
  if (windows) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * TAU + pa / 2, a1 = ((i + 1) / spokes) * TAU + pa / 2;
      const oo = Math.asin(spokeW / 2 / rimIn), oi = Math.asin(Math.min(0.9, spokeW / 2 / hub));
      const w = new THREE.Path();
      w.absarc(0, 0, rimIn, a0 + oo, a1 - oo, false);
      w.absarc(0, 0, hub, a1 - oi, a0 + oi, true);
      w.closePath();
      s.holes.push(w);
    }
  }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 2, curveSegments: 40 });
  g.rotateX(-Math.PI / 2);   // shape angle a → world (cos a, ·, −sin a); CCW seen from above
  return g;
}

function flutedShaft(r = 0.22, h = 2.6) {
  const g = new THREE.CylinderGeometry(r * 0.88, r, h, 120, 6, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const a = Math.atan2(z, x), k = 1 - 0.07 * Math.abs(Math.sin(a * 10));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(77);
  for (let i = 0; i < 14; i++) {
    const x = 64 + (r() - 0.5) * 50, y = 64 + (r() - 0.5) * 50, rad = 20 + r() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ∫ smoothstep((τ−a)/(b−a)) dτ from a to t — lets angular speed ramp up while the angle stays a pure function of t.
function intSmooth(t, a, b) {
  if (t <= a) return 0;
  const L = b - a;
  if (t >= b) return L * 0.5 + (t - b);
  const u = (t - a) / L;
  return L * (u * u * u - (u * u * u * u) / 2);
}

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 300);
  const cue = (n) => CUES[n] - segment.start;
  const C0 = cue('mColumns'), C1 = cue('mGears'), C2 = cue('mOrbits'), C3 = cue('mAtoms'), C4 = cue('mCircuit'), C5 = cue('mStars');
  const DUR = segment.end - segment.start;
  const r = rng(90210);

  // lights
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-6, 10, 4);
  const rim = new THREE.DirectionalLight(0xbcd4ff, 1.6);
  rim.position.set(6, 3, -7);
  const sunLight = new THREE.PointLight(0xffc680, 0, 30, 1.2);
  scene.add(key, rim, sunLight);
  const WARM = new THREE.Color(1.0, 0.84, 0.64), COOL = new THREE.Color(0.72, 0.84, 1.0);

  // ---- S0: ring of fluted Doric columns on a stepped stylobate ------------
  const RING = 2.2, NCOL = 12;
  const marbleMat = marble({ seed: 3, repeat: 1, color: '#f0e9de', roughness: 0.32 });
  const MARBLE_BASE = marbleMat.color.clone();
  const shaftGeo = flutedShaft(0.22, 2.6);
  const echinusGeo = new THREE.CylinderGeometry(0.31, 0.2, 0.16, 48); echinusGeo.translate(0, 2.68, 0);
  const abacusGeo = new THREE.BoxGeometry(0.6, 0.12, 0.6); abacusGeo.translate(0, 2.82, 0);
  const shafts = new THREE.InstancedMesh(shaftGeo, marbleMat, NCOL);
  const echini = new THREE.InstancedMesh(echinusGeo, marbleMat, NCOL);
  const abaci = new THREE.InstancedMesh(abacusGeo, marbleMat, NCOL);
  const colGroup = new THREE.Group();
  colGroup.add(shafts, echini, abaci);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < NCOL; k++) {
    const a = (k / NCOL) * TAU;
    m4.makeRotationY(a).setPosition(Math.cos(a) * RING, 0, -Math.sin(a) * RING);
    shafts.setMatrixAt(k, m4); echini.setMatrixAt(k, m4); abaci.setMatrixAt(k, m4);
  }
  const stepMat = marble({ seed: 5, repeat: 2, color: '#6a645b', roughness: 0.45 });
  const steps = new THREE.Group();
  [[1.85, 2.6, 0.12, -0.12], [1.75, 2.78, 0.12, -0.24], [1.65, 2.96, 0.12, -0.36]].forEach(([ri, ro, h, y]) => {
    const sh = new THREE.Shape(); sh.absarc(0, 0, ro, 0, TAU, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, TAU, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 96 });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, stepMat); m.position.y = y;
    steps.add(m);
  });
  colGroup.add(steps);
  scene.add(colGroup);
  const floorMat = new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.7, metalness: 0.0, transparent: true });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 64), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.37;
  scene.add(floor);

  // ---- S1: gears ----------------------------------------------------------
  const bronzeMat = bronze(0.32); bronzeMat.transparent = true;
  const steelMat = steel({ roughness: 0.3 }); steelMat.transparent = true;
  const GEAR_D = 0.35;
  const mainGear = new THREE.Mesh(gearGeometry({ teeth: 12, root: 2.0, tip: 2.38, rimIn: 1.55, hub: 0.62, spokeW: 0.3, depth: GEAR_D }), bronzeMat);
  const pitch = 2.19, circ = (pitch * TAU) / 12;
  const p2 = (8 * circ) / TAU;                        // side gears: 8 teeth, same circular pitch
  const CD = pitch + p2;
  const sideGeo = gearGeometry({ teeth: 8, root: p2 - 0.19, tip: p2 + 0.19, rimIn: p2 - 0.55, hub: 0.36, spokes: 4, spokeW: 0.22, depth: GEAR_D });
  const sideR = new THREE.Mesh(sideGeo, steelMat), sideL = new THREE.Mesh(sideGeo, steelMat);
  sideR.position.x = CD; sideL.position.x = -CD;
  scene.add(mainGear, sideR, sideL);

  // ---- S2/S3: orbit rings → orbitals --------------------------------------
  const orrery = new THREE.Group();
  scene.add(orrery);
  const unitCircle = circlePoints(1, 256, { plane: 'xz' });
  const ringDefs = [
    { rO: 0.62, rA: 0.34, phi: 0, col: '#ffcf85' },
    { rO: 1.55, rA: 1.9, phi: 0, col: '#ffd9a0' },
    { rO: 2.19, rA: 1.9, phi: Math.PI / 3, col: '#e6c9a0' },
    { rO: CD, rA: 1.9, phi: (2 * Math.PI) / 3, col: '#cfd9e6' },
    { rO: 5.3, rA: 2.7, phi: 0, col: '#a3aeb9' },
  ];
  const tiltX = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), THREE.MathUtils.degToRad(72));
  const rings = ringDefs.map((d) => {
    const line = progressLine(unitCircle, { color: d.col, intensity: 1.4, head: 0.03, headColor: '#ffffff' });
    line.qA = new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), d.phi).multiply(tiltX);
    orrery.add(line);
    return Object.assign(line, d);
  });
  const gauge = new RingGauge(6.1, { ticks: 120, color: '#e2c9a0', intensity: 0.8, tickLen: 0.08, majorEvery: 10 });
  gauge.rotation.x = -Math.PI / 2;
  orrery.add(gauge);

  // planets (become electrons)
  const planetDefs = [
    { ring: 1, a0: 2.2, size: 0.13, color: '#c9b8a0' },
    { ring: 2, a0: 4.0, size: 0.17, color: '#b07a45' },
    { ring: 3, a0: 0.0, size: 0.24, color: '#8fa3b8', gear: sideR },
    { ring: 3, a0: Math.PI, size: 0.2, color: '#d7c3a0', gear: sideL },
    { ring: 4, a0: 1.1, size: 0.16, color: '#9aa6b3' },
  ];
  const sphereGeo = new THREE.SphereGeometry(1, 48, 24);
  const planets = planetDefs.map((d) => {
    const m = new THREE.Mesh(sphereGeo, new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.55, metalness: 0.15, emissive: new THREE.Color('#bfe0ff'), emissiveIntensity: 0 }));
    const glow = glowSprite({ color: '#cfe8ff', intensity: 2.5, scale: 0.6 });
    orrery.add(m, glow);
    const omega = 3.0 * Math.pow(ringDefs[d.ring].rO, -1.5);
    return Object.assign(d, { mesh: m, glow, omega });
  });
  // sun → nucleus
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc978').multiplyScalar(3) }));
  const sunGlow = glowSprite({ color: '#ffb35c', intensity: 2.2, scale: 2.8 });
  orrery.add(sun, sunGlow);
  const nucleus = new THREE.Group();
  const protonMat = new THREE.MeshStandardMaterial({ color: '#efe4d2', roughness: 0.3, metalness: 0.1 });
  const neutronMat = new THREE.MeshStandardMaterial({ color: '#7f9bbf', roughness: 0.28, metalness: 0.55 });
  for (let i = 0; i < 16; i++) {
    const u = r() * 2 - 1, th = r() * TAU, s = Math.sqrt(1 - u * u), rr = 0.2 * Math.cbrt(r());
    const m = new THREE.Mesh(sphereGeo, i % 2 ? protonMat : neutronMat);
    m.position.set(s * Math.cos(th) * rr, u * rr, s * Math.sin(th) * rr);
    m.scale.setScalar(0.105);
    nucleus.add(m);
  }
  const nucGlow = glowSprite({ color: '#9cc8ff', intensity: 1.5, scale: 1.6 });
  nucleus.add(nucGlow);
  orrery.add(nucleus);

  // ---- S4: lattice of atoms → circuit -------------------------------------
  const SP = 1.15, nodes = [];
  for (let j = -3; j <= 3; j++) for (let i = -7; i <= 7; i++) {
    if (i === 0 && j === 0) { nodes.push({ i, j, x: 0, z: 0, center: true }); continue; }
    if (r() < 0.3) continue;
    nodes.push({ i, j, x: i * SP, z: j * SP });
  }
  const others = nodes.filter((n) => !n.center);
  // mini atoms (3 ellipses each) — shader rounds them into pad circles
  const SEG = 28;
  const maPos = new Float32Array(others.length * 3 * SEG * 2 * 3);
  const maPar = new Float32Array(others.length * 3 * SEG * 2 * 2);
  let vi = 0;
  for (const n of others) for (let e = 0; e < 3; e++) for (let s = 0; s < SEG; s++) for (const k of [s, s + 1]) {
    maPos.set([n.x, 0, n.z], vi * 3);
    maPar.set([(k / SEG) * TAU, (e * Math.PI) / 3 + 0.0], vi * 2);
    vi++;
  }
  const maGeo = new THREE.BufferGeometry();
  maGeo.setAttribute('position', new THREE.BufferAttribute(maPos, 3));
  maGeo.setAttribute('aPar', new THREE.BufferAttribute(maPar, 2));
  const maMat = new THREE.ShaderMaterial({
    uniforms: { uS: { value: 0.42 }, uRound: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#bcd8ff').multiplyScalar(1.3) } },
    vertexShader: /* glsl */ `attribute vec2 aPar; uniform float uS, uRound;
      void main(){ float c = cos(aPar.y), s = sin(aPar.y);
        vec2 e = vec2(cos(aPar.x), sin(aPar.x) * mix(0.31, 1.0, uRound)) * uS * mix(1.0, 0.32, uRound);
        vec3 p = position + vec3(c * e.x - s * e.y, 0.0, -(s * e.x + c * e.y));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor = vec4(uColor, uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const miniAtoms = new THREE.LineSegments(maGeo, maMat);
  miniAtoms.frustumCulled = false;
  scene.add(miniAtoms);
  const padGeo = new THREE.CircleGeometry(0.07, 24); padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc890').multiplyScalar(1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pads = new THREE.InstancedMesh(padGeo, padMat, nodes.length);
  nodes.forEach((n, k) => pads.setMatrixAt(k, m4.makeTranslation(n.x, 0.01, n.z)));
  scene.add(pads);
  // traces: Manhattan / 45° routing between lattice neighbours, growing outward from the centre node
  const key2 = (i, j) => `${i},${j}`;
  const map = new Map(nodes.map((n) => [key2(n.i, n.j), n]));
  const traceSegs = [];
  const addRoute = (a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    if (Math.abs(dz) < 1e-6 || Math.abs(dx) < 1e-6) { traceSegs.push([V3(a.x, 0.005, a.z), V3(b.x, 0.005, b.z)]); return; }
    const sx = Math.sign(dx), run = Math.abs(dx) - Math.abs(dz);
    const p1 = V3(a.x + sx * run * 0.5, 0.005, a.z), p2 = V3(p1.x + sx * Math.abs(dz), 0.005, b.z);
    traceSegs.push([V3(a.x, 0.005, a.z), p1], [p1, p2], [p2, V3(b.x, 0.005, b.z)]);
  };
  for (const n of nodes) {
    const right = map.get(key2(n.i + 1, n.j)) ?? map.get(key2(n.i + 2, n.j));
    if (right && r() < 0.75) addRoute(n, right);
    const diag = map.get(key2(n.i + 2, n.j + 1));
    if (diag && r() < 0.35) addRoute(n, diag);
    const down = map.get(key2(n.i, n.j + 1));
    if (down && r() < 0.45) addRoute(n, down);
  }
  // bus lines running off-frame
  for (let b = 0; b < 6; b++) {
    const zz = (b < 3 ? -3.9 : 3.9) + (b % 3) * 0.16 * (b < 3 ? 1 : -1);
    traceSegs.push([V3(-12, 0.005, zz), V3(12, 0.005, zz)]);
  }
  const traces = segmentsLine(traceSegs, {
    color: '#d7824a', headColor: '#ffffff', intensity: 1.25, head: 0.05,
    orderFn: (a, b) => sat(Math.hypot((a.x + b.x) / 2, (a.z + b.z) / 2 * 1.6) / 10) * 0.75, stagger: 0.75,
  });
  scene.add(traces);
  // pulses racing along traces
  const NPUL = 520;
  const puA = new Float32Array(NPUL * 3), puB = new Float32Array(NPUL * 3), puS = new Float32Array(NPUL * 2);
  for (let i = 0; i < NPUL; i++) {
    const [a, b] = traceSegs[Math.floor(r() * traceSegs.length)];
    puA.set([a.x, 0.02, a.z], i * 3); puB.set([b.x, 0.02, b.z], i * 3); puS.set([r(), r()], i * 2);
  }
  const puGeo = new THREE.BufferGeometry();
  puGeo.setAttribute('position', new THREE.BufferAttribute(puA, 3));
  puGeo.setAttribute('aB', new THREE.BufferAttribute(puB, 3));
  puGeo.setAttribute('aSeed', new THREE.BufferAttribute(puS, 2));
  const puMat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uSize: { value: 0.075 }, uViewport: { value: 800 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#dff0ff').multiplyScalar(2.6) } },
    vertexShader: /* glsl */ `attribute vec3 aB; attribute vec2 aSeed; uniform float uT, uSize, uViewport; varying float vA;
      void main(){ float f = fract(uT * (1.2 + aSeed.x * 2.5) + aSeed.y); vec3 p = mix(position, aB, f);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z); vA = sin(3.14159 * f); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(uColor, a * vA * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pulsesP = new THREE.Points(puGeo, puMat);
  pulsesP.frustumCulled = false;
  scene.add(pulsesP);
  // PCB substrate
  const pcbMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uOpacity; varying vec2 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 g = abs(fract(vP / 0.2875) - 0.5);
        float grid = smoothstep(0.47, 0.5, max(g.x, g.y)) * 0.5;
        vec2 G = abs(fract(vP / 1.15) - 0.5);
        grid += smoothstep(0.485, 0.5, max(G.x, G.y));
        float n = h(floor(vP * 40.0)) * 0.012;
        vec3 c = vec3(0.012, 0.022, 0.03) + vec3(0.02, 0.05, 0.07) * grid + n;
        float fade = smoothstep(14.0, 5.0, length(vP * vec2(0.6, 1.0)));
        gl_FragColor = vec4(c, uOpacity * fade);
      }`,
    transparent: true, depthWrite: false,
  });
  const pcb = new THREE.Mesh(new THREE.PlaneGeometry(34, 20), pcbMat);
  pcb.rotation.x = -Math.PI / 2; pcb.position.y = -0.03;
  scene.add(pcb);

  // ---- S5: particles: nodes + traces → starfield ---------------------------
  const NST = 14000;
  const stA = new Float32Array(NST * 3), stB = new Float32Array(NST * 3), stC = new Float32Array(NST * 3);
  for (let i = 0; i < NST; i++) {
    let x, z;
    if (i < nodes.length * 24) { const n = nodes[i % nodes.length], a = r() * TAU, rr = 0.07 + r() * 0.06; x = n.x + Math.cos(a) * rr; z = n.z + Math.sin(a) * rr; }
    else { const [a, b] = traceSegs[Math.floor(r() * traceSegs.length)]; const u = r(); x = lerp(a.x, b.x, u); z = lerp(a.z, b.z, u); }
    stA.set([x, 0.02, z], i * 3);
    const depth = Math.pow(r(), 0.8);
    const y = 1.5 - depth * 150;
    const spread = 2 + depth * 20;
    stB.set([(r() - 0.5) * spread * 2.2 + x * 0.5, y, (r() - 0.5) * spread * 2.2 + z * 0.5], i * 3);
    const warm = r() < 0.12, bl = r() < 0.4;
    stC.set(warm ? [1.0, 0.82, 0.6] : bl ? [0.7, 0.85, 1.0] : [0.95, 0.97, 1.0], i * 3);
  }
  const stars = new MorphParticles({ count: NST, positions: stA, targets: stB, colors: stC, size: 0.085, intensity: 2.2, stagger: 0.5, seed: 31 });
  stars.u.sizeJitter = 0.7;
  stars.u.twinkle = 0.3;
  scene.add(stars);

  // morph sparks: a ring of embers blown outward on every morph cue
  const burst = new MorphParticles({ count: 1600, positions: sampleRing(1600, RING, { thickness: 0.35, seed: 8 }), size: 0.045, intensity: 2.5, seed: 12 });
  burst.u.scatter = 0;
  scene.add(burst);
  const dust = new Dust({ count: 900, size: [16, 6, 10], center: [0, 1.5, 0], color: '#ffe2b0', particleSize: 0.03, opacity: 0.35, intensity: 1.2, seed: 4 });
  scene.add(dust);

  // ---- HUD: accents + stage labels ----------------------------------------
  const hud = ctx.makeHUD();
  const A = ctx.aspect;
  // open-matte delivery (?aspect=1 …): keep these labels anchored bottom-left, scaled up to stay legible
  // and lifted clear of the showreel HUD line (identity in the 2.39 frame)
  const SQ = OUTPUT_ASPECT < 1.5, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y);
  const dim = new THREE.Mesh(new THREE.PlaneGeometry(A * 2 + 0.1, 2.1 * HH), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  dim.position.z = -2; dim.renderOrder = -1;
  hud.scene.add(dim);
  const accents = [];
  const addAccent = (t0, t1, group, anim) => { group.visible = false; hud.scene.add(group); accents.push({ t0, t1, group, anim }); };
  const HV = (x, y) => V3(x, y, 0);

  // 1 · Renaissance construction (circle, square, golden spiral) in sepia ink
  {
    const g = new THREE.Group(); g.position.set(1.45, 0.02, 0);
    const col = { color: '#e0b77a', headColor: '#fff2d8', intensity: 1.3, head: 0.03 };
    const circle = progressLine(circlePoints(0.68, 160, { start: Math.PI / 2, end: Math.PI / 2 + TAU }), col);
    const sq = progressLine([HV(-0.6, -0.68), HV(0.6, -0.68), HV(0.6, 0.52), HV(-0.6, 0.52), HV(-0.6, -0.68)], col);
    const sp = progressLine(goldenSpiralPoints(0.62, 3, 240).map((p) => p.add(HV(0.05, -0.05))), { ...col, intensity: 0.9 });
    const cross = segmentsLine([[HV(-0.9, 0), HV(0.9, 0)], [HV(0, -0.9), HV(0, 0.9)], [HV(-0.6, -0.68), HV(0.6, 0.52)], [HV(0.6, -0.68), HV(-0.6, 0.52)]], { ...col, intensity: 0.5, stagger: 0.5 });
    const cap = new TextPlane('de divina proportione', { font: FONTS.serif, italic: true, weight: 500, height: 0.07, color: '#f0d6a8', intensity: 1.2 });
    cap.position.set(0, -0.84, 0);
    g.add(circle, sq, sp, cross, cap);
    addAccent(1.0, 1.32, g, (u) => { circle.progress = sat(u * 2); sq.progress = sat(u * 2.4 - 0.2); sp.progress = sat(u * 1.8 - 0.3); cross.progress = sat(u * 2 - 0.4); cap.reveal = sat(u * 3 - 0.8); });
  }
  // 2 · steam puffs from a piston stack
  {
    const g = new THREE.Group(); g.position.set(-1.55, -0.2, 0);
    const tex = puffTexture();
    const puffs = [];
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color('#fff4e4').multiplyScalar(1.1), transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending }));
      m.userData = { d: (i % 10) * 0.03 + r() * 0.05, dx: (r() - 0.5) * 0.9, s: 0.12 + r() * 0.2, rot: r() * TAU, h: 0.5 + r() * 0.6 };
      g.add(m); puffs.push(m);
    }
    const stack = segmentsLine([[HV(-0.1, -0.75), HV(-0.1, -0.35)], [HV(0.1, -0.75), HV(0.1, -0.35)], [HV(-0.16, -0.35), HV(0.16, -0.35)]], { color: '#d9c49b', intensity: 1.1, orderFn: () => 0, stagger: 0 });
    const lab = new TextPlane('VAPOR · MDCCXII', { font: FONTS.mono, height: 0.04, letterSpacing: 0.3, color: '#e8dcc4', intensity: 1.0 });
    lab.position.set(0, -0.86, 0);
    g.add(stack, lab);
    addAccent(1.5, 1.78, g, (u) => {
      stack.progress = 1;
      puffs.forEach((m) => {
        const k = sat((u - m.userData.d) / 0.8);
        m.position.set(m.userData.dx * k * k, -0.35 + k * m.userData.h, 0);
        m.scale.setScalar(m.userData.s * (0.4 + k * 1.6));
        m.rotation.z = m.userData.rot + k * 0.6;
        m.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.1)) * 0.45;
      });
    });
  }
  // 3 · Newton's law of gravitation
  {
    // sits above the centred 3D swap word (ORBITS) instead of across it
    const g = new THREE.Group(); g.position.set(SQ ? 0 : -1.2, SQ ? 1.15 : 0.5, 0); g.userData.k = SQ ? 1.4 : 1;
    const eq = new TextPlane('F = G · m₁m₂ / r²', { font: FONTS.serif, italic: true, weight: 500, height: 0.24, color: '#fff1d6', intensity: 1.35, soft: 0.1 });
    const sub = new TextPlane('PRINCIPIA MATHEMATICA · LIBER III · 1687', { font: FONTS.mono, height: 0.038, letterSpacing: 0.3, color: '#e8dcc4', intensity: 1.0 });
    sub.position.set(0, -0.24, 0);
    const rule = segmentsLine([[HV(-eq.worldWidth / 2 + 0.1, -0.16), HV(eq.worldWidth / 2 - 0.1, -0.16)]], { color: '#e8dcc4', intensity: 0.9, orderFn: () => 0, stagger: 0 });
    g.add(eq, sub, rule);
    addAccent(2.0, 2.36, g, (u) => { eq.reveal = sat(u * 3.5); sub.reveal = sat(u * 3 - 0.4); rule.progress = sat(u * 3); g.scale.setScalar(g.userData.k * (1 + (1 - u) * 0.04)); });
  }
  // 4 · electric spark
  {
    const g = new THREE.Group();
    const bolt = (a, b, depth, rr, amp) => {
      let pts = [a, b];
      for (let d = 0; d < depth; d++) {
        const np = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1], q = pts[i], m = p.clone().add(q).multiplyScalar(0.5);
          const n = V3(-(q.y - p.y), q.x - p.x, 0).normalize();
          m.add(n.multiplyScalar((rr() - 0.5) * amp * p.distanceTo(q)));
          np.push(m, q);
        }
        pts = np;
      }
      return pts;
    };
    const br = rng(5);
    const main = bolt(HV(0.55, 1.05), HV(1.35, -0.8), 6, br, 0.55);
    const b1 = bolt(main[20], HV(1.9, 0.1), 5, br, 0.6), b2 = bolt(main[38], HV(0.7, -0.6), 5, br, 0.6);
    const L1 = progressLine(main, { color: '#dff0ff', intensity: 5, head: 0.01 }), L2 = progressLine(b1, { color: '#bcdcff', intensity: 2.5 }), L3 = progressLine(b2, { color: '#bcdcff', intensity: 2.5 });
    const hit = glowSprite({ color: '#cfe8ff', intensity: 3, scale: 0.9 });
    hit.position.copy(main[main.length - 1]);
    g.add(L1, L2, L3, hit);
    addAccent(2.72, 2.94, g, (u, T) => {
      const fl = 0.55 + 0.45 * Math.sign(Math.sin(T * 90));
      L1.progress = sat(u * 6); L2.progress = sat(u * 5 - 0.3); L3.progress = sat(u * 5 - 0.5);
      L1.intensity = 5 * fl; hit.material.opacity = sat(u * 6 - 0.8) * fl; hit.scale.setScalar(0.9 + (1 - u) * 0.6);
    });
  }
  // 5 · ECG trace
  {
    const pts = [];
    for (let i = 0; i <= 600; i++) {
      const x = -A + 0.1 + (i / 600) * (2 * A - 0.2);
      const ph = ((x + 3) % 1.3) / 1.3;
      let y = 0.012 * Math.sin(x * 40);
      y += 0.05 * Math.exp(-((ph - 0.3) ** 2) / 0.0012);
      y += -0.08 * Math.exp(-((ph - 0.405) ** 2) / 0.00008) + 0.52 * Math.exp(-((ph - 0.42) ** 2) / 0.00006) - 0.14 * Math.exp(-((ph - 0.44) ** 2) / 0.0001);
      y += 0.1 * Math.exp(-((ph - 0.6) ** 2) / 0.002);
      pts.push(HV(x, y - 0.12, 0));
    }
    const ecg = progressLine(pts, { color: '#9fe6d6', headColor: '#ffffff', intensity: 1.8, head: 0.012, fade: 0.45 });
    const lab = new TextPlane('72 BPM · SINUS RHYTHM', { font: FONTS.mono, height: 0.036, letterSpacing: 0.3, color: '#bff3e6', intensity: 1.1 });
    lab.position.set(A - 0.2 - lab.worldWidth / 2, 0.42, 0);
    const g = new THREE.Group(); g.add(ecg, lab);
    addAccent(3.0, 3.32, g, (u) => { ecg.progress = ease.outQuad(u); lab.reveal = sat(u * 3); });
  }
  // 6 · microprocessor
  {
    const g = new THREE.Group(); g.position.set(1.5, 0.02, 0);
    const S = 0.36, segs = [];
    const sq = (s) => [[HV(-s, -s), HV(s, -s)], [HV(s, -s), HV(s, s)], [HV(s, s), HV(-s, s)], [HV(-s, s), HV(-s, -s)]];
    segs.push(...sq(S), ...sq(S * 0.45));
    for (let i = 0; i < 10; i++) {
      const u = -S + ((i + 0.5) / 10) * 2 * S;
      segs.push([HV(u, S), HV(u, S + 0.14)], [HV(u, -S), HV(u, -S - 0.14)], [HV(S, u), HV(S + 0.14, u)], [HV(-S, u), HV(-S - 0.14, u)]);
    }
    const chip = segmentsLine(segs, { color: '#cfe8ff', headColor: '#ffffff', intensity: 1.8, stagger: 0.6, seed: 3 });
    const lab = new TextPlane('µP · 2300 T', { font: FONTS.mono, height: 0.045, letterSpacing: 0.25, color: '#dff0ff', intensity: 1.3 });
    g.add(chip, lab);
    addAccent(3.5, 3.76, g, (u) => { chip.progress = sat(u * 2.6); lab.opacity = u > 0.3 ? lab.opacity : 0; lab.reveal = sat(u * 3 - 0.9); g.rotation.z = (1 - u) * 0.15; });
  }
  // 7 · aircraft silhouette
  {
    const g = new THREE.Group();
    const P = [[1.0, 0], [0.86, 0.05], [0.4, 0.07], [-0.55, 0.06], [-0.72, 0.3], [-0.84, 0.3], [-0.78, 0.05], [-0.9, 0.02], [-0.9, -0.02], [-0.5, -0.05], [0.8, -0.05], [1.0, 0]];
    const body = progressLine(P.map(([x, y]) => HV(x * 0.45, y * 0.45)), { color: '#eef5ff', intensity: 1.8 });
    const wing = progressLine([HV(0.05, -0.02), HV(-0.18, -0.2), HV(-0.26, -0.2), HV(-0.12, -0.02)], { color: '#eef5ff', intensity: 1.8 });
    const trails = segmentsLine([[HV(-1.6, 0.0), HV(-0.45, 0.0)], [HV(-1.3, -0.09), HV(-0.2, -0.09)], [HV(-1.1, 0.07), HV(-0.4, 0.07)]], { color: '#9cc8ff', intensity: 1.0, orderFn: (a, b, i) => i * 0.1, stagger: 0.3, fade: 0.8 });
    g.add(body, wing, trails);
    addAccent(3.76, 3.98, g, (u) => { body.progress = 1; wing.progress = 1; trails.progress = sat(u * 2); g.position.set(lerp(-1.9, -0.6, ease.outCubic(u)), 0.55, 0); });
  }
  // 8 · rocket launch
  {
    const g = new THREE.Group(); g.position.set(-1.55, 0, 0);
    const R = [[0, 0.22], [0.04, 0.12], [0.04, -0.12], [0.08, -0.2], [-0.08, -0.2], [-0.04, -0.12], [-0.04, 0.12], [0, 0.22]];
    const rocket = progressLine(R.map(([x, y]) => HV(x, y)), { color: '#eef5ff', intensity: 1.8 });
    const plume = progressLine([HV(0, -1.1), HV(0, -0.22)], { color: '#ffcf85', headColor: '#ffffff', intensity: 3, head: 0.1 });
    const flame = glowSprite({ color: '#ffb35c', intensity: 3, scale: 0.4 });
    const rg = new THREE.Group(); rg.add(rocket, flame); flame.position.y = -0.24;
    g.add(plume, rg);
    addAccent(4.25, 4.5, g, (u) => { rocket.progress = 1; const y = lerp(-0.7, 0.5, ease.inQuad(u)); rg.position.y = y; plume.progress = 1; plume.scale.y = 1; plume.position.y = y + 0.0; flame.scale.setScalar(0.35 + Math.sin(u * 60) * 0.05); });
  }
  // 9 · network
  {
    const g = new THREE.Group();
    const nr = rng(19), np = [];
    for (let i = 0; i < 46; i++) np.push(HV((nr() - 0.5) * 2 * A * 0.9, (nr() - 0.5) * 1.7, 0));
    const ls = [];
    np.forEach((p, i) => np.forEach((q, j) => { if (j > i && p.distanceTo(q) < 0.62) ls.push([p, q]); }));
    const net = segmentsLine(ls, { color: '#6fd3ff', headColor: '#ffffff', intensity: 1.2, stagger: 0.6, seed: 4 });
    const dotG = new THREE.CircleGeometry(0.014, 12);
    const dotM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#dff4ff').multiplyScalar(3), transparent: true, depthWrite: false });
    np.forEach((p) => { const d = new THREE.Mesh(dotG, dotM); d.position.copy(p); g.add(d); });
    g.add(net);
    addAccent(4.5, 4.8, g, (u) => { net.progress = sat(u * 2.2); dotM.opacity = sat(u * 5); });
  }

  for (const a of accents) {
    a.texts = []; a.uops = [];
    a.group.traverse((o) => {
      if (o instanceof TextPlane) a.texts.push(o);
      else if (o.material?.uniforms?.uOpacity) a.uops.push(o.material.uniforms.uOpacity);
    });
  }

  const labelText = ['I · ORDO DORICVS', 'II · MACHINA', 'III · SYSTEMA MVNDI', 'IV · ATOMVS', 'V · CIRCVITVS', 'VI · STELLAE'];
  const labelCue = [C0, C1, C2, C3, C4, C5];
  const labels = labelText.map((s) => {
    const tp = new TextPlane(s, { font: FONTS.mono, weight: 400, height: 0.042 * UI, letterSpacing: 0.32, color: '#eef2f8', intensity: 1.1 });
    tp.position.set(HX(0.16) + tp.worldWidth / 2, HY(-0.84), 0);
    hud.scene.add(tp);
    return tp;
  });

  const self = { scene, camera, hud, background: 0x000000, bloom: { strength: 0.8 }, exposure: 1, update };

  // ---- camera --------------------------------------------------------------
  const target = new THREE.Vector3();
  const up = new THREE.Vector3();
  const qTmp = new THREE.Quaternion(), qId = new THREE.Quaternion();
  const tmpC = new THREE.Color();
  const pv = new THREE.Vector3();

  function update(t, info) {
    const T = info.T;
    // rhythm: punches get denser as the montage accelerates
    const div = t < C3 ? 1 : t < C5 ? 2 : 4;
    const beat = pulse(T, { div, decay: div === 1 ? 6 : 9 });

    // palette: warm → cool across the sequence
    const cool = smoothstep(C1, C5, t);
    key.color.copy(WARM).lerp(COOL, cool);
    key.intensity = lerp(2.6, 3.2, smoothstep(C1 - 0.2, C1 + 0.2, t)) * (1 - smoothstep(C4 - 0.3, C4, t) * 0.5);
    scene.environmentIntensity = lerp(0.3, 0.5, smoothstep(C1 - 0.2, C1 + 0.2, t));

    // ---- camera path (spherical around the plan centre)
    const el = lerp(0.5, Math.PI / 2 - 0.001, ease.inOutCubic(sat((t - 0.3) / 0.62)))
      - 0.5 * envelope(t, C2 - 0.1, C3 + 0.05, 0.45, 0.35);
    const az = 0.35 + t * 0.22 + intSmooth(t, C2, C5) * 0.18 + intSmooth(t, C4, DUR) * 0.5;
    let D = timeWarp(t, [[0, 7.2], [0.9, 10.2], [C1 + 0.4, 9.4], [C2, 11.5], [C3 - 0.2, 12.5], [C3 + 0.2, 7.2], [C4 - 0.3, 6.8], [C4 + 0.1, 8.6], [C5 - 0.3, 9.2]]);
    target.set(0, t < 0.9 ? lerp(1.3, 0, ease.inOutCubic(sat(t / 0.9))) : 0, 0);
    const dive = t > C5 - 0.35 ? timeWarp(t, [[C5 - 0.35, 0], [C5, 1.5], [C5 + 0.4, 12], [DUR, 70]]) : 0;
    camera.position.set(Math.cos(el) * Math.sin(az) * D, Math.sin(el) * D - dive, Math.cos(el) * Math.cos(az) * D);
    target.y -= dive;
    up.set(-Math.sin(az), 0, -Math.cos(az));
    camera.up.copy(up);
    camera.lookAt(target);
    camera.fov = 35 - beat * (1.2 + cool * 1.8) + sat((t - C5) / 0.6) * 14;
    camera.updateProjectionMatrix();

    // ---- S0 columns → sink as the gear rises (same silhouette from above)
    const sink = ease.inCubic(sat((t - (C1 - 0.3)) / 0.45));
    colGroup.scale.set(1, Math.max(0.001, 1 - sink), 1);
    // the flattened capitals face the top-down key: dim the marble as it sinks so the abaci don't flare white
    const sinkK = smoothstep(0.0, 0.6, sink);
    marbleMat.color.copy(MARBLE_BASE).multiplyScalar(1 - 0.5 * sinkK);
    marbleMat.clearcoat = 0.35 * (1 - 0.85 * sinkK);   // stays > 0: no shader variant switch
    colGroup.visible = sink < 0.999;
    floorMat.opacity = 1 - sat((t - (C2 - 0.25)) / 0.35);
    floor.visible = floorMat.opacity > 0.001;

    // ---- S1 gears
    const rise = ease.outCubic(sat((t - (C1 - 0.2)) / 0.4));
    const gearOut = sat((t - (C2 - 0.2)) / 0.4);
    const ga = intSmooth(t, C1 - 0.2, C2) * 1.6 + intSmooth(t, C2 - 0.2, C3) * 1.2;
    mainGear.visible = rise > 0 && gearOut < 1;
    mainGear.position.y = -GEAR_D + (rise - 1) * 0.6 - 0.02;
    mainGear.rotation.y = ga;
    mainGear.scale.setScalar(1 + gearOut * 0.12);
    bronzeMat.opacity = 1 - ease.inQuad(gearOut);
    const sideIn = ease.outBack(sat((t - (C1 - 0.05)) / 0.35));
    const sideShrink = ease.inOutCubic(sat((t - (C2 - 0.25)) / 0.4));
    const sideScale = Math.max(0.001, sideIn * (1 - sideShrink * 0.93));
    [sideR, sideL].forEach((gm, i) => {
      gm.visible = sideIn > 0 && sideShrink < 0.999;
      gm.scale.setScalar(sideScale);
      gm.position.y = -GEAR_D * sideScale - 0.02;
      gm.rotation.y = -ga * 1.5 + Math.PI / 8;
    });
    steelMat.opacity = 1 - sat((sideShrink - 0.7) / 0.3);

    // ---- S2 orbits / S3 orbitals
    const ringIn = sat((t - (C2 - 0.2)) / 0.45);
    const toAtom = ease.inOutCubic(sat((t - (C3 - 0.25)) / 0.5));
    const toPad = ease.inOutCubic(sat((t - (C4 - 0.25)) / 0.4));
    const shrinkAtom = ease.inOutCubic(sat((t - (C4 - 0.4)) / 0.5));
    const circuitOut = sat((t - (C5 - 0.2)) / 0.3);
    orrery.scale.setScalar(lerp(1, 0.22, shrinkAtom));
    orrery.visible = ringIn > 0 && circuitOut < 1;
    sunLight.intensity = 40 * sat(ringIn * 1.5) * (1 - toAtom);
    rings.forEach((ring, i) => {
      const rad = lerp(ring.rO, ring.rA, toAtom);
      ring.scale.setScalar(rad);
      const tilt = i >= 1 && i <= 3 ? toAtom * (1 - toPad) : 0;
      qTmp.slerpQuaternions(qId, ring.qA, tilt);
      ring.quaternion.copy(qTmp);
      ring.progress = Math.min(1.15, Math.max(0, ringIn * 1.6 - i * 0.08));
      const fadeOut = i === 0 || i === 4 ? toAtom : 0;
      ring.opacity = (1 - fadeOut) * (1 - circuitOut) * (i >= 1 && i <= 3 ? 1 : 0.7);
      tmpC.set(ring.col).lerp(COOL, toAtom);
      ring.material.uniforms.uColor.value.copy(tmpC);
      ring.intensity = (1.2 + beat * 0.8 + (1 - sat((t - C2) / 0.3)) * 1.5 * ringIn) * (1 + toPad * 0.5);
    });
    gauge.reveal(sat((t - C2 + 0.1) / 0.5), 1 - toAtom);
    gauge.rotation.z = -t * 0.2;
    planets.forEach((p, k) => {
      const ring = rings[p.ring];
      const eOmega = [0, 7.5, -6.0, 5.2, 4.0][p.ring];
      const th = p.a0 + p.omega * intSmooth(t, C2 - 0.4, C2 - 0.1) + (eOmega - p.omega) * intSmooth(t, C3 - 0.3, C3 + 0.1) * 1.0;
      pv.set(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(ring.scale.x).applyQuaternion(ring.quaternion);
      p.mesh.position.copy(pv); p.glow.position.copy(pv);
      const born = p.gear ? sat((t - (C2 - 0.12)) / 0.25) : sat((t - (C2 - 0.05 + k * 0.04)) / 0.25);
      const gone = p.ring === 4 ? toAtom : 0;
      const es = lerp(p.size, 0.07, toAtom) * ease.outBack(born) * (1 - gone);
      p.mesh.scale.setScalar(Math.max(0.0001, es));
      p.mesh.material.emissiveIntensity = toAtom * 4;
      p.glow.material.opacity = toAtom * (1 - gone) * (1 - circuitOut);
      p.glow.scale.setScalar(0.5 + beat * 0.2);
      p.mesh.visible = es > 0.001 && toPad < 0.9;
      p.glow.visible = p.glow.material.opacity > 0.01 && toPad < 0.95;
    });
    const sunOn = sat((t - (C2 - 0.25)) / 0.3) * (1 - toAtom);
    sun.scale.setScalar(Math.max(0.001, sunOn));
    sun.visible = sunOn > 0.01;
    sunGlow.material.opacity = sunOn;
    sunGlow.scale.setScalar(2.8 + beat * 0.6);
    const nucOn = ease.outBack(sat((t - (C3 - 0.15)) / 0.3));
    nucleus.scale.setScalar(Math.max(0.001, nucOn * (1 + beat * 0.08)));
    nucleus.rotation.set(t * 1.3, t * 2.1, 0);
    nucleus.visible = nucOn > 0.001 && toPad < 0.9;

    // ---- S4 circuit
    const latticeIn = sat((t - (C4 - 0.4)) / 0.35);
    maMat.uniforms.uOpacity.value = latticeIn * (1 - circuitOut) * 0.9;
    maMat.uniforms.uRound.value = toPad;
    maMat.uniforms.uS.value = 0.42;
    miniAtoms.visible = latticeIn > 0 && circuitOut < 1;
    padMat.opacity = sat((t - (C4 - 0.05)) / 0.2) * (1 - circuitOut);
    pads.visible = padMat.opacity > 0.001;
    traces.progress = Math.min(1.15, Math.max(0, (t - (C4 - 0.1)) / 0.55));
    traces.opacity = 1 - circuitOut;
    traces.intensity = 0.95 + beat * 0.5;
    puMat.uniforms.uT.value = t;
    puMat.uniforms.uOpacity.value = sat((t - (C4 + 0.1)) / 0.2) * (1 - circuitOut);
    puMat.uniforms.uViewport.value = info.height;
    pulsesP.visible = puMat.uniforms.uOpacity.value > 0;
    pcbMat.uniforms.uOpacity.value = sat((t - (C4 - 0.3)) / 0.35) * (1 - sat((t - (C5 - 0.3)) / 0.4));
    pcb.visible = pcbMat.uniforms.uOpacity.value > 0;

    // ---- S5 stars
    stars.u.mix = sat((t - (C5 - 0.25)) / 0.6);
    stars.u.opacity = sat((t - (C5 - 0.32)) / 0.12);
    stars.u.intensity = (0.3 + 1.2 * sat((t - (C5 - 0.1)) / 0.5)) * (1 + beat * 0.6);
    stars.u.noise = 0.02;
    stars.visible = t > C5 - 0.33;
    stars.tick(t, info);

    // ---- sparks on each morph cue
    const cues = [C1, C2, C3, C4, C5];
    let last = -1;
    for (let i = 0; i < cues.length; i++) if (t >= cues[i] - 0.05) last = i;
    if (last >= 0) {
      const dt = t - (cues[last] - 0.05);
      burst.visible = dt < 0.6;
      burst.u.scatter = ease.outCubic(sat(dt / 0.6)) * (1.2 + last * 0.3);
      burst.u.opacity = 1 - sat(dt / 0.6);
      burst.u.color = tmpC.copy(WARM).lerp(COOL, last / 4).multiplyScalar(1.2);
      burst.scale.setScalar([1, 1.5, 0.9, 0.22, 1][last] || 1);
      burst.position.y = last === 4 ? 0 : 0.05;
    } else burst.visible = false;
    burst.u.swirl = t * 0.6;
    burst.tick(t, info);
    dust.tick(t, info);
    dust.u.opacity = 0.35 * (1 - sat((t - C2) / 0.4));

    // ---- accents + labels (HUD)
    let dimA = 0;
    for (const a of accents) {
      const on = t >= a.t0 && t < a.t1;
      a.group.visible = on;
      if (!on) continue;
      const u = (t - a.t0) / (a.t1 - a.t0);
      const env = Math.min(1, u / 0.12, (1 - u) / 0.2);
      for (const tp of a.texts) tp.opacity = env;
      for (const u of a.uops) u.value = env;
      a.anim(u, T);
      dimA = Math.max(dimA, env);
    }
    dim.material.opacity = dimA * 0.55;
    labels.forEach((tp, i) => {
      const a = labelCue[i], b = i < 5 ? labelCue[i + 1] : DUR;
      tp.opacity = envelope(t, a - 0.02, b, 0.06, 0.08, ease.linear) * (1 - sat((t - (DUR - 0.5)) / 0.3));
      tp.reveal = sat((t - a) / 0.25);
    });

    self.exposure = 1 + beat * 0.08;
    self.bloom.strength = 0.75 + cool * 0.25 + beat * 0.15;
  }

  return self;
}
