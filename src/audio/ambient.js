// AMBIENT SCORE for Experience mode: a meditative, beat-free soundscape generated live with
// Web Audio. No narration and nothing from the film's soundtrack.
//   pads    warm, slowly filtered chords in D: Dm9 – Bbmaj7 – Fmaj9 – Cadd9 – Dm9 – Bbmaj7 – Fmaj9 – Am7,
//           each ~12 s, cross-fading with long attacks and releases (the cycle never has a seam)
//   drone   a low D pedal (D1 / D2 / A2) breathing very slowly
//   shimmer sparse high chord tones (glass-like sines) through a soft echo and the hall
//   air     band-passed noise, a quiet wind that moves with the filter LFO
//   swell   swell() at chapter changes: a soft bloom of the current chord, never a beat
// Everything goes through one long procedural hall (reverb.js) and a gentle master compressor.
// The graph is built on the first play() (which must run inside a user gesture: mobile unlock), then
// events are scheduled a few seconds ahead of the audio clock. pause() suspends the context, so
// the music resumes exactly where it stopped.
import { makeImpulse } from './reverb.js';

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const CHORD_LEN = 12;   // seconds per chord
const CHORDS = [
  [50, 57, 65, 69, 76],   // Dm9      D3 A3 F4 A4 E5
  [46, 53, 62, 65, 69],   // Bbmaj7   Bb2 F3 D4 F4 A4
  [53, 60, 64, 67, 69],   // Fmaj9    F3 C4 E4 G4 A4
  [48, 55, 62, 64, 67],   // Cadd9    C3 G3 D4 E4 G4
  [50, 57, 60, 65, 69],   // Dm7      D3 A3 C4 F4 A4
  [46, 53, 58, 62, 69],   // Bbmaj7   Bb2 F3 Bb3 D4 A4
  [53, 57, 64, 67, 72],   // Fmaj9    F3 A3 E4 G4 C5
  [45, 52, 60, 64, 67],   // Am7      A2 E3 C4 E4 G4
];
const LEVEL = 0.65;       // master level: about the loudness of the film's soundtrack (RMS ≈ −17 dBFS)

function rng(seed) {   // mulberry32: a repeatable, never-looping shimmer
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Ambient {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.playing = false;
    this.random = rng(7);
  }

  get state() { return this.ctx?.state ?? 'none'; }

  // Build the graph on a context (a live AudioContext, or an OfflineAudioContext for tests).
  build(ctx, t0 = ctx.currentTime) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    // master: level → mute → fade (play / pause) → glue compressor → out
    this.master = g(LEVEL); this.mute = g(this.muted ? 0 : 1); this.fade = g(0);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 2.5; comp.attack.value = 0.05; comp.release.value = 0.6;
    this.master.connect(this.mute).connect(this.fade).connect(comp).connect(ctx.destination);
    // the hall: a long, dark, spacious tail
    this.hall = ctx.createConvolver();
    this.hall.normalize = false;
    this.hall.buffer = makeImpulse(ctx, rng(3), { seconds: 6.5, preDelay: 0.045, brightHz: 6000, darkHz: 1100, reflections: 8 });
    this.hallIn = g(1);
    const hallOut = g(0.36);
    this.hallIn.connect(this.hall).connect(hallOut).connect(this.master);
    // buses
    this.pads = g(1); this.pads.connect(this.master); this.pads.connect(g(0.55)).connect(this.hallIn);
    this.glass = g(1); this.glass.connect(g(0.5)).connect(this.master); this.glass.connect(this.hallIn);
    // a soft echo for the shimmer (dark feedback loop)
    const echo = ctx.createDelay(2); echo.delayTime.value = 0.83;
    const fb = g(0.36), damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600;
    this.glass.connect(echo).connect(damp).connect(fb).connect(echo);
    damp.connect(g(0.5)).connect(this.hallIn);
    // shared slow LFO (filters, drone breath)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045; lfo.start(t0);
    this.lfo = lfo;
    // warm pad timbre: soft sawtooth-like partials rolled off fast
    const n = 18, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (k % 2 ? 1 : 0.55) / k ** 1.55;
    this.wave = ctx.createPeriodicWave(re, im);
    this._drone(t0);
    this._air(t0);
    this.startT = t0; this.nextChord = t0; this.chordIdx = 0; this.nextGlass = t0 + 3;
    this.schedule(t0 + 4);
  }

  _drone(t0) {
    const ctx = this.ctx;
    const out = this.droneOut = ctx.createGain(); out.gain.value = 0.046;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.3;
    const breath = ctx.createGain(); breath.gain.value = 0.013; this.lfo.connect(breath).connect(out.gain);   // ±28 %
    lp.connect(out).connect(this.master); out.connect(this.hallIn);
    for (const [m, v, det] of [[26, 0.5, 0], [38, 1, -4], [38, 0.7, 5], [45, 0.35, 2]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m); o.detune.value = det;
      const a = ctx.createGain(); a.gain.value = v;
      o.connect(a).connect(lp); o.start(t0);
    }
  }

  _air(t0) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 5), rnd = rng(11);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {   // pink-ish noise
        const w = rnd() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048;
        d[i] = b0 + b1 + b2 + w * 0.02;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
    const sweep = ctx.createGain(); sweep.gain.value = 450; this.lfo.connect(sweep).connect(bp.frequency);
    this.airGain = ctx.createGain(); this.airGain.gain.value = 0.16;
    src.connect(bp).connect(this.airGain);
    this.airGain.connect(this.master); this.airGain.connect(this.hallIn);
    src.start(t0);
  }

  // One chord: five voices of two detuned oscillators, one opening-and-closing filter, long envelope.
  _chord(notes, t0, len, { level = 1, attack = 5, release = 7, filter = [450, 1900, 700], bus = this.pads } = {}) {
    const ctx = this.ctx, end = t0 + len;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.setTargetAtTime(level, t0, attack / 3);
    env.gain.setTargetAtTime(0, end, release / 4.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(filter[0], t0);
    lp.frequency.linearRampToValueAtTime(filter[1], t0 + len * 0.55);
    lp.frequency.linearRampToValueAtTime(filter[2], end + release);
    lp.connect(env).connect(bus);
    const chorus = ctx.createOscillator(); chorus.frequency.value = 0.11 + this.random() * 0.06;
    const stop = end + release + 0.5;
    chorus.start(t0); chorus.stop(stop);
    notes.forEach((m, i) => {
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
      if (pan.pan) pan.pan.value = (i % 2 ? 1 : -1) * (0.15 + 0.5 * (i / notes.length));
      const v = ctx.createGain(); v.gain.value = (0.15 / Math.sqrt(notes.length)) * (m < 50 ? 1.15 : m > 70 ? 0.7 : 1);
      v.connect(pan).connect(lp);
      for (const sign of [-1, 1]) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(this.wave);
        o.frequency.value = mtof(m);
        o.detune.value = sign * (4 + i);
        const dm = ctx.createGain(); dm.gain.value = sign * 3.5; chorus.connect(dm).connect(o.detune);
        o.connect(v); o.start(t0); o.stop(stop);
      }
    });
  }

  // A glass note: a pure tone, a faint octave and a slow-beating twin.
  _glassNote(m, t0, level = 0.03, pan = 0) {
    const ctx = this.ctx, f = mtof(m);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.setTargetAtTime(level, t0, 0.35 + this.random() * 0.3);
    env.gain.setTargetAtTime(0, t0 + 1.6, 1.6);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (p.pan) p.pan.value = pan;
    env.connect(p).connect(this.glass);
    for (const [r, a] of [[1, 1], [1.0025, 0.55], [2, 0.1]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const gg = ctx.createGain(); gg.gain.value = a;
      o.connect(gg).connect(env); o.start(t0); o.stop(t0 + 10);
    }
  }

  chordAt(t) { return CHORDS[Math.max(0, Math.floor((t - this.startT) / CHORD_LEN)) % CHORDS.length]; }

  // Schedule everything that starts before `horizon` (audio-clock seconds).
  schedule(horizon) {
    while (this.nextChord < horizon) {
      const notes = CHORDS[this.chordIdx % CHORDS.length];
      this._chord(notes, this.nextChord, CHORD_LEN);
      this.chordIdx++;
      this.nextChord += CHORD_LEN;
    }
    while (this.nextGlass < horizon) {
      const pcs = this.chordAt(this.nextGlass);
      let m = pcs[Math.floor(this.random() * pcs.length)];
      while (m < 74) m += 12;
      if (m > 91) m -= 12;
      this._glassNote(m, this.nextGlass, 0.11 + this.random() * 0.08, (this.random() * 2 - 1) * 0.7);
      this.nextGlass += 2.4 + this.random() * 3.2;
    }
  }

  // A soft bloom for a chapter change: the chord's upper voices rise through an opening filter,
  // the air lifts, and it all falls back into the hall. No attack transient, no beat.
  swell() {
    if (!this.ctx || !this.playing) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.05;
    const notes = this.chordAt(t).slice(-3);
    this._chord(notes, t, 2.8, { level: 0.9, attack: 2.4, release: 6, filter: [500, 2600, 800], bus: this.glass });
    const a = this.airGain.gain;
    a.cancelScheduledValues(t); a.setValueAtTime(a.value, t);
    a.setTargetAtTime(0.36, t, 0.9); a.setTargetAtTime(0.16, t + 2.6, 1.6);
  }

  _unlock() {
    if (this._unlocked) return;
    try { const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._unlocked = true; } catch { /* ignore */ }
  }

  // Start / resume. Call from inside the user's tap: the context is created, resumed and unlocked
  // synchronously (iOS only unlocks audio inside a gesture).
  play() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.build(ctx, ctx.currentTime + 0.05);
      this._timer = setInterval(() => { if (this.ctx.state === 'running') this.schedule(this.ctx.currentTime + 4); }, 500);
    }
    clearTimeout(this._suspendT);
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this._unlock();
    this.playing = true;
    const f = this.fade.gain, t = this.ctx.currentTime;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.setTargetAtTime(1, t, 0.9);
  }

  // Fade out, then suspend (the audio clock stops, so play() picks up exactly here).
  pause(fadeS = 0.6) {
    this.playing = false;
    if (!this.ctx) return;
    const f = this.fade.gain, t = this.ctx.currentTime;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.setTargetAtTime(0, t, fadeS / 4);
    clearTimeout(this._suspendT);
    this._suspendT = setTimeout(() => { if (!this.playing) this.ctx.suspend().catch(() => {}); }, fadeS * 1000 + 150);
  }

  stop() { this.pause(1.2); }

  setMuted(m) {
    this.muted = m;
    if (this.mute) { const t = this.ctx.currentTime; this.mute.gain.cancelScheduledValues(t); this.mute.gain.setTargetAtTime(m ? 0 : 1, t, 0.05); }
  }
}
