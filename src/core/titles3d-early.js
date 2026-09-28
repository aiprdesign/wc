// Movie-title treatments for the early chapters: ORDER, LAW, BEAUTY, REASON, POWER.
// Each treatment = a letter finish (look) + a gold companion graphic built in the word's
// own space (x across, y up, z towards camera; cap height ≈ 0.7) + a signature motion.
// animate(w, s) is a pure function of time (s.t local to the title, s.T global story time).
import * as THREE from 'three';
import { progressTube, circlePoints, segmentsLine } from '../lib/lines.js';
import { glowSprite } from '../lib/materials.js';
import { ease, sat, lerp, ramp } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { BEAT } from '../timeline.js';
import { GOLD, GOLD_HOT, hairline, Polyline, dynamicSegments, dynamicPoints, hash } from './titles3d-kit.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const PHI = (1 + Math.sqrt(5)) / 2;

// A timed set of hairlines: each draws over [a, b] (title-local seconds) and retracts on exit.
export class Draws {
  constructor() { this.list = []; }
  add(line, a, b, { opacity = line.opacity, fn = ease.outCubic, group } = {}) {
    this.list.push({ line, a, b, opacity, fn });
    (group ?? this.group)?.add(line);
    return line;
  }
  update(t, exit, fade = 1) {
    for (const d of this.list) {
      d.line.progress = Math.max(0.0001, d.fn(sat((t - d.a) / (d.b - d.a))) * (1 - exit));
      d.line.opacity = d.opacity * fade;
    }
  }
}
// two halves drawn from the centre outward (the shared centre-origin grammar)
function centreLine(draws, y, halfW, z, a, b, opts = {}) {
  draws.add(hairline([V(0, y, z), V(-halfW, y, z)], opts), a, b, opts);
  draws.add(hairline([V(0, y, z), V(halfW, y, z)], opts), a, b, opts);
}

// ---------------------------------------------------------------------------
// ORDER — veined marble with gold inlay bevels. Letters rise out of the stylobate like
// columns going up, centre first; a gold architect's elevation (steps, pilasters,
// architrave, cornice, pediment) draws itself around them: the word becomes a temple.
export const ORDER = {
  geo: { depth: 0.36, bevel: 0.042 },
  look: {
    face: { color: '#dcd4c6', metal: 0, rough: 0.38 }, edge: { color: '#d6a345', metal: 1, rough: 0.24 },
    side: { color: '#cfc5b6', metal: 0, rough: 0.45 }, pattern: 'marble', env: 0.8, clearcoat: 0.3, sweep: 0.12,
  },
  inDur: 0.85, st: 0.075, plinthGap: 0.0,
  build(w) {
    const { half, capH } = w, top = capH / 2, z = -0.32, W = half + 0.32;
    const d = (w.fx.draws = new Draws());
    d.group = w.group;
    const o = { opacity: 0.55, intensity: 0.85 };
    centreLine(d, w.plinthY - 0.1, W + 0.12, z, 0.1, 0.75, o);          // stylobate steps
    centreLine(d, w.plinthY - 0.2, W + 0.26, z, 0.16, 0.85, { ...o, opacity: 0.4 });
    for (const s of [-1, 1]) d.add(hairline([V(s * W, w.plinthY, z), V(s * W, top + 0.3, z)], o), 0.45, 0.95, o); // antae
    centreLine(d, top + 0.13, W, z, 0.6, 1.05, o);                        // architrave
    centreLine(d, top + 0.3, W + 0.1, z, 0.68, 1.15, o);                  // cornice
    const apex = top + 0.3 + (W + 0.1) * 0.25;
    for (const s of [-1, 1]) d.add(hairline([V(s * (W + 0.1), top + 0.3, z), V(0, apex, z)], o), 0.9, 1.45, o); // pediment rakes
    // faint proportion circle (the Vitruvian construction) behind everything
    const cy = (w.plinthY - 0.2 + apex) / 2, R = W + 0.1;
    const circ = { opacity: 0.2, intensity: 0.8 };
    d.add(hairline(circlePoints(R, 120, { start: -Math.PI / 2, end: Math.PI / 2 }).map((p) => p.add(V(0, cy, z - 0.05))), circ), 0.5, 1.6, circ);
    d.add(hairline(circlePoints(R, 120, { start: -Math.PI / 2, end: -Math.PI * 1.5 }).map((p) => p.add(V(0, cy, z - 0.05))), circ), 0.5, 1.6, circ);
  },
  animate(w, s) {
    const { t } = s;
    w.shared.uClipY.value = w.base - 0.004;            // letters rise out of the stylobate line
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l);
      const rise = ease.outQuart(u) * (1 - ease.inOutCubic(out));
      l.pivot.position.x = l.x * (1 - 0.12 * out);
      l.pivot.position.y = l.baseY - (1 - rise) * (l.h + 0.06);
      l.pivot.scale.y = 0.9 + 0.1 * rise;
      const land = t - l.d0 - s.inDur * 0.75;            // the capital catches the light as it tops out
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 7) * 0.45 : 0;
      l.opacity = s.fade * (u > 0 ? 1 : 0);
    }
    w.fx.draws.update(t, s.exit, s.fade);
  },
};

// ---------------------------------------------------------------------------
// LAW — carved bronze. Letters STAMP down one after another like a seal; each impact
// jolts the word and fires a concentric shockwave while a gold seal ring (double ring +
// milled ticks) draws around the word.
export const LAW = {
  geo: { depth: 0.46, bevel: 0.055 },
  look: {
    face: { color: '#7a4c2b', metal: 1, rough: 0.46 }, edge: { color: '#d19a5c', metal: 1, rough: 0.2 },
    side: { color: '#5e3c22', metal: 1, rough: 0.5 }, pattern: 'patina', env: 0.75, sweep: 0.14,
  },
  inDur: 0.3, st: 0.2, sweepAt: 1.15,
  build(w) {
    const { half } = w, n = w.letters.length;
    // stamp order: centre first, then outward, left before right — each stamp on the half-beat grid
    const order = w.letters.map((l) => l).sort((a, b) => a.c - b.c || a.i - b.i);
    const grid = BEAT / 2, first = Math.ceil((w.t0 + 0.3) / grid - 1e-6) * grid - w.t0;
    order.forEach((l, r) => (l.hit = first + r * grid));
    w.fx.firstHit = order[0].hit; w.fx.lastHit = order[n - 1].hit;
    const R = Math.max(half + 0.5, 1.25);
    w.fx.R = R;
    const d = (w.fx.draws = new Draws());
    d.group = w.group;
    const z = -0.3, h0 = w.fx.firstHit;
    const ring = { opacity: 0.8, intensity: 1.0 };
    d.add(hairline(circlePoints(R, 160, { start: Math.PI / 2, end: Math.PI / 2 + Math.PI * 2 }).map((p) => p.setZ(z)), ring), h0, h0 + 0.75, ring);
    const inner = { opacity: 0.55, intensity: 0.9 };
    d.add(hairline(circlePoints(R * 0.9, 160, { start: Math.PI / 2, end: Math.PI / 2 - Math.PI * 2 }).map((p) => p.setZ(z)), inner), h0 + 0.12, h0 + 0.9, inner);
    // milled rim: radial ticks between the rings, appearing around the circle
    const ticks = [];
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      ticks.push([V(c * R * 0.915, sn * R * 0.915, z), V(c * R * 0.985, sn * R * 0.985, z)]);
    }
    const tk = segmentsLine(ticks, { color: GOLD, intensity: 0.8, opacity: 0.4, stagger: 0.8, orderFn: (a) => (((Math.atan2(a.y, a.x) - Math.PI / 2 + Math.PI * 4) % (Math.PI * 2)) / (Math.PI * 2)) * 0.8 });
    tk.progress = 0;
    d.add(tk, h0 + 0.2, h0 + 1.0, { opacity: 0.4 });
    // one shockwave ring per impact (unit circle, scaled)
    w.fx.shocks = w.letters.map(() => {
      const sh = hairline(circlePoints(1, 96).map((p) => p.setZ(z + 0.05)), { opacity: 0, intensity: 1.2, head: 0 });
      sh.progress = 1; w.group.add(sh);
      return sh;
    });
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    let shake = 0;
    for (const l of w.letters) {
      const out = s.out(l);
      const f = sat((t - (l.hit - 0.28)) / 0.28), fe = ease.inQuad(f);
      const dt = t - l.hit;
      // fall from above (and slightly towards camera), tilted, flattening onto the page at impact
      l.pivot.position.y = l.baseY + (1 - fe) * 1.7 + ease.inCubic(out) * 1.2;
      l.pivot.position.z = (1 - fe) * 0.9 + out * 0.6;
      l.pivot.rotation.x = -(1 - fe) * 0.35;
      const sc = 1 + (1 - fe) * 0.22;
      const sq = dt > 0 ? Math.exp(-dt * 16) * Math.cos(dt * 42) * 0.12 : 0;
      l.pivot.scale.set(sc * (1 + sq * 0.55), sc * (1 - sq), sc);
      l.opacity = s.fade * sat(f * 4) * (1 - out);
      l.u.uFlash.value = dt > 0 ? Math.exp(-dt * 8) * 0.55 : 0;
      if (dt > 0) shake += Math.exp(-dt * 16) * Math.sin(dt * 70);
      // shockwave: expands from the ring outward and fades
      const sh = fx.shocks[l.i], sp = sat(dt / 0.55);
      sh.scale.setScalar(fx.R * (0.8 + 0.55 * ease.outCubic(sp)));
      sh.opacity = dt > 0 && sp < 1 ? (1 - sp) * (1 - sp) * 0.9 * s.fade : 0;
    }
    w.group.translateY(-shake * 0.03 * s.k);
    // ring glows a touch brighter at each impact
    fx.draws.update(t, s.exit, s.fade);
    const L = w.light;
    L.position.set(0, 0.4, 1.1);
    let flash = 0;
    for (const l of w.letters) { const dt = t - l.hit; if (dt > 0) flash += Math.exp(-dt * 7); }
    L.intensity = (0.5 + flash * 1.4) * s.k * s.k * s.fade * (1 - s.exit);
  },
};

// ---------------------------------------------------------------------------
// BEAUTY — polished gold. Letters glide down gentle arcs from above and behind the word,
// centre first, turning like dancers into place, while a golden rectangle subdivides itself and the golden spiral
// draws through the word from its outer arc into the eye.
export const BEAUTY = {
  geo: { depth: 0.26, bevel: 0.03 },
  look: {
    face: { color: '#e0b762', metal: 1, rough: 0.17 }, edge: { color: '#f4d18c', metal: 1, rough: 0.08 },
    side: { color: '#b98a3d', metal: 1, rough: 0.26 }, env: 0.8, sweep: 0.2,
  },
  inDur: 1.05, st: 0.08,
  build(w) {
    const Wr = w.width + 0.95, Hr = Wr / PHI, z = -0.28;
    const d = (w.fx.draws = new Draws());
    d.group = w.group;
    let x = -Wr / 2, y = -Hr / 2 - 0.02, ww = Wr, hh = Hr;
    const faint = { opacity: 0.32, intensity: 0.8 };
    // outline: two halves from the top centre
    d.add(hairline([V(0, y + hh, z), V(x, y + hh, z), V(x, y, z), V(0, y, z)], faint), 0.05, 0.7, faint);
    d.add(hairline([V(0, y + hh, z), V(x + ww, y + hh, z), V(x + ww, y, z), V(0, y, z)], faint), 0.05, 0.7, faint);
    const spiral = [];
    for (let k = 0; k < 9; k++) {
      const dir = k % 4;
      let sq, c, a0, a1, div;
      if (dir === 0) { sq = hh; c = V(x + sq, y); a0 = Math.PI; a1 = Math.PI / 2; div = [V(x + sq, y), V(x + sq, y + hh)]; x += sq; ww -= sq; }
      else if (dir === 1) { sq = ww; c = V(x, y + hh - sq); a0 = Math.PI / 2; a1 = 0; div = [V(x, y + hh - sq), V(x + ww, y + hh - sq)]; hh -= sq; }
      else if (dir === 2) { sq = hh; c = V(x + ww - sq, y + sq); a0 = 0; a1 = -Math.PI / 2; div = [V(x + ww - sq, y + hh), V(x + ww - sq, y)]; ww -= sq; }
      else { sq = ww; c = V(x + sq, y + sq); a0 = -Math.PI / 2; a1 = -Math.PI; div = [V(x + ww, y + sq), V(x, y + sq)]; y += sq; hh -= sq; }
      const steps = Math.max(6, Math.round(28 * Math.sqrt(sq)));
      for (let i = spiral.length ? 1 : 0; i <= steps; i++) {
        const a = lerp(a0, a1, i / steps);
        spiral.push(V(c.x + Math.cos(a) * sq, c.y + Math.sin(a) * sq, z + 0.02));
      }
      if (k < 7) d.add(hairline(div.map((p) => p.setZ(z)), faint), 0.3 + k * 0.1, 0.62 + k * 0.1, faint);
    }
    const sp = { opacity: 0.9, intensity: 1.05, head: 0.03 };
    d.add(hairline(spiral, sp), 0.35, 1.75, { ...sp, fn: ease.inOutSine });
  },
  animate(w, s) {
    const { t } = s;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l), e = ease.inOutCubic(u), sg = Math.sign(l.x) || 1;
      const arc = Math.sin(Math.PI * e);
      const eo = ease.inOutCubic(out);
      // glide down a gentle arc from above and behind the word into its slot
      l.pivot.position.x = l.x * (0.74 + 0.26 * e) * (1 - 0.5 * eo);
      l.pivot.position.y = l.baseY + (1 - e) * 0.6 + arc * 0.08 + eo * 0.35;
      l.pivot.position.z = -(1 - e) * 0.9 + eo * 0.3;
      l.pivot.rotation.x = (1 - e) * 0.4 - eo * 0.3;
      l.pivot.rotation.y = (1 - e) * 0.5 * sg - eo * 0.4 * sg;
      l.pivot.rotation.z = -(1 - e) * 0.16 * sg + eo * 0.12 * sg;
      l.pivot.scale.setScalar(0.9 + 0.1 * e);
      l.opacity = s.fade * ease.inOutSine(sat(u * 2.2)) * (1 - sat(out * 1.6));
      const land = t - l.d0 - s.inDur * 0.85;
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 7) * 0.35 : 0;
    }
    w.fx.draws.update(t, s.exit, s.fade);
  },
};

// ---------------------------------------------------------------------------
// REASON — turned brass. Each letter rides its own concentric orbit in a tilted orbital
// plane and swings into alignment, centre first — order out of chaos; a gold orbit ellipse is
// drawn by a small planet travelling it, a fainter second orbit crosses behind.
export const REASON = {
  geo: { depth: 0.32, bevel: 0.038 },
  look: {
    face: { color: '#b8913f', metal: 1, rough: 0.3 }, edge: { color: '#e4bf6c', metal: 1, rough: 0.13 },
    side: { color: '#8a6a2c', metal: 1, rough: 0.36 }, pattern: 'brushed', env: 0.75, sweep: 0.18,
  },
  inDur: 1.05, st: 0.06,
  build(w) {
    const Ro = w.half + 0.55;
    const tiltA = new THREE.Euler(0.3, 0, -0.14), tiltB = new THREE.Euler(-0.42, 0, 0.2);
    const ring = (R, e, n = 200) => { const pts = []; for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; pts.push(V(Math.cos(a) * R, 0, Math.sin(a) * R).applyEuler(e)); } return pts; };
    const ptsA = ring(Ro, tiltA);
    w.fx.orbit = new Polyline(ptsA);
    const tube = progressTube(new THREE.CatmullRomCurve3(ptsA.slice(0, -1), true), { radius: 0.011, segments: 260, radial: 5, color: GOLD, intensity: 0.85, opacity: 0.85 });
    tube.progress = 0; tube.renderOrder = 2;
    w.group.add(tube);
    w.fx.tube = tube;
    const d = (w.fx.draws = new Draws());
    d.group = w.group;
    const faint = { opacity: 0.3, intensity: 0.8, head: 0.02 };
    d.add(hairline(ring(Ro * 1.22, tiltB), faint), 0.5, 1.9, { ...faint, fn: ease.inOutSine });
    // the planet
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), new THREE.MeshStandardMaterial({ color: '#d9ad55', metalness: 1, roughness: 0.3, envMap: w.env, emissive: new THREE.Color(GOLD).multiplyScalar(0.35), transparent: true }));
    const halo = glowSprite({ color: GOLD_HOT, intensity: 0.7, scale: 0.45 });
    planet.add(halo);
    planet.castShadow = true;
    w.group.add(planet);
    w.fx.planet = planet; w.fx.halo = halo;
    w.fx.tilt = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.3, 0, 0));
    w.fx.v = new THREE.Vector3();
  },
  animate(w, s) {
    const { t } = s, fx = w.fx, v = fx.v;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l);
      const e = ease.outCubic(u), sg = Math.sign(l.x) || 1;
      const af = sg > 0 ? 0 : Math.PI;
      // each letter rides its own concentric orbit and swings into alignment (every letter orbits the same way)
      const a = af - (1 - e) * (1.15 + 0.35 * l.c) * sg;
      const r = Math.abs(l.x) * (0.9 + 0.1 * e) * (1 - 0.6 * out);
      v.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyMatrix4(fx.tilt);
      l.pivot.position.set(v.x, l.baseY + v.y + out * 0.2, v.z);
      l.pivot.rotation.y = (a - af) * 0.5 * sg * -1 + out * 0.5 * sg;
      l.pivot.rotation.z = -(1 - e) * 0.4 * sg;
      l.pivot.scale.setScalar(0.75 + 0.25 * e);
      l.opacity = s.fade * ease.inOutSine(sat(u * 2.5)) * (1 - sat(out * 1.6));
      const land = t - l.d0 - s.inDur * 0.8;
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 7) * 0.35 : 0;
    }
    // the planet draws its orbit, then keeps travelling it
    const p = (t - 0.25) / 1.5;
    fx.tube.progress = Math.max(0.0001, sat(p) * (1 - s.exit));
    fx.tube.opacity = 0.85 * s.fade;
    fx.orbit.at(((p % 1) + 1) % 1, fx.planet.position);
    fx.planet.visible = p > 0 && s.exit < 0.98;
    const pv = sat(p * 8) * (1 - s.exit) * s.fade;
    fx.planet.scale.setScalar(Math.max(0.001, pv));
    fx.planet.material.opacity = pv;
    fx.draws.update(t, s.exit, s.fade);
    // the sweep light rides with the planet
    w.light.position.copy(fx.planet.position).multiplyScalar(0.8).setZ(Math.max(0.6, fx.planet.position.z + 0.4));
    w.light.intensity = 1.1 * pv * s.k * s.k;
  },
};

// ---------------------------------------------------------------------------
// POWER — dark forged iron with ember-hot edges. Letters SLAM in from the camera on the
// 120 BPM half-beat grid (centre first), each impact shakes the word, throws a spark
// burst and flares the edges orange; the heat breathes on the beat, then cools.
export const POWER = {
  geo: { depth: 0.46, bevel: 0.05 },
  look: {
    face: { color: '#2a2624', metal: 0.7, rough: 0.58 }, edge: { color: '#3a332f', metal: 0.9, rough: 0.34 },
    side: { color: '#1a1716', metal: 0.6, rough: 0.66 }, pattern: 'forged', env: 0.3, sweep: 0.06,
    edgeGlow: '#ff8a24', pat: '#ff8a2a', flash: '#ffc070', tint: '#ffb070',
  },
  inDur: 0.2, st: 0.25,
  build(w) {
    const n = w.letters.length, grid = BEAT / 2;
    const first = Math.ceil((w.t0 + 0.18) / grid - 1e-6) * grid - w.t0;      // first half-beat after entry
    const cs = [...new Set(w.letters.map((l) => l.c.toFixed(3)))].sort();
    for (const l of w.letters) l.hit = first + cs.indexOf(l.c.toFixed(3)) * grid;
    const PER = 18;
    w.fx.sparks = dynamicSegments(n * PER);
    w.fx.heads = dynamicPoints(n * PER);
    w.fx.PER = PER;
    w.group.add(w.fx.sparks, w.fx.heads);
    w.fx.cHot = new THREE.Color('#ffe2a8'); w.fx.cWarm = new THREE.Color('#ff6a1a'); w.fx.c = new THREE.Color();
    w.light.color?.set('#ff8a3c');
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    let sx = 0, sy = 0, flare = 0;
    const breath = pulse(T, { decay: 5 });
    for (const l of w.letters) {
      const out = s.out(l);
      const f = sat((t - (l.hit - 0.2)) / 0.2), fe = ease.inQuart(f), dt = t - l.hit;
      l.pivot.position.x = l.x * (1 - 0.8 * ease.inCubic(out));
      l.pivot.position.z = (1 - fe) * 3.2 - out * 0.8;
      l.pivot.position.y = l.baseY - out * 0.1;
      const sq = dt > 0 ? Math.exp(-dt * 20) * Math.cos(dt * 50) * 0.1 : 0;
      const sc = (1 + (1 - fe) * 0.7) * (1 - 0.35 * out);
      l.pivot.scale.set(sc * (1 + sq * 0.6), sc * (1 - sq), sc * (1 + sq));
      l.opacity = s.fade * sat(f * 3) * (1 - out);
      // heat: flare at impact → glowing ember that breathes on the beat → cools on exit
      const heat = dt > 0 ? (0.34 + 0.5 * Math.exp(-dt * 3.2) + 0.12 * breath) * (1 - out) : 0;
      l.u.uEdgeGlow.value = heat;
      l.u.uPattern.value = heat * 0.5;
      l.u.uFlash.value = dt > 0 ? Math.exp(-dt * 12) * 0.5 : 0;
      if (dt > 0) {
        const k = Math.exp(-dt * 13);
        sx += k * Math.sin(dt * 83 + l.i) * 0.6; sy += k * Math.sin(dt * 97 + 1.3 * l.i);
        flare += Math.exp(-dt * 6);
      }
      // spark burst from the letter's foot
      const pos = fx.sparks.geometry.attributes.position.array, col = fx.sparks.geometry.attributes.color.array;
      const hp = fx.heads.geometry.attributes.position.array, hc = fx.heads.geometry.attributes.color.array;
      for (let j = 0; j < fx.PER; j++) {
        const id = l.i * fx.PER + j, o = id * 6, h1 = hash(id * 3.1), h2 = hash(id * 5.7 + 1), h3 = hash(id * 7.3 + 2), h4 = hash(id * 1.9 + 3);
        const life = 0.35 + 0.5 * h4, age = dt / life;
        if (dt <= 0 || age >= 1) { col.fill(0, o, o + 6); hc.fill(0, id * 3, id * 3 + 3); continue; }
        const ang = Math.PI / 2 + (h1 - 0.5) * 2.8, sp = 1.6 + 2.6 * h2, vz = (h3 - 0.35) * 1.6;
        const vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp * 0.8, g = -6.5;
        const x0 = l.x + (h3 - 0.5) * 0.5, y0 = l.baseY + 0.04, z0 = 0.25;
        const tt = dt, tb = Math.max(0, dt - 0.07);
        pos[o] = x0 + vx * tt; pos[o + 1] = y0 + vy * tt + 0.5 * g * tt * tt; pos[o + 2] = z0 + vz * tt;
        pos[o + 3] = x0 + vx * tb; pos[o + 4] = y0 + vy * tb + 0.5 * g * tb * tb; pos[o + 5] = z0 + vz * tb;
        fx.c.copy(fx.cHot).lerp(fx.cWarm, sat(age * 1.5)).multiplyScalar(Math.pow(1 - age, 1.5) * 1.5 * s.fade);
        col[o] = col[o + 3] = fx.c.r; col[o + 1] = col[o + 4] = fx.c.g; col[o + 2] = col[o + 5] = fx.c.b;
        hp[id * 3] = pos[o]; hp[id * 3 + 1] = pos[o + 1]; hp[id * 3 + 2] = pos[o + 2];
        hc[id * 3] = fx.c.r * 0.8; hc[id * 3 + 1] = fx.c.g * 0.8; hc[id * 3 + 2] = fx.c.b * 0.8;
        col[o + 3] *= 0.15; col[o + 4] *= 0.15; col[o + 5] *= 0.15;
      }
    }
    fx.sparks.geometry.attributes.position.needsUpdate = true;
    fx.sparks.geometry.attributes.color.needsUpdate = true;
    fx.heads.geometry.attributes.position.needsUpdate = true;
    fx.heads.geometry.attributes.color.needsUpdate = true;
    fx.heads.material.size = 0.05 * s.k;
    // camera-independent shake of the word itself
    w.group.translateX(sx * 0.018 * s.k);
    w.group.translateY(sy * 0.022 * s.k);
    // the forge light spills onto the scene at each slam
    w.light.position.set(0, -0.1, 1.0);
    w.light.intensity = (0.35 + 1.5 * Math.min(1.5, flare) + 0.25 * breath) * s.k * s.k * s.fade * (1 - s.exit);
  },
};
