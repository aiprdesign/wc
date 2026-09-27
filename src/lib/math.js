// Deterministic timing helpers. Every scene is a pure function of time, so
// scrubbing, seeking and frame-by-frame rendering always produce the same image.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const sat = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (v - a) / (b - a);
export const remap = (v, a, b, c, d) => c + (d - c) * sat((v - a) / (b - a));
export const smoothstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const smootherstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
export const fract = (v) => v - Math.floor(v);
export const TAU = Math.PI * 2;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

// Progress of t through [a, b], clamped and eased. ramp(t, 1, 2, ease.outCubic)
export const ramp = (t, a, b, fn = ease.inOutCubic) => fn(sat((t - a) / (b - a)));

// Trapezoid envelope: 0 before a, fades in over fi, holds, fades out over fo ending at b.
export function envelope(t, a, b, fi = 0.25, fo = 0.25, fn = ease.inOutSine) {
  if (t <= a || t >= b) return 0;
  const i = fi > 0 ? sat((t - a) / fi) : 1;
  const o = fo > 0 ? sat((b - t) / fo) : 1;
  return fn(Math.min(i, o));
}

// Speed ramp / time remap. keys: [[t0, v0], [t1, v1], ...] (monotonic t).
// Between keys the value is interpolated with smooth tangents so velocity
// changes feel like a real camera speed ramp rather than a hard edit.
export function timeWarp(t, keys) {
  if (t <= keys[0][0]) return keys[0][1] + (t - keys[0][0]) * slope(keys, 0);
  const n = keys.length - 1;
  if (t >= keys[n][0]) return keys[n][1] + (t - keys[n][0]) * slope(keys, n);
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
  const h = t1 - t0, u = (t - t0) / h;
  const m0 = slope(keys, i) * h, m1 = slope(keys, i + 1) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
}
function slope(keys, i) {
  const n = keys.length - 1;
  if (n === 0) return 0;
  if (i === 0) return (keys[1][1] - keys[0][1]) / (keys[1][0] - keys[0][0]);
  if (i === n) return (keys[n][1] - keys[n - 1][1]) / (keys[n][0] - keys[n - 1][0]);
  // Monotone (Fritsch–Carlson style) tangent.
  const d0 = (keys[i][1] - keys[i - 1][1]) / (keys[i][0] - keys[i - 1][0]);
  const d1 = (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0]);
  if (d0 * d1 <= 0) return 0;
  return (2 * d0 * d1) / (d0 + d1);
}

// Seeded PRNG so procedural layouts are identical on every run.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const hash1 = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);

// Smoothly interpolate a list of THREE.Vector3 keyframes ([[t, vec3], ...]) — handy for camera paths.
export function pathAt(t, keys, out, fn = ease.inOutCubic) {
  if (t <= keys[0][0]) return out.copy(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const u = fn((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
      return out.copy(keys[i - 1][1]).lerp(keys[i][1], u);
    }
  }
  return out.copy(keys[keys.length - 1][1]);
}
