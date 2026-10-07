// THE WESTERN FILM — "Achievements of Western Civilization": its timeline, chapter cards and headings.
// Pure data (no three.js): the score and the tools read it too. src/film.js picks the film a page plays.

// transition: how this segment hands over to the NEXT one.
//   dissolve | luma | zoom | flash | spectrum | iris
const SEGMENTS = [
  { id: 'opening',     title: 'The Idea',                     start: 0.0,  end: 8.0,  transition: 'zoom' },
  { id: 'classical',   title: 'Classical Architecture',       start: 7.5,  end: 12.5, transition: 'luma' },
  { id: 'civic',       title: 'Democracy, Law & Institutions', start: 12.0, end: 16.0, transition: 'luma' },
  { id: 'renaissance', title: 'Art & the Renaissance',        start: 15.5, end: 20.5, transition: 'flash' },
  { id: 'italy',       title: 'The Italian Renaissance',      start: 20.0, end: 26.5, transition: 'dissolve' },
  { id: 'science',     title: 'Scientific Revolution',        start: 26.0, end: 31.0, transition: 'spectrum' },
  { id: 'music',       title: 'Music',                        start: 30.5, end: 37.0, transition: 'dissolve' },
  { id: 'industrial',  title: 'Industrial Revolution',        start: 36.5, end: 41.0, transition: 'flash' },
  { id: 'electricity', title: 'Electricity & Communication',  start: 40.5, end: 44.0, transition: 'zoom' },
  { id: 'medicine',    title: 'Medicine',                     start: 43.5, end: 47.0, transition: 'luma' },
  { id: 'flight',      title: 'Flight & Space',               start: 46.5, end: 51.0, transition: 'dissolve' },
  { id: 'moonshot',    title: 'The Moonshot · American Century', start: 50.5, end: 55.0, transition: 'dissolve' },
  { id: 'computing',   title: 'Computing & Digital',          start: 54.5, end: 59.0, transition: 'zoom' },
  { id: 'knowledge',   title: 'Knowledge',                    start: 58.5, end: 62.0, transition: 'flash' },
  { id: 'inventions',  title: 'Invention',                    start: 61.5, end: 68.0, transition: 'dissolve' },
  { id: 'frontier',    title: 'The New Frontier',             start: 67.5, end: 74.0, transition: 'zoom' },
  { id: 'montage',     title: 'Legacy',                       start: 73.5, end: 78.5, transition: 'letter' },   // zoom through the A of STARS
  { id: 'finale',      title: 'Ideas Build Upon Ideas',       start: 78.0, end: 96.0, transition: null },
];

// Key story beats (GLOBAL seconds). Scenes convert with `cue - segment.start`; the score places its hits
// on exactly the same numbers. Written on the 78 s clock the score is composed on (BASE) …
const BASE = {
  // opening — a trailer cold open (v12): hit from black, a flash-forward, the idea, the title SLAM
  ignition: 0.125,      // from black: a light burst, shockwave and sparks on the first hit
  flashForward: 0.375,  // gold-linework flashes on the 8ths: column · gear · rocket · Moon, then all collapse …
  pointAppears: 1.5,    // … into the point of light: the idea
  gridStart: 1.5,       // the construction explodes out of the point, stroke by stroke on the beat
  layersStart: 2.125,
  gridDone: 2.5,
  flyThrough: 2.625,    // a hard push through the linework and the manuscripts …
  titleAssemble: 2.75,
  titleLocked: 3.5,     // … into the title SLAM (film ≈ 4.86 s)
  subtitle: 3.875,
  letters3D: 5.3,       // (the title holds ~2 s of film, not 3.4: the letters turn and fly a second sooner)
  lettersFly: 5.8,
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
  wordRepresentation: 14.35,
  lettersToGeometry: 14.75,   // earlier + slower: the letters take their time to become columns
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
  // moonshot (the American century)
  translunar: 38.8,
  lunarDescent: 39.6,
  moonLanding: 40.6,
  footprint: 41.2,
  earthrise: 41.8,
  guidanceComputer: 42.4,
  // computing
  calculator: 42.8,
  relays: 43.4,
  tubes: 43.9,
  transistors: 44.4,
  processor: 44.9,
  processorDive: 45.3,
  binary: 45.8,
  // knowledge
  pagesFly: 46.8,
  pageSphere: 47.6,
  books: 48.4,
  pixels: 48.9,
  network: 49.3,
  // the new frontier — American achievements 1981–2026 and the vision of Mars
  shuttle: 49.9,        // Space Shuttle, 1981
  hubble: 50.7,         // Hubble Space Telescope, 1990
  genome: 51.5,         // Human Genome Project, 2003
  webb: 52.3,           // James Webb Space Telescope, 2021
  rover: 53.1,          // Perseverance + Ingenuity on Mars, 2021
  artemis: 53.9,        // Artemis — returning to the Moon
  marsVision: 54.6,     // the next giant leap: humans on Mars
  // montage (one morph every 0.8 s)
  mColumns: 55.6,
  mGears: 56.4,
  mOrbits: 57.2,
  mAtoms: 58.0,
  mCircuit: 58.8,
  mStars: 59.6,
  // finale — an 18 s coda
  pullBack: 60.5,       // climax hit: the camera pulls back from the stars
  earthReveal: 61.5,    // settle on a majestic Earth; music turns tender (theme reprise)
  storyOne: 62.5,       // "From the agora to the Moon,"
  storyTwo: 64.5,       // "twenty-five centuries of reason, courage and invention."
  ideasLine: 67.0,      // IDEAS BUILD UPON IDEAS.
  ideasOut: 69.4,
  sunrise: 69.6,        // the sun breaks over Earth's limb — the swell
  finalImpact: 71.0,    // the title lands on the final button hit
  closingLine: 72.8,    // THE JOURNEY CONTINUES
  fadeOut: 76.0,
};

// … then laid on this film's own 90 s clock. Two chapters of its own play whole bars of the score again:
//   The Italian Renaissance 20.0–26.0 ← music 14.0–20.0 (the Renaissance's bars), then the score runs on 6 s later
//   Invention               55.5–61.5 ← music 29.5–35.5 (Electricity & Medicine's: each exhibit on one of their hits)
//   Music                   31.0–37.0 ← music 19.0–25.0 (the Scientific Revolution's bars, softly, under Bach,
//                                        Mozart and Beethoven — MUSIC_DUCKS), then the score runs on 12 s later
//   Invention               61.5–67.5 ← music 29.5–35.5 (Electricity & Medicine's: each exhibit on one of their hits)
//   from the New Frontier on, music time = story − 18
const MUSIC_SPLICES = [[20.0, 6], [31.0, 12], [61.5, 32], [67.5, 18]];   // [story time, offset]: from there on, music time = story − offset
// the score steps back while the composers play (story [from, to, gain]; audio/score.js)
const MUSIC_DUCKS = [[31.0, 37.0, 0.35]];
const CUES = {
  ...Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, v >= 49.5 ? v + 18 : v >= 25.0 ? v + 12 : v >= 20.0 ? v + 6 : v])),
  // the italian renaissance — Florence and Rome
  italyDome: 20.0,      // over Florence's roofs to the cathedral dome
  brunelleschi: 20.9,   // the cutaway: Brunelleschi's double shell and herringbone brick, 1420–1436
  leonardoNotebook: 21.9, // Leonardo's notebook pages draw themselves
  aerialScrew: 22.5,    // the aerial screw, c. 1489
  ornithopter: 23.2,    // the ornithopter, c. 1490
  armouredCar: 23.9,    // the armoured vehicle, 1487
  sistine: 24.6,        // the Sistine Chapel: Michelangelo's ceiling, 1508–1512
  creationOfAdam: 25.4, // the two hands
  // music — Bach, Mozart, Beethoven (their themes play in the soundtrack: audio/cues.js `musicChapter`)
  musicHall: 30.6,      // into the candle-lit music room
  bach: 31.0,           // Bach, Cello Suite No. 1, Prelude (c. 1720)
  stradivari: 32.4,     // a Stradivari violin, Cremona
  mozart: 33.0,         // Mozart, Eine kleine Nachtmusik (1787)
  beethoven: 35.0,      // Beethoven, Symphony No. 9 (1824) …
  odeToJoy: 35.6,       // … the Ode to Joy, the hall fills with light
  // invention — a gallery of the last two centuries (each exhibit on a hit of the replayed bars)
  photograph: 61.5,     // Niépce's view from the window, 1826–27; Daguerre, 1839
  lightBulb: 62.0,      // the electric light: Swan and Edison, 1879   (music: the telephone hit)
  motorwagen: 62.6,     // Benz Patent-Motorwagen, 1886                 (radio)
  cinema: 63.2,         // the Lumière cinématographe, 1895             (electronics)
  television: 64.0,     // television: Baird 1926, Farnsworth 1927       (microDive)
  laser: 65.0,          // the laser: Maiman, 1960                       (anatomy)
  gps: 65.6,            // GPS: first satellite 1978, complete 1995      (medicalHud)
  smartphone: 66.2,     // the smartphone, 2007
  mrna: 66.8,           // mRNA vaccines, 2020: Karikó and Weissman      (blueprint)
};
// the score's own clock: its beat names at their composed times
const MUSIC_CUES = BASE;

// Colour temperature of the grade over time: +1 = marble/bronze/gold, -1 = steel/electric/cool.
const WARMTH_KEYS = [
  [0, 0.9], [8, 1.0], [20, 0.8], [26, 0.85], [26.5, 0.8], [30.5, 0.75], [31, 0.85], [36.5, 0.8], [37, 0.35], [41, 0.0], [44, -0.35],
  [51, -0.6], [55, -0.55], [61.5, -0.65], [62, 0.15], [67.5, 0.15], [68, -0.75], [74, -0.7], [78.5, -0.5], [84, -0.2], [88, 0.25], [96, 0.3],
];

// Headings per segment. Dates are the milestones each chapter shows. `roots` credits the earlier
// work of other civilizations the chapter's achievements built on (sources: docs/FACTS.md).
const CHAPTERS = {
  classical:   { n: 'I',    era: 'c. 500 BC — AD 400',          heading: 'THE FOUNDATIONS',        story: 'Athens and Rome gave the world proportion, engineering and the citizen.', roots: "Roots: Egypt's stone columns · arches first built in Mesopotamia and Egypt" },
  civic:       { n: 'II',   era: '508/7 BC · 1215 · 1689',      heading: 'THE RULE OF LAW',        story: 'From the Athenian assembly to parliament: power answerable to the people.', roots: "Roots: written law in Mesopotamia · Ur-Nammu c. 2100 BC · Hammurabi c. 1754 BC" },
  renaissance: { n: 'III',  era: 'c. 1400 — 1600',              heading: 'THE REBIRTH',            story: 'Artists became scientists, and learned to see the world anew.', roots: "Roots: Greek texts kept by Byzantine and Arabic scholars · optics of Ibn al-Haytham" },
  italy:       { n: 'IV',   era: '1420 — 1512',                 heading: 'THE ITALIAN RENAISSANCE', story: "Brunelleschi's dome, Leonardo's notebooks, Michelangelo's ceiling: Florence and Rome remade the arts.", roots: 'Roots: the Pantheon\'s Roman dome, c. AD 125 · Greek texts saved by Byzantine and Arab scholars' },
  science:     { n: 'V',   era: '1543 — 1704',                 heading: 'THE AGE OF REASON',      story: 'Copernicus, Galileo, Newton: the universe became knowable.', roots: "Roots: refraction, Ibn Sahl 984 · numerals and zero from India · algebra, al-Khwarizmi" },
  music:       { n: 'VI',   era: 'c. 1720 — 1824',              heading: 'THE LANGUAGE OF FEELING', story: 'Bach, Mozart and Beethoven: music written down that the whole world still plays.', roots: 'Roots: notation from Guido of Arezzo, c. 1025 · the violin family from Cremona · the oud and lute from the Arab world' },
  industrial:  { n: 'VII',    era: '1769 — 1900',                 heading: 'THE AGE OF MACHINES',    story: 'Steam and steel multiplied human strength a thousandfold.', roots: "Roots: steam power described by Hero of Alexandria, 1st c. AD · Taqi al-Din, 1551" },
  electricity: { n: 'VIII',   era: '1831 — 1947',                 heading: 'THE CONNECTED WORLD',    story: 'Lightning, tamed, carried the human voice across oceans.', roots: "Roots: radio, 1895, also by Jagadish Chandra Bose (India) and Alexander Popov (Russia)" },
  medicine:    { n: 'IX',  era: '1543 · 1796 · 1895 · 1928',   heading: 'THE GIFT OF LIFE',       story: 'Anatomy, vaccines and antibiotics gave billions longer lives.', roots: "Roots: lung circulation, Ibn al-Nafis c. 1242 · smallpox inoculation from Asia and Africa" },
  flight:      { n: 'X', era: '1903 — 1961',                 heading: 'THE CONQUEST OF THE SKY', story: 'Within one lifetime, from wooden wings to orbit.', roots: "Roots: rockets invented in China · first human in orbit, Yuri Gagarin, USSR, 1961" },
  moonshot:    { n: 'XI',   era: '1969',                        heading: null,                     story: null }, // the sequence carries its own title
  computing:   { n: 'XII',    era: '1822 — TODAY',                heading: 'THE DIGITAL REVOLUTION', story: 'Machines that calculate became machines that learn.', roots: "Roots: zero and place value from India · 'algorithm' honours al-Khwarizmi, Baghdad" },
  inventions:  { n: 'XIV',  era: '1826 — 2020',                 heading: 'TWO CENTURIES OF INVENTION', story: 'Photography, electric light, the car, cinema, television, the laser, GPS, the smartphone, mRNA.', roots: 'Exchange: television also by Takayanagi (Japan) · the maser and laser by Basov and Prokhorov (USSR) · mRNA vaccines brought to the world by BioNTech (Germany) and Moderna' },
  frontier:    { n: 'XV', era: '1981 — 2026',                 heading: 'THE NEW FRONTIER',       story: 'From the Shuttle to Webb, and next: the first humans on Mars.', roots: "Roots: first satellite, Sputnik, USSR 1957 · Webb with Europe (ESA) and Canada (CSA)" },
  knowledge:   { n: 'XIII',   era: 'c. 1450 — TODAY',             heading: 'THE SHARED MIND',        story: 'From the printing press to the internet: knowledge set free.', roots: "Roots: paper, China AD 105 · movable type, Bi Sheng c. 1040 · metal type, Korea 1377" },
};

// Story-only cards between chapters (global seconds).
const INTERLUDES = [
  { start: 1.5, end: 2.95, text: 'Every achievement begins as an idea.' },     // with the VO's "begins as an idea"; gone before the SLAM (3.5)
  { start: 73.9, end: 78.2, text: 'Standing on the shoulders of giants.', cite: 'NEWTON TO HOOKE · 1675/6', low: true },
];

// One defining word per chapter (Cinzel capitals — the film's display face).
// entries may be objects with explicit story timing: { text, t0, t1, pace, y (fraction of frame height), focus }
const WORDS = {
  classical: 'ORDER', civic: { text: 'LAW', t0: 12.3, t1: 13.6, pace: 0.8 },   // LAW clears before REPRESENTATION
  renaissance: 'BEAUTY', italy: 'WONDER', science: 'REASON', music: 'HARMONY', industrial: 'POWER',
  electricity: 'CONNECTION', medicine: 'LIFE', flight: 'FLIGHT',
  moonshot: { text: 'USA', t0: 51.95, t1: 52.86, pace: 0.6, y: 0.25, focus: false }, computing: [{ text: 'INTELLIGENCE', t0: 54.55, t1: 56.3, pace: 0.8 }, { text: 'AI', t0: 57.5, t1: 58.5, pace: 0.7, y: 0.2, focus: false }], knowledge: 'KNOWLEDGE',
  inventions: 'INVENTION',
  frontier: { text: 'FRONTIER', t0: 67.8, t1: 68.95, pace: 0.8 },   // clears before the genome shot
};
// the montage's rapid word swaps, each on its cue
const SWAPS = [['mColumns', 'ORDER'], ['mGears', 'MOTION'], ['mOrbits', 'ORBITS'], ['mAtoms', 'ATOMS'], ['mCircuit', 'CIRCUITS'], ['mStars', 'STARS']];

export default {
  id: 'western',
  title: 'Achievements of Western Civilization',
  short: 'Western Civilization',
  slug: 'achievements-of-western-civilization',
  DURATION: 96,
  MUSIC_DURATION: 78, MUSIC_SPLICES, MUSIC_DUCKS,   // the score's own clock, and how it is laid onto this one
  SEGMENTS, CUES, MUSIC_CUES, WARMTH_KEYS, CHAPTERS, INTERLUDES, WORDS, SWAPS,
  sceneDir: '.',                                   // src/scenes/<id>.js
  soundtrack: 'assets/audio/soundtrack.mp3',
  narration: 'assets/audio/narration.mp3',
  // the shared opening / finale scenes read their words from here
  opening: { line1: 'ACHIEVEMENTS OF', line2: 'WESTERN CIVILIZATION', subtitle: 'Built on the ideas of the whole world' },
  finale: { story1: 'From the agora to the Moon,', story2: 'twenty-five centuries of reason, courage and invention.', title2: 'OF WESTERN CIVILIZATION', world: 'Built on the ideas of the whole world' },
};
