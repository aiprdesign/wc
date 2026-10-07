// THE DREAM OF FLIGHT — the four real aircraft, modelled to hold up in Explore (close inspection from any side):
//   · Humber-Sommer pusher biplane, 1911 (Henri Pequet's airmail, Allahabad): doped linen with rib tapes and
//     sag between the ribs, spruce struts in metal sockets, steel bracing wire with turnbuckles and eyes,
//     ailerons, a seven-cylinder Gnome rotary (finned barrels, heads, pushrods, rockers, plugs and leads),
//     a laminated Chauvière-style propeller, wire-spoked wheels on bungee-sprung skids, fuel tank with straps,
//     wicker seat, wheel, footbar, rev counter, the pilot, two mail sacks.
//   · de Havilland DH.80A Puss Moth, 1932 (J. R. D. Tata, VT-ADN): metal cowl panels with fasteners, fabric
//     over stringers aft, glazed cabin you can see into (seats, panel, column, the pilot), framed windows,
//     door, louvres, exhaust, metal propeller with painted tips, V-struts with fittings and pitot, split
//     undercarriage, braced tailplane, hinged rudder and elevators, navigation lights, registration letters.
//   · HAL HF-24 Marut, 1961 and HAL Tejas: natural-metal / painted skins with staggered panel lines and rivet
//     rows, hinge lines of every control surface, open cockpits under clear (Marut) / gold-tinted (Tejas)
//     canopies with ejection seats, panels, gunsight / HUD and pilots, intakes with lips, splitters and dark
//     ducts, nozzles with heat tint (Marut twin jet pipes and cones; Tejas petals, liner and flame holder),
//     pitot booms, antennae, pylons and tanks, IAF roundels and fin flashes painted onto the skin.
// Each builder keeps the scale, origin and returned handles the shots in flight.js pose; M.lite builds ≈⅓.
import * as THREE from 'three';
import { lerp, TAU } from '../../lib/math.js';
import { V3, bake, merge, box, cyl, rod, strut, tubeAlong, wingGeo, plate, lathe } from './flight-assets.js';
import { skin, glassMat, woodLam, letterTexture, panelTexture, turnbuckle, eye, spokedWheel, pilot, ejectionSeat } from './flight-skin.js';

const UP = V3(0, 1, 0);
function add(g, geos, mat, { cast = true } = {}) {
  const list = geos.filter(Boolean);
  if (!list.length) return null;
  const m = new THREE.Mesh(merge(list), mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m;
}
const qFrom = (dir) => new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
// rectangular-section member from a to b (w across, d along the flow +X)
function bar(a, b, w, d) {
  const g = new THREE.BoxGeometry(d, a.distanceTo(b), w);
  const Y = b.clone().sub(a).normalize();
  let X = V3(1, 0, 0).addScaledVector(Y, -Y.x); if (X.lengthSq() < 1e-4) X = V3(0, 0, 1).addScaledVector(Y, -Y.z); X.normalize();
  const Z = V3().crossVectors(X, Y);
  return g.applyMatrix4(new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(a.clone().lerp(b, 0.5)));
}
// a metal socket (ferrule) at p, sleeving a member running along dir
function socket(p, dir, r = 0.03, len = 0.07) {
  const g = new THREE.CylinderGeometry(r, r * 1.08, len, 8); g.translate(0, len / 2 - 0.01, 0);
  g.applyQuaternion(qFrom(dir)); g.translate(p.x, p.y, p.z);
  return g;
}
// airfoil loop (LE → upper → TE → lower), chord u in [0, 1]
function foil(n, t, cam) {
  const up = [], lo = [];
  for (let i = 0; i <= n; i++) {
    const x = (1 - Math.cos((i / n) * Math.PI)) / 2;
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4) + 0.002;
    const yc = cam * 4 * x * (1 - x);
    up.push([x, yc + yt]); lo.push([x, yc - yt]);
  }
  return [...up, ...lo.slice(1, -1).reverse()];
}
// a lofted propeller blade along +Y (radius r0 → r1); chord along Z, thickness along X (the rotation axis).
// chord(u), thick(u) (fraction of chord), twist(r) (radians); a rounded cap closes the tip.
function propBlade(r0, r1, chord, thick, twist, { ns = 18, nc = 9, cam = 0.06 } = {}) {
  const pos = [], idx = [];
  let m = 0;
  for (let j = 0; j <= ns; j++) {
    const u = j / ns, r = lerp(r0, r1, u), c = Math.max(chord(u), 0.004), t = thick(u), a = twist(r);
    const loop = foil(nc, t, cam); m = loop.length;
    for (const [x, y] of loop) {
      const zc = (0.3 - x) * c, xc = -y * c;               // chord along Z (leading edge toward +Z), thickness along X
      pos.push(xc * Math.cos(a) - zc * Math.sin(a), r, xc * Math.sin(a) + zc * Math.cos(a));
    }
  }
  for (let j = 0; j < ns; j++) for (let i = 0; i < m; i++) { const a = j * m + i, b = j * m + (i + 1) % m, c = a + m, d = b + m; idx.push(a, c, b, b, c, d); }
  const tip = pos.length / 3; pos.push(0, r1 + 0.004, 0);
  for (let i = 0; i < m; i++) idx.push(ns * m + i, tip, ns * m + (i + 1) % m);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // make the winding face outward (test the mid-span section)
  const P = g.attributes.position, Nn = g.attributes.normal, j0 = Math.floor(ns / 2) * m; let s = 0;
  const cx = V3(); for (let i = 0; i < m; i++) cx.add(V3().fromBufferAttribute(P, j0 + i)); cx.multiplyScalar(1 / m);
  for (let i = 0; i < m; i++) { const p = V3().fromBufferAttribute(P, j0 + i).sub(cx); p.y = 0; s += Math.sign(p.dot(V3().fromBufferAttribute(Nn, j0 + i))); }
  if (s < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}
// body of superellipse rings through explicit x stations (nose first) and angle stations (0 → 2π, 0 = top).
// keep(x, a, y, z) false drops a quad (window / cockpit openings); scale / off shrink or push the shell.
function bodyS(xs, as, fn, { keep = null, scale = 1, off = 0 } = {}) {
  const pos = [], uv = [], idx = [], nr = as.length - 1;
  const at = (x, a) => {
    const [w, h, yc, e] = fn(x), k = 2 / (e || 2), ca = Math.cos(a), sa = Math.sin(a);
    let y = Math.max(h, 1e-4) * Math.sign(ca) * Math.pow(Math.abs(ca), k), z = Math.max(w, 1e-4) * Math.sign(sa) * Math.pow(Math.abs(sa), k);
    const r = Math.hypot(y, z) || 1; y = y * scale + (y / r) * off; z = z * scale + (z / r) * off;
    return [yc + y, z];
  };
  xs.forEach((x, j) => as.forEach((a, i) => { const [y, z] = at(x, a); pos.push(x, y, z); uv.push(j / (xs.length - 1), i / nr); }));
  for (let j = 0; j < xs.length - 1; j++) for (let i = 0; i < nr; i++) {
    if (keep) { const xm = (xs[j] + xs[j + 1]) / 2, am = (as[i] + as[i + 1]) / 2, [y, z] = at(xm, am); if (!keep(xm, am, y, z)) continue; }
    const a = j * (nr + 1) + i, b = a + 1, c = a + nr + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  // outward test
  const P = g.attributes.position, N = g.attributes.normal; let s = 0;
  for (let k = 0; k < idx.length; k += 30) { const i = idx[k]; const x = P.getX(i), [, , yc] = fn(x); s += Math.sign(N.getY(i) * (P.getY(i) - yc) + N.getZ(i) * P.getZ(i)); }
  if (s < 0) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
const uniq = (arr, desc = false) => { const s = [...arr].sort((p, q) => (desc ? q - p : p - q)); return s.filter((v, i) => i === 0 || Math.abs(v - s[i - 1]) > 1e-4); };
// point on a superellipse section at angle a (0 = top), pushed out by off
function secPt(fn, x, a, off = 0) {
  const [w, h, yc, e] = fn(x), k = 2 / (e || 2), ca = Math.cos(a), sa = Math.sin(a);
  const y = h * Math.sign(ca) * Math.pow(Math.abs(ca), k), z = w * Math.sign(sa) * Math.pow(Math.abs(sa), k), r = Math.hypot(y, z) || 1;
  return V3(x, yc + y + (y / r) * off, z + (z / r) * off);
}
// a closed frame (tube) round an x/angle window on a body
function frameAround(fn, x0, x1, a0, a1, off, r, n = 6) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(secPt(fn, lerp(x0, x1, i / n), a0, off));
  for (let i = 0; i < n; i++) pts.push(secPt(fn, x1, lerp(a0, a1, i / n), off));
  for (let i = 0; i < n; i++) pts.push(secPt(fn, lerp(x1, x0, i / n), a1, off));
  for (let i = 0; i < n; i++) pts.push(secPt(fn, x0, lerp(a1, a0, i / n), off));
  pts.push(pts[0].clone());
  return tubeAlong(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), () => r, n * 8, 5);
}
// sill line where a body surface enters a canopy ellipsoid (centre c, radii k), as a closed loop of points
function canopySill(fn, c, k, xa, xb, n = 28) {
  const inside = (p) => ((p.x - c.x) / k.x) ** 2 + ((p.y - c.y) / k.y) ** 2 + (p.z / k.z) ** 2 < 1 && p.y > c.y;
  const right = [];
  for (let i = 0; i <= n; i++) {
    const x = lerp(xa, xb, i / n);
    if (!inside(secPt(fn, x, 0))) continue;
    let lo = 0, hi = Math.PI / 2;
    for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (inside(secPt(fn, x, m))) lo = m; else hi = m; }
    right.push(secPt(fn, x, lo, 0.004));
  }
  const left = right.map((p) => V3(p.x, p.y, -p.z)).reverse();
  return [...right, ...left, right[0].clone()];
}
function canopyGlass(c, k, x0 = -1, x1 = 1, seg = 32) {
  return bake(new THREE.SphereGeometry(1, seg, Math.round(seg / 2), 0, TAU, 0, Math.PI / 2), [c.x, c.y, c.z], [0, 0, 0], [k.x, k.y, k.z]);
}
// frame bow where the canopy ellipsoid meets the plane x = xc
function canopyBow(c, k, xc, r, n = 16) {
  const u = (xc - c.x) / k.x, f = Math.sqrt(Math.max(0, 1 - u * u)), pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n * Math.PI; pts.push(V3(xc, c.y + k.y * f * Math.sin(t) + 0.004, (k.z * f + 0.004) * Math.cos(t))); }
  return tubeAlong(new THREE.CatmullRomCurve3(pts), () => r, n * 2, 6);
}
function flipWinding(g) { const ix = g.index.array; for (let k = 0; k < ix.length; k += 3) { const t = ix[k + 1]; ix[k + 1] = ix[k + 2]; ix[k + 2] = t; } g.computeVertexNormals(); return g; }
function panelQuad(texture, w, h, p, r, crop = [0, 0, 1, 1]) {
  const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, crop[0] + uv.getX(i) * crop[2], crop[1] + uv.getY(i) * crop[3]);
  return bake(g, p, r);
}

// ================================================================== HUMBER-SOMMER BIPLANE, 1911 (m; nose +X, origin on the ground)
export function buildSommer(M) {
  const lite = !!M.lite;
  const g = new THREE.Group(); g.name = 'sommer';
  const L = { wood: [], fab: [], eng: [], brass: [], rub: [], bag: [], dark: [], steel: [], cloth: [], skin: [], leather: [], glass: [], cord: [], panel: [], wicker: [] };
  const LE = 0.95, CH = 1.85, YL = 1.15, YU = 2.95;
  const SEG = lite ? 6 : 10;
  // doped linen: the rib tapes stand proud and the fabric sags a little between them (ribs every 1/26 of span)
  skin(M.fabric, { fab: { mode: 'uv', n: 26, tape: 0.0012, sag: 0.0035, tw: 0.05 }, noise: { rough: 0.12, scale: 2, streak: 0.06, grime: 0.05 } }, lite);
  const plane = (y, span, chord, xle = LE) => { const st = []; for (let i = 0; i <= 8; i++) { const z = -span + i / 8 * 2 * span; st.push({ x: xle, y, z, c: chord }); } return st; };
  const WN = lite ? 8 : 14;
  L.fab.push(wingGeo(plane(YL, 4.3, CH), { n: WN, t: 0.035, cam: 0.05 }));
  L.fab.push(wingGeo(plane(YU, 5.3, CH), { n: WN, t: 0.035, cam: 0.05 }));
  const yAt = (y, x) => y + 0.05 * CH * 4 * ((LE - x) / CH) * (1 - (LE - x) / CH);
  const TE = LE - CH;
  // ailerons trailing the outer upper and lower wing (hinged to the rear spar, a little droop at speed)
  for (const s of [1, -1]) for (const [y, z0, z1] of [[YU, 2.7, 5.25], [YL, 2.5, 4.25]]) {
    const st = [z0, (z0 + z1) / 2, z1].map((z) => ({ x: TE - 0.02, y: y + 0.004 - 0.02, z: s * z, c: 0.55 }));
    if (s < 0) st.reverse();
    L.fab.push(wingGeo(st, { n: lite ? 6 : 8, t: 0.04, cam: 0.0 }));
    for (const z of [z0 + 0.3, z1 - 0.3]) { L.dark.push(rod(V3(TE + 0.01, y, s * z), V3(TE - 0.04, y, s * z), 0.012, 6)); }
    if (!lite) { const hz = s * (z0 + 0.6); L.dark.push(box(0.03, 0.14, 0.012, [TE - 0.1, y - 0.07, hz])); L.steel.push(rod(V3(TE - 0.1, y - 0.14, hz), V3(1.35, YL + 0.5, s * 0.22), 0.0018, 3)); }
  }
  // trailing-edge wires and the leading-edge spar cap strips
  for (const [y, sp] of [[YL, 4.3], [YU, 5.3]]) {
    L.steel.push(rod(V3(TE + 0.005, y, -sp), V3(TE + 0.005, y, sp), 0.003, 4));
    L.wood.push(rod(V3(LE - 0.012, y + 0.006, -sp), V3(LE - 0.012, y + 0.006, sp), 0.016, 8));
  }
  // interplane struts in sockets, extension struts to the upper tips
  const fx = LE - 0.18, rx = LE - CH * 0.72;
  const strutF = (a, b, w, d) => {
    L.wood.push(strut(a, b, w, d, SEG));
    if (!lite) for (const [p, q] of [[a, b], [b, a]]) { const dir = q.clone().sub(p).normalize(); L.dark.push(socket(p, dir, Math.max(w, d) * 0.62, 0.08)); L.dark.push(bake(new THREE.BoxGeometry(0.09, 0.006, 0.05), [p.x, p.y + (dir.y > 0 ? 0.004 : -0.004), p.z])); }
  };
  const stations = [-0.65, 0.65, -2.0, 2.0, -3.4, 3.4, -4.25, 4.25];
  for (const z of stations) for (const x of [fx, rx]) strutF(V3(x, yAt(YL, x), z), V3(x, yAt(YU, x), z), 0.022, 0.05);
  for (const s of [1, -1]) for (const x of [fx, rx]) strutF(V3(x, yAt(YL, x), s * 4.25), V3(x, yAt(YU, x), s * 5.15), 0.02, 0.045);
  // bracing: flying / landing wires (an X in every bay, front and rear), incidence wires across each strut pair
  const wires = [];
  const bays = [-4.25, -3.4, -2.0, -0.65, 0.65, 2.0, 3.4, 4.25];
  for (let i = 0; i < bays.length - 1; i++) {
    const z0 = bays[i], z1 = bays[i + 1];
    for (const x of [fx, rx]) wires.push([V3(x, yAt(YL, x), z0), V3(x, yAt(YU, x), z1)], [V3(x, yAt(YL, x), z1), V3(x, yAt(YU, x), z0)]);
  }
  for (const z of stations) wires.push([V3(fx, yAt(YL, fx), z), V3(rx, yAt(YU, rx), z)], [V3(rx, yAt(YL, rx), z), V3(fx, yAt(YU, fx), z)]);
  for (const s of [1, -1]) wires.push([V3(fx, yAt(YL, fx), s * 4.25), V3(rx, yAt(YU, rx), s * 5.15)], [V3(rx, yAt(YL, rx), s * 4.25), V3(fx, yAt(YU, fx), s * 5.15)]);
  // skids (curling up at the front) on struts, paired wire wheels on a bungee-sprung axle
  for (const s of [1, -1]) {
    const z = s * 0.95;
    const sk = new THREE.CatmullRomCurve3([V3(-1.2, 0.42, z), V3(0.4, 0.4, z), V3(1.8, 0.48, z), V3(2.7, 0.8, z), V3(3.0, 1.25, z), V3(2.85, 1.5, z)]);
    L.wood.push(tubeAlong(sk, (u) => 0.04 * (1 - 0.3 * u), lite ? 24 : 48, lite ? 6 : 8));
    strutF(V3(fx, YL, z), V3(fx, 0.42, z), 0.022, 0.05); strutF(V3(rx, YL, z), V3(rx + 0.2, 0.42, z), 0.022, 0.05);
    L.wood.push(strut(V3(2.2, 0.55, z), V3(LE + 0.05, YL, z), 0.02, 0.04, SEG), strut(V3(2.85, 1.48, z), V3(LE, YU - 0.02, z * 0.7), 0.018, 0.035, SEG));
    if (!lite) for (const x of [-0.8, 0.0, 0.8, 1.6, 2.4]) L.dark.push(bake(new THREE.TorusGeometry(0.044, 0.006, 4, 12), [x, sk.getPointAt(Math.min(1, (x + 1.2) / 4.6)).y, z], [0, Math.PI / 2, 0]));
    wires.push([V3(fx, YL, z), V3(rx + 0.2, 0.42, z)], [V3(2.2, 0.55, z), V3(fx, YL, z)]);
    for (const dz of [0.22, -0.22]) {
      const W = spokedWheel(V3(0.35, 0.33, z + dz), 0.37, 0.04, { spokes: 24, hubR: 0.05, hubW: 0.11, lite });
      L.rub.push(W.tyre); L.steel.push(W.rim, ...W.spokes); L.brass.push(...W.hub);
    }
    L.dark.push(rod(V3(0.35, 0.33, z - 0.34), V3(0.35, 0.33, z + 0.34), 0.016, 8));
    // axle hangs from the skid on wound rubber cord (several turns each side of the skid)
    for (let k = 0; k < (lite ? 2 : 6); k++) L.cord.push(bake(new THREE.TorusGeometry(0.035, 0.011, 5, 12), [0.35, 0.37, z + (k - 2.5) * 0.022], [0, 0, 0], [1, 1.6, 1]));
    L.dark.push(box(0.06, 0.1, 0.05, [0.35, 0.42, z]));
  }
  // tail booms: square spruce longerons converging on the box tail, posts, cross members, metal junction plates
  const TX0 = -5.9, TX1 = -7.0, TY0 = 1.75, TY1 = 2.55, TZ = 0.85;
  const kAt = (x) => (x - TE) / (TX0 - TE);
  for (const s of [1, -1]) {
    L.wood.push(bar(V3(TE, YU, s * 1.5), V3(TX0, TY1, s * TZ), 0.045, 0.045), bar(V3(TE, YL, s * 1.5), V3(TX0, TY0, s * TZ), 0.045, 0.045));
    const mx = -3.4, k = kAt(mx), zm = lerp(1.5, TZ, k) * s, yu = lerp(YU, TY1, k), yl = lerp(YL, TY0, k);
    L.wood.push(bar(V3(mx, yl, zm), V3(mx, yu, zm), 0.032, 0.032), bar(V3(TX0, TY0, s * TZ), V3(TX0, TY1, s * TZ), 0.032, 0.032));
    wires.push([V3(mx, yl, zm), V3(TX0, TY1, s * TZ)], [V3(mx, yu, zm), V3(TX0, TY0, s * TZ)], [V3(TE, YL, s * 1.5), V3(mx, yu, zm)], [V3(TE, YU, s * 1.5), V3(mx, yl, zm)]);
    if (!lite) for (const p of [V3(mx, yl, zm), V3(mx, yu, zm), V3(TX0, TY0, s * TZ), V3(TX0, TY1, s * TZ), V3(TE, YU, s * 1.5), V3(TE, YL, s * 1.5)]) L.dark.push(bake(new THREE.BoxGeometry(0.11, 0.11, 0.055), [p.x, p.y, p.z]));
  }
  for (const [x, y] of [[-3.4, lerp(YL, TY0, kAt(-3.4))], [-3.4, lerp(YU, TY1, kAt(-3.4))], [TX0, TY0], [TX0, TY1]]) {
    const z = lerp(1.5, TZ, kAt(x)); L.wood.push(bar(V3(x, y, -z), V3(x, y, z), 0.028, 0.028));
  }
  wires.push([V3(-3.4, lerp(YL, TY0, kAt(-3.4)), -lerp(1.5, TZ, kAt(-3.4))), V3(-3.4, lerp(YU, TY1, kAt(-3.4)), lerp(1.5, TZ, kAt(-3.4)))], [V3(-3.4, lerp(YL, TY0, kAt(-3.4)), lerp(1.5, TZ, kAt(-3.4))), V3(-3.4, lerp(YU, TY1, kAt(-3.4)), -lerp(1.5, TZ, kAt(-3.4)))]);
  // box tail: two lifting surfaces (elevator on the rear of the upper one), two framed rudders between them
  for (const y of [TY0, TY1]) L.fab.push(wingGeo([{ x: TX0 + 0.15, y, z: -1.35, c: 1.25 }, { x: TX0 + 0.15, y, z: 0, c: 1.25 }, { x: TX0 + 0.15, y, z: 1.35, c: 1.25 }], { n: lite ? 8 : 12, t: 0.04, cam: 0.02 }));
  L.fab.push(wingGeo([{ x: TX0 - 1.12, y: TY1 - 0.01, z: -1.3, c: 0.5 }, { x: TX0 - 1.12, y: TY1 - 0.01, z: 0, c: 0.5 }, { x: TX0 - 1.12, y: TY1 - 0.01, z: 1.3, c: 0.5 }], { n: lite ? 6 : 8, t: 0.04, cam: 0 }));
  L.dark.push(rod(V3(TX0 - 1.11, TY1, -1.3), V3(TX0 - 1.11, TY1, 1.3), 0.01, 6));
  for (const s of [1, -1]) {
    const rz = s * 0.55, outline = [[0, 0], [0.75, 0], [0.8, 0.8], [0, 0.8]];
    L.fab.push(bake(plate(outline, 0.025, 0.004), [TX1 - 0.2, TY0, rz]));
    const pts = [...outline, outline[0]].map(([x, y]) => V3(TX1 - 0.2 + x, TY0 + y, rz));
    L.wood.push(tubeAlong(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.01), () => 0.012, 40, 5));
    L.wood.push(rod(V3(TX1 - 0.18, TY0, rz), V3(TX1 - 0.18, TY1, rz), 0.015, 6));
    if (!lite) for (const y of [TY0 + 0.15, TY1 - 0.15]) L.dark.push(cyl(0.02, 0.02, 0.04, 8, [TX1 - 0.18, y, rz]));
    L.dark.push(box(0.012, 0.16, 0.1, [TX1 + 0.3, TY0 + 0.4, rz + s * 0.06]));                 // rudder horn
    L.steel.push(rod(V3(TX1 + 0.3, TY0 + 0.47, rz + s * 0.08), V3(1.8, 0.98, s * 0.18), 0.0018, 3));   // rudder cable to the footbar
  }
  // tail skid
  L.wood.push(strut(V3(TX0 + 0.1, TY0, 0.6), V3(TX0 + 0.5, TY0 - 0.55, 0.6), 0.02, 0.04, SEG), strut(V3(TX0 + 0.1, TY0, -0.6), V3(TX0 + 0.5, TY0 - 0.55, -0.6), 0.02, 0.04, SEG));
  L.wood.push(tubeAlong(new THREE.CatmullRomCurve3([V3(TX0 + 0.85, TY0 - 0.5, 0), V3(TX0 + 0.45, TY0 - 0.58, 0), V3(TX0 - 0.1, TY0 - 0.45, 0)]), () => 0.025, 12, 6));
  L.wood.push(rod(V3(TX0 + 0.5, TY0 - 0.56, -0.6), V3(TX0 + 0.5, TY0 - 0.56, 0.6), 0.015, 6));

  // ---- the pilot's station: a wicker seat on a spruce frame, the control wheel on its column, the footbar,
  // a rev counter and the oil pulsator glass, the pilot, the mail sacks, the fuel tank
  const SX = 1.15, SY = YL + 0.12;
  L.wood.push(box(0.06, 0.04, 0.5, [SX + 0.2, YL + 0.04, 0]), box(0.06, 0.04, 0.5, [SX - 0.22, YL + 0.04, 0]));
  L.wicker.push(bake(lathe([[0.001, 0], [0.22, 0.0], [0.24, 0.03], [0.23, 0.08]], lite ? 10 : 18), [SX, SY, 0], [0, 0, 0], [1.1, 1, 1.0]));
  L.wicker.push(bake(new THREE.CylinderGeometry(0.24, 0.22, 0.42, lite ? 10 : 18, 1, true, Math.PI * 0.85, Math.PI * 1.3), [SX - 0.02, SY + 0.25, 0], [0, 0, 0.12], [1.05, 1, 1]));
  L.wicker.push(bake(new THREE.TorusGeometry(0.235, 0.014, 5, 20, Math.PI * 1.3), [SX - 0.04, SY + 0.46, 0], [Math.PI / 2, 0, Math.PI * 0.35 + Math.PI], [1.05, 1, 1]));
  for (const s of [1, -1]) { L.wood.push(rod(V3(1.0, YL + 0.05, s * 0.3), V3(1.8, 0.95, s * 0.3), 0.018, 6)); }
  L.wood.push(rod(V3(1.8, 0.95, -0.32), V3(1.8, 0.95, 0.32), 0.022, 8));
  for (const s of [1, -1]) L.dark.push(box(0.02, 0.08, 0.12, [1.8, 1.0, s * 0.16]));
  L.wood.push(rod(V3(1.3, YL + 0.05, -0.3), V3(1.3, YL + 0.05, 0.3), 0.018, 6));
  L.dark.push(rod(V3(1.45, YL + 0.06, 0), V3(1.42, YL + 0.68, 0), 0.016, 8));
  L.wood.push(bake(new THREE.TorusGeometry(0.11, 0.013, 6, 24), [1.42, YL + 0.72, 0], [0, Math.PI / 2, 0]));
  for (let k = 0; k < 3; k++) { const a = k / 3 * TAU + 0.5; L.dark.push(rod(V3(1.42, YL + 0.72, 0), V3(1.42, YL + 0.72 + Math.sin(a) * 0.1, Math.cos(a) * 0.1), 0.006, 4)); }
  L.dark.push(cyl(0.02, 0.02, 0.05, 8, [1.42, YL + 0.72, 0], [0, 0, Math.PI / 2]));
  // instruments on a little board between the front struts of the centre bay
  const pt = panelTexture('wood', 5);
  M.panelWood ??= new THREE.MeshStandardMaterial({ map: pt, roughness: 0.4, metalness: 0 });
  L.panel.push(panelQuad(pt, 0.26, 0.13, [fx + 0.03, YL + 0.5, 0], [0, -Math.PI / 2, 0], [0.05, 0.12, 0.52, 0.76]));
  L.wood.push(box(0.02, 0.15, 0.3, [fx + 0.045, YL + 0.5, 0]));
  for (const s of [1, -1]) L.wood.push(rod(V3(fx + 0.04, YL + 0.5, s * 0.15), V3(fx, YL + 0.03, s * 0.55), 0.01, 4));
  // the pilot (Henri Pequet: coat, cap worn back to front, goggles), hands on the wheel
  const P = pilot(V3(SX - 0.02, SY + 0.06, 0), '1911', { hands: [V3(1.4, YL + 0.74, 0.1), V3(1.4, YL + 0.74, -0.1)], lean: 0.12, lite });
  L.cloth.push(...P.suit); L.skin.push(...P.skin); L.leather.push(...P.head); L.dark.push(...P.dark); L.glass.push(...P.glass);
  // mail sacks: canvas, gathered necks tied with cord, lashed to the lower wing either side of the seat
  for (const s of [1, -1]) {
    const c = V3(0.45, YL + 0.22, s * 0.48);
    L.bag.push(bake(lathe([[0.001, -0.2], [0.16, -0.18], [0.21, -0.08], [0.22, 0.05], [0.18, 0.14], [0.08, 0.2], [0.045, 0.24], [0.06, 0.3], [0.03, 0.33]], lite ? 10 : 16), [c.x, c.y, c.z], [0, 0, Math.PI / 2 - 0.15], [1, 1, 0.82]));
    L.cord.push(bake(new THREE.TorusGeometry(0.05, 0.008, 4, 12), [c.x + 0.24, c.y + 0.03, c.z], [0, Math.PI / 2, 0]));
    L.leather.push(bake(new THREE.TorusGeometry(0.205, 0.011, 4, 20), [c.x - 0.05, c.y, c.z], [0, Math.PI / 2, 0], [1, 1, 0.82]), bake(new THREE.TorusGeometry(0.205, 0.011, 4, 20), [c.x + 0.07, c.y, c.z], [0, Math.PI / 2, 0], [1, 1, 0.82]));
    L.cloth.push(bake(new THREE.BoxGeometry(0.003, 0.07, 0.05), [c.x + 0.32, c.y - 0.02, c.z + s * 0.02], [0, 0, -0.3]));
  }
  // fuel tank (brass, domed ends, two straps to the bearers, filler cap, feed pipe to the engine)
  L.brass.push(bake(lathe([[0.001, -0.47], [0.08, -0.46], [0.13, -0.43], [0.15, -0.38], [0.15, 0.38], [0.13, 0.43], [0.08, 0.46], [0.001, 0.47]], lite ? 12 : 24), [0.1, YL + 0.35, 0], [Math.PI / 2, 0, 0]));
  for (const z of [-0.25, 0.25]) L.dark.push(bake(new THREE.TorusGeometry(0.155, 0.008, 4, 24), [0.1, YL + 0.35, z]));
  L.brass.push(cyl(0.03, 0.03, 0.04, 10, [0.1, YL + 0.52, 0.1]));
  L.steel.push(tubeAlong(new THREE.CatmullRomCurve3([V3(0.1, YL + 0.2, 0), V3(-0.3, YL + 0.3, 0), V3(-0.75, 2.0, 0), V3(-0.85, 2.05, 0)]), () => 0.008, 16, 5));
  for (const s of [1, -1]) L.wood.push(rod(V3(0.1, YL, s * 0.3), V3(0.1, YL + 0.22, s * 0.3), 0.015, 5));
  // engine bearers and the fixed crankshaft plate
  const EX = LE - CH - 0.15, EYc = 2.05;
  for (const s of [1, -1]) L.wood.push(bar(V3(EX + 0.6, YL, s * 0.35), V3(EX + 0.12, EYc - 0.05, s * 0.14), 0.035, 0.035), bar(V3(EX + 0.6, YU, s * 0.35), V3(EX + 0.12, EYc + 0.05, s * 0.14), 0.035, 0.035));
  L.eng.push(cyl(0.05, 0.05, 0.5, 12, [EX + 0.3, EYc, 0], [0, 0, Math.PI / 2]));
  L.dark.push(bake(new THREE.BoxGeometry(0.02, 0.36, 0.36), [EX + 0.13, EYc, 0]));
  if (!lite) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; L.dark.push(cyl(0.012, 0.012, 0.035, 6, [EX + 0.13, EYc + Math.cos(a) * 0.14, Math.sin(a) * 0.14], [0, 0, Math.PI / 2])); }

  M.wicker ??= new THREE.MeshStandardMaterial({ color: '#b08a50', roughness: 0.75, metalness: 0 });
  M.cord ??= new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8, metalness: 0 });
  M.lens ??= new THREE.MeshStandardMaterial({ color: '#141a1e', roughness: 0.05, metalness: 0 });
  add(g, L.wood, M.spruce); add(g, L.fab, M.fabric); add(g, L.brass, M.brass); add(g, L.rub, M.rubber); add(g, L.bag, M.canvasBag); add(g, L.dark, M.darkMetal);
  add(g, L.cloth, M.cloth); add(g, L.skin, M.skin); add(g, L.leather, M.leather); add(g, L.eng, M.engine); add(g, L.panel, M.panelWood); add(g, L.wicker, M.wicker); add(g, L.cord, M.cord); add(g, L.glass, M.lens);
  // bracing wire: steel rods, a turnbuckle at the lower end, an eye at both
  const wr = [...L.steel];
  for (const [a, b] of wires) {
    wr.push(rod(a, b, lite ? 0.0055 : 0.0035, 4));
    if (!lite) { const d = b.clone().sub(a).normalize(); wr.push(turnbuckle(a.clone().addScaledVector(d, 0.12), d), eye(a.clone().addScaledVector(d, 0.02), d), eye(b.clone().addScaledVector(d, -0.02), d)); }
  }
  add(g, wr, M.steel ?? M.darkMetal);
  // rotary engine + pusher propeller (turn together about X)
  const rot = new THREE.Group(); rot.position.set(EX, EYc, 0); g.add(rot);
  const re = [], rf = [], rb = [];
  re.push(bake(lathe([[0.03, -0.17], [0.08, -0.16], [0.12, -0.13], [0.165, -0.1], [0.176, -0.085], [0.176, 0.085], [0.165, 0.1], [0.12, 0.13], [0.07, 0.16], [0.04, 0.22]], lite ? 14 : 28), [0, 0, 0], [0, 0, -Math.PI / 2]));
  if (!lite) for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; for (const x of [-0.115, 0.115]) rf.push(cyl(0.008, 0.008, 0.02, 6, [x, Math.cos(a) * 0.15, Math.sin(a) * 0.15], [0, 0, Math.PI / 2])); }
  const NF = lite ? 6 : 13;
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * TAU, dir = V3(0, Math.cos(a), Math.sin(a)), at = (r, x = 0) => V3(x, dir.y * r, dir.z * r);
    const tan = V3(0, -Math.sin(a), Math.cos(a));
    re.push(rod(at(0.16), at(0.405), 0.05, lite ? 8 : 14));
    for (let f = 0; f < NF; f++) { const r = 0.19 + f * (0.19 / (NF - 1)); rf.push(bake(new THREE.CylinderGeometry(0.073 - f * 0.0012, 0.073 - f * 0.0012, 0.004, lite ? 10 : 16), [0, dir.y * r, dir.z * r], [a, 0, 0])); }
    // head: domed cap with the exhaust valve cage, rocker arm on its pillar, pushrod down to the crankcase
    re.push(bake(lathe([[0.056, 0], [0.058, 0.012], [0.05, 0.03], [0.03, 0.042], [0.001, 0.046]], lite ? 8 : 14), [0, dir.y * 0.405, dir.z * 0.405], [a, 0, 0]));
    if (!lite) {
      const hd = at(0.452);
      rf.push(bake(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 8), [hd.x, hd.y, hd.z], [a, 0, 0]));
      rf.push(rod(at(0.44, 0.05), at(0.465, 0.0), 0.008, 5), rod(at(0.465, 0.0), at(0.455, -0.03), 0.007, 5));
      rf.push(rod(at(0.18, 0.12), at(0.44, 0.055), 0.006, 5));
      const plug = at(0.37).addScaledVector(tan, 0.06);
      rb.push(bake(new THREE.CylinderGeometry(0.008, 0.01, 0.04, 6), [plug.x, plug.y, plug.z], [0, 0, 0]).applyQuaternion(new THREE.Quaternion()), rod(plug, plug.clone().addScaledVector(tan, 0.03), 0.009, 6));
      rb.push(tubeAlong(new THREE.CatmullRomCurve3([plug.clone().addScaledVector(tan, 0.03), at(0.3, 0.08).addScaledVector(tan, 0.07), at(0.15, 0.17), V3(0.2, 0, 0)]), () => 0.0035, 10, 4));
    }
  }
  rb.push(cyl(0.035, 0.035, 0.05, 12, [0.2, 0, 0], [0, 0, Math.PI / 2]));
  rot.add(new THREE.Mesh(merge(re), M.engine), new THREE.Mesh(merge(rf), M.darkMetal));
  if (rb.length) rot.add(new THREE.Mesh(merge(rb), M.brass));
  // laminated propeller (Chauvière Intégrale-like): wide paddle blades, strong twist, steel hub plates and bolts
  const R1 = 1.25, PITCH = 1.6;
  const chord = (u) => (u < 0.08 ? 0.11 : 0.11 + 0.15 * Math.sin(Math.min(1, (u - 0.08) / 0.82) * Math.PI * 0.62)) * (u > 0.9 ? Math.sqrt(Math.max(0, 1 - ((u - 0.9) / 0.1) ** 2)) * 0.85 + 0.15 : 1);
  const thick = (u) => lerp(0.75, 0.08, Math.min(1, u * 1.6)) * (u < 0.08 ? 1 : 1) + (u < 0.06 ? 0.3 : 0);
  const twist = (r) => Math.atan(PITCH / (TAU * Math.max(r, 0.12)));
  const pr = [];
  for (const s of [0, Math.PI]) pr.push(bake(propBlade(0.06, R1, chord, thick, twist, { ns: lite ? 10 : 22, nc: lite ? 6 : 10 }), [-0.22, 0, 0], [s, 0, 0]));
  pr.push(cyl(0.085, 0.085, 0.13, lite ? 10 : 20, [-0.22, 0, 0], [0, 0, Math.PI / 2]));
  const propMesh = new THREE.Mesh(merge(pr), woodLam(1.17)); rot.add(propMesh);
  const hubM = [cyl(0.1, 0.1, 0.012, 16, [-0.15, 0, 0], [0, 0, Math.PI / 2]), cyl(0.1, 0.1, 0.012, 16, [-0.29, 0, 0], [0, 0, Math.PI / 2])];
  for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; hubM.push(cyl(0.008, 0.008, 0.17, 6, [-0.22, Math.cos(a) * 0.07, Math.sin(a) * 0.07], [0, 0, Math.PI / 2])); }
  rot.add(new THREE.Mesh(merge(hubM), M.darkMetal));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a3a20').multiplyScalar(0.5), transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.set(EX - 0.22, EYc, 0); disc.rotation.y = Math.PI / 2; g.add(disc);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  disc.castShadow = false;
  return { group: g, rotor: rot, disc, prop: propMesh, bags: V3(0.45, YL + 0.3, 0.48) };
}

// ================================================================== DE HAVILLAND PUSS MOTH, 1932 (m; nose +X, origin at the datum)
export function buildPussMoth(M) {
  const lite = !!M.lite;
  const g = new THREE.Group(); g.name = 'pussmoth';
  const L = { body: [], trim: [], wing: [], dark: [], glass: [], rub: [], metal: [], chrome: [], lining: [], seat: [], panel: [], suit: [], skin: [], head: [], lens: [], red: [], green: [], white: [], yellow: [], prop: [] };
  const fus = (x) => {
    if (x > 1.95) { const u = (x - 1.95) / 0.6; return [0.4 * Math.sqrt(Math.max(0, 1 - u * u * 0.85)) + 0.02, 0.48 * Math.sqrt(Math.max(0, 1 - u * u * 0.8)) + 0.02, -0.05 - 0.05 * u, 2.6]; }
    if (x > -0.4) { const u = (1.95 - x) / 2.35; return [lerp(0.4, 0.5, Math.min(1, u * 2)), lerp(0.48, 0.66, Math.min(1, u * 1.6)), lerp(-0.05, 0.02, u), 3.2]; }
    const u = (-0.4 - x) / 4.55; return [lerp(0.5, 0.07, Math.pow(u, 0.9)), lerp(0.66, 0.16, Math.pow(u, 0.85)), lerp(0.02, 0.3, u * u), lerp(3.2, 2.4, u)];
  };
  // openings: windscreen (round the top, ahead of the wing) and three windows a side (in body-angle terms)
  const e = 3.2, aW0 = Math.acos(Math.pow(0.5, e / 2)), aW1 = Math.acos(Math.pow(0.05, e / 2)), aS = 0.62;
  const WIN = [[0.95, 0.45], [0.38, -0.12], [-0.2, -0.55]], WS = [1.04, 1.33];
  const inWin = (x, a) => {
    if (x > WS[0] && x < WS[1] && (a < aS || a > TAU - aS)) return true;
    for (const [x0, x1] of WIN) if (x < x0 && x > x1 && ((a > aW0 && a < aW1) || (a > TAU - aW1 && a < TAU - aW0))) return true;
    return false;
  };
  const xs = uniq([...lin(2.55, -4.95, lite ? 60 : 110), ...WIN.flat(), ...WS], true);
  const as = uniq([...lin(0, TAU, lite ? 24 : 44), aW0, aW1, TAU - aW1, TAU - aW0, aS, TAU - aS]);
  L.body.push(bodyS(xs, as, fus, { keep: (x, a) => !inWin(x, a) }));
  L.glass.push(bodyS(xs.filter((x) => x <= 1.4 && x >= -0.6), as, fus, { keep: (x, a) => inWin(x, a), off: 0.003 }));
  // the cabin from inside: lining (seen from within), floor, bulkheads
  const cx = xs.filter((x) => x <= 1.42 && x >= -0.72);
  L.lining.push(bodyS(cx, lin(0, TAU, lite ? 16 : 28), fus, { scale: 0.975 }));
  L.lining.push(bake(new THREE.CircleGeometry(0.62, 20), [-0.7, 0.04, 0], [0, Math.PI / 2, 0], [1, 1, 0.85]));
  L.lining.push(bake(new THREE.CircleGeometry(0.55, 20), [1.4, -0.03, 0], [0, -Math.PI / 2, 0], [1, 1, 0.8]));
  L.seat.push(box(2.0, 0.03, 0.8, [0.35, -0.42, 0]));
  // frames round every opening, the windscreen centre post
  if (!lite) {
    for (const [x0, x1] of WIN) for (const sd of [1, -1]) L.trim.push(frameAround(fus, x1, x0, sd > 0 ? aW0 : TAU - aW1, sd > 0 ? aW1 : TAU - aW0, 0.006, 0.011));
    L.trim.push(frameAround(fus, WS[0], WS[1], -aS, aS, 0.006, 0.012));
    L.trim.push(tubeAlong(new THREE.CatmullRomCurve3([secPt(fus, WS[0], 0, 0.006), secPt(fus, WS[1], 0, 0.006)]), () => 0.012, 4, 5));
  }
  // cheat stripe (thin bands standing proud of the skin)
  const gridSurfL = (fn, nu, nv) => { const pos = [], idx = []; for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = fn(i / nu, j / nv); pos.push(p.x, p.y, p.z); } for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const k = j * (nu + 1) + i; idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1); } const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); q.setIndex(idx); q.computeVertexNormals(); return q; };
  for (const s of [1, -1]) { const st = gridSurfL((u, v) => { const x = lerp(2.4, -4.6, u), [w, h, yc] = fus(x), y = yc + lerp(-0.05, 0.07, v) * (h / 0.6); return V3(x, y, s * (w * 1.003 + 0.004)); }, 60, 2); L.trim.push(s > 0 ? flipWinding(st) : st); }
  // high wing, two halves (fabric over ribs; ailerons outboard), on the cabin roof
  const ws = []; for (let i = 0; i <= 12; i++) { const s = i / 12, z = s * 5.6; ws.push({ x: 1.02 - s * 0.15, y: 0.68 + s * 0.18, z, c: lerp(1.75, 1.2, s) - (s > 0.92 ? (s - 0.92) * 4 : 0) }); }
  L.wing.push(wingGeo(ws, { n: lite ? 8 : 16, t: 0.13, cam: 0.025 }));
  L.wing.push(wingGeo(ws.map((w) => ({ ...w, z: -w.z })), { n: lite ? 8 : 16, t: 0.13, cam: 0.025 }));
  // navigation lights (port red, starboard green), tail light
  L.red.push(bake(new THREE.SphereGeometry(0.035, 10, 6), [0.55, 0.87, -5.6])); L.green.push(bake(new THREE.SphereGeometry(0.035, 10, 6), [0.55, 0.87, 5.6]));
  // V-struts (streamlined, forked end fittings) and jury struts; pitot head on the starboard strut
  for (const s of [1, -1]) {
    const foot = V3(0.4, -0.6, s * 0.48), A = V3(0.8, 0.81, s * 2.8), B = V3(-0.25, 0.81, s * 2.8);
    L.metal.push(strut(foot, A, 0.03, 0.07, lite ? 6 : 12), strut(foot, B, 0.03, 0.07, lite ? 6 : 12));
    L.metal.push(strut(V3(0.55, -0.1, s * 1.55), V3(0.55, 0.78, s * 1.55), 0.015, 0.03, 8), strut(V3(0.55, -0.1, s * 1.55), V3(0.15, 0.78, s * 1.7), 0.012, 0.025, 6));
    if (!lite) for (const [p, q] of [[foot, A], [foot, B], [A, foot], [B, foot]]) L.dark.push(socket(p, q.clone().sub(p), 0.035, 0.1));
    L.dark.push(box(0.16, 0.08, 0.1, [0.4, -0.58, s * 0.47]));
  }
  L.chrome.push(rod(V3(0.62, 0.15, 2.0), V3(0.9, 0.15, 2.0), 0.008, 6), rod(V3(0.62, 0.15, 2.0), V3(0.6, 0.0, 1.96), 0.008, 6));
  // undercarriage: faired oleo legs, radius rods, wheels with hub caps and brake drums, sprung tail skid
  for (const s of [1, -1]) {
    const top = V3(0.95, -0.5, s * 0.46), axle = V3(0.95, -1.42, s * 1.05);
    L.metal.push(strut(top, top.clone().lerp(axle, 0.72), 0.06, 0.13, lite ? 8 : 14), rod(V3(0.4, -0.6, s * 0.46), axle, 0.025, 8));
    L.chrome.push(rod(top.clone().lerp(axle, 0.68), axle, 0.03, 10));
    L.dark.push(bake(new THREE.BoxGeometry(0.1, 0.1, 0.12), [axle.x, axle.y, axle.z]));
    const wc = V3(axle.x, axle.y, axle.z + s * 0.06);
    L.rub.push(bake(new THREE.TorusGeometry(0.24, 0.085, lite ? 8 : 14, lite ? 20 : 36), [wc.x, wc.y, wc.z]));
    L.metal.push(bake(lathe([[0.001, -0.07], [0.12, -0.07], [0.165, -0.05], [0.17, 0.0], [0.165, 0.05], [0.12, 0.07], [0.001, 0.075]], lite ? 12 : 24), [wc.x, wc.y, wc.z], [Math.PI / 2, 0, 0]));
    L.chrome.push(bake(new THREE.SphereGeometry(0.06, 14, 6, 0, TAU, 0, Math.PI / 2), [wc.x, wc.y, wc.z + s * 0.07], [s * Math.PI / 2, 0, 0], [1, 0.35, 1]));
    if (!lite) for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; L.dark.push(cyl(0.008, 0.008, 0.02, 6, [wc.x + Math.cos(a) * 0.1, wc.y + Math.sin(a) * 0.1, wc.z + s * 0.075], [Math.PI / 2, 0, 0])); }
  }
  L.dark.push(tubeAlong(new THREE.CatmullRomCurve3([V3(-4.3, 0.24, 0), V3(-4.55, 0.0, 0), V3(-4.75, -0.12, 0)]), () => 0.02, 10, 6));
  L.metal.push(bake(new THREE.BoxGeometry(0.16, 0.025, 0.06), [-4.78, -0.13, 0], [0, 0, 0.2]));
  // tail: the de Havilland fin and rudder (hinge line, horn, cables), braced tailplane and elevators, tail light
  const finO = [[-3.9, 0.42], [-4.3, 0.75], [-4.55, 1.05], [-4.72, 1.25], [-4.88, 1.33], [-5.02, 1.3], [-5.1, 1.15], [-5.12, 0.8], [-5.08, 0.4], [-4.98, 0.15], [-4.6, 0.25]];
  L.body.push(plate(finO, 0.05, 0.012));
  const tp = () => plate([[0, 0], [0.15, 1.55], [-0.35, 1.7], [-0.8, 1.6], [-0.9, 0.25], [-0.85, 0]], 0.05, 0.012);
  for (const s of [1, -1]) L.wing.push(bake(tp(), [-4.15, 0.32, 0], [s * Math.PI / 2, 0, 0]));
  for (const s of [1, -1]) {
    L.metal.push(strut(V3(-4.2, -0.02, s * 0.07), V3(-4.45, 0.31, s * 0.95), 0.012, 0.03, 6));
    L.dark.push(box(0.012, 0.12, 0.06, [-4.86, 0.5, s * 0.05]));
    L.chrome.push(rod(V3(-4.86, 0.56, s * 0.06), V3(-3.2, 0.3, s * 0.3), 0.002, 3));
  }
  L.white.push(bake(new THREE.SphereGeometry(0.025, 8, 6), [-5.13, 0.95, 0]));
  // engine cowl: louvres, nose ring, cooling-air intake under the spinner, exhaust manifold and tail pipe
  if (!lite) for (let i = 0; i < 7; i++) for (const s of [1, -1]) {
    const x = 2.25 - i * 0.065, [w, , yc] = fus(x);
    L.body.push(bake(new THREE.BoxGeometry(0.05, 0.11, 0.008), [x, yc + 0.05, s * (w + 0.008)], [0, s * 0.4, 0]));
    L.dark.push(bake(new THREE.BoxGeometry(0.02, 0.1, 0.004), [x + 0.015, yc + 0.05, s * (w + 0.002)]));
  }
  L.trim.push(bake(new THREE.TorusGeometry(0.15, 0.02, 6, 24), [2.5, -0.07, 0], [0, Math.PI / 2, 0]));
  L.dark.push(bake(new THREE.BoxGeometry(0.06, 0.07, 0.24), [2.47, -0.28, 0]));
  L.chrome.push(tubeAlong(new THREE.CatmullRomCurve3([V3(2.2, -0.12, -0.36), V3(2.05, -0.3, -0.43), V3(1.6, -0.38, -0.47), V3(0.6, -0.46, -0.52), V3(0.2, -0.5, -0.53)]), () => 0.032, 24, lite ? 6 : 10));
  L.dark.push(bake(new THREE.CircleGeometry(0.028, 10), [0.2, -0.5, -0.53], [0, -Math.PI / 2, 0]));
  for (const x of [1.4, 0.9]) L.metal.push(rod(V3(x, -0.42, -0.5), V3(x, -0.38, -0.44), 0.008, 4));
  // door (starboard, round the middle windows), handle, step
  if (!lite) L.trim.push(frameAround(fus, -0.15, 0.42, aW0 - 0.15, 1.95, 0.004, 0.006, 5));
  L.chrome.push(rod(V3(0.0, -0.05, 0.53), V3(0.1, -0.05, 0.53), 0.008, 6));
  L.metal.push(rod(V3(0.2, -0.62, 0.42), V3(0.2, -0.75, 0.62), 0.012, 6), box(0.16, 0.012, 0.1, [0.2, -0.75, 0.66]));
  // inside: instrument panel, control column, the pilot (J. R. D. Tata), passenger seats
  const pt = panelTexture('wood', 9);
  M.panelWood ??= new THREE.MeshStandardMaterial({ map: pt, roughness: 0.4, metalness: 0 });
  L.panel.push(panelQuad(pt, 0.62, 0.26, [1.28, 0.12, 0], [0, -Math.PI / 2, 0]));
  L.lining.push(box(0.16, 0.06, 0.66, [1.25, 0.28, 0]));
  L.dark.push(rod(V3(0.95, -0.42, 0), V3(0.92, 0.0, 0), 0.016, 6), bake(new THREE.TorusGeometry(0.08, 0.012, 5, 16, Math.PI), [0.92, 0.04, 0], [0, Math.PI / 2, 0]));
  const seatAt = (x, z) => { L.seat.push(box(0.4, 0.08, 0.42, [x, -0.25, z]), bake(new THREE.BoxGeometry(0.07, 0.55, 0.42), [x - 0.2, 0.02, z], [0, 0, 0.18])); L.dark.push(box(0.36, 0.14, 0.04, [x, -0.34, z + 0.18]), box(0.36, 0.14, 0.04, [x, -0.34, z - 0.18])); };
  seatAt(0.5, 0); seatAt(-0.15, 0.12); seatAt(-0.45, -0.12);
  const P = pilot(V3(0.48, -0.18, 0), '1932', { hands: [V3(0.88, 0.03, 0.06), V3(0.75, -0.05, -0.26)], lean: 0.15, lite });
  for (const k of ['suit', 'skin', 'head']) L[k].push(...P[k].map((q) => q.scale(1, 1, 1)));
  L.dark.push(...P.dark); L.lens.push(...P.glass);
  // metal propeller (painted yellow tips) and the maroon spinner
  const prop = new THREE.Group(); prop.position.set(2.62, -0.07, 0); g.add(prop);
  {
    const ch = (u) => lerp(0.12, 0.09, u) * (u > 0.88 ? Math.sqrt(Math.max(0, 1 - ((u - 0.88) / 0.12) ** 2)) * 0.8 + 0.2 : 1) + (u < 0.1 ? 0.02 * (1 - u / 0.1) : 0);
    const th = (u) => lerp(0.3, 0.07, Math.min(1, u * 1.4));
    const tw = (r) => Math.atan(1.7 / (TAU * Math.max(r, 0.12)));
    const pr = [], tips = [];
    for (const s of [0, Math.PI]) {
      pr.push(bake(propBlade(0.06, 0.9, ch, th, tw, { ns: lite ? 8 : 18, nc: lite ? 6 : 9 }), [0, 0, 0], [s, 0, 0]));
      tips.push(bake(propBlade(0.9, 1.0, (u) => ch(0.9 + u * 0.1), (u) => th(0.9 + u * 0.1), tw, { ns: lite ? 3 : 5, nc: lite ? 6 : 9 }), [0, 0, 0], [s, 0, 0]));
    }
    M.propMetal ??= new THREE.MeshStandardMaterial({ color: '#a9adb2', metalness: 1, roughness: 0.32 });
    M.tipYellow ??= new THREE.MeshStandardMaterial({ color: '#e8b820', roughness: 0.45 });
    prop.add(new THREE.Mesh(merge(pr), M.propMetal), new THREE.Mesh(merge(tips), M.tipYellow));
    prop.add(new THREE.Mesh(bake(lathe([[0.13, 0], [0.12, 0.08], [0.07, 0.17], [0.0, 0.22]], lite ? 12 : 24), [0, 0, 0], [0, 0, -Math.PI / 2]), M.maroon));
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9aa0a6').multiplyScalar(0.35), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  disc.position.set(2.66, -0.07, 0); disc.rotation.y = Math.PI / 2; g.add(disc);
  // materials: cream lacquer (metal cowl panels with fasteners ahead of the cabin, fabric over stringers
  // aft), registration letters VT-ADN on both sides and under the port wing; silver-doped wing fabric
  const letters = letterTexture('VT-ADN', { color: '#2a1612' });
  const cream = skin(M.cream.clone(), {
    panel: { s: [0.42, 0, 0], lw: 0.0025, depth: 0.0008, region: [1.05, 2.6], grime: 0.3, tint: 0.02, rough: 0.08 }, rivet: { s: 0.06, o: 0.012, r: 0.004, h: 0.0005 },
    lines: [{ a: 'y', at: -0.05, c: 'x', lo: 1.0, hi: 2.5, w: 0.003 }, { a: 'x', at: 1.0, w: 0.004 }, { a: 'x', at: -4.55, c: 'y', lo: -0.1, hi: 0.4 }],
    stringer: { xMax: 1.0, n: 12, yc: 0.05, h: 0.0012, sag: 0.0028 }, noise: { rough: 0.15, scale: 1.4, streak: 0.18, grime: 0.06 },
    chip: { amt: 0.12, scale: 9, col: '#8a8f94', metal: 1, rough: 0.4 },
    decals: { text: [{ U: [1, 0, 0], V: [0, 1, 0], u0: -3.25, v0: -0.17, w: 1.75, h: 0.19, sign: 1, axis: 2 }, { U: [-1, 0, 0], V: [0, 1, 0], u0: 1.5, v0: -0.17, w: 1.75, h: 0.19, sign: -1, axis: 2 }] }, tex: letters, decalRough: 0.35,
  }, lite);
  cream.map = null; cream.color.set('#b6a98a');
  const silver = skin(M.silverDope.clone(), {
    fab: { mode: 'z', s: 0.3, tape: 0.0009, sag: 0.0022, tw: 0.012 }, noise: { rough: 0.12, scale: 1.0, streak: 0.12, grime: 0.04 },
    lines: [{ a: 'x', at: 0.12, sl: -0.03, b: 'z', c: 'z', symC: true, lo: 3.2, hi: 5.5, w: 0.005 }, { a: 'z', absA: true, at: 3.2, c: 'x', lo: -0.35, hi: 0.12, w: 0.005 }, { a: 'z', absA: true, at: 0.62, c: 'x', lo: -0.75, hi: 1.05, w: 0.004 }],
    decals: { text: [{ U: [0, 0, -1], V: [1, 0, 0], u0: 1.3, v0: -0.4, w: 3.6, h: 0.75, sign: -1, axis: 1 }] }, tex: letters, decalRough: 0.4,
  }, lite);
  silver.map = null; silver.color.set('#a4a7aa');
  M.cabin ??= new THREE.MeshStandardMaterial({ color: '#3a2a22', roughness: 0.85, side: THREE.BackSide });
  M.cabinSeat ??= new THREE.MeshStandardMaterial({ color: '#5a3424', roughness: 0.7 });
  M.chrome ??= new THREE.MeshStandardMaterial({ color: '#d8dade', metalness: 1, roughness: 0.18 });
  M.tweed ??= new THREE.MeshStandardMaterial({ color: '#6a6052', roughness: 0.85 });
  M.helmetLeather ??= new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.55 });
  M.lens ??= new THREE.MeshStandardMaterial({ color: '#141a1e', roughness: 0.05, metalness: 0 });
  const navM = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.2 });
  add(g, L.body, cream); add(g, L.trim, M.maroon); add(g, L.wing, silver); add(g, L.dark, M.darkMetal); add(g, L.rub, M.rubber); add(g, L.metal, M.engine); add(g, L.chrome, M.chrome);
  add(g, L.lining, M.cabin, { cast: false }); add(g, L.seat, M.cabinSeat); add(g, L.panel, M.panelWood); add(g, L.suit, M.tweed); add(g, L.skin, M.skin); add(g, L.head, M.helmetLeather); add(g, L.lens, M.lens);
  add(g, L.red, navM('#d02010')); add(g, L.green, navM('#10a030')); add(g, L.white, navM('#f0f0e0'));
  const gl = add(g, L.glass, glassMat({ key: 'puss', base: 0.08 }), { cast: false }); gl.renderOrder = 2;
  g.traverse((o) => { if (o.isMesh && o !== gl) { o.castShadow = true; o.receiveShadow = true; } });
  disc.castShadow = false;
  return { group: g, prop, disc };
}

// ------------------------------------------------------------------ jets: shared cockpit dressing
function jetCockpit(L, { seatP, seatH, panelX, panelY, panelW, kind, lite }) {
  const S = ejectionSeat(seatP, { h: seatH, w: 0.48, lite });
  L.seatFrame.push(...S.frame); L.cushion.push(...S.cushion); L.stripe.push(...S.stripe); L.belt.push(...S.belt);
  const pt = panelTexture(kind === 'tejas' ? 'glass' : 'jet', kind === 'tejas' ? 13 : 7);
  L.panelTex = pt;
  L.panel.push(panelQuad(pt, panelW, panelW * 0.5, [panelX, panelY, 0], [0, -Math.PI / 2, 0.12]));
  L.tub.push(bake(new THREE.BoxGeometry(0.3, 0.05, panelW + 0.08), [panelX + 0.12, panelY + panelW * 0.25 + 0.04, 0]));   // coaming
  L.tub.push(box(0.03, 0.4, 0.12, [panelX + 0.02, panelY - 0.35, 0]));
  L.dark.push(rod(V3(seatP.x + 0.48, seatP.y - 0.05, 0), V3(seatP.x + 0.44, seatP.y + 0.3, 0), 0.016, 6), cyl(0.024, 0.02, 0.1, 8, [seatP.x + 0.44, seatP.y + 0.35, 0]));
  // gunsight (Marut) / head-up display (Tejas): a glass combiner over the coaming
  L.tub.push(box(0.14, 0.1, 0.12, [panelX + 0.08, panelY + panelW * 0.25 + 0.11, 0]));
  L.combiner.push(bake(new THREE.PlaneGeometry(0.12, 0.13), [panelX + 0.05, panelY + panelW * 0.25 + 0.24, 0], [0, -Math.PI / 2, -0.45]));
  const P = pilot(V3(seatP.x + 0.03, seatP.y + 0.08, 0), 'jet', { hands: [V3(seatP.x + 0.44, seatP.y + 0.36, 0.03), V3(seatP.x + 0.2, seatP.y + 0.3, -0.27)], lean: 0.18, lite });
  L.suit.push(...P.suit); L.helmet.push(...P.head); L.dark.push(...P.dark, ...P.skin); L.visor.push(...P.glass);
}
function jetMaterials(M) {
  M.tub ??= new THREE.MeshStandardMaterial({ color: '#3c4044', roughness: 0.6, metalness: 0 });
  M.tubIn ??= new THREE.MeshStandardMaterial({ color: '#2e3236', roughness: 0.7, side: THREE.BackSide });
  M.seatFrame ??= new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.5, metalness: 0.6 });
  M.cushion ??= new THREE.MeshStandardMaterial({ color: '#4a4636', roughness: 0.85 });
  M.belt ??= new THREE.MeshStandardMaterial({ color: '#6a6244', roughness: 0.8 });
  M.stripe ??= (() => {
    const c = document.createElement('canvas'); c.width = 64; c.height = 8; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#141414' : '#e8c020'; x.fillRect(i * 8, 0, 8, 8); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
  })();
  M.flightSuit ??= new THREE.MeshStandardMaterial({ color: '#5a6248', roughness: 0.85 });
  M.helmetW ??= new THREE.MeshStandardMaterial({ color: '#e6e4de', roughness: 0.35 });
  M.visor ??= new THREE.MeshStandardMaterial({ color: '#4a3410', roughness: 0.06, metalness: 1 });
  M.combiner ??= glassMat({ key: 'combiner', base: 0.05, tint: '#90c8a0' });
  M.duct ??= new THREE.MeshStandardMaterial({ color: '#1c1e20', roughness: 0.7, metalness: 0.2 });
  M.soot ??= new THREE.MeshStandardMaterial({ color: '#141210', roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide });
  M.navR ??= new THREE.MeshStandardMaterial({ color: '#c01810', emissive: '#c01810', emissiveIntensity: 0.6, roughness: 0.2 });
  M.navG ??= new THREE.MeshStandardMaterial({ color: '#10a030', emissive: '#10a030', emissiveIntensity: 0.6, roughness: 0.2 });
}
function addCockpit(g, L, M) {
  add(g, L.tub, M.tub); add(g, L.tubIn, M.tubIn, { cast: false }); add(g, L.seatFrame, M.seatFrame); add(g, L.cushion, M.cushion); add(g, L.stripe, M.stripe); add(g, L.belt, M.belt);
  add(g, L.suit, M.flightSuit); add(g, L.helmet, M.helmetW); add(g, L.visor, M.visor);
  if (L.panel.length) add(g, L.panel, new THREE.MeshStandardMaterial({ map: L.panelTex, roughness: 0.35, emissive: '#ffffff', emissiveMap: L.panelTex, emissiveIntensity: 0.08 }));
  const cb = add(g, L.combiner, M.combiner, { cast: false }); if (cb) cb.renderOrder = 2;
}
const jetLists = () => ({ skin: [], wingS: [], finS: [], tailS: [], dome: [], dark: [], pipe: [], soot: [], duct: [], frame: [], tub: [], tubIn: [], seatFrame: [], cushion: [], stripe: [], belt: [], panel: [], combiner: [], suit: [], helmet: [], visor: [], navR: [], navG: [], white: [], tank: [] });

// ================================================================== HAL HF-24 MARUT, 1961 (m; nose +X)
export function buildMarut(M) {
  const lite = !!M.lite;
  const g = new THREE.Group(); g.name = 'marut';
  jetMaterials(M);
  const L = jetLists();
  const fus = (x) => {
    if (x > 4.0) { const u = (x - 4.0) / 3.9; const r = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.2 * u); return [0.62 * Math.pow(r, 1.1) + 0.01, 0.66 * Math.pow(r, 1.1) + 0.01, 0.05 - 0.12 * u * u, 2]; }
    if (x > -4.0) { const u = (4.0 - x) / 8; return [lerp(0.62, 0.92, Math.min(1, u * 2.5)), lerp(0.66, 0.78, Math.min(1, u * 2)), 0.05, lerp(2, 2.7, Math.min(1, u * 2))]; }
    const u = (-4.0 - x) / 3.9; return [lerp(0.92, 0.82, u), lerp(0.78, 0.5, u), 0.05 - 0.05 * u, 2.7];
  };
  const CC = V3(4.5, 0.62, 0), CK = V3(1.25, 0.5, 0.42);
  const inCanopy = (x, y, z) => y > CC.y && ((x - CC.x) / CK.x) ** 2 + ((y - CC.y) / CK.y) ** 2 + (z / CK.z) ** 2 < 1;
  const xs = uniq([...lin(7.9, -7.9, lite ? 70 : 130), ...lin(5.8, 3.2, lite ? 10 : 36)], true);
  const as = uniq([...lin(0, TAU, lite ? 28 : 48), ...lin(-0.9, 0.9, lite ? 12 : 60).map((a) => (a + TAU) % TAU)]);
  L.skin.push(bodyS(xs, as, fus, { keep: (x, a, y, z) => !inCanopy(x, y, z) }));
  // cockpit tub (seen from inside), bulkheads, seat, panel, stick, gunsight, the pilot
  L.tubIn.push(bodyS(xs.filter((x) => x <= 5.75 && x >= 3.25), lin(0, TAU, 20), fus, { scale: 0.96 }));
  L.tub.push(bake(new THREE.CircleGeometry(0.62, 18), [3.27, 0.05, 0], [0, Math.PI / 2, 0]), bake(new THREE.CircleGeometry(0.6, 18), [5.73, 0.05, 0], [0, -Math.PI / 2, 0]));
  L.tub.push(box(2.4, 0.03, 0.9, [4.5, -0.25, 0]));
  jetCockpit(L, { seatP: V3(4.12, 0.02, 0), seatH: 0.86, panelX: 5.18, panelY: 0.45, panelW: 0.62, kind: 'marut', lite });
  // canopy: clear bubble, windscreen arch and rear bow, sill round the opening, a rear-view mirror
  const canopy = canopyGlass(CC, CK, -1, 1, lite ? 20 : 40);
  L.frame.push(tubeAlong(new THREE.CatmullRomCurve3(canopySill(fus, CC, CK, CC.x - CK.x, CC.x + CK.x, lite ? 16 : 40)), () => 0.026, lite ? 40 : 120, 6));
  L.frame.push(canopyBow(CC, CK, 5.25, 0.024), canopyBow(CC, CK, 3.55, 0.03));
  // dorsal spine behind the canopy
  L.skin.push(bake(new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2), [2.2, 0.66, 0], [0, 0, 0], [2.6, 0.26, 0.3]));
  // intakes: half-round pods on the fuselage sides with a rounded lip, a dark duct and a splitter plate
  for (const s of [1, -1]) {
    L.skin.push(bake(lathe([[0.001, 3.4], [0.2, 3.0], [0.4, 1.6], [0.44, 0.15], [0.432, 0.04], [0.41, 0.004], [0.388, 0.012], [0.376, 0.05]], lite ? 16 : 32), [3.0, -0.05, s * 0.7], [0, 0, Math.PI / 2]));
    L.duct.push(bake(lathe([[0.376, 0.05], [0.365, 0.3], [0.345, 0.9], [0.25, 1.02], [0.001, 1.08]], lite ? 16 : 32), [3.0, -0.05, s * 0.7], [0, 0, Math.PI / 2]));
    L.skin.push(bake(plate([[0.3, -0.5], [0.3, 0.4], [-0.45, 0.35], [-0.6, -0.45]], 0.02, 0.006), [2.9, -0.05, s * 0.735], [0, 0, 0]));
  }
  // 45° swept wing (ailerons, flaps), fin and rudder, all-moving tailplane, pivot fairings
  const span = 4.5, root = 0.75;
  const wst = []; for (let i = 0; i <= 12; i++) { const s = i / 12, z = root + s * (span - root); wst.push({ x: 1.6 - (z - root) * 1.0, y: -0.05 - s * 0.08, z, c: lerp(4.2, 1.35, s) }); }
  for (const sd of [1, -1]) L.wingS.push(wingGeo(wst.map((w) => ({ ...w, z: sd * w.z })), { n: lite ? 10 : 18, t: 0.06, cam: 0.0 }));
  const fst = []; for (let i = 0; i <= 8; i++) { const s = i / 8; fst.push({ x: -3.6 - s * 2.3, y: 0.7 + s * 2.4, z: 0, c: lerp(3.6, 1.1, s) }); }
  L.finS.push(wingGeo(fst, { n: lite ? 10 : 16, plane: 'v', t: 0.06, cam: 0 }));
  const tst = []; for (let i = 0; i <= 6; i++) { const s = i / 6, z = 0.5 + s * 2.3; tst.push({ x: -5.4 - (z - 0.5) * 1.0, y: -0.1, z, c: lerp(2.2, 0.8, s) }); }
  for (const sd of [1, -1]) { L.tailS.push(wingGeo(tst.map((w) => ({ ...w, z: sd * w.z })), { n: lite ? 10 : 14, t: 0.06, cam: 0 })); L.skin.push(bake(lathe([[0.001, 0], [0.09, 0.15], [0.1, 0.6], [0.001, 0.9]], 12), [-5.55, -0.1, sd * 0.8], [0, 0, Math.PI / 2])); }
  L.dark.push(bake(new THREE.SphereGeometry(0.05, 10, 6), [-5.55, 3.1, 0], [0, 0, 0], [3, 1, 0.8]));          // fin-tip fairing
  L.navR.push(bake(new THREE.SphereGeometry(0.04, 10, 6), [-2.1, -0.13, -4.5], [0, 0, 0], [2, 0.8, 0.8])); L.navG.push(bake(new THREE.SphereGeometry(0.04, 10, 6), [-2.1, -0.13, 4.5], [0, 0, 0], [2, 0.8, 0.8]));
  // twin jet pipes: heat-tinted shrouds, sooty liners, exhaust cones
  for (const s of [1, -1]) {
    L.pipe.push(bake(lathe([[0.36, -0.15], [0.365, 0.2], [0.345, 0.5], [0.325, 0.6], [0.31, 0.62]], lite ? 16 : 32), [-7.75, 0.0, s * 0.42], [0, 0, Math.PI / 2]));
    L.soot.push(bake(lathe([[0.31, 0.62], [0.3, 0.6], [0.31, 0.3], [0.3, -0.1]], lite ? 16 : 32), [-7.75, 0.0, s * 0.42], [0, 0, Math.PI / 2]));
    L.soot.push(bake(lathe([[0.001, 0.32], [0.08, 0.2], [0.16, 0.0], [0.2, -0.15]], lite ? 12 : 24), [-7.75, 0.0, s * 0.42], [0, 0, Math.PI / 2]));
  }
  L.soot.push(bake(new THREE.CircleGeometry(1, 24), [-7.89, 0.0, 0], [0, -Math.PI / 2, 0], [0.84, 0.52, 1]));
  // pitot boom (tapered, with yaw vanes), four ADEN gun ports, UHF blades, a landing lamp
  L.dark.push(rod(V3(7.82, 0.0, 0), V3(8.2, 0.0, 0), 0.03, 8, 0.045), rod(V3(8.2, 0, 0), V3(8.62, 0, 0), 0.012, 6, 0.02));
  if (!lite) for (const s of [1, -1]) L.dark.push(bake(new THREE.BoxGeometry(0.06, 0.003, 0.03), [8.3, 0, s * 0.03]), bake(new THREE.BoxGeometry(0.06, 0.03, 0.003), [8.35, s * 0.03, 0]));
  for (const s of [1, -1]) for (const dy of [-0.1, -0.28]) { const x = 6.0, p = secPt(fus, x, Math.PI / 2 + 0.25 + (dy < -0.2 ? 0.35 : 0)); L.skin.push(rod(V3(x - 0.5, p.y, p.z * 0.97), V3(x + 0.15, p.y, p.z * 0.97), 0.045, 10, 0.035)); L.soot.push(bake(new THREE.CircleGeometry(0.022, 10), [x + 0.151, p.y, p.z * 0.97], [0, Math.PI / 2, 0])); }
  L.skin.push(bake(plate([[0, 0], [0.25, 0], [0.05, 0.22], [-0.04, 0.22]], 0.012, 0.004), [1.0, 0.86, 0], [0, 0, 0]));
  L.skin.push(bake(plate([[0, 0], [0.2, 0], [0.04, -0.18], [-0.03, -0.18]], 0.012, 0.004), [-1.5, -0.72, 0], [0, 0, 0]));
  L.white.push(bake(new THREE.SphereGeometry(0.06, 10, 6, 0, TAU, 0, Math.PI / 2), [3.6, -0.7, 0], [Math.PI, 0, 0], [1.4, 0.4, 1]));
  // pylons with sway braces and finned drop tanks
  for (const s of [1, -1]) {
    L.tank.push(bake(lathe([[0.001, 0], [0.1, 0.18], [0.18, 0.5], [0.24, 1.2], [0.23, 2.2], [0.12, 2.75], [0.001, 2.9]], lite ? 14 : 28), [1.6, -0.55, s * 2.3], [0, 0, -Math.PI / 2]));
    L.skin.push(bake(plate([[0.6, 0], [-0.75, 0], [-0.55, -0.2], [0.45, -0.2]], 0.06, 0.01), [0.1, -0.1, s * 2.3]));
    for (const k of [0, 1, 2]) { const a = k / 3 * TAU + Math.PI / 2; L.tank.push(bake(plate([[0, 0], [0.3, 0], [0.12, 0.2], [0, 0.2]], 0.012, 0.003), [-1.05, -0.55 + Math.sin(a) * 0.14, s * 2.3 + Math.cos(a) * 0.14], [a - Math.PI / 2, 0, 0])); }
    if (!lite) for (const dx of [0.35, -0.35]) for (const dz of [0.1, -0.1]) L.dark.push(rod(V3(0.1 + dx, -0.3, s * 2.3 + dz * 0.4), V3(0.1 + dx, -0.36, s * 2.3 + dz * 1.6), 0.008, 4));
  }
  // skins: natural metal, staggered panels, rivet rows, hinge lines, heat tint aft, IAF roundels and fin flash
  const base = () => { const m = M.alu.clone(); m.map = null; m.color.set('#a9aeb4'); m.metalness = 1; m.roughness = 0.5; return m; };
  const rnd = [[-2.05, -0.1, 3.3, 0.42, 1, 1], [-2.05, -0.1, -3.3, 0.42, 1, 1], [-2.05, -0.1, 3.3, 0.42, 1, -1], [-2.05, -0.1, -3.3, 0.42, 1, -1]];
  const metal = { noise: { rough: 0.08, scale: 1.1, streak: 0.12, grime: 0.04 }, panel: { s: [0.55, 0.34, 0.36], lw: 0.003, depth: 0.0009, stagger: 0.5, tint: 0.05, rough: 0.14, grime: 0.35 }, rivet: { s: 0.045, o: 0.014, r: 0.0035, h: 0.0005 } };
  const fusM = skin(base(), { ...metal, heat: [-6.4, -7.9, 0.8],
    lines: [{ a: 'x', at: 3.35, c: 'y', lo: -0.75, hi: -0.1, w: 0.004 }, { a: 'x', at: 2.3, c: 'y', lo: -0.75, hi: -0.1, w: 0.004 }, { a: 'z', absA: true, at: 0.22, c: 'x', lo: 2.3, hi: 3.35, w: 0.004 },
      { a: 'x', at: -4.9, c: 'y', lo: -0.3, hi: 0.4, w: 0.004 }, { a: 'x', at: -5.9, c: 'y', lo: -0.3, hi: 0.4, w: 0.004 }, { a: 'y', at: -0.3, c: 'x', lo: -5.9, hi: -4.9, w: 0.004 }, { a: 'y', at: 0.4, c: 'x', lo: -5.9, hi: -4.9, w: 0.004 }],
    decals: { rnd: [[-4.4, 0.08, 0.91, 0.36, 2, 1, 0.3], [-4.4, 0.08, -0.91, 0.36, 2, -1, 0.3]] } }, lite);
  const wingM = skin(base(), { ...metal, shear: ['x', 'z', 1.0], panel: { ...metal.panel, s: [0.7, 0, 0.6] },
    lines: [{ a: 'x', at: -2.07, sl: -0.24, b: 'z', c: 'z', symC: true, lo: 2.6, hi: 4.4 }, { a: 'x', at: -2.12, sl: -0.24, b: 'z', c: 'z', symC: true, lo: 0.8, hi: 2.55 },
      { a: 'z', absA: true, at: 2.58, c: 'x', lo: -2.95, hi: -2.4 }, { a: 'z', absA: true, at: 4.4, c: 'x', lo: -3.4, hi: -2.8 }, { a: 'z', absA: true, at: 0.85, c: 'x', lo: -2.8, hi: -2.3 }],
    decals: { rnd } }, lite);
  const finM = skin(base(), { ...metal, shear: ['x', 'y', 0.96], panel: { ...metal.panel, s: [0.6, 0.45, 0] }, lines: [{ a: 'x', at: -6.708, sl: 0.0833, b: 'y', c: 'y', lo: 0.9, hi: 2.8 }],
    decals: { flash: { x0: -4.72, y0: 1.5, y1: 2.4, w: 0.9, sk: 0.958 } } }, lite);
  const tailM = skin(base(), { ...metal, shear: ['x', 'z', 1.0], panel: { ...metal.panel, s: [0.5, 0, 0.5] } }, lite);
  const pipeM = skin(new THREE.MeshStandardMaterial({ color: '#8e8a84', metalness: 1, roughness: 0.42 }), { heat: [-7.5, -8.4, 1.0], noise: { rough: 0.2, scale: 3, streak: 0.3, grime: 0.12 } }, lite);
  add(g, L.skin, fusM); add(g, L.wingS, wingM); add(g, L.finS, finM); add(g, L.tailS, tailM); add(g, L.tank, fusM); add(g, L.frame, fusM);
  add(g, L.dark, M.darkMetal); add(g, L.pipe, pipeM); add(g, L.soot, M.soot); add(g, L.duct, M.duct); add(g, L.navR, M.navR); add(g, L.navG, M.navG); add(g, L.white, M.white);
  addCockpit(g, L, M);
  const cm = new THREE.Mesh(canopy, glassMat({ key: 'marut', base: 0.06 })); cm.renderOrder = 3; g.add(cm);
  g.traverse((o) => { if (o.isMesh && o !== cm && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, nozzles: [V3(-7.9, 0, 0.42), V3(-7.9, 0, -0.42)], canopy: V3(4.6, 0.85, 0) };
}

// ================================================================== HAL TEJAS (m; nose +X)
export function buildTejas(M) {
  const lite = !!M.lite;
  const g = new THREE.Group(); g.name = 'tejas';
  jetMaterials(M);
  const L = jetLists();
  const fus = (x) => {
    if (x > 4.0) { const u = (x - 4.0) / 2.6; const r = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.25 * u); return [0.5 * Math.pow(r, 1.2) + 0.01, 0.52 * Math.pow(r, 1.2) + 0.01, 0.1 - 0.12 * u * u, 2]; }
    if (x > -4.5) { const u = (4.0 - x) / 8.5; return [lerp(0.5, 0.68, Math.min(1, u * 3)), lerp(0.52, 0.68, Math.min(1, u * 3)), 0.1, 2.3]; }
    const u = (-4.5 - x) / 2.1; return [lerp(0.68, 0.5, u), lerp(0.68, 0.5, u), 0.1 - 0.06 * u, lerp(2.3, 2, u)];
  };
  const CC = V3(3.2, 0.5, 0), CK = V3(1.35, 0.52, 0.4);
  const inCanopy = (x, y, z) => y > CC.y && ((x - CC.x) / CK.x) ** 2 + ((y - CC.y) / CK.y) ** 2 + (z / CK.z) ** 2 < 1;
  const as = uniq([...lin(0, TAU, lite ? 28 : 48), ...lin(-0.9, 0.9, lite ? 12 : 60).map((a) => (a + TAU) % TAU)]);
  L.dome.push(bodyS(lin(6.6, 4.6, lite ? 10 : 24), lin(0, TAU, lite ? 24 : 44), fus));
  const xs = uniq([...lin(4.6, -6.6, lite ? 50 : 100), ...lin(4.6, 1.8, lite ? 10 : 36)], true);
  L.skin.push(bodyS(xs, as, fus, { keep: (x, a, y, z) => !inCanopy(x, y, z) }));
  L.dark.push(bake(new THREE.TorusGeometry(0.505, 0.008, 4, 40), [4.6, 0.1, 0], [0, Math.PI / 2, 0], [1, 1.03, 0.99]));     // radome join
  L.tubIn.push(bodyS(xs.filter((x) => x <= 4.5 && x >= 1.9), lin(0, TAU, 20), fus, { scale: 0.96 }));
  L.tub.push(bake(new THREE.CircleGeometry(0.6, 18), [1.92, 0.1, 0], [0, Math.PI / 2, 0]), bake(new THREE.CircleGeometry(0.5, 18), [4.48, 0.1, 0], [0, -Math.PI / 2, 0]));
  L.tub.push(box(2.4, 0.03, 0.8, [3.2, -0.25, 0]));
  jetCockpit(L, { seatP: V3(2.75, -0.05, 0), seatH: 0.92, panelX: 3.85, panelY: 0.36, panelW: 0.6, kind: 'tejas', lite });
  const canopy = canopyGlass(CC, CK, -1, 1, lite ? 20 : 40);
  L.frame.push(tubeAlong(new THREE.CatmullRomCurve3(canopySill(fus, CC, CK, CC.x - CK.x, CC.x + CK.x, lite ? 16 : 40)), () => 0.026, lite ? 40 : 120, 6));
  L.frame.push(canopyBow(CC, CK, 2.15, 0.035));
  L.skin.push(bake(new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2), [0.2, 0.62, 0], [0, 0, 0], [3.4, 0.22, 0.34]));
  // intakes (D-section pods, rounded lips, dark Y-duct, splitter plates)
  const ifn = (x) => { const u = (1.9 - x) / 3.4; return [0.32 * (1 - 0.6 * u * u), 0.38 * (1 - 0.5 * u * u), -0.3 + 0.1 * u, 3]; };
  for (const s of [1, -1]) {
    L.skin.push(bodyS(lin(1.9, -1.5, lite ? 10 : 20), lin(0, TAU, lite ? 14 : 28), ifn).translate(0, 0, s * 0.72));
    L.duct.push(flipWinding(bodyS(lin(1.9, 1.0, 4), lin(0, TAU, lite ? 14 : 28), ifn, { scale: 0.9 })).translate(0, 0, s * 0.72));
    L.duct.push(bake(new THREE.CircleGeometry(1, 18), [1.0, -0.3, s * 0.72], [0, Math.PI / 2, 0], [0.29, 0.34, 1]));
    const ring = lin(0, TAU, 32).map((a) => secPt(ifn, 1.9, a, -0.012).add(V3(0.005, 0, s * 0.72)));
    L.skin.push(tubeAlong(new THREE.CatmullRomCurve3(ring), () => 0.02, 48, 6));
    L.skin.push(bake(plate([[0.25, -0.38], [0.25, 0.38], [-0.4, 0.32], [-0.55, -0.34]], 0.018, 0.005), [1.9, -0.3, s * 0.665]));
  }
  // compound delta (elevons, slats), fin and rudder, nav lights, pylons
  const LEx = (z) => (z < 2.0 ? lerp(2.6, -1.3, (z - 0.6) / 1.4) : lerp(-1.3, -4.7, (z - 2.0) / 2.1));
  const wst = []; for (let i = 0; i <= 20; i++) { const z = 0.6 + i / 20 * 3.5, te = lerp(-5.9, -5.45, (z - 0.6) / 3.5); wst.push({ x: LEx(z), y: -0.12, z, c: Math.max(0.5, LEx(z) - te) }); }
  for (const sd of [1, -1]) L.wingS.push(wingGeo(wst.map((w) => ({ ...w, z: sd * w.z })), { n: lite ? 10 : 18, t: 0.045, cam: 0 }));
  const fst = []; for (let i = 0; i <= 8; i++) { const s = i / 8; fst.push({ x: -2.7 - s * 2.2, y: 0.62 + s * 2.6, z: 0, c: lerp(3.8, 1.0, s) }); }
  L.finS.push(wingGeo(fst, { n: lite ? 10 : 16, plane: 'v', t: 0.05, cam: 0 }));
  L.dark.push(bake(new THREE.SphereGeometry(0.06, 10, 6), [-5.2, 3.22, 0], [0, 0, 0], [4, 1, 0.8]));
  L.navR.push(bake(new THREE.SphereGeometry(0.035, 10, 6), [-4.8, -0.12, -4.1], [0, 0, 0], [2, 0.8, 0.8])); L.navG.push(bake(new THREE.SphereGeometry(0.035, 10, 6), [-4.8, -0.12, 4.1], [0, 0, 0], [2, 0.8, 0.8]));
  for (const sd of [1, -1]) for (const z of [1.7, 2.9]) {
    L.skin.push(bake(plate([[0.7, 0], [-0.7, 0], [-0.5, -0.16], [0.5, -0.16]], 0.06, 0.01), [LEx(z) - 1.3, -0.15, sd * z]));
    if (!lite) L.dark.push(box(0.9, 0.03, 0.03, [LEx(z) - 1.3, -0.33, sd * z]));
  }
  L.skin.push(bake(plate([[0.8, 0], [-0.8, 0], [-0.6, -0.15], [0.6, -0.15]], 0.07, 0.01), [-0.5, -0.56, 0]));
  // afterburner nozzle: outer shroud, sixteen petals with seals, sooty liner, flame-holder ring, turbine cone
  L.pipe.push(bake(lathe([[0.6, -0.4], [0.58, 0.0], [0.53, 0.3]], lite ? 16 : 32), [-6.5, 0.04, 0], [0, 0, Math.PI / 2]));
  const NP = lite ? 8 : 16;
  for (let k = 0; k < NP; k++) {
    const a0 = k / NP * TAU, w = TAU / NP * 0.52, pts = [];
    const gp = new THREE.BufferGeometry(), pos = [], idx = [];
    for (let j = 0; j <= 4; j++) for (let i = 0; i <= 3; i++) { const t = j / 4, a = a0 + (i / 3 - 0.5) * w * 2, r = lerp(0.53, 0.43, t); pos.push(-6.78 - t * 0.55, 0.04 + Math.cos(a) * r, Math.sin(a) * r); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { const q = j * 4 + i; idx.push(q, q + 1, q + 4, q + 1, q + 5, q + 4); }
    gp.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gp.setIndex(idx); gp.computeVertexNormals();
    (k % 2 ? L.soot : L.pipe).push(gp);
    pts.length = 0;
  }
  L.soot.push(bake(lathe([[0.5, 0.0], [0.47, 0.6], [0.42, 1.1]], lite ? 16 : 32), [-6.3, 0.04, 0], [0, 0, Math.PI / 2]));
  L.soot.push(bake(new THREE.TorusGeometry(0.3, 0.02, 5, 32), [-6.6, 0.04, 0], [0, Math.PI / 2, 0]), bake(new THREE.TorusGeometry(0.16, 0.02, 5, 24), [-6.6, 0.04, 0], [0, Math.PI / 2, 0]));
  if (!lite) for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; L.soot.push(rod(V3(-6.6, 0.04 + Math.cos(a) * 0.16, Math.sin(a) * 0.16), V3(-6.6, 0.04 + Math.cos(a) * 0.3, Math.sin(a) * 0.3), 0.012, 4)); }
  L.soot.push(bake(lathe([[0.001, 0.35], [0.12, 0.15], [0.2, 0.0]], 20), [-6.35, 0.04, 0], [0, 0, Math.PI / 2]));
  // air-data probe, blade aerials, dorsal airbrake hinges
  L.dark.push(rod(V3(6.55, 0.08, 0), V3(6.95, 0.08, 0), 0.025, 8, 0.04), rod(V3(6.95, 0.08, 0), V3(7.3, 0.08, 0), 0.01, 6, 0.018));
  if (!lite) for (const s of [1, -1]) L.dark.push(bake(new THREE.BoxGeometry(0.05, 0.003, 0.025), [7.05, 0.08, s * 0.025]), bake(new THREE.BoxGeometry(0.05, 0.025, 0.003), [7.1, 0.08 + s * 0.025, 0]));
  L.skin.push(bake(plate([[0, 0], [0.22, 0], [0.05, 0.2], [-0.03, 0.2]], 0.012, 0.004), [-1.2, 0.83, 0]));
  L.skin.push(bake(plate([[0, 0], [0.18, 0], [0.04, -0.16], [-0.03, -0.16]], 0.012, 0.004), [2.2, -0.56, 0]));
  // paint: air-superiority grey, darker radome; staggered panels, rivets, hinge lines, roundels, fin flash
  const base = (c) => { const m = M.tejas.clone(); m.map = null; m.color.set(c); m.metalness = 0; m.roughness = 0.55; return m; };
  const paint = { noise: { rough: 0.18, scale: 1.0, streak: 0.18, grime: 0.06 }, panel: { s: [0.5, 0.32, 0.34], lw: 0.0026, depth: 0.0008, stagger: 0.5, tint: 0.025, rough: 0.12, grime: 0.32 }, rivet: { s: 0.05, o: 0.012, r: 0.0032, h: 0.0004 }, chip: { amt: 0.06, scale: 10, col: '#9a9c98', metal: 0, rough: 0.6 } };
  const fusM = skin(base('#7e858c'), { ...paint, heat: [-6.0, -6.6, 0.4],
    lines: [{ a: 'x', at: -4.6, c: 'z', symC: true, lo: 0.12, hi: 0.45 }, { a: 'x', at: -5.6, c: 'z', symC: true, lo: 0.12, hi: 0.45 }, { a: 'z', absA: true, at: 0.45, c: 'x', lo: -5.6, hi: -4.6 }, { a: 'z', absA: true, at: 0.12, c: 'x', lo: -5.6, hi: -4.6 },
      { a: 'x', at: 1.0, c: 'y', lo: -0.75, hi: -0.2, w: 0.004 }, { a: 'x', at: -1.0, c: 'y', lo: -0.75, hi: -0.2, w: 0.004 }],
    decals: { rnd: [[0.35, -0.3, 1.04, 0.24, 2, 1, 0.25], [0.35, -0.3, -1.04, 0.24, 2, -1, 0.25]] } }, lite);
  const wingM = skin(base('#7e858c'), { ...paint, shear: ['x', 'z', 1.2], panel: { ...paint.panel, s: [0.65, 0, 0.55] },
    lines: [{ a: 'x', at: -5.477, sl: 0.1286, b: 'z', c: 'z', symC: true, lo: 0.9, hi: 2.4 }, { a: 'x', at: -5.477, sl: 0.1286, b: 'z', c: 'z', symC: true, lo: 2.45, hi: 3.9 },
      { a: 'z', absA: true, at: 2.42, c: 'x', lo: -5.7, hi: -5.1 }, { a: 'x', at: 1.588, sl: -1.619, b: 'z', c: 'z', symC: true, lo: 2.1, hi: 4.0 }, { a: 'z', absA: true, at: 3.0, c: 'x', lo: -3.6, hi: -2.9 }],
    decals: { rnd: [[-4.18, -0.12, 2.9, 0.34, 1, 1], [-4.18, -0.12, -2.9, 0.34, 1, 1], [-4.18, -0.12, 2.9, 0.34, 1, -1], [-4.18, -0.12, -2.9, 0.34, 1, -1]] } }, lite);
  const finM = skin(base('#7e858c'), { ...paint, shear: ['x', 'y', 0.846], panel: { ...paint.panel, s: [0.6, 0.45, 0] }, lines: [{ a: 'x', at: -6.043, sl: 0.2308, b: 'y', c: 'y', lo: 0.9, hi: 2.6 }],
    decals: { flash: { x0: -3.93, y0: 1.6, y1: 2.5, w: 0.85, sk: 0.846 } } }, lite);
  const domeM = skin(base('#585c62'), { noise: { rough: 0.2, scale: 1.4, streak: 0.1, grime: 0.04 }, chip: { amt: 0.05, scale: 12, col: '#8a8a84', metal: 0, rough: 0.6 } }, lite);
  const pipeM = skin(new THREE.MeshStandardMaterial({ color: '#7e7a74', metalness: 1, roughness: 0.45, side: THREE.DoubleSide }), { heat: [-6.6, -7.4, 1.0], noise: { rough: 0.2, scale: 3, streak: 0.3, grime: 0.12 } }, lite);
  add(g, L.skin, fusM); add(g, L.wingS, wingM); add(g, L.finS, finM); add(g, L.dome, domeM); add(g, L.frame, fusM);
  add(g, L.dark, M.darkMetal); add(g, L.pipe, pipeM); add(g, L.soot, M.soot); add(g, L.duct, M.duct); add(g, L.navR, M.navR); add(g, L.navG, M.navG);
  addCockpit(g, L, M);
  const cm = new THREE.Mesh(canopy, glassMat({ key: 'tejas', base: 0.05, tint: '#b89858', gold: true, lumK: 0.15 })); cm.renderOrder = 3; g.add(cm);
  g.traverse((o) => { if (o.isMesh && o !== cm && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return { group: g, nozzle: V3(-7.2, 0.04, 0), tips: [V3(-4.9, -0.12, 4.1), V3(-4.9, -0.12, -4.1)] };
}
