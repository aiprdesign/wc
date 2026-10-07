// The living landscape of STONE AND SPIRIT (temples.js), built from nature-kit.js:
//   · a ground patch: kept lawns round the Great Stupa on Sanchi hill and round the Thanjavur temple, pasture
//     over the plain, drier grass and scrub on the Deccan plateau at Ellora, bare rock on the slopes
//   · trees: neem, mango, peepal, banyan and ashoka on the plain, coconut palms round Thanjavur
//   · the Taj Mahal's charbagh: mown lawns, cypress rows (and their reflections), a blue-green channel,
//     and the Yamuna behind the mausoleum
import * as THREE from 'three';
import * as NK from './nature-kit.js';
import { rng } from '../../lib/math.js';

// MeshStandard ground with vertex colours: pasture / lawn / scrub in world space over the painted earth.
export function patchTempleGround(mat, { stupa, tower, taj, tajRy }) {
  mat.userData.noAntiTile = true;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTW; varying vec3 vTN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        ${NK.NK_NOISE}
        ${NK.NK_GROUND}
        varying vec3 vTW; varying vec3 vTN;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vTW.xz; float w = length(fwidth(q));
          float flt = smoothstep(0.8, 0.95, normalize(vTN).y);
          float plateau = smoothstep(20.0, 30.0, vTW.y);
          float n = nkF(q * 0.018 + 2.0), n2 = nkF(q * 0.09 + 5.0);
          vec3 grass = nkPasture(q, w, 0.25 + 0.5 * plateau);
          float dS = length(q - vec2(${stupa.x.toFixed(1)}, ${stupa.z.toFixed(1)}));
          float dT = length(q - vec2(${tower.x.toFixed(1)}, ${(tower.z + 10).toFixed(1)}));
          float lawn = max(1.0 - smoothstep(44.0, 58.0, dS), 1.0 - smoothstep(70.0, 95.0, dT));
          grass = mix(grass, nkLawn(q, w, vec2(0.8, 0.6)), lawn);
          float cover = flt * smoothstep(0.25, 0.5, n + 0.25 - 0.25 * plateau + 0.15 * n2);
          cover = max(cover, lawn * flt);
          // bare earth paths and worn ground on the plateau: the painted vertex colour shows through
          diffuseColor.rgb = mix(diffuseColor.rgb, grass, cover * (1.0 - 0.35 * plateau));
          diffuseColor.rgb *= 0.9 + 0.2 * nkN(q * 0.7);
        }`);
  };
  mat.customProgramCacheKey = () => 'temples-ground-nk';
}

// items for nature-kit, kinds by region; `near(x,z)` says whether a tree is close to the camera path
export function templeTreeItems(list, { tower, lite, near }) {
  const r = rng(31), items = [];
  for (const [x, y, z, s, a] of list) {
    const q = r();
    let kind;
    if (x < 80) kind = q < 0.35 ? 'neem' : q < 0.58 ? 'mango' : q < 0.74 ? 'peepal' : q < 0.88 ? 'banyan' : 'ashoka';
    else if (x < 190) kind = q < 0.55 ? 'neem' : q < 0.8 ? 'mango' : 'peepal';
    else if (x < 380) kind = q < 0.55 ? 'palm' : q < 0.78 ? 'neem' : q < 0.92 ? 'mango' : 'banyan';
    else kind = q < 0.4 ? 'neem' : q < 0.7 ? 'mango' : q < 0.85 ? 'peepal' : 'ashoka';
    items.push({ kind, x, y: y - 0.3, z, s: kind === 'palm' ? 0.9 + 0.3 * r() : s * 0.85, rot: a, lite: lite || !near(x, z), tint: 0.85 + 0.3 * r() });
  }
  return items;
}

// Taj garden: lawn material for the charbagh beds (world-space mown lawn, no tile)
export function lawnMaterial(dir = [1, 0]) {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92 });
  m.userData.noAntiTile = true; m.userData.noDetail = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        ${NK.NK_NOISE}
        ${NK.NK_GROUND}
        varying vec3 vLW;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        { vec2 q = vLW.xz; diffuseColor.rgb *= nkLawn(q, length(fwidth(q)), vec2(${dir[0].toFixed(3)}, ${dir[1].toFixed(3)})) * 1.1; }`);
  };
  m.customProgramCacheKey = () => 'nk-lawn';
  return m;
}
