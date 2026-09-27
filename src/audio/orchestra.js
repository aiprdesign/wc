// Orchestra: ensemble strings, low brass, horns and a wordless choir, plus the
// trailer "BRAAM".
//
// Big sections need many slightly detuned players per note. Rather than running
// dozens of oscillators, each timbre is rendered once in JS into a seamless
// 3-second stereo loop that already contains a whole section (5–7 detuned,
// vibrato'd, gently drifting players spread across the stereo field). Loops are
// cached every few semitones and transposed with playbackRate, so a sustained
// 7-note chord costs 7 buffer sources + one filter + one gain.
//
// Seamless loops: every player's frequency, vibrato rate and drift rate is
// rounded to a whole number of cycles per loop, so the phase returns exactly.

import { hz, ahr, perc } from './core.js';

const LOOP = 3;          // seconds per ensemble loop
const TABLE = 2048;      // single-cycle wavetable size
const BASE_STEP = 5;     // loops are rendered every 5 semitones (transpose ≤ ±2.5 st)

// Vowel formants: [frequency, bandwidth, gain]
const VOWEL_A = [[750, 110, 1], [1150, 130, 0.55], [2600, 180, 0.22], [3300, 250, 0.08]];
const VOWEL_O = [[420, 90, 1], [820, 110, 0.45], [2500, 200, 0.12], [3200, 260, 0.05]];
const formant = (f, vowel) => 0.015 + vowel.reduce((s, [F, bw, g]) => s + g / (1 + ((f - F) / bw) ** 2), 0);

// Section timbres. amps(k, f) = amplitude of harmonic k (frequency f).
const KINDS = {
  strings: {
    voices: 6, detune: 12, spread: 0.95, vib: [4.6, 5.8], vibCents: 9, drift: 0.2, cap: 7500,
    amps: (k, f) => (1 / k) * (1 + 0.8 / (1 + ((f - 2800) / 900) ** 2)) / (1 + (f / 6500) ** 2),
  },
  brass: {
    voices: 4, detune: 8, spread: 0.55, vib: [4.4, 5.0], vibCents: 3, drift: 0.1, cap: 7000,
    amps: (k) => (k % 2 ? 1 : 0.8) / k ** 0.8,
  },
  horn: {
    voices: 4, detune: 6, spread: 0.5, vib: [4.8, 5.4], vibCents: 5, drift: 0.12, cap: 4000,
    amps: (k, f) => 1 / k ** 1.25 / (1 + (f / 1800) ** 2),
  },
  choirA: {
    voices: 6, detune: 13, spread: 1, vib: [4.9, 5.9], vibCents: 22, drift: 0.28, cap: 6000,
    amps: (k, f) => k ** -0.7 * formant(f, VOWEL_A),
  },
  choirO: {
    voices: 6, detune: 13, spread: 1, vib: [4.9, 5.9], vibCents: 20, drift: 0.28, cap: 5000,
    amps: (k, f) => k ** -0.9 * formant(f, VOWEL_O),
  },
};

function cycleTable(amps) {
  const t = new Float32Array(TABLE + 1);
  for (let k = 1; k <= amps.length; k++) {
    const a = amps[k - 1];
    if (!a) continue;
    const w = (2 * Math.PI * k) / TABLE;
    const c = Math.cos(w), s = Math.sin(w);
    let sn = 0, cs = 1;
    for (let i = 0; i < TABLE; i++) {
      t[i] += a * sn;
      const n = sn * c + cs * s;
      cs = cs * c - sn * s;
      sn = n;
    }
  }
  let peak = 0;
  for (let i = 0; i < TABLE; i++) peak = Math.max(peak, Math.abs(t[i]));
  for (let i = 0; i < TABLE; i++) t[i] /= peak;
  t[TABLE] = t[0];
  return t;
}

/** Render (or fetch) the seamless stereo section loop for `kind` at `base` (MIDI). */
function sectionLoop(S, kind, base) {
  const key = `ens:${kind}:${base}`;
  if (S.cache.has(key)) return S.cache.get(key);
  const spec = KINDS[kind];
  const sr = S.sr;
  const n = LOOP * sr;
  const f0 = hz(base);
  // Band-limit for the highest playback rate used with this loop.
  const H = Math.max(1, Math.floor(Math.min(spec.cap, sr * 0.42 / 1.13) / f0));
  const amps = [];
  for (let k = 1; k <= H; k++) amps.push(spec.amps(k, k * f0));
  const table = cycleTable(amps);

  const buf = S.ctx.createBuffer(2, n, sr);
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const V = f0 < 90 ? Math.max(3, spec.voices - 2) : spec.voices;
  const used = new Set();
  for (let v = 0; v < V; v++) {
    const u = V === 1 ? 0 : v / (V - 1) - 0.5;          // -0.5 … 0.5
    const cents = u * 2 * spec.detune + S.rand(-2, 2);
    let cycles = Math.round(f0 * 2 ** (cents / 1200) * LOOP);
    while (used.has(cycles)) cycles += cents >= 0 ? 1 : -1;
    used.add(cycles);
    const f = cycles / LOOP;
    const vibHz = Math.round(S.rand(...spec.vib) * LOOP) / LOOP;
    const vibDepth = 2 ** (spec.vibCents / 1200) - 1;
    const driftHz = Math.max(1, Math.round(S.rand(0.3, 0.9) * LOOP)) / LOOP;
    const pan = spec.spread * (2 * ((v * 0.618 + 0.3) % 1) - 1); // interleaved so pitch ≠ position
    const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
    const inc = (f * TABLE) / sr;
    // Vibrato and amplitude drift are slow, so they are advanced as rotating
    // phasors once per 32-sample block (no per-sample trig).
    const B = 32;
    const wv = (2 * Math.PI * vibHz * B) / sr, cv = Math.cos(wv), sv = Math.sin(wv);
    const wd = (2 * Math.PI * driftHz * B) / sr, cd = Math.cos(wd), sd = Math.sin(wd);
    let vs = Math.sin(S.rand(0, 6.28)), vc = Math.sqrt(1 - vs * vs);
    let ds = Math.sin(S.rand(0, 6.28)), dc = Math.sqrt(1 - ds * ds);
    let ph = S.rand(0, TABLE);
    for (let i0 = 0; i0 < n; i0 += B) {
      const step = inc * (1 + vibDepth * vs);
      const a = 1 + spec.drift * ds;
      const al = a * gl, ar = a * gr;
      const i1 = Math.min(n, i0 + B);
      for (let i = i0; i < i1; i++) {
        ph += step;
        if (ph >= TABLE) ph -= TABLE;
        const j = ph | 0;
        const y = table[j] + (table[j + 1] - table[j]) * (ph - j);
        L[i] += y * al;
        R[i] += y * ar;
      }
      let t = vs * cv + vc * sv; vc = vc * cv - vs * sv; vs = t;
      t = ds * cd + dc * sd; dc = dc * cd - ds * sd; ds = t;
    }
  }
  // Normalise every loop to the same RMS so levels are comparable across kinds.
  let e = 0;
  for (let i = 0; i < n; i++) e += L[i] * L[i] + R[i] * R[i];
  const k = 0.25 / Math.sqrt(e / (2 * n));
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  S.cache.set(key, buf);
  return buf;
}

/** A looping section source for one note (not yet connected). */
function sectionSource(S, kind, midi, t0, end) {
  const base = BASE_STEP * Math.round(midi / BASE_STEP);
  const src = S.ctx.createBufferSource();
  src.buffer = sectionLoop(S, kind, base);
  src.loop = true;
  src.playbackRate.value = 2 ** ((midi - base) / 12);
  src.start(t0, S.rand(0, LOOP - 0.05));
  src.stop(end);
  src._end = end;
  return src;
}

/** Warm up the loop cache for a list of [kind, midi] pairs (keeps render windows short). */
export function preloadSections(S, pairs) {
  for (const [kind, midi] of pairs) sectionLoop(S, kind, BASE_STEP * Math.round(midi / BASE_STEP));
}

// ================================================================ sections

/**
 * Sustained section chord through a lowpass that opens with the swell (bowing /
 * breath brightness), one shared envelope. Used for strings, choir and brass.
 */
export function chord(S, kind, t0, t1, notes, o = {}) {
  const { level = 0.2, attack = 1, release = 1.2, cutoff = 2500, dark = 0.4, bus = 'strings', swell = null } = o;
  const end = t1 + release;
  const att = Math.min(attack, Math.max(0.02, t1 - t0));
  const lp = S.filter('lowpass', cutoff, 0.5);
  const f = lp.frequency;
  f.setValueAtTime(cutoff * dark, t0);
  f.exponentialRampToValueAtTime(cutoff, t0 + att);
  f.setValueAtTime(cutoff, t1);
  f.exponentialRampToValueAtTime(cutoff * dark, end);
  const amp = S.gain(0);
  const lv = level / Math.sqrt(notes.length);
  if (swell) {
    // bowed crescendo: soft start, rising to full at t1
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(lv * swell, t0 + att);
    amp.gain.exponentialRampToValueAtTime(lv, t1);
    amp.gain.setTargetAtTime(0, t1, release / 5);
  } else {
    ahr(amp.gain, t0, t1, lv, att, release);
  }
  lp.connect(amp);
  S.out(amp, bus);
  const nodes = [lp, amp];
  for (const m of notes) {
    const src = sectionSource(S, kind, m, t0, end);
    src.connect(lp);
    nodes.push(src);
  }
  S.free(...nodes);
}

/** Brass chord: filter envelope opens on the swell; `sfz` gives an accented "blat". */
export function brass(S, t0, dur, notes, o = {}) {
  const { level = 0.2, attack = 0.7, release = 1.2, bright = 1800, bus = 'brass', sfz = false, kind = 'brass' } = o;
  const t1 = t0 + dur;
  const end = t1 + release;
  const tPeak = t0 + (sfz ? 0.04 : attack);
  const lp = S.filter('lowpass', 150, sfz ? 2.5 : 1.2);
  const f = lp.frequency;
  f.setValueAtTime(sfz ? 300 : 120, t0);
  f.exponentialRampToValueAtTime(bright * (sfz ? 1.8 : 1), tPeak);
  f.setTargetAtTime(bright * (sfz ? 0.4 : 0.7), tPeak, sfz ? 0.2 : dur * 0.5);
  f.setTargetAtTime(150, t1, release / 4);
  const amp = S.gain(0);
  const g = amp.gain;
  const lv = level / Math.sqrt(notes.length);
  g.setValueAtTime(0, t0);
  if (sfz) {
    g.linearRampToValueAtTime(lv * 1.3, tPeak);
    g.setTargetAtTime(lv * 0.45, tPeak, 0.25);
  } else {
    g.setTargetAtTime(lv, t0, attack / 2.5);
  }
  g.setTargetAtTime(0, t1, release / 5);
  lp.connect(amp);
  S.out(amp, bus);
  const nodes = [lp, amp];
  for (const m of notes) {
    const src = sectionSource(S, kind, m, t0, end);
    src.connect(lp);
    nodes.push(src);
  }
  S.free(...nodes);
}

/** Legato melodic line: [time, midi, duration] notes cross-fading into each other. */
export function line(S, kind, notes, o = {}) {
  const { level = 0.2, cutoff = 2200, bus = 'horn', overlap = 0.08, attack = 0.07, release = 0.35, octaves = [0] } = o;
  const t0 = notes[0][0];
  const tEnd = Math.max(...notes.map(([t, , d]) => t + d)) + release;
  const lp = S.filter('lowpass', cutoff, 0.7);
  const amp = S.gain(level / Math.sqrt(octaves.length));
  lp.connect(amp);
  S.out(amp, bus);
  notes.forEach(([t, m, d], i) => {
    const last = i === notes.length - 1;
    const rel = last ? release : overlap;
    const start = t - (i ? overlap / 2 : 0);
    for (const oct of octaves) {
      const src = sectionSource(S, kind, m + oct, start, t + d + rel);
      const g = S.gain(0);
      ahr(g.gain, start, t + d, 1, i ? overlap : attack, rel);
      src.connect(g).connect(lp);
      S.free(src, g); // each note leaves the graph as soon as it has faded
    }
  });
  lp.frequency.setValueAtTime(cutoff * 0.7, t0);
  lp.frequency.linearRampToValueAtTime(cutoff, tEnd - release);
  lp._end = tEnd;
  S.free(lp, amp);
}

/** Spiccato string note (short bowed stroke) into the shared `spic` bus. */
export function spiccato(S, t, midi, { level = 0.1, decay = 0.13, bus = 'spic' } = {}) {
  const src = sectionSource(S, 'strings', midi, t, t + decay + 0.03);
  const g = S.gain(0);
  perc(g.gain, t, level, decay, 0.004);
  src.connect(g).connect(S.bus(bus));
  S.free(src, g);
}

/** Tremolo strings: a chord whose amplitude is bowed in fast 32nd-note pulses. */
export function tremolo(S, t0, t1, notes, { level = 0.12, rate = 16, cutoff = 4000, bus = 'strings' } = {}) {
  const dur = t1 - t0;
  const lp = S.filter('lowpass', cutoff, 0.5);
  const amp = S.gain(0);
  const lv = level / Math.sqrt(notes.length);
  amp.gain.setValueCurveAtTime(S.curve(dur, 800, (t) => {
    const ph = (t * rate) % 1;
    const stroke = 0.55 + 0.45 * Math.cos(ph * 2 * Math.PI);
    const cresc = 0.25 + 0.75 * (t / dur) ** 1.5;
    return lv * stroke * cresc * Math.min(1, t / 0.08, (dur - t) / 0.05);
  }), t0, dur);
  lp.connect(amp);
  S.out(amp, bus);
  const nodes = [lp, amp];
  for (const m of notes) {
    const src = sectionSource(S, 'strings', m, t0, t1 + 0.02);
    src.connect(lp);
    nodes.push(src);
  }
  S.free(...nodes);
}

// =================================================================== BRAAM

function driveCurve(S) {
  if (S.cache.has('drive')) return S.cache.get('drive');
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(2.6 * x) / Math.tanh(2.6);
  }
  S.cache.set('drive', c);
  return c;
}

/**
 * BRAAM: a huge detuned low-brass + saw cluster, driven into saturation, with a
 * lowpass that rips open then closes, over a sub-octave. `root` is a MIDI note.
 */
export function braam(S, t, root, { level = 0.5, dur = 2.4, power = 1, bus = 'brass' } = {}) {
  const end = t + dur + 0.45;
  const pre = S.gain(0.9);
  const shaper = S.ctx.createWaveShaper();
  shaper.curve = driveCurve(S);
  const lp = S.filter('lowpass', 90, 3.5);
  lp.frequency.setValueAtTime(90, t);
  lp.frequency.exponentialRampToValueAtTime(900 + 1700 * power, t + 0.09);
  lp.frequency.setTargetAtTime(420, t + 0.09, dur / 3);
  lp.frequency.setTargetAtTime(90, t + dur, 0.2);
  const amp = S.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(level, t + 0.02);
  amp.gain.setTargetAtTime(level * 0.45, t + 0.05, 0.45);
  amp.gain.setTargetAtTime(0, t + dur, 0.09);
  pre.connect(shaper).connect(lp).connect(amp);
  S.out(amp, bus);
  const nodes = [pre, shaper, lp, amp];
  for (const m of [root - 12, root, root + 7, root + 12]) {
    const src = sectionSource(S, 'brass', m, t, end);
    src.connect(pre);
    nodes.push(src);
  }
  for (const cents of [-14, 14]) {
    const o = S.osc('sawtooth', hz(root - 12), t, end);
    o.detune.value = cents;
    const g = S.gain(0.35);
    o.connect(g).connect(pre);
    nodes.push(o, g);
  }
  S.free(...nodes);
}
