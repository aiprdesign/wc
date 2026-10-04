// EXPLORE: pause the film and fly through the frozen 3D world.
// The sequence under the playhead is posed at the paused moment (scenes are pure functions of
// time), then its camera is taken over by an orbit / fly rig. Headings, captions, HUD and depth
// of field step aside so the scene itself is on show; leaving explore hands the camera back.
//   drag: look around (orbit)   right-drag / shift-drag / two fingers: pan   wheel / pinch: zoom
// Scenes stay presentable: the rig is kept within a window around the film's own view
// (scene-overridable `exploreLimits`), and a scene may export `explore(t)`, called after every
// update while exploring, to swap camera cheats for complete geometry (e.g. a close-up's lone
// boot becomes the whole astronaut). `explorePosed(camera)` runs after the explore camera is
// posed (billboards, camera-facing labels). `exploreEnd()` undoes anything update() doesn't reset.
//   W A S D (arrows): fly   R / F: up / down   double-click: back to the film's camera   E / Esc: leave
import * as THREE from 'three';
import { TIME_SCALE } from '../timeline.js';

export class Explorer {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;
    this.active = false;
    this.inst = null;
    this.target = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.dist = 5; this.dist0 = 5;
    this.home = null;
    this.keys = new Set();
    this.pointers = new Map();
    this._v = new THREE.Vector3(); this._r = new THREE.Vector3(); this._u = new THREE.Vector3();
    this._bind();
  }

  // Enter at film time `filmT` (seconds of the delivered film).
  enter(filmT) {
    const e = this.engine, T = filmT / TIME_SCALE;
    this.filmT = filmT;
    const inst = e.mainInstance(T);
    if (!inst) return false;   // streaming: this chapter is still being built
    if (this.active) { if (this.inst !== inst) this.handBack(); else this.restoreCamera(); }   // re-entered (scrubbing)
    this.inst = inst;
    const info = e.info(T, this.inst.segment, 0);
    try { this.inst.update(info.t, info); } catch { /* the scene reports its own errors */ }
    const cam = this.inst.camera;
    cam.updateMatrixWorld();
    const pos = new THREE.Vector3(), q = new THREE.Quaternion();
    cam.matrixWorld.decompose(pos, q, new THREE.Vector3());
    const focus = this.inst.dof?.focus > 0 ? this.inst.dof.focus : 5;
    this.home = { pos: pos.clone(), q: q.clone(), focus };
    // limits: yaw ± around the film's view, pitch window, zoom range, fly radius (× distance)
    this.lim = { yaw: 1.2, pitchDown: 0.35, pitchUp: 0.9, zoomIn: 0.3, zoomOut: 3.5, fly: 2.5, ...(this.inst.exploreLimits ?? {}) };
    this.reset();
    this.homeTarget = this.target.clone(); this.homeYaw = this.yaw; this.homePitch = this.pitch;
    this.active = true;
    e.explore = this;
    this.canvas.classList.add('exploring');
    this.render();
  }

  exit() {
    if (!this.active) return;
    this.handBack();
    this.active = false;
    this.engine.explore = null;
    this.keys.clear();
    this.pointers.clear();
    this.canvas.classList.remove('exploring');
    this.engine.render(this.filmT, 0);
  }

  // Leaving a sequence: its scene hooks undo their set dressing, and its camera gets the director's pose back.
  handBack() {
    const inst = this.inst;
    if (!inst) return;
    try { inst.exploreEnd?.(); } catch { /* scene hook */ }
    this.restoreCamera();
    if (this._director) this._director.inst = null;
  }

  // (also the engine's hook before each update while exploring: the scene poses from the director's
  // camera, never from the rig's)
  restoreCamera() {
    const inst = this.inst, d = this._director;
    if (!inst || d?.inst !== inst) return;
    const cam = inst.camera;
    cam.position.copy(d.p); cam.quaternion.copy(d.q); cam.up.copy(d.up);
    if (cam.isPerspectiveCamera && cam.fov !== d.fov) { cam.fov = d.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }

  // Back to the film's own framing (orbiting around what it was looking at).
  reset() {
    const { pos, q, focus } = this.home;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(q);
    this.target.copy(pos).addScaledVector(fwd, focus);
    const off = pos.clone().sub(this.target);
    this.dist = this.dist0 = off.length();
    this.yaw = Math.atan2(off.x, off.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / this.dist, -1, 1));
  }

  // keep the rig inside the scene's presentable window
  clamp() {
    const L = this.lim, d = THREE.MathUtils;
    let dy = this.yaw - this.homeYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = this.homeYaw + d.clamp(dy, -L.yaw, L.yaw);
    this.pitch = d.clamp(this.pitch, Math.max(-1.45, this.homePitch - L.pitchDown), Math.min(1.45, this.homePitch + L.pitchUp));
    this.dist = d.clamp(this.dist, this.dist0 * L.zoomIn, this.dist0 * L.zoomOut);
    const off = this._u.copy(this.target).sub(this.homeTarget), r = this.dist0 * L.fly;
    if (off.length() > r) this.target.copy(this.homeTarget).addScaledVector(off.normalize(), r);
  }

  // Engine hook, after the sequence's update: complete the set, then pose the camera.
  prepare(t) {
    try { this.inst.explore?.(t); } catch (e) { if (!this._warned) { console.warn('[explore] scene hook failed', e); this._warned = true; } }
    // the director's pose this frame: exit() hands it back, so a scene that doesn't set its whole
    // camera every frame (its up vector, its lens) never inherits the explore rig's pose
    const cam = this.inst.camera, d = this._director ??= { inst: null, p: new THREE.Vector3(), q: new THREE.Quaternion(), up: new THREE.Vector3(), fov: 0 };
    d.inst = this.inst; d.p.copy(cam.position); d.q.copy(cam.quaternion); d.up.copy(cam.up); d.fov = cam.fov;
    this.apply(cam);
    // after posing: scenes can turn camera-facing labels / billboards toward the explore camera
    try { this.inst.explorePosed?.(this.inst.camera); } catch { /* scene hook */ }
  }

  // Pose the sequence's camera from the rig.
  apply(cam) {
    this.clamp();
    const cp = Math.cos(this.pitch);
    cam.position.set(
      this.target.x + this.dist * cp * Math.sin(this.yaw),
      this.target.y + this.dist * Math.sin(this.pitch),
      this.target.z + this.dist * cp * Math.cos(this.yaw),
    );
    // never below the film camera's eye or the subject it framed: no peeking under the ground
    const floorY = Math.min(this.home.pos.y, this.homeTarget?.y ?? this.home.pos.y);
    if (cam.position.y < floorY) cam.position.y = floorY;
    cam.up.set(0, 1, 0);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
  }

  // Automation: enter at filmT and offset the view (radians / zoom factor / fly in units of distance).
  view(filmT, { yaw = 0, pitch = 0, zoom = 1, fly = [0, 0, 0] } = {}) {
    this.enter(filmT);
    this.yaw += yaw; this.pitch += pitch; this.dist *= zoom;
    this.target.add(this._v.set(...fly).multiplyScalar(this.dist0));
    this.render();
  }

  render() {
    if (!this.active) return;
    this.engine.render(this.filmT, 0);
  }

  // continuous fly while keys are held
  _tick() {
    if (!this.active || !this.keys.size) { this._raf = 0; return; }
    const k = this.keys, s = this.dist * 0.018;
    const fwd = this._v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = this._r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const m = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    this.target.addScaledVector(fwd, s * (m('w', 'arrowup') - m('s', 'arrowdown')));
    this.target.addScaledVector(right, s * (m('d', 'arrowright') - m('a', 'arrowleft')));
    this.target.y += s * (m('r', 'pageup') - m('f', 'pagedown'));
    this.render();
    this._raf = requestAnimationFrame(() => this._tick());
  }

  _pan(dx, dy) {
    const cam = this.inst.camera;
    const right = this._r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const up = this._u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const k = this.dist * 0.0016;
    this.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }

  _zoom(f) { this.dist *= f; }   // clamp() bounds it

  _bind() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    c.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey });
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!this.active || !p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this.pointers.size === 2) {
        // two fingers: pinch to zoom, move together to pan
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0 && after > 0) this._zoom(before / after);
        this._pan(dx / 2, dy / 2);
      } else {
        p.x = e.clientX; p.y = e.clientY;
        if (p.pan) this._pan(dx, dy);
        else {
          this.yaw -= dx * 0.005;
          this.pitch += dy * 0.005;
        }
      }
      this.render();
    });
    const up = (e) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this._zoom(Math.exp(e.deltaY * 0.0012));
      this.render();
    }, { passive: false });
    c.addEventListener('dblclick', () => { if (this.active) { this.reset(); this.render(); } });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(k)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.keys.add(k);
        if (!this._raf) this._raf = requestAnimationFrame(() => this._tick());
      }
    }, true);
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }
}
