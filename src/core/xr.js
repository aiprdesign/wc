// WEBXR: the film in a headset (immersive-vr) or as a tabletop diorama (immersive-ar).
//
// VR: the viewer rides the director's camera. A rig (the XR reference space, in metres) is placed
// at the camera's world position with its heading only: pitch and roll are dropped so the horizon
// stays level, and position, heading and scale follow through a critically damped spring (~0.6 s)
// so no move is ever jerky. Hard cuts (a chapter change, a cut inside a shot, a seek) dip to black
// for a moment and snap instead of flying. World scale follows the shot: the subject in focus
// stands 1.5–30 m away, so a macro shot of a radio valve becomes a room-sized set.
// The film's typography (3D chapter words, HUD captions, chapter titles) is drawn into a
// transparent texture with the director's lens and shown on a floating panel ~3 m ahead.
//
// AR: the current shot becomes a tabletop diorama. Hit-testing puts a reticle on a real surface;
// a tap (or trigger) places the model there, a second tap moves it. The subject in focus sits at
// the centre of an octagonal "vitrine" ~0.5 m across on a small plinth; everything outside it is
// clipped away (renderer.clippingPlanes), sky and background are dropped so the room shows through,
// and fog is thinned out. The model turns on its plinth as the director's camera orbits.
//
// Both modes: the soundtrack (or Experience mode's clock and ambient score) keeps time; each frame
// the sequence under the playhead is posed exactly as in the film (pure function of time), then
// its explore hooks complete camera cheats and turn labels toward the viewer. Bloom, depth of field
// and grading are skipped (the multi-pass pipeline does not run in XR); the scene is rendered
// straight to the headset with ACES tone mapping. Controllers: trigger / pinch plays and pauses
// (AR: places the model), grip exits, thumbstick left / right seeks 5 s, A / X plays and pauses.
//
// Nothing here runs until a session starts: the engine skips its own render() only while
// `engine.xrActive`, so the film and offline renders are untouched.
import * as THREE from 'three';
import { SEGMENTS, DURATION, FILM_DURATION, TIME_SCALE, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { FONTS } from '../lib/text.js';

export const VR = 'immersive-vr', AR = 'immersive-ar';

// Which immersive modes this browser offers (false everywhere without WebXR, e.g. iPhone Safari).
export async function xrSupport(timeout = 800) {
  const xr = globalThis.navigator?.xr;
  if (!xr?.isSessionSupported || globalThis.isSecureContext === false) return { vr: false, ar: false };
  const ask = (m) => Promise.race([
    xr.isSessionSupported(m).then(Boolean, () => false),
    new Promise((r) => setTimeout(() => r(false), timeout)),
  ]);
  const [vr, ar] = await Promise.all([ask(VR), ask(AR)]);
  return { vr, ar };
}

export const TUNE = {
  vr: { follow: 0.6, turn: 0.9, zoom: 1.2, near: 0.05, minDist: 1.5, maxDist: 30, panelDist: 3, panelWidth: 2.8 },
  ar: {
    half: 0.25, sides: 8, frame: 1.25, depth: 0.35, follow: 0.45, turn: 0.8, zoom: 0.8, reach: 0.9, drop: 0.45,
    // per-chapter framing: the finale's Earth is a whole globe on the plinth (frame × and centre depth × R)
    // (or an explicit subject: the finale's Earth, radius 1.6 at the origin, as a whole globe)
    shots: { finale: { centre: [0, 0, 0], radius: 1.72 } },
  },
  fadeCut: 0.3,        // s of wall clock: fade-in after a cut inside a shot or a seek
  fadeSwitch: 0.22,    // s of film time: dip either side of a chapter hand-over
};

const Y = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
const clamp = THREE.MathUtils.clamp, smooth = THREE.MathUtils.smoothstep;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _u = new THREE.Vector3();
const _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _a = new THREE.Matrix4(), _sph = new THREE.Sphere();

// Film time of each chapter hand-over (where engine.mainInstance switches sequences).
const SWITCHES = SEGMENTS.slice(1).map((b, i) => ((SEGMENTS[i].end + b.start) / 2) * TIME_SCALE);

// The director's camera at this instant: eye P, subject C (at the focus distance), heading yaw.
// Looking steeply down (or up) the heading comes from the camera's up vector instead:
// F.xz − F.y·U.xz is a positive multiple of the level heading for any pitch.
export function directorPose(inst, out = { P: new THREE.Vector3(), F: new THREE.Vector3(), C: new THREE.Vector3(), yaw: 0, focus: 5, tanHalf: 0.3 }) {
  const cam = inst.camera;
  cam.updateWorldMatrix(true, false);
  cam.matrixWorld.decompose(out.P, _q, _s);
  const F = out.F.set(0, 0, -1).applyQuaternion(_q), U = _u.set(0, 1, 0).applyQuaternion(_q);
  out.focus = inst.dof?.focus > 0 ? inst.dof.focus : 5;
  out.C.copy(out.P).addScaledVector(F, out.focus);
  out.yaw = Math.atan2(-(F.x - F.y * U.x), -(F.z - F.y * U.z));
  out.tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov ?? 35) / 2);
  return out;
}

// VR: world units per metre, so the subject in focus stands a comfortable distance away.
export const vrScale = (d, T = TUNE.vr) => d.focus / clamp(d.focus, T.minDist, T.maxDist);

// Rig (XR reference space → scene world): at pos, turned by yaw, scaled.
export function rigMatrix(out, pos, yaw, scale) {
  return out.compose(pos, _q.setFromAxisAngle(Y, yaw), _s.setScalar(scale));
}
// AR: the scene point `subject` (heading yaw) lands on `anchor` in the room (heading anchorYaw).
export function arRigMatrix(out, subject, yaw, scale, anchor, anchorYaw) {
  rigMatrix(out, subject, yaw, scale);
  _a.compose(anchor, _q2.setFromAxisAngle(Y, anchorYaw), ONE).invert();
  return out.multiply(_a);
}
// Clipping planes (world space) of an upright prism around `c`: `sides` faces at inradius `half`,
// top and bottom at ±half. three.js clips what lies on the negative side, so normals point inward.
export function clipPrism(planes, c, yaw, half, sides = 8) {
  planes.length = sides + 2;
  for (let i = 0; i < sides; i++) {
    const a = yaw + (i / sides) * Math.PI * 2;
    const n = _v.set(-Math.sin(a), 0, -Math.cos(a));
    (planes[i] ??= new THREE.Plane()).setFromNormalAndCoplanarPoint(n, _u.copy(c).addScaledVector(n, -half));
  }
  (planes[sides] ??= new THREE.Plane()).setFromNormalAndCoplanarPoint(Y, _u.copy(c).addScaledVector(Y, -half));
  (planes[sides + 1] ??= new THREE.Plane()).setFromNormalAndCoplanarPoint(_v.set(0, -1, 0), _u.copy(c).addScaledVector(Y, half));
  return planes;
}

// The stereo "union" frustum three.js culls with (WebXRManager's setProjectionFromUnion) mixes
// metres and world units when the camera's parent is scaled, which shoved its near plane past
// whole buildings in a scaled-down diorama. Recomputed here with the eye offset in metres.
const _pl = new THREE.Vector3(), _pr = new THREE.Vector3(), _sc = new THREE.Vector3(), _off = new THREE.Vector3();
export function unionFrustum(camera, cameraL, cameraR) {
  _pl.setFromMatrixPosition(cameraL.matrixWorld);
  _pr.setFromMatrixPosition(cameraR.matrixWorld);
  cameraL.matrixWorld.decompose(camera.position, camera.quaternion, _sc);
  const S = _sc.x || 1, ipd = _pl.distanceTo(_pr) / S;
  const pL = cameraL.projectionMatrix.elements, pR = cameraR.projectionMatrix.elements;
  if (pL[10] === -1) return;   // infinite far plane: three.js uses the left eye's projection, which is fine
  const near = pL[14] / (pL[10] - 1), far = pL[14] / (pL[10] + 1);
  const topFov = (pL[9] + 1) / pL[5], bottomFov = (pL[9] - 1) / pL[5];
  const leftFov = (pL[8] - 1) / pL[0], rightFov = (pR[8] + 1) / pR[0];
  const zOffset = ipd / (-leftFov + rightFov), xOffset = zOffset * -leftFov;
  camera.position.add(_off.set(xOffset, 0, zOffset).applyQuaternion(camera.quaternion).multiplyScalar(S));
  camera.scale.copy(_sc);
  camera.matrixWorld.compose(camera.position, camera.quaternion, camera.scale);
  camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const near2 = near + zOffset, far2 = far + zOffset;
  camera.projectionMatrix.makePerspective(near * leftFov - xOffset, near * rightFov + (ipd - xOffset), topFov * far / far2 * near2, bottomFov * far / far2 * near2, near2, far2);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

// Critically damped follower (Unity's SmoothDamp): no overshoot, eases in and out.
class Damp {
  constructor() { this.x = 0; this.v = 0; }
  snap(x) { this.x = x; this.v = 0; return x; }
  to(target, time, dt) {
    if (!(dt > 0)) return this.x;
    const w = 2 / time, k = w * dt, e = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
    const ch = this.x - target, tmp = (this.v + w * ch) * dt;
    this.v = (this.v - w * tmp) * e;
    this.x = target + (ch + tmp) * e;
    return this.x;
  }
}

// A small canvas-text plane (hints) that redraws only when its text changes.
class Label extends THREE.Mesh {
  constructor(width, aspect = 5) {
    const c = document.createElement('canvas');
    c.width = 1280; c.height = Math.round(1280 / aspect);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    super(new THREE.PlaneGeometry(width, width / aspect), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    this.renderOrder = 1e6;
    this.frustumCulled = false;
    Object.assign(this, { c, g: c.getContext('2d'), tex, text: null });
  }
  set(text) {
    if (text === this.text) return;
    this.text = text;
    const { c, g } = this;
    g.clearRect(0, 0, c.width, c.height);
    if (!text) return;
    g.font = `500 ${Math.round(c.height * 0.3)}px '${FONTS.mono}', monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = `${Math.round(c.height * 0.05)}px`; } catch { /* older canvas */ }
    const w = Math.min(c.width - 40, g.measureText(text).width + c.height * 0.8), h = c.height * 0.62;
    g.fillStyle = 'rgba(8, 8, 8, 0.72)';
    g.beginPath(); g.roundRect?.((c.width - w) / 2, (c.height - h) / 2, w, h, h / 2); g.fill();
    g.strokeStyle = 'rgba(226, 195, 138, 0.7)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#f4efe6';
    g.fillText(text, c.width / 2, c.height / 2 + 2, c.width - 60);
    this.tex.needsUpdate = true;
  }
}

export class XRMode {
  constructor(engine, { player, experience = null, overlay = null, onStart = () => {}, onEnd = () => {}, onToggle = () => {} } = {}) {
    Object.assign(this, { engine, player, experience, overlay, onStart, onEnd, onToggle });
    this.session = null;
    this.mode = null;
    this.inst = null;
    // rig: XR reference space → scene world. The headset camera is its child (three.js composes
    // the viewer pose with the parent), so moving / scaling the rig moves the viewer.
    this.rig = new THREE.Group();
    this.rig.name = 'xr-rig';
    this.rig.matrixAutoUpdate = false;
    this.cam = new THREE.PerspectiveCamera(70, 1, TUNE.vr.near, 1000);
    this.rig.add(this.cam);
    // dip to black: a small sphere around the eyes, drawn last
    this.fade = new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 12), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    this.fade.renderOrder = 1e9;
    this.fade.frustumCulled = false;
    this.cam.add(this.fade);
    // room layer, drawn after the scene without clipping: typography panel, hints, reticle, plinth
    this.room = new THREE.Scene();
    this.roomRoot = new THREE.Group();
    this.roomRoot.matrixAutoUpdate = false;
    this.room.add(this.roomRoot);
    const aspect = OUTPUT_ASPECT;
    const pw = 2048, ph = Math.round(pw / aspect);
    this.panelRT = new THREE.WebGLRenderTarget(pw, ph, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true });
    // (the texture holds premultiplied colour: blend it as such; fades scale colour and alpha alike)
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1 / aspect), new THREE.MeshBasicMaterial({
      map: this.panelRT.texture, transparent: true, depthTest: false, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    this.panel.renderOrder = 1e5;
    this.panel.frustumCulled = false;
    this.hint = new Label(0.9);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.055, 0.07, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe2c38a, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false }));
    this.reticle.renderOrder = 1e6;
    const H = TUNE.ar.half, R = H / Math.cos(Math.PI / TUNE.ar.sides);   // circumradius of the vitrine
    this.plinth = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R * 1.04, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0906, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    const rim = new THREE.Mesh(new THREE.RingGeometry(R * 1.04, R * 1.07, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe2c38a, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    rim.position.y = disc.position.y = 0.002;
    this.plinth.add(disc, rim);
    this.roomRoot.add(this.panel, this.hint, this.reticle, this.plinth);
    this.tune = TUNE;                             // (tests tweak it live)
    this.proxy = new THREE.PerspectiveCamera();   // the viewer's eye in scene space, for explorePosed
    this.dp = { P: new THREE.Vector3(), F: new THREE.Vector3(), C: new THREE.Vector3(), yaw: 0, focus: 5, tanHalf: 0.3 };
    this._target = new THREE.Vector3();
    this.follow = { x: new Damp(), y: new Damp(), z: new Damp(), yaw: new Damp(), lnS: new Damp() };
    this.planes = [];
    this.anchor = new THREE.Vector3();
    this.anchorYaw = 0;
    this._pos = new THREE.Vector3();
    this.hit = null;
    this.hidden = [];
    this._pads = {};
    this._frame = this._frame.bind(this);
    this._end = this._end.bind(this);
    this._select = this._select.bind(this);
    this._squeeze = () => this.stop();
    this._bindOverlay();
  }

  get active() { return !!this.session; }

  // Start a session. Call inside the user's tap: the request (and the audio unlock) needs it.
  start(mode) {
    if (this.session || this._pending || !navigator.xr) return Promise.resolve(false);
    const ar = mode === AR;
    const init = ar
      ? { optionalFeatures: ['hit-test', 'local-floor', ...(this.overlay ? ['dom-overlay'] : [])], ...(this.overlay ? { domOverlay: { root: this.overlay } } : {}) }
      : { optionalFeatures: ['local-floor', 'hand-tracking'] };
    let req;
    try { req = navigator.xr.requestSession(mode, init); } catch (e) { return Promise.reject(e); }
    this._pending = true;
    // wake the audio inside this tap; the film starts once the session is up (AR: once placed)
    const exp = this.experience?.active ? this.experience : null;
    if (exp) exp.play();
    else if (this.player.ctx) { this.player.ctx.resume().catch(() => {}); this.player.unlock?.(); }
    return req.then((s) => this._begin(s, mode)).finally(() => { this._pending = false; });
  }

  stop() { this.session?.end().catch(() => {}); }

  toggle() {
    const exp = this.experience?.active ? this.experience : null;
    if (exp) exp.toggle(); else this.player.toggle();
    this.onToggle();
    this._syncOverlay();
  }

  seekBy(ds) {
    const exp = this.experience?.active ? this.experience : null;
    if (exp) exp.seek(exp.t + ds); else this.player.seek(this.player.currentTime + ds);
  }

  get playing() { return this.experience?.active ? this.experience.playing : this.player.playing; }

  async _begin(session, mode) {
    const e = this.engine, r = e.renderer;
    this.session = session; this.mode = mode;
    this.saved = {
      toneMapping: r.toneMapping, exposure: r.toneMappingExposure, cs: r.outputColorSpace, autoClear: r.autoClear,
      clip: r.clippingPlanes, clear: r.getClearColor(new THREE.Color()), alpha: r.getClearAlpha(),
    };
    // straight to the headset: tone mapping and sRGB in the materials (the XR framebuffer takes
    // the output colour space at session start)
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.autoClear = true;
    e.xrActive = true;
    r.xr.enabled = true;
    r.xr.cameraAutoUpdate = false;
    r.xr.setReferenceSpaceType('local');
    try {
      await r.xr.setSession(session);
    } catch (err) {
      this._restore();
      session.end().catch(() => {});
      throw err;
    }
    session.addEventListener('end', this._end);
    session.addEventListener('select', this._select);
    session.addEventListener('squeeze', this._squeeze);
    this.refSpace = r.xr.getReferenceSpace();
    this.inst = null;
    this._lastTime = null; this._lastFilmT = null; this._prevP = null; this._cutAt = -1e9; this._seeded = false;
    this.placed = false; this.hit = null; this.hitSource = null; this._pads = {};
    this._subject = null; this._probeAt = -1e9;
    this._warned = false; this._failed = false;
    const ar = mode === AR;
    if (ar && session.requestHitTestSource) {
      session.requestReferenceSpace('viewer')
        .then((space) => session.requestHitTestSource({ space }))
        .then((src) => { if (this.session === session) this.hitSource = src; else src.cancel?.(); })
        .catch((err) => console.info('[xr] no hit-test: the model is placed in front of you', err?.message ?? err));
    }
    this.reticle.visible = false;
    this.plinth.visible = ar;
    document.body.classList.add('xr-on', ar ? 'xr-ar-on' : 'xr-vr-on');
    this.onStart(mode);
    // VR: roll film (AR waits for the model to be placed)
    const exp = this.experience?.active ? this.experience : null;
    if (!ar && !exp && !this.player.playing) this.player.play(this.player.time >= FILM_DURATION - 0.05 ? 0 : this.player.time);
    this._syncOverlay();
    r.xr.setAnimationLoop(this._frame);
    return true;
  }

  _end() {
    const s = this.session;
    if (!s) return;
    s.removeEventListener('end', this._end);
    s.removeEventListener('select', this._select);
    s.removeEventListener('squeeze', this._squeeze);
    this.hitSource?.cancel?.();
    this.hitSource = null;
    const mode = this.mode;
    this.engine.renderer.xr.setAnimationLoop(null);
    this._detach();
    this._unclipShaders();
    this._restore();
    this.session = null; this.mode = null;
    document.body.classList.remove('xr-on', 'xr-ar-on', 'xr-vr-on');
    // three.js has put the canvas size back; rebuild the film's render targets for it
    this.engine.outW = 0;
    this.engine.resize();
    this.onEnd(mode);
  }

  _restore() {
    const e = this.engine, r = e.renderer, s = this.saved;
    r.xr.enabled = false;
    r.xr.cameraAutoUpdate = true;
    if (s) {
      r.toneMapping = s.toneMapping; r.toneMappingExposure = s.exposure; r.outputColorSpace = s.cs;
      r.autoClear = s.autoClear; r.clippingPlanes = s.clip; r.setClearColor(s.clear, s.alpha);
    }
    e.xrActive = false;
  }

  // the rig lives in the sequence being shown; leaving one hands its camera cheats back
  _attach(inst) {
    this._detach();
    this.inst = inst;
    inst.scene.add(this.rig);
    this._hideList = null; this._wallList = null;
    if (this.mode === AR) this._clipShaders(inst);
  }

  // AR: materials are adapted for compositing over the camera view (all undone when the session
  // ends, so the film's programs come back unchanged):
  //  · the scenes' own shader materials (stars, glows, planets, particles) learn to honour the
  //    vitrine's clipping planes: main() is wrapped so it also passes the view-space position the
  //    clipping chunk needs (from the untransformed vertex: exact for meshes and shells);
  //  · opaque surfaces write full coverage (their alpha, e.g. a texture's, never mattered in the film);
  //  · additive light (glows, rays, sparks) adds colour but no coverage, so over the room it stays
  //    light instead of turning into a dark veil.
  _clipShaders(inst) {
    const saved = this._patched ??= new Map();
    const MAIN = /void\s+main\s*\(\s*(void)?\s*\)/;
    const glow = this._glow ??= new Map();
    inst.scene.traverse((o) => {
      for (const m of o.material ? [o.material].flat() : []) {
        if (m.blending === THREE.AdditiveBlending && !glow.has(m)) {
          glow.set(m, [m.blending, m.blendEquation, m.blendSrc, m.blendDst, m.blendSrcAlpha, m.blendDstAlpha, m.blendEquationAlpha]);
          Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
        }
        if (saved.has(m) || m.isRawShaderMaterial) continue;
        const opaque = !m.transparent && m.blending === THREE.NormalBlending;
        const clip = m.isShaderMaterial && !m.clipping && MAIN.test(m.vertexShader) && MAIN.test(m.fragmentShader);
        if (!opaque && !clip) continue;
        saved.set(m, { obc: m.onBeforeCompile, key: m.customProgramCacheKey, own: Object.hasOwn(m, 'onBeforeCompile'), ownKey: Object.hasOwn(m, 'customProgramCacheKey'), clipping: m.clipping });
        const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
        const full = opaque ? 'gl_FragColor.a = 1.0;' : '';
        if (clip) m.clipping = true;
        m.onBeforeCompile = function (sh, r) {
          prev?.call(this, sh, r);
          if (clip) {
            sh.vertexShader = `#include <clipping_planes_pars_vertex>\n${sh.vertexShader.replace(MAIN, 'void xrUserMain()')}
void main() {
  xrUserMain();
  #if NUM_CLIPPING_PLANES > 0
    #ifdef USE_INSTANCING
      vClipPosition = -(modelViewMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
    #else
      vClipPosition = -(modelViewMatrix * vec4(position, 1.0)).xyz;
    #endif
  #endif
}`;
            sh.fragmentShader = `#include <clipping_planes_pars_fragment>\n${sh.fragmentShader.replace(MAIN, 'void xrUserMain()')}
void main() {
  #include <clipping_planes_fragment>
  xrUserMain();
  ${full}
}`;
          } else if (sh.fragmentShader.includes('#include <dithering_fragment>')) {
            sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${full}`);
          }
        };
        m.customProgramCacheKey = function () { return `${key.call(this)}|xr-ar${clip ? 'c' : ''}${opaque ? 'o' : ''}`; };
        m.needsUpdate = true;
      }
    });
  }

  _unclipShaders() {
    for (const [m, v] of this._glow ?? []) [m.blending, m.blendEquation, m.blendSrc, m.blendDst, m.blendSrcAlpha, m.blendDstAlpha, m.blendEquationAlpha] = v;
    this._glow?.clear();
    if (!this._patched) return;
    for (const [m, s] of this._patched) {
      m.clipping = s.clipping;
      if (s.own) m.onBeforeCompile = s.obc; else delete m.onBeforeCompile;
      if (s.ownKey) m.customProgramCacheKey = s.key; else delete m.customProgramCacheKey;
      m.needsUpdate = true;
    }
    this._patched.clear();
  }
  _detach() {
    const inst = this.inst;
    if (!inst) return;
    inst.scene.remove(this.rig);
    try { inst.exploreEnd?.(); } catch { /* scene hook */ }
    this.inst = null;
  }

  _select() {
    if (this.mode !== AR) { this.toggle(); return; }
    // AR: place (or move) the model where the reticle is; the film starts on the first placement
    const first = !this.placed;
    this.placed = true;
    this._placeAt(this._head());
    this.reticle.visible = false;
    if (first) {
      const exp = this.experience?.active ? this.experience : null;
      if (!exp && !this.player.playing) this.player.play(this.player.time >= FILM_DURATION - 0.05 ? 0 : this.player.time);
      this.onToggle();
    }
    this._syncOverlay();
  }

  _head() { return _u.setFromMatrixPosition(this.engine.renderer.xr.getCamera().matrix); }

  // anchor = the vitrine's floor point in the room, turned to face the viewer
  _placeAt(head) {
    if (this.hit) this.anchor.copy(this.hit);
    else {
      const q = _q.setFromRotationMatrix(this.engine.renderer.xr.getCamera().matrix);
      const f = _v.set(0, 0, -1).applyQuaternion(q);
      f.y = 0;
      if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
      f.normalize();
      this.anchor.copy(head).addScaledVector(f, TUNE.ar.reach);
      this.anchor.y = head.y - TUNE.ar.drop;
    }
    this.anchorYaw = Math.atan2(-(this.anchor.x - head.x), -(this.anchor.z - head.z));
  }

  _input(frame) {
    // AR: where the viewer points on a real surface
    if (this.mode === AR && this.hitSource) {
      try {
        const res = frame.getHitTestResults(this.hitSource);
        const pose = res[0]?.getPose(this.refSpace);
        this.hit = pose ? (this.hit ?? new THREE.Vector3()).setFromMatrixPosition(_m.fromArray(pose.transform.matrix)) : null;
      } catch { this.hit = null; }
    }
    for (const src of this.session.inputSources) {
      const gp = src.gamepad;
      if (!gp) continue;
      const st = this._pads[src.handedness] ??= { x: 0, a: false };
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] ?? 0;
      const dir = ax > 0.7 ? 1 : ax < -0.7 ? -1 : 0;
      if (dir && dir !== st.x) this.seekBy(5 * dir);
      st.x = dir;
      const a = !!gp.buttons[4]?.pressed;   // A / X
      if (a && !st.a) this.toggle();
      st.a = a;
    }
  }

  _frame(time, frame) {
    if (!frame || !this.session) return;
    try { this._render(time, frame); } catch (err) {
      if (!this._failed) { console.error('[xr] frame failed', err); this._failed = true; }
    }
  }

  _render(time, frame) {
    this.frames = (this.frames ?? 0) + 1;
    const e = this.engine, r = e.renderer, ar = this.mode === AR, cfg = ar ? TUNE.ar : TUNE.vr;
    const raw = this._lastTime == null ? 0 : Math.max(0, (time - this._lastTime) / 1000), wall = Math.min(0.1, raw);
    this._lastTime = time;
    this._input(frame);

    // clock: the soundtrack (or Experience mode's own clock, which this loop drives while in XR)
    const exp = this.experience?.active ? this.experience : null, player = this.player;
    if (exp) { if (exp.playing && (!ar || this.placed)) exp.step(wall); }
    else if (player.playing && player.currentTime >= FILM_DURATION) {
      player.pause(); player.time = FILM_DURATION; player.onEnd?.(); this._syncOverlay();
    }
    const filmT = clamp(exp ? exp.t : player.currentTime, 0, FILM_DURATION - 1e-3);
    const playing = exp ? exp.playing : player.playing;
    const T = filmT / TIME_SCALE;
    const inst = e.mainInstance(T);
    let snap = !this._seeded;
    if (inst !== this.inst) { this._attach(inst); snap = true; }
    const expected = (this._lastFilmT ?? filmT) + (playing ? (exp ? wall * exp.speed : raw) : 0);
    if (Math.abs(filmT - expected) > 0.35) snap = true;                   // a seek or a loop
    const dt = Math.max(0, filmT - (this._lastFilmT ?? filmT)) / TIME_SCALE;
    this._lastFilmT = filmT;

    // pose the sequence exactly as the film does (live / drone offsets never apply in XR)
    e.live?.restore?.(inst);
    const eye = r.xr.getCamera().cameras[0];
    const S0 = Math.exp(this.follow.lnS.x);
    const info = e.info(T, inst.segment, dt);
    // particle sizes: the headset's pixels per world unit (their shaders read the viewport height)
    info.height = (eye?.viewport?.w || 1600) / S0; info.width = info.height * FILM_ASPECT; info.pixelRatio = info.height / 800;
    try { inst.update(info.t, info); } catch (err) {
      if (!this._warned) { console.error(`[xr] ${inst.segment.id} update failed`, err); this._warned = true; }
    }
    // chapter headings follow engine.headings (also in Experience mode); HUD and titles are off
    // in the clean Experience picture (see _drawPanel)
    const typography = !ar && e.headings !== false && !!e.words3d;
    if (typography) e.words3d.apply(inst, T); else e.words3d?.hideAll(inst);
    try { inst.explore?.(info.t); } catch { /* scene hook */ }

    // follow the director
    const d = directorPose(inst, this.dp);
    if (this._prevP && !snap) {
      const ref = Math.max(0.05, this._prevFocus);
      if (d.P.distanceTo(this._prevP) > 0.6 * ref || Math.abs(wrap(d.yaw - this._prevYaw)) > 0.7) snap = true;   // a cut inside the shot
    }
    (this._prevP ??= new THREE.Vector3()).copy(d.P); this._prevFocus = d.focus; this._prevYaw = d.yaw;
    if (snap && this._seeded && !ar) this._cutAt = time;
    this._seeded = true;
    const f = this.follow;
    let src = d.P, S;
    if (ar) {
      // what the shot shows: a depth probe of the director's view (on cuts and twice a second)
      const shot = cfg.shots[inst.segment.id] ?? {};
      if (shot.centre) this._subject = { D: null, floorY: null };
      else if (snap || !this._subject || time - this._probeAt > 500) { this._probeAt = time; this._subject = this._probe(inst, d); }
      const sub = this._subject, D = sub.D ?? d.focus;
      const R = shot.radius ?? D * d.tanHalf * cfg.frame * (shot.frame ?? 1);
      S = R / cfg.half;
      // the vitrine's centre: a little behind the visible surface (subjects have depth), its floor
      // on the set's lowest ground under the subject, so the model stands on the table
      src = this._target.copy(d.P).addScaledVector(d.F, D + (shot.depth ?? cfg.depth) * R);
      if (shot.centre) src.fromArray(shot.centre);
      else if (sub.floorY != null) src.y = clamp(sub.floorY - 0.03 * R, src.y - R, src.y + 0.5 * R) + R;
    } else S = vrScale(d);
    const yawT = f.yaw.x + wrap(d.yaw - f.yaw.x);                         // continuous heading
    if (snap) { f.x.snap(src.x); f.y.snap(src.y); f.z.snap(src.z); f.yaw.snap(yawT); f.lnS.snap(Math.log(S)); } else {
      f.x.to(src.x, cfg.follow, wall); f.y.to(src.y, cfg.follow, wall); f.z.to(src.z, cfg.follow, wall);
      f.yaw.to(yawT, cfg.turn, wall); f.lnS.to(Math.log(S), cfg.zoom, wall);
    }
    const pos = this._pos.set(f.x.x, f.y.x, f.z.x), scale = Math.exp(f.lnS.x);
    const rig = this.rig;
    if (ar) {
      if (!this.placed) this._placeAt(this._head().clone());
      const centre = _v.copy(this.anchor).addScaledVector(Y, cfg.half);
      arRigMatrix(rig.matrix, pos, f.yaw.x, scale, centre, this.anchorYaw);
    } else rigMatrix(rig.matrix, pos, f.yaw.x, scale);
    rig.matrixWorldNeedsUpdate = true;
    this.roomRoot.matrix.copy(rig.matrix);
    this.roomRoot.matrixWorldNeedsUpdate = true;
    // depth range in metres (updated only on real changes: each one is a render-state update)
    const near = ar ? 0.02 : cfg.near, far = ar ? 60 : clamp(inst.camera.far / scale, 30, 2e4);
    if (Math.abs(this.cam.far - far) > 0.2 * far || this.cam.near !== near) { this.cam.near = near; this.cam.far = far; }

    // the viewer's eye in scene space: scenes turn labels / thin haze toward it
    _m.multiplyMatrices(rig.matrix, r.xr.getCamera().matrix).decompose(this.proxy.position, this.proxy.quaternion, _u);
    this.proxy.fov = inst.camera.fov; this.proxy.updateMatrixWorld(true);
    try { inst.explorePosed?.(this.proxy); } catch { /* scene hook */ }

    // fades: chapter hand-overs, cuts, the film's own fade-out
    let fade = 1;
    if (!ar) {
      for (const s of SWITCHES) fade = Math.min(fade, smooth(Math.abs(filmT - s), 0, TUNE.fadeSwitch));
      fade = Math.min(fade, smooth((time - this._cutAt) / 1000, 0, TUNE.fadeCut), clamp((DURATION - T) / 0.6, 0, 1), smooth(filmT, 0, 0.15));
    }
    this.fade.visible = fade < 0.999;
    this.fade.material.opacity = 1 - fade;

    // the film's typography onto the floating panel (VR)
    this.panel.visible = !ar && this._drawPanel(inst, T);
    if (this.panel.visible) {
      const D = cfg.panelDist, W = Math.min(cfg.panelWidth, 1.25 * OUTPUT_ASPECT);
      this.panel.scale.setScalar(W);
      this.panel.position.set(0, 0, -D);
      this.panel.material.opacity = fade;
      this.panel.material.color.setScalar(fade);
    }

    // AR: the vitrine
    const scene = inst.scene, bg = scene.background, fog = scene.fog;
    let fogSave = null;
    if (ar) {
      const half = cfg.half * scale;
      clipPrism(this.planes, pos, f.yaw.x, half, cfg.sides);
      r.clippingPlanes = this.planes;
      scene.background = null;
      // haze as thick at the subject as in the film, measured from where the viewer stands
      if (fog) {
        fogSave = [fog.density, fog.near, fog.far];
        const k = clamp((this._subject?.D ?? d.focus) / Math.max(1e-3, this._head().distanceTo(this.anchor) * scale), 0.05, 1);
        if (fog.isFogExp2) fog.density *= k; else { fog.near /= k; fog.far /= k; }
      }
      this._hideOutside(inst, pos, half);
      r.setClearColor(0x000000, 0);
      const head = this._head();
      this.plinth.position.copy(this.anchor);
      this.plinth.rotation.y = this.anchorYaw;
      const showReticle = !this.placed && !!this.hit;
      this.reticle.visible = showReticle;
      if (showReticle) this.reticle.position.copy(this.hit);
      this.hint.visible = !this.placed || !playing;
      this.hint.set(!this.placed ? (this.hit ? 'TAP OR PULL TRIGGER TO PLACE' : 'LOOK AT A TABLE · TAP TO PLACE') : 'PAUSED · A / X OR ▶ TO PLAY');
      this.hint.scale.setScalar(0.45);
      this.hint.position.copy(this.anchor).addScaledVector(Y, cfg.half * 2 + 0.08);
      this.hint.rotation.set(0, Math.atan2(head.x - this.hint.position.x, head.z - this.hint.position.z), 0);
    } else {
      r.setClearColor(inst.background ?? 0x000000, 1);
      this.hint.visible = !playing;
      this.hint.set(filmT >= FILM_DURATION - 0.01 ? 'THE END · TRIGGER TO PLAY AGAIN · GRIP TO EXIT' : 'PAUSED · TRIGGER TO PLAY · GRIP TO EXIT');
      this.hint.scale.setScalar(1);
      this.hint.position.set(0, -0.75, -2.4);
      this.hint.rotation.set(-0.3, 0, 0);
    }
    r.toneMappingExposure = (inst.exposure ?? 1) * 0.6;   // the grade's ACES has no 1/0.6 pre-gain

    // pose the headset camera ourselves (cameraAutoUpdate is off) to correct its culling frustum
    rig.updateMatrixWorld();
    r.xr.updateCamera(this.cam);
    const xc = r.xr.getCamera();
    if (xc.cameras.length === 2) unionFrustum(xc, xc.cameras[0], xc.cameras[1]);
    try {
      r.render(scene, this.cam);
      // room layer: panel, hints, reticle, plinth (never clipped)
      r.clippingPlanes = [];
      r.autoClear = false;
      r.render(this.room, this.cam);
    } finally {
      r.autoClear = true;
      scene.background = bg;
      if (fogSave) [fog.density, fog.near, fog.far] = fogSave;
      for (const o of this.hidden) o.visible = true;
      this.hidden.length = 0;
    }
  }

  // Film typography with the director's lens, into a transparent texture: 3D chapter words, the
  // sequence's HUD and the chapter titles (as the engine layers them). Returns whether any showed.
  _drawPanel(inst, T) {
    const e = this.engine, r = e.renderer;
    const words = e.words3d?.items.some((it) => it.inst === inst && it.group.visible && !it.zoom);
    const hud = !e.clean && inst.hud, titles = !e.clean && !!e.titles?.update(T);
    if (!words && !hud && !titles) return false;
    const xrTarget = r.getRenderTarget();
    r.xr.enabled = false;           // an ordinary render into a texture, mid-frame
    r.autoClear = false;            // (layered like the engine's plate: no clear between passes)
    try {
      r.setRenderTarget(this.panelRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      if (words) e.withMatte(inst.camera, () => e.words3d.renderOverlay(inst, r, inst.camera));
      if (hud) { r.clearDepth(); r.render(hud.scene, hud.camera); }
      if (titles) { r.clearDepth(); r.render(e.titles.scene, e.titles.camera); }
    } finally {
      r.autoClear = true;
      r.xr.enabled = true;
      r.setRenderTarget(xrTarget);
    }
    return true;
  }

  // AR: where the director's lens meets solid geometry. A tiny render of the shot with a material
  // that writes view depth (log-encoded into RGBA8) and is read back: the median depth of the centre
  // of frame is the subject's distance; the lowest hit under the subject is the set's floor.
  _probe(inst, d) {
    const r = this.engine.renderer, cam = inst.camera, scene = inst.scene;
    const PW = 96, PH = 40;
    if (!this.probeRT) {
      this.probeRT = new THREE.WebGLRenderTarget(PW, PH, { depthBuffer: true });
      this.probeBuf = new Uint8Array(PW * PH * 4);
      this.probeMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `#include <common>
          varying float vD;
          void main() {
            #include <begin_vertex>
            #include <project_vertex>
            vD = -mvPosition.z;
          }`,
        fragmentShader: /* glsl */ `varying float vD;
          void main() {
            float t = clamp((log2(max(vD, 1e-4)) + 8.0) / 24.0, 0.0, 1.0) * 255.0;
            gl_FragColor = vec4(floor(t) / 255.0, fract(t), 0.0, 1.0);
          }`,
      });
    }
    // solid geometry only: no particles, lines, sprites, glows, see-through shells or sky domes
    const hid = [];
    scene.traverseVisible((o) => {
      const mats = o.material ? [o.material].flat() : null;
      if (o.isPoints || o.isLine || o.isSprite || (o.isMesh && mats.some((m) => m.transparent || !m.depthWrite || m.side === THREE.BackSide))) { o.visible = false; hid.push(o); }
    });
    const xrTarget = r.getRenderTarget(), bg = scene.background, clip = r.clippingPlanes;
    scene.overrideMaterial = this.probeMat; scene.background = null; r.clippingPlanes = [];
    r.xr.enabled = false;
    try {
      r.setRenderTarget(this.probeRT);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(scene, cam);
      r.readRenderTargetPixels(this.probeRT, 0, 0, PW, PH, this.probeBuf);
    } catch { return { D: null, floorY: null }; } finally {
      scene.overrideMaterial = null; scene.background = bg; r.clippingPlanes = clip;
      for (const o of hid) o.visible = true;
      r.xr.enabled = true;
      r.setRenderTarget(xrTarget);
    }
    const buf = this.probeBuf, th = d.tanHalf, ta = th * (cam.aspect || 2.39);
    const centre = [], pts = [];
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = (y * PW + x) * 4;
        if (buf[i + 3] < 128) continue;
        const z = 2 ** (((buf[i] + buf[i + 1] / 255) / 255) * 24 - 8);
        const nx = ((x + 0.5) / PW) * 2 - 1, ny = ((y + 0.5) / PH) * 2 - 1;
        if (Math.abs(nx) < 0.25 && Math.abs(ny) < 0.3) centre.push(z);
        pts.push(nx * ta * z, ny * th * z, -z);
      }
    }
    if (centre.length < PW * PH * 0.075 * 0.1) return { D: null, floorY: null };
    // (a little past the median: the foreground ground under the lens is nearer than the subject)
    centre.sort((a, b) => a - b);
    const shot = TUNE.ar.shots[inst.segment.id] ?? {};
    const D = centre[Math.floor(centre.length * 0.6)], R = D * th * TUNE.ar.frame * (shot.frame ?? 1);
    const k = D + (shot.depth ?? TUNE.ar.depth) * R, cx = d.P.x + d.F.x * k, cz = d.P.z + d.F.z * k;
    const ys = [], m = cam.matrixWorld.elements;
    for (let i = 0; i < pts.length; i += 3) {
      const [a, b, c] = [pts[i], pts[i + 1], pts[i + 2]];
      const wx = m[0] * a + m[4] * b + m[8] * c + m[12], wy = m[1] * a + m[5] * b + m[9] * c + m[13], wz = m[2] * a + m[6] * b + m[10] * c + m[14];
      if (Math.hypot(wx - cx, wz - cz) < R * 0.9) ys.push(wy);
    }
    ys.sort((a, b) => a - b);
    return { D, floorY: ys.length > 8 ? ys[Math.floor(ys.length * 0.05)] : null };
  }

  // AR, per frame: what would spoil the vitrine steps aside (restored right after the frame):
  // backdrop walls behind the set, enclosing domes and rooms, dust clouds, glow billboards reaching
  // past the glass, and any shader material that could not learn clipping yet reaches outside it.
  _hideOutside(inst, c, half) {
    let list = this._hideList;
    if (!list) {
      list = this._hideList = [];
      inst.scene.traverse((o) => {
        const mats = [o.material ?? []].flat();
        if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && mats.some((m) => m.isShaderMaterial && !m.clipping)) list.push(o);
      });
    }
    // backdrops: big upright flat walls behind the set read as a box in the room
    let walls = this._wallList;
    if (!walls) {
      walls = this._wallList = [];
      inst.scene.traverse((o) => {
        const g = o.geometry;
        if (!o.isMesh || !g?.attributes?.position) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const sz = g.boundingBox.getSize(_v), mx = Math.max(sz.x, sz.y, sz.z), mn = Math.min(sz.x, sz.y, sz.z);
        if (mx > 0 && mn < mx * 0.02) walls.push([o, sz.x === mn ? 0 : sz.y === mn ? 1 : 2]);
        // …and sky domes, haze shells and rooms around the set (anything solid that encloses the
        // vitrine): backgrounds, which would fill the vitrine like a block
        else if (mx > 0) walls.push([o, -1]);
      });
      // atmospheric dust / star fields: a cloud as big as the vitrine would fill it like a glowing block
      inst.scene.traverse((o) => {
        if (o.isPoints && o.geometry?.attributes?.position) walls.push([o, -2]);
        // …and glow billboards reaching past the vitrine, which it would cut into a lit slab
        else if (o.isSprite) walls.push([o, -3]);
      });
    }
    inst.scene.updateMatrixWorld();
    for (const [o, axis] of walls) {
      if (!o.visible) continue;
      if (axis === -3) {
        const r = o.matrixWorld.getMaxScaleOnAxis() * 0.75;   // a billboard's reach from its centre
        if (_u.setFromMatrixPosition(o.matrixWorld).distanceTo(c) + r > half) { o.visible = false; this.hidden.push(o); }
        continue;
      }
      if (axis === -2) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_sph.radius > half * 1.2) { o.visible = false; this.hidden.push(o); }
        continue;
      }
      if (axis < 0) {
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        _sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
        if (_sph.radius > half * 4 && _sph.center.distanceTo(c) < _sph.radius * 0.7) { o.visible = false; this.hidden.push(o); }
        continue;
      }
      const e = o.matrixWorld.elements, n = _v.set(e[axis * 4], e[axis * 4 + 1], e[axis * 4 + 2]).normalize();
      const size = o.geometry.boundingSphere ?? o.geometry.computeBoundingSphere() ?? o.geometry.boundingSphere;
      const r = size.radius * o.matrixWorld.getMaxScaleOnAxis();
      if (Math.abs(n.y) > 0.6 || r < half * 1.6) continue;
      // …only behind the subject (a painting or a page at the subject stays)
      const behind = _u.copy(size.center).applyMatrix4(o.matrixWorld).sub(this.dp.P).dot(this.dp.F) - _sph.center.copy(c).sub(this.dp.P).dot(this.dp.F);
      if (behind > half * 0.15 || (r > half * 2.5 && [o.material].flat().some((m) => m.transparent))) { o.visible = false; this.hidden.push(o); }
    }
    if (!list.length) return;
    const lim = half * 1.15;
    for (const o of list) {
      if (!o.visible) continue;
      let bs;
      if (o.isInstancedMesh) { if (!o.boundingSphere || (this._bsTick = (this._bsTick ?? 0) + 1) % 30 === 0) o.computeBoundingSphere(); bs = o.boundingSphere; } else {
        const g = o.geometry;
        if (!g) continue;
        if (!g.boundingSphere) g.computeBoundingSphere();
        bs = g.boundingSphere;
      }
      _sph.copy(bs).applyMatrix4(o.matrixWorld);
      const out = !isFinite(_sph.radius) || _sph.center.distanceTo(c) + _sph.radius * 0.6 > lim;
      if (out) { o.visible = false; this.hidden.push(o); }
    }
  }

  // AR on phones: a DOM overlay with play / pause, exit and the placement hint
  _bindOverlay() {
    const el = this.overlay;
    if (!el) return;
    el.addEventListener('beforexrselect', (ev) => { if (ev.target.closest('button')) ev.preventDefault(); });
    el.querySelector('[data-xr="play"]')?.addEventListener('click', () => this.toggle());
    el.querySelector('[data-xr="exit"]')?.addEventListener('click', () => this.stop());
  }

  _syncOverlay() {
    const el = this.overlay;
    if (!el) return;
    el.classList.toggle('xr-playing', this.playing);
    el.classList.toggle('xr-placed', !!this.placed);
  }
}
