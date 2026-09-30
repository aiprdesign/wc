// Offline, frame-exact render of the whole film to an MP4 (picture + score).
//   node tools/render.mjs --gpu --aspect 1 --width 1080 --out renders/1x1        (square)
//   node tools/render.mjs --gpu --aspect 16:9 --width 1920 --out renders/16x9    (landscape)
//   node tools/render.mjs --gpu --aspect 9:16 --width 1080 --out renders/9x16    (vertical)
//   node tools/render.mjs --gpu --aspect 2:3 --width 1080 --out renders/2x3      (vertical 2:3)
// Options: --gpu (use your graphics card: opens browser windows while it renders; without it
// Chromium renders in software, which is slow), --fps 30, --workers 2, --from/--to (film s),
// --noaudio, --ffmpeg /path/to/ffmpeg (else ffmpeg-static from npm, then ffmpeg on PATH).
// Realism (offline only — real-time playback never pays for these):
//   --preset cinematic   --mb 8 --ss 2 --q high (ultra above 2560 px): the delivery look
//   --preset draft       no motion blur, no supersampling, quality from the width (fast previews;
//                        also the default when no preset is given)
//   --mb N               motion blur: N sub-frames per frame over a --shutter 180 (degrees) shutter,
//                        averaged in linear HDR before bloom and grade (sequences are pure functions of
//                        time, so it is exact and deterministic; sub-frames across a hard cut are dropped)
//   --ss N               supersampling: render at N× and filter down (cleaner edges, finer detail)
//   --q low|medium|high|ultra   render quality; high/ultra add ambient occlusion, 2× shadow maps,
//                        tri-planar surface detail, veiling glare and finer bokeh (README: Picture realism)
// Explicit flags override the preset (e.g. --preset cinematic --mb 12).
// Or simply: npm run render:1x1 / render:16x9 / render:9x16 / render:all (cinematic preset),
// npm run render:draft:1x1 … for quick drafts.
// Every frame is rendered deterministically through window.__film.renderFrame(T, { motionBlur }),
// so the result is identical to real-time playback but never drops a frame.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(args.out ?? 'renders/film');
const fps = Number(args.fps ?? 30), width = Number(args.width ?? 1920), workers = Number(args.workers ?? 2);
const from = Number(args.from ?? 0), to = Number(args.to ?? 108.3);
const PRESETS = {
  cinematic: { mb: 8, ss: 2, q: width > 2560 ? 'ultra' : 'high' },
  draft: { mb: 0, ss: 1, q: width > 1920 ? 'high' : width > 1280 ? 'medium' : 'low' },
};
const presetName = args.preset === true || !args.preset ? 'draft' : String(args.preset);
if (!PRESETS[presetName]) { console.error(`Unknown --preset ${presetName} (cinematic | draft)`); process.exit(1); }
const preset = PRESETS[presetName];
const mb = Math.max(0, Math.round(Number(args.mb ?? preset.mb) || 0));
const ss = Math.max(1, Math.min(4, Number(args.ss ?? preset.ss) || 1));
const shutter = Number(args.shutter ?? 180);
const quality = ['low', 'medium', 'high', 'ultra'].includes(args.q) ? args.q : preset.q;
console.log(`preset ${presetName}: quality ${quality}, motion blur ${mb > 1 ? `${mb} sub-frames @ ${shutter}°` : 'off'}, supersampling ${ss}×`);
const framesDir = path.join(out, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

// --gpu: a visible (headed) browser gets the real graphics card; headless falls back to software
const gl = args.gpu ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ headless: !args.gpu, args: [...gl, '--ignore-gpu-blocklist'] });
if (args.gpu) console.log('Rendering on the GPU: browser windows will open and close by themselves. Leave them be.');

async function openPage(extra = '') {
  const page = await browser.newPage({ viewport: { width, height: Math.round(width / (args.aspect ? eval(String(args.aspect).replace(':', '/')) : 2.39)) } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  const fx = `${ss > 1 ? `&ss=${ss}` : ''}${shutter !== 180 ? `&shutter=${shutter}` : ''}`;
  await page.goto(`http://localhost:${port}/?still&noaudio&q=${quality}${fx}${args.aspect ? `&aspect=${args.aspect}` : ''}${extra}`);
  await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 600000 });
  return page;
}

// Soundtrack → WAV
const wavPath = path.join(out, 'score.wav');
if (!args.noaudio) {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/index.html?still&noaudio`);
  const b64 = await page.evaluate(async () => {
    const mod = await import('/src/audio/score.js');
    const buf = await mod.renderScore(48000);
    const blob = mod.encodeWav(buf);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(wavPath, Buffer.from(b64, 'base64'));
  await page.close();
  console.log('score →', wavPath);
}

const total = Math.round((to - from) * fps);
const started = Date.now();
let done = 0;
async function worker(w) {
  const page = await openPage();
  const canvas = page.locator('#film');
  for (let i = w; i < total; i += workers) {
    const file = path.join(framesDir, `f_${String(i).padStart(5, '0')}.jpg`);
    if (fs.existsSync(file) && !args.overwrite) { done++; continue; }
    const T = from + i / fps;
    // retry: under heavy machine load a screenshot can time out — never lose the whole render to it
    for (let attempt = 0; ; attempt++) {
      try {
        await page.evaluate(([t, o]) => window.__film.renderFrame(t, o), [T, { motionBlur: mb, fps }]);
        await canvas.screenshot({ path: file, type: 'jpeg', quality: 93, timeout: 180000 });
        break;
      } catch (e) {
        if (attempt >= 3) throw e;
        console.warn(`frame ${i}: ${e.name}, retrying`);
      }
    }
    done++;
    if (done % 30 === 0) {
      const rate = done / ((Date.now() - started) / 1000);
      console.log(`${done}/${total} frames · ${rate.toFixed(2)} fps · ETA ${((total - done) / rate / 60).toFixed(1)} min`);
    }
  }
  await page.close();
}
await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
await browser.close();
server.close();

// ffmpeg: --ffmpeg, $FFMPEG, the ffmpeg-static npm package, or ffmpeg on the PATH
let ffmpeg = args.ffmpeg ?? process.env.FFMPEG;
if (!ffmpeg) { try { ffmpeg = require('ffmpeg-static'); } catch { /* not installed */ } }
if (!ffmpeg) { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = 'ffmpeg'; } catch { /* not on PATH */ } }
if (ffmpeg) {
  const tag = args.aspect ? '-' + (String(args.aspect) === '1' ? '1x1' : String(args.aspect).replace(':', 'x')) : '';
  const mp4 = path.join(out, `achievements-of-western-civilization${tag}.mp4`);
  const a = ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f_%05d.jpg')];
  if (fs.existsSync(wavPath) && from === 0) a.push('-i', wavPath, '-c:a', 'aac', '-b:a', '256k', '-shortest');
  a.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
  execFileSync(ffmpeg, a, { stdio: 'inherit' });
  console.log('film →', mp4);
} else {
  console.log('Frames in', framesDir, '— install ffmpeg (npm i) or pass --ffmpeg to encode an MP4.');
}
