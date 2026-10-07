// TO THE MOON AND MARS — the hero hardware, built to survive a close look in Explore from any side.
// Procedural PBR maps (canvas height fields → tangent-space normal maps, roughness maps; generated once and
// shared by every material set), and modelled detail where it makes a silhouette or casts a shadow:
//   Nike-Apache + rail launcher · Aryabhata · PSLV-XL + umbilical tower / launch pedestal ·
//   Chandrayaan-1 orbiter · Mars Orbiter Mission · Vikram lander · Pragyan rover.
// Every builder takes (M, { lite }) — lite drops radial segments and the smallest parts (≈1/3 of the triangles).
// No logos, flags or lettering. Units: metres.
import * as THREE from 'three';
import { rng, TAU } from '../../lib/math.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { V3, bake, merge, tint, lathe, box, cyl, rod, beam } from './isro-assets.js';

// ================================================================== procedural maps
const TEXC = new Map();
const once = (k, f) => { if (!TEXC.has(k)) TEXC.set(k, f()); return TEXC.get(k); };
const grey = (c, S, v = 128) => { const g = c.getContext('2d'); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, S, c.height); return g; };
// draw at the 9 wrap offsets (seamless tiles)
const wrap9 = (S, fn, H = S) => { for (const ox of [-S, 0, S]) for (const oy of [-H, 0, H]) fn(ox, oy); };

// height canvas (red channel) → tangent-space normal map (u = canvas x, v = canvas −y)
function toNormal(c, k = 3) {
  const w = c.width, h = c.height, s = c.getContext('2d').getImageData(0, 0, w, h).data;
  const o = mkCanvas(w, h), og = o.getContext('2d'), im = og.createImageData(w, h), d = im.data;
  for (let y = 0; y < h; y++) {
    const ya = ((y - 1 + h) % h) * w, yb = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const xa = (x - 1 + w) % w, xb = (x + 1) % w;
      const dx = (s[(yr + xb) * 4] - s[(yr + xa) * 4]) * (k / 255);
      const dy = (s[(yb + x) * 4] - s[(ya + x) * 4]) * (k / 255);
      const l = Math.hypot(dx, dy, 1), i = (yr + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
    }
  }
  og.putImageData(im, 0, 0);
  return toTexture(o, { srgb: false, repeat: true });
}
const lin = (c) => toTexture(c, { srgb: false, repeat: true });
const col = (c) => toTexture(c, { repeat: true });
// a rivet / screw head: a small raised dome on the height map
function rivet(g, x, y, r, up = 70) {
  const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,255,255,${up / 255})`); gr.addColorStop(0.7, `rgba(255,255,255,${up / 400})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// painted launch-vehicle skin, one tile: circumferential joints with double rivet rows, stringer lines, access
// panels with screws, oil-canning, orange peel; grime streaks running down, chips at the joints.
function skinMaps(S) {
  return once(`skin${S}`, () => {
    const r = rng(41), k = S / 1024;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 242);
    const rc = mkCanvas(S), ro = grey(rc, S, 118);
    // oil-canning (soft dents between frames)
    for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = (60 + r() * 160) * k, l = r() > 0.5 ? 255 : 0;
      wrap9(S, (ox, oy) => { const gr = h.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, `rgba(${l},${l},${l},0.06)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = gr; h.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); }); }
    // panel tone variation (albedo / roughness)
    for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, w = (120 + r() * 400) * k, hh = (80 + r() * 300) * k, l = 236 + r() * 14, q = 105 + r() * 30;
      wrap9(S, (ox, oy) => { a.fillStyle = `rgba(${l},${l},${l - 3},0.5)`; a.fillRect(x + ox, y + oy, w, hh); ro.fillStyle = `rgba(${q},${q},${q},0.5)`; ro.fillRect(x + ox, y + oy, w, hh); }); }
    // circumferential joints (y = 0, S/2) with two rivet rows; stringers (x = 0, S/2, S/4·odd dashed)
    for (const y of [0, S / 2]) {
      for (const oy of [-S, 0, S]) {
        h.fillStyle = 'rgb(60,60,60)'; h.fillRect(0, y + oy - 1.5 * k, S, 3 * k);
        h.fillStyle = 'rgb(170,170,170)'; h.fillRect(0, y + oy + 1.5 * k, S, 10 * k);   // doubler strap
        a.fillStyle = 'rgba(150,148,140,0.5)'; a.fillRect(0, y + oy - 1.5 * k, S, 3 * k);
      }
      for (let x = 0; x < S; x += 11 * k) for (const dy of [5, 11]) wrap9(S, (ox, oy) => rivet(h, x + ox, y + oy + dy * k, 2.2 * k, 60));
      for (let x = 0; x < S; x += 11 * k) wrap9(S, (ox, oy) => rivet(h, x + ox + 5 * k, y + oy - 6 * k, 2.2 * k, 60));
    }
    for (const x of [0, S / 2]) {
      for (const ox of [-S, 0, S]) { h.fillStyle = 'rgb(84,84,84)'; h.fillRect(x + ox - 1 * k, 0, 2 * k, S); }
      for (let y = 0; y < S; y += 14 * k) wrap9(S, (ox, oy) => { rivet(h, x + ox + 5 * k, y + oy, 2 * k, 55); rivet(h, x + ox - 5 * k, y + oy, 2 * k, 55); });
    }
    // access panels: grooved outlines, screws along the edges, a slightly different paint
    for (let i = 0; i < 9; i++) {
      const w = (50 + r() * 150) * k, hh = (40 + r() * 120) * k, x = r() * S, y = S * (r() > 0.5 ? 0.06 : 0.56) + r() * S * 0.3;
      const t = 220 + r() * 30;
      wrap9(S, (ox, oy) => {
        a.fillStyle = `rgba(${t},${t},${t - 4},0.35)`; a.fillRect(x + ox, y + oy, w, hh);
        h.strokeStyle = 'rgb(50,50,50)'; h.lineWidth = 2 * k; h.strokeRect(x + ox, y + oy, w, hh);
        h.fillStyle = 'rgba(255,255,255,0.08)'; h.fillRect(x + ox + 2 * k, y + oy + 2 * k, w - 4 * k, hh - 4 * k);
        for (let s = 6 * k; s < w - 3 * k; s += 16 * k) { rivet(h, x + ox + s, y + oy + 5 * k, 2.4 * k, 80); rivet(h, x + ox + s, y + oy + hh - 5 * k, 2.4 * k, 80); }
        for (let s = 6 * k; s < hh - 3 * k; s += 16 * k) { rivet(h, x + ox + 5 * k, y + oy + s, 2.4 * k, 80); rivet(h, x + ox + w - 5 * k, y + oy + s, 2.4 * k, 80); }
      });
    }
    // round hatches
    for (let i = 0; i < 3; i++) { const x = r() * S, y = r() * S, rad = (14 + r() * 18) * k;
      wrap9(S, (ox, oy) => { h.strokeStyle = 'rgb(50,50,50)'; h.lineWidth = 2 * k; h.beginPath(); h.arc(x + ox, y + oy, rad, 0, TAU); h.stroke();
        for (let j = 0; j < 8; j++) rivet(h, x + ox + Math.cos(j * TAU / 8) * (rad - 5 * k), y + oy + Math.sin(j * TAU / 8) * (rad - 5 * k), 2 * k, 80); }); }
    // orange peel
    for (let i = 0; i < 22000 * k * k; i++) { const l = r() > 0.5 ? 255 : 0; h.fillStyle = `rgba(${l},${l},${l},0.05)`; h.fillRect(r() * S, r() * S, 2 * k, 2 * k); }
    // grime streaks (running down: canvas +y is down the vehicle), chips at the joints
    for (let i = 0; i < 260; i++) { const x = r() * S, y = r() * S, len = (30 + r() * 260) * k, l = 120 + r() * 60, al = 0.04 + r() * 0.08;
      wrap9(S, (ox, oy) => { const gr = a.createLinearGradient(0, y + oy, 0, y + oy + len); gr.addColorStop(0, `rgba(${l},${l - 4},${l - 10},${al})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(x + ox, y + oy, (1 + r() * 3) * k, len);
        ro.fillStyle = `rgba(170,170,170,${al})`; ro.fillRect(x + ox, y + oy, 2 * k, len); }); }
    for (let i = 0; i < 500; i++) { const x = r() * S, y = (r() > 0.5 ? 0 : S / 2) + (r() - 0.5) * 30 * k, s = (1 + r() * 3) * k;
      wrap9(S, (ox, oy) => { a.fillStyle = 'rgba(150,150,150,0.8)'; a.fillRect(x + ox, y + oy, s, s * (0.6 + r())); ro.fillStyle = 'rgba(70,70,70,0.8)'; ro.fillRect(x + ox, y + oy, s, s); }); }
    return { map: col(ac), normalMap: toNormal(hc, 2.2), roughnessMap: lin(rc) };
  });
}

// multi-layer insulation: crumpled facets, sharp creases, quilting tie-points, taped seams at the tile edges
function foilMaps(S) {
  return once(`foil${S}`, () => {
    const r = rng(29), k = S / 1024;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 236);
    const rc = mkCanvas(S), ro = grey(rc, S, 98);
    // facets
    for (let i = 0; i < 4200; i++) {
      const x = r() * S, y = r() * S, s = (10 + r() * 46) * k, l = 100 + r() * 56, la = 228 + r() * 27, q = 84 + r() * 30;
      const pts = Array.from({ length: 3 + Math.floor(r() * 2) }, () => [(r() - 0.5) * s, (r() - 0.5) * s]);
      wrap9(S, (ox, oy) => {
        for (const [g2, c2, al] of [[h, `rgb(${l},${l},${l})`, 0.45], [a, `rgb(${la},${la - 4},${la - 12})`, 0.3], [ro, `rgb(${q},${q},${q})`, 0.35]]) {
          g2.globalAlpha = al; g2.fillStyle = c2; g2.beginPath(); g2.moveTo(x + ox + pts[0][0], y + oy + pts[0][1]); for (const p of pts) g2.lineTo(x + ox + p[0], y + oy + p[1]); g2.closePath(); g2.fill(); g2.globalAlpha = 1;
        }
      });
    }
    // creases: a light / dark line pair (a sharp ridge)
    for (let i = 0; i < 900; i++) {
      const x = r() * S, y = r() * S, an = r() * TAU, len = (16 + r() * 110) * k, bend = (r() - 0.5) * 0.8;
      wrap9(S, (ox, oy) => {
        for (const [dd, c2, w] of [[0, 'rgba(255,255,255,0.55)', 1.4], [1.6, 'rgba(0,0,0,0.5)', 1.4]]) {
          h.strokeStyle = c2; h.lineWidth = w * k; h.beginPath();
          const nx = -Math.sin(an) * dd * k, ny = Math.cos(an) * dd * k;
          h.moveTo(x + ox + nx, y + oy + ny); h.quadraticCurveTo(x + ox + nx + Math.cos(an + bend) * len * 0.5, y + oy + ny + Math.sin(an + bend) * len * 0.5, x + ox + nx + Math.cos(an) * len, y + oy + ny + Math.sin(an) * len); h.stroke();
        }
        a.strokeStyle = r() > 0.5 ? 'rgba(255,255,240,0.35)' : 'rgba(120,96,60,0.25)'; a.lineWidth = 1.2 * k; a.beginPath(); a.moveTo(x + ox, y + oy); a.lineTo(x + ox + Math.cos(an) * len, y + oy + Math.sin(an) * len); a.stroke();
      });
    }
    // taped seams on the tile edges (raised, matt, slightly darker)
    for (const ox of [-S, 0, S]) for (const [x, y, w, hh] of [[0, -10 * k, S, 20 * k], [-10 * k, 0, 20 * k, S]]) {
      for (const oy of [-S, 0, S]) {
        h.fillStyle = 'rgba(205,205,205,0.9)'; h.fillRect(x + ox, y + oy, w, hh);
        a.fillStyle = 'rgba(196,186,160,0.85)'; a.fillRect(x + ox, y + oy, w, hh);
        ro.fillStyle = 'rgba(150,150,150,0.9)'; ro.fillRect(x + ox, y + oy, w, hh);
      }
    }
    // quilting tie points (dimples with a small button)
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = (i + 0.5) * S / 4 + (r() - 0.5) * 8 * k, y = (j + 0.5) * S / 4 + (r() - 0.5) * 8 * k;
      const gr = h.createRadialGradient(x, y, 0, x, y, 26 * k); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); h.fillStyle = gr; h.fillRect(x - 26 * k, y - 26 * k, 52 * k, 52 * k);
      rivet(h, x, y, 5 * k, 120); a.fillStyle = 'rgba(70,64,56,0.8)'; a.beginPath(); a.arc(x, y, 4 * k, 0, TAU); a.fill();
    }
    return { map: col(ac), normalMap: toNormal(hc, 4), roughnessMap: lin(rc) };
  });
}

// solar cells: pseudo-square cells under cover glass, two busbars and fine fingers, silver interconnects
function cellMaps(S, n = 8) {
  return once(`cells${S}`, () => {
    const r = rng(6), c = S / n, k = S / 1024;
    const hc = mkCanvas(S), h = grey(hc, S, 110);
    const ac = mkCanvas(S), a = grey(ac, S, 0);
    const rc = mkCanvas(S), ro = grey(rc, S, 150);
    a.fillStyle = '#a7a59c'; a.fillRect(0, 0, S, S);
    const g = 3 * k, cut = c * 0.12;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * c + g, y = j * c + g, w = c - 2 * g, l = r() * 14;
      const path = (g2) => { g2.beginPath(); g2.moveTo(x + cut, y); g2.lineTo(x + w - cut, y); g2.lineTo(x + w, y + cut); g2.lineTo(x + w, y + w - cut); g2.lineTo(x + w - cut, y + w); g2.lineTo(x + cut, y + w); g2.lineTo(x, y + w - cut); g2.lineTo(x, y + cut); g2.closePath(); };
      a.fillStyle = `rgb(${18 + l},${26 + l},${66 + l * 1.6})`; path(a); a.fill();
      h.fillStyle = 'rgb(150,150,150)'; path(h); h.fill();
      ro.fillStyle = `rgb(${30 + r() * 20},${30},${30})`; path(ro); ro.fill();
      a.fillStyle = 'rgba(150,160,190,0.18)'; for (let f = 1; f < 22; f++) a.fillRect(x + 2, y + f * w / 22, w - 4, 0.8 * k);
      for (const bx of [0.33, 0.67]) { a.fillStyle = 'rgba(205,210,220,0.85)'; a.fillRect(x + w * bx - 1.6 * k, y, 3.2 * k, w); h.fillStyle = 'rgb(175,175,175)'; h.fillRect(x + w * bx - 1.6 * k, y, 3.2 * k, w); }
      // interconnect tabs into the gap
      for (const bx of [0.33, 0.67]) { a.fillStyle = '#d8dbe0'; a.fillRect(x + w * bx - 2.5 * k, y + w - 1, 5 * k, 2 * g + 2); }
    }
    return { map: col(ac), normalMap: toNormal(hc, 3), roughnessMap: lin(rc) };
  });
}

// the back of a solar panel: graphite face sheet, harness runs, white tie-down pads
function backMaps(S) {
  return once(`back${S}`, () => {
    const r = rng(8), k = S / 512;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 52);
    const rc = mkCanvas(S), ro = grey(rc, S, 150);
    for (let i = 0; i < 9000 * k * k; i++) { const l = 40 + r() * 30; a.fillStyle = `rgba(${l},${l},${l + 4},0.5)`; a.fillRect(r() * S, r() * S, 3 * k, 1 * k); }
    for (let i = 0; i < 3; i++) { const y = (i + 0.5) * S / 3; a.fillStyle = '#c9c4b8'; a.fillRect(0, y - 3 * k, S, 6 * k); h.fillStyle = 'rgb(200,200,200)'; h.fillRect(0, y - 3 * k, S, 6 * k); ro.fillStyle = 'rgb(200,200,200)'; ro.fillRect(0, y - 3 * k, S, 6 * k); }
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = (i + 0.5) * S / 4, y = (j + 0.25) * S / 4; a.fillStyle = '#e4e1da'; a.fillRect(x - 6 * k, y - 6 * k, 12 * k, 12 * k); rivet(h, x, y, 8 * k, 120); }
    return { map: col(ac), normalMap: toNormal(hc, 2), roughnessMap: lin(rc) };
  });
}

// a nozzle (u around, v exit 0 → throat 1): regenerative tubes and hoop bands, or a radiation-cooled skirt with heat tint
function nozzleMaps(W, kind) {
  return once(`noz${W}${kind}`, () => {
    const H = W * 4, r = rng(kind === 'regen' ? 3 : 5);
    const hc = mkCanvas(W, H), hg = hc.getContext('2d'), him = hg.createImageData(W, H), hd = him.data;
    const ac = mkCanvas(W, H), ag = ac.getContext('2d'), aim = ag.createImageData(W, H), ad = aim.data;
    const rc = mkCanvas(W, H), rg = rc.getContext('2d'), rim = rg.createImageData(W, H), rd = rim.data;
    const NT = 96, bands = kind === 'regen' ? [0.04, 0.3, 0.55, 0.8] : [0.03, 0.42, 0.97];
    for (let y = 0; y < H; y++) {
      const v = 1 - y / H;
      for (let x = 0; x < W; x++) {
        let ht = 128, al = [0, 0, 0], ro = 100;
        if (kind === 'regen') {
          const ph = (x / W) * NT % 1; ht = 128 + 70 * Math.sqrt(Math.max(0, 1 - ((ph - 0.5) * 2) ** 2)) - 35;
          const heat = Math.pow(v, 1.5), soot = (1 - v) * 0.5;
          al = [96 + 60 * heat - 40 * soot, 80 + 30 * heat - 36 * soot, 72 + 10 * heat - 30 * soot];   // copper-brown, straw near the throat, soot at the lip
          ro = 120 - 40 * heat;
        } else {
          const heat = Math.max(0, Math.min(1, (v - 0.35) / 0.65));
          const tinted = [182 - 50 * heat, 176 - 70 * heat, 170 - 20 * heat + 40 * Math.sin(heat * 3.1)];
          al = tinted; ro = 70 + 30 * heat; ht = 128;
        }
        for (const b of bands) { const d = Math.abs(v - b) * H; if (d < 6) { ht += 60 * (1 - d / 6); al = al.map((c) => c * 0.82); ro += 30; } }
        const n = (r() - 0.5) * 10;
        const i = (y * W + x) * 4;
        hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, ht)); hd[i + 3] = 255;
        ad[i] = Math.max(0, Math.min(255, al[0] + n)); ad[i + 1] = Math.max(0, Math.min(255, al[1] + n)); ad[i + 2] = Math.max(0, Math.min(255, al[2] + n)); ad[i + 3] = 255;
        rd[i] = rd[i + 1] = rd[i + 2] = Math.max(0, Math.min(255, ro + n * 2)); rd[i + 3] = 255;
      }
    }
    hg.putImageData(him, 0, 0); ag.putImageData(aim, 0, 0); rg.putImageData(rim, 0, 0);
    return { map: col(ac), normalMap: toNormal(hc, kind === 'regen' ? 2.5 : 3), roughnessMap: lin(rc) };
  });
}

// weathered steel (tower, launcher): mill scale, rust bleed down from the joints, pitting
function steelMaps(S) {
  return once(`steel${S}`, () => {
    const r = rng(17), k = S / 512;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 150);
    const rc = mkCanvas(S), ro = grey(rc, S, 140);
    for (let i = 0; i < 700; i++) { const x = r() * S, y = r() * S, s = (6 + r() * 40) * k, l = 130 + r() * 50, q = 110 + r() * 80;
      wrap9(S, (ox, oy) => { a.fillStyle = `rgba(${l},${l},${l + 2},0.25)`; a.fillRect(x + ox, y + oy, s, s * 0.6); ro.fillStyle = `rgba(${q},${q},${q},0.3)`; ro.fillRect(x + ox, y + oy, s, s * 0.6); }); }
    for (let i = 0; i < 160; i++) { const x = r() * S, y = r() * S, len = (20 + r() * 160) * k;
      wrap9(S, (ox, oy) => { const gr = a.createLinearGradient(0, y + oy, 0, y + oy + len); gr.addColorStop(0, 'rgba(120,60,30,0.4)'); gr.addColorStop(1, 'rgba(120,60,30,0)'); a.fillStyle = gr; a.fillRect(x + ox, y + oy, (2 + r() * 5) * k, len);
        ro.fillStyle = 'rgba(230,230,230,0.25)'; ro.fillRect(x + ox, y + oy, 3 * k, len); }); }
    for (let i = 0; i < 5000 * k * k; i++) { h.fillStyle = 'rgba(0,0,0,0.25)'; h.beginPath(); h.arc(r() * S, r() * S, (0.6 + r() * 1.5) * k, 0, TAU); h.fill(); }
    return { map: col(ac), normalMap: toNormal(hc, 2), roughnessMap: lin(rc) };
  });
}

// cast concrete: shuttering joints, aggregate, stains and scorch
function concreteMaps(S) {
  return once(`conc${S}`, () => {
    const r = rng(23), k = S / 512;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 150);
    for (let i = 0; i < 14000 * k * k; i++) { const l = r() > 0.5 ? 255 : 0, x = r() * S, y = r() * S; h.fillStyle = `rgba(${l},${l},${l},0.12)`; h.fillRect(x, y, 2 * k, 2 * k); a.fillStyle = `rgba(${l},${l},${l},0.06)`; a.fillRect(x, y, 2 * k, 2 * k); }
    for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = (20 + r() * 90) * k, l = r() > 0.6 ? 60 : 200;
      wrap9(S, (ox, oy) => { const gr = a.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, `rgba(${l},${l},${l - 6},0.12)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); a.fillStyle = gr; a.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); }); }
    for (const p of [0, S / 2]) { for (const o of [-S, 0, S]) { h.fillStyle = 'rgb(40,40,40)'; h.fillRect(p + o - 2 * k, 0, 4 * k, S); h.fillRect(0, p + o - 2 * k, S, 4 * k); a.fillStyle = 'rgba(60,60,60,0.5)'; a.fillRect(p + o - 1.5 * k, 0, 3 * k, S); a.fillRect(0, p + o - 1.5 * k, S, 3 * k); } }
    return { map: col(ac), normalMap: toNormal(hc, 1.5) };
  });
}

// reflector paint (lathe uv: u around, v rim → centre): petal seams with rivets, ring joints
function dishMaps(S) {
  return once(`dish${S}`, () => {
    const r = rng(12), k = S / 512, N = 12;
    const hc = mkCanvas(S), h = grey(hc, S);
    const ac = mkCanvas(S), a = grey(ac, S, 236);
    for (let i = 0; i < 6000 * k * k; i++) { const l = r() > 0.5 ? 255 : 0; a.fillStyle = `rgba(${l},${l},${l},0.03)`; a.fillRect(r() * S, r() * S, 3 * k, 3 * k); }
    for (let i = 0; i < N; i++) { const x = i * S / N; for (const o of [-S, 0, S]) { h.fillStyle = 'rgb(70,70,70)'; h.fillRect(x + o - 1.2 * k, 0, 2.4 * k, S); a.fillStyle = 'rgba(160,160,155,0.6)'; a.fillRect(x + o - 1 * k, 0, 2 * k, S); }
      for (let y = 6 * k; y < S; y += 12 * k) rivet(h, x + 4 * k, y, 1.6 * k, 60); }
    for (const y of [S * 0.38, S * 0.75]) { h.fillStyle = 'rgb(80,80,80)'; h.fillRect(0, y - 1.2 * k, S, 2.4 * k); for (let x = 0; x < S; x += 10 * k) rivet(h, x, y + 4 * k, 1.5 * k, 60); }
    return { map: col(ac), normalMap: toNormal(hc, 2) };
  });
}

// optical solar reflector radiator: a grid of small mirror tiles
function osrMaps(S) {
  return once(`osr${S}`, () => {
    const r = rng(19), n = 16, c = S / n, k = S / 512;
    const hc = mkCanvas(S), h = grey(hc, S, 80);
    const ac = mkCanvas(S), a = grey(ac, S, 120);
    const rc = mkCanvas(S), ro = grey(rc, S, 160);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const l = 225 + r() * 25; a.fillStyle = `rgb(${l},${l},${l + 2})`; a.fillRect(i * c + 1.5 * k, j * c + 1.5 * k, c - 3 * k, c - 3 * k);
      h.fillStyle = 'rgb(150,150,150)'; h.fillRect(i * c + 1.5 * k, j * c + 1.5 * k, c - 3 * k, c - 3 * k);
      const q = 10 + r() * 30; ro.fillStyle = `rgb(${q},${q},${q})`; ro.fillRect(i * c + 1.5 * k, j * c + 1.5 * k, c - 3 * k, c - 3 * k);
    }
    return { map: col(ac), normalMap: toNormal(hc, 2), roughnessMap: lin(rc) };
  });
}

// brushed aluminium: fine streaks along u (reads anisotropic under a key light)
function brushedMaps(S) {
  return once(`brush${S}`, () => {
    const r = rng(31);
    const hc = mkCanvas(S), h = grey(hc, S);
    const rc = mkCanvas(S), ro = grey(rc, S, 95);
    for (let i = 0; i < 2600; i++) { const y = r() * S, x = r() * S, len = 40 + r() * S * 0.8, l = r() > 0.5 ? 255 : 0, q = 60 + r() * 80;
      wrap9(S, (ox, oy) => { h.fillStyle = `rgba(${l},${l},${l},0.12)`; h.fillRect(x + ox, y + oy, len, 1); ro.fillStyle = `rgba(${q},${q},${q},0.25)`; ro.fillRect(x + ox, y + oy, len, 1); }); }
    return { normalMap: toNormal(hc, 1.2), roughnessMap: lin(rc) };
  });
}

// anti-slip tread plate (ramp)
function treadMaps(S) {
  return once(`tread${S}`, () => {
    const hc = mkCanvas(S), h = grey(hc, S), k = S / 256;
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const x = (i + 0.5) * S / 8 + (j % 2) * S / 16, y = (j + 0.5) * S / 8, an = (i + j) % 2 ? 0.8 : -0.8;
      wrap9(S, (ox, oy) => { h.save(); h.translate(x + ox, y + oy); h.rotate(an); h.fillStyle = 'rgb(210,210,210)'; h.beginPath(); h.ellipse(0, 0, 9 * k, 2.4 * k, 0, 0, TAU); h.fill(); h.restore(); });
    }
    return { normalMap: toNormal(hc, 3) };
  });
}

// ================================================================== geometry helpers
// planar UVs from each vertex normal's dominant axis (object-space metres / s): no stretching on boxy parts
export function planarUV(geo, s = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i), ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u, v;
    if (ax >= ay && ax >= az) { u = -p.getZ(i) * Math.sign(nx); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = -p.getZ(i) * Math.sign(ny); }
    else { u = p.getX(i) * Math.sign(nz); v = p.getY(i); }
    uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
// isotropic UVs for a lathe of radius r (u: whole tiles round the circumference; v: height), before baking
function latheUV(geo, r, T, y0 = 0) {
  const n = Math.max(1, Math.round((TAU * r) / T)), vs = n / (TAU * r);
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * n, (p.getY(i) - y0) * vs);
  return geo;
}
// nozzle UVs: v = 0 at the exit plane, 1 at the throat
function nozzleUV(geo, yExit, yThroat, around = 1) {
  const uv = geo.attributes.uv, p = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * around, (p.getY(i) - yExit) / (yThroat - yExit));
  return geo;
}
const pbox = (w, h, d, p, r, s = 1) => planarUV(box(w, h, d, p, r), s);
const add = (parent, geos, mat, { shadow = true } = {}) => {
  const m = new THREE.Mesh(merge(geos.filter(Boolean)), mat);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
};
// ring of N copies of a part round the y axis
const around = (N, fn, a0 = 0) => Array.from({ length: N }, (_, i) => fn(a0 + (i / N) * TAU, i));
// a short radial bolt head / fastener on a cylinder of radius r
const boltRing = (N, r, y, size = 0.012, a0 = 0) => around(N, (a) => bake(new THREE.CylinderGeometry(size, size, size * 0.8, 6), [Math.cos(a) * r, y, Math.sin(a) * r], [0, -a, Math.PI / 2]), a0);
// solid ring (a band raised over a cylinder) from r0 to r1 between y0..y1, built as a closed lathe
const band = (r0, r1, y0, y1, segs) => lathe([[r0, y0], [r1, y0], [r1, y1], [r0, y1]], segs);
// tube along points
function tube(pts, r, segs = 24, radial = 6) {
  const c = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(c, segs, r, radial, false);
}
// an open-ended torus ring at height y
const torus = (R, r, y, seg = 32, rs = 6) => bake(new THREE.TorusGeometry(R, r, rs, seg), [0, y, 0], [Math.PI / 2, 0, 0]);

// ---- shared sub-assemblies
// a bell nozzle: profile [[r, y]...] from throat (top) to exit (bottom), wall thickness, exit lip, throat plug
function bellNozzle(prof, segs, { lip = 0.012 } = {}) {
  const yT = prof[0][1], yE = prof[prof.length - 1][1], rE = prof[prof.length - 1][0];
  const outer = nozzleUV(lathe(prof.slice().reverse(), segs), yE, yT);
  const lipG = torus(rE, lip, yE, segs, 6);
  const throat = bake(new THREE.CircleGeometry(prof[0][0] * 0.98, segs), [0, yT - 0.002, 0], [Math.PI / 2, 0, 0]);
  return { bell: outer, lip: lipG, throat };
}
// a small attitude thruster (nozzle + valve block) pointing along dir from p
function thruster(p, dir, s, segs) {
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, -1, 0), dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const n = lathe([[s * 0.35, 0], [s * 0.45, -s * 0.3], [s * 0.7, -s * 0.9], [s * 0.8, -s * 1.2]].reverse().map(([r, y]) => [r, y]).reverse(), segs);
  const blk = new THREE.BoxGeometry(s * 1.1, s * 0.9, s * 1.1); blk.translate(0, s * 0.45, 0);
  return [bake(n, p.toArray(), [e.x, e.y, e.z]), bake(blk, p.toArray(), [e.x, e.y, e.z])];
}
// a reflector antenna opening toward +y: dish (lathe uv), rim, back ribs and hub, a feed horn on a tripod / quadripod
function antenna(r, depth, f, segs, { struts = 3, sub = false } = {}) {
  const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([r * u, depth * u * u]); }
  const dish = lathe(pts, segs);
  { const uv = dish.attributes.uv, p = dish.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - Math.hypot(p.getX(i), p.getZ(i)) / r); }
  const metal = [torus(r, r * 0.018, depth, segs, 5), cyl(r * 0.16, r * 0.2, r * 0.12, 16, [0, -r * 0.04, 0])];
  const ribs = Math.max(4, Math.round(segs / 6));
  for (let i = 0; i < ribs; i++) {
    const a = (i / ribs) * TAU, c = Math.cos(a), s = Math.sin(a);
    const p0 = V3(c * r * 0.15, -r * 0.02, s * r * 0.15), p1 = V3(c * r * 0.6, depth * 0.36 - r * 0.03, s * r * 0.6), p2 = V3(c * r * 0.98, depth * 0.96 - r * 0.02, s * r * 0.98);
    metal.push(beam(p0, p1, r * 0.03), beam(p1, p2, r * 0.025));
  }
  for (let i = 0; i < struts; i++) { const a = (i / struts) * TAU + 0.3; metal.push(rod(V3(Math.cos(a) * r * 0.92, depth * 0.88, Math.sin(a) * r * 0.92), V3(0, f - r * 0.05, 0), r * 0.012, 5)); }
  // feed horn: a short flared cone pointing down at the dish, or a sub-reflector disc
  metal.push(lathe([[r * 0.03, f + r * 0.1], [r * 0.05, f + r * 0.02], [r * 0.09, f - r * 0.06]], 12));
  if (sub) metal.push(bake(lathe([[0.001, 0], [r * 0.13, -r * 0.02], [r * 0.15, -r * 0.035]], 16), [0, f - r * 0.07, 0]));
  return { dish, metal };
}
// a rectangular solar panel lying in the xz plane from x = 0 → w, centred on z, front (cells) facing +y:
// cell face, graphite back face, aluminium edge frame, corner hold-down bosses
function solarPanel(w, d, th, M) {
  const g = new THREE.Group();
  const front = planarUV(bake(new THREE.PlaneGeometry(w, d), [w / 2, th / 2 + 0.0005, 0], [-Math.PI / 2, 0, 0]), 0.4);
  const back = planarUV(bake(new THREE.PlaneGeometry(w, d), [w / 2, -th / 2 - 0.0005, 0], [Math.PI / 2, 0, 0]), Math.max(w, d) / 1.5);
  const core = box(w, th, d, [w / 2, 0, 0]);
  const f = 0.022;
  const frame = [box(w, th * 1.6, f, [w / 2, 0, d / 2 - f / 2]), box(w, th * 1.6, f, [w / 2, 0, -d / 2 + f / 2]), box(f, th * 1.6, d, [f / 2, 0, 0]), box(f, th * 1.6, d, [w - f / 2, 0, 0])];
  for (const [x, z] of [[0.08, 0.3], [0.08, -0.3], [w - 0.08, 0.3], [w - 0.08, -0.3]]) frame.push(cyl(0.025, 0.025, th * 2.8, 10, [x, -th * 0.6, z * d]));
  add(g, [front], M.cells); add(g, [back], M.cellBack); add(g, [core, ...frame], M.alu);
  return g;
}
// a deployment hinge between panels at x (axis along z)
const hingeGeos = (x, d, th) => [-0.32, 0.32].flatMap((z) => [bake(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 10), [x, 0, z * d], [Math.PI / 2, 0, 0]), box(0.08, th * 1.4, 0.05, [x, 0, z * d])]);

// ================================================================== materials (one set per lighting environment)
export function hwMaterials(env = null, lite = false) {
  const S = lite ? 512 : 1024, s2 = lite ? 256 : 512;
  const skin = skinMaps(S), foil = foilMaps(S), cells = cellMaps(S), back = backMaps(s2), regen = nozzleMaps(lite ? 128 : 256, 'regen'), rad = nozzleMaps(lite ? 128 : 256, 'rad');
  const steelT = steelMaps(s2), conc = concreteMaps(s2), dishT = dishMaps(s2), osr = osrMaps(s2), br = brushedMaps(s2), tr = treadMaps(256);
  // (own maps throughout: the film-wide micro-detail pass would add metre-scale smudges on top)
  const std = (o) => { const m = new THREE.MeshStandardMaterial(o); if (env) m.envMap = env; m.userData.noDetail = true; return m; };
  const N = (x, y = x) => new THREE.Vector2(x, y);
  return {
    // painted vehicle skin (vertex colours carry stage bands)
    white: std({ color: '#f1efea', vertexColors: true, ...skin, normalScale: N(0.7), roughness: 1, metalness: 0.02, envMapIntensity: 0.7 }),
    paint: std({ color: '#ffffff', vertexColors: true, ...skin, normalScale: N(0.8), roughness: 1, metalness: 0.03, envMapIntensity: 0.6 }),
    alu: std({ color: '#b7bac0', ...br, normalScale: N(0.4), roughness: 1.35, metalness: 0.8, envMapIntensity: 0.8 }),
    dark: std({ color: '#222326', ...br, normalScale: N(0.25), roughness: 1.4, metalness: 0.4, envMapIntensity: 0.5 }),
    nozzle: std({ color: '#ffffff', ...regen, metalness: 0.75, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.7 }),
    nozzleRad: std({ color: '#ffffff', ...rad, metalness: 0.8, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.8 }),
    gold: std({ color: '#f6c05a', ...foil, normalScale: N(0.5), roughness: 1.4, metalness: 0.55, envMapIntensity: 1.5 }),
    silver: std({ color: '#e2e5ea', ...foil, normalScale: N(0.5), roughness: 1.6, metalness: 0.55, envMapIntensity: 1.3 }),
    kapton: std({ color: '#3a2a20', ...foil, normalScale: N(0.7), roughness: 1.3, metalness: 0.35, envMapIntensity: 0.8 }),
    cells: std({ color: '#ffffff', ...cells, normalScale: N(0.2), roughness: 2.0, metalness: 0.3, envMapIntensity: 1.3 }),
    cellBack: std({ color: '#ffffff', ...back, normalScale: N(0.5), roughness: 1, metalness: 0.2, envMapIntensity: 0.6 }),
    osr: std({ color: '#ffffff', ...osr, normalScale: N(0.4), roughness: 1, metalness: 0.9, envMapIntensity: 1.3 }),
    dish: std({ color: '#ffffff', ...dishT, normalScale: N(0.5), roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.6 }),
    lens: std({ color: '#06080d', roughness: 0.06, metalness: 0.1, envMapIntensity: 1.6 }),
    bay: std({ color: '#151517', ...br, normalScale: N(0.3), roughness: 1.8, metalness: 0.2 }),
    concrete: std({ color: '#ffffff', ...conc, normalScale: N(0.8), roughness: 0.93, metalness: 0, envMapIntensity: 0.4 }),
    steel: std({ color: '#d4d6da', ...steelT, normalScale: N(0.6), roughness: 1, metalness: 0.55, envMapIntensity: 0.5 }),
    olive: std({ color: '#7d8478', ...steelT, normalScale: N(0.6), roughness: 1.1, metalness: 0.3, envMapIntensity: 0.5 }),
    wheel: std({ color: '#a6a9ae', ...br, normalScale: N(0.4), roughness: 0.9, metalness: 0.85, envMapIntensity: 0.8 }),
    ramp: std({ color: '#bdbcb7', ...tr, normalScale: N(0.6), roughness: 0.7, metalness: 0.3, envMapIntensity: 0.5 }),
    rubber: std({ color: '#141414', roughness: 0.8, metalness: 0 }),
    copper: std({ color: '#b8743e', roughness: 0.4, metalness: 0.9, envMapIntensity: 0.8 }),
  };
}

// ================================================================== NIKE-APACHE (Thumba, 1963) ~8.3 m
export function buildNikeApache(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const sg = lite ? 16 : 36;
  const W = '#ece9e2', GR = '#a3a29d', BK = '#222226', SV = '#c9c7c1';
  const T = 0.6;                                 // skin tile (m)
  const paint = [];
  // Nike booster: aft skirt, motor case, forward taper into the interstage
  paint.push(tint(latheUV(lathe([[0.15, 0], [0.18, 0.06], [0.205, 0.12], [0.21, 0.16], [0.21, 3.5]], sg), 0.21, T), W));
  paint.push(tint(latheUV(lathe([[0.21, 3.5], [0.19, 3.58], [0.15, 3.66], [0.11, 3.74], [0.0905, 3.78]], sg), 0.21, T), GR));   // interstage adapter
  paint.push(tint(band(0.209, 0.214, 1.12, 1.34, sg), BK), tint(band(0.209, 0.214, 2.98, 3.06, sg), GR), tint(band(0.209, 0.216, 0.14, 0.2, sg), GR));
  // Apache: motor case, payload, ogive nose
  paint.push(tint(latheUV(lathe([[0.0825, 3.76], [0.0825, 6.7]], sg), 0.0825, T * 0.5), W));
  paint.push(tint(latheUV(lathe([[0.084, 6.7], [0.084, 7.35], [0.079, 7.5], [0.068, 7.7], [0.052, 7.9], [0.035, 8.06], [0.018, 8.2]], sg), 0.084, T * 0.5), SV));
  paint.push(tint(band(0.082, 0.0855, 5.34, 5.46, sg), BK), tint(band(0.082, 0.086, 6.69, 6.72, sg), GR));
  // fins: bevelled clipped deltas (big ones on the Nike, small on the Apache), with root clamp strips
  const fin = (root, tip, span, sweep, th) => {
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(0, root); s.lineTo(span, sweep + tip); s.lineTo(span, sweep); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: th * 0.4, bevelEnabled: true, bevelThickness: th * 0.3, bevelSize: th * 0.35, bevelSegments: lite ? 1 : 2 }); geo.translate(0, 0, -th * 0.2); return geo;
  };
  const metal = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = -Math.sin(a);
    paint.push(tint(planarUV(bake(fin(1.05, 0.38, 0.62, 0.05, 0.024), [c * 0.2, 0.12, s * 0.2], [0, a, 0]), T), W));
    paint.push(tint(planarUV(bake(fin(0.42, 0.14, 0.2, 0.06, 0.012), [c * 0.08, 3.86, s * 0.08], [0, a, 0]), T), W));
    // root clamp strips each side + a fin-tip anti-flutter cap on the booster fins
    for (const sd of [-1, 1]) {
      const tx = -s * sd * 0.022, tz = c * sd * 0.022;
      metal.push(bake(new THREE.BoxGeometry(0.035, 0.95, 0.008), [c * 0.222 + tx, 0.64, s * 0.222 + tz], [0, a, 0]));
      if (!lite) metal.push(bake(new THREE.BoxGeometry(0.018, 0.36, 0.006), [c * 0.092 + tx * 0.4, 4.08, s * 0.092 + tz * 0.4], [0, a, 0]));
    }
    metal.push(bake(new THREE.BoxGeometry(0.012, 0.4, 0.03), [c * 0.82, 0.36, s * 0.82], [0, a, 0]));
  }
  // launch shoes riding the rail (on −z): two on the booster, two on the Apache (long standoffs)
  for (const [y, r] of [[0.6, 0.21], [2.75, 0.21], [4.5, 0.0825], [6.55, 0.0825]]) {
    const L = 0.25 - r;
    metal.push(box(0.05, 0.1, L, [0, y, -r - L / 2 + 0.005]), box(0.11, 0.12, 0.014, [0, y, -0.243]));
  }
  // aft closure bolt ring, interstage bolts, umbilical connector + door, payload antenna strips, nose tip
  metal.push(...boltRing(lite ? 12 : 24, 0.213, 0.17, 0.008), ...boltRing(lite ? 8 : 16, 0.0855, 6.705, 0.005));
  metal.push(box(0.07, 0.12, 0.03, [0.15, 3.25, 0.15], [0, -Math.PI / 4, 0]));
  metal.push(lathe([[0.018, 8.2], [0.01, 8.27], [0.001, 8.3]], 12));
  const dark = [box(0.05, 0.08, 0.012, [0.0, 7.05, 0.085]), box(0.012, 0.22, 0.006, [0.084, 7.1, 0]), box(0.012, 0.22, 0.006, [-0.084, 7.1, 0])];
  dark.push(box(0.03, 0.05, 0.006, [0.15, 3.25, 0.15], [0, -Math.PI / 4, 0]));
  add(g, paint, M.paint); add(g, metal, M.alu); add(g, dark, M.dark);
  // the M5 motor's nozzle: throat plug, flared exit cone with a lip
  const nz = bellNozzle([[0.08, 0.05], [0.095, 0.0], [0.12, -0.06], [0.145, -0.1]], sg, { lip: 0.008 });
  add(g, [nz.bell, nz.lip], M.nozzle); add(g, [nz.throat], M.dark);
  return { group: g, exit: V3(0, -0.1, 0), length: 8.3 };
}

// rail launcher: bolted base plate, gusseted column, trunnion, an I-section rail on a lattice boom,
// elevation ram, A-frame braces, a junction box and the firing cable
export function buildLauncher(M, elev, { lite = false } = {}) {
  const g = new THREE.Group();
  const parts = [], dark = [], steel = [];
  parts.push(pbox(2.2, 0.1, 2.2, [0, 0.05, 0]), pbox(2.4, 0.25, 2.4, [0, -0.08, 0], undefined, 1));
  parts.push(pbox(1.1, 0.9, 1.1, [0, 0.55, 0]), pbox(0.9, 0.5, 0.9, [0, 1.15, 0]));
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; parts.push(bake(new THREE.BoxGeometry(0.04, 0.5, 0.5), [Math.cos(a) * 0.78, 0.35, Math.sin(a) * 0.78], [0, -a, 0])); }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (const k of [0.25, 0.75]) steel.push(cyl(0.03, 0.03, 0.08, 6, [x * 0.95 * k + x * 0.95 * (1 - k) * 0.0, 0.12, z * 0.95]), cyl(0.03, 0.03, 0.08, 6, [x * 0.95, 0.12, z * 0.95 * k]));
  // trunnion yoke
  parts.push(pbox(0.06, 0.55, 0.6, [-0.24, 1.6, 0]), pbox(0.06, 0.55, 0.6, [0.24, 1.6, 0]));
  steel.push(bake(new THREE.CylinderGeometry(0.08, 0.08, 0.62, 16), [0, 1.6, 0], [0, 0, Math.PI / 2]));
  // the rail (in its own frame: along +y, rocket on +z side)
  const rail = new THREE.Group();
  const rp = [], rs = [];
  rp.push(pbox(0.035, 9.2, 0.16, [0, 4.0, -0.32]), pbox(0.2, 9.2, 0.022, [0, 4.0, -0.241]), pbox(0.2, 9.2, 0.022, [0, 4.0, -0.399]));
  for (let i = 0; i < 12; i++) rp.push(box(0.17, 0.02, 0.14, [0, -0.3 + i * 0.75, -0.32]));
  // lattice boom behind the rail
  const BZ = -0.95, n = lite ? 6 : 10;
  for (const x of [-0.16, 0.16]) rp.push(beam(V3(x, 0.2, BZ), V3(x, 6.6, -0.5), 0.05));
  for (let i = 0; i < n; i++) {
    const y0 = 0.2 + (i / n) * 6.4, y1 = 0.2 + ((i + 1) / n) * 6.4, z0 = BZ + (i / n) * 0.45, z1 = BZ + ((i + 1) / n) * 0.45;
    for (const x of [-0.16, 0.16]) rs.push(beam(V3(x, y0, z0), V3(x * 0.6, y1, -0.4), 0.025), beam(V3(x, y0, z0), V3(x * 0.6, y0, -0.4), 0.025));
    rs.push(beam(V3(-0.16, y0, z0), V3(0.16, y1, z1), 0.02));
  }
  rp.push(beam(V3(0, -0.4, -0.32), V3(0, 0.2, BZ), 0.08));
  rp.push(pbox(0.3, 0.3, 0.7, [0, -0.15, -0.55]));
  add(rail, rp, M.olive); add(rail, rs, M.olive);
  rail.position.set(0, 1.6, 0); rail.rotation.x = -(Math.PI / 2 - elev); g.add(rail);
  const railPt = (y, z) => V3(0, 1.6, 0).add(V3(0, y, z).applyAxisAngle(V3(1, 0, 0), rail.rotation.x));
  // A-frame braces and the elevation ram (cylinder + rod)
  const top = railPt(3.0, -0.6);
  parts.push(beam(V3(-0.8, 0.12, -0.9), top, 0.07), beam(V3(0.8, 0.12, -0.9), top, 0.07), beam(V3(-0.8, 0.12, -0.9), V3(0.8, 0.12, -0.9), 0.06));
  const ramB = V3(0, 0.6, -0.62), ramT = railPt(1.6, BZ + 0.1);
  steel.push(rod(ramB, ramB.clone().lerp(ramT, 0.55), 0.06, 12), rod(ramB.clone().lerp(ramT, 0.5), ramT, 0.03, 10));
  // junction box on the column, the firing cable up the boom to the umbilical
  dark.push(box(0.36, 0.42, 0.18, [0.0, 0.7, 0.63]), box(0.08, 0.08, 0.06, [0.12, 0.85, 0.74]));
  const c1 = V3(0.12, 0.85, 0.77), c2 = V3(0.5, 0.2, 1.4), c3 = V3(0.6, 0.6, 0.6), c4 = railPt(3.2, 0.1).add(V3(0.17, 0, 0));
  dark.push(tube([c1, c2, c3, c4], 0.014, lite ? 16 : 40, 5));
  add(g, parts, M.olive); add(g, steel, M.alu); add(g, dark, M.dark);
  return { group: g, rail };
}

// ================================================================== ARYABHATA (1975): 26-faced polyhedron ~1.4 m
export function buildAryabhata(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const k = 1 + Math.SQRT2, verts = [];
  for (const [a, b, c] of [[1, 1, k], [1, k, 1], [k, 1, 1]]) for (const sa of [-1, 1]) for (const sb of [-1, 1]) for (const sc of [-1, 1]) verts.push(V3(a * sa, b * sb, c * sc));
  const normals = [];
  for (const ax of [V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1)]) normals.push(ax.clone(), ax.clone().negate());
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) for (const si of [-1, 1]) for (const sj of [-1, 1]) { const n = V3(); n.setComponent(i, si); n.setComponent(j, sj); normals.push(n.normalize()); }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) normals.push(V3(sx, sy, sz).normalize());
  const S = 0.7 / Math.sqrt(2 + k * k);
  const shell = [], cells = [], caps = [], edges = new Map(), trays = [];
  for (const n of normals) {
    let mx = -1e9; for (const v of verts) mx = Math.max(mx, v.dot(n));
    const face = verts.filter((v) => Math.abs(v.dot(n) - mx) < 1e-4);
    const c = face.reduce((a, v) => a.add(v), V3()).multiplyScalar(1 / face.length);
    const u0 = V3().subVectors(face[0], c).normalize(), w0 = V3().crossVectors(n, u0);
    face.sort((a, b) => Math.atan2(V3().subVectors(a, c).dot(w0), V3().subVectors(a, c).dot(u0)) - Math.atan2(V3().subVectors(b, c).dot(w0), V3().subVectors(b, c).dot(u0)));
    const u = V3().subVectors(face[1], face[0]).normalize(), w = V3().crossVectors(n, u);   // edge-aligned (cell rows run along an edge)
    const poly = (scale, lift, uvK) => {
      const pos = [], uv = [], nn = [];
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        for (const p of [c, a, b]) {
          const q = V3().subVectors(p, c).multiplyScalar(scale).add(c).addScaledVector(n, lift).multiplyScalar(S);
          pos.push(q.x, q.y, q.z); nn.push(n.x, n.y, n.z);
          const d = V3().subVectors(p, c).multiplyScalar(scale);
          uv.push(0.5 + d.dot(u) * uvK, 0.5 + d.dot(w) * uvK);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return geo;
    };
    // tray walls round the inset cell field (catch the light at grazing angles)
    const wall = (scale, lift) => {
      const pos = [];
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const A0 = V3().subVectors(a, c).multiplyScalar(scale).add(c).multiplyScalar(S), B0 = V3().subVectors(b, c).multiplyScalar(scale).add(c).multiplyScalar(S);
        const A1 = A0.clone().addScaledVector(n, lift * S), B1 = B0.clone().addScaledVector(n, lift * S);
        pos.push(...A0.toArray(), ...B0.toArray(), ...B1.toArray(), ...A0.toArray(), ...B1.toArray(), ...A1.toArray());
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals(); return geo;
    };
    shell.push(planarUV(poly(1, 0, 0.3), 0.25));
    if (Math.abs(n.y) > 0.99) caps.push(planarUV(poly(0.84, 0.03, 0.3), 0.3));
    else { cells.push(poly(0.88, 0.03, 1.15)); trays.push(wall(0.88, 0.03)); }
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length], key = [a, b].map((v) => v.toArray().map((x) => x.toFixed(2)).join(',')).sort().join('|');
      if (!edges.has(key)) edges.set(key, [a.clone().multiplyScalar(S), b.clone().multiplyScalar(S)]);
    }
  }
  add(g, shell, M.alu); add(g, cells, M.cells); add(g, caps, M.kapton); add(g, trays, M.dark);
  // edge frame: tubular members along all 48 edges, node fittings at the 24 vertices
  const frame = [...edges.values()].map(([a, b]) => rod(a, b, 0.009, lite ? 4 : 8));
  if (!lite) for (const v of verts) frame.push(bake(new THREE.SphereGeometry(0.014, 8, 6), v.clone().multiplyScalar(S).toArray()));
  // top: telemetry mast with a short whip, X-ray detector windows, a sun sensor; bottom: separation ring + bolts
  const top = S * k, bot = -S * k;
  frame.push(cyl(0.035, 0.045, 0.1, 14, [0, top + 0.05, 0]), cyl(0.012, 0.012, 0.22, 8, [0, top + 0.2, 0]), bake(new THREE.SphereGeometry(0.016, 10, 8), [0, top + 0.31, 0]));
  frame.push(band(0.2, 0.235, bot - 0.06, bot, lite ? 20 : 40), ...boltRing(lite ? 8 : 16, 0.236, bot - 0.03, 0.007));
  frame.push(box(0.14, 0.05, 0.1, [0.12, top + 0.03, -0.1]), box(0.08, 0.04, 0.08, [-0.13, top + 0.025, 0.12]));
  add(g, frame, M.alu);
  add(g, [box(0.1, 0.012, 0.07, [0.12, top + 0.056, -0.1]), box(0.05, 0.01, 0.05, [-0.13, top + 0.046, 0.12])], M.lens);
  // four whip antennas round the base, on hinge brackets
  const ant = [];
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4, b0 = V3(Math.cos(a) * 0.3, bot + 0.02, Math.sin(a) * 0.3), b1 = V3(Math.cos(a) * 0.68, bot - 0.36, Math.sin(a) * 0.68);
    ant.push(rod(b0, b1, 0.005, 5), box(0.04, 0.03, 0.04, b0.toArray()), bake(new THREE.SphereGeometry(0.009, 6, 5), b1.toArray()));
  }
  add(g, ant, M.dark);
  return { group: g };
}

// ================================================================== PSLV-XL (44 m)
export function buildPSLV(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const sg = lite ? 28 : 56, ss = lite ? 16 : 32;
  const W = '#eeede8', G1 = '#a9a8a4', DK = '#38383a', T = 2.2;
  const paint = [], metal = [], dark = [];
  // core: PS1 (S139, r 1.4) · PS2 (Vikas) · PS3 (r 1.0) · PS4 · the bulbous 3.2 m fairing
  paint.push(tint(latheUV(lathe([[0.9, 0], [1.2, 0.12], [1.36, 0.32], [1.4, 0.5], [1.4, 20.2], [1.4, 33.4]], sg), 1.4, T), W));
  paint.push(tint(latheUV(lathe([[1.4, 33.4], [1.3, 33.75], [1.0, 34.2], [1.0, 37.4]], sg), 1.0, T * 0.75, 33.4), W));
  const fair = [[1.0, 37.4], [1.15, 37.6], [1.4, 37.95], [1.6, 38.4], [1.6, 41.4], [1.56, 41.9], [1.45, 42.4], [1.32, 42.85], [1.15, 43.3], [0.9, 43.75], [0.6, 44.1], [0.36, 44.3], [0.15, 44.4], [0.001, 44.43]];
  paint.push(tint(latheUV(lathe(fair, sg), 1.6, T, 37.4), W));
  // stage bands / joints (raised rings)
  paint.push(tint(band(1.398, 1.412, 0.0, 0.5, sg), DK), tint(band(1.398, 1.41, 19.9, 21.0, sg), G1), tint(band(1.398, 1.41, 33.25, 33.45, sg), G1));
  paint.push(tint(band(1.405, 1.418, 7.92, 8.08, sg), G1), tint(band(1.405, 1.418, 27.42, 27.58, sg), G1));
  paint.push(tint(band(0.998, 1.01, 37.25, 37.5, sg), DK), tint(band(1.598, 1.616, 40.15, 40.25, sg), G1), tint(band(1.598, 1.614, 38.38, 38.48, sg), G1));
  // fairing separation lines (two diametrical grooves), vent ports
  for (const a of [Math.PI / 2, -Math.PI / 2]) dark.push(bake(new THREE.BoxGeometry(0.03, 3.0, 0.012), [Math.cos(a) * 1.605, 39.9, Math.sin(a) * 1.605], [0, -a, 0]));
  if (!lite) for (const a of [0.4, 2.1, 3.6, 5.1]) dark.push(bake(new THREE.BoxGeometry(0.012, 0.1, 0.16), [Math.cos(a) * 1.603, 38.75, Math.sin(a) * 1.603], [0, -a, 0]));
  // raceways (systems tunnels) running up the core between the strap-ons, with end fairings
  for (const [a, y0, y1, r] of [[Math.PI / 3, 0.9, 33.0, 1.4], [Math.PI * 4 / 3, 0.9, 33.0, 1.4], [Math.PI / 3, 34.3, 37.2, 1.0]]) {
    const c = Math.cos(a), s = Math.sin(a), L = y1 - y0;
    paint.push(tint(planarUV(bake(new THREE.BoxGeometry(0.11, L, 0.26), [c * (r + 0.05), y0 + L / 2, s * (r + 0.05)], [0, -a, 0]), T), W));
    for (const [yy, dir] of [[y0 - 0.25, -1], [y1 + 0.25, 1]]) paint.push(tint(bake(new THREE.CylinderGeometry(dir > 0 ? 0.01 : 0.13, dir > 0 ? 0.13 : 0.01, 0.5, 4), [c * (r + 0.05), yy, s * (r + 0.05)], [0, -a + Math.PI / 4, 0]), W));
    if (!lite) for (let y = y0 + 1; y < y1; y += 1.5) dark.push(bake(new THREE.BoxGeometry(0.115, 0.02, 0.265), [c * (r + 0.05), y, s * (r + 0.05)], [0, -a, 0]));
  }
  // separation retro-rocket fairings at the 1/2 and 2/3 joints
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4 + 0.26, c = Math.cos(a), s = Math.sin(a);
    paint.push(tint(lathe([[0.001, 0], [0.09, 0.08], [0.1, 0.55], [0.06, 0.75], [0.001, 0.82]], 10).translate(c * 1.47, 20.3, s * 1.47), G1));
    dark.push(cyl(0.06, 0.07, 0.06, 10, [c * 1.47, 20.27, s * 1.47]));
    if (!lite) paint.push(tint(lathe([[0.001, 0], [0.06, 0.06], [0.065, 0.4], [0.001, 0.5]], 8).translate(Math.cos(a + 0.3) * 1.06, 34.4, Math.sin(a + 0.3) * 1.06), G1));
  }
  // SITVC injectant tanks on the PS1 aft (diametrically opposite), feed lines to the nozzle
  for (const a of [0, Math.PI]) {
    const c = Math.cos(a), s = Math.sin(a), R = 1.72;
    paint.push(tint(lathe([[0.001, 0], [0.18, 0.08], [0.27, 0.3], [0.3, 0.6], [0.3, 2.9], [0.24, 3.3], [0.12, 3.55], [0.001, 3.62]], ss).translate(c * R, 1.0, s * R), W));
    metal.push(beam(V3(c * 1.41, 1.6, s * 1.41), V3(c * (R - 0.25), 1.6, s * (R - 0.25)), 0.08), beam(V3(c * 1.41, 3.9, s * 1.41), V3(c * (R - 0.25), 3.9, s * (R - 0.25)), 0.08));
    dark.push(tube([V3(c * R, 1.0, s * R), V3(c * (R - 0.1), 0.4, s * (R - 0.1)), V3(c * 1.05, -0.2, s * 1.05), V3(c * 0.72, -0.45, s * 0.72)], 0.035, 12, 6));
  }
  // aft skirt stiffeners and hold-down lugs
  if (!lite) for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + 0.13; metal.push(bake(new THREE.BoxGeometry(0.04, 0.42, 0.05), [Math.cos(a) * 1.18, 0.21, Math.sin(a) * 1.18], [0.0, -a, -0.62 * 0])); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; dark.push(bake(new THREE.BoxGeometry(0.28, 0.22, 0.3), [Math.cos(a) * 1.05, 0.1, Math.sin(a) * 1.05], [0, -a, 0])); }
  // strap-ons (PSOM-XL, r 0.5, 13.5 m): ogive nose, raceway, forward/aft attachment struts, nose separation motors
  const strapR = 1.4 + 0.52, straps = [];
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + Math.PI / 6, c = Math.cos(a), s = Math.sin(a), x = c * strapR, z = s * strapR;
    const prof = [[0.42, 0], [0.47, 0.15], [0.5, 0.35], [0.5, 12.0], [0.49, 12.3], [0.46, 12.65], [0.41, 12.95], [0.34, 13.25], [0.25, 13.5], [0.15, 13.72], [0.06, 13.88], [0.001, 13.95]];
    paint.push(tint(latheUV(lathe(prof, ss), 0.5, T * 0.5), W).translate(x, 0.5, z));
    paint.push(tint(band(0.498, 0.51, 0.0, 0.42, ss), DK).translate(x, 0.5, z), tint(band(0.498, 0.508, 5.9, 6.15, ss), G1).translate(x, 0.5, z));
    paint.push(tint(band(0.499, 0.507, 11.6, 11.68, ss), G1).translate(x, 0.5, z));
    // outboard raceway
    paint.push(tint(planarUV(bake(new THREE.BoxGeometry(0.06, 10.6, 0.14), [c * (strapR + 0.52), 6.7, s * (strapR + 0.52)], [0, -a, 0]), T), W));
    // nose separation motors (two small pods)
    for (const da of [-0.5, 0.5]) { const b = a + Math.PI + da; paint.push(tint(lathe([[0.001, 0], [0.045, 0.05], [0.05, 0.42], [0.001, 0.5]], 8).translate(x + Math.cos(b) * 0.49, 11.6, z + Math.sin(b) * 0.49), G1)); }
    // attachments: aft ball-joint beam + a diagonal pair; forward two struts converging on the core
    const t = V3(-s, 0, c);
    const coreAt = (y, off = 0) => V3(c * 1.41, y, s * 1.41).addScaledVector(t, off), strapAt = (y, off = 0) => V3(c * (strapR - 0.49), y, s * (strapR - 0.49)).addScaledVector(t, off);
    metal.push(beam(coreAt(2.0), strapAt(2.0), 0.16), beam(coreAt(2.0, 0.3), strapAt(2.6), 0.07), beam(coreAt(2.0, -0.3), strapAt(2.6), 0.07));
    metal.push(beam(coreAt(11.3, 0.28), strapAt(11.0), 0.08), beam(coreAt(11.3, -0.28), strapAt(11.0), 0.08), beam(coreAt(10.8), strapAt(11.3), 0.06));
    metal.push(bake(new THREE.SphereGeometry(0.09, 10, 8), strapAt(2.0).toArray()), bake(new THREE.SphereGeometry(0.07, 10, 8), strapAt(11.0).toArray()));
    straps.push(V3(x, 0.45, z));
  }
  add(g, paint, M.white); add(g, metal, M.alu); add(g, dark, M.dark);
  // nozzles: the big PS1 nozzle (flex seal, lip, actuator struts) and six strap-on nozzles
  const nzG = [], nzD = [];
  { const n = bellNozzle([[0.55, 0.2], [0.6, 0.02], [0.68, -0.3], [0.77, -0.65], [0.85, -1.0]], sg, { lip: 0.03 }); nzG.push(n.bell, n.lip); nzD.push(n.throat, band(0.55, 0.62, 0.15, 0.35, sg)); }
  for (const s of straps) { const n = bellNozzle([[0.3, 0.1], [0.33, -0.08], [0.37, -0.35], [0.42, -0.7]], ss, { lip: 0.016 }); for (const q of [n.bell, n.lip]) nzG.push(q.translate(s.x, s.y, s.z)); nzD.push(n.throat.translate(s.x, s.y, s.z), band(0.3, 0.36, 0.06, 0.16, ss).translate(s.x, s.y, s.z)); }
  add(g, nzG, M.nozzle); add(g, nzD, M.dark);
  return { group: g, coreExit: V3(0, -1.0, 0), strapExits: straps.map((s) => V3(s.x, s.y - 0.7, s.z)) };
}

// launch complex: concrete deck, a launch pedestal over the flame duct with hold-down posts, a 52 m umbilical tower
// (X-braced lattice, internal stairs, grated platforms with handrails, truss swing arms with umbilical plates and
// draped cables, a jib crane on top, lamp housings), two lightning masts
export function buildPad(M, { lite = false } = {}) {
  const g = new THREE.Group();
  // deck + pedestal (an 9 × 9 m frame round a 5.6 m duct opening, dark pit below)
  const deck = [pbox(34, 2.2, 30, [0, -2.1, 0], undefined, 4)];
  const PO = 4.5, PI = 2.8, PT = -0.4;
  deck.push(pbox(PO * 2, 0.6, PO - PI, [0, PT - 0.3, (PO + PI) / 2], undefined, 4), pbox(PO * 2, 0.6, PO - PI, [0, PT - 0.3, -(PO + PI) / 2], undefined, 4));
  deck.push(pbox(PO - PI, 0.6, PI * 2, [(PO + PI) / 2, PT - 0.3, 0], undefined, 4), pbox(PO - PI, 0.6, PI * 2, [-(PO + PI) / 2, PT - 0.3, 0], undefined, 4));
  add(g, deck, M.concrete);
  add(g, [box(PI * 2, 0.02, PI * 2, [0, -0.99, 0]), box(PI * 2 - 0.2, 3, 0.1, [0, -2.5, PI - 0.05]), box(PI * 2 - 0.2, 3, 0.1, [0, -2.5, -PI + 0.05])], M.bay, { shadow: false });
  // hold-down posts: six cantilevers at the gap angles carrying the core skirt, six arms under the strap skirts
  const hd = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, c = Math.cos(a), s = Math.sin(a);
    hd.push(beam(V3(c * PI, PT - 0.15, s * PI), V3(c * 0.98, PT - 0.15, s * 0.98), 0.3), beam(V3(c * 1.05, PT, s * 1.05), V3(c * 1.05, 0.6, s * 1.05), 0.22));
    hd.push(beam(V3(c * PI, PT - 0.1, s * PI), V3(c * 1.15, 0.45, s * 1.15), 0.12));
    const b = a + Math.PI / 6, cb = Math.cos(b), sb = Math.sin(b);
    hd.push(beam(V3(cb * 2.62, PT, sb * 2.62), V3(cb * 2.62, 1.0, sb * 2.62), 0.24), beam(V3(cb * 2.62, 1.0, sb * 2.62), V3(cb * 2.38, 1.08, sb * 2.38), 0.16));
  }
  add(g, hd, M.steel);
  // umbilical tower: 6 × 6 m, 52 m, west of the vehicle
  const T = [], TS = [], TX = -9.5, S = 3, H = 52, DY = 3.25;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.push(planarUV(beam(V3(TX + sx * S, -1, sz * S), V3(TX + sx * S, H, sz * S), 0.35), 2));
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let y = 0, lv = 0; y < H; y += DY, lv++) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = C[i], [bx, bz] = C[(i + 1) % 4];
      T.push(planarUV(beam(V3(TX + ax * S, y, az * S), V3(TX + bx * S, y, bz * S), 0.2), 2));
      TS.push(beam(V3(TX + ax * S, y, az * S), V3(TX + bx * S, y + DY, bz * S), 0.12));
      if (!lite) TS.push(beam(V3(TX + bx * S, y, bz * S), V3(TX + ax * S, y + DY, az * S), 0.1));
    }
    // internal stair flight (alternating direction) with treads
    const z0 = -1.6, z1 = 1.6, dir = lv % 2 ? 1 : -1, x0 = TX - 1.6;
    const a0 = V3(x0, y, dir > 0 ? z0 : z1), a1 = V3(x0, y + DY, dir > 0 ? z1 : z0);
    for (const dx of [-0.5, 0.5]) TS.push(beam(a0.clone().add(V3(dx, 0, 0)), a1.clone().add(V3(dx, 0, 0)), 0.08));
    if (!lite) for (let st = 1; st < 12; st++) { const p = a0.clone().lerp(a1, st / 12); TS.push(box(1.0, 0.04, 0.22, p.toArray())); }
    if (lv % 3 === 1) {
      T.push(pbox(7, 0.2, 7, [TX, y, 0], undefined, 2));
      // handrails on the vehicle side
      for (let i = 0; i <= 6; i++) TS.push(box(0.05, 1.1, 0.05, [TX + S + 0.4, y + 0.6, -3 + i]));
      TS.push(box(0.05, 0.05, 6.2, [TX + S + 0.4, y + 1.1, 0]), box(0.05, 0.05, 6.2, [TX + S + 0.4, y + 0.6, 0]));
    }
  }
  // head house, jib crane, antenna mast
  T.push(pbox(7.4, 3, 7.4, [TX, H + 1.5, 0], undefined, 2), pbox(7.8, 0.3, 7.8, [TX, H + 3.1, 0], undefined, 2));
  T.push(beam(V3(TX, H + 3.2, 0), V3(TX, H + 8, 0), 0.5), beam(V3(TX - 6, H + 8.2, 0), V3(TX + 9, H + 8.2, 0), 0.45), pbox(2.2, 1.6, 1.6, [TX - 6.5, H + 7.6, 0], undefined, 2));
  TS.push(beam(V3(TX, H + 10.5, 0), V3(TX + 9, H + 8.4, 0), 0.08), beam(V3(TX, H + 10.5, 0), V3(TX - 6, H + 8.4, 0), 0.08), beam(V3(TX, H + 8, 0), V3(TX, H + 10.5, 0), 0.2));
  TS.push(rod(V3(TX + 8.5, H + 8, 0), V3(TX + 8.5, H + 3.4, 0), 0.03, 4), box(0.6, 0.4, 0.4, [TX + 8.5, H + 3.2, 0]));
  TS.push(rod(V3(TX + 2.5, H + 3.2, 2.5), V3(TX + 2.5, H + 7.5, 2.5), 0.05, 6));
  // swing arms: truss arms ending short of the vehicle with umbilical plates; cables draped below
  const radAt = (y) => (y < 33.4 ? 1.4 : y < 37.4 ? 1.0 : 1.6);
  const cables = [];
  for (const y of [12, 26, 36, 41]) {
    const xe = -(radAt(y) + 0.3), xs = TX + S;
    for (const z of [-0.6, 0.6]) { T.push(beam(V3(xs, y, z), V3(xe, y, z), 0.18)); T.push(beam(V3(xs, y - 1.2, z), V3(xe + 1.2, y - 0.25, z), 0.14)); }
    const n = 5;
    for (let i = 0; i < n; i++) { const xa = xs + (xe - xs) * (i / n), xb = xs + (xe - xs) * ((i + 1) / n); TS.push(beam(V3(xa, y - 1.2 + i * 0.19, 0), V3(xb, y, 0), 0.08)); for (const z of [-0.6, 0.6]) TS.push(beam(V3(xa, y, z), V3(xa, y - 1.2 + (i / n) * 0.95, z), 0.07)); }
    T.push(pbox(xe - xs, 0.08, 1.3, [(xs + xe) / 2, y + 0.06, 0], undefined, 2));
    for (const z of [-0.65, 0.65]) TS.push(box(xe - xs, 0.04, 0.04, [(xs + xe) / 2, y + 1.05, z]));
    for (let i = 0; i <= 4; i++) for (const z of [-0.65, 0.65]) TS.push(box(0.04, 1.0, 0.04, [xs + (xe - xs) * (i / 4), y + 0.55, z]));
    T.push(pbox(0.12, 0.9, 1.1, [xe + 0.06, y + 0.35, 0], undefined, 2));
    for (const [z, sag] of [[-0.3, 1.8], [0.1, 2.4], [0.4, 1.4]]) cables.push(tube([V3(xe + 0.1, y + 0.2, z), V3(xe - 1.2, y - sag, z * 1.3), V3(xs + 0.6, y - sag * 0.5, z), V3(xs, y - 0.6, z)], 0.06, lite ? 10 : 20, 6));
  }
  // lamp housings at the lamp points
  const lamps = [], lampG = [];
  for (let y = 6; y < H; y += 9.75) lamps.push(V3(TX + S + 0.2, y, -S - 0.2), V3(TX + S + 0.2, y, S + 0.2));
  for (const p of lamps) lampG.push(box(0.5, 0.4, 0.5, [p.x - 0.3, p.y, p.z]), box(0.2, 0.6, 0.2, [p.x - 0.55, p.y - 0.3, p.z]));
  add(g, T, M.steel); add(g, TS, M.steel); add(g, [...cables, ...lampG], M.dark);
  // lightning masts: tapered poles, a platform and the air terminal
  const L = [];
  for (const [x, z, h] of [[-52, -34, 76], [50, -46, 76]]) {
    L.push(cyl(0.3, 0.85, h, lite ? 8 : 16, [x, h / 2 - 1, z]), cyl(1.2, 1.2, 0.25, lite ? 8 : 16, [x, h - 4, z]), cyl(0.06, 0.06, 6, 6, [x, h + 2, z]), cyl(1.4, 1.6, 1.2, lite ? 8 : 16, [x, -0.6, z]));
  }
  add(g, L, M.steel);
  return { group: g, lamps, towerX: TX };
}

// ================================================================== spacecraft buses
// a cuboid bus in MLI: foil body, aluminium corner angles, seam battens, optional radiators
function busBody(g, M, sx, sy, sz, { foil = M.gold, sg = 16 } = {}) {
  add(g, [planarUV(box(sx, sy, sz, [0, 0, 0]), 1.0)], foil);
  const e = 0.035, angles = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) angles.push(box(e, sy + 0.01, e, [x * sx / 2, 0, z * sz / 2]));
  for (const y of [-1, 1]) for (const x of [-1, 1]) angles.push(box(e, e, sz + 0.01, [x * sx / 2, y * sy / 2, 0]));
  for (const y of [-1, 1]) for (const z of [-1, 1]) angles.push(box(sx + 0.01, e, e, [0, y * sy / 2, z * sz / 2]));
  add(g, angles, M.alu);
}

// CHANDRAYAAN-1 orbiter (2008): ~1.5 m bus, one 2.15 × 1.8 m wing on a yoke, gimballed HGA on a boom,
// payload deck (stereo camera, imaging spectrometer, M3, laser altimeter, the Moon Impact Probe), LAM below
export function buildChandrayaan1(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const sg = lite ? 14 : 28;
  busBody(g, M, 1.5, 1.5, 1.5, { sg });
  // OSR radiators on ±z, the Mini-SAR antenna panel on −x
  add(g, [planarUV(box(1.2, 1.15, 0.012, [0, 0, 0.756]), 0.5), planarUV(box(1.2, 1.15, 0.012, [0, 0, -0.756]), 0.5)], M.osr);
  add(g, [planarUV(box(0.02, 1.0, 0.9, [-0.765, 0.05, 0]), 0.5)], M.dark);
  if (!lite) { const dots = []; for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) dots.push(box(0.008, 0.11, 0.11, [-0.779, -0.37 + j * 0.16, -0.37 + i * 0.15])); add(g, dots, M.alu); }
  // payload deck
  const deck = [planarUV(box(1.52, 0.04, 1.52, [0, 0.77, 0]), 1)];
  const inst = [box(0.5, 0.25, 0.4, [-0.3, 0.915, 0.3]), box(0.35, 0.3, 0.35, [0.35, 0.94, -0.25]), box(0.28, 0.18, 0.22, [-0.35, 0.88, -0.38])];
  const mip = [box(0.36, 0.34, 0.36, [0.4, 0.96, 0.42])];
  add(g, [...deck, ...inst.map((q) => planarUV(q, 0.6))], M.silver); add(g, mip.map((q) => planarUV(q, 0.6)), M.gold);
  const deckMetal = [cyl(0.07, 0.07, 0.3, 16, [-0.12, 0.9, 0.62]), cyl(0.05, 0.05, 0.08, 12, [-0.42, 1.08, 0.3]), cyl(0.05, 0.05, 0.08, 12, [-0.18, 1.08, 0.3])];
  for (let i = 0; i < (lite ? 3 : 7); i++) deckMetal.push(box(0.3, 0.008, 0.01, [0.35, 1.0 + i * 0.03, -0.43]));   // M3 radiator fins
  deckMetal.push(rod(V3(0.4, 1.13, 0.42), V3(0.4, 1.38, 0.42), 0.006, 5), bake(new THREE.SphereGeometry(0.012, 8, 6), [0.4, 1.39, 0.42]));
  deckMetal.push(cyl(0.05, 0.06, 0.12, 12, [-0.6, 0.85, -0.6]), cyl(0.05, 0.06, 0.12, 12, [-0.45, 0.85, -0.65]));   // star sensor hoods
  add(g, deckMetal, M.alu);
  add(g, [cyl(0.055, 0.055, 0.01, 16, [-0.12, 1.055, 0.62]), cyl(0.035, 0.035, 0.01, 12, [-0.42, 1.125, 0.3]), cyl(0.035, 0.035, 0.01, 12, [-0.18, 1.125, 0.3]), box(0.12, 0.08, 0.01, [0.35, 0.94, -0.071]), cyl(0.04, 0.04, 0.01, 12, [-0.6, 0.915, -0.6]), cyl(0.04, 0.04, 0.01, 12, [-0.45, 0.915, -0.65])], M.lens);
  // underside: LAM, thruster clusters at the corners
  const lam = bellNozzle([[0.05, -0.82], [0.07, -0.9], [0.11, -1.02], [0.15, -1.12]], sg, { lip: 0.006 });
  add(g, [lam.bell, lam.lip], M.nozzleRad); add(g, [lam.throat, cyl(0.12, 0.14, 0.08, sg, [0, -0.79, 0]), planarUV(box(1.52, 0.03, 1.52, [0, -0.765, 0]), 1)], M.kapton);
  const thr = [];
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { thr.push(...thruster(V3(x * 0.62, -0.78, z * 0.62), V3(x * 0.3, -1, z * 0.3), 0.04, 10)); if (!lite) thr.push(...thruster(V3(x * 0.7, -0.62, z * 0.77), V3(0, 0, z), 0.03, 8)); }
  add(g, thr, M.nozzleRad);
  // solar wing on +x: drive, yoke, hinge, panel
  const wing = new THREE.Group(); wing.position.set(0.76, 0, 0); g.add(wing);
  add(wing, [bake(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16), [0.06, 0, 0], [0, 0, Math.PI / 2]), rod(V3(0.1, 0, 0), V3(0.5, 0, 0), 0.03, 8), rod(V3(0.5, 0, 0), V3(0.9, 0, -0.55), 0.022, 6), rod(V3(0.5, 0, 0), V3(0.9, 0, 0.55), 0.022, 6), ...hingeGeos(0.9, 1.8, 0.035)], M.alu);
  const panel = solarPanel(2.15, 1.8, 0.035, M); panel.position.x = 0.9; wing.add(panel);
  // high-gain dish on a boom from −x (dual-axis gimbal at the dish)
  add(g, [rod(V3(-0.75, -0.2, 0), V3(-1.5, -0.6, 0), 0.028, 8), cyl(0.06, 0.06, 0.1, 12, [-0.78, -0.21, 0]), bake(new THREE.SphereGeometry(0.05, 10, 8), [-1.5, -0.6, 0])], M.alu);
  const dish = new THREE.Group(); dish.position.set(-1.55, -0.62, 0); dish.rotation.z = Math.PI / 2 + 0.4; g.add(dish);
  const hg = antenna(0.36, 0.1, 0.25, lite ? 18 : 36, { struts: 3, sub: true });
  add(dish, [hg.dish], M.dish); add(dish, [...hg.metal, bake(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 10), [0, -0.08, 0], [0, 0, Math.PI / 2])], M.alu);
  return { group: g, wing };
}

// MARS ORBITER MISSION (2014): 1.5 m gold bus, a 2.2 m reflector on top with its feed, one three-panel wing,
// the 440 N liquid apogee motor below, thruster clusters, payloads on the +z face
export function buildMOM(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const sg = lite ? 14 : 28;
  busBody(g, M, 1.5, 1.5, 1.5, { sg });
  add(g, [planarUV(box(1.52, 0.04, 1.52, [0, 0.77, 0]), 1), planarUV(box(0.04, 0.9, 1.0, [0, 0, 0.77]), 0.6)], M.silver);
  add(g, [planarUV(box(1.0, 0.95, 0.012, [0.05, 0.05, -0.756]), 0.5)], M.osr);
  add(g, [planarUV(box(1.52, 0.04, 1.52, [0, -0.77, 0]), 1), planarUV(box(0.05, 0.6, 0.6, [-0.77, 0.2, 0]), 0.6)], M.kapton);
  // payloads on +z: colour camera, methane sensor, thermal imager, Lyman-alpha photometer
  const pl = [box(0.22, 0.2, 0.18, [-0.35, 0.3, 0.84]), box(0.3, 0.16, 0.2, [0.3, 0.35, 0.85]), box(0.2, 0.2, 0.16, [0.35, -0.3, 0.83]), box(0.16, 0.24, 0.16, [-0.35, -0.3, 0.83])];
  add(g, pl.map((q) => planarUV(q, 0.6)), M.silver);
  add(g, [cyl(0.05, 0.05, 0.06, 12, [-0.35, 0.3, 0.95], [Math.PI / 2, 0, 0]), cyl(0.06, 0.07, 0.08, 12, [0.35, -0.3, 0.94], [Math.PI / 2, 0, 0]), cyl(0.04, 0.04, 0.08, 12, [-0.35, -0.3, 0.94], [Math.PI / 2, 0, 0])], M.alu);
  add(g, [cyl(0.04, 0.04, 0.01, 12, [-0.35, 0.3, 0.985], [Math.PI / 2, 0, 0]), cyl(0.05, 0.05, 0.01, 12, [0.35, -0.3, 0.985], [Math.PI / 2, 0, 0]), cyl(0.03, 0.03, 0.01, 12, [-0.35, -0.3, 0.985], [Math.PI / 2, 0, 0]), box(0.2, 0.06, 0.01, [0.3, 0.35, 0.955])], M.lens);
  // 2.2 m HGA on a short pedestal; medium-gain horn and low-gain antennas
  const dish = new THREE.Group(); dish.position.set(0, 0.95, 0); g.add(dish);
  const hg = antenna(1.1, 0.28, 0.82, lite ? 24 : 48, { struts: 4, sub: false });
  add(dish, [hg.dish], M.dish); add(dish, hg.metal, M.alu);
  add(g, [cyl(0.12, 0.16, 0.2, 14, [0, 0.83, 0]), lathe([[0.03, 0.79], [0.05, 0.86], [0.11, 1.0]], 12).translate(0.55, 0, -0.55), cyl(0.012, 0.012, 0.3, 6, [-0.6, 0.94, 0.6]), lathe([[0.001, 0], [0.04, 0.03], [0.001, 0.08]], 10).translate(-0.6, 1.08, 0.6)], M.alu);
  // single solar wing (+x): drive, yoke, three hinged panels
  const wing = new THREE.Group(); wing.position.set(0.76, 0, 0); g.add(wing);
  add(wing, [bake(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16), [0.06, 0, 0], [0, 0, Math.PI / 2]), rod(V3(0.1, 0, 0), V3(0.3, 0, 0), 0.03, 8), rod(V3(0.3, 0, 0), V3(0.5, 0, -0.6), 0.022, 6), rod(V3(0.3, 0, 0), V3(0.5, 0, 0.6), 0.022, 6), ...hingeGeos(0.5, 1.75, 0.035), ...hingeGeos(0.5 + 1.44, 1.75, 0.035), ...hingeGeos(0.5 + 2.88, 1.75, 0.035)], M.alu);
  for (let i = 0; i < 3; i++) { const p = solarPanel(1.4, 1.75, 0.035, M); p.position.x = 0.52 + i * 1.44; wing.add(p); }
  // liquid apogee motor: radiation-cooled bell with bands, injector + valve block; four thruster clusters
  const lam = bellNozzle([[0.07, -0.86], [0.1, -0.98], [0.16, -1.18], [0.2, -1.32]], sg, { lip: 0.008 });
  const noz = new THREE.Group(); g.add(noz);
  add(noz, [lam.bell, lam.lip], M.nozzleRad); add(noz, [lam.throat, cyl(0.16, 0.2, 0.12, sg, [0, -0.83, 0])], M.dark);
  add(g, [cyl(0.09, 0.08, 0.1, 14, [0, -0.83, 0]), box(0.3, 0.3, 0.3, [0.5, -0.9, 0.5]), ...[0, 1, 2].map((i) => rod(V3(0.09 * Math.cos(i * 2.1), -0.8, 0.09 * Math.sin(i * 2.1)), V3(0.12 * Math.cos(i * 2.1), -0.9, 0.12 * Math.sin(i * 2.1)), 0.008, 5))], M.alu);
  const thr = [];
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a); thr.push(...thruster(V3(c * 0.68, -0.8, s * 0.68), V3(c * 0.25, -1, s * 0.25), 0.045, 10)); if (!lite) thr.push(...thruster(V3(c * 0.66, -0.7, s * 0.66), V3(c, 0, s), 0.03, 8)); }
  add(g, thr, M.nozzleRad);
  return { group: g, exit: V3(0, -1.34, 0), wing, dish };
}

// ================================================================== VIKRAM (Chandrayaan-3 lander)
// 2 × 2 × 1.17 m gold-foil body, four legs (shock-absorbing primary strut, A-frame secondaries, ball-jointed
// footpads), four throttleable engines, side solar panels, deck antennas and payloads, a two-segment ramp folded
// across the rover bay on +x. Origin: centre of the body's underside.
export const VIKRAM = { legDrop: 0.875, bayFloor: 0.02, rampLen: 0.95 };
export function buildVikram(M, { lite = false } = {}) {
  const g = new THREE.Group();
  const sg = lite ? 12 : 24;
  const BH = 1.17, BY = 0.02, BT = 0.79;
  add(g, [
    box(1.15, BH, 2, [-0.425, BH / 2, 0]), box(0.85, BH - BT, 2, [0.575, (BH + BT) / 2, 0]),
    box(0.85, BT, 0.53, [0.575, BT / 2, 0.735]), box(0.85, BT, 0.53, [0.575, BT / 2, -0.735]),
  ].map((q) => planarUV(q, 1.0)), M.gold);
  // corner angles and seam battens
  const ang = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) ang.push(box(0.035, BH, 0.035, [x, BH / 2, z]));
  for (const y of [0, BH]) { for (const x of [-1, 1]) ang.push(box(0.035, 0.035, 2.0, [x, y, 0])); for (const z of [-1, 1]) ang.push(box(2.0, 0.035, 0.035, [0, y, z])); }
  ang.push(box(0.03, 0.03, 0.96, [1.0, BT, 0]), box(0.03, BT, 0.03, [1.0, BT / 2, 0.48]), box(0.03, BT, 0.03, [1.0, BT / 2, -0.48]));
  add(g, ang, M.alu);
  // rover bay: walls, floor rails, the rover's hold-down posts and harness
  add(g, [box(0.85, 0.02, 0.94, [0.575, 0.01, 0]), box(0.02, BT, 0.94, [0.16, BT / 2, 0]), box(0.85, 0.02, 0.94, [0.575, BT - 0.01, 0]), box(0.85, BT, 0.01, [0.575, BT / 2, 0.47]), box(0.85, BT, 0.01, [0.575, BT / 2, -0.47])], M.bay);
  add(g, [box(0.8, 0.012, 0.03, [0.58, 0.026, 0.34]), box(0.8, 0.012, 0.03, [0.58, 0.026, -0.34]), cyl(0.02, 0.02, 0.12, 8, [0.3, 0.72, 0.3]), cyl(0.02, 0.02, 0.12, 8, [0.3, 0.72, -0.3]), cyl(0.02, 0.02, 0.12, 8, [0.85, 0.72, 0])], M.alu);
  // top deck: silver foil, radiator, instrument boxes, IDSN dish on a mast, patch antennas, ChaSTE + RAMBHA booms
  add(g, [planarUV(box(2.02, 0.04, 2.02, [0, BH + 0.02, 0]), 1), planarUV(box(0.5, 0.18, 0.4, [-0.5, BH + 0.13, 0.5]), 0.5), planarUV(box(0.36, 0.26, 0.3, [0.45, BH + 0.17, -0.55]), 0.5)], M.silver);
  add(g, [planarUV(box(0.9, 0.05, 0.7, [-0.4, BH + 0.065, -0.45]), 0.5)], M.osr);
  const deckM = [cyl(0.03, 0.03, 0.35, 8, [-0.6, BH + 0.2, -0.65]), cyl(0.05, 0.05, 0.06, 10, [-0.6, BH + 0.38, -0.65]), cyl(0.12, 0.12, 0.2, sg, [0.55, BH + 0.14, 0.55])];
  deckM.push(cyl(0.06, 0.06, 0.012, 16, [0.1, BH + 0.046, 0.7]), cyl(0.06, 0.06, 0.012, 16, [0.3, BH + 0.046, 0.7]));
  // ChaSTE: a stowed probe on a fold-out arm; RAMBHA-LP: two booms from the top corners with spherical probes
  deckM.push(box(0.12, 0.1, 0.12, [0.75, BH + 0.09, 0.15]), rod(V3(0.75, BH + 0.14, 0.15), V3(0.4, BH + 0.16, 0.15), 0.012, 6), rod(V3(0.4, BH + 0.16, 0.15), V3(0.4, BH + 0.06, 0.15), 0.02, 8));
  for (const [x, z] of [[-1, 1], [1, -1]]) { const p0 = V3(x * 0.98, BH + 0.02, z * 0.98), p1 = V3(x * 1.55, BH + 0.25, z * 1.55); deckM.push(rod(p0, p1, 0.008, 5), bake(new THREE.SphereGeometry(0.03, 10, 8), p1.toArray()), box(0.06, 0.05, 0.06, p0.toArray())); }
  add(g, deckM, M.alu);
  const dsh = new THREE.Group(); dsh.position.set(-0.6, BH + 0.41, -0.65); dsh.rotation.set(0.4, 0, 0.5); g.add(dsh);
  const ida = antenna(0.22, 0.06, 0.16, lite ? 14 : 28, { struts: 3 }); add(dsh, [ida.dish], M.dish); add(dsh, ida.metal, M.alu);
  add(g, [cyl(0.1, 0.1, 0.012, sg, [0.55, BH + 0.245, 0.55])], M.dish);
  // hazard cameras on the +x face above the bay; lens cells
  add(g, [box(0.1, 0.08, 0.08, [1.04, 1.0, 0.3]), box(0.1, 0.08, 0.08, [1.04, 1.0, -0.3])], M.dark);
  add(g, [cyl(0.025, 0.025, 0.01, 12, [1.095, 1.0, 0.3], [0, 0, Math.PI / 2]), cyl(0.025, 0.025, 0.01, 12, [1.095, 1.0, -0.3], [0, 0, Math.PI / 2])], M.lens);
  // side solar panels on −z and −x (cells outward), with frames and stand-offs
  { const pz = solarPanel(1.8, 0.95, 0.03, M); pz.rotation.x = -Math.PI / 2; pz.position.set(-0.9, 0.62, -1.035); g.add(pz);
    const px = solarPanel(1.6, 0.95, 0.03, M); px.rotation.set(-Math.PI / 2, Math.PI / 2, 0, 'YXZ'); px.position.set(-1.035, 0.62, 0.8); g.add(px); }
  // underside: black kapton, laser Doppler velocimeter, Ka-band altimeter, landing cameras
  add(g, [planarUV(box(1.6, 0.06, 1.6, [0, -0.03, 0]), 1)], M.kapton);
  add(g, [box(0.3, 0.02, 0.3, [0.0, -0.07, 0.3]), cyl(0.05, 0.05, 0.08, 12, [-0.2, -0.1, -0.15]), cyl(0.05, 0.05, 0.08, 12, [0.2, -0.1, -0.15]), cyl(0.04, 0.04, 0.06, 12, [0, -0.09, -0.35])], M.alu);
  add(g, [cyl(0.04, 0.04, 0.01, 12, [-0.2, -0.145, -0.15]), cyl(0.04, 0.04, 0.01, 12, [0.2, -0.145, -0.15]), cyl(0.03, 0.03, 0.01, 12, [0, -0.125, -0.35])], M.lens);
  // engines: 800 N throttleable, radiation-cooled bells with injector blocks
  const nzB = [], nzD = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const n = bellNozzle([[0.055, 0.0], [0.075, -0.07], [0.11, -0.18], [0.14, -0.26]], sg, { lip: 0.006 });
    for (const q of [n.bell, n.lip]) nzB.push(q.translate(sx * 0.55, 0, sz * 0.55));
    nzD.push(n.throat.translate(sx * 0.55, 0, sz * 0.55), cyl(0.09, 0.08, 0.06, sg, [sx * 0.55, -0.065, sz * 0.55]));
  }
  add(g, nzB, M.nozzleRad); add(g, nzD, M.dark);
  // legs
  const L = [], pads = [], boots = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = V3(sx * 0.98, 0.45, sz * 0.98), foot = V3(sx * 1.42, -0.78, sz * 1.42), knee = V3(sx * 1.25, -0.35, sz * 1.25);
    const mid = top.clone().lerp(foot, 0.5);
    L.push(rod(top, mid.clone().lerp(foot, 0.1), 0.05, lite ? 8 : 14), rod(mid, foot, 0.034, lite ? 8 : 12));
    boots.push(rod(mid.clone().lerp(top, 0.02), mid.clone().lerp(foot, 0.14), 0.056, lite ? 8 : 14));
    for (const s0 of [V3(sx * 0.98, 0.02, sz * 0.4), V3(sx * 0.4, 0.02, sz * 0.98)]) { L.push(rod(s0, knee, 0.024, 8), cyl(0.04, 0.04, 0.06, 10, s0.toArray())); }
    L.push(bake(new THREE.SphereGeometry(0.05, 12, 8), knee.toArray()), bake(new THREE.SphereGeometry(0.05, 12, 8), foot.toArray()), cyl(0.07, 0.07, 0.08, 12, top.toArray()));
    // footpad: shallow dish with a rim, crushable core visible at the edge
    pads.push(lathe([[0.001, -0.875], [0.15, -0.875], [0.2, -0.866], [0.224, -0.848], [0.224, -0.832], [0.205, -0.824], [0.1, -0.81], [0.055, -0.79], [0.001, -0.79]], lite ? 14 : 28).translate(foot.x, 0, foot.z));
  }
  add(g, L, M.alu); add(g, pads, M.silver); add(g, boots, M.kapton);
  // ramp: two hinged segments — deck with anti-slip plate, side rails, ribs beneath, hinge knuckles
  const rl = VIKRAM.rampLen;
  const rampSeg = () => {
    const d = [planarUV(box(rl, 0.03, 0.86, [rl / 2, 0.015, 0]), 0.3), box(rl, 0.06, 0.03, [rl / 2, 0.06, 0.43]), box(rl, 0.06, 0.03, [rl / 2, 0.06, -0.43])];
    for (const z of [-0.25, 0, 0.25]) d.push(box(rl * 0.96, 0.04, 0.02, [rl / 2, -0.02, z]));
    for (let i = 0; i < 5; i++) d.push(box(0.02, 0.035, 0.84, [0.08 + i * (rl - 0.16) / 4, -0.017, 0]));
    for (const z of [-0.36, 0.36]) d.push(bake(new THREE.CylinderGeometry(0.022, 0.022, 0.12, 10), [0, 0.015, z], [Math.PI / 2, 0, 0]));
    return d;
  };
  const rampA = new THREE.Group(); rampA.position.set(1.0, BY, 0); g.add(rampA);
  add(rampA, rampSeg(), M.ramp);
  const rampB = new THREE.Group(); rampB.position.set(rl, 0, 0); rampA.add(rampB);
  add(rampB, rampSeg(), M.ramp);
  return { group: g, rampA, rampB, engines: [[-0.55, -0.55], [-0.55, 0.55], [0.55, -0.55], [0.55, 0.55]].map(([x, z]) => V3(x, -0.26, z)) };
}

// ================================================================== PRAGYAN (rover)
// six grousered wheels on a rocker-bogie, gold body, hinged solar panel, NavCam pair on a mast, antennas, APXS arm.
// Origin: centre of the wheel contact patch; drives along +x.
export function buildPragyan(M, { lite = false } = {}) {
  const g = new THREE.Group();
  add(g, [planarUV(box(0.8, 0.24, 0.52, [0, 0.33, 0]), 0.5)], M.gold);
  add(g, [planarUV(box(0.82, 0.02, 0.54, [0, 0.46, 0]), 0.5)], M.silver);
  add(g, [planarUV(box(0.8, 0.02, 0.52, [0, 0.205, 0]), 0.5)], M.kapton);
  const fr = [];
  for (const x of [-1, 1]) for (const z of [-1, 1]) fr.push(box(0.02, 0.25, 0.02, [x * 0.4, 0.33, z * 0.26]));
  add(g, fr, M.alu);
  // solar panel on its hinge (front cells up / back beneath)
  const panel = new THREE.Group(); panel.position.set(-0.38, 0.47, 0); panel.rotation.z = 0.42; g.add(panel);
  const sp = solarPanel(0.78, 0.56, 0.02, M); sp.position.y = 0.012; panel.add(sp);
  add(g, [bake(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 10), [-0.38, 0.47, 0], [Math.PI / 2, 0, 0]), rod(V3(-0.1, 0.47, 0.2), V3(-0.05, 0.6, 0.2), 0.006, 5)], M.alu);
  // NavCam mast + stereo pair, Rx / Tx antennas, LIBS window, APXS arm under the front
  add(g, [cyl(0.015, 0.015, 0.24, 8, [0.34, 0.58, 0]), box(0.05, 0.03, 0.3, [0.34, 0.7, 0]), box(0.06, 0.06, 0.06, [0.36, 0.7, 0.12]), box(0.06, 0.06, 0.06, [0.36, 0.7, -0.12]), box(0.04, 0.05, 0.08, [0.41, 0.33, -0.12])], M.dark);
  add(g, [cyl(0.018, 0.018, 0.01, 12, [0.395, 0.7, 0.12], [0, 0, Math.PI / 2]), cyl(0.018, 0.018, 0.01, 12, [0.395, 0.7, -0.12], [0, 0, Math.PI / 2]), cyl(0.02, 0.02, 0.01, 12, [0.432, 0.33, -0.12], [0, 0, Math.PI / 2])], M.lens);
  add(g, [rod(V3(-0.3, 0.47, 0.2), V3(-0.3, 0.68, 0.2), 0.005, 5), cyl(0.03, 0.03, 0.01, 12, [-0.3, 0.685, 0.2]), rod(V3(-0.3, 0.47, -0.2), V3(-0.3, 0.62, -0.2), 0.005, 5), cyl(0.025, 0.025, 0.02, 12, [-0.3, 0.63, -0.2]),
    rod(V3(0.38, 0.22, 0.15), V3(0.46, 0.18, 0.15), 0.01, 6), rod(V3(0.46, 0.18, 0.15), V3(0.46, 0.1, 0.15), 0.01, 6), cyl(0.03, 0.03, 0.05, 12, [0.46, 0.08, 0.15])], M.alu);
  // wheels: rim (closed lathe), grousers, spoke disc, hub motor
  const W = [], WD = [], links = [];
  const gr = lite ? 10 : 18, rs = lite ? 14 : 28;
  for (const sz of [-1, 1]) for (const x of [-0.3, 0, 0.3]) {
    const parts = [];
    parts.push(lathe([[0.09, -0.035], [0.1, -0.035], [0.1, 0.035], [0.09, 0.035], [0.09, -0.035]], rs));
    for (let i = 0; i < gr; i++) { const a = (i / gr) * TAU; parts.push(bake(new THREE.BoxGeometry(0.014, 0.072, 0.01), [Math.cos(a) * 0.104, 0, Math.sin(a) * 0.104], [0, -a, 0])); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.2; parts.push(bake(new THREE.BoxGeometry(0.06, 0.008, 0.012), [Math.cos(a) * 0.06, sz * 0.02, Math.sin(a) * 0.06], [0, -a, 0])); }
    parts.push(cyl(0.03, 0.03, 0.05, 14, [0, sz * 0.0, 0]));
    for (const p of parts) W.push(bake(p, [x, 0.1, sz * 0.34], [Math.PI / 2, 0, 0]));
    WD.push(bake(new THREE.CylinderGeometry(0.025, 0.025, 0.04, 12), [x, 0.1, sz * 0.295], [Math.PI / 2, 0, 0]));
  }
  // rocker-bogie (tubular links, pivot drums), differential bar across the top
  for (const sz of [-1, 1]) {
    const z = sz * 0.28, P = V3(-0.05, 0.27, z), B = V3(0.13, 0.19, z), Rr = V3(-0.3, 0.1, z), Rm = V3(0, 0.1, z), Rf = V3(0.3, 0.1, z), K = V3(-0.25, 0.2, z);
    links.push(rod(P, K, 0.012, 8), rod(K, Rr, 0.012, 8), rod(P, B, 0.012, 8), rod(B, Rm.clone().add(V3(0.0, 0.04, 0)), 0.011, 8), rod(Rm.clone().add(V3(0, 0.04, 0)), Rm, 0.011, 8), rod(B, Rf.clone().add(V3(0, 0.05, 0)), 0.011, 8), rod(Rf.clone().add(V3(0, 0.05, 0)), Rf, 0.011, 8));
    for (const q of [P, B]) links.push(bake(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 12), q.toArray(), [Math.PI / 2, 0, 0]));
    links.push(rod(V3(-0.05, 0.27, sz * 0.26), V3(-0.05, 0.27, sz * 0.31), 0.01, 6));
  }
  links.push(rod(V3(-0.05, 0.48, -0.28), V3(-0.05, 0.48, 0.28), 0.008, 6), rod(V3(-0.05, 0.48, 0.28), V3(-0.05, 0.27, 0.28), 0.006, 5), rod(V3(-0.05, 0.48, -0.28), V3(-0.05, 0.27, -0.28), 0.006, 5));
  add(g, W, M.wheel); add(g, WD, M.dark); add(g, links, M.alu);
  return { group: g, gauge: 0.34 };
}
