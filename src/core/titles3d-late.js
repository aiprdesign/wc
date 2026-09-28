// Movie-title treatments for the later chapters: CONNECTION, LIFE, FLIGHT, INTELLIGENCE,
// KNOWLEDGE, plus the montage's quick recap swaps and a default for any other word.
// Same contract as titles3d-early.js: look + companion graphic + signature motion,
// animate(w, s) a pure function of time, no per-frame allocations.
import * as THREE from 'three';
import { glowSprite } from '../lib/materials.js';
import { ease, sat, lerp, ramp, fract } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { BEAT } from '../timeline.js';
import { GOLD, GOLD_HOT, hairline, Polyline, dynamicSegments, dynamicPoints, hash } from './titles3d-kit.js';
import { Draws } from './titles3d-early.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// CONNECTION — copper. The letters open out of the centre dark; then a current runs
// left → right: a gold bus line draws beneath, flickering electric arcs jump letter to
// letter and each letter lights up as the current reaches it, after which small arcs keep
// crackling across the word.
export const CONNECTION = {
  geo: { depth: 0.3, bevel: 0.035 },
  look: {
    face: { color: '#b86a40', metal: 1, rough: 0.3 }, edge: { color: '#e39a68', metal: 1, rough: 0.14 },
    side: { color: '#86492a', metal: 1, rough: 0.38 }, env: 0.6, sweep: 0.0,
    glow: '#ffc890', edgeGlow: '#ffd79a', flash: '#fff0d0',
  },
  inDur: 0.45, st: 0.035, plinth: false,
  build(w) {
    const L = w.letters, n = L.length;
    w.fx.tc = L.map((l, i) => 0.6 + i * (0.95 / Math.max(1, n - 1)));      // current reaches letter i
    const SEG = 9;
    w.fx.SEG = SEG;
    w.fx.arcs = dynamicSegments((n - 1) * SEG * 2);
    w.group.add(w.fx.arcs);
    const xL = L[0].x - 0.45, xR = L[n - 1].x + 0.45;
    w.fx.xL = xL; w.fx.xR = xR;
    const y = w.plinthY;
    const bus = hairline([V(xL - 0.3, y, 0.1), V(xR + 0.3, y, 0.1)], { opacity: 0.85, intensity: 1.0, head: 0.03 });
    w.group.add(bus); w.fx.bus = bus;
    const head = glowSprite({ color: GOLD_HOT, intensity: 1.0, scale: 0.55 });
    w.group.add(head); w.fx.head = head;
    w.fx.col = new THREE.Color();
    w.fx.base = new THREE.Color('#ffd28a');
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx, L = w.letters, n = L.length, tc = fx.tc;
    for (const l of L) {
      const u = s.u(l), out = s.out(l), e = ease.outExpo(u);
      l.pivot.position.x = l.x * e * (1 - 0.9 * ease.inCubic(out));
      l.pivot.position.z = (1 - e) * 0.25;
      l.pivot.scale.setScalar((0.8 + 0.2 * e) * (1 - 0.3 * out));
      l.opacity = s.fade * sat(u * 3) * (1 - out);
      const lit = t - tc[l.i];
      const on = lit > 0 ? 1 : 0;
      l.u.uEdgeGlow.value = on * (0.2 + 0.6 * Math.exp(-lit * 5)) * (1 - out);
      l.u.uGlow.value = on * (0.06 + 0.22 * Math.exp(-lit * 6)) * (1 - out);
      l.u.uFlash.value = on * Math.exp(-lit * 14) * 0.5;
      if (lit > 0 && lit < 0.25) l.pivot.scale.multiplyScalar(1 + 0.05 * Math.sin(Math.PI * lit / 0.25));
    }
    // current front position (left → right through the letters)
    const tEnd = tc[n - 1];
    let fxX;
    if (t <= tc[0]) fxX = lerp(fx.xL - 0.3, L[0].x, sat((t - (tc[0] - 0.12)) / 0.12));
    else if (t >= tEnd) fxX = lerp(L[n - 1].x, fx.xR + 0.3, sat((t - tEnd) / 0.12));
    else { let i = 0; while (i < n - 2 && t > tc[i + 1]) i++; fxX = lerp(L[i].x, L[i + 1].x, (t - tc[i]) / (tc[i + 1] - tc[i])); }
    const running = t > tc[0] - 0.12 && t < tEnd + 0.12;
    fx.bus.progress = Math.max(0.0001, sat((fxX - (fx.xL - 0.3)) / (fx.xR - fx.xL + 0.6)) * (1 - s.exit));
    fx.bus.opacity = 0.8 * s.fade;
    fx.head.position.set(fxX, 0.02, 0.35);
    fx.head.material.opacity = running ? s.fade : 0;
    fx.head.visible = running;
    // arcs: the travelling one, plus random crackle once everything is connected
    const pos = fx.arcs.geometry.attributes.position.array, col = fx.arcs.geometry.attributes.color.array;
    const frame = Math.floor(T * 30), slot = Math.floor(T / 0.11);
    for (let i = 0; i < n - 1; i++) {
      const a = L[i], b = L[i + 1];
      let amp = 0;
      if (t > tc[i] - 0.02 && t < tc[i + 1] + 0.2) amp = t < tc[i + 1] ? 1 : 1 - (t - tc[i + 1]) / 0.2;
      else if (t > tEnd + 0.2 && hash(slot * 13.7 + i * 3.1) > 0.8) amp = 0.45;
      amp *= s.fade * (1 - s.exit);
      // the arc leaps over the cap line from one letter's crown to the next
      const ax = a.pivot.position.x + 0.06, bx = b.pivot.position.x - 0.06;
      const ay = w.capH / 2 + 0.02, by = ay;
      for (let strand = 0; strand < 2; strand++) {
        const base = (i * 2 + strand) * fx.SEG, jag = strand ? 0.06 : 0.11;
        let px = ax, py = ay;
        for (let k = 0; k < fx.SEG; k++) {
          const q = (k + 1) / fx.SEG;
          const env = Math.sin(Math.PI * q);
          const nx = lerp(ax, bx, q) + (k < fx.SEG - 1 ? (hash(frame * 2.17 + i * 5.3 + k * 1.9 + strand * 23) - 0.5) * jag : 0);
          const ny = lerp(ay, by, q) + env * (0.2 + 0.06 * strand) + (k < fx.SEG - 1 ? (hash(frame * 1.31 + i * 17.3 + k * 3.7 + strand * 51) - 0.5) * jag * 1.6 : 0);
          const o = (base + k) * 6;
          pos[o] = px; pos[o + 1] = py; pos[o + 2] = 0.05; pos[o + 3] = nx; pos[o + 4] = ny; pos[o + 5] = 0.05;
          const I = amp * (strand ? 1.0 : 2.0) * (0.75 + 0.5 * hash(frame * 0.7 + i));
          fx.col.copy(fx.base).multiplyScalar(I);
          col[o] = col[o + 3] = fx.col.r; col[o + 1] = col[o + 4] = fx.col.g; col[o + 2] = col[o + 5] = fx.col.b;
          px = nx; py = ny;
        }
      }
    }
    fx.arcs.geometry.attributes.position.needsUpdate = true;
    fx.arcs.geometry.attributes.color.needsUpdate = true;
    // the light rides the current
    w.light.position.set(fxX, 0.1, 0.9);
    w.light.intensity = (running ? 1.4 * (0.8 + 0.4 * hash(frame)) : 0.3) * s.k * s.k * s.fade * (1 - s.exit);
  },
};

// ---------------------------------------------------------------------------
// LIFE — warm pearl / ivory. Letters grow out of the centre like dividing cells, a gold
// ECG trace becomes the plinth: a monitor sweep runs through the word and its QRS spikes
// (flanking the word) land on the beat, when the letters swell gently — lub-dub.
export const LIFE = {
  geo: { depth: 0.3, bevel: 0.045 },
  look: {
    face: { color: '#efe5d5', metal: 0, rough: 0.34 }, edge: { color: '#f6eee2', metal: 0, rough: 0.2 },
    side: { color: '#d8cab5', metal: 0, rough: 0.4 }, pattern: 'pearl', env: 0.85,
    clearcoat: 0.7, sheen: 0.6, sheenColor: '#ffe6c4', iridescence: 0.2, sweep: 0.1, glow: '#ffcf9c',
  },
  inDur: 0.8, st: 0.06, plinth: false,
  build(w) {
    const y = w.plinthY + 0.02, z = -0.2, spikeX = w.half + 0.5;
    const xL = -2 * spikeX, xR = 2 * spikeX;          // period = full width: spikes at 1/4 and 3/4
    const pts = [];
    const complex = (xc) => {
      const A = w.capH * 1.25;
      const k = [[-0.34, 0], [-0.27, 0.05], [-0.2, 0], [-0.07, 0], [-0.04, -0.05], [0, A], [0.04, -0.18], [0.08, 0], [0.2, 0], [0.3, 0.1], [0.4, 0]];
      for (const [dx, dy] of k) pts.push(V(xc + dx, y + dy, z));
    };
    pts.push(V(xL, y, z));
    complex(-spikeX);
    complex(spikeX);
    pts.push(V(xR, y, z));
    w.fx.trace = hairline(pts, { opacity: 0.35, intensity: 0.85, head: 0.01 });
    w.fx.sweep = hairline(pts, { opacity: 0.95, intensity: 1.2, head: 0.012, fade: 0.28 });
    w.group.add(w.fx.trace, w.fx.sweep);
    w.fx.xL = xL; w.fx.xR = xR;
    w.fx.head = glowSprite({ color: GOLD_HOT, intensity: 0.9, scale: 0.35 });
    w.group.add(w.fx.head);
    w.fx.poly = new Polyline(pts);
    // progress (arc-length) at which each x is reached — the spikes add length, so map via samples
    const N = 256; w.fx.xs = new Float32Array(N + 1);
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= N; i++) w.fx.xs[i] = w.fx.poly.at(i / N, tmp).x;
    w.fx.tmp = tmp;
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    // heartbeat on the beat grid: lub (beat) + dub (0.14 s later)
    const alive = sat((t - 0.75) / 0.25) * (1 - s.exit);
    const hb = (pulse(T, { decay: 9 }) + 0.5 * pulse(T, { decay: 10, offset: 0.14 })) * alive;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l);
      const e = ease.outCubic(u), g = ease.outBack(sat(u * 1.1));
      l.pivot.position.x = l.x * e * (1 - 0.85 * ease.inCubic(out));
      l.pivot.position.y = l.baseY + (1 - g) * l.h * 0.5;      // grow about the letter centre
      const sc = Math.max(0.001, g * (1 - out)) * (1 + 0.035 * hb);
      l.pivot.scale.setScalar(sc);
      l.opacity = s.fade * sat(u * 4) * (1 - out);
      l.u.uGlow.value = 0.09 * hb;
    }
    // sweep: head x(T) is periodic over two beats; spikes sit at 1/4 and 3/4 → crossed on the beats
    const ph = fract((T - BEAT / 2) / (2 * BEAT));
    const hx = lerp(fx.xL, fx.xR, ph);
    let lo = 0, hi = fx.xs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fx.xs[m] < hx) lo = m; else hi = m; }
    const prog = (lo + (hx - fx.xs[lo]) / Math.max(1e-5, fx.xs[hi] - fx.xs[lo])) / (fx.xs.length - 1);
    const on = sat((t - 0.15) / 0.3) * (1 - s.exit) * s.fade;
    fx.sweep.progress = Math.max(0.0001, prog);
    fx.sweep.opacity = 0.95 * on;
    fx.trace.progress = Math.max(0.0001, ramp(t, 0.1, 1.2, ease.inOutSine) * (1 - s.exit));
    fx.trace.opacity = 0.35 * s.fade;
    fx.poly.at(prog, fx.head.position); fx.head.position.z += 0.05;
    fx.head.material.opacity = on;
    w.light.position.set(0, 0.1, 0.9);
    w.light.intensity = (0.4 + 1.0 * hb) * s.k * s.k * s.fade * (1 - s.exit);
  },
};

// ---------------------------------------------------------------------------
// FLIGHT — brushed aluminium with polished chamfers. Letters taxi out of the centre low
// and close to camera, then lift off in sequence, banking as they turn and climbing into
// formation, trailing thin gold contrails; in the hold they ride gentle turbulence.
export const FLIGHT = {
  geo: { depth: 0.22, bevel: 0.03 },
  look: {
    face: { color: '#c3c8cf', metal: 1, rough: 0.3 }, edge: { color: '#eef1f5', metal: 1, rough: 0.1 },
    side: { color: '#959ba4', metal: 1, rough: 0.36 }, pattern: 'brushed', env: 0.85, sweep: 0.16, tint: '#fff1d8',
  },
  inDur: 1.0, st: 0.09,
  build(w) {
    const bez = (o0, o1, o2, o3, u, out) => {
      const m = 1 - u;
      return out.set(0, 0, 0).addScaledVector(o0, m * m * m).addScaledVector(o1, 3 * m * m * u).addScaledVector(o2, 3 * m * u * u).addScaledVector(o3, u * u * u);
    };
    w.fx.bez = bez;
    const tmp = new THREE.Vector3();
    for (const l of w.letters) {
      l.P = [V(-l.x * 0.3, -1.1, 0.6), V(-l.x * 0.15, -1.0, 0.45), V(l.x * 0.06, -0.2, 0.12), V(0, 0, 0)];
      const pts = [];
      for (let i = 0; i <= 40; i++) pts.push(bez(...l.P, i / 40, tmp).clone().add(V(l.x, l.baseY + 0.06, -0.08)));
      l.trail = hairline(pts, { opacity: 0.7, intensity: 0.9, head: 0.02, fade: 0.55 });
      w.group.add(l.trail);
    }
    w.fx.o = new THREE.Vector3(); w.fx.d = new THREE.Vector3(); w.fx.q = new THREE.Vector3();
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l), e = ease.inOutCubic(u);
      fx.bez(l.P[0], l.P[1], l.P[2], l.P[3], e, fx.o);
      fx.bez(l.P[0], l.P[1], l.P[2], l.P[3], Math.min(1, e + 0.02), fx.q);
      fx.d.copy(fx.q).sub(fx.o);                                  // flight direction (for bank / pitch)
      const len = Math.max(1e-4, fx.d.length()), k = 1 - e;
      const bob = sat((t - l.d0 - s.inDur) / 0.4);
      const ex = ease.inCubic(out);
      l.pivot.position.set(
        l.x + fx.o.x - l.x * 0.55 * ex,
        l.baseY + fx.o.y + bob * Math.sin(T * 2.3 + l.i * 1.1) * 0.014 + ex * 1.3,
        fx.o.z + ex * 0.9);
      l.pivot.rotation.z = -(fx.d.x / len) * 0.9 * Math.min(1, k * 3) + bob * Math.sin(T * 1.9 + l.i) * 0.012;
      l.pivot.rotation.x = -(fx.d.y / len) * 0.4 * Math.min(1, k * 3) - ex * 0.5;
      l.pivot.rotation.y = (fx.d.x / len) * 0.25 * Math.min(1, k * 3);
      l.opacity = s.fade * ease.inOutSine(sat(u * 2.5)) * (1 - out);
      l.trail.progress = Math.max(0.0001, e);
      l.trail.opacity = 0.7 * s.fade * sat(u * 5) * (1 - sat((t - l.d0 - s.inDur - 0.1) / 0.6));
      const land = t - l.d0 - s.inDur;
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 7) * 0.3 : 0;
    }
  },
};

// ---------------------------------------------------------------------------
// INTELLIGENCE — black silicon / glass with gold contacts on the bevels and etched
// micro-traces on the faces. Letters boot out of the centre with stepped (quantised)
// motion; gold circuit traces route from every letter out to the frame, and data pulses
// stream along them, lighting the letter's die pattern as each packet leaves.
export const INTELLIGENCE = {
  geo: { depth: 0.3, bevel: 0.035 },
  look: {
    face: { color: '#2a2e35', metal: 0.45, rough: 0.2 }, edge: { color: '#d4a441', metal: 1, rough: 0.2 },
    side: { color: '#23262c', metal: 0.5, rough: 0.24 }, pattern: 'circuit', env: 1.1, clearcoat: 1, clearcoatRoughness: 0.06,
    sweep: 0.12, pat: GOLD,
  },
  inDur: 0.6, st: 0.04,
  build(w) {
    const L = w.letters, n = L.length, top = w.capH / 2, xe = w.half * 1.18 + 0.9;
    const z = -0.05;
    // alternate up / down; per side-direction, inner letters route higher so traces never cross
    const groups = {};
    L.forEach((l) => { l.dir = l.i % 2 ? -1 : 1; l.side = l.x < 0 ? -1 : 1; (groups[`${l.side}${l.dir}`] ??= []).push(l); });
    for (const g of Object.values(groups)) {
      g.sort((a, b) => Math.abs(b.x) - Math.abs(a.x));       // outermost first → lowest lane
      g.forEach((l, r) => (l.lane = top + 0.16 + r * 0.1));
    }
    w.fx.traces = L.map((l) => {
      const sy = l.dir, sx = l.side, lane = l.lane * sy, d = 0.08, y0 = (top + 0.02) * sy;
      const E = V(sx * (xe + hash(l.i * 3.3) * 0.5), lane, z), p = 0.045;
      const pts = [V(l.x, y0, z), V(l.x, lane - d * sy, z), V(l.x + sx * d, lane, z), E,
        V(E.x, E.y + p, z), V(E.x + sx * 2 * p, E.y + p, z), V(E.x + sx * 2 * p, E.y - p, z), V(E.x, E.y - p, z), V(E.x, E.y, z)];
      const line = hairline(pts, { opacity: 0.75, intensity: 0.9, head: 0.04 });
      w.group.add(line);
      return { line, poly: new Polyline(pts.slice(0, 4)), a: 0.4 + l.c * 0.25, l };
    });
    w.fx.dots = dynamicPoints(n * 2);
    w.group.add(w.fx.dots);
    w.fx.v = new THREE.Vector3();
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l);
      const e = Math.round(ease.outExpo(u) * 9) / 9, eo = Math.round(ease.inCubic(out) * 6) / 6;  // stepped: digital
      l.pivot.position.x = l.x * e * (1 - 0.9 * eo);
      l.pivot.scale.set(1, Math.max(0.001, (u > 0 ? 0.4 + 0.6 * e : 0) * (1 - eo)), 1);
      l.opacity = s.fade * (u > 0 ? 1 : 0) * (1 - eo);
      l.u.uPattern.value = 0;
    }
    const pos = fx.dots.geometry.attributes.position.array, col = fx.dots.geometry.attributes.color.array;
    for (let i = 0; i < fx.traces.length; i++) {
      const tr = fx.traces[i];
      const dp = ramp(t, tr.a, tr.a + 0.5, ease.outCubic);
      tr.line.progress = Math.max(0.0001, dp * (1 - s.exit));
      tr.line.opacity = 0.75 * s.fade;
      // two packets per trace, periodic, leaving the letter
      for (let j = 0; j < 2; j++) {
        const per = 0.85, ph = (t - tr.a - 0.5 - j * per * 0.5 - hash(i * 5.1) * 0.4) / per;
        const on = ph > 0 && dp >= 1 && s.exit < 0.05;
        const f = fract(ph), o = (i * 2 + j) * 3;
        tr.poly.at(ease.inQuad(f), fx.v);
        pos[o] = fx.v.x; pos[o + 1] = fx.v.y; pos[o + 2] = fx.v.z + 0.02;
        const I = on ? Math.sin(Math.PI * f) * 1.3 * s.fade : 0;
        col[o] = I; col[o + 1] = I * 0.82; col[o + 2] = I * 0.5;
        // the die lights as a packet leaves the letter
        if (on) tr.l.u.uPattern.value = Math.max(tr.l.u.uPattern.value, Math.exp(-f * 7) * 0.9);
      }
      tr.l.u.uPattern.value = Math.max(tr.l.u.uPattern.value, 0.3 * dp) * (1 - s.exit);
    }
    fx.dots.geometry.attributes.position.needsUpdate = true;
    fx.dots.geometry.attributes.color.needsUpdate = true;
    fx.dots.material.size = 0.075 * s.k;
  },
};

// ---------------------------------------------------------------------------
// KNOWLEDGE — parchment letters with gilded edges (like a book's gilt page edges). They
// assemble out of a vortex of swirling page flakes that converge from around the word,
// each letter solidifying as its pages arrive; on exit the pages scatter again.
export const KNOWLEDGE = {
  geo: { depth: 0.34, bevel: 0.035 },
  look: {
    face: { color: '#e6d3a9', metal: 0, rough: 0.62 }, edge: { color: '#d8a94c', metal: 1, rough: 0.24 },
    side: { color: '#c9ad78', metal: 0.1, rough: 0.55 }, pattern: 'parchment', env: 0.7, sweep: 0.14,
  },
  inDur: 1.1, st: 0.06,
  build(w) {
    const PER = 34, L = w.letters;
    const count = PER * L.length;
    const geo = new THREE.PlaneGeometry(0.075, 0.1);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide, envMap: w.env, envMapIntensity: 0.6, emissive: new THREE.Color('#4a3618'), fog: false });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const cA = new THREE.Color('#ead8b0'), cB = new THREE.Color('#d9a64a'), c = new THREE.Color();
    const flakes = [];
    const tmp = new THREE.Vector3();
    L.forEach((l) => {
      // targets on the letter's front face (area-weighted over front-facing triangles)
      const pos = l.mesh.geometry.attributes.position, idx = l.mesh.geometry.index;
      const tri = [], acc = [];
      const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), nrm = new THREE.Vector3();
      const nt = (idx ? idx.count : pos.count) / 3;
      let total = 0;
      for (let i = 0; i < nt; i++) {
        const i0 = idx ? idx.getX(i * 3) : i * 3, i1 = idx ? idx.getX(i * 3 + 1) : i * 3 + 1, i2 = idx ? idx.getX(i * 3 + 2) : i * 3 + 2;
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); cc.fromBufferAttribute(pos, i2);
        nrm.copy(b).sub(a).cross(tmp.copy(cc).sub(a));
        const area = nrm.length() / 2;
        if (area < 1e-7 || nrm.z / (area * 2) < 0.9) continue;
        total += area; tri.push([i0, i1, i2]); acc.push(total);
      }
      for (let j = 0; j < PER; j++) {
        const id = l.i * PER + j, r = (k) => hash(id * 7.31 + k * 1.77);
        let ti = 0; const x = r(1) * total; while (ti < acc.length - 1 && acc[ti] < x) ti++;
        let uu = r(2), vv = r(3); if (uu + vv > 1) { uu = 1 - uu; vv = 1 - vv; }
        const [i0, i1, i2] = tri[ti] ?? [0, 1, 2];
        a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); cc.fromBufferAttribute(pos, i2);
        const target = a.clone().addScaledVector(b.clone().sub(a), uu).addScaledVector(cc.clone().sub(a), vv);
        target.x += l.x; target.y += l.baseY + l.h / 2; target.z += 0.03;
        const R = 1.4 + r(4) * 2.2, th = r(5) * Math.PI * 2;
        flakes.push({ l, target, R, th, y0: (r(6) - 0.5) * 1.6, delay: r(7) * 0.4, spin: [r(8) * 9 - 4.5, r(9) * 9 - 4.5, r(10) * 5], outDelay: r(11) * 0.15 });
        mesh.setColorAt(id, c.copy(cA).lerp(cB, r(12) < 0.22 ? 0.85 : r(13) * 0.2));
      }
    });
    mesh.instanceColor.needsUpdate = true;
    w.group.add(mesh);
    Object.assign(w.fx, { mesh, flakes, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), sc: new THREE.Vector3() });
  },
  animate(w, s) {
    const { t, T } = s, fx = w.fx;
    const outT = T - s.outStart;
    for (const l of w.letters) {
      const solid = sat((t - l.d0 - 0.7) / 0.4), leave = sat(outT / 0.3);
      l.pivot.position.x = l.x;
      l.pivot.scale.setScalar(0.97 + 0.03 * ease.outCubic(solid));
      l.opacity = s.fade * ease.inOutSine(solid) * (1 - leave);
      const land = t - l.d0 - 1.0;
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 6) * 0.45 : 0;
    }
    for (let i = 0; i < fx.flakes.length; i++) {
      const f = fx.flakes[i];
      const e = sat((t - f.l.d0 - f.delay) / 0.85), w8 = ease.inOutCubic(e);
      const eo = ease.inCubic(sat((outT - f.outDelay) / 0.42));
      const conv = w8 * (1 - eo);
      // swirl around the word's vertical axis, converging on the target
      const th = f.th + (1 - w8) * 2.6 + eo * 2.2, R = f.R * (1 - 0.35 * w8) * (1 + 0.3 * eo);
      fx.p.set(Math.cos(th) * R, f.y0 * (1 - w8) + eo * 0.6, Math.sin(th) * R * 0.7);
      fx.p.lerp(f.target, conv);
      const k = 1 - conv;
      fx.e.set(f.spin[0] * k, f.spin[1] * k, f.spin[2] * k);
      fx.q.setFromEuler(fx.e);
      const vis = e > 0 ? sat(e * 6) * (1 - ease.inCubic(sat((e - 0.8) / 0.2))) : 0;
      const vo = eo > 0 ? sat(eo * 5) * (1 - sat((eo - 0.6) / 0.4)) : 0;
      const sc = Math.max(0.0001, Math.max(vis * (1 - eo), vo) * s.fade);
      fx.m.compose(fx.p, fx.q, fx.sc.set(sc, sc, sc));
      fx.mesh.setMatrixAt(i, fx.m);
    }
    fx.mesh.instanceMatrix.needsUpdate = true;
  },
};

// ---------------------------------------------------------------------------
// Montage recap swaps — a crisp rolling-drum morph (each letter rolls up into place from
// below and rolls on out of the top), every word wearing its chapter's finish.
const SWAP_LOOKS = {
  ORDER: { face: { color: '#e9e2d6', metal: 0, rough: 0.36 }, edge: { color: '#d6a345', metal: 1, rough: 0.24 }, side: { color: '#cfc5b6', metal: 0, rough: 0.45 }, pattern: 'marble', env: 0.8, clearcoat: 0.3 },
  MOTION: { face: { color: '#57504b', metal: 0.9, rough: 0.42 }, edge: { color: '#c9a060', metal: 1, rough: 0.2 }, side: { color: '#3a3431', metal: 0.9, rough: 0.5 }, pattern: 'forged', env: 0.7 },
  ORBITS: { face: { color: '#b8913f', metal: 1, rough: 0.3 }, edge: { color: '#e4bf6c', metal: 1, rough: 0.13 }, side: { color: '#8a6a2c', metal: 1, rough: 0.36 }, pattern: 'brushed', env: 0.75 },
  ATOMS: { face: { color: '#efe5d5', metal: 0, rough: 0.3 }, edge: { color: '#e0b060', metal: 1, rough: 0.2 }, side: { color: '#d8cab5', metal: 0, rough: 0.4 }, pattern: 'pearl', env: 0.85, clearcoat: 0.7 },
  CIRCUITS: { face: { color: '#16181c', metal: 0.35, rough: 0.16 }, edge: { color: '#d4a441', metal: 1, rough: 0.22 }, side: { color: '#1d2025', metal: 0.5, rough: 0.24 }, pattern: 'circuit', env: 0.95, clearcoat: 1, pat: GOLD },
  STARS: { face: { color: '#d0d4da', metal: 1, rough: 0.22 }, edge: { color: '#f3d493', metal: 1, rough: 0.1 }, side: { color: '#9aa0a8', metal: 1, rough: 0.3 }, pattern: 'brushed', env: 0.9 },
};
export function swapTreatment(text) {
  const etched = SWAP_LOOKS[text]?.pattern === 'circuit' ? 0.28 : 0;
  return {
    look: { ...(SWAP_LOOKS[text] ?? SWAP_LOOKS.STARS), sweep: 0.16 },
    geo: { depth: 0.3, bevel: 0.035 },
    inDur: 0.3, st: 0.022,
    animate(w, s) {
      for (const l of w.letters) {
        const u = s.u(l), out = s.out(l);
        const e = ease.outBack(u), eo = ease.inCubic(out);
        l.pivot.position.x = l.x * (0.9 + 0.1 * ease.outCubic(u)) * (1 - 0.1 * eo);
        l.mesh.rotation.x = (1 - e) * Math.PI / 2 - eo * Math.PI / 2;      // roll up in, roll on out
        l.mesh.position.y = l.h / 2 - (1 - ease.outCubic(u)) * l.h * 0.55 + eo * l.h * 0.55;
        l.opacity = s.fade * sat(u * 3) * (1 - sat(out * 1.4));
        l.u.uPattern.value = etched;            // CIRCUITS: the die traces glow faintly
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Default (any word without a bespoke treatment): satin gold, letters hinge up from lying
// flat as they spread out of the centre, landing flash, fold back into the centre.
export const DEFAULT = {
  look: { face: { color: '#d4a84a', metal: 1, rough: 0.28 }, edge: { color: '#efcb7e', metal: 1, rough: 0.14 }, side: { color: '#a8813a', metal: 1, rough: 0.34 }, env: 0.6, sweep: 0.22 },
  geo: { depth: 0.32, bevel: 0.035 },
  inDur: 0.75, st: 0.07,
  animate(w, s) {
    const { t } = s;
    for (const l of w.letters) {
      const u = s.u(l), out = s.out(l);
      const kin = ease.outBack(u), kc = ease.outCubic(u);
      l.pivot.position.x = l.x * kc * (1 - out * 0.85);
      l.pivot.position.z = (1 - kc) * 0.35;
      l.pivot.rotation.x = (1 - kin) * -Math.PI / 2 + out * -0.5;
      l.pivot.scale.setScalar((0.8 + 0.2 * kc) * (1 - out * 0.4));
      const land = t - l.d0 - s.inDur * 0.62;
      l.u.uFlash.value = land > 0 ? Math.exp(-land * 9) * 0.5 : 0;
      l.opacity = s.fade * sat(u * 3) * (1 - out);
    }
  },
};
