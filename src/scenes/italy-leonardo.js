// THE ITALIAN RENAISSANCE — Leonardo da Vinci's notebooks: a study desk with an open notebook and loose
// sheets; three of his designs as wood-and-linen models (never built in his lifetime):
//   the aerial screw (c. 1489): a helix of starched linen on a reed rim round a mast, on a round platform
//     where men were to push bars to turn it;
//   the ornithopter (c. 1485–90): a prone pilot in a wooden frame working two bat-like wings of linen
//     stretched over wooden ribs;
//   the armoured vehicle (1487): a low cone of planks reinforced with iron, a lookout turret on top, light
//     guns all round the rim, wheels turned by cranks from inside.
// Each model is also its own drawing: its creases, outline and silhouette for one fixed view (drawingOf),
// laid flat on the page; the very same strokes inflate into 3D as the model lifts off the sheet.
// Units: metres. Desk-local coordinates (the desk top at y = 0).
import * as THREE from 'three';
import { rng, lerp } from '../lib/math.js';
import { fbm2, noise2 } from '../lib/noise.js';
import { canvas as mkCanvas, toTexture } from '../lib/textures.js';
import { V, mergeParts, at, beam, rod, drawingOf, hatchTriangles, mirrorScript, woodTexture, woodNormal, linenTexture, linenNormal, ropeMaps, normalFromHeight, boxUV, pageTexture, inkOpts, orderedStrokes, SEPIA, CHALK } from './italy-assets.js';
import { segmentsLine } from '../lib/lines.js';

export const PAGE_Y = 0.016;            // the notebook's page surface
export const SHEET_Y = 0.0025;          // loose sheets on the desk
export const PAGE = { w: 0.205, h: 0.29 };
export const SHEETS = {
  dome: { x: -0.112, z: 0.0, ry: 0, y: PAGE_Y },
  screw: { x: 0.112, z: -0.004, ry: 0, y: PAGE_Y },
  orni: { x: 0.47, z: 0.012, ry: -0.07, y: SHEET_Y },
  car: { x: 0.81, z: -0.006, ry: 0.06, y: SHEET_Y },
};

// a lashing: a few turns of cord round a joint (a short, fat torus coil along the member a → b)
function lash(list, at0, dir, r, turns = 3, pitch = 0.004) {
  const d = dir.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d);
  for (let k = 0; k < turns; k++) {
    const g = new THREE.TorusGeometry(r, r * 0.22 + 0.0012, 4, 10);
    list.push({ geometry: g, matrix: new THREE.Matrix4().compose(at0.clone().addScaledVector(d, (k - (turns - 1) / 2) * pitch), q, V(1, 1, 1)) });
  }
}
// a wooden peg (treenail) through a joint: its end grain shows as a small disc proud of the surface
const peg = (list, p, n, r = 0.0035) => list.push(rod(p.clone().addScaledVector(n, -0.004), p.clone().addScaledVector(n, 0.004), r, 6));

// ---------------------------------------------------------------------------------------- models
// Each returns { root, parts: [{ obj, meshes: [{ geometry, matrix }], mat: name }] } in model space
// (ground y = 0, about one unit across); mats name the shared material kinds.
function screwModel() {
  const root = new THREE.Group(), screw = new THREE.Group(), base = new THREE.Group();
  root.add(base, screw);
  const wood = [], linen = [], wood2 = [];
  // platform: a round deck with eight spokes and a rim, a hub
  wood.push(at(new THREE.CylinderGeometry(0.43, 0.44, 0.03, 32, 1), 0, 0.025, 0));
  wood.push(at(new THREE.TorusGeometry(0.43, 0.012, 5, 40), 0, 0.045, 0, Math.PI / 2));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; wood.push(beam(V(0, 0.048, 0), V(Math.cos(a) * 0.42, 0.048, Math.sin(a) * 0.42), 0.018, 0.01)); }
  wood.push(at(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), 0, 0.06, 0));
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; wood.push(rod(V(Math.cos(a) * 0.425, 0.04, Math.sin(a) * 0.425), V(Math.cos(a) * 0.425, 0.085, Math.sin(a) * 0.425), 0.006, 5)); }
  wood.push(at(new THREE.TorusGeometry(0.425, 0.006, 4, 40), 0, 0.085, 0, Math.PI / 2));
  // the screw: mast, push bars with handles, the helix of linen, its rim and struts
  wood2.push(rod(V(0, 0.04, 0), V(0, 0.98, 0), 0.014, 8));
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + 0.4, e = V(Math.cos(a) * 0.36, 0.17, Math.sin(a) * 0.36);
    wood2.push(beam(V(0, 0.17, 0), e, 0.016, 0.016));
    wood2.push(rod(e, e.clone().setY(0.07), 0.008, 6));
  }
  const PHI = Math.PI * 2 * 1.12, nP = 120, nR = 4;
  const helix = (f, r) => { const a = f * PHI; return V(Math.cos(a) * r, 0.3 + f * 0.56, Math.sin(a) * r); };
  const Rout = (f) => 0.45 - 0.07 * f;
  {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nP; i++) for (let j = 0; j <= nR; j++) {
      const f = i / nP, r = lerp(0.02, Rout(f), j / nR);
      const p = helix(f, r);
      p.y -= (0.008 + 0.01 * Math.abs(Math.sin(f * 15 * Math.PI))) * Math.sin(Math.PI * j / nR);   // the cloth sags between mast and rim, most between the struts
      pos.push(p.x, p.y, p.z); uv.push(f * 6, j / nR);
    }
    for (let i = 0; i < nP; i++) for (let j = 0; j < nR; j++) { const a = i * (nR + 1) + j, b = a + 1, c = a + nR + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    linen.push({ geometry: g, matrix: new THREE.Matrix4() });
  }
  const rim = []; for (let i = 0; i <= 160; i++) { const f = i / 160; rim.push(helix(f, Rout(f))); }
  wood2.push({ geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 160, 0.007, 5, false), matrix: new THREE.Matrix4() });
  const rope = [], iron = [];
  for (let i = 0; i <= 15; i++) {
    const f = i / 15, a = helix(f, 0.015), b = helix(f, Rout(f));
    wood2.push(rod(a, b, 0.0045, 5));
    lash(rope, b.clone().lerp(a, 0.03), b.clone().sub(a).cross(V(0, 1, 0)).normalize().cross(b.clone().sub(a)).normalize(), 0.009, 2, 0.005);
  }
  for (const y of [0.17, 0.3, 0.6, 0.9]) iron.push(at(new THREE.CylinderGeometry(0.019, 0.019, 0.014, 12, 1, true), 0, y, 0));
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4; lash(rope, V(Math.cos(a) * 0.05, 0.17, Math.sin(a) * 0.05), V(Math.cos(a), 0, Math.sin(a)), 0.012, 3, 0.006); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; peg(wood, V(Math.cos(a) * 0.4, 0.056, Math.sin(a) * 0.4), V(0, 1, 0)); }
  return { root, parts: [{ obj: base, meshes: wood, mat: 'wood' }, { obj: screw, meshes: wood2, mat: 'wood' }, { obj: screw, meshes: linen, mat: 'linen' }, { obj: screw, meshes: rope, mat: 'rope', draw: false }, { obj: screw, meshes: iron, mat: 'iron', draw: false }], screw };
}

function orniModel() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const wood = [], linen = [];
  // the frame the pilot lies in: keel, rails, cross-pieces, the board, a head hoop and stirrups
  wood.push(beam(V(-0.34, 0.12, 0), V(0.3, 0.14, 0), 0.026, 0.026));
  for (const s of [1, -1]) wood.push(beam(V(-0.28, 0.12, s * 0.08), V(0.24, 0.135, s * 0.07), 0.016, 0.016));
  for (const x of [-0.24, -0.06, 0.12, 0.24]) wood.push(beam(V(x, 0.13, -0.09), V(x, 0.13, 0.09), 0.014, 0.014));
  wood.push(at(new THREE.BoxGeometry(0.36, 0.01, 0.13), -0.02, 0.15, 0));
  wood.push(at(new THREE.TorusGeometry(0.06, 0.006, 5, 20), 0.27, 0.19, 0, 0, Math.PI / 2, 0));
  for (const s of [1, -1]) wood.push(rod(V(-0.3, 0.13, s * 0.06), V(-0.36, 0.06, s * 0.08), 0.006, 5));
  // the pylon carrying the wing pivots
  wood.push(beam(V(0.03, 0.14, 0), V(0.03, 0.27, 0), 0.02, 0.02));
  wood.push(beam(V(0.03, 0.27, -0.09), V(0.03, 0.27, 0.09), 0.018, 0.018));
  const cords = [], leather = [];
  for (const sz of [1, -1]) {
    // pulleys on the pylon's cross-tree, cords from the pilot's levers over them to the wing spars
    for (const x of [-0.01, 0.07]) {
      wood.push(at(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 12), x, 0.255, sz * 0.05, Math.PI / 2));
      wood.push(at(new THREE.TorusGeometry(0.011, 0.0025, 4, 12), x, 0.255, sz * 0.05));
    }
    cords.push(rod(V(-0.08, 0.155, sz * 0.05), V(-0.01, 0.266, sz * 0.05), 0.0018, 4), rod(V(-0.01, 0.266, sz * 0.05), V(0.06, 0.29, sz * 0.2), 0.0018, 4));
    cords.push(rod(V(0.12, 0.155, sz * 0.05), V(0.07, 0.266, sz * 0.05), 0.0018, 4), rod(V(0.07, 0.266, sz * 0.05), V(0.08, 0.3, sz * 0.24), 0.0018, 4));
    // levers and pedals the pilot works
    wood.push(rod(V(-0.08, 0.15, sz * 0.05), V(-0.1, 0.2, sz * 0.05), 0.004, 5), rod(V(0.12, 0.15, sz * 0.05), V(0.14, 0.2, sz * 0.05), 0.004, 5));
    leather.push(at(new THREE.BoxGeometry(0.016, 0.006, 0.03), -0.36, 0.06, sz * 0.08));
  }
  // the prone pilot's harness: straps across the board, a chest sling
  for (const x of [-0.12, 0.04, 0.16]) leather.push(at(new THREE.BoxGeometry(0.018, 0.004, 0.14), x, 0.157, 0));
  leather.push(at(new THREE.TorusGeometry(0.045, 0.004, 4, 16, Math.PI), 0.16, 0.157, 0, 0, Math.PI / 2, 0));
  for (const x of [-0.24, -0.06, 0.12, 0.24]) for (const sz of [1, -1]) lash(cords, V(x, 0.13, sz * 0.075), V(0, 0, 1), 0.012, 2, 0.004);
  wood.push(at(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), 0.03, 0.27, 0.09, Math.PI / 2)); wood.push(at(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), 0.03, 0.27, -0.09, Math.PI / 2));
  // tail: a fan of linen on three ribs
  const tail = [];
  {
    const o = V(-0.34, 0.13, 0);
    const tips = [V(-0.52, 0.17, -0.09), V(-0.55, 0.16, 0), V(-0.52, 0.17, 0.09)];
    for (const tp of tips) wood.push(rod(o, tp, 0.005, 5));
    const pos = [];
    for (let i = 0; i < 2; i++) { const a = tips[i], b = tips[i + 1], m = a.clone().lerp(b, 0.5).lerp(o, 0.12); pos.push(o.x, o.y, o.z, a.x, a.y, a.z, m.x, m.y, m.z, o.x, o.y, o.z, m.x, m.y, m.z, b.x, b.y, b.z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); boxUV(g, 10);
    tail.push({ geometry: g, matrix: new THREE.Matrix4() });
  }
  const parts = [{ obj: body, meshes: wood, mat: 'wood' }, { obj: body, meshes: tail, mat: 'linen' }, { obj: body, meshes: cords, mat: 'rope', draw: false }, { obj: body, meshes: leather, mat: 'leather', draw: false }];
  // the wings: a curved leading spar and five finger ribs with scalloped linen between (bat-like)
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(0.03, 0.27, s * 0.09);
    root.add(w); wings.push(w);
    const spar = new THREE.CatmullRomCurve3([V(0, 0, 0), V(0.07, 0.03, s * 0.2), V(0.06, 0.06, s * 0.42), V(-0.02, 0.07, s * 0.62)]);
    const ww = [{ geometry: new THREE.TubeGeometry(spar, 40, 0.009, 5, false), matrix: new THREE.Matrix4() }];
    const F = [0.04, 0.24, 0.44, 0.62, 0.8, 1.0];
    const ribs = F.map((f, k) => {
      const p0 = spar.getPoint(f);
      const len = 0.42 * (1 - 0.62 * f) + 0.04;
      const dir = V(-1, -0.04, s * (0.18 + 0.9 * f * f)).normalize();
      const pts = []; for (let m = 0; m <= 4; m++) pts.push(p0.clone().addScaledVector(dir, len * m / 4).add(V(0, -0.012 * Math.sin(Math.PI * m / 4), 0)));
      ww.push(rod(pts[0], pts[4], 0.0055 - k * 0.0004, 5));
      return pts;
    });
    const pos = [];
    const C = 4;
    for (let k = 0; k < ribs.length - 1; k++) {
      const A = ribs[k], B = ribs[k + 1];
      const P = (c, m) => {
        const p = A[m].clone().lerp(B[m], c / C);
        const sc = Math.sin(Math.PI * c / C);
        if (m === 4) p.lerp(A[0].clone().lerp(B[0], c / C), 0.2 * sc);          // scalloped trailing edge
        p.y -= 0.01 * sc * (m / 4);                                              // billow
        return p;
      };
      for (let c = 0; c < C; c++) for (let m = 0; m < 4; m++) {
        const a = P(c, m), b = P(c + 1, m), cc = P(c, m + 1), d = P(c + 1, m + 1);
        pos.push(...a.toArray(), ...cc.toArray(), ...b.toArray(), ...b.toArray(), ...cc.toArray(), ...d.toArray());
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); boxUV(g, 10);
    const wl = [];
    ribs.forEach((pts) => lash(wl, pts[0].clone().lerp(pts[1], 0.15), pts[1].clone().sub(pts[0]), 0.0085, 2, 0.004));
    parts.push({ obj: w, meshes: ww, mat: 'wood' }, { obj: w, meshes: [{ geometry: g, matrix: new THREE.Matrix4() }], mat: 'linen' }, { obj: w, meshes: wl, mat: 'rope', draw: false });
  }
  return { root, parts, wings };
}

function carModel() {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const wood = [], iron = [], bronze = [];
  const prof = [[0.505, 0.15], [0.495, 0.2], [0.455, 0.265], [0.39, 0.33], [0.3, 0.385], [0.2, 0.425], [0.125, 0.44]];
  const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const uv = lathe.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 14);
  wood.push({ geometry: lathe, matrix: new THREE.Matrix4() });
  wood.push(at(new THREE.CylinderGeometry(0.505, 0.52, 0.12, 32, 1, true), 0, 0.095, 0));
  wood.push(at(new THREE.CylinderGeometry(0.12, 0.125, 0.1, 16, 1), 0, 0.49, 0));
  wood.push(at(new THREE.ConeGeometry(0.14, 0.08, 16, 1), 0, 0.58, 0));
  iron.push(rod(V(0, 0.62, 0), V(0, 0.7, 0), 0.004, 5));
  // iron: meridian straps over the shell and two hoops, the rim band
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 16;
    const pts = prof.map(([r, y]) => V(Math.cos(a) * (r + 0.006), y, Math.sin(a) * (r + 0.006)));
    iron.push({ geometry: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.006, 4, false), matrix: new THREE.Matrix4() });
  }
  for (const [r, y] of [[0.462, 0.26], [0.31, 0.38]]) iron.push(at(new THREE.TorusGeometry(r, 0.006, 4, 48), 0, y, 0, Math.PI / 2));
  iron.push(at(new THREE.TorusGeometry(0.515, 0.008, 4, 48), 0, 0.15, 0, Math.PI / 2));
  // lookout slits in the turret
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; iron.push(at(new THREE.BoxGeometry(0.012, 0.03, 0.04), Math.cos(a) * 0.123, 0.5, Math.sin(a) * 0.123, 0, -a, 0)); }
  // light guns all round the rim
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    const p0 = V(Math.cos(a) * 0.47, 0.095, Math.sin(a) * 0.47), p1 = V(Math.cos(a) * 0.6, 0.095, Math.sin(a) * 0.6);
    bronze.push(rod(p0, p1, 0.012, 8));
    bronze.push(at(new THREE.TorusGeometry(0.014, 0.004, 4, 10), p1.x, p1.y, p1.z, 0, Math.PI / 2 - a, 0));
  }
  const detail = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    detail.push(at(new THREE.TorusGeometry(0.022, 0.004, 4, 12), Math.cos(a) * 0.513, 0.095, Math.sin(a) * 0.513, 0, Math.PI / 2 - a, 0));
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.PI / 16;
    for (const [r, y] of prof.slice(0, 6)) detail.push(at(new THREE.SphereGeometry(0.005, 6, 4), Math.cos(a) * (r + 0.011), y, Math.sin(a) * (r + 0.011)));
  }
  // the gearing inside: a crown wheel on the crank shaft driving lantern pinions on the axles
  const teeth = (cx, cy, cz, R, n, axis) => { for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const off = axis === 'y' ? V(Math.cos(a) * R, 0.012, Math.sin(a) * R) : V(Math.cos(a) * R, Math.sin(a) * R, 0); wood.push(at(new THREE.BoxGeometry(0.008, 0.012, 0.008), cx + off.x, cy + off.y, cz + off.z)); } };
  wood.push(at(new THREE.CylinderGeometry(0.11, 0.11, 0.014, 24), 0, 0.12, 0)); teeth(0, 0.12, 0, 0.1, 20, 'y');
  wood.push(rod(V(0, 0.12, 0), V(0, 0.3, 0), 0.01, 8));
  for (const sx of [1, -1]) { wood.push(rod(V(sx * 0.22, 0.075, -0.24), V(sx * 0.22, 0.075, 0.24), 0.008, 6)); wood.push(at(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 8, 1, true), sx * 0.09, 0.105, 0, 0, 0, Math.PI / 2)); }
  wood.push(beam(V(0, 0.3, 0), V(0.08, 0.3, 0), 0.01, 0.01), rod(V(0.08, 0.3, 0), V(0.08, 0.34, 0), 0.005, 5));
  // wheels (inside, just below the skirt)
  for (const [x, z] of [[0.22, 0.2], [-0.22, 0.2], [0.22, -0.2], [-0.22, -0.2]]) {
    wood.push(at(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 8), x, 0.075, z, Math.PI / 2));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI; wood.push(at(new THREE.BoxGeometry(0.008, 0.14, 0.012), x, 0.075, z, 0, 0, a)); }
    iron.push(at(new THREE.TorusGeometry(0.075, 0.006, 4, 20), x, 0.075, z));
  }
  return { root, parts: [{ obj: body, meshes: wood, mat: 'wood' }, { obj: body, meshes: iron, mat: 'iron' }, { obj: body, meshes: bronze, mat: 'bronze' }, { obj: body, meshes: detail, mat: 'iron', draw: false }] };
}

// ---------------------------------------------------------------------------------------- the desk
function deskCanvas() {
  const W = 1024, H = 512, c = mkCanvas(W, H), g = c.getContext('2d');
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const warp = fbm2(u * 1.5, v * 5, 4);
    const grain = 0.5 + 0.5 * Math.sin((v * 40 + warp * 4) * Math.PI);
    const plank = Math.floor(v * 5);
    const l = 0.55 + grain * 0.18 + noise2(u * 2, v * 140) * 0.05 + (plank % 2) * 0.05 + fbm2(u * 6 + plank, v * 3, 3) * 0.12;
    const i = (y * W + x) * 4;
    const seam = Math.abs(v * 5 - Math.round(v * 5)) < 0.006 ? 0.35 : 1;
    d[i] = 112 * l * seam; d[i + 1] = 70 * l * seam; d[i + 2] = 40 * l * seam; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // ink spots and rings, wax
  const r = rng(3);
  for (let i = 0; i < 16; i++) { g.fillStyle = `rgba(20,10,5,${0.1 + r() * 0.2})`; g.beginPath(); g.arc(r() * W, r() * H, 1 + r() * 4, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(30,15,8,0.18)'; g.lineWidth = 3; g.beginPath(); g.arc(W * 0.18, H * 0.3, 26, 0, 7); g.stroke();
  return c;
}
function plasterCanvas() {
  const S = 512, c = mkCanvas(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm2(x / S * 4, y / S * 4, 5) * 0.12 + noise2(x * 0.2, y * 0.2) * 0.02, i = (y * S + x) * 4;
    d[i] = 190 * (1 + n); d[i + 1] = 160 * (1 + n); d[i + 2] = 120 * (1 + n); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function buildStudy({ lite = false, domeInk = null } = {}) {
  const root = new THREE.Group();
  const r = rng(1489);
  const dc = deskCanvas();
  const deskTex = toTexture(dc, { repeat: true }); deskTex.repeat.set(1, 1);
  const deskN = normalFromHeight(dc, 1.6); 
  const deskMat = new THREE.MeshStandardMaterial({ map: deskTex, normalMap: deskN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.5, metalness: 0 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.0), deskMat);
  desk.position.set(0.35, -0.025, -0.08); desk.receiveShadow = true; root.add(desk);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.035, 0.03), deskMat); edge.position.set(0.35, -0.035, 0.43); edge.receiveShadow = true; root.add(edge);
  // the wall behind and a shelf of books (soft in the depth of field)
  const wallTex = toTexture(plasterCanvas(), { repeat: true }); wallTex.repeat.set(3, 1.5);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, metalness: 0, color: '#7a6450' }));
  wall.position.set(0.35, 0.6, -0.62); wall.receiveShadow = true; root.add(wall);
  {
    const shelf = [at(new THREE.BoxGeometry(1.4, 0.025, 0.2), -0.1, 0.42, -0.52)];
    const books = [];
    let x = -0.75;
    while (x < 0.5) {
      const w = 0.03 + r() * 0.04, h = 0.18 + r() * 0.1;
      books.push(at(new THREE.BoxGeometry(w, h, 0.15 + r() * 0.03), x + w / 2, 0.432 + h / 2, -0.52, 0, 0, (r() < 0.12 ? 0.18 : 0)));
      x += w + 0.004;
    }
    const sh = new THREE.Mesh(mergeParts(shelf), deskMat); sh.receiveShadow = true; root.add(sh);
    const leather = new THREE.MeshStandardMaterial({ color: '#5c2e1a', roughness: 0.62, metalness: 0 });
    const bm = new THREE.Mesh(mergeParts(books), leather); root.add(bm);
  }
  // the notebook: leather cover, page block, two pages curving into the gutter
  const pageTex = pageTexture();
  const pageMat = new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.9, metalness: 0, color: '#fff6e6' });
  // the binding: dark calf, blind-tooled double fillet border and a lozenge, scuffed corners
  const leatherC = mkCanvas(512, 352), lg = leatherC.getContext('2d'), lh = mkCanvas(512, 352), lhg = lh.getContext('2d');
  {
    const r2 = rng(77), img = lg.createImageData(512, 352), d = img.data, him = lhg.createImageData(512, 352), hd = him.data;
    for (let y = 0; y < 352; y++) for (let x = 0; x < 512; x++) {
      const n = fbm2(x / 60, y / 60, 4) * 0.12 + noise2(x * 0.9, y * 0.9) * 0.04, i = (y * 512 + x) * 4;
      const edge = Math.min(x, y, 511 - x, 351 - y), scuff = Math.max(0, 1 - edge / 26) * (0.5 + noise2(x * 0.2, y * 0.2) * 0.5);
      const l = 0.85 + n + scuff * 0.35;
      d[i] = 82 * l; d[i + 1] = 44 * l; d[i + 2] = 26 * l; d[i + 3] = 255;
      hd[i] = hd[i + 1] = hd[i + 2] = (0.6 + n * 1.5) * 255; hd[i + 3] = 255;
    }
    lg.putImageData(img, 0, 0); lhg.putImageData(him, 0, 0);
    for (const [ctx2, col] of [[lg, 'rgba(25,10,4,0.55)'], [lhg, 'rgba(0,0,0,0.9)']]) {
      ctx2.strokeStyle = col; ctx2.lineWidth = 3;
      ctx2.strokeRect(22, 22, 468, 308); ctx2.strokeRect(32, 32, 448, 288);
      ctx2.beginPath(); ctx2.moveTo(256, 96); ctx2.lineTo(330, 176); ctx2.lineTo(256, 256); ctx2.lineTo(182, 176); ctx2.closePath(); ctx2.stroke();
      ctx2.beginPath(); ctx2.arc(256, 176, 22, 0, 7); ctx2.stroke();
    }
    for (let i = 0; i < 40; i++) { lg.strokeStyle = `rgba(150,100,70,${0.08 + r2() * 0.1})`; lg.lineWidth = 1; lg.beginPath(); const x = r2() * 512, y = r2() * 352; lg.moveTo(x, y); lg.lineTo(x + (r2() - 0.5) * 60, y + (r2() - 0.5) * 20); lg.stroke(); }
  }
  const coverMat = new THREE.MeshStandardMaterial({ map: toTexture(leatherC), normalMap: normalFromHeight(lh, 3, { repeat: false }), color: '#ffffff', roughness: 0.58, metalness: 0 });
  const blockMat = new THREE.MeshStandardMaterial({ color: '#d9c7a4', roughness: 0.9, metalness: 0 });
  {
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.006, 0.315), coverMat); cover.position.set(0, 0.003, 0); cover.castShadow = cover.receiveShadow = true; root.add(cover);
    for (const s of [1, -1]) {
      const blk = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.009, 0.29), blockMat); blk.position.set(s * 0.108, 0.0105, 0); blk.castShadow = blk.receiveShadow = true; root.add(blk);
      const g = new THREE.PlaneGeometry(PAGE.w, PAGE.h, 24, 1); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + s * (PAGE.w / 2 + 0.005), d = Math.abs(x); p.setX(i, x); p.setY(i, PAGE_Y - 0.007 * Math.exp(-d / 0.012)); }
      g.computeVertexNormals();
      const pm = new THREE.Mesh(g, pageMat); pm.receiveShadow = true; root.add(pm);
    }
    // loose sheets (and two more peeking out beneath them)
    for (const [k, x, z, ry] of [['orni', 0, 0, 0], ['car', 0, 0, 0], ['u1', 0.62, -0.06, 0.2], ['u2', 1.02, 0.05, -0.14]]) {
      const sp = SHEETS[k] ?? { x, z, ry, y: SHEET_Y - 0.0012 };
      const g = new THREE.PlaneGeometry(PAGE.w * 1.05, PAGE.h, 6, 1); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, sp.y + 0.0007 * Math.sin((p.getX(i) / PAGE.w + 0.5) * Math.PI));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, pageMat); m.position.set(sp.x, 0, sp.z); m.rotation.y = sp.ry; m.receiveShadow = true; root.add(m);
    }
  }
  // props: an inkwell with a quill, brass dividers, a stick of red chalk
  {
    const pewter = new THREE.MeshStandardMaterial({ color: '#6d6559', roughness: 0.35, metalness: 1 });
    const ink = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.035, 0], [0.038, 0.01], [0.036, 0.04], [0.02, 0.05], [0.014, 0.062], [0.016, 0.066], [0.011, 0.066], [0.009, 0.05], [0, 0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 20), pewter);
    ink.position.set(-0.33, 0, -0.17); ink.castShadow = ink.receiveShadow = true; root.add(ink);
    const quill = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0028, 0.26, 6), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.5 }));
    shaft.position.y = 0.13; quill.add(shaft);
    const vane = new THREE.Shape(); vane.moveTo(0, 0.07); vane.quadraticCurveTo(0.03, 0.14, 0.012, 0.27); vane.quadraticCurveTo(-0.006, 0.2, -0.01, 0.09); vane.lineTo(0, 0.07);
    const vg = new THREE.ShapeGeometry(vane, 8);
    const feather = new THREE.Mesh(vg, new THREE.MeshStandardMaterial({ color: '#f1ead8', roughness: 0.8, side: THREE.DoubleSide }));
    quill.add(feather);
    quill.position.set(-0.335, 0.05, -0.17); quill.rotation.set(-0.15, 0.4, 0.42);
    quill.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(quill);
    const brass = new THREE.MeshStandardMaterial({ color: '#b98d4c', roughness: 0.3, metalness: 1 });
    const div = new THREE.Mesh(mergeParts([beam(V(0, 0.004, 0), V(0.13, 0.004, 0.035), 0.005, 0.004), beam(V(0, 0.004, 0), V(0.13, 0.004, -0.01), 0.005, 0.004), at(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 12), 0, 0.005, 0)]), brass);
    div.position.set(0.6, 0, 0.19); div.rotation.y = 0.5; div.castShadow = true; root.add(div);
    const holder = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.047, 0.006], [0.012, 0.012], [0.01, 0.05], [0.022, 0.056], [0.022, 0.062], [0, 0.062]].map(([a, b]) => new THREE.Vector2(a, b)), 20), pewter);
    holder.position.set(1.12, 0, -0.26); holder.castShadow = true; root.add(holder);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.1, 12), new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.6, emissive: '#ffb060', emissiveIntensity: 0.15 }));
    wax.position.set(1.12, 0.112, -0.26); root.add(wax);
    root.userData.flameAt = V(1.12, 0.176, -0.26);
    const chalk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.008), new THREE.MeshStandardMaterial({ color: '#a8462a', roughness: 0.95 }));
    chalk.position.set(0.3, 0.004, 0.2); chalk.rotation.y = -0.6; chalk.castShadow = true; root.add(chalk);
  }

  // ---------------------------------------------------------------- the drawings and the models
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), normalMap: woodNormal(), normalScale: new THREE.Vector2(0.8, 0.8), color: '#f4d2a2', roughness: 0.52, metalness: 0 });
  const linen = new THREE.MeshStandardMaterial({ map: linenTexture(), normalMap: linenNormal(), normalScale: new THREE.Vector2(0.7, 0.7), color: '#f6ead0', roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  const rm = ropeMaps();
  const rope = new THREE.MeshStandardMaterial({ map: rm.map, normalMap: rm.normal, color: '#e6d2a8', roughness: 0.9, metalness: 0 });
  const leatherM = new THREE.MeshStandardMaterial({ color: '#5a3020', roughness: 0.6, metalness: 0 });
  const iron = new THREE.MeshStandardMaterial({ color: '#3a342e', roughness: 0.5, metalness: 1 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#b07a45', roughness: 0.35, metalness: 1 });
  const kinds = { wood, linen, iron, bronze, rope, leather: leatherM };
  const az = -0.62, el = 0.42;                                 // the drawing's view: from the front left, above
  const view = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  const xc = V().crossVectors(V(0, 1, 0), view).normalize(), yc = V().crossVectors(view, xc);
  const q0 = new THREE.Quaternion();
  // (q0 maps x_cam → +X, y_cam → −Z, view → +Y: the model seen along `view` lies on the page)
  {
    const M = new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 0, -1), V(0, 1, 0)).multiply(new THREE.Matrix4().makeBasis(xc, yc, view).transpose());
    q0.setFromRotationMatrix(M);
  }
  const yaw1 = -Math.atan2(view.x, view.z);
  const models = {};
  const defs = { screw: [screwModel(), 0.17], orni: [orniModel(), 0.2], car: [carModel(), 0.15] };
  for (const [key, [mdl, width]] of Object.entries(defs)) {
    const sp = SHEETS[key];
    const outer = new THREE.Group(), lift = new THREE.Group(), inner = new THREE.Group();
    outer.position.set(sp.x, sp.y + 0.0012, sp.z); outer.rotation.y = sp.ry;
    root.add(outer); outer.add(lift); lift.add(inner); inner.add(mdl.root);
    mdl.root.traverse((o) => o.updateMatrix());
    // solids (one mesh per part and material) and their drawing strokes
    const box = new THREE.Box3();
    const solids = [], strokeSegs = [], shaded = [];
    const mats = {};
    for (const part of mdl.parts) {
      const mat = (mats[part.mat] ??= kinds[part.mat].clone());
      mat.transparent = true; mat.opacity = 0;
      const mesh = new THREE.Mesh(mergeParts(part.meshes), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      part.obj.add(mesh); solids.push(mesh);
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox.clone().applyMatrix4(part.obj.matrix));
      if (part.draw === false) continue;
      const dr = drawingOf([{ geometry: mesh.geometry, matrix: new THREE.Matrix4() }], view, { creaseDeg: 35 });
      strokeSegs.push({ obj: part.obj, edges: dr.edges });
      // (parts are posed at rest when drawn: their local frame is the model's, offset by obj.position)
      for (const t of dr.shaded) shaded.push({ p: t.p.map((p) => p.clone().applyMatrix4(part.obj.matrix)), s: t.s });
    }
    const centre = box.getCenter(V()), size = box.getSize(V());
    // drawing-plane extent → scale so the drawing is `width` wide
    const proj = (p) => { const w = p.clone().sub(centre).applyQuaternion(q0); return [w.x, -w.z]; };
    let minX = 1e9, maxX = -1e9;
    for (const s of strokeSegs) for (const [a] of s.edges) { const [x] = proj(a.clone().applyMatrix4(s.obj.matrix)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const scale = width / (maxX - minX);
    // strokes: a firm sepia pass and a lighter, slightly offset chalk pass, revealed top → bottom
    const strokeObjs = [];
    const jr = rng(key.length * 31 + 7);
    for (const s of strokeSegs) {
      const order = s.edges.map(([a, b]) => { const m = a.clone().add(b).multiplyScalar(0.5).applyMatrix4(s.obj.matrix); const [, y] = proj(m); return Math.min(1, Math.max(0, 0.5 - y / (size.length() * 0.9) + (jr() - 0.5) * 0.18)); });
      const jit = 0.006 / scale * 0.15;
      const segA = s.edges.map(([a, b]) => [a.clone(), b.clone()]);
      const segB = s.edges.filter(() => jr() < 0.7).map(([a, b]) => { const o = V((jr() - 0.5) * jit, (jr() - 0.5) * jit, (jr() - 0.5) * jit); return [a.clone().add(o), b.clone().add(o).addScaledVector(b.clone().sub(a), (jr() - 0.3) * 0.08)]; });
      const ordB = segB.map(() => Math.min(1, jr() * 0.2 + 0.1));
      const A = orderedStrokes(segA, order, inkOpts(SEPIA, 0.92), 0.12);
      const off2 = V(0.0012, 0.0009, -0.0011).divideScalar(scale);
      const A2 = orderedStrokes(segA.map(([a, b]) => [a.clone().add(off2), b.clone().add(off2)]), order.map((o) => Math.min(1, o + 0.03)), inkOpts(SEPIA, 0.75), 0.12);
      A2.userData.op = 0.75; A2.renderOrder = 5; s.obj.add(A2); strokeObjs.push(A2);
      const B = orderedStrokes(segB, segB.map(([a, b], i) => { const m = a.clone().add(b).multiplyScalar(0.5).applyMatrix4(s.obj.matrix); const [, y] = proj(m); return Math.min(1, Math.max(0, 0.55 - y / (size.length() * 0.9) + ordB[i] - 0.15)); }), inkOpts(CHALK, 0.4), 0.15);
      A.renderOrder = B.renderOrder = 5; A.userData.op = 0.92; B.userData.op = 0.4; A.userData.lead = 1;
      s.obj.add(A, B);
      strokeObjs.push(A, B);
    }
    // hatching in the page plane (it doesn't lift: it fades as the model rises)
    const tris2 = shaded.map(({ p, s }) => ({ p: p.map((pp) => { const [x, y] = proj(pp); return [x * scale, y * scale]; }), s }));
    const hSegs = [...hatchTriangles(tris2, Math.PI / 4 + 0.05, 0.0032, 0.42), ...hatchTriangles(tris2, -Math.PI / 4, 0.0042, 0.22)];
    const hatch = orderedStrokes(hSegs.map(([a, b]) => [V(a.x, 0.0002, -a.y), V(b.x, 0.0002, -b.y)]), hSegs.map(([a]) => Math.min(1, Math.max(0, 0.5 - a.y / (width * 1.2) + (jr() - 0.5) * 0.3))), inkOpts(SEPIA, 0.5, { head: 0.02 }), 0.2);
    outer.add(hatch);
    // mirror script around the drawing
    const scrSegs = [], scrOrd = [];
    const blocks = key === 'screw' ? [[-0.085, 0.085, 0.128, 3], [-0.085, 0.03, -0.098, 3]] : key === 'orni' ? [[-0.09, 0.09, 0.13, 2], [-0.09, 0.09, -0.1, 3]] : [[-0.09, 0.07, 0.128, 3], [-0.03, 0.09, -0.095, 3]];
    blocks.forEach(([x0, x1, yT, n], bi) => { const sc = mirrorScript({ x0, x1, yTop: yT, lines: n, lineH: 0.0105, seed: key.length * 13 + bi }); sc.segs.forEach((s) => scrSegs.push([V(s[0].x, 0.0002, -s[0].y), V(s[1].x, 0.0002, -s[1].y)])); sc.ord.forEach((o) => scrOrd.push((bi + o) / blocks.length)); });
    const script = orderedStrokes(scrSegs, scrOrd, inkOpts('#4a2812', 0.75, { head: 0.004 }), 0.01);
    outer.add(script);
    mdl.root.position.copy(centre).negate();
    const hover = scale * size.y * 0.5 + 0.03;
    models[key] = { outer, lift, inner, model: mdl, solids, mats: Object.values(mats), strokes: strokeObjs, hatch, script, scale, centre, size, hover, yaw1 };
  }

  // ---------------------------------------------------------------- the dome sketch (left page) and its notes
  let domeStrokes = null, domeScript = null;
  if (domeInk) {
    const sp = SHEETS.dome;
    const g = new THREE.Group(); g.position.set(0, sp.y + 0.0006, 0); root.add(g);
    const segs = [], ord = [];
    for (const l of domeInk) for (let i = 0; i < l.pts.length - 1; i++) { segs.push([l.pts[i], l.pts[i + 1]]); ord.push(l.o + (i / (l.pts.length - 1)) * l.span); }
    domeStrokes = orderedStrokes(segs, ord, inkOpts(SEPIA, 0.9, { head: 0.004 }), 0.02);
    g.add(domeStrokes);
    const scs = [], sco = [];
    [[-0.205, -0.02, 0.122, 3], [-0.205, -0.07, -0.098, 4]].forEach(([x0, x1, yT, n], bi) => { const sc = mirrorScript({ x0, x1, yTop: yT, lines: n, lineH: 0.0105, seed: 91 + bi }); sc.segs.forEach((s) => scs.push([V(s[0].x, 0, -s[0].y), V(s[1].x, 0, -s[1].y)])); sc.ord.forEach((o) => sco.push((bi + o) / 2)); });
    domeScript = orderedStrokes(scs, sco, inkOpts('#4a2812', 0.75, { head: 0.004 }), 0.01);
    g.add(domeScript);
  }
  return { root, models, q0, view, domeStrokes, domeScript, pageMat };
}
