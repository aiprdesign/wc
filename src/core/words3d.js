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
import { addSurfaceDetail } from '../lib/surface.js';
import { SEGMENTS, CUES, FILM_ASPECT, OUTPUT_ASPECT, BEAT } from '../timeline.js';
import { pulse } from '../lib/rhythm.js';
import { WORDS, SWAPS, onBeat, nextBeat, kickTiming } from '../lib/headings.js';
import { letters3D, getFont3D } from '../lib/text.js';
import { progressLine } from '../lib/lines.js';
import { glowSprite } from '../lib/materials.js';
import { MorphParticles, sampleGeometry } from '../lib/particles.js';
import { rng } from '../lib/math.js';
import { ease, sat, lerp, ramp } from '../lib/math.js';

// The words and their kick-in timing live in lib/headings.js (the score reads them too).

// Composition per chapter: alignment varies the rhythm of the film (left / centre / right);
// 'invert' flips contrast for bright plates — dark lacquered letters over a light halo.
export const LAYOUT = {};   // every heading is centred and gold (user direction); kept as a hook for per-chapter layout

// Heading material (kept as a per-era table so a later era could vary the finish).
const ERAS = [
  // 60-30-10: the words are the film's 10% accent — one signature gold
  // every heading is cast in the same gold as the opening title's 3D letters (opening.js goldMat): a warm
  // #e9b964 metal, satin roughness, hammered micro-surface (lib/surface.js) and a low inner glow — gold bars
  [99, { color: '#e9b964', roughness: 0.38, env: 0.55, light: '#ffcf8a', glow: '#ffb85a', glowI: 0.22 }],
];
const eraOf = (T) => ERAS.find(([t]) => T < t)[1];

function letterMaterial(era, env, shared, invert = false) {
  const m = new THREE.MeshStandardMaterial({
    // inverted: near-black lacquer with a satin sheen; the gold survives on the bevels via the sweep tint
    color: invert ? '#15120f' : era.color, metalness: invert ? 0.55 : 1, roughness: invert ? 0.3 : era.roughness,
    envMap: env, envMapIntensity: invert ? 0.35 : era.env,
    emissive: new THREE.Color(invert ? '#000000' : era.glow), emissiveIntensity: invert ? 0 : era.glowI, transparent: true, fog: false,
  });
  const u = { ...shared, uFlash: { value: 0 }, uLShine: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uWordInv; varying vec3 vWordPos;')
      .replace('#include <common>', '#include <common>\nvarying vec3 vWordN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWordPos = (uWordInv * modelMatrix * vec4(transformed, 1.0)).xyz;\nvWordN = normalize(mat3(uWordInv * modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWordN;\nvarying vec3 vWordPos; uniform float uSweep, uSweepW, uFlash, uShine, uLShine; uniform vec3 uTint;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        // gold-bar finish in the word's own space: brushed faces (fine horizontal streaks), mirror-polished
        // bevels that catch every highlight, and slightly darker, rougher cast sides
        { float nz = abs(normalize(vWordN).z);
          float face = smoothstep(0.93, 0.99, nz), side = 1.0 - smoothstep(0.15, 0.45, nz), bev = 1.0 - face - side;
          float brush = fract(sin(floor(vWordPos.y * 900.0) * 91.7) * 4375.85) * 0.5 + 0.5 * fract(sin(floor(vWordPos.y * 260.0 + vWordPos.x * 3.0) * 13.1) * 917.3);
          roughnessFactor = clamp(face * (0.26 + 0.14 * brush) + max(bev, 0.0) * 0.1 + side * 0.62, 0.05, 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float nz = abs(normalize(vWordN).z); diffuseColor.rgb *= mix(0.32, 1.0, smoothstep(0.2, 0.7, nz)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= mix(0.35, 1.0, smoothstep(0.2, 0.7, abs(normalize(vWordN).z)));
        // diagonal light sweep in the word's own space + a landing flash
        float band = exp(-pow((vWordPos.x + vWordPos.y * 0.35 - uSweep) / uSweepW, 2.0));
        totalEmissiveRadiance += uTint * (band * 0.14 + uFlash * 0.25);`)
      // soft highlight knee: letters stay crisp under the bloom threshold instead of hazing out
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        { vec3 c = gl_FragColor.rgb; float m = max(c.r, max(c.g, c.b));
          if (m > 0.55) { float nm = 0.55 + (m - 0.55) / (1.0 + (m - 0.55) * 3.5); gl_FragColor.rgb = c * (nm / m); } }
        // first-show shine: a bright specular band that is allowed past the knee, so it sparkles once
        gl_FragColor.rgb += uTint * band * uShine * 0.24;
        // per-letter shine: the letter flares white-hot as the shine front passes over it (like the closing
        // line's typing edge), well past the knee so it blooms, then settles back to its gold
        gl_FragColor.rgb += mix(uTint, vec3(1.0, 0.97, 0.92), 0.6) * uLShine * (1.0 + 0.15 * fract(sin(dot(vWordPos.xy, vec2(12.9898, 78.233))) * 43758.5453));`);
  };
  m.customProgramCacheKey = () => 'word3d-v12';
  // the same hammered / polished micro-surface the opening's gold letters get (chains the hook above)
  if (!invert) addSurfaceDetail(m);
  return m;
}

export class Words3D {
  constructor(engine) {
    this.engine = engine;
    this.items = [];
    const inst = (id) => engine.instances.get(id);
    for (const seg of SEGMENTS) {
      const dur = seg.end - seg.start;
      const lay = LAYOUT[seg.id] ?? {};
      // a chapter may carry several headings (e.g. INTELLIGENCE, then AI over the branches)
      for (const w of [WORDS[seg.id] ?? []].flat()) {
        // short and snappy: form quickly, hold a beat, clear — the scene behind is the story
        if (typeof w === 'string') { const it = this.build(w, inst(seg.id), seg.start + 0.3, seg.start + Math.min(1.95, dur - 0.65), false, lay); it.pace = 0.8; this.items.push(it); continue; }
        const item = this.build(w.text, inst(seg.id), w.t0, w.t1, false, lay);
        Object.assign(item, { pace: w.pace ?? 1, yOff: w.y ?? 0, noFocus: w.focus === false });
        this.items.push(item);
      }
    }
    SWAPS.forEach(([cue, w], i) => {
      const t0 = CUES[cue], t1 = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
      const it = this.build(w, inst('montage'), t0 - 0.05, t1 - 0.08, true, LAYOUT.montage);
      // the last word (STARS) never leaves: the camera zooms into its A, whose counter is the
      // window onto the Earth shot (transition 'letter' at the montage → finale hand-over)
      if (!SWAPS[i + 1]) this.makeZoom(it, 'A');
      this.items.push(it);
    });
    this._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this._k = new THREE.Vector3();
    this._q = [new THREE.Quaternion(), new THREE.Quaternion()];
  }

  // Headings live in an overlay layer per sequence: drawn over the scene (never intersecting or
  // hidden by its geometry), with their own camera-relative key light and the studio environment.
  overlayFor(inst) {
    if (inst._wordsOverlay) return inst._wordsOverlay;
    const scene = new THREE.Scene();
    scene.environment = this.engine.env;
    scene.environmentIntensity = 1;
    const key = new THREE.DirectionalLight('#fff0d8', 2.4);
    const fill = new THREE.HemisphereLight('#dfe6f0', '#2a2018', 0.5);
    scene.add(key, key.target, fill);
    inst._wordsOverlay = { scene, key };
    return inst._wordsOverlay;
  }

  // Engine hook: draw this sequence's headings over what was just rendered (same camera/lens).
  renderOverlay(inst, renderer, camera) {
    const o = inst._wordsOverlay;
    if (!o || !this.items.some((it) => it.inst === inst && it.group.visible && !it.zoom)) return;
    const post = this.items.filter((it) => it.inst === inst && it.zoom && it.group.visible);
    post.forEach((it) => (it.group.visible = false));
    renderer.render(o.scene, camera);
    post.forEach((it) => (it.group.visible = true));
  }

  // The zoom-through word is drawn over the COMPOSITE (after the transition), so its letter
  // strokes frame the next shot showing through the counter. Engine calls this with the lens set.
  renderPost(inst, renderer, camera) {
    const o = inst._wordsOverlay;
    const post = this.items.filter((it) => it.inst === inst && it.zoom && it.group.visible);
    if (!o || !post.length) return;
    const others = this.items.filter((it) => it.inst === inst && !it.zoom && it.group.visible);
    others.forEach((it) => (it.group.visible = false));
    renderer.clearDepth();
    renderer.render(o.scene, camera);
    others.forEach((it) => (it.group.visible = true));
  }

  // Explore mode: this sequence's headings are hidden.
  hideAll(inst) { this.baseDof(inst); for (const it of this.items) if (it.inst === inst) { it.group.visible = false; it.light.intensity = 0; } }

  // The rack focus onto a heading is layered on the scene's own depth of field for one frame only.
  // Many scenes never set some of dof.focus / range / amount in update() (civic: "never blurs"), so
  // a rack written into them would stick: after the heading, and when any earlier moment was
  // rendered again (scrubbing back; the video export), the plate came out blurred. Each field still
  // holding what the rack wrote last time (the scene didn't touch it) goes back to the scene's value.
  baseDof(inst) {
    const d = inst.dof;
    if (!d) return;
    const w = inst._dofRack, b = inst._dofScene ??= {};
    for (const k of ['focus', 'range', 'amount']) {
      if (w && d[k] === w[k]) d[k] = b[k];
      b[k] = d[k];
    }
    inst._dofRack = null;
  }

  // Engine hook during a 'letter' transition: the counter triangle in uv (lens already set).
  letterWindow(inst, uniforms) {
    const it = this.items.find((x) => x.inst === inst && x.zoom && x.group.visible);
    if (!it) return false;
    const cam = inst.camera;
    cam.updateMatrixWorld();
    it.group.updateMatrixWorld(true);
    const v = this._k;
    for (let i = 0; i < 3; i++) {
      v.copy(it.zoom.tri[i]).applyMatrix4(it.group.matrixWorld).project(cam);
      uniforms.uTri.value[i].set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
    }
    uniforms.uTriOn.value = 1;
    return true;
  }

  // Zoom-through set-up: the letter's counter (the hole in its outline) as a triangle in the
  // word's local space, slightly enlarged so its edges tuck under the strokes.
  makeZoom(it, ch) {
    const L = it.letters.find((l) => l.mesh.userData.char === ch) ?? it.letters[it.text.indexOf(ch)];
    const shapes = getFont3D().generateShapes(ch, 1);
    const outer = shapes[0].getPoints(24), hole = shapes[0].holes[0]?.getPoints(24) ?? [];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of outer) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;      // textGeometry3D centres each glyph on its bounds
    let apex = hole[0], lo = Infinity;
    for (const p of hole) { if (p.y > apex.y) apex = p; lo = Math.min(lo, p.y); }
    const base = hole.filter((p) => p.y < lo + 0.02);
    const bl = base.reduce((a, p) => (p.x < a.x ? p : a)), br = base.reduce((a, p) => (p.x > a.x ? p : a));
    const zF = 0.32 / 2 + 0.035;                      // front face (extrusion is centred on z)
    const P = (p) => new THREE.Vector3(L.x + p.x - cx, p.y - cy, zF);   // mesh origin = glyph centre, on the baseline row
    const tri = [P(apex), P(bl), P(br)];
    const c = tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1 / 3);
    tri.forEach((q) => q.sub(c).multiplyScalar(1.06).add(c));
    const seg = SEGMENTS.find((sg) => sg.id === 'finale'), mon = SEGMENTS.find((sg) => sg.id === 'montage');
    it.zoom = { tri, c, z0: seg.start, z1: mon.end };
    it.t1 = mon.end + 0.1;                              // stays up through the hand-over (no exit animation)
  }

  build(text, inst, t0, t1, swap = false, lay = {}) {
    // every heading starts and leaves on the beat
    t0 = onBeat(t0, swap ? 2 : 1); t1 = onBeat(t1, swap ? 2 : 1);
    const invert = !!lay.invert, align = lay.align ?? 'center';
    const seg = inst.segment;
    const era = eraOf(t0);
    const shared = {
      uSweep: { value: -99 }, uSweepW: { value: 0.45 }, uShine: { value: 0 }, uWordInv: { value: new THREE.Matrix4() },
      uTint: { value: new THREE.Color(era.color).lerp(new THREE.Color('#ffffff'), 0.55) },
    };
    const glyphs = letters3D(text, { size: 1, depth: 0.34, bevel: 0.05, tracking: 0.1, curveSegments: 10, bevelSegments: 5 });
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
    const back = new THREE.Mesh(new THREE.PlaneGeometry(glyphs.width + 2.8, capH * 3.6), new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 }, uCol: { value: new THREE.Color(invert ? '#f3ead9' : '#000000') }, uA: { value: invert ? 0.9 : 0.97 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uO, uA; uniform vec3 uCol; varying vec2 vUv;
        void main(){ vec2 d = (vUv - 0.5) * 2.0; float r = length(d * vec2(1.0, 1.0)); float e = pow(max(abs(d.x), 0.0), 6.0);
          float a = smoothstep(1.0, 0.35, r + e * 0.4); gl_FragColor = vec4(uCol, a * uA * uO); }`,
      transparent: true, depthWrite: false, fog: false,
    }));
    back.position.z = -0.45;
    // FORMATION: gold particles sampled on the letter surfaces, starting as a loose swirling
    // cloud around the word; they converge onto the glyphs and the solid letters materialise
    const N = swap ? 900 : 1800, per = Math.max(40, Math.floor(N / glyphs.length));
    const target = new Float32Array(per * glyphs.length * 3), start = new Float32Array(target.length);
    const r = rng(text.length * 97 + Math.round(t0 * 10));
    glyphs.forEach((g, gi) => {
      const pts = sampleGeometry(g.geometry, per, { seed: gi + 3 });
      for (let j = 0; j < per; j++) {
        const o = (gi * per + j) * 3;
        const x = pts[j * 3] + g.x, y = pts[j * 3 + 1], z = pts[j * 3 + 2];
        target[o] = x; target[o + 1] = y; target[o + 2] = z;
        // start: pushed out from the word centre, with depth toward camera and a spiral bias
        const a = r() * Math.PI * 2, rad = 0.8 + r() * 2.6;
        start[o] = x * 0.35 + Math.cos(a) * rad * 1.3;
        start[o + 1] = y * 0.35 + Math.sin(a) * rad * 0.7;
        start[o + 2] = z + 0.6 + r() * 2.2;
      }
    });
    const dust = new MorphParticles({ count: per * glyphs.length, positions: start, targets: target, size: 0.03, color: '#ffd98f', intensity: 0.8, opacity: 0, stagger: 0.55, seed: text.length + 5 });
    dust.u.noise = 0.05; dust.u.noiseFreq = 1.4; dust.u.swirl = 0; dust.u.twinkle = 0.5;
    dust.renderOrder = 6;
    group.add(dust);
    // star glint that rides the leading edge of the shine
    const glint = glowSprite({ color: '#fff4d6', intensity: 0.8, scale: 0.6 });
    glint.material.depthTest = false;
    glint.position.set(0, capH / 2 + 0.02, 0.25);
    glint.visible = false;
    group.add(glint);
    back.renderOrder = -1;
    group.add(back);
    // a real light that rides the sweep and spills onto the scene around the word
    // (swap words in the montage skip it — six extra lights in one scene would cost too much)
    const light = swap ? { intensity: 0, position: new THREE.Vector3() } : new THREE.PointLight(era.light, 0, 0, 2);
    light.position.set(0, 0, 0.9);
    if (!swap) group.add(light);
    group.visible = false;
    const ov = this.overlayFor(inst);
    ov.scene.add(group);
    // drawn over the finished plate: the overlay's depth is cleared first, so letters depth-test only
    // against each other (clean extrusions) and nothing else writes depth
    group.traverse((o) => { if (o.material && !letters.some((l) => l.mesh === o)) { o.material.depthTest = false; o.material.depthWrite = false; } });

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
    return { text, inst, group, letters, plinth, light, shared, back, glint, dust, capH, invert, align, width: glyphs.width, t0, t1, swap, d, lockPos, lockQuat };
  }

  // Called by the engine after a sequence's update and before it is rendered.
  apply(inst, T) {
    const [pos, camPos, fwd] = this._v, [quat, camQuat] = this._q;
    inst._wordsDuck = 0;   // 0..1: how much the scene's bloom yields while a heading is up (engine reads it)
    this.baseDof(inst);
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
      fwd.set(ax, (it.yOff ?? 0) * H, -it.d * (0.93 + 0.13 * ease.inOutSine(drift))).applyQuaternion(quat);   // slow zoom-out through the whole hold
      it.group.position.copy(pos).add(fwd);
      it.group.quaternion.copy(quat);
      const turn = it.align === 'left' ? -0.12 : it.align === 'right' ? 0.12 : 0;   // side words angle toward the centre
      it.group.rotateY(turn + lerp(0.07, -0.07, ease.inOutSine(drift)));   // gentle turn reveals the extrusion
      it.group.rotateX(-0.08);
      const n = it.letters.length;
      const pace = it.pace ?? 1;
      // KICK-IN: letters fly in from beside the camera one after another on a 32nd-note grid,
      // land with a small impact, then shine one by one (all fast, all on the beat grid)
      const { slot, fly, inDur, shineSlot, shineDur, shine0 } = kickTiming(n, it.swap, pace, it.t0), st = slot;
      const held = sat((t - inDur) / 0.2) * (1 - sat((T - it.t1 + 0.3) / 0.2));
      const beat = pulse(T, { decay: 9 }) * held;
      it.group.scale.setScalar(k * (1 + 0.018 * beat));   // a gentle breath on every beat
      let zw = 0;
      if (it.zoom) {
        // ZOOM THROUGH THE LETTER: scale exponentially about the counter while sliding it to frame
        // centre and levelling the word, until the counter swallows the frame (Earth behind it)
        const u = sat((T - it.zoom.z0) / (it.zoom.z1 - it.zoom.z0));
        zw = ease.inOutSine(sat(u * 2.2));
        const Z = Math.exp(Math.log(180) * Math.pow(u, 2.4));
        const tw = 1 - zw, kz = k * Z;
        it.group.quaternion.copy(quat);
        it.group.rotateY((turn + lerp(0.07, -0.07, ease.inOutSine(drift))) * tw);
        it.group.rotateX(-0.08 * tw);
        const c = it.zoom.c;
        this._k.set(c.x * (k * tw - kz), c.y * (k * tw - kz), 0).applyQuaternion(it.group.quaternion);
        it.group.position.add(this._k);
        it.group.scale.set(kz, kz, k);
      }
      it.group.updateMatrixWorld();
      it.shared.uWordInv.value.copy(it.group.matrixWorld).invert();
      const ov = inst._wordsOverlay;
      this._k.set(-1.6, 2.2, 1.8).multiplyScalar(it.d).applyQuaternion(quat);
      ov.key.position.copy(it.group.position).add(this._k);
      ov.key.target.position.copy(it.group.position);
      ov.key.target.updateMatrixWorld();

      const outStart = onBeat(it.t1 - (it.swap ? 0.06 : 0.2), 4);
      const outDur = it.swap ? 0.16 : 0.45;
      const fade = sat(t / 0.1);
      // stagger by distance from the centre: the middle letters lead, the ends follow
      // stagger from the anchor: centred words grow from the middle, side words from their margin
      const mid = (n - 1) / 2, maxD = Math.max(1, mid);
      const anchorX = it.align === 'left' ? -it.width / 2 : it.align === 'right' ? it.width / 2 : 0;
      const Dz = it.d / Math.max(1e-4, k);                 // camera distance in the word's own units
      it.letters.forEach((l) => {
        const c = it.align === 'left' ? l.i / Math.max(1, n - 1) : it.align === 'right' ? (n - 1 - l.i) / Math.max(1, n - 1) : Math.abs(l.i - mid) / maxD;
        const d0 = l.i * slot;                             // left to right, one per 32nd note
        const u = sat((t - d0) / fly);
        const e = ease.outExpo(u);
        const kout = ease.inCubic(sat((T - outStart - (1 - c) * st * n * 0.3) / outDur));
        // flight: from just in front of the lens, off to the letter's side, spinning into place
        const side = l.x > 0.01 ? 1 : l.x < -0.01 ? -1 : (l.i % 2 ? 1 : -1);
        const fx = l.x + side * Dz * 0.32 + l.x * 0.8, fy = (l.i % 2 ? 1 : -1) * Dz * 0.07, fz = Dz * 0.7;
        const ox = anchorX + (l.x - anchorX) * (1 - kout * 0.85);
        l.pivot.position.x = lerp(fx, ox, e);
        l.pivot.position.y = (l.pivot.userData.y0 ?? (l.pivot.userData.y0 = l.pivot.position.y)) + fy * (1 - e);
        l.pivot.position.z = fz * (1 - e);
        l.pivot.rotation.y = (1 - e) * side * 1.1;
        l.pivot.rotation.x = (1 - e) * -0.55 + kout * -0.5;
        l.mesh.position.y = (l.mesh.userData.h ?? (l.mesh.userData.h = l.mesh.position.y));
        // impact on landing: a quick squash-and-settle
        const land = t - d0 - fly * 0.55;
        const hit = land > 0 ? Math.exp(-land * 16) : 0;
        l.mesh.scale.set((1 + 0.08 * hit) * (1 - kout * 0.4), (1 - 0.06 * hit) * (1 - kout * 0.4), (1 - kout * 0.4));
        // each letter shines in turn, fast
        // (a fast rise as the front reaches the letter, then a slower settle, like a typed letter cooling)
        const sx = (t - shine0 - l.i * shineSlot) / shineDur;
        const sh = sx <= 0 ? 0 : sx < 0.22 ? sx / 0.22 : Math.exp(-(sx - 0.22) * 3.2);
        l.mat.userData.u.uFlash.value = hit * 0.3 + sh * 0.5;
        l.mat.userData.u.uLShine.value = sh * fade;
        l.mat.opacity = fade * sat(u * 5) * (1 - kout);
      });
      // formation particles: converge over the entrance, then dissolve into the solid letters
      const formEnd = inDur + 0.1;
      it.dust.tick(t, { height: this.engine.height });
      it.dust.u.mix = ease.outCubic(sat(t / formEnd));
      it.dust.u.swirl = (1 - ease.outCubic(sat(t / formEnd))) * 1.2;
      it.dust.u.size = 0.03 * k;   // world-space diameter: scale with the word, or close-up words drown in giant motes
      it.dust.u.opacity = 0.55 * sat(t / 0.12) * (1 - ramp(t, formEnd * 0.8, formEnd + 0.35)) + 0.25 * ramp(T, outStart - 0.05, outStart + 0.1) * (1 - ramp(T, outStart + 0.1, outStart + outDur + 0.2));
      it.dust.visible = it.dust.u.opacity > 0.01;
      // light sweep crosses the word once, after the letters stand
      // the sheen band and the glint ride along with the letter-by-letter shine
      const sweepStart = shine0, sweepEnd = sweepStart + (n - 1) * shineSlot + shineDur * 1.3;
      const sweepP = ramp(t, sweepStart - shineDur * 0.3, sweepEnd);
      // …then, through the hold, a slower second highlight glides across the metal (as the last word's
      // highlights roll over it during the zoom), so every heading keeps catching the light
      const holdEnd = Math.max(sweepEnd + 0.5, outStart - it.t0 - 0.05);
      const holdP = ramp(t, sweepEnd + 0.05, holdEnd);
      const first = Math.sin(Math.PI * sweepP), second = 0.6 * Math.sin(Math.PI * holdP);
      const inFirst = sweepP < 1;
      it.shared.uSweep.value = lerp(-it.width / 2 - 1.2, it.width / 2 + 1.2, inFirst ? sweepP : holdP);
      it.shared.uSweepW.value = inFirst ? 0.45 : 0.8;
      // first show: the sweep is a real shine — bright band plus a star glint on its leading edge
      const shine = Math.max(first, second) * fade;
      it.shared.uShine.value = shine;
      it.glint.visible = shine > 0.02;
      it.glint.position.x = it.shared.uSweep.value;
      it.glint.scale.setScalar((0.12 + 0.18 * shine) * (1 + 0.15 * Math.sin(t * 40)));
      it.glint.material.opacity = shine * (inFirst ? 0.55 : 0.35);
      it.glint.material.rotation = t * 1.5;
      it.light.position.x = it.shared.uSweep.value;
      it.light.intensity = shine * 1.0 * k * k;
      // plinth shoots out from the centre with the letters, retracts into it as they leave
      const pp = Math.max(0.0001, ramp(t, 0.05, inDur + n * st * 0.8, ease.outExpo) * (1 - ramp(T, outStart - 0.05, outStart + outDur * 0.8, ease.inOutCubic)));
      it.plinth.forEach((p) => { p.progress = pp; p.opacity = (0.65 + 0.35 * beat) * fade; });
      // contrast backing breathes in with the letters and out with them
      it.back.material.uniforms.uO.value = ramp(t, 0, 0.35) * (1 - ramp(T, outStart, outStart + outDur + 0.1));
      if (it.zoom) {   // the backing, plinth and glint clear as the camera dives into the letter
        it.back.material.uniforms.uO.value *= 1 - zw;
        it.plinth.forEach((p) => (p.opacity *= 1 - zw));
        it.glint.visible = it.glint.visible && zw < 0.05;
      }
      inst._wordsDuck = Math.max(inst._wordsDuck, it.back.material.uniforms.uO.value);
      // rack focus onto the lettering while it is up
      if (inst.dof && !it.noFocus) {
        const w = sat(t / 0.3) * (1 - sat((T - outStart) / 0.35));
        inst.dof.focus = lerp(inst.dof.focus, it.d, w);
        inst.dof.range = lerp(inst.dof.range ?? 2, it.d * 0.35, w);
        inst.dof.amount = Math.max(inst.dof.amount ?? 0, 0.35 * w);
        inst._dofRack = { focus: inst.dof.focus, range: inst.dof.range, amount: inst.dof.amount };
      }
    }
  }
}
