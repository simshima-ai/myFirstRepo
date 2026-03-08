import { getGroup, setActiveGroup } from "./state.js";

export function collectDescendantGroupIds(state, rootGroupId) {
  const rootId = Number(rootGroupId);
  if (!Number.isFinite(rootId)) return [];
  const childrenByParent = new Map();
  for (const g of (state.groups || [])) {
    const pid = (g.parentId == null) ? null : Number(g.parentId);
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(Number(g.id));
  }
  const out = [];
  const seen = new Set();
  const walk = (gid) => {
    if (!Number.isFinite(gid) || seen.has(gid)) return;
    seen.add(gid);
    out.push(gid);
    for (const cid of (childrenByParent.get(gid) || [])) walk(Number(cid));
  };
  walk(rootId);
  return out;
}

export function collectGroupTreeShapeIds(state, rootGroupId) {
  const gids = collectDescendantGroupIds(state, rootGroupId);
  const gidSet = new Set(gids.map(Number));
  const ids = new Set();
  for (const g of (state.groups || [])) {
    if (!gidSet.has(Number(g.id))) continue;
    for (const sid of (g.shapeIds || [])) ids.add(Number(sid));
  }
  return Array.from(ids);
}

export function collectGroupTreeGroupSnapshots(state, rootGroupId) {
  const gids = new Set(collectDescendantGroupIds(state, rootGroupId).map(Number));
  const snaps = [];
  for (const g of (state.groups || [])) {
    if (!gids.has(Number(g.id))) continue;
    snaps.push({
      id: Number(g.id),
      originX: Number(g.originX) || 0,
      originY: Number(g.originY) || 0,
      rotationDeg: Number(g.rotationDeg) || 0,
    });
  }
  return snaps;
}

export function isHitInActiveGroup(state, shapeId) {
  if (state.activeGroupId == null) return false;
  const ids = new Set(collectGroupTreeShapeIds(state, state.activeGroupId).map(Number));
  return ids.has(Number(shapeId));
}

export function selectGroupById(state, groupId) {
  const g = getGroup(state, groupId);
  if (!g) return false;
  const activeLayerId = Number(state.activeLayerId);
  const lockByLayer = new Map((state.layers || []).map(l => [Number(l?.id), !!l?.locked]));
  const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
  const inGroup = collectGroupTreeShapeIds(state, g.id);
  for (const sid of inGroup) {
    const s = shapeById.get(Number(sid));
    if (!s) continue;
    const lid = Number(s.layerId ?? activeLayerId);
    if (lockByLayer.get(lid) === true) return false;
    if (state.ui?.layerView?.editOnlyActive && lid !== activeLayerId) return false;
  }
  setActiveGroup(state, g.id);
  state.selection.ids = [];
  state.selection.groupIds = [Number(g.id)];
  return true;
}

export function toggleGroupSelectionById(state, groupId) {
  const g = getGroup(state, groupId);
  if (!g) return false;
  const activeLayerId = Number(state.activeLayerId);
  const lockByLayer = new Map((state.layers || []).map(l => [Number(l?.id), !!l?.locked]));
  const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
  const inGroup = collectGroupTreeShapeIds(state, g.id);
  for (const sid of inGroup) {
    const s = shapeById.get(Number(sid));
    if (!s) continue;
    const lid = Number(s.layerId ?? activeLayerId);
    if (lockByLayer.get(lid) === true) return false;
    if (state.ui?.layerView?.editOnlyActive && lid !== activeLayerId) return false;
  }
  const gid = Number(g.id);
  const current = Array.isArray(state.selection?.groupIds)
    ? state.selection.groupIds.map(Number).filter(Number.isFinite)
    : [];
  const exists = current.includes(gid);
  const nextGroupIds = exists ? current.filter((id) => id !== gid) : current.concat([gid]);
  state.selection.groupIds = Array.from(new Set(nextGroupIds.map(Number)));
  if (!state.selection.groupIds.length) {
    state.selection.ids = [];
    state.activeGroupId = null;
    return true;
  }
  state.selection.ids = [];
  if (exists) {
    if (!state.selection.groupIds.includes(Number(state.activeGroupId))) {
      state.activeGroupId = Number(state.selection.groupIds[state.selection.groupIds.length - 1]);
    }
  } else {
    state.activeGroupId = gid;
  }
  return true;
}
