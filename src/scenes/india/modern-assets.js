// THE MODERN MIND — build-time assets for close inspection (Explore 3D).
//   · the slate: a quarter-sawn oak frame with a rounded moulding, corner dowels and brass corner plates,
//     a plywood back with battens and hanging rings, a lipped chalk trough with chalk dust, worn chalk sticks
//     and a felt board eraser; the slate itself gets a fine cleft-stone relief
//   · the optical bench: a dovetail rail with an engraved scale strip and brass end caps, levelling feet,
//     rail riders with knurled clamp screws, post holders with lock screws, a turned filter cell, a retort
//     rod with bosshead and three-prong clamp on the flask's neck, a cork stopper, a finned beam dump
//   · the condensate platform: a knurled band, a bolt circle, a flanged column on a base plate with feet
// All parts are built in world coordinates from the scene's own anchors (see modern.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tnoise, field, normalTex, greyTex, colorTex, brushedMaps, knurlMaps, speckleMaps, woodMaps, Parts, screwGeo, hexGeo, knobGeo, lathe, uvScale, metalMat, prep } from './language-assets.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';

const TAU = Math.PI * 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------------------------------- materials
export function labMaterials() {
  const anodMaps = speckleMaps(21, 2.5);
  const anod = new THREE.MeshPhysicalMaterial({ color: '#1a1d22', roughness: 0.4, roughnessMap: anodMaps.r, normalMap: anodMaps.n, normalScale: new THREE.Vector2(0.35, 0.35), metalness: 0.85, envMapIntensity: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.35 });
  anod.userData.detail = { grime: 0.04, albedo: 0.04, scratch: 0.35, rough: 0.4, scale: 4 };
  const steel = metalMat('#b9c1cc', { rough: 0.25, maps: brushedMaps(22), nScale: 0.35 });
  const brass = metalMat('#c99a4a', { rough: 0.28, maps: brushedMaps(23), nScale: 0.3 });
  const kn = knurlMaps(40, 5);
  const knurlSteel = new THREE.MeshPhysicalMaterial({ color: '#b9c1cc', metalness: 1, roughness: 0.35, roughnessMap: kn.r, normalMap: kn.n, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.0 });
  knurlSteel.userData.detail = { grime: 0.05, scratch: 0.2, scale: 4 };
  const knurlBlack = knurlSteel.clone(); knurlBlack.color.set('#202328'); knurlBlack.metalness = 0.85; knurlBlack.roughness = 0.6; knurlBlack.envMapIntensity = 0.5;
  const cork = (() => {
    const S = 256, H = field(S, S, (u, v) => Math.max(0, tnoise(u, v, 40, 40, 31) - 0.2) * -1 + tnoise(u, v, 90, 90, 32) * 0.3);
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', map: colorTex(S, S, (u, v) => { const l = 0.85 + 0.2 * tnoise(u, v, 30, 30, 33) - Math.max(0, tnoise(u, v, 40, 40, 31) - 0.3) * 0.6; return [176 * l, 128 * l, 82 * l]; }), normalMap: normalTex(H, S, S, 3), roughness: 0.9 });
    return m;
  })();
  return { anod, steel, brass, knurlSteel, knurlBlack, cork };
}

// ---------------------------------------------------------------------------------------------- the slate
// Slate relief: fine cleavage ripples running across, very low amplitude. Tiled (repeat set by caller).
export function slateRelief() {
  const W = 512, Hh = 256;
  const H = field(W, Hh, (u, v) => tnoise(u, v, 12, 30, 41) * 0.3 + tnoise(u, v, 40, 80, 42) * 0.35 + tnoise(u, v, 120, 120, 43) * 0.25);
  return { n: normalTex(H, W, Hh, 1.2), r: greyTex(W, Hh, (u, v) => 0.82 + 0.1 * tnoise(u, v, 4, 3, 44) + 0.06 * tnoise(u, v, 60, 60, 45)) };
}

// Oak frame + back + hanging + trough. SC: slate centre, SW/SH: slate size, fw: frame width, depth 0.13.
export function buildSlateFrame({ SC, SW, SH, fw = 0.09, lite = false, mats }) {
  const oakW = woodMaps({ seed: 31, base: [74, 50, 32], rings: 34, figure: 0.8 });
  const oak = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: oakW.map, normalMap: oakW.n, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.55, roughnessMap: oakW.r, metalness: 0, envMapIntensity: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.45 });
  oak.userData.detail = { grime: 0.08, albedo: 0.06, scratch: 0.1, scale: 3 };
  const plyW = woodMaps({ seed: 32, base: [58, 42, 30], rings: 20, figure: 0.5 });
  const ply = new THREE.MeshStandardMaterial({ color: '#ffffff', map: plyW.map, normalMap: plyW.n, roughness: 0.8 });
  const P = new Parts();
  const fz = SC.z + 0.01, D = 0.13;
  // a frame member with a rounded front moulding and an inner rebate step (profile in local y/z, run along x)
  const member = (len) => {
    const s = new THREE.Shape();
    const w = fw, d = D, r = 0.022;
    s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -d / 2); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    s.lineTo(-w / 2 + 0.03, d / 2); s.quadraticCurveTo(-w / 2 + 0.012, d / 2, -w / 2 + 0.012, d / 2 - 0.016);   // inner bead
    s.lineTo(-w / 2, d / 2 - 0.022); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: lite ? 2 : 5 });
    g.translate(0, 0, -len / 2);       // shape in xy (x across the member, y = depth), run along z
    // uv along the run for grain
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.25 + 0.5, (p.getX(i) + p.getY(i)) * 1.5);
    return g;
  };
  // each member: profile x across (inner side at -x), profile y = depth (front +), run along z; rotateX(π/2)
  // turns depth → +z and the run → y (a right-hand member), then a turn about z sets it in place
  const W2 = SW / 2 + fw / 2, H2 = SH / 2 + fw / 2;
  const mk = (len, ang, x, y) => member(len).rotateX(Math.PI / 2).rotateZ(ang).translate(x, y, fz);
  P.add(oak, mk(SW + fw * 2, Math.PI / 2, SC.x, SC.y + H2));        // top: run along x, inner side (-x local) → -y
  P.add(oak, mk(SW + fw * 2, -Math.PI / 2, SC.x, SC.y - H2));       // bottom
  P.add(oak, mk(SH, Math.PI, SC.x - W2, SC.y));                     // left: inner side → +x
  P.add(oak, mk(SH, 0, SC.x + W2, SC.y));                           // right
  // corner dowels and small brass corner plates on the front
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = SC.x + sx * W2, cy = SC.y + sy * H2;
    if (!lite) for (const k of [-0.022, 0.022]) P.add(oak, new THREE.CylinderGeometry(0.008, 0.008, 0.004, 10).rotateZ(Math.PI / 2).translate(cx + sx * 0.046, cy + k, fz));
    const plate = new THREE.Shape(); const L = 0.07, t = 0.022;
    const qx = -sx, qy = -sy;   // the L points inward from the outer corner (built signed, so no mirrored winding)
    plate.moveTo(0, 0); plate.lineTo(qx * L, 0); plate.lineTo(qx * L, qy * t); plate.lineTo(qx * t, qy * t); plate.lineTo(qx * t, qy * L); plate.lineTo(0, qy * L); plate.closePath();
    const pg = new THREE.ExtrudeGeometry(plate, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0008, bevelSize: 0.0008, bevelSegments: 1 });
    pg.translate(cx + sx * fw / 2, cy + sy * fw / 2, fz + D / 2 + 0.0005);
    P.add(mats.brass, pg);
    if (!lite) for (const [ox, oy] of [[0.052, 0.011], [0.011, 0.052], [0.011, 0.011]]) P.add(mats.brass, screwGeo(0.0045, { seg: 10 }).rotateX(Math.PI / 2).translate(cx + sx * (fw / 2 - ox), cy + sy * (fw / 2 - oy), fz + D / 2 + 0.002));
  }
  // plywood back panel with battens, two hanging rings with a wire to a picture rail above
  const backZ = fz - D / 2 - 0.006;
  P.add(ply, uvScale(new THREE.BoxGeometry(SW + fw * 2 - 0.02, SH + fw * 2 - 0.02, 0.012), 3, 2).translate(SC.x, SC.y, backZ));
  for (const y of [-1.1, 1.1]) P.add(ply, new THREE.BoxGeometry(SW + fw * 2 - 0.3, 0.12, 0.03).translate(SC.x, SC.y + y, backZ - 0.021));
  for (const sx of [-1, 1]) {
    const x = SC.x + sx * (SW / 2 - 0.5), y = SC.y + 1.1;
    P.add(mats.brass, new THREE.TorusGeometry(0.03, 0.006, 8, 20).translate(x, y + 0.09, backZ - 0.04));
    P.add(mats.brass, new THREE.BoxGeometry(0.05, 0.03, 0.006).translate(x, y + 0.06, backZ - 0.037));
    const top = V(x * 0.5 + SC.x * 0.5, SC.y + SH / 2 + 1.4, backZ - 0.04);
    const a = V(x, y + 0.12, backZ - 0.04), len = a.distanceTo(top);
    const wire = new THREE.CylinderGeometry(0.0025, 0.0025, len, 6);
    wire.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), top.clone().sub(a).normalize())));
    wire.translate((a.x + top.x) / 2, (a.y + top.y) / 2, (a.z + top.z) / 2);
    P.add(mats.steel, wire);
  }
  return { group: P.build(), oak };
}

// The chalk trough under the slate: a lipped profile, a dusting of chalk in it, worn sticks and an eraser.
export function buildTrough({ x, y, z, len, oak, lite = false }) {
  const P = new Parts();
  const s = new THREE.Shape();   // profile in (z, y): back against the frame at z = -0.08, lip at the front
  s.moveTo(-0.08, -0.03); s.lineTo(0.08, -0.03); s.lineTo(0.085, 0.0); s.quadraticCurveTo(0.085, 0.022, 0.07, 0.022); s.lineTo(0.06, 0.022); s.lineTo(0.06, 0.006);
  s.lineTo(-0.06, 0.006); s.lineTo(-0.065, 0.015); s.lineTo(-0.08, 0.015); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.002, bevelSegments: 1, curveSegments: lite ? 2 : 4 });
  g.translate(0, 0, -len / 2); g.rotateY(-Math.PI / 2);   // run along x; profile x → +z (lip at the front)
  { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.25 + 0.5, (p.getY(i) + p.getZ(i)) * 3); }
  P.add(oak, g.translate(x, y, z));
  // brackets under the trough
  for (const bx of [-len * 0.35, len * 0.35]) P.add(oak, new THREE.BoxGeometry(0.03, 0.08, 0.1).translate(x + bx, y - 0.07, z - 0.02));
  const group = P.build();
  // chalk dust in the trough: a soft white haze, denser where sticks have rolled
  const dust = (() => {
    const W = 1024, H = 64, c = mkCanvas(W, H), gg = c.getContext('2d'), R = rng(81);
    gg.clearRect(0, 0, W, H);
    for (let i = 0; i < 900; i++) { const px = R() * W, py = H * (0.2 + R() * 0.6), r = 1 + R() * 6; gg.fillStyle = `rgba(235,235,230,${0.05 + R() * 0.12})`; gg.beginPath(); gg.arc(px, py, r, 0, TAU); gg.fill(); }
    for (let i = 0; i < 12; i++) { gg.fillStyle = 'rgba(240,240,235,0.08)'; const px = R() * W; gg.fillRect(px, H * 0.2, 40 + R() * 120, H * 0.6); }
    return toTexture(c);
  })();
  const dm = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.02, 0.11), new THREE.MeshStandardMaterial({ map: dust, transparent: true, depthWrite: false, roughness: 1, color: '#ffffff' }));
  dm.material.userData.noDetail = true;
  dm.rotation.x = -Math.PI / 2; dm.position.set(x, y + 0.0075, z + 0.0); group.add(dm);
  return group;
}
// a worn stick of chalk lying along +x: one end rounded by writing, the other broken square
export function chalkStickGeo(len, r) {
  const pts = [[0, -len / 2], [r * 0.96, -len / 2], [r, -len / 2 + 0.002], [r, len / 2 - r * 1.2], [r * 0.85, len / 2 - r * 0.5], [r * 0.5, len / 2 - r * 0.1], [0, len / 2]];
  const g = lathe(pts, 14); g.rotateZ(-Math.PI / 2);
  return g;
}
export function chalkMaterial() {
  const S = 128, H = field(S, S, (u, v) => tnoise(u, v, 30, 30, 51) * 0.6 + tnoise(u, v, 80, 80, 52) * 0.4);
  const m = new THREE.MeshStandardMaterial({ color: '#e8e6e0', roughness: 0.97, normalMap: normalTex(H, S, S, 1.5) });
  m.userData.detail = { grime: 0.05, scale: 6 };
  return m;
}
// felt board eraser: a beech block with finger grooves on a grey felt pad
export function buildEraser(oak) {
  const P = new Parts();
  const felt = new THREE.MeshStandardMaterial({ color: '#6c6a66', roughness: 1, normalMap: speckleMaps(55, 3).n, normalScale: new THREE.Vector2(0.8, 0.8) });
  P.add(felt, new THREE.BoxGeometry(0.15, 0.012, 0.055).translate(0, 0.006, 0));
  const s = new THREE.Shape(); s.moveTo(-0.075, 0); s.lineTo(0.075, 0); s.lineTo(0.075, 0.018); s.quadraticCurveTo(0.06, 0.03, 0.03, 0.026); s.quadraticCurveTo(0, 0.02, -0.03, 0.026); s.quadraticCurveTo(-0.06, 0.03, -0.075, 0.018); s.closePath();
  const b = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 6 });
  b.translate(0, 0.012, -0.025);
  P.add(oak, b);
  return P.build();
}

// ---------------------------------------------------------------------------------------------- the bench
// Dovetail rail (length L along x, centred at cx, top at railTop), legs at legX down to floorY.
export function buildBench({ cx, railY, z, L, legX, floorY, mats, lite = false }) {
  const P = new Parts();
  const { anod, steel, brass, knurlSteel } = mats;
  // profile (z, y): a wide foot, a waist and a dovetail top (centred on railY, height 0.06 like the original)
  const s = new THREE.Shape();
  const h = 0.06, b = 0.07, t = 0.05, wst = 0.032;
  s.moveTo(-b, -h / 2); s.lineTo(b, -h / 2); s.lineTo(b, -h / 2 + 0.012); s.lineTo(wst, -h / 2 + 0.018); s.lineTo(wst, h / 2 - 0.022);
  s.lineTo(t, h / 2 - 0.006); s.lineTo(t - 0.004, h / 2); s.lineTo(-t + 0.004, h / 2); s.lineTo(-t, h / 2 - 0.006); s.lineTo(-wst, h / 2 - 0.022);
  s.lineTo(-wst, -h / 2 + 0.018); s.lineTo(-b, -h / 2 + 0.012); s.closePath();
  const rail = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false });
  rail.translate(0, 0, -L / 2); rail.rotateY(Math.PI / 2); rail.translate(cx, railY, z);
  { const p = rail.attributes.position, uv = rail.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) * 0.5, (p.getY(i) + p.getZ(i)) * 4); }
  P.add(anod, rail);
  // groove in the top (steel insert, as the original)
  P.add(steel, new THREE.BoxGeometry(L, 0.006, 0.03).translate(cx, railY + h / 2 + 0.001, z));
  // brass end caps with four screws
  for (const sx of [-1, 1]) {
    const ex = cx + sx * (L / 2 + 0.004);
    P.add(brass, new THREE.BoxGeometry(0.008, h + 0.006, 0.15).translate(ex, railY, z));
    if (!lite) for (const [dy, dz] of [[-0.018, -0.05], [-0.018, 0.05], [0.018, -0.035], [0.018, 0.035]]) P.add(steel, screwGeo(0.0055, { seg: 10 }).rotateZ(-sx * Math.PI / 2).translate(ex + sx * 0.004, railY + dy, z + dz));
  }
  // legs: the original tapered columns with a collar under the rail, a levelling stud, nut and pad
  for (const lx of legX) {
    const top = railY - h / 2, hh = top - floorY - 0.06;
    P.add(anod, uvScale(new THREE.CylinderGeometry(0.03, 0.05, hh, 24), 1, 4).translate(lx, floorY + 0.06 + hh / 2, z));
    P.add(anod, new THREE.BoxGeometry(0.14, 0.012, 0.15).translate(lx, top - 0.006, z));     // saddle plate
    if (!lite) for (const [dx, dz] of [[-0.055, -0.06], [0.055, -0.06], [-0.055, 0.06], [0.055, 0.06]]) P.add(steel, hexGeo(0.006, 0.005).translate(lx + dx, top - 0.017, z + dz).rotateX(0));
    P.add(steel, new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12).translate(lx, floorY + 0.045, z));    // stud
    P.add(steel, hexGeo(0.022, 0.012).translate(lx, floorY + 0.03, z));                                 // lock nut
    P.add(anod, lathe([[0, 0], [0.17, 0], [0.18, 0.006], [0.175, 0.02], [0.16, 0.026], [0.05, 0.03], [0, 0.03]], 40).translate(lx, floorY, z));   // pad foot
  }
  return P.build();
}
// A rail rider at x carrying a post up to topY: block, knurled clamp knob, post holder with lock screw, post.
export function rider(P, { x, railY, z, topY, mats, lite = false }) {
  const { anod, steel, knurlSteel, knurlBlack } = mats;
  const by = railY + 0.06;
  P.add(anod, new THREE.BoxGeometry(0.16, 0.05, 0.18).translate(x, by, z));
  P.add(anod, new THREE.BoxGeometry(0.17, 0.012, 0.19).translate(x, by + 0.03, z));
  // clamp screw on the front: a knurled knob with a stem into the block
  P.add(knurlSteel, knobGeo(0.024, 0.026, { seg: 28 }).rotateX(Math.PI / 2).translate(x, by - 0.004, z + 0.09 + 0.026));
  P.add(steel, new THREE.CylinderGeometry(0.006, 0.006, 0.02, 10).rotateX(Math.PI / 2).translate(x, by - 0.004, z + 0.1));
  // post holder: a tube with a flange, and a small knurled lock screw on its side
  const ph = Math.min(0.12, Math.max(0.03, (topY - by) * 0.45));
  P.add(anod, lathe([[0.018, by + 0.036], [0.032, by + 0.036], [0.032, by + 0.044], [0.022, by + 0.05], [0.022, by + 0.036 + ph], [0.018, by + 0.036 + ph]], 24).translate(x, 0, z));
  P.add(knurlBlack, knobGeo(0.009, 0.012, { seg: 16, stem: 0.003 }).rotateZ(-Math.PI / 2).translate(x + 0.022 + 0.012, by + 0.036 + ph * 0.6, z));
  // the post (as the original: r 0.014 from the rider to topY)
  P.add(steel, uvScale(new THREE.CylinderGeometry(0.014, 0.014, topY - by - 0.03, 16), 1, 6).translate(x, (topY + by + 0.03) / 2, z));
}
// Turned filter cell around a glass disc (the disc itself stays the scene's own animated material).
export function filterCell(mats, { lite = false } = {}) {
  const P = new Parts();
  const seg = lite ? 32 : 64;
  // cell: profile in (r, y) with y along the beam (later rotated to x)
  P.add(mats.anod, uvScale(lathe([[0.145, -0.022], [0.172, -0.022], [0.18, -0.016], [0.18, 0.016], [0.172, 0.022], [0.15, 0.022], [0.15, 0.012], [0.145, 0.012]], seg), 1, 10));
  // knurled grip band
  P.add(mats.knurlBlack, uvScale(new THREE.CylinderGeometry(0.183, 0.183, 0.022, seg, 1, true), 2, 1));
  // retaining ring (front) with two spanner slots
  P.add(mats.anod, lathe([[0.132, 0.012], [0.15, 0.012], [0.15, 0.018], [0.132, 0.018]], seg));
  if (!lite) for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.5; P.add(mats.steel, screwGeo(0.006, { seg: 10 }).translate(Math.cos(a) * 0.164, 0.022, Math.sin(a) * 0.164)); }
  // a clamp boss underneath where the stem meets it
  P.add(mats.anod, new THREE.BoxGeometry(0.04, 0.04, 0.03).translate(0, 0, -0.18).rotateX(0));
  const g = P.build();
  g.rotation.z = -Math.PI / 2;        // y (cell axis) → +x (beam direction)
  return g;
}
// glass disc with a bevelled edge (axis y)
export function bevelDiscGeo(r, t, seg = 48) {
  const b = t * 0.35;
  return lathe([[0, -t / 2], [r - b, -t / 2], [r, -t / 2 + b], [r, t / 2 - b], [r - b, t / 2], [0, t / 2]], seg);
}
// retort rod + bosshead + three-prong clamp gripping the flask neck at (cx, neckY, cz); rod stands at rodX/rodZ
export function neckClamp(P, { cx, neckY, cz, neckR, rodX, rodZ, baseY, mats, lite = false }) {
  const { steel, knurlSteel, cork, anod } = mats;
  P.add(steel, uvScale(new THREE.CylinderGeometry(0.011, 0.011, neckY + 0.12 - baseY, 16), 1, 8).translate(rodX, (neckY + 0.12 + baseY) / 2, rodZ));
  P.add(steel, lathe([[0, 0], [0.013, 0], [0.013, 0.006], [0.008, 0.012], [0, 0.012]], 16).translate(rodX, neckY + 0.12, rodZ));
  // bosshead: a cast block with two knurled screws
  P.add(anod, new THREE.BoxGeometry(0.04, 0.05, 0.04).translate(rodX, neckY, rodZ));
  P.add(knurlSteel, knobGeo(0.012, 0.014, { seg: 16, stem: 0.004 }).rotateZ(-Math.PI / 2).translate(rodX + 0.02 + 0.014, neckY + 0.012, rodZ));
  P.add(knurlSteel, knobGeo(0.012, 0.014, { seg: 16, stem: 0.004 }).rotateX(-Math.PI / 2).translate(rodX, neckY - 0.012, rodZ - 0.02 - 0.014));
  // clamp arm toward the neck
  const toward = V(cx - rodX, 0, cz - rodZ), armLen = toward.length() - neckR - 0.02; toward.normalize();
  const arm = new THREE.CylinderGeometry(0.007, 0.007, armLen, 10); arm.rotateZ(Math.PI / 2);
  arm.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.atan2(toward.z, toward.x)));
  arm.translate(rodX + toward.x * armLen / 2, neckY - 0.012, rodZ + toward.z * armLen / 2);
  P.add(steel, arm);
  // three prongs round the neck with cork pads
  for (let k = 0; k < 3; k++) {
    const a = Math.atan2(-toward.z, -toward.x) + Math.PI + (k - 1) * 2.1;
    const px = cx + Math.cos(a) * (neckR + 0.012), pz = cz + Math.sin(a) * (neckR + 0.012);
    const from = V(cx - toward.x * (neckR + 0.03), neckY - 0.012, cz - toward.z * (neckR + 0.03));
    const to = V(px, neckY - 0.012, pz), len = from.distanceTo(to);
    if (len > 0.004) {
      const pr = new THREE.CylinderGeometry(0.0045, 0.0045, len, 8);
      pr.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize())));
      pr.translate((from.x + to.x) / 2, from.y, (from.z + to.z) / 2);
      P.add(steel, pr);
    }
    P.add(cork, new THREE.BoxGeometry(0.008, 0.03, 0.022).rotateY(-a).translate(cx + Math.cos(a) * (neckR + 0.004), neckY - 0.012, cz + Math.sin(a) * (neckR + 0.004)));
  }
}
// beam dump: a black anodised can with cooling fins and a conical entrance (axis +x, centred)
export function beamDump(mats, { lite = false } = {}) {
  const P = new Parts(); const seg = lite ? 24 : 40;
  P.add(mats.anod, lathe([[0.0, -0.06], [0.058, -0.06], [0.06, -0.056], [0.06, 0.056], [0.056, 0.06], [0.03, 0.06], [0.012, 0.03], [0.006, 0.0], [0.0, 0.0]], seg));
  for (let k = 0; k < (lite ? 4 : 7); k++) { const y = -0.05 + k * 0.016; P.add(mats.anod, lathe([[0.06, y], [0.078, y + 0.002], [0.078, y + 0.006], [0.06, y + 0.008]], seg)); }
  P.add(mats.steel, screwGeo(0.007, { seg: 10 }).rotateX(Math.PI).translate(0, -0.06, 0));
  const g = P.build(); g.rotation.z = Math.PI / 2;   // the entrance (+y) faces -x, toward the oncoming beam
  return g;
}
// cork stopper for the flask neck (axis y, bottom at 0)
export function stopperGeo(r) { return lathe([[0, 0], [r * 0.86, 0], [r * 0.98, 0.05], [r * 1.12, 0.07], [r * 1.14, 0.074], [r * 1.1, 0.078], [0, 0.078]], 24); }

// ------------------------------------------------------------------------------------- the condensate rig
export function buildBecRig({ CB, floorY, mats, lite = false }) {
  const P = new Parts(); const { anod, steel, knurlBlack } = mats;
  // knurled band round the platform's edge (platform: r 1.85 → 1.9, 0.06 thick, centred at CB.y - 0.03)
  P.add(knurlBlack, uvScale(new THREE.CylinderGeometry(1.905, 1.905, 0.024, lite ? 96 : 192, 1, true), 12, 1).translate(CB.x, CB.y - 0.03, CB.z));
  // bolt circle (socket-head cap screws) on the top near the rim
  if (!lite) {
    const head = mergeGeometries([prep(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 16)), prep(new THREE.CylinderGeometry(0.0075, 0.0075, 0.0125, 6).translate(0, 0.0005, 0))]);
    for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; P.add(steel, head.clone().translate(CB.x + Math.cos(a) * 1.79, CB.y + 0.006, CB.z + Math.sin(a) * 1.79)); }
  }
  // column flange under the platform, a collar mid-way, and a base plate with feet
  const colTop = CB.y - 0.06;
  P.add(anod, lathe([[0, colTop], [0.4, colTop], [0.4, colTop - 0.03], [0.26, colTop - 0.05], [0, colTop - 0.05]], 64).translate(CB.x, 0, CB.z));
  if (!lite) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; P.add(steel, hexGeo(0.016, 0.012).rotateX(Math.PI).translate(CB.x + Math.cos(a) * 0.34, colTop - 0.03, CB.z + Math.sin(a) * 0.34)); }
  P.add(steel, uvScale(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 64, 1, true), 4, 1).translate(CB.x, (CB.y + floorY) / 2, CB.z));
  P.add(anod, lathe([[0, floorY], [0.62, floorY], [0.63, floorY + 0.01], [0.62, floorY + 0.03], [0.4, floorY + 0.045], [0, floorY + 0.045]], 64).translate(CB.x, 0, CB.z));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.5; P.add(knurlBlack, knobGeo(0.05, 0.03, { seg: 28 }).translate(CB.x + Math.cos(a) * 0.55, floorY - 0.004, CB.z + Math.sin(a) * 0.55)); }
  return P.build();
}
