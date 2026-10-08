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
//
// WALK mode (a game-style first person; the default on phones, where core/explore-pad.js draws a joystick
// and buttons): the viewer becomes a character at eye height in the frozen world — gravity, ground
// following (steps up onto ledges, falls off edges), walls that stop them, a jump, a run, and a fly toggle
// for sets with no ground (space, clouds). Scale comes from the shot (the film's focus distance), so a
// desk-top close-up and a city both walk at a sensible pace. Keys: W A S D / arrows walk, drag looks,
// Shift runs, Space jumps, V toggles flying (R / F up and down), double-click returns to the film's view.
// A game controller works too (left stick move, right stick look, A jump, B fly, left-stick click run).
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
    // walk mode: 'orbit' | 'walk'; phones start walking (the on-screen pad), desktops orbit (W toggles in the UI)
    this.mode = 'orbit';
    this.walk = { pos: new THREE.Vector3(), vy: 0, onGround: false, fly: false, yaw: 0, pitch: 0, eye: 1, S: 1 };
    this.pad = { mx: 0, my: 0, run: false, jump: false, up: false, down: false };   // filled by core/explore-pad.js
    this.ray = new THREE.Raycaster();
    this.onMode = null;   // UI hook: (mode, fly) => void
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
    this._colliders = null;
    if (this.mode === 'walk') this._walkStart();
    this.render();
    if (this.mode === 'walk') this._loopStart();
  }

  // Switch between orbiting the subject and walking through the set.
  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.active) {
      if (mode === 'walk') { this._walkStart(); this._loopStart(); }
      this.render();
    }
    this.onMode?.(this.mode, this.walk.fly);
  }

  toggleFly() {
    const w = this.walk;
    w.fly = !w.fly; w.vy = 0;
    this.onMode?.(this.mode, w.fly);
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

  // ---- WALK MODE ----
  // the solid surfaces of the frozen set (posed once at the paused moment: scenes are pure functions of
  // time, so what's visible doesn't change while exploring): meshes only, no skies, glows or labels
  _solids() {
    if (this._colliders) return this._colliders;
    const out = this._colliders = [];
    this.inst.scene.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry?.attributes?.position) return;
      const ms = [o.material].flat();
      if (ms.some((m) => !m || m.side === THREE.BackSide || m.blending === THREE.AdditiveBlending || (m.transparent && (!m.depthWrite || m.opacity < 0.5)))) return;
      if (o.userData.noCollide) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      o.updateWorldMatrix(true, false);
      const sph = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
      out.push({ o, c: sph.center, r: sph.radius });
    });
    return out;
  }
  // only the solids a ray can reach (phones: a whole set's triangles tested every frame made walking stall)
  _near(from, far, down) {
    const out = [];
    for (const { o, c, r } of this._solids()) {
      const d = down ? Math.hypot(c.x - from.x, c.z - from.z) : c.distanceTo(from);
      if (d <= r + (down ? 0 : far)) out.push(o);
    }
    return out;
  }

  // nearest surface below `from` within `far` (its height), or null
  _groundBelow(from, far) {
    this.ray.set(from, this._u.set(0, -1, 0));
    this.ray.near = 0; this.ray.far = far;
    const hit = this.ray.intersectObjects(this._near(from, far, true), false)[0];
    return hit ? hit.point.y : null;
  }

  // distance to the first surface along `dir` from `from` within `far`, or Infinity
  _wallAhead(from, dir, far) {
    this.ray.set(from, dir);
    this.ray.near = 0; this.ray.far = far;
    const hit = this.ray.intersectObjects(this._near(from, far, false), false)[0];
    return hit ? hit.distance : Infinity;
  }

  // Put the character where the film's camera stood, feet on whatever is below it (or flying, if nothing is).
  _walkStart() {
    const w = this.walk, { pos, q, focus } = this.home;
    w.S = Math.max(0.05, focus);                 // the shot's scale: what it framed, and how far away
    w.eye = w.S * 0.16;
    const fwd = this._v.set(0, 0, -1).applyQuaternion(q);
    w.yaw = Math.atan2(-fwd.x, -fwd.z);
    w.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)), -0.6, 0.6);
    w.vy = 0;
    const g = this._groundBelow(pos, w.S * 40);
    if (g != null) { w.pos.set(pos.x, g, pos.z); w.fly = false; w.onGround = true; }
    else { w.pos.copy(pos).y -= w.eye; w.fly = true; w.onGround = false; }
    w.home = w.pos.clone(); w.homeYaw = w.yaw; w.homePitch = w.pitch;
    this.onMode?.(this.mode, w.fly);
  }

  // one step of the character (dt seconds); returns whether anything moved
  _walkStep(dt) {
    const w = this.walk, k = this.keys, p = this.pad;
    const key = (a, b) => (k.has(a) || k.has(b) ? 1 : 0);
    // inputs: keys, the on-screen pad, a game controller
    let mx = key('d', 'arrowright') - key('a', 'arrowleft') + p.mx;
    let my = key('w', 'arrowup') - key('s', 'arrowdown') + p.my;
    let run = k.has('shift') || p.run, jump = k.has(' ') || p.jump, up = k.has('r') || p.up, down = k.has('f') || p.down;
    let look = 0;
    const gp = navigator.getGamepads?.() ?? [];
    for (const g of gp) {
      if (!g?.connected) continue;
      const dz = (v) => (Math.abs(v) > 0.15 ? v : 0);
      mx += dz(g.axes[0] ?? 0); my -= dz(g.axes[1] ?? 0);
      const lx = dz(g.axes[2] ?? 0), ly = dz(g.axes[3] ?? 0);
      if (lx || ly) { w.yaw -= lx * 2.2 * dt; w.pitch -= ly * 1.6 * dt; look = 1; }
      if (g.buttons[0]?.pressed) jump = true;
      if (g.buttons[10]?.pressed) run = true;
      if (g.buttons[1]?.pressed && !this._gpB) this.toggleFly();
      this._gpB = !!g.buttons[1]?.pressed;
      if (w.fly) { if (g.buttons[5]?.pressed || g.buttons[7]?.pressed) up = true; if (g.buttons[4]?.pressed || g.buttons[6]?.pressed) down = true; }
    }
    p.jump = false;
    w.pitch = THREE.MathUtils.clamp(w.pitch, -1.35, 1.35);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const speed = w.S * (run ? 1.9 : 0.8);
    let moved = look > 0;
    // horizontal: along the heading, stopped by walls (slide along them, axis by axis)
    if (mx || my) {
      const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
      const dx = (fx * my + -fz * mx) * speed * dt, dz = (fz * my + fx * mx) * speed * dt;
      const R = w.eye * 0.35, chest = this._r.copy(w.pos).setY(w.pos.y + w.eye * 0.6);
      const tryMove = (ax, az) => {
        const d = Math.hypot(ax, az);
        if (d < 1e-9) return false;
        if (this._wallAhead(chest, this._v.set(ax / d, 0, az / d), d + R) < d + R) return false;
        w.pos.x += ax; w.pos.z += az; return true;
      };
      if (!tryMove(dx, dz)) { tryMove(dx, 0) || tryMove(0, dz); }
      // stay inside the scene's presentable window (a generous circle round the subject)
      const L = this.lim, rMax = Math.max(L.fly, 2.5) * this.dist0 * 1.6, c = this.homeTarget;
      const ox = w.pos.x - c.x, oz = w.pos.z - c.z, o = Math.hypot(ox, oz);
      if (o > rMax) { w.pos.x = c.x + ox / o * rMax; w.pos.z = c.z + oz / o * rMax; }
      moved = true;
    }
    // vertical: flying, or gravity with steps, jumps and landings
    if (w.fly) {
      const v = (up ? 1 : 0) - (down ? 1 : 0);
      if (v) { w.pos.y += v * speed * dt; moved = true; }
    } else {
      const gAcc = 9.8 * (w.eye / 1.6) * 1.4;   // a touch floatier than Earth: a game's gravity
      if (jump && w.onGround) { w.vy = Math.sqrt(2 * gAcc * w.eye * 0.55); w.onGround = false; }
      const step = w.eye * 0.45;
      const ground = this._groundBelow(this._v.copy(w.pos).setY(w.pos.y + step), step + w.S * 40);
      if (ground == null) {
        // nothing below: off the edge of the world — back to the start
        w.vy -= gAcc * dt; w.pos.y += w.vy * dt;
        if (w.pos.y < w.home.y - w.S * 20) { w.pos.copy(w.home); w.vy = 0; }
        moved = true;
      } else if (w.onGround && w.vy <= 0 && w.pos.y - ground <= step) {
        if (Math.abs(w.pos.y - ground) > 1e-6) moved = true;
        w.pos.y = ground; w.vy = 0;                 // walking: follow the ground (up steps, down slopes)
      } else {
        w.vy -= gAcc * dt; w.pos.y += w.vy * dt; moved = true;
        if (w.pos.y <= ground) { w.pos.y = ground; w.vy = 0; w.onGround = true; } else w.onGround = false;
      }
    }
    return moved;
  }

  // continuous loop while walking (renders only when something moved)
  _loopStart() {
    if (this._walkRaf) return;
    let last = performance.now();
    const frame = (now) => {
      if (!this.active || this.mode !== 'walk') { this._walkRaf = 0; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (this._walkStep(dt) || this._dirty) { this._dirty = false; this.render(); }
      this._walkRaf = requestAnimationFrame(frame);
    };
    this._walkRaf = requestAnimationFrame(frame);
  }

  _walkApply(cam) {
    const w = this.walk;
    cam.position.set(w.pos.x, w.pos.y + w.eye, w.pos.z);
    const cp = Math.cos(w.pitch);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._v.set(cam.position.x - Math.sin(w.yaw) * cp, cam.position.y + Math.sin(w.pitch), cam.position.z - Math.cos(w.yaw) * cp));
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
    if (this.mode === 'walk') { this._walkApply(cam); return; }
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

  _zoom(f) { if (this.mode !== 'walk') this.dist *= f; }   // clamp() bounds it

  // back to the film's view (walking: back to where the film's camera stood)
  recentre() {
    if (this.mode === 'walk') { const w = this.walk; w.pos.copy(w.home); w.yaw = w.homeYaw; w.pitch = w.homePitch; w.vy = 0; w.onGround = !w.fly; }
    else this.reset();
    this.render();
  }

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
      if (this.pointers.size === 2 && this.mode !== 'walk') {
        // two fingers: pinch to zoom, move together to pan
        const [a, b] = [...this.pointers.values()];
        const before = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.clientX; p.y = e.clientY;
        const after = Math.hypot(a.x - b.x, a.y - b.y);
        if (before > 0 && after > 0) this._zoom(before / after);
        this._pan(dx / 2, dy / 2);
      } else {
        p.x = e.clientX; p.y = e.clientY;
        if (this.mode === 'walk') {
          // first person: drag right to turn right, up to look up
          this.walk.yaw -= dx * 0.0042; this.walk.pitch -= dy * 0.0042;
          this._dirty = true;
          return;
        }
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
    c.addEventListener('dblclick', () => { if (this.active) { this.recentre(); } });
    addEventListener('keydown', (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (this.mode === 'walk' && [' ', 'shift', 'v'].includes(k)) {
        e.preventDefault(); e.stopImmediatePropagation();
        if (k === 'v') { if (!e.repeat) this.toggleFly(); } else this.keys.add(k);
        return;
      }
      if (['w', 'a', 's', 'd', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(k)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.keys.add(k);
        if (this.mode !== 'walk' && !this._raf) this._raf = requestAnimationFrame(() => this._tick());
      }
    }, true);
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }
}
