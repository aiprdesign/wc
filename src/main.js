// Entry point: load fonts, sequences and the procedural score, then hand over to the transport UI.
// hashopts first: it narrows a combined fragment (#square&experience) to the format token before
// timeline.js reads it
import { HASH_EXPERIENCE, restoreHash, setHashExperience } from './core/hashopts.js';
import { Engine } from './core/engine.js';
import { Player } from './core/player.js';
import { Explorer } from './core/explore.js';
import { LiveCam } from './core/live.js';
import { Experience } from './core/experience.js';
import { Ambient } from './audio/ambient.js';
import { loadFonts } from './lib/text.js';
import { loadSceneModules } from './scenes/index.js';
import { SEGMENTS, FILM_DURATION as DURATION, TIME_SCALE, OUTPUT_ASPECT } from './timeline.js';

const params = new URLSearchParams(location.search);
const QUALITY = { low: 1280, medium: 1920, high: 2560, ultra: 3840 };
const $ = (id) => document.getElementById(id);

const intro = $('intro'), controls = $('controls'), status = $('status');
const setStatus = (s) => { status.textContent = s; };
const setLoad = (p) => { $('loader').firstElementChild.style.width = `${Math.round(p * 100)}%`; };

async function loadScore() {
  if (params.has('noaudio')) return null;
  const { encodeWav } = await import('./audio/wav.js');
  // The mixed soundtrack (score + narration) ships pre-rendered: quick to load and light on phones.
  // ?livescore (or ?novo, the score without the narrator) composes it in the browser instead.
  if (!params.has('livescore') && !params.has('novo')) {
    try {
      const res = await fetch('assets/audio/soundtrack.mp3');
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
  // ?q= low|medium|high|ultra sets the render width; high/ultra also turn on ambient occlusion and
  // finer shadows. ?ss=2 supersamples (renders at 2× and filters down), ?ao=0/1 overrides AO,
  // ?shadows=1|2|4 overrides the shadow-map multiplier.
  const quality = QUALITY[params.get('q')] ? params.get('q') : 'medium';
  const flag = (k) => (params.has(k) ? !/^(0|false|off)$/i.test(params.get(k)) : undefined);
  const engine = new Engine($('film'), {
    maxWidth: QUALITY[quality], quality,
    supersample: Math.max(1, Math.min(4, parseFloat(params.get('ss') ?? '1') || 1)),
    fx: {
      ao: flag('ao'),
      shadowScale: params.has('shadows') ? Math.max(1, Math.min(4, parseFloat(params.get('shadows')) || 1)) : undefined,
      shutter: params.has('shutter') ? parseFloat(params.get('shutter')) || 180 : undefined,
    },
  });
  window.__film = { engine };
  setStatus('Loading typography…');
  await loadFonts();
  setLoad(0.1);
  setStatus('Composing score…');
  // The score renders in an OfflineAudioContext while the sequences are being built.
  const scorePromise = loadScore();
  const modules = await loadSceneModules();
  setLoad(0.2);
  await engine.init(modules, (p, seg) => { setLoad(0.2 + p * 0.7); setStatus(`Building · ${seg.title}`); });
  setStatus('Composing score…');
  const score = await scorePromise;
  setLoad(1);
  const player = new Player(engine, score?.buffer ?? null);
  const explorer = new Explorer(engine, $('film'));
  // EXPERIENCE: slow-motion drone flythrough with a live ambient score (no narration)
  const ambient = params.has('noaudio') ? null : new Ambient();
  let experience = null;
  const nowT = () => (experience?.active ? experience.t : player.time);
  addEventListener('resize', () => { engine.resize(); if (!player.playing && !experience?.playing) engine.render(nowT(), 0); });
  // live camera: drag / scroll / pinch to look around while the film plays (not while exploring)
  const live = new LiveCam(engine, $('film'), {
    isBlocked: () => explorer.active,
    isPlaying: () => player.playing || !!experience?.playing,
    onChange: () => engine.render(nowT(), 0),
  });
  engine.live = live;
  experience = new Experience(engine, { live, ambient, onTick: (t) => player.onTick(t) });
  // If the GPU driver resets (context lost), reload at the same moment at a lighter quality.
  $('film').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    player.pause();
    const tNow = nowT();
    experience.pause();
    const q = { ultra: 'high', high: 'medium', medium: 'low' }[params.get('q') ?? 'medium'] ?? 'low';
    const url = new URL(location.href);
    url.searchParams.set('t', (tNow / TIME_SCALE).toFixed(2));   // ?t= is story time
    url.searchParams.set('q', q);
    setStatus('The graphics driver reset. Reloading at a lighter quality…');
    intro.classList.remove('hidden', 'ready');
    setTimeout(() => location.replace(url), 600);
  });
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

  const start = (parseFloat(params.get('t') ?? '0') || 0) * TIME_SCALE;   // ?t= is story time
  player.time = start;
  engine.render(start, 0);

  if (params.has('still')) { document.body.classList.add('still'); intro.style.display = 'none'; window.__film.ready = true; return; }

  const ui = setupUI(player, score, explorer, experience, ambient);
  intro.classList.add('ready');
  $('play').disabled = false;
  $('play-exp').disabled = false;
  // #experience: the start screen leads with Experience mode (one tap still starts it: audio unlock)
  if (HASH_EXPERIENCE) { document.body.classList.add('exp-link'); $('play-exp').focus(); } else $('play').focus();
  window.__film.ready = true;
  window.__film.enterExperience = ui.enterExperience;
  window.__film.exitExperience = ui.exitExperience;
  if (params.has('autoplay')) { if (HASH_EXPERIENCE) ui.enterExperience(); else begin(player); }
}

function begin(player) {
  intro.classList.add('hidden');
  player.play(player.time);
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function setupUI(player, score, explorer, experience, ambient) {
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
  const fmts = [['wide', '2.39'], ['square', '1:1'], ['16x9', '16:9'], ['9x16', '9:16']];
  // intro: mark the format in use (arriving with #experience, a format keeps it: #square&experience)
  const curHash = { 1: 'square', [16 / 9]: '16x9', [9 / 16]: '9x16' }[OUTPUT_ASPECT] ?? 'wide';
  document.querySelectorAll('.formats-pick a').forEach((a) => {
    a.setAttribute('aria-current', String(a.dataset.fmt === curHash));
    if (HASH_EXPERIENCE) a.setAttribute('href', `#${a.dataset.fmt}&experience`);
  });
  const cur = fmts.findIndex(([h]) => h === curHash);
  $('btn-format').textContent = fmts[Math.max(0, cur)][1];
  $('btn-format').addEventListener('click', () => { location.hash = fmts[(Math.max(0, cur) + 1) % fmts.length][0]; });
  $('btn-fs').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
  $('btn-wav').addEventListener('click', () => {
    if (!score?.encodeWav) return;
    download(score.encodeWav(score.buffer), 'achievements-of-western-civilization-score.wav');
  });
  $('btn-rec').addEventListener('click', async () => {
    if (body.classList.contains('recording') || exp.active) return;
    body.classList.add('recording', 'playing');
    intro.classList.add('hidden');
    await player.record((blob, ext = 'webm') => { body.classList.remove('recording'); download(blob, `achievements-of-western-civilization.${ext}`); });
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
  addEventListener('pointermove', () => { if (intro.classList.contains('hidden') && !body.classList.contains('recording')) showControls(); });

  addEventListener('keydown', async (e) => {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!intro.classList.contains('hidden')) begin(player); else await toggle(); syncPlaying(); showControls(); }
    else if (k === 'arrowright') { seek(currentTime() + 2); showControls(); }
    else if (k === 'arrowleft') { seek(currentTime() - 2); showControls(); }
    else if (k === 'm') $('btn-mute').click();
    else if (k === 'f') $('btn-fs').click();
    else if (k === 'r') $('btn-rec').click();
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
    $('btn-explore').setAttribute('aria-pressed', String(on));
    showControls(on);
    if (!on && resumeAfterExplore && exp.active) { resumeAfterExplore = false; expPlay(); }
  };
  $('btn-explore').addEventListener('click', () => setExplore(!explorer.active));
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'e' && !e.target.closest?.('input, textarea')) { e.preventDefault(); setExplore(!explorer.active); }
    else if (k === 'escape' && explorer.active) setExplore(false);
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
  return { enterExperience, exitExperience };
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

boot().catch((e) => {
  console.error(e);
  setStatus(`Could not start: ${e.message}`);
});
