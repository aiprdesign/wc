// TEXTURE BUDGET for phones (lite quality). The film's scenes carry ~450 procedural textures — Earth
// maps up to 4096×2048, parchment and atlas canvases, planet maps — about 0.75 GB once uploaded with
// mipmaps, more than a phone browser lets one tab use (Chrome shows "Something went wrong" and kills
// it while the scenes build). Here every texture is capped by AREA (so long, thin text labels keep
// their resolution) and resampled once, before it is ever uploaded; the full-size source is dropped.
//   capPx: max pixels per texture (square-ish images); labels (height ≤ labelH) get a looser cap
const seen = new WeakSet();

function resampleCanvas(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, w, h);
  return c;
}

// {data, width, height} images (DataTexture): box-filtered resample of any typed array
function resampleData(img, w, h) {
  const { data, width: W, height: H } = img;
  const ch = Math.round(data.length / (W * H));
  const out = new data.constructor(w * h * ch);
  const sx = W / w, sy = H / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const n = (y1 - y0) * (x1 - x0);
      for (let c = 0; c < ch; c++) {
        let s = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += data[(yy * W + xx) * ch + c];
        out[(y * w + x) * ch + c] = s / n;
      }
    }
  }
  return { data: out, width: w, height: h };
}

export function budgetTexture(t, opts = {}) {
  const { capPx = 384 * 384, labelCapPx = 1400 * 280, labelH = 300 } = opts;
  if (!t || !t.isTexture || t.isRenderTargetTexture || t.isCubeTexture || t.isCompressedTexture || seen.has(t)) return 0;
  const img = t.image;
  const W = img?.width, H = img?.height;
  if (!W || !H || t.isData3DTexture || t.isDataArrayTexture) return 0;
  seen.add(t);
  // a canvas the scene redraws while it plays (live read-outs) must keep its own canvas: skip any
  // texture whose version moved while the scene was warmed up (opts.before: versions beforehand)
  const v0 = opts.before?.get(t);
  if (v0 !== undefined ? t.version !== v0 : t.version > 2) return 0;
  const label = H <= labelH && W / H > 4;
  const cap = label ? labelCapPx : capPx;
  if (W * H <= cap) return 0;
  const k = Math.sqrt(cap / (W * H));
  const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  let next = null;
  const isDom = typeof HTMLCanvasElement !== 'undefined' && (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas));
  try {
    if (isDom) next = resampleCanvas(img, w, h);
    else if (img.data && img.data.length) next = resampleData(img, w, h);
  } catch { next = null; }
  if (!next) return 0;
  t.image = next;
  t.needsUpdate = true;
  return W * H - w * h;
}

export function budgetScene(root, opts) {
  let saved = 0;
  const visit = (m) => {
    if (!m) return;
    for (const k in m) { const v = m[k]; if (v && v.isTexture) saved += budgetTexture(v, opts); }
    if (m.uniforms) for (const u of Object.values(m.uniforms)) {
      const v = u?.value;
      if (v?.isTexture) saved += budgetTexture(v, opts);
      else if (Array.isArray(v)) for (const x of v) if (x?.isTexture) saved += budgetTexture(x, opts);
    }
  };
  root.traverse((o) => { for (const m of [o.material].flat()) visit(m); });
  if (root.background?.isTexture) saved += budgetTexture(root.background, opts);
  return saved;
}

// versions of every texture in a scene, taken before its warm-up updates (see budgetTexture)
export function textureVersions(root) {
  const m = new Map();
  const visit = (mat) => {
    if (!mat) return;
    for (const k in mat) { const v = mat[k]; if (v && v.isTexture) m.set(v, v.version); }
    if (mat.uniforms) for (const u of Object.values(mat.uniforms)) {
      const v = u?.value;
      if (v?.isTexture) m.set(v, v.version);
      else if (Array.isArray(v)) for (const x of v) if (x?.isTexture) m.set(x, x.version);
    }
  };
  root.traverse((o) => { for (const mat of [o.material].flat()) visit(mat); });
  return m;
}
