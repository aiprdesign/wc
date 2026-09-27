// Technical HUD / infographic elements: callouts, dimension lines, gauges, frames.
// Each element exposes `.reveal(p)` (0..1) so it can be animated in with one call.
import * as THREE from 'three';
import { TextPlane, FONTS } from './text.js';
import { progressLine, circlePoints, segmentsLine } from './lines.js';
import { sat } from './math.js';

// Callout: a dot on the anchor, an elbow leader line, and a mono label.
// Build in local space (anchor at origin); position the group at the anchor in world space.
export class Callout extends THREE.Group {
  constructor(label, { dx = 0.6, dy = 0.4, size = 0.07, color = '#cfe3ff', sub = null, intensity = 1.4 } = {}) {
    super();
    const elbow = new THREE.Vector3(dx * 0.6, dy, 0), end = new THREE.Vector3(dx, dy, 0);
    this.line = progressLine([new THREE.Vector3(), elbow, end], { color, intensity, head: 0.02 });
    this.dot = new THREE.Mesh(new THREE.RingGeometry(size * 0.18, size * 0.28, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, toneMapped: false, depthWrite: false }));
    this.label = new TextPlane(label, { font: FONTS.mono, weight: 400, height: size, color, intensity, letterSpacing: 0.12, align: 'left', revealDir: 'x' });
    const alignX = dx >= 0 ? 1 : -1;
    this.label.position.set(end.x + alignX * (this.label.worldWidth / 2 + size * 0.2), end.y, 0);
    this.add(this.line, this.dot, this.label);
    if (sub) {
      this.sub = new TextPlane(sub, { font: FONTS.mono, weight: 300, height: size * 0.7, color, intensity: intensity * 0.6, letterSpacing: 0.1, align: 'left' });
      this.sub.position.set(end.x + alignX * (this.sub.worldWidth / 2 + size * 0.2), end.y - size * 1.1, 0);
      this.add(this.sub);
    }
    this.reveal(0);
  }
  reveal(p, opacity = 1) {
    this.line.progress = sat(p * 1.6); this.line.opacity = opacity;
    this.dot.material.opacity = sat(p * 5) * opacity; this.dot.visible = p > 0;
    this.label.reveal = sat(p * 1.6 - 0.6); this.label.opacity = p > 0.35 ? opacity : 0;
    if (this.sub) { this.sub.reveal = sat(p * 1.6 - 0.75); this.sub.opacity = p > 0.45 ? opacity : 0; }
  }
}

// Dimension line between a and b with end ticks and a centred label (in the plane of a/b and `normal`).
export class Dimension extends THREE.Group {
  constructor(a, b, label, { color = '#cfe3ff', size = 0.06, tick = 0.08, intensity = 1.2, normal = new THREE.Vector3(0, 0, 1) } = {}) {
    super();
    const dir = b.clone().sub(a).normalize();
    const perp = new THREE.Vector3().crossVectors(dir, normal).normalize().multiplyScalar(tick);
    this.lines = segmentsLine([[a, b], [a.clone().add(perp), a.clone().sub(perp)], [b.clone().add(perp), b.clone().sub(perp)]], { color, intensity, orderFn: (p, q, i) => (i === 0 ? 0 : 0.5), stagger: 0.5 });
    this.label = new TextPlane(label, { font: FONTS.mono, height: size, color, intensity, letterSpacing: 0.12 });
    this.label.position.copy(a).add(b).multiplyScalar(0.5).add(perp.clone().multiplyScalar(-1.8));
    const ang = Math.atan2(dir.y, dir.x);
    this.label.rotation.z = Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang;
    this.add(this.lines, this.label);
    this.reveal(0);
  }
  reveal(p, opacity = 1) { this.lines.progress = sat(p * 1.4); this.lines.opacity = opacity; this.label.reveal = sat(p * 1.5 - 0.5); this.label.opacity = p > 0.3 ? opacity : 0; }
}

// Circular gauge: ring + tick marks + optional arc sweep, drawn progressively.
export class RingGauge extends THREE.Group {
  constructor(radius = 1, { ticks = 72, color = '#cfe3ff', intensity = 1.2, tickLen = 0.06, majorEvery = 6 } = {}) {
    super();
    this.ring = progressLine(circlePoints(radius, 160), { color, intensity, head: 0.03 });
    const segs = [];
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * Math.PI * 2, l = i % majorEvery === 0 ? tickLen * 2 : tickLen;
      segs.push([new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0), new THREE.Vector3(Math.cos(a) * (radius + l), Math.sin(a) * (radius + l), 0)]);
    }
    this.ticks = segmentsLine(segs, { color, intensity: intensity * 0.8, orderFn: (p, q, i) => (i / ticks) * 0.7, stagger: 0.7 });
    this.add(this.ring, this.ticks);
    this.reveal(0);
  }
  reveal(p, opacity = 1) { this.ring.progress = sat(p * 1.3); this.ring.opacity = opacity; this.ticks.progress = sat(p * 1.3 - 0.2); this.ticks.opacity = opacity; }
}

// Corner-bracket frame, e.g. for UI panels or focusing on a subject.
export class BracketFrame extends THREE.Group {
  constructor(w = 1, h = 1, { len = 0.15, color = '#cfe3ff', intensity = 1.2 } = {}) {
    super();
    const x = w / 2, y = h / 2, V = (a, b) => new THREE.Vector3(a, b, 0);
    this.lines = segmentsLine([
      [V(-x, y - len), V(-x, y)], [V(-x, y), V(-x + len, y)], [V(x - len, y), V(x, y)], [V(x, y), V(x, y - len)],
      [V(x, -y + len), V(x, -y)], [V(x, -y), V(x - len, -y)], [V(-x + len, -y), V(-x, -y)], [V(-x, -y), V(-x, -y + len)],
    ], { color, intensity, orderFn: () => 0, stagger: 0 });
    this.add(this.lines);
    this.reveal(0);
  }
  reveal(p, opacity = 1) { this.lines.progress = sat(p); this.lines.opacity = opacity; this.scale.setScalar(1 + (1 - sat(p)) * 0.3); }
}

// Keep an object facing the camera (billboard), preserving its world position.
export function faceCamera(obj, camera) { obj.quaternion.copy(camera.quaternion); }
