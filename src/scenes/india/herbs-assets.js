// HERBS & AYURVEDA — procedural assets, part 1: geometry helpers, generated textures (leaf veins with
// normal maps, hammered brass with patina, thrown clay, granite, rhizome skin and cut flesh, palm leaf),
// the materials that use them (translucent wind-stirred leaves, brass, clay) and the small hero models:
// turmeric and ginger rhizomes, peppercorns and pepper spikes, cardamom pods, cloves, cinnamon quills,
// seeds, ashwagandha husks and berries, amla fruit, vessels. Everything is built once; herbs.js poses it.
// No texture here repeats across a surface: maps are laid 1:1 on their object, seamless around lathes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, lerp, sat, TAU } from '../../lib/math.js';
import { fbm2, noise2, noise3 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import { persistModule } from '../../lib/persist.js';

// painted maps are kept on the device between visits (lib/persist.js)
const P = await persistModule(import.meta.url);

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// Level of detail for the tessellating helpers (lathe, grid surfaces, tubes): herbs.js sets k < 1 on the lite path.
export const LOD = { k: 1 };
const lod = (n, min = 2) => Math.max(min, Math.round(n * LOD.k));

// ------------------------------------------------------------------ geometry helpers
// Merge-friendly: non-indexed, position / normal / uv (+ color when asked).
export function clean(g, keepColor = false) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv', ...(keepColor ? ['color'] : [])].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  if (keepColor && !n.attributes.color) { const c = new Float32Array(n.attributes.position.count * 3).fill(1); n.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  return n;
}
export const merge = (list, keepColor = false) => mergeGeometries(list.map((g) => clean(g, keepColor)), false);
export function bake(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(V3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V3(...s));
  return g.applyMatrix4(m);
}
export function tint(g, hex, k = 1) {
  const c = new THREE.Color(hex).multiplyScalar(k), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
export const lathe = (pts, segs = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y)), lod(segs, 6));

// A parametric grid surface: fn(u, v, out) for u, v ∈ [0, 1]; uv = (u, v).
export function gridSurf(fn, nu, nv, flip = false) {
  nu = lod(nu, 3); nv = lod(nv, 1);
  const pos = [], uv = [], idx = [], p = V3();
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { fn(i / nu, j / nv, p); pos.push(p.x, p.y, p.z); uv.push(i / nu, j / nv); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; if (flip) idx.push(a, a + 1, b, b, a + 1, b + 1); else idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// A tube whose radius varies along its length (rFn(u, a) → radius, a = angle round the tube).
export function varTube(curve, n, radial, rFn) {
  n = lod(n, 2); radial = lod(radial, 3);
  const frames = curve.computeFrenetFrames(n, false);
  const pos = [], uv = [], idx = [], p = V3();
  for (let i = 0; i <= n; i++) {
    const u = i / n; curve.getPointAt(u, p);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU, c = Math.cos(a), s = Math.sin(a), r = Math.max(1e-4, rFn(u, a));
      pos.push(p.x + r * (c * N.x + s * B.x), p.y + r * (c * N.y + s * B.y), p.z + r * (c * N.z + s * B.z));
      uv.push(u, j / radial);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// a plain tapering tube between points (stems, twigs, string)
export function stem(pts, r0, r1 = r0 * 0.6, radial = 6, perM = 60) {
  const c = new THREE.CatmullRomCurve3(pts);
  return varTube(c, Math.max(3, Math.round(c.getLength() * perM)), radial, (u) => lerp(r0, r1, u));
}

// ------------------------------------------------------------------ texture helpers
// Height field (Float32, 0..1) → tangent-space normal map. wrapX: seamless in u.
export function heightToNormal(h, W, H, strength = 2, wrapX = true) {
  const d = new Uint8Array(W * H * 4);
  const at = (x, y) => { x = wrapX ? (x + W) % W : Math.min(W - 1, Math.max(0, x)); y = Math.min(H - 1, Math.max(0, y)); return h[y * W + x]; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (at(x - 1, y) - at(x + 1, y)) * strength, ny = (at(x, y - 1) - at(x, y + 1)) * strength;
    const l = Math.hypot(nx, ny, 1), o = (y * W + x) * 4;
    d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (-ny / l * 0.5 + 0.5) * 255; d[o + 2] = (1 / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.wrapS = wrapX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
const canvasHeight = (c) => { const { width: W, height: H } = c, d = c.getContext('2d').getImageData(0, 0, W, H).data, h = new Float32Array(W * H); for (let i = 0; i < W * H; i++) h[i] = d[i * 4] / 255; return h; };
// periodic noise in u (seamless round a lathe): u ∈ [0,1) wraps, v is free
const pnoise = (u, v, fu, fv, z = 0) => noise3(Math.cos(u * TAU) * fu / TAU, Math.sin(u * TAU) * fu / TAU, v * fv + z);
const pfbm = (u, v, fu, fv, oct = 4, z = 0) => { let s = 0, a = 0.5, f = 1; for (let o = 0; o < oct; o++) { s += a * pnoise(u, v, fu * f, fv * f, z + o * 7.1); f *= 2; a *= 0.5; } return s; };

// ------------------------------------------------------------------ leaves
// Vein layout per leaf type, as polylines in (u: base → tip, v: across 0..1), with stroke widths (px).
function veinPaths(kind, R) {
  const P = [];   // [points[], width, alpha]
  const curve = (pts, w, a = 1) => P.push([pts, w, a]);
  if (kind === 'palmate') {                     // pepper: five main veins springing from the base
    curve([[0, 0.5], [1, 0.5]], 7);
    for (const s of [-1, 1]) {
      curve([[0.02, 0.5], [0.25, 0.5 + s * 0.2], [0.6, 0.5 + s * 0.16], [0.95, 0.5 + s * 0.02]], 5);
      curve([[0.02, 0.5], [0.12, 0.5 + s * 0.36], [0.4, 0.5 + s * 0.38], [0.7, 0.5 + s * 0.2]], 3.5);
      for (let k = 0; k < 9; k++) { const u = 0.12 + k * 0.09; curve([[u, 0.5 + s * 0.04], [u + 0.04, 0.5 + s * (0.16 + R() * 0.05)], [u + 0.07, 0.5 + s * 0.3]], 1.3, 0.6); }
    }
  } else if (kind === 'parallel') {             // ginger, turmeric, banana: midrib + fine parallel laterals
    curve([[0, 0.5], [1, 0.5]], 9);
    for (const s of [-1, 1]) for (let k = 0; k < 46; k++) { const u = k / 46; curve([[u, 0.5 + s * 0.03], [u + 0.1, 0.5 + s * 0.3], [u + 0.18, 0.5 + s * 0.5]], k % 4 ? 0.9 : 1.8, k % 4 ? 0.5 : 0.9); }
  } else if (kind === 'lantern') {              // ashwagandha husk: ribs along the length + a fine net
    for (let k = 0; k < 10; k++) { const v = (k + 0.5) / 10; curve([[0, v], [0.5, v + (R() - 0.5) * 0.03], [1, v]], k % 2 ? 2 : 4.5); }
  } else {                                     // pinnate: midrib + alternate curved laterals (tulsi, neem, ashwagandha)
    curve([[0, 0.5], [1, 0.5]], 7);
    const n = kind === 'neem' ? 11 : 7;
    for (const s of [-1, 1]) for (let k = 1; k <= n; k++) {
      const u0 = (k + (s > 0 ? 0.35 : 0)) / (n + 1) * 0.92;
      curve([[u0, 0.5], [u0 + 0.07, 0.5 + s * 0.22], [u0 + 0.16 + R() * 0.03, 0.5 + s * 0.42], [u0 + 0.22, 0.5 + s * 0.49]], 3);
    }
  }
  // the reticulate net between veins
  if (kind !== 'parallel') for (let k = 0; k < 260; k++) { const u = R(), v = R(), a = R() * TAU, l = 0.02 + R() * 0.03; curve([[u, v], [u + Math.cos(a) * l, v + Math.sin(a) * l * 2]], 0.8, 0.35); }
  return P;
}
// Colour (neutral pale green: instance colour tints it) + normal map from the same veins.
export function leafMaps(...args) { return P.memo(`leafMaps:${JSON.stringify(args)}`, () => leafMaps__paint(...args)); }
function leafMaps__paint(kind = 'pinnate', seed = 1) {
  const W = 512, H = 256, R = rng(seed), paths = veinPaths(kind, R);
  // (strokes drawn plainly on a layer, then the layer composited once through the blur: a canvas filter
  // per stroke is very slow on software canvases)
  const stroke = (x, style, blur) => {
    const lc = mkCanvas(W, H), l = lc.getContext('2d');
    for (const [pts, w, a] of paths) {
      l.strokeStyle = style(a); l.lineWidth = w; l.lineCap = 'round'; l.beginPath();
      pts.forEach(([u, v], i) => (i ? l.lineTo(u * W, v * H) : l.moveTo(u * W, v * H)));
      l.stroke();
    }
    x.filter = blur ? `blur(${blur}px)` : 'none';
    x.drawImage(lc, 0, 0);
    x.filter = 'none';
  };
  // height: veins sunk into the blade, the blade between them slightly puffed
  const hc = mkCanvas(W, H), hx = hc.getContext('2d');
  hx.fillStyle = '#9a9a9a'; hx.fillRect(0, 0, W, H);
  stroke(hx, (a) => `rgba(20,20,20,${0.8 * a})`, 1.6);
  const h = canvasHeight(hc);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] += noise2(x / 9 + seed, y / 9) * 0.04 + noise2(x / 2.5, y / 2.5) * 0.015;
  const normalMap = heightToNormal(h, W, H, 3.2, false);
  // colour
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, edge = Math.abs(v - 0.5) * 2;
    const n = fbm2(u * 6 + seed, v * 3, 4) * 0.16 + noise2(x / 3, y / 3) * 0.04;
    const k = 0.86 + n + edge * 0.06 - (1 - u) * 0.04, o = (y * W + x) * 4;
    d[o] = 196 * k; d[o + 1] = 214 * k; d[o + 2] = 160 * k; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  stroke(cx, (a) => `rgba(236,244,196,${(kind === 'palmate' ? 0.3 : 0.5) * a})`, 0.6);
  const map = toTexture(cc, { anisotropy: 4 });
  return { map, normalMap };
}

// Leaf blade along +x (base at the origin), width across z, cupped along the midrib.
//   shape: 'ovate' | 'lance' | 'cordate' | 'long' | 'broad'
export function leafGeometry({ len = 1, width = 0.3, shape = 'lance', teeth = 0, serr = 0, fold = 0.25, curl = 0.1, sickle = 0, wave = 0, nl = 10, nw = 4 } = {}) {
  const half = (u) => {
    let w;
    if (shape === 'ovate') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.8);
    else if (shape === 'cordate') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.5)), 0.9);
    else if (shape === 'long') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.55);
    else if (shape === 'broad') w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.85)), 0.6);
    else w = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.62)), 1.1);
    if (teeth) { const f = (u * teeth) % 1; w *= 1 - serr * f * (u > 0.08 && u < 0.95 ? 1 : 0); }
    return w * width * 0.5;
  };
  const g = gridSurf((u, j, p) => {
    const v = j * 2 - 1, w = half(u);
    let x = u * len;
    if (shape === 'cordate') x -= Math.abs(v) * Math.pow(1 - u, 5) * len * 0.22;   // the basal lobes
    const z = v * w + sickle * len * u * u;
    const y = fold * Math.abs(v) * w + curl * len * u * u - 0.25 * fold * w * Math.pow(v, 4) + wave * w * Math.sin(u * 23 + v) * Math.abs(v);
    p.set(x, y, z);
  }, nl, nw);
  return g;
}

// Leaf material: colour + vein normal map, per-instance tint, light passing through the blade when the sun
// is behind it (thin-leaf translucency), and a flutter in the wind driven by uTime (pure: set from t).
export const LEAF_U = { uTime: { value: 0 }, uSunV: { value: V3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.8, 0.55) }, uWind: { value: 1 } };
export function leafMaterial({ map, normalMap, rough = 0.55, trans = 1, flutter = 1, sheen = 0, color = '#ffffff', key = 'leaf' } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0, side: THREE.DoubleSide });
  if (normalMap) m.normalMap = normalMap;
  m.normalScale.set(1, 1);
  m.userData.noDetail = true; m.userData.noBatch = true;
  const U = { ...LEAF_U, uTrans: { value: trans }, uFlutter: { value: flutter }, uSheen: { value: sheen } };
  m.userData.U = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime, uWind, uFlutter;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = dot(ip, vec3(13.1, 7.7, 5.3));
        float tip = uv.x * uv.x;
        float w = sin(uTime * 2.3 + ph) * 0.6 + sin(uTime * 5.1 + ph * 1.7) * 0.25 + sin(uTime * 11.0 + ph * 3.1) * 0.1;
        transformed.y += w * tip * 0.06 * uWind * uFlutter * position.x * 6.0;
        transformed.z += sin(uTime * 1.7 + ph * 0.6) * tip * 0.03 * uWind * uFlutter * position.x * 6.0;
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uSunV, uSunCol; uniform float uTrans, uSheen;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 Vv = normalize(vViewPosition);
        float behind = pow(clamp(dot(-Vv, uSunV), 0.0, 1.0), 2.0);
        float thin = clamp(0.35 - dot(normal, uSunV) * 0.65, 0.0, 1.0);
        vec3 leafT = diffuseColor.rgb * (diffuseColor.rgb * 1.6 + vec3(0.05, 0.08, 0.0));
        totalEmissiveRadiance += leafT * uSunCol * uTrans * thin * (0.25 + 1.6 * behind);
        float fr = pow(1.0 - clamp(dot(normal, Vv), 0.0, 1.0), 3.0);
        totalEmissiveRadiance += uSunCol * uSheen * fr * 0.08;
      }`);
  };
  m.customProgramCacheKey = () => 'herbLeaf';
  return m;
}

// ------------------------------------------------------------------ metals, clay, stone, wood
// Hammered brass: dimples (normal map), tarnish and green-brown patina in the low spots (colour), polish
// on the high spots (roughness). Seamless round a lathe (u wraps).
export function brassMaps(seed = 3, { W = 512, H = 256, dimples = 900, patina = 1 } = {}) {
  const R = rng(seed), h = new Float32Array(W * H);
  for (let k = 0; k < dimples; k++) {
    const cx = R() * W, cy = R() * H, r = 5 + R() * 9, dep = 0.5 + R() * 0.5;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(H, cy + r); y++) for (let xx = Math.floor(cx - r); xx < cx + r; xx++) {
      const dx = xx - cx, dy = y - cy, q = (dx * dx + dy * dy) / (r * r);
      if (q < 1) { const x = (xx + W) % W; h[y * W + x] = Math.min(h[y * W + x], -dep * (1 - q) * (1 - q)); }
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 0.5 + h[y * W + x] * 0.08 + pnoise(x / W, y / H, 40, 30) * 0.004;
  const normalMap = heightToNormal(h, W, H, 6, true);
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  const rc = mkCanvas(W, H), rx = rc.getContext('2d'), rimg = rx.createImageData(W, H), rd = rimg.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x, o = i * 4;
    const low = sat((0.5 - h[i]) * 30);                         // inside a dimple
    const tarn = sat(pfbm(u, v, 5, 3, 4, seed) * 1.4 + 0.45);    // broad tarnish
    const pat = sat((pfbm(u, v, 14, 9, 4, seed + 9) - 0.25) * 3) * patina * (0.4 + 0.6 * sat(1 - v * 1.2));
    let r = 222, g = 168, b = 86;                                // polished brass (albedo)
    r = lerp(r, 170, tarn * 0.4); g = lerp(g, 122, tarn * 0.4); b = lerp(b, 58, tarn * 0.4);
    r = lerp(r, 120, low * 0.25); g = lerp(g, 88, low * 0.25); b = lerp(b, 46, low * 0.25);
    r = lerp(r, 92, pat * 0.75); g = lerp(g, 112, pat * 0.75); b = lerp(b, 84, pat * 0.75);
    d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    const rough = 0.42 + tarn * 0.18 + low * 0.12 + pat * 0.4;
    rd[o] = rd[o + 1] = rd[o + 2] = rough * 255; rd[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0); rx.putImageData(rimg, 0, 0);
  const map = toTexture(cc, { repeat: true, anisotropy: 4 }); map.wrapT = THREE.ClampToEdgeWrapping;
  const roughnessMap = toTexture(rc, { srgb: false, repeat: true, anisotropy: 4 }); roughnessMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap, roughnessMap };
}
export function brassMaterial(maps) {
  const m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, roughnessMap: maps.roughnessMap, metalness: 1, roughness: 1, color: '#ffffff' });
  m.normalScale.set(0.8, 0.8);
  m.userData.detail = { scratch: 0.5, bump: 0.3 };
  return m;
}

// Thrown clay: wheel rings round the pot, mottled firing, a darker slip band; seamless in u.
export function clayMaps(seed = 5, { base = [176, 96, 60], slip = [92, 40, 26], band = [0.55, 0.75], W = 512, H = 256 } = {}) {
  const h = new Float32Array(W * H);
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x, o = i * 4;
    const rings = Math.sin(v * 190 + pnoise(u, v, 3, 2, seed) * 3) * 0.5 + 0.5;
    const grit = noise2(x / 1.6 + seed * 10, y / 1.6) > 0.72 ? 1 : 0;
    h[i] = 0.5 + rings * 0.06 + grit * 0.05 + pfbm(u, v, 12, 8, 3, seed) * 0.04;
    const mott = pfbm(u, v, 6, 4, 4, seed + 3) * 0.22, fire = sat(pfbm(u, v, 3, 2, 3, seed + 6) * 1.6) * 0.3;
    const inBand = sat((v - band[0]) * 40) * sat((band[1] - v) * 40);
    const k = 0.9 + mott - fire + rings * 0.04 - grit * 0.12;
    const c = base.map((b, j) => lerp(b, slip[j], inBand * 0.85) * k);
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const map = toTexture(cc, { repeat: true, anisotropy: 4 }); map.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap: heightToNormal(h, W, H, 4, true) };
}

// Granite (mortar): speckled grey-black with feldspar flecks and chisel tooling marks; seamless in u.
export function graniteMaps(seed = 8, W = 512, H = 256) {
  const h = new Float32Array(W * H);
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x, o = i * 4;
    const sp = pnoise(u, v, 160, 80, seed), sp2 = pnoise(u, v, 60, 30, seed + 4);
    const chis = Math.pow(Math.abs(Math.sin((u * 90 + v * 14 + pnoise(u, v, 6, 3, 2) * 2) * Math.PI)), 6);
    h[i] = 0.5 - chis * 0.08 + sp * 0.03;
    let l = 60 + sp * 26 + sp2 * 16;
    if (sp > 0.68) l = 104 + sp * 20;
    const warm = sp2 > 0.4 ? 12 : 0;
    d[o] = l + warm; d[o + 1] = l + warm * 0.4; d[o + 2] = l - 2; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const map = toTexture(cc, { repeat: true, anisotropy: 4 }); map.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normalMap: heightToNormal(h, W, H, 5, true) };
}

// Rhizome skin (along u = length, v = round the tube): annulation rings, scaly patches, root scars.
export function skinMaps(kind = 'turmeric', seed = 2, W = 512, H = 128) {
  const h = new Float32Array(W * H), R = rng(seed);
  const cc = mkCanvas(W, H), cx = cc.getContext('2d'), img = cx.createImageData(W, H), d = img.data;
  const base = kind === 'turmeric' ? [196, 120, 52] : [204, 168, 118];
  const ring = kind === 'turmeric' ? [112, 62, 30] : [140, 104, 66];
  const scars = [...Array(40)].map(() => [R() * W, R() * H, 1.5 + R() * 2.5]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x, o = i * 4;
    const rr = Math.pow(Math.abs(Math.sin((u * (kind === 'turmeric' ? 64 : 34) + noise2(u * 4, v * 3 + seed) * 0.6) * Math.PI)), 14);
    const scale = noise2(x / 6 + seed, (y / H) * 6) * 0.5 + 0.5;
    let sc = 0; for (const [sx, sy, sr] of scars) { const q = ((x - sx) ** 2 + ((y - sy + H * 1.5) % H - H / 2) ** 2) / (sr * sr); if (q < 1) sc = Math.max(sc, 1 - q); }
    h[i] = 0.5 - rr * 0.12 + scale * 0.03 - sc * 0.08;
    const k = 0.85 + fbm2(u * 8 + seed, v * 3, 3) * 0.25 + scale * 0.08;
    const c = base.map((b, j) => lerp(b, ring[j], rr * 0.8 + sc * 0.6) * k);
    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  const map = toTexture(cc, { repeat: true, anisotropy: 4 });
  return { map, normalMap: heightToNormal(h, W, H, 5, true) };
}
// The cut face of a rhizome (disc UVs): turmeric's glowing orange core and darker cortex ring; ginger's
// pale fibrous yellow. Speckled vascular bundles.
export function fleshTexture(kind = 'turmeric', seed = 4) {
  const N = 256, c = mkCanvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
  const core = kind === 'turmeric' ? [255, 96, 0] : [236, 206, 120], cortex = kind === 'turmeric' ? [232, 70, 0] : [214, 182, 98], skin = kind === 'turmeric' ? [110, 60, 26] : [168, 132, 84];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N * 2 - 1, v = j / N * 2 - 1, r = Math.hypot(u, v), o = (j * N + i) * 4;
    const ringR = 0.62 + noise2(Math.atan2(v, u) * 2, seed) * 0.04;
    const ringK = Math.exp(-(((r - ringR) / 0.035) ** 2));
    const dots = noise2(i / 2.2 + seed, j / 2.2) > 0.6 ? 1 : 0;
    const fib = noise2(i / 1.5, j / 1.5 + seed) * 0.08;
    let col = core.map((cc, k) => lerp(cc, cortex[k], sat((r - 0.2) * 1.2) * 0.5 + ringK * 0.6) * (1 + fib - dots * 0.12));
    if (r > 0.93) col = skin;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toTexture(c, { anisotropy: 4 });
}

// ------------------------------------------------------------------ rhizomes
// Turmeric: a knobbly mother rhizome with branching fingers; ginger: plumper, flatter 'hands'. Rings
// (annulations) in the geometry and in the skin maps. cut: the end of the main body sliced flat (returns
// the cap position / normal so the flesh disc can be placed).
export function rhizomeGeometry(seed = 1, { kind = 'turmeric', fingers = 4, cut = false } = {}) {
  const R = rng(seed), parts = [];
  const ginger = kind === 'ginger';
  const ringF = ginger ? 70 : 110;
  let cap = null;
  const finger = (pts, r0, open = false) => {
    const curve = new THREE.CatmullRomCurve3(pts), len = curve.getLength();
    const g = varTube(curve, Math.max(10, Math.round(len * (ginger ? 120 : 170))), ginger ? 12 : 10, (u, a) => {
      const ends = open ? (u < 0.5 ? Math.pow(Math.sin(Math.PI * u), 0.35) : 1) : Math.pow(Math.sin(Math.PI * u), ginger ? 0.3 : 0.4);
      const rings = 1 - (ginger ? 0.06 : 0.09) * Math.pow(Math.abs(Math.sin(u * len * ringF)), 10);
      const lump = 1 + 0.08 * Math.sin(u * 9 + seed + a * 2) + (ginger ? 0.06 * Math.sin(a * 3 + u * 5) : 0);
      return r0 * ends * rings * lump;
    });
    if (ginger) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.72); g.computeVertexNormals(); }
    parts.push(g);
    if (open) { const e = curve.getPointAt(1), tdir = curve.getTangentAt(1); cap = { pos: e.clone(), dir: tdir.clone(), r: r0 * (ginger ? 0.97 : 1) }; if (ginger) cap.pos.y *= 0.72; }
  };
  const L = ginger ? 0.07 : 0.05, r0 = ginger ? 0.024 : 0.021;
  const main = [V3(-L, 0, 0), V3(-L * 0.35, 0.004, 0.006), V3(L * 0.35, 0.002, -0.004), V3(L, 0, 0.004)];
  finger(main, r0, cut);
  // fingers radiate from the mother rhizome; turmeric's are slender and often branch again
  for (let k = 0; k < fingers; k++) {
    const x0 = -L * 0.7 + (k / Math.max(1, fingers - 1)) * L * 1.5 + (R() - 0.5) * 0.008, s = k % 2 ? 1 : -1;
    const l = (ginger ? 0.035 : 0.045) + R() * (ginger ? 0.03 : 0.04), sweep = (R() - 0.3) * 0.5;
    const a = V3(x0, 0.002, s * r0 * 0.4), b = V3(x0 + l * (0.25 + sweep * 0.5), 0.003 + R() * 0.004, s * (r0 * 0.4 + l * 0.55)), c = V3(x0 + l * (0.45 + sweep), 0.0, s * (r0 * 0.4 + l));
    const rf = ginger ? r0 * (0.6 + R() * 0.15) : 0.0085 + R() * 0.003;
    finger([a, b, c], rf);
    if (R() < (ginger ? 0.6 : 0.55)) {
      const d = c.clone().lerp(b, 0.35), e = d.clone().add(V3(0.012 + R() * 0.015, 0.001, s * (0.006 + R() * 0.012)));
      finger([d, d.clone().lerp(e, 0.5).add(V3(0, 0.002, 0)), e], rf * 0.75);
    }
  }
  const g = merge(parts);
  g.computeBoundingBox();
  const dy = -g.boundingBox.min.y;
  g.translate(0, dy, 0);
  if (cap) cap.pos.y += dy;
  return { geometry: g, cap };
}
// A slice of rhizome: a short irregular cylinder (skin round the side), flesh on both faces.
export function sliceGeometry(r = 0.016, t = 0.004, seed = 1) {
  const R = rng(seed), seg = 20, sh = new THREE.Shape();
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU, rr = r * (1 + 0.08 * Math.sin(a * 3 + seed) + (R() - 0.5) * 0.04); i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: seg });
  g.rotateX(-Math.PI / 2);
  // disc UVs for the faces (flesh texture), centred
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * r * 1.12), 0.5 + p.getZ(i) / (2 * r * 1.12));
  return g;
}

// ------------------------------------------------------------------ spices
// Black peppercorn: a wrinkled dried drupe.
export function peppercornGeometry(r = 0.0026, seed = 7) {
  const g = new THREE.IcosahedronGeometry(r, LOD.k < 1 ? 0 : 1), p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = noise3(v.x * 4 + seed, v.y * 4, v.z * 4) * 0.12 + noise3(v.x * 9, v.y * 9 + seed, v.z * 9) * 0.06;
    v.multiplyScalar(r * (1 + n)); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
// Cardamom pod along +x: a three-sided ovoid with fine ribs, a pointed tip and a stalk stub.
export function cardamomGeometry(L = 0.017, Rr = 0.0042) {
  const g = gridSurf((u, v, p) => {
    const a = v * TAU, prof = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 0.62);
    const r = Rr * prof * (1 + 0.13 * Math.cos(3 * a)) * (1 + 0.025 * Math.sin(a * 24));
    p.set(u * L, Math.sin(a) * r, Math.cos(a) * r);
  }, 10, 8, true);
  const stalk = bake(new THREE.CylinderGeometry(0.0006, 0.0008, 0.003, 5), [-0.0012, 0, 0], [0, 0, Math.PI / 2]);
  return merge([g, stalk]);
}
// Clove: a tapered four-sided stem, four sepals and the round unopened bud.
export function cloveGeometry() {
  const stemG = bake(new THREE.CylinderGeometry(0.0013, 0.0006, 0.012, 4, 1), [0, -0.006, 0], [0, Math.PI / 4, 0]);
  const parts = [stemG];
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; parts.push(bake(new THREE.ConeGeometry(0.0009, 0.0028, 4), [Math.cos(a) * 0.0012, 0.0008, Math.sin(a) * 0.0012], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5])); }
  parts.push(bake(new THREE.IcosahedronGeometry(0.0021, 0), [0, 0.0028, 0]));
  return merge(parts);
}
// Cinnamon quill along +x: bark rolled in from both edges into a double scroll (a thin sheet with two faces).
export function cinnamonGeometry(len = 0.11, r = 0.0055, seed = 1) {
  const R = rng(seed), turns = 1.35 + R() * 0.2, th = 0.0005;
  const sheet = (off) => gridSurf((u, v, p) => {
    const side = v < 0.5 ? -1 : 1, s = Math.abs(v - 0.5) * 2;           // s: 0 at the spine, 1 at the inner edge
    const ang = s * turns * Math.PI, rr = (r - s * r * 0.55) + off;
    const cxz = side * r * 0.45;
    p.set(u * len, Math.cos(ang) * -rr + r, cxz + side * Math.sin(ang) * rr * (1 - 0.2 * s) + noise2(u * 30, v * 4 + seed) * 0.0002);
  }, 12, 14);
  const outer = sheet(th / 2), inner = sheet(-th / 2);
  const ip = inner.index.array; for (let i = 0; i < ip.length; i += 3) { const t = ip[i]; ip[i] = ip[i + 1]; ip[i + 1] = t; }
  inner.computeVertexNormals();
  return { outer, inner };
}
// Small seeds: cumin (ribbed, elongated), mustard (round), fenugreek (angular).
export const cuminGeometry = () => { const g = lathe([[0, -0.0028], [0.0007, -0.0018], [0.0009, 0], [0.0007, 0.0018], [0, 0.0028]], 5); g.rotateZ(Math.PI / 2); return g; };
export const mustardGeometry = () => new THREE.IcosahedronGeometry(0.0011, 0);
export const fenugreekGeometry = () => { const g = new THREE.BoxGeometry(0.0032, 0.0018, 0.0022); return g; };

// A heap of loose things in a bowl: n transforms on a mound (r: radius at the rim, h: height of the
// crown, y0: floor), random orientation, slight scale jitter.
export function moundMatrices(n, { r = 0.05, h = 0.02, y0 = 0, seed = 1, scale = [0.85, 1.15], flat = false } = {}) {
  const R = rng(seed), out = [], q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * r, y = y0 + h * (1 - (rr / r) ** 2) * (0.85 + R() * 0.15);
    e.set(flat ? (R() - 0.5) * 0.4 : R() * TAU, R() * TAU, flat ? (R() - 0.5) * 0.4 : R() * TAU);
    q.setFromEuler(e);
    const s = lerp(scale[0], scale[1], R());
    out.push(new THREE.Matrix4().compose(V3(Math.cos(a) * rr, y, Math.sin(a) * rr), q, V3(s, s, s)));
  }
  return out;
}
// A powder heap (turmeric, ground spice): a soft displaced cone, rim spilling out a little.
export function heapGeometry(r = 0.06, h = 0.035, seed = 3) {
  return gridSurf((u, v, p) => {
    const a = u * TAU, s = v, rr = r * s * (1 + 0.1 * noise2(Math.cos(a) * 2 + seed, Math.sin(a) * 2) * s);
    const y = h * Math.pow(1 - s, 1.4) * (1 + 0.08 * noise2(Math.cos(a) * 5, Math.sin(a) * 5 + seed)) + noise2(Math.cos(a) * rr * 300, Math.sin(a) * rr * 300) * 0.0006;
    p.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
  }, 40, 14, true);
}

// ------------------------------------------------------------------ pepper
// One fruiting spike (catkin) hanging along -y from its stalk: n drupe positions on a thin rachis.
export function pepperSpike(seed = 1, { len = 0.09, n = 44 } = {}) {
  const R = rng(seed), bend = (R() - 0.5) * 0.4;
  const pts = [...Array(6)].map((_, i) => { const u = i / 5; return V3(Math.sin(u * 1.5) * bend * len * 0.4, -u * len, Math.sin(u * 2.2 + seed) * 0.006); });
  const curve = new THREE.CatmullRomCurve3(pts);
  const rachis = varTube(curve, 12, 5, (u) => 0.0012 * (1 - u * 0.5));
  const drupes = [];
  for (let i = 0; i < n; i++) {
    const u = 0.06 + (i / n) * 0.92, p = curve.getPointAt(u), a = i * 2.4 + R() * 0.3;
    const rr = 0.0036 * (1 - 0.25 * Math.pow(u, 2)), s = (0.85 + R() * 0.25) * (1 - 0.3 * Math.pow(u, 3));
    drupes.push({ p: V3(p.x + Math.cos(a) * rr, p.y + (R() - 0.5) * 0.002, p.z + Math.sin(a) * rr), s, u });
  }
  return { rachis, drupes };
}

// ------------------------------------------------------------------ ashwagandha
// The inflated papery calyx (husk): closed lantern, or opened into five pointed lobes round the berry.
export function huskGeometry(open = false, H = 0.02, Rr = 0.008) {
  return gridSurf((u, v, p) => {
    const a = u * TAU;
    if (!open) {
      const prof = Math.pow(Math.sin(Math.PI * Math.pow(v, 0.8)), 0.85);
      const r = Rr * prof * (1 + 0.1 * Math.pow(Math.abs(Math.cos(a * 2.5)), 0.5));
      p.set(Math.cos(a) * r, v * H, Math.sin(a) * r);
    } else {
      const lobe = Math.pow(Math.abs(Math.cos(a * 2.5)), 3);
      const top = 0.45 + 0.55 * lobe, y = v * top;
      const r = Rr * (Math.pow(Math.sin(Math.PI * Math.min(0.5, Math.pow(y, 0.8))), 0.85) + Math.max(0, y - 0.45) * 2.2 * lobe);
      p.set(Math.cos(a) * r, y * H * (1 - Math.max(0, y - 0.5) * 0.6), Math.sin(a) * r);
    }
  }, 20, 8);
}
// Dried ashwagandha roots: tapering, slightly twisted, with fine rootlets; a bundle tied with twine.
export function ashwaRootGeometry(seed = 1, n = 9) {
  const R = rng(seed), parts = [];
  for (let k = 0; k < n; k++) {
    const len = 0.2 + R() * 0.08, z0 = (R() - 0.5) * 0.04, y0 = R() * 0.02, r0 = 0.006 + R() * 0.004;
    const pts = [...Array(5)].map((_, i) => { const u = i / 4; return V3(u * len - len * 0.4, y0 + Math.sin(u * 3 + k) * 0.004, z0 + Math.sin(u * 4 + k * 1.7) * 0.008 * u); });
    const c = new THREE.CatmullRomCurve3(pts);
    parts.push(varTube(c, 22, 7, (u, a) => r0 * Math.pow(1 - u * 0.92, 0.9) * (1 + 0.12 * Math.sin(u * 60 + a)) * (u < 0.02 ? 0.6 : 1)));
    for (let j = 0; j < 3; j++) {
      const u = 0.35 + R() * 0.5, p = c.getPointAt(u), s = R() < 0.5 ? -1 : 1;
      parts.push(stem([p, p.clone().add(V3(0.015 + R() * 0.02, -0.002, s * (0.01 + R() * 0.01))), p.clone().add(V3(0.03 + R() * 0.02, -0.004, s * (0.018 + R() * 0.01)))], 0.0012, 0.0003, 4));
    }
  }
  // twine round the bundle
  const tw = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU * 2.2; tw.push(V3(-0.02 + i * 0.0003, 0.011 + Math.sin(a) * 0.02, Math.cos(a) * 0.024)); }
  const twine = stem(tw, 0.0014, 0.0014, 5, 200);
  return { roots: merge(parts), twine };
}

// ------------------------------------------------------------------ amla
// Indian gooseberry: a pale translucent green sphere with six faint vertical segments.
export function amlaGeometry(r = 0.014) {
  return gridSurf((u, v, p) => {
    const a = u * TAU, ph = v * Math.PI;
    const rr = r * (1 - 0.045 * Math.pow(Math.abs(Math.cos(3 * a)), 0.35) * Math.sin(ph));
    p.set(Math.cos(a) * Math.sin(ph) * rr, -Math.cos(ph) * r * 0.92, Math.sin(a) * Math.sin(ph) * rr);
  }, 30, 16);
}

// ------------------------------------------------------------------ vessels (lathe profiles, [r, y])
export const PROFILES = {
  // hammered brass bowl (turmeric powder, peppercorns)
  bowl: [[0, 0.004], [0.03, 0.0], [0.05, 0.002], [0.072, 0.012], [0.086, 0.03], [0.092, 0.046], [0.096, 0.052], [0.093, 0.054], [0.087, 0.048], [0.08, 0.034], [0.066, 0.018], [0.045, 0.01], [0, 0.009]],
  // masala dabba: the round tin, and one katori inside it
  tin: [[0, 0.0], [0.15, 0.0], [0.158, 0.004], [0.16, 0.012], [0.16, 0.064], [0.164, 0.068], [0.158, 0.072], [0.152, 0.068], [0.152, 0.008], [0, 0.007]],
  katori: [[0, 0.008], [0.025, 0.007], [0.038, 0.012], [0.046, 0.026], [0.05, 0.05], [0.053, 0.056], [0.05, 0.057], [0.046, 0.051], [0.042, 0.028], [0.034, 0.016], [0.02, 0.012], [0, 0.0115]],
  lid: [[0, 0.016], [0.06, 0.014], [0.13, 0.008], [0.162, 0.0], [0.168, -0.004], [0.164, -0.012], [0.158, -0.006], [0.155, 0.002], [0.12, 0.007], [0, 0.011]],
  // chyawanprash: a squat lidless handi (clay), a narrow rim
  handi: [[0, 0], [0.04, 0.0], [0.07, 0.012], [0.098, 0.04], [0.11, 0.075], [0.104, 0.11], [0.085, 0.135], [0.075, 0.142], [0.078, 0.152], [0.086, 0.158], [0.082, 0.164], [0.07, 0.158], [0.066, 0.145], [0.08, 0.12], [0.092, 0.1], [0.096, 0.07], [0.086, 0.04], [0.06, 0.018], [0, 0.012]],
  plate: [[0, 0.003], [0.05, 0.0], [0.09, 0.006], [0.112, 0.016], [0.118, 0.022], [0.112, 0.022], [0.088, 0.012], [0.05, 0.009], [0, 0.01]],
  // granite mortar (thick walls, a deep bowl) and its pestle
  mortar: [[0, 0.0], [0.11, 0.0], [0.122, 0.008], [0.128, 0.03], [0.125, 0.08], [0.13, 0.11], [0.126, 0.122], [0.112, 0.125], [0.1, 0.12], [0.092, 0.1], [0.075, 0.07], [0.045, 0.052], [0, 0.048]],
  // clay diya
  diya: [[0, 0], [0.026, 0], [0.04, 0.009], [0.048, 0.022], [0.046, 0.025], [0.037, 0.016], [0.0, 0.012]],
  // brass lota (by the tulsi planter)
  lota: [[0, 0], [0.05, 0], [0.058, 0.006], [0.085, 0.04], [0.098, 0.085], [0.09, 0.13], [0.06, 0.16], [0.046, 0.175], [0.048, 0.19], [0.064, 0.205], [0.068, 0.212], [0.058, 0.214], [0.04, 0.2], [0.036, 0.17]],
};
export function pestleGeometry(len = 0.22, r = 0.026) {
  const P = [[0, 0]];
  for (let i = 0; i <= 20; i++) { const u = i / 20; P.push([r * (u < 0.15 ? Math.sqrt(Math.sin((u / 0.15) * Math.PI / 2)) : lerp(1, 0.62, Math.pow((u - 0.15) / 0.85, 0.8)) * (u > 0.95 ? Math.sqrt(Math.max(0.02, (1 - u) / 0.05)) : 1)), u * len]); }
  P.push([0, len]);
  return lathe(P, 28);
}
export function diyaGeometry() {
  const g = lathe(PROFILES.diya, 36), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = Math.pow(Math.max(0, Math.cos(a)), 8);
    p.setX(i, x * (1 + 0.55 * k)); p.setZ(i, z * (1 - 0.35 * k)); p.setY(i, p.getY(i) + 0.006 * k * (p.getY(i) > 0.015 ? 1 : 0));
  }
  g.computeVertexNormals();
  return g;
}
export function flameGeometry(h = 0.03, r = 0.0065) {
  const P = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; P.push([r * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.55)), 1.2) * (1 - u * 0.2), u * h]); }
  return lathe(P, 14);
}
// A wooden spoon (ladle) along +x, bowl at the far end.
export function spoonGeometry(len = 0.2) {
  const handle = varTube(new THREE.CatmullRomCurve3([V3(0, 0.03, 0), V3(len * 0.4, 0.022, 0), V3(len * 0.75, 0.01, 0)]), 16, 7, (u) => 0.0045 * (1 - u * 0.25));
  const bowl = new THREE.SphereGeometry(0.018, 18, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
  bowl.scale(1.25, 0.55, 1); bowl.translate(len * 0.75 + 0.018, 0.012, 0);
  return merge([handle, bowl]);
}
