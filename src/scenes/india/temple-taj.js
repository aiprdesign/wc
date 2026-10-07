// Taj Mahal, Agra (1632–1653) — high-detail model for the Architecture chapter (src/scenes/india/temples.js).
// buildTaj(P, M, { lite }) adds parts to P (a Parts list from temples-assets.js: one merged mesh per material
// key) in the monument's own frame — metres, plinth centre at the origin, the south front facing +z — and
// registers its materials on M (keys taj*, see temple-taj-detail.js).
//
// What is modelled, from the ground up:
//   · the marble PLINTH (95 m square, 6.7 m): base and cornice mouldings, a stepped blind arcade of
//     half-domed niches all round
//   · the MAUSOLEUM, a square with chamfered corners: on each face a PISHTAQ (deep iwan with a faceted
//     half-dome, a four-centred arch in a stepped frame, a Thuluth-style calligraphy band in black inlay
//     round it, pietra-dura spandrels, a blind-arcaded parapet; inside, the doorway with its jali lunette and
//     two storeys of niches on the canted walls), flanked by two storeys of alcoves (each a pointed arch in
//     its own inlaid frame, a half-domed recess with a jali window, balustrades on the upper storey); the
//     chamfered corners with the same alcoves; carved flower panels along the dado; the parapet with its
//     blind arcade; slender engaged shafts (guldastas) at every corner and beside each pishtaq, rising
//     above the parapets into lotus-bud pinnacles
//   · the DRUM with a blind arcade, the ONION DOME, the inverted-lotus crown, the gilded finial (kalasha
//     bulbs and crescent); four CHHATRIS on the roof (eight columns, arches, chajja eaves, lotus domes)
//   · four MINARETS (c. 41 m) canted a little outward: three stages clad in inlaid slabs, two balconies and
//     a top gallery on corbelled brackets with pierced balustrades, each crowned by a chhatri
//   · the MOSQUE and its twin, the JAWAB, in red sandstone outlined in white marble: platform, central
//     pishtaq and four arched bays, chhajja and kangura cresting, three marble domes, corner towers with
//     chhatris.
import * as THREE from 'three';
import { TAJ_PY } from './temples-assets.js';
import {
  Kit, makeTajMaterials, archFull, uFrameShape, arcadeShape, archPanelShape, archBandShape, spandrelShape,
  extrude, nicheShell, ringMould, mouldStrip, lathe, latheFlat, smoothProfile, bendRound,
} from './temple-taj-detail.js';

const Y0 = TAJ_PY;                 // plinth top (6.7 m)
const HS = 28.3, CH = 7.0;         // mausoleum half-side and chamfer (plan: an irregular octagon, 56.6 m across)
const PW = 11.5;                   // pishtaq half-width
const PZ = HS + 1.0;               // pishtaq front (it stands 1 m proud of the wings)
const UH = 13.8;                   // one storey of alcoves
const WT = Y0 + 2 * UH;            // wall top / roof terrace
const PT = Y0 + 31.5;              // pishtaq top
const DR = 12.0;                   // drum radius
const D0 = Y0 + 35.5;              // drum top = springing of the dome
const MW = 'tajMarble';
const sst = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ------------------------------------------------------------------------------------------- alcove unit
// One arched bay in its own frame, authored with its face at z = 0, bottom at y = 0, recess towards −z.
// o: W × H frame, w opening, spring (from the floor), rise, T frame depth, step (outer arch step), D recess
// depth, sill (balustrade / parapet height in the opening), rail (pierced balustrade), win (jali window in
// the back), door (dark doorway in the back), dado (carved panels on the piers), mat / line keys.
function unit(K, o) {
  const { W, H, w, spring, rise, T = 0.7, step = 0.3, D = 2.0, back = 0.45, sill = 0, mat = MW, line = 'tajBlack' } = o;
  const n = K.lite ? 8 : 14, s = step, wo = w + 2 * s, riseO = rise + s * 1.05;
  const lw = o.lw ?? 0.13, bi = o.bi ?? 0.42;
  const dadoH = o.dado ? 1.4 : 0;
  // the frame: an outer layer with the larger arch and an inner layer with the opening — a stepped reveal
  K.put(mat, extrude(uFrameShape(W, H, wo, spring, riseO, n), 0.22));
  const inner = extrude(uFrameShape(W, H, w, spring, rise, n), T - 0.22); inner.translate(0, 0, -0.22);
  K.put(mat, inner, { ao: (x, y, z) => 1 - 0.28 * sst(0.2, T, -z) });
  const sp = spring, D2 = D;
  if (K.cheap) {
    K.put(mat, new THREE.ShapeGeometry(archPanelShape(w, sp, rise, n, 0)).translate(0, 0, -T), { ao: 0.6 });
    return;
  }
  // the recess: half-domed, darkening towards the back and up into the hood
  K.at(0, 0.03, -T, 0, () => K.put(mat, nicheShell(w, sp - 0.03, rise, D2, { back, n }), {
    ao: (x, y, z) => Math.max(0.42, 1 - 0.34 * (-z / D2) - 0.2 * sst(sp, sp + rise, y) - 0.08 * (1 - sst(0, 1.5, y))),
  }));
  const zb = -T - D + 0.03, bw = back * w;     // the back facet
  if (o.win) {
    const ww = bw * 0.74, wr = ww * 0.55, wa = sp + rise * 0.3, ws = wa - wr, wy = o.win.y ?? 1.6;
    K.at(0, 0, zb, 0, () => {
      K.put('tajJali', new THREE.ShapeGeometry(archPanelShape(ww, ws, wr, n, wy)), { uv1: (x, y) => [x / 0.8, y / 0.8], ao: 0.8 });
      K.put(mat, extrude(archBandShape(ww, ws, wr, 0.14, n, wy), 0.08).translate(0, 0, 0.08), { ao: 0.72 });
      K.box(mat, -ww / 2 - 0.2, ww / 2 + 0.2, wy - 0.12, wy, -0.02, 0.14, { ao: 0.72 });
    });
  }
  if (o.door) {
    const dw = bw * 0.8, dr = dw * 0.5, ds = sp * 0.82 - dr;
    K.at(0, 0, zb, 0, () => {
      K.put('tajDark', new THREE.ShapeGeometry(archPanelShape(dw, ds, dr, n, 0.03)), { ao: 0.9 });
      K.put(mat, extrude(archBandShape(dw, ds, dr, 0.18, n, 0.03), 0.1).translate(0, 0, 0.1), { ao: 0.7 });
      K.put('tajJali', new THREE.ShapeGeometry(archPanelShape(dw * 0.8, ds + dr * 0.15, dr * 0.75, n, ds - 0.1)).translate(0, 0, 0.01), { uv1: (x, y) => [x / 0.8, y / 0.8], ao: 0.85 });
    });
  }
  if (o.dado) {
    // carved flower panels inside, along the back wall
    const pw = bw * 0.9, rep = Math.max(1, Math.round(pw / 1.05));
    K.panel('tajDado', -pw / 2, pw / 2, 0.12, 1.36, zb + 0.02, { rep: [rep, 1], ao: 0.7 });
  }
  // balustrade or solid parapet across the opening
  if (sill > 0 && o.rail) {
    K.panel('tajBalus', -w / 2, w / 2, 0.03, sill, -0.3, { rep: [w / 1.4, 1], ao: 0.92 });
    K.box(mat, -w / 2, w / 2, sill - 0.04, sill + 0.1, -0.42, -0.16);
  } else if (sill > 0) K.box(mat, -w / 2, w / 2, 0, sill, -0.5, -0.2, { ao: 0.9 });
  // inlay: a band following the arch, the rectangle of the frame (alfiz) and pietra dura in the spandrels
  if (line) {
    K.put(line, new THREE.ShapeGeometry(archBandShape(wo, spring, riseO, lw, n, dadoH)).translate(0, 0, 0.02));
    const yb = dadoH ? dadoH + 0.12 : bi, xr = W / 2 - bi;
    for (const sx of [-1, 1]) K.box(line, sx * xr - lw / 2, sx * xr + lw / 2, yb, H - bi + lw / 2, 0, 0.025);
    K.box(line, -xr - lw / 2, xr + lw / 2, H - bi - lw / 2, H - bi + lw / 2, 0, 0.025);
    if (!dadoH) K.box(line, -xr - lw / 2, xr + lw / 2, bi - lw / 2, bi + lw / 2, 0, 0.025);
  }
  if (o.floral !== false && line === 'tajBlack') {
    const hx = W / 2 - bi - lw / 2, top = H - bi - lw / 2;
    if (top > spring + riseO + 0.5) K.put('tajFloral', new THREE.ShapeGeometry(spandrelShape(hx, top, wo + 2 * lw, spring, riseO + lw * 1.05, n)).translate(0, 0, 0.025), { uv1: (x, y) => [x / 2.4, y / 2.4] });
  }
  if (o.dado) {
    // carved panels on the piers, under a small moulding
    const x0 = wo / 2 + lw + 0.12, x1 = W / 2 - 0.16;
    if (x1 - x0 > 0.45) for (const sx of [-1, 1]) {
      const a = sx < 0 ? -x1 : x0, b = sx < 0 ? -x0 : x1;
      K.panel('tajDado', a, b, 0.1, 1.32, 0.025, { rep: [Math.max(1, Math.round((b - a) / 1.0)), 1] });
      K.box(mat, a - 0.05, b + 0.05, 1.36, 1.46, 0, 0.07);
    }
  }
}

// ------------------------------------------------------------------------------------------- calligraphy frame
// The rectangular band round a pishtaq arch (inner half-width xi, from yb to the inner top yt, width bw),
// on a face at z. Text flows along the band; one texture tile spans 12 band widths.
function calliFrame(K, xi, yb, yt, bw, z) {
  const L = bw * 12.05;
  K.put('tajCalli', new THREE.PlaneGeometry(bw, yt - yb).translate(-xi - bw / 2, (yb + yt) / 2, z), { uv1: (x, y) => [(y - yb) / L, (-xi - x) / bw] });
  K.put('tajCalli', new THREE.PlaneGeometry(bw, yt - yb).translate(xi + bw / 2, (yb + yt) / 2, z), { uv1: (x, y) => [(y - yb) / L + 0.37, (x - xi) / bw] });
  K.put('tajCalli', new THREE.PlaneGeometry(2 * (xi + bw), bw).translate(0, yt + bw / 2, z), { uv1: (x, y) => [-x / L + 0.61, (y - yt) / bw] });
}

// ------------------------------------------------------------------------------------------- guldasta
// Engaged shaft: octagonal, ringed, from y0 to y1, then a free lantern and a lotus-bud pinnacle.
function guldasta(K, x, z, y0, y1, r, cap = 3.6) {
  const s8 = K.lite ? 6 : 8, h = y1 - y0;
  K.put(MW, latheFlat([[r * 1.45, y0], [r * 1.45, y0 + 0.5], [r * 1.25, y0 + 0.7], [r * 1.25, y0 + 1.3], [r * 1.05, y0 + 1.45]], s8), { pos: [x, 0, z] });
  K.put(MW, new THREE.CylinderGeometry(r, r * 1.05, h, s8, 1, true, Math.PI / 8), { pos: [x, (y0 + y1) / 2, z] });
  const nr = Math.max(2, Math.round(h / 4.6));
  for (let i = 1; i < nr; i++) K.put(MW, latheFlat([[r * 1.02, -0.12], [r * 1.28, -0.05], [r * 1.28, 0.05], [r * 1.02, 0.12]], s8), { pos: [x, y0 + (h * i) / nr, z] });
  // capital, lantern, cupola, lotus and the gilded tip
  const c = y1;
  K.put(MW, latheFlat([[r, c - 0.2], [r * 1.5, c + 0.15], [r * 1.5, c + 0.4], [r * 0.95, c + 0.55], [r * 0.95, c + cap * 0.42], [r * 1.35, c + cap * 0.48], [r * 1.35, c + cap * 0.55], [r * 1.0, c + cap * 0.6]], s8), { pos: [x, 0, z] });
  const b = c + cap * 0.6;
  K.put(MW, lathe([[r * 1.0, b], [r * 1.3, b + cap * 0.08], [r * 1.38, b + cap * 0.16], [r * 1.15, b + cap * 0.26], [r * 0.6, b + cap * 0.34], [r * 0.25, b + cap * 0.38], [r * 0.12, b + cap * 0.4]], K.lite ? 8 : 12), { pos: [x, 0, z] });
  K.put('tajGold', lathe([[r * 0.18, 0], [r * 0.3, 0.12], [r * 0.12, 0.3], [r * 0.2, 0.42], [r * 0.05, 0.75], [0, 0.8]], 6), { pos: [x, b + cap * 0.39, z] });
}

// ------------------------------------------------------------------------------------------- pishtaq
function pishtaq(K) {
  const n = K.lite ? 10 : 18;
  const w = 13.6, spring = 14.6, rise = 9.2, wo = 14.6, riseO = 9.7, top = 28.9, depth = 3.0;
  K.at(0, Y0, PZ, 0, () => {
    // the frame: outer step and the deep reveal of the iwan arch
    K.put(MW, extrude(uFrameShape(2 * PW, top, wo, spring, riseO, n), 0.25));
    const g = extrude(uFrameShape(2 * PW, top, w, spring, rise, n), depth - 0.25); g.translate(0, 0, -0.25);
    K.put(MW, g, { ao: (x, y, z) => 1 - 0.3 * sst(0.3, depth, -z) - 0.1 * sst(spring, spring + rise, y) * sst(0.3, depth, -z) });
    // calligraphy band, spandrels, the inlaid arch band, panels on the piers
    calliFrame(K, 8.6, 1.6, 27.3, 1.15, 0.02);
    K.put('tajFloral', new THREE.ShapeGeometry(spandrelShape(8.6, 27.3, wo + 0.36, spring, riseO + 0.19, n)).translate(0, 0, 0.022), { uv1: (x, y) => [x / 2.4, y / 2.4] });
    K.put('tajBlack', new THREE.ShapeGeometry(archBandShape(wo, spring, riseO, 0.18, n, 1.6)).translate(0, 0, 0.02));
    for (const sx of [-1, 1]) {
      // between the arch and the band: a tall panel; outside the band: two panels with blind arches
      const pl = (x0, x1, y0, y1, arch) => {
        const lw = 0.11, a = Math.min(x0, x1), b = Math.max(x0, x1);
        K.box('tajBlack', a, a + lw, y0, y1, 0, 0.025); K.box('tajBlack', b - lw, b, y0, y1, 0, 0.025);
        K.box('tajBlack', a, b, y0, y0 + lw, 0, 0.025); K.box('tajBlack', a, b, y1 - lw, y1, 0, 0.025);
        if (arch) {
          const aw = b - a - 0.36, ar = aw * 0.6, asp = y1 - 0.25 - ar;
          K.put('tajBlack', new THREE.ShapeGeometry(archBandShape(aw, asp - y0 - 0.25, ar, 0.08, 8, 0)).translate((a + b) / 2, y0 + 0.25, 0.022));
        }
      };
      pl(sx * (wo / 2 + 0.34), sx * 8.45, 1.6, spring - 0.3, false);
      pl(sx * 9.9, sx * 10.95, 1.6, 14.2, true);
      pl(sx * 9.9, sx * 10.95, 14.6, 27.3, true);
      // dado panels and moulding
      for (const [a, b] of [[wo / 2 + 0.3, 8.5], [9.85, 10.95]]) {
        const x0 = sx < 0 ? -b : a, x1 = sx < 0 ? -a : b;
        K.panel('tajDado', x0, x1, 0.1, 1.34, 0.025, { rep: [Math.max(1, Math.round((x1 - x0) / 1.0)), 1] });
        K.box(MW, x0 - 0.05, x1 + 0.05, 1.38, 1.48, 0, 0.08);
      }
    }
    // cornice, the blind-arcaded parapet and its coping
    K.put(MW, mouldStrip(2 * PW + 0.5, [[0.05, 28.75], [0.14, 28.85], [0.14, 29.0], [0.34, 29.15], [0.42, 29.3], [0.42, 29.4]]));
    K.box(MW, -PW, PW, top, PT - Y0 - 0.3, -depth, -0.15, { ao: 0.82 });
    const holes = [], nh = K.lite ? 9 : 13;
    for (let i = 0; i < nh; i++) holes.push({ x: -PW + (i + 0.5) * (2 * PW / nh), w: 1.05, y0: 29.65, spring: 0.75, rise: 0.55 });
    K.put(MW, extrude(arcadeShape(-PW + 0.05, PW - 0.05, 29.4, PT - Y0 - 0.3, holes, 8), 0.15));
    K.box(MW, -PW - 0.2, PW + 0.2, PT - Y0 - 0.3, PT - Y0, -depth - 0.1, 0.22);
    if (K.cheap) { K.put(MW, new THREE.ShapeGeometry(archPanelShape(w, spring, rise, n, 0)).translate(0, 0, -depth), { ao: 0.55 }); return; }
    // the iwan: faceted half-dome over three walls — the doorway on the back, niches on the canted walls
    const hw = w / 2, back = 0.5, D = 3.6;
    K.at(0, 0, -depth, 0, () => {
      K.put(MW, nicheShell(w, spring, rise, D, { back, n, from: 'hood' }), { ao: (x, y, z) => Math.max(0.5, 0.86 - 0.18 * (-z / D) - 0.12 * sst(spring, spring + rise, y)) });
      K.at(0, 0, -D, 0, () => {
        unit(K, { W: 2 * back * hw, H: spring, w: 4.3, spring: 6.6, rise: 2.4, T: 0.35, step: 0.2, D: 1.1, back: 0.75, door: true, dado: true, floral: false, bi: 0.3 });
        // jali lunette over the doorway, in a frame
        K.put('tajJali', new THREE.ShapeGeometry(archPanelShape(2.9, 11.4, 1.6, n, 9.9)).translate(0, 0, 0.03), { uv1: (x, y) => [x / 0.8, y / 0.8], ao: 0.85 });
        K.put(MW, extrude(archBandShape(2.9, 11.4, 1.6, 0.16, n, 9.9), 0.1).translate(0, 0, 0.12), { ao: 0.75 });
        calliFrame(K, 2.55, 0.0, spring - 1.1, 0.6, 0.03);
      });
      const L = Math.hypot((1 - back) * hw, D), ry = Math.atan2(D, (1 - back) * hw);
      for (const sx of [-1, 1]) {
        const cx = sx * (1 + back) / 2 * hw, cz = -D / 2;
        K.at(cx, 0, cz, -sx * ry, () => {
          unit(K, { W: L, H: 7.3, w: 2.6, spring: 4.1, rise: 1.5, T: 0.25, step: 0.14, D: 0.6, back: 0.5, dado: true, win: { y: 1.5 }, bi: 0.25, lw: 0.09, floral: false });
          K.at(0, 7.3, 0, 0, () => unit(K, { W: L, H: spring - 7.3, w: 2.6, spring: 4.0, rise: 1.5, T: 0.25, step: 0.14, D: 0.6, back: 0.5, sill: 0.9, rail: true, bi: 0.25, lw: 0.09, floral: false }));
        });
        // engaged colonnettes in the corners of the iwan
        for (const [qx, qz] of [[sx * hw, 0], [sx * back * hw, -D]]) K.put(MW, new THREE.CylinderGeometry(0.16, 0.18, spring, 8), { pos: [qx, spring / 2, qz], ao: 0.8 });
      }
    });
  });
}

// ------------------------------------------------------------------------------------------- one face of the mausoleum
function facade(K, q) {
  K.at(0, 0, 0, q * Math.PI / 2, () => {
    pishtaq(K);
    const ww = HS - CH - PW;
    for (const sx of [-1, 1]) {
      const cx = sx * (PW + ww / 2);
      K.at(cx, Y0, HS, 0, () => {
        unit(K, { W: ww, H: UH, w: 6.0, spring: 7.9, rise: 3.6, T: 0.7, D: 2.1, win: {}, dado: true });
        K.at(0, UH, 0, 0, () => unit(K, { W: ww, H: UH, w: 6.0, spring: 7.9, rise: 3.6, T: 0.7, D: 2.1, sill: 1.05, rail: true, win: { y: 1.3 } }));
      });
      // storey band, cornice, parapet with its blind arcade
      wallTop(K, cx, HS, ww);
      guldasta(K, sx * PW, PZ, Y0, PT, 0.55, 4.6);
      guldasta(K, sx * (HS - CH), HS, Y0, WT + 1.9, 0.5, 4.0);
    }
    // the chamfered corner to the right of this face (turned by 45°)
    const dC = (2 * HS - CH) / Math.SQRT2, wc = CH * Math.SQRT2;
    K.at(0, 0, 0, Math.PI / 4, () => {
      K.at(0, Y0, dC, 0, () => {
        unit(K, { W: wc, H: UH, w: 6.0, spring: 7.9, rise: 3.6, T: 0.7, D: 2.1, win: {}, dado: true });
        K.at(0, UH, 0, 0, () => unit(K, { W: wc, H: UH, w: 6.0, spring: 7.9, rise: 3.6, T: 0.7, D: 2.1, sill: 1.05, rail: true, win: { y: 1.3 } }));
      });
      wallTop(K, 0, dC, wc);
    });
  });
}
// the band between the storeys, the crowning cornice and the parapet of a wall segment (centre cx, plane z, width w)
function wallTop(K, cx, z, w) {
  K.at(cx, 0, z, 0, () => {
    K.put(MW, mouldStrip(w, [[0, Y0 + UH - 0.16], [0.1, Y0 + UH - 0.1], [0.1, Y0 + UH + 0.1], [0, Y0 + UH + 0.16]]));
    K.put(MW, mouldStrip(w + 0.3, [[0, WT - 0.55], [0.12, WT - 0.45], [0.12, WT - 0.3], [0.32, WT - 0.15], [0.4, WT], [0.4, WT + 0.08]]));
    K.box(MW, -w / 2, w / 2, WT, WT + 1.65, -0.55, -0.12, { ao: 0.8 });
    const nh = Math.max(3, Math.round(w / (K.lite ? 1.6 : 1.15))), holes = [];
    for (let i = 0; i < nh; i++) holes.push({ x: -w / 2 + (i + 0.5) * (w / nh), w: (w / nh) * 0.62, y0: WT + 0.3, spring: 0.6, rise: (w / nh) * 0.4 });
    K.put(MW, extrude(arcadeShape(-w / 2, w / 2, WT + 0.08, WT + 1.65, holes, 6), 0.14));
    K.box(MW, -w / 2 - 0.06, w / 2 + 0.06, WT + 1.65, WT + 1.9, -0.7, 0.12);
  });
}

// ------------------------------------------------------------------------------------------- chhatri
// Domed kiosk: base, eight columns with arches, sloping chajja, drum, lotus dome and gilded finial.
// R = radius of the ring of columns; mat / domeMat for red-sandstone variants.
const DOME_CTRL = [[12.0, 0], [12.6, 0.8], [13.5, 2.6], [14.1, 4.9], [14.25, 7.4], [14.05, 10.0], [13.3, 12.8], [11.9, 15.6], [9.9, 18.3], [7.5, 20.7], [5.1, 22.6], [3.0, 24.0], [1.5, 25.0], [0.6, 25.8], [0, 26.3]];
function chhatri(K, x, y, z, R, { base = true, mat = MW, domeMat = MW, low = false } = {}) {
  const lite = K.lite || low, s8 = 8;
  K.at(x, y, z, 0, () => {
    let yb = 0;
    if (base) {
      K.put(mat, latheFlat([[R * 1.32, 0], [R * 1.32, R * 0.08], [R * 1.26, R * 0.14], [R * 1.26, R * 0.3], [R * 1.36, R * 0.35], [R * 1.36, R * 0.4], [0, R * 0.4]], s8));
      yb = R * 0.4;
    } else K.put(mat, latheFlat([[R * 1.3, 0], [R * 1.3, R * 0.1], [0, R * 0.1]], s8));
    if (!base) yb = R * 0.1;
    const hC = R * 0.95;
    if (low) {
      // distant kiosk: eight square posts under a lintel ring
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; K.box(mat, Math.sin(a) * R - R * 0.09, Math.sin(a) * R + R * 0.09, yb, yb + hC + R * 0.22, Math.cos(a) * R - R * 0.09, Math.cos(a) * R + R * 0.09); }
      K.put(mat, latheFlat([[R * 1.06, yb + hC], [R * 1.06, yb + hC + R * 0.22], [R * 0.85, yb + hC + R * 0.22], [R * 0.85, yb + hC]], 8));
    } else {
    // columns at the corners of the octagon
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + k * Math.PI / 4, cx = Math.sin(a) * R, cz = Math.cos(a) * R;
      K.box(mat, cx - R * 0.1, cx + R * 0.1, yb, yb + R * 0.12, cz - R * 0.1, cz + R * 0.1);
      K.put(mat, new THREE.CylinderGeometry(R * 0.06, R * 0.075, hC - R * 0.2, lite ? 6 : 8), { pos: [cx, yb + R * 0.12 + (hC - R * 0.2) / 2, cz] });
      K.put(mat, latheFlat([[R * 0.06, 0], [R * 0.13, R * 0.08], [R * 0.13, R * 0.1], [0, R * 0.1]], 6), { pos: [cx, yb + hC - R * 0.1, cz] });
    }
    // arches between the columns (a thin U-frame per side) and the lintel band over them
    const side = 2 * R * Math.sin(Math.PI / 8), dS = R * Math.cos(Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k + 1) * Math.PI / 4;
      const ow = side - R * 0.17;
      K.put(mat, extrude(uFrameShape(side * 1.04, hC + R * 0.22, ow, hC * 0.6, ow * 0.55, low ? 4 : lite ? 6 : 10), R * 0.1).translate(0, yb, R * 0.05), { pos: [Math.sin(a) * dS, 0, Math.cos(a) * dS], ry: a });
    }
    }
    // chajja: a thin sloping eave on brackets, then the drum
    const yc = yb + hC + R * 0.22;
    K.put(mat, latheFlat([[R * 0.95, yc + R * 0.06], [R * 1.5, yc - R * 0.14], [R * 1.5, yc - R * 0.2], [R * 1.0, yc - R * 0.04]], s8));
    if (!lite) for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 + k * Math.PI / 4;
      K.put(mat, new THREE.BoxGeometry(R * 0.09, R * 0.22, R * 0.4).rotateX(0.5), { pos: [Math.sin(a) * R * 1.12, yc - R * 0.18, Math.cos(a) * R * 1.12], ry: a });
    }
    const yd = yc + R * 0.06;
    K.put(mat, latheFlat([[R * 0.98, yd], [R * 0.98, yd + R * 0.22], [R * 1.04, yd + R * 0.26], [R * 1.04, yd + R * 0.32], [R * 0.9, yd + R * 0.34]], s8));
    // the dome (the great dome's profile, scaled), lotus crown and finial
    const ds = (R * 0.9) / 12, y2 = yd + R * 0.34;
    const prof = smoothProfile(DOME_CTRL, low ? 10 : lite ? 14 : 22).map(([r, yy]) => [r * ds, y2 + yy * ds * 0.78]);
    K.put(domeMat, lathe(prof, low ? 12 : lite ? 16 : 28));
    const yt = y2 + 26.3 * ds * 0.78;
    K.put(domeMat, lathe([[R * 0.3, yt - R * 0.12], [R * 0.36, yt - R * 0.06], [R * 0.26, yt + R * 0.04], [R * 0.1, yt + R * 0.1]], lite ? 8 : 12));
    K.put('tajGold', lathe([[R * 0.09, 0], [R * 0.15, R * 0.07], [R * 0.08, R * 0.14], [R * 0.12, R * 0.2], [R * 0.05, R * 0.28], [R * 0.035, R * 0.44], [0, R * 0.46]], 8), { pos: [0, yt + R * 0.08, 0] });
  });
}

// ------------------------------------------------------------------------------------------- dome, drum, finial
function domeAndDrum(K) {
  const lite = K.lite, seg = lite ? 48 : 96;
  // drum on its base, with a blind arcade bent round it, and its crowning cornice
  K.put(MW, lathe([[DR + 0.95, WT], [DR + 0.95, WT + 0.9], [DR + 0.65, WT + 1.1], [DR + 0.4, WT + 1.25], [DR + 0.3, WT + 1.3], [DR, WT + 1.3]], seg));
  K.put(MW, new THREE.CylinderGeometry(DR, DR, D0 - WT - 1.3, seg, 1, true), { pos: [0, (D0 + WT + 1.3) / 2, 0], ao: 0.82 });
  const nb = lite ? 16 : 24, pitch = 2 * Math.PI * DR / nb, ya = WT + 1.3, yt = D0 - 0.9;
  for (let i = 0; i < nb; i++) {
    const g = extrude(uFrameShape(pitch + 0.02, yt - ya, pitch * 0.62, 3.0, pitch * 0.62 * 0.6, lite ? 6 : 10), 0.24);
    g.translate(0, 0, 0.24);
    const b = bendRound(g, DR);
    K.put(MW, b, { ry: (i / nb) * Math.PI * 2, pos: [0, ya, 0] });
  }
  K.put(MW, lathe([[DR, yt], [DR + 0.32, yt + 0.12], [DR + 0.32, yt + 0.3], [DR + 0.6, yt + 0.5], [DR + 0.72, yt + 0.7], [DR + 0.5, yt + 0.85], [DR + 0.2, yt + 0.9], [DR, yt + 0.9]], seg));
  // the onion dome: 28.5 m across at its widest, 26 m high
  const prof = smoothProfile(DOME_CTRL, lite ? 30 : 56).map(([r, y]) => [r, D0 + y]);
  K.put(MW, lathe(prof, seg));
  K.put(MW, lathe([[DR + 0.05, D0 - 0.05], [DR + 0.42, D0 + 0.1], [DR + 0.45, D0 + 0.35], [DR + 0.62, D0 + 0.6]], seg));
  // inverted lotus crown: 16 carved petals hanging from the top
  const top = D0 + 26.3;
  const rAt = (r) => {
    // point on the profile's upper part at radius r, with its outward normal
    for (let i = prof.length - 1; i > 0; i--) {
      const [r1, y1] = prof[i], [r0, y0] = prof[i - 1];
      if (r >= r1 && r <= r0) { const t = (r - r1) / (r0 - r1 || 1), y = y1 + (y0 - y1) * t; const dr = r0 - r1, dy = y0 - y1, l = Math.hypot(dr, dy); return [r, y, -dy / l, dr / l]; }
    }
    return [r, top, 0, 1];
  };
  const NP = 16, nt = lite ? 4 : 8, ns = lite ? 5 : 10;
  for (let p = 0; p < NP; p++) {
    const phi = (p / NP) * Math.PI * 2, P = [], I = [];
    for (let j = 0; j <= ns; j++) {
      const s = j / ns, half = (Math.PI / NP) * 0.99 * Math.pow(Math.sin(Math.PI * (0.22 + 0.78 * s)), 0.5);
      for (let i = 0; i <= nt; i++) {
        const t = (i / nt) * 2 - 1;
        const [r, y, nr, ny] = rAt(1.2 + s * 5.6);
        // a cushion-like petal with a raised rim and a midrib, its tip lifting a little off the dome
        const h = 0.08 + 0.4 * (1 - t * t) * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, s * 1.15))) + 0.08 * Math.exp(-t * t * 30) + 0.1 * Math.exp(-Math.pow((Math.abs(t) - 0.85) * 7, 2)) + 0.22 * s * s;
        const rr = r + nr * h, yy = y + ny * h, a = phi + t * half;
        P.push(Math.sin(a) * rr, yy, Math.cos(a) * rr);
      }
    }
    for (let j = 0; j < ns; j++) for (let i = 0; i < nt; i++) { const a = j * (nt + 1) + i, b = a + nt + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
    // wind the petals outwards: test one triangle against the dome's outward normal there
    const [, , nr0, ny0] = rAt(1.1 + 0.5 * 5.1), v0 = Math.floor(ns / 2) * (nt + 1) + Math.floor(nt / 2), v1 = v0 + 1, v2 = v0 + nt + 1;
    const e1 = [0, 1, 2].map((k) => P[v1 * 3 + k] - P[v0 * 3 + k]), e2 = [0, 1, 2].map((k) => P[v2 * 3 + k] - P[v0 * 3 + k]);
    const cn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const out = [Math.sin(phi) * nr0, ny0, Math.cos(phi) * nr0];
    if (cn[0] * out[0] + cn[1] * out[1] + cn[2] * out[2] < 0) for (let k = 0; k < I.length; k += 3) { const t = I[k + 1]; I[k + 1] = I[k + 2]; I[k + 2] = t; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
    const AO = new Float32Array(P.length / 3); for (let j = 0; j <= ns; j++) for (let i = 0; i <= nt; i++) { const t = (i / nt) * 2 - 1; AO[j * (nt + 1) + i] = 1 - 0.3 * Math.pow(Math.abs(t), 3); }
    g.setAttribute('ao', new THREE.BufferAttribute(AO, 1));
    const gn = g.toNonIndexed(), aoA = gn.attributes.ao;
    let vi = 0; K.put(MW, gn, { ao: () => aoA.getX(vi++) });
  }
  // collar, the lotus bud and the gilded finial: kalasha bulbs, a rod and the crescent
  K.put(MW, lathe([[1.75, top - 0.75], [1.95, top - 0.45], [1.7, top - 0.15], [1.25, top + 0.1], [0.95, top + 0.35], [1.05, top + 0.55], [0.85, top + 0.7]], lite ? 16 : 32));
  const f0 = top + 0.7;
  K.put('tajGold', lathe([[0.85, 0], [1.1, 0.2], [1.05, 0.45], [0.58, 0.7], [0.52, 1.0], [0.95, 1.45], [1.12, 1.95], [0.98, 2.45], [0.5, 2.85], [0.4, 3.15], [0.82, 3.6], [0.88, 3.95], [0.72, 4.3], [0.34, 4.6], [0.28, 4.85], [0.52, 5.15], [0.48, 5.45], [0.24, 5.75], [0.15, 6.25], [0.13, 7.0], [0, 7.05]], lite ? 12 : 20), { pos: [0, f0, 0] });
  const arc = Math.PI * 1.2, cr = 0.78;
  K.put('tajGold', new THREE.TorusGeometry(cr, 0.1, 6, lite ? 12 : 24, arc).rotateZ(-Math.PI / 2 - arc / 2), { pos: [0, f0 + 6.6 + cr, 0] });
  K.put('tajGold', new THREE.ConeGeometry(0.1, 1.2, 6), { pos: [0, f0 + 7.5, 0] });
}

// ------------------------------------------------------------------------------------------- minaret
function balcony(K, y, rS, rail) {
  const seg = K.lite ? 16 : 32, rO = rS + 1.35;
  K.put(MW, lathe([[rS, y - 1.4], [rS + 0.12, y - 1.25], [rS + 0.3, y - 1.0], [rS + 0.6, y - 0.62], [rS + 0.95, y - 0.3], [rO - 0.05, y - 0.08], [rO + 0.05, y], [rO + 0.05, y + 0.32], [rS, y + 0.32]], seg), { ao: (x, yy) => 0.8 + 0.2 * sst(y - 1.4, y, yy) });
  const nbk = K.lite ? 8 : 20;
  for (let i = 0; i < nbk; i++) {
    const a = (i / nbk) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    K.put(MW, new THREE.BoxGeometry(0.2, 0.5, 0.5), { pos: [s * (rS + 0.3), y - 1.0, c * (rS + 0.3)], ry: a, ao: 0.8 });
    K.put(MW, new THREE.BoxGeometry(0.2, 0.42, 0.75), { pos: [s * (rS + 0.75), y - 0.45, c * (rS + 0.75)], ry: a, ao: 0.85 });
  }
  if (!rail) return;
  const hr = 1.0, rr = rO - 0.12;
  K.put('tajBalus', new THREE.CylinderGeometry(rr, rr, hr, K.lite ? 20 : 48, 1, true), { pos: [0, y + 0.32 + hr / 2, 0], uv1: 'own', uvs: [Math.round(2 * Math.PI * rr / 0.9), 1] });
  K.put(MW, new THREE.TorusGeometry(rr, 0.09, K.lite ? 4 : 5, K.lite ? 16 : 40).rotateX(Math.PI / 2), { pos: [0, y + 0.32 + hr + 0.03, 0] });
  if (!K.lite) for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; K.put(MW, new THREE.BoxGeometry(0.16, hr, 0.16), { pos: [Math.sin(a) * rr, y + 0.32 + hr / 2, Math.cos(a) * rr], ry: a }); }
}
function minaret(K, mx, mz) {
  const o = new THREE.Vector3(mx, 0, mz).normalize(), tilt = 0.009;
  const m = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(o.z, 0, -o.x), tilt).setPosition(mx, Y0, mz);
  K.atM(m, () => {
    const seg = K.lite ? 16 : 32;
    K.put(MW, latheFlat([[4.4, 0], [4.4, 0.3], [4.2, 0.45], [4.2, 1.45], [4.35, 1.55], [4.35, 1.75], [3.5, 1.9], [3.2, 1.95], [0, 1.95]], 8));
    // three stages clad in inlaid slabs, each on a moulded foot
    const stages = [[1.95, 12.6, 2.95, 2.78], [14.1, 23.9, 2.68, 2.52], [25.4, 32.4, 2.42, 2.3]];
    stages.forEach(([y0, y1, r0, r1]) => {
      K.put('tajMinar', new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true), { pos: [0, (y0 + y1) / 2, 0], uv1: 'own', uvs: [16, (y1 - y0) / 4] });
      K.put(MW, lathe([[r0 + 0.3, y0 - 0.02], [r0 + 0.3, y0 + 0.18], [r0 + 0.12, y0 + 0.32], [r0, y0 + 0.42]], seg));
      K.put(MW, lathe([[r1, y1 - 0.5], [r1 + 0.08, y1 - 0.42], [r1 + 0.08, y1 - 0.3], [r1, y1 - 0.22]], seg));
    });
    balcony(K, 14.1, 2.78, true);
    balcony(K, 25.4, 2.52, true);
    balcony(K, 33.8, 2.3, true);
    // the stub between the last stage and the top gallery, then the crowning chhatri
    K.put(MW, new THREE.CylinderGeometry(2.3, 2.3, 1.4, seg, 1, true), { pos: [0, 33.1, 0] });
    chhatri(K, 0, 34.12, 0, 1.95, { base: false, low: K.lite });
  });
}

// ------------------------------------------------------------------------------------------- plinth
function plinth(K) {
  const H = 47.5, lite = K.lite;
  K.box(MW, -H + 0.6, H - 0.6, 0, Y0, -H, H - 0.6);
  K.put(MW, ringMould([[H, H], [H, -H], [-H, -H], [-H, H]], [[0.32, 0], [0.32, 0.3], [0.18, 0.42], [0.06, 0.56], [0, 0.65]]));
  K.put(MW, ringMould([[H, H], [H, -H], [-H, -H], [-H, H]], [[0, 5.72], [0.08, 5.82], [0.08, 5.98], [0.26, 6.12], [0.4, 6.38], [0.4, Y0], [-0.62, Y0]]));
  const N = lite ? 15 : 25, w = 2.45, sp = 2.55, ri = 1.45, y0 = 1.0;
  // three faces carry the arcade (the north one is never seen); each niche in a stepped frame
  for (const [ry, len, cz] of [[0, 2 * H, 0], [Math.PI / 2, 2 * H - 0.6, 0.3], [-Math.PI / 2, 2 * H - 0.6, -0.3]]) {
    K.at(0, 0, 0, ry, () => {
      
      const x0 = -len / 2 + cz, x1 = len / 2 + cz, xs = [];
      for (let i = 0; i < N; i++) xs.push(x0 + (i + 0.5) * (len / N));
      const ow = w + 0.36;
      const holesO = xs.map((x) => ({ x, w: ow, y0: y0 - 0.18, spring: sp + 0.18, rise: ri + 0.2 }));
      const holesI = xs.map((x) => ({ x, w, y0, spring: sp, rise: ri }));
      if (!lite) K.put(MW, extrude(arcadeShape(x0, x1, 0.65, 5.72, holesO, 10), 0.14).translate(0, 0, H));
      const tI = lite ? 0.6 : 0.46;
      K.put(MW, extrude(arcadeShape(x0, x1, 0.65, 5.72, holesI, lite ? 6 : 10), tI).translate(0, 0, H - 0.6 + tI), { ao: (x, y, z) => 1 - 0.25 * sst(H - 0.2, H - 0.6, z) });
      for (const x of xs) {
        if (lite) K.put(MW, new THREE.ShapeGeometry(archPanelShape(w, sp, ri, 6, y0)).translate(x, 0, H - 0.6), { ao: 0.62 });
        else K.at(x, y0, H - 0.6, 0, () => K.put(MW, nicheShell(w, sp, ri, 0.5, { back: 0.5, n: 8 }), { ao: (xx, y, z) => Math.max(0.5, 0.92 - 0.5 * (-z) - 0.12 * sst(sp, sp + ri, y)) }));
        if (!lite && ry === 0) K.put('tajBlack', new THREE.ShapeGeometry(archBandShape(ow, sp + 0.18, ri + 0.2, 0.08, 8, y0 - 0.18)).translate(x, 0, H + 0.015));
      }
    });
  }
}

// ------------------------------------------------------------------------------------------- mosque / jawab
function mosque(K, cx, ry) {
  const R = 'tajRed', lite = K.lite;
  K.at(cx, 0, 0, ry, () => {
    // platform, hall, roof
    K.box(R, -29.5, 29.5, 0, 3.0, -12.5, 12.5);
    K.put(MW, ringMould([[29.5, 12.5], [29.5, -12.5], [-29.5, -12.5], [-29.5, 12.5]], [[0, 2.7], [0.15, 2.8], [0.15, 3.0], [-0.3, 3.0]]));
    K.box(R, -26.5, 26.5, 3, 15.4, -10.5, 4.3);
    for (const sx of [-1, 1]) K.box(R, sx * 26.5 - 0.3, sx * 26.5 + 0.3, 3, 15.4, 4.3, 8.0);
    K.sec = 'm_pish';
    // central pishtaq: stepped frame, deep half-domed iwan, white-marble outlines, parapet with kanguras
    K.at(0, 3, 8.6, 0, () => {
      const w = 8.6, sp = 7.4, ri = 4.6, top = 15.6;
      K.put(R, extrude(uFrameShape(15, top, w + 0.6, sp, ri + 0.32, 12), 0.3));
      K.put(R, extrude(uFrameShape(15, top, w, sp, ri, 12), 1.0).translate(0, 0, -0.3), { ao: (x, y, z) => 1 - 0.25 * sst(0.3, 1.3, -z) });
      K.at(0, 0, -1.3, 0, () => K.put(R, nicheShell(w, sp, ri, 2.8, { back: 0.5, n: 12 }), { ao: (x, y, z) => Math.max(0.45, 0.95 - 0.3 * (-z / 2.8) - 0.15 * sst(sp, sp + ri, y)) }));
      K.at(0, 0, -4.07, 0, () => K.put('tajDark', new THREE.ShapeGeometry(archPanelShape(3.0, 4.2, 1.6, 10, 0.03)), { ao: 0.9 }));
      K.put(MW, new THREE.ShapeGeometry(archBandShape(w + 0.6, sp, ri + 0.32, 0.16, 12, 0)).translate(0, 0, 0.02));
      for (const sx of [-1, 1]) for (const [a, b, y0, y1] of [[5.5, 7.1, 0.5, top - 1.5], [-7.0, 7.0, top - 1.4, top - 0.4]]) {
        if (a < 0 && sx > 0) continue;
        const x0 = a < 0 ? a : sx < 0 ? -b : a, x1 = a < 0 ? b : sx < 0 ? -a : b;
        K.box(MW, x0, x0 + 0.12, y0, y1, 0, 0.03); K.box(MW, x1 - 0.12, x1, y0, y1, 0, 0.03);
        K.box(MW, x0, x1, y0, y0 + 0.12, 0, 0.03); K.box(MW, x0, x1, y1 - 0.12, y1, 0, 0.03);
      }
      K.box(R, -7.6, 7.6, top, top + 0.4, -1.4, 0.3);
      for (let i = 0; i < (lite ? 10 : 16); i++) { const x = -7.1 + (i + 0.5) * (14.2 / (lite ? 10 : 16)); K.put(R, merlon(0.5, 0.75), { pos: [x, top + 0.4, -0.2] }); }
      for (const sx of [-1, 1]) {
        K.put(R, new THREE.CylinderGeometry(0.42, 0.45, top + 1.5, 8), { pos: [sx * 7.5, (top + 1.5) / 2, 0] });
        K.put(MW, lathe([[0.45, 0], [0.6, 0.3], [0.48, 0.8], [0.2, 1.3], [0.05, 1.5]], 10), { pos: [sx * 7.5, top + 1.5, 0] });
        K.put('tajGold', new THREE.ConeGeometry(0.05, 0.6, 5), { pos: [sx * 7.5, top + 3.2, 0] });
      }
    });
    K.sec = 'm_bays';
    // two arched bays on each side under a chhajja and a kangura parapet
    for (const sx of [-1, 1]) for (const bx of [12.25, 21.75]) {
      K.at(sx * bx, 3, 7.4 + 0.6, 0, () => unit(K, { W: 9.5, H: 12.4, w: 5.8, spring: 6.0, rise: 3.3, T: 0.6, step: 0.25, D: 1.8, back: 0.5, mat: R, line: MW, door: true, lw: 0.12, bi: 0.4 }));
    }
    K.at(0, 0, 8.0, 0, () => {
      for (const sx of [-1, 1]) {
        K.put(R, mouldStrip(19.2, [[0, 13.9], [0.25, 14.0], [1.0, 13.75], [1.0, 13.62], [0.2, 13.85], [0, 13.8]]).translate(sx * 17.1, 0, 0));
        const nm = lite ? 12 : 22;
        for (let i = 0; i < nm; i++) K.put(R, merlon(0.48, 0.7), { pos: [sx * (7.8 + (i + 0.5) * (18.6 / nm)), 15.4, -0.25] });
      }
    });
    K.box(R, -26.8, 26.8, 15.1, 15.4, -10.8, 8.0);
    K.sec = 'm_domes';
    // three marble domes on red drums
    for (const [dx, r] of [[0, 5.0], [-14.5, 3.7], [14.5, 3.7]]) {
      K.put(R, new THREE.CylinderGeometry(r, r, 2.6, lite ? 16 : 32, 1, true), { pos: [dx, 15.4 + 1.3, -1.2] });
      K.put(MW, lathe([[r + 0.25, 17.9], [r + 0.25, 18.1], [r, 18.2]], lite ? 16 : 32), { pos: [dx, 0, -1.2] });
      const ds = r / 12, prof = smoothProfile(DOME_CTRL, lite ? 14 : 24).map(([rr, yy]) => [rr * ds, 18.0 + yy * ds]);
      K.put(MW, lathe(prof, lite ? 16 : 32), { pos: [dx, 0, -1.2] });
      const yt = 18.0 + 26.3 * ds;
      K.put(MW, lathe([[r * 0.16, yt - r * 0.06], [r * 0.2, yt], [r * 0.12, yt + r * 0.08], [r * 0.05, yt + r * 0.12]], 10), { pos: [dx, 0, -1.2] });
      K.put('tajGold', lathe([[r * 0.06, 0], [r * 0.1, r * 0.08], [r * 0.05, r * 0.16], [r * 0.08, r * 0.24], [r * 0.03, r * 0.36], [r * 0.02, r * 0.62], [0, r * 0.65]], 8), { pos: [dx, yt + r * 0.1, -1.2] });
    }
    K.sec = 'm_towers';
    // octagonal corner towers with chhatris
    for (const [tx, tz] of [[-27.2, 7.6], [27.2, 7.6], [-27.2, -10.6], [27.2, -10.6]]) {
      K.put(R, latheFlat([[1.6, 3], [1.6, 3.6], [1.35, 3.8], [1.25, 15.6], [1.5, 15.8], [1.5, 16.2], [1.3, 16.4]], 8), { pos: [tx, 0, tz] });
      for (const y of [7.0, 11.2]) K.put(MW, latheFlat([[1.27, y], [1.38, y + 0.08], [1.38, y + 0.2], [1.27, y + 0.28]], 8), { pos: [tx, 0, tz] });
      chhatri(K, tx, 16.4, tz, 1.2, { base: false, mat: R, low: true });
    }
  });
}
// a kangura (stepped, leaf-like merlon) w wide, h high, standing on y = 0
function merlon(w, h) {
  const s = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h * 0.45), new THREE.Vector2(w * 0.2, h * 0.75), new THREE.Vector2(0, h), new THREE.Vector2(-w * 0.2, h * 0.75), new THREE.Vector2(-w / 2, h * 0.45)]);
  return extrude(s, 0.3).translate(0, 0, 0.15);
}

// ------------------------------------------------------------------------------------------- assembly
export function buildTaj(P, M, { lite = false } = {}) {
  if (M) makeTajMaterials(M, lite);
  const K = new Kit(P, lite);
  K.stats = {}; K.sec = 'plinth';
  plinth(K);
  K.sec = 'core';
  // the mausoleum's core (hidden behind the facades) and the roof terrace over it
  const oct = (h, c) => new THREE.Shape([[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]].map(([a, b]) => new THREE.Vector2(a, b)));
  const d = 7.3, core = new THREE.ExtrudeGeometry(oct(HS - d, CH - d * (2 - Math.SQRT2)), { depth: WT - Y0, bevelEnabled: false });
  core.rotateX(-Math.PI / 2); core.translate(0, Y0, 0);
  K.put(MW, core, { ao: 0.7 });
  const roof = new THREE.ExtrudeGeometry(oct(HS - 0.72, CH - 0.72 * (2 - Math.SQRT2)), { depth: 0.8, bevelEnabled: false });
  roof.rotateX(-Math.PI / 2); roof.translate(0, WT - 0.8, 0);
  K.put(MW, roof);
  for (let q = 0; q < 4; q++) { K.sec = 'facade' + q; K.cheap = lite && q !== 0; facade(K, q); }
  K.cheap = false;
  K.sec = 'dome'; domeAndDrum(K);
  K.sec = 'chhatris';
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) chhatri(K, x * 17.6, WT, z * 17.6, 3.3);
  K.sec = 'minarets';
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) minaret(K, x * 43.5, z * 43.5);
  K.sec = 'mosques';
  for (const sx of [-1, 1]) mosque(K, sx * 98, -sx * Math.PI / 2);
  buildTaj.tris = K.tris; buildTaj.stats = K.stats;
  return K.tris;
}
