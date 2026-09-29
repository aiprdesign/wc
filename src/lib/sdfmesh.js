// Signed-distance modelling helpers: smooth primitives (round cones, ellipsoids) blended with a
// polynomial smooth-min, and a surface-nets mesher that turns the field into a smooth, indexed
// BufferGeometry (vertices projected onto the zero set, normals from the field gradient).
// Build-time only; nothing here runs per frame.
import * as THREE from 'three';

// polynomial smooth minimum (exact min once |a - b| >= k)
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// 2D round cone (uneven capsule) a→b with radii ra, rb.
export function sdRoundCone2(px, py, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay, h = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / h, uy = dy / h;
  const qx0 = px - ax, qy0 = py - ay;
  const ly = qx0 * ux + qy0 * uy, lx = Math.abs(-qx0 * uy + qy0 * ux);
  const b = (ra - rb) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = -b * lx + a * ly;
  if (k < 0) return Math.hypot(lx, ly) - ra;
  if (k > a * h) return Math.hypot(lx, ly - h) - rb;
  return lx * a + ly * b - ra;
}

// 3D round cone; the section is squashed by `flat` along z (flat = 1: round).
export function sdRoundCone3(px, py, pz, p) {
  const [ax, ay, az] = p.a, [bx, by, bz] = p.b;
  const qz = (pz - (az + bz) * 0.5) / p.flat + (az + bz) * 0.5;
  const dx = bx - ax, dy = by - ay, dz = bz - az, h = Math.hypot(dx, dy, dz) || 1e-6;
  const ux = dx / h, uy = dy / h, uz = dz / h;
  const wx = px - ax, wy = py - ay, wz = qz - az;
  const ly = wx * ux + wy * uy + wz * uz;
  const lx = Math.sqrt(Math.max(0, wx * wx + wy * wy + wz * wz - ly * ly));
  const b = (p.ra - p.rb) / h, a = Math.sqrt(Math.max(0, 1 - b * b));
  const k = -b * lx + a * ly;
  let d;
  if (k < 0) d = Math.hypot(lx, ly) - p.ra;
  else if (k > a * h) d = Math.hypot(lx, ly - h) - p.rb;
  else d = lx * a + ly * b - p.ra;
  // cap: 1 = cut flat at a, 2 = cut flat at b (open vessel ends)
  if (p.cap) { if (p.cap & 1) d = Math.max(d, -ly); if (p.cap & 2) d = Math.max(d, ly - h); }
  return d;
}

// ellipsoid (iq's bound), and its 2D projection (an ellipse)
// (ang: rotation of the ellipsoid about z)
export function sdEllipsoid3(px, py, pz, c, r, ang = 0) {
  let x = px - c[0], y = py - c[1];
  const z = pz - c[2];
  if (ang) { const cs = Math.cos(ang), sn = Math.sin(ang), u = x * cs + y * sn; y = -x * sn + y * cs; x = u; }
  const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]);
  const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : k0 * (k0 - 1) / k1;
}
export function sdEllipse2(px, py, c, r, ang = 0) {
  let x = px - c[0], y = py - c[1];
  if (ang) { const cs = Math.cos(ang), sn = Math.sin(ang), u = x * cs + y * sn; y = -x * sn + y * cs; x = u; }
  const k0 = Math.hypot(x / r[0], y / r[1]);
  const k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]));
  return k1 < 1e-9 ? -Math.min(r[0], r[1]) : k0 * (k0 - 1) / k1;
}

// A 'profile' body of revolution-like trunk: half-width w(y) (seen head-on) and half-depth d(y) through
// knots, elliptical sections centred on z = 0. Tables are baked once for speed.
export function profilePrim(ys, ws, ds, k = 0, n = 1024) {
  const y0 = ys[0], y1 = ys[ys.length - 1];
  const hermite = (vals) => {
    // monotone cubic (Fritsch–Carlson) through the knots → n samples
    const m = ys.length, sl = [], t = new Array(m).fill(0);
    for (let i = 0; i < m - 1; i++) sl.push((vals[i + 1] - vals[i]) / (ys[i + 1] - ys[i]));
    t[0] = sl[0]; t[m - 1] = sl[m - 2];
    for (let i = 1; i < m - 1; i++) t[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
    for (let i = 0; i < m - 1; i++) {
      if (sl[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / sl[i], b = t[i + 1] / sl[i], q = a * a + b * b;
      if (q > 9) { const r = 3 / Math.sqrt(q); t[i] = r * a * sl[i]; t[i + 1] = r * b * sl[i]; }
    }
    const out = new Float32Array(n + 1);
    for (let j = 0, i = 0; j <= n; j++) {
      const y = y0 + (y1 - y0) * j / n;
      while (i < m - 2 && y > ys[i + 1]) i++;
      const h = ys[i + 1] - ys[i], u = Math.min(1, Math.max(0, (y - ys[i]) / h));
      const h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
      out[j] = h00 * vals[i] + h10 * h * t[i] + h01 * vals[i + 1] + h11 * h * t[i + 1];
    }
    return out;
  };
  const W = hermite(ws), D = hermite(ds), dW = new Float32Array(n + 1), dD = new Float32Array(n + 1);
  const dy = (y1 - y0) / n;
  for (let j = 0; j <= n; j++) { const a = Math.max(0, j - 1), b = Math.min(n, j + 1); dW[j] = (W[b] - W[a]) / ((b - a) * dy); dD[j] = (D[b] - D[a]) / ((b - a) * dy); }
  return { type: 'prof', y0, y1, n, W, D, dW, dD, wMax: Math.max(...ws), k };
}
function sdProfile(px, py, pz, p) {
  const u = (py - p.y0) / (p.y1 - p.y0) * p.n;
  const out = Math.max(p.y0 - py, py - p.y1);
  const j = Math.min(p.n, Math.max(0, Math.round(u)));
  const w = Math.max(1e-4, p.W[j]), d = Math.max(1e-4, p.D[j]);
  const x = Math.abs(px), z = Math.abs(pz);
  const k0 = Math.hypot(x / w, z / d), k1 = Math.hypot(x / (w * w), z / (d * d));
  const e = k1 < 1e-9 ? -Math.min(w, d) : k0 * (k0 - 1) / k1;
  // the section radius changes along y: tilt-correct the distance
  const g = p.dW[j] * (x / w) * (x / Math.max(k0 * w, 1e-6)) + p.dD[j] * (z / d) * (z / Math.max(k0 * d, 1e-6));
  const dist = e / Math.sqrt(1 + g * g);
  return out > 0 ? Math.max(dist, out) : dist;
}

// Primitive list → fields. Each primitive: { type: 'cone', a:[x,y,z], b:[x,y,z], ra, rb, flat, k }
// or { type: 'ell', c:[x,y,z], r:[rx,ry,rz], ang, k }. k = blend radius with what came before.
// field2(x, y): the silhouette seen along z (same blends), field3(x, y, z): the solid.
function bbox2(p) {
  if (p.type === 'prof') return [-p.wMax, p.y0, p.wMax, p.y1];
  if (p.type === 'ell') { const m = p.ang ? Math.max(p.r[0], p.r[1]) : 0, ex = m || p.r[0], ey = m || p.r[1]; return [p.c[0] - ex, p.c[1] - ey, p.c[0] + ex, p.c[1] + ey]; }
  const r = Math.max(p.ra, p.rb);
  return [Math.min(p.a[0], p.b[0]) - r, Math.min(p.a[1], p.b[1]) - r, Math.max(p.a[0], p.b[0]) + r, Math.max(p.a[1], p.b[1]) + r];
}
export const sdPrim3 = (p, x, y, z) => (p.type === 'ell' ? sdEllipsoid3(x, y, z, p.c, p.r, p.ang) : p.type === 'prof' ? sdProfile(x, y, z, p) : sdRoundCone3(x, y, z, p));
export function sdfBody(prims) {
  const boxes = prims.map(bbox2);
  const d2 = (p, x, y) => (p.type === 'ell' ? sdEllipse2(x, y, p.c, p.r, p.ang) : p.type === 'prof' ? sdProfile(x, y, 0, p) : sdRoundCone2(x, y, p.a[0], p.a[1], p.b[0], p.b[1], p.ra, p.rb));
  const d3 = sdPrim3;
  const field2 = (x, y) => {
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const b = boxes[i], k = prims[i].k ?? 0;
      const ox = Math.max(b[0] - x, 0, x - b[2]), oy = Math.max(b[1] - y, 0, y - b[3]);
      if (ox * ox + oy * oy > (d + k) * (d + k) && ox + oy > 0 && d < 1e8) continue;   // too far to change the blend
      d = smin(d, d2(prims[i], x, y), k);
    }
    return d;
  };
  const field3 = (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < prims.length; i++) d = smin(d, d3(prims[i], x, y, z), prims[i].k ?? 0);
    return d;
  };
  // column culling for the mesher: only primitives whose footprint is near (x, y) can matter
  const active = new Int32Array(prims.length);
  let nActive = 0;
  const column = (x, y, margin) => {
    nActive = 0;
    let far = 1e9;
    for (let i = 0; i < prims.length; i++) {
      const b = boxes[i];
      const ox = Math.max(b[0] - x, 0, x - b[2]), oy = Math.max(b[1] - y, 0, y - b[3]);
      const o = Math.hypot(ox, oy);
      if (o < margin) active[nActive++] = i; else if (o < far) far = o;
    }
    return nActive ? undefined : far;
  };
  const columnField = (x, y, z) => {
    let d = 1e9;
    for (let j = 0; j < nActive; j++) { const p = prims[active[j]]; d = smin(d, d3(p, x, y, z), p.k ?? 0); }
    return d;
  };
  return { field2, field3, column, columnField };
}

// Surface nets over [min, max] with cell size h. body: the object from sdfBody().
export function meshBody(body, min, max, h, { project = 1 } = {}) {
  const nx = Math.ceil((max[0] - min[0]) / h) + 1, ny = Math.ceil((max[1] - min[1]) / h) + 1, nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const vals = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => (k * ny + j) * nx + i;
  const margin = 0.12 + 3 * h;
  const live = new Uint8Array(nx * ny);                  // columns that were sampled in 3D
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = min[0] + i * h, y = min[1] + j * h;
    // the solid lies inside its own silhouette: columns clear of it need no 3D samples
    let far = body.field2(x, y);
    if (far < 2 * h) far = body.column(x, y, margin);
    if (far === undefined) live[j * nx + i] = 1;
    for (let k = 0; k < nz; k++) vals[id(i, j, k)] = far !== undefined ? far : body.columnField(x, y, min[2] + k * h);
  }
  // a cell / edge can only cross the surface if one of its columns is live
  const near = (i, j) => live[j * nx + i] | live[j * nx + i + 1] | live[(j + 1) * nx + i] | live[(j + 1) * nx + i + 1];
  // one vertex per sign-changing cell: the mean of its edge crossings
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float64Array(8), cx = [0, 1, 0, 1, 0, 1, 0, 1], cy = [0, 0, 1, 1, 0, 0, 1, 1], cz = [0, 0, 0, 0, 1, 1, 1, 1];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nz - 1; k++) {
    if (!near(i, j)) break;
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = vals[id(i + cx[c], j + cy[c], k + cz[c])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let q = 0; q < 12; q++) {
      const a = E[q][0], b = E[q][1];
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += cx[a] + (cx[b] - cx[a]) * t; sy += cy[a] + (cy[b] - cy[a]) * t; sz += cz[a] + (cz[b] - cz[a]) * t; n++;
    }
    cellV[cid(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * h, min[1] + (j + sy / n) * h, min[2] + (k + sz / n) * h);
  }
  // quads across every sign-changing grid edge
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
  for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) for (let k = 1; k < nz - 1; k++) {
    if (!(live[j * nx + i] | live[j * nx + i + 1])) break;
    const v0 = vals[id(i, j, k)], v1 = vals[id(i + 1, j, k)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(cellV[cid(i, j - 1, k - 1)], cellV[cid(i, j, k - 1)], cellV[cid(i, j, k)], cellV[cid(i, j - 1, k)], v0 >= 0);
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) for (let k = 1; k < nz - 1; k++) {
    if (!(live[j * nx + i] | live[(j + 1) * nx + i])) break;
    const v0 = vals[id(i, j, k)], v1 = vals[id(i, j + 1, k)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(cellV[cid(i - 1, j, k - 1)], cellV[cid(i - 1, j, k)], cellV[cid(i, j, k)], cellV[cid(i, j, k - 1)], v0 >= 0);
  }
  for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) for (let k = 0; k < nz - 1; k++) {
    if (!live[j * nx + i]) break;
    const v0 = vals[id(i, j, k)], v1 = vals[id(i, j, k + 1)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(cellV[cid(i - 1, j - 1, k)], cellV[cid(i, j - 1, k)], cellV[cid(i, j, k)], cellV[cid(i - 1, j, k)], v0 >= 0);
  }
  // project onto the zero set and take normals from the gradient
  const f = body.columnField, e = h * 0.25;
  const P = new Float32Array(pos), N = new Float32Array(pos.length);
  for (let v = 0; v < P.length; v += 3) {
    let x = P[v], y = P[v + 1], z = P[v + 2], gx = 0, gy = 0, gz = 1;
    body.column(x, y, margin);
    for (let it = 0; it <= project; it++) {
      const d = f(x, y, z);
      gx = f(x + e, y, z) - f(x - e, y, z); gy = f(x, y + e, z) - f(x, y - e, z); gz = f(x, y, z + e) - f(x, y, z - e);
      const g2 = gx * gx + gy * gy + gz * gz;
      if (it === project || g2 < 1e-12) break;
      const s = d * (2 * e) / g2;
      const step = Math.min(1, h / (Math.abs(s) * Math.sqrt(g2) / (2 * e) + 1e-9));   // never move more than a cell
      x -= gx * s * step; y -= gy * s * step; z -= gz * s * step;
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    P[v] = x; P[v + 1] = y; P[v + 2] = z;
    N[v] = gx / gl; N[v + 1] = gy / gl; N[v + 2] = gz / gl;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
