// ELECTRICITY & COMMUNICATION (28.5–32.0 s)
// Technique: match-cut transitions + light-trail / energy FX + procedural circuit growth.
//   Shot 1  28.5–29.3  a spark ignites in the flash and races along a copper wire (and through an electromagnet
//                      coil); the camera chases it at extreme speed past motion streaks.
//   Shot 2  29.3–30.0  telegraph key (walnut, brass lever, bakelite knob) taps on the beat; ends in a side view
//                      whose lever silhouette MATCH-CUTS to…
//   Shot 3  30.0–30.6  …a bakelite telephone handset in the same place; the camera drops onto the rotary dial,
//                      whose circle MATCH-CUTS to…
//   Shot 4  30.6–31.2  …the round grille of a walnut radio; we fly through the grille down onto a glowing
//                      vacuum tube, whose top-down glow MATCH-CUTS to…
//   Shot 5  31.2–32.0  …a transistor-era chip; PCB traces race outward like a city at night (31.5) and the camera
//                      rises, then pushes into the centre for the 'zoom' hand-over.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CUES, BEAT, FILM_ASPECT, OUTPUT_ASPECT } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU, hash1 } from '../lib/math.js';
import { pulse } from '../lib/rhythm.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { glowSprite } from '../lib/materials.js';
import { segmentsLine } from '../lib/lines.js';
import { Dust } from '../lib/particles.js';
import { surfaceTexture, brassMat } from './industrial-gear.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, ctx.aspect, 0.004, 120);
  const cue = (n) => CUES[n] - segment.start;
  const tSpark = cue('spark'), tTel = cue('telegraph'), tPhone = cue('telephone'), tRadio = cue('radio'), tElec = cue('electronics'), tCity = cue('circuitCity');
  const DUR = segment.end - segment.start;

  scene.environment = ctx.env;
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.FogExp2(0x030406, 0.06);
  const BG = 0x020304;

  const key = new THREE.DirectionalLight('#fff0e0', 1.6); key.position.set(-4, 5, -1.5); scene.add(key);
  const rim = new THREE.DirectionalLight('#bcd8ff', 3.0); rim.position.set(3, 2, -5); scene.add(rim);
  const warm = new THREE.PointLight('#ffb070', 0, 3, 2); scene.add(warm);

  // materials
  const copper = new THREE.MeshPhysicalMaterial({ color: '#d7824a', metalness: 1, roughness: 0.22, clearcoat: 0.3 });
  const brass = brassMat({ roughness: 0.2, color: '#d2a862' });
  const chrome = new THREE.MeshStandardMaterial({ color: '#b9bec5', metalness: 1, roughness: 0.14 });
  const walnutTex = surfaceTexture('walnut', 512, 21);
  const walnut = new THREE.MeshPhysicalMaterial({ map: walnutTex, color: '#ffffff', roughness: 0.62, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.45, envMapIntensity: 0.45 });
  const bakelite = new THREE.MeshPhysicalMaterial({ color: '#0d0c0c', roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 });
  const ironM = new THREE.MeshStandardMaterial({ color: '#4a4f55', metalness: 0.9, roughness: 0.45 });

  // =====================================================================================
  // SHOT 1 — copper wire with a travelling spark (and an electromagnet coil on the way)
  const TG = V(0, 0, 0); // telegraph origin
  const BP = V(-0.42, 0.105, 0.12).add(TG); // binding post (wire terminal)
  const wirePts = [];
  {
    const far = [V(-16, 1.6, -7), V(-12.5, 0.8, -4.5), V(-9.5, 1.3, -2.0)];
    far.forEach((p) => wirePts.push(p));
    // coil: helix around an axis from C0 to C1
    const C0 = V(-7.6, 1.0, -0.6), C1 = V(-5.4, 0.8, 0.2);
    const ax = C1.clone().sub(C0), len = ax.length(); ax.normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(ax).normalize(), w = ax.clone().cross(u).normalize();
    const turns = 7, N = turns * 18;
    for (let i = 0; i <= N; i++) {
      const f = i / N, a = f * turns * TAU;
      const rr = 0.16 * smoothstep(0, 0.06, f) * smoothstep(1, 0.94, f) + 0.02;
      wirePts.push(C0.clone().addScaledVector(ax, f * len).addScaledVector(u, Math.cos(a) * rr).addScaledVector(w, Math.sin(a) * rr));
    }
    [V(-3.6, 0.55, 0.9), V(-2.0, 0.28, 0.55), V(-1.1, 0.14, 0.3), V(-0.7, 0.1, 0.18), BP.clone()].forEach((p) => wirePts.push(p));
    scene.userData.coil = { C0, C1, ax, len };
  }
  const wireCurve = new THREE.CatmullRomCurve3(wirePts, false, 'centripetal');
  // smooth camera guide (the coil replaced by its axis) + wire-u → guide-u lookup table
  const guidePts = [V(-16, 1.6, -7), V(-12.5, 0.8, -4.5), V(-9.5, 1.3, -2.0), scene.userData.coil.C0.clone(), scene.userData.coil.C1.clone(), V(-3.6, 0.55, 0.9), V(-2.0, 0.28, 0.55), V(-1.1, 0.14, 0.3), V(-0.7, 0.1, 0.18), BP.clone()];
  const guide = new THREE.CatmullRomCurve3(guidePts, false, 'centripetal');
  const GN = 400, g2w = new Float32Array(GN + 1);
  {
    const gp = []; for (let j = 0; j <= 1000; j++) gp.push(guide.getPointAt(j / 1000));
    let jj = 0; const q = new THREE.Vector3();
    for (let i = 0; i <= GN; i++) {
      wireCurve.getPointAt(i / GN, q);
      let best = jj, bd = 1e9;
      for (let j = jj; j <= Math.min(1000, jj + 120); j++) { const d = gp[j].distanceToSquared(q); if (d < bd) { bd = d; best = j; } }
      jj = best; g2w[i] = best / 1000;
    }
  }
  const guideU = (u) => { const f = clamp(u, 0, 1) * GN, i = Math.min(GN - 1, Math.floor(f)); return lerp(g2w[i], g2w[i + 1], f - i); };

  const WIRE_LEN = wireCurve.getLength();
  const strandTex = canvasTex(256, 64, (x, w, h) => { x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let i = -20; i < 40; i++) { x.strokeStyle = i % 2 ? 'rgba(40,40,40,0.9)' : 'rgba(210,210,210,0.8)'; x.lineWidth = 3; x.beginPath(); x.moveTo(i * 8, 0); x.lineTo(i * 8 + 32, h); x.stroke(); } }, { srgb: false });
  strandTex.wrapS = strandTex.wrapT = THREE.RepeatWrapping; strandTex.repeat.set(WIRE_LEN * 30, 1);
  const wireMat = copper.clone(); wireMat.bumpMap = strandTex; wireMat.bumpScale = 0.6; wireMat.roughnessMap = strandTex;
  const wire = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 1800, 0.013, 10, false), wireMat);
  scene.add(wire);
  // coil core (soft iron) + bobbin cheeks
  {
    const { C0, C1, ax, len } = scene.userData.coil;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len * 1.15, 32), ironM);
    core.position.copy(C0).lerp(C1, 0.5); core.quaternion.setFromUnitVectors(V(0, 1, 0), ax); scene.add(core);
    [0, 1].forEach((k) => { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 40), bakelite); ch.position.copy(C0).lerp(C1, k ? 1.02 : -0.02); ch.quaternion.copy(core.quaternion); scene.add(ch); });
  }
  // pulse overlay: additive tube keyed by arc-length distance to the head
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: { uHead: { value: 0 }, uLen: { value: WIRE_LEN }, uI: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uHead, uLen, uI; varying vec2 vUv; varying float vD;
      void main(){ float d = (vUv.x - uHead) * uLen;
        float head = d > 0.0 ? exp(-d*d/0.0016) : exp(d/0.12);
        float trail = d < 0.0 ? exp(d/1.2) * 0.12 : 0.0;
        vec3 c = mix(vec3(1.0,0.55,0.25), vec3(0.85,0.93,1.0), exp(-abs(d)*6.0));
        // the glowing trail right beside the chase camera would defocus into a frame-filling white blob
        vec3 col = c * (head * 7.0 + trail) * uI * smoothstep(0.18, 0.6, vD);
        if (dot(col, vec3(1.0)) < 0.01) discard;
        gl_FragColor = vec4(col, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pulseTube = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 1800, 0.019, 8, false), pulseMat);
  pulseTube.frustumCulled = false; scene.add(pulseTube);
  const headGlow = glowSprite({ color: '#dfeeff', intensity: 3.2, scale: 0.35 }); scene.add(headGlow);
  const headGlow2 = glowSprite({ color: '#9cc8ff', intensity: 0.4, scale: 1.4 }); scene.add(headGlow2);
  // crackling micro-arcs around the head (preallocated buffer, rewritten per frame from a seeded hash)
  const ARCS = 4, ARC_SEG = 6;
  const arcPos = new Float32Array(ARCS * ARC_SEG * 2 * 3);
  const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPos, 3));
  const arcLines = new THREE.LineSegments(arcGeo, new THREE.LineBasicMaterial({ color: new THREE.Color('#cfe6ff').multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  arcLines.frustumCulled = false; scene.add(arcLines);
  // motion streaks around the wire path
  const streakSegs = [];
  {
    const r = rng(55);
    for (let i = 0; i < 700; i++) {
      // direction from the smooth guide (coil replaced by its axis): the helix tangent would scatter the
      // streaks around the coil into a tangle of random sticks instead of a clean warp-speed flow
      const u = r(), p = wireCurve.getPointAt(u), tn = guide.getTangentAt(guideU(u));
      const off = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.3 + r() * 0.9);
      const a = p.clone().add(off), L = 0.15 + r() * 0.7;
      streakSegs.push([a, a.clone().addScaledVector(tn, L)]);
    }
  }
  const streaks = segmentsLine(streakSegs, { color: '#9cc8ff', intensity: 0.9, opacity: 0.45, orderFn: () => 0, stagger: 0 });
  scene.add(streaks);
  const bokeh = new Dust({ count: 900, size: [18, 3, 9], center: [-7, 0.8, -1.5], particleSize: 0.02, color: '#ffd2a8', opacity: 0.6, intensity: 1.6, seed: 71 });
  scene.add(bokeh);

  // =====================================================================================
  // SHOT 2 — telegraph key
  const tele = new THREE.Group(); tele.position.copy(TG); scene.add(tele);
  const PIV = V(-0.08, 0.165, 0);
  const lever = new THREE.Group(); lever.position.copy(PIV); tele.add(lever);
  {
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.075, 0.44, 4, 0.022), walnut); base.position.y = 0.0375; tele.add(base);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.01, 0.13), brassMat({ roughness: 0.5, color: '#9a7a48' })); plate.position.y = 0.08; tele.add(plate);
    [-1, 1].forEach((s) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.02), brass); p.position.set(PIV.x, 0.125, s * 0.05); tele.add(p); });
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.13, 12).rotateX(Math.PI / 2), chrome); axle.position.copy(PIV); tele.add(axle);
    const bar = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.028, 0.04, 2, 0.008), brass); bar.position.x = 0.06; lever.add(bar);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), brass); stem.position.set(0.38, 0.035, 0); lever.add(stem);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.055, 0.03, 48), bakelite); knob.position.set(0.38, 0.068, 0); lever.add(knob);
    const knobTop = new THREE.Mesh(new THREE.SphereGeometry(0.058, 48, 12, 0, TAU, 0, Math.PI / 2), bakelite); knobTop.scale.y = 0.25; knobTop.position.set(0.38, 0.083, 0); lever.add(knobTop);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 10), chrome); screw.position.set(0.24 - PIV.x, -0.02, 0); lever.add(screw);
    const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.05, 20), brass); anvil.position.set(0.24, 0.105, 0); tele.add(anvil);
    const cpt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), chrome); cpt.position.set(0.24, 0.135, 0); tele.add(cpt);
    // rear spring + adjusting nut
    const hel = []; for (let i = 0; i <= 80; i++) { const a = (i / 80) * 8 * TAU; hel.push(V(Math.cos(a) * 0.012, 0.085 + (i / 80) * 0.07, Math.sin(a) * 0.012)); }
    const spring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hel), 200, 0.0025, 6), chrome); spring.position.x = -0.3; tele.add(spring);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6), brass); nut.position.set(-0.3 - PIV.x, 0.03, 0); lever.add(nut);
    [-1, 1].forEach((s) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.05, 24), brass); post.position.set(-0.42, 0.1, s * 0.12); tele.add(post);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.028, 24), brass); cap.position.set(-0.42, 0.135, s * 0.12); tele.add(cap);
    });
    // wire from the other post back out
    const back = new THREE.CatmullRomCurve3([V(-0.42, 0.105, -0.12), V(-0.7, 0.08, -0.25), V(-1.3, 0.2, -0.9), V(-2.5, 0.6, -2.4)]);
    tele.add(new THREE.Mesh(new THREE.TubeGeometry(back, 120, 0.013, 8), wireMat));
    // Morse tape strip on the base
    const tapeTex = canvasTex(512, 32, (x, w, h) => { x.fillStyle = '#e9dfc6'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a1d12'; const code = '.-- .... .- - / .... .- - .... / --. --- -.. / .-- .-. --- ..- --. .... -'; let px = 10; for (const ch of code) { if (ch === '.') { x.fillRect(px, 13, 6, 6); px += 14; } else if (ch === '-') { x.fillRect(px, 13, 20, 6); px += 28; } else px += 18; } });
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.04), new THREE.MeshStandardMaterial({ map: tapeTex, color: '#6f6a60', roughness: 0.85 })); tape.rotation.x = -Math.PI / 2; tape.position.set(0.05, 0.0765, 0.17); tele.add(tape);
  }
  const contactGlow = glowSprite({ color: '#cfe6ff', intensity: 3, scale: 0.12 }); contactGlow.position.set(0.24, 0.14, 0).add(TG); scene.add(contactGlow);
  const LEVER_C = TG.clone().add(V(0.06, 0.2, 0)); // silhouette centre used for the match cut

  // =====================================================================================
  // SHOT 3 — telephone
  const PH = V(20, 0, 0);
  const phone = new THREE.Group(); phone.position.copy(PH); scene.add(phone);
  const HANDSET_C = PH.clone().add(V(0, 0.255, 0.02));
  const dial = new THREE.Group();
  let dialC, dialN;
  {
    const prof = new THREE.Shape();
    prof.moveTo(-0.2, 0); prof.lineTo(0.23, 0); prof.lineTo(0.23, 0.025); prof.lineTo(0.06, 0.165); prof.lineTo(-0.15, 0.165); prof.lineTo(-0.2, 0.03); prof.lineTo(-0.2, 0);
    const bg = new THREE.ExtrudeGeometry(prof, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 4, curveSegments: 8 });
    bg.rotateY(-Math.PI / 2); bg.translate(0.17, 0, 0);
    phone.add(new THREE.Mesh(bg, bakelite));
    const feet = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.012, 0.47, 2, 0.005), new THREE.MeshStandardMaterial({ color: '#1a1512', roughness: 0.9 })); feet.position.y = -0.006; phone.add(feet);
    // dial on the sloped face: centre & normal
    const s0 = new THREE.Vector2(0.23, 0.025), s1 = new THREE.Vector2(0.06, 0.165);
    const mid = s0.clone().lerp(s1, 0.5);
    const sl = s1.clone().sub(s0).normalize();
    const nrm = new THREE.Vector2(-sl.y, sl.x); if (nrm.y < 0) nrm.multiplyScalar(-1);
    dialN = V(0, nrm.y, nrm.x).normalize();
    dialC = V(0, mid.y, mid.x).addScaledVector(dialN, 0.024);
    dial.position.copy(dialC); dial.quaternion.setFromUnitVectors(V(0, 0, 1), dialN); phone.add(dial);
    const numTex = canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = '#f1ece0'; x.beginPath(); x.arc(256, 256, 256, 0, TAU); x.fill();
      x.fillStyle = '#1a1a1a'; x.font = '600 44px "Inter"'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 3 - 0.2 - i * (TAU * 0.083); const d = String((i + 1) % 10); x.fillText(d, 256 + Math.cos(a) * 190, 256 - Math.sin(a) * 190); x.font = '400 18px "Inter"'; x.fillText(['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PRS', 'TUV', 'WXY', 'OPER'][i] ?? '', 256 + Math.cos(a) * 150, 256 - Math.sin(a) * 150); x.font = '600 44px "Inter"'; }
    });
    const plateN = new THREE.Mesh(new THREE.CircleGeometry(0.088, 64), new THREE.MeshStandardMaterial({ map: numTex, color: '#a39d91', roughness: 0.8 })); dial.add(plateN);
    const ws = new THREE.Shape(); ws.absarc(0, 0, 0.088, 0, TAU, false);
    const wheelHoles = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 3 - 0.2 - i * (TAU * 0.083); const h = new THREE.Path(); h.absarc(Math.cos(a) * 0.066, Math.sin(a) * 0.066, 0.0125, 0, TAU, true); ws.holes.push(h); wheelHoles.push(a); }
    const inner = new THREE.Path(); inner.absarc(0, 0, 0.034, 0, TAU, true); ws.holes.push(inner);
    const wheelG = new THREE.ExtrudeGeometry(ws, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 32 });
    const wheel = new THREE.Mesh(wheelG, new THREE.MeshStandardMaterial({ color: '#959ba3', metalness: 1, roughness: 0.36, envMapIntensity: 0.6 })); wheel.position.z = 0.004; dial.add(wheel); dial.userData.wheel = wheel;
    const card = new THREE.Mesh(new THREE.CircleGeometry(0.032, 48), new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (x) => { x.fillStyle = '#efe7d4'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#6a1b12'; x.font = '600 34px "IBM Plex Mono"'; x.textAlign = 'center'; x.fillText('MAIN', 128, 110); x.fillText('1876', 128, 160); }), color: '#8f8a80', roughness: 0.6 })); card.position.z = 0.003; dial.add(card);
    const stop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.01), chrome); stop.position.set(Math.cos(-0.95) * 0.086, Math.sin(-0.95) * 0.086, 0.012); stop.rotation.z = -0.95; dial.add(stop);
    // cradle
    [-0.11, 0.11].forEach((x) => { const pr = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.08, 0.05, 2, 0.015), bakelite); pr.position.set(x, 0.2, -0.02); phone.add(pr); });
    const plunger = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), chrome); plunger.position.set(0.11, 0.245, -0.02); phone.add(plunger);
    // handset
    const hs = new THREE.Group(); hs.position.copy(HANDSET_C).sub(PH); phone.add(hs);
    // arched bakelite handle (oval section) into flared, lathe-turned ear / mouth cups with perforated grilles
    const gripG = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-0.262, -0.05, 0), V(-0.235, -0.012, 0), V(-0.16, 0.008, 0), V(0, 0.014, 0), V(0.16, 0.008, 0), V(0.235, -0.012, 0), V(0.262, -0.05, 0)]), 96, 0.025, 20, false);
    const grip = new THREE.Mesh(gripG, bakelite); grip.scale.z = 1.2; hs.add(grip);
    const cupG = new THREE.LatheGeometry([[0.0, 0.034], [0.028, 0.034], [0.036, 0.02], [0.05, 0.006], [0.062, -0.006], [0.0685, -0.016], [0.068, -0.023], [0.062, -0.026], [0.054, -0.022], [0.0, -0.02]].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 64);
    const holeTex = canvasTex(256, 256, (x, w) => { x.fillStyle = '#2a2826'; x.fillRect(0, 0, w, w); x.fillStyle = '#050505'; for (let r = 0; r < 4; r++) { const n = r ? r * 7 : 1; for (let k = 0; k < n; k++) { const a = (k / n) * TAU; x.beginPath(); x.arc(128 + Math.cos(a) * r * 26, 128 + Math.sin(a) * r * 26, 7, 0, TAU); x.fill(); } } });
    const grillM = new THREE.MeshStandardMaterial({ map: holeTex, roughness: 0.55, metalness: 0.2 });
    [-1, 1].forEach((s) => {
      const cup = new THREE.Mesh(cupG, bakelite); cup.position.set(s * 0.265, -0.065, 0); cup.rotation.z = s * 0.12; hs.add(cup);
      const grill = new THREE.Mesh(new THREE.CircleGeometry(0.053, 48), grillM); grill.rotation.x = Math.PI / 2; grill.position.set(0, -0.0205, 0); cup.add(grill);
    });
    // coiled cord
    const cc = []; for (let i = 0; i <= 400; i++) { const f = i / 400, a = f * 28 * TAU; const base = V(-0.29 + f * -0.06, 0.18 - f * 0.17, -0.02 - f * 0.14); cc.push(base.add(V(Math.cos(a) * 0.012, Math.sin(a) * 0.012, Math.sin(a + 1) * 0.004))); }
    phone.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cc), 1200, 0.004, 6), bakelite));
  }
  const DIAL_W = PH.clone().add(dialC); // world dial centre
  const DIAL_N = dialN.clone();

  // =====================================================================================
  // SHOT 4 — walnut radio with glowing vacuum tubes
  const RD = V(40, 0, 0);
  const radio = new THREE.Group(); radio.position.copy(RD); scene.add(radio);
  const RW = 0.72, RH0 = 0.56, RR = RW / 2, RDP = 0.36, GR = 0.205, GY = 0.6;
  const grilleC = RD.clone().add(V(0, GY, RDP / 2));
  const tubes = [];
  const radioFront = [];   // the front panel and everything mounted on it (see explorePosed)
  let cloth;
  {
    const arch = (inset) => { const s = new THREE.Shape(); s.moveTo(-RR + inset, inset); s.lineTo(RR - inset, inset); s.lineTo(RR - inset, RH0); s.absarc(0, RH0, RR - inset, 0, Math.PI, false); s.lineTo(-RR + inset, inset); return s; };
    const front = arch(0); const hole = new THREE.Path(); hole.absarc(0, GY, GR, 0, TAU, true); front.holes.push(hole);
    const dialHole = new THREE.Path(); dialHole.absarc(0, 0.2, 0.062, 0, TAU, true); front.holes.push(dialHole);
    const fg = new THREE.ExtrudeGeometry(front, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 48 });
    fg.translate(0, 0, RDP / 2 - 0.035);
    const fgM = new THREE.Mesh(fg, walnut); radio.add(fgM); radioFront.push(fgM);
    const shell = arch(0); shell.holes.push(new THREE.Path(arch(0.03).getPoints(48).reverse()));
    const sg = new THREE.ExtrudeGeometry(shell, { depth: RDP - 0.04, bevelEnabled: false, curveSegments: 48 }); sg.translate(0, 0, -RDP / 2);
    radio.add(new THREE.Mesh(sg, walnut));
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(RW, 0.03, RDP), walnut); bottom.position.y = 0.015; radio.add(bottom);
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(RW + 0.06, 0.05, RDP + 0.05, 2, 0.015), walnut); plinth.position.y = 0.0; radio.add(plinth);
    // grille: cloth + fretwork + brass bezel
    const clothTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#6b5530'; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 3) { x.fillStyle = `rgba(${40 + (i % 9) * 6},${30 + (i % 7) * 4},15,0.45)`; x.fillRect(i, 0, 1, h); x.fillRect(0, i, w, 1); } });
    clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping; clothTex.repeat.set(3, 3);
    cloth = new THREE.Mesh(new THREE.CircleGeometry(GR, 64), new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95, transparent: true }));
    cloth.position.set(0, GY, RDP / 2 - 0.04); radio.add(cloth); radioFront.push(cloth);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(GR + 0.004, 0.011, 16, 96), brass); bezel.position.set(0, GY, RDP / 2 + 0.012); radio.add(bezel); radioFront.push(bezel);
    for (let i = -2; i <= 2; i++) {
      const hgt = 2 * Math.sqrt(GR * GR - (i * 0.07) ** 2);
      const bar = new THREE.Mesh(new RoundedBoxGeometry(0.018, hgt, 0.02, 2, 0.006), walnut); bar.position.set(i * 0.07, GY, RDP / 2 - 0.012); radio.add(bar); radioFront.push(bar);
    }
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(GR * 0.55, 0.008, 12, 72), walnut); ring2.position.set(0, GY, RDP / 2 - 0.01); radio.add(ring2); radioFront.push(ring2);
    // tuning dial (amber, back-lit)
    const dialTex = canvasTex(512, 512, (x, w, h) => {
      const g = x.createRadialGradient(256, 256, 20, 256, 256, 256); g.addColorStop(0, '#fff1c8'); g.addColorStop(1, '#e3a24f'); x.fillStyle = g; x.beginPath(); x.arc(256, 256, 256, 0, TAU); x.fill();
      x.strokeStyle = '#3a2410'; x.lineWidth = 3; x.fillStyle = '#3a2410'; x.font = '500 34px "IBM Plex Mono"'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let i = 0; i <= 40; i++) { const a = Math.PI * 1.15 - (i / 40) * Math.PI * 1.3; const L = i % 5 === 0 ? 34 : 18; x.beginPath(); x.moveTo(256 + Math.cos(a) * 225, 256 - Math.sin(a) * 225); x.lineTo(256 + Math.cos(a) * (225 - L), 256 - Math.sin(a) * (225 - L)); x.stroke(); if (i % 10 === 0) x.fillText(String(55 + i * 2.6 | 0), 256 + Math.cos(a) * 160, 256 - Math.sin(a) * 160); }
      x.font = '500 26px "IBM Plex Mono"'; x.fillText('KC', 256, 330);
    });
    const tdial = new THREE.Mesh(new THREE.CircleGeometry(0.062, 48), new THREE.MeshBasicMaterial({ map: dialTex, color: new THREE.Color('#ffffff').multiplyScalar(1.5), toneMapped: false })); tdial.position.set(0, 0.2, RDP / 2 - 0.02); radio.add(tdial); radioFront.push(tdial);
    const tbez = new THREE.Mesh(new THREE.TorusGeometry(0.064, 0.008, 12, 64), brass); tbez.position.set(0, 0.2, RDP / 2 + 0.01); radio.add(tbez); radioFront.push(tbez);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.05, 0.002).translate(0, 0.025, 0), new THREE.MeshBasicMaterial({ color: '#8a1a10' })); needle.position.set(0, 0.2, RDP / 2 - 0.012); radio.add(needle); radio.userData.needle = needle; radioFront.push(needle);
    [-1, 1].forEach((s) => { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.03, 32).rotateX(Math.PI / 2), bakelite); k.position.set(s * 0.2, 0.2, RDP / 2 + 0.015); radio.add(k); radioFront.push(k); });
    // chassis + tubes inside
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(RW - 0.08, 0.02, RDP - 0.08), new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 1, roughness: 0.45 })); chassis.position.set(0, 0.24, -0.01); radio.add(chassis);
    const glassM = new THREE.MeshPhysicalMaterial({ color: '#dfe8ee', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.4, clearcoat: 1, depthWrite: false });
    const plateM = new THREE.MeshStandardMaterial({ color: '#3b3d40', metalness: 0.9, roughness: 0.5 });
    const tubeSpots = [[-0.2, -0.08, 0.16], [-0.08, -0.1, 0.19], [0.05, -0.07, 0.22], [0.18, -0.09, 0.15], [0.0, 0.07, 0.13]];
    tubeSpots.forEach(([x, z, h], i) => {
      const g = new THREE.Group(); g.position.set(x, 0.25, z); radio.add(g);
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.036, 0.02, 24), bakelite); sock.position.y = 0.01; g.add(sock);
      const env = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 32, 1, true), glassM); env.position.y = 0.02 + h / 2; g.add(env);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.03, 32, 12, 0, TAU, 0, Math.PI / 2), glassM); dome.position.y = 0.02 + h; g.add(dome);
      const getter = new THREE.Mesh(new THREE.SphereGeometry(0.0295, 24, 8, 0, TAU, 0, 0.5), new THREE.MeshStandardMaterial({ color: '#c7ccd2', metalness: 1, roughness: 0.15, transparent: true, opacity: 0.6 })); getter.position.y = 0.02 + h; g.add(getter);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, h * 0.55, 6, 1, true), plateM); plate.position.y = 0.03 + h * 0.4; g.add(plate);
      const fil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, h * 0.5, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff7a2a').multiplyScalar(4), toneMapped: false })); fil.position.y = 0.03 + h * 0.4; g.add(fil);
      const gl = glowSprite({ color: '#ff8a3a', intensity: 1.2, scale: 0.11 }); gl.position.y = 0.03 + h * 0.45; g.add(gl);
      const gl2 = glowSprite({ color: '#ffb070', intensity: 1.4, scale: 0.05 }); gl2.position.y = 0.02 + h + 0.005; g.add(gl2);
      tubes.push({ g, h, fil, gl, gl2 });
    });
    const xfmr = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.08), ironM); xfmr.position.set(0.24, 0.3, 0.06); radio.add(xfmr);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.1, 24), new THREE.MeshStandardMaterial({ color: '#b8bdc4', metalness: 1, roughness: 0.3 })); cap.position.set(-0.24, 0.3, 0.07); radio.add(cap);
  }
  const TUBE0 = tubes[2];
  TUBE0.gl2.scale.setScalar(0.1); TUBE0.gl2.material.color.multiplyScalar(1.8);
  const TUBE_TOP = RD.clone().add(V(0.05, 0.25 + 0.02 + TUBE0.h, -0.07));
  const tubeLight = new THREE.PointLight('#ff8a3a', 0, 1.2, 2); tubeLight.position.copy(RD).add(V(0, 0.4, -0.05)); scene.add(tubeLight);

  // =====================================================================================
  // SHOT 5 — chip + procedural PCB "city"
  const PC = V(60, 0, 0);
  const board = new THREE.Group(); board.position.copy(PC); scene.add(board);
  const boardTex = canvasTex(1024, 1024, (x, w, h) => { x.fillStyle = '#07130f'; x.fillRect(0, 0, w, h); x.strokeStyle = 'rgba(80,140,110,0.08)'; x.lineWidth = 1; for (let i = 0; i < w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); } });
  boardTex.wrapS = boardTex.wrapT = THREE.RepeatWrapping; boardTex.repeat.set(10, 10);
  const pcb = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshStandardMaterial({ map: boardTex, color: '#ffffff', roughness: 0.45, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
  pcb.rotation.x = -Math.PI / 2; board.add(pcb);
  const CHIP = 0.3;
  const chip = new THREE.Group(); board.add(chip);
  const dieMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a4a').multiplyScalar(2.5), toneMapped: false, transparent: true });
  {
    const pkg = new THREE.Mesh(new RoundedBoxGeometry(CHIP, 0.04, CHIP, 2, 0.006), new THREE.MeshPhysicalMaterial({ color: '#111214', roughness: 0.35, metalness: 0.1, clearcoat: 0.6 })); pkg.position.y = 0.02; chip.add(pkg);
    const dieTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 2; for (let i = 0; i < 9; i++) { x.strokeRect(20 + i * 6, 20 + i * 6, 216 - i * 12, 216 - i * 12); } x.fillStyle = '#fff'; for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if ((i * 7 + j * 3) % 5 < 2) x.fillRect(70 + i * 10, 70 + j * 10, 6, 6); }, { srgb: false });
    dieMat.map = dieTex;
    const die = new THREE.Mesh(new THREE.PlaneGeometry(CHIP * 0.5, CHIP * 0.5), dieMat); die.rotation.x = -Math.PI / 2; die.position.y = 0.0405; chip.add(die);
    const pinG = new THREE.BoxGeometry(0.012, 0.008, 0.04);
    const pins = new THREE.InstancedMesh(pinG, new THREE.MeshStandardMaterial({ color: '#9aa0a8', metalness: 1, roughness: 0.4 }), 64);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(); let k = 0;
    for (let s = 0; s < 4; s++) for (let i = 0; i < 16; i++) { const o = -CHIP / 2 + 0.02 + (i / 15) * (CHIP - 0.04); const a = (s * Math.PI) / 2; q.setFromAxisAngle(V(0, 1, 0), a); const p = V(o, 0.006, CHIP / 2 + 0.018).applyAxisAngle(V(0, 1, 0), a); m4.compose(p, q, V(1, 1, 1)); pins.setMatrixAt(k++, m4); }
    chip.add(pins);
  }
  const chipGlow = glowSprite({ color: '#ffb070', intensity: 2.2, scale: 0.5 }); chipGlow.position.set(0, 0.06, 0); board.add(chipGlow);
  // traces as flat ribbons with per-vertex route distance (aD) for radial growth + travelling pulses
  const tPos = [], tD = [], tC = [];
  const pads = [];
  const R2 = rng(1947);
  const COOL = new THREE.Color('#bfe0ff'), WARM = new THREE.Color('#e8955a');
  function ribbon(a, b, dA, dB, w, col) {
    const dir = new THREE.Vector2(b.x - a.x, b.y - a.y); const L = dir.length(); if (L < 1e-5) return; dir.divideScalar(L);
    const nx = -dir.y * w / 2, nz = dir.x * w / 2, y = 0.003; w *= 0.6;
    const verts = [[a.x + nx, a.y + nz, dA], [a.x - nx, a.y - nz, dA], [b.x + nx, b.y + nz, dB], [a.x - nx, a.y - nz, dA], [b.x - nx, b.y - nz, dB], [b.x + nx, b.y + nz, dB]];
    for (const [x, z, d] of verts) { tPos.push(x, y, z); tD.push(d); tC.push(col.r, col.g, col.b); }
  }
  function route(start, dir0, d0, maxLen, w, col, turnP = 0.35) {
    // Manhattan / 45° routing: runs of straight segments with occasional 45° jogs
    let p = start.clone(), dir = dir0.clone(), d = d0, len = 0;
    const DIRS = []; for (let i = 0; i < 8; i++) DIRS.push(new THREE.Vector2(Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)));
    let di = DIRS.findIndex((v) => v.distanceTo(dir) < 0.01); if (di < 0) di = 0;
    while (len < maxLen) {
      const run = 0.15 + R2() * 0.9;
      const q = p.clone().addScaledVector(DIRS[di], run);
      if (Math.abs(q.x) > 12 || Math.abs(q.y) > 12) break;
      ribbon(p, q, d, d + run, w, col);
      d += run; len += run; p = q;
      if (R2() < turnP) { di = (di + (R2() < 0.5 ? 1 : 7)) % 8; }
      else if (di % 2 === 1 && R2() < 0.7) di = (di + (R2() < 0.5 ? 1 : 7)) % 8; // leave diagonals quickly
      if (R2() < 0.08) break;
    }
    pads.push({ x: p.x, z: p.y, d, s: w * 2.6 });
    return { p, d };
  }
  // from every chip pin outward
  for (let s = 0; s < 4; s++) for (let i = 0; i < 16; i++) {
    const o = -CHIP / 2 + 0.02 + (i / 15) * (CHIP - 0.04);
    const a = (s * Math.PI) / 2;
    const out = new THREE.Vector2(Math.round(Math.sin(a)), Math.round(Math.cos(a)));
    const start = new THREE.Vector2(o, CHIP / 2 + 0.04).rotateAround(new THREE.Vector2(), -a);
    const res = route(start, out, 0.2, 2 + R2() * 7, 0.012, R2() < 0.8 ? COOL : WARM, 0.3);
    if (R2() < 0.5) route(res.p, new THREE.Vector2(out.y, -out.x), res.d, 1 + R2() * 3, 0.01, COOL, 0.3);
  }
  // city buses: bundles of parallel traces across the board
  for (let b = 0; b < 260; b++) {
    const ang = Math.floor(R2() * 4) * (Math.PI / 2);
    const c = new THREE.Vector2((R2() - 0.5) * 20, (R2() - 0.5) * 20);
    if (c.length() < 0.8) continue;
    const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
    const nrm = new THREE.Vector2(-dir.y, dir.x);
    const n = 3 + Math.floor(R2() * 6), L = 1 + R2() * 4, col = R2() < 0.75 ? COOL : WARM;
    for (let k = 0; k < n; k++) {
      const st = c.clone().addScaledVector(nrm, k * 0.05);
      const d0 = st.length();
      ribbon(st, st.clone().addScaledVector(dir, L), d0, d0 + L, 0.012, col);
      pads.push({ x: st.x, z: st.y, d: d0, s: 0.028 });
      pads.push({ x: st.x + dir.x * L, z: st.y + dir.y * L, d: d0 + L, s: 0.028 });
    }
  }
  const traceGeo = new THREE.BufferGeometry();
  traceGeo.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  traceGeo.setAttribute('aD', new THREE.Float32BufferAttribute(tD, 1));
  traceGeo.setAttribute('aC', new THREE.Float32BufferAttribute(tC, 3));
  const cityUniforms = { uGrow: { value: 0 }, uTime: { value: 0 }, uI: { value: 0.65 } };
  const traceMat = new THREE.ShaderMaterial({
    uniforms: cityUniforms,
    vertexShader: `attribute float aD; attribute vec3 aC; varying float vD; varying vec3 vC; varying float vFog;
      void main(){ vD = aD; vC = aC; vec4 mv = modelViewMatrix*vec4(position,1.0); vFog = exp(-length(mv.xyz)*0.09); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uGrow, uTime, uI; varying float vD; varying vec3 vC; varying float vFog;
      void main(){ if (vD > uGrow) discard;
        float front = exp(-(uGrow - vD) * 3.0) * smoothstep(0.3, 1.2, vD);
        float pulses = pow(fract(vD * 0.9 - uTime * 2.2), 18.0);
        vec3 col = vC * (0.3 + front * 2.0 + pulses * 1.8) * uI * vFog;
        gl_FragColor = vec4(col, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const traces = new THREE.Mesh(traceGeo, traceMat); traces.frustumCulled = false; board.add(traces);
  // pads / vias (instanced, same growth rule)
  const padGeo = new THREE.CircleGeometry(1, 16); padGeo.rotateX(-Math.PI / 2);
  const padInst = new THREE.InstancedMesh(padGeo, new THREE.ShaderMaterial({
    uniforms: cityUniforms,
    vertexShader: `attribute float aD; varying float vD; varying float vFog; varying vec2 vL;
      void main(){ vD = aD; vL = position.xz; vec4 w = instanceMatrix * vec4(position,1.0); vec4 mv = modelViewMatrix * w; vFog = exp(-length(mv.xyz)*0.09); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uGrow, uTime, uI; varying float vD; varying float vFog; varying vec2 vL;
      void main(){ if (vD > uGrow) discard; float r = length(vL); float ring = smoothstep(1.0, 0.8, r) * (0.6 + 0.4 * smoothstep(0.3, 0.5, r));
        float front = exp(-(uGrow - vD) * 2.0);
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * ring * (0.35 + front * 2.5) * uI * vFog, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), pads.length);
  {
    const m4 = new THREE.Matrix4(), ad = new Float32Array(pads.length);
    pads.forEach((p, i) => { m4.makeScale(p.s, 1, p.s).setPosition(p.x, 0.003, p.z); padInst.setMatrixAt(i, m4); ad[i] = p.d; });
    padInst.geometry.setAttribute('aD', new THREE.InstancedBufferAttribute(ad, 1));
    padInst.frustumCulled = false; board.add(padInst);
  }
  // components = the city's buildings
  const comps = [];
  for (let i = 0; i < 900; i++) {
    const x = (R2() - 0.5) * 18, z = (R2() - 0.5) * 18; const d = Math.hypot(x, z); if (d < 0.6) continue;
    const big = R2() < 0.12;
    comps.push({ x, z, d, w: big ? 0.18 + R2() * 0.3 : 0.03 + R2() * 0.06, l: big ? 0.18 + R2() * 0.3 : 0.015 + R2() * 0.03, h: big ? 0.03 + R2() * 0.05 : 0.01 + R2() * 0.02, rot: R2() < 0.5 ? 0 : Math.PI / 2, lit: big || R2() < 0.35 });
  }
  const compInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: '#1a1c20', metalness: 0.4, roughness: 0.4 }), comps.length);
  const ledInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), comps.length);
  compInst.frustumCulled = ledInst.frustumCulled = false;
  board.add(compInst, ledInst);
  const cm4 = new THREE.Matrix4(), cq = new THREE.Quaternion(), cs = V(1, 1, 1), cp3 = V(0, 0, 0), ledCol = new THREE.Color();
  comps.forEach((c, i) => { ledCol.set(R2() < 0.7 ? '#9cc8ff' : R2() < 0.5 ? '#ffb070' : '#ffffff').multiplyScalar(1.5 + R2() * 2); ledInst.setColorAt(i, ledCol); });

  // =====================================================================================
  // HUD labels
  const hud = ctx.makeHUD();
  // open-matte delivery (?aspect=1 …): keep these labels anchored bottom-left, scaled up to stay legible
  // and lifted clear of the showreel HUD line (identity in the 2.39 frame)
  const SQ = OUTPUT_ASPECT < 1.5, HH = FILM_ASPECT / OUTPUT_ASPECT, UI = SQ ? Math.sqrt(HH) * 1.25 : 1;
  const HX = (dx) => -FILM_ASPECT + dx * UI, HY = (y) => (SQ ? -HH + (1 + y) * UI + 0.3 : y);
  const labels = [
    ['TELEGRAPH · 1837', tTel, tPhone],
    ['TELEPHONE · 1876', tPhone, tRadio],
    ['RADIO · 1895', tRadio, tElec],
    ['ELECTRONICS · 1947', tElec, DUR + 0.2],
  ].map(([txt, a, b]) => {
    const tp = new TextPlane(txt, { font: FONTS.mono, height: 0.036 * UI, letterSpacing: 0.34, color: '#dcecff', intensity: 1.0 });
    tp.position.set(HX(0.16) + tp.worldWidth / 2, HY(-0.82), 0); hud.scene.add(tp);
    return { tp, a, b };
  });
  const hudRule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfe8ff').multiplyScalar(0.8), transparent: true, toneMapped: false }));
  hud.scene.add(hudRule);

  // =====================================================================================
  // camera rigs
  function makePath(keys) {
    const curve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
    return (t, out) => curve.getPoint(clamp(timeWarp(t, warp), 0, 1), out);
  }
  // shot 2 ends in a pure side view of the lever; shot 3 starts from the SAME relative pose on the handset
  const MATCH_OFF = V(0.02, 0.03, 1.15);
  const camTel = makePath([[tTel, TG.clone().add(V(-0.75, 0.32, 0.55))], [tTel + 0.3, TG.clone().add(V(-0.2, 0.24, 1.0))], [tPhone - 0.08, LEVER_C.clone().add(MATCH_OFF).add(V(-0.01, 0, 0.01))], [tPhone, LEVER_C.clone().add(MATCH_OFF)]]);
  const tgtTel = makePath([[tTel, TG.clone().add(V(-0.3, 0.1, 0.05))], [tTel + 0.3, TG.clone().add(V(0.02, 0.17, 0))], [tPhone - 0.08, LEVER_C.clone().add(V(-0.01, 0, 0))], [tPhone, LEVER_C.clone()]]);
  // shot 3: from the handset side view down onto the dial (dial fills a known angular size at the cut)
  const DIAL_D = 0.42;
  const dialCam = DIAL_W.clone().addScaledVector(DIAL_N, DIAL_D);
  const camPh = makePath([[tPhone, HANDSET_C.clone().addScaledVector(MATCH_OFF, 0.82)], [tPhone + 0.3, HANDSET_C.clone().add(V(0.12, -0.02, 0.8))], [tRadio, dialCam]]);
  const tgtPh = makePath([[tPhone, HANDSET_C.clone()], [tPhone + 0.3, HANDSET_C.clone().lerp(DIAL_W, 0.6)], [tRadio, DIAL_W.clone()]]);
  // shot 4: start with the grille at the same screen size as the dial, fly through it onto the tube top
  const GRILLE_D = DIAL_D * (GR / 0.088);
  const camRd = makePath([[tRadio, grilleC.clone().add(V(0, 0, GRILLE_D))], [tRadio + 0.25, grilleC.clone().add(V(0.035, -0.02, 0.2))], [tRadio + 0.4, grilleC.clone().add(V(0.035, -0.05, -0.08))], [tElec, TUBE_TOP.clone().add(V(0, 0.13, 0))]]);
  const tgtRd = makePath([[tRadio, grilleC.clone()], [tRadio + 0.25, grilleC.clone().add(V(0, -0.1, -0.3))], [tRadio + 0.4, TUBE_TOP.clone().add(V(0, 0, 0.05))], [tElec, TUBE_TOP.clone()]]);
  // shot 5: chip from above (same framing as the tube top), rise over the city, then push into the centre
  const CH_H = 0.13 * (CHIP / 2) / 0.03;
  const camPc = makePath([[tElec, PC.clone().add(V(0, CH_H, 0.0))], [tElec + 0.25, PC.clone().add(V(0, 1.7, 0.3))], [tCity + 0.1, PC.clone().add(V(0.3, 3.4, 3.0))], [DUR - 0.2, PC.clone().add(V(0.1, 1.7, 1.5))], [DUR, PC.clone().add(V(0.0, 0.75, 0.6))]]);
  const tgtPc = makePath([[tElec, PC.clone()], [tElec + 0.25, PC.clone()], [tCity + 0.1, PC.clone().add(V(0, 0, -0.9))], [DUR - 0.2, PC.clone().add(V(0, 0, -0.2))], [DUR, PC.clone()]]);

  // scratch
  const cp = V(0, 0, 0), ct = V(0, 0, 0), up = V(0, 1, 0), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), tan = V(0, 0, 0), side = V(0, 0, 0);
  const dof = { focus: 0.3, range: 0.2, amount: 0.6 };
  const bloom = { strength: 0.7 };

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    const shot = t < tTel ? 1 : t < tPhone ? 2 : t < tRadio ? 3 : t < tElec ? 4 : 5;

    // ---- shot 1: the spark
    const head = sat(timeWarp(t, [[0.0, 0.0], [tSpark, 0.02], [tSpark + 0.2, 0.35], [tTel - 0.12, 1.0]]));
    const hu = Math.max(0.0005, head);
    pulseMat.uniforms.uHead.value = hu;
    pulseMat.uniforms.uI.value = ramp(t, 0.15, tSpark) * (1 - 0.6 * smoothstep(tTel - 0.3, tTel - 0.13, t)) * (1 - smoothstep(tTel - 0.13, tTel - 0.03, t));
    wireCurve.getPointAt(Math.min(1, hu), tmp);
    headGlow.position.copy(tmp); headGlow2.position.copy(tmp);
    const ignite = Math.exp(-Math.max(0, t - 0.25) * 10) * (t > 0.2 ? 1 : 0);
    headGlow.scale.setScalar(0.22 + ignite * 0.25);
    headGlow2.scale.setScalar(0.7 + ignite * 0.4);
    headGlow.visible = headGlow2.visible = t > 0.18 && head < 0.999;
    // micro arcs
    arcLines.visible = headGlow.visible;
    if (arcLines.visible) {
      const fr = Math.floor(T * 40);
      let o = 0;
      for (let a = 0; a < ARCS; a++) {
        const hsd = fr * 13.7 + a * 7.1;
        const dx = hash1(hsd) - 0.5, dy = hash1(hsd + 1) - 0.5, dz = hash1(hsd + 2) - 0.5;
        const L = 0.025 + hash1(hsd + 3) * 0.05;
        let px = tmp.x, py = tmp.y, pz = tmp.z;
        for (let s = 0; s < ARC_SEG; s++) {
          const f = L / ARC_SEG;
          const nx = px + dx * f * 2 + (hash1(hsd + s * 3.1) - 0.5) * f * 1.6;
          const ny = py + dy * f * 2 + (hash1(hsd + s * 5.3) - 0.5) * f * 1.6;
          const nz = pz + dz * f * 2 + (hash1(hsd + s * 7.7) - 0.5) * f * 1.6;
          arcPos[o++] = px; arcPos[o++] = py; arcPos[o++] = pz; arcPos[o++] = nx; arcPos[o++] = ny; arcPos[o++] = nz;
          px = nx; py = ny; pz = nz;
        }
      }
      arcGeo.attributes.position.needsUpdate = true;
    }
    streaks.opacity = 0.4 * (shot === 1 ? ramp(t, 0.35, 0.5) : 0);
    bokeh.tick(t, info); bokeh.u.opacity = shot === 1 ? 0.6 : 0;

    // ---- shot 2: telegraph (key taps: down on the beat at 29.5, double tap 29.75/29.875)
    const press = Math.max(envelope(T, 29.5, 29.66, 0.02, 0.06), envelope(T, 29.75, 29.83, 0.015, 0.04), envelope(T, 29.875, 29.99, 0.015, 0.05));
    lever.rotation.z = -0.055 * press;
    contactGlow.visible = shot === 2 && press > 0.6;
    contactGlow.scale.setScalar(0.08 + 0.1 * press);

    // ---- shot 3: dial winds on the beat (30.0 → 30.35) and returns
    const wind = T < 30.35 ? ease.inOutCubic(sat((T - 30.02) / 0.3)) : 1 - ease.outCubic(sat((T - 30.35) / 0.35));
    if (dial.userData.wheel) dial.userData.wheel.rotation.z = -wind * 2.1;

    // ---- shot 4: tubes warm up, needle sweeps
    const warmUp = ramp(t, tRadio - 0.05, tRadio + 0.4);
    tubes.forEach((tb, i) => { const flick = 0.9 + 0.1 * Math.sin(T * 50 + i * 3.1); tb.fil.material.color.setRGB(1, 0.45, 0.15).multiplyScalar((1.5 + 3 * warmUp) * flick); tb.gl.material.opacity = warmUp * flick; tb.gl2.material.opacity = warmUp; });
    tubeLight.intensity = 0.3 * warmUp;
    radio.userData.needle.rotation.z = 0.9 - 1.8 * ramp(t, tRadio, tElec, ease.inOutSine);
    cloth.material.opacity = 1 - smoothstep(tRadio + 0.2, tRadio + 0.36, t);

    // ---- shot 5: chip die cools from tube-orange to electric white-blue; the city grows
    const cool = ramp(t, tElec + 0.05, tElec + 0.45);
    dieMat.color.setRGB(lerp(1.0, 0.75, cool), lerp(0.6, 0.9, cool), lerp(0.3, 1.0, cool)).multiplyScalar(1.3 + 0.8 * pulse(T, { decay: 5 }));
    chipGlow.material.color.setRGB(lerp(1.0, 0.7, cool), lerp(0.7, 0.88, cool), lerp(0.45, 1.0, cool)).multiplyScalar(1.1);
    cityUniforms.uGrow.value = 0.18 + Math.pow(sat((t - tElec - 0.05) / (DUR - tElec)), 1.6) * 14 + ramp(t, tCity - 0.1, tCity + 0.2) * 1.2;
    cityUniforms.uTime.value = t;
    const g = cityUniforms.uGrow.value;
    comps.forEach((c, i) => {
      const k = ease.outBack(sat((g - c.d) / 0.6));
      cq.setFromAxisAngle(up, c.rot);
      cp3.set(c.x, 0, c.z); cs.set(c.w, c.h * k + 1e-4, c.l);
      cm4.compose(cp3, cq, cs); compInst.setMatrixAt(i, cm4);
      const on = c.lit ? k : 0;
      cp3.set(c.x, c.h * k + 0.004, c.z); cs.set((c.w > 0.15 ? 0.014 : 0.008) * on + 1e-5, 0.004, (c.w > 0.15 ? 0.014 : 0.008) * on + 1e-5);
      cm4.compose(cp3, cq, cs); ledInst.setMatrixAt(i, cm4);
    });
    compInst.instanceMatrix.needsUpdate = true; ledInst.instanceMatrix.needsUpdate = true;

    // ---- visibility per shot (hard match cuts)
    wire.visible = pulseTube.visible = shot <= 2;
    tele.visible = shot <= 2;
    phone.visible = shot === 3;
    radio.visible = shot === 4; tubeLight.visible = shot === 4;
    for (let i = 0; i < radioFront.length; i++) radioFront[i].visible = true;
    board.visible = shot === 5;

    // ---- camera
    if (shot === 1) {
      // race alongside the head: camera slightly behind and to the side of the pulse, looking ahead
      const ug = guideU(Math.max(0, hu - 0.004));
      guide.getPointAt(Math.max(0, ug - 0.006), cp);
      guide.getTangentAt(ug, tan);
      side.crossVectors(tan, up).normalize();
      const wob = Math.sin(t * 7) * 0.02;
      cp.addScaledVector(side, 0.32 + wob).addScaledVector(up, 0.1);
      wireCurve.getPointAt(Math.min(1, hu + 0.02), ct);
      // settle towards the telegraph as the pulse arrives
      const s = smoothstep(tTel - 0.16, tTel, t);
      camTel(tTel, tmp2); cp.lerp(tmp2, s);
      tgtTel(tTel, tmp2); ct.lerp(tmp2, s);
    } else if (shot === 2) { camTel(t, cp); tgtTel(t, ct); }
    else if (shot === 3) { camPh(t, cp); tgtPh(t, ct); }
    else if (shot === 4) { camRd(t, cp); tgtRd(t, ct); }
    else { camPc(t, cp); tgtPc(t, ct); }
    camera.position.copy(cp);
    // the chase camera rides ~0.35 m from the spark: unclamped, its halo sprites fill half the frame as a white
    // blob after the flash hand-over — keep their on-screen size bounded by the viewing distance
    if (headGlow.visible) {
      const dh = cp.distanceTo(headGlow.position);
      headGlow.scale.setScalar(Math.min(headGlow.scale.x, 0.12 + 0.5 * dh + ignite * 0.2));
      headGlow2.scale.setScalar(Math.min(headGlow2.scale.x, 0.25 + 1.0 * dh + ignite * 0.4));
    }
    if (shot === 5 && t < tElec + 0.3) camera.up.set(0, 0, -1).lerp(up, smoothstep(tElec + 0.05, tElec + 0.3, t)).normalize();
    else if (shot === 4 && t > tRadio + 0.4) camera.up.set(0, 0, -1).lerp(up, 1 - smoothstep(tRadio + 0.4, tElec, t)).normalize();
    else camera.up.copy(up);
    camera.lookAt(ct);
    camera.fov = shot === 1 ? 44 + 10 * smoothstep(tSpark, tSpark + 0.2, t) * (1 - smoothstep(tTel - 0.25, tTel, t)) : 30;
    camera.near = shot === 5 ? 0.02 : 0.004;
    camera.updateProjectionMatrix();

    dof.focus = cp.distanceTo(ct);
    dof.range = shot === 1 ? 0.12 : shot === 5 ? 0.6 + g * 0.05 : shot === 4 ? dof.focus * 0.6 : dof.focus * 0.25;
    dof.amount = shot === 1 ? 0.6 : shot === 5 ? 0.45 : shot === 4 ? 0.3 : 0.55;
    bloom.strength = 0.7 + ignite * 0.15;
    rim.intensity = shot === 1 ? 0.9 : shot === 2 ? 1.3 : 3.0;

    // HUD
    labels.forEach(({ tp, a, b }) => { const e = envelope(t, a, b, 0.05, 0.05, ease.linear); tp.opacity = e; tp.reveal = ramp(t, a, a + 0.3, ease.outCubic); });
    const re = envelope(t, tTel, DUR + 0.2, 0.2, 0.1);
    hudRule.material.opacity = re * 0.6; hudRule.visible = re > 0;
    hudRule.scale.set((0.2 + 0.7 * ((t - tTel) / (DUR - tTel))) * UI, UI, 1);
    hudRule.position.set(HX(0.16) + hudRule.scale.x / 2, HY(-0.76), 0);
  }

  // =====================================================================================
  // EXPLORE: the props sit on a walnut desk that fades into the dark (in the film they float in a black
  // limbo — fine through the lens, unfinished from any other angle); the telegraph's return wire runs on
  // off the desk instead of ending in mid-air; the spark's halo is kept to a lens-independent size.
  const deskTex = canvasTex(1024, 1024, (x, w, h) => {
    const src = walnutTex.image;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) x.drawImage(src, i * 256, j * 256, 256, 256);
    x.fillStyle = 'rgba(20,10,5,0.25)'; for (let i = 1; i < 8; i++) x.fillRect(0, i * 128 - 1, w, 2);       // plank seams
    const g = x.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.45, 'rgba(0,0,0,0.5)'); g.addColorStop(0.85, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  });
  // (the fade to the dark lives in alpha too, so specular highlights and reflections fade out with it)
  const deskFade = canvasTex(256, 256, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.5);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9a9a9a'); g.addColorStop(1, '#000000');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }, { srgb: false });
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: deskTex, alphaMap: deskFade, transparent: true, color: '#a08672', roughness: 0.72, metalness: 0, envMapIntensity: 0.12 }));
  desk.rotation.x = -Math.PI / 2; desk.visible = false; scene.add(desk);
  const backRun = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(-2.5, 0.6, -2.4), V(-3.4, 0.95, -3.3), V(-5.5, 1.5, -5.4), V(-9, 2.2, -9)]), 80, 0.013, 8), wireMat);
  backRun.visible = false; tele.add(backRun);
  function explore(t) {
    const shot = t < tTel ? 1 : t < tPhone ? 2 : t < tRadio ? 3 : t < tElec ? 4 : 5;
    desk.visible = shot >= 2 && shot <= 4;
    if (shot === 2) desk.position.set(TG.x + 0.2, TG.y - 0.0008, TG.z - 0.3);
    else if (shot === 3) desk.position.set(PH.x, PH.y - 0.0128, PH.z - 0.3);
    else if (shot === 4) desk.position.set(RD.x, RD.y - 0.0258, RD.z - 0.3);
    backRun.visible = shot <= 2;
    if (headGlow.visible) { headGlow.scale.setScalar(0.05 + ignite(t) * 0.05); headGlow2.scale.setScalar(0.14); }
    // the chase-camera effects (bloomed pulse head, warp-speed streaks) read as a white blob and a spray of
    // sticks in a frozen frame seen from the side: calm them for a look at the wire and coil themselves
    pulseMat.uniforms.uI.value *= 0.35;
    streaks.opacity = 0;
  }
  function exploreEnd() { desk.visible = false; backRun.visible = false; }
  // inside the radio the viewer can orbit right past a valve: its glow sprite at the lens is a frame-filling
  // orange wash — fade each glow as the camera closes on it (update() re-sets the opacities every frame)
  const exP = V(0, 0, 0);
  function explorePosed(cam) {
    if (!radio.visible) return;
    for (const tb of tubes) { nearFade(tb.gl, cam); nearFade(tb.gl2, cam); }
    // …and the fly-through passes just behind the grille: an orbit from there swings the lens into the
    // walnut front panel itself (a frame-filling brown blur) — while the lens is inside the panel's slab the
    // panel and its fittings step aside
    exP.copy(cam.position).sub(RD);
    const inFront = exP.z > RDP / 2 - 0.065 && exP.z < RDP / 2 + 0.05 && Math.abs(exP.x) < RR + 0.05 && exP.y > -0.05 && exP.y < RH0 + RR + 0.05;
    if (inFront) for (let i = 0; i < radioFront.length; i++) radioFront[i].visible = false;
  }
  function nearFade(sp, cam) {
    sp.getWorldPosition(exP);
    sp.material.opacity *= smoothstep(0.05, 0.22, exP.distanceTo(cam.position) - sp.scale.x * 0.5);
  }
  const ignite = (t) => Math.exp(-Math.max(0, t - 0.25) * 10) * (t > 0.2 ? 1 : 0);

  return { scene, camera, update, hud, dof, bloom, exposure: 1, background: BG, explore, exploreEnd, explorePosed, exploreLimits: { zoomOut: 3 } };
}
