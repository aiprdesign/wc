// Transport: audio-clock-driven playback, seeking, pause, mute and MP4 (or WebM) recording.
// The soundtrack is pre-rendered into an AudioBuffer, so the audio clock is the master
// and picture stays locked to sound even under load.
import { FILM_DURATION as DURATION } from '../timeline.js';

export class Player {
  constructor(engine, buffer) {
    this.engine = engine;
    this.buffer = buffer;
    // default device rate: forcing 48 kHz fails or goes silent on some phones (iOS runs at 44.1 kHz);
    // buffer sources resample on their own
    this.ctx = buffer ? new (window.AudioContext || window.webkitAudioContext)() : null;
    // iOS: play as media, so the ring/silent switch does not mute the film (Safari 16.4+)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
    this.gain = this.ctx ? this.ctx.createGain() : null;
    if (this.gain) this.gain.connect(this.ctx.destination);
    this.playing = false;
    this.time = 0;           // film time when paused
    this.startedAt = 0;      // audio-clock (or perf) time corresponding to film time 0
    this.source = null;
    this.onEnd = () => {};
    this.onTick = () => {};
    this.muted = false;
    this.range = null;       // [from, to) film time: playback loops inside it (AR Lite's one chapter)
  }

  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  get currentTime() { return this.playing ? Math.min(DURATION, this.now() - this.startedAt) : this.time; }

  async play(from = this.time) {
    this.waiting = false;
    if (this.range && (from < this.range[0] || from >= this.range[1] - 0.05)) from = this.range[0];
    if (from >= DURATION - 0.05) from = 0;
    // resume inside the tap (mobile browsers only unlock audio from a user gesture) — don't await
    // before the source starts, or the gesture is lost on iOS
    if (this.ctx && this.ctx.state !== 'running') { const r = this.ctx.resume(); this.unlock(); await r.catch(() => {}); }
    this.stopSource();
    this.time = from;
    if (this.ctx && this.buffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.gain);
      if (this.recordDest) src.connect(this.recordDest);
      const when = this.ctx.currentTime + 0.05;
      src.start(when, from);
      this.startedAt = when - from;
      this.source = src;
    } else {
      this.startedAt = this.now() - from;
    }
    this.playing = true;
    this.loop();
  }

  // iOS unlock: a one-sample silent buffer started inside the gesture wakes the audio output
  unlock() {
    if (this._unlocked || !this.ctx) return;
    try { const b = this.ctx.createBuffer(1, 1, this.ctx.sampleRate), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._unlocked = true; } catch { /* ignore */ }
  }

  pause() {
    if (!this.playing) return;
    this.time = this.currentTime;
    this.playing = false;
    this.stopSource();
  }

  // past the end of the loop range: back to its start (true when it looped)
  wrap() {
    if (!this.range || !this.playing || this.currentTime < this.range[1]) return false;
    this.play(this.range[0]);
    return true;
  }

  toggle() { return this.playing ? this.pause() : this.play(); }

  seek(t) {
    t = Math.max(0, Math.min(DURATION - 0.001, t));
    if (this.playing) this.play(t);
    else { this.time = t; this.engine.render(t, 0); this.onTick(t); }
  }

  setMuted(m) { this.muted = m; if (this.gain) this.gain.gain.value = m ? 0 : 1; }

  stopSource() {
    if (this.source) { try { this.source.stop(); } catch { /* already stopped */ } this.source.disconnect(); this.source = null; }
  }

  loop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    let last = this.currentTime;
    let slow = 0, frames = 0, prevWall = performance.now();
    const frame = () => {
      if (!this.playing) return;
      if (this.wrap()) return;
      const t = this.currentTime;
      // streaming: the film ahead isn't built yet — stop here; onWait resumes once it is
      if (this.gate && !this.gate(t)) { this.pause(); this.waiting = true; this.onWait?.(t); return; }
      try {
        this.engine.render(t, Math.min(0.1, Math.max(0, t - last)));
      } catch (e) {
        if (!this._renderWarned) { console.error('[player] render failed', e); this._renderWarned = true; }
      }
      last = t;
      // Adaptive resolution: if frames keep taking longer than ~45 ms, render smaller.
      const now = performance.now();
      if (this.adaptive !== false && ++frames > 20) {
        slow = (now - prevWall > 45) ? slow + 1 : Math.max(0, slow - 1);
        if (slow > 24) { slow = 0; frames = 0; this.engine.degrade(); }
      }
      prevWall = now;
      this.onTick(t);
      if (t >= DURATION) { this.playing = false; this.time = DURATION; this.stopSource(); this.onEnd(); return; }
      this._raf = requestAnimationFrame(frame);
    };
    this._raf = requestAnimationFrame(frame);
  }

  // Real-time capture of picture + sound to a WebM file.
  async record(onDone) {
    const stream = this.engine.canvas.captureStream(60);
    if (this.ctx) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.recordDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    }
    // MP4 (H.264 + AAC) wherever the browser can record it (Chrome/Edge 126+, Safari); WebM otherwise
    const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      this.recordDest = null;
      const type = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      onDone(new Blob(chunks, { type }), type === 'video/mp4' ? 'mp4' : 'webm');
    };
    const prevEnd = this.onEnd;
    this.onEnd = () => { this.onEnd = prevEnd; prevEnd(); setTimeout(() => rec.stop(), 300); };
    rec.start(250);
    await this.play(0);
    return rec;
  }
}
