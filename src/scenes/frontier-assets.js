// THE NEW FRONTIER — build-time assets. Generic spacecraft built from primitives (no brand marks),
// an analytic sky / planet backdrop (pixel-exact limbs at any scale, one draw), GPU smoke trails,
// a Hubble-style deep field of procedural galaxies, the double helix with its sequencing glyphs.
// All motion is driven by uniforms, so every frame is a pure function of time.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rng, TAU } from '../lib/math.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { GLSL_NOISE } from '../lib/noise.js';
import { FONTS } from '../lib/text.js';
import { drawUSFlag, crinkleTexture } from './moonshot-assets.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ------------------------------------------------------------------ geometry helpers
export function bake(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  return geo.applyMatrix4(_m);
}
export function merge(geos) {
  const list = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    n.clearGroups();
    return n;
  });
  return mergeGeometries(list, false);
}
// per-vertex colour from position + normal (fn(outColor, x, y, z, nx, ny, nz))
export function paint(geo, fn) {
  const p = geo.attributes.position, n = geo.attributes.normal, arr = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
// lathe from [r, y] pairs (y ascending)
export const lathe = (pts, segs = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), segs);
// tangent-ogive nose: radius r0 at y=0 closing to a point at y=len
export const ogive = (r0, len, n = 16, blunt = 0.6) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [r0 * Math.pow(1 - Math.pow(u, 1.7), blunt), u * len]; });
export function strut(a, b, r, mat, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(V3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const shape = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };

// ------------------------------------------------------------------ textures
function noiseTex(size = 256, seed = 3, { k = 0.5, blobs = 400, rep = true } = {}) {
  const r = rng(seed), c = mkCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < blobs; i++) {
    const x = r() * size, y = r() * size, s = 2 + r() * 10, l = Math.floor(128 + (r() - 0.5) * 255 * k);
    g.fillStyle = `rgba(${l},${l},${l},0.35)`; g.beginPath(); g.ellipse(x, y, s, s * (0.4 + r()), r() * 3, 0, TAU); g.fill();
  }
  return toTexture(c, { srgb: false, repeat: rep });
}
// multi-layer insulation: silver panels with seams (Hubble's skin)
function mliTexture(seed = 4) {
  const r = rng(seed), S = 512, c = mkCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#c4c6c9'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 46; i++) {
    const w = S * (0.12 + r() * 0.3), h = S * (0.1 + r() * 0.3), x = Math.floor(r() * 8) * S / 8, y = Math.floor(r() * 6) * S / 6;
    const l = 170 + Math.floor(r() * 60);
    g.fillStyle = `rgb(${l},${l + 1},${l + 3})`; g.fillRect(x, y, w, h);
  }
  g.strokeStyle = 'rgba(70,72,78,0.8)'; g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * S / 8, 0); g.lineTo(i * S / 8, S); g.stroke(); }
  for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(0, i * S / 6); g.lineTo(S, i * S / 6); g.stroke(); }
  g.fillStyle = 'rgba(40,40,44,0.6)';
  for (let i = 0; i < 400; i++) { g.beginPath(); g.arc(r() * S, r() * S, 1.2, 0, TAU); g.fill(); }
  return toTexture(c, { repeat: true });
}
// photovoltaic array: dark cells, silver bus bars
export function solarTexture(cols = 24, rows = 8, seed = 5) {
  const r = rng(seed), W = 768, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#8d9097'; g.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const l = r() * 10;
    g.fillStyle = `rgb(${24 + l},${30 + l},${58 + l * 1.5})`;
    g.fillRect(i * cw + 1.5, j * ch + 1.5, cw - 3, ch - 3);
    g.fillStyle = 'rgba(160,170,190,0.18)'; g.fillRect(i * cw + 1.5, j * ch + ch * 0.5, cw - 3, 1);
  }
  g.strokeStyle = '#b8bcc4'; g.lineWidth = 3;
  for (let i = 0; i <= cols; i += 6) { g.beginPath(); g.moveTo(i * cw, 0); g.lineTo(i * cw, H); g.stroke(); }
  g.strokeRect(1, 1, W - 2, H - 2);
  return toTexture(c, { anisotropy: 8 });
}
// "UNITED STATES" + flag decal for the orbiter's fuselage (transparent)
function usDecal() {
  const W = 1024, H = 112, c = mkCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  drawUSFlag(g, 8, 14, 84, { red: '#a8182c', blue: '#2e3166' });
  g.fillStyle = '#16171a'; g.textBaseline = 'middle';
  g.font = `600 70px "${FONTS.sans}"`;
  let x = 8 + 84 * 1.9 + 34;
  for (const ch of 'UNITED STATES') { g.fillText(ch, x, H / 2 + 4); x += g.measureText(ch).width + 7; }
  return toTexture(c, { anisotropy: 8 });
}

// ------------------------------------------------------------------ Space Shuttle (generic; 1 unit = 10 m)
// Stack frame: +Y = thrust axis (nose), orbiter on the +Z side of the external tank, SRBs on ±X.
export function buildShuttle() {
  const W = new THREE.Color('#e3e2dc'), K = new THREE.Color('#131416'), G = new THREE.Color('#3a3b3e');
  const group = new THREE.Group();
  // --- orbiter (local: nose +Y, payload bay +Z, belly −Z, right wing +X)
  const orbParts = [];
  orbParts.push(bake(new THREE.CylinderGeometry(0.26, 0.27, 2.85, 40, 10), [0, 1.9, 0], [0, 0, 0], [1, 1, 0.9]));
  const nose = lathe(ogive(0.26, 0.52, 16, 0.55), 40);
  { const p = nose.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getY(i) / 0.52; p.setZ(i, p.getZ(i) - 0.07 * u * u); } nose.computeVertexNormals(); }
  orbParts.push(bake(nose, [0, 3.325, 0], [0, 0, 0], [1, 1, 0.9]));
  for (const sx of [-1, 1]) orbParts.push(bake(new THREE.CapsuleGeometry(0.078, 0.5, 6, 16), [sx * 0.16, 0.78, 0.19]));
  const wing = (sx) => bake(new THREE.ExtrudeGeometry(shape([[0.24, 2.42], [0.31, 2.2], [0.6, 1.4], [1.19, 0.62], [1.19, 0.5], [0.24, 0.5]].map(([x, y]) => [x * sx, y])),
    { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 1 }), [0, 0, -0.215]);
  orbParts.push(wing(1), wing(-1));
  orbParts.push(bake(new THREE.ExtrudeGeometry(shape([[0, 0.46], [0, 1.25], [0.78, 0.68], [0.78, 0.42]]), { depth: 0.035, bevelEnabled: false }), [0.0175, 0, 0.19], [0, -Math.PI / 2, 0]));
  orbParts.push(bake(new THREE.BoxGeometry(0.44, 0.13, 0.03), [0, 0.43, -0.2]));
  const orbGeo = merge(orbParts);
  paint(orbGeo, (c, x, y, z, nx, ny, nz) => {
    const wingZone = Math.abs(x) > 0.29 && z < -0.12;
    if (y > 3.76) c.copy(K);
    else if (nz < -0.32) c.copy(K);
    else if (wingZone && Math.abs(nz) < 0.6 && ny > 0.15) c.copy(G);
    else if (y > 3.33 && y < 3.5 && nz > 0.42 && Math.abs(x) < 0.17) c.copy(K);
    else if (y > 3.35 && y < 3.47 && Math.abs(nx) > 0.62 && z > 0.02) c.copy(K);
    else c.copy(W).multiplyScalar(0.93 + 0.07 * hash3(Math.floor(x * 30), Math.floor(y * 30), Math.floor(z * 30)));
  });
  const hullMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });
  const orbiter = new THREE.Group();
  const orbMesh = new THREE.Mesh(orbGeo, hullMat); orbiter.add(orbMesh);
  const bellMat = new THREE.MeshStandardMaterial({ color: '#4b4a48', metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
  const ssme = [[0, 0.36, 0.1], [0.12, 0.36, -0.07], [-0.12, 0.36, -0.07]];
  for (const [x, y, z] of ssme) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.1, 0.24, 20, 1, true), bellMat); b.position.set(x, y - 0.12, z); orbiter.add(b); }
  const decalMat = new THREE.MeshStandardMaterial({ map: usDecal(), transparent: true, alphaTest: 0.3, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  for (const sx of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), decalMat);
    d.rotation.set(0, sx * Math.PI / 2, sx * Math.PI / 2); d.position.set(sx * 0.2635, 2.15, 0.02);
    orbiter.add(d);
  }
  orbiter.position.set(0, 0.02, 0.8);
  group.add(orbiter);
  // --- external tank (foam)
  const etGeo = merge([
    bake(new THREE.CylinderGeometry(0.42, 0.42, 3.85, 48, 14), [0, 1.925, 0]),
    bake(lathe(ogive(0.42, 0.85, 20, 0.62), 48), [0, 3.85, 0]),
    bake(new THREE.SphereGeometry(0.42, 48, 6, 0, TAU, Math.PI / 2, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1, 0.32, 1]),
    bake(new THREE.CylinderGeometry(0.03, 0.03, 3.0, 10), [0.3, 1.95, 0.3]),
    bake(new THREE.CylinderGeometry(0.022, 0.022, 3.2, 8), [-0.33, 2.0, 0.27]),
  ]);
  const foamA = new THREE.Color('#9c4c1f'), foamB = new THREE.Color('#b0602a');
  paint(etGeo, (c, x, y, z) => {
    const inter = y > 2.52 && y < 2.9;
    c.copy(y > 2.9 ? foamB : foamA);
    if (inter) c.copy(foamB).multiplyScalar(1.08 + 0.1 * Math.cos(Math.atan2(z, x) * 60));
    c.multiplyScalar(0.9 + 0.12 * hash3(Math.floor(x * 14), Math.floor(y * 9), Math.floor(z * 14)));
  });
  const etMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, bumpMap: noiseTex(256, 7, { k: 0.8, blobs: 900 }), bumpScale: 1.2 });
  etMat.bumpMap.repeat.set(6, 6);
  const et = new THREE.Mesh(etGeo, etMat); group.add(et);
  // --- solid rocket boosters
  const srbGeo = merge([
    bake(new THREE.CylinderGeometry(0.185, 0.185, 3.75, 32, 6), [0, 2.125, 0]),
    bake(lathe(ogive(0.185, 0.46, 12, 0.7), 32), [0, 4.0, 0]),
    bake(new THREE.CylinderGeometry(0.185, 0.25, 0.26, 32, 1), [0, 0.13, 0]),
    bake(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 32, 1), [0, 0.62, 0]),
    bake(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 32, 1), [0, 3.72, 0]),
  ]);
  paint(srbGeo, (c, x, y, z) => {
    const band = Math.hypot(x, z) > 0.187 && ((y > 0.59 && y < 0.65) || (y > 3.69 && y < 3.75));
    c.copy(band ? K : W).multiplyScalar(0.94 + 0.06 * hash3(Math.floor(x * 30), Math.floor(y * 12), Math.floor(z * 30)));
  });
  const srbs = [-1, 1].map((sx) => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(srbGeo, hullMat));
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.3, 24, 1, true), bellMat); nz.position.y = -0.15; s.add(nz);
    s.position.set(sx * 0.64, 0, 0);
    group.add(s);
    return s;
  });
  group.traverse((o) => { if (o.isMesh && o.material !== decalMat) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, orbiter, et, srbs, ssme: ssme.map(([x, y, z]) => V3(x, y - 0.24, z + 0.8)), srbExit: -0.3 };
}

// ------------------------------------------------------------------ Hubble Space Telescope (generic; 1 unit = 4 m, aperture +Z)
export function buildHubble() {
  const g = new THREE.Group();
  const mli = mliTexture(); mli.repeat.set(3, 1);
  const crinkle = crinkleTexture(11, 256);
  const silver = new THREE.MeshStandardMaterial({ map: mli, color: '#c9ccd1', metalness: 0.88, roughness: 0.36, bumpMap: crinkle, bumpScale: 0.8 });
  const silverFwd = silver.clone(); silverFwd.map = mli.clone(); silverFwd.map.repeat.set(3, 2); silverFwd.map.needsUpdate = true;
  const black = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.95, metalness: 0 });
  const add = (geo, mat, p = [0, 0, 0], r = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const RX = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.535, 0.535, 1.3, 56, 1), silver, [0, 0, -1.0], [RX, 0, 0]);
  add(new THREE.CylinderGeometry(0.4, 0.4, 2.0, 56, 1, true), silverFwd, [0, 0, 0.65], [RX, 0, 0]);
  add(new THREE.CylinderGeometry(0.393, 0.393, 2.0, 56, 1, true), new THREE.MeshStandardMaterial({ color: '#070708', roughness: 0.9, side: THREE.BackSide }), [0, 0, 0.65], [RX, 0, 0]);
  add(new THREE.RingGeometry(0.39, 0.535, 56), silver, [0, 0, -0.35]);
  add(new THREE.TorusGeometry(0.4, 0.012, 8, 64), silver, [0, 0, 1.65]);
  add(new THREE.TorusGeometry(0.535, 0.014, 8, 64), silver, [0, 0, -0.35]);
  // equipment-bay seams on the aft shroud
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; add(new THREE.BoxGeometry(0.012, 0.012, 1.3), black, [Math.cos(a) * 0.538, Math.sin(a) * 0.538, -1.0]); }
  // interior: baffles, primary mirror, secondary + four-vane spider (Hubble's four diffraction spikes)
  const baffle = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide });
  for (const z of [1.35, 0.95, 0.55, 0.15]) add(new THREE.RingGeometry(0.31, 0.393, 48), baffle, [0, 0, z]);
  const mirror = add(new THREE.RingGeometry(0.07, 0.38, 64), new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 1, roughness: 0.04 }), [0, 0, -0.32]);
  add(new THREE.CylinderGeometry(0.08, 0.08, 0.04, 32), black, [0, 0, 0.95], [RX, 0, 0]);
  add(new THREE.BoxGeometry(0.79, 0.008, 0.03), baffle, [0, 0, 0.95]);
  add(new THREE.BoxGeometry(0.008, 0.79, 0.03), baffle, [0, 0, 0.95]);
  // aperture door, hinged on the top rim
  const door = new THREE.Group(); door.position.set(0, 0.405, 1.66); g.add(door);
  const dm = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.03, 48), silver); dm.rotation.x = RX; dm.position.set(0, -0.43, 0.02); dm.castShadow = true; door.add(dm);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 10), black); hinge.rotation.z = RX; door.add(hinge);
  door.rotation.x = -1.95;
  // solar arrays (two rigid wings on booms) and high-gain antennas on masts
  const cellTex = solarTexture(28, 8, 9);
  const cellMat = new THREE.MeshStandardMaterial({ map: cellTex, metalness: 0.55, roughness: 0.32, side: THREE.FrontSide });
  const backMat = new THREE.MeshStandardMaterial({ color: '#8d8f94', metalness: 0.4, roughness: 0.5 });
  const arrays = [-1, 1].map((sx) => {
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 10), baffle, [sx * 0.72, 0, -0.3], [0, 0, RX]);
    const a = new THREE.Group(); a.position.set(sx * 0.9, 0, -0.3); g.add(a);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.62), cellMat); front.rotation.x = -RX; front.position.x = sx * 0.975;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.95, 0.62), backMat); back.rotation.x = RX; back.position.set(sx * 0.975, -0.004, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.97, 0.014, 0.64), backMat); frame.position.set(sx * 0.975, -0.012, 0);
    [front, back, frame].forEach((m) => { m.castShadow = m.receiveShadow = true; a.add(m); });
    return a;
  });
  const dishMat = new THREE.MeshStandardMaterial({ color: '#e4e3de', roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide });
  for (const sy of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 8), baffle, [0, sy * 0.92, -0.6]);
    const d = add(new THREE.SphereGeometry(0.2, 28, 6, 0, TAU, 0, 0.62), dishMat, [0, sy * 1.35, -0.6], [sy > 0 ? 0.3 : Math.PI - 0.3, 0, 0]);
    d.scale.y = 0.6;
  }
  return { group: g, door, arrays, mirror };
}

// ------------------------------------------------------------------ James Webb Space Telescope (generic; 1 unit = 1 m)
// 18 flat-top hexagonal segments (5 columns: 3-4-4-4-3; the outer columns are the folding wings),
// secondary mirror on a tripod, five-layer sunshield opening like a fan, spacecraft bus beneath.
export function buildWebb(env, goldEnv = env) {
  const g = new THREE.Group();
  const s = 0.762, F = 7.3;                       // segment circumradius, primary focal length
  const hexPts = (r) => Array.from({ length: 6 }, (_, k) => [r * Math.cos(k * Math.PI / 3), r * Math.sin(k * Math.PI / 3)]);
  const segGeo = new THREE.ExtrudeGeometry(shape(hexPts(s - 0.016)), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 1 });
  segGeo.translate(0, 0, -0.062);
  const backGeo = new THREE.ExtrudeGeometry(shape(hexPts(s - 0.03)), { depth: 0.24, bevelEnabled: false });
  backGeo.translate(0, 0, -0.32);
  const sweep = { uSweep: { value: -99 }, uSweepDir: { value: new THREE.Vector3(1, 0.35, 0).normalize() }, uSweepK: { value: 0 } };
  const goldM = new THREE.MeshStandardMaterial({ color: '#f0c060', metalness: 1, roughness: 0.2, envMap: goldEnv, envMapIntensity: 0.4 });
  goldM.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, sweep);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uSweep, uSweepK; uniform vec3 uSweepDir;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float band = exp(-pow((dot(vWp, uSweepDir) - uSweep) / 0.45, 2.0));
        totalEmissiveRadiance += vec3(1.0, 0.78, 0.42) * band * uSweepK;`);
  };
  goldM.customProgramCacheKey = () => 'frontier-webb-gold';
  const darkM = new THREE.MeshStandardMaterial({ color: '#16171b', metalness: 0.5, roughness: 0.55 });
  const blackM = new THREE.MeshStandardMaterial({ color: '#0b0b0d', metalness: 0.2, roughness: 0.8 });
  const ote = new THREE.Group(); g.add(ote);           // optical telescope element (primary centre at its origin, facing +Z)
  const wings = { '-1': new THREE.Group(), '1': new THREE.Group() };
  const HINGE = 1.5 * s * 1.5;
  for (const k of ['-1', '1']) { wings[k].position.set(Number(k) * HINGE, 0, 0); ote.add(wings[k]); }
  const up = V3(0, 0, 1), dir = V3(), pos = V3();
  const segments = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) {
    const d = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
    if (d < 1 || d > 2) continue;
    pos.set(1.5 * s * q, Math.sqrt(3) * s * (r + q / 2), 0);
    pos.z = (pos.x * pos.x + pos.y * pos.y) / (4 * F);
    dir.set(0, 0, F).sub(pos).normalize();
    const seg = new THREE.Group();
    seg.quaternion.setFromUnitVectors(up, dir);
    const m = new THREE.Mesh(segGeo, goldM), b = new THREE.Mesh(backGeo, darkM);
    m.castShadow = b.castShadow = true; m.receiveShadow = true;
    seg.add(m, b);
    const parent = Math.abs(q) === 2 ? wings[String(Math.sign(q))] : ote;
    seg.position.copy(pos);
    if (parent !== ote) seg.position.x -= parent.position.x;
    parent.add(seg);
    segments.push(seg);
  }
  // central aft-optics baffle, backplane, instrument module
  const aos = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.8, 24), blackM); aos.rotation.x = Math.PI / 2; aos.position.z = 0.25; ote.add(aos);
  const bp = new THREE.Mesh(new THREE.BoxGeometry(3.3, 6.4, 0.5), darkM); bp.position.z = -0.55; ote.add(bp);
  const isim = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 1.6), darkM); isim.position.set(0, -0.6, -1.6); ote.add(isim);
  // secondary mirror on a tripod
  const SMZ = 7.1, SM = V3(0, 0, SMZ);
  const smM = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.07, 6), goldM); smM.rotation.x = Math.PI / 2; smM.position.copy(SM); ote.add(smM);
  const smBack = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.25, 6), darkM); smBack.rotation.x = Math.PI / 2; smBack.position.set(0, 0, SMZ + 0.15); ote.add(smBack);
  const strutM = new THREE.MeshStandardMaterial({ color: '#2a2b30', metalness: 0.6, roughness: 0.45 });
  for (const a of [V3(0, 3.35, 0.45), V3(-2.25, -2.0, 0.4), V3(2.25, -2.0, 0.4)]) ote.add(strut(a, SM.clone().add(V3(a.x * 0.08, a.y * 0.08, 0)), 0.045, strutM));
  ote.position.set(0, 4.25, -1.2);
  ote.rotation.x = -0.08;
  // deployable tower + spacecraft bus + its solar panel
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 16), darkM); tower.position.set(0, -0.4, -1.8); g.add(tower);
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.4), new THREE.MeshStandardMaterial({ color: '#8f8a7e', metalness: 0.7, roughness: 0.4 })); bus.position.set(0, -2.0, -1.6); g.add(bus);
  const sp = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.04, 1.5), new THREE.MeshStandardMaterial({ map: solarTexture(30, 8, 3), metalness: 0.5, roughness: 0.4 })); sp.position.set(0, -2.6, -3.6); sp.rotation.x = 0.35; g.add(sp);
  // sunshield: five membranes, stretched hexagon (≈ 21 × 14 m); each layer is a shallow pyramid
  // whose drop (scale.y) and spacing open up during deployment — the gaps widen towards the edges
  const outline = [[0, 10.5], [7.0, 1.4], [7.0, -1.4], [0, -10.5], [-7.0, -1.4], [-7.0, 1.4]];
  const ring = [];
  for (let e = 0; e < 6; e++) { const [ax, az] = outline[e], [bx, bz] = outline[(e + 1) % 6]; for (let k = 0; k < 16; k++) { const u = k / 16; ring.push([ax + (bx - ax) * u, az + (bz - az) * u]); } }
  const RINGS = 10, NR = ring.length;
  const layerGeo = (i) => {
    const posA = [0, 0, 0], idx = [];
    for (let j = 1; j <= RINGS; j++) for (let k = 0; k < NR; k++) { const u = j / RINGS; const [x, z] = ring[k]; posA.push(x * u, -u * (0.12 + i * 0.1), z * u); }
    for (let k = 0; k < NR; k++) idx.push(0, 1 + k, 1 + ((k + 1) % NR));
    for (let j = 1; j < RINGS; j++) for (let k = 0; k < NR; k++) {
      const a = 1 + (j - 1) * NR + k, b = 1 + (j - 1) * NR + ((k + 1) % NR), c = a + NR, d = b + NR;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return geo;
  };
  const layers = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshStandardMaterial({ color: i === 0 ? '#cfc2d6' : '#bba6bd', metalness: 0.72, roughness: 0.36 + i * 0.03, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.8 });
    const L = new THREE.Mesh(layerGeo(i), m); L.receiveShadow = true; L.castShadow = i === 0;
    const edge = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring.map(([x, z]) => V3(x, -(0.12 + i * 0.1), z))), new THREE.LineBasicMaterial({ color: new THREE.Color('#f1e6f4').multiplyScalar(0.8), transparent: true, opacity: 0.8 }));
    L.add(edge);
    g.add(L); layers.push(L);
  }
  const boomM = darkM;
  for (const sx of [-1, 1]) { const b = strut(V3(0, -0.9, 0), V3(sx * 7.0, -0.9, 0), 0.05, boomM); g.add(b); }
  g.traverse((o) => { if (o.isMesh && o.castShadow === false && o.material !== goldM) o.castShadow = true; });
  return { group: g, ote, wings, layers, segments, sweep, goldM, SM: SM.clone() };
}

// ------------------------------------------------------------------ Mars rover (Perseverance-class, generic; metres, front +Z)
export function buildRover() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: '#d2cabd', roughness: 0.62, metalness: 0.08 });
  const grey = new THREE.MeshStandardMaterial({ color: '#7d7f83', roughness: 0.45, metalness: 0.65 });
  const dark = new THREE.MeshStandardMaterial({ color: '#27282b', roughness: 0.5, metalness: 0.5 });
  const goldF = new THREE.MeshStandardMaterial({ color: '#9b7a3e', roughness: 0.45, metalness: 1 });
  const add = (geo, mat, p, r = [0, 0, 0], parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(1.3, 0.52, 1.95), white, [0, 0.98, 0]);
  add(new THREE.BoxGeometry(1.5, 0.05, 2.1), white, [0, 1.26, 0]);
  add(new THREE.BoxGeometry(1.32, 0.1, 1.97), goldF, [0, 0.7, 0]);
  // RTG with fins at the rear
  const rtg = new THREE.Group(); rtg.position.set(0, 1.38, -1.12); rtg.rotation.x = -0.95; g.add(rtg);
  add(new THREE.CylinderGeometry(0.19, 0.19, 0.66, 18), dark, [0, 0, 0], [0, 0, 0], rtg);
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; add(new THREE.BoxGeometry(0.012, 0.6, 0.14), dark, [Math.cos(a) * 0.24, 0, Math.sin(a) * 0.24], [0, -a, 0], rtg); }
  // remote-sensing mast + head (two camera eyes, one large aperture)
  add(new THREE.CylinderGeometry(0.045, 0.05, 1.0, 12), grey, [0.45, 1.78, 0.78]);
  add(new THREE.BoxGeometry(0.42, 0.24, 0.26), white, [0.45, 2.36, 0.8]);
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 20), dark, [0.45, 2.42, 0.94], [Math.PI / 2, 0, 0]);
  for (const x of [-0.1, 0.1]) add(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 16), dark, [0.45 + x, 2.3, 0.94], [Math.PI / 2, 0, 0]);
  // high-gain antenna paddle, UHF antenna
  add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 6), grey, [-0.42, 1.45, 0.35], [0.4, 0, 0.3]);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), grey, [-0.5, 1.37, -0.3]);
  // robotic arm, stowed across the front, turret at its end
  add(new THREE.BoxGeometry(1.0, 0.07, 0.07), grey, [0.05, 0.92, 1.08]);
  add(new THREE.BoxGeometry(0.07, 0.07, 0.5), grey, [-0.46, 0.92, 0.85]);
  add(new THREE.BoxGeometry(0.28, 0.24, 0.24), white, [0.52, 0.86, 1.14]);
  // six wheels on rocker-bogies
  const treadC = mkCanvas(256, 64), tg = treadC.getContext('2d');
  tg.fillStyle = '#8e8f92'; tg.fillRect(0, 0, 256, 64); tg.strokeStyle = '#4a4b4e'; tg.lineWidth = 3;
  for (let i = 0; i < 48; i++) { const x = i * 256 / 48; tg.beginPath(); tg.moveTo(x, 0); tg.lineTo(x + 6, 32); tg.lineTo(x, 64); tg.stroke(); }
  const wheelM = new THREE.MeshStandardMaterial({ map: toTexture(treadC), roughness: 0.5, metalness: 0.7 });
  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [1.05, 0.08, -0.92]) {
    const w = add(new THREE.CylinderGeometry(0.26, 0.26, 0.38, 32, 1), [wheelM, dark, dark], [sx * 1.2, 0.26, z], [0, 0, Math.PI / 2]);
    wheels.push(w);
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 16), dark, [sx * 1.2, 0.26, z], [0, 0, Math.PI / 2]);
  }
  for (const sx of [-1, 1]) {
    const P = (x, y, z) => V3(sx * x, y, z);
    g.add(strut(P(0.7, 0.95, 0.05), P(1.0, 0.8, 0.55), 0.035, grey), strut(P(1.0, 0.8, 0.55), P(1.2, 0.3, 1.05), 0.035, grey));
    g.add(strut(P(0.7, 0.95, 0.05), P(1.0, 0.7, -0.35), 0.035, grey), strut(P(1.0, 0.7, -0.35), P(1.2, 0.3, 0.08), 0.03, grey), strut(P(1.0, 0.7, -0.35), P(1.2, 0.3, -0.92), 0.03, grey));
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, wheels };
}

// ------------------------------------------------------------------ Mars helicopter (Ingenuity-class, generic; metres)
const rotorBlurFrag = /* glsl */ `
uniform float uO, uAng; varying vec2 vUv;
void main(){
  vec2 p = vUv - 0.5; float r = length(p) * 2.0; if (r > 1.0 || r < 0.05) discard;
  float a = atan(p.y, p.x) + uAng;
  float streak = 0.55 + 0.45 * pow(abs(cos(a)), 12.0);
  float ring = smoothstep(1.0, 0.9, r) * smoothstep(0.05, 0.25, r);
  gl_FragColor = vec4(vec3(0.12, 0.12, 0.13), ring * streak * uO * (0.35 + 0.4 * r));
}`;
export function buildIngenuity() {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: '#b08a4c', metalness: 0.9, roughness: 0.42 });
  const carbon = new THREE.MeshStandardMaterial({ color: '#1f2023', metalness: 0.3, roughness: 0.5 });
  const pv = new THREE.MeshStandardMaterial({ map: solarTexture(8, 4, 13), metalness: 0.5, roughness: 0.35 });
  const add = (geo, mat, p, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  add(new THREE.BoxGeometry(0.15, 0.13, 0.17), foil, [0, 0.22, 0]);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const leg = strut(V3(sx * 0.05, 0.18, sz * 0.05), V3(sx * 0.2, 0.012, sz * 0.2), 0.006, carbon, 6); leg.castShadow = true; g.add(leg);
    add(new THREE.SphereGeometry(0.014, 8, 6), carbon, [sx * 0.2, 0.012, sz * 0.2]);
  }
  add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), carbon, [0, 0.43, 0]);
  add(new THREE.BoxGeometry(0.19, 0.012, 0.11), pv, [0, 0.585, 0]);
  const blade = new THREE.ExtrudeGeometry(shape([[0.03, -0.022], [0.6, -0.012], [0.6, 0.012], [0.03, 0.03]]), { depth: 0.006, bevelEnabled: false });
  blade.rotateX(Math.PI / 2);
  const rotors = [0.335, 0.43].map((y) => {
    const r = new THREE.Group(); r.position.y = y; g.add(r);
    for (const a of [0, Math.PI]) { const b = new THREE.Mesh(blade, carbon); b.rotation.y = a; b.castShadow = true; r.add(b); }
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), carbon, [0, 0, 0], r);
    return r;
  });
  const blurs = [0.335, 0.43].map((y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 1.24), new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 }, uAng: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: rotorBlurFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.rotation.x = -Math.PI / 2; m.position.y = y + 0.004; g.add(m);
    return m;
  });
  return { group: g, rotors, blurs };
}

// ------------------------------------------------------------------ heavy-lift rocket (SLS-class silhouette, generic; 1 unit = 10 m)
export function buildHeavyLift() {
  const W = new THREE.Color('#dcdad4'), K = new THREE.Color('#141416'), O = new THREE.Color('#a4531f'), S = new THREE.Color('#9fa3a8');
  const parts = [
    bake(new THREE.CylinderGeometry(0.42, 0.42, 6.4, 40, 10), [0, 3.3, 0]),            // core stage 0.1 .. 6.5
    bake(new THREE.CylinderGeometry(0.42, 0.44, 0.3, 40, 1), [0, 0.0, 0]),             // engine section
    bake(new THREE.CylinderGeometry(0.3, 0.42, 0.42, 40, 1), [0, 6.71, 0]),           // stage adapter
    bake(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 32, 1), [0, 7.37, 0]),            // upper stage
    bake(new THREE.CylinderGeometry(0.265, 0.28, 0.42, 32, 1), [0, 8.03, 0]),         // service-module fairing
    bake(lathe([[0.265, 0], [0.2, 0.18], [0.1, 0.42], [0.05, 0.5]], 32), [0, 8.24, 0]), // capsule under the abort fairing
    bake(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 12, 1), [0, 9.1, 0]),          // abort tower
    bake(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12, 1), [0, 9.0, 0]),
    bake(lathe(ogive(0.035, 0.2, 6), 12), [0, 9.47, 0]),
  ];
  for (const sx of [-1, 1]) {
    parts.push(bake(new THREE.CylinderGeometry(0.185, 0.185, 5.0, 28, 5), [sx * 0.64, 2.75, 0]));
    parts.push(bake(lathe(ogive(0.185, 0.5, 10, 0.7), 28), [sx * 0.64, 5.25, 0]));
    parts.push(bake(new THREE.CylinderGeometry(0.185, 0.25, 0.25, 28, 1), [sx * 0.64, 0.12, 0]));
  }
  const geo = merge(parts);
  paint(geo, (c, x, y, z) => {
    const booster = Math.abs(x) > 0.44;
    if (booster) {
      const joint = [1.25, 2.25, 3.25, 4.25].some((j) => Math.abs(y - j) < 0.035);
      c.copy(joint || y > 5.55 ? K : W);
    } else if (y < 6.5) c.copy(O).multiplyScalar(y > 6.1 ? 0.8 : 1);
    else if (y < 7.82) c.copy(W).multiplyScalar(0.9);
    else if (y < 8.24) c.copy(S);
    else c.copy(W);
    c.multiplyScalar(0.93 + 0.07 * hash3(Math.floor(x * 20), Math.floor(y * 10), Math.floor(z * 20)));
  });
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1 }));
  g.add(m);
  const bellMat = new THREE.MeshStandardMaterial({ color: '#3a3937', metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
  const exits = [];
  for (const [x, z] of [[0.16, 0.16], [-0.16, 0.16], [0.16, -0.16], [-0.16, -0.16]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.26, 18, 1, true), bellMat); b.position.set(x, -0.28, z); g.add(b); exits.push(V3(x, -0.41, z)); }
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.28, 18, 1, true), bellMat); b.position.set(sx * 0.64, -0.14, 0); g.add(b); exits.push(V3(sx * 0.64, -0.28, 0)); }
  return { group: g, exits };
}

// ------------------------------------------------------------------ THE VISION (generic; metres): crewed Mars ship, lander, astronaut, outpost
function windowTexture() {
  const W = 512, H = 64, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 16; i++) { const x = i * W / 16 + 8; const l = 150 + (i * 37) % 100; g.fillStyle = `rgb(255,${l},${Math.floor(l * 0.6)})`; g.fillRect(x, 14, W / 16 - 16, 36); }
  return toTexture(c);
}
// panel-line texture for hulls (seams + faint weld rows), tiled
function hullSeams(seed = 17) {
  const r = rng(seed), S = 256, c = mkCanvas(S), g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(90,90,96,0.55)'; g.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * S / 4); g.lineTo(S, i * S / 4); g.stroke(); }
  for (let i = 0; i < 8; i++) { const x = i * S / 8 + (r() - 0.5) * 6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
  for (let i = 0; i < 60; i++) { const l = 225 + Math.floor(r() * 30); g.fillStyle = `rgba(${l},${l},${l + 2},0.5)`; g.fillRect(Math.floor(r() * 8) * S / 8, Math.floor(r() * 4) * S / 4, S / 8, S / 4); }
  return toTexture(c, { repeat: true });
}
export function visionMaterials(env = null) {
  const seams = hullSeams(); seams.repeat.set(6, 3);
  return {
    white: new THREE.MeshStandardMaterial({ color: '#dcd8cf', map: seams, roughness: 0.42, metalness: 0.28, envMap: env, envMapIntensity: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ color: '#26272b', roughness: 0.5, metalness: 0.55, envMap: env, envMapIntensity: 0.6 }),
    bell: new THREE.MeshStandardMaterial({ color: '#3b3936', metalness: 0.92, roughness: 0.3, side: THREE.DoubleSide, envMap: env, envMapIntensity: 0.6 }),
    foil: new THREE.MeshStandardMaterial({ color: '#c3913f', metalness: 0.95, roughness: 0.34, bumpMap: crinkleTexture(21, 256), bumpScale: 0.7, envMap: env, envMapIntensity: 0.8 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#d6cebf', roughness: 0.85, metalness: 0, envMap: env, envMapIntensity: 0.5 }),
    pv: new THREE.MeshStandardMaterial({ map: solarTexture(12, 4, 21), metalness: 0.5, roughness: 0.35, envMap: env, envMapIntensity: 0.7 }),
    win: new THREE.MeshBasicMaterial({ map: windowTexture(), color: new THREE.Color('#ffd49a').multiplyScalar(2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
}
const addTo = (parent, geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = null) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(p[0], p[1], p[2]); m.rotation.set(r[0], r[1], r[2]); if (s) m.scale.set(s[0], s[1], s[2]);
  m.castShadow = m.receiveShadow = true; parent.add(m); return m;
};
// rod between two points, baked into a geometry (for merged trusses)
function rodGeo(a, b, r, seg = 6) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg, 1);
  _q.setFromUnitVectors(_v.set(0, 1, 0), _s.copy(b).sub(a).normalize());
  _m.compose(_v.copy(a).lerp(b, 0.5), _q, _s.set(1, 1, 1));
  return g.applyMatrix4(_m);
}
// crew lander: octagonal descent stage, crew cylinder, ogive nose; landing legs in their own group (stowed in flight)
export function buildLander(M) {
  const g = new THREE.Group();
  addTo(g, new THREE.CylinderGeometry(3.0, 3.5, 2.6, 8), M.white, [0, 2.3, 0], [0, Math.PI / 8, 0]);
  addTo(g, new THREE.CylinderGeometry(3.52, 3.52, 0.25, 8), M.dark, [0, 1.05, 0], [0, Math.PI / 8, 0]);
  addTo(g, new THREE.CylinderGeometry(2.4, 2.8, 7.4, 40), M.white, [0, 7.3, 0]);
  addTo(g, lathe(ogive(2.4, 4.6, 18, 0.6), 40), M.white, [0, 11.0, 0]);
  addTo(g, new THREE.CylinderGeometry(2.62, 2.62, 0.22, 40), M.dark, [0, 5.0, 0]);
  addTo(g, new THREE.CylinderGeometry(2.46, 2.46, 0.16, 40), M.dark, [0, 10.95, 0]);
  const win = new THREE.Mesh(new THREE.CylinderGeometry(2.47, 2.47, 0.5, 40, 1, true), M.win); win.position.y = 9.6; g.add(win);
  const exits = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + 0.3, x = Math.cos(a) * 1.3, z = Math.sin(a) * 1.3;
    addTo(g, new THREE.CylinderGeometry(0.32, 0.72, 0.8, 20, 1, true), M.bell, [x, 0.6, z]);
    exits.push(V3(x, 0.2, z));
  }
  const legs = new THREE.Group(); g.add(legs);
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    legs.add(strut(V3(c * 2.9, 2.6, s * 2.9), V3(c * 5.4, 0.12, s * 5.4), 0.13, M.dark), strut(V3(c * 3.2, 1.2, s * 3.2), V3(c * 5.2, 0.2, s * 5.2), 0.09, M.dark));
    addTo(legs, new THREE.CylinderGeometry(0.75, 0.85, 0.16, 18), M.dark, [c * 5.4, 0.08, s * 5.4]);
  }
  legs.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, legs, win, exits };
}
// interplanetary transfer ship (local +Y = forward): the lander rides on the nose of a truss spine with
// propellant tanks, two long solar wings, radiators and a three-engine cluster; exits at the bell mouths
export function buildMarsShip(M) {
  const g = new THREE.Group();
  const L = buildLander(M); L.legs.visible = false; g.add(L.group);
  addTo(g, new THREE.CylinderGeometry(3.3, 1.9, 3.0, 32, 1), M.dark, [0, -0.5, 0]);
  // square truss: four longerons, rings and alternating diagonals
  const B = 1.35, Y0 = -1.8, Y1 = -31.5, bays = 10, corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  const tp = [];
  for (const [x, z] of corners) tp.push(rodGeo(V3(x * B, Y0, z * B), V3(x * B, Y1, z * B), 0.1));
  for (let i = 0; i <= bays; i++) {
    const y = Y0 + (Y1 - Y0) * i / bays, y2 = Y0 + (Y1 - Y0) * (i + 1) / bays;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      tp.push(rodGeo(V3(ax * B, y, az * B), V3(bx * B, y, bz * B), 0.06));
      if (i < bays) tp.push(rodGeo(V3(ax * B, (i + k) % 2 ? y : y2, az * B), V3(bx * B, (i + k) % 2 ? y2 : y, bz * B), 0.045));
    }
  }
  const truss = new THREE.Mesh(merge(tp), M.dark); truss.castShadow = truss.receiveShadow = true; g.add(truss);
  // propellant: four large insulated tanks, four smaller foil-wrapped ones
  for (let k = 0; k < 4; k++) {
    const a = k / 4 * TAU + Math.PI / 4, x = Math.cos(a) * 3.55, z = Math.sin(a) * 3.55;
    addTo(g, new THREE.CapsuleGeometry(1.95, 6.5, 8, 28), M.white, [x, -9.5, z]);
    addTo(g, new THREE.CylinderGeometry(1.99, 1.99, 0.35, 28, 1), M.dark, [x, -9.5, z]);
    const x2 = Math.cos(a) * 2.9, z2 = Math.sin(a) * 2.9;
    addTo(g, new THREE.CapsuleGeometry(1.35, 3.4, 8, 24), M.foil, [x2, -20.5, z2]);
  }
  // solar wings on booms (±X) and radiator panels (±Z)
  const wings = [];
  for (const sx of [-1, 1]) {
    g.add(strut(V3(sx * B, -15, 0), V3(sx * 5.2, -15, 0), 0.12, M.dark));
    const w = new THREE.Group(); w.position.set(sx * 5.2, -15, 0); g.add(w);
    for (let j = 0; j < 3; j++) addTo(w, new THREE.BoxGeometry(7.4, 6.2, 0.08), M.pv, [sx * (4.0 + j * 7.6), 0, 0]);
    w.add(strut(V3(0, 0, 0), V3(sx * 23, 0, 0), 0.06, M.dark));
    wings.push(w);
  }
  for (const sz of [-1, 1]) addTo(g, new THREE.BoxGeometry(0.1, 9.5, 6), M.fabric, [0, -26.5, sz * (B + 3.2)]);
  // thrust structure + engines
  addTo(g, new THREE.CylinderGeometry(1.9, 2.4, 2.2, 28, 1), M.dark, [0, -32.4, 0]);
  const exits = [];
  for (let k = 0; k < 3; k++) {
    const a = k / 3 * TAU + Math.PI / 2, x = Math.cos(a) * 1.15, z = Math.sin(a) * 1.15;
    addTo(g, new THREE.CylinderGeometry(0.42, 1.12, 2.8, 24, 1, true), M.bell, [x, -34.9, z]);
    exits.push(V3(x, -36.3, z));
  }
  return { group: g, lander: L, wings, exits };
}
// a suited astronaut (1.9 m); legs posed in a stride, arms solved each frame to grip a point (2-bone IK)
export function buildAstronaut() {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: '#d6d1c7', roughness: 0.84, metalness: 0 });
  const soft = new THREE.MeshStandardMaterial({ color: '#a7a298', roughness: 0.88, metalness: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2c30', roughness: 0.5, metalness: 0.5 });
  const visor = new THREE.MeshStandardMaterial({ color: '#e0ac52', metalness: 1, roughness: 0.1 });
  const red = new THREE.MeshStandardMaterial({ color: '#8e2a2a', roughness: 0.7 });
  addTo(g, new THREE.CapsuleGeometry(0.22, 0.3, 6, 18), suit, [0, 1.33, 0], [0, 0, 0], [1.22, 1, 0.9]);
  addTo(g, new THREE.SphereGeometry(0.2, 18, 12), suit, [0, 1.0, 0], [0, 0, 0], [1.15, 0.82, 0.95]);
  addTo(g, new THREE.TorusGeometry(0.215, 0.028, 8, 28), soft, [0, 1.1, 0], [Math.PI / 2, 0, 0], [1.15, 0.95, 1]);
  addTo(g, new RoundedBoxGeometry(0.54, 0.68, 0.27, 2, 0.06), suit, [0, 1.41, -0.31]);
  addTo(g, new THREE.BoxGeometry(0.34, 0.1, 0.05), soft, [0, 1.19, -0.45]);
  addTo(g, new RoundedBoxGeometry(0.24, 0.13, 0.11, 2, 0.02), soft, [0, 1.27, 0.23]);
  addTo(g, new THREE.CylinderGeometry(0.14, 0.16, 0.09, 18), soft, [0, 1.6, 0]);
  addTo(g, new THREE.SphereGeometry(0.178, 26, 18), suit, [0, 1.77, 0.0]);
  addTo(g, new THREE.SphereGeometry(0.181, 26, 14, Math.PI / 2 - 0.95, 1.9, 0.72, 1.05), visor, [0, 1.77, 0.0]);
  addTo(g, new THREE.BoxGeometry(0.1, 0.035, 0.005), red, [0.22, 1.44, 0.17], [0, 0.55, 0]);
  const seg = (a, b, r, m) => { const s = strut(a, b, r, m, 14); s.castShadow = s.receiveShadow = true; g.add(s); return s; };
  const ball = (p, r, m) => addTo(g, new THREE.SphereGeometry(r, 14, 10), m, [p.x, p.y, p.z]);
  // legs (a stride: left forward, knees soft)
  for (const [hip, knee, ank] of [[V3(0.11, 0.98, 0.03), V3(0.13, 0.57, 0.17), V3(0.13, 0.15, 0.07)], [V3(-0.11, 0.98, -0.03), V3(-0.13, 0.56, -0.1), V3(-0.14, 0.16, -0.3)]]) {
    seg(hip, knee, 0.108, suit); seg(knee, ank, 0.094, suit); ball(knee, 0.108, soft); ball(hip, 0.108, suit);
    addTo(g, new RoundedBoxGeometry(0.17, 0.14, 0.34, 2, 0.035), soft, [ank.x, ank.y - 0.08, ank.z + 0.06]);
  }
  // arms: unit cylinders re-aimed every frame
  const unit = new THREE.CylinderGeometry(1, 1, 1, 14, 1);
  const arms = [1, -1].map((sx) => {
    const sh = V3(sx * 0.28, 1.47, 0.02);
    ball(sh, 0.115, suit);
    const up = addTo(g, unit, suit), fo = addTo(g, unit, suit);
    const el = addTo(g, new THREE.SphereGeometry(0.085, 12, 8), soft), hand = addTo(g, new THREE.SphereGeometry(0.072, 12, 8), soft);
    return { sh, up, fo, el, hand };
  });
  const Y = V3(0, 1, 0), d = V3(), e = V3(), h = V3(), tmp = V3();
  const aim = (m, a, b, r) => { m.position.copy(a).lerp(b, 0.5); tmp.subVectors(b, a); m.scale.set(r, tmp.length(), r); m.quaternion.setFromUnitVectors(Y, tmp.normalize()); };
  const L1 = 0.31, L2 = 0.3;
  // hand target (group-local) and an elbow hint direction
  function setArm(i, target, hint) {
    const A = arms[i];
    d.subVectors(target, A.sh); let dist = d.length(); d.normalize();
    dist = Math.min(dist, L1 + L2 - 0.005);
    h.copy(A.sh).addScaledVector(d, dist);
    const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist), k = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    e.copy(hint).addScaledVector(d, -hint.dot(d)).normalize();
    e.multiplyScalar(k).addScaledVector(d, a).add(A.sh);
    aim(A.up, A.sh, e, 0.086); aim(A.fo, e, h, 0.076);
    A.el.position.copy(e); A.hand.position.copy(h);
  }
  return { group: g, setArm };
}
// habitat: two inflatable domes joined by a tunnel, lit window bands, a row of solar arrays, a mast
export function buildHabitat(M) {
  const hab = new THREE.Group();
  for (const [x, z, r] of [[0, 0, 4.2], [8.5, 3.5, 3.2]]) {
    addTo(hab, new THREE.SphereGeometry(r, 40, 14, 0, TAU, 0, Math.PI / 2), M.fabric, [x, 0, z]);
    for (let k = 0; k < 8; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 1.004, 0.05, 6, 40, Math.PI), M.dark); rib.rotation.set(0, k / 8 * Math.PI, 0); rib.position.set(x, 0, z); rib.castShadow = true; hab.add(rib); }
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, 0.35, 40, 1, true), M.win); band.position.set(x, r * 0.28, z); hab.add(band);
  }
  addTo(hab, new THREE.CylinderGeometry(1.1, 1.1, 5.5, 20), M.fabric, [4.3, 1.1, 1.75], [0, -0.39, Math.PI / 2]);
  for (let i = 0; i < 5; i++) {
    const x = -6 + i * 3.2, z = -7;
    addTo(hab, new THREE.BoxGeometry(2.8, 0.05, 1.5), M.pv, [x, 1.3, z], [-0.5, 0, 0]);
    hab.add(strut(V3(x, 0, z), V3(x, 1.25, z), 0.05, M.dark));
  }
  hab.add(strut(V3(4, 0, -3), V3(4, 6.5, -3), 0.06, M.dark));
  hab.add(strut(V3(-6, 0, 4.5), V3(-6, 2.6, 4.5), 0.08, M.dark));
  addTo(hab, new THREE.SphereGeometry(1.3, 28, 8, 0, TAU, 0, 0.75), M.fabric, [-6, 3.5, 4.5], [0.9, 0.6, 0], [1, 0.45, 1]).material.side = THREE.DoubleSide;
  return { group: hab, beaconPos: V3(4, 6.6, -3) };
}
// a dome going up: the rib cage stands, the skin is drawn up over it (grow 0..1)
export function buildDomeFrame(r, M) {
  const g = new THREE.Group();
  for (let k = 0; k < 8; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 6, 40, Math.PI), M.dark); rib.rotation.set(0, k / 8 * Math.PI, 0); rib.castShadow = true; g.add(rib); }
  addTo(g, new THREE.TorusGeometry(r, 0.12, 8, 48), M.dark, [0, 0.05, 0], [Math.PI / 2, 0, 0]);
  const skinMat = M.fabric.clone(); skinMat.side = THREE.DoubleSide;
  // the skin is a band from the base up to the rising edge: twelve prebuilt latitude windows, swapped (no per-frame allocation)
  const bands = [];
  for (let i = 1; i <= 12; i++) { const th = (Math.PI / 2) * i / 12; bands.push(new THREE.SphereGeometry(r * 0.985, 40, Math.max(2, i + 1), 0, TAU, Math.PI / 2 - th, th)); }
  const skin = addTo(g, bands[0], skinMat);
  const seam = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd49a').multiplyScalar(2.2), toneMapped: false }));
  seam.rotation.x = Math.PI / 2; g.add(seam);
  function grow(k) {
    const i = Math.max(0, Math.min(bands.length - 1, Math.round(k * (bands.length - 1))));
    skin.geometry = bands[i];
    const th = (Math.PI / 2) * (i + 1) / 12, y = r * Math.sin(th);
    seam.position.y = y; seam.scale.setScalar(Math.max(0.02, Math.cos(th)));
  }
  grow(0);
  return { group: g, grow };
}
// greenhouse: a glass dome glowing green from inside (additive fresnel shell), planting rows, light spill on the ground
export function buildGreenhouse(r = 5.5, M) {
  const g = new THREE.Group();
  const u = { uK: { value: 1 }, uCol: { value: new THREE.Color('#9fe27c') } };
  const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 16, 0, TAU, 0, Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uK; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float low = 1.0 - smoothstep(0.0, ${r.toFixed(2)}, vY);
        vec3 c = uCol * (0.07 + 0.2 * low) + vec3(0.85, 1.0, 0.8) * pow(f, 5.0) * 0.28;
        gl_FragColor = vec4(c * uK, 1.0); }`,
  }));
  shell.renderOrder = 3; g.add(shell);
  for (let k = 0; k < 10; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 1.003, 0.045, 6, 48, Math.PI), M.dark); rib.rotation.set(0, k / 10 * Math.PI, 0); rib.castShadow = true; g.add(rib); }
  for (const y of [0.35, 0.62]) { const h = r * Math.sin(Math.acos(y)); const ring = new THREE.Mesh(new THREE.TorusGeometry(h, 0.04, 6, 64), M.dark); ring.rotation.x = Math.PI / 2; ring.position.y = r * y; g.add(ring); }
  addTo(g, new THREE.TorusGeometry(r, 0.14, 8, 64), M.dark, [0, 0.05, 0], [Math.PI / 2, 0, 0]);
  // planting beds: dark trays topped with luminous green foliage
  const bed = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 });
  // foliage: clumps of leafy mounds under grow lights (instanced, per-plant tint)
  const R = rng(404), plants = [], cA = new THREE.Color('#5fbf4a'), cB = new THREE.Color('#b4e68a'), c = new THREE.Color();
  for (let i = -2; i <= 2; i++) {
    const len = 2 * Math.sqrt(Math.max(0, (r - 0.9) ** 2 - (i * 1.6) ** 2));
    addTo(g, new THREE.BoxGeometry(len, 0.5, 0.8), bed, [0, 0.25, i * 1.6]);
    const n = Math.floor(len / 0.42);
    for (let j = 0; j < n; j++) plants.push([-len / 2 + (j + 0.5) * len / n + (R() - 0.5) * 0.12, 0.55 + R() * 0.08, i * 1.6 + (R() - 0.5) * 0.25, 0.24 + R() * 0.14, R()]);
  }
  const leafGeo = new THREE.IcosahedronGeometry(1, 1);
  const leaf = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const bush = new THREE.InstancedMesh(leafGeo, leaf, plants.length);
  plants.forEach(([x, y, z, s, k], i) => {
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, k * 6, 0)), _s.set(s, s * 0.85, s));
    bush.setMatrixAt(i, _m); bush.setColorAt(i, c.copy(cA).lerp(cB, k).multiplyScalar(0.75 + 0.45 * R()));
  });
  bush.instanceMatrix.needsUpdate = true; bush.instanceColor.needsUpdate = true;
  g.add(bush);
  const lamp = glowTexSprite('#b8eea0', 0.22, r * 1.9); lamp.position.y = r * 0.35; g.add(lamp);
  // light spill on the regolith around the dome
  const spillM = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uK; uniform vec3 uCol; varying vec2 vP; void main(){ float d = length(vP) / ${r.toFixed(2)}; float a = smoothstep(2.4, 1.0, d) * step(0.98, d); gl_FragColor = vec4(uCol * a * a * 0.22 * uK, 1.0); }`,
  });
  const spill = new THREE.Mesh(new THREE.CircleGeometry(r * 2.5, 48), spillM); spill.rotation.x = -Math.PI / 2; spill.position.y = 0.06; spill.renderOrder = 2; g.add(spill);
  return { group: g, u, lamp };
}
function glowTexSprite(color, intensity, scale) {
  const c = mkCanvas(64), x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTexture(c), color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false }));
  s.scale.setScalar(scale);
  return s;
}
// pressurised crew rover (front +Z)
export function buildCrewRover(M) {
  const g = new THREE.Group();
  addTo(g, new THREE.CapsuleGeometry(1.05, 3.0, 6, 24), M.white, [0, 1.55, 0], [Math.PI / 2, 0, 0], [1, 1, 0.82]);
  addTo(g, new THREE.BoxGeometry(2.3, 0.3, 4.4), M.dark, [0, 0.72, 0]);
  const glass = new THREE.MeshStandardMaterial({ color: '#0d1014', metalness: 0.9, roughness: 0.08 });
  addTo(g, new THREE.SphereGeometry(1.0, 24, 12, Math.PI / 2 - 0.9, 1.8, 0.55, 0.9), glass, [0, 1.58, 1.52], [0, 0, 0], [1.02, 0.86, 0.6]);
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.22), M.win); w.position.set(sx * 1.06, 1.7, 0); w.rotation.y = sx * Math.PI / 2; g.add(w); }
  for (const sx of [-1, 1]) for (const z of [-1.55, 0, 1.55]) addTo(g, new THREE.CylinderGeometry(0.52, 0.52, 0.42, 22), M.dark, [sx * 1.3, 0.52, z], [0, 0, Math.PI / 2]);
  g.add(strut(V3(-0.5, 2.3, -1.3), V3(-0.5, 3.0, -1.3), 0.03, M.dark));
  addTo(g, new THREE.SphereGeometry(0.28, 16, 6, 0, TAU, 0, 0.8), M.fabric, [-0.5, 3.0, -1.3], [0.5, 0, 0]);
  const lights = [-0.55, 0.55].map((x) => { const s = glowTexSprite('#fff1d6', 1.4, 0.9); s.position.set(x, 1.1, 2.15); g.add(s); return s; });
  return { group: g, lights };
}
// rover tracks: tread ribbons draped over the terrain (fn(x, z) → height) along XZ polylines
function treadTexture() {
  const W = 64, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y += 16) {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath(); g.moveTo(6, y); g.lineTo(W / 2, y + 6); g.lineTo(W - 6, y); g.lineTo(W - 6, y + 7); g.lineTo(W / 2, y + 13); g.lineTo(6, y + 7); g.closePath(); g.fill();
  }
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.12, 'rgba(255,255,255,0.45)'); grd.addColorStop(0.88, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = grd; g.fillRect(0, 0, W, H);
  return toTexture(c, { repeat: true, anisotropy: 8 });
}
export function buildTracks(paths, fn, { width = 0.45, gauge = 2.6 } = {}) {
  const pos = [], uv = [], idx = [];
  const P = V3(), T = V3(), N = V3();
  for (const pts of paths) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => V3(x, 0, z)), false, 'centripetal');
    const n = Math.max(8, Math.floor(curve.getLength() / 0.6));
    const len = curve.getLength();
    for (const off of [-gauge / 2, gauge / 2]) {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        curve.getPointAt(i / n, P); curve.getTangentAt(i / n, T); N.set(-T.z, 0, T.x).normalize();
        for (const s of [-1, 1]) {
          const x = P.x + N.x * (off + s * width / 2), z = P.z + N.z * (off + s * width / 2);
          pos.push(x, fn(x, z) + 0.03, z); uv.push(s < 0 ? 0 : 1, (i / n) * len / 0.9);
        }
        if (i < n) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const tex = treadTexture();
  const m = new THREE.MeshStandardMaterial({ color: '#4a2616', alphaMap: tex, bumpMap: tex, bumpScale: -3, transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.renderOrder = 1;
  return mesh;
}
// retro-burn ground blast: a radial sheet of dust torn off the plain, billowing and slowing (pure function of uT)
export function makeBlast(n = 3000, { t0 = 0, t1 = 3, seed = 31 } = {}) {
  const R = rng(seed), aA = new Float32Array(n * 4), aB = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    aA.set([R() * TAU, 6 + Math.pow(R(), 0.7) * 26, Math.pow(R(), 1.6) * 5, R()], i * 4);
    aB.set([t0 + (t1 - t0) * (i + R()) / n, R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(aA, 4)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
  const u = { uT: { value: 0 }, uViewport: { value: 800 }, uSun: { value: V3(0, 1, 0) }, uHot: { value: 1 }, uK: { value: 1 }, uColor: { value: new THREE.Color('#b87a52') }, uSunCol: { value: new THREE.Color('#ffd2a8') } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `attribute vec4 aA; attribute vec4 aB; uniform float uT, uViewport, uHot, uK; uniform vec3 uSun, uColor, uSunCol;
      varying vec3 vCol; varying float vA;
      void main(){
        float age = uT - aB.x;
        if (age <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); return; }
        float r = 1.2 + aA.y * (1.0 - exp(-1.8 * age)) / 1.8;
        float y = 0.1 + aA.z * (1.0 - exp(-1.1 * age)) * (0.25 + 0.06 * r) + 0.3 * aB.w * age;
        float a = aA.x + 0.08 * sin(age * 3.0 + aB.w * 6.28);
        vec4 w = modelMatrix * vec4(cos(a) * r, y, sin(a) * r, 1.0);
        vec4 mv = viewMatrix * w;
        gl_Position = projectionMatrix * mv;
        float sz = (0.5 + aA.w * 1.1) * (0.5 + age * 1.6) * (0.6 + 0.04 * r);
        gl_PointSize = min(sz * uViewport * 0.5 * projectionMatrix[1][1] / max(0.1, -mv.z), 240.0);
        vec3 V = normalize(w.xyz - cameraPosition);
        float fwd = pow(max(dot(V, normalize(uSun)), 0.0), 5.0);
        float top = smoothstep(0.0, 3.0, y);
        vCol = uColor * (0.28 + 0.3 * aB.y + 0.35 * top) + uSunCol * fwd * (0.25 + 0.6 * top) * 0.9
             + vec3(1.0, 0.5, 0.22) * uHot * exp(-r * 0.3) * 2.2;
        vA = smoothstep(0.0, 0.08, age) * exp(-age / 2.6) * (0.16 + 0.26 * aB.z) * uK;
      }`,
    fragmentShader: /* glsl */ `varying vec3 vCol; varying float vA;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vCol, a); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.u = u;
  return p;
}

// ------------------------------------------------------------------ analytic backdrop: sky gradients, planets with pixel-exact limbs
// One camera-centred sphere; each fragment ray-casts a planet (Earth / Moon) or paints a sky.
// uMode: 0 ascent sky over a cloud deck · 1 low Earth orbit · 2 deep space · 3 Mars day · 4 Moon at night · 5 Mars dawn
const backdropFrag = /* glsl */ `
${GLSL_NOISE}
uniform int uMode; uniform vec3 uSun, uPC, uEarthDir, uMoonDir; uniform float uPR, uGain, uTime, uEarthK, uHaze, uMoonR, uMoonK, uAur, uSunK;
uniform mat3 uPRot;
varying vec3 vDir;
float fbm(vec3 p, int o){ float a = 0.5, s = 0.0; for (int i = 0; i < 8; i++){ if (i >= o) break; s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
vec3 hash33(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
vec2 craters(vec3 p){
  vec3 i = floor(p), f = fract(p); float h = 0.0, a = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z)); vec3 o = hash33(i + g);
    vec3 r = g + 0.15 + o * 0.7 - f; float rad = 0.12 + 0.32 * o.x * o.x; float q = length(r) / rad;
    if (q < 1.8) { float bowl = q < 1.0 ? (q * q - 1.0) : 0.0; float rim = exp(-pow((q - 1.0) / 0.22, 2.0));
      h += (bowl * 0.7 + rim * 0.3) * rad; a += (rim * 0.5 + max(0.0, 1.0 - q) * 0.15) * step(0.8, o.y); }
  }
  return vec2(h, a);
}
void main(){
  vec3 d = normalize(vDir);
  float sd = max(dot(d, normalize(uSun)), 0.0);
  vec3 col = vec3(0.0);
  if (uMode == 0) {
    float e = d.y;
    vec3 zen = vec3(0.0012, 0.003, 0.010), mid = vec3(0.010, 0.034, 0.10), hor = vec3(0.10, 0.23, 0.46);
    col = mix(hor, mid, smoothstep(-0.07, 0.14, e));
    col = mix(col, zen, smoothstep(0.12, 0.7, e));
    col += vec3(0.55, 0.7, 0.95) * exp(-abs(e + 0.062) * 70.0) * 0.5;
    if (e < -0.06) {
      float tt = 1.0 / max(-e - 0.03, 0.004);
      vec2 uv = d.xz * tt * 0.5;
      float cl = fbm(vec3(uv * 0.9, 1.7), 6) + 0.35 * fbm(vec3(uv * 4.0, 3.1), 4);
      vec3 deck = mix(vec3(0.05, 0.08, 0.14), vec3(0.62, 0.68, 0.76), smoothstep(-0.15, 0.55, cl));
      deck *= 0.55 + 0.45 * smoothstep(-0.3, 0.6, cl);
      deck = mix(deck, hor * 1.25, exp((e + 0.06) * 18.0));
      col = mix(col, deck, smoothstep(-0.058, -0.068, e));
    }
    col += vec3(1.0, 0.9, 0.75) * (pow(sd, 900.0) * 40.0 + pow(sd, 40.0) * 0.5 + pow(sd, 6.0) * 0.08);
  } else if (uMode == 1 || uMode == 4) {
    float b = dot(d, uPC);
    vec3 pc = d * b - uPC;
    float h = length(pc), R = uPR;
    float fw = max(fwidth(h), 1e-6);
    float cov = b > 0.0 ? smoothstep(R + fw, R - fw, h) : 0.0;
    vec3 L = normalize(uSun);
    vec3 nc = pc / max(h, 1e-6);
    if (uMode == 1) {
      // limb: Rayleigh glow on the day side, thin and bright right at the edge
      float x = (h - R) / (R * 0.018);
      float day = smoothstep(-0.25, 0.35, dot(nc, L));
      float glow = b > 0.0 ? exp(-max(x, 0.0) * 1.2) * smoothstep(-1.5, 0.0, x) : 0.0;
      col += vec3(0.22, 0.5, 1.0) * glow * day * 1.1 + vec3(0.6, 0.8, 1.0) * exp(-abs(x) * 6.0) * day * 0.6 * step(0.0, b);
    }
    if (uMode == 1 && uMoonK > 0.0) {
      // a small Moon (drawn first: the Earth occludes it)
      vec3 mc = normalize(uMoonDir); float mb = dot(d, mc); vec3 mp = d * mb - mc; float mh = length(mp);
      float mfw = max(fwidth(mh), 1e-6), mcov = mb > 0.0 ? smoothstep(uMoonR + mfw, uMoonR - mfw, mh) : 0.0;
      if (mcov > 0.0) {
        vec3 mn = normalize(d * (mb - sqrt(max(uMoonR * uMoonR - mh * mh, 0.0))) - mc);
        float mar = smoothstep(0.0, 0.4, snoise(mn * 1.6 + 2.0) * 0.7 + snoise(mn * 3.4) * 0.3);
        float alb = mix(0.7, 0.34, mar) * (0.85 + 0.3 * (snoise(mn * 9.0) * 0.5 + 0.5));
        float ml = max(dot(mn, L), 0.0);
        col = mix(col, vec3(0.97, 0.95, 0.91) * alb * pow(ml, 0.6) * smoothstep(0.0, 0.08, ml) * 1.5 * uMoonK, mcov);
      }
    }
    if (cov > 0.0) {
      float tH = b - sqrt(max(R * R - h * h, 0.0));
      vec3 n = normalize(d * tH - uPC);
      vec3 p = uPRot * n;
      float ndl = dot(n, L);
      float mu = max(dot(n, -d), 0.0);
      vec3 s;
      if (uMode == 1) {
        float c = fbm(p * 2.2 + vec3(3.1, 0.0, 1.7), 7) + 0.1 * snoise(p * 14.0);
        float land = smoothstep(0.02, 0.05, c);
        float arid = smoothstep(0.0, 0.5, snoise(p * 3.0 + 5.0));
        vec3 ocean = mix(vec3(0.004, 0.022, 0.06), vec3(0.01, 0.06, 0.1), smoothstep(-0.08, 0.02, c));
        vec3 ground = mix(vec3(0.05, 0.07, 0.035), vec3(0.21, 0.16, 0.09), arid) * (0.8 + 0.4 * snoise(p * 40.0));
        vec3 surf = mix(ocean, ground, land);
        vec3 cp = p * vec3(5.0, 9.0, 5.0) + vec3(uTime * 0.01, 0.0, 0.0);
        float cl = smoothstep(0.08, 0.7, fbm(cp, 7) * 0.8 + 0.35 * snoise(p * 30.0) * snoise(p * 6.0 + 7.0));
        float day = smoothstep(-0.06, 0.25, ndl);
        s = surf * day * 1.9;
        s = mix(s, vec3(0.86, 0.9, 0.95) * day * 1.15, cl * 0.9);
        vec3 H = normalize(L - d);
        s += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, H), 0.0), 160.0) * (1.0 - land) * (1.0 - cl) * day * 0.9;
        float rim = pow(1.0 - mu, 2.5);
        s = mix(s, vec3(0.3, 0.55, 1.0) * day * 0.95, rim * 0.85);
      } else {
        // albedo carries the full Moon (maria, bright ray craters); relief comes from a sun-ward
        // finite difference of the crater height (no screen derivatives → no 2×2 blockiness)
        vec2 c1 = craters(p * 3.0), c2 = craters(p * 7.0 + 3.1);
        float hA = c1.x * 0.6 + c2.x * 0.3;
        vec3 Lt = normalize(L - n * dot(L, n) + 1e-5);
        vec3 p2 = p + (uPRot * Lt) * 0.012;
        float hB = craters(p2 * 3.0).x * 0.6 + craters(p2 * 7.0 + 3.1).x * 0.3;
        float slope = (hB - hA) / 0.012;
        float maria = smoothstep(0.0, 0.35, snoise(p * 1.4 + 2.0) * 0.7 + snoise(p * 3.3) * 0.3);
        float alb = mix(0.66, 0.3, maria) * (0.88 + 0.24 * (snoise(p * 11.0) * 0.5 + 0.5)) + (c1.y + c2.y * 0.6) * 0.14;
        float term = smoothstep(-0.03, 0.12, ndl);
        float relief = clamp(1.0 + slope * 0.11 * (1.0 - 0.7 * smoothstep(0.2, 0.9, ndl)), 0.25, 1.8);
        s = vec3(0.97, 0.96, 0.93) * alb * pow(max(ndl, 0.0), 0.55) * term * relief * 1.45;
        s += vec3(0.9, 0.93, 1.0) * pow(1.0 - mu, 6.0) * 0.08;
      }
      col = mix(col, s, cov);
    }
    if (uMode == 4) col += vec3(0.5, 0.6, 0.8) * pow(max(dot(d, normalize(uPC)), 0.0), 60.0) * 0.06;
  } else if (uMode == 2) {
    col = vec3(0.0015, 0.0018, 0.0028) * (1.0 + 0.6 * fbm(d * 3.0, 3));
  } else if (uMode == 3) {
    float e = d.y;
    vec3 hor = vec3(0.62, 0.40, 0.24), zen = vec3(0.19, 0.11, 0.07);
    col = mix(hor, zen, pow(smoothstep(-0.02, 0.9, e), 0.6));
    col += vec3(0.75, 0.55, 0.36) * exp(-max(e, 0.0) * 14.0) * 0.35;
    col += vec3(1.0, 0.95, 0.85) * (pow(sd, 1500.0) * 30.0) + vec3(0.9, 0.75, 0.55) * pow(sd, 18.0) * 0.4 + vec3(0.6, 0.72, 0.9) * pow(sd, 400.0) * 0.8;
    col *= uHaze;
  } else if (uMode == 5) {
    float e = d.y;
    vec3 L = normalize(uSun);
    float az = dot(normalize(vec2(d.x, d.z)), normalize(vec2(L.x, L.z)));
    vec3 hor = mix(vec3(0.16, 0.085, 0.06), vec3(0.42, 0.24, 0.15), smoothstep(-0.2, 1.0, az));
    vec3 zen = vec3(0.012, 0.012, 0.022);
    col = mix(hor, zen, pow(smoothstep(-0.03, 0.75, e), 0.55));
    // Martian sunrise: a cold blue aureole hugging the sun (fine dust forward-scatters blue)
    col += vec3(0.30, 0.52, 0.95) * (pow(sd, 90.0) * 1.2 + pow(sd, 14.0) * 0.35) * uAur;
    col += vec3(1.0, 0.97, 0.92) * pow(sd, 3500.0) * 60.0 * uSunK;
    col += vec3(0.8, 0.45, 0.25) * exp(-max(e, 0.0) * 30.0) * 0.18 * smoothstep(-0.5, 1.0, az);
    float ed = max(dot(d, normalize(uEarthDir)), 0.0);
    col += vec3(0.62, 0.8, 1.0) * (pow(ed, 60000.0) * 9.0 + pow(ed, 5000.0) * 0.35) * uEarthK;
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}`;
export function makeBackdrop() {
  const u = {
    uMode: { value: 0 }, uSun: { value: V3(0, 1, 0) }, uPC: { value: V3(0, -1, 0) }, uPR: { value: 0.9 }, uGain: { value: 1 }, uTime: { value: 0 },
    uPRot: { value: new THREE.Matrix3() }, uEarthDir: { value: V3(0, 1, 0) }, uEarthK: { value: 0 }, uHaze: { value: 1 },
    uMoonDir: { value: V3(0, 1, 0) }, uMoonR: { value: 0.03 }, uMoonK: { value: 0 }, uAur: { value: 1 }, uSunK: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({
    uniforms: u, depthWrite: false, depthTest: false, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; vec4 p = projectionMatrix * viewMatrix * w; p.z = p.w * 0.99999; gl_Position = p; }',
    fragmentShader: backdropFrag,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), m);
  mesh.renderOrder = -1000; mesh.frustumCulled = false;
  mesh.userData.u = u;
  return mesh;
}

// camera-following starfield (no size attenuation → crisp points)
export function makeStars(n = 4000, seed = 81) {
  const R = rng(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = R() * 2 - 1, a = R() * TAU, s = Math.sqrt(1 - u * u), r = 900;
    pos.set([s * Math.cos(a) * r, u * r, s * Math.sin(a) * r], i * 3);
    const b = Math.pow(R(), 3.2) * 1.6 + 0.05, w = R();
    col.set([b * (0.9 + w * 0.15), b * 0.97, b * (1.1 - w * 0.2)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -900;
  return p;
}

// ------------------------------------------------------------------ GPU smoke / exhaust trail (pure function of uT)
// Each particle is emitted at time te from one of two sources; the vehicle has travelled S(t) − S(te)
// since, so the column trails behind along −uAxis while each puff expands and cools.
const smokeVert = /* glsl */ `
attribute vec4 aA; attribute vec4 aB;
uniform float uT, uV0, uAcc, uTEnd, uSpread0, uSpreadK, uLife, uSize, uViewport, uDrop, uHotK;
uniform vec3 uAxis, uSrc0, uSrc1, uSun;
varying vec3 vCol; varying float vA;
float S(float t){ return uV0 * t + 0.5 * uAcc * t * t; }
void main(){
  float te = aA.x, age = uT - te;
  if (age <= 0.0 || te > uTEnd) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vCol = vec3(0.0); return; }
  vec3 src = mix(uSrc0, uSrc1, aB.z);
  vec3 ax = normalize(uAxis);
  vec3 side = normalize(cross(ax, abs(ax.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 up = cross(side, ax);
  vec3 rad = cos(aA.y) * side + sin(aA.y) * up;
  float spread = uSpread0 + uSpreadK * sqrt(age);
  vec3 p = src - ax * (S(uT) - S(te) + aB.x * 0.3 + age * uDrop) + rad * spread * aA.z;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = uSize * (0.55 + aA.w) * (0.35 + sqrt(age) * 1.6);
  gl_PointSize = min(sz * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z), 220.0);
  float lit = 0.5 + 0.5 * dot(rad, normalize(uSun));
  float hot = exp(-age * uHotK);
  vCol = mix(vec3(0.42, 0.44, 0.48), vec3(0.95, 0.94, 0.92), lit * (0.7 + 0.3 * aB.y)) + vec3(1.0, 0.62, 0.3) * hot * 5.0;
  vA = smoothstep(0.0, 0.04, age) * exp(-age / uLife) * (0.35 + 0.5 * aB.y);
}`;
const smokeFrag = /* glsl */ `
uniform float uOpacity, uGain; uniform vec3 uTint; varying vec3 vCol; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c); float a = smoothstep(0.5, 0.05, r); a *= a * vA * uOpacity; if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * uTint * uGain, a); }`;
export function makeSmoke(n, { t0 = -3, t1 = 1.2, seed = 5 } = {}) {
  const R = rng(seed), aA = new Float32Array(n * 4), aB = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    aA.set([t0 + (t1 - t0) * (i + R()) / n, R() * TAU, Math.sqrt(R()), R()], i * 4);
    aB.set([R() - 0.5, R(), R() < 0.5 ? 0 : 1, 0], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(aA, 4)); g.setAttribute('aB', new THREE.BufferAttribute(aB, 4));
  const u = {
    uT: { value: 0 }, uV0: { value: 10 }, uAcc: { value: 3 }, uTEnd: { value: 99 }, uSpread0: { value: 0.1 }, uSpreadK: { value: 1 }, uLife: { value: 3 },
    uSize: { value: 0.6 }, uViewport: { value: 800 }, uDrop: { value: 0 }, uHotK: { value: 20 }, uAxis: { value: V3(0, 1, 0) }, uSrc0: { value: V3() }, uSrc1: { value: V3() },
    uSun: { value: V3(1, 0, 0) }, uOpacity: { value: 1 }, uGain: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: smokeVert, fragmentShader: smokeFrag, transparent: true, depthWrite: false, fog: false });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.u = u;
  return p;
}

// Radial ground dust (rotor downwash): puffs leave the centre along the ground and settle.
export function makeDownwash(n = 1600, seed = 9) {
  const R = rng(seed), a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) a.set([R() * TAU, 0.3 + R() * 1.4, R(), R()], i * 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(a, 4));
  const u = { uT: { value: 0 }, uK: { value: 0 }, uViewport: { value: 800 }, uSun: { value: V3(0, 1, 0) } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `attribute vec4 aA; uniform float uT, uK, uViewport; varying float vA; varying float vL;
      void main(){
        float age = fract(uT * (0.8 + aA.w * 0.6) + aA.z);
        float r = 0.15 + aA.y * age * 1.4;
        vec3 p = vec3(cos(aA.x) * r, 0.02 + age * (0.08 + aA.w * 0.25), sin(aA.x) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.03 + age * 0.09) * uViewport * 0.5 * projectionMatrix[1][1] / max(0.05, -mv.z);
        vA = uK * sin(3.14159 * age) * 0.28; vL = 0.7 + 0.3 * aA.w;
      }`,
    fragmentShader: /* glsl */ `varying float vA; varying float vL; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); a *= a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vec3(0.75, 0.46, 0.3) * vL, a); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.u = u;
  return p;
}

// ------------------------------------------------------------------ Hubble-style deep field: procedural galaxies on instanced quads
// type: 0 elliptical · 1 spiral · 2 edge-on disk · 3 foreground star with four diffraction spikes
const galVert = /* glsl */ `
attribute vec3 aPos; attribute vec4 aP; attribute vec4 aQ; attribute vec3 aC;
uniform float uNear, uFar;
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying vec3 vC; varying float vF;
void main(){
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aP.x;
  gl_Position = projectionMatrix * mv;
  vUv = position.xy * 2.0; vP = aP; vQ = aQ; vC = aC;
  float z = -mv.z;
  vF = smoothstep(uNear, uNear * 3.0 + aP.x * 2.0, z) * (1.0 - smoothstep(uFar * 0.6, uFar, z));
}`;
const galFrag = /* glsl */ `
uniform float uOpacity, uGain;
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying vec3 vC; varying float vF;
void main(){
  float type = vP.w;
  float c = cos(vP.y), s = sin(vP.y);
  vec2 q = mat2(c, -s, s, c) * vUv;
  vec3 col;
  if (type > 2.5) {
    float r = length(q);
    float core = exp(-r * r * 900.0) * 3.0 + exp(-r * 30.0) * 0.5;
    float sp = exp(-abs(q.x) * 160.0) * exp(-abs(q.y) * 4.0) + exp(-abs(q.y) * 160.0) * exp(-abs(q.x) * 4.0);
    col = vC * (core + sp * 0.9) * smoothstep(1.0, 0.7, r);
  } else {
    q.y /= max(vP.z, 0.08);
    float r = length(q);
    if (r > 1.0) discard;
    float edge = smoothstep(1.0, 0.6, r);
    if (type < 0.5) {
      float I = exp(-pow(r * 7.0, 0.7) * 1.4) * 2.2;
      col = mix(vec3(1.0, 0.86, 0.62), vC, 0.4) * I;
    } else {
      float th = atan(q.y, q.x);
      float arms = pow(0.5 + 0.5 * cos(2.0 * (th - 3.2 * log(r + 0.04)) + vQ.x * 6.28), 3.0);
      float disk = exp(-r * 4.5);
      float bulge = exp(-r * r * 90.0) * 2.4;
      float lane = type > 1.5 ? 1.0 - 0.8 * exp(-pow(q.y * max(vP.z, 0.08) * 22.0, 2.0)) * smoothstep(0.02, 0.2, r) : 1.0;
      col = (vec3(1.0, 0.84, 0.6) * bulge + vC * disk * (0.25 + 1.3 * arms * (type > 1.5 ? 0.3 : 1.0))) * lane;
    }
    col *= edge;
  }
  gl_FragColor = vec4(col * vQ.y * vF * uOpacity * uGain, 1.0);
}`;
export function makeDeepField(n, { seed = 1995, box = [34, 34], z0 = -180, z1 = 36, clear = 1.6 } = {}) {
  const R = rng(seed);
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const aPos = new Float32Array(n * 3), aP = new Float32Array(n * 4), aQ = new Float32Array(n * 4), aC = new Float32Array(n * 3);
  const cool = new THREE.Color('#aecbff'), warm = new THREE.Color('#ffd7a0'), red = new THREE.Color('#ff9a70'), tmp = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const z = z0 + (z1 - z0) * Math.pow(R(), 0.8);
    const spreadK = 1 + Math.max(0, -z) * 0.02;
    let x = (R() - 0.5) * box[0] * spreadK, y = (R() - 0.5) * box[1] * spreadK;
    if (z > -8 && Math.hypot(x, y) < clear + 1.5) { const a = Math.atan2(y, x); x = Math.cos(a) * (clear + 1.5 + R() * 3); y = Math.sin(a) * (clear + 1.5 + R() * 3); }
    aPos.set([x, y, z], i * 3);
    const pick = R();
    const type = pick < 0.04 ? 3 : pick < 0.36 ? 0 : pick < 0.8 ? 1 : 2;
    const far = z < -60;
    const size = type === 3 ? 0.5 + R() * 1.0 : (far ? 0.6 + R() * 1.8 : 0.35 + Math.pow(R(), 2.5) * 1.8);
    const incl = type === 2 ? 0.1 + R() * 0.12 : type === 0 ? 0.55 + R() * 0.45 : 0.3 + R() * 0.7;
    aP.set([size, type === 3 ? Math.PI / 4 : R() * TAU, incl, type], i * 4);
    const bright = type === 3 ? 1.2 + R() * 1.5 : 0.5 + R() * 1.1 * (far ? 0.8 : 1);
    aQ.set([R(), bright, 0, 0], i * 4);
    if (type === 3) tmp.set('#fff4e6'); else if (type === 0) tmp.copy(warm).lerp(red, R() * 0.4); else tmp.copy(cool).lerp(warm, R() * 0.35);
    if (far && R() < 0.3) tmp.copy(red);
    aC.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  g.setAttribute('aQ', new THREE.InstancedBufferAttribute(aQ, 4));
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(aC, 3));
  g.instanceCount = n;
  const u = { uOpacity: { value: 1 }, uGain: { value: 1 }, uNear: { value: 0.6 }, uFar: { value: 400 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: galVert, fragmentShader: galFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.userData.u = u;
  return mesh;
}

// ------------------------------------------------------------------ the double helix (B-DNA proportions: pitch ≈ 1.7 × diameter, ten base pairs per turn)
export const HELIX = { R: 0.55, PITCH: 1.9, LEN: 7.6, BP_PER_TURN: 10, PHASE: 0.4 * Math.PI * 2 };   // strands 144° apart → major + minor groove
export function helixPoint(strand, z, out) {
  const th = (z / HELIX.PITCH) * TAU + (strand ? HELIX.PHASE : 0);
  return out.set(HELIX.R * Math.cos(th), HELIX.R * Math.sin(th), z);
}
// reveal: fragments beyond uReveal (along +z from the far end) are discarded; a bright seam leads
export function addReveal(mat, u, key) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 lp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n lp = instanceMatrix * lp;\n#endif\n vLp = (modelMatrix * lp).xyz; }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp; uniform float uReveal; uniform vec3 uSeam;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n if (-vLp.z > uReveal) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uSeam * exp(-pow((-vLp.z - uReveal) / 0.12, 2.0));');
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}
export function buildHelix(seed = 2003) {
  const R = rng(seed);
  const g = new THREE.Group();
  const u = { uReveal: { value: -99 }, uSeam: { value: new THREE.Color('#ffd48a').multiplyScalar(2.5) } };
  const curve = (strand) => {
    const c = new THREE.Curve();
    c.getPoint = (t, out = new THREE.Vector3()) => helixPoint(strand, (t - 0.5) * HELIX.LEN, out);
    return c;
  };
  const backM = addReveal(new THREE.MeshPhysicalMaterial({ color: '#d5dde8', metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12 }), u, 'frontier-helix-back');
  for (const s of [0, 1]) { const m = new THREE.Mesh(new THREE.TubeGeometry(curve(s), 420, 0.05, 10, false), backM); g.add(m); }
  // base pairs: two half-rungs per pair, coloured by base; phosphate beads at each nucleotide
  const STEP = HELIX.PITCH / HELIX.BP_PER_TURN, NBP = Math.floor(HELIX.LEN / STEP);
  const BASES = 'ACGT', COMP = { A: 'T', T: 'A', C: 'G', G: 'C' };
  const BCOL = { A: new THREE.Color('#e0b25a'), T: new THREE.Color('#8ea7c8'), C: new THREE.Color('#e9e4da'), G: new THREE.Color('#6f7f9c') };
  const rungGeo = new THREE.CylinderGeometry(0.034, 0.034, 1, 10, 1); rungGeo.translate(0, 0.5, 0);
  const rungM = addReveal(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.25 }), u, 'frontier-helix-rung');
  const rungs = new THREE.InstancedMesh(rungGeo, rungM, NBP * 2);
  const beadM = backM;
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.085, 16, 10), beadM, NBP * 2);
  const a = V3(), b = V3(), mid = V3(), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V3(), yAx = V3(0, 1, 0), d = V3();
  const pairs = [];
  for (let i = 0; i < NBP; i++) {
    const z = -HELIX.LEN / 2 + (i + 0.5) * STEP;
    helixPoint(0, z, a); helixPoint(1, z, b);
    mid.copy(a).lerp(b, 0.5);
    const b1 = BASES[Math.floor(R() * 4)], b2 = COMP[b1];
    for (const [p0, base, k] of [[a, b1, 0], [b, b2, 1]]) {
      d.copy(mid).sub(p0); const len = d.length() - 0.012; d.normalize();
      q.setFromUnitVectors(yAx, d); M.compose(p0, q, sc.set(1, len, 1));
      rungs.setMatrixAt(i * 2 + k, M); rungs.setColorAt(i * 2 + k, BCOL[base]);
      M.compose(p0, q.identity(), sc.set(1, 1, 1)); beads.setMatrixAt(i * 2 + k, M);
    }
    pairs.push({ z, bases: [b1, b2], a: a.clone(), b: b.clone() });
  }
  rungs.instanceMatrix.needsUpdate = true; rungs.instanceColor.needsUpdate = true;
  g.add(rungs, beads);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, u, pairs, STEP, NBP };
}

// Particle targets for the helix (backbones + rungs), with colours: backbone cool white, rungs gold/ivory
export function helixTargets(n, pairs, seed = 7) {
  const R = rng(seed), out = new Float32Array(n * 3), col = new Float32Array(n * 3), p = V3();
  const cool = new THREE.Color('#cfe0ff'), gold = new THREE.Color('#ffc978'), ivory = new THREE.Color('#fff1dc');
  for (let i = 0; i < n; i++) {
    const k = R();
    if (k < 0.62) {
      const z = (R() - 0.5) * HELIX.LEN;
      helixPoint(k < 0.31 ? 0 : 1, z, p);
      p.x += (R() - 0.5) * 0.06; p.y += (R() - 0.5) * 0.06;
      col.set([cool.r, cool.g, cool.b], i * 3);
    } else {
      const pr = pairs[Math.floor(R() * pairs.length)];
      p.copy(pr.a).lerp(pr.b, R());
      const c = R() < 0.5 ? gold : ivory;
      col.set([c.r, c.g, c.b], i * 3);
    }
    out.set([p.x, p.y, p.z], i * 3);
  }
  return { pos: out, col };
}
// a face-on two-armed spiral galaxy in the XY plane (radius ~3), matching the particle count / colour order above
export function spiralGalaxy(n, colors, seed = 11) {
  const R = rng(seed), out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const warm = colors[i * 3 + 2] < colors[i * 3] * 0.9;       // gold / ivory particles form the bulge + inner arms
    let x, y, z;
    if (warm && R() < 0.6) {
      const r = Math.abs(gauss(R)) * 0.45, a = R() * TAU;
      x = Math.cos(a) * r; y = Math.sin(a) * r * 0.9; z = gauss(R) * 0.08;
    } else {
      const arm = R() < 0.5 ? 0 : Math.PI, r = 0.3 + Math.pow(R(), 0.8) * 2.9;
      const a = arm + Math.log(r / 0.3) / 0.32 + gauss(R) * (0.18 + 0.1 / r);
      const rr = r * (1 + gauss(R) * 0.06);
      x = Math.cos(a) * rr; y = Math.sin(a) * rr; z = gauss(R) * 0.05;
    }
    out.set([x, y, z], i * 3);
  }
  return out;
}
function gauss(R) { return (R() + R() + R() + R() - 2) * 0.87; }

// Sequencer glyphs: two per base pair, billboarded; they scramble until the read head passes, then lock.
function glyphAtlas() {
  const G = 'ACGT01/+', S = 128, c = mkCanvas(S * 8, S), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `500 ${S * 0.78}px "${FONTS.mono}"`;
  for (let i = 0; i < 8; i++) g.fillText(G[i], S * (i + 0.5), S * 0.54);
  const t = toTexture(c); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
export function buildGlyphs(pairs) {
  const n = pairs.length * 2;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const aPos = new Float32Array(n * 3), aG = new Float32Array(n * 4);
  const idx = { A: 0, C: 1, G: 2, T: 3 }, p = V3();
  pairs.forEach((pr, i) => {
    [pr.a, pr.b].forEach((q, k) => {
      p.set(q.x, q.y, 0).normalize().multiplyScalar(HELIX.R + 0.24); p.z = q.z;
      aPos.set([p.x, p.y, p.z], (i * 2 + k) * 3);
      aG.set([idx[pr.bases[k]], i * 2 + k, pr.z, 0], (i * 2 + k) * 4);
    });
  });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  g.setAttribute('aG', new THREE.InstancedBufferAttribute(aG, 4));
  g.instanceCount = n;
  const u = { uMap: { value: glyphAtlas() }, uT: { value: 0 }, uRead: { value: -99 }, uSize: { value: 0.2 }, uOpacity: { value: 0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `attribute vec3 aPos; attribute vec4 aG; uniform float uT, uRead, uSize; varying vec2 vUv; varying float vGl; varying float vLock; varying float vLive;
      float h(float n){ return fract(sin(n * 91.345) * 47453.21); }
      void main(){
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        mv.xy += position.xy * uSize;
        gl_Position = projectionMatrix * mv;
        float since = uRead - (-aG.z);
        vLock = since;
        vLive = smoothstep(-2.2, -0.8, since);
        vGl = since > 0.0 ? aG.x : floor(h(aG.y * 7.13 + floor(uT * 26.0)) * 8.0);
        vUv = uv;
      }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uOpacity; varying vec2 vUv; varying float vGl; varying float vLock; varying float vLive;
      void main(){
        vec4 t = texture2D(uMap, vec2((vGl + vUv.x) / 8.0, vUv.y));
        float flash = vLock > 0.0 ? exp(-vLock * 6.0) : 0.0;
        vec3 c = vLock > 0.0 ? mix(vec3(0.95, 0.97, 1.0) * 1.1, vec3(1.0, 0.78, 0.4) * 3.2, flash) : vec3(0.55, 0.68, 0.9) * 0.55;
        float a = t.a * uOpacity * (vLock > 0.0 ? 1.0 : 0.6 * vLive);
        if (a < 0.01) discard;
        gl_FragColor = vec4(c * a, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.userData.u = u;
  return mesh;
}

// ------------------------------------------------------------------ Mars terrain field: a gentle plain with dunes and a far crater rim
export function marsField() {
  return (x, z) => {
    const n1 = Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.043 - 0.4) * 0.22;
    const dune = Math.sin((x * 0.6 + z * 0.35) * 0.9 + Math.sin(z * 0.2) * 1.5) * 0.08;
    const d = Math.hypot(x + 20, z + 330);
    const rim = Math.exp(-Math.pow((d - 150) / 18, 2)) * 9 + Math.exp(-Math.pow((d - 150) / 60, 2)) * 5;
    const far = Math.max(0, Math.hypot(x, z) - 60);
    return n1 + dune + rim + far * far * 0.0012 * (0.6 + 0.4 * Math.sin(x * 0.03 + z * 0.02));
  };
}
