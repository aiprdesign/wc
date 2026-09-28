// Chapter words as extruded 3D lettering living inside each sequence's own scene:
// lit by its lights, reflecting its environment, casting shadows and taking its
// depth of field. Locked dead-centre in front of the camera with a slow dolly-in.
//
// Every word is a bespoke movie-title treatment (titles3d-early.js, titles3d-late.js):
// a letter finish that embodies the concept (facet material: face / bevel / sides),
// a gold companion graphic (the film's 10% accent) and a signature motion. The shared
// grammar lives here: letters come out of the centre (centre-first stagger), a ~2.4 s
// hold, a clean exit back into the centre, a light sweep with a real light spilling onto
// the scene, a gold plinth line, and a rack focus onto the word.
import * as THREE from 'three';
import { SEGMENTS, CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { letters3D } from '../lib/text.js';
import { ease, sat, lerp, ramp } from '../lib/math.js';
import { facetMaterial, sharedUniforms, hairline, GOLD, GOLD_HOT } from './titles3d-kit.js';
import { ORDER, LAW, BEAUTY, REASON, POWER } from './titles3d-early.js';
import { CONNECTION, LIFE, FLIGHT, INTELLIGENCE, KNOWLEDGE, DEFAULT, swapTreatment } from './titles3d-late.js';

// One defining word per chapter (Cinzel capitals — the film's display face).
const WORDS = {
  classical: 'ORDER', civic: 'LAW', renaissance: 'BEAUTY', science: 'REASON', industrial: 'POWER',
  electricity: 'CONNECTION', medicine: 'LIFE', flight: 'FLIGHT', computing: 'INTELLIGENCE', knowledge: 'KNOWLEDGE',
  // An entry may be an object to override the defaults: { text, t0, t1 (story s), pace (animation speed scale,
  // <1 = quicker), y (vertical offset, fraction of frame height), focus (false = leave the scene's DOF alone) }.
  // The Moon sequence cuts fast, so its word rises over the surface during the powered descent and lands with the LM.
  moonshot: { text: 'USA', t0: 39.95, t1: 40.86, pace: 0.6, y: 0.25, focus: false },
};
const SWAPS = [['mColumns', 'ORDER'], ['mGears', 'MOTION'], ['mOrbits', 'ORBITS'], ['mAtoms', 'ATOMS'], ['mCircuit', 'CIRCUITS'], ['mStars', 'STARS']];

// Bespoke treatment per word (anything else — e.g. a word added later — gets DEFAULT).
const TREATMENTS = { ORDER, LAW, BEAUTY, REASON, POWER, CONNECTION, LIFE, FLIGHT, INTELLIGENCE, KNOWLEDGE };

export class Words3D {
  constructor(engine) {
    this.engine = engine;
    this.items = [];
    const inst = (id) => engine.instances.get(id);
    for (const seg of SEGMENTS) {
      if (!WORDS[seg.id]) continue;
      const dur = seg.end - seg.start;
      const o = typeof WORDS[seg.id] === 'string' ? { text: WORDS[seg.id] } : WORDS[seg.id];
      const item = this.build(o.text, inst(seg.id), o.t0 ?? seg.start + 0.3, o.t1 ?? seg.start + Math.min(2.75, dur - 0.65));
      this.items.push(Object.assign(item, { pace: o.pace ?? 1, oy: o.y ?? 0, focus: o.focus ?? true }));
    }
    SWAPS.forEach(([cue, w], i) => {
      const t0 = CUES[cue], t1 = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
      this.items.push(this.build(w, inst('montage'), t0 - 0.05, t1 - 0.08, true));
    });
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._q = [new THREE.Quaternion(), new THREE.Quaternion()];
    this.prepare();
  }

  build(text, inst, t0, t1, swap = false) {
    const seg = inst.segment;
    const tr = swap ? swapTreatment(text) : (TREATMENTS[text] ?? DEFAULT);
    const key = swap ? `swap-${text}` : (TREATMENTS[text] ? text : 'default');
    const shared = sharedUniforms(tr.look);
    const glyphs = letters3D(text, { size: 1, depth: 0.32, bevel: 0.035, tracking: 0.1, ...tr.geo });
    const group = new THREE.Group();
    const n = glyphs.length, mid = (n - 1) / 2, maxD = Math.max(1, mid);
    let capH = 0;
    const letters = glyphs.map((g, i) => {
      g.geometry.computeBoundingBox();
      const h = g.geometry.boundingBox.max.y - g.geometry.boundingBox.min.y;
      capH = Math.max(capH, h);
      const pivot = new THREE.Group();                 // hinge on the baseline
      pivot.position.set(g.x, -h / 2, 0);
      const mat = facetMaterial(tr.look, this.engine.env, shared, key);
      mat.userData.u.uLetterX.value = g.x;
      const mesh = new THREE.Mesh(g.geometry, mat);
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      // c: 0 at the centre … 1 at the ends (drives the centre-out stagger)
      return { pivot, mesh, mat, u: mat.userData.u, i, x: g.x, h, baseY: -h / 2, c: Math.abs(i - mid) / maxD, d0: 0, opacity: 1 };
    });
    const base = -capH / 2, plinthY = base - (tr.plinthGap ?? 0.12);
    // gold plinth line under the word, shooting out of the centre
    const plinth = [];
    if (tr.plinth !== false) {
      const half = glyphs.width / 2 + 0.25;
      for (const sgn of [-1, 1]) {
        const p = hairline([new THREE.Vector3(0, plinthY, 0.2), new THREE.Vector3(sgn * half, plinthY, 0.2)], { color: GOLD, headColor: GOLD_HOT, intensity: 1.0, opacity: 0.8, head: 0.08 });
        group.add(p);
        plinth.push(p);
      }
    }
    // a real light that rides the sweep and spills onto the scene around the word
    // (swap words in the montage skip it — six extra lights in one scene would cost too much)
    const light = swap ? { intensity: 0, position: new THREE.Vector3() } : new THREE.PointLight('#ffd9a0', 0, 0, 2);
    light.position.set(0, 0, 0.9);
    if (!swap) group.add(light);
    group.visible = false;
    inst.scene.add(group);

    // Lock pose: the camera once the word is standing (scenes are pure functions of t).
    const tLock = Math.min(t1, t0 + (swap ? 0.25 : 0.8));
    const info = this.engine.info(tLock, seg, 0);
    try { inst.update(info.t, info); } catch { /* the scene reports its own errors */ }
    const cam = inst.camera;
    cam.updateMatrixWorld();
    // Distance: just in front of the sequence's subject (its focus distance), else a safe default.
    const focus = inst.dof?.focus > 0 ? inst.dof.focus : 6;
    const d = focus * (swap ? 0.55 : 0.62);
    const w = {
      text, inst, tr, group, letters, plinth, light, shared, env: this.engine.env,
      width: glyphs.width, half: glyphs.width / 2, capH, base, plinthY, t0, t1, swap, d, fx: {},
    };
    // per-frame timing state handed to the treatment (helpers are built once — no per-frame closures)
    const s = (w.s = { t: 0, T: 0, k: 1, n, fade: 0, exit: 0, inDur: 0.75, st: 0.07, outStart: t1, outDur: 0.45, span: t1 - t0 });
    s.u = (l, dur = s.inDur) => sat((s.t - l.d0) / dur);
    s.out = (l) => ease.inCubic(sat((s.T - s.outStart - (1 - l.c) * Math.min(0.2, s.st * s.n * 0.3)) / s.outDur));
    tr.build?.(w);
    return w;
  }

  // Compile every title's shaders up front so a word's first appearance never hitches.
  prepare() {
    const r = this.engine.renderer;
    for (const inst of new Set(this.items.map((it) => it.inst))) {
      const mine = this.items.filter((it) => it.inst === inst);
      mine.forEach((it) => (it.group.visible = true));
      try { r.compile(inst.scene, inst.camera); } catch { /* compiled lazily instead */ }
      mine.forEach((it) => (it.group.visible = false));
    }
  }

  // Called by the engine after a sequence's update and before it is rendered.
  apply(inst, T) {
    const [pos, camPos, fwd] = this._v, [quat, camQuat] = this._q;
    for (const it of this.items) {
      if (it.inst !== inst) continue;
      const pace = it.pace ?? 1;
      const on = T > it.t0 && T < it.t1 + (it.swap ? 0.12 : 0.5 * pace);
      it.group.visible = on;
      it.light.intensity = 0;
      if (!on) continue;
      const cam = inst.camera;
      cam.updateMatrixWorld();
      const t = T - it.t0, span = it.t1 - it.t0, drift = sat(t / Math.max(0.1, span));
      // frame size at the word's distance, using the lens actually rendered (open matte widens it)
      const matte = OUTPUT_ASPECT < FILM_ASPECT ? Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.85) : 1;
      // stay in front of the subject even when the sequence match-cuts to something closer
      // (size scales with distance, so the word looks identical on screen — only parallax changes)
      const focusNow = inst.dof?.focus > 0 && it.focus !== false ? inst.dof.focus : Infinity;
      const dist = Math.max(it.d * 0.35, Math.min(it.d, focusNow * (it.swap ? 0.55 : 0.62)));
      const H = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * matte;
      const visW = H * OUTPUT_ASPECT;
      // word spans ~64% (square) / ~46% (anamorphic) of the width; cap height ≤ 12% of the frame
      const k = Math.min((visW * (OUTPUT_ASPECT < 1.9 ? 0.64 : 0.46)) / it.width, (H * 0.12) / 0.7);
      cam.matrixWorld.decompose(camPos, camQuat, fwd);
      pos.copy(camPos);          // locked dead-centre in the frame
      quat.copy(camQuat);
      fwd.set(0, (it.oy ?? 0) * H, -dist * (1 - 0.07 * ease.inOutSine(drift))).applyQuaternion(quat);   // slow dolly-in
      it.group.position.copy(pos).add(fwd);
      it.group.quaternion.copy(quat);
      it.group.rotateY(lerp(0.09, -0.09, ease.inOutSine(drift)));   // gentle symmetric turn reveals the extrusion
      it.group.rotateX(-0.08);
      it.group.scale.setScalar(k);

      // timing state (pace < 1 = quicker, for words that must fit a fast-cut sequence)
      const s = it.s, tr = it.tr, n = it.letters.length;
      s.t = t; s.T = T; s.k = k; s.span = span;
      s.inDur = (tr.inDur ?? 0.75) * pace; s.st = (tr.st ?? 0.07) * pace;
      s.outStart = it.t1 - (it.swap ? 0.06 : 0.2) * pace;
      s.outDur = (it.swap ? 0.16 : 0.45) * pace;
      s.fade = sat(t / 0.1);
      s.exit = ramp(T, s.outStart - 0.05, s.outStart + s.outDur * 0.8, ease.inOutCubic);
      for (const l of it.letters) {
        l.d0 = l.c * s.st * n * 0.55;                 // the middle letters lead, the ends follow
        l.pivot.position.set(l.x, l.baseY, 0); l.pivot.rotation.set(0, 0, 0); l.pivot.scale.set(1, 1, 1);
        l.mesh.position.set(0, l.h / 2, 0); l.mesh.rotation.set(0, 0, 0); l.mesh.scale.set(1, 1, 1);
        l.u.uFlash.value = 0; l.u.uGlow.value = 0; l.u.uEdgeGlow.value = 0; l.u.uPattern.value = 0;
        l.opacity = 1;
      }
      it.shared.uClipY.value = -99;
      it.shared.uTime.value = T;
      // keep the lit surface under the bloom threshold whatever the scene's exposure does
      it.shared.uCap.value = (tr.look.cap ?? 0.78) / Math.max(1, inst.exposure ?? 1);
      // light sweep crosses the word once, after the letters stand; the real light rides it
      const sweepAt = tr.sweepAt ?? s.inDur + n * s.st * 0.6;
      const sweepP = ramp(t, sweepAt, sweepAt + (it.swap ? 0.4 : 1.1) * pace, ease.inOutSine);
      it.shared.uSweep.value = lerp(-it.half - 1.2, it.half + 1.2, sweepP);
      it.light.position.set(it.shared.uSweep.value, 0, 0.9);
      it.light.intensity = Math.sin(Math.PI * sweepP) * 1.3 * k * k * s.fade;
      // plinth shoots out from the centre with the letters, retracts into it as they leave
      const pp = Math.max(0.0001, ramp(t, 0.05, s.inDur + n * s.st * 0.8, ease.outExpo) * (1 - s.exit));
      for (const p of it.plinth) { p.progress = pp; p.opacity = 0.8 * s.fade; }

      tr.animate(it, s);                               // the bespoke treatment

      for (const l of it.letters) { l.mat.opacity = l.opacity; l.mesh.visible = l.opacity > 0.003; }
      it.group.updateMatrixWorld();
      it.shared.uWordInv.value.copy(it.group.matrixWorld).invert();
      // rack focus onto the lettering while it is up
      if (inst.dof && it.focus !== false) {
        const wgt = sat(t / 0.3) * (1 - sat((T - s.outStart) / 0.35));
        inst.dof.focus = lerp(inst.dof.focus, dist, wgt);
        inst.dof.range = lerp(inst.dof.range ?? 2, dist * 0.35, wgt);
        inst.dof.amount = Math.max(inst.dof.amount ?? 0, 0.35 * wgt);
      }
    }
  }
}
