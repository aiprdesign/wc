// Vitruvian drawing strokes derived from the SDF body's orthographic fields (renaissance-body.js):
// silhouette field → contour passes, crease (cavity) field → interior anatomy, front normals → hatching.
// Pure JS (noise2 and rng are passed in) so it can be previewed outside the browser.

// Marching squares over f on a grid → array of [x0, y0, x1, y1] segments.
function contour(f, x0, x1, y0, y1, cell, keep = null) {
  const nx = Math.ceil((x1 - x0) / cell), ny = Math.ceil((y1 - y0) / cell);
  const vals = new Float32Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) vals[j * (nx + 1) + i] = f(x0 + i * cell, y0 + j * cell);
  const segs = [];
  const lerpP = (xa, ya, va, xb, yb, vb) => { const t = va / (va - vb); return [xa + (xb - xa) * t, ya + (yb - ya) * t]; };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const X = x0 + i * cell, Y = y0 + j * cell;
      const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1], c = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
      let idx = 0;
      if (a < 0) idx |= 1; if (b < 0) idx |= 2; if (c < 0) idx |= 4; if (d < 0) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const eB = () => lerpP(X, Y, a, X + cell, Y, b);                 // bottom edge
      const eR = () => lerpP(X + cell, Y, b, X + cell, Y + cell, c);   // right
      const eT = () => lerpP(X + cell, Y + cell, c, X, Y + cell, d);   // top
      const eL = () => lerpP(X, Y + cell, d, X, Y, a);                 // left
      const pairs = {
        1: [[eL, eB]], 2: [[eB, eR]], 3: [[eL, eR]], 4: [[eR, eT]], 5: [[eL, eT], [eB, eR]], 6: [[eB, eT]], 7: [[eL, eT]],
        8: [[eT, eL]], 9: [[eT, eB]], 10: [[eB, eL], [eR, eT]], 11: [[eT, eR]], 12: [[eR, eL]], 13: [[eR, eB]], 14: [[eB, eL]],
      }[idx];
      for (const [p, q] of pairs) {
        const A = p(), B = q();
        if (keep && !keep((A[0] + B[0]) / 2, (A[1] + B[1]) / 2)) continue;
        segs.push([A[0], A[1], B[0], B[1]]);
      }
    }
  }
  return segs;
}

export function drawVitruvian({ grid: GD, poseB: PB, noise2, rng }) {
  const R = rng(2207);
  const gridAt = (arr, x, y, out) => {        // bilinear lookup in the orthographic drawing grid
    const fx = (x - GD.x0) / GD.h, fy = (y - GD.y0) / GD.h;
    const i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= GD.w - 1 || j >= GD.hgt - 1) return out;
    const u = fx - i, v = fy - j, o = i + GD.w * j;
    return (arr[o] * (1 - u) + arr[o + 1] * u) * (1 - v) + (arr[o + GD.w] * (1 - u) + arr[o + GD.w + 1] * u) * v;
  };
  const fA = (x, y) => gridAt(GD.sil, x, y, 0.06);                       // ≈ 2D signed distance to the silhouette
  const cavAt = (x, y) => gridAt(GD.cav, x, y, 0);
  // the second pose (arms raised to the crown, legs opened 1/14 of the height): limbs only
  const fLimbsB = (x, y) => {
    const fx = (x - PB.x0) / PB.h, fy = (y - PB.y0) / PB.h, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= PB.w - 1 || j >= PB.hgt - 1) return 0.04;
    const u = fx - i, v = fy - j, o = i + PB.w * j, d = PB.data;
    return (d[o] * (1 - u) + d[o + 1] * u) * (1 - v) + (d[o + PB.w] * (1 - u) + d[o + PB.w + 1] * u) * v;
  };
  const BX0 = -1.06, BX1 = 1.06, BY0 = -1.26, BY1 = 0.88;
  const wob = (amp, freq, seed) => (x, y) => { const d = fA(x, y); return Math.abs(d) > 0.03 ? d : d + amp * noise2(x * freq + seed, y * freq - seed * 0.7); };

  // light construction pass (radial, from the navel outward)
  const segA = contour(wob(0.005, 3.0, 1.3), BX0, BX1, BY0, BY1, 0.0075);
  // firm pass (top → bottom with a little noise)
  const segB = contour(wob(0.0022, 7.0, 4.1), BX0, BX1, BY0, BY1, 0.0055);
  // third, loose pass slightly outside the form
  const segC0 = contour((x, y) => fA(x, y) - 0.006 + 0.005 * noise2(x * 11 + 9, y * 11), BX0, BX1, BY0, BY1, 0.009);
  // interior anatomy: the crease (cavity) field of the same body — pectorals, abdominals, knees, face, curls
  const CAV = 0.19;
  const segI0 = contour((x, y) => { const c = cavAt(x, y); return c < 0.1 ? 1 : CAV - c + 0.04 * noise2(x * 17, y * 17 + 5); }, BX0, BX1, BY0, BY1, 0.0045, (x, y) => {
    if (fA(x, y) > -0.007) return false;
    // keep one flank of each crease (the side turned away from the light) → open, single strokes
    const e = 0.006, gx = cavAt(x + e, y) - cavAt(x - e, y), gy = cavAt(x, y + e) - cavAt(x, y - e);
    return gx * -0.6 + gy * 0.8 > 0.01 * Math.hypot(gx, gy);
  });
  // second pose (arms raised, legs apart) — limbs only, outside the main figure
  const segP = contour((x, y) => fLimbsB(x, y) + 0.003 * noise2(x * 6, y * 6 + 3), BX0, BX1, BY0, BY1, 0.0075, (x, y) => fA(x, y) > 0.004);

  // hatching from the body's real front-surface normals: light from the upper left, left-handed strokes
  const hatch = [];
  {
    const L = (() => { const l = Math.hypot(-0.5, 0.55, 0.67); return { x: -0.5 / l, y: 0.55 / l, z: 0.67 / l }; })();
    const shade = (x, y) => {
      const d = fA(x, y);
      if (d > -0.004) return -1;
      const i = Math.round((x - GD.x0) / GD.h), j = Math.round((y - GD.y0) / GD.h);
      const o = i + GD.w * j;
      if (GD.front[o] < -1e8) return -1;
      const n = GD.nrm;
      const lam = n[o * 3] * L.x + n[o * 3 + 1] * L.y + n[o * 3 + 2] * L.z;
      return Math.max(0, lam) - cavAt(x, y) * 0.6;
    };
    const layer = (ang, spacing, thr, len, seed) => {
      const r = rng(seed);
      const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
      const ext = 1.7;
      for (let o = -ext; o <= ext; o += spacing) {
        let run = null;
        const step = 0.005;
        for (let s = -ext; s <= ext; s += step) {
          const x = px * o + dx * s, y = py * o + dy * s;
          if (x < BX0 || x > BX1 || y < BY0 || y > BY1) { run = null; continue; }
          const sh = shade(x, y);
          const dark = sh < -0.5 || (1 - sh) < thr - 0.08 ? false : (1 - sh) > thr + 0.08 * noise2(x * 9 + seed, y * 9);
          if (dark) {
            if (!run) run = { x, y, n: 0, target: len * (0.6 + r() * 0.8) };
            run.n += step;
            if (run.n >= run.target) {
              const j = (r() - 0.5) * 0.003;
              hatch.push([run.x + j, run.y + j, x + j, y - j]);
              run = null; s += step * (1 + Math.floor(r() * 3));
            }
          } else if (run) {
            if (run.n > 0.015) hatch.push([run.x, run.y, x - dx * step, y - dy * step]);
            run = null;
          }
        }
      }
    };
    layer(-Math.PI / 4, 0.011, 0.6, 0.06, 3);        // Leonardo's left-handed parallel hatching
    layer(Math.PI / 4, 0.014, 0.8, 0.05, 7);         // cross-hatch in the deeper shadow
    layer(-Math.PI / 3, 0.02, 0.88, 0.04, 11);
  }
  const segC = segC0.filter(() => R() < 0.5);
  const segI = segI0.filter(() => R() < 0.85);
  return { segA, segB, segC, segI, segP, hatch };
}
