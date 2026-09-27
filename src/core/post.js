// Post-processing shaders: depth of field, scene transitions, and the final
// "film" grade (ACES, era colour temperature, chromatic aberration, vignette, grain).

const fsVert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// ---------------------------------------------------------------------------
// Depth of field — gather blur on a golden-angle spiral, CoC from linear depth.
export const DofShader = {
  uniforms: {
    tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 },
    uFocus: { value: 5 }, uRange: { value: 2 }, uMaxBlur: { value: 10 }, uResolution: { value: null },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor, tDepth; uniform float uNear, uFar, uFocus, uRange, uMaxBlur; uniform vec2 uResolution;
    varying vec2 vUv;
    float linDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
    float coc(float z){ return clamp(abs(z - uFocus) / uRange, 0.0, 1.0); }
    void main(){
      float c0 = coc(linDepth(vUv));
      vec4 base = texture2D(tColor, vUv);
      if (any(isnan(base.rgb)) || any(isinf(base.rgb))) base = vec4(0.0, 0.0, 0.0, 1.0);
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
        w *= 1.0 + dot(s, vec3(0.3)) * 0.6;                    // bokeh highlight bias
        acc += s * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, base.a);
    }`,
};

// ---------------------------------------------------------------------------
// Transition compositor. Modes: 0 dissolve, 1 luma, 2 zoom-through, 3 flash, 4 spectrum wipe, 5 iris.
export const TRANSITION_MODES = { dissolve: 0, luma: 1, zoom: 2, flash: 3, spectrum: 4, iris: 5 };
export const TransitionShader = {
  uniforms: {
    tA: { value: null }, tB: { value: null }, uProgress: { value: 0 }, uMode: { value: 0 },
    uTime: { value: 0 }, uAspect: { value: 2.39 }, uSingle: { value: 1 },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tA, tB; uniform float uProgress, uTime, uAspect, uSingle; uniform int uMode;
    varying vec2 vUv;
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
        vec3 band = spectrum(clamp(d, 0.0, 1.0) * 0.85) * 2.2 * smoothstep(1.0, 0.0, abs(d - 0.5) * 2.0);
        col = d < 0.0 ? bandB : mix(bandB, A, smoothstep(0.0, 1.0, d));
        col += band * smoothstep(-0.05, 0.1, d) * smoothstep(1.05, 0.9, d);
      } else if (uMode == 5) {
        float r = length((uv - 0.5) * vec2(uAspect, 1.0));
        float R = ps * 1.4;
        float m = smoothstep(R, R - 0.08, r);
        col = mix(A, B, m) + vec3(1.0, 0.95, 0.85) * smoothstep(0.03, 0.0, abs(r - R + 0.04)) * 1.5 * (1.0 - p);
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
    uResolution: { value: null }, uAspect: { value: 2.39 },
  },
  vertexShader: fsVert,
  fragmentShader: /* glsl */ `
    uniform sampler2D tInput; uniform float uExposure, uWarmth, uTime, uGrain, uVignette, uCA, uFade, uAspect; uniform vec2 uResolution;
    varying vec2 vUv;
    vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 aces(vec3 c){
      const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = inM * c; c = RRTAndODTFit(c); c = outM * c; return clamp(c, 0.0, 1.0);
    }
    float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 uv = vUv;
      vec2 d = (uv - 0.5);
      float r2 = dot(d * vec2(uAspect, 1.0), d * vec2(uAspect, 1.0));
      // radial chromatic aberration (stronger towards edges)
      vec2 ca = d * uCA * (0.4 + r2 * 1.5);
      vec3 col = vec3(texture2D(tInput, uv + ca).r, texture2D(tInput, uv).g, texture2D(tInput, uv - ca).b);
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
      float g = hash(vec3(uv * uResolution, floor(uTime * 24.0))) - 0.5;
      col += g * uGrain * (0.25 + 0.75 * smoothstep(0.0, 0.12, l)) * (1.0 - l * 0.6);
      col += (hash(vec3(uv * uResolution + 17.0, uTime)) - 0.5) / 255.0;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
