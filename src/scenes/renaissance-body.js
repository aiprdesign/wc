// A sculpted Vitruvian figure as a signed distance field.
// ~200 anatomically placed primitives (ellipsoids, round cones, rounded boxes) grouped into
// body parts and blended with polynomial smooth-min; meshed at build time with a sparse
// (block-culled) surface-nets extractor whose vertices are Newton-projected onto the true
// surface, with analytic-gradient normals and baked SDF ambient occlusion. The same field
// yields the 2D drawing data: the orthographic silhouette field, front-surface shading and
// a cavity (crease) field for interior lines — so the sketch and the statue match exactly.
//
// Units: height 2.0 (feet at y = -1.2, crown at 0.8), navel at the origin, facing +z.
// Proportions follow Leonardo's text: head 1/8, face 1/10, shoulders 1/4, elbow→fingertip 1/4,
// hand 1/10, foot 1/7, nipples 1/4 from the crown, pubis at half height, knee 1/4 from the floor.
// Pure JS — no imports.

// ------------------------------------------------------------------------------------------
// primitives
const E = 0, C = 1, B = 2;          // ellipsoid, round cone, rounded box
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul3 = (a, b) => {            // row-major 3x3 product
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const apply3 = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
// rotation taking +y onto direction d (for ellipsoids laid along a segment)
function alignY(d) {
  const l = Math.hypot(d[0], d[1], d[2]); const y = [d[0] / l, d[1] / l, d[2] / l];
  const ref = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let x = [y[1] * ref[2] - y[2] * ref[1], y[2] * ref[0] - y[0] * ref[2], y[0] * ref[1] - y[1] * ref[0]];
  const xl = Math.hypot(...x); x = x.map((v) => v / xl);
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];   // columns = local axes
}

const smin = (a, b, k) => { const h = k - Math.abs(a - b); return h <= 0 ? (a < b ? a : b) : (a < b ? a : b) - h * h * 0.25 / k; };
const smax = (a, b, k) => { const h = k - Math.abs(a - b); return h <= 0 ? (a > b ? a : b) : (a > b ? a : b) + h * h * 0.25 / k; };

function primDist(p, x, y, z) {
  if (p.t === C) {
    // iq's round cone between arbitrary points
    const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
    const yy = pax * p.bax + pay * p.bay + paz * p.baz;
    const zz = yy - p.l2;
    const xvx = pax * p.l2 - p.bax * yy, xvy = pay * p.l2 - p.bay * yy, xvz = paz * p.l2 - p.baz * yy;
    const x2 = xvx * xvx + xvy * xvy + xvz * xvz, y2 = yy * yy * p.l2, z2 = zz * zz * p.l2;
    const k = p.kk * x2;
    if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2;
    if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1;
    return (Math.sqrt(x2 * p.a2 * p.il2) + yy * p.rr) * p.il2 - p.r1;
  }
  const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz, m = p.m;
  let lx = dx, ly = dy, lz = dz;
  if (m) { lx = m[0] * dx + m[3] * dy + m[6] * dz; ly = m[1] * dx + m[4] * dy + m[7] * dz; lz = m[2] * dx + m[5] * dy + m[8] * dz; }
  if (p.t === E) {
    const ax = lx * p.irx, ay = ly * p.iry, az = lz * p.irz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = ax * p.irx, by = ay * p.iry, bz = az * p.irz;
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-9 ? -Math.min(p.rx, p.ry, p.rz) : k0 * (k0 - 1) / k1;
  }
  // rounded box
  const qx = Math.abs(lx) - p.hx, qy = Math.abs(ly) - p.hy, qz = Math.abs(lz) - p.hz;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.rad;
}

function boxDist2(bb, x, y, z) {
  const dx = bb[0] - x > 0 ? bb[0] - x : (x - bb[3] > 0 ? x - bb[3] : 0);
  const dy = bb[1] - y > 0 ? bb[1] - y : (y - bb[4] > 0 ? y - bb[4] : 0);
  const dz = bb[2] - z > 0 ? bb[2] - z : (z - bb[5] > 0 ? z - bb[5] : 0);
  return dx * dx + dy * dy + dz * dz;
}
function boxDist(bb, x, y, z) {
  const dx = Math.max(bb[0] - x, 0, x - bb[3]), dy = Math.max(bb[1] - y, 0, y - bb[4]), dz = Math.max(bb[2] - z, 0, z - bb[5]);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ------------------------------------------------------------------------------------------
// the body description
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function buildBody({ arm = 0, leg = 0, clipFloor = true } = {}) {
  const groups = [];
  let G = null;
  let X = { piv: [0, 0, 0], R: I3 };          // current limb transform (rotation about a pivot)
  const tp = (v) => { const d = [v[0] - X.piv[0], v[1] - X.piv[1], v[2] - X.piv[2]]; const r = apply3(X.R, d); return [r[0] + X.piv[0], r[1] + X.piv[1], r[2] + X.piv[2]]; };
  const group = (name, kj = 0.03, kjY = null) => { G = { name, kj, kjY: kjY ? Float64Array.from(kjY) : null, prims: [], bb: null, sorted: null }; groups.push(G); return G; };
  // every primitive gets the same hidden class (monomorphic property access in the hot loop)
  let layer = 0;                     // carve order: subtractive prims act on layer-0 adds; layer-2 adds come after
  const push = (o, k, op) => {
    const p = { t: o.t, k, op: op ? 1 : 0, layer: op ? 1 : layer, cx: 0, cy: 0, cz: 0, rx: 1, ry: 1, rz: 1, irx: 1, iry: 1, irz: 1, m: null,
      ax: 0, ay: 0, az: 0, bax: 0, bay: 0, baz: 0, l2: 1, rr: 0, a2: 1, il2: 1, kk: 0, r1: 0, r2: 0, hx: 0, hy: 0, hz: 0, rad: 0, bb: null };
    Object.assign(p, o); if (p.m) p.m = Float64Array.from(p.m); p.bb = Float64Array.from(p.bb);
    G.prims.push(p); return p;
  };
  // ellipsoid; R0 = local orientation (columns = axes) before the limb transform
  const ell = (c, r, k = 0.02, R0 = null, op = 0) => {
    const cc = tp(c); const R = mul3(X.R, R0 || I3); const ident = R.every((v, i) => Math.abs(v - I3[i]) < 1e-9);
    const rm = Math.max(r[0], r[1], r[2]);
    return push({ t: E, cx: cc[0], cy: cc[1], cz: cc[2], rx: r[0], ry: r[1], rz: r[2], irx: 1 / r[0], iry: 1 / r[1], irz: 1 / r[2], m: ident ? null : R,
      bb: ident ? [cc[0] - r[0], cc[1] - r[1], cc[2] - r[2], cc[0] + r[0], cc[1] + r[1], cc[2] + r[2]] : [cc[0] - rm, cc[1] - rm, cc[2] - rm, cc[0] + rm, cc[1] + rm, cc[2] + rm] }, k, op);
  };
  const sph = (c, r, k = 0.02, op = 0) => ell(c, [r, r, r], k, null, op);
  // ellipsoid laid along a→b (radius along = half length + pad), cross radii w (local x) and d (local z)
  const ellAB = (a, b, w, d, k = 0.02, pad = 0, twist = 0) => {
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let R = alignY(dir); if (twist) R = mul3(R, rotY(twist));
    return ell(c, [w, Math.hypot(...dir) / 2 + pad, d], k, R);
  };
  const cone = (a0, b0, r1, r2, k = 0.02, op = 0) => {
    const a = tp(a0), b = tp(b0);
    const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
    const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2;
    const rm = Math.max(r1, r2);
    return push({ t: C, ax: a[0], ay: a[1], az: a[2], bax, bay, baz, l2, rr, a2: l2 - rr * rr, il2: 1 / l2, kk: Math.sign(rr) * rr * rr, r1, r2,
      bb: [Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm, Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm] }, k, op);
  };
  const rbox = (c, h, rad, k = 0.02, R0 = null) => {
    const cc = tp(c); const R = mul3(X.R, R0 || I3); const e = Math.hypot(h[0], h[1], h[2]) + rad;
    return push({ t: B, cx: cc[0], cy: cc[1], cz: cc[2], hx: h[0], hy: h[1], hz: h[2], rad, m: R, bb: [cc[0] - e, cc[1] - e, cc[2] - e, cc[0] + e, cc[1] + e, cc[2] + e] }, k, 0);
  };
  const limb = (piv, R) => { X = { piv, R }; };
  const noLimb = () => { X = { piv: [0, 0, 0], R: I3 }; };

  // ================================================================ torso
  group('torso');
  ell([0, 0.318, -0.016], [0.145, 0.168, 0.104], 0.035);               // ribcage
  ell([0, 0.402, -0.018], [0.178, 0.078, 0.094], 0.045);               // upper chest / shoulder girdle
  ell([0, 0.28, -0.058], [0.118, 0.17, 0.064], 0.035);                 // back
  for (const s of [1, -1]) {
    ell([s * 0.074, 0.362, 0.048], [0.088, 0.062, 0.047], 0.03, rotZ(s * -0.2));   // pectoralis
    ell([s * 0.128, 0.27, -0.03], [0.052, 0.14, 0.068], 0.045, rotZ(s * 0.25));     // latissimus
    ell([s * 0.094, 0.05, -0.014], [0.038, 0.1, 0.066], 0.055, rotZ(s * -0.06));    // external oblique
    ell([s * 0.07, -0.14, -0.058], [0.07, 0.085, 0.068], 0.035);                     // gluteus
    ell([s * 0.106, -0.08, -0.018], [0.044, 0.07, 0.062], 0.045);                   // gluteus medius
    ell([s * 0.078, 0.42, -0.072], [0.09, 0.05, 0.045], 0.035, rotZ(s * -0.25));    // scapula / upper back
    ell([s * 0.03, 0.25, -0.1], [0.03, 0.16, 0.03], 0.03);                          // erector spinae
  }
  ell([0, 0.12, -0.012], [0.116, 0.168, 0.093], 0.035);                // abdomen
  for (const s of [1, -1]) {                                              // rectus abdominis blocks
    for (const [y, rz] of [[0.218, 0.028], [0.152, 0.03], [0.085, 0.03]]) ell([s * 0.03, y, 0.056], [0.03, 0.032, rz], 0.022);
    ell([s * 0.026, 0.005, 0.052], [0.032, 0.07, 0.032], 0.03);
  }
  ell([0, -0.055, 0.018], [0.088, 0.08, 0.064], 0.035);                  // lower belly
  ell([0, -0.08, -0.016], [0.12, 0.098, 0.092], 0.045);                  // pelvis
  sph([0, 0.012, 0.089], 0.008, 0.008, 1);                                // navel
  ell([0, -0.2, 0.06], [0.016, 0.028, 0.017], 0.012);                    // genitals (classical, restrained)
  ell([0, -0.218, 0.046], [0.022, 0.021, 0.02], 0.012);
  // neck
  cone([0, 0.585, -0.022], [0, 0.47, -0.014], 0.044, 0.058, 0.035);
  for (const s of [1, -1]) {
    cone([s * 0.052, 0.615, -0.018], [s * 0.012, 0.483, 0.038], 0.012, 0.011, 0.022);    // sternocleidomastoid
    cone([s * 0.028, 0.555, -0.042], [s * 0.19, 0.466, -0.024], 0.03, 0.022, 0.04);       // trapezius
    cone([s * 0.02, 0.474, 0.044], [s * 0.17, 0.484, 0.012], 0.0085, 0.0075, 0.035);    // clavicle
  }

  // ================================================================ head
  group('head', 0.022);
  ell([0, 0.705, -0.016], [0.077, 0.09, 0.097], 0.02);                  // cranium
  ell([0, 0.642, 0.018], [0.06, 0.08, 0.07], 0.025);                     // face mass
  ell([0, 0.603, 0.056], [0.034, 0.028, 0.03], 0.02);                     // muzzle
  ell([0, 0.568, 0.053], [0.025, 0.019, 0.022], 0.018);                   // chin
  for (const s of [1, -1]) {
    cone([s * 0.058, 0.632, -0.026], [s * 0.022, 0.572, 0.044], 0.017, 0.015, 0.02);  // jaw
    ell([s * 0.04, 0.65, 0.046], [0.022, 0.014, 0.02], 0.024);                        // zygomatic
    sph([s * 0.029, 0.668, 0.093], 0.0165, 0.012, 1);                                 // eye socket
    layer = 2; ell([s * 0.029, 0.667, 0.071], [0.0145, 0.012, 0.0145], 0.005); layer = 0;       // eyeball
    ell([s * 0.074, 0.652, -0.014], [0.008, 0.025, 0.015], 0.012, rotX(0.2));         // ear
    ell([s * 0.011, 0.621, 0.091], [0.0095, 0.0085, 0.009], 0.008);                   // nose alae
  }
  cone([-0.046, 0.686, 0.073], [0.046, 0.686, 0.073], 0.0115, 0.0115, 0.02);          // brow ridge
  cone([0, 0.676, 0.084], [0, 0.625, 0.105], 0.0085, 0.0105, 0.012);                  // nose bridge
  ell([0, 0.625, 0.1], [0.0115, 0.011, 0.011], 0.01);                                  // nose tip
  ell([0, 0.603, 0.081], [0.022, 0.0068, 0.0095], 0.008);                              // upper lip
  ell([0, 0.592, 0.078], [0.019, 0.0072, 0.0095], 0.008);                              // lower lip
  cone([-0.02, 0.5975, 0.09], [0.02, 0.5975, 0.09], 0.0022, 0.0022, 0.004, 1);         // mouth line
  // hair: a mass of carved curls over the crown, to the nape and over the ears (shoulder-length locks)
  const curls = [];
  {
    const r = rng(71);
    ell([0, 0.72, -0.03], [0.079, 0.086, 0.094], 0.02);                   // hair mass (under the curls)
    for (let i = 0; i < 170; i++) {
      // jittered fibonacci directions over the upper/back cranium
      const u = (i + 0.5) / 170, th = Math.acos(1 - 2 * u) + (r() - 0.5) * 0.12, ph = i * 2.39996 + (r() - 0.5) * 0.3;
      const dir = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      if (dir[1] < -0.55) continue;
      const front = dir[2];
      if (front > 0.25 && dir[1] < 0.42) continue;                      // face & forehead stay clear
      if (front > 0.05 && dir[1] < 0.1) continue;
      if (dir[1] < -0.1 && Math.abs(dir[0]) > 0.75 && front > -0.3) continue; // ears peek out
      const rr = 0.014 + r() * 0.009;
      const lift = 1.0 + r() * 0.06;
      const c = [dir[0] * 0.083 * lift, 0.712 + dir[1] * 0.088 * lift, -0.022 + dir[2] * 0.097 * lift];
      sph(c, rr, 0.008);
      curls.push([c[0], c[1], c[2], rr]);
    }
    for (const s of [1, -1]) for (let j = 0; j < 6; j++) {          // locks falling behind the ears to the nape
      const y = 0.66 - j * 0.019, x = s * (0.07 - j * 0.004), z = -0.045 - (j % 2) * 0.012;
      const rr = 0.02 - j * 0.0012;
      sph([x, y, z], rr, 0.012); curls.push([x, y, z, rr]);
      sph([x * 0.55, y - 0.004, z - 0.03], rr, 0.012); curls.push([x * 0.55, y - 0.004, z - 0.03, rr]);
    }
  }

  // ================================================================ arms
  for (const s of [1, -1]) {
    const SH = [s * 0.2, 0.448, -0.008];
    limb(SH, rotZ(s * arm));
    group('arm' + s, 0.03);
    ell([s * 0.198, 0.452, -0.004], [0.062, 0.06, 0.058], 0.03);          // deltoid
    ell([s * 0.235, 0.444, 0.02], [0.05, 0.042, 0.04], 0.03);              // anterior deltoid
    cone([s * 0.2, 0.446, -0.008], [s * 0.49, 0.45, -0.012], 0.047, 0.036, 0.035);  // humerus
    ell([s * 0.345, 0.449, 0.016], [0.1, 0.041, 0.041], 0.03);             // biceps
    ell([s * 0.32, 0.444, -0.024], [0.125, 0.042, 0.039], 0.03);           // triceps
    sph([s * 0.5, 0.45, -0.024], 0.018, 0.03);                              // olecranon
    ell([s * 0.5, 0.452, -0.006], [0.04, 0.036, 0.033], 0.04);              // elbow
    cone([s * 0.5, 0.451, -0.006], [s * 0.782, 0.452, -0.002], 0.037, 0.022, 0.035); // forearm
    ell([s * 0.6, 0.453, 0.003], [0.12, 0.043, 0.038], 0.04);               // forearm flexors/extensors
    ell([s * 0.56, 0.476, -0.004], [0.085, 0.018, 0.026], 0.035);           // brachioradialis
    ell([s * 0.775, 0.452, -0.001], [0.035, 0.027, 0.017], 0.03);           // wrist

    // ------------------------------------------------ hand (palm forward, thumb up)
    group('hand' + s, 0.022);
    rbox([s * 0.845, 0.451, 0.0], [0.024, 0.02, 0.001], 0.0135, 0.02);     // palm
    ell([s * 0.843, 0.451, -0.003], [0.047, 0.037, 0.013], 0.02);          // back of the hand
    ell([s * 0.826, 0.471, 0.01], [0.03, 0.02, 0.013], 0.012);              // thenar
    ell([s * 0.845, 0.433, 0.006], [0.036, 0.016, 0.012], 0.012);           // hypothenar
    const fingers = [[0.025, 0.088, 0.0094, 0.07], [0.0085, 0.101, 0.0097, 0.02], [-0.008, 0.094, 0.0091, -0.035], [-0.0235, 0.074, 0.0081, -0.1]];
    fingers.forEach(([oy, len, r0, spread], fi) => {
      group('finger' + s + fi, 0.005);
      let p = [s * 0.878, 0.451 + oy, -0.001];
      let ang = spread, bend = 0;
      const segs = [0.47, 0.3, 0.23], curl = [0.08, 0.16, 0.12];
      let rad = r0;
      segs.forEach((f, si) => {
        bend += curl[si];
        const L = len * f;
        const q = [p[0] + s * L * Math.cos(ang) * Math.cos(bend), p[1] + L * Math.sin(ang), p[2] + L * Math.sin(bend) * 0.9];
        const r2 = rad * (si === 2 ? 0.8 : 0.93);
        cone(p, q, rad, r2, 0.004);
        if (si < 2) sph(q, r2 * 1.06, 0.004);                  // knuckle
        p = q; rad = r2;
      });
      sph([s * 0.874, 0.451 + oy, -0.004], r0 * 1.12, 0.006);    // metacarpal head
    });
    group('thumb' + s, 0.01);
    {
      const pts = [[s * 0.806, 0.466, 0.008], [s * 0.838, 0.496, 0.018], [s * 0.862, 0.514, 0.024], [s * 0.886, 0.526, 0.027]];
      const rs = [0.013, 0.0108, 0.0098, 0.0078];
      for (let i = 0; i < 3; i++) { cone(pts[i], pts[i + 1], rs[i], rs[i + 1], 0.005); if (i) sph(pts[i], rs[i] * 1.05, 0.004); }
    }
  }

  // ================================================================ legs
  for (const s of [1, -1]) {
    const HIP = [s * 0.088, -0.165, 0];
    limb(HIP, rotZ(s * leg));
    // legs join the pelvis softly but meet each other crisply (knees, calves, ankles)
    group('leg' + s, 0.035, [-0.22, -0.34, 0.035, 0.003]);
    cone([s * 0.085, -0.12, -0.012], [s * 0.06, -0.68, 0.0], 0.08, 0.048, 0.025);         // femur/thigh
    ell([s * 0.109, -0.4, 0.004], [0.047, 0.19, 0.06], 0.03, rotZ(s * 0.08));            // vastus lateralis
    ell([s * 0.08, -0.39, 0.04], [0.048, 0.2, 0.048], 0.03, rotZ(s * 0.05));             // rectus femoris
    ell([s * 0.041, -0.6, 0.028], [0.041, 0.075, 0.044], 0.022, rotZ(s * -0.25));        // vastus medialis
    ell([s * 0.05, -0.3, -0.006], [0.046, 0.13, 0.062], 0.03, rotZ(s * 0.12));           // adductors
    ell([s * 0.08, -0.42, -0.046], [0.058, 0.2, 0.052], 0.03);                           // hamstrings
    ell([s * 0.1, -0.2, 0.04], [0.03, 0.09, 0.03], 0.03, rotZ(s * -0.5));                // tensor / sartorius top
    ell([s * 0.058, -0.7, 0.004], [0.046, 0.054, 0.046], 0.022);                         // knee
    ell([s * 0.058, -0.688, 0.046], [0.024, 0.03, 0.014], 0.014);                        // patella
    ell([s * 0.058, -0.735, 0.036], [0.016, 0.025, 0.012], 0.012);                       // patellar tendon
    cone([s * 0.058, -0.72, 0.0], [s * 0.043, -1.12, -0.02], 0.043, 0.026, 0.02);         // shin
    ell([s * 0.04, -0.83, -0.031], [0.041, 0.1, 0.044], 0.022, rotZ(s * -0.06));         // gastrocnemius medial
    ell([s * 0.079, -0.81, -0.028], [0.034, 0.085, 0.04], 0.022, rotZ(s * 0.05));         // gastrocnemius lateral
    ell([s * 0.057, -0.95, -0.028], [0.035, 0.1, 0.034], 0.025);                         // soleus
    ell([s * 0.07, -0.85, 0.028], [0.024, 0.11, 0.024], 0.02);                            // tibialis anterior
    sph([s * 0.024, -1.108, -0.016], 0.017, 0.014);                                       // medial malleolus
    sph([s * 0.064, -1.122, -0.026], 0.0155, 0.014);                                      // lateral malleolus

    // ------------------------------------------------ foot (turned out slightly)
    group('foot' + s, 0.014);
    const turn = s * 0.2;
    const B0 = [s * 0.045, -1.15, -0.03];
    const fw = (d, y, side = 0) => [B0[0] + Math.sin(turn) * d + Math.cos(turn) * side * s, y, B0[2] + Math.cos(turn) * d - Math.sin(turn) * side * s];
    const RF = rotY(turn);
    ell(fw(-0.03, -1.165, 0), [0.029, 0.034, 0.036], 0.014, RF);           // heel
    ell(fw(0.01, -1.14, 0), [0.033, 0.042, 0.048], 0.02, RF);               // ankle / instep
    ell(fw(0.085, -1.165, 0.004), [0.041, 0.03, 0.085], 0.02, RF);          // midfoot
    ell(fw(0.155, -1.182, 0.004), [0.046, 0.017, 0.033], 0.016, RF);        // ball
    const toes = [[0.022, 0.05, 0.0125], [0.005, 0.042, 0.0088], [-0.01, 0.037, 0.0082], [-0.023, 0.031, 0.0077], [-0.034, 0.024, 0.0072]];
    for (const [side, len, rr] of toes) {
      const a = fw(0.17, -1.186, side), b = fw(0.17 + len, -1.19 + rr * 0.3, side * 1.08);
      cone(a, b, rr, rr * 0.88, 0.005);
    }
  }
  noLimb();

  // group bounding boxes (expanded by the blend radius)
  for (const g of groups) {
    const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const p of g.prims) if (!p.op) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p.bb[i]); bb[i + 3] = Math.max(bb[i + 3], p.bb[i + 3]); }
    g.bb = Float64Array.from(bb);
    g.sorted = g.prims.slice().sort((a, b) => a.layer - b.layer);
  }
  const floorY = clipFloor ? -1.2 : -1e9;
  return { groups, curls, floorY };
}

// evaluate a (possibly filtered) group list: [{g, prims}]
// Values are capped at CAP (only the near field matters), which lets far primitives be culled at once.
const CAP = 0.2;
function evalList(list, floorY, x, y, z) {
  let d = CAP;
  for (let gi = 0; gi < list.length; gi++) {
    const L = list[gi], g = L.g;
    let kj = g.kj;
    if (g.kjY) { const t = Math.min(1, Math.max(0, (y - g.kjY[0]) / (g.kjY[1] - g.kjY[0]))); kj = g.kjY[2] + (g.kjY[3] - g.kjY[2]) * t; }
    const glim = d + kj;
    if (boxDist2(g.bb, x, y, z) > glim * glim) continue;
    let dg = CAP;
    const P = L.prims;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      const lb2 = boxDist2(p.bb, x, y, z);
      if (p.op === 0) {
        const lim = dg + p.k;
        if (lb2 > lim * lim) continue;
        dg = smin(dg, primDist(p, x, y, z), p.k);
      } else {
        const lim = p.k - dg;
        if (lim < 0 || lb2 > lim * lim) continue;
        dg = smax(dg, -primDist(p, x, y, z), p.k);
      }
    }
    d = smin(d, dg, kj);
  }
  if (y < floorY + 0.03) d = smax(d, floorY - y, 0.006);
  return d;
}

function filterList(groups, bb, m) {
  const out = [];
  const hit = (b) => b[0] <= bb[3] + m && b[3] >= bb[0] - m && b[1] <= bb[4] + m && b[4] >= bb[1] - m && b[2] <= bb[5] + m && b[5] >= bb[2] - m;
  // a fixed order (smooth-min is not associative): identical values wherever blocks share grid points
  for (const g of groups) {
    if (!hit(g.bb)) continue;
    const prims = g.sorted.filter((p) => hit(p.bb));
    if (prims.length) out.push({ g, prims });
  }
  return out;
}

export function bodySDF(body) {
  const all = body.groups.map((g) => ({ g, prims: g.sorted }));
  return (x, y, z) => evalList(all, body.floorY, x, y, z);
}

// ------------------------------------------------------------------------------------------
// mesh + drawing data
export function meshBody(body, { cell = 0.0065, bounds = [-1.03, -1.215, -0.2, 1.03, 0.83, 0.27], aoDist = 0.045, BS = 8 } = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
  const h = cell, S1 = BS + 1;
  const [X0, Y0, Z0] = bounds;
  const nx = Math.ceil((bounds[3] - X0) / h), ny = Math.ceil((bounds[4] - Y0) / h), nz = Math.ceil((bounds[5] - Z0) / h);
  const bx = Math.ceil(nx / BS), by = Math.ceil(ny / BS), bz = Math.ceil(nz / BS);
  const margin = 0.09;
  const blocks = new Map();                 // block id → { list, vals }
  const inside = new Uint8Array(bx * by * bz);   // skipped blocks that are fully inside
  const halfDiag = Math.sqrt(3) * BS * h * 0.5;
  let samples = 0;
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    const x0 = X0 + I * BS * h, y0 = Y0 + J * BS * h, z0 = Z0 + K * BS * h, e = BS * h;
    const bb = [x0, y0, z0, x0 + e, y0 + e, z0 + e];
    const list = filterList(body.groups, bb, margin);
    if (!list.length) continue;
    const dc = evalList(list, body.floorY, x0 + e / 2, y0 + e / 2, z0 + e / 2);
    if (Math.abs(dc) > halfDiag * 1.35 + 0.004) { if (dc < 0) inside[I + bx * (J + by * K)] = 1; continue; }
    // sparse refinement: 2³-cell sub-blocks, tested at their centre (a grid point), sampled only near the surface
    const vals = new Float32Array(S1 * S1 * S1).fill(NaN);
    const fillv = new Float32Array(S1 * S1 * S1).fill(NaN);
    const subR = Math.sqrt(3) * h * 1.15 + 0.0015;
    for (let c = 1; c < S1; c += 2) for (let b = 1; b < S1; b += 2) for (let a = 1; a < S1; a += 2) {
      const ci = a + S1 * (b + S1 * c);
      const dc2 = evalList(list, body.floorY, x0 + a * h, y0 + b * h, z0 + c * h);
      vals[ci] = dc2; samples++;
      if (Math.abs(dc2) > subR) {
        const fv = dc2 > 0 ? dc2 - subR : dc2 + subR;
        for (let cc = c - 1; cc <= c + 1; cc++) for (let bb2 = b - 1; bb2 <= b + 1; bb2++) for (let aa = a - 1; aa <= a + 1; aa++) {
          const q = aa + S1 * (bb2 + S1 * cc); if (Number.isNaN(fillv[q]) || Math.abs(fv) < Math.abs(fillv[q])) fillv[q] = fv;
        }
        continue;
      }
      for (let cc = c - 1; cc <= c + 1; cc++) for (let bb2 = b - 1; bb2 <= b + 1; bb2++) for (let aa = a - 1; aa <= a + 1; aa++) {
        const q = aa + S1 * (bb2 + S1 * cc);
        if (Number.isNaN(vals[q])) { vals[q] = evalList(list, body.floorY, x0 + aa * h, y0 + bb2 * h, z0 + cc * h); samples++; }
      }
    }
    for (let q = 0; q < vals.length; q++) if (Number.isNaN(vals[q])) vals[q] = fillv[q];
    blocks.set(I + bx * (J + by * K), { I, J, K, list, vals });
  }
  const tSample = (typeof performance !== 'undefined' ? performance : Date).now();

  // ---------------------------------------------------------------- surface nets
  const cellVert = new Map();
  const pos = [], vlist = [];
  const cv = new Float32Array(8);
  const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];
  const seed = [];
  for (const blk of blocks.values()) {
    const { I, J, K, vals } = blk;
    for (let c = 0; c < BS; c++) for (let b = 0; b < BS; b++) for (let a = 0; a < BS; a++) {
      const gi = I * BS + a, gj = J * BS + b, gk = K * BS + c;
      if (gi >= nx || gj >= ny || gk >= nz) continue;
      let mask = 0;
      for (let q = 0; q < 8; q++) { const v = vals[(a + (q & 1)) + S1 * ((b + ((q >> 1) & 1)) + S1 * (c + (q >> 2)))]; cv[q] = v; if (v < 0) mask |= 1 << q; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 24; e += 2) {
        const p = EDGES[e], q = EDGES[e + 1];
        const va = cv[p], vb = cv[q];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        sx += (p & 1) + ((q & 1) - (p & 1)) * t; sy += ((p >> 1) & 1) + (((q >> 1) & 1) - ((p >> 1) & 1)) * t; sz += (p >> 2) + ((q >> 2) - (p >> 2)) * t;
        n++;
      }
      // trilinear gradient of the cell (seeds the Newton projection without extra SDF evaluations)
      const fx = sx / n, fy_ = sy / n, fz = sz / n;
      const c00 = cv[0] + (cv[1] - cv[0]) * fx, c10 = cv[2] + (cv[3] - cv[2]) * fx, c01 = cv[4] + (cv[5] - cv[4]) * fx, c11 = cv[6] + (cv[7] - cv[6]) * fx;
      const c0 = c00 + (c10 - c00) * fy_, c1 = c01 + (c11 - c01) * fy_;
      const fval = c0 + (c1 - c0) * fz;
      const gX = ((cv[1] - cv[0]) * (1 - fy_) + (cv[3] - cv[2]) * fy_) * (1 - fz) + ((cv[5] - cv[4]) * (1 - fy_) + (cv[7] - cv[6]) * fy_) * fz;
      const gY = (c10 - c00) * (1 - fz) + (c11 - c01) * fz;
      const gZ = c1 - c0;
      seed.push(fval, gX / h, gY / h, gZ / h);
      const vi = pos.length / 3;
      pos.push(X0 + (gi + sx / n) * h, Y0 + (gj + sy / n) * h, Z0 + (gk + sz / n) * h);
      vlist.push(blk.list);
      cellVert.set(gi + nx * (gj + ny * gk), vi);
    }
  }
  const idx = [];
  const id = (i, j, k) => (i < 0 || j < 0 || k < 0) ? undefined : cellVert.get(i + nx * (j + ny * k));
  for (const blk of blocks.values()) {
    const { I, J, K, vals } = blk;
    for (let c = 0; c < BS; c++) for (let b = 0; b < BS; b++) for (let a = 0; a < BS; a++) {
      const gi = I * BS + a, gj = J * BS + b, gk = K * BS + c;
      if (gi >= nx || gj >= ny || gk >= nz) continue;
      const v0 = vals[a + S1 * (b + S1 * c)];
      const in0 = v0 < 0;
      // edges along x, y, z from this grid point
      for (let ax = 0; ax < 3; ax++) {
        const v1 = vals[(a + (ax === 0)) + S1 * ((b + (ax === 1)) + S1 * (c + (ax === 2)))];
        if (in0 === (v1 < 0)) continue;
        // the four cells sharing this edge
        let du, dv;
        if (ax === 0) { du = [0, 1, 0]; dv = [0, 0, 1]; } else if (ax === 1) { du = [0, 0, 1]; dv = [1, 0, 0]; } else { du = [1, 0, 0]; dv = [0, 1, 0]; }
        const q0 = id(gi, gj, gk), q1 = id(gi - du[0], gj - du[1], gk - du[2]), q2 = id(gi - du[0] - dv[0], gj - du[1] - dv[1], gk - du[2] - dv[2]), q3 = id(gi - dv[0], gj - dv[1], gk - dv[2]);
        if (q0 === undefined || q1 === undefined || q2 === undefined || q3 === undefined) { if (globalThis.__miss) globalThis.__miss.push([X0 + gi * h, Y0 + gj * h, Z0 + gk * h, ax, v0, v1]); continue; }
        if (in0) idx.push(q0, q1, q2, q0, q2, q3); else idx.push(q0, q2, q1, q0, q3, q2);
      }
    }
  }
  const tNets = (typeof performance !== 'undefined' ? performance : Date).now();

  // ---------------------------------------------------------------- project to surface, normals, AO
  const nv = pos.length / 3;
  const P = new Float32Array(pos), N = new Float32Array(nv * 3), AO = new Float32Array(nv);
  const fy = body.floorY;
  const ge = h * 0.35;
  const grad = (list, x, y, z, out) => {
    // tetrahedral gradient
    const a = evalList(list, fy, x + ge, y - ge, z - ge), b = evalList(list, fy, x - ge, y - ge, z + ge);
    const c = evalList(list, fy, x - ge, y + ge, z - ge), d = evalList(list, fy, x + ge, y + ge, z + ge);
    out[0] = a - b - c + d; out[1] = -a - b + c + d; out[2] = -a + b - c + d;
    out[3] = (a + b + c + d) * 0.25;
  };
  const g4 = new Float64Array(4);
  for (let v = 0; v < nv; v++) {
    const list = vlist[v];
    let x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    {   // Newton step from the trilinear estimate, then one exact gradient + a final correction along it
      const f0 = seed[v * 4], gx = seed[v * 4 + 1], gy = seed[v * 4 + 2], gz = seed[v * 4 + 3];
      const gl2 = gx * gx + gy * gy + gz * gz;
      if (gl2 > 1e-10) {
        let mx = -gx * f0 / gl2, my = -gy * f0 / gl2, mz = -gz * f0 / gl2;
        const ml = Math.hypot(mx, my, mz);
        if (ml > h * 0.9) { const k = h * 0.9 / ml; mx *= k; my *= k; mz *= k; }
        x += mx; y += my; z += mz;
      }
      grad(list, x, y, z, g4);
      const gl = Math.hypot(g4[0], g4[1], g4[2]) || 1;
      const k = Math.max(-h, Math.min(h, g4[3] * 4 * ge / gl));
      x -= g4[0] / gl * k; y -= g4[1] / gl * k; z -= g4[2] / gl * k;
    }
    const gl = Math.hypot(g4[0], g4[1], g4[2]) || 1;
    const nx_ = g4[0] / gl, ny_ = g4[1] / gl, nz_ = g4[2] / gl;
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = nx_; N[v * 3 + 1] = ny_; N[v * 3 + 2] = nz_;
    // SDF ambient occlusion
    let occ = 0, w = 1;
    for (let i = 1; i <= 3; i++) {
      const dd = aoDist * i / 3;
      occ += w * Math.max(0, dd - evalList(list, fy, x + nx_ * dd, y + ny_ * dd, z + nz_ * dd));
      w *= 0.6;
    }
    AO[v] = Math.max(0, Math.min(1, 1 - occ * 7.5));
  }
  const tDone = (typeof performance !== 'undefined' ? performance : Date).now();

  // ---------------------------------------------------------------- drawing fields (orthographic, looking down -z)
  const W = nx + 1, H = ny + 1;
  const sil = new Float32Array(W * H).fill(0.06);   // min over z of f  (≈ 2D signed distance to the silhouette)
  const silZ = new Float32Array(W * H);             // z of that minimum
  const front = new Float32Array(W * H).fill(-1e9); // z of the front surface
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    if (!inside[I + bx * (J + by * K)]) continue;
    for (let b = 0; b <= BS; b++) for (let a = 0; a <= BS; a++) {
      const i = I * BS + a, j = J * BS + b; if (i >= W || j >= H) continue;
      const o = i + W * j; if (sil[o] > -0.03) sil[o] = -0.03;
    }
  }
  for (const blk of blocks.values()) {
    const { I, J, K, vals } = blk;
    for (let b = 0; b <= BS; b++) for (let a = 0; a <= BS; a++) {
      const i = I * BS + a, j = J * BS + b; if (i >= W || j >= H) continue;
      const o = i + W * j;
      let m = sil[o];
      for (let c = 0; c <= BS; c++) {
        const v = vals[a + S1 * (b + S1 * c)];
        if (v < m) { m = v; silZ[o] = Z0 + (K * BS + c) * h; }
        if (c < BS) {
          const v2 = vals[a + S1 * (b + S1 * (c + 1))];
          if (v < 0 && v2 >= 0) { const z = Z0 + (K * BS + c + v / (v - v2)) * h; if (z > front[o]) front[o] = z; }
        }
      }
      sil[o] = m;
    }
  }
  // front-surface normal + cavity (how much the surface curls back over itself: creases between masses)
  const fAll = bodySDF(body);
  // refine the silhouette band exactly: golden-section minimisation of f along z around the grid's argmin
  // (the sparse grid's skipped blocks only hold bounds, which would leave steps in the contour)
  {
    const gr = 0.381966;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const o = i + W * j; if (sil[o] > 0.03 || sil[o] < -0.02) continue;
      const x = X0 + i * h, y = Y0 + j * h;
      let a = silZ[o] - 2.5 * h, b = silZ[o] + 2.5 * h;
      let c = b - (b - a) * (1 - gr), d = a + (b - a) * (1 - gr);
      let fc = fAll(x, y, c), fd = fAll(x, y, d);
      for (let it = 0; it < 9; it++) {
        if (fc < fd) { b = d; d = c; fd = fc; c = b - (b - a) * (1 - gr); fc = fAll(x, y, c); }
        else { a = c; c = d; fc = fd; d = a + (b - a) * (1 - gr); fd = fAll(x, y, d); }
      }
      sil[o] = Math.min(fc, fd);
    }
  }
  const nrm = new Float32Array(W * H * 3), cav = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const o = i + W * j; if (front[o] < -1e8 || sil[o] > 0) continue;
    const x = X0 + i * h, y = Y0 + j * h, z = front[o];
    const blk = blocks.get(Math.min(bx - 1, Math.floor(i / BS)) + bx * (Math.min(by - 1, Math.floor(j / BS)) + by * Math.min(bz - 1, Math.floor((z - Z0) / h / BS))));
    const f = blk ? (X, Y, Z) => evalList(blk.list, body.floorY, X, Y, Z) : fAll;
    const e = 0.002;
    const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const n0 = gx / gl, n1 = gy / gl, n2 = gz / gl;
    nrm[o * 3] = n0; nrm[o * 3 + 1] = n1; nrm[o * 3 + 2] = n2;
    let c = 0;
    for (const dd of [0.008, 0.016, 0.028]) c += Math.max(0, dd - f(x + n0 * dd, y + n1 * dd, z + n2 * dd)) / dd;
    cav[o] = c / 3;
  }
  const tDraw = (typeof performance !== 'undefined' ? performance : Date).now();
  return {
    positions: P, normals: N, ao: AO, index: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx),
    grid: { x0: X0, y0: Y0, h, w: W, hgt: H, sil, front, nrm, cav },
    stats: { verts: nv, tris: idx.length / 3, samples, blocks: blocks.size, ms: { sample: tSample - t0, nets: tNets - tSample, project: tDone - tNets, draw: tDraw - tDone, total: tDraw - t0 } },
  };
}

// 2D projected field (min over z) of a subset of groups — for the faint second pose.
export function projectGroups(body, filter, { x0, y0, x1, y1, h, zs = [0.05, 0.1, 0.15, 0.19], footY = -0.85 }) {
  const groups = body.groups.filter((g) => filter(g.name));
  const list = groups.map((g) => ({ g, prims: g.sorted }));
  const W = Math.ceil((x1 - x0) / h) + 1, H = Math.ceil((y1 - y0) / h) + 1;
  const out = new Float32Array(W * H);
  const bb = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
  for (const g of groups) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], g.bb[i]); bb[i + 3] = Math.max(bb[i + 3], g.bb[i + 3]); }
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * h, y = y0 + j * h;
    if (x < bb[0] - 0.04 || x > bb[3] + 0.04 || y < bb[1] - 0.04 || y > bb[4] + 0.04) { out[i + W * j] = 0.04; continue; }
    // limbs are centred near z = 0, so the mid-plane slice is their silhouette; feet reach forward
    let m = evalList(list, -1e9, x, y, 0);
    if (y < footY) { for (const z of zs) { if (m < 0) break; const v = evalList(list, -1e9, x, y, z); if (v < m) m = v; } }
    out[i + W * j] = m;
  }
  return { x0, y0, h, w: W, hgt: H, data: out };
}
