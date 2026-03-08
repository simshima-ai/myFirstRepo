import { normalizeAimConstraint } from "./app_aim_utils.js";

const SHIFT_KEYS_X = new Set(["x", "x1", "x2", "cx", "px", "tx", "originX"]);
const SHIFT_KEYS_Y = new Set(["y", "y1", "y2", "cy", "py", "ty", "originY"]);

function shiftShapeDeep(node, dx, dy) {
  if (!node || (!dx && !dy)) return;
  if (Array.isArray(node)) {
    for (const item of node) shiftShapeDeep(item, dx, dy);
    return;
  }
  if (typeof node !== "object") return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (SHIFT_KEYS_X.has(k)) node[k] = v + Number(dx || 0);
      else if (SHIFT_KEYS_Y.has(k)) node[k] = v + Number(dy || 0);
      continue;
    }
    if (v && typeof v === "object") shiftShapeDeep(v, dx, dy);
  }
}

function remapShapeRefsDeep(node, shapeIdMap, groupIdMap = null) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) remapShapeRefsDeep(item, shapeIdMap, groupIdMap);
    return;
  }
  if (typeof node !== "object") return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (k.endsWith("ShapeId") || k === "shapeId" || k === "sourceShapeId") {
        const mappedShape = shapeIdMap.get(Number(v));
        if (Number.isFinite(Number(mappedShape))) {
          node[k] = Number(mappedShape);
        }
      }
      if (groupIdMap && (k.endsWith("GroupId") || k === "groupId" || k === "targetGroupId")) {
        const mappedGroup = groupIdMap.get(Number(v));
        if (Number.isFinite(Number(mappedGroup))) node[k] = Number(mappedGroup);
      }
      continue;
    }
    if (v && typeof v === "object") remapShapeRefsDeep(v, shapeIdMap, groupIdMap);
  }
}

function collectGroupSubtreeIds(groups, rootId) {
  const byParent = new Map();
  for (const g of (groups || [])) {
    const pid = (g?.parentId == null) ? null : Number(g.parentId);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(Number(g.id));
  }
  const out = [];
  const q = [Number(rootId)];
  const seen = new Set();
  while (q.length) {
    const gid = Number(q.shift());
    if (!Number.isFinite(gid) || seen.has(gid)) continue;
    seen.add(gid);
    out.push(gid);
    const ch = byParent.get(gid) || [];
    for (const c of ch) q.push(Number(c));
  }
  return out;
}

export function filterRootGroupIds(groupIds, groups) {
  const selected = new Set((groupIds || []).map(Number).filter(Number.isFinite));
  if (!selected.size) return [];
  const parentMap = new Map();
  for (const g of (groups || [])) parentMap.set(Number(g.id), (g.parentId == null ? null : Number(g.parentId)));
  const out = [];
  for (const gid of selected) {
    let p = parentMap.get(gid);
    let hasSelectedAncestor = false;
    while (p != null) {
      if (selected.has(Number(p))) { hasSelectedAncestor = true; break; }
      p = parentMap.get(Number(p));
    }
    if (!hasSelectedAncestor) out.push(Number(gid));
  }
  return out;
}

function normalizeLayerIdForClone(state, sourceLayerId) {
  const layers = state.layers || [];
  const src = Number(sourceLayerId);
  if (Number.isFinite(src) && layers.some(l => Number(l.id) === src)) return src;
  const active = Number(state.activeLayerId);
  if (Number.isFinite(active) && layers.some(l => Number(l.id) === active)) return active;
  const first = Number(layers[0]?.id);
  return Number.isFinite(first) ? first : 1;
}

function makeCopiedGroupName(baseName, usedNameKeys) {
  const base = String(baseName || "").trim() || "Group";
  const lower = base.toLowerCase();
  if (!usedNameKeys.has(lower)) {
    usedNameKeys.add(lower);
    return base;
  }
  let i = 2;
  while (i < 10000) {
    const cand = `${base} (${i})`;
    const key = cand.toLowerCase();
    if (!usedNameKeys.has(key)) {
      usedNameKeys.add(key);
      return cand;
    }
    i += 1;
  }
  const fallback = `${base} (${Date.now()})`;
  usedNameKeys.add(fallback.toLowerCase());
  return fallback;
}

export function duplicateGroupsByRootIds(state, nextShapeIdFn, rootGroupIds, dx, dy) {
  const groups = state.groups || [];
  const byId = new Map(groups.map(g => [Number(g.id), g]));
  const validRoots = (rootGroupIds || []).map(Number).filter(id => Number.isFinite(id) && byId.has(id));
  if (!validRoots.length) return { newShapeIds: [], newRootGroupIds: [] };

  const subtreeIds = [];
  const seen = new Set();
  for (const rootId of validRoots) {
    const ids = collectGroupSubtreeIds(groups, rootId);
    for (const id of ids) if (!seen.has(id)) { seen.add(id); subtreeIds.push(id); }
  }
  const groupIdMap = new Map();
  for (const oldGid of subtreeIds) groupIdMap.set(oldGid, Number(state.nextGroupId++));

  const shapeIdMap = new Map();
  const clonedShapes = [];
  for (const oldGid of subtreeIds) {
    const oldG = byId.get(oldGid);
    if (!oldG) continue;
    for (const sid of (oldG.shapeIds || [])) {
      if (!Number.isFinite(sid) || shapeIdMap.has(sid)) continue;
      const srcShape = (state.shapes || []).find(s => Number(s.id) === sid);
      if (!srcShape) continue;
      const newSid = nextShapeIdFn(state);
      shapeIdMap.set(sid, newSid);
      const clone = JSON.parse(JSON.stringify(srcShape));
      clone.id = newSid;
      clone.groupId = groupIdMap.get(oldGid);
      clone.layerId = normalizeLayerIdForClone(state, srcShape.layerId);
      shiftShapeDeep(clone, dx, dy);
      clonedShapes.push(clone);
    }
  }
  for (const s of clonedShapes) remapShapeRefsDeep(s, shapeIdMap, groupIdMap);
  if (clonedShapes.length) state.shapes.push(...clonedShapes);

  const newGroups = [];
  const usedNameKeys = new Set((state.groups || []).map(g => String(g?.name || "").trim().toLowerCase()).filter(Boolean));
  for (const oldGid of subtreeIds) {
    const oldG = byId.get(oldGid);
    if (!oldG) continue;
    const mappedId = groupIdMap.get(oldGid);
    const mappedParent = (oldG.parentId == null)
      ? oldG.parentId
      : (groupIdMap.get(Number(oldG.parentId)) ?? oldG.parentId);
    const newShapeIds = (Array.isArray(oldG.shapeIds) ? oldG.shapeIds : [])
      .map(id => shapeIdMap.get(Number(id)))
      .filter(id => Number.isFinite(Number(id)));
    const mappedAim = normalizeAimConstraint(oldG.aimConstraint);
    if (mappedAim.targetType === "group" && Number.isFinite(mappedAim.targetId) && groupIdMap.has(Number(mappedAim.targetId))) {
      mappedAim.targetId = Number(groupIdMap.get(Number(mappedAim.targetId)));
    }
    newGroups.push({
      ...JSON.parse(JSON.stringify(oldG)),
      id: mappedId,
      name: makeCopiedGroupName(oldG?.name, usedNameKeys),
      parentId: mappedParent,
      shapeIds: newShapeIds,
      originX: Number(oldG.originX || 0) + Number(dx || 0),
      originY: Number(oldG.originY || 0) + Number(dy || 0),
      aimConstraint: mappedAim,
    });
  }
  if (newGroups.length) state.groups = [...newGroups, ...state.groups];

  const newRootGroupIds = validRoots
    .map((id) => Number(groupIdMap.get(Number(id))))
    .filter(Number.isFinite);
  const newShapeIds = clonedShapes.map(s => Number(s.id));
  return { newShapeIds, newRootGroupIds };
}

export function duplicateShapesByIds(state, nextShapeIdFn, shapeIds, dx, dy) {
  const srcIds = new Set((shapeIds || []).map(Number).filter(Number.isFinite));
  if (!srcIds.size) return { newShapeIds: [] };
  const src = (state.shapes || []).filter(s => srcIds.has(Number(s.id)));
  if (!src.length) return { newShapeIds: [] };

  const shapeIdMap = new Map();
  const copiedIds = [];
  const groupedNewIds = new Map();
  const clones = [];
  for (const s of src) {
    const n = JSON.parse(JSON.stringify(s));
    const oldId = Number(n.id);
    n.id = nextShapeIdFn(state);
    n.layerId = normalizeLayerIdForClone(state, s.layerId);
    shapeIdMap.set(oldId, Number(n.id));
    shiftShapeDeep(n, dx, dy);
    clones.push(n);
    copiedIds.push(Number(n.id));
    if (n.groupId != null) {
      const gid = Number(n.groupId);
      if (!groupedNewIds.has(gid)) groupedNewIds.set(gid, []);
      groupedNewIds.get(gid).push(Number(n.id));
    }
  }
  for (const s of clones) remapShapeRefsDeep(s, shapeIdMap, null);
  state.shapes.push(...clones);

  for (const [gid, ids] of groupedNewIds.entries()) {
    const g = (state.groups || []).find(gr => Number(gr.id) === gid);
    if (!g) continue;
    if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
    for (const id of ids) {
      if (!g.shapeIds.includes(id)) g.shapeIds.push(id);
    }
  }
  return { newShapeIds: copiedIds };
}
