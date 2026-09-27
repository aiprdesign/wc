// Master timeline — the single source of truth shared by picture and sound.
// All times are GLOBAL seconds. Segments overlap by ~0.5 s; the overlap is where
// the compositor blends the outgoing and incoming sequences with `transition`.

export const DURATION = 60;
export const FILM_ASPECT = 2.39;         // anamorphic frame; every scene is composed for this aspect
// Delivery aspect (?aspect=1, ?aspect=16:9 …). Other aspects render "open matte": each camera keeps its
// exact 2.39 horizontal view and the frame extends above/below, so nothing composed is ever cropped.
export const OUTPUT_ASPECT = (() => {
  try {
    const a = new URLSearchParams(globalThis.location?.search ?? '').get('aspect');
    if (!a) return FILM_ASPECT;
    const [x, y] = a.split(/[:x/]/).map(Number);
    const v = y ? x / y : x;
    return v > 0.3 && v < 4 ? Math.min(v, FILM_ASPECT) : FILM_ASPECT;
  } catch { return FILM_ASPECT; }
})();
export const BPM = 120;
export const BEAT = 60 / BPM;            // 0.5 s
export const BAR = BEAT * 4;             // 2.0 s

// transition: how this segment hands over to the NEXT one.
//   dissolve | luma | zoom | flash | spectrum | iris
export const SEGMENTS = [
  { id: 'opening',     title: 'The Idea',                     start: 0.0,  end: 8.0,  transition: 'zoom' },
  { id: 'classical',   title: 'Classical Architecture',       start: 7.5,  end: 12.5, transition: 'luma' },
  { id: 'civic',       title: 'Democracy, Law & Institutions', start: 12.0, end: 16.0, transition: 'luma' },
  { id: 'renaissance', title: 'Art & the Renaissance',        start: 15.5, end: 20.5, transition: 'flash' },
  { id: 'science',     title: 'Scientific Revolution',        start: 20.0, end: 25.0, transition: 'spectrum' },
  { id: 'industrial',  title: 'Industrial Revolution',        start: 24.5, end: 29.0, transition: 'flash' },
  { id: 'electricity', title: 'Electricity & Communication',  start: 28.5, end: 32.0, transition: 'zoom' },
  { id: 'medicine',    title: 'Medicine',                     start: 31.5, end: 35.0, transition: 'luma' },
  { id: 'flight',      title: 'Flight & Space',               start: 34.5, end: 39.0, transition: 'dissolve' },
  { id: 'computing',   title: 'Computing & Digital',          start: 38.5, end: 43.0, transition: 'zoom' },
  { id: 'knowledge',   title: 'Knowledge',                    start: 42.5, end: 46.0, transition: 'flash' },
  { id: 'montage',     title: 'Montage',                      start: 45.5, end: 50.5, transition: 'dissolve' },
  { id: 'finale',      title: 'Ideas Build Upon Ideas',       start: 50.0, end: 60.0, transition: null },
];

// Key story beats (GLOBAL seconds). Scenes convert with `cue - segment.start`;
// the score places its hits on exactly the same numbers.
export const CUES = {
  // opening
  pointAppears: 0.6,
  gridStart: 1.0,
  gridDone: 2.6,
  layersStart: 2.0,
  flyThrough: 3.0,
  titleAssemble: 4.0,
  titleLocked: 5.0,
  subtitle: 5.4,
  letters3D: 6.3,
  lettersFly: 6.8,
  // classical
  columnWire: 7.8,
  columnClay: 9.0,
  columnMarble: 9.8,
  templeLit: 10.4,
  templeReveal: 10.6,
  overlays: 11.0,
  // civic
  parchment: 12.3,
  wordCivic: 13.0,
  wordLaw: 13.9,
  wordRepresentation: 14.8,
  lettersToGeometry: 15.3,
  // renaissance
  canvas: 16.0,
  goldenRatio: 16.3,
  sketchStart: 16.9,
  sketchDone: 18.3,
  model3D: 18.4,
  paintBurst: 19.9,
  // science
  fallStart: 20.2,
  instruments: 21.4,
  orrery: 22.3,
  prismBeam: 24.0,
  spectrum: 24.5,
  // industrial
  gear: 25.0,
  gearsMany: 26.0,
  pistons: 26.5,
  steam: 27.3,
  machine: 27.8,
  // electricity
  spark: 28.8,
  telegraph: 29.3,
  telephone: 30.0,
  radio: 30.6,
  electronics: 31.2,
  circuitCity: 31.5,
  // medicine
  microDive: 32.0,
  anatomy: 33.0,
  medicalHud: 33.6,
  // flight & space
  blueprint: 34.8,
  aircraftFold: 35.6,
  flyby: 36.2,
  clouds: 36.8,
  rocketLaunch: 37.4,
  earthWide: 38.2,
  // computing
  calculator: 38.8,
  relays: 39.4,
  tubes: 39.9,
  transistors: 40.4,
  processor: 40.9,
  processorDive: 41.3,
  binary: 41.8,
  // knowledge
  pagesFly: 42.8,
  pageSphere: 43.6,
  books: 44.4,
  pixels: 44.9,
  network: 45.3,
  // montage (one morph every 0.8 s)
  mColumns: 45.6,
  mGears: 46.4,
  mOrbits: 47.2,
  mAtoms: 48.0,
  mCircuit: 48.8,
  mStars: 49.6,
  // finale
  pullBack: 50.5,
  musicDrop: 51.5,
  ideasLine: 52.5,
  ideasOut: 55.0,
  finalImpact: 56.0,
  closingLine: 57.4,
  fadeOut: 59.0,
};

// Colour temperature of the grade over time: +1 = marble/bronze/gold, -1 = steel/electric/cool.
export const WARMTH_KEYS = [
  [0, 0.9], [8, 1.0], [20, 0.8], [25, 0.35], [29, 0.0], [32, -0.35],
  [39, -0.6], [46, -0.75], [50.5, -0.5], [56, -0.3], [60, -0.3],
];

export function segmentById(id) {
  return SEGMENTS.find((s) => s.id === id);
}

// Local time of a cue inside a segment.
export function localCue(segmentId, cueName) {
  return CUES[cueName] - segmentById(segmentId).start;
}

export function warmthAt(T) {
  const k = WARMTH_KEYS;
  if (T <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (T <= k[i][0]) {
      const u = (T - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      const s = u * u * (3 - 2 * u);
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s;
    }
  }
  return k[k.length - 1][1];
}
