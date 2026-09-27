// Beat grid shared with the score (BPM 120). Pure functions of global time T,
// so "sound-reactive" animation stays perfectly in sync even when rendering offline.
import { BEAT } from '../timeline.js';

export const beatIndex = (T, div = 1) => Math.floor(T / (BEAT / div));
export const beatPhase = (T, div = 1) => { const p = T / (BEAT / div); return p - Math.floor(p); };

// 1 on every beat (or subdivision), decaying exponentially until the next one.
export function pulse(T, { div = 1, decay = 7, offset = 0 } = {}) {
  const len = BEAT / div;
  let x = (T - offset) / len;
  if (x < 0) return 0;
  x -= Math.floor(x);
  return Math.exp(-decay * x * len * 4);
}

// Smooth "breathing" in time with the bar (0..1).
export const barSine = (T, bars = 1) => 0.5 - 0.5 * Math.cos((T / (BEAT * 4 * bars)) * Math.PI * 2);
