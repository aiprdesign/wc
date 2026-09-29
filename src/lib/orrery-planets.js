// Realistic bodies for the science chapter's brass orrery: the Sun, eight planets and the Moon.
// Surface maps are baked once on the GPU at build time (equirectangular, matched to
// SphereGeometry's uv layout; RGB = sqrt-encoded albedo, A = relief height), so the per-frame
// shaders stay cheap: sun-lit Lambert / Lommel–Seeliger shading with relief from the height
// channel, Earth's ocean glint and drifting clouds, Saturn's ring shadow, gas-giant limb
// darkening and an atmosphere rim. Everything is a pure function of the uniforms (time in, image out).
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GLSL_NOISE } from './noise.js';

// ---------------------------------------------------------------------------------------------
// Bake shader: one mode per map.
const BAKE_MODES = { mercury: 0, venus: 1, earth: 2, earthClouds: 3, mars: 4, jupiter: 5, saturn: 6, uranus: 7, neptune: 8, moon: 9 };

const bakeFrag = /* glsl */ `
${GLSL_NOISE}
uniform int uMode;
varying vec2 vUv;
const float PI = 3.14159265359;
float fbm(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 10; i++){ if (i >= oct) break; s += a * snoise(p); p = p * 2.03 + vec3(17.1, 3.3, 9.7); a *= 0.5; } return s; }
float ridge(vec3 p, int oct){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++){ if (i >= oct) break; s += a * (1.0 - abs(snoise(p))); p = p * 2.07 + 5.1; a *= 0.5; } return s; }
vec3 hash33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }
// unit direction from latitude / longitude (degrees), same convention as the uv sphere
vec3 dirLL(float lat, float lon){ float a = radians(lat), o = radians(lon); return vec3(-cos(o) * cos(a), sin(a), sin(o) * cos(a)); }
float adist(vec3 a, vec3 b){ return acos(clamp(dot(a, b), -1.0, 1.0)); }
// distance (radians) from p to the great-circle arc a→b
float arcDist(vec3 p, vec3 a, vec3 b){
  vec3 n = normalize(cross(a, b));
  vec3 q = normalize(p - n * dot(p, n));
  float ab = adist(a, b);
  float t = adist(a, q), u = adist(q, b);
  float off = asin(clamp(abs(dot(p, n)), 0.0, 1.0));
  return (t <= ab && u <= ab) ? off : min(adist(p, a), adist(p, b));
}
// one octave of impact craters: x = relief, y = fresh-ejecta brightness
vec2 craters(vec3 p, float freq, float dens, float seed){
  vec3 q = p * freq; vec3 id = floor(q); vec3 f = q - id;
  float h = 0.0, b = 0.0;
  for (int k = 0; k < 27; k++){
    vec3 o = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
    vec3 cid = id + o; vec3 r = hash33(cid + seed);
    if (r.z > dens) continue;
    vec3 c = o + 0.15 + 0.7 * hash33(cid + seed + 7.31);
    float R = 0.16 + 0.3 * r.x * r.x;
    float d = length(f - c) / R;
    if (d > 2.6) continue;
    float depth = 0.55 + 0.45 * r.y;
    float bowl = d < 1.0 ? (d * d - 1.0) * depth : 0.0;
    float rim = exp(-pow((d - 1.0) / 0.2, 2.0)) * 0.32;
    float ej = d > 1.0 ? exp(-(d - 1.0) * 2.2) * 0.1 : 0.0;
    float peak = R > 0.3 ? exp(-d * d * 60.0) * 0.4 : 0.0;
    h += bowl + rim + ej + peak;
    float fresh = step(0.82, r.y);
    b += fresh * (d < 1.15 ? 0.6 : exp(-(d - 1.15) * 2.5) * 0.45) + (d < 1.0 ? -0.05 : 0.0);
  }
  return vec2(h, b);
}
// bright ray system around a young crater at direction c (angular radius rad)
float rays(vec3 p, vec3 c, float rad, float seed){
  float d = adist(p, c);
  if (d > rad * 9.0) return 0.0;
  vec3 e1 = normalize(cross(c, abs(c.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(c, e1);
  float a = atan(dot(p, e2), dot(p, e1));
  float s = pow(max(0.0, snoise(vec3(cos(a) * 7.0, sin(a) * 7.0, seed)) * 0.5 + snoise(vec3(cos(a) * 19.0, sin(a) * 19.0, seed + 3.0)) * 0.5), 1.5);
  float fall = smoothstep(rad * 9.0, rad * 1.2, d);
  float halo = exp(-pow(max(d - rad, 0.0) / (rad * 1.3), 2.0));
  return clamp(s * fall * 1.6 + halo * 0.8, 0.0, 1.2);
}
float blob(vec3 p, vec3 c, float r, float edge){ return 1.0 - smoothstep(r - edge, r + edge, adist(p, c)); }

void main(){
  float phi = vUv.x * 6.28318530718, th = (1.0 - vUv.y) * PI;
  vec3 p = vec3(-cos(phi) * sin(th), cos(th), sin(phi) * sin(th));
  float lat = degrees(asin(clamp(p.y, -1.0, 1.0)));
  float alat = abs(lat) / 90.0;
  vec3 alb = vec3(0.5); float hgt = 0.5;

  if (uMode == 0) {
    // MERCURY: grey-brown regolith, saturated with craters, a few bright rayed ones, smooth plains
    float m = fbm(p * 2.2 + 4.0, 6);
    alb = mix(vec3(0.27, 0.255, 0.24), vec3(0.40, 0.38, 0.355), m * 0.5 + 0.5);
    float plains = smoothstep(0.12, 0.3, fbm(p * 1.4 + 9.0, 4));
    alb = mix(alb, vec3(0.30, 0.295, 0.30), plains * 0.6);
    vec2 c = craters(p, 3.0, 0.55, 1.0) * 1.0 + craters(p, 6.5, 0.6, 2.0) * 0.6 * (1.0 - plains * 0.7)
           + craters(p, 14.0, 0.65, 3.0) * 0.35 * (1.0 - plains * 0.5) + craters(p, 30.0, 0.7, 4.0) * 0.18 + craters(p, 62.0, 0.7, 5.0) * 0.08;
    float ry = rays(p, dirLL(-18.0, 30.0), 0.05, 1.0) + rays(p, dirLL(35.0, -120.0), 0.035, 2.0) * 0.8 + rays(p, dirLL(-50.0, 160.0), 0.03, 3.0) * 0.7 + rays(p, dirLL(10.0, -40.0), 0.025, 4.0) * 0.6;
    alb *= 1.0 + 0.35 * c.y;
    alb = mix(alb, vec3(0.66, 0.64, 0.6), clamp(ry * 0.55, 0.0, 0.7));
    alb *= 0.82 + 0.3 * (snoise(p * 90.0) * 0.5 + 0.5) + 0.12 * fbm(p * 7.0, 4);
    hgt = 0.5 + 0.22 * c.x + 0.03 * fbm(p * 20.0, 3);
  } else if (uMode == 1) {
    // VENUS: an unbroken sulphuric cloud deck: fine streaks sheared by the super-rotation and the dark
    // sideways 'Y' (stem along the equator, arms opening toward the mid-latitudes), on a yellow cream
    float lon = atan(p.z, -p.x);
    float w = fbm(vec3(p.x * 2.5, p.y * 5.0, p.z * 2.5) + 3.0, 5);
    float rl = atan(sin(lon - 0.4), cos(lon - 0.4));
    float armLat = 34.0 * smoothstep(0.0, 1.8, rl) * (1.0 - smoothstep(2.3, 3.1, rl));
    float yw = 6.0 + 5.0 * smoothstep(0.0, 1.8, rl);
    float yMask = exp(-pow((abs(lat) - armLat + 3.0 * w) / yw, 2.0)) * smoothstep(-2.8, -1.4, rl) * (1.0 - smoothstep(2.0, 2.9, rl));
    float bow = sin(radians(armLat)) * sign(p.y) * 0.7;
    vec3 q = vec3(p.x * 1.3, (p.y - bow) * 14.0, p.z * 1.3);
    float streak = fbm(q + vec3(0.0, w * 1.4, 0.0), 7);
    float fine = fbm(vec3(p.x * 6.0, (p.y - bow) * 72.0, p.z * 6.0) + w * 2.0, 5);
    alb = mix(vec3(0.76, 0.6, 0.34), vec3(0.96, 0.87, 0.63), smoothstep(-0.32, 0.32, streak + 0.5 * fine));
    alb = mix(alb, vec3(0.70, 0.54, 0.32), yMask * 0.55 * (0.7 + 0.3 * smoothstep(-0.3, 0.3, fine)));
    alb = mix(alb, vec3(0.97, 0.92, 0.76), smoothstep(0.62, 0.85, alat) * 0.6);    // bright polar collars
    alb = mix(alb, alb * 0.86, exp(-pow((alat - 0.6) / 0.05, 2.0)) * 0.6);        // dark collar edge
    alb *= 0.95 + 0.07 * snoise(p * 60.0);
    hgt = 0.5;
  } else if (uMode == 2 || uMode == 3) {
    // EARTH: continents from domain-warped fbm, biomes by latitude & moisture, ice caps, clouds
    if (uMode == 2) {
      vec3 w = vec3(snoise(p * 1.6 + vec3(1.3, 7.1, 2.2)), snoise(p * 1.6 + vec3(5.2, 1.3, 8.4)), snoise(p * 1.6 + vec3(9.1, 4.7, 3.3)));
      vec3 q = p + 0.3 * w;
      float c = fbm(q * 1.2 + vec3(-4.1, 2.7, 6.4), 9) + 0.05 * snoise(q * 16.0);
      float thr = 0.05;
      float land = smoothstep(thr - 0.004, thr + 0.004, c);
      float elev = c - thr;
      float coast = 1.0 - smoothstep(0.0, 0.14, elev);
      float moist = fbm(p * 2.1 + vec3(11.0, 2.0, 5.0), 6) * 0.9 + 0.5 + coast * 0.22;
      float belt = exp(-pow((alat - 0.27) / 0.1, 2.0));
      float dry = clamp(belt * 1.1 - moist * 0.9 + 0.1 + 0.2 * snoise(p * 5.0), 0.0, 1.0);
      float mtn = ridge(q * 3.2 + 2.0, 5);
      vec3 forest = vec3(0.035, 0.1, 0.03), grass = vec3(0.1, 0.17, 0.05), sav = vec3(0.26, 0.23, 0.1);
      vec3 desert = vec3(0.60, 0.43, 0.23), rock = vec3(0.24, 0.20, 0.155), tundra = vec3(0.22, 0.21, 0.17);
      vec3 L = mix(forest, grass, smoothstep(0.35, 0.8, 1.0 - moist + alat * 0.4));
      L = mix(L, sav, smoothstep(0.35, 0.62, dry));
      L = mix(L, desert, smoothstep(0.58, 0.86, dry));
      L = mix(L, tundra, smoothstep(0.56, 0.7, alat));
      float hi = smoothstep(0.14, 0.34, elev) * smoothstep(0.62, 0.9, mtn);
      L = mix(L, rock, hi * 0.6);
      L *= 0.8 + 0.4 * (snoise(p * 48.0) * 0.5 + 0.5) * (0.7 + 0.3 * snoise(p * 150.0));
      float ice = smoothstep(0.8, 0.86, alat + 0.05 * snoise(p * 7.0) + 0.02 * snoise(p * 40.0));
      ice = max(ice, land * smoothstep(0.35, 0.5, elev + 0.25 * mtn - 0.1 + 0.4 * alat - 0.2) * 0.9);
      float deep = smoothstep(0.0, 0.22, -elev + 0.05 * fbm(p * 5.0 + 3.0, 4));
      vec3 ocean = mix(vec3(0.03, 0.12, 0.2), vec3(0.004, 0.022, 0.08), deep);
      ocean = mix(ocean, vec3(0.05, 0.2, 0.24), (1.0 - smoothstep(0.0, 0.025, -elev)) * 0.6);   // shallow shelves
      ocean *= 0.9 + 0.2 * snoise(p * 9.0);
      alb = mix(ocean, L, land);
      alb = mix(alb, vec3(0.78, 0.83, 0.88), ice);
      float relief = land * clamp(smoothstep(0.0, 0.3, elev) * 0.35 + smoothstep(0.35, 0.95, mtn) * smoothstep(0.02, 0.2, elev) * 0.65, 0.0, 1.0);
      float water = (1.0 - land) * (1.0 - ice);
      hgt = water > 0.5 ? 0.0 : 0.06 + 0.94 * max(relief, ice * 0.15);
    } else {
      // wispy, domain-warped decks: the ITCZ along the equator, cyclone swirls in the storm tracks,
      // clear subtropical belts; thin veils as well as thick cores
      vec3 cw = vec3(fbm(p * 1.4 + 2.0, 4), fbm(p * 1.4 + 7.0, 4), fbm(p * 1.4 + 13.0, 4));
      vec3 cp = normalize(p + 0.28 * cw);
      for (int i = 0; i < 6; i++){
        vec3 h = hash33(vec3(float(i) * 3.7, 1.3, 7.9));
        float cla = (h.x < 0.5 ? 1.0 : -1.0) * (36.0 + 24.0 * h.y);
        vec3 cc = dirLL(cla, h.z * 360.0);
        float R = 0.1 + 0.07 * fract(h.y * 7.0);
        float ang = (cla > 0.0 ? 1.0 : -1.0) * 4.5 * exp(-pow(adist(cp, cc) / R, 2.0));
        cp = cp * cos(ang) + cross(cc, cp) * sin(ang) + cc * dot(cc, cp) * (1.0 - cos(ang));   // Rodrigues
      }
      float base = fbm(cp * vec3(2.2, 4.2, 2.2) + 1.0, 8);
      float wisp = fbm(cp * vec3(5.0, 11.0, 5.0) + cw * 2.0, 6);
      float itcz = exp(-pow((lat - 6.0 + 5.0 * cw.x) / 5.0, 2.0));
      float storm = exp(-pow((alat - 0.55) / 0.14, 2.0));
      float subtrop = exp(-pow((alat - 0.26) / 0.08, 2.0));
      float cl = base * 0.8 + wisp * 0.4 + 0.02 + 0.3 * itcz + 0.16 * storm - 0.22 * subtrop;
      float cloud = smoothstep(0.02, 0.6, cl);
      cloud *= cloud * (0.65 + 0.35 * smoothstep(-0.1, 0.5, wisp + 0.2));
      cloud *= 0.9 + 0.1 * snoise(p * 80.0);
      alb = vec3(clamp(cloud, 0.0, 1.0)); hgt = 1.0;
    }
  } else if (uMode == 4) {
    // MARS: rust dust, dark basaltic albedo features, Tharsis volcanoes, Valles Marineris, Hellas, polar caps
    float m = fbm(p * 2.0 + 1.7, 7);
    vec3 dust = mix(vec3(0.52, 0.24, 0.11), vec3(0.72, 0.40, 0.2), m * 0.5 + 0.5);
    float dk = fbm(p * 1.7 + vec3(3.0, 1.0, 8.0), 6) + 0.25 * fbm(p * 7.0, 4);
    float band = smoothstep(-55.0, -25.0, lat) * (1.0 - smoothstep(20.0, 45.0, lat));
    float dark = smoothstep(-0.02, 0.26, dk * 0.9 + band * 0.22 - 0.12);
    dark = max(dark, blob(p, dirLL(10.0, 70.0), 0.22, 0.12) * 0.95);           // Syrtis Major
    dark = max(dark, blob(p, dirLL(47.0, -25.0), 0.28, 0.15) * 0.8);           // Acidalia Planitia
    dark = max(dark, blob(p, dirLL(-3.0, 0.0), 0.12, 0.08) * 0.85);            // Sinus Meridiani
    dark = max(dark, blob(p, dirLL(-25.0, -40.0), 0.25, 0.14) * 0.7);          // Mare Erythraeum
    float thar = blob(p, dirLL(2.0, -110.0), 0.45, 0.25);
    dark *= 1.0 - thar * 0.85;                                                 // Tharsis stays bright & dusty
    dark *= 0.62 + 0.38 * smoothstep(-0.35, 0.35, fbm(p * 11.0 + 5.0, 5));      // streaky, wind-blown edges
    vec3 basalt = mix(vec3(0.19, 0.11, 0.07), vec3(0.3, 0.17, 0.1), smoothstep(-0.3, 0.3, fbm(p * 6.0 + 2.0, 4)));
    float bright = max(max(blob(p, dirLL(20.0, 20.0), 0.35, 0.2), blob(p, dirLL(25.0, 147.0), 0.25, 0.15)), max(blob(p, dirLL(10.0, -160.0), 0.3, 0.2), thar));
    dust = mix(dust, vec3(0.8, 0.52, 0.3), bright * 0.6 * (0.7 + 0.3 * m));          // pale ochre deserts: Arabia, Elysium, Amazonis, Tharsis
    alb = mix(dust, basalt, dark * 0.9);
    // Hellas: a bright, deep impact basin
    float hel = adist(p, dirLL(-42.0, 70.0));
    alb = mix(alb, vec3(0.78, 0.55, 0.36), (1.0 - smoothstep(0.2, 0.3, hel)) * 0.7);
    // craters, mostly in the southern highlands
    float south = 1.0 - smoothstep(-10.0, 25.0, lat);
    vec2 c = craters(p, 4.0, 0.45, 11.0) * 0.8 * (0.35 + 0.65 * south) + craters(p, 9.0, 0.5, 12.0) * 0.45 * (0.3 + 0.7 * south) + craters(p, 22.0, 0.55, 13.0) * 0.2;
    float h = 0.2 * c.x - 0.5 * (1.0 - smoothstep(0.05, 0.3, hel));
    h += 0.35 * thar;
    // Olympus Mons: broad shield, summit caldera, scarp
    float om = adist(p, dirLL(18.0, -134.0));
    h += 1.3 * pow(max(0.0, 1.0 - om / 0.16), 1.4) - 0.35 * (1.0 - smoothstep(0.012, 0.022, om));
    alb = mix(alb, alb * 0.72, exp(-pow((om - 0.16) / 0.012, 2.0)) * 0.8);
    // Tharsis Montes and Alba Mons
    float tm = 0.0;
    tm += pow(max(0.0, 1.0 - adist(p, dirLL(12.0, -104.0)) / 0.08), 1.5);
    tm += pow(max(0.0, 1.0 - adist(p, dirLL(1.0, -112.0)) / 0.08), 1.5);
    tm += pow(max(0.0, 1.0 - adist(p, dirLL(-9.0, -120.0)) / 0.08), 1.5);
    h += 0.8 * tm;
    // Valles Marineris: a long canyon system east of Tharsis, with dark floor streaks
    float vm = arcDist(p, dirLL(-7.0, -95.0), dirLL(-12.0, -40.0)) + 0.012 * snoise(p * 30.0);
    float vm2 = arcDist(p, dirLL(-4.0, -92.0), dirLL(-8.0, -62.0)) + 0.01 * snoise(p * 31.0);
    float canyon = max(1.0 - smoothstep(0.008, 0.028, vm), (1.0 - smoothstep(0.004, 0.016, vm2)) * 0.8);
    h -= 0.9 * canyon;
    alb = mix(alb, vec3(0.28, 0.14, 0.08), canyon * 0.75);
    // polar caps: north larger, with dark spiral troughs; south smaller and offset
    float na = atan(p.z, -p.x);
    float capN = smoothstep(74.0, 78.0, lat + 3.0 * snoise(p * 9.0) + 1.5 * snoise(p * 30.0));
    float trough = 0.5 + 0.5 * sin(na * 1.0 + (90.0 - lat) * 0.9 + 2.0 * snoise(p * 12.0));
    capN *= mix(1.0, 0.55, smoothstep(0.75, 0.95, trough) * smoothstep(88.0, 80.0, lat));
    float sd = adist(p, dirLL(-87.0, -40.0));
    float capS = 1.0 - smoothstep(0.1, 0.13, sd + 0.02 * snoise(p * 11.0));
    float cap = max(capN, capS);
    alb = mix(alb, vec3(0.92, 0.9, 0.88), cap);
    alb *= 0.9 + 0.2 * (snoise(p * 70.0) * 0.5 + 0.5);
    hgt = clamp(0.5 + 0.18 * h + 0.03 * cap, 0.0, 1.0);
  } else if (uMode == 5 || uMode == 6) {
    // GAS GIANTS: zonal belts & zones with sheared turbulence (Jupiter adds the Great Red Spot)
    float lon = atan(p.z, -p.x);
    float la = lat, lo = lon;
    float grs = 0.0, grsR = 9.0, gdx = 0.0;
    if (uMode == 5) {
      // Great Red Spot vortex against the SEB's southern edge: swirl the coordinates around it
      float latc = -21.5, lonc = 1.2;
      float dl = atan(sin(lon - lonc), cos(lon - lonc)) * cos(radians(lat));
      vec2 d = vec2(degrees(dl) / 12.0, (lat - latc) / 6.0);
      gdx = d.x;
      grsR = length(d);
      float ang = 3.6 * exp(-grsR * grsR * 0.8);
      vec2 dr = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d;
      la = latc + dr.y * 6.0;
      lo = lonc + radians(dr.x * 12.0) / max(cos(radians(la)), 0.2);
      grs = 1.0 - smoothstep(0.85, 1.02, grsR);
    }
    vec3 pp = dirLL(la, degrees(lo));
    float wob = fbm(vec3(pp.x * 3.0, pp.y * 10.0, pp.z * 3.0) + 5.0, 6);
    float edd = fbm(vec3(pp.x * 9.0, pp.y * 30.0, pp.z * 9.0) + wob * 1.5, 5);
    float L = la + 1.6 * wob + 0.7 * edd;
    float tex = fbm(vec3(pp.x * 14.0, pp.y * 60.0, pp.z * 14.0) + vec3(wob * 3.0), 5);
    if (uMode == 5) {
      #define BELT(a, b, s) (smoothstep(a - s, a + s, L) * (1.0 - smoothstep(b - s, b + s, L)))
      #define EDGE(e, w) exp(-pow((la - e) / w, 2.0))
      // turbulence concentrates along the jets at band edges: vortex streets and shear eddies
      float edge = EDGE(7.0, 1.6) + EDGE(-7.0, 1.6) + EDGE(17.0, 1.6) + EDGE(-20.0, 1.6)
                 + 0.7 * (EDGE(24.0, 1.2) + EDGE(-26.0, 1.2) + EDGE(29.0, 1.2) + EDGE(-31.0, 1.2) + EDGE(35.0, 1.2) + EDGE(-36.0, 1.2));
      float vort = snoise(vec3(pp.x * 22.0, pp.y * 55.0, pp.z * 22.0) + wob * 2.0);
      float vort2 = snoise(vec3(pp.x * 48.0, pp.y * 90.0, pp.z * 48.0) + edd * 2.0);
      L += edge * (1.5 * vort + 0.6 * vort2);
      vec3 cream = vec3(0.90, 0.85, 0.74), ochre = vec3(0.80, 0.62, 0.40), tanc = vec3(0.66, 0.50, 0.35);
      vec3 brown = vec3(0.48, 0.30, 0.18), rbrown = vec3(0.50, 0.26, 0.14), greyb = vec3(0.46, 0.47, 0.50);
      alb = cream;
      alb = mix(alb, mix(ochre, cream, 0.5), BELT(-7.0, 7.0, 1.5) * 0.8);          // equatorial zone
      alb = mix(alb, ochre * 0.95, BELT(-1.8, 1.8, 1.0) * 0.45);                   // faint equatorial band
      alb = mix(alb, rbrown, BELT(7.0, 17.0, 1.0));                                // NEB
      alb = mix(alb, mix(rbrown, ochre, 0.4), BELT(10.5, 13.0, 1.0) * 0.4);
      alb = mix(alb, brown * 1.05, BELT(-20.0, -7.0, 1.0));                        // SEB
      alb = mix(alb, mix(brown, ochre, 0.6), BELT(-16.0, -11.0, 1.2) * 0.6);       // SEB's lighter middle
      alb = mix(alb, cream * 1.04, BELT(-26.0, -20.0, 1.0) * 0.6);                 // bright STrZ
      alb = mix(alb, tanc, BELT(24.0, 29.0, 0.8));                                 // NTB
      alb = mix(alb, rbrown * 0.9, BELT(23.0, 24.6, 0.4) * 0.8);                   // NTBs jet
      alb = mix(alb, tanc * 1.03, BELT(-31.0, -26.0, 0.8) * 0.9);                  // STB
      alb = mix(alb, mix(tanc, greyb, 0.3), BELT(35.0, 39.0, 0.8) * 0.8);          // NNTB
      alb = mix(alb, mix(tanc, greyb, 0.3), BELT(-40.0, -36.0, 0.8) * 0.75);       // SSTB
      alb = mix(alb, mix(tanc, greyb, 0.5), BELT(43.0, 46.0, 0.7) * 0.6);
      alb = mix(alb, mix(tanc, greyb, 0.5), BELT(-47.0, -44.0, 0.7) * 0.55);
      // grey-blue polar regions, finely banded and mottled
      float pol = smoothstep(48.0, 62.0, abs(L));
      vec3 pc = greyb * (0.9 + 0.1 * sin(L * 1.7 + wob * 4.0)) * (0.88 + 0.24 * (fbm(pp * 12.0, 4) * 0.5 + 0.5));
      alb = mix(alb, pc, pol);
      alb *= 0.95 + 0.05 * sin(L * 2.6 + 1.3) + 0.03 * sin(L * 5.3);               // many narrow jets
      // festoons: slanted blue-grey plumes from the NEB's southern edge into the equatorial zone
      float fs = sin(lo * 11.0 + (la - 7.0) * 0.28 + 1.5 * snoise(pp * 6.0));
      float fest = smoothstep(0.5, 0.95, fs) * exp(-pow((la - 4.0) / 3.0, 2.0)) * (0.6 + 0.4 * smoothstep(-0.3, 0.3, edd));
      alb = mix(alb, vec3(0.34, 0.36, 0.40), fest * 0.5);
      alb = mix(alb, vec3(0.28, 0.24, 0.24), smoothstep(0.8, 0.98, fs) * EDGE(7.2, 0.9) * 0.8);   // dark hot spots
      // small white ovals (temperate & polar belts) and dark brown barges in the NEB
      for (int i = 0; i < 20; i++){
        vec3 h = hash33(vec3(float(i), 4.2, 9.1));
        float olat = i < 6 ? -41.0 + h.x * 3.0 : (i < 10 ? -33.5 + h.x * 2.0 : (i < 14 ? 40.5 + h.x * 3.0 : (i < 17 ? -52.0 + h.x * 6.0 : 14.5 + h.x)));
        float olon = h.y * 6.2832;
        float a = i < 10 ? 0.022 + 0.02 * h.z : 0.012 + 0.012 * h.z;
        float odl = atan(sin(lo - olon), cos(lo - olon)) * cos(radians(la));
        float r = length(vec2(odl / a, radians(la - olat) / (a * 0.62)));
        vec3 oc = i < 17 ? vec3(0.95, 0.93, 0.88) : vec3(0.36, 0.2, 0.12);
        alb = mix(alb, alb * 0.8, exp(-pow((r - 1.05) / 0.18, 2.0)) * 0.6);
        alb = mix(alb, oc, (1.0 - smoothstep(0.75, 1.0, r)) * 0.9);
      }
      alb *= 0.87 + 0.26 * (tex * 0.5 + 0.5);
      // the Great Red Spot: pale hollow cut into the SEB, a turbulent wake trailing west of it
      float wake = smoothstep(1.1, 1.9, gdx) * (1.0 - smoothstep(3.5, 8.0, gdx)) * exp(-pow((lat + 15.5) / 4.0, 2.0));
      float wt = fbm(vec3(pp.x * 26.0, pp.y * 60.0, pp.z * 26.0) + edd * 3.0, 5);
      alb = mix(alb, mix(vec3(0.38, 0.23, 0.14), vec3(0.95, 0.91, 0.82), smoothstep(-0.25, 0.25, wt)), wake * 0.75);
      alb = mix(alb, vec3(0.93, 0.89, 0.79), exp(-pow((grsR - 1.2) / 0.22, 2.0)) * 0.85);
      vec3 red = mix(vec3(0.72, 0.29, 0.16), vec3(0.84, 0.47, 0.3), smoothstep(0.15, 0.55, grsR) * (1.0 - smoothstep(0.7, 0.95, grsR)) + 0.25 * tex);
      alb = mix(alb, red, grs);
    } else {
      // SATURN: warm pale gold, soft low-contrast banding, bluish north pole with the hexagon
      float bandsF = sin(L * 0.55) * 0.5 + sin(L * 1.3 + 1.0) * 0.3 + sin(L * 2.9 + 2.0) * 0.2;
      alb = mix(vec3(0.84, 0.70, 0.46), vec3(0.93, 0.83, 0.60), 0.5 + 0.35 * bandsF);
      alb = mix(alb, vec3(0.96, 0.88, 0.68), exp(-pow(L / 9.0, 2.0)) * 0.6);                // bright equatorial zone
      alb = mix(alb, vec3(0.76, 0.62, 0.40), exp(-pow((abs(L) - 22.0) / 5.0, 2.0)) * 0.4);  // temperate belts
      alb *= 0.95 + 0.08 * (tex * 0.5 + 0.5);
      float a = atan(p.z, -p.x);
      float hexr = cos(PI / 6.0) / cos(mod(a + 0.3, PI / 3.0) - PI / 6.0);
      float r = (90.0 - lat) / 14.0;
      float inHex = 1.0 - smoothstep(hexr - 0.06, hexr + 0.06, r);
      alb = mix(alb, vec3(0.58, 0.62, 0.62), inHex * 0.8 * step(0.0, lat));
      alb = mix(alb, vec3(0.5, 0.44, 0.36), exp(-pow((r - hexr) / 0.05, 2.0)) * 0.5 * step(0.0, lat));
      alb = mix(alb, vec3(0.66, 0.6, 0.5), smoothstep(-60.0, -80.0, lat) * 0.5);
    }
    hgt = 0.5;
  } else if (uMode == 7) {
    // URANUS: pale cyan methane haze: very subtle banding, brighter polar hoods (south the brighter)
    float b = fbm(vec3(p.x * 1.2, p.y * 10.0, p.z * 1.2) + 2.0, 5);
    float bands = sin(lat * 0.22 + b * 0.9) * 0.5 + 0.5;
    alb = mix(vec3(0.42, 0.75, 0.81), vec3(0.50, 0.83, 0.87), bands * 0.55 + 0.25 + 0.2 * b);
    alb = mix(alb, vec3(0.64, 0.89, 0.91), smoothstep(40.0, 72.0, -lat) * 0.6 + smoothstep(50.0, 78.0, lat) * 0.35);
    alb = mix(alb, alb * 0.93, exp(-pow((abs(lat) - 38.0) / 5.0, 2.0)) * 0.6);   // faint darker collar
    alb = mix(alb, vec3(0.86, 0.96, 0.97), (1.0 - smoothstep(0.015, 0.04, adist(p, dirLL(28.0, 60.0)))) * 0.35);
    hgt = 0.5;
  } else if (uMode == 8) {
    // NEPTUNE: deep azure with soft, irregular banding, the Great Dark Spot and its bright companion
    // clouds, thin methane-ice cirrus streaks
    float wob = fbm(vec3(p.x * 2.0, p.y * 6.0, p.z * 2.0) + 7.0, 6);
    float L = lat + 7.0 * wob;
    float soft = fbm(vec3(p.x * 1.5, p.y * 4.0, p.z * 1.5) + 3.0, 5);
    alb = mix(vec3(0.03, 0.15, 0.6), vec3(0.07, 0.27, 0.76), smoothstep(-0.6, 0.6, soft * 1.3 + 0.35 * sin(L * 0.12)));
    alb = mix(alb, vec3(0.02, 0.09, 0.42), exp(-pow((L + 58.0) / 9.0, 2.0)) * 0.65);
    alb = mix(alb, vec3(0.1, 0.32, 0.8), smoothstep(62.0, 80.0, -L) * 0.45);
    float lon = atan(p.z, -p.x);
    float dl = atan(sin(lon - 2.2), cos(lon - 2.2)) * cos(radians(lat));
    float gd = length(vec2(degrees(dl) / 15.0, (lat + 20.0) / 7.5));
    alb = mix(alb, vec3(0.015, 0.05, 0.28), 1.0 - smoothstep(0.7, 1.0, gd + 0.12 * wob));
    float streak = smoothstep(0.5, 0.85, fbm(vec3(p.x * 4.0, p.y * 70.0, p.z * 4.0) + vec3(wob * 2.0) + 11.0, 5));
    float cir = streak * (exp(-pow((L + 42.0) / 5.0, 2.0)) + exp(-pow((L - 27.0) / 6.0, 2.0)) * 0.8 + exp(-pow((L + 70.0) / 4.0, 2.0)) * 0.5 + exp(-pow((L - 45.0) / 4.0, 2.0)) * 0.4);
    float comp = exp(-pow((gd - 1.2) / 0.22, 2.0)) * smoothstep(-19.0, -24.0, lat) * (0.6 + 0.6 * wob);
    comp += exp(-pow(length(vec2(degrees(dl) / 9.0 - 1.9, (lat + 16.0) / 2.5)), 2.0)) * 0.8;   // bright streak trailing east
    alb = mix(alb, vec3(0.88, 0.93, 1.0), clamp(cir * 0.85 + comp, 0.0, 0.9));
    hgt = 0.5;
  } else {
    // MOON: bright cratered highlands, dark maria on the near side (−x, facing Earth), rayed Tycho
    float m = fbm(p * 2.5 + 8.0, 6);
    alb = mix(vec3(0.36, 0.355, 0.34), vec3(0.52, 0.51, 0.49), m * 0.5 + 0.5);
    float n = fbm(p * 3.0 + 1.0, 6) * 0.1 + fbm(p * 9.0 + 4.0, 4) * 0.03;
    float mare = 0.0;
    mare = max(mare, blob(p, dirLL(33.0, -16.0), 0.3 + n, 0.035));        // Imbrium
    mare = max(mare, blob(p, dirLL(28.0, 17.0), 0.16 + n, 0.03));         // Serenitatis
    mare = max(mare, blob(p, dirLL(8.0, 31.0), 0.19 + n, 0.035));         // Tranquillitatis
    mare = max(mare, blob(p, dirLL(17.0, 59.0), 0.09 + n * 0.5, 0.02));   // Crisium
    mare = max(mare, blob(p, dirLL(15.0, -55.0), 0.4 + n * 1.5, 0.1) * 0.85);   // Procellarum
    mare = max(mare, blob(p, dirLL(-21.0, -17.0), 0.13 + n, 0.04) * 0.9); // Nubium
    mare = max(mare, blob(p, dirLL(-8.0, 51.0), 0.13 + n, 0.04) * 0.9);   // Fecunditatis
    mare = max(mare, blob(p, dirLL(-24.0, -39.0), 0.1 + n, 0.03));        // Humorum
    mare = max(mare, blob(p, dirLL(-2.0, 15.0), 0.08 + n, 0.04) * 0.7);   // Sinus Medii / Vaporum
    mare = max(mare, blob(p, dirLL(27.0, 148.0), 0.05 + n * 0.4, 0.025) * 0.6);      // far side: Moscoviense
    mare = max(mare, blob(p, dirLL(-21.0, 129.0), 0.022, 0.01) * 0.55);             // Tsiolkovskiy's dark floor
    mare = max(mare, blob(p, dirLL(-19.0, -93.0), 0.06, 0.02) * 0.8);        // Orientale
    mare *= 0.8 + 0.2 * smoothstep(-0.3, 0.3, fbm(p * 6.0 + 2.0, 4));
    alb *= 1.0 - 0.18 * blob(p, dirLL(-53.0, -169.0), 0.6 + n, 0.25);        // South Pole–Aitken basin
    alb = mix(alb, alb * 0.8, exp(-pow((adist(p, dirLL(-19.0, -93.0)) - 0.1) / 0.012, 2.0)) * 0.7);   // Orientale's ring
    vec3 basalt = mix(vec3(0.085, 0.085, 0.09), vec3(0.14, 0.137, 0.135), smoothstep(-0.4, 0.4, fbm(p * 5.0 + 7.0, 5)));
    alb = mix(alb, basalt, mare);
    vec2 c = craters(p, 4.0, 0.5, 21.0) * (1.0 - mare * 0.8) + craters(p, 9.0, 0.6, 22.0) * 0.55 * (1.0 - mare * 0.6) + craters(p, 20.0, 0.65, 23.0) * 0.3 + craters(p, 44.0, 0.7, 24.0) * 0.14;
    float ry = rays(p, dirLL(-43.0, -11.0), 0.04, 5.0) + rays(p, dirLL(10.0, -20.0), 0.03, 6.0) * 0.6 + rays(p, dirLL(8.0, -38.0), 0.025, 7.0) * 0.5;
    alb *= 1.0 + 0.3 * c.y;
    alb = mix(alb, vec3(0.7, 0.69, 0.66), clamp(ry * 0.45, 0.0, 0.6));
    alb *= 0.9 + 0.2 * (snoise(p * 80.0) * 0.5 + 0.5);
    hgt = 0.5 + 0.22 * c.x - 0.04 * mare;
  }
  gl_FragColor = vec4(sqrt(clamp(alb, 0.0, 1.0)), clamp(hgt, 0.0, 1.0));
}`;

const SIZES = { mercury: 1024, venus: 1024, earth: 2048, earthClouds: 2048, mars: 2048, jupiter: 2048, saturn: 1024, uranus: 256, neptune: 512, moon: 1024 };

export function bakePlanetMaps(renderer) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMode: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: bakeFrag, depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(mat);
  const prev = renderer.getRenderTarget();
  const maps = {};
  for (const [k, mode] of Object.entries(BAKE_MODES)) {
    const w = SIZES[k];
    const rt = new THREE.WebGLRenderTarget(w, w / 2, {
      type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
    });
    rt.texture.anisotropy = 8;
    mat.uniforms.uMode.value = mode;
    renderer.setRenderTarget(rt);
    quad.render(renderer);
    maps[k] = rt.texture;
  }
  renderer.setRenderTarget(prev);
  quad.dispose(); mat.dispose();
  return maps;
}

// ---------------------------------------------------------------------------------------------
// Ring maps (1D, radius → sqrt(colour), opacity). Radii in planet radii.
export const SATURN_RING = { inner: 1.11, outer: 2.34 };
export const URANUS_RING = { inner: 1.62, outer: 2.03 };
function ringTexture(n, fn) {
  const d = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = fn((i + 0.5) / n);
    d[i * 4] = Math.round(Math.sqrt(Math.min(1, r)) * 255); d[i * 4 + 1] = Math.round(Math.sqrt(Math.min(1, g)) * 255);
    d[i * 4 + 2] = Math.round(Math.sqrt(Math.min(1, b)) * 255); d[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
  }
  const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}
const hashN = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hashN(i) * (1 - u) + hashN(i + 1) * u; };
const sstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function saturnRingTexture() {
  const { inner, outer } = SATURN_RING;
  return ringTexture(4096, (u) => {
    const r = inner + u * (outer - inner);
    const ringlets = 0.62 + 0.16 * vnoise(r * 160) + 0.12 * vnoise(r * 480) + 0.1 * vnoise(r * 1400) + 0.06 * Math.sin(r * 2600) ** 2;
    let a = 0, col = [0.8, 0.7, 0.55];
    if (r < 1.236) { a = 0.03 * sstep(1.11, 1.2, r); col = [0.5, 0.45, 0.4]; }                                  // D ring
    else if (r < 1.527) { a = (0.09 + 0.1 * sstep(1.3, 1.52, r)) * (0.7 + 0.6 * vnoise(r * 260)); col = [0.55, 0.5, 0.44]; }   // C ring
    else if (r < 1.951) {                                                                                        // B ring
      const k = sstep(1.527, 1.6, r);
      a = (0.55 + 0.4 * k) * (0.85 + 0.15 * vnoise(r * 300)); col = [0.88, 0.78, 0.6].map((c) => c * (0.9 + 0.12 * sstep(1.6, 1.8, r)));
    } else if (r < 2.027) { a = 0.08 + 0.06 * Math.exp(-((r - 1.99) ** 2) / 0.0002); col = [0.5, 0.45, 0.4]; }   // Cassini Division
    else if (r < 2.269) {                                                                                        // A ring (Encke gap)
      a = 0.55 * (0.9 + 0.1 * vnoise(r * 400)) * (1 - 0.95 * Math.exp(-((r - 2.214) ** 2) / 0.000012)) * (1 - 0.8 * Math.exp(-((r - 2.265) ** 2) / 0.000003));
      col = [0.78, 0.7, 0.58];
    } else if (Math.abs(r - 2.326) < 0.006) { a = 0.35 * (1 - Math.abs(r - 2.326) / 0.006); col = [0.8, 0.75, 0.68]; }   // F ring
    a *= r < 2.29 ? ringlets : 1;
    return [...col, a];
  });
}
export function uranusRingTexture() {
  const { inner, outer } = URANUS_RING;
  // rings 6, 5, 4, α, β, η, γ, δ, λ, ε (NASA radii in km ÷ 25,559 km); ε is the widest and brightest
  const rings = [[1.637, 0.0015], [1.652, 0.0015], [1.666, 0.0015], [1.750, 0.002], [1.786, 0.002], [1.846, 0.0015], [1.863, 0.0025], [1.890, 0.003], [1.957, 0.0015], [2.001, 0.009]];
  return ringTexture(1024, (u) => {
    const r = inner + u * (outer - inner);
    let a = 0.006;
    for (const [c, w] of rings) a += Math.exp(-((r - c) ** 2) / (w * w * 0.3)) * (c > 1.99 ? 0.85 : 0.5);
    return [0.3, 0.3, 0.31, a];
  });
}

// ---------------------------------------------------------------------------------------------
// Shared per-frame uniforms (one object for every body: update once per frame).
export function planetUniforms(sunPos, keyDir) {
  return {
    uSunPos: { value: sunPos.clone() }, uSunI: { value: 1.35 }, uSunCol: { value: new THREE.Color(1.0, 0.9, 0.76) },
    uKeyDir: { value: keyDir.clone().normalize() }, uKeyCol: { value: new THREE.Color(0.32, 0.27, 0.21) },
    uAmb: { value: new THREE.Color(0.014, 0.012, 0.011) }, uTime: { value: 0 },
  };
}

const planetVert = /* glsl */ `
uniform vec3 uSunPos, uKeyDir;
varying vec2 vUv; varying vec3 vO; varying vec3 vLo; varying vec3 vVo; varying vec3 vKo;
#include <fog_pars_vertex>
void main(){
  vUv = uv; vO = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  mat3 toObj = transpose(mat3(modelMatrix));      // rotation × uniform scale: transpose ∝ inverse
  vLo = toObj * normalize(uSunPos - w.xyz);
  vVo = toObj * normalize(cameraPosition - w.xyz);
  vKo = toObj * uKeyDir;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const planetFrag = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D uMap, uCloud, uRingTex;
uniform vec3 uSunCol, uKeyCol, uAmb, uAtm;
uniform vec2 uTexel;
uniform float uSunI, uTime, uBump, uRocky, uOcean, uCloudK, uCloudOff, uAtmK, uLimb, uGloss, uFlow, uRingIn, uRingOut, uRingK, uBright;
varying vec2 vUv; varying vec3 vO; varying vec3 vLo; varying vec3 vVo; varying vec3 vKo;
#include <fog_pars_fragment>
void main(){
  vec3 n = normalize(vO);
  vec3 L = normalize(vLo), V = normalize(vVo), K = normalize(vKo);
  vec2 uv = vUv;
  if (uFlow > 0.0) {
    // zonal winds: bands slide past each other at latitude-dependent speeds, eddies churn slowly
    uv.x += uFlow * (sin(uv.y * 41.0) * 0.6 + sin(uv.y * 97.0 + 1.3) * 0.4) * uTime * 0.0035;
    uv += uFlow * vec2(0.0016, 0.0008) * vec2(snoise(n * 7.0 + vec3(0.0, uTime * 0.12, 0.0)), snoise(n * 7.0 + vec3(3.1, 0.0, uTime * 0.12)));
  }
  vec4 tx = texture2D(uMap, uv);
  vec3 alb = tx.rgb * tx.rgb;
  float sinT = max(length(n.xz), 0.03);
  vec3 east = vec3(n.z, 0.0, -n.x) / sinT;
  vec3 north = cross(n, east);
  vec3 nb = n;
  if (uBump > 0.0) {
    float hx = texture2D(uMap, uv + vec2(uTexel.x, 0.0)).a - texture2D(uMap, uv - vec2(uTexel.x, 0.0)).a;
    float hy = texture2D(uMap, uv + vec2(0.0, uTexel.y)).a - texture2D(uMap, uv - vec2(0.0, uTexel.y)).a;
    nb = normalize(n - uBump * (hx / sinT * east + hy * north));
  }
  float ndl0 = dot(n, L);
  float ndl = dot(nb, L);
  float mu = max(dot(n, V), 0.0);
  float lamb = max(ndl, 0.0) * smoothstep(-0.02, 0.06, ndl0);
  // airless regolith: Lommel–Seeliger flattens the disc and sharpens the terminator
  float ls = 2.0 * lamb / (lamb + max(dot(nb, V), 0.05));
  float diff = mix(lamb, min(ls, 1.6) * 0.75, uRocky);
  // Saturn / Uranus: the rings' shadow across the globe
  float sh = 1.0;
  if (uRingK > 0.0 && abs(L.y) > 1e-3) {
    float s = -n.y / L.y;
    if (s > 0.0) {
      vec3 hp = n + L * s; float r = length(hp.xz);
      float u = (r - uRingIn) / (uRingOut - uRingIn);
      if (u > 0.0 && u < 1.0) sh = 1.0 - uRingK * texture2D(uRingTex, vec2(u, 0.5)).a;
    }
  }
  vec3 sunE = uSunCol * uSunI * sh;
  vec3 keyE = uKeyCol * max(dot(nb, K), 0.0);
  // Earth: drifting cloud deck (with its shadow on the ground)
  float cl = 0.0, csh = 0.0;
  if (uCloudK > 0.0) {
    vec2 cuv = vUv + vec2(uCloudOff, 0.0);
    cl = texture2D(uCloud, cuv).r * uCloudK * 0.9;
    float lo = 0.01 / max(ndl0, 0.15);
    vec2 so = vec2(dot(L, east) / (6.2832 * sinT), dot(L, north) / 3.1416) * lo;
    csh = texture2D(uCloud, cuv + so).r * uCloudK;
  }
  vec3 col = alb * (sunE * diff * (1.0 - 0.45 * csh * (1.0 - cl)) + keyE + uAmb);
  // ocean glint (water is height 0 in Earth's map)
  if (uOcean > 0.0) {
    float water = 1.0 - smoothstep(0.01, 0.04, tx.a);
    vec3 H = normalize(L + V);
    float nh = max(dot(n, H), 0.0);
    float F = 0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float spec = (pow(nh, 400.0) * 2.0 + pow(nh, 40.0) * 0.05) * F * 4.0;
    col += sunE * spec * water * (1.0 - cl) * (1.0 - 0.6 * csh) * smoothstep(0.0, 0.1, ndl0) * uOcean;
  }
  if (uCloudK > 0.0) {
    float cdiff = smoothstep(-0.1, 1.0, ndl0);
    vec3 cc = vec3(0.74, 0.76, 0.8) * (sunE * cdiff + uKeyCol * max(dot(n, K), 0.0) + uAmb) * (0.85 + 0.15 * cl);
    col = mix(col, cc, cl);
  }
  // limb darkening of the deep atmospheres
  col *= 1.0 - uLimb * (1.0 - pow(mu, 0.45));
  // atmosphere seen edge-on: a thin sunlit haze towards the limb
  float day = smoothstep(-0.18, 0.35, ndl0);
  float rim = pow(1.0 - mu, 3.0);
  col = col * (1.0 - 0.5 * uAtmK * rim * day) + uAtm * uSunI * (0.03 + rim) * day * uAtmK;
  // varnish on the enamelled sphere: a faint, tight sheen from the room's key light
  vec3 Hk = normalize(K + V);
  col += uKeyCol * pow(max(dot(n, Hk), 0.0), 90.0) * uGloss * 6.0;
  col += uSunCol * uSunI * pow(max(dot(n, normalize(L + V)), 0.0), 120.0) * uGloss * sh * smoothstep(0.0, 0.1, ndl0);
  gl_FragColor = vec4(col * uBright, 1.0);
  #include <fog_fragment>
}`;

// per-body look (planet radius-independent: geometry is a unit sphere scaled by the body size)
const LOOK = {
  mercury: { bump: 3.6, rocky: 1, gloss: 0.02 },
  venus: { rocky: 0.3, atm: [1.0, 0.85, 0.55], atmK: 0.3, limb: 0.3, gloss: 0.03, bright: 0.72 },
  earth: { bump: 1.2, ocean: 1, atm: [0.3, 0.55, 1.0], atmK: 0.7, gloss: 0.02, clouds: true },
  mars: { bump: 1.6, rocky: 0.35, atm: [0.95, 0.68, 0.48], atmK: 0.32, gloss: 0.02 },
  jupiter: { flow: 1, rocky: 0.4, limb: 0.4, atm: [0.9, 0.82, 0.7], atmK: 0.2, gloss: 0.03, bright: 0.85 },
  saturn: { flow: 0.6, rocky: 0.4, limb: 0.4, atm: [0.95, 0.85, 0.62], atmK: 0.2, gloss: 0.03, bright: 0.82 },
  uranus: { flow: 0.2, rocky: 0.3, limb: 0.5, atm: [0.5, 0.9, 1.0], atmK: 0.3, gloss: 0.03, bright: 0.72 },
  neptune: { flow: 0.4, rocky: 0.3, limb: 0.35, atm: [0.35, 0.55, 1.0], atmK: 0.4, gloss: 0.03 },
  moon: { bump: 3.2, rocky: 1, gloss: 0.015 },
};

export function planetMaterial(kind, maps, shared, { ringTex = null, ring = null, ringK = 0 } = {}) {
  const o = LOOK[kind];
  const map = maps[kind];
  const W = map.image.width, H = map.image.height;
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...shared,
      uMap: { value: map }, uCloud: { value: o.clouds ? maps.earthClouds : map }, uRingTex: { value: ringTex ?? map },
      uTexel: { value: new THREE.Vector2(1.5 / W, 1.5 / H) },
      uAtm: { value: new THREE.Color(...(o.atm ?? [0, 0, 0])) },
      uBump: { value: (o.bump ?? 0) * W / 2048 }, uRocky: { value: o.rocky ?? 0 }, uOcean: { value: o.ocean ?? 0 },
      uCloudK: { value: o.clouds ? 1 : 0 }, uCloudOff: { value: 0 }, uAtmK: { value: o.atmK ?? 0 }, uLimb: { value: o.limb ?? 0 },
      uGloss: { value: o.gloss ?? 0 }, uFlow: { value: o.flow ?? 0 }, uBright: { value: o.bright ?? 1 },
      uRingIn: { value: ring?.inner ?? 1 }, uRingOut: { value: ring?.outer ?? 2 }, uRingK: { value: ringK },
    },
    vertexShader: planetVert, fragmentShader: planetFrag, fog: true,
  });
  return m;
}

// Thin limb glow on a back-face shell around the body (Earth, Venus): the view ray's closest
// approach to the centre gives an optical depth; only the sunlit side glows.
const atmoVert = /* glsl */ `
uniform float uRk;
varying vec3 vW; varying vec3 vC; varying float vR;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vC = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vR = length(modelMatrix[0].xyz) * uRk;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const atmoFrag = /* glsl */ `
uniform vec3 uSunPos, uAtm; uniform float uSunI, uHs, uK;
varying vec3 vW; varying vec3 vC; varying float vR;
void main(){
  vec3 dir = normalize(vW - cameraPosition);
  vec3 oc = vC - cameraPosition;
  float b = dot(oc, dir);
  vec3 Pc = cameraPosition + dir * b;
  float h = length(Pc - vC);
  float x = (h - vR) / (vR * uHs);
  float g = x > 0.0 ? exp(-x) : 1.0;
  vec3 nc = (Pc - vC) / max(h, 1e-5);
  vec3 Ls = normalize(uSunPos - vC);
  float lit = smoothstep(-0.25, 0.35, dot(nc, Ls));
  // forward scattering: backlit by the sun, the limb becomes a thin bright ring
  float fwd = pow(max(dot(dir, Ls), 0.0), 6.0) * 1.5;
  gl_FragColor = vec4(uAtm * uSunI * g * (lit + fwd) * uK, 1.0);
}`;
export function atmosphereShell(color, shared, { k = 0.6, hs = 0.025, scale = 1.08 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uSunPos: shared.uSunPos, uSunI: shared.uSunI, uAtm: { value: new THREE.Color(...color) }, uHs: { value: hs }, uK: { value: k }, uRk: { value: 1 / scale } },
    vertexShader: atmoVert, fragmentShader: atmoFrag,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return { material: m, scale };
}

// Ring system (geometry in the planet's equatorial XZ plane, in planet radii): lit face vs. the
// forward-scattered glow of the unlit face, and the globe's shadow falling across the rings.
const ringVert = /* glsl */ `
uniform vec3 uSunPos;
varying vec3 vO; varying vec3 vLo; varying vec3 vVo;
#include <fog_pars_vertex>
void main(){
  vO = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  mat3 toObj = transpose(mat3(modelMatrix));
  vLo = toObj * normalize(uSunPos - w.xyz);
  vVo = toObj * normalize(cameraPosition - w.xyz);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const ringFrag = /* glsl */ `
uniform sampler2D uRingTex; uniform float uIn, uOut, uSunI, uK, uGlowK; uniform vec3 uSunCol, uKeyCol, uAmb;
varying vec3 vO; varying vec3 vLo; varying vec3 vVo;
#include <fog_pars_fragment>
void main(){
  float r = length(vO.xz);
  float u = (r - uIn) / (uOut - uIn);
  if (u < 0.0 || u > 1.0) discard;
  vec4 t = texture2D(uRingTex, vec2(u, 0.5));
  float a = t.a * uK;
  if (a < 0.002) discard;
  vec3 c = t.rgb * t.rgb;
  vec3 L = normalize(vLo), V = normalize(vVo);
  // the planet's shadow: does the ray toward the sun cross the unit globe?
  float s = -dot(vO, L);
  float d = length(vO + L * max(s, 0.0));
  float shadow = s > 0.0 ? smoothstep(0.97, 1.03, d) : 1.0;
  float sameSide = step(0.0, L.y * V.y);
  float refl = 0.3 + 0.7 * sqrt(abs(L.y));
  float fwd = (1.0 - t.a) * 2.2 * uGlowK;
  float lit = mix(fwd, refl, sameSide);
  vec3 col = c * (uSunCol * uSunI * lit * shadow + uKeyCol * 0.8 + uAmb);
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`;
export function ringMesh(tex, spec, shared, { k = 1, glow = 1, segs = 256 } = {}) {
  const g = new THREE.RingGeometry(spec.inner, spec.outer, segs, 3);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uRingTex: { value: tex }, uIn: { value: spec.inner }, uOut: { value: spec.outer }, uK: { value: k }, uGlowK: { value: glow },
      uSunPos: shared.uSunPos, uSunI: shared.uSunI, uSunCol: shared.uSunCol, uKeyCol: shared.uKeyCol, uAmb: shared.uAmb,
    },
    vertexShader: ringVert, fragmentShader: ringFrag, fog: true,
    side: THREE.DoubleSide, transparent: true, depthWrite: false,
  });
  return new THREE.Mesh(g, m);
}

// ---------------------------------------------------------------------------------------------
// The Sun: animated granulation cells, supergranular mottling, sunspot groups in the activity
// belts with faculae, and photospheric limb darkening/reddening. uI keeps the old brightness role.
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uI: { value: 5 }, uT: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vO;
      void main(){ vO = normalize(position); vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      ${GLSL_NOISE}
      uniform float uI, uT; varying vec3 vN; varying vec3 vV; varying vec3 vO;
      vec3 hash33(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453123); }
      vec2 worley(vec3 q, float t){
        vec3 id = floor(q), f = q - id; float f1 = 9.0, f2 = 9.0;
        for (int k = 0; k < 27; k++){
          vec3 o = vec3(float(k % 3) - 1.0, float((k / 3) % 3) - 1.0, float(k / 9) - 1.0);
          vec3 h = hash33(id + o);
          vec3 c = o + 0.5 + 0.38 * sin(t * (0.6 + h.yzx) + 6.2831 * h);   // cells slowly boil
          float d = length(f - c);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
        }
        return vec2(f1, f2);
      }
      void main(){
        vec3 n = normalize(vO);
        float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
        vec3 wp = n + 0.04 * vec3(snoise(n * 9.0 + uT * 0.05), snoise(n * 9.0 + 5.0), snoise(n * 9.0 - uT * 0.05));
        // granulation, faded toward its mean where the cells shrink below a few pixels (no sparkle)
        vec3 gq = wp * 24.0;
        float cpp = length(fwidth(gq));
        vec2 F = worley(gq, uT * 0.7);
        float lane = smoothstep(0.0, 0.34 + cpp, F.y - F.x);             // dark intergranular lanes
        float gran = mix(0.7, 1.06, lane) * (1.05 - 0.22 * F.x);
        gran = mix(0.93, gran, 1.0 - smoothstep(0.25, 0.7, cpp));
        float mott = 0.5 * snoise(n * 5.0 + vec3(0.0, uT * 0.04, 0.0)) + 0.3 * snoise(n * 12.0 - uT * 0.06) + 0.2 * snoise(n * 26.0 + uT * 0.1);
        // sunspot groups in the two activity belts, with penumbrae and bright faculae around them
        float spot = 1.0, fac = 0.0;
        for (int i = 0; i < 6; i++){
          vec3 h = hash33(vec3(float(i) * 7.1, 3.3, 1.7));
          float la = (h.x < 0.5 ? 1.0 : -1.0) * (0.2 + 0.25 * h.y);
          float lo = h.z * 6.2831;
          vec3 c = vec3(-cos(lo) * cos(la), sin(la), sin(lo) * cos(la));
          float r = 0.035 + 0.04 * fract(h.x * 13.0);
          float d = acos(clamp(dot(n, c), -1.0, 1.0)) + 0.008 * snoise(n * 60.0 + float(i));
          float pen = 1.0 - smoothstep(r * 0.85, r * 1.05, d);
          float umb = 1.0 - smoothstep(r * 0.38, r * 0.5, d);
          spot *= mix(1.0, 0.5, pen) * mix(1.0, 0.35, umb);
          fac += exp(-pow((d - r * 1.6) / (r * 0.9), 2.0)) * (0.6 + 0.4 * snoise(n * 40.0 + float(i)));
        }
        float x = 1.0 - mu;
        float ld = 1.0 - 0.52 * x - 0.26 * x * x;                    // photospheric limb darkening
        vec3 c = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.58, 0.22), pow(mu, 0.5));
        float I = ld * gran * (1.0 + 0.22 * mott) * spot * (1.0 + fac * 0.35 * x);
        gl_FragColor = vec4(c * uI * I * 0.9, 1.0);
      }`,
  });
}
