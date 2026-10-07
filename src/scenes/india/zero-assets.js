// ZERO & THE DECIMAL SYSTEM — build-time assets for close inspection (Explore 3D).
//   · the birch-bark leaf as a real sheet: its ragged outline becomes a laminated edge band (birch bark is a
//     stack of paper-thin layers), a paler inner-bark underside, a few lifted, curling flakes at the edge
//   · the plinth: a bevelled lacquer slab on a recessed kick base, the gold inlay and a blank brass plaque
//   · the place-value trays: a moulded base with a glass channel, chamfered posts with capitals and feet,
//     slotted screws, turned rod finials, brushed gold, glass with faint smudges; lathe-turned wooden beads
// Uses the craft kit in language-assets.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tnoise, field, normalTex, greyTex, colorTex, brushedMaps, speckleMaps, woodMaps, prep, Parts, screwGeo, lathe, uvScale, place } from './language-assets.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------------------ the leaf
// Edge band along the outline (points in leaf-local x/z, closed), from the top surface down by `thick`. The
// band's v runs across the thickness so a laminated texture shows the layers.
export function leafEdge(pts, heightFn, thick) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (i) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    const y = heightFn(x, z);
    // a little ragged: the layers are torn unevenly
    const t = thick * (0.75 + 0.5 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.61)));
    pos.push(x, y + 0.0004, z, x, y - t, z);
    uv.push(acc * 6, 1, acc * 6, 0);
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2, b = a + 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// the torn edge: thin pale and dark layers (u along the edge, v across the thickness)
export function laminaTexture() {
  return colorTex(512, 64, (u, v) => {
    const layer = Math.floor(v * 9 + tnoise(u, v, 6, 1, 3) * 0.8);
    const pale = layer % 2 === 0, n = tnoise(u, v, 40, 4, 5) * 0.1;
    const c = pale ? [214, 186, 146] : [126, 84, 50];
    return c.map((x) => x * (1 + n));
  });
}
// Underside: inner bark, pinkish tan, smoother, with faint horizontal lenticel scars; alpha clipped by `clip`.
export function undersideTexture(clip) {
  const W = 768, H = 333, c = mkCanvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const l = 0.9 + tnoise(u, v, 4, 3, 7) * 0.08 + tnoise(u, v, 8, 160, 8) * 0.05;
    d[i] = 196 * l; d[i + 1] = 150 * l; d[i + 2] = 118 * l; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const R = rng(91);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(120,70,48,${0.15 + R() * 0.2})`; g.fillRect(R() * W, R() * H, 4 + R() * 30, 1 + R() * 1.5); }
  clip(g, W, H);
  return toTexture(c);
}
// A lifted flake of outer bark: a thin strip curling up off the sheet (local: base on y = 0 along +x, rising).
export function flakeGeo(len, wid, curl, seg = 8) {
  const g = new THREE.PlaneGeometry(len, wid, seg, 2); g.rotateX(-Math.PI / 2); g.translate(len / 2, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), f = x / len, a = f * curl, r = len / Math.max(curl, 1e-3);
    // roll the strip about z: arc of radius r
    p.setXYZ(i, Math.sin(a) * r, (1 - Math.cos(a)) * r + Math.abs(z) * 0.08 * f, z * (1 - 0.25 * f));
  }
  g.computeVertexNormals();
  return g;
}
// normal map from a greyscale canvas (height in R)
export function canvasNormal(c, strength = 3) {
  const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
  for (let i = 0; i < H.length; i++) H[i] = d[i * 4] / 255;
  const t = normalTex(H, w, h, strength);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ------------------------------------------------------------------------------------------------ plinth
// Bevelled slab (w × h × d, bottom on y = kick) on an inset kick base, with the gold inlay round the top.
export function buildPlinth({ w, h, d, mat, gold, kickMat, lite = false }) {
  const P = new Parts();
  const kick = 0.008, bev = 0.004;
  const rr = (W, D, r) => {
    const s = new THREE.Shape(), x = W / 2 - r, z = D / 2 - r;
    s.moveTo(-x, -D / 2); s.lineTo(x, -D / 2); s.absarc(x, -z, r, -Math.PI / 2, 0); s.lineTo(W / 2, z); s.absarc(x, z, r, 0, Math.PI / 2);
    s.lineTo(-x, D / 2); s.absarc(-x, z, r, Math.PI / 2, Math.PI); s.lineTo(-W / 2, -z); s.absarc(-x, -z, r, Math.PI, Math.PI * 1.5);
    return s;
  };
  const slab = new THREE.ExtrudeGeometry(rr(w - 2 * bev, d - 2 * bev, 0.012), { depth: h - kick - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: lite ? 1 : 3, curveSegments: lite ? 3 : 6 });
  slab.rotateX(-Math.PI / 2); slab.translate(0, kick + bev, 0);
  P.add(mat, slab);
  const base = new THREE.ExtrudeGeometry(rr(w - 0.03, d - 0.03, 0.01), { depth: kick + 0.001, bevelEnabled: false, curveSegments: 3 });
  base.rotateX(-Math.PI / 2);
  P.add(kickMat, base);
  // the gold inlay: a half-round bead let into the top, just inside the bevel
  const inset = 0.012, y = h + 0.0006;
  const bead = (a, b) => { const len = a.distanceTo(b); const g = new THREE.CylinderGeometry(0.0028, 0.0028, len, 8, 1, true); g.rotateZ(Math.PI / 2); if (Math.abs(a.x - b.x) < 1e-6) g.rotateY(Math.PI / 2); g.translate((a.x + b.x) / 2, y - 0.0012, (a.z + b.z) / 2); return g; };
  const X = w / 2 - inset, Z = d / 2 - inset, V = (x, z) => new THREE.Vector3(x, 0, z);
  P.add(gold, bead(V(-X, Z), V(X, Z))); P.add(gold, bead(V(-X, -Z), V(X, -Z)));
  P.add(gold, bead(V(X, -Z), V(X, Z))); P.add(gold, bead(V(-X, -Z), V(-X, Z)));
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P.add(gold, new THREE.SphereGeometry(0.0034, 10, 6).translate(sx * X, y - 0.0012, sz * Z));
  // blank brass plaque on the front face, two slotted screws
  const pw = 0.22, ph = 0.03;
  const plaque = new THREE.BoxGeometry(pw, ph, 0.002, 1, 1, 1).translate(0, kick + (h - kick) / 2, d / 2 + 0.001);
  P.add(gold, plaque);
  if (!lite) for (const sx of [-1, 1]) P.add(gold, screwGeo(0.0035, { seg: 10 }).rotateX(Math.PI / 2).translate(sx * (pw / 2 - 0.009), kick + (h - kick) / 2, d / 2 + 0.002));
  return P.build();
}

// --------------------------------------------------------------------------------------------- the trays
// One tray frame (gold parts) at the original dimensions: base 0.54 × 0.05 × 0.4, posts at (±0.25, ±0.18),
// height TH, top rails, a rod of 0.62 on a collar. Returns geometry for gold and for a dark inlay (channel).
export function trayFrame(TH, { lite = false } = {}) {
  const gold = [], dark = [];
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // moulded base: a plinth with a chamfered upper step and a recessed channel holding the glass
  gold.push(box(0.54, 0.036, 0.4, 0, 0.018, 0));
  gold.push(chamferBox(0.53, 0.014, 0.39, 0.006).translate(0, 0.036 + 0.007, 0));
  dark.push(box(0.5, 0.002, 0.012, 0, 0.0505, 0.1755), box(0.5, 0.002, 0.012, 0, 0.0505, -0.1755), box(0.012, 0.002, 0.351, 0.2455, 0.0505, 0), box(0.012, 0.002, 0.351, -0.2455, 0.0505, 0));
  // feet under the base corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gold.push(lathe([[0, 0], [0.02, 0], [0.024, 0.004], [0.018, 0.008], [0, 0.008]], 16).translate(sx * 0.23, -0.004, sz * 0.16));
  // posts: chamfered square section, capitals and plinth blocks
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    gold.push(chamferBox(0.012, TH, 0.012, 0.0022).translate(sx * 0.25, 0.05 + TH / 2, sz * 0.18));
    gold.push(chamferBox(0.02, 0.016, 0.02, 0.003).translate(sx * 0.25, 0.05 + 0.008, sz * 0.18));
    gold.push(chamferBox(0.02, 0.014, 0.02, 0.003).translate(sx * 0.25, 0.05 + TH + 0.002, sz * 0.18));
    gold.push(lathe([[0, 0], [0.006, 0], [0.007, 0.004], [0.004, 0.008], [0.0015, 0.012], [0, 0.013]], 12).translate(sx * 0.25, 0.05 + TH + 0.009, sz * 0.18));   // finial
  }
  for (const sz of [-1, 1]) gold.push(chamferBox(0.512, 0.012, 0.012, 0.002).translate(0, 0.05 + TH, sz * 0.18));
  for (const sx of [-1, 1]) gold.push(chamferBox(0.012, 0.012, 0.372, 0.002).translate(sx * 0.25, 0.05 + TH, 0));
  // the rod, its collar (original) with a knurled-look ring of beads, and a turned top finial
  gold.push(new THREE.CylinderGeometry(0.008, 0.008, 0.62, 16).translate(0, 0.05 + 0.31, 0));
  gold.push(lathe([[0, 0.05], [0.036, 0.05], [0.036, 0.056], [0.031, 0.062], [0.03, 0.066], [0.014, 0.07], [0.0085, 0.076], [0, 0.076]], 32));
  gold.push(lathe([[0, 0.67], [0.0085, 0.67], [0.012, 0.675], [0.012, 0.68], [0.009, 0.684], [0.011, 0.69], [0.006, 0.698], [0, 0.7]], 16));
  // slotted screws on the base's front and back faces
  if (!lite) for (const sz of [-1, 1]) for (const sx of [-1, 1]) gold.push(screwGeo(0.0045, { seg: 10 }).rotateX(sz * Math.PI / 2).translate(sx * 0.235, 0.018, sz * 0.2));
  return { gold: mergeGeometries(gold.map(prep)), dark: mergeGeometries(dark.map(prep)) };
}
// box with chamfered vertical and horizontal edges (an extruded chamfered rectangle, bevelled ends)
export function chamferBox(w, h, d, c) {
  const s = new THREE.Shape(), x = w / 2, z = d / 2;
  s.moveTo(-x + c, -z); s.lineTo(x - c, -z); s.lineTo(x, -z + c); s.lineTo(x, z - c); s.lineTo(x - c, z); s.lineTo(-x + c, z); s.lineTo(-x, z - c); s.lineTo(-x, -z + c); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(1e-4, h - 2 * c * 0.7), bevelEnabled: true, bevelThickness: c * 0.7, bevelSize: c * 0.5, bevelOffset: -c * 0.5, bevelSegments: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, -h / 2 + c * 0.7, 0);
  // uv: world-ish planar so the brushed map has a consistent scale
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + p.getZ(i)) * 2, p.getY(i) * 2);
  return g;
}

// gold: brushed, calm surface detail (no grime blotches on a show piece)
export function goldMaterials() {
  const br = brushedMaps(12);
  const mk = (color, rough) => {
    const m = new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: rough, roughnessMap: br.r, normalMap: br.n, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.1 });
    m.userData.detail = { grime: 0.03, albedo: 0.04, scratch: 0.25, rough: 0.35, scale: 5 };
    return m;
  };
  return { goldMat: mk('#f0c46a', 0.26), goldSatin: mk('#e5b862', 0.4) };
}
// glass with faint fingerprints / smudges in its roughness
export function smudgeRoughness() {
  return greyTex(256, 256, (u, v) => 0.04 + Math.max(0, tnoise(u, v, 5, 5, 61) - 0.25) * 0.28 + Math.max(0, tnoise(u, v, 22, 22, 62) - 0.55) * 0.18);
}
// turned rosewood beads (grain round the bead), lacquered
export function beadMaterial() {
  const w = woodMaps({ seed: 17, base: [128, 44, 22], rings: 9, figure: 0.6, W: 512, H: 128 });
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: w.map, normalMap: w.n, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.32, roughnessMap: w.r, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.07, sheen: 0.15, sheenColor: new THREE.Color('#ffb070'), envMapIntensity: 1.3 });
  m.userData.detail = { grime: 0.04, albedo: 0.05, scale: 6 };
  return m;
}
export { speckleMaps, uvScale, place, field, greyTex };
