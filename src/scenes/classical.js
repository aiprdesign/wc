// CLASSICAL ARCHITECTURE & ENGINEERING (7.5 – 12.5 s)
// Technique: procedural modelling (a lathe profile revolves into a fluted column),
// material look-dev progression (wireframe → clay → marble via world-space build
// shaders), architectural visualisation (peristyle temple, sun shafts, haze) and a
// technical HUD (blueprint proportions, load paths, arch thrust lines).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CUES } from '../timeline.js';
import { ramp, ease, sat, lerp, envelope, smoothstep, timeWarp } from '../lib/math.js';
import { marbleTexture, canvas as mkCanvas, toTexture } from '../lib/textures.js';
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

// Greek Doric (Parthenon) column: no base — the fluted shaft stands straight on the stylobate. The shaft is
// built of drums (hair-line joints), carries a hypotrachelion groove round the neck, and ends under four
// annulets; the echinus swells out in a taut curve to the square abacus.
const SHAFT_TOP = 5.5;                  // top of the fluted shaft: the annulets sit on it
const NECK_Y = 5.28;                    // hypotrachelion (incised groove at the neck)
const DRUM_JOINTS = [0.52, 1.07, 1.63, 2.18, 2.74, 3.3, 3.85, 4.4, 4.93];   // ten drums
const ECH_Y0 = 5.556, ECH_Y1 = 5.8;     // echinus (above the annulets), abacus 5.8 – 6.0

const shaftRadius = (y) => { const u = y / SHAFT_TOP; return R * (1 - 0.2 * u) + R * 0.035 * Math.sin(Math.PI * u); };

// Column profile (radius, y) from the stylobate to the top of the shaft; entasis gives the subtle swell.
function shaftProfile() {
  const pts = [];
  for (let i = 0; i <= 36; i++) { const y = SHAFT_TOP * i / 36; pts.push(new THREE.Vector2(shaftRadius(y), y)); }
  return pts;
}

// Radial inset of the drum joints and the neck groove at height y (1 = full radius).
function shaftInset(y) {
  let d = 0;
  for (const j of DRUM_JOINTS) d = Math.max(d, 0.005 * Math.max(0, 1 - Math.abs(y - j) / 0.006));
  d = Math.max(d, 0.011 * sat((y - (NECK_Y - 0.013)) / 0.005) * sat(((NECK_Y + 0.013) - y) / 0.005));
  return d;
}

// Twenty concave flutes meeting in sharp arrises: every flute is its own strip of vertices, so the normals
// break at the arris instead of being averaged round it. Cylindrical UVs run continuously round the shaft.
function shaftGeometry() {
  const M = 8, dA = Math.PI * 2 / FLUTES;
  const rows = [];
  for (let i = 0; i <= 30; i++) rows.push(SHAFT_TOP * i / 30);
  for (const j of DRUM_JOINTS) rows.push(j - 0.006, j, j + 0.006);
  rows.push(NECK_Y - 0.013, NECK_Y - 0.008, NECK_Y + 0.008, NECK_Y + 0.013);
  rows.sort((a, b) => a - b);
  const ys = rows.filter((y, i) => i === 0 || y - rows[i - 1] > 0.0015);
  const pos = [], uv = [], idx = [];
  for (let f = 0; f < FLUTES; f++) {
    const base = pos.length / 3;
    for (const y of ys) {
      const r = shaftRadius(y) - shaftInset(y), depth = r * 0.05;
      for (let s = 0; s <= M; s++) {
        const a = -Math.PI + (f + s / M) * dA, t = 2 * s / M - 1, rr = r - depth * (1 - t * t);
        pos.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        uv.push((a / (Math.PI * 2) + 0.5) * 1.2, y / H * 2.2);
      }
    }
    for (let k = 0; k < ys.length - 1; k++) for (let s = 0; s < M; s++) {
      const a = base + k * (M + 1) + s, b = a + M + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Annulets + echinus as one lathe (repeated points give crisp edges), seam placed where the shaft's UVs wrap.
function capitalGeometry() {
  const rt = shaftRadius(SHAFT_TOP);
  const cp = [[0.2, SHAFT_TOP], [rt + 0.003, SHAFT_TOP]];
  let y = SHAFT_TOP;
  for (let k = 0; k < 4; k++) {                          // four annulets, each a little fillet stepping out
    const r = rt + 0.006 + k * 0.004;
    cp.push([r - 0.003, y], [r, y + 0.004], [r, y + 0.009], [r - 0.004, y + 0.014]);
    y += 0.014;
  }
  const r0 = rt + 0.02, r1 = R * 1.36, dr = r1 - r0, dh = ECH_Y1 - ECH_Y0;
  cp.push([r0, ECH_Y0], [r0, ECH_Y0]);
  for (let i = 1; i <= 18; i++) {                        // taut cubic: ~45° flare, turning vertical under the abacus
    const u = i / 18, v = 1 - u;
    const bx = v * v * v * r0 + 3 * v * v * u * (r0 + 0.55 * dr) + 3 * v * u * u * r1 + u * u * u * r1;
    const by = v * v * v * ECH_Y0 + 3 * v * v * u * (ECH_Y0 + 0.42 * dh) + 3 * v * u * u * (ECH_Y0 + 0.8 * dh) + u * u * u * ECH_Y1;
    cp.push([bx, by]);
  }
  cp.push([r1, ECH_Y1], [0, ECH_Y1]);
  const SEG = 96, g = new THREE.LatheGeometry(cp.map(([r, h]) => new THREE.Vector2(r, h)), SEG, -Math.PI / 2, Math.PI * 2);
  g.computeVertexNormals();
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const a = Math.PI - Math.floor(i / cp.length) / SEG * Math.PI * 2; uv.setXY(i, (a / (Math.PI * 2) + 0.5) * 1.2, p.getY(i) / H * 2.2); }
  return g;
}

function columnGeometry() {
  const abacus = new THREE.BoxGeometry(R * 2.8, 0.2, R * 2.8); abacus.translate(0, 5.9, 0);
  const p = abacus.attributes.position, n = abacus.attributes.normal, uv = abacus.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i)) * 0.5 + 0.5, Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) * 0.5 : p.getY(i) / H * 2.2);
  return mergeGeometries([shaftGeometry(), capitalGeometry(), abacus]);
}

// ---- helpers for the merged architectural detail ------------------------------------------------------
// Every part is normalised to non-indexed position / normal / uv so that hundreds of them merge into a
// handful of meshes (one per material).
function prep(g) {
  const n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  n.morphAttributes = {};
  return n;
}
// Box-projected world UVs (per triangle, so the marble grain runs continuously from block to block).
function worldUV(g, s = 0.12) {
  const p = g.attributes.position, uv = g.attributes.uv, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const nrm = c.sub(b).cross(a.sub(b)); const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
    for (let k = i; k < i + 3; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      if (ay >= ax && ay >= az) uv.setXY(k, x * s, z * s); else if (ax >= az) uv.setXY(k, z * s, y * s); else uv.setXY(k, x * s, y * s);
    }
  }
  return g;
}
// Quads between consecutive cross-sections (arrays of Vector3 of equal length); smooth normals along the
// profile, a repeated point gives a crisp edge.
function loft(sections) {
  const np = sections[0].length, pos = [], idx = [];
  for (const s of sections) for (const v of s) pos.push(v.x, v.y, v.z);
  for (let k = 0; k < sections.length - 1; k++) for (let j = 0; j < np - 1; j++) {
    const a = k * np + j, b = a + np;
    idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
// A moulding run round a rectangle (centred on the origin): profile = [[out, y], ...] listed bottom → top;
// each side is its own strip with mitred corners.
function ringMoulding(profile, hx, hz) {
  const C = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
  const sec = (c) => profile.map(([o, y]) => new THREE.Vector3(c[0] * (hx + o), y, c[1] * (hz + o)));
  return mergeGeometries(C.map((c, s) => loft([sec(c), sec(C[(s + 1) % 4])])));
}
const dedupe = (pr) => pr.filter((p, i) => i === 0 || p[0] !== pr[i - 1][0] || p[1] !== pr[i - 1][1]);
// A straight moulding along x (centred), facing +z: closed profile [[out(z), y], ...] plus end caps.
function runMoulding(profile, len) {
  const sec = (x) => profile.map(([o, y]) => new THREE.Vector3(x, y, o));
  const cp = dedupe(profile);
  const capL = new THREE.ShapeGeometry(new THREE.Shape(cp.map(([o, y]) => new THREE.Vector2(o, y)))); capL.rotateY(-Math.PI / 2); capL.translate(-len / 2, 0, 0);
  const capR = new THREE.ShapeGeometry(new THREE.Shape(cp.map(([o, y]) => new THREE.Vector2(-o, y)))); capR.rotateY(Math.PI / 2); capR.translate(len / 2, 0, 0);
  return mergeGeometries([loft([sec(-len / 2), sec(len / 2)]), prep(capL), prep(capR)].map(prep));
}
// Palmette (antefix / acroterion): lobed leaves fanning from a pair of volutes.
function palmetteGeometry(leaves = 9, rt = 0.27, rv = 0.15, depth = 0.04, bevel = false) {
  const sh = new THREE.Shape(), yc = 0.06, P = (a, r) => [Math.cos(a) * r, yc + Math.sin(a) * r];
  const a0 = Math.PI * 0.97, a1 = Math.PI * 0.03, da = (a0 - a1) / (leaves - 1);
  sh.moveTo(-0.1, 0); sh.lineTo(...P(a0 + da * 0.5, rv * 0.8));
  for (let i = 0; i < leaves; i++) {
    const a = a0 - i * da, rr = rt * (0.86 + 0.14 * Math.sin(Math.PI * i / (leaves - 1)));
    sh.quadraticCurveTo(...P(a + da * 0.42, rr * 1.02), ...P(a, rr));
    sh.quadraticCurveTo(...P(a - da * 0.42, rr * 1.02), ...P(a - da * 0.5, i === leaves - 1 ? rv * 0.8 : rv));
  }
  sh.lineTo(0.1, 0); sh.closePath();
  const leafG = new THREE.ExtrudeGeometry(sh, bevel ? { depth, bevelEnabled: true, bevelThickness: depth * 0.2, bevelSize: depth * 0.15, bevelSegments: 1, curveSegments: 4 } : { depth, bevelEnabled: false, curveSegments: 4 });
  leafG.translate(0, 0, -depth / 2);
  const parts = [leafG];
  for (const sx of [-1, 1]) {                             // the volutes: a scroll disc with a raised eye
    const v = new THREE.CylinderGeometry(0.045, 0.045, depth * 1.3, 16); v.rotateX(Math.PI / 2); v.translate(sx * 0.085, 0.04, 0); parts.push(v);
    const e = new THREE.CylinderGeometry(0.018, 0.018, depth * 1.8, 10); e.rotateX(Math.PI / 2); e.translate(sx * 0.085, 0.04, 0); parts.push(e);
  }
  const mid = new THREE.BoxGeometry(0.03, rt * 0.7, depth * 1.4); mid.translate(0, yc + rt * 0.3, 0); parts.push(mid);   // the central rib
  return mergeGeometries(parts.map(prep));
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
        // horizontal faces (steps, stylobate, abacus tops) lie IN the build front: the whole face would sit
        // inside the hot band and blow out to white — keep the rim to faces that actually cross the front
        float bSlope = smoothstep(0.0004, 0.006, fwidth(vBuildW.y));
        totalEmissiveRadiance += uEdge * uEdgeGain * mix(0.1, 1.0, bSlope) * (1.0 - smoothstep(0.0, 0.07, bd));`);
  };
  material.customProgramCacheKey = () => 'build-v2';
  return material;
}

// Repeated parts (the peristyle, triglyphs, mutules, antefixes) are laid out as instances, then turned into
// plain meshes: on some GPUs / browsers the instanced path with the build shader lost the per-instance
// matrices, so every copy collapsed onto the temple's centre (a dark lump by the hero column, and a temple
// standing on one column). `merge` bakes small parts into one mesh; big ones stay separate meshes.
function unInstance(im, merge = true) {
  const mats = [], m = new THREE.Matrix4();
  for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m); mats.push(m.clone()); }
  let out;
  if (merge) out = new THREE.Mesh(mergeGeometries(mats.map((x) => im.geometry.clone().applyMatrix4(x))), im.material);
  else {
    out = new THREE.Group();
    for (const x of mats) {
      const c = new THREE.Mesh(im.geometry, im.material);
      x.decompose(c.position, c.quaternion, c.scale);
      c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow;
      out.add(c);
    }
  }
  out.castShadow = im.castShadow; out.receiveShadow = im.receiveShadow;
  im.dispose();
  return out;
}

// The bloom duck the film applies while a chapter heading is up (core/words3d.js). Explore hides the
// headings (engine.headingsHidden), dropping the duck with them; the explore hook puts it back so the
// plate glows as it does in the film.
function headingDuck(ctx, inst, T) {
  let d = 0;
  const items = ctx.engine?.words3d?.items;
  if (items) for (const it of items) if (it.inst === inst) d = Math.max(d, ramp(T - it.t0, 0, 0.35) * (1 - ramp(T, it.t1 - 0.2, it.t1 + 0.35)));
  return d;
}

export function create(ctx, segment) {
  const cue = (name) => CUES[name] - segment.start;
  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.12;
  const FOG = 0.018;
  scene.fog = new THREE.FogExp2('#0d0a07', FOG);
  const camera = new THREE.PerspectiveCamera(32, ctx.aspect, 0.1, 300);

  // ---------------------------------------------------------------------- temple layout
  const FRONT_Z = 5.5, SPACING = 2.0;
  const colPositions = [];
  for (let i = 0; i < 8; i++) { const x = -7 + i * SPACING; colPositions.push([x, FRONT_Z], [x, -FRONT_Z]); }
  for (const z of [-3.3, -1.1, 1.1, 3.3]) colPositions.push([-7, z], [7, z]);
  const HERO = new THREE.Vector3(-1, 0, FRONT_Z);   // the column we build is one of the front row

  // ---------------------------------------------------------------------- materials
  const marbleMap = marbleTexture({ seed: 2 });
  // honed marble, not lacquer: no clearcoat layer (it read as plastic); a soft sheen stands in for the
  // light that scatters just under a marble surface. Surface detail (lib/surface.js) adds the polish variation.
  const marbleMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f3ede2', roughness: 0.4, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff0dc') }), '#ffc680');
  const heroMarble = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleMap, color: '#f5efe4', roughness: 0.36, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#fff0dc'), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), '#ffd9a0');
  const heroClay = withBuild(new THREE.MeshStandardMaterial({ color: '#b9a48c', roughness: 0.95 }), '#ff9f4a');
  const stoneMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 5 }), color: '#d9d1c4', roughness: 0.5 }), '#ffc680');

  // ---------------------------------------------------------------------- hero column
  const colGeo = columnGeometry();
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
  const profile = progressLine([...profilePts, new THREE.Vector3(R * 0.86, ECH_Y0, 0),
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
  // reference rings: the foot on the stylobate, two drum joints, then the neck groove, annulets, echinus and abacus
  const capRings = [[0.004, R * 1.04], [DRUM_JOINTS[0], R * 1.03], [DRUM_JOINTS[1], R * 1.02], [NECK_Y, R * 0.9], [ECH_Y0, R * 0.9], [5.78, R * 1.35], [5.9, R * 1.35]]
    .map(([y, r]) => progressLine(circlePoints(r, 64, { plane: 'xz', center: new THREE.Vector3(0, y, 0) }), { color: GOLD_LINE, intensity: 0.9 }));
  hero.add(wire, ...capRings);

  // Anatomy of the order — callouts that face the camera.
  const partCallouts = [
    ['ABACUS', 5.9, 0.9, 0.35, 'SQUARE SLAB · 1/6 D'],
    ['ECHINUS', 5.62, 1.05, -0.25, 'CUSHION CAPITAL'],
    ['SHAFT · 20 FLUTES', 3.4, 0.95, 0.2, 'ENTASIS · TAPER'],
    ['NO BASE', 0.2, 0.95, 0.35, 'GREEK DORIC · ON THE STYLOBATE'],
  ].map(([label, y, dx, dy, sub]) => {
    const c = new Callout(label, { dx, dy, size: 0.085, color: '#ffe3b3', sub, intensity: 1.5 });
    c.userData.y = y;
    scene.add(c);
    return c;
  });

  // ---------------------------------------------------------------------- the temple
  const colLayout = new THREE.InstancedMesh(colGeo, marbleMat, colPositions.length - 1);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (const [x, z] of colPositions) {
    if (x === HERO.x && z === HERO.z) continue;
    // turn each column only by whole quarter turns: the flutes still vary from column to column (90° is five
    // of the twenty flutes) while the square abacus and plinth stay square to the entablature and stylobate
    const quarter = Math.abs(Math.round(x * 7.3 + z * 3.1)) % 4;
    m4.makeRotationY(quarter * Math.PI / 2).setPosition(x, 0, z);
    colLayout.setMatrixAt(k++, m4);
  }
  colLayout.castShadow = colLayout.receiveShadow = true;
  const templeCols = unInstance(colLayout, false);
  scene.add(templeCols);

  const temple = new THREE.Group();
  scene.add(temple);
  // Detail is gathered per material and merged into a few meshes at the end (no instancing: see unInstance).
  const roofMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 9 }), color: '#cdbfa9', roughness: 0.55, clearcoat: 0.1 }), '#ffc680');
  // the bedding behind the block joints: darker stone, sharing the stone's build front (and its explore override)
  const jointMat = withBuild(new THREE.MeshStandardMaterial({ color: '#6f675c', roughness: 0.95 }), '#ffc680');
  jointMat.userData.build.uBuild = stoneMat.userData.build.uBuild;
  const cellaMat = withBuild(new THREE.MeshStandardMaterial({ color: '#3b342d', roughness: 0.9 }));
  const cellaCoreMat = withBuild(new THREE.MeshStandardMaterial({ color: '#16120e', roughness: 0.95 }));
  const trimMat = withBuild(new THREE.MeshPhysicalMaterial({ map: marbleTexture({ seed: 5 }), color: '#b3aa9c', roughness: 0.55 }), '#ffc680');
  cellaCoreMat.userData.build.uBuild = trimMat.userData.build.uBuild = cellaMat.userData.build.uBuild;
  const P = { stone: [], joint: [], roof: [], cella: [], core: [], trim: [] };
  const put = (list, g, x = 0, y = 0, z = 0, ry = 0) => { const n = prep(g); if (ry) n.rotateY(ry); n.translate(x, y, z); P[list].push(n); return n; };
  const box = (list, w, h, d, x, y, z) => put(list, new THREE.BoxGeometry(w, h, d), x, y, z);
  // a part authored facing +z, placed on one face of the entablature: u runs along the face, d is out from its plane
  const FACE_Z = 5.95, FACE_X = 7.65;
  const onFace = (list, g, face, u, y, d) => {
    if (face === 'F') return put(list, g, u, y, FACE_Z + d, 0);
    if (face === 'B') return put(list, g, u, y, -FACE_Z - d, Math.PI);
    if (face === 'R') return put(list, g, FACE_X + d, y, u, Math.PI / 2);
    return put(list, g, -FACE_X - d, y, u, -Math.PI / 2);
  };
  const spans = (a, b, L, off = 0) => {   // cut [a, b] into blocks about L long (first joint at a + off)
    const out = []; let s = a, e = a + (off > 0.05 ? off : L);
    while (s < b - 1e-6) { if (b - e < L * 0.4) e = b; out.push([s, Math.min(e, b)]); s = e; e = s + L; }
    return out;
  };
  const GAP = 0.018;

  // ---- crepidoma: three steps of separate blocks; the joints open onto a darker bedding
  for (let i = 0; i < 3; i++) {
    const W = 15.6 + i * 1.2, D = 12.6 + i * 1.2, yTop = -0.3 * i, yc = yTop - 0.15;
    box('joint', W - 0.024, 0.288, D - 0.024, 0, yc - 0.006, 0);
    const blk = (xa, xb, za, zb) => box('stone', xb - xa - GAP, 0.3, zb - za - GAP, (xa + xb) / 2, yc, (za + zb) / 2);
    if (i === 0) {
      // stylobate: a slab under every column (each column centred on its slab), finer paving inside
      const xe = [-7.8, -6, -4, -2, 0, 2, 4, 6, 7.8], ze = [-6.3, -4.4, -2.2, 0, 2.2, 4.4, 6.3];
      for (let a = 0; a < xe.length - 1; a++) for (let b = 0; b < ze.length - 1; b++) {
        const n = a > 0 && a < xe.length - 2 && b > 0 && b < ze.length - 2 ? 2 : 1;
        for (let p = 0; p < n; p++) for (let q = 0; q < n; q++) blk(lerp(xe[a], xe[a + 1], p / n), lerp(xe[a], xe[a + 1], (p + 1) / n), lerp(ze[b], ze[b + 1], q / n), lerp(ze[b], ze[b + 1], (q + 1) / n));
      }
    } else {
      // lower steps: the exposed tread band, joints staggered from step to step
      const L = 1.25, off = i === 2 ? L / 2 : 0;
      for (const sz of [-1, 1]) for (const [a, b] of spans(-W / 2, W / 2, L, off)) blk(a, b, sz > 0 ? D / 2 - 0.6 : -D / 2, sz > 0 ? D / 2 : -D / 2 + 0.6);
      for (const sx of [-1, 1]) for (const [a, b] of spans(-D / 2 + 0.6, D / 2 - 0.6, L, off)) blk(sx > 0 ? W / 2 - 0.6 : -W / 2, sx > 0 ? W / 2 : -W / 2 + 0.6, a, b);
    }
  }

  // ---- architrave: marble beams jointed over the column axes, taenia along the top
  box('joint', 15.28, 0.62, 11.88, 0, 6.31, 0);
  {
    const xe = [-7.65, -5, -3, -1, 1, 3, 5, 7.65], ze = [-5.35, -3.3, -1.1, 1.1, 3.3, 5.35];
    for (let k = 0; k < xe.length - 1; k++) for (const sz of [-1, 1]) box('stone', xe[k + 1] - xe[k] - GAP, 0.62, 0.6, (xe[k] + xe[k + 1]) / 2, 6.31, sz * (FACE_Z - 0.3));
    for (let k = 0; k < ze.length - 1; k++) for (const sx of [-1, 1]) box('stone', 0.6, 0.62, ze[k + 1] - ze[k] - GAP, sx * (FACE_X - 0.3), 6.31, (ze[k] + ze[k + 1]) / 2);
  }
  put('stone', ringMoulding([[0, 6.56], [0, 6.56], [0.032, 6.56], [0.032, 6.56], [0.032, 6.62], [0.032, 6.62], [0, 6.62]], FACE_X, FACE_Z));

  // ---- frieze: triglyphs over every column axis and every intercolumniation, with corner triglyphs
  // meeting at the corners; the last few ease outwards (the Doric corner conflict)
  const TRI_W = 0.36;
  const frontTri = [0], sideTri = [0];
  for (let k = 1; k <= 4; k++) frontTri.push(k, -k);
  for (let s = 1; s <= 3; s++) { const x = 4 + s * (FACE_X - TRI_W / 2 - 4) / 3; frontTri.push(x, -x); }
  for (let k = 1; k <= 3; k++) sideTri.push(k * 1.1, -k * 1.1);
  for (let s = 1; s <= 2; s++) { const z = 3.3 + s * (FACE_Z - TRI_W / 2 - 3.3) / 2; sideTri.push(z, -z); }
  frontTri.sort((a, b) => a - b); sideTri.sort((a, b) => a - b);
  box('stone', 15.2, 0.62, 11.8, 0, 6.93, 0);                               // frieze core (metope plane)
  // triglyph: two full glyphs and two half-glyphs (the 12-part rule), grooves stopping under the capital band
  const triGeo = (() => {
    const u = TRI_W / 12, gd = 0.022, dd = 0.065, sh = new THREE.Shape();
    const pts = [[-6 * u, -dd], [-6 * u, -gd], [-5 * u, 0], [-3 * u, 0], [-2 * u, -gd], [-u, 0], [u, 0], [2 * u, -gd], [3 * u, 0], [5 * u, 0], [6 * u, -gd], [6 * u, -dd]];
    sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false });
    g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0);                        // shape y → z (the face at z = 0, grooves behind it), extruded up
    const band = new THREE.BoxGeometry(TRI_W + 0.01, 0.06, 0.085); band.translate(0, 0.53, -0.0275);
    return mergeGeometries([prep(g), prep(band)]);
  })();
  const regula = new THREE.BoxGeometry(TRI_W, 0.025, 0.032);
  const gutta = new THREE.CylinderGeometry(0.013, 0.016, 0.03, 8); gutta.translate(0, -0.015, 0);
  const mutule = new THREE.BoxGeometry(TRI_W, 0.03, 0.2);
  const mGutta = new THREE.CylinderGeometry(0.011, 0.013, 0.022, 7); mGutta.translate(0, -0.011, 0);
  // metope relief: a low tablet carrying an abstract rosette, alternating with a sunk double frame
  const reliefA = (w) => {
    const parts = [new THREE.BoxGeometry(w - 0.12, 0.4, 0.014).translate(0, 0, 0.007)];
    parts.push(new THREE.CylinderGeometry(0.14, 0.145, 0.018, 32).rotateX(Math.PI / 2).translate(0, 0, 0.023));
    parts.push(new THREE.TorusGeometry(0.163, 0.011, 6, 40).translate(0, 0, 0.018));
    parts.push(new THREE.SphereGeometry(0.05, 14, 8).scale(1, 1, 0.5).translate(0, 0, 0.032));
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; parts.push(new THREE.SphereGeometry(0.042, 8, 6).scale(0.5, 1, 0.3).translate(0, 0.085, 0).rotateZ(a).translate(0, 0, 0.032)); }
    return mergeGeometries(parts.map(prep));
  };
  const reliefB = (w) => {
    const parts = [new THREE.BoxGeometry(w - 0.12, 0.4, 0.014).translate(0, 0, 0.007)];
    for (const [iw, ih, d] of [[w - 0.2, 0.32, 0.024], [w - 0.32, 0.2, 0.034]]) {
      const t = 0.022;
      parts.push(new THREE.BoxGeometry(iw, t, d).translate(0, ih / 2 - t / 2, d / 2), new THREE.BoxGeometry(iw, t, d).translate(0, -ih / 2 + t / 2, d / 2));
      parts.push(new THREE.BoxGeometry(t, ih, d).translate(iw / 2 - t / 2, 0, d / 2), new THREE.BoxGeometry(t, ih, d).translate(-iw / 2 + t / 2, 0, d / 2));
    }
    parts.push(new THREE.CylinderGeometry(0.035, 0.035, 0.046, 16).rotateX(Math.PI / 2).translate(0, 0, 0.023));
    return mergeGeometries(parts.map(prep));
  };
  const reliefCache = new Map();
  const relief = (w, k) => { const key = `${w.toFixed(3)}${k % 2}`; if (!reliefCache.has(key)) reliefCache.set(key, (k % 2 ? reliefB : reliefA)(w)); return reliefCache.get(key); };
  for (const [faces, list] of [[['F', 'B'], frontTri], [['R', 'L'], sideTri]]) for (const face of faces) {
    list.forEach((u, k) => {
      onFace('stone', triGeo, face, u, 6.62, 0.005);
      onFace('stone', regula, face, u, 6.5475, 0.016);                     // regula under the taenia …
      for (let g = 0; g < 6; g++) onFace('stone', gutta, face, u + (g - 2.5) * 0.06 * (face === 'B' || face === 'R' ? -1 : 1), 6.535, 0.017);   // … and its six guttae
      const mut = [u];
      if (k < list.length - 1) {
        const c = (u + list[k + 1]) / 2, w = list[k + 1] - u - TRI_W;
        mut.push(c);
        onFace('stone', relief(w, k), face, c, 6.87, -0.05);               // metope relief
      }
      for (const m of mut) {                                               // mutules over every triglyph and metope, 3 × 6 guttae
        onFace('stone', mutule, face, m, 7.225, 0.17);
        for (let r = 0; r < 3; r++) for (let g = 0; g < 6; g++) onFace('stone', mGutta, face, m + (g - 2.5) * 0.06, 7.21, 0.11 + r * 0.06);
      }
    });
  }
  put('stone', ringMoulding([[0, 7.12], [0, 7.12], [0.028, 7.12], [0.028, 7.12], [0.028, 7.18]], 7.6, 5.9));                        // metope crown
  put('stone', ringMoulding([[0, 7.18], [0, 7.18], [0.088, 7.18], [0.088, 7.18], [0.088, 7.24]], 7.6, 5.9));                        // frieze band

  // ---- horizontal geison with a hawksbeak crown
  box('stone', 15.9, 0.2, 12.5, 0, 7.34, 0);
  box('stone', 15.86, 0.06, 12.46, 0, 7.47, 0);
  put('stone', ringMoulding([[0, 7.44], [-0.006, 7.447], [0.012, 7.466], [0.016, 7.478], [0.006, 7.49], [0.006, 7.49], [-0.02, 7.5]], 7.95, 6.25));

  // ---- pediments: the tympanum wall recessed behind the raking cornice, which is a geison plus a cyma sima
  const RISE = 1.95, RUN = 7.95, TH = Math.atan2(RISE, RUN), TAN = RISE / RUN;
  {
    const pedShape = new THREE.Shape([new THREE.Vector2(-RUN, 0), new THREE.Vector2(RUN, 0), new THREE.Vector2(0, RISE)]);
    const ped = new THREE.ExtrudeGeometry(pedShape, { depth: 11.8, bevelEnabled: false });
    put('stone', ped, 0, 7.48, -5.9);
    const slopeY = (x) => 7.48 + (RUN - Math.abs(x)) * TAN;
    const raking = (profile, xa, xb) => loft([xa, xb].map((x) => profile.map(([z, h]) => new THREE.Vector3(x, slopeY(x) + h, z))));
    const geisonP = [[5.9, -0.24], [6.25, -0.24], [6.25, -0.24], [6.25, -0.045], [6.244, -0.038], [6.262, -0.016], [6.266, -0.004], [6.266, 0], [6.266, 0], [5.9, 0]];
    const simaP = [[6.05, 0], [6.27, 0], [6.27, 0], [6.27, 0.03], [6.274, 0.06], [6.288, 0.1], [6.312, 0.14], [6.332, 0.18], [6.34, 0.21], [6.342, 0.23], [6.342, 0.26], [6.342, 0.26], [6.05, 0.26], [6.05, 0.26], [6.05, 0]];
    const rakeCap = (profile, x) => {                                      // closes the raking cornice where it meets the flank
      profile = dedupe(profile);
      const sg = Math.sign(x), g = new THREE.ShapeGeometry(new THREE.Shape(profile.map(([z, h]) => new THREE.Vector2(-sg * z, h))));
      g.rotateY(sg * Math.PI / 2); g.translate(x, slopeY(x), 0); return g;
    };
    for (const back of [false, true]) for (const [xa, xb] of [[-8.03, 0], [0, 8.03]]) {
      const xe = xa < 0 ? xa : xb;
      const parts = [raking(geisonP, xa, xb), raking(simaP, xa, xb), rakeCap(geisonP, xe), rakeCap(simaP, xe)];
      for (const g of parts) { if (back) g.rotateY(Math.PI); put('stone', g); }
    }
    // lateral sima along the flanks: the eaves gutter, with lion-head spouts
    const latSima = runMoulding([[-0.15, 7.5], [0, 7.5], [0, 7.53], [0.004, 7.56], [0.018, 7.6], [0.042, 7.64], [0.062, 7.675], [0.071, 7.7], [0.072, 7.73], [-0.15, 7.73]], 12.5);
    for (const sx of [-1, 1]) put('stone', latSima, sx * RUN, 0, 0, sx * Math.PI / 2);
    const lion = (() => {                                                  // lion-head spout: a swept-back mane, broad
      const parts = [new THREE.SphereGeometry(0.074, 16, 10).scale(1, 0.95, 0.32)];                               // brow, jutting muzzle
      for (let k = 0; k < 10; k++) {                                       // and the open jaws of the spout
        const a = (k + 0.5) * Math.PI * 2 / 10;
        parts.push(new THREE.SphereGeometry(0.03, 6, 4).scale(0.7, 1.3, 0.45).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 0.058, Math.sin(a) * 0.058 + 0.004, 0.008));
      }
      parts.push(new THREE.SphereGeometry(0.05, 14, 10).scale(1, 1.02, 0.7).translate(0, 0.006, 0.022));         // face
      parts.push(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 8).rotateZ(Math.PI / 2).scale(1, 1, 1.2).translate(0, 0.026, 0.05));   // brow ridge
      for (const ex of [-1, 1]) {
        parts.push(new THREE.SphereGeometry(0.014, 6, 4).scale(1, 1.2, 0.6).translate(ex * 0.046, 0.05, 0.02));    // ears
        parts.push(new THREE.SphereGeometry(0.021, 8, 6).scale(1, 0.85, 0.95).translate(ex * 0.016, -0.014, 0.058));   // whisker pads
      }
      parts.push(new THREE.BoxGeometry(0.022, 0.034, 0.03).translate(0, 0.006, 0.066));                            // nose bridge
      parts.push(new THREE.SphereGeometry(0.014, 8, 6).scale(1.2, 0.8, 1).translate(0, -0.004, 0.08));            // nose
      parts.push(new THREE.CylinderGeometry(0.014, 0.018, 0.06, 10, 1, true).rotateX(Math.PI / 2 + 0.25).translate(0, -0.038, 0.075));   // spout
      parts.push(new THREE.SphereGeometry(0.02, 8, 6).scale(1, 0.45, 1).translate(0, -0.056, 0.058));              // lower jaw
      return mergeGeometries(parts.map(prep));
    })();
    for (const sx of [-1, 1]) for (let m = 0; m < 8; m++) for (const sz of [-1, 1]) put('stone', lion, sx * (RUN + 0.068), 7.615, sz * (0.5 + 2 * m) * 0.39, sx * Math.PI / 2);
  }
  // tympanum: the recessed back wall (darker), filling the triangle under the raking geison, laid in ashlar
  // courses (the shape's UVs are in metres: one texture tile = two 0.45 m courses of 1.6 m blocks, staggered)
  const tympMap = (() => {
    const c = mkCanvas(512, 256), g = c.getContext('2d');
    g.fillStyle = '#e8e2d8'; g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) { const v = 200 + ((i * 97) % 55); g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.25)`; g.fillRect((i * 173) % 512, (i * 59) % 256, 3 + (i % 7), 2 + (i % 5)); }
    g.fillStyle = '#6a6258';
    for (const y of [0, 127]) g.fillRect(0, y, 512, 3);
    for (const [x, y0] of [[0, 0], [256, 0], [128, 128], [384, 128]]) g.fillRect(x, y0, 3, 128);
    return toTexture(c, { repeat: true });
  })();
  tympMap.repeat.set(1 / 3.2, 1 / 0.9);
  const tymp = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-(RUN - 0.24 / TAN), 0), new THREE.Vector2(RUN - 0.24 / TAN, 0), new THREE.Vector2(0, RISE - 0.24)])), withBuild(new THREE.MeshStandardMaterial({ color: '#77706a', map: tympMap, roughness: 0.8 })));
  tymp.position.set(0, 7.48, 5.905);
  temple.add(tymp);
  // (the same recess on the rear pediment, so the temple is finished all the way round)
  const tympBack = new THREE.Mesh(tymp.geometry, tymp.material);
  tympBack.position.set(0, 7.48, -5.905); tympBack.rotation.y = Math.PI;
  temple.add(tympBack);

  // ---- roof: marble pan tiles with cover-tile ridges, ridge tiles, antefixes, acroteria
  {
    // marble roof tiles on both slopes, course by course: flat pan tiles with a cover tile of rounded section
    // over every joint, each course lapping over the one below (a true butt step, not a ramp); the eaves end
    // inside the lateral sima, the gable ends inside the raking sima
    const slopeLen = Math.hypot(RISE, RUN) + 0.2;
    const TILE = 0.39, COURSES = 13, Z0 = -6.3, ZL = 12.6, D0 = 0.07, NZ = Math.round(ZL / TILE) * 16, LAP = 0.024, CW = 0.068, CH = 0.07;
    const across = (z) => {                                               // tile surface height over the pan plane at z
      const ph = z / TILE - Math.round(z / TILE), dz = Math.abs(ph) * TILE;   // distance from the nearest cover-tile axis
      return dz < CW ? CH * Math.sqrt(1 - (dz / CW) ** 2) : -0.008 * Math.sin(Math.PI * (dz - CW) / (TILE / 2 - CW));
    };
    const parts = [];
    for (const sgn of [-1, 1]) {
      const nx = sgn * Math.sin(TH), ny = Math.cos(TH), dl = (slopeLen - 0.2 - D0) / COURSES;
      const at = (d, z, off) => new THREE.Vector3(sgn * (RUN - d * Math.cos(TH)) + nx * off, 7.48 + d * Math.sin(TH) + ny * off, z);
      const pos = [], uv = [], idx = [];
      const strip = (rowA, rowB, out) => {                                // quads between two rows, wound to face `out`
        const b = pos.length / 3;
        for (const r of [rowA, rowB]) for (const v of r) { pos.push(v.x, v.y, v.z); uv.push(v.z * 0.24, v.y * 0.3); }
        const n = rowA.length, e1 = rowB[0].clone().sub(rowA[0]), e2 = rowA[1].clone().sub(rowA[0]), flip = e1.cross(e2).dot(out) < 0;
        for (let j = 0; j < n - 1; j++) { const a = b + j, c = b + n + j; if (flip) idx.push(a, a + 1, c, c, a + 1, c + 1); else idx.push(a, c, a + 1, c, c + 1, a + 1); }
      };
      const OUT = new THREE.Vector3(nx, ny, 0), DOWN = new THREE.Vector3(sgn * Math.cos(TH), -Math.sin(TH), 0);
      for (let c = 0; c < COURSES; c++) {
        const d0 = D0 + c * dl, d1 = d0 + dl;
        const zs = Array.from({ length: NZ + 1 }, (_, i) => Z0 + ZL * i / NZ);
        // each tile tilts: its butt stands proud of the course below by LAP, its head tucks under the next course
        const butt0 = zs.map((z) => at(d0, z, 0.028 + across(z))), butt1 = zs.map((z) => at(d0, z, 0.03 + LAP + across(z)));
        const head = zs.map((z) => at(d1 + 0.001, z, 0.03 + across(z)));
        strip(butt0, butt1, DOWN);
        strip(butt1.map((v) => v.clone()), head, OUT);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      g.computeVertexNormals();
      parts.push(g);
    }
    const roof = new THREE.Mesh(mergeGeometries(parts), roofMat);
    roof.castShadow = roof.receiveShadow = true;
    temple.add(roof);
    // ridge: saddle tiles lapping one over the next, each with a collar
    const saddle = new THREE.CylinderGeometry(0.12, 0.12, TILE + 0.02, 12, 1, false, -Math.PI / 2, Math.PI); saddle.rotateX(-Math.PI / 2);
    const collar = new THREE.CylinderGeometry(0.136, 0.136, 0.05, 12, 1, false, -Math.PI / 2, Math.PI); collar.rotateX(-Math.PI / 2);
    for (let k = 0; k < Math.round(ZL / TILE); k++) { const z = Z0 + (k + 0.5) * (ZL / Math.round(ZL / TILE)); put('roof', saddle, 0, 9.5, z); put('roof', collar, 0, 9.5, z - TILE / 2 + 0.03); }
    // antefixes on the sima, one in line with every cover-tile row
    const palmGeo = palmetteGeometry(9, 0.27, 0.15, 0.04, false);
    for (const sgn of [-1, 1]) for (let k = -15; k <= 15; k++) put('stone', palmGeo, sgn * (RUN - 0.02), 7.73, k * TILE, sgn * Math.PI / 2);
    // acroteria: a great palmette on the apex, smaller ones at the corners, each on its plinth
    const acroGeo = palmetteGeometry(11, 0.27, 0.14, 0.05, true); acroGeo.scale(2.6, 2.6, 2.2);
    for (const sz of [-1, 1]) {
      const z = sz * 6.19, ry = sz > 0 ? 0 : Math.PI;
      box('stone', 0.6, 0.18, 0.42, 0, 9.43 + 0.26 + 0.09, z); put('stone', acroGeo, 0, 9.87, z, ry);
      for (const sx of [-1, 1]) {
        box('stone', 0.42, 0.14, 0.36, sx * (RUN - 0.02), 7.73 + 0.07, z);
        const a = acroGeo.clone(); a.scale(0.7, 0.7, 0.7); put('stone', a, sx * (RUN - 0.02), 7.87, z, ry);
      }
    }
  }

  // ---- cella: ashlar coursing over a dark core, antae ending the side walls, a framed doorway
  {
    const X = 4.75, ZF = 3.1, ZB = -4.3, T = 0.14;
    // core (the joints and the door recess open onto it)
    box('core', 2 * X - 0.024, 5.99, 2.5 - ZB - 0.012, 0, 2.995, (2.5 + ZB + 0.012) / 2);
    box('core', X - 1.2 - 0.012, 5.99, ZF - 2.5 - 0.012, -(X + 1.2 - 0.012) / 2, 2.995, (ZF - 0.012 + 2.5) / 2);
    box('core', X - 1.2 - 0.012, 5.99, ZF - 2.5 - 0.012, (X + 1.2 - 0.012) / 2, 2.995, (ZF - 0.012 + 2.5) / 2);
    box('core', 2.4, 1.79, ZF - 2.5 - 0.012, 0, 5.095, (ZF - 0.012 + 2.5) / 2);
    // courses: toichobate (moulded base, in trim) 0–0.22, orthostates 0.22–1.22, ten courses to 5.72, wall crown
    const levels = [[0.22, 1.22, 1.5]];
    for (let k = 0; k < 10; k++) levels.push([1.22 + k * 0.45, 1.67 + k * 0.45, 0.95]);
    const DOOR_X = 1.46, DOOR_TOP = 4.82;
    levels.forEach(([y0, y1, L], k) => {
      const off = k % 2 ? L / 2 : 0, h = y1 - y0 - GAP, yc = (y0 + y1) / 2;
      const front = y1 <= DOOR_TOP + 1e-6 ? [[-X, -DOOR_X], [DOOR_X, X]] : [[-X, X]];
      for (const [a, b] of front) for (const [s, e] of spans(a, b, L, off)) box('cella', e - s - GAP, h, T, (s + e) / 2, yc, ZF - T / 2);
      for (const [s, e] of spans(-X, X, L, off)) box('cella', e - s - GAP, h, T, (s + e) / 2, yc, ZB + T / 2);
      for (const sx of [-1, 1]) for (const [s, e] of spans(ZB + T, ZF - T, L, L / 2 - off + 0.01)) box('cella', T, h, e - s - GAP, sx * (X - T / 2), yc, (s + e) / 2);
      // antae: the side walls run on past the cross walls as pilasters, coursed with them
      for (const sx of [-1, 1]) for (const [za, zb] of [[ZF, ZF + 0.5], [ZB - 0.5, ZB]]) box('cella', 0.5 - GAP, h, zb - za - GAP, sx * (X - 0.25), yc, (za + zb) / 2);
    });
    for (const sx of [-1, 1]) for (const [za, zb] of [[ZF, ZF + 0.5], [ZB - 0.5, ZB]]) {
      box('core', 0.476, 5.72, zb - za - 0.024, sx * (X - 0.25), 2.86, (za + zb) / 2);
      // anta capital: fascia, hawksbeak and cavetto, and the moulded anta base
      const cap = ringMoulding([[0, 5.72], [0.03, 5.75], [0.035, 5.8], [0.012, 5.83], [0.012, 5.83], [0.055, 5.89], [0.065, 5.93], [0.065, 5.93], [0.065, 6.0]], 0.25, (zb - za) / 2);
      put('trim', cap, sx * (X - 0.25), 0, (za + zb) / 2);
      put('trim', ringMoulding([[0.05, 0], [0.05, 0], [0.05, 0.14], [0.02, 0.2], [0, 0.22]], 0.25, (zb - za) / 2), sx * (X - 0.25), 0, (za + zb) / 2);
    }
    // wall crown (epikranitis) all round, toichobate interrupted by the threshold
    put('trim', ringMoulding([[0, 5.72], [0.03, 5.75], [0.035, 5.8], [0.012, 5.83], [0.012, 5.83], [0.055, 5.89], [0.065, 5.93], [0.065, 5.93], [0.065, 6.0]], X, (ZF - ZB) / 2), 0, 0, (ZF + ZB) / 2);
    const toich = [[-0.05, 0], [0.05, 0], [0.05, 0.14], [0.02, 0.2], [0, 0.22], [-0.05, 0.22]];
    const tl = X - 1.5;
    put('trim', runMoulding(toich, tl), -(X + 1.5) / 2, 0, ZF); put('trim', runMoulding(toich, tl), (X + 1.5) / 2, 0, ZF);
    put('trim', runMoulding(toich, 2 * X), 0, 0, ZB, Math.PI);
    for (const sx of [-1, 1]) put('trim', runMoulding(toich, ZF - ZB), sx * X, 0, (ZF + ZB) / 2, sx * Math.PI / 2);
    // doorway: threshold, reveals lined in marble, stepped (two-fascia) jambs, lintel and its cornice
    box('trim', 2.9, 0.06, 0.8, 0, 0.03, 2.9);
    for (const sx of [-1, 1]) {
      box('trim', 0.03, 4.2, 0.6, sx * 1.185, 2.1, 2.8);                    // reveal lining
      box('trim', 0.14, 4.52, 0.075, sx * 1.39, 2.26, ZF + 0.0375);         // outer fascia of the frame
      box('trim', 0.12, 4.32, 0.045, sx * 1.26, 2.16, ZF + 0.0225);         // inner fascia, stepped back
    }
    box('trim', 2.4, 0.03, 0.6, 0, 4.185, 2.8);
    box('trim', 2.92, 0.2, 0.075, 0, 4.42, ZF + 0.0375);                    // lintel: outer fascia …
    box('trim', 2.64, 0.12, 0.045, 0, 4.26, ZF + 0.0225);                   // … and inner fascia
    put('trim', runMoulding([[-0.02, 4.52], [0.06, 4.52], [0.06, 4.52], [0.07, 4.58], [0.1, 4.66], [0.14, 4.72], [0.15, 4.76], [0.15, 4.82], [-0.02, 4.82]], 3.2), 0, 0, ZF);
  }

  // ---- bake: one mesh per material
  const meshes = {};
  for (const [k, mat] of [['stone', stoneMat], ['joint', jointMat], ['roof', roofMat], ['cella', cellaMat], ['core', cellaCoreMat], ['trim', trimMat]]) {
    const g = worldUV(mergeGeometries(P[k]), k === 'roof' ? 0.2 : 0.12);
    const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
    temple.add(m); meshes[k] = m;
  }
  const cella = meshes.cella;
  const cellaDoor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5c').multiplyScalar(0.1), toneMapped: false }));
  cellaDoor.position.set(0, 2.1, 2.505);
  temple.add(cellaDoor);

  // ground: dark polished stone that catches the sun
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), new THREE.MeshStandardMaterial({ color: '#130f0c', roughness: 0.5, metalness: 0 }));
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
  const loadLabel = new Callout('LOAD PATH · COMPRESSION', { dx: 1.0, dy: 4.0, size: 0.4, color: '#ffe3b3', sub: 'DEAD LOAD → STYLOBATE' });
  loadLabel.position.set(-7, 6.0, 0.05);   // label up in the open sky left of the pediment: pointing left it ran off the square frame
  const pedLabel = new Callout('PEDIMENT · 13.7°', { dx: -0.6, dy: 3.4, size: 0.4, color: '#cfe0ff', sub: 'RAKING CORNICE' });
  pedLabel.position.set(4, 8.4, 0.05);
  const pedArc = progressLine(circlePoints(2.6, 24, { start: Math.PI, end: Math.PI - 0.239, center: V(7.95, 7.48) }), { color: BLUE_LINE, intensity: 1.4 });
  const colDim = new Dimension(V(8.4, 0), V(8.4, 6), 'H = 7 D', { size: 0.34, tick: 0.25, color: '#cfe0ff' });
  const bayDim = new Dimension(V(-1, -0.6), V(1, -0.6), 'AXIAL SPACING · 2.4 D', { size: 0.26, tick: 0.18, color: '#cfe0ff' });
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
  const keystone = new Callout('KEYSTONE', { dx: 1.2, dy: 0.9, size: 0.3, color: '#cfe0ff', sub: 'ARCH · THRUST LINE' });
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

  // Engineering overlays: k scales the facade drawings, ka the arch diagram (1 in the film; the explore
  // hooks fade each one as it turns edge-on, where its additive lines stack into a hot streak)
  function setOverlays(t, k, ka) {
    const o = (i) => ramp(t, tOver + i * 0.14, tOver + 0.7 + i * 0.14, ease.outCubic);
    const oFade = 1 - ramp(t, dur - 0.35, dur), f = oFade * k, fa = oFade * ka;
    golden.progress = o(0); golden.opacity = 0.9 * f;
    goldenSub.progress = o(1); goldenSub.opacity = 0.7 * f;
    spiral.progress = o(2); spiral.opacity = f;
    phiLabel.reveal = o(3); phiLabel.opacity = o(3) > 0 ? f : 0;
    flowMat.uniforms.uTime.value = t; flowMat.uniforms.uOpacity.value = o(1) * f * 0.9;
    loadLabel.reveal(o(2), f); pedLabel.reveal(o(3), f);
    pedArc.progress = o(3); pedArc.opacity = f;
    colDim.reveal(o(4), f); bayDim.reveal(o(5), f);
    const archP = ramp(t, tOver + 0.2, tOver + 1.2, ease.outCubic);
    archIn.progress = archP; archOut.progress = archP; piers.progress = archP; archJoints.progress = ramp(t, tOver + 0.5, tOver + 1.3);
    thrust.progress = ramp(t, tOver + 0.8, tOver + 1.5);
    for (const l of archLines) l.opacity = fa;
    keystone.reveal(ramp(t, tOver + 0.9, tOver + 1.5), fa);
  }
  const archLines = [archIn, archOut, piers, archJoints, thrust];

  function update(t, info) {
    lastT = t;
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
    // (once the front has passed the roof ridge it runs on up through the apex acroterion, whose palmette rises
    // above y = 10: everything below is timed exactly as before)
    const buildY = templeY + 2.5 * ramp(t, tOver + 0.1, tOver + 0.6);
    for (const m of [marbleMat, stoneMat, roofMat, cella.material, tymp.material]) m.userData.build.uBuild.value = buildY;
    lastTempleY = templeY;
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
    ground.scale.setScalar(1); scene.fog.density = FOG;   // (the explore hooks extend the set)
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
    dirY = camPos.y;
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
    setOverlays(t, 1, 1);

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

  // Explore 3D: while the lone column is still being modelled it would float a metre above the ground —
  // stand it on its (not yet dressed) crepidoma, which the build front raises in the film a moment later.
  let lastTempleY = -2, lastT = 0, dirY = 3;
  const _d = new THREE.Vector3(), _c = new THREE.Vector3();
  const OVER_C = new THREE.Vector3(0, 4, FRONT_Z + 0.7), OVER_N = new THREE.Vector3(0, 0, 1);
  const ARCH_C = new THREE.Vector3(13.5, 3, FRONT_Z - 1.5), ARCH_N = new THREE.Vector3(Math.sin(-0.35), 0, Math.cos(-0.35));
  const facing = (cam, C, N) => smoothstep(0.4, 0.75, _d.copy(_c.setFromMatrixPosition(cam.matrixWorld)).sub(C).normalize().dot(N));
  function explore(t) {
    if (lastTempleY < 0.3) {
      stoneMat.userData.build.uBuild.value = 0.3;                  // steps only: every other stone part starts above y = 6
      temple.visible = true;
      templeCols.visible = false;
    }
    // seen from up high the ground disc's rim showed against the dome's horizon band: carry the floor out to
    // the dome (update() resets it; explorePosed thins the haze with height)
    ground.scale.setScalar(149.5 / 120);
    // Explore hides the chapter heading, and with it the bloom duck the film applies under it: the
    // wireframe / clay column (a strong additive emitter under the key spot) blew out into a glare
    if (ctx.engine?.headingsHidden) bloom.strength *= 1 - 0.45 * headingDuck(ctx, api, t + segment.start);
  }
  // callouts turn to the viewer's camera; the flat engineering drawings fade out as they turn edge-on
  function explorePosed(cam) {
    cam.updateMatrixWorld();
    for (const c of partCallouts) if (c.visible) faceCamera(c, cam);
    // risen well above the film's eye, the fogged far ground read as a black ring under the horizon glow:
    // thin the haze with height (unchanged at the film's own eye level)
    const up = (_c.setFromMatrixPosition(cam.matrixWorld).y + 1.05) / Math.max(0.5, dirY + 1.05);
    scene.fog.density = FOG * lerp(1, 0.25, smoothstep(1.3, 3.0, up));
    if (lastT > tOver - 0.1) setOverlays(lastT, facing(cam, OVER_C, OVER_N), facing(cam, ARCH_C, ARCH_N));
  }
  const api = { scene, camera, hud, update, explore, explorePosed, dof, bloom, exposure: 1, exploreLimits: { yaw: 1.2, pitchDown: 0.35, pitchUp: 0.85, zoomOut: 3.0 } };
  return api;
}
