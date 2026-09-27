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
//
// Realism (v4): every player has its own slow random pitch drift (two incommensurate
// wobbles), a vibrato whose depth breathes, and a slightly different level; string
// sections carry body-resonance formants (≈300 Hz / 1 kHz / 2.5 kHz) and a bow /
// rosin noise layer; choirs have vowel formants plus formant-shaped breath; brass
// and horns a little breath. Notes are then humanised when played: per-note onset
// spread and level, random detune, brass lip "scoop" into pitch and a driven
// "blat" at sforzando, string attack scrape, and legato lines with portamento,
// delayed vibrato and a swell on long notes.

import { hz, ahr, perc } from './core.js';

const LOOP = 3;          // seconds per ensemble loop
const TABLE = 2048;      // single-cycle wavetable size
const BASE_STEP = 5;     // loops are rendered every 5 semitones (transpose ≤ ±2.5 st)

// Vowel formants: [frequency, bandwidth, gain]
const VOWEL_A = [[750, 110, 1], [1150, 130, 0.55], [2600, 180, 0.22], [3300, 250, 0.08]];
const VOWEL_O = [[420, 90, 1], [820, 110, 0.45], [2500, 200, 0.12], [3200, 260, 0.05]];
const formant = (f, vowel) => 0.015 + vowel.reduce((s, [F, bw, g]) => s + g / (1 + ((f - F) / bw) ** 2), 0);
// Violin-family body resonances (air / main wood / bridge hill).
const BODY = [[290, 70, 0.9], [1000, 260, 0.7], [2500, 600, 0.75]];
const body = (f) => 1 + BODY.reduce((s, [F, bw, g]) => s + g / (1 + ((f - F) / bw) ** 2), 0);

// Section timbres. amps(k, f) = amplitude of harmonic k (frequency f).
const KINDS = {
  // centre: stage position of the section (strings left-centre, brass right-centre)
  // pitchDrift: cents of slow random wander per player · noise: bow / breath layer
  // level · noiseBands: [centre Hz, Q, gain] of that layer.
  strings: {
    voices: 6, detune: 12, spread: 0.85, centre: -0.14, vib: [4.6, 5.8], vibCents: 9, drift: 0.2, cap: 7500, pitchDrift: 5,
    amps: (k, f) => (1 / k) * body(f) * (1 + 0.6 / (1 + ((f - 2800) / 900) ** 2)) / (1 + (f / 6500) ** 2),
    noise: 0.07, noiseBands: [[3200, 0.9, 1], [1100, 1.2, 0.45], [6500, 1.5, 0.3]],
  },
  brass: {
    voices: 4, detune: 8, spread: 0.5, centre: 0.2, vib: [4.4, 5.0], vibCents: 3, drift: 0.1, cap: 7000, pitchDrift: 3,
    amps: (k, f) => (k % 2 ? 1 : 0.8) / k ** 0.8 * (1 + 0.5 / (1 + ((f - 1200) / 500) ** 2)),
    noise: 0.025, noiseBands: [[1400, 1.2, 1], [3000, 1.5, 0.4]],
  },
  horn: {
    voices: 4, detune: 6, spread: 0.45, centre: 0.07, vib: [4.8, 5.4], vibCents: 5, drift: 0.12, cap: 4000, pitchDrift: 3.5,
    amps: (k, f) => 1 / k ** 1.25 / (1 + (f / 1800) ** 2) * (1 + 0.4 / (1 + ((f - 450) / 150) ** 2)),
    noise: 0.02, noiseBands: [[900, 1.2, 1]],
  },
  choirA: {
    voices: 6, detune: 13, spread: 1, vib: [4.9, 5.9], vibCents: 22, drift: 0.28, cap: 6000, pitchDrift: 9,
    amps: (k, f) => k ** -0.7 * formant(f, VOWEL_A),
    noise: 0.06, noiseBands: VOWEL_A.map(([F, bw, g]) => [F, F / bw / 1.5, g]).concat([[6000, 1, 0.25]]),
  },
  choirO: {
    voices: 6, detune: 13, spread: 1, vib: [4.9, 5.9], vibCents: 20, drift: 0.28, cap: 5000, pitchDrift: 9,
    amps: (k, f) => k ** -0.9 * formant(f, VOWEL_O),
    noise: 0.05, noiseBands: VOWEL_O.map(([F, bw, g]) => [F, F / bw / 1.5, g]).concat([[5500, 1, 0.2]]),
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

/** RBJ band-pass biquad over `d` (in place, run twice for a clean seam). */
function bandpassInto(src, out, sr, fc, q, gain) {
  const w = (2 * Math.PI * Math.min(fc, sr * 0.45)) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < src.length; i++) {
    const x = src[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    out[i] += y * gain;
  }
}

/**
 * Bow / rosin (strings) or breath (choir, brass) noise baked into a section loop:
 * decorrelated stereo noise through the kind's formant bands, amplitude-modulated
 * by slow irregular "bow pressure", with a crossfaded seam so the loop stays seamless.
 */
function addNoiseLayer(S, L, R, spec, n) {
  let e = 0; // tone RMS, so the layer sits at a fixed level relative to the players
  for (let i = 0; i < n; i += 4) e += L[i] * L[i] + R[i] * R[i];
  const k = spec.noise * Math.sqrt(e / (n / 2));
  const [nl, nr] = noiseLoop(S, spec, n);
  for (let i = 0; i < n; i++) { L[i] += nl[i] * k; R[i] += nr[i] * k; }
}

/** The (unpitched) noise layer of a kind, rendered once and shared by all its loops. */
function noiseLoop(S, spec, n) {
  const key = `ensnoise:${spec.noiseBands.map((b) => b.join()).join('|')}`;
  if (S.cache.has(key)) return S.cache.get(key);
  const sr = S.sr, fade = Math.floor(0.05 * sr), m = n + fade;
  const res = [];
  for (let c = 0; c < 2; c++) {
    const src = new Float32Array(m);
    for (let i = 0; i < m; i++) src[i] = S.random() * 2 - 1;
    const acc = new Float32Array(m);
    for (const [fc, q, g] of spec.noiseBands) bandpassInto(src, acc, sr, fc, q, g);
    let ae = 0;
    for (let i = 0; i < m; i += 4) ae += acc[i] * acc[i];
    const k = 1 / Math.sqrt(ae / (m / 4) + 1e-12);
    // bow pressure: integer-cycle wobbles per loop → seamless, never regular
    const c1 = S.rand(0, 6.28), c2 = S.rand(0, 6.28), c3 = S.rand(0, 6.28);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = (2 * Math.PI * i) / n;
      const press = 0.7 + 0.18 * Math.sin(u * 2 + c1) + 0.12 * Math.sin(u * 5 + c2) + 0.08 * Math.sin(u * 11 + c3);
      let y = acc[i];
      if (i < fade) { const a = i / fade; y = y * a + acc[n + i] * (1 - a); }
      out[i] = y * k * press;
    }
    res.push(out);
  }
  S.cache.set(key, res);
  return res;
}

/** Render (or fetch) the seamless stereo section loop for `kind` at `base` (MIDI). */
function sectionLoop(S0, kind, base) {
  const key = `ens:${kind}:${base}`;
  if (S0.cache.has(key)) return S0.cache.get(key);
  const S = S0.seeded(key); // identical whichever studio renders it first
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
    // interleaved so pitch ≠ position; `centre` seats the section on the stage
    const pan = Math.max(-1, Math.min(1, (spec.centre ?? 0) + spec.spread * (2 * ((v * 0.618 + 0.3) % 1) - 1)));
    const lvl = S.rand(0.75, 1.1);                               // no two players equally loud
    const gl = Math.cos(((pan + 1) * Math.PI) / 4) * lvl, gr = Math.sin(((pan + 1) * Math.PI) / 4) * lvl;
    // slow random pitch wander: two wobbles of 1 and 2 (or 3) cycles per loop, random
    // phase, plus a vibrato depth that breathes once per loop
    const pd = (2 ** ((spec.pitchDrift ?? 0) / 1200) - 1) * 0.6;
    const w1 = (2 * Math.PI * (1 / LOOP) * 32) / sr, w2 = (2 * Math.PI * ((v % 2 ? 2 : 3) / LOOP) * 32) / sr;
    const p1 = S.rand(0, 6.28), p2 = S.rand(0, 6.28), p3 = S.rand(0, 6.28);
    const inc = (f * TABLE) / sr;
    // Vibrato and amplitude drift are slow, so they are advanced as rotating
    // phasors once per 32-sample block (no per-sample trig).
    const B = 32;
    const wv = (2 * Math.PI * vibHz * B) / sr, cv = Math.cos(wv), sv = Math.sin(wv);
    const wd = (2 * Math.PI * driftHz * B) / sr, cd = Math.cos(wd), sd = Math.sin(wd);
    let vs = Math.sin(S.rand(0, 6.28)), vc = Math.sqrt(1 - vs * vs);
    let ds = Math.sin(S.rand(0, 6.28)), dc = Math.sqrt(1 - ds * ds);
    let ph = S.rand(0, TABLE);
    for (let i0 = 0, blk = 0; i0 < n; i0 += B, blk++) {
      const wob = pd * (Math.sin(p1 + w1 * blk) + 0.6 * Math.sin(p2 + w2 * blk));
      const breathe = 0.65 + 0.35 * Math.sin(p3 + w1 * blk);
      const step = inc * (1 + vibDepth * breathe * vs + wob);
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
  if (spec.noise) addNoiseLayer(S, L, R, spec, n);
  // Normalise every loop to the same RMS so levels are comparable across kinds.
  let e = 0;
  for (let i = 0; i < n; i++) e += L[i] * L[i] + R[i] * R[i];
  const k = 0.25 / Math.sqrt(e / (2 * n));
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  S.cache.set(key, buf);
  return buf;
}

/** A looping section source for one note (not yet connected); a few cents off every time. */
function sectionSource(S, kind, midi, t0, end, cents = 4) {
  const base = BASE_STEP * Math.round(midi / BASE_STEP);
  const src = S.ctx.createBufferSource();
  src.buffer = sectionLoop(S, kind, base);
  src.loop = true;
  src.playbackRate.value = 2 ** ((midi - base) / 12 + S.rand(-cents, cents) / 1200);
  src.start(t0, S.rand(0, LOOP - 0.05));
  src.stop(end);
  src._end = end;
  return src;
}

// ============================================================ transients
// Short noise one-shots that sell the start of a note: string attack scrape,
// brass breath/lip buzz, spiccato bow "chiff". Several round-robins each.

const TRANSIENTS = {
  //        seconds, bands [fc, q, gain], attack s, decay s (to -60 dB)
  scrape: [0.16, [[2600, 1.1, 1], [5200, 1.6, 0.5], [900, 1.5, 0.35]], 0.004, 0.12],
  breath: [0.14, [[1300, 1.3, 1], [2800, 1.6, 0.5], [500, 1.4, 0.3]], 0.01, 0.1],
  chiff:  [0.05, [[3600, 1.4, 1], [1800, 1.6, 0.5]], 0.001, 0.035],
};

function transient(S, name) {
  const v = S.robin(`tr:${name}`, 4);
  const key = `tr:${name}:${v}`;
  if (S.cache.has(key)) return S.cache.get(key);
  S = S.seeded(key);
  const [secs, bands, att, dec] = TRANSIENTS[name];
  const sr = S.sr, n = Math.ceil(secs * sr);
  const buf = S.ctx.createBuffer(2, n, sr);
  const k = Math.exp(-6.9 / (dec * S.rand(0.8, 1.25) * sr));
  for (let c = 0; c < 2; c++) {
    const src = new Float32Array(n);
    let e = 1;
    for (let i = 0; i < n; i++) {
      // grainy: the bow/lip catches irregularly
      const grain = 0.6 + 0.4 * (S.random() < 0.1 ? 1 : S.random());
      src[i] = (S.random() * 2 - 1) * e * grain * Math.min(1, i / (att * sr));
      e *= k;
    }
    const d = buf.getChannelData(c);
    for (const [fc, q, g] of bands) bandpassInto(src, d, sr, fc * S.rand(0.85, 1.15), q, g);
  }
  let peak = 0;
  for (let c = 0; c < 2; c++) for (const x of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(x));
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] /= peak; }
  S.cache.set(key, buf);
  return buf;
}

function playTransient(S, t, name, level, dest) {
  const src = S.buffer(transient(S, name), t, S.rand(0.92, 1.08));
  const g = S.gain(level);
  src.connect(g).connect(dest);
  S.free(src, g);
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
  } else if (t1 - t0 > 1.2 && kind !== 'brass') {
    // a held chord is never flat: the section leans into the middle of the bow / breath
    const g = amp.gain, mid = t0 + att + (t1 - t0 - att) * S.rand(0.45, 0.65);
    g.setValueAtTime(0, t0);
    g.linearRampToValueAtTime(lv * 0.92, t0 + att);
    g.linearRampToValueAtTime(lv * S.rand(1.05, 1.12), mid);
    g.linearRampToValueAtTime(lv * 0.96, t1);
    g.setTargetAtTime(0, t1, release / 5);
  } else {
    ahr(amp.gain, t0, t1, lv, att, release);
  }
  lp.connect(amp);
  S.out(amp, bus);
  const nodes = [lp, amp];
  // humanised: players never enter exactly together (soft entries spread more)
  const spread = att < 0.08 ? 0.012 : Math.min(0.06, att * 0.08);
  for (const m of notes) {
    const src = sectionSource(S, kind, m, t0 + S.rand(0, spread), end);
    src.connect(lp);
    nodes.push(src);
  }
  // the bite of the bow on fast string attacks
  if (kind === 'strings' && att <= 0.2) playTransient(S, t0, 'scrape', lv * Math.sqrt(notes.length) * 0.22 * (0.25 / Math.max(0.03, att)) ** 0.3, amp);
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
  // (finite ramps rather than setTarget: an automated biquad costs 3× a static one)
  const settle = bright * (sfz ? 0.4 : 0.7);
  const tSettle = Math.max(tPeak + 0.01, Math.min(t1, tPeak + (sfz ? 0.6 : dur * 1.2)));
  f.exponentialRampToValueAtTime(settle, tSettle);
  f.setValueAtTime(settle, Math.max(t1, tSettle));
  f.exponentialRampToValueAtTime(150, Math.max(t1, tSettle) + release);
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
  // sforzando: the section is overblown → a driven, growling "blat"
  let into = lp;
  if (sfz) {
    const pre = S.gain(1.8);
    const shaper = S.ctx.createWaveShaper();
    shaper.curve = driveCurve(S);
    const post = S.gain(0.6);
    pre.connect(shaper).connect(post).connect(lp);
    into = pre;
    nodes.push(pre, shaper, post);
  }
  for (const m of notes) {
    const tn = t0 + S.rand(0, sfz ? 0.008 : 0.03);
    const src = sectionSource(S, kind, m, tn, end, 3);
    // lip "scoop": every player lands on the pitch from a little below
    const scoop = S.rand(25, 60) * (sfz ? 1.3 : 1);
    src.detune.setValueAtTime(-scoop, tn);
    src.detune.setTargetAtTime(0, tn, sfz ? 0.018 : 0.035);
    const g = S.gain(S.rand(0.8, 1.1));
    src.connect(g).connect(into);
    nodes.push(src, g);
  }
  // breath / lip buzz on the attack
  playTransient(S, t0, 'breath', lv * Math.sqrt(notes.length) * (sfz ? 0.3 : 0.12), amp);
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
  // delayed vibrato: one LFO for the phrase, its depth opening on each long note
  const lfo = S.osc('sine', S.rand(4.9, 5.6), t0 - 0.1, tEnd);
  const depth = S.gain(0);
  lfo.connect(depth);
  const lo = Math.min(...notes.map(([, m]) => m)), hi = Math.max(...notes.map(([, m]) => m));
  const nodes = [lp, amp, lfo, depth];
  notes.forEach(([t, m, d], i) => {
    const last = i === notes.length - 1;
    const rel = last ? release : overlap;
    const start = i ? S.human(t, 12) - overlap / 2 : t;
    const prev = i ? notes[i - 1][1] : null;
    // phrase dynamics: higher notes a little louder, long notes swell (messa di voce)
    const vel = 0.82 + 0.18 * (hi > lo ? (m - lo) / (hi - lo) : 1);
    depth.gain.setValueAtTime(0, start);
    if (d > 0.4) depth.gain.setTargetAtTime(S.rand(9, 14), t + 0.22, 0.12);
    for (const oct of octaves) {
      const src = sectionSource(S, kind, m + oct, start, t + d + rel, 3);
      // legato: glide from the previous note (small intervals) or a scoop (leaps)
      const gl = prev != null && Math.abs(prev - m) <= 7 ? (prev - m) * 100 * 0.85 : -S.rand(20, 45);
      src.detune.setValueAtTime(gl, start);
      src.detune.setTargetAtTime(0, start + 0.01, prev != null && Math.abs(prev - m) <= 7 ? 0.03 : 0.025);
      depth.connect(src.detune);
      const g = S.gain(0);
      const pk = vel * S.rand(0.92, 1.05);
      const a = i ? overlap : attack;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(pk * (d > 0.6 ? 0.85 : 1), start + a);
      if (d > 0.6) g.gain.linearRampToValueAtTime(pk * 1.08, t + d * 0.65);
      g.gain.setTargetAtTime(0, t + d, rel / 5);
      src.connect(g).connect(lp);
      S.free(src, g); // each note leaves the graph as soon as it has faded
    }
    // brightness follows the dynamics
    lp.frequency.linearRampToValueAtTime(cutoff * (0.7 + 0.4 * vel), t + 0.15);
  });
  lp.frequency.setValueAtTime(cutoff * 0.7, t0);
  lp._end = tEnd;
  S.free(...nodes);
}

/** Spiccato string note (short bowed stroke) into the shared `spic` bus. */
export function spiccato(S, t, midi, { level = 0.1, decay = 0.13, bus = 'spic' } = {}) {
  // humanised: a few ms early/late, level and length vary, accents bite harder
  const th = S.human(t, 8);
  const lv = level * S.rand(0.85, 1.12);
  const dec = decay * S.rand(0.8, 1.2);
  const src = sectionSource(S, 'strings', midi, th, th + dec + 0.03, 6);
  const g = S.gain(0);
  perc(g.gain, th, lv, dec, level > 0.14 ? 0.002 : 0.006);
  src.connect(g).connect(S.bus(bus));
  S.free(src, g);
  if (level > 0.16) playTransient(S, th, 'chiff', lv * 0.35, S.bus(bus));
}

/** Tremolo strings: a chord whose amplitude is bowed in fast 32nd-note pulses. */
export function tremolo(S, t0, t1, notes, { level = 0.12, rate = 16, cutoff = 4000, bus = 'strings' } = {}) {
  const dur = t1 - t0;
  const lp = S.filter('lowpass', cutoff, 0.5);
  const amp = S.gain(0);
  const lv = level / Math.sqrt(notes.length);
  // bowed by hand: stroke rate and weight wander, never a clean LFO
  const weights = Array.from({ length: Math.ceil(dur * rate * 1.2) + 2 }, () => S.rand(0.72, 1.08));
  let ph = 0;
  amp.gain.setValueCurveAtTime(S.curve(dur, 800, () => {
    ph += (rate * (1 + 0.14 * (S.random() - 0.5))) / 800;
    return ph;
  }).map((p, i) => {
    const t = i / 800;
    const stroke = (0.55 + 0.45 * Math.cos((p % 1) * 2 * Math.PI)) * weights[Math.floor(p)];
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
export function braam(S, t, root, { level = 0.5, dur = 2.4, power = 1, bus = 'brass', close = dur / 3, release = 0.09 } = {}) {
  // close: time constant of the filter closing after the rip · release: of the fade at t + dur
  const end = t + dur + Math.max(0.45, release * 5);
  const pre = S.gain(0.9);
  const shaper = S.ctx.createWaveShaper();
  shaper.curve = driveCurve(S);
  const lp = S.filter('lowpass', 90, 3.5);
  lp.frequency.setValueAtTime(90, t);
  lp.frequency.exponentialRampToValueAtTime(900 + 1700 * power, t + 0.09);
  lp.frequency.setTargetAtTime(420, t + 0.09, close);
  lp.frequency.setTargetAtTime(90, t + dur, Math.max(0.2, release * 1.5));
  const amp = S.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(level, t + 0.02);
  amp.gain.setTargetAtTime(level * 0.45, t + 0.05, 0.45);
  amp.gain.setTargetAtTime(0, t + dur, release);
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
