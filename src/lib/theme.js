// LOOKS: colour schemes the viewer can pick. Each one is a final colour grade (applied after the
// film's own tone mapping and harmony, so every scene keeps its lighting) plus a matching finish for
// the 3D chapter headings. Chosen with a hash token (#silver, #square&noir …), ?look=, or the look
// buttons on the start screen; remembered on this device.
//   grade: sat (1 = unchanged), shadow / high (multiplicative tints by luminance), contrast (S-curve
//          amount on top of the film's), amt (0 = the original grade, untouched)
//   heading: metal colour, inner glow colour, shine tint
export const LOOKS = {
  gold:   { label: 'Gold',          grade: { amt: 0 },
            heading: { color: '#e9b964', glow: '#ffb85a', light: '#ffcf8a' } },
  silver: { label: 'Silver',        grade: { amt: 1, sat: 0.28, shadow: [0.9, 0.95, 1.06], high: [1.0, 1.0, 1.03], contrast: 0.06 },
            heading: { color: '#d9dde3', glow: '#bcd4ff', light: '#e8f0ff' } },
  noir:   { label: 'Noir',          grade: { amt: 1, sat: 0.0, shadow: [0.92, 0.92, 0.92], high: [1.04, 1.04, 1.04], contrast: 0.22 },
            heading: { color: '#f0f0f0', glow: '#ffffff', light: '#ffffff' } },
  sepia:  { label: 'Sepia',         grade: { amt: 1, sat: 0.0, shadow: [0.9, 0.66, 0.4], high: [1.16, 1.0, 0.74], contrast: 0.1 },
            heading: { color: '#c08a52', glow: '#ff9a4a', light: '#ffc58a' } },
  teal:   { label: 'Teal & Orange', grade: { amt: 1, sat: 1.12, shadow: [0.78, 0.98, 1.12], high: [1.12, 1.0, 0.86], contrast: 0.1 },
            heading: { color: '#f0a85a', glow: '#ff9a40', light: '#ffd0a0' } },
  rose:   { label: 'Rose gold',     grade: { amt: 1, sat: 0.9, shadow: [0.98, 0.9, 0.92], high: [1.07, 0.97, 0.95], contrast: 0.04 },
            heading: { color: '#e8a890', glow: '#ff9c8a', light: '#ffd2c4' } },
};
export const LOOK_IDS = Object.keys(LOOKS);

const KEY = 'awc-look';
function pick() {
  try {
    const tokens = (globalThis.location?.hash ?? '').slice(1).toLowerCase().split(/[&+,]/);
    const fromHash = tokens.find((t) => LOOKS[t]);
    if (fromHash) return fromHash;
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('look');
    if (q && LOOKS[q]) return q;
    const saved = globalThis.localStorage?.getItem(KEY);
    if (saved && LOOKS[saved]) return saved;
  } catch { /* storage blocked */ }
  return 'gold';
}
export const LOOK_ID = pick();
export const LOOK = LOOKS[LOOK_ID];

// Switch looks: remember it and reload (the headings' materials are built once at start-up).
export function setLook(id) {
  if (!LOOKS[id]) return;
  try { globalThis.localStorage?.setItem(KEY, id); } catch { /* ignore */ }
  const tokens = location.hash.slice(1).split(/[&+,]/).filter((t) => t && !LOOKS[t.toLowerCase()]);
  if (id !== 'gold') tokens.push(id);
  const h = tokens.join('&');
  if (`#${h}` === location.hash || (!h && !location.hash)) location.reload();
  else location.hash = h;   // main.js reloads on hashchange
}
