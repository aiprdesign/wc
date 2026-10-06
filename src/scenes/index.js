// Scene registry: one module per timeline segment: src/scenes/<id>.js for the Western film,
// src/scenes/india/<id>.js for the Indian one (a segment's `scene` names a shared module instead).
// A module that fails to load falls back to a labelled placeholder so the film always plays.
import { SEGMENTS } from '../timeline.js';
import { FILM } from '../film.js';
import * as placeholder from './placeholder.js';

// { only: id } (AR / VR Lite) loads just that chapter now; every other one is a loader the engine
// calls when that chapter is wanted (chapter by chapter, as playback reaches it).
const path = (seg) => seg.scene ?? `${FILM.sceneDir}/${seg.id}.js`;
const lazy = (seg) => () => import(path(seg)).catch((e) => { console.warn(`[scenes] ${seg.id}: using placeholder`, e); return placeholder; });
export async function loadSceneModules({ only = '' } = {}) {
  const modules = {};
  await Promise.all(SEGMENTS.map(async (seg) => {
    if (only && seg.id !== only) { modules[seg.id] = lazy(seg); return; }
    try {
      modules[seg.id] = await import(path(seg));
    } catch (e) {
      console.warn(`[scenes] ${seg.id}: using placeholder`, e);
      modules[seg.id] = placeholder;
    }
  }));
  return modules;
}
