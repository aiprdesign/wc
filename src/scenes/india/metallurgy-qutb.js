// Metallurgy chapter, set C — the courtyard of the Quwwat-ul-Islam mosque (Qutb complex, Delhi) round the
// Iron Pillar, in late-afternoon sun: the great arched stone screen (stepped deep reveals, bands of carved
// calligraphy and floral scroll, a ruined crest), cloisters of re-used carved temple pillars (chain-and-bell,
// banded square / octagonal / round shafts, pot capitals, brackets) stacked two high, the fluted Qutb Minar
// behind, flagstone paving, the pillar on its platform behind a railing, and a warm hazy sky.
// All stone is procedural in world space (metallurgy-stone.js), so nothing tiles.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, smoothstep, sat, TAU } from '../../lib/math.js';
import { noise3 } from '../../lib/noise.js';
import * as NK from './nature-kit.js';
import { masonry, carvingTexture, ribbon, inscriptionTexture, PLANE_CYL } from './metallurgy-stone.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const lathe2 = (pts) => pts.map(([r, y]) => V2(Math.max(r, 1e-4), y));

// strip to non-indexed position + normal (+ uv when asked) so anything can merge with anything
function clean(g, keepUV = false, flat = false) {
  let n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) n.deleteAttribute(k);
  if (flat || !n.attributes.normal) n.computeVertexNormals();
  return n;
}
const merge = (list, keepUV = false) => mergeGeometries(list.map((g) => clean(g, keepUV)));

// chamfered box centred at (x, y, z)
function cbox(w, h, d, b, x = 0, y = 0, z = 0) {
  b = Math.min(b, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  const s = new THREE.Shape([V2(-w / 2 + b, -d / 2 + b), V2(w / 2 - b, -d / 2 + b), V2(w / 2 - b, d / 2 - b), V2(-w / 2 + b, d / 2 - b)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(x, y - h / 2 + b, z);
  return clean(g, false, true);
}

// lathe whose radius is reshaped per vertex: fn(y, angle, r) → new r
function latheFn(pts, seg, fn, phi0 = 0) {
  const g = new THREE.LatheGeometry(lathe2(pts), seg, phi0);
  const p = g.attributes.position, np = pts.length;
  for (let i = 0; i < p.count; i++) {
    const a = phi0 + Math.floor(i / np) / seg * TAU, x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z), y = p.getY(i);
    const nr = fn(y, a, r);
    if (r > 1e-5) { p.setX(i, x * nr / r); p.setZ(i, z * nr / r); }
  }
  g.computeVertexNormals();
  return g;
}

// pointed (two-centred) arch outline from the left foot over the apex to the right foot; d = a true offset
// outwards (same centres, radius R + d), so concentric orders stay parallel all the way round
function archPts(cx, w, hs, y0 = 0.35, n = 14, d = 0) {
  const R = w * 0.85, cL = cx - w / 2 + R, cR = cx + w / 2 - R, Rd = R + d, th = Math.acos((cx - cL) / Rd), pts = [V2(cx - w / 2 - d, y0)];
  for (let i = 0; i <= n; i++) { const a = Math.PI - (Math.PI - th) * i / n; pts.push(V2(cL + Math.cos(a) * Rd, hs + Math.sin(a) * Rd)); }
  for (let i = 1; i <= n; i++) { const b = (Math.PI - th) * (1 - i / n); pts.push(V2(cR + Math.cos(b) * Rd, hs + Math.sin(b) * Rd)); }
  pts.push(V2(cx + w / 2 + d, y0));
  return pts;
}
const archApex = (w, hs, d = 0) => { const R = w * 0.85; return hs + Math.sqrt((R + d) ** 2 - (R - w / 2) ** 2); };

// --------------------------------------------------------------------------------------------------------
// materials

const RED = [0.5, 0.25, 0.15], BUFF = [0.66, 0.52, 0.38], GREYQ = [0.5, 0.45, 0.4];

function stoneMat(opts = {}, tag = 'qs') {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0 });
  m.userData.detail = { albedo: 0.06, rough: 0.15, bump: 0.0002, scratch: 0, grime: 0.15 };
  return masonry(m, { colA: RED, colB: BUFF, colM: [0.3, 0.22, 0.16], tag, ...opts });
}

// carved band: canvas relief as map + bump, over the same world-space stone colour (no blocks)
function carvedMat(tex, opts = {}, tag = 'qc') {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, map: tex, bumpMap: tex, bumpScale: 2.2 });
  m.userData.detail = { albedo: 0.04, rough: 0.1, bump: 0.0001, scratch: 0, grime: 0.1 };
  return masonry(m, { colA: RED, colB: BUFF, mode: 0, relief: 0.6, tag, ...opts });
}

// --------------------------------------------------------------------------------------------------------

export function buildQutb(group, { lite = false } = {}) {
  const tris = { };
  const carve = carvingTexture(lite ? 2048 : 4096, 3);
  const wallM = stoneMat({ course: 0.62, block: 1.25, split: 0.5, bevel: 0.035, joint: 0.008, relief: 1.1, tone: 0.16, macro: 0.09, streak: 1.2, grime: 0.9 }, 'qwall');
  const trimM = stoneMat({ course: 0.36, block: 0.7, split: 0.3, bevel: 0.02, relief: 0.9, macro: 0.2, colA: [0.52, 0.3, 0.18], colB: [0.7, 0.52, 0.36] }, 'qtrim');
  const bandM = carvedMat(carve, {}, 'qband');
  const add = (g, m, { cast = true, recv = true } = {}) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = recv; group.add(o); return o; };

  // ====================================================================================== the great screen
  const Z0 = -13.1;                   // front face
  const G = 0.275;                    // the front skin's openings are this much wider all round (stepped reveal)
  const ARCH = [[0, 6.8, 7.6, 1], [-8.7, 3.8, 5.0, 0.5], [8.7, 3.8, 5.0, 0.5], [-13.9, 3.0, 3.8, 0.4], [13.9, 3.0, 3.8, 0.4]];
  const ORD = 1.24;                   // depth of the carved orders (× k)
  const ringTop = ([, w, hs, k]) => archApex(w, hs, G + ORD * k);
  const alfizX = 3.4 + G + ORD + 0.15 + 0.31, alfizTop = ringTop(ARCH[0]) + 0.15 + 0.31;   // frame round the great arch (centreline)
  const strY = ringTop(ARCH[1]) + 0.5;                                                     // string course over the side bays
  const bandTile = (bw, v0, v1) => 8 * bw / Math.max(0.05, v1 - v0);
  {
    // the ruined crest: a rectilinear stair of missing blocks over three heights
    const r = rng(81), crest = [];
    const zoneH = (x) => (Math.abs(x) < 6.2 ? alfizTop + 1.9 : Math.abs(x) < 11.5 ? strY + 2.0 : ringTop(ARCH[3]) + 1.6);
    const zoneMin = (x) => (Math.abs(x) < 6.2 ? alfizTop + 0.85 : Math.abs(x) < 11.5 ? strY + 0.75 : ringTop(ARCH[3]) + 0.6);
    for (let x = 17; x > -17;) {
      const wseg = Math.min(0.5 + r() * 1.3, x + 17), xb = x - wseg, xm = x - wseg / 2;
      let h = zoneH(xm) - (r() < 0.3 ? 0.6 + r() * 1.8 : r() * 0.45);
      h = Math.round(Math.max(h, zoneMin(xm)) / 0.5) * 0.5;      // quantised to courses: the ruin reads as missing blocks
      crest.push(V2(x, h), V2(xb, h));
      x = xb;
    }
    const layer = (depth, z, d) => {
      const sh = new THREE.Shape([V2(-17, 0), V2(17, 0), ...crest]);
      for (const [cx, w, hs] of ARCH) sh.holes.push(new THREE.Path(archPts(cx, w, hs, 0.35, 16, d).reverse()));
      const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, curveSegments: 4 });
      g.translate(0, 0, z);
      return clean(g);
    };
    add(merge([layer(0.55, Z0 - 0.55, G), layer(1.9, Z0 - 2.45, 0)]), wallM);
    // loose blocks still sitting on the broken steps of the crest
    const blocks = [];
    for (let i = 0; i < crest.length; i += 2) {
      if (r() > 0.45) continue;
      const x0 = crest[i].x, x1 = crest[i + 1].x, h = crest[i].y, bw = 0.4 + r() * 0.4;
      blocks.push(cbox(bw, 0.45, 0.6 + r() * 0.6, 0.04, lerp(x0, x1, 0.3 + 0.4 * r()), h + 0.225, Z0 - 0.4 - r() * 1.5));
    }
    add(merge(blocks), wallM);
  }
  // carved orders round each arch: a roll moulding, a floral scroll, a fillet, a band of calligraphy
  {
    const carvedParts = [], plainParts = [], rolls = [];
    const r = rng(83);
    for (const [cx, w, hs, k] of ARCH) {
      const ring = (off, bw, proud, v0, v1) => ribbon(archPts(cx, w, hs, 0.35, lite ? 18 : 40, G + off + bw / 2), bw, Z0, proud, { v0, v1, u0: r() * 10, tile: bandTile(bw, v0, v1) });
      carvedParts.push(ring(0.1 * k, 0.42 * k, 0.07, 0.02, 0.48));
      plainParts.push(ring(0.54 * k, 0.08 * k, 0.12, 0.97, 0.975));
      carvedParts.push(ring(0.64 * k, 0.6 * k, 0.1, 0.52, 0.98));
      const rp = archPts(cx, w, hs, 0.35, 30, G + 0.04 * k).map((p) => new THREE.Vector3(p.x, p.y, Z0 + 0.02));
      rolls.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp, false, 'centripetal'), lite ? 40 : 120, 0.065 * k, lite ? 4 : 6, false));
    }
    // the great arch's rectangular frame (alfiz) of calligraphy, edged by fillets
    const af = [V2(-alfizX, 0.35), V2(-alfizX, alfizTop), V2(alfizX, alfizTop), V2(alfizX, 0.35)];
    carvedParts.push(ribbon(af, 0.62, Z0, 0.16, { v0: 0.52, v1: 0.98, u0: 3.1, tile: bandTile(0.62, 0.52, 0.98) }));
    for (const s of [-1, 1]) { const o = s * 0.36; plainParts.push(ribbon([V2(-alfizX - o, 0.35), V2(-alfizX - o, alfizTop + o), V2(alfizX + o, alfizTop + o), V2(alfizX + o, 0.35)], 0.08, Z0, 0.2, { v0: 0.97, v1: 0.975 })); }
    // a floral string course across the side bays, below the crest
    for (const s of [-1, 1]) carvedParts.push(ribbon([V2(s * (alfizX + 0.42), strY), V2(s * 11.4, strY)].sort((a, b) => a.x - b.x), 0.42, Z0, 0.08, { v0: 0.02, v1: 0.48, u0: s * 2.3, tile: bandTile(0.42, 0.02, 0.48) }));
    add(merge(carvedParts, true), bandM);
    add(merge([...plainParts, ...rolls]), trimM);
    // carved lotus roundels in the great arch's spandrels, and over each side arch
    const disc = [];
    const roundel = (x, y, rr) => {
      const g = latheFn([[0, 0.1], [rr * 0.22, 0.095], [rr * 0.3, 0.07], [rr * 0.8, 0.055], [rr * 0.95, 0.03], [rr, 0.0]], lite ? 24 : 48,
        (yy, a, r0) => r0 * (1 + (r0 > rr * 0.35 ? 0.1 * Math.pow(Math.abs(Math.cos(4 * a)), 0.5) : 0.04 * Math.abs(Math.cos(8 * a)))));
      g.rotateX(Math.PI / 2); g.translate(x, y, Z0);
      disc.push(g);
    };
    for (const s of [-1, 1]) roundel(s * (alfizX - 0.31 - 0.5 - 0.2), alfizTop - 0.31 - 0.5 - 0.2, 0.5);
    for (const a of ARCH.slice(1, 3)) roundel(a[0], (ringTop(a) + strY - 0.21) / 2, Math.min(0.3, (strY - 0.21 - ringTop(a)) / 2 - 0.04));
    add(merge(disc), trimM);
    // plinth mouldings along the foot of the piers (between the openings)
    const plinth = [], edges = ARCH.map(([cx, w]) => [cx - w / 2 - G - 0.1, cx + w / 2 + G + 0.1]).sort((a, b) => a[0] - b[0]);
    let x0 = -17;
    for (const [a, b] of [...edges, [17, 17]]) {
      if (a - x0 > 0.3) plinth.push(cbox(a - x0, 0.45, 0.32, 0.05, (a + x0) / 2, 0.225, Z0 + 0.16), cbox(a - x0, 0.14, 0.42, 0.04, (a + x0) / 2, 0.52, Z0 + 0.2));
      x0 = b;
    }
    add(merge(plinth), trimM);
  }
  // ====================================================================================== cloister pillars
  // one re-used temple pillar (≈1.95 m), stacked two high; square base, chain-and-bell panels, octagonal and
  // sixteen-sided banded shaft, a pot capital, a square abacus and a cruciform bracket
  const pillarUnit = (detail) => {
    const parts = [], S2 = Math.SQRT2, seg16 = detail ? 16 : 12;
    const sq = (pts) => clean(new THREE.LatheGeometry(lathe2(pts.map(([s, y]) => [s * S2, y])), 4, Math.PI / 4), false, true);
    parts.push(sq([[0, 0], [0.25, 0], [0.25, 0.1], [0.235, 0.12], [0.235, 0.17], [0.215, 0.19], [0.215, 0.22], [0.195, 0.24], [0, 0.24]]));
    parts.push(cbox(0.38, 0.56, 0.38, 0.012, 0, 0.51, 0));
    if (detail) {
      // chain-and-bell, in relief on each face of the square block
      for (let f = 0; f < 4; f++) {
        const ch = [];
        for (let i = 0; i < 5; i++) {
          const g = i % 2 ? new THREE.BoxGeometry(0.01, 0.042, 0.022) : new THREE.BoxGeometry(0.026, 0.042, 0.01);
          ch.push(clean(g.translate(0, 0.74 - i * 0.036, 0.195 + 0.008)));
        }
        const bell = latheFn([[0.0, 0.0], [0.034, 0.0], [0.03, 0.012], [0.022, 0.05], [0.012, 0.075], [0.005, 0.085], [0, 0.088]], 8, (y, a, r) => r);
        bell.translate(0, 0.43, 0.2 + 0.02);
        ch.push(clean(bell));
        // a lotus boss above the chain and a beaded frame line round the panel
        ch.push(cbox(0.06, 0.03, 0.02, 0.006, 0, 0.765, 0.196));
        ch.push(cbox(0.3, 0.018, 0.012, 0.004, 0, 0.785, 0.192), cbox(0.3, 0.018, 0.012, 0.004, 0, 0.29, 0.192));
        const fg = mergeGeometries(ch); fg.rotateY(f * Math.PI / 2);
        parts.push(fg);
      }
    }
    // octagonal banded section
    const R8 = 0.19 / Math.cos(Math.PI / 8);
    parts.push(clean(new THREE.LatheGeometry(lathe2([[0, 0.79], [R8 * 1.06, 0.79], [R8 * 1.08, 0.81], [R8 * 1.08, 0.845], [R8, 0.86], [R8, 0.99], [R8 * 1.05, 1.0], [R8 * 1.07, 1.03], [R8 * 1.05, 1.06], [R8, 1.07], [R8, 1.15], [0, 1.15]]), 8, Math.PI / 8), false, true));
    // sixteen-sided section with a kirtimukha / garland band (scalloped ring)
    parts.push(clean(latheFn([[0, 1.15], [0.2, 1.15], [0.19, 1.17], [0.19, 1.26], [0.205, 1.275], [0.212, 1.3], [0.205, 1.325], [0.19, 1.34], [0.19, 1.45], [0, 1.45]], seg16,
      (y, a, r) => (y > 1.27 && y < 1.33 ? r * (1 + 0.05 * Math.pow(Math.abs(Math.cos(seg16 * a / 2)), 2)) : r)), false, !detail));
    // pot (ghata) capital with petals spilling over its shoulder
    parts.push(clean(latheFn([[0, 1.45], [0.17, 1.45], [0.2, 1.5], [0.235, 1.57], [0.24, 1.6], [0.228, 1.65], [0.19, 1.69], [0.172, 1.71], [0.18, 1.72], [0, 1.72]], detail ? 20 : 12,
      (y, a, r) => (y > 1.56 && y < 1.68 ? r * (1 + 0.04 * Math.pow(Math.abs(Math.cos(5 * a)), 0.6)) : r))));
    parts.push(sq([[0, 1.72], [0.24, 1.72], [0.25, 1.735], [0.25, 1.79], [0.235, 1.8], [0, 1.8]]));
    // cruciform bracket with rolled ends
    for (const rot of [0, Math.PI / 2]) {
      const b = mergeGeometries([cbox(0.74, 0.1, 0.2, 0.02, 0, 1.85, 0), cbox(0.5, 0.06, 0.2, 0.015, 0, 1.92, 0)]);
      b.rotateY(rot); parts.push(b);
    }
    return mergeGeometries(parts.map((g) => clean(g)));
  };
  const unitG = pillarUnit(!lite), unitLo = lite ? unitG : pillarUnit(false);
  const UNIT = 1.95, FLOOR = 0.45;
  const pillarM = stoneMat({ mode: 0, relief: 0.8, macro: 0.35, grain: 0.0015, streak: 0.6, grime: 0.6, ground: FLOOR, colA: [0.56, 0.36, 0.24], colB: [0.68, 0.52, 0.38] }, 'qpil');
  const XF = 12.5, XB = 14.9, ZS = lite ? [-11, -7.4, -3.8, -0.2, 3.4, 7.0] : [-11, -8.6, -6.2, -3.8, -1.4, 1.0, 3.4, 5.8, 8.2];
  const inst = [], instLo = [];
  const r9 = rng(91);
  for (const sx of [-1, 1]) for (const x of lite ? [XF] : [XF, XB]) for (const z of ZS) for (let s = 0; s < 2; s++) (x === XF ? inst : instLo).push([sx * x, FLOOR + s * UNIT, z, (Math.floor(r9() * 4)) * Math.PI / 2, 1]);
  // ruins of the prayer hall beyond the screen: odd pillars, some broken short
  const ruinR = rng(93);
  for (let i = 0; i < (lite ? 6 : 14); i++) {
    const x = -14 + ruinR() * 28, z = -19 - ruinR() * 12;
    if (Math.abs(x) < 1.6 && z > -24) continue;
    instLo.push([x, 0, z, ruinR() * TAU, 1]);
    if (ruinR() < 0.55) instLo.push([x, UNIT, z, ruinR() * TAU, 1]);
  }
  tris.pillars = 0;
  for (const [geo, list] of [[unitG, inst], [unitLo, instLo]]) {
    const pillars = new THREE.InstancedMesh(geo, pillarM, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, ry, s], i) => { m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(s, s, s)); pillars.setMatrixAt(i, m4); });
    pillars.castShadow = true; pillars.receiveShadow = true; group.add(pillars);
    tris.pillars += geo.attributes.position.count / 3 * list.length;
  }

  // cloister structure: stylobate, lintels, cross beams, roof slab, eave (chhajja), parapet, back wall
  {
    const parts = [], carved = [];
    const z0 = ZS[0] - 1.2, z1 = ZS[ZS.length - 1] + 1.2, L = z1 - z0, zc = (z0 + z1) / 2;
    const top = FLOOR + 2 * UNIT;
    for (const sx of [-1, 1]) {
      const X = (x) => sx * x;
      parts.push(cbox(4.3, FLOOR, L + 0.6, 0.04, X(13.9), FLOOR / 2, zc));                          // stylobate
      parts.push(cbox(0.2, 0.12, L + 0.6, 0.03, X(11.78), FLOOR - 0.06, zc));                       // its nosing
      parts.push(cbox(0.6, 0.16, L + 0.8, 0.03, X(11.9), 0.08, zc));                                 // a step
      for (const x of lite ? [XF] : [XF, XB]) parts.push(cbox(0.46, 0.42, L, 0.03, X(x), top + 0.21, zc));    // lintels
      for (const z of ZS) parts.push(cbox(XB - XF + 0.4, 0.3, 0.36, 0.03, X((XF + XB) / 2), top + 0.15, z));  // cross beams
      parts.push(cbox(3.9, 0.24, L + 0.4, 0.03, X(13.8), top + 0.54, zc));                          // roof slab
      // sloping eave on stone struts
      const eave = cbox(0.9, 0.07, L + 0.6, 0.02, 0, 0, 0); eave.rotateZ(sx * 0.32); eave.translate(X(11.9), top + 0.3, zc); parts.push(eave);
      for (const z of ZS) { const st = cbox(0.5, 0.08, 0.1, 0.02, 0, 0, 0); st.rotateZ(-sx * 0.6); st.translate(X(12.05), top + 0.1, z); parts.push(st); }
      // parapet with merlons
      parts.push(cbox(0.3, 0.42, L + 0.4, 0.03, X(12.0), top + 0.87, zc));
      parts.push(cbox(0.42, 0.1, L + 0.5, 0.03, X(12.0), top + 1.13, zc));
      parts.push(cbox(0.6, top + 1.1, L + 0.4, 0.03, X(15.65), (top + 1.1) / 2, zc));               // back wall
      for (const z of ZS) parts.push(cbox(0.12, 1.6, 0.9, 0.02, X(15.33), 1.7, z));                // niche frames on it
      // carved floral band on the courtyard face of the front lintel
      const za = sx > 0 ? z0 : -z1, zb = sx > 0 ? z1 : -z0;
      const rb = ribbon([V2(za + 0.1, top + 0.21), V2(zb - 0.1, top + 0.21)], 0.3, 0, 0.03, { v0: 0.02, v1: 0.48, u0: sx * 1.7, tile: 8 * 0.3 / 0.46 });
      rb.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2); rb.translate(X(XF - 0.23), 0, 0);
      carved.push(rb);
    }
    // the screen's foot: low rubble of fallen carved blocks, a broken drum or two
    const r = rng(95);
    for (let i = 0; i < (lite ? 10 : 24); i++) {
      const x = (r() - 0.5) * 30, z = Z0 + 0.6 + r() * 2.6;
      if (Math.abs(x) < 3.9 || (Math.abs(x) > 6.4 && Math.abs(x) < 11.0)) continue;
      const g = cbox(0.3 + r() * 0.6, 0.2 + r() * 0.35, 0.3 + r() * 0.5, 0.04);
      g.rotateY(r() * TAU); g.rotateX((r() - 0.5) * 0.3); g.translate(x, 0.12, z);
      parts.push(g);
    }
    // low ruined walls of the prayer hall beyond the screen
    for (let i = 0; i < 5; i++) { const h = 0.8 + r() * 2.2; parts.push(cbox(3 + r() * 5, h, 0.8, 0.05, -12 + i * 6 + r() * 2, h / 2, -26 - r() * 6)); }
    add(merge(parts), wallM);
    add(merge(carved, true), bandM);
  }

  // ====================================================================================== Qutb Minar
  {
    const seg = lite ? 72 : 168, NF = 24;
    const B = [29.5, 45.5, 54.5, 63.5], TOP = 72.5;
    const rS = (y) => 7.15 - (7.15 - 1.55) * (y / TOP);
    const pts = [[0, 0]];
    let y = 0;
    const storeyTop = [...B, TOP];
    for (let s = 0; s < 5; s++) {
      const y1 = storeyTop[s];
      const yb = s < 4 ? y1 - 2.4 : y1;                     // muqarnas corbel starts below the balcony
      for (; y < yb; y += lite ? 3.0 : 1.1) pts.push([rS(y), y]);
      pts.push([rS(yb), yb]);
      if (s < 4) {
        // corbel in three stalactite tiers, deck, parapet (out, up, in, down)
        for (let i = 1; i <= 9; i++) { const u = i / 9, yy = yb + 2.4 * u; pts.push([rS(yy) + 1.15 * (Math.floor(u * 3 - 1e-6) + smoothstep(0.55, 1, (u * 3) % 1 || 1)) / 3, yy]); }
        const R0 = rS(y1) + 1.2;
        pts.push([R0, y1 + 0.28], [R0 - 0.05, y1 + 0.32], [R0 - 0.05, y1 + 1.25], [R0 - 0.2, y1 + 1.25], [R0 - 0.2, y1 + 0.34], [rS(y1 + 0.34), y1 + 0.34]);
        y = y1 + 0.6;
      }
    }
    pts.push([rS(TOP) + 0.25, TOP], [rS(TOP) + 0.25, TOP + 0.3], [0, TOP + 0.3]);
    const flute = (yy, a) => {
      const k = Math.floor(a / TAU * NF), p = a / TAU * NF - k, round = Math.sqrt(Math.max(0, 1 - (2 * p - 1) ** 2)), ang = 1 - Math.abs(2 * p - 1);
      if (yy < B[0] - 2.4) return k % 2 ? ang : round;    // storey 1: round and angular flutes alternating
      if (yy < B[1] - 2.4 && yy > B[0]) return round;      // storey 2: round
      if (yy < B[2] - 2.4 && yy > B[1]) return ang;        // storey 3: angular
      return 0;
    };
    const g = latheFn(pts, seg, (yy, a, r) => {
      const rs = rS(yy);
      if (Math.abs(r - rs) < 0.02) return r + 0.42 * (rs / 7.15) * flute(yy, a) - 0.1;
      // corbel tiers: scalloped like honeycomb cells
      if (r > rs + 0.02 && r < rs + 1.2) { const tier = Math.floor((r - rs) / 0.4); return r - 0.12 * Math.pow(Math.abs(Math.sin(a * 36 + tier * 1.57)), 2); }
      // parapet merlons
      if (r > rs + 0.9 && (yy % 9.0) > 0 && Math.sin(a * 60) < -0.3) return r;
      return r;
    });
    const minarM = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    minarM.userData.detail = { albedo: 0.05, rough: 0.1, bump: 0.0002, scratch: 0, grime: 0.1 };
    masonry(minarM, {
      plane: PLANE_CYL, cylR: 7, course: 0.55, block: 1.1, split: 0.3, bevel: 0.03, relief: 0.6, joint: 0.02, macro: 0.08, streak: 1.2, grime: 0.5,
      colA: [0.4, 0.15, 0.08], colB: [0.52, 0.24, 0.13], colM: [0.25, 0.12, 0.07], tag: 'qminar',
      uniforms: { uCarve: { value: carve } },
      pars: 'uniform sampler2D uCarve;',
      color: /* glsl */ `
        {
          float yy = vMsL.y, ca = atan(vMsL.z, vMsL.x);
          vec3 marble = vec3(0.78, 0.76, 0.72) * (0.92 + 0.12 * msC.y);
          if (yy > 54.7 && yy < 63.3) diffuseColor.rgb = mix(diffuseColor.rgb, marble, 0.92);
          if (yy > 63.7) diffuseColor.rgb = mix(diffuseColor.rgb, marble, 0.85 * step(0.55, fract(yy / 1.7)));
          // carved inscription bands (buff) round the lower storeys
          float bandY[6]; bandY[0] = 4.8; bandY[1] = 10.4; bandY[2] = 16.0; bandY[3] = 21.6; bandY[4] = 36.0; bandY[5] = 49.8;
          for (int i = 0; i < 6; i++) {
            float dy = yy - bandY[i];
            if (abs(dy) < 0.5) {
              float t = texture2D(uCarve, vec2(ca * 7.0 / 7.2, 0.52 + (dy + 0.5) * 0.46)).r;
              diffuseColor.rgb = vec3(0.62, 0.4, 0.25) * mix(0.55, 1.05, t) * (0.9 + 0.2 * msC.y);
            }
          }
        }`,
    });
    const minar = new THREE.Mesh(g, minarM);
    minar.position.set(30, 0, -54); minar.castShadow = false; minar.receiveShadow = true;
    group.add(minar);
    tris.minar = g.index.count / 3;
  }

  // ====================================================================================== paving and the pillar's platform
  {
    const paveM = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
    paveM.userData.detail = { albedo: 0.05, rough: 0.12, bump: 0.0002, scratch: 0, grime: 0.15 };
    masonry(paveM, {
      course: 0.78, block: 1.15, split: 0.55, bevel: 0.04, relief: 1.5, joint: 0.016, tone: 0.3, macro: 0.07, streak: 0, grime: 0, chips: 1.2,
      colA: GREYQ, colB: [0.62, 0.5, 0.38], colM: [0.14, 0.11, 0.08], tag: 'qpave', rough: 'roughnessFactor -= 0.18 * qWear;',
      pars: 'float qWear;',
      color: /* glsl */ `
        {
          vec2 P = vMsW.xz - vec2(${(-150).toFixed(1)}, 0.0);
          // a slab here and there of re-used red sandstone; a few cracked slabs
          if (msC.w < 0.07) diffuseColor.rgb *= vec3(1.2, 0.78, 0.62);
          if (msC.w > 0.07 && msC.w < 0.2) { float cr = abs(snoise(vec3(P * vec2(0.9, 2.3), msC.y * 13.0))); diffuseColor.rgb *= mix(0.45, 1.0, smoothstep(0.0, 0.025, cr)); }
          // trodden paths: from the gate to the great arch, and round the pillar's railing (paler, smoother)
          qWear = smoothstep(2.6, 0.6, abs(P.x + 0.4 * sin(P.y * 0.2))) * smoothstep(-13.0, -9.0, P.y) + smoothstep(4.2, 2.2, max(abs(P.x), abs(P.y))) * 0.8;
          qWear = clamp(qWear, 0.0, 1.0) * (0.7 + 0.3 * snoise(vec3(P * 0.8, 2.0)));
          diffuseColor.rgb *= 1.0 + 0.16 * qWear;
          // drifted dust in the lee of walls, darker contact at their feet
          float wallD = min(abs(P.y - ${(-13.1).toFixed(1)}), abs(abs(P.x) - 11.6));
          diffuseColor.rgb *= mix(0.6, 1.0, smoothstep(0.0, 1.4, wallD));
          float dust = smoothstep(0.1, 0.7, snoise(vec3(P * 0.35, 5.0))) * 0.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.45, 0.34), dust);
          // beyond the screen and the cloisters: no paving, dusty earth with dry grass
          float outside = max(smoothstep(-15.6, -16.6, P.y), smoothstep(16.2, 17.2, abs(P.x)));
          float grass = smoothstep(0.0, 0.6, snoise(vec3(P * 0.6, 9.0)) + 0.3 * snoise(vec3(P * 3.0, 1.0)));
          // the lawns of the Qutb complex: mown grass, worn to earth here and there
          vec3 earth = mix(vec3(0.38, 0.3, 0.21), mix(vec3(0.13, 0.25, 0.05), vec3(0.08, 0.18, 0.05), smoothstep(-0.4, 0.6, snoise(vec3(P * 0.15, 3.0)))), smoothstep(-0.6, 0.0, grass - 0.25 + 0.6)) * (0.85 + 0.3 * snoise(vec3(P * 1.7, 4.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, earth, outside);
          msGrad *= 1.0 - outside; msJoint *= 1.0 - outside;
        }`,
    });
    const pave = new THREE.Mesh(new THREE.PlaneGeometry(240, 240).rotateX(-Math.PI / 2), paveM);
    pave.receiveShadow = true; group.add(pave);
    // platform: a chamfered step, an inner floor of small slabs, a kerb carrying the railing
    const platM = stoneMat({ course: 0.42, block: 0.6, split: 0.4, bevel: 0.02, relief: 1.1, colA: GREYQ, colB: [0.6, 0.5, 0.4], grime: 0.4, streak: 0.3 }, 'qplat');
    const p = [cbox(4.3, 0.12, 4.3, 0.03, 0, 0.06, 0)];
    for (const s of [-1, 1]) { p.push(cbox(3.34, 0.16, 0.2, 0.025, 0, 0.2, s * 1.57), cbox(0.2, 0.16, 2.94, 0.025, s * 1.57, 0.2, 0)); }
    add(merge(p), platM);
    // railing: square posts with ball finials, top and bottom rails, close vertical bars
    const railM = new THREE.MeshStandardMaterial({ color: '#1f1c1a', metalness: 0.7, roughness: 0.5 });
    const rl = [], s = 1.57, y0 = 0.28, h = 1.05;
    for (const [x, z] of [[-s, -s], [0, -s], [s, -s], [s, 0], [s, s], [0, s], [-s, s], [-s, 0]]) {
      rl.push(new THREE.BoxGeometry(0.06, h, 0.06).translate(x, y0 + h / 2, z), new THREE.SphereGeometry(0.045, 10, 6).translate(x, y0 + h + 0.04, z), new THREE.BoxGeometry(0.09, 0.03, 0.09).translate(x, y0 + h, z));
    }
    for (const yy of [y0 + 0.08, y0 + h - 0.04]) for (const sg of [-1, 1]) { rl.push(new THREE.BoxGeometry(2 * s, 0.035, 0.035).translate(0, yy, sg * s), new THREE.BoxGeometry(0.035, 0.035, 2 * s).translate(sg * s, yy, 0)); }
    const step = lite ? 0.2 : 0.11;
    for (let t = -s + step; t < s - 1e-3; t += step) for (const sg of [-1, 1]) {
      rl.push(new THREE.BoxGeometry(0.016, h - 0.12, 0.016).translate(t, y0 + h / 2, sg * s), new THREE.BoxGeometry(0.016, h - 0.12, 0.016).translate(sg * s, y0 + h / 2, t));
    }
    const railMesh = add(merge(rl), railM);
    railMesh.receiveShadow = false;
  }

  // ====================================================================================== trees beyond the walls
  // (nature-kit: neem, peepal, ashoka and a banyan on the lawns round the complex, lit through by the sun)
  const leafSun = { dir: new THREE.Vector3(-16, 8.5, 9).normalize(), color: new THREE.Color(2.6, 1.9, 1.2) };
  const forest = (() => {
    const r = rng(97), items = [];
    const spots = [[-26, -30, 'neem'], [-18, -40, 'peepal'], [22, -36, 'neem'], [29, -24, 'ashoka'], [-6, -44, 'banyan'], [10, -42, 'mango'], [-30, -8, 'ashoka'], [28, 2, 'neem'],
      [-14, -29, 'ashoka'], [15, -28, 'ashoka'], [-38, -22, 'mango'], [37, -13, 'peepal'], [-24, -55, 'neem'], [26, -52, 'peepal'], [2, -62, 'neem'], [-42, 6, 'mango'], [40, 12, 'neem'], [-33, 18, 'ashoka']];
    for (const [x, z, kind] of spots.slice(0, lite ? 9 : 18)) items.push({ kind, x, y: 0, z, s: (kind === 'banyan' ? 0.9 : 0.85) + r() * 0.3, tint: 0.9 + r() * 0.2 });
    return NK.plantForest(items, { sun: leafSun, lite, variants: 2, seed: 4, wind: 0.6 });
  })();
  group.add(forest.group);

  // ====================================================================================== sky: warm late afternoon, haze
  const sunDir = new THREE.Vector3(-16, 8.5, 9).normalize();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `uniform vec3 uSun; varying vec3 vP;
      float sh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(sh(i), sh(i + vec2(1, 0)), f.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        float h = vP.y;
        vec3 hor = vec3(0.98, 0.72, 0.48), low = vec3(0.9, 0.74, 0.58), mid = vec3(0.66, 0.66, 0.68), zen = vec3(0.3, 0.44, 0.7);
        vec3 c = mix(hor, low, smoothstep(0.0, 0.08, h));
        c = mix(c, mid, smoothstep(0.06, 0.35, h));
        c = mix(c, zen, smoothstep(0.3, 0.95, h));
        float s = max(0.0, dot(vP, uSun));
        c += vec3(1.0, 0.62, 0.32) * (pow(s, 5.0) * 0.45 + pow(s, 40.0) * 0.7) + vec3(1.0, 0.9, 0.75) * pow(s, 900.0) * 18.0;
        // thin high cirrus, lit warm on the sun side
        vec2 uv = vP.xz / (h + 0.18);
        float n = sn(uv * vec2(1.4, 5.0) + 3.0) * 0.6 + sn(uv * vec2(3.1, 11.0)) * 0.3 + sn(uv * 9.0) * 0.1;
        float cl = smoothstep(0.55, 0.85, n) * smoothstep(0.03, 0.25, h) * (1.0 - smoothstep(0.6, 0.9, h));
        c = mix(c, vec3(1.0, 0.86, 0.7) * (0.9 + 0.5 * pow(s, 3.0)), cl * 0.35);
        // dusty haze sitting on the horizon; below it, the haze colour (never black)
        c = mix(c, vec3(0.8, 0.64, 0.48), (1.0 - smoothstep(-0.02, 0.1, h)) * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  sky.renderOrder = -1;
  group.add(sky);
  leafSun.dir.copy(sunDir);
  return { sky, sunDir, tris, forest };
}

// --------------------------------------------------------------------------------------------------------
// the Iron Pillar: smooth dark wrought iron, faint hammer dimples, a hand-polished lower band, the inscription
// band, a bell capital with reeded lotus petals and bead rings, an amalaka and a square abacus
export function buildIronPillar({ lite = false } = {}) {
  const shaftP = [[0, 0], [0.214, 0], [0.209, 0.03]];
  for (let i = 1; i <= 30; i++) { const y = 0.03 + (6.08 - 0.03) * i / 30; shaftP.push([0.209 - (0.209 - 0.153) * (y / 6.08), y]); }
  shaftP.push([0.162, 6.095], [0.172, 6.115], [0.165, 6.14], [0.268, 6.15]);
  const capP = [[0.268, 6.15]];
  for (let i = 1; i <= 16; i++) { const u = i / 16; capP.push([0.155 + 0.115 * Math.pow(1 - u, 1.7), 6.15 + u * 0.47]); }
  capP.push([0.165, 6.63], [0.19, 6.64], [0.19, 6.665], [0.172, 6.68], [0.2, 6.69], [0.2, 6.71], [0.172, 6.72]);
  for (let i = 0; i <= 16; i++) { const a = -Math.PI / 2 + Math.PI * i / 16; capP.push([0.172 + 0.09 * Math.cos(a), 6.82 + 0.1 * Math.sin(a)]); }
  capP.push([0.15, 6.93], [0.15, 6.96], [0, 6.96]);
  const seg = lite ? 48 : 96, cseg = lite ? 64 : 160;
  const shaft = new THREE.LatheGeometry(lathe2(shaftP), seg);
  const cap = latheFn(capP, cseg, (y, a, r) => {
    if (y > 6.15 && y < 6.625) {
      // inverted lotus: 16 petals, rounded tips flaring at the foot, a midrib on each
      const u = (y - 6.15) / 0.47, p = Math.abs(Math.cos(8 * a));
      const petal = Math.pow(p, 0.45) * (0.05 + 0.05 * (1 - u)) - 0.012 * Math.pow(Math.abs(Math.cos(16 * a + Math.PI)), 12) * (1 - u);
      const tip = u < 0.12 ? smoothstep(0, 0.12, u) * 0 + (0.12 - u) * 0.35 * (p - 0.6) : 0;
      return r * (0.965 + petal + tip);
    }
    if (y > 6.725 && y < 6.915) return r * (0.965 + 0.08 * Math.pow(0.5 + 0.5 * Math.cos(28 * a), 0.5));   // amalaka: ribbed
    if (y > 6.635 && y < 6.715) return r * (1 + 0.025 * Math.pow(Math.abs(Math.cos(36 * a)), 0.8));       // bead rings
    return r;
  });
  const parts = [shaft, cap, cbox(0.42, 0.18, 0.42, 0.02, 0, 6.96 + 0.09, 0), cbox(0.34, 0.07, 0.34, 0.015, 0, 7.14 + 0.035, 0)];
  const geo = mergeGeometries(parts.map((g) => clean(g)));
  const ins = inscriptionTexture(lite ? 512 : 1024, 11);
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.62 });
  mat.userData.detail = { albedo: 0.05, rough: 0.25, bump: 0.00002, scratch: 0.1, grime: 0.05 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uIns = { value: ins };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPl;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPl = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPl; uniform sampler2D uIns;
        float pH(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
        vec2 pH2(vec2 p){ return vec2(pH(p), pH(p + 17.17)); }
        float pN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(pH(i), pH(i + vec2(1, 0)), f.x), mix(pH(i + vec2(0, 1)), pH(i + vec2(1, 1)), f.x), f.y); }
        // hammer dimples: shallow cups on a jittered grid (cell ~ 5 cm, flattened along the shaft)
        float hammer(vec2 q){
          vec2 c = floor(q), f = fract(q); float d = 9.0, id = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)), pp = o + pH2(c + o) * 0.8 + 0.1 - f;
            float dd = dot(pp, pp); if (dd < d) { d = dd; id = pH(c + o); }
          }
          return -(1.0 - smoothstep(0.0, 0.55, d)) * (0.5 + 0.5 * id);
        }
        float pHt(vec2 q){ return hammer(q) * 0.0006 + (pN(q * 0.15) - 0.5) * 0.0025; }
        float pPol, pRust, pIns; vec3 pGrad;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float pa = atan(vPl.z, vPl.x), y = vPl.y;
          vec2 q = vec2(pa * 0.19 / 0.07, y / 0.1);
          float e = 0.06;
          float h0 = pHt(q), hu = pHt(q + vec2(e, 0.0)), hv = pHt(q + vec2(0.0, e));
          vec3 Tu = vec3(-sin(pa), 0.0, cos(pa)), Tv = vec3(0.0, 1.0, 0.0);
          pGrad = ((hu - h0) / (e * 0.07) * Tu + (hv - h0) / (e * 0.1) * Tv) * step(y, 6.1);
          float pn = pN(vec2(pa * 3.0, y * 6.0)) * 0.55 + pN(vec2(pa * 9.3, y * 18.0)) * 0.3 + pN(vec2(pa * 27.0, y * 50.0)) * 0.15;
          // hands have polished the lower metre to a warm dark sheen; the rest is near-black, slightly blue-grey
          pPol = smoothstep(1.55, 0.95, y + (pn - 0.5) * 0.3) * smoothstep(0.08, 0.3, y);
          vec3 iron = mix(vec3(0.075, 0.068, 0.064), vec3(0.11, 0.085, 0.068), pn);
          iron = mix(iron, vec3(0.19, 0.13, 0.09) * (0.85 + 0.3 * pn), pPol);
          // the foot, where it meets the stone, carries a little rust
          pRust = smoothstep(0.32, 0.04, y + (pn - 0.5) * 0.25) * smoothstep(0.35, 0.6, pn + 0.12);
          iron = mix(iron, vec3(0.2, 0.075, 0.03), pRust * 0.8);
          // the Gupta-era inscription: engraved lines on the side facing the courtyard
          vec2 iu = vec2((pa - 1.75) / 2.2 + 0.5, (y - 1.98) / 0.34);
          pIns = 0.0;
          if (iu.x > 0.0 && iu.x < 1.0 && iu.y > 0.0 && iu.y < 1.0) pIns = (1.0 - texture2D(uIns, vec2(1.0 - iu.x, iu.y)).r) * 0.85;
          iron = mix(iron, vec3(0.17, 0.14, 0.12), pIns * 0.5);
          diffuseColor.rgb = iron;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.42, 0.24, pPol) + 0.4 * pRust + 0.25 * pIns;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(0.55, 0.75, pPol) * (1.0 - pRust);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          nW = normalize(nW - pGrad * 0.8);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'mpillar2';
  return { geo, mat, profile: shaftP };
}
