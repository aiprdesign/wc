// PERSISTENT GENERATED TEXTURES: what the scenes paint procedurally (normal maps from height fields, ground
// masks, inscriptions, leaf and bark maps — seconds of pixel loops each) is kept on the device between
// visits (IndexedDB), so a refresh or a second visit loads those images instead of painting them again.
//
// A module opts in with one top-level line:   const P = await persistModule(import.meta.url);
// and wraps a generator:   const maps = P.memo('foil-gold', () => ({ map, normalMap, roughnessMap }));
// The result may be a texture, a canvas, or an object whose values are textures / canvases / plain numbers.
// Entries are versioned by the module's own source text (any edit to the file paints afresh) plus LIB
// (bump it when a shared painter in src/lib changes), and stale versions are cleared. Everything is
// best effort: no IndexedDB (private windows, file://, automated stills) → the generator simply runs.
import * as THREE from 'three';

const LIB = 1;                       // bump when lib/textures.js / lib/noise.js painters change
const DB = 'awc-generated', STORE = 'img';
const ENABLED = typeof indexedDB !== 'undefined' && typeof createImageBitmap === 'function' && typeof location !== 'undefined'
  && /^https?:$/.test(location.protocol) && !/[?&]nopersist\b/.test(location.search)
  && (!/[?&]still\b/.test(location.search) || /[?&]persist\b/.test(location.search));   // (stills: only with ?persist)

let dbP = null;
function db() {
  dbP ??= new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = rq.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}
const tx = async (mode, fn) => { const d = await db(); if (!d) return null; return new Promise((res) => { try { const t = d.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = t.onabort = () => res(null); } catch { res(null); } }); };

async function hash(s) {
  try {
    const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(16); }
}

// texture flags worth keeping
const FLAGS = ['colorSpace', 'wrapS', 'wrapT', 'anisotropy', 'flipY', 'magFilter', 'minFilter', 'generateMipmaps'];
const toCanvas = (bmp) => { const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return c; };
const isCanvas = (v) => (typeof HTMLCanvasElement !== 'undefined' && v instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && v instanceof OffscreenCanvas);
const blobOf = (c) => (c.convertToBlob ? c.convertToBlob({ type: 'image/png' }) : new Promise((r) => c.toBlob(r, 'image/png')));

const NOOP = { memo: (k, make) => make(), ready: true };

export async function persistModule(url) {
  if (!ENABLED) return NOOP;
  try {
    const path = new URL(url).pathname;
    const src = await (await fetch(url)).text();
    const ver = await hash(`${src}|${LIB}`);
    const prefix = `${path}@${ver}:`;
    // this version's records, decoded off the main thread before the scene builds
    const records = (await tx('readonly', (s) => s.getAll(IDBKeyRange.bound(prefix, `${prefix}￿`)))) ?? [];
    const keys = (await tx('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)))) ?? [];
    const mem = new Map();
    await Promise.all(records.map(async (rec, i) => {
      try {
        const parts = {};
        await Promise.all(Object.entries(rec.blobs).map(async ([k, b]) => {
          parts[k] = rec.meta[k].kind === 'data' ? new Uint8Array(await b.arrayBuffer()) : await createImageBitmap(b, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        }));
        mem.set(keys[i], { ...rec, parts });
      } catch { /* a broken record: painted afresh */ }
    }));
    // older versions of this module's images go
    tx('readwrite', (s) => {
      const rq = s.openCursor(IDBKeyRange.bound(`${path}@`, `${path}@￿`));
      rq.onsuccess = () => { const c = rq.result; if (!c) return; if (!String(c.key).startsWith(prefix)) c.delete(); c.continue(); };
    });
    return {
      ready: true,
      memo(key, make) {
        const full = prefix + key, hit = mem.get(full);
        if (hit) {
          const build = (name) => {
            const m = hit.meta[name];
            if (m.kind === 'value') return m.value;
            if (m.kind === 'data') {
              const t = new THREE.DataTexture(hit.parts[name], m.w, m.h, m.format, m.type);
              for (const f of FLAGS) if (m.flags[f] !== undefined) t[f] = m.flags[f];
              t.needsUpdate = true;
              return t;
            }
            const c = toCanvas(hit.parts[name]);
            if (m.kind === 'canvas') return c;
            const t = new THREE.CanvasTexture(c);
            for (const f of FLAGS) if (m.flags[f] !== undefined) t[f] = m.flags[f];
            t.needsUpdate = true;
            return t;
          };
          const res = hit.single ? build('_') : Object.fromEntries(Object.keys(hit.meta).map((n) => [n, build(n)]));
          // used once: the decoded copies go, so the device never holds each image twice (a later rebuild of
          // the same chapter, e.g. AR Lite coming back to it, simply paints it again)
          mem.delete(full);
          for (const b of Object.values(hit.parts)) b?.close?.();
          return res;
        }
        const res = make();
        save(full, res);
        return res;
      },
    };
  } catch { return NOOP; }
}

// keep a fresh result (after the build, while the browser is idle; encoding runs off the main thread)
function save(full, res) {
  const single = res?.isTexture || isCanvas(res);
  const entries = single ? [['_', res]] : Object.entries(res ?? {});
  const meta = {}, canv = {};
  for (const [n, v] of entries) {
    if (v?.isDataTexture && v.image?.data instanceof Uint8Array && v.type === THREE.UnsignedByteType) {
      meta[n] = { kind: 'data', w: v.image.width, h: v.image.height, format: v.format, type: v.type, flags: Object.fromEntries(FLAGS.map((f) => [f, v[f]])) };
      canv[n] = v.image.data;
    } else if (v?.isTexture && isCanvas(v.image)) { meta[n] = { kind: 'texture', flags: Object.fromEntries(FLAGS.map((f) => [f, v[f]])) }; canv[n] = v.image; }
    else if (isCanvas(v)) { meta[n] = { kind: 'canvas' }; canv[n] = v; }
    else if (v == null || ['number', 'string', 'boolean'].includes(typeof v)) meta[n] = { kind: 'value', value: v };
    else return;   // something we can't rebuild: not kept
  }
  if (!Object.keys(canv).length) return;
  const later = globalThis.requestIdleCallback ?? ((f) => setTimeout(f, 1500));
  later(async () => {
    try {
      const blobs = {};
      await Promise.all(Object.entries(canv).map(async ([n, c]) => { blobs[n] = c instanceof Uint8Array ? new Blob([c]) : await blobOf(c); }));
      if (Object.values(blobs).some((b) => !b)) return;
      await tx('readwrite', (s) => s.put({ single, meta, blobs }, full));
    } catch { /* storage full or unavailable: painted again next time */ }
  });
}
