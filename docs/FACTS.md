# Fact sheet: what the film says, and where to check it

This sheet lists every factual claim the viewer hears (narration) or reads (chapter cards,
captions, HUD labels and on-screen documents) in *Achievements of Western Civilization*, with
one or two sources for each. Wikipedia links are included only as convenient pointers. Where a
primary or institutional source exists (NASA, Britannica, the Library of Congress, museums,
universities), it is listed first.

**Film time** is the playback time in the 1:40 film (story seconds × 100/72, see
`src/timeline.js`). Captions appear for a second or two around the time given.

**Status**
- **Correct**: checked against the sources, unchanged.
- **Fixed**: was wrong, imprecise or unverifiable. The row shows the new wording, and the old
  wording in brackets.
- **Framing**: rhetorical or interpretive wording, not a measurable claim. It is listed so you
  can judge it yourself.
- **Depiction**: a label that describes the film's own 3D model or simulated instrument rather
  than a historical record (see *Artistic licence* at the end).

---

## Narration (British narrator, `tools/narration.py`)

| Film time | Line | Status | Sources |
|---|---|---|---|
| 0:01.0 | "Every achievement begins as an idea." | Framing | — |
| 0:05.8 | "And some ideas change the world." | Framing | — |
| 0:11.2 | "In Athens and Rome, we learned proportion, engineering… and the citizen." | Framing (Greek proportion systems, Roman engineering, Athenian citizenship) | [Britannica: Classical architecture](https://www.britannica.com/art/classical-architecture) · [Britannica: Athenian democracy](https://www.britannica.com/topic/democracy/Classical-Greece) |
| 0:17.4 | "Then, power was made answerable to the people." | Framing (Cleisthenes 508/7 BC, Magna Carta 1215, Bill of Rights 1689; see Civic) | see chapter II |
| 0:22.2 | "The Renaissance. Artists became scientists." | Framing (e.g. Leonardo's anatomical and optical studies) | [Britannica: Leonardo da Vinci](https://www.britannica.com/biography/Leonardo-da-Vinci) |
| 0:28.6 | "Copernicus. Galileo. Newton. The universe became knowable." | Framing (works dated 1543 to 1687/1704, see chapter IV) | [Britannica: Scientific Revolution](https://www.britannica.com/science/Scientific-Revolution) |
| 0:34.9 | "Steam and steel multiplied our strength a thousandfold." | Framing (hyperbole: one large 19th-century mill engine delivered hundreds to thousands of horsepower, and a labourer sustains about 0.1 hp) | [Britannica: Steam engine](https://www.britannica.com/technology/steam-engine) |
| 0:40.3 | "Lightning, tamed, carried our voices across the oceans." | Correct (transatlantic radiotelephone service opened 7 January 1927) | [Britannica: telephone](https://www.britannica.com/technology/telephone) |
| 0:44.4 | "Medicine gave billions longer lives." | Correct (global life expectancy rose from about 32 years in 1900 to over 70 today) | [Our World in Data: Life expectancy](https://ourworldindata.org/life-expectancy) |
| 0:48.6 | "Within one lifetime… from wooden wings, to orbit." | Correct (Wright Flyer, wood and muslin, 17 Dec 1903 → Gagarin's orbit, 12 Apr 1961: 58 years) | [Smithsonian NASM: 1903 Wright Flyer](https://airandspace.si.edu/collection-objects/1903-wright-flyer/nasm_A19610048000) · [Britannica: Yuri Gagarin](https://www.britannica.com/biography/Yuri-Gagarin) |
| 0:53.6 | "Nineteen sixty-nine. America went to the Moon." | Correct (Apollo 11, July 1969) | [NASA: Apollo 11](https://www.nasa.gov/mission/apollo-11/) |
| 0:59.6 | "Machines that calculate… became machines that learn." | Framing | — |
| 1:05.1 | "From the printing press to the internet: knowledge, set free." | Framing (Gutenberg c. 1450s → internet) | [Britannica: Gutenberg](https://www.britannica.com/biography/Johannes-Gutenberg) |
| 1:09.4 | "From the Shuttle to Webb, America keeps reaching further." | Framing (Webb is NASA-led with ESA and CSA as partners; Hubble is a NASA/ESA project) | [NASA: Webb partners](https://science.nasa.gov/mission/webb/) |
| 1:13.9 | "And next… the first humans on Mars." | Framing (a stated NASA goal, not yet flown) | [NASA: Moon to Mars](https://www.nasa.gov/humans-in-space/humans-to-mars/) |
| 1:18.1 | "If I have seen further, it is by standing on the shoulders of giants." | Correct (Newton to Robert Hooke, letter dated 5 February 1675/6; original spelling "ye shoulders of Giants") | [Historical Society of Pennsylvania, item 9792](https://digitallibrary.hsp.org/index.php/detail/objects/9792) · [Wikipedia](https://en.wikipedia.org/wiki/Standing_on_the_shoulders_of_giants) |
| 1:26.7 | "From the agora to the Moon…" | Framing | — |
| 1:29.2 | "twenty-five centuries of reason, courage, and invention." | Correct (508/7 BC to AD 1969 is about 2,480 years) | — |
| 1:33.8 | "Ideas build upon ideas." | Framing | — |
| 1:41.3 | "The journey continues." | Framing | — |

## 0 · The Idea (0:00)

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "De architectura" | hand annotation, 0:02 | Correct (Vitruvius's treatise, 1st c. BC) | [Britannica: Vitruvius](https://www.britannica.com/biography/Vitruvius) |
| "1 : 1.618", φ | hand annotation, 0:02 | Correct (golden ratio φ = 1.6180339…) | [Britannica: golden ratio](https://www.britannica.com/science/golden-ratio) |
| "MODVLVS · I" | hand annotation | Correct (the module is Vitruvius's unit of proportion) | [Vitruvius IV.3 (LacusCurtius)](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/4*.html) |

## I · Classical Architecture (card 0:11.7 · "c. 500 BC — AD 400")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| Era "c. 500 BC — AD 400" | chapter card | Correct (approximate span of classical Greek and Roman building, e.g. Parthenon 447–432 BC to late Roman Empire) | [Britannica: Classical architecture](https://www.britannica.com/art/classical-architecture) |
| "Athens and Rome gave the world proportion, engineering and the citizen." | chapter card | Framing | as narration |
| "ABACUS · SQUARE SLAB · 1/6 D" [was "0.28 D"] | column callout, 0:11 | Fixed. Vitruvius: capital = 1 module (½ D), abacus = ⅓ of it, i.e. 1/6 of the diameter | [Vitruvius IV.3.4](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/4*.html) |
| "ECHINUS · CUSHION CAPITAL" | column callout | Correct | [Britannica: order (architecture)](https://www.britannica.com/technology/order-architecture) |
| "SHAFT · 20 FLUTES" | column callout | Correct (Vitruvius: Doric columns take twenty flutes) | [Vitruvius IV.3.9](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/4*.html) |
| "ENTASIS · TAPER" [was "ENTASIS 1/35", an unsourced ratio] | column callout | Fixed | [Vitruvius III.3.13 (entasis)](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/3*.html) |
| "ATTIC BASE · ROMAN DORIC · TORUS · SCOTIA" [was "TORUS · SCOTIA · PLINTH"] | column callout | Fixed. Greek Doric columns stand without a base; the modelled column has one, as Roman and Renaissance Doric often do | [Vitruvius III.5 (Attic base)](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/3*.html) · [Wikipedia: Doric order](https://en.wikipedia.org/wiki/Doric_order) |
| "H = 7 D" | temple overlay, 0:15.3 | Correct (Vitruvius: later Doric columns were seven diameters high) | [Vitruvius IV.1.8](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/4*.html) |
| "AXIAL SPACING · 2.4 D" [was "2.0 m · INTERCOLUMNIATION", a metre value of the model] | temple overlay | Fixed / Depiction (measured on the model, axis to axis) | — |
| "PEDIMENT · 13.7° · RAKING CORNICE" | temple overlay | Depiction (the model's roof pitch, atan 1.95/7.95) | — |
| "LOAD PATH · COMPRESSION · DEAD LOAD → STYLOBATE", "KEYSTONE · ARCH · THRUST LINE" | overlays | Correct (general structural principles) | [Britannica: arch](https://www.britannica.com/technology/arch-architecture) |
| "φ = 1.618" | overlay | Correct | as above |

## II · Democracy, Law & Institutions (card 0:18.0 · "508/7 BC · 1215 · 1689")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "508/7 BC" [was "507 BC"] | chapter card | Fixed (Cleisthenes' reforms are dated to the archon year 508/7 BC; both 508 and 507 appear in the literature) | [Britannica: Cleisthenes](https://www.britannica.com/biography/Cleisthenes-of-Athens) |
| "1215" | chapter card | Correct (Magna Carta, 15 June 1215) | [British Library: Magna Carta](https://www.bl.uk/magna-carta/articles/magna-carta-an-introduction) |
| "1689" | chapter card | Correct (Bill of Rights, December 1689) | [Britannica: Bill of Rights (British history)](https://www.britannica.com/topic/Bill-of-Rights-British-history) |
| "From the Athenian assembly to parliament: power answerable to the people." | chapter card | Framing | — |
| "PNYX · EKKLESIA · ASSEMBLY OF CITIZENS", "Ekklesia · the assembly of citizens" | callout / subtitle, 0:18 | Correct | [Britannica: ecclesia](https://www.britannica.com/topic/ecclesia-ancient-Greek-assembly) |
| "HEMICYCLE · REPRESENTATIVE ASSEMBLY" | callout | Correct (semicircular chamber layout) | [Wikipedia: Hemicycle](https://en.wikipedia.org/wiki/Hemicycle) |
| Latin on the parchment: "SI IN IVS VOCAT ITO", "NI IT ANTESTAMINO", "IGITVR EM CAPITO" | parchment texture | Correct (Twelve Tables, Table I.1) | [Avalon Project, Yale: Twelve Tables](https://avalon.law.yale.edu/ancient/twelve_tables.asp) |
| "SALVS POPVLI SVPREMA LEX ESTO" | parchment texture | Correct (Cicero, *De Legibus* III.8) | [Perseus: Cicero, De Legibus 3.8](https://www.perseus.tufts.edu/hopper/text?doc=Cic.+Leg.+3.8) |
| Other maxims (PACTA SVNT SERVANDA, AVDIATVR ET ALTERA PARS, DVRA LEX SED LEX, …) | parchment texture | Correct as Latin legal maxims. They are not all from the Twelve Tables (see *Artistic licence*) | [Wikipedia: Latin legal terms](https://en.wikipedia.org/wiki/List_of_legal_Latin_terms) |

## III · Art & the Renaissance (card 0:22.8 · "c. 1400 — 1600")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "c. 1400 — 1600" [was "1400 — 1600"] | chapter card | Fixed (a conventional, approximate span) | [Britannica: Renaissance](https://www.britannica.com/event/Renaissance) |
| "Vetruvio architecto mecte nella sua opera d'architectura" [was a modernised spelling] | handwriting on the sketch, 0:23 | Fixed (now follows Leonardo's own spelling on the Vitruvian Man sheet, Gallerie dell'Accademia, Venice) | [Wikipedia: Vitruvian Man (text transcription)](https://en.wikipedia.org/wiki/Vitruvian_Man) · [Oxford Cabinet](https://www.cabinet.ox.ac.uk/leonardo-da-vinci-vitruvian-man-c-1490) |
| "PROPORTIO · HOMO AD CIRCULUM ET QUADRATUM" | callout | Correct (Vitruvius III.1.3: the man in the circle and the square) | [Vitruvius III.1](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Vitruvius/3*.html) |
| "1 : 1.618 · SECTIO AUREA · OVERLAY" [was "UMBILICUS · SECTIO AUREA"] | callout | Fixed. The claim that the navel divides the figure in the golden ratio is a popular modern reading; neither Vitruvius nor Leonardo states it | [Britannica: golden ratio](https://www.britannica.com/science/golden-ratio) |
| "φ = 1.6180339…" | callout | Correct | as above |
| "PERSPECTIVA ARTIFICIALIS" | label | Correct (Renaissance term for linear perspective, Brunelleschi/Alberti) | [Britannica: linear perspective](https://www.britannica.com/art/linear-perspective) |

## IV · Scientific Revolution (card 0:29.1 · "1543 — 1704")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1543 — 1704" | chapter card | Correct (Copernicus, *De revolutionibus*, 1543 → Newton, *Opticks*, 1704) | [Britannica: Copernicus](https://www.britannica.com/biography/Nicolaus-Copernicus) · [Britannica: Isaac Newton](https://www.britannica.com/biography/Isaac-Newton) |
| "s = ½ g t²" · "GALILEO · DISCORSI · 1638" | equation + caption, 0:29.5 | Correct (law of fall in *Two New Sciences*, Leiden 1638; written here in modern notation) | [Britannica: Galileo](https://www.britannica.com/biography/Galileo-Galilei) |
| "t = 0.25 s …" ghost labels | fall sequence | Depiction (computed from the film's own fall curve) | — |
| "T² ∝ a³" · "KEPLER · HARMONICES MUNDI · 1619" | equation + caption | Correct (third law published 1619) | [Britannica: Kepler's laws](https://www.britannica.com/science/Keplers-laws-of-planetary-motion) |
| "F = G m₁m₂ / r²" · "NEWTON · PRINCIPIA MATHEMATICA · 1687" | equation + caption | Correct date; the formula is in modern notation. Newton stated the law in words and proportions (Book III); the constant G and this algebraic form came later | [Britannica: Newton's law of gravitation](https://www.britannica.com/science/Newtons-law-of-gravitation) |
| "n = sin θ₁ / sin θ₂" · "NEWTON · OPTICKS · 1704" | equation + caption, 0:33.3 | Correct (law of refraction, Snell 1621 / Descartes 1637, shown with Newton's prism work) | [Britannica: Snell's law](https://www.britannica.com/science/Snells-law) |
| "λ 700 nm" (red), "λ 400 nm" (violet) | spectrum labels | Correct (approximate ends of the visible spectrum) | [NASA: Visible light](https://science.nasa.gov/ems/09_visiblelight/) |
| Orrery axial tilts: Mercury 0.03°, Venus 177.4°, Earth 23.44°, Mars 25.19°, Jupiter 3.13°, Saturn 26.73°, Uranus 97.77°, Neptune 28.32°; Moon's axis 6.7° | orrery, 0:31 | Correct | [NASA Planetary Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) |
| Saturn's rings: D, C, B, Cassini Division, A (Encke and Keeler gaps), F at their true radii | orrery | Correct | [NASA Saturnian Rings Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html) |
| Uranus's rings | orrery | Imprecise (the narrow rings are drawn, but the α and β rings are missing and several radii are off by 1–2%) | [NASA Uranian Rings Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/uranringfact.html) |

## V · Industrial Revolution (card 0:35.3 · "1769 — 1900")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1769" | chapter card | Correct (James Watt's separate-condenser patent, No. 913, granted 5 January 1769) | [Science Museum blog: Watt and the separate condenser](https://blog.sciencemuseum.org.uk/james-watt-and-the-separate-condenser/) · [Patent No. 913 (Wikimedia Commons)](https://commons.wikimedia.org/wiki/File:James_Watt_Patent_1769_No_913.pdf) |
| "TWIN MILL ENGINE · 19TH C." [was "WATT · STEAM ENGINE · 1769"] | HUD, 0:38.6 | Fixed. The machine shown is a twin horizontal mill engine with a Lancashire boiler, not Watt's 1769 engine | [Britannica: steam engine](https://www.britannica.com/technology/steam-engine) |
| "LANCASHIRE BOILER · 1844" [was "60 RPM · 3.4 BAR · 40 HP", invented figures] | HUD | Fixed (Fairbairn and Hetherington patent, 1844) | [Britannica: Lancashire boiler](https://www.britannica.com/technology/Lancashire-boiler) · [Grace's Guide](https://www.gracesguide.co.uk/Lancashire_Boiler) |
| "INVOLUTE PROFILE · α 20° · Z 36 · MODULE 9 mm", "PINION · Z 14 · i 2.57 : 1" | gear callouts, 0:35 | Depiction (the modelled gears: 36 and 14 teeth, 36/14 = 2.57; 20° is today's standard pressure angle) | [Britannica: gear](https://www.britannica.com/technology/gear) |

## VI · Electricity & Communication (card 0:40.9 · "1831 — 1947")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1831" | chapter card | Correct (Faraday discovers electromagnetic induction) | [Britannica: Michael Faraday](https://www.britannica.com/biography/Michael-Faraday) |
| "TELEGRAPH · 1837" | caption, 0:40.7 | Correct (Morse's caveat and demonstrations; Cooke and Wheatstone patent, 1837) | [Library of Congress: Invention of the telegraph](https://www.loc.gov/collections/samuel-morse-papers/articles-and-essays/invention-of-the-telegraph/) |
| Morse tape reads "WHAT HATH GOD WROUGHT" | telegraph prop | Correct (first public line message, 24 May 1844) | [Library of Congress: Morse Papers](https://www.loc.gov/collections/samuel-morse-papers/) |
| "TELEPHONE · 1876" | caption, 0:41.7 | Correct (Bell's patent, 7 March 1876) | [Library of Congress: Bell Papers](https://www.loc.gov/collections/alexander-graham-bell-papers/) |
| Rotary dial letters (2 ABC … 9 WXY, 0 OPER) | telephone prop | Fixed (the letters sat one digit too low, ABC on 1) | [Wikipedia: Rotary dial](https://en.wikipedia.org/wiki/Rotary_dial) |
| "RADIO · 1895" | caption, 0:42.5 | Correct (Marconi's first wireless experiments) | [Nobel Prize: Marconi](https://www.nobelprize.org/prizes/physics/1909/marconi/biographical/) |
| "ELECTRONICS · 1947" | caption, 0:43.3 | Correct (point-contact transistor, Bell Labs, December 1947) | [Nobel Prize 1956](https://www.nobelprize.org/prizes/physics/1956/summary/) |
| "Lightning, tamed, carried the human voice across oceans." | chapter card | Correct (see narration) | — |

## VII · Medicine (card 0:45.1 · "1543 · 1796 · 1895 · 1928")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1543" · "DE HVMANI CORPORIS FABRICA" · "Basileae · MDXLIII" | card; engraving, 0:45.8 | Correct (Vesalius, printed in Basel by Oporinus, 1543) | [Library of Congress](https://www.loc.gov/item/2021667096/) · [Britannica](https://www.britannica.com/topic/De-humani-corporis-fabrica-libri-septem) |
| "Liber sextus · De corde et pulmone" [was "De corde, vitae principio", which is not Vesalius's title] | engraving | Fixed (Book VI of the *Fabrica* covers the heart and lungs; the line is a plain Latin description, not a quotation) | [Cambridge Core: Richardson translation of Book VI, "The heart and associated organs"](https://www.cambridge.org/core/journals/medical-history/article/andreas-vesalius-on-the-fabric-of-the-human-body-book-vi-the-heart-and-associated-organs-book-vii-the-brain-a-translation-of-de-humani-corporis-fabrica-libri-septem-by-william-frank-richardson-in-collaboration-with-john-burd-carman-novato-ca-norman-publishing-2009-pp-xx-413-illus-275-hardback-9780930405908/75FEF1F7B3C8B5F50972707CA364E9C4) |
| "1796 · SMALLPOX" (VACCINATION) | card; callout, 0:46.7 | Correct (Jenner's first vaccination, 14 May 1796) | [Britannica: Edward Jenner](https://www.britannica.com/biography/Edward-Jenner) |
| "1895 · X-RAY → MRI" (IMAGING) | card; callout | Correct (Röntgen discovers X-rays, 8 November 1895) | [Nobel Prize 1901](https://www.nobelprize.org/prizes/physics/1901/rontgen/facts/) |
| "1928" | chapter card | Correct (Fleming observes penicillin) | [Nobel Prize 1945](https://www.nobelprize.org/prizes/medicine/1945/fleming/facts/) |
| "1854 · PUBLIC HEALTH" (SANITATION) | callout | Correct (John Snow's Broad Street cholera investigation) | [UCLA: John Snow site](https://www.ph.ucla.edu/epi/snow.html) |
| "1958 · PACEMAKER" (MEDICAL TECHNOLOGY) | callout | Correct (first implanted pacemaker, Sweden, 8 October 1958) | [Heart Rhythm Society: Åke Senning](https://www.hrsonline.org/about-hrs/history/40th-anniversary/ake-senning-md/) |
| "Anatomy, vaccines and antibiotics gave billions longer lives." | chapter card | Correct (see narration) | [Our World in Data](https://ourworldindata.org/life-expectancy) |
| Labels A Aorta, B Vena cava, C Ventriculus, D Arteria pulmonalis, E Auricula | engraving | Correct anatomical terms | — |

## VIII · Flight & Space (card 0:49.2 · "1903 — 1961")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1903" | chapter card | Correct (Wright Flyer, Kitty Hawk, 17 December 1903) | [Smithsonian NASM](https://airandspace.si.edu/collection-objects/1903-wright-flyer/nasm_A19610048000) |
| "1961" | chapter card | Correct (Gagarin, Vostok 1, first human orbit, 12 April 1961) | [Britannica: Yuri Gagarin](https://www.britannica.com/biography/Yuri-Gagarin) |
| Blueprint: "SPAN 20.4 M", "LENGTH 16.8 M", "AIRFOIL 13% · DIHEDRAL 5°", "SCALE 1:48" | blueprint, 0:48.3 | Depiction (a generic 1930s-style twin-engine monoplane drawn from the film's model, not a named type) | — |
| Saturn V livery: "UNITED STATES" down one side of the first stage, "USA" on the other, flag above | rocket, 0:51.9 | Correct | NASA launch photographs of Apollo 11 ([NASA: Apollo 11](https://www.nasa.gov/mission/apollo-11/)) |

## IX · The Moonshot (0:54.8 · "1969")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "APOLLO 11 · UNITED STATES · JULY 1969" | caption, 0:53.9 | Correct | [NASA: Apollo 11](https://www.nasa.gov/mission/apollo-11/) |
| "TRANS-LUNAR COAST · FREE-RETURN TRAJECTORY · 384 400 KM" | caption | Correct (Apollo 11 was the last mission to fly a pure free return; 384,400 km is the mean Earth–Moon distance) | [NASA: Moon facts](https://science.nasa.gov/moon/facts/) · [Wikipedia: Free-return trajectory](https://en.wikipedia.org/wiki/Free-return_trajectory) |
| "LUNAR MODULE EAGLE · MARE TRANQUILLITATIS" | caption, 0:55 | Correct | [NASA Apollo 11 Lunar Surface Journal](https://history.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.html) |
| DSKY: PROG 63 → 64 → 66 → 68 | DSKY, 0:55 | Correct (braking, approach, manual landing, touchdown confirmation programs) | [Apollo Flight Journal: On-board computers](https://history.nasa.gov/afj/compessay.html) |
| DSKY: "PROGRAM ALARM 1202" shown as V05 N09, R1 1202 | DSKY | Correct (1202 executive-overflow alarms during the descent) | [NASA ALSJ: Program Alarms](https://www.nasa.gov/history/alsj/a11/a11.1201-pa.html) |
| DSKY registers "FWD VEL · ALT RATE · ALT" under Verb 06 Noun 60 [was ALT / ALT RATE / FWD VEL under Noun 63] | DSKY | Fixed (Noun 60 layout: R1 forward velocity, R2 altitude rate, R3 altitude). After touchdown the DSKY now shows V06 N43: latitude +000.67°, longitude +023.47°, which is Tranquility Base | [Apollo Flight Journal](https://history.nasa.gov/afj/compessay.html) · [Wikipedia: Tranquility Base, 0.67408° N 23.47297° E](https://en.wikipedia.org/wiki/Tranquility_Base) |
| "The Eagle has landed." | caption, 0:56.4 | Correct (Armstrong: "Houston, Tranquility Base here. The Eagle has landed.") | [NASA ALSJ: The First Lunar Landing](https://history.nasa.gov/alsj/a11/a11.landing.html) |
| "TRANQUILITY BASE · 20 JULY 1969 · 20:17 UTC" | caption | Correct (touchdown 20:17:40 UTC; NASA spells it "Tranquility") | [NASA ALSJ: Mission Summary](https://history.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.summary.html) |
| "ONE SMALL STEP" | caption, 0:57.2 | Correct (first step 21 July 1969, 02:56 UTC) | as above |
| US flag: 50 stars (rows of 6 and 5), 13 stripes, proportions per Executive Order 10834 | flag, LM decal | Correct (the 50-star flag dates from 4 July 1960) | [Executive Order 10834](https://www.archives.gov/federal-register/codification/executive-order/10834.html) |
| LM descent-stage "UNITED STATES" placard with flag | Eagle | Correct | NASA surface photographs ([ALSJ](https://history.nasa.gov/wp-content/uploads/static/history/alsj/a11/a11.html)) |
| Ticker: "1903 FLIGHT · 1947 TRANSISTOR · 1969 MOON · 1969 ARPANET · 1971 MICROPROCESSOR · TODAY AI" | ticker, 0:58.1 | Correct (ARPANET's first message, 29 Oct 1969; Intel 4004, Nov 1971) | [Computer History Museum: Internet history](https://www.computerhistory.org/internethistory/1960s/) · [Intel: 4004](https://www.intel.com/content/www/us/en/history/museum-story-of-intel-4004.html) |
| "THE AMERICAN CENTURY" | title | Framing (Henry Luce's 1941 phrase) | [Britannica: Henry Luce](https://www.britannica.com/biography/Henry-R-Luce) |

## X · Computing & Digital (card 1:00.3 · "1822 — TODAY")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "1822 · MECHANICAL CALCULATION · BABBAGE" | caption, 0:59.4 | Correct (Babbage proposes the Difference Engine, 1822) | [Computer History Museum: Babbage Engine](https://www.computerhistory.org/babbage/) |
| "1937 · RELAY ADDER · STIBITZ, BELL LABS" [was "ELECTROMECHANICAL RELAY · BELL LABS"] | caption, 1:00.3 | Fixed, more precise (Stibitz's "Model K" relay adder, November 1937) | [IEEE Computer Society: Stibitz](https://history.computer.org/pioneers/stibitz.html) |
| "1946 · VACUUM TUBE · ENIAC · PHILADELPHIA" | caption, 1:01.0 | Correct (unveiled at the University of Pennsylvania, February 1946) | [Britannica: ENIAC](https://www.britannica.com/technology/ENIAC) |
| "1947 · TRANSISTOR · BELL LABS" | caption, 1:01.7 | Correct | [Nobel Prize 1956](https://www.nobelprize.org/prizes/physics/1956/summary/) |
| "1971 · MICROPROCESSOR · SILICON VALLEY" | caption, 1:02.4 | Correct (Intel 4004, Santa Clara) | [Intel: 4004](https://www.intel.com/content/www/us/en/history/museum-story-of-intel-4004.html) |
| Chat card: "a small signal at the gate controls a much larger current. Billions of them … make a processor." | AI card, 1:03 | Correct (MOSFET principle; modern CPUs hold billions of transistors) | [Britannica: transistor](https://www.britannica.com/technology/transistor) |
| Coding card: `fib(10)` prints "55" | AI card | Correct | — |

## XI · Knowledge (card 1:05.9 · "c. 1450 — TODAY")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "c. 1450 — TODAY" [was "1450 — TODAY"] | chapter card | Fixed (Gutenberg's press is dated c. 1450; the Bible c. 1454–55) | [Britannica: Gutenberg](https://www.britannica.com/biography/Johannes-Gutenberg) |
| Title page "PRINCIPIA · Mathematica" [was "Mathematica Naturalis", a garbled title] · "LONDINI · MDCLXXXVII" · "Jussu Societatis Regiae" | page, 1:05 | Fixed. The true title is *Philosophiæ Naturalis Principia Mathematica*, London 1687, "by order of the Royal Society" | [Cambridge Digital Library: Newton's Principia](https://cudl.lib.cam.ac.uk/view/PR-ADV-B-00039-00001/1) |
| Running heads "DE MOTV CORPORVM", "DE REVOLVTIONIBVS", "OPTICKS", "DIALOGO", "ELEMENTORVM" | page headers | Correct titles (Newton, Copernicus, Newton, Galileo, Euclid) | — |
| "Bibliotheca universalis" | caption | Correct (Conrad Gessner's universal bibliography, 1545; used here as a caption) | [Wikipedia: Bibliotheca universalis](https://en.wikipedia.org/wiki/Bibliotheca_universalis) |

## XII · The New Frontier (card 1:10.1 · "1981 — 2026")

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "SPACE SHUTTLE · 1981" · "STS-1 · COLUMBIA · FIRST FLIGHT 12 APRIL 1981" | caption, 1:09.3 | Correct | [NASA: STS-1](https://www.nasa.gov/mission/sts-1/) |
| "HUBBLE · 1990" · "SPACE TELESCOPE · DEPLOYED FROM DISCOVERY · STS-31" | caption, 1:10.4 | Correct (launched 24 April 1990, deployed 25 April) | [NASA: STS-31](https://www.nasa.gov/mission/sts-31/) |
| "HUMAN GENOME · 2003" · "HUMAN GENOME PROJECT · COMPLETED APRIL 2003" [was "3 BILLION BASE PAIRS READ"] | caption, 1:11.5 | Fixed. The 2003 sequence covered about 92% of the ~3.1 billion bases; the gapless T2T sequence followed in 2022 | [NHGRI: Human Genome Project](https://www.genome.gov/human-genome-project) · [NHGRI: T2T 2022](https://www.genome.gov/about-genomics/telomere-to-telomere) |
| Genome helix pairs A–T, C–G | helix | Correct | — |
| "JAMES WEBB · 2021" · "18 GOLD SEGMENTS · 6.5 M PRIMARY · LAUNCHED 25 DEC 2021" | caption, 1:12.6 | Correct (model: 18 hexagonal segments, 3-4-4-4-3; five-layer sunshield) | [NASA: Webb's Mirrors](https://science.nasa.gov/mission/webb/webbs-mirrors/) · [NASA: Webb launch](https://science.nasa.gov/mission/webb/) |
| "MARS · PERSEVERANCE & INGENUITY · 2021" · "JEZERO CRATER · FIRST POWERED FLIGHT ON ANOTHER PLANET" | caption, 1:13.8 | Correct (landed 18 Feb 2021; NASA: "first powered, controlled flight on another planet") | [NASA: Ingenuity](https://science.nasa.gov/mission/mars-2020-perseverance/ingenuity-mars-helicopter/) |
| "INGENUITY · 1.8 KG" · "FIRST FLIGHT · 19 APRIL 2021" | callout | Correct | as above |
| "EARTH · AVG. 225 MILLION KM" [was "225 MILLION KM"] | callout | Fixed (NASA's average; the distance ranges from about 55 to 401 million km) | [NASA: Mars facts](https://science.nasa.gov/mars/facts/) |
| "ARTEMIS · RETURNING TO THE MOON" · "ARTEMIS II · CREWED LUNAR FLYBY · APRIL 2026" [was "CREWED LUNAR EXPLORATION PROGRAM"] | caption, 1:14.9 | Fixed, now specific (launched 1 April 2026, lunar flyby 6 April, splashdown 10 April) | [NASA: Artemis II](https://www.nasa.gov/mission/artemis-ii/) |
| "THE VISION · CREWED MISSIONS TO MARS · NOT YET FLOWN · THE GOAL FOR THE 2030s AND BEYOND" | caption, 1:15.8 | Correct (labelled as a goal) | [NASA: Moon to Mars](https://www.nasa.gov/humans-in-space/humans-to-mars/) |
| "THE VISION · FIRST FOOTSTEPS ON MARS", "A NEW HOME AMONG THE STARS" | captions | Framing (clearly labelled vision) | — |
| "EARTH · A BLUE STAR IN THE MARTIAN DAWN" | caption | Correct (from Mars, Earth appears as a bright morning or evening "star") | [NASA: Curiosity sees 'Evening Star' Earth](https://www.nasa.gov/solar-system/nasa-mars-rover-curiosity-sees-evening-star-earth/) |
| Orbiter "UNITED STATES" fuselage lettering and flag | Shuttle model | Correct | NASA STS-1 photographs ([NASA: STS-1](https://www.nasa.gov/mission/sts-1/)) |

## Legacy montage (1:17)

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "Standing on the shoulders of giants." · "NEWTON TO HOOKE · 1675/6" [was "ISAAC NEWTON · 1675"] | card, 1:17.6 | Fixed (letter dated 5 February 1675 Old Style, 1676 New Style) | [HSP item 9792](https://digitallibrary.hsp.org/index.php/detail/objects/9792) |
| "de divina proportione" | label | Correct (Luca Pacioli, Venice 1509, illustrated by Leonardo) | [Britannica: Luca Pacioli](https://www.britannica.com/biography/Luca-Pacioli) |
| "VAPOR · MDCCXII" | label | Correct (Newcomen's first working atmospheric engine, 1712) | [Britannica: Thomas Newcomen](https://www.britannica.com/biography/Thomas-Newcomen) |
| "F = G · m₁m₂ / r²" · "MODERN FORM · NEWTON, PRINCIPIA 1687" [was "PRINCIPIA MATHEMATICA · LIBER III · 1687"] | label | Fixed (G and this notation postdate the *Principia*) | [Britannica: Newton's law of gravitation](https://www.britannica.com/science/Newtons-law-of-gravitation) |
| "µP · 2300 T" | label | Correct (the Intel 4004 had about 2,300 transistors) | [Intel: 4004](https://www.intel.com/content/www/us/en/history/museum-story-of-intel-4004.html) |
| "72 BPM · SINUS RHYTHM" | label | Depiction (a typical resting heart rate) | — |

## Finale (1:24.7)

| Claim as shown | Where | Status | Sources |
|---|---|---|---|
| "From the agora to the Moon, twenty-five centuries of reason, courage and invention." | text, 1:26.8 | Correct (see narration) | — |
| "IDEAS BUILD UPON IDEAS." · "THE JOURNEY CONTINUES" | text | Framing | — |

---

## Artistic licence (stylisation, not factual claims)

- **Scale.** Orrery planet sizes, orbit radii and the Moon's distance are not to scale. The
  axial tilts and Saturn's ring divisions are real.
- **Anachronisms in the orrery.** The brass orrery in the 1543–1704 chapter shows all eight
  planets, including Uranus (discovered 1781) and Neptune (1846).
- **Surfaces.** Planets, the Moon, Mars terrain, Earth, clouds, marble, parchment and metals are
  procedural textures that approximate real surfaces (named features such as Olympus Mons or
  Mare Tranquillitatis sit at about their true positions). They are not photographs or survey
  data.
- **Documents are pastiches, not facsimiles.** The Vesalius engraving, the Principia pages and
  the Roman-law parchment are designed for the film. Their Latin body text (the heart
  description beside the *Fabrica* figure, the page paragraphs) is written for the film and
  is not a quotation. The parchment's "TABVLA" headings mix Twelve Tables clauses with later
  Latin maxims.
- **Model dimensions.** The labels "PEDIMENT 13.7°", "AXIAL SPACING 2.4 D", the gear tooth
  counts, the aircraft blueprint dimensions and "SHEET 1/4", "SCALE 1:48" describe the film's
  own 3D models, not a specific historical building or aircraft.
- **Simulated instruments.** The medical HUD (HR 120 on the music's beat, SpO₂ 98 %,
  perfusion 4.2 L/min, CT dose 1.1 mSv), the DSKY altitude and velocity counts, and the AI
  interface cards are illustrative readouts. On the DSKY the program sequence, the 1202 alarm
  and the landing-site coordinates are historical; the counting numbers are not flight data.
  The film uses the Noun 60 register layout throughout the descent, whereas Apollo 11 showed
  Noun 63 in P63 and Noun 64 in P64.
- **Representative objects.** The telephone is a 20th-century rotary desk set; its dial card
  "MAIN 1876" is a nod to Bell's patent year, not an 1876 instrument. The processor lid
  "µP · 64-BIT · 3 nm" is a generic modern chip, not the 1971 Intel 4004. The flight chapter's
  Saturn V (first flown 1967) and space-station assembly stand for the space age beyond 1961.
  The industrial chapter's engine is a generic 19th-century twin mill engine.
- **Golden-ratio overlays.** The φ grids over the temple, the column and the Vitruvian figure
  are a design device (now labelled "overlay" on the figure), not a claim that the builders or
  Leonardo used φ.
- **Framing words.** "The American Century", "America keeps reaching further" and "a
  thousandfold" are rhetorical framing. Many of the achievements shown drew on contributions
  from many civilizations and international partners (for example ESA and CSA on Webb, ESA on
  Hubble).
