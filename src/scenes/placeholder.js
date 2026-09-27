// Stand-in used when a sequence module is missing or fails to load.
import * as THREE from 'three';
import { TextPlane, FONTS } from '../lib/text.js';
import { revealLines } from '../lib/lines.js';
import { envelope } from '../lib/math.js';

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 100);
  camera.position.set(0, 0, 6);
  const title = new TextPlane(segment.title.toUpperCase(), { font: FONTS.display, weight: 400, height: 0.28, letterSpacing: 0.2, intensity: 1.2 });
  const wire = revealLines(new THREE.IcosahedronGeometry(1.2, 1), { order: 'y', color: '#86b9ff', intensity: 1.5 });
  wire.position.z = -2;
  scene.add(title, wire);
  const dur = segment.end - segment.start;
  return {
    scene, camera,
    update(t) {
      title.opacity = envelope(t, 0, dur, 0.4, 0.4);
      wire.progress = Math.min(1, t / dur * 1.5);
      wire.rotation.y = t * 0.4;
      camera.position.z = 6 - t * 0.2;
    },
  };
}
