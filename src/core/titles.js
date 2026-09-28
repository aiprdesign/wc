// Chapter titles: one consistent motion-graphics layer drawn over every sequence.
// Each chapter gets an era line, a kinetic heading and one line of story; a few
// story-only cards carry the narrative between chapters. Pure function of time.
import * as THREE from 'three';
import { SEGMENTS, CUES, OUTPUT_ASPECT, warmthAt } from '../timeline.js';
import { KineticText, TextPlane, FONTS } from '../lib/text.js';
import { progressLine, segmentsLine } from '../lib/lines.js';
import { ramp, ease, sat, lerp } from '../lib/math.js';

// Headings per segment. Dates are the milestones each chapter shows.
const CHAPTERS = {
  classical:   { n: 'I',    era: 'c. 500 BC — AD 400',          heading: 'THE FOUNDATIONS',        story: 'Athens and Rome gave the world proportion, engineering and the citizen.' },
  civic:       { n: 'II',   era: '507 BC · 1215 · 1689',        heading: 'THE RULE OF LAW',        story: 'From the Athenian assembly to parliament: power answerable to the people.' },
  renaissance: { n: 'III',  era: '1400 — 1600',                 heading: 'THE REBIRTH',            story: 'Artists became scientists, and learned to see the world anew.' },
  science:     { n: 'IV',   era: '1543 — 1704',                 heading: 'THE AGE OF REASON',      story: 'Copernicus, Galileo, Newton: the universe became knowable.' },
  industrial:  { n: 'V',    era: '1769 — 1900',                 heading: 'THE AGE OF MACHINES',    story: 'Steam and steel multiplied human strength a thousandfold.' },
  electricity: { n: 'VI',   era: '1831 — 1947',                 heading: 'THE CONNECTED WORLD',    story: 'Lightning, tamed, carried the human voice across oceans.' },
  medicine:    { n: 'VII',  era: '1543 · 1796 · 1895 · 1928',   heading: 'THE GIFT OF LIFE',       story: 'Anatomy, vaccines and antibiotics gave billions longer lives.' },
  flight:      { n: 'VIII', era: '1903 — 1961',                 heading: 'THE CONQUEST OF THE SKY', story: 'Within one lifetime, from wooden wings to orbit.' },
  moonshot:    { n: 'IX',   era: '1969',                        heading: null,                     story: null }, // the sequence carries its own title
  computing:   { n: 'X',    era: '1822 — TODAY',                heading: 'THE DIGITAL REVOLUTION', story: 'Machines that calculate became machines that learn.' },
  knowledge:   { n: 'XI',   era: '1450 — TODAY',                heading: 'THE SHARED MIND',        story: 'From the printing press to the internet: knowledge set free.' },
};

// The one word that defines each chapter — shown huge, SaaS-keynote style, before the heading.
const CONCEPT = {
  classical: 'Order.', civic: 'Law.', renaissance: 'Beauty.', science: 'Reason.', industrial: 'Power.',
  electricity: 'Connection.', medicine: 'Life.', flight: 'Flight.', moonshot: 'One giant leap.',
  computing: 'Intelligence.', knowledge: 'Knowledge.',
};
// Montage: rapid word swaps locked to the shape morphs.
const SWAPS = [['mColumns', 'Order.'], ['mGears', 'Motion.'], ['mOrbits', 'Orbits.'], ['mAtoms', 'Atoms.'], ['mCircuit', 'Circuits.'], ['mStars', 'Stars.']];

// Showreel breakdown: the craft each chapter demonstrates.
const TECHNIQUE = {
  opening: 'PROCEDURAL LINEWORK · 2.5D LAYERING · PARTICLE TYPOGRAPHY',
  classical: 'PROCEDURAL MODELLING · LOOK-DEV · ARCHVIZ · TECHNICAL HUD',
  civic: 'KINETIC TYPOGRAPHY · PROCEDURAL FOLDING · MORPHING',
  renaissance: 'PROCEDURAL DRAWING · 2D → 3D · PARTICLE SIMULATION',
  science: 'SPEED RAMPING · SCIENTIFIC VISUALISATION · REFRACTION',
  industrial: 'HARD-SURFACE · MECHANICAL RIGGING · SMOKE · SOUND SYNC',
  electricity: 'MATCH CUTS · ENERGY FX · PROCEDURAL CIRCUIT GROWTH',
  medicine: 'MICRO CINEMATOGRAPHY · HOLOGRAPHIC UI · DATA VIZ',
  flight: 'BLUEPRINT FOLD · ATMOSPHERICS · PLANETARY SHADING',
  moonshot: 'LUNAR SHADING · HARD LIGHT · DUST FX · INTERFACE ANIMATION',
  computing: 'HARD-SURFACE MORPHS · DATA FLOW · UI ANIMATION',
  knowledge: 'INSTANCED CHOREOGRAPHY · MULTI-STAGE MORPHS · NETWORKS',
  montage: 'SHAPE-DRIVEN MATCH CUTS · RHYTHM EDITING',
};

// Story-only cards between chapters (global seconds).
const INTERLUDES = [
  { start: 1.25, end: 3.0, text: 'Every achievement begins as an idea.' },
  { start: 49.9, end: 54.2, text: 'Standing on the shoulders of giants.', cite: 'ISAAC NEWTON · 1675', low: true },
];

const WARM = new THREE.Color('#ffe2b0'), COOL = new THREE.Color('#dbe8ff');

// Small text that can change every frame (timecode, counters); redraws only when the string changes.
class LiveText extends THREE.Mesh {
  constructor({ height = 0.03, chars = 16, align = 'left', font = FONTS.mono, spacing = 0.18 } = {}) {
    const size = 64, c = document.createElement('canvas');
    c.width = Math.ceil(chars * size * (0.62 + spacing)); c.height = Math.ceil(size * 1.5);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter;
    const w = height * c.width / size, h = height * c.height / size;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(align === 'left' ? w / 2 : align === 'right' ? -w / 2 : 0, 0, 0);
    super(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    Object.assign(this, { c, ctx: c.getContext('2d'), tex, size, align, font, spacing, str: null });
  }
  set(str, color, opacity, gain = 1.2) {
    this.material.color.copy(color).multiplyScalar(gain);
    this.material.opacity = opacity; this.visible = opacity > 0.003;
    if (str === this.str) return;
    this.str = str;
    const { ctx, c, size } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `400 ${size}px "${this.font}"`; ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    const adv = (ch) => ctx.measureText(ch).width + this.spacing * size;
    const total = [...str].reduce((a, ch) => a + adv(ch), 0);
    let x = this.align === 'left' ? 4 : this.align === 'right' ? c.width - total - 4 : (c.width - total) / 2;
    for (const ch of str) { ctx.fillText(ch, x, c.height / 2); x += adv(ch); }
    this.tex.needsUpdate = true;
  }
}

const tc = (T) => { const s = Math.floor(T), f = Math.floor((T - s) * 30); return `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };

export class TitleLayer {
  constructor() {
    const a = OUTPUT_ASPECT;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-a, a, 1, -1, -10, 10);
    // In tall formats the block sits higher (the open-matte area above the action is free).
    const square = a < 1.9;
    this.y = square ? 0.72 : 0.7;
    this.scale = square ? 1.0 : 0.92;
    this.cards = [];
    this.words = [];
    for (const seg of SEGMENTS) {
      const c = CHAPTERS[seg.id];
      if (false && CONCEPT[seg.id]) this.words.push(this.makeWord(CONCEPT[seg.id], seg.start + 0.28, seg.start + 1.55, c?.n, seg));
      if (!c || !c.heading) continue;
      this.cards.push(this.makeCard(seg, c));
    }
    if (false) SWAPS.forEach(([cue, w], i) => {
      const t = CUES[cue], next = SWAPS[i + 1] ? CUES[SWAPS[i + 1][0]] : CUES.pullBack - 0.15;
      this.words.push(this.makeWord(w, t - 0.05, next - 0.05, null, SEGMENTS.find((sg) => sg.id === 'montage'), { swap: true }));
    });
    this.interludes = INTERLUDES.map((d) => this.makeInterlude(d));
    this.makeReel(a);
  }

  // Persistent showreel frame: corner marks, timecode, chapter counter, technique tag, progress rail,
  // plus graphic line sweeps at every chapter change.
  makeReel(a) {
    const reel = new THREE.Group();
    this.reel = reel; this.scene.add(reel);
    const mx = a - 0.07, my = 0.93, L = 0.07, V = (x, y) => new THREE.Vector3(x, y, 0);
    this.corners = segmentsLine([
      [V(-mx, my - L), V(-mx, my)], [V(-mx, my), V(-mx + L, my)], [V(mx - L, my), V(mx, my)], [V(mx, my), V(mx, my - L)],
      [V(mx, -my + L), V(mx, -my)], [V(mx, -my), V(mx - L, -my)], [V(-mx + L, -my), V(-mx, -my)], [V(-mx, -my), V(-mx, -my + L)],
    ], { color: '#ffffff', intensity: 0.9, orderFn: () => 0, stagger: 0 });
    reel.add(this.corners);
    const top = my - 0.005, bot = -my + 0.035;
    this.tcText = new LiveText({ height: 0.03, chars: 12, align: 'right' }); this.tcText.position.set(mx - 0.005, top - 0.035, 0);
    this.idxText = new LiveText({ height: 0.03, chars: 26, align: 'left' }); this.idxText.position.set(-mx + 0.005, top - 0.035, 0);
    this.techText = new LiveText({ height: 0.026, chars: 64, align: 'left', spacing: 0.2 }); this.techText.position.set(-mx + 0.005, bot + 0.035, 0);
    this.rtText = new LiveText({ height: 0.026, chars: 20, align: 'right', spacing: 0.2 }); this.rtText.position.set(mx - 0.005, bot + 0.035, 0);
    reel.add(this.tcText, this.idxText, this.techText, this.rtText);
    // progress rail with chapter ticks
    const railW = mx * 2 - 0.01;
    this.rail = progressLine([V(-railW / 2, bot, 0), V(railW / 2, bot, 0)], { color: '#ffffff', intensity: 0.35, head: 0.001 });
    this.railFill = progressLine([V(-railW / 2, bot, 0), V(railW / 2, bot, 0)], { color: '#ffffff', intensity: 1.6, head: 0.004 });
    const ticks = SEGMENTS.slice(1).map((sg) => { const x = -railW / 2 + railW * (sg.start + 0.25) / SEGMENTS.at(-1).end; return [V(x, bot - 0.012), V(x, bot + 0.012)]; });
    this.ticks = segmentsLine(ticks, { color: '#ffffff', intensity: 0.6, orderFn: () => 0, stagger: 0 });
    reel.add(this.rail, this.railFill, this.ticks);
    // chapter-change sweeps: two hairlines racing across the frame + a soft light band
    this.sweeps = SEGMENTS.slice(1, -1).map((sg) => {
      const g = new THREE.Group();
      const l1 = progressLine([V(-a, 0.36), V(a, 0.36)], { color: '#ffffff', intensity: 1.8, head: 0.06, fade: 0.35 });
      const l2 = progressLine([V(a, -0.36), V(-a, -0.36)], { color: '#ffffff', intensity: 1.8, head: 0.06, fade: 0.35 });
      const band = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.4), new THREE.ShaderMaterial({
        uniforms: { uO: { value: 0 }, uC: { value: new THREE.Color() } }, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uO; uniform vec3 uC; varying vec2 vUv; void main(){ float x = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(uC * pow(x, 3.0) * uO, 1.0); }',
      }));
      band.rotation.z = -0.35;
      g.add(l1, l2, band);
      this.scene.add(g);
      return { g, l1, l2, band, t: sg.start + 0.25 };
    });
  }

  updateReel(T) {
    const end = SEGMENTS.at(-1).end;
    const finale = SEGMENTS.at(-1).start + 0.5;
    const o = ramp(T, 5.6, 6.4) * (1 - ramp(T, finale - 0.4, finale + 0.3));
    this.reel.visible = o > 0.003;
    const col = new THREE.Color().copy(WARM).lerp(COOL, sat((1 - warmthAt(T)) / 2));
    if (this.reel.visible) {
      this.corners.progress = 1; this.corners.opacity = 0.55 * o;
      this.corners.material.uniforms.uColor.value.copy(col);
      const segs = SEGMENTS.filter((sg) => T >= sg.start);
      const cur = segs.at(-1), idx = SEGMENTS.indexOf(cur);
      this.tcText.set(tc(T), col, 0.75 * o);
      this.idxText.set(`${String(idx + 1).padStart(2, '0')} / ${String(SEGMENTS.length).padStart(2, '0')}  ${cur.id.toUpperCase()}`, col, 0.75 * o);
      // technique tag types on at each chapter start
      const tech = TECHNIQUE[cur.id] ?? '';
      const typed = Math.floor(tech.length * ramp(T, cur.start + 0.5, cur.start + 1.3, ease.linear));
      this.techText.set(tech.slice(0, typed), col, 0.7 * o);
      this.rtText.set('WEBGL · REAL-TIME', col, 0.5 * o);
      this.rail.progress = 1; this.rail.opacity = 0.5 * o;
      this.railFill.progress = Math.max(0.0001, T / end); this.railFill.opacity = 0.9 * o;
      this.ticks.progress = 1; this.ticks.opacity = 0.6 * o;
      [this.rail, this.railFill, this.ticks].forEach((l) => l.material.uniforms.uColor.value.copy(col));
    }
    for (const s of this.sweeps) {
      const u = (T - s.t) / 0.6;
      const on = u > -0.05 && u < 1.1 && o > 0.01;
      s.g.visible = on;
      if (!on) continue;
      const p = ease.inOutCubic(sat(u));
      s.l1.progress = s.l2.progress = Math.max(0.0001, p * 1.4);
      s.l1.opacity = s.l2.opacity = (1 - sat((u - 0.6) / 0.4)) * 0.8;
      [s.l1, s.l2].forEach((l) => l.material.uniforms.uColor.value.copy(col));
      s.band.position.x = lerp(-OUTPUT_ASPECT - 0.5, OUTPUT_ASPECT + 0.5, p);
      s.band.material.uniforms.uO.value = Math.sin(Math.PI * sat(u)) * 0.12;
      s.band.material.uniforms.uC.value.copy(col);
    }
    return this.reel.visible;
  }

  // A giant concept word that fills the frame (Inter SemiBold, tight tracking).
  makeWord(text, t0, t1, numeral, seg, { swap = false } = {}) {
    const a = OUTPUT_ASPECT;
    const g = new THREE.Group();
    const color = new THREE.Color().copy(WARM).lerp(COOL, sat((1 - warmthAt(t0 + 0.5)) / 2));
    const word = new KineticText(text, { font: FONTS.sans, weight: 600, height: 0.3, size: 360, letterSpacing: -0.035, color: '#ffffff', intensity: 0.92, padding: 0.18 });
    const ls = word.letters;
    const w = ls.length ? (ls.at(-1).base.x - ls[0].base.x) + 0.3 * 0.62 : 1;
    // fill ~78% of the frame width, but never taller than ~46% of the frame
    const k = Math.min((2 * a * 0.78) / w, 0.46 / 0.3 * (a < 1.9 ? 1 : 0.85));
    word.scale.setScalar(k);
    ls.forEach((l) => { l.mesh.material.depthTest = false; l.mesh.color.copy(color).lerp(new THREE.Color('#ffffff'), 0.55); });
    g.add(word);
    const halfW = (w * k) / 2;
    const rule = progressLine([new THREE.Vector3(-halfW, 0, 0), new THREE.Vector3(halfW, 0, 0)], { color, intensity: 0.9, head: 0.05 });
    rule.position.y = -0.3 * k * 0.78;
    g.add(rule);
    let label = null;
    if (numeral) {
      label = new TextPlane(`CHAPTER ${numeral}`, { font: FONTS.mono, height: 0.034, letterSpacing: 0.5, color, intensity: 1.1 });
      label.position.set(-halfW + label.worldWidth / 2 - 0.02, 0.3 * k * 0.62, 0);
      label.material.depthTest = false;
      g.add(label);
    }
    const dim = new THREE.Mesh(new THREE.PlaneGeometry(2 * a + 0.2, 2.2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    dim.renderOrder = -2;
    g.add(dim);
    g.position.y = swap ? 0.02 : 0.02;
    this.scene.add(g);
    return { g, word, rule, label, dim, t0, t1, swap, k };
  }

  updateWords(T) {
    let any = false;
    for (const w of this.words) {
      const on = T > w.t0 - 0.02 && T < w.t1 + 0.4;
      w.g.visible = on;
      if (!on) continue;
      any = true;
      const t = T - w.t0, n = w.word.letters.length;
      const inDur = w.swap ? 0.22 : 0.45, stagger = w.swap ? 0.012 : 0.035;
      const outStart = w.t1 - (w.swap ? 0.06 : 0.28);
      // slow push while held (the keynote "breathing" move)
      w.word.scale.setScalar(w.k * (1 + 0.045 * sat(t / Math.max(0.1, w.t1 - w.t0))));
      w.word.letters.forEach((l, i) => {
        const kin = ease.outExpo(sat((t - i * stagger) / inDur));
        const kout = ease.inCubic(sat((T - outStart - i * stagger * 0.5) / (w.swap ? 0.12 : 0.26)));
        const h = 0.3;
        l.mesh.position.set(l.base.x, l.base.y + (1 - kin) * -h * 0.9 + kout * h * 0.7, 0);
        l.mesh.opacity = sat(kin * 1.4) * (1 - kout);
        l.mesh.intensity = 0.92 + (1 - kin) * 1.6 * (kin > 0 ? 1 : 0);   // crisp, only the entrance flares
      });
      const hold = sat(t / 0.25) * (1 - sat((T - outStart) / 0.25));
      w.dim.material.opacity = (w.swap ? 0.28 : 0.4) * hold;
      w.rule.progress = Math.max(0.0001, ease.outExpo(sat((t - 0.12) / 0.5)) * (1 - ease.inCubic(sat((T - outStart) / 0.25))));
      w.rule.opacity = w.rule.progress > 0.001 ? 0.9 : 0;
      if (w.label) { w.label.reveal = ramp(t, 0.05, 0.45, ease.outCubic); w.label.opacity = hold * 0.9; }
    }
    return any;
  }

  makeCard(seg, c) {
    const g = new THREE.Group();
    g.position.y = this.y;
    g.scale.setScalar(this.scale);
    const color = new THREE.Color().copy(WARM).lerp(COOL, sat((1 - warmthAt(seg.start + 1)) / 2));
    const era = new TextPlane(`${c.n}   ·   ${c.era}`, { font: FONTS.mono, weight: 400, height: 0.034, letterSpacing: 0.42, color, intensity: 1.1 });
    era.position.y = 0.06;
    const heading = new KineticText(c.heading, { font: FONTS.display, weight: 600, height: 0.092, letterSpacing: 0.2, color, intensity: 1.35 });
    const half = Math.min(0.9, heading.letters.length * 0.05 + 0.25);
    const ruleL = progressLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-half, 0, 0)], { color, intensity: 1.2, head: 0.1 });
    const ruleR = progressLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(half, 0, 0)], { color, intensity: 1.2, head: 0.1 });
    ruleL.position.y = ruleR.position.y = 0.022;
    const story = new TextPlane(c.story, { font: FONTS.serif, italic: true, weight: 500, height: 0.052, color, intensity: 1.05 });
    story.position.y = -0.03;
    // soft scrim so type reads over bright plates
    const scrim = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uO; varying vec2 vUv; void main(){ vec2 d = (vUv - 0.5) * vec2(1.0, 2.2); gl_FragColor = vec4(0.0, 0.0, 0.0, uO * 0.42 * smoothstep(0.5, 0.0, length(d))); }',
    }));
    scrim.renderOrder = -1;
    g.add(scrim, era, ruleL, ruleR, story);   // the chapter word itself is 3D, in the scene (words3d.js)
    [era, story, ...heading.letters.map((l) => l.mesh)].forEach((m) => { m.material.depthTest = false; });
    this.scene.add(g);
    const dur = seg.end - seg.start;
    // Enter after the incoming transition settles; leave before the next one begins.
    const t0 = seg.start + 0.95, t1 = seg.start + Math.min(3.7, dur - 0.55);
    return { g, era, heading, ruleL, ruleR, story, scrim, t0, t1 };
  }

  makeInterlude(d) {
    const g = new THREE.Group();
    g.position.y = d.low ? -0.42 : d.cite ? this.y - 0.02 : 0;
    g.scale.setScalar(this.scale);
    const text = new KineticText(d.text, { font: FONTS.serif, italic: true, weight: 500, height: d.low ? 0.058 : d.cite ? 0.066 : 0.08, letterSpacing: 0.02, color: '#fff1d8', intensity: 1.2 });
    g.add(text);
    let cite = null;
    if (d.cite) {
      cite = new TextPlane(d.cite, { font: FONTS.mono, height: 0.032, letterSpacing: 0.45, color: '#dbe8ff', intensity: 1.0 });
      cite.position.y = -0.1;
      cite.material.depthTest = false;
      g.add(cite);
    }
    text.letters.forEach((l) => { l.mesh.material.depthTest = false; });
    this.scene.add(g);
    return { g, text, cite, t0: d.start, t1: d.end };
  }

  update(T) {
    let any = this.updateReel(T);
    any = this.updateWords(T) || any;
    for (const c of this.cards) {
      const on = T > c.t0 - 0.05 && T < c.t1 + 0.7;
      c.g.visible = on;
      if (!on) continue;
      any = true;
      const t = T - c.t0, out = ramp(T, c.t1 - 0.1, c.t1 + 0.55, ease.inCubic);
      const life = T - c.t0, span = c.t1 - c.t0;
      c.scrim.material.uniforms.uO.value = ramp(t, 0, 0.5) * (1 - out);
      // era line: tracking reveal
      c.era.reveal = ramp(t, 0.0, 0.45, ease.outCubic);
      c.era.opacity = ramp(t, 0, 0.2) * (1 - out) * 0.85;
      // rule draws outward from the centre, retracts on exit
      const rp = ramp(t, 0.1, 0.65, ease.outExpo) * (1 - ramp(T, c.t1 - 0.2, c.t1 + 0.4, ease.inOutCubic));
      c.ruleL.progress = c.ruleR.progress = Math.max(0.0001, rp);
      c.ruleL.opacity = c.ruleR.opacity = rp > 0.001 ? 0.9 : 0;
      // heading: letters rise into place from the centre outwards, then a slow tracking push
      const n = c.heading.letters.length;
      const push = 1 + 0.035 * sat(life / span);
      c.heading.letters.forEach((l, i) => {
        const fromC = Math.abs(i - (n - 1) / 2) / Math.max(1, n / 2);
        const k = ramp(t, 0.12 + fromC * 0.28, 0.62 + fromC * 0.28, ease.outCubic);
        const ko = ramp(T, c.t1 - 0.15 + fromC * 0.2, c.t1 + 0.3 + fromC * 0.2, ease.inCubic);
        l.mesh.position.set(l.base.x * push, l.base.y + (1 - k) * -0.05 + ko * 0.05, 0);
        l.mesh.opacity = k * (1 - ko);
        l.mesh.intensity = 1.35 + (1 - k) * 2.5 * (k > 0 ? 1 : 0);
      });
      // story line wipes in after the heading
      c.story.reveal = ramp(t, 0.6, 1.35, ease.inOutSine);
      c.story.opacity = ramp(t, 0.6, 0.8) * (1 - out) * 0.92;
    }
    for (const d of this.interludes) {
      const on = T > d.t0 && T < d.t1;
      d.g.visible = on;
      if (!on) continue;
      any = true;
      const n = d.text.letters.length;
      d.text.letters.forEach((l, i) => {
        const u = i / Math.max(1, n - 1);
        const k = ramp(T, d.t0 + u * 0.6, d.t0 + 0.35 + u * 0.6, ease.outCubic);
        const ko = ramp(T, d.t1 - 0.5 + u * 0.2, d.t1 - 0.15 + u * 0.2, ease.inCubic);
        l.mesh.position.set(l.base.x, l.base.y - (1 - k) * 0.025 + ko * 0.02, 0);
        l.mesh.opacity = k * (1 - ko);
        l.mesh.intensity = 1.2 + (1 - k) * 2.0 * (k > 0 ? 1 : 0);
      });
      if (d.cite) {
        d.cite.reveal = ramp(T, d.t0 + 0.8, d.t0 + 1.4, ease.outCubic);
        d.cite.opacity = ramp(T, d.t0 + 0.8, d.t0 + 1.0) * (1 - ramp(T, d.t1 - 0.4, d.t1 - 0.1));
      }
    }
    return any;
  }
}
