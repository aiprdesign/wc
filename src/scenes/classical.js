// CLASSICAL ARCHITECTURE & ENGINEERING (7.5 – 12.5 s)
// Technique: procedural modelling (a lathe profile revolves into a fluted column),
// material look-dev progression (wireframe → clay → marble via world-space build
// shaders), architectural visualisation (peristyle temple, sun shafts, haze) and a
// technical HUD (blueprint proportions, load paths, arch thrust lines).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp } from '../lib/math.js';
import { marbleTexture } from '../lib/textures.js';
import { progressLine, segmentsLine, circlePoints } from '../lib/lines.js';
import { lightShaft } from '../lib/materials.js';
import { Dust } from '../lib/particles.js';
import { Callout, Dimension, faceCamera } from '../lib/hud.js';
import { TextPlane, FONTS } from '../lib/text.js';

const H = 6;               // column height (m)
const R = 0.42;            // lower shaft radius
const FLUTES = 20;         // Doric flutes
const GOLD_LINE = '#ffcf85';
const BLUE_LINE = '#bcd6ff';

// Column profile (radius, y) from base to top of shaft; entasis gives the subtle swell.
function shaftProfile() {
  const pts = [];
  const y0 = 0.32, y1 = 5.46;
  for (let i = 0; i <= 36; i++) {
    const u = i / 36;
    const r = R * (1 - 0.2 * u) + R * 0.035 * Math.sin(Math.PI * u);
    pts.push(new THREE.Vector2(r, lerp(y0, y1, u)));
  }
  return pts;
}

// Revolve the profile and carve concave flutes by modulating the radius with angle.
function columnGeometry(detail = 1) {
  const radial = FLUTES * 6 * detail;
  const shaft = new THREE.LatheGeometry(shaftProfile(), radial);
  const p = shaft.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    const flute = 1 - 0.045 * Math.pow(0.5 + 0.5 * Math.cos(a * FLUTES), 0.6);
    const k = y > 5.3 ? lerp(flute, 1, smoothstep(5.3, 5.46, y)) : flute;
    p.setXYZ(i, Math.cos(a) * r * k, y, Math.sin(a) * r * k);
  }
  shaft.computeVertexNormals();
  // Attic base: plinth + torus + scotia-ish ring
  const plinth = new THREE.BoxGeometry(R * 2.7, 0.14, R * 2.7); plinth.translate(0, 0.07, 0);
  const torus = new THREE.TorusGeometry(R * 1.08, 0.085, 12, 64); torus.rotateX(Math.PI / 2); torus.translate(0, 0.2, 0);
  const ring = new THREE.CylinderGeometry(R * 1.02, R * 1.1, 0.1, 64); ring.translate(0, 0.28, 0);
  // Doric capital: necking, echinus (lathe), abacus
  const neck = new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.06, 64); neck.translate(0, 5.49, 0);
  const echProfile = [];
  for (let i = 0; i <= 12; i++) { const u = i / 12; echProfile.push(new THREE.Vector2(R * (0.82 + 0.5 * Math.pow(u, 0.7)), 5.52 + u * 0.26)); }
  const echinus = new THREE.LatheGeometry(echProfile, 64);
  const abacus = new THREE.BoxGeometry(R * 2.8, 0.2, R * 2.8); abacus.translate(0, 5.9, 0);
  const parts = [shaft, plinth, torus, ring, neck, echinus, abacus].map((g) => {
    const n = g.toNonIndexed();
    n.deleteAttribute('uv');
    return n;
  });
  const merged = mergeGeometries(parts);
  // Cylindrical UVs for the marble texture
  const pos = merged.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (Math.atan2(pos.getZ(i), pos.getX(i)) / (Math.PI * 2) + 0.5) * 1.2; uv[i * 2 + 1] = pos.getY(i) / H * 2.2; }
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return merged;
}

// World-space "build" shader: geometry exists only below uBuild (in world Y, with a
// noisy edge) and above uFloor; a hot rim glows at the construction front.
function withBuild(material, edgeColor = '#ffb766') {
  const u = { uBuild: { value: 100 }, uFloor: { value: -100 }, uEdge: { value: new THREE.Color(edgeColor) }, uEdgeGain: { value: 6 } };
  material.userData.build = u;
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBuildW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 bw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          bw = instanceMatrix * bw;
        #endif
        vBuildW = (modelMatrix * bw).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vBuildW; uniform float uBuild, uFloor, uEdgeGain; uniform vec3 uEdge;
        float bHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        float bNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(bHash(i), bHash(i+vec2(1,0)), f.x), mix(bHash(i+vec2(0,1)), bHash(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float bn = (bNoise(vBuildW.xz * 3.0 + vBuildW.y * 0.7) - 0.5) * 0.18;
        float bd = uBuild + bn - vBuildW.y;
        if (bd < 0.0 || vBuildW.y < uFloor + bn) discard;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uEdge * uEdgeGain * (1.0 - smoothstep(0.0, 0.07, bd));`);
  };
  material.customProgramCacheKey = () => 'build-v1';
  return material;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.12;
  scene.fog = new THREE.FogExp2('#0d0a07', 0.018);
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.1, 300);

  // ---------------------------------------------------------------------- temple layout
  const FRONT_Z = 5.5, SPACING = 2.0;
  const colPositions = [];
  for (let i = 0; i < 8; i++) { const x = -7 + i * SPACING; colPositions.push([x, FRONT_Z], [x, -FRONT_Z]); }
  for (const z of [-3.3, -1.1, 1.1, 3.3]) colPositions.push([-7, z], [7, z]);
  const HERO = new THREE.Vector3(-1, 0, FRONT_Z);   // the column we build is one of the front row

  // ---------------------------------------------------------------------- materials
  const marbleMap = marbleTexture({ seed: 2 });
  const marbleMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f3ede2', roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.4 }), '#ffc680');
  const heroMarble = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f5efe4', roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), '#ffd9a0');
  const heroClay = withBuild(new THREE.MeshStandardMaterial({ color: '#b9a48c', roughness: 0.95 }), '#ff9f4a');
  const stoneMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 5 }), color: '#d9d1c4', roughness: 0.5 }), '#ffc680');

  // ---------------------------------------------------------------------- hero column
  const colGeo = columnGeometry(1);
  const hero = new THREE.Group();
  hero.position.copy(HERO);
  scene.add(hero);
  const heroClayMesh = new THREE.Mesh(colGeo, heroClay);
  const heroMarbleMesh = new THREE.Mesh(colGeo, heroMarble);
  heroClayMesh.castShadow = heroMarbleMesh.castShadow = true;
  heroClayMesh.receiveShadow = heroMarbleMesh.receiveShadow = true;
  hero.add(heroClayMesh, heroMarbleMesh);

  // Procedural modelling HUD: the 2D profile, the axis, then the revolve sweep.
  const profilePts = shaftProfile().map((v) => new THREE.Vector3(v.x, v.y, 0));
  const profile = progressLine([new THREE.Vector3(R * 1.35, 0, 0), new THREE.Vector3(R * 1.35, 0.14, 0), new THREE.Vector3(R * 1.2, 0.28, 0), ...profilePts,
    new THREE.Vector3(R * 1.3, 5.78, 0), new THREE.Vector3(R * 1.4, 5.8, 0), new THREE.Vector3(R * 1.4, 6.0, 0), new THREE.Vector3(0, 6.0, 0)], { color: GOLD_LINE, intensity: 1.4, head: 0.05 });
  const axis = segmentsLine(Array.from({ length: 26 }, (_, i) => [new THREE.Vector3(0, i * 0.26 - 0.3, 0), new THREE.Vector3(0, i * 0.26 - 0.18, 0)]), { color: GOLD_LINE, intensity: 1.2, orderFn: (a, b, i) => i / 26 * 0.6, stagger: 0.6 });
  hero.add(profile, axis);

  // Wireframe revolve: meridians appear by angle, then latitude rings.
  const wireSegs = [];
  const wireGeo = new THREE.LatheGeometry(shaftProfile(), FLUTES * 2);
  const wp = wireGeo.attributes.position;
  const cols = shaftProfile().length;
  for (let s = 0; s < FLUTES * 2; s++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = new THREE.Vector3().fromBufferAttribute(wp, s * cols + j), b = new THREE.Vector3().fromBufferAttribute(wp, s * cols + j + 1);
      wireSegs.push([a, b, s / (FLUTES * 2)]);
    }
  }
  for (let j = 0; j < cols; j += 3) {
    for (let s = 0; s < FLUTES * 2; s++) {
      const a = new THREE.Vector3().fromBufferAttribute(wp, s * cols + j), b = new THREE.Vector3().fromBufferAttribute(wp, ((s + 1) % (FLUTES * 2)) * cols + j);
      wireSegs.push([a, b, 0.55 + (j / cols) * 0.4]);
    }
  }
  const wire = segmentsLine(wireSegs.map(([a, b]) => [a, b]), { color: GOLD_LINE, headColor: '#fff3d6', intensity: 0.75, orderFn: (a, b, i) => wireSegs[i][2] * 0.85, stagger: 0.85 });
  // capital + base rings as circles
  const capRings = [0.07, 0.2, 0.28, 5.49, 5.6, 5.78, 5.9].map((y, i) => progressLine(circlePoints(i < 3 ? R * 1.1 : i > 4 ? R * 1.35 : R * 0.9, 64, { plane: 'xz', center: new THREE.Vector3(0, y, 0) }), { color: GOLD_LINE, intensity: 0.9 }));
  hero.add(wire, ...capRings);

  // Anatomy of the order — callouts that face the camera.
  const partCallouts = [
    ['ABACUS', 5.9, 0.9, 0.35, 'SQUARE SLAB · 0.28 D'],
    ['ECHINUS', 5.62, 1.05, -0.25, 'CUSHION CAPITAL'],
    ['SHAFT · 20 FLUTES', 3.4, 0.95, 0.2, 'ENTASIS 1/35'],
    ['ATTIC BASE', 0.2, 0.95, 0.35, 'TORUS · SCOTIA · PLINTH'],
  ].map(([label, y, dx, dy, sub]) => {
    const c = new Callout(label, { dx, dy, size: 0.085, color: '#ffe3b3', sub, intensity: 1.5 });
    c.userData.y = y;
    scene.add(c);
    return c;
  });

  // ---------------------------------------------------------------------- the temple
  const templeCols = new THREE.InstancedMesh(colGeo, marbleMat, colPositions.length - 1);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (const [x, z] of colPositions) {
    if (x === HERO.x && z === HERO.z) continue;
    m4.makeRotationY((x * 7.3 + z * 3.1) % 6.28).setPosition(x, 0, z);
    templeCols.setMatrixAt(k++, m4);
  }
  templeCols.castShadow = templeCols.receiveShadow = true;
  scene.add(templeCols);

  const temple = new THREE.Group();
  scene.add(temple);
  const addBox = (w, h, d, x, y, z, mat = stoneMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; temple.add(m); return m; };
  // crepidoma (three steps) — top of the stylobate is y = 0
  for (let i = 0; i < 3; i++) addBox(15.6 + i * 1.2, 0.3, 12.6 + i * 1.2, 0, -0.15 - i * 0.3, 0);
  // entablature: architrave, frieze, cornice
  addBox(15.3, 0.62, 11.9, 0, 6.31, 0);
  addBox(15.3, 0.62, 11.9, 0, 6.93, 0);
  addBox(15.9, 0.24, 12.5, 0, 7.36, 0);
  // triglyphs on front and back frieze
  const tri = new THREE.InstancedMesh(new THREE.BoxGeometry(0.36, 0.56, 0.08), stoneMat, 32);
  let ti = 0;
  for (let i = 0; i < 16; i++) {
    const x = -7 + i * (14 / 15);
    for (const z of [5.99, -5.99]) { m4.makeTranslation(x, 6.93, z); tri.setMatrixAt(ti++, m4); }
  }
  tri.castShadow = true;
  temple.add(tri);
  // pediments + roof as one extruded triangular prism
  const pedShape = new THREE.Shape([new THREE.Vector2(-7.95, 0), new THREE.Vector2(7.95, 0), new THREE.Vector2(0, 1.95)]);
  const ped = new THREE.ExtrudeGeometry(pedShape, { depth: 12.5, bevelEnabled: false });
  ped.translate(0, 7.48, -6.25);
  const pedMesh = new THREE.Mesh(ped, stoneMat);
  pedMesh.castShadow = true;
  temple.add(pedMesh);
  // tympanum recess (darker inset) and cella wall
  const tymp = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-7.1, 0.12), new THREE.Vector2(7.1, 0.12), new THREE.Vector2(0, 1.66)])), withBuild(new THREE.MeshStandardMaterial({ color: '#6d665d', roughness: 0.8 })));
  tymp.position.set(0, 7.48, 6.26);
  temple.add(tymp);
  const cella = new THREE.Mesh(new THREE.BoxGeometry(9.5, 6, 7.4), withBuild(new THREE.MeshStandardMaterial({ color: '#3b342d', roughness: 0.9 })));
  cella.position.set(0, 3, -0.6);
  cella.receiveShadow = true;
  temple.add(cella);
  const cellaDoor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5c').multiplyScalar(0.1), toneMapped: false }));
  cellaDoor.position.set(0, 2.1, 3.11);
  temple.add(cellaDoor);

  // ground: dark polished stone that catches the sun
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.55, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // sky dome: warm horizon glow fading to black
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uLit: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uLit; varying vec3 vP;
      void main(){ float h = vP.y; float sun = pow(max(0.0, dot(vP, normalize(vec3(-0.85, 0.3, 0.2)))), 6.0);
        float band = smoothstep(-0.01, 0.06, h) * (1.0 - smoothstep(0.06, 0.45, h));
        vec3 c = vec3(0.05, 0.035, 0.025) + vec3(0.42, 0.24, 0.1) * band * (0.5 + sun) + vec3(0.9, 0.6, 0.3) * sun * 0.25 * smoothstep(-0.02, 0.1, h);
        gl_FragColor = vec4(c * uLit, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  scene.add(sky);

  // ---------------------------------------------------------------------- light
  const key = new THREE.SpotLight('#ffd2a0', 0, 30, 0.45, 0.6, 1.2);   // opening pool of light on the hero column
  key.position.set(HERO.x + 5, 11, HERO.z + 6);
  key.target.position.set(HERO.x, 3, HERO.z);
  scene.add(key, key.target);
  const rim = new THREE.PointLight('#9fb9ff', 0, 12, 2);
  rim.position.set(HERO.x - 2.5, 4.5, HERO.z - 2);
  scene.add(rim);
  const sun = new THREE.DirectionalLight('#ffcf9a', 0);
  sun.position.set(-24, 13, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  const fill = new THREE.HemisphereLight('#6d7c99', '#2a1d12', 0);
  scene.add(fill);

  // sun shafts raking through the colonnade + dust in the beams
  const shafts = [];
  const sunDir = new THREE.Vector3(24, -13, -9).normalize();
  for (let i = 0; i < 4; i++) {
    const s = lightShaft({ length: 34, radiusTop: 0.5, radiusBottom: 2.2 + i * 0.4, color: '#ffcf96', intensity: 0.08 });
    const target = new THREE.Vector3(-4 + i * 3.6, 2, 3.5 - i * 2.2);
    s.position.copy(target).addScaledVector(sunDir, -16);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), sunDir);
    scene.add(s); shafts.push(s);
  }
  const dust = new Dust({ count: 2200, size: [22, 10, 16], center: [0, 4, 3], particleSize: 0.035, color: '#ffe0b0', opacity: 0.55 });
  scene.add(dust);

  // ---------------------------------------------------------------------- engineering overlays
  // Everything lives on the facade plane just in front of the colonnade so it parallaxes with the building.
  const overlay = new THREE.Group();
  overlay.position.z = FRONT_Z + 0.7;
  scene.add(overlay);
  const V = (x, y) => new THREE.Vector3(x, y, 0);
  // golden rectangle framing the facade (15.2 × 9.4 ≈ φ) with its square subdivisions and spiral
  const phi = 1.618034, gw = 15.6, gh = gw / phi, gx0 = -gw / 2, gy0 = -0.95;
  const golden = progressLine([V(gx0, gy0), V(gx0 + gw, gy0), V(gx0 + gw, gy0 + gh), V(gx0, gy0 + gh)], { closed: true, color: BLUE_LINE, intensity: 1.3 });
  const subdiv = [];
  { let x = gx0, y = gy0, w = gw, h = gh, dir = 0;
    for (let i = 0; i < 6; i++) {
      if (dir === 0) { subdiv.push([V(x + h, y), V(x + h, y + h)]); x += h; w -= h; }
      else if (dir === 1) { subdiv.push([V(x, y + h - w), V(x + w, y + h - w)]); h -= w; }
      else if (dir === 2) { subdiv.push([V(x + w - h, y), V(x + w - h, y + h)]); w -= h; }
      else { subdiv.push([V(x, y + w), V(x + w, y + w)]); y += w; h -= w; }
      dir = (dir + 1) % 4;
    } }
  const goldenSub = segmentsLine(subdiv, { color: BLUE_LINE, intensity: 0.9, orderFn: (a, b, i) => i * 0.1, stagger: 0.6 });
  const spiralPts = [];
  { // quarter arcs through the squares
    let x = gx0, y = gy0, w = gw, h = gh;
    const arcs = [];
    for (let i = 0; i < 6; i++) {
      const d = i % 4;
      if (d === 0) { arcs.push([x + h, y, h, Math.PI, Math.PI / 2]); x += h; w -= h; }
      else if (d === 1) { arcs.push([x, y + h - w, w, Math.PI / 2, 0]); h -= w; }
      else if (d === 2) { arcs.push([x + w - h, y + h, h, 0, -Math.PI / 2]); w -= h; }
      else { arcs.push([x + w, y + w, w, -Math.PI / 2, -Math.PI]); y += w; h -= w; }
    }
    for (const [cx, cy, r, a0, a1] of arcs) for (let j = 0; j <= 16; j++) { const a = lerp(a0, a1, j / 16); spiralPts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
  }
  const spiral = progressLine(spiralPts, { color: GOLD_LINE, intensity: 1.6, head: 0.03 });
  const phiLabel = new TextPlane('φ = 1.618', { font: FONTS.serif, italic: true, weight: 500, height: 0.62, color: '#ffe3b3', intensity: 1.4 });
  phiLabel.position.set(gx0 + gw - 1.6, gy0 + gh + 0.55, 0);
  overlay.add(golden, goldenSub, spiral, phiLabel);

  // load paths: flowing dashes descending every front column (compression), arrowheads at the base
  const flowMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#ffd49a') } },
    vertexShader: 'attribute float aS; varying float vS; void main(){ vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime, uOpacity; uniform vec3 uColor; varying float vS;
      void main(){ float d = fract(vS * 1.6 + uTime * 1.8); float a = smoothstep(0.0, 0.1, d) * smoothstep(0.55, 0.3, d);
        gl_FragColor = vec4(uColor * 2.4, a * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  { const pos = [], s = [];
    for (let i = 0; i < 8; i++) {
      const x = -7 + i * SPACING;
      for (const off of [-0.18, 0.18]) { pos.push(x + off, 7.2, 0, x + off, -0.9, 0); s.push(0, 8.1); }
      // arrowheads
      pos.push(x - 0.22, -0.55, 0, x, -0.9, 0, x + 0.22, -0.55, 0, x, -0.9, 0); s.push(7.6, 8.1, 7.6, 8.1);
    }
    // roof thrust: along both raking cornices down to the corners
    pos.push(0, 9.43, 0, -7.95, 7.48, 0, 0, 9.43, 0, 7.95, 7.48, 0); s.push(-2, 0, -2, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(s.map((v) => -v), 1));
    overlay.add(new THREE.LineSegments(g, flowMat));
  }
  const loadLabel = new Callout('LOAD PATH · COMPRESSION', { dx: -1.6, dy: 1.2, size: 0.3, color: '#ffe3b3', sub: 'DEAD LOAD → STYLOBATE' });
  loadLabel.position.set(-7, 2.4, 0.05);
  const pedLabel = new Callout('PEDIMENT · 13.7°', { dx: 2.2, dy: 1.1, size: 0.3, color: '#cfe0ff', sub: 'RAKING CORNICE' });
  pedLabel.position.set(4, 8.4, 0.05);
  const pedArc = progressLine(circlePoints(2.6, 24, { start: Math.PI, end: Math.PI - 0.239, center: V(7.95, 7.48) }), { color: BLUE_LINE, intensity: 1.4 });
  const colDim = new Dimension(V(8.4, 0), V(8.4, 6), 'H = 7 D', { size: 0.26, tick: 0.25, color: '#cfe0ff' });
  const bayDim = new Dimension(V(-1, -0.6), V(1, -0.6), '2.0 m · INTERCOLUMNIATION', { size: 0.2, tick: 0.18, color: '#cfe0ff' });
  overlay.add(loadLabel, pedLabel, pedArc, colDim, bayDim);

  // Roman arch diagram beside the temple: voussoirs, keystone, thrust line
  const arch = new THREE.Group();
  arch.position.set(13.5, 0, FRONT_Z - 1.5);
  arch.rotation.y = -0.35;
  scene.add(arch);
  const ar = 2.4, at = 0.7;
  const archSegs = [];
  const nV = 11;
  for (let i = 0; i <= nV; i++) {
    const a = Math.PI - (i / nV) * Math.PI;
    archSegs.push([V(Math.cos(a) * ar, 3 + Math.sin(a) * ar), V(Math.cos(a) * (ar + at), 3 + Math.sin(a) * (ar + at))]);
  }
  const archJoints = segmentsLine(archSegs, { color: BLUE_LINE, intensity: 1.2, orderFn: (a, b, i) => i / nV * 0.5, stagger: 0.5 });
  const archIn = progressLine(circlePoints(ar, 48, { start: Math.PI, end: 0, center: V(0, 3) }), { color: BLUE_LINE, intensity: 1.3 });
  const archOut = progressLine(circlePoints(ar + at, 48, { start: Math.PI, end: 0, center: V(0, 3) }), { color: BLUE_LINE, intensity: 1.3 });
  const piers = segmentsLine([[V(-ar, 3), V(-ar, 0)], [V(-ar - at, 3), V(-ar - at, 0)], [V(ar, 3), V(ar, 0)], [V(ar + at, 3), V(ar + at, 0)]], { color: BLUE_LINE, intensity: 1.2, orderFn: () => 0, stagger: 0 });
  const thrustPts = [];
  for (let i = 0; i <= 40; i++) { const u = i / 40 * 2 - 1; thrustPts.push(V(u * (ar + at * 0.5), 3 + (ar + at * 0.45) * Math.cos(u * Math.PI / 2) ** 0.8 - (1 - Math.abs(u)) * 0.05)); }
  thrustPts.unshift(V(-(ar + at * 0.8), 0)); thrustPts.push(V(ar + at * 0.8, 0));
  const thrust = progressLine(thrustPts, { color: '#ffb766', intensity: 2.4, head: 0.05 });
  const keystone = new Callout('KEYSTONE', { dx: 1.2, dy: 0.9, size: 0.2, color: '#cfe0ff', sub: 'ARCH · THRUST LINE' });
  keystone.position.set(0, 3 + ar + at, 0);
  arch.add(archJoints, archIn, archOut, piers, thrust, keystone);

  // screen-space chapter card
  const hud = ctx.makeHUD();
  const chapter = new TextPlane('CLASSICAL ARCHITECTURE & ENGINEERING', { font: FONTS.mono, weight: 400, height: 0.045, letterSpacing: 0.35, color: '#ffe8c4', intensity: 1.1, align: 'left' });
  chapter.position.set(-ctx.aspect + 0.12 + chapter.worldWidth / 2, -0.84, 0);
  const chapterSub = new TextPlane('Proportion · Order · Structure', { font: FONTS.serif, italic: true, weight: 500, height: 0.062, color: '#ffe8c4', intensity: 0.9, align: 'left' });
  chapterSub.position.set(-ctx.aspect + 0.12 + chapterSub.worldWidth / 2, -0.9, 0);
  hud.scene.add(chapter, chapterSub);

  // ---------------------------------------------------------------------- animation
  const tWire = cue('columnWire'), tClay = cue('columnClay'), tMarble = cue('columnMarble');
  const tLit = cue('templeLit'), tReveal = cue('templeReveal'), tOver = cue('overlays');
  const dur = segment.end - segment.start;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), orbitPos = new THREE.Vector3(), orbitLook = new THREE.Vector3();
  const widePos = new THREE.Vector3(-8.5, 2.6, 31), wideLook = new THREE.Vector3(1.2, 4.0, 0);
  const tmp = new THREE.Vector3();
  const dof = { focus: 4, range: 1.6, amount: 0.6 };
  const bloom = { strength: 0.75 };

  function update(t, info) {
    // --- procedural modelling: profile → axis → revolve
    profile.progress = ramp(t, -0.3, tWire + 0.25, ease.outCubic);
    profile.opacity = 1 - ramp(t, tClay, tClay + 0.5);
    axis.progress = ramp(t, 0.0, tWire + 0.4);
    axis.opacity = 1 - ramp(t, tMarble, tMarble + 0.4);
    wire.progress = ramp(t, tWire, tClay + 0.1, ease.inOutSine);
    wire.opacity = 1 - 0.85 * ramp(t, tClay + 0.1, tMarble + 0.3);
    capRings.forEach((c, i) => { c.progress = ramp(t, tWire + 0.3 + i * 0.07, tWire + 0.8 + i * 0.07); c.opacity = 1 - ramp(t, tClay + 0.2, tMarble); });

    // --- look-dev: clay builds upward, then marble sweeps over it
    const clayY = lerp(-0.2, H + 0.3, ramp(t, tClay - 0.15, tMarble - 0.1, ease.inOutSine));
    const marbleY = lerp(-0.2, H + 0.3, ramp(t, tMarble, tLit + 0.15, ease.inOutSine));
    heroClay.userData.build.uBuild.value = clayY;
    heroClay.userData.build.uFloor.value = marbleY - 0.02;
    heroMarble.userData.build.uBuild.value = marbleY;
    heroClayMesh.visible = clayY > -0.1 && marbleY < H + 0.2;
    heroMarbleMesh.visible = marbleY > -0.1;

    // --- the rest of the temple materialises from the ground up when the lights come on
    const templeY = lerp(-1.3, 10, ramp(t, tLit - 0.1, tOver + 0.2, ease.inOutSine));
    for (const m of [marbleMat, stoneMat, cella.material, tymp.material]) m.userData.build.uBuild.value = templeY;
    templeCols.visible = temple.visible = templeY > -1.25;
    cellaDoor.visible = templeY > 2;

    // --- lighting: a single pool of light, then the sun rises through the colonnade
    const lit = ramp(t, tLit - 0.2, tLit + 0.6, ease.outCubic);
    key.intensity = lerp(0, 55, ramp(t, -0.3, tWire + 0.4)) * (1 - 0.7 * lit);
    rim.intensity = lerp(0, 10, ramp(t, tClay, tMarble)) * (1 - 0.5 * lit);
    sun.intensity = lit * 3.4;
    fill.intensity = 0.05 + lit * 0.35;
    scene.environmentIntensity = 0.1 + lit * 0.32;
    sky.material.uniforms.uLit.value = lit;
    shafts.forEach((s, i) => { s.material.uniforms.uIntensity.value = 0.07 * lit * (0.8 + 0.2 * Math.sin(t * 0.7 + i)); s.material.uniforms.uTime.value = t; });
    dust.tick(t, info);
    dust.u.opacity = 0.2 + lit * 0.45;

    // --- camera: orbit the column while it's modelled, then a speed-ramped pull-back
    const orbitT = timeWarp(t, [[0, 0], [tClay, 0.45], [tReveal, 0.85], [dur, 1.1]]);
    const ang = lerp(0.35, 1.95, orbitT);                         // radians around the column (π/2 = straight on)
    const rad = lerp(10.5, 12.5, orbitT);
    orbitPos.set(HERO.x + Math.cos(ang) * rad, lerp(1.8, 4.0, orbitT), HERO.z + Math.sin(ang) * rad);
    // lens offset: aim right of the column so it sits on the left third, callouts in the open space
    const shift = lerp(1.9, 1.2, orbitT);
    orbitLook.set(HERO.x + Math.sin(ang) * shift, 3.05, HERO.z - Math.cos(ang) * shift);
    const pull = ramp(t, tReveal - 0.2, dur + 0.15, (x) => ease.outQuart(x) * 0.85 + x * 0.15);
    camPos.copy(orbitPos).lerp(widePos, pull);
    camLook.copy(orbitLook).lerp(wideLook, ease.inOutSine(pull));
    // subtle handheld drift
    camPos.x += Math.sin(t * 0.9) * 0.03; camPos.y += Math.sin(t * 1.3 + 1) * 0.02;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = lerp(34, 38, pull);
    camera.updateProjectionMatrix();

    // --- callouts on the column (only while it is being modelled)
    partCallouts.forEach((c, i) => {
      const a = ramp(t, tWire + 0.35 + i * 0.12, tWire + 0.95 + i * 0.12);
      const out = 1 - ramp(t, tMarble + 0.1, tMarble + 0.5);
      c.position.set(HERO.x, c.userData.y, HERO.z);
      faceCamera(c, camera);
      c.reveal(a, out);
      c.visible = a > 0 && out > 0;
    });

    // --- engineering overlays on the facade
    const o = (i) => ramp(t, tOver + i * 0.14, tOver + 0.7 + i * 0.14, ease.outCubic);
    const oFade = 1 - ramp(t, dur - 0.35, dur);
    golden.progress = o(0); golden.opacity = 0.9 * oFade;
    goldenSub.progress = o(1); goldenSub.opacity = 0.7 * oFade;
    spiral.progress = o(2); spiral.opacity = oFade;
    phiLabel.reveal = o(3); phiLabel.opacity = o(3) > 0 ? oFade : 0;
    flowMat.uniforms.uTime.value = t; flowMat.uniforms.uOpacity.value = o(1) * oFade * 0.9;
    loadLabel.reveal(o(2), oFade); pedLabel.reveal(o(3), oFade);
    pedArc.progress = o(3); pedArc.opacity = oFade;
    colDim.reveal(o(4), oFade); bayDim.reveal(o(5), oFade);
    const archP = ramp(t, tOver + 0.2, tOver + 1.2, ease.outCubic);
    archIn.progress = archP; archOut.progress = archP; piers.progress = archP; archJoints.progress = ramp(t, tOver + 0.5, tOver + 1.3);
    thrust.progress = ramp(t, tOver + 0.8, tOver + 1.5);
    [archIn, archOut, piers, archJoints, thrust].forEach((l) => (l.opacity = oFade));
    keystone.reveal(ramp(t, tOver + 0.9, tOver + 1.5), oFade);

    // --- chapter card
    const cc = envelope(t, tWire + 0.2, dur - 0.3, 0.5, 0.4);
    // the global title layer (src/core/titles.js) now carries the chapter heading
    chapter.opacity = 0; chapter.reveal = ramp(t, tWire + 0.2, tWire + 1.1, ease.outCubic) * cc;
    chapterSub.opacity = 0; chapterSub.reveal = ramp(t, tWire + 0.5, tWire + 1.4, ease.outCubic);

    // --- lens: shallow focus on the column, then deep focus on the building
    tmp.copy(camera.position).sub(HERO).setY(0);
    dof.focus = lerp(tmp.length(), camera.position.distanceTo(wideLook), pull);
    dof.range = lerp(2.5, 18, pull);
    dof.amount = lerp(0.6, 0.2, pull);
    bloom.strength = 0.75 + 0.15 * envelope(t, tLit - 0.1, tReveal + 0.8, 0.2, 0.6);
    api.exposure = lerp(1.0, 1.1, lit);
  }

  const api = { scene, camera, hud, update, dof, bloom, exposure: 1 };
  return api;
}
