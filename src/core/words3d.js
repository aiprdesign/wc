// Chapter words as extruded 3D lettering living inside each sequence's own scene:
// lit by its lights, reflecting its environment, casting shadows and taking its
// depth of field. Placed in front of the camera, world-locked with some camera
// follow so it parallaxes like a real object while staying in frame.
//
// Animation (per word): letters rise from lying flat into standing monuments with a
// small flash as each lands, a glowing plinth line draws beneath, a light sweep runs
// across the metal while a real light spills onto the surroundings, then the letters
// fall back like dominoes and clear.
import * as THREE from 'three';
import { SEGMENTS, CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { letters3D } from '../lib/text.js';
import { progressLine } from '../lib/lines.js';
import { ease, sat, lerp, ramp } from '../lib/math.js';

// One defining word per chapter (Cinzel capitals — the film's display face).
const WORDS = {
  classical: 'ORDER', civic: 'LAW', renaissance: 'BEAUTY', science: 'REASON', industrial: 'POWER',
  electricity: 'CONNECTION', medicine: 'LIFE', flight: 'FLIGHT',
  // entries may be objects with explicit story timing: { text, t0, t1, pace, y (fraction of frame height), focus }
  moonshot: { text: 'USA', t0: 39.95, t1: 40.86, pace: 0.6, y: 0.25, focus: false }, computing: 'INTELLIGENCE', knowledge: 'KNOWLEDGE',
  frontier: { text: 'FRONTIER', t0: 49.8, t1: 51.1 },   // clears before the genome shot
};

// Composition per chapter: alignment varies the rhythm of the film (left / centre / right);
// 'invert' flips contrast for bright plates — dark lacquered letters over a light halo.
export const LAYOUT = {
  classical: { align: 'left' }, civic: { align: 'center' }, renaissance: { align: 'right', invert: true },
  science: { align: 'left' }, industrial: { align: 'center' }, electricity: { align: 'right' },
  medicine: { align: 'center', invert: true }, flight: { align: 'left', invert: true }, moonshot: { align: 'center' },
  computing: { align: 'right' }, knowledge: { align: 'left', invert: true }, frontier: { align: 'center' },
  montage: { align: 'center' },
};
const SWAPS = [['mColumns', 'ORDER'], ['mGears', 'MOTION'], ['mOrbits', 'ORBITS'], ['mAtoms', 'ATOMS'], ['mCircuit', 'CIRCUITS'], ['mStars', 'STARS']];

// Material per era: satin gold → bronze → brushed steel → satin chrome.
const ERAS = [
  // 60-30-10: the words are the film's 10% accent — one signature gold, finish evolving by era
  [20, { color: '#c99a3e', roughness: 0.42, env: 0.55, light: '#ffcf8a' }],   // hand-worked gold
  [29, { color: '#c99a3e', roughness: 0.36, env: 0.55, light: '#ffc978' }],
  [39, { color: '#cfa244', roughness: 0.3, env: 0.5, light: '#ffd79a' }],
  [99, { color: '#d4a84a', roughness: 0.26, env: 0.45, light: '#ffe0b0' }],  // polished gold
];
const eraOf = (T) => ERAS.find(([t]) => T < t)[1];

function letterMaterial(era, env, shared, invert = false) {
  const m = new THREE.MeshStandardMaterial({
    // inverted: near-black lacquer with a satin sheen; the gold survives on the bevels via the sweep tint
    color: invert ? '#15120f' : era.color, metalness: invert ? 0.55 : 1, roughness: invert ? 0.3 : era.roughness,
    envMap: env, envMapIntensity: invert ? 0.35 : era.env,
    emissive: new THREE.Color(era.color).multiplyScalar(0.0), transparent: true, fog: false,
  });
  const u = { ...shared, uFlash: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uWordInv; varying vec3 vWordPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWordPos = (uWordInv * modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWordPos; uniform float uSweep, uSweepW, uFlash; uniform vec3 uTint;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // diagonal light sweep in the word's own space + a landing flash
        float band = exp(-pow((vWordPos.x + vWordPos.y * 0.35 - uSweep) / uSweepW, 2.0));
        totalEmissiveRadiance += uTint * (band * 0.28 + uFlash * 0.4);`)
      // soft highlight knee: letters stay crisp under the bloom threshold instead of hazing out
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { vec3 c = gl_FragColor.rgb; float m = max(c.r, max(c.g, c.b));
          if (m > 0.55) { float nm = 0.55 + (m - 0.55) / (1.0 + (m - 0.55) * 3.5); gl_FragColor.rgb = c * (nm / m); } }`);
  };
  m.customProgramCacheKey = () => 'word3d-v4';
  return m;
}

export class Words3D {
  constructor(engine) {
    this.engine = engine;
    this.items = [];
    const inst = (id) => engine.instances.get(id);
    for (const seg of SEGMENTS) {
      const w = WORDS[seg.id];
      if (!w) continue;
      const dur = seg.end - seg.start;
      const lay = LAYOUT[seg.id] ?? {};
      if (typeof w === 'string') { this.items.push(this.build(w, inst(seg.id), seg.start + 0.3, seg.start + Math.min(2.75, dur - 0.65), false, lay)); continue; }
      const item = this.build(w.text, inst(seg.id), w.t0, w.t1, false, lay);
      Object.assign(item, { pace: w.pace ?? 1, yOff: w.y ?? 0, noFocus: w.focus === false });
      this.items.push(item);
    }
    SWAPS.forEach(([cue, w], i) => {
      const t0 = CUES[cue], t1 = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
      this.items.push(this.build(w, inst('montage'), t0 - 0.05, t1 - 0.08, true, LAYOUT.montage));
    });
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._q = [new THREE.Quaternion(), new THREE.Quaternion()];
  }

  build(text, inst, t0, t1, swap = false, lay = {}) {
    const invert = !!lay.invert, align = lay.align ?? 'center';
    const seg = inst.segment;
    const era = eraOf(t0);
    const shared = {
      uSweep: { value: -99 }, uSweepW: { value: 0.45 }, uWordInv: { value: new THREE.Matrix4() },
      uTint: { value: new THREE.Color(era.color).lerp(new THREE.Color('#ffffff'), 0.55) },
    };
    const glyphs = letters3D(text, { size: 1, depth: 0.32, bevel: 0.035, tracking: 0.1 });
    const group = new THREE.Group();
    let capH = 0;
    const letters = glyphs.map((g, i) => {
      g.geometry.computeBoundingBox();
      const h = g.geometry.boundingBox.max.y - g.geometry.boundingBox.min.y;
      capH = Math.max(capH, h);
      const pivot = new THREE.Group();                 // hinge on the baseline
      pivot.position.set(g.x, -h / 2, 0);
      const mat = letterMaterial(era, this.engine.env, shared, invert);
      const mesh = new THREE.Mesh(g.geometry, mat);
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return { pivot, mesh, mat, i, x: g.x };
    });
    // glowing plinth line under the word
    const half = glyphs.width / 2 + 0.25;
    const plinthL = progressLine([new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(-half, 0, 0.2)], { color: era.light, intensity: 1.2, head: 0.08 });
    const plinthR = progressLine([new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(half, 0, 0.2)], { color: era.light, intensity: 1.2, head: 0.08 });
    plinthL.position.y = plinthR.position.y = -capH / 2 - 0.12;
    group.add(plinthL, plinthR);
    const plinth = [plinthL, plinthR];
    // contrast backing: a soft, near-opaque dark glow behind gold letters (bright scene plates
    // are HDR, so only a nearly solid core keeps the word legible) — or a warm light halo behind
    // inverted dark letters
    const back = new THREE.Mesh(new THREE.PlaneGeometry(glyphs.width + 2.2, capH * 3.2), new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 }, uCol: { value: new THREE.Color(invert ? '#f3ead9' : '#000000') }, uA: { value: invert ? 0.9 : 0.93 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uO, uA; uniform vec3 uCol; varying vec2 vUv;
        void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d * vec2(1.0, 1.0)); float e = pow(max(abs(d.x), 0.0), 6.0);
          float a = smoothstep(1.0, 0.35, r + e * 0.4); gl_FragColor = vec4(uCol, a * uA * uO); }`,
      transparent: true, depthWrite: false, fog: false,
    }));
    back.position.z = -0.45;
    back.renderOrder = -1;
    group.add(back);
    // a real light that rides the sweep and spills onto the scene around the word
    // (swap words in the montage skip it — six extra lights in one scene would cost too much)
    const light = swap ? { intensity: 0, position: new THREE.Vector3() } : new THREE.PointLight(era.light, 0, 0, 2);
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
    const lockPos = new THREE.Vector3(), lockQuat = new THREE.Quaternion();
    cam.matrixWorld.decompose(lockPos, lockQuat, new THREE.Vector3());
    return { text, inst, group, letters, plinth, light, shared, back, invert, align, width: glyphs.width, t0, t1, swap, d, lockPos, lockQuat };
  }

  // Called by the engine after a sequence's update and before it is rendered.
  apply(inst, T) {
    const [pos, camPos, fwd] = this._v, [quat, camQuat] = this._q;
    for (const it of this.items) {
      if (it.inst !== inst) continue;
      const on = T > it.t0 && T < it.t1 + (it.swap ? 0.12 : 0.5);
      it.group.visible = on;
      it.light.intensity = 0;
      if (!on) continue;
      const cam = inst.camera;
      cam.updateMatrixWorld();
      const t = T - it.t0, span = it.t1 - it.t0, drift = sat(t / Math.max(0.1, span));
      // size: the word spans ~62% of the visible width (square) / ~48% (anamorphic); capped in height
      // frame size at the word's distance, using the lens actually rendered (open matte widens it)
      const matte = OUTPUT_ASPECT < FILM_ASPECT ? Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.85) : 1;
      const H = 2 * it.d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * matte;
      const visW = H * OUTPUT_ASPECT;
      // word spans ~64% (square) / ~46% (anamorphic) of the width; cap height ≤ 12% of the frame
      const side = it.align !== 'center';
      const k = Math.min((visW * (OUTPUT_ASPECT < 1.9 ? (side ? 0.56 : 0.64) : (side ? 0.4 : 0.46))) / it.width, (H * 0.12) / 0.7);
      // alignment: left/right words sit against a margin of the frame
      const margin = visW * 0.08, wordW = it.width * k;
      const ax = it.align === 'left' ? -visW / 2 + margin + wordW / 2 : it.align === 'right' ? visW / 2 - margin - wordW / 2 : 0;
      // place: world-locked at the lock pose, blended 65% towards the live camera so it stays framed
      cam.matrixWorld.decompose(camPos, camQuat, fwd);
      pos.copy(camPos);          // locked dead-centre in the frame
      quat.copy(camQuat);
      fwd.set(ax, (it.yOff ?? 0) * H, -it.d * (1 - 0.07 * ease.inOutSine(drift))).applyQuaternion(quat);   // slow dolly-in
      it.group.position.copy(pos).add(fwd);
      it.group.quaternion.copy(quat);
      const turn = it.align === 'left' ? -0.12 : it.align === 'right' ? 0.12 : 0;   // side words angle toward the centre
      it.group.rotateY(turn + lerp(0.07, -0.07, ease.inOutSine(drift)));   // gentle turn reveals the extrusion
      it.group.rotateX(-0.08);
      it.group.scale.setScalar(k);
      it.group.updateMatrixWorld();
      it.shared.uWordInv.value.copy(it.group.matrixWorld).invert();

      const n = it.letters.length;
      const pace = it.pace ?? 1;
      const inDur = (it.swap ? 0.32 : 0.75) * pace, st = (it.swap ? 0.022 : 0.07) * pace;
      const outStart = it.t1 - (it.swap ? 0.06 : 0.2);
      const outDur = it.swap ? 0.16 : 0.45;
      const fade = sat(t / 0.1);
      // stagger by distance from the centre: the middle letters lead, the ends follow
      // stagger from the anchor: centred words grow from the middle, side words from their margin
      const mid = (n - 1) / 2, maxD = Math.max(1, mid);
      const anchorX = it.align === 'left' ? -it.width / 2 : it.align === 'right' ? it.width / 2 : 0;
      it.letters.forEach((l) => {
        const c = it.align === 'left' ? l.i / Math.max(1, n - 1) : it.align === 'right' ? (n - 1 - l.i) / Math.max(1, n - 1) : Math.abs(l.i - mid) / maxD;
        const d0 = c * st * n * 0.55;
        const u = sat((t - d0) / inDur);
        const kin = ease.outBack(u), kc = ease.outCubic(u);
        const kout = ease.inCubic(sat((T - outStart - (1 - c) * st * n * 0.3) / outDur));
        // ENTRANCE: every letter emerges from the centre point, spreading outward to its place
        //           while hinging up from lying flat; EXIT: they fold back into the centre
        l.pivot.position.x = anchorX + (l.x - anchorX) * kc * (1 - kout * 0.85);
        l.pivot.position.z = (1 - kc) * 0.35;
        l.pivot.rotation.x = (1 - kin) * -Math.PI / 2 + kout * -0.5;
        l.mesh.position.y = (l.mesh.userData.h ?? (l.mesh.userData.h = l.mesh.position.y));
        l.mesh.scale.setScalar((0.8 + 0.2 * kc) * (1 - kout * 0.4));
        // landing flash as each letter reaches its place
        const land = t - d0 - inDur * 0.62;
        l.mat.userData.u.uFlash.value = land > 0 ? Math.exp(-land * 9) * 0.9 : 0;
        l.mat.opacity = fade * sat(u * 3) * (1 - kout);
      });
      // light sweep crosses the word once, after the letters stand
      const sweepP = ramp(t, inDur + n * st * 0.6, inDur + n * st * 0.6 + (it.swap ? 0.4 : 1.1), ease.inOutSine);
      it.shared.uSweep.value = lerp(-it.width / 2 - 1.2, it.width / 2 + 1.2, sweepP);
      it.light.position.x = it.shared.uSweep.value;
      it.light.intensity = Math.sin(Math.PI * sweepP) * 1.1 * k * k * fade;
      // plinth shoots out from the centre with the letters, retracts into it as they leave
      const pp = Math.max(0.0001, ramp(t, 0.05, inDur + n * st * 0.8, ease.outExpo) * (1 - ramp(T, outStart - 0.05, outStart + outDur * 0.8, ease.inOutCubic)));
      it.plinth.forEach((p) => { p.progress = pp; p.opacity = 0.8 * fade; });
      // contrast backing breathes in with the letters and out with them
      it.back.material.uniforms.uO.value = ramp(t, 0, 0.35) * (1 - ramp(T, outStart, outStart + outDur + 0.1));
      // rack focus onto the lettering while it is up
      if (inst.dof && !it.noFocus) {
        const w = sat(t / 0.3) * (1 - sat((T - outStart) / 0.35));
        inst.dof.focus = lerp(inst.dof.focus, it.d, w);
        inst.dof.range = lerp(inst.dof.range ?? 2, it.d * 0.35, w);
        inst.dof.amount = Math.max(inst.dof.amount ?? 0, 0.35 * w);
      }
    }
  }
}
