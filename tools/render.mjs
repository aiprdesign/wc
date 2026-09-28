// Offline, frame-exact render of the whole film to an MP4 (picture + score).
//   node tools/render.mjs --out renders/film --fps 30 --width 1920 --workers 3 [--from 0 --to 60] [--ffmpeg /path/to/ffmpeg]
// Every frame is rendered deterministically through window.__film.renderFrame(T), so the
// result is identical to real-time playback but never drops a frame.
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
const framesDir = path.join(out, 'frames');
fs.mkdirSync(framesDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const gl = args.gpu ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...gl, '--ignore-gpu-blocklist'] });
const quality = width > 1920 ? 'high' : width > 1280 ? 'medium' : 'low';

async function openPage(extra = '') {
  const page = await browser.newPage({ viewport: { width, height: Math.round(width / (args.aspect ? eval(String(args.aspect).replace(':', '/')) : 2.39)) } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${port}/?still&noaudio&q=${quality}${args.aspect ? `&aspect=${args.aspect}` : ''}${extra}`);
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
        await page.evaluate((t) => window.__film.renderFrame(t), T);
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

const ffmpeg = args.ffmpeg ?? process.env.FFMPEG;
if (ffmpeg) {
  const mp4 = path.join(out, 'achievements-of-western-civilization.mp4');
  const a = ['-y', '-framerate', String(fps), '-i', path.join(framesDir, 'f_%05d.jpg')];
  if (fs.existsSync(wavPath) && from === 0) a.push('-i', wavPath, '-c:a', 'aac', '-b:a', '256k', '-shortest');
  a.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4);
  execFileSync(ffmpeg, a, { stdio: 'inherit' });
  console.log('film →', mp4);
} else {
  console.log('Frames in', framesDir, '— pass --ffmpeg to encode an MP4.');
}
