export function createSelectionVisibilityOps(config) {
  const {
    state,
    filterRootGroupIds,
    collectDescendantGroupIds,
    collectGroupTreeShapeIds,
    removeShapeById,
    normalizeAimConstraint,
    getGroup,
    setSelection,
    pushHistory,
    setStatus,
    draw
  } = config || {};

  function deleteSelection() {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const selectedGroupIds = new Set((state.selection?.groupIds || []).map(Number).filter(Number.isFinite));
    if (selectedGroupIds.size === 0 && Number.isFinite(Number(state.activeGroupId))) {
      selectedGroupIds.add(Number(state.activeGroupId));
    }
    const rootGroupIds = filterRootGroupIds(Array.from(selectedGroupIds), state.groups || []);
    const deleteGroupIds = new Set();
    for (const gid of rootGroupIds) {
      for (const dgid of collectDescendantGroupIds(state, gid)) {
        if (Number.isFinite(Number(dgid))) deleteGroupIds.add(Number(dgid));
      }
      for (const sid of collectGroupTreeShapeIds(state, gid)) {
        if (Number.isFinite(Number(sid))) selectedShapeIds.add(Number(sid));
      }
    }
    if (selectedShapeIds.size === 0 && deleteGroupIds.size === 0) return;
    pushHistory(state);
    for (const sid of selectedShapeIds) removeShapeById(state, sid);
    if (deleteGroupIds.size > 0) {
      state.groups = (state.groups || []).filter(g => !deleteGroupIds.has(Number(g.id)));
    }
    const alivePositionIds = new Set((state.shapes || [])
      .filter((s) => String(s?.type || "") === "position")
      .map((s) => Number(s.id))
      .filter(Number.isFinite));
    const aliveGroupIds = new Set((state.groups || []).map((g) => Number(g.id)).filter(Number.isFinite));
    for (const g of (state.groups || [])) {
      const aim = normalizeAimConstraint(g.aimConstraint);
      const invalidGroupTarget = aim.targetType === "group" && !aliveGroupIds.has(Number(aim.targetId));
      const invalidPositionTarget = aim.targetType === "position" && !alivePositionIds.has(Number(aim.targetId));
      if (invalidGroupTarget || invalidPositionTarget) {
        g.aimConstraint = { enabled: false, targetType: null, targetId: null };
      }
    }
    state.selection.ids = [];
    state.selection.groupIds = [];
    state.activeGroupId = null;
    setStatus("Deleted selection");
    draw();
  }

  function setGroupVisible(groupId, on) {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const nextVisible = !!on;
    if ((g.visible !== false) === nextVisible) return;
    pushHistory(state);
    g.visible = nextVisible;
    if (!nextVisible) {
      const hiddenGroupIds = new Set(collectDescendantGroupIds(state, gid).map(Number));
      const shapeGroupMap = new Map();
      for (const gg of (state.groups || [])) {
        const ggid = Number(gg?.id);
        if (!Number.isFinite(ggid)) continue;
        for (const sid of (gg?.shapeIds || [])) {
          const sidNum = Number(sid);
          if (!Number.isFinite(sidNum)) continue;
          shapeGroupMap.set(sidNum, ggid);
        }
      }
      state.selection.groupIds = (state.selection?.groupIds || [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && !hiddenGroupIds.has(id));
      state.selection.ids = (state.selection?.ids || [])
        .map(Number)
        .filter((sid) => {
          if (!Number.isFinite(sid)) return false;
          const sh = (state.shapes || []).find((s) => Number(s.id) === sid);
          if (!sh) return false;
          const sgidFromMap = shapeGroupMap.has(sid) ? Number(shapeGroupMap.get(sid)) : NaN;
          const sgid = Number.isFinite(sgidFromMap) ? sgidFromMap : Number(sh.groupId);
          return !(Number.isFinite(sgid) && hiddenGroupIds.has(sgid));
        });
      if (hiddenGroupIds.has(Number(state.activeGroupId))) {
        state.activeGroupId = null;
      }
    }
    draw();
  }

  function toggleShapeSelectionById(id) {
    const sid = Number(id);
    if (!Number.isFinite(sid)) return;
    const cur = new Set((state.selection?.ids || []).map(Number));
    if (cur.has(sid)) cur.delete(sid);
    else cur.add(sid);
    setSelection(state, Array.from(cur));
    state.activeGroupId = null;
    draw();
  }

  return {
    deleteSelection,
    setGroupVisible,
    toggleShapeSelectionById
  };
}
