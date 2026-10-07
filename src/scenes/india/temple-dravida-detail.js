// Dravidian temple vocabulary — shared components for the Kailasa (Ellora) and Brihadeeswarar (Thanjavur) models
// of the Architecture chapter (src/scenes/india/temples.js). Every component writes plain parts into a Parts list
// (temples-assets.js) through a Frame (a translation + a turn about y), so thousands of mouldings, pilasters and
// miniature shrines still merge into one mesh per material. Parts are authored facing +z (the outward face) with
// their base at y = 0; materials are addressed by ROLE ('stone', 'recess', 'shade', 'frieze', 'script', 'void',
// 'gold'), which each monument maps onto its own material keys.
//
// Vocabulary (from the ground up):
//   adhishthana  moulded plinth — upana (foot), jagati (plain base), kumuda (rounded torus), kantha (recessed neck
//                with little blocks, a carved yali / elephant frieze), pattika (band), vedi
//   bhitti       wall in projecting bays (karna at the corners, bhadra in the middle) with brahmakanta (square) and
//                vishnukanta (octagonal) pilasters — base, shaft, malasthana band, kalasha · tadi · kumbha · padma
//                capital, phalaka abacus, pushpapotika bracket — deep devakoshtha niches with a figure and a kudu
//                pediment, and kumbha-panjaras (pot-and-foliage pilasters) in the recesses between the bays
//   prastara     entablature — uttira (beam), valabhi (frieze), kapota (curved overhanging cornice) with kudu arches
//                (horseshoe dormers with a small face), vyalamala (frieze of yalis)
//   hara         parapet of miniature shrines — karnakuta (square, domed) at the corners, shala (oblong, barrel
//                vaulted) in the middle of each side, panjaras (apsidal) between, linked by a low cloister wall
//   tala         one storey of the stepped superstructure (wall, prastara, hara)
//   shikhara     the crowning dome (octagonal or square) with large nasikas on the four sides, a lotus and a kalasha
//   animals      elephant (free-standing or in relief), lion / yali, recumbent Nandi bull
import * as THREE from 'three';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';

const PI = Math.PI;

// ------------------------------------------------------------------------------------------- geometry helpers
export const lathe = (pts, seg = 12, phi0 = 0) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), seg, phi0);
// faceted normals (for low-segment lathes / prisms that should read as cut stone, not as smooth blobs)
export function flat(g) { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('normal'); n.computeVertexNormals(); return n; }

// plans: closed polygons [[x, z], ...]
export const rect = (hx, hz = hx) => [[hx, hz], [-hx, hz], [-hx, -hz], [hx, -hz]];
// octagon with faces on the cardinal and diagonal directions; r = apothem (distance to a face)
export function octa(r) { const R = r / Math.cos(PI / 8), out = []; for (let k = 0; k < 8; k++) { const a = PI / 8 + k * PI / 4; out.push([Math.cos(a) * R, Math.sin(a) * R]); } return out; }
function orient(plan) {
  let a = 0;
  for (let i = 0; i < plan.length; i++) { const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length]; a += x0 * z1 - x1 * z0; }
  return a > 0 ? plan : plan.slice().reverse();
}
// edges with outward normals (plan oriented so that the outward normal of edge a→b is (ez, −ex))
export function edgesOf(plan) {
  plan = orient(plan);
  return plan.map((a, i) => {
    const b = plan[(i + 1) % plan.length], ex = b[0] - a[0], ez = b[1] - a[1], len = Math.hypot(ex, ez) || 1;
    return { a, b, n: [ez / len, -ex / len], len };
  });
}
function mitres(plan) {
  const E = edgesOf(plan), L = plan.length;
  return E.map((e, i) => { const n1 = E[(i - 1 + L) % L].n, n2 = e.n, k = 1 + n1[0] * n2[0] + n1[1] * n2[1]; return [(n1[0] + n2[0]) / k, (n1[1] + n2[1]) / k]; });
}
export function offsetPlan(plan, d) { plan = orient(plan); const m = mitres(plan); return plan.map((p, i) => [p[0] + d * m[i][0], p[1] + d * m[i][1]]); }
// a rectangle hx × hz whose faces step out in bays: bays = [[u0, u1, p], ...] on the positive half of a face
// (mirrored), p = projection beyond the base plane. bx for the faces across x (front / back), bz for the sides.
export function stepped(hx, hz, bx = [], bz = bx) {
  const faces = [{ n: [0, 1], t: [-1, 0], D: hz, L: hx, b: bx }, { n: [-1, 0], t: [0, -1], D: hx, L: hz, b: bz },
    { n: [0, -1], t: [1, 0], D: hz, L: hx, b: bx }, { n: [1, 0], t: [0, 1], D: hx, L: hz, b: bz }];
  const pAt = (f, u) => { const a = Math.abs(u); for (const [u0, u1, p] of f.b) if (a > u0 && a < u1) return p; return 0; };
  const pts = [];
  faces.forEach((f, k) => {
    const br = new Set([-f.L, f.L]);
    for (const [u0, u1] of f.b) for (const u of [u0, u1, -u0, -u1]) if (Math.abs(u) < f.L - 1e-6) br.add(u);
    const us = [...br].sort((a, b) => a - b);
    const P = (u, p) => [f.n[0] * (f.D + p) + f.t[0] * u, f.n[1] * (f.D + p) + f.t[1] * u];
    if (k > 0) { const g = faces[k - 1]; pts.push([g.n[0] * (g.D + pAt(g, g.L - 1e-4)) + f.n[0] * (f.D + pAt(f, -f.L + 1e-4)), g.n[1] * (g.D + pAt(g, g.L - 1e-4)) + f.n[1] * (f.D + pAt(f, -f.L + 1e-4))]); }
    for (let i = 0; i < us.length - 1; i++) { const p = pAt(f, (us[i] + us[i + 1]) / 2); pts.push(P(us[i], p), P(us[i + 1], p)); }
  });
  { const g = faces[3], f = faces[0]; pts.push([g.n[0] * (g.D + pAt(g, g.L - 1e-4)) + f.n[0] * (f.D + pAt(f, -f.L + 1e-4)), g.n[1] * (g.D + pAt(g, g.L - 1e-4)) + f.n[1] * (f.D + pAt(f, -f.L + 1e-4))]); }
  // drop duplicates and collinear points
  let out = pts.filter((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-5; });
  out = out.filter((p, i) => { const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length]; return Math.abs((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) > 1e-6; });
  return out;
}

// Sweep a moulding profile [[d, y], ...] (d = outward offset from the plan, bottom → top) round a closed plan,
// mitred at every corner: crisp at the corners, smooth along the curves of the profile.
export function ring(plan, prof, smoothDeg = 42) {
  plan = orient(plan);
  const E = edgesOf(plan), m = mitres(plan), L = plan.length;
  const S = [];
  for (let j = 0; j < prof.length - 1; j++) { const dd = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(dd, dy); S.push(l < 1e-7 ? null : [dy / l, -dd / l]); }
  const cosT = Math.cos(smoothDeg * PI / 180), dot = (a, b) => a[0] * b[0] + a[1] * b[1], nrm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const nS = [], nE = [];
  for (let j = 0; j < S.length; j++) {
    if (!S[j]) continue;
    nS[j] = j > 0 && S[j - 1] && dot(S[j - 1], S[j]) > cosT ? nrm([S[j - 1][0] + S[j][0], S[j - 1][1] + S[j][1]]) : S[j];
    nE[j] = j + 1 < S.length && S[j + 1] && dot(S[j], S[j + 1]) > cosT ? nrm([S[j][0] + S[j + 1][0], S[j][1] + S[j + 1][1]]) : S[j];
  }
  const pos = [], nor = [];
  for (let i = 0; i < L; i++) {
    const i2 = (i + 1) % L, A = plan[i], B = plan[i2], mA = m[i], mB = m[i2], n = E[i].n;
    for (let j = 0; j < S.length; j++) {
      if (!S[j]) continue;
      const [d0, y0] = prof[j], [d1, y1] = prof[j + 1];
      const A0 = [A[0] + d0 * mA[0], y0, A[1] + d0 * mA[1]], A1 = [A[0] + d1 * mA[0], y1, A[1] + d1 * mA[1]];
      const B0 = [B[0] + d0 * mB[0], y0, B[1] + d0 * mB[1]], B1 = [B[0] + d1 * mB[0], y1, B[1] + d1 * mB[1]];
      const N0 = [nS[j][0] * n[0], nS[j][1], nS[j][0] * n[1]], N1 = [nE[j][0] * n[0], nE[j][1], nE[j][0] * n[1]];
      pos.push(...A0, ...A1, ...B1, ...A0, ...B1, ...B0);
      nor.push(...N0, ...N1, ...N1, ...N0, ...N1, ...N0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}
// flat cap over a plan at height y (offset d), facing up (or down)
export function cap(plan, y = 0, d = 0, down = false) {
  const p = offsetPlan(plan, d);
  const g = new THREE.ShapeGeometry(new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z))));
  g.rotateX(-PI / 2); if (down) g.scale(1, -1, 1);
  return g.translate(0, y, 0);
}

// ------------------------------------------------------------------------------------------- frame
// A transform over a Parts list: components place parts in their own frame; roles map onto material keys.
export class Frame {
  constructor(P, k, { x = 0, y = 0, z = 0, ry = 0, lite = false } = {}) {
    this.P = P; this.k = k; this.x = x; this.y = y; this.z = z; this.ry = ry; this.lite = lite;
    this.c = Math.cos(ry); this.s = Math.sin(ry);
  }
  pt(x, z) { return [this.x + x * this.c + z * this.s, this.z - x * this.s + z * this.c]; }
  sub(x = 0, y = 0, z = 0, ry = 0) { const [wx, wz] = this.pt(x, z); return new Frame(this.P, this.k, { x: wx, y: this.y + y, z: wz, ry: this.ry + ry, lite: this.lite }); }
  add(role, g, x = 0, y = 0, z = 0, ry = 0) { const [wx, wz] = this.pt(x, z); return this.P.add(this.k[role] ?? role, g, wx, this.y + y, wz, this.ry + ry); }
  box(role, x0, x1, y0, y1, z0, z1) {
    const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
    if (w < 1e-4 || h < 1e-4 || d < 1e-4) return null;
    return this.add(role, new THREE.BoxGeometry(w, h, d), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
}
// the frames of the four sides of a rectangle (hx × hz): +z of each is outward, u runs along the side; the +u end of
// each side is a different corner, so per-corner parts placed at u = +L are placed once
export const sides = (hx, hz) => [{ ry: 0, D: hz, L: hx }, { ry: PI / 2, D: hx, L: hz }, { ry: PI, D: hz, L: hx }, { ry: -PI / 2, D: hx, L: hz }];

// ------------------------------------------------------------------------------------------- relief textures
// Normal maps for the carved bands (world UVs, one tile = 4 m at the default 0.25 tiles / m):
//   frieze — eight rows of 0.5 m: yalis, elephants, hamsas (geese) and a lotus scroll, each between fillets
//   script — the incised inscription courses of the Thanjavur plinth (0.25 m lines of glyphs)
let TEX = null;
function heightToNormal(src, strength) {
  const N = src.width, s = src.getContext('2d').getImageData(0, 0, N, N).data;
  const out = mkCanvas(N, N), g = out.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  const H = (x, y) => s[((((y + N) % N) * N) + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(out, { srgb: false, repeat: true });
}
function blurred(c, px) { const o = mkCanvas(c.width, c.height), g = o.getContext('2d'); g.filter = `blur(${px}px)`; for (const dx of [-c.width, 0, c.width]) for (const dy of [-c.height, 0, c.height]) g.drawImage(c, dx, dy); return o; }
function reliefTextures() {
  if (TEX) return TEX;
  if (typeof document === 'undefined') return (TEX = {});
  const N = 512, c = mkCanvas(N, N), g = c.getContext('2d'), r = rng(23), rowH = N / 8;
  g.fillStyle = '#505050'; g.fillRect(0, 0, N, N);
  const ell = (x, y, rx, ry, a = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, PI * 2); g.fill(); };
  const stroke = (pts, w) => { g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length - 1; i += 2) g.quadraticCurveTo(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); g.stroke(); };
  for (let row = 0; row < 8; row++) {
    const y0 = row * rowH, cy = y0 + rowH / 2 + 2, motif = row % 4;
    g.fillStyle = '#c8c8c8'; g.fillRect(0, y0, N, 6); g.fillRect(0, y0 + rowH - 7, N, 6);
    g.fillStyle = '#262626'; g.fillRect(0, y0 + 6, N, 3); g.fillRect(0, y0 + rowH - 10, N, 3);
    const n = motif === 3 ? 8 : 6, dir = row % 2 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const cx = (k + 0.5) * N / n, sh = 200 + Math.floor(r() * 30);
      g.fillStyle = g.strokeStyle = `rgb(${sh},${sh},${sh})`;
      if (motif === 0) {            // yali: lion body, raised head with a curled snout, a rider's bump, curling tail
        ell(cx, cy + 4, 17, 10); ell(cx + dir * 15, cy - 9, 8, 9); ell(cx + dir * 22, cy - 15, 4, 5);
        for (const lx of [-11, -5, 6, 12]) g.fillRect(cx + lx - 2, cy + 8, 4, 12);
        stroke([[cx - dir * 16, cy + 2], [cx - dir * 28, cy - 8], [cx - dir * 20, cy - 16]], 3);
        ell(cx - dir * 2, cy - 7, 5, 6);
      } else if (motif === 1) {     // elephant: body, head, ear, trunk curling down, legs
        ell(cx, cy + 2, 20, 12); ell(cx + dir * 19, cy - 3, 9, 10); ell(cx + dir * 13, cy - 2, 5, 8);
        stroke([[cx + dir * 26, cy - 1], [cx + dir * 30, cy + 10], [cx + dir * 25, cy + 18]], 4);
        for (const lx of [-13, -6, 6, 13]) g.fillRect(cx + lx - 3, cy + 8, 6, 12);
      } else if (motif === 2) {     // hamsa (goose) with a lotus bud between
        ell(cx, cy + 6, 14, 8); stroke([[cx + dir * 10, cy + 2], [cx + dir * 18, cy - 8], [cx + dir * 13, cy - 14]], 3); ell(cx + dir * 13, cy - 15, 4, 3.5);
        stroke([[cx - dir * 12, cy + 4], [cx - dir * 20, cy - 2], [cx - dir * 22, cy - 6]], 4);
        ell(cx + N / n / 2, cy + 2, 4, 9);
      } else {                      // lotus scroll: an undulating creeper with leaves and rosettes
        stroke([[cx - N / n / 2, cy], [cx - N / n / 4, cy - 12], [cx, cy], [cx + N / n / 4, cy + 12], [cx + N / n / 2, cy]], 3);
        ell(cx - N / n / 4, cy + 4, 7, 7); ell(cx + N / n / 4, cy - 4, 5, 9, 0.6); ell(cx, cy - 9, 3, 6, -0.5);
      }
    }
  }
  const frieze = heightToNormal(blurred(c, 1.6), 3.2);
  // inscription: courses of incised glyphs
  const s = mkCanvas(N, N), q = s.getContext('2d'), lineH = N / 16;
  q.fillStyle = '#9a9a9a'; q.fillRect(0, 0, N, N);
  q.strokeStyle = '#303030'; q.lineCap = 'round';
  for (let l = 0; l < 16; l++) {
    const y = l * lineH + lineH * 0.5;
    for (let x = 4; x < N - 8; x += 7 + r() * 4) {
      q.lineWidth = 1.2 + r() * 0.8; q.beginPath();
      const k = Math.floor(r() * 4);
      if (k === 0) { q.arc(x + 3, y, 3, PI * r(), PI * (1 + r())); }
      else if (k === 1) { q.moveTo(x, y - 5); q.lineTo(x, y + 4); q.lineTo(x + 5, y + 4); }
      else if (k === 2) { q.moveTo(x, y + 4); q.quadraticCurveTo(x + 3, y - 7, x + 6, y + 4); }
      else { q.arc(x + 3, y + 1, 2.5, 0, PI * 2); q.moveTo(x + 3, y - 2); q.lineTo(x + 3, y - 6); }
      q.stroke();
      if (r() < 0.1) x += 8;
    }
  }
  const script = heightToNormal(blurred(s, 0.7), 2.2);
  return (TEX = { frieze, script });
}
// Register the carved / shaded variants of a monument's stone on M (M[prefix + 'Frieze'|'Script'|'Shade'|'Recess'|'Void']).
export function dravidaMaterials(M, prefix, base, { cut = false, shade = '#8c7660', recess = '#d6bea0', void: vcol = '#16100c' } = {}) {
  if (!M[base] || M[prefix + 'Frieze']) return;
  const T = reliefTextures();
  const mk = (m) => { if (cut) m.userData.kailasaCut = true; return m; };
  const from = (opts) => { const m = M[base].clone(); Object.assign(m, opts); return mk(m); };
  M[prefix + 'Frieze'] = from(T.frieze ? { normalMap: T.frieze, normalScale: new THREE.Vector2(1.4, 1.4) } : {});
  M[prefix + 'Script'] = from(T.script ? { normalMap: T.script, normalScale: new THREE.Vector2(1.0, 1.0) } : {});
  M[prefix + 'Shade'] = from({ color: new THREE.Color(shade), roughness: 0.95 });
  M[prefix + 'Recess'] = from({ color: new THREE.Color(recess) });
  M[prefix + 'Void'] = mk(new THREE.MeshStandardMaterial({ color: vcol, roughness: 1 }));
}

// ------------------------------------------------------------------------------------------- mouldings
// adhishthana (moulded plinth) of height h round a plan; returns nothing (the top is at h, flush with the plan)
export function adhishthana(F, plan, h, { script = false, blocks = true, top = true, frieze = true } = {}) {
  const u = h, R = 0.12 * u;
  const kum = []; for (let a = -90; a <= 90; a += F.lite ? 45 : 22.5) kum.push([0.02 * u + R * Math.cos(a * PI / 180), 0.49 * u + R * Math.sin(a * PI / 180)]);
  F.add('stone', ring(plan, [[0.15 * u, 0], [0.15 * u, 0.09 * u], [0.12 * u, 0.1 * u]]));                      // upana
  F.add(script ? 'script' : 'stone', ring(plan, [[0.12 * u, 0.1 * u], [0.12 * u, 0.3 * u]]));                     // jagati (inscribed)
  F.add('stone', ring(plan, [[0.12 * u, 0.3 * u], [0.09 * u, 0.33 * u], [0.04 * u, 0.35 * u], [0.02 * u, 0.37 * u], ...kum, [0.0, 0.62 * u]]));   // kumuda
  F.add(frieze ? 'frieze' : 'recess', ring(plan, [[0.0, 0.62 * u], [-0.03 * u, 0.63 * u], [-0.03 * u, 0.75 * u], [0.0, 0.76 * u]]));            // kantha
  F.add('stone', ring(plan, [[0.0, 0.76 * u], [0.08 * u, 0.78 * u], [0.09 * u, 0.8 * u], [0.09 * u, 0.9 * u], [0.05 * u, 0.92 * u], [0.02 * u, 0.94 * u], [0.02 * u, u], [0, u]]));  // pattika, vedi
  if (top) F.add('stone', cap(plan, u));
  // kampa blocks punctuating the kantha
  if (blocks && !F.lite) for (const e of edgesOf(plan)) {
    if (e.len < 1.2) continue;
    const n = Math.max(1, Math.round(e.len / 1.6)), ry = Math.atan2(e.n[0], e.n[1]);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = e.a[0] + (e.b[0] - e.a[0]) * t, z = e.a[1] + (e.b[1] - e.a[1]) * t;
      F.add('stone', new THREE.BoxGeometry(0.1 * u, 0.13 * u, 0.06 * u), x, 0.69 * u, z, ry);
    }
  }
}
// prastara (entablature) of height h round a plan: beam, frieze, kapota with kudus, vyalamala. Returns its top.
export function prastara(F, plan, h, { over = 0.32 * h, kudu = 2.2, kuduR = 0.2 * h, frieze = true, top = true, edgeMin = 1.6 } = {}) {
  const o = over;
  F.add('stone', ring(plan, [[0, 0], [0.04 * h, 0.01 * h], [0.04 * h, 0.17 * h], [0.0, 0.18 * h]]));               // uttira
  F.add(frieze ? 'frieze' : 'recess', ring(plan, [[0.0, 0.18 * h], [0.0, 0.36 * h]]));                                     // valabhi
  const kp = [[0.0, 0.36 * h], [o * 0.82, 0.37 * h], [o, 0.4 * h], [o * 1.02, 0.47 * h], [o * 0.96, 0.56 * h], [o * 0.82, 0.63 * h], [o * 0.6, 0.68 * h], [o * 0.34, 0.71 * h], [0.06 * h, 0.72 * h]];
  F.add('stone', ring(plan, F.lite ? [kp[0], kp[2], kp[4], kp[6], kp[8]] : kp));                                           // kapota
  F.add(frieze ? 'frieze' : 'stone', ring(plan, [[0.06 * h, 0.72 * h], [0.12 * h, 0.74 * h], [0.12 * h, 0.9 * h], [0.06 * h, 0.92 * h], [0.06 * h, h], [0, h]]));   // vyalamala
  if (top) F.add('stone', cap(plan, h));
  if (kudu && !(F.lite && kudu < 3)) for (const e of edgesOf(plan)) {
    if (e.len < edgeMin) continue;
    const n = Math.max(1, Math.floor(e.len / kudu)), ry = Math.atan2(e.n[0], e.n[1]);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = e.a[0] + (e.b[0] - e.a[0]) * t, z = e.a[1] + (e.b[1] - e.a[1]) * t;
      kudu1(F.sub(x, 0, z, ry), 0, 0.38 * h, o * 0.99, kuduR);
    }
  }
  return h;
}
const arcShape = (r, gap, seg) => { const pts = []; for (let i = 0; i <= seg; i++) { const a = -PI / 2 + gap / 2 + (2 * PI - gap) * i / seg; pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); } return new THREE.ShapeGeometry(new THREE.Shape(pts)); };
// kudu: horseshoe-arched dormer facing +z on the plane z, the feet of the arch at y; radius r
export function kudu1(F, x, y, z, r, { face = true, finial = true, back = true, tube = 0.18, mini = false } = {}) {
  const t = r * tube, gap = 0.56 * PI, lite = F.lite || mini, cy = y + Math.cos(gap / 2) * r + t;
  F.add('stone', new THREE.TorusGeometry(r, t, 3, lite ? 7 : 10, 2 * PI - gap).rotateZ(-PI / 2 + gap / 2), x, cy, z + t * 0.6);
  if (back) F.add('shade', arcShape(r * 0.98, gap, lite ? 5 : 8), x, cy, z + 0.01);
  if (face && !lite) F.add('stone', new THREE.SphereGeometry(r * 0.3, 5, 3).scale(1, 1.05, 0.55), x, cy + r * 0.28, z + r * 0.12);   // the kirtimukha face
  if (finial) F.add('stone', new THREE.ConeGeometry(r * 0.34, r * 0.6, 4).scale(1, 1, 0.5), x, cy + r + t + r * 0.24, z + t * 0.6);    // shovel head
}

// ------------------------------------------------------------------------------------------- pilasters, niches
// pilaster on the wall plane z (front at z + d), from y0 to y1, centred on x; oct = vishnukanta (octagonal shaft)
export function pilaster(F, x, y0, y1, z, { w = 0.44, d = 0.16, oct = false, bracket = true, simple = false } = {}) {
  if (simple || F.lite) {
    F.box('stone', x - w * 0.6, x + w * 0.6, y0, y0 + 0.12, z, z + d + 0.04);
    F.box('stone', x - w / 2, x + w / 2, y0 + 0.12, y1 - 0.1, z, z + d);
    F.box('stone', x - w * 0.75, x + w * 0.75, y1 - 0.1, y1, z, z + d + 0.06);
    return;
  }
  const H = y1 - y0, hb = Math.min(0.36, H * 0.07), hc = Math.min(1.15, H * 0.24), yb = y0 + hb, yc = y1 - hc;
  F.box('stone', x - w * 0.64, x + w * 0.64, y0, yb, z, z + d + 0.06);                                                // base
  if (oct && !F.lite) F.add('stone', flat(new THREE.CylinderGeometry(w / 2, w / 2, yc - yb, 8, 1, true).rotateY(PI / 8)), x, (yb + yc) / 2, z + d - w / 2);
  else F.box('stone', x - w / 2, x + w / 2, yb, yc, z, z + d);                                                      // brahmakanta shaft
  F.box('stone', x - w * 0.56, x + w * 0.56, yc - H * 0.05, yc - H * 0.035, z, z + d + 0.03);                          // malasthana band
  const hk = hc * 0.6, hp = hc * 0.12, hbr = hc * 0.28, R = w * 0.5;
  if (!F.lite) {
    // kalasha · tadi · kumbha · padma
    F.add('stone', lathe([[R * 0.8, 0], [R * 1.12, hk * 0.2], [R * 0.66, hk * 0.44], [R * 1.14, hk * 0.64], [R * 0.84, hk * 0.8], [R * 1.5, hk]], 8, PI / 8), x, yc, z + d - R);
  } else F.box('stone', x - R * 1.1, x + R * 1.1, yc, yc + hk, z, z + d + 0.04);
  F.box('stone', x - w * 0.8, x + w * 0.8, yc + hk, yc + hk + hp, z, z + d + 0.12);                                    // phalaka
  if (bracket) {                                                                                                       // pushpapotika
    F.box('stone', x - w * 0.95, x + w * 0.95, yc + hk + hp, yc + hk + hp + hbr * 0.45, z, z + d + 0.16);
    F.box('stone', x - w * 1.35, x + w * 1.35, yc + hk + hp + hbr * 0.45, y1, z, z + d + 0.22);
    if (!F.lite) for (const s of [-1, 1]) F.add('stone', new THREE.SphereGeometry(hbr * 0.32, 4, 2), x + s * w * 1.15, yc + hk + hp + hbr * 0.42, z + d + 0.12);
  }
}
// free-standing pillar (square blocks — sadurams — alternating with octagonal kattus; a kalasha-kumbha-padma
// capital, a phalaka and corbel brackets) at (x, z) from y0 to y1; brackets: 2 (along x) or 4 ways
export function pillar(F, x, z, y0, y1, w = 0.8, { brackets = 2, ry = 0 } = {}) {
  const H = y1 - y0, S = F.sub(x, y0, z, ry);
  if (F.lite) {
    S.box('stone', -w * 0.58, w * 0.58, 0, 0.1 * H, -w * 0.58, w * 0.58);
    S.box('stone', -w / 2, w / 2, 0.1 * H, 0.9 * H, -w / 2, w / 2);
    S.box('stone', -w * 1.1, w * 1.1, 0.9 * H, H, -w * 0.45, w * 0.45);
    return;
  }
  const oct = (y, h, r) => S.add('stone', flat(new THREE.CylinderGeometry(r, r, h, 8, 1, true).rotateY(PI / 8)), 0, y + h / 2, 0);
  S.box('stone', -w * 0.6, w * 0.6, 0, 0.09 * H, -w * 0.6, w * 0.6);
  S.box('stone', -w / 2, w / 2, 0.09 * H, 0.3 * H, -w / 2, w / 2);
  oct(0.3 * H, 0.15 * H, w * 0.4);
  S.box('stone', -w / 2, w / 2, 0.45 * H, 0.6 * H, -w / 2, w / 2);
  oct(0.6 * H, 0.12 * H, w * 0.38);
  S.box('stone', -w * 0.45, w * 0.45, 0.72 * H, 0.78 * H, -w * 0.45, w * 0.45);
  const hk = 0.11 * H, R = w * 0.42;
  S.add('stone', lathe([[R * 0.8, 0], [R * 1.1, hk * 0.2], [R * 0.7, hk * 0.42], [R * 1.15, hk * 0.62], [R * 0.85, hk * 0.8], [R * 1.5, hk]], 8, PI / 8), 0, 0.78 * H, 0);
  S.box('stone', -w * 0.7, w * 0.7, 0.89 * H, 0.92 * H, -w * 0.7, w * 0.7);
  S.box('stone', -w * 1.25, w * 1.25, 0.92 * H, H, -w * 0.38, w * 0.38);
  if (brackets > 2) S.box('stone', -w * 0.38, w * 0.38, 0.92 * H, H, -w * 1.25, w * 1.25);
}
// kumbha-panjara: a pot with foliage at the foot of a slender shaft crowned by a miniature apsidal shrine
export function kumbhaPanjara(F, x, y0, y1, z, w = 0.8) {
  const H = y1 - y0;
  F.box('stone', x - w * 0.45, x + w * 0.45, y0, y0 + 0.08 * H, z, z + w * 0.35);
  F.add('stone', lathe([[w * 0.18, 0], [w * 0.38, H * 0.05], [w * 0.4, H * 0.1], [w * 0.22, H * 0.16], [w * 0.28, H * 0.18], [0, H * 0.18]], F.lite ? 6 : 8), x, y0 + 0.08 * H, z + w * 0.1);
  F.box('stone', x - w * 0.13, x + w * 0.13, y0 + 0.25 * H, y0 + 0.74 * H, z, z + w * 0.22);
  if (!F.lite) for (let k = 0; k < 2; k++) for (const s of [-1, 1]) {                                                  // the foliage spilling from the pot
    F.add('stone', new THREE.SphereGeometry(w * 0.17, 4, 2).scale(1.4, 0.6, 0.5), x + s * w * (0.24 + 0.08 * k), y0 + H * (0.27 - 0.05 * k), z + w * 0.18, s * 0.5);
  }
  panjaraShrine(F.sub(x, y0 + 0.74 * H, z + w * 0.1), w * 0.9, w * 0.5, H * 0.26, { mini: true });
}
// a standing figure (a deity or guardian) on a lotus base, with four arms and a crown, before a prabha arch
export function figure(F, x, y, z, h, { arms = 4, sway = 1, prabha = true } = {}) {
  if (F.lite) {
    F.box('stone', x - h * 0.11, x + h * 0.11, y, y + h * 0.78, z - h * 0.05, z + h * 0.05);
    F.add('stone', new THREE.SphereGeometry(h * 0.08, 5, 3), x, y + h * 0.84, z); return;
  }
  F.add('stone', lathe([[h * 0.15, 0], [h * 0.19, h * 0.03], [h * 0.12, h * 0.06], [0, h * 0.06]], 6), x, y, z);   // padma pitha
  for (const s of [-1, 1]) F.add('stone', new THREE.CylinderGeometry(h * 0.042, h * 0.034, h * 0.38, 5).rotateZ(s * 0.05 - sway * 0.06), x + s * h * 0.05, y + h * 0.25, z);
  F.add('stone', lathe([[h * 0.1, 0], [h * 0.125, h * 0.05], [h * 0.105, h * 0.1], [h * 0.085, h * 0.14], [0, h * 0.14]], 6).scale(1, 1, 0.7), x + sway * h * 0.01, y + h * 0.42, z);
  F.add('stone', new THREE.CylinderGeometry(h * 0.1, h * 0.07, h * 0.21, 6).scale(1, 1, 0.62), x + sway * h * 0.02, y + h * 0.66, z);
  F.add('stone', new THREE.SphereGeometry(h * 0.058, 6, 4), x + sway * h * 0.03, y + h * 0.82, z + h * 0.01);
  F.add('stone', lathe([[h * 0.052, 0], [h * 0.05, h * 0.05], [h * 0.034, h * 0.11], [0, h * 0.15]], 6), x + sway * h * 0.03, y + h * 0.855, z);   // karanda makuta
  const sh = y + h * 0.74;
  for (const s of [-1, 1]) {
    F.add('stone', new THREE.CylinderGeometry(h * 0.025, h * 0.02, h * 0.3, 4).rotateZ(s * 0.25), x + s * h * 0.15, sh - h * 0.14, z + h * 0.02);     // lower arms
    if (arms > 2) F.add('stone', new THREE.CylinderGeometry(h * 0.022, h * 0.018, h * 0.22, 4).rotateZ(-s * 0.55), x + s * h * 0.17, sh + h * 0.06, z - h * 0.02);   // raised arms
  }
  if (prabha) F.add('stone', new THREE.TorusGeometry(h * 0.36, h * 0.022, 3, 10, PI).scale(1, 1.15, 1), x, y + h * 0.52, z - h * 0.06);
}

// ------------------------------------------------------------------------------------------- wall (bhitti)
// One face of a wall in the side frame S (+z outward; the base wall plane at z = 0; u along the face).
// bays: [{ u0, u1, p, niche: { w, h, sill } | null, oct }] (full extent, sorted); the bay that reaches u = +L is
// carried round the corner by `cornerExt` (the neighbouring face's projection), so each corner is built once.
export function wallFace(S, y0, y1, bays, { cornerExt = 0, L = Infinity, pilW = 0.44, recessKP = true, figures = true } = {}) {
  const lite = S.lite;
  bays.forEach((b, bi) => {
    const u0 = b.u0, u1 = b.u1 >= L - 1e-6 ? b.u1 + cornerExt : b.u1, p = b.p, n = b.niche;
    if (n) {
      const c = (b.u0 + b.u1) / 2, a = c - n.w / 2, e = c + n.w / 2, ys = y0 + n.sill, yt = ys + n.h;
      S.box('stone', u0, a, y0, y1, 0, p); S.box('stone', e, u1, y0, y1, 0, p);
      S.box('stone', a, e, y0, ys, 0, p); S.box('stone', a, e, yt, y1, 0, p);
      S.box(n.door ? 'void' : 'shade', a, e, ys, yt, 0, 0.03);                                                  // the niche back / doorway
      if (n.door) { S.box('stone', a - 0.35, a, ys, yt + 0.35, p, p + 0.12); S.box('stone', e, e + 0.35, ys, yt + 0.35, p, p + 0.12); S.box('stone', a - 0.35, e + 0.35, yt, yt + 0.35, p, p + 0.14); }
      else S.box('stone', a - 0.3, e + 0.3, ys - 0.2, ys, p, p + 0.18);                                                 // sill
      if (figures && !n.door) figure(S, c, ys, p * 0.42, n.h * 0.86, { sway: bi % 2 ? 1 : -1 });
      if (!lite && !n.door) for (const s of [-1, 1]) pilaster(S, c + s * (n.w / 2 + 0.17), ys - 0.02, yt + 0.12, p, { w: 0.26, d: 0.07, bracket: false });
      const room = y1 - yt;
      if (room > 0.55) kudu1(S, c, yt + 0.14, p, Math.min(n.w * 0.42, (room - 0.2) * 0.42), { face: true });          // the torana pediment
    } else S.box('stone', u0, u1, y0, y1, 0, p);
    // pilasters at the edges of the bay (alternately square and octagonal)
    const pu = [u0 + pilW * 0.7, u1 - pilW * 0.7];
    if (!n && u1 - u0 > 3.2) pu.push((u0 + u1) / 2);
    for (const x of pu) pilaster(S, x, y0, y1, p, { w: pilW, oct: b.oct ?? (bi % 2 === 1) });
    // kumbha-panjara in the recess before the next bay
    const nb = bays[bi + 1];
    if (recessKP && nb && nb.u0 - b.u1 > 0.5) kumbhaPanjara(S, (b.u1 + nb.u0) / 2, y0, y1 - 0.1, 0, Math.min(0.95, (nb.u0 - b.u1) * 0.8));
  });
}
// mirror a half list of bays ([u0, u1, p, extra] for u ≥ 0) into a full, sorted list
export function mirrorBays(half) {
  const out = [];
  for (const [u0, u1, p, extra = {}] of half) {
    if (u0 <= 1e-6) out.push({ u0: -u1, u1, p, ...extra });
    else { out.push({ u0, u1, p, ...extra }); out.push({ u0: -u1, u1: -u0, p, ...extra }); }
  }
  return out.sort((a, b) => a.u0 - b.u0);
}

// ------------------------------------------------------------------------------------------- miniature shrines
// common lower body: base, the corner pillars of the front with a recessed core, a flared cornice. Returns its top.
function shrineBody(F, w, d, hb) {
  const hbase = hb * 0.2, hp = hb * 0.58, hc = hb * 0.22;
  F.box('stone', -w / 2, w / 2, 0, hbase, -d / 2, d / 2);
  if (F.lite) F.box('stone', -w * 0.44, w * 0.44, hbase, hbase + hp, -d * 0.44, d * 0.44);
  else {
    F.box('recess', -w * 0.4, w * 0.4, hbase, hbase + hp, -d * 0.4, d * 0.4);
    for (const s of [-1, 1]) F.box('stone', s * w * 0.44 - w * 0.07, s * w * 0.44 + w * 0.07, hbase, hbase + hp, d * 0.44 - w * 0.12, d * 0.44 + w * 0.02);
  }
  F.add('stone', ring(rect(w * 0.44, d * 0.44), F.lite ? [[0, 0], [w * 0.1, hc * 0.5], [0, hc]] : [[0, 0], [w * 0.05, hc * 0.2], [w * 0.11, hc * 0.5], [w * 0.1, hc * 0.8], [0, hc]]), 0, hbase + hp, 0);
  return hb;
}
const finial = (F, x, y, z, s) => F.add('stone', flat(lathe([[s * 0.55, 0], [s * 0.3, s * 0.55], [s * 0.4, s * 0.72], [0, s * 1.3]], F.lite ? 4 : 5)), x, y, z);
// karnakuta: square, with a square dome; `faces` = the turns of the faces that carry a kudu
export function kutaShrine(F, w, { faces = [0], hb = w * 0.78 } = {}) {
  const y = shrineBody(F, w, w, hb), a = w * 0.46;
  F.add('stone', ring(rect(a, a), F.lite ? [[0, 0], [-0.1 * w, 0.3 * w], [-a, 0.5 * w]] : [[0, 0], [0.02 * w, 0.07 * w], [-0.02 * w, 0.2 * w], [-0.12 * w, 0.33 * w], [-0.27 * w, 0.43 * w], [-a, 0.5 * w]]), 0, y, 0);
  finial(F, 0, y + 0.48 * w, 0, w * 0.22);
  if (!F.lite) for (const ry of faces) kudu1(F.sub(0, 0, 0, ry), 0, y - 0.02 * w, a + 0.02 * w, w * 0.2, { face: false, finial: false, mini: true });
}
// shala: oblong (w along the side, d deep), barrel vaulted, a kudu on the long face, finials on the ridge
export function shalaShrine(F, w, d, { hb = d * 0.95, kudu = true } = {}) {
  const y = shrineBody(F, w, d, hb), rr = d * 0.44, len = w * 0.9;
  F.add('stone', new THREE.CylinderGeometry(rr, rr, len, F.lite ? 5 : 8, 1, false, 0, PI).rotateZ(PI / 2).scale(1, 1.2, 1), 0, y, 0);
  if (!F.lite) {
    for (const s of [-1, 1]) F.add('stone', new THREE.TorusGeometry(rr * 0.98, rr * 0.09, 3, 6, PI).rotateY(PI / 2).scale(1, 1.2, 1), s * len / 2, y, 0);   // gable arches
    if (kudu) kudu1(F, 0, y - 0.02 * d, rr * 0.92, Math.min(rr * 0.62, w * 0.2), { face: w > 2.5, finial: false, mini: w <= 2.5 });
  }
  const nf = F.lite ? 1 : w > 2.2 * d ? 3 : 2;
  for (let i = 0; i < nf; i++) finial(F, nf === 1 ? 0 : -len * 0.4 + (len * 0.8) * i / (nf - 1), y + rr * 1.18, 0, d * 0.16);
}
// panjara: apsidal (elephant-backed) roof running outward, a kudu gable on the front
export function panjaraShrine(F, w, d, hb = w * 0.8, { mini = false } = {}) {
  const y = shrineBody(F, w, d, hb), rr = w * 0.42, z0 = -d * 0.12, len = d * 0.56;
  F.add('stone', new THREE.CylinderGeometry(rr, rr, len, F.lite ? 4 : 7, 1, true, -PI / 2, PI).rotateX(-PI / 2), 0, y, z0 + len / 2);
  F.add('stone', new THREE.SphereGeometry(rr, F.lite ? 4 : 7, F.lite ? 2 : 3, PI, PI, 0, PI / 2).scale(1, 1, 0.8), 0, y, z0);
  if (!F.lite && !mini) kudu1(F, 0, y - 0.04 * w, z0 + len, rr * 0.8, { face: false, finial: false, mini: true });
  finial(F, 0, y + rr * 0.92, z0 + len * 0.3, w * 0.18);
}
// hara: a parapet of miniature shrines along the edge of a rectangular roof (hx × hz = the outer faces of the
// shrines); bh = { L, p } puts a wide shala on a projecting central band of each face
export function hara(F, hx, hz, { w = 1.6, bh = null, gap = 0.45, wall = true, shalaFrac = 0.34, faces = [0, 1, 2, 3] } = {}) {
  sides(hx, hz).forEach(({ ry, D, L }, k) => {
    if (!faces.includes(k)) return;
    const S = F.sub(0, 0, 0, ry);
    const base = w * 0.12;
    S.box('stone', -L, L, 0, base, D - w, D);                                                                       // the hara's base course
    if (wall) S.box('recess', -L + w * 0.5, L - w * 0.5, base, base + w * 0.62, D - w * 0.95, D - w * 0.45);          // harantara (cloister wall)
    kutaShrine(S.sub(L - w / 2, base, D - w / 2), w, { faces: [0, PI / 2] });
    const sw = bh ? 2 * bh.L * 0.92 : Math.max(w * 1.3, Math.min(2 * L * shalaFrac, 2 * L - 2 * w - 1.4 * w - 4 * gap));
    const sD = bh ? D + bh.p : D, sd = w * 0.88;
    if (sw > w * 0.9) shalaShrine(S.sub(0, base, sD - sd / 2), sw, sd, { hb: w * 0.86 });
    if (bh && bh.p > 0.05) S.box('stone', -bh.L, bh.L, 0, base, D, sD);
    const pw = w * 0.74, span = L - w - gap - sw / 2 - gap;
    const n = Math.floor((span + gap) / (pw + gap));
    for (let i = 0; i < n; i++) {
      const u = sw / 2 + gap + (i + 0.5) * span / n;
      for (const s of [-1, 1]) {
        if (n >= 3 && i % 2 === 1) shalaShrine(S.sub(s * u, base, D - w * 0.42), Math.min(span / n - gap, pw * 1.5), w * 0.76, { hb: w * 0.74, kudu: !S.lite });
        else panjaraShrine(S.sub(s * u, base, D - w * 0.45), pw, w * 0.86, w * 0.74);
      }
    }
  });
}

// ------------------------------------------------------------------------------------------- crowning parts
// shikhara: the crowning dome on its plan (octagonal or square) at the frame's origin, apothem r, height h, with
// large nasikas on the four sides; the stupi / kalasha on top in `crown` (gold at Thanjavur, rock at Ellora).
export function shikhara(F, { shape = 'oct', r = 5, h = 5.4, nasika = 0.3, crown = 'gold', crownH = 3.2 } = {}) {
  const plan = shape === 'oct' ? octa(r) : rect(r, r), k = r / 5, q = h / 5.4;
  const prof = [[-0.55, 0], [0.35, 0.28], [0.48, 0.52], [0.32, 0.8], [0.1, 1.0], [0.06, 1.5], [-0.2, 2.4], [-0.75, 3.4], [-1.6, 4.2], [-2.7, 4.85], [-3.9, 5.25], [-5, 5.4]]
    .map(([d, y]) => [d * k, y * q]);
  F.add('stone', ring(plan, F.lite ? prof.filter((_, i) => i % 2 === 0 || i === prof.length - 1) : prof));
  // nasikas: big kudus with a lion face (simhamukha) breaking through the dome on the four sides
  for (let i = 0; i < 4; i++) {
    const S = F.sub(0, 0, 0, i * PI / 2), R = r * nasika;
    kudu1(S, 0, 0.55 * q, r + 0.42 * k, R, { tube: 0.16 });
    S.box('stone', -R * 1.05, R * 1.05, 0.15 * q, 0.6 * q, r - 0.3 * k, r + 0.55 * k);
  }
  // lotus collar and the finial
  const top = h - 0.05;
  F.add('stone', lathe([[0.9 * k, 0], [1.25 * k, 0.18 * k], [1.0 * k, 0.4 * k], [0.55 * k, 0.48 * k]], F.lite ? 6 : 12), 0, top, 0);
  const c = crownH;
  F.add(crown, lathe([[0.5 * c / 3.2, 0], [0.75 * c / 3.2, 0.18 * c], [0.45 * c / 3.2, 0.36 * c], [0.58 * c / 3.2, 0.44 * c], [0.3 * c / 3.2, 0.68 * c], [0.15 * c / 3.2, 0.88 * c], [0, c]], F.lite ? 8 : 14), 0, top + 0.45 * k, 0);
  return top + 0.45 * k + c;
}

// ------------------------------------------------------------------------------------------- animals
const sph = (r, ws, hs) => new THREE.SphereGeometry(r, ws, hs);
// elephant facing +z (s = 1: c. 3 m to the back); relief = only the forepart, emerging from a wall at z = 0
export function elephant(F, role, s = 1, { relief = false, trunkDown = true } = {}) {
  const L = F.lite, q = (n) => Math.max(4, Math.round(n * (L ? 0.55 : 1)));
  const add = (g, x, y, z) => F.add(role, g.scale(s, s, s), x * s, y * s, z * s);
  if (relief) {
    add(sph(1, q(12), q(8)).scale(1.05, 1.0, 0.75), 0, 2.15, -0.15);                                         // shoulders
    for (const lx of [-0.5, 0.5]) add(new THREE.CylinderGeometry(0.32, 0.36, 1.55, q(8)), lx, 0.78, 0.35);
  } else {
    add(sph(1, q(14), q(10)).scale(1.0, 1.02, 1.5), 0, 2.15, 0);
    for (const [lx, lz] of [[-0.52, 0.85], [0.52, 0.85], [-0.52, -0.85], [0.52, -0.85]]) {
      add(new THREE.CylinderGeometry(0.33, 0.37, 1.6, q(8)), lx, 0.8, lz);
      if (!L) add(new THREE.CylinderGeometry(0.4, 0.4, 0.12, q(8)), lx, 0.06, lz);
    }
    add(new THREE.CylinderGeometry(0.04, 0.06, 1.1, 4).rotateX(0.25), 0, 1.75, -1.5);                          // tail
  }
  add(sph(0.76, q(12), q(9)).scale(1, 1.08, 0.95), 0, 2.72, relief ? 0.95 : 1.55);                             // head
  if (!L) for (const sx of [-1, 1]) add(sph(0.34, 7, 5), sx * 0.28, 3.25, relief ? 1.05 : 1.65);              // the twin domes of the brow
  for (const sx of [-1, 1]) add(sph(0.78, q(9), q(7)).scale(0.14, 1.0, 0.82).rotateY(sx * 0.35), sx * 0.78, 2.66, relief ? 0.75 : 1.32);   // ears
  const z0 = relief ? 1.6 : 2.2;
  const pts = trunkDown ? [[0, 2.45, z0], [0, 1.75, z0 + 0.32], [0, 0.95, z0 + 0.28], [0, 0.42, z0 + 0.5]] : [[0, 2.45, z0], [0, 1.9, z0 + 0.45], [0, 1.6, z0 + 0.95], [0, 2.0, z0 + 1.2]];
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z))), L ? 6 : 10, 0.21, q(7)), 0, 0, 0);
  for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.09, 0.85, 5).rotateX(PI / 2 + 0.7), sx * 0.3, 2.05, z0 + 0.12);   // tusks
  if (!relief) add(new THREE.BoxGeometry(2.3, 0.5, 3.5), 0, 0.25, 0);                                                 // pedestal of uncut rock
}
// lion / yali seated on its haunches, facing +z (s = 1: c. 1.7 m high)
export function lion(F, role, s = 1, { relief = false } = {}) {
  const L = F.lite, add = (g, x, y, z) => F.add(role, g.scale(s, s, s), x * s, y * s, z * s);
  if (!relief) add(sph(0.5, L ? 6 : 9, L ? 4 : 6).scale(1, 0.85, 1.2), 0, 0.45, -0.25);                    // haunches
  add(sph(0.42, L ? 6 : 9, L ? 4 : 7).scale(1, 1.35, 0.9), 0, 0.95, relief ? 0.05 : 0.15);                   // chest
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.1, 0.12, 0.85, L ? 4 : 6), sx * 0.2, 0.42, relief ? 0.35 : 0.45);   // forelegs
  add(sph(0.42, L ? 7 : 10, L ? 5 : 7).scale(1.1, 1, 0.75), 0, 1.5, relief ? 0.3 : 0.38);                     // mane
  add(sph(0.26, L ? 6 : 8, L ? 4 : 6).scale(1, 0.95, 1.1), 0, 1.5, relief ? 0.55 : 0.62);                     // face
  if (!L) {
    add(new THREE.BoxGeometry(0.22, 0.12, 0.18), 0, 1.36, relief ? 0.72 : 0.8);                                // muzzle (open jaw)
    for (const sx of [-1, 1]) add(sph(0.07, 5, 3), sx * 0.16, 1.76, relief ? 0.45 : 0.52);                     // ears
    if (!relief) add(new THREE.TorusGeometry(0.28, 0.05, 3, 8, PI * 1.3).rotateY(PI / 2), 0.0, 0.85, -0.7);  // curled tail
  }
}
// recumbent Nandi bull facing +z (s = 1: c. 2 m long)
export function nandi(F, role, s = 1, { plinth = true } = {}) {
  const L = F.lite, add = (g, x, y, z, ry = 0) => F.add(role, g.scale(s, s, s), x * s, y * s, z * s, ry);
  if (plinth) add(new THREE.BoxGeometry(1.25, 0.18, 2.3), 0, 0.09, 0.05);
  add(sph(0.5, L ? 7 : 12, L ? 5 : 8).scale(1.05, 0.95, 1.85), 0, 0.62, -0.05);                              // body
  add(sph(0.36, L ? 6 : 9, L ? 4 : 6).scale(1, 0.85, 1.1), 0, 1.02, 0.42);                                    // hump
  add(sph(0.3, L ? 6 : 8, L ? 4 : 6).scale(1.25, 1.1, 1.1), 0, 0.75, 0.62);                                   // chest, dewlap
  add(sph(0.25, L ? 6 : 9, L ? 4 : 6).scale(0.9, 1, 1.45), 0, 1.06, 0.98);                                    // head
  add(sph(0.16, L ? 5 : 7, L ? 3 : 5).scale(1.1, 0.9, 1), 0, 0.92, 1.27);                                     // muzzle
  for (const sx of [-1, 1]) {
    add(new THREE.ConeGeometry(0.06, 0.32, L ? 4 : 5).rotateZ(-sx * 0.55), sx * 0.2, 1.36, 0.92);              // horns
    if (!L) add(sph(0.12, 5, 3).scale(1.4, 0.4, 0.8), sx * 0.27, 1.2, 0.88);                                   // ears
    add(new THREE.BoxGeometry(0.2, 0.2, 0.6), sx * 0.3, 0.28, 0.75);                                           // folded forelegs
    add(sph(0.3, L ? 5 : 7, L ? 3 : 5).scale(0.6, 0.8, 1.1), sx * 0.42, 0.45, -0.6);                          // haunches
  }
  if (!L) add(new THREE.TorusGeometry(0.33, 0.05, 3, 10).rotateX(PI / 2 - 0.5).scale(0.95, 1, 1), 0, 0.92, 0.72);   // bell garland
}
