// Physically based material presets + stylised shaders (fresnel glow, hologram,
// fake volumetric light shafts). Pair PBR materials with scene.environment = ctx.env.
import * as THREE from 'three';
import { marbleTexture, brushedMetalTexture } from './textures.js';

export function marble({ seed = 0, repeat = 1, color = '#ffffff', roughness = 0.32 } = {}) {
  const map = marbleTexture({ seed });
  map.repeat.set(repeat, repeat);
  return new THREE.MeshPhysicalMaterial({ map, color, roughness, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.2, sheenColor: new THREE.Color('#fff4e0') });
}
export const clay = (color = '#c7b29a') => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
export const bronze = (roughness = 0.38) => new THREE.MeshStandardMaterial({ color: '#b07a45', metalness: 1, roughness });
export const gold = (roughness = 0.25) => new THREE.MeshStandardMaterial({ color: '#f0c46a', metalness: 1, roughness });
export const copper = (roughness = 0.3) => new THREE.MeshStandardMaterial({ color: '#e08a55', metalness: 1, roughness });
export function steel({ roughness = 0.32, brushed = true, color = '#c9d0d8' } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness });
  if (brushed) { const t = brushedMetalTexture(); m.roughnessMap = t; m.map = t; }
  return m;
}
export const darkMetal = (roughness = 0.45) => new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.9, roughness });
export const glass = ({ color = '#ffffff', ior = 1.5, thickness = 0.5 } = {}) =>
  new THREE.MeshPhysicalMaterial({ color, metalness: 0, roughness: 0.02, transmission: 1, ior, thickness, transparent: true, specularIntensity: 1, envMapIntensity: 1.5 });

// Unlit HDR colour — values above 1 feed the bloom.
export const emissive = (color = '#ffffff', intensity = 3, { additive = false, opacity = 1 } = {}) =>
  new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), transparent: additive || opacity < 1, opacity, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !additive, toneMapped: false });

// Rim-light / x-ray glow. power ~2-4. Additive.
export function fresnel({ color = '#9cc8ff', intensity = 2, power = 2.5, opacity = 1, base = 0.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uPower: { value: power }, uOpacity: { value: opacity }, uBase: { value: base } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uIntensity, uPower, uOpacity, uBase; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower); gl_FragColor = vec4(uColor * uIntensity, (f + uBase) * uOpacity); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Holographic projection: fresnel + horizontal scanlines + flicker + vertical build-up (uReveal).
export function hologram({ color = '#9cc8ff', intensity = 1.6, opacity = 0.9 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uOpacity: { value: opacity }, uTime: { value: 0 }, uReveal: { value: 1 }, uMinY: { value: -1 }, uMaxY: { value: 1 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uIntensity, uOpacity, uTime, uReveal, uMinY, uMaxY; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float h = (vW.y - uMinY) / (uMaxY - uMinY);
        if (h > uReveal) discard;
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float scan = 0.75 + 0.25 * sin(vW.y * 220.0 - uTime * 6.0);
        float edge = smoothstep(uReveal - 0.03, uReveal, h) * 3.0;
        float flick = 0.94 + 0.06 * sin(uTime * 37.0);
        gl_FragColor = vec4(uColor * uIntensity * (1.0 + edge), (0.12 + f * 0.9) * scan * flick * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Fake volumetric light shaft: an open cone pointing down -Y from its apex at the origin.
// Place/rotate the mesh; fades with length and towards silhouette edges.
export function lightShaft({ length = 10, radiusTop = 0.3, radiusBottom = 3, color = '#ffd9a0', intensity = 0.35 } = {}) {
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 48, 1, true);
  g.translate(0, -length / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uLength: { value: length }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform float uLength;
      void main(){ vH = -position.y / uLength; vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uIntensity, uTime; varying float vH; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float facing = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float along = pow(1.0 - vH, 1.3) * smoothstep(0.0, 0.08, vH);
        float streak = 0.8 + 0.2 * sin(atan(vP.z, vP.x) * 23.0 + uTime * 0.3) * sin(atan(vP.z, vP.x) * 7.0 - uTime * 0.2);
        gl_FragColor = vec4(uColor * uIntensity * facing * along * streak, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// Screen-facing soft glow sprite (lens bloom core, sun, spark head).
export function glowSprite({ color = '#ffffff', intensity = 3, scale = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.setScalar(scale);
  return s;
}
