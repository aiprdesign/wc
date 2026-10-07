// THE PATH OF PEACE — the land of the Salt March for src/scenes/india/dharma.js (build time only).
//   · a gently rolling plain (displaced grid) shaded procedurally in world space: fields in irregular parcels
//     with bunds, crop rows (wheat, mustard, ploughed furrows, stubble, fallow), a dusty country road at
//     ground level with cart ruts and grassy verges, packed earth around the villages, the beach and wet sand
//   · trees (mango / neem domes, wide banyans, babool scrub, coconut palms on the coast), an avenue along the
//     road, two villages (mud and whitewashed huts, thatch and tile roofs, a small temple, haystacks, a well)
//   · long dawn shadows of trees and huts as soft decals on the ground
// Nothing here has a texture period: every pattern is a function of world position.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, sat, lerp, smoothstep } from '../../lib/math.js';
import { fbm2, noise2 } from '../../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../../lib/textures.js';

const TAU = Math.PI * 2;

// the shoreline (z of the water's edge as a function of x), shared by the ground and the sea shader
export const shoreZ = (seaZ, x) => seaZ - 4 + 3.0 * Math.sin(x * 0.013 + 1.0) + 1.5 * Math.sin(x * 0.031 + 0.4) + 0.6 * Math.sin(x * 0.09);
export const SHORE_GLSL = (seaZ) => /* glsl */ `
float shoreZ(float x){ return ${seaZ.toFixed(2)} - 4.0 + 3.0 * sin(x * 0.013 + 1.0) + 1.5 * sin(x * 0.031 + 0.4) + 0.6 * sin(x * 0.09); }`;

const LAND_NOISE = /* glsl */ `
float lH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lH(i), lH(i + vec2(1, 0)), f.x), mix(lH(i + vec2(0, 1)), lH(i + vec2(1, 1)), f.x), f.y); }
float lF(vec2 p){ return lN(p) * 0.5 + lN(p * 2.03 + 1.7) * 0.3 + lN(p * 4.1 + 3.3) * 0.2; }`;

export function buildLand({ GROUND_Y, SEA_Z, ROAD_O, ROAD_D, SUN_DIR, lite, fogColor }) {
  const group = new THREE.Group();
  const side = new THREE.Vector3(-ROAD_D.z, 0, ROAD_D.x);             // to the walkers' right
  const roadSO = (x, z) => { const dx = x - ROAD_O.x, dz = z - ROAD_O.z; return [dx * ROAD_D.x + dz * ROAD_D.z, dx * side.x + dz * side.z]; };
  const fromSO = (s, o) => [ROAD_O.x + ROAD_D.x * s + side.x * o, ROAD_O.z + ROAD_D.z * s + side.z * o];
  const VILLAGES = [
    { s: 80, o: -44, r: 22, n: lite ? 12 : 20, seed: 7 },
    { s: 138, o: 34, r: 20, n: lite ? 9 : 15, seed: 11, coast: true },
  ].map((v) => { const [x, z] = fromSO(v.s, v.o); return { ...v, x, z }; });

  // ground height above GROUND_Y: rolling plain, flat along the road, round the pillar and in the villages;
  // the beach shelves under the sea
  const groundH = (x, z) => {
    const [, o] = roadSO(x, z);
    let flat = smoothstep(7, 26, Math.abs(o)) * smoothstep(18, 40, Math.hypot(x, z));
    for (const v of VILLAGES) flat *= 0.25 + 0.75 * smoothstep(v.r * 0.6, v.r * 1.4, Math.hypot(x - v.x, z - v.z));
    let h = (fbm2(x * 0.006, z * 0.006, 3) * 1.8 + fbm2(x * 0.03 + 9, z * 0.03, 2) * 0.3) * flat;
    const dz = z - shoreZ(SEA_Z, x);
    const beach = Math.max(-2.5, dz * 0.045) + 0.02;
    h = lerp(beach, h, smoothstep(6, 20, dz));
    return h;
  };

  // ----------------------------------------------------------------------------------------- the ground
  const X0 = -900, X1 = 900, Z0 = SEA_Z - 70, Z1 = 900;
  const NX = lite ? 80 : 160, NZ = lite ? 56 : 110;
  const gGeo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, NX, NZ);
  gGeo.rotateX(-Math.PI / 2);
  {
    const p = gGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // a denser grid near the road / camera: warp the regular grid towards the road's start
      let x = p.getX(i), z = p.getZ(i) + (Z0 + Z1) / 2;
      const ux = x / ((X1 - X0) / 2);
      x = Math.sign(ux) * Math.pow(Math.abs(ux), 1.7) * (X1 - X0) / 2;
      p.setXYZ(i, x, GROUND_Y + groundH(x, z), z);
    }
    gGeo.computeVertexNormals();
    gGeo.deleteAttribute('uv');
  }
  const gU = {
    uRoadO: { value: new THREE.Vector2(ROAD_O.x, ROAD_O.z) },
    uRoadD: { value: new THREE.Vector2(ROAD_D.x, ROAD_D.z) },
    uVil: { value: VILLAGES.map((v) => new THREE.Vector3(v.x, v.z, v.r)) },
  };
  const gMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
  gMat.userData.noAntiTile = true; gMat.userData.noBatch = true;
  gMat.userData.detail = { albedo: 0.05, rough: 0.1, bump: 0.15, scratch: 0, grime: 0 };
  gMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, gU);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vGW; uniform vec2 uRoadO, uRoadD; uniform vec3 uVil[2];
      ${LAND_NOISE}
      ${SHORE_GLSL(SEA_Z)}
      // one field parcel: colour from its crop, its rows and its patchiness
      vec3 crop(float id, float rowC, float rowW, vec2 P, out float rough){
        vec3 soil = vec3(0.2, 0.135, 0.08) * (0.85 + 0.3 * lN(P * 0.21));
        vec3 c; float sp = 0.75, cover = 0.7;
        rough = 1.0;
        if (id < 0.3)       { c = mix(vec3(0.11, 0.21, 0.045), vec3(0.17, 0.27, 0.06), lH(vec2(id, 3.0))); cover = 0.8; }  // young wheat
        else if (id < 0.4)  { c = vec3(0.45, 0.37, 0.05); cover = 0.82; sp = 0.6; }            // mustard in flower
        else if (id < 0.48) { c = soil * 0.72; soil *= 1.18; cover = 0.5; sp = 0.55; }          // ploughed furrows
        else if (id < 0.53) { c = vec3(0.34, 0.27, 0.15); cover = 0.6; sp = 0.35; }            // stubble
        else if (id < 0.72) { c = vec3(0.08, 0.18, 0.045); cover = 0.9; sp = 1.1; }            // sugarcane / vegetables
        else if (id < 0.78) { c = vec3(0.24, 0.23, 0.1); cover = 0.95; sp = 0.0; }             // fallow, dry grass
        else if (id < 0.88) { c = vec3(0.07, 0.2, 0.07); cover = 0.92; sp = 0.3; soil = vec3(0.05, 0.08, 0.075); }   // rice paddy: water between the shoots
        else                { c = vec3(0.13, 0.25, 0.06); cover = 0.88; sp = 0.9; }            // fodder, green
        float amp = sp > 0.0 ? (1.0 - smoothstep(0.06, 0.28, rowW / sp)) * 0.75 : 0.0;
        float row = 0.5 + 0.5 * sin(rowC * 6.2832 / max(sp, 0.1));
        float m = mix(cover, smoothstep(1.0 - cover - 0.2, 1.0 - cover + 0.2, row), amp);
        vec3 col = mix(soil, c, m);
        col *= 0.8 + 0.4 * lF(P * 0.07 + id * 13.0);                                           // patchy growth
        col = mix(col, col * vec3(1.15, 1.05, 0.8), smoothstep(0.55, 0.85, lN(P * 0.02 + id * 5.0)) * 0.5);
        return col;
      }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float gRough = 1.0;
        vec3 gCol;
        {
          vec2 P = vGW.xz;
          vec2 rel = P - uRoadO;
          float s = dot(rel, uRoadD), o = dot(rel, vec2(-uRoadD.y, uRoadD.x));
          // --- fields: irregular parcels in the road's frame, warped, some split in two or three
          vec2 fq = vec2(s, o) + (vec2(lN(P * 0.012), lN(P * 0.012 + 7.1)) - 0.5) * 16.0;
          vec2 cs = vec2(28.0, 36.0);
          vec2 cid = floor(fq / cs), f = fq / cs - cid, size = cs;
          float hs = lH(cid);
          if (hs < 0.35) { f.x *= 2.0; cid.x += floor(f.x) * 0.5 + 0.25; f.x = fract(f.x); size.x *= 0.5; }
          else if (hs < 0.6) { f.y *= 3.0; cid.y += floor(f.y) * 0.31 + 0.1; f.y = fract(f.y); size.y /= 3.0; }
          float id = lH(cid + 3.1);
          float along = step(0.5, lH(cid + 5.7));
          float rowC = mix(o, s, along) + lH(cid + 9.0) * 3.0;
          float rowW = fwidth(rowC);
          float fr;
          gCol = crop(id, rowC, rowW, P, fr);
          // bunds: raised grassy edges between parcels
          float ed = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
          float bw = 0.35 + fwidth(ed) * 1.2;
          float bund = 1.0 - smoothstep(bw * 0.4, bw, ed);
          vec3 bundC = mix(vec3(0.2, 0.2, 0.09), vec3(0.1, 0.19, 0.05), lN(P * 0.4)) ;
          gCol = mix(gCol, bundC, bund * (0.6 + 0.4 / (1.0 + fwidth(ed))));
          // macro variation (soil moisture, light): no two fields alike
          gCol *= 0.82 + 0.36 * lF(P * 0.0045 + 2.0);
          // --- packed earth round the villages and the pillar's foot
          for (int i = 0; i < 2; i++) {
            float dv = length(P - uVil[i].xy) / uVil[i].z + (lN(P * 0.15) - 0.5) * 0.35;
            gCol = mix(gCol, vec3(0.34, 0.25, 0.16) * (0.85 + 0.3 * lN(P * 0.9)), 1.0 - smoothstep(0.7, 1.05, dv));
          }
          float dp = length(P) / 14.0 + (lN(P * 0.3) - 0.5) * 0.4;
          gCol = mix(gCol, vec3(0.3, 0.24, 0.15) * (0.85 + 0.3 * lN(P * 1.3)), 1.0 - smoothstep(0.6, 1.0, dp));
          // --- the road: dust at ground level, cart ruts, a grassy crown, ragged verges and a shallow ditch
          float d = abs(o);
          float hw = 2.3 + 0.35 * (lN(vec2(s * 0.06, 2.0)) - 0.5) + (lN(P * 0.8) - 0.5) * 0.5;
          float roadM = (1.0 - smoothstep(hw - 0.45, hw + 0.25, d)) * smoothstep(-8.0, 1.0, s);
          vec3 dust = vec3(0.43, 0.32, 0.2) * (0.88 + 0.24 * lN(P * 0.35)) * (0.94 + 0.12 * lN(P * 4.0));
          float rut = exp(-pow((d - 0.95) / 0.2, 2.0)) * (0.7 + 0.3 * lN(vec2(s * 0.4, o)));
          dust *= 1.0 - 0.22 * rut;
          dust = mix(dust, dust * 1.12, exp(-pow((d - 0.95) / 0.5, 2.0)) * (1.0 - rut));      // worn shoulders of the ruts
          float crown = exp(-pow(d / 0.32, 2.0)) * smoothstep(0.45, 0.75, lN(P * 1.6));
          dust = mix(dust, vec3(0.2, 0.19, 0.09), crown * 0.6);
          float verge = (1.0 - smoothstep(hw + 0.2, hw + 3.4, d)) * smoothstep(-12.0, 0.0, s);
          vec3 vergeC = mix(vec3(0.22, 0.22, 0.1), vec3(0.1, 0.19, 0.05), lN(P * 0.5)) * (0.8 + 0.4 * lN(P * 3.0));
          vergeC *= 1.0 - 0.3 * exp(-pow((d - hw - 1.6) / 0.45, 2.0));                          // the ditch
          gCol = mix(gCol, vergeC, verge * 0.85);
          gCol = mix(gCol, dust, roadM);
          gRough = mix(1.0, 0.92, roadM);
          // --- the beach: dry sand, a tide line, wet sand shining
          float dz = P.y - shoreZ(P.x);
          float sandM = 1.0 - smoothstep(9.0, 17.0, dz + (lN(P * 0.08) - 0.5) * 6.0);
          vec3 sandC = vec3(0.56, 0.46, 0.33) * (0.9 + 0.2 * lN(P * 0.5));
          sandC = mix(sandC, vec3(0.3, 0.25, 0.17), exp(-pow((dz - 4.2) / 0.5, 2.0)) * 0.6);      // wrack line
          float wet = 1.0 - smoothstep(0.0, 3.6, dz);
          sandC = mix(sandC, sandC * vec3(0.5, 0.48, 0.47), wet);
          gCol = mix(gCol, sandC, sandM);
          gRough = mix(gRough, mix(0.95, 0.22, wet), sandM);
        }
        diffuseColor.rgb *= gCol * 1.25;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = gRough;');
  };
  gMat.customProgramCacheKey = () => 'dharma-land';
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.receiveShadow = true;
  group.add(ground);

  // ----------------------------------------------------------------------------------------- vegetation & villages
  const r = rng(1930);
  const parts = [];                     // merged vertex-coloured geometry
  const shadowsQ = [];                  // ground shadow decals: [x, z, width, length]
  const shDir = new THREE.Vector2(-SUN_DIR.x, -SUN_DIR.z).normalize();
  const col = (g, fn) => {
    const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const clean = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
  const solid = (g, rgb) => parts.push(col(clean(g), () => rgb));

  // canopy blob: a noise-displaced icosphere with smooth normals; darker beneath and inside
  const blobBase = [0, 1].map((d) => { const g = new THREE.IcosahedronGeometry(1, d); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return mergeVertices(g); });
  const blob = (cx, cy, cz, rx, ry, rz, leaf, detail, seed) => {
    const g = blobBase[detail].clone(), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const k = 1 + 0.22 * noise2(x * 1.7 + seed, z * 1.7 + y * 1.3) + 0.1 * noise2(x * 4.1 - seed, y * 4.3 + z);
      p.setXYZ(i, cx + x * rx * k, cy + y * ry * k, cz + z * rz * k);
    }
    g.computeVertexNormals();
    const ng = g.toNonIndexed();
    parts.push(col(ng, (x, y, z, nx, ny, nz) => {
      const f = 0.55 + 0.5 * sat((y - cy) / ry * 0.7 + 0.35);              // shade beneath
      const lit = 0.85 + 0.25 * sat(-(nx * SUN_DIR.x + nz * SUN_DIR.z) * -1);
      const v = 0.92 + 0.16 * noise2(x * 0.9 + seed, z * 0.9);
      return [leaf[0] * f * v * lit, leaf[1] * f * v * lit, leaf[2] * f * v * lit];
    }));
  };
  const trunkG = new THREE.CylinderGeometry(0.7, 1, 1, 6, 1, true);
  const trunk = (x, y, z, h, rad, lean = 0, ang = 0, tone = [0.07, 0.05, 0.035]) => {
    const g = trunkG.clone().scale(rad, h, rad).translate(0, h / 2, 0).rotateZ(lean).rotateY(ang).translate(x, y, z);
    solid(g, tone);
  };
  const TREE_S = 0.62;
  const LEAVES = [[0.08, 0.17, 0.04], [0.1, 0.19, 0.045], [0.12, 0.18, 0.05], [0.06, 0.15, 0.05], [0.11, 0.2, 0.045], [0.13, 0.21, 0.05]];   // vivid, natural greens (the grade spares them)
  const leafOf = (shade = 1) => { const L = LEAVES[Math.floor(r() * LEAVES.length)], k = (1.0 + r() * 0.5) * shade; return [L[0] * k, L[1] * k, L[2] * k]; };

  const dome = (x, z, S, detail) => {
    S *= TREE_S;          // mango / neem: a broad dome of 3–5 blobs on a short trunk
    const y = GROUND_Y + groundH(x, z), th = (2.2 + r() * 1.6) * S, R = (2.6 + r() * 1.6) * S, leaf = leafOf();
    trunk(x, y - 0.3, z, th + R * 0.4, 0.22 * S + 0.08);
    const nb = detail ? 4 + Math.floor(r() * 2) : 3;
    for (let k = 0; k < nb; k++) {
      const a = r() * TAU, d = k === 0 ? 0 : R * (0.35 + r() * 0.3);
      blob(x + Math.cos(a) * d, y + th + R * (0.75 + (k === 0 ? 0.15 : -0.1 * r())), z + Math.sin(a) * d, R * (0.62 + r() * 0.2), R * (0.5 + r() * 0.18), R * (0.62 + r() * 0.2), leaf, detail, r() * 50);
    }
    shadowsQ.push([x, z, R * 1.9, (th + R * 1.6) * 3.2]);
  };
  const banyan = (x, z, S, detail) => {
    S *= TREE_S;        // banyan / peepal: very wide and low, several trunks
    const y = GROUND_Y + groundH(x, z), th = (3 + r() * 1.5) * S, R = (5 + r() * 2.5) * S, leaf = leafOf(0.85);
    for (let k = 0; k < 3; k++) trunk(x + (r() - 0.5) * R * 0.5, y - 0.3, z + (r() - 0.5) * R * 0.5, th + 1.2, 0.3 + r() * 0.25, (r() - 0.5) * 0.2, r() * TAU);
    const nb = detail ? 6 : 4;
    for (let k = 0; k < nb; k++) {
      const a = k / nb * TAU + r(), d = k === 0 ? 0 : R * (0.4 + r() * 0.35);
      blob(x + Math.cos(a) * d, y + th + R * 0.42 + r() * 0.8, z + Math.sin(a) * d, R * (0.5 + r() * 0.15), R * (0.32 + r() * 0.1), R * (0.5 + r() * 0.15), leaf, detail, r() * 50);
    }
    shadowsQ.push([x, z, R * 2.4, (th + R * 0.9) * 3.2]);
  };
  const babool = (x, z, S) => {
    S *= TREE_S;                // thorn scrub: a flat umbrella on a crooked stem
    const y = GROUND_Y + groundH(x, z), th = (1.6 + r()) * S, R = (1.6 + r() * 1.0) * S;
    trunk(x, y - 0.2, z, th + 0.3, 0.1, (r() - 0.5) * 0.4, r() * TAU);
    blob(x, y + th + R * 0.25, z, R, R * 0.3, R * (0.8 + r() * 0.3), leafOf(1.1), 0, r() * 50);
    shadowsQ.push([x, z, R * 1.6, (th + R * 0.4) * 3.2]);
  };
  const frondG = (() => { const g = new THREE.PlaneGeometry(0.55, 3.6, 1, 4); g.translate(0, 1.8, 0); return g; })();
  const palm = (x, z, S) => {
    S *= TREE_S * 0.9;                  // coconut palm: a leaning, tapering trunk and a crown of drooping fronds
    const y = GROUND_Y + groundH(x, z), H = (7 + r() * 5) * S, lean = (r() - 0.5) * 0.35, ang = r() * TAU;
    const seg = 4, top = new THREE.Vector3();
    for (let k = 0; k < seg; k++) {
      const h0 = k / seg, h1 = (k + 1) / seg, bend = (u) => lean * u * u * H;
      const g = new THREE.CylinderGeometry(0.17 - 0.03 * h1, 0.2 - 0.03 * h0, H / seg, 6, 1, true);
      g.translate(0, H * (h0 + h1) / 2, 0);
      g.translate(bend((h0 + h1) / 2), 0, 0); g.rotateY(ang); g.translate(x, y - 0.2, z);
      solid(g, [0.11, 0.085, 0.06]);
    }
    top.set(lean * H, H - 0.2, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang).add(new THREE.Vector3(x, y, z));
    const nf = 9, leaf = [0.09, 0.16, 0.04];
    for (let k = 0; k < nf; k++) {
      const g = frondG.clone(), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getY(i) / 3.6; p.setXYZ(i, p.getX(i) * (1 - u * 0.6) * (1 + Math.sin(u * 3) * 0.4), p.getY(i), -u * u * 2.2); }
      g.rotateX(-0.9 - r() * 0.5).rotateY(k / nf * TAU + r() * 0.3).translate(top.x, top.y, top.z);
      g.computeVertexNormals();
      parts.push(col(clean(g), (px, py) => { const f = 0.8 + 0.3 * sat((py - top.y + 2) / 2.5); return [leaf[0] * f, leaf[1] * f, leaf[2] * f]; }));
    }
    shadowsQ.push([x + lean * H * 0.5, z, 3.4, H * 3.0]);
  };

  const clear = (x, z, m = 0, foot = 26) => {             // keep the road, the pillar's foot, the villages' cores and the sea clear
    const [s, o] = roadSO(x, z);
    if (Math.abs(o) < 4.2 + m && s > -20) return false;
    if (Math.hypot(x, z) < foot) return false;
    for (const v of VILLAGES) if (Math.hypot(x - v.x, z - v.z) < v.r * 0.55) return false;
    if (z < shoreZ(SEA_Z, x) + 9) return false;
    return true;
  };
  // the avenue along the road (fewer on the camera's side near the start, so they never block the view)
  for (const sd of [-1, 1]) {
    for (let s = sd < 0 ? 20 : 50; s < 130; s += 16 + r() * 18) {
      if (r() < 0.3) continue;
      const o = sd * (6.0 + r() * 2.5), [x, z] = fromSO(s, o);
      if (!clear(x, z, -1.5)) continue;
      const k = r();
      if (k < 0.4) banyan(x + sd * 1.5, z, 0.8 + r() * 0.3, 1); else dome(x, z, 0.9 + r() * 0.3, 1);
    }
  }
  // scattered field trees and groves, by a noise density
  const NT = lite ? 100 : 380;
  let placed = 0;
  for (let k = 0; k < NT * 10 && placed < NT; k++) {
    const x = (r() - 0.5) * 760, z = 60 - r() * (60 - SEA_Z);
    if (!clear(x, z, 2, 50)) continue;
    const dens = fbm2(x * 0.011, z * 0.011, 3);
    if (dens < 0.08 + r() * 0.3 && r() > 0.12) continue;
    const coast = z < shoreZ(SEA_Z, x) + 40, near = Math.hypot(x - ROAD_O.x, z + 50) < 120;
    if (coast && r() < 0.6) palm(x, z, 0.9 + r() * 0.3);
    else { const t = r(); if (t < 0.6) dome(x, z, 0.8 + r() * 0.5, near ? 1 : 0); else if (t < 0.75) banyan(x, z, 0.8 + r() * 0.3, 0); else babool(x, z, 0.9 + r() * 0.4); }
    placed++;
  }

  // shrubs, tufts and stones along the verges and the field edges near the road (the crane's foreground)
  for (let k = 0, n = lite ? 50 : 170; k < n; k++) {
    const sAl = -10 + r() * 120, sd = r() < 0.5 ? -1 : 1, o = sd * (2.9 + Math.pow(r(), 2.2) * 30);
    const [x, z] = fromSO(sAl, o);
    if (!clear(x, z, -1.2, 9)) continue;
    const y = GROUND_Y + groundH(x, z);
    if (r() < 0.22) { const g = new THREE.DodecahedronGeometry(0.1 + r() * 0.2, 0); g.scale(1, 0.55, 0.9).rotateY(r() * TAU).translate(x, y + 0.05, z); const t = 0.2 + r() * 0.12; solid(g, [t, t * 0.9, t * 0.78]); continue; }
    const R = 0.22 + r() * 0.38, leaf = r() < 0.4 ? [0.19, 0.17, 0.08] : leafOf(1.25);
    blob(x, y + R * 0.25, z, R * (1 + r() * 0.5), R * (0.5 + r() * 0.35), R * (1 + r() * 0.4), leaf, 0, r() * 50);
    shadowsQ.push([x, z, R * 2.2, R * 4]);
  }

  // villages: huts on loose lanes, a temple, haystacks, a well, palms and a banyan
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const hut = (x, z, ang, rr) => {
    const y = GROUND_Y + groundH(x, z), w = 3.4 + rr() * 2.4, d = 2.6 + rr() * 1.6, h = 2.0 + rr() * 0.5;
    const white = rr() < 0.45, wall = white ? [0.62, 0.6, 0.55] : [0.4, 0.27, 0.16].map((v) => v * (0.85 + rr() * 0.3));
    const tile = rr() < 0.35, roof = tile ? [0.36, 0.14, 0.08] : [0.3, 0.23, 0.13].map((v) => v * (0.8 + rr() * 0.35));
    const M = new THREE.Matrix4().makeRotationY(ang).setPosition(x, y, z);
    const add = (g, rgb, grime = 0) => { g.applyMatrix4(M); parts.push(col(clean(g), (px, py, pz, nx, ny) => { const k = (1 - grime * (1 - sat((py - y) / 1.6))) * (ny < -0.5 ? 0.45 : 1) * (0.93 + 0.14 * noise2(px * 0.7, pz * 0.7 + py)); return [rgb[0] * k, rgb[1] * k, rgb[2] * k]; })); };
    add(box(w + 0.4, 0.3, d + 0.4).translate(0, 0.05, 0), [0.3, 0.23, 0.15]);                   // plinth
    add(box(w, h, d).translate(0, h / 2 + 0.2, 0), wall, 0.45);
    if (!white && rr() < 0.5) add(box(w + 0.02, 0.45, d + 0.02).translate(0, 0.42, 0), [0.25, 0.18, 0.12]);   // dado of fresh mud
    add(new THREE.PlaneGeometry(0.85, 1.6).translate(0, 1.0, d / 2 + 0.012), [0.03, 0.02, 0.015]);    // doorway
    if (rr() < 0.6) add(new THREE.PlaneGeometry(0.5, 0.45).translate(w * 0.3, 1.45, d / 2 + 0.012), [0.04, 0.03, 0.02]);
    // a gable roof with overhang and ridge (a prism), thatch roofs are steeper and shaggier
    const rh = tile ? 1.0 + rr() * 0.3 : 1.4 + rr() * 0.4, ov = tile ? 0.35 : 0.55;
    const shape = new THREE.Shape([new THREE.Vector2(-(d / 2 + ov), 0), new THREE.Vector2(d / 2 + ov, 0), new THREE.Vector2(0, rh)]);
    const prism = new THREE.ExtrudeGeometry(shape, { depth: w + ov * 1.4, bevelEnabled: false });
    prism.translate(0, 0, -(w + ov * 1.4) / 2).rotateY(Math.PI / 2).translate(0, h + 0.2 - (tile ? 0.05 : 0.15), 0);
    add(prism, roof, 0);
    add(box(w + ov * 1.2, 0.08, d + ov * 1.6).translate(0, h + 0.14, 0), roof.map((v) => v * 0.5));   // eaves in shadow
    if (!tile) add(box(w + ov * 1.5, 0.12, 0.3).translate(0, h + 0.2 + rh - 0.2, 0), roof.map((v) => v * 0.8));
    shadowsQ.push([x, z, Math.max(w, d) * 1.3, (h + rh) * 3.0]);
  };
  for (const v of VILLAGES) {
    const rr = rng(v.seed), ang0 = Math.atan2(ROAD_D.x, ROAD_D.z) + (rr() - 0.5) * 0.4;
    for (let k = 0; k < v.n; k++) {
      const a = rr() * TAU, d = Math.sqrt(rr()) * v.r * 0.85;
      const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
      if (Math.abs(roadSO(x, z)[1]) < 6) continue;
      hut(x, z, ang0 + (rr() < 0.5 ? 0 : Math.PI / 2) + (rr() - 0.5) * 0.3, rr);
      if (rr() < 0.4) {                                                  // a haystack by the hut
        const hx = x + (rr() - 0.5) * 7, hz = z + (rr() - 0.5) * 7, hy = GROUND_Y + groundH(hx, hz), hr = 1.0 + rr() * 0.6;
        const g = new THREE.CylinderGeometry(0.05, hr, hr * 2.4, 8, 2); g.translate(hx, hy + hr * 1.2, hz);
        solid(g, [0.42, 0.33, 0.17]);
        shadowsQ.push([hx, hz, hr * 2.2, hr * 6]);
      }
    }
    // a small whitewashed temple with a curved spire and a saffron pennant
    {
      const x = v.x + v.r * 0.15, z = v.z - v.r * 0.1, y = GROUND_Y + groundH(x, z);
      solid(box(4.2, 0.8, 4.2).translate(x, y + 0.3, z), [0.5, 0.47, 0.42]);
      solid(box(3, 2.6, 3).translate(x, y + 2.0, z), [0.55, 0.47, 0.38]);
      const sp = new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => { const u = i / 8; return new THREE.Vector2(1.55 * Math.pow(1 - u, 0.7) + 0.08, u * 4.6); }), 8);
      sp.translate(x, y + 3.3, z); solid(sp, [0.56, 0.46, 0.36]);
      solid(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4).translate(x, y + 8.9, z), [0.2, 0.15, 0.1]);
      solid(new THREE.PlaneGeometry(1.1, 0.6).translate(x + 0.55, y + 9.6, z), [0.9, 0.35, 0.05]);
      shadowsQ.push([x, z, 4.4, 26]);
    }
    {
      const x = v.x - v.r * 0.3, z = v.z + v.r * 0.25, y = GROUND_Y + groundH(x, z);            // the well
      solid(new THREE.CylinderGeometry(1.1, 1.2, 0.8, 12, 1, true).translate(x, y + 0.4, z), [0.48, 0.42, 0.34]);
      solid(new THREE.CircleGeometry(1.0, 12).rotateX(-Math.PI / 2).translate(x, y + 0.5, z), [0.02, 0.02, 0.025]);
    }
    for (let k = 0; k < (v.coast ? 10 : 4); k++) {
      const a = rr() * TAU, d = v.r * (0.5 + rr() * 0.7), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
      if (Math.abs(roadSO(x, z)[1]) > 5 && z > shoreZ(SEA_Z, x) + 6) palm(x, z, 0.9 + rr() * 0.3);
    }
    { const x = v.x - v.r * 0.05, z = v.z + v.r * 0.45; banyan(x, z, 1.0, 1); }
  }
  // coconut palms along the coast
  for (let k = 0; k < (lite ? 25 : 80); k++) {
    const x = (r() - 0.5) * 500, z = shoreZ(SEA_Z, x) + 11 + r() * 22;
    if (Math.abs(roadSO(x, z)[1]) < 22) continue;
    palm(x, z, 0.85 + r() * 0.35);
  }

  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  vegMat.userData.noBatch = true;
  const veg = new THREE.Mesh(mergeGeometries(parts), vegMat);
  veg.frustumCulled = false;
  group.add(veg);

  // long soft dawn shadows on the ground (cast away from the low sun)
  const shTex = (() => {
    const c = mkCanvas(64, 256), g = c.getContext('2d');
    const img = g.createImageData(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
      const u = (x + 0.5) / 64 * 2 - 1, v = (y + 0.5) / 256;               // v: 0 at the foot, 1 at the far end
      const wv = lerp(0.55, 1, Math.pow(sat(v * 3), 0.5)) * (1 - 0.35 * v);
      const a = sat(1 - Math.pow(Math.abs(u) / wv, 2.2)) * sat(v * 10) * Math.pow(1 - v, 0.6) ;
      const k = (y * 64 + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  })();
  {
    const pos = [], uv = [], sd = new THREE.Vector2(-shDir.y, shDir.x);
    for (const [x, z, w, L] of shadowsQ) {
      const cnr = [[-0.5, -0.06], [0.5, -0.06], [0.5, 1], [-0.5, 1]].map(([a, b]) => {
        const px = x + sd.x * a * w + shDir.x * b * L, pz = z + sd.y * a * w + shDir.y * b * L;
        return [px, GROUND_Y + groundH(px, pz) + 0.12, pz, a + 0.5, b];
      });
      for (const i of [0, 1, 2, 0, 2, 3]) { const c = cnr[i]; pos.push(c[0], c[1], c[2]); uv.push(c[3], 1 - Math.max(0, c[4])); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.MeshBasicMaterial({ color: '#0d0905', alphaMap: shTex, transparent: true, opacity: 0.42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.userData.noBatch = true;
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 1; mesh.frustumCulled = false;
    group.add(mesh);
  }
  return { group, groundH, VILLAGES };
}
