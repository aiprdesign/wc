// MODERN INVENTIONS — the exhibits, modelled to hold up in Explore 3D. Every builder works in metres in the
// local frame of its plinth top (origin at the top centre, +x along the gallery, +z toward the visitor) and
// returns { group, anchors (local points for the call-outs), ... the parts inventors.js animates }.
//   bose        J. C. Bose's 1895 millimetre-wave apparatus: induction coil and tapper key, the radiator box
//               with its pyramidal horn, a wire-grating polariser, the receiving horn with the galena point-
//               contact detector (spiral spring on a crystal), a galvanometer and a bell
//   crescograph his plant-growth recorder: potted seedling, compound lever, smoked-glass plate, clockwork
//   saha        a backlit spectrogram of the seven stellar classes on a brass easel, star swatches, the equation
//   chandra     a white dwarf under a bell jar; the mass–radius curve on glass, ending at 1.4 solar masses
//   fibre       a lamp, a slide and a coherent bundle of glass fibres that carries the picture round a loop
//               onto a ground-glass screen
//   laser       a CO2 discharge tube: water jacket, bore, electrode side-arms with HV leads, mirror end caps
//               with adjustment screws, V-cradles on a breadboard; the invisible beam marks a firebrick
//   jaipur      the Jaipur Foot, whole and in section (skin rubber, tread, microcellular rubber, willow block, bolt)
//   usb         a USB-A plug at 4× scale (shell with latch windows, insulator, four contacts, overmould with the
//               trident, ribbed strain relief, cable) and the aluminium port it plugs into
//   upi         a phone on a walnut stand (screen: scanning → paid), the QR standee, a kulhad of chai
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, TAU, smoothstep } from '../../lib/math.js';
import { sdEllipsoid3, sdRoundCone3, smin, meshBody } from '../../lib/sdfmesh.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';
import {
  V3, bake, merge, lathe, box, rbox, cyl, rod, tubeAlong, curve, helix, knurl, rrShape,
  starColor, SPEC_CLASSES, spectraTexture, sahaTexture, massRadiusTexture, plotUV, dialTexture, smokedGlassTexture,
  footSectionTexture, tridentTexture, qrModules, standeeTexture, phoneScreens,
} from './inventors-assets.js';

// collect geometry per material, build one mesh per material at the end
function parts() {
  const by = new Map();
  return {
    add(key, ...geos) { if (!by.has(key)) by.set(key, []); by.get(key).push(...geos.filter(Boolean)); },
    build(parent, M, { cast = true } = {}) {
      const out = {};
      for (const [k, list] of by) {
        if (!list.length) continue;
        const m = new THREE.Mesh(merge(list), M[k]);
        m.castShadow = cast && !M[k].transparent; m.receiveShadow = true; m.name = k;
        parent.add(m); out[k] = m;
      }
      return out;
    },
  };
}
const PI = Math.PI;

// a little revealing plane (texture × colour, additive), for light drawn on glass
export function lightPlane(tex, w, h, { color = '#ffe2b0', intensity = 1.6, additive = true } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex }, uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uReveal: { value: 1 }, uOp: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform vec3 uColor; uniform float uI, uReveal, uOp; varying vec2 vUv;
      void main(){ vec4 t = texture2D(uMap, vUv); float e = uReveal * 1.1 - 0.05; float vis = smoothstep(e + 0.05, e, vUv.x);
        float lead = (uReveal > 0.0 && uReveal < 1.0) ? exp(-abs(vUv.x - e) * 60.0) * 2.0 : 0.0;
        float a = max(t.a, max(t.r, max(t.g, t.b))) * vis * uOp; if (a < 0.003) discard;
        gl_FragColor = vec4(t.rgb * uColor * uI * vis * uOp * (1.0 + lead), ${additive ? 'a' : '1.0'}); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.renderOrder = 5;
  return m;
}

// ================================================================================== J. C. BOSE, 1895
// a turned brass pillar from the board (y = 0.024) to yTop, with a collar and thumbscrew
function pillar(P, x, z, yTop) {
  const h = yTop - 0.024;
  P.add('brass', bake(lathe([[0, 0], [0.032, 0], [0.034, 0.003], [0.03, 0.007], [0.017, 0.011], [0.01, 0.015], [0.0072, 0.02], [0.0072, h - 0.016], [0.0105, h - 0.014], [0.0105, h], [0, h]], 28), [x, 0.024, z]));
  P.add('brass', knurl(0.0052, 0.006, 14, [x + 0.0135, yTop - 0.007, z], [0, 0, PI / 2]));
  P.add('brass', cyl(0.0022, 0.0022, 0.006, 8, [x + 0.0095, yTop - 0.007, z], [0, 0, PI / 2]));
}
// pyramidal horn: throat at x0 (side s0) to mouth at x1 (side s1), with a flanged lip
function horn(P, x0, x1, y, s0, s1) {
  const h = Math.abs(x1 - x0), dir = Math.sign(x1 - x0);
  const g = new THREE.CylinderGeometry(s1 / Math.SQRT2, s0 / Math.SQRT2, h, 4, 1, true);
  g.rotateY(PI / 4); g.rotateZ(-dir * PI / 2); g.translate((x0 + x1) / 2, y, 0);
  P.add('brassDS', g);
  const t = 0.004, w = 0.007;
  P.add('brass', box(t, w, s1 + 2 * w, [x1, y + s1 / 2 + w / 2, 0]), box(t, w, s1 + 2 * w, [x1, y - s1 / 2 - w / 2, 0]), box(t, s1, w, [x1, y, s1 / 2 + w / 2]), box(t, s1, w, [x1, y, -s1 / 2 - w / 2]));
}
function boxWithFlanges(P, cx, y, len, side) {
  P.add('brass', rbox(len, side, side, 0.004, [cx, y, 0]));
  for (const s of [-1, 1]) {
    const x = cx + s * (len / 2 - 0.003);
    P.add('brassDark', rbox(0.006, side + 0.01, side + 0.01, 0.002, [x, y, 0]));
    for (const [dy, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) P.add('brass', bake(new THREE.SphereGeometry(0.0022, 8, 6), [x + s * 0.003, y + dy * (side / 2 + 0.0015), dz * (side / 2 + 0.0015)]));
  }
}
function wire(P, pts, r = 0.0016, key = 'cloth', segs = 40) { P.add(key, tubeAlong(curve(pts), r, segs, 6)); }

export function buildBose(M) {
  const G = new THREE.Group(), P = parts();
  const Y = 0.17, SIDE = 0.085;
  // baseboard with a moulded edge and a brass bench rail
  P.add('wood', rbox(0.94, 0.022, 0.32, 0.006, [0, 0.011, 0]));
  P.add('wood', rbox(0.9, 0.006, 0.28, 0.003, [0, 0.025, 0]));
  P.add('brassDark', rbox(0.84, 0.006, 0.026, 0.002, [0, 0.03, 0]));
  for (let i = 0; i < 9; i++) P.add('brass', cyl(0.0035, 0.0035, 0.002, 10, [-0.4 + i * 0.1, 0.034, 0]));
  // ---- transmitter: radiator box, horn, terminals
  pillar(P, -0.29, 0, Y - SIDE / 2);
  boxWithFlanges(P, -0.29, Y, 0.12, SIDE);
  horn(P, -0.23, -0.125, Y, 0.05, 0.108);
  for (const z of [-0.022, 0.022]) { P.add('ebonite', cyl(0.0065, 0.0075, 0.02, 16, [-0.31, Y + SIDE / 2 + 0.01, z])); P.add('brass', knurl(0.0075, 0.007, 16, [-0.31, Y + SIDE / 2 + 0.023, z])); P.add('brass', cyl(0.0025, 0.0025, 0.006, 8, [-0.31, Y + SIDE / 2 + 0.03, z])); }
  // ---- induction coil on its box, discharger rods and balls
  const CZ = -0.1, CX = -0.36;
  P.add('wood', rbox(0.18, 0.05, 0.09, 0.004, [CX, 0.024 + 0.025, CZ]));
  P.add('ebonite', cyl(0.026, 0.026, 0.12, 32, [CX, 0.104, CZ], [0, 0, PI / 2]));
  for (let k = 0; k < 7; k++) P.add('cloth', bake(new THREE.TorusGeometry(0.0262, 0.0012, 5, 32), [CX - 0.05 + k * 0.0167, 0.104, CZ], [0, PI / 2, 0]));
  for (const s of [-1, 1]) {
    P.add('ebonite', cyl(0.033, 0.033, 0.007, 32, [CX + s * 0.064, 0.104, CZ], [0, 0, PI / 2]));
    P.add('brass', bake(new THREE.TorusGeometry(0.033, 0.0016, 6, 32), [CX + s * 0.064, 0.104, CZ], [0, PI / 2, 0]));
    const bx = CX + s * 0.064, tip = CX + s * 0.011;
    P.add('brass', rod(V3(bx, 0.137, CZ), V3(bx, 0.165, CZ), 0.0022), rod(V3(bx, 0.165, CZ), V3(tip, 0.165, CZ), 0.0022));
    P.add('brass', bake(new THREE.SphereGeometry(0.0034, 12, 8), [bx, 0.165, CZ]));
    P.add('nickel', bake(new THREE.SphereGeometry(0.0065, 18, 12), [tip, 0.165, CZ]));
    P.add('ebonite', cyl(0.005, 0.006, 0.01, 12, [bx, 0.142, CZ]));
  }
  // contact breaker (hammer) and its adjusting screw at the box end
  P.add('brass', box(0.003, 0.03, 0.012, [CX + 0.084, 0.09, CZ]), cyl(0.0045, 0.0045, 0.004, 12, [CX + 0.084, 0.105, CZ], [0, 0, PI / 2]));
  P.add('brass', box(0.012, 0.022, 0.008, [CX + 0.1, 0.085, CZ]), knurl(0.004, 0.006, 12, [CX + 0.1, 0.1, CZ], [0, 0, PI / 2]));
  // ---- tapper key
  const KX = -0.39, KZ = 0.105;
  P.add('wood', rbox(0.08, 0.01, 0.036, 0.003, [KX, 0.029, KZ]));
  P.add('brass', box(0.012, 0.012, 0.016, [KX - 0.02, 0.04, KZ]), cyl(0.0035, 0.0035, 0.008, 10, [KX + 0.026, 0.038, KZ]));
  const key = new THREE.Group(); key.position.set(KX - 0.02, 0.047, KZ); G.add(key);
  const KP = parts();
  KP.add('brass', box(0.066, 0.004, 0.009, [0.033, 0, 0]));
  KP.add('ebonite', bake(lathe([[0, 0], [0.006, 0], [0.011, 0.004], [0.012, 0.008], [0.008, 0.012], [0, 0.013]], 20), [0.06, 0.002, 0]));
  KP.build(key, M);
  // ---- polariser: a brass ring strung with parallel wires
  pillar(P, 0, 0, Y - 0.067);
  P.add('brass', rod(V3(0, Y - 0.068, 0), V3(0, Y - 0.06, 0), 0.0045));
  P.add('brass', bake(new THREE.TorusGeometry(0.06, 0.0042, 10, 64), [0, Y, 0], [0, PI / 2, 0]));
  P.add('brassDark', bake(new THREE.TorusGeometry(0.054, 0.0018, 6, 64), [0, Y, 0], [0, PI / 2, 0]));
  for (let i = -6; i <= 6; i++) { const z = i * 0.0082, hh = Math.sqrt(0.056 ** 2 - z * z); P.add('copper', rod(V3(0, Y - hh, z), V3(0, Y + hh, z), 0.00055, 4)); }
  // ---- receiver: horn, box, galena detector on top
  pillar(P, 0.29, 0, Y - SIDE / 2);
  boxWithFlanges(P, 0.29, Y, 0.12, SIDE);
  horn(P, 0.23, 0.125, Y, 0.05, 0.108);
  const DY = Y + SIDE / 2;
  P.add('ebonite', rbox(0.056, 0.012, 0.044, 0.003, [0.3, DY + 0.006, 0]));
  P.add('brass', bake(lathe([[0, 0], [0.012, 0], [0.013, 0.003], [0.0125, 0.009], [0.0105, 0.0095], [0.01, 0.004], [0, 0.004]], 24), [0.29, DY + 0.012, 0]));
  const R = rng(1895);
  for (let k = 0; k < 4; k++) { const s = 0.0055 + R() * 0.004; P.add('galena', box(s, s, s, [0.29 + (R() - 0.5) * 0.009, DY + 0.019 + s * 0.3, (R() - 0.5) * 0.009], [R() * 0.8, R() * PI, R() * 0.8])); }
  P.add('brass', rod(V3(0.318, DY + 0.012, 0), V3(0.318, DY + 0.052, 0), 0.0028), rod(V3(0.318, DY + 0.05, 0), V3(0.288, DY + 0.05, 0), 0.0024));
  P.add('brass', knurl(0.0058, 0.008, 16, [0.29, DY + 0.059, 0]), rod(V3(0.29, DY + 0.054, 0), V3(0.29, DY + 0.04, 0), 0.0013));
  P.add('nickel', bake(helix(0.0024, 0.00045, -0.016, 0, 6, 120, 5), [0.29, DY + 0.04, 0]));
  P.add('brass', cyl(0.004, 0.004, 0.006, 10, [0.318, DY + 0.016, 0.014], [PI / 2, 0, 0]), cyl(0.004, 0.004, 0.006, 10, [0.278, DY + 0.016, 0.016], [PI / 2, 0, 0]));
  // ---- galvanometer
  const GX = 0.395, GZ = 0.1, GY = 0.024;
  P.add('brass', bake(lathe([[0, 0], [0.044, 0], [0.046, 0.003], [0.043, 0.006], [0.041, 0.026], [0.044, 0.028], [0.044, 0.032], [0.038, 0.032], [0.038, 0.029], [0, 0.029]], 48), [GX, GY, GZ]));
  P.add('brass', bake(new THREE.TorusGeometry(0.0425, 0.0022, 6, 48), [GX, GY + 0.031, GZ], [PI / 2, 0, 0]));
  for (const s of [-1, 1]) { P.add('ebonite', cyl(0.004, 0.005, 0.01, 12, [GX + s * 0.028, GY + 0.004, GZ + 0.04])); P.add('brass', knurl(0.0052, 0.006, 12, [GX + s * 0.028, GY + 0.012, GZ + 0.04])); }
  const dialM = new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.7, metalness: 0 });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.037, 48), dialM); dial.rotation.x = -PI / 2; dial.position.set(GX, GY + 0.0292, GZ); dial.receiveShadow = true; G.add(dial);
  const needle = new THREE.Group(); needle.position.set(GX, GY + 0.0302, GZ + 0.24 * 0.037); G.add(needle);
  const nd = new THREE.Mesh(merge([box(0.0009, 0.0006, 0.028, [0, 0, -0.014]), cyl(0.0018, 0.0018, 0.0016, 12)]), M.ebonite); needle.add(nd);
  const gGlass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 48), M.glass); gGlass.rotation.x = -PI / 2; gGlass.position.set(GX, GY + 0.0315, GZ); G.add(gGlass);
  // ---- the bell that rang across the hall
  const BX = 0.405, BZ = -0.095;
  P.add('wood', rbox(0.05, 0.01, 0.05, 0.003, [BX, 0.029, BZ]));
  P.add('brass', rod(V3(BX, 0.034, BZ), V3(BX, 0.1, BZ), 0.0025));
  P.add('brassDS', bake(lathe([[0.0, 0.03], [0.006, 0.0295], [0.012, 0.026], [0.017, 0.016], [0.021, 0.004], [0.024, 0.0], [0.0235, -0.002]], 32), [BX, 0.075, BZ]));
  P.add('brass', bake(new THREE.SphereGeometry(0.004, 10, 8), [BX + 0.018, 0.078, BZ]), box(0.03, 0.003, 0.004, [BX + 0.03, 0.078, BZ]));
  P.add('ebonite', cyl(0.009, 0.011, 0.018, 16, [BX + 0.046, 0.048, BZ]));
  // ---- wires
  wire(P, [[CX - 0.064, 0.137, CZ + 0.006], [CX - 0.06, 0.2, CZ + 0.03], [-0.33, 0.25, -0.03], [-0.31, Y + SIDE / 2 + 0.033, -0.022]]);
  wire(P, [[CX + 0.064, 0.137, CZ + 0.006], [CX + 0.055, 0.19, CZ + 0.05], [-0.315, 0.24, 0.02], [-0.31, Y + SIDE / 2 + 0.033, 0.022]]);
  wire(P, [[KX + 0.026, 0.042, KZ], [KX + 0.06, 0.03, KZ - 0.02], [CX + 0.05, 0.03, CZ + 0.08], [CX + 0.09, 0.05, CZ + 0.046]], 0.0014);
  wire(P, [[0.318, DY + 0.016, 0.018], [0.36, DY - 0.01, 0.06], [0.37, 0.07, 0.12], [GX + 0.028, GY + 0.015, GZ + 0.04]], 0.0014);
  wire(P, [[0.278, DY + 0.016, 0.02], [0.3, DY - 0.03, 0.09], [0.34, 0.06, 0.15], [GX - 0.028, GY + 0.015, GZ + 0.04]], 0.0014);
  wire(P, [[GX + 0.028, GY + 0.015, GZ + 0.035], [GX + 0.05, 0.03, 0.0], [BX + 0.046, 0.045, BZ + 0.02], [BX + 0.046, 0.058, BZ]], 0.0012);
  P.build(G, M);
  const anchors = {
    txHorn: V3(-0.125, Y + 0.054, 0), rxHorn: V3(0.125, Y + 0.054, 0), galena: V3(0.29, DY + 0.024, 0), coilGap: V3(CX, 0.165, CZ),
    focus: V3(0, 0.15, 0), galvo: V3(GX, GY + 0.03, GZ),
  };
  return { group: G, anchors, needle, key, Y };
}

// ================================================================================== the crescograph
function leafGeo(len, w, curl = 0.25) {
  const g = new THREE.PlaneGeometry(len, w, 8, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = Math.min(1, Math.max(0, p.getX(i) / len + 0.5)), y = p.getY(i) / (w / 2);
    const prof = Math.sin(PI * Math.pow(x, 0.8)) * (1 - 0.15 * x);
    p.setXYZ(i, x * len, y * prof * w / 2, -Math.abs(y) * curl * w * 0.4 - x * x * len * 0.25);
  }
  g.computeVertexNormals();
  return g;
}
export function buildCrescograph(M) {
  const G = new THREE.Group(), P = parts();
  P.add('woodLight', rbox(0.4, 0.02, 0.3, 0.005, [0, 0.01, 0]));
  // the pot, soil and seedling
  const PX = -0.11, PZ = 0.035;
  P.add('terracotta', bake(lathe([[0, 0], [0.03, 0], [0.032, 0.003], [0.04, 0.058], [0.046, 0.06], [0.047, 0.07], [0.042, 0.071], [0.039, 0.064], [0.033, 0.01], [0, 0.01]], 32), [PX, 0.02, PZ]));
  P.add('soil', cyl(0.0395, 0.038, 0.004, 28, [PX, 0.081, PZ]));
  const stemC = curve([[PX, 0.08, PZ], [PX + 0.004, 0.13, PZ + 0.002], [PX - 0.002, 0.19, PZ - 0.002], [PX + 0.004, 0.247, PZ]]);
  const stemM = new THREE.MeshStandardMaterial({ color: '#58743a', roughness: 0.6 });
  M.stem = stemM;
  P.add('stem', tubeAlong(stemC, (u) => 0.0028 - 0.0014 * u, 32, 7));
  const L = new THREE.Vector3();
  [[0.32, 0.6, 0.042], [0.5, -2.4, 0.038], [0.68, 1.4, 0.034], [0.84, -1.0, 0.026]].forEach(([u, yaw, len]) => {
    stemC.getPointAt(u, L);
    P.add('leaf', bake(leafGeo(len, len * 0.46), [L.x, L.y, L.z], [0, yaw, 0.55]));
  });
  P.add('brass', bake(new THREE.TorusGeometry(0.004, 0.0012, 6, 16), [PX + 0.004, 0.247, PZ], [PI / 2, 0, 0]));
  // column, compound lever, thread, stylus
  const CX = -0.04, CZ = -0.06, LY = 0.3;
  P.add('brass', bake(lathe([[0, 0], [0.026, 0], [0.026, 0.006], [0.012, 0.012], [0.006, 0.016], [0.006, LY - 0.03], [0, LY - 0.03]], 24), [CX, 0.02, CZ]));
  P.add('brassDark', rbox(0.018, 0.014, 0.018, 0.002, [CX, LY - 0.003, CZ]));
  P.add('nickel', rod(V3(PX + 0.004, LY, CZ), V3(0.14, LY, CZ), 0.0016));
  P.add('brass', cyl(0.009, 0.009, 0.014, 16, [CX - 0.05, LY, CZ], [0, 0, PI / 2]));
  P.add('nickel', rod(V3(PX + 0.004, LY, CZ), V3(PX + 0.004, 0.249, PZ), 0.00035, 3));
  P.add('nickel', rod(V3(0.14, LY, CZ), V3(0.14, 0.2, CZ), 0.0012), rod(V3(0.14, 0.2, CZ), V3(0.14, 0.2, -0.1025), 0.0009));
  P.add('brass', bake(new THREE.SphereGeometry(0.0022, 8, 6), [0.14, LY, CZ]), bake(new THREE.SphereGeometry(0.002, 8, 6), [0.14, 0.2, CZ]));
  // smoked-glass plate on its carriage, clockwork with a dial
  const plateM = new THREE.MeshStandardMaterial({ map: smokedGlassTexture(), roughness: 0.35, metalness: 0 });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.09), plateM); plate.position.set(0.14, 0.2, -0.105); G.add(plate);
  P.add('brass', box(0.128, 0.004, 0.006, [0.14, 0.247, -0.106]), box(0.128, 0.004, 0.006, [0.14, 0.153, -0.106]), box(0.004, 0.098, 0.006, [0.078, 0.2, -0.106]), box(0.004, 0.098, 0.006, [0.202, 0.2, -0.106]));
  P.add('brass', rod(V3(0.09, 0.07, -0.106), V3(0.09, 0.152, -0.106), 0.0025), rod(V3(0.19, 0.07, -0.106), V3(0.19, 0.152, -0.106), 0.0025));
  P.add('blackAnod', rbox(0.17, 0.05, 0.05, 0.004, [0.14, 0.045, -0.11]));
  P.add('brass', rbox(0.072, 0.08, 0.062, 0.005, [0.09, 0.06, 0.07]));
  const dialM = new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.7 });
  const d = new THREE.Mesh(new THREE.CircleGeometry(0.022, 32), dialM); d.position.set(0.09, 0.066, 0.1012); G.add(d);
  P.add('brass', bake(new THREE.TorusGeometry(0.023, 0.0018, 6, 32), [0.09, 0.066, 0.101]));
  P.add('brass', cyl(0.002, 0.002, 0.012, 8, [0.128, 0.07, 0.07], [0, 0, PI / 2]), box(0.004, 0.016, 0.003, [0.136, 0.07, 0.07]));
  P.build(G, M);
  return { group: G, anchors: { plate: V3(0.14, 0.23, -0.104), plant: V3(PX, 0.2, PZ), focus: V3(0.02, 0.17, 0) } };
}

// ================================================================================== MEGHNAD SAHA, 1920
export function buildSaha(M) {
  const G = new THREE.Group(), P = parts();
  // easel
  for (const s of [-1, 1]) P.add('brass', rod(V3(s * 0.2, 0, 0.06), V3(s * 0.15, 0.44, -0.035), 0.0045), bake(new THREE.SphereGeometry(0.007, 12, 8), [s * 0.15, 0.442, -0.035]));
  P.add('brass', rod(V3(0, 0, -0.18), V3(0, 0.43, -0.045), 0.004));
  P.add('brassDark', rbox(0.5, 0.012, 0.03, 0.003, [0, 0.064, 0.048]), rbox(0.5, 0.02, 0.006, 0.002, [0, 0.074, 0.063]));
  for (const s of [-1, 1]) P.add('brass', bake(new THREE.SphereGeometry(0.008, 12, 8), [s * 0.2, 0.004, 0.06]));
  // the light box: a brass-framed case, the plate as its glowing face
  const box2 = new THREE.Group(); box2.position.set(0, 0.07 + 0.17, 0.035); box2.rotation.x = -0.16; G.add(box2);
  const BP = parts();
  BP.add('blackAnod', rbox(0.48, 0.32, 0.04, 0.006, [0, 0, -0.022]));
  BP.add('blackAnod', rbox(0.5, 0.018, 0.012, 0.003, [0, 0.168, 0.0]), rbox(0.5, 0.018, 0.012, 0.003, [0, -0.168, 0.0]), rbox(0.018, 0.32, 0.012, 0.003, [0.241, 0, 0]), rbox(0.018, 0.32, 0.012, 0.003, [-0.241, 0, 0]));
  BP.add('brassDark', rbox(0.47, 0.003, 0.004, 0.001, [0, 0.156, 0.006]), rbox(0.47, 0.003, 0.004, 0.001, [0, -0.156, 0.006]));
  for (const [x, y] of [[0.241, 0.168], [-0.241, 0.168], [0.241, -0.168], [-0.241, -0.168]]) BP.add('brass', bake(new THREE.SphereGeometry(0.0045, 10, 8), [x, y, 0.007]));
  BP.add('blackAnod', cyl(0.012, 0.012, 0.03, 16, [0.2, 0.12, -0.05], [PI / 2, 0, 0]));
  BP.add('cloth', tubeAlong(curve([[0.2, 0.12, -0.065], [0.22, 0.05, -0.12], [0.2, -0.17, -0.16], [0.2, -0.24, -0.19]]), 0.0022, 24, 6));
  BP.build(box2, M);
  const plateMat = new THREE.MeshBasicMaterial({ map: spectraTexture(), toneMapped: true });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.464, 0.304), plateMat); plate.position.z = 0.0005; box2.add(plate);
    // star swatches on a walnut bar, one per class (O … M), coloured by temperature
  P.add('wood', rbox(0.5, 0.02, 0.046, 0.004, [0, 0.01, 0.17]));
  const stars = [];
  SPEC_CLASSES.forEach((c, i) => {
    const x = -0.21 + i * 0.07, h = 0.05;
    P.add('brass', rod(V3(x, 0.02, 0.17), V3(x, 0.02 + h, 0.17), 0.0014), cyl(0.005, 0.006, 0.004, 12, [x, 0.022, 0.17]));
    const col = starColor(c.T), r = 0.0105 + 0.004 * (1 - i / 6);
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.85) }));
    m.position.set(x, 0.02 + h + r, 0.17); G.add(m); stars.push({ m, col, x, y: 0.02 + h + r });
  });
  P.build(G, M);
  const eq = lightPlane(sahaTexture(), 0.62, 0.133, { color: '#ffdca6', intensity: 1.5 });
  eq.position.set(0, 0.53, -0.02); G.add(eq);
  return { group: G, anchors: { plateA: V3(-0.16, 0.07 + 0.17 + 0.04, 0.045), eq: V3(0.2, 0.55, -0.02), focus: V3(0, 0.26, 0) }, eq, plate: plateMat, stars };
}

// ================================================================================== S. CHANDRASEKHAR, 1930
export function buildChandra(M, lite) {
  const G = new THREE.Group(), P = parts();
  P.add('ebonite', bake(lathe([[0, 0], [0.15, 0], [0.153, 0.004], [0.152, 0.028], [0.146, 0.034], [0.141, 0.036], [0.141, 0.042], [0, 0.042]], 72), [0, 0, 0.04]));
  P.add('brass', bake(new THREE.TorusGeometry(0.143, 0.0032, 8, 96), [0, 0.037, 0.04], [PI / 2, 0, 0]));
  P.add('brass', bake(new THREE.TorusGeometry(0.152, 0.0024, 8, 96), [0, 0.016, 0.04], [PI / 2, 0, 0]));
  P.add('brass', rod(V3(0, 0.042, 0.04), V3(0, 0.1, 0.04), 0.0016), cyl(0.012, 0.016, 0.006, 24, [0, 0.045, 0.04]));
  // bell jar
  const jarPts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * PI / 2; jarPts.push([0.115 * Math.cos(a) + 0.0, 0.2 + 0.09 * Math.sin(a)]); }
  const jar = new THREE.Mesh(merge([lathe([[0.118, 0.042], [0.116, 0.05], [0.115, 0.2], ...jarPts.slice(1)], 56), bake(lathe([[0.0001, 0.288], [0.012, 0.29], [0.014, 0.3], [0.009, 0.312], [0.0001, 0.316]], 24), [0, 0, 0])]), M.glass);
  jar.position.z = 0.04; jar.renderOrder = 6; G.add(jar);
  // the white dwarf
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 3.2 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uI; varying vec3 vN; varying vec3 vV;
      void main(){ float mu = max(dot(normalize(vN), normalize(vV)), 0.0); float limb = 0.45 + 0.55 * pow(mu, 0.6);
        gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * uI * limb, 1.0); }`,
  });
  const star = new THREE.Mesh(new THREE.SphereGeometry(0.034, lite ? 24 : 48, lite ? 16 : 32), starMat); star.position.set(0, 0.15, 0.04); G.add(star);
  // the plot on glass, in a slotted brass foot
  const PZ = -0.19;
  P.add('brassDark', rbox(0.46, 0.022, 0.034, 0.004, [0, 0.011, PZ]));
  for (const s of [-1, 1]) P.add('brass', rod(V3(s * 0.215, 0.02, PZ), V3(s * 0.215, 0.39, PZ), 0.0035), bake(new THREE.SphereGeometry(0.0055, 10, 8), [s * 0.215, 0.392, PZ]));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.31), M.glassTint); pane.position.set(0, 0.2, PZ); G.add(pane);
  const plot = lightPlane(massRadiusTexture(), 0.44, 0.31, { color: '#ffe6c0', intensity: 1.5 }); plot.position.set(0, 0.2, PZ + 0.002); G.add(plot);
  P.build(G, M);
  const toPlot = (m, out) => { const [u, v] = plotUV(m); return out.set((u - 0.5) * 0.44, 0.2 + (v - 0.5) * 0.31, PZ + 0.004); };
  return { group: G, anchors: { star: V3(0, 0.15, 0.04), limit: toPlot(1.44, V3()), focus: V3(0, 0.18, -0.05) }, star, starMat, plot, toPlot };
}

// ================================================================================== KAPANY & HOPKINS, 1954
function slideImage() {
  const S = 256, c = mkCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  // a lotus: eight petals, a ring and a seed head
  for (let k = 0; k < 8; k++) {
    g.save(); g.rotate((k / 8) * TAU);
    const grd = g.createLinearGradient(0, 0, 0, -100); grd.addColorStop(0, '#ffcf7a'); grd.addColorStop(1, '#ff7a3c');
    g.fillStyle = grd; g.beginPath(); g.moveTo(0, -18); g.bezierCurveTo(34, -50, 26, -86, 0, -104); g.bezierCurveTo(-26, -86, -34, -50, 0, -18); g.fill();
    g.restore();
  }
  g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill();
  g.fillStyle = '#c86a2a'; for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; g.beginPath(); g.arc(Math.cos(a) * 11, Math.sin(a) * 11, 3.5, 0, TAU); g.fill(); }
  return toTexture(c);
}
export function buildFibre(M, lite) {
  const G = new THREE.Group(), P = parts();
  const AY = 0.115;
  // the lamp: finned housing, condenser barrel, glowing lens, on a pillar
  const lampG = lathe([[0, 0], [0.028, 0], [0.033, 0.005], [0.034, 0.09], [0.026, 0.095], [0.024, 0.098], [0.024, 0.118], [0.019, 0.12], [0.019, 0.148], [0.016, 0.15], [0, 0.15]], 36);
  P.add('blackAnod', bake(lampG, [-0.37, AY, 0], [0, 0, -PI / 2]));
  for (let k = 0; k < 7; k++) P.add('brass', cyl(0.042, 0.042, 0.0028, 40, [-0.36 + k * 0.011, AY, 0], [0, 0, PI / 2]));
  P.add('brass', bake(new THREE.TorusGeometry(0.019, 0.0022, 6, 32), [-0.221, AY, 0], [0, PI / 2, 0]));
  P.add('blackAnod', rbox(0.04, 0.012, 0.012, 0.003, [-0.32, AY + 0.04, 0]), cyl(0.004, 0.004, 0.03, 8, [-0.32, AY + 0.058, 0]));
  P.add('cloth', tubeAlong(curve([[-0.37, AY, 0], [-0.4, AY - 0.02, -0.03], [-0.39, 0.02, -0.12], [-0.3, 0.008, -0.2]]), 0.0024, 24, 6));
  P.add('brass', bake(lathe([[0, 0], [0.03, 0], [0.032, 0.004], [0.016, 0.01], [0.008, 0.014], [0.0065, 0.018], [0.0065, AY - 0.05], [0.012, AY - 0.046], [0.012, AY - 0.034], [0, AY - 0.034]], 24), [-0.3, 0, 0]));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0').multiplyScalar(1.5) }));
  lens.rotation.y = PI / 2; lens.position.set(-0.2195, AY, 0); G.add(lens);
  // the slide in its holder
  const img = slideImage();
  P.add('brass', rbox(0.004, 0.05, 0.05, 0.001, [-0.205, AY, 0]));
  P.add('brass', bake(lathe([[0, 0], [0.018, 0], [0.018, 0.004], [0.006, 0.008], [0.0045, 0.012], [0.0045, AY - 0.05], [0, AY - 0.05]], 20), [-0.205, 0, 0]));
  const slide = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: img, color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) }));
  slide.rotation.y = -PI / 2; slide.position.set(-0.2025, AY, 0); G.add(slide);
  // input ferrule on a V-block
  P.add('brass', cyl(0.011, 0.011, 0.04, 28, [-0.17, AY, 0], [0, 0, PI / 2]), cyl(0.013, 0.013, 0.006, 28, [-0.188, AY, 0], [0, 0, PI / 2]));
  P.add('blackAnod', rbox(0.03, AY - 0.012, 0.03, 0.003, [-0.17, (AY - 0.012) / 2, 0]));
  // ---- the bundle
  const C = curve([[-0.15, AY, 0], [-0.09, AY + 0.002, 0], [-0.03, 0.17, 0.03], [0.05, 0.245, 0.005], [0.14, 0.22, -0.07], [0.205, 0.15, -0.04], [0.205, AY + 0.005, 0.04], [0.195, AY, 0.1]]);
  const NS = lite ? 30 : 48, frames = C.computeFrenetFrames(NS, false), RB = 0.0085, RF = 0.00052;
  const rOf = (u) => { const s = Math.min(1, Math.max(0, (u - 0.08) / 0.84)); return RB + 0.03 * Math.pow(Math.sin(PI * s), 1.4); };
  const offs = []; const rings = lite ? 3 : 4;
  for (let q = -rings; q <= rings; q++) for (let r = -rings; r <= rings; r++) { const s = -q - r; if (Math.abs(s) > rings) continue; offs.push([(q + r / 2) / (rings + 0.5), (r * Math.sqrt(3) / 2) / (rings + 0.5)]); }
  const R = rng(1954), fibreGeos = [], Pt = V3();
  offs.forEach(([ox, oy], fi) => {
    const pts = [], ph = R() * TAU, amp = 0.15 + 0.2 * R(), seed = R();
    for (let i = 0; i <= NS; i++) {
      const u = i / NS; C.getPointAt(u, Pt);
      const tw = u * 1.4, rr = rOf(u), splay = (rr - RB) / 0.03;
      const x = ox * Math.cos(tw) - oy * Math.sin(tw) + splay * amp * Math.sin(u * 9 + ph), y = ox * Math.sin(tw) + oy * Math.cos(tw) + splay * amp * Math.cos(u * 7 + ph);
      pts.push(Pt.clone().addScaledVector(frames.normals[i], x * rr).addScaledVector(frames.binormals[i], y * rr));
    }
    const g = tubeAlong(new THREE.CatmullRomCurve3(pts), RF, NS, lite ? 4 : 5);
    g.setAttribute('aF', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1));
    fibreGeos.push(g);
  });
  const fibreU = { uT: { value: 0 }, uFront: { value: 1 }, uOn: { value: 1 } };
  const fibres = new THREE.Mesh(mergeGeometries(fibreGeos), new THREE.ShaderMaterial({
    uniforms: fibreU,
    vertexShader: /* glsl */ `attribute float aF; varying float vU; varying float vF; varying vec3 vN; varying vec3 vV;
      void main(){ vU = uv.x; vF = aF; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uT, uFront, uOn; varying float vU; varying float vF; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float lit = smoothstep(uFront + 0.02, uFront - 0.04, vU);
        float head = exp(-((vU - uFront) * 22.0) * ((vU - uFront) * 22.0)) * step(uFront, 1.02);
        float pk = 0.0; for (int k = 0; k < 3; k++) { float p = fract(vU * 1.3 - uT * 0.8 + vF + float(k) * 0.33); pk += exp(-((p - 0.5) * 14.0) * ((p - 0.5) * 14.0)); }
        vec3 N = normalize(vN), Vv = normalize(vV);
        float spec = pow(max(dot(reflect(-Vv, N), normalize(vec3(-0.35, 0.85, 0.4))), 0.0), 60.0);
        float core = pow(max(dot(N, Vv), 0.0), 2.0);
        vec3 glass = vec3(0.012, 0.014, 0.016) + vec3(0.75, 0.8, 0.85) * (pow(edge, 3.0) * 0.35 + spec * 0.9);
        vec3 glow = vec3(1.0, 0.6, 0.28) * (0.05 * core + 0.42 * pk * (0.4 + 0.6 * vF) * (0.4 + 0.6 * core)) * lit * uOn + vec3(1.4, 1.0, 0.6) * head * 0.5 * uOn;
        gl_FragColor = vec4(glass + glow, 1.0);
      }`,
  }));
  G.add(fibres);
  // clamp bands and sheathed ends
  for (const u of [0.04, 0.96]) { C.getPointAt(u, Pt); const T = C.getTangentAt(u); P.add('pvc', bake(tubeAlong(curve([Pt.clone().addScaledVector(T, -0.012), Pt.clone().addScaledVector(T, 0.012)]), RB + 0.0012, 2, 18), [0, 0, 0])); }
  // output ferrule (pointing +z), its post, the projection cone and the ground-glass screen
  const OZ = 0.1;
  P.add('brass', cyl(0.011, 0.011, 0.036, 28, [0.195, AY, OZ + 0.012], [PI / 2, 0, 0]), cyl(0.013, 0.013, 0.006, 28, [0.195, AY, OZ + 0.03], [PI / 2, 0, 0]));
  P.add('brass', bake(lathe([[0, 0], [0.024, 0], [0.024, 0.004], [0.01, 0.009], [0.005, 0.013], [0.005, AY - 0.016], [0, AY - 0.016]], 20), [0.195, 0, OZ + 0.012]));
  P.add('brass', bake(new THREE.TorusGeometry(0.0125, 0.003, 6, 24), [0.195, AY, OZ + 0.012]));
  const SZ = 0.205;
  P.add('brass', rbox(0.1, 0.006, 0.006, 0.002, [0.195, AY + 0.04, SZ]), rbox(0.1, 0.006, 0.006, 0.002, [0.195, AY - 0.04, SZ]), rbox(0.006, 0.086, 0.006, 0.002, [0.147, AY, SZ]), rbox(0.006, 0.086, 0.006, 0.002, [0.243, AY, SZ]));
  P.add('brass', rod(V3(0.147, 0, SZ), V3(0.147, AY - 0.04, SZ), 0.0028), rod(V3(0.243, 0, SZ), V3(0.243, AY - 0.04, SZ), 0.0028), rbox(0.12, 0.008, 0.03, 0.003, [0.195, 0.004, SZ]));
  const screenU = { uMap: { value: img }, uOn: { value: 1 } };
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.074), new THREE.ShaderMaterial({
    uniforms: screenU,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uMap; uniform float uOn; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(0.09, 0.074);
        float r = length(p);
        // the projected bundle face: a disc of fibre cells (hexagonal dots), each carrying one sample of the picture
        vec2 g = p / 0.0016; vec2 a = vec2(g.x, g.y * 1.1547 + mod(floor(g.x), 2.0) * 0.5);
        vec2 cell = floor(a) + 0.5; vec2 cc = vec2(cell.x, (cell.y - mod(floor(g.x), 2.0) * 0.5) / 1.1547) * 0.0016;
        float dot0 = smoothstep(0.5, 0.3, length(fract(a) - 0.5));
        vec2 iuv = cc / 0.06 + 0.5;
        vec3 pic = texture2D(uMap, iuv).rgb;
        float disc = smoothstep(0.03, 0.028, r);
        vec3 base = vec3(0.05, 0.048, 0.044) + vec3(0.12, 0.09, 0.06) * exp(-r * r / 0.0012) * uOn;
        gl_FragColor = vec4(base + pic * dot0 * disc * 1.1 * uOn, 1.0);
      }`,
  }));
  screen.position.set(0.195, AY, SZ); G.add(screen);
  const coneM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc890').multiplyScalar(0.08), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.008, SZ - OZ - 0.032, 32, 1, true), coneM);
  cone.rotation.x = PI / 2; cone.position.set(0.195, AY, (SZ + OZ + 0.032) / 2); G.add(cone);
  P.build(G, M);
  return { group: G, anchors: { bundle: V3(0.05, 0.255, 0.005), screen: V3(0.215, AY + 0.03, SZ), lamp: V3(-0.3, AY + 0.04, 0), focus: V3(0.0, 0.16, 0.03) }, fibreU, screenU, lens, coneM, slide };
}

// ================================================================================== C. KUMAR N. PATEL, 1964
function breadboardTexture() {
  const W = 1024, H = 352, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1d1e20'; g.fillRect(0, 0, W, H);
  const R = rng(64);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.025})`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1); }
  for (let y = 0; y < 12; y++) for (let x = 0; x < 35; x++) {
    const px = (x + 0.5) * W / 35, py = (y + 0.5) * H / 12;
    g.fillStyle = '#060606'; g.beginPath(); g.arc(px, py, 6.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(160,160,165,0.25)'; g.lineWidth = 1; g.beginPath(); g.arc(px, py, 7.5, 0.6, 2.6); g.stroke();
  }
  return toTexture(c);
}
export function buildLaser(M) {
  const G = new THREE.Group(), P = parts();
  const bbM = new THREE.MeshStandardMaterial({ map: breadboardTexture(), metalness: 0.5, roughness: 0.5 });
  M.breadboard = bbM;
  P.add('breadboard', rbox(0.88, 0.014, 0.3, 0.003, [0, 0.007, 0]));
  const AY = 0.13, X0 = -0.28, X1 = 0.22;
  // V-cradles with O-rings
  for (const x of [-0.15, 0.09]) {
    P.add('blackAnod', rbox(0.03, AY - 0.034, 0.07, 0.003, [x, 0.014 + (AY - 0.034) / 2, 0]));
    P.add('blackAnod', box(0.03, 0.012, 0.03, [x, AY - 0.028, 0.026], [0.7, 0, 0]), box(0.03, 0.012, 0.03, [x, AY - 0.028, -0.026], [-0.7, 0, 0]));
    P.add('rubber', bake(new THREE.TorusGeometry(0.0315, 0.003, 8, 40), [x, AY, 0], [0, PI / 2, 0]));
    for (const s of [-1, 1]) P.add('steel', cyl(0.004, 0.004, 0.004, 6, [x + s * 0.009, 0.016, 0.026]), cyl(0.004, 0.004, 0.004, 6, [x + s * 0.009, 0.016, -0.026]));
  }
  // water jacket, bore and the discharge
  const jacket = new THREE.Mesh(merge([cyl(0.03, 0.03, 0.42, 48, [-0.03, AY, 0], [0, 0, PI / 2])]), M.glassTint); jacket.renderOrder = 6; G.add(jacket);
  const bore = new THREE.Mesh(cyl(0.0085, 0.0085, X1 - X0, 24, [(X0 + X1) / 2, AY, 0], [0, 0, PI / 2]), M.glass); bore.renderOrder = 7; G.add(bore);
  for (const x of [-0.24, 0.18]) P.add('glassRing', bake(new THREE.TorusGeometry(0.0285, 0.0035, 8, 40), [x, AY, 0], [0, PI / 2, 0]));
  M.glassRing = new THREE.MeshStandardMaterial({ color: '#2a3436', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.5, envMapIntensity: 1.0 });
  const plasmaU = { uT: { value: 0 }, uI: { value: 1 } };
  const plasma = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.44, 20, 40, true), new THREE.ShaderMaterial({
    uniforms: plasmaU,
    vertexShader: /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uT, uI; varying float vY; varying vec3 vN; varying vec3 vV;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){
        float core = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float s = 0.85 + 0.15 * sin(vY * 220.0 - uT * 40.0) * sin(vY * 61.0 + uT * 13.0);
        float fl = 0.9 + 0.1 * h(floor(uT * 30.0));
        float ends = smoothstep(0.22, 0.17, abs(vY));
        vec3 c = mix(vec3(0.9, 0.3, 0.75), vec3(1.2, 0.85, 1.25), core);
        gl_FragColor = vec4(c * uI * s * fl * (0.35 + 0.9 * core) * (0.6 + 0.4 * ends), 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  plasma.rotation.z = PI / 2; plasma.position.set(-0.03, AY, 0); plasma.renderOrder = 8; G.add(plasma);
  // electrode side-arms with nickel caps and HV leads to a terminal block
  for (const [x, s] of [[-0.215, -1], [0.155, 1]]) {
    const arm = new THREE.Mesh(cyl(0.006, 0.006, 0.08, 16, [x, AY + 0.04, 0]), M.glass); arm.renderOrder = 7; G.add(arm);
    P.add('nickel', cyl(0.0095, 0.0095, 0.018, 20, [x, AY + 0.085, 0]), cyl(0.0035, 0.0035, 0.01, 10, [x, AY + 0.099, 0]));
    P.add('nickel', bake(new THREE.TorusGeometry(0.0095, 0.0016, 6, 20), [x, AY + 0.076, 0], [PI / 2, 0, 0]));
    P.add('redWire', tubeAlong(curve([[x, AY + 0.104, 0], [x + s * 0.01, AY + 0.13, -0.02], [x + s * 0.03, AY + 0.08, -0.1], [x + s * 0.02 - 0.0, 0.05, -0.12], [s < 0 ? -0.06 : -0.02, 0.03, -0.12]]), 0.0026, 40, 8));
  }
  P.add('ebonite', rbox(0.08, 0.026, 0.03, 0.003, [-0.04, 0.027, -0.12]));
  for (const x of [-0.06, -0.02]) P.add('brass', knurl(0.0055, 0.008, 12, [x, 0.044, -0.12]), cyl(0.0025, 0.0025, 0.012, 8, [x, 0.052, -0.12]));
  // water barbs and clear hoses
  for (const [x, s] of [[-0.225, -1], [0.165, 1]]) {
    const barb = new THREE.Mesh(cyl(0.0045, 0.0045, 0.03, 12, [x, AY - 0.006, -0.036], [PI / 2 - 0.5, 0, 0]), M.glass); G.add(barb);
    P.add('hose', tubeAlong(curve([[x, AY - 0.016, -0.05], [x + s * 0.01, AY - 0.05, -0.08], [x + s * 0.03, 0.04, -0.13], [x + s * 0.05, 0.02, -0.16]]), 0.006, 30, 10));
  }
  M.hose = new THREE.MeshStandardMaterial({ color: '#e8f4f0', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.25, envMapIntensity: 1.0, side: THREE.DoubleSide, depthWrite: false });
  // mirror end caps: nickel blocks with a kinematic ring, three knurled adjusters with springs, the mirrors
  for (const [x, s, mk] of [[X0 - 0.012, -1, 'gold'], [X1 + 0.012, 1, 'znse']]) {
    P.add('nickel', cyl(0.016, 0.016, 0.032, 32, [x, AY, 0], [0, 0, PI / 2]));
    P.add('steel', cyl(0.024, 0.024, 0.006, 40, [x + s * 0.019, AY, 0], [0, 0, PI / 2]), cyl(0.024, 0.024, 0.006, 40, [x + s * 0.031, AY, 0], [0, 0, PI / 2]));
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.5, cy = AY + Math.cos(a) * 0.017, cz = Math.sin(a) * 0.017;
      P.add('brass', knurl(0.0045, 0.008, 14, [x + s * 0.041, cy, cz], [0, 0, PI / 2]), cyl(0.0014, 0.0014, 0.014, 6, [x + s * 0.03, cy, cz], [0, 0, PI / 2]));
      P.add('steel', bake(helix(0.0025, 0.00045, -0.003, 0.003, 4, 48, 4), [x + s * 0.025, cy, cz], [0, 0, PI / 2]));
    }
    P.add(mk, cyl(0.009, 0.009, 0.002, 28, [x + s * 0.0345, AY, 0], [0, 0, PI / 2]));
  }
  M.znse = new THREE.MeshStandardMaterial({ color: '#d8b44a', metalness: 0.3, roughness: 0.08 });
  // posts under the end caps
  for (const x of [X0 - 0.03, X1 + 0.03]) P.add('steel', cyl(0.0065, 0.0065, AY - 0.04, 16, [x, 0.014 + (AY - 0.04) / 2, 0]), rbox(0.03, 0.01, 0.03, 0.003, [x, 0.019, 0]), rbox(0.02, 0.026, 0.02, 0.003, [x, AY - 0.026, 0]));
  // the firebrick target and the beam's mark
  const TX = 0.405;
  const brickM = new THREE.MeshStandardMaterial({ color: '#9c8466', roughness: 0.95, metalness: 0 });
  M.brick = brickM;
  P.add('brick', rbox(0.035, 0.09, 0.07, 0.004, [TX + 0.0175, 0.014 + 0.045, 0]));
  P.build(G, M);
  const char = new THREE.Mesh(new THREE.CircleGeometry(0.009, 24), new THREE.MeshBasicMaterial({ color: '#1a0e08', transparent: true, opacity: 0.85, depthWrite: false }));
  char.rotation.y = -PI / 2; char.position.set(TX - 0.0002, AY, 0); G.add(char);
  const beamU = { uT: { value: 0 }, uI: { value: 0 } };
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, TX - X1 - 0.047, 10, 20, true), new THREE.ShaderMaterial({
    uniforms: beamU,
    vertexShader: /* glsl */ `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform float uT, uI; varying float vY; void main(){ float s = 0.5 + 0.5 * sin(vY * 600.0 - uT * 90.0); gl_FragColor = vec4(vec3(1.0, 0.45, 0.25) * uI * (0.25 + 0.75 * s), 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  beam.rotation.z = PI / 2; beam.position.set((X1 + 0.047 + TX) / 2, AY, 0); G.add(beam);
  return { group: G, anchors: { tube: V3(-0.08, AY + 0.006, 0), mirror: V3(X0 - 0.045, AY + 0.02, 0), spot: V3(TX, AY, 0), focus: V3(0.02, 0.12, 0) }, plasmaU, beamU, spot: V3(TX - 0.001, AY, 0), char };
}

// ================================================================================== THE JAIPUR FOOT, 1969
function footField() {
  const prims = [
    { type: 'ell', c: [0.042, 0.036, 0], r: [0.043, 0.037, 0.031] },
    { type: 'cone', a: [0.05, 0.036, 0], b: [0.16, 0.024, 0.004], ra: 0.034, rb: 0.026, flat: 1.4, k: 0.02 },
    { type: 'ell', c: [0.172, 0.021, 0.003], r: [0.032, 0.021, 0.045], k: 0.02 },
    { type: 'cone', a: [0.06, 0.04, -0.002], b: [0.07, 0.1, 0], ra: 0.036, rb: 0.03, flat: 1.0, k: 0.03 },
    { type: 'ell', c: [0.224, 0.0165, 0.027], r: [0.026, 0.0158, 0.0135], k: 0.008 },
    { type: 'ell', c: [0.217, 0.0138, 0.007], r: [0.021, 0.0122, 0.0096], k: 0.006 },
    { type: 'ell', c: [0.209, 0.0124, -0.0108], r: [0.019, 0.0114, 0.009], k: 0.006 },
    { type: 'ell', c: [0.199, 0.0114, -0.026], r: [0.017, 0.0104, 0.0086], k: 0.006 },
    { type: 'ell', c: [0.187, 0.0104, -0.0385], r: [0.0148, 0.0094, 0.0083], k: 0.006 },
  ];
  const d3 = (p, x, y, z) => (p.type === 'ell' ? sdEllipsoid3(x, y, z, p.c, p.r) : sdRoundCone3(x, y, z, p));
  return (x, y, z) => {
    let d = 1e9;
    for (const p of prims) d = smin(d, d3(p, x, y, z), p.k ?? 0);
    const arch = 0.007 * Math.exp(-(((x - 0.11) / 0.04) ** 2)) * smoothstep(-0.005, 0.035, z);
    d = Math.max(d, y - 0.1, -y + arch);
    return d;
  };
}
function meshField(f, h) {
  const body = { field2: () => -1, column: () => undefined, columnField: f };
  return meshBody(body, [-0.012, -0.006, -0.058], [0.262, 0.108, 0.058], h, { project: 2 });
}
export function buildJaipur(M, lite) {
  const G = new THREE.Group(), P = parts();
  const f = footField(), h = lite ? 0.0056 : 0.0026;
  const skin = new THREE.MeshPhysicalMaterial({ color: '#a26f50', roughness: 0.52, metalness: 0, sheen: 0.5, sheenColor: new THREE.Color('#e8b896'), sheenRoughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.5 });
  skin.userData.detail = { albedo: 0.12, rough: 0.35, bump: 0.00004, scratch: 0.05, grime: 0.15, scale: 6 };
  // display base
  P.add('wood', rbox(0.58, 0.024, 0.27, 0.005, [0, 0.012, 0]));
  P.add('acrylicBlock', rbox(0.14, 0.022, 0.08, 0.004, [-0.15, 0.035, 0.02], [0, 0.65, 0]));
  M.acrylicBlock = new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.25, envMapIntensity: 1.0 });
  // the whole foot, toes forward toward the visitor, with its bolt
  const full = new THREE.Mesh(meshField(f, h), skin); full.castShadow = full.receiveShadow = true;
  const fullG = new THREE.Group(); fullG.position.set(-0.2, 0.046, -0.05); fullG.rotation.y = -0.85; G.add(fullG); fullG.add(full);
  const BP = parts();
  BP.add('steel', cyl(0.0055, 0.0055, 0.03, 16, [0.07, 0.112, 0]), cyl(0.0105, 0.0105, 0.006, 6, [0.07, 0.103, 0]), cyl(0.014, 0.014, 0.0018, 28, [0.07, 0.1005, 0]));
  for (let k = 0; k < 8; k++) BP.add('steel', bake(new THREE.TorusGeometry(0.0055, 0.0007, 4, 16), [0.07, 0.108 + k * 0.0028, 0], [PI / 2, 0, 0]));
  BP.build(fullG, M);
  // the section (sagittal cut, face toward the visitor)
  const cutF = (x, y, z) => Math.max(f(x, y, z), z);
  const sec = new THREE.Mesh(meshField(cutF, h), skin); sec.castShadow = sec.receiveShadow = true;
  const secG = new THREE.Group(); secG.position.set(0.0, 0.024, 0.03); secG.rotation.y = 0.0; G.add(secG); secG.add(sec);
  const box2 = [-0.008, -0.004, 0.262, 0.106];
  const secTex = footSectionTexture((x, y) => f(x, y, 0), box2);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(box2[2] - box2[0], box2[3] - box2[1]), new THREE.MeshStandardMaterial({ map: secTex, alphaTest: 0.5, roughness: 0.78, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  face.position.set((box2[0] + box2[2]) / 2, (box2[1] + box2[3]) / 2, 0.0003); secG.add(face);
  const SP = parts();
  SP.add('steel', cyl(0.0055, 0.0055, 0.03, 16, [0.071, 0.112, -0.0055]), cyl(0.0105, 0.0105, 0.006, 6, [0.071, 0.103, -0.006]));
  SP.build(secG, M);
  P.build(G, M);
  const toG = (grp, v) => v.clone().applyEuler(grp.rotation).add(grp.position);
  return {
    group: G,
    anchors: { rubber: toG(fullG, V3(0.2, 0.03, 0.02)), wood: toG(secG, V3(0.07, 0.07, 0.001)), cell: toG(secG, V3(0.17, 0.02, 0.001)), focus: V3(-0.04, 0.06, 0) },
  };
}

// ================================================================================== AJAY BHATT · USB, 1996
// plug at 4× scale; plug-local origin at the shell's mouth, the plug pointing −x
export const USB_S = 4;
export function buildUSB(M) {
  const G = new THREE.Group(), P = parts();
  const s = 0.001 * USB_S;                       // one millimetre at model scale
  const XB = -0.04, PY = 0.026, PY2 = 0.06, BH = 0.086;   // the ports' face; the lower port (the plug's) and the upper (empty)
  // ---- the receptacle: an aluminium hub whose front carries two ports (real openings)
  const outer = rrShape(0.164, BH, 0.008);
  const holeW = 12.5 * s, holeH = 5.1 * s;
  for (const yc of [PY, PY2]) {
    const y0 = yc - BH / 2, hole = new THREE.Path();
    hole.moveTo(-holeW / 2, y0 - holeH / 2); hole.lineTo(-holeW / 2, y0 + holeH / 2); hole.lineTo(holeW / 2, y0 + holeH / 2); hole.lineTo(holeW / 2, y0 - holeH / 2); hole.lineTo(-holeW / 2, y0 - holeH / 2);
    outer.holes.push(hole);
  }
  const front = new THREE.ExtrudeGeometry(outer, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 6 });
  front.rotateY(PI / 2); front.translate(XB - 0.072, BH / 2, 0);   // shape (z,y) → face at x = XB
  P.add('alu', front);
  P.add('alu', rbox(0.15, BH, 0.164, 0.008, [XB - 0.072 - 0.07, BH / 2, 0]));
  P.add('blackAnod', rbox(0.004, BH - 0.024, 0.15, 0.0015, [XB - 0.2, BH / 2, 0]));
  P.add('blackAnod', rbox(0.19, 0.003, 0.15, 0.0012, [XB - 0.11, BH + 0.001, 0]));
  for (let k = 0; k < 9; k++) P.add('black', box(0.004, 0.0012, 0.1, [XB - 0.17 + k * 0.007, BH + 0.0026, 0]));
  P.add('rubber', rbox(0.2, 0.004, 0.15, 0.0015, [XB - 0.11, 0.002, 0]));
  // each port: the steel lining, a black tongue carrying four gold contacts, the dark back wall
  const t = 0.0008, lin = 0.068;
  for (const yc of [PY, PY2]) {
    P.add('steel', box(lin, t, holeW, [XB - lin / 2 - 0.001, yc + holeH / 2 - t / 2, 0]), box(lin, t, holeW, [XB - lin / 2 - 0.001, yc - holeH / 2 + t / 2, 0]), box(lin, holeH, t, [XB - lin / 2 - 0.001, yc, holeW / 2 - t / 2]), box(lin, holeH, t, [XB - lin / 2 - 0.001, yc, -holeW / 2 + t / 2]));
    for (const zc of [-3.5 * s, 3.5 * s]) P.add('steel', box(2.2 * s, 0.4 * s, 1.6 * s, [XB - 3.5 * s, yc + holeH / 2 - t - 0.15 * s, zc], [0, 0, -0.2]));
    P.add('black', box(0.002, holeH, holeW, [XB - lin, yc, 0]));
    P.add('pvc', box(10 * s, 1.8 * s, 11.4 * s, [XB - 5 * s - 0.004, yc - holeH / 2 + 0.0008 + 0.9 * s, 0]));
    for (const z of [-3.5, -1, 1, 3.5]) P.add('gold', box(8 * s, 0.12 * s, 1 * s, [XB - 4 * s - 0.006 - (Math.abs(z) > 2 ? 0.5 * s : 0), yc - holeH / 2 + 0.0008 + 1.8 * s + 0.06 * s, z * s]));
  }
  // LED and an engraved trident beside the port
  const led = new THREE.Mesh(cyl(0.0022, 0.0022, 0.002, 16, [XB + 0.0018, PY, -0.055], [0, 0, PI / 2]), new THREE.MeshBasicMaterial({ color: '#0b1a12' }));
  G.add(led);
  const tri = tridentTexture();
  const triM = new THREE.MeshStandardMaterial({ color: '#2a2c2e', metalness: 0.6, roughness: 0.5, alphaMap: tri, alphaTest: 0.5 });
  const triD = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.022), triM); triD.rotation.y = PI / 2; triD.position.set(XB + 0.0021, PY, 0.05); G.add(triD);
  // ---- the plug
  const plug = new THREE.Group(); G.add(plug);
  const PP = parts();
  const W = 12 * s, H = 4.5 * s, L = 12 * s, T = 0.4 * s;
  // shell: top and bottom plates with two latch windows each, side walls, rounded corner rods
  const plateShape = () => {
    const sh = new THREE.Shape(); sh.moveTo(0, -W / 2); sh.lineTo(L, -W / 2); sh.lineTo(L, W / 2); sh.lineTo(0, W / 2); sh.lineTo(0, -W / 2);
    for (const zc of [-3.5 * s, 3.5 * s]) { const hp = new THREE.Path(), x0 = 2.4 * s, x1 = 4.9 * s, w = 1.25 * s; hp.moveTo(x0, zc - w); hp.lineTo(x0, zc + w); hp.lineTo(x1, zc + w); hp.lineTo(x1, zc - w); hp.lineTo(x0, zc - w); sh.holes.push(hp); }
    return sh;
  };
  for (const sy of [1, -1]) {
    const g = new THREE.ExtrudeGeometry(plateShape(), { depth: T, bevelEnabled: false });
    g.rotateX(PI / 2); g.translate(0, sy > 0 ? H / 2 : -H / 2 + T, 0);
    PP.add('chrome', g);
    for (const zc of [-3.5 * s, 3.5 * s]) PP.add('chrome', box(2.3 * s, 0.3 * s, 2.2 * s, [3.6 * s, sy * (H / 2 - T - 0.25 * s), zc], [0, 0, sy * 0.25]));
  }
  for (const sz of [1, -1]) PP.add('chrome', box(L, H - 2 * T, T, [L / 2, 0, sz * (W / 2 - T / 2)]));
  for (const sy of [1, -1]) for (const sz of [1, -1]) PP.add('chrome', cyl(T * 0.9, T * 0.9, L, 8, [L / 2, sy * (H / 2 - T / 2), sz * (W / 2 - T / 2)], [0, 0, PI / 2]));
  // insulator in the upper half; contacts on its underside (VBUS and GND longer: they mate first)
  PP.add('whitePlastic', box(L - 0.6 * s, 1.9 * s, W - 2 * T - 0.2 * s, [L / 2 + 0.3 * s, H / 2 - T - 0.95 * s, 0]));
  for (const [z, long] of [[-3.5, 1], [-1, 0], [1, 0], [3.5, 1]]) { const x0 = long ? 0.7 * s : 1.6 * s; PP.add('gold', box(L - 2 * s - x0, 0.14 * s, 1 * s, [x0 + (L - 2 * s - x0) / 2, H / 2 - T - 1.9 * s - 0.07 * s, z * s])); PP.add('gold', box(0.7 * s, 0.3 * s, 1 * s, [x0 + 1.2 * s, H / 2 - T - 1.9 * s - 0.2 * s, z * s])); }
  // overmould with grip ribs and the embossed trident
  const OL = 22 * s, OW = 16 * s, OH = 8 * s;
  PP.add('pvc', rbox(OL, OH, OW, 1.8 * s, [L + OL / 2, 0, 0], [0, 0, 0], 3));
  PP.add('pvc', rbox(1.2 * s, H + 1.2 * s, W + 1.2 * s, 0.3 * s, [L + 0.4 * s, 0, 0]));
  for (let k = 0; k < 6; k++) for (const sy of [1, -1]) PP.add('pvc', rbox(0.7 * s, 0.5 * s, OW - 5 * s, 0.24 * s, [L + 12 * s + k * 1.6 * s, sy * (OH / 2 + 0.1 * s), 0]));
  const embM = new THREE.MeshStandardMaterial({ color: '#3a3a3c', roughness: 0.42, metalness: 0, alphaMap: tri, alphaTest: 0.5 });
  const emb = new THREE.Mesh(new THREE.PlaneGeometry(8 * s, 8 * s), embM); emb.rotation.x = -PI / 2; emb.position.set(L + 6 * s, OH / 2 + 0.05 * s, 0); plug.add(emb);
  // strain relief: a ribbed taper along +x
  const sr = [];
  const x0 = L + OL - 0.6 * s, n = 9;
  for (let k = 0; k <= n; k++) { const u = k / n, r = (4.4 - 2.2 * u) * s; sr.push([r, k * 1.4 * s], [r * 0.86, k * 1.4 * s + 0.7 * s]); }
  PP.add('pvc', bake(lathe([[0.0001, 0], ...sr, [0.0001, (n + 0.5) * 1.4 * s]], 28), [x0, 0, 0], [0, 0, -PI / 2]));
  // the cable: out to the right, down onto the plinth, a loose loop
  const cx0 = x0 + (n + 0.5) * 1.4 * s - 0.004, cr = 1.9 * s;
  PP.add('pvc', tubeAlong(curve([[cx0, 0, 0], [cx0 + 0.04, 0, 0], [cx0 + 0.08, -0.01, 0.01], [cx0 + 0.11, -PY + cr, 0.05], [cx0 + 0.08, -PY + cr, 0.12], [cx0 - 0.03, -PY + cr, 0.13], [cx0 - 0.08, -PY + cr, 0.09], [cx0 - 0.04, -PY + cr, 0.05], [cx0 + 0.06, -PY + cr, -0.06], [cx0 + 0.12, -PY + cr, -0.1], [cx0 + 0.2, -PY + cr, -0.14]]), cr, 140, 12));
  PP.build(plug, M);
  P.build(G, M);
  plug.position.set(XB, PY, 0);
  return { group: G, plug, led, XB, PY, insertDepth: 11 * s, anchors: { plug: V3(XB + 0.09, PY + OH / 2 + 0.002, 0), port: V3(XB, PY2, 0), focus: V3(0.04, 0.04, 0) } };
}

// ================================================================================== UPI · NPCI, 2016
export function buildUPI(M) {
  const G = new THREE.Group(), P = parts();
  const mods = qrModules();
  // walnut phone stand
  P.add('wood', rbox(0.1, 0.012, 0.085, 0.003, [0, 0.006, 0]));
  P.add('wood', rbox(0.084, 0.11, 0.012, 0.004, [0, 0.062, -0.022], [-0.32, 0, 0]));
  P.add('wood', rbox(0.09, 0.012, 0.01, 0.003, [0, 0.018, 0.03]));
  // the phone
  const PW = 0.0745, PH = 0.16, PD = 0.0082;
  const phone = new THREE.Group(); G.add(phone);
  const body = new THREE.ExtrudeGeometry(rrShape(PW - 0.002, PH - 0.002, 0.0095), { depth: PD - 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 3, curveSegments: 10 });
  body.translate(0, 0, -(PD - 0.002) / 2);
  const frameM = new THREE.MeshStandardMaterial({ color: '#8e9094', metalness: 1, roughness: 0.28 });
  const fr = new THREE.Mesh(body, frameM); fr.castShadow = true; phone.add(fr);
  const backM = new THREE.MeshPhysicalMaterial({ color: '#283646', metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
  const flat = (shape, mat, z, flip = false) => { const g = new THREE.ShapeGeometry(shape, 12); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / PW + 0.5, p.getY(i) / PH + 0.5); const m = new THREE.Mesh(g, mat); m.position.z = z; if (flip) m.rotation.y = PI; phone.add(m); return m; };
  flat(rrShape(PW - 0.0016, PH - 0.0016, 0.009), backM, -PD / 2 - 0.00005, true);
  const [scrA, scrB] = phoneScreens(mods);
  const scrU = { uA: { value: scrA }, uB: { value: scrB }, uMix: { value: 0 }, uScan: { value: 0.5 }, uI: { value: 1.1 }, uFlash: { value: 0 } };
  const screenM = new THREE.ShaderMaterial({
    uniforms: scrU,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `uniform sampler2D uA, uB; uniform float uMix, uScan, uI, uFlash; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(0.0745, 0.16);
        vec2 q = abs(p) - vec2(0.0745 / 2.0 - 0.0105, 0.16 / 2.0 - 0.0105);
        float rr = length(max(q, 0.0)) - 0.0085;
        float inside = smoothstep(0.00015, -0.00015, rr - 0.0001 + 0.0);
        float border = smoothstep(-0.0005, -0.001, max(abs(p.x) - 0.0745 / 2.0 + 0.0016, abs(p.y) - 0.16 / 2.0 + 0.0016));
        vec2 suv = (p / vec2(0.0745 - 0.0032, 0.16 - 0.0032)) + 0.5;
        vec3 a = texture2D(uA, suv).rgb, b = texture2D(uB, suv).rgb;
        float scan = exp(-((suv.y - uScan) * 90.0) * ((suv.y - uScan) * 90.0)) * step(0.27, suv.x) * step(suv.x, 0.73) * (1.0 - uMix);
        vec3 c = mix(a, b, uMix) + vec3(0.3, 1.0, 0.6) * scan * 0.9;
        c += vec3(0.6, 1.0, 0.75) * uFlash * 0.5;
        float on = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0) * (1.0 - smoothstep(-0.0002, 0.0002, rr + 0.0012));
        gl_FragColor = vec4(c * uI * on, 1.0);
      }`,
  });
  flat(rrShape(PW - 0.0016, PH - 0.0016, 0.009), screenM, PD / 2 + 0.00004);
  flat(rrShape(PW - 0.0016, PH - 0.0016, 0.009), M.glass, PD / 2 + 0.00025).renderOrder = 6;
  const PPh = parts();
  // camera plateau, three lenses, flash; side keys
  PPh.add('backGlass', rbox(0.03, 0.03, 0.0016, 0.007, [-PW / 2 + 0.021, PH / 2 - 0.021, -PD / 2 - 0.0008]));
  M.backGlass = backM;
  for (const [x, y] of [[-0.009, 0.008], [-0.009, -0.007], [0.006, 0.0005]]) {
    const cx = -PW / 2 + 0.021 + x, cy = PH / 2 - 0.021 + y;
    PPh.add('alu', bake(lathe([[0.0001, 0], [0.0055, 0], [0.0058, 0.0006], [0.0058, 0.0016], [0.0048, 0.0018], [0.0042, 0.001], [0.0001, 0.001]], 32), [cx, cy, -PD / 2 - 0.0016], [-PI / 2, 0, 0]));
    PPh.add('lens', cyl(0.0042, 0.0042, 0.0004, 28, [cx, cy, -PD / 2 - 0.0022], [PI / 2, 0, 0]));
  }
  M.lens = new THREE.MeshPhysicalMaterial({ color: '#05070c', roughness: 0.02, metalness: 0.2, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.6 });
  PPh.add('dial', cyl(0.0018, 0.0018, 0.0004, 16, [-PW / 2 + 0.021 + 0.006, PH / 2 - 0.021 - 0.009, -PD / 2 - 0.0017], [PI / 2, 0, 0]));
  PPh.add('alu', rbox(0.0012, 0.012, 0.0032, 0.0005, [PW / 2 + 0.0004, 0.022, 0]), rbox(0.0012, 0.026, 0.0032, 0.0005, [PW / 2 + 0.0004, 0.046, 0]));
  PPh.add('black', box(0.012, 0.0012, 0.0016, [0, -PH / 2 - 0.0001, 0]));
  PPh.build(phone, M);
  phone.position.set(0, 0.013 + (PH / 2) * Math.cos(0.3), 0.024 - (PH / 2) * Math.sin(0.3)); phone.rotation.set(-0.3, 0, 0);
  const phoneHolder = new THREE.Group(); phoneHolder.add(phone); phoneHolder.rotation.y = 0.28; phoneHolder.position.set(-0.03, 0, 0.02); G.add(phoneHolder);
  // the standee
  const st = new THREE.Group(); st.position.set(0.13, 0, -0.07); st.rotation.y = -0.32; G.add(st);
  const SP = parts();
  SP.add('acrylicBlock', rbox(0.12, 0.014, 0.05, 0.003, [0, 0.007, 0]));
  M.acrylicBlock = M.acrylicBlock ?? new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.25, envMapIntensity: 1.0 });
  SP.add('acrylic', rbox(0.108, 0.152, 0.004, 0.003, [0, 0.014 + 0.076, 0]));
  SP.build(st, M);
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.143), new THREE.MeshStandardMaterial({ map: standeeTexture(mods), color: '#b8b4ac', roughness: 0.6 }));
  card.position.set(0, 0.014 + 0.076, -0.0022); st.add(card);
  const cardBack = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.143), new THREE.MeshStandardMaterial({ color: '#1d3b2f', roughness: 0.6 }));
  cardBack.position.set(0, 0.014 + 0.076, -0.0023); cardBack.rotation.y = PI; st.add(cardBack);
  // kulhad of chai
  P.add('terracotta', bake(lathe([[0.0001, 0], [0.021, 0], [0.023, 0.003], [0.03, 0.06], [0.031, 0.064], [0.028, 0.064], [0.0265, 0.059], [0.0001, 0.059]], 36), [-0.15, 0, 0.06]));
  P.add('chai', cyl(0.0268, 0.0268, 0.001, 32, [-0.15, 0.057, 0.06]));
  M.chai = new THREE.MeshStandardMaterial({ color: '#8a5a33', roughness: 0.12, metalness: 0 });
  P.build(G, M);
  const screenCentre = V3();
  return { group: G, phone, phoneHolder, scrU, anchors: { phone: V3(0, 0.1, 0.03), standee: V3(0.13, 0.19, -0.07), focus: V3(0.0, 0.09, 0) }, screenCentre };
}
