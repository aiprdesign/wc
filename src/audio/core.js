// Studio — the offline rendering environment shared by every instrument.
//
// Owns the OfflineAudioContext, a seeded RNG (the score renders identically every
// time), a handful of shared noise buffers, the mix buses, and a just-in-time
// event scheduler: events are registered with `at(time, build)` and their nodes
// are only created ~1–2 s before they sound (OfflineAudioContext suspend/resume),
// so the live audio graph stays small however many events the score contains.

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const db = (x) => 10 ** (x / 20);
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

const NOISE_SECONDS = 4;

export class Studio {
  constructor(sampleRate, seconds, seed = 1492) {
    this.sr = sampleRate;
    this.duration = seconds;
    this.ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    this.random = mulberry32(seed);
    this.events = [];
    this.buses = new Map();
    this.cache = new Map(); // rendered modal-voice buffers
    this.voices = [];       // live voices awaiting disposal
    this.buffers = this.#makeNoise();
  }

  rand(a = 0, b = 1) { return a + (b - a) * this.random(); }
  pick(list) { return list[Math.floor(this.random() * list.length)]; }

  // --- scheduling -----------------------------------------------------------

  /** Register an event; `build()` creates its nodes (all times absolute, >= t). */
  at(t, build) { this.events.push({ t: Math.max(0, t), build }); }

  /**
   * Render the whole score. Events are built one window ahead of the playhead,
   * and finished voices are disconnected at each window boundary — both keep the
   * number of nodes the renderer has to visit per quantum small.
   */
  async render() {
    const { ctx, events } = this;
    events.sort((a, b) => a.t - b.t);
    let next = 0;
    const buildUntil = (limit) => {
      while (next < events.length && events[next].t < limit) events[next++].build();
    };
    const dispose = (now) => {
      this.voices = this.voices.filter((v) => {
        if (v.end > now) return true;
        for (const n of v.nodes) n.disconnect();
        return false;
      });
    };
    const W = 0.125; // seconds per window; events are built 1–2 windows early
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
    const buffer = await ctx.startRendering();
    if (failure) throw failure;
    return buffer;
  }

  // --- mixing -----------------------------------------------------------------

  /** A mix bus: input gain → `to` (dry) and, optionally, → `reverb` via a send. */
  addBus(name, { to, gain = 1, reverb = null, send = 0 }) {
    const g = this.gain(gain);
    g.connect(to);
    if (reverb && send > 0) g.connect(this.gain(send)).connect(reverb);
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
    if (globalThis.__acct) {
      const fr = new Error().stack.split('\n')[2].trim().split(' ')[1];
      globalThis.__acct[fr] = (globalThis.__acct[fr] || 0) + nodes.length * (end + 0.02 - this.ctx.currentTime);
    }
    this.voices.push({ end: end + 0.02, nodes });
  }

  // --- node factories ---------------------------------------------------------

  gain(v = 0) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  filter(type, freq, Q = 0.707) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = Q;
    return f;
  }

  panner(p = 0) {
    const n = this.ctx.createStereoPanner();
    n.pan.value = clamp(p, -1, 1);
    return n;
  }

  acct(t0, t1, kind) {
    return;
    const fr = new Error().stack.split('\n')[3].trim().split(' ')[1];
    const k = fr + ':' + kind;
    globalThis.__acct[k] = (globalThis.__acct[k] || 0) + (t1 - t0);
  }

  osc(type, freq, t0, t1) {
    this.acct(t0, t1, 'osc');
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.start(t0);
    o.stop(t1);
    o._end = t1;
    return o;
  }

  /** Looping noise source starting at a random point of a shared buffer. */
  noise(kind, t0, t1, { stereo = false, rate = 1 } = {}) {
    this.acct(t0, t1, 'noise');
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[stereo ? `${kind}2` : kind];
    src.loop = true;
    src.playbackRate.value = rate;
    src.start(t0, this.rand(0, NOISE_SECONDS - 0.1));
    src.stop(t1);
    src._end = t1;
    return src;
  }

  buffer(buf, t0, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.start(t0);
    src._end = t0 + buf.duration / rate;
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
