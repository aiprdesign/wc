// LIVE CAMERA: look around while the film plays.
// Drag to orbit around what the shot is looking at, scroll / pinch to zoom, double-click to
// recentre. The viewer's offset rides on top of the director's camera (it follows every move and
// cut), stays inside the scene's presentable window (`exploreLimits`, a little tighter than
// Explore), completes camera cheats through the scenes' `explore(t)` hooks while it is off-axis,
// and glides back to the director's framing a few seconds after the viewer lets go.
// With no input the offset is exactly zero, so offline renders are untouched.
//
// DRONE (Experience mode, `setDrone(true)`): the offset steers itself. A slow, never-repeating
// path (sums of sines with incommensurate periods, eased) orbits, cranes and pushes around each
// shot's subject inside a wider window (DRONE, narrowed by the scene's `exploreLimits`), with
// the scenes' explore hooks always on. The viewer can still drag / pinch / scroll: the drone
// holds its course while they steer and resumes a few seconds after they let go.
import * as THREE from 'three';

const LIVE = { yaw: 0.7, pitchDown: 0.25, pitchUp: 0.5, zoomIn: 0.5, zoomOut: 2.0 };
const DRONE = { yaw: 1.0, pitchDown: 0.3, pitchUp: 0.7, zoomIn: 0.5, zoomOut: 2.4 };
const IDLE_RETURN = 3.0;   // s without input before the camera drifts home
const HOOKS_ON = 0.04;     // offset strength above which scenes complete their sets

// Drone path: each axis is a normalised sum of slow sines (periods in seconds, no common
// multiple, so the flight never repeats), softly saturated so it lingers near the extremes.
const PATH = {
  yaw: [[1, 37, 0.3], [0.55, 59, 2.1], [0.3, 23, 4.0], [0.04, 7.3, 1.3]],     // last term: a faint hover
  pitch: [[1, 47, 1.1], [0.5, 31, 5.2], [0.25, 83, 0.7], [0.05, 11.1, 2.9]],
  zoom: [[1, 43, 2.6], [0.5, 27, 0.4], [0.35, 71, 3.3]],
};
const wave = (parts, s) => {
  let v = 0, n = 0;
  for (const [a, P, ph] of parts) { v += a * Math.sin((2 * Math.PI * s) / P + ph); n += a; }
  return Math.tanh(1.7 * v / n) / Math.tanh(1.7);
};
export function dronePath(s) {
  return {
    yaw: wave(PATH.yaw, s),
    pitch: 0.3 + 0.7 * wave(PATH.pitch, s),            // biased upward: a crane that rises over the set
    zoom: 0.15 + 0.85 * wave(PATH.zoom, s),            // biased outward: reveal more of the world
    reach: 0.72 + 0.28 * Math.sin((2 * Math.PI * s) / 101 + 1.9),   // the whole move breathes
  };
}

export class LiveCam {
  constructor(engine, canvas, { isBlocked = () => false, isPlaying = () => true, onChange = () => {} } = {}) {
    Object.assign(this, { engine, canvas, isBlocked, isPlaying, onChange });
    this.target = { yaw: 0, pitch: 0, zoom: 1 };      // where the viewer asked to be
    this.cur = { yaw: 0, pitch: 0, zoom: 1 };         // smoothed pose actually applied
    this.lim = { ...LIVE };
    this.lastInput = -1e9;
    this.prev = performance.now();
    this.pointers = new Map();
    this.hooked = new Set();
    this.droneOn = false;
    this.tau = 0; this.droneRate = 0; this.droneW = 0;
    this.dn = { yaw: 0, pitch: 0, zoom: 0, reach: 0 };
    this.bank = 0;
    this._P = new THREE.Vector3(); this._C = new THREE.Vector3(); this._F = new THREE.Vector3();
    this._Up = new THREE.Vector3(); this._R = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._qy = new THREE.Quaternion(); this._qp = new THREE.Quaternion();
    this._bind();
  }

  // 0 at the director's view, 1 at the edge of the window
  get amount() {
    const c = this.cur, L = this.lim;
    return Math.max(Math.abs(c.yaw) / L.yaw, Math.abs(c.pitch) / Math.max(L.pitchDown, L.pitchUp), Math.abs(Math.log(c.zoom)) / Math.log(L.zoomOut));
  }

  recentre() { this.target.yaw = 0; this.target.pitch = 0; this.target.zoom = 1; this.poke(); }

  // Experience mode: the camera flies itself. Off: every hooked scene is handed back.
  setDrone(on) {
    if (on === this.droneOn) return;
    this.droneOn = on;
    this.target.yaw = this.target.pitch = this.cur.yaw = this.cur.pitch = 0;
    this.target.zoom = this.cur.zoom = 1;
    this.droneW = 0; this.droneRate = 0; this.bank = 0;
    if (on) this.tau = 11 + Math.random() * 60;   // a different flight every time
    else { this.lim = { ...LIVE }; this.unhookAll(); }
  }

  unhookAll() { for (const inst of [...this.hooked]) this._unhook(inst); }

  // Engine hook, once per rendered frame: ease toward the target, and home when idle.
  tick() {
    const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - this.prev) / 1000));
    this.prev = now;
    const idle = (now - this.lastInput) / 1000;
    if (this.droneOn) {
      // the drone holds its course while the viewer steers (and while paused), then eases back in
      const run = this.isPlaying() && !this.pointers.size && idle > IDLE_RETURN ? 1 : 0;
      this.droneRate += (run - this.droneRate) * (1 - Math.exp(-dt / 1.4));
      this.tau += dt * this.droneRate;
      this.droneW = Math.min(1, this.droneW + (dt * this.droneRate) / 6);   // lifts off gently from the director's framing
      const prevYaw = this.dn.yaw * this.dn.reach;
      this.dn = dronePath(this.tau);
      // bank into the orbit like a real drone: roll follows the sideways speed (a few degrees)
      const v = dt > 0 ? (this.dn.yaw * this.dn.reach - prevYaw) / dt : 0;
      const bank = THREE.MathUtils.clamp(v * 0.45, -0.06, 0.06) * this.droneW;
      this.bank += (bank - this.bank) * (1 - Math.exp(-dt / 0.8));
    }
    if (this.isPlaying() && !this.pointers.size && idle > IDLE_RETURN) {
      const k = 1 - Math.exp(-dt / (this.droneOn ? 1.8 : 0.9));
      this.target.yaw -= this.target.yaw * k; this.target.pitch -= this.target.pitch * k;
      this.target.zoom = Math.exp(Math.log(this.target.zoom) * (1 - k));
    }
    const s = this.isPlaying() ? 1 - Math.exp(-dt / 0.12) : 1;   // playing: silky; paused: immediate
    this.cur.yaw += (this.target.yaw - this.cur.yaw) * s;
    this.cur.pitch += (this.target.pitch - this.cur.pitch) * s;
    this.cur.zoom = Math.exp(Math.log(this.cur.zoom) + (Math.log(this.target.zoom) - Math.log(this.cur.zoom)) * s);
    if (this.amount < 1e-4 && Math.abs(this.target.yaw) < 1e-4) { this.cur.yaw = this.cur.pitch = 0; this.cur.zoom = 1; }
  }

  // Engine hook, after a sequence's update and before headings/rendering: offset its camera.
  apply(inst, t) {
    inst._liveFocus = 1;
    const a = this.amount, drone = this.droneOn;
    if (a < 1e-4 && !drone) { this._unhook(inst); return; }
    const L = inst.exploreLimits ?? {}, B = drone ? DRONE : LIVE;
    const lim = this.lim = {
      yaw: Math.min(B.yaw, L.yaw ?? B.yaw), pitchDown: Math.min(B.pitchDown, L.pitchDown ?? B.pitchDown),
      pitchUp: Math.min(B.pitchUp, L.pitchUp ?? B.pitchUp),
      zoomIn: Math.max(B.zoomIn, L.zoomIn ?? B.zoomIn), zoomOut: Math.min(B.zoomOut, L.zoomOut ?? B.zoomOut),
    };
    let dYaw = 0, dPitch = 0, dZoom = 1;
    if (drone) {
      // the drone's own move, scaled into this shot's window (a margin short of its edges)
      const dn = this.dn, A = this.droneW * dn.reach;
      dYaw = dn.yaw * lim.yaw * 0.8 * A;
      dPitch = (dn.pitch >= 0 ? dn.pitch * lim.pitchUp * 0.75 : dn.pitch * lim.pitchDown * 0.6) * A;
      const zIn = Math.max(lim.zoomIn, 0.72), zOut = Math.min(lim.zoomOut, 1.75);
      dZoom = Math.exp((dn.zoom >= 0 ? dn.zoom * Math.log(zOut) : -dn.zoom * Math.log(zIn)) * A);
    }
    const yaw = THREE.MathUtils.clamp(dYaw + this.cur.yaw, -lim.yaw, lim.yaw);
    const pitch = THREE.MathUtils.clamp(dPitch + this.cur.pitch, -lim.pitchDown, lim.pitchUp);
    const zoom = THREE.MathUtils.clamp(dZoom * this.cur.zoom, lim.zoomIn, lim.zoomOut);
    // complete the set (e.g. the close-up's lone boot becomes the whole astronaut)
    const hooks = drone || a > HOOKS_ON;
    if (hooks) {
      try { inst.explore?.(t); } catch { /* scene hook */ }
      this.hooked.add(inst);
    } else this._unhook(inst);
    const cam = inst.camera;
    // remember the director's pose: restore() puts it back before the next update, so a scene that
    // only animates part of its camera (or eases from its last pose) never inherits the offset
    const sv = inst._livePose ??= { p: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(), on: false };
    sv.p.copy(cam.position); sv.q.copy(cam.quaternion); sv.up.copy(cam.up); sv.on = true;
    cam.updateMatrixWorld();
    const P = this._P.setFromMatrixPosition(cam.matrixWorld);
    const Q = this._q.setFromRotationMatrix(cam.matrixWorld);
    const F = this._F.set(0, 0, -1).applyQuaternion(Q);
    const d = inst.dof?.focus > 0 ? inst.dof.focus : 5;
    const C = this._C.copy(P).addScaledVector(F, d);                     // what the shot looks at
    const up = this._Up.set(0, 1, 0), right = this._R.set(1, 0, 0).applyQuaternion(Q);
    this._qy.setFromAxisAngle(up, -yaw);
    this._qp.setFromAxisAngle(right, -pitch);
    const rot = this._qy.multiply(this._qp);                               // yaw about world up, pitch about the lens axis
    const floorY = Math.min(P.y, C.y);                                     // never below the director's eye / the subject: no peeking under the ground
    P.sub(C).applyQuaternion(rot).multiplyScalar(zoom).add(C);
    const clamped = P.y < floorY;
    if (clamped) P.y = floorY;
    if (cam.parent) cam.parent.worldToLocal(P);
    cam.position.copy(P);
    if (clamped) { cam.up.set(0, 1, 0); cam.lookAt(C); } else cam.quaternion.premultiply(rot);
    if (drone && this.bank) cam.rotateZ(this.bank * Math.min(1, lim.yaw / 0.6));   // (scaled down in narrow windows)
    cam.updateMatrixWorld();
    inst._liveFocus = d > 0 ? cam.getWorldPosition(this._F).distanceTo(C) / d : zoom;   // depth of field follows the new distance
    if (hooks) { try { inst.explorePosed?.(cam); } catch { /* scene hook */ } }
  }

  // Engine hook, before a sequence's update: hand the camera back exactly as the director left it.
  restore(inst) {
    const sv = inst._livePose;
    if (!sv?.on) return;
    sv.on = false;
    const cam = inst.camera;
    cam.position.copy(sv.p); cam.quaternion.copy(sv.q); cam.up.copy(sv.up);
  }

  _unhook(inst) {
    if (!this.hooked.has(inst)) return;
    this.hooked.delete(inst);
    try { inst.exploreEnd?.(); } catch { /* scene hook */ }
  }

  poke() {
    this.lastInput = performance.now();
    if (!this.isPlaying()) { this.tick(); this.onChange(); }            // paused: re-render on demand
  }

  _clampTarget() {
    const L = this.lim, t = this.target, c = THREE.MathUtils.clamp;
    t.yaw = c(t.yaw, -L.yaw, L.yaw); t.pitch = c(t.pitch, -L.pitchDown, L.pitchUp); t.zoom = c(t.zoom, L.zoomIn, L.zoomOut);
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.isBlocked()) return;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.canvas.classList.add('live-drag');
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p || this.isBlocked()) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0 && after > 0) this.target.zoom *= before / after;
      } else {
        p.x = e.clientX; p.y = e.clientY;
        const k = 2.2 / Math.max(300, c.clientHeight);                     // a full-height drag ≈ 2.2 rad
        this.target.yaw -= dx * k; this.target.pitch += dy * k;
      }
      this._clampTarget();
      this.poke();
    });
    const up = (e) => { this.pointers.delete(e.pointerId); if (!this.pointers.size) this.canvas.classList.remove('live-drag'); this.lastInput = performance.now(); };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      if (this.isBlocked()) return;
      e.preventDefault();
      this.target.zoom *= Math.exp(e.deltaY * 0.0012);
      this._clampTarget();
      this.poke();
    }, { passive: false });
    c.addEventListener('dblclick', () => { if (!this.isBlocked()) this.recentre(); });
  }
}
