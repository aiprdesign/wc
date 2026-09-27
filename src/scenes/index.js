// Scene registry: one module per timeline segment (src/scenes/<id>.js).
// A module that fails to load falls back to a labelled placeholder so the film always plays.
import { SEGMENTS } from '../timeline.js';
import * as placeholder from './placeholder.js';

export async function loadSceneModules() {
  const modules = {};
  await Promise.all(SEGMENTS.map(async (seg) => {
    try {
      modules[seg.id] = await import(`./${seg.id}.js`);
    } catch (e) {
      console.warn(`[scenes] ${seg.id}: using placeholder`, e);
      modules[seg.id] = placeholder;
    }
  }));
  return modules;
}
