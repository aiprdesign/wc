// Post-processing shaders: depth of field, scene transitions, and the final
// "film" grade (ACES, era colour temperature, chromatic aberration, vignette, grain).

import * as THREE from 'three';
const fsVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Ambient-occlusion lookup shared by the DOF pass and the AO apply pass. tAO is half resolution,
// pre-blurred (x = openness, y = linear depth). Joint-bilateral upsample: of the four nearest AO
// texels, trust the ones whose depth matches this pixel, so silhouettes stay clean.
const AO_UP = /* glsl */ `
    float aoUp(vec2 uv, float z){
      vec2 aoRes = floor(uResolution * 0.5 + 0.5);
      vec2 st = uv * aoRes - 0.5; vec2 i0 = floor(st), f = st - i0;
      float acc = 0.0, ws = 0.0;
      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(float(k - (k / 2) * 2), float(k / 2));
        vec2 a = texture2D(tAO, (i0 + o + 0.5) / aoRes).xy;
        float wb = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
        float w = (wb + 1e-3) / (1e-3 + abs(a.y - z) / max(z, 1e-4) * 40.0);
        acc += a.x * w; ws += w;
      }
      return ws > 0.0 ? acc / ws : 1.0;
    }
    // occlusion only darkens ambient-lit surfaces: light sources and hot emissives keep their energy
    float aoFactor(vec3 c, float ao){ return mix(ao, 1.0, smoothstep(1.2, 5.0, dot(c, vec3(0.2126, 0.7152, 0.0722)))); }
    vec3 applyAO(vec3 c, float ao){ return c * aoFactor(c, ao); }
`;

// ---------------------------------------------------------------------------
// Depth of field — gather blur on a golden-angle spiral, CoC from linear depth.
export const DofShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 },
    uFocus: { value: 5 }, uRange: { value: 2 }, uMaxBlur: { value: 10 }, uResolution: { value: null },
    tAO: { value: null }, uAOOn: { value: 0 },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor, tDepth, tAO; uniform float uNear, uFar, uFocus, uRange, uMaxBlur, uAOOn; uniform vec2 uResolution;
    varying vec2 vUv;
    float linDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float coc(float z){ return clamp(abs(z - uFocus) / uRange, 0.0, 1.0); }
    ${AO_UP}
    void main(){
      float z0 = linDepth(vUv);
      float c0 = coc(z0);
      vec4 base = texture2D(tColor, vUv);
      if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base = vec4(0.0, 0.0, 0.0, 1.0);
      if (uAOOn > 0.5) base.rgb = applyAO(base.rgb, aoUp(vUv, z0));
      if (c0 * uMaxBlur < 0.5) { gl_FragColor = base; return; }
      vec2 px = 1.0 / uResolution;
      vec3 acc = base.rgb; float wsum = 1.0;
      const int N = 28; const float GA = 2.39996323;
      for (int i = 1; i < N; i++) {
        float r = sqrt(float(i) / float(N));
        float a = float(i) * GA;
        vec2 o = vec2(cos(a), sin(a)) * r * c0 * uMaxBlur * px;
        vec2 suv = vUv + o;
        float cs = coc(linDepth(suv));
        float w = smoothstep(r - 0.15, r, max(cs, c0 * 0.5)); // limit sharp foreground bleeding
        vec3 s = texture2D(tColor, suv).rgb;
        if (any(isnan(s)) || any(isinf(s))) { s = vec3(0.0); w = 0.0; }
        if (uAOOn > 0.5) s = applyAO(s, texture2D(tAO, suv).x);
        w *= 1.0 + dot(s, vec3(0.3)) * 0.6;                    // bokeh highlight bias
        acc += s * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
};

// ---------------------------------------------------------------------------
// Screen-space ambient occlusion from the scene's own depth buffer (no extra geometry pass).
// Normals are reconstructed from depth; the sampling radius is a fixed fraction of the frame
// (scale-free, so the same settings work for a microchip and a lunar plain). Output at half
// resolution: x = openness (1 = unoccluded), y = linear depth for the bilateral blur/upsample.
export const AoShader = {
  uniforms: {
    tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uProj: { value: new THREE.Vector4(1, 1, 0, 0) },
    uRadius: { value: 0.035 }, uIntensity: { value: 1 }, uDepthRes: { value: new THREE.Vector2(1, 1) }, uAspect: { value: 1 },
    uSeed: { value: 0 },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDepth; uniform float uNear, uFar, uRadius, uIntensity, uAspect, uSeed; uniform vec4 uProj; uniform vec2 uDepthRes;
    varying vec2 vUv;
    float rawD(vec2 uv){ return texture2D(tDepth, uv).x; }
    float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    vec3 viewPos(vec2 uv, float z){ vec2 n = uv * 2.0 - 1.0; return vec3((n.x + uProj.z) * z / uProj.x, (n.y + uProj.w) * z / uProj.y, -z); }
    vec3 posAt(vec2 uv){ return viewPos(uv, linZ(rawD(uv))); }
    void main(){
      // work on an exact full-resolution depth texel (this pass runs at half resolution, whose pixel
      // centres fall on texel corners — nearest-filtered depth would be ambiguous there)
      vec2 uv0 = (floor(vUv * uDepthRes) + 0.5) / uDepthRes;
      float d0 = rawD(uv0);
      if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, uFar, 0.0, 1.0); return; }   // sky / empty space
      float z0 = linZ(d0);
      vec3 P = viewPos(uv0, z0);
      // normal from depth: of the two one-sided differences take the smaller (no smearing across silhouettes)
      vec2 tx = vec2(1.0 / uDepthRes.x, 0.0), ty = vec2(0.0, 1.0 / uDepthRes.y);
      vec3 pr = posAt(uv0 + tx) - P, pl = P - posAt(uv0 - tx);
      vec3 pu = posAt(uv0 + ty) - P, pd = P - posAt(uv0 - ty);
      vec3 dx = abs(pr.z) < abs(pl.z) ? pr : pl, dy = abs(pu.z) < abs(pd.z) ? pu : pd;
      vec3 N = cross(dx, dy);
      float nl = length(N);
      if (!(nl > 1e-12)) { gl_FragColor = vec4(1.0, z0, 0.0, 1.0); return; }
      N /= nl;
      if (dot(N, P) > 0.0) N = -N;
      // world radius that spans uRadius of the frame height at this depth
      float R = uRadius * 2.0 * z0 / uProj.y;
      vec2 rUV = vec2(uRadius / uAspect, uRadius);
      // interleaved gradient noise rotates the spiral per pixel (the blur pass removes the pattern)
      float phi = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy + uSeed * 7.13, vec2(0.06711056, 0.00583715))));
      const int K = 14; const float GA = 2.39996323;
      float occ = 0.0;
      for (int i = 0; i < K; i++) {
        float fr = (float(i) + 0.5) / float(K);
        float a = float(i) * GA + phi;
        vec2 suv = uv0 + vec2(cos(a), sin(a)) * rUV * mix(0.04, 1.0, fr * fr);   // denser near the centre: contact detail
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
        suv = (floor(suv * uDepthRes) + 0.5) / uDepthRes;
        float ds = rawD(suv);
        if (ds >= 0.99999) continue;
        vec3 v = viewPos(suv, linZ(ds)) - P;
        float L = length(v);
        float fall = clamp(1.0 - (L * L) / (R * R), 0.0, 1.0);
        occ += max(0.0, dot(v, N) / max(L, 1e-5) - 0.12) * fall;
      }
      float ao = clamp(1.0 - uIntensity * 3.2 * occ / float(K), 0.0, 1.0);
      // fade out towards the far plane (distant haze is not contact-shadowed)
      ao = mix(ao, 1.0, smoothstep(uFar * 0.35, uFar * 0.8, z0));
      gl_FragColor = vec4(ao, z0, 0.0, 1.0);
    }`,
};

// Depth-aware blur of the raw occlusion (removes the per-pixel rotation pattern, keeps silhouettes).
export const AoBlurShader = {
  uniforms: { tAO: { value: null }, uTexel: { value: new THREE.Vector2(1, 1) } },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tAO; uniform vec2 uTexel;
    varying vec2 vUv;
    void main(){
      vec2 c = texture2D(tAO, vUv).xy;
      float acc = 0.0, ws = 0.0;
      for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
        vec2 s = texture2D(tAO, vUv + vec2(float(x), float(y)) * uTexel).xy;
        float w = exp(-float(x * x + y * y) * 0.18) / (1.0 + abs(s.y - c.y) / max(c.y, 1e-4) * 60.0);
        acc += s.x * w; ws += w;
      }
      gl_FragColor = vec4(acc / ws, c.y, 0.0, 1.0);
    }`,
};

// AO applied in place (no depth of field): drawn over the multisampled plate with multiplicative
// blending, so headings and edges drawn afterwards keep their MSAA.
export const AoApplyShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, tAO: { value: null },
    uNear: { value: 0.1 }, uFar: { value: 100 }, uResolution: { value: null },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor, tDepth, tAO; uniform float uNear, uFar; uniform vec2 uResolution;
    varying vec2 vUv;
    float linDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    ${AO_UP}
    void main(){
      vec3 c = texture2D(tColor, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      float k = texture2D(tDepth, vUv).x >= 0.99999 ? 1.0 : aoFactor(c, aoUp(vUv, linDepth(vUv)));
      gl_FragColor = vec4(vec3(k), 1.0);
    }`,
};

// Motion-blur accumulation: adds one sub-frame (linear HDR) with weight uWeight (additive blend).
export const AccumShader = {
  uniforms: { tInput: { value: null }, uWeight: { value: 1 } },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput; uniform float uWeight;
    varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tInput, vUv).rgb;
      if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
      gl_FragColor = vec4(min(c, vec3(64.0)) * uWeight, uWeight);
    }`,
};

// ---------------------------------------------------------------------------
// Transition compositor. Modes: 0 dissolve, 1 luma, 2 zoom-through, 3 flash, 4 spectrum wipe, 5 iris,
// 6 letter window (the next shot shows through a triangular letter counter supplied per frame).
export const TRANSITION_MODES = { dissolve: 0, luma: 1, zoom: 2, flash: 3, spectrum: 4, iris: 5, letter: 6 };
export const TransitionShader = {
  uniforms: {
    tA: { value: null }, tB: { value: null }, uProgress: { value: 0 }, uMode: { value: 0 },
    uTime: { value: 0 }, uAspect: { value: 2.39 }, uSingle: { value: 1 },
    uTri: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uTriOn: { value: 0 },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uProgress, uTime, uAspect, uSingle; uniform int uMode;
    uniform vec2 uTri[3]; uniform float uTriOn;
    varying vec2 vUv;
    // signed distance (aspect-corrected, >0 inside) to a triangle given in uv
    float triIn(vec2 p){
      vec2 k = vec2(uAspect, 1.0); float d = 1e9; float sgn = 0.0;
      for (int i = 0; i < 3; i++) {
        vec2 a = uTri[i] * k, b = uTri[i == 2 ? 0 : i + 1] * k, q = p * k;
        vec2 e = b - a, w = q - a;
        float c = e.x * w.y - e.y * w.x;
        sgn += sign(c);
        vec2 h = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
        d = min(d, length(h));
      }
      return abs(sgn) > 2.5 ? d : -d;
    }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    // Some GPUs produce NaN/Inf from edge-case maths in scene shaders; left alone, bloom
    // smears a single bad pixel into black blocks across the frame. Scrub it here.
    vec3 safe(vec3 c){ return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : clamp(c, 0.0, 64.0); }
    vec3 zoomBlur(sampler2D t, vec2 uv, float scale, float blur){
      vec2 c = vec2(0.5); vec3 acc = vec3(0.0);
      for (int i = 0; i < 10; i++) { float k = scale * (1.0 + blur * float(i) / 10.0); acc += safe(texture2D(t, c + (uv - c) / k).rgb); }
      return acc / 10.0;
    }
    vec3 spectrum(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
    void main(){
      vec2 uv = vUv;
      vec3 A = safe(texture2D(tA, uv).rgb);
      if (uSingle > 0.5) { gl_FragColor = vec4(A, 1.0); return; }
      vec3 B = safe(texture2D(tB, uv).rgb);
      float p = clamp(uProgress, 0.0, 1.0), ps = p * p * (3.0 - 2.0 * p);
      vec3 col;
      if (uMode == 1) {
        float key = clamp(lum(B) * 0.7, 0.0, 1.0) * 0.75 + vnoise(uv * vec2(uAspect, 1.0) * 6.0) * 0.25;
        float th = 1.0 - p * 1.3 + 0.15;
        float m = smoothstep(th - 0.15, th + 0.15, key + p * 0.3);
        m = max(m, smoothstep(0.75, 1.0, p));
        col = mix(A, B, m);
      } else if (uMode == 2) {
        vec3 za = zoomBlur(tA, uv, 1.0 + ps * 2.5, ps * 0.6);
        vec3 zb = zoomBlur(tB, uv, 0.45 + 0.55 * ps, (1.0 - ps) * 0.5);
        col = mix(za, zb, smoothstep(0.35, 0.75, p));
        // scenes already bring their own light at the hand-over; only a whisper of lift here
        col += vec3(1.0, 0.95, 0.9) * pow(1.0 - abs(p * 2.0 - 1.0), 6.0) * 0.08;
        col *= 1.0 - 0.35 * pow(1.0 - abs(p * 2.0 - 1.0), 2.0);
      } else if (uMode == 3) {
        float m = smoothstep(0.44, 0.56, p);
        float f = pow(1.0 - abs(p * 2.0 - 1.0), 6.0);   // a short, sharp peak, not a white-out
        col = mix(A, B, m) * (1.0 + f * 0.8) + vec3(1.0, 0.97, 0.92) * f * 0.35;
      } else if (uMode == 4) {
        float w = 0.28;
        float edge = mix(-w, 1.0 + w, ps);
        float x = uv.x + (uv.y - 0.5) * 0.18;
        float d = (x - edge) / w;             // <0 : revealed B, 0..1 : prism band, >1 : A
        vec3 bandB;
        float off = 0.012 * clamp(1.0 - abs(d), 0.0, 1.0);
        bandB.r = safe(texture2D(tB, uv + vec2(off, 0.0)).rgb).r; bandB.g = B.g; bandB.b = safe(texture2D(tB, uv - vec2(off, 0.0)).rgb).b;
        // equal-luminance hues (red → violet) with soft ends, so no single colour burns to white under bloom
        vec3 sc = spectrum(clamp(d, 0.0, 1.0) * 0.8); sc /= 0.3 + lum(sc);
        vec3 band = sc * 0.55 * smoothstep(0.0, 0.2, d) * smoothstep(1.0, 0.75, d);
        col = d < 0.0 ? bandB : mix(bandB, A, smoothstep(0.0, 1.0, d));
        col += band * smoothstep(-0.05, 0.1, d) * smoothstep(1.05, 0.9, d);
      } else if (uMode == 5) {
        float r = length((uv - 0.5) * vec2(uAspect, 1.0));
        float R = ps * 1.4;
        float m = smoothstep(R, R - 0.08, r);
        col = mix(A, B, m) + vec3(1.0, 0.95, 0.85) * smoothstep(0.03, 0.0, abs(r - R + 0.04)) * 1.5 * (1.0 - p);
      } else if (uMode == 6) {
        // letter window: B inside the counter (its edges hide under the letter, drawn afterwards)
        float m = uTriOn > 0.5 ? smoothstep(-0.002, 0.004, triIn(uv)) : ps;
        m = max(m, smoothstep(0.9, 1.0, p));
        col = mix(A, B, m);
      } else {
        col = mix(A, B, ps);
      }
      gl_FragColor = vec4(safe(col), 1.0);
    }`,
};

// ---------------------------------------------------------------------------
// Final grade → screen (sRGB).
export const FinalShader = {
  uniforms: {
    tInput: { value: null }, uExposure: { value: 1 }, uWarmth: { value: 1 }, uTime: { value: 0 },
    uGrain: { value: 0.05 }, uVignette: { value: 0.55 }, uCA: { value: 0.0025 }, uFade: { value: 1 },
    uResolution: { value: null }, uAspect: { value: 2.39 }, uHarmony: { value: 0.85 },
    uSS: { value: 1 }, uSrcTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform float uHarmony;
    uniform sampler2D tInput; uniform float uExposure, uWarmth, uTime, uGrain, uVignette, uCA, uFade, uAspect, uSS; uniform vec2 uResolution, uSrcTexel;
    varying vec2 vUv;
    // supersampled input (uSS > 1): a separable (1,3,3,1) tent over the source texels under this
    // output pixel — four bilinear taps, smoother than a box and free of ringing
    vec3 samp(vec2 uv){
      if (uSS < 1.01) return texture2D(tInput, uv).rgb;
      vec2 o = uSrcTexel * 0.375 * uSS;
      return 0.25 * (texture2D(tInput, uv + vec2(-o.x, -o.y)).rgb + texture2D(tInput, uv + vec2(o.x, -o.y)).rgb
                   + texture2D(tInput, uv + vec2(-o.x, o.y)).rgb + texture2D(tInput, uv + vec2(o.x, o.y)).rgb);
    }
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = inM * c; c = RRTAndODTFit(c); c = outM * c; return clamp(c, 0.0, 1.0);
    }
    float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    // 60-30-10 colour harmony: 60% neutral charcoal (dominant), 30% era tone (secondary:
    // bronze early, steel blue late), 10% signature gold (accent). Hues outside the two
    // families lose saturation and lean toward the nearest one; darks go neutral.
    vec3 rgb2hsv(vec3 c){ vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
    vec3 hsv2rgb(vec3 c){ vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
    float hueD(float a, float b){ float d = abs(a - b); return min(d, 1.0 - d); }
    float hueToward(float h, float target, float k){ float d = target - h; d -= floor(d + 0.5); return fract(h + d * k); }
    vec3 harmony(vec3 col, float w){
      const float ACCENT = 0.118, BRONZE = 0.075, STEEL = 0.585;
      vec3 hsv = rgb2hsv(col);
      float warm = clamp(w * 0.5 + 0.5, 0.0, 1.0);
      float kB = 1.0 - smoothstep(0.05, 0.14, hueD(hsv.x, BRONZE));
      float kS = 1.0 - smoothstep(0.06, 0.16, hueD(hsv.x, STEEL));
      float kSec = mix(kS, kB, warm);
      float kAcc = 1.0 - smoothstep(0.035, 0.09, hueD(hsv.x, ACCENT));
      float keep = max(kSec, kAcc);
      float sec = warm > 0.5 ? BRONZE : STEEL;
      float target = hueD(hsv.x, ACCENT) < hueD(hsv.x, sec) ? ACCENT : sec;
      hsv.x = hueToward(hsv.x, target, 0.45 * (1.0 - keep));
      hsv.y *= mix(0.32, 1.0, keep);                                // off-palette hues recede
      hsv.y *= mix(0.45, 1.0, smoothstep(0.04, 0.3, hsv.z));        // dominant: neutral charcoal darks
      hsv.y = min(1.0, hsv.y * (1.0 + 0.18 * kAcc));                // the accent carries the colour
      return mix(col, hsv2rgb(hsv), uHarmony);
    }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      vec2 d = (uv - 0.5);
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      // radial chromatic aberration (stronger towards edges)
      vec2 ca = d * uCA * (0.4 + r2 * 1.5);
      vec3 col = vec3(samp(uv + ca).r, samp(uv).g, samp(uv - ca).b);
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      col *= uExposure;
      // era colour temperature before tonemapping (white balance)
      float w = clamp(uWarmth, -1.0, 1.0);
      vec3 wb = w > 0.0 ? mix(vec3(1.0), vec3(1.08, 1.0, 0.86), w) : mix(vec3(1.0), vec3(0.92, 0.99, 1.1), -w);
      col *= wb;
      col = aces(col);
      // split toning: tinted shadows, gently tinted highlights
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // (gated so true black stays black — deep blacks are part of the look)
      vec3 shadowTint = w > 0.0 ? vec3(0.018, 0.010, 0.002) : vec3(0.002, 0.010, 0.018);
      col += shadowTint * smoothstep(0.0, 0.06, l) * pow(1.0 - l, 3.0) * abs(w);
      col = harmony(col, w);
      // gentle S-curve for contrast, protect deep blacks
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      // saturation trim for the "museum film" look
      col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, 0.94);
      // vignette
      float vig = smoothstep(1.25, 0.25, sqrt(r2) * 1.05);
      col *= mix(1.0, vig, uVignette);
      col *= uFade;
      col = toSRGB(clamp(col, 0.0, 1.0));
      // film grain (luma-weighted, animated) + dither
      // grain has a physical size: one cell per pixel up to 1080 lines, then it grows with the
      // resolution (smoothly interpolated) so a 4K master has the same texture as the HD one
      float gs = max(1.0, uResolution.y / 1080.0), gf = floor(uTime * 24.0);
      float g;
      if (gs < 1.01) g = hash(vec3(uv * uResolution, gf)) - 0.5;
      else {
        vec2 gp = uv * uResolution / gs, gi = floor(gp), gq = gp - gi; gq = gq * gq * (3.0 - 2.0 * gq);
        g = mix(mix(hash(vec3(gi, gf)), hash(vec3(gi + vec2(1.0, 0.0), gf)), gq.x),
                mix(hash(vec3(gi + vec2(0.0, 1.0), gf)), hash(vec3(gi + 1.0, gf)), gq.x), gq.y) - 0.5;
        g *= 1.35;   // interpolation lowers the variance; restore the look's strength
      }
      col += g * uGrain * (0.25 + 0.75 * smoothstep(0.0, 0.12, l)) * (1.0 - l * 0.6);
      col += (hash(vec3(uv * uResolution + 17.0, uTime)) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
