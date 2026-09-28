// Film engine: owns the renderer, instantiates every sequence up front, and
// renders any global time T deterministically:
//   sequence(s) → HDR render targets → depth of field → transition composite
//   → bloom → final grade.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SEGMENTS, DURATION, TIME_SCALE, FILM_ASPECT, OUTPUT_ASPECT, warmthAt } from '../timeline.js';
import { DofShader, TransitionShader, FinalShader, TRANSITION_MODES } from './post.js';
import { getFont3D } from '../lib/text.js';
import { TitleLayer } from './titles.js';
import { Words3D } from './words3d.js';
import { PALETTE } from '../lib/palette.js';

const shaderMat = (def) => new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.clone(def.uniforms), vertexShader: def.vertexShader, fragmentShader: def.fragmentShader,
  depthTest: false, depthWrite: false,
});

export class Engine {
  constructor(canvas, { maxWidth = 1920, pixelRatio = Math.min(window.devicePixelRatio || 1, 2) } = {}) {
    this.canvas = canvas;
    this.maxWidth = maxWidth;
    this.pixelRatio = pixelRatio;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.NoToneMapping;       // tone mapping happens in the final grade
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.instances = new Map();
    this.width = 2; this.height = 1;
    this.lastT = 0;
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
        for (const u of [0, dur * 0.5, dur]) inst.update(u, this.info(seg.start + u, seg, 0));
        await r.compileAsync(inst.scene, inst.camera);
        if (inst.hud) await r.compileAsync(inst.hud.scene, inst.hud.camera);
      } catch (e) { console.warn('warm-up failed for', seg.id, e); }
      onProgress(++i / SEGMENTS.length, seg);
    }
    // 3D chapter words live inside each sequence's scene (built after every scene exists)
    this.words3d = new Words3D(this);
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
    const next = steps.find((s) => s < this.width);
    if (!next) return false;
    this.maxWidth = next;
    this.resize();
    console.info(`[engine] render width lowered to ${this.width}px to keep playback smooth`);
    return true;
  }

  setSize(w, h) {
    if (w === this.width && h === this.height && this.rtA) return;
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const mkRT = (depth, samples) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, colorSpace: THREE.LinearSRGBColorSpace });
      if (depth) { rt.depthTexture = new THREE.DepthTexture(w, h); rt.depthTexture.type = THREE.UnsignedIntType; }
      return rt;
    };
    [this.rtA, this.rtB, this.dofA, this.dofB, this.comp].forEach((rt) => rt?.dispose());
    this.rtA = mkRT(true, 4); this.rtB = mkRT(true, 4);
    this.dofA = mkRT(false, 0); this.dofB = mkRT(false, 0); this.comp = mkRT(false, 0);

    if (!this.dofQuad) {
      this.dofQuad = new FullScreenQuad(shaderMat(DofShader));
      this.transQuad = new FullScreenQuad(shaderMat(TransitionShader));
      this.finalQuad = new FullScreenQuad(shaderMat(FinalShader));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.55, 0.82);
    }
    this.bloom.setSize(w, h);
    this.dofQuad.material.uniforms.uResolution.value = new THREE.Vector2(w, h);
    this.finalQuad.material.uniforms.uResolution.value = new THREE.Vector2(w, h);
    this.finalQuad.material.uniforms.uAspect.value = OUTPUT_ASPECT;
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
    try {
      inst.update(info.t, info);
    } catch (e) {
      // A faulty sequence must never stop the film: log once, keep rendering its last pose.
      if (!inst._warned) { console.error(`[${inst.segment.id}] update failed at T=${T.toFixed(2)}`, e); inst._warned = true; }
    }
    // explore mode: the viewer's rig drives this sequence's camera; headings step aside
    const ex = this.explore?.active && this.explore.inst === inst ? this.explore : null;
    if (ex) { this.words3d?.hideAll(inst); inst._wordsDuck = 0; ex.apply(inst.camera); } else this.words3d?.apply(inst, T);
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
    const drawHUD = (target) => { if (inst.hud && !ex) { r.setRenderTarget(target); r.clearDepth(); r.render(inst.hud.scene, inst.hud.camera); } };
    // chapter headings: a 3D overlay drawn over the finished (depth-of-field) plate with the same
    // lens, so they never intersect scene geometry and are never blurred by the scene's focus
    const drawWords = (target) => { if (ex) return; r.setRenderTarget(target); r.clearDepth(); this.words3d?.renderOverlay(inst, r, cam); };
    let out = rt;
    if (dof && dof.amount > 0.01 && !ex) {
      const u = this.dofQuad.material.uniforms;
      u.tColor.value = rt.texture; u.tDepth.value = rt.depthTexture;
      u.uNear.value = inst.camera.near; u.uFar.value = inst.camera.far;
      u.uFocus.value = dof.focus; u.uRange.value = dof.range ?? 2; u.uMaxBlur.value = dof.amount * (this.width / FILM_ASPECT / 800) * 14;
      r.setRenderTarget(dofRT);
      this.dofQuad.render(r);
      out = dofRT;
    }
    drawWords(out);
    if (matte) { cam.fov = fov0; cam.aspect = FILM_ASPECT; cam.updateProjectionMatrix(); }
    drawHUD(out);
    return out.texture;
  }

  // T is film time (seconds of the delivered film); everything inside runs on story time.
  render(filmT, filmDt = 1 / 60) {
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
      if (a.transition === 'letter') this.withMatte(instA.camera, () => this.words3d?.letterWindow(instA, tu));
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
    if (!ex) this.withMatte(instA.camera, () => this.words3d?.renderPost(instA, r, instA.camera));
    // chapter headings and story cards sit above every sequence (before bloom, so they glow softly)
    if (!ex && this.titles?.update(T)) { r.clearDepth(); r.render(this.titles.scene, this.titles.camera); }

    this.bloom.strength = bloomStrength;
    this.bloom.render(r, null, this.comp, dt, false);

    const fu = this.finalQuad.material.uniforms;
    fu.tInput.value = this.comp.texture;
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
