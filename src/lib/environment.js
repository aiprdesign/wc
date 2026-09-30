// Per-sequence image-based lighting. Every lit scene used to reflect the same neutral grey studio
// room. Each sequence now gets that studio re-lit to match its own lights: its panels take the
// key's (and the rim's) colour and its walls the key's tint, so warm marble scenes reflect warm
// light and the electric chapters cool light, instead of every metal mirroring the same grey room. Energy and structure are the room's (the luminance of
// every panel is kept), so each scene's authored `scene.environmentIntensity` keeps its meaning,
// and the contrasty panel-and-wall structure that makes metal read as metal is preserved (a smooth
// sky gradient was tried: it flattened every metal to grey).
// Built once per sequence at load (a PMREM of the studio): no per-frame cost.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

// Gather the scene's directional / spot lights: world direction towards the light, colour and
// illuminance at the subject. `peak` maps light → the largest intensity seen during warm-up.
export function sceneLights(scene, peak = new Map()) {
  const out = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isLight || o.userData?.noEnv) return;
    const I = Math.max(peak.get(o) ?? 0, o.intensity);
    if (!(I > 0)) return;
    if (o.isDirectionalLight || o.isSpotLight) {
      o.getWorldPosition(p); o.target.getWorldPosition(q);
      const d = p.clone().sub(q), dist = d.length();
      if (!(dist > 1e-6)) return;
      const E = o.isSpotLight ? I / Math.max(1, dist * dist) : I;
      out.push({ dir: d.normalize(), color: o.color.clone(), E: E * lum(o.color) });
    } else if (o.isHemisphereLight) {
      out.push({ hemi: true, sky: o.color.clone(), ground: o.groundColor.clone(), E: I });
    }
  });
  return out;
}

const chroma = (c, k = 1) => { const l = lum(c); return l > 1e-5 ? c.clone().multiplyScalar(k / l) : new THREE.Color(k, k, k); };

/**
 * Build a PMREM environment matched to `lights` (from sceneLights). Returns a texture, or null
 * when the scene has no usable key light (it then keeps the default studio).
 * look: { tint (0..1, how strongly panels and walls take the lights' colour; default 0.5) }
 */
export function buildSceneEnvironment(renderer, lights, { size = 128, look = {} } = {}) {
  const keys = lights.filter((l) => !l.hemi && l.E > 0).sort((a, b) => b.E - a.E);
  if (!keys.length) return null;
  const tint = look.tint ?? 0.5;
  const white = new THREE.Color(1, 1, 1);
  const kc = white.clone().lerp(chroma(keys[0].color), tint), kc1 = chroma(kc);
  const rc = chroma(white.clone().lerp(chroma((keys[1] ?? keys[0]).color), tint));
  const room = new RoomEnvironment();
  // walls, boxes and the room's own lamp: tinted by the key (luminance kept)
  room.traverse((o) => {
    if (o.isPointLight) o.color.copy(kc1);
    if (!o.isMesh) return;
    const m = o.material;
    if (m.isMeshStandardMaterial) m.color.copy(white.clone().lerp(kc1, 0.6)).multiplyScalar(1 / Math.max(1e-3, lum(white.clone().lerp(kc1, 0.6))));
    else if (m.isMeshBasicMaterial) {
      // the panels: +x and −z (the room's secondary side) take the rim colour, the rest the key
      const I = m.color.r;
      const p = o.position;
      const side = (p.x > 10) || (p.z < -10);
      m.color.copy(side ? rc : kc1).multiplyScalar(I);
    }
  });
  // (turning the room so its main softbox sits behind the key light was tried: it doubles the key's
  // highlight, which is already an analytic light, and made marble and steel look lacquered)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(room, 0.04, 0.1, 100, { size }).texture;
  pmrem.dispose();
  room.dispose();
  return tex;
}
