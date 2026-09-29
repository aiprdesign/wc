// LIVE CAMERA: look around while the film plays.
// Drag to orbit around what the shot is looking at, scroll / pinch to zoom, double-click to
// recentre. The viewer's offset rides on top of the director's camera (it follows every move and
// cut), stays inside the scene's presentable window (`exploreLimits`, a little tighter than
// Explore), completes camera cheats through the scenes' `explore(t)` hooks while it is off-axis,
// and glides back to the director's framing a few seconds after the viewer lets go.
// With no input the offset is exactly zero, so offline renders are untouched.
import * as THREE from 'three';

const LIVE = { yaw: 0.7, pitchDown: 0.25, pitchUp: 0.5, zoomIn: 0.5, zoomOut: 2.0 };
const IDLE_RETURN = 3.0;   // s without input before the camera drifts home
const HOOKS_ON = 0.04;     // offset strength above which scenes complete their sets

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

  // Engine hook, once per rendered frame: ease toward the target, and home when idle.
  tick() {
    const now = performance.now(), dt = Math.min(0.1, Math.max(0, (now - this.prev) / 1000));
    this.prev = now;
    const idle = (now - this.lastInput) / 1000;
    if (this.isPlaying() && !this.pointers.size && idle > IDLE_RETURN) {
      const k = 1 - Math.exp(-dt / 0.9);
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
    const a = this.amount;
    if (a < 1e-4) { this._unhook(inst); return; }
    const L = inst.exploreLimits ?? {};
    const lim = this.lim = {
      yaw: Math.min(LIVE.yaw, L.yaw ?? LIVE.yaw), pitchDown: Math.min(LIVE.pitchDown, L.pitchDown ?? LIVE.pitchDown),
      pitchUp: Math.min(LIVE.pitchUp, L.pitchUp ?? LIVE.pitchUp),
      zoomIn: Math.max(LIVE.zoomIn, L.zoomIn ?? LIVE.zoomIn), zoomOut: Math.min(LIVE.zoomOut, L.zoomOut ?? LIVE.zoomOut),
    };
    const yaw = THREE.MathUtils.clamp(this.cur.yaw, -lim.yaw, lim.yaw);
    const pitch = THREE.MathUtils.clamp(this.cur.pitch, -lim.pitchDown, lim.pitchUp);
    const zoom = THREE.MathUtils.clamp(this.cur.zoom, lim.zoomIn, lim.zoomOut);
    // complete the set (e.g. the close-up's lone boot becomes the whole astronaut)
    if (a > HOOKS_ON) {
      try { inst.explore?.(t); } catch { /* scene hook */ }
      this.hooked.add(inst);
    } else this._unhook(inst);
    const cam = inst.camera;
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
    P.sub(C).applyQuaternion(rot).multiplyScalar(zoom).add(C);
    if (cam.parent) cam.parent.worldToLocal(P);
    cam.position.copy(P);
    cam.quaternion.premultiply(rot);
    cam.updateMatrixWorld();
    inst._liveFocus = zoom;                                                // depth of field follows the new distance
    if (a > HOOKS_ON) { try { inst.explorePosed?.(cam); } catch { /* scene hook */ } }
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
