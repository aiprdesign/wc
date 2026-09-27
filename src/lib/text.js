// Typography toolkit: web-font loading, crisp text planes with reveal shaders,
// per-glyph kinetic text, text→particle sampling and extruded 3D lettering.
import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

export const FONTS = {
  display: 'Cinzel',               // Roman inscriptional capitals — titles
  serif: 'Cormorant Garamond',     // manuscripts, elegant captions
  mono: 'IBM Plex Mono',           // HUD, annotations, technical labels
  sans: 'Inter',                   // modern-era UI
};

const FACES = [
  ['Cinzel', 'cinzel-latin-400-normal', 400], ['Cinzel', 'cinzel-latin-600-normal', 600],
  ['Cinzel', 'cinzel-latin-700-normal', 700], ['Cinzel', 'cinzel-latin-900-normal', 900],
  ['Cormorant Garamond', 'cormorant-garamond-latin-400-normal', 400],
  ['Cormorant Garamond', 'cormorant-garamond-latin-500-normal', 500],
  ['Cormorant Garamond', 'cormorant-garamond-latin-600-normal', 600],
  ['Cormorant Garamond', 'cormorant-garamond-latin-400-italic', 400, 'italic'],
  ['Cormorant Garamond', 'cormorant-garamond-latin-500-italic', 500, 'italic'],
  ['IBM Plex Mono', 'ibm-plex-mono-latin-300-normal', 300],
  ['IBM Plex Mono', 'ibm-plex-mono-latin-400-normal', 400],
  ['IBM Plex Mono', 'ibm-plex-mono-latin-500-normal', 500],
  ['Inter', 'inter-latin-200-normal', 200], ['Inter', 'inter-latin-300-normal', 300],
  ['Inter', 'inter-latin-400-normal', 400], ['Inter', 'inter-latin-600-normal', 600],
];

let font3D = null;

export async function loadFonts(base = 'assets/fonts/') {
  await Promise.all(FACES.map(async ([family, file, weight, style = 'normal']) => {
    const face = new FontFace(family, `url(${base}${file}.woff2)`, { weight: String(weight), style });
    await face.load();
    document.fonts.add(face);
  }));
  const json = await (await fetch(`${base}cinzel-700.typeface.json`)).json();
  font3D = new Font(json);
}

export const getFont3D = () => font3D;

// ---------------------------------------------------------------------------
// Canvas text rendering

function fontString({ font = FONTS.display, weight = 400, size = 128, italic = false }) {
  return `${italic ? 'italic ' : ''}${weight} ${size}px "${font}"`;
}

// Renders (multi-line) text to a canvas. letterSpacing in em. Returns { canvas, width, height, lines }.
export function textCanvas(text, opts = {}) {
  const { size = 128, color = '#ffffff', letterSpacing = 0, lineHeight = 1.15, align = 'center', padding = 0.25, shadow = 0 } = opts;
  const lines = String(text).split('\n');
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = fontString(opts);
  const spacing = letterSpacing * size;
  const measure = (s) => ctx.measureText(s).width + Math.max(0, s.length - 1) * spacing;
  const widths = lines.map(measure);
  const pad = Math.ceil(size * padding);
  const W = Math.ceil(Math.max(...widths) + pad * 2);
  const H = Math.ceil(lines.length * size * lineHeight + pad * 2);
  c.width = W; c.height = H;
  ctx.font = fontString(opts);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  if (shadow) { ctx.shadowColor = color; ctx.shadowBlur = shadow; }
  lines.forEach((line, i) => {
    const y = pad + (i + 0.5) * size * lineHeight;
    let x = align === 'left' ? pad : align === 'right' ? W - pad - widths[i] : (W - widths[i]) / 2;
    if (spacing === 0) { ctx.fillText(line, x, y); return; }
    for (const ch of line) { ctx.fillText(ch, x, y); x += ctx.measureText(ch).width + spacing; }
  });
  return { canvas: c, width: W, height: H, lines };
}

// ---------------------------------------------------------------------------
// TextPlane: a mesh displaying text whose em size is `height` world units.
// Uniform controls (all animatable every frame):
//   opacity, reveal (0..1 left→right soft wipe), intensity (HDR >1 → bloom), color, blur-in via `soft`.

const textVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const textFrag = /* glsl */ `
uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity; uniform float uReveal;
uniform float uSoft; uniform float uIntensity; uniform float uRevealDir;
varying vec2 vUv;
void main(){
  vec4 t = texture2D(uMap, vUv);
  float coord = uRevealDir > 0.5 ? (1.0 - vUv.y) : vUv.x;
  float edge = uReveal * (1.0 + uSoft) - uSoft;
  float r = smoothstep(edge + uSoft, edge, coord);
  float a = t.a * uOpacity * r;
  if (a < 0.02) discard;
  // bright leading edge during the wipe
  float lead = (uReveal > 0.0 && uReveal < 1.0) ? smoothstep(uSoft, 0.0, abs(coord - edge - uSoft * 0.5)) * 1.5 : 0.0;
  gl_FragColor = vec4(uColor * uIntensity * (1.0 + lead), a);
}`;

export class TextPlane extends THREE.Mesh {
  constructor(text, opts = {}) {
    const { height = 0.2, color = '#ffffff', intensity = 1, opacity = 1, reveal = 1, soft = 0.15, blending = THREE.NormalBlending, revealDir = 'x' } = opts;
    const tc = textCanvas(text, { ...opts, color: '#ffffff', size: opts.size ?? 160 });
    const tex = new THREE.CanvasTexture(tc.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    // `height` is the em size in world units (1 canvas px = height / size world units).
    const k = height / (opts.size ?? 160);
    const worldH = tc.height * k;
    const worldW = tc.width * k;
    const geo = new THREE.PlaneGeometry(worldW, worldH);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: tex }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
        uReveal: { value: reveal }, uSoft: { value: soft }, uIntensity: { value: intensity },
        uRevealDir: { value: revealDir === 'y' ? 1 : 0 },
      },
      vertexShader: textVert, fragmentShader: textFrag,
      // depthWrite on (glyph pixels only, thanks to the discard) so depth of field treats text
      // at its true distance instead of blurring it like the background behind it.
      transparent: true, depthWrite: opts.depthWrite ?? true, blending, side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.worldWidth = worldW;
    this.worldHeight = worldH;
    this.renderOrder = 10;
  }
  set opacity(v) { this.material.uniforms.uOpacity.value = v; this.visible = v > 0.001; }
  get opacity() { return this.material.uniforms.uOpacity.value; }
  set reveal(v) { this.material.uniforms.uReveal.value = v; }
  get reveal() { return this.material.uniforms.uReveal.value; }
  set intensity(v) { this.material.uniforms.uIntensity.value = v; }
  get intensity() { return this.material.uniforms.uIntensity.value; }
  get color() { return this.material.uniforms.uColor.value; }
  dispose() { this.geometry.dispose(); this.material.uniforms.uMap.value.dispose(); this.material.dispose(); }
}

// ---------------------------------------------------------------------------
// KineticText: one TextPlane per glyph laid out like the full string, so each
// letter can be animated independently. letters[i] = { mesh, char, base: Vector3, index, u (0..1 across line) }

export class KineticText extends THREE.Group {
  constructor(text, opts = {}) {
    super();
    const { height = 0.2, size = 160, letterSpacing = 0, lineHeight = 1.2 } = opts;
    const measure = document.createElement('canvas').getContext('2d');
    measure.font = fontString({ ...opts, size });
    const lines = String(text).split('\n');
    const scale = height / size;
    this.letters = [];
    let index = 0;
    const totalH = lines.length * height * lineHeight;
    lines.forEach((line, li) => {
      const chars = [...line];
      const adv = chars.map((ch) => measure.measureText(ch).width + letterSpacing * size);
      const lineW = adv.reduce((a, b) => a + b, 0) - letterSpacing * size;
      let x = -lineW / 2;
      const y = totalH / 2 - (li + 0.5) * height * lineHeight;
      chars.forEach((ch, ci) => {
        const w = adv[ci] - letterSpacing * size;
        if (ch !== ' ') {
          const mesh = new TextPlane(ch, { ...opts, letterSpacing: 0, height, padding: 0.3 });
          const base = new THREE.Vector3((x + w / 2) * scale, y, 0);
          mesh.position.copy(base);
          this.add(mesh);
          this.letters.push({ mesh, char: ch, base, index, line: li, u: lineW > 0 ? (x + w / 2 + lineW / 2) / lineW : 0.5 });
          index++;
        }
        x += adv[ci];
      });
    });
    this.count = this.letters.length;
  }
  setAll(fn) { this.letters.forEach(fn); }
}

// ---------------------------------------------------------------------------
// Sample N points on rasterised text. Returns Float32Array(n*3) in world units,
// centred, `width` world units wide. Great for particle-assembled typography.

export function textPoints(text, n, opts = {}) {
  const { width = 4, z = 0, depth = 0, seed = 1 } = opts;
  const tc = textCanvas(text, { size: 200, padding: 0.1, ...opts, color: '#fff' });
  const ctx = tc.canvas.getContext('2d');
  const { width: W, height: H } = tc;
  const data = ctx.getImageData(0, 0, W, H).data;
  const filled = [];
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / (n * 6))));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) filled.push(x, y);
  const out = new Float32Array(n * 3);
  const s = width / W;
  let a = seed * 9301 + 49297;
  const rand = () => ((a = (a * 9301 + 49297) % 233280) / 233280);
  const cnt = filled.length / 2;
  for (let i = 0; i < n; i++) {
    const k = Math.floor(rand() * cnt) * 2;
    out[i * 3] = (filled[k] - W / 2 + (rand() - 0.5) * step) * s;
    out[i * 3 + 1] = -(filled[k + 1] - H / 2 + (rand() - 0.5) * step) * s;
    out[i * 3 + 2] = z + (rand() - 0.5) * depth;
  }
  out.aspect = H / W;
  return out;
}

// ---------------------------------------------------------------------------
// Extruded 3D lettering in Cinzel Bold. Returns a centred BufferGeometry.
export function textGeometry3D(text, { size = 1, depth = 0.25, bevel = 0.02, curveSegments = 6 } = {}) {
  const geo = new TextGeometry(text, {
    font: font3D, size, depth, curveSegments,
    bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.7, bevelSegments: 3,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, -(bb.max.z + bb.min.z) / 2);
  return geo;
}

// Per-letter 3D glyphs laid out as a line: [{ geometry, char, x }] (x = centre offset).
export function letters3D(text, { size = 1, depth = 0.25, bevel = 0.02, tracking = 0.08 } = {}) {
  const glyphs = font3D.data.glyphs;
  const res = font3D.data.resolution;
  const out = [];
  let x = 0;
  for (const ch of text) {
    const g = glyphs[ch] || glyphs['?'];
    const adv = ((g ? g.ha : 500) / res) * size + tracking * size;
    if (ch !== ' ' && g) out.push({ geometry: textGeometry3D(ch, { size, depth, bevel }), char: ch, x: x + adv / 2 });
    x += adv;
  }
  const total = x - tracking * size;
  out.forEach((o) => (o.x -= total / 2));
  out.width = total;
  return out;
}
