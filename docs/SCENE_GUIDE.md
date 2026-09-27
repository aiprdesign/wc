# Writing a sequence

Each timeline segment in `src/timeline.js` has one module at `src/scenes/<id>.js`:

```js
import * as THREE from 'three';
import { CUES } from '../timeline.js';

export function create(ctx, segment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, ctx.aspect, 0.1, 200);
  const cue = (name) => CUES[name] - segment.start;   // cue → local seconds
  // …build everything up front (geometry, materials, text)…
  return {
    scene, camera,
    update(t, info) { /* pose EVERYTHING from t */ },
    // optional:
    hud,                                   // ctx.makeHUD() → { scene, camera } drawn on top (ortho, x∈[-aspect,aspect], y∈[-1,1])
    dof: { focus: 6, range: 2, amount: 0 }, // mutate each frame; amount 0..1 (0 = off)
    bloom: { strength: 0.7 },              // mutate each frame if you want
    exposure: 1,                           // mutate each frame if you want
    background: 0x000000,
  };
}
```

## Rules

1. **Pure function of time.** `update(t, info)` must set every animated property from `t`
   (local seconds; `t ∈ [0, segment.end - segment.start]`). No accumulated state, no `dt`
   integration, no `Math.random()` at update time. The film is scrubbable and rendered
   frame-by-frame, so any `t` can be requested in any order. Use `rng(seed)` from
   `lib/math.js` at build time for procedural variety.
2. **Camera aspect is fixed** at `ctx.aspect` (2.39:1). Compose for an anamorphic frame.
3. **Overlaps.** Segments overlap the neighbours by 0.5 s; the compositor blends them with
   the transition named in `timeline.js`. Keep the first/last 0.5 s visually rich — the
   incoming shot should already be moving when it appears, the outgoing shot still moving.
4. **Colour is linear HDR.** Values above ~1 bloom. The final pass does ACES tone mapping,
   era white balance (warm → cool over the film), vignette, grain and chromatic aberration.
   Don't add your own tonemapping or grain. For PBR set `scene.environment = ctx.env` and
   add a strong directional key light for drama; keep blacks deep.
5. **Beats.** Music is 120 BPM from t=0 (beat = 0.5 s). `pulse(info.T)` / `beatPhase(info.T)`
   in `lib/rhythm.js` give sound-synchronised motion (use the **global** time `info.T`).
6. **Particles** (`MorphParticles`) need `p.tick(t, info)` every frame.
7. Budget: aim for < ~300k triangles and < ~150k particles per sequence; it must play in
   real time on a laptop GPU alongside the neighbour during overlaps.

## Library (src/lib)

| module | highlights |
| --- | --- |
| `math.js` | `clamp sat lerp remap smoothstep ease.* ramp(t,a,b,fn) envelope(t,a,b,fi,fo) timeWarp(t,keys) rng(seed) pathAt(t,keys,out)` |
| `rhythm.js` | `pulse(T,{div,decay}) beatPhase(T) beatIndex(T) barSine(T)` |
| `noise.js` | `noise2/3/4 fbm2 fbm3`, `GLSL_NOISE` (snoise, snoise3) for shaders |
| `text.js` | `FONTS` (display Cinzel, serif Cormorant Garamond, mono IBM Plex Mono, sans Inter), `TextPlane(text,{height,font,weight,letterSpacing,color,intensity,italic})` with `.opacity .reveal .intensity`, `KineticText` (per-glyph planes: `.letters[i].mesh/.base/.u`), `textPoints(text,n,{width,font,weight})`, `textGeometry3D`, `letters3D` (extruded Cinzel Bold) |
| `particles.js` | `MorphParticles({count,positions,targets,colors,size,color,intensity})` with `.u.mix/.stagger/.noise/.scatter/.swirl/.size/.opacity/.intensity/.twinkle`, `setA/setB`; samplers `sampleSphere fibonacciSphere sampleBox sampleRing sampleDisk sampleGeometry`; `Dust` |
| `lines.js` | `revealLines(geometry,{order,mode,color,intensity})` self-constructing wireframes (`.progress .opacity`), `progressLine(points)`, `segmentsLine(segments)`, `progressTube(curve)`, `circlePoints`, `goldenSpiralPoints` |
| `materials.js` | `marble clay bronze gold copper steel darkMetal glass emissive fresnel hologram lightShaft glowSprite` |
| `textures.js` | `marbleTexture parchmentTexture brushedMetalTexture dotTexture gridTexture noiseDataTexture manuscriptTexture({kind:'geometry'|'astronomy'|'architecture'|'text'})` |
| `hud.js` | `Callout Dimension RingGauge BracketFrame` (each has `.reveal(p)`), `faceCamera` |
| `palette.js` | `PALETTE`, `color(name, intensity)` |

## Previewing

`node tools/snap.mjs --times 8,9.5,11 --out /tmp/frames` renders exact frames headlessly
(SwiftShader — slow but faithful). In a browser: `index.html?t=9.5` starts at a time,
`?still&t=9.5` renders one frame, number keys jump between chapters.
