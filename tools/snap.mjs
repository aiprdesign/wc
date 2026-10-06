// Headless frame capture for development / review.
//   node tools/snap.mjs --times 0.5,3,7.2 --out /tmp/frames [--width 1280] [--port 8123] [--audio]
//     [--film india] [--only indus,language] (build just those chapters: much quicker) [--aspect 9:16]
// Times are STORY seconds.
// Serves the repo, renders exact film times through window.__film.renderFrame and saves PNGs.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const times = String(args.times ?? '1').split(',').map(Number);
const out = path.resolve(args.out ?? 'frames');
const width = Number(args.width ?? 1280);
const port = Number(args.port ?? 8000 + Math.floor(Math.random() * 900));
fs.mkdirSync(out, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    const idx = path.join(p, 'index.html');
    if (fs.existsSync(idx)) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(idx)); }
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(p));
}).listen(port);

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height: Math.round(width / (args.aspect ? eval(String(args.aspect).replace(':', '/')) : 2.39)) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const q = `still&t=${times[0]}&q=${args.q ?? 'low'}${args.aspect ? `&aspect=${args.aspect}` : ''}${args.audio ? '' : '&noaudio'}${args.only ? `&only=${args.only}` : ''}${args.film ? `&film=${args.film}` : ''}`;
await page.goto(`http://localhost:${port}/?${q}`);
await page.waitForFunction(() => window.__film?.ready === true, null, { timeout: 1200000 });
for (const t of times) {
  const t0 = Date.now();
  await page.evaluate((T) => window.__film.renderStory(T), t);
  const file = path.join(out, `f_${t.toFixed(2).padStart(6, '0')}.png`);
  await page.locator('#film').screenshot({ path: file, timeout: 600000 });
  console.log(`t=${t} → ${file} (${Date.now() - t0} ms)`);
}
if (errors.length) console.log('Console:\n' + [...new Set(errors)].slice(0, 40).join('\n'));
await browser.close();
server.close();
