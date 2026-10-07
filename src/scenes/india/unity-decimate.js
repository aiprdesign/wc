// Quadric-error edge-collapse decimation (Garland & Heckbert) for the Statue of Unity's low-poly figure
// (src/scenes/india/unity-figure.js; build time only). Takes an indexed BufferGeometry and returns an
// indexed one with at most `target` triangles:
//   · each vertex carries the sum of the plane quadrics of its faces (area-weighted); open rims add stiff
//     planes perpendicular to the rim, so the hidden seams (neck, wrists) stay where they are
//   · an edge collapses to the point that minimises the summed quadric (or the best of its ends / middle)
//   · collapses that would flip a face, make a sliver, or break the manifold (link condition) are refused,
//     so the result is a clean set of well-shaped planar facets
import * as THREE from 'three';

class Heap {
  constructor(cap = 1024) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  push(key, val) {
    if (this.n === this.k.length) { const k = new Float64Array(this.n * 2), v = new Int32Array(this.n * 2); k.set(this.k); v.set(this.v); this.k = k; this.v = v; }
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  }
  pop() {   // → value of the smallest key (this.top holds its key)
    const K = this.k, V = this.v, out = V[0]; this.top = K[0];
    const n = --this.n, key = K[n], val = V[n];
    let i = 0;
    for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && K[c + 1] < K[c]) c++; if (K[c] >= key) break; K[i] = K[c]; V[i] = V[c]; i = c; }
    K[i] = key; V[i] = val;
    return out;
  }
}

export function decimate(geo, target, { boundaryWeight = 50, minQuality = 0.18, evenness = 0.003 } = {}) {
  const P0 = geo.attributes.position, I0 = geo.index.array;
  const nv = P0.count;
  const X = new Float64Array(nv * 3);
  for (let i = 0; i < nv; i++) { X[i * 3] = P0.getX(i); X[i * 3 + 1] = P0.getY(i); X[i * 3 + 2] = P0.getZ(i); }
  // faces (degenerate ones from the mesher dropped)
  const F = [];
  for (let f = 0; f < I0.length; f += 3) { const a = I0[f], b = I0[f + 1], c = I0[f + 2]; if (a !== b && b !== c && a !== c) F.push(a, b, c); }
  const nf = F.length / 3, faceAlive = new Uint8Array(nf).fill(1);
  const vf = Array.from({ length: nv }, () => []);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) vf[F[f * 3 + k]].push(f);
  const Q = new Float64Array(nv * 10);
  const addQ = (v, a, b, c, d, w) => {
    const q = v * 10;
    Q[q] += w * a * a; Q[q + 1] += w * a * b; Q[q + 2] += w * a * c; Q[q + 3] += w * a * d;
    Q[q + 4] += w * b * b; Q[q + 5] += w * b * c; Q[q + 6] += w * b * d;
    Q[q + 7] += w * c * c; Q[q + 8] += w * c * d; Q[q + 9] += w * d * d;
  };
  const fnorm = (a, b, c, out) => {
    const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
    const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
    out[0] = uy * vz - uz * vy; out[1] = uz * vx - ux * vz; out[2] = ux * vy - uy * vx;
    return Math.hypot(out[0], out[1], out[2]);
  };
  const n3 = [0, 0, 0];
  for (let f = 0; f < nf; f++) {
    const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2], L = fnorm(a, b, c, n3);
    if (L < 1e-14) continue;
    const nx = n3[0] / L, ny = n3[1] / L, nz = n3[2] / L, d = -(nx * X[a * 3] + ny * X[a * 3 + 1] + nz * X[a * 3 + 2]), w = L * 0.5;
    addQ(a, nx, ny, nz, d, w); addQ(b, nx, ny, nz, d, w); addQ(c, nx, ny, nz, d, w);
  }
  // open rims: count each edge's faces; a one-face edge gets a perpendicular constraint plane
  const ekey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const ecount = new Map();
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const e = ekey(F[f * 3 + k], F[f * 3 + (k + 1) % 3]); ecount.set(e, (ecount.get(e) ?? 0) + 1); }
  const border = new Uint8Array(nv);
  for (let f = 0; f < nf; f++) {
    const a0 = F[f * 3], b0 = F[f * 3 + 1], c0 = F[f * 3 + 2], L = fnorm(a0, b0, c0, n3);
    if (L < 1e-14) continue;
    for (let k = 0; k < 3; k++) {
      const a = F[f * 3 + k], b = F[f * 3 + (k + 1) % 3];
      if (ecount.get(ekey(a, b)) !== 1) continue;
      border[a] = border[b] = 1;
      const ex = X[b * 3] - X[a * 3], ey = X[b * 3 + 1] - X[a * 3 + 1], ez = X[b * 3 + 2] - X[a * 3 + 2], el = Math.hypot(ex, ey, ez) || 1e-9;
      let px = ey * n3[2] - ez * n3[1], py = ez * n3[0] - ex * n3[2], pz = ex * n3[1] - ey * n3[0];
      const pl = Math.hypot(px, py, pz) || 1e-9; px /= pl; py /= pl; pz /= pl;
      const d = -(px * X[a * 3] + py * X[a * 3 + 1] + pz * X[a * 3 + 2]), w = boundaryWeight * el * el;
      addQ(a, px, py, pz, d, w); addQ(b, px, py, pz, d, w);
    }
  }

  // candidate collapses
  const ver = new Int32Array(nv), vAlive = new Uint8Array(nv).fill(1);
  const cand = { u: [], v: [], vu: [], vv: [], x: [], y: [], z: [] };
  const heap = new Heap(nv * 4);
  const qerr = (q, x, y, z) => Q[q] * x * x + 2 * Q[q + 1] * x * y + 2 * Q[q + 2] * x * z + 2 * Q[q + 3] * x + Q[q + 4] * y * y + 2 * Q[q + 5] * y * z + 2 * Q[q + 6] * y + Q[q + 7] * z * z + 2 * Q[q + 8] * z + Q[q + 9];
  const S = new Float64Array(10);
  const pushEdge = (u, v) => {
    for (let k = 0; k < 10; k++) S[k] = Q[u * 10 + k] + Q[v * 10 + k];
    const a = S[0], b = S[1], c = S[2], d = S[4], e = S[5], f = S[7];
    const det = a * (d * f - e * e) - b * (b * f - c * e) + c * (b * e - c * d);
    let x, y, z, best = Infinity;
    const err = (px, py, pz) => { const q = S; return q[0] * px * px + 2 * q[1] * px * py + 2 * q[2] * px * pz + 2 * q[3] * px + q[4] * py * py + 2 * q[5] * py * pz + 2 * q[6] * py + q[7] * pz * pz + 2 * q[8] * pz + q[9]; };
    const ux = X[u * 3], uy = X[u * 3 + 1], uz = X[u * 3 + 2], wx = X[v * 3], wy = X[v * 3 + 1], wz = X[v * 3 + 2];
    const scale = Math.abs(a) + Math.abs(d) + Math.abs(f);
    if (Math.abs(det) > 1e-9 * scale * scale * scale) {
      const r0 = -S[3], r1 = -S[6], r2 = -S[8];
      const ox = (r0 * (d * f - e * e) - b * (r1 * f - e * r2) + c * (r1 * e - d * r2)) / det;
      const oy = (a * (r1 * f - e * r2) - r0 * (b * f - c * e) + c * (b * r2 - r1 * c)) / det;
      const oz = (a * (d * r2 - r1 * e) - b * (b * r2 - r1 * c) + r0 * (b * e - c * d)) / det;
      // keep the optimum near the edge (far-flung optima come from nearly flat neighbourhoods)
      const mx = (ux + wx) / 2, my = (uy + wy) / 2, mz = (uz + wz) / 2, el = Math.hypot(wx - ux, wy - uy, wz - uz);
      if (Math.hypot(ox - mx, oy - my, oz - mz) < el * 1.5) { x = ox; y = oy; z = oz; best = err(x, y, z); }
    }
    for (const [px, py, pz] of [[ux, uy, uz], [wx, wy, wz], [(ux + wx) / 2, (uy + wy) / 2, (uz + wz) / 2]]) {
      const e2 = err(px, py, pz);
      if (e2 < best) { best = e2; x = px; y = py; z = pz; }
    }
    const id = cand.u.length;
    cand.u.push(u); cand.v.push(v); cand.vu.push(ver[u]); cand.vv.push(ver[v]); cand.x.push(x); cand.y.push(y); cand.z.push(z);
    // (plus a small term in the edge's length: short edges go first, so the facets come out even in size)
    const L2 = (wx - ux) ** 2 + (wy - uy) ** 2 + (wz - uz) ** 2;
    heap.push(Math.max(0, best) + evenness * L2 * L2, id);
  };
  for (const e of ecount.keys()) { const a = Math.floor(e / nv), b = e - a * nv; pushEdge(a, b); }

  const nbrs = (v, out) => { out.clear(); for (const f of vf[v]) if (faceAlive[f]) for (let k = 0; k < 3; k++) { const w = F[f * 3 + k]; if (w !== v) out.add(w); } return out; };
  const Nu = new Set(), Nv = new Set();
  const nOld = [0, 0, 0], nNew = [0, 0, 0];
  // would moving vertex `s` (in the faces not shared with `o`) to p flip or crush a face?
  const okMove = (s, o, px, py, pz) => {
    for (const f of vf[s]) {
      if (!faceAlive[f]) continue;
      const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
      if (a === o || b === o || c === o) continue;
      const L0 = fnorm(a, b, c, nOld);
      const sx = X[s * 3], sy = X[s * 3 + 1], sz = X[s * 3 + 2];
      X[s * 3] = px; X[s * 3 + 1] = py; X[s * 3 + 2] = pz;
      const L1 = fnorm(a, b, c, nNew);
      // triangle quality: 4√3·area / Σ edge²
      let e2 = 0;
      for (let k = 0; k < 3; k++) { const i = F[f * 3 + k], j = F[f * 3 + (k + 1) % 3]; e2 += (X[i * 3] - X[j * 3]) ** 2 + (X[i * 3 + 1] - X[j * 3 + 1]) ** 2 + (X[i * 3 + 2] - X[j * 3 + 2]) ** 2; }
      X[s * 3] = sx; X[s * 3 + 1] = sy; X[s * 3 + 2] = sz;
      if (L1 < 1e-14 || L0 < 1e-14) return false;
      if ((nOld[0] * nNew[0] + nOld[1] * nNew[1] + nOld[2] * nNew[2]) / (L0 * L1) < 0.3) return false;
      if (3.4641 * L1 / (e2 + 1e-30) < minQuality) return false;
    }
    return true;
  };
  let live = nf;
  while (live > target && heap.n > 0) {
    const id = heap.pop();
    const u = cand.u[id], v = cand.v[id];
    if (!vAlive[u] || !vAlive[v] || cand.vu[id] !== ver[u] || cand.vv[id] !== ver[v]) continue;
    // link condition: the two ends share exactly the vertices opposite the edge
    nbrs(u, Nu); nbrs(v, Nv);
    if (!Nu.has(v)) continue;
    let common = 0, shared = 0;
    for (const w of Nu) if (Nv.has(w)) common++;
    for (const f of vf[u]) if (faceAlive[f] && (F[f * 3] === v || F[f * 3 + 1] === v || F[f * 3 + 2] === v)) shared++;
    if (common !== shared) continue;
    if (border[u] && border[v] && shared !== 1) continue;    // (an edge joining two rims across the surface)
    const px = cand.x[id], py = cand.y[id], pz = cand.z[id];
    if (!okMove(u, v, px, py, pz) || !okMove(v, u, px, py, pz)) { continue; }
    // collapse u into v
    for (const f of vf[u]) {
      if (!faceAlive[f]) continue;
      const a = F[f * 3], b = F[f * 3 + 1], c = F[f * 3 + 2];
      if (a === v || b === v || c === v) { faceAlive[f] = 0; live--; continue; }
      for (let k = 0; k < 3; k++) if (F[f * 3 + k] === u) F[f * 3 + k] = v;
      vf[v].push(f);
    }
    vf[u] = [];
    vf[v] = vf[v].filter((f) => faceAlive[f]);
    X[v * 3] = px; X[v * 3 + 1] = py; X[v * 3 + 2] = pz;
    for (let k = 0; k < 10; k++) Q[v * 10 + k] += Q[u * 10 + k];
    border[v] |= border[u];
    vAlive[u] = 0; ver[v]++;
    // refresh the costs of the edges round the merged vertex (the only ones whose quadric sum moved)
    for (const w of nbrs(v, Nv)) pushEdge(v, w);
  }
  // compact
  const remap = new Int32Array(nv).fill(-1), pos = [], idx = [];
  for (let f = 0; f < nf; f++) {
    if (!faceAlive[f]) continue;
    for (let k = 0; k < 3; k++) {
      const v = F[f * 3 + k];
      if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(X[v * 3], X[v * 3 + 1], X[v * 3 + 2]); }
      idx.push(remap[v]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
