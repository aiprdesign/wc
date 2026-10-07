// The Indus plain under THE FIRST CITIES (indus.js): a procedural ground with no texture tile.
// Two painted masks give it a plan — a coarse one for the whole plain (green river belt, fields, cart
// tracks) and a fine one for the town (dust aprons and contact shadow at the foot of every wall, packed
// street earth with wheel ruts) — and the shader adds the rest in world space: alluvial tone zones, pale
// salt crusts, scrub patches, pebbles and grit with their own relief, all fading cleanly with distance.
import * as THREE from 'three';
import { canvas as mkCanvas } from '../../lib/textures.js';
import { rng } from '../../lib/math.js';
import { INDUS_NOISE } from './indus-surface.js';

export const PLAIN_RECT = [-1200, -1200, 2400, 2400];    // x0, z0, width, depth (m)
export const TOWN_RECT = [-150, -140, 370, 280];

function compose(w, h, R, G, B) {
  const out = mkCanvas(w, h), g = out.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  const r = R.getContext('2d').getImageData(0, 0, w, h).data, gg = G.getContext('2d').getImageData(0, 0, w, h).data, b = B.getContext('2d').getImageData(0, 0, w, h).data;
  for (let i = 0; i < d.length; i += 4) { d[i] = r[i]; d[i + 1] = gg[i]; d[i + 2] = b[i]; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
function layer(w, h) { const c = mkCanvas(w, h), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); return [c, g]; }
function blurred(c, px) { const o = mkCanvas(c.width, c.height), g = o.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); return o; }

// riverPts: Vector3[] along the Indus; lots: [x0,x1,z0,z1][] footprints; streets: {ns:[{x,w}], ew:[{z,w}]}, extents of the town
export function groundMasks({ riverPts, riverW, lots, citadel, streets, town }) {
  const r = rng(404);
  // ---- the plain
  const PW = 1024, k = PW / PLAIN_RECT[2];
  const P = (x, z) => [(x - PLAIN_RECT[0]) * k, (z - PLAIN_RECT[1]) * k];
  const [pr, gr] = layer(PW, PW), [pg, gg] = layer(PW, PW), [pb, gb] = layer(PW, PW);
  // green, moist belt along the river
  gr.lineCap = gr.lineJoin = 'round';
  for (const [wd, a] of [[riverW + 420, 0.25], [riverW + 220, 0.45], [riverW + 90, 0.75]]) {
    gr.strokeStyle = `rgba(255,255,255,${a})`; gr.lineWidth = wd * k; gr.beginPath();
    riverPts.forEach((p, i) => { const [x, y] = P(p.x, p.z); i ? gr.lineTo(x, y) : gr.moveTo(x, y); }); gr.stroke();
  }
  // fields: rectangles in the flood plain, set along the river, each its own crop and tone
  for (let i = 0; i < 420; i++) {
    const p = riverPts[Math.floor(r() * riverPts.length)], side = r() < 0.5 ? -1 : 1;
    const off = riverW * 0.5 + 25 + r() * 380;
    const x = p.x + side * off, z = p.z + (r() - 0.5) * 120;
    if (x > -160 && x < 230 && z > -150 && z < 150) continue;
    const fw = 25 + r() * 60, fd = 18 + r() * 50;
    const [px, py] = P(x, z);
    gr.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.75})`; gr.fillRect(px, py, fw * k, fd * k);
    gb.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.8})`; gb.fillRect(px, py, fw * k, fd * k);
  }
  // blotches of scrub over the dry plain
  for (let i = 0; i < 260; i++) { const [px, py] = P(-1200 + r() * 2400, -1200 + r() * 2400); gr.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.25})`; gr.beginPath(); gr.ellipse(px, py, (8 + r() * 30) * k * 3, (8 + r() * 30) * k * 2, r() * 3, 0, 7); gr.fill(); }
  // cart tracks: from the town out to the river and across the plain, wandering
  gg.lineCap = gg.lineJoin = 'round';
  const track = (x0, z0, x1, z1, wd) => {
    gg.strokeStyle = '#fff'; gg.lineWidth = Math.max(1, wd * k); gg.beginPath();
    const n = 24, ax = r() * 40 - 20, f = 1 + r() * 2;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u + Math.sin(u * 3.1 * f + x0) * ax * Math.sin(u * Math.PI), z = z0 + (z1 - z0) * u + Math.cos(u * 2.3 * f) * ax * 0.6 * Math.sin(u * Math.PI);
      const [px, py] = P(x, z); i ? gg.lineTo(px, py) : gg.moveTo(px, py);
    }
    gg.stroke();
  };
  for (const s of streets.ns) { track(s.x, town.z1, s.x + (r() - 0.5) * 300, 1200, 5); track(s.x, town.z0, s.x + (r() - 0.5) * 300, -1200, 5); }
  for (const s of streets.ew) track(town.x1, s.z, 520, s.z + (r() - 0.5) * 80, 5);
  track(town.x0 - 140, 0, -1200, 120, 4); track(town.x1, town.z1 - 10, 560, 620, 6); track(150, town.z1, 330, 700, 4); track(70, town.z1, 700, 1150, 4); track(town.x1, -100, 900, -900, 4);
  for (let i = 0; i < 16; i++) { const x = -1100 + r() * 2200, z = -1100 + r() * 2200; track(x, z, x + (r() - 0.5) * 900, z + (r() - 0.5) * 900, 3); }
  const plain = compose(PW, PW, blurred(pr, 3), blurred(pg, 0.7), blurred(pb, 1));

  // ---- the town
  const TW = 1024, TH = Math.round(TW * TOWN_RECT[3] / TOWN_RECT[2]), kt = TW / TOWN_RECT[2];
  const T = (x, z) => [(x - TOWN_RECT[0]) * kt, (z - TOWN_RECT[1]) * kt];
  const [tr, gtr] = layer(TW, TH), [tg, gtg] = layer(TW, TH), [tb, gtb] = layer(TW, TH);
  const foot = (g, grow) => { g.fillStyle = '#fff'; for (const [x0, x1, z0, z1] of lots) { const [a, b] = T(x0 - grow, z0 - grow); g.fillRect(a, b, (x1 - x0 + 2 * grow) * kt, (z1 - z0 + 2 * grow) * kt); } const [a, b] = T(citadel.x0 - grow, citadel.z0 - grow); g.fillRect(a, b, (citadel.x1 - citadel.x0 + 2 * grow) * kt, (citadel.z1 - citadel.z0 + 2 * grow) * kt); };
  foot(gtr, 0.6); foot(gtb, 0);
  // packed street earth and ruts
  gtg.lineCap = 'round';
  const street = (x0, z0, x1, z1, wd) => {
    gtg.strokeStyle = 'rgba(255,255,255,0.45)'; gtg.lineWidth = wd * 0.8 * kt; gtg.beginPath(); gtg.moveTo(...T(x0, z0)); gtg.lineTo(...T(x1, z1)); gtg.stroke();
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), nx = -dz / L, nz = dx / L;
    for (const e of [-0.78, 0.78]) for (const lane of [-1, 1]) {
      const o = lane * wd * 0.18 + e;
      gtg.strokeStyle = `rgba(255,255,255,${0.75 + r() * 0.25})`; gtg.lineWidth = Math.max(0.8, 0.22 * kt); gtg.beginPath();
      for (let i = 0; i <= 60; i++) { const u = i / 60, w = Math.sin(u * 23 + e) * 0.12 + Math.sin(u * 7) * 0.2; const [px, py] = T(x0 + dx * u + nx * (o + w), z0 + dz * u + nz * (o + w)); i ? gtg.lineTo(px, py) : gtg.moveTo(px, py); }
      gtg.stroke();
    }
  };
  for (const s of streets.ns) street(s.x, town.z0 - 30, s.x, town.z1 + 30, s.w);
  for (const s of streets.ew) street(town.x0 - 20, s.z, town.x1 + 30, s.z, s.w);
  const tR = blurred(tr, 7), tB = blurred(tb, 2.2);
  // keep the dust and shadow outside the footprints only (inside is the house, which rises later)
  for (const c of [tR, tB]) { const g = c.getContext('2d'); g.globalCompositeOperation = 'destination-out'; foot(g, 0); }
  const town2 = compose(TW, TH, tR, blurred(tg, 0.6), tB);
  return { plain, town: town2, townK: { value: 1 } };
}

// Patches the ground material (MeshStandard, no map): procedural colour, roughness and relief.
// Keeps the hooks indus.js needs: it calls `extra` to add its own x-ray code.
export function groundPatch(sh, masks) {
  sh.uniforms.tPlain = { value: masks.plain }; sh.uniforms.uTownK = masks.townK; sh.uniforms.tTown = { value: masks.town };
  sh.uniforms.uPlainR = { value: new THREE.Vector4(...PLAIN_RECT) }; sh.uniforms.uTownR = { value: new THREE.Vector4(...TOWN_RECT) };
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      ${INDUS_NOISE}
      uniform sampler2D tPlain, tTown; uniform vec4 uPlainR, uTownR; uniform float uTownK; float gBump; float gRough;`)
    .replace('#include <map_fragment>', `
      {
        vec2 q = vGW.xz;
        float w = length(fwidth(q));
        vec4 pm = texture2D(tPlain, (q - uPlainR.xy) / uPlainR.zw);
        vec2 tu = (q - uTownR.xy) / uTownR.zw;
        vec4 tm = (tu.x > 0.0 && tu.x < 1.0 && tu.y > 0.0 && tu.y < 1.0) ? texture2D(tTown, tu) * uTownK : vec4(0.0);
        float n1 = iFbm(q * 0.0031 + 1.3), n2 = iFbm(q * 0.021 + 3.7), n3 = iFbm(q * 0.13 + 7.1);
        float det = 1.0 - smoothstep(0.02, 0.12, w), det2 = 1.0 - smoothstep(0.15, 0.8, w);
        float n4 = mix(0.5, iN2(q * 1.7), det2), n5 = mix(0.5, iN2(q * 9.0), det);
        vec3 silt = vec3(0.235, 0.172, 0.112), dark = vec3(0.15, 0.105, 0.068), pale = vec3(0.33, 0.28, 0.21);
        vec3 col = mix(silt, dark, smoothstep(0.38, 0.72, n2) * 0.75);
        col = mix(col, pale, smoothstep(0.55, 0.78, n1) * 0.6);                                     // salt-crusted flats
        col = mix(col, pale * 1.05, smoothstep(0.62, 0.7, n2 * 0.6 + n3 * 0.5) * 0.35 * (1.0 - pm.r));   // salt crust patches
        col *= 0.8 + 0.36 * n3;
        // moist river belt and fields: darker earth, crops, scrub
        float green = pm.r * smoothstep(0.25, 0.65, n2 * 0.7 + n3 * 0.5);
        col = mix(col, mix(vec3(0.13, 0.095, 0.06), vec3(0.085, 0.10, 0.04), pm.b), pm.r * 0.55);
        col = mix(col, vec3(0.07, 0.085, 0.032) * (0.8 + 0.4 * n4), green * 0.7);
        float grass = smoothstep(0.55, 0.8, n3 * 0.7 + n2 * 0.45) * (1.0 - pm.r * 0.5);
        col = mix(col, mix(vec3(0.19, 0.16, 0.07), vec3(0.11, 0.11, 0.045), n4) , grass * 0.6);   // dry grass and scrub
        // cart tracks: paler packed earth
        col = mix(col, vec3(0.30, 0.245, 0.18) * (0.9 + 0.2 * n4), pm.g * 0.65);
        // the town: dust aprons, contact shadow, packed streets with wheel ruts
        float street = smoothstep(0.15, 0.45, tm.g), rut = smoothstep(0.6, 0.9, tm.g);
        col = mix(col, vec3(0.32, 0.26, 0.19) * (0.9 + 0.2 * n4), tm.r * 0.55);
        col = mix(col, vec3(0.27, 0.205, 0.14) * (0.92 + 0.16 * n3), street * 0.6);
        col *= 1.0 - 0.38 * rut * det2;
        col *= 1.0 - 0.5 * tm.b;
        // pebbles and potsherds (closer than ~60 m)
        vec3 c = iCell(q * 5.0);
        float peb = (1.0 - smoothstep(0.12, 0.2, c.x)) * step(0.78 - 0.25 * street - 0.2 * tm.r, c.z) * det;
        vec3 pc = c.z > 0.95 ? vec3(0.33, 0.12, 0.06) : mix(vec3(0.2, 0.18, 0.15), vec3(0.36, 0.3, 0.24), fract(c.z * 13.0));
        col = mix(col, pc, peb);
        col *= 0.9 + 0.2 * n5;
        diffuseColor.rgb *= col;
        gBump = (peb * (0.2 - c.x) * 0.06 + n5 * 0.004 - rut * 0.02 + n4 * 0.01) * det2;
        gRough = 1.0 - 0.15 * peb;
      }`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= gRough;')
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        vec3 sX = dFdx(-vViewPosition), sY = dFdy(-vViewPosition);
        vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
        float dt = dot(sX, R1) * faceDirection;
        vec3 grad = sign(dt) * (dFdx(gBump) * R1 + dFdy(gBump) * R2);
        vec3 nb = abs(dt) * normal - grad;
        if (dot(nb, nb) > 1e-20 && abs(dt) > 1e-14) normal = normalize(nb);
      }`);
}
