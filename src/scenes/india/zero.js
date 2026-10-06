// ZERO & THE DECIMAL SYSTEM (15.5 – 20.5 s)
// Technique: an abstract "keynote" stage (black polished floor, gold light, glass) carrying a short
// mathematical story, locked to the cues:
//   dotZero        16.0  a birch-bark leaf in a pool of light; one ink dot on it ignites (the Bakhshali
//                        manuscript writes zero as a dot) and opens into a perfect ring that rises
//   placeValue     16.8  glass place-value trays rise out of the floor; 2 and 5 drop in as gold numerals
//                        with abacus beads ("25"), the 2 hops over to the hundreds, the tens stay empty,
//                        and the ring flies in to fill the gap: 205
//   brahmagupta    17.8  a ring of light peels off the 0 and rises; Brahmagupta's rules type on round it
//   numeralsTravel 19.0  the digits pour out of the ring as a river of light along a stylised map line,
//                        India → Baghdad → Pisa, morphing from early geometric forms into 0 – 9
//   zeroRing       19.9  every digit collapses into one ring of light; the camera flies through it into
//                        the 'flash' cut
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp, rng, TAU } from '../../lib/math.js';
import { pulse } from '../../lib/rhythm.js';
import { progressLine, segmentsLine, circlePoints } from '../../lib/lines.js';
import { Dust } from '../../lib/particles.js';
import { TextPlane, FONTS, textGeometry3D } from '../../lib/text.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { glowSprite } from '../../lib/materials.js';
import { Callout, RingGauge, faceCamera } from '../../lib/hud.js';
import { fbm2, noise2 } from '../../lib/noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GOLD_HUD = '#ffd89a';
const GOLD_LIGHT = new THREE.Color('#ffc66e');
const FOG_COL = '#080605';

// ---------------------------------------------------------------------------------------------- bark
// The leaf: birch bark, warm tan, horizontal lenticels and fibres, ragged edges with a missing chip,
// rows of brown ink written as abstract strokes (no real script), and ink dots among them.
const LEAF_W = 1.2, LEAF_D = 0.52;
const leafHeight = (x, z) => 0.014 * Math.pow(Math.abs(x) / (LEAF_W / 2), 4) + 0.006 * Math.pow(Math.abs(z) / (LEAF_D / 2), 3) + 0.0025 * Math.sin(x * 9 + z * 5);
const DOT_UV = [0.535, 0.56];                 // canvas fraction of the zero dot
function barkTexture(seed = 7) {
  const W = 1536, H = 666, c = mkCanvas(W, H), g = c.getContext('2d'), R = rng(seed);
  // base colour + noise, per pixel at half resolution
  const lo = mkCanvas(W / 2, H / 2), lg = lo.getContext('2d'), img = lg.createImageData(W / 2, H / 2);
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
    const u = x / (W / 2), v = y / (H / 2);
    const n = fbm2(u * 5, v * 2.2, 4), fib = noise2(u * 6, v * 140) * 0.06 + noise2(u * 30, v * 260) * 0.03;
    const blot = Math.max(0, fbm2(u * 2 + 7, v * 1.4, 3)) * 0.35;
    const l = 0.92 + n * 0.16 + fib - blot;
    const i = (y * (W / 2) + x) * 4;
    img.data[i] = 178 * l; img.data[i + 1] = 142 * l; img.data[i + 2] = 102 * l; img.data[i + 3] = 255;
  }
  lg.putImageData(img, 0, 0);
  g.drawImage(lo, 0, 0, W, H);
  // lenticels: dark horizontal dashes with pale lips
  for (let i = 0; i < 520; i++) {
    const x = R() * W, y = R() * H, l = 8 + R() * 70, h = 1.5 + R() * 3;
    g.fillStyle = `rgba(232,205,160,${0.25 + R() * 0.2})`; g.fillRect(x - 2, y - h, l + 4, h * 0.8);
    g.fillStyle = `rgba(70,40,20,${0.35 + R() * 0.4})`; g.fillRect(x, y, l, h);
  }
  // fibres
  for (let i = 0; i < 900; i++) {
    const y = R() * H, x = R() * W, l = 40 + R() * 260;
    g.strokeStyle = `rgba(${R() < 0.5 ? '90,55,28' : '235,210,170'},${0.05 + R() * 0.08})`; g.lineWidth = 0.6 + R();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (R() - 0.5) * 3); g.stroke();
  }
  // writing: six rows of abstract ink strokes
  const ink = (a) => `rgba(52,28,12,${a})`;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const rows = 6, top = H * 0.17, gap = (H * 0.68) / (rows - 1);
  const dots = [];
  for (let r = 0; r < rows; r++) {
    const y0 = top + r * gap;
    let x = W * 0.09 + R() * 20;
    while (x < W * 0.9) {
      const word = 2 + Math.floor(R() * 5);
      for (let k = 0; k < word && x < W * 0.9; k++) {
        const s = 26 + R() * 6, a = 0.55 + R() * 0.35;
        g.strokeStyle = ink(a); g.lineWidth = 3.2 + R() * 1.4;
        const kind = Math.floor(R() * 6);
        g.beginPath();
        if (R() < 0.6) { g.moveTo(x + s * 0.25, y0 - s * 0.52); g.lineTo(x + s * 0.62, y0 - s * 0.56); }   // a short head tick
        if (kind === 0) { g.moveTo(x + s * 0.5, y0 - s * 0.5); g.quadraticCurveTo(x - s * 0.1, y0, x + s * 0.5, y0 + s * 0.4); }
        else if (kind === 1) { g.moveTo(x + s * 0.7, y0 - s * 0.5); g.lineTo(x + s * 0.7, y0 + s * 0.45); g.moveTo(x + s * 0.7, y0); g.quadraticCurveTo(x, y0 - s * 0.1, x + s * 0.2, y0 + s * 0.35); }
        else if (kind === 2) { g.moveTo(x + s * 0.2, y0 - s * 0.3); g.arc(x + s * 0.45, y0 + s * 0.05, s * 0.3, Math.PI * 1.2, Math.PI * 3.0); }
        else if (kind === 3) { g.moveTo(x + s * 0.3, y0 - s * 0.5); g.bezierCurveTo(x + s * 0.9, y0 - s * 0.1, x - s * 0.1, y0 + s * 0.2, x + s * 0.6, y0 + s * 0.45); }
        else if (kind === 4) { g.moveTo(x + s * 0.15, y0 - s * 0.5); g.lineTo(x + s * 0.15, y0 + s * 0.3); g.quadraticCurveTo(x + s * 0.5, y0 + s * 0.55, x + s * 0.8, y0 + s * 0.2); }
        else { g.moveTo(x + s * 0.6, y0 - s * 0.5); g.lineTo(x + s * 0.6, y0 + s * 0.45); g.moveTo(x + s * 0.6, y0 - s * 0.05); g.lineTo(x + s * 0.15, y0 + s * 0.15); }
        g.stroke();
        x += s * 1.05;
        if (R() < 0.08) { dots.push([x + 4, y0 + 2]); x += 22; }              // an ink dot in the line
      }
      x += 24 + R() * 18;
    }
  }
  for (const [x, y] of dots) { g.fillStyle = ink(0.8); g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); }
  // the hero dot (the one that lights): a clean gap in its row, then the dot
  const hx = DOT_UV[0] * W, hy = DOT_UV[1] * H;
  g.save(); g.globalCompositeOperation = 'source-atop';
  const clear = g.createRadialGradient(hx, hy, 0, hx, hy, 30); clear.addColorStop(0, 'rgba(205,165,112,1)'); clear.addColorStop(1, 'rgba(205,165,112,0)');
  g.fillStyle = clear; g.fillRect(hx - 32, hy - 32, 64, 64);
  g.restore();
  g.fillStyle = ink(0.92); g.beginPath(); g.arc(hx, hy, 7.5, 0, TAU); g.fill();
  // browned edges, then the ragged outline (alpha) with a chip out of one corner
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.58);
  vg.addColorStop(0, 'rgba(60,32,14,0)'); vg.addColorStop(1, 'rgba(60,32,14,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.save(); g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  const N = 220;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, cx = Math.cos(a), cy = Math.sin(a);
    // superellipse outline (a leaf with softened corners) displaced by noise
    const px = Math.sign(cx) * Math.pow(Math.abs(cx), 0.18), py = Math.sign(cy) * Math.pow(Math.abs(cy), 0.22);
    const d = 1 - 0.035 - 0.03 * (noise2(cx * 3 + 11, cy * 3) + 0.6 * noise2(cx * 14, cy * 14 + 5));
    let x = W / 2 + px * (W / 2) * d, y = H / 2 + py * (H / 2) * d;
    if (a > 5.15 && a < 5.75) y += 26 + 30 * Math.sin((a - 5.15) / 0.6 * Math.PI);  // the chip
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath(); g.fillStyle = '#fff'; g.fill();
  g.restore();
  return toTexture(c);
}

// --------------------------------------------------------------------------------------- digit atlas
// Two rows of ten cells: early geometric forms (row 0: strokes, a cross, hooks and loops, drawn as
// geometry and not any one historical script) and the modern digits 0–9 (row 1).
function digitAtlas() {
  const S = 128, c = mkCanvas(S * 10, S * 2), g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 10;
  const P = (i, x, y) => [i * S + S / 2 + x * S * 0.4, S / 2 - y * S * 0.4];
  const L = (i, pts) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(...P(i, x, y)) : g.moveTo(...P(i, x, y)))); g.stroke(); };
  const Q = (i, a, b, cc) => { g.beginPath(); g.moveTo(...P(i, ...a)); g.quadraticCurveTo(...P(i, ...b), ...P(i, ...cc)); g.stroke(); };
  g.beginPath(); g.arc(...P(0, 0, 0), S * 0.4 * 0.42, 0, TAU); g.stroke();
  L(1, [[-0.7, 0], [0.7, 0]]);
  L(2, [[-0.55, 0.35], [0.55, 0.35]]); L(2, [[-0.7, -0.35], [0.7, -0.35]]);
  L(3, [[-0.5, 0.55], [0.5, 0.55]]); L(3, [[-0.6, 0], [0.6, 0]]); L(3, [[-0.7, -0.55], [0.7, -0.55]]);
  L(4, [[0, 0.8], [0, -0.8]]); Q(4, [-0.75, 0.05], [0, -0.15], [0.75, 0.05]); Q(4, [0, -0.8], [0.35, -0.85], [0.45, -0.6]);
  Q(5, [-0.3, 0.8], [-0.4, -0.1], [-0.1, -0.75]); Q(5, [-0.35, 0.2], [0.6, 0.6], [0.4, -0.2]);
  Q(6, [0.5, 0.75], [-0.6, 0.4], [-0.2, -0.3]); g.beginPath(); g.arc(...P(6, 0.05, -0.35), S * 0.4 * 0.32, 0, TAU); g.stroke();
  L(7, [[-0.55, 0.6], [0.45, 0.6]]); Q(7, [0.45, 0.6], [0.6, -0.1], [-0.1, -0.8]);
  Q(8, [0.5, 0.7], [-0.7, 0.4], [0, 0]); Q(8, [0, 0], [0.7, -0.4], [-0.5, -0.7]);
  g.beginPath(); g.arc(...P(9, 0, 0.3), S * 0.4 * 0.36, 0, TAU); g.stroke(); Q(9, [0.36, 0.3], [0.4, -0.5], [-0.3, -0.8]);
  g.font = `300 ${Math.round(S * 0.82)}px "${FONTS.sans}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) g.fillText(String(i), i * S + S / 2, S * 1.5 + S * 0.05);
  return toTexture(c, { srgb: false });
}

// soft ring halo (a radial band), drawn into a canvas
function haloTexture() {
  const S = 256, c = mkCanvas(S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0.0, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.0)');
  gr.addColorStop(0.765, 'rgba(255,255,255,1)'); gr.addColorStop(0.83, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTexture(c, { srgb: false });
}

// grid lines that fade with distance from a centre (and sweep in along -x with uReveal)
function fadeLines(segs, { centre = V(0, 0, 0), r0 = 2, r1 = 6, color = GOLD_HUD, intensity = 0.3, sweep = null } = {}) {
  const pos = new Float32Array(segs.length * 6);
  segs.forEach(([a, b], i) => pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uC: { value: centre }, uR0: { value: r0 }, uR1: { value: r1 }, uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uOp: { value: 1 }, uSweep: { value: sweep ? V(...sweep) : V(1e5, -1e5, 0) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform vec3 uC, uColor, uSweep; uniform float uR0, uR1, uI, uOp; varying vec3 vW;
      void main(){ float d = length(vW.xz - uC.xz); float a = 1.0 - smoothstep(uR0, uR1, d);
        float s = smoothstep(uSweep.x + 0.6, uSweep.x, vW.x);   // revealed where x > front (sweeping toward -x)
        float edge = smoothstep(0.5, 0.0, abs(vW.x - uSweep.x)) * step(uSweep.y, 0.5);
        a *= mix(1.0, s, step(uSweep.y, 0.5));
        gl_FragColor = vec4(uColor * uI * (1.0 + edge * 3.0), a * uOp); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false;
  return l;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const tDot = cue('dotZero'), tPV = cue('placeValue'), tBr = cue('brahmagupta'), tNT = cue('numeralsTravel'), tZR = cue('zeroRing');
  const DUR = segment.end - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.45;
  scene.fog = new THREE.FogExp2(FOG_COL, 0.05);
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.03, 200);
  const R = rng(628);

  // ======================================================================================== stage
  // polished black floor that holds the warm pools of light, and a dark dome with a faint horizon haze
  const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 72), new THREE.MeshPhysicalMaterial({ color: '#040303', roughness: 0.36, metalness: 0.0, specularIntensity: 0.4, envMapIntensity: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: 1 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uGlow; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 fogc = vec3(0.0315, 0.0232, 0.0183) * 0.25;
        float band = exp(-abs(h - 0.02) * 9.0);
        vec3 c = fogc + vec3(0.03, 0.019, 0.009) * band * uGlow + vec3(0.004, 0.0035, 0.003) * smoothstep(0.1, 0.9, h);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  scene.add(dome);
  // a polar "graph paper" on the floor round the leaf and the trays
  {
    const segs = [];
    for (let r = 0.5; r <= 5; r += 0.5) { const pts = circlePoints(r, Math.round(48 + r * 24), { plane: 'xz', center: V(0, 0.002, -0.5) }); for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]); }
    for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; segs.push([V(Math.cos(a) * 0.5, 0.002, -0.5 + Math.sin(a) * 0.5), V(Math.cos(a) * 5, 0.002, -0.5 + Math.sin(a) * 5)]); }
    var polar = fadeLines(segs, { centre: V(0, 0, -0.5), r0: 0.8, r1: 4.2, intensity: 0.11 });
    scene.add(polar);
  }

  // ======================================================================================== lights
  const key = new THREE.DirectionalLight('#ffe0b8', 1.6);       // also lights the gold heading word
  key.position.set(-2.5, 4.5, 5); key.target.position.set(0, 0.4, -0.6);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 20 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#a9bfff', 0.45);
  rim.position.set(3, 6, -4);
  scene.add(rim);
  const pool = new THREE.SpotLight('#ffd6a4', 30, 8, 0.42, 0.75, 1.6);   // the pool of light on the leaf
  pool.position.set(-0.5, 2.4, 0.9); pool.target.position.set(0, 0.06, 0);
  scene.add(pool, pool.target);
  const ringLight = new THREE.PointLight('#ffbf6a', 0, 4, 1.8);
  scene.add(ringLight);
  const trayLight = new THREE.SpotLight('#ffe6c4', 0, 9, 0.5, 0.8, 1.4);
  trayLight.position.set(1.2, 3.2, 1.6); trayLight.target.position.set(0, 0.5, -1);
  scene.add(trayLight, trayLight.target);
  const finalLight = new THREE.PointLight('#ffc77a', 0, 9, 1.6);
  scene.add(finalLight);

  // ======================================================================================== the leaf
  const plinthMat = new THREE.MeshPhysicalMaterial({ color: '#0b0a09', roughness: 0.3, metalness: 0.1, clearcoat: 0.5, clearcoatRoughness: 0.12, envMapIntensity: 0.15 });
  const goldMat = new THREE.MeshStandardMaterial({ color: '#f0c46a', metalness: 1, roughness: 0.24, envMapIntensity: 1.2 });
  const goldSatin = new THREE.MeshStandardMaterial({ color: '#e5b862', metalness: 1, roughness: 0.38, envMapIntensity: 1.0 });
  const plinth = new THREE.Group(); scene.add(plinth);
  {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.06, 0.78), plinthMat); slab.position.y = 0.03; slab.castShadow = slab.receiveShadow = true;
    const trim = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(1.57, 0.006, 0.006).translate(0, 0.06, 0.39), new THREE.BoxGeometry(1.57, 0.006, 0.006).translate(0, 0.06, -0.39),
      new THREE.BoxGeometry(0.006, 0.006, 0.79).translate(0.785, 0.06, 0), new THREE.BoxGeometry(0.006, 0.006, 0.79).translate(-0.785, 0.06, 0),
    ]), goldMat);
    plinth.add(slab, trim);
  }
  const barkMap = barkTexture();
  const leafGeo = new THREE.PlaneGeometry(LEAF_W, LEAF_D, 60, 26); leafGeo.rotateX(-Math.PI / 2);
  { const p = leafGeo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, leafHeight(p.getX(i), p.getZ(i))); leafGeo.computeVertexNormals(); }
  const leafMat = new THREE.MeshStandardMaterial({ map: barkMap, bumpMap: barkMap, bumpScale: 1.2, roughness: 0.82, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.4 });
  const leaf = new THREE.Mesh(leafGeo, leafMat); leaf.position.y = 0.064; leaf.rotation.y = 0.05; leaf.castShadow = true; leaf.receiveShadow = true;
  plinth.add(leaf);
  // the dot's world position on the leaf
  const dotLocal = V((DOT_UV[0] - 0.5) * LEAF_W, 0, (DOT_UV[1] - 0.5) * LEAF_D);
  dotLocal.y = leafHeight(dotLocal.x, dotLocal.z) + 0.0015;
  const DOT = dotLocal.clone().applyAxisAngle(V(0, 1, 0), 0.05).add(V(0, 0.064, 0));
  const dotMat = new THREE.MeshBasicMaterial({ color: GOLD_LIGHT.clone(), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0062, 24), dotMat); dot.rotation.x = -Math.PI / 2; dot.position.copy(DOT); dot.position.y += 0.0008;
  scene.add(dot);
  const dotGlow = glowSprite({ color: '#ffbe6a', intensity: 1, scale: 0.12 }); dotGlow.position.copy(DOT).add(V(0, 0.006, 0));
  scene.add(dotGlow);

  // ======================================================================================== the ring
  const ringGeo = new THREE.TorusGeometry(1, 0.03, 16, 180);
  const ringMat = new THREE.MeshBasicMaterial({ color: GOLD_LIGHT.clone(), toneMapped: false });
  const ring = new THREE.Mesh(ringGeo, ringMat); scene.add(ring);
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTexture(), color: new THREE.Color('#ffb258'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), haloMat); ring.add(halo);

  // ======================================================================================== place value
  const TRAY_X = [-0.62, 0, 0.62], TRAY_Z = -1.0, TRAY_H = 1.0;
  const glassMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.11, envMapIntensity: 2.2, specularIntensity: 1, ior: 1.5, depthWrite: false, side: THREE.DoubleSide });
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb860').multiplyScalar(2.2), toneMapped: false });
  const trayGold = (() => {
    const parts = [new THREE.BoxGeometry(0.54, 0.05, 0.4).translate(0, 0.025, 0)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.012, TRAY_H, 0.012).translate(sx * 0.25, 0.05 + TRAY_H / 2, sz * 0.18));
    for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.512, 0.012, 0.012).translate(0, 0.05 + TRAY_H, sz * 0.18));
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(0.012, 0.012, 0.372).translate(sx * 0.25, 0.05 + TRAY_H, 0));
    parts.push(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 12).translate(0, 0.05 + 0.31, 0));
    parts.push(new THREE.CylinderGeometry(0.03, 0.036, 0.016, 24).translate(0, 0.058, 0));
    return mergeGeometries(parts.map((g) => g.toNonIndexed()));
  })();
  const glassGeo = new THREE.BoxGeometry(0.49, TRAY_H, 0.35).translate(0, 0.05 + TRAY_H / 2, 0);
  const ledGeo = new THREE.BoxGeometry(0.44, 0.005, 0.012);
  const trays = TRAY_X.map((x, i) => {
    const grp = new THREE.Group(); grp.position.set(x, 0, TRAY_Z);
    const gold = new THREE.Mesh(trayGold, goldSatin); gold.castShadow = gold.receiveShadow = true;
    const glass = new THREE.Mesh(glassGeo, glassMat); glass.renderOrder = 2;
    const led1 = new THREE.Mesh(ledGeo, ledMat); led1.position.set(0, 0.052, 0.17);
    const led2 = new THREE.Mesh(ledGeo, ledMat); led2.position.set(0, 0.052, -0.17);
    const lab = new TextPlane(['100', '10', '1'][i], { font: FONTS.mono, weight: 400, height: 0.03, letterSpacing: 0.1, color: GOLD_HUD, intensity: 1.3 });
    lab.position.set(0, 0.025, 0.2015);
    grp.add(gold, glass, led1, led2, lab);
    scene.add(grp);
    return grp;
  });
  const placeNames = ['HUNDREDS', 'TENS', 'ONES'].map((n, i) => {
    const tp = new TextPlane(n, { font: FONTS.mono, weight: 300, height: 0.026, letterSpacing: 0.25, color: GOLD_HUD, intensity: 0.9 });
    tp.rotation.x = -Math.PI / 2; tp.position.set(TRAY_X[i], 0.003, TRAY_Z + 0.32);
    scene.add(tp);
    return tp;
  });
  // abacus beads: lens-shaped, threaded on each rod
  const beadGeo = new THREE.LatheGeometry(Array.from({ length: 17 }, (_, k) => { const y = -0.042 + (k / 16) * 0.084, r = 0.011 + 0.072 * Math.pow(Math.cos((y / 0.042) * Math.PI / 2), 0.55); return new THREE.Vector2(r, y); }), 40);
  const beadMat = new THREE.MeshPhysicalMaterial({ color: '#7c2410', roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.15, sheenColor: new THREE.Color('#ffb070'), envMapIntensity: 1.4 });
  const BEAD_Y = (k) => 0.066 + 0.044 + k * 0.088;
  const mkBead = () => { const b = new THREE.Mesh(beadGeo, beadMat); b.castShadow = b.receiveShadow = true; scene.add(b); return b; };
  const beads2 = [mkBead(), mkBead()], beads5 = Array.from({ length: 5 }, mkBead);
  // gold numerals (extruded Cinzel), the 0 arrives as the ring
  const numMat = new THREE.MeshStandardMaterial({ color: '#f3c76c', metalness: 0.85, roughness: 0.26, emissive: new THREE.Color('#ffa64a'), emissiveIntensity: 0.7, envMapIntensity: 1.3 });
  const mkNum = (ch) => { const m = new THREE.Mesh(textGeometry3D(ch, { size: 0.24, depth: 0.045, bevel: 0.006, curveSegments: 8 }), numMat); m.castShadow = true; scene.add(m); return m; };
  const num2 = mkNum('2'), num5 = mkNum('5'), num0 = mkNum('0');
  const NUM_Y = 0.83;
  num0.geometry.computeBoundingBox();
  const zeroBox = num0.geometry.boundingBox, ZERO_W = zeroBox.max.x - zeroBox.min.x, ZERO_H = zeroBox.max.y - zeroBox.min.y;
  // the empty slot: a dashed outline in the tens tray while the gap is open
  const slot = (() => {
    const segs = [], w = 0.17, h = 0.26, d = 0.03, cy = NUM_Y;
    const edge = (a, b) => { const n = Math.ceil(a.distanceTo(b) / (d * 2)); for (let k = 0; k < n; k++) segs.push([a.clone().lerp(b, k / n), a.clone().lerp(b, Math.min(1, (k + 0.5) / n))]); };
    const c = [V(-w / 2, cy - h / 2, 0), V(w / 2, cy - h / 2, 0), V(w / 2, cy + h / 2, 0), V(-w / 2, cy + h / 2, 0)];
    for (let i = 0; i < 4; i++) edge(c[i], c[(i + 1) % 4]);
    const l = segmentsLine(segs, { color: '#ffd28a', intensity: 1.8, orderFn: () => 0, stagger: 0 });
    l.position.set(0, 0, TRAY_Z);
    return l;
  })();
  scene.add(slot);
  // the reading of the trays
  const read25 = new TextPlane('25', { font: FONTS.sans, weight: 200, height: 0.34, color: '#ffe2b0', intensity: 1.25 });
  const read205 = new TextPlane('205', { font: FONTS.sans, weight: 200, height: 0.34, color: '#ffe2b0', intensity: 1.35 });
  const readSum = new TextPlane('2 × 100 + 0 × 10 + 5 × 1', { font: FONTS.mono, weight: 400, height: 0.05, letterSpacing: 0.08, color: GOLD_HUD, intensity: 1.1 });
  const readGap = new TextPlane('2 · ? · 5', { font: FONTS.mono, weight: 400, height: 0.07, letterSpacing: 0.12, color: GOLD_HUD, intensity: 1.0 });
  const READ_X = 1.3;
  read25.position.set(READ_X + 0.26, 0.72, TRAY_Z); read205.position.set(READ_X + 0.34, 0.72, TRAY_Z);
  readSum.position.set(READ_X + readSum.worldWidth / 2 - 0.08, 0.45, TRAY_Z);
  readGap.position.set(READ_X + readGap.worldWidth / 2 - 0.08, 0.45, TRAY_Z);
  scene.add(read25, read205, readSum, readGap);

  // ======================================================================================== Brahmagupta
  const RC = V(0, 1.82, -1.0), RR = 0.42;
  const eqOpts = { font: FONTS.sans, weight: 200, height: 0.15, letterSpacing: 0.04, color: '#ffe6bd', intensity: 1.35 };
  const eqs = [['a + 0 = a', -1.08, 0.17], ['a − 0 = a', -1.08, -0.17], ['a × 0 = 0', 1.08, 0.0]].map(([s, dx, dy]) => {
    const tp = new TextPlane(s, eqOpts); tp.position.copy(RC).add(V(dx, dy, 0)); scene.add(tp); return tp;
  });
  const eqTicks = segmentsLine([[V(-0.58, 0.17, 0), V(-0.7, 0.17, 0)], [V(-0.58, -0.17, 0), V(-0.7, -0.17, 0)], [V(0.58, 0, 0), V(0.7, 0, 0)]], { color: GOLD_HUD, intensity: 1.4, orderFn: (a, b, i) => i * 0.2, stagger: 0.6 });
  eqTicks.position.copy(RC); scene.add(eqTicks);
  const dial = new RingGauge(RR * 1.3, { ticks: 120, majorEvery: 10, color: GOLD_HUD, intensity: 0.9, tickLen: 0.018 });
  dial.position.copy(RC); scene.add(dial);
  const brCall = new Callout('BRAHMAGUPTA · AD 628', { dx: 0.42, dy: 0.16, size: 0.05, color: GOLD_HUD, sub: 'BRAHMASPHUTASIDDHANTA', intensity: 1.4 });
  scene.add(brCall);
  const brNotes = ['FIRST RULES FOR ZERO AS A NUMBER', 'WITH FORTUNES (+) AND DEBTS (−)'].map((s, i) => {
    const tp = new TextPlane(s, { font: FONTS.mono, weight: 300, height: 0.032, letterSpacing: 0.12, color: GOLD_HUD, intensity: 0.95 });
    tp.position.copy(RC).add(V(0.75 + tp.worldWidth / 2, -0.15 - i * 0.055, 0)); scene.add(tp); return tp;
  });

  // ======================================================================================== numerals travel
  const N1 = V(-1.5, 0, -1.1), N2 = V(-3.7, 0, -2.6), N3 = V(-6.3, 0, -1.4);
  const H = 0.13;
  const pathCurve = new THREE.CatmullRomCurve3([
    RC.clone().add(V(-RR * 0.5, -RR * 0.5, 0.02)), V(-0.75, 1.05, -1.0), V(-1.25, 0.35, -1.05), N1.clone().setY(H),
    V(-2.5, H, -2.2), N2.clone().setY(H), V(-5.0, H, -2.55), N3.clone().setY(H), V(-7.2, H, -0.7),
  ], false, 'centripetal');
  const NP = 64, pathPts = pathCurve.getSpacedPoints(NP - 1);
  const sidePts = pathPts.map((p, i) => {
    const tng = pathPts[Math.min(NP - 1, i + 1)].clone().sub(pathPts[Math.max(0, i - 1)]).normalize();
    const s = new THREE.Vector3().crossVectors(tng, V(0, 1, 0));
    return s.lengthSq() < 0.05 ? V(1, 0, 0) : s.normalize();
  });
  // the map: graticule, the route line on the floor, the three cities
  const mapGrid = (() => {
    const segs = [];
    for (let x = -8; x <= 0.5; x += 0.55) segs.push([V(x, 0.003, -4.2), V(x, 0.003, 1.2)]);
    for (let z = -4.2; z <= 1.2; z += 0.55) segs.push([V(-8.5, 0.003, z), V(0.2, 0.003, z)]);
    return fadeLines(segs, { centre: V(-3.6, 0, -1.4), r0: 2.2, r1: 4.8, intensity: 0.2, sweep: [0.5, 0, 0] });
  })();
  scene.add(mapGrid);
  const floorRoute = progressLine(pathCurve.getSpacedPoints(240).slice(70).map((p) => V(p.x, 0.006, p.z)), { color: '#ffcf85', headColor: '#ffe2b0', intensity: 1.2, head: 0.02 });
  scene.add(floorRoute);
  const nodes = [N1, N2, N3].map((n) => {
    const g = new THREE.Group(); g.position.copy(n).setY(0.008);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.05, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28a').multiplyScalar(2.4), toneMapped: false, transparent: true }));
    disc.rotation.x = -Math.PI / 2;
    const ring1 = progressLine(circlePoints(0.12, 64, { plane: 'xz' }), { color: '#ffcf85', intensity: 1.4 });
    const ring2 = progressLine(circlePoints(0.2, 64, { plane: 'xz' }), { color: '#ffcf85', intensity: 0.8 });
    g.add(disc, ring1, ring2); scene.add(g);
    return { g, disc, ring1, ring2 };
  });
  const cityCalls = [
    [N1, 'INDIA', 'PLACE VALUE · ZERO', -0.3, 0.7],
    [N2, 'BAGHDAD · AL-KHWARIZMI · c. 825', 'WRITES ON THE HINDU NUMERALS', 0.4, 0.95],
    [N3, 'PISA · FIBONACCI · LIBER ABACI 1202', 'HINDU–ARABIC NUMERALS IN EUROPE', -0.24, 1.05],
  ].map(([n, label, sub, dx, dy]) => { const c = new Callout(label, { dx, dy, size: 0.105, color: GOLD_HUD, sub, intensity: 1.5 }); c.position.copy(n).setY(0.02); scene.add(c); return c; });

  // ---- the river of digits (instanced billboards, all motion in the vertex shader)
  const GLYPHS = 640;
  const gGeo = new THREE.InstancedBufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  gGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  gGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const aP = new Float32Array(GLYPHS * 4), aQ = new Float32Array(GLYPHS * 4);
  for (let i = 0; i < GLYPHS; i++) {
    const lat = (R() + R() + R()) / 1.5 - 1;        // denser in the middle of the stream
    aP.set([R(), lat, Math.pow(R(), 1.6), Math.floor(R() * 10)], i * 4);
    aQ.set([R(), R(), R(), R()], i * 4);
  }
  gGeo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  gGeo.setAttribute('aQ', new THREE.InstancedBufferAttribute(aQ, 4));
  gGeo.instanceCount = GLYPHS;
  const glyphMat = new THREE.ShaderMaterial({
    defines: { NP },
    uniforms: {
      uTime: { value: 0 }, uT0: { value: tNT + 0.02 }, uEmit: { value: 0.45 }, uSpeed: { value: 1.45 }, uC0: { value: tZR }, uSize: { value: 0.15 }, uOpacity: { value: 1 },
      uPath: { value: pathPts }, uSide: { value: sidePts }, uRC: { value: V(0, 0, 0) }, uE1: { value: V(1, 0, 0) }, uE2: { value: V(0, 1, 0) }, uRR: { value: 1 },
      uMap: { value: digitAtlas() },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aP; attribute vec4 aQ;
      uniform float uTime, uT0, uEmit, uSpeed, uC0, uSize;
      uniform vec3 uPath[NP]; uniform vec3 uSide[NP]; uniform vec3 uRC, uE1, uE2; uniform float uRR;
      varying vec2 vUv; varying float vA, vM, vC;
      void main(){
        float u = (uTime - (uT0 + aP.x * uEmit)) * uSpeed;
        float uc = clamp(u, 0.0, 1.0);
        float fi = uc * float(NP - 1);
        int i = int(min(floor(fi), float(NP - 2)));
        float f = fi - float(i);
        vec3 p = mix(uPath[i], uPath[i + 1], f);
        vec3 sd = normalize(mix(uSide[i], uSide[i + 1], f));
        float spread = smoothstep(0.0, 0.16, uc);
        p += sd * aP.y * (0.16 + 0.42 * spread) + vec3(0.0, (aP.z * 0.36 - 0.02) * spread, 0.0);
        p.y += sin(uTime * 3.0 + aP.x * 40.0) * 0.025 * spread;
        float c = clamp((uTime - uC0 - aQ.y * 0.1) / 0.2, 0.0, 1.0); c = c * c * (3.0 - 2.0 * c);
        float ang = aQ.x * 6.2831853 + c * 1.4 + uTime * 0.6;
        vec3 rp = uRC + uRR * (1.0 + (aQ.z - 0.5) * 0.08) * (cos(ang) * uE1 + sin(ang) * uE2);
        vec3 mid = mix(p, rp, 0.5) + vec3(0.0, 0.12 * (1.0 - aQ.y), 0.0);
        p = mix(mix(p, mid, c), mix(mid, rp, c), c);
        vM = smoothstep(0.5, 0.86, uc + (aQ.w - 0.5) * 0.14);
        vC = c;
        vA = step(0.0, u) * smoothstep(0.0, 0.05, u) * (1.0 - smoothstep(0.9, 1.0, u) * (1.0 - c)) * mix(0.3, 1.0, spread);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float s = uSize * (0.7 + 0.6 * aQ.z) * mix(0.55, 1.0, spread) * (1.0 - 0.45 * c);
        mv.xy += position.xy * s;
        vUv = vec2((aP.w + uv.x) / 10.0, uv.y);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; varying float vA, vM, vC;
      void main(){
        float aOld = texture2D(uMap, vec2(vUv.x, 0.5 + vUv.y * 0.5)).a;
        float aNew = texture2D(uMap, vec2(vUv.x, vUv.y * 0.5)).a;
        float a = mix(aOld, aNew, vM) * vA * uOpacity * 0.85;
        if (a < 0.01) discard;
        vec3 col = mix(vec3(1.0, 0.56, 0.2) * 1.0, vec3(1.0, 0.86, 0.62) * 1.3, vM);
        col = mix(col, vec3(1.0, 0.8, 0.5) * 2.0, vC);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glyphs = new THREE.Mesh(gGeo, glyphMat); glyphs.frustumCulled = false; glyphs.renderOrder = 5;
  scene.add(glyphs);

  // ======================================================================================== camera plan
  // keys per component, interpolated with monotone Hermite (timeWarp): smooth, no overshoot
  const CAM = [
    [-0.2, V(0.62, 0.86, 1.3), V(0.0, 0.3, -0.26)],
    [tDot, V(0.5, 0.8, 1.14), V(0.0, 0.28, -0.22)],
    [tPV - 0.05, V(0.26, 0.82, 1.5), V(0.0, 0.44, -0.24)],
    [tPV + 0.75, V(0.6, 1.18, 3.45), V(0.18, 1.08, -1.0)],
    [tBr + 0.55, V(-0.1, 2.0, 2.05), V(0.0, 2.0, -1.0)],
    [tNT - 0.1, V(-0.36, 2.08, 1.95), V(-0.14, 1.98, -1.0)],
    [tZR - 0.15, V(-2.55, 3.15, 4.65), V(-4.05, 0.4, -1.65)],
  ];
  const P6 = CAM[CAM.length - 1][1], L6 = CAM[CAM.length - 1][2];
  const D = L6.clone().sub(P6).normalize();
  const FC = P6.clone().addScaledVector(D, 3.7).add(V(0, 0.3, 0));     // the final ring, just above the frame centre
  const FR = 0.95;
  const DF = V(D.x, D.y * 0.2, D.z).normalize();                        // the flight line levels out through the ring
  CAM.push([tZR + 0.32, FC.clone().addScaledVector(DF, -2.6), FC.clone().addScaledVector(DF, 5)]);
  CAM.push([DUR + 0.05, FC.clone().addScaledVector(DF, 0.5), FC.clone().addScaledVector(DF, 7)]);
  const keysOf = (k, c) => CAM.map((e) => [e[0], e[k][c]]);
  const camK = ['x', 'y', 'z'].map((c) => keysOf(1, c)), lookK = ['x', 'y', 'z'].map((c) => keysOf(2, c));
  const E1 = new THREE.Vector3().crossVectors(DF, V(0, 1, 0)).normalize(), E2 = new THREE.Vector3().crossVectors(E1, DF).normalize();
  glyphMat.uniforms.uRC.value.copy(FC); glyphMat.uniforms.uE1.value.copy(E1); glyphMat.uniforms.uE2.value.copy(E2); glyphMat.uniforms.uRR.value = FR;
  // the final ring and its echoes down the flight line
  const fineRingGeo = new THREE.TorusGeometry(1, 0.012, 12, 240);
  const finalRings = [0, 1.25, 2.6].map((d, i) => {
    const m = new THREE.Mesh(fineRingGeo, new THREE.MeshBasicMaterial({ color: GOLD_LIGHT.clone(), toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(FC).addScaledVector(DF, d); m.lookAt(m.position.clone().add(DF)); m.scale.setScalar(FR * (1 + i * 0.12));
    const h = new THREE.Mesh(halo.geometry, haloMat.clone()); m.add(h);
    scene.add(m);
    return m;
  });
  finalLight.position.copy(FC);

  // dust motes in the light
  const dust = new Dust({ count: 1400, size: [11, 3.4, 7], center: [-2.4, 1.6, -0.8], particleSize: 0.012, color: '#ffd9a0', opacity: 0.5, intensity: 1.3 });
  scene.add(dust);

  const dof = { focus: 1.2, range: 0.6, amount: 0.5 };
  const bloom = { strength: 0.8 };
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const ringPos = new THREE.Vector3(), ringScale = new THREE.Vector3(1, 1, 1), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const Q_FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), Q_UP = new THREE.Quaternion();
  const HOVER = V(0.02, 0.36, -0.06);
  let subject = { centre: DOT.clone(), radius: 0.7 };

  // positions of the moving numeral groups
  const dropY = (t, t0, k) => { const u = ramp(t, t0 + k * 0.035, t0 + k * 0.035 + 0.22, ease.outCubic); return { u, y: (1 - u) * 0.75 }; };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const beat = pulse(T, { decay: 6 });

    // ---------------------------------------------------------------- camera
    const tc = Math.min(Math.max(t, -0.2), DUR + 0.05);
    camPos.set(timeWarp(tc, camK[0]), timeWarp(tc, camK[1]), timeWarp(tc, camK[2]));
    camLook.set(timeWarp(tc, lookK[0]), timeWarp(tc, lookK[1]), timeWarp(tc, lookK[2]));
    camPos.x += Math.sin(t * 0.9) * 0.012; camPos.y += Math.sin(t * 1.3 + 1) * 0.008;
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = lerp(35, 38, ramp(t, tZR, DUR, ease.inQuad));
    camera.updateProjectionMatrix();

    // ---------------------------------------------------------------- the dot and the ring
    const ign = ramp(t, tDot - 0.06, tDot + 0.08, ease.outCubic);
    const open = ramp(t, tDot + 0.12, tDot + 0.45, ease.inOutCubic);    // dot → ring on the page
    const lift = ramp(t, tDot + 0.4, tPV - 0.02, ease.inOutCubic);       // ring stands up and rises
    const fly = ramp(t, tPV + 0.5, tPV + 0.8, ease.inOutCubic);          // into the tens tray
    const land = ramp(t, tPV + 0.72, tPV + 0.88);
    const rise = ramp(t, tBr - 0.05, tBr + 0.4, ease.inOutCubic);         // out of the 0, up to the rules
    const leave = ramp(t, tNT + 0.1, tNT + 0.7);                          // it empties into the river
    dotMat.color.copy(GOLD_LIGHT).multiplyScalar(ign * (6 + 4 * Math.exp(-Math.max(0, t - tDot) * 6)));
    dot.visible = ign > 0 && open < 1;
    dot.scale.setScalar(1 + open * 3);
    dotMat.opacity = 1 - open;
    dotGlow.material.color.set('#ffbe6a').multiplyScalar(ign * (1 - lift) * (0.8 + 1.2 * Math.exp(-Math.max(0, t - tDot) * 5)));
    dotGlow.scale.setScalar(0.05 + 0.06 * ign + 0.05 * open);
    dotGlow.visible = ign > 0;

    // ring pose: page → hover → tens slot → above the trays
    const r0 = 0.006 + open * 0.07;
    ringPos.copy(DOT).add(V(0, 0.004, 0)).lerp(HOVER, lift);
    let rs = lerp(r0, 0.17, lift);
    let sx = 1;
    const slotP = V(0, NUM_Y, TRAY_Z);
    if (fly > 0) { ringPos.lerp(slotP, fly); rs = lerp(rs, ZERO_H * 0.5, fly); sx = lerp(1, ZERO_W / ZERO_H, fly); ringPos.y += Math.sin(Math.PI * fly) * 0.25; }
    if (rise > 0) { ringPos.lerp(RC, rise); rs = lerp(rs, RR, rise); sx = lerp(sx, 1, rise); }
    qa.copy(Q_FLAT).slerp(Q_UP, lift);
    ring.quaternion.copy(qa);
    ring.position.copy(ringPos);
    ringScale.set(rs * sx, rs, rs);
    ring.scale.copy(ringScale);
    const tubeK = lerp(1.8, 1, open) * (rise > 0 ? lerp(1, 0.7, rise) : 1);
    ring.scale.z = rs * tubeK;
    const ringGlow = open * (1 - land * (1 - rise)) * (1 - leave);
    ringMat.color.copy(GOLD_LIGHT).multiplyScalar((2.4 + beat * 0.6 * rise) * ringGlow);
    ring.visible = ringGlow > 0.003;
    haloMat.opacity = ringGlow * (0.22 + 0.18 * rise);
    ringLight.position.copy(ringPos);
    ringLight.intensity = ringGlow * (0.25 + rise * 1.6);

    // ---------------------------------------------------------------- the leaf and its pool of light
    pool.intensity = lerp(16, 4, ramp(t, tPV + 0.3, tBr));
    plinth.visible = t < tNT + 0.6;

    // ---------------------------------------------------------------- place-value trays
    const up = ramp(t, tPV - 0.2, tPV + 0.3, ease.outCubic);
    trays.forEach((g, i) => { g.position.y = lerp(-1.15, 0, ramp(t, tPV - 0.14 + i * 0.04, tPV + 0.22 + i * 0.04, ease.outCubic)); g.visible = g.position.y > -1.1; });
    placeNames.forEach((p, i) => { p.opacity = up; p.reveal = ramp(t, tPV + 0.1 + i * 0.06, tPV + 0.45 + i * 0.06, ease.outCubic); });
    trayLight.intensity = 22 * up;
    ledMat.color.set('#ffb860').multiplyScalar(2.2 * up);
    // "25": 2 in the tens, 5 in the ones; then the 2 hops to the hundreds (hop), the zero lands
    const g0 = tPV + 0.06;
    const hop = ramp(t, tPV + 0.36, tPV + 0.62, ease.inOutCubic);
    const hx = lerp(TRAY_X[1], TRAY_X[0], hop), hy = Math.sin(Math.PI * hop) * 0.62;
    beads2.forEach((b, k) => { const d = dropY(t, g0, k); b.position.set(hx, BEAD_Y(k) + d.y + hy, TRAY_Z); b.visible = d.u > 0; b.rotation.y = k * 0.7; });
    beads5.forEach((b, k) => { const d = dropY(t, g0 + 0.07, k); b.position.set(TRAY_X[2], BEAD_Y(k) + d.y, TRAY_Z); b.visible = d.u > 0; b.rotation.y = k * 0.9; });
    const n2 = ramp(t, g0 + 0.05, g0 + 0.3, ease.outBack), n5 = ramp(t, g0 + 0.12, g0 + 0.37, ease.outBack);
    num2.position.set(hx, NUM_Y + hy * 1.1 + (1 - n2) * 0.3, TRAY_Z); num2.scale.setScalar(Math.max(0.001, n2)); num2.visible = n2 > 0.001;
    num5.position.set(TRAY_X[2], NUM_Y + (1 - n5) * 0.3, TRAY_Z); num5.scale.setScalar(Math.max(0.001, n5)); num5.visible = n5 > 0.001;
    const n0 = ramp(t, tPV + 0.76, tPV + 0.95, ease.outCubic);
    num0.position.set(0, NUM_Y, TRAY_Z); num0.scale.set(lerp(1.15, 1, n0), lerp(1.15, 1, n0), Math.max(0.001, n0)); num0.visible = n0 > 0.001;
    numMat.emissiveIntensity = 0.7 + 0.6 * envelope(t, tPV + 0.76, tPV + 1.3, 0.05, 0.4);
    const gap = envelope(t, tPV + 0.55, tPV + 0.86, 0.06, 0.06);
    slot.progress = 1; slot.opacity = gap * (0.55 + 0.45 * Math.sin(t * 40) ** 2);
    // readings
    const r25 = envelope(t, tPV + 0.22, tPV + 0.5, 0.12, 0.1);
    read25.opacity = r25; read25.reveal = 1;
    readGap.opacity = envelope(t, tPV + 0.5, tPV + 0.78, 0.08, 0.06); readGap.reveal = 1;
    const r205 = ramp(t, tPV + 0.8, tPV + 0.96) * (1 - ramp(t, tNT - 0.1, tNT + 0.3));
    read205.opacity = r205; read205.reveal = ramp(t, tPV + 0.8, tPV + 1.0, ease.outCubic);
    readSum.opacity = r205; readSum.reveal = ramp(t, tPV + 0.9, tPV + 1.3, ease.outCubic);

    // ---------------------------------------------------------------- Brahmagupta's rules
    const brOut = 1 - ramp(t, tNT + 0.35, tNT + 0.7);
    eqs.forEach((e, i) => {
      const a = ramp(t, tBr + 0.32 + i * 0.22, tBr + 0.62 + i * 0.22, ease.outCubic);
      e.reveal = a; e.opacity = (a > 0 ? 1 : 0) * brOut;
      e.position.x = RC.x + [-1.08, -1.08, 1.08][i] + (1 - a) * 0.08 * Math.sign([-1, -1, 1][i]);
    });
    eqTicks.progress = ramp(t, tBr + 0.3, tBr + 0.9); eqTicks.opacity = brOut;
    dial.reveal(ramp(t, tBr + 0.15, tBr + 0.8, ease.outCubic), brOut * 0.9);
    dial.rotation.z = -t * 0.12;
    brCall.position.copy(RC).add(V(RR * 1.3 * 0.71, RR * 1.3 * 0.71, 0));
    faceCamera(brCall, camera);
    brCall.reveal(ramp(t, tBr + 0.45, tBr + 1.0, ease.outCubic), brOut);
    brNotes.forEach((n, i) => { n.reveal = ramp(t, tBr + 0.8 + i * 0.1, tBr + 1.15 + i * 0.1, ease.outCubic); n.opacity = n.reveal > 0 ? brOut : 0; });

    // ---------------------------------------------------------------- the river west
    glyphMat.uniforms.uTime.value = t;
    glyphMat.uniforms.uOpacity.value = 1 - ramp(t, DUR - 0.25, DUR + 0.05);
    glyphs.visible = t > tNT - 0.05;
    const mapIn = ramp(t, tNT - 0.1, tNT + 0.75, ease.inOutSine);
    mapGrid.material.uniforms.uSweep.value.x = lerp(0.6, -9, mapIn);
    mapGrid.material.uniforms.uOp.value = (t > tNT - 0.1 ? 1 : 0) * (1 - ramp(t, tZR + 0.2, DUR));
    mapGrid.visible = t > tNT - 0.1;
    floorRoute.progress = ramp(t, tNT + 0.06, tNT + 0.62, ease.inOutSine);
    floorRoute.opacity = 1 - ramp(t, tZR + 0.25, DUR);
    const nodeT = [tNT + 0.1, tNT + 0.32, tNT + 0.55];
    nodes.forEach((n, i) => {
      const a = ramp(t, nodeT[i], nodeT[i] + 0.25, ease.outCubic), out = 1 - ramp(t, tZR + 0.2, DUR);
      n.g.visible = a > 0; n.disc.material.opacity = a * out; n.disc.scale.setScalar(0.4 + 0.6 * a);
      n.ring1.progress = a; n.ring1.opacity = out; n.ring2.progress = ramp(t, nodeT[i] + 0.08, nodeT[i] + 0.4); n.ring2.opacity = out * 0.7;
    });
    cityCalls.forEach((c, i) => { faceCamera(c, camera); c.reveal(ramp(t, nodeT[i] + 0.04, nodeT[i] + 0.36, ease.outCubic), 1 - ramp(t, tZR + 0.15, tZR + 0.4)); });
    polar.material.uniforms.uOp.value = 1 - 0.6 * ramp(t, tNT, tZR);

    // ---------------------------------------------------------------- the zero ring
    const fz = ramp(t, tZR + 0.05, tZR + 0.4, ease.outCubic);
    const near = lerp(0.4, 1, smoothstep(0.5, 2.4, camera.position.distanceTo(FC)));
    finalRings.forEach((m, i) => {
      const a = i === 0 ? fz : ramp(t, tZR + 0.2 + i * 0.08, tZR + 0.45 + i * 0.08, ease.outCubic);
      m.visible = a > 0.002;
      m.material.color.copy(GOLD_LIGHT).multiplyScalar(a * (i === 0 ? (4.0 + 1.5 * ramp(t, tZR + 0.35, DUR)) * near : 2.6 - i * 0.6));
      m.children[0].material.opacity = a * (i === 0 ? 0.2 * near : 0.07) * (1 - 0.6 * ramp(t, tZR + 0.35, DUR));
      m.rotation.z = t * (i % 2 ? -0.3 : 0.25);
      const s = FR * (1 + i * 0.12) * lerp(0.82, 1, a);
      m.scale.set(s, s, s);
    });
    finalLight.intensity = 1.8 * fz;

    // ---------------------------------------------------------------- atmosphere, lens, glow
    dust.tick(t, info);
    dust.u.opacity = 0.35 + 0.25 * ramp(t, tPV, tNT);
    const toRing = camera.position.distanceTo(FC);
    if (t < tPV + 0.3) { dof.focus = camera.position.distanceTo(t < tDot + 0.4 ? DOT : ringPos); dof.range = 0.5; dof.amount = 0.5; }
    else if (t < tNT) { dof.focus = camera.position.distanceTo(rise > 0.3 ? RC : tmp.set(0, 0.6, TRAY_Z)); dof.range = 1.4; dof.amount = 0.4; }
    else { dof.focus = lerp(camera.position.distanceTo(tmp.set(-3, 0.3, -1.4)), toRing, ramp(t, tZR - 0.1, tZR + 0.2)); dof.range = 3; dof.amount = 0.25; }
    bloom.strength = 0.8 + 0.25 * ign * Math.exp(-Math.max(0, t - tDot) * 4) - 0.15 * ramp(t, tZR + 0.1, tZR + 0.4);
    api.exposure = 1 + 0.25 * ramp(t, DUR - 0.25, DUR, ease.inQuad);

    // AR subject
    if (t < tPV + 0.3) subject = { centre: V(0, 0.2, -0.1), radius: 0.8 };
    else if (t < tBr + 0.2) subject = { centre: V(0.3, 0.6, TRAY_Z), radius: 1.4 };
    else if (t < tNT + 0.3) subject = { centre: RC, radius: 1.6 };
    else if (t < tZR) subject = { centre: V(-3.0, 0.4, -1.3), radius: 3.8 };
    else subject = { centre: FC, radius: FR * 1.6 };
  }

  const api = {
    scene, camera, update, dof, bloom, exposure: 1, background: 0x000000,
    arSubject: () => subject,
    exploreLimits: { yaw: 1.0, pitchDown: 0.4, pitchUp: 0.6, zoomIn: 0.4, zoomOut: 2.5 },
  };
  return api;
}
