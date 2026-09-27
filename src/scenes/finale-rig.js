// Camera rig + sun for the finale. Kept free of the 'three' import (THREE is passed in)
// so the same maths can be checked from node. Everything is a pure function of global T.
//
// The camera orbits Earth (az / el / distance) and then tilts in its own frame (yaw / pitch
// / roll), so "pitch" is literally the tilt-up that sinks Earth to the bottom of frame.
import { timeWarp, smoothstep, lerp, clamp } from '../lib/math.js';

export const EARTH_R = 1.6;
const D2R = Math.PI / 180;

// [T, square, wide] keys per channel. `wide` = 2.39:1 layout, `square` = 1:1 delivery.
// Values are interpolated by the output aspect, then over time with monotone cubic tangents.
const KEYS = {
  //        54.0        54.5        55.5        57.0        61.0        63.6        65.0        67.0        72.0
  d:     [[54.0, 2.85, 4.2], [54.5, 3.0, 4.5], [55.5, 3.62, 5.4], [57.0, 3.86, 5.9], [61.0, 3.98, 6.1], [63.6, 3.05, 3.4], [65.0, 2.5, 2.25], [67.0, 2.42, 2.17], [72.0, 2.34, 2.1]],
  az:    [[54.0, -50, -50], [54.5, -48, -48], [55.5, -42, -42], [57.0, -39, -39], [61.0, -34, -34], [63.6, -19, -19], [65.0, -9, -9], [67.0, -6, -6], [72.0, -1, -1]],
  el:    [[54.0, 4, 4], [54.5, 5, 5], [55.5, 8, 8], [57.0, 9, 9], [61.0, 10, 10], [63.6, 8, 8], [65.0, 9.5, 9.5], [67.0, 10, 10], [72.0, 11, 11]],
  pitch: [[54.0, 46, 30], [54.5, 38, 24], [55.0, 22, 12], [55.5, 13, 6], [57.0, 9.5, 2.5], [61.0, 8.5, 2], [63.6, 30, 30], [65.0, 45, 54], [67.0, 46, 55], [72.0, 46.5, 55.5]],
  yaw:   [[54.0, -14, 4], [54.5, -11, 8], [55.5, -3, 14], [57.0, -0.5, 17], [61.0, 0.5, 17.5], [63.6, 1, 6], [65.0, 0, 0], [67.0, 0, 0], [72.0, 0, 0]],
  roll:  [[54.0, -9, -9], [54.5, -7, -7], [55.5, -2.5, -2], [57.0, -1, -1], [61.0, 0, 0], [63.6, 2.2, 2.2], [65.0, 0.6, 0.6], [67.0, 0.2, 0.2], [72.0, 0, 0]],
};

export function makeRig(THREE, { outAspect, filmAspect = 2.39, fov = 35 }) {
  const wide = clamp((outAspect - 1) / (filmAspect - 1), 0, 1);
  // effective half-view tangents of the delivered frame (the engine opens the matte for other aspects)
  const tanV = Math.tan(fov * D2R / 2) * (outAspect === filmAspect ? 1 : Math.pow(filmAspect / outAspect, 0.85));
  const tanH = tanV * outAspect;
  const keys = {};
  for (const k in KEYS) keys[k] = KEYS[k].map(([T, s, w]) => [T, lerp(s, w, wide)]);
  const ch = (k, T) => timeWarp(clamp(T, 54, 72), keys[k]);

  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), O = new THREE.Vector3();

  // camera pose at global T → (pos, quat)
  function pose(T, pos, quat) {
    const az = ch('az', T) * D2R, el = ch('el', T) * D2R, d = ch('d', T);
    pos.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(d);
    m4.lookAt(pos, O, up);
    quat.setFromRotationMatrix(m4);
    quat.multiply(q.setFromAxisAngle(AY, ch('yaw', T) * D2R));
    quat.multiply(q.setFromAxisAngle(AX, ch('pitch', T) * D2R));
    quat.multiply(q.setFromAxisAngle(AZ, ch('roll', T) * D2R));
    return d;
  }

  // ---- Sun ------------------------------------------------------------------
  // Three lighting states, blended with slerp:
  //   BACK  (54.0–54.7)  sun tucked behind Earth: only the atmospheric rim glows
  //   SIDE  (56.2–61.2)  fixed world direction, lights Earth from the upper right (~55 % lit)
  //   RISE  (63.4– )     tied to the camera: the sun sits on the limb, up-right of centre, and
  //                      its elevation above the limb follows riseKeys (breaks the limb ≈64.1)
  const sp = new THREE.Vector3(), sq = new THREE.Quaternion();
  pose(58, sp, sq);
  const SIDE = new THREE.Vector3(0.86, 0.36, 0.06).normalize().applyQuaternion(sq);
  const riseKeys = [[54, -9], [62.0, -7], [63.3, -3.2], [63.6, -1.8], [64.1, 0.0], [64.6, 0.32], [65.0, 0.45], [67.0, 0.75], [72.0, 1.25]];
  const cd = new THREE.Vector3(), cu = new THREE.Vector3(), cr = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const sunPhi = lerp(15, 13, wide) * D2R;
  // direction of a point at angular elevation e (rad) above the limb, at angle phi from screen-up
  function limbDir(pos, quat, e, phi, out) {
    const d = pos.length();
    cd.copy(pos).negate().normalize();
    cu.set(0, 1, 0).applyQuaternion(quat); cr.set(1, 0, 0).applyQuaternion(quat);
    tmp.copy(cu).multiplyScalar(Math.cos(phi)).addScaledVector(cr, Math.sin(phi));
    tmp.addScaledVector(cd, -tmp.dot(cd)).normalize();
    const b = Math.asin(EARTH_R / d) + e;
    return out.copy(cd).multiplyScalar(Math.cos(b)).addScaledVector(tmp, Math.sin(b)).normalize();
  }
  function slerpDir(a, b, k, out) {
    const c = clamp(a.dot(b), -1, 1), w = Math.acos(c);
    if (w < 1e-4) return out.copy(a).lerp(b, k).normalize();
    const s = Math.sin(w);
    return out.copy(a).multiplyScalar(Math.sin((1 - k) * w) / s).addScaledVector(b, Math.sin(k * w) / s).normalize();
  }
  const sunElev = (T) => timeWarp(clamp(T, 54, 72), riseKeys);
  function sun(T, pos, quat, out) {
    const kIn = smoothstep(54.6, 56.3, T), kOut = smoothstep(61.2, 63.4, T);
    if (kOut > 0) {
      limbDir(pos, quat, sunElev(T) * D2R, sunPhi, tmp2);
      return slerpDir(SIDE, tmp2, kOut, out);
    }
    limbDir(pos, quat, -6 * D2R, 0, tmp2);
    return slerpDir(tmp2, SIDE, kIn, out);
  }

  // project a world direction (from the camera) to delivered-frame NDC; z<0 means in front
  function projectDir(dir, quat, out) {
    v.copy(dir).applyQuaternion(q.copy(quat).invert());
    out.set(v.x / -v.z / tanH, v.y / -v.z / tanV, v.z);
    return out;
  }

  return { pose, sun, sunElev, projectDir, tanV, tanH, wide, keys };
}
