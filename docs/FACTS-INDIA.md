# Fact sheet: Achievements of Indian Civilization

This sheet lists the factual claims the viewer hears (narration) or reads (chapter cards and
on-screen captions) in *Achievements of Indian Civilization*, with sources. As in
`docs/FACTS.md` (the Western film), Wikipedia links are convenient pointers only; institutional
and scholarly sources are listed first where they exist.

**Film time** is the playback time in the 1:48 film (story seconds × 100/72, see
`src/timeline.js`; the Indian film's timeline is `src/films/india.js`).

**Status**: **Correct** (checked) · **Framing** (rhetorical wording, not a measurable claim) ·
**Depiction** (a label on the film's own 3D model) · **Debated** (scholars disagree; the film's
wording is chosen to stay inside the range they give).

**Balance.** Each chapter card ends with a line on exchange: what India learned from others and
where its ideas travelled (Babylonian and Maya placeholders before zero, Greek astronomy in India,
al-Khwarizmi and Fibonacci carrying the numerals west, Persian masters at the Taj Mahal, the
American Nike-Apache that was India's first rocket, the Soviet launch of India's first satellite).

---

## Narration (British narrator, `tools/narration.py india`)

| Film time | Line | Status | Sources |
|---|---|---|---|
| 0:01.0 | "Every achievement begins as an idea." | Framing | — |
| 0:05.8 | "And some ideas change the world." | Framing | — |
| 0:11.3 | "On the Indus, more than four thousand years ago, cities rose on a grid." | Correct (mature Harappan phase c. 2600–1900 BC; Mohenjo-daro's streets on a near-orthogonal grid) | [Britannica: Indus civilization](https://www.britannica.com/topic/Indus-civilization) · [UNESCO: Mohenjo-daro](https://whc.unesco.org/en/list/138/) |
| 0:17.4 | "Panini wrote down the rules of language itself." | Framing (the Ashtadhyayi, a complete generative grammar of Sanskrit) | [Britannica: Panini](https://www.britannica.com/biography/Panini-Indian-grammarian) |
| 0:22.2 | "Then came zero, and the digits the whole world uses." | Correct (decimal place value with a zero, from India via the Arab world: "Hindu–Arabic numerals") | [Britannica: Hindu-Arabic numerals](https://www.britannica.com/topic/Hindu-Arabic-numerals) |
| 0:28.6 | "Aryabhata taught that the Earth turns on its axis." | Correct (Aryabhatiya, AD 499) | [Britannica: Aryabhata](https://www.britannica.com/biography/Aryabhata-I) |
| 0:34.9 | "Indian smiths made steel the world desired." | Correct (wootz crucible steel, traded west as the raw material of "Damascus" blades) | [Britannica: Damascus steel](https://www.britannica.com/technology/Damascus-steel) · Srinivasan & Ranganathan, *India's Legendary Wootz Steel* (IISc/NIAS, 2004) |
| 0:40.3 | "Sushruta's surgeons learned to rebuild a nose." | Correct (the cheek-flap nasal reconstruction of the Sushruta Samhita) | [Britannica: Sushruta](https://www.britannica.com/biography/Sushruta) · Champaneria et al., *J. Craniofacial Surgery* 25 (2014), "Sushruta: father of plastic surgery" |
| 0:44.4 | "Whole temples were carved from living rock." | Correct (Kailasa temple, Ellora Cave 16, 8th c., excavated top-down from one rock) | [UNESCO: Ellora Caves](https://whc.unesco.org/en/list/243/) |
| 0:48.6 | "At Nalanda, scholars came from across Asia to learn." | Correct (students from China, Korea, Tibet, Central and Southeast Asia; Xuanzang, 7th c.) | [UNESCO: Nalanda Mahavihara](https://whc.unesco.org/en/list/1502/) |
| 0:53.6 | "From Ashoka to Gandhi: the power of peace." | Framing (Ashoka's edicts after the Kalinga war, c. 260 BC; Gandhi's nonviolent independence movement) | [Britannica: Ashoka](https://www.britannica.com/biography/Ashoka) · [Britannica: Mahatma Gandhi](https://www.britannica.com/biography/Mahatma-Gandhi) |
| 0:59.6 | "Cotton, chess and yoga: gifts to every continent." | Correct (cotton cultivated in South Asia since at least the 5th millennium BC; chess from chaturanga, India, c. 6th c. AD; yoga) | [Britannica: Cotton](https://www.britannica.com/topic/cotton-fibre-and-plant) · [Britannica: Chess, history](https://www.britannica.com/topic/chess/History) · [UNESCO: Yoga](https://ich.unesco.org/en/RL/yoga-01163) |
| 1:05.1 | "Ramanujan. Raman. Bose. The modern mind." | Framing (see chapter XI) | — |
| 1:09.4 | "Then India reached for space." | Framing (ISRO, founded 1969; first rocket from Thumba 1963) | [ISRO](https://www.isro.gov.in/) |
| 1:13.9 | "Mars at the first attempt… and the Moon's south pole." | Correct (Mars Orbiter Mission entered Mars orbit 24 Sept 2014, the first nation to do so on its first attempt; Chandrayaan-3 landed near the lunar south pole, 23 Aug 2023, the first landing in that region) | [ISRO](https://www.isro.gov.in/) · [Wikipedia: Mars Orbiter Mission](https://en.wikipedia.org/wiki/Mars_Orbiter_Mission) · [Wikipedia: Chandrayaan-3](https://en.wikipedia.org/wiki/Chandrayaan-3) |
| 1:18.1 | "The world is one family." | Correct (Vasudhaiva Kutumbakam, Maha Upanishad 6.71–75) | [Wikipedia: Vasudhaiva Kutumbakam](https://en.wikipedia.org/wiki/Vasudhaiva_Kutumbakam) |
| 1:26.7 | "From the Indus to the Moon… five thousand years of curiosity, craft, and discovery." | Framing (early Harappan phase from c. 3300 BC) | [Britannica: Indus civilization](https://www.britannica.com/topic/Indus-civilization) |
| 1:33.8 | "Ideas build upon ideas." | Framing | — |
| 1:41.3 | "The journey continues." | Framing | — |

## Chapter cards (`src/films/india.js` CHAPTERS)

| # | Era · heading | Story line · exchange line | Status | Sources |
|---|---|---|---|---|
| I | c. 2600 — 1900 BC · THE FIRST CITIES | Mohenjo-daro and Harappa: streets on a grid, covered drains, standard weights. · Roots: farming villages like Mehrgarh, c. 7000 BC · trade with Mesopotamia | Correct (Mehrgarh from c. 7000 BC; Indus goods and seals found in Mesopotamia, where the Indus region is probably "Meluhha") | [Britannica: Indus civilization](https://www.britannica.com/topic/Indus-civilization) · [Wikipedia: Mehrgarh](https://en.wikipedia.org/wiki/Mehrgarh) · [Met Museum: Art of the Harappan civilization](https://www.metmuseum.org/toah/hd/indu/hd_indu.htm) |
| II | c. 4TH CENTURY BC · THE SCIENCE OF LANGUAGE | Panini set out the whole grammar of Sanskrit in about 4,000 short rules. · Also Tamil Sangam poetry · Brahmi, the parent of scripts across Asia | Debated date (Panini is placed between the 6th and 4th c. BC; the card uses the most common estimate); about 3,959 sutras; Brahmi is the ancestor of most South and Southeast Asian scripts; Sangam literature c. 300 BC – AD 300 | [Britannica: Panini](https://www.britannica.com/biography/Panini-Indian-grammarian) · [Wikipedia: Brahmi script](https://en.wikipedia.org/wiki/Brahmi_script) · [Britannica: Tamil literature](https://www.britannica.com/art/Tamil-literature) |
| III | AD 628 · THE POWER OF ZERO | Brahmagupta gave zero its rules: ten digits could now write any number. · Exchange: Babylon and the Maya had placeholders · on via al-Khwarizmi, c. 825, to Europe | Correct (Brahmasphutasiddhanta, 628: first rules of arithmetic with zero; Babylonian placeholder sign; Maya zero; al-Khwarizmi's treatise on Indian numerals c. 825; Fibonacci's Liber Abaci 1202) | [Britannica: Brahmagupta](https://www.britannica.com/biography/Brahmagupta) · [Britannica: zero](https://www.britannica.com/science/zero-mathematics) · [MacTutor: Indian numerals](https://mathshistory.st-andrews.ac.uk/HistTopics/Indian_numerals/) |
| IV | 499 · 1734 · THE MEASURE OF THE SKY | Aryabhata, at 23: the Earth turns on its axis, and π is close to 3.1416. · Exchange: Greek astronomy reached India · Indian tables were translated in Baghdad | Correct (Aryabhatiya, 499, written at 23; π ≈ 62832/20000; Greek influence e.g. Yavanajataka, Paulisa Siddhanta; Brahmagupta's work translated in Baghdad c. 770s as Zij al-Sindhind; Jantar Mantar, Jaipur, completed 1734) | [MacTutor: Aryabhata](https://mathshistory.st-andrews.ac.uk/Biographies/Aryabhata_I/) · [UNESCO: Jantar Mantar, Jaipur](https://whc.unesco.org/en/list/1338/) |
| V | c. 300 BC — AD 400 · THE MASTERY OF METAL | Crucible steel, and an iron pillar that has stood 1,600 years with barely a trace of rust. · Exchange: wootz ingots forged into Damascus blades · zinc distilled at Zawar | Correct (crucible steel in South India from around the 3rd c. BC; Delhi Iron Pillar c. AD 400, protected by a passive "misawite" film; Zawar zinc distillation from about the 9th c. AD, centuries before Europe) | Balasubramaniam, *Current Science* 78 (2000), "On the corrosion resistance of the Delhi iron pillar" · [Britannica: Damascus steel](https://www.britannica.com/technology/Damascus-steel) · Craddock et al., *Indian Journal of History of Science* (1985), zinc at Zawar |
| VI | SUSHRUTA SAMHITA · THE HEALING HAND | Sushruta described more than a hundred instruments, and how to rebuild a nose. · Also Charaka's medicine · the 'Indian method' of rhinoplasty reached London, 1794 | Correct (121 instruments, 300+ procedures; the text was composed over the 1st millennium BC to c. AD 500, so no single date is shown; the 1794 *Gentleman's Magazine* letter led to Carpue's operations, 1814) | [Britannica: Sushruta](https://www.britannica.com/biography/Sushruta) · [Wikipedia: Charaka Samhita](https://en.wikipedia.org/wiki/Charaka_Samhita) · Rana & Arora, *Plastic and Reconstructive Surgery* 109 (2002), "History of plastic surgery in India" |
| VII | 3RD C. BC — AD 1653 · STONE AND SPIRIT | From Sanchi to Ellora, where a whole temple was carved down from one rock. · Also the Taj Mahal, 1632–1653, raised with Persian and Central Asian masters | Correct (the Great Stupa at Sanchi begun under Ashoka, 3rd c. BC; Kailasa, Ellora, 8th c.; Taj Mahal 1632–1653, chief architect probably Ustad Ahmad Lahori) | [UNESCO: Sanchi](https://whc.unesco.org/en/list/524/) · [UNESCO: Ellora](https://whc.unesco.org/en/list/243/) · [UNESCO: Taj Mahal](https://whc.unesco.org/en/list/252/) |
| VIII | c. AD 427 — 1200 · THE FIRST UNIVERSITIES | For eight centuries Nalanda drew thousands of students from across Asia. · Earlier: Takshashila · Xuanzang came from China to study there in the 630s | Correct (UNESCO: "the most ancient university of the Indian subcontinent", 5th c. BC… 13th c. AD activity; founded under the Guptas, 5th c. AD; Xuanzang studied there in the 630s) | [UNESCO: Nalanda Mahavihara](https://whc.unesco.org/en/list/1502/) · [UNESCO: Taxila](https://whc.unesco.org/en/list/139/) |
| IX | c. 260 BC · 1947 · 1950 · THE PATH OF PEACE | From Ashoka to Gandhi: the idea that nonviolence can change the world. · Buddhism spread across Asia · Gandhi's nonviolence inspired Martin Luther King Jr. | Correct (Kalinga war c. 261 BC and the edicts after it; independence 15 Aug 1947; Constitution in force 26 Jan 1950; King credited Gandhi's method) | [Britannica: Ashoka](https://www.britannica.com/biography/Ashoka) · [Stanford King Institute: Gandhi](https://kinginstitute.stanford.edu/gandhi-mohandas-k) |
| X | c. 5000 BC — TODAY · GIFTS TO THE WORLD | Cotton cloth, indigo, chess and yoga travelled from India to every continent. · Exchange: chess went on through Persia as shatranj · indigo is named for India | Correct (cotton at Mehrgarh, 6th–5th millennium BC; "indigo" from Greek *indikon*, "from India"; chaturanga → Persian shatranj → Europe) | [Britannica: indigo](https://www.britannica.com/technology/indigo-dye) · [Britannica: Chess, history](https://www.britannica.com/topic/chess/History) · Moulherat et al., *J. Archaeological Science* 29 (2002), cotton at Mehrgarh |
| XI | 1913 — 1930 · THE MODERN MIND | Ramanujan, Raman and Bose: new mathematics and new physics. · Ramanujan worked with G. H. Hardy at Cambridge · bosons are named after S. N. Bose | Correct (Ramanujan's letter to Hardy, 1913; Bose statistics, 1924; the Raman effect, 1928, Nobel Prize 1930) | [Nobel Prize: C. V. Raman](https://www.nobelprize.org/prizes/physics/1930/raman/facts/) · [MacTutor: Ramanujan](https://mathshistory.st-andrews.ac.uk/Biographies/Ramanujan/) · [Britannica: Satyendra Nath Bose](https://www.britannica.com/biography/Satyendra-Nath-Bose) |
| XII | 1963 — 2023 · TO THE MOON AND MARS | Mars orbit at the first attempt; then a landing near the Moon's south pole. · Roots: first rocket from Thumba, 1963, an American Nike-Apache · first satellite launched by the USSR, 1975 | Correct (Nike-Apache from Thumba, 21 Nov 1963; Aryabhata launched on a Soviet Kosmos-3M, 19 Apr 1975; MOM 2014; Chandrayaan-3 2023) | [Wikipedia: Thumba Equatorial Rocket Launching Station](https://en.wikipedia.org/wiki/Thumba_Equatorial_Rocket_Launching_Station) · [Wikipedia: Aryabhata (satellite)](https://en.wikipedia.org/wiki/Aryabhata_(satellite)) · [Wikipedia: Chandrayaan-3](https://en.wikipedia.org/wiki/Chandrayaan-3) |

## Interludes and titles

| Text | Status | Sources |
|---|---|---|
| "Every achievement begins as an idea." | Framing | — |
| "The world is one family." — VASUDHAIVA KUTUMBAKAM · MAHA UPANISHAD | Correct (Maha Upanishad 6.71–75) | [Wikipedia: Vasudhaiva Kutumbakam](https://en.wikipedia.org/wiki/Vasudhaiva_Kutumbakam) |
| "Five thousand years of ideas" (subtitle) | Framing (early Harappan phase from c. 3300 BC) | [Britannica: Indus civilization](https://www.britannica.com/topic/Indus-civilization) |
| Opening drawing: "Sulba Sutra" · "√2 = 577 / 408" | Correct (Baudhayana Sulba Sutra's approximation of √2 = 1 + 1/3 + 1/(3·4) − 1/(3·4·34) = 577/408) | [MacTutor: Indian Sulbasutras](https://mathshistory.st-andrews.ac.uk/HistTopics/Indian_sulbasutras/) |
| "Shared with the whole world" (end title) | Framing | — |

## On-screen captions inside the chapters

<!-- filled in from the chapter scenes (src/scenes/india/*.js) -->
