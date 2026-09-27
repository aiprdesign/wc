// Converts Cinzel (OFL) into a three.js typeface JSON used for the monumental 3D letters.
// Usage: node tools/build-typeface.mjs <path-to-font.woff> <out.json>
import fs from 'node:fs';
import opentype from 'opentype.js';

const [src, out] = process.argv.slice(2);
const buf = fs.readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const scale = 1000 / font.unitsPerEm;
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,•-—:\'’ &';
const glyphs = {};
for (const ch of chars) {
  const g = font.charToGlyph(ch);
  const token = { ha: Math.round(g.advanceWidth * scale), x_min: 0, x_max: 0, o: '' };
  const bb = g.getBoundingBox();
  token.x_min = Math.round(bb.x1 * scale);
  token.x_max = Math.round(bb.x2 * scale);
  for (const c of g.path.commands) {
    const t = c.type.toLowerCase();
    if (t === 'c') token.o += `b ${Math.round(c.x * scale)} ${Math.round(c.y * scale)} ${Math.round(c.x1 * scale)} ${Math.round(c.y1 * scale)} ${Math.round(c.x2 * scale)} ${Math.round(c.y2 * scale)} `;
    else if (t === 'q') token.o += `q ${Math.round(c.x * scale)} ${Math.round(c.y * scale)} ${Math.round(c.x1 * scale)} ${Math.round(c.y1 * scale)} `;
    else if (t === 'm' || t === 'l') token.o += `${t} ${Math.round(c.x * scale)} ${Math.round(c.y * scale)} `;
    else if (t === 'z') token.o += 'z ';
  }
  glyphs[ch] = token;
}
const json = {
  glyphs,
  familyName: font.names.fontFamily?.en || 'Cinzel',
  ascender: Math.round(font.ascender * scale),
  descender: Math.round(font.descender * scale),
  underlinePosition: Math.round((font.tables.post?.underlinePosition || 0) * scale),
  underlineThickness: Math.round((font.tables.post?.underlineThickness || 0) * scale),
  boundingBox: { yMin: Math.round(font.tables.head.yMin * scale), xMin: Math.round(font.tables.head.xMin * scale), yMax: Math.round(font.tables.head.yMax * scale), xMax: Math.round(font.tables.head.xMax * scale) },
  resolution: 1000,
  original_font_information: font.tables.name,
};
fs.writeFileSync(out, JSON.stringify(json));
console.log('wrote', out, Object.keys(glyphs).length, 'glyphs');
