// EXPERIENCE: the film as a slow-motion, game-like flythrough with no narration.
// Time runs on its own wall clock (not the soundtrack's audio clock) at 0.25× to 1× (0.35× by
// default); the live camera flies itself as a drone (LiveCam.setDrone); the engine draws a clean
// picture (engine.clean: no HUD, titles or interludes; the chapter headings stay); an ambient
// score is generated live (audio/ambient.js). At the end it holds on the finale for a few
// seconds while the drone keeps circling, fades, and loops back to the opening.
import { FILM_DURATION as DURATION, TIME_SCALE } from '../timeline.js';
import { headingList, kickTiming, onBeat } from '../lib/headings.js';

export const SPEEDS = [0.35, 0.5, 1, 0.25];   // the speed button cycles through these
const HOLD_AT = DURATION - 0.75;               // film time of the closing hold (just before the fade)
const HOLD_S = 7;                              // wall seconds held there

// The chapter headings' letter events on the film clock, for the ambient score: each letter's
// flight (whip), landing (tick) and shine (ping), panned to its place in the word.
function letterEvents() {
  const ev = [];
  for (const h of headingList()) {
    const t0 = onBeat(h.t0, h.swap ? 2 : 1), n = h.text.length, k = kickTiming(n, h.swap, h.pace, t0);
    for (let i = 0; i < n; i++) {
      const pan = (n > 1 ? (i / (n - 1)) * 2 - 1 : 0) * 0.7, side = pan > 0.05 ? 1 : pan < -0.05 ? -1 : (i % 2 ? 1 : -1);
      const tf = t0 + i * k.slot;
      if (!h.swap || i === 0) ev.push({ t: tf * TIME_SCALE, kind: 'whip', pan, side, fly: (h.swap ? k.inDur : k.fly) * TIME_SCALE, swap: h.swap });
      ev.push({ t: (tf + k.land) * TIME_SCALE, kind: 'tick', pan, i, swap: h.swap });
      if (!h.swap || i === 0 || i === n - 1) ev.push({ t: (t0 + k.shine0 + i * k.shineSlot) * TIME_SCALE, kind: 'ping', pan, i, swap: h.swap });
    }
  }
  return ev.sort((a, b) => a.t - b.t);
}

export class Experience {
  constructor(engine, { live, ambient = null, onTick = () => {}, onLoop = () => {} } = {}) {
    Object.assign(this, { engine, live, ambient, onTick, onLoop });
    this.active = false;
    this.playing = false;
    this.t = 0;
    this.speed = SPEEDS[0];
    this.hold = 0;
    this.chapter = null;
    this.letters = letterEvents();
  }

  get currentTime() { return this.t; }

  enter(filmT = 0, { play = true } = {}) {
    this.active = true;
    this.t = Math.max(0, Math.min(DURATION - 0.01, filmT));
    this.hold = 0;
    this.chapter = null;
    this.engine.clean = true;
    this.live.setDrone(true);
    if (play) this.play(); else this.render();
  }

  // Leave: returns the film time to hand back to the film.
  exit() {
    if (!this.active) return this.t;
    this.playing = false;
    cancelAnimationFrame(this._raf); this._raf = 0;
    this.ambient?.stop();
    this.live.setDrone(false);
    this.engine.clean = false;
    this.active = false;
    return this.t;
  }

  play() {
    if (!this.active) return;
    if (this.t >= DURATION - 0.02) this.t = 0;
    this.ambient?.play();     // inside the user's tap: resumes / unlocks the audio
    if (this.playing) return;
    this.playing = true;
    this._loop();
  }

  // keepAudio: the score keeps playing (e.g. while exploring the frozen scene)
  pause({ keepAudio = false } = {}) {
    if (!this.active) return;
    this.playing = false;
    if (!keepAudio) this.ambient?.pause();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  seek(t) {
    this.t = Math.max(0, Math.min(DURATION - 0.01, t));
    this.hold = 0;
    if (!this.playing) this.render();
  }

  setSpeed(s) { this.speed = s; }
  cycleSpeed() { this.speed = SPEEDS[(SPEEDS.indexOf(this.speed) + 1) % SPEEDS.length]; return this.speed; }

  render(dt = 0) {
    this.engine.render(this.t, dt);
    this.onTick(this.t);
  }

  // Advance the flight by `wall` seconds of wall clock; returns the film-time step.
  step(wall) {
    let dt = wall * this.speed;
    if (this.t >= HOLD_AT && this.hold < HOLD_S) {   // closing hold: time stands still, the drone circles on
      this.hold += wall; dt = 0;
    } else {
      this.t += dt;
      if (this.t >= DURATION) { this.t = 0; this.hold = 0; dt = 0; this.onLoop(); }
    }
    // the headings forming, letter by letter (only when time actually moves forward, not on a loop)
    if (dt > 0 && this.ambient) this._letters(this.t - dt, this.t);
    // a soft swell in the score at each chapter change
    const seg = this.engine.mainInstance(this.t / TIME_SCALE).segment.id;
    if (this.chapter && seg !== this.chapter) this.ambient?.swell();
    this.chapter = seg;
    return dt;
  }

  _letters(a, b) {
    const A = this.ambient, sp = this.speed;
    for (const e of this.letters) {
      if (e.t <= a) continue;
      if (e.t > b) break;
      const q = e.swap ? 0.7 : 1;
      if (e.kind === 'whip') A.whip(e.side * 0.9, e.pan, e.fly / sp, 0.07 * q);
      else if (e.kind === 'tick') A.tick(e.pan, e.i, 0.05 * q);
      else A.ping(e.i, e.pan, 0.09 * q);
    }
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    let prev = performance.now(), slow = 0, frames = 0;
    const frame = () => {
      if (!this.playing || !this.active) { this._raf = 0; return; }
      const now = performance.now(), wall = Math.min(0.25, Math.max(0, (now - prev) / 1000));   // a stall is not a jump
      // in a VR / AR session the headset's frame loop drives the clock (core/xr.js calls step())
      if (this.engine.xrActive) { prev = now; this._raf = requestAnimationFrame(frame); return; }
      // adaptive resolution, as in the player: frames that keep taking > 45 ms render smaller
      if (++frames > 20) {
        slow = now - prev > 45 ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 24) { slow = 0; frames = 0; this.engine.degrade(); }
      }
      prev = now;
      const dt = this.step(wall);
      try { this.render(dt); } catch (e) {
        if (!this._warned) { console.error('[experience] render failed', e); this._warned = true; }
      }
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }
}
