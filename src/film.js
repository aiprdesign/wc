// Which film this page plays. Two films share one engine: 'western' ("Achievements of Western
// Civilization", the default) and 'india' ("Achievements of Indian Civilization").
// Chosen by #india in the address (it survives embedded viewers, which pass only the hash; it combines
// with the other tokens: #india&9x16, #india&arlite), ?film=india, or globalThis.__FILM (tools that load
// the score without the page). Pure: no three.js, no DOM beyond location.
import western from './films/western.js';
import india from './films/india.js';

export const FILMS = { western, india };

export const FILM_ID = (() => {
  try {
    if (globalThis.__FILM && FILMS[globalThis.__FILM]) return globalThis.__FILM;
    const tokens = (globalThis.location?.hash ?? '').slice(1).toLowerCase().split(/[&+,]/);
    const hit = tokens.find((t) => FILMS[t]);
    if (hit) return hit;
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('film');
    return FILMS[q] ? q : 'western';
  } catch { return 'western'; }
})();

export const FILM = FILMS[FILM_ID];
// the address token for this film ('' for the default), to keep it in links the page builds
export const FILM_TOKEN = FILM_ID === 'western' ? '' : FILM_ID;
// prefix a hash fragment with this film's token: filmHash('9x16') → 'india&9x16'
export const filmHash = (rest = '') => [FILM_TOKEN, rest].filter(Boolean).join('&');
