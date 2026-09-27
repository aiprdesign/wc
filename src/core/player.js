// Transport: audio-clock-driven playback, seeking, pause, mute and WebM recording.
// The soundtrack is pre-rendered into an AudioBuffer, so the audio clock is the master
// and picture stays locked to sound even under load.
import { DURATION } from '../timeline.js';

export class Player {
  constructor(engine, buffer) {
    this.engine = engine;
    this.buffer = buffer;
    this.ctx = buffer ? new AudioContext({ sampleRate: buffer.sampleRate }) : null;
    this.gain = this.ctx ? this.ctx.createGain() : null;
    if (this.gain) this.gain.connect(this.ctx.destination);
    this.playing = false;
    this.time = 0;           // film time when paused
    this.startedAt = 0;      // audio-clock (or perf) time corresponding to film time 0
    this.source = null;
    this.onEnd = () => {};
    this.onTick = () => {};
    this.muted = false;
  }

  now() { return this.ctx ? this.ctx.currentTime : performance.now() / 1000; }

  get currentTime() { return this.playing ? Math.min(DURATION, this.now() - this.startedAt) : this.time; }

  async play(from = this.time) {
    if (from >= DURATION - 0.05) from = 0;
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
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

  pause() {
    if (!this.playing) return;
    this.time = this.currentTime;
    this.playing = false;
    this.stopSource();
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
      const t = this.currentTime;
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
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      this.recordDest = null;
      onDone(new Blob(chunks, { type: 'video/webm' }));
    };
    const prevEnd = this.onEnd;
    this.onEnd = () => { this.onEnd = prevEnd; prevEnd(); setTimeout(() => rec.stop(), 300); };
    rec.start(250);
    await this.play(0);
    return rec;
  }
}
