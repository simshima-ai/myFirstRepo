export function resolveAimCandidateFromSelection(state, ownerGroupId) {
  const owner = Number(ownerGroupId);
  if (!Number.isFinite(owner)) return { type: null, id: null };
  const selectedGroupIds = Array.isArray(state.selection?.groupIds)
    ? state.selection.groupIds.map(Number).filter(Number.isFinite)
    : [];
  for (let i = selectedGroupIds.length - 1; i >= 0; i--) {
    const gid = Number(selectedGroupIds[i]);
    if (gid !== owner) return { type: "group", id: gid };
  }
  const selectedShapeIds = Array.isArray(state.selection?.ids)
    ? state.selection.ids.map(Number).filter(Number.isFinite)
    : [];
  const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
  const shapeToGroup = new Map();
  for (const g of (state.groups || [])) {
    const gid = Number(g?.id);
    if (!Number.isFinite(gid)) continue;
    for (const sid of (g?.shapeIds || [])) {
      const sidNum = Number(sid);
      if (!Number.isFinite(sidNum)) continue;
      shapeToGroup.set(sidNum, gid);
    }
  }
  for (let i = selectedShapeIds.length - 1; i >= 0; i--) {
    const sid = Number(selectedShapeIds[i]);
    const sh = shapeById.get(sid);
    if (!sh) continue;
    if (String(sh.type || "") === "position") return { type: "position", id: sid };
    const gidFromMap = Number(shapeToGroup.get(sid));
    const gid = Number.isFinite(gidFromMap) ? gidFromMap : Number(sh.groupId);
    if (Number.isFinite(gid) && gid !== owner) return { type: "group", id: gid };
  }
  return { type: null, id: null };
}

export function syncAimCandidateFromSelection(state, getGroupFn) {
  const pick = state.input?.groupAimPick;
  if (!pick?.active) return;
  const ownerGroupId = Number(pick.groupId);
  if (!Number.isFinite(ownerGroupId)) return;
  const ownerGroup = getGroupFn(state, ownerGroupId);
  if (!ownerGroup) {
    pick.active = false;
    pick.groupId = null;
    pick.candidateType = null;
    pick.candidateId = null;
    return;
  }
  const cand = resolveAimCandidateFromSelection(state, ownerGroupId);
  pick.candidateType = cand.type;
  pick.candidateId = Number.isFinite(Number(cand.id)) ? Number(cand.id) : null;
}

export function resolveGroupAimConstraints(state, deps) {
  const {
    normalizeAimConstraint,
    normalizeDeltaDeg,
    collectDescendantGroupIds,
    rotatePointAroundDeg,
    rotateShapeAroundForAim
  } = deps;
  const groups = Array.isArray(state.groups) ? state.groups : [];
  if (!groups.length) return;
  const byId = new Map(groups.map((g) => [Number(g.id), g]));
  const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
  for (const g of groups) {
    if (!g) continue;
    const aim = normalizeAimConstraint(g.aimConstraint);
    g.aimConstraint = aim;
    if (!aim.enabled || !aim.targetType || !Number.isFinite(aim.targetId)) continue;
    let tx = NaN;
    let ty = NaN;
    if (aim.targetType === "group") {
      const targetGroup = byId.get(Number(aim.targetId));
      if (!targetGroup || Number(targetGroup.id) === Number(g.id)) continue;
      tx = Number(targetGroup.originX);
      ty = Number(targetGroup.originY);
    } else if (aim.targetType === "position") {
      const targetShape = shapeById.get(Number(aim.targetId));
      if (!targetShape || String(targetShape.type || "") !== "position") continue;
      tx = Number(targetShape.x);
      ty = Number(targetShape.y);
    }
    const ox = Number(g.originX);
    const oy = Number(g.originY);
    if (![ox, oy, tx, ty].every(Number.isFinite)) continue;
    const dx = tx - ox;
    const dy = ty - oy;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const targetDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const currentDeg = Number(g.rotationDeg) || 0;
    const delta = normalizeDeltaDeg(targetDeg - currentDeg);
    if (Math.abs(delta) < 1e-7) {
      g.rotationDeg = targetDeg;
      continue;
    }
    const rotatingByHandle = !!(state.input?.groupRotate?.active)
      && Number(state.input?.groupRotate?.groupId) === Number(g.id);
    if (rotatingByHandle) continue;
    const subGroupIds = collectDescendantGroupIds(state, Number(g.id)).map(Number).filter(Number.isFinite);
    if (!subGroupIds.length) continue;
    const subSet = new Set(subGroupIds);
    for (const gg of groups) {
      const gid = Number(gg?.id);
      if (!subSet.has(gid)) continue;
      if (gid !== Number(g.id)) {
        const rp = rotatePointAroundDeg(Number(gg.originX), Number(gg.originY), ox, oy, delta);
        gg.originX = rp.x;
        gg.originY = rp.y;
      }
      gg.rotationDeg = (Number(gg.rotationDeg) || 0) + delta;
    }
    g.rotationDeg = targetDeg;
    for (const gg of groups) {
      if (!subSet.has(Number(gg?.id))) continue;
      for (const sidRaw of (gg?.shapeIds || [])) {
        const sh = shapeById.get(Number(sidRaw));
        if (!sh) continue;
        rotateShapeAroundForAim(sh, ox, oy, delta);
      }
    }
  }
}
