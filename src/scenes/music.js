// MUSIC: BACH, MOZART, BEETHOVEN (story 30.5 – 37.0 s, after the Scientific Revolution, dissolving into
// the Industrial Revolution). One continuous camera move through a candle-lit Baroque / Classical music
// room that opens into a concert hall. The soundtrack plays the real themes at the cues; the picture
// plays with them — every pulse below lands on a note of the melody:
//   musicHall  30.6  the room: candlelight, the organ façade glowing behind
//   bach       31.0  Cello Suite No. 1, Prelude (G2 D3 B3 A3 B3 D3 B3 D3 ×2, 16ths every 0.125 s):
//                    the bow crosses to the sounding string, that string blurs, its notehead lights on
//                    the manuscript, the organ's pipes breathe with it
//   stradivari 32.4  a Stradivari violin on a stand: flamed maple back, varnish, purfling
//   mozart     33.0  Eine kleine Nachtmusik (G · D G · D G D G B D): the fortepiano's keys go down,
//                    its hammers strike, the struck strings glow, the score's noteheads light
//   beethoven  35.0  the 1820s grand and the Ninth's finale ('Ode to Joy', quarters every 0.25 s)
//   odeToJoy   35.6  the camera rises over the piano as the hall fills with light: rows of music stands
//                    light in a wave on each beat, the choir stands in silhouette against the glow
import * as THREE from 'three';
import { CUES, OUTPUT_ASPECT } from '../timeline.js';
import { clamp, sat, lerp, smoothstep, ease, ramp, envelope, timeWarp, rng, TAU } from '../lib/math.js';
import { TextPlane, FONTS } from '../lib/text.js';
import { glowSprite, lightShaft } from '../lib/materials.js';
import { Dust } from '../lib/particles.js';
import { noise2 } from '../lib/noise.js';
import * as A from './music-assets.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// local fallbacks (seconds from the segment start) when the film has no such cue
const FALLBACK = { musicHall: 0.1, bach: 0.5, stradivari: 1.9, mozart: 2.5, beethoven: 4.5, odeToJoy: 5.1 };
// the melodies, as the score plays them (story-second offsets from each theme's cue)
// Bach in D: D3 A3 F#4 E4 F#4 A3 F#4 A3 | D3 B3 G4 F#4 G4 B3 G4 B3 — D3 stopped on the G string, A3 / B3 on the D
// string, the upper notes on the A string (cello strings C G D A = 0..3)
const BACH = { off: [...Array(16)].map((_, k) => k * 0.125), str: [1, 2, 3, 3, 3, 2, 3, 2, 1, 2, 3, 3, 3, 2, 3, 2] };
// Mozart transposed to D (as the soundtrack plays it): D5 A4 D5 A4 D5 A4 D5 F#5 A5
const MOZART = { off: [0, 0.375, 0.5, 0.875, 1.0, 1.125, 1.25, 1.375, 1.5], midi: [74, 69, 74, 69, 74, 69, 74, 78, 81] };
// Ode to Joy: quarter = 0.18 s story; the last bar F#. E | E (dotted quarter, eighth, half)
const ODE_Q = 0.18, ODE_DUR = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 0.5, 2];
const ODE = { off: ODE_DUR.map((_, k) => ODE_Q * ODE_DUR.slice(0, k).reduce((a, b) => a + b, 0)), midi: [66, 66, 67, 69, 69, 67, 66, 64, 62, 62, 64, 66, 66, 64, 64] };
const WARM = '#ffb45a', CANDLE = '#ffa64a';

// the ring of a struck / bowed note: an attack then an exponential decay (0 before the note)
const ring = (t, t0, decay = 7, attack = 0.012) => (t < t0 - attack ? 0 : t < t0 ? (t - t0 + attack) / attack : Math.exp(-(t - t0) * decay));

export function create(ctx, segment) {
  const lite = ctx.engine?.quality === 'lite';
  A.setDetail(lite);
  const DUR = segment.end - segment.start;
  const cue = (n) => (CUES[n] != null ? CUES[n] - segment.start : FALLBACK[n]);
  const tHall = cue('musicHall'), tBach = cue('bach'), tStrad = cue('stradivari'), tMoz = cue('mozart'), tBee = cue('beethoven'), tOde = cue('odeToJoy');
  const bachT = BACH.off.map((o) => tBach + o), mozT = MOZART.off.map((o) => tMoz + o), odeT = ODE.off.map((o) => tBee + o);
  const SQ = OUTPUT_ASPECT < 1.5;

  const scene = new THREE.Scene();
  scene.environment = ctx.env;
  scene.environmentIntensity = 0.32;
  const FOG0 = new THREE.Color('#080503'), FOG1 = new THREE.Color('#2a1a0c');
  scene.fog = new THREE.FogExp2(FOG0.clone(), 0.075);
  const camera = new THREE.PerspectiveCamera(30, ctx.aspect, 0.03, 120);

  // ---------------------------------------------------------------- materials
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const wood = (seed, dark, light, opt = {}) => A.woodTexture({ seed, dark, light, W: lite ? 256 : 512, H: lite ? 128 : 256, ...opt });
  const mapleTex = wood(5, [96, 36, 12], [196, 112, 50], { figure: 1, rings: 30 });
  const walnutTex = wood(7, [40, 22, 12], [112, 70, 40]);
  const mahogTex = wood(9, [52, 16, 8], [128, 50, 24], { rings: 26 });
  const oakTex = wood(11, [34, 22, 12], [86, 58, 32], { rings: 12 });
  const M = {
    top: phys({ map: A.plateTexture('top', { seed: 2, W: lite ? 256 : 512, H: lite ? 512 : 1024 }), roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.18 }),
    back: phys({ map: A.plateTexture('back', { seed: 3, W: lite ? 256 : 512, H: lite ? 512 : 1024 }), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 }),
    rib: phys({ map: mapleTex, color: '#b87444', roughness: 0.34, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    ebony: std({ color: '#120c09', roughness: 0.3 }),
    bridge: std({ map: wood(13, [170, 130, 84], [222, 190, 140], { rings: 40 }), roughness: 0.7 }),
    string: std({ color: '#e0cfaa', metalness: 1, roughness: 0.28 }),
    bowStick: phys({ color: '#5a2210', roughness: 0.3, clearcoat: 0.7 }),
    pearl: phys({ color: '#efe8da', roughness: 0.15, iridescence: 1, iridescenceIOR: 1.6 }),
    silver: std({ color: '#d9d9de', metalness: 1, roughness: 0.25 }),
    ivory: std({ color: '#d6c8a8', roughness: 0.42 }),
    hair: std({ color: '#b8ae9c', roughness: 0.95 }),
    walnut: phys({ map: walnutTex, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.25 }),
    mahogany: phys({ map: mahogTex, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    caseDark: std({ color: '#1a0f08', roughness: 0.7 }),
    leather: std({ color: '#d4b68e', roughness: 0.9 }),
    brass: std({ color: '#d2a258', metalness: 1, roughness: 0.3 }),
    tin: std({ color: '#b5a78e', metalness: 1, roughness: 0.34 }),
    mouth: new THREE.MeshBasicMaterial({ color: '#050302' }),
    organCase: std({ map: oakTex, color: '#b09070', roughness: 0.62 }),
    wax: std({ color: '#f1e6cc', roughness: 0.6, emissive: '#ff9a40', emissiveIntensity: 0.08 }),
  };
  M.ebony.userData.noBatch = false;

  // ---------------------------------------------------------------- the room
  const room = new THREE.Group(); scene.add(room);
  // parquet floor: planks in courses, every plank its own tone (no repeat the camera can find)
  const floorTex = (() => {
    const W = lite ? 512 : 1024, c = A.mkCanvas(W, W), x = c.getContext('2d'), r = rng(31);
    const rows = 16, h = W / rows;
    for (let j = 0; j < rows; j++) {
      let px = -r() * W * 0.3;
      while (px < W) {
        const w = W * (0.18 + r() * 0.42), k = 0.82 + r() * 0.3;
        const g = x.createLinearGradient(px, 0, px + w, 0);
        g.addColorStop(0, `rgb(${92 * k},${56 * k},${30 * k})`); g.addColorStop(0.5, `rgb(${110 * k},${66 * k},${36 * k})`); g.addColorStop(1, `rgb(${86 * k},${52 * k},${28 * k})`);
        x.fillStyle = g; x.fillRect(px, j * h, w, h);
        for (let i = 0; i < 9; i++) { x.strokeStyle = `rgba(40,20,8,${0.1 + r() * 0.12})`; x.lineWidth = 1; x.beginPath(); const yy = j * h + r() * h; x.moveTo(px, yy); x.bezierCurveTo(px + w * 0.3, yy + (r() - 0.5) * 6, px + w * 0.6, yy + (r() - 0.5) * 6, px + w, yy); x.stroke(); }
        x.fillStyle = 'rgba(20,10,4,0.45)'; x.fillRect(px, j * h, 1, h);
        px += w;
      }
      x.fillStyle = 'rgba(20,10,4,0.5)'; x.fillRect(0, j * h, W, 1);
    }
    return A.toTex(c, { repeat: true });
  })();
  floorTex.repeat.set(9, 9);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), std({ map: floorTex, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.9 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(5, 0, -8); floor.receiveShadow = true; room.add(floor);
  // the music room's back wall: damask silk above a panelled wainscot, pilasters, cornice
  const damask = (() => {
    const W = lite ? 256 : 512, c = A.mkCanvas(W, W), x = c.getContext('2d');
    x.fillStyle = '#4a1612'; x.fillRect(0, 0, W, W);
    x.strokeStyle = 'rgba(150,70,40,0.35)'; x.fillStyle = 'rgba(140,60,36,0.28)'; x.lineWidth = W * 0.008;
    const motif = (cx, cy, s) => {
      x.beginPath(); x.moveTo(cx, cy - s); x.bezierCurveTo(cx + s * 0.8, cy - s * 0.6, cx + s * 0.5, cy + s * 0.2, cx, cy + s);
      x.bezierCurveTo(cx - s * 0.5, cy + s * 0.2, cx - s * 0.8, cy - s * 0.6, cx, cy - s); x.fill(); x.stroke();
      x.beginPath(); x.arc(cx, cy, s * 0.25, 0, TAU); x.stroke();
    };
    for (const [cx, cy] of [[W / 2, W / 2], [0, 0], [W, 0], [0, W], [W, W]]) motif(cx, cy, W * 0.22);
    return A.toTex(c, { repeat: true });
  })();
  damask.repeat.set(10, 4);
  const WALL_Z = -3.6, WX0 = -5, WX1 = 4.0, WH = 5.6;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(WX1 - WX0, WH - 1.1), std({ map: damask, roughness: 0.85 }));
  wall.position.set((WX0 + WX1) / 2, 1.1 + (WH - 1.1) / 2, WALL_Z); wall.receiveShadow = true; room.add(wall);
  {
    const g = [], span = WX1 - WX0;
    g.push(A.box(span, 1.1, 0.06, [(WX0 + WX1) / 2, 0.55, WALL_Z + 0.03]), A.box(span, 0.08, 0.12, [(WX0 + WX1) / 2, 1.12, WALL_Z + 0.06]), A.box(span, 0.14, 0.08, [(WX0 + WX1) / 2, 0.07, WALL_Z + 0.07]));
    for (let i = 0; i < 9; i++) g.push(A.rbox(0.9, 0.62, 0.04, 0.015, [WX0 + 0.75 + i * 1.2, 0.58, WALL_Z + 0.08]));
    for (let i = 0; i < 5; i++) {
      const px = WX0 + 0.4 + i * (span - 0.8) / 4;
      g.push(A.box(0.34, WH, 0.16, [px, WH / 2, WALL_Z + 0.08]), A.box(0.46, 0.3, 0.24, [px, 0.15, WALL_Z + 0.1]), A.box(0.46, 0.22, 0.24, [px, WH - 0.4, WALL_Z + 0.1]));
    }
    g.push(A.box(span, 0.3, 0.32, [(WX0 + WX1) / 2, WH - 0.15, WALL_Z + 0.14]), A.box(span, 0.1, 0.42, [(WX0 + WX1) / 2, WH + 0.02, WALL_Z + 0.18]));
    // the arch into the hall: two big pilasters with an entablature at x = WX1
    g.push(A.box(0.4, 5.9, 0.4, [WX1 + 0.05, 2.95, WALL_Z + 0.25]), A.box(0.55, 0.3, 0.55, [WX1 + 0.05, 0.15, WALL_Z + 0.25]), A.box(0.55, 0.3, 0.55, [WX1 + 0.05, 5.75, WALL_Z + 0.25]));
    const wm = new THREE.Mesh(A.merge(g), std({ map: oakTex, color: '#8a6040', roughness: 0.55 })); wm.receiveShadow = true; room.add(wm);
    // gilt mouldings on the panels
    const gl = [];
    for (let i = 0; i < 5; i++) { const px = WX0 + 0.4 + i * (span - 0.8) / 4; gl.push(A.box(0.36, 0.05, 0.2, [px, WH - 0.55, WALL_Z + 0.1]), A.box(0.36, 0.05, 0.2, [px, 0.33, WALL_Z + 0.1])); }
    gl.push(A.box(span, 0.03, 0.34, [(WX0 + WX1) / 2, WH - 0.31, WALL_Z + 0.15]));
    room.add(new THREE.Mesh(A.merge(gl), M.brass));
  }

  // ---------------------------------------------------------------- candlelight
  const flames = [];   // { sprite, p, phase, base }
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc070').multiplyScalar(3), toneMapped: false });
  const flameGeo = new THREE.SphereGeometry(0.008, 8, 6); flameGeo.scale(1, 2.6, 1); flameGeo.translate(0, 0.02, 0);
  function candelabra(p, arms = 3, h = 0.42, scale = 1) {
    const g = new THREE.Group(); g.position.copy(p); g.scale.setScalar(scale);
    const geos = [A.lathe([[0.0, 0], [0.09, 0], [0.095, 0.015], [0.06, 0.03], [0.03, 0.06], [0.022, 0.12], [0.035, 0.15], [0.016, 0.18], [0.016, h - 0.04], [0.03, h - 0.02], [0.022, h], [0.0, h]], 16)];
    const tips = [V(0, h, 0)];
    for (let i = 0; i < arms - 1; i++) {
      const a = (i / (arms - 1)) * Math.PI, dx = Math.cos(a) * 0.16, dz = Math.sin(a) * 0.04;
      geos.push(A.tube([[0, h - 0.12, 0], [dx * 0.5, h - 0.16, dz * 0.5], [dx, h - 0.1, dz], [dx, h - 0.06, dz]], 0.007, 12, 5));
      geos.push(A.bake(A.lathe([[0.0, 0], [0.028, 0.0], [0.03, 0.02], [0.018, 0.025]], 10), [dx, h - 0.06, dz]));
      tips.push(V(dx, h - 0.035, dz));
    }
    geos.push(A.bake(A.lathe([[0.0, 0], [0.03, 0.0], [0.032, 0.02], [0.018, 0.025]], 10), [0, h, 0]));
    const base = new THREE.Mesh(A.merge(geos), M.brass); base.castShadow = true; g.add(base);
    const waxG = [];
    tips.forEach((tp, i) => {
      const ch = 0.14 + (i % 2) * 0.03;
      waxG.push(A.cyl(0.011, 0.012, ch, 10, [tp.x, tp.y + ch / 2, tp.z]));
      const fl = new THREE.Mesh(flameGeo, flameMat); fl.position.set(tp.x, tp.y + ch + 0.004, tp.z); g.add(fl);
      const sp = glowSprite({ color: CANDLE, intensity: 1.0, scale: 0.11 }); sp.position.copy(fl.position).add(V(0, 0.02, 0)); g.add(sp);
      flames.push({ mesh: fl, sprite: sp, phase: flames.length * 1.7, base: 0.11 * scale });
    });
    g.add(new THREE.Mesh(A.merge(waxG), M.wax));
    scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------- 1 · BACH: the cello, the manuscript, the organ
  const bachG = new THREE.Group(); scene.add(bachG);
  const CELLO = V(0, 0, 0);
  const cello = A.stringInstrument({ L: 0.755, rib: 0.12, arch: 0.026, neck: 0.36, kind: 'cello', mats: M, lite });
  const celloRig = new THREE.Group(); celloRig.position.copy(CELLO).add(V(0, 0.36, 0)); celloRig.rotation.set(-0.16, -0.38, 0.05);
  celloRig.add(cello.group); bachG.add(celloRig);
  // endpin to the floor
  bachG.add(new THREE.Mesh(A.rod(V(0, 0.36, -0.06).applyEuler(new THREE.Euler()).add(CELLO), CELLO.clone().add(V(0, 0.0, 0.05)), 0.006, 6), M.silver));
  const celloBlur = A.stringBlur(cello.strings, cello.L); cello.group.add(celloBlur);
  const bowC = A.bow({ len: 0.72, mats: M, lite });
  const bowPivot = new THREE.Group(); cello.group.add(bowPivot); bowPivot.add(bowC);
  // the manuscript of the Prelude on a music stand
  const bachMS = A.manuscript('bach', { W: lite ? 640 : 1024, H: lite ? 876 : 1400, seed: 4 });
  const pageMat = (tex) => std({ map: tex, roughness: 0.82, side: THREE.DoubleSide, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.06 });
  function pageWithNotes(ms, w, color = '#ffd27a') {
    const h = w / ms.aspect;
    const grp = new THREE.Group();
    const pg = new THREE.PlaneGeometry(w, h, 6, 1);
    // a slight curl along the page
    const pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) { const u = pp.getX(i) / (w / 2); pp.setZ(i, 0.012 * w * (u * u)); }
    pg.computeVertexNormals();
    const page = new THREE.Mesh(pg, pageMat(ms.texture)); page.receiveShadow = true; grp.add(page);
    const glowTex = noteGlowTex();
    const n = ms.notes.length;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(w * 0.075, w * 0.075), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), n);
    const o = new THREE.Object3D();
    ms.notes.forEach(([u, v], i) => { const lx = (u - 0.5) * w, ly = (v - 0.5) * h; o.position.set(lx, ly, 0.012 * w * Math.pow(lx / (w / 2), 2) + 0.002); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, new THREE.Color(0, 0, 0)); });
    im.frustumCulled = false;
    grp.add(im);
    return { grp, im, base: new THREE.Color(color), w, h };
  }
  let _ngt = null;
  function noteGlowTex() {
    if (_ngt) return _ngt;
    const c = A.mkCanvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (_ngt = A.toTex(c));
  }
  const bachPage = pageWithNotes(bachMS, 0.4);
  const STAND = V(-0.78, 0, 0.32);
  const standG = new THREE.Group(); standG.position.copy(STAND); standG.rotation.y = 0.42; bachG.add(standG);
  {
    // a Baroque music stand: turned column, tripod scroll feet, a slanted desk with a ledge
    const geos = [
      A.lathe([[0.0, 0.0], [0.03, 0.0], [0.03, 0.04], [0.02, 0.06], [0.016, 0.3], [0.026, 0.33], [0.016, 0.36], [0.014, 0.9], [0.022, 0.92], [0.0, 0.93]], 12),
      A.box(0.46, 0.012, 0.05, [0, 0.92, 0.04], [-0.38, 0, 0]),
      A.box(0.46, 0.5, 0.012, [0, 1.13, -0.04], [-0.38, 0, 0]),
    ];
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + 0.5; geos.push(A.tube([[0, 0.12, 0], [Math.cos(a) * 0.12, 0.06, Math.sin(a) * 0.12], [Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.22], [Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24]], 0.012, 12, 5)); }
    const sm = new THREE.Mesh(A.merge(geos), M.walnut); sm.castShadow = true; standG.add(sm);
    bachPage.grp.position.set(0, 1.14, -0.028); bachPage.grp.rotation.x = -0.38; standG.add(bachPage.grp);
  }
  // the organ façade behind
  const organ = A.organFacade({ mats: { ...M, tin: M.tin, mouth: M.mouth, organCase: M.organCase }, lite });
  organ.group.position.set(-0.6, 0, WALL_Z + 0.75); room.add(organ.group);
  candelabra(V(-1.35, 0, 0.0).add(V(0, 0, 0)), 3, 1.25, 1);   // a floor candelabrum by the stand

  // ---------------------------------------------------------------- 2 · STRADIVARI: the violin on its stand
  const stradG = new THREE.Group(); scene.add(stradG);
  const VIOLIN = V(2.0, 0, 0.5);
  {
    // a small round table (guéridon) on a turned pedestal
    const geos = [
      A.cyl(0.36, 0.36, 0.03, 32, [0, 0.74, 0]), A.cyl(0.37, 0.35, 0.02, 32, [0, 0.715, 0]),
      A.lathe([[0.0, 0.0], [0.05, 0.0], [0.05, 0.03], [0.03, 0.06], [0.024, 0.2], [0.05, 0.3], [0.024, 0.4], [0.03, 0.6], [0.06, 0.66], [0.06, 0.7], [0.0, 0.7]], 14),
    ];
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; geos.push(A.tube([[0, 0.06, 0], [Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16], [Math.cos(a) * 0.26, 0.015, Math.sin(a) * 0.26]], 0.016, 12, 5)); }
    const tm = new THREE.Mesh(A.merge(geos), M.walnut); tm.castShadow = true; tm.receiveShadow = true;
    const tg = new THREE.Group(); tg.position.copy(VIOLIN); tg.add(tm); stradG.add(tg);
    // the violin stand: a slim upright with a padded cradle
    const st = new THREE.Mesh(A.merge([A.cyl(0.01, 0.012, 0.3, 8, [0, 0.9, -0.04]), A.box(0.16, 0.02, 0.05, [0, 0.78, 0.0]), A.box(0.14, 0.01, 0.08, [0, 0.765, 0.0])]), M.ebony);
    tg.add(st);
  }
  const violin = A.stringInstrument({ L: 0.356, rib: 0.031, arch: 0.015, neck: 0.37, kind: 'violin', mats: M, lite });
  const violinRig = new THREE.Group(); violinRig.position.copy(VIOLIN).add(V(0, 0.79, 0.0)); violinRig.rotation.set(-0.12, Math.PI - 0.75, 0);
  violinRig.add(violin.group); stradG.add(violinRig);
  const violinBlur = A.stringBlur(violin.strings, violin.L, '#ffe0a8'); violin.group.add(violinBlur);
  const bowV = A.bow({ len: 0.75, mats: M, lite }); bowV.position.set(VIOLIN.x - 0.3, 0.765, VIOLIN.z + 0.18); bowV.rotation.set(-Math.PI / 2, 0, 0.35); stradG.add(bowV);
  candelabra(V(VIOLIN.x + 0.2, 0.755, VIOLIN.z - 0.24), 3, 0.32, 0.8);

  // ---------------------------------------------------------------- 3 · MOZART: the fortepiano, the quill, the score
  const mozG = new THREE.Group(); scene.add(mozG);
  const FP = V(3.35, 0, 0.0);
  const fp = A.keyboardInstrument({ lo: 29, hi: 89, octW: 0.158, length: 2.1, caseH: 0.25, height: 0.82, mats: { ...M, case: M.walnut, trim: M.ebony }, reversed: true, legs: 'square', lite, lidAngle: 0.42 });
  fp.group.position.copy(FP); fp.group.rotation.y = -0.12; mozG.add(fp.group);
  const mozMS = A.manuscript('mozart', { W: lite ? 640 : 1024, H: lite ? 876 : 1400, seed: 6 });
  const mozPage = pageWithNotes(mozMS, 0.3);
  musicDesk(fp, mozPage, -0.3, 0.2, M.walnut);
  // a music desk: an openwork frame (a lyre-shaped fret) holding the score, set off-centre so the strings
  // the theme strikes stay in view behind it
  function musicDesk(inst, page, dx, h, mat) {
    const g = new THREE.Group(); g.position.set(dx, inst.height + 0.015, inst.deskZ - 0.02); g.rotation.x = -0.28; inst.group.add(g);
    const W = page.w + 0.06, H = page.h * 0.8;
    const geos = [A.box(W, 0.016, 0.03, [0, 0.0, 0.012]), A.box(W, 0.012, 0.012, [0, H, 0]), A.box(0.014, H, 0.012, [-W / 2, H / 2, 0]), A.box(0.014, H, 0.012, [W / 2, H / 2, 0])];
    for (let i = 1; i < 6; i++) { const x = -W / 2 + (i * W) / 6; geos.push(A.tube([[x, 0.01, 0], [x + 0.02 * Math.sin(i * 2), H * 0.5, -0.003], [x, H, 0]], 0.003, 8, 4)); }
    const m = new THREE.Mesh(A.merge(geos), mat); m.castShadow = true; g.add(m);
    page.grp.position.set(0, page.h / 2 + 0.01, 0.01); g.add(page.grp);
    return g;
  }
  // the struck strings' glow (instanced quads along the strings of the notes Mozart's theme plays)
  function stringGlows(inst, notes, color) {
    const uniq = [...new Set(notes)];
    const im = new THREE.InstancedMesh(inst.glowGeo, inst.glowMat, uniq.length);
    const o = new THREE.Object3D();
    uniq.forEach((n, i) => {
      const z0 = inst.zHam + 0.01, z1 = inst.zF - 0.12 - inst.strLen(n);
      o.position.set(inst.keyX(n), inst.sbY + 0.004, (z0 + z1) / 2); o.scale.set(0.012, 1, z0 - z1); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
      im.setColorAt(i, new THREE.Color(0, 0, 0));
    });
    im.frustumCulled = false;
    inst.group.add(im);
    // a spark where the hammer meets the string
    const fl = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: noteGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), uniq.length);
    uniq.forEach((n, i) => { o.position.set(inst.keyX(n), inst.sbY + 0.03, inst.zHam); o.rotation.set(-0.9, 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); fl.setMatrixAt(i, o.matrix); fl.setColorAt(i, new THREE.Color(0, 0, 0)); });
    fl.frustumCulled = false;
    inst.group.add(fl);
    return { im, fl, uniq, color: new THREE.Color(color) };
  }
  const fpGlow = stringGlows(fp, MOZART.midi, '#ffcf8a');
  // the writing table: inkwell, quill, loose sheets
  const desk = new THREE.Group(); desk.position.set(FP.x - 0.98, 0, FP.z - 0.42); desk.rotation.y = 0.25; mozG.add(desk);
  {
    const geos = [A.rbox(0.62, 0.035, 0.42, 0.01, [0, 0.72, 0])];
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) geos.push(A.bake(new THREE.CylinderGeometry(0.012, 0.02, 0.7, 6), [a * 0.27, 0.35, b * 0.17], [b * 0.06, 0, -a * 0.06]));
    const dm = new THREE.Mesh(A.merge(geos), M.walnut); dm.castShadow = true; dm.receiveShadow = true; desk.add(dm);
    const ink = new THREE.Mesh(A.lathe([[0.0, 0], [0.04, 0], [0.042, 0.01], [0.04, 0.045], [0.02, 0.055], [0.014, 0.07], [0.018, 0.075], [0.0, 0.075]], 16), phys({ color: '#20140a', roughness: 0.05, transmission: 0, clearcoat: 1 }));
    ink.position.set(0.16, 0.738, -0.08); desk.add(ink);
    // the quill: a tapered shaft and a feather vane
    const q = new THREE.Group(); q.position.set(0.16, 0.79, -0.08); q.rotation.set(0.0, 0.4, -0.55); desk.add(q);
    q.add(new THREE.Mesh(A.taperTube([[0, -0.03, 0], [0, 0.12, 0], [0.005, 0.28, 0]], (u) => lerp(0.0025, 0.0012, u), 12, 5), M.ivory));
    const vane = new THREE.Shape(); vane.moveTo(0, 0.06); vane.bezierCurveTo(0.035, 0.1, 0.03, 0.22, 0.006, 0.29); vane.lineTo(0, 0.28); vane.bezierCurveTo(-0.012, 0.2, -0.014, 0.1, 0, 0.06);
    const vm = new THREE.Mesh(new THREE.ShapeGeometry(vane, 10), std({ color: '#efe7d6', roughness: 0.9, side: THREE.DoubleSide })); q.add(vm);
    // loose sheets
    const sheet = std({ map: mozMS.texture, roughness: 0.85 });
    [[-0.1, 0.02, 0.2], [-0.06, -0.03, -0.25]].forEach(([sx, sz, r], i) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), sheet); s.rotation.set(-Math.PI / 2, 0, r); s.position.set(sx, 0.7385 + i * 0.001, sz); s.receiveShadow = true; desk.add(s); });
  }
  candelabra(V(FP.x + 0.62, fp.height + 0.0, FP.z - 0.25), 3, 0.32, 0.85);

  // ---------------------------------------------------------------- 4 · BEETHOVEN: the grand, the Ninth, the hall
  const beeG = new THREE.Group(); scene.add(beeG);
  const GP = V(5.75, 0, 0.3);
  const gp = A.keyboardInstrument({ lo: 24, hi: 101, octW: 0.164, length: 2.45, caseH: 0.3, height: 0.86, mats: { ...M, case: M.mahogany, trim: M.brass }, reversed: false, legs: 'turned', lite, lidAngle: 0.5 });
  gp.group.position.copy(GP); gp.group.rotation.y = 0.1; beeG.add(gp.group);
  const beeMS = A.manuscript('beethoven', { W: lite ? 640 : 1024, H: lite ? 876 : 1400, seed: 9 });
  const beePage = pageWithNotes(beeMS, 0.3, '#ffe2a0');
  musicDesk(gp, beePage, 0.26, 0.21, M.mahogany);
  // brass inlay along the case
  const gpGlow = stringGlows(gp, ODE.midi, '#ffe0a0');
  candelabra(V(GP.x - 0.95, 0, GP.z + 0.15), 5, 1.3, 1.0);

  // the hall beyond: floor stage, orchestra stands in arcs, chairs, choir on risers, columns, chandeliers
  const hall = new THREE.Group(); scene.add(hall);
  const HC = V(7.5, 0, -6.4);   // the orchestra's centre
  const standGeo = A.standGeometry(), pageGeo = A.pageGeometry(), chairGeo = A.chairGeometry();
  const seats = [];
  const arcs = lite ? [[2.2, 9], [3.3, 12], [4.4, 14]] : [[2.2, 10], [3.3, 14], [4.4, 17], [5.5, 19]];
  arcs.forEach(([R, n], ai) => {
    for (let i = 0; i < n; i++) {
      const a = lerp(-1.25, 1.25, n > 1 ? i / (n - 1) : 0.5);
      const p = V(HC.x + Math.sin(a) * R, ai * 0.12, HC.z - Math.cos(a) * R * 0.7 + 2.2);
      seats.push({ p, yaw: Math.PI + a * 0.8, d: Math.hypot(p.x - HC.x, p.z - HC.z), ai });
    }
  });
  // risers for the back rows
  hall.add(new THREE.Mesh(A.merge(arcs.map(([R], ai) => A.box(13 - ai, 0.12 * (ai + 1), 0.9, [HC.x, 0.06 * (ai + 1), HC.z - R * 0.7 + 2.2 - 0.1]))), std({ map: oakTex, color: '#6a4a30', roughness: 0.6 })));
  const stands = new THREE.InstancedMesh(standGeo, M.brass, seats.length);
  const pages = new THREE.InstancedMesh(pageGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, side: THREE.DoubleSide }), seats.length);
  const chairs = new THREE.InstancedMesh(chairGeo, std({ map: walnutTex, color: '#a07050', roughness: 0.6 }), seats.length);
  const o = new THREE.Object3D();
  seats.forEach((s, i) => {
    o.position.copy(s.p); o.rotation.set(0, s.yaw, 0); o.scale.setScalar(1); o.updateMatrix(); stands.setMatrixAt(i, o.matrix); pages.setMatrixAt(i, o.matrix);
    o.position.copy(s.p).add(V(Math.sin(s.yaw) * -0.55, 0, Math.cos(s.yaw) * -0.55)); o.updateMatrix(); chairs.setMatrixAt(i, o.matrix);
    pages.setColorAt(i, new THREE.Color(0, 0, 0));
  });
  hall.add(stands, pages, chairs);
  // a candle on every stand (as the orchestras of the day played): one Points draw, colours set per frame
  const lampPos = new Float32Array(seats.length * 3), lampCol = new Float32Array(seats.length * 3);
  seats.forEach((s, i) => { lampPos.set([s.p.x - Math.sin(s.yaw) * 0.06, s.p.y + 1.36, s.p.z - Math.cos(s.yaw) * 0.06], i * 3); });
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.BufferAttribute(lampPos, 3));
  lampGeo.setAttribute('color', new THREE.BufferAttribute(lampCol, 3));
  const lamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({ size: 0.5, vertexColors: true, map: noteGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  lamps.frustumCulled = false; hall.add(lamps);
  // the choir: rows of standing figures on stepped risers behind the orchestra
  const choirRows = lite ? 3 : 4, perRow = lite ? 16 : 22;
  const choir = new THREE.InstancedMesh(A.figureGeometry(lite), std({ color: '#140c08', roughness: 0.75 }), choirRows * perRow);
  const rr = rng(77);
  for (let j = 0; j < choirRows; j++) for (let i = 0; i < perRow; i++) {
    const x = HC.x + (i - (perRow - 1) / 2) * 0.48 + (rr() - 0.5) * 0.08 + (j % 2) * 0.24, z = HC.z - 3.2 - j * 0.7, y = 0.45 + j * 0.42;
    o.position.set(x, y, z); o.rotation.set(0, (rr() - 0.5) * 0.3, 0); o.scale.setScalar(0.92 + rr() * 0.14); o.updateMatrix(); choir.setMatrixAt(j * perRow + i, o.matrix);
  }
  hall.add(choir);
  hall.add(new THREE.Mesh(A.merge([...Array(choirRows)].map((_, j) => A.box(perRow * 0.5 + 1, 0.45 + j * 0.42, 0.7, [HC.x, (0.45 + j * 0.42) / 2, HC.z - 3.2 - j * 0.7]))), std({ map: oakTex, color: '#5a3c26', roughness: 0.6 })));
  // hall architecture: the back wall with a great lunette window glow, columns along the sides
  const hallBackMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uC: { value: new THREE.Color('#ffc890') } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uI; uniform vec3 uC; varying vec2 vUv;
      void main(){
        vec2 P = vUv * vec2(18.0, 11.0);
        // warm plaster, brighter towards the windows; pilasters every 3 m; a cornice; three arched windows
        float win = 0.0, frame = 0.0;
        for (int i = -1; i <= 1; i++) {
          float cx = 9.0 + float(i) * 4.5;
          vec2 q = P - vec2(cx, 0.0);
          float inRect = step(abs(q.x), 0.85) * step(3.2, P.y) * step(P.y, 7.2);
          float inArc = step(length(P - vec2(cx, 7.2)), 0.85);
          float w = max(inRect, inArc);
          float wo = max(step(abs(q.x), 1.05) * step(3.0, P.y) * step(P.y, 7.2), step(length(P - vec2(cx, 7.2)), 1.05));
          frame = max(frame, wo - w);
          vec2 g = abs(fract(vec2(q.x, P.y) / vec2(0.425, 0.5)) - 0.5);
          float mull = smoothstep(0.03, 0.06, min(g.x * 0.425, g.y * 0.5));
          win = max(win, w * mull * (0.85 + 0.15 * sin(P.y * 3.0 + q.x)));
        }
        float pil = 1.0 - smoothstep(0.32, 0.36, abs(fract(P.x / 3.0 + 0.5) - 0.5) * 3.0);
        float cor = smoothstep(8.5, 8.6, P.y) * (1.0 - smoothstep(8.9, 9.0, P.y));
        float glow = exp(-pow(length((P - vec2(9.0, 5.5)) / vec2(9.0, 6.0)), 2.0) * 1.6);
        vec3 wall = uC * (0.15 + 0.34 * glow) * (1.0 + 0.25 * pil) * (1.0 - 0.45 * cor) * (1.0 - 0.6 * frame);
        vec3 c = wall + vec3(1.0, 0.86, 0.62) * win * 1.1;
        gl_FragColor = vec4(c * uI, 1.0); }`,
    depthWrite: true, fog: false,
  });
  const hallBack = new THREE.Mesh(new THREE.PlaneGeometry(18, 11), hallBackMat); hallBack.position.set(HC.x, 5.0, HC.z - 6.6); hall.add(hallBack);
  {
    const colGeo = A.lathe([[0.0, 0], [0.42, 0], [0.42, 0.25], [0.34, 0.3], [0.32, 0.45], [0.28, 0.5], [0.26, 6.2], [0.3, 6.3], [0.36, 6.5], [0.42, 6.6], [0.42, 6.8], [0.0, 6.8]], 16);
    const cols = new THREE.InstancedMesh(colGeo, std({ color: '#d8c8a8', roughness: 0.55 }), lite ? 8 : 12);
    for (let i = 0; i < cols.count; i++) { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2); o.position.set(HC.x + side * 6.4, 0, HC.z + 3.5 - k * 2.6); o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.updateMatrix(); cols.setMatrixAt(i, o.matrix); }
    hall.add(cols);
  }
  // chandeliers: a ring of candle points and a soft core each
  const chand = [];
  const chandPts = [];
  for (let i = 0; i < 5; i++) {
    const p = V(HC.x - 4 + i * 2, 4.3 + (i % 2) * 0.25, HC.z + 0.5 - (i % 2) * 1.5);
    const sp = glowSprite({ color: '#ffcf8a', intensity: 1.4, scale: 1.4 }); sp.position.copy(p); hall.add(sp); chand.push(sp);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; chandPts.push(p.x + Math.cos(a) * 0.5, p.y - 0.1 + (k % 2) * 0.12, p.z + Math.sin(a) * 0.5); }
  }
  const chandGeo = new THREE.BufferGeometry(); chandGeo.setAttribute('position', new THREE.Float32BufferAttribute(chandPts, 3));
  const chandMat = new THREE.PointsMaterial({ color: new THREE.Color('#ffd49a'), size: 0.07, map: noteGlowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const chandP = new THREE.Points(chandGeo, chandMat); hall.add(chandP);
  // shafts of light from the high windows
  const shafts = [];
  for (let i = 0; i < 3; i++) {
    const s = lightShaft({ length: 12, radiusTop: 0.5, radiusBottom: 2.4, color: '#ffd8a0', intensity: 0 });
    s.position.set(HC.x - 3 + i * 3, 9.5, HC.z - 5.5); s.rotation.set(-0.55, 0, (i - 1) * -0.12); hall.add(s); shafts.push(s);
  }

  // ---------------------------------------------------------------- lights (constant count)
  const hemi = new THREE.HemisphereLight('#6a4a2a', '#0a0604', 0.25); scene.add(hemi);
  const key = new THREE.SpotLight('#ffd9a8', 0, 14, 0.5, 0.7, 1.4);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.camera.near = 0.5; key.shadow.camera.far = 12;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#ffb070', 0.7); rim.position.set(2, 4, -8); scene.add(rim);
  const cLights = [V(-1.35, 1.45, 0.0), V(FP.x + 0.62, 1.2, FP.z - 0.2), V(GP.x - 0.95, 1.5, GP.z + 0.15)].map((p) => { const l = new THREE.PointLight(CANDLE, 0, 5, 1.6); l.position.copy(p); scene.add(l); return l; });
  const violinLight = new THREE.PointLight(CANDLE, 0, 3, 1.6); violinLight.position.set(VIOLIN.x + 0.2, 1.1, VIOLIN.z - 0.05); scene.add(violinLight);
  const hallLight = new THREE.DirectionalLight('#ffd8a8', 0); hallLight.position.set(HC.x - 2, 8, HC.z - 8); hallLight.target.position.copy(HC); scene.add(hallLight, hallLight.target);
  const organLight = new THREE.PointLight('#ff9040', 0, 6, 1.5); organLight.position.set(-0.6, 3.0, WALL_Z + 1.6); scene.add(organLight);

  // ---------------------------------------------------------------- dust in the candlelight
  const dust = new Dust({ count: lite ? 700 : 1800, size: [11, 3.2, 4], center: [3.5, 1.4, 0.2], particleSize: 0.01, opacity: 0.45, intensity: 1.2, color: '#ffd8a8', seed: 41 });
  scene.add(dust);

  // ---------------------------------------------------------------- HUD labels
  const hud = ctx.makeHUD();
  const lbl = (s, a, b) => [new TextPlane(s, { font: FONTS.mono, height: 0.034, letterSpacing: 0.32, color: '#ffe0b8', intensity: 0.95, align: 'left' }), a, b];
  const hudItems = [
    lbl('J. S. BACH · CELLO SUITE No. 1 · c. 1720', tBach - 0.1, tStrad - 0.05),
    lbl('STRADIVARI · CREMONA · 1700s', tStrad, tMoz - 0.05),
    lbl('W. A. MOZART · EINE KLEINE NACHTMUSIK · VIENNA 1787', tMoz, tBee - 0.05),
    lbl("L. VAN BEETHOVEN · SYMPHONY No. 9 · 'ODE TO JOY' · 1824", tBee, DUR + 1),
  ];
  const hudRule = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.0025), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(0.8), transparent: true, toneMapped: false }));
  hud.scene.add(hudRule);
  hudItems.forEach(([tp]) => { tp.position.set(-ctx.aspect + 0.16 + tp.worldWidth / 2, 0.84, 0); hud.scene.add(tp); });

  // ---------------------------------------------------------------- camera: one continuous move
  function makePath(keys) {
    const curve = new THREE.CatmullRomCurve3(keys.map((k) => k[1]), false, 'centripetal');
    const warp = keys.map((k, i) => [k[0], i / (keys.length - 1)]);
    return (t, out) => curve.getPoint(clamp(timeWarp(t, warp), 0, 1), out);
  }
  const camPath = makePath([
    [-0.3, V(-2.1, 1.55, 3.1)],
    [tBach, V(-0.62, 1.32, 1.38)],
    [tBach + 0.5, V(-0.48, 1.16, 1.25)],
    [tBach + 1.0, V(-0.28, 0.98, 1.02)],
    [tStrad - 0.05, V(1.0, 1.14, 1.45)],
    [tStrad + 0.3, V(1.6, 1.18, 1.5)],
    [tMoz - 0.05, V(2.4, 1.4, 1.6)],
    [tMoz + 0.9, V(3.2, 1.38, 1.25)],
    [tMoz + 1.55, V(3.9, 1.4, 1.3)],
    [tBee - 0.05, V(5.5, 1.42, 1.85)],
    [tBee + 0.4, V(5.85, 1.5, 1.9)],
    [tOde + 0.45, V(6.6, 2.3, 2.6)],
    [DUR + 0.3, V(7.6, 3.3, 3.1)],
  ]);
  const tgtPath = makePath([
    [-0.3, V(-0.6, 1.45, -1.0)],
    [tBach, V(-0.74, 1.1, 0.3)],
    [tBach + 0.5, V(-0.42, 0.98, 0.12)],
    [tBach + 1.0, V(-0.06, 0.84, 0.0)],
    [tStrad - 0.05, V(VIOLIN.x - 0.05, 1.0, VIOLIN.z)],
    [tStrad + 0.3, V(VIOLIN.x + 0.1, 1.0, VIOLIN.z - 0.05)],
    [tMoz - 0.05, V(FP.x - 0.15, 0.95, FP.z - 0.2)],
    [tMoz + 0.9, V(FP.x, 0.88, FP.z - 0.2)],
    [tMoz + 1.55, V(FP.x + 0.25, 0.88, FP.z - 0.3)],
    [tBee - 0.05, V(GP.x, 0.95, GP.z - 0.35)],
    [tBee + 0.4, V(GP.x + 0.1, 0.98, GP.z - 0.5)],
    [tOde + 0.45, V(GP.x + 1.0, 1.5, GP.z - 3.2)],
    [DUR + 0.3, V(HC.x + 0.1, 2.1, HC.z - 2.0)],
  ]);
  const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
  const dof = { focus: 2, range: 1.2, amount: 0.5 };
  const bloom = { strength: 0.6 };

  // ---------------------------------------------------------------- update
  const _c = new THREE.Color(), _o = new THREE.Object3D();
  const sumRing = (t, times, filter, decay) => { let s = 0; times.forEach((t0, i) => { if (!filter || filter(i)) s += ring(t, t0, decay); }); return Math.min(1.4, s); };
  function lightNotes(page, t, times, kHit = 3.6) {
    times.forEach((t0, i) => {
      if (i >= page.im.count) return;
      const hit = ring(t, t0, 5), after = t >= t0 ? 0.4 : 0;
      _c.copy(page.base).multiplyScalar(after + hit * kHit);
      page.im.setColorAt(i, _c);
    });
    page.im.instanceColor.needsUpdate = true;
  }
  function playKeys(inst, glow, t, times, midi) {
    // reset every key the theme uses, then pose each from its latest strike
    const uniq = glow.uniq;
    uniq.forEach((n, gi) => {
      let down = 0, ham = 0, amp = 0;
      times.forEach((t0, i) => {
        if (midi[i] !== n) return;
        const dt = t - t0;
        // key: down from 15 ms before the hammer hits until released ~0.2 s later
        if (dt > -0.03 && dt < 0.22) down = Math.max(down, dt < -0.0 ? (dt + 0.03) / 0.03 : 1 - smoothstep(0.16, 0.22, dt));
        // hammer: flies up, strikes, falls back
        if (dt > -0.03 && dt < 0.16) ham = Math.max(ham, dt < 0 ? (dt + 0.03) / 0.03 : Math.exp(-dt * 22));
        amp += ring(t, t0, 4.5);
      });
      inst.pose(n, down, ham);
      _c.copy(glow.color).multiplyScalar(Math.min(1.5, amp) * 1.6);
      glow.im.setColorAt(gi, _c);
      _c.copy(glow.color).multiplyScalar(ham * 2.2);
      glow.fl.setColorAt(gi, _c);
    });
    inst.kW.instanceMatrix.needsUpdate = inst.kB.instanceMatrix.needsUpdate = inst.hm.instanceMatrix.needsUpdate = true;
    glow.im.instanceColor.needsUpdate = glow.fl.instanceColor.needsUpdate = true;
  }
  // the bow over the cello: crosses to the sounding string just before each note, strokes back and forth
  function bowPose(t) {
    // string angle: ease from the previous note's string to this one in the 40 ms before it sounds
    const angOf = (s) => cello.strings[s].angle;
    let ang = angOf(1);
    for (let i = 0; i < bachT.length; i++) {
      const t0 = bachT[i];
      if (t < t0 - 0.045) break;
      const prev = i ? angOf(BACH.str[i - 1]) : angOf(1);
      ang = lerp(prev, angOf(BACH.str[i]), ease.inOutSine(sat((t - (t0 - 0.045)) / 0.045)));
    }
    if (t > bachT[15] + 0.3) ang = lerp(ang, angOf(1) * 0.3, sat((t - bachT[15] - 0.3) / 0.4));
    // stroke: a down-bow over the first half-bar, an up-bow over the second (the bow's contact point
    // slides along its hair); drifting slowly before and after
    const tb = t - tBach;
    const half = 8 * 0.125;
    const ph = tb < 0 ? tb / half : tb > 2 * half ? 2 + (tb - 2 * half) / (half * 2) : tb / half;
    const stroke = Math.abs(((ph % 2) + 2) % 2 - 1);                // 0 → 1 → 0 …
    const along = lerp(0.12, 0.6, ease.inOutSine(1 - stroke));      // contact point along the hair (frog → tip)
    // contact: between bridge and fingerboard, on the string arc
    const yC = cello.L * 0.53, R = cello.archR, zTop = cello.bridgeTopZ - cello.L * 0.012;
    bowPivot.position.set(Math.sin(ang) * R * 0.0, yC, zTop + 0.004);
    bowPivot.rotation.set(0, ang * -1.0, 0);
    bowPivot.rotateZ(-0.06);
    bowC.position.set(-0.72 * along, 0.0, 0);
    // tilt the hair so its flat faces the strings
    bowC.rotation.set(Math.PI / 2 - 0.3, 0, 0);
  }

  function update(t, info) {
    const T = info?.T ?? t + segment.start;
    // camera
    camPath(t, camPos); tgtPath(t, camTgt);
    // a gentle handheld breath
    camPos.y += 0.006 * Math.sin(t * 1.3); camPos.x += 0.004 * Math.sin(t * 0.9 + 1);
    camera.position.copy(camPos); camera.lookAt(camTgt);
    camera.fov = lerp(30, 34, smoothstep(tOde, DUR, t)) - 4 * envelope(t, tStrad - 0.25, tMoz - 0.05, 0.25, 0.3);
    camera.updateProjectionMatrix();

    // visibility per section (VR/AR: off-shot sets go dark)
    bachG.visible = t < tMoz + 0.4;
    stradG.visible = t > tBach && t < tBee;
    mozG.visible = t > tStrad - 0.6;
    beeG.visible = t > tMoz + 0.3;
    hall.visible = t > tMoz + 0.8;
    organ.group.visible = t < tBee - 0.2;

    // --- Bach
    const amps = [0, 0, 0, 0];
    for (let i = 0; i < bachT.length; i++) amps[BACH.str[i]] += ring(t, bachT[i], 6.5) * (i % 8 === 0 ? 1.2 : 0.9);
    celloBlur.material.uniforms.uAmp.value.set(amps[0], Math.min(1.3, amps[1]), Math.min(1.3, amps[2]), Math.min(1.3, amps[3]));
    celloBlur.material.uniforms.uT.value = t;
    bowPose(t);
    lightNotes(bachPage, t, bachT);
    const organBreath = sumRing(t, bachT, null, 4) * 0.35;
    organ.glow.material.uniforms.uI.value = 0.6 * (0.45 + organBreath) * ramp(t, -0.3, tBach) * (1 - smoothstep(tMoz, tBee, t)) + 0.25;
    organLight.intensity = (1.0 + 1.6 * organBreath) * (1 - smoothstep(tMoz, tBee, t));
    // --- Stradivari: its strings answer the cello sympathetically
    const sym = sumRing(t, bachT, (i) => BACH.str[i] >= 2, 3) * 0.25 * smoothstep(tStrad - 0.6, tStrad, t);
    violinBlur.material.uniforms.uAmp.value.set(sym * 0.5, sym, sym * 0.8, sym * 0.3);
    violinBlur.material.uniforms.uT.value = t;
    // --- Mozart
    playKeys(fp, fpGlow, t, mozT, MOZART.midi);
    lightNotes(mozPage, t, mozT);
    // --- Beethoven
    playKeys(gp, gpGlow, t, odeT, ODE.midi);
    lightNotes(beePage, t, odeT);
    // the hall fills with light from the Ode; the stands light in a wave from the centre, a pulse on each beat
    const hallOn = ramp(t, tOde - 0.3, tOde + 0.9, ease.inOutSine);
    const beatPulse = sumRing(t, odeT.filter((x) => x >= tOde - 0.01), null, 5);
    seats.forEach((s, i) => {
      const k = sat((t - tOde - s.d * 0.08) / 0.35);
      _c.setRGB(1.0, 0.82, 0.55).multiplyScalar(k * (0.9 + 0.5 * beatPulse));
      pages.setColorAt(i, _c);
      lampCol[i * 3] = _c.r * 1.25; lampCol[i * 3 + 1] = _c.g * 1.05; lampCol[i * 3 + 2] = _c.b * 0.8;
    });
    pages.instanceColor.needsUpdate = true; lampGeo.attributes.color.needsUpdate = true;
    hallBackMat.uniforms.uI.value = 0.05 + 1.1 * hallOn;
    chand.forEach((sp, i) => { sp.material.opacity = sat(hallOn * 1.4 - i * 0.08); sp.visible = sp.material.opacity > 0.01; });
    chandMat.opacity = hallOn;
    shafts.forEach((s, i) => { s.material.uniforms.uIntensity.value = 0.14 * hallOn * (0.8 + 0.2 * Math.sin(i * 2 + t)); s.material.uniforms.uTime.value = t; });
    hallLight.intensity = 2.2 * hallOn;
    scene.fog.color.copy(FOG0).lerp(FOG1, hallOn * 0.45);
    scene.fog.density = lerp(0.075, 0.045, hallOn);
    hemi.intensity = 0.25 + 0.45 * hallOn;

    // --- candles flicker (deterministic)
    flames.forEach((f, i) => {
      const fl = 0.85 + 0.15 * noise2(t * 6 + f.phase, i * 3.1);
      f.mesh.scale.set(1, fl, 1);
      f.sprite.scale.setScalar(f.base * (0.9 + 0.2 * fl));
    });
    const flick = (k) => 0.88 + 0.12 * noise2(t * 5 + k * 7, k);
    cLights[0].intensity = 3.2 * flick(1) * (1 - smoothstep(tMoz, tMoz + 0.8, t));
    cLights[1].intensity = 2.6 * flick(2) * smoothstep(tStrad - 0.4, tMoz, t) * (1 - smoothstep(tBee + 0.3, tBee + 1, t));
    cLights[2].intensity = 3.2 * flick(3) * smoothstep(tMoz + 1.0, tBee, t);
    violinLight.intensity = 1.6 * flick(4) * envelope(t, tBach + 0.3, tMoz + 0.8, 0.5, 0.5);

    // --- the key light follows the subject (one shadow map)
    const sub = t < tStrad - 0.25 ? 0 : t < tMoz - 0.1 ? 1 : t < tBee - 0.1 ? 2 : 3;
    const keyAt = [V(-0.3, 0.9, 0.0), VIOLIN.clone().add(V(0, 1.0, 0)), FP.clone().add(V(0, 0.85, -0.4)), GP.clone().add(V(0, 0.9, -0.6))];
    const kk = [sat((t - (tStrad - 0.6)) / 0.6), sat((t - (tMoz - 0.5)) / 0.6), sat((t - (tBee - 0.5)) / 0.6)];
    const kt = keyAt[0].clone().lerp(keyAt[1], ease.inOutSine(kk[0])).lerp(keyAt[2], ease.inOutSine(kk[1])).lerp(keyAt[3], ease.inOutSine(kk[2]));
    key.target.position.copy(kt);
    key.position.copy(kt).add(V(-1.6, 3.2, 2.2));
    key.intensity = 26 * (sub === 3 ? 1 + 0.4 * hallOn : 1);
    key.angle = sub >= 2 ? 0.55 : 0.42;

    // --- dust, bloom, dof, exposure
    dust.tick(t, info);
    const subPos = [CELLO.clone().add(V(0, 0.82, 0.05)), VIOLIN.clone().add(V(0, 1.0, 0)), FP.clone().add(V(0, 0.95, -0.2)), GP.clone().add(V(0, 1.0, -0.3))];
    const fTo = (p) => camera.position.distanceTo(p);
    dof.focus = sub === 3 && t > tOde ? lerp(fTo(subPos[3]), fTo(HC), ramp(t, tOde, tOde + 1.0)) : fTo(subPos[sub]);
    if (sub === 0) dof.focus = lerp(fTo(STAND.clone().add(V(0, 1.14, 0))), fTo(subPos[0]), ramp(t, tBach + 0.45, tBach + 0.9));
    dof.range = sub === 1 ? 0.35 : 0.8 + hallOn * 3;
    dof.amount = 0.55 - 0.3 * hallOn;
    bloom.strength = 0.55 + 0.25 * hallOn;
    out.exposure = 1 + 0.15 * hallOn;

    // --- HUD
    hudItems.forEach(([tp, a, b]) => { const e = envelope(t, a, b, 0.2, 0.2); tp.opacity = e; tp.reveal = ramp(t, a, a + 0.45, ease.outCubic); });
    const ruleE = envelope(t, tBach - 0.2, DUR + 1, 0.4, 0.3);
    hudRule.material.opacity = ruleE * 0.6; hudRule.visible = ruleE > 0;
    hudRule.scale.x = 0.9 * ramp(t, tBach - 0.2, tBach + 0.4, ease.outCubic);
    hudRule.position.set(-ctx.aspect + 0.16 + hudRule.scale.x / 2, 0.79, 0);
  }

  // AR: name the subject the vitrine should hold
  const arSubject = (t) => {
    if (t < tStrad - 0.2) return { centre: CELLO.clone().add(V(-0.3, 0.85, 0)), radius: 0.9 };
    if (t < tMoz - 0.1) return { centre: VIOLIN.clone().add(V(0, 0.95, 0)), radius: 0.4 };
    if (t < tBee - 0.1) return { centre: FP.clone().add(V(0, 0.7, -0.7)), radius: 1.3 };
    if (t < tOde + 0.4) return { centre: GP.clone().add(V(0, 0.7, -0.8)), radius: 1.5 };
    return { centre: GP.clone().add(V(0.8, 1.0, -3.5)), radius: 5.0 };
  };
  const out = { scene, camera, update, hud, dof, bloom, exposure: 1, harmony: 1, background: 0x050302, arSubject, exploreLimits: { yaw: 1.1, pitchDown: 0.35, pitchUp: 0.8, zoomIn: 0.35, zoomOut: 2.2 } };
  return out;
}
