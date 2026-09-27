// Chapter titles: one consistent motion-graphics layer drawn over every sequence.
// Each chapter gets an era line, a kinetic heading and one line of story; a few
// story-only cards carry the narrative between chapters. Pure function of time.
import * as THREE from 'three';
import { SEGMENTS, OUTPUT_ASPECT, warmthAt } from '../timeline.js';
import { KineticText, TextPlane, FONTS } from '../lib/text.js';
import { progressLine } from '../lib/lines.js';
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

// Story-only cards between chapters (global seconds).
const INTERLUDES = [
  { start: 1.25, end: 3.0, text: 'Every achievement begins as an idea.' },
  { start: 49.75, end: 52.6, text: 'If I have seen further, it is by standing on the shoulders of giants.', cite: 'ISAAC NEWTON · 1675' },
];

const WARM = new THREE.Color('#ffe2b0'), COOL = new THREE.Color('#dbe8ff');

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
    for (const seg of SEGMENTS) {
      const c = CHAPTERS[seg.id];
      if (!c || !c.heading) continue;
      this.cards.push(this.makeCard(seg, c));
    }
    this.interludes = INTERLUDES.map((d) => this.makeInterlude(d));
  }

  makeCard(seg, c) {
    const g = new THREE.Group();
    g.position.y = this.y;
    g.scale.setScalar(this.scale);
    const color = new THREE.Color().copy(WARM).lerp(COOL, sat((1 - warmthAt(seg.start + 1)) / 2));
    const era = new TextPlane(`${c.n}   ·   ${c.era}`, { font: FONTS.mono, weight: 400, height: 0.034, letterSpacing: 0.42, color, intensity: 1.1 });
    era.position.y = 0.105;
    const heading = new KineticText(c.heading, { font: FONTS.display, weight: 600, height: 0.092, letterSpacing: 0.2, color, intensity: 1.35 });
    const half = Math.min(0.9, heading.letters.length * 0.05 + 0.25);
    const ruleL = progressLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-half, 0, 0)], { color, intensity: 1.2, head: 0.1 });
    const ruleR = progressLine([new THREE.Vector3(0, 0, 0), new THREE.Vector3(half, 0, 0)], { color, intensity: 1.2, head: 0.1 });
    ruleL.position.y = ruleR.position.y = 0.062;
    const story = new TextPlane(c.story, { font: FONTS.serif, italic: true, weight: 500, height: 0.052, color, intensity: 1.05 });
    story.position.y = -0.095;
    // soft scrim so type reads over bright plates
    const scrim = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.62), new THREE.ShaderMaterial({
      uniforms: { uO: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uO; varying vec2 vUv; void main(){ vec2 d = (vUv - 0.5) * vec2(1.0, 2.2); gl_FragColor = vec4(0.0, 0.0, 0.0, uO * 0.42 * smoothstep(0.5, 0.0, length(d))); }',
    }));
    scrim.renderOrder = -1;
    g.add(scrim, era, ruleL, ruleR, heading, story);
    [era, story, ...heading.letters.map((l) => l.mesh)].forEach((m) => { m.material.depthTest = false; });
    this.scene.add(g);
    const dur = seg.end - seg.start;
    // Enter after the incoming transition settles; leave before the next one begins.
    const t0 = seg.start + 0.45, t1 = seg.start + Math.min(3.3, dur - 0.9);
    return { g, era, heading, ruleL, ruleR, story, scrim, t0, t1 };
  }

  makeInterlude(d) {
    const g = new THREE.Group();
    g.position.y = d.cite ? this.y - 0.02 : 0;
    g.scale.setScalar(this.scale);
    const text = new KineticText(d.text, { font: FONTS.serif, italic: true, weight: 500, height: d.cite ? 0.066 : 0.08, letterSpacing: 0.02, color: '#fff1d8', intensity: 1.2 });
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
    let any = false;
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
