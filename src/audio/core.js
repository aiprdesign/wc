// Studio — the offline rendering environment shared by every instrument.
//
// Owns the OfflineAudioContext, a seeded RNG (the score renders identically every
// time), a handful of shared noise buffers, the mix buses, and a just-in-time
// event scheduler: events are registered with `at(time, build)` and their nodes
// are only created a fraction of a second before they sound (OfflineAudioContext
// suspend/resume) and disconnected once finished,
// so the live audio graph stays small however many events the score contains.
//
// Time map (v7): the score is authored on the STORY clock of timeline.js (cues, beats and
// bars at 120 BPM over 78 s) and played on the FILM clock, slowed by `timeScale`. Every
// time the score hands to a Studio — event times, source start/stop, AudioParam
// automation (event times, ramp ends, curve spans, setTarget time constants) — is story
// time and is converted exactly once, here, so the whole score plays slower at the same
// pitch: notes, swells, ramps, fades and grids stretch; oscillator frequencies, vibrato
// rates, pre-rendered buffers (drums, piano, harp, impacts, section loops) and reverbs
// are physical and do not. Physical one-shots built from nodes (booms, clicks, puffs…)
// run inside `oneShot(t0, …)`: there, time is anchored at t0 and every offset from t0
// keeps its real length. `phys(s)` is the story-time length that sounds for s real seconds.

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string (seeds per-buffer RNGs). */
export function hashKey(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// ---------------------------------------------------------------- envelopes

/** Percussive envelope: short linear attack, exponential decay (`decay` = time to -60 dB). */
export function perc(param, t, peak, decay, attack = 0.002) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  param.setTargetAtTime(0, t + attack, decay / 6.9);
}

/** Exponential (dB-linear) rise from silence to `peak` at `t1`, then a fast cut. */
export function riseTo(param, t0, t1, peak, cut = 0.03) {
  param.setValueAtTime(peak * 0.001, t0);
  param.exponentialRampToValueAtTime(peak, t1);
  param.linearRampToValueAtTime(0, t1 + cut);
}

/** Attack / hold / release envelope with smooth (setTarget) segments. */
export function ahr(param, t0, t1, peak, attack, release) {
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + Math.min(attack, Math.max(0.001, t1 - t0)));
  param.setValueAtTime(peak, Math.max(t1, t0 + attack));
  param.setTargetAtTime(0, Math.max(t1, t0 + attack), release / 5);
}

// ------------------------------------------------------------------- studio

/**
 * An AudioParam prototype whose automation methods take story times (see "Time map"
 * above). Params created by the Studio's factories are given it, so every instrument's
 * envelopes, ramps and curves follow the time map without knowing it exists.
 */
function timedParamProto(S) {
  const P = AudioParam.prototype;
  return Object.create(P, {
    setValueAtTime: { value(v, t) { return P.setValueAtTime.call(this, v, S.T(t)); } },
    linearRampToValueAtTime: { value(v, t) { return P.linearRampToValueAtTime.call(this, v, S.T(t)); } },
    exponentialRampToValueAtTime: { value(v, t) { return P.exponentialRampToValueAtTime.call(this, v, S.T(t)); } },
    setTargetAtTime: { value(v, t, tau) { return P.setTargetAtTime.call(this, v, S.T(t), S.span(tau)); } },
    setValueCurveAtTime: { value(c, t, d) { const a = S.T(t); return P.setValueCurveAtTime.call(this, c, a, S.T(t + d) - a); } },
    cancelScheduledValues: { value(t) { return P.cancelScheduledValues.call(this, S.T(t)); } },
    cancelAndHoldAtTime: { value(t) { return P.cancelAndHoldAtTime.call(this, S.T(t)); } },
  });
}

/** Wrap an instrument `fn(S, t, …)` as a physical one-shot anchored at its onset t. */
export const physical = (fn) => function (S, t, ...args) { return S.oneShot(t, () => fn(S, t, ...args)); };

const NOISE_SECONDS = 4;

export class Studio {
  /**
   * `shared` (another Studio) lets several studios render parts of the score in
   * parallel (one OfflineAudioContext each) while sharing the noise buffers and
   * the cache of pre-rendered one-shots / section loops (AudioBuffers are not
   * tied to a context).
   */
  constructor(sampleRate, seconds, seed = 1492, shared = null, { timeScale = shared?.clock.k ?? 1 } = {}) {
    this.sr = sampleRate;
    this.duration = seconds; // FILM seconds
    this.clock = { k: timeScale, anchor: null }; // shared with seeded() views
    this.ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    this.random = mulberry32(seed);
    this.events = [];
    this.buses = new Map();
    this.cache = shared ? shared.cache : new Map(); // rendered one-shots and loops
    this.voices = [];       // live voices awaiting disposal
    this.buffers = shared ? shared.buffers : this.#makeNoise();
    this.paramProto = timeScale === 1 ? null : timedParamProto(this);
  }

  // --- time map (story → film) ----------------------------------------------

  /** Film time of story time t (anchored inside a oneShot). */
  T(t) {
    const { k, anchor } = this.clock;
    return anchor == null ? t * k : anchor * k + (t - anchor);
  }

  /** Film length of a story-time span (a duration or time constant). */
  span(d) { return this.clock.anchor == null ? d * this.clock.k : d; }

  /** Story-time length that sounds for `sec` real seconds (for physical details). */
  phys(sec) { return this.clock.anchor == null ? sec / this.clock.k : sec; }

  /** Run `fn` with time anchored at t0: offsets from t0 keep their physical length. */
  oneShot(t0, fn) {
    const c = this.clock;
    if (c.anchor != null) return fn();
    c.anchor = t0;
    try { return fn(); } finally { c.anchor = null; }
  }

  /** Route a node's AudioParams through the time map. */
  timed(node, ...params) {
    if (this.paramProto) for (const p of params) Object.setPrototypeOf(node[p], this.paramProto);
    return node;
  }

  /**
   * A view of this studio with its own RNG seeded from `key`: pre-rendered buffers
   * are synthesised through it, so they come out identical whoever renders them
   * first (a build callback or the idle-time warm-up).
   */
  seeded(key) {
    const v = Object.create(this);
    v.random = mulberry32(hashKey(key));
    return v;
  }

  /** Queue buffer synthesis to run on the main thread while the renderer is busy. */
  warm(fn) { (this.warmups ??= []).push(fn); }

  /** Humanised time: t plus a random offset in ±ms/2 real ms (one-sided when `late`). */
  human(t, ms = 10, late = false) {
    const j = (late ? this.random() : this.random() - 0.5) * this.phys(ms * 0.001);
    return Math.max(0, t + j);
  }

  /** Round-robin index per instrument key (deterministic). */
  robin(key, n) {
    this._rr ??= new Map();
    const v = ((this._rr.get(key) ?? -1) + 1 + (this.random() < 0.3 ? 1 : 0)) % n;
    this._rr.set(key, v);
    return v;
  }

  rand(a = 0, b = 1) { return a + (b - a) * this.random(); }
  pick(list) { return list[Math.floor(this.random() * list.length)]; }

  // --- scheduling -----------------------------------------------------------

  /**
   * Register an event at story time t; `build()` creates its nodes (all times absolute, >= t).
   * Builds may register further events (e.g. a note's release automation, so that its
   * filter is not automated — sample-accurate, 3× the cost — through the hold).
   */
  at(t, build) {
    const e = { t: Math.max(0, this.T(t)), build };
    if (this.cursor == null) { this.events.push(e); return; }
    // while rendering: insert into the pending (sorted) part of the queue
    const ev = this.events;
    let lo = this.cursor, hi = ev.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ev[mid].t <= e.t) lo = mid + 1; else hi = mid; }
    ev.splice(lo, 0, e);
  }

  /**
   * Render the whole score. Events are built one window ahead of the playhead,
   * and finished voices are disconnected at each window boundary — both keep the
   * number of nodes the renderer has to visit per quantum small.
   */
  async render() {
    const { ctx, events } = this;
    events.sort((a, b) => a.t - b.t);
    this.cursor = 0;
    const buildUntil = (limit) => {
      while (this.cursor < events.length && events[this.cursor].t < limit) events[this.cursor++].build();
    };
    const dispose = (now) => {
      this.voices = this.voices.filter((v) => {
        if (v.end > now) return true;
        for (const n of v.nodes) n.disconnect();
        return false;
      });
    };
    const W = 0.25; // seconds per window; events are built 1–2 windows early
    let failure = null;
    buildUntil(2 * W);
    for (let w = W; w < this.duration - W / 2; w += W) {
      ctx.suspend(w).then(() => {
        try {
          dispose(w);
          if (!failure) buildUntil(w + 2 * W);
        } catch (err) {
          failure = err; // never leave the context suspended
        }
        ctx.resume();
      });
    }
    const rendering = ctx.startRendering();
    // idle-time warm-up: synthesise queued one-shots in small slices between
    // render windows, while the render thread works through the quiet opening
    const queue = this.warmups ?? [];
    const pump = () => {
      if (!queue.length || failure) return;
      try { queue.shift()(); } catch (err) { failure = err; }
      setTimeout(pump, 0);
    };
    setTimeout(pump, 0);
    const buffer = await rendering;
    if (failure) throw failure;
    return buffer;
  }

  // --- mixing -----------------------------------------------------------------

  /** A mix bus: input gain → `to` (dry), plus any number of [destination, level] sends. */
  addBus(name, { to, gain = 1, sends = [] }) {
    const g = this.gain(gain);
    g.connect(to);
    for (const [dest, level] of sends) if (level > 0) g.connect(this.gain(level)).connect(dest);
    this.buses.set(name, g);
    return g;
  }

  bus(name) {
    const b = this.buses.get(name);
    if (!b) throw new Error(`unknown bus ${name}`);
    return b;
  }

  /** Route `node` to a bus, through a StereoPanner when pan is non-zero. */
  out(node, bus, pan = 0) {
    if (pan) {
      const p = this.panner(pan);
      node.connect(p).connect(this.bus(bus));
      return p;
    }
    node.connect(this.bus(bus));
    return node;
  }

  /** Disconnect these nodes once the last of their sources has stopped. */
  free(...nodes) {
    const end = Math.max(...nodes.map((n) => n._end ?? 0));
    this.voices.push({ end: end + 0.02, nodes });
  }

  // --- node factories ---------------------------------------------------------

  // (every factory takes story times; `_end` — used by free() — is in film time)

  gain(v = 0) {
    const g = this.timed(this.ctx.createGain(), 'gain');
    g.gain.value = v;
    return g;
  }

  filter(type, freq, Q = 0.707) {
    const f = this.timed(this.ctx.createBiquadFilter(), 'frequency', 'Q', 'gain', 'detune');
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  panner(p = 0) {
    const n = this.timed(this.ctx.createStereoPanner(), 'pan');
    n.pan.value = clamp(p, -1, 1);
    return n;
  }

  osc(type, freq, t0, t1) {
    const o = this.timed(this.ctx.createOscillator(), 'frequency', 'detune');
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.start(this.T(t0));
    o.stop(o._end = this.T(t1));
    return o;
  }

  /** Looping buffer source from story time t0 to t1, entering the loop at `offset` (s). */
  loop(buf, t0, t1, { offset = 0, rate = 1 } = {}) {
    const src = this.timed(this.ctx.createBufferSource(), 'playbackRate', 'detune');
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(this.T(t0), offset);
    src.stop(src._end = this.T(t1));
    return src;
  }

  /** Looping noise source starting at a random point of a shared buffer. */
  noise(kind, t0, t1, { stereo = false, rate = 1 } = {}) {
    return this.loop(this.buffers[stereo ? `${kind}2` : kind], t0, t1, { offset: this.rand(0, NOISE_SECONDS - 0.1), rate });
  }

  /** One-shot buffer from story time t0 (plays at its own, physical length). */
  buffer(buf, t0, rate = 1) {
    const src = this.timed(this.ctx.createBufferSource(), 'playbackRate', 'detune');
    src.buffer = buf;
    src.playbackRate.value = rate;
    const t = this.T(t0);
    src.start(t);
    src._end = t + buf.duration / rate;
    return src;
  }

  /** Sample a function of time into a Float32Array for setValueCurveAtTime. */
  curve(seconds, rate, fn) {
    const n = Math.max(2, Math.ceil(seconds * rate));
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = fn(i / rate, i);
    return c;
  }

  // --- shared noise ----------------------------------------------------------

  #makeNoise() {
    const { sr, ctx } = this;
    const n = NOISE_SECONDS * sr;
    const r = () => this.random() * 2 - 1;
    const make = (channels, fill) => {
      const b = ctx.createBuffer(channels, n, sr);
      for (let c = 0; c < channels; c++) {
        const d = b.getChannelData(c);
        fill(d);
        // Normalise to RMS 0.3 so every noise colour sits at a comparable level,
        // and crossfade the loop seam.
        let e = 0;
        for (let i = 0; i < n; i++) e += d[i] * d[i];
        const k = 0.3 / Math.sqrt(e / n);
        const fade = Math.floor(0.01 * sr);
        for (let i = 0; i < n; i++) d[i] *= k;
        for (let i = 0; i < fade; i++) {
          const u = i / fade;
          d[i] = d[i] * u + d[n - fade + i] * (1 - u);
        }
      }
      return b;
    };
    const white = (d) => { for (let i = 0; i < d.length; i++) d[i] = r(); };
    const pink = (d) => { // Paul Kellet's economy pink filter
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = r();
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = b0 + b1 + b2 + w * 0.1848;
      }
    };
    const brown = (d) => {
      let y = 0;
      for (let i = 0; i < d.length; i++) {
        y = (y + 0.02 * r()) * 0.998;
        d[i] = y;
      }
    };
    // Sparse electrical crackle: power-law sized micro-bursts, ~450 per second.
    const crackle = (d) => {
      d.fill(0);
      let i = 0;
      while (i < d.length) {
        i += Math.floor(-Math.log(1 - this.random()) * sr / 450) + 1;
        const amp = this.random() ** 3 * (this.random() < 0.5 ? -1 : 1);
        const len = Math.floor(sr * (0.0002 + this.random() * 0.0018));
        for (let j = 0; j < len && i + j < d.length; j++) d[i + j] += amp * r() * (1 - j / len) ** 2;
      }
    };
    return {
      white: make(1, white), white2: make(2, white),
      pink: make(1, pink), pink2: make(2, pink),
      brown: make(1, brown), brown2: make(2, brown),
      crackle: make(1, crackle),
    };
  }
}
