// THE ITALIAN RENAISSANCE — the Sistine Chapel, Vatican: a tall rectangular hall (40.9 × 13.4 m) under a
// flattened barrel vault (20.7 m at the crown) that Michelangelo painted in 1508–1512. The vault carries
// a painted architectural framework: a central strip of nine narrative panels (small and large in turn,
// the small ones framed by seated youths and bronze-coloured medallions), seers enthroned between the
// triangular spandrels along the sides, lunettes over the windows; below them the walls' earlier
// frescoes and painted drapery. Every picture here is procedural and stylised — painterly fields of
// fresco colour, no copied imagery. Michelangelo worked from the entrance towards the altar: the ceiling's
// colour sweeps in that direction (a sepia cartoon until the brush reaches it).
// The Creation of Adam is the fourth panel from the altar; its two reaching hands are drawn here as
// stroke art from signed-distance primitives (as renaissance.js draws its figure), over a fresco wash.
// Units: metres, chapel-local (floor y = 0, x from the entrance −20.45 to the altar +20.45).
import * as THREE from 'three';
import { rng, lerp, sat } from '../lib/math.js';
import { noise2, fbm2 } from '../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { smin, sdRoundCone2, sdEllipse2 } from '../lib/sdfmesh.js';
import { V, mergeParts, at, contour, hatchField, inkOpts, orderedStrokes, SEPIA, CHALK } from './italy-assets.js';

export const HALL = { L: 40.9, W: 13.4, WALL: 15.0, RISE: 5.7 };
const HX = HALL.L / 2, HZ = HALL.W / 2;
export const vaultY = (z) => HALL.WALL + HALL.RISE * Math.sqrt(Math.max(0, 1 - (z / HZ) ** 2));
const WIN_X = [-17, -10.2, -3.4, 3.4, 10.2, 17];

// the nine panels, from the altar (+x) towards the entrance, small and large in turn
const RIB = 0.55, PS = 2.455, PL = 3.8;
export const PANELS = (() => {
  const out = []; let x = 16.5 - RIB;
  for (let i = 0; i < 9; i++) { const w = i % 2 ? PL : PS; out.push({ i, x0: x - w, x1: x, xc: x - w / 2, w, large: i % 2 === 1 }); x -= w + RIB; }
  return out;
})();
export const ADAM = PANELS[3];          // the Creation of Adam
export const COMP = { w: 5.6, h: 2.8 }; // the composition (across the chapel × along it)
const STRIP = 2.95;                     // half-width of the central strip (arc metres)

// vault arc: α from 0 (z = +HZ) to π (z = −HZ); arc-length tables
const NA = 400, ARC = [0];
for (let i = 1; i <= NA; i++) { const a0 = Math.PI * (i - 1) / NA, a1 = Math.PI * i / NA; ARC.push(ARC[i - 1] + Math.hypot(HZ * (Math.cos(a1) - Math.cos(a0)), HALL.RISE * (Math.sin(a1) - Math.sin(a0)))); }
const ARC_L = ARC[NA];
const arcOfAlpha = (a) => { const f = a / Math.PI * NA, i = Math.min(NA - 1, Math.floor(f)); return lerp(ARC[i], ARC[i + 1], f - i); };
const arcOfZ = (z) => arcOfAlpha(Math.acos(Math.max(-1, Math.min(1, z / HZ))));

// ------------------------------------------------------------------------------------ painting kit
const FR = { lapis: '#2f5a9a', azure: '#7aa0c8', sky: '#c3cdc8', ochre: '#d39a3c', gold: '#e0b24e', verde: '#6f8a4e', rose: '#d0705c', red: '#a8321f', flesh: '#e2b48e', fleshD: '#9a6444', plaster: '#e6d8bc', stone: '#cfc2a6', stoneD: '#8c7d63', umber: '#5b3f2a', lilac: '#a07ab0', green: '#4f8150' };
function figureBlob(g, x, y, s, r, cloth, seated = true) {
  // a draped figure in soft painted masses: a mantle over the body, a lit flank, a head turned in
  // three-quarter (no features), an arm and a foot; seated figures fold at the knee
  g.save(); g.translate(x, y); g.scale(s, s);
  const lean = (r() - 0.5) * 0.6, nude = cloth === FR.flesh;
  g.rotate(lean * 0.35);
  const C = nude ? FR.flesh : cloth;
  const body = g.createLinearGradient(-28, -30, 26, 40);
  body.addColorStop(0, tint(C, 1.25)); body.addColorStop(0.55, C); body.addColorStop(1, shade(C, 0.5));
  g.fillStyle = body;
  g.beginPath();
  if (seated) { g.moveTo(-14, -22); g.bezierCurveTo(-26, -6, -30, 18, -26, 34); g.bezierCurveTo(-10, 38, 18, 30, 36, 40); g.lineTo(40, 58); g.lineTo(18, 60); g.bezierCurveTo(4, 48, -20, 54, -30, 50); g.bezierCurveTo(-34, 30, -24, 0, -18, -22); g.moveTo(-14, -22); g.bezierCurveTo(4, -26, 16, -18, 18, -4); g.bezierCurveTo(20, 10, 14, 28, 10, 34); g.lineTo(-26, 34); g.closePath(); }
  else { g.moveTo(-12, -22); g.bezierCurveTo(-22, 10, -24, 50, -18, 80); g.lineTo(16, 80); g.bezierCurveTo(22, 50, 20, 6, 12, -22); g.closePath(); }
  g.fill();
  // folds: shadowed troughs and lit ridges
  g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    const fx = -20 + i * 8 + r() * 4, fy = -8 + r() * 10;
    g.strokeStyle = shade(C, 0.42); g.globalAlpha = 0.45; g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + (r() - 0.5) * 18, fy + 26, fx + (r() - 0.5) * 12 + 4, fy + 52); g.stroke();
    g.strokeStyle = tint(C, 1.45); g.globalAlpha = 0.35; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(fx + 3, fy + 2); g.quadraticCurveTo(fx + 3 + (r() - 0.5) * 14, fy + 26, fx + 6, fy + 48); g.stroke();
  }
  g.globalAlpha = 1;
  // arm, foot and head (three-quarter, hair in shadow)
  g.strokeStyle = shade(FR.flesh, 0.92); g.lineWidth = 6.5;
  g.beginPath(); g.moveTo(10, -14); g.quadraticCurveTo(26 + r() * 8, -2, 16 + r() * 16, 14 + r() * 12); g.stroke();
  g.strokeStyle = tint(FR.flesh, 1.12); g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(11, -15); g.quadraticCurveTo(25, -4, 20, 10); g.stroke();
  g.fillStyle = FR.flesh; g.beginPath(); g.ellipse(seated ? 30 : 2, seated ? 60 : 82, 7, 3.5, 0, 0, 7); g.fill();
  const hg = g.createRadialGradient(-2, -34, 1, 1, -32, 9);
  hg.addColorStop(0, tint(FR.flesh, 1.15)); hg.addColorStop(1, FR.fleshD);
  g.fillStyle = hg; g.beginPath(); g.ellipse(1, -32, 7, 8.5, lean, 0, Math.PI * 2); g.fill();
  g.fillStyle = shade(FR.umber, 0.85); g.globalAlpha = 0.75; g.beginPath(); g.ellipse(3, -37, 7.5, 5, lean + 0.3, Math.PI * 0.9, Math.PI * 2.1); g.fill(); g.globalAlpha = 1;
  // a contour in brown, as fresco painters drew over the colour
  g.strokeStyle = 'rgba(70,40,20,0.35)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-14, -22); g.bezierCurveTo(-26, -6, -30, 18, -26, 34); g.stroke();
  g.restore();
}
function soften(c, px) {
  const t = mkCanvas(c.width, c.height), gt = t.getContext('2d');
  gt.filter = `blur(${px}px)`; gt.drawImage(c, 0, 0);
  const g = c.getContext('2d'); g.globalAlpha = 0.85; g.drawImage(t, 0, 0); g.globalAlpha = 1;
}
function shade(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return `#${c.getHexString()}`; }
function tint(hex, k) { const c = new THREE.Color(hex); c.r = Math.min(1, c.r * k); c.g = Math.min(1, c.g * k); c.b = Math.min(1, c.b * k); return `#${c.getHexString()}`; }
function stoneFrame(g, x, y, w, h, t, light = FR.stone) {
  // an illusionistic stone moulding (lit from above)
  g.fillStyle = light; g.fillRect(x, y, w, h);
  g.fillStyle = tint(light, 1.18); g.fillRect(x, y, w, t * 0.35);
  g.fillStyle = shade(light, 0.62); g.fillRect(x, y + h - t * 0.3, w, t * 0.3);
  g.strokeStyle = shade(light, 0.5); g.lineWidth = 1; g.strokeRect(x + t * 0.5, y + t * 0.5, w - t, h - t);
}
function scenePanel(g, x, y, w, h, r, kind) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  const sky = g.createLinearGradient(x, y, x, y + h);
  sky.addColorStop(0, kind % 3 === 0 ? '#7e9cc0' : '#a9bccb'); sky.addColorStop(1, '#eadfc4');
  g.fillStyle = sky; g.fillRect(x, y, w, h);
  // clouds and a ground band
  for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(245,240,228,${0.15 + r() * 0.2})`; g.beginPath(); g.ellipse(x + r() * w, y + r() * h * 0.6, w * (0.1 + r() * 0.2), h * (0.04 + r() * 0.08), 0, 0, 7); g.fill(); }
  g.fillStyle = kind % 2 ? FR.verde : FR.ochre;
  g.beginPath(); g.moveTo(x, y + h * 0.78); g.bezierCurveTo(x + w * 0.3, y + h * (0.66 + r() * 0.1), x + w * 0.7, y + h * (0.8 + r() * 0.08), x + w, y + h * 0.72); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
  // figures
  const n = 2 + Math.floor(r() * 3);
  const cloths = [FR.rose, FR.lapis, FR.green, FR.ochre, FR.lilac, FR.red];
  for (let i = 0; i < n; i++) figureBlob(g, x + w * (0.18 + 0.64 * (i + 0.5) / n) + (r() - 0.5) * w * 0.08, y + h * (0.42 + r() * 0.12), h / 150 * (0.85 + r() * 0.3), r, cloths[Math.floor(r() * cloths.length)], r() < 0.5);
  if (kind % 4 === 1) { g.strokeStyle = 'rgba(80,60,40,0.5)'; g.lineWidth = h * 0.02; g.beginPath(); g.arc(x + w * 0.5, y + h * 1.25, h * 0.75, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  g.restore();
  g.strokeStyle = shade(FR.umber, 0.8); g.lineWidth = 2; g.strokeRect(x, y, w, h);
}
function frescoFinish(g, W, H, seed) {
  // granular plaster, giornate seams, craquelure and soft discoloration
  const r = rng(seed);
  for (let i = 0; i < W * H / 220; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,250,235' : '60,40,25'},${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2.5); }
  g.strokeStyle = 'rgba(70,50,30,0.12)'; g.lineWidth = 0.7;
  for (let i = 0; i < 160; i++) {
    let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(110,85,55,${0.03 + r() * 0.05})`; g.beginPath(); g.ellipse(r() * W, r() * H, 40 + r() * 160, 30 + r() * 90, r() * 3, 0, 7); g.fill(); }
}

// ------------------------------------------------------------------------------------ the vault
function vaultCanvas(lite) {
  const W = lite ? 1536 : 2048, H = W / 2, g0 = mkCanvas(W, H), g = g0.getContext('2d'), r = rng(1508);
  const px = (x) => (x + HX) / HALL.L * W, py = (arc) => arc / ARC_L * H;
  const cy = ARC_L / 2;
  // plaster
  g.fillStyle = FR.plaster; g.fillRect(0, 0, W, H);
  // side zones: seers' thrones between triangular spandrels; spandrels over the windows
  for (const side of [0, 1]) {
    const a0 = side ? cy + STRIP : 0, a1 = side ? ARC_L : cy - STRIP;
    const outer = side ? ARC_L : 0, inner = side ? cy + STRIP : cy - STRIP;
    // painted pilaster ground
    g.fillStyle = shade(FR.plaster, 0.92); g.fillRect(0, py(a0), W, py(a1) - py(a0));
    for (const wx of WIN_X) {
      // spandrel: a triangle on the springing above each window, a dark ground with a family group
      const sp = 2.3, depth = 3.3 * (side ? -1 : 1);
      g.fillStyle = side ? '#3f5560' : '#4d5a48';
      g.beginPath(); g.moveTo(px(wx - sp), py(outer)); g.lineTo(px(wx + sp), py(outer)); g.lineTo(px(wx), py(outer + depth)); g.closePath(); g.fill();
      g.strokeStyle = FR.stone; g.lineWidth = 6; g.stroke();
      figureBlob(g, px(wx), py(outer + depth * 0.45), 0.42, r, [FR.ochre, FR.rose, FR.green][Math.floor(r() * 3)], true);
      // bronze-coloured nudes in the corners above
      g.fillStyle = shade(FR.gold, 0.6); g.globalAlpha = 0.8;
      for (const s2 of [-1, 1]) { g.beginPath(); g.ellipse(px(wx + s2 * 1.9), py(outer + depth * 1.08), 10, 18, s2 * 0.5, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }
    // thrones between the windows (and at the ends): a niche with a seated seer, putti pilasters
    for (const tx of [-20.0, -13.6, -6.8, 0, 6.8, 13.6, 20.0]) {
      if (Math.abs(tx) === 20) continue;
      const w = 2.6, x0 = px(tx - w / 2), x1 = px(tx + w / 2);
      const yA = py(side ? inner + 0.15 : outer + 0.4), yB = py(side ? outer - 0.4 : inner - 0.15);
      const y0 = Math.min(yA, yB), y1 = Math.max(yA, yB);
      stoneFrame(g, x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20, 14);
      const ng = g.createLinearGradient(x0, y0, x1, y1);
      ng.addColorStop(0, '#8a7a62'); ng.addColorStop(1, '#5d4e3c');
      g.fillStyle = ng; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const cloth = [FR.lapis, FR.rose, FR.green, FR.ochre, FR.lilac][Math.floor(r() * 5)];
      g.save(); g.translate((x0 + x1) / 2, (y0 + y1) / 2); if (side) g.rotate(Math.PI); g.translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      figureBlob(g, (x0 + x1) / 2, (y0 + y1) / 2 + (y1 - y0) * 0.05, (x1 - x0) / 85, r, cloth, true);
      g.restore();
      // marble putti pilasters either side
      for (const xx of [x0 - 16, x1 + 6]) { g.fillStyle = FR.stone; g.fillRect(xx, y0, 10, y1 - y0); g.fillStyle = tint(FR.stone, 1.15); g.fillRect(xx, y0, 3, y1 - y0); }
    }
  }
  // the central strip: a painted cornice along both edges, transverse ribs, nine panels
  const s0 = py(cy - STRIP), s1 = py(cy + STRIP);
  g.fillStyle = shade(FR.plaster, 0.95); g.fillRect(0, s0, W, s1 - s0);
  stoneFrame(g, px(-17.2), s0 - 14, px(17.2) - px(-17.2), 18, 18);
  stoneFrame(g, px(-17.2), s1 - 4, px(17.2) - px(-17.2), 18, 18);
  for (const P of PANELS) {
    const x0 = px(P.x0), x1 = px(P.x1);
    stoneFrame(g, px(P.x1), s0, px(P.x1 + RIB) - px(P.x1), s1 - s0, 10);
    if (P.i === 8) stoneFrame(g, px(P.x0 - RIB), s0, px(P.x0) - px(P.x0 - RIB), s1 - s0, 10);
    if (P.large) {
      scenePanel(g, x0 + 3, s0 + 6, x1 - x0 - 6, s1 - s0 - 12, r, P.i);
    } else {
      // small panel: a smaller picture framed by four seated youths and two medallions
      const m = (s1 - s0) * 0.2;
      g.fillStyle = shade(FR.plaster, 0.9); g.fillRect(x0, s0, x1 - x0, s1 - s0);
      scenePanel(g, x0 + 4, s0 + m, x1 - x0 - 8, s1 - s0 - 2 * m, r, P.i);
      for (const [fx, fy] of [[0.18, 0.1], [0.82, 0.1], [0.18, 0.9], [0.82, 0.9]]) figureBlob(g, x0 + (x1 - x0) * fx, s0 + (s1 - s0) * fy, (x1 - x0) / 260, r, FR.flesh, true);
      for (const fy of [0.08, 0.92]) { const mg = g.createRadialGradient(x0 + (x1 - x0) * 0.5, s0 + (s1 - s0) * fy, 2, x0 + (x1 - x0) * 0.5, s0 + (s1 - s0) * fy, 16); mg.addColorStop(0, '#e6c27a'); mg.addColorStop(1, '#7a5a2c'); g.fillStyle = mg; g.beginPath(); g.arc(x0 + (x1 - x0) * 0.5, s0 + (s1 - s0) * fy, 15, 0, 7); g.fill(); }
    }
  }
  // the ends of the vault (beyond the panels): pendentive scenes
  for (const ex of [-19, 19]) scenePanel(g, px(ex - 1.3), py(cy - STRIP), px(ex + 1.3) - px(ex - 1.3), py(cy + STRIP) - py(cy - STRIP), r, 5);
  soften(g0, 1.3);
  frescoFinish(g, W, H, 3);
  return g0;
}

// a long wall: painted drapery, the earlier fresco cycle, popes in niches, windows, lunettes
function wallCanvas(lite) {
  const W = lite ? 1536 : 2048, H = Math.round(W * HALL.WALL / HALL.L), c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(1481);
  const e = mkCanvas(W / 4, H / 4), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, e.width, e.height);
  const px = (x) => (x + HX) / HALL.L * W, py = (y) => (1 - y / HALL.WALL) * H;
  g.fillStyle = FR.plaster; g.fillRect(0, 0, W, H);
  // drapery (0–5.3 m): silver-grey hangings with gold borders
  for (let x = 0; x < W; x += 2) {
    const k = 0.75 + 0.25 * Math.sin(x * 0.18) * Math.sin(x * 0.031 + 1) + noise2(x * 0.01, 1) * 0.05;
    g.fillStyle = `rgb(${200 * k | 0},${192 * k | 0},${176 * k | 0})`; g.fillRect(x, py(5.1), 2, py(0.3) - py(5.1));
  }
  g.fillStyle = FR.gold; g.fillRect(0, py(5.15), W, 6); g.fillRect(0, py(0.45), W, 5);
  stoneFrame(g, 0, py(5.6), W, py(5.2) - py(5.6), 10);
  // the fresco cycle (5.6–10.4 m): six fields between painted pilasters
  for (let i = 0; i < 6; i++) {
    const x0 = px(-HX + 0.6 + i * (HALL.L - 1.2) / 6), x1 = px(-HX + 0.6 + (i + 1) * (HALL.L - 1.2) / 6) - 14;
    scenePanel(g, x0 + 8, py(10.3), x1 - x0 - 8, py(5.7) - py(10.3), r, i + 2);
    g.fillStyle = FR.stone; g.fillRect(x1, py(10.4), 14, py(5.6) - py(10.4));
  }
  stoneFrame(g, 0, py(10.8), W, py(10.35) - py(10.8), 10);
  // windows, with the popes in niches between them and the lunettes above
  for (const wx of WIN_X) {
    // lunette: a semicircle round the window head, figures either side
    const lc = py(12.6), lr = (px(2.4) - px(0));
    g.fillStyle = shade(FR.plaster, 0.85); g.beginPath(); g.arc(px(wx), lc, lr, Math.PI, 0); g.fill();
    g.strokeStyle = FR.stone; g.lineWidth = 8; g.stroke();
    for (const s of [-1, 1]) figureBlob(g, px(wx + s * 1.55), py(13.2), 0.5, r, [FR.rose, FR.green, FR.ochre, FR.lapis][Math.floor(r() * 4)], true);
    // the window: a round-headed opening
    const w2 = px(0.9) - px(0), x0 = px(wx) - w2, top = py(13.5);
    g.fillStyle = '#2a2018'; g.beginPath(); g.moveTo(x0, py(10.9)); g.lineTo(x0, top); g.arc(px(wx), top, w2, Math.PI, 0); g.lineTo(x0 + 2 * w2, py(10.9)); g.fill();
    g.strokeStyle = FR.stone; g.lineWidth = 10; g.stroke();
    // emissive: warm daylight in leaded panes
    const s = e.width / W;
    ge.fillStyle = '#fff1d6'; ge.beginPath(); ge.moveTo(x0 * s, py(10.9) * s); ge.lineTo(x0 * s, top * s); ge.arc(px(wx) * s, top * s, w2 * s, Math.PI, 0); ge.lineTo((x0 + 2 * w2) * s, py(10.9) * s); ge.fill();
    ge.strokeStyle = 'rgba(0,0,0,0.6)'; ge.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ge.beginPath(); ge.moveTo(x0 * s, (py(10.9) - (py(10.9) - top) * k / 4) * s); ge.lineTo((x0 + 2 * w2) * s, (py(10.9) - (py(10.9) - top) * k / 4) * s); ge.stroke(); }
    ge.beginPath(); ge.moveTo(px(wx) * s, py(10.9) * s); ge.lineTo(px(wx) * s, (top - w2) * s); ge.stroke();
  }
  for (let i = 0; i < WIN_X.length - 1; i++) {
    const nx = (WIN_X[i] + WIN_X[i + 1]) / 2, w = px(0.8) - px(0);
    g.fillStyle = '#6e604c'; g.beginPath(); g.moveTo(px(nx) - w, py(11.0)); g.lineTo(px(nx) - w, py(12.4)); g.arc(px(nx), py(12.4), w, Math.PI, 0); g.lineTo(px(nx) + w, py(11.0)); g.fill();
    figureBlob(g, px(nx), py(11.8), 0.55, r, [FR.red, FR.lilac, FR.ochre][Math.floor(r() * 3)], false);
  }
  soften(c, 1.0);
  frescoFinish(g, W, H, 7);
  return { map: c, emissive: e };
}
function endWallCanvas(altar) {
  const W = 1024, H = Math.round(W * HALL.WALL / HALL.W * 0.6), c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(altar ? 1536 : 1482);
  if (altar) {
    // the altar wall: a quiet blue field with soft clouds (its later fresco is not depicted)
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#4c6587'); gr.addColorStop(0.7, '#7d8fa2'); gr.addColorStop(1, '#9b8f78');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(230,225,210,${0.04 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * W, r() * H * 0.8, 40 + r() * 120, 12 + r() * 30, 0, 0, 7); g.fill(); }
  } else {
    g.fillStyle = FR.plaster; g.fillRect(0, 0, W, H);
    scenePanel(g, W * 0.06, H * 0.32, W * 0.4, H * 0.3, r, 1); scenePanel(g, W * 0.54, H * 0.32, W * 0.4, H * 0.3, r, 2);
    for (let x = 0; x < W; x += 2) { const k = 0.75 + 0.25 * Math.sin(x * 0.18); g.fillStyle = `rgb(${200 * k | 0},${192 * k | 0},${176 * k | 0})`; g.fillRect(x, H * 0.66, 2, H * 0.34); }
  }
  frescoFinish(g, W, H, altar ? 11 : 13);
  return c;
}
function floorCanvas() {
  // Cosmatesque inlay: porphyry and serpentine roundels in interlaced white bands, triangles between
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d'), r = rng(8);
  g.fillStyle = '#d9d0bf'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { g.fillStyle = (i + j) % 2 ? '#7c2e26' : '#36503f'; g.globalAlpha = 0.8; g.beginPath(); g.moveTo(i * 64, j * 64); g.lineTo(i * 64 + 32, j * 64 + 32); g.lineTo(i * 64, j * 64 + 64); g.fill(); }
  g.globalAlpha = 1;
  for (const [x, y, R] of [[S / 2, S / 2, S * 0.36], [0, 0, S * 0.22], [S, 0, S * 0.22], [0, S, S * 0.22], [S, S, S * 0.22]]) {
    g.fillStyle = '#ece5d6'; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
    g.fillStyle = '#6d2a22'; g.beginPath(); g.arc(x, y, R * 0.82, 0, 7); g.fill();
    g.fillStyle = '#ece5d6'; g.beginPath(); g.arc(x, y, R * 0.66, 0, 7); g.fill();
    g.fillStyle = (x + y) % 2 ? '#3c5a44' : '#7c3027'; g.beginPath(); g.arc(x, y, R * 0.55, 0, 7); g.fill();
  }
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * S, r() * S, 2, 2); }
  return c;
}

// ------------------------------------------------------------------------------------ the hands
// Composition coordinates: x across the chapel (−2.8 … 2.8: Adam on the left, God on the right),
// y along it (−1.4 … 1.4). Signed distance of each figure's arm and hand (round cones + ellipses).
export function handsField() {
  const prims = (list) => list;
  const adam = prims([
    ['c', -2.85, -0.66, -1.75, -0.42, 0.175, 0.13], ['c', -1.75, -0.42, -0.68, -0.07, 0.13, 0.083],
    ['e', -0.5, -0.07, 0.165, 0.074, -0.16], ['e', -1.25, -0.27, 0.32, 0.12, 0.34],
    ['c', -0.38, -0.055, -0.22, -0.065, 0.028, 0.022], ['c', -0.22, -0.065, -0.095, -0.11, 0.022, 0.018],
    ['c', -0.38, -0.095, -0.25, -0.145, 0.027, 0.023], ['c', -0.25, -0.145, -0.205, -0.21, 0.023, 0.019],
    ['c', -0.405, -0.115, -0.3, -0.17, 0.025, 0.021], ['c', -0.3, -0.17, -0.275, -0.228, 0.021, 0.018],
    ['c', -0.435, -0.125, -0.355, -0.18, 0.021, 0.018], ['c', -0.355, -0.18, -0.335, -0.22, 0.018, 0.015],
    ['c', -0.56, -0.005, -0.44, 0.035, 0.032, 0.024], ['c', -0.44, 0.035, -0.36, 0.022, 0.024, 0.02],
    // the raised knee the arm rests on, thigh and shin
    ['e', -2.0, -0.86, 0.3, 0.21, 0.25], ['c', -2.9, -1.35, -2.0, -0.88, 0.3, 0.2], ['c', -2.0, -0.9, -2.35, -1.5, 0.19, 0.14],
  ]);
  const god = prims([
    ['c', 2.85, 0.44, 1.75, 0.22, 0.2, 0.15], ['c', 1.75, 0.22, 0.62, 0.065, 0.12, 0.08],
    ['e', 0.47, 0.055, 0.15, 0.07, 0.06], ['e', 1.2, 0.15, 0.3, 0.115, 0.14],
    ['c', 0.36, 0.064, 0.2, 0.052, 0.026, 0.021], ['c', 0.2, 0.052, 0.075, 0.033, 0.021, 0.018],
    ['c', 0.36, 0.018, 0.27, -0.03, 0.026, 0.022], ['c', 0.27, -0.03, 0.3, -0.085, 0.022, 0.019],
    ['c', 0.395, 0.002, 0.31, -0.05, 0.024, 0.02], ['c', 0.31, -0.05, 0.34, -0.1, 0.02, 0.017],
    ['c', 0.425, -0.005, 0.36, -0.05, 0.02, 0.017], ['c', 0.36, -0.05, 0.39, -0.09, 0.017, 0.015],
    ['c', 0.52, 0.1, 0.42, 0.13, 0.03, 0.023], ['c', 0.42, 0.13, 0.34, 0.1, 0.023, 0.019],
  ]);
  const ev = (list, x, y) => {
    let d = 1e9;
    for (const p of list) {
      const v = p[0] === 'c' ? sdRoundCone2(x, y, p[1], p[2], p[3], p[4], p[5], p[6]) : sdEllipse2(x, y, [p[1], p[2]], [p[3], p[4]], p[5]);
      d = d === 1e9 ? v : smin(d, v, Math.min(0.02, (p[5] ?? 0.05) * 0.4));
    }
    return d;
  };
  const fA = (x, y) => (x > 0.05 ? 1 : ev(adam, x, y)), fG = (x, y) => (x < 0.02 ? 1 : ev(god, x, y));
  return { f: (x, y) => Math.min(fA(x, y), fG(x, y)), fA, fG };
}

function creationCanvas(F, lite) {
  const W = lite ? 1024 : 2048, H = W / 2, c = mkCanvas(W, H), g = c.getContext('2d'), r = rng(1511);
  const toX = (x) => (x / COMP.w + 0.5) * W, toY = (y) => (0.5 - y / COMP.h) * H;
  // sky, clouds
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#b9c3c0'); sky.addColorStop(1, '#d9d2bd');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(240,236,224,${0.08 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * W, r() * H, W * (0.05 + r() * 0.12), H * (0.03 + r() * 0.06), r() - 0.5, 0, 7); g.fill(); }
  // Adam's ground: a green-ochre slope under the knee
  const earth = g.createLinearGradient(0, H * 0.6, 0, H); earth.addColorStop(0, '#8b8a5c'); earth.addColorStop(1, '#5f5b3a');
  g.fillStyle = earth; g.beginPath(); g.moveTo(0, toY(-0.55)); g.bezierCurveTo(toX(-2.2), toY(-0.6), toX(-1.4), toY(-1.05), toX(-0.6), toY(-1.4)); g.lineTo(0, H); g.fill();
  // God's mantle: a rose swirl at the right edge, with soft folds and the hint of attendant figures
  const mg = g.createRadialGradient(toX(2.7), toY(0.6), 10, toX(2.5), toY(0.5), W * 0.2);
  mg.addColorStop(0, '#d7988a'); mg.addColorStop(0.7, '#a85e50'); mg.addColorStop(1, 'rgba(120,60,50,0)');
  g.fillStyle = mg; g.beginPath(); g.ellipse(toX(2.65), toY(0.55), W * 0.13, H * 0.42, -0.2, 0, 7); g.fill();
  g.strokeStyle = 'rgba(250,215,200,0.35)'; g.lineWidth = W * 0.004;
  for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(toX(2.75), toY(0.5), W * (0.05 + i * 0.016), Math.PI * 0.6, Math.PI * 1.45); g.stroke(); }
  // flesh: lit from the upper left with the field's gradient as a normal
  const S = lite ? 2 : 2, iw = W / S, ih = H / S;
  const img = g.getImageData(0, 0, W, H), d = img.data;
  const L = V(-0.55, 0.55, 0.63).normalize();
  const cL = new THREE.Color('#f7dcb8'), cD = new THREE.Color('#b07a56'), cS = new THREE.Color('#b9a39e'), tmp = new THREE.Color();
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    const x = (i / iw - 0.5) * COMP.w, y = (0.5 - j / ih) * COMP.h;
    const dd = F.f(x, y);
    if (dd > 0.004) continue;
    const e = 0.004, gx = F.f(x + e, y) - F.f(x - e, y), gy = F.f(x, y + e) - F.f(x, y - e), gl = Math.hypot(gx, gy) || 1;
    const k = Math.sqrt(sat(-dd / 0.07));
    const nx = gx / gl * (1 - k), ny = gy / gl * (1 - k), nz = k, nl = Math.hypot(nx, ny, nz);
    const lam = Math.max(0, (nx * L.x + ny * L.y + nz * L.z) / nl);
    const sleeve = x > 1.05 + (y - 0.15) * 0.4;                 // God's robe covers the upper arm
    tmp.copy(sleeve ? cS : cD).lerp(sleeve ? new THREE.Color('#ece0d8') : cL, Math.pow(lam, 0.8));
    const n = noise2(x * 30, y * 30) * 0.03;
    const a = sat(-dd / 0.004 + 0.5);
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const p = ((j * S + sy) * W + i * S + sx) * 4;
      d[p] = lerp(d[p], (tmp.r + n) * 255, a); d[p + 1] = lerp(d[p + 1], (tmp.g + n) * 255, a); d[p + 2] = lerp(d[p + 2], (tmp.b + n) * 255, a);
    }
  }
  g.putImageData(img, 0, 0);
  frescoFinish(g, W, H, 17);
  // the sepia cartoon version (before the colour)
  const s = mkCanvas(W, H), gs = s.getContext('2d');
  gs.drawImage(c, 0, 0);
  const si = gs.getImageData(0, 0, W, H), sd = si.data;
  for (let p = 0; p < sd.length; p += 4) { const l = (sd[p] * 0.3 + sd[p + 1] * 0.59 + sd[p + 2] * 0.11) / 255; const v = 0.55 + l * 0.5; sd[p] = 236 * v; sd[p + 1] = 214 * v; sd[p + 2] = 170 * v; }
  gs.putImageData(si, 0, 0);
  return { colour: c, sepia: s };
}

// ------------------------------------------------------------------------------------ build
export function buildChapel({ lite = false } = {}) {
  const root = new THREE.Group();
  // vault: an elliptical barrel; the paint sweep (sepia cartoon → colour) in its shader
  const vTex = toTexture(vaultCanvas(lite));
  const vaultMat = new THREE.MeshStandardMaterial({ map: vTex, roughness: 0.9, metalness: 0 });
  const front = { value: -1 };
  vaultMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFront = front;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFront;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { float lu = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 sep = vec3(0.93, 0.84, 0.66) * (0.55 + lu * 0.6);
          float painted = smoothstep(uFront + 0.004, uFront - 0.02, vMapUv.x);
          diffuseColor.rgb = mix(sep, diffuseColor.rgb, painted); }`);
  };
  vaultMat.customProgramCacheKey = () => 'italyVault1';
  {
    const nx = 10, na = lite ? 40 : 64, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= na; j++) {
      const x = -HX + HALL.L * i / nx, a = Math.PI * j / na;
      pos.push(x, HALL.WALL + HALL.RISE * Math.sin(a), HZ * Math.cos(a));
      uv.push(i / nx, 1 - arcOfAlpha(a) / ARC_L);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < na; j++) { const a = i * (na + 1) + j, b = a + 1, c = a + na + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const vault = new THREE.Mesh(g, vaultMat); vault.receiveShadow = true; root.add(vault);
  }
  // walls
  const wc = wallCanvas(lite);
  const wTex = toTexture(wc.map), eTex = toTexture(wc.emissive);
  const wallMat = new THREE.MeshStandardMaterial({ map: wTex, emissiveMap: eTex, emissive: '#ffe3b8', emissiveIntensity: 0, roughness: 0.92, metalness: 0 });
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(HALL.L, HALL.WALL), wallMat);
    w.position.set(0, HALL.WALL / 2, s * HZ); w.rotation.y = s > 0 ? Math.PI : 0;
    if (s < 0) w.scale.x = 1; else w.scale.x = -1;     // (both walls read entrance → altar left to right from inside? keep the canvas unmirrored)
    w.receiveShadow = true; root.add(w);
  }
  for (const altar of [true, false]) {
    const tex = toTexture(endWallCanvas(altar));
    const shape = new THREE.Shape(); shape.moveTo(-HZ, 0); shape.lineTo(HZ, 0); shape.lineTo(HZ, HALL.WALL);
    for (let j = 0; j <= 24; j++) { const a = Math.PI * j / 24; shape.lineTo(HZ * Math.cos(a), HALL.WALL + HALL.RISE * Math.sin(a)); }
    shape.lineTo(-HZ, 0);
    const g = new THREE.ShapeGeometry(shape, 1);
    const uvA = g.attributes.uv, pA = g.attributes.position;
    for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (pA.getX(i) + HZ) / HALL.W, pA.getY(i) / (HALL.WALL + HALL.RISE));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }));
    m.position.x = altar ? HX : -HX; m.rotation.y = altar ? -Math.PI / 2 : Math.PI / 2;
    m.receiveShadow = true; root.add(m);
  }
  // floor
  const fTex = toTexture(floorCanvas(), { repeat: true }); fTex.repeat.set(HALL.L / 3.4, HALL.W / 3.4);
  const floorMat = new THREE.MeshStandardMaterial({ map: fTex, roughness: 0.45, metalness: 0 });
  floorMat.userData.noAntiTile = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.L, HALL.W), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; root.add(floor);
  // architecture with depth: the cornice at the springing, window reveals, the marble screen, the singers' gallery
  const stone = new THREE.MeshStandardMaterial({ color: '#d8ccb3', roughness: 0.6, metalness: 0 });
  {
    const P = [];
    for (const s of [1, -1]) {
      P.push(at(new THREE.BoxGeometry(HALL.L, 0.32, 0.35), 0, HALL.WALL - 0.16, s * (HZ - 0.17)));
      P.push(at(new THREE.BoxGeometry(HALL.L, 0.14, 0.55), 0, HALL.WALL + 0.07, s * (HZ - 0.27)));
      P.push(at(new THREE.BoxGeometry(HALL.L, 0.18, 0.2), 0, 5.4, s * (HZ - 0.1)));
      for (const wx of WIN_X) {
        for (const dx of [-0.98, 0.98]) P.push(at(new THREE.BoxGeometry(0.16, 2.7, 0.5), wx + dx, 12.2, s * (HZ - 0.25)));
        P.push(at(new THREE.BoxGeometry(2.1, 0.18, 0.6), wx, 10.8, s * (HZ - 0.3)));
      }
    }
    for (const x of [-HX, HX]) P.push(at(new THREE.BoxGeometry(0.35, 0.32, HALL.W), x - Math.sign(x) * 0.17, HALL.WALL - 0.16, 0));
    // the marble screen (transenna) across the hall, an opening in the middle
    const sx = -7.0;
    for (const s of [1, -1]) {
      P.push(at(new THREE.BoxGeometry(0.3, 1.0, HZ - 0.9), sx, 0.5, s * (HZ + 0.9) / 2));
      P.push(at(new THREE.BoxGeometry(0.4, 0.12, HZ - 0.9), sx, 1.06, s * (HZ + 0.9) / 2));
      for (let k = 0; k < 10; k++) P.push(at(new THREE.CylinderGeometry(0.035, 0.05, 1.2, 8), sx, 1.72, s * (1.2 + k * (HZ - 1.6) / 9)));
      P.push(at(new THREE.BoxGeometry(0.3, 0.1, HZ - 0.9), sx, 2.36, s * (HZ + 0.9) / 2));
    }
    // stone benches along the walls, and seven candelabra on the screen
    for (const sg of [1, -1]) P.push(at(new THREE.BoxGeometry(HALL.L - 1, 0.45, 0.55), 0, 0.225, sg * (HZ - 0.28)));
    for (let k = 0; k < 7; k++) {
      const z = (k - 3) * 1.75; if (Math.abs(z) < 0.8) continue;
      P.push(at(new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.1, 0.12], [0.05, 0.2], [0.07, 0.6], [0.04, 0.7], [0.12, 0.78], [0.1, 0.82], [0.02, 0.84], [0.025, 1.05], [0, 1.05]].map(([a, b]) => new THREE.Vector2(a, b)), 12), sx, 2.41, z));
    }
    // the singers' gallery (cantoria) on the right wall
    P.push(at(new THREE.BoxGeometry(3.6, 0.25, 1.2), 4.0, 5.6, HZ - 0.6));
    P.push(at(new THREE.BoxGeometry(3.6, 0.9, 0.1), 4.0, 6.15, HZ - 1.2));
    const m = new THREE.Mesh(mergeParts(P), stone); m.receiveShadow = true; root.add(m);
  }
  // the Creation of Adam: a hi-res patch over panel 4 (sepia cartoon below, the colour above it)
  const F = handsField();
  const cc = creationCanvas(F, lite);
  const patchGeo = (inset) => {
    const nx = 24, ny = 8, pos = [], uv = [], idx = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const cx = (i / nx - 0.5) * COMP.w, cy = (j / ny - 0.5) * COMP.h;
      const p = compToWorld(cx, cy, inset);
      pos.push(p.x, p.y, p.z); uv.push(i / nx, j / ny);
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  };
  const sepiaMat = new THREE.MeshStandardMaterial({ map: toTexture(cc.sepia), roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const colourMat = new THREE.MeshStandardMaterial({ map: toTexture(cc.colour), roughness: 0.9, metalness: 0, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const sepiaPatch = new THREE.Mesh(patchGeo(0.02), sepiaMat), colourPatch = new THREE.Mesh(patchGeo(0.03), colourMat);
  root.add(sepiaPatch, colourPatch);
  // a painted frame round the patch
  {
    const P = [];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [ax, ay] = corners[k], [bx, by] = corners[(k + 1) % 4];
      const n = 12;
      for (let i = 0; i < n; i++) {
        const p0 = compToWorld(lerp(ax, bx, i / n) * COMP.w / 2 * 1.02, lerp(ay, by, i / n) * COMP.h / 2 * 1.04, 0.04), p1 = compToWorld(lerp(ax, bx, (i + 1) / n) * COMP.w / 2 * 1.02, lerp(ay, by, (i + 1) / n) * COMP.h / 2 * 1.04, 0.04);
        const len = p0.distanceTo(p1);
        const g = new THREE.BoxGeometry(len + 0.02, 0.05, 0.1);
        const mtx = new THREE.Matrix4().lookAt(p0, p1, V(0, -1, 0)).premultiply(new THREE.Matrix4().makeTranslation(...p0.clone().add(p1).multiplyScalar(0.5).toArray()));
        g.rotateY(Math.PI / 2);
        P.push({ geometry: g, matrix: mtx });
      }
    }
    const fr = new THREE.Mesh(mergeParts(P), new THREE.MeshStandardMaterial({ color: '#cdbf9f', roughness: 0.7 }));
    root.add(fr);
  }
  // strokes of the hands: three wobbly contour passes (construction, firm, loose) and hatching, then
  // loose gesture lines for the figures beyond the frame (Adam's body, God's mantle)
  const X0 = -2.8, X1 = 2.8, Y0 = -1.4, Y1 = 0.75;
  const wob = (amp, freq, seed) => (x, y) => F.f(x, y) + amp * noise2(x * freq + seed, y * freq - seed * 0.7);
  const cell = lite ? 0.011 : 0.0075;
  const fromHands = (x, y) => Math.min(1, Math.abs(x) / 2.8);
  const segA = contour(wob(0.006, 3.0, 1.3), X0, X1, Y0, Y1, cell * 1.15);
  const segB0 = contour(wob(0.0035, 7.0, 4.1), X0, X1, Y0, Y1, cell);
  const segB = [...segB0, ...segB0.map(([a, b]) => [a.clone().add(V(0.0022, -0.0018)), b.clone().add(V(0.0022, -0.0018))])];
  const segC = contour((x, y) => F.f(x, y) - 0.008 + 0.006 * noise2(x * 11 + 9, y * 11), X0, X1, Y0, Y1, cell * 1.3).filter((_, i) => (i * 7919) % 10 < 5);
  const L = V(-0.55, 0.55, 0.63).normalize();
  const shadeF = (x, y) => {
    const dd = F.f(x, y);
    if (dd > -0.004) return -1;
    const e = 0.004, gx = F.f(x + e, y) - F.f(x - e, y), gy = F.f(x, y + e) - F.f(x, y - e), gl = Math.hypot(gx, gy) || 1;
    const k = Math.sqrt(sat(-dd / 0.075));
    const nx = gx / gl * (1 - k), ny = gy / gl * (1 - k), nz = k, nl = Math.hypot(nx, ny, nz);
    return Math.max(0, (nx * L.x + ny * L.y + nz * L.z) / nl);
  };
  const bounds = { x0: X0, x1: X1, y0: Y0, y1: Y1 };
  const hatch = [...hatchField(shadeF, bounds, -Math.PI / 4, lite ? 0.018 : 0.012, 0.38, 0.07, 3, 0.006), ...hatchField(shadeF, bounds, Math.PI / 4, lite ? 0.024 : 0.016, 0.6, 0.06, 7, 0.006)];
  const gesture = [];
  const curve = (pts, n = 30) => { const c = new THREE.CatmullRomCurve3(pts.map(([x, y]) => V(x, y))); const p = c.getPoints(n); for (let i = 0; i < p.length - 1; i++) gesture.push([p[i], p[i + 1]]); };
  curve([[-2.8, 0.25], [-2.55, 0.05], [-2.2, -0.2], [-1.9, -0.32]]);                         // Adam's shoulder line
  curve([[-2.8, 0.55], [-2.6, 0.62], [-2.4, 0.45]]);
  curve([[1.95, 1.35], [2.15, 0.95], [2.05, 0.55], [2.3, 0.2], [2.75, 0.0]]);               // the mantle's sweep
  curve([[2.2, 1.35], [2.45, 1.0], [2.4, 0.7], [2.8, 0.55]]);
  curve([[1.7, -0.3], [2.05, -0.55], [2.5, -0.62], [2.8, -0.5]]);
  curve([[1.45, 0.34], [1.5, 0.26], [1.52, 0.1], [1.46, 0.02]], 10);                      // the cuff of the sleeve
  const toW = (segs) => segs.map(([a, b]) => [compToWorld(a.x, a.y, 0.045), compToWorld(b.x, b.y, 0.045)]);
  // order: the two hands first, from the fingertips outward (the gap is drawn first), then the arms
  const ordOf = (segs, jitter, r = rng(5)) => segs.map(([a, b]) => Math.min(1, fromHands((a.x + b.x) / 2, (a.y + b.y) / 2) * 0.9 + r() * jitter));
  const strokes = new THREE.Group();
  const sA = orderedStrokes(toW(segA), ordOf(segA, 0.08), inkOpts(CHALK, 0.45), 0.1);
  const sB = orderedStrokes(toW(segB), ordOf(segB, 0.05), inkOpts(SEPIA, 0.95), 0.1);
  const sC = orderedStrokes(toW(segC), ordOf(segC, 0.1), inkOpts(CHALK, 0.35), 0.12);
  const sH = orderedStrokes(toW(hatch), ordOf(hatch, 0.25), inkOpts(SEPIA, 0.6, { head: 0.02 }), 0.15);
  const sG = orderedStrokes(toW(gesture), gesture.map((_, i) => i / gesture.length), inkOpts(CHALK, 0.55), 0.05);
  for (const o of [sA, sB, sC, sH, sG]) o.renderOrder = 5;
  strokes.add(sA, sB, sC, sH, sG);
  root.add(strokes);
  const gap = compToWorld(-0.008, -0.04, 0.12);

  // gold construction linework of the hall (for the dip from the desk): vault ribs, strip edges, cornices,
  // windows and lunettes
  const gold = [];
  {
    const arcAt = (x, n = 40) => { const p = []; for (let j = 0; j <= n; j++) { const a = Math.PI * j / n; p.push(V(x, HALL.WALL + HALL.RISE * Math.sin(a) - 0.05, HZ * Math.cos(a) * 0.995)); } return p; };
    for (const P of PANELS) gold.push(arcAt(P.x1 + RIB / 2)); gold.push(arcAt(PANELS[8].x0 - RIB / 2));
    gold.push(arcAt(-HX + 0.1), arcAt(HX - 0.1));
    const zAtArc = (arc) => { let i = 1; while (i < NA && ARC[i] < arc) i++; return HZ * Math.cos(Math.PI * i / NA); };
    for (const ac of [ARC_L / 2 - STRIP, ARC_L / 2 + STRIP]) { const z = zAtArc(ac); gold.push([V(-HX, vaultY(z) - 0.05, z * 0.995), V(HX, vaultY(z) - 0.05, z * 0.995)]); }
    for (const s of [1, -1]) {
      for (const y of [HALL.WALL, 10.6, 5.5]) gold.push([V(-HX, y, s * (HZ - 0.02)), V(HX, y, s * (HZ - 0.02))]);
      for (const wx of WIN_X) {
        const w = [V(wx - 0.9, 10.9, s * (HZ - 0.03)), V(wx - 0.9, 13.5, s * (HZ - 0.03))];
        for (let j = 0; j <= 12; j++) { const a = Math.PI - Math.PI * j / 12; w.push(V(wx + Math.cos(a) * 0.9, 13.5 + Math.sin(a) * 0.9, s * (HZ - 0.03))); }
        w.push(V(wx + 0.9, 10.9, s * (HZ - 0.03)), w[0].clone());
        gold.push(w);
        const lu = []; for (let j = 0; j <= 16; j++) { const a = Math.PI - Math.PI * j / 16; lu.push(V(wx + Math.cos(a) * 2.4, 12.6 + Math.sin(a) * 2.4, s * (HZ - 0.03))); }
        gold.push(lu);
      }
    }
  }
  return { root, vaultMat, front, wallMat, sepiaPatch, colourPatch, colourMat, strokes: [sA, sB, sC, sH, sG], gap, gold };
}

// composition (x across, y along the hall towards the entrance) → chapel-local point on the vault, `inset`
// metres inside it. Screen-right at the end shot = +z, screen-up = −x.
export function compToWorld(cx, cy, inset = 0) {
  const z = cx, x = ADAM.xc - cy;
  const y = vaultY(z);
  // inward normal of the ellipse (towards the axis and down)
  const a = Math.acos(Math.max(-1, Math.min(1, z / HZ)));
  const n = V();
  const nz = -Math.cos(a) / HZ, ny = -Math.sin(a) / HALL.RISE, nl = Math.hypot(nz, ny);
  n.set(0, ny / nl, nz / nl);
  return V(x, y, z).addScaledVector(n, inset);
}
