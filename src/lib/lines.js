// Progressive line drawing — wireframes that construct themselves, trajectories,
// blueprint strokes. All driven by a single `progress` uniform (0..1).
import * as THREE from 'three';
import { rng } from './math.js';

const lineVert = /* glsl */ `
attribute float aOrder;
varying float vOrder;
varying vec3 vPos;
void main(){ vOrder = aOrder; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const lineFrag = /* glsl */ `
uniform float uProgress, uOpacity, uIntensity, uHead, uFade;
uniform vec3 uColor, uHeadColor;
varying float vOrder;
void main(){
  float e = uProgress * (1.0 + uHead) - uHead;
  if (vOrder > e + uHead) discard;
  float head = smoothstep(e - uHead, e + uHead, vOrder);           // 1 at the drawing front
  float tail = uFade > 0.0 ? smoothstep(e - uFade, e, vOrder) : 1.0; // optional comet tail
  vec3 c = mix(uColor, uHeadColor, head) * uIntensity * (1.0 + head * 2.0);
  gl_FragColor = vec4(c, uOpacity * tail);
}`;

function lineMaterial({ color = '#ffffff', headColor = '#ffffff', opacity = 1, intensity = 1, head = 0.04, fade = 0, additive = true, depthTest = true }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uProgress: { value: 1 }, uOpacity: { value: opacity }, uIntensity: { value: intensity },
      uHead: { value: head }, uFade: { value: fade },
      uColor: { value: new THREE.Color(color) }, uHeadColor: { value: new THREE.Color(headColor) },
    },
    vertexShader: lineVert, fragmentShader: lineFrag,
    transparent: true, depthWrite: false, depthTest,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function addProgressAPI(obj) {
  Object.defineProperty(obj, 'progress', { get() { return this.material.uniforms.uProgress.value; }, set(v) { this.material.uniforms.uProgress.value = v; this.visible = v > 0 && this.material.uniforms.uOpacity.value > 0; } });
  Object.defineProperty(obj, 'opacity', { get() { return this.material.uniforms.uOpacity.value; }, set(v) { this.material.uniforms.uOpacity.value = v; this.visible = v > 0 && this.material.uniforms.uProgress.value > 0; } });
  Object.defineProperty(obj, 'intensity', { get() { return this.material.uniforms.uIntensity.value; }, set(v) { this.material.uniforms.uIntensity.value = v; } });
  obj.frustumCulled = false;
  return obj;
}

// Wireframe that builds itself. `order` decides the construction sequence:
//   'y' (bottom→top), '-y', 'x', 'z', 'radial' (centre out), 'index' (geometry order), 'random'
// mode: 'edges' (feature edges, clean look) | 'wire' (full triangle wireframe, denser)
export function revealLines(geometry, { order = 'y', mode = 'edges', threshold = 20, seed = 1, ...mat } = {}) {
  const g = mode === 'edges' ? new THREE.EdgesGeometry(geometry, threshold) : new THREE.WireframeGeometry(geometry);
  const pos = g.attributes.position;
  const n = pos.count;
  const ord = new Float32Array(n);
  g.computeBoundingBox();
  const bb = g.boundingBox, size = new THREE.Vector3(), ctr = new THREE.Vector3();
  bb.getSize(size); bb.getCenter(ctr);
  const maxR = size.length() / 2 || 1;
  const r = rng(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i += 2) {
    // both endpoints of a segment share one order value, so segments appear whole
    v.fromBufferAttribute(pos, i).add(new THREE.Vector3().fromBufferAttribute(pos, i + 1)).multiplyScalar(0.5);
    let o;
    switch (order) {
      case 'y': o = (v.y - bb.min.y) / (size.y || 1); break;
      case '-y': o = 1 - (v.y - bb.min.y) / (size.y || 1); break;
      case 'x': o = (v.x - bb.min.x) / (size.x || 1); break;
      case 'z': o = (v.z - bb.min.z) / (size.z || 1); break;
      case 'radial': o = v.distanceTo(ctr) / maxR; break;
      case 'random': o = r(); break;
      default: o = i / n;
    }
    ord[i] = ord[i + 1] = Math.min(1, Math.max(0, o));
  }
  g.setAttribute('aOrder', new THREE.BufferAttribute(ord, 1));
  return addProgressAPI(new THREE.LineSegments(g, lineMaterial(mat)));
}

// Polyline through points (array of Vector3) drawn start→end by arc length.
export function progressLine(points, { closed = false, ...mat } = {}) {
  const pts = closed ? [...points, points[0]] : points;
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const ord = new Float32Array(pts.length);
  let len = 0;
  for (let i = 1; i < pts.length; i++) { len += pts[i].distanceTo(pts[i - 1]); ord[i] = len; }
  for (let i = 0; i < pts.length; i++) ord[i] /= len || 1;
  g.setAttribute('aOrder', new THREE.BufferAttribute(ord, 1));
  return addProgressAPI(new THREE.Line(g, lineMaterial(mat)));
}

// Many independent segments drawn simultaneously, each with its own start delay —
// e.g. blueprint hatching, circuit traces. segments: [[Vector3, Vector3], ...]
export function segmentsLine(segments, { stagger = 0.6, seed = 7, orderFn = null, ...mat } = {}) {
  const r = rng(seed);
  const pos = new Float32Array(segments.length * 6), ord = new Float32Array(segments.length * 2);
  segments.forEach(([a, b], i) => {
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    const o = orderFn ? orderFn(a, b, i) : r() * stagger;
    ord[i * 2] = o; ord[i * 2 + 1] = Math.min(1, o + (1 - stagger));
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aOrder', new THREE.BufferAttribute(ord, 1));
  return addProgressAPI(new THREE.LineSegments(g, lineMaterial(mat)));
}

// Thick glowing curve (TubeGeometry) revealed along its length — hero trajectories, wires.
const tubeFrag = /* glsl */ `
uniform float uProgress, uOpacity, uIntensity, uTail; uniform vec3 uColor;
varying vec2 vUv;
void main(){
  if (vUv.x > uProgress) discard;
  float tail = uTail > 0.0 ? smoothstep(uProgress - uTail, uProgress, vUv.x) : 1.0;
  float head = smoothstep(uProgress - 0.02, uProgress, vUv.x);
  gl_FragColor = vec4(uColor * uIntensity * (1.0 + head * 3.0), uOpacity * tail);
}`;
export function progressTube(curve, { radius = 0.01, segments = 200, radial = 6, color = '#ffffff', intensity = 2, opacity = 1, tail = 0, additive = true } = {}) {
  const g = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const m = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 1 }, uOpacity: { value: opacity }, uIntensity: { value: intensity }, uTail: { value: tail }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: tubeFrag, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  return addProgressAPI(new THREE.Mesh(g, m));
}

// Point helpers
export function circlePoints(radius = 1, n = 128, { start = 0, end = Math.PI * 2, plane = 'xy', center = new THREE.Vector3() } = {}) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = start + (end - start) * (i / n), c = Math.cos(a) * radius, s = Math.sin(a) * radius;
    out.push(plane === 'xz' ? new THREE.Vector3(c, 0, s).add(center) : plane === 'yz' ? new THREE.Vector3(0, c, s).add(center) : new THREE.Vector3(c, s, 0).add(center));
  }
  return out;
}

// Golden spiral (logarithmic, growth φ per quarter turn), in the XY plane.
export function goldenSpiralPoints(scale = 1, turns = 3.5, n = 400) {
  const phi = (1 + Math.sqrt(5)) / 2, b = Math.log(phi) / (Math.PI / 2), out = [];
  for (let i = 0; i <= n; i++) {
    const th = (i / n) * turns * Math.PI * 2, r = scale * Math.exp(b * (th - turns * Math.PI * 2));
    out.push(new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
  }
  return out;
}
