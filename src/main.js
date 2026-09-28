// Entry point: load fonts, sequences and the procedural score, then hand over to the transport UI.
import { Engine } from './core/engine.js';
import { Player } from './core/player.js';
import { Explorer } from './core/explore.js';
import { loadFonts } from './lib/text.js';
import { loadSceneModules } from './scenes/index.js';
import { SEGMENTS, FILM_DURATION as DURATION, TIME_SCALE } from './timeline.js';

const params = new URLSearchParams(location.search);
const QUALITY = { low: 1280, medium: 1920, high: 2560, ultra: 3840 };
const $ = (id) => document.getElementById(id);

const intro = $('intro'), controls = $('controls'), status = $('status');
const setStatus = (s) => { status.textContent = s; };
const setLoad = (p) => { $('loader').firstElementChild.style.width = `${Math.round(p * 100)}%`; };

async function loadScore() {
  if (params.has('noaudio')) return null;
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
  const engine = new Engine($('film'), { maxWidth: QUALITY[params.get('q')] ?? QUALITY.medium });
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
  addEventListener('resize', () => { engine.resize(); if (!player.playing) engine.render(player.time, 0); });

  const player = new Player(engine, score?.buffer ?? null);
  const explorer = new Explorer(engine, $('film'));
  // If the GPU driver resets (context lost), reload at the same moment at a lighter quality.
  $('film').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    player.pause();
    const q = { ultra: 'high', high: 'medium', medium: 'low' }[params.get('q') ?? 'medium'] ?? 'low';
    const url = new URL(location.href);
    url.searchParams.set('t', player.time.toFixed(2));
    url.searchParams.set('q', q);
    setStatus('The graphics driver reset. Reloading at a lighter quality…');
    intro.classList.remove('hidden', 'ready');
    setTimeout(() => location.replace(url), 600);
  });
  window.__film.player = player;
  window.__film.explore = (filmT, view) => { explorer.view(filmT, view); return filmT; };   // automation: explore views
  window.__film.exploreExit = () => explorer.exit();
  // Deterministic frame access for automated rendering / screenshots.
  window.__film.renderFrame = (T) => { engine.render(T, 1 / 30); return T; };            // film seconds
  window.__film.renderStory = (t) => { engine.render(t * TIME_SCALE, 1 / 30); return t; };  // story seconds

  const start = (parseFloat(params.get('t') ?? '0') || 0) * TIME_SCALE;   // ?t= is story time
  player.time = start;
  engine.render(start, 0);

  if (params.has('still')) { document.body.classList.add('still'); intro.style.display = 'none'; window.__film.ready = true; return; }

  setupUI(player, score, explorer);
  intro.classList.add('ready');
  $('play').disabled = false;
  $('play').focus();
  window.__film.ready = true;
  if (params.has('autoplay')) begin(player);
}

function begin(player) {
  intro.classList.add('hidden');
  player.play(player.time);
}

function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function setupUI(player, score, explorer) {
  const body = document.body;
  const scrub = $('scrub'), fill = $('scrub-fill'), tip = $('scrub-tip'), time = $('time');
  $('chapters').innerHTML = SEGMENTS.slice(1).map((s) => `<i style="left:${(s.start * TIME_SCALE / DURATION) * 100}%"></i>`).join('');

  player.onTick = (t) => {
    fill.style.width = `${(t / DURATION) * 100}%`;
    time.textContent = fmt(t);
    scrub.setAttribute('aria-valuenow', t.toFixed(1));
  };
  player.onEnd = () => { body.classList.remove('playing'); showControls(true); };
  const syncPlaying = () => body.classList.toggle('playing', player.playing);

  $('play').addEventListener('click', () => { begin(player); syncPlaying(); });
  $('btn-play').addEventListener('click', async () => { await player.toggle(); syncPlaying(); });
  $('btn-mute').addEventListener('click', () => { player.setMuted(!player.muted); body.classList.toggle('muted', player.muted); });
  const fmts = [['wide', '2.39'], ['square', '1:1'], ['16x9', '16:9']];
  const cur = fmts.findIndex(([h]) => h === location.hash.slice(1));
  $('btn-format').textContent = fmts[Math.max(0, cur)][1];
  $('btn-format').addEventListener('click', () => { location.hash = fmts[(Math.max(0, cur) + 1) % fmts.length][0]; });
  $('btn-fs').addEventListener('click', () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()));
  $('btn-wav').addEventListener('click', () => {
    if (!score?.encodeWav) return;
    download(score.encodeWav(score.buffer), 'achievements-of-western-civilization-score.wav');
  });
  $('btn-rec').addEventListener('click', async () => {
    if (body.classList.contains('recording')) return;
    body.classList.add('recording', 'playing');
    intro.classList.add('hidden');
    await player.record((blob) => { body.classList.remove('recording'); download(blob, 'achievements-of-western-civilization.webm'); });
  });

  // Scrubbing
  const chapterAt = (t) => [...SEGMENTS].reverse().find((s) => t / TIME_SCALE >= s.start + 0.25) ?? SEGMENTS[0];
  const tAt = (e) => {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * DURATION;
  };
  let dragging = false;
  scrub.addEventListener('pointerdown', (e) => { dragging = true; scrub.setPointerCapture(e.pointerId); player.seek(tAt(e)); });
  scrub.addEventListener('pointermove', (e) => {
    const t = tAt(e), r = scrub.getBoundingClientRect();
    tip.style.left = `${((t / DURATION) * r.width).toFixed(0)}px`;
    tip.textContent = `${fmt(t)} · ${chapterAt(t).title}`;
    if (dragging) player.seek(t);
  });
  scrub.addEventListener('pointerup', () => { dragging = false; });
  scrub.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') player.seek(player.currentTime + 1);
    if (e.key === 'ArrowLeft') player.seek(player.currentTime - 1);
  });

  // Auto-hiding controls
  let hideTimer;
  function showControls(stay = false) {
    controls.classList.add('show');
    body.classList.remove('hide-cursor');
    clearTimeout(hideTimer);
    if (!stay) hideTimer = setTimeout(() => { if (player.playing) { controls.classList.remove('show'); body.classList.add('hide-cursor'); } }, 2200);
  }
  addEventListener('pointermove', () => { if (intro.classList.contains('hidden') && !body.classList.contains('recording')) showControls(); });

  addEventListener('keydown', async (e) => {
    if (e.target.closest?.('button') && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); if (!intro.classList.contains('hidden')) begin(player); else await player.toggle(); syncPlaying(); showControls(); }
    else if (k === 'arrowright') { player.seek(player.currentTime + 2); showControls(); }
    else if (k === 'arrowleft') { player.seek(player.currentTime - 2); showControls(); }
    else if (k === 'm') $('btn-mute').click();
    else if (k === 'f') $('btn-fs').click();
    else if (k === 'r') $('btn-rec').click();
    else if (k === 'h') controls.classList.toggle('show');
    else if (/^[0-9]$/.test(k)) { player.seek(SEGMENTS[Math.min(+k, SEGMENTS.length - 1)].start * TIME_SCALE + 0.01); showControls(); }
  });
  // EXPLORE: pause and fly through the frozen 3D scene
  const setExplore = (on) => {
    if (on) { if (player.playing) { player.pause(); syncPlaying(); } intro.classList.add('hidden'); explorer.enter(player.time); }
    else explorer.exit();
    body.classList.toggle('exploring-on', on);
    $('btn-explore').setAttribute('aria-pressed', String(on));
    showControls(on);
  };
  $('btn-explore').addEventListener('click', () => setExplore(!explorer.active));
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'e' && !e.target.closest?.('input, textarea')) { e.preventDefault(); setExplore(!explorer.active); }
    else if (k === 'escape' && explorer.active) setExplore(false);
  });
  const origPlay = player.play.bind(player);
  player.play = async (...a) => { if (explorer.active) setExplore(false); await origPlay(...a); syncPlaying(); showControls(); };
  const origSeek = player.seek.bind(player);
  player.seek = (t) => { origSeek(t); if (explorer.active) explorer.enter(player.time); };   // scrubbing re-poses the world
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
