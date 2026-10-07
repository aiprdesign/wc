// INVENTION — the exhibits of the Western film's gallery, modelled to hold up in Explore 3D / AR. Every
// builder works in metres in the local frame of its plinth top (origin at the top centre, +x along the
// gallery, +z toward the visitor) and returns { group, anchors (local points: call-outs, focus), …the
// parts inventions.js animates }. Parts are collected per material and merged: one mesh per material.
//   daguerre     a Giroux-type sliding-box daguerreotype camera (1839) with its brass Chevalier lens and
//                swung-aside lens cover; an open leather case whose silvered plate develops Niépce's rooftops
//   bulb         a carbon-filament lamp (hairpin filament, platinum leads, glass stem, exhaust tip, screw
//                base) in a brass key socket on a turned mahogany pedestal
//   motorwagen   the Benz Patent-Motorwagen at 1:4 — tubular frame, three wire wheels on solid tyres, the
//                rear single-cylinder engine with its big horizontal flywheel, brass cooling tank and
//                carburettor, belt and chain drive, bench seat, tiller steering
//   cinema       the Lumière cinématographe on its baseboard with the lamp house behind it, hand crank, reel,
//                the beam and a small screen on which a train arrives
//   tv           a walnut table television: curved CRT behind a gilt mask, speaker cloth, knobs, rabbit ears,
//                ventilated back and the tube's neck housing
//   laser        Maiman's ruby laser (Hughes, 1960) at 2.5×, cut away: polished aluminium cylinder, helical
//                xenon flash lamp, silvered ruby rod; its power supply, the beam and a target
//   gps          a GPS satellite: gold-foiled bus, twelve-helix L-band array, crosslink antenna, two solar
//                wings on yokes, on a chrome stand (the orbit rings are drawn by the scene)
//   phone        a generic touchscreen smartphone on an acrylic stand, and a 1994 touchscreen phone beside it
//   mrna         a vaccine vial and syringe, and a lipid nanoparticle cut open on its mRNA, with the strand
import * as THREE from 'three';
import { rng, TAU } from '../lib/math.js';
import { dialTexture } from './india/inventors-assets.js';
import {
  V3, bake, merge, lathe, box, rbox, cyl, rod, tubeAlong, curve, helix, knurl, rrShape,
  rooftopTexture, testCardTexture, phoneScreens, simonScreenTexture, vialLabelTexture, syringeScaleTexture,
} from './inventions-assets.js';

const PI = Math.PI;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const Z = V3(0, 0, 1);

// collect geometry per material key, build one mesh per material at the end
function parts() {
  const by = new Map();
  return {
    add(key, ...geos) { if (!by.has(key)) by.set(key, []); by.get(key).push(...geos.filter(Boolean)); },
    build(parent, M, { cast = true } = {}) {
      const out = {};
      for (const [k, list] of by) {
        if (!list.length) continue;
        if (!M[k]) throw new Error(`inventions: no material ${k}`);
        const m = new THREE.Mesh(merge(list), M[k]);
        m.castShadow = cast && !M[k].transparent; m.receiveShadow = true; m.name = k;
        parent.add(m); out[k] = m;
      }
      return out;
    },
  };
}
// a box oriented along a direction (centre c, length along dir, cross-section w × h; up hint)
function beam(c, dir, len, w, h, up = V3(0, 1, 0)) {
  const g = new THREE.BoxGeometry(len, h, w), x = dir.clone().normalize(), zz = new THREE.Vector3().crossVectors(x, up).normalize(), y = new THREE.Vector3().crossVectors(zz, x);
  _m.makeBasis(x, y, zz).setPosition(c);
  return g.applyMatrix4(_m);
}
// a flat strip along a polyline: width across `side` (a vector or a function of the point index)
function strip(pts, width, side, closed = false) {
  const pos = [], uv = [], idx = [], n = pts.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i) acc += pts[i].distanceTo(pts[i - 1]);
    const s = (typeof side === 'function' ? side(i) : side).clone().normalize().multiplyScalar(width / 2);
    pos.push(pts[i].x - s.x, pts[i].y - s.y, pts[i].z - s.z, pts[i].x + s.x, pts[i].y + s.y, pts[i].z + s.z);
    uv.push(acc, 0, acc, 1);
  }
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// closed belt / chain path round two circles in the x-y plane (centres a, b; radii ra, rb), at depth z
function beltPath(a, ra, b, rb, z, n = 120) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), base = Math.atan2(b.y - a.y, b.x - a.x), phi = Math.acos((ra - rb) / d);
  const pts = [];
  const arc = (c, r, a0, a1, k) => { for (let i = 0; i <= k; i++) { const t = a0 + (a1 - a0) * i / k; pts.push(V3(c.x + Math.cos(t) * r, c.y + Math.sin(t) * r, z)); } };
  const ka = Math.round(n * 0.35), kb = Math.round(n * 0.15);
  arc(a, ra, base + phi, base + TAU - phi, ka);   // round the big pulley (far side)
  arc(b, rb, base - phi, base + phi, kb);         // round the small one
  // even resample by arc length
  const out = [], L = []; let acc = 0;
  for (let i = 0; i < pts.length; i++) { if (i) acc += pts[i].distanceTo(pts[i - 1]); L.push(acc); }
  const total = acc + pts[pts.length - 1].distanceTo(pts[0]);
  for (let k = 0; k < n; k++) {
    const s = total * k / n; let i = 0; while (i < L.length - 1 && L[i + 1] < s) i++;
    const p0 = pts[i], p1 = pts[(i + 1) % pts.length], seg = (i + 1 < L.length ? L[i + 1] : total) - L[i];
    out.push(p0.clone().lerp(p1, seg > 0 ? (s - L[i]) / seg : 0));
  }
  return { pts: out, length: total };
}
// a screw thread: a cylinder whose radius follows a helix (axis +y, from y = 0 to h)
function thread(r, h, pitch, depth, segR = 28, segH = 40) {
  const g = new THREE.CylinderGeometry(r, r, h, segR, segH, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + h / 2, z = p.getZ(i), th = Math.atan2(z, x);
    const k = 1 - depth / r * (0.5 + 0.5 * Math.cos(TAU * (y / pitch - th / TAU)));
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}
// sphere with a cap cut away (faces whose centroid points within acos(cosLim) of dir are dropped)
function cutSphere(r, wSeg, hSeg, dir, cosLim) {
  const g = new THREE.SphereGeometry(r, wSeg, hSeg).toNonIndexed(), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  const keepP = [], keepN = [], keepU = [], c = V3();
  for (let i = 0; i < p.count; i += 3) {
    c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.x += p.getX(i + k), c.y += p.getY(i + k), c.z += p.getZ(i + k);
    if (c.normalize().dot(dir) > cosLim) continue;
    for (let k = 0; k < 3; k++) { keepP.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k)); keepN.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k)); keepU.push(uv.getX(i + k), uv.getY(i + k)); }
  }
  const o = new THREE.BufferGeometry();
  o.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(keepN, 3)); o.setAttribute('uv', new THREE.Float32BufferAttribute(keepU, 2));
  return o;
}
// screws / rivets: small domed heads on a face (normal n)
function screwHead(p, n, r = 0.002) { const g = new THREE.SphereGeometry(r, 8, 4, 0, TAU, 0, PI / 2); _q.setFromUnitVectors(V3(0, 1, 0), n); _m.compose(p, _q, _s); return g.applyMatrix4(_m); }
const lensGlassMat = () => new THREE.MeshStandardMaterial({ color: '#06090c', metalness: 0, roughness: 0.03, envMapIntensity: 2.2 });

// ================================================================================== 1 · PHOTOGRAPHY
export function buildDaguerre(M) {
  const G = new THREE.Group(), P = parts();
  // ---- the camera, optical axis along its local +x
  const cam = new THREE.Group(); cam.position.set(0.03, 0, -0.03); cam.rotation.y = -0.62; G.add(cam);
  const C = parts();
  C.add('walnut', rbox(0.3, 0.012, 0.21, 0.003, [-0.02, 0.006, 0]));                         // baseboard
  for (const z of [-0.08, 0.08]) C.add('walnut', rbox(0.27, 0.01, 0.022, 0.002, [-0.02, 0.017, z]));   // runners
  // front box (x 0 … 0.15) and the rear box sliding in (x −0.14 … 0.02)
  const fy0 = 0.022, FH = 0.165, FW = 0.196, RH = 0.152, RW = 0.182;
  C.add('fruitwood', rbox(0.15, FH, FW, 0.003, [0.075, fy0 + FH / 2, 0]));
  C.add('fruitwood', rbox(0.15, RH, RW, 0.003, [-0.065, fy0 + 0.004 + RH / 2, 0]));
  // the front panel's raised frame, the rear's ground-glass frame
  C.add('walnut', rbox(0.008, FH + 0.008, FW + 0.008, 0.002, [0.152, fy0 + FH / 2, 0]));
  for (const [w, h, y, z] of [[0.006, 0.016, fy0 + 0.004 + RH - 0.008, 0], [0.006, 0.016, fy0 + 0.012, 0], [0.006, RH, fy0 + 0.004 + RH / 2, RW / 2 - 0.008], [0.006, RH, fy0 + 0.004 + RH / 2, -RW / 2 + 0.008]]) C.add('walnut', box(w, h, z ? 0.016 : RW, [-0.142, y, z]));
  C.add('plasticGrey', box(0.002, RH - 0.03, RW - 0.03, [-0.14, fy0 + 0.004 + RH / 2, 0]));
  // finger joints at the box corners (end grain, alternating)
  for (const [x0, w, h, d, y0] of [[0.075, 0.15, FH, FW, fy0], [-0.065, 0.15, RH, RW, fy0 + 0.004]]) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 6; k += 2) C.add('walnut', box(0.006, h / 6, 0.006, [x0 + sx * (w / 2 - 0.0025), y0 + (k + 0.5) * h / 6, sz * (d / 2 - 0.0025)]));
  }
  // the plate holder (dark slide) standing in its slot, a brass knob; the lock screw
  C.add('walnut', rbox(0.012, 0.03, 0.15, 0.002, [-0.1, fy0 + 0.004 + RH + 0.012, 0]));
  C.add('brass', cyl(0.004, 0.004, 0.008, 12, [-0.1, fy0 + RH + 0.034, 0]), bake(new THREE.SphereGeometry(0.0055, 12, 8), [-0.1, fy0 + RH + 0.041, 0]));
  C.add('brass', knurl(0.007, 0.006, 14, [0.03, fy0 + FH * 0.45, FW / 2 + 0.004], [PI / 2, 0, 0]), cyl(0.003, 0.003, 0.012, 8, [0.03, fy0 + FH * 0.45, FW / 2 - 0.002], [PI / 2, 0, 0]));
  C.add('brassDark', rbox(0.05, 0.03, 0.002, 0.001, [0.06, fy0 + FH * 0.7, FW / 2 + 0.001]));       // maker's plate (blank)
  // the lens: flange with four screws, barrel, focusing ring, hood, front element
  const LY = fy0 + FH / 2 + 0.006, LX = 0.156;
  C.add('brass', bake(lathe([[0, 0], [0.042, 0], [0.042, 0.004], [0.034, 0.005], [0.031, 0.008], [0.031, 0.05], [0.0335, 0.052], [0.0335, 0.064], [0.031, 0.066], [0.031, 0.078], [0.0335, 0.08], [0.0335, 0.088], [0.03, 0.088], [0.028, 0.084], [0, 0.084]], 40), [LX, LY, 0], [0, 0, -PI / 2]));
  for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; C.add('brassDark', screwHead(V3(LX + 0.004, LY + Math.cos(a) * 0.037, Math.sin(a) * 0.037), V3(1, 0, 0), 0.0022)); }
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.028, 32), lensGlassMat()); lens.position.set(LX + 0.0845, LY, 0); lens.rotation.y = PI / 2; cam.add(lens);
  // the swung-aside lens cover on its pivot
  C.add('brass', cyl(0.0035, 0.0035, 0.01, 10, [LX + 0.07, LY + 0.04, 0], [0, 0, PI / 2]));
  C.add('brass', box(0.003, 0.03, 0.008, [LX + 0.082, LY + 0.054, 0.012], [0.9, 0, 0]));
  C.add('brass', cyl(0.034, 0.034, 0.003, 32, [LX + 0.084, LY + 0.058, 0.044], [0.9 + PI / 2, 0, PI / 2]));
  C.build(cam, M);
  // ---- the daguerreotype in its open case: the image half propped up, the velvet lid flat in front
  const cs = new THREE.Group(); cs.position.set(-0.17, 0, 0.1); cs.rotation.y = 0.36; G.add(cs);
  const D = parts(), CW = 0.11, CH = 0.088, CT = 0.012, tilt = -0.32;
  const img = new THREE.Group(); img.position.set(0, 0.0, -0.002); img.rotation.x = tilt; cs.add(img);
  D.add('leatherBlack', rbox(CW, CH, CT, 0.004, [0, CH / 2, -CT / 2]));
  D.add('velvet', rbox(CW - 0.012, CH - 0.012, 0.004, 0.002, [0, CH / 2, 0.0005]));
  const mat = new THREE.Shape(); mat.moveTo(-0.046, -0.037); mat.lineTo(0.046, -0.037); mat.lineTo(0.046, 0.037); mat.lineTo(-0.046, 0.037); mat.closePath();
  const hole = new THREE.Path(); hole.absellipse(0, 0, 0.036, 0.029, 0, TAU, true); mat.holes.push(hole);
  const matG = new THREE.ShapeGeometry(mat, 24); bake(matG, [0, CH / 2, 0.0045]);
  D.add('brass', matG);
  for (const [w, h, x, y] of [[0.096, 0.004, 0, CH / 2 + 0.039], [0.096, 0.004, 0, CH / 2 - 0.039], [0.004, 0.082, 0.048, CH / 2], [0.004, 0.082, -0.048, CH / 2]]) D.add('brassDark', box(w, h, 0.003, [x, y, 0.0046]));
  D.build(img, M);
  const dev = { uDev: { value: 0 } };
  const plateM = new THREE.MeshStandardMaterial({ map: rooftopTexture(), metalness: 0.55, roughness: 0.28, envMapIntensity: 1.1, emissive: '#ffffff', emissiveIntensity: 0 });
  plateM.onBeforeCompile = (sh) => {
    sh.uniforms.uDev = dev.uDev;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDev;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb = mix(vec3(0.62, 0.63, 0.65), diffuseColor.rgb, uDev);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = diffuseColor.rgb * 0.22 * uDev;`);
  };
  plateM.customProgramCacheKey = () => 'winv-dag';
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.07), plateM); plate.position.set(0, CH / 2, 0.003); img.add(plate);
  const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.094, 0.078), M.glassClear); cover.position.set(0, CH / 2, 0.0062); img.add(cover);
  // the lid lying open in front, velvet up (its hinge meets the image half's foot)
  const Lp = parts();
  Lp.add('leatherBlack', rbox(CW, CT, CH, 0.004, [0, CT / 2, CH / 2 + 0.004]));
  Lp.add('velvet', rbox(CW - 0.014, 0.006, CH - 0.014, 0.003, [0, CT + 0.001, CH / 2 + 0.004]));
  Lp.add('brassDark', cyl(0.0022, 0.0022, CW * 0.9, 8, [0, 0.004, 0.003], [0, 0, PI / 2]));
  Lp.build(cs, M);
  // anchors (group-local)
  const lensW = V3(LX + 0.09, LY, 0).applyEuler(cam.rotation).add(cam.position);
  const plateW = V3(0, CH / 2, 0).applyEuler(img.rotation).applyEuler(cs.rotation).add(cs.position);
  return { group: G, dev, anchors: { focus: V3(0.04, 0.1, 0.02), lens: lensW, plate: plateW } };
}

// ================================================================================== 2 · ELECTRIC LIGHT
export function buildBulb(M) {
  const G = new THREE.Group(), P = parts();
  // turned mahogany pedestal with a pewter foot ring
  P.add('mahogany', lathe([[0, 0], [0.078, 0], [0.08, 0.004], [0.078, 0.012], [0.07, 0.016], [0.058, 0.022], [0.04, 0.03], [0.026, 0.046], [0.02, 0.07], [0.019, 0.1], [0.024, 0.11], [0.03, 0.116], [0.03, 0.124], [0, 0.124]], 48));
  P.add('pewter', bake(new THREE.TorusGeometry(0.079, 0.0028, 8, 56), [0, 0.008, 0], [PI / 2, 0, 0]));
  // the brass key socket
  const SY = 0.124;
  P.add('brass', lathe([[0, 0], [0.024, 0], [0.025, 0.003], [0.022, 0.006], [0.022, 0.03], [0.0245, 0.032], [0.0245, 0.046], [0.0185, 0.048], [0.0175, 0.044], [0, 0.044]], 40).translate(0, SY, 0));
  P.add('brass', cyl(0.004, 0.004, 0.016, 10, [0.03, SY + 0.024, 0], [0, 0, PI / 2]), rbox(0.006, 0.02, 0.014, 0.002, [0.04, SY + 0.024, 0]));   // the key
  for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.add('brassDark', box(0.0015, 0.016, 0.003, [Math.cos(a) * 0.0222, SY + 0.016, Math.sin(a) * 0.0222], [0, -a, 0])); }
  // the screw base (true helical thread), the plaster collar
  const BY = SY + 0.038;
  P.add('brass', bake(thread(0.0132, 0.026, 0.0042, 0.0012), [0, BY, 0]));
  P.add('cream', lathe([[0.0118, 0], [0.0135, 0.002], [0.014, 0.008], [0.0118, 0.011], [0, 0.011]], 32).translate(0, BY + 0.026, 0));
  // the glass: pear envelope with its exhaust tip, the inner stem; leads and the carbon hairpin
  const GY = BY + 0.035;
  const env = lathe([[0.0105, 0], [0.013, 0.006], [0.02, 0.022], [0.031, 0.045], [0.037, 0.066], [0.0365, 0.084], [0.03, 0.101], [0.017, 0.114], [0.0065, 0.119], [0.0028, 0.124], [0.0016, 0.13], [0.0005, 0.1315]], 44);
  const glass = new THREE.Mesh(bake(env, [0, GY, 0]), M.glassClear); glass.renderOrder = 3; G.add(glass);
  P.add('quartz', lathe([[0.0085, 0], [0.006, 0.01], [0.0035, 0.026], [0.005, 0.034], [0.0035, 0.036], [0, 0.036]], 20).translate(0, GY - 0.002, 0));
  for (const s of [-1, 1]) P.add('nickel', rod(V3(s * 0.0025, GY + 0.026, 0), V3(s * 0.0042, GY + 0.05, 0), 0.00045, 5), cyl(0.0012, 0.0012, 0.004, 8, [s * 0.0044, GY + 0.051, 0]));
  const filC = curve([[-0.0044, GY + 0.052, 0], [-0.0085, GY + 0.066, 0.001], [-0.011, GY + 0.082, 0], [-0.0065, GY + 0.094, -0.001], [0, GY + 0.097, 0], [0.0065, GY + 0.094, 0.001], [0.011, GY + 0.082, 0], [0.0085, GY + 0.066, -0.001], [0.0044, GY + 0.052, 0]]);
  const filM = new THREE.MeshStandardMaterial({ color: '#0d0b0a', roughness: 0.5, metalness: 0, emissive: '#000000' });
  const fil = new THREE.Mesh(tubeAlong(filC, 0.00065, 60, 5), filM); G.add(fil);
  // cloth-covered flex from the socket down the pedestal and off the back edge
  P.add('cloth', tubeAlong(curve([[-0.022, SY + 0.012, -0.004], [-0.034, SY - 0.01, -0.01], [-0.03, 0.05, -0.03], [-0.05, 0.012, -0.06], [-0.06, 0.004, -0.13], [-0.07, 0.004, -0.19]]), 0.0024, 40, 6));
  P.build(G, M);
  return { group: G, filM, anchors: { focus: V3(0, GY + 0.045, 0), filament: V3(0, GY + 0.08, 0), glass: V3(0.03, GY + 0.07, 0), socket: V3(0.03, SY + 0.03, 0) } };
}

// ================================================================================== 3 · AUTOMOBILE
// Modelled at full size (metres, front toward +x, wheels on y = 0) and shown at 1:4.
function wheel(P, R, hubLen, n, at, lite) {
  const g = (geo) => bake(geo, [at.x, at.y, at.z]);
  P.add('tyre', g(new THREE.TorusGeometry(R - 0.024, 0.024, 8, lite ? 40 : 72)));
  P.add('enamel', g(bake(lathe([[R - 0.052, -0.022], [R - 0.044, -0.026], [R - 0.036, -0.022], [R - 0.036, 0.022], [R - 0.044, 0.026], [R - 0.052, 0.022], [R - 0.052, -0.022]], lite ? 40 : 72), [0, 0, 0], [PI / 2, 0, 0])));
  P.add('brass', g(bake(lathe([[0, -hubLen / 2], [0.03, -hubLen / 2], [0.034, -hubLen / 2 + 0.01], [0.05, -0.034], [0.05, -0.028], [0.028, -0.022], [0.028, 0.022], [0.05, 0.028], [0.05, 0.034], [0.034, hubLen / 2 - 0.01], [0.03, hubLen / 2], [0, hubLen / 2]], 28), [0, 0, 0], [PI / 2, 0, 0])));
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, s = i % 2 ? 1 : -1, a2 = a + s * 0.12;
    P.add('steel', rod(V3(at.x + Math.cos(a) * 0.045, at.y + Math.sin(a) * 0.045, at.z + s * 0.031), V3(at.x + Math.cos(a2) * (R - 0.05), at.y + Math.sin(a2) * (R - 0.05), at.z), 0.0042, 4));
  }
}
export function buildMotorwagen(M, lite) {
  const G = new THREE.Group(), car = new THREE.Group(), P = parts();
  car.scale.setScalar(0.25); car.rotation.y = PI + 0.55; G.add(car); car.updateMatrix();
  const CA = (x, y, z) => V3(x, y, z).applyMatrix4(car.matrix);
  M.iron ??= new THREE.MeshStandardMaterial({ color: '#2a2b2d', metalness: 0.75, roughness: 0.55 });
  M.belt ??= new THREE.MeshStandardMaterial({ color: '#4a2a18', roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const RR = 0.56, RF = 0.36, AX = -0.55, FX = 0.9, TR = 0.62;
  // ---- wheels
  for (const s of [-1, 1]) wheel(P, RR, 0.13, lite ? 20 : 32, V3(AX, RR, s * TR), lite);
  wheel(P, RF, 0.11, lite ? 16 : 24, V3(FX, RF, 0), lite);
  // ---- frame: two tubular side rails sweeping up and in to the steering head; cross tubes
  const HEAD = V3(0.78, 0.78, 0);
  for (const s of [-1, 1]) {
    P.add('enamel', tubeAlong(curve([[-1.0, 0.5, s * 0.36], [-0.4, 0.5, s * 0.36], [0.1, 0.5, s * 0.36], [0.44, 0.54, s * 0.33], [0.64, 0.64, s * 0.2], [0.75, 0.72, s * 0.06], [0.775, 0.75, s * 0.02]]), 0.017, 48, 10));
    // axle brackets and the elliptic springs over the rear axle
    P.add('iron', rbox(0.06, 0.08, 0.03, 0.006, [AX, 0.545, s * 0.36]));
    P.add('steelDark', bake(new THREE.TorusGeometry(0.075, 0.009, 6, 24), [AX, 0.62, s * 0.36], [0, 0, 0], [1.6, 0.45, 1]));
    P.add('iron', bake(new THREE.TorusGeometry(0.03, 0.006, 6, 16), [AX, RR, s * (TR - 0.09)], [0, 0, 0]));
  }
  for (const x of [-1.0, -0.2, 0.3]) P.add('enamel', cyl(0.014, 0.014, 0.72, 12, [x, 0.5, 0], [PI / 2, 0, 0]));
  P.add('steel', cyl(0.024, 0.024, 2 * TR - 0.1, 16, [AX, RR, 0], [PI / 2, 0, 0]));                 // rear axle
  // ---- steering head, fork, front axle
  P.add('enamel', rod(V3(0.765, 0.84, 0), V3(0.8, 0.7, 0), 0.026, 14));
  P.add('enamel', rbox(0.06, 0.03, 0.16, 0.008, [0.805, 0.69, 0]));
  for (const s of [-1, 1]) P.add('enamel', rod(V3(0.81, 0.68, s * 0.065), V3(FX, RF, s * 0.065), 0.013, 10));
  P.add('steel', cyl(0.012, 0.012, 0.16, 10, [FX, RF, 0], [PI / 2, 0, 0]));
  P.add('steelDark', rod(V3(0.79, 0.86, 0), V3(0.7, 0.86, 0), 0.008, 8));                        // steering arm
  // ---- the tiller: column, crank and wooden grip; the rack and drag link
  const TX = 0.4;
  P.add('enamel', cyl(0.018, 0.018, 0.6, 12, [TX, 0.85, 0.0]));
  P.add('iron', rbox(0.07, 0.06, 0.07, 0.01, [TX, 0.57, 0]));
  P.add('steelDark', rod(V3(TX, 1.15, 0), V3(TX + 0.02, 1.16, -0.16), 0.012, 8));
  P.add('walnut', bake(lathe([[0, 0], [0.016, 0], [0.019, 0.03], [0.017, 0.08], [0.012, 0.1], [0, 0.1]], 16), [TX + 0.02, 1.16, -0.16]));
  P.add('brass', bake(new THREE.SphereGeometry(0.022, 14, 10), [TX, 1.155, 0]));
  P.add('steelDark', rod(V3(TX, 0.6, 0.0), V3(0.7, 0.85, 0.0), 0.007, 8));
  // ---- seat box, cushion, buttoned back, iron arm rails, footboard
  P.add('walnut', rbox(0.56, 0.26, 0.9, 0.012, [0.03, 0.79, 0]));
  for (const s of [-1, 1]) for (const x of [-0.12, 0.17]) P.add('walnut', rbox(0.22, 0.17, 0.012, 0.004, [x, 0.79, s * 0.452]));   // fielded side panels
  P.add('walnut', rbox(0.012, 0.18, 0.78, 0.004, [0.312, 0.79, 0]));
  P.add('leather', rbox(0.5, 0.08, 0.86, 0.035, [0.04, 0.955, 0]));
  P.add('leather', bake(rbox(0.08, 0.32, 0.86, 0.035), [-0.22, 1.13, 0], [0, 0, 0.18]));
  for (let i = 0; i < (lite ? 0 : 3); i++) for (let k = 0; k < 6; k++) { P.add('leatherBlack', bake(new THREE.SphereGeometry(0.012, 8, 6), [-0.172 - i * 0.017, 1.04 + i * 0.09, -0.34 + k * 0.136])); P.add('leatherBlack', bake(new THREE.SphereGeometry(0.011, 8, 6), [-0.1 + i * 0.16, 0.996, -0.3 + k * 0.12])); }
  for (const s of [-1, 1]) P.add('enamel', tubeAlong(curve([[0.22, 0.92, s * 0.44], [0.2, 1.08, s * 0.46], [0.0, 1.13, s * 0.47], [-0.2, 1.18, s * 0.46], [-0.28, 1.3, s * 0.43]]), 0.011, 24, 8));
  P.add('walnut', bake(rbox(0.42, 0.022, 0.6, 0.006), [0.52, 0.6, 0], [0, 0, 0.18]));
  for (let k = 0; k < 4; k++) P.add('steelDark', bake(rbox(0.4, 0.006, 0.012, 0.002), [0.52, 0.614, -0.22 + k * 0.146], [0, 0, 0.18]));
  // ---- the engine at the rear: crankcase, horizontal water-jacketed cylinder, head and valve gear
  const EY = 0.72;
  P.add('iron', rbox(0.18, 0.3, 0.16, 0.02, [-0.86, 0.735, 0]));                                   // crankcase / bearing frame
  P.add('iron', cyl(0.095, 0.095, 0.3, 24, [-0.6, EY, 0], [0, 0, PI / 2]));                       // water jacket
  for (let k = 0; k < 4; k++) P.add('iron', cyl(0.104, 0.104, 0.012, 24, [-0.72 + k * 0.08, EY, 0], [0, 0, PI / 2]));
  P.add('iron', rbox(0.06, 0.2, 0.2, 0.02, [-0.43, EY, 0]));                                      // head
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P.add('steel', cyl(0.008, 0.008, 0.03, 8, [-0.395, EY + Math.cos(a) * 0.07, Math.sin(a) * 0.07], [0, 0, PI / 2])); }
  P.add('steel', rod(V3(-0.42, EY + 0.1, 0.05), V3(-0.8, EY + 0.12, 0.08), 0.008, 8), rod(V3(-0.8, EY + 0.12, 0.08), V3(-0.84, 0.8, 0.08), 0.008, 8));   // valve rod
  P.add('steelDark', cyl(0.025, 0.025, 0.42, 12, [-0.86, 0.66, 0]));                              // vertical crankshaft
  // brass lubricators with glass
  for (const z of [-0.05, 0.05]) { P.add('brass', bake(lathe([[0, 0], [0.012, 0], [0.012, 0.01], [0.02, 0.014], [0.02, 0.05], [0.014, 0.056], [0.006, 0.07], [0, 0.07]], 16), [-0.58, EY + 0.095, z])); }
  // the cooling water tank (brass, domed ends) behind the seat back; pipes to the jacket
  P.add('brass', cyl(0.11, 0.11, 0.56, 28, [-0.52, 1.06, 0], [PI / 2, 0, 0]));
  for (const s of [-1, 1]) { P.add('brass', bake(new THREE.SphereGeometry(0.11, 24, 10, 0, TAU, 0, PI / 2), [-0.52, 1.06, s * 0.28], [s * PI / 2, 0, 0], [1, 0.35, 1])); P.add('brassDark', bake(new THREE.TorusGeometry(0.11, 0.006, 6, 28), [-0.52, 1.06, s * 0.27])); }
  P.add('brass', cyl(0.025, 0.03, 0.05, 14, [-0.52, 1.19, 0.12]));
  for (const z of [-0.06, 0.06]) P.add('copper', tubeAlong(curve([[-0.52, 0.96, z * 2], [-0.54, 0.86, z * 1.8], [-0.6, 0.8, z], [-0.62, EY + 0.09, z]]), 0.011, 16, 8));
  // the surface carburettor and the trembler coil box
  P.add('brass', rbox(0.16, 0.16, 0.14, 0.01, [-0.66, 0.66, -0.3]));
  P.add('brassDark', rbox(0.17, 0.012, 0.15, 0.004, [-0.66, 0.745, -0.3]));
  P.add('copper', tubeAlong(curve([[-0.58, 0.7, -0.3], [-0.5, 0.72, -0.2], [-0.46, EY, -0.1]]), 0.009, 12, 6));
  P.add('walnut', rbox(0.14, 0.1, 0.12, 0.008, [-0.4, 0.6, 0.3]));
  P.add('redWire', tubeAlong(curve([[-0.36, 0.64, 0.24], [-0.38, 0.72, 0.12], [-0.42, EY + 0.06, 0.06]]), 0.005, 12, 5));
  // the seat box stands on four iron posts from the rails
  for (const x of [-0.2, 0.25]) for (const s of [-1, 1]) P.add('iron', cyl(0.014, 0.018, 0.16, 10, [x, 0.58, s * 0.36]));
  // ---- the drive: engine pulley → flat belt → countershaft (differential) → chains to the rear wheels
  const PA = V3(-0.7, 0.42, 0), PB = V3(0.05, 0.44, 0), BZ = -0.18;
  P.add('iron', cyl(0.07, 0.07, 0.07, 24, [PA.x, PA.y, BZ], [PI / 2, 0, 0]), cyl(0.11, 0.11, 0.13, 28, [PB.x, PB.y, BZ + 0.03], [PI / 2, 0, 0]));
  const belt = beltPath(PB, 0.115, PA, 0.075, BZ, lite ? 60 : 120);
  P.add('belt', strip(belt.pts, 0.06, Z, true));
  P.add('steelDark', cyl(0.018, 0.018, 1.06, 12, [PB.x, PB.y, 0], [PI / 2, 0, 0]));
  P.add('iron', bake(new THREE.SphereGeometry(0.075, 18, 12), [PB.x, PB.y, 0.08], [0, 0, 0], [1, 1, 0.7]));                  // differential
  for (const s of [-1, 1]) {
    const zc = s * 0.5;
    P.add('steelDark', cyl(0.055, 0.055, 0.012, 20, [PB.x, PB.y, zc], [PI / 2, 0, 0]), cyl(0.15, 0.15, 0.01, 36, [AX, RR, zc], [PI / 2, 0, 0]));
    for (let k = 0; k < (lite ? 0 : 30); k++) { const a = k / 30 * TAU; P.add('steelDark', box(0.016, 0.014, 0.008, [AX + Math.cos(a) * 0.157, RR + Math.sin(a) * 0.157, zc], [0, 0, a])); }
    const ch = beltPath(V3(AX, RR, 0), 0.158, PB, 0.062, zc, lite ? 50 : 90);
    if (lite) P.add('steelDark', strip(ch.pts, 0.016, Z, true));
    else ch.pts.forEach((p, k) => { const q = ch.pts[(k + 1) % ch.pts.length]; P.add('steelDark', beam(p.clone().lerp(q, 0.5), q.clone().sub(p), p.distanceTo(q) * 1.1, 0.014, 0.011, Z)); });
  }
  // hand brake lever
  P.add('enamel', rod(V3(0.2, 0.52, -0.5), V3(0.16, 1.02, -0.52), 0.012, 8));
  P.add('walnut', cyl(0.018, 0.016, 0.08, 12, [0.155, 1.05, -0.522]));
  P.build(car, M);
  // ---- the flywheel (animated): rim, six spokes, hub — on the vertical crankshaft
  const fly = new THREE.Group(); fly.position.set(-0.86, 0.555, 0); car.add(fly);
  const F = parts();
  F.add('iron', lathe([[0.235, -0.028], [0.27, -0.028], [0.272, -0.02], [0.272, 0.02], [0.27, 0.028], [0.235, 0.028], [0.235, -0.028]], lite ? 40 : 64));
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; F.add('iron', beam(V3(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14), V3(Math.cos(a), 0, Math.sin(a)), 0.2, 0.034, 0.018)); }
  F.add('iron', cyl(0.05, 0.05, 0.07, 18));
  F.add('brass', cyl(0.018, 0.018, 0.075, 10, [0.25, 0, 0]));    // a balance mark that shows the turn
  F.build(fly, M);
  return {
    group: G, car, flywheel: fly,
    anchors: { focus: V3(0.0, 0.17, 0), flywheel: CA(-1.0, 0.58, 0.12), tiller: CA(TX + 0.02, 1.24, -0.16), engine: CA(-0.6, 0.8, 0), tank: CA(-0.52, 1.17, 0) },
  };
}

// ================================================================================== 4 · CINEMA
// The arriving train, drawn on the screen as the film would show it: grey sky over the station canopy,
// the platform running to a vanishing point, waiting figures, and the locomotive growing out of the
// distance; 16 frames a second, with flicker, gate weave, grain, scratches and a soft vignette.
const FILM_FRAG = /* glsl */ `
uniform float uT, uOn, uP; varying vec2 vUv;
float h1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
void main(){
  float fr = floor(uT * 16.0);
  vec2 p = vUv + (vec2(h1(fr), h1(fr + 7.0)) - 0.5) * 0.006;
  vec2 vp = vec2(0.8, 0.56);
  float y = p.y, x = p.x;
  float c = mix(0.78, 0.9, smoothstep(0.5, 1.0, y));
  // canopy roof edge (top right) and its posts
  float roof = step(0.8 - (x - 0.4) * 0.35, y) * step(0.4, x);
  c = mix(c, 0.32, roof);
  // ground and the platform edge running to the vanishing point
  float g = step(y, vp.y - (vp.x - x) * 0.05);
  c = mix(c, 0.6, g);
  float edge = vp.y - (vp.x - x) * 0.75;
  float plat = step(y, edge) * step(x, vp.x);
  c = mix(c, 0.5, plat * 0.6);
  c = mix(c, 0.22, smoothstep(0.012, 0.0, abs(y - edge)) * step(x, vp.x));
  // rails
  for (int k = 0; k < 2; k++) { float sl = 0.38 + float(k) * 0.12; float ry = vp.y - (vp.x - x) * sl; c = mix(c, 0.3, smoothstep(0.004, 0.0, abs(y - ry)) * step(x, vp.x) * step(ry, vp.y)); }
  // waiting figures on the platform (perspective-scaled)
  for (int k = 0; k < 6; k++) { float fx = 0.08 + float(k) * 0.11; float s = (vp.x - fx) * 0.35; float base = vp.y - (vp.x - fx) * 0.85;
    vec2 q = (p - vec2(fx, base + s * 0.5)) / s; float body = sdBox(q, vec2(0.08, 0.45)) - 0.04; float head = length(q - vec2(0.0, 0.58)) - 0.11;
    c = mix(c, 0.16, step(min(body, head), 0.0) * step(0.0, base)); }
  // the locomotive: grows from the vanishing point along the track
  float s = mix(0.02, 0.75, pow(uP, 2.2));
  vec2 lc = mix(vp + vec2(-0.02, 0.0), vec2(0.42, 0.34), pow(uP, 1.6));
  vec2 q = (p - lc) / s;
  float boiler = sdBox(q - vec2(0.0, 0.05), vec2(0.36, 0.22)) - 0.05;
  float cab = sdBox(q - vec2(0.32, 0.25), vec2(0.18, 0.3));
  float stack = sdBox(q - vec2(-0.22, 0.38), vec2(0.06, 0.16));
  float buffer = sdBox(q - vec2(-0.05, -0.2), vec2(0.42, 0.06));
  float loco = min(min(boiler, cab), min(stack, buffer));
  c = mix(c, 0.08, step(loco, 0.0) * step(0.001, uP));
  float lamp = length(q - vec2(-0.2, 0.0)) - 0.05; c = mix(c, 0.95, step(lamp, 0.0) * step(0.001, uP) * 0.6);
  // steam from the stack
  float st = smoothstep(0.35, 0.0, length((q - vec2(-0.3, 0.75)) * vec2(1.0, 1.6))) * step(0.001, uP);
  c = mix(c, 0.85, st * 0.6);
  // film: grain, scratches, flicker, vignette
  c += (h2(p * 400.0 + fr) - 0.5) * 0.12;
  float scr = step(0.997, h2(vec2(floor(p.x * 300.0), fr)));
  c = mix(c, 0.95, scr * 0.5);
  float vig = smoothstep(0.85, 0.3, length((vUv - 0.5) * vec2(1.1, 1.3)));
  float fl = 0.86 + 0.14 * h1(fr * 3.1);
  vec3 col = vec3(c) * vec3(1.0, 0.97, 0.92) * vig * fl;
  gl_FragColor = vec4(col * uOn * 1.6 + vec3(0.012) , 1.0);
}`;
export function buildCinema(M) {
  const G = new THREE.Group(), P = parts();
  const BX = -0.32;
  // baseboard and the cinématographe box (optical axis +x)
  P.add('walnut', rbox(0.42, 0.014, 0.2, 0.003, [BX - 0.03, 0.007, 0]));
  const bx = BX, by = 0.014, L = 0.15, H = 0.17, W = 0.115;
  P.add('mahogany', rbox(L, H, W, 0.004, [bx, by + H / 2, 0]));
  P.add('mahogany', rbox(0.006, H - 0.03, W - 0.03, 0.002, [bx - L / 2 - 0.002, by + H / 2, 0]));       // rear door
  P.add('brass', box(0.004, 0.02, 0.008, [bx - L / 2 - 0.006, by + H / 2, W / 2 - 0.025]));
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {   // brass corner caps
    const c = [bx + sx * (L / 2 - 0.006), by + (sy ? H - 0.006 : 0.006), sz * (W / 2 - 0.006)];
    P.add('brass', box(0.014, 0.014, 0.0025, [c[0], c[1], sz * (W / 2 + 0.0008)]), box(0.0025, 0.014, 0.014, [bx + sx * (L / 2 + 0.0008), c[1], c[2]]));
  }
  // lens: barrel with knurled focusing ring, protruding from the front
  const LY = by + H * 0.42, LX = bx + L / 2;
  P.add('brass', bake(lathe([[0, 0], [0.026, 0], [0.026, 0.004], [0.017, 0.006], [0.017, 0.05], [0.019, 0.052], [0.019, 0.058], [0.016, 0.06], [0, 0.058]], 32), [LX, LY, 0], [0, 0, -PI / 2]));
  P.add('brass', knurl(0.0195, 0.012, 24, [LX + 0.03, LY, 0], [0, 0, PI / 2]));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0155, 24), lensGlassMat()); lens.position.set(LX + 0.0595, LY, 0); lens.rotation.y = PI / 2; G.add(lens);
  // the crank boss on the visitor's side; the crank itself turns
  P.add('brass', cyl(0.012, 0.014, 0.008, 18, [bx + 0.01, by + H * 0.48, W / 2 + 0.004], [PI / 2, 0, 0]));
  const crank = new THREE.Group(); crank.position.set(bx + 0.01, by + H * 0.48, W / 2 + 0.01); G.add(crank);
  const CK = parts();
  CK.add('brass', box(0.007, 0.06, 0.005, [0, -0.028, 0]), cyl(0.007, 0.007, 0.008, 12, [0, 0, 0], [PI / 2, 0, 0]));
  CK.add('walnut', bake(lathe([[0, 0], [0.006, 0], [0.007, 0.012], [0.0055, 0.028], [0, 0.03]], 14), [0, -0.056, 0.003], [PI / 2, 0, 0]));
  CK.build(crank, M);
  // reel arm on top with a turning spoked reel; the film runs down into the gate
  P.add('brassDark', box(0.006, 0.07, 0.006, [bx - 0.02, by + H + 0.035, 0]));
  const reel = new THREE.Group(); reel.position.set(bx - 0.02, by + H + 0.075, 0); G.add(reel);
  const RL = parts();
  for (const z of [-0.022, 0.022]) { RL.add('steel', bake(new THREE.TorusGeometry(0.052, 0.0022, 6, 40), [0, 0, z])); for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; RL.add('steel', box(0.05, 0.004, 0.0016, [Math.cos(a) * 0.026, Math.sin(a) * 0.026, z], [0, 0, a])); } }
  RL.add('black', cyl(0.038, 0.038, 0.04, 32, [0, 0, 0], [PI / 2, 0, 0]));       // the film wound on it
  RL.add('steel', cyl(0.007, 0.007, 0.054, 10, [0, 0, 0], [PI / 2, 0, 0]));
  RL.build(reel, M);
  P.add('filmStrip', strip([V3(bx - 0.057, by + H + 0.075, 0), V3(bx - 0.06, by + H + 0.035, 0), V3(bx - 0.05, by + H + 0.001, 0)], 0.04, Z));
  // the lamp house behind: sheet-iron box on legs, chimney with a vented cap, condenser, door, red window
  const LH = V3(BX - 0.17, 0.014, 0);
  P.add('enamel', rbox(0.12, 0.16, 0.12, 0.006, [LH.x, LH.y + 0.04 + 0.08, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('enamel', cyl(0.005, 0.005, 0.04, 8, [LH.x + sx * 0.05, LH.y + 0.02, sz * 0.05]));
  P.add('enamel', cyl(0.024, 0.026, 0.08, 18, [LH.x, LH.y + 0.24, 0]), cyl(0.036, 0.036, 0.006, 18, [LH.x, LH.y + 0.29, 0]), cyl(0.036, 0.03, 0.012, 18, [LH.x, LH.y + 0.305, 0]));
  P.add('brass', cyl(0.034, 0.034, 0.014, 28, [LH.x + 0.066, LH.y + 0.12, 0], [0, 0, PI / 2]));
  P.add('enamel', rbox(0.08, 0.1, 0.004, 0.003, [LH.x, LH.y + 0.12, 0.062]));
  P.add('brass', cyl(0.004, 0.004, 0.012, 8, [LH.x + 0.03, LH.y + 0.12, 0.068], [PI / 2, 0, 0]));
  const glowM = new THREE.MeshBasicMaterial({ color: '#000000' });
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.012, 18), glowM); win.position.set(LH.x - 0.02, LH.y + 0.14, 0.0645); G.add(win);
  const slots = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 24, 1, true), glowM); slots.position.set(LH.x, LH.y + 0.296, 0); G.add(slots);
  // the screen: walnut frame on two splayed legs, cream canvas back
  const SX = 0.42, SW = 0.32, SH = 0.24, SY = 0.08 + SH / 2;
  for (const [w, h, x, y] of [[SW + 0.03, 0.015, 0, SH / 2 + 0.0075], [SW + 0.03, 0.015, 0, -SH / 2 - 0.0075], [0.015, SH, SW / 2 + 0.0075, 0], [0.015, SH, -SW / 2 - 0.0075, 0]]) P.add('walnut', rbox(0.016, h, w, 0.003, [SX + 0.0, SY + y, x]));
  P.add('cream', box(0.003, SH, SW, [SX + 0.004, SY, 0]));
  for (const s of [-1, 1]) { P.add('walnut', rod(V3(SX + 0.004, SY - SH / 2, s * 0.14), V3(SX + 0.03, 0.0, s * 0.17), 0.006, 8)); P.add('walnut', rod(V3(SX + 0.004, SY - SH / 2, s * 0.14), V3(SX - 0.03, 0.0, s * 0.17), 0.006, 8)); }
  P.build(G, M);
  // the projected film (faces −x, toward the projector)
  const filmU = { uT: { value: 0 }, uOn: { value: 0 }, uP: { value: 0 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.ShaderMaterial({
    uniforms: filmU, vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: FILM_FRAG,
  }));
  screen.position.set(SX - 0.0005, SY, 0); screen.rotation.y = -PI / 2; G.add(screen);
  // the beam: an open frustum from the lens to the screen
  const a = V3(LX + 0.06, LY, 0), hw0 = 0.012, hh0 = 0.009;
  const corners0 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => V3(a.x, a.y + v * hh0, u * hw0));
  const corners1 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => V3(SX - 0.002, SY + v * SH / 2, u * SW / 2));
  const pos = [], uvs = [];
  for (let k = 0; k < 4; k++) {
    const p0 = corners0[k], p1 = corners0[(k + 1) % 4], q0 = corners1[k], q1 = corners1[(k + 1) % 4];
    pos.push(...p0.toArray(), ...p1.toArray(), ...q1.toArray(), ...p0.toArray(), ...q1.toArray(), ...q0.toArray());
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const beamU = { uI: { value: 0 }, uT: { value: 0 } };
  const beamMesh = new THREE.Mesh(bg, new THREE.ShaderMaterial({
    uniforms: beamU,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vL; void main(){ vUv = uv; vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uI, uT; varying vec2 vUv; varying vec3 vL;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main(){ float edge = sin(3.14159 * vUv.x); float along = mix(1.0, 0.35, vUv.y);
        float motes = step(0.996, h(floor(vL * 260.0 + vec3(0.0, uT * 2.0, 0.0)))) * 4.0;
        float fl = 0.85 + 0.15 * fract(sin(floor(uT * 16.0) * 91.7) * 4375.5);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * uI * fl * (0.25 + 0.75 * edge) * along * (1.0 + motes), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beamMesh.renderOrder = 4; G.add(beamMesh);
  return {
    group: G, crank, reel, filmU, beamU, glowM,
    anchors: { focus: V3(0.02, 0.15, 0), box: V3(bx + 0.02, by + H, 0.03), screen: V3(SX, SY + 0.06, 0.05), lens: V3(LX + 0.06, LY, 0), lamp: V3(LH.x, LH.y + 0.14, 0.06) },
  };
}

// ================================================================================== 5 · TELEVISION
const TV_FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uOn, uT, uI; varying vec2 vUv;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 c = vUv - 0.5;
  // warm-up: a dot, then a line, then the raster opens
  float ex = smoothstep(0.0, 0.35, uOn), ey = smoothstep(0.3, 0.75, uOn);
  vec2 q = c / vec2(max(ex, 0.002), max(ey, 0.004));
  float inside = step(abs(q.x), 0.5) * step(abs(q.y), 0.5);
  vec2 uv = q * (1.0 + 0.05 * dot(q, q)) + 0.5;
  vec3 img = texture2D(uMap, clamp(uv, 0.0, 1.0)).rgb;
  float l = dot(img, vec3(0.3, 0.59, 0.11));
  float snow = h2(floor(vUv * vec2(320.0, 240.0)) + floor(uT * 30.0));
  l = mix(snow * 0.7, l, smoothstep(0.75, 1.0, uOn));
  float scan = 0.82 + 0.18 * sin(uv.y * 3.14159 * 420.0);
  float roll = 0.94 + 0.06 * sin((uv.y + uT * 0.6) * 6.2832);
  float vig = smoothstep(0.75, 0.25, length(c * vec2(1.0, 1.2)));
  vec3 ph = vec3(0.82, 0.9, 1.0) * l * scan * roll * vig * inside;
  float dot0 = exp(-dot(c, c) * 900.0) * (1.0 - ey) * step(0.01, uOn) * 3.0;
  vec3 glass = vec3(0.012, 0.014, 0.016) + vec3(0.05) * smoothstep(0.5, 0.0, length(c - vec2(-0.22, 0.25))) * 0.6;
  gl_FragColor = vec4(glass + ph * uI + vec3(0.8, 0.9, 1.0) * dot0, 1.0);
}`;
export function buildTV(M) {
  const G = new THREE.Group(), P = parts();
  const W = 0.4, H = 0.33, D = 0.3, y0 = 0.018, FZ = D / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.add('brass', bake(lathe([[0, 0], [0.012, 0], [0.014, 0.006], [0.01, 0.018], [0, 0.018]], 14), [sx * (W / 2 - 0.035), 0, sz * (D / 2 - 0.04)]));
  P.add('walnut', rbox(W, H, D, 0.026, [0, y0 + H / 2, 0]));
  // front: the gilt mask round the screen, the screen opening, the speaker cloth with its bars, knobs
  const SW = 0.25, SH = 0.188, SYc = y0 + 0.205;
  const maskS = rrShape(SW + 0.05, SH + 0.045, 0.03); maskS.holes.push(rrShape(SW, SH, 0.03, new THREE.Path()));
  P.add('brass', bake(new THREE.ExtrudeGeometry(maskS, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 10 }), [0, SYc, FZ + 0.0005]));
  P.add('cloth', box(0.26, 0.062, 0.003, [-0.02, y0 + 0.058, FZ + 0.0002]));
  for (let k = 0; k < 4; k++) P.add('walnut', rbox(0.27, 0.007, 0.008, 0.002, [-0.02, y0 + 0.034 + k * 0.016, FZ + 0.004]));
  for (const [x, y] of [[0.16, y0 + 0.075], [0.16, y0 + 0.038]]) { P.add('bakelite', knurl(0.014, 0.014, 18, [x, y, FZ + 0.008], [PI / 2, 0, 0])); P.add('brass', cyl(0.0085, 0.0085, 0.003, 18, [x, y, FZ + 0.0155], [PI / 2, 0, 0])); }
  P.add('brassDark', box(0.32, 0.004, 0.004, [0, y0 + 0.103, FZ + 0.001]));
  // back: hardboard with vent slots, the tube's neck housing, the antenna lead
  P.add('walnut', box(W - 0.04, H - 0.04, 0.006, [0, y0 + H / 2, -FZ - 0.001]));
  for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) P.add('black', box(0.022, 0.006, 0.004, [-0.13 + k * 0.032, y0 + 0.24 + r * 0.018, -FZ - 0.003]));
  P.add('walnut', bake(new THREE.CylinderGeometry(0.06, 0.11, 0.1, 4, 1), [0, y0 + 0.19, -FZ - 0.05], [-PI / 2, PI / 4, 0]));
  P.add('black', cyl(0.05, 0.05, 0.004, 4, [0, y0 + 0.19, -FZ - 0.1], [PI / 2, PI / 4, 0]));
  // rabbit ears
  P.add('bakelite', bake(new THREE.SphereGeometry(0.035, 20, 10, 0, TAU, 0, PI / 2), [0.06, y0 + H, -0.04], [0, 0, 0], [1, 0.55, 1]));
  for (const s of [-1, 1]) {
    const a = V3(0.06, y0 + H + 0.015, -0.04), dir = V3(s * 0.45, 1, -0.18).normalize();
    for (let k = 0; k < 3; k++) { const p0 = a.clone().addScaledVector(dir, k * 0.075), p1 = a.clone().addScaledVector(dir, (k + 1) * 0.075 + 0.01); P.add('chrome', rod(p0, p1, 0.0032 - k * 0.0008, 8)); }
    P.add('chrome', bake(new THREE.SphereGeometry(0.0045, 10, 8), a.clone().addScaledVector(dir, 0.235).toArray()));
  }
  P.add('pvc', tubeAlong(curve([[0.06, y0 + H + 0.002, -0.07], [0.08, y0 + H - 0.02, -FZ - 0.02], [0.1, y0 + 0.1, -FZ - 0.03], [0.12, 0.004, -FZ - 0.08]]), 0.0022, 24, 5));
  P.build(G, M);
  // the curved face of the tube (bulging toward the viewer), its test card glowing when warm
  const scrU = { uMap: { value: testCardTexture() }, uOn: { value: 0 }, uT: { value: 0 }, uI: { value: 1.4 } };
  const sg = new THREE.PlaneGeometry(SW + 0.004, SH + 0.004, 16, 12), sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / (SW / 2), y = sp.getY(i) / (SH / 2); sp.setZ(i, 0.009 * (1 - 0.5 * x * x) * (1 - 0.5 * y * y)); }
  sg.computeVertexNormals();
  const screen = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: scrU, vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: TV_FRAG }));
  screen.position.set(0, SYc, FZ + 0.0012); G.add(screen);
  return { group: G, scrU, anchors: { focus: V3(0, y0 + 0.17, 0.05), screen: V3(-0.06, SYc + 0.04, FZ + 0.004), ears: V3(0.16, y0 + H + 0.17, -0.07), knob: V3(0.16, y0 + 0.075, FZ + 0.01) } };
}

// ================================================================================== 6 · LASER
export function buildLaser(M, lite) {
  const G = new THREE.Group(), P = parts();
  const HX = -0.2, HY = 0.1, R = 0.05, LEN = 0.12;
  // aluminium base plate and two cradles
  P.add('alu', rbox(0.62, 0.012, 0.18, 0.003, [0.04, 0.006, 0]));
  for (const x of [HX - 0.04, HX + 0.04]) { P.add('alu', rbox(0.022, HY - R - 0.008, 0.07, 0.003, [x, 0.012 + (HY - R - 0.008) / 2, 0])); P.add('alu', bake(new THREE.CylinderGeometry(R + 0.006, R + 0.006, 0.022, 28, 1, false, PI * 1.25, PI * 0.5), [x, HY, 0], [0, 0, PI / 2])); }
  // the polished cylinder, cut away toward the visitor (a quarter removed), with its inner wall and cut faces
  const cut0 = PI * 0.35, cutL = TAU - PI * 0.62;   // keep [cut0, cut0 + cutL] around the x axis
  const shell = (r) => bake(new THREE.CylinderGeometry(r, r, LEN, lite ? 28 : 56, 1, true, cut0, cutL), [HX, HY, 0], [0, 0, PI / 2]);
  P.add('chrome', shell(R));
  const inner = shell(R - 0.004); inner.scale(1, 1, 1);
  const innerM = 'chromeIn'; M.chromeIn ??= new THREE.MeshStandardMaterial({ color: '#dfe3e8', metalness: 1, roughness: 0.12, side: THREE.BackSide });
  P.add(innerM, inner);
  for (const sx of [-1, 1]) {
    // end rings (the front one carries the exit hole)
    P.add('chrome', bake(new THREE.RingGeometry(sx > 0 ? 0.008 : 0.0, R, lite ? 28 : 56, 1, sx > 0 ? PI - cut0 - cutL : cut0, cutL), [HX + sx * LEN / 2, HY, 0], [0, sx * PI / 2, 0]));
  }
  for (const a of [cut0, cut0 + cutL]) P.add('alu', beam(V3(HX, HY + Math.sin(a) * (R - 0.002), Math.cos(a) * (R - 0.002)), V3(1, 0, 0), LEN, 0.004, 0.004));
  // the ruby rod with silvered ends, held on the axis
  const rubyM = new THREE.MeshStandardMaterial({ color: '#8c0c22', roughness: 0.12, metalness: 0.1, emissive: '#000000', envMapIntensity: 1.4 });
  const ruby = new THREE.Mesh(cyl(0.0125, 0.0125, 0.075, 28, [HX, HY, 0], [0, 0, PI / 2]), rubyM); G.add(ruby);
  for (const sx of [-1, 1]) P.add('chrome', cyl(0.0127, 0.0127, 0.0015, 28, [HX + sx * 0.0378, HY, 0], [0, 0, PI / 2]));
  P.add('black', cyl(0.003, 0.003, 0.0006, 10, [HX + 0.0388, HY, 0], [0, 0, PI / 2]));
  // the helical xenon flash lamp round the rod; its two legs leave through the top to terminals
  const lampM = new THREE.MeshStandardMaterial({ color: '#d9e2ea', roughness: 0.1, metalness: 0, emissive: '#000000', transparent: true, opacity: 0.85 });
  const coil = bake(helix(0.03, 0.0045, -0.045, 0.045, 5.5, lite ? 110 : 220, lite ? 5 : 8), [HX, HY, 0], [0, 0, -PI / 2]);
  const lampGeo = merge([coil,
    tubeAlong(curve([[HX - 0.045, HY - 0.03, 0], [HX - 0.051, HY - 0.026, 0], [HX - 0.053, HY - 0.005, 0], [HX - 0.052, HY + R + 0.03, 0]]), 0.0045, 20, 8),
    tubeAlong(curve([[HX + 0.045, HY + 0.03, 0], [HX + 0.051, HY + 0.034, 0], [HX + 0.052, HY + R + 0.03, 0]]), 0.0045, 16, 8)]);
  const lamp = new THREE.Mesh(lampGeo, lampM); G.add(lamp);
  for (const s of [-1, 1]) { P.add('ebonite', cyl(0.009, 0.009, 0.02, 14, [HX + s * 0.052, HY + R + 0.035, 0])); P.add('nickel', cyl(0.004, 0.004, 0.012, 10, [HX + s * 0.052, HY + R + 0.05, 0])); }
  // power supply: crinkle-black case, meter, two knobs; heavy leads to the lamp terminals
  const PS = V3(0.12, 0.012, -0.05);
  P.add('blackAnod', rbox(0.2, 0.11, 0.1, 0.006, [PS.x, PS.y + 0.055, PS.z]));
  P.add('pewter', rbox(0.21, 0.006, 0.105, 0.002, [PS.x, PS.y + 0.112, PS.z]));
  for (const x of [0.06, 0.1]) P.add('bakelite', knurl(0.008, 0.01, 14, [PS.x + x - 0.08 + 0.06, PS.y + 0.04, PS.z + 0.054], [PI / 2, 0, 0]));
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.025, 32), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.6 }));
  dial.position.set(PS.x - 0.04, PS.y + 0.065, PS.z + 0.0505); G.add(dial);
  P.add('pewter', bake(new THREE.TorusGeometry(0.026, 0.0025, 6, 32), [PS.x - 0.04, PS.y + 0.065, PS.z + 0.051]));
  for (const s of [-1, 1]) P.add('redWire', tubeAlong(curve([[HX + s * 0.052, HY + R + 0.055, 0], [HX + s * 0.052 + 0.02, HY + R + 0.09, -0.02], [PS.x - 0.06 + s * 0.02, PS.y + 0.14, PS.z - 0.01], [PS.x - 0.06 + s * 0.02, PS.y + 0.11, PS.z]]), 0.0032, 24, 6));
  // the target: a frosted plate on a post, a ruler of a base
  const TX = 0.3;
  P.add('alu', cyl(0.004, 0.004, HY, 10, [TX, 0.012 + HY / 2, 0]));
  P.add('alu', rbox(0.04, 0.008, 0.04, 0.002, [TX, 0.016, 0]));
  P.add('whitePaint', rbox(0.004, 0.06, 0.06, 0.002, [TX, HY, 0]));
  P.build(G, M);
  return {
    group: G, rubyM, lampM, beamFrom: V3(HX + 0.04, HY, 0), beamTo: V3(TX - 0.0025, HY, 0),
    anchors: { focus: V3(-0.06, 0.1, 0), ruby: V3(HX + 0.01, HY, 0.012), lamp: V3(HX - 0.02, HY + 0.03, 0.02), target: V3(TX, HY + 0.02, 0), beam: V3(0.05, HY, 0) },
  };
}

// ================================================================================== 7 · GPS
export function buildGPS(M, lite) {
  const G = new THREE.Group(), P = parts();
  const CY = 0.56;
  // the stand: pewter foot, chrome column, a small yoke under the bus
  P.add('pewter', lathe([[0, 0], [0.1, 0], [0.102, 0.004], [0.098, 0.012], [0.03, 0.02], [0.016, 0.03], [0, 0.03]], 40));
  P.add('chrome', cyl(0.009, 0.009, CY - 0.1, 14, [0, 0.03 + (CY - 0.13) / 2, 0]));
  P.add('pewter', cyl(0.016, 0.012, 0.02, 14, [0, CY - 0.1, 0]));
  const sat = new THREE.Group(); sat.position.set(0, CY, 0); sat.rotation.set(0.12, -0.25, 0); G.add(sat);
  const S = parts();
  // bus: gold foil body, silver radiators top and bottom, edge frames, thrusters at the back
  const BW = 0.12, BH = 0.13, BD = 0.12;
  S.add('foil', rbox(BW, BH, BD, 0.004));
  S.add('foilSilver', box(BW - 0.012, 0.003, BD - 0.012, [0, BH / 2 + 0.0015, 0]), box(BW - 0.012, 0.003, BD - 0.012, [0, -BH / 2 - 0.0015, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.add('pewterDark', box(0.004, BH + 0.002, 0.004, [sx * BW / 2, 0, sz * BD / 2]));
  for (const [x, y] of [[-0.03, 0.03], [0.03, 0.03], [-0.03, -0.03], [0.03, -0.03]]) S.add('steelDark', bake(lathe([[0.002, 0], [0.004, 0], [0.006, 0.012], [0.0055, 0.013], [0.0015, 0.002]], 12), [x, y, -BD / 2], [-PI / 2, 0, 0]));
  S.add('pewterDark', bake(new THREE.SphereGeometry(0.004, 10, 8), [0, -BH / 2 - 0.02, 0]), cyl(0.006, 0.006, 0.02, 10, [0, -BH / 2 - 0.01, 0]));   // stand mount
  // the nadir face (toward the visitor): ground plate with the twelve-helix L-band array
  S.add('pewter', cyl(0.052, 0.052, 0.004, 40, [0, 0.005, BD / 2 + 0.002], [PI / 2, 0, 0]));
  const hx = lite ? 40 : 80, hr = lite ? 4 : 5;
  const hel = [];
  for (let k = 0; k < 12; k++) {
    const outer = k < 8, a = outer ? k / 8 * TAU : (k - 8) / 4 * TAU + PI / 4, r = outer ? 0.039 : 0.016;
    const hp = [Math.cos(a) * r, 0.005 + Math.sin(a) * r, BD / 2 + 0.004];
    hel.push(bake(helix(0.0055, 0.0007, 0, 0.034, 4, hx, hr), hp, [PI / 2, 0, 0]));
    S.add('whitePaint', cyl(0.0068, 0.0068, 0.004, 12, [hp[0], hp[1], hp[2] + 0.002], [PI / 2, 0, 0]));
  }
  S.add('nickel', ...hel);
  // UHF crosslink antenna (quadrifilar) at a corner, two S-band horns, an Earth sensor
  S.add('whitePaint', cyl(0.012, 0.012, 0.05, 16, [-0.045, -0.045, BD / 2 + 0.025], [PI / 2, 0, 0]));
  for (let k = 0; k < 4; k++) S.add('nickel', bake(helix(0.0126, 0.0008, 0, 0.05, 1.2, 40, 4), [-0.045, -0.045, BD / 2], [PI / 2, k * PI / 2, 0]));
  for (const x of [0.046, 0.03]) S.add('pewter', bake(new THREE.CylinderGeometry(0.009, 0.004, 0.018, 4, 1, true), [x, -0.046, BD / 2 + 0.009], [PI / 2, PI / 4, 0]));
  S.add('black', cyl(0.007, 0.007, 0.01, 14, [0.045, 0.045, BD / 2 + 0.005], [PI / 2, 0, 0]));
  // the solar wings (along ±x): yoke, root hinge, two panels each — cells toward the visitor
  const PW = 0.14, PH = 0.19;
  for (const s of [-1, 1]) {
    S.add('pewter', cyl(0.007, 0.007, 0.02, 12, [s * (BW / 2 + 0.01), 0, 0], [0, 0, PI / 2]));
    S.add('pewterDark', rod(V3(s * (BW / 2 + 0.018), 0, 0), V3(s * (BW / 2 + 0.06), 0.07, 0), 0.0028, 6), rod(V3(s * (BW / 2 + 0.018), 0, 0), V3(s * (BW / 2 + 0.06), -0.07, 0), 0.0028, 6));
    S.add('pewterDark', box(0.006, 0.15, 0.006, [s * (BW / 2 + 0.062), 0, 0]));
    for (let k = 0; k < 2; k++) {
      const cx = s * (BW / 2 + 0.07 + PW / 2 + k * (PW + 0.008));
      const fr = new THREE.PlaneGeometry(PW, PH); bake(fr, [cx, 0, 0.0031]);
      S.add('solar', fr);
      S.add('graphite', box(PW, PH, 0.006, [cx, 0, 0]));
      S.add('pewter', box(PW + 0.004, 0.004, 0.0075, [cx, PH / 2, 0]), box(PW + 0.004, 0.004, 0.0075, [cx, -PH / 2, 0]), box(0.004, PH, 0.0075, [cx + PW / 2, 0, 0]), box(0.004, PH, 0.0075, [cx - PW / 2, 0, 0]));
      if (k === 0) for (const y of [-0.06, 0.06]) S.add('pewterDark', cyl(0.0035, 0.0035, 0.012, 8, [cx + s * (PW / 2 + 0.004), y, 0], [0, 0, PI / 2]));
    }
  }
  S.build(sat, M);
  return { group: G, sat, CY, anchors: { focus: V3(0, CY, 0), array: V3(0, CY + 0.01, BD / 2 + 0.04), wing: V3(0.3, CY + 0.08, 0.0), bus: V3(-0.05, CY + 0.05, 0.06) } };
}

// ================================================================================== 8 · SMARTPHONE
const PHONE_FRAG = /* glsl */ `
uniform sampler2D uLock, uHome; uniform float uMix, uOn, uT; varying vec2 vUv;
float sdRR(vec2 p, vec2 b, float r){ vec2 d = abs(p) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
void main(){
  vec2 p = (vUv - 0.5) * vec2(0.086, 0.18);
  float d = sdRR(p, vec2(0.0405, 0.0855), 0.009);
  float disp = smoothstep(0.0004, -0.0004, d);
  vec2 su = vec2((p.x / 0.081) + 0.5, (p.y / 0.171) + 0.5);
  vec3 a = texture2D(uLock, su).rgb, b = texture2D(uHome, su).rgb;
  float pop = smoothstep(0.0, 1.0, uMix);
  vec3 img = mix(a, b, pop);
  vec3 glass = vec3(0.006, 0.007, 0.009);
  float refl = smoothstep(0.02, 0.0, abs(vUv.x * 0.6 + vUv.y - 1.05)) * 0.05;
  gl_FragColor = vec4(glass + img * disp * uOn * 1.15 + vec3(refl), 1.0);
}`;
export function buildPhone(M) {
  const G = new THREE.Group(), P = parts();
  const PWd = 0.086, PHt = 0.18, PT = 0.0092, tilt = -0.27;
  // the acrylic stand: base, back rest, lip
  P.add('acrylicSolid', rbox(0.14, 0.01, 0.11, 0.003, [0, 0.005, 0]));
  P.add('acrylicSolid', bake(rbox(0.07, 0.15, 0.008, 0.003), [0, 0.085, -0.012], [tilt, 0, 0]));
  P.add('acrylicSolid', rbox(0.11, 0.014, 0.012, 0.003, [0, 0.017, 0.03]));
  // the phone
  const ph = new THREE.Group(); ph.position.set(0, 0.012 + PHt / 2 * Math.cos(tilt) + 0.002, 0.012); ph.rotation.x = tilt; G.add(ph);
  const Q = parts();
  const body = new THREE.ExtrudeGeometry(rrShape(PWd - 0.002, PHt - 0.002, 0.012), { depth: PT - 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 3, curveSegments: 10 });
  body.translate(0, 0, -PT / 2 + 0.001);
  Q.add('aluFrame', body);
  Q.add('phoneBack', bake(new THREE.ShapeGeometry(rrShape(PWd - 0.004, PHt - 0.004, 0.011), 10), [0, 0, -PT / 2 - 0.0002], [0, PI, 0]));
  // camera module on the back: raised square, three lenses, flash
  Q.add('phoneBack', rbox(0.034, 0.034, 0.002, 0.007, [-0.02, 0.064, -PT / 2 - 0.001]));
  for (const [x, y] of [[-0.028, 0.072], [-0.028, 0.056], [-0.012, 0.064]]) { Q.add('aluFrame', cyl(0.0062, 0.0062, 0.0018, 20, [x, y, -PT / 2 - 0.0025], [PI / 2, 0, 0])); Q.add('black', cyl(0.0045, 0.0045, 0.0004, 20, [x, y, -PT / 2 - 0.0034], [PI / 2, 0, 0])); }
  Q.add('cream', cyl(0.0018, 0.0018, 0.0006, 12, [-0.012, 0.075, -PT / 2 - 0.0022], [PI / 2, 0, 0]));
  // side buttons, bottom port and speaker holes
  Q.add('aluFrame', rbox(0.0016, 0.022, 0.0035, 0.0007, [PWd / 2 + 0.0004, 0.03, 0]), rbox(0.0016, 0.014, 0.0035, 0.0007, [-PWd / 2 - 0.0004, 0.045, 0]), rbox(0.0016, 0.014, 0.0035, 0.0007, [-PWd / 2 - 0.0004, 0.026, 0]));
  Q.add('black', rbox(0.01, 0.0012, 0.003, 0.0005, [0, -PHt / 2 - 0.0002, 0]));
  for (let k = 0; k < 5; k++) Q.add('black', cyl(0.0006, 0.0006, 0.0012, 6, [0.012 + k * 0.0028, -PHt / 2 - 0.0002, 0]), cyl(0.0006, 0.0006, 0.0012, 6, [-0.012 - k * 0.0028, -PHt / 2 - 0.0002, 0]));
  Q.build(ph, M);
  const scrU = { uLock: { value: null }, uHome: { value: null }, uMix: { value: 0 }, uOn: { value: 0 }, uT: { value: 0 } };
  [scrU.uLock.value, scrU.uHome.value] = phoneScreens();
  const scrG = new THREE.ShapeGeometry(rrShape(PWd - 0.0025, PHt - 0.0025, 0.0115), 10), sp = scrG.attributes.position, su = scrG.attributes.uv;
  for (let i = 0; i < sp.count; i++) su.setXY(i, sp.getX(i) / PWd + 0.5, sp.getY(i) / PHt + 0.5);
  const screen = new THREE.Mesh(scrG, new THREE.ShaderMaterial({ uniforms: scrU, vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: PHONE_FRAG }));
  screen.position.z = PT / 2 + 0.0002; ph.add(screen);
  // the 1994 touchscreen phone, lying on a small acrylic block behind (generic, unbranded)
  const old = new THREE.Group(); old.position.set(0.145, 0.0, -0.06); old.rotation.set(0, 0.5, 0); G.add(old);
  const O = parts();
  O.add('acrylicSolid', rbox(0.1, 0.014, 0.2, 0.003, [0, 0.007, 0]));
  O.add('plasticDark', bake(rbox(0.074, 0.23, 0.044, 0.012), [0, 0.038, 0], [-PI / 2, 0, 0]));
  O.add('plasticGrey', bake(rbox(0.062, 0.006, 0.12, 0.003), [0, 0.06, 0.015]));
  O.add('plasticDark', cyl(0.006, 0.0045, 0.03, 10, [0.024, 0.04, -0.125], [PI / 2, 0, 0]));
  for (let k = 0; k < 6; k++) O.add('black', box(0.03, 0.0012, 0.002, [0, 0.0605, -0.09 + k * 0.004]));
  O.build(old, M);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.054, 0.1), new THREE.MeshStandardMaterial({ map: simonScreenTexture(), roughness: 0.35, emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0 }));
  lcd.material.emissiveMap = lcd.material.map; lcd.rotation.x = -PI / 2; lcd.position.set(0, 0.0632, 0.012); old.add(lcd);
  const pW = (v) => v.clone().applyEuler(ph.rotation).add(ph.position);
  return { group: G, scrU, lcdM: lcd.material, anchors: { focus: V3(0.02, 0.1, 0), screen: pW(V3(0.02, 0.03, PT / 2)), old: V3(0.145, 0.06, -0.06) } };
}

// ================================================================================== 9 · mRNA
export function buildMRNA(M, lite) {
  const G = new THREE.Group(), P = parts();
  // ---- the vial (2×): glass, milky suspension, label, aluminium crimp, flip-off cap
  const VX = -0.25, VZ = 0.07;
  const vialG = lathe([[0, 0.002], [0.019, 0], [0.0215, 0.003], [0.0215, 0.064], [0.019, 0.071], [0.011, 0.076], [0.0098, 0.08], [0.0098, 0.083], [0.0125, 0.084], [0.0125, 0.087], [0, 0.087]], 40);
  const vial = new THREE.Mesh(bake(vialG, [VX, 0, VZ]), M.glassClear); vial.renderOrder = 3; G.add(vial);
  const liq = new THREE.Mesh(bake(lathe([[0, 0.003], [0.0195, 0.003], [0.0198, 0.04], [0, 0.04]], 32), [VX, 0, VZ]), M.liquid); liq.renderOrder = 2; G.add(liq);
  const labM = new THREE.MeshStandardMaterial({ map: vialLabelTexture(), roughness: 0.55 });
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0218, 0.0218, 0.04, 40, 1, true, -PI * 0.9, PI * 1.8), labM); lab.position.set(VX, 0.03, VZ); lab.rotation.y = -0.3; G.add(lab);
  P.add('alu', lathe([[0.0126, 0.078], [0.0136, 0.079], [0.0136, 0.091], [0.0115, 0.0915], [0.0115, 0.09], [0, 0.09]], 32).translate(VX, 0, VZ));
  P.add('capBlue', bake(lathe([[0, 0], [0.0128, 0], [0.0132, 0.002], [0.013, 0.007], [0.0115, 0.0078], [0, 0.0078]], 32), [VX, 0.0905, VZ]));
  // ---- the syringe (2×) in an acrylic cradle: barrel with scale, stopper, plunger, luer tip, needle
  const sy = new THREE.Group(); sy.position.set(-0.04, 0.026, 0.12); sy.rotation.y = 0.32; G.add(sy);
  const Y = parts();
  for (const x of [-0.05, 0.04]) Y.add('acrylicSolid', box(0.012, 0.016, 0.03, [x, -0.018, 0]));
  const barrelM = new THREE.MeshStandardMaterial({ map: syringeScaleTexture(), transparent: true, roughness: 0.08, metalness: 0, envMapIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.11, 32, 1, true), barrelM); barrel.rotation.set(0, 0, PI / 2); barrel.position.set(0, 0, 0); barrel.renderOrder = 3; sy.add(barrel);
  Y.add('liquidOpaque', cyl(0.0088, 0.0088, 0.04, 24, [0.033, 0, 0], [0, 0, PI / 2]));
  Y.add('silicone', bake(lathe([[0, 0], [0.0088, 0], [0.009, 0.002], [0.0086, 0.004], [0.009, 0.006], [0.0086, 0.008], [0.006, 0.01], [0, 0.01]], 24), [0.013, 0, 0], [0, 0, -PI / 2]));
  Y.add('whitePlastic', box(0.09, 0.012, 0.0018, [-0.035, 0, 0]), box(0.09, 0.0018, 0.012, [-0.035, 0, 0]), cyl(0.012, 0.012, 0.002, 24, [-0.08, 0, 0], [0, 0, PI / 2]));
  Y.add('whitePlastic', bake(rbox(0.003, 0.028, 0.016, 0.002), [-0.055, 0, 0]));                                   // finger flange
  Y.add('whitePlastic', bake(lathe([[0.0095, 0], [0.0095, 0.002], [0.004, 0.006], [0.0022, 0.016], [0, 0.016]], 20), [0.055, 0, 0], [0, 0, -PI / 2]));
  Y.add('capBlue', bake(lathe([[0.0045, 0], [0.0045, 0.012], [0.0016, 0.014], [0, 0.014]], 16), [0.069, 0, 0], [0, 0, -PI / 2]));
  Y.add('steel', cyl(0.00045, 0.00045, 0.05, 6, [0.106, 0, 0], [0, 0, PI / 2]));
  Y.add('plasticGrey', bake(lathe([[0, 0], [0.0042, 0], [0.0044, 0.03], [0.002, 0.034], [0, 0.034]], 16), [0.08, -0.012, 0.03], [0, 0, -PI / 2 + 0.04]));   // the needle's cap, laid aside
  Y.build(sy, M);
  // ---- the lipid nanoparticle on its acrylic rod, cut open toward the visitor on the coiled mRNA
  const NP = V3(0.13, 0.27, -0.03), NR = 0.085;
  P.add('acrylicSolid', cyl(0.05, 0.055, 0.01, 32, [NP.x, 0.005, NP.z]), cyl(0.003, 0.003, NP.y - NR * 0.9, 10, [NP.x, (NP.y - NR * 0.9) / 2 + 0.01, NP.z]));
  P.build(G, M);
  const lnp = new THREE.Group(); lnp.position.copy(NP); G.add(lnp);
  const cutDir = V3(0.35, 0.45, 1).normalize(), cosLim = 0.62;
  const R = rng(2020), n = lite ? 380 : 760, pts = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const d = V3(Math.cos(a) * r, y, Math.sin(a) * r);
    if (d.dot(cutDir) > cosLim) continue;
    pts.push(d);
  }
  const headR = lite ? 0.0085 : 0.0062;
  const headM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.35, metalness: 0, emissive: '#000000' });
  const heads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(headR, lite ? 0 : 1), headM, pts.length);
  const col = new THREE.Color(), PAL = ['#8fd8e6', '#8fd8e6', '#8fd8e6', '#b6e6c8', '#f2c7e3', '#f7f2d6'];
  pts.forEach((d, i) => {
    _m.compose(d.clone().multiplyScalar(NR), _q.identity(), _s.setScalar(0.85 + 0.3 * R())); heads.setMatrixAt(i, _m);
    heads.setColorAt(i, col.set(PAL[Math.floor(R() * PAL.length)]));
  });
  _s.set(1, 1, 1);
  heads.castShadow = true; heads.receiveShadow = true; lnp.add(heads);
  // the lipid layer under the heads (a shell, cut the same way) and the dark ionizable core
  const shellM = new THREE.MeshStandardMaterial({ color: '#2a5560', roughness: 0.5, metalness: 0, side: THREE.DoubleSide, emissive: '#000000' });
  const shellMesh = new THREE.Mesh(cutSphere(NR - 0.006, lite ? 28 : 48, lite ? 18 : 32, cutDir, cosLim - 0.04), shellM); lnp.add(shellMesh);
  const coreM = new THREE.MeshStandardMaterial({ color: '#1a0e1c', roughness: 0.6, metalness: 0, emissive: '#000000', side: THREE.BackSide });
  const core = new THREE.Mesh(new THREE.SphereGeometry(NR - 0.014, lite ? 20 : 32, lite ? 14 : 22), coreM); lnp.add(core);
  // the mRNA coiled inside (glows), and the strand running out of the opening as a single-stranded helix
  const coilPts = []; let p = V3(0, 0, 0);
  for (let i = 0; i < 26; i++) { const d = V3(R() - 0.5, R() - 0.5, R() - 0.5).normalize().multiplyScalar(0.022); p = p.clone().add(d); if (p.length() > 0.05) p.multiplyScalar(0.05 / p.length()); coilPts.push(p.clone()); }
  coilPts.push(cutDir.clone().multiplyScalar(0.06));
  const strandU = { uRev: { value: 0 }, uI: { value: 0 }, uT: { value: 0 } };
  const strandMat = new THREE.ShaderMaterial({
    uniforms: strandU,
    vertexShader: /* glsl */ `attribute float aU; varying float vU; varying vec3 vN, vV; void main(){ vU = aU; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uRev, uI, uT; varying float vU; varying vec3 vN, vV;
      void main(){ if (vU > uRev + 0.001) discard; float head = exp(-max(0.0, uRev - vU) * 18.0) * step(uRev, 0.999);
        float rim = 0.55 + 0.45 * pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
        float run = 0.8 + 0.2 * sin(vU * 90.0 - uT * 8.0);
        vec3 c = mix(vec3(1.0, 0.35, 0.75), vec3(1.0, 0.85, 0.95), head);
        gl_FragColor = vec4(c * uI * rim * run * (1.0 + 2.5 * head), 1.0); }`,
  });
  const withU = (g, u0, u1) => { const pa = g.attributes.uv, a = new Float32Array(g.attributes.position.count); for (let i = 0; i < a.length; i++) a[i] = u0 + (u1 - u0) * pa.getX(i); g.setAttribute('aU', new THREE.BufferAttribute(a, 1)); return g; };
  const coilGeo = withU(tubeAlong(curve(coilPts), 0.0021, lite ? 120 : 240, lite ? 4 : 6), 0, 0.42);
  // outside: from the opening, out and down to the right in a loose single-stranded helix
  const o0 = cutDir.clone().multiplyScalar(0.06).add(NP);
  const path = curve([o0, o0.clone().add(V3(0.03, 0.02, 0.03)), V3(NP.x + 0.12, NP.y - 0.02, NP.z + 0.06), V3(NP.x + 0.17, NP.y - 0.11, NP.z + 0.07), V3(NP.x + 0.16, NP.y - 0.2, NP.z + 0.06)]);
  const hp = [], N = 160;
  const fr = path.computeFrenetFrames(N, false);
  for (let i = 0; i <= N; i++) { const u = i / N, c = path.getPointAt(u), a = u * 14 * TAU, r = 0.007; hp.push(c.clone().addScaledVector(fr.normals[i], Math.cos(a) * r).addScaledVector(fr.binormals[i], Math.sin(a) * r).sub(NP)); }
  const outGeo = withU(tubeAlong(curve(hp), 0.0019, lite ? 160 : 320, lite ? 4 : 6), 0.42, 1);
  // the bases: short rungs off the backbone, coloured A / U / G / C
  const baseGeos = [], BASEC = [new THREE.Color('#ff6b6b'), new THREE.Color('#ffd166'), new THREE.Color('#5ad1ff'), new THREE.Color('#8affb0')];
  const hc = curve(hp);
  const nb = lite ? 40 : 90;
  for (let i = 0; i < nb; i++) {
    const u = (i + 0.5) / nb, c = hc.getPointAt(u), t = hc.getTangentAt(u), k = Math.min(N, Math.round(u * N)), axis = path.getPointAt(u).sub(NP);
    const out = c.clone().sub(axis).normalize();
    const g = beam(c.clone().addScaledVector(out, 0.004), out, 0.008, 0.0024, 0.0016, t);
    withU(g, 0, 0); g.attributes.aU.array.fill(0.42 + 0.58 * u);
    const cc = BASEC[Math.floor(R() * 4)], ca = new Float32Array(g.attributes.position.count * 3);
    for (let j = 0; j < ca.length; j += 3) { ca[j] = cc.r; ca[j + 1] = cc.g; ca[j + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); baseGeos.push(g); void k;
  }
  const strand = new THREE.Mesh(mergeU([coilGeo, outGeo]), strandMat); lnp.add(strand);
  const basesMat = strandMat.clone(); basesMat.uniforms = strandU; basesMat.vertexColors = true;
  basesMat.vertexShader = basesMat.vertexShader.replace('varying float vU;', 'varying float vU; varying vec3 vC;').replace('vU = aU;', 'vU = aU; vC = color;');
  basesMat.fragmentShader = basesMat.fragmentShader.replace('varying float vU;', 'varying float vU; varying vec3 vC;').replace('vec3 c = mix(vec3(1.0, 0.35, 0.75), vec3(1.0, 0.85, 0.95), head);', 'vec3 c = mix(vC, vec3(1.0), head);');
  const bases = new THREE.Mesh(mergeU(baseGeos, true), basesMat); lnp.add(bases);
  return {
    group: G, lnp, headM, shellM, coreM, strandU, NP,
    anchors: { focus: V3(0.02, 0.15, 0.02), lnp: NP.clone().add(V3(0.02, 0.06, 0.05)), strand: V3(NP.x + 0.17, NP.y - 0.1, NP.z + 0.07), vial: V3(VX, 0.07, VZ), syringe: V3(-0.02, 0.03, 0.13), core: NP.clone() },
  };
}
// merge keeping aU (and colour)
function mergeU(geos, color = false) {
  const keys = ['position', 'normal', 'aU', ...(color ? ['color'] : [])];
  const list = geos.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!keys.includes(k)) n.deleteAttribute(k); if (!n.attributes.normal) n.computeVertexNormals(); return n; });
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const size = list[0].attributes[k].itemSize, total = list.reduce((s, g) => s + g.attributes[k].count, 0), arr = new Float32Array(total * size);
    let o = 0; for (const g of list) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
