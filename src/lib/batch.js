// Static batching (load time): small fixed parts that share a material — rivets, panels, struts,
// bolts, ribs — are merged into one mesh per (parent group, material, shadow flags), so a detailed
// model costs a handful of draw calls instead of hundreds (twice that again when it casts shadows).
//
// Only parts that provably never change are merged: the sequence is sampled across its whole span and
// a part qualifies only if its local transform, visibility and material stay the same at every sample.
// Conservative by construction — left alone: anything big (floors, hulls: scenes may touch those),
// instanced / skinned / morphing meshes, multi-material and see-through meshes (those sort back to
// front per object), custom shaders and patched materials (they may read object-space positions),
// parts with userData, render hooks or a draw range, and parts on other layers. The merged mesh
// replaces the parts under the same parent, so the group still moves as one.
// Opt out per sequence with `inst.batch = false`, per material with `material.userData.noBatch`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const MAX_VERTS = 4000;   // per part
const MIN_PARTS = 2;      // per batch
const OBR = THREE.Object3D.prototype.onBeforeRender, OAR = THREE.Object3D.prototype.onAfterRender;
const MAT_OBC = THREE.Material.prototype.onBeforeCompile;

// why a mesh can't be merged ('' when it can)
function reject(o) {
  if (!o.isMesh) return 'notMesh';
  if (o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences) return 'special';
  if (o.children.length) return 'children';
  const m = o.material, g = o.geometry;
  if (!m) return 'material';
  // (a multi-material mesh splits into one part per material group: every material must qualify)
  if (Array.isArray(m) && (!g?.groups?.length || !m.length)) return 'multiMaterial';
  for (const mm of [m].flat()) {
    if (!mm) return 'material';
    if (mm.isShaderMaterial) return 'shader';
    if (mm.transparent) return 'transparent';   // see-through parts sort back to front per object
    if (mm.userData?.noBatch || mm.onBeforeCompile !== MAT_OBC) return 'patched';
  }
  if (!g?.isBufferGeometry || g.isInstancedBufferGeometry || !g.attributes.position || !g.attributes.normal) return 'geometry';
  if (g.attributes.sdPos) return 'merged';
  if (g.attributes.position.count > MAX_VERTS) return 'big';
  // (index groups only matter with several materials; a draw range is how reveals animate)
  if (g.morphAttributes.position) return 'morph';
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return 'drawRange';
  if (!o.visible) return 'hidden';
  if (o.onBeforeRender !== OBR || o.onAfterRender !== OAR) return 'hook';
  if (o.layers.mask !== 1) return 'layers';
  if (Object.keys(o.userData).length) return 'userData';
  return '';
}

// attribute layout: parts merge only with parts of the same layout
function signature(g) {
  const a = Object.keys(g.attributes).sort().map((k) => { const at = g.attributes[k]; return `${k}:${at.itemSize}:${at.normalized}:${at.array.constructor.name}`; });
  return `${a.join(',')}|${g.index ? 'i' : 'n'}`;
}

const localMatrix = (o) => { if (o.matrixAutoUpdate) o.updateMatrix(); return o.matrix; };

// a mirrored part (negative determinant) has its winding reversed once baked: flip it back
function flipWinding(g) {
  if (g.index) {
    const ix = g.index.array;
    for (let i = 0; i + 2 < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
  } else {
    for (const at of Object.values(g.attributes)) {
      const s = at.itemSize, arr = at.array, tmp = new arr.constructor(s);
      for (let v = 0; v + 2 < at.count; v += 3) {
        const a = (v + 1) * s, b = (v + 2) * s;
        tmp.set(arr.subarray(a, a + s)); arr.copyWithin(a, b, b + s); arr.set(tmp, b);
      }
      at.needsUpdate = true;
    }
  }
}

// one material group of a multi-material geometry, compacted to the vertices it uses
function subGeometry(g, grp) {
  const out = new THREE.BufferGeometry();
  const total = g.index ? g.index.count : g.attributes.position.count;
  const start = grp.start, end = Math.min(total, grp.start + grp.count);
  if (end <= start) return null;
  if (!g.index) {
    for (const [k, at] of Object.entries(g.attributes)) out.setAttribute(k, new THREE.BufferAttribute(at.array.slice(start * at.itemSize, end * at.itemSize), at.itemSize, at.normalized));
    return out;
  }
  const src = g.index.array, remap = new Map(), used = [];
  const idx = new Uint32Array(end - start);
  for (let i = start; i < end; i++) {
    let v = remap.get(src[i]);
    if (v === undefined) { v = used.length; remap.set(src[i], v); used.push(src[i]); }
    idx[i - start] = v;
  }
  for (const [k, at] of Object.entries(g.attributes)) {
    const n = at.itemSize, arr = new at.array.constructor(used.length * n);
    used.forEach((u, j) => { for (let c = 0; c < n; c++) arr[j * n + c] = at.array[u * n + c]; });
    out.setAttribute(k, new THREE.BufferAttribute(arr, n, at.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/**
 * Merge the static small parts of `scene`. `sample(i, n)` poses the sequence at its i-th of n sample
 * times (the caller runs the sequence's update). Returns { parts, batches } merged.
 */
export function batchStatic(scene, sample, n = 12) {
  const cands = [], why = {};
  scene.traverse((o) => { if (!o.isMesh) return; const r = reject(o); if (r) why[r] = (why[r] ?? 0) + 1; else cands.push(o); });
  if (cands.length < MIN_PARTS) return { parts: 0, batches: 0, why };
  const ver = (g) => Object.values(g.attributes).reduce((a, at) => a + at.version, 0) + (g.index?.version ?? 0);
  const rec = new Map(cands.map((o) => [o, { m: localMatrix(o).clone(), mat: o.material, parent: o.parent, geo: o.geometry, v: ver(o.geometry) }]));
  const stable = new Set(cands);
  for (let i = 0; i < n; i++) {
    sample(i, n);
    for (const o of stable) {
      const r = rec.get(o);
      const g = o.geometry;
      if (!o.visible || o.material !== r.mat || o.parent !== r.parent || g !== r.geo || !localMatrix(o).equals(r.m)
        || ver(g) !== r.v || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) stable.delete(o);
    }
  }
  // parts: a single-material mesh whole, or one material group of a multi-material mesh
  const partsOf = (o) => {
    if (!Array.isArray(o.material)) return [{ o, mat: o.material, geo: o.geometry }];
    return o.geometry.groups.map((grp) => ({ o, mat: o.material[grp.materialIndex], geo: subGeometry(o.geometry, grp) })).filter((p) => p.mat && p.geo);
  };
  const groups = new Map(), owners = new Map();   // owners: mesh → parts not yet emitted
  for (const o of stable) {
    const ps = partsOf(o);
    owners.set(o, ps.length);
    for (const p of ps) {
      const k = `${o.parent.uuid}|${p.mat.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${o.frustumCulled}|${signature(p.geo)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
  }
  let parts = 0, batches = 0;
  why.moving = cands.length - stable.size;
  for (const list of groups.values()) {
    // a lone single-material part stays as it is; a lone slice of a multi-material mesh is emitted
    // on its own (same cost as before) so the mesh it came from can go
    if (list.length < MIN_PARTS && !list.some((p) => Array.isArray(p.o.material))) { why.fewAlike = (why.fewAlike ?? 0) + list.length; continue; }
    const geos = list.map(({ o, geo }) => {
      const g = geo === o.geometry ? geo.clone() : geo, m = rec.get(o).m, det = m.determinant();
      // surface detail (lib/surface.js) keeps each part's own pattern: its object-space position at
      // its scale relative to the group, and its object-space normal
      const k = Math.cbrt(Math.abs(det)) || 1, p = g.attributes.position, nr = g.attributes.normal;
      const sp = new Float32Array(p.count * 3), sn = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        sp[i * 3] = p.getX(i) * k; sp[i * 3 + 1] = p.getY(i) * k; sp[i * 3 + 2] = p.getZ(i) * k;
        sn[i * 3] = nr.getX(i); sn[i * 3 + 1] = nr.getY(i); sn[i * 3 + 2] = nr.getZ(i);
      }
      g.setAttribute('sdPos', new THREE.BufferAttribute(sp, 3));
      g.setAttribute('sdNrm', new THREE.BufferAttribute(sn, 3));
      g.applyMatrix4(m);   // (position, normal, tangent only: the sd* attributes stay in part space)
      if (det < 0) flipWinding(g);
      return g;
    });
    const multi = list.some((p) => Array.isArray(p.o.material));
    let merged = null;
    try { merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); } catch { merged = null; }
    if (merged && geos.length > 1) geos.forEach((g) => g.dispose());
    if (!merged && !multi) { geos.forEach((g) => g.dispose()); continue; }   // the parts stay as they are
    // (a multi-material mesh is always fully replaced: if its slices can't merge, each goes alone)
    const out = merged ? [[merged, list]] : geos.map((g, i) => [g, [list[i]]]);
    for (const [geo, members] of out) {
      const { o: first, mat } = members[0], parent = first.parent;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'batch';
      mesh.userData.batch = true;   // (size-based passes, e.g. lib/antitile.js, judge the parts, not the merge)
      mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
      mesh.renderOrder = first.renderOrder; mesh.frustumCulled = first.frustumCulled;
      parent.add(mesh);
      for (const { o } of members) owners.set(o, owners.get(o) - 1);
    }
    if (merged && list.length > 1) { parts += list.length; batches++; }
  }
  // each mesh goes once all its parts live in the new meshes
  for (const [o, left] of owners) if (left === 0 && o.parent) o.parent.remove(o);
  return { parts, batches, why };
}
