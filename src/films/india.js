// THE INDIAN FILM — "Achievements of Indian Civilization": its timeline, chapter cards and headings.
// Pure data (no three.js): the score and the tools read it too. src/film.js picks the film a page plays.
//
// It runs on the Western film's clock and grid (120 BPM, the same chapter slots up to Architecture),
// then six chapters of its own — Water Wisdom, Yoga & Pranayama, Herbs & Ayurveda, Invention, the Statue
// of Unity and Flight — make it 28 s (fourteen bars) longer: 106 s of story, 2:27 of film. The shared
// machinery (the opening, the montage's word swaps, the finale's coda, the chapter rail) reads the cues,
// so it follows. The score is written on the 78 s clock: its music is laid onto this one by
// MUSIC_SPLICES (whole bars of the score heard again under each new chapter; see audio/score.js).
// Facts and sources: docs/FACTS-INDIA.md.

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
  { id: 'water',      title: 'Water Wisdom',                start: 34.5, end: 41.0, transition: 'dissolve' },
  { id: 'nalanda',    title: 'The First Universities',      start: 40.5, end: 45.0, transition: 'dissolve' },
  { id: 'dharma',     title: 'The Path of Peace',           start: 44.5, end: 49.0, transition: 'dissolve' },
  { id: 'textiles',   title: 'Gifts to the World',          start: 48.5, end: 53.0, transition: 'zoom' },
  { id: 'yoga',       title: 'Yoga & Pranayama',            start: 52.5, end: 57.0, transition: 'dissolve' },
  { id: 'herbs',      title: 'Herbs & Ayurveda',            start: 56.5, end: 61.0, transition: 'dissolve' },
  { id: 'modern',     title: 'The Modern Mind',             start: 60.5, end: 64.0, transition: 'flash' },
  { id: 'inventors',  title: 'Invention',                   start: 63.5, end: 70.0, transition: 'dissolve' },
  { id: 'unity',      title: 'The Statue of Unity',         start: 69.5, end: 74.0, transition: 'dissolve' },
  { id: 'flight',     title: 'Flight',                      start: 73.5, end: 78.0, transition: 'zoom' },
  { id: 'isro',       title: 'To the Moon & Mars',          start: 77.5, end: 84.0, transition: 'zoom' },
  { id: 'montage',    title: 'Legacy',                      start: 83.5, end: 88.5, transition: 'letter' },   // zoom through the A of STARS
  { id: 'finale',     title: 'Ideas Build Upon Ideas',      start: 88.0, end: 106.0, transition: null, scene: './finale.js' },
];

// Key story beats (GLOBAL seconds). Scenes convert with `cue - segment.start`; the score places its hits
// on exactly the same numbers. Written first on the 78 s clock the score is composed on (BASE) …
const BASE = {
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

// … then laid on this film's own 106 s clock. Each new chapter plays whole bars of the score again (offsets
// are whole bars, so the beat never stumbles), chosen so they differ from their neighbours':
//   Water Wisdom  34.5–40.5  ← music 28.5–34.5 (Surgery and Architecture's bars)
//   Yoga          52.5–56.5  ← music 42.5–46.5 (the build into the calculator hit)
//   Herbs         56.5–60.5  ← music 38.5–42.5 (the Path of Peace's bars)
//   Invention     63.5–69.5  ← music 33.5–39.5
//   Unity, Flight 69.5–77.5  ← music 41.5–49.5, running straight on into the ISRO launch (music 49.5)
const MUSIC_SPLICES = [[34.5, 6], [52.5, 10], [56.5, 18], [60.5, 14], [63.5, 30], [69.5, 28]];   // [story time, offset]: from there on, music time = story − offset
// the score's own beats (BASE, music time) on the film's clock: Nalanda → Textiles +6, Modern +14, ISRO on +28
const fromBase = (t) => (t >= 49.5 ? t + 28 : t >= 46.5 ? t + 14 : t >= 34.5 ? t + 6 : t);
const toMusic = (t) => { let off = 0; for (const [at, o] of MUSIC_SPLICES) if (t >= at) off = o; return t - off; };
const CUES = {
  ...Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, fromBase(v)])),
  // yoga & pranayama (its music: the bars of 42.5–46.5 heard again — the calculator hit lands on the
  // sunrise, the A-major tension under the held breath, the release on the exhale)
  yogaSunrise: 52.8,    // dawn over the river ghats
  suryaNamaskar: 53.3,  // the twelve positions of the sun salutation flow, figure by figure
  pranayama: 54.4,      // the breath made visible: inhale …
  nadiShodhana: 55.0,   // … alternate-nostril breathing, the two channels
  exhale: 55.6,         // the long exhale (the orchestra's release)
  eightLimbs: 56.1,     // Patanjali's eight limbs, pranayama the fourth
  yogaDay: 56.5,        // 21 June, the International Day of Yoga
  // flight (its music: the bars of 45.5–49.5, the build that lands on the ISRO launch)
  pushpaka: 73.6,       // the dream: the Pushpaka Vimana of the Ramayana (legend)
  airmail: 74.6,        // 18 February 1911: the first official airmail, Allahabad → Naini
  tataMail: 75.8,       // 15 October 1932: J. R. D. Tata flies the mail Karachi → Bombay
  marut: 76.6,          // 1961: the HF-24 Marut, the first Indian-designed jet fighter
  tejas: 77.1,          // 2001: Tejas, first flight
  // water wisdom (Rajasthan): Chand Baori, the monsoon kept, Udaipur's lakes, the Hawa Mahal
  waterStepwell: 34.5,  // descend into Chand Baori, Abhaneri (c. 9th century, 13 storeys of steps)
  waterMonsoon: 37.3,   // the monsoon: rain collected and stored, the water rises up the steps
  waterUdaipur: 38.4,   // the rain clears over Lake Pichola and the Lake Palace
  waterJaipur: 39.7,    // over the ridge to Jaipur's pink city and the Hawa Mahal
  // herbs & ayurveda
  herbGarden: 56.5,     // the garden and the apothecary bench at dawn
  turmeric: 57.0,       // turmeric (residues in Indus pots at Farmana, c. 2500 BC)
  blackPepper: 57.6,    // ginger, and black pepper from the Malabar coast
  spiceBox: 58.2,       // the masala dabba: cardamom, cinnamon, cloves (from the Maluku islands)
  tulsi: 58.8,          // tulsi in its planter, under a neem bough
  ashwagandha: 59.4,    // ashwagandha roots and berries
  chyawanprash: 59.9,   // amla and chyawanprash (a recipe of the Charaka Samhita)
  charaka: 60.4,        // the kharal grinding; the Charaka Samhita; out over the wall to the sea
  // invention — a gallery of modern Indian science and engineering
  jcBose: 63.5,         // J. C. Bose's millimetre waves, Calcutta 1895
  sahaEquation: 64.65,  // Meghnad Saha's ionization equation, 1920
  chandrasekhar: 65.55, // the Chandrasekhar limit, 1930
  fibreOptics: 66.45,   // Kapany and Hopkins: images through glass fibres, 1954
  co2Laser: 67.25,      // Kumar Patel's carbon-dioxide laser, Bell Labs 1964
  jaipurFoot: 67.9,     // the Jaipur Foot, 1969
  usb: 68.55,           // USB, co-invented by Ajay Bhatt at Intel, 1996
  upi: 69.2,            // UPI, real-time payments, 2016
  // the statue of unity (its beats are the scene's own: valley 69.5, crane 70.7, height 72.0, pull-back 72.7)
  unityValley: 69.5,
};

// The score: the trailer score's architecture (src/audio/music.js) is written against the Western
// film's beat names; here each of those names is pinned to the Indian picture's beat at (nearly) the
// same moment, on the score's 78 s clock, so every orchestral hit lands on this film's own picture. The
// Indian layer (src/audio/india/) is music too and plays on the same clock; the sound design and the
// narration play on the film's own clock.
const MUSIC_CUES = {
  ...Object.fromEntries(Object.entries(CUES).map(([k, v]) => [k, toMusic(v)])),
  templeReveal: BASE.greatBath, wordCivic: BASE.sutras, wordLaw: BASE.grammarTree, wordRepresentation: 14.35,
  goldenRatio: BASE.dotZero, model3D: BASE.brahmagupta, fallStart: BASE.aryabhata, gear: BASE.forge,
  rocketLaunch: BASE.library, earthWide: BASE.asiaRoutes, moonLanding: BASE.wheel, footprint: BASE.charkha,
  earthrise: BASE.saltMarch, calculator: BASE.cottonBoll, processorDive: BASE.chessSpread, pageSphere: BASE.ramanBeam,
  shuttle: BASE.thumba, hubble: BASE.aryabhataSat, genome: BASE.pslv, webb: BASE.chandrayaan1, rover: BASE.mangalyaan,
  artemis: BASE.chandrayaan3, marsVision: BASE.southPole,
};

// Colour temperature of the grade over time: +1 = terracotta/bronze/gold, -1 = steel/electric/cool.
const WARMTH_KEYS = [
  [0, 0.9], [8, 1.0], [16, 0.85], [20, 0.6], [25, 1.0], [29, 0.6], [32, 0.9], [34.5, 0.9], [35.5, 0.7], [40.5, 0.7],
  [45, 0.75], [49, 0.7], [53, 0.85], [56.5, 0.85], [57, 0.75], [60.5, 0.6], [61, 0.1], [63.5, 0.1], [64, 0.45], [69.5, 0.45],
  [70, 0.15], [74, 0.4], [78, -0.45], [84, -0.6], [88.5, -0.45], [94, -0.1], [98, 0.3], [106, 0.35],
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
  water:      { n: 'VIII', era: 'c. 9TH CENTURY — 1799',   heading: 'WATER WISDOM',             story: 'Stepwells like Chand Baori stored the monsoon; Udaipur became a city of lakes.', roots: 'Stepwells across western India · Rani ki Vav, Gujarat, UNESCO World Heritage 2014' },
  nalanda:    { n: 'IX', era: 'c. AD 427 — 1200',       heading: 'THE FIRST UNIVERSITIES',   story: 'For eight centuries Nalanda drew thousands of students from across Asia.', roots: 'Earlier: Takshashila · Xuanzang came from China to study there in the 630s' },
  dharma:     { n: 'X',   era: 'c. 260 BC · 1947 · 1950', heading: 'THE PATH OF PEACE',       story: 'From Ashoka to Gandhi: the idea that nonviolence can change the world.', roots: "Buddhism spread across Asia · Gandhi's nonviolence inspired Martin Luther King Jr." },
  textiles:   { n: 'XI',    era: 'c. 5000 BC — TODAY',     heading: 'GIFTS TO THE WORLD',       story: 'Cotton cloth, indigo and chess travelled from India to every continent.', roots: 'Exchange: chess went on through Persia as shatranj · indigo is named for India' },
  yoga:       { n: 'XII',   era: 'PATANJALI · YOGA SUTRAS',  heading: 'THE SCIENCE OF BREATH',  story: "Patanjali set out yoga's eight limbs; the fourth, pranayama, is the mastery of breath.", roots: 'Now practised worldwide · UNESCO intangible heritage, 2016 · International Day of Yoga, 21 June' },
  herbs:      { n: 'XIII', era: 'CHARAKA SAMHITA',          heading: 'THE KNOWLEDGE OF LIFE',    story: 'Turmeric, pepper, tulsi, neem, ashwagandha: Ayurveda described hundreds of medicinal plants.', roots: 'Exchange: pepper and spices drew traders from Rome to China · cloves came from the Maluku islands' },
  modern:     { n: 'XIV',  era: '1913 — 1930',            heading: 'THE MODERN MIND',          story: 'Ramanujan, Raman and Bose: new mathematics and new physics.', roots: 'Ramanujan worked with G. H. Hardy at Cambridge · bosons are named after S. N. Bose' },
  inventors:  { n: 'XV',   era: '1895 — 2016',            heading: 'THE SPIRIT OF INVENTION',  story: 'Radio waves, starlight, fibre optics and lasers; an artificial foot for millions; payments for all.', roots: 'With collaborators worldwide: Hopkins in London, Bell Labs, Intel · the Jaipur Foot made with a village craftsman' },
  unity:      { n: 'XVI',  era: '2018',                   heading: 'THE STATUE OF UNITY',      story: 'Sardar Vallabhbhai Patel, 182 m tall: the tallest statue in the world.', roots: 'Sculptor Ram V. Sutar · on the Narmada, facing the Sardar Sarovar Dam' },
  flight:     { n: 'XVII', era: '1911 — 2001',            heading: 'THE DREAM OF FLIGHT',      story: 'The epics dreamed of flying chariots; in 1911 the first official airmail flew at Allahabad.', roots: 'Exchange: flown by the French pilot Henri Pequet in a British biplane · HAL founded 1940' },
  isro:       { n: 'XVIII',  era: '1963 — 2023',            heading: 'TO THE MOON AND MARS',     story: "Mars orbit at the first attempt; then a landing near the Moon's south pole.", roots: 'Roots: first rocket from Thumba, 1963, an American Nike-Apache · first satellite launched by the USSR, 1975' },
};

// Story-only cards between chapters (global seconds).
const INTERLUDES = [
  { start: 1.5, end: 2.95, text: 'Every achievement begins as an idea.' },
  { start: 83.9, end: 88.2, text: 'The world is one family.', cite: 'VASUDHAIVA KUTUMBAKAM · MAHA UPANISHAD', low: true },
];

// One defining word per chapter (Cinzel capitals — the film's display face).
// entries may be objects with explicit story timing: { text, t0, t1, pace, y (fraction of frame height), focus }
const WORDS = {
  indus: 'CITIES', language: 'LANGUAGE', zero: 'ZERO', astronomy: 'COSMOS', metallurgy: 'METAL',
  surgery: 'HEALING', temples: 'STONE', nalanda: 'LEARNING', dharma: 'PEACE', textiles: 'GIFTS', yoga: 'YOGA',
  modern: 'GENIUS', flight: 'FLIGHT', isro: { text: 'SPACE', t0: 77.8, t1: 78.95, pace: 0.8 },
  water: 'WATER', herbs: 'HERBS', inventors: 'INVENTION', unity: 'UNITY',
};
// the same headings in Hindi (drawn large, the English word small beneath; shaped by tools/deva-headings.py)
const WORDS_HI = {
  indus: 'नगर', language: 'भाषा', zero: 'शून्य', astronomy: 'ब्रह्मांड', metallurgy: 'धातु',
  surgery: 'चिकित्सा', temples: 'शिला', nalanda: 'विद्या', dharma: 'शांति', textiles: 'उपहार', yoga: 'योग',
  modern: 'प्रतिभा', flight: 'उड़ान', isro: 'अंतरिक्ष',
  water: 'जल', herbs: 'औषधि', inventors: 'आविष्कार', unity: 'एकता',
};
// the montage's rapid word swaps, each on its cue (the last word keeps an A: the cut zooms through it)
const SWAPS = [['mGrid', 'CITIES'], ['mZero', 'ZERO'], ['mWheel', 'DHARMA'], ['mTemple', 'STONE'], ['mOrbit', 'ORBIT'], ['mStars', 'STARS']];

export default {
  id: 'india',
  title: 'Achievements of Indian Civilization',
  short: 'Indian Civilization',
  slug: 'achievements-of-indian-civilization',
  DURATION: 106,
  MUSIC_DURATION: 78, MUSIC_SPLICES,   // the score's own clock, and how it is laid onto this one
  SEGMENTS, CUES, MUSIC_CUES, WARMTH_KEYS, CHAPTERS, INTERLUDES, WORDS, WORDS_HI, SWAPS,
  grade: { nature: 1 },   // green fields, trees and rivers keep their colour through the grade (core/post.js)
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
    title2: 'OF INDIAN CIVILIZATION', world: 'The world is one family',
    sanskrit: 'वसुधैव कुटुम्बकम्',   // Vasudhaiva Kutumbakam (Maha Upanishad 6.71–75)
    spin: -0.75,   // the Earth turned so the subcontinent faces the camera, lit, as the story lines play
  },
};
