// Film engine: owns the renderer, instantiates every sequence up front, and
// renders any global time T deterministically:
//   sequence(s) → HDR render targets → ambient occlusion + depth of field → transition composite
//   → bloom → [motion-blur accumulation] → final grade (+ supersample downscale).
// Realism options (constructor `fx`, see main.js): quality 'high'/'ultra' enables screen-space AO
// and doubles shadow-map resolution; `supersample` renders internally at N× and filters down in the
// grade; render(T, dt, { motionBlur: N }) integrates N sub-frames over a 180° shutter (offline).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SEGMENTS, DURATION, TIME_SCALE, FILM_ASPECT, OUTPUT_ASPECT, warmthAt } from '../timeline.js';
import { DofShader, TransitionShader, FinalShader, AoShader, AoBlurShader, AoApplyShader, AccumShader, TRANSITION_MODES } from './post.js';
import { getFont3D } from '../lib/text.js';
import { TitleLayer } from './titles.js';
import { Words3D } from './words3d.js';
import { PALETTE } from '../lib/palette.js';
import { addSurfaceDetailToScene } from '../lib/surface.js';
import { sceneLights, buildSceneEnvironment } from '../lib/environment.js';
import { installSoftShadows, encodeShadow } from '../lib/softshadows.js';

const shaderMat = (def) => new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.clone(def.uniforms), vertexShader: def.vertexShader, fragmentShader: def.fragmentShader,
  depthTest: false, depthWrite: false,
});

export class Engine {
  constructor(canvas, { maxWidth = 1920, pixelRatio = Math.min(window.devicePixelRatio || 1, 2), quality = 'medium', supersample = 1, fx = {}, xr = null } = {}) {
    this.canvas = canvas;
    this.maxWidth = maxWidth;
    this.pixelRatio = pixelRatio;
    const hq = quality === 'high' || quality === 'ultra';
    // realism features: heavy ones only at high quality (real-time at medium stays as it was)
    this.fx = {
      ao: fx.ao ?? hq,                              // screen-space ambient occlusion
      shadowScale: fx.shadowScale ?? (hq ? 2 : 1),  // shadow-map resolution multiplier
      shutter: fx.shutter ?? 180,                   // motion-blur shutter angle (degrees)
      // light (every quality level): per-sequence image-based lighting and procedural micro-surface
      // detail on every lit material (see lib/environment.js, lib/surface.js)
      sceneEnv: fx.sceneEnv ?? true,
      detail: fx.detail ?? true,
      tonemap: fx.tonemap ?? 'aces',
      // high: contact-hardening (PCSS-style) shadow filtering, see lib/softshadows.js
      softShadows: fx.softShadows ?? hq,
    };
    if (this.fx.softShadows && !installSoftShadows()) this.fx.softShadows = false;
    this.quality = quality;
    this.supersample = Math.max(1, Math.min(4, supersample || 1));
    // xr: this device offers VR / AR (core/xr.js). The context is then made XR-compatible up front
    // (no context loss on entering a session) and, for headsets, multisampled: the XR framebuffer
    // inherits it. The film itself only ever draws one full-screen quad to the canvas, so its
    // pixels are identical either way.
    let context;
    if (xr) {
      try { context = canvas.getContext('webgl2', { alpha: false, antialias: xr.antialias !== false, xrCompatible: true, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }) ?? undefined; } catch { context = undefined; }
    }
    this.renderer = new THREE.WebGLRenderer({ canvas, context, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;       // tone mapping happens in the final grade
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // r186: soft Vogel-disk PCF (honours shadow.radius)
    this.instances = new Map();
    this.width = 2; this.height = 1;
    this.lastT = 0;
    // clean picture (Experience mode): no HUD, titles or interludes, but, unlike explore,
    // every sequence and transition keeps playing. Off by default: the film is untouched.
    this.clean = false;
    // chapter headings (the 3D words): drawn in the film and in Experience mode; they only
    // step aside while exploring (or when this is switched off)
    this.headings = true;
    // a VR / AR session is drawing (core/xr.js): the film's own frame loops stand down
    this.xrActive = false;
  }

  // Build shared resources and every sequence. `modules` maps segment id → scene module.
  async init(modules, onProgress = () => {}) {
    const r = this.renderer;
    const pmrem = new THREE.PMREMGenerator(r);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.ctx = {
      THREE, renderer: r, env: this.env, palette: PALETTE, font3D: getFont3D(), aspect: FILM_ASPECT,
      engine: this,
      // Ortho overlay whose visible area is x ∈ [-aspect, aspect], y ∈ [-1, 1].
      makeHUD: () => {
        const scene = new THREE.Scene();
        const m = FILM_ASPECT / OUTPUT_ASPECT;   // open matte: the authored band stays centred
        const camera = new THREE.OrthographicCamera(-FILM_ASPECT, FILM_ASPECT, m, -m, -10, 10);
        return { scene, camera };
      },
    };

    this.resize();
    this.titles = new TitleLayer();
    let i = 0;
    for (const seg of SEGMENTS) {
      const mod = modules[seg.id];
      const inst = await mod.create(this.ctx, seg);
      inst.segment = seg;
      if (inst.camera?.isPerspectiveCamera) { inst.camera.aspect = FILM_ASPECT; inst.camera.updateProjectionMatrix(); }
      this.instances.set(seg.id, inst);
      // Warm up: run one update mid-segment and compile its shaders so playback never hitches.
      try {
        const dur = seg.end - seg.start;
        const peak = new Map();   // brightest each light gets (many fade in): sizes the environment's softboxes
        for (const u of [0, dur * 0.25, dur * 0.5, dur * 0.75, dur]) {
          inst.update(u, this.info(seg.start + u, seg, 0));
          inst.scene.traverse((o) => { if (o.isLight) peak.set(o, Math.max(peak.get(o) ?? 0, o.intensity)); });
        }
        this.realism(inst, peak);
        this.upgradeShadows(inst);
        await r.compileAsync(inst.scene, inst.camera);
        if (inst.hud) await r.compileAsync(inst.hud.scene, inst.hud.camera);
      } catch (e) { console.warn('warm-up failed for', seg.id, e); }
      onProgress(++i / SEGMENTS.length, seg);
    }
    // 3D chapter words live inside each sequence's scene (built after every scene exists)
    this.words3d = new Words3D(this);
  }

  // Realism pass over a freshly built sequence: its own image-based lighting (replacing the shared
  // studio room) and micro-surface detail on its lit materials. Sequences opt out with
  // `inst.sceneEnv = false` or steer the environment with `inst.envLook` (see lib/environment.js).
  realism(inst, peak) {
    const sc = inst.scene;
    if (this.fx.sceneEnv && inst.sceneEnv !== false && sc.environment === this.env) {
      const hq = this.quality === 'high' || this.quality === 'ultra';
      const tex = buildSceneEnvironment(this.renderer, sceneLights(sc, peak), { size: hq ? 256 : 128, look: inst.envLook ?? {} });
      if (tex) { sc.environment = tex; inst._sceneEnv = tex; }
    }
    if (this.fx.detail) addSurfaceDetailToScene(sc);
  }

  /** The chapter heading isn't on screen (exploring, or headings off): scenes then apply the
   *  heading's bloom duck themselves, so the plate reads the same as in the film. */
  get headingsHidden() { return !!this.explore?.active || !this.headings; }

  // High quality: sharper, cleaner shadows. Each shadow-casting light's map is enlarged (capped at
  // 4096 / the GPU limit) and its PCF radius widened in proportion, so penumbrae keep their size
  // in the world but lose the stair-stepping and shimmer of coarse texels.
  upgradeShadows(inst) {
    const k = this.fx.shadowScale;
    if (!(k > 1)) return;
    const cap = Math.min(4096, this.renderer.capabilities.maxTextureSize);
    inst.scene.traverse((o) => {
      if (!o.isLight || !o.castShadow || !o.shadow || o.shadow._upgraded) return;
      const sz = o.shadow.mapSize;
      const n = Math.min(cap, sz.x * k), m = Math.min(cap, sz.y * k);
      const f = n / sz.x;
      sz.set(n, m);
      o.shadow.radius = (o.shadow.radius ?? 1) * Math.max(1, f * 0.75);
      if (this.fx.softShadows) encodeShadow(o);   // penumbra sized by the light and the occluder distance
      o.shadow.map?.dispose(); o.shadow.map = null;
      o.shadow._upgraded = true;
    });
  }

  // Fit the canvas to the window at the film aspect (letterbox / pillarbox via CSS).
  resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let cw = vw, ch = vw / OUTPUT_ASPECT;
    if (ch > vh) { ch = vh; cw = vh * OUTPUT_ASPECT; }
    this.canvas.style.width = `${Math.round(cw)}px`;
    this.canvas.style.height = `${Math.round(ch)}px`;
    const w = Math.min(Math.round(cw * this.pixelRatio), this.maxWidth);
    const h = Math.round(w / OUTPUT_ASPECT);
    this.setSize(w, h);
  }

  // Drop render resolution one step (used when the GPU can't hold frame rate).
  degrade() {
    const steps = [1920, 1600, 1280, 1024, 800];
    const next = steps.find((s) => s < this.outW);
    if (!next) return false;
    this.maxWidth = next;
    this.resize();
    console.info(`[engine] render width lowered to ${this.outW}px to keep playback smooth`);
    return true;
  }

  // (w, h) is the delivered canvas size; with supersampling every internal target is N× larger and
  // `width`/`height` (what scenes see as the render-target size) are the internal size.
  setSize(ow, oh) {
    if (ow === this.outW && oh === this.outH && this.rtA) return;
    this.outW = ow; this.outH = oh;
    const lim = Math.min(this.renderer.capabilities.maxTextureSize, 8192);
    const ss = Math.max(1, Math.min(this.supersample, lim / Math.max(ow, oh)));
    const w = Math.round(ow * ss), h = Math.round(oh * ss);
    this.ss = w / ow;
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(ow, oh, false);
    const mkRT = (depth, samples, W = w, H = h) => {
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples, colorSpace: THREE.LinearSRGBColorSpace });
      if (depth) { rt.depthTexture = new THREE.DepthTexture(W, H); rt.depthTexture.type = THREE.UnsignedIntType; }
      return rt;
    };
    [this.rtA, this.rtB, this.dofA, this.dofB, this.comp, this.accum, this.aoRaw, this.aoBlur].forEach((rt) => rt?.dispose());
    this.accum = null;   // motion-blur buffer: created on first use
    const msaa = this.ss >= 2 ? 2 : 4;   // supersampling already resolves edges; spare the memory
    this.rtA = mkRT(true, msaa); this.rtB = mkRT(true, msaa);
    this.dofA = mkRT(false, 0); this.dofB = mkRT(false, 0); this.comp = mkRT(false, 0);
    const aw = Math.max(1, Math.round(w / 2)), ah = Math.max(1, Math.round(h / 2));
    this.aoRaw = mkRT(false, 0, aw, ah); this.aoBlur = mkRT(false, 0, aw, ah);

    if (!this.dofQuad) {
      this.dofQuad = new FullScreenQuad(shaderMat(DofShader));
      if (this.quality === 'high' || this.quality === 'ultra') this.dofQuad.material.defines = { DOF_TAPS: 56 };
      this.transQuad = new FullScreenQuad(shaderMat(TransitionShader));
      this.finalQuad = new FullScreenQuad(shaderMat(FinalShader));
      this.aoQuad = new FullScreenQuad(shaderMat(AoShader));
      this.aoBlurQuad = new FullScreenQuad(shaderMat(AoBlurShader));
      const ap = shaderMat(AoApplyShader);   // multiplies the plate in place: dst * src
      Object.assign(ap, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor });
      this.aoApplyQuad = new FullScreenQuad(ap);
      const am = shaderMat(AccumShader);
      Object.assign(am, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor });
      this.accumQuad = new FullScreenQuad(am);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.55, 0.82);
    }
    this.bloom.setSize(w, h);
    this.dofQuad.material.uniforms.uResolution.value = new THREE.Vector2(w, h);
    this.dofQuad.material.uniforms.tAO.value = this.aoBlur.texture;
    this.aoApplyQuad.material.uniforms.tAO.value = this.aoBlur.texture;
    this.aoApplyQuad.material.uniforms.uResolution.value = new THREE.Vector2(w, h);
    this.aoQuad.material.uniforms.uDepthRes.value.set(w, h);
    this.aoQuad.material.uniforms.uAspect.value = w / h;
    this.aoBlurQuad.material.uniforms.uTexel.value.set(1 / aw, 1 / ah);
    this.aoBlurQuad.material.uniforms.tAO.value = this.aoRaw.texture;
    const fu = this.finalQuad.material.uniforms;
    fu.uResolution.value = new THREE.Vector2(ow, oh);
    fu.uSS.value = this.ss;
    fu.uSrcTexel.value.set(1 / w, 1 / h);
    this.finalQuad.material.uniforms.uAspect.value = OUTPUT_ASPECT;
    fu.uTonemap.value = { agx: 1, neutral: 2 }[this.fx.tonemap] ?? 0;
    this.transQuad.material.uniforms.uAspect.value = OUTPUT_ASPECT;
  }

  info(T, seg, dt) {
    const dur = seg.end - seg.start;
    const t = T - seg.start;
    return { T, t, dur, p: t / dur, dt, width: this.width, height: this.height, aspect: FILM_ASPECT, pixelRatio: this.width / FILM_ASPECT / 800 };
  }

  activeSegments(T) {
    T = Math.min(Math.max(T, 0), DURATION - 1e-4);
    return SEGMENTS.filter((s) => T >= s.start && T < s.end);
  }

  // The sequence that owns the frame at story time T (the incoming one past a transition's midpoint).
  mainInstance(T) {
    const segs = this.activeSegments(T);
    let s = segs[0];
    if (segs[1] && (T - segs[1].start) / (segs[0].end - segs[1].start) > 0.5) s = segs[1];
    return this.instances.get(s.id);
  }

  // Run fn with the camera's open-matte lens applied (as renderInstance renders it).
  withMatte(cam, fn) {
    const matte = cam.isPerspectiveCamera && OUTPUT_ASPECT !== FILM_ASPECT;
    let fov0;
    if (matte) {
      fov0 = cam.fov;
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov0) / 2) * Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.85)));
      cam.aspect = OUTPUT_ASPECT;
      cam.updateProjectionMatrix();
    }
    try { return fn(); } finally {
      if (matte) { cam.fov = fov0; cam.aspect = FILM_ASPECT; cam.updateProjectionMatrix(); }
    }
  }

  renderInstance(inst, T, dt, rt, dofRT) {
    const r = this.renderer;
    const info = this.info(T, inst.segment, dt);
    this.live?.restore?.(inst);   // undo last frame's live / drone offset (no-op when there was none)
    try {
      inst.update(info.t, info);
    } catch (e) {
      // A faulty sequence must never stop the film: log once, keep rendering its last pose.
      if (!inst._warned) { console.error(`[${inst.segment.id}] update failed at T=${T.toFixed(2)}`, e); inst._warned = true; }
    }
    // explore mode: the viewer's rig drives this sequence's camera; headings step aside
    const ex = this.explore?.active && this.explore.inst === inst ? this.explore : null;
    const clean = ex || this.clean, noWords = ex || !this.headings;
    if (ex) { this.words3d?.hideAll(inst); inst._wordsDuck = 0; ex.prepare(info.t); } else {
      this.live?.apply(inst, info.t);
      if (noWords) { this.words3d?.hideAll(inst); inst._wordsDuck = 0; } else this.words3d?.apply(inst, T);
    }
    r.setRenderTarget(rt);
    const bg = inst.background ?? 0x000000;
    r.setClearColor(bg, 1);
    r.clear(true, true, true);
    const cam = inst.camera;
    const matte = cam.isPerspectiveCamera && OUTPUT_ASPECT !== FILM_ASPECT;
    let fov0;
    if (matte) {
      // Open matte: (nearly) the same horizontal view as the 2.39 composition, taller frame; a slight
      // push-in (exponent 0.85) keeps subjects readable while every composed element stays in frame.
      fov0 = cam.fov;
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov0) / 2) * Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.85)));
      cam.aspect = OUTPUT_ASPECT;
      cam.updateProjectionMatrix();
    }
    r.render(inst.scene, cam);
    const dof = inst.dof;
    // The HUD is composited after depth of field so screen-space typography stays razor sharp.
    const drawHUD = (target) => { if (inst.hud && !clean) { r.setRenderTarget(target); r.clearDepth(); r.render(inst.hud.scene, inst.hud.camera); } };
    // chapter headings: a 3D overlay drawn over the finished (depth-of-field) plate with the same
    // lens, so they never intersect scene geometry and are never blurred by the scene's focus
    const drawWords = (target) => { if (noWords) return; r.setRenderTarget(target); r.clearDepth(); this.words3d?.renderOverlay(inst, r, cam); };
    let out = rt;
    const useDof = dof && dof.amount > 0.01 && !ex;
    const useAO = this.renderAO(inst, rt, cam);
    if (useAO && !useDof) {
      // no depth of field: darken the multisampled plate in place (it is read through its resolved
      // texture, which is not attached to the multisample framebuffer being drawn)
      const au = this.aoApplyQuad.material.uniforms;
      au.tColor.value = rt.texture; au.tDepth.value = rt.depthTexture;
      au.uNear.value = cam.near; au.uFar.value = cam.far;
      r.setRenderTarget(rt);
      this.aoApplyQuad.render(r);
    } else if (useDof) {
      const u = this.dofQuad.material.uniforms;
      u.tColor.value = rt.texture; u.tDepth.value = rt.depthTexture;
      u.uNear.value = inst.camera.near; u.uFar.value = inst.camera.far;
      u.uAOOn.value = useAO ? 1 : 0;
      u.uFocus.value = dof.focus * (inst._liveFocus ?? 1); u.uRange.value = dof.range ?? 2; u.uMaxBlur.value = dof.amount * (this.width / FILM_ASPECT / 800) * 14;
      r.setRenderTarget(dofRT);
      this.dofQuad.render(r);
      out = dofRT;
    }
    drawWords(out);
    if (matte) { cam.fov = fov0; cam.aspect = FILM_ASPECT; cam.updateProjectionMatrix(); }
    drawHUD(out);
    return out.texture;
  }

  // Screen-space ambient occlusion of the plate just rendered into rt (lens already applied).
  // Sequences can tune it with `inst.ao = { intensity, radius }` or opt out with `inst.ao = false`.
  renderAO(inst, rt, cam) {
    if (!this.fx.ao || inst.ao === false || !cam.isPerspectiveCamera) return false;
    const o = inst.ao ?? {};
    const intensity = o.intensity ?? 1;
    if (!(intensity > 0)) return false;
    const r = this.renderer, u = this.aoQuad.material.uniforms, e = cam.projectionMatrix.elements;
    u.tDepth.value = rt.depthTexture;
    u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uProj.value.set(e[0], e[5], e[8], e[9]);
    u.uRadius.value = o.radius ?? 0.05;
    u.uIntensity.value = intensity;
    u.uSeed.value = this._aoSeed ?? 0;
    r.setRenderTarget(this.aoRaw);
    this.aoQuad.render(r);
    r.setRenderTarget(this.aoBlur);
    this.aoBlurQuad.render(r);
    return true;
  }

  // T is film time (seconds of the delivered film); everything inside runs on story time.
  // opts.motionBlur = N (offline): integrate N sub-frames across the shutter (fx.shutter degrees of
  // the frame interval filmDt, centred on filmT) in linear HDR, then grade once. Sub-frames that
  // fall across a hard camera cut are dropped, so a cut never double-exposes.
  render(filmT, filmDt = 1 / 60, opts = {}) {
    if (this.xrActive) return;   // the headset's frame loop renders (core/xr.js)
    this.live?.tick();   // viewer's live camera offset (zero unless someone is dragging)
    const N = Math.max(1, Math.floor(opts.motionBlur ?? 0));
    if (N <= 1 || this.explore?.active || !(filmDt > 0)) {
      this._aoSeed = 0;
      const g = this.composite(filmT, filmDt);
      this.grade(this.comp.texture, g);
      return;
    }
    const open = (this.fx.shutter / 360) * filmDt;
    const times = this.subframeTimes(filmT, open, N);
    if (!this.accum) this.accum = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
    const r = this.renderer, au = this.accumQuad.material.uniforms;
    r.setRenderTarget(this.accum);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    let exposure = 0, harmony = 0;
    times.forEach((t, i) => {
      this._aoSeed = i;   // a different (deterministic) AO rotation per sub-frame: noise integrates away
      const g = this.composite(t, open / times.length);
      exposure += g.exposure / times.length; harmony += g.harmony / times.length;
      au.tInput.value = this.comp.texture; au.uWeight.value = 1 / times.length;
      r.setRenderTarget(this.accum);
      this.accumQuad.render(r);
    });
    this._aoSeed = 0;
    this.grade(this.accum.texture, { T: filmT / TIME_SCALE, exposure, harmony });
  }

  // Motion-blur helpers. Sequences are pure functions of time, so each sub-frame's owning camera
  // can be posed cheaply without rendering.
  subframePoses(times) {
    return times.map((ft) => {
      const T = ft / TIME_SCALE, inst = this.mainInstance(T), cam = inst.camera;
      try { inst.update(T - inst.segment.start, this.info(T, inst.segment, 0)); } catch { /* reported by render */ }
      cam.updateMatrixWorld(true);
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      cam.matrixWorld.decompose(p, q, new THREE.Vector3());
      // headings move on their own (e.g. the zoom through STARS): track their corners on screen
      const probes = [];
      if (this.words3d) {
        this.words3d.apply(inst, T);
        this.withMatte(cam, () => {
          for (const it of this.words3d.items) {
            if (it.inst !== inst || !it.group.visible) continue;
            it.group.updateMatrixWorld(true);
            for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, 0]]) {
              probes.push(new THREE.Vector3(x * it.width, y * it.capH, 0).applyMatrix4(it.group.matrixWorld).project(cam));
            }
          }
        });
      }
      return { inst, p, q, fov: cam.fov ?? 50, focus: inst.dof?.focus || 0, probes };
    });
  }

  // Per-step camera motion: { px: approximate image motion in pixels, cut: hard-cut flag }.
  subframeSteps(pose) {
    const steps = [];
    for (let i = 0; i + 1 < pose.length; i++) {
      const a = pose[i], b = pose[i + 1];
      if (a.inst !== b.inst) { steps.push({ dP: 0, dA: 0, px: 0 }); continue; }   // transition hand-over
      const dP = a.p.distanceTo(b.p), dA = a.q.angleTo(b.q) + Math.abs(a.fov - b.fov) * Math.PI / 180;
      const scale = Math.max(a.focus, 0.05 * a.p.length(), 0.5);
      let px = (dA / THREE.MathUtils.degToRad(a.fov) + dP / scale * 0.5) * this.height;
      if (a.probes.length === b.probes.length) {
        a.probes.forEach((u, k) => {
          const v = b.probes[k];
          if (Math.abs(u.z) > 1 || Math.abs(v.z) > 1 || Math.abs(u.x) > 2 || Math.abs(u.y) > 2) return;   // behind / far off screen
          px = Math.max(px, Math.hypot((u.x - v.x) * this.width, (u.y - v.y) * this.height) / 2);
        });
      }
      steps.push({ dP, dA, px, scale });
    }
    const med = (k) => steps.map((s) => s[k]).sort((x, y) => x - y)[steps.length >> 1];
    const mP = med('dP'), mA = med('dA');
    for (const s of steps) s.cut = (s.dP > 6 * mP && s.dP > 0.04 * (s.scale ?? 1)) || (s.dA > 6 * mA && s.dA > 0.035);
    return steps;
  }

  // Sub-frame times for one output frame: N across the open shutter, raised (up to 4×) when the
  // camera moves so fast that N discrete copies would show as steps instead of a smooth streak;
  // then only the contiguous run around filmT without a hard cut is kept (a cut never double-exposes).
  subframeTimes(filmT, open, N) {
    const make = (n) => Array.from({ length: n }, (_, i) => filmT + ((i + 0.5) / n - 0.5) * open);
    let times = make(N);
    if (N < 3) return times;
    let pose = this.subframePoses(times), steps = this.subframeSteps(pose);
    const maxPx = Math.max(0, ...steps.filter((st) => !st.cut).map((st) => st.px));
    const want = Math.min(N * 4, Math.ceil(N * maxPx / 2.5));   // ≤ ~2.5 px between copies
    if (want > N) { times = make(want); pose = this.subframePoses(times); steps = this.subframeSteps(pose); }
    let lo = Math.floor((times.length - 1) / 2), hi = lo;
    while (lo > 0 && !steps[lo - 1].cut) lo--;
    while (hi < times.length - 1 && !steps[hi].cut) hi++;
    return times.slice(lo, hi + 1);
  }

  // Everything up to (and including) bloom into this.comp; returns the grade parameters.
  composite(filmT, filmDt) {
    const T = filmT / TIME_SCALE, dt = filmDt / TIME_SCALE;
    const r = this.renderer;
    const segs = this.activeSegments(T);
    const tu = this.transQuad.material.uniforms;
    let a = segs[0], b = segs[1];
    const ex = this.explore?.active ? this.explore : null;
    if (ex) { a = ex.inst.segment; b = null; }   // exploring: one sequence, no transition
    const instA = this.instances.get(a.id);
    tu.tA.value = this.renderInstance(instA, T, dt, this.rtA, this.dofA);
    // harmony: 0..1 scale on the grade's 60-30-10 colour harmony (scenes lower it to show true spectral colour)
    let bloomStrength = (instA.bloom?.strength ?? 0.7) * (1 - 0.45 * (instA._wordsDuck ?? 0)), exposure = instA.exposure ?? 1, harmony = instA.harmony ?? 1;
    if (b) {
      const instB = this.instances.get(b.id);
      tu.tB.value = this.renderInstance(instB, T, dt, this.rtB, this.dofB);
      const p = (T - b.start) / (a.end - b.start);
      tu.uProgress.value = p;
      tu.uMode.value = TRANSITION_MODES[a.transition] ?? 0;
      tu.uSingle.value = 0;
      tu.uTriOn.value = 0;
      if (a.transition === 'letter' && this.headings) this.withMatte(instA.camera, () => this.words3d?.letterWindow(instA, tu));
      const s = p * p * (3 - 2 * p);
      bloomStrength = THREE.MathUtils.lerp(bloomStrength, (instB.bloom?.strength ?? 0.7) * (1 - 0.45 * (instB._wordsDuck ?? 0)), s);
      exposure = THREE.MathUtils.lerp(exposure, instB.exposure ?? 1, s);
      harmony = THREE.MathUtils.lerp(harmony, instB.harmony ?? 1, s);
    } else {
      tu.uSingle.value = 1;
    }
    tu.uTime.value = T;
    r.setRenderTarget(this.comp);
    this.transQuad.render(r);
    // a heading the camera zooms THROUGH sits over the composite (its counter frames the next shot)
    const clean = ex || this.clean;
    if (!ex && this.headings) this.withMatte(instA.camera, () => this.words3d?.renderPost(instA, r, instA.camera));
    // chapter headings and story cards sit above every sequence (before bloom, so they glow softly)
    if (!clean && this.titles?.update(T)) { r.clearDepth(); r.render(this.titles.scene, this.titles.camera); }

    this.bloom.strength = bloomStrength;
    this.bloom.render(r, null, this.comp, dt, false);
    return { T, exposure, harmony };
  }

  // Final grade of a linear HDR image to the canvas (and downscale when supersampling).
  grade(tex, { T, exposure, harmony }) {
    const r = this.renderer;
    const fu = this.finalQuad.material.uniforms;
    fu.tInput.value = tex;
    fu.uExposure.value = exposure;
    fu.uWarmth.value = warmthAt(T);
    fu.uHarmony.value = FinalShader.uniforms.uHarmony.value * Math.min(1, Math.max(0, harmony));
    fu.uTime.value = T;
    fu.uFade.value = Math.min(1, (DURATION - T) / 0.6);
    r.setRenderTarget(null);
    r.setClearColor(0x000000, 1);
    r.clear();
    this.finalQuad.render(r);
    this.lastT = T;
  }
}
