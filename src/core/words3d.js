// Chapter words as extruded 3D lettering living inside each sequence's own scene:
// lit by its lights and environment, casting shadows, softened by its fog-free
// depth of field. Placed in front of the camera, world-locked with a little
// camera-follow so it parallaxes like a real object while staying in frame.
import * as THREE from 'three';
import { SEGMENTS, CUES, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { letters3D } from '../lib/text.js';
import { ease, sat, lerp, ramp } from '../lib/math.js';

// One defining word per chapter (Cinzel capitals — the film's display face).
const WORDS = {
  classical: 'ORDER', civic: 'LAW', renaissance: 'BEAUTY', science: 'REASON', industrial: 'POWER',
  electricity: 'CONNECTION', medicine: 'LIFE', flight: 'FLIGHT', computing: 'INTELLIGENCE', knowledge: 'KNOWLEDGE',
};
const SWAPS = [['mColumns', 'ORDER'], ['mGears', 'MOTION'], ['mOrbits', 'ORBITS'], ['mAtoms', 'ATOMS'], ['mCircuit', 'CIRCUITS'], ['mStars', 'STARS']];

// Material per era: gold → bronze → steel → chrome.
function eraMaterial(T, env) {
  const specs = [
    [20, { color: '#d9b25e', roughness: 0.4, env: 0.7 }],   // satin gold
    [29, { color: '#a8764a', roughness: 0.42, env: 0.7 }],  // bronze
    [39, { color: '#aab2bb', roughness: 0.38, env: 0.55 }], // brushed steel
    [99, { color: '#b9c3ce', roughness: 0.32, env: 0.45 }], // satin chrome
  ];
  const s = specs.find(([t]) => T < t)[1];
  return new THREE.MeshStandardMaterial({
    color: s.color, metalness: 1, roughness: s.roughness, envMap: env, envMapIntensity: s.env,
    emissive: new THREE.Color(s.color).multiplyScalar(0.02), transparent: true, fog: false,
  });
}

export class Words3D {
  constructor(engine) {
    this.engine = engine;
    this.items = [];
    const inst = (id) => engine.instances.get(id);
    for (const seg of SEGMENTS) {
      if (!WORDS[seg.id]) continue;
      const dur = seg.end - seg.start;
      this.items.push(this.build(WORDS[seg.id], inst(seg.id), seg.start + 0.3, seg.start + Math.min(2.7, dur - 0.7)));
    }
    SWAPS.forEach(([cue, w], i) => {
      const t0 = CUES[cue], t1 = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
      this.items.push(this.build(w, inst('montage'), t0 - 0.05, t1 - 0.08, true));
    });
  }

  build(text, inst, t0, t1, swap = false) {
    const seg = inst.segment;
    const mat = eraMaterial(t0, this.engine.env);
    const glyphs = letters3D(text, { size: 1, depth: 0.32, bevel: 0.035, tracking: 0.1 });
    const group = new THREE.Group();
    const letters = glyphs.map((g, i) => {
      g.geometry.computeBoundingBox();
      const h = g.geometry.boundingBox.max.y - g.geometry.boundingBox.min.y;
      const pivot = new THREE.Group();                 // hinge at the letter's baseline
      pivot.position.set(g.x, -h / 2, 0);
      const mesh = new THREE.Mesh(g.geometry, mat);
      mesh.position.y = h / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      group.add(pivot);
      return { pivot, i };
    });
    group.visible = false;
    group.renderOrder = 5;
    inst.scene.add(group);

    // Lock pose: the camera at the moment the word is fully standing (scenes are pure functions of t).
    const tLock = Math.min(t1, t0 + (swap ? 0.25 : 0.7));
    const info = this.engine.info(tLock, seg, 0);
    try { inst.update(info.t, info); } catch { /* the scene warns itself */ }
    const cam = inst.camera;
    cam.updateMatrixWorld();
    // Distance: just in front of the sequence's subject (its focus distance), else a safe default.
    const focus = inst.dof?.focus > 0 ? inst.dof.focus : 6;
    const d = focus * (swap ? 0.55 : 0.62);
    const lockPos = new THREE.Vector3(), lockQuat = new THREE.Quaternion();
    cam.matrixWorld.decompose(lockPos, lockQuat, new THREE.Vector3());
    return { text, inst, group, letters, width: glyphs.width, t0, t1, swap, d, lockPos, lockQuat, fov: cam.fov, mat };
  }

  // Called by the engine after a sequence's update and before it is rendered.
  apply(inst, T) {
    for (const it of this.items) {
      if (it.inst !== inst) continue;
      const on = T > it.t0 && T < it.t1 + (it.swap ? 0.06 : 0.45);
      it.group.visible = on;
      if (!on) continue;
      const cam = inst.camera;
      cam.updateMatrixWorld();
      // size: the word spans ~62% of the visible width (square) / ~48% (anamorphic)
      const H = 2 * it.d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      const visW = H * FILM_ASPECT * (OUTPUT_ASPECT < FILM_ASPECT ? Math.pow(FILM_ASPECT / OUTPUT_ASPECT, 0.85) * OUTPUT_ASPECT / FILM_ASPECT : 1);
      const k = Math.min((visW * (OUTPUT_ASPECT < 1.9 ? 0.62 : 0.48)) / it.width, H * 0.14);
      // place: world-locked at the lock pose, blended 65% towards the live camera so it stays framed
      const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
      const camPos = new THREE.Vector3(), camQuat = new THREE.Quaternion();
      cam.matrixWorld.decompose(camPos, camQuat, new THREE.Vector3());
      pos.copy(it.lockPos).lerp(camPos, 0.65);
      quat.copy(it.lockQuat).slerp(camQuat, 0.65);
      const t = T - it.t0, span = it.t1 - it.t0;
      const drift = sat(t / Math.max(0.1, span));
      const fwd = new THREE.Vector3(0, 0.02 * H, -it.d * (1 - 0.06 * drift)).applyQuaternion(quat);
      it.group.position.copy(pos).add(fwd);
      it.group.quaternion.copy(quat);
      it.group.rotateY(lerp(0.1, -0.06, drift));     // a slow three-quarter turn reveals the extrusion
      it.group.rotateX(-0.08);
      it.group.scale.setScalar(k);
      // letters rise from lying flat into standing monuments, then tip forward and go
      const n = it.letters.length, inDur = it.swap ? 0.28 : 0.6, st = it.swap ? 0.02 : 0.06;
      const outStart = it.t1 - (it.swap ? 0.05 : 0.2);
      it.letters.forEach((l) => {
        const kin = ease.outBack(sat((t - l.i * st) / inDur));
        const kout = ease.inCubic(sat((T - outStart - (n - 1 - l.i) * st * 0.4) / (it.swap ? 0.14 : 0.3)));
        l.pivot.rotation.x = (1 - Math.min(1, kin)) * -Math.PI / 2 + kout * -Math.PI / 2.2;
        l.pivot.position.z = (1 - sat(kin)) * 0.4;
      });
      it.mat.opacity = sat(t / 0.12) * (1 - (it.swap ? ramp(T, outStart, it.t1 + 0.05) : ramp(T, outStart + 0.15, it.t1 + 0.4)));
      // rack focus onto the lettering while it is up
      if (inst.dof) {
        const w = sat(t / 0.3) * (1 - sat((T - outStart) / 0.3));
        inst.dof.focus = lerp(inst.dof.focus, it.d, w);
        inst.dof.range = lerp(inst.dof.range ?? 2, it.d * 0.35, w);
        inst.dof.amount = Math.max(inst.dof.amount ?? 0, 0.35 * w);
      }
    }
  }
}
