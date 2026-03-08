export function createGroupStructureOps(config) {
  const {
    state,
    getGroup,
    pushHistory,
    draw
  } = config || {};

  function setActiveGroupParent(pid) {
    const movingGroupId = Number(state.activeGroupId);
    const newParentId = (pid == null) ? null : Number(pid);
    if (!Number.isFinite(movingGroupId)) return;
    const moving = getGroup(state, movingGroupId);
    if (!moving) return;
    if (newParentId != null && newParentId === movingGroupId) return;

    // Prevent making a cycle: parent cannot be self or any descendant.
    if (newParentId != null) {
      const byId = new Map((state.groups || []).map(g => [Number(g.id), g]));
      let cur = byId.get(newParentId);
      while (cur) {
        if (Number(cur.id) === movingGroupId) return;
        if (cur.parentId == null) break;
        cur = byId.get(Number(cur.parentId));
      }
    }

    pushHistory(state);
    moving.parentId = (newParentId == null || !Number.isFinite(newParentId)) ? null : newParentId;
    draw();
  }

  function moveShapeToGroup(sid, gid) {
    const shapeId = Number(sid);
    const targetGroupId = Number(gid);
    if (!Number.isFinite(shapeId) || !Number.isFinite(targetGroupId)) return;
    const shape = (state.shapes || []).find(sh => Number(sh.id) === shapeId);
    const target = getGroup(state, targetGroupId);
    if (!shape || !target) return;

    pushHistory(state);

    // Remove from all groups first.
    for (const g of (state.groups || [])) {
      if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
      g.shapeIds = g.shapeIds.map(Number).filter(id => Number.isFinite(id) && id !== shapeId);
    }

    // Add to target group.
    if (!Array.isArray(target.shapeIds)) target.shapeIds = [];
    if (!target.shapeIds.map(Number).includes(shapeId)) target.shapeIds.push(shapeId);
    shape.groupId = targetGroupId;

    draw();
  }

  function moveShapesToGroup(shapeIds, gid) {
    const targetGroupId = Number(gid);
    const target = getGroup(state, targetGroupId);
    if (!target) return;
    const ids = Array.from(new Set((shapeIds || []).map(Number).filter(Number.isFinite)));
    if (!ids.length) return;
    const idSet = new Set(ids);
    const shapeById = new Map((state.shapes || []).map(sh => [Number(sh.id), sh]));
    const validIds = ids.filter((id) => shapeById.has(id));
    if (!validIds.length) return;
    const validSet = new Set(validIds);

    pushHistory(state);

    for (const g of (state.groups || [])) {
      if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
      g.shapeIds = g.shapeIds.map(Number).filter(id => Number.isFinite(id) && !validSet.has(id));
    }

    if (!Array.isArray(target.shapeIds)) target.shapeIds = [];
    const targetSet = new Set(target.shapeIds.map(Number).filter(Number.isFinite));
    for (const sid of validIds) {
      if (!targetSet.has(sid)) target.shapeIds.push(sid);
      const shape = shapeById.get(sid);
      if (shape) shape.groupId = targetGroupId;
    }

    draw();
  }

  return { setActiveGroupParent, moveShapeToGroup, moveShapesToGroup };
}
