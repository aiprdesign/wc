// THE INDIAN FILM — "Achievements of Indian Civilization": its timeline, chapter cards and headings.
// Pure data (no three.js): the score and the tools read it too. src/film.js picks the film a page plays.
//
// It runs on the Western film's clock and grid (the same 78 s story, 120 BPM, the same chapter slots),
// so the shared machinery (the opening's title, the montage's word swaps, the finale's coda, the
// chapter rail) lines up unchanged. Facts and sources: docs/FACTS-INDIA.md.

// transition: how this segment hands over to the NEXT one.
//   dissolve | luma | zoom | flash | spectrum | iris | letter
const SEGMENTS = [
  { id: 'opening',    title: 'The Idea',                    start: 0.0,  end: 8.0,  transition: 'zoom', scene: './opening.js' },
  { id: 'indus',      title: 'The Indus Cities',            start: 7.5,  end: 12.5, transition: 'luma' },
  { id: 'language',   title: 'Language & Grammar',          start: 12.0, end: 16.0, transition: 'luma' },
  { id: 'zero',       title: 'Zero & the Decimal System',   start: 15.5, end: 20.5, transition: 'flash' },
  { id: 'astronomy',  title: 'Astronomy',                   start: 20.0, end: 25.0, transition: 'spectrum' },
  { id: 'metallurgy', title: 'Metallurgy',                  start: 24.5, end: 29.0, transition: 'flash' },
  { id: 'surgery',    title: 'Surgery & Medicine',          start: 28.5, end: 32.0, transition: 'zoom' },
  { id: 'temples',    title: 'Architecture',                start: 31.5, end: 35.0, transition: 'luma' },
  { id: 'nalanda',    title: 'The First Universities',      start: 34.5, end: 39.0, transition: 'dissolve' },
  { id: 'dharma',     title: 'The Path of Peace',           start: 38.5, end: 43.0, transition: 'dissolve' },
  { id: 'textiles',   title: 'Gifts to the World',          start: 42.5, end: 47.0, transition: 'zoom' },
  { id: 'modern',     title: 'The Modern Mind',             start: 46.5, end: 50.0, transition: 'flash' },
  { id: 'isro',       title: 'To the Moon & Mars',          start: 49.5, end: 56.0, transition: 'zoom' },
  { id: 'montage',    title: 'Legacy',                      start: 55.5, end: 60.5, transition: 'letter' },   // zoom through the A of STARS
  { id: 'finale',     title: 'Ideas Build Upon Ideas',      start: 60.0, end: 78.0, transition: null, scene: './finale.js' },
];

// Key story beats (GLOBAL seconds). Scenes convert with `cue - segment.start`;
// the score places its hits on exactly the same numbers.
const CUES = {
  // opening (the shared cold open: the same beats as the Western film)
  ignition: 0.125, flashForward: 0.375, pointAppears: 1.5, gridStart: 1.5, layersStart: 2.125, gridDone: 2.5,
  flyThrough: 2.625, titleAssemble: 2.75, titleLocked: 3.5, subtitle: 3.875, letters3D: 5.3, lettersFly: 5.8,
  // indus — the first planned cities, c. 2600–1900 BC
  indusDust: 7.8,       // aerial: the mud-brick city rises out of the plain
  indusGrid: 8.6,       // streets draw on a grid, blocks extrude
  indusDrains: 9.6,     // cutaway: covered brick drains under every street
  greatBath: 10.4,      // the Great Bath fills
  indusWeights: 11.2,   // standard chert weights and a seal
  // language — Panini's grammar, c. 4th century BC
  palmLeaf: 12.3,       // a palm-leaf manuscript unfurls
  sutras: 13.0,         // sutras type on, rule by rule
  grammarTree: 13.8,    // rules branch into a derivation tree
  scripts: 14.8,        // Brahmi letters → the scripts of South and Southeast Asia
  // zero — place value and the rules of zero (Brahmagupta, AD 628)
  dotZero: 16.0,        // a single dot: zero as a placeholder (Bakhshali manuscript)
  placeValue: 16.8,     // columns of place value
  brahmagupta: 17.8,    // the rules of zero
  numeralsTravel: 19.0, // digits travel west and become 0–9
  zeroRing: 19.9,       // the zero becomes a ring of light
  // astronomy — Aryabhata (499) and the Jantar Mantar (1734)
  aryabhata: 20.3,      // the Earth turns on its axis
  piDigits: 21.4,       // π ≈ 62832 / 20000 = 3.1416
  sineTable: 22.3,      // the sine (jya) table on a circle
  jantarMantar: 23.2,   // the Samrat Yantra rises
  samratShadow: 24.2,   // its shadow sweeps the scale
  // metallurgy — wootz steel and the Iron Pillar
  forge: 25.0,          // the furnace roars
  crucible: 25.8,       // crucibles glow white
  wootzPattern: 26.6,   // the watered pattern of wootz on a blade
  ironPillar: 27.4,     // the Iron Pillar of Delhi
  zinc: 28.2,           // zinc distilled at Zawar
  // surgery — Sushruta
  herbs: 28.8,          // medicinal plants
  instruments: 29.5,    // the surgical instruments fan out
  rhinoplasty: 30.4,    // the cheek-flap nose reconstruction, as a diagram
  surgeryHud: 31.2,
  // temples — rock-cut and built stone
  stupa: 31.9,          // the Great Stupa at Sanchi
  kailasa: 32.7,        // Kailasa, Ellora: carved down from one rock
  brihadeeswarar: 33.6, // the tower at Thanjavur, 1010
  taj: 34.3,            // the Taj Mahal
  // nalanda — the universities
  nalandaBricks: 34.8,
  nalandaRise: 35.6,
  scholars: 36.5,
  library: 37.3,
  asiaRoutes: 38.1,     // routes to China, Tibet, Korea, Southeast Asia
  // dharma — Ashoka to Gandhi
  lionCapital: 38.9,
  edicts: 39.7,
  wheel: 40.5,          // the 24-spoke wheel
  charkha: 41.3,        // the spinning wheel
  saltMarch: 41.9,
  republic: 42.4,       // 1947 · 1950
  // textiles — gifts to the world
  cottonBoll: 42.8,
  loom: 43.5,
  chintz: 44.2,
  chess: 44.9,
  chessSpread: 45.6,
  yoga: 46.2,
  // modern — Ramanujan, Raman, Bose
  ramanujan: 46.8,
  ramanBeam: 47.8,
  boseCondensate: 48.6,
  labGlow: 49.2,
  // isro — to the Moon and Mars
  thumba: 49.9,         // the first sounding rocket, Thumba 1963
  aryabhataSat: 50.7,   // the first satellite, 1975
  pslv: 51.5,           // PSLV lifts off
  chandrayaan1: 52.3,   // water on the Moon, 2008
  mangalyaan: 53.1,     // Mars orbit, first attempt, 2014
  chandrayaan3: 53.9,   // the landing, 23 August 2023
  southPole: 54.6,      // near the lunar south pole
  // montage (one morph every 0.8 s)
  mGrid: 55.6,
  mZero: 56.4,
  mWheel: 57.2,
  mTemple: 58.0,
  mOrbit: 58.8,
  mStars: 59.6,
  // finale (the shared 18 s coda: the same beats as the Western film)
  pullBack: 60.5, earthReveal: 61.5, storyOne: 62.5, storyTwo: 64.5, ideasLine: 67.0, ideasOut: 69.4,
  sunrise: 69.6, finalImpact: 71.0, closingLine: 72.8, fadeOut: 76.0,
};

// The score: the trailer score's architecture (src/audio/music.js) is written against the Western
// film's beat names; here each of those names is pinned to the Indian picture's beat at (nearly) the
// same moment, so every orchestral hit lands on this film's own picture. The Indian layer
// (src/audio/india/) plays on top, on this film's own cues.
const MUSIC_CUES = {
  ...CUES,
  templeReveal: CUES.greatBath, wordCivic: CUES.sutras, wordLaw: CUES.grammarTree, wordRepresentation: 14.35,
  goldenRatio: CUES.dotZero, model3D: CUES.brahmagupta, fallStart: CUES.aryabhata, gear: CUES.forge,
  rocketLaunch: CUES.library, earthWide: CUES.asiaRoutes, moonLanding: CUES.wheel, footprint: CUES.charkha,
  earthrise: CUES.saltMarch, calculator: CUES.cottonBoll, processorDive: CUES.chessSpread, pageSphere: CUES.ramanBeam,
  shuttle: CUES.thumba, hubble: CUES.aryabhataSat, genome: CUES.pslv, webb: CUES.chandrayaan1, rover: CUES.mangalyaan,
  artemis: CUES.chandrayaan3, marsVision: CUES.southPole,
};

// Colour temperature of the grade over time: +1 = terracotta/bronze/gold, -1 = steel/electric/cool.
const WARMTH_KEYS = [
  [0, 0.9], [8, 1.0], [16, 0.85], [20, 0.6], [25, 1.0], [29, 0.6], [32, 0.9], [39, 0.75],
  [43, 0.7], [47, 0.1], [50, -0.45], [56, -0.6], [60.5, -0.45], [66, -0.1], [70, 0.3], [78, 0.35],
];

// Chapter cards. `roots` names the exchange each chapter's achievements were part of: what India
// learned from others, and where its ideas went (sources: docs/FACTS-INDIA.md).
const CHAPTERS = {
  indus:      { n: 'I',    era: 'c. 2600 — 1900 BC',      heading: 'THE FIRST CITIES',         story: 'Mohenjo-daro and Harappa: streets on a grid, covered drains, standard weights.', roots: 'Roots: farming villages like Mehrgarh, c. 7000 BC · trade with Mesopotamia' },
  language:   { n: 'II',   era: 'c. 4TH CENTURY BC',      heading: 'THE SCIENCE OF LANGUAGE',  story: 'Panini set out the whole grammar of Sanskrit in about 4,000 short rules.', roots: 'Also Tamil Sangam poetry · Brahmi, the parent of scripts across Asia' },
  zero:       { n: 'III',  era: 'AD 628',                 heading: 'THE POWER OF ZERO',        story: 'Brahmagupta gave zero its rules: ten digits could now write any number.', roots: 'Exchange: Babylon and the Maya had placeholders · on via al-Khwarizmi, c. 825, to Europe' },
  astronomy:  { n: 'IV',   era: '499 · 1734',             heading: 'THE MEASURE OF THE SKY',   story: 'Aryabhata, at 23: the Earth turns on its axis, and π is close to 3.1416.', roots: 'Exchange: Greek astronomy reached India · Indian tables were translated in Baghdad' },
  metallurgy: { n: 'V',    era: 'c. 300 BC — AD 400',     heading: 'THE MASTERY OF METAL',     story: 'Crucible steel, and an iron pillar that has stood 1,600 years with barely a trace of rust.', roots: 'Exchange: wootz ingots forged into Damascus blades · zinc distilled at Zawar' },
  surgery:    { n: 'VI',   era: 'SUSHRUTA SAMHITA',       heading: 'THE HEALING HAND',         story: 'Sushruta described more than a hundred instruments, and how to rebuild a nose.', roots: "Also Charaka's medicine · the 'Indian method' of rhinoplasty reached London, 1794" },
  temples:    { n: 'VII',  era: '3RD C. BC — AD 1653',    heading: 'STONE AND SPIRIT',         story: 'From Sanchi to Ellora, where a whole temple was carved down from one rock.', roots: 'Also the Taj Mahal, 1632–1653, raised with Persian and Central Asian masters' },
  nalanda:    { n: 'VIII', era: 'c. AD 427 — 1200',       heading: 'THE FIRST UNIVERSITIES',   story: 'For eight centuries Nalanda drew thousands of students from across Asia.', roots: 'Earlier: Takshashila · Xuanzang came from China to study there in the 630s' },
  dharma:     { n: 'IX',   era: 'c. 260 BC · 1947 · 1950', heading: 'THE PATH OF PEACE',       story: 'From Ashoka to Gandhi: the idea that nonviolence can change the world.', roots: "Buddhism spread across Asia · Gandhi's nonviolence inspired Martin Luther King Jr." },
  textiles:   { n: 'X',    era: 'c. 5000 BC — TODAY',     heading: 'GIFTS TO THE WORLD',       story: 'Cotton cloth, indigo, chess and yoga travelled from India to every continent.', roots: 'Exchange: chess went on through Persia as shatranj · indigo is named for India' },
  modern:     { n: 'XI',   era: '1913 — 1930',            heading: 'THE MODERN MIND',          story: 'Ramanujan, Raman and Bose: new mathematics and new physics.', roots: 'Ramanujan worked with G. H. Hardy at Cambridge · bosons are named after S. N. Bose' },
  isro:       { n: 'XII',  era: '1963 — 2023',            heading: 'TO THE MOON AND MARS',     story: "Mars orbit at the first attempt; then a landing near the Moon's south pole.", roots: 'Roots: first rocket from Thumba, 1963, an American Nike-Apache · first satellite launched by the USSR, 1975' },
};

// Story-only cards between chapters (global seconds).
const INTERLUDES = [
  { start: 1.5, end: 2.95, text: 'Every achievement begins as an idea.' },
  { start: 55.9, end: 60.2, text: 'The world is one family.', cite: 'VASUDHAIVA KUTUMBAKAM · MAHA UPANISHAD', low: true },
];

// One defining word per chapter (Cinzel capitals — the film's display face).
// entries may be objects with explicit story timing: { text, t0, t1, pace, y (fraction of frame height), focus }
const WORDS = {
  indus: 'CITIES', language: 'LANGUAGE', zero: 'ZERO', astronomy: 'COSMOS', metallurgy: 'METAL',
  surgery: 'HEALING', temples: 'STONE', nalanda: 'LEARNING', dharma: 'PEACE', textiles: 'GIFTS',
  modern: 'GENIUS', isro: { text: 'SPACE', t0: 49.8, t1: 50.95, pace: 0.8 },
};
// the montage's rapid word swaps, each on its cue (the last word keeps an A: the cut zooms through it)
const SWAPS = [['mGrid', 'CITIES'], ['mZero', 'ZERO'], ['mWheel', 'DHARMA'], ['mTemple', 'STONE'], ['mOrbit', 'ORBIT'], ['mStars', 'STARS']];

export default {
  id: 'india',
  title: 'Achievements of Indian Civilization',
  short: 'Indian Civilization',
  slug: 'achievements-of-indian-civilization',
  DURATION: 78,
  SEGMENTS, CUES, MUSIC_CUES, WARMTH_KEYS, CHAPTERS, INTERLUDES, WORDS, SWAPS,
  note: "India's achievements grew through exchange with civilizations across Asia, Africa and Europe.",
  sceneDir: './india',                             // src/scenes/india/<id>.js
  soundtrack: 'assets/audio/india/soundtrack.mp3',
  narration: 'assets/audio/india/narration.mp3',
  // the shared opening / finale scenes read their words from here
  opening: {
    line1: 'ACHIEVEMENTS OF', line2: 'INDIAN CIVILIZATION', subtitle: 'Five thousand years of ideas',
    icons: ['stupa', 'zero', 'pslv', 'moon'], temple: 'nagara',
    labels: { ratio: '√2 = 577 / 408', module: 'SULBA · I', title: 'Sulba Sutra' },
    // the handwriting on the drifting manuscripts: titles of Indian works (transliterated)
    manuscript: ['Aryabhatiya', 'Ashtadhyayi', 'Sulba Sutra', 'Brahmasphutasiddhanta', 'Sushruta Samhita', 'Charaka Samhita',
      'Lilavati', 'Tirukkural', 'Natya Shastra', 'Surya Siddhanta', 'Yoga Sutra', 'Ganita', 'Shunya', 'Siddhanta Shiromani'],
  },
  finale: {
    story1: 'From the Indus to the Moon,', story2: 'five thousand years of curiosity, craft and discovery.',
    title2: 'OF INDIAN CIVILIZATION', world: 'Shared with the whole world',
    spin: -0.75,   // the Earth turned so the subcontinent faces the camera, lit, as the story lines play
  },
};
