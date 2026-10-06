// Address-fragment options. Embedded viewers (the claude.ai artifact iframe) deliver only the
// hash, so options travel there: `#experience` opens Experience mode, and it combines with a
// frame format as `#square&experience`, `#9x16&experience` (also `+` or `,` as separators).
// timeline.js reads the format from the hash as a single token, so this module (imported first by
// main.js) narrows the fragment to the format token while the modules evaluate; main.js then
// puts the full fragment back with restoreHash(). ?experience works too on a normal server.
// `#vr` / `#ar` (also combined, `#experience&vr`) put the headset / tabletop button forward on the
// start screen; a tap still starts the session (browsers only open one from a user gesture).
import { FILM, FILMS } from '../film.js';

const raw = (globalThis.location?.hash ?? '').slice(1);
const tokens = raw.toLowerCase().split(/[&+,]/).filter(Boolean);
// `#arlite` (AR Lite, for phones): only one chapter is built, so it loads where the whole film
// can't; `#arlite&classical` names the chapter (otherwise the start screen offers a picker).
// The chapter ids are the film's own (src/films/<id>.js through film.js, which reads the full fragment
// before this module narrows it). `#india` picks the film (film.js).
export const CHAPTERS = FILM.SEGMENTS.map((s) => s.id);
const OPTIONS = new Set(['experience', 'vr', 'ar', 'arlite', ...Object.keys(FILMS), ...CHAPTERS]);

export const HASH_EXPERIENCE = tokens.includes('experience') || new URLSearchParams(globalThis.location?.search ?? '').has('experience');
const has = (k) => tokens.includes(k) || new URLSearchParams(globalThis.location?.search ?? '').has(k);
export const HASH_ARLITE = has('arlite');
export const HASH_XR = has('vr') ? 'vr' : has('ar') || HASH_ARLITE ? 'ar' : '';
export const HASH_CHAPTER = tokens.find((t) => CHAPTERS.includes(t)) ?? (CHAPTERS.includes(new URLSearchParams(globalThis.location?.search ?? '').get('arlite')) ? new URLSearchParams(globalThis.location.search).get('arlite') : '');
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
