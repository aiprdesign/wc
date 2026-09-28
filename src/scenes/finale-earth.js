// Procedural Earth for the finale: surface + cloud maps are baked once on the GPU at build
// time (equirectangular, matched to SphereGeometry's uv layout), so the per-frame shader is
// cheap and can afford GGX ocean glint, cloud shadows, night lights and atmospheric haze.
import * as THREE from 'three';
import { GLSL_NOISE } from '../lib/noise.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const bakeFrag = /* glsl */ `
${GLSL_NOISE}
uniform int uMode;
varying vec2 vUv;
float fbm(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 9; i++){ if (i >= oct) break; s += a * snoise(p); p = p * 2.02 + vec3(17.1, 3.3, 9.7); a *= 0.5; } return s; }
float ridge(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a * (1.0 - abs(snoise(p))); p = p * 2.07 + 5.1; a *= 0.5; } return s; }
float hash3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  float phi = vUv.x * 6.28318530718, th = (1.0 - vUv.y) * 3.14159265359;
  vec3 p = vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  // continents: domain-warped fbm → coastline, with a ridged mountain signal
  vec3 w = vec3(snoise(p * 1.6 + vec3(1.3, 7.1, 2.2)), snoise(p * 1.6 + vec3(5.2, 1.3, 8.4)), snoise(p * 1.6 + vec3(9.1, 4.7, 3.3)));
  vec3 q = p + 0.3 * w;
  float c = fbm(q * 1.2 + vec3(3.1, 0.7, -2.4), 9) + 0.05 * snoise(q * 16.0);
  float thr = 0.06;
  float land = smoothstep(thr - 0.0035, thr + 0.0035, c);
  float elev = c - thr;
  float alat = abs(asin(clamp(p.y, -1.0, 1.0))) / 1.5708;
  float coast = 1.0 - smoothstep(0.0, 0.14, elev);
  float moist = fbm(p * 2.1 + vec3(11.0, 2.0, 5.0), 6) * 0.9 + 0.5 + coast * 0.22;
  float belt = exp(-pow((alat - 0.27) / 0.1, 2.0));
  float dry = clamp(belt * 1.2 - moist * 0.85 + 0.2 + 0.2 * snoise(p * 5.0), 0.0, 1.0);
  float mtn = ridge(q * 3.2 + 2.0, 5);
  if (uMode == 0) {
    // sunlit-Earth palette (as seen from orbit: rich greens, ochre deserts, deep navy oceans)
    vec3 forest = vec3(0.030, 0.068, 0.024), grass = vec3(0.095, 0.125, 0.045), sav = vec3(0.23, 0.18, 0.085);
    vec3 desert = vec3(0.50, 0.34, 0.17), rock = vec3(0.19, 0.16, 0.12), tundra = vec3(0.15, 0.15, 0.125);
    vec3 L = mix(forest, grass, smoothstep(0.35, 0.8, 1.0 - moist + alat * 0.4));
    L = mix(L, sav, smoothstep(0.35, 0.62, dry));
    L = mix(L, desert, smoothstep(0.58, 0.86, dry));
    L = mix(L, tundra, smoothstep(0.56, 0.7, alat));
    float hi = smoothstep(0.12, 0.3, elev) * smoothstep(0.55, 0.85, mtn);
    L = mix(L, rock, hi * 0.8);
    L *= 0.78 + 0.44 * (snoise(p * 48.0) * 0.5 + 0.5) * (0.7 + 0.3 * snoise(p * 150.0));
    float ice = smoothstep(0.81, 0.87, alat + 0.05 * snoise(p * 7.0) + 0.02 * snoise(p * 40.0));
    ice = max(ice, land * smoothstep(0.35, 0.5, elev + 0.25 * mtn - 0.1 + 0.4 * alat - 0.2) * 0.9);
    float deep = smoothstep(0.0, 0.2, -elev);
    vec3 ocean = mix(vec3(0.016, 0.085, 0.15), vec3(0.004, 0.022, 0.095), deep);
    ocean *= 0.9 + 0.2 * snoise(p * 9.0);
    vec3 alb = mix(ocean, L, land);
    alb = mix(alb, vec3(0.72, 0.78, 0.85), ice);
    float water = (1.0 - land) * (1.0 - ice);
    gl_FragColor = vec4(sqrt(alb), water);
  } else {
    // city lights: clustered by population (coasts, temperate latitudes), speckled at two scales
    float pop = smoothstep(0.05, 0.5, fbm(p * 3.6 + vec3(7.0), 6)) * land;
    pop *= (0.5 + 0.6 * coast) * (1.0 - smoothstep(0.52, 0.72, alat)) * (1.0 - 0.9 * smoothstep(0.5, 0.8, dry));
    float metro = smoothstep(0.35, 0.8, fbm(p * 11.0 + vec3(3.0), 4) + pop * 0.5);
    float s1 = hash3(floor(p * 520.0)), s2 = hash3(floor(p * 1300.0) + 3.0);
    // sparse towns everywhere people live, dense bright metros (not a uniform glitter over the land)
    float dens = 0.01 + 0.16 * metro * metro;
    float lights = pop * (step(1.0 - dens, s1) * 0.55 + step(1.0 - dens * 0.8, s2) * 0.9) + pop * metro * metro * 0.05;
    // clouds: warped fbm, streaky storm bands, fewer over the desert belts
    vec3 cw = vec3(snoise(p * 1.3 + 2.0), snoise(p * 1.3 + 7.0), snoise(p * 1.3 + 13.0));
    vec3 cp = p + 0.35 * cw;
    float cl = fbm(cp * vec3(2.2, 3.6, 2.2), 8) + 0.3 * fbm(p * 8.0 + cw * 2.5, 5);
    float bands = 0.75 + 0.45 * exp(-pow(alat / 0.12, 2.0)) + 0.35 * exp(-pow((alat - 0.55) / 0.12, 2.0)) - 0.45 * belt;
    float cloud = smoothstep(0.06, 0.62, cl * bands + 0.05);
    cloud *= 0.85 + 0.15 * snoise(p * 60.0);
    // relief height (b): coastal plains → ridged ranges, for the per-pixel terrain shading
    float relief = land * clamp(smoothstep(0.0, 0.3, elev) * 0.35 + smoothstep(0.35, 0.95, mtn) * smoothstep(0.02, 0.2, elev) * 0.65, 0.0, 1.0);
    gl_FragColor = vec4(clamp(lights, 0.0, 1.0), clamp(cloud, 0.0, 1.0), relief, 1.0);
  }
}`;

export function bakeEarth(renderer, { width = 4096 } = {}) {
  const h = width / 2;
  const mk = () => new THREE.WebGLRenderTarget(width, h, {
    type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, anisotropy: 8,
  });
  const surf = mk(), aux = mk();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: bakeFrag, depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  for (const [rt, mode] of [[surf, 0], [aux, 1]]) {
    mat.uniforms.uMode.value = mode;
    renderer.setRenderTarget(rt);
    quad.render(renderer);
  }
  renderer.setRenderTarget(prev);
  quad.dispose(); mat.dispose();
  for (const rt of [surf, aux]) { rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.anisotropy = 8; }
  return { surf: surf.texture, aux: aux.texture };
}

export const earthVert = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;
void main(){
  vUv = uv; vO = normalize(position);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const earthFrag = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D uSurf, uAux;
uniform vec3 uSun, uSunObj, uShade;
uniform float uCloudOff, uCity, uBright, uWarm, uTime;
varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;
void main(){
  vec4 s = texture2D(uSurf, vUv);
  vec3 alb = s.rgb * s.rgb; float water = s.a;
  vec3 n0 = normalize(vO);
  float fine = snoise(n0 * 260.0);
  alb *= 0.88 + 0.24 * (fine * 0.5 + 0.5) * (1.0 - water * 0.7);
  // clouds drift relative to the ground, with a slow latitudinal shear so the decks visibly evolve
  vec2 cuv = vUv + vec2(uCloudOff + 0.0022 * sin(vUv.y * 11.0 + uTime * 0.23) * (0.5 + 0.5 * sin(vUv.x * 6.2832 * 2.0 + uTime * 0.11)), 0.0);
  float cloud = texture2D(uAux, cuv).g;
  cloud = clamp(cloud + (snoise(n0 * 90.0 + 3.0) * 0.6 + fine * 0.4) * 0.16 * cloud * (1.0 - cloud) * 4.0, 0.0, 1.0);
  float lights = texture2D(uAux, vUv).r;
  // city lights twinkle (atmospheric scintillation): each cluster breathes on its own phase
  lights *= 0.62 + 0.38 * (0.5 + 0.5 * snoise(n0 * 380.0 + vec3(0.0, 0.0, uTime * 1.7)));
  vec3 n = normalize(vO);
  float sinT = max(length(n.xz), 0.05);
  vec3 east = vec3(n.z, 0.0, -n.x) / sinT;
  vec3 north = cross(n, east);
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = uShade;                 // shading light (the sun, nudged towards camera at sunrise)
  float ndl = dot(N, L);
  float mu = max(dot(N, V), 0.0);
  // cloud shadow: sample the cloud layer one cloud-height towards the sun
  float lo = 0.011 / max(dot(n, uSunObj), 0.12);
  vec2 so = vec2(dot(uSunObj, east) / (6.2832 * sinT), dot(uSunObj, north) / 3.1416) * lo;
  float cshadow = texture2D(uAux, cuv + so).g;
  // sunlight reddens at grazing incidence; uWarm adds the golden-hour wash of the sunrise
  vec3 sunCol = mix(vec3(1.0, 0.36, 0.12), vec3(1.0, 0.95, 0.88), smoothstep(-0.02, 0.32, ndl));
  sunCol = mix(sunCol, sunCol * vec3(1.0, 0.78, 0.5) * 1.15, uWarm);
  float E = 2.55;
  float diff = max(ndl, 0.0);
  float cdiff = smoothstep(-0.08, 1.0, ndl);
  // terrain relief: the baked height field tilts the ground normal (object space), so ranges and
  // escarpments catch the low sun near the terminator; oceans and flat plains are untouched
  vec2 dt = vec2(1.5 / 4096.0, 1.5 / 2048.0);
  float gx = texture2D(uAux, vUv + vec2(dt.x, 0.0)).b - texture2D(uAux, vUv - vec2(dt.x, 0.0)).b;
  float gy = texture2D(uAux, vUv + vec2(0.0, dt.y)).b - texture2D(uAux, vUv - vec2(0.0, dt.y)).b;
  vec3 nP = normalize(n - (gx * east + gy * north) * 2.4);
  float rdiff = max(dot(nP, uSunObj), 0.0);
  diff = mix(diff, rdiff, 0.75 * (1.0 - water) * smoothstep(-0.05, 0.05, ndl));
  vec3 ground = alb * diff * (1.0 - 0.38 * cshadow * (1.0 - cloud));
  // ocean: two-lobe GGX glint with Schlick fresnel
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
  float a1 = 0.06, a2 = 0.0045;
  float d1 = a1 / (3.1416 * pow(nh * nh * (a1 - 1.0) + 1.0, 2.0));
  float d2 = a2 / (3.1416 * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float spec = water * (1.0 - cloud) * (1.0 - 0.6 * cshadow) * (d1 * 0.5 + d2 * 0.3) * min(F, 0.12) / (4.0 * max(mu, 0.2)) * smoothstep(0.0, 0.08, ndl) * smoothstep(0.08, 0.4, mu);
  // cloud depth: the lee side of a thick deck (thicker towards the sun) falls into its own shade,
  // thin veils stay a touch blue from the ocean beneath
  float relief = clamp(1.0 + (cloud - cshadow) * 1.3, 0.6, 1.2);
  vec3 cloudCol = mix(vec3(0.62, 0.7, 0.8), vec3(0.93, 0.94, 0.96), smoothstep(0.15, 0.8, cloud)) * relief;
  vec3 col = mix(ground, cloudCol * cdiff * (0.85 + 0.15 * cloud), cloud) * sunCol * E;
  col += spec * sunCol * E * vec3(1.0, 0.92, 0.8);
  // atmosphere seen through: blue haze towards the limb on the day side, thin veil everywhere lit
  float day = smoothstep(-0.06, 0.4, ndl);
  float haze = pow(1.0 - mu, 2.2);
  vec3 sky = mix(vec3(0.7, 0.36, 0.2), vec3(0.12, 0.34, 0.95), smoothstep(0.0, 0.3, ndl));
  sky = mix(sky, vec3(0.85, 0.55, 0.3), uWarm * 0.3);
  col = col * (1.0 - 0.4 * haze * day) + sky * (0.06 + 0.75 * haze) * day * 0.5;
  // night-side city lights, dimmed by cloud
  float night = 1.0 - smoothstep(-0.12, 0.08, ndl);
  col += vec3(1.0, 0.62, 0.3) * lights * 1.6 * uCity * night * (1.0 - cloud * 0.8);
  gl_FragColor = vec4(col * uBright, 1.0);
}`;

// Analytic limb glow on a shell around Earth: closest approach of each view ray gives the
// optical depth; Rayleigh blue on the day side, warm at the terminator, Mie forward-scattering
// (the sunrise arc) when looking towards a sun behind the limb.
export const atmoVert = /* glsl */ `
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const atmoFrag = /* glsl */ `
uniform vec3 uSun, uShade; uniform float uR, uHs, uAtmo, uMie, uWarm;
varying vec3 vW;
void main(){
  vec3 O = cameraPosition;
  vec3 dir = normalize(vW - O);
  float b = dot(-O, dir);
  vec3 Pc = O + dir * b;
  float h = length(Pc);
  float x = (h - uR) / uHs;
  float g = x > 0.0 ? exp(-x) + 0.05 * exp(-x * 0.3) : exp(x * 0.25) * 0.4 + 0.6 * exp(x * 1.5);
  vec3 nc = Pc / max(h, 1e-4);
  float sl = dot(nc, uShade);
  float lit = smoothstep(-0.2, 0.3, sl);
  // terminator orange → pale cyan → Rayleigh blue (never through a muddy lavender)
  vec3 ray = mix(vec3(1.0, 0.45, 0.18) * 0.8, vec3(0.5, 0.78, 1.0), smoothstep(-0.16, -0.02, sl));
  ray = mix(ray, vec3(0.2, 0.5, 1.0), smoothstep(-0.02, 0.3, sl));
  float cs = max(dot(dir, uSun), 0.0);
  ray = mix(ray, vec3(1.0, 0.66, 0.36) * 1.2, uWarm * pow(cs, 6.0));
  float mie = uMie * (pow(cs, 900.0) * 7.0 + pow(cs, 90.0) * 2.0 + pow(cs, 14.0) * 0.35 + pow(cs, 4.0) * 0.03);
  vec3 mieCol = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.86, 0.62), pow(cs, 60.0));
  float gm = x > 0.0 ? g : g * 0.35;
  vec3 col = g * ray * lit * 1.7 + gm * mieCol * mie * smoothstep(-0.45, 0.05, dot(nc, uSun)) * (1.0 + uWarm);
  gl_FragColor = vec4(col * uAtmo, 1.0);
}`;
