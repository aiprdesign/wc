// EXPORT VIDEO (frame-perfect): renders the film offline in the browser, one frame at a time at a
// fixed frame rate, and encodes every frame with WebCodecs, so nothing is skipped however slow the
// device is (live Record captures in real time and drops whatever the GPU can't keep up with).
//   picture: engine.render(T = i / fps, 1 / fps) → new VideoFrame(canvas) → VideoEncoder
//            (H.264 in MP4; VP9 / VP8 in WebM where H.264 can't be encoded)
//   sound:   the loaded soundtrack AudioBuffer, cut into AudioData blocks on the same timeline → AudioEncoder
//            (AAC in MP4, else Opus; Opus in WebM); no audio encoder → a silent file, and the dialog says so
//   muxing:  mp4-muxer / webm-muxer (vendor/, MIT), streamed into a Blob; nothing is kept twice
// Sequences are pure functions of time, so an exported frame is exactly the frame playback would show.
// No WebCodecs (older Safari / Firefox): the dialog points to tools/render.mjs (npm run render:*).
import { FILM_DURATION, OUTPUT_ASPECT, TIME_SCALE } from '../timeline.js';

export const hasWebCodecs = () => typeof VideoEncoder === 'function' && typeof VideoFrame === 'function' && typeof EncodedVideoChunk === 'function';
const hasAudioCodecs = () => typeof AudioEncoder === 'function' && typeof AudioData === 'function';

// Frame format → file-name tag (the format links' names; 1:1 as render.mjs names it)
export function formatTag(aspect = OUTPUT_ASPECT) {
  const known = [[2.39, 'wide'], [1, '1x1'], [16 / 9, '16x9'], [9 / 16, '9x16'], [2 / 3, '2x3'], [4 / 5, '4x5']];
  return known.find(([a]) => Math.abs(a - aspect) < 1e-3)?.[1] ?? `${aspect.toFixed(2).replace('.', 'x')}`;
}
export function formatLabel(aspect = OUTPUT_ASPECT) {
  return { wide: '2.39 cinema', '1x1': '1:1 square', '16x9': '16:9 landscape', '9x16': '9:16 vertical', '2x3': '2:3 vertical', '4x5': '4:5 vertical' }[formatTag(aspect)] ?? `${aspect.toFixed(2)}:1`;
}

const even = (v) => Math.max(2, 2 * Math.round(v / 2));
const OPUS_PRESKIP_NS = (312 / 48000) * 1e9;

// Export size for a resolution class. 720 / 1080 fit the frame inside a 16:9 box (1280×720 /
// 1920×1080), or a 9:16 box for vertical formats, as the render scripts do: 2.39 → 1920×804,
// 1:1 → 1080×1080, 9:16 → 1080×1920, 2:3 → 1080×1620. 'screen' is the canvas as this window shows it
// (CSS size × device pixels, at most 2×), longest side ≤ 3840. Always even (4:2:0 video).
export function exportSize(res, aspect = OUTPUT_ASPECT, screen = null) {
  let w, h;
  if (res === 'screen') {
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    const sw = (screen?.width ?? globalThis.innerWidth ?? 1280) * dpr, sh = (screen?.height ?? globalThis.innerHeight ?? 720) * dpr;
    w = sw; h = sw / aspect;
    if (h > sh) { h = sh; w = sh * aspect; }
    const k = Math.min(1, 3840 / Math.max(w, h));
    w *= k; h *= k;
  } else {
    const r = Number(res) || 720, long = r * 16 / 9;
    const [bw, bh] = aspect >= 1 ? [long, r] : [r, long];
    w = bw; h = bw / aspect;
    if (h > bh) { h = bh; w = bh * aspect; }
  }
  return { width: even(w), height: even(h) };
}

// Bits per second: ~0.24 bit per pixel per frame at 30 fps (1080p → ~15 Mbps, 720p → ~6.6 Mbps);
// the film's grain and fine particles need the headroom.
export const videoBitrate = (w, h, fps) => Math.round(Math.max(4e6, Math.min(40e6, w * h * 30 * 0.24 * (fps / 30) ** 0.7)));

// H.264 levels: [level_idc, max macroblocks per frame, max macroblocks per second]
const AVC_LEVELS = [[0x1e, 1620, 40500], [0x1f, 3600, 108000], [0x20, 5120, 216000], [0x28, 8192, 245760], [0x2a, 8704, 522240], [0x32, 22080, 589824], [0x33, 36864, 983040], [0x34, 36864, 2073600]];
// VP9 levels: [level (×10), max luma samples per frame, max luma samples per second]
const VP9_LEVELS = [[31, 983040, 36864000], [40, 2228224, 83558400], [41, 2228224, 160432128], [50, 8912896, 311951360], [51, 8912896, 588251136], [60, 35651584, 1176502272]];

async function supported(config) {
  try { const r = await VideoEncoder.isConfigSupported(config); return r.supported ? r.config ?? config : null; } catch { return null; }
}

// The best video codec this browser can encode at w × h: H.264 (High → Main → Baseline, from the
// lowest level that fits) in MP4, else VP9, else VP8 in WebM. null when none can.
// container 'mp4' (testing only: headless Chromium has no H.264 encoder) puts VP9 in MP4 instead of WebM.
export async function pickVideoCodec(w, h, fps, bitrate = videoBitrate(w, h, fps), { container } = {}) {
  if (!hasWebCodecs()) return null;
  const base = { width: w, height: h, bitrate, framerate: fps, bitrateMode: 'variable', latencyMode: 'quality' };
  const mbs = Math.ceil(w / 16) * Math.ceil(h / 16), rate = mbs * fps;
  const levels = AVC_LEVELS.filter(([, fs, mr]) => mbs <= fs && rate <= mr).map(([l]) => l.toString(16).padStart(2, '0'));
  for (const profile of ['6400', '4d00', '4200']) {         // High, Main, Constrained Baseline
    for (const lv of levels) {
      const codec = `avc1.${profile}${lv}`;
      if (await supported({ ...base, codec, avc: { format: 'avc' } })) return { container: 'mp4', codec, mux: 'avc', name: 'H.264', config: { ...base, codec, avc: { format: 'avc' } } };
    }
  }
  const px = w * h;
  for (const [lv, fs, sr] of VP9_LEVELS) {
    if (px > fs || px * fps > sr) continue;
    const codec = `vp09.00.${lv}.08`;
    if (await supported({ ...base, codec })) return container === 'mp4' ? { container: 'mp4', codec, mux: 'vp9', name: 'VP9', config: { ...base, codec } } : { container: 'webm', codec, mux: 'V_VP9', name: 'VP9', config: { ...base, codec } };
    break;
  }
  if (await supported({ ...base, codec: 'vp8' })) return { container: 'webm', codec: 'vp8', mux: 'V_VP8', name: 'VP8', config: { ...base, codec: 'vp8' } };
  return null;
}

// Audio codec for the container: MP4 → AAC-LC, else Opus; WebM → Opus. null when neither encodes.
export async function pickAudioCodec(container, sampleRate, channels) {
  if (!hasAudioCodecs()) return null;
  const tries = [];
  if (container === 'mp4') tries.push({ codec: 'mp4a.40.2', mux: 'aac', name: 'AAC', bitrate: 192000 });
  tries.push({ codec: 'opus', mux: container === 'mp4' ? 'opus' : 'A_OPUS', name: 'Opus', bitrate: 160000 });
  for (const t of tries) {
    // the soundtrack's own rate first, then 48 kHz (resampled): Opus only takes 8 / 12 / 16 / 24 / 48 kHz
    for (const sr of [...new Set([sampleRate, 48000])]) {
      const config = { codec: t.codec, sampleRate: sr, numberOfChannels: channels, bitrate: t.bitrate };
      try { if ((await AudioEncoder.isConfigSupported(config)).supported) return { ...t, config, sampleRate: sr }; } catch { /* try the next */ }
    }
  }
  return null;
}

async function resample(buffer, rate, channels) {
  if (buffer.sampleRate === rate && buffer.numberOfChannels === channels) return buffer;
  const ctx = new OfflineAudioContext(channels, Math.ceil(buffer.length * rate / buffer.sampleRate), rate);
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.connect(ctx.destination); src.start();
  return ctx.startRendering();
}

// The muxers write mostly in order, then patch a few bytes behind the write head (a cluster's size
// when it closes; the file's sizes, duration and index at the end). ByteSink collects positioned
// writes; every `foldBytes` the written run is folded into a Blob, which the browser may keep out of
// the page's memory (on disk), so a long export at 1080p doesn't hold hundreds of MB in the tab.
// A patch that lands in a folded run is kept aside and spliced in when the file is assembled.
export class ByteSink {
  constructor(foldBytes = 16 << 20) { this.foldBytes = foldBytes; this.reset(); }
  reset() { this.folded = []; this.foldedEnd = 0; this.patches = []; this.parts = []; this.partBytes = 0; this.size = 0; }
  write(data, pos) {
    let d = new Uint8Array(data);   // own copy: the muxer may reuse its buffer
    if (pos < this.foldedEnd) {      // (partly) behind the folded run: remember it as a patch
      const n = Math.min(d.length, this.foldedEnd - pos);
      this.patches.push({ pos, data: d.slice(0, n) });
      if (n === d.length) return;
      d = d.subarray(n); pos += n;
    }
    const end = pos + d.length;
    if (pos > this.size) { this.push(this.size, new Uint8Array(pos - this.size)); }
    if (pos < this.size) {
      for (const p of this.parts) {
        const a = Math.max(pos, p.pos), b = Math.min(end, p.pos + p.data.length);
        if (a < b) p.data.set(d.subarray(a - pos, b - pos), a - p.pos);
      }
      if (end <= this.size) return;
      d = d.subarray(this.size - pos); pos = this.size;
    }
    this.push(pos, d);
    if (this.partBytes >= this.foldBytes) this.fold();
  }
  push(pos, data) { this.parts.push({ pos, data }); this.partBytes += data.length; this.size = pos + data.length; }
  fold() {
    if (!this.parts.length) return;
    this.folded.push(new Blob(this.parts.map((p) => p.data)));
    this.foldedEnd = this.size;
    this.parts = []; this.partBytes = 0;
  }
  blob(type) {
    let whole = new Blob([...this.folded, ...this.parts.map((p) => p.data)]);
    for (const { pos, data } of this.patches) whole = new Blob([whole.slice(0, pos), data, whole.slice(pos + data.length)]);
    return new Blob([whole], { type });
  }
}

// A task boundary that background tabs don't throttle (unlike setTimeout / rAF): keeps the page
// responsive between frames and keeps exporting while the tab is hidden.
// One channel per export (closed at the end), not one per frame.
function taskYielder() {
  const ch = new MessageChannel();
  let wake = null;
  ch.port1.onmessage = () => { const w = wake; wake = null; w?.(); };
  const next = () => new Promise((r) => { wake = r; ch.port2.postMessage(0); });
  next.close = () => { ch.port1.onmessage = null; ch.port1.close(); ch.port2.close(); wake?.(); };
  return next;
}
const abortError = () => new DOMException('Export cancelled', 'AbortError');

/**
 * Render and encode film time [from, to) at `fps` into a video Blob.
 * engine: the film Engine; audio: the soundtrack AudioBuffer (or null for a silent file).
 * opts: { width, height, fps = 30, from = 0, to = FILM_DURATION, hq = false, signal, onProgress, onStart,
 *         container: 'mp4' (testing: VP9 in MP4 where H.264 can't be encoded), foldBytes (testing: ByteSink) }
 * Returns { blob, ext, container, video, audio, frames, width, height, fps, seconds }.
 * The caller pins nothing: this pins the engine at width × height for the export and unpins it after.
 */
export async function exportVideo(engine, audio, opts = {}) {
  if (!hasWebCodecs()) throw new Error('This browser has no WebCodecs video encoder.');
  const fps = opts.fps ?? 30, from = Math.max(0, opts.from ?? 0), to = Math.min(FILM_DURATION, opts.to ?? FILM_DURATION);
  const width = even(opts.width ?? 1280), height = even(opts.height ?? width / OUTPUT_ASPECT);
  const N = Math.max(1, Math.round((to - from) * fps));
  const signal = opts.signal;
  const hq = !!opts.hq, lite = engine.quality === 'lite';
  const motionBlur = hq ? 8 : 0;
  const bitrate = opts.bitrate ?? videoBitrate(width, height, fps);

  // encoders (H.264 level 5.2: 4096 × 2304) and the GPU's render targets both have limits
  const maxSide = Math.min(4096, engine.renderer.capabilities.maxTextureSize || 4096);
  if (Math.max(width, height) > maxSide) throw new Error(`${width}×${height} is larger than this export can render (longest side ${maxSide} px).`);
  const video = await pickVideoCodec(width, height, fps, bitrate, { container: opts.container });
  if (!video) throw new Error(`This browser can't encode ${width}×${height} video (no H.264, VP9 or VP8 encoder).`);
  const channels = audio ? Math.min(2, audio.numberOfChannels) : 0;
  const aCodec = audio ? await pickAudioCodec(video.container, audio.sampleRate, channels) : null;
  const pcm = aCodec ? await resample(audio, aCodec.sampleRate, channels) : null;
  if (signal?.aborted) throw abortError();

  const sink = new ByteSink(opts.foldBytes);
  const target = { onData: (data, position) => sink.write(data, position) };
  let muxer;
  if (video.container === 'mp4') {
    const { Muxer, StreamTarget } = await import('mp4-muxer');
    muxer = new Muxer({
      target: new StreamTarget(target), fastStart: false, firstTimestampBehavior: 'offset',
      video: { codec: video.mux, width, height, frameRate: fps },
      // an edit list trims the encoder's lead-in (Opus pre-skip) and the last packet's padding: the
      // audio presents exactly the video's N / fps seconds, from 0
      audio: aCodec ? { codec: aCodec.mux, numberOfChannels: channels, sampleRate: aCodec.sampleRate, trim: { duration: N / fps } } : undefined,
    });
  } else {
    const { Muxer, StreamTarget } = await import('webm-muxer');
    muxer = new Muxer({
      target: new StreamTarget(target), type: 'webm', firstTimestampBehavior: 'offset',
      video: { codec: video.mux, width, height, frameRate: fps },
      // Opus pre-skip (libopus look-ahead: 312 samples at 48 kHz) as CodecDelay: decoded audio starts at 0
      audio: aCodec ? { codec: 'A_OPUS', numberOfChannels: channels, sampleRate: aCodec.sampleRate, codecDelay: OPUS_PRESKIP_NS, seekPreRoll: 80e6 } : undefined,
    });
  }

  let failure = null;
  const fail = (e) => { failure ??= e instanceof Error || e instanceof DOMException ? e : new Error(String(e)); };
  const venc = new VideoEncoder({ output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { fail(e); } }, error: fail });
  const aenc = aCodec ? new AudioEncoder({ output: (chunk, meta) => { try { muxer.addAudioChunk(chunk, meta); } catch (e) { fail(e); } }, error: fail }) : null;
  const canvas = engine.canvas;
  const gl = engine.renderer.getContext();
  const onLost = () => fail(new Error('The graphics driver reset (WebGL context lost) during the export.'));
  canvas.addEventListener('webglcontextlost', onLost);
  const onAbort = () => fail(abortError());
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) onAbort();   // cancelled while the muxer was loading
  const closeAll = () => {
    for (const enc of [venc, aenc]) { try { if (enc && enc.state !== 'closed') enc.close(); } catch { /* closed */ } }
  };

  const total = pcm ? Math.round((N / fps) * pcm.sampleRate) : 0;   // audio samples = video length exactly
  const s0 = pcm ? Math.round(from * pcm.sampleRate) : 0;
  const planes = pcm ? Array.from({ length: channels }, (_, c) => pcm.getChannelData(c)) : [];
  let apos = 0;
  // Encode the soundtrack up to sample `upto` (relative to `from`; zeros past its end) in whole
  // 0.1 s blocks, so every block starts on an exact microsecond (and millisecond) timestamp and
  // the packets tile the timeline with no rounding gaps; `final` also sends the short last block.
  const block = Math.round((pcm?.sampleRate ?? 48000) / 10);
  const pushAudio = (upto, final = false) => {
    if (!final) upto = Math.floor(upto / block) * block;
    while (aenc && apos < upto) {
      const n = Math.min(upto - apos, block);
      const data = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        const a = s0 + apos, b = Math.min(planes[c].length, a + n);
        if (b > a) data.set(planes[c].subarray(a, b), c * n);
      }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: pcm.sampleRate, numberOfFrames: n, numberOfChannels: channels, timestamp: Math.round((apos / pcm.sampleRate) * 1e6), data });
      try { aenc.encode(ad); } finally { ad.close(); }
      apos += n;
    }
  };

  const nextTask = taskYielder();
  const gop = Math.max(1, Math.round(fps * 2));   // a keyframe every 2 s
  const MAXQ = 4;                                   // frames waiting in the encoder (memory stays bounded)
  engine.pin(width, height, hq ? { supersample: 2, ...(lite ? {} : { ao: true, glare: 0.04 }) } : {});
  const started = performance.now();
  try {
    venc.configure(video.config);
    aenc?.configure(aCodec.config);
    opts.onStart?.({ frames: N, width, height, fps, video: video.name, audio: aCodec?.name ?? null, container: video.container });
    for (let i = 0; i < N; i++) {
      if (failure) throw failure;
      if (gl.isContextLost()) onLost();
      const T = from + i / fps;
      engine.render(T, 1 / fps, { motionBlur });
      const ts = Math.round((i * 1e6) / fps), next = Math.round(((i + 1) * 1e6) / fps);
      const frame = new VideoFrame(canvas, { timestamp: ts, duration: next - ts });
      try { venc.encode(frame, { keyFrame: i % gop === 0 }); } finally { frame.close(); }
      if (pcm) pushAudio(Math.min(total, Math.round(((i + 1) / fps) * pcm.sampleRate)));
      const elapsed = (performance.now() - started) / 1000;
      opts.onProgress?.({ frame: i + 1, frames: N, elapsed, eta: (elapsed / (i + 1)) * (N - i - 1), queue: venc.encodeQueueSize, buffered: sink.partBytes, written: sink.size });
      // backpressure: wait for the encoder to drain (the dequeue event, or a short poll as a fallback)
      while (venc.encodeQueueSize > MAXQ && !failure) {
        await Promise.race([new Promise((r) => venc.addEventListener('dequeue', r, { once: true })), new Promise((r) => setTimeout(r, 10))]);
      }
      await nextTask();
    }
    if (failure) throw failure;
    if (pcm) pushAudio(total, true);
    await Promise.all([venc.flush(), aenc?.flush()]);
    if (failure) throw failure;
    muxer.finalize();
    const type = video.container === 'mp4' ? 'video/mp4' : 'video/webm';
    return {
      blob: sink.blob(type), ext: video.container, container: video.container, video: `${video.name} (${video.codec})`,
      audio: aCodec ? aCodec.name : null, frames: N, width, height, fps, seconds: (performance.now() - started) / 1000,
    };
  } catch (e) {
    // an encoder that failed asynchronously is closed, and the next call throws InvalidStateError
    // first: wait one task for the error callback, so the real cause is what gets reported
    if (!failure) await nextTask();
    throw failure ?? e;
  } finally {
    closeAll();
    nextTask.close();
    sink.reset();   // release the partial file on cancel / error (a finished file lives on in its Blob)
    canvas.removeEventListener('webglcontextlost', onLost);
    signal?.removeEventListener('abort', onAbort);
    engine.unpin();
  }
}

// ---------------------------------------------------------------------------------------------
// Dialog: format, resolution, frame rate, high quality, estimate → Start; then a progress modal
// (frame i / N, %, elapsed, ETA, Cancel) over the canvas itself, which shows each frame as it renders.
// ctx: { engine, getAudio: () => AudioBuffer|null, narration: bool (false: ?novo), isMuted: () => bool,
//        inExperience: () => bool, canStart: () => string|null (a reason not to),
//        prepare: () => restore (quiet the live film; restore puts it back), download(blob, name) }
// (a lost GPU context mid-export: main.js calls contextLost(reload))
export class ExportDialog {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.el = document.getElementById('export-dlg');
    const q = (s) => this.el.querySelector(s);
    this.$ = { fmt: q('[data-x="fmt"]'), res: q('[data-x="res"]'), fps: q('[data-x="fps"]'), hq: q('[data-x="hq"]'), est: q('[data-x="est"]'), note: q('[data-x="note"]'), sound: q('[data-x="sound"]'), warn: q('[data-x="warn"]'), start: q('[data-x="start"]'), setup: q('[data-x="setup"]'), run: q('[data-x="run"]'), bar: q('[data-x="bar"]'), count: q('[data-x="count"]'), time: q('[data-x="time"]'), codec: q('[data-x="codec"]'), cancel: q('[data-x="cancel"]'), close: q('[data-x="close"]'), msg: q('[data-x="msg"]'), done: q('[data-x="done"]') };
    this.$.start.addEventListener('click', () => this.start());
    this.$.cancel.addEventListener('click', () => this.cancel());
    for (const k of ['res', 'fps', 'hq']) this.$[k].addEventListener('change', () => this.refresh());
    // Esc while exporting doesn't drop the work: only Cancel does (a forced close still cancels cleanly)
    this.el.addEventListener('cancel', (e) => { if (this.active) e.preventDefault(); });
    // (a close event arrives a task late: one left over from closing the dialog before this export
    // started finds it open again, and is ignored)
    this.el.addEventListener('close', () => { if (this.active && !this.el.open) this.cancel(); });
    this._perFrame = null;
  }

  open() {
    if (this.active) { this.show(); return; }
    const why = this.ctx.canStart?.();
    this.mode('setup');
    this.$.fmt.textContent = formatLabel();
    const lite = this.ctx.engine.quality === 'lite';
    this.$.warn.textContent = '';
    this.$.msg.textContent = '';
    this.$.start.disabled = !!why;
    if (why) this.$.msg.textContent = why;
    if (!hasWebCodecs()) {
      this.$.start.disabled = true;
      this.$.msg.innerHTML = 'This browser can’t encode video inside the page (WebCodecs is missing: Safari before 16.4, Firefox before 130). Use a current Chrome, Edge, Safari or Firefox, or render the film frame-perfect on a computer with <code>npm run render:16x9</code> (or <code>render:1x1</code>, <code>render:9x16</code>, <code>render:2x3</code>; see tools/render.mjs).';
    }
    // what the file will sound like: the loaded soundtrack (narration unless ?novo), never the mute state
    const audio = this.ctx.getAudio?.() ?? null;
    this.$.sound.textContent = !audio ? 'None: the film was loaded without sound'
      : !hasAudioCodecs() ? 'None: this browser can’t encode audio (the video is silent)'
        : `${this.ctx.narration === false ? 'The score without narration (?novo)' : 'The soundtrack with narration'}${this.ctx.isMuted?.() ? ', although the player is muted' : ''}`;
    this.$.note.textContent = this.ctx.inExperience?.() ? 'Experience mode is a live flythrough: the export is the film itself (its camera, headings and soundtrack), from the first frame to the last.' : '';
    this.lite = lite;
    this.show();
    this.measure();
    this.refresh();
  }

  show() { if (!this.el.open) { if (this.el.showModal) this.el.showModal(); else this.el.setAttribute('open', ''); } }

  mode(m) { this.$.setup.hidden = m !== 'setup'; this.$.run.hidden = m !== 'run'; this.$.done.hidden = m !== 'done'; this.el.dataset.mode = m; }

  settings() {
    const res = this.$.res.value === 'screen' ? 'screen' : Number(this.$.res.value);
    return { ...exportSize(res), res, fps: Number(this.$.fps.value) || 30, hq: this.$.hq.checked };
  }

  // Time one frame at the current size (with a 1-pixel read to wait for the GPU): the estimate scales it.
  measure() {
    const e = this.ctx.engine;
    const shown = e.lastT * TIME_SCALE;   // the frame on screen (put back after timing)
    try {
      const gl = e.renderer.getContext(), px = new Uint8Array(4), T = shown > 1 ? shown : 10;   // (the opening's black first second is no measure)
      const times = [];
      for (let k = 0; k < 3; k++) {
        const t0 = performance.now();
        e.render(T, 0);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        times.push(performance.now() - t0);
      }
      times.shift();   // the first can include one-off work (a scene's lighting built on first use)
      this._perFrame = { ms: Math.min(...times), px: e.outW * e.outH };
      if (T !== shown) e.render(shown, 0);
    } catch { this._perFrame = null; }
  }

  refresh() {
    const s = this.settings(), N = Math.round(FILM_DURATION * s.fps);
    const size = `${s.width}×${s.height}`;
    let est = '';
    if (this._perFrame) {
      const scale = (s.width * s.height) / Math.max(1, this._perFrame.px) * (s.hq ? 4 * 8 * 1.3 : 1);
      const perFrame = this._perFrame.ms * scale + 4 + (s.width * s.height) / 1e6 * 6;   // + readback / encode
      const sec = (perFrame * N) / 1000;
      est = ` · about ${sec < 90 ? `${Math.max(1, Math.round(sec))} s` : sec < 5400 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`} to render here`;
    }
    this.$.est.textContent = `${size} · ${s.fps} fps · 1:48 of film = ${N.toLocaleString()} frames${est}`;
    this.$.warn.textContent = this.lite && (s.res === 1080 || s.res === 'screen' || s.hq)
      ? 'This looks like a phone or tablet: 1080p, screen size and high quality can run out of graphics memory here. 720p is the safe choice.' : '';
  }

  async start() {
    if (this.active) return;
    const why = this.ctx.canStart?.();
    if (why) { this.$.msg.textContent = why; return; }
    const s = this.settings();
    const name = `achievements-of-western-civilization-${formatTag()}-${s.res === 'screen' ? `${Math.min(s.width, s.height)}p` : `${s.res}p`}`;
    try {
      const r = await this.run({ width: s.width, height: s.height, fps: s.fps, hq: s.hq, name });
      if (r) this.finish(r);
    } catch { /* shown by run */ }
  }

  // The export itself (also window.__film.exportVideo). Resolves with the result, or null when cancelled.
  async run({ width, height, fps = 30, hq = false, from = 0, to = FILM_DURATION, name, download = true, container, foldBytes } = {}) {
    if (this.active) throw new Error('An export is already running.');
    if (!hasWebCodecs()) throw new Error('WebCodecs is not available in this browser.');
    this.active = true;
    this.abort = new AbortController();
    this.mode('run');
    this.show();
    this.$.msg.textContent = '';
    this.$.bar.style.width = '0%';
    this.$.count.textContent = 'Preparing…';
    this.$.time.textContent = '';
    this.$.codec.textContent = '';
    document.body.classList.add('exporting');
    const stay = (ev) => { ev.preventDefault(); ev.returnValue = ''; };   // leaving the page mid-export asks first
    addEventListener('beforeunload', stay);
    let restore = null;
    this.stats = { frame: 0, maxQueue: 0, maxBuffered: 0 };
    const audio = this.ctx.getAudio?.() ?? null;
    const fmtT = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
    let lastUI = 0;
    try {
      // streaming: every sequence must be built before frame-perfect rendering starts
      if (this.ctx.whenReady) { this.$.count.textContent = 'Loading the film…'; await this.ctx.whenReady(); }
      restore = this.ctx.prepare();
      const r = await exportVideo(this.ctx.engine, audio, {
        width, height, fps, hq, from, to, container, foldBytes, signal: this.abort.signal,
        onStart: (info) => {
          this.$.codec.textContent = `${info.width}×${info.height} · ${info.fps} fps · ${info.video}${info.audio ? ` + ${info.audio}` : ' · no sound (this browser can’t encode audio)'} · ${info.container.toUpperCase()}${hq ? ' · high quality' : ''}`;
        },
        onProgress: (p) => {
          const st = this.stats;   // (for tests / automation: how deep the encoder queue and the unfolded file ever got)
          st.frame = p.frame; st.maxQueue = Math.max(st.maxQueue, p.queue); st.maxBuffered = Math.max(st.maxBuffered, p.buffered);
          const now = performance.now();
          if (now - lastUI < 100 && p.frame < p.frames) return;
          lastUI = now;
          this.$.bar.style.width = `${((p.frame / p.frames) * 100).toFixed(1)}%`;
          this.$.count.textContent = `Frame ${p.frame.toLocaleString()} / ${p.frames.toLocaleString()} · ${Math.floor((p.frame / p.frames) * 100)}%`;
          this.$.time.textContent = `${fmtT(p.elapsed)} elapsed · ${p.frame < 8 ? 'estimating…' : `about ${fmtT(p.eta)} left`}`;
        },
      });
      const file = `${name ?? `achievements-of-western-civilization-${formatTag()}-${Math.min(r.width, r.height)}p`}.${r.ext}`;
      r.name = file; r.stats = this.stats;
      if (download) this.ctx.download(r.blob, file);
      return r;
    } catch (e) {
      if (e?.name === 'AbortError') { this.close(); return null; }
      console.error('[export]', e);
      this.mode('setup');
      this.$.msg.textContent = `Export failed: ${e?.message ?? e}`;
      if (this._lost) { this.$.msg.textContent += ' Close this to reload the film at a lighter quality.'; this.$.start.disabled = true; }
      throw e;
    } finally {
      this.active = false;
      document.body.classList.remove('exporting');
      removeEventListener('beforeunload', stay);
      if (!this._lost) restore?.();
    }
  }

  finish(r) {
    this.mode('done');
    const mb = (r.blob.size / 1048576).toFixed(1);
    this.$.done.querySelector('[data-x="done-text"]').textContent = `Saved ${r.name}: ${r.frames.toLocaleString()} frames, ${r.width}×${r.height}, ${r.fps} fps, ${r.video}${r.audio ? ` + ${r.audio}` : ', no sound'}, ${mb} MB, rendered in ${Math.round(r.seconds)} s.`;
  }

  cancel() { if (this.active) this.abort?.abort(); }

  close() { if (this.el.open) this.el.close(); }

  // The GPU context died mid-export: stop, say so, and reload (lighter) once the dialog is closed.
  contextLost(reload) {
    this._lost = true;
    this.el.addEventListener('close', () => reload(), { once: true });
  }
}
