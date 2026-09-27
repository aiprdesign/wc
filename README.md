# Achievements of Western Civilization — *A Motion Design Study*

A 60-second cinematic motion-graphics showcase that is **rendered live in the browser**.
Every frame (3D, particles, typography, compositing, grading) and every sound (score and
sound design) is generated procedurally at runtime. There is no video file and there are no
image or audio assets: just code, two vendored libraries and four open-licence typefaces.

> Many of the developments shown grew out of exchange with, and contributions from,
> civilizations across the world. The film treats them as a relay of ideas.

## Watch it

```bash
npx serve .          # or: python3 -m http.server
# open http://localhost:3000  (any static server works; there is no build step)
```

Press **Play film** with sound on. Controls: `space` play/pause · `←/→` seek · `0–9` jump to a
chapter · `m` mute · `f` fullscreen · `r` record to WebM · `h` toggle controls.
Add `?q=high` (2560 px) or `?q=ultra` (3840 px) for a sharper render on a strong GPU, or
`?q=low` for weaker machines.

### Export a video file

* **In the browser:** press `r`. The film plays once while the canvas and the audio are
  captured to a `.webm` (real time, so it relies on the GPU keeping up).
* **Frame-exact offline render:** `node tools/render.mjs --out renders/film --fps 30 --width 1920 --workers 3 --ffmpeg $(which ffmpeg)`.
  This renders each frame deterministically, writes the score to WAV and muxes an H.264 MP4.
  Add `--gpu` to use the hardware GPU instead of SwiftShader.

## The film

| # | time | sequence | technique showcased |
|---|------|----------|---------------------|
| 0 | 0:00 | **The Idea**: a point of light, compass-and-straightedge grid, layered manuscripts, the title assembles from particles, then monumental 3D letters | procedural line construction · 2.5D layering · particle typography · 2D→3D type |
| 1 | 0:07.5 | **Classical Architecture**: a lathe profile revolves into a fluted column (wireframe → clay → marble), then a temple materialises in raking sunlight under blueprint overlays | procedural modelling · look-dev build shaders · archviz · technical HUD |
| 2 | 0:12 | **Democracy, Law & Institutions**: parchment unfolds, agora → Roman law → parliament, kinetic words turn into architecture | kinetic typography · procedural folding · morphing |
| 3 | 0:15.5 | **Art & the Renaissance**: golden-ratio geometry and a sketch drawn from thousands of strokes lift into a 3D figure, then burst into pigment | procedural drawing · 2D→3D · particle simulation |
| 4 | 0:20 | **Scientific Revolution**: slow-motion fall and trajectory, instruments assemble, orrery fly-through, a prism splits white light | speed ramping · scientific visualisation · light and refraction |
| 5 | 0:24.5 | **Industrial Revolution**: macro gears, hundreds of meshing gears, pistons on the beat, steam, the machine revealed | hard-surface · mechanical rigs · smoke · sound sync |
| 6 | 0:28.5 | **Electricity & Communication**: a spark races down copper; telegraph → telephone → radio → electronics; a circuit city | match cuts · energy FX · procedural circuit growth |
| 7 | 0:31.5 | **Medicine**: a microscopic dive, engraving → holographic anatomy, a medical HUD | scientific visualisation · holographic UI |
| 8 | 0:34.5 | **Flight & Space**: a blueprint folds into an aircraft, clouds, launch, Earth and orbits | blueprint fold · atmospherics · planetary shading |
| 9 | 0:38.5 | **Computing**: calculator → relays → tubes → transistors → microprocessor, then a dive into the die, data, UI and AI | hard-surface morphs · data-flow viz · UI animation |
| 10 | 0:42.5 | **Knowledge**: pages form a sphere, then books, pixels and a global network | instanced choreography · multi-stage morphs |
| 11 | 0:45.5 | **Montage**: columns → gears → orbits → atoms → circuit nodes → stars | shape-driven match cuts · rhythm editing |
| 12 | 0:50 | **Finale**: particles around Earth, *Ideas build upon ideas.*, then the title on one deep impact | large particle systems · title design |

Colour moves from marble, bronze, parchment and gold to steel, electricity and cool white
light across the running time. The final grade applies this shift as an era white balance.

## How it's built

```
index.html            page shell + import map (no bundler)
src/timeline.js       master timeline: segments, transitions, cue sheet, BPM, era warmth
src/core/engine.js    renders any time T: sequences → HDR targets → DOF → transition → bloom → grade
src/core/post.js      depth of field, 6 transition shaders, ACES film grade (CA, vignette, grain)
src/core/player.js    audio-clock transport, seeking, WebM recording
src/audio/            procedural score + sound design, pre-rendered in an OfflineAudioContext
src/scenes/<id>.js    one module per sequence (see docs/SCENE_GUIDE.md)
src/lib/              motion-design toolkit: typography, particles, line reveals, HUD, materials, textures
tools/                headless frame capture, contact sheets, offline MP4 render, typeface builder
vendor/three/         three.js r186 (MIT)
assets/fonts/         Cinzel, Cormorant Garamond, IBM Plex Mono, Inter (SIL OFL)
```

* **Deterministic.** Every sequence is a pure function of time and the score is rendered
  once into an `AudioBuffer`. That makes scrubbing, seeking, offline rendering and
  picture/sound sync exact. The same `CUES` table drives the visuals and the sound hits.
* **Sound-reactive by construction.** The music runs at 120 BPM from frame 0. Visual rhythm
  (pistons, pulses, heartbeats, montage cuts) comes from `lib/rhythm.js` on the same grid,
  so it lands on the beat even in an offline render.
* **One continuous journey.** Sequences overlap by half a second and are composited with
  purpose-built transitions (zoom-through, luma reveal, flash, prismatic spectrum wipe,
  dissolve) so each era flows out of the previous one.
