// Entry point: load fonts, sequences and the procedural score, then hand over to the transport UI.
// hashopts first: it narrows a combined fragment (#square&experience) to the format token before
// timeline.js reads it
import { HASH_EXPERIENCE, HASH_XR, HASH_ARLITE, HASH_CHAPTER, restoreHash, setHashExperience } from './core/hashopts.js';
import { Engine } from './core/engine.js';
import { Player } from './core/player.js';
import { Explorer } from './core/explore.js';
import { ExplorePad } from './core/explore-pad.js';
import { LiveCam } from './core/live.js';
import { Experience } from './core/experience.js';
import { XRMode, xrSupport, VR, AR } from './core/xr.js';
import { ExportDialog } from './core/export.js';
import { Ambient } from './audio/ambient.js';
import { loadFonts } from './lib/text.js';
import { loadSceneModules } from './scenes/index.js';
import { SEGMENTS, FILM_DURATION as DURATION, TIME_SCALE, OUTPUT_ASPECT } from './timeline.js';
import { FILM, FILM_ID, FILM_TOKEN, filmHash } from './film.js';

const params = new URLSearchParams(location.search);
const QUALITY = { lite: 1280, low: 1280, medium: 1920, high: 2560, ultra: 3840 };
// Phones, tablets and weak GPUs get the 'lite' path unless a ?q= is given: capped at 1280 px and
// pixel ratio ≤ 1.5, 2× MSAA, shadow maps ≤ 1024², the shared studio environment only, one-fetch
// surface detail, no AO / glare. (A phone's full-quality film ran out of GPU memory.)
const LITE_DEVICE = (() => {
  try {
    const mm = (q) => globalThis.matchMedia?.(q).matches;
    const touchOnly = mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
    const lowMem = navigator.deviceMemory != null && navigator.deviceMemory <= 4;
    const fewCores = navigator.hardwareConcurrency != null && navigator.hardwareConcurrency <= 2;
    // standalone headsets (Quest, Pico, …): mobile GPUs drawing every frame twice at 72–90 Hz
    const headset = /OculusBrowser|Quest|Pico|Wolvic|Mobile VR/i.test(navigator.userAgent);
    return touchOnly || mobileUA || lowMem || fewCores || headset;
  } catch { return false; }
})();
const $ = (id) => document.getElementById(id);

const intro = $('intro'), controls = $('controls'), status = $('status');
const setStatus = (s) => { status.textContent = s; };
const setLoad = (p) => { $('loader').firstElementChild.style.width = `${Math.round(p * 100)}%`; };
// VR / AR: asked up front (it shapes the WebGL context); false wherever WebXR is missing
const xrReady = params.has('still') ? Promise.resolve({ vr: false, ar: false }) : xrSupport();

async function loadScore() {
  if (params.has('noaudio')) return null;
  const { encodeWav } = await import('./audio/wav.js');
  // The mixed soundtrack (score + narration) ships pre-rendered: quick to load and light on phones.
  // ?livescore (or ?novo, the score without the narrator) composes it in the browser instead.
  if (!params.has('livescore') && !params.has('novo')) {
    try {
      const res = await fetch(FILM.soundtrack);
      if (res.ok) {
        const data = await res.arrayBuffer();
        const buffer = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(data);
        return { buffer, encodeWav };
      }
    } catch (e) { console.warn('[audio] soundtrack file unavailable, composing the score', e); }
  }
  try {
    const mod = await import('./audio/score.js');
    const buffer = await mod.renderScore(48000, { voiceOver: !params.has('novo') });
    return { buffer, encodeWav: mod.encodeWav };
  } catch (e) {
    console.warn('[audio] score unavailable, playing silent', e);
    return null;
  }
}

async function boot() {
  restoreHash();
  // ?q= low|medium|high|ultra sets the render width; high/ultra also turn on ambient occlusion,
  // finer shadows, veiling glare and finer bokeh. ?ss=2 supersamples (renders at
  // 2× and filters down), ?ao=0/1 overrides AO, ?shadows=1|2|4 overrides the shadow-map multiplier.
  // AR Lite (#arlite): one chapter, always at lite quality (picked first when the link names none)
  const chapter = HASH_ARLITE ? (HASH_CHAPTER || await pickChapter()) : '';
  const quality = HASH_ARLITE ? 'lite' : QUALITY[params.get('q')] ? params.get('q') : LITE_DEVICE ? 'lite' : 'medium';
  const flag = (k) => (params.has(k) ? !/^(0|false|off)$/i.test(params.get(k)) : undefined);
  const xrs = await xrReady;
  const engine = new Engine($('film'), {
    maxWidth: QUALITY[quality], quality,
    // phones: at most 1.5 device pixels per CSS pixel (a 3× screen at full density quadruples the fill)
    ...(quality === 'lite' ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) } : {}),
    supersample: Math.max(1, Math.min(4, parseFloat(params.get('ss') ?? '1') || 1)),
    fx: {
      ao: flag('ao'),
      shadowScale: params.has('shadows') ? Math.max(1, Math.min(4, parseFloat(params.get('shadows')) || 1)) : undefined,
      shutter: params.has('shutter') ? parseFloat(params.get('shutter')) || 180 : undefined,
      // realism A/B switches (see README): per-scene IBL, surface detail, tone mapper, veiling glare
      sceneEnv: flag('env'), detail: flag('detail'), batch: flag('batch'), tonemap: params.get('tm') ?? undefined,
      glare: flag('glare') === false ? 0 : flag('glare') ? 0.04 : undefined,
    },
    // headsets get a multisampled XR framebuffer; phones (AR only) keep the lighter context
    // an XR-ready context up front only on headsets: on Android AR phones asking for it before the film
    // loads could stall start-up. There the context is made XR-compatible when the AR session starts.
    xr: (xrs.vr || xrs.ar) && !/Android|iPhone|iPad/i.test(navigator.userAgent) ? { antialias: xrs.vr && !/Mobile/i.test(navigator.userAgent) } : null,
  });
  window.__film = { engine };
  // If the GPU driver resets (context lost) — also while the sequences are still loading, which is
  // where a phone runs out of memory — reload at the same moment one quality step lighter. Two
  // resets in a row (or one at the lightest level) stop the reloading and say so instead of looping.
  let player = null, experience = null;
  $('film').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    player?.pause();
    experience?.pause();
    // mid-export: the export stops and says so; the reload waits until its dialog is closed
    const exporter = window.__film?.exporter;
    if (exporter?.active) { exporter.contextLost(reloadLighter); return; }
    // entering AR / VR on a phone: making the context XR-compatible may reset it once; the browser
    // restores it and the session carries on, so don't reload the page under it
    if (window.__film?.engine?.xrStarting) return;
    reloadLighter();
  });
  const reloadLighter = () => {
    const cur = params.get('q') ?? quality;
    const lost = (parseInt(params.get('lost') ?? '0', 10) || 0) + 1;
    const q = { ultra: 'high', high: 'medium', medium: 'lite', low: 'lite' }[cur];
    intro.classList.remove('hidden', 'ready');
    if (!q || lost > 2) { setStatus('The graphics driver reset and the film could not recover on this device. Close other tabs and reload to try again.'); return; }
    const url = new URL(location.href);
    const tNow = player ? (experience?.active ? experience.t : player.time) : 0;
    url.searchParams.set('t', (tNow / TIME_SCALE).toFixed(2));   // ?t= is story time
    url.searchParams.set('q', q);
    url.searchParams.set('lost', String(lost));
    setStatus('The graphics driver reset. Reloading at a lighter quality…');
    setTimeout(() => location.replace(url), 600);
  };
  setStatus('Loading typography…');
  await loadFonts();
  setLoad(0.1);
  setStatus('Composing score…');
  // The score renders in an OfflineAudioContext while the sequences are being built.
  const scorePromise = loadScore();
  // ?still&only=<id>[,<id>…] (development previews): build just those chapters, quickly
  const onlyIds = params.has('still') && params.get('only') ? params.get('only').split(',').filter((id) => SEGMENTS.some((s) => s.id === id)) : null;
  const modules = await loadSceneModules({ only: chapter || (onlyIds?.length === 1 ? onlyIds[0] : '') });
  setLoad(0.2);
  // where playback starts (?t= is story time; AR Lite: its chapter)
  const chapterSeg = chapter ? SEGMENTS.find((s) => s.id === chapter) : null;
  const startStory = chapterSeg ? (chapterSeg.start > 0 ? chapterSeg.start + 0.5 : 0) : (parseFloat(params.get('t') ?? '0') || 0);
  // Default: everything is built and pre-drawn behind the loader, so playback never stops or stutters
  // (background building competes with the film for the main thread). ?stream=1 opts into streaming:
  // only the chapter(s) at the start (and the next one) before Play, the rest behind (streamAll below).
  // AR / VR Lite (#arlite) always streams, chapter by chapter, letting go of the chapters behind it.
  const streaming = !params.has('still') && (params.get('stream') === '1' || !!chapter);
  if (onlyIds?.length) {
    await engine.setup(modules);
    for (const id of onlyIds) { setStatus(`Building · ${id}`); await engine.buildSegment(id); }
  } else if (!streaming) {
    await engine.init(modules, (p, seg) => { setLoad(0.2 + p * 0.65); setStatus(`Building · ${seg.title}`); });
    // compile every shader and upload every texture now, so real-time playback never stalls on them
    // (skipped for automated stills, which render single frames; ?prewarm=1 forces it)
    if (!params.has('still') || params.has('prewarm')) { setStatus('Preparing smooth playback…'); await engine.prewarm((p) => setLoad(0.85 + p * 0.1)); }
  } else {
    await engine.setup(modules);
    const first = engine.activeSegments(startStory);
    const next = SEGMENTS[SEGMENTS.indexOf(first[first.length - 1]) + 1];
    const ids = [...first, ...(next ? [next] : [])].map((s) => s.id);
    for (const [k, id] of ids.entries()) {
      setStatus(`Building · ${SEGMENTS.find((s) => s.id === id).title}`);
      await engine.buildSegment(id);
      setLoad(0.2 + ((k + 1) / ids.length) * 0.6);
    }
    // shaders and textures of that first stretch, so its first seconds play without a stall
    const until = (next ?? first[first.length - 1]).end;
    await engine.prewarm((p) => setLoad(0.8 + p * 0.15), { from: Math.max(0, startStory - 0.5), to: until });
    for (const id of ids) engine.instances.get(id)._warm = true;
  }
  setStatus('Composing score…');
  const score = await scorePromise;
  setLoad(1);
  player = new Player(engine, score?.buffer ?? null);
  const explorer = new Explorer(engine, $('film'));
  // game-style walking: phones and tablets start in WALK with an on-screen joystick and buttons
  const touchScreen = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
  if (touchScreen) explorer.mode = 'walk';
  explorer.padUI = new ExplorePad(explorer, { touch: touchScreen });
  // EXPERIENCE: slow-motion drone flythrough with a live ambient score (no narration)
  const ambient = params.has('noaudio') ? null : new Ambient();
  const nowT = () => (experience?.active ? experience.t : player.time);
  addEventListener('resize', () => { if (engine.pinned) return; engine.resize(); if (!player.playing && !experience?.playing) engine.render(nowT(), 0); });
  // live camera: drag / scroll / pinch to look around while the film plays (not while exploring)
  const live = new LiveCam(engine, $('film'), {
    isBlocked: () => explorer.active,
    isPlaying: () => player.playing || !!experience?.playing,
    onChange: () => engine.render(nowT(), 0),
  });
  engine.live = live;
  experience = new Experience(engine, { live, ambient, onTick: (t) => player.onTick(t) });
  window.__film.player = player;
  window.__film.explore = (filmT, view) => { explorer.view(filmT, view); return filmT; };   // automation: explore views
  window.__film.exploreExit = () => explorer.exit();
  window.__film.experience = experience;
  window.__film.ambient = ambient;
  // Deterministic frame access for automated rendering / screenshots.
  // opts: { motionBlur: N sub-frames (0/1 = off), fps: frame rate the shutter is timed against (30) }
  const frameOpts = (o = {}) => [1 / (o.fps || 30), { motionBlur: o.motionBlur ?? 0 }];
  window.__film.renderFrame = (T, o) => { engine.render(T, ...frameOpts(o)); return T; };             // film seconds
  window.__film.renderStory = (t, o) => { engine.render(t * TIME_SCALE, ...frameOpts(o)); return t; };  // story seconds

  let start = startStory * TIME_SCALE;
  // AR / VR Lite: from the chosen chapter onward, chapter after chapter, looping the film at its end
  if (chapter) player.range = [0, DURATION - 0.1];
  player.time = start;
  engine.render(start, 0);

  if (params.has('still')) { document.body.classList.add('still'); intro.style.display = 'none'; window.__film.ready = true; return; }

  // STREAMING: the remaining chapters build in the background, always the first unbuilt one at or after
  // the playhead (so a seek reorders the queue), each warmed without touching the canvas. Playback holds
  // (a small "Loading" note) if it reaches a chapter that isn't ready yet, and resumes on its own.
  const LOOKAHEAD = 1.0;   // story seconds of film that must be built ahead of the playhead
  const gate = (filmT) => { const T = filmT / TIME_SCALE; return engine.isReady(T) && engine.isReady(Math.min(DURATION / TIME_SCALE - 0.01, T + LOOKAHEAD)); };
  player.gate = gate;
  experience.gate = gate;
  const buffering = () => document.body.classList.toggle('buffering', !!(player.waiting || experience.waiting));
  const onBuilt = () => {
    if (player.waiting && gate(player.time)) player.play(player.time);
    buffering();
    if (!player.playing && !experience.playing && !engine.pinned) engine.render(nowT(), 0);   // a waiting still frame fills in
  };
  player.onWait = buffering;
  setInterval(buffering, 300);
  let streamDone = null;
  // AR / VR Lite keeps a window instead: the chapters within WINDOW story seconds ahead of the playhead
  // are built (and warmed), those behind it are freed — about two chapters in memory at any time.
  const WINDOW = 6;
  const liteWindow = async () => {
    for (;;) {
      const T = nowT() / TIME_SCALE;
      for (const s of SEGMENTS) if (engine.isBuilt(s.id) && (s.end < T - 1.5 || s.start > T + WINDOW + 6)) engine.disposeSegment(s.id);
      const want = SEGMENTS.find((s) => s.end > T + 0.05 && s.start < T + WINDOW && (!engine.isBuilt(s.id) || !engine.instances.get(s.id)._warm));
      if (!want) { await new Promise((r) => setTimeout(r, 250)); continue; }
      try {
        await engine.buildSegment(want.id);
        await engine.warmSegment(want.id, { textures: false });
      } catch (e) { console.warn('[stream] could not build', want.id, e); if (engine.instances.get(want.id)) engine.instances.get(want.id)._warm = true; }
      onBuilt();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  const streamAll = () => (streamDone ??= chapter ? liteWindow() : (async () => {
    for (;;) {
      const pending = SEGMENTS.filter((s) => !engine.isBuilt(s.id) || !engine.instances.get(s.id)._warm);
      if (!pending.length) break;
      const T = nowT() / TIME_SCALE;
      const next = pending.find((s) => s.end > T) ?? pending[0];
      try {
        await engine.buildSegment(next.id);
        await engine.warmSegment(next.id);
      } catch (e) { console.warn('[stream] could not build', next.id, e); if (engine.instances.get(next.id)) engine.instances.get(next.id)._warm = true; else break; }
      onBuilt();
      await new Promise((r) => setTimeout(r, 0));
    }
    console.info('[stream] every chapter is ready');
  })());
  if (streaming) streamAll(); else streamDone = Promise.resolve();
  window.__film.whenAllReady = () => streamAll();

  const ui = setupUI(player, score, explorer, experience, ambient, xrs);
  if (chapter) {
    const seg = SEGMENTS.find((s) => s.id === chapter);
    document.body.classList.add('arlite');
    $('play').querySelector('span').textContent = 'Watch here';
    const sub = $('play-ar').querySelector('.pe-sub');
    if (xrs?.ar && sub) sub.textContent = `From ${seg.title} · on your table`;
    const subV = $('play-vr').querySelector('.pe-sub');
    if (xrs?.vr && subV) subV.textContent = `From ${seg.title} · chapter by chapter`;
    const link = $('arlite-link');
    link.textContent = 'Choose another chapter';
  }
  intro.classList.add('ready');
  $('play').disabled = false;
  $('play-exp').disabled = false;
  // #experience: the start screen leads with Experience mode (one tap still starts it: audio unlock)
  if (HASH_EXPERIENCE) { document.body.classList.add('exp-link'); $('play-exp').focus(); } else $('play').focus();
  window.__film.ready = true;
  window.__film.enterExperience = ui.enterExperience;
  window.__film.exitExperience = ui.exitExperience;
  window.__film.xr = ui.xr;
  window.__film.exporter = ui.exporter;
  // frame-perfect export of film time [from, to) (automation / debugging; the dialog exports the whole film):
  //   await __film.exportVideo({ from: 10, to: 13, width: 640, fps: 30, hq: false, download: true })
  window.__film.exportVideo = (o = {}) => ui.exporter.run(o);
  if (params.has('autoplay')) { if (HASH_EXPERIENCE) ui.enterExperience(); else begin(player); }
}

// AR Lite without a chapter in the link: the start screen lists the chapters; the choice goes into
// the address (#arlite&<id>) so the link can be shared or bookmarked.
function pickChapter() {
  const box = $('arlite-pick');
  box.hidden = false;
  document.body.classList.add('arlite-picking');
  setStatus('Choose a chapter to place on your table');
  box.querySelector('.arl-list').innerHTML = SEGMENTS.map((s, i) => `<button type="button" data-ch="${s.id}"><b>${String(i + 1).padStart(2, '0')}</b> ${s.title}</button>`).join('');
  return new Promise((resolve) => {
    box.addEventListener('click', (e) => {
      const id = e.target.closest('[data-ch]')?.dataset.ch;
      if (!id) return;
      box.hidden = true;
      document.body.classList.remove('arlite-picking');
      try { history.replaceState(history.state, '', `#${filmHash(`arlite&${id}`)}`); } catch { /* ignore */ }
      resolve(id);
    });
  });
}

function begin(player) {
  intro.classList.add('hidden');
  player.play(player.time);
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function setupUI(player, score, explorer, experience, ambient, xrs) {
  const body = document.body;
  const exp = experience;
  const playing = () => (exp.active ? exp.playing : player.playing);
  const seek = (t) => (exp.active ? expSeek(t) : player.seek(t));
  const currentTime = () => (exp.active ? exp.t : player.currentTime);
  const scrub = $('scrub'), fill = $('scrub-fill'), tip = $('scrub-tip'), time = $('time');
  $('chapters').innerHTML = SEGMENTS.slice(1).map((s) => `<i style="left:${(s.start * TIME_SCALE / DURATION) * 100}%"></i>`).join('');

  player.onTick = (t) => {
    fill.style.width = `${(t / DURATION) * 100}%`;
    time.textContent = fmt(t);
    scrub.setAttribute('aria-valuenow', t.toFixed(1));
  };
  player.onEnd = () => { body.classList.remove('playing'); showControls(true); };
  const syncPlaying = () => body.classList.toggle('playing', playing());
  const toggle = async () => {
    if (!exp.active) await player.toggle();
    else if (exp.playing) exp.pause();
    else expPlay();
    syncPlaying();
  };

  $('play').addEventListener('click', () => { begin(player); syncPlaying(); });
  $('btn-play').addEventListener('click', toggle);
  $('btn-mute').addEventListener('click', () => { player.setMuted(!player.muted); ambient?.setMuted(player.muted); body.classList.toggle('muted', player.muted); });
  const fmts = [['wide', '2.39'], ['square', '1:1'], ['16x9', '16:9'], ['9x16', '9:16'], ['2x3', '2:3'], ['4x5', '4:5']];
  // intro: mark the format in use (arriving with #experience, a format keeps it: #square&experience)
  const curHash = { 1: 'square', [16 / 9]: '16x9', [9 / 16]: '9x16', [2 / 3]: '2x3', [4 / 5]: '4x5' }[OUTPUT_ASPECT] ?? 'wide';
  document.querySelectorAll('.formats-pick a').forEach((a) => {
    a.setAttribute('aria-current', String(a.dataset.fmt === curHash));
    a.setAttribute('href', `#${filmHash(HASH_EXPERIENCE ? `${a.dataset.fmt}&experience` : a.dataset.fmt)}`);
  });
  const cur = fmts.findIndex(([h]) => h === curHash);
  $('btn-format').textContent = fmts[Math.max(0, cur)][1];
  $('btn-format').addEventListener('click', () => { location.hash = filmHash(fmts[(Math.max(0, cur) + 1) % fmts.length][0]); });
  $('btn-fs').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
  $('btn-wav').addEventListener('click', () => {
    if (!score?.encodeWav) return;
    download(score.encodeWav(score.buffer), `${FILM.slug}-score.wav`);
  });
  $('btn-rec').addEventListener('click', async () => {
    if (body.classList.contains('recording') || exp.active || exporter.active) return;
    body.classList.add('recording', 'playing');
    intro.classList.add('hidden');
    await player.record((blob, ext = 'webm') => { body.classList.remove('recording'); download(blob, `${FILM.slug}.${ext}`); });
  });

  // Scrubbing
  const chapterAt = (t) => [...SEGMENTS].reverse().find((s) => t / TIME_SCALE >= s.start + 0.25) ?? SEGMENTS[0];
  const tAt = (e) => {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DURATION;
  };
  let dragging = false;
  scrub.addEventListener('pointerdown', (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); seek(tAt(e)); });
  scrub.addEventListener('pointermove', (e) => {
    const t = tAt(e), r = scrub.getBoundingClientRect();
    tip.style.left = `${((t / DURATION) * r.width).toFixed(0)}px`;
    tip.textContent = `${fmt(t)} · ${chapterAt(t).title}`;
    if (dragging) seek(t);
  });
  scrub.addEventListener('pointerup', () => { dragging = false; });
  scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') seek(currentTime() + 1);
    if (e.key === 'ArrowLeft') seek(currentTime() - 1);
  });

  // Auto-hiding controls
  let hideTimer;
  function showControls(stay = false) {
    controls.classList.add('show');
    body.classList.remove('hide-cursor');
    clearTimeout(hideTimer);
    if (!stay) hideTimer = setTimeout(() => { if (playing()) { controls.classList.remove('show'); body.classList.add('hide-cursor'); } }, 2200);
  }
  const wake = () => { if (intro.classList.contains('hidden') && !body.classList.contains('recording')) showControls(); };
  addEventListener('pointermove', wake);
  addEventListener('pointerdown', wake);   // phones: a tap brings the controls back

  addEventListener('keydown', async (e) => {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!intro.classList.contains('hidden')) { if (HASH_EXPERIENCE) enterExperience(); else begin(player); } else await toggle(); syncPlaying(); showControls(); }
    else if (k === 'arrowright') { seek(currentTime() + 2); showControls(); }
    else if (k === 'arrowleft') { seek(currentTime() - 2); showControls(); }
    else if (k === 'm') $('btn-mute').click();
    else if (k === 'f') $('btn-fs').click();
    else if (k === 'r') $('btn-rec').click();
    else if (k === 'x') exporter.open();
    else if (k === 's' && exp.active) $('btn-speed').click();
    else if (k === 'h') controls.classList.toggle('show');
    else if (/^[0-9]$/.test(k)) { seek(SEGMENTS[Math.min(+k, SEGMENTS.length - 1)].start * TIME_SCALE + 0.01); showControls(); }
  });
  // EXPLORE: pause and fly through the frozen 3D scene
  // (in Experience mode the ambient score plays on while exploring, and the flight resumes after)
  let resumeAfterExplore = false;
  const setExplore = (on) => {
    if (on) {
      resumeAfterExplore = exp.active && exp.playing;
      if (exp.active) { exp.pause({ keepAudio: true }); syncPlaying(); } else if (player.playing) { player.pause(); syncPlaying(); }
      intro.classList.add('hidden');
      explorer.enter(exp.active ? exp.t : player.time);
    } else explorer.exit();
    body.classList.toggle('exploring-on', on);
    explorer.padUI?.show(on);
    $('btn-explore').setAttribute('aria-pressed', String(on));
    showControls(on);
    if (!on && resumeAfterExplore && exp.active) { resumeAfterExplore = false; expPlay(); }
  };
  $('btn-explore').addEventListener('click', () => setExplore(!explorer.active));
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'e' && !e.target.closest?.('input, textarea')) { e.preventDefault(); setExplore(!explorer.active); }
    else if (k === 'escape' && explorer.active) setExplore(false);
    else if (k === 'escape' && xr.active) xr.stop();
    else if (k === 'escape' && exp.active) exitExperience();
  });

  // EXPERIENCE mode
  const expPlay = () => {
    if (explorer.active) { resumeAfterExplore = false; setExplore(false); }
    exp.play(); syncPlaying(); showControls();
  };
  const expSeek = (t) => { exp.seek(t); if (explorer.active) explorer.enter(exp.t); };
  let hintTimer;
  const enterExperience = () => {
    if (exp.active) return;
    if (explorer.active) setExplore(false);
    const t = player.currentTime;
    player.pause();
    intro.classList.add('hidden');
    body.classList.add('experience-on');
    body.classList.remove('live-hint-on');
    $('btn-exp').setAttribute('aria-pressed', 'true');
    $('btn-exp').setAttribute('aria-label', 'Exit experience mode');
    $('btn-speed').textContent = `${exp.speed}×`;
    exp.enter(t >= DURATION - 0.05 ? 0 : t);   // starts the ambient score inside this tap
    setHashExperience(true);
    syncPlaying();
    showControls();
    body.classList.add('exp-hint-on');
    clearTimeout(hintTimer); hintTimer = setTimeout(() => body.classList.remove('exp-hint-on'), 7000);
  };
  // back to the film at the same moment (playing on, with its soundtrack, if the flight was playing)
  const exitExperience = () => {
    if (!exp.active) return;
    resumeAfterExplore = false;
    if (explorer.active) setExplore(false);
    const wasPlaying = exp.playing;
    const t = exp.exit();
    body.classList.remove('experience-on', 'exp-hint-on');
    $('btn-exp').setAttribute('aria-pressed', 'false');
    $('btn-exp').setAttribute('aria-label', 'Experience mode');
    setHashExperience(false);
    player.time = t;
    if (wasPlaying) player.play(t);
    else { engine.render(t, 0); player.onTick(t); }
    syncPlaying();
    showControls();
  };
  const engine = player.engine;
  $('play-exp').addEventListener('click', enterExperience);
  $('btn-exp').addEventListener('click', () => (exp.active ? exitExperience() : enterExperience()));
  $('btn-speed').addEventListener('click', () => { $('btn-speed').textContent = `${exp.cycleSpeed()}×`; showControls(); });
  const origPlay = player.play.bind(player);
  let hintShown = false;
  player.play = async (...a) => {
    if (explorer.active) setExplore(false);
    await origPlay(...a); syncPlaying(); showControls();
    // first play: tell the viewer the film is interactive
    if (!hintShown) { hintShown = true; body.classList.add('live-hint-on'); setTimeout(() => body.classList.remove('live-hint-on'), 6500); }
  };
  const origSeek = player.seek.bind(player);
  player.seek = (t) => { origSeek(t); if (explorer.active) explorer.enter(player.time); };   // scrubbing re-poses the world

  // VR / AR (WebXR): the buttons appear only where the browser offers a session
  let toChapters = false;
  const xr = new XRMode(engine, {
    player, experience: exp, overlay: $('xr-overlay'),
    onStart: () => { intro.classList.add('hidden'); controls.classList.remove('show'); syncPlaying(); },
    onToggle: syncPlaying,
    onEnd: () => {
      // AR Lite's close button: back to the chapter list (a reload frees the chapter)
      if (toChapters) { location.hash = 'arlite'; return; }
      // back to the flat film at the same moment, still playing if it was
      if (exp.active) { if (exp.playing) exp._loop(); else exp.render(); }
      else if (player.playing) player.loop();
      else { engine.render(player.time, 0); player.onTick(player.time); }
      syncPlaying();
      showControls();
    },
  });
  // AR Lite: the AR close button (top right) returns to the chapters; so does the page's own one
  if (body.classList.contains('arlite') || HASH_ARLITE) {
    const lbl = $('xr-overlay').querySelector('.xr-close-lbl');
    if (lbl) lbl.textContent = 'Chapters';
    // (capture phase: set before the button's own handler ends the session, which may end at once)
    $('xr-overlay').addEventListener('click', (e) => { if (e.target.closest?.('[data-xr="exit"]')) toChapters = true; }, true);
  }
  $('arlite-close').addEventListener('click', () => { player.pause(); location.hash = filmHash('arlite'); });
  body.classList.toggle('has-vr', !!xrs?.vr);
  body.classList.toggle('has-ar', !!xrs?.ar);
  if (HASH_XR) body.classList.add(`xr-link-${HASH_XR}`);
  // VR / AR how-to: opened from the start screen's link, or by a VR / AR button where this browser
  // can't open that session (no headset / ARCore, iPhone Safari, an embedded preview)
  const PAGES = 'https://aiprdesign.github.io/wc/';
  const embedded = (() => { try { return window.top !== window; } catch { return true; } })();
  const filmUrl = embedded || !/^https?:$/.test(location.protocol) ? PAGES : location.origin + location.pathname;
  const help = $('xr-help');
  const showHelpTab = (tab) => {
    help.querySelectorAll('[data-xh]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.xh === tab)));
    help.querySelectorAll('[data-xh-panel]').forEach((p) => { p.hidden = p.dataset.xhPanel !== tab; });
  };
  const openHelp = (tab = 'vr') => {
    const yes = (k) => (xrs?.[k] ? '<b>ready</b>' : '<i>not on this device</i>');
    $('xh-status').innerHTML = `This browser: VR ${yes('vr')} · AR ${yes('ar')}${embedded ? ' · this page is embedded, so open the film\u2019s own address' : ''}`;
    help.querySelectorAll('.xh-url').forEach((el) => { el.textContent = filmUrl; });
    // chapter QR tiles and the AR Lite link: the film's own address (an embedded page can't start AR)
    help.querySelectorAll('a.xh-ch, a.xh-qr-url').forEach((a) => { a.href = filmUrl + new URL(a.getAttribute('href'), location.href).hash; });
    showHelpTab(tab);
    if (help.showModal) help.showModal(); else help.setAttribute('open', '');
  };
  help.querySelectorAll('[data-xh]').forEach((b) => b.addEventListener('click', () => showHelpTab(b.dataset.xh)));
  help.querySelectorAll('.xh-copy').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(filmUrl + (b.dataset.copyHash ?? '')); b.textContent = 'Copied'; } catch { b.textContent = 'Copy failed'; }
    setTimeout(() => { b.textContent = 'Copy link'; }, 1600);
  }));
  if (!xrs?.vr) { const t = $('play-vr')?.querySelector('.pe-sub'); if (t) t.textContent = 'Needs a VR headset · tap for how-to'; }
  if (!xrs?.ar) { const t = $('play-ar')?.querySelector('.pe-sub'); if (t) t.textContent = 'Needs an AR phone · tap for how-to'; }
  $('xr-help-link')?.addEventListener('click', () => openHelp(xrs?.ar && !xrs?.vr ? 'ar' : 'vr'));
  const startXR = (mode) => {
    if (xr.active) { xr.stop(); return; }
    if (!xrs?.[mode === VR ? 'vr' : 'ar']) { openHelp(mode === VR ? 'vr' : 'ar'); return; }
    if (explorer.active) setExplore(false);
    xr.start(mode).catch((e) => {
      console.warn('[xr] could not start', e);
      setStatus(`${mode === VR ? 'VR' : 'AR'} could not start: ${e?.message ?? e}`);
      openHelp(mode === VR ? 'vr' : 'ar');
    });
  };
  for (const [id, mode] of [['play-vr', VR], ['play-ar', AR], ['btn-vr', VR], ['btn-ar', AR]]) $(id)?.addEventListener('click', () => startXR(mode));
  if (HASH_XR && xrs?.[HASH_XR]) setTimeout(() => $(`play-${HASH_XR}`)?.focus(), 0);

  // EXPORT VIDEO (frame-perfect, offline): core/export.js. The live film is quieted for the export
  // (paused; no Explore, no live-camera or drone offset, no Experience clean picture: the normal
  // film is exported) and put back exactly as it was afterwards.
  const exporter = new ExportDialog({
    engine,
    whenReady: () => window.__film.whenAllReady?.(),   // streaming: every chapter built first
    getAudio: () => player.buffer ?? null,   // the loaded soundtrack (with narration unless ?novo); mute doesn't apply
    narration: !params.has('novo'),
    isMuted: () => player.muted,
    inExperience: () => exp.active,
    canStart: () => (body.classList.contains('recording') ? 'A live recording is running: let it finish first.' : xr.active ? 'Leave VR / AR first.' : null),
    download,
    prepare: () => {
      const live = engine.live;
      const s = { exp: exp.active, clean: engine.clean, headings: engine.headings, introShown: !intro.classList.contains('hidden') };
      if (explorer.active) setExplore(false);
      if (exp.active) exp.pause(); else player.pause();
      s.t = exp.active ? exp.t : player.time;
      syncPlaying();
      // the director's camera: undo the last live / drone offset, hand hooked scenes back, and hold
      // the offset at zero for the export (the viewer's pose and the drone's flight resume after)
      for (const inst of engine.instances.values()) live?.restore(inst);
      live?.unhookAll();
      engine.live = { tick() {}, apply(inst) { inst._liveFocus = 1; }, restore() {} };
      engine.clean = false;
      engine.headings = true;
      intro.classList.add('hidden');
      controls.classList.remove('show');
      return () => {
        engine.live = live;
        engine.clean = s.clean;
        engine.headings = s.headings;
        if (s.exp) exp.render(); else player.seek(s.t);
        if (s.introShown) intro.classList.remove('hidden');
        else showControls(true);
        syncPlaying();
      };
    },
  });
  $('btn-export').addEventListener('click', () => exporter.open());
  $('export-link').addEventListener('click', () => exporter.open());
  // while the export dialog is open, the film's keyboard shortcuts stand down (Space would play)
  addEventListener('keydown', (e) => { if (exporter.el.open) e.stopImmediatePropagation(); }, true);
  return { enterExperience, exitExperience, xr, exporter };
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// Switching the frame format (#square, #16x9, #wide) needs a fresh engine.
addEventListener('hashchange', () => location.reload());

// INSTALLABLE APP (manifest.webmanifest + sw.js): Android Chrome offers "Install app"; the installed app
// opens full screen on Chrome's engine, so AR / VR work in it. The button shows only when installable.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !params.has('still')) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
let installPrompt = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installPrompt = e;
  const b = $('install-app'); if (b) b.hidden = false;
});
$('install-app')?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  try { await installPrompt.userChoice; } catch { /* dismissed */ }
  installPrompt = null; $('install-app').hidden = true;
});
addEventListener('appinstalled', () => { const b = $('install-app'); if (b) b.hidden = true; });

// THE TWO FILMS: the start screen names the film this page plays and links to the other one
// (#india / #western: a new film needs a fresh engine, so the hashchange reloads)
function setupFilmScreen() {
  document.title = FILM.title;
  // the film's own running time (the Indian film is 8 s of story longer)
  const runtime = `${Math.floor(DURATION / 60)}:${String(Math.round(DURATION % 60)).padStart(2, '0')}`;
  const hint = intro.querySelector('.hint');
  if (hint) hint.textContent = hint.textContent.replace(/\d+ seconds/, `${Math.round(DURATION)} seconds`);
  const dim = document.querySelector('#controls .time.dim');
  if (dim) dim.textContent = runtime;
  $('scrub')?.setAttribute('aria-valuemax', String(Math.round(DURATION)));
  const [a, b] = FILM.title.split(/ (?=[A-Z][a-z]+ Civilization$)/);
  const h1 = intro.querySelector('h1');
  if (h1 && b) h1.innerHTML = `${a}<br />${b}`;
  const sub = intro.querySelector('.sub');
  if (sub) sub.textContent = FILM.opening?.subtitle ?? sub.textContent;
  $('film')?.setAttribute('aria-label', `${FILM.title} — real-time film`);
  const note = intro.querySelector('.note');
  if (note && FILM.note) note.textContent = FILM.note;
  document.querySelectorAll('.formats-pick a').forEach((el) => el.setAttribute('href', `#${filmHash(el.dataset.fmt)}`));
  document.querySelectorAll('.film-pick a').forEach((el) => el.setAttribute('aria-current', String(el.dataset.film === FILM_ID)));
  // share card: this film's own address and QR code
  const url = `aiprdesign.github.io/wc/${FILM_TOKEN ? `#${FILM_TOKEN}` : ''}`;
  const card = intro.querySelector('.share-card');
  if (card && FILM_TOKEN) {
    const img = card.querySelector('img');
    img.src = `assets/qr/film-${FILM_ID}.svg`; img.alt = `QR code that opens the film: ${url}`;
    const link = card.querySelector('.sc-url');
    link.href = `https://${url}`; link.textContent = url;
  }
  // VR / AR help: links and chapter codes for this film
  document.querySelectorAll('#xr-help a.xh-qr-url, #xr-help .xh-copy').forEach((el) => {
    if (el.dataset.copyHash) el.dataset.copyHash = `#${filmHash(el.dataset.copyHash.slice(1))}`;
    else if (el.getAttribute('href')?.startsWith('#')) el.setAttribute('href', `#${filmHash(el.getAttribute('href').slice(1))}`);
  });
  if (FILM_TOKEN) {
    const urlAr = document.querySelector('#xr-help .xh-url-ar');
    if (urlAr) urlAr.textContent = `#${filmHash('arlite')}`;
    const chs = document.querySelector('#xr-help .xh-chs');
    if (chs) chs.innerHTML = SEGMENTS.map((sg, i) => `<a class="xh-ch" href="#${filmHash(`arlite&${sg.id}`)}" title="Open ${sg.title} in AR Lite"><img src="assets/qr/ar-${FILM_ID}-${sg.id}.svg" width="120" height="120" alt="QR code: ${sg.title} in AR" /><span><b>${String(i + 1).padStart(2, '0')}</b> ${sg.title}</span></a>`).join('');
    document.querySelectorAll('#xr-help .xh-qr img').forEach((img) => {
      const k = /qr\/(vr|ar)\.svg/.exec(img.getAttribute('src'))?.[1];
      if (k) { img.src = `assets/qr/${k}-${FILM_ID}.svg`; img.alt = img.alt.replace(/#(vr|arlite)/, `#${filmHash(k === 'vr' ? 'vr' : 'arlite')}`); }
    });
    document.querySelectorAll('#xr-help .xh-qr-url').forEach((el) => { el.textContent = el.textContent.replace(/#(vr|arlite)$/, (m, k) => `#${filmHash(k)}`); });
  }
}
setupFilmScreen();

boot().catch((e) => {
  console.error(e);
  setStatus(`Could not start: ${e.message}`);
});
// any uncaught error while the film is still loading is shown on the loading screen (so a stalled
// progress bar on a phone always says why)
const bootError = (msg) => { if (!window.__film?.ready) setStatus(`Could not start: ${msg}`); };
addEventListener('error', (e) => bootError(e.message || String(e.error)));
addEventListener('unhandledrejection', (e) => bootError(e.reason?.message || String(e.reason)));

// start screen: share the film's home page (system share sheet on phones, else copy the link)
$('share-film')?.addEventListener('click', async (e) => {
  const b = e.currentTarget, url = `https://aiprdesign.github.io/wc/${FILM_TOKEN ? `#${FILM_TOKEN}` : ''}`;
  const done = (t) => { b.textContent = t; setTimeout(() => { b.textContent = 'Share link'; }, 1800); };
  try {
    if (navigator.share) { await navigator.share({ title: FILM.title, text: `A short film: ${FILM.title}`, url }); return; }
    await navigator.clipboard.writeText(url);
    done('Link copied');
  } catch (err) { if (err?.name !== 'AbortError') done('Copy failed'); }
});
