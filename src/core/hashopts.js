// Address-fragment options. Embedded viewers (the claude.ai artifact iframe) deliver only the
// hash, so options travel there: `#experience` opens Experience mode, and it combines with a
// frame format as `#square&experience`, `#9x16&experience` (also `+` or `,` as separators).
// timeline.js reads the format from the hash as a single token, so this module (imported first by
// main.js) narrows the fragment to the format token while the modules evaluate; main.js then
// puts the full fragment back with restoreHash(). ?experience works too on a normal server.
// `#vr` / `#ar` (also combined, `#experience&vr`) put the headset / tabletop button forward on the
// start screen; a tap still starts the session (browsers only open one from a user gesture).
const raw = (globalThis.location?.hash ?? '').slice(1);
const tokens = raw.toLowerCase().split(/[&+,]/).filter(Boolean);
import { LOOK_IDS } from '../lib/theme.js';
const OPTIONS = new Set(['experience', 'vr', 'ar', ...LOOK_IDS]);   // look names (#silver …) are options too

export const HASH_EXPERIENCE = tokens.includes('experience') || new URLSearchParams(globalThis.location?.search ?? '').has('experience');
const has = (k) => tokens.includes(k) || new URLSearchParams(globalThis.location?.search ?? '').has(k);
export const HASH_XR = has('vr') ? 'vr' : has('ar') ? 'ar' : '';
export const HASH_FORMAT = tokens.find((t) => !OPTIONS.has(t)) ?? '';

let narrowed = false;
if (tokens.length > 1) {
  try { history.replaceState(history.state, '', `#${HASH_FORMAT}`); narrowed = true; } catch { /* sandboxed: the format falls back */ }
}

export function restoreHash() {
  if (!narrowed) return;
  narrowed = false;
  try { history.replaceState(history.state, '', `#${raw}`); } catch { /* ignore */ }
}

// Reflect Experience mode in the address (no reload: replaceState fires no hashchange), so a
// reload or a shared link comes back to it.
export function setHashExperience(on) {
  try {
    const cur = location.hash.slice(1).split(/[&+,]/).filter((t) => t && t.toLowerCase() !== 'experience');
    if (on) cur.push('experience');
    const h = cur.join('&');
    history.replaceState(history.state, '', h ? `#${h}` : location.pathname + location.search);
  } catch { /* ignore */ }
}
