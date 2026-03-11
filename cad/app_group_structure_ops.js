export function createGroupStructureOps(config) {
  const {
    state,
    getGroup,
    collectGroupTreeShapeIds,
    pushHistory,
    draw
  } = config || {};

  function scalePointAround(x, y, ox, oy, factor) {
    return {
      x: ox + (Number(x) - ox) * factor,
      y: oy + (Number(y) - oy) * factor,
    };
  }

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

  function setActiveGroupScaleOptions(options = {}) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const prev = g.scaleOptions && typeof g.scaleOptions === "object"
      ? g.scaleOptions
      : { allowScale: false, keepAspect: false, scaleFactor: 1 };
    const allowScale = Object.prototype.hasOwnProperty.call(options, "allowScale")
      ? !!options.allowScale
      : !!prev.allowScale;
    const keepAspect = allowScale
      ? (Object.prototype.hasOwnProperty.call(options, "keepAspect") ? !!options.keepAspect : (prev.keepAspect !== false))
      : false;
    const scaleFactorRaw = Number(prev.scaleFactor);
    const scaleFactor = Number.isFinite(scaleFactorRaw) && scaleFactorRaw > 1e-9 ? scaleFactorRaw : 1;
    if (
      !!prev.allowScale === allowScale
      && !!prev.keepAspect === keepAspect
      && Number(prev.scaleFactor || 1) === scaleFactor
    ) {
      draw();
      return;
    }
    pushHistory(state);
    g.scaleOptions = { allowScale, keepAspect, scaleFactor };
    draw();
  }

  function setActiveGroupScaleFactor(targetScaleFactor) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const scOpt = (g.scaleOptions && typeof g.scaleOptions === "object")
      ? g.scaleOptions
      : { allowScale: false, keepAspect: false, scaleFactor: 1 };
    if (!scOpt.allowScale) return;
    const current = Math.max(1e-9, Number(scOpt.scaleFactor) || 1);
    const target = Math.max(1e-9, Number(targetScaleFactor) || 1);
    const ratio = target / current;
    if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-9) {
      draw();
      return;
    }
    const shapeIds = (typeof collectGroupTreeShapeIds === "function")
      ? collectGroupTreeShapeIds(state, gid)
      : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
    const idSet = new Set((shapeIds || []).map(Number).filter(Number.isFinite));
    const ox = Number(g.originX) || 0;
    const oy = Number(g.originY) || 0;
    pushHistory(state);
    for (const t of (state.shapes || [])) {
      if (!idSet.has(Number(t.id))) continue;
      if (t.type === "line" || t.type === "rect") {
        const p1 = scalePointAround(t.x1, t.y1, ox, oy, ratio);
        const p2 = scalePointAround(t.x2, t.y2, ox, oy, ratio);
        t.x1 = p1.x; t.y1 = p1.y; t.x2 = p2.x; t.y2 = p2.y;
      } else if (t.type === "polyline") {
        if (Array.isArray(t.points)) {
          t.points = t.points.map((pt) => scalePointAround(Number(pt?.x), Number(pt?.y), ox, oy, ratio));
        }
      } else if (t.type === "circle") {
        const c = scalePointAround(t.cx, t.cy, ox, oy, ratio);
        t.cx = c.x; t.cy = c.y; t.r = Math.abs(Number(t.r) || 0) * ratio;
      } else if (t.type === "arc") {
        const c = scalePointAround(t.cx, t.cy, ox, oy, ratio);
        t.cx = c.x; t.cy = c.y; t.r = Math.abs(Number(t.r) || 0) * ratio;
      } else if (t.type === "position") {
        const p = scalePointAround(t.x, t.y, ox, oy, ratio);
        t.x = p.x; t.y = p.y; t.size = Math.max(0.1, Number(t.size) * ratio);
      } else if (t.type === "dim") {
        const p1 = scalePointAround(t.x1, t.y1, ox, oy, ratio);
        const p2 = scalePointAround(t.x2, t.y2, ox, oy, ratio);
        const pp = scalePointAround(t.px, t.py, ox, oy, ratio);
        t.x1 = p1.x; t.y1 = p1.y; t.x2 = p2.x; t.y2 = p2.y; t.px = pp.x; t.py = pp.y;
        if (Number.isFinite(Number(t.tx)) && Number.isFinite(Number(t.ty))) {
          const tp = scalePointAround(Number(t.tx), Number(t.ty), ox, oy, ratio);
          t.tx = tp.x; t.ty = tp.y;
        }
        if (Number.isFinite(Number(t.tdx)) && Number.isFinite(Number(t.tdy))) {
          t.tdx = Number(t.tdx) * ratio;
          t.tdy = Number(t.tdy) * ratio;
        }
        t.groupScaleComp = Math.max(1e-9, (Number(t.groupScaleComp) || 1) * ratio);
      } else if (t.type === "dimchain") {
        if (Array.isArray(t.points)) t.points = t.points.map((pt) => scalePointAround(Number(pt?.x), Number(pt?.y), ox, oy, ratio));
        if (Number.isFinite(Number(t.px)) && Number.isFinite(Number(t.py))) {
          const pp = scalePointAround(Number(t.px), Number(t.py), ox, oy, ratio);
          t.px = pp.x; t.py = pp.y;
        }
        if (Number.isFinite(Number(t.tx)) && Number.isFinite(Number(t.ty))) {
          const tp = scalePointAround(Number(t.tx), Number(t.ty), ox, oy, ratio);
          t.tx = tp.x; t.ty = tp.y;
        }
        t.groupScaleComp = Math.max(1e-9, (Number(t.groupScaleComp) || 1) * ratio);
      } else if (t.type === "circleDim") {
        if (Number.isFinite(Number(t.tx)) && Number.isFinite(Number(t.ty))) {
          const tp = scalePointAround(Number(t.tx), Number(t.ty), ox, oy, ratio);
          t.tx = tp.x; t.ty = tp.y;
        }
        if (Number.isFinite(Number(t.tdx)) && Number.isFinite(Number(t.tdy))) {
          t.tdx = Number(t.tdx) * ratio;
          t.tdy = Number(t.tdy) * ratio;
        }
        t.groupScaleComp = Math.max(1e-9, (Number(t.groupScaleComp) || 1) * ratio);
      } else if (t.type === "dimangle") {
        if (Number.isFinite(Number(t.cx)) && Number.isFinite(Number(t.cy))) {
          const cp = scalePointAround(Number(t.cx), Number(t.cy), ox, oy, ratio);
          t.cx = cp.x; t.cy = cp.y;
        }
        if (Number.isFinite(Number(t.r))) t.r = Math.abs(Number(t.r)) * ratio;
        if (Number.isFinite(Number(t.tx)) && Number.isFinite(Number(t.ty))) {
          const tp = scalePointAround(Number(t.tx), Number(t.ty), ox, oy, ratio);
          t.tx = tp.x; t.ty = tp.y;
        }
      } else if (t.type === "text") {
        const p = scalePointAround(t.x1, t.y1, ox, oy, ratio);
        t.x1 = p.x; t.y1 = p.y;
      } else if (t.type === "image") {
        const p = scalePointAround(Number(t.x), Number(t.y), ox, oy, ratio);
        t.x = p.x; t.y = p.y;
        t.width = Math.max(1e-6, Number(t.width) * ratio);
        t.height = Math.max(1e-6, Number(t.height) * ratio);
      } else if (t.type === "bspline") {
        if (Array.isArray(t.controlPoints)) {
          t.controlPoints = t.controlPoints.map((cp) => scalePointAround(Number(cp?.x), Number(cp?.y), ox, oy, ratio));
        }
      }
    }
    const byParent = new Map();
    for (const gg of (state.groups || [])) {
      const pid = (gg.parentId == null) ? null : Number(gg.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(Number(gg.id));
    }
    const queue = [...(byParent.get(gid) || [])];
    while (queue.length) {
      const cgId = Number(queue.shift());
      const cg = getGroup(state, cgId);
      if (cg) {
        const p = scalePointAround(Number(cg.originX) || 0, Number(cg.originY) || 0, ox, oy, ratio);
        cg.originX = p.x;
        cg.originY = p.y;
      }
      for (const ccId of (byParent.get(cgId) || [])) queue.push(Number(ccId));
    }
    g.scaleOptions = { allowScale: true, keepAspect: scOpt.keepAspect !== false, scaleFactor: target };
    draw();
  }

  return {
    setActiveGroupParent,
    moveShapeToGroup,
    moveShapesToGroup,
    setActiveGroupScaleOptions,
    setActiveGroupScaleFactor
  };
}
