// Scene registry: one module per timeline segment (src/scenes/<id>.js).
// A module that fails to load falls back to a labelled placeholder so the film always plays.
import { SEGMENTS } from '../timeline.js';
import * as placeholder from './placeholder.js';

// { only: id } (AR / VR Lite) loads just that chapter now; every other one is a loader the engine
// calls when that chapter is wanted (chapter by chapter, as playback reaches it).
const lazy = (id) => () => import(`./${id}.js`).catch((e) => { console.warn(`[scenes] ${id}: using placeholder`, e); return placeholder; });
export async function loadSceneModules({ only = '' } = {}) {
  const modules = {};
  await Promise.all(SEGMENTS.map(async (seg) => {
    if (only && seg.id !== only) { modules[seg.id] = lazy(seg.id); return; }
    try {
      modules[seg.id] = await import(`./${seg.id}.js`);
    } catch (e) {
      console.warn(`[scenes] ${seg.id}: using placeholder`, e);
      modules[seg.id] = placeholder;
    }
  }));
  return modules;
}
